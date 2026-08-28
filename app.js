const $ = (selector) => document.querySelector(selector);

const els = {
  uploadZone: $('#uploadZone'), fileInput: $('#fileInput'), fileLoaded: $('#fileLoaded'),
  thumb: $('#thumb'), fileName: $('#fileName'), fileDetails: $('#fileDetails'), removeFile: $('#removeFile'),
  symbol: $('#symbolInput'), timeframe: $('#timeframeInput'), price: $('#priceInput'),
  analyze: $('#analyzeButton'), demo: $('#demoButton'), hero: $('#hero'), processing: $('#processing'),
  results: $('#results'), scanPercent: $('#scanPercent'), steps: [...document.querySelectorAll('#processSteps li')],
  resultImage: $('#resultImage'), resultSymbol: $('#resultSymbol'), resultTimeframe: $('#resultTimeframe'),
  dimensions: $('#imageDimensions'), edgeDensity: $('#edgeDensity'), analysisTime: $('#analysisTime'),
  confidenceLabel: $('#confidenceLabel'), confidenceBar: $('#confidenceBar'), biasTitle: $('#biasTitle'),
  biasSummary: $('#biasSummary'), biasOrb: $('#biasOrb'), biasArrow: $('#biasArrow'), observations: $('#observations'),
  bullScenario: $('#bullScenario'), bearScenario: $('#bearScenario'), newAnalysis: $('#newAnalysis'),
  canvas: $('#analysisCanvas'), historyButton: $('#historyButton'), historyCount: $('#historyCount'),
  historyDrawer: $('#historyDrawer'), closeHistory: $('#closeHistory'), drawerBackdrop: $('#drawerBackdrop'), historyList: $('#historyList')
};

let currentImage = null;
let currentFile = null;

function formatBytes(bytes) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

function setFile(file, dataUrl) {
  if (file && file.size > 12 * 1024 * 1024) return alert('Please choose an image smaller than 12 MB.');
  currentFile = file || { name: 'demo-btc-chart.png', size: 420000, type: 'image/png' };
  const image = new Image();
  image.onload = () => {
    currentImage = image;
    els.thumb.src = dataUrl;
    els.fileName.textContent = currentFile.name;
    els.fileDetails.textContent = `${(currentFile.type.split('/')[1] || 'image').toUpperCase()} · ${formatBytes(currentFile.size)} · ${image.naturalWidth}×${image.naturalHeight}`;
    els.uploadZone.hidden = true;
    els.fileLoaded.hidden = false;
    els.analyze.disabled = false;
  };
  image.onerror = () => alert('That image could not be read. Try PNG, JPG, or WEBP.');
  image.src = dataUrl;
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
  currentImage = null; currentFile = null; els.fileInput.value = ''; els.uploadZone.hidden = false; els.fileLoaded.hidden = true; els.analyze.disabled = true;
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
  els.symbol.value = 'BTCUSD'; els.timeframe.value = '1h'; els.price.value = '64250';
  canvas.toBlob(blob => setFile(new File([blob], 'demo-btc-chart.png', {type:'image/png'}), URL.createObjectURL(blob)), 'image/png');
}
els.demo.addEventListener('click', buildDemoChart);

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

els.analyze.addEventListener('click', async () => {
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
});

function renderResults(m, elapsed) {
  const symbol = (els.symbol.value.trim() || 'UNLABELED CHART').toUpperCase();
  const timeframe = els.timeframe.value.toUpperCase();
  const price = Number(els.price.value);
  els.resultImage.src = currentImage.src; els.resultSymbol.textContent = symbol; els.resultTimeframe.textContent = timeframe;
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
