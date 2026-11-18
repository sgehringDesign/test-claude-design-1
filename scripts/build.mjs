#!/usr/bin/env node
/**
 * Claude Design System → repo build.
 *
 * Reads a Claude Design System export (tokens.json, README.md, components/<Name>/preview.html, assets/)
 * and writes:
 *   dist/     tokens in CSS, SCSS, JS, CJS, TypeScript and W3C DTCG JSON, plus assets
 *   _site/    a static docs site for GitHub Pages
 *
 * The main system lives in design-system/. Every folder in examples/ is built too,
 * at _site/examples/<folder>/. No dependencies. Run: npm run build
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

// ---------------------------------------------------------------- helpers
const read = (p) => fs.readFileSync(p, "utf8");
const exists = (p) => fs.existsSync(p);
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const camel = (s) => s.replace(/[-_ ]+([a-z0-9])/gi, (_, c) => c.toUpperCase());
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const walk = (dir) => !exists(dir) ? [] : fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((e) => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);

function inlineMd(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}
function markdown(src) {
  const out = []; let list = null; let para = [];
  const flushP = () => { if (para.length) { out.push(`<p>${inlineMd(para.join(" "))}</p>`); para = []; } };
  const flushL = () => { if (list) { out.push(`<ul>${list.map((i) => `<li>${inlineMd(i)}</li>`).join("")}</ul>`); list = null; } };
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (h) { flushP(); flushL(); const n = Math.min(h[1].length + 1, 6); out.push(`<h${n}>${inlineMd(h[2])}</h${n}>`); }
    else if (li) { flushP(); (list ||= []).push(li[1]); }
    else if (!line.trim()) { flushP(); flushL(); }
    else { flushL(); para.push(line.trim()); }
  }
  flushP(); flushL();
  return out.join("\n");
}

function luminance(hex) {
  const m = String(hex).match(/^#?([0-9a-f]{6})$/i); if (!m) return null;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b); if (x == null || y == null) return null;
  const [hi, lo] = x > y ? [x, y] : [y, x];
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------- load + normalise
function load(dsDir) {
  const src = JSON.parse(read(path.join(dsDir, "tokens.json")));
  const themes = src.color?.themes?.length ? src.color.themes : [{ id: "default", name: "Default" }];
  const defaultTheme = themes[0].id;
  const resolve = (v, theme = defaultTheme) =>
    v && typeof v === "object" ? (v[theme] ?? v[defaultTheme] ?? Object.values(v)[0]) : v;

  const colors = (src.color?.tokens || []).map((t) => ({ ...t, value: resolve(t.value), byTheme: t.value }));

  // Every other top-level group with a tokens array: spacing, radius, borderWidth, shadow, motion...
  const skip = new Set(["name", "version", "meta", "color", "type"]);
  const scales = Object.entries(src)
    .filter(([k, v]) => !skip.has(k) && v && Array.isArray(v.tokens))
    .map(([k, v]) => ({ group: k, tokens: v.tokens.map((t) => ({ ...t, value: resolve(t.value), byTheme: t.value })) }));

  const families = src.type?.families || {};
  const typeStyles = (src.type?.groups || []).flatMap((g) =>
    (g.styles || []).map((s) => ({
      ...s,
      family: s.family || g.family,
      group: g.name,
      uppercase: /uppercase|all caps/i.test(s.usage || "") || s.textTransform === "uppercase",
    }))
  );

  const components = exists(path.join(dsDir, "components"))
    ? fs.readdirSync(path.join(dsDir, "components"), { withFileTypes: true })
        .filter((d) => d.isDirectory() && exists(path.join(dsDir, "components", d.name, "preview.html")))
        .map((d) => {
          const html = read(path.join(dsDir, "components", d.name, "preview.html"));
          const h = html.match(/@dsCard\s+height=(\d+)/);
          const w = html.match(/@dsCard[^>]*width=(\d+)/);
          return { name: d.name, html, height: h ? +h[1] : 320, width: w ? +w[1] : 960 };
        })
    : [];

  const assets = walk(path.join(dsDir, "assets")).map((p) => ({
    abs: p, rel: path.relative(dsDir, p).split(path.sep).join("/"),
  }));
  const readme = exists(path.join(dsDir, "README.md")) ? read(path.join(dsDir, "README.md")) : "";

  return { src, name: src.name || path.basename(dsDir), themes, defaultTheme, resolve, colors, scales, families, typeStyles, components, assets, readme };
}

// ---------------------------------------------------------------- fonts
function googleFontsUrls(ds) {
  const urls = [];
  for (const [key, stack] of Object.entries(ds.families)) {
    const first = stack.split(",")[0].trim().replace(/^["']|["']$/g, "");
    if (!first || /^(system-ui|sans-serif|serif|monospace|ui-)/.test(first)) continue;
    const styles = ds.typeStyles.filter((s) => s.family === key);
    const weights = [...new Set([400, ...styles.map((s) => +s.fontWeight || 400)])].sort((a, b) => a - b);
    const italics = [...new Set(styles.filter((s) => s.fontStyle === "italic").map((s) => +s.fontWeight || 400))];
    const fam = first.replace(/ /g, "+");
    const axes = italics.length
      ? `ital,wght@${[...weights.map((w) => `0,${w}`), ...italics.sort((a, b) => a - b).map((w) => `1,${w}`)].join(";")}`
      : `wght@${weights.join(";")}`;
    urls.push(`https://fonts.googleapis.com/css2?family=${fam}:${axes}&display=swap`);
  }
  // Fallback stacks that name a second Google family (e.g. "Decimal", "Montserrat") are covered by that family's own key.
  return urls;
}

// ---------------------------------------------------------------- outputs
const banner = (ds, c = "//") => `${c} ${ds.name} design system · generated by scripts/build.mjs from tokens.json. Do not edit.\n`;

function cssTokens(ds) {
  const L = [];
  const block = (theme) => {
    const v = [];
    v.push("  /* color */");
    ds.colors.forEach((t) => v.push(`  --${t.name}: ${ds.resolve(t.byTheme, theme)};`));
    if (theme !== ds.defaultTheme) return v;
    v.push("\n  /* font families */");
    Object.entries(ds.families).forEach(([k, s]) => v.push(`  --font-${k}: ${s};`));
    ds.scales.forEach((g) => {
      v.push(`\n  /* ${g.group} */`);
      g.tokens.forEach((t) => v.push(`  --${t.name}: ${t.value};`));
    });
    v.push("\n  /* type styles */");
    ds.typeStyles.forEach((s) => {
      const p = `--type-${s.name}`;
      v.push(`  ${p}-family: var(--font-${s.family});`);
      v.push(`  ${p}-size: ${s.fontSize};`);
      v.push(`  ${p}-weight: ${s.fontWeight ?? 400};`);
      v.push(`  ${p}-line-height: ${s.lineHeight ?? "normal"};`);
      v.push(`  ${p}-letter-spacing: ${s.letterSpacing ?? "0"};`);
      v.push(`  ${p}-style: ${s.fontStyle ?? "normal"};`);
    });
    return v;
  };
  L.push(`/* ${banner(ds, "").trim()} */`);
  L.push(`:root {\n${block(ds.defaultTheme).join("\n")}\n}`);
  ds.themes.slice(1).forEach((t) => L.push(`[data-theme="${t.id}"] {\n${block(t.id).join("\n")}\n}`));
  return L.join("\n\n") + "\n";
}

function cssTypography(ds) {
  return `/* ${banner(ds, "").trim()} */\n` + ds.typeStyles.map((s) => {
    const p = `--type-${s.name}`;
    return `.ds-text-${s.name} {\n  font-family: var(${p}-family);\n  font-size: var(${p}-size);\n  font-weight: var(${p}-weight);\n  line-height: var(${p}-line-height);\n  letter-spacing: var(${p}-letter-spacing);\n  font-style: var(${p}-style);${s.uppercase ? "\n  text-transform: uppercase;" : ""}\n}`;
  }).join("\n\n") + "\n";
}

function scss(ds) {
  const L = [banner(ds)];
  ds.colors.forEach((t) => L.push(`$${t.name}: ${t.value};`));
  Object.entries(ds.families).forEach(([k, s]) => L.push(`$font-${k}: ${s};`));
  ds.scales.forEach((g) => g.tokens.forEach((t) => L.push(`$${t.name}: ${t.value};`)));
  L.push("\n$type-styles: (");
  ds.typeStyles.forEach((s) => L.push(`  "${s.name}": (family: $font-${s.family}, size: ${s.fontSize}, weight: ${s.fontWeight ?? 400}, line-height: ${s.lineHeight ?? "normal"}, letter-spacing: ${s.letterSpacing ?? 0}, style: ${s.fontStyle ?? "normal"}, transform: ${s.uppercase ? "uppercase" : "none"}),`));
  L.push(");\n");
  L.push(`@mixin ds-type($name) {\n  $s: map-get($type-styles, $name);\n  font-family: map-get($s, family);\n  font-size: map-get($s, size);\n  font-weight: map-get($s, weight);\n  line-height: map-get($s, line-height);\n  letter-spacing: map-get($s, letter-spacing);\n  font-style: map-get($s, style);\n  text-transform: map-get($s, transform);\n}`);
  return L.join("\n") + "\n";
}

function jsObject(ds) {
  const o = {
    name: ds.name,
    color: Object.fromEntries(ds.colors.map((t) => [camel(t.name), t.value])),
    font: { ...ds.families },
    type: Object.fromEntries(ds.typeStyles.map((s) => [camel(s.name), {
      fontFamily: ds.families[s.family], fontSize: s.fontSize, fontWeight: s.fontWeight ?? 400,
      lineHeight: s.lineHeight ?? "normal", letterSpacing: s.letterSpacing ?? "0", fontStyle: s.fontStyle ?? "normal",
      ...(s.uppercase ? { textTransform: "uppercase" } : {}),
    }])),
  };
  ds.scales.forEach((g) => { o[g.group] = Object.fromEntries(g.tokens.map((t) => [camel(t.name), t.value])); });
  if (ds.themes.length > 1) {
    o.themes = Object.fromEntries(ds.themes.map((th) => [th.id, Object.fromEntries(ds.colors.map((t) => [camel(t.name), ds.resolve(t.byTheme, th.id)]))]));
  }
  return o;
}
const jsModule = (ds) => `${banner(ds)}export const tokens = ${JSON.stringify(jsObject(ds), null, 2)};\nexport default tokens;\n`;
const cjsModule = (ds) => `${banner(ds)}const tokens = ${JSON.stringify(jsObject(ds), null, 2)};\nmodule.exports = tokens;\nmodule.exports.tokens = tokens;\nmodule.exports.default = tokens;\n`;
function dts(ds) {
  const o = jsObject(ds);
  const shape = (v, ind = "  ") => {
    if (typeof v === "string") return "string";
    if (typeof v === "number") return "number";
    return `{\n${Object.entries(v).map(([k, x]) => `${ind}  ${/^[a-z_$][\w$]*$/i.test(k) ? k : JSON.stringify(k)}: ${shape(x, ind + "  ")};`).join("\n")}\n${ind}}`;
  };
  return `${banner(ds)}export interface Tokens ${shape(o, "")}\nexport declare const tokens: Tokens;\nexport default tokens;\n`;
}
function dtcg(ds) {
  const typeOf = (g) => ({ spacing: "dimension", radius: "dimension", borderWidth: "dimension", size: "dimension", shadow: "shadow", duration: "duration" }[g] || "dimension");
  const out = {
    color: Object.fromEntries(ds.colors.map((t) => [t.name, { $type: "color", $value: t.value, ...(t.usage ? { $description: t.usage } : {}) }])),
    fontFamily: Object.fromEntries(Object.entries(ds.families).map(([k, v]) => [k, { $type: "fontFamily", $value: v }])),
    typography: Object.fromEntries(ds.typeStyles.map((s) => [s.name, {
      $type: "typography", ...(s.usage ? { $description: s.usage } : {}),
      $value: { fontFamily: `{fontFamily.${s.family}}`, fontSize: s.fontSize, fontWeight: s.fontWeight ?? 400, lineHeight: s.lineHeight ?? "normal", letterSpacing: s.letterSpacing ?? "0" },
    }])),
  };
  ds.scales.forEach((g) => { out[g.group] = Object.fromEntries(g.tokens.map((t) => [t.name, { $type: typeOf(g.group), $value: t.value, ...(t.usage ? { $description: t.usage } : {}) }])); });
  return JSON.stringify(out, null, 2) + "\n";
}

function buildDist(ds, outDir) {
  fs.rmSync(outDir, { recursive: true, force: true });
  const tokens = cssTokens(ds), type = cssTypography(ds);
  const fonts = googleFontsUrls(ds).map((u) => `@import url("${u}");`).join("\n");
  write(path.join(outDir, "tokens.css"), tokens);
  write(path.join(outDir, "typography.css"), type);
  write(path.join(outDir, "fonts.css"), fonts + "\n");
  write(path.join(outDir, "ds.css"), `${fonts}\n\n${tokens}\n${type}`);
  write(path.join(outDir, "_tokens.scss"), scss(ds));
  write(path.join(outDir, "tokens.js"), jsModule(ds));
  write(path.join(outDir, "tokens.cjs"), cjsModule(ds));
  write(path.join(outDir, "tokens.d.ts"), dts(ds));
  write(path.join(outDir, "tokens.dtcg.json"), dtcg(ds));
  write(path.join(outDir, "tokens.source.json"), JSON.stringify(ds.src, null, 2) + "\n");
  ds.assets.forEach((a) => { fs.mkdirSync(path.dirname(path.join(outDir, a.rel)), { recursive: true }); fs.copyFileSync(a.abs, path.join(outDir, a.rel)); });
}

// ---------------------------------------------------------------- docs site
function componentPage(c) {
  const head = `<meta charset="utf-8"><link rel="stylesheet" href="../dist/ds.css"><style>html,body{margin:0}</style>`;
  let html = c.html.replace(/<!--\s*@dsCard[^>]*-->\s*/, "");
  if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, (m) => `${m}\n${head}`);
  else html = `<!doctype html>\n<html><head>${head}</head><body>\n${html}\n</body></html>`;
  return html;
}

function sitePage(ds, { links, base }) {
  const swatches = ds.colors.map((t) => {
    const w = contrast(t.value, "#ffffff"), b = contrast(t.value, "#000000");
    const themed = ds.themes.length > 1 ? ds.themes.map((th) => `<span class="mono">${th.id}: ${ds.resolve(t.byTheme, th.id)}</span>`).join("<br>") : "";
    return `<figure class="swatch"><div class="chip" style="background:var(--${t.name})"></div>
      <figcaption><strong>${esc(t.name)}</strong><span class="mono">${esc(t.value)}</span>
      ${w ? `<span class="mono">${w.toFixed(1)}:1 white · ${b.toFixed(1)}:1 black</span>` : ""}${themed}
      ${t.usage ? `<p>${inlineMd(t.usage)}</p>` : ""}</figcaption></figure>`;
  }).join("\n");

  const typeRows = ds.typeStyles.map((s) => `<div class="trow">
      <div class="tmeta"><strong>${esc(s.name)}</strong>
        <span class="mono">${esc(s.family)} · ${esc(s.fontSize)} · ${s.fontWeight ?? 400}${s.lineHeight ? " / " + esc(s.lineHeight) : ""}${s.letterSpacing ? " · " + esc(s.letterSpacing) : ""}${s.fontStyle === "italic" ? " · italic" : ""}</span>
        <code>.ds-text-${esc(s.name)}</code></div>
      <div><p class="ds-text-${esc(s.name)}" style="margin:0;color:var(--ink, #111)">${esc(s.sample || "The quick brown fox jumps over the lazy dog")}</p>
        ${s.usage ? `<p class="note">${inlineMd(s.usage)}</p>` : ""}</div></div>`).join("\n");

  const scaleTables = ds.scales.map((g) => `<h3>${esc(g.group)}</h3><table>${g.tokens.map((t) => {
      const isRadius = /radius/i.test(g.group), isBorder = /border/i.test(g.group);
      const vis = isRadius ? `<span class="rad" style="border-radius:${esc(t.value)}"></span>`
        : isBorder ? `<span class="bw" style="border-top:${esc(t.value)} solid #111"></span>`
        : /^\d/.test(t.value) ? `<span class="bar" style="width:min(${esc(t.value)},100%)"></span>` : "";
      return `<tr><td><strong>${esc(t.name)}</strong></td><td class="mono">${esc(t.value)}</td><td class="vis">${vis}</td><td class="note">${t.usage ? inlineMd(t.usage) : ""}</td></tr>`;
    }).join("")}</table>`).join("\n");

  const comps = ds.components.map((c) => `<div class="comp"><h3>${esc(c.name)}</h3>
      <div class="frame" style="aspect-ratio:${c.width}/${c.height}" data-w="${c.width}" data-h="${c.height}">
        <iframe src="components/${encodeURIComponent(c.name)}.html" width="${c.width}" height="${c.height}" title="${esc(c.name)}" loading="lazy"></iframe></div>
      <p class="note"><a href="components/${encodeURIComponent(c.name)}.html">Open full size</a></p></div>`).join("\n");

  const images = ds.assets.filter((a) => /\.(svg|png|jpe?g|gif|webp)$/i.test(a.rel));
  const assetGrid = images.map((a) => `<figure class="asset"><div class="atile"><img src="dist/${esc(a.rel)}" alt="${esc(path.basename(a.rel))}"></div>
      <figcaption><a href="dist/${esc(a.rel)}" download>${esc(path.basename(a.rel))}</a></figcaption></figure>`).join("\n");

  const nav = [
    ["color", "Color", ds.colors.length], ["type", "Type", ds.typeStyles.length], ["scales", "Scales", ds.scales.length],
    ["assets", "Assets", images.length], ["components", "Components", ds.components.length], ["guidelines", "Guidelines", ds.readme],
    ["install", "Install", true],
  ].filter((n) => n[2]).map(([id, label]) => `<a href="#${id}">${label}</a>`).join("");
  const others = links.length ? `<span class="sep"></span>${links.map((l) => `<a href="${l.href}" class="${l.current ? "cur" : ""}">${esc(l.name)}</a>`).join("")}` : "";

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(ds.name)} · Design System</title>
<link rel="stylesheet" href="dist/ds.css">
<style>
  :root { --d-ink:#111418; --d-muted:#5b636b; --d-line:#e2e5e8; --d-soft:#f4f5f7; }
  * { box-sizing: border-box; }
  body { margin:0; font: 15px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--d-ink); background:#fff; }
  header.top { padding: 40px 40px 28px; border-bottom: 1px solid var(--d-line); }
  header.top h1 { margin:0; font-size: 40px; letter-spacing:-.02em; line-height:1.1; }
  header.top p { margin: 8px 0 0; color: var(--d-muted); }
  nav { position: sticky; top:0; z-index:5; background:#fff; border-bottom:1px solid var(--d-line); padding: 0 40px; display:flex; gap: 20px; flex-wrap: wrap; align-items:center; }
  nav a { color: var(--d-ink); text-decoration:none; font-size: 13px; font-weight:600; padding: 14px 0; }
  nav a:hover, nav a.cur { box-shadow: inset 0 -2px 0 var(--d-ink); }
  nav .sep { width:1px; height:18px; background: var(--d-line); }
  main { max-width: 1120px; margin: 0 auto; padding: 0 40px 80px; }
  section { padding: 56px 0 0; }
  h2 { font-size: 22px; margin: 0 0 20px; letter-spacing:-.01em; }
  h3 { font-size: 14px; text-transform: uppercase; letter-spacing:.06em; color: var(--d-muted); margin: 28px 0 10px; }
  .mono, code { font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .mono { color: var(--d-muted); display:block; }
  code { background: var(--d-soft); padding: 1px 5px; border-radius: 3px; }
  .note { color: var(--d-muted); font-size: 13px; margin: 6px 0 0; }
  .swatches { display:grid; grid-template-columns: repeat(auto-fill, minmax(220px,1fr)); gap: 20px; }
  .swatch { margin:0; border:1px solid var(--d-line); border-radius: 6px; overflow:hidden; }
  .swatch .chip { height: 96px; border-bottom:1px solid var(--d-line); }
  .swatch figcaption { padding: 12px; } .swatch figcaption p { font-size: 13px; color: var(--d-muted); margin: 6px 0 0; }
  .trow { display:grid; grid-template-columns: 260px 1fr; gap: 24px; padding: 20px 0; border-top:1px solid var(--d-line); }
  .tmeta { display:flex; flex-direction:column; gap:4px; }
  table { width:100%; border-collapse: collapse; } td { padding: 10px 12px 10px 0; border-top: 1px solid var(--d-line); vertical-align: middle; }
  td.vis { width: 30%; } .bar { display:inline-block; height: 10px; background: var(--d-ink); }
  .rad { display:inline-block; width: 56px; height: 36px; background: var(--d-soft); border: 1px solid var(--d-ink); }
  .bw { display:inline-block; width: 120px; }
  .assets { display:grid; grid-template-columns: repeat(auto-fill, minmax(240px,1fr)); gap: 20px; }
  .asset { margin:0; } .atile { height: 140px; display:flex; align-items:center; justify-content:center; padding: 24px; background: var(--d-soft); border-radius: 6px; }
  .atile img { max-width: 100%; max-height: 100%; } .asset figcaption { font-size: 13px; margin-top: 6px; }
  .frame { position: relative; width: 100%; max-width: 960px; overflow: hidden; border:1px solid var(--d-line); border-radius: 6px; background:#fff; }
  .frame iframe { border:0; position:absolute; top:0; left:0; transform-origin: 0 0; }
  .guidelines { max-width: 760px; } .guidelines > h2:first-child { display:none; } .guidelines h2 { font-size: 18px; margin-top: 32px; } .guidelines h3 { text-transform:none; letter-spacing:0; color: var(--d-ink); font-size: 16px; }
  pre { background: var(--d-soft); padding: 16px; border-radius: 6px; overflow:auto; font: 12px/1.6 ui-monospace, Menlo, monospace; }
  footer { border-top: 1px solid var(--d-line); padding: 20px 40px; color: var(--d-muted); font-size: 12px; display:flex; justify-content: space-between; }
  @media (max-width: 720px) { header.top, nav, main, footer { padding-left: 20px; padding-right: 20px; } .trow { grid-template-columns: 1fr; } }
</style></head>
<body>
<header class="top"><h1>${esc(ds.name)}</h1><p>Design system · v${esc(pkg.version)} · ${ds.colors.length} colors · ${ds.typeStyles.length} type styles · ${ds.components.length} components</p></header>
<nav>${nav}${others}</nav>
<main>
${ds.colors.length ? `<section id="color"><h2>Color</h2><div class="swatches">${swatches}</div></section>` : ""}
${ds.typeStyles.length ? `<section id="type"><h2>Typography</h2>${typeRows}</section>` : ""}
${ds.scales.length ? `<section id="scales"><h2>Scales</h2>${scaleTables}</section>` : ""}
${images.length ? `<section id="assets"><h2>Assets</h2><div class="assets">${assetGrid}</div></section>` : ""}
${ds.components.length ? `<section id="components"><h2>Components</h2>${comps}</section>` : ""}
${ds.readme ? `<section id="guidelines"><h2>Guidelines</h2><div class="guidelines">${markdown(ds.readme)}</div></section>` : ""}
<section id="install"><h2>Install</h2>
<p>Link the hosted stylesheet. It loads fonts, CSS variables and <code>.ds-text-*</code> type classes.</p>
<pre>&lt;link rel="stylesheet" href="${esc(base)}dist/ds.css"&gt;</pre>
<p>Or use a file from <code>dist/</code>:</p>
<pre>tokens.css        CSS custom properties (var(--name))
typography.css    .ds-text-&lt;style&gt; classes
fonts.css         Google Fonts imports
ds.css            all three in one file
_tokens.scss      Sass variables + @include ds-type(name)
tokens.js         ES module     import { tokens } from "${esc(base)}dist/tokens.js"
tokens.cjs        CommonJS
tokens.d.ts       TypeScript types
tokens.dtcg.json  W3C design tokens (Tokens Studio for Figma, Style Dictionary)
tokens.source.json the original Claude export</pre>
</section>
</main>
<footer><span>${esc(ds.name)}</span><span>Built ${new Date().toISOString().slice(0, 10)} from tokens.json</span></footer>
<script>
  function fit(){document.querySelectorAll('.frame').forEach(f=>{const i=f.querySelector('iframe');i.style.transform='scale('+(f.clientWidth/+f.dataset.w)+')';});}
  addEventListener('resize',fit); addEventListener('load',fit); fit();
</script>
</body></html>
`;
}

function buildSite(ds, outDir, opts) {
  fs.rmSync(outDir, { recursive: true, force: true });
  buildDist(ds, path.join(outDir, "dist"));
  ds.components.forEach((c) => write(path.join(outDir, "components", `${c.name}.html`), componentPage(c)));
  write(path.join(outDir, "index.html"), sitePage(ds, opts));
}

// ---------------------------------------------------------------- run
const mainDir = path.join(ROOT, "design-system");
const exampleDirs = exists(path.join(ROOT, "examples"))
  ? fs.readdirSync(path.join(ROOT, "examples"), { withFileTypes: true })
      .filter((d) => d.isDirectory() && exists(path.join(ROOT, "examples", d.name, "tokens.json")))
      .map((d) => path.join(ROOT, "examples", d.name))
  : [];

const main = load(mainDir);
const examples = exampleDirs.map((d) => ({ dir: d, slug: path.basename(d), ds: load(d) }));
const siteBase = process.env.SITE_URL ? process.env.SITE_URL.replace(/\/?$/, "/") : "./";

// dist/ for npm / direct import
buildDist(main, path.join(ROOT, "dist"));
console.log(`✓ dist/          ${main.name}`);

// _site/ for GitHub Pages
const site = path.join(ROOT, "_site");
fs.rmSync(site, { recursive: true, force: true });
const allLinks = (cur, prefix) => [
  { name: main.name, href: `${prefix}index.html`, current: cur === "main" },
  ...examples.map((e) => ({ name: e.ds.name, href: `${prefix}examples/${e.slug}/index.html`, current: cur === e.slug })),
];
buildSite(main, site, { links: examples.length ? allLinks("main", "") : [], base: siteBase });
console.log(`✓ _site/         ${main.name}`);
examples.forEach((e) => {
  buildSite(e.ds, path.join(site, "examples", e.slug), { links: allLinks(e.slug, "../../"), base: `${siteBase}examples/${e.slug}/` });
  console.log(`✓ _site/examples/${e.slug}/  ${e.ds.name}`);
});
write(path.join(site, ".nojekyll"), "");
