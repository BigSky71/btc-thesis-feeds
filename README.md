# btc-thesis-feeds

Public soft-update JSON feeds for the **BTC Thesis Dashboard** app.

The main app repo (`BigSky71/btc-thesis-dashboard`) is **private**, so
`raw.githubusercontent.com/.../btc-thesis-dashboard/...` returns **404** without
auth and soft-update silently fails. This public repo exists so the app can
fetch weekday refreshes with no token.

## Feeds

| File | Soft-update URL |
|------|-----------------|
| `btd_watch.json` | https://raw.githubusercontent.com/BigSky71/btc-thesis-feeds/main/btd_watch.json |
| `etf_watch.json` | https://raw.githubusercontent.com/BigSky71/btc-thesis-feeds/main/etf_watch.json |
| `checkonchain_overlays.json` | https://raw.githubusercontent.com/BigSky71/btc-thesis-feeds/main/checkonchain_overlays.json |
| `funding_watch.json` | https://raw.githubusercontent.com/BigSky71/btc-thesis-feeds/main/funding_watch.json |
| `rotation_watch.json` | https://raw.githubusercontent.com/BigSky71/btc-thesis-feeds/main/rotation_watch.json |

**Do not invent** ratios, ETF flows, or on-chain series. Refresh from CheckOnChain /
scripts in the private dashboard repo, then copy these files here and push (BTD, ETF, overlays, funding).

Latest seed: as_of **2026-09-19**.

## Web app (PWA)

`app/` is the web version of the dashboard, served by GitHub Pages at
**https://bigsky71.github.io/btc-thesis-feeds/app/** (Add to Home Screen on iPhone).
Static HTML/JS (vendored uPlot), no server. It reads the feeds in this repo same-origin,
live BTC-USD spot and intraday candles from Coinbase's public API, and long daily history
from `price_history.json` (Yahoo BTC-USD 10y/1d over CoinMetrics; written daily by
`data/refresh_price_history.py` in the dashboard repo). A service worker caches the app and
the last good data for offline / fast open. Bump `VERSION` in `app/sw.js` and `WEB_VERSION`
in `app/app.js` on each app change.

| File | Purpose |
|------|---------|
| `price_history.json` | Daily BTC-USD closes 2010→last finished UTC day + Yahoo daily volume (columnar `t`/`c`/`v`) |
