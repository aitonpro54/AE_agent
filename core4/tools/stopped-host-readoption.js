'use strict';
// Helper-only read-only foundation. No claim, adoption write, enable or runtime
// launch. Production lease issuance remains closed until a durable canonical
// readoption claim is implemented; JSON/evidence handles never issue a lease.
// Before that claim inspection observes current certified inode facts, not
// historical inode continuity. Only a pinned proof/handle detects later drift.
const { canonical, hash, fail } = require('../protocol/json');
const { observeOwnerProcess, classifyOwnerProcess } = require('../runtime/windows-owner-process');
const requests = new WeakMap(), evidence = new WeakMap();
const HEX = /^[a-f0-9]{64}$/;
function stoppedReadoptionCertificateRequest(capability) {
  const value = capability && requests.get(capability);
  if (!value) fail('stopped_readoption_evidence_brand');
  return value;
}
function stoppedReadoptionLeasePermit() { fail('stopped_readoption_lease_brand'); }
function inputs(options) {
  const keys = ['installation', 'descriptorPath', 'id', 'reservedServer'];
  if (!options || Object.getPrototypeOf(options) !== Object.prototype || Object.keys(options).length !== keys.length || keys.some(k => !Object.hasOwn(options, k))) fail('stopped_readoption_options');
  return Object.freeze({ ...options, installation: Object.freeze(structuredClone(options.installation)), mode: 'baseline' });
}
async function inspected(options) {
  const request = inputs(options), capability = Object.freeze({});
  requests.set(capability, request);
  try {
    const read = () => require('../runtime/stopped-certification').readStoppedReadoptionCertificate(capability);
    const first = read(), check = () => { if (canonical(read()) !== canonical(first)) fail('stopped_readoption_evidence_changed'); };
    for (const actor of first.actors) {
      const actual = await observeOwnerProcess(actor.pid);
      if (!['absent', 'pid-reused'].includes(classifyOwnerProcess({ pid: actor.pid, birthTicks: actor.birthTicks }, actual))) fail('stopped_readoption_process_not_dead');
      check();
    }
    check();
    return { options: { installation: request.installation, descriptorPath: request.descriptorPath, id: request.id, reservedServer: request.reservedServer }, facts: first.facts, actors: first.actors, proofHash: hash(first) };
  } finally { requests.delete(capability); }
}
function view(value) {
  return Object.freeze({ id: value.facts.id, phase: 'stopped-certified-baseline', proofHash: value.proofHash, inspectionOnly: true, runtimeStarted: false, aeAuthority: false });
}
async function inspectStoppedReadoption(options) { return view(await inspected(options)); }
async function verifyStoppedReadoptionEvidence(options) {
  if (!options || !HEX.test(options.expectedProofHash)) fail('stopped_readoption_expected_proof');
  const { expectedProofHash, ...request } = options, value = await inspected(request);
  if (value.proofHash !== expectedProofHash) fail('stopped_readoption_proof_changed');
  const handle = Object.freeze({}); evidence.set(handle, value); return handle;
}
function stoppedReadoptionEvidenceFacts(handle) {
  const value = handle && evidence.get(handle); if (!value) fail('stopped_readoption_evidence_brand');
  return Object.freeze({ ...view(value), facts: structuredClone(value.facts), actors: structuredClone(value.actors) });
}
async function assertStoppedReadoptionEvidence(handle) {
  const previous = handle && evidence.get(handle); if (!previous) fail('stopped_readoption_evidence_brand');
  const current = await inspected(previous.options);
  if (current.proofHash !== previous.proofHash) fail('stopped_readoption_evidence_changed');
  return stoppedReadoptionEvidenceFacts(handle);
}
module.exports = { inspectStoppedReadoption, verifyStoppedReadoptionEvidence, stoppedReadoptionEvidenceFacts, assertStoppedReadoptionEvidence,
  stoppedReadoptionCertificateRequest, stoppedReadoptionLeasePermit };
