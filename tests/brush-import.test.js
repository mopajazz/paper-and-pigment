const test = require('node:test');
const assert = require('node:assert/strict');
const { deflateRawSync } = require('node:zlib');
const importer = (() => { try { return require('../brush-import.js'); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; } })();

function zipImage(name, content) {
  const filename = Buffer.from(name);
  const compressed = deflateRawSync(content);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(8,8);
  local.writeUInt32LE(compressed.length,18);
  local.writeUInt32LE(content.length,22);
  local.writeUInt16LE(filename.length,26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50);
  central.writeUInt16LE(8,10);
  central.writeUInt32LE(compressed.length,20);
  central.writeUInt32LE(content.length,24);
  central.writeUInt16LE(filename.length,28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1,8);
  end.writeUInt16LE(1,10);
  end.writeUInt32LE(central.length+filename.length,12);
  end.writeUInt32LE(local.length+filename.length+compressed.length,16);
  return Uint8Array.from(Buffer.concat([local,filename,compressed,central,filename,end])).buffer;
}

test('extracts the embedded shape from a compressed Procreate brush archive', async () => {
  assert.ok(importer, 'brush importer is available');
  const shape = Buffer.from([137,80,78,71,13,10,26,10,25,42]);
  assert.deepEqual(await importer.embeddedShape(zipImage('Custom/Shape.png',shape)),new Uint8Array(shape));
});
test('rejects a brush whose only embedded image is a thumbnail', async () => {
  assert.ok(importer, 'brush importer is available');
  await assert.rejects(importer.embeddedShape(zipImage('QuickLook/Thumbnail.png',Buffer.from('preview'))),/embedded brush tip/);
});
