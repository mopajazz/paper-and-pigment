const BrushImport = (() => {
  const maxFileSize = 24 * 1024 * 1024;
  const maxImageSize = 6 * 1024 * 1024;
  const tipSize = 48;

  async function embeddedShape(buffer) {
    const invalid = () => new Error('This file is not a supported Procreate brush archive.');
    if (buffer.byteLength < 22 || buffer.byteLength > maxFileSize) throw invalid();
    const data = new DataView(buffer);
    let end = buffer.byteLength - 22;
    for (; end >= Math.max(0,buffer.byteLength-65557); end--) {
      if (data.getUint32(end,true) === 0x06054b50 && end+22+data.getUint16(end+20,true) === buffer.byteLength) break;
    }
    if (end < Math.max(0,buffer.byteLength-65557)) throw invalid();
    if (data.getUint16(end+4,true) !== 0 || data.getUint16(end+6,true) !== 0) throw invalid();
    let entry = data.getUint32(end+16,true);
    const count = data.getUint16(end+10,true);
    const decode = new TextDecoder();
    for (let i=0;i<count;i++) {
      if (entry+46>end || data.getUint32(entry,true)!==0x02014b50) throw invalid();
      const nameLength = data.getUint16(entry+28,true);
      const next = entry+46+nameLength+data.getUint16(entry+30,true)+data.getUint16(entry+32,true);
      if (next>end) throw invalid();
      const name = decode.decode(new Uint8Array(buffer,entry+46,nameLength));
      if (/(^|\/)shape\.png$/i.test(name)) {
        const flags = data.getUint16(entry+8,true);
        const method = data.getUint16(entry+10,true);
        const compressed = data.getUint32(entry+20,true);
        const size = data.getUint32(entry+24,true);
        const local = data.getUint32(entry+42,true);
        if ((flags&1) || size>maxImageSize || size<8 || local+30>entry || data.getUint32(local,true)!==0x04034b50) throw invalid();
        const start = local+30+data.getUint16(local+26,true)+data.getUint16(local+28,true);
        if (start+compressed>entry) throw invalid();
        const payload = new Uint8Array(buffer,start,compressed);
        if (method === 0 && compressed === size) return payload;
        if (method !== 8) throw invalid();
        let stream;
        try {
          stream = new Blob([payload]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        } catch {
          throw new Error('This browser cannot open compressed brush files.');
        }
        const reader = stream.getReader();
        const output = new Uint8Array(size);
        let written = 0;
        while (true) {
          const { value,done } = await reader.read();
          if (done) break;
          if (written+value.length>size) {
            await reader.cancel();
            throw invalid();
          }
          output.set(value,written);
          written += value.length;
        }
        if (written!==size) throw invalid();
        return output;
      }
      entry = next;
    }
    throw new Error('This brush has no embedded brush tip. Try a custom brush with its own shape.');
  }

  async function readTip(file) {
    if (!/\.brush$/i.test(file.name)) throw new Error('Choose a single Procreate .brush file.');
    if (file.size>maxFileSize) throw new Error('Choose a brush smaller than 24 MB.');
    const png = await embeddedShape(await file.arrayBuffer());
    const header = new DataView(png.buffer,png.byteOffset,png.byteLength);
    if (png.length<33 || header.getUint32(0)!==0x89504e47 || header.getUint32(4)!==0x0d0a1a0a ||
        header.getUint32(12)!==0x49484452 || header.getUint32(16)>4096 || header.getUint32(20)>4096) {
      throw new Error('The embedded brush tip must be a PNG up to 4096 pixels wide and tall.');
    }
    const image = await createImageBitmap(new Blob([png],{type:'image/png'}));
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = tipSize;
    const context = canvas.getContext('2d');
    context.drawImage(image,0,0,tipSize,tipSize);
    image.close();
    const pixels = context.getImageData(0,0,tipSize,tipSize).data;
    const mask = new Uint8Array(tipSize*tipSize);
    for (let i=0;i<mask.length;i++) {
      const p = i*4;
      mask[i] = Math.round((.2126*pixels[p]+.7152*pixels[p+1]+.0722*pixels[p+2])*pixels[p+3]/255);
    }
    if (!mask.some(value=>value>20)) throw new Error('The embedded tip is empty.');
    return { name:file.name.replace(/\.brush$/i,''), mask:btoa(String.fromCharCode(...mask)) };
  }
  return { embeddedShape, readTip, tipSize };
})();
if (typeof module !== 'undefined') module.exports = BrushImport;
