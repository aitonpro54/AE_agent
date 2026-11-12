# 03-lease-worksession

Выбранные точные исходники; вне обозначенных диапазонов контекст не включён.

## `core4/runtime/controller-lease.js:1–103`
Полный файл SHA256 (hex groups, concatenate) `45403002:5198334d:7ce1fdd3:c57aefcd:109998b1:5ddd3c26:6811b886:e817c253`; Git blob `8dec8036:bba1ceee:566d82fc:5fae8edc:c1f94f2d`. Выдержка: строки 1–103, 5529 bytes.

```javascript
'use strict';
const { randomUUID } = require('node:crypto');

// Private owner-side primitive, not a grant/IPC API. Not in source-package.json.
// The embedding must authenticate attachments, restore durable fences before
// accepting work, and validate the lease again at physical submit/deliver.
function createControllerLease({ clock = () => performance.now(), ttlMs = 30000 } = {}) {
  if (typeof clock !== 'function' || !Number.isSafeInteger(ttlMs) || ttlMs < 1000 || ttlMs > 300000) throw new Error('controller_options');
  const bootId = randomUUID(), clients = new WeakMap(), grants = new WeakMap(), operations = new WeakMap();
  let generation = 0, serial = 0, current = null, lastTime = -Infinity, faulted = false;
  function fail(code) { const error = new Error(code); error.code = code; throw error; }
  function healthy() { if (faulted) fail('controller_clock_fault'); }
  function now() {
    healthy();
    let value;
    try { value = clock(); } catch { faulted = true; fail('controller_clock_fault'); }
    if (!Number.isFinite(value) || value < 0 || value < lastTime) { faulted = true; fail('controller_clock_fault'); }
    lastTime = value; return value;
  }
  function client(session, allowDetached = false) {
    const record = clients.get(session);
    if (!record) fail('controller_client_identity');
    if (!allowDetached && !record.connected) fail('controller_client_detached');
    return record;
  }
  function lease(handle, allowExpired = false) {
    healthy();
    const record = grants.get(handle);
    if (!record || record !== current) fail('controller_lease_identity');
    client(record.session);
    if (record.fenced) fail('controller_fenced');
    if (!allowExpired && now() >= record.expiresAt) fail('controller_lease_expired');
    return record;
  }
  function issue(session, time) {
    const handle = Object.freeze({ bootId, generation: ++generation, clientId: session.clientId });
    const record = { session, handle, expiresAt: time + ttlMs, operation: null, fenced: false };
    grants.set(handle, record); current = record; return handle;
  }
  return Object.freeze({
    attach() {
      healthy();
      const session = Object.freeze({ clientId: randomUUID() });
      clients.set(session, { connected: true }); return session;
    },
    acquire(session) {
      healthy(); client(session);
      if (current) fail(current.fenced ? 'controller_fenced' : 'controller_busy');
      return issue(session, now());
    },
    transferExpired(session, expected) {
      healthy(); client(session);
      if (!expected || Object.getPrototypeOf(expected) !== Object.prototype || Object.keys(expected).sort().join(',') !== 'bootId,generation,holderClientId') fail('controller_expected');
      if (!current || expected.bootId !== bootId || expected.generation !== current.handle.generation || expected.holderClientId !== current.session.clientId) fail('controller_transfer_changed');
      if (current.fenced) fail('controller_fenced');
      if (current.operation) fail('controller_draining');
      const time = now();
      if (time < current.expiresAt) fail('controller_not_expired');
      // Explicit exact-holder transfer only. Durable quiescence is additionally
      // checked by the trusted embedding; no time-driven automatic takeover.
      return issue(session, time);
    },
    assertCurrent(handle) { lease(handle); },
    renew(handle) {
      const record = lease(handle, true), time = now();
      if (time >= record.expiresAt) fail('controller_lease_expired');
      record.expiresAt = time + ttlMs;
    },
    release(handle) {
      const record = lease(handle, true);
      if (record.operation) fail('controller_draining');
      current = null;
    },
    detach(session) {
      const record = client(session, true); record.connected = false;
      // Socket loss revokes new work, but accepted work belongs to the owner.
      if (current?.session === session && !current.operation && !current.fenced && !faulted) current = null;
    },
    begin(handle) {
      const record = lease(handle);
      if (record.operation) fail('controller_operation_pending');
      const operation = Object.freeze({ bootId, generation: handle.generation, serial: ++serial });
      record.operation = operation; operations.set(operation, record); return operation;
    },
    complete(operation, outcome) {
      // Original completion remains recordable after expiry/detach/clock fault.
      // Only the trusted owner calls this after its durable outcome processing;
      // a client-provided "settled" string can never resolve physical UNKNOWN.
      const record = operations.get(operation);
      if (!record || record !== current || record.operation !== operation) fail('controller_operation_identity');
      if (!['settled', 'unknown'].includes(outcome)) fail('controller_outcome');
      record.operation = null; operations.delete(operation);
      if (outcome === 'unknown') record.fenced = true;
      if (!record.fenced && !clients.get(record.session).connected && !faulted) current = null;
    },
    status() {
      const time = faulted ? null : now();
      return Object.freeze({ bootId, generation, mode: faulted ? 'faulted' : !current ? 'idle' : current.fenced ? 'fenced' : !clients.get(current.session).connected ? 'draining' : time >= current.expiresAt ? 'expired' : 'held',
        holderClientId: current?.session.clientId || null, pending: !!current?.operation, fenced: !!current?.fenced });
    }
  });
}
module.exports = { createControllerLease };
```

## `core4/runtime/work-session.js:23–78`
Полный файл SHA256 (hex groups, concatenate) `6956afea:74d8d5b1:261f116a:d775204a:0ec6def6:f6208473:11d21d65:d502eff9`; Git blob `989efff7:98bb6a48:5545ffd1:d4cb10ad:0d84ec02`. Выдержка: строки 23–78, 6936 bytes.

```javascript
function createWorkSession(options){
  exact(options,['installation','descriptorPath']);const d=Object.freeze(structuredClone(options.installation)),descriptorPath=options.descriptorPath;
  if(!d||d.machineId!==os.hostname()||descriptorPath!==path.join(d.installRoot,'installation.json')||d.stateDir!==path.join(d.installRoot,'state/production')||!equal(require('./installation').verifyInstallation(descriptorPath),d))fail('work_session_installation');
  const descriptor=read(descriptorPath),currentHash=descriptor.hash,anchors=['origin.json','state/production/origin.json'].map(n=>read(path.join(d.installRoot,n)));
  if(!anchors[0].bytes||!anchors[0].bytes.equals(anchors[1].bytes))fail('work_session_origin');const origin=JSON.parse(anchors[0].bytes);if(origin.installationId!==d.installationId||origin.machineId!==d.machineId)fail('work_session_origin');
  const master=read(path.join(d.stateDir,'work-session.json')),baselinePath=path.join(d.stateDir,'work-session-baseline.json'),keys=new Map([[currentHash,d]]);
  function signer(descriptorHash){
    if(!HEX.test(descriptorHash))fail('work_session_record');if(keys.has(descriptorHash))return keys.get(descriptorHash);
    const resolved=require('./installation-lineage').resolveHistoricalInstallation({descriptorPath,descriptorHash});
    if(!equal(resolved.current,d)||resolved.historical.descriptorHash!==descriptorHash)fail('work_session_lineage');const historical=resolved.historical.descriptor;
    if(historical.installationId!==d.installationId||historical.machineId!==d.machineId||historical.stateDir!==d.stateDir)fail('work_session_lineage');keys.set(descriptorHash,historical);return historical;
  }
  function mac(body){const signed=signer(body.descriptorHash),key=crypto.createHmac('sha256',Buffer.from(signed.panelToken,'hex')).update('ae-core4/start-over-key/v1\0').update(Buffer.from(signed.controlToken,'hex')).digest();return crypto.createHmac('sha256',key).update('ae-core4/start-over-record/v1\0'+canonical(body)).digest('hex');}
  function decode(v,kind,fields){
    if(!v.bytes?.length||!Buffer.from(v.bytes.toString('utf8')).equals(v.bytes))fail('work_session_record');let e;try{e=JSON.parse(v.bytes);}catch{fail('work_session_record');}exact(e,['body','mac']);exact(e.body,['version','kind','installationId','machineId','descriptorHash',...fields]);
    if(e.body.version!==1||e.body.kind!==kind||e.body.installationId!==d.installationId||e.body.machineId!==d.machineId||!HEX.test(e.mac)||!crypto.timingSafeEqual(Buffer.from(mac(e.body),'hex'),Buffer.from(e.mac,'hex'))||!Buffer.from(canonical(e)).equals(v.bytes))fail('work_session_record');return e.body;
  }
  function seal(kind,value){const body={version:1,kind,installationId:d.installationId,machineId:d.machineId,descriptorHash:currentHash,...value};return Buffer.from(canonical({body,mac:mac(body)}));}
  let session=null;
  if(master.bytes){
    session=decode(master,'work-session',['resetId','sessionId','intentHash','baselineRequired']);
    if(!UUID.test(session.resetId)||!UUID.test(session.sessionId)||!HEX.test(session.intentHash)||session.baselineRequired!==true)fail('work_session_record');
    const dir=path.join(d.installRoot,'transactions',session.resetId+'-start-over');plain(dir,false,true);
    const candidate=read(path.join(dir,'session-candidate.json'));if(!same(candidate,master))fail('work_session_alias');
    const completedView=read(path.join(dir,'reset-completed.json')),completed=decode(completedView,'start-over-completed',['id','intentHash','archiveManifestHash','sessionHash','baselineRequired']),enable=decode(read(path.join(dir,'enable-intent.json')),'start-over-enable-intent',['id','intentHash','completedHash']);
    if(completed.descriptorHash!==session.descriptorHash||enable.descriptorHash!==session.descriptorHash||completed.id!==session.resetId||completed.intentHash!==session.intentHash||!HEX.test(completed.archiveManifestHash)||completed.sessionHash!==master.hash||completed.baselineRequired!==true||enable.id!==session.resetId||enable.intentHash!==session.intentHash||enable.completedHash!==completedView.hash)fail('work_session_incomplete');
  }
  function baseline(){
    const v=read(baselinePath);if(!v.bytes)return null;if(!session)fail('work_session_baseline_without_session');
    const b=decode(v,'work-session-baseline',['sessionId','sessionHash','commandId','executorHash','payloadHash','receiverStoreIdentity','observationHash','channelEpoch']);
    if(b.sessionId!==session.sessionId||b.sessionHash!==master.hash||![b.executorHash,b.payloadHash,b.observationHash].every(s=>HEX.test(s))||['commandId','receiverStoreIdentity','channelEpoch'].some(k=>typeof b[k]!=='string'||!b[k]||b[k].length>256))fail('work_session_baseline');return{view:v,body:b};
  }
  baseline();
  function resetPending(){try{fs.lstatSync(path.join(d.stateDir,'runtime-start-over.json'));return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
  function assertFiles(){
    if(!same(read(descriptorPath),descriptor)||!anchors.every(a=>same(read(a.file),a))||!same(read(master.file),master))fail('work_session_changed');
  }
  function status(){
    if(resetPending())return Object.freeze({sessionId:session?.sessionId??null,resetId:session?.resetId??null,mode:session?'work-session':'legacy',baselineRequired:true,resetPending:true,aeAuthority:false});
    assertFiles();return Object.freeze({sessionId:session?.sessionId??null,resetId:session?.resetId??null,mode:session?'work-session':'legacy',baselineRequired:!!session&&!baseline(),resetPending:false,aeAuthority:false});
  }
  function assertCurrent(sessionId){const value=status();if(value.resetPending)fail('work_session_reset_pending');if(sessionId!==value.sessionId)fail('work_session_changed');return value;}
  return Object.freeze({
    status,
    assertCurrent,
    recordProjectBaseline(peer,result){
      const proof=require('../integrations/cep/http-peer').consumeProjectObservation(peer,result);if(!proof)fail('work_session_observation_proof');
      const value=assertCurrent(session?.sessionId??null);if(proof.sessionId!==value.sessionId)fail('work_session_observation_session');
      if(!session)return Object.freeze({recorded:false,legacy:true,aeAuthority:false});if(baseline())return Object.freeze({recorded:false,baselineRequired:false,aeAuthority:false});
      const bytes=seal('work-session-baseline',{sessionId:session.sessionId,sessionHash:master.hash,commandId:proof.commandId,executorHash:proof.executorHash,payloadHash:proof.payloadHash,receiverStoreIdentity:proof.receiverStoreIdentity,observationHash:proof.observationHash,channelEpoch:proof.channelEpoch});
      assertFiles();if(resetPending())fail('work_session_reset_pending');atomic(baselinePath,bytes);assertFiles();if(resetPending())fail('work_session_reset_pending');baseline();
      return Object.freeze({recorded:true,baselineRequired:false,aeAuthority:false});
    }
  });
}
module.exports={createWorkSession};
```
