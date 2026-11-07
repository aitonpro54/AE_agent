'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { hash } = require('../protocol/json');
const { buildPackage } = require('../tools/package-installable');
const { harness } = require('./fixtures/manual-http-runtime');

const original = Buffer.concat([Buffer.from('RIFX'), Buffer.from(Array.from({ length: 70000 }, (_, index) => index % 256))]);
const revised = Buffer.concat([original, Buffer.from('changed')]);

function saveEnvironment(state) {
  fs.writeFileSync(state.projectId, original);
  state.saves = 0;
  class File {
    constructor(file) { this.fsName = path.normalize(file); this.offset = 0; }
    get exists() { return fs.existsSync(this.fsName); }
    get modified() {
      const { mtimeMs } = fs.statSync(this.fsName);
      return new Date(state.flags.nativeSeconds ? Math.floor(mtimeMs / 1000) * 1000 : Math.round(mtimeMs));
    }
    get length() { return fs.statSync(this.fsName).size; }
    open(mode) { assert.equal(mode, 'r'); assert.equal(this.encoding, 'BINARY'); this.fd = fs.openSync(this.fsName, 'r'); return true; }
    seek(offset, mode) { assert.equal(mode, 0); this.offset = offset; return true; }
    read(count) {
      const data = Buffer.alloc(count), read = fs.readSync(this.fd, data, 0, count, this.offset);
      this.offset += read;
      return data.toString('latin1', 0, read);
    }
    close() { fs.closeSync(this.fd); }
  }
  const project = {
    get file() { return new File(state.projectId); }, revision: 7, dirty: true,
    save() {
      state.saves++;
      fs.writeFileSync(state.projectId, revised);
      this.dirty = false;
      if (state.flags.damageCheckpoint) {
        const root = path.join(state.stateDir, 'project-save-checkpoints');
        fs.writeFileSync(path.join(root, fs.readdirSync(root)[0]), 'changed checkpoint');
      }
      return !state.flags.saveReturnsFalse;
    }
  };
  state.project = project;
  return { app: { project }, File };
}

async function flow(t, options = {}) {
  const h = await harness({ saveEnvironment, ...options });
  t.after(() => h.close());
  const moduleId = 'project-save', { contractId } = h.broker.getContract({ moduleId });
  const target = { projectId: h.state.projectId, sessionId: h.installation.installationId };
  const inspect = (at = target) => h.broker.inspect({ moduleId, contractId, target: at });
  async function prepare() {
    const evidence = await inspect();
    const build = await h.broker.build({ oneStep: true, steps: [{ stepId: 'save', moduleId, contractId, evidenceRef: evidence.evidenceRef, input: target }] });
    const proposed = h.broker.propose({ buildId: build.buildId });
    const dry = await h.broker.dryrun({ proposalId: proposed.proposalId });
    return { proposalId: proposed.proposalId, dryrunRef: dry.dryrunRef, taskId: build.taskId };
  }
  return { h, target, inspect, prepare };
}

test('project-save is opt-in and ships in the fixed ES3 registry', () => {
  const options = { runtimeModel: 'owner' };
  const selected = buildPackage(undefined, 'manual-project-save', options);
  assert.equal(buildPackage(undefined, 'manual-project-save', options).packageHash, selected.packageHash);
  assert.equal(buildPackage(undefined, 'manual-project-assembly', options).files['modules/project-save/executor.jsx'], undefined);
  const parser = "const fs=require('node:fs'),acorn=require('internal/deps/acorn/acorn/dist/acorn');acorn.parse(fs.readFileSync(0,'utf8'),{ecmaVersion:3,allowReserved:'never'});";
  const parsed = spawnSync(process.execPath, ['--expose-internals', '-e', parser], {
    input: Buffer.from(selected.files['cep/jsx/registry.jsx'], 'base64'), encoding: 'utf8', windowsHide: true
  });
  assert.equal(parsed.status, 0, parsed.stderr);
});

test('project-save verifies a durable checkpoint before one native save and records a fresh disk read', async t => {
  const f = await flow(t, { flags: { nativeSeconds: true }, confirm: ({ message, state }) => {
    assert.ok(message.includes(state.projectId));
    const files = fs.readdirSync(path.join(state.stateDir, 'project-save-checkpoints'));
    assert.equal(files.length, 1);
    const checkpoint = path.join(state.stateDir, 'project-save-checkpoints', files[0]);
    assert.ok(message.includes(checkpoint));
    assert.deepEqual(fs.readFileSync(checkpoint), original);
    return true;
  } });
  const before = (await f.inspect()).snapshot;
  assert.equal(before.dirty, true);
  assert.equal(before.savedFileSha256, hash(original));
  const result = await f.h.broker.run(await f.prepare());
  assert.equal(result.state, 'succeeded', JSON.stringify(result));
  assert.equal(f.h.state.saves, 1);
  const command = f.h.broker.ledger.commands()[0];
  const { checkpoint, ...after } = command.after;
  assert.equal(checkpoint.sha256, before.savedFileSha256);
  assert.equal(checkpoint.scope, 'on-disk-before-save');
  assert.deepEqual(fs.readFileSync(checkpoint.path), original);
  assert.equal(after.savedFileSha256, hash(revised));
  assert.equal(after.dirty, false);
  assert.deepEqual((await f.inspect()).snapshot, after);
});

test('project-save refuses a foreign session, an old proposal and a changed project during confirmation', async t => {
  let mode = 'cancel';
  const f = await flow(t, { confirm: ({ state }) => {
    if (mode === 'cancel') return false;
    state.project.revision++;
    return true;
  } });
  await assert.rejects(f.inspect({ ...f.target, sessionId: 'wrong' }), /save_work_session_changed/);
  const stale = await f.prepare();
  f.h.state.project.revision++;
  const drift = await f.h.broker.run(stale);
  assert.equal(drift.code, 'approved_target_drift', JSON.stringify(drift));
  assert.equal(f.h.confirmations, 0);
  for (const [decision, expected] of [['cancel', 'local_cancelled'], ['drift', 'stale_target']]) {
    mode = decision;
    const result = await f.h.broker.run(await f.prepare());
    assert.equal(result.code, 'executor_rejected', JSON.stringify(result));
    assert.equal(result.message, expected);
  }
  assert.equal(f.h.state.saves, 0);
  assert.deepEqual(fs.readFileSync(f.target.projectId), original);
});

test('project-save detects same-length disk drift during confirmation before AE writes', async t => {
  const changed = Buffer.from(original);
  changed[changed.length - 1] ^= 0xff;
  const f = await flow(t, { confirm: ({ state }) => {
    fs.writeFileSync(state.projectId, changed);
    return true;
  } });
  const result = await f.h.broker.run(await f.prepare());
  assert.equal(result.code, 'executor_rejected', JSON.stringify(result));
  assert.equal(result.message, 'save_checkpoint_changed');
  assert.equal(f.h.state.saves, 0);
  assert.deepEqual(fs.readFileSync(f.target.projectId), changed);
});

test('project-save fences an uncertain native write and preserves the original checkpoint', async t => {
  const f = await flow(t, { flags: { saveReturnsFalse: true } });
  const payload = await f.prepare();
  await f.h.broker.run(payload);
  assert.equal(f.h.broker.ledger.commands()[0].state, 'UNKNOWN');
  assert.equal(f.h.state.saves, 1);
  const { checkpoint } = f.h.broker.ledger.commands()[0];
  assert.deepEqual(fs.readFileSync(path.join(f.h.state.stateDir, 'project-save-checkpoints', checkpoint.ref + '.aep')), original);
  await assert.rejects(f.prepare(), /controller_unresolved/);
  assert.equal(f.h.state.saves, 1);
});

test('project-save closes a failed checkpoint reservation before any native dispatch', async t => {
  const f = await flow(t);
  const payload = await f.prepare();
  const root = path.join(f.h.state.stateDir, 'project-save-checkpoints');
  fs.writeFileSync(root, 'occupied');
  const result = await f.h.broker.run(payload);
  assert.notEqual(result.state, 'succeeded');
  assert.equal(f.h.broker.ledger.commands().length, 0);
  assert.equal(f.h.broker.ledger.events.filter(e => e.type === 'reservation').at(-1).state, 'not-dispatched');
  assert.equal(f.h.state.saves, 0);
  assert.equal(f.h.confirmations, 0);
  assert.deepEqual(fs.readFileSync(f.target.projectId), original);
});

test('project-save cannot certify a native success when the disk checkpoint fails verification', async t => {
  const f = await flow(t, { flags: { damageCheckpoint: true } });
  const result = await f.h.broker.run(await f.prepare());
  assert.equal(result.code, 'save_disk_proof_unavailable', JSON.stringify(result));
  assert.equal(f.h.broker.ledger.commands()[0].state, 'UNKNOWN');
  assert.equal(f.h.state.saves, 1);
  assert.deepEqual(fs.readFileSync(f.target.projectId), revised);
});
