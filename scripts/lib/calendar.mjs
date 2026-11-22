// Calendario economico (ForexFactory: settimana corrente e successiva) e prossimi utili delle società monitorate.
import { getJSON } from "./http.mjs";

const COUNTRY = { USD: "Stati Uniti", EUR: "Area euro", GBP: "Regno Unito", JPY: "Giappone", CHF: "Svizzera",
  CAD: "Canada", AUD: "Australia", NZD: "Nuova Zelanda", CNY: "Cina", ALL: "Globale" };
const IMPACT = { High: 3, Medium: 2, Low: 1, Holiday: 0 };

export async function macroCalendar() {
  const weeks = await Promise.all(["thisweek", "nextweek"].map((w) => getJSON(`https://nfs.faireconomy.media/ff_calendar_${w}.json`)));
  if (!weeks.some(Boolean)) return null;
  return weeks.flat().filter(Boolean).map((e) => ({
    date: new Date(e.date).toISOString(),
    title: e.title,
    cur: e.country,
    country: COUNTRY[e.country] ?? e.country,
    impact: IMPACT[e.impact] ?? 0,
    forecast: e.forecast || undefined,
    previous: e.previous || undefined,
    actual: e.actual || undefined,
  })).sort((a, b) => a.date.localeCompare(b.date));
}

// Utili: dalle date in `fund` (Map symbol → { earn, earnEst }) per le azioni monitorate, nei prossimi `days` giorni
export function earningsCalendar(quotes, fund, days = 45) {
  const now = Date.now() / 1000, until = now + days * 86400;
  return quotes
    .filter((q) => q.type === "EQUITY")
    .map((q) => ({ q, f: fund.get(q.symbol) }))
    .filter(({ f }) => f?.earn && f.earn >= now - 86400 && f.earn <= until)
    .map(({ q, f }) => ({ date: new Date(f.earn * 1000).toISOString(), symbol: q.symbol, name: q.name, estimate: !!f.earnEst }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
