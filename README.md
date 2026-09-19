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

**Do not invent** ratios, ETF flows, or on-chain series. Refresh from CheckOnChain /
scripts in the private dashboard repo, then copy these files here and push (BTD, ETF, overlays, funding).

Latest seed: as_of **2026-09-19**.
