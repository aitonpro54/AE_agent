'use strict';
// Installer-only port. Runtime/store never imports this module or accepts a
// pending-plan flag. Both lease AND the same prepared-plan object are required.
const fs = require('node:fs');
const path = require('node:path');
const { hash, canonical, fail } = require('../protocol/json');
const { assertInstallLease } = require('../runtime/install-lease');
const { resolveHistoricalForInstall } = require('../runtime/installation-lineage');
const { inspectSealedDispositionFacts, verifyDispositionInstallEdge, parseJournalBytes } = require('../runtime/native-read-disposition');
function inspectPreparedDisposition(event, { descriptorPath, cepDir, journalPrefixBytes, plan, lease }) {
  // Lazy require avoids a module-init cycle; this is always the same module
  // instance that produced the in-memory plan, never JSON rehydration.
  const fingerprint = require('./install-core4').assertPreparedInstallPlan(plan);
  const scope = { installRoot: plan.descriptor.installRoot, stateDir: plan.descriptor.stateDir, descriptorPath };
  const held = assertInstallLease(lease, scope);
  if (descriptorPath !== plan.descriptorPath || cepDir !== plan.cepDir) fail('prepared_disposition_scope');
  const resolved = resolveHistoricalForInstall({ descriptorPath, descriptorHash: event.seal.historicalDescriptorHash, cepDir, lease, plan });
  const data = inspectSealedDispositionFacts(event, { historical: resolved.historical, journalPrefixBytes });
  if (resolved.edgeFromHistorical) verifyDispositionInstallEdge(event, resolved.edgeFromHistorical);
  else {
    require('./install-core4').assertDurablePreparedInstallPlan(plan, { lease });
    const a = data.authorization;
    if (resolved.historical.descriptorHash !== hash(fs.readFileSync(descriptorPath)) || fingerprint.transactionId !== a.installTransactionId || fingerprint.packageHash !== a.candidatePackageHash || fingerprint.appliedDescriptorHash !== a.appliedDescriptorHash || fingerprint.previousDescriptorHash !== a.historicalDescriptorHash || fingerprint.preparedPlanHash !== a.preparedPlanHash || fingerprint.preparedStateHash !== a.preparedStateHash || !['validated', 'disposition-appended', 'receiver-archived'].includes(held.phase)) fail('prepared_disposition_plan_mismatch');
    const candidate = event.seal.candidate, d = plan.descriptor;
    if (candidate.installRoot !== d.installRoot || candidate.stateDir !== d.stateDir || candidate.cepDir !== d.cepDir || candidate.nodePath !== d.nodePath || candidate.nodeHash !== d.nodeHash || candidate.nodeVersion !== d.nodeVersion) fail('prepared_disposition_candidate');
  }
  return Object.freeze({ facts: data.semantic, requiresInstallSwitch: !resolved.edgeFromHistorical });
}
function assertPreparedReceiverJournalSettled({ directory, descriptorPath, cepDir, plan, lease }) {
  require('./install-core4').assertPreparedInstallPlan(plan);
  const held = assertInstallLease(lease, { installRoot: plan.descriptor.installRoot, stateDir: plan.descriptor.stateDir, descriptorPath });
  const bytes = fs.readFileSync(path.join(directory, 'completions.ndjson')), parsed = parseJournalBytes(bytes), records = new Map(); let identity;
  for (const event of parsed.events) {
    if (event.type === 'origin') { if (event.seq !== 1 || typeof event.identity !== 'string') fail('receiver_store_corrupt'); identity = event.identity; }
    else if (event.type === 'begin') {
      if (records.has(event.commandId) || event.commandDigest !== hash(event.command) || event.originalBinding?.receiverStoreIdentity !== identity) fail('receiver_store_corrupt');
      const fields = ['controllerId', 'channelEpoch', 'commandId', 'moduleId', 'operationId', 'executorHash', 'payloadHash', 'phase'], binding = { ...Object.fromEntries(fields.map(k => [k, event.command[k]])), receiverStoreIdentity: identity };
      if (canonical(event.originalBinding) !== canonical({ ...binding, receiptRef: hash(binding) })) fail('receiver_store_corrupt'); records.set(event.commandId, { state: 'ongoing' });
    } else if (event.type === 'unknown' || event.type === 'complete') { const prior = records.get(event.commandId); if (prior?.state !== 'ongoing') fail('receiver_store_corrupt'); prior.state = event.type === 'complete' ? 'completed' : 'unknown'; }
    else if (event.type === 'terminal-read-failure-disposition') {
      const prior = records.get(event.commandId); if (prior?.state !== 'unknown' || prior.admittedForInstall) fail('receiver_store_corrupt');
      const checked = inspectPreparedDisposition(event, { descriptorPath, cepDir, plan, lease, journalPrefixBytes: Buffer.from(parsed.lines.slice(0, 3).join('\n') + '\n') });
      if (checked.requiresInstallSwitch && (held.phase !== 'receiver-archived' || held.checkpoint?.journalHash !== hash(bytes))) fail('prepared_disposition_archive_not_certified');
      prior.admittedForInstall = true;
    } else fail('receiver_store_corrupt');
  }
  if ([...records.values()].some(r => r.state !== 'completed' && !r.admittedForInstall)) fail('runtime_receiver_unresolved');
}
module.exports = { inspectPreparedDisposition, assertPreparedReceiverJournalSettled };
