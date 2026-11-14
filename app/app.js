/* BTC Thesis — web (PWA) port of the native SwiftUI dashboard (v1.2.31, chart v2.31).
 * Logic mirrors Shared/Services/OverlaySeriesStore.swift, ViewModels/ChartViewModel.swift,
 * Views/OverlayChartCard.swift, Models/BullWatch.swift and friends. Never invents data:
 * a series with no source data is "n/a". */
(function () {
'use strict';

const WEB_VERSION = 'web 1.1.1';
const CHART_VERSION = 'chart v2.31';
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

// ---------- series catalogue (OverlaySeriesID) ----------
const MA_DASH = [5, 4], BULL_DASH = [2, 4], FLOOR_DASH = [8, 3];
const SERIES = [
  ['spot', 'BTC', 'BTC', T.accent, 2.0, null],
  ['wma50', '50 WMA (live)', '50 WMA', rgba(0.95, 0.45, 0.35), 1.4, MA_DASH],
  ['weeklyConfirm', 'First support to defend', 'First support', rgba(0.92, 0.68, 0.18), 1.4, null],
  ['wma200', '200 WMA', '200 WMA', rgba(0.55, 0.75, 0.95), 1.4, MA_DASH],
  ['dma200', '200 DMA', '200 DMA', rgba(0.45, 0.85, 0.65), 1.4, MA_DASH],
  ['sthCostBasis', 'STH Cost Basis', 'STH CB', rgba(0.75, 0.55, 0.95), 1.4, null],
  ['trueMean', 'True Mean Price', 'True Mean', rgba(0.95, 0.80, 0.35), 1.4, null],
  ['bullInvalidation', 'Weekly invalidation', 'Weekly inv.', rgba(0.90, 0.55, 0.50, 0.85), 1.0, BULL_DASH],
  ['checkQ50', 'Check Q50 (dated)', 'Check Q50', rgba(0.30, 0.80, 0.95), 1.6, null],
  ['checkQ75', 'Check Q75 (dated, provisional)', 'Check Q75', rgba(0.95, 0.45, 0.70), 1.6, null],
  ['checkQ50Proxy', 'Check Q50 proxy (STH CB p75)', 'Q50 proxy', rgba(0.30, 0.80, 0.95, 0.75), 1.3, [6, 3]],
  ['sthQ75', 'STH Q75 (profit-taking)', 'STH Q75', rgba(0.72, 0.62, 0.90, 0.8), 1.0, BULL_DASH],
  ['sthQ90', 'STH Q90 (profit-taking)', 'STH Q90', rgba(0.62, 0.55, 0.82, 0.8), 1.0, BULL_DASH],
  ['mriMidpoint', 'MRI midpoint (Check Q50)', 'MRI mid', rgba(0.55, 0.78, 0.74, 0.85), 1.0, BULL_DASH],
  ['recoveryGate', 'Recovery to excitement', '$100k gate', rgba(0.78, 0.74, 0.48, 0.85), 1.0, BULL_DASH],
  ['mayer15', 'Mayer 1.5×', 'Mayer 1.5×', rgba(0.86, 0.62, 0.38, 0.85), 1.0, BULL_DASH],
  ['valuationTop', 'Valuation-range top', '$150k top', rgba(0.72, 0.50, 0.48, 0.8), 1.0, BULL_DASH],
  ['floorQ25', 'Q25: 75% of BTC dollars underwater', 'Q25', rgba(0.55, 0.85, 0.55), 1.2, FLOOR_DASH],
  ['floorQ20', 'Q20: 80% of BTC dollars underwater', 'Q20', rgba(0.35, 0.75, 0.50), 1.2, FLOOR_DASH],
  ['floorQ15', 'Q15: 85% of BTC dollars underwater', 'Q15', rgba(0.25, 0.62, 0.48), 1.2, FLOOR_DASH],
  ['realizedPrice', 'Realized: average cost of every coin', 'Realized', rgba(0.30, 0.62, 0.80), 1.2, FLOOR_DASH],
  ['lthCostBasis', "LTH CB: long-term holders' average cost", 'LTH CB', rgba(0.42, 0.48, 0.85), 1.2, FLOOR_DASH],
].map(([id, title, short, color, width, dash]) => ({ id, title, short, color, width, dash }));
const SID = Object.fromEntries(SERIES.map(s => [s.id, s]));
const datedLabels = { checkQ50: null, checkQ75: null };
const legendTitle = id => (datedLabels[id] || SID[id].title);
const isMarker = id => id === 'checkQ50' || id === 'checkQ75';
const isPriceDerived = id => id === 'spot' || id === 'wma50' || id === 'wma200' || id === 'dma200';
const isSupportFloor = id => ['floorQ25', 'floorQ20', 'floorQ15', 'realizedPrice', 'lthCostBasis'].includes(id);
const FLOOR_ID = { q25: 'floorQ25', q20: 'floorQ20', q15: 'floorQ15', realized: 'realizedPrice', lth: 'lthCostBasis' };
const DEFAULT_ON = new Set(['spot', 'wma50', 'weeklyConfirm', 'wma200', 'dma200', 'sthCostBasis', 'trueMean', 'checkQ50', 'checkQ75', 'checkQ50Proxy']);

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
  mayHighRef: 82500, mock50WMA: 79000, reaccumShelfLow: 76000, reaccumShelfHigh: 82000,
  deeperInvalidation: 70000, digestionLow: 87000, digestionHigh: 100000, sthQ75: 87000, sthQ90: 104000,
  regimeSummary: 'Quiet & Trending — early bull',
  regimeDetail: 'Dips will be bought · early innings. The bull-market card is the measurable set once price is above the live 50-week average: supports, overhead, and top signals. ~$83k is the first support to defend (cleared 2026-09-24), not a level still waiting to clear. The live 50-week average stays a separate line. Soft GLI and MOVE / liquidity caution still apply.',
  invalidationNote: 'Bull-layer invalidation is the weekly-close line on the bull card. The older ~$70k confluence is still the hard regime challenge. Losing the first support to defend on a weekly close would reopen the old debate.',
  liveSupportsNote: 'True Market Mean, short-term holder cost basis, and the 200-day average are live on the bull-market card and on the chart. Not the first-support line.',
  hinge2027Note: '2027 hinge: Howell GLI trough + Check ATH/discovery — timing note, not a price target.',
  liquidityFlags: [
    { id: 'gli', title: 'GLI momentum', detail: 'Soft / watch', severity: 'soft' },
    { id: 'move', title: 'MOVE', detail: 'Waiting on funding watch', severity: 'neutral' },
    { id: 'sofr_minus_2y', title: 'SOFR − 2y', detail: 'Waiting on funding watch', severity: 'neutral' },
    { id: 'bills_share', title: 'Bills / debt', detail: 'Waiting on funding watch', severity: 'neutral' },
    { id: 'reserves', title: 'Reserves', detail: 'Waiting on funding watch', severity: 'neutral' },
  ],
};

// ---------- formatting ----------
const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const usd = v => '$' + nf0.format(Math.round(v));
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

  const supports = [
    livePriceRow('true_market_mean', 'True Market Mean', W.true_market_mean, 'Holding above this is a very strong bullish sign.', 'support'),
    livePriceRow('sth_cost_basis', 'Short-term holder cost basis', W.sth_cost_basis, 'Real buy-the-dip zone. The dip flag fires only when STH-MVRV and STH-SOPR are both under 1.', 'support'),
    dmaRow(W.dma_200),
    staticRow('weekly_invalidation', 'Weekly invalidation', lvl(levels, 'weekly_invalidation'), 'A weekly close under this level invalidates the bull read.', 'support'),
    staticRow('first_support', 'First support to defend (cleared confirm)', lvl(levels, 'first_support_defend'), 'Cleared confirm. First support to defend. The live 50-week average is a separate line.', 'support'),
  ];
  const overhead = [
    datedCheckRow('check_q50', 'Check Q50', lvl(levels, 'check_q50')),
    proxyRow('check_q50_proxy', 'Check Q50 proxy (STH CB p75)', liveValue(W.check_q50_proxy), "Daily Bitview STH cost-basis 75th percentile. About 1% under Check's $84.1k on Oct 13. Not Check's published number."),
    proxyRow('urpd_poc_proxy', 'Q50 pivot · live proxy (URPD POC)', liveValue(W.urpd_poc), urpdNote(W.urpd_poc)),
    datedCheckRow('check_q75', 'Check Q75', lvl(levels, 'check_q75')),
    bandRow('sth_q75', 'Q75 sell side · live proxy (STH band)', W.sth_q75, lvl(levels, 'sth_q75_fallback'), profitBandNote('Q75', W.sth_q75 && W.sth_q75.multiple, 'About 25% of days were hotter')),
    bandRow('sth_q90', 'STH Q90 (profit-taking band)', W.sth_q90, lvl(levels, 'sth_q90_fallback'), profitBandNote('Q90', W.sth_q90 && W.sth_q90.multiple, 'Q90 means only about 10% of days were hotter')),
  ];
  const mri = liveValue(W.mri_q50);
  if (mri != null) overhead.push(row('mri_midpoint', 'MRI midpoint (Check Q50)', mri, 'live', 'CheckOnChain Mean Reversion Index bands, Q50, daily' + (W.mri_q50.as_of ? ` (as of ${W.mri_q50.as_of})` : '') + '.', 'overhead'));
  else overhead.push(staticRow('mri_midpoint', 'Check MRI midpoint', lvl(levels, 'mri_midpoint'), 'Static fallback. The live Check MRI Q50 feed is unavailable.', 'overhead'));
  overhead.push(staticRow('recovery_gate', '$100k recovery to excitement', lvl(levels, 'recovery_excitement_gate'), 'Recovery-to-excitement gate. Expect failed tries before a hold.', 'overhead'));
  overhead.push(mayerRow());
  overhead.push(staticRow('valuation_top', 'Valuation-range top', lvl(levels, 'valuation_range_top'), 'Check valuation-range top. First big long-term-holder sell zone.', 'overhead'));

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
  const floors = json.floors.map(f => {
    const ok = f.available ?? (f.value != null);
    return { id: f.id, short: f.short || f.id.toUpperCase(), title: f.title || f.short || f.id, plain: f.plain || '', value: ok ? f.value : null, change7dPct: ok ? f.change_7d_pct : null, history: column(f.id), seriesID: FLOOR_ID[f.id] || null,
      get label() { return `${this.short}: ${this.plain}`; } };
  });
  const bearLows = (json.bear_lows || []).map(l => {
    const date = l.t != null ? l.t : isoToUnix(l.date);
    if (date == null || !(l.price > 0)) return null;
    const ratios = {}; for (const [k, v] of Object.entries(l.price_to_floor || {})) if (v != null) ratios[k] = v;
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
  const confirmLevel = bull.firstSupport ?? CONFIG.weeklyConfirmRef;
  const lineDates = spotPts.map(p => p.t).filter(t => t >= CONFIG.weeklyConfirmVisibleFrom);
  put('weeklyConfirm', lineDates.map(t => ({ t, v: confirmLevel })));
  if (lineDates.length) notes.push('First support to defend starts at the May peak (2026-05-10). It is the cleared confirm, not the live 50-week average.');
  if (!series.wma200.available) notes.push('200 WMA unavailable — need ~1400 daily closes.');

  const oc = state.feeds['checkonchain_overlays.json'];
  const sth = oc ? tv(oc.sth_cost_basis) : [], tm = oc ? tv(oc.true_mean) : [];
  put('sthCostBasis', sth.length ? clip(sth) : []);
  put('trueMean', tm.length ? clip(tm) : []);

  // Bull overlays (appendBullOverlays)
  const flat = (id, value) => { if (!(value > 0) || !lineDates.length) return put(id, []); put(id, lineDates.map(t => ({ t, v: value }))); };
  const curve = (id, history, fallback) => { const daily = tv(history); if (daily.length) return put(id, clip(daily)); flat(id, fallback); };
  const marker = (id, value, asOf, maxAgeDays) => {
    if (!(value > 0) || asOf == null || !lineDates.length) return put(id, []);
    const first = lineDates[0], last = lineDates[lineDates.length - 1];
    const tooOld = maxAgeDays != null && (Date.now() / 1000 - asOf) / DAY > maxAgeDays;
    const visible = asOf >= localStartOfDay(first) && asOf <= last + DAY;
    put(id, !tooOld && visible ? [{ t: asOf, v: value }] : []);
  };
  datedLabels.checkQ50 = bull.checkQ50Label; datedLabels.checkQ75 = bull.checkQ75Label;
  put('checkQ50', []); // Check Q50 is not drawn (David, Oct 21). The Q50 proxy line carries it.
  marker('checkQ75', bull.checkQ75, bull.checkQ75AsOf, 7);
  curve('checkQ50Proxy', bull.checkQ50ProxyHistory, bull.checkQ50Proxy);
  flat('bullInvalidation', bull.weeklyInvalidation);
  curve('sthQ75', bull.sthQ75History, bull.sthQ75);
  curve('sthQ90', bull.sthQ90History, bull.sthQ90);
  curve('mriMidpoint', bull.mriHistory, bull.mriMidpoint);
  flat('recoveryGate', bull.recoveryGate);
  flat('valuationTop', bull.valuationTop);
  put('mayer15', series.dma200.points.map(p => ({ t: p.t, v: p.v * bull.mayerMultiple })));
  const dated = [bull.checkQ50Label, bull.checkQ75Label].filter(Boolean);
  if (dated.length) notes.push(dated.join('; ') + '. Dated Check values, shown as a marker on their date (Q75 hides 7 days after). Check Q50 proxy (STH CB p75) is the daily Q50 line; the STH Q75 band is the live sell-side curve.');
  notes.push('STH Q75/Q90, the Q50 proxy and the MRI midpoint (Check Q50) update daily. The other bull lines stay flat. All of them stay off until you turn them on.');

  // Support floors
  const floors = floorsSnapshot(state.feeds['support_floors.json']);
  for (const [key, id] of Object.entries(FLOOR_ID)) {
    const f = floors.floor && floors.floor(key);
    if (!f || f.value == null || !f.history.length) { put(id, []); continue; }
    put(id, clip(f.history));
  }
  if (floors.hasFeed) notes.push(`Support floors${floors.asOfLabel ? ` (as of ${floors.asOfLabel})` : ''}: Q25/Q20/Q15, realized price and LTH cost basis are cost-based zones from Bitview, updated daily. Off until you turn them on in the legend. Not sell triggers.`);

  const hasOnChain = sth.length > 0 && tm.length > 0;
  notes.push(hasOnChain ? `STH / True Mean: CheckOnChain via the public feed${oc.as_of ? ` (as of ${oc.as_of})` : ''}.` : 'STH / True Mean: connect CheckOnChain series (see DATA-SOURCES §3e)');

  // Volume: Coinbase on intraday ranges, published Yahoo daily volume on 3M–10Y.
  const clipEnd = spotPts.length ? spotPts[spotPts.length - 1].t : Infinity;
  let volumePoints = [];
  const src = intraday ? displayBars : master;
  for (const b of src) { if (!(b.v > 0) || b.t < clipStart || b.t > clipEnd) continue; volumePoints.push({ t: b.t, v: b.v, c: b.c }); }
  if (!volumePoints.length) notes.push('Volume strip hidden — volume unavailable for this range.');
  if (!intraday && state.masterNote) notes.push(state.masterNote);

  const sourceLabel = (intraday ? 'Coinbase BTC-USD' : 'Yahoo BTC-USD daily') + (hasOnChain ? ' · CheckOnChain' : '') + ' · ' + CHART_VERSION;
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
      if (s.id === 'spot') continue;
      const always = isSupportFloor(s.id);
      for (const p of s.points) { if (!always && (p.v < leashLo || p.v > leashHi)) continue; if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; }
    }
    rawMin = lo; rawMax = hi;
  } else {
    const vals = vis.flatMap(s => s.points.map(p => p.v));
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
  return vis.filter(s => { let lo = Infinity, hi = -Infinity; for (const p of s.points) { if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; } return hi >= domain[0] && lo <= domain[1]; });
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
    return s && s.available && s.points.length ? s.points[s.points.length - 1].v : null;
  };
  const ids = SERIES.map(s => s.id).filter(id => id !== 'checkQ50');
  const rows = ids.map(id => ({ id, value: valueFor(id), available: !!(b && b.series[id] && b.series[id].available) }));
  const cmp = (a, b2) => legendTitle(a.id).localeCompare(legendTitle(b2.id), undefined, { numeric: true });
  rows.sort((a, b2) => {
    if (a.value != null && b2.value != null) return a.value !== b2.value ? b2.value - a.value : cmp(a, b2);
    if (a.value != null) return -1; if (b2.value != null) return 1; return cmp(a, b2);
  });
  return rows;
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
  if (closes.length < 350) return { spot: state.spot, wma50: null, source: 'mock', asOf: state.spotAt };
  const last = closes.slice(-350); const wma50 = last.reduce((a, b) => a + b, 0) / 350;
  return { spot: state.spot, wma50, source: 'live', asOf: state.spotAt };
}
function soWhat() {
  const snap = snapshot(); const bull = currentBull();
  if (!snap || snap.source !== 'live') return { tone: 'muted', msg: 'Waiting on live 50 WMA…' };
  const confirm = (bull.hasFeed && bull.value('first_support')) || CONFIG.weeklyConfirmRef;
  if (snap.spot >= confirm) return { tone: 'accent', msg: `Quiet & Trending — early bull · dips will be bought · early innings. First support to defend is ${usd(confirm)}` };
  if (snap.spot < snap.wma50) return { tone: 'warning', msg: `Below the live 50-week average. First support to defend is ${usd(confirm)} — not the average` };
  return { tone: 'warning', msg: `Under ${usd(confirm)} — that cleared confirm is the first support to defend` };
}
const WAITING_BULL = { hasFeed: false, supports: [], overhead: [], signals: [], moveFragile: 80, moveStress: 100, moveRecession: 135, value: () => null, anyWarning: false };
function currentBull() { return state.bull || WAITING_BULL; }
function dailyLevels() {
  const snap = snapshot(); const bull = currentBull();
  const wma = snap && snap.wma50 != null ? snap.wma50 : CONFIG.mock50WMA;
  const src = snap && snap.wma50 != null ? 'live' : 'mock';
  const confirm = (bull.hasFeed && bull.value('first_support')) || CONFIG.weeklyConfirmRef;
  const L = (id, kind, title, price, priceHigh, source, note) => ({ id, kind, title, price, priceHigh, source, note });
  return [
    L('wma50', 'level', '50 WMA (live)', wma, null, src, src === 'mock' ? `Mock ≈ ${CONFIG.mock50WMA} — live average only, not the first support to defend. Live history unavailable.` : "Live average from ~350 daily closes. Historical name: Bears' Last Stand. Not the first-support line."),
    L('weeklyConfirm', 'level', 'First support to defend (cleared confirm)', confirm, null, 'config', 'Cleared confirm — first support to defend on a pullback (Check cleared it 2026-09-24). Chart line from the May 10 2026 peak. Not the live 50-week average.'),
    L('mayHigh', 'level', 'May high (static ref)', CONFIG.mayHighRef, null, 'config', 'Static May high (~82.5k) — distinct from the first support to defend and from the live 50-week average.'),
    L('liveSupports', 'note', 'Live supports', null, null, 'note', CONFIG.liveSupportsNote),
    L('reaccum', 'level', 'Re-accumulation shelf', CONFIG.reaccumShelfLow, CONFIG.reaccumShelfHigh, 'config', 'New shelf ~$76–82k.'),
    L('invalidation', 'level', 'Deeper invalidation ~$70k', CONFIG.deeperInvalidation, null, 'config', 'Older hard challenge if a weekly close holds below. The bull card carries the weekly-close invalidation.'),
    L('digestion', 'level', 'Digestion / next magnet', CONFIG.digestionLow, CONFIG.digestionHigh, 'config', 'Next zone $87–100k after the $83k clearance.'),
    L('sthQ75', 'level', 'STH Q75 (profit-taking)', CONFIG.sthQ75, null, 'config', 'Static $87k fallback for the profit-taking band. The bull card shows the live band: cost basis times the point-in-time Q75 of STH-MVRV.'),
    L('sthQ90', 'level', 'STH Q90 (profit-taking)', CONFIG.sthQ90, null, 'config', 'Static $104k fallback for the profit-taking band. The bull card shows the live band: cost basis times the point-in-time Q90 of STH-MVRV.'),
    L('mayer', 'note', 'Mayer Multiple ~1.5×', null, null, 'note', 'Dollar level is on the bull card: the multiple times the live 200-day average. It is not a fixed price.'),
    L('hinge2027', 'note', '2027 hinge', null, null, 'note', CONFIG.hinge2027Note),
  ];
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
  <div class="chart-head"><div><h2 style="font-size:20px">BTC Overlay Chart</h2><div class="caption2" id="chartSource">${CHART_VERSION}</div></div><div class="live-box" id="liveBox"><div class="live-px" id="livePx"></div><div class="live-slot"></div></div></div>
  <div class="pills" id="pills">${RANGES.map(r => `<button class="pill" data-range="${r}">${r}</button>`).join('')}</div>
  <div class="chart-wrap" id="chartWrap"><div class="chart-price" id="chartPrice"></div><div class="chart-vol" id="chartVol"></div><div class="chart-msg" id="chartMsg" hidden></div></div>
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
chartCard.querySelector('#floorBtn').addEventListener('click', () => openFloorSheet());

let uPrice = null, uVol = null, chartData = null;
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

// Everything the two plots need for the current bundle + toggles. Live polls reuse the same
// uPlot instances (setData) when the plotted set and gutter are unchanged, so nothing flickers.
let view = null;
function computeView() {
  const domain = yScaleDomain() || [0, 1];
  const xd = xDomain();
  const plot = plottableSeries(domain);
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
    else sOpts.push({ label: def.short, stroke: def.color, width: def.width, dash: def.dash || undefined, spanGaps: true, points: { show: false } });
  }
  const gutter = gutterWidth(domain[1]);
  const b = state.bundle;
  const vols = aggregateVolume(b.volumePoints, state.range).filter(p => p.t >= xd[0] - 40 * DAY && p.t <= xd[1]);
  const vmax = vols.length ? Math.max(...vols.map(p => p.v)) : 1;
  const sig = plot.map(p => p.id).join(',') + '|' + gutter + '|' + (vols.length > 0) + '|' + state.range;
  return { domain, xd, plot, xs, data, sOpts, gutter, vols, vmax, sig };
}
function liveRedraw() {
  if (!uPrice || !view || !state.bundle || !visibleSeries().length) { renderChart(); return; }
  const v = computeView();
  if (v.sig !== view.sig || (!!uVol) !== (v.vols.length > 0)) { renderChart(); return; }
  view = v;
  uPrice.setData(v.data);
  if (uVol) { uVol.setData([v.vols.map(p => p.t), v.vols.map(p => p.v)]); state.volDisplay = v.vols; }
  if (state.sel != null) {
    syncing = true;
    uPrice.setCursor({ left: uPrice.valToPos(state.sel, 'x'), top: 10 });
    if (uVol) uVol.setCursor({ left: uVol.valToPos(state.sel, 'x'), top: 10 });
    syncing = false;
  }
  chartCard.querySelector('#chartBanner').innerHTML = bannerHTML(soWhat());
  renderLegend();
}

function renderChart() {
  const b = state.bundle;
  const msg = chartCard.querySelector('#chartMsg');
  const priceEl = chartCard.querySelector('#chartPrice'), volEl = chartCard.querySelector('#chartVol');
  chartCard.querySelectorAll('.pill').forEach(p => p.classList.toggle('on', p.dataset.range === state.range));
  chartCard.querySelector('#chartSource').textContent = b ? b.sourceLabel : CHART_VERSION;
  chartCard.querySelector('#chartBanner').innerHTML = bannerHTML(soWhat());
  if (uPrice) { uPrice.destroy(); uPrice = null; }
  if (uVol) { uVol.destroy(); uVol = null; }
  const vis = visibleSeries();
  if (!b || !vis.length) {
    priceEl.hidden = volEl.hidden = true; msg.hidden = false;
    msg.className = 'chart-msg' + (state.chartError ? ' err' : '');
    msg.textContent = state.chartError ? state.chartError : (state.loading ? 'Loading…' : 'No series for this range yet.');
    renderLegend(); renderNotes();
    return;
  }
  priceEl.hidden = false; msg.hidden = true;
  const v = computeView();
  view = v;
  const { domain, xd, data, sOpts, gutter } = v;
  const width = Math.max(200, chartCard.querySelector('#chartWrap').clientWidth);
  const priceH = Math.max(240, Math.min(420, Math.round(width * 0.62)));
  const common = {
    width, legend: { show: false }, padding: [8, 0, 0, 4],
    cursor: { y: false, points: { show: false }, drag: { x: false, y: false, setScale: false }, focus: { prox: -1 } },
    scales: { x: { time: true, range: () => [view.xd[0], view.xd[1]] } },
    ...(isIntraday(state.range) ? {} : { tzDate: ts => uPlot.tzDate(new Date(ts * 1e3), 'Etc/UTC') }),
  };
  uPrice = new uPlot({
    ...common, height: priceH,
    scales: { ...common.scales, y: { range: () => view.domain } },
    axes: [
      { stroke: T.text2, font: XAXIS_FONT, grid: { stroke: T.grid, width: 0.5 }, ticks: { show: false }, size: 26, space: Math.max(60, width / 6), values: xAxisValues(state.range) },
      { side: 1, stroke: T.text2, font: AXIS_FONT, size: gutter, gap: 4, grid: { stroke: T.gridY, width: 0.5 }, ticks: { show: false }, space: Math.max(36, priceH / 6), values: (u, vals) => vals.map(axisUSD) },
    ],
    series: sOpts,
    hooks: { setCursor: [u => onCursor(u, 'price')] },
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
        { side: 1, size: gutter, grid: { show: false }, ticks: { show: false }, values: (u, vals) => vals.map(() => '') },
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
  renderLegend(); renderNotes();
}

// Selection: hover (mouse) or press-drag (touch) only moves a rule and updates the bottom legend.
let syncing = false, legendRAF = 0;
function onCursor(u, which) {
  if (syncing) return;
  const left = u.cursor.left;
  let t = null;
  if (left != null && left >= 0 && u.cursor.idx != null) t = u.posToVal(left, 'x');
  const other = which === 'price' ? uVol : uPrice;
  if (other) {
    syncing = true;
    if (t == null) other.setCursor({ left: -10, top: -10 });
    else other.setCursor({ left: other.valToPos(t, 'x'), top: 10 });
    syncing = false;
  }
  if (t !== state.sel) { state.sel = t; if (!legendRAF) legendRAF = requestAnimationFrame(() => { legendRAF = 0; renderLegend(); }); }
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
  const rows = legendRows().map(r => {
    const def = SID[r.id];
    const on = state.enabled.has(r.id) && r.available;
    const dot = r.available ? def.color : 'rgba(255,255,255,0.19)';
    const val = r.available && r.value != null ? `<span class="lval" style="color:${on ? def.color : T.text2}">${usd(r.value)}</span>` : (!r.available ? '<span class="lna">n/a</span>' : '');
    return `<button class="lrow" data-sid="${r.id}" ${r.available ? '' : 'disabled'} aria-pressed="${on}">
      <span class="ldot" style="background:${dot};opacity:${on ? 1 : 0.35}"></span>
      <span class="ltitle" style="color:${r.available ? T.text : T.text2}">${esc(legendTitle(r.id))}</span>${val}${on ? ICON.check(def.color) : ICON.circle(T.text2)}</button>`;
  }).join('');
  el.innerHTML = `<div class="legend-cap">${esc(cap)}</div>${rows}`;
}
function renderNotes() {
  const b = state.bundle;
  const hasFloors = b && Object.values(FLOOR_ID).some(id => b.series[id] && b.series[id].available);
  chartCard.querySelector('#floorBtnRow').hidden = !hasFloors;
  const notes = (b ? b.notes : []).map(n => `<div>${esc(n)}</div>`);
  if (state.chartError && b) notes.push(`<div class="c-warn">${esc(state.chartError)}</div>`);
  chartCard.querySelector('#chartNotes').innerHTML = notes.join('');
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
  const srcCls = l => l === 'live' ? 'c-pos' : l === 'unavailable' ? 'c-warn' : 'c-2';
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
  if (s.levelsAsOf) parts.push(`static levels ${s.levelsAsOf}`);
  const foot = parts.length ? parts.join(' · ') + '. Bitview for live prints.' : 'Live prints from Bitview. Static levels from the bull levels file.';
  $('#bullCard').innerHTML = card(`<div><h2>Bull market</h2><div class="caption" style="margin-top:4px">Measurable set once price is above the live 50-week average. That average stays its own line.</div></div>${body}<div class="caption2">${esc(foot)}</div>`);
}
function renderDailyLevels() {
  const snap = snapshot(); const spot = state.spot;
  const rows = dailyLevels().map(l => {
    const badgeCls = l.source === 'live' ? 'live' : l.source === 'mock' ? 'mock' : '';
    const badge = `<span class="badge ${badgeCls}">${l.source === 'mock' ? 'mock fallback' : l.source}</span>`;
    if (l.kind === 'note') return `<div class="lv"><div class="lv-top"><span class="brow-title">${esc(l.title)}</span>${badge}</div><div class="foot">${esc(l.note)}</div></div>`;
    const price = l.priceHigh != null ? `${usd(l.price)}–${usd(l.priceHigh)}` : usd(l.price);
    let dist = '';
    if (spot != null && l.price) { const d = spot - l.price, p = d / l.price * 100; dist = `<span class="dist ${d >= 0 ? 'c-pos' : 'c-neg'}">${d >= 0 ? '+' : '-'}${nf0.format(Math.round(Math.abs(d)))}&nbsp;&nbsp;(${fx(p, 1)}%)</span>`; }
    return `<div class="lv"><div class="lv-top"><span class="brow-title">${esc(l.title)}</span>${badge}</div><div class="lv-mid"><span class="price">${price}</span>${dist}</div>${l.note ? `<div class="caption2">${esc(l.note)}</div>` : ''}</div>`;
  }).join('');
  const spotBox = spot != null ? `<div class="spot-box"><div class="caption2">Spot</div><div class="v">${usd(spot)}</div><div class="live-slot">${liveTagHTML()}</div></div>` : '';
  const asOf = snap && snap.asOf ? `<div class="caption2">As of ${new Date(snap.asOf * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>` : '';
  const mock = snap && snap.source === 'mock' ? '<div class="banner tone-warning">Using mock market data — 50-week average labeled mock ≈ 79k (not the first support to defend, not May high).</div>' : '';
  dailyLevelsEl.innerHTML = card(`<div class="row-between"><h2>Daily Levels</h2>${spotBox}</div>${bannerHTML(soWhat())}${mock}${asOf}<div>${rows}</div>`);
}
function renderRegime() {
  $('#regimeCard').innerHTML = card(`<h2>Regime</h2>
    <div class="regime-box" style="background:rgba(51,199,122,0.12)"><span class="regime-dot" style="background:${T.positive}"></span>${esc(CONFIG.regimeSummary)}</div>
    <div class="foot">${esc(CONFIG.regimeDetail)}</div><div class="foot">${esc(CONFIG.invalidationNote)}</div>`);
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
    <div class="caption2">Cash-reserve checklist only — not a trade button.</div>`);
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
function renderLiquidity() {
  const j = state.feeds['funding_watch.json'];
  const bull = currentBull();
  const sev = s => ['soft', 'elevated', 'neutral'].includes((s || '').trim().toLowerCase()) ? s.trim().toLowerCase() : 'neutral';
  let flags = CONFIG.liquidityFlags, overallDetail = null, overallSev = null, move = null, tmS = null;
  if (j) {
    const ids = (j.app_mapping && j.app_mapping.chip_ids) || ['move', 'sofr_minus_2y', 'bills_share', 'reserves'];
    const byId = {}; for (const f of j.flags || []) if (f.id) byId[f.id] = { id: f.id, title: f.title || f.id, detail: f.detail || '—', severity: sev(f.severity) };
    const ordered = ids.map(i => byId[i]).filter(Boolean);
    if (ordered.length) { flags = ordered; overallDetail = j.overall_detail; overallSev = j.overall_severity ? sev(j.overall_severity) : null; }
    move = isNum(j.move) ? j.move : null;
    if (isNum(j.sofr_pct) && isNum(j.ust_2y_pct)) tmS = (j.ust_2y_pct - j.sofr_pct) * 100; else if (isNum(j.sofr_minus_2y_bp)) tmS = -j.sofr_minus_2y_bp;
  }
  const fr = bull.moveFragile, stz = bull.moveStress, rec = bull.moveRecession;
  const refs = `Reference lines: ${fx(fr, 0)} fragile, ${fx(stz, 0)} stress, ${fx(rec, 0)} Howell recession.`;
  let moveS;
  if (move == null) moveS = `MOVE print waiting. ${refs}`;
  else { const status = move >= rec ? 'at or above the Howell recession line' : move >= stz ? 'through the stress line, under the recession line' : move >= fr ? 'through the fragile line, under the stress line' : 'under the fragile line'; moveS = `MOVE ${fx(move, 1)} — ${status}. ${refs}`; }
  const tight = tmS == null ? '2y − SOFR — waiting on the funding feed. This is the Fed tightening pace.' : `2y − SOFR ${(tmS >= 0 ? '+' : '') + fx(tmS, 1)}bp — Fed tightening pace.`;
  let top;
  if (overallDetail) {
    const s = overallSev || 'neutral';
    const c = s === 'elevated' ? ['242,184,64', T.warning, '▲'] : s === 'soft' ? ['245,158,31', T.accent, '◉'] : ['255,255,255', T.text2, '●'];
    top = `<div class="banner" style="background:rgba(${c[0]},0.18);border-color:rgba(${c[0]},0.45);color:${T.text}"><span class="ico" style="color:${c[1]}">${c[2]}</span><span>${esc(overallDetail)}</span></div>`;
  } else top = '<div class="caption">Soft GLI momentum + MOVE / SOFR−2y / bills / reserves (funding watch).</div>';
  $('#liquidityCard').innerHTML = card(`<h2>Liquidity Stress</h2>${top}
    <div><div style="font-size:12px;font-weight:600">Macro lines</div><div class="caption2" style="margin-top:4px">${esc(moveS)}</div><div class="caption2" style="margin-top:4px">${esc(tight)}</div></div>
    <div class="chips">${flags.map(f => `<div class="chip ${f.severity}"><div class="chip-t">${esc(f.title)}</div><div class="chip-d">${esc(f.detail)}</div></div>`).join('')}</div>`);
}
function renderFooter() {
  const errs = state.feedErrors.slice();
  if (state.spotFallback) errs.push('Live spot unavailable (Coinbase); showing the last daily close.');
  const html = `<div>${esc(`${WEB_VERSION} · ${CHART_VERSION} · feed v2.3 · Coinbase/Yahoo/CheckOnChain/Bitview`)}</div>` +
    (state.lastRefresh ? `<div>Updated ${new Date(state.lastRefresh).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}${navigator.onLine === false ? ' · offline (cached data)' : ''}</div>` : '') +
    errs.map(e => `<div class="err">Live fetch note: ${esc(e)}</div>`).join('');
  $('#footerOverview').innerHTML = html; $('#footerChart').innerHTML = html; const fs = $('#footerSellers'); if (fs) fs.innerHTML = html;
}
const dailyLevelsEl = document.createElement('div');
function placeDailyLevels() {
  const wide = window.matchMedia('(min-width: 980px)').matches;
  const slot = wide ? $('#dailyLevelsSlotMain') : $('#dailyLevelsSlotPhone');
  if (dailyLevelsEl.parentElement !== slot) slot.appendChild(dailyLevelsEl);
}
function renderCards() { renderBull(); renderDailyLevels(); renderRegime(); renderBTD(); renderETF(); renderLiquidity(); renderFooter(); }

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
    <div class="sth-score-row">
      <div>
        <div class="sth-score" style="color:${color}">Seller exhaustion: ${score} of 3</div>
        <div class="sth-verdict" style="color:${color}">${esc(sthVerdict(score))}</div>
        <div class="sth-asof">${asOf ? `As of ${esc(asOf)} · last finished UTC day` : ''}</div>
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
    rowHTML('Underwater share', rgba(0.95, 0.45, 0.55), p && isNum(p.uwLine) ? fx(p.uwLine, 1) + '%' : null, evNote) +
    rowHTML('Supply in loss', rgba(0.95, 0.45, 0.55, 0.7), p && isNum(p.uw_btc) ? fmtBtc(p.uw_btc) : null) +
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
    { label: 'Underwater', scale: 'y', stroke: rgba(0.95, 0.45, 0.55), width: 1.8, spanGaps: true, points: { show: false } },
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


// ---------- app shell ----------
function setSpinner() { const busy = state.loading || state.feedsLoading; $('#spinner').hidden = !busy; $('#refreshBtn').disabled = !!busy; }
function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  $('#view-overview').hidden = tab !== 'overview';
  $('#view-chart').hidden = tab !== 'chart';
  $('#view-sellers').hidden = tab !== 'sellers';
  $('#topbarTitle').textContent = tab === 'chart' ? 'Chart' : tab === 'sellers' ? 'Short-term sellers' : 'BTC Thesis';
  if (tab === 'chart' || tab === 'overview') {
    const slot = tab === 'chart' ? $('#chartSlotChart') : $('#chartSlotOverview');
    if (chartCard.parentElement !== slot) slot.appendChild(chartCard);
    state.sel = null; renderChart();
  }
  if (tab === 'sellers') renderSellers();
  window.scrollTo(0, 0);
}
$('#tabbar').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });

const FEEDS = ['price_history.json', 'checkonchain_overlays.json', 'bull_levels.json', 'bull_watch.json', 'support_floors.json', 'btd_watch.json', 'etf_watch.json', 'funding_watch.json', 'sth_exhaustion.json'];
async function refreshAll() {
  if (state.feedsLoading) return;
  state.feedsLoading = true; setSpinner();
  const errors = [];
  await Promise.all(FEEDS.map(async name => {
    try { state.feeds[name] = await fetchFeed(name); } catch (e) { errors.push(e.message || String(e)); }
  }));
  state.feedErrors = errors;
  state.bull = bullSnapshot(state.feeds['bull_levels.json'], state.feeds['bull_watch.json']);
  try { await loadMaster(); } catch (e) { state.feedErrors.push(e.message || String(e)); }
  state.spotFallback = false;
  await loadSpot();
  state.lastRefresh = Date.now();
  state.feedsLoading = false;
  renderCards(); renderLive();
  await refreshChart();
  if (!$('#floorSheet').hidden) renderFloorSheet();
  if (state.tab === 'sellers') renderSellers();
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
window.__btcLive = { get uPrice() { return uPrice; }, get timer() { return !!liveTimer; }, tick: () => liveTick() };
})();
