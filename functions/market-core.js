// GENERATED FILE — do not edit.
// Copy of workers/market-proxy/src/market-core.js via scripts/sync-shared.mjs.

// ============================================================================
// ChartLens market-data core.
//
// CANONICAL SOURCE. Edit this file only.
// `node scripts/sync-shared.mjs` copies it to functions/market-core.js so the
// Firebase Function and the Cloudflare Worker share one implementation.
//
// Everything here is platform-neutral: it uses the global `fetch` and takes an
// `env` object ({ NEPSE_API_BASE, SHAREBAZAAR_API_BASE }) as an argument. The
// two entrypoints only add transport concerns (CORS, rate limiting, param
// parsing) and then call handleSearch() / handleCandles().
// ============================================================================

export const ALLOWED_ORIGINS = new Set([
  "https://chartlens101.web.app",
  "https://chartlens101.firebaseapp.com",
  "https://bhurtelmahesh.github.io",
  "http://localhost:4173",
  "http://127.0.0.1:4173"
]);

export const VALID_INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1D", "1W"];
export const VALID_PROVIDERS = ["auto", "binance", "yahoo", "nepse-unofficial"];
export const VALID_MARKETS = [
  "auto", "crypto", "us", "nyse", "nasdaq", "global",
  "tse", "tokyo", "japan", "lse", "london", "india", "nse", "bse",
  "canada", "tsx", "australia", "asx", "hongkong", "hkex", "nepse"
];
const MAX_QUERY_LEN = 48;

const marketSuffixes = {
  tse: ".T", tokyo: ".T", japan: ".T",
  us: "", nyse: "", nasdaq: "",
  lse: ".L", london: ".L",
  india: ".NS", nse: ".NS", bse: ".BO",
  canada: ".TO", tsx: ".TO",
  australia: ".AX", asx: ".AX",
  hongkong: ".HK", hkex: ".HK"
};

const knownMarketAliases = {
  "KIOXIA": { symbol: "285A.T", name: "Kioxia Holdings Corporation", market: "tse", exchange: "Tokyo Stock Exchange" },
  "KIOXIA.T": { symbol: "285A.T", name: "Kioxia Holdings Corporation", market: "tse", exchange: "Tokyo Stock Exchange" }
};

const nepseDirectory = [
  { symbol: "NABIL", name: "Nabil Bank Limited", market: "nepse", exchange: "Nepal Stock Exchange" },
  { symbol: "NRIC", name: "Nepal Reinsurance Company Limited", market: "nepse", exchange: "Nepal Stock Exchange" },
  { symbol: "NICA", name: "NIC Asia Bank Limited", market: "nepse", exchange: "Nepal Stock Exchange" },
  { symbol: "GBIME", name: "Global IME Bank Limited", market: "nepse", exchange: "Nepal Stock Exchange" },
  { symbol: "API", name: "Api Power Company Limited", market: "nepse", exchange: "Nepal Stock Exchange" },
  { symbol: "UPPER", name: "Upper Tamakoshi Hydropower Limited", market: "nepse", exchange: "Nepal Stock Exchange" },
  { symbol: "HDL", name: "Himalayan Distillery Limited", market: "nepse", exchange: "Nepal Stock Exchange" },
  { symbol: "NIFRA", name: "Nepal Infrastructure Bank Limited", market: "nepse", exchange: "Nepal Stock Exchange" }
];

// --- CORS -------------------------------------------------------------------

export function corsHeaders(origin) {
  const headers = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "public, max-age=30",
    "Vary": "Origin"
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

// --- Rate limiting (best-effort, per instance/isolate) ---------------------

export function createRateLimiter({ limit = 60, windowMs = 60000 } = {}) {
  const hits = new Map();
  return function take(key) {
    const now = Date.now();
    const windowStart = now - windowMs;
    const timestamps = (hits.get(key) || []).filter(t => t > windowStart);
    timestamps.push(now);
    hits.set(key, timestamps);
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (!v.some(t => t > windowStart)) hits.delete(k);
    }
    return { allowed: timestamps.length <= limit, remaining: Math.max(0, limit - timestamps.length) };
  };
}

// --- small utils ----------------------------------------------------------

export function cleanSymbol(value = "") {
  return String(value).trim().toUpperCase().replace(/[^A-Z0-9.^-]/g, "");
}

function aliasFor(value) {
  return knownMarketAliases[String(value || "").trim().toUpperCase()] || null;
}

function applyMarketSuffix(symbol, market) {
  const aliased = aliasFor(symbol);
  if (aliased) return aliased.symbol;
  if (!symbol || symbol.includes(".") || symbol.startsWith("^")) return symbol;
  return `${symbol}${marketSuffixes[market] || ""}`;
}

function isCrypto(symbol, market) {
  return market === "crypto" || /USDT$|USDC$|FDUSD$|BUSD$|BTC$|ETH$/.test(symbol);
}

function normalizeCrypto(symbol) {
  if (/USDT$|USDC$|FDUSD$|BUSD$|BTC$|ETH$/.test(symbol)) return symbol;
  return `${symbol}USDT`;
}

function yahooCryptoSymbol(symbol) {
  const clean = normalizeCrypto(symbol);
  const quote = ["USDT", "USDC", "FDUSD", "BUSD", "BTC", "ETH"].find(suffix => clean.endsWith(suffix));
  if (!quote) return clean;
  const base = clean.slice(0, -quote.length);
  const yahooQuote = quote === "USDT" || quote === "USDC" || quote === "FDUSD" || quote === "BUSD" ? "USD" : quote;
  return `${base}-${yahooQuote}`;
}

function intervalForProvider(provider, requested) {
  if (provider === "binance") return ({ "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1D": "1d", "1W": "1w" })[requested] || "1h";
  return ({ "1m": "1m", "5m": "5m", "15m": "15m", "1h": "60m", "4h": "1d", "1D": "1d", "1W": "1wk" })[requested] || "1d";
}

function rangeForInterval(requested) {
  return ({ "1m": "1d", "5m": "5d", "15m": "5d", "1h": "1mo", "4h": "6mo", "1D": "1y", "1W": "5y" })[requested] || "1y";
}

// Bounded fetch → JSON. 12s timeout so a hung upstream can't pin the worker.
async function fetchJson(url, headers = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 ChartLens/1.0",
        "Accept": "application/json,text/plain,*/*",
        ...headers
      }
    });
    if (!response.ok) throw new Error(`${response.status} from provider`);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.content)) return payload.content;
  if (payload && typeof payload === "object") {
    const firstArray = Object.values(payload).find(Array.isArray);
    if (firstArray) return firstArray;
  }
  return [];
}

function pickNumber(item, keys) {
  for (const key of keys) {
    const value = item?.[key];
    const number = Number(String(value ?? "").replace(/,/g, ""));
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
}

function pickTime(item, index) {
  const value = item.businessDate || item.date || item.time || item.x || item.timestamp || item.lastUpdatedDateTime;
  if (typeof value === "number") return value > 9999999999 ? value : value * 1000;
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : Date.now() - (index * 86400000);
}

// --- providers ----------------------------------------------------------

function nepseApiBase(env) { return env?.NEPSE_API_BASE || "https://nepseapi.surajrimal.dev"; }
function shareBazaarBase(env) { return env?.SHAREBAZAAR_API_BASE || "https://nepsetty.kokomo.workers.dev"; }

async function searchYahoo(query, market) {
  const aliased = aliasFor(query);
  if (aliased) return [{ ...aliased, provider: "yahoo", type: "equity" }];
  const response = await fetchJson(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`);
  const quotes = Array.isArray(response?.quotes) ? response.quotes : [];
  return quotes.map(item => ({
    symbol: item.symbol,
    name: item.shortname || item.longname || item.symbol,
    market: market === "auto" ? "global" : market,
    exchange: item.exchDisp || item.exchange,
    provider: "yahoo",
    type: item.quoteType
  })).filter(item => item.symbol);
}

async function searchBinance(query) {
  const symbol = normalizeCrypto(cleanSymbol(query || "BTC"));
  try {
    await fetchJson(`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`);
    return [{ symbol, name: `${symbol} spot market`, market: "crypto", exchange: "Binance", provider: "binance", type: "crypto" }];
  } catch {
    return [];
  }
}

function searchNepseLocal(query) {
  const q = String(query).trim().toUpperCase();
  return nepseDirectory
    .filter(item => item.symbol.includes(q) || item.name.toUpperCase().includes(q))
    .map(item => ({ ...item, provider: "nepse-unofficial", type: "equity" }));
}

async function searchNepse(query, env) {
  const q = String(query).trim().toUpperCase();
  const localMatches = searchNepseLocal(query);
  try {
    const quote = await getShareBazaarQuote(q, env);
    if (quote?.symbol) {
      return [{
        symbol: quote.symbol,
        name: quote.company_name || quote.name || quote.symbol,
        market: "nepse",
        exchange: "Nepal Stock Exchange",
        provider: "nepse-unofficial",
        type: "equity",
        lastPrice: quote.ltp || quote.current_price || null,
        lastUpdated: quote.last_updated || null
      }, ...localMatches.filter(item => item.symbol !== quote.symbol)].slice(0, 10);
    }
  } catch {
    // ShareBazaar is current-quote only and best-effort.
  }
  try {
    const list = await fetchJson(`${nepseApiBase(env)}/CompanyList`);
    const items = normalizeArray(list);
    const matches = items.filter(item => {
      const symbol = String(item.symbol || item.companyCode || item.securitySymbol || "").toUpperCase();
      const name = String(item.companyName || item.securityName || item.name || "").toUpperCase();
      return symbol.includes(q) || name.includes(q);
    }).slice(0, 10);
    if (matches.length) {
      return matches.map(item => ({
        symbol: String(item.symbol || item.companyCode || item.securitySymbol || "").toUpperCase(),
        name: item.companyName || item.securityName || item.name || item.symbol,
        market: "nepse",
        exchange: "Nepal Stock Exchange",
        provider: "nepse-unofficial",
        type: "equity"
      }));
    }
  } catch {
    // Hosted unofficial service is best-effort. Fall back to bundled common symbols.
  }
  return localMatches;
}

async function getBinanceCandles(symbol, interval) {
  const rows = await fetchJson(`https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(normalizeCrypto(symbol))}&interval=${encodeURIComponent(interval)}&limit=160`);
  return rows.map(row => ({
    time: row[0], open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5])
  }));
}

function parseYahooChart(payload) {
  const result = payload?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0] || {};
  return timestamps.map((time, index) => ({
    time: time * 1000,
    open: Number(quote.open?.[index]),
    high: Number(quote.high?.[index]),
    low: Number(quote.low?.[index]),
    close: Number(quote.close?.[index]),
    volume: Number(quote.volume?.[index] || 0)
  })).filter(c => [c.open, c.high, c.low, c.close].every(Number.isFinite));
}

async function getYahooCandles(symbol, requestedInterval) {
  const interval = intervalForProvider("yahoo", requestedInterval);
  const range = rangeForInterval(requestedInterval);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`;
  const payload = await fetchJson(url);
  const candles = parseYahooChart(payload);
  if (candles.length < 20) throw new Error(`Not enough candles for ${symbol}`);
  return candles;
}

function parseNepseCandles(payload) {
  const rows = normalizeArray(payload);
  return rows.map((item, index) => {
    const close = pickNumber(item, ["closePrice", "closingPrice", "ltp", "lastTradedPrice", "y"]);
    const high = pickNumber(item, ["highPrice", "high", "maxPrice"]) || close;
    const low = pickNumber(item, ["lowPrice", "low", "minPrice"]) || close;
    const open = pickNumber(item, ["openPrice", "open", "previousClose"]) || close;
    return {
      time: pickTime(item, index),
      open, high, low, close,
      volume: pickNumber(item, ["totalTradedQuantity", "volume", "quantity", "totalTrades"]) || 0
    };
  }).filter(c => [c.open, c.high, c.low, c.close].every(Number.isFinite)).sort((a, b) => a.time - b.time);
}

async function getShareBazaarQuote(symbol, env) {
  const clean = cleanSymbol(symbol);
  if (!clean) return null;
  return fetchJson(`${shareBazaarBase(env)}/api/stock?symbol=${encodeURIComponent(clean)}`);
}

async function getNepseCandles(symbol, env) {
  const clean = cleanSymbol(symbol);
  const routes = [
    `${nepseApiBase(env)}/DailyScripPriceGraph?symbol=${encodeURIComponent(clean)}`,
    `${nepseApiBase(env)}/PriceVolumeHistory?symbol=${encodeURIComponent(clean)}`
  ];
  let lastError;
  for (const url of routes) {
    try {
      const payload = await fetchJson(url);
      const candles = parseNepseCandles(payload);
      if (candles.length >= 10) return candles.slice(-180);
    } catch (error) {
      lastError = error;
    }
  }
  try {
    const quote = await getShareBazaarQuote(clean, env);
    if (quote?.ltp) {
      throw new Error(`NEPSE historical candles are unavailable for ${clean}, but latest ShareBazaar quote is ${quote.ltp}. The chart API may be offline or rate-limited.`);
    }
  } catch (quoteError) {
    if (String(quoteError.message || "").includes("latest ShareBazaar quote")) throw quoteError;
  }
  throw new Error(`NEPSE data unavailable for ${clean}. The unofficial NEPSE API may be offline or rate-limited. ${lastError?.message || ""}`.trim());
}

// --- request orchestration (shared by both entrypoints) -----------------

export async function handleSearch({ q = "", market = "auto", env = {} }) {
  q = String(q).trim().slice(0, MAX_QUERY_LEN);
  market = String(market).toLowerCase();
  if (market && !VALID_MARKETS.includes(market)) return { status: 400, body: { error: `Unsupported market "${market}"` } };
  if (!q) return { status: 200, body: { results: await searchBinance("BTC") } };
  const results = [
    ...(market === "crypto" || market === "auto" ? await searchBinance(q) : []),
    ...(market === "nepse" || market === "auto" ? await searchNepse(q, env) : []),
    ...(market !== "crypto" && market !== "nepse" ? await searchYahoo(q, market) : [])
  ];
  return { status: 200, body: { results: results.slice(0, 10) } };
}

export async function handleCandles({ symbol = "BTCUSDT", market = "auto", interval = "1h", provider = "auto", env = {} }) {
  const requestedInterval = String(interval);
  market = String(market).toLowerCase();
  provider = String(provider).toLowerCase();
  symbol = cleanSymbol(symbol).slice(0, MAX_QUERY_LEN);
  if (!VALID_INTERVALS.includes(requestedInterval)) return { status: 400, body: { error: `Unsupported interval "${requestedInterval}"` } };
  if (!VALID_PROVIDERS.includes(provider)) return { status: 400, body: { error: `Unsupported provider "${provider}"` } };
  if (market && !VALID_MARKETS.includes(market)) return { status: 400, body: { error: `Unsupported market "${market}"` } };
  if (!symbol) return { status: 400, body: { error: "Missing symbol" } };

  const aliased = aliasFor(symbol);
  if (aliased) symbol = aliased.symbol;

  if (market === "nepse" || provider === "nepse-unofficial") {
    return {
      status: 200,
      body: {
        meta: { symbol, market: "nepse", provider: "nepse-unofficial", exchange: "Nepal Stock Exchange", interval: "1D", notice: "Unofficial NEPSE data. Educational/non-commercial use only." },
        candles: await getNepseCandles(symbol, env)
      }
    };
  }

  if (provider === "binance" || isCrypto(symbol, market)) {
    symbol = normalizeCrypto(symbol);
    const binInterval = intervalForProvider("binance", requestedInterval);
    try {
      return { status: 200, body: { meta: { symbol, market: "crypto", provider: "binance", exchange: "Binance", interval: binInterval }, candles: await getBinanceCandles(symbol, binInterval) } };
    } catch (binanceError) {
      const yahooSymbol = yahooCryptoSymbol(symbol);
      return {
        status: 200,
        body: {
          meta: { symbol, market: "crypto", provider: "yahoo-crypto-fallback", exchange: "Yahoo Finance", interval: intervalForProvider("yahoo", requestedInterval), name: yahooSymbol, notice: `Binance unavailable from proxy (${binanceError.message}); using Yahoo Finance fallback.` },
          candles: await getYahooCandles(yahooSymbol, requestedInterval)
        }
      };
    }
  }

  symbol = applyMarketSuffix(symbol, market);
  const known = Object.values(knownMarketAliases).find(item => item.symbol === symbol);
  try {
    return {
      status: 200,
      body: {
        meta: { symbol, market: known?.market || market, provider: "yahoo", exchange: known?.exchange || "Yahoo Finance", interval: intervalForProvider("yahoo", requestedInterval), name: known?.name },
        candles: await getYahooCandles(symbol, requestedInterval)
      }
    };
  } catch (yahooError) {
    if (!["1m", "5m", "15m", "1h", "4h"].includes(requestedInterval)) throw yahooError;
    return {
      status: 200,
      body: {
        meta: { symbol, market: known?.market || market, provider: "yahoo", exchange: known?.exchange || "Yahoo Finance", interval: "1d", name: known?.name, notice: `Requested intraday data was unavailable (${yahooError.message}); using daily candles.` },
        candles: await getYahooCandles(symbol, "1D")
      }
    };
  }
}
