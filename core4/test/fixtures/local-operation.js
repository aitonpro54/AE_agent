'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { hash } = require('../../protocol/json');
const { check } = require('../../protocol/schema');

function localOperation(moduleId, environment, confirm = () => true) {
  const root = path.resolve(__dirname, '../..');
  const directory = path.join(root, 'modules', moduleId);
  const { build } = require(path.join(directory, 'implementation.js'));
  const read = name => fs.readFileSync(path.join(directory, name));
  const contract = JSON.parse(read('contract.json'));
  const manifest = JSON.parse(read('artifact.json'));
  const admission = JSON.parse(fs.readFileSync(path.join(root, 'config/admissions', moduleId + '.json')));
  const { trustApprovalId, ...pins } = admission;
  const executor = read('executor.jsx');
  for (const name of ['implementation.js', 'contract.json', 'executor.jsx']) assert.equal(hash(read(name)), manifest.hashes[name], name);
  assert.deepEqual(pins, { moduleId, operationId: contract.operationId, artifactHash: hash(manifest),
    schemaHash: hash(contract.inputSchema), resultSchemaHash: hash(contract.snapshotSchema),
    effectPolicyHash: hash(contract.effectPolicy), executorHash: hash(executor), protocolVersion: 1, revoked: false });
  assert.ok(typeof trustApprovalId === 'string' && trustApprovalId);
  const state = { projectId: 'C:/fixture/local-operation.aep' };
  const jsx = vm.runInNewContext(executor.toString('utf8'), { ...environment(state), confirm });
  const plain = value => JSON.parse(JSON.stringify(value));
  const inspect = target => {
    const snapshot = plain(jsx.inspect(target));
    check(contract.snapshotSchema, snapshot);
    return snapshot;
  };
  function run(desired) {
    const before = inspect(desired);
    const built = build({ input: desired, evidence: before });
    assert.equal(built.operationId, contract.operationId);
    const input = built.input;
    check(contract.inputSchema, input);
    const result = plain(jsx.mutate({ ...input, _execution: { policyId: contract.executionPolicy,
      baselineRevision: before.revision, baselineProtected: before.protected, target: before.target } }));
    if (result.outcome === 'applied') check(contract.snapshotSchema, result.snapshot);
    return { before, input, result };
  }
  return { state, inspect, run, selected: { contract, admission, pin: hash(manifest) } };
}

module.exports = { localOperation };
