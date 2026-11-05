'use strict';

function layoutEnvironment(state) {
  class CompItem {}
  const counts = { measureText: 0, applyText: 0, scale: 0, position: 0, undoDepth: 0 };
  const common = { numKeys: 0, isTimeVarying: false, expressionEnabled: false, expression: '' };
  const style = { font: 'FixtureSans', fontSize: 32, applyFill: true, fillColor: [1, 1, 1], applyStroke: false,
    strokeColor: undefined, strokeWidth: 2, strokeOverFill: false, tracking: 0, baselineShift: 0,
    horizontalScale: 100, verticalScale: 100, fauxBold: false, fauxItalic: false, tsume: 0, autoKernType: 1,
    fontCapsOption: 1, fontBaselineOption: 1, digitSet: 1, ligature: true, noBreak: false, leading: undefined, autoLeading: true };
  function layer(id, role) {
    const data = { text: 'BASE', anchor: role === 'apply' ? [2, -3, 0] : [0, 0, 0], scale: [100, 100, 100],
      position: [200, 100, 0], rotation: 0, parent: null, style: { ...style }, substitute: false, boundsBias: 0 };
    const layers = {
      id, comment: role === 'measure' ? 'AE_CORE4_TITLES_MEASURE_V1' : 'AE_CORE4_TITLES_LAYOUT_V1',
      enabled: role === 'apply', locked: false, threeDLayer: false, threeDPerChar: false, hasTrackMatte: false,
      isTrackMatte: false, adjustmentLayer: false, guideLayer: false, motionBlur: false, solo: false,
      startTime: 0, stretch: 100, inPoint: 0, outPoint: 5, get parent() { return data.parent; },
      sourceRectAtTime() {
        if (data.rectError && data.text !== 'BASE') throw new Error('simulated rect failure');
        const lines = data.text.split('\r');
        return { left: -3, top: -22, width: 10 * Math.max(...lines.map(text => text.length)) + data.boundsBias, height: 32 * lines.length };
      },
    };
    const transform = {
      'ADBE Anchor Point': { ...common, get value() { return data.anchor.slice(); } },
      'ADBE Position': { ...common, dimensionsSeparated: false, get value() { return data.position.slice(); }, setValue(value) { counts.position++; data.position = Array.from(value); } },
      'ADBE Scale': { ...common, get value() { return data.scale.slice(); }, setValue(value) { counts.scale++; data.scale = Array.from(value); } },
      'ADBE Rotate Z': { ...common, get value() { return data.rotation; } },
      'ADBE Opacity': { ...common, value: 100 },
    };
    const text = { ...common,
      get value() {
        return { text: data.text, pointText: true, lineOrientation: 1, paragraphCount: data.text.split('\r').length,
          fontObject: { isSubstitute: data.substitute, hasDesignAxes: false, fontID: 21, postScriptName: 'FixtureSans' },
          characterRange: () => ({ ...data.style }), justification: 1, direction: 1, composerEngine: 1,
          everyLineComposer: false, spaceBefore: 0, spaceAfter: 0, startIndent: 0, endIndent: 0, firstLineIndent: 0, leadingType: 1,
          baselineLocs: data.text.split('\r').flatMap((line, i) => [0, i * 32, line.length * 10, i * 32]),
        };
      },
      setValue(value) { counts[role + 'Text']++; data.text = value.text; },
    };
    layers.property = name => ({
      'ADBE Text Properties': { property: field => ({ 'ADBE Text Document': text, 'ADBE Text Animators': { numProperties: 0 } })[field] },
      'ADBE Effect Parade': { numProperties: 0 }, 'ADBE Mask Parade': { numProperties: 0 },
      'ADBE Layer Styles': { numProperties: 11, isModified: false },
      'ADBE Transform Group': { property: field => transform[field] },
    })[name];
    return { layer: layers, data };
  }
  const scratch = layer(103, 'measure'), output = layer(104, 'apply');
  const comp = Object.assign(new CompItem(), { id: 1, time: 1, width: 400, height: 240, pixelAspect: 1, numLayers: 2,
    layer: index => [scratch.layer, output.layer][index - 1] });
  state.layout = { scratch: scratch.data, output: output.data, counts, comp };
  return { CompItem, LineOrientation: { HORIZONTAL: 1 }, AutoKernType: { METRIC_KERN: 1, OPTICAL_KERN: 2, NO_AUTO_KERN: 3 },
    app: { project: { file: { fsName: state.projectId }, numItems: 1, item: () => comp },
      beginUndoGroup() { counts.undoDepth++; }, endUndoGroup() { counts.undoDepth--; } } };
}

module.exports = { layoutEnvironment };
