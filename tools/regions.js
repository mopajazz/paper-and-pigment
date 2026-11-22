'use strict';
// Region numbering for black-on-white line art.
// Pure functions over typed arrays, so they run in Node and in tests with no dependencies.
//
// Pipeline: ink mask -> close small line gaps -> label enclosed areas -> drop specks too
// small to tap -> grow the kept areas across ink and specks so fills meet under the lines ->
// place each label at the widest point of its shape -> pick a palette slot per shape ->
// trace each shape as an SVG path.

function grayscale(rgba, width, height) {
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    const a = rgba[p + 3] / 255;
    // Transparent pixels read as white paper.
    const lum = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
    gray[i] = Math.round(lum * a + 255 * (1 - a));
  }
  return gray;
}

function inkMask(gray, threshold = 150) {
  const mask = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) mask[i] = gray[i] < threshold ? 1 : 0;
  return mask;
}

// Square-kernel dilation, done as two separable passes.
function dilate(mask, width, height, radius) {
  if (radius <= 0) return mask.slice();
  const row = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let on = 0;
      for (let d = -radius; d <= radius && !on; d++) {
        const xx = x + d;
        if (xx >= 0 && xx < width && mask[y * width + xx]) on = 1;
      }
      row[y * width + x] = on;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let on = 0;
      for (let d = -radius; d <= radius && !on; d++) {
        const yy = y + d;
        if (yy >= 0 && yy < height && row[yy * width + x]) on = 1;
      }
      out[y * width + x] = on;
    }
  }
  return out;
}

// 4-connected components of the paper (mask === 0). Ink pixels get -1.
function labelComponents(mask, width, height) {
  const labels = new Int32Array(mask.length).fill(-1);
  const stack = new Int32Array(mask.length);
  const areas = [];
  let count = 0;
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] || labels[start] !== -1) continue;
    let top = 0, area = 0;
    stack[top++] = start;
    labels[start] = count;
    while (top) {
      const p = stack[--top];
      area++;
      const x = p % width;
      if (x > 0 && !mask[p - 1] && labels[p - 1] === -1) { labels[p - 1] = count; stack[top++] = p - 1; }
      if (x < width - 1 && !mask[p + 1] && labels[p + 1] === -1) { labels[p + 1] = count; stack[top++] = p + 1; }
      if (p >= width && !mask[p - width] && labels[p - width] === -1) { labels[p - width] = count; stack[top++] = p - width; }
      if (p < mask.length - width && !mask[p + width] && labels[p + width] === -1) { labels[p + width] = count; stack[top++] = p + width; }
    }
    areas.push(area);
    count++;
  }
  return { labels, count, areas };
}

// Chamfer distance from each paper pixel to the nearest pixel outside its own component
// (ink, another component, or the image edge).
function distanceInside(labels, width, height) {
  const INF = 1e9, D = 1, DD = Math.SQRT2;
  const dist = new Float32Array(labels.length);
  const inside = (p, q) => labels[q] === labels[p];
  for (let i = 0; i < labels.length; i++) dist[i] = labels[i] < 0 ? 0 : INF;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (!dist[p]) continue;
      let d = dist[p];
      // Pixels beyond the image edge count as boundary.
      if (x === 0 || y === 0) d = Math.min(d, D);
      else {
        d = Math.min(d, inside(p, p - 1) ? dist[p - 1] + D : D, inside(p, p - width) ? dist[p - width] + D : D,
          inside(p, p - width - 1) ? dist[p - width - 1] + DD : DD);
        if (x < width - 1) d = Math.min(d, inside(p, p - width + 1) ? dist[p - width + 1] + DD : DD);
      }
      dist[p] = d;
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const p = y * width + x;
      if (!dist[p]) continue;
      let d = dist[p];
      if (x === width - 1 || y === height - 1) d = Math.min(d, D);
      else {
        d = Math.min(d, inside(p, p + 1) ? dist[p + 1] + D : D, inside(p, p + width) ? dist[p + width] + D : D,
          inside(p, p + width + 1) ? dist[p + width + 1] + DD : DD);
        if (x > 0) d = Math.min(d, inside(p, p + width - 1) ? dist[p + width - 1] + DD : DD);
      }
      dist[p] = d;
    }
  }
  return dist;
}

// For each component: its widest point (the label spot) and that inscribed radius.
// Long shapes have a plateau of equally wide points; the label goes to the plateau
// pixel nearest the plateau's centroid, so it sits in the middle, not at one end.
function labelSpots(labels, dist, width, count) {
  const radius = new Float32Array(count);
  for (let p = 0; p < labels.length; p++) {
    const c = labels[p];
    if (c >= 0 && dist[p] > radius[c]) radius[c] = dist[p];
  }
  const sx = new Float64Array(count), sy = new Float64Array(count), sn = new Float64Array(count);
  const onPlateau = (p, c) => dist[p] >= radius[c] - 0.5;
  for (let p = 0; p < labels.length; p++) {
    const c = labels[p];
    if (c >= 0 && onPlateau(p, c)) { sx[c] += p % width; sy[c] += Math.floor(p / width); sn[c]++; }
  }
  const at = new Int32Array(count).fill(-1);
  const best = new Float64Array(count).fill(Infinity);
  for (let p = 0; p < labels.length; p++) {
    const c = labels[p];
    if (c < 0 || !onPlateau(p, c)) continue;
    const d = (p % width - sx[c] / sn[c]) ** 2 + (Math.floor(p / width) - sy[c] / sn[c]) ** 2;
    if (d < best[c]) { best[c] = d; at[c] = p; }
  }
  return Array.from({ length: count }, (_, c) => ({ x: at[c] % width, y: Math.floor(at[c] / width), radius: radius[c] }));
}

// Grow kept regions over every other pixel, breadth-first, so the page is fully
// partitioned. First pass: only through `passable` pixels (paper in the original
// drawing), so the thin strips between hatching strokes join the shape they open
// onto rather than whichever shape is nearest. Second pass: everything else (the ink),
// so each boundary falls near the middle of a line.
function growRegions(seedLabels, size, width, passable = null) {
  const partition = Int32Array.from(seedLabels);
  const queue = new Int32Array(size);
  const spread = (allowed) => {
    let head = 0, tail = 0;
    for (let p = 0; p < size; p++) if (partition[p] >= 0) queue[tail++] = p;
    const claim = (q, r) => { if (partition[q] < 0 && (!allowed || allowed[q])) { partition[q] = r; queue[tail++] = q; } };
    while (head < tail) {
      const p = queue[head++];
      const r = partition[p];
      const x = p % width;
      if (x > 0) claim(p - 1, r);
      if (x < width - 1) claim(p + 1, r);
      if (p >= width) claim(p - width, r);
      if (p < size - width) claim(p + width, r);
    }
    return tail;
  };
  if (passable) spread(passable);
  if (spread(null) < size) {
    // Nothing was kept: the whole page becomes one region.
    for (let p = 0; p < size; p++) if (partition[p] < 0) partition[p] = 0;
  }
  return partition;
}

function adjacency(partition, width, height, count) {
  const neighbors = Array.from({ length: count }, () => new Map());
  const link = (a, b) => {
    neighbors[a].set(b, (neighbors[a].get(b) || 0) + 1);
    neighbors[b].set(a, (neighbors[b].get(a) || 0) + 1);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x, r = partition[p];
      if (x < width - 1 && partition[p + 1] !== r) link(r, partition[p + 1]);
      if (y < height - 1 && partition[p + width] !== r) link(r, partition[p + width]);
    }
  }
  return neighbors;
}

function hash(a, b) {
  let h = (a * 374761393 + b * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Give each region a palette slot. Neighbors avoid sharing a slot, and the slots stay
// balanced so every number has a similar amount of work. Slots already in `fixed`
// (for example, sampled from a color reference) are kept.
function assignSlots({ count, areas, neighbors, slots = 8, fixed = null }) {
  const slot = new Int32Array(count).fill(-1);
  const used = new Float64Array(slots);
  if (fixed) {
    for (let i = 0; i < count; i++) if (fixed[i] != null && fixed[i] >= 0) { slot[i] = fixed[i]; used[fixed[i]]++; }
  }
  const order = Array.from({ length: count }, (_, i) => i).filter(i => slot[i] < 0).sort((a, b) => areas[b] - areas[a] || a - b);
  for (const i of order) {
    let best = 0, bestCost = Infinity;
    let perimeter = 0;
    for (const n of neighbors[i].values()) perimeter += n;
    for (let s = 0; s < slots; s++) {
      let clash = 0;
      for (const [n, shared] of neighbors[i]) if (slot[n] === s) clash += shared;
      const cost = (perimeter ? clash / perimeter : 0) * 100 + used[s] / Math.max(1, count) * 10 + hash(i, s);
      if (cost < bestCost) { bestCost = cost; best = s; }
    }
    slot[i] = best;
    used[best]++;
  }
  return Array.from(slot);
}

// Nearest palette color by "redmean" weighted RGB distance.
function nearestSlot([r, g, b], palette) {
  let best = 0, bestD = Infinity;
  palette.forEach((hex, i) => {
    const pr = parseInt(hex.slice(1, 3), 16), pg = parseInt(hex.slice(3, 5), 16), pb = parseInt(hex.slice(5, 7), 16);
    const rm = (r + pr) / 2, dr = r - pr, dg = g - pg, db = b - pb;
    const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

// Average a color reference (same size as the line art) over each region's paper pixels.
function sampleSlots(partition, ink, reference, count, palette) {
  const sum = new Float64Array(count * 4);
  for (let p = 0; p < partition.length; p++) {
    if (ink[p]) continue;
    const r = partition[p], q = p * 4, s = r * 4;
    sum[s] += reference[q]; sum[s + 1] += reference[q + 1]; sum[s + 2] += reference[q + 2]; sum[s + 3]++;
  }
  return Array.from({ length: count }, (_, r) => {
    const n = sum[r * 4 + 3];
    return n ? nearestSlot([sum[r * 4] / n, sum[r * 4 + 1] / n, sum[r * 4 + 2] / n], palette) : null;
  });
}

// Trace every region's boundary along pixel edges. Outer edges run clockwise and holes
// counterclockwise (in screen coordinates), so the default nonzero fill rule is correct.
function traceRegions(partition, width, height, count) {
  const start = new Int32Array(count + 1);
  for (let p = 0; p < partition.length; p++) start[partition[p] + 1]++;
  for (let i = 0; i < count; i++) start[i + 1] += start[i];
  const pixels = new Int32Array(partition.length);
  const fillAt = start.slice(0, count);
  for (let p = 0; p < partition.length; p++) pixels[fillAt[partition[p]]++] = p;

  const W = width + 1;
  const loopsByRegion = [];
  for (let r = 0; r < count; r++) {
    const out = new Map();
    const add = (ax, ay, bx, by) => {
      const a = ay * W + ax, b = by * W + bx;
      const list = out.get(a);
      if (list) list.push(b); else out.set(a, [b]);
    };
    for (let k = start[r]; k < start[r + 1]; k++) {
      const p = pixels[k], x = p % width, y = (p - x) / width;
      if (y === 0 || partition[p - width] !== r) add(x, y, x + 1, y);
      if (x === width - 1 || partition[p + 1] !== r) add(x + 1, y, x + 1, y + 1);
      if (y === height - 1 || partition[p + width] !== r) add(x + 1, y + 1, x, y + 1);
      if (x === 0 || partition[p - 1] !== r) add(x, y + 1, x, y);
    }
    const loops = [];
    for (const [first] of out) {
      while (out.get(first)?.length) {
        const loop = [];
        let v = first;
        do {
          loop.push([v % W, Math.floor(v / W)]);
          const list = out.get(v);
          const next = list.pop();
          if (!list.length) out.delete(v);
          v = next;
        } while (v !== first);
        loops.push(loop);
      }
    }
    loopsByRegion.push(loops);
  }
  return loopsByRegion;
}

function dropCollinear(points) {
  const n = points.length;
  if (n < 4) return points;
  const out = [];
  for (let i = 0; i < n; i++) {
    const [ax, ay] = points[(i + n - 1) % n], [bx, by] = points[i], [cx, cy] = points[(i + 1) % n];
    if ((bx - ax) * (cy - by) - (by - ay) * (cx - bx) !== 0) out.push(points[i]);
  }
  return out.length >= 3 ? out : points;
}

function rdp(points, first, last, epsilon, keep) {
  const [ax, ay] = points[first], [bx, by] = points[last];
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
  let maxD = -1, index = -1;
  for (let i = first + 1; i < last; i++) {
    const [px, py] = points[i];
    const d = len === 1 && !dx && !dy ? Math.hypot(px - ax, py - ay) : Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
    if (d > maxD) { maxD = d; index = i; }
  }
  if (maxD > epsilon) {
    keep[index] = 1;
    rdp(points, first, index, epsilon, keep);
    rdp(points, index, last, epsilon, keep);
  }
}

function simplifyLoop(loop, epsilon = 0.75) {
  const points = dropCollinear(loop);
  if (points.length <= 4 || epsilon <= 0) return points;
  // Split the closed loop at the point farthest from the first one.
  let far = 0, farD = -1;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i][0] - points[0][0], points[i][1] - points[0][1]);
    if (d > farD) { farD = d; far = i; }
  }
  const ring = [...points, points[0]];
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[far] = keep[ring.length - 1] = 1;
  rdp(ring, 0, far, epsilon, keep);
  rdp(ring, far, ring.length - 1, epsilon, keep);
  const out = ring.slice(0, -1).filter((_, i) => keep[i]);
  return out.length >= 3 ? out : points;
}

function pathData(loops) {
  return loops.map(loop => 'M' + loop.map(([x, y]) => x + ' ' + y).join('L') + 'Z').join('');
}

// Shoelace area of a path's loops with the nonzero sign convention used above.
function loopArea(loop) {
  let a = 0;
  for (let i = 0; i < loop.length; i++) {
    const [x1, y1] = loop[i], [x2, y2] = loop[(i + 1) % loop.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

// Parse an M/L/Z path into polygons.
function parsePolygons(d) {
  const polygons = [];
  let current = null;
  for (const [, cmd, args] of d.matchAll(/([MLZ])([^MLZ]*)/g)) {
    if (cmd === 'Z') { if (current) polygons.push(current); current = null; continue; }
    const nums = args.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    for (let i = 0; i + 1 < nums.length; i += 2) {
      if (cmd === 'M' && i === 0) { if (current) polygons.push(current); current = []; }
      current.push([nums[i], nums[i + 1]]);
    }
  }
  if (current?.length) polygons.push(current);
  return polygons;
}

// Even-odd scanline fill at pixel centers. Calls visit(pixelIndex) per covered pixel.
function rasterizePath(d, width, height, scale, visit) {
  const edges = [];
  for (const poly of parsePolygons(d)) {
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
      if (y1 !== y2) edges.push([x1 * scale, y1 * scale, x2 * scale, y2 * scale]);
    }
  }
  if (!edges.length) return;
  let minY = Infinity, maxY = -Infinity;
  for (const [, y1, , y2] of edges) { minY = Math.min(minY, y1, y2); maxY = Math.max(maxY, y1, y2); }
  for (let y = Math.max(0, Math.floor(minY)); y < Math.min(height, Math.ceil(maxY)); y++) {
    const cy = y + 0.5, xs = [];
    for (const [x1, y1, x2, y2] of edges) {
      if ((y1 <= cy && y2 > cy) || (y2 <= cy && y1 > cy)) xs.push(x1 + (cy - y1) / (y2 - y1) * (x2 - x1));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k] - 0.5)), to = Math.min(width - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = from; x <= to; x++) visit(y * width + x);
    }
  }
}

// Map old region ids onto new ones, so saved fills and clipped strokes survive a re-run.
// fills: old id -> new ids that lie mostly (>= half) inside it.
// strokes: old id -> the new id that overlaps it most.
function legacyMap(oldPaths, oldScale, partition, width, height, newCount) {
  const oldLabels = new Int32Array(partition.length).fill(-1);
  oldPaths.forEach((d, id) => rasterizePath(d, width, height, oldScale, p => { oldLabels[p] = id; }));
  const overlap = new Map();
  const newArea = new Float64Array(newCount);
  for (let p = 0; p < partition.length; p++) {
    newArea[partition[p]]++;
    const o = oldLabels[p];
    if (o < 0) continue;
    const key = o * newCount + partition[p];
    overlap.set(key, (overlap.get(key) || 0) + 1);
  }
  const fills = {}, strokes = {}, best = {};
  for (const [key, n] of overlap) {
    const o = Math.floor(key / newCount), r = key % newCount;
    if (n * 2 >= newArea[r]) (fills[o] ||= []).push(r);
    if (!best[o] || n > best[o]) { best[o] = n; strokes[o] = r; }
  }
  for (const list of Object.values(fills)) list.sort((a, b) => a - b);
  return { fills, strokes };
}

// Chain an earlier legacy map (v1 -> v2) with a new one (v2 -> v3) into v1 -> v3.
function composeLegacy(previous, next) {
  if (!previous) return next;
  const fills = {}, strokes = {};
  for (const [o, mids] of Object.entries(previous.fills)) {
    const out = new Set();
    for (const m of mids) for (const r of next.fills[m] || []) out.add(r);
    if (out.size) fills[o] = [...out].sort((a, b) => a - b);
  }
  for (const [o, m] of Object.entries(previous.strokes)) if (next.strokes[m] != null) strokes[o] = next.strokes[m];
  return { fills, strokes };
}

function numberRegions(rgba, width, height, options = {}) {
  const { threshold = 150, gap = 1, minRadius = 3, minArea = 24, epsilon = 0.75, slots = 8, reference = null, palette = null } = options;
  const gray = grayscale(rgba, width, height);
  const ink = inkMask(gray, threshold);
  const closed = dilate(ink, width, height, gap);
  const { labels, count, areas } = labelComponents(closed, width, height);
  const dist = distanceInside(labels, width, height);
  const spots = labelSpots(labels, dist, width, count);

  // Keep shapes big enough to tap and label; renumber them top-to-bottom, left-to-right.
  const kept = [];
  for (let c = 0; c < count; c++) if (areas[c] >= minArea && spots[c].radius >= minRadius) kept.push(c);
  kept.sort((a, b) => spots[a].y - spots[b].y || spots[a].x - spots[b].x);
  const newId = new Int32Array(count).fill(-1);
  kept.forEach((c, i) => { newId[c] = i; });
  const seeds = new Int32Array(labels.length);
  for (let p = 0; p < labels.length; p++) seeds[p] = labels[p] >= 0 ? newId[labels[p]] : -1;

  const n = Math.max(1, kept.length);
  const paper = new Uint8Array(ink.length);
  for (let p = 0; p < ink.length; p++) paper[p] = ink[p] ? 0 : 1;
  const partition = growRegions(seeds, labels.length, width, paper);
  const neighbors = adjacency(partition, width, height, n);
  const finalAreas = new Float64Array(n);
  for (let p = 0; p < partition.length; p++) finalAreas[partition[p]]++;
  const fixed = reference && palette ? sampleSlots(partition, ink, reference, n, palette) : null;
  const slot = assignSlots({ count: n, areas: finalAreas, neighbors, slots, fixed });
  const loops = traceRegions(partition, width, height, n);

  const regions = loops.map((regionLoops, i) => {
    const spot = kept.length ? spots[kept[i]] : { x: width / 2, y: height / 2, radius: Math.min(width, height) / 2 };
    const simplified = regionLoops.map(l => simplifyLoop(l, epsilon)).filter(l => l.length >= 3 && Math.abs(loopArea(l)) > 0.5);
    return { path: pathData(simplified), x: spot.x, y: spot.y, slot: slot[i], radius: Math.round(spot.radius * 10) / 10, area: finalAreas[i] };
  });
  return {
    regions, partition, gray, ink, neighbors,
    stats: { components: count, kept: kept.length, specks: count - kept.length, sampled: fixed ? fixed.filter(s => s != null).length : 0 },
  };
}

module.exports = {
  grayscale, inkMask, dilate, labelComponents, distanceInside, labelSpots, growRegions, adjacency,
  assignSlots, nearestSlot, sampleSlots, traceRegions, simplifyLoop, pathData, loopArea,
  parsePolygons, rasterizePath, legacyMap, composeLegacy, numberRegions,
};
