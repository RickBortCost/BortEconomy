// Dati del sito (notizie, quotazioni, storici) letti dalla pubblicazione su GitHub Pages, aggiornata ogni 30 minuti.
// Così la copia su Cloudflare non va ripubblicata a ogni aggiornamento dei dati.
const DEFAULT_ORIGIN = "https://rickbortcost.github.io/BortEconomy/data/";

export async function onRequestGet({ request, env, params }) {
  const path = [].concat(params.path ?? []).join("/");
  if (!/^[\w./-]+\.json$/.test(path) || path.includes("..")) return new Response("Not found", { status: 404 });
  const res = await fetch(new URL(path, env.DATA_ORIGIN ?? DEFAULT_ORIGIN), { cf: { cacheTtl: 120, cacheEverything: true } });
  if (!res.ok) return new Response("Not found", { status: res.status === 404 ? 404 : 502 });
  return new Response(res.body, {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60", "x-content-type-options": "nosniff" },
  });
}
