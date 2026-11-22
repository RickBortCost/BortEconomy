// Scarica dal sito pubblicato i dati usati dai test (se site/data non c'è già), così i test
// verificano il codice della PR con dati reali senza rieseguire l'intero aggiornamento.
import { mkdir, writeFile, access } from "node:fs/promises";

const SITE = (process.env.SITE_URL ?? "https://rickbortcost.github.io/BortEconomy").replace(/\/$/, "");
const OUT = "site/data";
try { await access(`${OUT}/markets.json`); console.log("site/data già presente: uso i dati locali"); process.exit(0); } catch {}

const files = ["meta.json", "markets.json", "directory.json", "calendar.json", "profiles.json", "health.json", "brief.json", "alerts.json",
  "news-WORLD.json", "news-IT.json", "news-US.json", "news-METALS.json",
  "hist/ENI.MI.json", "hist/AAPL.json", "hist/GC_F.json", "hist/SI_F.json", "hist/PL_F.json", "hist/PA_F.json", "hist/_GSPC.json", "hist/EURUSD_X.json"];
await mkdir(`${OUT}/hist`, { recursive: true });
let ok = 0;
for (const f of files) {
  const r = await fetch(`${SITE}/data/${f}?t=${Date.now()}`).catch(() => null);
  if (!r?.ok) { console.log(`- ${f}: non disponibile`); continue; }
  await writeFile(`${OUT}/${f}`, Buffer.from(await r.arrayBuffer()));
  ok++;
}
console.log(`fixture: ${ok}/${files.length} file`);
if (!ok) process.exit(1);
