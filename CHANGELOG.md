# Changelog

## 2026-08-30 — audit pass: dead NEPSE host removed

Found by auditing the deployed app and timing it against production.

- **The dead NEPSE host is gone.** `nepseapi.surajrimal.dev` no longer
  resolves, and it does not fail fast — it hangs until `fetchJson`'s 12 s
  timeout. It sat on two paths: `getNepseCandles` tried two routes there
  after merolagani (~24 s added to every NEPSE failure), and `searchNepse`
  called `/CompanyList` on it, so **autocomplete** paid a 12 s timeout on
  NEPSE and `auto` market queries too. Measured against production before
  the fix: a NEPSE miss took **26.2 s** to return 502.
- merolagani is now the only NEPSE history source, since it is the only
  working one. The ShareBazaar quote endpoint
  (`nepsetty.kokomo.workers.dev`) is alive and stays — it supplies company
  names for search and the latest price for the "no history" message.
- Removing the dead routes also retired `parseNepseCandles` and its
  `normalizeArray` / `pickNumber` / `pickTime` helpers: 460 → 382 lines.
- **`scripts/sync-shared.mjs --check`** exits 1 when
  `functions/market-core.js` has drifted from the Worker copy. Editing the
  generated file used to be clobbered silently, and deploying only the
  Worker left the Function on stale code with nothing to catch it.
- `workers/market-proxy` gains `deploy` / `tail` npm scripts, so the deploy
  path is documented rather than an ad-hoc `wrangler` invocation.

Note: no Cloud Functions are deployed in `chartlens101` — the `functions/`
tree is carried in the repo but has never been live. The Worker at
`chartlens-market-proxy.chartlens101.workers.dev` is the only serving path.

## 2026-08-30 — new-user walkthrough fixes

Found by using the deployed app cold.

- **Yahoo phantom bar.** The still-forming last daily bar came back with
  null OHLC, which `Number()` turned into `0` and the finite-check let
  through — producing "Last 0" charts and bogus high-confidence
  "falling" verdicts on every US/global daily analysis. OHLC parsers now
  require every value `> 0`; `analyzeCandles` also drops non-positive
  bars defensively.
- **NEPSE now works.** The old `surajrimal` API is dead (DNS gone).
  Primary source is now merolagani's public TradingView chart feed
  (daily bars, no auth); the dead API is a fallback. Failure copy is
  calmer and says NEPSE is experimental; the market dropdown is labelled
  so.
- **Crypto fallback is quiet.** Binance 403s the proxy from datacenter
  IPs as a rule, so Yahoo crypto data is served as provider `yahoo` with
  no alarming "Binance unavailable" notice.
- **Failed live run** no longer leaves the previous result on screen.
- **Reference price** the user typed is no longer overwritten.
- **Client-side timeouts** (15 s resolve / 20 s fetch) replace a ~20 s
  silent hang on a typo'd ticker; the progress bar clears after failure.
- **"Range" confidence** is capped at 65 % so "no clean trend" never
  reads as *High*.
- **History / favorites / trackers rows are clickable** — re-run that
  ticker (screenshot rows say they can't be reopened).
- Chart title shows the interval you picked (`1H`), not the provider's
  `60M`. Empty ticker announces the BTCUSDT default. Auth modal's guest
  button reads "Continue without an account" / "Sign out". Disabled
  Analyze button is legible.
- **HTML served `no-cache`** so a returning visitor after a deploy gets
  the current `?v=` asset refs instead of stale JS.

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
