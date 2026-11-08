'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { issue } = require('../runtime/operator-confirmation');
const { harness } = require('./fixtures/manual-http-runtime');

const moduleId = 'comp-frame-export';
const sessionId = 'png-fixture-session';
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2XcAAAAASUVORK5CYII=', 'base64');

function frameEnvironment(state) {
  const parent = path.dirname(state.projectId);
  state.outputDirectory = path.join(parent, 'frames-output');
  fs.mkdirSync(state.outputDirectory);
  class File {
    constructor(file) { this.fsName = path.normalize(file); }
    get exists() { return fs.existsSync(this.fsName); }
    get length() { return fs.statSync(this.fsName).size; }
    open() { this.data = fs.readFileSync(this.fsName); return true; }
    seek(offset) { this.offset = offset; return true; }
    read(count) { return this.data.subarray(this.offset, this.offset + count).toString('latin1'); }
    close() { this.data = null; }
  }
  class CompItem {
    saveFrameToPng(time, file) {
      state.captures.push(time);
      state.writeCapture = () => fs.writeFileSync(file.fsName, state.flags.truncated ? pixel.subarray(0, -12) : pixel, { flag: 'wx' });
      if (!state.flags.delayed) state.writeCapture();
      if (state.flags.revisionChanges) state.project.revision++;
    }
  }
  state.captures = [];
  const comp = state.comp = Object.assign(new CompItem(), { id: 8, name: 'Frame', width: 1, height: 1, duration: 1,
    frameDuration: 1 / 25, displayStartTime: 0, time: 0, resolutionFactor: [1, 1], numLayers: 1 });
  const project = state.project = { file: { fsName: state.projectId, parent: { fsName: parent } }, revision: 7, dirty: false,
    itemByID: id => id === comp.id ? comp : null };
  return { app: { project }, CompItem, File, Folder: File, $: { sleep() {
    if (state.flags.delayed) { state.flags.delayed = false; state.writeCapture(); }
  } } };
}

async function fixture(t, flags) {
  const h = await harness({ frameEnvironment, flags, operatorSession: () => sessionId });
  t.after(() => h.close());
  const { contractId } = h.broker.getContract({ moduleId });
  const target = { projectId: h.state.projectId, compId: 8 };
  const inspect = () => h.broker.inspect({ moduleId, contractId, target });
  const input = { ...target, frame: 3, fileName: 'preview.png' };
  const output = path.join(h.state.outputDirectory, input.fileName);
  const build = async (desired = input) => {
    const evidence = await inspect();
    return h.broker.build({ oneStep: true, steps: [{ stepId: 'frame', moduleId, contractId,
      evidenceRef: evidence.evidenceRef, input: desired }] });
  };
  async function run(approved = true, beforeRun = () => {}) {
    const { buildId } = await build();
    const proposal = h.broker.propose({ buildId });
    if (approved) issue(h.installation, { sessionId, proposalId: proposal.proposalId, approvalDigest: proposal.operatorApprovalDigest });
    const { dryrunRef } = await h.broker.dryrun({ proposalId: proposal.proposalId });
    beforeRun();
    return h.broker.run({ proposalId: proposal.proposalId, dryrunRef });
  }
  return { ...h, inspect, input, output, build, run, get confirmations() { return h.confirmations; } };
}

test('comp-frame-export authenticates the exact frame and records the native PNG with unchanged project state', async t => {
  const h = await fixture(t);
  assert.equal((await h.run(false)).code, 'operator_confirmation_required');
  assert.deepEqual(h.state.captures, []);
  const before = (await h.inspect()).snapshot;
  const result = await h.run();
  assert.equal(result.state, 'succeeded', JSON.stringify(result));
  assert.deepEqual(fs.readFileSync(h.output), pixel);
  assert.deepEqual(h.state.captures, [3 / 25]);
  assert.deepEqual((await h.inspect()).snapshot, before);
  assert.deepEqual(h.broker.ledger.commands()[0].after.output, { file: h.output, frame: 3, bytes: pixel.length });
  assert.equal(h.confirmations, 0);
  assert.equal((await h.run()).code, 'frame_export_exists');
  assert.equal(h.state.captures.length, 1);
});

test('comp-frame-export refuses a changed revision, an out-of-range frame and a non-native preview resolution', async t => {
  const h = await fixture(t);
  await assert.rejects(h.build({ ...h.input, frame: 25 }), /frame_export_range/);
  await assert.rejects(h.build({ ...h.input, fileName: '../old.png' }), /frame_export_filename/);
  h.state.comp.resolutionFactor = [2, 2];
  await assert.rejects(h.build(), /frame_export_resolution/);
  h.state.comp.resolutionFactor = [1, 1];
  assert.equal((await h.run(true, () => h.state.project.revision++)).code, 'approved_target_drift');
  assert.equal(fs.existsSync(h.output), false);
});

test('comp-frame-export leaves a truncated output fenced and preserves the original command', async t => {
  const h = await fixture(t, { truncated: true });
  const result = await h.run();
  assert.equal(result.state, 'stopped');
  assert.equal(h.broker.ledger.unresolved().length, 1);
  assert.equal(h.state.captures.length, 1);
  assert.ok(fs.existsSync(h.output));
});

test('comp-frame-export waits for native output and preserves state across render revision ticks', async t => {
  const h = await fixture(t, { delayed: true, revisionChanges: true });
  const { snapshot: before } = await h.inspect();
  assert.equal((await h.run()).state, 'succeeded');
  const { snapshot: after } = await h.inspect();
  assert.notEqual(after.revision, before.revision);
  assert.equal(after.protected, before.protected);
  assert.deepEqual(fs.readFileSync(h.output), pixel);
});
