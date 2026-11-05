'use strict';

function textEnvironment(state) {
  const fonts = ['Fixture-Regular', 'Fixture-Bold'].map(postScriptName => ({ postScriptName, isSubstitute: false }));
  class TextDocument {
    constructor(text) {
      this.text = text;
      this.pointText = true;
      this.lineOrientation = 1;
    }
    set text(value) {
      this.content = value;
      this.resetCharStyle();
    }
    get text() { return this.content; }
    resetCharStyle() {
      this.styles = Array.from(this.content, () => ({ fontObject: fonts[0], fontSize: 32, tracking: 0, applyFill: true, fillColor: [1, 1, 1], applyStroke: false }));
    }
    resetParagraphStyle() { this.justification = 1; }
    copy() {
      const next = new TextDocument(this.content);
      next.styles = this.styles.map(style => ({ ...style }));
      next.justification = this.justification;
      next.autoLeading = this.autoLeading;
      next.leading = this.leading;
      return next;
    }
    characterRange(start, end) {
      const styles = this.styles;
      return new Proxy({}, {
        get(_, key) { return styles[start][key]; },
        set(_, key, value) {
          for (let index = start; index < end; index++) styles[index][key] = value;
          return true;
        },
      });
    }
  }
  class CompItem {}
  const layerList = [{ id: 17, name: 'Template', comment: '', enabled: true, locked: true, solo: false }];
  const comp = Object.assign(new CompItem(), { id: 7, comment: 'AE_CORE4_TEXT_WORKSPACE_V1', displayStartTime: 0, pixelAspect: 1,
    name: 'Copy', width: 800, height: 450, time: 1, duration: 5, frameDuration: 0.04,
    guides: [{ orientationType: 1, position: 30 }, { orientationType: 0, position: 40 }],
    layer: index => layerList[index - 1],
  });
  Object.defineProperty(comp, 'numLayers', { get: () => layerList.length });
  const fixed = value => ({ value, numKeys: 0, isTimeVarying: false, expression: '', expressionEnabled: false, setValue(next) { this.value = next; } });
  let nextId = 40;
  comp.layers = {
    addText(text) {
      const doc = new TextDocument(text);
      const position = { ...fixed([400, 225, 0]), dimensionsSeparated: false };
      const source = { ...fixed(doc), get value() { return this.document.copy(); }, document: doc, setValue(next) { this.document = next.copy(); } };
      const transform = { 'ADBE Position': position, 'ADBE Anchor Point': fixed([0, 0, 0]), 'ADBE Scale': fixed([100, 100, 100]),
        'ADBE Rotate Z': fixed(0), 'ADBE Opacity': fixed(100) };
      const layer = { id: ++nextId, enabled: true, locked: false, parent: null, threeDLayer: false, threeDPerChar: false,
        hasTrackMatte: false, isTrackMatte: false, guideLayer: false, adjustmentLayer: false, solo: false, motionBlur: false, stretch: 100,
        sourceRectAtTime() { return { left: -50, top: -60, width: 100, height: 120 }; },
        property(key) {
          return { 'ADBE Text Properties': { property: key => key === 'ADBE Text Document' ? source : { numProperties: 0 } },
            'ADBE Transform Group': { property: key => transform[key] },
            'ADBE Layer Styles': { isModified: false, enabled: this.layerStyleEnabled === true },
            'ADBE Effect Parade': { numProperties: 0 }, 'ADBE Mask Parade': { numProperties: 0 } }[key];
        },
        remove() { layerList.splice(layerList.indexOf(layer), 1); },
      };
      layerList.unshift(layer);
      return layer;
    },
  };
  state.textFixture = { comp, layerList, fonts, undoDepth: 0 };
  return { CompItem, TextDocument, ParagraphJustification: { LEFT_JUSTIFY: 1, CENTER_JUSTIFY: 2, RIGHT_JUSTIFY: 3 }, LineOrientation: { HORIZONTAL: 1 },
    app: { project: { file: { fsName: state.projectId }, numItems: 1, item: () => comp },
      fonts: { getFontsByPostScriptName: name => fonts.filter(font => font.postScriptName === name) },
      beginUndoGroup() { state.textFixture.undoDepth++; }, endUndoGroup() { state.textFixture.undoDepth--; },
    },
  };
}

module.exports = { textEnvironment };
