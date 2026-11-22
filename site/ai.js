// Assistenti AI supportati: Claude (Anthropic), ChatGPT (OpenAI), Gemini (Google).
// Le chiamate partono dal browser direttamente verso l'API del fornitore, con la chiave dell'utente.
// Ogni fornitore mantiene la propria conversazione nel formato nativo della sua API.

import { vault } from "./vault.js";
import { pls, pss } from "./profiles.js";

const sse = async function* (res) {
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      const data = chunk.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n");
      if (data && data !== "[DONE]") { try { yield JSON.parse(data); } catch {} }
    }
  }
};

async function httpError(res, provider) {
  let msg = "";
  try { const j = await res.json(); msg = j.error?.message ?? j.message ?? ""; } catch {}
  const e = new Error(msg || `HTTP ${res.status}`); e.status = res.status; e.provider = provider;
  return e;
}

// ---------------------------------------------------------------- Claude
let anthropicMod = null;
const claude = {
  id: "claude", label: "Claude", vendor: "Anthropic", keyHint: "sk-ant-…", keyUrl: "console.anthropic.com", host: "api.anthropic.com",
  defaultModel: "claude-opus-5-5",
  models: [["claude-opus-5-5", "Claude Opus 5.5 (consigliato)"], ["claude-sonnet-5-5", "Claude Sonnet 5.5"], ["claude-haiku-5-5", "Claude Haiku 5.5 (economico)"]],
  async listModels() { return this.models; },
  async send({ key, via, model, system, conv, text, web, onText, onStatus }) {
    anthropicMod ??= await import("./vendor/anthropic-sdk.js");
    const Anthropic = anthropicMod.default ?? anthropicMod.Anthropic;
    const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, ...(via ? { baseURL: via.base, defaultHeaders: via.headers } : {}) });
    const isHaiku = model.startsWith("claude-haiku");
    conv.push({ role: "user", content: text });
    const params = { model, max_tokens: 16000, system, output_config: { effort: "medium" }, messages: conv };
    if (web) params.tools = [{ type: isHaiku ? "web_search_20250305" : "web_search_20260209", name: "web_search", max_uses: 5 }];
    if (!isHaiku) { params.betas = ["server-side-fallback-2026-07-01"]; params.fallbacks = "default"; }
    let final, live = "";
    try {
      for (let turn = 0; turn < 4; turn++) {
        const stream = client.beta.messages.stream(params);
        stream.on("text", (d) => { live += d; onText(live); });
        stream.on("contentBlock", (b) => { if (b.type === "server_tool_use" && !live) onStatus("Ricerca sul web in corso…"); });
        final = await stream.finalMessage();
        conv.push({ role: "assistant", content: final.content });
        if (final.stop_reason !== "pause_turn") break;
        live += "\n";
      }
    } catch (e) { conv.splice(conv.findLastIndex((m) => m.role === "user")); throw e; }
    if (final.stop_reason === "refusal") { conv.splice(conv.findLastIndex((m) => m.role === "user")); return { refused: true }; }
    const blocks = final.content;
    const lastFb = blocks.map((b) => b.type).lastIndexOf("fallback");
    const sources = new Map();
    for (const b of blocks) for (const c of b.citations ?? []) if (c.url) sources.set(c.url, c.title || c.url);
    return { text: blocks.slice(lastFb + 1).filter((b) => b.type === "text").map((b) => b.text).join("") || live, sources, truncated: final.stop_reason === "max_tokens" };
  },
};

// ---------------------------------------------------------------- ChatGPT (OpenAI Responses API)
const openai = {
  id: "openai", label: "ChatGPT", vendor: "OpenAI", keyHint: "sk-…", keyUrl: "platform.openai.com", host: "api.openai.com",
  defaultModel: "chat-latest",
  async listModels(key, via) {
    const res = await fetch(`${via?.base ?? "https://api.openai.com"}/v1/models`, { headers: { Authorization: `Bearer ${key}`, ...via?.headers } });
    if (!res.ok) throw await httpError(res, "openai");
    const j = await res.json();
    return j.data.map((m) => m.id)
      .filter((id) => /^(gpt-|o\d|chat-latest|chatgpt)/.test(id) && !/(audio|realtime|transcribe|tts|image|embedding|search-preview|instruct)/.test(id))
      .sort((a, b) => b.localeCompare(a, "en", { numeric: true })).map((id) => [id, id]);
  },
  async send({ key, via, model, system, conv, text, web, onText, onStatus }) {
    conv.push({ role: "user", content: text });
    const body = { model, instructions: system, input: conv, stream: true, store: false };
    if (web) body.tools = [{ type: "web_search" }];
    const res = await fetch(`${via?.base ?? "https://api.openai.com"}/v1/responses`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, ...via?.headers }, body: JSON.stringify(body),
    }).catch((e) => { conv.pop(); throw e; });
    if (!res.ok) { conv.pop(); throw await httpError(res, "openai"); }
    let live = "", final = null;
    for await (const ev of sse(res)) {
      if (ev.type === "response.output_text.delta") { live += ev.delta; onText(live); }
      else if (ev.type === "response.web_search_call.in_progress" && !live) onStatus("Ricerca sul web in corso…");
      else if (ev.type === "response.completed" || ev.type === "response.incomplete") final = ev.response;
      else if (ev.type === "response.failed" || ev.type === "error") { conv.pop(); const e = new Error(ev.response?.error?.message ?? ev.message ?? "Errore"); throw e; }
    }
    const sources = new Map();
    for (const item of final?.output ?? []) for (const c of item.content ?? []) for (const a of c.annotations ?? []) if (a.type === "url_citation" && a.url) sources.set(a.url, a.title || a.url);
    conv.push({ role: "assistant", content: live });
    return { text: live, sources, truncated: final?.status === "incomplete" };
  },
};

// ---------------------------------------------------------------- Gemini (Google Generative Language API)
const gemini = {
  id: "gemini", label: "Gemini", vendor: "Google", keyHint: "AIza…", keyUrl: "aistudio.google.com", host: "generativelanguage.googleapis.com",
  defaultModel: "gemini-flash-latest",
  async listModels(key, via) {
    const res = await fetch(`${via?.base ?? "https://generativelanguage.googleapis.com"}/v1beta/models?pageSize=200`, { headers: { "x-goog-api-key": key, ...via?.headers } });
    if (!res.ok) throw await httpError(res, "gemini");
    const j = await res.json();
    return (j.models ?? []).filter((m) => m.supportedGenerationMethods?.includes("generateContent") && /gemini/.test(m.name) && !/(embedding|image|tts|audio|live)/.test(m.name))
      .map((m) => [m.name.replace(/^models\//, ""), `${m.displayName ?? m.name} (${m.name.replace(/^models\//, "")})`]);
  },
  async send({ key, via, model, system, conv, text, web, onText, onStatus }) {
    conv.push({ role: "user", parts: [{ text }] });
    const body = { systemInstruction: { parts: [{ text: system }] }, contents: conv };
    if (web) body.tools = [{ google_search: {} }];
    const res = await fetch(`${via?.base ?? "https://generativelanguage.googleapis.com"}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key, ...via?.headers }, body: JSON.stringify(body),
    }).catch((e) => { conv.pop(); throw e; });
    if (!res.ok) { conv.pop(); throw await httpError(res, "gemini"); }
    let live = "", finish = null, blocked = false;
    const sources = new Map();
    for await (const ev of sse(res)) {
      if (ev.promptFeedback?.blockReason) blocked = true;
      const c = ev.candidates?.[0];
      for (const p of c?.content?.parts ?? []) if (p.text && !p.thought) { live += p.text; onText(live); }
      for (const g of c?.groundingMetadata?.groundingChunks ?? []) if (g.web?.uri) sources.set(g.web.uri, g.web.title || g.web.uri);
      if (c?.groundingMetadata?.webSearchQueries?.length && !live) onStatus("Ricerca sul web in corso…");
      if (c?.finishReason) finish = c.finishReason;
    }
    if (blocked || finish === "SAFETY" || finish === "PROHIBITED_CONTENT") { conv.pop(); return { refused: true }; }
    conv.push({ role: "model", parts: [{ text: live }] });
    return { text: live, sources, truncated: finish === "MAX_TOKENS" };
  },
};

claude.keyAdvice = "Consiglio: crea la chiave in un workspace dedicato con limite di spesa mensile (Console Anthropic → Workspaces → Limits).";
openai.keyAdvice = "Consiglio: usa una chiave di un progetto dedicato con budget mensile e, se possibile, permessi limitati ai soli modelli (platform.openai.com → Projects → Limits).";
gemini.keyAdvice = "Consiglio: limita la chiave al sito (Google Cloud → Credenziali → Restrizioni per siti web: rickbortcost.github.io/*) e alla sola Generative Language API. Con il piano gratuito Google può usare i contenuti per migliorare i propri servizi: per dati sensibili usa un progetto a pagamento.";

export const PROVIDERS = { claude, openai, gemini };

// ---------------------------------------------------------------- server BortEconomy (proxy su Cloudflare)
// Disponibile solo sulla copia del sito pubblicata su Cloudflare Pages: le chiavi API restano sul server e il
// browser invia un codice di accesso personale. Su GitHub Pages /api/status non esiste e il proxy resta nascosto.
const SERVER_ID = { claude: "anthropic", openai: "openai", gemini: "gemini" };
export const server = {
  info: null,
  async load() {
    try {
      const r = await fetch("api/status", { cache: "no-store" });
      this.info = r.ok && (r.headers.get("content-type") ?? "").includes("json") ? await r.json() : null;
    } catch { this.info = null; }
    return this.info;
  },
  available() { return !!this.info?.codes; },
  has(p) { return this.available() && this.info.providers.includes(SERVER_ID[p]); },
  base(p) { return new URL(`api/${SERVER_ID[p]}`, location.href).href; },
};

// ---------------------------------------------------------------- impostazioni (chiavi e modelli per fornitore)
const LEGACY = { claude: ["apiKey", "model"] }; // chiavi usate prima del supporto multi-fornitore
const kKey = (p) => LEGACY[p]?.[0] ?? `apiKey.${p}`;
const kModel = (p) => LEGACY[p]?.[1] ?? `model.${p}`;

export const aiSettings = {
  provider() { const p = pls.get("ai-provider"); return PROVIDERS[p] ? p : "claude"; },
  setProvider(p) { pls.set("ai-provider", p); },
  key(p) {
    if (vault.enabled()) return vault.get(kKey(p)) || ""; // cassaforte attiva: chiave cifrata, disponibile solo da sbloccata
    return pss.get(kKey(p)) || pls.get(kKey(p)) || "";
  },
  persistent(p) { return vault.enabled() || !!pls.get(kKey(p)); },
  setKey(p, v, persist) {
    if (vault.enabled()) { vault.set(kKey(p), v || null); return; }
    pls.set(kKey(p), null); pss.set(kKey(p), null);
    if (v) (persist ? pls : pss).set(kKey(p), v);
  },
  model(p) { return pls.get(kModel(p)) || PROVIDERS[p].defaultModel; },
  setModel(p, m) { pls.set(kModel(p), m); },
  // Codice di accesso al server BortEconomy (dato protetto: passa dalla cassaforte se attiva)
  code() { return (vault.enabled() ? vault.get("proxyCode") : pls.get("proxyCode")) || ""; },
  setCode(v) { if (vault.enabled()) vault.set("proxyCode", v || null); else pls.set("proxyCode", v || null); },
  // Come raggiungere il fornitore: chiave personale (diretto) oppure server BortEconomy con codice
  access(p) {
    const key = this.key(p);
    if (key) return { key, via: null };
    if (server.has(p) && this.code()) return { key: "proxy", via: { base: server.base(p), headers: { "x-bort-code": this.code() } } };
    return null;
  },
  configured() { return Object.keys(PROVIDERS).filter((p) => this.access(p)); },
};

// Messaggio d'errore comprensibile, per fornitore
export function errorText(e, p) {
  const name = PROVIDERS[p]?.label ?? "AI", s = e?.status;
  if (e?.via && s === 401) return "Codice di accesso al server BortEconomy non valido. Controlla le impostazioni.";
  if (e?.via && s === 429) return e.message || "Limite giornaliero del server BortEconomy raggiunto.";
  if (e?.via && s === 503) return `${name} non è configurato sul server BortEconomy.`;
  if (s === 401 || s === 403) return `Chiave API di ${name} non valida o senza permessi. Controlla le impostazioni.`;
  if (s === 404) return `Modello non disponibile per ${name}. Apri le impostazioni e tocca "Carica modelli" per scegliere tra quelli attivi sul tuo account.`;
  if (s === 429) return `${name}: limite di richieste o credito esaurito. Riprova tra poco o controlla il piano del tuo account.`;
  if (s === 400) return `${name} ha rifiutato la richiesta: ${e.message}`;
  if (s >= 500 || s === 529) return `Servizio ${name} momentaneamente non disponibile. Riprova.`;
  if (e?.name === "TypeError") return `Impossibile contattare ${name}: controlla la connessione.`;
  return `Errore ${name}: ${e?.message ?? e}`;
}
