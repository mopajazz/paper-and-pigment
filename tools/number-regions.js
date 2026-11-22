#!/usr/bin/env node
'use strict';
// Re-number the detailed illustrations from their source line art.
//
//   npm run regions                      # every artwork in tools/line-art-sources.json
//   npm run regions -- --only woodland-tea
//   npm run regions -- --reference woodland-tea=path/to/colored.png
//   npm run regions -- --dry-run         # write the report only, leave line-art.js alone
//
// For each artwork this finds every enclosed shape in the source PNG, numbers it, picks
// a palette slot (from a color reference when given, otherwise so neighbors differ),
// and rewrites that artwork's regions in line-art.js. It also writes reference/<key>.png,
// a filled answer key, and reference/index.html, a numbered report with a legend and a
// list of shapes worth checking by eye.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { PNG } = require('pngjs');
const R = require('./regions.js');

const root = path.resolve(__dirname, '..');
const LINE_ART = path.join(root, 'line-art.js');
const OUT = path.join(root, 'reference');
// Must match artwork.js: illustrations are fitted into a 720x540 page with a 12-unit margin.
const PAGE = { width: 720, height: 540, margin: 24 };
// Smallest shape kept, as an inscribed radius in page units. At the 4x zoom limit this
// is roughly a 17px circle on an iPad, small but still tappable with a Pencil.
const MIN_RADIUS_PAGE = 1.25;

function parseArgs(argv) {
  const args = { only: null, references: {}, dryRun: false, threshold: 150, gap: 1, epsilon: 0.75, sources: null, minRadius: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--only') args.only = next().split(',');
    else if (a === '--reference') { const [k, ...v] = next().split('='); args.references[k] = v.join('='); }
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--threshold') args.threshold = Number(next());
    else if (a === '--gap') args.gap = Number(next());
    else if (a === '--epsilon') args.epsilon = Number(next());
    else if (a === '--min-radius') args.minRadius = Number(next());
    else if (a === '--sources') args.sources = next();
    else if (a === '--help' || a === '-h') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 16).join('\n')); process.exit(0); }
    else throw new Error(`Unknown option ${a}`);
  }
  return args;
}

function loadLineArt() {
  const source = fs.readFileSync(LINE_ART, 'utf8');
  const header = source.slice(0, source.indexOf('const LineArt'));
  return { header, art: vm.runInNewContext(source + '\nLineArt;') };
}

function loadPalettes() {
  class Path2D { addPath() {} }
  const context = {
    Path2D, DOMMatrix: function DOMMatrix() {}, Image: class {}, GlassCollection: {}, Composition: {}, LineArt: [],
  };
  return vm.runInNewContext(fs.readFileSync(path.join(root, 'artwork.js'), 'utf8') + '\nArtwork;', context);
}

function readPng(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  return { width: png.width, height: png.height, data: png.data };
}

// Nearest-neighbor resample, used only to line a color reference up with the line art.
function resample(img, width, height) {
  if (img.width === width && img.height === height) return img.data;
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(img.height - 1, Math.floor((y + 0.5) * img.height / height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(img.width - 1, Math.floor((x + 0.5) * img.width / width));
      out.set(img.data.subarray((sy * img.width + sx) * 4, (sy * img.width + sx) * 4 + 4), (y * width + x) * 4);
    }
  }
  return out;
}

function hexRgb(hex) {
  return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
}

// Answer key: palette fills under the original ink (multiplied), at half size.
function writeAnswerKey(file, result, width, height, colors) {
  const rgb = colors.map(hexRgb);
  const w = Math.ceil(width / 2), h = Math.ceil(height / 2);
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const acc = [0, 0, 0];
      let n = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const sx = 2 * x + dx, sy = 2 * y + dy;
        if (sx >= width || sy >= height) continue;
        const p = sy * width + sx;
        const c = rgb[result.regions[result.partition[p]].slot];
        const ink = result.gray[p] / 255;
        acc[0] += c[0] * ink; acc[1] += c[1] * ink; acc[2] += c[2] * ink;
        n++;
      }
      const q = (y * w + x) * 4;
      png.data[q] = acc[0] / n; png.data[q + 1] = acc[1] / n; png.data[q + 2] = acc[2] / n; png.data[q + 3] = 255;
    }
  }
  fs.writeFileSync(file, PNG.sync.write(png, { colorType: 2 }));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

function reportSection(entry, result, palette, check) {
  const { width, height } = entry;
  const counts = new Array(palette.colors.length).fill(0);
  for (const r of result.regions) counts[r.slot]++;
  const names = palette.names || ['Indigo', 'Rose', 'Gold', 'Fern', 'Lilac', 'Clay', 'Peach', 'Teal'];
  const legend = palette.colors.map((c, i) =>
    `<li><span class="chip" style="background:${c}">${i + 1}</span>${escapeHtml(names[i])}<small>${counts[i]} shapes</small></li>`).join('');
  const labels = result.regions.map(r =>
    `<text x="${r.x + 0.5}" y="${r.y + 0.5}" font-size="${Math.max(3, Math.min(28, r.radius * 1.1)).toFixed(1)}">${r.slot + 1}</text>`).join('');
  const flagged = check.map(({ id }) => `<path d="${result.regions[id].path}"/>`).join('');
  const rows = check.map(({ id, why }) => {
    const r = result.regions[id];
    return `<li>Shape ${id} (number ${r.slot + 1}, at ${r.x}, ${r.y}): ${escapeHtml(why)}</li>`;
  }).join('');
  const s = result.stats;
  return `<section>
  <h2>${escapeHtml(entry.name)}</h2>
  <p class="stats">${result.regions.length} shapes · ${s.specks} specks folded into neighbors · ${s.sampled ? s.sampled + ' colors sampled from a reference' : 'colors chosen so neighbors differ'} · palette ${escapeHtml(palette.name)}</p>
  <ul class="legend">${legend}</ul>
  <figure>
    <img src="${entry.key}.png" alt="Filled answer key for ${escapeHtml(entry.name)}" width="${width}" height="${height}">
    <svg class="numbers" viewBox="0 0 ${width} ${height}" aria-hidden="true">${labels}</svg>
    <svg class="flags" viewBox="0 0 ${width} ${height}" aria-hidden="true">${flagged}</svg>
  </figure>
  <details${check.length ? ' open' : ''}><summary>${check.length} shapes worth checking</summary><ul>${rows || '<li>None flagged.</li>'}</ul></details>
</section>`;
}

// Shapes that often mean a gap in the line art leaked two areas together.
function shapesToCheck(result, width, height) {
  const total = width * height;
  const out = [];
  result.regions.forEach((r, id) => {
    if (r.area > total * 0.04) out.push({ id, why: `covers ${(100 * r.area / total).toFixed(1)}% of the page; a gap in the line may have merged shapes` });
  });
  return out.sort((a, b) => result.regions[b.id].area - result.regions[a.id].area);
}

function writeReport(sections) {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Region Answer Keys</title>
<style>
:root{--ink:#293d34;--muted:#58695f;--paper:#faf8f1;--flag:#c2382f}
body{margin:0;padding:24px 16px 64px;background:var(--paper);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{max-width:1100px;margin:auto}
h1,h2{font-family:Georgia,serif;font-weight:400}
h1{font-size:2.2rem;margin:0 0 4px}
.lede,.stats{color:var(--muted)}
section{margin-top:48px}
.legend{display:flex;flex-wrap:wrap;gap:8px 18px;padding:0;list-style:none}
.legend li{display:flex;align-items:center;gap:8px}
.legend small{color:var(--muted)}
.chip{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;color:#fff;font-weight:700;font-size:13px;text-shadow:0 0 2px #0008}
figure{position:relative;margin:16px 0}
figure img,figure svg{display:block;width:100%;height:auto}
figure svg{position:absolute;inset:0}
.numbers text{text-anchor:middle;dominant-baseline:central;font-weight:700;fill:#1d1d1d;stroke:#fff;stroke-width:.25em;paint-order:stroke;font-family:system-ui,sans-serif}
body:not(.show-numbers) .numbers{display:none}
.flags path{fill:none;stroke:var(--flag);stroke-width:4;stroke-dasharray:8 5}
label{display:inline-flex;gap:8px;align-items:center;min-height:44px}
</style></head><body><main>
<h1>Region answer keys</h1>
<p class="lede">Generated by <code>tools/number-regions.js</code>. Each page shows the suggested colors with the original ink on top. Dashed red outlines mark shapes worth checking.</p>
<label><input type="checkbox" onchange="document.body.classList.toggle('show-numbers',this.checked)"> Show numbers</label>
${sections.join('\n')}
</main></body></html>`;
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
}

function serialize(header, art) {
  const entries = art.map(entry => {
    const { regions, ...rest } = entry;
    const head = JSON.stringify(rest).slice(0, -1);
    return `${head},"regions":[\n${regions.map(r => JSON.stringify(r)).join(',\n')}\n]}`;
  });
  return `${header}const LineArt = [\n${entries.join(',\n')}\n];\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'line-art-sources.json'), 'utf8'));
  const sourcesDir = path.resolve(__dirname, args.sources || config.sourcesDir);
  const { header, art } = loadLineArt();
  const { palettes } = loadPalettes();
  fs.mkdirSync(OUT, { recursive: true });
  const sections = [];

  for (const entry of art) {
    const spec = config.artworks[entry.key];
    if (!spec) { console.warn(`skip ${entry.key}: no source in line-art-sources.json`); continue; }
    if (args.only && !args.only.includes(entry.key)) continue;
    const file = path.join(sourcesDir, spec.source);
    const img = readPng(file);
    const ratio = (img.width / img.height) / (entry.width / entry.height);
    if (Math.abs(ratio - 1) > 0.01) throw new Error(`${entry.key}: ${spec.source} is ${img.width}x${img.height}, which does not match the ink's ${entry.width}x${entry.height} shape`);

    const scale = Math.min((PAGE.height - PAGE.margin) / img.height, (PAGE.width - PAGE.margin) / img.width);
    const minRadius = args.minRadius ?? MIN_RADIUS_PAGE / scale;
    const palette = palettes[entry.palette];
    const refFile = args.references[entry.key] || (spec.reference && path.join(sourcesDir, spec.reference));
    const reference = refFile ? resample(readPng(path.resolve(refFile)), img.width, img.height) : null;

    const started = Date.now();
    const result = R.numberRegions(img.data, img.width, img.height, {
      threshold: args.threshold, gap: args.gap, epsilon: args.epsilon, minRadius,
      minArea: Math.ceil(Math.PI * minRadius * minRadius), reference, palette: palette.colors, slots: palette.colors.length,
    });
    const check = shapesToCheck(result, img.width, img.height);

    // Map saved work from the regions currently in line-art.js onto the new ones.
    const previousVersion = entry.version ?? 1;
    const oldScale = img.width / entry.width;
    const step = R.legacyMap(entry.regions.map(r => r[0]), oldScale, result.partition, img.width, img.height, result.regions.length);
    // One map per earlier numbering, so work saved against any past version still lands.
    // (Older files stored a single `legacy` map from one version; read that too.)
    const earlier = entry.migrations ?? (entry.legacy ? { [entry.legacy.from]: { fills: entry.legacy.fills, strokes: entry.legacy.strokes } } : {});
    const migrations = { [previousVersion]: step };
    for (const [v, map] of Object.entries(earlier)) migrations[v] = R.composeLegacy(map, step);

    writeAnswerKey(path.join(OUT, `${entry.key}.png`), result, img.width, img.height, palette.colors);
    sections.push(reportSection({ ...entry, width: img.width, height: img.height }, result, palette, check));
    console.log(`${entry.key}: ${result.regions.length} shapes (was ${entry.regions.length}), ${result.stats.specks} specks folded, ${check.length} to check, min radius ${minRadius.toFixed(1)}px, ${Date.now() - started}ms`);

    if (!args.dryRun) {
      entry.version = previousVersion + 1;
      entry.migrations = migrations;
      delete entry.legacy;
      entry.width = img.width;
      entry.height = img.height;
      entry.regions = result.regions.map(r => [r.path, r.x, r.y, r.slot, r.radius]);
    }
  }

  writeReport(sections);
  if (!args.dryRun) {
    const ordered = art.map(({ key, name, palette, version, migrations, width, height, ink, regions }) =>
      Object.fromEntries(Object.entries({ key, name, palette, version, migrations, width, height, ink, regions }).filter(([, v]) => v !== undefined)));
    fs.writeFileSync(LINE_ART, serialize(header, ordered));
    console.log(`wrote ${path.relative(root, LINE_ART)}`);
  }
  console.log(`wrote ${path.relative(root, OUT)}/index.html`);
}

try { main(); } catch (error) { console.error(error.message); process.exit(1); }
