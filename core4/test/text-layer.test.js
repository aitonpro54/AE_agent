'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./fixtures/manual-http-runtime');
const { textEnvironment } = require('./fixtures/text-layer-ae');
const { buildPackage } = require('../tools/package-installable');

const moduleId = 'text-layer';
const desired = {
  slot: 'title-01', name: 'Титр 01', text: 'А. Ветров\n«Север»',
  leading: 72, justification: 'right',
  ranges: [
    { start: 0, end: 10, font: 'Unavailable-Regular', fallbackFont: 'Fixture-Regular', fontSize: 36, tracking: 12, fill: [1, 1, 1] },
    { start: 10, end: 17, font: 'Fixture-Bold', fontSize: 64, tracking: 20, fill: [0.8, 0.9, 1], stroke: { color: [0, 0, 0], width: 3 } },
  ],
  placement: { frame: { left: 170, top: 65, width: 420, height: 320 }, minimumScale: 0.6 },
};
desired.ranges[0].end = desired.ranges[1].start = desired.text.indexOf('\n') + 1;
desired.ranges[1].end = desired.text.length;

function inputFor(h) {
  const { contractId } = h.broker.getContract({ moduleId });
  const target = { projectId: h.state.projectId, compId: 7 };
  const inspect = () => h.broker.inspect({ moduleId, contractId, target });
  async function propose(input) {
    const { evidenceRef } = await inspect();
    const { buildId, taskId } = await h.broker.build({ oneStep: true, steps: [
      { stepId: 'text', moduleId, contractId, evidenceRef, input: { ...target, ...input } },
    ] });
    const { proposalId } = h.broker.propose({ buildId });
    const { dryrunRef } = await h.broker.dryrun({ proposalId });
    return { proposalId, dryrunRef, taskId };
  }
  return { inspect, propose };
}

test('text-layer: typed creation and one targeted edit preserve a sibling through Broker, HTTP and CEP', async t => {
  const h = await harness({ textEnvironment }); t.after(() => h.close());
  const api = inputFor(h);
  const created = await h.broker.run(await api.propose(desired));
  assert.equal(created.state, 'succeeded', JSON.stringify(created));
  const first = created.outputs.text.layers[0];
  assert.equal(first.ranges[0].font, 'Fixture-Regular');
  assert.equal(first.ranges[0].substitute, false);
  assert.deepEqual(first.ranges[1].stroke, { color: [0, 0, 0], width: 3 });
  assert.deepEqual(first.position, [380, 225]);
  assert.deepEqual((await api.inspect()).snapshot, created.outputs.text);
  const sibling = await h.broker.run(await api.propose({ ...desired, slot: 'title-02', name: 'Титр 02' }));
  assert.equal(sibling.state, 'succeeded', JSON.stringify(sibling));
  const edit = await h.broker.run(await api.propose({ ...desired, layerId: first.layerId, leading: 84, justification: 'center' }));
  assert.equal(edit.state, 'succeeded', JSON.stringify(edit));
  assert.deepEqual(edit.outputs.text.layers[0], sibling.outputs.text.layers[0]);
  assert.equal(edit.outputs.text.layers[1].leading, 84);
  assert.equal(edit.outputs.text.layers[1].justification, 'center');
  assert.deepEqual((await api.inspect()).snapshot, edit.outputs.text);
  assert.equal(h.confirmations, 3);
  assert.equal(h.state.textFixture.undoDepth, 0);
  assert.deepEqual(h.broker.ledger.unresolved(), []);
});

test('text-layer: missing font rejects before confirmation and a cancelled write leaves the workspace unchanged', async t => {
  const h = await harness({ textEnvironment, confirm: () => false }); t.after(() => h.close());
  const api = inputFor(h), before = (await api.inspect()).snapshot;
  const missing = { ...desired, ranges: desired.ranges.map(({ fallbackFont, ...range }) => range) };
  const absent = await h.broker.run(await api.propose(missing));
  assert.equal(absent.message, 'text_layer_font_missing');
  assert.equal(h.confirmations, 0);
  assert.equal((await h.broker.run(await api.propose(desired))).message, 'local_cancelled');
  assert.deepEqual((await api.inspect()).snapshot, before);
  assert.deepEqual(h.broker.ledger.unresolved(), []);
});

test('text-layer: package keeps both prior Titles contracts and contains the new executor only when opted in', () => {
  const enabled = buildPackage(undefined, 'manual-titles', { runtimeModel: 'owner' });
  const old = buildPackage(undefined, 'manual-layout', { runtimeModel: 'owner' });
  for (const id of ['titles-current-target', 'titles-point-layout']) {
    for (const file of ['artifact.json', 'contract.json', 'executor.jsx']) {
      assert.equal(enabled.files[`modules/${id}/${file}`], old.files[`modules/${id}/${file}`]);
    }
  }
  assert.ok(enabled.files['modules/text-layer/executor.jsx']);
  assert.equal(old.files['modules/text-layer/executor.jsx'], undefined);
});
