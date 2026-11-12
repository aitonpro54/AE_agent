'use strict';
// Product/Core source integration only. The private TEMP fixture simulates AE
// and Windows observations; no installed authority, native UI or public grants.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { prepareBuild } = require('../src/compiler');
const { harness } = require('../../../core4/test/fixtures/manual-http-runtime');
const moduleId = 'titles-current-target';
function builder(seen) {
  return ({ contract, inspection, target, text }) => {
    const before = structuredClone({ contract, inspection, target });
    const job = { schemaVersion: '0.1', jobId: 'titles-core-http-fixture', target, text };
    const request = prepareBuild(job, contract, inspection);
    assert.deepEqual({ contract, inspection, target }, before);
    assert.equal(inspection.synthetic, false, 'the existing private manual port issues this value; the test never changes it');
    assert.equal(request.recordContext.purpose, 'user_work');
    // Descriptive record classification for this ephemeral technical check.
    // Input, contract and evidence are the compiler's exact output.
    request.recordContext = { ...request.recordContext, purpose: 'technical_check', lifetime: 'ephemeral_check' };
    seen.push({ contract, inspection, request }); return request;
  };
}
function fixture(t, options = {}) {
  return harness(options).then(h => {
    t.after(async () => { await h.close(); fs.rmSync(h.dir, { recursive: true, force: true }); }); return h;
  });
}
async function readback(h, contractId) {
  return h.broker.inspect({ moduleId, contractId, target: { projectId: h.state.projectId, compId: 1, layerId: 102 } });
}
function sibling(h) { return structuredClone({ sourceId: h.state.photoSourceId, changes: h.state.counts.photo, transform: h.state.transform, time: h.state.time }); }

test('Titles compiler → actual Core HTTP receipt and fresh read-back preserve sibling and style', async t => {
  const seen = [], h = await fixture(t, { requestBuilder: builder(seen) }), beforeSibling = sibling(h), beforeStyle = structuredClone(h.state.style);
  const text = 'Заголовок «Север»', proposal = await h.proposal(text), result = await h.broker.run(proposal);
  assert.equal(seen.length, 1); assert.equal(result.state, 'succeeded', JSON.stringify(result));
  assert.equal(h.state.text, text); assert.equal(h.state.counts.titles, 1); assert.equal(h.confirmations, 1);
  const command = h.broker.ledger.commands(proposal.taskId)[0];
  assert.equal(command.selected.moduleId, moduleId); assert.equal(command.verificationKind, 'local-transaction-receipt');
  assert.equal(command.recordContext.purpose, 'technical_check'); assert.equal(command.recordContext.lifetime, 'ephemeral_check');
  const checkpoint = h.broker.ledger.events.find(event => event.type === 'checkpoint' && event.checkpoint.ref === command.checkpoint.ref);
  assert.deepEqual(checkpoint.preimage, seen[0].inspection.snapshot); assert.equal(command.checkpoint.digest, checkpoint.checkpoint.digest);
  const fresh = await readback(h, seen[0].contract.contractId);
  assert.equal(fresh.synthetic, false); assert.deepEqual(fresh.snapshot, result.outputs['set-title']); assert.equal(fresh.snapshot.text, text);
  assert.equal(fresh.snapshot.protected, seen[0].inspection.snapshot.protected);
  assert.notEqual(fresh.evidenceRef, seen[0].inspection.evidenceRef);
  assert.deepEqual(sibling(h), beforeSibling); assert.deepEqual(h.state.style, beforeStyle); assert.deepEqual(h.broker.ledger.unresolved(), []);
  const journal = fs.readFileSync(path.join(h.installation.stateDir, 'receiver/completions.ndjson'), 'utf8').trimEnd().split('\n').map(JSON.parse);
  const receipt = journal.find(event => event.type === 'complete' && event.commandId === command.commandId);
  assert.equal(receipt.response.result.transactionReceipt.desiredText, text);
  assert.equal(receipt.response.result.transactionReceipt.checkpointDigest, command.checkpoint.digest);
  const again = await h.broker.run(await h.proposal('Второй заголовок')); assert.equal(again.state, 'succeeded', JSON.stringify(again));
  assert.equal(h.state.counts.titles, 2); assert.equal(h.confirmations, 2); assert.deepEqual(sibling(h), beforeSibling);
});

test('Titles compiler stale inspection is refused before mutation and fresh compiler proposal succeeds', async t => {
  const seen = [], h = await fixture(t, { requestBuilder: builder(seen) });
  const stale = await h.proposal('Новая строка'); h.state.text = 'Ручная правка после inspection';
  const result = await h.broker.run(stale);
  assert.equal(result.code, 'approved_target_drift'); assert.notEqual(result.state, 'succeeded');
  assert.equal(h.state.counts.titles, 0); assert.equal(h.confirmations, 0); assert.deepEqual(h.broker.ledger.commands(), []);
  assert.equal(h.state.text, 'Ручная правка после inspection');
  const fresh = await h.proposal('Новая строка'), completed = await h.broker.run(fresh);
  assert.equal(completed.state, 'succeeded', JSON.stringify(completed)); assert.equal(h.state.counts.titles, 1); assert.equal(h.confirmations, 1);
  assert.notEqual(seen[0].inspection.evidenceRef, seen[1].inspection.evidenceRef);
  assert.notEqual(seen[0].inspection.snapshot.revision, seen[1].inspection.snapshot.revision);
  assert.deepEqual((await readback(h, seen[1].contract.contractId)).snapshot, completed.outputs['set-title']);
});
