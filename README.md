# ChartLens

ChartLens is a static MVP for reading a trading chart screenshot and turning it into a simple visual market-structure brief.

It runs fully in the browser:

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
