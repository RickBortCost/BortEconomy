// Indicatori macroeconomici da fonti ufficiali gratuite e senza chiave:
// BCE (tassi, rendimenti dei titoli di Stato, disoccupazione), Eurostat (inflazione HICP), BLS (inflazione e disoccupazione USA).
// Serie mensili dal 2015 (giornaliere ridotte a fine mese). Se una fonte non risponde si usa la pubblicazione precedente.
import { get } from "./http.mjs";
import { UA } from "./yahoo.mjs";

const FROM = 2015;

async function ecb(key, { daily = false } = {}) {
  const txt = await get(`https://data-api.ecb.europa.eu/service/data/${key}?format=csvdata&detail=dataonly&startPeriod=${FROM}-01`);
  if (!txt) return null;
  const lines = txt.trim().split(/\r?\n/);
  const head = lines[0].split(",");
  const it = head.indexOf("TIME_PERIOD"), iv = head.indexOf("OBS_VALUE");
  let pts = lines.slice(1).map((l) => l.split(",")).filter((c) => c[iv] !== "").map((c) => [c[it], +c[iv]]);
  if (daily) { // ultimo valore di ogni mese
    const m = new Map(); for (const [d, v] of pts) m.set(d.slice(0, 7), v);
    pts = [...m.entries()];
  }
  return pts.length ? pts : null;
}

async function eurostatHicp(geo) {
  const txt = await get(`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr?geo=${geo}&unit=RCH_A&coicop18=TOTAL&sinceTimePeriod=${FROM}-01&format=JSON&lang=en`);
  try {
    const d = JSON.parse(txt);
    const t = d.dimension.time.category.index;
    const pts = Object.keys(t).sort((a, b) => t[a] - t[b]).map((k) => [k, d.value[String(t[k])]]).filter(([, v]) => v != null);
    return pts.length ? pts : null;
  } catch { return null; }
}

// BLS: indice dei prezzi (CPI-U) e disoccupazione; l'inflazione annua è calcolata dall'indice
async function bls() {
  const years = [], now = new Date().getFullYear();
  const out = {};
  for (let s = FROM - 1; s <= now; s += 10) years.push([s, Math.min(s + 9, now)]);
  for (const [a, b] of years) {
    const r = await fetch("https://api.bls.gov/publicAPI/v2/timeseries/data/", {
      method: "POST", headers: { "Content-Type": "application/json", "User-Agent": UA }, signal: AbortSignal.timeout(30000),
      body: JSON.stringify({ seriesid: ["CUUR0000SA0", "CUUR0000SA0L1E", "LNS14000000"], startyear: String(a), endyear: String(b) }),
    }).catch(() => null);
    const j = r?.ok ? await r.json().catch(() => null) : null;
    if (j?.status !== "REQUEST_SUCCEEDED") return null;
    for (const s of j.Results.series) {
      out[s.seriesID] ??= new Map();
      // i mesi non pubblicati (es. chiusura del governo USA) hanno valore "-": vanno esclusi, non letti come zero
      for (const x of s.data) if (/^M(0[1-9]|1[0-2])$/.test(x.period) && /^-?\d+(\.\d+)?$/.test(String(x.value).trim())) out[s.seriesID].set(`${x.year}-${x.period.slice(1)}`, +x.value);
    }
  }
  const sorted = (m) => [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const yoy = (m) => sorted(m).map(([d, v]) => {
    const prev = m.get(`${+d.slice(0, 4) - 1}${d.slice(4)}`);
    return prev ? [d, +((v / prev - 1) * 100).toFixed(2)] : null;
  }).filter((x) => x && +x[0].slice(0, 4) >= FROM);
  return {
    cpiUS: yoy(out.CUUR0000SA0 ?? new Map()),
    coreUS: yoy(out.CUUR0000SA0L1E ?? new Map()),
    unempUS: sorted(out.LNS14000000 ?? new Map()).filter(([d]) => +d.slice(0, 4) >= FROM),
  };
}

// Definizione delle serie mostrate nel Laboratorio
export const SERIES = {
  dfr: { name: "Tasso BCE sui depositi", unit: "%", group: "Tassi" },
  btp10: { name: "Rendimento BTP 10 anni", unit: "%", group: "Tassi" },
  bund10: { name: "Rendimento Bund 10 anni", unit: "%", group: "Tassi" },
  spread: { name: "Spread BTP-Bund", unit: "pb", group: "Tassi" },
  realIT: { name: "Tasso reale BTP (rendimento − inflazione Italia)", unit: "%", group: "Tassi" },
  hicpEA: { name: "Inflazione area euro", unit: "%", group: "Inflazione" },
  hicpIT: { name: "Inflazione Italia", unit: "%", group: "Inflazione" },
  cpiUS: { name: "Inflazione USA", unit: "%", group: "Inflazione" },
  coreUS: { name: "Inflazione core USA", unit: "%", group: "Inflazione" },
  unempEA: { name: "Disoccupazione area euro", unit: "%", group: "Lavoro" },
  unempIT: { name: "Disoccupazione Italia", unit: "%", group: "Lavoro" },
  unempUS: { name: "Disoccupazione USA", unit: "%", group: "Lavoro" },
};

export async function buildMacro(prev) {
  const [dfr, btp10, bund10, unempEA, unempIT, hicpEA, hicpIT, us] = await Promise.all([
    ecb("FM/D.U2.EUR.4F.KR.DFR.LEV", { daily: true }),
    ecb("IRS/M.IT.L.L40.CI.0000.EUR.N.Z"),
    ecb("IRS/M.DE.L.L40.CI.0000.EUR.N.Z"),
    ecb("LFSI/M.I9.S.UNEHRT.TOTAL0.15_74.T"),
    ecb("LFSI/M.IT.S.UNEHRT.TOTAL0.15_74.T"),
    eurostatHicp("EA"),
    eurostatHicp("IT"),
    bls(),
  ]);
  const s = { dfr, btp10, bund10, unempEA, unempIT, hicpEA, hicpIT, cpiUS: us?.cpiUS, coreUS: us?.coreUS, unempUS: us?.unempUS };
  const failed = [];
  for (const k of Object.keys(s)) if (!s[k]?.length) { s[k] = prev?.series?.[k]?.data ?? []; failed.push(k); }
  // derivate
  const bund = new Map(s.bund10);
  s.spread = s.btp10.filter(([d]) => bund.has(d)).map(([d, v]) => [d, Math.round((v - bund.get(d)) * 100)]);
  const inflIT = new Map(s.hicpIT);
  s.realIT = s.btp10.filter(([d]) => inflIT.has(d)).map(([d, v]) => [d, +(v - inflIT.get(d)).toFixed(2)]);
  const series = Object.fromEntries(Object.entries(SERIES).map(([k, meta]) => [k, { ...meta, data: s[k] ?? [] }]));
  return { series, failed };
}
