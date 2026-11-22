// Accesso a Yahoo Finance con sessione (cookie + crumb) per screener e ricerca.
export const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let session = null;

export async function yahooSession() {
  if (session) return session;
  const c = await fetch("https://fc.yahoo.com/", { headers: { "User-Agent": UA }, redirect: "manual", signal: AbortSignal.timeout(15000) });
  const cookie = (c.headers.getSetCookie?.() ?? []).map((x) => x.split(";")[0]).join("; ");
  const r = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", { headers: { "User-Agent": UA, Cookie: cookie }, signal: AbortSignal.timeout(15000) });
  const crumb = (await r.text()).trim();
  if (!r.ok || !crumb || crumb.includes("<")) throw new Error(`crumb non disponibile (${r.status})`);
  session = { cookie, crumb };
  return session;
}

export async function screener(body, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const { cookie, crumb } = await yahooSession();
      const r = await fetch(`https://query2.finance.yahoo.com/v1/finance/screener?crumb=${encodeURIComponent(crumb)}&formatted=false&lang=en-US&region=US`, {
        method: "POST", headers: { "User-Agent": UA, Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "", userIdType: "guid", ...body }), signal: AbortSignal.timeout(25000),
      });
      if (r.ok) return (await r.json()).finance?.result?.[0] ?? null;
      if (r.status === 401) session = null;
      await sleep(r.status === 429 ? 5000 * (i + 1) : 1000 * (i + 1));
    } catch { await sleep(1000 * (i + 1)); }
  }
  return null;
}

export async function search(q, count = 8) {
  const r = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=${count}&newsCount=0&listsCount=0`, {
    headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!r?.ok) return [];
  const j = await r.json();
  return (j.quotes ?? []).filter((x) => x.symbol && x.quoteType && x.quoteType !== "OPTION");
}
