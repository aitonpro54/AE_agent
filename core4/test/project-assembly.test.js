'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { buildPackage } = require('../tools/package-installable');
const { harness } = require('./fixtures/manual-http-runtime');

const photo = 'C:/fixture/Фото на входе.jpg';
function assemblyEnvironment(state) {
  const rootFolder = { id: 0 };
  const photoFiles = new Map([[photo, { length: 100, modified: new Date(1000) }]]);
  state.photoFiles = photoFiles;
  let next = 20;
  class File {
    constructor(fsName) {
      Object.assign(this, { fsName, exists: photoFiles.has(fsName) }, photoFiles.get(fsName));
    }
  }
  class ImportOptions {
    constructor(file) { this.file = file; }
    canImportAs(kind) { return kind === 1; }
  }
  class FootageItem {
    constructor(file) {
      Object.assign(this, { file, name: file.fsName.split('/').at(-1), id: ++next, parentFolder: rootFolder,
        mainSource: { isStill: true }, hasVideo: true });
    }
  }
  class CompItem {
    constructor(name, width, height, pixelAspect, duration, fps) {
      const frameDuration = fps === 29.97 ? 1001 / 30000 : 1 / fps;
      Object.assign(this, { name, width, height, pixelAspect, duration, frameDuration, id: ++next, parentFolder: rootFolder });
      this.stack = [];
      this.layers = { add: source => {
        const layer = { id: ++next, source, enabled: true };
        this.stack.unshift(layer);
        return layer;
      } };
    }
    get numLayers() { return this.stack.length; }
    layer(i) { return this.stack[i - 1]; }
  }
  const existing = new CompItem('Existing', 640, 360, 1, 5, 24);
  const items = [existing];
  state.items = items;
  const project = {
    file: { fsName: state.projectId, exists: true },
    get numItems() { return items.length; },
    item(i) { return items[i - 1]; },
    items: { addComp(...args) { const comp = new CompItem(...args); items.push(comp); return comp; } },
    importFile(options) {
      assert.equal(options.importAs, 1);
      assert.equal(options.sequence, false);
      if (state.flags.importThrows) throw new Error('fixture import failure');
      const source = new FootageItem(options.file);
      items.push(source);
      return source;
    }
  };
  return { app: { project, beginUndoGroup() {}, endUndoGroup() {} }, CompItem, FootageItem, ImportOptions, File, ImportAsType: { FOOTAGE: 1 } };
}

const moduleId = 'project-assembly';
function request(h) {
  const { contractId } = h.broker.getContract({ moduleId });
  const target = { projectId: h.state.projectId, sessionId: h.installation.installationId };
  const input = { ...target, name: 'Сборка', width: 640, height: 360, fps: 24, durationFrames: 72, layers: [
    { name: 'Фото', file: photo, inFrame: 12, outFrame: 72 },
    { name: 'Подложка', sourceId: h.state.items[0].id, inFrame: 0, outFrame: 48 }
  ] };
  const inspect = (at = target) => h.broker.inspect({ moduleId, contractId, target: at });
  const build = (evidence, desired = input) => h.broker.build({ oneStep: true, steps: [
    { stepId: 'assemble', moduleId, contractId, evidenceRef: evidence.evidenceRef, input: desired }
  ] });
  const proposal = async (desired = input) => {
    const plan = await build(await inspect(), desired);
    const proposed = h.broker.propose({ buildId: plan.buildId });
    const dry = await h.broker.dryrun({ proposalId: proposed.proposalId });
    return { proposalId: proposed.proposalId, dryrunRef: dry.dryrunRef, taskId: plan.taskId };
  };
  return { target, input, inspect, build, proposal };
}

test('project-assembly is opt-in and builds a deterministic fixed ES3 registry', () => {
  const selected = buildPackage(undefined, 'manual-project-assembly', { runtimeModel: 'owner' });
  assert.equal(buildPackage(undefined, 'manual-project-assembly', { runtimeModel: 'owner' }).packageHash, selected.packageHash);
  const old = buildPackage(undefined, 'manual-titles-variants', { runtimeModel: 'owner' });
  assert.equal(old.files['modules/project-assembly/executor.jsx'], undefined);
  const parser = "const fs=require('node:fs'),acorn=require('internal/deps/acorn/acorn/dist/acorn');acorn.parse(fs.readFileSync(0,'utf8'),{ecmaVersion:3,allowReserved:'never'});";
  const parsed = spawnSync(process.execPath, ['--expose-internals', '-e', parser], {
    input: Buffer.from(selected.files['cep/jsx/registry.jsx'], 'base64'), encoding: 'utf8', windowsHide: true
  });
  assert.equal(parsed.status, 0, parsed.stderr);
});

test('project-assembly builds through the broker and confirms exact input before one signed mutation', async t => {
  const h = await harness({ assemblyEnvironment, confirm: ({ message }) => {
    assert.match(message, /Сборка/);
    assert.ok(message.includes(photo) && message.includes('#21 Existing'));
    return true;
  } });
  t.after(() => h.close());
  const flow = request(h), before = await flow.inspect(), payload = await flow.proposal();
  const result = await h.broker.run(payload);
  assert.equal(result.state, 'succeeded', JSON.stringify(result));
  const after = (await flow.inspect()).snapshot;
  assert.deepEqual(after.items.filter(item => item.id === before.snapshot.items[0].id), before.snapshot.items);
  assert.deepEqual(after.assemblies[0].layers.map(layer => [layer.name, layer.inPoint, layer.outPoint]),
    [['Фото', 0.5, 3], ['Подложка', 0, 2]]);
  assert.equal(h.confirmations, 1);
  assert.equal(h.broker.ledger.commands()[0].verificationKind, 'local-transaction-receipt');
  await assert.rejects(flow.build(await flow.inspect()), /assembly_composition_name_or_duration/);
  assert.equal(h.state.items.length, 3);
});

test('project-assembly rejects unsafe input, wrong session, cancellation and drift before mutation', async t => {
  let decision = 'cancel';
  const h = await harness({ assemblyEnvironment, confirm: ({ state }) => {
    if (decision === 'drift') {
      state.photoFiles.get(photo).length++;
      return true;
    }
    return false;
  } });
  t.after(() => h.close());
  const flow = request(h), evidence = await flow.inspect();
  await assert.rejects(flow.inspect({ ...flow.target, sessionId: 'wrong' }), /assembly_work_session_changed/);
  for (const file of ['relative.jpg', 'C:/fixture/../other.jpg', 'C:/fixture/NUL.png']) {
    await assert.rejects(flow.build(evidence, { ...flow.input, layers: [{ ...flow.input.layers[0], file }] }), /assembly_import_path/);
  }
  for (const [choice, code] of [['cancel', 'local_cancelled'], ['drift', 'assembly_source_changed']]) {
    decision = choice;
    const result = await h.broker.run(await flow.proposal());
    assert.equal(result.code, 'executor_rejected', JSON.stringify(result));
    assert.equal(result.message, code);
    assert.equal(h.state.items.length, 1);
  }
});

test('project-assembly partial native failure is UNKNOWN and cannot replay', async t => {
  const h = await harness({ assemblyEnvironment, flags: { importThrows: true }, callbackTimeout: 350 });
  t.after(() => h.close());
  const flow = request(h);
  await h.broker.run(await flow.proposal());
  assert.equal(h.broker.ledger.commands()[0].state, 'UNKNOWN');
  assert.equal(h.state.items.length, 2);
  await assert.rejects(flow.proposal(), /controller_unresolved/);
  assert.equal(h.state.items.length, 2);
});

test('project-assembly creates empty compositions and places layers on the actual fractional frame grid', async t => {
  const h = await harness({ assemblyEnvironment });
  t.after(() => h.close());
  const flow = request(h), { input } = flow;
  const empty = { ...input, name: 'Empty', fps: 29.97, layers: [] };
  assert.equal((await h.broker.run(await flow.proposal(empty))).state, 'succeeded');
  const populated = { ...input, fps: 29.97 };
  assert.equal((await h.broker.run(await flow.proposal(populated))).state, 'succeeded');
  const [first, second] = (await flow.inspect()).snapshot.assemblies;
  const frame = 1001 / 30000;
  assert.equal(first.layers.length, 0);
  assert.equal(second.duration, input.durationFrames * frame);
  assert.deepEqual(second.layers.map(layer => [layer.inPoint, layer.outPoint]),
    [[12 * frame, 72 * frame], [0, 48 * frame]]);
});
