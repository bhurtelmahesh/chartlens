# ChartLens

ChartLens is a market-structure analysis app for reading chart screenshots or live ticker candles and turning them into simple visual briefs.

It runs fully in the browser:

- Enter a ticker or company name and interval to fetch the current chart.
- Upload a chart screenshot or generate a demo chart.
- Run a local pixel-structure scan.
- Get a directional/balanced bias, confidence score, image metrics, observations, and upside/downside scenarios.
- Save recent analyses, favorites, and active trackers locally or to Firebase after sign-in.

## Market data coverage

ChartLens uses provider routing:

- Crypto pairs: Binance public candles.
- US / NYSE / Nasdaq, Tokyo Stock Exchange, and many global exchanges: Yahoo Finance chart/search through Firebase Functions.
- NEPSE: best-effort daily chart support through the unofficial `surajrimal07/NepseAPI-Unofficial` API, with fast latest-price fallback from `nepsetty.kokomo.workers.dev`.

For reliable live charts, deploy the Firebase Function so `/api/search` and `/api/candles` can proxy provider data server-side. Screenshot/demo analysis works without any backend.

NEPSE provider note:

- `NEPSE_API_BASE` defaults to `https://nepseapi.surajrimal.dev` for historical/daily chart routes.
- `SHAREBAZAAR_API_BASE` defaults to `https://nepsetty.kokomo.workers.dev` for latest quote fallback.
- The Python `nepse-api` package was not added because this app uses Node/Firebase Functions.
- `Prabesh01/nepalstock-api` was not added because its README describes bypassing NepalStock authorization, which is not a good default for this app.

For a real production app, run your own reliable NEPSE API instance or use an official/licensed provider.

## Run locally

```bash
python3 -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173/
```

## Important

This is educational software, not a trading signal. Screenshot analysis can miss live data, labels, indicators, and wider market context.

Live market mode uses Binance public candle data and currently works best with crypto pairs such as `BTCUSDT`, `ETHUSDT`, `SOLUSDT`, and `DOGEUSDT`.

## Firebase Hosting

This repo is connected to Firebase project `chartlens101` and includes Firebase Hosting, Functions, Authentication, and Firestore config.

Production URLs:

- Primary Firebase Hosting: https://chartlens101.web.app
- Secondary GitHub Pages mirror: https://bhurtelmahesh.github.io/chartlens/

The registered Firebase Web App is `chartlens-web`, and `firebase-config.js` contains the public browser SDK config. ChartLens uses:

- Firebase Authentication for optional Email/password login and Google Sign-in.
- Cloud Firestore for owner-private workspace sync: analyses, favorites, and trackers under `users/{uid}/workspace/*`.
- A small SVG favicon and web manifest for browser tabs/install metadata.

Deploy the Firebase backend config and app with:

```bash
npm --prefix functions install
npx -y firebase-tools@latest deploy --only firestore,hosting
```

Firebase Auth providers are already enabled in project `chartlens101`. Keep Auth support-email/provider administration in the Firebase Console or a private local config, not in the public repo.

Firebase Functions require the Firebase project to be on the Blaze plan. ChartLens uses the Cloudflare Worker proxy below instead, so Firebase can stay focused on Hosting, Auth, and Firestore.

To avoid Blaze for market data, use a free-tier proxy such as Cloudflare Workers and set `window.CHARTLENS_API_BASE` to that Worker URL before `app.js` loads. Firestore remains the single database either way.

## Free market-data proxy option

A Cloudflare Worker proxy is included in `workers/market-proxy`. It mirrors the Firebase Function `/api/search` and `/api/candles` routes.

Permanent Worker URL:

```text
https://chartlens-market-proxy.chartlens101.workers.dev
```

```bash
cd workers/market-proxy
npx -y wrangler@latest login
npx -y wrangler@latest deploy
```

After deployment, set `window.CHARTLENS_API_BASE` to the Worker URL. Keep Firebase Auth and Firestore on `chartlens101`.

For local testing, run:

```bash
npx -y firebase-tools@latest emulators:start --only firestore
npx -y firebase-tools@latest hosting:channel:deploy preview
```
