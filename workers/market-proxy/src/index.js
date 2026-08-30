// Cloudflare Worker entrypoint for the ChartLens market-data proxy.
// Transport only: CORS, rate limiting, param parsing. All provider logic lives
// in ./market-core.js (shared with the Firebase Function).

import { corsHeaders, createRateLimiter, handleSearch, handleCandles } from "./market-core.js";

// Per-isolate fallback limiter. The wrangler.toml [[ratelimit]] binding
// (env.MARKET_RL) is the primary control when configured.
const fallbackLimiter = createRateLimiter({ limit: 60, windowMs: 60000 });

function json(status, body, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" }
  });
}

async function handleApi(request, env) {
  const origin = request.headers.get("Origin") || "";
  if (request.method === "OPTIONS") return new Response("", { status: 204, headers: corsHeaders(origin) });
  if (request.method !== "GET") return json(405, { error: "Method not allowed" }, origin);

  const clientKey = request.headers.get("CF-Connecting-IP") || origin || "anon";
  let limited = !fallbackLimiter(clientKey).allowed;
  if (!limited && env?.MARKET_RL?.limit) {
    try {
      const rl = await env.MARKET_RL.limit({ key: clientKey });
      limited = !rl.success;
    } catch {
      // binding missing or errored — fallback limiter already applied
    }
  }
  if (limited) {
    return new Response(JSON.stringify({ error: "Rate limited. Try again shortly." }), {
      status: 429,
      headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8", "Retry-After": "60" }
    });
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, "").replace(/^\/?/, "");
  try {
    if (path === "search") {
      const { status, body } = await handleSearch({
        q: url.searchParams.get("q") || "",
        market: url.searchParams.get("market") || "auto",
        env
      });
      return json(status, body, origin);
    }
    if (path === "candles") {
      const { status, body } = await handleCandles({
        symbol: url.searchParams.get("symbol") || "BTCUSDT",
        market: url.searchParams.get("market") || "auto",
        interval: url.searchParams.get("interval") || "1h",
        provider: url.searchParams.get("provider") || "auto",
        env
      });
      return json(status, body, origin);
    }
    return json(404, { error: "Unknown API route" }, origin);
  } catch (error) {
    return json(502, { error: error.message || "Market data provider failed" }, origin);
  }
}

export default {
  fetch: handleApi
};
