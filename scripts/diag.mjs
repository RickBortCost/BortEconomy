const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
async function t(name, url, opts = {}) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, ...(opts.headers || {}) }, redirect: "manual", signal: AbortSignal.timeout(15000) });
    const body = await r.text();
    console.log(`${name}: ${r.status} ${body.slice(0, 120).replace(/\s+/g, " ")}`);
    return { r, body };
  } catch (e) { console.log(`${name}: ERR ${e.message}`); return {}; }
}
await t("yahoo q1 chart", "https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=5d&interval=1d");
await t("yahoo q2 chart", "https://query2.finance.yahoo.com/v8/finance/chart/AAPL?range=5d&interval=1d");
// cookie + crumb
const c = await t("yahoo fc cookie", "https://fc.yahoo.com/");
const cookie = (c.r?.headers.getSetCookie?.() || []).map((x) => x.split(";")[0]).join("; ");
console.log("cookie len", cookie.length);
const cr = await t("yahoo crumb", "https://query2.finance.yahoo.com/v1/test/getcrumb", { headers: { Cookie: cookie } });
await t("yahoo chart+cookie", `https://query2.finance.yahoo.com/v8/finance/chart/AAPL?range=5d&interval=1d&crumb=${encodeURIComponent(cr.body || "")}`, { headers: { Cookie: cookie } });
await t("yahoo quote+crumb", `https://query2.finance.yahoo.com/v7/finance/quote?symbols=AAPL,ENI.MI&crumb=${encodeURIComponent(cr.body || "")}`, { headers: { Cookie: cookie } });
await t("stooq quote", "https://stooq.com/q/l/?s=aapl.us&f=sd2t2ohlcv&h&e=csv");
await t("stooq hist", "https://stooq.com/q/d/l/?s=aapl.us&i=d");
await t("cnbc quote", "https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=AAPL|.SPX|ENI-IT&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json");
await t("cnbc chart", "https://ts-api.cnbc.com/harmony/app/charts/1M.json?symbol=AAPL");
await t("nasdaq chart", "https://api.nasdaq.com/api/quote/AAPL/chart?assetclass=stocks", { headers: { Accept: "application/json" } });
await t("google finance", "https://www.google.com/finance/quote/AAPL:NASDAQ");
