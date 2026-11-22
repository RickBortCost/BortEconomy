// "Il punto del giorno": riepilogo dei mercati generato da Claude una volta al giorno (dalle 7:00, ora italiana).
// Richiede il secret ANTHROPIC_API_KEY nel repository; senza chiave ripubblica l'ultimo riepilogo disponibile.
// Uso: node scripts/brief.mjs   (BRIEF_FORCE=1 per rigenerarlo subito)
import { readFile, writeFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { previous } from "./lib/http.mjs";

const OUT = "site/data/brief.json";
const MODEL = process.env.BRIEF_MODEL || "claude-opus-5-5";
const rome = (d = new Date()) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
}).formatToParts(d).map((p) => [p.type, p.value]));
const now = rome();
const today = `${now.year}-${now.month}-${now.day}`;

const prev = await previous("data/brief.json");
const keep = async (why) => {
  if (prev) await writeFile(OUT, JSON.stringify(prev));
  console.log(`Punto del giorno non rigenerato: ${why}${prev ? ` (ripubblicato quello del ${prev.date})` : ""}`);
};

if (!process.env.ANTHROPIC_API_KEY) { await keep("secret ANTHROPIC_API_KEY non configurato"); process.exit(0); }
if (!process.env.BRIEF_FORCE && (prev?.date === today || +now.hour < 7)) { await keep("già generato oggi o prima delle 7:00"); process.exit(0); }

// ---------- contesto dai dati appena scaricati ----------
const read = async (f) => JSON.parse(await readFile(`site/data/${f}`, "utf8").catch(() => "null"));
const [markets, world, italy, metals, calendar] = await Promise.all(["markets.json", "news-WORLD.json", "news-IT.json", "news-METALS.json", "calendar.json"].map(read));
const config = JSON.parse(await readFile("site/config.json", "utf8"));
const q = new Map((markets?.quotes ?? []).map((x) => [x.symbol, x]));
const nf = (v, d = 2) => (v == null ? "n/d" : v.toLocaleString("it-IT", { maximumFractionDigits: d, minimumFractionDigits: d }));
const line = (s) => { const x = q.get(s); return x ? `${x.name} ${nf(x.price)} (${x.changePct >= 0 ? "+" : ""}${nf(x.changePct)}% oggi, ${nf(x.weekPct)}% settimana)` : null; };
const equities = [...q.values()].filter((x) => x.type === "EQUITY" && !x.stale && x.changePct != null).sort((a, b) => b.changePct - a.changePct);
const headlines = (n, arr) => (arr?.items ?? []).filter((x) => Date.now() - Date.parse(x.date) < 36 * 3600e3).slice(0, n).map((x) => `- ${x.title} (${x.source})`).join("\n");
const agenda = (calendar?.macro ?? []).filter((e) => e.impact >= 2 && Date.parse(e.date) > Date.now() - 12 * 3600e3 && Date.parse(e.date) < Date.now() + 36 * 3600e3)
  .map((e) => `- ${new Date(e.date).toLocaleString("it-IT", { timeZone: "Europe/Rome", weekday: "short", hour: "2-digit", minute: "2-digit" })} ${e.cur} ${e.title}${e.forecast ? ` (previsto ${e.forecast}, precedente ${e.previous ?? "n/d"})` : ""}${e.actual ? ` → effettivo ${e.actual}` : ""}`).join("\n");
const earnings = (calendar?.earnings ?? []).filter((e) => Date.parse(e.date) < Date.now() + 2 * 864e5).map((e) => `${e.name} (${e.symbol})`).join(", ");

const context = `Data: ${new Date().toLocaleDateString("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long", year: "numeric" })}. Quotazioni aggiornate a: ${markets?.updated ?? "n/d"}.

<indici>
${[...new Set(["FTSEMIB.MI", ...config.globalIndices])].map(line).filter(Boolean).join("\n")}
</indici>
<macro>
${config.macro.map(line).filter(Boolean).join("\n")}
</macro>
<metalli>
${(config.metals?.items ?? []).map((m) => line(m.symbol)).filter(Boolean).join("\n")}
</metalli>
<azioni_migliori>${equities.slice(0, 8).map((x) => `${x.name} ${nf(x.changePct)}%`).join(", ")}</azioni_migliori>
<azioni_peggiori>${equities.slice(-8).reverse().map((x) => `${x.name} ${nf(x.changePct)}%`).join(", ")}</azioni_peggiori>
<notizie_mondo>
${headlines(30, world)}
</notizie_mondo>
<notizie_italia>
${headlines(20, italy)}
</notizie_italia>
<notizie_metalli>
${headlines(8, metals)}
</notizie_metalli>
<agenda_prossime_36_ore>
${agenda || "nessun evento di rilievo"}
</agenda_prossime_36_ore>
<utili_societari_prossimi_2_giorni>${earnings || "nessuno tra i titoli monitorati"}</utili_societari_prossimi_2_giorni>`;

const system = `Sei il caporedattore economico di BortEconomy e scrivi "Il punto del giorno": il riepilogo mattutino che i lettori italiani leggono in 2 minuti per sapere cosa sta succedendo sui mercati e cosa seguire oggi.

Scrivi in italiano, tono professionale e chiaro, in Markdown con questi titoli (### ...), in quest'ordine:
### In breve — 3 punti elenco, i fatti più importanti.
### Mercati — indici, valute, tassi, con i numeri essenziali e le cause.
### Italia — Piazza Affari, titoli e notizie italiane rilevanti.
### Dal mondo — banche centrali, macroeconomia, geopolitica con impatto economico.
### Metalli e materie prime
### Da seguire oggi — agenda macro e utili, con perché contano.

Basati sui dati forniti. Puoi usare la ricerca web (poche ricerche) per verificare o completare le notizie più recenti, ad esempio l'andamento dei mercati asiatici e dei future questa mattina. Distingui fatti e interpretazioni; non inventare numeri; non dare consigli di investimento. Lunghezza: 350-500 parole. Non aggiungere premesse o saluti.`;

// ---------- chiamata a Claude ----------
const client = new Anthropic();
const messages = [{ role: "user", content: `${context}\n\nScrivi il punto del giorno.` }];
const params = {
  model: MODEL,
  max_tokens: 16000,
  system,
  output_config: { effort: "medium" },
  tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4, user_location: { type: "approximate", country: "IT", timezone: "Europe/Rome" } }],
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
  messages,
};

let final;
try {
  for (let turn = 0; turn < 4; turn++) {
    final = await client.beta.messages.stream(params).finalMessage();
    messages.push({ role: "assistant", content: final.content });
    if (final.stop_reason !== "pause_turn") break;
  }
} catch (e) {
  const kind = e instanceof Anthropic.AuthenticationError ? "chiave API non valida"
    : e instanceof Anthropic.RateLimitError ? "limite di richieste raggiunto"
    : e instanceof Anthropic.APIError ? `errore API ${e.status}` : `errore di rete (${e.message})`;
  console.log(`::warning::Punto del giorno: ${kind}`);
  await keep(kind);
  process.exit(0);
}

if (final.stop_reason === "refusal") { await keep("richiesta declinata dal modello"); process.exit(0); }
const blocks = final.content;
const lastFallback = blocks.map((b) => b.type).lastIndexOf("fallback");
const markdown = blocks.slice(lastFallback + 1).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
if (!markdown) { await keep("risposta vuota"); process.exit(0); }
const sources = [...new Map(blocks.flatMap((b) => b.citations ?? []).filter((c) => c.url).map((c) => [c.url, c.title || c.url])).entries()]
  .slice(0, 8).map(([url, title]) => ({ url, title }));

await writeFile(OUT, JSON.stringify({ date: today, generatedAt: new Date().toISOString(), model: final.model, markdown, sources, truncated: final.stop_reason === "max_tokens" || undefined }));
console.log(`Punto del giorno generato (${final.model}, ${final.usage.input_tokens} token in ingresso, ${final.usage.output_tokens} in uscita)`);
