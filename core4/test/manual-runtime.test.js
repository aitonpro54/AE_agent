'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const http = require('node:http');
const { Broker } = require('../core/broker');
const { hash, canonical } = require('../protocol/json');
const { createManualPolicy } = require('../runtime/manual-policy');
const { createWindowsReservationProvider } = require('../runtime/windows-reservation-provider');
const { createHttpPeer } = require('../integrations/cep/http-peer');
const { mac } = require('../integrations/cep/peer-protocol');
const { buildPackage } = require('../tools/package-installable');
const { decode, encode } = require('../protocol/codec');
const { validateExecutionPolicyPort, validateReservationHandle } = require('../core/authority');
const { initialState, environment } = require('./fixtures/ae');
const root = path.resolve(__dirname, '..');
const { harness } = require('./fixtures/manual-http-runtime');
test('manual-runtime actual Broker HTTP compiled JSX generic flow uses one native confirm and original local transaction receipt without session', async t => {
  const h = await harness(); t.after(() => h.close()); const request = await h.proposal(); const result = await h.broker.run(request);
  assert.equal(result.state, 'succeeded', JSON.stringify(result)); assert.equal(h.state.text, 'After'); assert.equal(h.state.counts.titles, 1); assert.equal(h.confirmations, 1);
  const command = h.broker.ledger.commands()[0]; assert.equal(command.verificationKind, 'local-transaction-receipt'); assert.equal(command.target.sessionId, undefined); assert.equal(command.executionPolicy.executionScope.origin.aePid, 123456);
  const checkpoint = h.broker.ledger.events.find(e => e.type === 'checkpoint'); assert.equal(checkpoint.preimage.text, 'Before'); assert.equal(checkpoint.checkpoint.digest, command.checkpoint.digest);
  const second = await h.proposal('Again'); assert.equal((await h.broker.run(second)).state, 'succeeded'); assert.equal(h.state.counts.titles, 2);
});
test('manual-runtime native cancellation and post-confirm drift do not set text; fresh proposal required', async t => {
  for (const mode of ['cancel', 'drift']) {
    const h = await harness({ confirm: ({ state }) => { if (mode === 'drift') state.text = 'Manual edit'; return mode !== 'cancel'; } }); t.after(() => h.close()); const result = await h.broker.run(await h.proposal());
    assert.equal(result.state, 'stopped'); assert.equal(h.state.counts.titles, 0); assert.equal(h.broker.ledger.commands()[0].state, 'rejected');
  }
});
test('manual-runtime absent adoption and ambiguous process/managed writer fail before mutation delivery', async t => {
  const absent = await harness({ adopt: false }); t.after(() => absent.close()); const result = await absent.broker.run(await absent.proposal()); assert.equal(result.code, 'resource_reservation_provider_unavailable'); assert.equal(absent.state.counts.titles, 0); assert.equal(absent.broker.ledger.commands().length, 0);
  const h = await harness(); t.after(() => h.close()); const request = await h.proposal();
  fs.writeFileSync(path.join(h.installation.stateDir, 'host-adoption.json'), '{}'); const denied = await h.broker.run(request); assert.equal(denied.state, 'stopped'); assert.equal(h.state.counts.titles, 0);
});
test('manual-runtime setter uncertainty keeps UNKNOWN, durable receiver fence and no replay', async t => {
  const h = await harness({ flags: { textSetterThrows: true } }); t.after(() => h.close()); const request = await h.proposal(); const result = await h.broker.run(request);
  assert.equal(result.state, 'stopped'); assert.equal(h.state.counts.titles, 1); assert.equal(h.broker.ledger.commands()[0].state, 'UNKNOWN'); assert.equal(h.peer.status().storeClosed, true);
  await assert.rejects(h.proposal('Again')); assert.equal(h.state.counts.titles, 1); const task = await h.broker.reconcile({ taskId: request.taskId }); assert.equal(task.commands[0].state, 'UNKNOWN');
});
test('manual-runtime fresh OS process identity, named managed writers and observation TTL are required before delivery', async t => {
  const cases = [
    [o => ({ ...o, processes: [...o.processes, o.processes[0]] }), 'ambiguous_ae_process'],
    [o => ({ ...o, processes: [{ ...o.processes[0], birth: '2026-01-02T00:00:00.0000000Z' }] }), 'host_or_managed_writer_changed'],
    [o => ({ ...o, endpoints: [{ port: 3456, state: 'active' }, o.endpoints[1]] }), 'known_managed_writer_or_unknown_probe'],
    [o => ({ ...o, endpoints: [] }), 'known_managed_writer_or_unknown_probe'],
    [o => ({ ...o, observedAt: new Date(Date.now() - 6000).toISOString() }), 'host_observation_stale']
  ];
  for (const [probeOverride, code] of cases) {
    const h = await harness({ probeOverride }); t.after(() => h.close()); const result = await h.broker.run(await h.proposal());
    assert.equal(result.code, code, JSON.stringify(result)); assert.equal(h.state.counts.titles, 0); assert.equal(h.broker.ledger.commands().length, 0); assert.equal(h.confirmations, 0);
  }
});
test('manual-runtime v1 UNKNOWN fence still overlaps session-free target; known other-machine constraint is separate', async t => {
  const h = await harness(); t.after(() => h.close());
  h.broker.ledger.append({ type: 'constraint', record: { constraintId: 'legacy-v1', schemaVersion: 1, resource: { projectId: h.state.projectId, sessionId: 'old-incarnation' }, owner: 'other-owner', checkpointRef: 'old', allowedEffects: ['layer.text'], reservationOwner: 'other-owner', unresolvedOutcome: true, revision: null, provenance: 'explicit-offline-v1-conflict' } });
  const denied = await h.broker.run(await h.proposal()); assert.equal(denied.code, 'shared_resource_fenced'); assert.equal(h.state.counts.titles, 0);
  const other = await harness(); t.after(() => other.close());
  other.broker.ledger.append({ type: 'constraint', record: { constraintId: 'other-machine', schemaVersion: 2, resource: { projectId: other.state.projectId }, origin: { machineId: 'explicit-other-machine', aePid: 456789, aeProcessBirth: 'other-birth' }, owner: 'other-owner', checkpointRef: 'old', allowedEffects: ['layer.text'], reservationOwner: 'other-owner', unresolvedOutcome: true, revision: null, provenance: 'explicit-offline-other-machine-record' } });
  assert.equal((await other.broker.run(await other.proposal())).state, 'succeeded');
});
test('manual-runtime forged policy/reservation JSON never receives a private brand; tampered original receipt cannot succeed and real original proof reconciles without replay', async t => {
  assert.throws(() => validateExecutionPolicyPort({ describe() {} }), /untrusted_execution_policy_port/); assert.throws(() => validateReservationHandle({ ref: 'json' }), /untrusted_reservation_handle/);
  const h = await harness(); t.after(() => h.close()); const request = await h.proposal(), completion = h.broker.transport.completion;
  h.broker.transport.completion = async commandId => { const frame = await completion(commandId), body = decode(frame, h.broker.secret); body.response.result.transactionReceipt.checkpointDigest = 'tampered'; return encode(body, h.broker.secret); };
  const result = await h.broker.run(request); assert.equal(result.code, 'local_transaction_receipt_mismatch'); assert.equal(h.broker.ledger.commands()[0].state, 'UNKNOWN'); assert.equal(h.state.counts.titles, 1);
  h.broker.transport.completion = completion;
  const task = await h.broker.reconcile({ taskId: request.taskId }); assert.equal(task.commands[0].state, 'succeeded'); assert.equal(h.state.counts.titles, 1); assert.equal(h.confirmations, 1);
});
test('manual-runtime final synchronous reservation guard rejects expiry before send with no setter', async t => {
  const h = await harness(); t.after(() => h.close()); const request = await h.proposal();
  h.broker.hooks.afterIntent = async () => { await new Promise(resolve => setTimeout(resolve, 2100)); };
  const result = await h.broker.run(request); assert.equal(result.code, 'reservation_observation_expired'); assert.equal(h.state.counts.titles, 0); assert.equal(h.broker.ledger.commands()[0].state, 'rejected');
});
test('manual-runtime authenticated but wrong protocol version cannot certify original completion', async t => {
  const h = await harness(); t.after(() => h.close()); const request = await h.proposal(), completion = h.broker.transport.completion;
  h.broker.transport.completion = async commandId => { const body = decode(await completion(commandId), h.broker.secret); body.response.protocolVersion = 99; return encode(body, h.broker.secret); };
  assert.equal((await h.broker.run(request)).code, 'original_completion_correlation'); assert.equal(h.broker.ledger.commands()[0].state, 'UNKNOWN'); assert.equal(h.state.counts.titles, 1);
  h.broker.transport.completion = completion; assert.equal((await h.broker.reconcile({ taskId: request.taskId })).commands[0].state, 'succeeded'); assert.equal(h.state.counts.titles, 1);
});
test('manual-runtime explicit oneStep works with physically absent engine and unrelated packages', async t => {
  const h = await harness({ minimalBroker: true }); t.after(() => h.close());
  for (const relative of ['plan-engine', 'modules/titles', 'modules/photo-placeholder']) assert.equal(fs.existsSync(path.join(h.brokerRoot, relative)), false);
  const request = await h.proposal(); assert.equal((await h.broker.run(request)).state, 'succeeded'); assert.equal(h.state.counts.titles, 1);
});
test('manual-runtime lexical ES3 JSON codec is data-only, matches native JSON on Unicode/control values and denies malformed/deep/duplicate/prototype input', () => {
  const source = fs.readFileSync(path.join(root, 'runtime/host/json-codec.jsx'), 'utf8'); assert.ok(!/\b(?:eval|Function)\s*\(/.test(source));
  const context = vm.createContext({ JSON: undefined }); vm.runInContext('Object.keys=undefined;', context); const codec = vm.runInContext(source, context);
  const values = [null, true, false, 0, -0, 1.25, -100e-3, 'Кириллица " \\ \u0000\b\f\n\r\t\u2028\u2029 😀 \ud800 \udfff', [1, 'я', null], { quote: '"', nested: { a: [true, false, '🔬'] } }];
  for (const value of values) { const parsed = codec.parse(JSON.stringify(value)), encoded = codec.stringify(parsed); assert.deepEqual(JSON.parse(encoded), JSON.parse(JSON.stringify(value))); assert.deepEqual(JSON.parse(JSON.stringify(parsed)), JSON.parse(JSON.stringify(value))); }
  assert.throws(() => codec.stringify(new (class OpaqueHostValue {})()), /host_json_invalid/);
  for (const value of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"__proto__":{}}', '{"constructor":1}', '{"prototype":1}', '[1,]', '{"a":}', '01', '+1', '1e999', '"bad\nstring"', 'true trailing', '['.repeat(26) + '0' + ']'.repeat(26), '"' + 'x'.repeat(262145) + '"']) assert.throws(() => codec.parse(value), /host_json_invalid/, value.slice(0, 64));
  let executions = 0; const host = vm.createContext({ JSON: undefined, app: { get project() { executions++; throw new Error('executor reached'); } } }); vm.runInContext('Object.keys=undefined;', host); const pkg = buildPackage(); vm.runInContext(Buffer.from(pkg.files['cep/jsx/registry.jsx'], 'base64').toString(), host);
  for (const invalid of ['{"assetKey":"project-inspection-v1","assetKey":"titles-current-target-v1"}', '{"__proto__":1}', '{broken']) assert.throws(() => host.AECore4Host.dispatch(invalid), /host_json_invalid/);
  assert.equal(executions, 0); assert.equal(vm.runInContext('typeof JSON', host), 'undefined'); assert.equal(vm.runInContext('typeof Object.keys', host), 'undefined');
});
test('manual-runtime known paragraph Enumerator is normalized to numeric protected value; unknown host objects fail closed', () => {
  const state = initialState(); delete state.sessionId; const env = environment(state, () => {});
  class EnumFixture { constructor(number, label) { this.number = number; this.label = label; } valueOf() { return this.number; } toString() { return this.label; } }
  const known = new EnumFixture(17, 'ParagraphJustification.LEFT_JUSTIFY'); let current = known;
  const prop = env.app.project.item(1).layer(2).property('ADBE Text Properties').property('ADBE Text Document');
  Object.defineProperty(prop, 'value', { get() { const doc = { text: state.text, ...state.style, justification: current }; doc.characterRange = () => ({ ...state.style }); return doc; } });
  const context = vm.createContext({ ...env, JSON: undefined, ParagraphJustification: { LEFT_JUSTIFY: known } }); vm.runInContext('Object.keys=undefined;', context);
  const pkg = buildPackage(); vm.runInContext(Buffer.from(pkg.files['cep/jsx/registry.jsx'], 'base64').toString(), context);
  const admission = JSON.parse(fs.readFileSync(path.join(root, 'config/admissions/titles-current-target.json'))), request = JSON.stringify({ assetKey: 'titles-current-target-v1', phase: 'inspect', typedPayload: { projectId: state.projectId, compId: 1, layerId: 102 }, pins: { executorHash: admission.executorHash } });
  const snapshot = JSON.parse(context.AECore4Host.dispatch(request)); assert.equal(JSON.parse(snapshot.protected).paragraph.justification, 17);
  current = new EnumFixture(999, 'UnknownHostObject'); const refused = JSON.parse(context.AECore4Host.dispatch(request)); assert.equal(refused.readFailureVersion, 1); assert.equal(state.counts.titles, 0);
});
