// Timer affidabile per l'aggiornamento dei dati.
//
// Le esecuzioni programmate di GitHub Actions possono essere ritardate o saltate; questo Worker (Cron Trigger di
// Cloudflare) ogni 30 minuti controlla quando sono stati aggiornati i dati e, se sono vecchi, avvia il workflow
// "pages.yml" tramite l'API di GitHub (workflow_dispatch).
//
// Variabili: GH_DISPATCH_TOKEN (secret: token GitHub limitato al repository, permesso Actions: Read and write),
//            REPO ("owner/nome"), WORKFLOW ("pages.yml"), DATA_URL (meta.json pubblicato), MAX_AGE_MIN (25).

async function lastUpdate(env) {
  try {
    const r = await fetch(`${env.DATA_URL}?t=${Date.now()}`, { cf: { cacheTtl: 0 } });
    if (!r.ok) return 0;
    return Date.parse((await r.json()).updated) || 0;
  } catch { return 0; }
}

async function dispatch(env) {
  const r = await fetch(`https://api.github.com/repos/${env.REPO}/actions/workflows/${env.WORKFLOW}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GH_DISPATCH_TOKEN}`, Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "borteconomy-scheduler", "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main" }),
  });
  if (r.status !== 204) throw new Error(`GitHub ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

export default {
  async scheduled(event, env, ctx) {
    if (!env.GH_DISPATCH_TOKEN) { console.log("GH_DISPATCH_TOKEN mancante"); return; }
    const age = (Date.now() - (await lastUpdate(env))) / 60000;
    if (age < +(env.MAX_AGE_MIN ?? 25)) { console.log(`Dati aggiornati ${Math.round(age)} min fa: nessun avvio`); return; }
    await dispatch(env);
    console.log(`Aggiornamento avviato (dati di ${Math.round(age)} min fa)`);
  },
  async fetch() { return new Response("Not found", { status: 404 }); },
};
