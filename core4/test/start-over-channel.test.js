'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm'),http=require('node:http'),Module=require('node:module');
const {createHttpPeer}=require('../integrations/cep/http-peer'),{createAttachmentOwner}=require('../runtime/attachment-owner');
const {hash,canonical}=require('../protocol/json'),{mac}=require('../integrations/cep/peer-protocol'),{encode}=require('../protocol/codec');
const installation={installationId:'channel-fixture',packageHash:'a'.repeat(64),panelToken:'b'.repeat(64),controlToken:'c'.repeat(64)},asset={assetKey:'project-inspection-v1',executorHash:'d'.repeat(64)};
const sid1='10000000-0000-4000-8000-000000000001',sid2='10000000-0000-4000-8000-000000000002';
async function fixture(t,options={}) {
  const {peerFactory=createHttpPeer,...peerOptions}=options;
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'core4-reset-channel-'));
  const peer=peerFactory({installation,asset,directory,port:0,timeout:200,pollTimeout:80,...peerOptions});await peer.listen();
  t.after(async()=>{await peer.close();assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(directory,{recursive:true});});
  function raw(route,body) {return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port:peer.status().port,path:route,method:'POST',agent:false,headers:{Origin:'null','Content-Type':'application/json'}},res=>{let text='';res.on('data',b=>text+=b);res.on('end',()=>resolve({status:res.statusCode,value:JSON.parse(text)}));});req.on('error',reject);req.end(canonical(body));});}
  const challenge=(await raw('/challenge',{role:'panel'})).value,peerId='channel-panel';assert.equal((await raw('/link',{challenge,peerId,proof:mac({challenge,peerId},installation.panelToken)})).status,200);let sequence=0;
  async function request(route,payload){const body={epoch:challenge.epoch,peerId,sequence:++sequence,method:'POST',path:route,payload};return raw(route,{body,mac:mac(body,installation.panelToken)});}
  async function call(route,payload){const response=await request(route,payload);assert.equal(response.status,200,JSON.stringify(response.value));assert.equal(response.value.mac,mac(response.value.body,installation.panelToken));return response.value.body.payload;}
  return {peer,call,request,raw,directory,events:()=>fs.readFileSync(path.join(directory,'completions.ndjson'),'utf8').trim().split('\n').map(JSON.parse)};
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
  const result=owner.onRequest({session,method:'inspect_module_target',payload:{}});owner.freeze();const frame=(await f.call('/poll',{})).command;assert.ok(frame);assert.equal(f.peer.status().startOverFrozen,false);
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
function faultPeer(){
  let failSync=false;const io={...fs,fsyncSync(fd){if(failSync)throw Object.assign(Error('fixture_fsync'),{code:'fixture_fsync'});return fs.fsyncSync(fd);}};
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
