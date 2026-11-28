// Indicatori tecnici su serie di chiusure. Restituiscono array allineati all'input (null finché non calcolabili).

export function sma(v, n) {
  const out = new Array(v.length).fill(null);
  let s = 0;
  for (let i = 0; i < v.length; i++) {
    s += v[i];
    if (i >= n) s -= v[i - n];
    if (i >= n - 1) out[i] = s / n;
  }
  return out;
}

export function bollinger(v, n = 20, k = 2) {
  const mid = sma(v, n), up = new Array(v.length).fill(null), lo = new Array(v.length).fill(null);
  for (let i = n - 1; i < v.length; i++) {
    let q = 0;
    for (let j = i - n + 1; j <= i; j++) q += (v[j] - mid[i]) ** 2;
    const sd = Math.sqrt(q / n);
    up[i] = mid[i] + k * sd; lo[i] = mid[i] - k * sd;
  }
  return { mid, up, lo };
}

// RSI di Wilder
export function rsi(v, n = 14) {
  const out = new Array(v.length).fill(null);
  if (v.length <= n) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) { const d = v[i] - v[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= n; l /= n;
  out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    g = (g * (n - 1) + Math.max(d, 0)) / n;
    l = (l * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}
