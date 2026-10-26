'use strict';
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { createReceiver } = require('../../core/receiver');
const { decode } = require('../../protocol/codec');
function initialState() {
  return { sessionId: 'synthetic-session', projectId: 'C:/fixture/project.aep', photoSourceId: 11, text: 'Before', counts: { photo: 0, titles: 0 }, completed: {}, style: { font: 'ArialMT', fontSize: 32, applyFill: true, fillColor: [1, 1, 1], applyStroke: false, strokeColor: [0, 0, 0], strokeWidth: 0, tracking: 0, baselineShift: 0, horizontalScale: 100, verticalScale: 100, fauxBold: false, fauxItalic: false, justification: 0, leading: 38, autoLeading: false }, transform: { anchor: [0, 0], position: [400, 300], scale: [100, 100], rotation: 0, opacity: 100 }, time: { startTime: 0, inPoint: 0, outPoint: 5, stretch: 100 }, flags: {} };
}
function environment(state, persist) {
  class FootageItem { constructor(id, still = true) { this.id = id; this.mainSource = { isStill: still }; } }
  class CompItem { constructor(id, layers) { this.id = id; this.numLayers = layers.length; this.layer = n => layers[n - 1]; } }
  const sources = [new FootageItem(11), new FootageItem(12), new FootageItem(13, false)];
  const property = value => ({ value, numKeys: 0, isTimeVarying: false, expressionEnabled: false, expression: '' });
  const names = { 'ADBE Anchor Point': 'anchor', 'ADBE Position': 'position', 'ADBE Scale': 'scale', 'ADBE Rotate Z': 'rotation', 'ADBE Opacity': 'opacity' };
  const photo = { id: 101, locked: false, enabled: true, threeDLayer: false, timeRemapEnabled: !!state.flags.timeRemap, ...state.time,
    source: sources.find(s => s.id === state.photoSourceId),
    property: name => name === 'ADBE Transform Group' ? { property: p => property(state.transform[names[p]]) } : null,
    replaceSource(source, fixExpressions) {
      if (fixExpressions !== false) throw new Error('fixExpressions forbidden');
      state.photoSourceId = source.id; state.counts.photo++; photo.source = source;
      if (state.flags.damageTransform) state.transform.position = [1, 2];
      persist(); if (state.flags.photoSetterThrows) throw new Error('setter mutated then threw');
    }
  };
  function document() {
    const doc = { text: state.text, ...JSON.parse(JSON.stringify(state.style)) };
    if (!state.flags.noCharacterRange) doc.characterRange = i => ({ ...state.style, ...(state.flags.mixed && i > 0 ? { fontSize: 99 } : {}) });
    return doc;
  }
  const textProperty = { numKeys: state.flags.animated ? 1 : 0, isTimeVarying: !!state.flags.animated, expressionEnabled: !!state.flags.expression, expression: state.flags.expression ? 'unsafe' : '',
    get value() { return document(); },
    setValue(doc) { state.text = doc.text; state.counts.titles++; if (state.flags.damageStyle) state.style.fontSize++; persist(); if (state.flags.textSetterThrows) throw new Error('setter mutated then threw'); }
  };
  const title = { id: 102, locked: false, property: name => name === 'ADBE Text Properties' ? { property: name => name === 'ADBE Text Document' ? textProperty : null } : null };
  const comp = new CompItem(1, [photo, title]); const items = [comp, ...sources];
  return { app: { project: { file: { fsName: state.projectId }, numItems: items.length, item: n => items[n - 1] } }, CompItem, FootageItem, AE_CORE_SESSION_ID: state.sessionId };
}
function fixtureTransport({ root, state = initialState(), stateFile, beforeEvaluate, afterEvaluate, loseAck = () => false, completionOverride, selectedModules = ['photo-placeholder', 'titles'] } = {}) {
  if (stateFile && fs.existsSync(stateFile)) state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  let receiver, channel; let sends = 0;
  const persist = () => {
    if (!stateFile) return; fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    const fd = fs.openSync(stateFile, 'w'); try { fs.writeSync(fd, JSON.stringify(state)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  };
  const store = { has: id => !!state.completed[id], get: id => state.completed[id], set(id, value) { state.completed[id] = value; persist(); } };
  return {
    get state() { return state; }, get sends() { return sends; }, persist,
    reopenSamePath() { state.sessionId = state.sessionId + '-reopened'; persist(); },
    async connect(binding) {
      channel = binding;
      const admittedExecutors = selectedModules.map(moduleId => {
        const record = JSON.parse(fs.readFileSync(path.join(root, 'config/admissions/' + moduleId + '.json')));
        return { moduleId, operationId: record.operationId, executorHash: record.executorHash, source: fs.readFileSync(path.join(root, 'modules/' + moduleId + '/executor.jsx'), 'utf8') };
      });
      receiver = createReceiver({ ...binding, admittedExecutors, completionStore: store, evaluate: async ({ source, phase, payload, command }) => {
        if (beforeEvaluate) await beforeEvaluate({ state, phase, payload, command, persist });
        const context = vm.createContext(environment(state, persist));
        const executor = new vm.Script(source).runInContext(context, { timeout: 1000 });
        context.executor = executor; context.input = JSON.parse(JSON.stringify(payload)); context.phase = phase;
        const result = new vm.Script('executor[phase](input)').runInContext(context, { timeout: 1000 });
        if (afterEvaluate) await afterEvaluate({ state, phase, payload, command, result, persist });
        persist(); return JSON.parse(JSON.stringify(result));
      } });
      return { sessionBinding: { kind: 'project-incarnation', lifecycleVerified: true, sessionId: state.sessionId, projectId: state.projectId, provenance: 'synthetic-project-lifecycle' } };
    },
    async disconnect() {},
    async send(frame) {
      sends++; const command = decode(frame, channel.secret); const result = await receiver.receive(frame);
      if (loseAck(command)) throw new Error('synthetic_lost_ack'); return result;
    },
    async completion(commandId) { if (completionOverride) return completionOverride(commandId, channel, receiver); return receiver.completion(commandId); }
  };
}
module.exports = { initialState, environment, fixtureTransport };
