// Apre (o aggiorna) una issue quando l'aggiornamento dei dati è degradato e la chiude quando torna regolare.
// La issue menziona il proprietario del repository: GitHub invia la notifica (anche push sull'app mobile).
import { readFile } from "node:fs/promises";
import { findOpenIssue, lastCommentAt, createIssue, comment, close } from "./lib/gh.mjs";

const TITLE = "⚠️ Aggiornamento dati degradato";
// Se lo script di aggiornamento si è interrotto, health.json manca o è di un'esecuzione incompleta
const health = await readFile("site/data/health.json", "utf8").then(JSON.parse)
  .catch(() => ({ status: "degraded", warnings: ["Lo script di aggiornamento si è interrotto: il sito non è stato ripubblicato"], markets: {} }));
const owner = process.env.GITHUB_REPOSITORY_OWNER;
const run = `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`;
const open = findOpenIssue(TITLE);
const m = health.markets ?? {};
const summary = `- Quotazioni aggiornate: **${m.fresh}/${m.total}** (riprese dalla pubblicazione precedente: ${m.reused}, mancanti: ${m.missing})
- Notizie mondo: ${health.news?.WORLD ?? 0} · Directory: ${health.directory?.items ?? "errore"} titoli · Fondamentali: ${health.fundamentals}
${health.warnings.map((w) => `- ⚠️ ${w}`).join("\n")}

[Dettagli dell'esecuzione](${run})`;

if (health.status === "degraded") {
  if (!open) {
    createIssue(TITLE, `@${owner} l'ultimo aggiornamento automatico non è riuscito a scaricare buona parte dei dati. Il sito mostra gli ultimi dati validi.\n\n${summary}\n\nLa issue si chiude da sola quando i dati tornano regolari.\n\n---\n_Generata automaticamente da BortEconomy_`);
    console.log("Issue di avviso creata");
  } else if (Date.now() - lastCommentAt(open.number) > 3 * 3600e3) {
    comment(open.number, `Ancora degradato (${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC).\n\n${summary}`);
    console.log(`Issue #${open.number} aggiornata`);
  }
} else if (open) {
  close(open.number, `✅ Dati di nuovo regolari: ${m.fresh}/${m.total} quotazioni aggiornate.\n\n[Esecuzione](${run})`);
  console.log(`Issue #${open.number} chiusa`);
} else {
  console.log(`Stato: ${health.status}`);
}
