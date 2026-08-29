# ChartLens

ChartLens is a static MVP for reading a trading chart screenshot or live crypto ticker and turning it into a simple visual market-structure brief.

It runs fully in the browser:

- Enter a Binance crypto pair and interval to fetch the current chart.
- Upload a chart screenshot or generate a demo chart.
- Run a local pixel-structure scan.
- Get a directional/balanced bias, confidence score, image metrics, observations, and upside/downside scenarios.
- Store recent analyses in browser local storage.

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

This repo includes a Firebase Hosting config. After creating a Firebase project, connect it with:

```bash
firebase use --add
firebase deploy
```
