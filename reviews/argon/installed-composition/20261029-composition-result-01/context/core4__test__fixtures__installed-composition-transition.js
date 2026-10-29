'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { fork } = require('node:child_process');
const { recoveryFixture } = require('./native-read-recovery');
const { canonical, hash } = require('../../protocol/json');
const { openCompletionStore } = require('../../integrations/cep/completion-store');
const { createHttpPeer } = require('../../integrations/cep/http-peer');
const { mac } = require('../../integrations/cep/peer-protocol');
const http = require('node:http');
async function transition(historicalPackage) {
  const f = await recoveryFixture({ historicalPackage, selector: 'readonly' }), prefix = fs.readFileSync(f.journal);
  const child = fork(path.join(__dirname, 'disposition-child.js'), [f.fixtureFile], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true }); let stderr = '', done;
  child.stdout.resume(); child.stderr.on('data', b => { stderr += b; });
  child.on('message', message => { if (message.event === 'native_read_disposition_authorization') { const { event, ...body } = message; child.send({ ...body, decision: 'approve' }); } if (message.event === 'fixture_result') done = message.value; });
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); }); assert.equal(code, 0, stderr); assert.equal(done.packageHash, f.candidate.packageHash);
  const d = require('../../runtime/installation').verifyInstallation(f.args.descriptor), events = fs.readFileSync(f.journal).toString().trimEnd().split('\n').map(JSON.parse);
  assert.equal(JSON.parse(fs.readFileSync(path.join(d.releaseDir, 'runtime/composition.json'))).id, 'readonly'); assert.ok(fs.readFileSync(f.journal).subarray(0, prefix.length).equals(prefix)); assert.equal(events[2].type, 'unknown'); assert.equal(events[3].type, 'terminal-read-failure-disposition');
  const options = { descriptorPath: f.args.descriptor, journalPrefixBytes: prefix }, reader = require('../../runtime/native-read-disposition'); assert.ok(reader.validateDisposition(events[3], options));
  const bad = structuredClone(events[3]); bad.controlMac = '0'.repeat(64); assert.throws(() => reader.validateDisposition(bad, options));
  const store = openCompletionStore({ directory: f.receiver, installationContext: { descriptorPath: f.args.descriptor } }); assert.equal(store.closed, false); assert.equal(store.fault, false); assert.equal(store.get(f.command.commandId).state, 'unknown'); assert.ok(store.get(f.command.commandId).terminalDisposition); assert.throws(() => store.begin(f.command, f.binding), /duplicate_command_no_replay/); store.close();
  // A late ACK authenticates with the new panel role secret but preserves old pins.
  const peer = createHttpPeer({ installation: d, directory: f.receiver, port: 0, asset: { assetKey: 'project-inspection-v1', executorHash: f.command.executorHash }, installationContext: { descriptorPath: f.args.descriptor } }); await peer.listen();
  function raw(route, value) { return new Promise((resolve, reject) => { const request = http.request('http://127.0.0.1:' + peer.status().port + route, { method: 'POST', agent: false, headers: { Origin: 'null', 'Content-Type': 'application/json' } }, response => { let data = ''; response.on('data', b => { data += b; }); response.on('end', () => resolve({ status: response.statusCode, value: JSON.parse(data) })); }); request.on('error', reject); request.end(canonical(value)); }); }
  try {
    const challenge = (await raw('/challenge', { role: 'panel' })).value, peerId = 'transition-fixture'; assert.equal((await raw('/link', { challenge, peerId, proof: mac({ challenge, peerId }, d.panelToken) })).status, 200);
    const payload = { commandId: f.command.commandId, originalBinding: f.binding, pins: f.pins, result: { readFailureVersion: 1, outcome: 'rejected', code: 'host_registry_unavailable' } };
    const before = fs.readFileSync(f.journal);
    for (let sequence = 1; sequence <= 2; sequence++) { const body = { epoch: challenge.epoch, peerId, sequence, method: 'POST', path: '/complete', payload }, response = await raw('/complete', { body, mac: mac(body, d.panelToken) }); assert.equal(response.status, 200, JSON.stringify(response.value)); assert.equal(response.value.mac, mac(response.value.body, d.panelToken)); }
    assert.ok(before.equals(fs.readFileSync(f.journal)));
  } finally { await peer.close(); }
  const prior = fs.readFileSync(f.journal).toString().trimEnd().split('\n').map(JSON.parse), command = { ...f.command, commandId: 'additional-unknown' }, binding = require('../../protocol/dispatch').dispatchBinding(command, f.binding.receiverStoreIdentity); let tail = prior.at(-1);
  for (const entry of [{ type: 'begin', commandId: command.commandId, commandDigest: hash(command), command, originalBinding: binding }, { type: 'unknown', commandId: command.commandId }]) { const body = { ...entry, seq: tail.seq + 1, previousHash: tail.recordHash }; tail = { ...body, recordHash: hash(body) }; fs.appendFileSync(f.journal, canonical(tail) + '\n'); }
  const closed = openCompletionStore({ directory: f.receiver, installationContext: { descriptorPath: f.args.descriptor } }); assert.equal(closed.closed, true); assert.equal(closed.fault, false); assert.ok(closed.get(f.command.commandId).terminalDisposition); closed.close(); assert.ok(fs.existsSync(f.owner));
  return { historicalPackageHash: f.pkg.packageHash, candidatePackageHash: f.candidate.packageHash, historicalFormat: f.pkg.release.format, candidateFormat: f.candidate.release.format, signedDisposition: true, originalUnknownPreserved: true, duplicateNoReplay: true, lateAckCount: 2, additionalUnknownClosesStore: true, nativeCalls: 0, productionCalls: 0 };
}
module.exports = { transition };
