const Painting = (() => {
  function emptyPainting() {
    return { palette: null, fills: {}, strokes: [] };
  }

  function resetPainting(painting) {
    return { ...emptyPainting(), palette:painting.palette };
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

  return { emptyPainting, resetPainting, applyEdit, fillColor, brushSample, brushRadius };
})();
if (typeof module !== 'undefined') module.exports = Painting;
