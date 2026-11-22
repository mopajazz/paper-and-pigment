const Painting = (() => {
  function emptyPainting() {
    return { palette: null, fills: {}, strokes: [] };
  }

  function resetPainting(painting) {
    const reset = { ...emptyPainting(), palette:painting.palette };
    if (painting.regions != null) reset.regions = painting.regions;
    return reset;
  }

  function applyEdit(painting, edit) {
    return { ...painting, ...edit };
  }

  function fillColor(painting, region, colors) {
    const fill = painting.fills[region];
    return typeof fill === 'number' ? colors[fill] : fill;
  }

  function brushSample(event, brush) {
    const pen = event.pointerType === 'pen';
    const force = pen && event.pressure > 0 ? event.pressure : .5;
    const tilt = pen ? Math.min(1, Math.hypot(event.tiltX || 0, event.tiltY || 0) / 75) : 0;
    return {
      width: (.4 + force * 1.2) * (1 + tilt * (brush === 'pencil' ? 1.7 : .4)),
      opacity: brush === 'ink' ? .9 : .27 + force * .7,
    };
  }

  function brushRadius(size, sample, brush) {
    return Math.max(.55,size*sample.width*(brush === 'ink' ? .15 : .5));
  }

  // Carry saved work over to re-numbered regions. `migrations` comes from
  // tools/number-regions.js and holds one map per earlier numbering, keyed by its version:
  // fills maps an old region id to the new ids inside it; strokes maps it to one new id.
  // Work saved against a numbering with no map cannot be placed, so its fills are cleared.
  function migrateRegions(painting, migrations, version) {
    const from = painting.regions ?? 1;
    if (from === version) return painting;
    const legacy = migrations?.[from];
    const usable = Boolean(legacy);
    const fills = {};
    if (usable) {
      for (const [id, value] of Object.entries(painting.fills || {})) {
        for (const next of legacy.fills[id] || []) fills[next] = value;
      }
    }
    const strokes = (painting.strokes || []).map(stroke => {
      if (stroke.region == null) return stroke;
      const next = usable ? legacy.strokes[stroke.region] : undefined;
      return { ...stroke, region: next ?? null };
    });
    return { ...painting, fills, strokes, regions: version };
  }

  return { emptyPainting, resetPainting, applyEdit, fillColor, brushSample, brushRadius, migrateRegions };
})();
if (typeof module !== 'undefined') module.exports = Painting;
