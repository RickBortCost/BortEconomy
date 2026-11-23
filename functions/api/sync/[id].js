// Sincronizzazione tra dispositivi (Cloudflare Pages Function: /api/sync/<id>).
//
// Il server conserva solo un contenitore cifrato end-to-end: la chiave di sincronizzazione non lascia mai i
// dispositivi; <id> è l'impronta SHA-256 derivata da quella chiave, quindi non rivela nulla e non si può indovinare.
//   GET  → { box, updated }  (404 se non esiste ancora)
//   PUT  ← { box }           al massimo 512 KB; massimo 240 scritture all'ora per indirizzo IP
//   DELETE                   elimina i dati (chi conosce la chiave)
// Accetta richieste dalla copia su Cloudflare (stessa origine) e da quella su GitHub Pages (CORS).
// Binding: SYNC (KV con i contenitori), USAGE (KV per i limiti).

const ALLOWED = ["https://rickbortcost.github.io"];
const MAX = 512 * 1024;

function cors(origin, self) {
  const ok = origin && (origin === self || ALLOWED.includes(origin));
  return ok ? { "access-control-allow-origin": origin, "access-control-allow-methods": "GET, PUT, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type", "access-control-max-age": "86400", vary: "Origin" } : {};
}
const json = (obj, status, extra) => new Response(JSON.stringify(obj), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...extra },
});

export async function onRequest({ request, env, params }) {
  const url = new URL(request.url), origin = request.headers.get("origin");
  const h = cors(origin, url.origin);
  if (origin && !h["access-control-allow-origin"]) return json({ error: "Origine non ammessa." }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  const id = String(params.id ?? "");
  if (!/^[a-f0-9]{64}$/.test(id)) return json({ error: "Identificativo non valido." }, 400, h);
  if (!env.SYNC) return json({ error: "Sincronizzazione non configurata sul server." }, 503, h);
  const key = `s:${id}`;

  if (request.method === "GET") {
    const v = await env.SYNC.get(key);
    return v ? new Response(v, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...h } }) : json({ error: "Nessun dato" }, 404, h);
  }
  if (request.method === "DELETE") { await env.SYNC.delete(key); return json({ ok: true }, 200, h); }
  if (request.method !== "PUT") return json({ error: "Metodo non ammesso." }, 405, h);

  const ip = request.headers.get("cf-connecting-ip") ?? "local", lk = `w:${ip}:${new Date().toISOString().slice(0, 13)}`;
  const n = env.USAGE ? +((await env.USAGE.get(lk)) ?? 0) : 0;
  if (n >= 240) return json({ error: "Troppe sincronizzazioni, riprova più tardi." }, 429, h);
  if (+(request.headers.get("content-length") ?? 0) > MAX) return json({ error: "Dati troppo grandi." }, 413, h);
  const text = await request.text();
  if (text.length > MAX) return json({ error: "Dati troppo grandi." }, 413, h);
  let body; try { body = JSON.parse(text); } catch { return json({ error: "Formato non valido." }, 400, h); }
  const box = body?.box;
  if (!box || typeof box.iv !== "string" || typeof box.ct !== "string" || box.iv.length > 64) return json({ error: "Contenitore non valido." }, 400, h);
  const updated = new Date().toISOString();
  await env.SYNC.put(key, JSON.stringify({ box: { v: 1, iv: box.iv, ct: box.ct }, updated }));
  if (env.USAGE) await env.USAGE.put(lk, String(n + 1), { expirationTtl: 7200 });
  return json({ ok: true, updated }, 200, h);
}
