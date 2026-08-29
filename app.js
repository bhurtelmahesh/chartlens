const $ = (selector) => document.querySelector(selector);

const els = {
  uploadZone: $('#uploadZone'), fileInput: $('#fileInput'), fileLoaded: $('#fileLoaded'),
  thumb: $('#thumb'), fileName: $('#fileName'), fileDetails: $('#fileDetails'), removeFile: $('#removeFile'),
  symbol: $('#symbolInput'), timeframe: $('#timeframeInput'), price: $('#priceInput'),
  analyze: $('#analyzeButton'), demo: $('#demoButton'), live: $('#liveButton'), liveStatus: $('#liveStatus'),
  hero: $('#hero'), processing: $('#processing'),
  results: $('#results'), scanPercent: $('#scanPercent'), steps: [...document.querySelectorAll('#processSteps li')],
  resultImage: $('#resultImage'), resultSymbol: $('#resultSymbol'), resultTimeframe: $('#resultTimeframe'),
  sourceLabel: $('#sourceLabel'), sourceDetail: $('#sourceDetail'), dimensions: $('#imageDimensions'), edgeDensity: $('#edgeDensity'), analysisTime: $('#analysisTime'),
  confidenceLabel: $('#confidenceLabel'), confidenceBar: $('#confidenceBar'), biasTitle: $('#biasTitle'),
  biasSummary: $('#biasSummary'), biasOrb: $('#biasOrb'), biasArrow: $('#biasArrow'), observations: $('#observations'),
  bullScenario: $('#bullScenario'), bearScenario: $('#bearScenario'), newAnalysis: $('#newAnalysis'),
  canvas: $('#analysisCanvas'), historyButton: $('#historyButton'), historyCount: $('#historyCount'),
  historyDrawer: $('#historyDrawer'), closeHistory: $('#closeHistory'), drawerBackdrop: $('#drawerBackdrop'), historyList: $('#historyList')
};

let currentImage = null;
let currentFile = null;
let currentSource = 'screenshot';

function formatBytes(bytes) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

function setFile(file, dataUrl, source = 'screenshot') {
  if (file && file.size > 12 * 1024 * 1024) {
    alert('Please choose an image smaller than 12 MB.');
    return Promise.reject(new Error('File exceeds 12 MB'));
  }
  currentFile = file || { name: 'demo-btc-chart.png', size: 420000, type: 'image/png' };
  currentSource = source;
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      currentImage = image;
      els.thumb.src = dataUrl;
      els.fileName.textContent = currentFile.name;
      els.fileDetails.textContent = `${(currentFile.type.split('/')[1] || 'image').toUpperCase()} · ${formatBytes(currentFile.size)} · ${image.naturalWidth}×${image.naturalHeight}`;
      els.uploadZone.hidden = true;
      els.fileLoaded.hidden = false;
      els.analyze.disabled = false;
      resolve(image);
    };
    image.onerror = () => {
      alert('That image could not be read. Try PNG, JPG, or WEBP.');
      reject(new Error('Image could not be read'));
    };
    image.src = dataUrl;
  });
}

function loadFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = (event) => setFile(file, event.target.result);
  reader.readAsDataURL(file);
}

els.uploadZone.addEventListener('click', () => els.fileInput.click());
els.uploadZone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') els.fileInput.click(); });
els.fileInput.addEventListener('change', () => loadFile(els.fileInput.files[0]));
['dragenter','dragover'].forEach(type => els.uploadZone.addEventListener(type, (e) => { e.preventDefault(); els.uploadZone.classList.add('dragging'); }));
['dragleave','drop'].forEach(type => els.uploadZone.addEventListener(type, (e) => { e.preventDefault(); els.uploadZone.classList.remove('dragging'); }));
els.uploadZone.addEventListener('drop', (e) => loadFile(e.dataTransfer.files[0]));
els.removeFile.addEventListener('click', resetFile);

function resetFile() {
  currentImage = null; currentFile = null; currentSource = 'screenshot'; els.fileInput.value = ''; els.uploadZone.hidden = false; els.fileLoaded.hidden = true; els.analyze.disabled = true; els.liveStatus.textContent = '';
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
  ctx.fillStyle = '#9ba6ad'; ctx.font = '18px monospace'; ctx.fillText('BTCUSD · 1H', 70, 42);
  ctx.fillStyle = '#647079'; ctx.fillText('Demo market chart', 915, 42);
  els.symbol.value = 'BTCUSDT'; els.timeframe.value = '1h'; els.price.value = '64250';
  canvas.toBlob(blob => setFile(new File([blob], 'demo-btc-chart.png', {type:'image/png'}), URL.createObjectURL(blob)), 'image/png');
}
els.demo.addEventListener('click', buildDemoChart);

function normalizeTicker(value) {
  const ticker = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!ticker) return 'BTCUSDT';
  if (/USDT$|USDC$|BUSD$|FDUSD$|BTC$|ETH$/.test(ticker)) return ticker;
  return `${ticker}USDT`;
}

function binanceInterval(value) {
  return ({ '15m': '15m', '1h': '1h', '4h': '4h', '1D': '1d', '1W': '1w' })[value] || '1h';
}

async function fetchCandles(symbol, interval) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=140`;
  const response = await fetch(url);
  if (!response.ok) {
    const message = response.status === 451 ? 'Binance market data is unavailable from this network/region.' : `${symbol} was not found on Binance. Try BTCUSDT, ETHUSDT, SOLUSDT, or DOGEUSDT.`;
    throw new Error(message);
  }
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length < 20) throw new Error(`Not enough candle data for ${symbol}.`);
  return rows.map(row => ({
    time: row[0],
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5])
  }));
}

function nicePrice(value) {
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function renderCandleChart(candles, symbol, interval) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200; canvas.height = 680;
  const ctx = canvas.getContext('2d');
  const pad = { left: 76, right: 96, top: 70, bottom: 84 };
  const chartW = canvas.width - pad.left - pad.right;
  const chartH = canvas.height - pad.top - pad.bottom;
  const highs = candles.map(c => c.high), lows = candles.map(c => c.low);
  const max = Math.max(...highs), min = Math.min(...lows);
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

  ctx.fillStyle = '#eef2ea'; ctx.font = '700 26px monospace'; ctx.fillText(`${symbol} · ${interval.toUpperCase()}`, pad.left, 42);
  ctx.fillStyle = '#9ba6ad'; ctx.font = '16px monospace'; ctx.fillText(`Last ${nicePrice(last.close)} · ${new Date(last.time).toLocaleString()}`, pad.left, 66);
  ctx.fillStyle = last.close >= candles[0].open ? '#b9f227' : '#ff6b5f';
  ctx.font = '700 20px monospace'; ctx.fillText(nicePrice(last.close), canvas.width - pad.right + 28, yFor(last.close) + 7);
  ctx.strokeStyle = ctx.fillStyle; ctx.setLineDash([8, 8]); ctx.beginPath(); ctx.moveTo(pad.left, yFor(last.close)); ctx.lineTo(canvas.width - pad.right + 18, yFor(last.close)); ctx.stroke(); ctx.setLineDash([]);

  return canvas.toDataURL('image/png');
}

async function analyzeLiveMarket() {
  const symbol = normalizeTicker(els.symbol.value);
  const interval = binanceInterval(els.timeframe.value);
  els.symbol.value = symbol;
  els.live.disabled = true;
  els.analyze.disabled = true;
  els.liveStatus.textContent = `Fetching ${symbol} ${interval.toUpperCase()} candles…`;
  try {
    const candles = await fetchCandles(symbol, interval);
    const dataUrl = renderCandleChart(candles, symbol, interval);
    const last = candles[candles.length - 1].close;
    els.price.value = last.toFixed(last >= 1 ? 2 : 6);
    const approxSize = Math.round(dataUrl.length * .75);
    await setFile({ name: `${symbol}-${interval}-live-chart.png`, size: approxSize, type: 'image/png' }, dataUrl, 'live');
    els.liveStatus.textContent = `Loaded live ${symbol} ${interval.toUpperCase()} chart. Analyzing…`;
    await runAnalysis();
  } catch (error) {
    els.liveStatus.textContent = error.message || 'Live chart fetch failed. Try another Binance crypto pair.';
    els.analyze.disabled = !currentImage;
  } finally {
    els.live.disabled = false;
  }
}
els.live.addEventListener('click', analyzeLiveMarket);

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

async function runAnalysis() {
  if (!currentImage) return;
  els.hero.hidden = true; els.results.hidden = true; els.processing.hidden = false; window.scrollTo({top:0,behavior:'smooth'});
  const start = performance.now();
  for (let i = 0; i <= 100; i += 4) {
    els.scanPercent.textContent = `${i}%`;
    const active = Math.min(3, Math.floor(i / 26));
    els.steps.forEach((step, index) => { step.classList.toggle('active', index === active); step.classList.toggle('done', index < active); });
    await wait(26);
  }
  const metrics = analyzePixels(currentImage);
  await wait(180);
  renderResults(metrics, performance.now() - start);
}
els.analyze.addEventListener('click', runAnalysis);

function renderResults(m, elapsed) {
  const symbol = (els.symbol.value.trim() || 'UNLABELED CHART').toUpperCase();
  const timeframe = els.timeframe.value.toUpperCase();
  const price = Number(els.price.value);
  els.resultImage.src = currentImage.src; els.resultSymbol.textContent = symbol; els.resultTimeframe.textContent = timeframe;
  els.sourceLabel.textContent = currentSource === 'live' ? 'Live rendered chart' : 'Source image';
  els.sourceDetail.textContent = currentSource === 'live' ? 'Binance public data' : 'Locally processed';
  els.dimensions.textContent = `${m.width} × ${m.height} px`; els.edgeDensity.textContent = `${m.density.toFixed(1)}% structure density`; els.analysisTime.textContent = `${(elapsed/1000).toFixed(1)}s local scan`;
  els.confidenceLabel.textContent = `Confidence ${m.confidence}%`; requestAnimationFrame(() => els.confidenceBar.style.width = `${m.confidence}%`);

  const copy = {
    bullish: {
      title: 'Constructive / rising', summary: 'The dominant visual slope rises from left to right.',
      observations: ['Price structure appears to be making progress toward the upper-right of the image.', 'Momentum is visually constructive, though a screenshot cannot confirm volume or live follow-through.', 'The lower reaction band is the key area to watch if the structure pulls back.'],
      bull: 'Holding above the lower reaction band would preserve the rising structure and leave room for another test higher.',
      bear: 'A decisive loss of the lower band would weaken the visual uptrend and suggest a deeper rotation.'
    },
    bearish: {
      title: 'Defensive / falling', summary: 'The dominant visual slope falls from left to right.',
      observations: ['Price structure appears weighted toward the lower-right of the image.', 'Sellers visually control the current sequence, but the wider timeframe is unknown.', 'The upper reaction band is the key invalidation area for the bearish structure.'],
      bull: 'Reclaiming and holding above the upper reaction band would challenge the falling structure.',
      bear: 'Continued rejection below the upper band would keep pressure aimed toward the lower reaction area.'
    },
    range: {
      title: 'Balanced / sideways', summary: 'No strong directional slope dominates the screenshot.',
      observations: ['The image shows a relatively balanced left-to-right structure.', 'Directional conviction looks limited; reactions at the range edges matter more than its midpoint.', 'A clean break followed by acceptance outside either reaction band would provide better context.'],
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
  saveHistory({ symbol, timeframe, direction: copy.title, confidence: m.confidence, date: new Date().toISOString() });
}

els.newAnalysis.addEventListener('click', () => { els.results.hidden = true; els.hero.hidden = false; resetFile(); window.scrollTo({top:0,behavior:'smooth'}); });

function getHistory() { try { return JSON.parse(localStorage.getItem('chartlens-history') || '[]'); } catch { return []; } }
function saveHistory(item) { const history = [item, ...getHistory()].slice(0, 8); localStorage.setItem('chartlens-history', JSON.stringify(history)); renderHistory(); }
function renderHistory() {
  const history = getHistory(); els.historyCount.textContent = history.length;
  els.historyList.innerHTML = history.length ? history.map(item => `<div class="history-item"><div><strong>${item.symbol} / ${item.timeframe}</strong><br><span>${item.direction}</span></div><span>${item.confidence}%</span></div>`).join('') : '<div class="empty-history">No analyses yet</div>';
}
function toggleHistory(open) { els.historyDrawer.classList.toggle('open', open); els.historyDrawer.setAttribute('aria-hidden', String(!open)); els.drawerBackdrop.hidden = !open; }
els.historyButton.addEventListener('click', () => toggleHistory(true)); els.closeHistory.addEventListener('click', () => toggleHistory(false)); els.drawerBackdrop.addEventListener('click', () => toggleHistory(false));
renderHistory();
