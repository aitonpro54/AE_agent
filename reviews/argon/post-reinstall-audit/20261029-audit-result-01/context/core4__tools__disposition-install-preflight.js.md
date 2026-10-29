# core4/tools/disposition-install-preflight.js

Commit: e6cde7c1f061763b6d0008162580039d2717aeb7
Full source SHA-256: 0276831b78e8157117532ed815717f39d12f2ad120338d4a5cb2612ee6df55e8
Classification: INTERNAL; source code/documentation only.

## Source lines 1-49

```text
1: 'use strict';
2: // Installer-only port. Runtime/store never imports this module or accepts a
3: // pending-plan flag. Both lease AND the same prepared-plan object are required.
4: const fs = require('node:fs');
5: const path = require('node:path');
6: const { hash, canonical, fail } = require('../protocol/json');
7: const { assertInstallLease } = require('../runtime/install-lease');
8: const { resolveHistoricalForInstall } = require('../runtime/installation-lineage');
9: const { inspectSealedDispositionFacts, verifyDispositionInstallEdge, parseJournalBytes } = require('../runtime/native-read-disposition');
10: function inspectPreparedDisposition(event, { descriptorPath, cepDir, journalPrefixBytes, plan, lease }) {
11:   // Lazy require avoids a module-init cycle; this is always the same module
12:   // instance that produced the in-memory plan, never JSON rehydration.
13:   const fingerprint = require('./install-core4').assertPreparedInstallPlan(plan);
14:   const scope = { installRoot: plan.descriptor.installRoot, stateDir: plan.descriptor.stateDir, descriptorPath };
15:   const held = assertInstallLease(lease, scope);
16:   if (descriptorPath !== plan.descriptorPath || cepDir !== plan.cepDir) fail('prepared_disposition_scope');
17:   const resolved = resolveHistoricalForInstall({ descriptorPath, descriptorHash: event.seal.historicalDescriptorHash, cepDir, lease, plan });
18:   const data = inspectSealedDispositionFacts(event, { historical: resolved.historical, journalPrefixBytes });
19:   if (resolved.edgeFromHistorical) verifyDispositionInstallEdge(event, resolved.edgeFromHistorical);
20:   else {
21:     require('./install-core4').assertDurablePreparedInstallPlan(plan, { lease });
22:     const a = data.authorization;
23:     if (resolved.historical.descriptorHash !== hash(fs.readFileSync(descriptorPath)) || fingerprint.transactionId !== a.installTransactionId || fingerprint.packageHash !== a.candidatePackageHash || fingerprint.appliedDescriptorHash !== a.appliedDescriptorHash || fingerprint.previousDescriptorHash !== a.historicalDescriptorHash || fingerprint.preparedPlanHash !== a.preparedPlanHash || fingerprint.preparedStateHash !== a.preparedStateHash || !['validated', 'disposition-appended', 'receiver-archived'].includes(held.phase)) fail('prepared_disposition_plan_mismatch');
24:     const candidate = event.seal.candidate, d = plan.descriptor;
25:     if (candidate.installRoot !== d.installRoot || candidate.stateDir !== d.stateDir || candidate.cepDir !== d.cepDir || candidate.nodePath !== d.nodePath || candidate.nodeHash !== d.nodeHash || candidate.nodeVersion !== d.nodeVersion) fail('prepared_disposition_candidate');
26:   }
27:   return Object.freeze({ facts: data.semantic, requiresInstallSwitch: !resolved.edgeFromHistorical });
28: }
29: function assertPreparedReceiverJournalSettled({ directory, descriptorPath, cepDir, plan, lease }) {
30:   require('./install-core4').assertPreparedInstallPlan(plan);
31:   const held = assertInstallLease(lease, { installRoot: plan.descriptor.installRoot, stateDir: plan.descriptor.stateDir, descriptorPath });
32:   const bytes = fs.readFileSync(path.join(directory, 'completions.ndjson')), parsed = parseJournalBytes(bytes), records = new Map(); let identity;
33:   for (const event of parsed.events) {
34:     if (event.type === 'origin') { if (event.seq !== 1 || typeof event.identity !== 'string') fail('receiver_store_corrupt'); identity = event.identity; }
35:     else if (event.type === 'begin') {
36:       if (records.has(event.commandId) || event.commandDigest !== hash(event.command) || event.originalBinding?.receiverStoreIdentity !== identity) fail('receiver_store_corrupt');
37:       const fields = ['controllerId', 'channelEpoch', 'commandId', 'moduleId', 'operationId', 'executorHash', 'payloadHash', 'phase'], binding = { ...Object.fromEntries(fields.map(k => [k, event.command[k]])), receiverStoreIdentity: identity };
38:       if (canonical(event.originalBinding) !== canonical({ ...binding, receiptRef: hash(binding) })) fail('receiver_store_corrupt'); records.set(event.commandId, { state: 'ongoing' });
39:     } else if (event.type === 'unknown' || event.type === 'complete') { const prior = records.get(event.commandId); if (prior?.state !== 'ongoing') fail('receiver_store_corrupt'); prior.state = event.type === 'complete' ? 'completed' : 'unknown'; }
40:     else if (event.type === 'terminal-read-failure-disposition') {
41:       const prior = records.get(event.commandId); if (prior?.state !== 'unknown' || prior.admittedForInstall) fail('receiver_store_corrupt');
42:       const checked = inspectPreparedDisposition(event, { descriptorPath, cepDir, plan, lease, journalPrefixBytes: Buffer.from(parsed.lines.slice(0, 3).join('\n') + '\n') });
43:       if (checked.requiresInstallSwitch && (held.phase !== 'receiver-archived' || held.checkpoint?.journalHash !== hash(bytes))) fail('prepared_disposition_archive_not_certified');
44:       prior.admittedForInstall = true;
45:     } else fail('receiver_store_corrupt');
46:   }
47:   if ([...records.values()].some(r => r.state !== 'completed' && !r.admittedForInstall)) fail('runtime_receiver_unresolved');
48: }
49: module.exports = { inspectPreparedDisposition, assertPreparedReceiverJournalSettled };
```

