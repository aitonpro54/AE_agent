'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { hash } = require('../protocol/json');
const { harness } = require('./fixtures/manual-http-runtime');

const { mediaEnvironment } = require('./fixtures/media-layer-host');

function operation(h, moduleId, target, params) {
  const { contractId } = h.broker.getContract({ moduleId });
  const inspect = () => h.broker.inspect({ moduleId, contractId, target });
  const plan = async (input = params) => {
    const evidence = await inspect();
    return h.broker.build({ oneStep: true, steps: [{ stepId: 'operation', moduleId, contractId,
      evidenceRef: evidence.evidenceRef, input: { ...target, ...input } }] });
  };
  const proposal = async input => {
    const built = await plan(input);
    const { proposalId } = h.broker.propose({ buildId: built.buildId });
    const { dryrunRef } = await h.broker.dryrun({ proposalId });
    return { proposalId, dryrunRef, taskId: built.taskId };
  };
  return { inspect, plan, run: async input => h.broker.run(await proposal(input)) };
}
function importer(h) {
  const file = h.state.overlayFile;
  return operation(h, 'media-import', { projectId: h.state.projectId, sessionId: h.installation.installationId, file },
    { sha256: hash(fs.readFileSync(file)) });
}
function inserter(h, sourceId = h.state.stock.id, placement = 'above') {
  return operation(h, 'layer-insert', { projectId: h.state.projectId, sessionId: h.installation.installationId,
    compId: h.state.comp.id, layerId: h.state.anchor.id, itemId: sourceId }, {
    name: 'Обработанный вариант', placement, startFrame: 12, inFrame: 18, outFrame: 72, position: [160, 90], scale: [80, 80]
  });
}

const windows = { skip: process.platform !== 'win32' };
test('media-layers imports once and inserts by ID above a same-named layer with signed read-back', windows, async t => {
  const h = await harness({ mediaEnvironment, confirm: ({ message }) => {
    if (message.includes('в существующую композицию')) assert.match(message, /Вхождения comp\/layer → source: \d+\/\d+ → \d+, \d+\/\d+ → \d+/);
    return true;
  } });
  t.after(() => h.close());
  const ingest = importer(h);
  const imported = await ingest.run();
  assert.equal(imported.state, 'succeeded');
  const newItem = (await ingest.inspect()).snapshot.items.find(item => item.file === h.state.overlayFile);
  assert.equal(imported.outputs.operation.createdItemId, newItem.id);
  await assert.rejects(ingest.plan(), /media_already_imported/);
  const insert = inserter(h, newItem.id);
  const before = (await insert.inspect()).snapshot;
  const result = await insert.run();
  assert.equal(result.state, 'succeeded', JSON.stringify(result));
  const after = (await insert.inspect()).snapshot;
  assert.deepEqual([after.stack[0], after.stack[2]], before.stack);
  assert.equal(result.outputs.operation.createdLayerId, after.stack[1].id);
  assert.equal(after.stack[1].sourceId, newItem.id);
  assert.deepEqual(after.stack[1].position, [160, 90]);
  assert.equal(after.stack[1].outPoint, 72 * before.frameDuration);
  assert.equal(h.confirmations, 2);
  assert.deepEqual(h.broker.ledger.commands().map(command => command.verificationKind), Array(2).fill('local-transaction-receipt'));
});

test('media-layers refuses matte split, cross-comp expression, and source ranges before dispatch', windows, async t => {
  const h = await harness({ mediaEnvironment });
  t.after(() => h.close());
  const { anchor, neighbor, master, stock } = h.state;
  anchor.hasTrackMatte = true;
  anchor.trackMatteLayer = neighbor;
  await assert.rejects(inserter(h).plan(), /layer_insert_matte_pair/);
  const external = master.layer(1).transform.property(1);
  external.expressionEnabled = true;
  await assert.rejects(inserter(h, stock.id, 'below').plan(), /layer_insert_expression_scope/);
  external.expressionEnabled = false;
  stock.mainSource.isStill = false;
  stock.duration = 1;
  await assert.rejects(inserter(h, stock.id, 'below').plan(), /layer_insert_frame_range/);
  stock.duration = 10;
  const insertion = inserter(h, stock.id, 'below');
  assert.equal((await insertion.run()).state, 'succeeded');
  assert.equal((await insertion.inspect()).snapshot.stack[1].matteId, neighbor.id);
});

test('media-layers never records or promotes an applied callback after the source lock is lost', windows, async t => {
  const h = await harness({ mediaEnvironment });
  t.after(() => h.close());
  h.state.flags.loseMediaSourceLock = true;
  const result = await importer(h).run();
  assert.equal(result.state, 'stopped');
  assert.equal(result.code, 'media_file_lock_unavailable');
  const [command] = result.task.commands;
  assert.equal(command.state, 'UNKNOWN');
  assert.equal(h.state.items.filter(item => item.file?.fsName === h.state.overlayFile).length, 1);
  const records = fs.readFileSync(path.join(h.installation.stateDir, 'receiver', 'completions.ndjson'), 'utf8')
    .trim().split('\n').map(JSON.parse).filter(row => row.commandId === command.commandId);
  assert.deepEqual(records.map(row => row.type), ['begin', 'unknown']);
  await assert.rejects(importer(h).plan(), /controller_unresolved|receiver_lane_closed/);
});

test('media-layers rejects a wrong input SHA before confirm and a changed stack after confirm', windows, async t => {
  const h = await harness({ mediaEnvironment, confirm: ({ message, state }) => {
    if (message.includes('Импортировать')) state.items[0].name = 'Changed inventory with the same revision';
    else state.anchor.name = 'Changed while confirming';
    return true;
  } });
  t.after(() => h.close());
  const wrong = await importer(h).run({ sha256: '0'.repeat(64) });
  assert.equal(wrong.code, 'media_import_digest_mismatch', JSON.stringify(wrong));
  assert.equal(h.confirmations, 0);
  const drift = await importer(h).run();
  assert.equal(drift.message, 'stale_target');
  assert.equal(h.state.items.length, 3);
  const stale = await inserter(h).run();
  assert.equal(stale.message, 'stale_target');
  assert.equal(h.state.comp.numLayers, 2);
});

test('media-layers preserves a 1079-item inventory within the wire budget and refuses wide names', windows, async t => {
  const h = await harness({ mediaEnvironment, flags: { items: 1079, wireNames: true } });
  t.after(() => h.close());
  const ingest = importer(h), { snapshot: before } = await ingest.inspect();
  assert.equal(before.items.length, 1079);
  assert.ok(Buffer.byteLength(JSON.stringify(before)) > 65536);
  const result = await ingest.run();
  assert.equal(result.state, 'succeeded', JSON.stringify(result));
  const after = result.outputs.operation;
  assert.deepEqual(after.items.filter(item => item.id !== after.createdItemId), before.items);
  assert.equal((await inserter(h, after.createdItemId).run()).state, 'succeeded');
  const receiver = fs.readFileSync(path.join(h.installation.stateDir, 'receiver/completions.ndjson'), 'utf8');
  const receiverMax = Math.max(...receiver.trim().split('\n').map(line => Buffer.byteLength(line)));
  assert.ok(receiverMax < 256 * 1024);
  t.diagnostic('media-import snapshot bytes=' + Buffer.byteLength(JSON.stringify(before)) + ', receiver max bytes=' + receiverMax);
  const wide = await harness({ mediaEnvironment, flags: { items: 1079, longNames: true } });
  t.after(() => wide.close());
  await assert.rejects(importer(wide).inspect(), /inspection_result_budget/);
  assert.equal(wide.broker.ledger.commands().length, 0);
});

test('media-layers preflights import capacity before the media file exists', windows, async t => {
  const h = await harness({ mediaEnvironment, flags: { items: 1079 } });
  t.after(() => h.close());
  const file = h.state.overlayFile, bytes = fs.readFileSync(file);
  fs.unlinkSync(file);
  const moduleId = 'media-import', { contractId } = h.broker.getContract({ moduleId });
  const target = { projectId: h.state.projectId, sessionId: h.installation.installationId };
  const { snapshot, evidenceRef } = await h.broker.inspect({ moduleId, contractId, target });
  assert.deepEqual(snapshot.target, target);
  assert.equal(snapshot.items.length, 1079);
  assert.equal(snapshot.bytes, undefined);
  fs.writeFileSync(file, bytes);
  await assert.rejects(h.broker.build({ oneStep: true, steps: [{ stepId: 'import', moduleId, contractId, evidenceRef,
    input: { ...target, file, sha256: hash(bytes) } }] }), /media_import_preflight_only/);
  assert.equal(h.confirmations, 0);
  assert.equal(h.broker.ledger.commands().length, 0);
});

test('media-layers records numeric import preflight budget stages without exposing item data', windows, async t => {
  const h = await harness({ mediaEnvironment, flags: { items: 1000 } });
  t.after(() => h.close());
  const { items, projectId } = h.state;
  const preflight = operation(h, 'media-import', { projectId, sessionId: h.installation.installationId });
  const { snapshot: initial } = await preflight.inspect();
  async function refused(inspect = preflight.inspect) {
    await assert.rejects(inspect(), /inspection_result_budget/);
    const { lastReadFailure } = h.peer.status();
    assert.equal(lastReadFailure.diagnostic, undefined);
    const receipt = fs.readFileSync(path.join(h.installation.stateDir, 'receiver/completions.ndjson'), 'utf8')
      .trim().split('\n').map(JSON.parse).find(row => row.type === 'complete' && row.commandId === lastReadFailure.commandId);
    assert.equal(receipt.response.result.code, 'inspection_result_budget');
    return receipt.response.result.diagnostic;
  }
  items[3].name = 'private'.repeat(75);
  assert.deepEqual(await refused(), { version: 1, stage: 'field_units', itemCount: 1000, itemIndex: 4, nameUnits: 525, fileUnits: 0 });
  assert.equal(await refused(importer(h).inspect), undefined);

  for (const item of items.slice(3)) item.name = 'Ф'.repeat(180);
  const inventory = await refused();
  assert.equal(inventory.stage, 'inventory_bytes');
  assert.equal(inventory.itemCount, 1000);
  assert.ok(inventory.itemIndex < 1000 && inventory.inventoryBytes > 96 * 1024);

  for (const item of initial.items.slice(3)) item.name = '';
  let remaining = 96 * 1024 - Buffer.byteLength(JSON.stringify(initial.items));
  for (const item of items.slice(3)) {
    const units = Math.min(512, remaining);
    item.name = 'x'.repeat(units);
    remaining -= units;
  }
  assert.equal(remaining, 0);
  const snapshot = await refused();
  assert.equal(snapshot.stage, 'snapshot_bytes');
  assert.ok(snapshot.snapshotBytes > 96 * 1024);

  for (const item of items.slice(3)) item.name = 'Ф'.repeat(22);
  const prospect = await refused();
  assert.equal(prospect.stage, 'prospect_capacity');
  assert.equal(prospect.projectedSnapshotBytes, prospect.snapshotBytes + 8192);
  assert.equal(prospect.projectedIntentBytes, prospect.projectedSnapshotBytes + 2 * prospect.escapedInventoryBytes);
  assert.ok(prospect.snapshotBytes <= 96 * 1024);

  items.length = 2049;
  assert.deepEqual(await refused(), { version: 1, stage: 'item_count', itemCount: 2049 });
  assert.equal(h.confirmations, 0);
  assert.equal(h.broker.ledger.commands().length, 0);
});

test('media-layers refuses oversized layer-insert read and intent before mutation', windows, async t => {
  for (const wideStack of [68, 60]) {
    const h = await harness({ mediaEnvironment, flags: { items: 1079, wideStack } });
    t.after(() => h.close());
    if (wideStack === 68) await assert.rejects(inserter(h).inspect(), /inspection_result_budget/);
    else {
      const { snapshot } = await inserter(h).inspect();
      assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) < 128 * 1024);
      await assert.rejects(inserter(h).plan(), /inspection_result_budget/);
    }
    assert.equal(h.state.comp.numLayers, wideStack);
    assert.equal(h.broker.ledger.commands().length, 0);
  }
});

for (const [flag, action] of [['importThrows', importer], ['moveThrows', inserter]]) {
  test('media-layers preserves UNKNOWN after a partial ' + flag, windows, async t => {
    const h = await harness({ mediaEnvironment, flags: { [flag]: true }, callbackTimeout: 350 });
    t.after(() => h.close());
    const operation = action(h);
    await operation.run();
    assert.equal(h.broker.ledger.commands()[0].state, 'UNKNOWN');
    await assert.rejects(operation.plan(), /controller_unresolved/);
  });
}
