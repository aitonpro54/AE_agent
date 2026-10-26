'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Broker } = require('../core/broker');
const { syntheticAuthority } = require('./fixtures/authority');
const { initialState, fixtureTransport } = require('./fixtures/ae');
const { canonical, hash, id } = require('../protocol/json');
const { encode, decode } = require('../protocol/codec');
const SOURCE = path.resolve(__dirname, '..');
async function moduleFixture(t, moduleId) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-core4-module-')); const root = path.join(temp, 'core4');
  fs.mkdirSync(root);
  // No recursive repository copy: only the tested module and permanent closure exist.
  for (const file of ['core', 'protocol', 'worker.js']) fs.cpSync(path.join(SOURCE, file), path.join(root, file), { recursive: true });
  fs.mkdirSync(path.join(root, 'config/admissions'), { recursive: true });
  fs.copyFileSync(path.join(SOURCE, 'config/catalog.json'), path.join(root, 'config/catalog.json'));
  fs.copyFileSync(path.join(SOURCE, 'config/admissions/' + moduleId + '.json'), path.join(root, 'config/admissions/' + moduleId + '.json'));
  fs.cpSync(path.join(SOURCE, 'modules', moduleId), path.join(root, 'modules', moduleId), { recursive: true });
  const state = initialState(); const trace = [];
  const transport = fixtureTransport({ root, state, selectedModules: [moduleId] });
  const authority = syntheticAuthority({ sessionId: state.sessionId, projectId: state.projectId, lifecycle: transport.lifecycle, owner: 'module-fixture', checkpointRef: 'module-checkpoint', effects: [moduleId === 'titles' ? 'layer.text' : 'layer.source'] });
  const broker = new Broker({ root, stateDir: path.join(temp, 'state'), trace: file => trace.push(file), privateEmbedding: { authority, transport } });
  t.after(() => broker.close()); await broker.connect(); const contract = broker.getContract({ moduleId }); const selected = broker.selected(contract.contractId);
  const target = { sessionId: state.sessionId, projectId: state.projectId, compId: 1, layerId: moduleId === 'titles' ? 102 : 101 };
  async function snapshot() { return (await broker.inspect({ moduleId, contractId: contract.contractId, target })).snapshot; }
  async function intent(desired, before) {
    const result = await broker.worker.request({ taskId: 'module-contract', taskEpoch: 0, method: 'build', componentPins: { pin: selected.pin, path: selected.path, manifest: selected.manifest }, payload: { input: desired, evidence: before } });
    broker.validateIntent(selected, result, desired, before); return result.input;
  }
  // Private fixture driver exercises fixed admitted executor entry points; this is not an
  // authority/grant implementation or a second production runner.
  async function mutate(input) { return broker.send(selected, 'mutate', input); }
  // Receiver-only conformance for identities the Broker now refuses before send.
  // Fixed selected asset/phase; no production runner, arbitrary code or issuer.
  async function mutateExecutor(input) {
    const command = { protocolVersion: 1, controllerId: broker.controllerId, channelEpoch: broker.channelEpoch, commandId: id('executor-conformance'), moduleId, operationId: selected.contract.operationId, executorHash: selected.admission.executorHash, phase: 'mutate', payloadHash: hash(canonical(input)), payload: input };
    return decode(await transport.send(encode(command, broker.secret)), broker.secret).result;
  }
  async function verify(input, before) { return broker.validateReadback(selected, input, before, await broker.send(selected, 'verify', input)); }
  return { root, state, trace, broker, contract, selected, target, snapshot, intent, mutate, mutateExecutor, verify };
}
module.exports = { moduleFixture };
