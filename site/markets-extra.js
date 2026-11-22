// Sezioni aggiuntive dei mercati: mappa (treemap) delle azioni, valute con convertitore, criptovalute.
let H;
const mx = { map: "it", cryptoField: "changePct", from: "EUR", to: "USD", amount: 1000 };

// ---------- conversione in euro ----------
function toEUR(v, cur) {
  if (v == null || !cur) return null;
  if (cur === "EUR") return v;
  const r = H.bySymbol(`EUR${cur}=X`)?.price;
  return r ? v / r : null;
}

// ---------- treemap (algoritmo "squarified") ----------
function squarify(items, x, y, w, h) {
  const total = items.reduce((s, i) => s + i.v, 0);
  if (!total || !items.length) return [];
  const scale = (w * h) / total;
  const nodes = items.map((i) => ({ ...i, a: i.v * scale }));
  const out = [];
  let rect = { x, y, w, h };
  let row = [];
  const worst = (r, side) => {
    const s = r.reduce((a, n) => a + n.a, 0), mx = Math.max(...r.map((n) => n.a)), mn = Math.min(...r.map((n) => n.a));
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };
  const layout = (r) => {
    const s = r.reduce((a, n) => a + n.a, 0);
    if (rect.w >= rect.h) {
      const cw = s / rect.h; let cy = rect.y;
      for (const n of r) { const ch = n.a / cw; out.push({ ...n, x: rect.x, y: cy, w: cw, h: ch }); cy += ch; }
      rect = { x: rect.x + cw, y: rect.y, w: rect.w - cw, h: rect.h };
    } else {
      const ch = s / rect.w; let cx = rect.x;
      for (const n of r) { const cw = n.a / ch; out.push({ ...n, x: cx, y: rect.y, w: cw, h: ch }); cx += cw; }
      rect = { x: rect.x, y: rect.y + ch, w: rect.w, h: rect.h - ch };
    }
  };
  for (const n of nodes) {
    const side = Math.min(rect.w, rect.h);
    if (!row.length || worst([...row, n], side) <= worst(row, side)) row.push(n);
    else { layout(row); row = [n]; }
  }
  if (row.length) layout(row);
  return out;
}

// colore in base alla variazione: rosso → grigio → verde (±3% = saturazione piena)
function heat(p) {
  if (p == null) return "var(--line)";
  const t = Math.max(-1, Math.min(1, p / 3));
  const a = 0.25 + Math.abs(t) * 0.75;
  return t >= 0 ? `rgb(5 150 105 / ${a.toFixed(2)})` : `rgb(220 38 38 / ${a.toFixed(2)})`;
}

const MAPS = {
  it: { label: "🇮🇹 Italia", regions: ["it"], n: 40 },
  us: { label: "🇺🇸 Stati Uniti", regions: ["us"], n: 60 },
  eu: { label: "🇪🇺 Europa", regions: ["de", "fr", "gb", "it", "es", "ch", "nl", "be", "se", "dk", "no", "fi", "pt", "ie", "at", "pl", "gr"], n: 60 },
  asia: { label: "🌏 Asia", regions: ["jp", "cn", "hk", "in", "kr", "tw", "sg"], n: 60 },
  world: { label: "🌍 Mondo", regions: null, n: 80 },
};

export async function renderHeatmap() {
  const $ = H.$;
  $("#hm-sel").innerHTML = Object.entries(MAPS).map(([k, m]) => `<button data-v="${k}" class="${k === mx.map ? "on" : ""}">${m.label}</button>`).join("");
  const box = $("#hm");
  const dir = await H.loadDirectory();
  if (!dir) { box.innerHTML = '<div class="empty">Dati non disponibili.</div>'; return; }
  const m = MAPS[mx.map];
  const items = [...dir.values()]
    .filter((q) => (!m.regions || m.regions.includes(q.region)) && q.marketCap && q.changePct != null)
    .map((q) => ({ q, v: toEUR(q.marketCap, q.currency) }))
    .filter((i) => i.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, m.n);
  const W = Math.max(box.clientWidth, 300), Hh = Math.round(Math.min(Math.max(W * 0.9, 360), 640));
  const cells = squarify(items, 0, 0, W, Hh);
  const total = items.reduce((s, i) => s + i.v, 0);
  const avg = items.reduce((s, i) => s + i.q.changePct * i.v, 0) / (total || 1);
  $("#hm-meta").textContent = `${items.length} società più grandi per capitalizzazione (${H.nf(total / 1e12, 1)} mila mld €) · dimensione = capitalizzazione, colore = variazione di oggi · media ponderata ${avg >= 0 ? "+" : ""}${H.nf(avg)}%`;
  box.style.height = `${Hh}px`;
  box.innerHTML = cells.map((c) => {
    const big = c.w > 70 && c.h > 34, mid = c.w > 44 && c.h > 22;
    const name = c.q.name.replace(/\b(S\.?p\.?A\.?|Inc\.?|Corporation|Corp\.?|plc|N\.?V\.?|S\.?A\.?|AG|SE|Ltd\.?|Limited|Holdings?|Group|Company|Co\.)\b/gi, "").replace(/[,.\s]+$/, "").trim();
    return `<button class="hm-cell" data-sym="${H.esc(c.q.symbol)}" style="left:${c.x.toFixed(1)}px;top:${c.y.toFixed(1)}px;width:${Math.max(c.w - 1, 0).toFixed(1)}px;height:${Math.max(c.h - 1, 0).toFixed(1)}px;background:${heat(c.q.changePct)}"
      title="${H.esc(c.q.name)} · ${c.q.changePct >= 0 ? "+" : ""}${H.nf(c.q.changePct)}% · ${H.nf(c.v / 1e9, 1)} mld €">
      ${mid ? `<b style="font-size:${Math.max(10, Math.min(15, c.w / 9)).toFixed(0)}px">${H.esc(big ? name : c.q.symbol.split(".")[0])}</b>${big || c.h > 34 ? `<small>${c.q.changePct >= 0 ? "+" : ""}${H.nf(c.q.changePct)}%</small>` : ""}` : ""}
    </button>`;
  }).join("");
}

// ---------- valute ----------
export function renderForex() {
  const $ = H.$, C = H.config.forex;
  $("#fx-majors").innerHTML = H.tiles(C.majors);
  const curs = ["EUR", ...C.crosses.map((s) => s.slice(3, 6))];
  const names = { EUR: "Euro", USD: "Dollaro USA", GBP: "Sterlina", CHF: "Franco svizzero", JPY: "Yen", SEK: "Corona svedese", DKK: "Corona danese", NOK: "Corona norvegese", PLN: "Zloty", HKD: "Dollaro di Hong Kong", CNY: "Yuan", INR: "Rupia indiana", KRW: "Won", TWD: "Dollaro taiwanese", BRL: "Real", CAD: "Dollaro canadese", AUD: "Dollaro australiano", SGD: "Dollaro di Singapore", MXN: "Peso messicano", ZAR: "Rand", ILS: "Shekel", TRY: "Lira turca", SAR: "Riyal saudita" };
  const opts = (sel) => curs.map((c) => `<option value="${c}" ${c === sel ? "selected" : ""}>${c} · ${names[c] ?? c}</option>`).join("");
  if (!$("#fx-from").options.length) { $("#fx-from").innerHTML = opts(mx.from); $("#fx-to").innerHTML = opts(mx.to); $("#fx-amount").value = mx.amount; }
  convert();
  $("#fx-crosses").innerHTML = H.rows(C.crosses.map(H.bySymbol).filter(Boolean).map((q) => ({ ...q, name: `${names[q.symbol.slice(3, 6)] ?? q.symbol.slice(3, 6)}`, currency: `${q.symbol.slice(3, 6)} per 1 €` })), { field: "changePct" });
}
function convert() {
  const $ = H.$;
  const a = +String($("#fx-amount").value).replace(",", "."), from = $("#fx-from").value, to = $("#fx-to").value;
  const eur = toEUR(a, from), out = eur == null ? null : to === "EUR" ? eur : (() => { const r = H.bySymbol(`EUR${to}=X`)?.price; return r ? eur * r : null; })();
  $("#fx-result").innerHTML = out == null || !isFinite(out) ? "–"
    : `<b>${H.nf(out, out < 1 ? 6 : 2)} ${to}</b><small>1 ${from} = ${H.nf(out / a, 6)} ${to}</small>`;
}

// ---------- cripto ----------
export function renderCrypto() {
  const $ = H.$, C = H.config.crypto;
  const f = mx.cryptoField, eurusd = H.bySymbol("EURUSD=X")?.price;
  const qs = C.items.map(H.bySymbol).filter(Boolean);
  const btc = H.bySymbol("BTC-USD");
  $("#cr-meta").textContent = `Prezzi in dollari${eurusd ? ` (in euro al cambio ${H.nf(eurusd, 4)})` : ""} · mercato aperto 24 ore su 24 · aggiornato ${new Date(H.updated()).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`;
  $("#cr-cards").innerHTML = qs.slice(0, 6).map((q) => `
    <div class="tile" data-sym="${H.esc(q.symbol)}" tabindex="0" role="button">
      <div class="n">${H.esc(q.name.replace(/ USD$/, ""))}</div>
      <div class="p">${H.nf(q.price, H.pdec(q.price))} $</div>
      ${H.pctHtml(q[f])}
      <div class="g">${eurusd ? `${H.nf(q.price / eurusd, H.pdec(q.price / eurusd))} €` : ""}</div>
      ${H.spark(q.spark, (q[f] ?? 0) >= 0)}
    </div>`).join("");
  $("#cr-rows").innerHTML = `<tr><th>#</th><th>Criptovaluta</th><th>Prezzo</th><th>1G</th><th>1S</th><th>1M</th><th>1A</th></tr>` + qs.map((q, i) => `
    <tr data-sym="${H.esc(q.symbol)}"><td>${i + 1}</td><td><b>${H.esc(q.name.replace(/ USD$/, ""))}</b><small>${H.esc(q.symbol.replace(/-USD$/, "").replace(/\d+$/, ""))}</small></td>
    <td>${H.nf(q.price, H.pdec(q.price))} $</td><td>${H.pctHtml(q.changePct)}</td><td>${H.pctHtml(q.weekPct)}</td><td>${H.pctHtml(q.monthPct)}</td><td>${H.pctHtml(q.yearPct)}</td></tr>`).join("");
  if (btc) $("#cr-btc").textContent = `Bitcoin: ${H.nf(btc.price, 0)} $ · ${btc.yearPct != null ? `${btc.yearPct >= 0 ? "+" : ""}${H.nf(btc.yearPct, 1)}% in un anno` : ""} · le criptovalute sono molto volatili.`;
}

export function initMarketsExtra(helpers) {
  H = helpers;
  const $ = H.$;
  $("#hm-sel").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { mx.map = b.dataset.v; H.store.set("hm-map", mx.map); renderHeatmap(); } });
  mx.map = H.store.get("hm-map", "it");
  for (const id of ["#fx-amount", "#fx-from", "#fx-to"]) $(id).addEventListener("input", convert);
  $("#fx-swap").addEventListener("click", () => { const a = $("#fx-from").value; $("#fx-from").value = $("#fx-to").value; $("#fx-to").value = a; convert(); });
  H.seg("#cr-period", (v) => { mx.cryptoField = v; renderCrypto(); });
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (!$("#mk-view-map").hidden) renderHeatmap(); }, 200); });
}
