const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../tools/regions.js');

// Draw a white RGBA page and paint black pixels with set(x, y).
function page(width, height, draw) {
  const rgba = new Uint8Array(width * height * 4).fill(255);
  draw((x, y) => { const p = (y * width + x) * 4; rgba[p] = rgba[p + 1] = rgba[p + 2] = 0; });
  return rgba;
}
function hline(set, y, x0, x1) { for (let x = x0; x <= x1; x++) set(x, y); }
function vline(set, x, y0, y1) { for (let y = y0; y <= y1; y++) set(x, y); }

// Pixel coverage of a path, counted with the nonzero rule via ray casting at pixel centers.
function covered(d, width, height) {
  const polys = R.parsePolygons(d);
  const cover = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const cx = x + 0.5, cy = y + 0.5;
    let winding = 0;
    for (const poly of polys) for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
      if (y1 <= cy && y2 > cy && (x2 - x1) * (cy - y1) - (cx - x1) * (y2 - y1) > 0) winding++;
      else if (y1 > cy && y2 <= cy && (x2 - x1) * (cy - y1) - (cx - x1) * (y2 - y1) < 0) winding--;
    }
    cover[y * width + x] = winding !== 0 ? 1 : 0;
  }
  return cover;
}

test('a page split by one line becomes two regions that cover every pixel exactly once', () => {
  const W = 40, H = 20;
  const rgba = page(W, H, set => vline(set, 19, 0, H - 1));
  const { regions, stats } = R.numberRegions(rgba, W, H, { gap: 0, minRadius: 2, minArea: 4, epsilon: 0 });
  assert.equal(stats.kept, 2);
  const total = new Uint8Array(W * H);
  for (const r of regions) covered(r.path, W, H).forEach((c, i) => { total[i] += c; });
  assert.ok(total.every(c => c === 1), 'regions tile the page without gaps or overlaps');
  assert.notEqual(regions[0].slot, regions[1].slot, 'neighbors get different numbers');
});

test('a shape with a hole is traced so the hole is not filled', () => {
  const W = 30, H = 30;
  const rgba = page(W, H, set => {
    hline(set, 5, 5, 24); hline(set, 24, 5, 24); vline(set, 5, 5, 24); vline(set, 24, 5, 24);
    hline(set, 12, 12, 17); hline(set, 17, 12, 17); vline(set, 12, 12, 17); vline(set, 17, 12, 17);
  });
  const { regions } = R.numberRegions(rgba, W, H, { gap: 0, minRadius: 1, minArea: 4, epsilon: 0 });
  assert.equal(regions.length, 3, 'outside, ring, and the inner square');
  const ring = regions.find(r => r.y > 5 && r.y < 12 || r.y > 17 && r.y < 24);
  const cover = covered(ring.path, W, H);
  assert.equal(cover[15 * W + 15], 0, 'center of the hole stays outside the ring');
  assert.equal(cover[8 * W + 8], 1, 'ring interior is inside');
});

test('specks too small to tap are absorbed into the shape around them', () => {
  const W = 30, H = 30;
  const rgba = page(W, H, set => {
    // A tiny 1x1 white hole enclosed by ink in the middle of the page.
    hline(set, 14, 14, 16); hline(set, 16, 14, 16); set(14, 15); set(16, 15);
  });
  const { regions, stats } = R.numberRegions(rgba, W, H, { gap: 0, minRadius: 3, minArea: 24, epsilon: 0 });
  assert.equal(stats.components, 2);
  assert.equal(stats.kept, 1);
  assert.equal(regions.length, 1);
  assert.ok(covered(regions[0].path, W, H).every(c => c === 1), 'the single region covers the speck and the ink');
});

test('gap closing joins a broken line so the two sides stay separate', () => {
  const W = 40, H = 20;
  const rgba = page(W, H, set => { vline(set, 19, 0, 8); vline(set, 19, 10, H - 1); });
  assert.equal(R.numberRegions(rgba, W, H, { gap: 0, minRadius: 1, minArea: 4 }).stats.kept, 1, 'the gap leaks without closing');
  assert.equal(R.numberRegions(rgba, W, H, { gap: 1, minRadius: 1, minArea: 4 }).stats.kept, 2);
});

test('labels sit at the widest point of each shape', () => {
  const W = 60, H = 20;
  const rgba = page(W, H, set => vline(set, 19, 0, H - 1));
  const { regions } = R.numberRegions(rgba, W, H, { gap: 0, minRadius: 2, minArea: 4 });
  const right = regions.find(r => r.x > 19);
  assert.ok(Math.abs(right.x - 39.5) <= 2 && Math.abs(right.y - 9.5) <= 2, `label near the middle, got ${right.x},${right.y}`);
});

test('a color reference decides the numbers', () => {
  const W = 40, H = 20;
  const rgba = page(W, H, set => vline(set, 19, 0, H - 1));
  const reference = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = (y * W + x) * 4;
    reference.set(x < 19 ? [200, 30, 40, 255] : [30, 60, 200, 255], p);
  }
  const palette = ['#2040c0', '#d02030', '#30a050'];
  const { regions } = R.numberRegions(rgba, W, H, { gap: 0, minRadius: 2, minArea: 4, reference, palette, slots: 3 });
  assert.equal(regions.find(r => r.x < 19).slot, 1);
  assert.equal(regions.find(r => r.x > 19).slot, 0);
});

test('legacy maps carry old fills to the new regions inside them, and compose across runs', () => {
  const W = 40, H = 20;
  const rgba = page(W, H, set => vline(set, 19, 0, H - 1));
  const { partition, regions } = R.numberRegions(rgba, W, H, { gap: 0, minRadius: 2, minArea: 4 });
  const left = regions.findIndex(r => r.x < 19);
  // One old region covered the whole page at half scale.
  const map = R.legacyMap(['M0 0L20 0L20 10L0 10Z'], 2, partition, W, H, regions.length);
  assert.deepEqual(map.fills[0], [0, 1]);
  assert.ok([0, 1].includes(map.strokes[0]));
  const composed = R.composeLegacy({ fills: { 5: [0] }, strokes: { 5: 0 } }, map);
  assert.deepEqual(composed.fills[5], [0, 1]);
  assert.equal(composed.strokes[5], map.strokes[0]);
  assert.ok(left >= 0);
});

test('simplification keeps a traced square to four corners', () => {
  const loop = [];
  for (let x = 0; x < 10; x++) loop.push([x, 0]);
  for (let y = 0; y < 10; y++) loop.push([10, y]);
  for (let x = 10; x > 0; x--) loop.push([x, 10]);
  for (let y = 10; y > 0; y--) loop.push([0, y]);
  assert.equal(R.simplifyLoop(loop, 0.75).length, 4);
});

test('strips between hatching strokes join the shape they open onto', () => {
  // Left and right shapes split by a wall at x=20. Short hatch strokes hang down from the
  // top edge on the right side, close to the wall. Gap closing seals the strips between
  // them, but they open onto the right shape, so they must belong to it, not the left.
  const W = 50, H = 30;
  const rgba = page(W, H, set => {
    vline(set, 20, 0, H - 1);
    for (let x = 22; x <= 30; x += 2) vline(set, x, 0, 12);
  });
  const { partition, regions } = R.numberRegions(rgba, W, H, { gap: 1, minRadius: 2, minArea: 4 });
  const right = partition[20 * W + 40];
  assert.notEqual(partition[20 * W + 5], right);
  for (const x of [23, 25, 27, 29]) assert.equal(partition[5 * W + x], right, `strip at x=${x}`);
  assert.equal(regions.length, 2);
});

test('a thin strip too narrow to keep joins one neighbor whole, never split between several', () => {
  // A on the left, a 3px strip between walls at x=20 and x=24, and B (top) / C (bottom)
  // on the right. The strip is discarded as a shape, then must go to a single neighbor.
  const W = 60, H = 30;
  const rgba = page(W, H, set => { vline(set, 20, 0, H - 1); vline(set, 24, 0, H - 1); hline(set, 15, 25, W - 1); });
  const { partition } = R.numberRegions(rgba, W, H, { gap: 0, minRadius: 2.5, minArea: 4 });
  const owners = new Set();
  for (let y = 0; y < H; y++) for (let x = 21; x <= 23; x++) owners.add(partition[y * W + x]);
  assert.equal(owners.size, 1, `strip split between ${[...owners].join(', ')}`);
});
