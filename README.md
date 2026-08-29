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
- NEPSE: best-effort daily chart support through the unofficial `surajrimal07/NepseAPI-Unofficial` API, with clear educational/non-commercial-use limitations.

For reliable live charts, deploy the Firebase Function so `/api/search` and `/api/candles` can proxy provider data server-side. Screenshot/demo analysis works without any backend.

NEPSE provider note: the default Function config points at `https://nepseapi.surajrimal.dev`, which the upstream project describes as a free, unreliable, educational-only hosted service. For a real production app, run your own instance or use an official/licensed NEPSE data provider, then set `NEPSE_API_BASE` in Firebase Functions.

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

This repo includes Firebase Hosting and Functions config. After creating a Firebase project, connect it with:

```bash
npm --prefix functions install
firebase use --add
firebase deploy
```

For login/signup and cloud sync, replace `firebase-config.js` with your Firebase web app config. Keep `firebase-config.example.js` as the template.
