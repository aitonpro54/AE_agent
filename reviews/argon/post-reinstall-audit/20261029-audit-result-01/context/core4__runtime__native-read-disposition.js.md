# core4/runtime/native-read-disposition.js

Commit: e6cde7c1f061763b6d0008162580039d2717aeb7
Full source SHA-256: 20053d0df8780feb975bf3302efd0cd32f07770c752d1acefc100f96fefaeb5b
Classification: INTERNAL; source code/documentation only.

## Source lines 73-100

```text
73:   const facts = seal.facts; exact(facts, ['version', 'witnessHash', 'sourceThread', 'sourceTurn', 'sourceCommandItem', 'originalManagedPid', 'originalManagedExitCode', 'originalDelivered', 'originalTimeout', 'mutatingCommands', 'files', 'producer']);
74:   if (facts.version !== 1 || facts.witnessHash !== p.provenanceHash || !HASH.test(facts.witnessHash) || facts.originalManagedPid !== p.managedPid || !Number.isSafeInteger(facts.originalManagedPid) || facts.originalManagedPid < 1 || facts.originalManagedExitCode !== 0 || facts.originalDelivered !== true || facts.originalTimeout !== 'host_callback_timeout' || facts.mutatingCommands !== 0 || ['sourceThread', 'sourceTurn', 'sourceCommandItem'].some(k => typeof facts[k] !== 'string' || !facts[k])) fail('disposition_provenance_facts');
75:   const fileNames = ['context.json', 'requests.jsonl', 'stdio.raw.jsonl', 'exit.jsonl', 'original-managed-command-evidence.json', 'original-receiver-journal.jsonl'].sort();
76:   if (!Array.isArray(facts.files) || canonical(facts.files.map(f => f.name).sort()) !== canonical(fileNames)) fail('disposition_provenance_files'); for (const file of facts.files) { exact(file, ['name', 'sha256']); if (!HASH.test(file.sha256)) fail('disposition_provenance_files'); }
77:   if (facts.files.find(f => f.name === 'original-receiver-journal.jsonl').sha256 !== hash(prefix)) fail('disposition_provenance_journal');
78:   const producer = facts.producer; exact(producer, ['driverHash', 'sourceAHash', 'pid', 'exitCode', 'globalTimeoutMs', 'completionTimeoutMs', 'contextHash', 'stdoutHash', 'exitHash']);
79:   if (producer.driverHash !== 'b763348b9a6139b2b6bd143a1cc25bc38b3bc3c2ca50d37ca584d2a34691196a' || producer.sourceAHash !== SOURCE_A || !Number.isSafeInteger(producer.pid) || producer.pid < 1 || producer.exitCode !== 0 || producer.globalTimeoutMs !== 600000 || producer.completionTimeoutMs !== 15000 || ['contextHash', 'stdoutHash', 'exitHash'].some(k => !HASH.test(producer[k]))) fail('disposition_producer_facts');
80:   exact(seal.candidate, ['packageHash', 'installRoot', 'stateDir', 'descriptorPath', 'cepDir', 'nodePath', 'nodeHash', 'nodeVersion']);
81:   if (!HASH.test(seal.candidate.packageHash) || seal.candidate.installRoot !== d.installRoot || seal.candidate.stateDir !== d.stateDir || seal.candidate.descriptorPath !== path.join(d.installRoot, 'installation.json') || seal.candidate.cepDir !== seal.oldCepDir || !path.isAbsolute(seal.candidate.nodePath) || !HASH.test(seal.candidate.nodeHash) || !/^v(2\d|[3-9]\d)\./.test(seal.candidate.nodeVersion)) fail('disposition_candidate');
82:   return Object.freeze({ command: original.command, binding: original.binding, pins, result: receipt.result, journalPrefixHash: hash(prefix), journalTailHash: original.unknown.recordHash });
83: }
84: function inspectSealedDispositionFacts(event, { historical, journalPrefixBytes }) {
85:   exact(event, ['type', 'dispositionVersion', 'commandId', 'seal', 'authorization', 'controlMac', 'seq', 'previousHash', 'recordHash']);
86:   if (event.type !== 'terminal-read-failure-disposition' || event.dispositionVersion !== 1 || event.seq !== 4) fail('disposition_event');
87:   const semantic = validateCaptureSeal(event.seal, historical, journalPrefixBytes), a = event.authorization;
88:   exact(a, ['domain', 'version', 'operation', 'proofHash', 'nonce', 'operatorClosureHash', 'installationId', 'receiverStoreIdentity', 'commandId', 'journalPrefixHash', 'journalTailHash', 'historicalDescriptorHash', 'candidatePackageHash', 'installTransactionId', 'appliedDescriptorHash', 'preparedPlanHash', 'preparedStateHash', 'dispositionTransactionId']);
89:   if (a.domain !== DOMAIN || a.version !== 1 || a.operation !== 'terminal-read-failure-disposition-and-install' || a.proofHash !== hash(event.seal) || !HASH.test(a.nonce) || !HASH.test(a.operatorClosureHash) || a.installationId !== historical.descriptor.installationId || a.receiverStoreIdentity !== semantic.binding.receiverStoreIdentity || a.commandId !== semantic.command.commandId || a.journalPrefixHash !== semantic.journalPrefixHash || a.journalTailHash !== semantic.journalTailHash || a.historicalDescriptorHash !== historical.descriptorHash || a.candidatePackageHash !== event.seal.candidate.packageHash || !UUID.test(a.installTransactionId) || !UUID.test(a.dispositionTransactionId) || !HASH.test(a.appliedDescriptorHash) || !HASH.test(a.preparedPlanHash) || !HASH.test(a.preparedStateHash) || event.commandId !== a.commandId || event.previousHash !== a.journalTailHash || !validMac({ domain: DOMAIN, seal: event.seal, authorization: a }, event.controlMac, historical.descriptor.controlToken)) fail('disposition_control_authorization');
90:   // Pure facts/crypto inspection only. This return is not runtime settlement.
91:   return Object.freeze({ semantic, authorization: a });
92: }
93: function verifyDispositionInstallEdge(event, edge) {
94:   const a = event.authorization, c = event.seal.candidate;
95:   if (!edge || edge.transactionId !== a.installTransactionId || edge.childPackageHash !== a.candidatePackageHash || edge.childDescriptorHash !== a.appliedDescriptorHash || edge.preparedPlanHash !== a.preparedPlanHash || edge.preparedStateHash !== a.preparedStateHash || edge.childNodePath !== c.nodePath || edge.childNodeHash !== c.nodeHash || edge.childNodeVersion !== c.nodeVersion || edge.childCepDir !== c.cepDir) fail('disposition_install_lineage');
96: }
97: function validateDisposition(event, options = {}) {
98:   if (Object.keys(options).some(key => !['descriptorPath', 'cepDir', 'journalPrefixBytes'].includes(key))) fail('runtime_disposition_context');
99:   const { descriptorPath, cepDir, journalPrefixBytes } = options;
100:   const resolved = resolveHistoricalInstallation({ descriptorPath, descriptorHash: event.seal.historicalDescriptorHash, cepDir });
```

