// Pubblica il sito su Cloudflare Pages con il proxy AI (Pages Functions in functions/) e le intestazioni di sicurezza.
//
// Variabili d'ambiente (dai secret di GitHub):
//   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID       obbligatorie
//   BORT_ACCESS_CODES                                 "nome:codice,…" – chi può usare il proxy AI
//   ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY facoltative, abilitano il fornitore nel proxy
//   BORT_DAILY_LIMIT                                  richieste al giorno per persona (predefinito 60)
//   GH_DISPATCH_TOKEN                                 facoltativo: token GitHub (Actions: Read and write) per il timer
//                                                     che avvia l'aggiornamento dei dati ogni 30 minuti (workers/scheduler)
//
// I dati (site/data) non vengono caricati: functions/data li legge dalla pubblicazione su GitHub Pages.
import { cp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const PROJECT = process.env.CF_PROJECT ?? "borteconomy";
const KV_TITLE = "borteconomy-usage";
const WRANGLER = "wrangler@4.157.0";
const { CLOUDFLARE_API_TOKEN: TOKEN, CLOUDFLARE_ACCOUNT_ID: ACCOUNT } = process.env;
if (!TOKEN || !ACCOUNT) { console.log("Secret CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID non configurati: pubblicazione su Cloudflare saltata."); process.exit(0); }

const API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}`;
async function cf(path, init = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...init.headers } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.success === false) {
    const e = new Error(`${init.method ?? "GET"} ${path}: ${res.status} ${(j.errors ?? []).map((x) => `${x.code} ${x.message}`).join("; ")}`);
    e.status = res.status; throw e;
  }
  return j.result;
}

// 1. Progetto Pages
let project;
try { project = await cf(`/pages/projects/${PROJECT}`); }
catch (e) {
  if (e.status !== 404) throw e;
  console.log(`Creo il progetto Pages "${PROJECT}"`);
  project = await cf("/pages/projects", { method: "POST", body: JSON.stringify({ name: PROJECT, production_branch: "main" }) });
}

// 2. KV per i limiti giornalieri del proxy
const spaces = await cf("/storage/kv/namespaces?per_page=100");
let kv = spaces.find((n) => n.title === KV_TITLE);
if (!kv) { console.log(`Creo il KV "${KV_TITLE}"`); kv = await cf("/storage/kv/namespaces", { method: "POST", body: JSON.stringify({ title: KV_TITLE }) }); }

// 3. Configurazione di produzione: binding KV e secret (i valori non vengono mai stampati)
const env_vars = { DAILY_LIMIT: { type: "plain_text", value: process.env.BORT_DAILY_LIMIT || "60" } };
for (const [name, from] of [["ACCESS_CODES", "BORT_ACCESS_CODES"], ["ANTHROPIC_API_KEY"], ["OPENAI_API_KEY"], ["GEMINI_API_KEY"]]) {
  const v = process.env[from ?? name];
  if (v) env_vars[name] = { type: "secret_text", value: v.trim() };
}
await cf(`/pages/projects/${PROJECT}`, {
  method: "PATCH",
  body: JSON.stringify({ deployment_configs: { production: { compatibility_date: "2026-11-01", kv_namespaces: { USAGE: { namespace_id: kv.id } }, env_vars } } }),
});
console.log(`Configurazione aggiornata. Proxy: ${Object.keys(env_vars).filter((k) => k.endsWith("_API_KEY")).map((k) => k.split("_")[0].toLowerCase()).join(", ") || "nessun fornitore"}; codici di accesso: ${env_vars.ACCESS_CODES ? "sì" : "no"}.`);

// 4. Pubblicazione (senza la cartella dei dati)
await rm(".cf-dist", { recursive: true, force: true });
await cp("site", ".cf-dist", { recursive: true, filter: (src) => !/(^|\/)site\/data(\/|$)/.test(src) });
execFileSync("npx", ["-y", WRANGLER, "pages", "deploy", ".cf-dist", "--project-name", PROJECT, "--branch", "main", "--commit-dirty=true"], {
  stdio: "inherit", env: { ...process.env, CLOUDFLARE_API_TOKEN: TOKEN, CLOUDFLARE_ACCOUNT_ID: ACCOUNT },
});
console.log(`Pubblicato su https://${project.subdomain ?? `${PROJECT}.pages.dev`}`);

// 5. Timer degli aggiornamenti (Worker con Cron Trigger), solo se è presente il token GitHub
if (process.env.GH_DISPATCH_TOKEN) {
  const opts = { cwd: "workers/scheduler", env: { ...process.env, CLOUDFLARE_API_TOKEN: TOKEN, CLOUDFLARE_ACCOUNT_ID: ACCOUNT } };
  execFileSync("npx", ["-y", WRANGLER, "deploy"], { ...opts, stdio: "inherit" });
  execFileSync("npx", ["-y", WRANGLER, "secret", "put", "GH_DISPATCH_TOKEN"], { ...opts, input: process.env.GH_DISPATCH_TOKEN, stdio: ["pipe", "inherit", "inherit"] });
  console.log("Timer degli aggiornamenti attivo (ogni 30 minuti).");
} else console.log("GH_DISPATCH_TOKEN non configurato: timer degli aggiornamenti non pubblicato.");
