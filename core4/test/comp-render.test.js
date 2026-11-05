'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { build } = require('../modules/comp-render/implementation');
const { compRenderProof, validateCompRenderCompletion } = require('../runtime/comp-render-proof');

const jsx = fs.readFileSync(path.join(__dirname, '../modules/comp-render/executor.jsx'), 'utf8');
function fixture(t, { missing = false, template = true, terminal = 'DONE' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-render-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'titles-output'));
  const input = { projectId: path.join(dir, 'own.aep'), compId: 7, controlledLayerIds: [20, 21], activeLayerId: 21,
    startFrame: 0, frameCount: 30, renderTemplate: 'Best Settings', outputTemplate: 'H264', fileName: 'variant.mp4' };
  class CompItem {}
  class FootageItem {}
  class File {
    constructor(value) { this.fsName = path.normalize(value); }
    get exists() { return fs.existsSync(this.fsName); }
    get length() { return fs.statSync(this.fsName).size; }
  }
  class Folder extends File {}
  const layers = [true, false].map((enabled, i) => ({ id: 20 + i, enabled,
    source: i && missing ? Object.assign(new FootageItem(), { footageMissing: true }) : undefined,
    property: () => ({ numProperties: 1 }) }));
  const comp = Object.assign(new CompItem(), { id: 7, name: 'Copy', comment: 'AE_CORE4_TEXT_WORKSPACE_V1', numLayers: 2,
    width: 800, height: 400, duration: 3, time: 1, frameDuration: 1 / 30, displayStartTime: 0, layer: i => layers[i - 1] });
  let active, observed, confirmation = 0, renderCalls = 0;
  const om = { templates: template ? ['H264'] : [], applyTemplate() {}, getSettings: () => ({ Format: 'H.264' }) };
  const queue = { rendering: false, get numItems() { return active ? 1 : 0; },
    item: () => active,
    items: { add: () => (active = { comp, templates: ['Best Settings'], outputModule: () => om, applyTemplate() {},
      remove() { active = null; } }) },
    render() {
      observed = layers.map(layer => layer.enabled);
      renderCalls++;
      comp.time = 2;
      fs.writeFileSync(om.file.fsName, 'fixture-media');
      active.status = terminal;
    },
  };
  const project = { file: { fsName: input.projectId, parent: { fsName: dir } }, itemByID: () => comp, renderQueue: queue };
  const host = vm.runInNewContext(jsx, { app: { project }, CompItem, FootageItem, File, Folder, GetSettingsFormat: { STRING: 1 },
    RQItemStatus: { DONE: 'DONE' }, PostRenderAction: { NONE: 'NONE' }, confirm: () => { confirmation++; return true; } });
  const plain = value => JSON.parse(JSON.stringify(value));
  const read = () => plain(host.inspect(input));
  const before = read();
  function run() {
    const p = build({ input, evidence: before }).input;
    compRenderProof.beforeReservation({ input });
    return plain(host.mutate({ ...p, _execution: { policyId: 'current-matching-target-after-local-confirmation-v1',
      baselineRevision: before.revision, baselineProtected: before.protected, target: before.target } }));
  }
  return { run, input, read, before, get observed() { return observed; }, get confirmation() { return confirmation; }, get renderCalls() { return renderCalls; } };
}

test('comp-render: only selected visibility reaches queue, then flags and queue are restored', t => {
  const env = fixture(t);
  const result = env.run();
  assert.equal(result.outcome, 'applied');
  assert.deepEqual(env.observed, [false, true]);
  assert.equal(env.renderCalls, 1);
  assert.deepEqual(env.read(), env.before);
  validateCompRenderCompletion({ input: env.input, before: env.before }, result.snapshot);
  assert.throws(() => env.run(), /comp_render_output_exists/);
});

test('comp-render: selected graph missing media is refused before confirmation', t => {
  const env = fixture(t, { missing: true });
  assert.deepEqual(env.run(), { outcome: 'rejected', code: 'comp_render_missing_footage' });
  assert.equal(env.confirmation, 0);
  assert.deepEqual(env.read(), env.before);
});

test('comp-render: unavailable template is rejected and its temporary item is removed', t => {
  const env = fixture(t, { template: false });
  assert.deepEqual(env.run(), { outcome: 'rejected', code: 'comp_render_template_unavailable' });
  assert.equal(env.renderCalls, 0);
  assert.deepEqual(env.read(), env.before);
});

test('comp-render: a dispatch without DONE remains uncertain even if bytes exist', t => {
  const env = fixture(t, { terminal: 'USER_STOPPED' });
  assert.deepEqual(env.run(), { outcome: 'unknown', code: 'comp_render_terminal' });
  assert.deepEqual(env.read(), env.before);
});
