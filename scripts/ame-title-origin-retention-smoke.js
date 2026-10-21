"use strict";
// Offline sender regression: real fixed sender + native enqueue/own STATUS in
// isolated VMs. Synthetic START ACK tests retention, not global START authority.
const assert=require("node:assert/strict"),vm=require("node:vm"),crypto=require("node:crypto"),jobs=require("../mcp-server/ame-title-jobs");
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const nativeSource=source=>source.slice(source.indexOf("function nativeSend(a, messageBody) {"),source.indexOf("function utf16Expression(text) {")).trim();
const currentNative=nativeSource(fs.readFileSync(path.join(__dirname,"../mcp-server/ame-title-jobs.js"),"utf8"));
const priorNative=ref=>nativeSource(execFileSync("git",["show",ref+":mcp-server/ame-title-jobs.js"],{cwd:path.join(__dirname,".."),encoding:"utf8",windowsHide:true,stdio:["ignore","pipe","pipe"]}));
const uuid=()=>crypto.randomUUID(),sha=v=>crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");let checks=0;
function fixture(){
  let clock=Date.now(),current=null,mode="result",usingPrior=false;const counts={constructors:0,sends:0,enqueues:0,reads:0,startSends:0},pending=[],messages=[];
  class TestDate extends Date{constructor(v){super(arguments.length?v:clock);}static now(){return clock;}}
  const forbidden=()=>{throw Error("forbidden live or destructive operation");};
  const ame=vm.createContext({Date:TestDate,BridgeTalk:{appSpecifier:"ame-26.0"},$:{global:{aeAgentAMEProbeSessionNonce:"session"}},app:{getEncoderHost:()=>({isBatchRunning:()=>false,addEventListener:()=>{},runBatch:forbidden}),getFrontend:()=>({addEventListener:()=>{},addDLToBatch:(_source,_format,_preset,_guid,output)=>{counts.enqueues++;return {outputFiles:[output],setWorkArea:()=>true,addEventListener:()=>{},getEncodeProgress:()=>0,getEncodeTime:()=>0};}}),quit:forbidden},File:forbidden});
  let ae;
  function BridgeTalk(){counts.constructors++;const message=this,a=current;messages.push(message);message.send=()=>{
    counts.sends++;if(a.operation==="enqueue"&&!usingPrior){assert.equal(ae.$.global.aeAgentAMETitleMutationOriginsV1[a.requestNonce],ae.$.global.aeAgentAMETitleSendV1);assert.equal(ae.$.global.aeAgentAMETitleMutationOriginsV1[a.requestNonce].message,message);}if(a.operation==="status")counts.reads++;if(a.operation==="start")counts.startSends++;
    const body=vm.runInContext(message.body,ame);if(mode==="pending"||mode==="timeout"){pending.push({message,body});if(mode==="timeout")message.onTimeout();return true;}message.onResult({body});return true;
  };}
  BridgeTalk.isRunning=()=>true;BridgeTalk.getStatus=()=>"IDLE";BridgeTalk.pump=forbidden;BridgeTalk.launch=forbidden;
  ae=vm.createContext({Date:TestDate,BridgeTalk,$:{global:{},sleep:forbidden}});
  const common={targetSpecifier:"ame-26.0",processBinding:"a".repeat(64),expectedSessionNonce:"session",timeoutMs:1000};
  const enqueue={...common,operation:"enqueue",enqueueTransport:"async_once_v1",requestNonce:uuid(),operationBinding:"b".repeat(64),jobId:uuid(),batchId:uuid(),sourcePath:"C:\\fixture\\source.aep",sourceGuid:"GUID",presetPath:"C:\\fixture\\exact.epr",presetIdentity:"c".repeat(64),outputPath:"C:\\fixture\\01.mov",range:{startSeconds:1,endSeconds:2},newWrapperSessionNonce:uuid(),savedNativeSourceVerified:true,queueMode:"shared_queue_v1"};
  const own=(origin=enqueue)=>({...common,operation:"status",asyncOwnStatus:true,observeOwnJob:true,requestNonce:uuid(),operationBinding:sha({operation:"status",jobId:origin.jobId}),jobId:origin.jobId,batchId:origin.batchId,expectedOwnSourcePath:origin.sourcePath,expectedOwnOutputPath:origin.outputPath,observationEnqueueRequestNonce:origin.requestNonce,observationEnqueueOperationBinding:origin.operationBinding});
  function run(a,synthetic=false,producer=null){current=a;usingPrior=!!producer;clock++;const body=synthetic?"("+JSON.stringify(JSON.stringify({schema:jobs.NATIVE_SCHEMA,code:a.operation==="start"?"batch_start_accepted":"read_observed",requestNonce:a.requestNonce,operationBinding:a.operationBinding}))+ ")":null;let script=synthetic?jobs.fixedCommandScript(a,body):jobs.commandScript(a);if(producer){assert(script.includes(currentNative));script=script.replace(currentNative,producer);}return vm.runInContext("(function(){"+script+"})()",ae);}
  const command=operation=>({...common,operation,requestNonce:uuid(),operationBinding:sha(operation),jobId:enqueue.jobId,batchId:enqueue.batchId});
  return {ae,ame,counts,pending,messages,enqueue,common,own,command,run,setMode:v=>{mode=v;},complete:i=>pending[i].message.onResult({body:pending[i].body})};
}
function snapshot(f){return {constructors:f.counts.constructors,sends:f.counts.sends,sender:f.ae.$.global.aeAgentAMETitleSendV1,registry:f.ae.$.global.aeAgentAMETitleMutationOriginsV1};}
function unchanged(f,before){assert.equal(f.counts.constructors,before.constructors);assert.equal(f.counts.sends,before.sends);assert.equal(f.ae.$.global.aeAgentAMETitleSendV1,before.sender);assert.equal(f.ae.$.global.aeAgentAMETitleMutationOriginsV1,before.registry);}
function legacyOrigin(f,index){return {operation:"enqueue",requestNonce:uuid(),operationBinding:sha(index),processBinding:f.common.processBinding,targetSpecifier:f.common.targetSpecifier,callback:"result",body:"legacy-result",message:{legacy:true}};}
{
  // Execute the actual pre-retention producers; never manufacture the old
  // asyncDispatch descriptor. Preserve the retired legacy sender as a reference.
  const oldAsync=priorNative("0d98f45"),oldSync=priorNative("0f51b4d"),f=fixture(),oldArgs={...f.enqueue,requestNonce:uuid(),jobId:uuid(),batchId:uuid(),outputPath:"C:\\fixture\\02.mov"};
  f.setMode("timeout");f.run(oldArgs,false,oldSync);const retired=f.ae.$.global.aeAgentAMETitleSendV1;assert.equal(retired.asyncDispatch,undefined);assert.equal(retired.callback,"timeout");
  f.setMode("result");const observationArgs=f.own(oldArgs),observed=f.run(observationArgs,false,oldAsync),native=JSON.parse(observed.responseBody),next={...f.enqueue};
  next.independentSenderRetirement={observationNonce:observationArgs.requestNonce,observationBinding:observationArgs.operationBinding,responseBody:observed.responseBody,jobId:oldArgs.jobId,batchId:oldArgs.batchId,enqueueNonce:oldArgs.requestNonce,enqueueBinding:oldArgs.operationBinding,outputPath:oldArgs.outputPath,observedAt:native.observedAt,sessionNonce:native.sessionNonce,retainedWrapperSessionNonce:native.job.retainedWrapperSessionNonce,newJobId:next.jobId,newBatchId:next.batchId,newRequestNonce:next.requestNonce,newOperationBinding:next.operationBinding,newOutputPath:next.outputPath};
  assert.equal(f.run(next,false,oldAsync).code,"result");const origin=f.ae.$.global.aeAgentAMETitleSendV1;assert.equal(origin.retainedRetiredMutation,retired);assert.equal(origin.jobId,undefined);assert.equal(origin.batchId,undefined);assert.equal(origin.asyncDispatch.jobId,next.jobId);assert.equal(origin.asyncDispatch.batchId,next.batchId);assert.equal(f.ae.$.global.aeAgentAMETitleMutationOriginsV1,undefined);
  // An absent own descriptor must not be read at all. This catches eager
  // descriptor evaluation even on engines where mixed boolean syntax succeeds.
  let legacyDescriptorReads=0;const legacyPrototype=Object.create(Object.getPrototypeOf(retired));Object.defineProperty(legacyPrototype,"asyncDispatch",{get:()=>{legacyDescriptorReads++;throw Error("absent legacy descriptor evaluated");}});Object.setPrototypeOf(retired,legacyPrototype);
  const read=f.run(f.own(next));assert.equal(read.code,"result");assert.equal(read.originalSender.requestNonce,next.requestNonce);assert.equal(read.transportDiagnostic.originRetention,undefined);f.run(f.command("start"),true);assert.equal(f.ae.$.global.aeAgentAMETitleMutationOriginsV1[next.requestNonce],origin);assert.equal(f.ae.$.global.aeAgentAMETitleMutationOriginsV1[oldArgs.requestNonce],retired);const oldRead=f.run(f.own(oldArgs));assert.equal(oldRead.originalSender.requestNonce,oldArgs.requestNonce);assert.equal(oldRead.transportDiagnostic.originRetention,undefined);assert.equal(f.counts.enqueues,2);checks++;
  assert.equal(legacyDescriptorReads,0);checks++;
}
{
  const f=fixture(),queued=f.run(f.enqueue);assert.equal(JSON.parse(queued.responseBody).code,"job_enqueued");const origin=f.ae.$.global.aeAgentAMETitleSendV1,message=origin.message;
  const start=f.command("start");assert.equal(f.run(start,true).callback,"result");const global=f.command("status");assert.equal(JSON.parse(f.run(global).responseBody).code,"job_observed");assert.notEqual(f.ae.$.global.aeAgentAMETitleSendV1,origin);
  const own=f.own(),read=f.run(own);assert.equal(JSON.parse(read.responseBody).code,"job_observed");assert.equal(JSON.parse(read.responseBody).job.nativeAssociationVerified,true);assert.equal(read.originalSender.requestNonce,f.enqueue.requestNonce);assert.equal(read.originalSender.operationBinding,f.enqueue.operationBinding);assert.notEqual(read.originalSender.requestNonce,start.requestNonce);assert.equal(f.ae.$.global.aeAgentAMETitleMutationOriginsV1[f.enqueue.requestNonce],origin);assert.equal(origin.message,message);assert.equal(Object.keys(f.ae.$.global.aeAgentAMETitleMutationOriginsV1).length,1);assert.equal(f.counts.enqueues,1);assert.equal(f.counts.startSends,1);checks++;
  const before=snapshot(f);own.observationReconcile=true;f.run(own);unchanged(f,before);assert.equal(f.counts.enqueues,1);checks++;
  f.run(f.command("sources"),true);assert.equal(Object.keys(f.ae.$.global.aeAgentAMETitleMutationOriginsV1).length,1);assert.equal(f.run(f.own()).originalSender.requestNonce,f.enqueue.requestNonce);checks++;
}
{
  const f=fixture();f.setMode("pending");f.run(f.enqueue);const origin=f.ae.$.global.aeAgentAMETitleSendV1,before=snapshot(f),reply=f.run(f.command("start"),true);assert.equal(reply.code,"previous_request_unresolved");unchanged(f,before);assert.equal(f.counts.startSends,0);f.complete(0);assert.equal(f.ae.$.global.aeAgentAMETitleMutationOriginsV1[f.enqueue.requestNonce],origin);assert.equal(origin.callback,"result");assert.equal(origin.message,f.messages[0]);checks++;
}
for(const mode of ["operation-binding","process-binding","target","job","batch","async-job","async-batch","async-nonce"]){
  const f=fixture();f.run(f.enqueue);const origin=f.ae.$.global.aeAgentAMETitleSendV1;f.run(f.command("start"),true);
  if(mode==="operation-binding")origin.operationBinding="d".repeat(64);if(mode==="process-binding")origin.processBinding="d".repeat(64);if(mode==="target")origin.targetSpecifier="ame-99.0";if(mode==="job")origin.jobId=uuid();if(mode==="batch")origin.batchId=uuid();if(mode==="async-job")origin.asyncDispatch.jobId=uuid();if(mode==="async-batch")origin.asyncDispatch.batchId=uuid();if(mode==="async-nonce")origin.asyncDispatch.requestNonce=uuid();
  const before=snapshot(f),reply=f.run(f.own());assert.notEqual(reply.code,"result",mode);assert.equal(reply.originalSender,undefined,mode);unchanged(f,before);assert.equal(f.counts.enqueues,1);checks++;
}
for(const operation of ["start","enqueue"]){
  const f=fixture();f.run(f.enqueue);const origin=f.ae.$.global.aeAgentAMETitleSendV1,clone={...origin};f.ae.$.global.aeAgentAMETitleMutationOriginsV1[f.enqueue.requestNonce]=clone;const before=snapshot(f),reply=f.run(operation==="start"?f.command("start"):{...f.enqueue,requestNonce:uuid(),jobId:uuid()},operation==="start");assert.equal(reply.code,"previous_request_unresolved");unchanged(f,before);assert.equal(f.ae.$.global.aeAgentAMETitleMutationOriginsV1[f.enqueue.requestNonce],clone);assert.equal(f.counts.enqueues,1);checks++;
}
for(const value of [null,false,0,"",undefined,[]]){
  const f=fixture();f.run(f.enqueue);const origin=f.ae.$.global.aeAgentAMETitleSendV1;f.run(f.command("start"),true);origin.asyncDispatch=value;const before=snapshot(f),reply=f.run(f.own());assert.notEqual(reply.code,"result");assert.equal(reply.originalSender,undefined);assert.equal(reply.transportDiagnostic.originRetention.badNonce,origin.requestNonce);assert.equal(reply.transportDiagnostic.originRetention.field,"async_dispatch");assert.equal(reply.transportDiagnostic.originRetention.asyncPresent,true);assert(!JSON.stringify(reply.transportDiagnostic.originRetention).includes("responseBody"));unchanged(f,before);checks++;
}
{
  const f=fixture();f.run(f.enqueue);const origin=f.ae.$.global.aeAgentAMETitleSendV1;f.run(f.command("start"),true);origin.asyncDispatch=Object.assign([],origin.asyncDispatch);const before=snapshot(f),reply=f.run(f.own());assert.notEqual(reply.code,"result");assert.equal(reply.originalSender,undefined);unchanged(f,before);checks++;
}
{
  const f=fixture();f.run(f.enqueue);const origin=f.ae.$.global.aeAgentAMETitleSendV1;f.ae.$.global.aeAgentAMETitleMutationOriginsV1[f.enqueue.requestNonce]={...origin};const before=snapshot(f);assert.equal(f.run(f.own()).code,"mutation_origin_collision");unchanged(f,before);checks++;
}
{
  const f=fixture();f.run(f.enqueue);const origin=f.ae.$.global.aeAgentAMETitleSendV1;f.run(f.command("start"),true);f.ae.$.global.aeAgentAMETitleSendV1.retainedRetiredMutation={...origin};const before=snapshot(f),reply=f.run(f.own());assert.equal(reply.code,"mutation_origin_collision");assert.equal(reply.originalSender,undefined);unchanged(f,before);checks++;
}
for(const mode of ["full","overflow","malformed","null","cycle","chain-bound"]){
  const f=fixture();f.run(f.enqueue);const global=f.ae.$.global;
  if(mode==="full"||mode==="overflow"){const registry={};for(let i=0;i<(mode==="full"?64:65);i++){const origin=legacyOrigin(f,i);registry[origin.requestNonce]=origin;}global.aeAgentAMETitleMutationOriginsV1=registry;global.aeAgentAMETitleSendV1={operation:"status",callback:"result"};}
  if(mode==="malformed")global.aeAgentAMETitleMutationOriginsV1={broken:{}};if(mode==="null")global.aeAgentAMETitleMutationOriginsV1=null;
  if(mode==="cycle")global.aeAgentAMETitleSendV1.retainedRetiredMutation=global.aeAgentAMETitleSendV1;
  if(mode==="chain-bound"){let node=global.aeAgentAMETitleSendV1;for(let i=0;i<65;i++){node.retainedRetiredMutation={operation:"status",callback:"result"};node=node.retainedRetiredMutation;}}
  const before=snapshot(f),reply=f.run({...f.enqueue,requestNonce:uuid(),jobId:uuid()});assert.equal(reply.code,"previous_request_unresolved",mode);assert.equal(reply.senderRefusal.constructorInvoked,false);assert.equal(reply.senderRefusal.sendInvoked,false);unchanged(f,before);assert.equal(f.counts.enqueues,1);checks++;
}
{
  const f=fixture();f.run(f.enqueue);const global=f.ae.$.global,origin=global.aeAgentAMETitleSendV1;for(let i=1;i<64;i++){const old=legacyOrigin(f,i);global.aeAgentAMETitleMutationOriginsV1[old.requestNonce]=old;}f.run(f.command("start"),true);assert.equal(Object.keys(global.aeAgentAMETitleMutationOriginsV1).length,64);assert.equal(global.aeAgentAMETitleMutationOriginsV1[f.enqueue.requestNonce],origin);assert.equal(f.run(f.own()).originalSender.requestNonce,f.enqueue.requestNonce);checks++;
}
for(const descriptor of [false,true]){
  const f=fixture();f.setMode("timeout");f.run(f.enqueue);const global=f.ae.$.global,origin=global.aeAgentAMETitleSendV1;delete origin.jobId;delete origin.batchId;if(!descriptor)delete origin.asyncDispatch;delete global.aeAgentAMETitleMutationOriginsV1;
  global.aeAgentAMETitleSendV1={operation:"start",requestNonce:uuid(),operationBinding:sha("legacy-start"),processBinding:f.common.processBinding,targetSpecifier:f.common.targetSpecifier,callback:"result",body:"legacy-start",retainedRetiredMutation:origin};
  f.setMode("result");const reply=f.run(f.own());assert.equal(JSON.parse(reply.responseBody).code,"job_observed");assert.equal(reply.originalSender.requestNonce,origin.requestNonce);assert.equal(reply.originalSender.callback,"timeout");assert.equal(f.counts.enqueues,1);
  f.run(f.command("status"));assert.equal(global.aeAgentAMETitleMutationOriginsV1[origin.requestNonce],origin);assert.equal(origin.message,f.messages[0]);const before=snapshot(f);assert.equal(f.run(f.enqueue).code,"previous_request_unresolved");unchanged(f,before);assert.equal(f.counts.enqueues,1);f.complete(0);assert.equal(origin.callback,"result");assert.equal(global.aeAgentAMETitleMutationOriginsV1[origin.requestNonce],origin);checks++;
}
{
  const f=fixture();f.run(f.enqueue);const global=f.ae.$.global,origin=global.aeAgentAMETitleSendV1,old=legacyOrigin(f,"old");origin.retainedRetiredMutation=old;delete global.aeAgentAMETitleMutationOriginsV1;f.run(f.command("start"),true);assert.equal(global.aeAgentAMETitleMutationOriginsV1[origin.requestNonce],origin);assert.equal(global.aeAgentAMETitleMutationOriginsV1[old.requestNonce],old);assert.equal(Object.keys(global.aeAgentAMETitleMutationOriginsV1).length,2);checks++;
}
{
  // Capacity failure must precede consumption of a valid independent retirement.
  const f=fixture();f.setMode("timeout");f.run(f.enqueue);const global=f.ae.$.global,origin=global.aeAgentAMETitleSendV1,observation={originSender:origin,callback:"result",requestNonce:uuid(),operationBinding:sha("observation"),body:"proof",jobId:f.enqueue.jobId,batchId:f.enqueue.batchId,enqueueRequestNonce:f.enqueue.requestNonce,processBinding:f.common.processBinding,targetSpecifier:f.common.targetSpecifier};global.aeAgentAMETitleObservationV1=observation;
  for(let i=1;i<64;i++){const old=legacyOrigin(f,i);global.aeAgentAMETitleMutationOriginsV1[old.requestNonce]=old;}
  const next={...f.enqueue,requestNonce:uuid(),jobId:uuid(),batchId:uuid(),outputPath:"C:\\fixture\\02.mov"};next.independentSenderRetirement={observationNonce:observation.requestNonce,observationBinding:observation.operationBinding,responseBody:observation.body,jobId:f.enqueue.jobId,batchId:f.enqueue.batchId,enqueueNonce:f.enqueue.requestNonce,enqueueBinding:f.enqueue.operationBinding,outputPath:f.enqueue.outputPath,observedAt:Date.now(),newJobId:next.jobId,newBatchId:next.batchId,newRequestNonce:next.requestNonce,newOperationBinding:next.operationBinding,newOutputPath:next.outputPath};
  const before=snapshot(f);assert.equal(f.run(next).code,"previous_request_unresolved");unchanged(f,before);assert.notEqual(observation.independentRetirementConsumed,true);checks++;
}
console.log(JSON.stringify({ok:true,checks,evidence:"offline fixed sender/native receiver VMs; synthetic START ACK; no live AE/AME, no START authority claim"}));
