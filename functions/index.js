// Firebase Function entrypoint for the ChartLens market-data proxy.
// Transport only: CORS, rate limiting, param parsing. All provider logic lives
// in ./market-core.js, a generated copy of
// workers/market-proxy/src/market-core.js (see scripts/sync-shared.mjs).

import { onRequest } from "firebase-functions/v2/https";
import { corsHeaders, createRateLimiter, handleSearch, handleCandles } from "./market-core.js";

// Best-effort, per-instance. Firebase has no free shared rate-limit primitive;
// scaled-out instances each keep their own window.
const limiter = createRateLimiter({ limit: 60, windowMs: 60000 });

const env = {
  MEROLAGANI_API_BASE: process.env.MEROLAGANI_API_BASE,
  NEPSE_API_BASE: process.env.NEPSE_API_BASE,
  SHAREBAZAAR_API_BASE: process.env.SHAREBAZAAR_API_BASE
};

function sendJson(res, status, body, origin) {
  res.status(status).set(corsHeaders(origin)).json(body);
}

export const api = onRequest({ region: "us-central1", cors: false }, async (req, res) => {
  const origin = req.headers.origin || "";
  if (req.method === "OPTIONS") return res.status(204).set(corsHeaders(origin)).send("");
  if (req.method !== "GET") return sendJson(res, 405, { error: "Method not allowed" }, origin);

  const clientKey = (req.headers["x-forwarded-for"] || req.ip || origin || "anon").split(",")[0].trim();
  if (!limiter(clientKey).allowed) {
    return res.status(429)
      .set({ ...corsHeaders(origin), "Retry-After": "60" })
      .json({ error: "Rate limited. Try again shortly." });
  }

  const path = req.path.replace(/^\/api\/?/, "");
  try {
    if (path === "search") {
      const { status, body } = await handleSearch({ q: req.query.q || "", market: req.query.market || "auto", env });
      return sendJson(res, status, body, origin);
    }
    if (path === "candles") {
      const { status, body } = await handleCandles({
        symbol: req.query.symbol || "BTCUSDT",
        market: req.query.market || "auto",
        interval: req.query.interval || "1h",
        provider: req.query.provider || "auto",
        env
      });
      return sendJson(res, status, body, origin);
    }
    return sendJson(res, 404, { error: "Unknown API route" }, origin);
  } catch (error) {
    return sendJson(res, 502, { error: error.message || "Market data provider failed" }, origin);
  }
});
