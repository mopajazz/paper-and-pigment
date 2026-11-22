const test = require('node:test');
const assert = require('node:assert/strict');
const composition = require('../composition.js');

test('a saved seed recreates a detailed numbered page', () => {
  const first = composition.generate('fernery',32);
  assert.deepEqual(first,composition.generate('fernery',32));
  assert.notDeepEqual(first.regions,composition.generate('fernery',99).regions);
  assert.ok(first.regions.length>=65);
  assert.ok(first.ornaments.length>=20);
  assert.ok(first.regions.every(r=>r.path.endsWith('Z') && r.slot>=0 && r.slot<8));
});

test('the medallion builds a denser and distinct structure', () => {
  const fernery = composition.generate('fernery',51);
  const medallion = composition.generate('medallion',51);
  assert.notEqual(fernery.palette,medallion.palette);
  assert.ok(medallion.regions.length>fernery.regions.length);
  assert.notEqual(fernery.regions[0].path,medallion.regions[0].path);
});

test('first-generation boards retain their original painting regions during migration', () => {
  const legacy = composition.restore({ key:'generated-1-32',style:'retired',seed:32 });
  assert.equal(legacy.style,'cut');
  assert.equal(legacy.version,1);
  const sheet = composition.generate(legacy.style,legacy.seed,legacy.version);
  assert.deepEqual(sheet.regions[0], {
    path:'M-63 37 C-83 14 -71 -32 -49 -57 Q-34 -22 -20 -23 Q-26 -60 1 -80 Q29 -55 19 -24 Q45 -28 54 -59 Q82 -32 69 2 Q94 -5 91 13 Q79 56 25 64 Q-22 70 -63 37 Z',
    x:376.7128549059853,y:276.9812806341797,scale:1.32,slot:0,turn:-10.127885732799768,
    });
});
