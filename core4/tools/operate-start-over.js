'use strict';
// Distribution-only local operator. The owner creates the reset and enforces
// its barriers. This helper can neither stop AE nor dispatch AE work.
const path=require('node:path'),http=require('node:http'),fs=require('node:fs');
async function operate(capability){
  const options=require('./standalone-installer').assertStartOverBootstrap(capability);
  const d=require('./maintain-owner').verifyOwnerInstallation(options.descriptor,options.expectedCurrentPackageHash);
  if(d.releaseDir===path.resolve(__dirname,'..'))throw Object.assign(Error('start_over_distribution_separate'),{code:'start_over_distribution_separate'});
  const{canonical,hash,fail}=require('../protocol/json');
  if(canonical(require('../runtime/installation').verifyInstallation(options.descriptor))!==canonical(d))fail('start_over_installation_changed');
  const state=require('../runtime/start-over-state');
  if(['start-over-stopped-plan','start-over-stopped-request'].includes(options.mode)){
    return state.stoppedStartOver({installation:d,descriptorPath:options.descriptor,operationId:options.id,confirmedPlanHash:options.confirmedPlanHash});
  }
  const inspect=()=>state.inspectStartOver({installation:d,descriptorPath:options.descriptor});
  const initiating=['start-over-plan','start-over-request'].includes(options.mode);
  const current=initiating?null:inspect();
  if(options.mode==='start-over-inspect'){
    if(current.id!==null&&current.id!==options.id)fail('start_over_intent_changed');return current;
  }
  if(options.mode==='start-over-finish')return require('../runtime/start-over-finisher').finishStartOver({installation:d,descriptorPath:options.descriptor,id:options.id,expectedIntentHash:options.expectedIntentHash});
  if(!initiating&&(options.mode!=='start-over-continue'||current.id!==options.id||current.intentHash!==options.expectedIntentHash))fail('start_over_intent_changed');
  const{mac,validMac}=require('../integrations/cep/peer-protocol'),domain='ae-core4/panel-start-over/v1';
  async function post(route,input){return new Promise((resolve,reject)=>{
    let settled=false,timer;
    function done(error,value){if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolve(value);}
    const req=http.request({host:'127.0.0.1',port:3457,path:route,method:'POST',agent:false,headers:{Origin:'null','Content-Type':'application/json'}},res=>{
      let bytes=0,chunks=[];res.on('data',b=>{bytes+=b.length;if(bytes>16384)res.destroy();else chunks.push(b);});
      res.on('error',()=>done(Object.assign(Error('start_over_continue_uncertain'),{code:'start_over_continue_uncertain'})));
      res.on('end',()=>{try{const value=JSON.parse(Buffer.concat(chunks));if(res.statusCode!==200)fail(typeof value?.error==='string'&&/^start_over_[a-z0-9_]{1,88}$/.test(value.error)?value.error:'start_over_continue_refused');done(null,value);}catch(e){done(e);}});
    });req.on('error',()=>done(Object.assign(Error('start_over_continue_uncertain'),{code:'start_over_continue_uncertain'})));timer=setTimeout(()=>{req.destroy();done(Object.assign(Error('start_over_continue_uncertain'),{code:'start_over_continue_uncertain'}));},15000);req.end(canonical(input));
  });}
  async function rpc(action,expected){
    const response=await post('/start-over/challenge',expected?{action,expected}:{action}),c=response.challenge;
    if(!c||c.version!==1||c.purpose!=='start-over'||c.role!=='panel'||c.action!==action||c.origin!=='null'||typeof c.nonce!=='string'||!/^[a-f0-9]{64}$/.test(c.nonce))fail('start_over_continue_auth');
    if(c.installationId!==d.installationId||c.packageHash!==d.packageHash)fail('start_over_binding_changed');
    if(expected&&(!c.expected||canonical(c.expected)!==canonical(expected)))fail('start_over_continue_auth');
    const reply=await post('/start-over/'+action,{challenge:c,proof:mac({domain,kind:'request',challenge:c},d.panelToken)}),b=reply.body;
    if(!b||b.version!==1||b.purpose!=='start-over'||b.action!==action||b.epoch!==c.epoch||b.nonce!==c.nonce||b.origin!==c.origin||b.installationId!==d.installationId||b.packageHash!==d.packageHash||!validMac({domain,kind:'response',body:b},reply.mac,d.panelToken)||(!initiating&&b.status?.id!==options.id)||b.status?.aeAuthority!==false)fail('start_over_continue_auth');return b.status;
  }
  if(initiating){
    const {createIpcClient}=require('../runtime/client-ipc.js');
    const {ownerEndpoint}=require('../runtime/client-entry.js');
    const client=await createIpcClient({endpoint:ownerEndpoint(d),identity:{installationId:d.installationId,machineId:d.machineId,packageHash:d.packageHash},secret:d.controlToken,timeoutMs:5000}).catch(e=>{
      if(e.code==='ipc_endpoint_absent')fail('start_over_owner_not_ready');
      if(e.code==='ipc_authentication')fail('start_over_binding_changed');
      throw e;
    });
    async function observe(){
      const reply=await client.call('core_status',{}), s=reply?.value, recovery=s?.startOver;
      if(!reply?.ok||!recovery?.eligibility||!s.lifecycle)fail('start_over_operator_status');
      if(recovery.eligibility.action==='none')fail(recovery.eligibility.reason);
      if(recovery.eligibility.action!=='request'||inspect().id!==null)fail('start_over_in_progress');
      const {pid,birthTicks,processBootId}=s.lifecycle;
      const {sessionId,id:resetId}=recovery;
      if(!s.workSession||s.workSession.sessionId!==sessionId||s.workSession.resetId!==resetId||processBootId!==recovery.ownerBootId||!Number.isSafeInteger(pid)||typeof birthTicks!=='string')fail('start_over_binding_changed');
      return {pid,birthTicks,processBootId,sessionId,resetId,unresolved:s.unresolved??[],requiresAEExit:recovery.requiresAEExit,eligibility:recovery.eligibility};
    }
    function journal(relative){
      const file=path.join(d.stateDir,relative), before=fs.lstatSync(file,{bigint:true,throwIfNoEntry:false});
      if(!before)return null;
      if(!before.isFile()||before.isSymbolicLink()||before.size>64n*1024n*1024n||fs.realpathSync(file)!==file)fail('start_over_operator_journal');
      const fd=fs.openSync(file,'r');
      try{
        const same=value=>value&&['dev','ino','size','mtimeNs','ctimeNs','nlink'].every(key=>before[key]===value[key]);
        if(!same(fs.fstatSync(fd,{bigint:true})))fail('start_over_operator_journal');
        const bytes=Buffer.alloc(Number(before.size));
        for(let offset=0;offset<bytes.length;){
          const count=fs.readSync(fd,bytes,offset,bytes.length-offset,offset);
          if(!count)fail('start_over_operator_journal');
          offset+=count;
        }
        if(!same(fs.fstatSync(fd,{bigint:true}))||!same(fs.lstatSync(file,{bigint:true,throwIfNoEntry:false})))fail('start_over_operator_journal');
        return {bytes:bytes.length,sha256:hash(bytes)};
      }finally{fs.closeSync(fd);}
    }
    try{
      const status=await observe(), panel=await rpc('status');
      const history=()=>({receiver:journal('receiver/completions.ndjson'),ledger:journal('broker/ledger.ndjson')});
      const journals=history();
      const expected={ownerBootId:status.processBootId,id:status.resetId,sessionId:status.sessionId,action:'request',reason:status.eligibility.reason};
      if(!panel?.eligibility||panel.ownerBootId!==expected.ownerBootId||panel.sessionId!==expected.sessionId||panel.id!==expected.id)fail('start_over_binding_changed');
      if(panel.eligibility.action==='none')fail(panel.eligibility.reason);
      if(panel.requiresAEExit!==status.requiresAEExit||canonical(panel.eligibility)!==canonical(status.eligibility)||
         canonical(status)!==canonical(await observe())||canonical(journals)!==canonical(history()))fail('start_over_operator_changed');
      const plan={version:1,operationId:options.id,installationId:d.installationId,packageHash:d.packageHash,
        descriptorHash:hash(fs.readFileSync(options.descriptor)),status,journals};
      const planHash=hash(plan);
      if(options.mode==='start-over-plan')return {plan,planHash,dispatched:false,aeAuthority:false};
      if(options.confirmedPlanHash!==planHash)fail('start_over_operator_confirmation_changed');
      // Claim this session before any request. A lost reply is resolved by
      // inspecting the owner intent, never by another operator request.
      const claim=path.join(d.stateDir,'operator-start-over-'+hash(status.sessionId??'legacy')+'.json');
      const fd=fs.openSync(claim,'wx',0o600);
      try{
        fs.writeFileSync(fd,canonical({plan,planHash,mac:mac({domain:'ae-core4/operator-start-over/v1',planHash},d.controlToken)}));
        fs.fsyncSync(fd);
      }finally{fs.closeSync(fd);}
      const reset=await rpc('request',expected);
      if(!reset.id||reset.id===status.resetId)fail('start_over_operator_outcome_uncertain');
      return {operationId:options.id,planHash,reset,dispatched:true,aeAuthority:false};
    }finally{client.close();}
  }
  const status=await rpc('status');
  if(status.eligibility?.action!=='continue')return{...status,continueRequested:false};
  // One explicit continuation of THIS intent. Lost output is inspected later;
  // neither request nor finish is retried by this adapter.
  return{...await rpc('request',{ownerBootId:status.ownerBootId,id:status.id,sessionId:status.sessionId,action:'continue',reason:status.eligibility.reason}),continueRequested:true};
}
module.exports={operate};
