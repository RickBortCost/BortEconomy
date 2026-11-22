// Avvisi di prezzo: definiti in site/alerts.json (aggiornato dal workflow "Richieste dal sito"),
// valutati a ogni aggiornamento dei dati. Un avviso scatta una sola volta.
export const OPS = {
  above: { label: "sopra", test: (q, v) => q.price >= v },
  below: { label: "sotto", test: (q, v) => q.price <= v },
  up: { label: "variazione giornaliera ≥ +", test: (q, v) => q.changePct != null && q.changePct >= v, pct: true },
  down: { label: "variazione giornaliera ≤ −", test: (q, v) => q.changePct != null && q.changePct <= -v, pct: true },
};
export const OP_ALIASES = { sopra: "above", sotto: "below", above: "above", below: "below", up: "up", down: "down", rialzo: "up", ribasso: "down" };

export function describe(a, q) {
  const op = OPS[a.op];
  const val = op?.pct ? `${a.value}%` : `${a.value} ${q?.currency ?? ""}`.trim();
  return `${q?.name ? `${q.name} (${a.symbol})` : a.symbol} ${op?.label ?? a.op}${op?.pct ? "" : " "}${val}`;
}

// Restituisce gli avvisi scattati e aggiorna in place quelli attivi
export function evaluate(alerts, quotes) {
  const bySym = new Map(quotes.map((q) => [q.symbol, q]));
  const fired = [];
  for (const a of alerts) {
    if (a.triggeredAt) continue;
    const q = bySym.get(a.symbol);
    if (!q || q.stale || q.price == null) continue;
    if (q.time && Date.now() - Date.parse(q.time) > 4 * 864e5) continue; // quotazione troppo vecchia
    if (OPS[a.op]?.test(q, a.value)) {
      a.triggeredAt = new Date().toISOString();
      a.triggerPrice = q.price; a.triggerChange = q.changePct;
      fired.push({ ...a, text: describe(a, q), price: q.price, currency: q.currency, changePct: q.changePct });
    }
  }
  return fired;
}
