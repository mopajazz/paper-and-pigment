const { width, height, names, palettes, paintings } = Artwork;
const $ = (id) => document.getElementById(id);
const canvas = $('page');
const context = canvas.getContext('2d');
const cache = document.createElement('canvas');
cache.width = canvas.width;
cache.height = canvas.height;
const backing = cache.getContext('2d');
// The part of the page the canvas shows: the artwork's own rectangle for an
// illustration, so a portrait piece gets a portrait canvas instead of floating in a
// landscape page. Coordinates stay in page units; `s` is canvas pixels per page unit,
// chosen to keep the original 1440x1080 pixel budget.
const pixelBudget = canvas.width*canvas.height;
let crop = { x:0, y:0, w:width, h:height, s:2 };
const storageKey = 'paper-and-pigment.v1';
let library = {};
let tips = {};
let generated = [];
let copies = {};
let removed = [];
let pageKey = 'garden';
const sourceKey = key => copies[key]?.source || key;
const sheetFor = key => paintings[sourceKey(key)];
function paintingName(key) {
  const name = sheetFor(key).name;
  const copy = copies[key];
  return copy ? name + (copy.number === 1 ? ' copy' : ' copy ' + copy.number) : name;
}
try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (saved && typeof saved === 'object') {
    library = saved.library ?? {};
    tips = saved.tips ?? {};
    if (Array.isArray(saved.generated)) {
      generated = saved.generated.map(Composition.restore).filter(Boolean);
      generated.forEach(({ key,style,seed,version },i) => Artwork.addGenerated(key,style,seed,i+1,version));
    }
    for (const [key,copy] of Object.entries(saved.copies || {})) {
      if (/^copy-[0-9a-f]+$/.test(key) && copy && Object.hasOwn(paintings,copy.source) &&
          Number.isSafeInteger(copy.number) && copy.number > 0) copies[key] = copy;
    }
    if (Array.isArray(saved.removed)) removed = saved.removed.filter(key => key !== 'blank' && Object.hasOwn(paintings,key));
    if (Object.hasOwn(copies,saved.pageKey) || (Object.hasOwn(paintings,saved.pageKey) && !removed.includes(saved.pageKey))) pageKey = saved.pageKey;
    else if (removed.includes(pageKey)) pageKey = 'blank';
    // Illustrations that were re-numbered keep their saved fills and brushwork.
    for (const [key,work] of Object.entries(library)) {
      const sheet = sheetFor(key);
      if (sheet?.regionsVersion > 1 && work) library[key] = Painting.migrateRegions(work,sheet.legacy,sheet.regionsVersion);
    }
  }
} catch {}

let history = [];
let future = [];
let paintingMode = 'fill';
let mode = sheetFor(pageKey).blank ? 'free' : paintingMode;
let selected = null;
let active = null;
let brushHover = null;
let sizePreview = 0;
let gesture = null;
let focusRegion = null;
let view = { zoom: 1, x: 0, y: 0 };
let dirty = true;
let frame = 0;
const touches = new Map();
const page = () => sheetFor(pageKey);
// New work is stamped with the sheet's region numbering, so a reload never re-maps it.
const art = () => library[pageKey] || { ...Painting.emptyPainting(), ...(page().regionsVersion > 1 && { regions:page().regionsVersion }) };
const currentPalette = () => palettes[art().palette || page().palette];
const colors = () => currentPalette().colors;
const shadeName = slot => (currentPalette().names || names)[slot];

const modeHelp = {
  fill: 'Tap a numbered shape for its suggested color, or choose a swatch first.',
  guided: 'Brush inside a shape. Your stroke stays within its edges.',
  free: 'Paint anywhere. Your fills and brushwork stay on the page.',
};
function announce(message) {
  $('status').textContent = message;
  $('status').classList.toggle('status-warning', message.startsWith('Browser storage') || message.startsWith('Could not'));
}
function writeSnapshot(next = {}) {
  localStorage.setItem(storageKey, JSON.stringify({ library, pageKey, tips, generated, copies, removed, ...next }));
}
function save() {
  try {
    writeSnapshot();
  } catch {
    announce('Browser storage is unavailable. Save an image to keep your work.');
  }
}
function commit(edit, appendStroke = null) {
  history.push(art());
  if (history.length > 60) history.shift();
  future = [];
  library[pageKey] = Painting.applyEdit(art(), edit);
  if (appendStroke && !dirty) {
    renderWet(appendStroke);
    backing.save();
    backing.setTransform(1,0,0,1,0,0);
    backing.drawImage(wetLayer,0,0);
    backing.restore();
    update(false);
  } else update();
  save();
}
function traverse(from, to) {
  if (!from.length || active) return;
  to.push(art());
  library[pageKey] = from.pop();
  update();
  save();
}

function completeIds(painting) {
  return new Set([...Object.keys(painting.fills).map(Number),
    ...painting.strokes.filter((stroke) => stroke.region !== null && stroke.length >= 20).map((stroke) => stroke.region)]);
}
function contrast(hex) {
  const [r,g,b] = [1,3,5].map(i => {
    const channel = parseInt(hex.slice(i,i+2),16)/255;
    return channel <= .04045 ? channel/12.92 : ((channel+.055)/1.055)**2.4;
  });
  return .2126*r + .7152*g + .0722*b > .28 ? '#222434' : '#fffdfa';
}

function renderSwatches() {
  $('custom-wrap').classList.toggle('selected', selected === 'custom' || (selected === null && mode === 'free'));
  $('swatches').replaceChildren(...colors().map((color, slot) => {
    const b = document.createElement('button');
    b.className = 'swatch';
    b.style.setProperty('--color',color);
    b.style.setProperty('--swatch-text',contrast(color));
    b.textContent = mode === 'free' ? '' : String(slot + 1);
    b.setAttribute('aria-label', `${slot+1}, ${shadeName(slot)}`);
    b.setAttribute('aria-pressed', String(selected === slot));
    b.onclick = () => {
      selected = selected === slot ? null : slot;
      renderSwatches();
      $('swatches').children[slot].focus({preventScroll:true});
      schedule();
    };
    return b;
  }));
}
function update(redraw = true) {
  const blank = Boolean(page().blank);
  $('mode-controls').hidden = blank;
  $('numbers-control').hidden = blank;
  $('outlines-control').hidden = blank;
  $('undo').disabled = !history.length;
  $('redo').disabled = !future.length;
  $('reset').disabled = !Object.keys(art().fills).length && !art().strokes.length;
  $('numbers').disabled = mode === 'free';
  $('mode-help').textContent = modeHelp[mode];
  $('theme').value = art().palette || page().palette;
  for (const button of $('modes').children) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  renderSwatches();
  dirty ||= redraw;
  schedule();
}

const stamps = new Map();
function tintedStamp(id, color) {
  if (!tips[id]) return null;
  const key = id + color;
  if (stamps.has(key)) return stamps.get(key);
  const stamp = document.createElement('canvas');
  stamp.width = stamp.height = BrushImport.tipSize;
  const ctx = stamp.getContext('2d');
  const image = ctx.createImageData(stamp.width,stamp.height);
  const mask = atob(tips[id].mask);
  for (let i=0;i<mask.length;i++) image.data[4*i+3] = mask.charCodeAt(i);
  ctx.putImageData(image,0,0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0,0,stamp.width,stamp.height);
  if (stamps.size>=64) stamps.delete(stamps.keys().next().value);
  stamps.set(key,stamp);
  return stamp;
}

const outsidePaths = new WeakMap();
function clipRegion(ctx, sheet, id) {
  ctx.clip(sheet.regions[id].path);
  if (sheet.disjoint) return;
  for (let i=id+1;i<sheet.regions.length;i++) {
    const above = sheet.regions[i];
    if (!outsidePaths.has(above)) {
      const outside = new Path2D();
      outside.rect(-1,-1,width+2,height+2);
      outside.addPath(above.path);
      outsidePaths.set(above,outside);
    }
    ctx.clip(outsidePaths.get(above),'evenodd');
  }
}
function drawStroke(ctx, stroke, sheet, first = 0, seed = 1357) {
  ctx.save();
  if (stroke.region !== null) clipRegion(ctx,sheet,stroke.region);
  ctx.fillStyle = stroke.color;
  const points = stroke.points;
  const stamp = tintedStamp(stroke.brush,stroke.color);
  const random = () => {
    seed = (Math.imul(seed,1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  function dab(x,y,size,alpha) {
    ctx.globalAlpha = Math.min(1,Math.max(0,alpha * stroke.opacity));
    ctx.beginPath();
    ctx.arc(x,y,size,0,2*Math.PI);
    ctx.fill();
  }
  for (let i = first; i < points.length; i++) {
    const p = points[i];
    const previous = points[i-1] || p;
    const distance = Math.hypot(p.x-previous.x,p.y-previous.y);
    const radius = Painting.brushRadius(stroke.size,p,stroke.brush);
    const steps = Math.max(1, Math.ceil(distance / Math.max(1.1, radius * .3)));
    for (let j=1;j<=steps;j++) {
      const x = previous.x+(p.x-previous.x)*j/steps;
      const y = previous.y+(p.y-previous.y)*j/steps;
      if (stamp) {
        ctx.globalAlpha = p.opacity * stroke.opacity * .58;
        ctx.drawImage(stamp,x-radius,y-radius,radius*2,radius*2);
        continue;
      }
      if (stroke.brush !== 'pencil') dab(x,y,radius*.88,p.opacity*(stroke.brush === 'ink' ? 1 : .38));
      if (stroke.brush !== 'ink') {
        for (let dot=0;dot<(stroke.brush === 'pencil' ? 12 : 7);dot++) {
          const angle = random()*2*Math.PI;
          const distance = Math.sqrt(random())*radius;
          dab(x+Math.cos(angle)*distance,y+Math.sin(angle)*distance,
            .25+random()*Math.max(.5,radius*.11),p.opacity*(stroke.brush === 'pencil' ? .65 : .28));
        }
      }
    }
  }
  ctx.restore();
  return seed;
}

function paper(ctx, sheet, painting, fullPreview = false) {
  const palette = palettes[painting.palette || sheet.palette].colors;
  ctx.fillStyle = '#fffaf0';
  ctx.fillRect(0,0,width,height);
  for (let i=0;i<3600;i++) {
    const x = ((i*49157) % 71993)/100;
    const y = ((i*41761) % 53993)/100;
    ctx.fillStyle = i%3 ? '#76635709' : '#876c6b14';
    ctx.fillRect(x,y,i%3 ? .65 : 1.25,.65);
  }
  for (const r of sheet.regions) {
    ctx.fillStyle = fullPreview ? palette[r.slot] : Painting.fillColor(painting,r.id,palette) || '#fffaf0';
    ctx.fill(r.path);
  }
}
const glassInks = new WeakMap();
function outlines(ctx, sheet, subtle = false) {
  if (sheet.glass) {
    if (!glassInks.has(sheet)) {
      const layer = document.createElement('canvas');
      layer.width = canvas.width;
      layer.height = canvas.height;
      const ink = layer.getContext('2d');
      ink.setTransform(crop.s,0,0,crop.s,-crop.x*crop.s,-crop.y*crop.s);
      ink.strokeStyle = sheet.ink;
      ink.lineWidth = 1.9;
      ink.lineJoin = 'round';
      for (const pane of sheet.regions) {
        ink.globalCompositeOperation = 'destination-out';
        ink.fill(pane.path);
        ink.globalCompositeOperation = 'source-over';
        ink.stroke(pane.path);
      }
      glassInks.set(sheet,layer);
    }
    ctx.drawImage(glassInks.get(sheet),crop.x,crop.y,crop.w,crop.h);
    return;
  }
  if (sheet.raster) {
    const { image,left,top,width,height } = sheet.raster;
    if (image.complete && image.naturalWidth) {
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(image,left,top,width,height);
      ctx.restore();
    }
    return;
  }
  ctx.strokeStyle = sheet.ink;
  ctx.globalAlpha = subtle ? .2 : .82;
  ctx.lineWidth = subtle ? .9 : 1.35;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const r of sheet.regions) ctx.stroke(r.path);
  ctx.lineWidth = .9;
  ctx.globalAlpha *= .73;
  for (const mark of sheet.ornaments) ctx.stroke(mark);
  ctx.globalAlpha = 1;
}
function highlights(ctx, sheet) {
  const show = mode !== 'free' && $('numbers').checked;
  if (!show && focusRegion === null) return;
  const completed = completeIds(art());
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const r of sheet.regions) {
    const aimed = show && selected !== null && selected === r.slot && !completed.has(r.id);
    if (aimed) {
      ctx.save();
      if (!sheet.disjoint) clipRegion(ctx,sheet,r.id);
      ctx.fillStyle = '#5a6ea32b';
      ctx.fill(r.path);
      ctx.restore();
    }
    if (r.id === focusRegion) {
      ctx.save();
      ctx.strokeStyle = '#344675';
      ctx.lineWidth = 3;
      ctx.setLineDash([4,3]);
      ctx.stroke(r.path);
      ctx.restore();
    }
    if (show && !completed.has(r.id) && view.zoom >= (r.labelZoom ?? 1)) {
      ctx.fillStyle = '#655771';
      ctx.font = `600 ${r.labelSize ?? 11}px system-ui`;
      ctx.fillText(String(r.slot+1),r.x,r.y);
    }
  }
}
function drawBrushCursor(ctx) {
  if (mode === 'fill' || gesture || canvas.classList.contains('panning')) return;
  const stroke = active?.stroke;
  const preview = sizePreview && !active;
  const hover = !active && brushHover;
  if (!stroke && !preview && (!hover || ($('pencil-only').checked && hover.pointerType !== 'pen'))) return;
  const brush = stroke?.brush ?? $('brush').value;
  const size = stroke?.size ?? Number($('size').value);
  const position = stroke?.points.at(-1) ?? artPoint(preview ? { x:crop.w/2,y:crop.h/2 } : canvasPoint(hover));
  const sample = stroke ? position : Painting.brushSample(preview ? {} : hover,brush);
  const radius = Painting.brushRadius(size,sample,brush);
  const scale = canvas.clientWidth * view.zoom / crop.w;
  if (!scale) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(position.x,position.y,radius,0,2*Math.PI);
  ctx.lineWidth = 3/scale;
  ctx.strokeStyle = '#fffaf0';
  ctx.stroke();
  ctx.lineWidth = 1/scale;
  ctx.strokeStyle = '#253a31';
  ctx.stroke();
  ctx.restore();
}

// A live stroke only stamps samples received since the preceding animation frame.
const wetLayer = document.createElement('canvas');
wetLayer.width = canvas.width;
wetLayer.height = canvas.height;
const wet = wetLayer.getContext('2d');
let wetStroke = null;
let wetCount = 0;
let wetSeed = 1357;
function renderWet(stroke) {
  if (wetStroke !== stroke) {
    wet.setTransform(1,0,0,1,0,0);
    wet.clearRect(0,0,wetLayer.width,wetLayer.height);
    wet.setTransform(crop.s,0,0,crop.s,-crop.x*crop.s,-crop.y*crop.s);
    wetStroke = stroke;
    wetCount = 0;
    wetSeed = 1357;
  }
  if (wetCount < stroke.points.length) {
    wetSeed = drawStroke(wet,stroke,page(),wetCount,wetSeed);
    wetCount = stroke.points.length;
  }
}
function render() {
  frame = 0;
  if (dirty) {
    backing.setTransform(crop.s,0,0,crop.s,-crop.x*crop.s,-crop.y*crop.s);
    paper(backing,page(),art());
    for (const stroke of art().strokes) drawStroke(backing,stroke,page());
    dirty = false;
  }
  context.setTransform(1,0,0,1,0,0);
  context.fillStyle = '#e1e7da';
  context.fillRect(0,0,canvas.width,canvas.height);
  const k = crop.s*view.zoom;
  context.setTransform(k,0,0,k,crop.s*view.x-k*crop.x,crop.s*view.y-k*crop.y);
  context.save();
  context.beginPath();
  context.rect(crop.x,crop.y,crop.w,crop.h);
  context.clip();
  context.drawImage(cache,crop.x,crop.y,crop.w,crop.h);
  if (active?.stroke) {
    renderWet(active.stroke);
    context.drawImage(wetLayer,crop.x,crop.y,crop.w,crop.h);
  }
  if ($('outlines').checked) outlines(context,page(),pageKey === 'cut' && mode === 'free');
  highlights(context,page());
  drawBrushCursor(context);
  context.restore();
}
function schedule() {
  if (!frame) frame = requestAnimationFrame(render);
}

function canvasPoint(event) {
  const bounds = canvas.getBoundingClientRect();
  return { x:(event.clientX-bounds.left)*crop.w/bounds.width, y:(event.clientY-bounds.top)*crop.h/bounds.height };
}
function artPoint(p) {
  return { x:(p.x-view.x)/view.zoom+crop.x, y:(p.y-view.y)/view.zoom+crop.y };
}
// Keep page point `anchor` under display point `at` at the given zoom.
function viewAt(zoom, at, anchor) {
  setView(zoom,at.x-(anchor.x-crop.x)*zoom,at.y-(anchor.y-crop.y)*zoom);
}
function regionAt(p) {
  backing.save();
  backing.setTransform(1,0,0,1,0,0);
  const regions = page().regions;
  let result = null;
  for (let i=regions.length-1;i>=0;i--) {
    if (backing.isPointInPath(regions[i].path,p.x,p.y)) {
      result = regions[i];
      break;
    }
  }
  backing.restore();
  return result;
}
function fill(r) {
  if (!r) return;
  const slot = selected === 'custom' ? $('custom').value : selected ?? r.slot;
  if (art().fills[r.id] === slot) return;
  announce(typeof slot === 'number' ? `Filled with ${shadeName(slot).toLowerCase()}.` : 'Filled with your custom color.');
  commit({ fills: { ...art().fills,[r.id]:slot } });
}
function setView(zoom,x,y) {
  view = { zoom, x:Math.max(crop.w*(1-zoom),Math.min(0,x)), y:Math.max(crop.h*(1-zoom),Math.min(0,y)) };
  $('zoom-reset').title = `Fit canvas · ${Math.round(zoom*100)}% zoom`;
  $('zoom-out').disabled = zoom === 1;
  $('zoom-in').disabled = zoom === 4;
  schedule();
}
function zoomAt(next, center = {x:crop.w/2,y:crop.h/2}) {
  const zoom = Math.max(1,Math.min(4,next));
  viewAt(zoom,center,artPoint(center));
}
function touchPair() {
  const [a,b] = touches.values();
  return { center:{ x:(a.x+b.x)/2,y:(a.y+b.y)/2 }, distance:Math.hypot(a.x-b.x,a.y-b.y) };
}

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  clearTimeout(sizePreview);
  sizePreview = 0;
  const p = canvasPoint(event);
  if (active && touches.size === 0) return;
  if (event.pointerType === 'touch') {
    if (gesture) return;
    touches.set(event.pointerId,p);
    if (touches.size === 2) {
      if (active) active = null;
      const pair = touchPair();
      gesture = { ...pair, anchor:artPoint(pair.center), zoom:view.zoom };
      canvas.setPointerCapture(event.pointerId);
      schedule();
      return;
    }
  }
  if (active) return;
  focusRegion = null;
  const point = artPoint(p);
  const r = regionAt(point);
  active = { id:event.pointerId, pointerType:event.pointerType, start:p, last:p, region:r, moved:false };
  canvas.setPointerCapture(event.pointerId);
  if ($('pan').getAttribute('aria-pressed') === 'true' ||
      (event.pointerType === 'touch' && $('pencil-only').checked && mode !== 'fill')) {
    active.pan = true;
    return;
  }
  if (mode === 'fill' || (mode === 'guided' && !r)) return;
  if ($('pencil-only').checked && event.pointerType !== 'pen') return;
  const brush = $('brush').value;
  active.stroke = {
    brush, size:Number($('size').value), opacity:Number($('opacity').value)/100,
    color:selected === 'custom' || (mode === 'free' && selected === null)
      ? $('custom').value : colors()[selected ?? r.slot],
    region: mode === 'guided' ? r.id : null, length:0,
    points:[{ ...point,...Painting.brushSample(event,brush) }],
  };
  schedule();
});
canvas.addEventListener('pointerleave', () => {
  brushHover = null;
  schedule();
});
canvas.addEventListener('pointermove', (event) => {
  if (event.pointerType !== 'touch') {
    brushHover = { clientX:event.clientX,clientY:event.clientY,pointerType:event.pointerType,
      pressure:event.pressure,tiltX:event.tiltX,tiltY:event.tiltY };
    if (!active && mode !== 'fill') schedule();
  }
  const p = canvasPoint(event);
  if (touches.has(event.pointerId)) touches.set(event.pointerId,p);
  if (gesture && touches.size >= 2) {
    const pair = touchPair();
    const zoom = Math.max(1,Math.min(4,gesture.zoom*pair.distance/Math.max(1,gesture.distance)));
    viewAt(zoom,pair.center,gesture.anchor);
    return;
  }
  if (!active || active.id !== event.pointerId) return;
  const { start,last,stroke } = active;
  active.moved ||= Math.hypot(p.x-start.x,p.y-start.y)>6;
  active.last = p;
  if (active.pan) setView(view.zoom,view.x+p.x-last.x,view.y+p.y-last.y);
  if (!stroke) return;
  const samples = event.getCoalescedEvents?.();
  for (const sample of samples?.length ? samples : [event]) {
    const point = artPoint(canvasPoint(sample));
    const previous = stroke.points.at(-1);
    const distance = Math.hypot(point.x-previous.x,point.y-previous.y);
    if (distance < .5) continue;
    if (stroke.region !== null && regionAt(point)?.id === stroke.region) stroke.length += Math.min(distance,12);
    stroke.points.push({ ...point,...Painting.brushSample(sample,stroke.brush) });
  }
  schedule();
});
function endPointer(event, canceled) {
  touches.delete(event.pointerId);
  if (!touches.size) gesture = null;
  if (!active || active.id !== event.pointerId) return;
  const action = active;
  active = null;
  if (action.stroke && (!canceled || event.pointerType === 'pen')) {
    announce('Brushstroke saved.');
    commit({ strokes:[...art().strokes,action.stroke] },action.stroke);
  } else if (!canceled && mode === 'fill' && !action.pan && !action.moved) {
    fill(action.region);
  }
  schedule();
}
canvas.addEventListener('pointerup', (event) => endPointer(event,false));
canvas.addEventListener('pointercancel', (event) => endPointer(event,true));
canvas.addEventListener('lostpointercapture', (event) => endPointer(event,true));

function pointTo(r) {
  viewAt(view.zoom,{x:crop.w/2,y:crop.h/2},r);
}
canvas.addEventListener('keydown', (event) => {
  if (page().blank) return;
  const delta = {ArrowLeft:-1,ArrowUp:-1,ArrowRight:1,ArrowDown:1}[event.key];
  if (delta) {
    event.preventDefault();
    const count = page().regions.length;
    focusRegion = ((focusRegion ?? (delta === 1 ? -1 : 0)) + delta + count) % count;
    const r = page().regions[focusRegion];
    pointTo(r);
    announce(`Region ${focusRegion+1} of ${count}. Color ${r.slot+1}, ${shadeName(r.slot).toLowerCase()}.`);
  } else if ((event.key === 'Enter' || event.key === ' ') && focusRegion !== null) {
    event.preventDefault();
    fill(page().regions[focusRegion]);
  }
});
canvas.onblur = () => { focusRegion = null; schedule(); };

$('undo').onclick = () => traverse(history,future);
$('redo').onclick = () => traverse(future,history);
$('reset').onclick = () => {
  if (active) return;
  commit(Painting.resetPainting(art()));
  announce('Painting reset. Undo to restore your work.');
  $('undo').focus({preventScroll:true});
};
$('zoom-in').onclick = () => zoomAt(view.zoom*1.3);
$('zoom-out').onclick = () => zoomAt(view.zoom/1.3 <= 1.01 ? 1 : view.zoom/1.3);
$('zoom-reset').onclick = () => setView(1,0,0);
function setPan(on) {
  $('pan').setAttribute('aria-pressed',String(on));
  canvas.classList.toggle('panning',on);
  schedule();
}
$('pan').onclick = () => {
  const on = $('pan').getAttribute('aria-pressed') !== 'true';
  setPan(on);
  announce(on ? 'Drag to move around the zoomed page.' : modeHelp[mode]);
};
$('modes').onclick = (event) => {
  if (!event.target.dataset.mode || active) return;
  mode = event.target.dataset.mode;
  paintingMode = mode;
  setPan(false);
  announce(modeHelp[mode]);
  update();
};
$('theme').replaceChildren(...Object.entries(palettes).map(([id,p])=>new Option(p.name,id)));
$('theme').onchange = (event) => {
  commit({ palette:event.target.value });
};
function addTipOption(id,tip) {
  $('brush').append(new Option(tip.name + ' · imported tip', id));
}
for (const [id,tip] of Object.entries(tips)) addTipOption(id,tip);
$('brush-file').onchange = async (event) => {
  const input = event.target;
  const file = input.files[0];
  if (!file) return;
  const status = $('import-status');
  input.disabled = true;
  status.textContent = 'Reading brush tip…';
  try {
    const tip = await BrushImport.readTip(file);
    let id = Object.keys(tips).find(key=>tips[key].mask===tip.mask && tips[key].name===tip.name);
    if (!id) {
      if (Object.keys(tips).length>=24) throw new Error('This studio can hold up to 24 imported tips.');
      id = 'tip-' + Date.now();
      tips[id] = tip;
      addTipOption(id,tip);
    }
    $('brush').value = id;
    status.textContent = 'Brush tip added. Try it on the page.';
    save();
  } catch (error) {
    status.textContent = error.message || 'Could not read this brush.';
  } finally {
    input.value = '';
    input.disabled = false;
  }
};
$('custom').oninput = () => { selected = 'custom'; renderSwatches(); schedule(); };
$('numbers').onchange = schedule;
$('outlines').onchange = schedule;
$('download').onclick = () => {
  if (dirty) render();
  const output = document.createElement('canvas');
  output.width = canvas.width;
  output.height = canvas.height;
  const out = output.getContext('2d');
  out.drawImage(cache,0,0);
  out.setTransform(crop.s,0,0,crop.s,-crop.x*crop.s,-crop.y*crop.s);
  if ($('outlines').checked) outlines(out,page(),pageKey === 'cut' && mode === 'free');
  output.toBlob((blob) => {
    if (!blob) {
      announce('Could not create the PNG. Try saving again.');
      return;
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = paintingName(pageKey).toLowerCase().replaceAll(' ','-')+'.png';
    link.click();
    setTimeout(()=>URL.revokeObjectURL(link.href),30_000);
  },'image/png');
};
document.addEventListener('keydown', (event) => {
  if ($('studio').hidden || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z' ||
      event.target.matches('input,textarea,select')) return;
  event.preventDefault();
  if (event.shiftKey) traverse(future,history);
  else traverse(history,future);
});

function fitCanvas() {
  const r = page().raster;
  const next = r ? { x:r.left, y:r.top, w:r.width, h:r.height } : { x:0, y:0, w:width, h:height };
  next.s = Math.sqrt(pixelBudget/(next.w*next.h));
  const w = Math.round(next.w*next.s), h = Math.round(next.h*next.s);
  crop = next;
  for (const c of [canvas,cache,wetLayer]) if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  canvas.style.setProperty('--ratio',String(next.w/next.h));
  wetStroke = null;
  dirty = true;
}
function openPage(key) {
  if (active || key === pageKey) return;
  pageKey = key;
  brushHover = null;
  mode = page().blank ? 'free' : paintingMode;
  history = [];
  future = [];
  selected = null;
  focusRegion = null;
  fitCanvas();
  setView(1,0,0);
  updatePage();
  save();
}
function updatePage() {
  $('title').textContent = paintingName(pageKey);
  canvas.setAttribute('aria-label',page().blank ? 'Blank canvas. Paint with a pointer or Apple Pencil.'
    : 'Painting canvas. Use arrow keys to select a region, Enter to fill it, or paint with a pointer.');
  announce(modeHelp[mode]);
  update();
}
const tiles = new Map();
let galleryFilter = 'all';
// Gallery selection (Select / Done), Procreate-style: tap tiles to pick them, then
// duplicate or delete. Deleting can be undone from the gallery message.
let selecting = false;
const chosen = new Set();
let undoDelete = null;
function syncSelection() {
  const select = $('select-art');
  select.setAttribute('aria-pressed',String(selecting));
  select.querySelector('span').textContent = selecting ? 'Done' : 'Select';
  $('selection-actions').hidden = !selecting;
  $('gallery').classList.toggle('selecting',selecting);
  $('gallery-count').hidden = selecting;
  $('blank-canvas').disabled = selecting;
  $('selection-count').textContent = chosen.size ? `${chosen.size} selected` : 'Tap paintings to select';
  $('duplicate').disabled = $('delete').disabled = !chosen.size;
  for (const [key,{button}] of tiles) {
    if (selecting) button.setAttribute('aria-pressed',String(chosen.has(key)));
    else button.removeAttribute('aria-pressed');
  }
}
function setSelecting(on) {
  selecting = on;
  chosen.clear();
  if (on) galleryMessage('');
  syncSelection();
}
function toggleChosen(key) {
  if (chosen.has(key)) chosen.delete(key); else chosen.add(key);
  syncSelection();
}
function galleryMessage(text, undo = null) {
  const message = $('gallery-message');
  message.replaceChildren(text);
  if (undo) {
    const button = document.createElement('button');
    button.className = 'gallery-action';
    button.textContent = 'Undo';
    button.onclick = undo;
    message.append(' ',button);
  }
}
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
function newCopyId() {
  let id;
  do id = 'copy-' + Array.from(crypto.getRandomValues(new Uint8Array(4)),b => b.toString(16).padStart(2,'0')).join('');
  while (Object.hasOwn(copies,id));
  return id;
}
function placeCopy(id) {
  const { source, number } = copies[id];
  const before = [...tiles.keys()].filter(k => k === source || (copies[k]?.source === source && copies[k].number < number));
  addPaintingButton(id,tiles.get(before.at(-1)).button);
}
function duplicateChosen() {
  // Keep gallery order, so copies of several paintings land in a predictable place.
  const keys = [...tiles.keys()].filter(key => chosen.has(key));
  for (const key of keys) {
    const source = sourceKey(key);
    const number = 1 + Math.max(0,...Object.values(copies).filter(c => c.source === source).map(c => c.number));
    const id = newCopyId();
    copies[id] = { source, number };
    if (library[key]) library[id] = structuredClone(library[key]);
    placeCopy(id);
  }
  setSelecting(false);
  filterGallery();
  save();
  galleryMessage(`Duplicated ${plural(keys.length,'painting')}.`);
}
function deleteChosen() {
  const keys = [...chosen];
  const before = { library:structuredClone(library), copies:{...copies}, removed:[...removed] };
  for (const key of keys) {
    delete library[key];
    if (copies[key]) {
      delete copies[key];
      tiles.get(key).button.remove();
      tiles.delete(key);
    } else if (key !== 'blank' && !removed.includes(key)) removed.push(key);
  }
  // The studio must not keep showing a deleted painting.
  if (keys.includes(pageKey)) {
    openPage('blank');
    history = [];
    future = [];
    dirty = true;
  }
  setSelecting(false);
  filterGallery();
  save();
  undoDelete = () => {
    library = before.library;
    copies = before.copies;
    removed = before.removed;
    for (const key of keys) if (copies[key] && !tiles.has(key)) placeCopy(key);
    for (const key of keys) if (tiles.has(key)) refreshTile(key);
    undoDelete = null;
    filterGallery();
    save();
    galleryMessage(`Restored ${plural(keys.length,'painting')}.`);
  };
  galleryMessage(`Deleted ${plural(keys.length,'painting')}.`,undoDelete);
}
$('select-art').onclick = () => setSelecting(!selecting);
$('duplicate').onclick = duplicateChosen;
$('delete').onclick = () => {
  const n = chosen.size;
  $('delete-question').textContent = `Delete ${plural(n,'painting')}?`;
  $('delete-dialog').showModal();
};
$('delete-dialog').addEventListener('close', () => {
  if ($('delete-dialog').returnValue === 'delete') deleteChosen();
  $('delete-dialog').returnValue = '';
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && selecting && !$('gallery').hidden && !$('delete-dialog').open) setSelecting(false);
});
let returnTarget = null;
function hasMarks(key) {
  const painting = library[key];
  return Boolean(painting && (Object.keys(painting.fills).length || painting.strokes.length));
}
function refreshTile(key) {
  const {preview,detail} = tiles.get(key);
  const sheet = sheetFor(key);
  const painting = library[key] || Painting.emptyPainting();
  const started = hasMarks(key);
  const thumb = preview.getContext('2d');
  thumb.setTransform(preview.width/width,0,0,preview.height/height,0,0);
  if (sheet.raster && !started && sheet.raster.image.naturalWidth) {
    // Show the illustration at shelf scale. Opening it reveals the entire sheet.
    const {image} = sheet.raster;
    const cropHeight = Math.min(image.naturalHeight,image.naturalWidth*height/width);
    const cropWidth = cropHeight*width/height;
    thumb.fillStyle = '#fffaf0';
    thumb.fillRect(0,0,width,height);
    thumb.save();
    thumb.globalCompositeOperation = 'multiply';
    thumb.drawImage(image,(image.naturalWidth-cropWidth)/2,(image.naturalHeight-cropHeight)*.38,cropWidth,cropHeight,0,0,width,height);
    thumb.restore();
  } else {
    paper(thumb,sheet,painting,!started && !sheet.raster);
    for (const stroke of painting.strokes) drawStroke(thumb,stroke,sheet);
    outlines(thumb,sheet);
  }
  const completed = completeIds(painting).size;
  detail.textContent = started ? (completed ? `${completed} of ${sheet.regions.length} shapes` : 'Brushwork in progress')
    : sheet.blank ? 'Freehand' : `${sheet.regions.length} shapes`;
}
function filterGallery() {
  let count = 0;
  for (const [key,{button}] of tiles) {
    const sheet = sheetFor(key);
    const started = hasMarks(key);
    button.hidden = removed.includes(key) || (sheet.blank && !started) ||
      (galleryFilter === 'started' && !started) ||
      (galleryFilter === 'glass' && !sheet.glass) ||
      (galleryFilter === 'illustration' && !sheet.raster);
    if (!button.hidden) count++;
  }
  $('gallery-count').textContent = count + (count === 1 ? ' painting' : ' paintings');
  $('empty-gallery').hidden = count > 0;
  for (const filter of $('filters').children) filter.setAttribute('aria-pressed',String(filter.dataset.filter===galleryFilter));
  for (const key of chosen) if (tiles.get(key)?.button.hidden) chosen.delete(key);
  syncSelection();
}
$('filters').onclick = (event) => {
  const filter = event.target.closest('[data-filter]');
  if (!filter) return;
  galleryFilter = filter.dataset.filter;
  filterGallery();
};
function enterStudio(key, trigger, push = true) {
  if (active) return;
  returnTarget = trigger;
  if (push) window.history.pushState({fromGallery:true},'','#painting/'+encodeURIComponent(key));
  openPage(key);
  setPan(false);
  $('studio').hidden = false;
  $('gallery').hidden = true;
  canvas.focus({preventScroll:true});
  schedule();
}
function addPaintingButton(key, after = null) {
  const sheet = sheetFor(key);
  const button = document.createElement('button');
  button.className = 'painting-button';
  button.dataset.page = key;
  const preview = document.createElement('canvas');
  preview.width = 576;
  preview.height = 432;
  preview.setAttribute('aria-hidden','true');
  const name = document.createElement('span');
  name.className = 'tile-name';
  name.textContent = paintingName(key);
  const detail = document.createElement('span');
  detail.className = 'tile-detail';
  button.append(preview,name,detail);
  button.onclick = () => selecting ? toggleChosen(key) : enterStudio(key,button);
  tiles.set(key,{button,preview,detail});
  if (after) after.after(button); else $('paintings').append(button);
  refreshTile(key);
  sheet.raster?.image.addEventListener('load', () => {
    refreshTile(key);
    if (page() === sheet) schedule();
  },{once:true});
}
const galleryOrder = ['woodland-watch','lantern-bay','woodland-tea','orchard','tree-of-ferns','high-pass','forest-medallion','lily-pond'];
for (const key of new Set([...galleryOrder,...Object.keys(paintings)])) {
  addPaintingButton(key);
  // Saved copies sit right after their original, oldest first.
  const own = Object.keys(copies).filter(id => copies[id].source === key).sort((a,b) => copies[a].number-copies[b].number);
  for (const id of own) addPaintingButton(id);
}
$('blank-canvas').onclick = () => enterStudio('blank',$('blank-canvas'));
filterGallery();
fitCanvas();
setView(1,0,0);
updatePage();

const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement;
function focusTools(show) {
  $('focus-menu').hidden = !show;
  $('focus-tools').setAttribute('aria-expanded',String(show));
}
async function exitNativeFullscreen() {
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  if (fullscreenElement() && exit) {
    try { await exit.call(document); } catch {}
  }
}
function syncFullscreen() {
  const expanded = Boolean(fullscreenElement()) || $('studio').classList.contains('immersive');
  const button = $('focus-enter');
  button.setAttribute('aria-label',expanded ? 'Exit full screen' : 'Full screen');
  button.title = button.getAttribute('aria-label');
  button.querySelector('use').setAttribute('href',expanded ? '#icon-collapse' : '#icon-expand');
}
function showGallery() {
  if (active) return;
  focusTools(false);
  brushHover = null;
  $('studio').classList.remove('immersive');
  exitNativeFullscreen();
  syncFullscreen();
  refreshTile(pageKey);
  filterGallery();
  $('studio').hidden = true;
  $('gallery').hidden = false;
  (returnTarget && !returnTarget.hidden ? returnTarget : $('filters').querySelector('[aria-pressed=true]')).focus({preventScroll:true});
}
$('focus-enter').onclick = async () => {
  const studio = $('studio');
  if (fullscreenElement()) await exitNativeFullscreen();
  else if (studio.classList.contains('immersive')) studio.classList.remove('immersive');
  else {
    try {
      const request = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
      await request.call(document.documentElement);
      if (studio.hidden) await exitNativeFullscreen();
    } catch {
      if (!studio.hidden) studio.classList.add('immersive');
    }
  }
  syncFullscreen();
};
function returnToGallery() {
  if (active) return;
  if (window.history.state?.fromGallery) window.history.back();
  else {
    window.history.replaceState(null,'',location.href.split('#')[0]);
    showGallery();
  }
}
function followLocation() {
  if (active) endPointer({pointerId:active.id,pointerType:active.pointerType},true);
  touches.clear();
  gesture = null;
  const key = location.hash.slice('#painting/'.length);
  if (location.hash.startsWith('#painting/') && tiles.has(key) && !removed.includes(key)) {
    enterStudio(key,tiles.get(key).button,false);
  } else if (!$('studio').hidden) showGallery();
}
window.addEventListener('popstate',followLocation);
followLocation();
$('focus-back').onclick = returnToGallery;
$('focus-tools').onclick = () => focusTools($('focus-menu').hidden);
function activateBrush() {
  setPan(false);
  if (mode === 'fill') {
    mode = paintingMode = 'guided';
    announce(modeHelp[mode]);
    update();
  }
}
$('brush').addEventListener('change',activateBrush);
for (const id of ['size','opacity']) {
  $(id).addEventListener('input', () => {
    activateBrush();
    if (id === 'size') {
      clearTimeout(sizePreview);
      sizePreview = setTimeout(() => {
        sizePreview = 0;
        schedule();
      },950);
      schedule();
    }
  });
}
document.addEventListener('pointerdown', (event) => {
  if ($('studio').hidden || $('focus-menu').hidden || event.target.closest('#focus-menu, #focus-tools')) return;
  focusTools(false);
}, true);
document.addEventListener('fullscreenchange',syncFullscreen);
document.addEventListener('webkitfullscreenchange',syncFullscreen);
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || $('studio').hidden) return;
  event.preventDefault();
  if (!$('focus-menu').hidden) {
    focusTools(false);
    $('focus-tools').focus({preventScroll:true});
  } else {
    if ($('studio').classList.contains('immersive') || fullscreenElement()) $('focus-enter').click();
    else returnToGallery();
  }
});
