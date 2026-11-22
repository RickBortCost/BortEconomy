// Quotazioni e storici da Yahoo Finance (endpoint chart), con normalizzazione delle valute in centesimi.
import { get } from "./http.mjs";

// Valute quotate in centesimi → valuta principale (prezzi divisi per 100)
export const CENT = { GBp: "GBP", GBX: "GBP", ZAc: "ZAR", ILA: "ILS" };
const PRICE_FIELDS = ["regularMarketPrice", "previousClose", "chartPreviousClose", "regularMarketDayHigh", "regularMarketDayLow", "fiftyTwoWeekHigh", "fiftyTwoWeekLow"];

// Serie storiche: ore (1 mese, 60m), giorni (2 anni, 1d), settimane (10 anni, 1wk)
export const SERIES = { hour: ["1mo", "60m"], day: ["2y", "1d"], week: ["10y", "1wk"] };

const sig = (v, n) => (v == null ? v : +(+v).toPrecision(n));

// Punto: [timestamp, chiusura, volume?] con precisione ridotta per contenere il peso dei file
export function scalePts(pts, k) {
  return k === 1 ? pts : pts.map(([t, c, v]) => (v ? [t, sig(c / k, 6), v] : [t, sig(c / k, 6)]));
}

export async function chart(symbol, range, interval) {
  const q = `${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;
  const txt = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${q}`)
    ?? await get(`https://query2.finance.yahoo.com/v8/finance/chart/${q}`);
  if (!txt) return null;
  try {
    const r = JSON.parse(txt).chart.result[0];
    const qd = r.indicators.quote[0];
    const meta = { ...r.meta };
    const k = CENT[meta.currency] ? 100 : 1;
    if (k !== 1) {
      for (const f of PRICE_FIELDS) if (meta[f] != null) meta[f] /= k;
      meta.currency = CENT[meta.currency];
    }
    const pts = (r.timestamp || []).map((t, i) => [t, qd.close?.[i], qd.volume?.[i]])
      .filter(([, c]) => c != null)
      .map(([t, c, v]) => (v ? [t, sig(c / k, 6), sig(v, 3)] : [t, sig(c / k, 6)]));
    return { meta, pts, cents: k !== 1 };
  } catch { return null; }
}

export function summarize(symbol, meta, daily) {
  if (!meta || !daily.length) return null;
  const price = meta.regularMarketPrice ?? daily.at(-1)[1];
  const lastDay = new Date((meta.regularMarketTime ?? daily.at(-1)[0]) * 1000).toISOString().slice(0, 10);
  const prior = daily.filter(([t]) => new Date(t * 1000).toISOString().slice(0, 10) < lastDay);
  const prev = meta.previousClose ?? prior.at(-1)?.[1] ?? meta.chartPreviousClose;
  const pct = (a, b) => (a != null && b ? ((a - b) / b) * 100 : null);
  const now = meta.regularMarketTime ?? daily.at(-1)[0];
  const ref = (days) => daily.findLast(([t]) => t <= now - days * 86400)?.[1];
  const tp = meta.currentTradingPeriod?.regular;
  return {
    symbol,
    name: meta.shortName || meta.longName || symbol,
    longName: meta.longName || meta.shortName || symbol,
    type: meta.instrumentType,
    exchange: meta.fullExchangeName || meta.exchangeName,
    currency: meta.currency,
    price,
    prevClose: prev,
    changePct: meta.regularMarketChangePercent ?? pct(price, prev),
    weekPct: pct(price, prior.at(-5)?.[1]),
    monthPct: pct(price, ref(30)),
    yearPct: pct(price, ref(365)),
    dayHigh: meta.regularMarketDayHigh, dayLow: meta.regularMarketDayLow,
    high52: meta.fiftyTwoWeekHigh, low52: meta.fiftyTwoWeekLow,
    volume: meta.regularMarketVolume,
    time: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
    // Orario della seduta regolare corrente (epoch s), per calcolare nel browser se il mercato è aperto
    session: tp ? [tp.start, tp.end, tp.gmtoffset ?? meta.gmtoffset ?? 0] : null,
    spark: [...prior.slice(-22).map((p) => p[1]), price],
  };
}

// Formato compatto degli storici (fmt 2): colonne con timestamp incrementali.
// { t: [t0, Δ1, Δ2…], c: [chiusure], v?: [volumi] } ↔ [[t, c, v?], …]
export function encodeSeries(pts, withVolume = true) {
  const o = { t: pts.map((p, i) => (i ? p[0] - pts[i - 1][0] : p[0])), c: pts.map((p) => p[1]) };
  if (withVolume && pts.some((p) => p[2])) o.v = pts.map((p) => p[2] ?? 0);
  return o;
}
export function decodeSeries(s) {
  if (!s) return [];
  if (Array.isArray(s)) return s;
  let t = 0;
  return s.t.map((d, i) => { t += d; return s.v?.[i] ? [t, s.c[i], s.v[i]] : [t, s.c[i]]; });
}
