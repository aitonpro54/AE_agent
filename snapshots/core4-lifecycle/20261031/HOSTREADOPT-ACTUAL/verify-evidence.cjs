'use strict';
// Offline consistency and sanitisation only; no runtime operator calls.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const dir = __dirname, check = (ok, code) => { if (!ok) throw Error(code); }, hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = name => JSON.parse(fs.readFileSync(path.join(dir, name)));
const o = read('operation.json'), before = read('preflight.json'), after = read('installed-readback.json'), first = read('configured-after-enable-first.json');
check(o.id === before.operation.id && after.operationId === o.id && after.owner.pid === first.status.pid && first.status.ready && first.isError === false && first.durationMs === 6388, 'configured_binding');
check(after.journalEvents === 24 && before.journalEvents === 24 && after.hashes.journal === before.hashes.journal && after.receiverSettled, 'history_binding');
check(after.phaseRecords.length === 11 && after.phaseRecords.every(r => r.sealVerified) && after.oldAdoptionArchived && after.host.aePid === 26308 && after.owner.pid === 9584 && after.previousOwnerProcess.status === 'absent', 'installed_binding');
check(hash(fs.readFileSync(o.witnessPath)) === o.witnessHash && o.distributionHash === read('official-distribution.json').distributionHash && after.packageHash === o.packageHash && after.distributionHash === o.distributionHash, 'package_witness_binding');
const modes = { stop: 'draining', 'stop-inspect': 'stopped', 'stopped-inspect': 'stopped-certifiable', 'stopped-certify': null, 'readopt-inspect': 'readopt-preflight', 'readopt-apply': 'readopt-completed-stopped', 'completed-inspect': 'readopt-completed-stopped', 'readopt-enable': 'enabled' };
for (const [name, phase] of Object.entries(modes)) { const v = read(name + '.json'); check(v.operationId === o.id && v.exitCode === 0 && v.error === null && v.stderr === '' && JSON.stringify(JSON.parse(v.stdout)) === JSON.stringify(v.result) && v.result.aeAuthority === false && (phase === null ? v.result.certified : v.result.phase === phase), 'operator_binding_' + name); }
check(read('readopt-enable.json').result.terminalHistorical === true && read('readopt-enable.json').result.currentRuntimeObserved === false && after.configuredStartup && after.runtimeStartedByHelper === false && after.cepConnected === false && after.nativeReadAfterEnable === false, 'coverage_boundary');
const forbidden = new Set(['panelToken', 'controlToken', 'leaseToken', 'brokerToken', 'receiverToken', 'startupToken', 'secret', 'password', 'credentials']);
function clean(v) { if (!v || typeof v !== 'object') return; for (const [k, child] of Object.entries(v)) { check(!forbidden.has(k), 'credential_field_' + k); clean(child); } }
const files = fs.readdirSync(dir).filter(n => /\.(?:json|cjs)$/.test(n) && n !== 'evidence-verification.json').sort(), hashes = {};
for (const name of files) { const bytes = fs.readFileSync(path.join(dir, name)); hashes[name] = hash(bytes); if (name.endsWith('.json')) clean(JSON.parse(bytes)); }
const report = { collectedAt: new Date().toISOString(), sourceCommit: '8ce5a58b89d78ac3a74d94f35b4e338838205e92', operationId: o.id, files: hashes, actualActionCalls: { stop: 1, certify: 1, readoptApply: 1, explicitEnable: 1, replay: 0, finish: 0 }, metadataAcceptance: true, configuredFirstCall: true, credentialFieldsExcluded: true, sourceTestsReplayed: 0, fullRelease: false, cepReconnect: 'awaiting-user-connect', nativeReadAfterEnable: false, titlesMutation: 0, aeRestart: 0, save: 0, productionSourceChanges: 0, rootEvidenceCorrectionsPreserved: true };
fs.writeFileSync(path.join(dir, 'evidence-verification.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); console.log(JSON.stringify(report));
