'use strict';
// Distribution-only private continuation. Never creates a new reset, kills AE,
// replays a command or changes a pending installation's credentials.
const path=require('node:path'),http=require('node:http');
async function operate(capability){
  const options=require('./standalone-installer').assertStartOverBootstrap(capability);
  const d=require('./maintain-owner').verifyOwnerInstallation(options.descriptor,options.expectedCurrentPackageHash);
  if(d.releaseDir===path.resolve(__dirname,'..'))throw Object.assign(Error('start_over_distribution_separate'),{code:'start_over_distribution_separate'});
  const{canonical,fail}=require('../protocol/json');
  if(canonical(require('../runtime/installation').verifyInstallation(options.descriptor))!==canonical(d))fail('start_over_installation_changed');
  const current=require('../runtime/start-over-state').inspectStartOver({installation:d,descriptorPath:options.descriptor});
  if(options.mode==='start-over-inspect'){
    if(current.id!==null&&current.id!==options.id)fail('start_over_intent_changed');return current;
  }
  if(options.mode==='start-over-finish')return require('../runtime/start-over-finisher').finishStartOver({installation:d,descriptorPath:options.descriptor,id:options.id,expectedIntentHash:options.expectedIntentHash});
  if(options.mode!=='start-over-continue'||current.id!==options.id||current.intentHash!==options.expectedIntentHash)fail('start_over_intent_changed');
  const{mac,validMac}=require('../integrations/cep/peer-protocol'),domain='ae-core4/panel-start-over/v1';
  async function post(route,input){return new Promise((resolve,reject)=>{
    let settled=false,timer;
    function done(error,value){if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolve(value);}
    const req=http.request({host:'127.0.0.1',port:3457,path:route,method:'POST',agent:false,headers:{Origin:'null','Content-Type':'application/json'}},res=>{
      let bytes=0,chunks=[];res.on('data',b=>{bytes+=b.length;if(bytes>16384)res.destroy();else chunks.push(b);});
      res.on('error',()=>done(Object.assign(Error('start_over_continue_uncertain'),{code:'start_over_continue_uncertain'})));
      res.on('end',()=>{try{const value=JSON.parse(Buffer.concat(chunks));if(res.statusCode!==200)fail('start_over_continue_refused');done(null,value);}catch(e){done(e);}});
    });req.on('error',()=>done(Object.assign(Error('start_over_continue_uncertain'),{code:'start_over_continue_uncertain'})));timer=setTimeout(()=>{req.destroy();done(Object.assign(Error('start_over_continue_uncertain'),{code:'start_over_continue_uncertain'}));},15000);req.end(canonical(input));
  });}
  async function rpc(action){
    const response=await post('/start-over/challenge',{action}),c=response.challenge;
    if(!c||c.version!==1||c.purpose!=='start-over'||c.role!=='panel'||c.action!==action||c.origin!=='null'||c.installationId!==d.installationId||c.packageHash!==d.packageHash||typeof c.nonce!=='string'||!/^[a-f0-9]{64}$/.test(c.nonce))fail('start_over_continue_auth');
    const reply=await post('/start-over/'+action,{challenge:c,proof:mac({domain,kind:'request',challenge:c},d.panelToken)}),b=reply.body;
    if(!b||b.version!==1||b.purpose!=='start-over'||b.action!==action||b.epoch!==c.epoch||b.nonce!==c.nonce||b.origin!==c.origin||b.installationId!==d.installationId||b.packageHash!==d.packageHash||!validMac({domain,kind:'response',body:b},reply.mac,d.panelToken)||b.status?.id!==options.id||b.status.aeAuthority!==false)fail('start_over_continue_auth');return b.status;
  }
  const status=await rpc('status');
  if(status.phase!=='blocked')return{...status,continueRequested:false};
  // One explicit continuation of THIS intent. Lost output is inspected later;
  // neither request nor finish is retried by this adapter.
  return{...await rpc('request'),continueRequested:true};
}
module.exports={operate};
