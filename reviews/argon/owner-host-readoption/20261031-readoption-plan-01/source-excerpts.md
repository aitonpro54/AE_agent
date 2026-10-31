# Allowlisted source excerpts

Классификация: INTERNAL source. Только выбранные строки; неприведённый код не заявляется внешне проверенным.
Source base: `9343989757b8eddbbced434e65858f2d2f0ef2b2`; все приведённые source bytes сверены с Git base.

## core4/tools/adopt-host.js

Полный file SHA-256: `ad199e684dca13f03f1fbffb5530b453e1913352e6b463e16b676378e52fe670`.

Строки 75–94:

```javascript
75: // Reviewed operator bootstrap imports provider ONLY from the verified release.
76: async function adopt({ descriptor, witness }) {
77:   const installation = verifyInstallation(descriptor);
78:   const expected = JSON.parse(fs.readFileSync(witness, 'utf8'));
79:   if (expected.installationId !== installation.installationId || expected.machineId !== installation.machineId) fail('adoption_witness_identity');
80:   const gate = path.join(installation.installRoot, 'install.lock'), fd = fs.openSync(gate, 'wx');
81:   try {
82:     if (canonical(verifyInstallation(descriptor)) !== canonical(installation)) fail('installation_changed_during_adoption');
83:     if (['broker/broker-owner.lock', 'broker/broker-owner.gate', 'receiver/owner'].some(relative => fs.existsSync(path.join(installation.stateDir, relative)))) fail('adoption_requires_stopped_runtime');
84:     const { createWindowsReservationProvider } = require(path.join(installation.releaseDir, 'runtime/windows-reservation-provider.js'));
85:     const provider = createWindowsReservationProvider({ installation });
86:     return await provider.adopt({ expected: expected.host, allowedProject: expected.allowedProject, rootObservationDigest: expected.rootObservationDigest });
87:   } finally { fs.closeSync(fd); fs.unlinkSync(gate); }
88: }
89: if (require.main === module) {
90:   const args = process.argv.slice(2);
91:   if (args.length !== 4 || args[0] !== '--installation' || args[2] !== '--witness') { process.stderr.write('adopt-host --installation ABS_DESCRIPTOR --witness ABS_ROOT_WITNESS\n'); process.exitCode = 2; }
92:   else adopt({ descriptor: args[1], witness: args[3] }).then(value => console.log(canonical(value))).catch(e => { process.stderr.write((e.code || 'host_adoption_failed') + '\n'); process.exitCode = 1; });
93: }
94: module.exports = { adopt };
```

## core4/runtime/windows-reservation-provider.js

Полный file SHA-256: `94e49c052119e0d80de3704132ca3cf04749c1d57db2f08b83fec8a97bf08531`.

Строки 1–16:

```javascript
1: 'use strict';
2: const fs = require('node:fs');
3: const path = require('node:path');
4: const net = require('node:net');
5: const os = require('node:os');
6: const childProcess = require('node:child_process');
7: const { hash, canonical, fail, id } = require('../protocol/json');
8: const { brandReservationHandle, validateReservationHandle } = require('../core/authority');
9: const { scopesOverlap } = require('../core/resources');
10: function durable(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); const fd = fs.openSync(file, 'wx'); try { const text = canonical(value); if (fs.writeSync(fd, text) !== Buffer.byteLength(text)) fail('adoption_short_write'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
11: function endpoint(port) { return new Promise(resolve => { const socket = net.connect({ host: '127.0.0.1', port }); let done = false; const finish = state => { if (done) return; done = true; socket.destroy(); resolve({ port, state }); }; socket.once('connect', () => finish('active')); socket.once('error', e => finish(e.code === 'ECONNREFUSED' ? 'observed-absent' : 'unknown')); socket.setTimeout(500, () => finish('unknown')); }); }
12: // One reviewed, package-pinned read-only cmdlet pipeline. The final base64 is
13: // UTF-8 JSON DATA only; the plaintext query is never encoded or caller supplied.
14: const CIM_QUERY = 'Get-CimInstance -ClassName Win32_Process -Property ProcessId,CreationDate,ExecutablePath -Filter "Name = \'AfterFX.exe\'" -ErrorAction Stop | Select-Object @{Name="pid";Expression={$_.ProcessId}},@{Name="birth";Expression={$_.CreationDate.ToUniversalTime().ToString("o")}},@{Name="executablePath";Expression={$_.ExecutablePath}} -ErrorAction Stop | ConvertTo-Json -Depth 3 -Compress -ErrorAction Stop | ForEach-Object { [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($_)) } -ErrorAction Stop';
15: function probeFailure() { fail('host_probe_failed'); }
16: function decodeCimWire(wire) {
```

Строки 75–114:

```javascript
75:   const file = path.join(installation.stateDir, 'host-adoption.json'), reservations = new Map(); let cache;
76:   function adoption() { if (!fs.existsSync(file)) return null; const a = JSON.parse(fs.readFileSync(file, 'utf8')); if (a.version !== 1 || a.installationId !== installation.installationId || a.machineId !== installation.machineId || a.policy !== 'registered-Core4-lane-and-current-target-native-confirmation' || typeof a.allowedProject !== 'string') fail('host_adoption_mismatch'); return a; }
77:   function scope(target) { const a = adoption(); return { schemaVersion: 2, origin: a ? { machineId: a.host.machineId, aePid: a.host.aePid, aeProcessBirth: a.host.aeProcessBirth } : null, target }; }
78:   function lane() {
79:     const b = getBroker(), p = getPeer().status(); if (!b || b.closed || b.stateLock.error || b.ledger.corrupt) fail('core4_lane_unavailable');
80:     if (b.ledger.unresolved().length || p.storeClosed || p.pending) fail('core4_lane_unresolved'); if (!p.peer.connected) fail('panel_unavailable'); return { broker: b, peerId: p.peer.peerId, receiverStoreIdentity: p.receiverStoreIdentity };
81:   }
82:   function assert(handle, { afterSend = false } = {}) {
83:     validateReservationHandle(handle); const item = reservations.get(handle.ref); if (!item || item.handle !== handle || item.terminal) fail('reservation_unavailable');
84:     const b = getBroker(), p = getPeer().status(); if (b.closed || b.stateLock.error || b.ledger.corrupt || !p.peer.connected || p.peer.peerId !== handle.peerId || p.receiverStoreIdentity !== handle.receiverStoreIdentity || hash(adoption()) !== handle.adoptionDigest) fail('reservation_identity_lost');
85:     if (!afterSend) { try { freshObservation(cache, 2000); } catch { fail('reservation_observation_expired'); } if (Date.now() > handle.expiresAt) fail('reservation_observation_expired'); }
86:     return handle;
87:   }
88:   return {
89:     adoption, scope,
90:     status() { const a = adoption(); return { adopted: !!a, origin: a?.host || null, coverage: { core4Lane: 'cooperating-Core4-only', hostProcess: a ? 'adopted-reprobe-required' : 'unavailable', legacyEndpoints: 'named-probes-only', legacyPhysicalQueue: 'not-proven', otherAEActors: 'outside-coverage', sharedOutputs: 'not-requested' } }; },
91:     async prepare(ctx) {
92:       const a = adoption(); if (!a) fail('resource_reservation_provider_unavailable');
93:       const before = lane(); cache = await probe(installation); const host = hostIdentity(cache);
94:       freshObservation(cache);
95:       if (canonical(host) !== canonical(a.host) || host.machineId !== installation.machineId || ctx.target.projectId !== a.allowedProject) fail('host_or_managed_writer_changed');
96:       const after = lane(); if (before.peerId !== after.peerId || before.receiverStoreIdentity !== after.receiverStoreIdentity) fail('peer_replaced');
97:       const executionScope = scope(ctx.target); if (canonical(executionScope) !== canonical(ctx.descriptor.executionScope)) fail('execution_scope_changed');
98:       for (const record of after.broker.resources.records()) if (scopesOverlap({ ...record.resource, ...(record.origin ? { origin: record.origin } : {}) }, { ...ctx.target, origin: executionScope.origin }) && (record.unresolvedOutcome || record.reservationOwner && record.reservationOwner !== installation.installationId)) fail('shared_resource_fenced');
99:       const handle = brandReservationHandle({ ref: id('reservation'), executionScope, peerId: after.peerId, receiverStoreIdentity: after.receiverStoreIdentity, adoptionDigest: hash(a), checkpointRef: ctx.checkpoint.ref, checkpointDigest: ctx.checkpoint.digest, proposalId: ctx.proposal.proposalId, commandId: ctx.commandId, expiresAt: Date.now() + 2000 });
100:       reservations.set(handle.ref, { handle, terminal: false });
101:       after.broker.ledger.append({ type: 'reservation', state: 'reserved', reservation: handle, taskId: ctx.plan.taskId, taskEpoch: ctx.plan.taskEpoch, effect: ctx.step.selected.contract.effectPolicy.effect, observationDigest: hash(cache), coverage: this.status().coverage });
102:       after.broker.ledger.append({ type: 'constraint', record: { constraintId: 'manual-scope-' + hash({ origin: executionScope.origin, target: ctx.target }), schemaVersion: 2, resource: ctx.target, origin: executionScope.origin, owner: installation.installationId, checkpointRef: ctx.checkpoint.ref, allowedEffects: [ctx.step.selected.contract.effectPolicy.effect], reservationOwner: installation.installationId, unresolvedOutcome: false, revision: ctx.before.revision, provenance: 'registered-Core4-lane-and-current-target-native-confirmation' } });
103:       return handle;
104:     },
105:     assert,
106:     finish(handle, outcome) { assert(handle, { afterSend: true }); const item = reservations.get(handle.ref); getBroker().ledger.append({ type: 'reservation', state: outcome, reservationRef: handle.ref }); item.terminal = true; },
107:     finishOriginal(ref, outcome) { const item = reservations.get(ref); if (item && !item.terminal) { getBroker().ledger.append({ type: 'reservation', state: outcome, reservationRef: ref, resolution: 'authenticated-original-completion' }); item.terminal = true; } },
108:     async adopt({ expected, allowedProject, rootObservationDigest }) {
109:       if (!path.isAbsolute(allowedProject) || !/^[a-f0-9]{64}$/.test(rootObservationDigest)) fail('adoption_witness_required');
110:       const actual = await probe(installation), host = hostIdentity(actual);
111:       freshObservation(actual);
112:       if (canonical(host) !== canonical(expected) || host.machineId !== installation.machineId) fail('adoption_observation_changed');
113:       const value = { version: 1, installationId: installation.installationId, machineId: installation.machineId, host, allowedProject, rootObservationDigest, observedDigest: hash(actual), policy: 'registered-Core4-lane-and-current-target-native-confirmation', adoptedAt: new Date().toISOString() };
114:       durable(file, value); return { adopted: true, installationId: installation.installationId, host, allowedProject, adoptionDigest: hash(value), mutationGrant: false, lifecycleEpoch: false };
```

## core4/runtime/owner-maintenance.js

Полный file SHA-256: `0b370cbec8130236d03dd4c3ae2f6d28f9e5b1f3f487c2e340452d0b01168793`.

Строки 52–94:

```javascript
52: function context(d, descriptorPath) {
53:   if (!d || d.machineId !== os.hostname()) fail('maintenance_machine');
54:   if (!d || descriptorPath !== path.join(d.installRoot, 'installation.json') || d.stateDir !== path.join(d.installRoot, 'state/production') || !HEX.test(d.panelToken) || !HEX.test(d.controlToken) || d.panelToken === d.controlToken) fail('maintenance_installation');
55:   const initial = read(descriptorPath); if (!initial.bytes || canonical(JSON.parse(initial.bytes)) !== canonical(d)) fail('maintenance_installation');
56:   const descriptorHash = hash(initial.bytes), key = crypto.createHmac('sha256', Buffer.from(d.panelToken, 'hex')).update('ae-core4/maintenance-key/v1\0').update(Buffer.from(d.controlToken, 'hex')).digest();
57:   const p = { descriptor: descriptorPath, origin: path.join(d.installRoot, 'origin.json'), anchor: path.join(d.stateDir, 'origin.json'), client: path.join(d.installRoot, 'core-client.json'), journal: path.join(d.stateDir, 'receiver/completions.ndjson'), ledger: path.join(d.stateDir, 'broker/ledger.ndjson'), barrier: path.join(d.stateDir, 'runtime-maintenance.json') };
58:   const markerPaths = ['runtime-owner.json', 'runtime-owner.next', 'runtime-diagnostic.json', 'broker/broker-owner.lock', 'broker/broker-owner.gate', 'receiver/owner'];
59:   const info = v => ({ hash: v.bytes === null ? null : hash(v.bytes), stat: v.stat });
60:   function snapshot(histories = false) {
61:     const names = ['descriptor', 'origin', 'anchor', 'client', ...(histories ? ['journal', 'ledger'] : [])], values = Object.fromEntries(names.map(k => [k, read(p[k], histories && ['journal', 'ledger'].includes(k) ? 64 * 1024 * 1024 : 16384)]));
62:     if (!values.descriptor.bytes?.equals(initial.bytes) || !same(values.descriptor.stat, initial.stat) || !values.origin.bytes || !values.anchor.bytes || !values.origin.bytes.equals(values.anchor.bytes) || !values.client.bytes) fail('maintenance_changed');
63:     const origin = JSON.parse(values.origin.bytes); if (origin.installationId !== d.installationId || origin.machineId !== d.machineId) fail('maintenance_changed');
64:     return { values, facts: Object.fromEntries(names.map(k => [k, info(values[k])])) };
65:   }
66:   function seal(kind, value) {
67:     const body = { version: 1, kind, installationId: d.installationId, machineId: d.machineId, descriptorHash, ...value };
68:     return Buffer.from(canonical({ body, mac: crypto.createHmac('sha256', key).update('ae-core4/maintenance-record/v1\0' + canonical(body)).digest('hex') }));
69:   }
70:   function decode(v, kind, fields) {
71:     if (!v.bytes?.length || !Buffer.from(v.bytes.toString('utf8')).equals(v.bytes)) fail('maintenance_record');
72:     let e; try { e = JSON.parse(v.bytes); } catch { fail('maintenance_record'); }
73:     exact(e, ['body', 'mac']); exact(e.body, ['version', 'kind', 'installationId', 'machineId', 'descriptorHash', ...fields]);
74:     const mac = crypto.createHmac('sha256', key).update('ae-core4/maintenance-record/v1\0' + canonical(e.body)).digest('hex');
75:     if (!HEX.test(e.mac) || !crypto.timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(e.mac, 'hex')) || !Buffer.from(canonical(e)).equals(v.bytes) || e.body.version !== 1 || e.body.kind !== kind || e.body.installationId !== d.installationId || e.body.machineId !== d.machineId || e.body.descriptorHash !== descriptorHash) fail('maintenance_record'); return e.body;
76:   }
77:   function dir(id, create = false) { if (!UUID.test(id)) fail('maintenance_id'); const target = path.join(d.installRoot, 'transactions', id + '-owner-maintenance'); plain(path.dirname(target), false, true); if (create) fs.mkdirSync(target); plain(target, false, true); return target; }
78:   function reverify() { if (canonical(require('./stdio-entry').verifyInstallation(descriptorPath)) !== canonical(d)) fail('maintenance_installation'); }
79:   function markers() { return Object.fromEntries(markerPaths.map(k => [k, info(read(path.join(d.stateDir, k)))])); }
80:   function scope(s) { exact(s, ['bootId', 'pid', 'birthTicks']); if (!UUID.test(s.bootId) || !Number.isInteger(s.pid) || s.pid < 1 || s.pid > 0xffffffff || typeof s.birthTicks !== 'string' || !/^[1-9][0-9]{0,18}$/.test(s.birthTicks) || BigInt(s.birthTicks) > 3155378975999999999n) fail('maintenance_scope'); }
81:   function authorization(s, id = crypto.randomUUID()) { scope(s); const body = { version: 1, purpose: 'maintenance-stop-v1', id, ...s, descriptorHash }; if (!UUID.test(id)) fail('maintenance_id'); return { body, mac: crypto.createHmac('sha256', key).update('ae-core4/maintenance-request/v1\0' + canonical(body)).digest('hex') }; }
82:   function verifyAuthorization(value, s) {
83:     exact(value, ['body', 'mac']); exact(value.body, ['version', 'purpose', 'id', 'bootId', 'pid', 'birthTicks', 'descriptorHash']);
84:     const expected = authorization(s, value.body.id); if (!HEX.test(value.mac) || canonical(expected.body) !== canonical(value.body) || !crypto.timingSafeEqual(Buffer.from(expected.mac, 'hex'), Buffer.from(value.mac, 'hex'))) fail('maintenance_authorization'); return value.body.id;
85:   }
86:   function settled(snap) {
87:     const r = inspectReceiverHistory(snap.values.journal.bytes, { descriptorPath }), l = inspectLedgerHistory(snap.values.ledger.bytes, { installationId: d.installationId });
88:     if (!r.settled || !l.settled || l.commands.length && !r.present) fail('maintenance_unsettled');
89:     const parse = require('./native-read-disposition').parseJournalBytes;
90:     const receiver = snap.values.journal.bytes ? parse(snap.values.journal.bytes).events : [], ledger = snap.values.ledger.bytes?.length ? parse(snap.values.ledger.bytes).events : [];
91:     const begins = new Map(receiver.filter(e => e.type === 'begin').map(e => [e.commandId, e])), replies = new Map(receiver.filter(e => e.type === 'complete').map(e => [e.commandId, e.response.result?.outcome])), terminals = new Map(ledger.filter(e => e.type === 'command').map(e => [e.commandId, e.state]));
92:     for (const e of ledger.filter(e => e.type === 'intent')) { const b = begins.get(e.commandId), t = terminals.get(e.commandId), outcome = replies.get(e.commandId); if (b ? canonical(b.originalBinding) !== canonical(e.dispatchBinding) : t !== 'rejected') fail('maintenance_unsettled'); if (outcome === 'applied' && t === 'rejected' || outcome === 'rejected' && t === 'succeeded') fail('maintenance_unsettled'); }
93:   }
94:   return { d, descriptorPath, descriptorHash, p, info, snapshot, seal, decode, dir, markers, scope, authorization, verifyAuthorization, settled, reverify };
```

Строки 97–139:

```javascript
97: function createOwnerMaintenance({ installation, descriptorPath, lifecycle, freeze, activity, accepted, close, intervalMs = 50 }) {
98:   if (![freeze, activity, accepted, close].every(value => typeof value === 'function') || !Number.isSafeInteger(intervalMs) || intervalMs < 1 || intervalMs > 1000) fail('maintenance_options');
99:   const c = context(installation, descriptorPath), state = lifecycle.state(), scope = { bootId: state.processBootId, pid: state.pid, birthTicks: state.birthTicks };
100:   c.scope(scope); let stop, stopped, fault = null, timer, closing = false, resolveDone;
101:   const done = new Promise(resolve => { resolveDone = resolve; });
102:   function status() { return { requested: !!stop, id: stop?.id || null, phase: stopped ? 'stopped' : fault ? 'fenced' : closing ? 'closing' : stop ? 'draining' : 'running', fault }; }
103:   async function drain() {
104:     timer = undefined; if (!stop || fault || stopped || closing) return;
105:     try {
106:       const pending = activity().pending, count = accepted();
107:       if (typeof pending !== 'boolean' || !Number.isSafeInteger(count) || count < 0) fail('maintenance_activity');
108:       if (count || pending) { timer = setTimeout(drain, intervalMs); return; }
109:       closing = true; await close();
110:       const snap = c.snapshot(true), markers = c.markers(); let settled = true;
111:       try { c.settled(snap); } catch { settled = false; }
112:       stopped = atomic(path.join(c.dir(stop.id), 'stopped.json'), c.seal('maintenance-stopped', { id: stop.id, stopHash: stop.hash, scope, protected: snap.facts, markers, settled }), stop.nonce);
113:       resolveDone(status());
114:     } catch { fault = 'maintenance_stop_uncertain'; resolveDone(status()); }
115:   }
116:   function request(value) {
117:     const id = c.verifyAuthorization(value, scope);
118:     if (stop || fault) { if (stop?.id === id) return status(); fail('maintenance_in_progress'); }
119:     // Freeze is synchronous and is never undone after a persist failure.
120:     freeze();
121:     try {
122:       const baseline = c.snapshot().facts, nonce = crypto.randomUUID(); c.dir(id, true);
123:       const barrier = atomic(c.p.barrier, c.seal('maintenance-stop', { id, scope, protected: baseline, authorizationHash: hash(value), nonce }), nonce);
124:       stop = { id, hash: hash(barrier.bytes), nonce }; timer = setTimeout(drain, 10); return status();
125:     } catch { fault = 'maintenance_persist_failed'; fail(fault); }
126:   }
127:   return Object.freeze({ request, requestLocal: () => stop || fault ? status() : request(c.authorization(scope)), status, done, scope: Object.freeze(scope) });
128: }
129: async function gone(scope) { const o = await observeOwnerProcess(scope.pid); if (!['absent', 'pid-reused'].includes(classifyOwnerProcess({ pid: scope.pid, birthTicks: scope.birthTicks }, o))) fail('maintenance_process_not_dead'); }
130: function phaseSnapshot(c, directory, finishing = false) {
131:   const allowed = ['stopped.json', 'resume-intent.json', 'resume-lease.json', 'resume-completed.json', 'stop-barrier'];
132:   plain(directory, false, true); const s = fs.lstatSync(directory, { bigint: true }), names = fs.readdirSync(directory).sort(), tree = {};
133:   if (names.length > (finishing ? 256 : 32)) fail('maintenance_budget');
134:   for (const name of names) {
135:     const base = name.replace(/\.stage-[a-f0-9-]{36}$/, '');
136:     const finishFile = finishing && (base === 'finish-commit.json' || /^finish-[a-f0-9-]{36}\.json$/.test(base) && UUID.test(base.slice(7, 43)) || /^finish-[a-f0-9-]{36}-(install|broker)-(old|new)$/.test(base) && UUID.test(base.slice(7, 43)));
137:     if ((!allowed.includes(base) && !finishFile) || base !== name && !UUID.test(name.slice(base.length + 7))) fail('maintenance_phase');
138:     tree[name] = c.info(read(path.join(directory, name), 128 * 1024));
139:     if (tree[name].hash === null) fail('maintenance_changed');
```

## core4/runtime/stopped-certification.js

Полный file SHA-256: `8bda8eb1e9aaa5879322a4934d43608d0a71a2a268056ef02dec02aed537d8fa`.

Строки 125–168 и170–222. Строка169 с конструктором local actor исключена из allowlist; она не меняется и не является предметом нового внешнего review.

```javascript
125: async function inspected(options) {
126:   endpoint(options.reservedServer);
127:   const capability = Object.freeze({}), p = { installation: options.installation, descriptorPath: options.descriptorPath, reservedServer: options.reservedServer };
128:   contexts.set(capability, p);
129:   try {
130:     const c = require('./owner-maintenance').stoppedCertificationContext(capability); c.reverify();
131:     const b = readBase(c, options.id), base = baseFacts(c, b);
132:     const check = () => { endpoint(options.reservedServer); c.reverify(); if (!equal(baseFacts(c, readBase(c, options.id)), base)) fail('stopped_certification_changed'); };
133:     // Inspection has no producer actor at all. Only action can observe and bind
134:     // a real new certifier incarnation into its durable intent.
135:     contexts.set(capability, lifecycleRequest(p, b, null, check));
136:     const lifecycle = await require('./owner-lifecycle').inspectStoppedLifecycle(capability); check();
137:     if (b.intent) continuation(b.intent.lifecycle, lifecycle, b.retired);
138:     for (const [i, a] of b.attempts.entries()) continuation(a.priorLifecycle, b.attempts[i + 1]?.priorLifecycle || lifecycle, b.retired);
139:     await dead(b.b.scope); check();
140:     if (b.intent && !b.certificate) { await dead(b.intent.certifier); check(); for (const a of b.attempts) { await dead(a.certifier); check(); } }
141:     const again = await require('./owner-lifecycle').inspectStoppedLifecycle(capability); check();
142:     if (!equal(again, lifecycle)) fail('stopped_certification_changed');
143:     if (b.certificate && (!equal(b.certificate.lifecycle, lifecycle) || Object.values(lifecycle.markers).some(v => v.hash !== null))) fail('stopped_certification_changed');
144:     const proof = { id: b.b.id, ...base, lifecycle }, proofHash = hash(proof);
145:     return { c, b, base, lifecycle, proof, proofHash };
146:   } finally { contexts.delete(capability); }
147: }
148: async function inspectStoppedCertification(options) {
149:   const r = await inspected(options);
150:   return Object.freeze({ id: r.b.b.id, phase: r.b.certificate ? 'stopped-certified' : r.b.intent ? 'certification-pending' : 'stopped-certifiable', proofHash: r.proofHash, inspectionOnly: true, runtimeStarted: false, aeAuthority: false });
151: }
152: async function certifyStoppedInstallation(options) {
153:   if (!HEX.test(options.expectedProofHash)) fail('stopped_certification_expected_proof');
154:   const first = await inspected(options); if (first.proofHash !== options.expectedProofHash) fail('stopped_certification_proof_changed');
155:   const self = await observeOwnerProcess(process.pid);
156:   if (classifyOwnerProcess({ pid: process.pid, birthTicks: self.birthTicks }, self) !== 'alive' || !self.executablePath || path.resolve(self.executablePath).toLowerCase() !== path.resolve(options.installation.nodePath).toLowerCase()) fail('stopped_certification_process_unknown');
157:   const { c } = first; let b = readBase(c, options.id);
158:   if (!equal(baseFacts(c, b), first.base)) fail('stopped_certification_changed');
159:   const capability = Object.freeze({}), p = { installation: options.installation, descriptorPath: options.descriptorPath, reservedServer: options.reservedServer };
160:   let expectedPhase = b.phase;
161:   function check() {
162:     endpoint(options.reservedServer); c.reverify(); const now = readBase(c, options.id);
163:     const expected = structuredClone(expectedPhase);
164:     // Only our exact original gate may acquire this deterministic archive name.
165:     if (!expected.tree['retired-install-gate'] && now.retired.bytes) expected.tree['retired-install-gate'] = c.info(now.retired);
166:     if (!equal(now.phase, expected) || !equal(now.snap.facts, first.base.snapshot) || !equal(c.info(now.barrier), first.base.stop)) fail('stopped_certification_changed');
167:     expectedPhase = expected;
168:   }
170:   contexts.set(capability, lifecycleRequest(p, b, actor, check));
171:   try {
172:     let lifecycle = await require('./owner-lifecycle').inspectStoppedLifecycle(capability); check();
173:     if (!equal(lifecycle, first.lifecycle)) fail('stopped_certification_changed');
174:     function publish(name, bytes) { check(); const v = c.atomic(path.join(b.directory, name), bytes, actor.startupToken); expectedPhase = { ...expectedPhase, tree: { ...expectedPhase.tree, [name]: c.info(v) } }; check(); return v; }
175:     if (!b.intent) {
176:       publish('stopped-certification-intent.json', c.seal('maintenance-stopped-certification-intent', { id: options.id, stopHash: hash(b.barrier.bytes), originalScope: b.b.scope, certifier: short(actor), snapshot: b.snap.facts, lifecycle, priorPhase: b.phase }));
177:       b = readBase(c, options.id); contexts.set(capability, lifecycleRequest(p, b, actor, check));
178:     } else if (!b.certificate) {
179:       if (b.attempts.length >= ATTEMPT_LIMIT - 1) fail('stopped_certification_budget');
180:       const attemptId = crypto.randomUUID();
181:       publish('certify-' + attemptId + '.json', c.seal('maintenance-stopped-certification-attempt', { id: options.id, attemptId, parentHash: b.attempts.at(-1)?.digest || null, intentHash: hash(b.intentView.bytes), certifier: short(actor), priorLifecycle: lifecycle, priorPhase: expectedPhase }));
182:       b = readBase(c, options.id); contexts.set(capability, lifecycleRequest(p, b, actor, check));
183:     }
184:     if (!b.certificate) {
185:       contexts.get(capability).expected = lifecycle;
186:       const beforeRetirement = lifecycle;
187:       await require('./owner-lifecycle').retireStoppedLifecycle(capability); check();
188:       lifecycle = await require('./owner-lifecycle').inspectStoppedLifecycle(capability); check();
189:       continuation(beforeRetirement, lifecycle, c.read(path.join(b.directory, 'retired-install-gate')));
190:       if (Object.values(lifecycle.markers).some(v => v.hash !== null)) fail('stopped_certification_phase');
191:       assertRetiredNow(c, lifecycle);
192:       publish('stopped-certificate.json', c.seal('maintenance-stopped-certificate', { id: options.id, stopHash: hash(b.barrier.bytes), intentHash: hash(b.intentView.bytes), attemptHash: b.attempts.at(-1)?.digest || null, originalScope: b.b.scope, certifier: short(actor), snapshot: b.snap.facts, lifecycle }));
193:     }
194:     b = readBase(c, options.id); check();
195:     assertRetiredNow(c, b.certificate.lifecycle);
196:     const result = Object.freeze({}), facts = { id: options.id, stopHash: hash(b.barrier.bytes), stop: c.info(b.barrier), certificateHash: hash(b.certView.bytes), descriptorHash: c.descriptorHash, snapshot: b.snap.facts, phase: b.phase, lifecycle: b.certificate.lifecycle, markers: c.markers(), installGate: c.info(c.read(path.join(c.d.installRoot, 'install.lock'))) };
197:     certificates.set(result, { ...p, actor: short(actor), facts: structuredClone(facts), c });
198:     return result;
199:   } finally { contexts.delete(capability); }
200: }
201: function stoppedCertificateFacts(certificate) {
202:   const p = certificates.get(certificate); if (!p) fail('stopped_certification_brand');
203:   return Object.freeze(structuredClone(p.facts));
204: }
205: function assertStoppedCertificate(certificate, { installation, descriptorPath, id, lease } = {}) {
206:   const p = certificates.get(certificate); if (!p || p.actor.pid !== process.pid || p.installation !== installation || p.descriptorPath !== descriptorPath || p.facts.id !== id) fail('stopped_certification_brand');
207:   endpoint(p.reservedServer); p.c.reverify();
208:   // Under the branded install lease only its own exact held gates are excluded.
209:   // Generic/foreign bytes, replaced inodes and unrelated scope still fail.
210:   let owned = new Map();
211:   if (lease) { const api = require('./install-lease'); api.assertInstallLease(lease, { installRoot: installation.installRoot, stateDir: installation.stateDir, descriptorPath }); owned = api.ownedLeaseGates(lease); }
212:   const b = readBase(p.c, id, owned), markers = p.c.markers(), installGate = p.c.info(p.c.read(path.join(installation.installRoot, 'install.lock')));
213:   for (const file of [path.join(installation.installRoot, 'install.lock'), path.join(installation.stateDir, 'broker/broker-owner.gate')]) {
214:     const bytes = owned.get(file); if (!bytes) continue;
215:     const v = p.c.read(file); if (!v.bytes?.equals(bytes)) fail('stopped_certification_changed');
216:     if (file === path.join(installation.installRoot, 'install.lock')) Object.assign(installGate, NIL()); else markers['broker/broker-owner.gate'] = NIL();
217:   }
218:   if (Object.values(markers).some(v => v.hash !== null) || installGate.hash !== null) fail('stopped_certification_changed');
219:   assertLifecycleTransactions(p.c, p.facts.lifecycle);
220:   const facts = { id, stopHash: hash(b.barrier.bytes), stop: p.c.info(b.barrier), certificateHash: hash(b.certView.bytes), descriptorHash: p.c.descriptorHash, snapshot: b.snap.facts, phase: b.phase, lifecycle: b.certificate?.lifecycle, markers, installGate };
221:   if (!equal(facts, p.facts)) fail('stopped_certification_changed');
222:   return stoppedCertificateFacts(certificate);
```

## core4/runtime/install-lease.js

Полный file SHA-256: `fe91dfedfafceaa38f0cac72d007f2600d4b82915d07b960c8d3ed6d735bb368`.

Строки 122–143:

```javascript
122: function acquireSealedLease(permit, installOnly = false) {
123:   const paths = pathsFor(permit.scope);
124:   if (!Array.isArray(permit.gates) || permit.gates.length !== 2 || permit.gates.some(b => !Buffer.isBuffer(b) || !b.length || b.length > 16384) || !/^[a-f0-9-]{36}$/.test(permit.nonce)) fail('install_lease_brand');
125:   safeDirectory(paths.installRoot, fs); safeDirectory(path.join(paths.stateDir, 'broker'), fs);
126:   const lease = Object.freeze({}), item = { paths, io: fs, gates: [], phase: 'acquired', retained: false, released: false, checkpoint: null, maintenance: true, update: true };
127:   try {
128:     for (const [index, file] of [paths.installGate, paths.brokerGate].entries()) {
129:       if (installOnly && index === 1) break;
130:       if (!permit.recovery) item.gates.push(publishMaintenanceGate(file, permit.gates[index], permit.nonce));
131:       else {
132:         const expected = permit.facts?.[index];
133:         if (!expected || expected.file !== file || expected.hash !== crypto.createHash('sha256').update(permit.gates[index]).digest('hex')) fail('install_lease_changed');
134:         if (permit.recoverMissing && expected.stat === null) { item.gates.push(publishMaintenanceGate(file, permit.gates[index], permit.nonce)); continue; }
135:         if (permit.releaseOnly) { try { fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') continue; throw error; } }
136:         const fd = fs.openSync(file, 'r'), gate = { file, fd, bytes: permit.gates[index], stat: expected.stat };
137:         item.gates.push(gate); checkMaintenanceGate(fs, gate);
138:       }
139:     }
140:     leases.set(lease, item); assertInstallLease(lease, permit.scope); return lease;
141:   } catch (error) { for (const gate of item.gates) try { fs.closeSync(gate.fd); } catch {} error.leaseRetained = true; throw error; }
142: }
143: function acquireStoppedUpdateLease(capability) { return acquireSealedLease(require('../tools/stopped-update').stoppedUpdateLeasePermit(capability)); }
```

## core4/tools/stopped-update.js

Полный file SHA-256: `32e676dad591522ab5b14256e06e00e8b517e94c4273f43228f1793ce762172f`.

Строки 476–545:

```javascript
476: async function enableStoppedUpdate(options) {
477:   let c, ready;
478:   if (options.permit) {
479:     c = permits.get(options.permit);
480:     if (!c || !c.used || c.enabled || c.lease) fail('stopped_update_enable_brand');
481:     ready = decode(c, read(path.join(c.directory, 'switch-ready.json')), 'update-switch-ready');
482:   } else {
483:     if (!HEX.test(options.expectedProofHash)) fail('stopped_update_expected_proof');
484:     const r = await inspectedRecovery(options);
485:     if (r.c.enable) fail('stopped_update_enable_pending');
486:     if (r.proofHash !== options.expectedProofHash || r.c.present.some(Boolean)) fail('stopped_update_enable_proof');
487:     c = r.c; ready = r.ready;
488:   }
489:   endpoint(c.server); fullVerified(c, ready);
490:   const completion = read(path.join(c.directory, 'completed.json')), completed = decode(c, completion, 'update-completed'), barrier = path.join(c.old.stateDir, 'runtime-maintenance.json');
491:   if (!sameFact(read(barrier), completed.barrier) || completed.readyHash !== c.ready.hash || read(path.join(c.directory, 'enable-intent.json')).bytes) fail('stopped_update_enable_pending');
492:   const before = recoveryFacts(c, ready), a = await actor(c.next);
493:   if (!equal(recoveryFacts(c, ready), before)) fail('stopped_update_proof_changed');
494:   const gates = ['install', 'broker'].map(role => seal(c, 'update-enable-gate', { actor: a, role, nonce: crypto.randomUUID() })), cap = Object.freeze({});
495:   const intent = atomic(path.join(c.directory, 'enable-intent.json'), seal(c, 'update-enable-intent', { actor: a, completionHash: completion.hash, barrier: completed.barrier, gates: gates.map(b => b.toString('base64')) }));
496:   leasePermits.set(cap, { scope: scope(c.old, c.descriptorPath), nonce: a.bootId, gates });
497:   try {
498:     c.lease = leases.acquireStoppedUpdateLease(cap);
499:     return completeEnable(c, ready, { actor: a, intent, completion, completed });
500:   } catch (error) { if (c.lease) leases.retainInstallLease(c.lease); error.leaseRetained = true; throw error; }
501:   finally { leasePermits.delete(cap); }
502: }
503: function completeEnable(c, ready, e) {
504:   fullVerified(c, ready);
505:   const barrier = path.join(c.old.stateDir, 'runtime-maintenance.json'), savedPath = path.join(c.directory, 'update-stop'), enabledPath = path.join(c.directory, 'enabled.json');
506:   const readyPath = path.join(c.directory, 'enable-ready.json'); let readyView = read(readyPath);
507:   if (!readyView.bytes) {
508:     if (!sameFact(read(barrier), e.completed.barrier)) fail('stopped_update_stop_changed');
509:     readyView = atomic(readyPath, seal(c, 'update-enable-ready', { actor: e.actor, intentHash: e.intent.hash, barrier: e.completed.barrier, gates: leases.maintenanceLeaseFacts(c.lease), readyHash: c.ready.hash, history: c.facts.snapshot }));
510:   } else {
511:     const b = decode(c, readyView, 'update-enable-ready');
512:     if (b.intentHash !== e.intent.hash || b.readyHash !== c.ready.hash || !equal(b.history, c.facts.snapshot) || !equal(b.barrier, e.completed.barrier)) fail('stopped_update_enable_record');
513:   }
514:   let current = read(barrier), saved = read(savedPath);
515:   if (current.bytes) {
516:     leases.assertInstallLease(c.lease, scope(c.old, c.descriptorPath), { full: true });
517:     if (!saved.bytes) { if (!sameFact(current, e.completed.barrier)) fail('stopped_update_stop_changed'); fs.linkSync(barrier, savedPath); saved = read(savedPath); current = read(barrier); }
518:     if (!sameFact(saved, e.completed.barrier, true) || !sameFact(current, e.completed.barrier, true) || !equal(saved.stat, current.stat)) fail('stopped_update_stop_changed');
519:     // Full verification and both private gates precede the sole explicit unlink.
520:     fullVerified(c, ready); leases.assertInstallLease(c.lease, scope(c.old, c.descriptorPath), { full: true }); fs.unlinkSync(barrier);
521:     if (read(barrier).bytes !== null) fail('stopped_update_stop_changed');
522:   } else if (!sameFact(saved, e.completed.barrier, true)) fail('stopped_update_stop_changed');
523:   const done = read(enabledPath);
524:   if (!done.bytes) atomic(enabledPath, seal(c, 'update-enabled', { actor: e.actor, intentHash: e.intent.hash, completionHash: e.completion.hash, history: c.facts.snapshot }));
525:   else { const b = decode(c, done, 'update-enabled'); if (b.intentHash !== e.intent.hash || b.completionHash !== e.completion.hash || !equal(b.history, c.facts.snapshot)) fail('stopped_update_enable_record'); }
526:   fullVerified(c, ready); leases.releaseInstallLease(c.lease); c.lease = null; c.enabled = true;
527:   return { enabled: true, sameDescriptor: true, transactionId: c.binding.transactionId, packageHash: c.next.packageHash, runtimeStarted: false, aeAuthority: false };
528: }
529: async function finishEnableStoppedUpdate(options) {
530:   if (!HEX.test(options.expectedProofHash)) fail('stopped_update_expected_proof');
531:   const r = await inspectedRecovery(options);
532:   if (!r.c.enable || r.proofHash !== options.expectedProofHash) fail('stopped_update_enable_proof');
533:   const a = await actor(r.c.next), now = readRecovery(options);
534:   if (!equal(now.facts, r.facts)) fail('stopped_update_proof_changed');
535:   const { c, ready } = now, e = c.enable;
536:   if (c.enableAttempts.length >= 16) fail('stopped_update_budget');
537:   const attemptId = crypto.randomUUID();
538:   atomic(path.join(c.directory, 'enable-recovery-' + attemptId + '.json'), seal(c, 'update-enable-recovery', { attemptId, parentHash: c.enableAttempts.at(-1)?.hash || null, actor: a, intentHash: e.intentView.hash, proofHash: now.proofHash }));
539:   const cap = Object.freeze({});
540:   leasePermits.set(cap, { scope: scope(c.old, c.descriptorPath), nonce: a.bootId, gates: c.gateBytes, recovery: true, recoverMissing: !e.ready, releaseOnly: !!e.enabledView.bytes, facts: c.gateFacts });
541:   try {
542:     c.lease = leases.acquireStoppedUpdateLease(cap);
543:     return { ...completeEnable(c, ready, { actor: a, intent: e.intentView, completion: read(path.join(c.directory, 'completed.json')), completed: decode(c, read(path.join(c.directory, 'completed.json')), 'update-completed') }), recovered: true };
544:   } catch (error) { if (c.lease) leases.retainInstallLease(c.lease); error.leaseRetained = true; throw error; }
545:   finally { leasePermits.delete(cap); }
```

## core4/tools/standalone-installer.js

Полный file SHA-256: `b64213a52264ec773e989d85d8337e96bc4f196e318eda7fd671abd0dead45c4`.

Строки 1–16:

```javascript
1: 'use strict';
2: // Reviewed local bootstrap: only builtins until every distributed byte passes.
3: const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
4: const HELPERS = Object.freeze(['runtime/stopped-certification.js', 'tools/disposition-install-preflight.js', 'tools/finish-owner-maintenance.js', 'tools/install-core4.js', 'tools/legacy-owner-migration.js', 'tools/maintain-owner.js', 'tools/operate-stopped-update.js', 'tools/package-installable.js', 'tools/standalone-installer.js', 'tools/stopped-update.js', 'tools/windows-retained-process.js']);
5: const HASH = /^[a-f0-9]{64}$/;
6: const maintenanceBootstraps = new WeakMap();
7: const updateBootstraps = new WeakMap();
8: function fail(code) { throw Object.assign(new Error(code), { code }); }
9: function canonical(v) { if (v === null || typeof v === 'boolean' || typeof v === 'string' || typeof v === 'number' && Number.isFinite(v)) return JSON.stringify(v); if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']'; if (!v || Object.getPrototypeOf(v) !== Object.prototype) fail('standalone_json'); return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}'; }
10: function hash(v) { return crypto.createHash('sha256').update(Buffer.isBuffer(v) || typeof v === 'string' ? v : canonical(v)).digest('hex'); }
11: function exact(v, keys) { if (!v || Object.getPrototypeOf(v) !== Object.prototype || canonical(Object.keys(v).sort()) !== canonical([...keys].sort())) fail('standalone_schema'); }
12: function absolute(file) { if (typeof file !== 'string' || !path.isAbsolute(file) || path.resolve(file) !== file) fail('standalone_absolute_exact_path'); return file; }
13: function safe(file, directory = false) { absolute(file); const s = fs.lstatSync(file); if (s.isSymbolicLink() || s.reparsePoint || fs.realpathSync(file) !== file || (directory ? !s.isDirectory() : !s.isFile())) fail('standalone_path'); return s; }
14: function read(file) {
15:   const named = safe(file), fd = fs.openSync(file, 'r');
16:   try {
```

Строки 74–83:

```javascript
74:   if (maintenance) {
75:     const allowed = ['--expected-distribution-hash', '--expected-current-package-hash', '--installation', '--operation', ...(action ? ['--expected-proof-hash'] : [])];
76:     for (let i = 1; i < args.length; i += 2) { if (!allowed.includes(args[i]) || Object.hasOwn(options, args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) fail('standalone_usage'); options[args[i]] = args[i + 1]; }
77:     if (Object.keys(options).length !== allowed.length || !HASH.test(options['--expected-current-package-hash']) || action && !HASH.test(options['--expected-proof-hash']) || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(options['--operation'])) fail('standalone_usage');
78:     absolute(options['--installation']);
79:     const checked = verifyStandalone(path.resolve(__dirname, '..'), options['--expected-distribution-hash']);
80:     for (const name of ['owner-contract.json', 'owner-maintenance.js', 'recovery-inspection.js', 'windows-owner-process.js']) if (!Object.hasOwn(checked.pkg.release.hashes, 'runtime/' + name)) fail('maintenance_distribution_unavailable');
81:     const capability = Object.freeze({}); maintenanceBootstraps.set(capability, Object.freeze({ mode, descriptor: options['--installation'], id: options['--operation'], expectedPackageHash: options['--expected-current-package-hash'], expectedProofHash: options['--expected-proof-hash'] }));
82:     // The only continuation import is from this exact reviewed distribution.
83:     return Promise.resolve(require('./finish-owner-maintenance.js').operate(capability)).finally(() => maintenanceBootstraps.delete(capability));
```
