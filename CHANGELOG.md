# Changelog

## 2026-08-30 — security, correctness & analysis pass

Picked up after the Codex build. All changes on `main`.

### Security
- **XSS fixed.** The market-results dropdown and the workspace history/favorites/
  trackers lists interpolated proxy-supplied names and hand-typed ticker symbols
  straight into `innerHTML`; a ticker like `<img src=x onerror=…>` was persisted
  to `localStorage` / Firestore and re-executed on every load. All dynamic values
  are now HTML-escaped, and the stored symbol/timeframe are sanitised.
- **Content-Security-Policy** added as a Firebase Hosting header and a `<meta>` tag
  (so the GitHub Pages mirror is covered). `script-src` is `'self'` + the Firebase
  SDK host; `connect-src` is limited to the market proxy, Binance, and
  Google/Firebase. The inline bootstrap `<script>` moved to `env.js`.
  Also added `Referrer-Policy` and `Permissions-Policy`.
- **Market proxy hardened.** CORS is now an allowlist (no more `*`); 60 req/60 s
  per-IP rate limit (Cloudflare `[[ratelimit]]` binding + fallback on the Worker,
  best-effort window on the Function); `interval` / `provider` / `market`
  whitelisted and `q` / `symbol` length-capped; upstream fetches have a 12 s
  timeout on both.

### Correctness
- **Sign-in no longer loses data.** `loadCloudWorkspace()` merged nothing — it
  overwrote local unsynced analyses/favorites/trackers with the cloud copy. It
  now unions both sides by stable id (newest wins), capped at 50, and only writes
  back when the merge changed the cloud document.

### Analysis
- **Live mode reads the candles, not a picture of them.** Instead of rendering
  OHLC to a canvas and running the screenshot pixel-slope detector on it,
  `analyzeCandles()` computes EMA slope, swing highs/lows, HH-HL / LH-LL
  structure, and break-of-structure directly from the series.
- **Confidence is honest.** The old score was hard-clamped to ~48–89. Both engines
  now produce a plain 0–100 agreement score with a Low / Moderate / High band and
  no artificial floor/ceiling; screenshot mode is labelled a coarse visual
  heuristic. Results surface EMA slope, structure, BOS, and real swing-high /
  swing-low levels.
- The unofficial-NEPSE `meta.notice` (and provider-fallback notices) are now shown
  in the results panel; previously generated server-side but never displayed.

### Structure
- `functions/index.js` and `workers/market-proxy/src/index.js` were ~95% duplicate
  and had drifted. All provider/routing logic now lives in one canonical file,
  `workers/market-proxy/src/market-core.js`; `scripts/sync-shared.mjs` copies it to
  `functions/market-core.js` (wired as a `firebase.json` functions `predeploy`
  hook). Edit only the canonical file.

### Known / not done
- `bhurtelace@gmail.com` is the commit-author email on the entire git history and
  is recoverable from commit `0178e92`. It is not a credential. Removing it needs
  a full history rewrite (`git filter-repo`) and force-push; deliberately left
  alone (owner's own address).
