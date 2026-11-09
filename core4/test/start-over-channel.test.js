'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),http=require('node:http'),Module=require('node:module');
const {createHttpPeer,consumeProjectObservation}=require('../integrations/cep/http-peer'),{createAttachmentOwner}=require('../runtime/attachment-owner');
const {hash,canonical}=require('../protocol/json'),{mac}=require('../integrations/cep/peer-protocol'),{encode}=require('../protocol/codec');
const installation={installationId:'channel-fixture',packageHash:'a'.repeat(64),panelToken:'b'.repeat(64),controlToken:'c'.repeat(64)},asset={assetKey:'project-inspection-v1',executorHash:'d'.repeat(64)};
const sid1='10000000-0000-4000-8000-000000000001',sid2='10000000-0000-4000-8000-000000000002';
async function fixture(t,options={}) {
  const {peerFactory=createHttpPeer,...peerOptions}=options;
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'core4-reset-channel-'));
  const peer=peerFactory({installation,asset,directory,port:0,timeout:200,pollTimeout:80,...peerOptions});await peer.listen();
  t.after(async()=>{await peer.close();assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true});});
  function raw(route,body,discard=false) {return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port:peer.status().port,path:route,method:'POST',agent:false,headers:{Origin:'null','Content-Type':'application/json'}},res=>{if(discard){res.destroy();resolve({status:res.statusCode});return;}let text='';res.on('data',b=>text+=b);res.on('end',()=>resolve({status:res.statusCode,value:JSON.parse(text)}));});req.on('error',reject);req.end(canonical(body));});}
  const challenge=(await raw('/challenge',{role:'panel'})).value,peerId='channel-panel';assert.equal((await raw('/link',{challenge,peerId,proof:mac({challenge,peerId},installation.panelToken)})).status,200);let sequence=0;
  async function request(route,payload,discard){const body={epoch:challenge.epoch,peerId,sequence:++sequence,method:'POST',path:route,payload};return raw(route,{body,mac:mac(body,installation.panelToken)},discard);}
  async function call(route,payload){const response=await request(route,payload);assert.equal(response.status,200,JSON.stringify(response.value));assert.equal(response.value.mac,mac(response.value.body,installation.panelToken));return response.value.body.payload;}
  return {peer,call,request,raw,directory,challenge,peerId,events:()=>fs.readFileSync(path.join(directory,'completions.ndjson'),'utf8').trim().split('\n').map(JSON.parse)};
}
const observation={observationVersion:1,target:{projectId:null,compId:null},project:{name:'',numItems:0,saved:false},compositions:[],layers:[],truncated:false,aeVersion:'fixture'};
function completion(frame){return{commandId:frame.commandId,originalBinding:frame.originalBinding,pins:frame.pins,result:observation};}

test('start-over-channel fence refuses a new direct or Broker submit before durable begin',async t=>{
  const f=await fixture(t),before=f.events();f.peer.fenceForStartOver();f.peer.fenceForStartOver();
  assert.equal(f.peer.status().startOverFrozen,true);assert.throws(()=>f.peer.inspect({}),e=>e.code==='start_over_frozen');
  const binding={controllerId:'controller',channelEpoch:'epoch',secret:'e'.repeat(64)};await f.peer.transport.connect(binding);
  const command={protocolVersion:1,...binding,commandId:'not-begun',moduleId:'project-inspection',operationId:'inspect',executorHash:asset.executorHash,phase:'inspect',payload:{},payloadHash:hash(canonical({}))};delete command.secret;
  await assert.rejects(f.peer.transport.send(encode(command,binding.secret)),e=>e.code==='start_over_frozen');
  assert.deepEqual(f.events(),before);assert.deepEqual(await f.call('/poll',{}),{command:null});
});
test('start-over-channel previously accepted undelivered command cannot escape through late poll',async t=>{
  const f=await fixture(t),result=f.peer.inspect({}).catch(e=>e);assert.equal(f.peer.status().pending.delivered,false);
  f.peer.fenceForStartOver();assert.deepEqual(await f.call('/poll',{}),{command:null});assert.equal(f.peer.status().pending.delivered,false);
  assert.equal((await result).code,'host_callback_timeout');assert.deepEqual(f.events().map(e=>e.type),['origin','begin','unknown']);
});
test('start-over-channel reset flushes outstanding poll without delivering a command',async t=>{
  const f=await fixture(t,{pollTimeout:1000}),waiting=f.call('/poll',{});await new Promise(resolve=>setTimeout(resolve,15));f.peer.fenceForStartOver();
  assert.deepEqual(await waiting,{command:null});assert.equal(f.peer.status().pending,null);assert.deepEqual(f.events().map(e=>e.type),['origin']);
});
test('start-over-channel delivered native completion settles only the old journal after the fence',async t=>{
  const f=await fixture(t),result=f.peer.inspect({}),frame=(await f.call('/poll',{})).command;f.peer.fenceForStartOver();
  assert.ok((await f.call('/complete',completion(frame))).ack);assert.deepEqual((await result).observation,observation);
  assert.deepEqual(f.events().map(e=>e.type),['origin','begin','complete']);assert.deepEqual(await f.call('/poll',{}),{command:null});
});
test('start-over-channel normal attachment freeze still drains an already accepted physical command',async t=>{
  const f=await fixture(t),owner=createAttachmentOwner({runtime:{status:f.peer.status,close:async()=>{}},activity:()=>({pending:!!f.peer.status().pending,unresolved:f.peer.status().storeClosed,fault:f.peer.status().storeFault}),invoke:()=>f.peer.inspect({})});
  const session={};owner.onAttach(session);assert.equal((await owner.onRequest({session,method:'controller_acquire',payload:{}})).ok,true);
  const result=owner.onRequest({session,method:'inspect_module_target',payload:{contractId:'a'.repeat(64)}});owner.freeze();const frame=(await f.call('/poll',{})).command;assert.ok(frame);assert.equal(f.peer.status().startOverFrozen,false);
  await f.call('/complete',completion(frame));assert.equal((await result).ok,true);await owner.close();
});
function dispatcherWindow() {
  const source=fs.readFileSync(path.join(__dirname,'../cep/js/poll-dispatcher.js'),'utf8'),context=vm.createContext({JSON,Object,Array,Promise,Error,isFinite});
  const data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},callbacks=[],completes=[];
  function load(){vm.runInContext(source,context);return context.Core4PollDispatcher;}load();
  function dispatcher(sessionId,complete){return context.Core4PollDispatcher.createDispatcher({installationId:installation.installationId,sessionId,pins:{packageHash:installation.packageHash,installationId:installation.installationId,executorHash:asset.executorHash},assetKey:asset.assetKey,storage,csInterface:{evalScript(_script,callback){callbacks.push(callback);}},complete:p=>{completes.push({sessionId,p});return complete?complete(p):Promise.resolve({ack:{commandId:p.commandId,receiptRef:p.originalBinding.receiptRef}});}});}
  function frame(id='native-command'){return{assetKey:asset.assetKey,phase:'inspect',typedPayload:{},commandId:id,originalBinding:{commandId:id,executorHash:asset.executorHash,phase:'inspect',receiptRef:'receipt'},pins:{packageHash:installation.packageHash,installationId:installation.installationId,executorHash:asset.executorHash}};}
  return{context,data,storage,callbacks,completes,load,dispatcher,frame};
}
// Compose the real authenticated HTTP receiver and durable TEMP store with the
// production dispatcher. evalScript is held by the VM fixture, never live AE.
function httpCompletion(f) {
  return async payload=>{
    // Match the JSON serialization boundary of panel fetch across VM realms.
    const response=await f.request('/complete',JSON.parse(JSON.stringify(payload)));
    if(response.status!==200)throw Object.assign(new Error(response.value.error),{code:response.value.error});
    assert.equal(response.value.mac,mac(response.value.body,installation.panelToken));
    return response.value.body.payload;
  };
}

test('start-over-channel HTTP delivery and held VM callback settle only the fenced old receiver before timeout',async t=>{
  const f=await fixture(t,{workSessionId:sid1,timeout:2000}),ui=dispatcherWindow(),old=ui.dispatcher(sid1,httpCompletion(f));
  const result=f.peer.inspect({}).catch(e=>e),frame=(await f.call('/poll',{})).command;
  assert.equal(f.peer.status().pending.delivered,true);assert.equal(frame.originalBinding.receiverStoreIdentity,f.peer.status().receiverStoreIdentity);
  const dispatched=old.dispatch(frame);assert.equal(ui.callbacks.length,1);f.peer.fenceForStartOver();
  assert.deepEqual(await f.call('/poll',{}),{command:null});assert.deepEqual(f.events().map(e=>e.type),['origin','begin']);
  const fresh=ui.dispatcher(sid2);assert.throws(()=>fresh.dispatch(ui.frame('fresh-command')),/physical_callback_pending/);
  ui.callbacks[0](JSON.stringify(observation));await dispatched;const accepted=await result;
  assert.deepEqual(accepted.observation,observation);assert.equal(accepted.continuity,false);
  const proof=consumeProjectObservation(f.peer,accepted);assert.equal(proof.sessionId,sid1);assert.equal(proof.receiverStoreIdentity,frame.originalBinding.receiverStoreIdentity);
  assert.equal(consumeProjectObservation(f.peer,accepted),null);assert.equal(old.pending(),null);
  const settled=f.events();assert.deepEqual(settled.map(e=>e.type),['origin','begin','complete']);
  await f.call('/complete',completion(frame));assert.deepEqual(f.events(),settled);assert.equal(ui.callbacks.length,1);
  await fresh.recover();assert.equal(ui.completes.length,1);assert.equal(ui.completes[0].sessionId,sid1);
});

test('start-over-channel late VM callback after HTTP timeout preserves UNKNOWN and cannot enter a fresh receiver',async t=>{
  const oldPeer=await fixture(t,{workSessionId:sid1,timeout:500}),ui=dispatcherWindow(),old=ui.dispatcher(sid1,httpCompletion(oldPeer));
  const result=oldPeer.peer.inspect({}).catch(e=>e),frame=(await oldPeer.call('/poll',{})).command;
  assert.equal(oldPeer.peer.status().pending.delivered,true);const dispatched=old.dispatch(frame);
  const rejected=assert.rejects(dispatched,e=>e.code==='unknown_no_promotion');oldPeer.peer.fenceForStartOver();
  const outcome=await result;assert.equal(outcome.code,'host_callback_timeout');assert.equal(consumeProjectObservation(oldPeer.peer,outcome),null);
  const unknown=oldPeer.events(),unknownBytes=fs.readFileSync(path.join(oldPeer.directory,'completions.ndjson'));assert.deepEqual(unknown.map(e=>e.type),['origin','begin','unknown']);
  // A separate TEMP receiver models session replacement, not the reset finisher
  // or proof that native AE has stopped. The old window guard must still hold.
  const freshPeer=await fixture(t,{workSessionId:sid2,timeout:2000}),fresh=ui.dispatcher(sid2,httpCompletion(freshPeer)),freshOrigin=freshPeer.events();
  assert.notEqual(freshPeer.peer.status().receiverStoreIdentity,frame.originalBinding.receiverStoreIdentity);
  await assert.rejects(fresh.recover(),/physical_callback_pending/);assert.throws(()=>fresh.dispatch(ui.frame('fresh-command')),/physical_callback_pending/);
  ui.callbacks[0](JSON.stringify(observation));await rejected;
  assert.deepEqual(oldPeer.events(),unknown);assert.equal(oldPeer.peer.status().storeClosed,true);assert.equal(oldPeer.peer.status().pending,null);
  const oldKey=ui.context.Core4PollDispatcher.storageKey(installation.installationId,sid1),freshKey=ui.context.Core4PollDispatcher.storageKey(installation.installationId,sid2);
  assert.equal(JSON.parse(ui.data.get(oldKey)).frame.commandId,frame.commandId);assert.ok(JSON.parse(ui.data.get(oldKey)).result);assert.equal(ui.data.has(freshKey),false);
  await fresh.recover();assert.equal(ui.completes.length,1);assert.equal(ui.completes[0].sessionId,sid1);
  // Even a valid current-channel MAC cannot rebind the historical completion.
  const replay=await freshPeer.request('/complete',completion(frame));assert.equal(replay.status,403);assert.equal(replay.value.error,'completion_correlation');
  assert.deepEqual(freshPeer.events(),freshOrigin);assert.deepEqual(oldPeer.events(),unknown);
  const freshResult=freshPeer.peer.inspect({}).catch(e=>e),freshFrame=(await freshPeer.call('/poll',{})).command,freshDispatch=fresh.dispatch(freshFrame);
  assert.equal(ui.callbacks.length,2);ui.callbacks[1](JSON.stringify(observation));await freshDispatch;const accepted=await freshResult;
  assert.equal(consumeProjectObservation(freshPeer.peer,accepted).sessionId,sid2);assert.deepEqual(freshPeer.events().map(e=>e.type),['origin','begin','complete']);
  assert.deepEqual(oldPeer.events(),unknown);assert.deepEqual(fs.readFileSync(path.join(oldPeer.directory,'completions.ndjson')),unknownBytes);
  assert.equal(ui.data.has(oldKey),true);assert.equal(ui.data.has(freshKey),false);
});

test('start-over-channel new dispatcher and session cannot bypass same-window unresolved native callback',async()=>{
  const f=dispatcherWindow(),old=f.dispatcher(sid1),pending=old.dispatch(f.frame());assert.equal(f.callbacks.length,1);const api=f.load(),fresh=f.dispatcher(sid2);
  assert.equal(api.nativePending(),true);assert.throws(()=>fresh.dispatch(f.frame('new-command')),/physical_callback_pending/);await assert.rejects(fresh.recover(),/physical_callback_pending/);
  assert.equal(f.callbacks.length,1);f.callbacks[0](JSON.stringify(observation));await pending;assert.equal(api.nativePending(),false);await fresh.recover();
});
test('start-over-channel late callback preserves old session key and old completion channel on lost ack',async()=>{
  const f=dispatcherWindow(),old=f.dispatcher(sid1,()=>Promise.reject(new Error('old_channel_lost'))),pending=old.dispatch(f.frame());const observed=assert.rejects(pending,/old_channel_lost/),api=f.load(),fresh=f.dispatcher(sid2);
  f.callbacks[0](JSON.stringify(observation));await observed;const oldKey=api.storageKey(installation.installationId,sid1),newKey=api.storageKey(installation.installationId,sid2);
  assert.equal(f.completes.length,1);assert.equal(f.completes[0].sessionId,sid1);assert.ok(JSON.parse(f.data.get(oldKey)).result);assert.equal(f.data.has(newKey),false);await fresh.recover();assert.equal(f.completes.length,1);
});
test('start-over-channel malformed native callback retains old no-replay latch while releasing returned callback guard',async()=>{
  const f=dispatcherWindow(),old=f.dispatcher(sid1),pending=old.dispatch(f.frame()),observed=assert.rejects(pending);f.callbacks[0]('not-json');await observed;
  assert.equal(f.context.Core4PollDispatcher.nativePending(),false);assert.ok(old.pending());await assert.rejects(old.recover(),/physical_outcome_unknown_no_replay/);assert.equal(f.completes.length,0);
});
test('start-over-channel synchronous native exception remains uncertain across dispatcher script reload',async()=>{
  const f=dispatcherWindow(),api=f.context.Core4PollDispatcher,old=api.createDispatcher({installationId:installation.installationId,sessionId:sid1,pins:{packageHash:installation.packageHash,installationId:installation.installationId,executorHash:asset.executorHash},assetKey:asset.assetKey,storage:f.storage,csInterface:{evalScript(){throw new Error('native_dispatch_uncertain');}},complete(){throw new Error('unexpected');}});
  await assert.rejects(old.dispatch(f.frame()),/native_dispatch_uncertain/);f.load();await assert.rejects(f.dispatcher(sid2).recover(),/physical_callback_pending/);assert.ok(old.pending());
});
test('start-over-channel session keys preserve legacy latch and reject caller malformed session identity',()=>{
  const f=dispatcherWindow(),api=f.context.Core4PollDispatcher;assert.equal(api.storageKey(installation.installationId),'aeagentcore4-physical-'+installation.installationId);assert.equal(api.storageKey(installation.installationId,null),api.storageKey(installation.installationId));
  assert.notEqual(api.storageKey(installation.installationId,sid1),api.storageKey(installation.installationId,sid2));for(const bad of ['',{},'foreign-session','../escape'])assert.throws(()=>f.dispatcher(bad),/physical_session_binding/);
  const key=api.storageKey(installation.installationId);f.storage.setItem(key,'{"legacy":true}');f.dispatcher(sid2);assert.equal(f.storage.getItem(key),'{"legacy":true}');
});
function faultPeer(observeSync = () => {}){
  let failSync=false;const io={...fs,fsyncSync(fd){observeSync();if(failSync)throw Object.assign(Error('fixture_fsync'),{code:'fixture_fsync'});return fs.fsyncSync(fd);}};
  const filename=path.resolve(__dirname,'../integrations/cep/http-peer.js'),m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));
  m.require=name=>name==='./completion-store'?{openCompletionStore:options=>require('../integrations/cep/completion-store').openCompletionStore({...options,io})}:require(name.startsWith('.')?path.resolve(path.dirname(filename),name):name);
  m._compile(fs.readFileSync(filename,'utf8'),filename);return{...m.exports,arm(){failSync=true;}};
}
test('start-over-channel UNKNOWN persist failure cannot escape timer or retain an accepted Promise; fault remains fenced',async t=>{
  const api=faultPeer(),f=await fixture(t,{peerFactory:api.createHttpPeer,timeout:45}),result=f.peer.inspect({}).catch(e=>e);api.arm();
  assert.equal((await result).code,'host_callback_timeout');assert.equal(f.peer.status().pending,null);assert.equal(f.peer.status().storeFault,true);assert.equal(f.peer.status().storeClosed,true);assert.equal(f.peer.status().lastPhysicalFault.authority,false);assert.throws(()=>f.peer.inspect({}),e=>e.code==='receiver_lane_closed');
});
test('start-over-channel failed durable completion cannot mint positive baseline proof and timeout stays finite',async t=>{
  const api=faultPeer(),f=await fixture(t,{peerFactory:api.createHttpPeer,timeout:80}),result=f.peer.inspect({}).catch(e=>e),frame=(await f.call('/poll',{})).command;api.arm();
  assert.equal((await f.request('/complete',completion(frame))).status,403);const error=await result;assert.equal(error.code,'host_callback_timeout');assert.equal(api.consumeProjectObservation(f.peer,error),null);assert.equal(f.peer.status().storeFault,true);assert.equal(f.peer.status().pending,null);
});

test('start-over-channel no poll settles direct intent durably without dispatch or a new channel', async t => {
  const f = await fixture(t, { timeout: 80, directReadDrainMs: 500 });
  const result = f.peer.inspect({}).catch(error => error);
  const begin = f.events().at(-1);
  assert.equal(begin.type, 'begin');
  assert.equal(f.peer.status().pending.stage, 'queued');
  const refusal = f.peer.consumeReadRejection(await result);
  const terminal = f.events().at(-1);
  assert.equal(refusal.code, 'inspection_not_dispatched');
  assert.equal(refusal.physical.handoff, 'none');
  assert.equal(refusal.physical.nativeStart, 'not_started');
  assert.equal(refusal.physical.queue, 'idle');
  assert.equal(refusal.physical.terminalReceipt.recordHash, terminal.recordHash);
  assert.deepEqual(terminal.response.result, { notDispatchedVersion: 1, outcome: 'rejected', code: refusal.code });
  assert.equal(f.peer.status().storeClosed, false);
  const forgedFrame = { commandId: begin.commandId, originalBinding: begin.originalBinding,
    pins: { installationId: installation.installationId, packageHash: installation.packageHash, executorHash: asset.executorHash } };
  assert.equal((await f.request('/complete', { ...forgedFrame, result: terminal.response.result })).value.error, 'unknown_no_promotion');
  assert.deepEqual(await f.call('/poll', {}), { command: null });
  const fresh = f.peer.inspect({});
  const frame = (await f.call('/poll', {})).command;
  assert.notEqual(frame.commandId, begin.commandId);
  assert.equal(frame.originalBinding.channelEpoch, begin.originalBinding.channelEpoch);
  await f.call('/complete', completion(frame));
  assert.deepEqual((await fresh).observation, observation);
  const file = fs.readFileSync(path.join(f.directory, 'completions.ndjson'));
  assert.equal(require('../runtime/recovery-inspection').inspectReceiverHistory(file).settled, true);
});

test('start-over-channel direct late callback requires its original authenticated delivery and settles before unlock', async t => {
  let durableWrite;
  const api = faultPeer(() => { if (durableWrite) durableWrite(); });
  const f = await fixture(t, { peerFactory: api.createHttpPeer, timeout: 150, directReadDrainMs: 3000, workSessionId: sid1 });
  const ui = dispatcherWindow(), old = ui.dispatcher(sid1, httpCompletion(f));
  const result = f.peer.inspect({}).catch(error => error);
  const frame = (await f.call('/poll', {})).command;
  const dispatched = old.dispatch(frame);
  const error = await result, outcome = f.peer.consumeReadRejection(error).physical;
  assert.equal(error.code, 'inspection_callback_pending');
  assert.equal(outcome.stage, 'draining'); assert.equal(outcome.nativeStart, 'unknown');
  assert.equal(f.peer.status().pending.commandId, frame.commandId);
  assert.equal(f.peer.status().storeClosed, false);
  assert.throws(() => f.peer.inspect({}), e => e.code === 'physical_lane_pending');
  assert.deepEqual(await f.call('/poll', {}), { command: null });
  const history = f.events();
  for (const changed of [{ pins: { ...frame.pins, executorHash: 'f'.repeat(64) } },
    { originalBinding: { ...frame.originalBinding, channelEpoch: 'foreign' } },
    { originalBinding: { ...frame.originalBinding, receiverStoreIdentity: 'foreign' } }, { commandId: 'foreign' }]) {
    assert.equal((await f.request('/complete', { ...completion(frame), ...changed })).value.error, 'completion_correlation');
  }
  for (const changed of [{ epoch: 'foreign' }, { peerId: 'reloaded-panel' }]) {
    const body = { epoch: f.challenge.epoch, peerId: f.peerId, sequence: 1, method: 'POST', path: '/complete', payload: completion(frame), ...changed };
    assert.equal((await f.raw('/complete', { body, mac: mac(body, installation.panelToken) })).value.error, 'peer_auth_or_replay');
  }
  const now = Date.now;
  try {
    Date.now = () => now() + 46000;
    const challenge = (await f.raw('/challenge', { role: 'panel' })).value, peerId = 'reloaded-panel';
    assert.equal((await f.raw('/link', { challenge, peerId, proof: mac({ challenge, peerId }, installation.panelToken) })).value.error, 'duplicate_peer');
  } finally { Date.now = now; }
  assert.deepEqual(f.events(), history);
  let observedFsync = false;
  durableWrite = () => {
    observedFsync = true;
    assert.equal(f.peer.status().pending.stage, 'draining');
    assert.equal(f.peer.status().lastCommandOutcome.terminalReceipt, null);
  };
  ui.callbacks[0](JSON.stringify(observation));
  await dispatched;
  durableWrite = null;
  assert.equal(observedFsync, true);
  assert.equal(await result, error);
  assert.equal(api.consumeProjectObservation(f.peer, error), null);
  assert.equal(f.peer.status().pending, null);
  assert.equal(f.peer.status().lastCommandOutcome.late, true);
  assert.equal(f.peer.status().lastCommandOutcome.terminalReceipt.recordHash, f.events().at(-1).recordHash);
  const settled = f.events();
  await f.call('/complete', completion(frame));
  assert.deepEqual(f.events(), settled);
  assert.equal(old.pending(), null);
});

test('start-over-channel lost poll response remains handed-off unknown after drain expiry', async t => {
  const f = await fixture(t, { timeout: 120, directReadDrainMs: 160 });
  const result = f.peer.inspect({}).catch(error => error);
  assert.equal((await f.request('/poll', {}, true)).status, 200);
  const begin = f.events().at(-1);
  assert.equal(f.peer.status().pending.handoff, 'offered');
  assert.equal(f.peer.status().pending.nativeStart, 'unknown');
  assert.equal((await result).code, 'inspection_callback_pending');
  while (!f.peer.status().storeClosed) await new Promise(resolve => setTimeout(resolve, 10));
  const unknown = f.events();
  const receipt = { commandId: begin.commandId, originalBinding: begin.originalBinding, result: observation,
    pins: { installationId: installation.installationId, packageHash: installation.packageHash, executorHash: asset.executorHash } };
  assert.equal((await f.request('/complete', receipt)).value.error, 'unknown_no_promotion');
  assert.deepEqual(f.events(), unknown);
  assert.deepEqual(unknown.map(event => event.type), ['origin', 'begin', 'unknown']);
  assert.equal(f.peer.status().lastCommandOutcome.queue, 'fenced');
  assert.throws(() => f.peer.inspect({}), e => e.code === 'receiver_lane_closed');
});
