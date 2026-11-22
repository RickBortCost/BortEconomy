// Utilità HTTP comuni: GET con retry/backoff, pool di concorrenza, dati dell'ultima pubblicazione.
import { UA } from "./yahoo.mjs";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const SITE_URL = (process.env.SITE_URL ?? "https://rickbortcost.github.io/BortEconomy").replace(/\/$/, "");

export async function get(url, { tries = 3, headers = {} } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: AbortSignal.timeout(20000) });
      if (res.ok) return await res.text();
      if (res.status === 404 || res.status === 400) return null;
      await sleep(res.status === 429 ? 4000 * (i + 1) : 800 * (i + 1));
    } catch { await sleep(800 * (i + 1)); }
  }
  return null;
}

export async function getJSON(url, opts) {
  const t = await get(url, opts);
  try { return t ? JSON.parse(t) : null; } catch { return null; }
}

export async function pool(items, size, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

// Ultima versione pubblicata di un file del sito (per fallback e aggiornamenti incrementali)
export const previous = (path) => getJSON(`${SITE_URL}/${path}?t=${Date.now()}`, { tries: 1 });
