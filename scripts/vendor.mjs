// Prepara le dipendenze servite dal sito stesso (niente CDN di terze parti):
// - SDK Anthropic in un unico modulo ES (site/vendor/anthropic-sdk.js)
// - carattere Inter variabile (site/fonts/)
// Uso: npm run vendor  (da rieseguire quando si aggiornano le versioni in package.json)
import { build } from "esbuild";
import { copyFile, readFile, writeFile } from "node:fs/promises";

const sdk = JSON.parse(await readFile("node_modules/@anthropic-ai/sdk/package.json", "utf8")).version;
await build({
  stdin: { contents: 'export { default, Anthropic } from "@anthropic-ai/sdk";', resolveDir: process.cwd(), loader: "js" },
  bundle: true, format: "esm", platform: "browser", target: "es2022", minify: true, legalComments: "inline",
  outfile: "site/vendor/anthropic-sdk.js",
  banner: { js: `/* @anthropic-ai/sdk ${sdk} — MIT License — generato da scripts/vendor.mjs */` },
});
for (const f of ["inter-latin-wght-normal.woff2", "inter-latin-ext-wght-normal.woff2"]) {
  await copyFile(`node_modules/@fontsource-variable/inter/files/${f}`, `site/fonts/${f}`);
}
await writeFile("site/vendor/VERSIONS.txt", `@anthropic-ai/sdk ${sdk}\n@fontsource-variable/inter ${JSON.parse(await readFile("node_modules/@fontsource-variable/inter/package.json", "utf8")).version}\n`);
console.log(`SDK Anthropic ${sdk} e carattere Inter copiati in site/`);
