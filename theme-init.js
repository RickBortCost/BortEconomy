// Eseguito prima del rendering (script sincrono in <head>): niente script inline, compatibile con la CSP.
(function () {
  // Protezione dal clickjacking: GitHub Pages non permette l'intestazione frame-ancestors, quindi il sito
  // rifiuta di essere mostrato dentro un riquadro di un altro sito.
  if (window.top !== window.self) {
    document.documentElement.style.display = "none";
    try { window.top.location = window.self.location.href; } catch (e) {}
  }
  // Tema salvato applicato subito (evita il lampo di colore)
  // (tema del profilo attivo: il profilo "default" usa chiavi senza prefisso, gli altri "p.<id>.")
  var t = "auto";
  try { var a = localStorage.getItem("profile-active"); t = localStorage.getItem(a && a !== "default" ? "p." + a + ".theme" : "theme") || "auto"; } catch (e) {}
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  var dark = t === "dark" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  var m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = dark ? "#070b16" : "#f3f5fa";
})();
