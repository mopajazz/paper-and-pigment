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
