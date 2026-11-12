# 06-journal-ownership

Выбранные точные исходники; вне обозначенных диапазонов контекст не включён.

## `core4/core/ledger.js:1–52`
Полный файл SHA256 (hex groups, concatenate) `a52aff8b:a051a879:0cf620a9:a44081f2:772e2725:7f477dc5:562fc458:8c842402`; Git blob `680be4c2:43d33f3e:685fcf88:ab6ba549:05c4478c`. Выдержка: строки 1–52, 2535 bytes.

```javascript
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { bounded, parse, fail, hash } = require('../protocol/json');
class Ledger {
  constructor(file) {
    this.file = file; this.events = []; fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file)) {
      const data = fs.readFileSync(file, 'utf8');
      // A torn final record is never discarded: diagnostic startup only, mutations fail closed.
      this.corrupt = data.length > 0 && !data.endsWith('\n');
      for (const line of data.split('\n').filter(Boolean)) {
        try {
          const event = parse(line), { recordHash, ...body } = event;
          if (event.seq !== this.events.length + 1 || event.previousHash !== (this.events.at(-1)?.recordHash || 'origin') || recordHash !== hash(body)) this.corrupt = true;
          this.events.push(event);
        } catch { this.corrupt = true; }
      }
    }
  }
  append(event) {
    if (this.writeGuard && !this.writeGuard()) fail('broker_closed');
    if (this.ownerFault) fail(this.ownerFault);
    if (this.corrupt) fail('ledger_corrupt');
    const body = { ...event, seq: this.events.length + 1, previousHash: this.events.at(-1)?.recordHash || 'origin' };
    const line = bounded({ ...body, recordHash: hash(body) }) + '\n';
    let fd;
    try {
      fd = fs.openSync(this.file, 'a');
      if (fs.writeSync(fd, line) !== Buffer.byteLength(line)) fail('ledger_short_write');
      fs.fsyncSync(fd);
    } catch (e) { this.corrupt = true; throw e; }
    finally { if (fd !== undefined) { try { fs.closeSync(fd); } catch (e) { this.corrupt = true; throw e; } } }
    this.events.push(JSON.parse(line)); return this.events.at(-1);
  }
  task(taskId) {
    let task = { taskId, epoch: 0, reset: false };
    for (const e of this.events) if (e.taskId === taskId && e.type === 'task') task = { taskId, epoch: e.epoch, reset: e.reset };
    return task;
  }
  commands(taskId) {
    const map = new Map();
    for (const e of this.events) {
      if (e.type === 'intent') map.set(e.commandId, { ...e, state: 'UNKNOWN' });
      if (e.type === 'command' && map.has(e.commandId)) Object.assign(map.get(e.commandId), e);
    }
    return [...map.values()].filter(c => !taskId || c.taskId === taskId);
  }
  unresolved() { return this.commands().filter(c => !['succeeded', 'rejected'].includes(c.state)); }
  workflow(workflowId) { return this.events.filter(e => e.type === 'engine' && e.workflowId === workflowId).map(e => e.event); }
}
module.exports = { Ledger };
```

## `core4/core/state-lock.js:58–99`
Полный файл SHA256 (hex groups, concatenate) `4e515580:ec7ceb03:cc7a7a5d:789048ae:e9bf0e9a:7866d4cf:0ee10895:8ff58e23`; Git blob `7f02ae9b:06a538bf:26369c81:0812bcf3:52fb07a4`. Выдержка: строки 58–99, 2659 bytes.

```javascript
function acquireStateLock(directory, options = {}) {
  // A trusted embedding may bind a preselected process nonce into its durable
  // boot record. This never changes the lock's PID, election or AE authority.
  if (!options || Object.getPrototypeOf(options) !== Object.prototype || Object.keys(options).some(k => k !== 'token') || options.token !== undefined && (typeof options.token !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(options.token))) throw Object.assign(new Error('state_owner_token'), { code: 'state_owner_token' });
  fs.mkdirSync(directory, { recursive: true }); const file = path.join(directory, 'broker-owner.lock'); const token = options.token ?? crypto.randomUUID();
  const gate = path.join(directory, 'broker-owner.gate'); let gateMarker;
  try { gateMarker = publishMarker(gate, token, Buffer.from(token)); }
  catch { return { error: 'state_owner_gate_unavailable', release() {} }; }
  try {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ownerMarker = publishMarker(file, token, Buffer.from(JSON.stringify({ pid: process.pid, token })));
      closePublished(ownerMarker);
      return { error: null, release() {
        let releaseGate;
        try {
          releaseGate = publishMarker(gate, token, Buffer.from(token));
          removeMarker(ownerMarker);
        } catch { /* Unknown/busy release leaves ownership closed, never steals a lease. */ }
        finally { if (releaseGate !== undefined) { try { removeMarker(releaseGate); } catch {} } }
      } };
    } catch (e) {
      if (e.code !== 'EEXIST') return { error: 'state_owner_unavailable', release() {} };
      try {
        const owner = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!Number.isInteger(owner.pid) || owner.pid <= 0) return { error: 'state_owner_unknown', release() {} };
        try { process.kill(owner.pid, 0); return { error: 'state_owner_busy', release() {} }; }
        catch (probe) { if (probe.code !== 'ESRCH') return { error: 'state_owner_unknown', release() {} }; }
        // Known-dead process only; a missing/bad lock is never guessed safe.
        if (JSON.parse(fs.readFileSync(file, 'utf8')).token !== owner.token) continue;
        fs.unlinkSync(file);
      } catch { return { error: 'state_owner_unknown', release() {} }; }
    }
  }
  return { error: 'state_owner_busy', release() {} };
  } finally {
    // Every cooperating acquire/reclaim/release holds this atomic gate. An orphan gate
    // is NEVER reclaimed automatically: diagnostic/manual recovery is required.
    removeMarker(gateMarker);
  }
}
module.exports = { acquireStateLock };
```

## `core4/runtime/owner-lifecycle.js:298–330`
Полный файл SHA256 (hex groups, concatenate) `c9d9328e:7e3ffdee:86f4ece7:e4ea45a1:3e0e472d:52c99a9f:d4e75fda:070e9f5b`; Git blob `27bd5690:54fdcd00:631eeceb:f9501732:36cb4760`. Выдержка: строки 298–330, 2603 bytes.

```javascript
  let boot, recoveryId, readyId;
  if (stopped) {
    // This branch is reachable only with an in-memory certification brand. It
    // never elects/publishes an execution owner, starts stores or issues tokens.
    try {
      const request = require('./stopped-certification').stoppedLifecyclePermit(stopped.capability);
      const short = s => ({ bootId: s.bootId, pid: s.pid, birthTicks: s.birthTicks });
      let originalFullScope;
      const ownScope = s => { scope(s); if (canonical(short(s)) !== canonical(request.originalScope) || originalFullScope && canonical(originalFullScope) !== canonical(s)) fail('owner_lifecycle_foreign_stop'); originalFullScope ||= s; };
      reverify(); pinInitial(); request.check();
      boot = request.actor;
      const snap = historySnapshot(); settled(snap); assertHistory(snap);
      const initial = Object.fromEntries([...MARKERS, 'gate'].map(n => [n, view(paths[n])]));
      const referenced = [];
      let gateRecord, ownerRecord, diagnosticRecord;
      if (initial.gate.bytes) {
        gateRecord = gateBody(initial.gate); ownScope(gateRecord.scope);
        if (gateRecord.takeoverId !== null || gateRecord.phase === 'shutdown' && gateRecord.readyId !== null) fail('owner_lifecycle_phase');
      }
      if (initial.owner.bytes) {
        ownerRecord = decode(initial.owner, 'runtime-owner', ['scope', 'phase', 'receiverIdentity']); ownScope(ownerRecord.scope);
        if (!['starting', 'active'].includes(ownerRecord.phase) || ownerRecord.receiverIdentity !== null && typeof ownerRecord.receiverIdentity !== 'string' || ownerRecord.phase === 'active' && !ownerRecord.receiverIdentity) fail('owner_lifecycle_record');
        if (ownerRecord.receiverIdentity !== null && (!snap.receiver.present || ownerRecord.receiverIdentity !== snap.receiver.identity)) fail('owner_lifecycle_history_missing');
      }
      if (initial.diagnostic.bytes) { diagnosticRecord = decode(initial.diagnostic, 'diagnostic-owner', ['scope', 'reason']); ownScope(diagnosticRecord.scope); if (ownerRecord) fail('owner_lifecycle_foreign_stop'); }
      function referencedIntent(id, kind, fields) {
        const dir = path.join(d.installRoot, 'transactions', id + '-owner-lifecycle');
        if (!plain(dir, true, true)) return null;
        const intent = view(path.join(dir, 'intent.json'), METADATA_LIMIT);
        if (!intent.bytes) { transactionTree(dir, ['intent.json']); return null; }
        const body = decode(intent, kind, fields); if (body.id !== id) fail('owner_lifecycle_transaction');
        referenced.push({ id, kind, dir }); return body;
      }
```

## `core4/runtime/owner-lifecycle.js:352–375`
Полный файл SHA256 (hex groups, concatenate) `c9d9328e:7e3ffdee:86f4ece7:e4ea45a1:3e0e472d:52c99a9f:d4e75fda:070e9f5b`; Git blob `27bd5690:54fdcd00:631eeceb:f9501732:36cb4760`. Выдержка: строки 352–375, 2075 bytes.

```javascript
      for (const n of ['brokerOwner', 'brokerGate', 'receiverOwner']) if (initial[n].bytes && (!expected || !initial[n].bytes.equals(Buffer.from(expected[n])))) fail('owner_lifecycle_marker');
      if (!producer && !diagnosticRecord && MARKERS.some(n => initial[n].bytes)) fail('owner_lifecycle_legacy_marker');
      function facts() {
        const transactions = {};
        for (const item of referenced) {
          const s = fs.lstatSync(item.dir, { bigint: true }), names = fs.readdirSync(item.dir).sort();
          if (names.length > 32) fail('owner_lifecycle_budget');
          transactions[item.id] = { kind: item.kind, directory: { dev: String(s.dev), ino: String(s.ino), birthtimeNs: String(s.birthtimeNs) }, tree: Object.fromEntries(names.map(n => [n, serial(view(path.join(item.dir, n), METADATA_LIMIT), n)])) };
        }
        return { markers: Object.fromEntries([...MARKERS, 'gate'].map(n => [n, serial(view(paths[n]), n)])), transactions };
      }
      const before = facts();
      if (stopped.inspectOnly) return before;
      if (canonical(before) !== canonical(request.expected)) fail('owner_lifecycle_changed');
      request.check(); reverify(); assertHistory(snap); for (const v of Object.values(initial)) assertView(v);
      for (const item of referenced.filter(r => r.id !== request.id)) { if (item.kind === 'owner-ready-intent') finishReady(item.id, true, prior ? request.id : null); else finishRecovery(item.id); }
      const originals = Object.fromEntries(MARKERS.map(n => [n, view(paths[n])]));
      if (prior) finishRecovery(request.id);
      else if (Object.values(originals).some(v => v.bytes !== null)) {
        const dir = transaction(request.id, true);
        durable(path.join(dir, 'intent.json'), seal('owner-recovery-intent', { id: request.id, previousScope: producer || diagnosticRecord.scope,
          originals: Object.entries(originals).filter(([, v]) => v.bytes !== null).map(([n, v]) => serial(v, n, true)), protected: PROTECTED.map(n => serial(snap.values[n], n)) }));
        finishRecovery(request.id);
      }
```
