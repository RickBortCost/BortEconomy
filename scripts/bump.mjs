// Uso: node scripts/bump.mjs <patch|minor|major>
// Aggiorna la versione in package.json e sposta "Non rilasciato" del CHANGELOG in una nuova sezione datata.
import { readFile, writeFile } from "node:fs/promises";

const kind = process.argv[2];
if (!["patch", "minor", "major"].includes(kind)) { console.error("Uso: node scripts/bump.mjs <patch|minor|major>"); process.exit(1); }

const pkg = JSON.parse(await readFile("package.json", "utf8"));
const prev = pkg.version;
let [ma, mi, pa] = prev.split(".").map(Number);
if (kind === "major") { ma++; mi = 0; pa = 0; } else if (kind === "minor") { mi++; pa = 0; } else pa++;
const next = `${ma}.${mi}.${pa}`;

let cl = await readFile("CHANGELOG.md", "utf8");
const m = cl.match(/## \[Non rilasciato\]\n([\s\S]*?)(?=\n## \[)/);
if (!m || !m[1].trim()) { console.error("Sezione [Non rilasciato] vuota: documenta le modifiche nel CHANGELOG prima del rilascio."); process.exit(1); }
const date = new Date().toISOString().slice(0, 10);
cl = cl.replace(m[0], `## [Non rilasciato]\n\n## [${next}] - ${date}\n${m[1].trimEnd()}\n`);
const repo = "https://github.com/RickBortCost/BortEconomy";
cl = cl.replace(/\[Non rilasciato\]: .*\n/, `[Non rilasciato]: ${repo}/compare/v${next}...HEAD\n[${next}]: ${repo}/compare/v${prev}...v${next}\n`);

pkg.version = next;
await writeFile("package.json", JSON.stringify(pkg, null, 2) + "\n");
await writeFile("CHANGELOG.md", cl);
console.log(`Versione ${prev} -> ${next}. Fai commit e merge su main: la release v${next} verrà creata automaticamente.`);
