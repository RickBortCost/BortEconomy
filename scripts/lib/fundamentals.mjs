// Dati fondamentali (Yahoo v7 quote, a blocchi) e profilo delle società (quoteSummary, a rotazione).
import { yahooSession, UA } from "./yahoo.mjs";
import { sleep } from "./http.mjs";
import { CENT } from "./markets.mjs";

const r2 = (v, d = 4) => (v == null || !isFinite(v) ? undefined : +(+v).toPrecision(d));

async function yget(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const { cookie, crumb } = await yahooSession();
      const res = await fetch(`${url}${url.includes("?") ? "&" : "?"}crumb=${encodeURIComponent(crumb)}`, {
        headers: { "User-Agent": UA, Cookie: cookie }, signal: AbortSignal.timeout(20000) });
      if (res.ok) return await res.json();
      if (res.status === 404) return null;
      await sleep(res.status === 429 ? 5000 * (i + 1) : 1000 * (i + 1));
    } catch { await sleep(1000 * (i + 1)); }
  }
  return null;
}

// symbol → { pe, fpe, dy, eps, epsF, pb, earn, earnEst, rating, sma50, sma200, shares, state, mcap }
export async function fundamentals(symbols) {
  const out = new Map();
  for (let i = 0; i < symbols.length; i += 50) {
    const chunk = symbols.slice(i, i + 50);
    const j = await yget(`https://query2.finance.yahoo.com/v7/finance/quote?symbols=${chunk.map(encodeURIComponent).join(",")}`);
    for (const q of j?.quoteResponse?.result ?? []) {
      const k = CENT[q.currency] ? 100 : 1;
      out.set(q.symbol, {
        state: q.marketState,
        pe: r2(q.trailingPE), fpe: r2(q.forwardPE),
        dy: r2(q.dividendYield ?? (q.trailingAnnualDividendYield != null ? q.trailingAnnualDividendYield * 100 : undefined)),
        eps: r2(q.epsTrailingTwelveMonths != null ? q.epsTrailingTwelveMonths / k : undefined),
        epsF: r2(q.epsForward != null ? q.epsForward / k : undefined),
        pb: r2(q.priceToBook),
        earn: q.earningsTimestamp ?? q.earningsTimestampStart, earnEst: q.isEarningsDateEstimate || undefined,
        rating: q.averageAnalystRating,
        sma50: r2(q.fiftyDayAverage != null ? q.fiftyDayAverage / k : undefined, 6),
        sma200: r2(q.twoHundredDayAverage != null ? q.twoHundredDayAverage / k : undefined, 6),
        mcap: q.marketCap, shares: q.sharesOutstanding,
      });
    }
    await sleep(300);
  }
  return out;
}

// Profilo società: settore, industria, descrizione, sito. Aggiorna al massimo `limit` simboli per esecuzione,
// partendo da quelli mai scaricati o più vecchi (i profili cambiano raramente).
export async function profiles(symbols, prev = {}, { limit = 60, maxAgeDays = 7 } = {}) {
  const out = { ...prev };
  const now = Date.now();
  const due = symbols
    .filter((s) => !out[s] || now - Date.parse(out[s].at ?? 0) > maxAgeDays * 864e5)
    .sort((a, b) => Date.parse(out[a]?.at ?? 0) - Date.parse(out[b]?.at ?? 0))
    .slice(0, limit);
  for (const s of due) {
    const j = await yget(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(s)}?modules=assetProfile`);
    const p = j?.quoteSummary?.result?.[0]?.assetProfile;
    out[s] = p ? {
      sector: p.sector, industry: p.industry, country: p.country, website: p.website,
      employees: p.fullTimeEmployees, summary: p.longBusinessSummary?.slice(0, 600), at: new Date().toISOString(),
    } : { at: new Date().toISOString() };
    await sleep(200);
  }
  return { profiles: out, refreshed: due.length };
}
