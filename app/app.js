/* BTC Thesis — web (PWA) port of the native SwiftUI dashboard (v1.2.31, chart v2.31).
 * Logic mirrors Shared/Services/OverlaySeriesStore.swift, ViewModels/ChartViewModel.swift,
 * Views/OverlayChartCard.swift, Models/BullWatch.swift and friends. Never invents data:
 * a series with no source data is "n/a". */
(function () {
'use strict';

const WEB_VERSION = 'web 1.6.11';
const CHART_VERSION = 'chart v2.34';
const FEED_BASE = '../';                         // same-origin GitHub Pages copy of btc-thesis-feeds
const RAW_BASE = 'https://raw.githubusercontent.com/BigSky71/btc-thesis-feeds/main/';
const CB = 'https://api.exchange.coinbase.com/products/BTC-USD';
const DAY = 86400;

// ---------- theme ----------
const rgba = (r, g, b, a = 1) => `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
const T = {
  accent: rgba(0.96, 0.62, 0.12), positive: rgba(0.20, 0.78, 0.48), negative: rgba(0.95, 0.35, 0.38),
  warning: rgba(0.95, 0.72, 0.25), text: 'rgba(255,255,255,0.92)', text2: 'rgba(255,255,255,0.55)',
  border: 'rgba(255,255,255,0.08)', grid: 'rgba(255,255,255,0.08)', gridY: 'rgba(255,255,255,0.056)',
};
// Distinct metric hues. BTC price stays T.accent (orange) on every chart.
const COL = {
  underwater: rgba(0.22, 0.80, 0.88),          // teal
  wma50: rgba(0.86, 0.88, 0.94),               // silver (dashed)
  weeklyConfirm: rgba(0.98, 0.36, 0.62),       // hot pink
  trueMean: rgba(0.96, 0.88, 0.22),             // lemon yellow
  bullInvalidation: rgba(0.88, 0.38, 0.48, 0.90),
  recoveryGate: rgba(0.62, 0.78, 0.42, 0.85),  // olive
  mayer15: rgba(0.72, 0.44, 0.22, 0.90),        // copper
  magnet: rgba(0.92, 0.28, 0.24, 0.95),         // clear red
  coinbase: rgba(0.70, 0.48, 0.98),             // violet
  coinbaseDown: rgba(0.48, 0.32, 0.78, 0.85),
};

// ---------- series catalogue (OverlaySeriesID) ----------
const MA_DASH = [5, 4], BULL_DASH = [2, 4], FLOOR_DASH = [8, 3];
const SERIES = [
  ['spot', 'BTC', 'BTC', T.accent, 2.0, null],
  ['wma50', '50 WMA (live)', '50 WMA', COL.wma50, 1.4, MA_DASH],
  ['wma200', '200 WMA', '200 WMA', rgba(0.55, 0.75, 0.95), 1.4, MA_DASH],
  ['dma200', '200 DMA', '200 DMA', rgba(0.45, 0.85, 0.65), 1.4, MA_DASH],
  ['sthCostBasis', 'STH Cost Basis', 'STH CB', rgba(0.75, 0.55, 0.95), 1.4, null],
  ['trueMean', 'True Mean Price', 'True Mean', COL.trueMean, 1.4, null],
  // COMEX futures (Yahoo GC=F / SI=F), not London spot. Own axes; not on the BTC y-scale.
  ['gold', 'Gold (COMEX futures)', 'Gold', rgba(0.79, 0.64, 0.15), 1.6, null],       // antique gold, not TMM lemon / 10Y gold
  ['silver', 'Silver (COMEX futures)', 'Silver', rgba(0.55, 0.66, 0.74), 1.6, null], // cool solid silver, not 50 WMA #DBE0F0 dashed
  ['bullInvalidation', 'Weekly invalidation', 'Weekly inv.', COL.bullInvalidation, 1.0, BULL_DASH],
  // Check MRI bands, cool (low Q) → warm (high Q), distinct from BTC orange.
  ['checkMriQ5',  'Check MRI Q5', 'MRI Q5',  rgba(0.10, 0.58, 0.64), 1.2, FLOOR_DASH],
  ['checkMriQ10', 'Check MRI Q10', 'MRI Q10', rgba(0.16, 0.50, 0.74), 1.2, FLOOR_DASH],
  ['checkMriQ20', 'Check MRI Q20', 'MRI Q20', rgba(0.28, 0.42, 0.82), 1.2, FLOOR_DASH],
  ['checkMriQ25', 'Check MRI Q25', 'MRI Q25', rgba(0.42, 0.36, 0.82), 1.2, FLOOR_DASH],
  ['checkMriQ50', 'Check MRI Q50 (midpoint)', 'MRI Q50', rgba(0.62, 0.34, 0.74), 1.2, FLOOR_DASH],
  ['checkMriQ75', 'Check MRI Q75', 'MRI Q75', rgba(0.78, 0.32, 0.55), 1.2, FLOOR_DASH],
  ['checkMriQ90', 'Check MRI Q90', 'MRI Q90', rgba(0.86, 0.32, 0.40), 1.2, FLOOR_DASH],
  ['checkMriQ95', 'Check MRI Q95', 'MRI Q95', rgba(0.90, 0.24, 0.34), 1.2, FLOOR_DASH],
  ['recoveryGate', 'Recovery to excitement', '$100k gate', COL.recoveryGate, 1.0, BULL_DASH],
  ['mayer15', 'Mayer 1.5×', 'Mayer 1.5×', COL.mayer15, 1.0, BULL_DASH],
  ['valuationTop', 'Valuation-range top', '$150k top', rgba(0.72, 0.50, 0.48, 0.8), 1.0, BULL_DASH],
  ['realizedPrice', 'Realized: average cost of every coin', 'Realized', rgba(0.30, 0.62, 0.80), 1.2, FLOOR_DASH],
  ['lthCostBasis', "LTH CB: long-term holders' average cost", 'LTH CB', rgba(0.42, 0.48, 0.85), 1.2, FLOOR_DASH],
  ['floorTmm', 'TMM: active investors\' average cost', 'TMM', COL.trueMean, 1.2, FLOOR_DASH],
].map(([id, title, short, color, width, dash]) => ({ id, title, short, color, width, dash }));
const SID = Object.fromEntries(SERIES.map(s => [s.id, s]));
const datedLabels = { checkQ50: null, checkQ75: null };
function chartSpot() {
  return isNum(state.spot) ? state.spot : null;
}
function magnetAsOfISO(item) {
  const src = item || (typeof dailyLevelsCatalog === 'function' ? dailyLevelsCatalog().find(L => L && (L.id === 'liquidation_cluster' || L.type === 'liquidation_cluster')) : null);
  const s = src && src.as_of;
  return (s && String(s).slice(0, 10)) || null;
}
function magnetAsOfLabel(item) {
  const iso = magnetAsOfISO(item);
  return iso ? (shortDateISO(iso) || iso) : null;
}
function magnetTitle(item, lo, hi) {
  const range = bannerRangeText(lo != null ? lo : magnetBand()[0], hi != null ? hi : magnetBand()[1]);
  const asOf = magnetAsOfLabel(item);
  return `Liquidation magnet ${range}${asOf ? ` (as of ${asOf})` : ''}`;
}
function finishedWeeklyCloses(bars) {
  if (!bars || !bars.length) return [];
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const map = new Map();
  for (const b of bars) {
    if (!(b.c > 0) && !(b.v > 0)) continue;
    const px = isNum(b.c) ? b.c : b.v;
    if (!(px > 0)) continue;
    const d = new Date(b.t * 1000);
    const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const dow = new Date(start).getUTCDay();
    const sunday = start + ((7 - dow) % 7) * 86400000;
    if (sunday >= todayUtc) continue;
    const prev = map.get(sunday);
    if (!prev || b.t > prev.t) map.set(sunday, { t: b.t, c: px });
  }
  return [...map.values()].sort((a, b) => a.t - b.t);
}
function lastWeeklyCloseUnder(level) {
  const bars = state.master && state.master.length ? state.master : null;
  if (!bars || !isNum(level)) return null;
  const closes = finishedWeeklyCloses(bars);
  for (let i = closes.length - 1; i >= 0; i--) if (closes[i].c < level) return closes[i];
  return null;
}
function weeklyInvalidationNote(relation) {
  if (relation !== 'overhead') return null;
  const p = lastWeeklyCloseUnder(72000);
  if (!p) return null;
  return `Thesis line: weekly close under $72k already printed ${fmtUTCDate(p.t)} at ${usd(p.c)}. Now overhead, resistance to reclaim.`;
}
function weeklyConfirmChartNote() {
  const px = chartSpot();
  if (px != null && px < 83000) {
    return "Bears' Last Stand is a thesis line at $83k, now overhead (former first support). Chart line starts at the May 2026 peak. It is not the live 50-week average.";
  }
  if (px != null && px <= 83000) {
    return "Bears' Last Stand (thesis line at $83k) is being tested. Chart line starts at the May 2026 peak. It is not the live 50-week average.";
  }
  return "Bears' Last Stand / first support (thesis line at $83k) starts at the May 2026 peak. It is not the live 50-week average.";
}
function legendTitle(id) {
  const px = chartSpot();
  if (id === 'weeklyConfirm') {
    const rel = levelRelation(83000, 83000, px);
    if (rel === 'overhead') return "Bears' Last Stand, $83k reclaim";
    if (rel === 'testing') return "Bears' Last Stand (testing)";
    return "Bears' Last Stand / first support";
  }
  if (id === 'bullInvalidation') {
    const rel = levelRelation(72000, 72000, px);
    if (rel === 'overhead') return '$72k, resistance to reclaim';
    if (rel === 'testing') return 'Weekly invalidation (testing)';
    return 'Weekly invalidation';
  }
  if (id === 'buyerCushion') {
    const rel = levelRelation(CUSHION_LO, CUSHION_HI, px);
    const range = bannerRangeText(CUSHION_LO, CUSHION_HI);
    if (rel === 'overhead') return `Buyer cushion ${range}, reclaim`;
    if (rel === 'testing') return `Inside the buyer cushion ${range}`;
    return `Buyer cushion ${range}`;
  }
  if (id === 'liquidationMagnet') return magnetTitle();
  return datedLabels[id] || SID[id].title;
}
const isMarker = id => id === 'checkQ50' || id === 'checkQ75';
const isPriceDerived = id => id === 'spot' || id === 'wma50' || id === 'wma200' || id === 'dma200';
const isSupportFloor = id => ['realizedPrice', 'lthCostBasis'].includes(id);
const isMetal = id => id === 'gold' || id === 'silver';
const isZoneSeries = id => id === 'buyerCushion' || id === 'liquidationMagnet';
const CUSHION_LO = 62300, CUSHION_HI = 64200;
const MAGNET_LO = 59500, MAGNET_HI = 62200; // fallback if banner_levels.json is missing
function magnetBand() {
  const levels = dailyLevelsCatalog();
  const item = levels.find(L => L && (L.id === 'liquidation_cluster' || L.type === 'liquidation_cluster'));
  const lo = item && isNum(item.low) ? item.low : MAGNET_LO;
  const hi = item && isNum(item.high) ? item.high : MAGNET_HI;
  return [Math.min(lo, hi), Math.max(lo, hi)];
}
function magnetRangeText() {
  const [lo, hi] = magnetBand();
  return bannerRangeText(lo, hi);
}
function cushionMagnetNote() {
  return `If the cushion drains, the ${magnetRangeText()} liquidation magnet is next.`;
}
const HIDDEN_FLOOR_IDS = new Set(['q25', 'q20', 'q15', 'q10', 'q5']); // cost-basis Qs: keep in the feed, hide in the UI
const FLOOR_ID = { realized: 'realizedPrice', lth: 'lthCostBasis', tmm: 'floorTmm', mri_q5: 'checkMriQ5', mri_q10: 'checkMriQ10', mri_q20: 'checkMriQ20', mri_q25: 'checkMriQ25', mri_q50: 'checkMriQ50', mri_q75: 'checkMriQ75', mri_q90: 'checkMriQ90', mri_q95: 'checkMriQ95' };
const DEFAULT_ON = new Set(['spot', 'wma50', 'wma200', 'dma200', 'sthCostBasis', 'trueMean']);

const MACRO_SERIES = [
  { id: 'ust10y', title: 'US 10-year yield', short: '10-year', color: rgba(0.92, 0.78, 0.35), width: 1.6 },
  { id: 'ust2y', title: 'US 2-year Treasury yield', short: '2-year', color: rgba(0.22, 0.76, 0.62), width: 1.6 }, // emerald
  { id: 'sofr', title: 'SOFR (overnight rate)', short: 'SOFR', color: rgba(0.80, 0.42, 0.70), width: 1.6 },     // orchid
  { id: 'dxy', title: 'Dollar index (DXY)', short: 'DXY', color: rgba(0.40, 0.72, 0.95), width: 1.6 },
];
const MACRO_SID = Object.fromEntries(MACRO_SERIES.map(s => [s.id, s]));
const MACRO_DEFAULT_ON = new Set(['ust10y', 'ust2y', 'sofr', 'dxy']);
const isMacroYield = id => id === 'ust10y' || id === 'ust2y' || id === 'sofr';

// ---------- ranges (ChartRange) ----------
const RANGES = ['1H', '1D', '1W', '1M', '3M', '6M', '1Y', '2Y', '5Y', '10Y'];
const isIntraday = r => r === '1H' || r === '1D' || r === '1W' || r === '1M';
const DISPLAY_DAYS = { '1H': 1, '1D': 1, '1W': 5, '1M': 31, '3M': 93, '6M': 186, '1Y': 365, '2Y': 730, '5Y': 1825, '10Y': 3650 };
// Coinbase candles replace Yahoo intraday (Yahoo blocks browser CORS). Same windows as the native fetch.
const INTRADAY = {
  '1H': { gran: 60, seconds: 61 * 60, clipMin: 60 },
  '1D': { gran: 300, seconds: 24 * 3600 + 300, clipMin: 24 * 60 },
  '1W': { gran: 900, seconds: 5 * DAY, clipMin: null },        // Yahoo 5d / 15m
  '1M': { gran: 3600, seconds: 31 * DAY, clipMin: null },      // Yahoo 1mo / 1h
};

// ---------- thesis config ----------
const CONFIG = {
  weeklyConfirmRef: 83000, weeklyConfirmVisibleFrom: Date.UTC(2026, 4, 10) / 1000,
  mock50WMA: 79000, reaccumShelfLow: 76000, reaccumShelfHigh: 82000,
  deeperInvalidation: 70000, digestionLow: 87000, digestionHigh: 100000, sthQ75: 87000, sthQ90: 104000,
  regimeSummary: 'Quiet & Trending — early bull',
  regimeDetail: 'Dips will be bought · early innings. The bull-market card is the measurable set once price is above the live 50-week average: supports, overhead, and top signals. The live 50-week average stays a separate line. Soft GLI and MOVE / liquidity caution still apply.',
  invalidationNote: 'Bull-layer invalidation is the weekly-close line on the bull card. The older ~$70k confluence is still the hard regime challenge.',
  liveSupportsNote: 'True Market Mean, short-term holder cost basis, and the 200-day average are live on the bull-market card and on the chart.',
  hinge2027Note: '2027 hinge: Howell GLI trough + Check ATH/discovery — timing note, not a price target.',
  liquidityFlags: [
    { id: 'gli', title: 'GLI momentum', detail: 'Soft / watch', severity: 'soft' },
    { id: 'move', title: 'MOVE', detail: 'Waiting on funding watch', severity: 'neutral' },
    { id: 'sofr_minus_2y', title: '2y − SOFR', detail: 'Waiting on funding watch', severity: 'neutral' },
    { id: 'bills_share', title: 'Bills / debt', detail: 'Waiting on funding watch', severity: 'neutral' },
    { id: 'reserves', title: 'Reserves', detail: 'Waiting on funding watch', severity: 'neutral' },
  ],
};

// ---------- formatting ----------
const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const usd = v => '$' + nf0.format(Math.round(v));
const usdCents = v => '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtOverlayVal = (id, v) => id === 'silver' ? usdCents(v) : usd(v);
const fx = (v, d) => Number(v).toFixed(d);
const signed = (v, d = 2) => (v >= 0 ? '+' : '') + fx(v, d);
const pct = f => fx(f * 100, 2) + '%';
const pctPerYear = f => fx(f * 100, 2) + '%/yr';
const usdBillions = v => '$' + fx(v / 1e9, 1) + 'B';
const compactK = v => { const k = v / 1000; return Math.abs(k - Math.round(k)) < 0.05 ? `$${Math.round(k)}k` : `$${fx(k, 1)}k`; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isNum = v => typeof v === 'number' && isFinite(v);
const pos = v => isNum(v) && v > 0 ? v : null;
const compactVolume = v => { const a = Math.abs(v); return a >= 1e9 ? fx(v / 1e9, 2) + 'B' : a >= 1e6 ? fx(v / 1e6, 1) + 'M' : a >= 1e3 ? fx(v / 1e3, 1) + 'K' : fx(v, 0); };
const fmtYield = v => fx(v, 2) + '%';
const fmtDxy = v => fx(v, 2);
const fmtMacroVal = (id, v) => isMacroYield(id) ? fmtYield(v) : fmtDxy(v);
const weekPhrase = ch => {
  if (!isNum(ch)) return '1-week change unavailable';
  if (Math.abs(ch) < 0.005) return 'unchanged from a week ago';
  return (ch > 0 ? 'up ' : 'down ') + fx(Math.abs(ch), 2) + ' from a week ago';
};
const shortDate = t => { const d = new Date((typeof t === 'number' ? t : isoToUnix(t)) * 1000); return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`; };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const isoToUnix = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 1000 : null; };
const shortDateISO = s => { const t = isoToUnix(s); if (t == null) return null; const d = new Date(t * 1000); return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`; };
const fmtDate = (t, withTime) => {
  const d = new Date(t * 1000);
  const base = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return withTime ? base + ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : base;
};
const fmtUTCDate = t => { const d = new Date(t * 1000); return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; };
const localStartOfDay = t => { const d = new Date(t * 1000); d.setHours(0, 0, 0, 0); return d.getTime() / 1000; };

// ---------- network ----------
async function fetchJSON(url, timeoutMs = 12000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}
async function fetchFeed(name) {
  try { return await fetchJSON(FEED_BASE + name); }
  catch (e) {
    try { return await fetchJSON(RAW_BASE + name); }
    catch (e2) { throw new Error(`${name}: ${e2.message || e2}`); }
  }
}
async function fetchCandles(gran, startSec, endSec) {
  const span = gran * 300;
  const jobs = [];
  for (let s = startSec; s < endSec; s += span) {
    const e = Math.min(endSec, s + span);
    const url = `${CB}/candles?granularity=${gran}&start=${new Date(s * 1000).toISOString()}&end=${new Date(e * 1000).toISOString()}`;
    jobs.push(fetchJSON(url, 10000));
  }
  const chunks = await Promise.all(jobs);
  const byT = new Map();
  for (const rows of chunks) for (const r of rows || []) {
    // [time, low, high, open, close, volume(BTC)]
    if (!Array.isArray(r) || !(r[4] > 0)) continue;
    byT.set(r[0], { t: r[0], c: r[4], v: r[5] > 0 ? r[5] * r[4] : null });
  }
  return [...byT.values()].sort((a, b) => a.t - b.t);
}

// ---------- state ----------
const state = {
  feeds: {},          // name -> json
  feedErrors: [],
  master: null,       // [{t,c,v}] daily (UTC midnight), deep history + Coinbase recent days
  masterNote: null,
  spot: null, spotAt: null,
  range: localStorage.getItem('chart.range') || '1Y',
  bundle: null, chartError: null, loading: false,
  enabled: loadEnabled(),
  macroEnabled: loadMacroEnabled(),
  sel: null,          // selected (inspected) unix time
  tab: 'overview',
  intradayCache: {},
};
if (!RANGES.includes(state.range)) state.range = '1Y';

function loadEnabled() {
  const set = new Set();
  for (const s of SERIES) {
    const v = localStorage.getItem('chart.enabledSeries.' + s.id);
    if (v != null) { if (v === '1') set.add(s.id); }
    else if (DEFAULT_ON.has(s.id)) set.add(s.id);
  }
  set.add('spot'); // BTC can't be turned off
  return set;
}
// localStorage is the only source of truth for toggles: a key is written only when the user
// toggles that line, so untouched lines keep following DEFAULT_ON and a saved choice is never
// overridden (not by range switches, refreshes, live polls or reloads).
function persistEnabled(id) {
  try { localStorage.setItem('chart.enabledSeries.' + id, state.enabled.has(id) ? '1' : '0'); } catch (e) { /* private mode */ }
}
function loadMacroEnabled() {
  const set = new Set();
  for (const s of MACRO_SERIES) {
    const v = localStorage.getItem('chart.enabledSeries.' + s.id);
    if (v != null) { if (v === '1') set.add(s.id); }
    else if (MACRO_DEFAULT_ON.has(s.id)) set.add(s.id);
  }
  return set;
}
function persistMacroEnabled(id) {
  try { localStorage.setItem('chart.enabledSeries.' + id, state.macroEnabled.has(id) ? '1' : '0'); } catch (e) { /* private mode */ }
}
function toggleMacro(id) {
  if (state.macroEnabled.has(id)) state.macroEnabled.delete(id);
  else state.macroEnabled.add(id);
  persistMacroEnabled(id);
  renderChart();
}

// ---------- math ----------
function rollingSMA(closes, w) {
  const out = new Array(closes.length).fill(null);
  let sum = 0;
  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= w) sum -= closes[i - w];
    if (i >= w - 1) out[i] = sum / w;
  }
  return out;
}
function nearestIdx(pts, t) {
  if (!pts.length) return -1;
  let lo = 0, hi = pts.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (pts[m].t < t) lo = m + 1; else hi = m; }
  if (lo > 0 && Math.abs(pts[lo - 1].t - t) < Math.abs(pts[lo].t - t)) return lo - 1;
  return lo;
}
function alignToBars(daily, bars) {
  if (!daily.length || !bars.length) return [];
  const sorted = [...daily].sort((a, b) => a.t - b.t);
  const out = []; let idx = -1;
  for (const bar of bars) {
    const barDay = localStartOfDay(bar.t);
    while (idx + 1 < sorted.length && localStartOfDay(sorted[idx + 1].t) <= barDay) idx++;
    if (idx >= 0) out.push({ t: bar.t, v: sorted[idx].v });
  }
  return out;
}
const tv = (arr) => (arr || []).map(p => {
  const raw = p.t, v = p.v != null ? p.v : p.value;
  if (!(raw > 0) || !(v > 0)) return null;
  return { t: raw > 1e12 ? raw / 1000 : raw, v };
}).filter(Boolean).sort((a, b) => a.t - b.t);

// ---------- bull levels / watch (BullWatch.swift) ----------
const lvl = (levels, id) => levels && (levels.levels || []).find(l => l.id === id) || null;
const lvlVal = (levels, id) => { const l = lvl(levels, id); return l && isNum(l.value) ? l.value : null; };
const liveValue = p => (p && p.available !== false && isNum(p.value) && p.value > 0) ? p.value : null;
function checkSourceLabel(level) {
  const t = isoToUnix(level.as_of); if (t == null) return 'dated';
  const days = Math.max(0, Math.floor((Date.now() / 1000 - t) / DAY));
  return days === 0 ? 'dated · today' : days === 1 ? 'dated · 1 day old' : `dated · ${days} days old`;
}
function checkChartLabel(short, level) {
  if (!level || !(level.value > 0)) return null;
  let text = `${short} ${compactK(level.value)}`;
  const d = shortDateISO(level.as_of); if (d) text += ` · as of ${d}`;
  return text;
}
function chartAnchors(levels, watch) {
  const q75 = liveValue(watch && watch.sth_q75) ?? lvlVal(levels, 'sth_q75_fallback');
  const q90 = liveValue(watch && watch.sth_q90) ?? lvlVal(levels, 'sth_q90_fallback');
  const multiple = lvlVal(levels, 'mayer_multiple') ?? (watch && watch.mayer_1_5 && watch.mayer_1_5.multiple) ?? 1.5;
  const g = (k) => watch && watch[k];
  return {
    firstSupport: lvlVal(levels, 'first_support_defend'),
    weeklyInvalidation: lvlVal(levels, 'weekly_invalidation'),
    sthQ75: q75, sthQ90: q90,
    sthQ75History: (watch && watch.sth_q75_history) || [], sthQ90History: (watch && watch.sth_q90_history) || [],
    checkQ50: lvlVal(levels, 'check_q50'), checkQ75: lvlVal(levels, 'check_q75'),
    checkQ50Label: checkChartLabel('Check Q50', lvl(levels, 'check_q50')),
    checkQ75Label: checkChartLabel('Check Q75', lvl(levels, 'check_q75')),
    checkQ50AsOf: isoToUnix(lvl(levels, 'check_q50') && lvl(levels, 'check_q50').as_of),
    checkQ75AsOf: isoToUnix(lvl(levels, 'check_q75') && lvl(levels, 'check_q75').as_of),
    checkQ50Proxy: liveValue(g('check_q50_proxy')), checkQ50ProxyHistory: (g('check_q50_proxy') || {}).history || [],
    mriHistory: (g('mri_q50') || {}).history || [],
    mriMidpoint: liveValue(g('mri_q50')) ?? lvlVal(levels, 'mri_midpoint'),
    recoveryGate: lvlVal(levels, 'recovery_excitement_gate'),
    valuationTop: lvlVal(levels, 'valuation_range_top'),
    mayerMultiple: multiple > 0 ? multiple : 1.5,
  };
}

function bullSnapshot(levels, watch) {
  if (!levels && !watch) return { hasFeed: false, supports: [], overhead: [], signals: [], moveFragile: 80, moveStress: 100, moveRecession: 135 };
  const W = watch || {};
  const row = (id, title, value, sourceLabel, note, role) => ({ id, title, value, sourceLabel, note, role });
  const livePriceRow = (id, title, p, note, role) => {
    const v = liveValue(p);
    return v != null ? row(id, title, v, 'live', note, role) : row(id, title, null, 'unavailable', `Live print unavailable. ${note}`, role);
  };
  const staticRow = (id, fallbackTitle, level, fallbackNote, role) => {
    if (!level || !(isNum(level.value) && level.value > 0)) return row(id, (level && level.label) || fallbackTitle, null, 'unavailable', 'Static level missing from bull levels.', role);
    const t = (level.label || '').trim(), n = (level.note || '').trim();
    return row(id, t || fallbackTitle, level.value, 'static', n || fallbackNote, role);
  };
  const datedCheckRow = (id, short, level) => {
    if (!level || !(isNum(level.value) && level.value > 0)) return row(id, short, null, 'unavailable', 'Dated Check value missing from bull levels.', 'overhead');
    let title = checkChartLabel(short, level) || short;
    if (level.status) title += ` · ${level.status}`;
    let note = level.note || '';
    if (level.source) note += (note ? ' ' : '') + `Source: ${level.source}.`;
    return row(id, title, level.value, checkSourceLabel(level), note, 'overhead');
  };
  const proxyRow = (id, title, value, note) => value != null ? row(id, title, value, 'live', note, 'overhead') : row(id, title, null, 'unavailable', 'Live proxy unavailable in this feed.', 'overhead');
  const bandRow = (id, title, live, fallback, liveNote) => {
    const v = liveValue(live);
    if (v != null) return row(id, title, v, 'live', liveNote, 'overhead');
    if (fallback && isNum(fallback.value) && fallback.value > 0) return row(id, fallback.label || title, fallback.value, 'static fallback', fallback.note || 'Static fallback. Live profit-taking band unavailable.', 'overhead');
    return row(id, title, null, 'unavailable', 'Live profit-taking band unavailable, and no static fallback is set.', 'overhead');
  };
  const profitBandNote = (label, multiple, hotter) => {
    const times = isNum(multiple) && multiple > 0 ? ` (${fx(multiple, 2)}× cost basis)` : '';
    return `Short-term holder cost basis × historical STH-MVRV ${label}${times}. ${hotter}. Check's model overheats several times in a bull (local tops).`;
  };
  const urpdNote = (poc) => {
    let note = 'Middle of the $1k price bin holding the most BTC (Bitview cost-basis distribution';
    if (poc && poc.as_of) note += `, ${poc.as_of}`;
    note += "). Live proxy for Check's Q50 centroid, not Check MRI.";
    if (poc && poc.previous_value > 0) {
      let t = ` Was ${compactK(poc.previous_value)}`;
      const u = shortDateISO(poc.previous_until); if (u) t += ` until ${u}`;
      note += t + '.';
    }
    return note;
  };
  const dmaRow = (p) => {
    const v = liveValue(p);
    if (v == null) return row('dma_200', '200-day average', null, 'unavailable', 'Live 200-day average unavailable, so the slope cannot be read.', 'support');
    let slope;
    if (isNum(p.change_30d) && p.turned_up === true) slope = `Turning up — ${usd(p.change_30d)} higher than 30 days ago. A turn up in the 200-day average is a bull signal.`;
    else if (isNum(p.change_30d) && p.turned_up === false) slope = `Still falling — ${usd(Math.abs(p.change_30d))} lower than 30 days ago.`;
    else slope = '30-day slope not available yet.';
    return row('dma_200', '200-day average', v, 'live', slope, 'support');
  };
  const mayerRow = () => {
    const multiple = lvlVal(levels, 'mayer_multiple') ?? (W.mayer_1_5 && W.mayer_1_5.multiple) ?? 1.5;
    const ml = multiple === 1.5 ? '1.5×' : `${multiple}×`;
    const v = liveValue(W.mayer_1_5);
    if (v != null) return row('mayer_1_5', `Mayer ${ml}`, v, 'live', `${ml} the Bitview 200-day average, so the dollar level rises with that average. The chart line, once switched on, is the same multiple of the chart's own 200-day average.`, 'overhead');
    return row('mayer_1_5', `Mayer ${ml}`, null, 'unavailable', 'Not computed — the live 200-day average is unavailable.', 'overhead');
  };

  const thesisRow = (id, level, titles, notes) => {
    const value = level && isNum(level.value) && level.value > 0 ? level.value : null;
    if (value == null) return row(id, titles.support || titles.overhead, null, 'unavailable', 'Thesis line missing from bull levels.', 'overhead');
    const rel = levelRelation(value, value, state.spot);
    const title = rel === 'overhead' ? (titles.overhead || titles.support) : (rel === 'testing' ? (titles.testing || titles.support) : titles.support);
    const note = rel === 'overhead' ? (notes.overhead || notes.support) : (notes.support);
    const role = rel === 'support' ? 'support' : 'overhead';
    return row(id, title, value, 'thesis line', note, role);
  };
  const supports = [
    livePriceRow('true_market_mean', 'True Market Mean', W.true_market_mean, 'Holding above this is a very strong bullish sign.', 'support'),
    livePriceRow('sth_cost_basis', 'Short-term holder cost basis', W.sth_cost_basis, 'The dip flag fires only when STH-MVRV and STH-SOPR are both under 1.', 'support'),
    dmaRow(W.dma_200),
  ];
  const overhead = [];
  const placeThesis = (r) => { if (r.role === 'support') supports.push(r); else overhead.push(r); };
  placeThesis(thesisRow('weekly_invalidation', lvl(levels, 'weekly_invalidation'),
    { support: 'Weekly invalidation ($72k)', overhead: '$72k, resistance to reclaim', testing: 'Weekly invalidation (testing)' },
    { support: 'Thesis line: a weekly close under this level is the soft invalidation.', overhead: weeklyInvalidationNote('overhead') || 'Thesis line: weekly invalidation, now overhead. Resistance to reclaim.' }));
  const mri = liveValue(W.mri_q50);
  if (mri != null) overhead.push(row('mri_midpoint', 'Check MRI Q50 (midpoint)', mri, 'live', 'CheckOnChain Mean Reversion Index bands, Q50, daily' + (W.mri_q50.as_of ? ` (as of ${W.mri_q50.as_of})` : '') + '.', 'overhead'));
  // No static MRI fallback — if the live series is missing, omit the row rather than show a stale $90k.
  placeThesis(thesisRow('recovery_gate', lvl(levels, 'recovery_excitement_gate'),
    { support: '$100k recovery gate', overhead: '$100k recovery gate, overhead', testing: '$100k recovery gate (testing)' },
    { support: 'Thesis line: recovery-to-excitement gate.', overhead: 'Thesis line: $100k recovery-to-excitement gate, now overhead.' }));
  overhead.push(mayerRow());
  placeThesis(thesisRow('valuation_top', lvl(levels, 'valuation_range_top'),
    { support: 'Valuation-range top', overhead: 'Valuation-range top, overhead', testing: 'Valuation-range top (testing)' },
    { support: 'Thesis line: Check valuation-range top. First large long-term-holder distribution zone.', overhead: 'Thesis line: Check valuation-range top, now overhead.' }));

  const byPx = (a, b) => ((b.value || 0) - (a.value || 0));
  supports.sort(byPx);
  overhead.sort(byPx);
  const signals = [mvrvSignal(levels, W.sth_mvrv), lthSignal(levels, W.lth_supply_share), clusterSignal(W.sth_cost_basis_cluster), ...leverageSignals(levels, W.leverage)];
  return {
    hasFeed: true, asOf: W.as_of, levelsAsOf: levels && levels.as_of, supports, overhead, signals,
    moveFragile: lvlVal(levels, 'move_fragile') ?? 80, moveStress: lvlVal(levels, 'move_stress') ?? 100, moveRecession: lvlVal(levels, 'move_recession') ?? 135,
    value(id) { const r = supports.find(x => x.id === id) || overhead.find(x => x.id === id); return r ? r.value : null; },
    get anyWarning() { return signals.some(s => s.warning); },
  };
}
const sig = (id, title, detail, warning, unavailable, watch = false) => ({ id, title, detail, warning, unavailable, watch });
function mvrvSignal(levels, p) {
  const hot = lvlVal(levels, 'sth_mvrv_hot') ?? (p && p.hot_at_or_above) ?? 1.25;
  if (!p || p.available === false || !(isNum(p.value) && p.value > 0)) return sig('sth_mvrv', 'STH-MVRV', 'Live STH-MVRV unavailable. This is the top-side read; the dip card still watches a print under 1.', false, true);
  const v = p.value, warning = v >= hot;
  const detail = warning ? `${fx(v, 2)} — running hot. Warning line is ${fx(hot, 2)}, read from the top.` : `${fx(v, 2)} — not hot. Warning line is ${fx(hot, 2)}, read from the top. The dip card still watches a print under 1.`;
  return sig('sth_mvrv', 'STH-MVRV', detail, warning, false);
}
function lthSignal(levels, s) {
  const line = lvlVal(levels, 'lth_share_decline_90d') ?? (s && s.warning_decline_pp) ?? 1.0;
  if (!s || s.available === false || !(isNum(s.share) && s.share > 0 && s.share <= 1)) return sig('lth_supply_share', 'Long-term holder supply share', 'Live supply share unavailable.', false, true);
  const change = isNum(s.change_90d_pp) ? s.change_90d_pp : null;
  const warning = change != null && change <= -Math.abs(line);
  const parts = [`${fx(s.share * 100, 1)}% of supply`];
  if (isNum(s.high_180d)) parts.push(s.high_180d_as_of ? `versus ${fx(s.high_180d * 100, 1)}% on ${s.high_180d_as_of}` : `versus a recent high of ${fx(s.high_180d * 100, 1)}%`);
  let detail = parts.join(', ') + '.';
  detail += change != null ? ` ${signed(change, 1)} points over 90 days.` : ' 90-day change unavailable.';
  if (warning) detail += ' Steady decline.';
  return sig('lth_supply_share', 'Long-term holder supply share', detail, warning, false);
}
function clusterSignal(c) {
  const p75 = liveValue(c && c.p75), p90 = liveValue(c && c.p90), title = 'STH cost-basis cluster (P75/P90)';
  if (p75 == null && p90 == null) return sig('sth_cost_basis_cluster', title, 'Live cluster unavailable. Where recent buyers bought. Supply here turns underwater on a dip. Not a target.', false, true);
  const prices = p75 != null && p90 != null ? `${usd(p75)} / ${usd(p90)}` : p75 != null ? `P75 ${usd(p75)}. P90 unavailable` : `P90 ${usd(p90)}. P75 unavailable`;
  return sig('sth_cost_basis_cluster', title, `${prices}. Where recent buyers bought. Supply here turns underwater on a dip. Not a target.`, false, p75 == null || p90 == null);
}
function leverageSignals(levels, f) {
  const rules = (levels && levels.leverage) || {};
  if (!f || f.available !== true) {
    const note = f && (f.note || f.error);
    return [sig('leverage', 'Leverage', note ? `Live derivatives feed unavailable. ${note}` : 'Live derivatives feed unavailable.', false, true)];
  }
  // funding z
  const fz = rules.funding_z || {};
  let zRow;
  { const title = fz.label || 'Longs paying up vs normal';
    if (!isNum(f.funding_z)) zRow = sig('leverage_z', title, 'Funding z-score unavailable.', false, true);
    else { const z = f.funding_z, watchAt = fz.watch_above ?? 1.0, warnAt = fz.warning_above ?? 1.5, shortsAt = fz.shorts_crowded_below ?? -1.0;
      const warning = z > warnAt, watch = !warning && z > watchAt; let d = `Z-score ${signed(z)}.`;
      d += warning ? ' Longs are paying up versus normal.' : watch ? ` Above the watch line at ${signed(watchAt)}.` : z < shortsAt ? ' Shorts crowded. Contrarian bullish. Not a warning.' : ' Not hot.';
      zRow = sig('leverage_z', title, d, warning, false, watch); } }
  // funding cost
  const fa = rules.funding_annualised || {};
  let costRow;
  { const title = fa.label || 'Cost of being long';
    if (!isNum(f.funding_avg_7d) || !isNum(f.funding_avg_30d)) costRow = sig('leverage_funding', title, 'Funding averages unavailable.', false, true);
    else { const a7 = f.funding_avg_7d, a30 = f.funding_avg_30d;
      const warn7 = (fa.warning || {}).avg_7d_at_or_above ?? 0.15, warn30 = (fa.warning || {}).avg_30d_at_or_above ?? 0.10, watch30 = (fa.watch || {}).avg_30d_above ?? 0.062;
      const warning = a7 >= warn7 && a30 >= warn30, watch = !warning && a30 > watch30;
      let d = `7-day average ${pctPerYear(a7)}. 30-day average ${pctPerYear(a30)}.`;
      if (isNum(f.sofr_pct)) { const s = f.sofr_pct / 100; d += a7 < s ? ` Below SOFR ${pct(s)}. Not overheated.` : ` Not below SOFR ${pct(s)}.`; }
      else d += ' SOFR print unavailable, so the T-bill check was not run.';
      if (warning) d += ' Sustained heat.'; else if (watch) d += ' 30-day average is above 6.2%.';
      costRow = sig('leverage_funding', title, d, warning, false, watch); } }
  // OI
  const oc = rules.oi_change || {};
  let oiRow;
  { const title = oc.label || 'Leverage piling in fast';
    if (!isNum(f.oi_7d_change) || !isNum(f.oi_7d_mean_365d) || !(isNum(f.oi_7d_sd_365d) && f.oi_7d_sd_365d > 0)) oiRow = sig('leverage_oi', title, 'Open-interest change unavailable.', false, true);
    else { const ch = f.oi_7d_change, m = oc.warning_above_sd ?? 2.0, upper = f.oi_7d_mean_365d + m * f.oi_7d_sd_365d, lower = f.oi_7d_mean_365d - m * f.oi_7d_sd_365d;
      const warning = ch > upper, flush = !warning && ch < lower;
      let d = `7-day open-interest change ${pct(ch)}.`;
      if (isNum(f.futures_oi_usd) && f.futures_oi_usd > 0) d += ` Futures open interest ${usdBillions(f.futures_oi_usd)}.`;
      d += warning ? ` Above the +${signed(m)}sd band at ${pct(upper)}.` : flush ? ' Leverage flush. Often a local low, next to the buy-the-dip flag. Not a warning.' : ch < 0 ? ' Open interest is falling.' : ` Not above the +${signed(m)}sd band.`;
      oiRow = sig('leverage_oi', title, d, warning, false, false); } }
  // ratio
  const lr = rules.futures_lev_ratio || {};
  let ratioRow;
  { const title = lr.label || 'Leverage vs market size';
    if (!isNum(f.futures_lev_ratio)) ratioRow = sig('leverage_ratio', title, 'Futures leverage ratio unavailable.', false, true);
    else { const r = f.futures_lev_ratio, warnAt = (lr.warning || {}).at_or_above ?? 0.04, riseLine = (lr.watch || {}).rise_30d_pp ?? 0.5;
      const change = isNum(f.lev_change_30d_pp) ? f.lev_change_30d_pp : null, rise = isNum(f.lev_rise_from_1y_low_pp) ? f.lev_rise_from_1y_low_pp : null;
      const warning = r >= warnAt, watch = !warning && (change ?? -Infinity) >= riseLine && (rise ?? -Infinity) >= riseLine;
      let d = `Futures leverage ratio ${pct(r)}.`;
      if (isNum(f.global_lev_ratio)) d += ` Global ${pct(f.global_lev_ratio)}.`;
      if (rise != null) d += ` ${signed(rise)}pp above the trailing 1-year low.`;
      if (change != null) d += ` 30-day change ${signed(change)}pp.`;
      if (warning) d += ` At the ${pct(warnAt)} warning line.`; else if (watch) d += ` Up at least ${signed(riseLine)}pp from the 1-year low over 30 days.`;
      ratioRow = sig('leverage_ratio', title, d, warning, false, watch); } }
  const parts = [zRow, costRow, oiRow, ratioRow];
  const warnCount = parts.filter(p => p.warning).length;
  const hot = warnCount >= 2 || (zRow.warning && oiRow.warning);
  const elevated = parts.some(p => p.warning || p.watch);
  const name = hot ? 'hot' : elevated ? 'building' : 'calm';
  const oiFalling = (f.oi_7d_change || 0) < 0;
  const bits = [];
  if (isNum(f.futures_lev_ratio)) bits.push(`Leverage ratio ${pct(f.futures_lev_ratio)}`);
  if (isNum(f.funding_annualised)) bits.push(`funding ${pctPerYear(f.funding_annualised)}`);
  if (isNum(f.funding_z)) bits.push(`z ${signed(f.funding_z)}`);
  const tail = name === 'hot' ? 'hot' : name === 'building' ? 'building' : oiFalling ? 'deleveraging, not building' : 'not building';
  const phrase = bits.length ? bits.join(' · ') + ' — ' + tail : tail[0].toUpperCase() + tail.slice(1);
  return [sig('leverage', `Leverage: ${name}`, phrase, hot, false, !hot && elevated), zRow, costRow, oiRow, ratioRow];
}

// ---------- support floors (SupportFloors.swift) ----------
function floorsSnapshot(json) {
  if (!json || !json.floors || !json.floors.length) return { hasFeed: false, floors: [], priceHistory: [], bearLows: [] };
  const h = json.history || {}, t = h.t || [];
  const column = key => { const col = h[key]; if (!col) return []; const out = []; for (let i = 0; i < col.length && i < t.length; i++) if (col[i] > 0) out.push({ t: t[i] > 1e12 ? t[i] / 1000 : t[i], v: col[i] }); return out; };
  const floors = json.floors.filter(f => !HIDDEN_FLOOR_IDS.has(f.id)).map(f => {
    const ok = f.available ?? (f.value != null);
    return { id: f.id, short: f.short || f.id.toUpperCase(), title: f.title || f.short || f.id, plain: f.plain || '', value: ok ? f.value : null, change7dPct: ok ? f.change_7d_pct : null, history: column(f.id), seriesID: FLOOR_ID[f.id] || null,
      get label() { return this.plain ? `${this.short}: ${this.plain}` : this.short; } };
  });
  const watch = (typeof state !== 'undefined' && state.feeds) ? state.feeds['bull_watch.json'] : null;
  const mriFloor = (id, title, block) => {
    const ok = !!(block && block.available !== false && isNum(block.value) && block.value > 0);
    const history = tv(block && block.history);
    const q = id.replace(/^mri_q/, '');
    return { id, short: 'MRI Q' + q, title, plain: 'price versus its history', value: ok ? block.value : null, change7dPct: null, history, seriesID: FLOOR_ID[id] || null,
      get label() { return this.title; } };
  };
  if (watch) {
    const keys = Object.keys(watch).filter(k => /^mri_q\d+$/.test(k)).sort((a, b) => parseInt(a.slice(5), 10) - parseInt(b.slice(5), 10));
    for (const key of keys) {
      const q = key.slice(5);
      const short = q === '50' ? 'Check MRI Q50 (midpoint)' : `Check MRI Q${q}`;
      const f = mriFloor(key, short, watch[key]);
      if (f.value != null || f.history.length) floors.push(f);
    }
  }
  const nearestHist = (pts, t) => {
    if (!pts || !pts.length || t == null) return null;
    let best = null, bestAbs = Infinity;
    for (const p of pts) { const d = Math.abs(p.t - t); if (d < bestAbs) { bestAbs = d; best = p; } }
    return (best && bestAbs <= 8 * DAY) ? best.v : null;
  };
  const bearLows = (json.bear_lows || []).map(l => {
    const date = l.t != null ? l.t : isoToUnix(l.date);
    if (date == null || !(l.price > 0)) return null;
    const ratios = {}; for (const [k, v] of Object.entries(l.price_to_floor || {})) if (v != null && !HIDDEN_FLOOR_IDS.has(k)) ratios[k] = v;
    for (const f of floors) {
      if (ratios[f.id] != null) continue;
      const v = nearestHist(f.history, date);
      if (v > 0) ratios[f.id] = l.price / v;
    }
    return { id: l.id, label: l.label || l.id, t: date, price: l.price, priceToFloor: ratios };
  }).filter(Boolean);
  return { hasFeed: floors.some(f => f.value != null), asOfLabel: json.as_of, floors, priceHistory: column('price'), bearLows,
    floor(id) { return floors.find(f => f.id === id); },
    get highToLow() { return [...floors].sort((a, b) => (b.value ?? -1) - (a.value ?? -1)); } };
}

// ---------- price data ----------
async function loadMaster() {
  const ph = state.feeds['price_history.json'];
  if (!ph || !ph.t) throw new Error('price history unavailable');
  const bars = [];
  for (let i = 0; i < ph.t.length; i++) if (ph.c[i] > 0) bars.push({ t: ph.t[i], c: ph.c[i], v: ph.v ? ph.v[i] : null });
  let note = `Daily history: ${ph.count || bars.length} days through ${ph.last || ''} (Yahoo BTC-USD over CoinMetrics)`;
  // Recent days (finished + in-progress UTC day) from Coinbase daily candles. No volume: the
  // strip only shows the published Yahoo volume on daily ranges (never mixed sources).
  const last = bars.length ? bars[bars.length - 1].t : 0;
  const now = Math.floor(Date.now() / 1000);
  try {
    const start = Math.max(last + DAY, now - 290 * DAY);
    if (start <= now) {
      const cb = await fetchCandles(DAY, start, now + 60);
      let added = 0;
      for (const b of cb) if (b.t > last) { bars.push({ t: b.t, c: b.c, v: null }); added++; }
      if (added) note += ` + ${added} day${added > 1 ? 's' : ''} live from Coinbase`;
    }
  } catch (e) { note += ' (Coinbase recent days unavailable)'; }
  state.master = bars;
  state.masterNote = note + '.';
}
async function loadSpot() {
  try {
    const tk = await fetchJSON(`${CB}/ticker`, 8000);
    const p = parseFloat(tk.price);
    if (p > 0) { state.spot = p; state.spotAt = Date.now() / 1000; state.liveAt = Date.now(); state.liveErr = null; applySpotToMaster(); return; }
  } catch (e) { /* fall through */ }
  if (state.master && state.master.length) { state.spot = state.master[state.master.length - 1].c; state.spotAt = Date.now() / 1000; state.spotFallback = true; }
}

async function fetchDisplayBars(range) {
  const cfg = INTRADAY[range];
  const now = Math.floor(Date.now() / 1000);
  let bars = await fetchCandles(cfg.gran, now - cfg.seconds, now + 60);
  if (cfg.clipMin && bars.length) { const lastT = bars[bars.length - 1].t; bars = bars.filter(b => b.t >= lastT - cfg.clipMin * 60); }
  if (!bars.length) throw new Error('no intraday bars');
  return bars;
}

// ---------- bundle (ChartOverlayService.buildBundle) ----------
function dailyDisplayStart(range) {
  const now = new Date();
  if (range === '5Y' || range === '10Y') return Math.floor(now.getTime() / 1000) - DISPLAY_DAYS[range] * DAY;
  const d = new Date(now);
  if (range === '3M') d.setMonth(d.getMonth() - 3);
  else if (range === '6M') d.setMonth(d.getMonth() - 6);
  else if (range === '1Y') d.setFullYear(d.getFullYear() - 1);
  else if (range === '2Y') d.setFullYear(d.getFullYear() - 2);
  return Math.floor(d.getTime() / 1000);
}

function zoneExtents(id) {
  if (id === 'buyerCushion') {
    const b = (cushionFeed() || {}).band || {};
    const lo = isNum(b.low) ? b.low : CUSHION_LO;
    const hi = isNum(b.high) ? b.high : CUSHION_HI;
    return [Math.min(lo, hi), Math.max(lo, hi)];
  }
  if (id === 'liquidationMagnet') return magnetBand();
  return null;
}

function buildBundle(range, displayBars) {
  const notes = [];
  const master = state.master || [];
  const closes = master.map(b => b.c);
  const wma50R = rollingSMA(closes, 350), wma200R = rollingSMA(closes, 1400), dma200R = rollingSMA(closes, 200);
  const intraday = isIntraday(range);
  displayBars = intraday ? (displayBars || []) : [];

  let spotPts;
  if (intraday) spotPts = displayBars.map(b => ({ t: b.t, v: b.c }));
  else {
    const startCut = dailyDisplayStart(range);
    spotPts = master.filter(b => b.t >= startCut - DAY / 2).map(b => ({ t: b.t, v: b.c }));
  }
  const series = {};
  const put = (id, pts) => { series[id] = { id, points: pts, available: pts.length > 0 }; };
  put('spot', spotPts);
  const clipStart = spotPts.length ? spotPts[0].t : 0;
  const clip = (pts) => intraday ? alignToBars(pts, displayBars) : pts.filter(p => p.t >= clipStart);
  const maSeries = (id, rolling) => {
    const daily = [];
    for (let i = 0; i < master.length; i++) if (rolling[i] != null) daily.push({ t: master[i].t, v: rolling[i] });
    put(id, intraday ? alignToBars(daily, displayBars) : daily.filter(p => p.t >= clipStart));
  };
  maSeries('wma50', wma50R); maSeries('wma200', wma200R); maSeries('dma200', dma200R);

  const levels = state.feeds['bull_levels.json'], watch = state.feeds['bull_watch.json'];
  const bull = chartAnchors(levels, watch);
  const invPrint = lastWeeklyCloseUnder(72000);
  if (chartSpot() != null && chartSpot() < 72000 && invPrint) {
    notes.push(`Weekly close under $72k already printed ${fmtUTCDate(invPrint.t)} at ${usd(invPrint.c)}. The $72k thesis line is now overhead.`);
  }
  if (!series.wma200.available) notes.push('200 WMA unavailable — need ~1400 daily closes.');

  const oc = state.feeds['checkonchain_overlays.json'];
  const sth = oc ? tv(oc.sth_cost_basis) : [], tm = oc ? tv(oc.true_mean) : [];
  put('sthCostBasis', sth.length ? clip(sth) : []);
  put('trueMean', tm.length ? clip(tm) : []);

  // Gold / silver: daily COMEX futures. Align to BTC bars (hold the last official close;
  // never invent an intraday metals print). Yahoo blocks browser CORS, so this is the feed.
  const metals = state.feeds['metals_history.json'];
  const metalCol = (col) => {
    if (!metals || !Array.isArray(metals.t) || !Array.isArray(metals[col])) return [];
    const out = [];
    for (let i = 0; i < metals.t.length; i++) if (isNum(metals[col][i]) && metals[col][i] > 0) out.push({ t: metals.t[i], v: metals[col][i] });
    return out;
  };
  const goldDaily = metalCol('gold_v'), silverDaily = metalCol('silver_v');
  put('gold', goldDaily.length && spotPts.length ? alignToBars(goldDaily, spotPts) : []);
  put('silver', silverDaily.length && spotPts.length ? alignToBars(silverDaily, spotPts) : []);
  if (goldDaily.length || silverDaily.length) {
    notes.push(`Gold and silver are COMEX futures closes (Yahoo GC=F and SI=F), USD per troy ounce, not London spot.${metals && metals.as_of ? ` Daily history through ${metals.as_of}.` : ''} Each line has its own axis when it is on. Off until you turn them on in the legend.`);
  }

  // Bull overlays (appendBullOverlays). Flat thesis lines still start at the May 2026 peak date.
  const lineDates = spotPts.map(p => p.t).filter(t => t >= CONFIG.weeklyConfirmVisibleFrom);
  const flat = (id, value) => { if (!(value > 0) || !lineDates.length) return put(id, []); put(id, lineDates.map(t => ({ t, v: value }))); };
  const curve = (id, history, fallback) => { const daily = tv(history); if (daily.length) return put(id, clip(daily)); flat(id, fallback); };
  const marker = (id, value, asOf, maxAgeDays) => {
    if (!(value > 0) || asOf == null || !lineDates.length) return put(id, []);
    const first = lineDates[0], last = lineDates[lineDates.length - 1];
    const tooOld = maxAgeDays != null && (Date.now() / 1000 - asOf) / DAY > maxAgeDays;
    const visible = asOf >= localStartOfDay(first) && asOf <= last + DAY;
    put(id, !tooOld && visible ? [{ t: asOf, v: value }] : []);
  };
  datedLabels.checkQ50 = null; datedLabels.checkQ75 = null;
  flat('bullInvalidation', bull.weeklyInvalidation);
  flat('recoveryGate', bull.recoveryGate);
  flat('valuationTop', bull.valuationTop);
  put('mayer15', series.dma200.points.map(p => ({ t: p.t, v: p.v * bull.mayerMultiple })));
  notes.push('Check MRI Q5–Q95 (every band Check publishes on the Mean Reversion Index chart, including Q50 as the midpoint) update daily. MRI bands measure how stretched price is versus its history. Thesis lines ($72k, $100k gate, $150k top) stay flat. Off until you turn them on in the legend.');

  // Support floors
  const floors = floorsSnapshot(state.feeds['support_floors.json']);
  for (const [key, id] of Object.entries(FLOOR_ID)) {
    if (key === 'tmm') continue; // True Mean is already on this chart from checkonchain_overlays.json
    const f = floors.floor && floors.floor(key);
    if (!f || f.value == null || !f.history.length) { put(id, []); continue; }
    put(id, clip(f.history));
  }
  if (!(series.checkMriQ50 && series.checkMriQ50.available) && bull.mriMidpoint) {
    curve('checkMriQ50', bull.mriHistory, bull.mriMidpoint);
  }
  if (floors.hasFeed) notes.push(`Support floors${floors.asOfLabel ? ` (as of ${floors.asOfLabel})` : ''}: realized price and LTH cost basis (Bitview) and True Market Mean (CheckOnChain) are cost-based zones, updated daily. Check MRI Q bands are Mean Reversion Index bands (how stretched price is versus its history), distinct from those cost-basis lines. Off until you turn them on in the legend. Not sell triggers. TMM also lives on this chart as True Mean.`);


  const hasOnChain = sth.length > 0 && tm.length > 0;
  notes.push(hasOnChain ? `STH / True Mean: CheckOnChain via the public feed${oc.as_of ? ` (as of ${oc.as_of})` : ''}.` : 'STH / True Mean: connect CheckOnChain series (see DATA-SOURCES §3e)');

  // Volume: Coinbase on intraday ranges, published Yahoo daily volume on 3M–10Y.
  const clipEnd = spotPts.length ? spotPts[spotPts.length - 1].t : Infinity;
  let volumePoints = [];
  const src = intraday ? displayBars : master;
  for (const b of src) { if (!(b.v > 0) || b.t < clipStart || b.t > clipEnd) continue; volumePoints.push({ t: b.t, v: b.v, c: b.c }); }
  if (!volumePoints.length) notes.push('Volume strip hidden — volume unavailable for this range.');
  if (!intraday && state.masterNote) notes.push(state.masterNote);

  const sourceLabel = (intraday ? 'Coinbase BTC-USD' : 'Yahoo BTC-USD daily') + (hasOnChain ? ' · CheckOnChain' : '');
  return { range, series, volumePoints, notes, asOf: Date.now() / 1000, sourceLabel, floors };
}

// ---------- volume aggregation (ChartViewModel) ----------
function volumePolicy(range) {
  switch (range) {
    case '1H': case '1D': case '1W': case '3M': return { kind: 'none' };
    case '1M': return { kind: 'hours', n: 4 };
    case '6M': return { kind: 'fixed', seconds: 2 * DAY };
    case '1Y': case '2Y': return { kind: 'week' };
    case '5Y': return { kind: 'fixed', seconds: 14 * DAY };
    case '10Y': return { kind: 'month' };
  }
  return { kind: 'none' };
}
function aggregateVolume(raw, range) {
  const pol = volumePolicy(range);
  let buckets;
  if (pol.kind === 'none') buckets = [...raw].sort((a, b) => a.t - b.t);
  else {
    const map = new Map();
    const origin = raw.length ? Math.min(...raw.map(p => p.t)) : 0;
    const originDay = Math.floor(origin / DAY) * DAY;
    for (const p of raw) {
      let start;
      const d = new Date(p.t * 1000);
      if (pol.kind === 'hours') { d.setMinutes(0, 0, 0); d.setHours(Math.floor(d.getHours() / pol.n) * pol.n); start = d.getTime() / 1000; }
      else if (pol.kind === 'week') { const day = Math.floor(p.t / DAY) * DAY; const dow = new Date(day * 1000).getUTCDay(); start = day - dow * DAY; }
      else if (pol.kind === 'month') { start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000; }
      else { start = originDay + Math.floor((p.t - originDay) / pol.seconds) * pol.seconds; }
      const acc = map.get(start) || { t: start, v: 0, c: 0, last: -Infinity };
      acc.v += p.v; if (p.t >= acc.last) { acc.last = p.t; acc.c = p.c; }
      map.set(start, acc);
    }
    buckets = [...map.values()].sort((a, b) => a.t - b.t);
  }
  let prev = null;
  return buckets.map(b => { const up = prev == null ? null : b.c > prev ? true : b.c < prev ? false : null; prev = b.c; return { t: b.t, v: b.v, c: b.c, up }; });
}

// ---------- chart model (ChartViewModel) ----------
function visibleSeries() {
  const b = state.bundle; if (!b) return [];
  return SERIES.map(s => b.series[s.id]).filter(s => s && s.available && state.enabled.has(s.id));
}
function yScaleDomain() {
  const vis = visibleSeries();
  const spot = vis.find(s => s.id === 'spot');
  let rawMin, rawMax;
  if (spot && spot.points.length) {
    let lo = Infinity, hi = -Infinity;
    for (const p of spot.points) { if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; }
    const sLo = lo, sHi = hi, span = hi - lo, mid = (hi + lo) / 2;
    const leash = Math.max(span * 1.25, mid * 0.02);
    const leashLo = sLo - leash, leashHi = sHi + leash;
    for (const s of vis) {
      if (s.id === 'spot' || isMetal(s.id)) continue;
      const always = isSupportFloor(s.id);
      for (const p of s.points) { if (!always && (p.v < leashLo || p.v > leashHi)) continue; if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; }
    }
    rawMin = lo; rawMax = hi;
  } else {
    const vals = vis.filter(s => !isMetal(s.id)).flatMap(s => s.points.map(p => p.v));
    if (!vals.length) return null;
    rawMin = Math.min(...vals); rawMax = Math.max(...vals);
  }
  let lo = rawMin, hi = rawMax;
  if (hi <= lo) { const pad = Math.max(Math.abs(lo) * 0.01, 50); lo -= pad; hi += pad; }
  else { const pad = Math.max((hi - lo) * 0.05, 50); lo -= pad; hi += pad; }
  if (lo < 0 && rawMin >= 0) lo = 0;
  return [lo, hi];
}
function plottableSeries(domain) {
  const vis = visibleSeries();
  if (!domain) return vis;
  return vis.filter(s => {
    if (isMetal(s.id)) return true;
    let lo = Infinity, hi = -Infinity;
    for (const p of s.points) { if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; }
    return hi >= domain[0] && lo <= domain[1];
  });
}
function xDomain() {
  const b = state.bundle; if (!b) return null;
  const pts = b.series.spot.points;
  if (!pts.length) return null;
  const lo = pts[0].t, hi = pts[pts.length - 1].t;
  return lo === hi ? [lo - 3600, hi + 3600] : [lo, hi];
}
function inspectionValues(t) {
  const b = state.bundle; const out = {};
  if (!b) return out;
  for (const s of SERIES) {
    const ser = b.series[s.id];
    if (!ser || !ser.available) continue;
    const i = nearestIdx(ser.points, t); if (i < 0) continue;
    const p = ser.points[i];
    if (isMarker(s.id) && Math.abs(p.t - t) > 3 * DAY) continue;
    out[s.id] = p.v;
  }
  return out;
}
function legendRows() {
  const b = state.bundle;
  const insp = state.sel != null ? inspectionValues(state.sel) : null;
  const valueFor = id => {
    if (insp) return insp[id] ?? null;
    const s = b && b.series[id];
    if (isZoneSeries(id)) {
      const ext = zoneExtents(id);
      return (s && s.available && ext) ? ext[1] : null;
    }
    return s && s.available && s.points.length ? s.points[s.points.length - 1].v : null;
  };
  const ids = SERIES.map(s => s.id).filter(id => id !== 'floorTmm');
  const rows = ids.map(id => ({ id, value: valueFor(id), available: !!(b && b.series[id] && b.series[id].available) }));
  const cmp = (a, b2) => legendTitle(a.id).localeCompare(legendTitle(b2.id), undefined, { numeric: true });
  const byPrice = (a, b2) => {
    if (a.value != null && b2.value != null) return a.value !== b2.value ? b2.value - a.value : cmp(a, b2);
    if (a.value != null) return -1; if (b2.value != null) return 1; return cmp(a, b2);
  };
  const isOn = r => state.enabled.has(r.id) && r.available;
  // Metals sit after BTC-priced lines: sorting them by raw USD would pin them at the bottom in a misleading way.
  const grp = (pred) => {
    const btc = rows.filter(r => pred(r) && !isMetal(r.id)).sort(byPrice);
    const metals = rows.filter(r => pred(r) && isMetal(r.id)).sort(byPrice);
    return btc.concat(metals);
  };
  return { on: grp(isOn), off: grp(r => !isOn(r)) };
}
function toggleSeries(id) {
  if (state.enabled.has(id)) { if (id === 'spot') return; state.enabled.delete(id); }
  else { const s = state.bundle && state.bundle.series[id]; if (!s || !s.available) return; state.enabled.add(id); }
  persistEnabled(id);
  state.sel = null;
  renderChart();
}

// ---------- so-what banner + levels (DashboardViewModel) ----------
function snapshot() {
  if (!state.master || !state.master.length || state.spot == null) return null;
  const closes = state.master.map(b => b.c);
  if (closes.length < 350) return { spot: state.spot, wma50: null, wma200: null, source: 'mock', asOf: state.spotAt };
  const wma50 = closes.slice(-350).reduce((a, b) => a + b, 0) / 350;
  const wma200 = closes.length >= 1400 ? closes.slice(-1400).reduce((a, b) => a + b, 0) / 1400 : null;
  return { spot: state.spot, wma50, wma200, source: 'live', asOf: state.spotAt };
}

/** Thousands label: 67906 → $67.9k, 59500 → $59.5k, 70000 → $70k */
function fmtK(v) {
  if (!isNum(v)) return 'n/a';
  const k = v / 1000;
  const body = Math.abs(k - Math.round(k)) < 0.05 ? String(Math.round(k)) : fx(k, 1);
  return '$' + body + 'k';
}

function bannerRangeText(low, high) {
  const a = fmtK(low), b = fmtK(high);
  // "$59.5k" + "$62.2k" → "$59.5–62.2k"
  if (a.endsWith('k') && b.endsWith('k') && a.charAt(0) === '$' && b.charAt(0) === '$') {
    return a.slice(0, -1) + '–' + b.slice(1);
  }
  return a + '–' + b;
}

const HIDDEN_LEVEL_IDS = new Set(['bears_last_stand', 'buyer_cushion', 'liquidation_cluster', 'q15', 'q25', 'q20', 'q10', 'q5']);
const isHiddenLevel = L => !L || HIDDEN_LEVEL_IDS.has(L.id) || L.type === 'liquidation_cluster';
const DEFAULT_BANNER_LEVELS = [
  { id: 'recovery_gate', label: '$100k recovery to excitement', support_label: '$100k recovery gate', overhead_label: '$100k recovery gate, overhead', testing_label: '$100k recovery gate (testing)', price: 100000, kind: 'level', type: 'level', badge: 'thesis line', in_banner: false, in_daily: true, note_support: 'Thesis line: recovery-to-excitement gate.', note_overhead: 'Thesis line: $100k recovery-to-excitement gate, now overhead.' },
  { id: 'valuation_top', label: 'Valuation-range top', support_label: 'Valuation-range top', overhead_label: 'Valuation-range top, overhead', testing_label: 'Valuation-range top (testing)', price: 150000, kind: 'level', type: 'level', badge: 'thesis line', in_banner: false, in_daily: true, note_support: 'Thesis line: Check valuation-range top. First large long-term-holder distribution zone.', note_overhead: 'Thesis line: Check valuation-range top, now overhead.' },
  { id: '72k', label: '$72k', support_label: 'Weekly invalidation ($72k)', overhead_label: '$72k, resistance to reclaim', price: 72000, kind: 'level', type: 'level', badge: 'thesis line', in_banner: true, in_daily: true, note_support: 'Thesis line: a weekly close under $72k is the soft invalidation.', note_overhead: 'Thesis line: $72k weekly invalidation, now overhead. Resistance to reclaim.' },
  { id: '70k', label: '$70k', support_label: '$70k', overhead_label: '$70k, resistance to reclaim', price: 70000, kind: 'level', type: 'level', badge: 'thesis line', in_banner: true, in_daily: true, note_support: 'Thesis line: confluence near $70k. The bull card carries the weekly-close line at $72k.', note_overhead: 'Thesis line: $70k is overhead. Resistance to reclaim.' },
  { id: 'wma200', label: '200-week average', support_label: '200-week average (live)', overhead_label: '200-week average (live), overhead', testing_label: '200-week average (live, testing)', kind: 'average', type: 'level', live: 'wma200', badge: 'live', in_banner: true, in_daily: true, note_support: 'Live 200-week average from ~1,400 daily closes.', note_overhead: 'Live 200-week average from ~1,400 daily closes. Now overhead. Resistance to reclaim.' },
  { id: 'wma50', label: '50-week average', support_label: '50-week average (live)', overhead_label: '50-week average (live), overhead', testing_label: '50-week average (live, testing)', kind: 'average', type: 'level', live: 'wma50', badge: 'live', in_banner: false, in_daily: true, note_support: 'Live 50-week average from ~350 daily closes.', note_overhead: 'Live 50-week average from ~350 daily closes. Now overhead.' },
  { id: 'june_30_low', label: 'June 30 low', support_label: 'June 30 low', overhead_label: 'June 30 low, resistance to reclaim', price: 58367, kind: 'level', type: 'level', date: '2026-06-30', badge: 'history', in_banner: true, in_daily: true, note_support: 'June 30, 2026 low at $58,367 (event series). price_history daily close that day was $58,558.86; that file has no lows.', note_overhead: 'The June 30, 2026 low at $58,367 is overhead. Resistance to reclaim.' },
  { id: 'realized', label: 'Realized price', support_label: 'Realized price', overhead_label: 'Realized price, overhead', testing_label: 'Realized price (testing)', kind: 'level', type: 'level', live: 'realized', badge: 'live', in_banner: true, in_daily: true, note_support: 'Live realized price from the same Bitview / Check overlays as the chart: the average cost of every coin.', note_overhead: 'Live realized price from the same Bitview / Check overlays as the chart. Now overhead.' },
];

const MAGNET_NEAR_PCT = 0.15; // mention a cluster below spot when its top edge is within 15% of price

const isMagnetLevel = L => L && (L.type === 'liquidation_cluster' || L.id === 'liquidation_cluster');

function floorLivePrint(id) {
  const snap = floorsSnapshot(state.feeds['support_floors.json']);
  const f = snap.floor ? snap.floor(id) : null;
  if (f && isNum(f.value)) return { value: f.value, asOf: snap.asOfLabel || null, stale: false };
  const last = f && f.history && f.history.length ? f.history[f.history.length - 1] : null;
  if (last && isNum(last.v)) {
    const when = last.t ? new Date(last.t * 1000).toISOString().slice(0, 10) : (snap.asOfLabel || null);
    return { value: last.v, asOf: when, stale: true };
  }
  return null;
}

function resolveLevelPrice(item, snap) {
  if (item.live === 'wma200') return snap && isNum(snap.wma200) ? { value: snap.wma200, source: snap.source === 'live' ? 'live' : 'mock', stale: false } : null;
  if (item.live === 'wma50') {
    if (snap && isNum(snap.wma50)) return { value: snap.wma50, source: snap.source === 'live' ? 'live' : 'mock', stale: false };
    if (isNum(CONFIG.mock50WMA)) return { value: CONFIG.mock50WMA, source: 'mock', stale: false };
    return null;
  }
  if (item.live === 'q15' || item.live === 'realized') {
    const p = floorLivePrint(item.live);
    if (!p) return null;
    return { value: p.value, source: p.stale ? 'latest' : 'live', stale: p.stale, asOf: p.asOf };
  }
  if (isNum(item.price)) return { value: item.price, source: item.badge || 'thesis line', stale: false };
  return null;
}

function bannerLevelDisplay(L) {
  if (isMagnetLevel(L)) return `liquidation magnet ${bannerRangeText(L.low, L.high)}`;
  if (L.id === 'buyer_cushion') return `the buyer cushion ${bannerRangeText(L.low, L.high)}`;
  if (L.id === 'wma200') return `the 200-week average (~${fmtK(L.low)})`;
  if (L.id === 'q15') return `Q15 band ~${fmtK(L.low)}`;
  if (L.id === 'realized') return `realized price (~${fmtK(L.low)})`;
  if (L.id === 'june_30_low') return `the June 30 low ${usd(L.low)}`;
  if (L.id === 'bears_last_stand') return `Bears' Last Stand at ${usd(L.low)}`;
  if (L.id === '70k' || L.id === '72k') return fmtK(L.low);
  return L.label || usd(L.low);
}

function bannerLevelSet(snap) {
  const file = state.feeds['banner_levels.json'] || {};
  const raw = Array.isArray(file.levels) && file.levels.length ? file.levels : DEFAULT_BANNER_LEVELS;
  const items = [];
  for (const L of raw) {
    if (isHiddenLevel(L) || L.in_banner === false) continue;
    const type = L.type || (isMagnetLevel(L) ? 'liquidation_cluster' : 'level');
    if ((isMagnetLevel(L) || L.kind === 'zone') && isNum(L.low) && isNum(L.high)) {
      const lo = Math.min(L.low, L.high), hi = Math.max(L.low, L.high);
      items.push({ id: L.id, kind: 'zone', type, low: lo, high: hi, label: L.label });
      continue;
    }
    const resolved = resolveLevelPrice(L, snap);
    if (!resolved) continue;
    const kind = L.kind === 'average' ? 'average' : 'level';
    items.push({ id: L.id, kind, type, low: resolved.value, high: resolved.value, label: L.label, date: L.date, live: !!L.live });
  }
  return items.map(x => ({ ...x, display: bannerLevelDisplay(x) }));
}

function magnetClause(px, magnets) {
  if (!isNum(px) || !magnets.length) return null;
  const inside = magnets.find(M => px >= M.low && px <= M.high);
  if (inside) return { kind: 'inside', text: `Inside the liquidation magnet zone ${bannerRangeText(inside.low, inside.high)}.` };
  const below = magnets.filter(M => M.high < px).sort((a, b) => b.high - a.high)[0];
  if (below && (px - below.high) / px <= MAGNET_NEAR_PCT) {
    return { kind: 'below', text: `Liquidation magnet at ${bannerRangeText(below.low, below.high)} could pull price lower if it nears ${fmtK(below.high)}.` };
  }
  const above = magnets.filter(M => M.low > px).sort((a, b) => a.low - b.low)[0];
  if (above) return { kind: 'above', text: `Liquidation magnet ${bannerRangeText(above.low, above.high)} is overhead.` };
  return null;
}

const withMagnet = (msg, clause) => clause ? msg.replace(/\s*$/, '') + ' ' + clause.text : msg;

/**
 * Banner support line is always from live price. Nearest real level below
 * price is support; nearest real level above (a former support) is resistance
 * to reclaim. Liquidation clusters are magnets, never support or resistance.
 */
function soWhat() {
  const snap = snapshot();
  if (!snap || snap.source !== 'live' || !isNum(snap.spot)) return { tone: 'muted', msg: 'Waiting on live price…' };
  const px = snap.spot;
  const levels = bannerLevelSet(snap);
  if (!levels.length) return { tone: 'muted', msg: 'Support levels unavailable.' };

  const magnets = levels.filter(isMagnetLevel);
  const real = levels.filter(L => !isMagnetLevel(L));
  const clause = magnetClause(px, magnets);

  const testing = real.filter(L => px >= L.low && px <= L.high)
    .sort((a, b) => (a.id === 'buyer_cushion' ? -1 : b.id === 'buyer_cushion' ? 1 : (b.high - b.low) - (a.high - a.low)));
  const supports = real.filter(L => L.high < px).sort((a, b) => b.high - a.high);
  const resistance = real.filter(L => L.low > px).sort((a, b) => a.low - b.low);
  const belowOf = (anchor) => {
    if (!anchor) return supports;
    const cut = anchor.kind === 'zone' ? anchor.low : anchor.high;
    return supports.filter(s => s.id !== anchor.id && s.high < cut);
  };
  const nearestSup = supports[0] || null;
  const nextAfter = (first) => (belowOf(first)[0] || null);
  const nextSup = nextAfter(nearestSup);
  const nearestRes = resistance[0] || null;
  const tone = (clause && clause.kind !== 'above') || (nearestRes && nearestRes.id === 'wma200') ? 'warning' : (supports.length && !resistance.length ? 'accent' : 'warning');

  if (clause && clause.kind === 'inside' && !testing.length) {
    let msg = clause.text;
    if (nearestSup) {
      msg += ` Nearest support: ${nearestSup.display}`;
      const nxt = nextAfter(nearestSup);
      if (nxt) msg += `, then ${nxt.display}`;
      msg += '.';
    }
    if (nearestRes) msg += ` Nearest resistance to reclaim: ${nearestRes.display}.`;
    if (!nearestSup && !nearestRes) msg += ' No listed support below, and no listed resistance above.';
    return { tone: 'warning', msg };
  }

  if (testing.length) {
    const z = testing[0];
    let msg = z.id === 'buyer_cushion' ? `Inside ${z.display}.` : `Testing ${z.display}.`;
    if (nearestRes) msg += ` Nearest resistance to reclaim: ${nearestRes.display}.`;
    const nxt = nextAfter(z);
    if (nxt) msg += ` Next support: ${nxt.display}.`;
    else if (!nearestRes) msg += ' No listed support below, and no listed resistance above.';
    return { tone, msg: withMagnet(msg, clause) };
  }

  if (!supports.length && resistance.length) {
    return { tone: 'warning', msg: withMagnet(`Below all listed levels. Nearest resistance to reclaim: ${nearestRes.display}.`, clause) };
  }

  if (supports.length && !resistance.length) {
    let msg = `Holding above ${nearestSup.display}. Nearest support: ${nearestSup.display}`;
    if (nextSup) msg += `, then ${nextSup.display}`;
    msg += '.';
    return { tone: 'accent', msg: withMagnet(msg, clause) };
  }

  let msg = `Below ${nearestRes.display}, now resistance to reclaim. Nearest support: ${nearestSup.display}`;
  if (nextSup) msg += `, then ${nextSup.display}`;
  msg += '.';
  return { tone, msg: withMagnet(msg, clause) };
}
const WAITING_BULL = { hasFeed: false, supports: [], overhead: [], signals: [], moveFragile: 80, moveStress: 100, moveRecession: 135, value: () => null, anyWarning: false };
function currentBull() { return state.bull || WAITING_BULL; }
function levelRelation(lo, hi, spot) {
  if (!isNum(spot) || !isNum(lo)) return 'unknown';
  const a = lo, b = isNum(hi) ? hi : lo;
  const low = Math.min(a, b), high = Math.max(a, b);
  if (spot < low) return 'overhead';
  if (spot > high) return 'support';
  return 'testing';
}

function dailyTitleFor(L, relation) {
  if (isMagnetLevel(L)) return L.label || `Liquidation magnet ${isNum(L.low) && isNum(L.high) ? bannerRangeText(L.low, L.high) : ''}`.trim();
  if (relation === 'overhead') return L.overhead_label || ((L.support_label || L.label) + ', overhead');
  if (relation === 'testing') return L.testing_label || ((L.support_label || L.label) + ' (testing)');
  return L.support_label || L.label;
}

function dailyNoteFor(L, relation) {
  if (isMagnetLevel(L)) return L.note || L.source || '';
  if (L.id === '72k') {
    const computed = weeklyInvalidationNote(relation);
    if (computed) return computed;
  }
  if (relation === 'overhead') return L.note_overhead || L.note_support || L.source || '';
  if (relation === 'testing') return L.note_testing || L.note_support || L.source || '';
  return L.note_support || L.source || '';
}

function cushionFeed() { return state.feeds['buyer_cushion.json'] || null; }
function cushionAsOfISO(f) {
  const s = (f && (f.as_of || (f.today && f.today.date))) || '';
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : null;
}
function cushionIsStale(f) {
  const asOf = cushionAsOfISO(f);
  if (!asOf) return false;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000;
  const ts = isoToUnix(asOf);
  return ts != null && ts < todayUtc - 2 * DAY;
}
function signedBtc(n) {
  if (!isNum(n)) return null;
  const body = nf0.format(Math.abs(Math.round(n)));
  return (n > 0 ? '+' : n < 0 ? '−' : '') + body;
}
function pctLabel(n) {
  if (!isNum(n)) return null;
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return sign + fx(Math.abs(n), 2) + '%';
}
function cushionStats(f) {
  const t = f && f.today;
  if (!t || !isNum(t.band_btc)) return null;
  const asOf = cushionAsOfISO(f);
  const chg7 = isNum(t.change_7d_btc) ? `${signedBtc(t.change_7d_btc)} BTC` + (isNum(t.change_7d_pct) ? ` (${pctLabel(t.change_7d_pct)})` : '') : null;
  const chgOct = isNum(t.change_since_oct15_btc) ? `${signedBtc(t.change_since_oct15_btc)} BTC` + (isNum(t.change_since_oct15_pct) ? ` (${pctLabel(t.change_since_oct15_pct)})` : '') : null;
  let sub = null;
  if (isNum(t.new_buyers_64_65k)) {
    sub = `new buyers $64–65k  ${nf0.format(Math.round(t.new_buyers_64_65k))} BTC`;
    if (isNum(t.new_buyers_change_7d_btc)) {
      sub += `  ·  7d ${signedBtc(t.new_buyers_change_7d_btc)} BTC`;
      if (isNum(t.new_buyers_change_7d_pct)) sub += ` (${pctLabel(t.new_buyers_change_7d_pct)})`;
    }
  }
  return {
    bandBtc: t.band_btc,
    status: t.status || null,
    chg7, chgOct, sub,
    asOf,
    stale: cushionIsStale(f),
    note: 'Count from $62–64k cost-basis buckets.',
  };
}

function dailyLevelsCatalog() {
  const file = state.feeds['banner_levels.json'] || {};
  const src = Array.isArray(file.levels) && file.levels.length ? file.levels : DEFAULT_BANNER_LEVELS;
  return src.filter(L => !isHiddenLevel(L));
}

function dailyLevels() {
  const snap = snapshot();
  const spot = isNum(state.spot) ? state.spot : (snap && snap.spot);
  const catalog = dailyLevelsCatalog();
  const L = (id, kind, title, price, priceHigh, source, note, extra) => ({ id, kind, title, price, priceHigh, source, note, ...(extra || {}) });
  const rows = [];
  for (const item of catalog) {
    if (item.in_daily === false) continue;
    if (isMagnetLevel(item) && isNum(item.low) && isNum(item.high)) {
      const lo = Math.min(item.low, item.high), hi = Math.max(item.low, item.high);
      rows.push(L(item.id, 'magnet', magnetTitle(item, lo, hi), lo, hi, item.badge || 'zone', dailyNoteFor(item)));
      continue;
    }
    let lo = null, hi = null, source = item.badge || 'thesis line', extraNote = null;
    if (item.live) {
      const resolved = resolveLevelPrice(item, snap);
      if (!resolved) continue;
      lo = resolved.value;
      source = resolved.source === 'latest' ? 'live' : resolved.source;
      if (resolved.stale) {
        extraNote = `Latest available value${resolved.asOf ? ` (as of ${resolved.asOf})` : ''}; the live print was unavailable.`;
      } else if (resolved.asOf && (item.live === 'q15' || item.live === 'realized')) {
        extraNote = null; // keep the catalog note; date is in the feed
      }
    } else if (item.kind === 'zone' && isNum(item.low) && isNum(item.high)) {
      lo = Math.min(item.low, item.high);
      hi = Math.max(item.low, item.high);
    } else if (isNum(item.price)) {
      lo = item.price;
    } else continue;
    const rel = levelRelation(lo, hi, spot);
    const note = extraNote || dailyNoteFor(item, rel);
    rows.push(L(item.id, 'level', dailyTitleFor(item, rel), lo, hi, source, note));
  }
  const cush = cushionStats(cushionFeed());
  if (cush) {
    const row = rows.find(r => r.id === 'buyer_cushion');
    if (row) {
      const rel = levelRelation(row.price, row.priceHigh, spot);
      row.source = rel === 'overhead' ? 'overhead / reclaim' : 'cost-basis zone';
      const bits = [`${nf0.format(Math.round(cush.bandBtc))} BTC`];
      if (cush.status) bits.push(cush.status);
      if (cush.chg7) bits.push(`7d ${cush.chg7}`);
      if (cush.chgOct) bits.push(`since Oct 15 ${cush.chgOct}`);
      row.detail = bits.join('  ·  ');
      row.sub = cush.sub;
      row.status = cush.status;
      const asOfBit = cush.asOf ? ` As of ${shortDateISO(cush.asOf) || cush.asOf}.` : '';
      const staleBit = cush.stale ? ` Data is stale: last update ${shortDateISO(cush.asOf) || cush.asOf}.` : '';
      const countBit = row.note && /Count from/.test(row.note) ? '' : ' Count from $62–64k cost-basis buckets.';
      const magnetBit = rel === 'overhead' ? '' : ' ' + cushionMagnetNote();
      row.note = ((row.note ? row.note : '') + countBit + magnetBit + asOfBit + staleBit).replace(/^ +/, '');
    }
  }
  const w = state.feeds['bull_watch.json'] || {};

  const addLiveBand = (id, labels, value, note) => {
    if (!isNum(value)) return;
    const rel = levelRelation(value, value, spot);
    const title = rel === 'overhead' ? labels.overhead : (rel === 'testing' ? labels.testing : labels.support);
    rows.push(L(id, 'level', title, value, null, 'live', note));
  };
  rows.sort((a, b) => ((b.priceHigh != null ? b.priceHigh : b.price) - (a.priceHigh != null ? a.priceHigh : a.price)));
  rows.push(L('liveSupports', 'note', 'Other live levels', null, null, 'note', 'True Market Mean, short-term holder cost basis, and the 200-day average are live on the bull-market card and on the chart.'));
  rows.push(L('mayer', 'note', 'Mayer Multiple ~1.5×', null, null, 'note', 'Dollar level is on the bull card: the multiple times the live 200-day average. It is not a fixed price.'));
  rows.push(L('hinge2027', 'note', '2027 hinge', null, null, 'note', CONFIG.hinge2027Note));
  return rows;
}

// ---------- DOM helpers ----------
const $ = sel => document.querySelector(sel);
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const card = (inner, cls = '') => `<div class="card ${cls}">${inner}</div>`;
const ICON = {
  warning: '▲', accent: '✓', muted: '◷',
  check: (color) => `<svg class="lcheck" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="${color}"/><path d="M4.6 8.2l2.2 2.2 4.6-4.8" stroke="#111" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  circle: (color) => `<svg class="lcheck" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.6" fill="none" stroke="${color}" stroke-width="1.3"/></svg>`,
};
const bannerHTML = (b) => `<div class="banner tone-${b.tone}"><span class="ico">${ICON[b.tone]}</span><span>${esc(b.msg)}</span></div>`;

// ---------- chart card ----------
const chartCard = h(`<div class="card" id="chartCard">
  <div class="chart-head"><div><h2 style="font-size:20px">BTC Overlay Chart</h2><div class="caption2" id="chartSource"></div></div><div class="live-box" id="liveBox"><div class="live-px" id="livePx"></div><div class="live-slot"></div></div></div>
  <div class="pills" id="pills">${RANGES.map(r => `<button class="pill" data-range="${r}">${r}</button>`).join('')}</div>
  <div class="chart-wrap" id="chartWrap"><div class="chart-price" id="chartPrice"></div><div class="chart-vol" id="chartVol"></div><div class="chart-macro-head" id="chartMacroHead" hidden>Yields & dollar</div><div class="chart-macro" id="chartMacro" hidden></div><div class="chart-msg" id="chartMsg" hidden></div></div>
  <div class="legend" id="macroLegend" hidden></div>
  <div id="chartBanner"></div>
  <div class="legend" id="legend"></div>
  <div class="floor-btn-row" id="floorBtnRow" hidden><button class="floor-btn" id="floorBtn">⟲ Support floors history</button></div>
  <div class="notes" id="chartNotes"></div>
</div>`);
chartCard.querySelector('#pills').addEventListener('click', e => {
  const b = e.target.closest('[data-range]'); if (!b) return;
  if (state.range !== b.dataset.range) { state.range = b.dataset.range; localStorage.setItem('chart.range', state.range); state.sel = null; refreshChart(); }
});
chartCard.querySelector('#legend').addEventListener('click', e => {
  const b = e.target.closest('[data-sid]'); if (!b || b.disabled) return;
  toggleSeries(b.dataset.sid);
});
chartCard.querySelector('#macroLegend').addEventListener('click', e => {
  const b = e.target.closest('[data-mid]'); if (!b || b.disabled) return;
  toggleMacro(b.dataset.mid);
});
chartCard.querySelector('#floorBtn').addEventListener('click', () => openFloorSheet());

let uPrice = null, uVol = null, uMacro = null, chartData = null;
const AXIS_FONT = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
const XAXIS_FONT = '11px -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif';
const measureCtx = document.createElement('canvas').getContext('2d');
function gutterWidth(upper) {
  const padded = upper * 1.05;
  const floorPad = padded >= 1e6 ? '$0,000,000' : padded >= 1e5 ? '$000,000' : padded >= 1e4 ? '$00,000' : padded >= 1e3 ? '$0,000' : '$000';
  const fromScale = upper >= 1000 ? usd(upper) : '$' + Math.round(upper);
  const text = fromScale.length >= floorPad.length ? fromScale : floorPad;
  measureCtx.font = AXIS_FONT;
  return Math.ceil(measureCtx.measureText(text).width) + 14;
}
function xAxisValues(range) {
  const utc = !isIntraday(range);
  return (u, splits) => splits.map((t, i) => {
    const d = new Date(t * 1000);
    const mo = utc ? d.getUTCMonth() : d.getMonth(), day = utc ? d.getUTCDate() : d.getDate(), yr = utc ? d.getUTCFullYear() : d.getFullYear();
    if (range === '1H' || range === '1D') return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: range === '1H' ? '2-digit' : undefined });
    if (range === '1W' || range === '1M' || range === '3M' || range === '6M') return `${MON[mo]} ${day}`;
    if (range === '1Y' || range === '2Y') return mo === 0 ? String(yr) : MON[mo];
    return String(yr);
  });
}
function axisUSD(v) { return v >= 1000 ? usd(v) : '$' + Math.round(v); }

// Daily yields (10-year, 2-year, SOFR) + DXY (macro_history.json). Chart-tab panel; Overview tile uses 10-year + DXY.
function hasMacroFeed() {
  const j = state.feeds['macro_history.json'];
  return !!(j && Array.isArray(j.t) && j.t.length);
}
function showMacroPanel() { return state.tab === 'chart' && hasMacroFeed(); }
function macroPoints(id) {
  const j = state.feeds['macro_history.json'];
  const col = { ust10y: 'ust10y_v', ust2y: 'ust2y_v', sofr: 'sofr_v', dxy: 'dxy_v' }[id];
  if (!j || !col || !Array.isArray(j[col])) return [];
  const out = [];
  for (let i = 0; i < j.t.length; i++) if (isNum(j[col][i])) out.push({ t: j.t[i], v: j[col][i] });
  return out;
}
// Hold the last print to the window edges so a daily series still spans the BTC x-axis
// (including on 1H–1M). This repeats the last known print; it does not invent a new one.
function stepHold(points, xd0, xd1) {
  if (!points.length || xd1 < xd0) return [];
  const out = [];
  let i = -1;
  for (let k = 0; k < points.length; k++) { if (points[k].t <= xd0) i = k; else break; }
  if (i >= 0) out.push({ t: xd0, v: points[i].v });
  for (const p of points) if (p.t > xd0 && p.t <= xd1) out.push(p);
  if (out.length && out[out.length - 1].t < xd1) out.push({ t: xd1, v: out[out.length - 1].v });
  return out;
}
function macroValueAt(id, t) {
  const pts = macroPoints(id);
  if (!pts.length) return null;
  const i = nearestIdx(pts, t);
  if (i < 0) return null;
  // Daily series: use the last print on or before the inspected time; ignore a next-day print.
  if (pts[i].t <= t) return pts[i].v;
  return i > 0 ? pts[i - 1].v : null;
}
function gutterWidthText(sample) {
  measureCtx.font = AXIS_FONT;
  return Math.ceil(measureCtx.measureText(sample).width) + 14;
}
function yPadRange(vals, minSpan) {
  if (!vals.length) return [0, 1];
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi <= lo) { const pad = Math.max(Math.abs(lo) * 0.04, minSpan); lo -= pad; hi += pad; }
  else { const pad = Math.max((hi - lo) * 0.12, minSpan); lo -= pad; hi += pad; }
  return [lo, hi];
}
function niceTicks(lo, hi, target) {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / (target || 4);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const residual = raw / mag;
  const step = residual >= 5 ? 5 * mag : residual >= 2 ? 2 * mag : mag;
  const start = Math.ceil(lo / step) * step;
  const ticks = [];
  for (let v = start; v <= hi + step * 1e-9; v = +(v + step).toPrecision(12)) ticks.push(v);
  return ticks.length ? ticks : [lo, hi];
}
function fmtMetalAxis(id, v, step) {
  if (id === 'silver') {
    if (step != null && step >= 1) return usd(v);
    if (step != null && step >= 0.1) return '$' + (Math.round(v * 10) / 10).toFixed(1);
    return usdCents(v);
  }
  return usd(v);
}
// Visible inset USD axes for gold/silver, drawn inside the plot so the BTC right
// gutter (and the macro left spacer) stay unchanged. No extra width, no overflow.
function drawMetalAxes(u) {
  const axes = view && view.metalAxes;
  if (!axes || !axes.length) return;
  const ctx = u.ctx, dpr = devicePixelRatio || 1;
  ctx.save();
  ctx.font = AXIS_FONT.replace('11px', (11 * dpr) + 'px');
  ctx.textAlign = 'left';
  const plotL = u.bbox.left, plotT = u.bbox.top, plotB = u.bbox.top + u.bbox.height;
  let cursorX = plotL + 5 * dpr;
  for (const ax of axes) {
    const ticks = niceTicks(ax.domain[0], ax.domain[1], 4);
    const step = ticks.length > 1 ? ticks[1] - ticks[0] : null;
    const labels = ticks.map(v => fmtMetalAxis(ax.id, v, step));
    ctx.font = AXIS_FONT.replace('11px', (10 * dpr) + 'px');
    const titleW = ctx.measureText(ax.title).width;
    ctx.font = AXIS_FONT.replace('11px', (11 * dpr) + 'px');
    const maxW = Math.max(titleW, ...labels.map(t => ctx.measureText(t).width));
    const xLine = cursorX;
    ctx.strokeStyle = ax.color;
    ctx.lineWidth = Math.max(1, dpr);
    ctx.beginPath();
    ctx.moveTo(xLine, plotT + 13 * dpr);
    ctx.lineTo(xLine, plotB);
    ctx.stroke();
    ctx.fillStyle = 'rgba(11,14,20,0.72)';
    ctx.fillRect(xLine + 4 * dpr - 2 * dpr, plotT + 1 * dpr, titleW + 4 * dpr, 12 * dpr);
    ctx.fillStyle = ax.color;
    ctx.textBaseline = 'top';
    ctx.font = 'bold ' + AXIS_FONT.replace('11px', (10 * dpr) + 'px');
    ctx.fillText(ax.title, xLine + 4 * dpr, plotT + 1 * dpr);
    ctx.font = AXIS_FONT.replace('11px', (11 * dpr) + 'px');
    ctx.textBaseline = 'middle';
    for (let i = 0; i < ticks.length; i++) {
      const y = u.valToPos(ticks[i], ax.scale, true);
      if (y < plotT + 16 * dpr || y > plotB - 2 * dpr) continue;
      ctx.strokeStyle = ax.color;
      ctx.beginPath();
      ctx.moveTo(xLine, y);
      ctx.lineTo(xLine + 4 * dpr, y);
      ctx.stroke();
      const text = labels[i];
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(11,14,20,0.72)';
      ctx.fillRect(xLine + 6 * dpr - 2 * dpr, y - 7 * dpr, tw + 4 * dpr, 14 * dpr);
      ctx.fillStyle = ax.color;
      ctx.fillText(text, xLine + 6 * dpr, y);
    }
    cursorX = xLine + maxW + 16 * dpr;
  }
  ctx.restore();
}

// Everything the two plots need for the current bundle + toggles. Live polls reuse the same
// uPlot instances (setData) when the plotted set and gutter are unchanged, so nothing flickers.
let view = null;
function computeView() {
  const domain = yScaleDomain() || [0, 1];
  const xd = xDomain();
  const plot = plottableSeries(domain).filter(s => !isZoneSeries(s.id));
  const zoneSig = ['buyerCushion', 'liquidationMagnet'].filter(id => state.enabled.has(id) && state.bundle && state.bundle.series[id] && state.bundle.series[id].available).join(',');
  // Union of timestamps inside the BTC window (series keep their own dates; gaps are spanned).
  const ts = new Set();
  for (const s of plot) for (const p of s.points) if (p.t >= xd[0] && p.t <= xd[1]) ts.add(p.t);
  const xs = [...ts].sort((a, c) => a - c);
  const index = new Map(xs.map((t, i) => [t, i]));
  const data = [xs];
  const sOpts = [{}];
  for (const s of plot) {
    const arr = new Array(xs.length).fill(null);
    for (const p of s.points) { const i = index.get(p.t); if (i != null) arr[i] = p.v; }
    data.push(arr);
    const def = SID[s.id];
    if (isMarker(s.id)) sOpts.push({ label: def.short, stroke: def.color, width: 0, paths: () => null, points: { show: true, size: 10, width: 1.5, stroke: def.color, fill: def.color, space: 0 } });
    else {
      const opt = { label: def.short, stroke: def.color, width: def.width, dash: def.dash || undefined, spanGaps: true, points: { show: false } };
      if (isMetal(s.id)) opt.scale = s.id === 'gold' ? 'yGold' : 'ySilver';
      sOpts.push(opt);
    }
  }
  const metalDomains = {};
  const metalAxes = [];
  for (const id of ['gold', 'silver']) {
    const s = plot.find(p => p.id === id);
    if (!s || !s.points.length || !xd) continue;
    const vals = [];
    for (const pt of s.points) if (pt.t >= xd[0] && pt.t <= xd[1] && isNum(pt.v)) vals.push(pt.v);
    if (!vals.length) continue;
    const scale = id === 'gold' ? 'yGold' : 'ySilver';
    const mDomain = yPadRange(vals, id === 'gold' ? 5 : 0.2);
    metalDomains[scale] = mDomain;
    metalAxes.push({ id, scale, color: SID[id].color, domain: mDomain, title: SID[id].short });
  }
  const withMacro = showMacroPanel();
  const leftG = withMacro ? gutterWidthText('0.00%') : 0;
  const rightG = Math.max(gutterWidth(domain[1]), withMacro ? gutterWidthText('120.00') : 0);
  const b = state.bundle;
  const vols = aggregateVolume(b.volumePoints, state.range).filter(p => p.t >= xd[0] - 40 * DAY && p.t <= xd[1]);
  const vmax = vols.length ? Math.max(...vols.map(p => p.v)) : 1;
  const macroOn = withMacro ? MACRO_SERIES.map(s => s.id).filter(id => state.macroEnabled.has(id) && macroPoints(id).length).join(',') : '';
  const metalSig = metalAxes.map(a => a.id).join(',');
  const sig = plot.map(p => p.id).join(',') + '|' + leftG + '|' + rightG + '|' + (vols.length > 0) + '|' + state.range + '|' + withMacro + '|' + macroOn + '|' + zoneSig + '|' + metalSig;
  return { domain, xd, plot, xs, data, sOpts, gutter: rightG, leftG, rightG, withMacro, vols, vmax, sig, metalDomains, metalAxes };
}
function liveRedraw() {
  if (!uPrice || !view || !state.bundle || !visibleSeries().length) { renderChart(); return; }
  const v = computeView();
  if (v.sig !== view.sig || (!!uVol) !== (v.vols.length > 0)) { renderChart(); return; }
  view = v;
  uPrice.setData(v.data);
  if (uVol) { uVol.setData([v.vols.map(p => p.t), v.vols.map(p => p.v)]); state.volDisplay = v.vols; }
  if (v.withMacro) {
    if (!uMacro) { renderChart(); return; }
    const md = buildMacroData(v.xd);
    uMacro.setData(md.data);
  } else if (uMacro) { renderChart(); return; }
  if (state.sel != null) {
    syncing = true;
    uPrice.setCursor({ left: uPrice.valToPos(state.sel, 'x'), top: 10 });
    if (uVol) uVol.setCursor({ left: uVol.valToPos(state.sel, 'x'), top: 10 });
    if (uMacro) uMacro.setCursor({ left: uMacro.valToPos(state.sel, 'x'), top: 10 });
    syncing = false;
  }
  chartCard.querySelector('#chartBanner').innerHTML = bannerHTML(soWhat());
  renderLegend();
  renderMacroLegend();
}

function hatchFill(ctx, x, y, w, h, color) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = color.replace(/[\d.]+\)$/, '0.12)');
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.25;
  const step = 7 * (window.devicePixelRatio || 1);
  const diag = h + w;
  for (let i = -diag; i < w + diag; i += step) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + h);
    ctx.lineTo(x + i + h, y);
    ctx.stroke();
  }
  ctx.restore();
}
function drawPriceZones(u) {
  if (!state.bundle) return;
  const x0 = u.bbox.left, w = u.bbox.width;
  const band = (lo, hi) => {
    const yHi = u.valToPos(hi, 'y', true), yLo = u.valToPos(lo, 'y', true);
    const y = Math.min(yHi, yLo), h = Math.abs(yLo - yHi);
    return { y, h };
  };
  const ctx = u.ctx;
  ctx.save();
  ctx.beginPath(); ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height); ctx.clip();
  const cushOn = state.enabled.has('buyerCushion') && state.bundle.series.buyerCushion && state.bundle.series.buyerCushion.available;
  const magOn = state.enabled.has('liquidationMagnet') && state.bundle.series.liquidationMagnet && state.bundle.series.liquidationMagnet.available;
  if (cushOn) {
    const ext = zoneExtents('buyerCushion');
    if (ext) {
      const { y, h } = band(ext[0], ext[1]);
      ctx.fillStyle = 'rgba(64, 199, 122, 0.16)';
      ctx.fillRect(x0, y, w, h);
      ctx.strokeStyle = 'rgba(64, 199, 122, 0.42)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + w, y); ctx.moveTo(x0, y + h); ctx.lineTo(x0 + w, y + h); ctx.stroke();
    }
  }
  if (magOn) {
    const ext = zoneExtents('liquidationMagnet');
    if (ext) {
      const { y, h } = band(ext[0], ext[1]);
      hatchFill(ctx, x0, y, w, h, 'rgba(230, 90, 60, 0.55)');
    }
  }
  ctx.restore();
}

function renderChart() {
  const b = state.bundle;
  const msg = chartCard.querySelector('#chartMsg');
  const priceEl = chartCard.querySelector('#chartPrice'), volEl = chartCard.querySelector('#chartVol');
  chartCard.querySelectorAll('.pill').forEach(p => p.classList.toggle('on', p.dataset.range === state.range));
  chartCard.querySelector('#chartSource').textContent = b ? b.sourceLabel : '';
  chartCard.querySelector('#chartBanner').innerHTML = bannerHTML(soWhat());
  if (uPrice) { uPrice.destroy(); uPrice = null; }
  if (uVol) { uVol.destroy(); uVol = null; }
  if (uMacro) { uMacro.destroy(); uMacro = null; }
  const vis = visibleSeries();
  if (!b || !vis.length) {
    priceEl.hidden = volEl.hidden = true; msg.hidden = false;
    msg.className = 'chart-msg' + (state.chartError ? ' err' : '');
    msg.textContent = state.chartError ? state.chartError : (state.loading ? 'Loading…' : 'No series for this range yet.');
    hideMacroPlot(); renderLegend(); renderMacroLegend(); renderNotes();
    return;
  }
  priceEl.hidden = false; msg.hidden = true;
  const v = computeView();
  view = v;
  const { domain, xd, data, sOpts, gutter, leftG, rightG, withMacro } = v;
  const width = Math.max(200, chartCard.querySelector('#chartWrap').clientWidth);
  const priceH = Math.max(240, Math.min(420, Math.round(width * 0.62)));
  const leftAxis = leftG ? [{ side: 3, size: leftG, grid: { show: false }, ticks: { show: false }, values: () => [], stroke: 'transparent' }] : [];
  const common = {
    width, legend: { show: false }, padding: [8, 0, 0, 4],
    cursor: { y: false, points: { show: false }, drag: { x: false, y: false, setScale: false }, focus: { prox: -1 } },
    scales: { x: { time: true, range: () => [view.xd[0], view.xd[1]] } },
    ...(isIntraday(state.range) ? {} : { tzDate: ts => uPlot.tzDate(new Date(ts * 1e3), 'Etc/UTC') }),
  };
  const priceScales = { ...common.scales, y: { range: () => view.domain } };
  if (v.metalDomains) {
    for (const name of Object.keys(v.metalDomains)) priceScales[name] = { range: () => view.metalDomains[name] };
  }
  uPrice = new uPlot({
    ...common, height: priceH,
    scales: priceScales,
    axes: [
      { stroke: T.text2, font: XAXIS_FONT, grid: { stroke: T.grid, width: 0.5 }, ticks: { show: false }, size: 26, space: Math.max(60, width / 6), values: xAxisValues(state.range) },
      ...leftAxis,
      { side: 1, stroke: T.text2, font: AXIS_FONT, size: rightG, gap: 4, grid: { stroke: T.gridY, width: 0.5 }, ticks: { show: false }, space: Math.max(36, priceH / 6), values: (u, vals) => vals.map(axisUSD) },
    ],
    series: sOpts,
    hooks: { drawClear: [drawPriceZones], draw: [drawMetalAxes], setCursor: [u => onCursor(u, 'price')] },
  }, data, priceEl);
  // Volume strip: same width, same right gutter (blank labels), no date labels.
  const vols = v.vols;
  if (vols.length) {
    volEl.hidden = false;
    const vx = vols.map(p => p.t);
    const vy = vols.map(p => p.v);
    const fixedW = { '1D': 2.5, '1W': 2.0, '1M': 2.0, '6M': 2.0, '5Y': 2.0 }[state.range];
    uVol = new uPlot({
      ...common, height: 56, padding: [2, 0, 0, 4],
      scales: { ...common.scales, y: { range: () => [0, view.vmax * 1.02] } },
      axes: [
        { show: true, size: 0, grid: { stroke: T.grid, width: 0.5 }, ticks: { show: false }, values: () => [], space: Math.max(60, width / 6) },
        ...leftAxis,
        { side: 1, size: rightG, grid: { show: false }, ticks: { show: false }, values: (u, vals) => vals.map(() => '') },
      ],
      series: [{}, { stroke: 'transparent', paths: () => null, points: { show: false } }],
      hooks: {
        setCursor: [u => onCursor(u, 'vol')],
        // Bars drawn directly: solid teal up / red down / gray flat-or-first (v2.21 tint), centred on the bucket.
        draw: [u => {
          const ctx = u.ctx, dpr = devicePixelRatio, xs2 = u.data[0];
          let spacing = Infinity;
          for (let i = 1; i < xs2.length; i++) { const d = u.valToPos(xs2[i], 'x', true) - u.valToPos(xs2[i - 1], 'x', true); if (d > 0 && d < spacing) spacing = d; }
          if (!isFinite(spacing)) spacing = 6 * dpr;
          const w = fixedW ? fixedW * dpr : Math.max(1.5 * dpr, spacing * 0.65);
          const y0 = u.valToPos(0, 'y', true);
          ctx.save();
          ctx.beginPath(); ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height); ctx.clip();
          const vb = view.vols;
          for (let i = 0; i < vb.length; i++) {
            const x = u.valToPos(vb[i].t, 'x', true), y = u.valToPos(vb[i].v, 'y', true);
            ctx.fillStyle = vb[i].up === true ? 'rgb(38,166,154)' : vb[i].up === false ? 'rgb(239,83,80)' : 'rgb(140,140,140)';
            ctx.fillRect(x - w / 2, y, w, y0 - y);
          }
          ctx.restore();
        }],
      },
    }, [vx, vy], volEl);
    state.volDisplay = vols;
  } else { volEl.hidden = true; state.volDisplay = []; }
  attachTouch(uPrice); if (uVol) attachTouch(uVol);
  if (withMacro) renderMacroPlot(common, leftAxis, leftG, rightG, width, xd);
  else hideMacroPlot();
  renderLegend(); renderMacroLegend(); renderNotes();
}

// Selection: hover (mouse) or press-drag (touch) only moves a rule and updates the bottom legend.
let syncing = false, legendRAF = 0;
function onCursor(u, which) {
  if (syncing) return;
  const left = u.cursor.left;
  let t = null;
  if (left != null && left >= 0 && u.cursor.idx != null) t = u.posToVal(left, 'x');
  const others = [uPrice, uVol, uMacro].filter(o => o && o !== u);
  if (others.length) {
    syncing = true;
    for (const other of others) {
      if (t == null) other.setCursor({ left: -10, top: -10 });
      else other.setCursor({ left: other.valToPos(t, 'x'), top: 10 });
    }
    syncing = false;
  }
  if (t !== state.sel) { state.sel = t; if (!legendRAF) legendRAF = requestAnimationFrame(() => { legendRAF = 0; renderLegend(); renderMacroLegend(); }); }
}
function attachTouch(u) {
  const over = u.over;
  let active = false;
  const move = (e) => {
    const r = over.getBoundingClientRect();
    const x = Math.max(0, Math.min(r.width, e.clientX - r.left));
    u.setCursor({ left: x, top: 10 });
  };
  over.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') return; active = true; move(e); });
  over.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || !active) return; move(e); });
  const end = e => { if (e.pointerType === 'mouse') return; active = false; u.setCursor({ left: -10, top: -10 }); };
  over.addEventListener('pointerup', end); over.addEventListener('pointercancel', end); over.addEventListener('pointerleave', end);
}

function renderLegend() {
  const el = chartCard.querySelector('#legend');
  const b = state.bundle;
  let cap;
  if (state.sel != null) {
    let v = null;
    if (state.volDisplay && state.volDisplay.length) { const i = nearestIdx(state.volDisplay, state.sel); if (i >= 0) v = state.volDisplay[i].v; }
    cap = `Inspecting · ${isIntraday(state.range) ? fmtDate(state.sel, true) : fmtUTCDate(state.sel)}` + (v != null ? ` · Vol ${compactVolume(v)}` : '');
  } else {
    const last = b && b.series.spot.points.length ? b.series.spot.points[b.series.spot.points.length - 1].t : null;
    cap = last ? `Latest · ${isIntraday(state.range) ? fmtDate(last, true) : fmtUTCDate(last)} · touch the chart to inspect` : '';
  }
  const rowHTML = r => {
    const def = SID[r.id];
    const on = state.enabled.has(r.id) && r.available;
    const dot = r.available ? def.color : 'rgba(255,255,255,0.19)';
    let valTxt = null;
    if (r.available && isZoneSeries(r.id)) {
      const ext = zoneExtents(r.id);
      valTxt = ext ? bannerRangeText(ext[0], ext[1]) : null;
    } else if (r.available && r.value != null) valTxt = fmtOverlayVal(r.id, r.value);
    const val = valTxt ? `<span class="lval" style="color:${on ? def.color : T.text2}">${valTxt}</span>` : (!r.available ? '<span class="lna">n/a</span>' : '');
    return `<button class="lrow" data-sid="${r.id}" ${r.available ? '' : 'disabled'} aria-pressed="${on}">
      <span class="ldot" style="background:${dot};opacity:${on ? 1 : 0.35}"></span>
      <span class="ltitle" style="color:${r.available ? T.text : T.text2}">${esc(legendTitle(r.id))}</span>${val}${on ? ICON.check(def.color) : ICON.circle(T.text2)}</button>`;
  };
  const groups = legendRows();
  const onRows = groups.on.map(rowHTML).join('');
  const offRows = groups.off.map(rowHTML).join('');
  const split = groups.on.length && groups.off.length ? '<div class="legend-split">Hidden</div>' : '';
  el.innerHTML = `<div class="legend-cap">${esc(cap)}</div>${onRows}${split}${offRows}`;
}
function renderNotes() {
  const b = state.bundle;
  const hasFloors = b && Object.values(FLOOR_ID).some(id => b.series[id] && b.series[id].available);
  chartCard.querySelector('#floorBtnRow').hidden = !hasFloors;
  const notes = (b ? b.notes : []).map(n => `<div>${esc(n)}</div>`);
  if (showMacroPanel()) {
    const j = state.feeds['macro_history.json'];
    notes.push(`<div>Yields & dollar (daily): US 10-year from FRED DGS10${j && j.ust10y && j.ust10y.source && j.ust10y.source.includes('^TNX') ? ', latest session from Yahoo ^TNX until FRED publishes it' : ''}. US 2-year from FRED DGS2. SOFR from the NY Fed. Dollar index is DXY (Yahoo DX-Y.NYB).</div>`);
  }
  if (state.chartError && b) notes.push(`<div class="c-warn">${esc(state.chartError)}</div>`);
  chartCard.querySelector('#chartNotes').innerHTML = notes.join('');
}

function hideMacroPlot() {
  const head = chartCard.querySelector('#chartMacroHead');
  const el = chartCard.querySelector('#chartMacro');
  const legend = chartCard.querySelector('#macroLegend');
  if (head) head.hidden = true;
  if (el) el.hidden = true;
  if (legend) legend.hidden = true;
  if (uMacro) { uMacro.destroy(); uMacro = null; }
}
function buildMacroData(xd) {
  const series = [{}];
  const data = [[]];
  const scales = {};
  const axesExtra = [];
  const on = [];
  for (const def of MACRO_SERIES) {
    const pts = stepHold(macroPoints(def.id), xd[0], xd[1]);
    const enabled = state.macroEnabled.has(def.id) && pts.length;
    if (!enabled) continue;
    on.push({ def, pts, scale: isMacroYield(def.id) ? 'yUst' : 'yDxy' });
  }
  // Shared x: union of timestamps so the lines share one axis window (range is forced to xd).
  const ts = new Set();
  for (const s of on) for (const p of s.pts) ts.add(p.t);
  const xs = [...ts].sort((a, b) => a - b);
  const index = new Map(xs.map((t, i) => [t, i]));
  data[0] = xs;
  const byScale = {};
  for (const s of on) {
    const arr = new Array(xs.length).fill(null);
    for (const p of s.pts) { const i = index.get(p.t); if (i != null) arr[i] = p.v; }
    data.push(arr);
    series.push({ label: s.def.short, stroke: s.def.color, width: s.def.width, scale: s.scale, spanGaps: true, points: { show: false } });
    (byScale[s.scale] || (byScale[s.scale] = [])).push(...s.pts.map(p => p.v));
  }
  for (const [scale, vals] of Object.entries(byScale)) {
    scales[scale] = { range: () => yPadRange(vals, scale === 'yUst' ? 0.2 : 0.8) };
  }
  return { data, series, scales, on };
}
function renderMacroPlot(common, leftAxis, leftG, rightG, width, xd) {
  const el = chartCard.querySelector('#chartMacro');
  const head = chartCard.querySelector('#chartMacroHead');
  const legend = chartCard.querySelector('#macroLegend');
  head.hidden = false;
  legend.hidden = false;
  const md = buildMacroData(xd);
  if (!md.on.length) {
    el.hidden = true;
    if (uMacro) { uMacro.destroy(); uMacro = null; }
    return;
  }
  el.hidden = false;
  const ustOn = md.on.some(s => isMacroYield(s.def.id));
  const dxyOn = md.on.some(s => s.def.id === 'dxy');
  const ustColor = MACRO_SID.ust10y.color, dxyColor = MACRO_SID.dxy.color;
  const axes = [
    { show: true, size: 0, grid: { stroke: T.grid, width: 0.5 }, ticks: { show: false }, values: () => [], space: Math.max(60, width / 6) },
    { side: 3, scale: ustOn ? 'yUst' : (md.on[0].scale), size: leftG, gap: 4, stroke: ustOn ? ustColor : 'transparent', font: AXIS_FONT,
      grid: { stroke: T.gridY, width: 0.5 }, ticks: { show: false }, space: 28,
      values: (u, vals) => ustOn ? vals.map(v => fmtYield(v)) : vals.map(() => '') },
    { side: 1, scale: dxyOn ? 'yDxy' : (md.on[0].scale), size: rightG, gap: 4, stroke: dxyOn ? dxyColor : 'transparent', font: AXIS_FONT,
      grid: { show: false }, ticks: { show: false }, space: 28,
      values: (u, vals) => dxyOn ? vals.map(v => fmtDxy(v)) : vals.map(() => '') },
  ];
  uMacro = new uPlot({
    ...common, height: 120, padding: [6, 0, 0, 4],
    scales: { ...common.scales, ...md.scales },
    axes,
    series: md.series,
    hooks: { setCursor: [u => onCursor(u, 'macro')] },
  }, md.data, el);
  attachTouch(uMacro);
}
function renderMacroLegend() {
  const el = chartCard.querySelector('#macroLegend');
  if (!el) return;
  if (!showMacroPanel()) { el.hidden = true; return; }
  el.hidden = false;
  const j = state.feeds['macro_history.json'];
  let cap;
  if (state.sel != null) cap = `Inspecting · ${isIntraday(state.range) ? fmtDate(state.sel, true) : fmtUTCDate(state.sel)}`;
  else {
    const last = j && (j.as_of || j.last || (j.ust10y && j.ust10y.last) || (j.dxy && j.dxy.last));
    cap = last ? `Latest · ${last} · touch the chart to inspect` : 'Yields & dollar';
  }
  const rows = MACRO_SERIES.map(def => {
    const pts = macroPoints(def.id);
    const available = pts.length > 0;
    const on = state.macroEnabled.has(def.id) && available;
    let value = null;
    if (available) {
      if (state.sel != null) value = macroValueAt(def.id, state.sel);
      else value = pts[pts.length - 1].v;
    }
    const dot = available ? def.color : 'rgba(255,255,255,0.19)';
    const val = available && value != null ? `<span class="lval" style="color:${on ? def.color : T.text2}">${fmtMacroVal(def.id, value)}</span>` : (!available ? '<span class="lna">n/a</span>' : '');
    return `<button class="lrow" data-mid="${def.id}" ${available ? '' : 'disabled'} aria-pressed="${on}">
      <span class="ldot" style="background:${dot};opacity:${on ? 1 : 0.35}"></span>
      <span class="ltitle" style="color:${available ? T.text : T.text2}">${esc(def.title)}</span>${val}${on ? ICON.check(def.color) : ICON.circle(T.text2)}</button>`;
  }).join('');
  el.innerHTML = `<div class="legend-cap">${esc(cap)}</div>${rows}`;
}
function renderMacroCard() {
  const root = $('#macroCard');
  if (!root) return;
  const j = state.feeds['macro_history.json'];
  if (!j || !j.ust10y && !j.dxy) {
    root.innerHTML = card(`<h2>Yields & dollar</h2><div class="caption">Waiting on the daily yield and dollar-index feed.</div>${howellSignalHTML()}`);
    return;
  }
  const cell = (id, title, meta) => {
    const latest = meta && meta.latest;
    if (!latest || !isNum(latest.value)) {
      return `<div class="macro-cell"><div class="k">${esc(title)}</div><div class="v c-2">n/a</div><div class="w">No print in the feed yet.</div></div>`;
    }
    const asOf = latest.date ? `As of ${shortDate(latest.date)}` : '';
    const week = weekPhrase(latest.week_change);
    return `<div class="macro-cell"><div class="k">${esc(title)}</div><div class="v" style="color:${MACRO_SID[id].color}">${fmtMacroVal(id, latest.value)}</div><div class="w">${esc(week)}${asOf ? ` · ${asOf}` : ''}</div></div>`;
  };
  const src = 'US 10-year from the Treasury daily yield (FRED DGS10). Dollar index is DXY (Yahoo DX-Y.NYB), not the broad trade-weighted dollar.';
  root.innerHTML = card(`<h2>Yields & dollar</h2>
    <div class="macro-tile">${cell('ust10y', 'US 10-year yield', j.ust10y)}${cell('dxy', 'Dollar index (DXY)', j.dxy)}</div>
    <div class="caption2">${esc(src)}</div>
    ${howellSignalHTML()}`);
}

let chartGen = 0;
async function refreshChart() {
  const gen = ++chartGen;
  state.loading = true; setSpinner();
  renderChart(); // paint pills + keep last bundle while loading
  try {
    const range = state.range;
    const bars = isIntraday(range) ? await fetchDisplayBars(range) : null;
    if (gen !== chartGen) return;
    state.displayBars = bars;
    const b = buildBundle(range, bars);
    state.bundle = b; state.chartError = null;
  } catch (e) {
    if (gen !== chartGen) return;
    state.chartError = (isIntraday(state.range) ? 'Live intraday prices unavailable (Coinbase): ' : 'Chart data unavailable: ') + (e.message || e);
    if (state.bundle && state.bundle.range !== state.range) state.bundle = null;
  }
  state.loading = false; setSpinner();
  renderChart();
}

// ---------- cards ----------
function renderBull() {
  const s = currentBull(); const spot = state.spot;
  const srcCls = l => l === 'live' ? 'c-pos' : l === 'unavailable' ? 'c-warn' : l === 'thesis line' ? 'c-acc' : 'c-2';
  const line = r => {
    let phrase = '', pc = 'c-2';
    if (spot != null && r.value > 0) {
      const above = spot >= r.value;
      if (r.role === 'support') { phrase = above ? 'Price is above' : 'Price is below'; pc = above ? 'c-pos' : 'c-warn'; }
      else phrase = above ? 'Price is through this' : 'Still ahead';
    }
    return `<div class="brow"><div class="brow-top"><span class="brow-title">${esc(r.title)}</span><span class="src ${srcCls(r.sourceLabel)}">${esc(r.sourceLabel)}</span></div>
      <div class="brow-mid"><span class="price ${r.value == null ? 'c-2' : ''}">${r.value == null ? 'Unavailable' : usd(r.value)}</span>${phrase ? `<span class="phrase ${pc}">${phrase}</span>` : ''}</div>
      <div class="caption2">${esc(r.note)}</div></div>`;
  };
  const section = (title, sub, rows) => `<div><div class="sec-head"><b>${title}</b><span class="caption">${sub}</span></div>${rows.map(line).join('')}</div>`;
  let body;
  if (s.hasFeed) {
    const warn = s.anyWarning;
    const prevOpen = $('#bullSignals') ? $('#bullSignals').open : false;
    body = section('Supports', 'Dip health', s.supports) + section('Overhead', 'Progress through the range', s.overhead) +
      `<details class="signals ${warn ? 'warn' : ''}" id="bullSignals" ${warn || prevOpen ? 'open' : ''}><summary><span class="${warn ? 'c-warn' : ''}">${warn ? 'Top signals · check' : 'Top signals'}</span></summary>` +
      s.signals.map(g => `<div class="sig"><div class="sig-t ${g.warning ? 'c-warn' : g.watch ? 'c-acc' : ''}">${esc(g.title)}</div><div class="sig-d">${esc(g.detail)}</div></div>`).join('') + '</details>';
  } else body = '<div class="caption">Bull-market levels are waiting on the feed.</div>';
  const parts = [];
  if (s.asOf) parts.push(`Live prints as of ${s.asOf}`);
  const foot = parts.length ? parts.join(' · ') + '. Bitview for live prints. Thesis lines are fixed levels, not a live print.' : 'Live prints from Bitview. Thesis lines are fixed levels, not a live print.';
  $('#bullCard').innerHTML = card(`<div><h2>Bull market</h2><div class="caption" style="margin-top:4px">Live supports, overhead, and top signals. The 50-week average stays its own line.</div></div>${body}<div class="caption2">${esc(foot)}</div>`);
}
function renderDailyLevels() {
  const snap = snapshot(); const spot = state.spot;
  const rows = dailyLevels().map(l => {
    const badgeCls = l.source === 'live' ? 'live' : l.source === 'mock' ? 'mock' : l.source === 'thesis line' ? 'thesis' : l.source === 'history' ? 'history' : l.source === 'zone' ? 'zone' : l.source === 'cost-basis support' ? 'costbasis' : '';
    const badge = `<span class="badge ${badgeCls}">${l.source === 'mock' ? 'mock fallback' : esc(l.source)}</span>`;
    if (l.kind === 'note') return `<div class="lv"><div class="lv-top"><span class="brow-title">${esc(l.title)}</span>${badge}</div><div class="foot">${esc(l.note)}</div></div>`;
    const price = l.priceHigh != null ? `${usd(l.price)}–${usd(l.priceHigh)}` : usd(l.price);
    let dist = '';
    if (spot != null && isNum(l.price)) {
      let ref, delta;
      if (isNum(l.priceHigh)) {
        const lo = Math.min(l.price, l.priceHigh), hi = Math.max(l.price, l.priceHigh);
        if (spot < lo) { ref = lo; delta = spot - lo; }
        else if (spot > hi) { ref = hi; delta = spot - hi; }
        else { ref = spot; delta = 0; }
      } else { ref = l.price; delta = spot - l.price; }
      dist = `<span class="dist ${delta >= 0 ? 'c-pos' : 'c-neg'}">${delta >= 0 ? '+' : '-'}${nf0.format(Math.round(Math.abs(delta)))}&nbsp;&nbsp;(${fx(ref ? delta / ref * 100 : 0, 1)}%)</span>`;
    }
    const detail = l.detail ? `<div class="cushion-detail">${esc(l.detail)}</div>` : '';
    const sub = l.sub ? `<div class="cushion-sub">${esc(l.sub)}</div>` : '';
    return `<div class="lv"><div class="lv-top"><span class="brow-title">${esc(l.title)}</span>${badge}</div><div class="lv-mid"><span class="price">${price}</span>${dist}</div>${detail}${sub}${l.note ? `<div class="caption2">${esc(l.note)}</div>` : ''}</div>`;
  }).join('');
  const spotBox = spot != null ? `<div class="spot-box"><div class="caption2">Spot</div><div class="v">${usd(spot)}</div><div class="live-slot">${liveTagHTML()}</div></div>` : '';
  const asOf = snap && snap.asOf ? `<div class="caption2">As of ${new Date(snap.asOf * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>` : '';
  const mock = snap && snap.source === 'mock' ? '<div class="banner tone-warning">Using mock market data — 50-week average labeled mock ≈ 79k (not the first support to defend).</div>' : '';
  dailyLevelsEl.innerHTML = card(`<div class="row-between"><h2>Daily Levels</h2>${spotBox}</div>${bannerHTML(soWhat())}${mock}${asOf}<div>${rows}</div>`);
}
function renderRegime() {
  const snap = snapshot();
  const banner = soWhat();
  const belowWma = snap && isNum(snap.spot) && isNum(snap.wma50) && snap.spot < snap.wma50;
  const summary = belowWma ? 'Below the live 50-week average' : (snap && isNum(snap.spot) && isNum(snap.wma50) ? 'Holding the live 50-week average' : 'Waiting on live price');
  const bg = belowWma ? 'rgba(242,184,64,0.14)' : 'rgba(51,199,122,0.12)';
  const dot = belowWma ? T.warning : T.positive;
  const detail = (banner && banner.msg ? banner.msg + ' ' : '') + 'The bull-market card lists live supports, overhead, and top signals. Soft GLI and MOVE / liquidity caution still apply.';
  $('#regimeCard').innerHTML = card(`<h2>Regime</h2>
    <div class="regime-box" style="background:${bg}"><span class="regime-dot" style="background:${dot}"></span>${esc(summary)}</div>
    <div class="foot">${esc(detail)}</div>`);
}

const DEFAULT_HOWELL_SIGNAL = {
  trigger_price: 70000,
  hold_days: 3,
  source: "Michael Howell, Stockfindr interview 'Bond markets speak the truth' (Nov 15, 2026)",
};
function howellConfig() {
  const file = state.feeds['banner_levels.json'] || {};
  const raw = file.howell_signal && typeof file.howell_signal === 'object' ? file.howell_signal : {};
  const trigger = isNum(raw.trigger_price) && raw.trigger_price > 0 ? raw.trigger_price : DEFAULT_HOWELL_SIGNAL.trigger_price;
  const daysRaw = isNum(raw.hold_days) ? Math.round(raw.hold_days) : DEFAULT_HOWELL_SIGNAL.hold_days;
  const hold_days = Math.max(1, daysRaw);
  const source = typeof raw.source === 'string' && raw.source.trim() ? raw.source.trim() : DEFAULT_HOWELL_SIGNAL.source;
  return { trigger_price: trigger, hold_days, source };
}
/** Finished UTC daily closes from price_history.json only (not the Coinbase-extended master, which can include the in-progress UTC day). */
function howellFinishedCloses() {
  const ph = state.feeds['price_history.json'];
  if (!ph || !Array.isArray(ph.t) || !Array.isArray(ph.c)) return [];
  const today = new Date().toISOString().slice(0, 10);
  const out = [];
  for (let i = 0; i < ph.t.length; i++) {
    const t = ph.t[i] > 1e12 ? ph.t[i] / 1000 : ph.t[i];
    if (!isNum(t) || !isNum(ph.c[i]) || !(ph.c[i] > 0)) continue;
    const d = new Date(t * 1000).toISOString().slice(0, 10);
    if (d < today) out.push({ date: d, close: ph.c[i], t });
  }
  return out;
}
function howellStatus() {
  const cfg = howellConfig();
  const recent = howellFinishedCloses().slice(-cfg.hold_days);
  const triggered = recent.length >= cfg.hold_days && recent.every(r => r.close > cfg.trigger_price);
  return { triggered, status: triggered ? 'Triggered?' : 'Not triggered', recent, ...cfg };
}
function howellSignalHTML() {
  const h = howellStatus();
  const stCls = h.triggered ? 'c-acc' : '';
  const rest = `. His trigger is BTC reclaiming and holding above ~${fmtK(h.trigger_price)} (his lower trend line) and bouncing. Early crisis warning: a strengthening US dollar (DXY rising). Liquidity turn expected ~Feb–May 2027.`;
  return `<div class="howell-signal"><div class="howell-body">Howell buy signal: <span class="howell-status ${stCls}">${esc(h.status)}</span>${esc(rest)}</div><div class="caption2">${esc(h.source)}</div></div>`;
}

function renderBTD() {
  const j = state.feeds['btd_watch.json'];
  let st = 'waiting', m = null, s = null, cb = null, spot = null, asOf = null;
  if (j) {
    m = isNum(j.sth_mvrv) ? j.sth_mvrv : null; s = isNum(j.sth_sopr) ? j.sth_sopr : null; cb = isNum(j.sth_cost_basis) ? j.sth_cost_basis : null; spot = isNum(j.spot_ref) ? j.spot_ref : null; asOf = j.as_of;
    const th = j.approaching_thresholds || {}; const ms = th.sth_mvrv_soft ?? 1.05, ss = th.sth_sopr_soft ?? 1.05, hard = th.hard ?? 1.0;
    if (m != null && s != null) {
      if (m < hard && s < hard) st = 'textbook';
      else st = ((m <= ms && s <= ss) || (m < hard && s <= ss) || (s < hard && m <= ms)) ? 'approaching' : 'quiet';
    }
  }
  const headline = { waiting: 'BTD watch: waiting on STH-MVRV / STH-SOPR feed', quiet: 'BTD watch: quiet', approaching: 'BTD watch: approaching (STH-MVRV / STH-SOPR near 1)', textbook: 'Textbook BTD flag: STH-MVRV & STH-SOPR both < 1 — cash-reserve dip checklist' }[st];
  const tone = st === 'textbook' ? ['245,158,31', 0.14, 0.35, '⚑'] : st === 'approaching' ? ['242,184,64', 0.14, 0.35, '▲'] : ['255,255,255', 0.044, 0.11, st === 'quiet' ? '☾' : '◷'];
  const col = st === 'textbook' ? T.accent : st === 'approaching' ? T.warning : T.text2;
  const metric = (t, v) => v != null ? `<span style="color:${T.text}">${t} ${fx(v, 4)}</span>` : `<span class="c-2">${t} —</span>`;
  $('#btdCard').innerHTML = card(`<h2>Buy-The-Dip Watch</h2>
    <div class="status" style="background:rgba(${tone[0]},${tone[1]});border-color:rgba(${tone[0]},${tone[2]})"><span class="ico" style="color:${col}">${tone[3]}</span>
    <div style="display:flex;flex-direction:column;gap:6px"><div style="font-size:12px;font-weight:500;color:${st === 'textbook' || st === 'approaching' ? T.text : T.text2}">${esc(headline)}</div>
    ${m != null || s != null ? `<div class="metrics">${metric('STH-MVRV', m)}${metric('STH-SOPR', s)}</div>` : ''}
    ${cb != null || spot != null ? `<div class="metrics c-2">${cb != null ? `<span>STH CB ${usd(cb)}</span>` : ''}${spot != null ? `<span>spot ${usd(spot)}</span>` : ''}</div>` : ''}
    ${asOf ? `<div class="caption2">as of ${esc(asOf)}</div>` : ''}</div></div>
    <div class="caption2">Cash-reserve checklist only — not a trade button.</div>
    ${howellSignalHTML()}`);
}
function billions(v) { const b = Math.abs(v) / 1e9; return '$' + (b < 1 ? fx(Math.round(b * 100) / 100, 2) : fx(Math.round(b * 10) / 10, 1)) + 'B'; }
function renderETF() {
  const j = state.feeds['etf_watch.json'] || {};
  const flow = isNum(j.etf_net_flow_1w_usd) ? j.etf_net_flow_1w_usd : null, vol = isNum(j.etf_volume_1w_usd) ? j.etf_volume_1w_usd : null;
  const has = flow != null || vol != null;
  const line = has ? `ETF 1w: ${flow != null ? (flow >= 0 ? '+' : '-') + billions(flow) + ' flows' : '— flows'} · ${vol != null ? billions(vol) + ' vol' : '— vol'}` : 'ETF 1w: waiting on CheckOnChain feed';
  const rgb = flow == null ? '255,255,255' : flow > 0 ? '51,199,122' : flow < 0 ? '242,89,97' : '255,255,255';
  const col = flow == null ? T.text2 : flow > 0 ? T.positive : flow < 0 ? T.negative : T.text2;
  $('#etfCard').innerHTML = card(`<h2>Spot ETF Watch</h2>
    <div class="status" style="background:rgba(${rgb},${has ? 0.12 : 0.044});border-color:rgba(${rgb},${has ? 0.3 : 0.11})"><span class="ico" style="color:${col}">▤</span>
    <div style="display:flex;flex-direction:column;gap:4px"><div style="font-size:12px;font-weight:500;color:${has ? T.text : T.text2}">${esc(line)}</div>${j.as_of ? `<div class="caption2">as of ${esc(j.as_of)}</div>` : ''}</div></div>
    <div class="caption2">CheckOnChain weekly ETF flows / volume — not a trade signal.</div>`);
}
function fmtTrillions(t) {
  if (!isNum(t)) return 'n/a';
  return '$' + fx(t, 2) + 'T';
}
function fmtSpreadBp(bp) {
  if (!isNum(bp)) return '—';
  return (bp >= 0 ? '+' : '') + fx(bp, 1) + 'bp';
}
function twoYearSofrFromFeeds() {
  const liq = state.feeds['liquidity_history.json'];
  const snap = liq && liq.ust2y_sofr;
  if (snap && isNum(snap.ust2y_pct) && isNum(snap.sofr_pct)) {
    const bp = isNum(snap.spread_bp) ? snap.spread_bp : (snap.ust2y_pct - snap.sofr_pct) * 100;
    return { twoY: snap.ust2y_pct, sofr: snap.sofr_pct, bp, twoYDate: snap.ust2y_date, sofrDate: snap.sofr_date, reading: snap.reading || null, source: 'liquidity' };
  }
  const j = state.feeds['funding_watch.json'];
  if (j && isNum(j.ust_2y_pct) && isNum(j.sofr_pct)) {
    return { twoY: j.ust_2y_pct, sofr: j.sofr_pct, bp: (j.ust_2y_pct - j.sofr_pct) * 100, twoYDate: j.sofr_as_of, sofrDate: j.sofr_as_of, reading: null, source: 'funding' };
  }
  return null;
}
function spreadSeverity(bp) {
  if (!isNum(bp)) return 'neutral';
  if (bp >= 50) return 'elevated';
  if (bp > -50) return 'soft';
  return 'neutral';
}
function spreadDetail(s) {
  const side = s.bp >= 0 ? '2y above SOFR (market expects higher rates / tighter)' : '2y below SOFR (market expects cuts / easier)';
  const dates = [];
  if (s.twoYDate) dates.push(shortDateISO(s.twoYDate) || s.twoYDate);
  if (s.sofrDate && s.sofrDate !== s.twoYDate) dates.push(shortDateISO(s.sofrDate) || s.sofrDate);
  const asOf = dates.length ? ' · as of ' + dates.join(' / ') : '';
  return `${fmtSpreadBp(s.bp)} · ${side}${asOf}`;
}
function billsFlagFromLiq(liq) {
  const latest = liq && liq.bills && liq.bills.latest;
  if (!latest || !isNum(latest.share_pct)) return null;
  const target = isNum(latest.target_pct) ? latest.target_pct : (liq.bills.target_pct || 30);
  const asOf = latest.date ? ` · as of ${shortDateISO(latest.date) || latest.date}` : '';
  const sev = latest.share_pct >= target - 2 ? 'soft' : 'neutral';
  return {
    id: 'bills_share',
    title: 'Bills / debt',
    detail: `${fx(latest.share_pct, 1)}% of marketable debt · climbing toward the ${fx(target, 0)}% target${asOf}`,
    severity: sev,
  };
}
function drawReservesSpark() {
  const canvas = $('#liqReservesSpark');
  const liq = state.feeds['liquidity_history.json'];
  if (!canvas || !liq || !Array.isArray(liq.t) || !Array.isArray(liq.reserves_v_mil)) return;
  const wrap = canvas.parentElement;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const w = Math.max(120, Math.floor((wrap && wrap.clientWidth) || canvas.clientWidth || 280));
  const h = Math.max(36, Math.floor((wrap && wrap.clientHeight) || 48));
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const cutoff = (liq.t[liq.t.length - 1] || 0) - 3 * 365 * DAY;
  const pts = [];
  for (let i = 0; i < liq.t.length; i++) {
    const t = liq.t[i], v = liq.reserves_v_mil[i];
    if (!isNum(t) || !isNum(v) || t < cutoff) continue;
    pts.push([t, v / 1e6]);
  }
  if (pts.length < 2) return;
  const ys = pts.map(p => p[1]);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  // Keep 2.7T / 3.0T in view when nearby so the sparkline has a fixed reference.
  lo = Math.min(lo, 2.7);
  hi = Math.max(hi, 3.0);
  const pad = Math.max(0.02, (hi - lo) * 0.12);
  lo -= pad; hi += pad;
  const yOf = v => h - 4 - ((v - lo) / (hi - lo)) * (h - 8);
  const xOf = (t) => {
    const t0 = pts[0][0], t1 = pts[pts.length - 1][0];
    return t1 === t0 ? 0 : (t - t0) / (t1 - t0) * (w - 2) + 1;
  };
  const guide = (v, color) => {
    if (v < lo || v > hi) return;
    const y = yOf(v);
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    ctx.setLineDash([]);
  };
  guide(2.7, 'rgba(255,255,255,0.18)');
  guide(3.0, 'rgba(245,158,31,0.35)');
  ctx.beginPath();
  pts.forEach((p, i) => { const x = xOf(p[0]), y = yOf(p[1]); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
  ctx.strokeStyle = 'rgba(96, 190, 160, 0.95)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  const last = pts[pts.length - 1];
  ctx.beginPath();
  ctx.arc(xOf(last[0]), yOf(last[1]), 2.4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(96, 190, 160, 1)';
  ctx.fill();
}
function reservesPanel(liq) {
  const r = liq && liq.reserves;
  const latest = r && r.latest;
  if (!latest || !isNum(latest.value_t)) {
    return `<div class="liq-reserves"><div class="chip-t">Reserves</div><div class="caption2">Waiting on the reserve-balance feed.</div></div>`;
  }
  const ch = latest.change_13w_t;
  let chLine = '13-week change unavailable';
  if (isNum(ch)) {
    const from = latest.weeks_ago_13_date ? ` from ${shortDateISO(latest.weeks_ago_13_date) || latest.weeks_ago_13_date}` : '';
    const amt = (ch >= 0 ? '+' : '−') + '$' + fx(Math.abs(ch), 3) + 'T';
    const word = Math.abs(ch) < 0.05 ? 'flat' : ch > 0 ? 'up' : 'down';
    chLine = `13 weeks: ${word} ${amt}${from}`;
  }
  const asOf = latest.date ? `As of ${shortDateISO(latest.date) || latest.date}` : '';
  const reading = latest.reading || '';
  const purch = r.purchases || {};
  let status;
  if (purch.status === 'on' || purch.status === 'off') {
    const word = purch.status === 'on' ? 'on' : 'off';
    const since = purch.since ? ` since ${shortDateISO(purch.since) || purch.since}` : '';
    status = `Fed reserve purchases ${word}${since}.`;
  } else {
    status = 'Fed reserve-purchase status unconfirmed.';
  }
  return `<div class="liq-reserves">
    <div class="liq-reserves-top"><div><div class="chip-t">Reserves</div><div class="liq-reserves-val">${esc(fmtTrillions(latest.value_t))}</div></div><div class="liq-reserves-meta">${esc(chLine)}${asOf ? `<br>${esc(asOf)}` : ''}</div></div>
    <div class="liq-spark" title="Weekly reserve balances, last 3 years. Dotted lines at $2.7T and $3.0T."><canvas id="liqReservesSpark"></canvas></div>
    <div class="caption2">${esc(reading)}</div>
    <div class="caption2">${esc(status)}</div>
  </div>`;
}
function renderLiquidity() {
  const j = state.feeds['funding_watch.json'];
  const liq = state.feeds['liquidity_history.json'];
  const bull = currentBull();
  const sev = s => ['soft', 'elevated', 'neutral'].includes((s || '').trim().toLowerCase()) ? s.trim().toLowerCase() : 'neutral';
  let flags = CONFIG.liquidityFlags, overallDetail = null, overallSev = null, move = null;
  if (j) {
    const ids = (j.app_mapping && j.app_mapping.chip_ids) || ['move', 'sofr_minus_2y', 'bills_share', 'reserves'];
    const byId = {}; for (const f of j.flags || []) if (f.id) byId[f.id] = { id: f.id, title: f.title || f.id, detail: f.detail || '—', severity: sev(f.severity) };
    const ordered = ids.map(i => byId[i]).filter(Boolean);
    if (ordered.length) { flags = ordered; overallDetail = j.overall_detail; overallSev = j.overall_severity ? sev(j.overall_severity) : null; }
    move = isNum(j.move) ? j.move : null;
  }
  const spread = twoYearSofrFromFeeds();
  const tmS = spread ? spread.bp : null;
  const fr = bull.moveFragile, stz = bull.moveStress, rec = bull.moveRecession;
  const refs = `Reference lines: ${fx(fr, 0)} fragile, ${fx(stz, 0)} stress, ${fx(rec, 0)} Howell recession.`;
  let moveS;
  if (move == null) moveS = `MOVE print waiting. ${refs}`;
  else { const status = move >= rec ? 'at or above the Howell recession line' : move >= stz ? 'through the stress line, under the recession line' : move >= fr ? 'through the fragile line, under the stress line' : 'under the fragile line'; moveS = `MOVE ${fx(move, 1)} — ${status}. ${refs}`; }
  let tight;
  if (tmS == null) tight = '2y − SOFR — waiting on the 2-year yield and SOFR prints.';
  else {
    const side = spread.reading || (tmS >= 0 ? '2y is above SOFR; the market expects higher rates (tighter).' : '2y is below SOFR; the market expects cuts (easier).');
    tight = `2y − SOFR ${fmtSpreadBp(tmS)} — ${side}`;
  }
  // Override 2y−SOFR and bills chip text so the summary and the tile always share one sign convention.
  // Reserves moves out of the chip row into a panel with the sparkline.
  flags = flags.filter(f => f.id !== 'reserves').map(f => {
    if (f.id === 'sofr_minus_2y' && spread) {
      return { ...f, title: '2y − SOFR', detail: spreadDetail(spread), severity: spreadSeverity(spread.bp) };
    }
    if (f.id === 'bills_share') {
      const live = billsFlagFromLiq(liq);
      return live || f;
    }
    return f;
  });
  let top;
  if (overallDetail) {
    const s = overallSev || 'neutral';
    const c = s === 'elevated' ? ['242,184,64', T.warning, '▲'] : s === 'soft' ? ['245,158,31', T.accent, '◉'] : ['255,255,255', T.text2, '●'];
    top = `<div class="banner" style="background:rgba(${c[0]},0.18);border-color:rgba(${c[0]},0.45);color:${T.text}"><span class="ico" style="color:${c[1]}">${c[2]}</span><span>${esc(overallDetail)}</span></div>`;
  } else top = '<div class="caption">Soft GLI momentum + MOVE / 2y−SOFR / bills / reserves (funding watch).</div>';
  $('#liquidityCard').innerHTML = card(`<h2>Liquidity Stress</h2>${top}
    <div><div style="font-size:12px;font-weight:600">Macro lines</div><div class="caption2" style="margin-top:4px">${esc(moveS)}</div><div class="caption2" style="margin-top:4px">${esc(tight)}</div></div>
    ${howellSignalHTML()}
    <div class="chips">${flags.map(f => `<div class="chip ${f.severity}"><div class="chip-t">${esc(f.title)}</div><div class="chip-d">${esc(f.detail)}</div></div>`).join('')}</div>
    ${reservesPanel(liq)}`);
  drawReservesSpark();
}
function renderFooter() {
  const errs = state.feedErrors.slice();
  if (state.spotFallback) errs.push('Live spot unavailable (Coinbase); showing the last daily close.');
  const html = `<div>${esc(`${WEB_VERSION} · feed v2.3 · Coinbase/Yahoo/CheckOnChain/Bitview/FRED`)}</div>` +
    (state.lastRefresh ? `<div>Updated ${new Date(state.lastRefresh).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}${navigator.onLine === false ? ' · offline (cached data)' : ''}</div>` : '') +
    errs.map(e => `<div class="err">Live fetch note: ${esc(e)}</div>`).join('');
  $('#footerOverview').innerHTML = html; $('#footerChart').innerHTML = html; const fs = $('#footerSellers'); if (fs) fs.innerHTML = html; const fb = $('#footerBuyers'); if (fb) fb.innerHTML = html;
}
const dailyLevelsEl = document.createElement('div');
function placeDailyLevels() {
  const wide = window.matchMedia('(min-width: 980px)').matches;
  const slot = wide ? $('#dailyLevelsSlotMain') : $('#dailyLevelsSlotPhone');
  if (dailyLevelsEl.parentElement !== slot) slot.appendChild(dailyLevelsEl);
}
function renderCushion() {
  const el = $('#cushionCard');
  if (!el) return;
  el.innerHTML = '';
  el.hidden = true;
  return;
  // Removed from the web app (1.6.5): Buyer cushion card is no longer shown.
  const f = cushionFeed();
  const stats = cushionStats(f);
  if (!stats) {
    el.innerHTML = card(`<div class="row-between"><h2>Buyer cushion $62.3–64.2k</h2><span class="badge">waiting</span></div><div class="caption">Cost-basis zone. Waiting on the buyer cushion feed.</div>`);
    return;
  }
  const st = stats.status || '—';
  const stCls = st === 'Holding' ? 'c-pos' : st === 'Thinning' ? 'c-acc' : st === 'Evaporating' ? 'c-neg' : 'c-2';
  const rel = levelRelation(CUSHION_LO, CUSHION_HI, state.spot);
  const badge = rel === 'overhead' ? 'overhead / reclaim' : 'cost-basis zone';
  const stale = stats.stale ? `<div class="banner sth-stale" role="status"><span class="ico">▲</span><span>Data is stale: last update ${esc(shortDateISO(stats.asOf) || stats.asOf)}.</span></div>` : '';
  const asOf = stats.asOf ? `As of ${shortDateISO(stats.asOf) || stats.asOf} · last finished UTC day.` : '';
  const drain = rel === 'overhead' ? '' : `<div class="caption2">${esc(cushionMagnetNote())}</div>`;
  el.innerHTML = card(`<div class="row-between"><h2>Buyer cushion $62.3–64.2k</h2><span class="badge costbasis">${esc(badge)}</span></div>
    ${stale}
    <div class="cushion-status ${stCls}">${esc(st)}</div>
    <div class="price">${nf0.format(Math.round(stats.bandBtc))} BTC</div>
    <div class="foot">${stats.chg7 ? `7-day  ${esc(stats.chg7)}` : '7-day change unavailable.'}</div>
    <div class="foot">${stats.chgOct ? `Since Oct 15  ${esc(stats.chgOct)}` : 'Oct 15 baseline unavailable.'}</div>
    ${stats.sub ? `<div class="cushion-sub">${esc(stats.sub)}</div>` : ''}
    ${drain}
    <div class="caption2">Count from $62–64k cost-basis buckets. ${esc(asOf)}</div>`);
}
function renderCards() { renderBull(); renderCushion(); renderDailyLevels(); renderRegime(); renderBTD(); renderETF(); renderMacroCard(); renderLiquidity(); renderFooter(); }

// ---------- support floors history sheet (SupportFloorsHistoryView) ----------
const SPANS = [['all', 'Since 2012', null], ['y8', '8Y', 8], ['y4', '4Y', 4], ['y1', '1Y', 1]];
let histSpan = 'all', histSel = null, uHist = null;
const histCompact = v => v >= 1000 ? (v / 1000 >= 100 ? `$${fx(v / 1000, 0)}k` : `$${fx(v / 1000, 1)}k`) : `$${fx(v, 0)}`;
function openFloorSheet() {
  $('#floorSheet').hidden = false; document.body.style.overflow = 'hidden';
  histSel = null; renderFloorSheet();
}
function closeFloorSheet() { $('#floorSheet').hidden = true; document.body.style.overflow = ''; if (uHist) { uHist.destroy(); uHist = null; } }
$('#floorSheetDone').addEventListener('click', closeFloorSheet);
function floorSnap() { return floorsSnapshot(state.feeds['support_floors.json']); }
function renderFloorSheet() {
  const snap = floorSnap();
  const body = $('#floorSheetBody');
  body.innerHTML = `<div class="caption">Cost-based zones, recomputed daily. Bear lows marked. Context for holding through drawdowns, not sell signals.</div>
    <div class="seg" id="histSeg">${SPANS.map(([id, label]) => `<button data-span="${id}" class="${id === histSpan ? 'on' : ''}">${label}</button>`).join('')}</div>
    <div class="hist-chart" id="histChart"></div>
    <div class="panel" id="histLegend"></div>
    <div class="panel" id="histLows"></div>`;
  body.querySelector('#histSeg').addEventListener('click', e => { const b = e.target.closest('[data-span]'); if (!b) return; histSpan = b.dataset.span; histSel = null; renderFloorSheet(); });
  if (uHist) { uHist.destroy(); uHist = null; }
  if (!snap.floors.length) { body.querySelector('#histChart').innerHTML = '<div class="chart-msg">Support floors feed unavailable.</div>'; return; }
  const years = SPANS.find(s => s[0] === histSpan)[2];
  const end = snap.priceHistory.length ? snap.priceHistory[snap.priceHistory.length - 1].t : Date.now() / 1000;
  let start = -Infinity;
  if (years) { const d = new Date(end * 1000); d.setFullYear(d.getFullYear() - years); start = d.getTime() / 1000; }
  const lines = [];
  for (const f of snap.floors) { if (!f.seriesID) continue; const pts = f.history.filter(p => p.t >= start); if (pts.length) lines.push({ id: f.id, name: f.short, color: SID[f.seriesID].color, width: SID[f.seriesID].width, dash: SID[f.seriesID].dash, points: pts }); }
  lines.push({ id: 'price', name: 'BTC', color: T.accent, width: 1.8, dash: null, points: snap.priceHistory.filter(p => p.t >= start) });
  const lows = snap.bearLows.filter(l => l.t >= start);
  const ts = new Set(); for (const l of lines) for (const p of l.points) ts.add(p.t); for (const l of lows) ts.add(l.t);
  const xs = [...ts].sort((a, b) => a - b); const index = new Map(xs.map((t, i) => [t, i]));
  const data = [xs]; const series = [{}];
  for (const l of lines) { const arr = new Array(xs.length).fill(null); for (const p of l.points) arr[index.get(p.t)] = p.v; data.push(arr); series.push({ label: l.name, stroke: l.color, width: l.width, dash: l.dash || undefined, spanGaps: true, points: { show: false } }); }
  const lowArr = new Array(xs.length).fill(null); for (const l of lows) lowArr[index.get(l.t)] = l.price;
  data.push(lowArr); series.push({ label: 'Lows', stroke: '#fff', width: 0, paths: () => null, points: { show: true, size: 7, fill: '#fff', stroke: '#fff', space: 0 } });
  const vals = lines.flatMap(l => l.points.map(p => p.v)).filter(v => v > 0);
  const lo = Math.min(...vals) * 0.85, hi = Math.max(...vals) * 1.15;
  const lineDates = lines.flatMap(l => l.points.map(p => p.t));
  const xlo = Math.min(...lineDates), xhi = Math.max(...lineDates);
  const ticks = []; for (let d = Math.pow(10, Math.floor(Math.log10(Math.max(lo, 1)))); d <= hi; d *= 10) for (const m of [1, 2, 5]) { const v = d * m; if (v >= lo && v <= hi) ticks.push(v); }
  const el = body.querySelector('#histChart');
  const width = Math.max(240, el.clientWidth);
  measureCtx.font = AXIS_FONT; const gutter = Math.ceil(measureCtx.measureText('$000.0k').width) + 12;
  uHist = new uPlot({
    width, height: 320, legend: { show: false }, padding: [4, 0, 0, 14],
    cursor: { y: false, points: { show: false }, drag: { x: false, y: false, setScale: false }, focus: { prox: -1 } },
    tzDate: ts => uPlot.tzDate(new Date(ts * 1e3), 'Etc/UTC'),
    scales: { x: { time: true, range: () => [xlo, xhi] }, y: { distr: 3, range: () => [lo, hi] } },
    axes: [
      { stroke: T.text2, font: XAXIS_FONT, grid: { stroke: T.grid, width: 0.5 }, ticks: { show: false }, size: 26, space: Math.max(60, width / 7), values: xAxisValues(histSpan === 'y1' ? '1Y' : '5Y') },
      { side: 1, stroke: T.text2, font: AXIS_FONT, size: gutter, grid: { stroke: T.gridY, width: 0.5 }, ticks: { show: false }, splits: () => ticks, filter: (u, splits) => splits.map(v => (ticks.length <= 10 || /^[15]/.test(String(Math.round(v)))) ? v : null), values: (u, v) => v.map(x => x == null ? '' : histCompact(x)) },
    ],
    series,
    hooks: {
      draw: [u => {
        const ctx = u.ctx; ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1 * devicePixelRatio; ctx.setLineDash([2 * devicePixelRatio, 3 * devicePixelRatio]);
        for (const l of lows) { const x = Math.round(u.valToPos(l.t, 'x', true)); ctx.beginPath(); ctx.moveTo(x, u.bbox.top); ctx.lineTo(x, u.bbox.top + u.bbox.height); ctx.stroke(); }
        ctx.restore();
        placeLowLabels(u, lows, el);
      }],
      setCursor: [u => { const left = u.cursor.left; const t = left != null && left >= 0 && u.cursor.idx != null ? u.posToVal(left, 'x') : null; if (t !== histSel) { histSel = t; renderHistLegend(snap); } }],
    },
  }, data, el);
  attachTouch(uHist);
  renderHistLegend(snap);
  renderHistLows(snap);
}
// Bear-low labels, alternating top/bottom so close lows (Dec '18, Mar '20) never overlap.
function placeLowLabels(u, lows, el) {
  el.querySelectorAll('.lows-label').forEach(n => n.remove());
  const er = el.getBoundingClientRect(), or = u.over.getBoundingClientRect();
  const plotTop = or.top - er.top, plotLeft = or.left - er.left, plotH = or.height;
  lows.forEach((l, i) => {
    const d = new Date(l.t * 1000);
    const lab = document.createElement('div'); lab.className = 'lows-label';
    lab.textContent = `${MON[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}`;
    lab.style.left = (plotLeft + u.valToPos(l.t, 'x')) + 'px';
    lab.style.top = (i % 2 === 0 ? plotTop - 13 : plotTop + plotH + 1) + 'px';
    el.appendChild(lab);
  });
}
function renderHistLegend(snap) {
  const el = $('#histLegend'); if (!el) return;
  const at = histSel != null ? histSel : (snap.priceHistory.length ? snap.priceHistory[snap.priceHistory.length - 1].t : null);
  const nearestV = (pts) => { const i = nearestIdx(pts, at); return i >= 0 ? pts[i].v : null; };
  const price = at != null ? nearestV(snap.priceHistory) : null;
  const cap = at == null ? 'No history' : histSel == null ? `Latest · ${fmtUTCDate(at)} · touch the chart to inspect` : `Inspecting · ${fmtUTCDate(at)}`;
  const row = (name, color, v, ratio) => `<div class="lrow"><span class="ldot" style="background:${color}"></span><span class="ltitle">${esc(name)}</span>${ratio != null ? `<span class="caption2 mono" style="white-space:nowrap">price ${fx(ratio, 2)}×</span>` : ''}<span class="lval" style="min-width:72px;text-align:right;color:${v == null ? T.text2 : color}">${v == null ? 'n/a' : histCompact(v)}</span></div>`;
  el.innerHTML = `<div class="legend-cap">${esc(cap)}</div>` + row('BTC price', T.accent, price, null) +
    snap.highToLow.map(f => { const v = at != null ? nearestV(f.history) : null; return row(f.label, f.seriesID ? SID[f.seriesID].color : T.text2, v, price != null && v > 0 ? price / v : null); }).join('');
}
function renderHistLows(snap) {
  const order = snap.highToLow;
  const spot = snap.priceHistory.length ? snap.priceHistory[snap.priceHistory.length - 1].v : null;
  const cell = r => `<td style="color:${r != null && r < 1 ? T.text : T.text2}">${r != null ? fx(r, 2) + '×' : '–'}</td>`;
  const head = `<tr><th></th>${order.map(f => `<th style="color:${f.seriesID ? SID[f.seriesID].color : T.text2}">${esc(f.short)}</th>`).join('')}</tr>`;
  const rows = snap.bearLows.map(l => `<tr><td><b style="font-weight:600">${esc(l.label)}</b><br><span class="c-2 mono">${histCompact(l.price)}</span></td>${order.map(f => cell(l.priceToFloor[f.id])).join('')}</tr>`).join('');
  const latest = spot != null ? `<tr><td><b class="c-acc" style="font-weight:600">Latest</b><br><span class="c-2 mono">${histCompact(spot)}</span></td>${order.map(f => cell(f.value ? spot / f.value : null)).join('')}</tr>` : '';
  $('#histLows').innerHTML = `<div style="font-size:15px;font-weight:600">Price ÷ floor at each bear low</div><div class="caption2">Below 1.00× means price closed under that floor.</div><table class="lows">${head}${rows}${latest}</table>`;
}

// ---------- short-term sellers tab ----------
const STH_FEED = 'sth_exhaustion.json';
const sth = {
  range: (localStorage.getItem('sth.range') === '2y' ? '2y' : 'all'),
  lossUnit: (localStorage.getItem('sth.lossUnit') === 'usd' ? 'usd' : 'pct'),
  sel: { uw: null, loss: null, sopr: null },
  plots: { uw: null, loss: null, sopr: null },
  points: [],
  width: 0,
};
const STH_RANGE_PILLS = [['all', 'Since 2011'], ['2y', '2Y']];
const STH_SCORE_COLOR = { 0: T.negative, 1: T.warning, 2: T.accent, 3: T.positive };
const STH_STRIP_FILL = {
  0: 'rgba(242,89,97,0.85)',
  1: 'rgba(242,184,64,0.85)',
  2: 'rgba(245,158,31,0.9)',
  3: 'rgba(51,199,122,0.9)',
};
const sthCheck = color => `<svg class="sth-mark" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="8" fill="${color}"/><path d="M5.2 9.2l2.5 2.5 5.2-5.4" stroke="#111" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const sthCross = color => `<svg class="sth-mark" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="8" fill="none" stroke="${color}" stroke-width="1.5"/><path d="M6 6l6 6M12 6l-6 6" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/></svg>`;

function sthFeed() { return state.feeds[STH_FEED] || null; }

function sthAsOfISO(f) {
  const s = (f && (f.as_of || (f.today && f.today.date))) || '';
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : null;
}
/** Stale when as_of is more than one finished UTC day behind: as_of < today_UTC − 2 days. One day behind is normal. */
function sthFeedIsStale(f) {
  const asOf = sthAsOfISO(f);
  if (!asOf) return false;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000;
  const t = isoToUnix(asOf);
  return t != null && t < todayUtc - 2 * DAY;
}
function sthStaleBanner(f) {
  if (!sthFeedIsStale(f)) return '';
  const asOf = sthAsOfISO(f);
  const label = shortDateISO(asOf) || asOf;
  return `<div class="banner sth-stale" role="status"><span class="ico">▲</span><span>Data is stale: last update ${esc(label)}.</span></div>`;
}


function persistSth(key, val) {
  try { localStorage.setItem('sth.' + key, val); } catch (e) { /* private mode */ }
}

function parseSthChart(block) {
  if (!block || !Array.isArray(block.columns) || !Array.isArray(block.rows)) return [];
  const idx = Object.fromEntries(block.columns.map((c, i) => [c, i]));
  const need = ['date', 'price', 'uw_share_pct', 'sth_loss_1w_usd_m', 'sth_loss_1w_pct_cap', 'sth_sopr_1w', 'gauge_score'];
  if (need.some(k => idx[k] == null)) return [];
  const out = [];
  for (const r of block.rows) {
    const t = isoToUnix(r[idx.date]);
    if (t == null) continue;
    out.push({
      t, date: r[idx.date],
      price: r[idx.price],
      sth_cost_basis: idx.sth_cost_basis != null ? r[idx.sth_cost_basis] : null,
      uw: r[idx.uw_share_pct],
      uw_wmax: idx.uw_share_week_max_pct != null ? r[idx.uw_share_week_max_pct] : r[idx.uw_share_pct],
      loss_m: r[idx.sth_loss_1w_usd_m],
      loss_pct: r[idx.sth_loss_1w_pct_cap],
      sopr: r[idx.sth_sopr_1w],
      score: r[idx.gauge_score],
      uw_btc: idx.uw_btc != null ? r[idx.uw_btc] : null,
    });
  }
  return out;
}

function sthPoints() {
  const f = sthFeed();
  if (!f) return [];
  const block = sth.range === '2y' ? f.chart_daily_2y : f.chart_weekly;
  return parseSthChart(block).map(p => ({
    ...p,
    uwLine: sth.range === 'all' ? (p.uw_wmax != null ? p.uw_wmax : p.uw) : p.uw,
  }));
}

function sthEventLabel(name) {
  const m = /(\w{3}) (\d{4})/.exec(name || '');
  return m ? `${m[1]} '${m[2].slice(2)}` : name;
}

function sthPastEvents() {
  const f = sthFeed();
  if (!f || !Array.isArray(f.events)) return [];
  return f.events.filter(e => e && e.kind !== 'current' && e.price_low_date);
}

function fmtBtc(v) {
  if (!isNum(v)) return 'n/a';
  if (Math.abs(v) >= 1e6) return fx(v / 1e6, 2) + 'M BTC';
  if (Math.abs(v) >= 1e3) return fx(v / 1e3, 1) + 'k BTC';
  return nf0.format(Math.round(v)) + ' BTC';
}

function fmtLossB(v) {
  if (!isNum(v)) return 'n/a';
  const a = Math.abs(v);
  if (a >= 100) return '$' + fx(v, 0) + 'B';
  if (a >= 1) return '$' + fx(v, 2).replace(/0$/, '').replace(/\.0$/, '') + 'B';
  return '$' + fx(v * 1000, 0) + 'M';
}

function fmtLossM(v) {
  if (!isNum(v)) return 'n/a';
  if (Math.abs(v) >= 1000) return fmtLossB(v / 1000);
  if (Math.abs(v) >= 100) return '$' + fx(v, 0) + 'M';
  return '$' + fx(v, 1) + 'M';
}

function sthUwRangeText(f) {
  const rng = f.past_low_uw_range;
  if (rng && isNum(rng.min) && isNum(rng.max)) return `Past lows reached ${fx(rng.min, 1)}–${fx(rng.max, 1)}%`;
  const peaks = sthPastEvents().map(e => e.uw_share_peak).filter(isNum);
  if (!peaks.length) return 'Past lows not in this feed';
  return `Past lows reached ${fx(Math.min(...peaks), 1)}–${fx(Math.max(...peaks), 1)}%`;
}

function sthPartDetails(f) {
  const t = f.today || {};
  const past = sthUwRangeText(f);
  const uw = isNum(t.uw_share) ? fx(t.uw_share, 1) + '%' : 'n/a';
  const btc = fmtBtc(t.uw_btc);
  const peak = isNum(t.uw_peak_90d) ? fx(t.uw_peak_90d, 1) + '%' : 'n/a';
  let aDetail;
  if (t.parts && t.parts.a_underwater_peaked_and_rolling_over) {
    const drop = isNum(t.uw_peak_90d) && isNum(t.uw_share) ? fx(t.uw_peak_90d - t.uw_share, 1) : null;
    aDetail = `Underwater: ${uw} (${btc}) — down${drop ? ' ' + drop + ' pts' : ''} from a 90-day high of ${peak}. ${past}.`;
  } else if (isNum(t.uw_peak_90d) && t.uw_peak_90d < 95) {
    aDetail = `Underwater: ${uw} (${btc}) — 90-day high ${peak}, short of the 95% flush. ${past}.`;
  } else {
    aDetail = `Underwater: ${uw} (${btc}) — 90-day high ${peak}, not yet down 10 pts. ${past}.`;
  }

  const loss = fmtLossB(t.loss_1w_usd_b);
  const lossPeak = fmtLossB(t.loss_1w_peak_90d_usd_b);
  let bDetail;
  if (t.parts && t.parts.b_losses_faded_half) {
    const pctOff = isNum(t.loss_1w_usd_b) && isNum(t.loss_1w_peak_90d_usd_b) && t.loss_1w_peak_90d_usd_b > 0
      ? Math.round((1 - t.loss_1w_usd_b / t.loss_1w_peak_90d_usd_b) * 100) : null;
    bDetail = `Weekly losses: ${loss}, down${pctOff != null ? ' ' + pctOff + '%' : ''} from the 90-day high of ${lossPeak}.`;
  } else if (isNum(t.loss_1w_usd_b) && isNum(t.loss_1w_peak_90d_usd_b) && t.loss_1w_usd_b >= t.loss_1w_peak_90d_usd_b * 0.99) {
    bDetail = `Weekly losses: ${loss}, still at the 90-day high.`;
  } else if (isNum(t.uw_peak_90d) && t.uw_peak_90d < 95) {
    bDetail = `Weekly losses: ${loss} vs a 90-day high of ${lossPeak}. Fade only counts after a 95%+ underwater flush.`;
  } else {
    bDetail = `Weekly losses: ${loss} vs a 90-day high of ${lossPeak}, not yet down 50%.`;
  }

  const sopr = isNum(t.sopr_1w) ? fx(t.sopr_1w, 4) : 'n/a';
  const days = isNum(t.sopr_days_above_1) ? t.sopr_days_above_1 : 0;
  let cDetail;
  if (t.parts && t.parts.c_sopr_above1_7d) {
    cDetail = `Profit ratio: ${sopr}, ${days} days above 1.`;
  } else if (days > 0) {
    cDetail = `Profit ratio: ${sopr}, ${days} day${days === 1 ? '' : 's'} above 1 (needs 7).`;
  } else {
    cDetail = `Profit ratio: ${sopr}, 0 days above 1.`;
  }
  return { a: aDetail, b: bDetail, c: cDetail };
}

function sthVerdict(score) {
  if (score >= 3) return 'This wave of short-term selling looks finished.';
  if (score === 2) return 'Selling is fading.';
  return 'Short-term sellers still active.';
}

function ensureSthShell() {
  const root = $('#sthRoot');
  if (!root || root.dataset.ready) return root;
  root.innerHTML = `
    <div class="card" id="sthGaugeCard"></div>
    <div class="card" id="sthUwCard">
      <div class="sth-head"><div><h3>Underwater share</h3><div class="caption">% of short-term holder supply sitting at a loss</div></div></div>
      <div class="pills" id="sthPills">${STH_RANGE_PILLS.map(([id, label]) => `<button class="pill" data-sth-range="${id}">${label}</button>`).join('')}</div>
      <div class="sth-chart-plot" id="sthUwPlot"></div>
      <div class="legend" id="sthUwLegend"></div>
    </div>
    <div class="card" id="sthLossCard">
      <div class="sth-head">
        <div><h3>Short-term loss spikes</h3><div class="caption">Weekly realized losses by short-term holders</div></div>
        <div class="pills" id="sthLossUnit"><button class="pill" data-loss-unit="usd">USD</button><button class="pill" data-loss-unit="pct">% of cap</button></div>
      </div>
      <div class="sth-chart-plot" id="sthLossPlot"></div>
      <div class="legend" id="sthLossLegend"></div>
    </div>
    <div class="card" id="sthSoprCard">
      <div class="sth-head"><div><h3>Sellers' profit ratio</h3><div class="caption">Above 1 = recent buyers selling at a profit; below 1 = selling at a loss.</div></div></div>
      <div class="sth-chart-plot" id="sthSoprPlot"></div>
      <div class="legend" id="sthSoprLegend"></div>
    </div>`;
  root.addEventListener('click', e => {
    const rb = e.target.closest('[data-sth-range]');
    if (rb && rb.dataset.sthRange !== sth.range) {
      sth.range = rb.dataset.sthRange;
      persistSth('range', sth.range);
      sth.sel = { uw: null, loss: null, sopr: null };
      renderSthCharts(true);
      renderSthGaugeStrip();
      return;
    }
    const ub = e.target.closest('[data-loss-unit]');
    if (ub && ub.dataset.lossUnit !== sth.lossUnit) {
      sth.lossUnit = ub.dataset.lossUnit;
      persistSth('lossUnit', sth.lossUnit);
      sth.sel.loss = sth.sel.loss; // keep inspect point
      renderSthLossChart(true);
    }
  });
  root.dataset.ready = '1';
  return root;
}

function renderSthGauge() {
  const el = $('#sthGaugeCard');
  if (!el) return;
  const f = sthFeed();
  if (!f || !f.today) {
    el.innerHTML = `<h3>Seller exhaustion</h3><div class="chart-msg">Short-term sellers feed unavailable.</div>`;
    return;
  }
  const t = f.today;
  const score = t.score || 0;
  const color = STH_SCORE_COLOR[score] || T.text;
  const parts = t.parts || {};
  const labels = f.labels || {};
  const det = sthPartDetails(f);
  const rows = [
    ['a', labels.a || 'Underwater share hit 95%+ and has dropped 10+ pts', parts.a_underwater_peaked_and_rolling_over, det.a],
    ['b', labels.b || 'Weekly losses down 50%+ from the spike', parts.b_losses_faded_half, det.b],
    ['c', labels.c || 'Sellers back in profit (7+ days)', parts.c_sopr_above1_7d, det.c],
  ].map(([id, label, on, detail]) => `
    <div class="sth-part" data-part="${id}">
      ${on ? sthCheck(T.positive) : sthCross(T.text2)}
      <div class="sth-part-body">
        <div class="sth-part-label" style="color:${on ? T.positive : T.text}">${esc(label)}</div>
        <div class="sth-part-detail">${esc(detail)}</div>
      </div>
    </div>`).join('');
  const asOf = t.date ? fmtUTCDate(isoToUnix(t.date)) : '';
  el.innerHTML = `
    ${sthStaleBanner(f)}
    <div class="sth-score-row">
      <div>
        <div class="sth-score" style="color:${color}">Seller exhaustion: ${score} of 3</div>
        <div class="sth-verdict" style="color:${color}">${esc(sthVerdict(score))}</div>
        <div class="sth-asof">${asOf ? `As of ${esc(asOf)} · last finished UTC day` : ''}</div>
        ${buyComboHTML()}
      </div>
    </div>
    ${rows}
    <div class="sth-caption">${esc(f.gauge_caption || '')}</div>
    <div>
      <div class="sth-strip-label">Gauge history</div>
      <div class="sth-strip" id="sthStrip"><canvas id="sthStripCanvas"></canvas></div>
    </div>`;
  renderSthGaugeStrip();
}

function renderSthGaugeStrip() {
  const canvas = $('#sthStripCanvas');
  if (!canvas) return;
  const pts = sthPoints();
  const wrap = canvas.parentElement;
  const w = Math.max(1, wrap.clientWidth);
  const h = Math.max(1, wrap.clientHeight);
  const dpr = devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!pts.length) return;
  const n = pts.length;
  const bw = w / n;
  for (let i = 0; i < n; i++) {
    const s = pts[i].score || 0;
    ctx.fillStyle = STH_STRIP_FILL[s] || STH_STRIP_FILL[0];
    const bh = ((s + 1) / 4) * (h - 2);
    ctx.fillRect(Math.floor(i * bw), h - bh, Math.max(1, Math.ceil(bw)), bh);
  }
}

function sthLegendCap(key, pts) {
  const t = sth.sel[key];
  if (t != null) return `Inspecting · ${fmtUTCDate(t)}`;
  const last = pts.length ? pts[pts.length - 1].t : null;
  return last ? `Latest · ${fmtUTCDate(last)} · touch the chart to inspect` : '';
}

function rowHTML(name, color, val, extra) {
  return `<div class="lrow"><span class="ldot" style="background:${color}"></span><span class="ltitle">${esc(name)}</span>${extra || ''}<span class="lval" style="color:${val == null ? T.text2 : color}">${val == null ? 'n/a' : esc(val)}</span></div>`;
}

function sthAt(pts, t) {
  if (!pts.length) return null;
  const i = t == null ? pts.length - 1 : nearestIdx(pts, t);
  return i >= 0 ? pts[i] : null;
}

function renderSthUwLegend() {
  const el = $('#sthUwLegend'); if (!el) return;
  const pts = sth.points;
  const p = sthAt(pts, sth.sel.uw);
  const ev = p ? sthPastEvents().find(e => {
    const et = isoToUnix(e.price_low_date);
    return et != null && p.t && Math.abs(et - p.t) <= (sth.range === 'all' ? 8 : 2) * DAY;
  }) : null;
  const evNote = ev ? `<span class="caption2" style="white-space:nowrap">${esc(sthEventLabel(ev.name))} low</span>` : '';
  el.innerHTML = `<div class="legend-cap">${esc(sthLegendCap('uw', pts))}</div>` +
    rowHTML('Underwater share', COL.underwater, p && isNum(p.uwLine) ? fx(p.uwLine, 1) + '%' : null, evNote) +
    rowHTML('Supply in loss', rgba(0.22, 0.80, 0.88, 0.7), p && isNum(p.uw_btc) ? fmtBtc(p.uw_btc) : null) +
    rowHTML('BTC price', T.accent, p && isNum(p.price) ? usd(p.price) : null);
}

function renderSthLossLegend() {
  const el = $('#sthLossLegend'); if (!el) return;
  const pts = sth.points;
  const p = sthAt(pts, sth.sel.loss);
  const usdVal = p && isNum(p.loss_m) ? fmtLossM(p.loss_m) : null;
  const pctVal = p && isNum(p.loss_pct) ? fx(p.loss_pct, 2) + '%' : null;
  const main = sth.lossUnit === 'pct' ? pctVal : usdVal;
  const other = sth.lossUnit === 'pct' ? usdVal : pctVal;
  const otherLabel = sth.lossUnit === 'pct' ? 'USD' : '% of cap';
  el.innerHTML = `<div class="legend-cap">${esc(sthLegendCap('loss', pts))}</div>` +
    rowHTML(sth.lossUnit === 'pct' ? 'Weekly losses, % of STH cap' : 'Weekly losses, USD', rgba(0.95, 0.55, 0.30), main) +
    rowHTML(otherLabel, T.text2, other);
}

function renderSthSoprLegend() {
  const el = $('#sthSoprLegend'); if (!el) return;
  const pts = sth.points;
  const p = sthAt(pts, sth.sel.sopr);
  const v = p && isNum(p.sopr) ? fx(p.sopr, 4) : null;
  const side = p && isNum(p.sopr) ? (p.sopr >= 1 ? 'above 1 · selling at a profit' : 'below 1 · selling at a loss') : '';
  el.innerHTML = `<div class="legend-cap">${esc(sthLegendCap('sopr', pts))}</div>` +
    rowHTML("Sellers' profit ratio (1w)", p && isNum(p.sopr) && p.sopr >= 1 ? T.positive : T.negative, v,
      side ? `<span class="caption2" style="white-space:nowrap">${esc(side)}</span>` : '');
}

function destroySthPlot(key) {
  if (sth.plots[key]) { sth.plots[key].destroy(); sth.plots[key] = null; }
}

function sthCursorHook(key) {
  return u => {
    const left = u.cursor.left;
    let t = null;
    if (left != null && left >= 0 && u.cursor.idx != null) t = u.posToVal(left, 'x');
    if (t !== sth.sel[key]) {
      sth.sel[key] = t;
      if (key === 'uw') renderSthUwLegend();
      else if (key === 'loss') renderSthLossLegend();
      else renderSthSoprLegend();
    }
  };
}

function sthCommonOpts(width, height, xd, xRangeKey, gutterRight, gutterLeft) {
  const leftPad = gutterLeft || 4;
  return {
    width, height, legend: { show: false }, padding: [8, 0, 0, leftPad],
    cursor: { y: false, points: { show: false }, drag: { x: false, y: false, setScale: false }, focus: { prox: -1 } },
    tzDate: ts => uPlot.tzDate(new Date(ts * 1e3), 'Etc/UTC'),
    scales: { x: { time: true, range: () => xd } },
    axes: [
      { stroke: T.text2, font: XAXIS_FONT, grid: { stroke: T.grid, width: 0.5 }, ticks: { show: false }, size: 26, space: Math.max(60, width / 6), values: xAxisValues(xRangeKey) },
    ],
  };
}

function gutterFor(texts) {
  measureCtx.font = AXIS_FONT;
  return Math.ceil(Math.max(...texts.map(t => measureCtx.measureText(t).width))) + 12;
}


function placeSthEventLabels(u, evs, el) {
  el.querySelectorAll('.sth-ev-label').forEach(n => n.remove());
  const er = el.getBoundingClientRect(), or = u.over.getBoundingClientRect();
  const plotTop = or.top - er.top, plotLeft = or.left - er.left, plotW = or.width;
  const rows = [[], [], []];
  const rowH = 11;
  evs.slice().sort((a, b) => a.t - b.t).forEach(e => {
    const lab = document.createElement('div');
    lab.className = 'sth-ev-label';
    lab.textContent = sthEventLabel(e.name);
    el.appendChild(lab);
    const w = lab.offsetWidth;
    const xRaw = plotLeft + u.valToPos(e.t, 'x');
    const x = Math.max(plotLeft + w / 2, Math.min(plotLeft + plotW - w / 2, xRaw));
    const overlaps = list => list.some(p => Math.abs(p.x - x) < (p.w + w) / 2 + 4);
    let row = rows.findIndex(list => !overlaps(list));
    if (row < 0) row = 0;
    rows[row].push({ x, w });
    lab.style.left = x + 'px';
    lab.style.top = (plotTop - 12 - (rows.length - 1 - row) * rowH) + 'px';
  });
}

function renderSthUwChart() {
  const el = $('#sthUwPlot'); if (!el) return;
  destroySthPlot('uw');
  const pts = sth.points;
  if (!pts.length) { el.innerHTML = '<div class="chart-msg">No underwater-share history in this range.</div>'; return; }
  el.innerHTML = '';
  const width = Math.max(200, el.clientWidth);
  const height = 210;
  const xs = pts.map(p => p.t);
  const uw = pts.map(p => isNum(p.uwLine) ? p.uwLine : null);
  const px = pts.map(p => isNum(p.price) ? p.price : null);
  const xd = [xs[0], xs[xs.length - 1]];
  const prices = px.filter(v => v > 0);
  const pLo = Math.min(...prices), pHi = Math.max(...prices);
  const useLog = sth.range === 'all';
  const y2range = useLog
    ? [pLo / 1.25, pHi * 1.15]
    : [pLo * 0.92, pHi * 1.08];
  const evs = sthPastEvents().map(e => ({ ...e, t: isoToUnix(e.price_low_date) })).filter(e => e.t != null && e.t >= xd[0] && e.t <= xd[1]);
  const marks = new Array(xs.length).fill(null);
  evs.forEach(e => {
    const i = nearestIdx(pts, e.t);
    if (i >= 0) marks[i] = pts[i].uwLine;
  });
  const gR = gutterFor(['$000.0k', usd(pHi)]);
  const gL = gutterFor(['100%']);
  const xKey = sth.range === '2y' ? '2Y' : '10Y';
  const opts = sthCommonOpts(width, height, xd, xKey, gR, 4);
  opts.padding = [6, 0, 0, 4];
  opts.scales.y = { range: () => [0, 100] };
  opts.scales.y2 = { range: () => y2range, distr: useLog ? 3 : 1 };
  opts.axes.push(
    { scale: 'y', stroke: T.text2, font: AXIS_FONT, size: gL, gap: 4, grid: { stroke: T.gridY, width: 0.5 }, ticks: { show: false }, space: 36, values: (u, vals) => vals.map(v => v == null ? '' : Math.round(v) + '%') },
    { scale: 'y2', side: 1, stroke: T.text2, font: AXIS_FONT, size: gR, gap: 4, grid: { show: false }, ticks: { show: false }, space: 36, values: (u, vals) => vals.map(v => v == null ? '' : (useLog ? histCompact(v) : axisUSD(v))) },
  );
  opts.series = [
    {},
    { label: 'Underwater', scale: 'y', stroke: COL.underwater, width: 1.8, spanGaps: true, points: { show: false } },
    { label: 'BTC', scale: 'y2', stroke: T.accent, width: 1.3, spanGaps: true, points: { show: false } },
    { label: 'Lows', scale: 'y', stroke: '#fff', width: 0, paths: () => null, points: { show: true, size: 7, fill: '#fff', stroke: 'rgba(0,0,0,0.55)', width: 1, space: 0 } },
  ];
  opts.hooks = {
    setCursor: [sthCursorHook('uw')],
    draw: [u => {
      const ctx = u.ctx, dpr = devicePixelRatio;
      ctx.save();
      ctx.beginPath(); ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height); ctx.clip();
      const y95 = u.valToPos(95, 'y', true);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1 * dpr;
      ctx.setLineDash([5 * dpr, 4 * dpr]);
      ctx.beginPath(); ctx.moveTo(u.bbox.left, y95); ctx.lineTo(u.bbox.left + u.bbox.width, y95); ctx.stroke();
      ctx.setLineDash([2 * dpr, 3 * dpr]);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      for (const e of evs) {
        const x = Math.round(u.valToPos(e.t, 'x', true));
        ctx.beginPath(); ctx.moveTo(x, u.bbox.top); ctx.lineTo(x, u.bbox.top + u.bbox.height); ctx.stroke();
      }
      ctx.restore();
      placeSthEventLabels(u, evs, el);
      const er = el.getBoundingClientRect(), or = u.over.getBoundingClientRect();
      const lab95 = document.createElement('div');
      lab95.className = 'lows-label';
      lab95.textContent = '95%';
      lab95.style.left = (or.left - er.left + 8) + 'px';
      lab95.style.top = (or.top - er.top + u.valToPos(95, 'y') - 12) + 'px';
      lab95.style.transform = 'none';
      el.appendChild(lab95);
    }],
  };
  sth.plots.uw = new uPlot(opts, [xs, uw, px, marks], el);
  attachTouch(sth.plots.uw);
  renderSthUwLegend();
}

function renderSthLossChart(force) {
  const el = $('#sthLossPlot'); if (!el) return;
  destroySthPlot('loss');
  const pts = sth.points;
  $('#sthLossUnit') && $('#sthLossUnit').querySelectorAll('.pill').forEach(p => p.classList.toggle('on', p.dataset.lossUnit === sth.lossUnit));
  if (!pts.length) { el.innerHTML = '<div class="chart-msg">No loss history in this range.</div>'; return; }
  el.innerHTML = '';
  const width = Math.max(200, el.clientWidth);
  const height = 200;
  const xs = pts.map(p => p.t);
  const ys = pts.map(p => sth.lossUnit === 'pct' ? (isNum(p.loss_pct) ? p.loss_pct : null) : (isNum(p.loss_m) ? p.loss_m : null));
  const xd = [xs[0], xs[xs.length - 1]];
  const ymax = Math.max(...ys.filter(v => v != null), 0) * 1.08 || 1;
  const fmtY = v => {
    if (v == null) return '';
    if (sth.lossUnit === 'pct') return (v >= 10 ? fx(v, 0) : fx(v, 1)) + '%';
    return Math.abs(v) >= 1000 ? fmtLossB(v / 1000) : fmtLossM(v);
  };
  const gR = gutterFor([fmtY(ymax), '$00.0B', '10.0%']);
  const xKey = sth.range === '2y' ? '2Y' : '10Y';
  const opts = sthCommonOpts(width, height, xd, xKey, gR, 4);
  opts.scales.y = { range: () => [0, ymax] };
  opts.axes.push({ side: 1, stroke: T.text2, font: AXIS_FONT, size: gR, gap: 4, grid: { stroke: T.gridY, width: 0.5 }, ticks: { show: false }, space: 36, values: (u, vals) => vals.map(fmtY) });
  opts.series = [{}, { stroke: 'transparent', width: 0, paths: () => null, points: { show: false } }];
  opts.hooks = {
    setCursor: [sthCursorHook('loss')],
    draw: [u => {
      const ctx = u.ctx, dpr = devicePixelRatio, dataX = u.data[0];
      let spacing = Infinity;
      for (let i = 1; i < dataX.length; i++) {
        const d = u.valToPos(dataX[i], 'x', true) - u.valToPos(dataX[i - 1], 'x', true);
        if (d > 0 && d < spacing) spacing = d;
      }
      if (!isFinite(spacing)) spacing = 6 * dpr;
      const w = Math.max(1.4 * dpr, spacing * 0.72);
      const y0 = u.valToPos(0, 'y', true);
      ctx.save();
      ctx.beginPath(); ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height); ctx.clip();
      for (let i = 0; i < pts.length; i++) {
        const v = ys[i]; if (v == null) continue;
        const x = u.valToPos(pts[i].t, 'x', true), y = u.valToPos(v, 'y', true);
        ctx.fillStyle = 'rgba(245, 140, 70, 0.92)';
        ctx.fillRect(x - w / 2, y, w, Math.max(dpr, y0 - y));
      }
      ctx.restore();
    }],
  };
  sth.plots.loss = new uPlot(opts, [xs, ys], el);
  attachTouch(sth.plots.loss);
  renderSthLossLegend();
}

function renderSthSoprChart() {
  const el = $('#sthSoprPlot'); if (!el) return;
  destroySthPlot('sopr');
  const pts = sth.points;
  if (!pts.length) { el.innerHTML = '<div class="chart-msg">No profit-ratio history in this range.</div>'; return; }
  el.innerHTML = '';
  const width = Math.max(200, el.clientWidth);
  const height = 200;
  const xs = pts.map(p => p.t);
  const ys = pts.map(p => isNum(p.sopr) ? p.sopr : null);
  const xd = [xs[0], xs[xs.length - 1]];
  const vals = ys.filter(isNum);
  let lo = Math.min(0.97, ...vals), hi = Math.max(1.03, ...vals);
  const pad = (hi - lo) * 0.12;
  lo -= pad; hi += pad;
  const gR = gutterFor(['1.000', '0.000']);
  const xKey = sth.range === '2y' ? '2Y' : '10Y';
  const opts = sthCommonOpts(width, height, xd, xKey, gR, 4);
  opts.scales.y = { range: () => [lo, hi] };
  opts.axes.push({ side: 1, stroke: T.text2, font: AXIS_FONT, size: gR, gap: 4, grid: { stroke: T.gridY, width: 0.5 }, ticks: { show: false }, space: 36, values: (u, vals2) => vals2.map(v => v == null ? '' : fx(v, 3)) });
  opts.series = [{}, { label: 'SOPR', stroke: 'rgba(220,220,230,0.95)', width: 1.6, spanGaps: true, points: { show: false } }];
  opts.hooks = {
    setCursor: [sthCursorHook('sopr')],
    draw: [u => {
      const ctx = u.ctx, dpr = devicePixelRatio;
      const xs2 = u.data[0], ys2 = u.data[1];
      const y1 = u.valToPos(1, 'y', true);
      const xPos = t => u.valToPos(t, 'x', true);
      const yPos = v => u.valToPos(v, 'y', true);
      ctx.save();
      ctx.beginPath(); ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height); ctx.clip();
      const fillSeg = (t0, v0, t1, v1, above) => {
        ctx.beginPath();
        ctx.moveTo(xPos(t0), y1);
        ctx.lineTo(xPos(t0), yPos(v0));
        ctx.lineTo(xPos(t1), yPos(v1));
        ctx.lineTo(xPos(t1), y1);
        ctx.closePath();
        ctx.fillStyle = above ? 'rgba(51,199,122,0.22)' : 'rgba(242,89,97,0.22)';
        ctx.fill();
      };
      for (let i = 0; i < xs2.length - 1; i++) {
        const v0 = ys2[i], v1 = ys2[i + 1];
        if (v0 == null || v1 == null) continue;
        const t0 = xs2[i], t1 = xs2[i + 1];
        const a0 = v0 >= 1, a1 = v1 >= 1;
        if (a0 === a1) fillSeg(t0, v0, t1, v1, a0);
        else {
          const f = (1 - v0) / (v1 - v0);
          const tc = t0 + f * (t1 - t0);
          fillSeg(t0, v0, tc, 1, a0);
          fillSeg(tc, 1, t1, v1, a1);
        }
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.2 * dpr;
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(u.bbox.left, y1); ctx.lineTo(u.bbox.left + u.bbox.width, y1); ctx.stroke();
      ctx.restore();
    }],
  };
  sth.plots.sopr = new uPlot(opts, [xs, ys], el);
  attachTouch(sth.plots.sopr);
  renderSthSoprLegend();
}

function renderSthCharts(force) {
  const root = ensureSthShell();
  if (!root) return;
  root.querySelectorAll('#sthPills .pill').forEach(p => p.classList.toggle('on', p.dataset.sthRange === sth.range));
  const el = $('#sthUwPlot');
  const w = el ? el.clientWidth : 0;
  if (!force && w && w === sth.width && sth.plots.uw && sth.plots.loss && sth.plots.sopr) {
    renderSthUwLegend(); renderSthLossLegend(); renderSthSoprLegend();
    return;
  }
  sth.points = sthPoints();
  sth.width = w;
  if (!sthFeed()) {
    ['sthUwPlot', 'sthLossPlot', 'sthSoprPlot'].forEach(id => {
      const n = $('#' + id); if (n) n.innerHTML = '<div class="chart-msg">Short-term sellers feed unavailable.</div>';
    });
    return;
  }
  renderSthUwChart();
  renderSthLossChart();
  renderSthSoprChart();
}

function renderSellers() {
  ensureSthShell();
  renderSthGauge();
  renderSthCharts(true);
}



// ---------- buyers returning tab ----------
const BUY_FEED = 'buyer_exhaustion.json';
const BUY_RANGE_PILLS = [['3m', '3M'], ['6m', '6M'], ['1y', '1Y'], ['2y', '2Y'], ['all', 'Since 2017']];
const BUY_RANGE_DAYS = { '3m': 93, '6m': 186, '1y': 365, '2y': 730 };
const BUY_RANGE_IDS = new Set(BUY_RANGE_PILLS.map(p => p[0]));
const BUY_GUTTER_L = 52;
const BUY_GUTTER_R = 52;
const BUY_MIN_SPAN = 3 * DAY;
function loadBuyRange() {
  try {
    const v = localStorage.getItem('buy.tf');
    if (BUY_RANGE_IDS.has(v)) return v;
  } catch (e) { /* private mode */ }
  return '3m';
}
const buy = {
  range: loadBuyRange(),
  win: null,
  sel: { prem: null, etf: null, cvd: null, stable: null },
  plots: { prem: null, etf: null, cvd: null, stable: null },
  points: [],
  etfPoints: [],
  width: 0,
  stripSel: null,
  syncing: false,
  applying: false,
  selectMode: false,
  rangeDrag: null,
};
const BUY_SCORE_COLOR = { 0: T.negative, 1: T.warning, 2: T.accent, 3: T.positive, 4: T.positive };
const BUY_STRIP_FILL = {
  0: 'rgba(242,89,97,0.85)',
  1: 'rgba(242,184,64,0.85)',
  2: 'rgba(245,158,31,0.9)',
  3: 'rgba(130,200,90,0.9)',
  4: 'rgba(51,199,122,0.9)',
};
const buyHalf = color => `<svg class="sth-mark" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="8" fill="none" stroke="${color}" stroke-width="1.5"/><path d="M9 1.5A7.5 7.5 0 0 1 9 16.5Z" fill="${color}"/></svg>`;
const buyHollow = color => `<svg class="sth-mark" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="8" fill="none" stroke="${color}" stroke-width="1.5"/></svg>`;

function buyFeed() { return state.feeds[BUY_FEED] || null; }

function buyComboText() {
  const f = buyFeed();
  return (f && f.today && f.today.combo) || '';
}

function buyComboHTML() {
  const t = buyComboText();
  return t ? `<div class="buy-combo">${esc(t)}</div>` : '';
}

function persistBuy(key, val) {
  try { localStorage.setItem('buy.' + key, val); } catch (e) { /* private mode */ }
}

function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return isFinite(n) ? n : null;
}

function parseBuyChart(block) {
  if (!block || !Array.isArray(block.columns) || !Array.isArray(block.rows)) return [];
  const idx = Object.fromEntries(block.columns.map((c, i) => [c, i]));
  if (idx.date == null) return [];
  const out = [];
  for (const r of block.rows) {
    const t = isoToUnix(r[idx.date]);
    if (t == null) continue;
    const get = k => idx[k] != null ? numOrNull(r[idx[k]]) : null;
    out.push({
      t, date: r[idx.date],
      price: get('price'),
      prem7: get('prem7_pct'),
      prem30: get('prem30_pct'),
      etf14: get('etf14_usd_m'),
      etf28: get('etf28_usd_m'),
      bn14: get('bn_cvd14_usd_m'),
      cb14: get('cb_cvd14_usd_m'),
      stable: get('stable_usd_b'),
      stable30: get('stable30_pct'),
      P: get('P'), E: get('E'), C: get('C'), S: get('S'),
      buyer_score: get('buyer_score'),
      seller_score: get('seller_score'),
      bn_cum: get('bn_cvd_cum_usd_b'),
    });
  }
  return out;
}

function buyBlockTimes(block) {
  if (!block || !Array.isArray(block.columns) || !Array.isArray(block.rows)) return [];
  const i = block.columns.indexOf('date');
  if (i < 0) return [];
  const out = [];
  for (const r of block.rows) {
    const t = isoToUnix(r[i]);
    if (t != null) out.push(t);
  }
  return out;
}
function buyFirstT(block) {
  const ts = buyBlockTimes(block);
  return ts.length ? ts[0] : null;
}
function buyLastT(block) {
  const ts = buyBlockTimes(block);
  return ts.length ? ts[ts.length - 1] : null;
}
function buyDataStartT() {
  const f = buyFeed();
  if (!f) return null;
  return buyFirstT(f.chart_weekly) ?? buyFirstT(f.chart_daily_2y) ?? buyFirstT(f.chart_etf_daily);
}
function buyDataEndT() {
  const f = buyFeed();
  if (!f) return Math.floor(Date.now() / 1000);
  return buyLastT(f.chart_daily_2y) ?? buyLastT(f.chart_etf_daily) ?? buyLastT(f.chart_weekly) ?? Math.floor(Date.now() / 1000);
}
function buyDailyStartT() {
  const f = buyFeed();
  return f ? buyFirstT(f.chart_daily_2y) : null;
}
function buyPresetWindow(range) {
  const t1 = buyDataEndT();
  if (range === 'all') {
    const t0 = buyDataStartT();
    return { t0: t0 != null ? t0 : t1 - 3650 * DAY, t1 };
  }
  const days = BUY_RANGE_DAYS[range] || BUY_RANGE_DAYS['3m'];
  return { t0: t1 - days * DAY, t1 };
}
function buyWindow() {
  const all = buyPresetWindow('all');
  const clamp = (w) => ({ t0: Math.max(w.t0, all.t0), t1: Math.min(w.t1, all.t1) });
  if (buy.win && buy.win.t1 - buy.win.t0 >= BUY_MIN_SPAN) return clamp(buy.win);
  return clamp(buyPresetWindow(buy.range));
}
function buyXRange() {
  const w = buyWindow();
  return [w.t0, w.t1];
}
function buyXAxisKey() {
  const w = buyWindow();
  const days = (w.t1 - w.t0) / DAY;
  if (days <= 200) return '6M';
  if (days <= 800) return '2Y';
  return '10Y';
}
/** Daily series when the visible window sits inside the 2Y daily history; weekly beyond that. */
function buyUseDaily() {
  const start = buyDailyStartT();
  if (start == null) return false;
  return buyWindow().t0 >= start - 2 * DAY;
}
function buyInWin(pts) {
  const w = buyWindow();
  return (pts || []).filter(p => p.t >= w.t0 && p.t <= w.t1);
}
function buyPoints() {
  const f = buyFeed();
  if (!f) return [];
  const block = buyUseDaily() ? f.chart_daily_2y : f.chart_weekly;
  return parseBuyChart(block);
}
function buyBaseOpts(width, height) {
  const xd = buyXRange();
  const opts = sthCommonOpts(width, height, xd, buyXAxisKey(), BUY_GUTTER_R, 4);
  opts.padding = [10, 0, 0, 4];
  opts.cursor = Object.assign({}, opts.cursor, { drag: { setScale: false, x: false, y: false } });
  return opts;
}
function buyPushYAxes(opts, leftFmt, rightFmt, rightStroke) {
  opts.axes.push(
    { scale: 'y', stroke: T.text2, font: AXIS_FONT, size: BUY_GUTTER_L, gap: 4, grid: { stroke: T.gridY, width: 0.5 }, ticks: { show: false }, space: 36, values: (u, vals) => vals.map(leftFmt) },
    { scale: 'y2', side: 1, stroke: rightStroke || T.text2, font: AXIS_FONT, size: BUY_GUTTER_R, gap: 4, grid: { show: false }, ticks: { show: false }, space: 36, values: (u, vals) => vals.map(rightFmt) },
  );
}
function buyClampWindow(t0, t1) {
  const all = buyPresetWindow('all');
  const a = Math.min(t0, t1), b = Math.max(t0, t1);
  const w = { t0: Math.max(a, all.t0), t1: Math.min(b, all.t1) };
  if (w.t1 - w.t0 < BUY_MIN_SPAN) return null;
  return w;
}
function buySetScaleAll(t0, t1) {
  buy.applying = true;
  Object.values(buy.plots).forEach(u => { if (u) u.setScale('x', { min: t0, max: t1 }); });
  buy.applying = false;
  renderBuyGaugeStrips();
  syncBuyPlotAlign();
  syncBuyTfChrome();
}
function buyApplyWindow(t0, t1, mode) {
  if (buy.applying) return;
  if (mode === 'reset') {
    buy.win = null;
  } else if (isNum(t0) && isNum(t1)) {
    const w = buyClampWindow(t0, t1);
    if (!w) return;
    buy.win = w;
  } else return;
  if (mode === 'live') {
    const w = buyWindow();
    buySetScaleAll(w.t0, w.t1);
    return;
  }
  buy.applying = true;
  renderBuyCharts(true);
  renderBuyGaugeStrips();
  buy.applying = false;
}
function buyRangeSpanText(t0, t1) {
  const a = Math.min(t0, t1), b = Math.max(t0, t1);
  const d0 = new Date(a * 1000), d1 = new Date(b * 1000);
  const y0 = d0.getUTCFullYear(), y1 = d1.getUTCFullYear();
  const left = `${MON[d0.getUTCMonth()]} ${d0.getUTCDate()}${y0 !== y1 ? ', ' + y0 : ''}`;
  const right = `${MON[d1.getUTCMonth()]} ${d1.getUTCDate()}, ${y1}`;
  return `${left} → ${right}`;
}
function buyEnsureRangeOverlay(u) {
  let ov = u.over.querySelector('.buy-range-overlay');
  if (ov) return ov;
  ov = document.createElement('div');
  ov.className = 'buy-range-overlay';
  ov.hidden = true;
  ov.innerHTML = '<div class="buy-range-band"></div><div class="buy-range-label"></div>';
  u.over.appendChild(ov);
  return ov;
}
function buyHideRangeOverlay() {
  Object.values(buy.plots).forEach(u => {
    if (!u || !u.over) return;
    const ov = u.over.querySelector('.buy-range-overlay');
    if (ov) ov.hidden = true;
  });
  if (window.__btc && window.__btc.buyTf) window.__btc.buyTf.selecting = null;
}
function buyShowRangeOverlay(t0, t1) {
  const a = Math.min(t0, t1), b = Math.max(t0, t1);
  const text = buyRangeSpanText(a, b);
  Object.values(buy.plots).forEach(u => {
    if (!u || !u.over) return;
    const ov = buyEnsureRangeOverlay(u);
    const band = ov.querySelector('.buy-range-band');
    const lab = ov.querySelector('.buy-range-label');
    const x0 = u.valToPos(a, 'x');
    const x1 = u.valToPos(b, 'x');
    const left = Math.max(0, Math.min(x0, x1));
    const right = Math.min(u.bbox.width, Math.max(x0, x1));
    const width = Math.max(2, right - left);
    ov.hidden = false;
    band.style.left = left + 'px';
    band.style.width = width + 'px';
    lab.textContent = text;
    const lw = lab.offsetWidth || 0;
    const mid = left + width / 2;
    const labLeft = Math.max(2, Math.min((u.over.clientWidth || u.bbox.width) - lw - 2, mid - lw / 2));
    lab.style.left = labLeft + 'px';
  });
  if (window.__btc) {
    window.__btc.buyTf = Object.assign(window.__btc.buyTf || {}, { selecting: { t0: a, t1: b, label: text } });
  }
}
function buyClientToT(u, clientX) {
  const r = u.over.getBoundingClientRect();
  const x = Math.max(0, Math.min(r.width, clientX - r.left));
  return u.posToVal(x, 'x');
}
function buyInspectAt(u, clientX) {
  const r = u.over.getBoundingClientRect();
  const x = Math.max(0, Math.min(r.width, clientX - r.left));
  u.setCursor({ left: x, top: 10 });
}
function buySetSelectMode(on) {
  buy.selectMode = !!on;
  syncBuyTfChrome();
}
function buyLockChartTouch(on) {
  const root = $('#buyRoot');
  if (root) root.classList.toggle('buy-select-armed', !!on);
}
function buyFinishRangeDrag(drag, u, clientX) {
  buyHideRangeOverlay();
  buyLockChartTouch(buy.selectMode);
  if (!drag || !u) return;
  const t1 = isNum(clientX) ? buyClientToT(u, clientX) : drag.t1;
  const t0 = drag.t0;
  const a = Math.min(t0, t1), b = Math.max(t0, t1);
  const px = Math.abs(u.valToPos(b, 'x') - u.valToPos(a, 'x'));
  const TAP_PX = 12;
  if (!(px >= TAP_PX) || (b - a) < BUY_MIN_SPAN) {
    buyInspectAt(u, isNum(clientX) ? clientX : drag.x0);
    return;
  }
  if (buy.selectMode) buySetSelectMode(false);
  buyApplyWindow(a, b);
}
function attachBuyRangeSelect(u, key) {
  const over = u.over;
  if (!over || over.dataset.buyRangeSel) return;
  over.dataset.buyRangeSel = '1';
  buyEnsureRangeOverlay(u);
  const HOLD_MS = 250;
  const SLOP = 12;

  const startSelect = (drag, clientX) => {
    drag.mode = 'select';
    if (drag.holdTimer) { clearTimeout(drag.holdTimer); drag.holdTimer = null; }
    drag.t1 = buyClientToT(u, clientX);
    buy.rangeDrag = drag;
    buyLockChartTouch(true);
    buyShowRangeOverlay(drag.t0, drag.t1);
  };

  over.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.pointerType !== 'mouse' && e.isPrimary === false) return;
    try { over.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (buy.rangeDrag && buy.rangeDrag.holdTimer) clearTimeout(buy.rangeDrag.holdTimer);
    const t = buyClientToT(u, e.clientX);
    const drag = {
      key, id: e.pointerId, type: e.pointerType,
      x0: e.clientX, y0: e.clientY, t0: t, t1: t,
      mode: 'pending', holdTimer: null,
    };
    buy.rangeDrag = drag;
    if (buy.selectMode) {
      if (e.cancelable) e.preventDefault();
      startSelect(drag, e.clientX);
      return;
    }
    if (e.pointerType !== 'mouse') {
      drag.holdTimer = setTimeout(() => {
        if (buy.rangeDrag !== drag || drag.mode !== 'pending') return;
        startSelect(drag, drag.x0);
      }, HOLD_MS);
    }
  });

  over.addEventListener('pointermove', e => {
    const drag = buy.rangeDrag;
    if (!drag || drag.id !== e.pointerId || drag.key !== key) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (drag.mode === 'pending') {
      if (e.pointerType === 'mouse') {
        if (Math.abs(dx) >= SLOP) startSelect(drag, e.clientX);
      } else if (Math.hypot(dx, dy) >= SLOP) {
        // Moved before the hold armed: let the page scroll.
        if (drag.holdTimer) { clearTimeout(drag.holdTimer); drag.holdTimer = null; }
        drag.mode = 'scroll';
      }
      return;
    }
    if (drag.mode !== 'select') return;
    if (e.cancelable) e.preventDefault();
    drag.t1 = buyClientToT(u, e.clientX);
    buyShowRangeOverlay(drag.t0, drag.t1);
  }, { passive: false });

  const endPointer = e => {
    const drag = buy.rangeDrag;
    if (!drag || drag.id !== e.pointerId || drag.key !== key) return;
    if (drag.holdTimer) { clearTimeout(drag.holdTimer); drag.holdTimer = null; }
    buy.rangeDrag = null;
    if (drag.mode === 'select') {
      if (e.cancelable) e.preventDefault();
      buyFinishRangeDrag(drag, u, e.clientX);
      return;
    }
    if (drag.mode === 'pending') buyInspectAt(u, drag.x0);
  };
  over.addEventListener('pointerup', endPointer);
  over.addEventListener('pointercancel', e => {
    const drag = buy.rangeDrag;
    if (!drag || drag.id !== e.pointerId || drag.key !== key) return;
    if (drag.holdTimer) clearTimeout(drag.holdTimer);
    buy.rangeDrag = null;
    buyHideRangeOverlay();
    buyLockChartTouch(buy.selectMode);
  });

  // iOS: preventDefault on touch events is what actually stops page scroll once we are selecting.
  over.addEventListener('touchstart', e => {
    if (buy.selectMode && e.cancelable) e.preventDefault();
  }, { passive: false });
  over.addEventListener('touchmove', e => {
    const drag = buy.rangeDrag;
    if ((buy.selectMode || (drag && drag.mode === 'select')) && e.cancelable) e.preventDefault();
  }, { passive: false });

  // Mouse hover inspect is left to uPlot; touch inspect is handled above.
}

function mountBuyPlot(key, opts, data, el) {
  opts.hooks = opts.hooks || {};
  buy.plots[key] = new uPlot(opts, data, el);
  attachBuyRangeSelect(buy.plots[key], key);
  syncBuyPlotAlign();
}
function syncBuyPlotAlign() {
  const u = buy.plots.prem || buy.plots.etf || buy.plots.cvd || buy.plots.stable;
  const root = $('#buyRoot');
  if (!u || !root) return;
  // u.bbox is in device pixels; u.width is CSS px. Mixing them blew out the
  // score-history strip margins on iPhone (page wider than the screen, iOS shrink-to-fit).
  const host = (u.root || (u.over && u.over.parentElement));
  const over = u.over && u.over.getBoundingClientRect();
  const box = host && host.getBoundingClientRect();
  let left, right;
  if (over && box && box.width) {
    left = Math.max(0, over.left - box.left);
    right = Math.max(0, box.right - over.right);
  } else {
    const pr = u.pxRatio || window.devicePixelRatio || 1;
    left = Math.max(0, (u.bbox.left || 0) / pr);
    right = Math.max(0, u.width - left - ((u.bbox.width || 0) / pr));
  }
  root.style.setProperty('--buy-plot-left', left + 'px');
  root.style.setProperty('--buy-plot-right', right + 'px');
}
function syncBuyTfChrome() {
  const root = $('#buyRoot');
  if (!root) return;
  root.querySelectorAll('#buyPills .pill').forEach(p => p.classList.toggle('on', p.dataset.buyRange === buy.range));
  const reset = $('#buyTfReset');
  if (reset) reset.hidden = !buy.win;
  const selBtn = $('#buyTfSelect');
  if (selBtn) {
    selBtn.classList.toggle('on', !!buy.selectMode);
    selBtn.setAttribute('aria-pressed', buy.selectMode ? 'true' : 'false');
  }
  root.classList.toggle('buy-select-mode', !!buy.selectMode);
  buyLockChartTouch(!!buy.selectMode || !!(buy.rangeDrag && buy.rangeDrag.mode === 'select'));
  const cap = $('#buyTfCaption');
  if (cap) {
    cap.textContent = buy.selectMode
      ? 'Press a start date, drag to the end, then release. Charts zoom to that window.'
      : 'One time range for every chart below. Press-drag-release to zoom, or use Select range on a phone. Reset returns to the preset.';
  }
  if (window.__btc) {
    const w = buyWindow();
    window.__btc.buyTf = {
      range: buy.range, zoomed: !!buy.win, t0: w.t0, t1: w.t1, useDaily: buyUseDaily(),
      selectMode: !!buy.selectMode,
      selecting: (window.__btc.buyTf && window.__btc.buyTf.selecting) || null,
    };
  }
}
function buyEtfComplete(p) {
  return !!(p && isNum(p.etf14) && isNum(p.etf28));
}
/** Last daily (else weekly) row with both 14d and 28d ETF prints. Skips provisional/null days. */
function buyLastCompleteEtf() {
  const f = buyFeed();
  if (!f) return null;
  const scan = block => {
    const rows = parseBuyChart(block);
    for (let i = rows.length - 1; i >= 0; i--) if (buyEtfComplete(rows[i])) return rows[i];
    return null;
  };
  return scan(f.chart_daily_2y) || scan(f.chart_weekly);
}
/** Latest full ETF 14d/28d point, with as-of date when the latest (or inspected trailing) day is provisional. */
function buyEtfView(pts) {
  const complete = buyLastCompleteEtf();
  const sel = buy.sel.etf;
  if (sel != null) {
    const p = buyAt(pts, sel);
    if (buyEtfComplete(p)) return { point: p, asOf: null };
    if (complete && p && p.t >= complete.t) return { point: complete, asOf: complete.date };
    return { point: p, asOf: null };
  }
  const last = pts && pts.length ? pts[pts.length - 1] : null;
  if (buyEtfComplete(last) && complete && last.date === complete.date) return { point: last, asOf: null };
  if (complete && !buyEtfComplete(last)) return { point: complete, asOf: complete.date };
  if (complete && last && last.date !== complete.date) return { point: complete, asOf: complete.date };
  return { point: last || complete, asOf: null };
}
function buyEtfLegendCap(pts, view) {
  const t = buy.sel.etf;
  if (view && view.asOf) {
    const label = shortDateISO(view.asOf) || view.asOf;
    if (t != null) return `Inspecting · as of ${label}`;
    return `Latest · as of ${label} · touch the chart to inspect`;
  }
  return buyLegendCap('etf', pts);
}

function fmtOrdinal(n) {
  if (!isNum(n)) return '';
  const v = Math.round(Number(n));
  const abs = Math.abs(v) % 100;
  const d = abs % 10;
  const suf = (abs >= 11 && abs <= 13) ? 'th' : d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th';
  return v + suf;
}

function parseEtfDaily(block) {
  if (!block || !Array.isArray(block.columns) || !Array.isArray(block.rows)) return [];
  const idx = Object.fromEntries(block.columns.map((c, i) => [c, i]));
  if (idx.date == null) return [];
  const out = [];
  for (const r of block.rows) {
    const t = isoToUnix(r[idx.date]);
    if (t == null) continue;
    const get = k => idx[k] != null ? numOrNull(r[idx[k]]) : null;
    out.push({
      t, date: r[idx.date],
      etf: get('etf_usd_m'),
      etf5: get('etf5_usd_m'),
      etf5_pctile: get('etf5_pctile'),
      provisional: !!(idx.provisional != null && Number(r[idx.provisional]) === 1),
    });
  }
  return out;
}

function buyEtfThresholds() {
  const f = buyFeed();
  const block = f && f.chart_etf_daily;
  const th = (block && block.thresholds) || {};
  const E = ((f && f.today && f.today.parts) || {}).E || {};
  const num = (a, b) => isNum(a) ? a : (isNum(b) ? b : null);
  return {
    median: num(th.median_usd_m, E.turn_line_usd_m),
    p90: num(th.p90_usd_m, E.decisive_in_usd_m),
    p10: num(th.p10_usd_m, E.decisive_out_usd_m),
  };
}

function buyEtfDailyPoints() {
  const f = buyFeed();
  if (!f) return [];
  let rows = parseEtfDaily(f.chart_etf_daily);
  if (!rows.length) return [];
  return rows.filter(p => {
    if (p.provisional) return true;
    const wd = new Date(p.t * 1000).getUTCDay();
    return wd !== 0 && wd !== 6;
  });
}

function buyEtfHeadline() {
  const f = buyFeed();
  const E = ((f && f.today && f.today.parts) || {}).E || {};
  return {
    sum5: E.sum5_usd_m,
    asOf: E.sum5_as_of || null,
    pctile: E.sum5_pctile,
    watch: !!E.watch,
    provisional: !!E.provisional,
  };
}

function buyEventLabel(name) {
  const m = /(\w{3})\s+(?:\d+\s+)?(\d{4})/.exec(name || '');
  return m ? `${m[1]} '${m[2].slice(2)}` : (name || '');
}

function buyPastEvents() {
  const f = buyFeed();
  if (!f || !Array.isArray(f.events)) return [];
  return f.events.filter(e => e && e.kind !== 'current' && (e.low_date || e.price_low_date));
}

function buyEventUnix(e) {
  return isoToUnix(e.low_date || e.price_low_date);
}

/** More than one US weekday behind the last finished weekday (weekends are normal; holidays are not calendared). */
function buyEtfCutoffUtc(todayUtc) {
  const day = 86400;
  let t = todayUtc - day; // last finished UTC day
  const weekday = d => {
    const wd = new Date(d * 1000).getUTCDay(); // 0 Sun .. 6 Sat
    return wd !== 0 && wd !== 6;
  };
  while (!weekday(t)) t -= day;
  // one trading day behind that last expected print is still normal
  t -= day;
  while (!weekday(t)) t -= day;
  return t;
}

function buyPartAsOf(part, fallback) {
  if (!part) return fallback || null;
  const s = part.as_of || (part.snapshot_utc || '').slice(0, 10) || fallback || null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s || '');
  return m ? m[1] : null;
}

function buyPartIsStale(key, asOf) {
  if (!asOf) return false;
  const t = isoToUnix(asOf);
  if (t == null) return false;
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000;
  if (key === 'E') return t < buyEtfCutoffUtc(todayUtc);
  // P, C, S: more than one finished UTC day behind. B: no snapshot in 2 days. Same cutoff.
  return t < todayUtc - 2 * DAY;
}

function buyStaleNote(key, asOf) {
  if (!buyPartIsStale(key, asOf)) return '';
  const label = shortDateISO(asOf) || asOf;
  return `<div class="buy-part-stale">Data is stale: last update ${esc(label)}.</div>`;
}

function fmtSignedPct(v, d) {
  if (!isNum(v)) return 'n/a';
  const n = Number(v).toFixed(d);
  return (v > 0 ? '+' : '') + n + '%';
}

function fmtUsdB1(v) {
  if (!isNum(v)) return 'n/a';
  return '$' + Number(v).toFixed(1) + 'B';
}

/** ETF / flow sums stored in USD millions. Billions at |v| >= 1000, else millions. */
function fmtFlowM(v, preferBillions) {
  if (!isNum(v)) return 'n/a';
  if (preferBillions || Math.abs(v) >= 1000) {
    const b = v / 1000;
    const sign = b > 0 ? '+' : (b < 0 ? '-' : '');
    return sign + '$' + Math.abs(b).toFixed(2) + 'B';
  }
  const sign = v > 0 ? '+' : (v < 0 ? '-' : '');
  const a = Math.abs(v);
  const body = a >= 100 || Math.abs(a - Math.round(a)) < 0.05 ? String(Math.round(a)) : a.toFixed(1);
  return sign + '$' + body + 'M';
}

function fmtFlowExact(v) {
  if (!isNum(v)) return 'n/a';
  if (Math.abs(v) >= 1000) {
    const b = v / 1000;
    const sign = b > 0 ? '+' : (b < 0 ? '-' : '');
    return sign + '$' + Math.abs(b).toFixed(2) + 'B';
  }
  const sign = v > 0 ? '+' : (v < 0 ? '-' : '');
  const a = Math.abs(v);
  const body = Math.abs(a - Math.round(a)) < 0.05 ? String(Math.round(a)) : a.toFixed(1);
  return sign + '$' + body + 'M';
}

function buySincePhrase(stateName, since) {
  const st = (stateName || 'off').toLowerCase();
  const when = since ? shortDateISO(since) : null;
  if (st.startsWith('logging') || st === 'collecting') return '';
  const word = st === 'on' ? 'On' : st === 'turning' ? 'Turning' : 'Off';
  return when ? `${word} since ${when}.` : word + '.';
}

function buyPartMark(stateName) {
  const st = (stateName || 'off').toLowerCase();
  if (st === 'on') return sthCheck(T.positive);
  if (st === 'turning') return buyHalf(T.warning);
  if (st.startsWith('logging') || st === 'collecting') return buyHollow(T.text2);
  return sthCross(T.text2);
}

function buyPartDetails(f) {
  const parts = (f.today && f.today.parts) || {};
  const labels = f.labels || {};
  const asOfFeed = (f.today && f.today.date) || f.as_of;

  const P = parts.P || {};
  const pState = P.state || 'off';
  const pDetail = `Coinbase premium 30d ${fmtSignedPct(P.prem30_pct, 3)}, 7d ${fmtSignedPct(P.prem7_pct, 3)}. ${buySincePhrase(pState, P.since)}`.trim();

  const E = Object.assign({}, parts.E || {});
  const eState = E.state || 'off';
  let eAsOf = buyPartAsOf(E, null);
  if (!isNum(E.sum14_usd_m) || !isNum(E.sum28_usd_m)) {
    const fb = buyLastCompleteEtf();
    if (fb) {
      if (!isNum(E.sum14_usd_m)) E.sum14_usd_m = fb.etf14;
      if (!isNum(E.sum28_usd_m)) E.sum28_usd_m = fb.etf28;
      eAsOf = eAsOf || fb.date;
    }
  }
  let eDetail = `14d ${fmtFlowM(E.sum14_usd_m, true)}, 28d ${fmtFlowM(E.sum28_usd_m, true)}.`;
  if (isNum(E.sum5_usd_m)) {
    const pct = isNum(E.sum5_pctile) ? ` (${fmtOrdinal(E.sum5_pctile)} percentile)` : '';
    const when = E.sum5_as_of ? ` as of ${shortDateISO(E.sum5_as_of) || E.sum5_as_of}` : '';
    eDetail += ` 5d ${fmtFlowM(E.sum5_usd_m)}${pct}${when}.`;
  }
  eDetail += ' ' + buySincePhrase(eState, E.since);
  eDetail = eDetail.trim();
  if (eAsOf && eAsOf !== asOfFeed) eDetail += ` As of ${shortDateISO(eAsOf) || eAsOf}.`;

  const C = parts.C || {};
  const cState = C.state || 'off';
  let cTail = buySincePhrase(cState, C.since);
  if ((cState || '') === 'turning') {
    const bn = C.binance_cvd14_usd_m, cb = C.coinbase_cvd14_usd_m;
    const bnPos = isNum(bn) && bn > 0, cbPos = isNum(cb) && cb > 0;
    if (bnPos && !cbPos) cTail = 'Turning (Binance only).';
    else if (cbPos && !bnPos) cTail = 'Turning (Coinbase only).';
  }
  const cDetail = `Binance 14d ${fmtFlowM(C.binance_cvd14_usd_m)}, Coinbase 14d ${fmtFlowM(C.coinbase_cvd14_usd_m)}. ${cTail}`.trim();

  const S = parts.S || {};
  const sState = S.state || 'off';
  const sChg = isNum(S.chg30_pct) ? fmtSignedPct(S.chg30_pct, 1) + ' in 30 days' : '30-day change n/a';
  const sDetail = `${fmtUsdB1(S.supply_usd_b)}, ${sChg}. ${buySincePhrase(sState, S.since)}`.trim();

  const B = parts.B || {};
  const days = isNum(B.days_logged) ? B.days_logged : 0;
  const logging = days < 30 || (B.state && String(B.state).startsWith('logging'));
  let bDetail;
  const depth = isNum(B.coinbase_bid_1_5pct_usd_m) ? fmtFlowM(B.coinbase_bid_1_5pct_usd_m).replace(/^\+/, '') : 'n/a';
  if (logging) {
    const since = B.logging_since ? fmtUTCDate(isoToUnix(B.logging_since)) : 'Nov 15, 2026';
    bDetail = `Coinbase ${depth} within 1-5% below. Collecting data — logging since ${since} (${days} of 30 days).`;
  } else {
    bDetail = `Coinbase ${depth} within 1-5% below. ${buySincePhrase(B.state, B.since)}`.trim();
  }

  return [
    { key: 'P', label: 'US buyers paying up (key)', state: pState, detail: pDetail, asOf: buyPartAsOf(P, asOfFeed), scored: true },
    { key: 'E', label: labels.E || 'ETF money coming in', state: eState, detail: eDetail, asOf: buyPartAsOf(E, asOfFeed), scored: true, tag: (E.watch && eState !== 'on') ? 'watch' : null },
    { key: 'C', label: labels.C || 'Spot buyers hitting the ask', state: cState, detail: cDetail, asOf: buyPartAsOf(C, asOfFeed), scored: true },
    { key: 'S', label: labels.S || 'Stablecoin cash growing', state: sState, detail: sDetail, asOf: buyPartAsOf(S, asOfFeed), scored: true },
    { key: 'B', label: labels.B || 'Bids refilling below price', state: logging ? 'logging' : (B.state || 'logging'), detail: bDetail, asOf: buyPartAsOf(B, asOfFeed), scored: false },
  ];
}

function ensureBuyShell() {
  const root = $('#buyRoot');
  if (!root || root.dataset.ready) return root;
  root.innerHTML = `
    <div class="card" id="buyGaugeCard"></div>
    <div class="card buy-tf-card">
      <div class="buy-tf-row">
        <div class="pills" id="buyPills">${BUY_RANGE_PILLS.map(([id, label]) => `<button class="pill" data-buy-range="${id}">${label}</button>`).join('')}</div>
        <button type="button" class="pill" id="buyTfSelect" aria-pressed="false">Select range</button>
        <button type="button" class="pill" id="buyTfReset" hidden>Reset</button>
      </div>
      <div class="caption" id="buyTfCaption">One time range for every chart below. Press-drag-release to zoom, or use Select range on a phone. Reset returns to the preset.</div>
    </div>
    <div class="card" id="buyPremCard">
      <div class="sth-head"><div><h3>Coinbase premium</h3><div class="caption">USDT-adjusted, 7-day and 30-day averages. The 30-day average is the part that matters.</div></div></div>
      <div class="sth-chart-plot" id="buyPremPlot"></div>
      <div class="legend" id="buyPremLegend"></div>
    </div>
    <div class="card" id="buyEtfCard">
      <div class="sth-head"><div><h3>ETF money coming in</h3><div class="caption">Daily US spot ETF net flows (Farside, from Jan 2024) and a rolling 5-day sum. 14-day and 28-day sums are confirmation. Signals to watch, not trade triggers.</div></div></div>
      <div class="sth-chart-plot" id="buyEtfPlot"></div>
      <div class="legend" id="buyEtfLegend"></div>
    </div>
    <div class="card" id="buyCvdCard">
      <div class="sth-head"><div><h3>Spot buyers hitting the ask</h3><div class="caption">14-day net taker buying on Binance and Coinbase, plus Binance cumulative</div></div></div>
      <div class="sth-chart-plot" id="buyCvdPlot"></div>
      <div class="legend" id="buyCvdLegend"></div>
    </div>
    <div class="card" id="buyStableCard">
      <div class="sth-head"><div><h3>Stablecoin cash growing</h3><div class="caption">Total stablecoin supply and 30-day change</div></div></div>
      <div class="sth-chart-plot" id="buyStablePlot"></div>
      <div class="legend" id="buyStableLegend"></div>
    </div>
    <div class="card" id="buyStripCard">
      <div class="sth-head"><div><h3>Score history</h3><div class="caption" id="buyStripCaption">Buyers score (of 4) and Sellers gauge (of 3).</div></div></div>
      <div class="buy-strips-col" id="buyStripsCol">
        <div>
          <div class="sth-strip-label">Buyers score</div>
          <div class="sth-strip" id="buyBuyerStrip"><canvas id="buyBuyerStripCanvas"></canvas></div>
        </div>
        <div>
          <div class="sth-strip-label">Sellers gauge</div>
          <div class="sth-strip" id="buySellerStrip"><canvas id="buySellerStripCanvas"></canvas></div>
        </div>
        <div class="buy-strip-marker" id="buyStripMarker" hidden></div>
      </div>
      <div class="buy-strip-axis" id="buyStripAxis"></div>
      <div class="buy-strip-readout" id="buyStripReadout"></div>
    </div>`;
  bindBuyStripInspect(root);
  root.addEventListener('click', e => {
    if (e.target.closest('#buyTfSelect')) {
      buySetSelectMode(!buy.selectMode);
      const btn = $('#buyTfSelect');
      if (btn) btn.setAttribute('aria-pressed', buy.selectMode ? 'true' : 'false');
      return;
    }
    if (e.target.closest('#buyTfReset')) {
      buy.sel = { prem: null, etf: null, cvd: null, stable: null };
      buy.stripSel = null;
      buySetSelectMode(false);
      buyApplyWindow(null, null, 'reset');
      return;
    }
    const rb = e.target.closest('[data-buy-range]');
    if (rb) {
      const id = rb.dataset.buyRange;
      if (id !== buy.range || buy.win) {
        buy.range = id;
        persistBuy('tf', buy.range);
        buy.win = null;
        buy.selectMode = false;
        buy.sel = { prem: null, etf: null, cvd: null, stable: null };
        buy.stripSel = null;
        renderBuyCharts(true);
        renderBuyGaugeStrips();
      }
    }
  });
  root.dataset.ready = '1';
  return root;
}

function renderBuyGauge() {
  const el = $('#buyGaugeCard');
  if (!el) return;
  const f = buyFeed();
  if (!f || !f.today) {
    el.innerHTML = `<h3>Buyers returning</h3><div class="chart-msg">Buyers feed unavailable.</div>`;
    return;
  }
  const t = f.today;
  const score = t.score || 0;
  const color = BUY_SCORE_COLOR[score] || T.text;
  const rows = buyPartDetails(f).map(row => {
    const on = row.state === 'on';
    const turning = row.state === 'turning';
    const labelColor = on ? T.positive : turning ? T.warning : T.text;
    return `
    <div class="sth-part" data-part="${row.key}">
      ${buyPartMark(row.state)}
      <div class="sth-part-body">
        <div class="sth-part-label" style="color:${labelColor}">${esc(row.label)}${row.tag ? `<span class="buy-watch-tag">${esc(row.tag)}</span>` : ''}</div>
        <div class="sth-part-detail">${esc(row.detail)}</div>
        ${buyStaleNote(row.key, row.asOf)}
      </div>
    </div>`;
  }).join('');
  const asOf = t.date ? fmtUTCDate(isoToUnix(t.date)) : '';
  el.innerHTML = `
    ${sthStaleBanner(f)}
    <div class="sth-score-row">
      <div>
        <div class="sth-score" style="color:${color}">Buyers returning: ${score} of 4</div>
        <div class="sth-verdict" style="color:${color}">${esc(t.state || '')}</div>
        <div class="sth-asof">${asOf ? `As of ${esc(asOf)} · last finished UTC day` : ''}</div>
        ${buyComboHTML()}
      </div>
    </div>
    ${rows}
    <div class="sth-caption">${esc(f.gauge_caption || '')}</div>`;
}

function monthYearUTC(t) {
  const d = new Date(t * 1000);
  return `${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
function buyStripXAt(t, width) {
  const w = buyWindow();
  const span = Math.max(1, w.t1 - w.t0);
  return (t - w.t0) / span * width;
}
function buyStripInspectPoint(pts) {
  const vis = buyInWin(pts);
  if (!vis.length) return null;
  if (buy.stripSel == null) return vis[vis.length - 1];
  const i = nearestIdx(vis, buy.stripSel);
  return i >= 0 ? vis[i] : vis[vis.length - 1];
}
function buyStripReadoutText(p) {
  if (!p) return '';
  const when = buyUseDaily() ? fmtUTCDate(p.t) : `Week of ${fmtUTCDate(p.t)}`;
  const b = isNum(p.buyer_score) ? `${Math.round(p.buyer_score)} of 4` : 'n/a';
  const s = isNum(p.seller_score) ? `${Math.round(p.seller_score)} of 3` : 'n/a';
  return `${when} · Buyers ${b} · Sellers ${s}`;
}
function buyStripTimeLabels(pts, width) {
  const w = buyWindow();
  if (!pts.length || w.t1 <= w.t0) return { start: null, end: null, ticks: [] };
  const xOfT = t => buyStripXAt(t, width);
  const start = { kind: 'edge', align: 'start', x: 0, label: monthYearUTC(w.t0) };
  const end = { kind: 'edge', align: 'end', x: width, label: fmtUTCDate(w.t1) };
  const years = [], months = [];
  const showMonths = ((w.t1 - w.t0) / DAY) <= 800;
  let t = w.t0;
  const d0 = new Date(w.t0 * 1000);
  let prevY = d0.getUTCFullYear(), prevM = d0.getUTCMonth();
  t = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate()) / 1000 + DAY;
  for (; t < w.t1; t += DAY) {
    const d = new Date(t * 1000);
    const y = d.getUTCFullYear(), m = d.getUTCMonth();
    if (y !== prevY) {
      years.push({ kind: 'year', x: xOfT(t), label: String(y) });
      prevY = y; prevM = m;
      continue;
    }
    if (showMonths && m !== prevM && m !== 0) {
      months.push({ kind: 'month', x: xOfT(t), label: MON[m] });
      prevM = m;
    } else if (m !== prevM) {
      prevM = m;
    }
  }
  measureCtx.font = XAXIS_FONT;
  const pad = 4;
  const startW = measureCtx.measureText(start.label).width;
  const endW = measureCtx.measureText(end.label).width;
  const startBox = { lo: 0, hi: startW + pad };
  const endBox = { lo: width - endW - pad, hi: width };
  const boxes = [startBox, endBox];
  const ticks = [];
  const hitsFor = (lo, hi) => boxes.filter(b => lo < b.hi && hi > b.lo);
  const placeAt = (tick, lo, hi) => {
    if (lo < 0 || hi > width) return false;
    if (hitsFor(lo, hi).length) return false;
    boxes.push({ lo: lo - pad, hi: hi + pad });
    ticks.push({ ...tick, x: (lo + hi) / 2 });
    return true;
  };
  const tryYear = (tick, allowShift) => {
    measureCtx.font = XAXIS_FONT;
    const w = measureCtx.measureText(tick.label).width;
    const natLo = tick.x - w / 2, natHi = tick.x + w / 2;
    if (placeAt(tick, natLo, natHi)) return true;
    if (!allowShift) return false;
    const hits = hitsFor(natLo, natHi);
    const onlyStart = hits.length && hits.every(b => b === startBox);
    const onlyEnd = hits.length && hits.every(b => b === endBox);
    if (onlyStart) return placeAt(tick, startBox.hi, startBox.hi + w);
    if (onlyEnd) return placeAt(tick, endBox.lo - w, endBox.lo);
    return false;
  };
  const leftover = [];
  years.forEach(t => { if (!tryYear(t, false)) leftover.push(t); });
  leftover
    .map(t => {
      measureCtx.font = XAXIS_FONT;
      const w = measureCtx.measureText(t.label).width;
      const natLo = t.x - w / 2, natHi = t.x + w / 2;
      let shift = Infinity;
      if (natLo < startBox.hi) shift = Math.min(shift, startBox.hi - natLo);
      if (natHi > endBox.lo) shift = Math.min(shift, natHi - endBox.lo);
      return { t, shift };
    })
    .sort((a, b) => a.shift - b.shift)
    .forEach(({ t }) => tryYear(t, true));
  const monthFont = '10px -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif';
  months.forEach(tick => {
    measureCtx.font = monthFont;
    const w = measureCtx.measureText(tick.label).width;
    placeAt(tick, tick.x - w / 2, tick.x + w / 2);
  });
  return { start, end, ticks };
}
function renderBuyStripAxis(pts) {
  const el = $('#buyStripAxis');
  const col = $('#buyStripsCol');
  if (!el) return;
  if (!pts.length || !col) { el.innerHTML = ''; return; }
  const width = col.clientWidth;
  const { start, end, ticks } = buyStripTimeLabels(pts, width);
  const parts = [];
  if (start) parts.push(`<span class="buy-strip-edge start">${esc(start.label)}</span>`);
  for (const t of ticks) {
    parts.push(`<span class="buy-strip-tick ${t.kind}" style="left:${t.x.toFixed(1)}px">${esc(t.label)}</span>`);
  }
  if (end) parts.push(`<span class="buy-strip-edge end">${esc(end.label)}</span>`);
  el.innerHTML = parts.join('');
}
function renderBuyStripReadout(pts) {
  const el = $('#buyStripReadout');
  if (!el) return;
  el.textContent = buyStripReadoutText(buyStripInspectPoint(pts));
}
function updateBuyStripMarker(pts) {
  const col = $('#buyStripsCol'), marker = $('#buyStripMarker');
  const a = $('#buyBuyerStrip'), b = $('#buySellerStrip');
  if (!col || !marker || !a || !b || !pts.length) { if (marker) marker.hidden = true; return; }
  const p = buyStripInspectPoint(pts);
  const i = p ? nearestIdx(pts, p.t) : -1;
  if (i < 0) { marker.hidden = true; return; }
  const cr = col.getBoundingClientRect();
  const ar = a.getBoundingClientRect();
  const br = b.getBoundingClientRect();
  const x = Math.max(1, Math.min(cr.width - 1, buyStripXAt(p.t, cr.width)));
  marker.hidden = false;
  marker.style.left = `${Math.round(x)}px`;
  marker.style.top = `${Math.round(ar.top - cr.top)}px`;
  marker.style.height = `${Math.round(br.bottom - ar.top)}px`;
}
function updateBuyStripInspect() {
  const pts = buy.points.length ? buy.points : buyPoints();
  updateBuyStripMarker(pts);
  renderBuyStripReadout(pts);
}
function bindBuyStripInspect(root) {
  const col = root.querySelector('#buyStripsCol');
  if (!col || col.dataset.bound) return;
  col.dataset.bound = '1';
  const idxFromEvent = e => {
    const pts = buyInWin(buy.points);
    if (!pts.length) return -1;
    const r = col.getBoundingClientRect();
    const x = Math.max(0, Math.min(r.width, e.clientX - r.left));
    const w = buyWindow();
    const t = w.t0 + (x / Math.max(r.width, 1)) * (w.t1 - w.t0);
    return nearestIdx(pts, t);
  };
  const apply = i => {
    const pts = buyInWin(buy.points);
    if (i < 0 || !pts[i]) return;
    buy.stripSel = pts[i].t;
    buy.sel.prem = buy.sel.etf = buy.sel.cvd = buy.sel.stable = pts[i].t;
    updateBuyStripInspect();
    renderBuyPremLegend(); renderBuyEtfLegend(); renderBuyCvdLegend(); renderBuyStableLegend();
  };
  let dragging = false;
  col.addEventListener('pointerdown', e => {
    dragging = true;
    try { col.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    apply(idxFromEvent(e));
  });
  col.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse' && !dragging) { apply(idxFromEvent(e)); return; }
    if (dragging) apply(idxFromEvent(e));
  });
  const end = () => { dragging = false; };
  col.addEventListener('pointerup', end);
  col.addEventListener('pointercancel', end);
  col.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !dragging && buy.stripSel == null) updateBuyStripInspect(); });
}

function drawScoreStrip(canvas, values, palette, fallback) {
  if (!canvas) return;
  const wrap = canvas.parentElement;
  const w = Math.max(1, wrap.clientWidth);
  const h = Math.max(1, wrap.clientHeight);
  const dpr = devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!values.length) return;
  const n = values.length;
  const bw = w / n;
  const maxS = Math.max(1, ...values.map(v => (v == null ? 0 : v)), 1);
  for (let i = 0; i < n; i++) {
    const s = values[i];
    if (s == null) continue;
    const key = Math.round(s);
    ctx.fillStyle = palette[key] || fallback;
    const bh = ((s + 1) / (maxS + 1)) * (h - 2);
    ctx.fillRect(Math.floor(i * bw), h - bh, Math.max(1, Math.ceil(bw)), bh);
  }
}

function drawBuyScoreStrip(canvas, pts, field, palette, fallback) {
  if (!canvas) return;
  const wrap = canvas.parentElement;
  const width = Math.max(1, wrap.clientWidth);
  const height = Math.max(1, wrap.clientHeight);
  const dpr = devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const vis = buyInWin(pts);
  if (!vis.length) return;
  const w = buyWindow();
  const span = Math.max(1, w.t1 - w.t0);
  const dayW = width / (span / DAY);
  const bw = Math.max(1, (buyUseDaily() ? dayW : dayW * 7) * 0.85);
  const maxS = Math.max(1, ...vis.map(p => (isNum(p[field]) ? p[field] : 0)), 1);
  for (const p of vis) {
    const s = p[field];
    if (s == null) continue;
    const x = (p.t - w.t0) / span * width;
    const key = Math.round(s);
    ctx.fillStyle = palette[key] || fallback;
    const bh = ((s + 1) / (maxS + 1)) * (height - 2);
    ctx.fillRect(x - bw / 2, height - bh, bw, bh);
  }
}
function renderBuyGaugeStrips() {
  const pts = buy.points.length ? buy.points : buyPoints();
  const cap = $('#buyStripCaption');
  if (cap) cap.textContent = 'Buyers score (of 4) and Sellers gauge (of 3), one bar per ' + (buyUseDaily() ? 'day.' : 'week.') + ' Same time range as the charts above.';
  drawBuyScoreStrip($('#buyBuyerStripCanvas'), pts, 'buyer_score', BUY_STRIP_FILL, BUY_STRIP_FILL[0]);
  drawBuyScoreStrip($('#buySellerStripCanvas'), pts, 'seller_score', STH_STRIP_FILL, STH_STRIP_FILL[0]);
  renderBuyStripAxis(pts);
  updateBuyStripInspect();
}

function buyLegendCap(key, pts) {
  const t = buy.sel[key];
  if (t != null) return `Inspecting · ${fmtUTCDate(t)}`;
  const last = pts.length ? pts[pts.length - 1].t : null;
  return last ? `Latest · ${fmtUTCDate(last)} · touch the chart to inspect` : '';
}

function buyAt(pts, t) {
  const vis = buyInWin(pts);
  const src = vis.length ? vis : pts;
  if (!src.length) return null;
  if (t == null) return src[src.length - 1];
  const i = nearestIdx(src, t);
  return i >= 0 ? src[i] : src[src.length - 1];
}

function renderBuyPremLegend() {
  const el = $('#buyPremLegend'); if (!el) return;
  const pts = buy.points;
  const p = buyAt(pts, buy.sel.prem);
  el.innerHTML = `<div class="legend-cap">${esc(buyLegendCap('prem', pts))}</div>` +
    rowHTML('30-day premium', rgba(0.30, 0.85, 0.62), p && isNum(p.prem30) ? fmtSignedPct(p.prem30, 3) : null) +
    rowHTML('7-day premium', rgba(0.40, 0.78, 0.85), p && isNum(p.prem7) ? fmtSignedPct(p.prem7, 3) : null) +
    rowHTML('BTC price', T.accent, p && isNum(p.price) ? usd(p.price) : null);
}

function rowLineHTML(name, color, val, dashed) {
  const sw = dashed
    ? `<span class="ldot line dashed" style="background:${color}"></span>`
    : `<span class="ldot line" style="background:${color}"></span>`;
  return `<div class="lrow">${sw}<span class="ltitle">${esc(name)}</span><span class="lval" style="color:${val == null ? T.text2 : color}">${val == null ? 'n/a' : esc(val)}</span></div>`;
}

function buyEtfInspectCap(pts) {
  const vis = buyInWin(pts);
  const p = buyAt(vis.length ? vis : pts, buy.sel.etf);
  if (!p || !isNum(p.etf)) return buyLegendCap('etf', vis.length ? vis : pts);
  const tag = p.provisional ? ' · provisional' : '';
  const flow = fmtFlowExact(p.etf);
  if (buy.sel.etf != null) return `${fmtUTCDate(p.t)} · ${flow}${tag}`;
  return `Latest · ${fmtUTCDate(p.t)} · ${flow}${tag} · touch a day to inspect`;
}

function renderBuyEtfLegend() {
  const el = $('#buyEtfLegend'); if (!el) return;
  const pts = buy.etfPoints;
  const p = buyAt(pts, buy.sel.etf);
  const view = buyEtfView(buy.points);
  const conf = view && view.point;
  const inspecting = buy.sel.etf != null;
  const head = buyEtfHeadline();
  const sum5 = p && isNum(p.etf5) ? p.etf5 : (inspecting ? null : head.sum5);
  const pctile = p && isNum(p.etf5_pctile) ? p.etf5_pctile : (inspecting ? null : head.pctile);
  const pctTxt = isNum(pctile) ? `${fmtOrdinal(pctile)} percentile` : '';
  const sum5Txt = isNum(sum5) ? fmtFlowM(sum5) + (pctTxt ? ` · ${pctTxt}` : '') : null;
  const dailyTxt = p && isNum(p.etf) ? fmtFlowExact(p.etf) : null;
  const th = buyEtfThresholds();
  el.innerHTML = `<div class="legend-cap">${esc(buyEtfInspectCap(pts))}</div>` +
    rowHTML('Daily net flow', p && isNum(p.etf) && p.etf >= 0 ? T.positive : T.negative, dailyTxt) +
    rowHTML('5-day sum', 'rgba(245, 220, 140, 0.95)', sum5Txt) +
    rowLineHTML('Turn line (ETF-era median 5d)', 'rgba(245, 220, 140, 0.8)', isNum(th.median) ? fmtFlowM(th.median) : null, false) +
    rowLineHTML('Decisive inflow (90th pct)', 'rgba(51, 199, 122, 0.85)', isNum(th.p90) ? fmtFlowM(th.p90) : null, true) +
    rowLineHTML('Decisive outflow (10th pct)', 'rgba(242, 89, 97, 0.85)', isNum(th.p10) ? fmtFlowM(th.p10) : null, true) +
    `<div class="legend-split">Confirmation</div>` +
    rowHTML('14-day ETF flows', rgba(0.35, 0.72, 0.95), conf && isNum(conf.etf14) ? fmtFlowM(conf.etf14, true) : null) +
    rowHTML('28-day ETF flows', rgba(0.72, 0.55, 0.95), conf && isNum(conf.etf28) ? fmtFlowM(conf.etf28, true) : null);
}

function renderBuyCvdLegend() {
  const el = $('#buyCvdLegend'); if (!el) return;
  const pts = buy.points;
  const p = buyAt(pts, buy.sel.cvd);
  el.innerHTML = `<div class="legend-cap">${esc(buyLegendCap('cvd', pts))}</div>` +
    rowHTML('Binance 14d', rgba(0.30, 0.82, 0.78), p && isNum(p.bn14) ? fmtFlowM(p.bn14) : null) +
    rowHTML('Coinbase 14d', COL.coinbase, p && isNum(p.cb14) ? fmtFlowM(p.cb14) : null) +
    rowHTML('Binance cumulative', rgba(0.85, 0.85, 0.90), p && isNum(p.bn_cum) ? (p.bn_cum > 0 ? '+' : '') + fx(p.bn_cum, 1) + 'B' : null);
}

function renderBuyStableLegend() {
  const el = $('#buyStableLegend'); if (!el) return;
  const pts = buy.points;
  const p = buyAt(pts, buy.sel.stable);
  el.innerHTML = `<div class="legend-cap">${esc(buyLegendCap('stable', pts))}</div>` +
    rowHTML('Stablecoin supply', rgba(0.40, 0.78, 0.95), p && isNum(p.stable) ? fmtUsdB1(p.stable) : null) +
    rowHTML('30-day change', p && isNum(p.stable30) && p.stable30 >= 0 ? T.positive : T.negative, p && isNum(p.stable30) ? fmtSignedPct(p.stable30, 1) : null);
}

function destroyBuyPlot(key) {
  if (buy.plots[key]) { buy.plots[key].destroy(); buy.plots[key] = null; }
}

function buyCursorHook(key) {
  return u => {
    if (buy.syncing) return;
    const left = u.cursor.left;
    let t = null;
    if (left != null && left >= 0 && u.cursor.idx != null) t = u.posToVal(left, 'x');
    if (t === buy.sel[key]) return;
    buy.syncing = true;
    buy.sel.prem = buy.sel.etf = buy.sel.cvd = buy.sel.stable = t;
    buy.stripSel = t;
    Object.keys(buy.plots).forEach(k => {
      if (k === key) return;
      const p = buy.plots[k];
      if (!p) return;
      if (t == null) p.setCursor({ left: -10, top: -10 });
      else p.setCursor({ left: p.valToPos(t, 'x'), top: 10 });
    });
    buy.syncing = false;
    renderBuyPremLegend();
    renderBuyEtfLegend();
    renderBuyCvdLegend();
    renderBuyStableLegend();
    updateBuyStripInspect();
  };
}

function buyEventsInRange(xd) {
  return buyPastEvents().map(e => ({ ...e, t: buyEventUnix(e) })).filter(e => e.t != null && e.t >= xd[0] && e.t <= xd[1]);
}

function drawEventGuides(u, evs, dashed) {
  const ctx = u.ctx, dpr = devicePixelRatio;
  ctx.setLineDash(dashed ? [2 * dpr, 3 * dpr] : [2 * dpr, 3 * dpr]);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1 * dpr;
  for (const e of evs) {
    const x = Math.round(u.valToPos(e.t, 'x', true));
    ctx.beginPath(); ctx.moveTo(x, u.bbox.top); ctx.lineTo(x, u.bbox.top + u.bbox.height); ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawZeroLine(u) {
  const ctx = u.ctx, dpr = devicePixelRatio;
  const y0 = u.valToPos(0, 'y', true);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1.2 * dpr;
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(u.bbox.left, y0); ctx.lineTo(u.bbox.left + u.bbox.width, y0); ctx.stroke();
}

function fillAroundZero(u, xs, ys) {
  const ctx = u.ctx;
  const xPos = t => u.valToPos(t, 'x', true);
  const yPos = v => u.valToPos(v, 'y', true);
  const y0 = u.valToPos(0, 'y', true);
  const fillSeg = (t0, v0, t1, v1, above) => {
    ctx.beginPath();
    ctx.moveTo(xPos(t0), y0);
    ctx.lineTo(xPos(t0), yPos(v0));
    ctx.lineTo(xPos(t1), yPos(v1));
    ctx.lineTo(xPos(t1), y0);
    ctx.closePath();
    ctx.fillStyle = above ? 'rgba(51,199,122,0.22)' : 'rgba(242,89,97,0.22)';
    ctx.fill();
  };
  for (let i = 0; i < xs.length - 1; i++) {
    const v0 = ys[i], v1 = ys[i + 1];
    if (v0 == null || v1 == null) continue;
    const t0 = xs[i], t1 = xs[i + 1];
    const a0 = v0 >= 0, a1 = v1 >= 0;
    if (a0 === a1) fillSeg(t0, v0, t1, v1, a0);
    else {
      const f = (0 - v0) / (v1 - v0);
      const tc = t0 + f * (t1 - t0);
      fillSeg(t0, v0, tc, 0, a0);
      fillSeg(tc, 0, t1, v1, a1);
    }
  }
}

function drawSignedBars(u, pts, values, colorFor, offsetFrac, widthFrac) {
  const ctx = u.ctx, dpr = devicePixelRatio, dataX = u.data[0];
  let spacing = Infinity;
  for (let i = 1; i < dataX.length; i++) {
    const d = u.valToPos(dataX[i], 'x', true) - u.valToPos(dataX[i - 1], 'x', true);
    if (d > 0 && d < spacing) spacing = d;
  }
  if (!isFinite(spacing)) spacing = 6 * dpr;
  const w = Math.max(1.2 * dpr, spacing * widthFrac);
  const y0 = u.valToPos(0, 'y', true);
  for (let i = 0; i < pts.length; i++) {
    const v = values[i]; if (v == null) continue;
    const x = u.valToPos(pts[i].t, 'x', true) + offsetFrac * spacing;
    const y = u.valToPos(v, 'y', true);
    ctx.fillStyle = colorFor(v);
    ctx.fillRect(x - w / 2, Math.min(y, y0), w, Math.max(dpr, Math.abs(y0 - y)));
  }
}

function renderBuyPremChart() {
  const el = $('#buyPremPlot'); if (!el) return;
  destroyBuyPlot('prem');
  const pts = buy.points;
  if (!pts.length) { el.innerHTML = '<div class="chart-msg">No premium history in this range.</div>'; return; }
  el.innerHTML = '';
  const width = Math.max(200, el.clientWidth);
  const height = 210;
  const xs = pts.map(p => p.t);
  const p30 = pts.map(p => isNum(p.prem30) ? p.prem30 : null);
  const p7 = pts.map(p => isNum(p.prem7) ? p.prem7 : null);
  const px = pts.map(p => isNum(p.price) ? p.price : null);
  const xd = buyXRange();
  const vis = buyInWin(pts);
  const prices = vis.map(p => p.price).filter(v => v > 0);
  const pLo = prices.length ? Math.min(...prices) : 1, pHi = prices.length ? Math.max(...prices) : 1;
  const useLog = !buyUseDaily();
  const y2range = useLog ? [pLo / 1.25, pHi * 1.15] : [pLo * 0.92, pHi * 1.08];
  const evs = buyEventsInRange(xd);
  const marks = new Array(xs.length).fill(null);
  evs.forEach(e => {
    const i = nearestIdx(pts, e.t);
    if (i >= 0) marks[i] = pts[i].prem30;
  });
  const premVals = vis.flatMap(p => [p.prem30, p.prem7]).filter(isNum);
  let lo = Math.min(-0.05, ...premVals, 0), hi = Math.max(0.05, ...premVals, 0);
  const pad = (hi - lo) * 0.12;
  lo -= pad; hi += pad;
  const opts = buyBaseOpts(width, height);
  opts.padding = [10, 0, 0, 4];
  opts.scales.y = { range: () => [lo, hi] };
  opts.scales.y2 = { range: () => y2range, distr: useLog ? 3 : 1 };
  buyPushYAxes(
    opts,
    v => v == null ? '' : fmtSignedPct(v, 3).replace('+', ''),
    v => v == null ? '' : (useLog ? histCompact(v) : axisUSD(v)),
  );
  opts.series = [
    {},
    { label: '30d', scale: 'y', stroke: rgba(0.30, 0.85, 0.62), width: 1.8, spanGaps: true, points: { show: false } },
    { label: '7d', scale: 'y', stroke: rgba(0.40, 0.78, 0.85), width: 1.3, spanGaps: true, points: { show: false } },
    { label: 'BTC', scale: 'y2', stroke: T.accent, width: 1.3, spanGaps: true, points: { show: false } },
    { label: 'Lows', scale: 'y', stroke: '#fff', width: 0, paths: () => null, points: { show: true, size: 7, fill: '#fff', stroke: 'rgba(0,0,0,0.55)', width: 1, space: 0 } },
  ];
  opts.hooks = {
    setCursor: [buyCursorHook('prem')],
    draw: [u => {
      const ctx = u.ctx;
      ctx.save();
      ctx.beginPath(); ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height); ctx.clip();
      fillAroundZero(u, u.data[0], u.data[1]);
      drawZeroLine(u);
      drawEventGuides(u, evs, true);
      ctx.restore();
      placeSthEventLabels(u, evs.map(e => ({ ...e, name: buyEventLabel(e.name) })), el);
    }],
  };
  mountBuyPlot('prem', opts, [xs, p30, p7, px, marks], el);
  renderBuyPremLegend();
}

function fmtAxisFlow(v) {
  if (v == null) return '';
  if (Math.abs(v) >= 1000) {
    const b = v / 1000;
    const sign = b < 0 ? '-' : '';
    return sign + '$' + Math.abs(b).toFixed(Math.abs(b) >= 10 ? 0 : 1) + 'B';
  }
  const sign = v < 0 ? '-' : '';
  return sign + '$' + Math.abs(v).toFixed(0) + 'M';
}

function drawEtfGuideLines(u, lines) {
  const ctx = u.ctx, dpr = devicePixelRatio;
  const left = u.bbox.left, right = u.bbox.left + u.bbox.width;
  const top = u.bbox.top, bot = u.bbox.top + u.bbox.height;
  ctx.save();
  ctx.font = '10px -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  const placed = [];
  for (const ln of lines) {
    if (!isNum(ln.y)) continue;
    const y = u.valToPos(ln.y, 'y2', true);
    if (y < top + 1 || y > bot - 1) continue;
    ctx.setLineDash(ln.dash ? [3 * dpr, 4 * dpr] : []);
    ctx.strokeStyle = ln.color;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 0.8 * dpr;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    ctx.setLineDash([]);
    if (ln.label) {
      let ty = y - 2 * dpr;
      if (ty - 11 < top) ty = y + 12 * dpr;
      for (const py of placed) {
        if (Math.abs(ty - py) < 11) ty = py - 11;
      }
      ty = Math.max(top + 10, Math.min(bot - 1, ty));
      placed.push(ty);
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = ln.color;
      ctx.fillText(ln.label, right - 3 * dpr, ty);
    }
  }
  ctx.restore();
}

function renderBuyEtfChart() {
  const el = $('#buyEtfPlot'); if (!el) return;
  destroyBuyPlot('etf');
  const pts = buy.etfPoints;
  if (!pts.length) { el.innerHTML = '<div class="chart-msg">No daily ETF-flow history in this range.</div>'; return; }
  el.innerHTML = '';
  const width = Math.max(200, el.clientWidth);
  const height = 220;
  const xs = pts.map(p => p.t);
  const daily = pts.map(p => isNum(p.etf) ? p.etf : null);
  const sum5 = pts.map(p => isNum(p.etf5) ? p.etf5 : null);
  const xd = buyXRange();
  const evs = buyEventsInRange(xd);
  const th = buyEtfThresholds();
  const guides = [
    { y: th.p90, color: 'rgba(51, 199, 122, 0.45)', dash: true, label: isNum(th.p90) ? `decisive inflow ${fmtFlowM(th.p90)}` : '' },
    { y: th.median, color: 'rgba(245, 220, 140, 0.5)', dash: false, label: isNum(th.median) ? `turn line ${fmtFlowM(th.median)}` : '' },
    { y: th.p10, color: 'rgba(242, 89, 97, 0.45)', dash: true, label: isNum(th.p10) ? `decisive outflow ${fmtFlowM(th.p10)}` : '' },
  ];
  const vis = buyInWin(pts);
  const dailyVals = vis.map(p => p.etf).filter(isNum);
  let lo = Math.min(0, ...dailyVals), hi = Math.max(0, ...dailyVals);
  if (lo === 0 && hi === 0) { lo = -1; hi = 1; }
  const pad = Math.max(hi - lo, 1) * 0.12;
  lo -= pad; hi += pad;
  const sum5Vals = vis.map(p => p.etf5).filter(isNum).concat(guides.map(g => g.y)).filter(isNum);
  let sLo = Math.min(0, ...sum5Vals), sHi = Math.max(0, ...sum5Vals);
  if (sLo === 0 && sHi === 0) { sLo = -1; sHi = 1; }
  const sPad = Math.max(sHi - sLo, 1) * 0.10;
  sLo -= sPad; sHi += sPad;
  const opts = buyBaseOpts(width, height);
  opts.padding = [14, 0, 0, 4];
  opts.scales.y = { range: () => [lo, hi] };
  opts.scales.y2 = { range: () => [sLo, sHi] };
  buyPushYAxes(opts, fmtAxisFlow, fmtAxisFlow, 'rgba(200, 200, 210, 0.45)');
  opts.series = [
    {},
    { stroke: 'transparent', width: 0, paths: () => null, points: { show: false } },
    { label: '5-day', scale: 'y2', stroke: 'rgba(245, 220, 140, 0.5)', width: 1.15, spanGaps: true, points: { show: false } },
  ];
  opts.hooks = {
    setCursor: [buyCursorHook('etf')],
    draw: [u => {
      const ctx = u.ctx;
      ctx.save();
      ctx.beginPath(); ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height); ctx.clip();
      const colorFor = (v, i) => {
        const prov = pts[i] && pts[i].provisional;
        const a = prov ? 0.35 : 0.9;
        return v >= 0 ? `rgba(51, 199, 122, ${a})` : `rgba(242, 89, 97, ${a})`;
      };
      // drawSignedBars only passes the value; draw bars here so provisional days can be lighter.
      const dpr = devicePixelRatio, dataX = u.data[0];
      let spacing = Infinity;
      for (let i = 1; i < dataX.length; i++) {
        const d = u.valToPos(dataX[i], 'x', true) - u.valToPos(dataX[i - 1], 'x', true);
        if (d > 0 && d < spacing) spacing = d;
      }
      if (!isFinite(spacing)) spacing = 6 * dpr;
      // Calendar-day spacing makes weekday bars distinct at 3M; weekends stay as gaps.
      const dayPx = u.valToPos(xd[0] + DAY, 'x', true) - u.valToPos(xd[0], 'x', true);
      const w = Math.max(2 * dpr, Math.abs(dayPx) * 0.78);
      const y0 = u.valToPos(0, 'y', true);
      let provX = null, provY = null;
      for (let i = 0; i < pts.length; i++) {
        const v = daily[i]; if (v == null) continue;
        const x = u.valToPos(pts[i].t, 'x', true);
        const y = u.valToPos(v, 'y', true);
        ctx.fillStyle = colorFor(v, i);
        ctx.fillRect(x - w / 2, Math.min(y, y0), w, Math.max(dpr, Math.abs(y0 - y)));
        if (pts[i].provisional) { provX = x; provY = Math.min(y, y0); }
      }
      drawZeroLine(u);
      drawEtfGuideLines(u, guides);
      drawEventGuides(u, evs, true);
      if (provX != null) {
        ctx.font = '10px -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = T.text2;
        const label = 'provisional';
        const tw = ctx.measureText(label).width;
        const tx = Math.max(u.bbox.left + tw / 2 + 2, Math.min(u.bbox.left + u.bbox.width - tw / 2 - 2, provX));
        ctx.fillText(label, tx, (provY || y0) - 2 * dpr);
      }
      ctx.restore();
    }],
  };
  mountBuyPlot('etf', opts, [xs, daily, sum5], el);
  renderBuyEtfLegend();
}

function renderBuyCvdChart() {
  const el = $('#buyCvdPlot'); if (!el) return;
  destroyBuyPlot('cvd');
  const pts = buy.points;
  if (!pts.length) { el.innerHTML = '<div class="chart-msg">No spot-buying history in this range.</div>'; return; }
  el.innerHTML = '';
  const width = Math.max(200, el.clientWidth);
  const height = 210;
  const xs = pts.map(p => p.t);
  const bn = pts.map(p => isNum(p.bn14) ? p.bn14 : null);
  const cb = pts.map(p => isNum(p.cb14) ? p.cb14 : null);
  const cum = pts.map(p => isNum(p.bn_cum) ? p.bn_cum : null);
  const xd = buyXRange();
  const evs = buyEventsInRange(xd);
  const vis = buyInWin(pts);
  const barVals = vis.flatMap(p => [p.bn14, p.cb14]).filter(isNum);
  let lo = Math.min(0, ...barVals), hi = Math.max(0, ...barVals);
  if (lo === 0 && hi === 0) { lo = -1; hi = 1; }
  const pad = Math.max(hi, -lo) * 0.08;
  lo -= pad; hi += pad;
  const cums = vis.map(p => p.bn_cum).filter(isNum);
  let cLo = cums.length ? Math.min(...cums) : 0, cHi = cums.length ? Math.max(...cums) : 1;
  if (cLo === cHi) { cLo -= 1; cHi += 1; }
  const cPad = (cHi - cLo) * 0.12;
  cLo -= cPad; cHi += cPad;
  const opts = buyBaseOpts(width, height);
  opts.padding = [10, 0, 0, 4];
  opts.scales.y = { range: () => [lo, hi] };
  opts.scales.y2 = { range: () => [cLo, cHi] };
  buyPushYAxes(opts, fmtAxisFlow, v => v == null ? '' : fx(v, 0) + 'B');
  opts.series = [
    {},
    { stroke: 'transparent', width: 0, paths: () => null, points: { show: false } },
    { label: 'Cumulative', scale: 'y2', stroke: 'rgba(220,220,230,0.9)', width: 1.4, spanGaps: true, points: { show: false } },
  ];
  opts.hooks = {
    setCursor: [buyCursorHook('cvd')],
    draw: [u => {
      const ctx = u.ctx;
      ctx.save();
      ctx.beginPath(); ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height); ctx.clip();
      const colBn = v => v >= 0 ? 'rgba(70, 210, 195, 0.95)' : 'rgba(50, 140, 135, 0.85)';
      const colCb = v => v >= 0 ? COL.coinbase : COL.coinbaseDown;
      drawSignedBars(u, pts, bn, colBn, -0.16, 0.42);
      drawSignedBars(u, pts, cb, colCb, 0.16, 0.42);
      drawZeroLine(u);
      drawEventGuides(u, evs, true);
      ctx.restore();
    }],
  };
  mountBuyPlot('cvd', opts, [xs, bn, cum], el);
  renderBuyCvdLegend();
}

function robustRange(vals, padFrac, includeZero) {
  const v = vals.filter(isNum).slice().sort((a, b) => a - b);
  if (!v.length) return includeZero ? [-1, 1] : [0, 1];
  const loI = Math.floor(v.length * 0.05);
  const hiI = Math.max(loI, Math.ceil(v.length * 0.95) - 1);
  let lo = v[loI], hi = v[hiI];
  if (includeZero) { lo = Math.min(0, lo); hi = Math.max(0, hi); }
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * (padFrac || 0.12) || 1;
  return [lo - pad, hi + pad];
}
/** 2nd–98th of the visible window, symmetric around zero. A one-sided tail does not set the scale. Latest print stays on-scale. */
function clipSymRange(vals, latest) {
  const v = vals.filter(isNum).slice().sort((a, b) => a - b);
  if (!v.length) return [-1, 1];
  const at = (arr, p) => arr[Math.min(arr.length - 1, Math.max(0, Math.round((arr.length - 1) * p)))];
  const qLo = at(v, 0.02), qHi = at(v, 0.98);
  let half = Math.max(Math.abs(qLo), Math.abs(qHi), 1e-6);
  const tight = Math.min(Math.abs(qLo) || half, Math.abs(qHi) || half);
  if (tight > 0 && half > tight * 2.5) {
    const abs = v.map(x => Math.abs(x)).sort((a, b) => a - b);
    half = Math.max(tight * 2.5, at(abs, 0.85));
  }
  if (isNum(latest)) half = Math.max(half, Math.abs(latest));
  const pad = half * 0.12 || 0.5;
  return [-(half + pad), half + pad];
}

function renderBuyStableChart() {
  const el = $('#buyStablePlot'); if (!el) return;
  destroyBuyPlot('stable');
  const pts = buy.points;
  if (!pts.length) { el.innerHTML = '<div class="chart-msg">No stablecoin history in this range.</div>'; return; }
  el.innerHTML = '';
  const width = Math.max(200, el.clientWidth);
  const height = 210;
  const xs = pts.map(p => p.t);
  const sup = pts.map(p => isNum(p.stable) ? p.stable : null);
  const chg = pts.map(p => isNum(p.stable30) ? p.stable30 : null);
  const xd = buyXRange();
  const evs = buyEventsInRange(xd);
  const vis = buyInWin(pts);
  const svals = vis.map(p => p.stable).filter(isNum);
  let sLo = svals.length ? Math.min(...svals) : 0, sHi = svals.length ? Math.max(...svals) : 1;
  const sPad = (sHi - sLo) * 0.12 || 1;
  sLo -= sPad; sHi += sPad;
  const visChg = vis.map(p => p.stable30);
  const latestChg = [...visChg].reverse().find(isNum);
  const [cLo, cHi] = clipSymRange(visChg, latestChg);
  const opts = buyBaseOpts(width, height);
  opts.padding = [10, 0, 0, 4];
  opts.scales.y = { range: () => [sLo, sHi] };
  opts.scales.y2 = { range: () => [cLo, cHi] };
  buyPushYAxes(opts, v => v == null ? '' : fmtUsdB1(v), v => v == null ? '' : fx(v, 1) + '%');
  opts.series = [
    {},
    { label: 'Supply', scale: 'y', stroke: rgba(0.40, 0.78, 0.95), width: 1.8, spanGaps: true, points: { show: false } },
    { label: '30d', scale: 'y2', stroke: 'transparent', width: 0, paths: () => null, points: { show: false } },
  ];
  opts.hooks = {
    setCursor: [buyCursorHook('stable')],
    draw: [u => {
      const ctx = u.ctx, dpr = devicePixelRatio;
      ctx.save();
      ctx.beginPath(); ctx.rect(u.bbox.left, u.bbox.top, u.bbox.width, u.bbox.height); ctx.clip();
      // 30d % bars on y2
      const dataX = u.data[0];
      let spacing = Infinity;
      for (let i = 1; i < dataX.length; i++) {
        const d = u.valToPos(dataX[i], 'x', true) - u.valToPos(dataX[i - 1], 'x', true);
        if (d > 0 && d < spacing) spacing = d;
      }
      if (!isFinite(spacing)) spacing = 6 * dpr;
      const w = Math.max(1.2 * dpr, spacing * 0.62);
      const y0 = u.valToPos(0, 'y2', true);
      for (let i = 0; i < pts.length; i++) {
        const v = chg[i]; if (v == null) continue;
        const x = u.valToPos(pts[i].t, 'x', true);
        const clippedHi = v > cHi, clippedLo = v < cLo;
        const vDraw = clippedHi ? cHi : (clippedLo ? cLo : v);
        const y = u.valToPos(vDraw, 'y2', true);
        const col = v >= 0 ? 'rgba(51,199,122,0.35)' : 'rgba(242,89,97,0.35)';
        ctx.fillStyle = col;
        ctx.fillRect(x - w / 2, Math.min(y, y0), w, Math.max(dpr, Math.abs(y0 - y)));
        if (clippedHi || clippedLo) {
          const ah = 5 * dpr, aw = 3.5 * dpr, up = clippedHi;
          const tip = y + (up ? 1 : -1);
          ctx.beginPath();
          ctx.moveTo(x, tip);
          ctx.lineTo(x - aw, tip + (up ? ah : -ah));
          ctx.lineTo(x + aw, tip + (up ? ah : -ah));
          ctx.closePath();
          ctx.fillStyle = v >= 0 ? 'rgba(51,199,122,0.95)' : 'rgba(242,89,97,0.95)';
          ctx.fill();
        }
      }
      const yZero = u.valToPos(0, 'y2', true);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath(); ctx.moveTo(u.bbox.left, yZero); ctx.lineTo(u.bbox.left + u.bbox.width, yZero); ctx.stroke();
      drawEventGuides(u, evs, true);
      ctx.restore();
    }],
  };
  mountBuyPlot('stable', opts, [xs, sup, chg], el);
  renderBuyStableLegend();
}

function renderBuyCharts(force) {
  const root = ensureBuyShell();
  if (!root) return;
  syncBuyTfChrome();
  const el = $('#buyPremPlot');
  const w = el ? el.clientWidth : 0;
  if (!force && w && w === buy.width && buy.plots.prem && buy.plots.etf && buy.plots.cvd && buy.plots.stable) {
    renderBuyPremLegend(); renderBuyEtfLegend(); renderBuyCvdLegend(); renderBuyStableLegend();
    return;
  }
  buy.points = buyPoints();
  buy.etfPoints = buyEtfDailyPoints();
  buy.width = w;
  if (!buyFeed()) {
    ['buyPremPlot', 'buyEtfPlot', 'buyCvdPlot', 'buyStablePlot'].forEach(id => {
      const n = $('#' + id); if (n) n.innerHTML = '<div class="chart-msg">Buyers feed unavailable.</div>';
    });
    return;
  }
  renderBuyPremChart();
  renderBuyEtfChart();
  renderBuyCvdChart();
  renderBuyStableChart();
  renderBuyGaugeStrips();
}

function renderBuyers() {
  ensureBuyShell();
  renderBuyGauge();
  renderBuyCharts(true);
}


// ---------- app shell ----------
function setSpinner() { const busy = state.loading || state.feedsLoading; $('#spinner').hidden = !busy; $('#refreshBtn').disabled = !!busy; }
function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  $('#view-overview').hidden = tab !== 'overview';
  $('#view-chart').hidden = tab !== 'chart';
  $('#view-sellers').hidden = tab !== 'sellers';
  const vb = $('#view-buyers'); if (vb) vb.hidden = tab !== 'buyers';
  $('#topbarTitle').textContent = tab === 'chart' ? 'Chart' : tab === 'sellers' ? 'Short-term sellers' : tab === 'buyers' ? 'Buyers returning' : 'BTC Thesis';
  if (tab === 'chart' || tab === 'overview') {
    const slot = tab === 'chart' ? $('#chartSlotChart') : $('#chartSlotOverview');
    if (chartCard.parentElement !== slot) slot.appendChild(chartCard);
    state.sel = null; renderChart();
  }
  if (tab === 'sellers') renderSellers();
  if (tab === 'buyers') renderBuyers();
  window.scrollTo(0, 0);
}
$('#tabbar').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });

const FEEDS = ['price_history.json', 'checkonchain_overlays.json', 'bull_levels.json', 'bull_watch.json', 'support_floors.json', 'btd_watch.json', 'etf_watch.json', 'funding_watch.json', 'sth_exhaustion.json', 'macro_history.json', 'liquidity_history.json', 'buyer_exhaustion.json', 'banner_levels.json', 'buyer_cushion.json', 'metals_history.json'];
async function refreshAll() {
  if (state.feedsLoading) return;
  state.feedsLoading = true; setSpinner();
  const errors = [];
  await Promise.all(FEEDS.map(async name => {
    try { state.feeds[name] = await fetchFeed(name); } catch (e) { errors.push(e.message || String(e)); }
  }));
  state.feedErrors = errors;
  try { await loadMaster(); } catch (e) { state.feedErrors.push(e.message || String(e)); }
  state.spotFallback = false;
  await loadSpot();
  state.bull = bullSnapshot(state.feeds['bull_levels.json'], state.feeds['bull_watch.json']);
  state.lastRefresh = Date.now();
  state.feedsLoading = false;
  renderCards(); renderLive();
  await refreshChart();
  if (!$('#floorSheet').hidden) renderFloorSheet();
  if (state.tab === 'sellers') renderSellers();
  if (state.tab === 'buyers') renderBuyers();
}
$('#refreshBtn').addEventListener('click', () => refreshAll());

let resizeTimer = 0, lastW = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    placeDailyLevels();
    const w = chartCard.querySelector('#chartWrap').clientWidth;
    if (w !== lastW) { lastW = w; renderChart(); if (!$('#floorSheet').hidden) renderFloorSheet(); }
    if (state.tab === 'sellers') renderSthCharts(true);
    if (state.tab === 'buyers') renderBuyCharts(true);
    if (state.tab === 'overview') drawReservesSpark();
  }, 150);
});
// ---------- live price ----------
// While the page is visible: every 60 s pull the Coinbase spot (and, on 1H..1M, the newest candles),
// write the spot into today's daily bar (so 3M..10Y end on the live price, not yesterday's close),
// rebuild the bundle in memory and push it into the existing plots with setData: no teardown, no
// flicker, toggles and the inspected point stay put. Hidden page: no polling. Visible again: tick now.
const LIVE_MS = 60 * 1000;
let liveTimer = 0, liveBusy = false;
function applySpotToMaster() {
  const m = state.master, p = state.spot;
  if (!m || !m.length || !(p > 0) || state.spotFallback) return;
  const today = Math.floor(Date.now() / 1000 / DAY) * DAY;
  const last = m[m.length - 1];
  if (last.t === today) last.c = p;
  else if (last.t < today) m.push({ t: today, c: p, v: null });
}
async function mergeIntraday(range) {
  const cfg = INTRADAY[range];
  const bars = state.displayBars;
  if (!cfg || !bars || !bars.length) return;
  const now = Math.floor(Date.now() / 1000);
  const fresh = await fetchCandles(cfg.gran, bars[bars.length - 1].t, now + 60);
  const byT = new Map(bars.filter(b => !b.live).map(b => [b.t, b]));
  for (const b of fresh) byT.set(b.t, b);
  let out = [...byT.values()].sort((a, b) => a.t - b.t);
  // Current, still-forming candle ends on the live spot.
  const cur = Math.floor(now / cfg.gran) * cfg.gran;
  if (out.length && out[out.length - 1].t === cur) out[out.length - 1] = { ...out[out.length - 1], c: state.spot };
  else if (out.length && out[out.length - 1].t < cur) out.push({ t: cur, c: state.spot, v: null, live: true });
  if (cfg.clipMin) { const lastT = out[out.length - 1].t; out = out.filter(b => b.t >= lastT - cfg.clipMin * 60); }
  else out = out.filter(b => b.t >= now - cfg.seconds);
  return out;
}
async function liveTick() {
  if (liveBusy || document.visibilityState !== 'visible' || !state.master || state.feedsLoading) return;
  liveBusy = true;
  const gen = chartGen, range = state.range;
  try {
    const tk = await fetchJSON(`${CB}/ticker`, 8000);
    const p = parseFloat(tk.price);
    if (!(p > 0)) throw new Error('no price');
    state.spot = p; state.spotAt = Date.now() / 1000; state.spotFallback = false;
    state.liveAt = Date.now(); state.liveErr = null;
    applySpotToMaster();
    let bars = state.displayBars;
    if (isIntraday(range)) { try { bars = (await mergeIntraday(range)) || bars; } catch (e) { /* keep last candles; spot still updates */ } }
    if (gen === chartGen && range === state.range && !state.loading && state.bundle && state.bundle.range === range) {
      state.displayBars = isIntraday(range) ? bars : state.displayBars;
      state.bundle = buildBundle(range, state.displayBars);
      liveRedraw();
    }
    renderDailyLevels(); renderBull();
  } catch (e) { state.liveErr = e.message || String(e); }
  finally { liveBusy = false; renderLive(); }
}
function stopLive() { if (liveTimer) clearInterval(liveTimer); liveTimer = 0; }
function startLive() { stopLive(); liveTimer = setInterval(liveTick, LIVE_MS); }
const hm = ms => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '');
function liveLabel() {
  if (!state.liveAt) return { cls: 'off', txt: state.spotFallback ? 'Last close · live price unavailable' : 'Connecting…' };
  const stale = Date.now() - state.liveAt > 3 * LIVE_MS || state.liveErr;
  return { cls: stale ? 'stale' : 'on', txt: `${stale ? 'Delayed' : 'Live'} · updated ${hm(state.liveAt)}` };
}
function liveTagHTML() { const l = liveLabel(); return `<span class="live-tag ${l.cls}"><span class="dot"></span><span class="live-txt">${esc(l.txt)}</span></span>`; }
function renderLive() {
  const px = chartCard.querySelector('#livePx');
  if (px) px.textContent = state.spot != null ? usd(state.spot) : '';
  const box = chartCard.querySelector('#liveBox');
  if (box) box.querySelector('.live-slot').innerHTML = liveTagHTML();
  document.querySelectorAll('.spot-box .live-slot').forEach(el => { el.innerHTML = liveTagHTML(); });
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') { stopLive(); return; }
  if (state.lastRefresh && Date.now() - state.lastRefresh > 15 * 60 * 1000) refreshAll(); else liveTick();
  startLive();
});
window.addEventListener('online', () => liveTick());
window.addEventListener('pageshow', e => { if (e.persisted) { liveTick(); startLive(); } });

// Boot
placeDailyLevels();
$('#chartSlotOverview').appendChild(chartCard);
renderCards();
renderChart();
lastW = chartCard.querySelector('#chartWrap').clientWidth;
refreshAll(); startLive();
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
window.__btc = state; // for debugging / verification
window.__btcRedraw = () => { state.bull = bullSnapshot(state.feeds['bull_levels.json'], state.feeds['bull_watch.json']); renderCards(); const el = chartCard.querySelector('#chartBanner'); if (el) el.innerHTML = bannerHTML(soWhat()); };
window.__btcLive = { get uPrice() { return uPrice; }, get timer() { return !!liveTimer; }, tick: () => liveTick() };
})();
