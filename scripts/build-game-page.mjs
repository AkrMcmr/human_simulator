// Builds dist-game/index.html: the /game screen as one static file (engine + UI inlined; React from cdnjs).
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const git = (...a) => { try { return execFileSync("git", a, { encoding: "utf8" }).trim(); } catch { return "uncommitted"; } };
const provenance = {
  sourceCommit: git("rev-parse", "HEAD"), sourceHash: git("rev-parse", "HEAD^{tree}"),
  dependencyLockHash: createHash("sha256").update(readFileSync("package-lock.json")).digest("hex"),
  runtime: "static page / browser", dirty: git("status", "--porcelain") !== "",
};
const REACT = "18.3.1";
const globals = { name: "globals", setup(b) {
  b.onResolve({ filter: /^react(-dom)?(\/.*)?$/ }, (a) => ({ path: a.path, namespace: "g" }));
  b.onLoad({ filter: /.*/, namespace: "g" }, (a) => ({
    contents: a.path.startsWith("react-dom") ? "module.exports = window.ReactDOM;"
      : a.path === "react/jsx-runtime" ? "const R = window.React; const j = (t, p, k) => { const { children, ...rest } = p || {}; return k === undefined ? R.createElement(t, rest, ...(children === undefined ? [] : [].concat(children))) : R.createElement(t, { ...rest, key: k }, ...(children === undefined ? [] : [].concat(children))); }; module.exports = { jsx: j, jsxs: j, Fragment: R.Fragment };"
      : "module.exports = window.React;",
    loader: "js",
  }));
} };
const out = await build({
  entryPoints: ["app/game/standalone.tsx"], bundle: true, minify: true, write: false, format: "iife", target: "es2020",
  jsx: "automatic", define: { __HWL_PROVENANCE__: JSON.stringify(provenance), "process.env.NODE_ENV": '"production"' },
  plugins: [globals], outdir: "dist-game", loader: { ".css": "css" },
});
const js = out.outputFiles.find((f) => f.path.endsWith(".js")).text.replaceAll("</script", "<\\/script");
const css = readFileSync("app/game/game.css", "utf8").replace(/^@import[^;]+;\n/, "");
const html = `<title>はじまりのふたり</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Kaisei+Decol:wght@700&family=Zen+Kaku+Gothic+New:wght@400;700&display=swap">
<style>:root { color-scheme: dark; } html, body { background: #0b1520; color: #e6eef5; margin: 0; } ${css}</style>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/${REACT}/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/${REACT}/umd/react-dom.production.min.js"></script>
<script>${js}</script>
`;
mkdirSync("dist-game", { recursive: true });
writeFileSync("dist-game/index.html", html);
console.log("dist-game/index.html", Math.round(html.length / 1024) + " KB", provenance.sourceCommit, provenance.dirty ? "(dirty)" : "");
