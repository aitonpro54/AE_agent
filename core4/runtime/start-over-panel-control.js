'use strict';
// Fixed panel-role reset control, independent of the physical command channel.
// Nonce/epoch/purpose/action are one-shot. A lost request is never resent here.
const crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const{canonical,parse,bounded,fail}=require('../protocol/json'),{mac,validMac}=require('../integrations/cep/peer-protocol');
const DOMAIN='ae-core4/panel-start-over/v1',HEX=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const PHASES=new Set(['ready','stopping','awaiting-core','awaiting-ae','finishing','baseline-required','blocked']);
const ACTIONS=new Set(['request','continue','none']);
const CODE=/^[a-z][a-z0-9_]{0,99}$/;
const isId=value=>typeof value==='string'&&UUID.test(value);
const optionalId=value=>value===null||isId(value);
function exact(v,fields){if(!v||Object.getPrototypeOf(v)!==Object.prototype||canonical(Object.keys(v).sort())!==canonical([...fields].sort()))fail('start_over_panel_schema');}
function startOverEligibility({phase,ownerMode,owner,maintenance,fault,canContinue=false}) {
  const deny=reason=>({action:'none',reason});
  if(phase==='blocked')return canContinue ? {action:'continue',reason:fault||'start_over_in_progress'} : deny(fault||'start_over_in_progress');
  if(phase!=='ready'&&phase!=='baseline-required')return deny('start_over_in_progress');
  if(!owner||!['active','diagnostic'].includes(ownerMode)||owner.closed!==false)return deny('start_over_owner_not_ready');
  if(maintenance?.requested!==false||owner.frozen!==false)return deny('start_over_owner_draining');
  const activity=owner.activity;
  if(activity?.pending!==false||owner.pending!==false||owner.accepted!==0)return deny('start_over_command_pending');
  // A diagnostic owner deliberately keeps the execution stores closed. Its
  // signed reset still goes through the same durable scope and history checks.
  if(ownerMode!=='diagnostic'&&activity.fault!==false)return deny('start_over_owner_fault');
  if(activity.unresolved===true)return {action:'request',reason:'start_over_unresolved'};
  if(activity.unresolved!==false)return deny('start_over_owner_fault');
  if(owner.holderClientId!==null)return deny('start_over_controller_held');
  if(phase==='baseline-required')return deny('start_over_baseline_required');
  return {action:'request',reason:'start_over_ready'};
}
function requestBinding(value) {
  return {ownerBootId:value.ownerBootId,id:value.id,sessionId:value.sessionId,action:value.eligibility.action,reason:value.eligibility.reason};
}
function view(value){
  exact(value,['id','sessionId','ownerBootId','phase','requiresAEExit','resetComplete','baselineRequired','fault','eligibility','aeAuthority']);
  exact(value.eligibility,['action','reason']);
  if(!optionalId(value.id)||!optionalId(value.sessionId)||!isId(value.ownerBootId)||!PHASES.has(value.phase)||['requiresAEExit','resetComplete','baselineRequired'].some(k=>typeof value[k]!=='boolean')||value.fault!==null&&(typeof value.fault!=='string'||!CODE.test(value.fault))||!ACTIONS.has(value.eligibility.action)||typeof value.eligibility.reason!=='string'||!CODE.test(value.eligibility.reason)||value.aeAuthority!==false)fail('start_over_panel_status');
  return Object.freeze(structuredClone(value));
}
function createStartOverPanelControl({installation,status,request}){
  if(!installation||typeof installation.installationId!=='string'||!installation.installationId||!HEX.test(installation.packageHash)||!HEX.test(installation.panelToken)||typeof status!=='function'||typeof request!=='function')fail('start_over_panel_options');
  const pins=Object.freeze({installationId:installation.installationId,packageHash:installation.packageHash}),secret=installation.panelToken,epoch=crypto.randomUUID(),challenges=new Map();
  return Object.freeze({
    status:()=>view(status()),
    async handle(route,input,origin){
      if(!['/start-over/challenge','/start-over/request','/start-over/status'].includes(route))return null;
      if(origin!=='null'&&origin!=='file://')fail('cep_origin_required');
      if(route==='/start-over/challenge'){
        const expected=input?.action==='request'?input.expected:undefined;
        exact(input,input?.action==='request'?['action','expected']:['action']);
        if(!['request','status'].includes(input.action))fail('start_over_panel_action');
        if(input.action==='request'){
          exact(expected,['ownerBootId','id','sessionId','action','reason']);
          if(!isId(expected.ownerBootId)||!optionalId(expected.id)||!optionalId(expected.sessionId)||!['request','continue'].includes(expected.action)||typeof expected.reason!=='string'||!CODE.test(expected.reason))fail('start_over_panel_schema');
        }
        const now=performance.now();
        for(const[n,c]of challenges)if(now-c.at>10000)challenges.delete(n);if(challenges.size>=16)fail('start_over_panel_backpressure');
        const challenge=Object.freeze({version:1,purpose:'start-over',role:'panel',action:input.action,nonce:crypto.randomBytes(32).toString('hex'),epoch,origin,...pins,...(expected?{expected:Object.freeze({...expected})}:{})});
        challenges.set(challenge.nonce,{challenge,at:now});return{challenge};
      }
      exact(input,['challenge','proof']);const challenge=input.challenge,saved=challenges.get(challenge?.nonce);challenges.delete(challenge?.nonce);
      const action=route==='/start-over/request'?'request':'status';
      if(!saved||performance.now()-saved.at>10000||challenge.action!==action||challenge.origin!==origin||canonical(challenge)!==canonical(saved.challenge)||!validMac({domain:DOMAIN,kind:'request',challenge},input.proof,secret))fail('start_over_panel_auth_or_replay');
      let current=view(status());
      if(action==='request'){
        const actual=requestBinding(current), expected=challenge.expected;
        if(actual.ownerBootId!==expected.ownerBootId||actual.id!==expected.id||actual.sessionId!==expected.sessionId)fail('start_over_binding_changed');
        if(actual.action==='none')fail(current.eligibility.reason);
        if(actual.action!==expected.action||actual.reason!==expected.reason)fail('start_over_binding_changed');
        current=view(await request(actual.action));
      }
      const body={version:1,purpose:'start-over',action,epoch,nonce:challenge.nonce,origin,...pins,status:current};return{body,mac:mac({domain:DOMAIN,kind:'response',body},secret)};
    }
  });
}
function attachStartOverHttp({server,control,reason}){
  if(!server?.listening||typeof control?.handle!=='function'||!['owner_recovery_required','start_over_in_progress'].includes(reason))fail('start_over_http_options');
  function reply(res,code,value,origin){if(res.destroyed||res.writableEnded)return;res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store',...(origin?{'Access-Control-Allow-Origin':origin,Vary:'Origin'}:{})});res.end(bounded(value));}
  async function handler(req,res){let origin;
    try{
      const address=server.address();if(!address||address.address!=='127.0.0.1'||req.headers.host!=='127.0.0.1:'+address.port||req.socket.remoteAddress!=='127.0.0.1')fail('loopback_host_required');
      if(!['null','file://'].includes(req.headers.origin)||req.rawHeaders.filter((v,i)=>i%2===0&&v.toLowerCase()==='origin').length!==1)fail('cep_origin_required');origin=req.headers.origin;
      if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Content-Type',Vary:'Origin'});res.end();return;}
      if(req.method!=='POST')fail('post_required');let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>16384)fail('frame_too_large');chunks.push(chunk);}
      const value=await control.handle(req.url,parse(Buffer.concat(chunks)),origin);
      if(value===null)reply(res,503,{error:reason},origin);else reply(res,200,value,origin);
    }catch(e){reply(res,e.code==='frame_too_large'?413:403,{error:e.code||'start_over_panel_failed'},origin);}
  }
  server.on('request',handler);return Object.freeze({detach(){server.removeListener('request',handler);}});
}
module.exports={createStartOverPanelControl,attachStartOverHttp,startOverEligibility,requestBinding};
