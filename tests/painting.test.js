const test = require('node:test');
const assert = require('node:assert/strict');
const model = (() => { try { return require('../painting.js'); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; } })();

test('recoloring numbered fills preserves a hand-painted stroke', () => {
  assert.ok(model, 'painting model is available');
  const stroke = { color: '#222233', region: 0, points: [{ x: 100, y: 100 }] };
  const document = model.applyEdit(model.emptyPainting(), { fills: { 0: 1 }, strokes: [stroke] });
  const updated = model.applyEdit(document, { palette: 'fauve' });
  assert.equal(model.fillColor(updated, 0, ['#aabbcc', '#ccddee']), '#ccddee');
  assert.deepEqual(updated.strokes, [stroke]);
  assert.equal(document.palette, null);
});

test('pen force and tilt affect the brush while mouse uses a steady pressure', () => {
  assert.ok(model, 'painting model is available');
  const light = model.brushSample({ pointerType: 'pen', pressure: .2, tiltX: 0, tiltY: 0 }, 'pencil');
  const strong = model.brushSample({ pointerType: 'pen', pressure: .8, tiltX: 0, tiltY: 0 }, 'pencil');
  const tilted = model.brushSample({ pointerType: 'pen', pressure: .8, tiltX: 60, tiltY: 0 }, 'pencil');
  assert.ok(strong.opacity > light.opacity);
  assert.ok(tilted.width > strong.width);
  assert.deepEqual(model.brushSample({ pointerType: 'mouse', pressure: .1 }, 'pencil'),
    model.brushSample({ pointerType: 'mouse', pressure: .9 }, 'pencil'));
});

test('reset clears artwork and keeps the chosen palette and undo snapshot intact', () => {
  const original = { palette: 'cut', fills: { 0: 4 }, strokes: [{ color: '#222333' }] };
  assert.deepEqual(model.resetPainting(original), { palette: 'cut', fills: {}, strokes: [] });
  assert.deepEqual(original.fills, { 0: 4 });
  assert.equal(original.strokes.length, 1);
});

test('the brush outline uses the same radius as the rendered brush stamp', () => {
  const sample = { width: 1.5 };
  assert.equal(model.brushRadius(20,sample,'gouache'),15);
  assert.equal(model.brushRadius(20,sample,'ink'),4.5);
});

test('re-numbered regions keep saved fills and clipped strokes', () => {
  const legacy = { from: 1, fills: { 3: [10, 11], 4: [12] }, strokes: { 3: 11 } };
  const saved = { palette: 'cut', fills: { 3: 2, 4: '#123456', 9: 5 }, strokes: [{ region: 3, points: [] }, { region: null, points: [] }] };
  const moved = model.migrateRegions(saved, legacy, 2);
  assert.deepEqual(moved.fills, { 10: 2, 11: 2, 12: '#123456' });
  assert.equal(moved.strokes[0].region, 11);
  assert.equal(moved.strokes[1].region, null);
  assert.equal(moved.regions, 2);
  assert.equal(moved.palette, 'cut');
  assert.equal(model.migrateRegions(moved, legacy, 2), moved, 'already migrated work is left alone');
});

test('work saved against an unknown numbering is cleared, not misapplied', () => {
  const moved = model.migrateRegions({ fills: { 3: 2 }, strokes: [{ region: 3 }], regions: 5 }, { from: 1, fills: { 3: [10] }, strokes: { 3: 10 } }, 7);
  assert.deepEqual(moved.fills, {});
  assert.equal(moved.strokes[0].region, null);
});

test('reset keeps the region numbering stamp so later fills are not re-mapped', () => {
  assert.deepEqual(model.resetPainting({ palette: 'cut', fills: { 1: 2 }, strokes: [], regions: 2 }),
    { palette: 'cut', fills: {}, strokes: [], regions: 2 });
});
