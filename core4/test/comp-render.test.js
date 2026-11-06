'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { build } = require('../modules/comp-render/implementation');
const { createRenderProof, validateRenderResult } = require('../runtime/comp-render-proof');
const { proof: compRenderProof, validateResult: validateCompRenderCompletion } = createRenderProof(require('../modules/comp-render/completion.json'));

const jsx = fs.readFileSync(path.join(__dirname, '../modules/comp-render/executor.jsx'), 'utf8');
function fixture(t, { missing = false, template = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'core4-render-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, 'titles-output'));
  const input = { mode: 'stage', projectId: path.join(dir, 'own.aep'), compId: 7, controlledLayerIds: [20, 21], activeLayerId: 21,
    startFrame: 0, frameCount: 30, renderTemplate: 'Best Settings', outputTemplate: 'H264', fileName: 'variant.mp4' };
  class CompItem {}
  class FootageItem {}
  class File {
    constructor(value) { this.fsName = path.normalize(value); }
    get exists() { return fs.existsSync(this.fsName); }
    get length() { return fs.statSync(this.fsName).size; }
  }
  class Folder extends File {}
  const layers = [true, false].map((enabled, i) => ({ id: 20 + i, enabled, name: 'Text ' + i,
    source: i && missing ? Object.assign(new FootageItem(), { footageMissing: true }) : undefined,
    property: () => ({ numProperties: 1 }) }));
  const comp = Object.assign(new CompItem(), { id: 7, name: 'Copy', comment: 'AE_CORE4_TEXT_WORKSPACE_V1', numLayers: 2,
    width: 800, height: 400, duration: 3, time: 1, frameDuration: 1 / 30, displayStartTime: 0, layer: i => layers[i - 1] });
  let copy, active, confirmation = 0, quality = 'Best', fileTemplate = 'variant.[fileExtension]';
  const confirmations = [];
  comp.duplicate = () => {
    const clone = layers.map(layer => ({ ...layer, id: layer.id + 10 }));
    copy = Object.assign(new CompItem(), comp, { id: 8, usedIn: [], layer: i => clone[i - 1], remove() { copy = null; } });
    return copy;
  };
  const om = { templates: template ? ['H264'] : [], applyTemplate() {}, getSettings: () => ({ Format: 'H.264', 'Output File Info': { 'File Template': fileTemplate } }) };
  const queue = { rendering: false, get numItems() { return active ? 1 : 0; }, item: () => active,
    items: { add: staged => (active = { comp: staged, templates: ['Best Settings'], outputModule: () => om,
      numOutputModules: 1, applyTemplate() {}, getSettings: () => ({ Quality: quality }),
      get render() { return this.status === 1; }, set render(value) { this.status = value ? 1 : 2; },
      remove() { active = null; } }) },
    render() { assert.fail('render must not run in a CEP command'); },
  };
  const project = { file: { fsName: input.projectId, parent: { fsName: dir } }, renderQueue: queue,
    get numItems() { return copy ? 2 : 1; },
    itemByID(id) {
      if (id === comp.id) return comp;
      if (copy && id === copy.id) return copy;
      throw new Error('Item Not Found');
    } };
  const host = vm.runInNewContext(jsx, { app: { project }, CompItem, FootageItem, File, Folder,
    GetSettingsFormat: { STRING: 1, STRING_SETTABLE: 2 }, RQItemStatus: { QUEUED: 1, DONE: 3 }, PostRenderAction: { NONE: 0 },
    confirm: message => { confirmation++; confirmations.push(message.split('\n')[0]); return true; } });
  const plain = value => JSON.parse(JSON.stringify(value));
  const read = () => plain(host.inspect(input));
  const original = read();
  function run(patch = {}) {
    const before = read(), desired = { ...input, ...patch };
    const p = build({ input: desired, evidence: before }).input;
    compRenderProof.beforeReservation({ input: p, before });
    const result = plain(host.mutate({ ...p, _execution: { policyId: 'current-matching-target-after-local-confirmation-v1',
      baselineRevision: before.revision, baselineProtected: before.protected, target: before.target } }));
    if (result.outcome === 'applied') validateCompRenderCompletion({ input: p, before }, result.snapshot);
    return result;
  }
  function finish(status, resolvedTemplate = 'variant.mp4') {
    assert.equal(active.status, 1);
    fs.writeFileSync(om.file.fsName, 'fixture-media');
    active.status = status;
    if (status === 3) fileTemplate = resolvedTemplate;
  }
  return { run, read, original, finish, confirmations, changeQuality: () => { quality = 'Draft'; },
    get copy() { return copy; }, get confirmation() { return confirmation; } };
}

test('comp-render: stage, native completion and scoped cleanup leave source visibility and the rest of the queue intact', t => {
  const env = fixture(t);
  const stage = env.run();
  assert.equal(stage.outcome, 'applied');
  assert.deepEqual([env.copy.layer(1).enabled, env.copy.layer(2).enabled], [false, true]);
  assert.deepEqual(env.read().layers, env.original.layers);
  assert.throws(() => env.run(), /comp_render_queue_busy/);
  assert.throws(() => env.run({ mode: 'finalize', jobCompId: 8 }), /comp_render_job/);
  env.finish(3);
  assert.throws(() => env.run({ mode: 'finalize', jobCompId: 8, activeLayerId: 20 }), /comp_render_job/);
  const finalize = env.run({ mode: 'finalize', jobCompId: 8 });
  assert.equal(finalize.snapshot.render.status, 'DONE');
  assert.equal(env.copy, null);
  assert.deepEqual(env.read(), env.original);
  assert.deepEqual(env.confirmations, ['Подготовить единственное задание в очереди AE', 'Подтвердить DONE и удалить временное задание и копию']);
  assert.throws(() => env.run(), /comp_render_output_exists/);
});

test('comp-render: selected graph missing media is refused before confirmation', t => {
  const env = fixture(t, { missing: true });
  assert.deepEqual(env.run(), { outcome: 'rejected', code: 'comp_render_missing_footage' });
  assert.equal(env.confirmation, 0);
  assert.deepEqual(env.read(), env.original);
});

test('comp-render: unavailable template removes both temporary objects', t => {
  const env = fixture(t, { template: false });
  assert.deepEqual(env.run(), { outcome: 'rejected', code: 'comp_render_template_unavailable' });
  assert.equal(env.copy, null);
  assert.deepEqual(env.read(), env.original);
});

test('comp-render: incomplete output can be discarded without deleting bytes or claiming DONE', t => {
  const env = fixture(t);
  const { snapshot: { job } } = env.run();
  env.finish(2);
  assert.throws(() => env.run({ mode: 'finalize', jobCompId: 8 }), /comp_render_job/);
  const discard = env.run({ mode: 'discard', jobCompId: 8 });
  assert.equal(discard.outcome, 'applied');
  assert.equal(discard.snapshot.render, undefined);
  assert.equal(fs.readFileSync(job.file, 'utf8'), 'fixture-media');
  assert.deepEqual(env.read(), env.original);
});

test('comp-render: changed native settings invalidate the staged job', t => {
  const env = fixture(t);
  env.run();
  env.changeQuality();
  assert.throws(env.read, /comp_render_job_binding/);
});

test('comp-render: DONE allows AE to resolve only the staged filename placeholder', t => {
  const env = fixture(t);
  env.run();
  env.finish(3, 'wrong.mp4');
  assert.throws(env.read, /comp_render_job_binding/);
});

test('comp-render: a forged result and an unsafe host filename fail independently', t => {
  const env = fixture(t);
  const { snapshot } = env.run();
  const { file, fileName, activeLayerId, controlledLayerIds, startFrame, frameCount, renderTemplate, outputTemplate } = snapshot.job;
  const input = { mode: 'stage', compId: 7, fileName, activeLayerId, controlledLayerIds, startFrame, frameCount, renderTemplate, outputTemplate };
  assert.throws(() => validateRenderResult({ input, before: env.original }, { ...snapshot, job: { ...snapshot.job, file: file + '.forged' } }, { file, format: 'H.264' }), /comp_render_stage_result/);
  assert.throws(() => compRenderProof.beforeReservation({ input: { ...input, projectId: path.join(path.dirname(path.dirname(file)), 'own.aep'), fileName: '../unsafe.mp4' }, before: env.original }), /comp_render_output$/);
});
