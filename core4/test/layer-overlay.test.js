'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { hash } = require('../protocol/json');
const { issue } = require('../runtime/operator-confirmation');
const { issueMontageMandate } = require('../runtime/montage-mandate');
const { createLayerOverlayProof } = require('../runtime/layer-overlay-proof');
const { inspectReceiverHistory, inspectLedgerHistory } = require('../runtime/recovery-inspection');
const { scopesOverlap } = require('../core/resources');
const { harness } = require('./fixtures/manual-http-runtime');

const { overlayEnvironment } = require('./fixtures/montage-host');
const moduleId = 'layer-overlay';
const sessionId = 'fixture-installation';

async function fixture(t, options = {}) {
  const h = await harness({ overlayEnvironment, operatorSession: () => sessionId, ...options });
  t.after(() => h.close());
  const { state, broker } = h;
  const { contractId } = broker.getContract({ moduleId });
  const target = { projectId: state.projectId, sessionId, compId: state.comp.id,
    layerId: state.original.id, originalSourceId: state.originalSource.id, itemId: state.replacement.id };
  const file = state.replacement.file.fsName;
  const input = { ...target, file, sha256: hash(fs.readFileSync(file)) };
  const inspect = () => broker.inspect({ moduleId, contractId, target });
  const build = async (options = {}) => {
    const { evidenceRef } = await inspect();
    return broker.build({ oneStep: true, steps: [{ stepId: 'overlay', moduleId, contractId, evidenceRef, input }], ...options });
  };
  const prepare = async (approved = true) => {
    const { buildId } = await build();
    const proposal = broker.propose({ buildId });
    if (approved) issue(h.installation, { sessionId, proposalId: proposal.proposalId, approvalDigest: proposal.operatorApprovalDigest });
    const { dryrunRef } = await broker.dryrun({ proposalId: proposal.proposalId });
    return { proposalId: proposal.proposalId, dryrunRef };
  };
  return { ...h, target, input, inspect, build, prepare, get confirmations() { return h.confirmations; } };
}

test('layer-overlay copies the exact slot and verifies shared uses, keys, mask, effect, parent, matte and alpha', async t => {
  const h = await fixture(t, { flags: { nativeTransformComponents: true } });
  assert.equal((await h.broker.run(await h.prepare(false))).code, 'operator_confirmation_required');
  const { snapshot: before } = await h.inspect();
  const transforms = JSON.parse(before.signature)[10];
  assert.deepEqual(transforms[0], ['ADBE Anchor Point', [960, 540, 0]]);
  assert.deepEqual(transforms[1][1][0][8], [0, 0, 0]);
  assert.deepEqual(transforms[2], ['ADBE Scale', [90, 90, 100]]);
  const result = await h.broker.run(await h.prepare());
  assert.equal(result.state, 'succeeded', JSON.stringify(result));
  const { snapshot: after } = await h.inspect(), copy = h.state.comp.layer(2);
  assert.equal(after.overlay.id, copy.id);
  assert.equal(after.overlay.signature, before.signature);
  assert.deepEqual(after.stack.filter(layer => layer.id !== copy.id), before.stack);
  assert.deepEqual(after.uses, before.uses);
  assert.equal(after.uses.length, 2);
  assert.equal(copy.source, h.state.replacement);
  assert.equal(copy.parent, h.state.parent);
  assert.equal(copy.trackMatteLayer, h.state.matte);
  assert.deepEqual(h.state.writes, { duplicate: 1, replace: 1, matte: 1 });
  assert.equal(JSON.parse(after.source.alpha)[0], true);
  assert.equal(h.confirmations, 0);
  assert.equal(h.broker.ledger.commands()[0].verificationKind, 'local-transaction-receipt');
  const receiver = inspectReceiverHistory(fs.readFileSync(path.join(h.installation.stateDir, 'receiver/completions.ndjson')));
  const ledger = inspectLedgerHistory(fs.readFileSync(path.join(h.installation.stateDir, 'broker/ledger.ndjson')),
    { receiver, installationId: h.installation.installationId });
  assert.equal(ledger.settled, true);
  assert.equal(scopesOverlap(h.target, { ...h.target, itemId: 300 }), true);
  assert.equal(scopesOverlap(h.target, { ...h.target, layerId: 300 }), false);
  await assert.rejects(h.build(), /layer_overlay_existing_or_partial/);
  copy.comment += '\nUser annotation';
  assert.equal((await h.inspect()).snapshot.overlay.state, 'partial');
  await assert.rejects(h.build(), /layer_overlay_existing_or_partial/);
  assert.equal(h.state.writes.duplicate, 1);
  const proof = createLayerOverlayProof(() => sessionId);
  for (const damaged of [
    { ...after, stack: [after.stack[0], after.stack[1], ...after.stack.slice(1)] },
    { ...after, overlay: { ...after.overlay, sourceId: h.target.originalSourceId } }
  ]) assert.throws(() => proof.validateResult({ input: h.input, before }, damaged), { code: 'layer_overlay_readback' });
});

test('layer-overlay rejects external indexed expressions and revision drift before native duplicate', async t => {
  const h = await fixture(t);
  const external = h.state.shared.layer(1).transforms.property('ADBE Position');
  external.expressionEnabled = true;
  external.expression = 'thisComp.layer(2).position';
  await assert.rejects(h.inspect(), /inspection_failed/);
  external.expressionEnabled = false;
  external.expression = '';
  const proposed = await h.prepare();
  h.state.project.revision++;
  const result = await h.broker.run(proposed);
  assert.equal(result.code, 'approved_target_drift');
  assert.equal(h.state.writes.duplicate, 0);
});

test('layer-overlay rejects a project at the total layer limit before duplicate', async t => {
  const h = await fixture(t, { flags: { fullLayerBudget: true } });
  const result = await h.broker.run(await h.prepare());
  assert.equal(result.message, 'inspection_result_budget');
  assert.deepEqual(h.state.writes, { duplicate: 0, replace: 0, matte: 0 });
});

test('layer-overlay preflights the original slot and shared uses before a replacement item exists', async t => {
  const h = await fixture(t, { flags: { importOnDemand: true } });
  const { itemId, ...target } = h.target;
  const { contractId } = h.broker.getContract({ moduleId });
  const preflight = () => h.broker.inspect({ moduleId, contractId, target });
  h.state.original.stretch = -80;
  const { snapshot, evidenceRef } = await preflight();
  assert.deepEqual(snapshot.target, target);
  assert.equal(snapshot.uses.length, 2);
  assert.equal(snapshot.source.file, h.state.originalSource.file.fsName);
  const original = snapshot.stack.find(layer => layer.id === target.layerId);
  assert.equal(JSON.parse(original.stamp)[10], -80);
  await assert.rejects(h.broker.build({ oneStep: true, steps: [{ stepId: 'overlay', moduleId, contractId, evidenceRef,
    input: h.input }] }), /layer_overlay_preflight_only/);
  h.state.original.timeRemapEnabled = true;
  await assert.rejects(preflight(), /layer_overlay_layer_profile/);
  assert.deepEqual(h.state.writes, { duplicate: 0, replace: 0, matte: 0 });
});

test('layer-overlay preflight reserves capacity for a longer escaped replacement path', async t => {
  const h = await fixture(t, { flags: { importOnDemand: true, longOverlayLayers: 21 } });
  const { itemId, ...target } = h.target;
  const { contractId } = h.broker.getContract({ moduleId });
  await assert.rejects(h.broker.inspect({ moduleId, contractId, target }), /inspection_result_budget/);
  assert.deepEqual(h.state.writes, { duplicate: 0, replace: 0, matte: 0 });
});

test('layer-overlay uses one montage mandate for a real Broker import receipt and the derived footage ID', async t => {
  const h = await fixture(t, { mediaEnvironment: true, flags: { importOnDemand: true } });
  const moduleId = 'media-import', { contractId } = h.broker.getContract({ moduleId });
  const { projectId, file, sha256, itemId, ...slot } = h.input;
  const target = { projectId, sessionId, file };
  const input = { ...target, sha256 };
  const { evidenceRef } = await h.broker.inspect({ moduleId, contractId, target });
  const built = await h.broker.build({ oneStep: true, steps: [{ stepId: 'import', moduleId, contractId, evidenceRef, input }] });
  const { taskId } = built;
  const issued = issueMontageMandate(h.installation, { projectId, sessionId, taskId, taskEpoch: 0, expiresAt: Date.now() + 60000,
    actions: [{ moduleId, input }, { moduleId: 'layer-overlay', input: { ...slot, ...input } }] });
  async function run(buildId) {
    const { proposalId } = h.broker.propose({ buildId });
    return h.broker.run(await h.broker.dryrun({ proposalId }));
  }
  const imported = await run(built.buildId);
  assert.equal(imported.state, 'succeeded', JSON.stringify(imported));
  assert.equal(imported.outputs.import.createdItemId, itemId);
  const overlay = await h.build({ taskId });
  assert.equal(overlay.taskId, taskId);
  const rendered = await run(overlay.buildId);
  assert.equal(rendered.state, 'succeeded', JSON.stringify(rendered));
  assert.equal(rendered.outputs.overlay.overlay.sourceId, itemId);
  assert.deepEqual(h.broker.ledger.commands(taskId).map(command => command.grant.operatorConfirmation.mandateDigest),
    [issued.digest, issued.digest]);
  assert.equal(h.confirmations, 0);
});

for (const flag of ['duplicateThrows', 'ignoresMarker', 'returnsExisting', 'holdMutationCallback']) {
  test('layer-overlay preserves UNKNOWN and forbids a fresh proposal after ' + flag, async t => {
    const h = await fixture(t, { flags: { [flag]: true }, callbackTimeout: 300, callerTimeout: 1500 });
    const proposed = await h.prepare();
    const result = await h.broker.run(proposed);
    assert.equal(result.state, 'stopped');
    const command = h.broker.ledger.commands()[0];
    assert.equal(command.state, 'UNKNOWN');
    assert.equal(h.state.writes.duplicate, 1);
    assert.equal(h.state.writes.replace, flag === 'holdMutationCallback' ? 1 : 0);
    assert.equal(h.state.original.source, h.state.originalSource);
    assert.equal(h.state.parent.comment, 'note');
    await assert.rejects(h.build(), /controller_unresolved/);
    if (flag === 'holdMutationCallback') {
      assert.throws(() => h.state.retryPendingMutation(), /physical_latch_present/);
      const file = path.join(h.installation.stateDir, 'receiver/completions.ndjson');
      const before = fs.readFileSync(file);
      h.state.releaseMutationCallback();
      await new Promise(resolve => setTimeout(resolve, 30));
      assert.deepEqual(fs.readFileSync(file), before);
      assert.equal(h.state.writes.duplicate, 1);
    }
  });
}
