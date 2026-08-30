const $ = (selector) => document.querySelector(selector);

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
const cleanSymbolText = (value) => String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9.^ -]/g, '');

const els = {
  uploadZone: $('#uploadZone'), fileInput: $('#fileInput'), fileLoaded: $('#fileLoaded'),
  thumb: $('#thumb'), fileName: $('#fileName'), fileDetails: $('#fileDetails'), removeFile: $('#removeFile'),
  symbol: $('#symbolInput'), market: $('#marketInput'), timeframe: $('#timeframeInput'), price: $('#priceInput'),
  marketResults: $('#marketResults'), analyze: $('#analyzeButton'), demo: $('#demoButton'), live: $('#liveButton'), liveStatus: $('#liveStatus'),
  liveProgress: $('#liveProgress'), liveProgressLabel: $('#liveProgressLabel'), liveProgressTrack: $('#liveProgressTrack'), liveProgressBar: $('#liveProgressBar'),
  hero: $('#hero'), processing: $('#processing'), results: $('#results'), scanPercent: $('#scanPercent'), steps: [...document.querySelectorAll('#processSteps li')],
  resultImage: $('#resultImage'), resultSymbol: $('#resultSymbol'), resultTimeframe: $('#resultTimeframe'),
  sourceLabel: $('#sourceLabel'), sourceDetail: $('#sourceDetail'), dimensions: $('#imageDimensions'), edgeDensity: $('#edgeDensity'), analysisTime: $('#analysisTime'), dataNotice: $('#dataNotice'),
  confidenceLabel: $('#confidenceLabel'), confidenceBar: $('#confidenceBar'), biasTitle: $('#biasTitle'), methodNote: $('#methodNote'),
  briefKind: $('#briefKind'), briefHead: $('#briefHead'), zoneResistance: $('#zoneResistanceLabel'), zoneSupport: $('#zoneSupportLabel'),
  biasSummary: $('#biasSummary'), biasOrb: $('#biasOrb'), biasArrow: $('#biasArrow'), observations: $('#observations'),
  bullScenario: $('#bullScenario'), bearScenario: $('#bearScenario'), newAnalysis: $('#newAnalysis'),
  favoriteButton: $('#favoriteButton'), trackerButton: $('#trackerButton'), saveStatus: $('#saveStatus'),
  canvas: $('#analysisCanvas'), historyButton: $('#historyButton'), historyCount: $('#historyCount'),
  historyDrawer: $('#historyDrawer'), closeHistory: $('#closeHistory'), drawerBackdrop: $('#drawerBackdrop'), historyList: $('#historyList'),
  favoritesList: $('#favoritesList'), trackersList: $('#trackersList'), authButton: $('#authButton'), authModal: $('#authModal'),
  authClose: $('#authClose'), authEmail: $('#authEmail'), authPassword: $('#authPassword'), loginButton: $('#loginButton'),
  signupButton: $('#signupButton'), googleButton: $('#googleButton'), logoutButton: $('#logoutButton'), authStatus: $('#authStatus')
};

const state = {
  image: null,
  file: null,
  source: 'screenshot',
  marketMeta: null,
  liveCandles: null,
  lastAnalysis: null,
  user: null,
  firebase: { enabled: false, app: null, auth: null, db: null, api: null },
  workspace: { analyses: [], favorites: [], trackers: [] }
};

const apiBase = window.CHARTLENS_API_BASE || '';
const firebaseConfig = window.CHARTLENS_FIREBASE_CONFIG;

const knownMarketAliases = {
  'KIOXIA': { symbol: '285A.T', name: 'Kioxia Holdings Corporation', market: 'tse', provider: 'yahoo', exchange: 'Tokyo Stock Exchange' },
  'KIOXIA.T': { symbol: '285A.T', name: 'Kioxia Holdings Corporation', market: 'tse', provider: 'yahoo', exchange: 'Tokyo Stock Exchange' }
};

function formatBytes(bytes) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function normalizeTicker(value) {
  const ticker = value.trim().toUpperCase().replace(/[^A-Z0-9.^-]/g, '');
  if (!ticker) return 'BTCUSDT';
  if (/USDT$|USDC$|BUSD$|FDUSD$|BTC$|ETH$/.test(ticker)) return ticker;
  return ticker;
}

function binanceInterval(value) {
  return ({ '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1D': '1d', '1W': '1w' })[value] || '1h';
}

function yahooInterval(value) {
  return ({ '1m': '1m', '5m': '5m', '15m': '15m', '1h': '60m', '4h': '1d', '1D': '1d', '1W': '1wk' })[value] || '1d';
}

function rangeForInterval(value) {
  return ({ '1m': '1d', '5m': '5d', '15m': '5d', '1h': '1mo', '4h': '6mo', '1D': '1y', '1W': '5y' })[value] || '6mo';
}

function withUsdtFallback(query, market) {
  const clean = normalizeTicker(query);
  if (market === 'crypto' && !/USDT$|USDC$|BTC$|ETH$/.test(clean)) return `${clean}USDT`;
  return clean || 'BTCUSDT';
}

function endpoint(path, params) {
  const query = new URLSearchParams(params);
  return `${apiBase}${path}?${query}`;
}

async function fetchJson(url) {
  if (typeof fetch === 'function') {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return response.json();
  }
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('GET', url);
    request.responseType = 'json';
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve(request.response || JSON.parse(request.responseText));
      } else {
        reject(new Error(`Request failed: ${request.status}`));
      }
    };
    request.onerror = () => reject(new Error('Network request failed'));
    request.send();
  });
}

function parseYahooCandles(result) {
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0] || {};
  const close = quote.close || [];
  return timestamps.map((time, index) => ({
    time: time * 1000,
    open: Number(quote.open?.[index]),
    high: Number(quote.high?.[index]),
    low: Number(quote.low?.[index]),
    close: Number(close[index]),
    volume: Number(quote.volume?.[index] || 0)
  })).filter(c => [c.open, c.high, c.low, c.close].every(Number.isFinite));
}

async function resolveMarket(query, market, intervalValue) {
  const cleaned = query.trim();
  const preferredMarket = market || 'auto';
  const aliased = knownMarketAliases[cleaned.toUpperCase()];
  const cleanedTicker = normalizeTicker(cleaned);
  const isExplicitCrypto = /USDT$|USDC$|FDUSD$|BUSD$|BTC$|ETH$/.test(cleanedTicker);
  const normalized = withUsdtFallback(cleaned, preferredMarket === 'crypto' ? 'crypto' : preferredMarket);
  if (preferredMarket === 'crypto' || (preferredMarket === 'auto' && isExplicitCrypto)) {
    els.marketResults.hidden = true;
    return {
      symbol: normalized,
      query: cleaned,
      name: `${normalized} spot market`,
      market: 'crypto',
      provider: 'binance',
      exchange: 'Binance',
      interval: binanceInterval(intervalValue)
    };
  }
  if (aliased && (preferredMarket === 'auto' || preferredMarket === 'tse' || preferredMarket === 'global')) {
    els.marketResults.hidden = false;
    els.marketResults.innerHTML = `
      <button type="button" data-symbol="${esc(aliased.symbol)}" data-market="${esc(aliased.market)}" data-name="${esc(aliased.name)}" data-provider="${esc(aliased.provider)}">
        <strong>${esc(aliased.symbol)}</strong><span>${esc(aliased.name)} · ${esc(aliased.exchange)}</span>
      </button>
    `;
    return { ...aliased, interval: yahooInterval(intervalValue) };
  }

  try {
    const data = await fetchJson(endpoint('/api/search', { q: cleaned, market: preferredMarket }));
    if (data?.results?.length) {
      els.marketResults.hidden = false;
      els.marketResults.innerHTML = data.results.slice(0, 4).map(item => `
        <button type="button" data-symbol="${esc(item.symbol)}" data-market="${esc(item.market || 'global')}" data-name="${esc(item.name || item.symbol)}" data-provider="${esc(item.provider || '')}">
          <strong>${esc(item.symbol)}</strong><span>${esc(item.name || item.exchange || 'Market result')}</span>
        </button>
      `).join('');
      return data.results[0];
    }
  } catch {
    els.marketResults.hidden = true;
  }

  const symbol = withUsdtFallback(cleaned, preferredMarket);
  if (preferredMarket === 'nepse') {
    return {
      symbol,
      query: cleaned,
      name: cleaned || symbol,
      market: 'nepse',
      provider: 'nepse-unofficial',
      interval: '1D'
    };
  }
  const provider = preferredMarket === 'crypto' || /USDT$|USDC$|BTC$|ETH$/.test(symbol) ? 'binance' : 'yahoo';
  return {
    symbol: provider === 'binance' ? symbol : applyMarketSuffix(symbol, preferredMarket),
    query: cleaned,
    name: cleaned || symbol,
    market: preferredMarket,
    provider,
    interval: provider === 'binance' ? binanceInterval(intervalValue) : yahooInterval(intervalValue)
  };
}

function applyMarketSuffix(symbol, market) {
  if (symbol.includes('.') || symbol.startsWith('^')) return symbol;
  if (market === 'tse') return `${symbol}.T`;
  if (market === 'nepse') return `${symbol}.NP`;
  return symbol;
}

async function fetchCandlesForMarket(meta, intervalValue) {
  try {
    const data = await fetchJson(endpoint('/api/candles', {
      symbol: meta.symbol,
      market: meta.market || 'auto',
      interval: intervalValue,
      provider: meta.provider || 'auto'
    }));
    return { candles: data.candles, meta: { ...meta, ...data.meta } };
  } catch (error) {
    if (meta.provider === 'binance' || /USDT$|USDC$|BTC$|ETH$/.test(meta.symbol)) {
      try {
        return await fetchBinanceCandles(meta, intervalValue);
      } catch {
        throw new Error('Could not reach the market-data proxy or Binance from this browser. Screenshot/demo analysis still works offline.');
      }
    }
    throw new Error(`${meta.symbol} could not be loaded from the market-data proxy (${error.message || 'request failed'}). Try again shortly or use screenshot mode.`);
  }
}

async function fetchBinanceCandles(meta, intervalValue) {
  const symbol = withUsdtFallback(meta.symbol, 'crypto');
  const interval = binanceInterval(intervalValue);
  const rows = await fetchJson(`https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=160`);
  return {
    meta: { ...meta, symbol, provider: 'binance', exchange: 'Binance', interval },
    candles: rows.map(row => ({
      time: row[0],
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5])
    }))
  };
}

function nicePrice(value) {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function renderCandleChart(candles, meta) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200; canvas.height = 680;
  const ctx = canvas.getContext('2d');
  const pad = { left: 76, right: 96, top: 70, bottom: 84 };
  const chartW = canvas.width - pad.left - pad.right;
  const chartH = canvas.height - pad.top - pad.bottom;
  const max = Math.max(...candles.map(c => c.high));
  const min = Math.min(...candles.map(c => c.low));
  const range = max - min || 1;
  const yFor = price => pad.top + (max - price) / range * chartH;
  const xStep = chartW / candles.length;
  const last = candles[candles.length - 1];

  ctx.fillStyle = '#0b1015'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#1a242a'; ctx.lineWidth = 1;
  for (let i = 0; i <= 8; i++) {
    const y = pad.top + chartH / 8 * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(canvas.width - pad.right + 18, y); ctx.stroke();
    ctx.fillStyle = '#647079'; ctx.font = '14px monospace'; ctx.fillText(nicePrice(max - range / 8 * i), canvas.width - pad.right + 28, y + 5);
  }
  for (let i = 0; i <= 10; i++) {
    const x = pad.left + chartW / 10 * i;
    ctx.beginPath(); ctx.moveTo(x, pad.top); ctx.lineTo(x, pad.top + chartH); ctx.stroke();
  }

  candles.forEach((c, index) => {
    const x = pad.left + index * xStep + xStep / 2;
    const openY = yFor(c.open), closeY = yFor(c.close), highY = yFor(c.high), lowY = yFor(c.low);
    const up = c.close >= c.open;
    ctx.strokeStyle = up ? '#b9f227' : '#ff6b5f';
    ctx.fillStyle = up ? '#b9f227' : '#ff6b5f';
    ctx.globalAlpha = .92;
    ctx.beginPath(); ctx.moveTo(x, highY); ctx.lineTo(x, lowY); ctx.stroke();
    const bodyTop = Math.min(openY, closeY), bodyH = Math.max(2, Math.abs(closeY - openY));
    ctx.fillRect(x - Math.max(2, xStep * .32), bodyTop, Math.max(4, xStep * .64), bodyH);
  });
  ctx.globalAlpha = 1;

  const volumeMax = Math.max(...candles.map(c => c.volume)) || 1;
  candles.forEach((c, index) => {
    const x = pad.left + index * xStep + xStep / 2;
    const volH = Math.max(1, c.volume / volumeMax * 44);
    ctx.fillStyle = c.close >= c.open ? 'rgba(185,242,39,.22)' : 'rgba(255,107,95,.22)';
    ctx.fillRect(x - Math.max(2, xStep * .28), canvas.height - pad.bottom + 54 - volH, Math.max(3, xStep * .56), volH);
  });

  const label = `${meta.symbol} · ${(meta.intervalLabel || meta.interval || '').toUpperCase()}`;
  ctx.fillStyle = '#eef2ea'; ctx.font = '700 26px monospace'; ctx.fillText(label, pad.left, 42);
  ctx.fillStyle = '#9ba6ad'; ctx.font = '16px monospace'; ctx.fillText(`${meta.name || meta.exchange || 'Live market'} · Last ${nicePrice(last.close)}`, pad.left, 66);
  ctx.fillStyle = last.close >= candles[0].open ? '#b9f227' : '#ff6b5f';
  ctx.font = '700 20px monospace'; ctx.fillText(nicePrice(last.close), canvas.width - pad.right + 28, yFor(last.close) + 7);
  ctx.strokeStyle = ctx.fillStyle; ctx.setLineDash([8, 8]); ctx.beginPath(); ctx.moveTo(pad.left, yFor(last.close)); ctx.lineTo(canvas.width - pad.right + 18, yFor(last.close)); ctx.stroke(); ctx.setLineDash([]);
  return canvas.toDataURL('image/png');
}

function setFile(file, dataUrl, source = 'screenshot', meta = null) {
  if (file && file.size > 12 * 1024 * 1024) {
    alert('Please choose an image smaller than 12 MB.');
    return Promise.reject(new Error('File exceeds 12 MB'));
  }
  state.file = file || { name: 'demo-btc-chart.png', size: 420000, type: 'image/png' };
  state.source = source;
  state.marketMeta = meta;
  if (source !== 'live') state.liveCandles = null;
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      state.image = image;
      els.thumb.src = dataUrl;
      els.fileName.textContent = state.file.name;
      els.fileDetails.textContent = `${(state.file.type.split('/')[1] || 'image').toUpperCase()} · ${formatBytes(state.file.size)} · ${image.naturalWidth}×${image.naturalHeight}`;
      els.uploadZone.hidden = true;
      els.fileLoaded.hidden = false;
      els.analyze.disabled = false;
      resolve(image);
    };
    image.onerror = () => {
      alert('That chart could not be read.');
      reject(new Error('Image could not be read'));
    };
    image.src = dataUrl;
  });
}

function loadFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = (event) => setFile(file, event.target.result, 'screenshot', null);
  reader.readAsDataURL(file);
}

function resetFile() {
  state.image = null; state.file = null; state.source = 'screenshot'; state.marketMeta = null; state.liveCandles = null;
  els.fileInput.value = ''; els.uploadZone.hidden = false; els.fileLoaded.hidden = true; els.analyze.disabled = true; els.liveStatus.textContent = ''; els.marketResults.hidden = true;
  clearLiveProgress();
}

function buildDemoChart() {
  const canvas = document.createElement('canvas');
  canvas.width = 1200; canvas.height = 680;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0b1015'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#1a242a'; ctx.lineWidth = 1;
  for (let x = 70; x < 1200; x += 90) { ctx.beginPath(); ctx.moveTo(x, 30); ctx.lineTo(x, 630); ctx.stroke(); }
  for (let y = 50; y < 650; y += 70) { ctx.beginPath(); ctx.moveTo(50, y); ctx.lineTo(1170, y); ctx.stroke(); }
  const points = []; let y = 490;
  for (let x = 70; x < 1160; x += 16) { y += (Math.random() - .56) * 42; y = Math.max(100, Math.min(560, y)); points.push([x,y]); }
  ctx.strokeStyle = '#b9f227'; ctx.lineWidth = 3; ctx.shadowColor = '#b9f227'; ctx.shadowBlur = 8;
  ctx.beginPath(); points.forEach(([x,py],i) => i ? ctx.lineTo(x,py) : ctx.moveTo(x,py)); ctx.stroke(); ctx.shadowBlur = 0;
  ctx.fillStyle = '#9ba6ad'; ctx.font = '18px monospace'; ctx.fillText('BTCUSDT · 1H', 70, 42);
  ctx.fillStyle = '#647079'; ctx.fillText('Demo market chart', 915, 42);
  els.symbol.value = 'BTCUSDT'; els.market.value = 'crypto'; els.timeframe.value = '1h'; els.price.value = '64250';
  canvas.toBlob(blob => setFile(new File([blob], 'demo-btc-chart.png', {type:'image/png'}), URL.createObjectURL(blob), 'screenshot', null), 'image/png');
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out. The market-data proxy may be slow — try again.`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function analyzeLiveMarket() {
  const typed = els.symbol.value.trim();
  const query = typed || 'BTCUSDT';
  const intervalValue = els.timeframe.value;
  els.live.disabled = true;
  els.analyze.disabled = true;
  // A fresh run should not leave a previous result on screen if it fails.
  els.results.hidden = true;
  els.hero.hidden = false;
  els.liveStatus.textContent = typed ? `Resolving ${query}…` : `No ticker entered — showing ${query}.`;
  setLiveProgress(8, `Resolving ${query}`);
  try {
    const resolved = await withTimeout(resolveMarket(query, els.market.value, intervalValue), 15000, 'Ticker lookup');
    els.symbol.value = resolved.symbol;
    els.market.value = ['auto','crypto','us','tse','nepse','global'].includes(resolved.market) ? resolved.market : 'global';
    els.liveStatus.textContent = `Fetching ${resolved.symbol} candles…`;
    setLiveProgress(34, `Fetching ${resolved.symbol} candles`);
    const { candles, meta } = await withTimeout(fetchCandlesForMarket(resolved, intervalValue), 20000, 'Candle fetch');
    if (!candles || candles.length < 20) throw new Error(`Not enough candle data for ${resolved.symbol}.`);
    if (meta.market === 'nepse') els.timeframe.value = '1D';
    if (meta.notice && meta.interval === '1d') els.timeframe.value = '1D';
    const chartMeta = { ...meta, interval: meta.interval || binanceInterval(intervalValue), intervalLabel: intervalValue, name: meta.name || resolved.name };
    state.liveCandles = candles;
    setLiveProgress(62, 'Rendering chart locally');
    const dataUrl = renderCandleChart(candles, chartMeta);
    const last = candles[candles.length - 1].close;
    // Don't clobber a reference price the user typed themselves.
    if (!els.price.value.trim()) els.price.value = last >= 1 ? last.toFixed(2) : last.toFixed(6);
    const approxSize = Math.round(dataUrl.length * .75);
    await setFile({ name: `${chartMeta.symbol}-${intervalValue}-live-chart.png`, size: approxSize, type: 'image/png' }, dataUrl, 'live', chartMeta);
    els.liveStatus.textContent = `Loaded ${chartMeta.symbol}. Analyzing…`;
    setLiveProgress(84, `Analyzing ${chartMeta.symbol}`);
    await runAnalysis();
    setLiveProgress(100, 'Analysis complete');
    setTimeout(clearLiveProgress, 900);
  } catch (error) {
    els.liveStatus.textContent = error.message || 'Market lookup failed. Try a ticker symbol plus market.';
    setLiveProgress(100, 'Could not complete fetch');
    setTimeout(clearLiveProgress, 2500);
    els.analyze.disabled = !state.image;
  } finally {
    els.live.disabled = false;
  }
}

function analyzePixels(image) {
  const canvas = els.canvas; const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const width = 360; const height = Math.max(180, Math.round(width * image.naturalHeight / image.naturalWidth));
  canvas.width = width; canvas.height = height; ctx.drawImage(image, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  const centroids = []; let totalEdges = 0;
  for (let x = 2; x < width - 2; x += 4) {
    let weightedY = 0, weight = 0;
    for (let y = 2; y < height - 2; y += 3) {
      const i = (y * width + x) * 4, j = (y * width + x - 2) * 4;
      const lum = data[i]*.299 + data[i+1]*.587 + data[i+2]*.114;
      const prev = data[j]*.299 + data[j+1]*.587 + data[j+2]*.114;
      const saturation = Math.max(data[i],data[i+1],data[i+2]) - Math.min(data[i],data[i+1],data[i+2]);
      const edge = Math.abs(lum - prev) + saturation * .45;
      if (edge > 30) { weightedY += y * edge; weight += edge; totalEdges++; }
    }
    if (weight) centroids.push({x, y: weightedY / weight});
  }
  const n = centroids.length || 1;
  const meanX = centroids.reduce((s,p)=>s+p.x,0)/n, meanY = centroids.reduce((s,p)=>s+p.y,0)/n;
  let numerator = 0, denominator = 0;
  centroids.forEach(p => { numerator += (p.x-meanX)*(p.y-meanY); denominator += (p.x-meanX)**2; });
  const slope = denominator ? numerator / denominator : 0;
  const density = Math.min(99, totalEdges / ((width/4)*(height/3)) * 100);
  const strength = Math.min(1, Math.abs(slope) * 3.8);
  const direction = strength < .18 ? 'range' : slope < 0 ? 'bullish' : 'bearish';
  // Screenshot mode is a coarse visual-slope heuristic. Score it honestly on a
  // full 0-100 scale (no artificial floor/ceiling) and keep it modest.
  const raw = direction === 'range'
    ? 34 + Math.min(22, density / 4) - strength * 40
    : strength * 60 + Math.min(18, density / 5);
  const confidence = Math.max(5, Math.min(95, Math.round(raw)));
  return {
    method: 'visual-slope', slope, density, direction, confidence,
    band: confidenceBand(confidence),
    width: image.naturalWidth, height: image.naturalHeight
  };
}

function confidenceBand(score) {
  return score < 40 ? 'Low' : score <= 70 ? 'Moderate' : 'High';
}

function ema(values, period) {
  const k = 2 / (period + 1);
  let prev = values[0];
  const out = [prev];
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

function rSquared(values) {
  const n = values.length;
  if (n < 3) return 0;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((s, v) => s + v, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  values.forEach((v, i) => {
    sxx += (i - meanX) ** 2;
    sxy += (i - meanX) * (v - meanY);
    syy += (v - meanY) ** 2;
  });
  if (!sxx || !syy) return 0;
  return (sxy * sxy) / (sxx * syy);
}

function swingPoints(candles, k = 3) {
  const highs = [], lows = [];
  for (let i = k; i < candles.length - k; i++) {
    let isHigh = true, isLow = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
    }
    if (isHigh) highs.push({ i, price: candles[i].high });
    if (isLow) lows.push({ i, price: candles[i].low });
  }
  return { highs, lows };
}

// Trend read computed directly from the OHLC series (live mode), rather than
// slope-detecting a picture of it: EMA slope + swing structure + break of
// structure, with an honest 0-100 confidence.
function analyzeCandles(candles) {
  // Defensive: a provider may still slip in a null/zero bar (esp. the latest,
  // still-forming one). A real OHLC bar has four positive prices.
  candles = candles.filter(c => [c.open, c.high, c.low, c.close].every(v => Number.isFinite(v) && v > 0));
  const closes = candles.map(c => c.close);
  const n = closes.length;
  const period = Math.max(5, Math.min(20, Math.floor(n / 3)));
  const emaSeries = ema(closes, period);
  const look = Math.min(period, n - 1);
  const emaNow = emaSeries[n - 1];
  const emaPast = emaSeries[n - 1 - look];
  const ema20Slope = emaPast ? (emaNow - emaPast) / emaPast / look * 100 : 0; // % per bar

  const { highs, lows } = swingPoints(candles);
  const lastTwoHighs = highs.slice(-2);
  const lastTwoLows = lows.slice(-2);
  const higherHighs = lastTwoHighs.length === 2 && lastTwoHighs[1].price > lastTwoHighs[0].price;
  const lowerHighs = lastTwoHighs.length === 2 && lastTwoHighs[1].price < lastTwoHighs[0].price;
  const higherLows = lastTwoLows.length === 2 && lastTwoLows[1].price > lastTwoLows[0].price;
  const lowerLows = lastTwoLows.length === 2 && lastTwoLows[1].price < lastTwoLows[0].price;
  const structure = higherHighs && higherLows ? 'HH-HL (up)'
    : lowerHighs && lowerLows ? 'LH-LL (down)'
    : 'mixed';

  const lastClose = closes[n - 1];
  const priorHigh = highs.length ? highs[highs.length - 1].price : Infinity;
  const priorLow = lows.length ? lows[lows.length - 1].price : -Infinity;
  const bos = lastClose > priorHigh ? 'bullish break'
    : lastClose < priorLow ? 'bearish break'
    : 'none';

  const slopeEps = 0.12; // %/bar below this is "flat" (noise band)
  const votes = [
    ema20Slope > slopeEps ? 1 : ema20Slope < -slopeEps ? -1 : 0,
    structure === 'HH-HL (up)' ? 1 : structure === 'LH-LL (down)' ? -1 : 0,
    bos === 'bullish break' ? 1 : bos === 'bearish break' ? -1 : 0
  ];
  const net = votes.reduce((s, v) => s + v, 0);
  const direction = net >= 2 ? 'bullish' : net <= -2 ? 'bearish'
    : (net === 1 && ema20Slope > 0.25) ? 'bullish'
    : (net === -1 && ema20Slope < -0.25) ? 'bearish'
    : 'range';

  const r2 = rSquared(closes.slice(-Math.min(n, 60)));
  const slopeComponent = Math.min(1, Math.abs(ema20Slope) / 0.6);
  const nonZeroVotes = votes.filter(v => v !== 0);
  const agree = nonZeroVotes.length
    ? Math.abs(nonZeroVotes.reduce((s, v) => s + v, 0)) / nonZeroVotes.length
    : 0;

  let confidence;
  if (direction === 'range') {
    // Confidence that there is no clean trend: flat EMA, mixed structure, poor linear fit.
    confidence = Math.round(100 * (0.4 * (1 - slopeComponent) + 0.3 * (structure === 'mixed' ? 1 : 0) + 0.3 * (1 - Math.min(1, r2 * 2))));
    // A real linear trend is present but the votes were weak — don't sound sure.
    if (r2 > 0.35) confidence = Math.min(confidence, 45);
  } else {
    confidence = Math.round(100 * agree * (0.4 * slopeComponent + 0.25 * (structure !== 'mixed' ? 1 : 0) + 0.15 * (bos !== 'none' ? 1 : 0) + 0.2 * r2));
  }
  confidence = Math.max(3, Math.min(97, confidence));
  // "No clean trend" is never a high-conviction call — keep range in the Low/Moderate band.
  if (direction === 'range') confidence = Math.min(confidence, 65);

  return {
    method: 'candle-structure', direction, confidence, band: confidenceBand(confidence),
    ema20Slope, structure, bos, r2,
    lastSwingHigh: lastTwoHighs.length ? lastTwoHighs[lastTwoHighs.length - 1].price : Math.max(...candles.map(c => c.high)),
    lastSwingLow: lastTwoLows.length ? lastTwoLows[lastTwoLows.length - 1].price : Math.min(...candles.map(c => c.low)),
    candleCount: n
  };
}

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function setLiveProgress(percent, label) {
  const clamped = Math.max(0, Math.min(100, percent));
  els.liveProgress.hidden = false;
  els.liveProgressLabel.textContent = label;
  els.liveProgressTrack.setAttribute('aria-valuenow', String(Math.round(clamped)));
  els.liveProgressBar.style.width = `${clamped}%`;
}

function clearLiveProgress() {
  els.liveProgress.hidden = true;
  els.liveProgressLabel.textContent = 'Preparing…';
  els.liveProgressTrack.setAttribute('aria-valuenow', '0');
  els.liveProgressBar.style.width = '0%';
}

async function runAnalysis() {
  if (!state.image) return;
  els.hero.hidden = true; els.results.hidden = true; els.processing.hidden = false; window.scrollTo({top:0,behavior:'smooth'});
  const start = performance.now();
  for (let i = 0; i <= 100; i += 4) {
    els.scanPercent.textContent = `${i}%`;
    const active = Math.min(3, Math.floor(i / 26));
    els.steps.forEach((step, index) => { step.classList.toggle('active', index === active); step.classList.toggle('done', index < active); });
    await wait(26);
  }
  const metrics = state.source === 'live' && Array.isArray(state.liveCandles) && state.liveCandles.length >= 20
    ? { ...analyzeCandles(state.liveCandles), width: state.image.naturalWidth, height: state.image.naturalHeight }
    : analyzePixels(state.image);
  await wait(180);
  renderResults(metrics, performance.now() - start);
}

function renderResults(m, elapsed) {
  const symbol = cleanSymbolText(els.symbol.value) || 'UNLABELED CHART';
  const timeframe = cleanSymbolText(els.timeframe.value) || 'CHART';
  const price = Number(els.price.value);
  els.resultImage.src = state.image.src; els.resultSymbol.textContent = symbol; els.resultTimeframe.textContent = timeframe;
  els.sourceLabel.textContent = state.source === 'live' ? 'Live rendered chart' : 'Source image';
  els.sourceDetail.textContent = state.source === 'live' ? `${state.marketMeta?.provider || 'market'} data` : 'Locally processed';
  const notice = state.source === 'live' ? (state.marketMeta?.notice || '') : '';
  els.dataNotice.textContent = notice;
  els.dataNotice.hidden = !notice;

  const candle = m.method === 'candle-structure';
  if (candle) {
    els.dimensions.textContent = `${m.candleCount} candles`;
    els.edgeDensity.textContent = `EMA slope ${m.ema20Slope >= 0 ? '+' : ''}${m.ema20Slope.toFixed(3)}%/bar`;
    els.analysisTime.textContent = `${m.structure} · BOS ${m.bos}`;
  } else {
    els.dimensions.textContent = `${m.width} × ${m.height} px`;
    els.edgeDensity.textContent = `${m.density.toFixed(1)}% structure density`;
    els.analysisTime.textContent = `${(elapsed/1000).toFixed(1)}s local scan`;
  }
  els.confidenceLabel.textContent = `Confidence ${m.confidence}% · ${m.band}`;
  requestAnimationFrame(() => els.confidenceBar.style.width = `${m.confidence}%`);
  els.methodNote.textContent = candle
    ? `From ${m.candleCount} candles — EMA slope, swing structure, break-of-structure (r²=${m.r2.toFixed(2)}).`
    : 'Visual slope of screenshot pixels — a coarse heuristic, not a structural read.';
  els.briefKind.textContent = candle ? 'Candle structure' : 'Visual heuristic';
  els.briefHead.textContent = candle ? 'What the candles suggest' : 'What the image suggests';
  els.zoneResistance.textContent = candle ? `Swing high ≈ ${nicePrice(m.lastSwingHigh)}` : 'Reaction zone';
  els.zoneSupport.textContent = candle ? `Swing low ≈ ${nicePrice(m.lastSwingLow)}` : 'Support zone';

  const screenshotCopy = {
    bullish: {
      title: 'Constructive / rising', summary: 'The dominant visual slope rises from left to right.',
      observations: ['Price structure appears to be making progress toward the upper-right of the chart.', 'Momentum is visually constructive, though the model cannot confirm fundamentals or order flow.', 'The lower reaction band is the key area to watch if the structure pulls back.'],
      bull: 'Holding above the lower reaction band would preserve the rising structure and leave room for another test higher.',
      bear: 'A decisive loss of the lower band would weaken the visual uptrend and suggest a deeper rotation.'
    },
    bearish: {
      title: 'Defensive / falling', summary: 'The dominant visual slope falls from left to right.',
      observations: ['Price structure appears weighted toward the lower-right of the chart.', 'Sellers visually control the current sequence, but cross-timeframe confirmation is still needed.', 'The upper reaction band is the key invalidation area for the bearish structure.'],
      bull: 'Reclaiming and holding above the upper reaction band would challenge the falling structure.',
      bear: 'Continued rejection below the upper band would keep pressure aimed toward the lower reaction area.'
    },
    range: {
      title: 'Balanced / sideways', summary: 'No strong directional slope dominates the chart.',
      observations: ['The chart shows a relatively balanced left-to-right structure.', 'Directional conviction looks limited; reactions at the range edges matter more than its midpoint.', 'A clean break followed by acceptance outside either reaction band would provide better context.'],
      bull: 'Acceptance above the upper reaction band could turn balance into a constructive expansion.',
      bear: 'Acceptance below the lower reaction band could turn balance into a defensive expansion.'
    }
  };
  const candleCopy = {
    bullish: {
      title: 'Constructive / rising', summary: 'EMA slope is positive and price is holding a sequence of higher swing highs and higher lows.',
      observations: ['Swing structure is trending up: higher highs and higher lows.', 'The short-period EMA is sloping higher, so the near-term mean is rising.', 'The last swing low near {sup} is the level that keeps the uptrend sequence intact.'],
      bull: 'Holding above the last swing low near {sup} keeps higher-low structure intact; a close back above {res} argues for continuation.',
      bear: 'A decisive close below {sup} breaks the higher-low sequence and shifts the read to neutral or lower.'
    },
    bearish: {
      title: 'Defensive / falling', summary: 'EMA slope is negative and price is printing lower swing highs and lower lows.',
      observations: ['Swing structure is trending down: lower highs and lower lows.', 'The short-period EMA is sloping lower.', 'The last swing high near {res} is the level a recovery would need to reclaim.'],
      bull: 'Reclaiming {res} on a closing basis would break the lower-high sequence and challenge the decline.',
      bear: 'Rejection below {res} keeps pressure toward the last swing low near {sup} and beyond.'
    },
    range: {
      title: 'Balanced / sideways', summary: 'EMA slope is roughly flat and swing structure is mixed — no clean trend.',
      observations: ['Swing highs and lows are not consistently rising or falling.', 'The short-period EMA is close to flat.', 'The edges near {sup} and {res} matter more than the middle of the range.'],
      bull: 'Acceptance above {res} would turn the balance into a constructive expansion.',
      bear: 'Acceptance below {sup} would turn the balance into a defensive expansion.'
    }
  };
  const fill = (s) => s.replace(/\{sup\}/g, nicePrice(m.lastSwingLow)).replace(/\{res\}/g, nicePrice(m.lastSwingHigh));
  const copy = (candle ? candleCopy : screenshotCopy)[m.direction];

  els.biasTitle.textContent = copy.title;
  els.biasSummary.textContent = candle ? fill(copy.summary) : copy.summary;
  els.observations.innerHTML = copy.observations.map(text => `<li>${esc(candle ? fill(text) : text)}</li>`).join('');
  const bull = candle ? fill(copy.bull) : copy.bull;
  const bear = candle ? fill(copy.bear) : copy.bear;
  els.bullScenario.textContent = price ? `${bull} Reference: ${price.toLocaleString()}.` : bull;
  els.bearScenario.textContent = price ? `${bear} Reference: ${price.toLocaleString()}.` : bear;
  const color = m.direction === 'bearish' ? '#ff6b5f' : m.direction === 'range' ? '#64d9d2' : '#b9f227';
  els.biasOrb.style.borderColor = color; els.biasOrb.style.background = `${color}18`; els.biasOrb.querySelector('svg').style.stroke = color;
  els.biasArrow.setAttribute('d', m.direction === 'bearish' ? 'M5 8l5 5 3-3 6 7' : m.direction === 'range' ? 'M4 12h16M7 9l-3 3 3 3m10-6 3 3-3 3' : 'M5 16 10 11l3 3 6-7');
  els.confidenceBar.style.background = color;
  els.processing.hidden = true; els.results.hidden = false;

  state.lastAnalysis = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    symbol,
    name: state.marketMeta?.name || symbol,
    market: state.marketMeta?.market || els.market.value,
    provider: state.marketMeta?.provider || state.source,
    timeframe,
    source: state.source,
    direction: copy.title,
    confidence: m.confidence,
    status: `${copy.title} · Confidence ${m.confidence}%`,
    referencePrice: Number.isFinite(price) ? price : null,
    notice: notice || null,
    date: new Date().toISOString()
  };
  saveAnalysis(state.lastAnalysis);
  updateTrackedSymbol(state.lastAnalysis);
}

function localRead(key, fallback = []) {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; }
}

function localWrite(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

async function persistCollection(collection, items) {
  state.workspace[collection] = items;
  localWrite(`chartlens-${collection}`, items);
  if (!state.firebase.enabled || !state.user) return;
  const { doc, setDoc } = state.firebase.api;
  await setDoc(doc(state.firebase.db, 'users', state.user.uid, 'workspace', collection), { items, updatedAt: new Date().toISOString() });
}

const WORKSPACE_KEYS = { analyses: 'id', favorites: 'favoriteId', trackers: 'trackerId' };

function itemKey(item, keyField) {
  return item?.[keyField] || `${item?.symbol || '?'}-${item?.timeframe || '?'}`;
}

function itemTime(item) {
  return Date.parse(item?.date || item?.lastCheckedAt || item?.updatedAt || '') || 0;
}

// Union local and cloud records by their stable id, keeping whichever copy is
// newer when both sides have the same key. Newest first, capped at 50 to match
// persistCollection() and the Firestore rules.
function mergeById(local = [], cloud = [], keyField = 'id') {
  const merged = new Map();
  for (const item of [...cloud, ...local]) {
    if (!item || typeof item !== 'object') continue;
    const key = itemKey(item, keyField);
    const existing = merged.get(key);
    if (!existing || itemTime(item) >= itemTime(existing)) merged.set(key, item);
  }
  return [...merged.values()].sort((a, b) => itemTime(b) - itemTime(a)).slice(0, 50);
}

async function saveAnalysis(item) {
  const analyses = [item, ...state.workspace.analyses.filter(existing => existing.id !== item.id)].slice(0, 50);
  await persistCollection('analyses', analyses);
  renderWorkspace();
}

async function saveFavorite() {
  if (!state.lastAnalysis) return;
  const favorite = { ...state.lastAnalysis, favoriteId: `${state.lastAnalysis.symbol}-${state.lastAnalysis.timeframe}` };
  const favorites = [favorite, ...state.workspace.favorites.filter(item => item.favoriteId !== favorite.favoriteId)].slice(0, 50);
  await persistCollection('favorites', favorites);
  flashSaveStatus('Favorite saved');
}

async function startTracker() {
  if (!state.lastAnalysis) return;
  const trackerId = `${state.lastAnalysis.symbol}-${state.lastAnalysis.timeframe}`;
  const tracker = { ...state.lastAnalysis, trackerId, active: true, lastCheckedAt: new Date().toISOString() };
  const trackers = [tracker, ...state.workspace.trackers.filter(item => item.trackerId !== trackerId)].slice(0, 50);
  await persistCollection('trackers', trackers);
  flashSaveStatus('Tracker started');
}

async function updateTrackedSymbol(analysis) {
  const trackers = state.workspace.trackers.map(item => {
    if (item.symbol === analysis.symbol && item.timeframe === analysis.timeframe) {
      return { ...item, ...analysis, trackerId: item.trackerId, active: item.active, lastCheckedAt: new Date().toISOString() };
    }
    return item;
  });
  if (JSON.stringify(trackers) !== JSON.stringify(state.workspace.trackers)) await persistCollection('trackers', trackers);
}

function flashSaveStatus(message) {
  els.saveStatus.textContent = message;
  renderWorkspace();
  setTimeout(() => { if (els.saveStatus.textContent === message) els.saveStatus.textContent = ''; }, 2400);
}

function renderList(container, items, empty, type = 'analysis') {
  container.innerHTML = items.length ? items.map(item => `
    <div class="history-item" role="button" tabindex="0"
         data-symbol="${esc(item.symbol)}" data-market="${esc(item.market || 'auto')}"
         data-timeframe="${esc(item.timeframe)}" data-source="${esc(item.source || 'live')}">
      <div>
        <strong>${esc(item.symbol)} / ${esc(item.timeframe)}</strong><br>
        <span>${esc(item.status || item.direction)}</span>
        <small>${esc(item.market || 'market')} · ${esc(new Date(item.date || item.lastCheckedAt).toLocaleString())}</small>
      </div>
      <span>${type === 'tracker' && item.active ? 'ON' : `${esc(item.confidence)}%`}</span>
    </div>
  `).join('') : `<div class="empty-history">${esc(empty)}</div>`;
}

function reopenFromItem(el) {
  if (!el) return;
  const { symbol, market, timeframe, source } = el.dataset;
  if (source === 'screenshot') {
    flashSaveStatus('Screenshot analyses can’t be reopened — upload the image again.');
    return;
  }
  toggleHistory(false);
  els.symbol.value = symbol || '';
  const markets = ['auto','crypto','us','tse','nepse','global'];
  els.market.value = markets.includes(market) ? market : 'auto';
  const intervals = ['1m','5m','15m','1h','4h','1D','1W'];
  els.timeframe.value = intervals.includes(timeframe) ? timeframe : '1h';
  els.price.value = '';
  analyzeLiveMarket();
}

function renderWorkspace() {
  els.historyCount.textContent = state.workspace.analyses.length;
  const hasWorkspaceData = state.workspace.analyses.length || state.workspace.favorites.length || state.workspace.trackers.length;
  els.historyButton.hidden = !state.user && !hasWorkspaceData;
  renderList(els.historyList, state.workspace.analyses, 'No analyses yet');
  renderList(els.favoritesList, state.workspace.favorites, 'No favorites yet');
  renderList(els.trackersList, state.workspace.trackers, 'No trackers yet', 'tracker');
}

async function initializeFirebase() {
  if (!firebaseConfig || !firebaseConfig.apiKey) {
    els.authStatus.textContent = 'Firebase is not configured yet. You are using local-only storage.';
    return;
  }
  try {
    const appModule = await import('https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js');
    const authModule = await import('https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js');
    const firestoreModule = await import('https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js');
    const app = appModule.initializeApp(firebaseConfig);
    const auth = authModule.getAuth(app);
    const db = firestoreModule.getFirestore(app);
    state.firebase = { enabled: true, app, auth, db, api: { ...authModule, ...firestoreModule } };
    authModule.onAuthStateChanged(auth, async user => {
      state.user = user;
      els.authButton.textContent = user ? (user.displayName || user.email || 'Account') : 'Sign in / save';
      els.logoutButton.textContent = user ? 'Sign out' : 'Continue without an account';
      if (user) await loadCloudWorkspace();
      renderWorkspace();
    });
  } catch (error) {
    els.authStatus.textContent = `Firebase failed to initialize: ${error.message}`;
  }
}

async function signInWithGoogle() {
  if (!state.firebase.enabled) {
    els.authStatus.textContent = 'Add Firebase config first. For now, your workspace is saved locally.';
    return;
  }
  try {
    els.authStatus.textContent = 'Opening Google sign-in…';
    const provider = new state.firebase.api.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await state.firebase.api.signInWithPopup(state.firebase.auth, provider);
    els.authModal.hidden = true;
  } catch (error) {
    els.authStatus.textContent = error.message;
  }
}

async function loadCloudWorkspace() {
  if (!state.firebase.enabled || !state.user) return;
  const { doc, getDoc, setDoc } = state.firebase.api;
  let mergedCount = 0;
  for (const collection of ['analyses', 'favorites', 'trackers']) {
    const ref = doc(state.firebase.db, 'users', state.user.uid, 'workspace', collection);
    const snap = await getDoc(ref);
    const localItems = Array.isArray(state.workspace[collection]) ? state.workspace[collection] : [];
    const cloudItems = snap.exists() ? (snap.data().items || []) : [];
    const merged = mergeById(localItems, cloudItems, WORKSPACE_KEYS[collection]);
    state.workspace[collection] = merged;
    localWrite(`chartlens-${collection}`, merged);
    // Only write back when the merge actually changed the cloud copy.
    if (JSON.stringify(merged) !== JSON.stringify(cloudItems)) {
      mergedCount += Math.max(0, merged.length - cloudItems.length);
      await setDoc(ref, { items: merged, updatedAt: new Date().toISOString() });
    }
  }
  if (mergedCount > 0) {
    els.authStatus.textContent = `Synced: merged ${mergedCount} local item${mergedCount === 1 ? '' : 's'} with your cloud workspace.`;
  }
}

async function handleAuth(mode) {
  if (!state.firebase.enabled) {
    els.authStatus.textContent = 'Add Firebase config first. For now, your workspace is saved locally.';
    return;
  }
  const email = els.authEmail.value.trim();
  const password = els.authPassword.value;
  if (!email || password.length < 6) {
    els.authStatus.textContent = 'Enter an email and a password with at least 6 characters.';
    return;
  }
  try {
    els.authStatus.textContent = mode === 'signup' ? 'Creating account…' : 'Signing in…';
    if (mode === 'signup') await state.firebase.api.createUserWithEmailAndPassword(state.firebase.auth, email, password);
    else await state.firebase.api.signInWithEmailAndPassword(state.firebase.auth, email, password);
    els.authModal.hidden = true;
  } catch (error) {
    els.authStatus.textContent = error.message;
  }
}

async function signOutOrClose() {
  if (state.firebase.enabled && state.user) await state.firebase.api.signOut(state.firebase.auth);
  els.authModal.hidden = true;
}

function toggleHistory(open) {
  els.historyDrawer.classList.toggle('open', open);
  els.historyDrawer.setAttribute('aria-hidden', String(!open));
  els.drawerBackdrop.hidden = !open;
}

els.uploadZone.addEventListener('click', () => els.fileInput.click());
els.uploadZone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') els.fileInput.click(); });
els.fileInput.addEventListener('change', () => loadFile(els.fileInput.files[0]));
['dragenter','dragover'].forEach(type => els.uploadZone.addEventListener(type, (e) => { e.preventDefault(); els.uploadZone.classList.add('dragging'); }));
['dragleave','drop'].forEach(type => els.uploadZone.addEventListener(type, (e) => { e.preventDefault(); els.uploadZone.classList.remove('dragging'); }));
els.uploadZone.addEventListener('drop', (e) => loadFile(e.dataTransfer.files[0]));
els.marketResults.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  els.symbol.value = button.dataset.symbol;
  els.market.value = button.dataset.market || 'global';
  els.marketResults.hidden = true;
  els.liveStatus.textContent = `Selected ${button.dataset.name || button.dataset.symbol}.`;
});
els.removeFile.addEventListener('click', resetFile);
els.demo.addEventListener('click', buildDemoChart);
els.live.addEventListener('click', analyzeLiveMarket);
els.analyze.addEventListener('click', runAnalysis);
els.newAnalysis.addEventListener('click', () => { els.results.hidden = true; els.hero.hidden = false; resetFile(); window.scrollTo({top:0,behavior:'smooth'}); });
els.favoriteButton.addEventListener('click', saveFavorite);
els.trackerButton.addEventListener('click', startTracker);
els.historyButton.addEventListener('click', () => toggleHistory(true));
els.closeHistory.addEventListener('click', () => toggleHistory(false));
els.drawerBackdrop.addEventListener('click', () => toggleHistory(false));
[els.historyList, els.favoritesList, els.trackersList].forEach(list => {
  list.addEventListener('click', (e) => reopenFromItem(e.target.closest('.history-item')));
  list.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reopenFromItem(e.target.closest('.history-item')); }
  });
});
els.authButton.addEventListener('click', () => { els.authModal.hidden = false; });
els.authClose.addEventListener('click', () => { els.authModal.hidden = true; });
els.loginButton.addEventListener('click', () => handleAuth('login'));
els.signupButton.addEventListener('click', () => handleAuth('signup'));
els.googleButton.addEventListener('click', signInWithGoogle);
els.logoutButton.addEventListener('click', signOutOrClose);

state.workspace.analyses = localRead('chartlens-analyses', localRead('chartlens-history', []));
state.workspace.favorites = localRead('chartlens-favorites', []);
state.workspace.trackers = localRead('chartlens-trackers', []);
renderWorkspace();
initializeFirebase();
