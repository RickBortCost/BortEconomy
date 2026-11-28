// Calendario economico (dati macro della settimana corrente e successiva) e prossimi utili societari.
let H;
const cal = { kind: "macro", impact: 2, cur: "all", data: null };

// Traduzione dei termini più frequenti dei titoli degli eventi (fonte in inglese)
const TERMS = [
  [/\bCore PCE Price Index\b/i, "Deflatore PCE core"], [/\bPCE Price Index\b/i, "Deflatore PCE"],
  [/\bCore CPI\b/i, "Inflazione core (CPI)"], [/\bTrimmed Mean CPI\b/i, "Inflazione media troncata (CPI)"], [/\bCPI\b/, "Inflazione (CPI)"],
  [/\bCore PPI\b/i, "Prezzi alla produzione core"], [/\bPPI\b/, "Prezzi alla produzione"],
  [/\bPrelim GDP Price Index\b/i, "Deflatore del PIL preliminare"], [/\bPrelim GDP\b/i, "PIL preliminare"], [/\bAdvance GDP\b/i, "PIL anticipato"], [/\bFinal GDP\b/i, "PIL finale"], [/\bGDP\b/, "PIL"],
  [/\bADP Non-Farm Employment Change\b/i, "Occupati ADP"], [/\bNon-Farm Employment Change\b/i, "Nuovi occupati non agricoli"], 
  [/\bUnemployment Claims\b/i, "Richieste di sussidi di disoccupazione"], [/\bUnemployment Rate\b/i, "Tasso di disoccupazione"],
  [/\bEmployment Change\b/i, "Variazione occupati"], [/\bAverage Hourly Earnings\b/i, "Salari orari medi"],
  [/\bFederal Funds Rate\b/i, "Tassi Fed"], [/\bMain Refinancing Rate\b/i, "Tassi BCE"], [/\bOfficial Bank Rate\b/i, "Tassi Bank of England"],
  [/\bCash Rate\b/i, "Tassi RBA"], [/\bOvernight Rate\b/i, "Tassi Bank of Canada"], [/\bBOJ Policy Rate\b/i, "Tassi Bank of Japan"],
  [/\bFOMC Meeting Minutes\b/i, "Verbali FOMC"], [/\bFOMC Statement\b/i, "Comunicato FOMC"], [/\bMonetary Policy Statement\b/i, "Comunicato di politica monetaria"],
  [/\bFlash Manufacturing PMI\b/i, "PMI manifatturiero (flash)"], [/\bFlash Services PMI\b/i, "PMI servizi (flash)"],
  [/\bISM Manufacturing PMI\b/i, "ISM manifatturiero"], [/\bISM Services PMI\b/i, "ISM servizi"], [/\bManufacturing PMI\b/i, "PMI manifatturiero"], [/\bServices PMI\b/i, "PMI servizi"], 
  [/\bCore Retail Sales\b/i, "Vendite al dettaglio core"], [/\bRetail Sales\b/i, "Vendite al dettaglio"],
  [/\bCB Consumer Confidence\b/i, "Fiducia consumatori (Conference Board)"], [/\bConsumer Confidence\b/i, "Fiducia dei consumatori"],
  [/\bPrelim UoM Consumer Sentiment\b/i, "Fiducia consumatori Michigan (prelim.)"], [/\bUoM Consumer Sentiment\b/i, "Fiducia consumatori Michigan"],
  [/\bIfo Business Climate\b/i, "Clima d'affari Ifo"], [/\bZEW Economic Sentiment\b/i, "Fiducia ZEW"],
  [/\bTrade Balance\b/i, "Bilancia commerciale"], [/\bCurrent Account\b/i, "Partite correnti"],
  [/\bIndustrial Production\b/i, "Produzione industriale"], [/\bCore Durable Goods Orders\b/i, "Ordini di beni durevoli core"], [/\bDurable Goods Orders\b/i, "Ordini di beni durevoli"], 
  [/\bBuilding Permits\b/i, "Permessi di costruzione"], [/\bHousing Starts\b/i, "Nuovi cantieri"], [/\bExisting Home Sales\b/i, "Vendite case esistenti"], [/\bNew Home Sales\b/i, "Vendite case nuove"], [/\bPending Home Sales\b/i, "Vendite case in corso"],
  [/\bCrude Oil Inventories\b/i, "Scorte di petrolio"], [/\bNatural Gas Storage\b/i, "Scorte di gas naturale"],
  [/\bBank Holiday\b/i, "Festività"], [/\bSpeaks\b/i, "interviene"], [/\bPress Conference\b/i, "conferenza stampa"],
  [/\bm\/m\b/, "m/m"], [/\bq\/q\b/, "t/t"], [/\by\/y\b/, "a/a"],
  [/^French\b/, "Francia:"], [/^German\b/, "Germania:"], [/^Italian\b/, "Italia:"], [/^Spanish\b/, "Spagna:"],
];
const tr = (t) => TERMS.reduce((s, [re, it]) => s.replace(re, it), t);
const FLAG = { USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵", CHF: "🇨🇭", CAD: "🇨🇦", AUD: "🇦🇺", NZD: "🇳🇿", CNY: "🇨🇳", ALL: "🌍" };
const IMPACT = ["Festività", "Basso", "Medio", "Alto"];

async function load() {
  cal.data ??= fetch(`data/calendar.json?t=${Math.floor(Date.now() / 300000)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return cal.data;
}

const dayKey = (iso) => new Date(iso).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
const time = (iso) => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

export async function renderCalendar() {
  const $ = H.$;
  const d = await load();
  $("#cal-filters").hidden = cal.kind !== "macro";
  if (!d) { $("#cal-list").innerHTML = '<div class="empty">Calendario non disponibile.</div>'; return; }
  $("#cal-meta").textContent = `Orari nel fuso del tuo dispositivo · fonte: ForexFactory (macro), Yahoo Finance (utili) · aggiornato ${new Date(d.updated).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`;
  const now = Date.now() - 3 * 3600e3;
  let items;
  if (cal.kind === "macro") {
    const curs = [...new Set(d.macro.map((e) => e.cur))];
    $("#cal-cur").innerHTML = ["all", ...curs].map((c) => `<option value="${c}" ${c === cal.cur ? "selected" : ""}>${c === "all" ? "Tutte le valute" : `${FLAG[c] ?? ""} ${c}`}</option>`).join("");
    items = d.macro.filter((e) => Date.parse(e.date) >= now && e.impact >= cal.impact && (cal.cur === "all" || e.cur === cal.cur));
  } else {
    items = d.earnings.filter((e) => Date.parse(e.date) >= now);
  }
  if (!items.length) { $("#cal-list").innerHTML = '<div class="empty">Nessun evento con questi filtri.</div>'; return; }
  const groups = new Map();
  for (const e of items) { const k = dayKey(e.date); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(e); }
  $("#cal-list").innerHTML = [...groups.entries()].map(([day, evs]) => `
    <h3 class="cal-day">${H.esc(day.charAt(0).toUpperCase() + day.slice(1))}</h3>
    <ul class="rows cal-rows">${evs.map((e) => cal.kind === "macro" ? `
      <li class="cal-ev imp${e.impact}">
        <span class="cal-time">${time(e.date)}</span>
        <div class="nm"><b title="${H.esc(e.title)}">${FLAG[e.cur] ?? ""} ${H.esc(tr(e.title))}</b>
          <small><i class="imp-dot" title="Impatto ${IMPACT[e.impact]}"></i>${IMPACT[e.impact]} · ${H.esc(e.country)}${e.forecast ? ` · previsto <b>${H.esc(e.forecast)}</b>` : ""}${e.previous ? ` · precedente ${H.esc(e.previous)}` : ""}${e.actual ? ` · <b>effettivo ${H.esc(e.actual)}</b>` : ""}</small></div>
      </li>` : `
      <li class="cal-ev" data-sym="${H.esc(e.symbol)}" tabindex="0" role="button">
        <span class="cal-time">${new Date(e.date).getUTCHours() || new Date(e.date).getUTCMinutes() ? time(e.date) : "–"}</span>
        <div class="nm"><b>${H.esc(e.name)}</b><small>${H.esc(e.symbol)} · risultati trimestrali${e.estimate ? ' · <span class="tag">data stimata</span>' : ""}</small></div>
      </li>`).join("")}</ul>`).join("");
}

// Eventi rilevanti per il contesto di Claude e per il punto del giorno
export async function upcoming(days = 7) {
  const d = await load();
  if (!d) return "";
  const until = Date.now() + days * 864e5, from = Date.now() - 6 * 3600e3;
  const m = d.macro.filter((e) => e.impact >= 2 && Date.parse(e.date) >= from && Date.parse(e.date) <= until)
    .map((e) => `${new Date(e.date).toLocaleString("it-IT", { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} ${e.cur} ${e.title}${e.forecast ? ` (prev. ${e.forecast}, prec. ${e.previous ?? "–"})` : ""}${e.actual ? ` = ${e.actual}` : ""}`);
  const er = d.earnings.filter((e) => Date.parse(e.date) >= from && Date.parse(e.date) <= until).map((e) => `${new Date(e.date).toLocaleDateString("it-IT", { weekday: "short", day: "numeric" })} ${e.name} (${e.symbol})`);
  return `Agenda macro (impatto medio/alto): ${m.join("; ") || "nessun evento"}\nUtili societari: ${er.join("; ") || "nessuno"}`;
}

export function initCalendar(helpers) {
  H = helpers;
  H.seg("#cal-kind", (v) => { cal.kind = v; renderCalendar(); });
  H.seg("#cal-impact", (v) => { cal.impact = +v; renderCalendar(); });
  H.$("#cal-cur").addEventListener("change", (e) => { cal.cur = e.target.value; renderCalendar(); });
}
