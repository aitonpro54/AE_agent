'use strict';
// Read-only installed facts. The only write is a sanitised, exclusive snapshot.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), cp = require('node:child_process');
const afterIdle = process.argv[2] === 'after-idle';
if (process.argv.length > (afterIdle ? 3 : 2)) throw Error('unsupported_observation_mode');
const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, 'idle-baseline.json')));
const previous = JSON.parse(fs.readFileSync(path.join(__dirname, '../OWNERPREREADY/installed-readback.json')));
const meta = JSON.parse(fs.readFileSync(path.join(__dirname, '../OWNERPREREADY/transition.json')));
require(path.join(meta.output, 'tools/standalone-installer')).verifyStandalone(meta.output, meta.distributionHash);
const d = require(path.join(meta.output, 'runtime/stdio-entry')).verifyInstallation(meta.descriptorPath);
require(path.join(meta.output, 'runtime/client-entry')).verifyClientDescriptor(path.join(d.installRoot, 'core-client.json'));
const { canonical } = require(path.join(meta.output, 'protocol/json'));
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function check(value, reason) { if (!value) throw Error(reason); }
const seen = new Map();
function read(file) {
  if (!fs.existsSync(file)) { seen.set(file, null); return null; }
  const stat = fs.lstatSync(file, { bigint: true });
  check(stat.isFile() && !stat.isSymbolicLink(), 'non_plain_file');
  const bytes = fs.readFileSync(file), after = fs.lstatSync(file, { bigint: true });
  check(['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every(k => stat[k] === after[k]), 'file_changed_during_read');
  seen.set(file, { digest: digest(bytes), stat: after }); return bytes;
}
const descriptorBytes = read(meta.descriptorPath), descriptorHash = digest(descriptorBytes);
check(d.packageHash === meta.packageHash && descriptorHash === previous.descriptorHash, 'installed_package_changed');
const key = crypto.createHmac('sha256', Buffer.from(d.panelToken, 'hex')).update('ae-core4/lifecycle-key/v1\0').update(Buffer.from(d.controlToken, 'hex')).digest();
function sealed(bytes) {
  const value = JSON.parse(bytes), body = value.body;
  check(Buffer.from(canonical(value)).equals(bytes), 'record_noncanonical');
  const mac = crypto.createHmac('sha256', key).update('ae-core4/lifecycle-record/v1\0' + canonical(body)).digest('hex');
  check(typeof value.mac === 'string' && /^[a-f0-9]{64}$/.test(value.mac) && crypto.timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(value.mac, 'hex')), 'record_bad_seal');
  check(body.version === 1 && body.installationId === d.installationId && body.machineId === d.machineId && body.descriptorHash === descriptorHash, 'record_bad_binding');
  return body;
}
const identity = scope => scope && ({ pid: scope.pid, birthTicks: scope.birthTicks, bootId: scope.bootId });
const owner = sealed(read(path.join(d.stateDir, 'runtime-owner.json')));
check(owner.scope.pid === baseline.status.pid && owner.scope.birthTicks === baseline.status.lifecycle.birthTicks && owner.scope.bootId === baseline.status.lifecycle.processBootId, 'owner_changed');
const receipts = [];
for (const name of fs.readdirSync(path.join(d.installRoot, 'transactions')).filter(n => n.endsWith('-owner-lifecycle'))) {
  const dir = path.join(d.installRoot, 'transactions', name), intentPath = path.join(dir, 'intent.json');
  if (!fs.existsSync(intentPath)) continue;
  const candidate = JSON.parse(fs.readFileSync(intentPath)).body;
  if (candidate.descriptorHash !== descriptorHash || ![candidate.scope?.pid, candidate.previousScope?.pid].some(pid => pid === owner.scope.pid || pid === 2600)) continue;
  const bytes = read(intentPath), intent = sealed(bytes), completion = sealed(read(path.join(dir, 'completion.json')));
  check(completion.id === intent.id && completion.intentHash === digest(bytes), 'completion_intent_mismatch');
  check(completion.kind === intent.kind.replace('-intent', '-completed'), 'completion_kind_mismatch');
  const protectedFacts = intent.protected.map(v => ({ name: v.name, hash: v.hash }));
  for (const item of protectedFacts) {
    const expected = { descriptor: previous.descriptorHash, origin: previous.rootOriginHash, anchor: previous.anchorOriginHash, journal: previous.journalHash, ledger: null }[item.name];
    check(expected !== undefined && item.hash === expected, 'receipt_protected_history_changed');
  }
  receipts.push({ directory: name, id: intent.id, kind: intent.kind, previous: identity(intent.previousScope), current: identity(intent.scope), intentHash: digest(bytes), completionKind: completion.kind, completionIntentMatches: true, sealVerified: true, protected: protectedFacts });
}
check(receipts.some(r => r.kind === 'owner-ready-intent' && r.current?.bootId === owner.scope.bootId), 'current_ready_receipt_missing');
check(receipts.some(r => r.kind === 'owner-recovery-intent' && r.previous?.pid === 2600 && r.previous.birthTicks === '639290433588621440' && r.previous.bootId === 'fda4b436-ac6e-428a-951c-82d76978afc3'), 'previous_recovery_receipt_missing');
const files = { config: path.resolve(__dirname, '../../../../.codex/config.toml'), rootOrigin: path.join(d.installRoot, 'origin.json'), anchorOrigin: path.join(d.stateDir, 'origin.json'), hostAdoption: path.join(d.stateDir, 'host-adoption.json'), journal: path.join(d.stateDir, 'receiver/completions.ndjson') };
const hashes = Object.fromEntries(Object.entries(files).map(([name, file]) => [name + 'Hash', digest(read(file))]));
for (const name of ['configHash', 'rootOriginHash', 'anchorOriginHash', 'hostAdoptionHash', 'journalHash']) check(hashes[name] === previous[name], name + '_changed');
const journal = fs.readFileSync(files.journal), lines = journal.toString('utf8').trimEnd().split('\n');
check(lines.length === 18 && digest(Buffer.from(lines.slice(0, 16).join('\n') + '\n')) === previous.original16EventsHash, 'receiver_history_changed');
const gates = { maintenance: path.join(d.stateDir, 'runtime-maintenance.json'), install: path.join(d.installRoot, 'install.lock'), broker: path.join(d.stateDir, 'broker/broker-owner.gate'), ledger: path.join(d.stateDir, 'broker/ledger.ndjson') };
const present = Object.fromEntries(Object.entries(gates).map(([name, file]) => [name, read(file) !== null]));
check(Object.values(present).every(v => v === false), 'unexpected_gate_or_ledger');
const histories = require(path.join(meta.output, 'runtime/recovery-inspection'));
const receiver = histories.inspectReceiverHistory(journal, { descriptorPath: meta.descriptorPath });
check(receiver.settled && receiver.unresolved.length === 0, 'receiver_unsettled');
(async () => {
  const observe = require(path.join(meta.output, 'runtime/windows-owner-process')).observeOwnerProcess;
  const processFacts = await Promise.all([2600, owner.scope.pid, 26308].map(pid => observe(pid)));
  check(processFacts[0].status === 'absent' && processFacts[1].birthTicks === owner.scope.birthTicks && processFacts[2].birthTicks === '639290395690521480', 'process_identity_mismatch');
  const query = "$ErrorActionPreference='Stop';$rows=@(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'AfterFX.exe' -or ($_.Name -eq 'node.exe' -and $_.CommandLine -match 'AEAgentCore4.+(client-entry|owner-entry)') } | ForEach-Object { $m=[regex]::Match($_.CommandLine,'releases\\\\([a-f0-9]{64})');[ordered]@{pid=$_.ProcessId;parentPid=$_.ParentProcessId;birthTicks=$_.CreationDate.ToUniversalTime().Ticks.ToString();kind=$(if($_.Name -eq 'AfterFX.exe'){'AE'}elseif($_.CommandLine -match 'owner-entry'){'owner'}else{'client'});packageHash=$m.Groups[1].Value} });$listeners=@(Get-NetTCPConnection -LocalPort 3457 -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess);ConvertTo-Json -InputObject ([ordered]@{processes=$rows;listeners=$listeners}) -Depth 5 -Compress";
  const inventory = JSON.parse(cp.execFileSync(path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', query], { windowsHide: true, encoding: 'utf8', timeout: 10000 }));
  check(inventory.listeners.length === 1 && inventory.listeners[0].OwningProcess === owner.scope.pid && inventory.processes.filter(p => p.kind === 'owner').length === 1, 'not_one_owner_listener');
  check(inventory.processes.filter(p => p.kind === 'client').length >= 1 && inventory.processes.filter(p => p.kind !== 'AE').every(p => p.packageHash === d.packageHash), 'stale_client_package');
  for (const [file, before] of seen) {
    if (before === null) { check(!fs.existsSync(file), 'absent_file_appeared'); continue; }
    const after = fs.lstatSync(file, { bigint: true });
    check(['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every(k => before.stat[k] === after[k]) && digest(fs.readFileSync(file)) === before.digest, 'protected_readback_changed');
  }
  const report = { description: 'Configured client cc2f и атрибутированное восстановление owner после restart Codex; read-only evidence.', collectedAt: new Date().toISOString(), recordContext: { purpose: 'technical_check', lifetime: 'ephemeral_check' }, configuredClientProof: true, originalOwnerSurvivalObserved: false, originalOwnerTerminationCause: 'unobserved', recoveryMeasured: true, packageHash: d.packageHash, descriptorHash, currentOwner: { ...identity(owner.scope), phase: owner.phase, receiverIdentity: owner.receiverIdentity, sealVerified: true }, processFacts, inventory, receipts, hashes, journalEvents: lines.length, original16EventsHash: previous.original16EventsHash, receiverSettled: receiver.settled, gatesPresent: present, controllerAcquired: false, aeDispatches: 0, aeRestarts: 0, projectChanges: 0, save: 0 };
  fs.writeFileSync(path.join(__dirname, afterIdle ? 'installed-after-idle.json' : 'installed-readback.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(report));
})().catch(error => { console.error(JSON.stringify({ error: error.message })); process.exitCode = 1; });
