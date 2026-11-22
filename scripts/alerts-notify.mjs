// Notifica gli avvisi di prezzo scattati (data/alerts-fired.json) con una issue che menziona il proprietario.
import { readFile } from "node:fs/promises";
import { createIssue } from "./lib/gh.mjs";

const fired = JSON.parse(await readFile("site/data/alerts-fired.json", "utf8").catch(() => "[]"));
const owner = process.env.GITHUB_REPOSITORY_OWNER;
const site = process.env.SITE_URL ?? `https://${owner.toLowerCase()}.github.io/${process.env.GITHUB_REPOSITORY.split("/")[1]}`;
const nf = (v, d = 2) => (v == null ? "–" : v.toLocaleString("it-IT", { maximumFractionDigits: d }));
for (const a of fired) {
  const body = `@${owner} il tuo avviso di prezzo è scattato.

| | |
|---|---|
| Condizione | ${a.text} |
| Prezzo | **${nf(a.price, 4)} ${a.currency ?? ""}** |
| Variazione oggi | ${nf(a.changePct)}% |
| Rilevato | ${new Date(a.triggeredAt).toLocaleString("it-IT", { timeZone: "Europe/Rome" })} |

[Apri ${a.symbol} su BortEconomy](${site}/#q=${encodeURIComponent(a.symbol)})${a.issue ? ` · richiesta originale #${a.issue}` : ""}

L'avviso è stato disattivato; puoi crearne uno nuovo dal sito.

---
_Generata automaticamente da BortEconomy_`;
  createIssue(`🔔 ${a.text}`, body);
  console.log(`Notificato: ${a.text}`);
}
if (!fired.length) console.log("Nessun avviso scattato");
