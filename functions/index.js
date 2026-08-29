import { onRequest } from "firebase-functions/v2/https";

const jsonHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=30"
};

const marketSuffixes = {
  tse: ".T",
  tokyo: ".T",
  japan: ".T",
  lse: ".L",
  london: ".L",
  india: ".NS",
  nse: ".NS",
  bse: ".BO",
  canada: ".TO",
  tsx: ".TO",
  australia: ".AX",
  asx: ".AX",
  hongkong: ".HK",
  hkex: ".HK"
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

function send(res, status, payload) {
  res.status(status).set(jsonHeaders).json(payload);
}

function cleanSymbol(value = "") {
  return String(value).trim().toUpperCase().replace(/[^A-Z0-9.^-]/g, "");
}

function applyMarketSuffix(symbol, market) {
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

function intervalForProvider(provider, requested) {
  if (provider === "binance") return ({ "15m": "15m", "1h": "1h", "4h": "4h", "1D": "1d", "1W": "1w" })[requested] || "1h";
  return ({ "15m": "15m", "1h": "60m", "4h": "1d", "1D": "1d", "1W": "1wk" })[requested] || "1d";
}

function rangeForInterval(requested) {
  return ({ "15m": "5d", "1h": "1mo", "4h": "6mo", "1D": "1y", "1W": "5y" })[requested] || "1y";
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 ChartLens/1.0",
      "Accept": "application/json,text/plain,*/*",
      ...headers
    }
  });
  if (!response.ok) throw new Error(`${response.status} from provider`);
  return response.json();
}

async function searchYahoo(query, market) {
  const response = await fetchJson(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`);
  const quotes = Array.isArray(response.quotes) ? response.quotes : [];
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

function searchNepse(query) {
  const q = String(query).trim().toUpperCase();
  return nepseDirectory
    .filter(item => item.symbol.includes(q) || item.name.toUpperCase().includes(q))
    .map(item => ({ ...item, provider: "nepse-pending", type: "equity" }));
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

export const api = onRequest({ region: "us-central1", cors: true }, async (req, res) => {
  if (req.method === "OPTIONS") return res.status(204).set(jsonHeaders).send("");
  const path = req.path.replace(/^\/api\/?/, "");
  try {
    if (path === "search") {
      const q = String(req.query.q || "").trim();
      const market = String(req.query.market || "auto").toLowerCase();
      if (!q) return send(res, 200, { results: await searchBinance("BTC") });
      const results = [
        ...(market === "crypto" || market === "auto" ? await searchBinance(q) : []),
        ...(market === "nepse" || market === "auto" ? searchNepse(q) : []),
        ...(market !== "crypto" && market !== "nepse" ? await searchYahoo(q, market) : [])
      ];
      return send(res, 200, { results: results.slice(0, 10) });
    }

    if (path === "candles") {
      const requestedInterval = String(req.query.interval || "1h");
      const market = String(req.query.market || "auto").toLowerCase();
      let symbol = cleanSymbol(req.query.symbol || "BTCUSDT");
      const provider = String(req.query.provider || "auto").toLowerCase();
      if (market === "nepse") {
        return send(res, 501, { error: "NEPSE historical candles require a licensed NEPSE/NepseAlpha/SmartWealth provider key. Search and tracking are supported; live chart candles are provider-pending." });
      }
      if (provider === "binance" || isCrypto(symbol, market)) {
        symbol = normalizeCrypto(symbol);
        const interval = intervalForProvider("binance", requestedInterval);
        return send(res, 200, { meta: { symbol, market: "crypto", provider: "binance", exchange: "Binance", interval }, candles: await getBinanceCandles(symbol, interval) });
      }
      symbol = applyMarketSuffix(symbol, market);
      return send(res, 200, { meta: { symbol, market, provider: "yahoo", exchange: "Yahoo Finance", interval: intervalForProvider("yahoo", requestedInterval) }, candles: await getYahooCandles(symbol, requestedInterval) });
    }

    return send(res, 404, { error: "Unknown API route" });
  } catch (error) {
    return send(res, 502, { error: error.message || "Market data provider failed" });
  }
});
