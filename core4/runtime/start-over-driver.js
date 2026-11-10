'use strict';
// Read-only reset observer before lifecycle/Broker/receiver construction. The
// single private finisher may borrow these exact canonical endpoints by brand.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),os=require('node:os');
const{setTimeout,clearTimeout}=require('node:timers');
const{canonical,fail}=require('../protocol/json');
const drivers=new WeakMap();
function borrowStartOverEndpoints(capability,options){
  const s=drivers.get(capability);if(!s||s.closed||s.borrowed||canonical(s.installation)!==canonical(options.installation)||s.descriptorPath!==options.descriptorPath||s.id!==options.id||s.intentHash!==options.expectedIntentHash)fail('start_over_driver_brand');
  function held(){const a=s.physical.listening&&s.physical.address(),v=s.ipc.status();if(s.closed||!a||a.address!=='127.0.0.1'||a.port!==3457||!v.listening||v.closing||v.faulted)fail('start_over_endpoint_lost');}
  held();s.borrowed=true;let released=false;
  return Object.freeze({physical:s.physical,ipc:s.ipc,assert(){if(released||!s.borrowed)fail('start_over_driver_brand');held();},release(){if(released||!s.borrowed)fail('start_over_driver_brand');released=true;s.borrowed=false;}});
}
function pending(installation){try{fs.lstatSync(path.join(installation.stateDir,'runtime-start-over.json'));return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function continueStartOverStartup({installation,descriptorPath,port=3457}){
  if(!pending(installation))return Object.freeze({resetObserved:false});
  const d=Object.freeze(structuredClone(installation));
  if(port!==3457||d.machineId!==os.hostname()||canonical(require('./installation').verifyInstallation(descriptorPath))!==canonical(d)||fs.realpathSync(path.resolve(__dirname,'..'))!==d.releaseDir)fail('start_over_driver_installation');
  const native=await require('./windows-owner-process').observeOwnerProcess(process.pid);
  if(native.status!=='present'||native.pid!==process.pid||!native.executablePath||path.resolve(native.executablePath).toLowerCase()!==path.resolve(d.nodePath).toLowerCase())fail('start_over_driver_process');
  const bootId=crypto.randomUUID(),capability=Object.freeze({}),physical=http.createServer();
  const s={installation:d,descriptorPath,physical,ipc:null,id:null,intentHash:null,newSessionId:null,requiresAEExit:false,phase:'awaiting-core',fault:null,lastFault:null,waiting:null,closed:false,borrowed:false,finishing:false,restarting:false,timer:null};
  let resolveDone,rejectDone;const done=new Promise((resolve,reject)=>{resolveDone=resolve;rejectDone=reject;});
  function publicStatus(){return{id:s.id,sessionId:s.newSessionId,ownerBootId:bootId,phase:s.phase,requiresAEExit:s.requiresAEExit,resetComplete:false,baselineRequired:true,fault:s.fault,eligibility:startOverEligibility({phase:s.phase,fault:s.fault,canContinue:!!s.id&&!s.restarting&&!s.finishing&&!s.closed}),aeAuthority:false};}
  function status(){return{ready:false,closed:s.closed,pid:process.pid,product:'AE Agent Core 4.2.1',installation:{installationId:d.installationId,machineId:d.machineId,packageHash:d.packageHash,nodeVerified:true},lifecycle:{mode:'start-over',pid:process.pid,birthTicks:native.birthTicks,processBootId:bootId,ready:false},startOver:publicStatus(),resetDiagnostic:{lastFault:s.lastFault,waiting:s.waiting},physical:{listening:physical.listening,port:physical.address()?.port||null,inspectionAvailable:false,coverage:'read-only-reset-observer; execution stores not opened'},controllerAvailable:false,externalLegacyCoverage:'unobserved'};}
  async function close(){
    if(s.closed)return;if(s.borrowed)fail('start_over_finishing');s.closed=true;clearTimeout(s.timer);
    await s.ipc?.close();if(physical.listening)await new Promise(resolve=>{physical.close(resolve);physical.closeAllConnections();});drivers.delete(capability);
  }
  async function restart(){
    if(s.restarting||s.finishing||s.closed)return;s.restarting=true;s.phase='awaiting-core';
    // Explicit panel continuation only. Preserve this intent/lease and let the
    // next process prove THIS former writer's death before any takeover.
    try{await close();await require('./owner-launch').launchInstalledOwner({installation:d,descriptorPath});rejectDone(Object.assign(Error('start_over_driver_restarted'),{code:'start_over_driver_restarted'}));}
    catch(e){rejectDone(e);}
  }
  const{createStartOverPanelControl,attachStartOverHttp,startOverEligibility}=require('./start-over-panel-control');
  const inspect=()=>require('./start-over-state').inspectStartOver({installation:d,descriptorPath});
  const control=createStartOverPanelControl({installation:d,status:publicStatus,request:async()=>{
    const current=inspect();
    if(current.id!==s.id||current.intentHash!==s.intentHash)fail('start_over_binding_changed');
    s.phase='awaiting-core';setTimeout(()=>{void restart();},25);return publicStatus();
  }});
  const{createIpcServer}=require('./client-ipc'),{ownerEndpoint}=require('./client-entry'),{OWNER_METHODS}=require('./attachment-owner');
  s.ipc=createIpcServer({endpoint:ownerEndpoint(d),identity:{installationId:d.installationId,machineId:d.machineId,packageHash:d.packageHash},secret:d.controlToken,bootId,methods:OWNER_METHODS,onRequest:async request=>{
    if(['core_status','core_diagnostics','owner_status'].includes(request.method)){
      if(Object.keys(request.payload).length)return{ok:false,code:'owner_payload'};
      return{ok:true,value:request.method==='owner_status'?{available:true,coverage:'read-only-reset-observer',...status()}:status()};
    }
    return{ok:false,code:'owner_recovery_required'};
  }});
  try{
    await new Promise((resolve,reject)=>{const error=e=>reject(e);physical.once('error',error);physical.listen(port,'127.0.0.1',()=>{physical.removeListener('error',error);resolve();});});
    attachStartOverHttp({server:physical,control,reason:'start_over_in_progress'});await s.ipc.listen();drivers.set(capability,s);
    async function attempt(){
      if(s.closed||s.restarting||s.finishing)return;s.finishing=true;
      try{
        const current=inspect();
        if(!current.id)fail('start_over_intent_changed');
        if(s.id!==null&&(s.id!==current.id||s.intentHash!==current.intentHash))fail('start_over_intent_changed');
        s.id=current.id;s.intentHash=current.intentHash;s.newSessionId=current.newSessionId;s.requiresAEExit=current.requiresAEExit;s.phase='finishing';s.fault=null;
        const result=await require('./start-over-finisher').finishStartOver({installation:d,descriptorPath,id:s.id,expectedIntentHash:s.intentHash,driver:capability});
        if(result.resetComplete!==true||result.historical===true||result.id!==s.id||result.sessionId!==s.newSessionId)fail('start_over_driver_completion');
        s.finishing=false;await close();resolveDone(Object.freeze({resetObserved:true,resetCompleted:true,id:result.id,sessionId:result.sessionId,aeAuthority:false}));
      }catch(e){
        s.finishing=false;if(s.closed)return;
        if(['start_over_producer_still_alive','start_over_requires_ae_exit'].includes(e.code)){
          s.phase=e.code==='start_over_requires_ae_exit'?'awaiting-ae':'awaiting-core';s.waiting={actors:e.actors||[],ae:e.ae||[]};s.timer=setTimeout(()=>{void attempt();},3000);
        }else{s.phase='blocked';s.fault=/^[a-z][a-z0-9_]{0,99}$/.test(e.code)?e.code:'start_over_driver_failed';s.lastFault=s.fault;}
      }
    }
    s.timer=setTimeout(()=>{void attempt();},25);
    return await done;
  }catch(e){if(!s.borrowed)await close();throw e;}
}
module.exports={continueStartOverStartup,borrowStartOverEndpoints};
