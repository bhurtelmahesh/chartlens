const $ = (selector) => document.querySelector(selector);

const els = {
  uploadZone: $('#uploadZone'), fileInput: $('#fileInput'), fileLoaded: $('#fileLoaded'),
  thumb: $('#thumb'), fileName: $('#fileName'), fileDetails: $('#fileDetails'), removeFile: $('#removeFile'),
  symbol: $('#symbolInput'), market: $('#marketInput'), timeframe: $('#timeframeInput'), price: $('#priceInput'),
  marketResults: $('#marketResults'), analyze: $('#analyzeButton'), demo: $('#demoButton'), live: $('#liveButton'), liveStatus: $('#liveStatus'),
  liveProgress: $('#liveProgress'), liveProgressLabel: $('#liveProgressLabel'), liveProgressTrack: $('#liveProgressTrack'), liveProgressBar: $('#liveProgressBar'),
  hero: $('#hero'), processing: $('#processing'), results: $('#results'), scanPercent: $('#scanPercent'), steps: [...document.querySelectorAll('#processSteps li')],
  resultImage: $('#resultImage'), resultSymbol: $('#resultSymbol'), resultTimeframe: $('#resultTimeframe'),
  sourceLabel: $('#sourceLabel'), sourceDetail: $('#sourceDetail'), dimensions: $('#imageDimensions'), edgeDensity: $('#edgeDensity'), analysisTime: $('#analysisTime'),
  confidenceLabel: $('#confidenceLabel'), confidenceBar: $('#confidenceBar'), biasTitle: $('#biasTitle'),
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
      <button type="button" data-symbol="${aliased.symbol}" data-market="${aliased.market}" data-name="${aliased.name}" data-provider="${aliased.provider}">
        <strong>${aliased.symbol}</strong><span>${aliased.name} · ${aliased.exchange}</span>
      </button>
    `;
    return { ...aliased, interval: yahooInterval(intervalValue) };
  }

  try {
    const data = await fetchJson(endpoint('/api/search', { q: cleaned, market: preferredMarket }));
    if (data?.results?.length) {
      els.marketResults.hidden = false;
      els.marketResults.innerHTML = data.results.slice(0, 4).map(item => `
        <button type="button" data-symbol="${item.symbol}" data-market="${item.market || 'global'}" data-name="${item.name || item.symbol}" data-provider="${item.provider || ''}">
          <strong>${item.symbol}</strong><span>${item.name || item.exchange || 'Market result'}</span>
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
        throw new Error('Live market data needs Firebase Functions deployed for this browser. Screenshot/demo analysis still works locally.');
      }
    }
    throw new Error(`${meta.symbol} needs a market-data proxy. To stay free, use the Cloudflare Worker proxy; Firebase Auth and Firestore still work without Blaze.`);
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

  const label = `${meta.symbol} · ${(meta.interval || meta.intervalLabel || '').toUpperCase()}`;
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
  state.image = null; state.file = null; state.source = 'screenshot'; state.marketMeta = null;
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

async function analyzeLiveMarket() {
  const query = els.symbol.value.trim() || 'BTCUSDT';
  const intervalValue = els.timeframe.value;
  els.live.disabled = true;
  els.analyze.disabled = true;
  els.liveStatus.textContent = `Resolving ${query}…`;
  setLiveProgress(8, `Resolving ${query}`);
  try {
    const resolved = await resolveMarket(query, els.market.value, intervalValue);
    els.symbol.value = resolved.symbol;
    els.market.value = ['auto','crypto','us','tse','nepse','global'].includes(resolved.market) ? resolved.market : 'global';
    els.liveStatus.textContent = `Fetching ${resolved.symbol} candles…`;
    setLiveProgress(34, `Fetching ${resolved.symbol} candles`);
    const { candles, meta } = await fetchCandlesForMarket(resolved, intervalValue);
    if (!candles || candles.length < 20) throw new Error(`Not enough candle data for ${resolved.symbol}.`);
    if (meta.market === 'nepse') els.timeframe.value = '1D';
    if (meta.notice && meta.interval === '1d') els.timeframe.value = '1D';
    const chartMeta = { ...meta, interval: meta.interval || binanceInterval(intervalValue), name: meta.name || resolved.name };
    setLiveProgress(62, 'Rendering chart locally');
    const dataUrl = renderCandleChart(candles, chartMeta);
    const last = candles[candles.length - 1].close;
    els.price.value = last >= 1 ? last.toFixed(2) : last.toFixed(6);
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
  const confidence = Math.round(48 + strength * 34 + Math.min(10, density / 8));
  return { slope, density, direction, confidence: Math.min(89, confidence), width: image.naturalWidth, height: image.naturalHeight };
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
  const metrics = analyzePixels(state.image);
  await wait(180);
  renderResults(metrics, performance.now() - start);
}

function renderResults(m, elapsed) {
  const symbol = (els.symbol.value.trim() || 'UNLABELED CHART').toUpperCase();
  const timeframe = els.timeframe.value.toUpperCase();
  const price = Number(els.price.value);
  els.resultImage.src = state.image.src; els.resultSymbol.textContent = symbol; els.resultTimeframe.textContent = timeframe;
  els.sourceLabel.textContent = state.source === 'live' ? 'Live rendered chart' : 'Source image';
  els.sourceDetail.textContent = state.source === 'live' ? `${state.marketMeta?.provider || 'market'} data` : 'Locally processed';
  els.dimensions.textContent = `${m.width} × ${m.height} px`; els.edgeDensity.textContent = `${m.density.toFixed(1)}% structure density`; els.analysisTime.textContent = `${(elapsed/1000).toFixed(1)}s local scan`;
  els.confidenceLabel.textContent = `Confidence ${m.confidence}%`; requestAnimationFrame(() => els.confidenceBar.style.width = `${m.confidence}%`);

  const copy = {
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
  }[m.direction];

  els.biasTitle.textContent = copy.title; els.biasSummary.textContent = copy.summary;
  els.observations.innerHTML = copy.observations.map(text => `<li>${text}</li>`).join('');
  els.bullScenario.textContent = price ? `${copy.bull} Reference: ${price.toLocaleString()}.` : copy.bull;
  els.bearScenario.textContent = price ? `${copy.bear} Reference: ${price.toLocaleString()}.` : copy.bear;
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
    <div class="history-item">
      <div>
        <strong>${item.symbol} / ${item.timeframe}</strong><br>
        <span>${item.status || item.direction}</span>
        <small>${item.market || 'market'} · ${new Date(item.date || item.lastCheckedAt).toLocaleString()}</small>
      </div>
      <span>${type === 'tracker' && item.active ? 'ON' : `${item.confidence}%`}</span>
    </div>
  `).join('') : `<div class="empty-history">${empty}</div>`;
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
  for (const collection of ['analyses', 'favorites', 'trackers']) {
    const ref = doc(state.firebase.db, 'users', state.user.uid, 'workspace', collection);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      state.workspace[collection] = snap.data().items || [];
    } else {
      await setDoc(ref, { items: state.workspace[collection], updatedAt: new Date().toISOString() });
    }
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
