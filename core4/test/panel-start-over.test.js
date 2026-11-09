'use strict';
// Production panel/dispatcher, real WebCrypto and reset MAC protocol; synthetic
// browser clock/fetch/native results. No installed panel, port3457 or AE control.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{webcrypto}=require('node:crypto');
const{createStartOverPanelControl}=require('../runtime/start-over-panel-control'),{canonical}=require('../protocol/json'),{mac}=require('../integrations/cep/peer-protocol');
const id='10000000-0000-4000-8000-000000000001',sessionId='10000000-0000-4000-8000-000000000002',ownerBootId='10000000-0000-4000-8000-000000000003';
const ready={id:null,sessionId:null,ownerBootId,phase:'ready',requiresAEExit:false,resetComplete:false,baselineRequired:false,fault:null,eligibility:{action:'request',reason:'start_over_ready'},aeAuthority:false};
const pending={action:'none',reason:'start_over_in_progress'},baseline={action:'none',reason:'start_over_baseline_required'};
async function until(fn){const end=Date.now()+4000;while(!fn()){if(Date.now()>end)assert.fail('panel reset fixture wait expired');await new Promise(resolve=>setTimeout(resolve,1));}}
function panel(t,options={}){
  const cfg={installationId:'panel-reset-fixture',packageHash:'a'.repeat(64),executorHash:'b'.repeat(64),panelToken:'c'.repeat(64),assetKey:'project-inspection-v1',startOverSupported:true},pins={installationId:cfg.installationId,packageHash:cfg.packageHash,executorHash:cfg.executorHash};
  const requests=[],timers=[],native=[],posts=[],values=new Map(),elements={},listeners={};let state=structuredClone(options.initial||ready),now=0,resetRequests=0,confirms=0,peerId,epoch='physical-initial',seq=0,polls=0,unload;
  for(const key of ['connect','start-over'])elements[key]={disabled:false,addEventListener(event,callback){assert.equal(event,'click');listeners[key]=callback;}};
  elements.status={dataset:{},textContent:''};elements.detail={textContent:''};
  const storage={getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  if(options.oldLatch)storage.setItem('aeagentcore4-physical-'+cfg.installationId,JSON.stringify(options.oldLatch));
  const control=createStartOverPanelControl({installation:cfg,status:()=>state,request:async()=>{resetRequests++;state={...ready,id,phase:'stopping',baselineRequired:true,eligibility:pending};return state;}});
  const response=(code,value)=>({ok:code>=200&&code<300,status:code,json:async()=>JSON.parse(JSON.stringify(value))});
  function frame(){return{assetKey:cfg.assetKey,phase:'inspect',typedPayload:{},commandId:'old-native-read',originalBinding:{commandId:'old-native-read',executorHash:cfg.executorHash,phase:'inspect',receiptRef:'old-receipt'},pins};}
  const context=vm.createContext({JSON,Object,Array,Promise,Error,isFinite,TextEncoder,Uint8Array,AbortController,crypto:webcrypto,Date:class extends Date{static now(){return now;}},localStorage:storage,document:{getElementById:k=>elements[k]},
    confirm(){confirms++;return options.confirm!==false;},addEventListener(event,callback){assert.equal(event,'unload');unload=callback;},__adobe_cep__:{evalScript(script,callback){native.push({script,callback});}},
    setTimeout(callback,ms){const timer={callback,ms,request:/RequestTimedOut|requestTimedOut/.test(callback.name)};timers.push(timer);return timer;},clearTimeout(timer){const at=timers.indexOf(timer);if(at>=0)timers.splice(at,1);},
    async fetch(url,request){const route=new URL(url).pathname,value=JSON.parse(request.body);requests.push({route,value});
      if(route.startsWith('/start-over/')){
        const result=await control.handle(route,value,'null');
        if(options.lostRequestReply&&route==='/start-over/request')throw new TypeError('lost reset reply');
        if(options.tamperStatus&&route==='/start-over/status'&&result.body)result.mac='0'.repeat(64);
        return response(200,result);
      }
      if(route==='/challenge')return response(200,{nonce:'f'.repeat(64),epoch,controllerId:'controller',role:'panel',origin:'null',...pins});
      if(route==='/link'){assert.equal(value.proof,mac({challenge:value.challenge,peerId:value.peerId},cfg.panelToken));peerId=value.peerId;seq=0;const body={linked:true,epoch,peerId,controllerId:'controller',pins,receiverStoreIdentity:'fixture-receiver',laneClosed:options.laneClosed===true,workSessionId:state.sessionId,startOver:state};return response(200,{body,mac:mac(body,cfg.panelToken)});}
      assert.ok(['/poll','/complete'].includes(route));assert.equal(value.mac,mac(value.body,cfg.panelToken));assert.equal(value.body.epoch,epoch);assert.equal(value.body.peerId,peerId);assert.equal(value.body.sequence,++seq);
      function channel(payload){const body={epoch,peerId,sequence:value.body.sequence,payload};return response(200,{body,mac:mac(body,cfg.panelToken)});}
      if(route==='/complete'){posts.push(value.body.payload);return channel({ack:{commandId:value.body.payload.commandId,receiptRef:value.body.payload.originalBinding.receiptRef}});}
      if(++polls===1&&options.command)return channel({command:frame()});
      return new Promise((resolve,reject)=>{request.signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true});});
    }
  });vm.runInContext('window=this;',context);context.Core4Installation=cfg;vm.runInContext(fs.readFileSync(path.join(__dirname,'../cep/js/poll-dispatcher.js'),'utf8'),context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../cep/js/panel.js'),'utf8'),context);
  t.after(async()=>{unload();await new Promise(resolve=>setTimeout(resolve,5));assert.equal(timers.length,0);});
  return{cfg,context,elements,requests,native,posts,values,storage,confirms:()=>confirms,resetRequests:()=>resetRequests,polls:()=>polls,click:()=>listeners['start-over'](),set(v){state={...ready,...v};if(state.resetComplete){state.eligibility=v.eligibility||baseline;epoch='physical-new';}},
    async tick(){await until(()=>timers.some(t=>!t.request));const timer=timers.find(t=>!t.request);timers.splice(timers.indexOf(timer),1);now+=timer.ms;timer.callback();await new Promise(resolve=>setTimeout(resolve,5));},hasWait:()=>timers.some(t=>!t.request)};
}
test('panel-start-over initial status is read-only and no business reset is sent automatically',async t=>{const f=panel(t);await until(()=>f.polls()===1);assert.equal(f.resetRequests(),0);assert.equal(f.confirms(),0);assert.equal(f.native.length,0);assert.equal(f.requests.filter(r=>r.route==='/start-over/status').length,1);});
test('panel-start-over cancelling confirmation keeps the physical channel and sends no reset',async t=>{const f=panel(t,{confirm:false});await until(()=>f.polls()===1);await f.click();assert.equal(f.confirms(),1);assert.equal(f.resetRequests(),0);assert.equal(f.elements['start-over'].disabled,false);});
test('panel-start-over explicit request stops poll and waits for the same reset before selecting new session',async t=>{const f=panel(t);await until(()=>f.polls()===1);const clicked=f.click();await until(()=>f.resetRequests()===1&&f.hasWait());assert.equal(f.native.length,0);f.set({id,sessionId,phase:'baseline-required',resetComplete:true,baselineRequired:true});await f.tick();await clicked;await until(()=>f.requests.filter(r=>r.route==='/link').length===2);assert.equal(f.resetRequests(),1);assert.equal(f.confirms(),1);assert.equal(f.native.length,0);});
test('panel-start-over reload during pending reset does not recover or evaluate an old latch',async t=>{const f=panel(t,{initial:{...ready,id,phase:'awaiting-ae',requiresAEExit:true,baselineRequired:true,eligibility:pending},oldLatch:{frame:{commandId:'old'}}});await until(()=>f.hasWait());assert.match(f.elements.status.textContent,/закрыть прежний After Effects/);assert.equal(f.requests.some(r=>r.route==='/challenge'||r.route==='/complete'),false);assert.equal(f.native.length,0);assert.equal(f.resetRequests(),0);});
test('panel-start-over a lost request response is followed by status only and never resubmitted',async t=>{const f=panel(t,{lostRequestReply:true});await until(()=>f.polls()===1);const clicked=f.click();await until(()=>f.resetRequests()===1&&f.hasWait());f.set({id,sessionId,phase:'baseline-required',resetComplete:true,baselineRequired:true});await f.tick();await clicked;assert.equal(f.resetRequests(),1);assert.equal(f.requests.filter(r=>r.route==='/start-over/request').length,1);});
test('panel-start-over forged status MAC cannot select a session or begin the physical handshake',async t=>{const f=panel(t,{tamperStatus:true});await until(()=>f.elements.connect.disabled===false);assert.match(f.elements.status.textContent,/start_over_response_auth/);assert.equal(f.requests.some(r=>r.route==='/challenge'),false);assert.equal(f.native.length,0);assert.equal(f.resetRequests(),0);});
test('panel-start-over late old callback keeps its key/channel and a new session cannot evaluate while callback is pending',async t=>{const f=panel(t,{command:true});await until(()=>f.native.length===1);const clicked=f.click();await until(()=>f.resetRequests()===1&&f.hasWait());f.set({id,sessionId,phase:'baseline-required',resetComplete:true,baselineRequired:true});await f.tick();await clicked;assert.equal(f.native.length,1);assert.equal(f.posts.length,0);const key='aeagentcore4-physical-'+f.cfg.installationId;assert.ok(f.values.has(key));f.native[0].callback(JSON.stringify({readFailureVersion:1,outcome:'rejected',code:'host_registry_unavailable'}));await until(()=>f.hasWait());await f.tick();await until(()=>f.requests.filter(r=>r.route==='/link').length===2);assert.equal(f.posts.length,0);assert.equal(f.native.length,1);assert.ok(JSON.parse(f.values.get(key)).result);assert.equal(f.values.has(f.context.Core4PollDispatcher.storageKey(f.cfg.installationId,sessionId)),false);});
test('panel-start-over healthy baseline uses the signed denial and preserves the physical connection',async t=>{
  const f=panel(t,{initial:{...ready,id,sessionId,phase:'baseline-required',resetComplete:true,baselineRequired:true,eligibility:baseline}});
  await until(()=>f.polls()===1);await f.click();
  assert.equal(f.elements['start-over'].disabled,true);assert.equal(f.elements['start-over'].title,baseline.reason);
  assert.equal(f.confirms(),0);assert.equal(f.resetRequests(),0);
});
test('panel-start-over a new pending command revokes the cached action before confirmation',async t=>{
  const f=panel(t);await until(()=>f.polls()===1);
  f.set({eligibility:{action:'none',reason:'start_over_command_pending'}});await f.click();
  assert.equal(f.elements['start-over'].disabled,true);assert.equal(f.elements['start-over'].title,'start_over_command_pending');
  assert.equal(f.confirms(),0);assert.equal(f.resetRequests(),0);assert.equal(f.polls(),1);
});
