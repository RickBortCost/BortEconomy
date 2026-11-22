// Proxy degli assistenti AI (Cloudflare Pages Function, stessa origine del sito: /api/...).
//
// Le chiavi API restano sul server (secret del progetto Pages); il browser invia solo un codice di accesso personale.
//   GET  /api/status                → fornitori disponibili (nessun dato sensibile)
//   *    /api/<fornitore>/<percorso> → inoltro all'API del fornitore, solo percorsi ammessi
//
// Variabili del progetto (impostate da scripts/cf-deploy.mjs a partire dai secret di GitHub):
//   ACCESS_CODES      "nome:codice,nome2:codice2" – chi può usare il proxy
//   ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY – facoltative, una per fornitore
//   DAILY_LIMIT       richieste di generazione al giorno per persona (predefinito 60)
//   USAGE             KV per il conteggio giornaliero

const UP = {
  anthropic: {
    origin: "https://api.anthropic.com", secret: "ANTHROPIC_API_KEY",
    paths: [/^v1\/messages$/, /^v1\/models$/],
    auth: (k) => ({ "x-api-key": k }),
    pass: ["anthropic-version", "anthropic-beta"],
  },
  openai: {
    origin: "https://api.openai.com", secret: "OPENAI_API_KEY",
    paths: [/^v1\/responses$/, /^v1\/models$/],
    auth: (k) => ({ authorization: `Bearer ${k}` }),
    pass: [],
  },
  gemini: {
    origin: "https://generativelanguage.googleapis.com", secret: "GEMINI_API_KEY",
    paths: [/^v1beta\/models$/, /^v1beta\/models\/[\w.-]+:(streamGenerateContent|generateContent)$/],
    auth: (k) => ({ "x-goog-api-key": k }),
    pass: [],
  },
};
const MAX_BODY = 400_000;

const json = (obj, status = 200, extra = {}) => new Response(JSON.stringify(obj), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
});
const err = (status, message) => json({ error: { message } }, status);

async function sha256(s) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}
// Confronto a tempo costante (sugli hash, così anche la lunghezza non trapela)
async function same(a, b) {
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}
async function whoIs(code, env) {
  if (!code || code.length > 200) return null;
  let who = null;
  for (const entry of String(env.ACCESS_CODES ?? "").split(",")) {
    const i = entry.indexOf(":"); if (i < 1) continue;
    if (await same(code, entry.slice(i + 1).trim())) who = entry.slice(0, i).trim();
  }
  return who;
}

export async function onRequest({ request, env, params }) {
  const url = new URL(request.url);
  const parts = [].concat(params.path ?? []);
  const provider = parts[0], path = parts.slice(1).join("/");

  // Solo dal sito stesso (i browser inviano sempre Origin nelle richieste fetch POST e cross-origin)
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return err(403, "Origine non ammessa.");

  if (provider === "status" && request.method === "GET") {
    return json({
      providers: Object.keys(UP).filter((p) => env[UP[p].secret]),
      codes: !!env.ACCESS_CODES, dailyLimit: +(env.DAILY_LIMIT ?? 60),
    });
  }

  const P = UP[provider];
  if (!P || !P.paths.some((re) => re.test(path))) return err(404, "Percorso non disponibile.");
  if (!["GET", "POST"].includes(request.method)) return err(405, "Metodo non ammesso.");
  const key = env[P.secret];
  if (!key) return err(503, "Questo assistente non è configurato sul server.");

  // Tentativi falliti per indirizzo IP: al massimo 20 all'ora, poi blocco temporaneo
  const ip = request.headers.get("cf-connecting-ip") ?? "local", fk = `f:${ip}:${new Date().toISOString().slice(0, 13)}`;
  const fails = env.USAGE ? +((await env.USAGE.get(fk)) ?? 0) : 0;
  if (fails >= 20) return err(429, "Troppi tentativi con codici non validi. Riprova più tardi.");
  const who = await whoIs(request.headers.get("x-bort-code"), env);
  if (!who) {
    if (env.USAGE) await env.USAGE.put(fk, String(fails + 1), { expirationTtl: 7200 });
    await new Promise((r) => setTimeout(r, 600)); // rallenta i tentativi di indovinare il codice
    return err(401, "Codice di accesso non valido.");
  }

  // Limite giornaliero per persona (solo richieste di generazione)
  if (request.method === "POST" && env.USAGE) {
    const day = new Date().toISOString().slice(0, 10), k = `u:${who}:${day}`;
    const n = +((await env.USAGE.get(k)) ?? 0), lim = +(env.DAILY_LIMIT ?? 60);
    if (n >= lim) return err(429, `Limite giornaliero di ${lim} richieste raggiunto. Riprova domani.`);
    await env.USAGE.put(k, String(n + 1), { expirationTtl: 3 * 86400 });
  }

  const len = +(request.headers.get("content-length") ?? 0);
  if (len > MAX_BODY) return err(413, "Richiesta troppo grande.");
  const body = request.method === "POST" ? await request.arrayBuffer() : undefined;
  if (body && body.byteLength > MAX_BODY) return err(413, "Richiesta troppo grande.");

  const headers = { "content-type": request.headers.get("content-type") ?? "application/json", ...P.auth(key) };
  for (const h of P.pass) { const v = request.headers.get(h); if (v) headers[h] = v; }
  const q = new URLSearchParams(url.search); q.delete("key");
  const target = `${P.origin}/${path}${q.toString() ? `?${q}` : ""}`;

  const res = await fetch(target, { method: request.method, headers, body });
  const out = new Headers({ "cache-control": "no-store" });
  for (const h of ["content-type", "request-id", "x-request-id", "retry-after"]) { const v = res.headers.get(h); if (v) out.set(h, v); }
  return new Response(res.body, { status: res.status, headers: out });
}
