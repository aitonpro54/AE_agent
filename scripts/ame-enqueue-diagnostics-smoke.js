"use strict";
const assert=require("node:assert/strict"),vm=require("node:vm"),crypto=require("node:crypto");
const jobs=require("../mcp-server/ame-title-jobs");
let checks=0;
function fixture(options={}){
  const calls=[],listeners={},args={operation:"enqueue",targetSpecifier:"ame-26.0",savedNativeSourceVerified:true,queueMode:"shared_queue_v1",requestNonce:crypto.randomUUID(),operationBinding:"exact-operation",batchId:crypto.randomUUID(),jobId:crypto.randomUUID(),newWrapperSessionNonce:crypto.randomUUID(),sourcePath:"C:\\Проекты\\snapshot.aep",sourceGuid:"000111ef-0000-0000-0000-000000000000",presetPath:"C:\\Presets\\FHD_HQ_alfa_nosound.epr",presetIdentity:"exact-preset",outputPath:"C:\\renders\\unique.mov",processBinding:"exact-process",range:{startSeconds:0,endSeconds:15.4}};
  const wrapper={outputFiles:[args.outputPath],addEventListener:name=>calls.push(name),getEncodeProgress:()=>0,getEncodeTime:()=>0,setWorkArea:(...values)=>{calls.push(["setWorkArea",...values]);if(options.areaThrow)throw Error("exact area error");return !options.areaFalse;}};
  const frontend={addEventListener:(name,fn)=>{calls.push(name);listeners[name]=fn;},addDLToBatch:(...values)=>{calls.push(["addDLToBatch",...values]);if(options.addThrow)throw Error("exact add error");if(options.creationFailure)listeners.onBatchItemCreationFailed({srcFilePath:args.sourcePath,error:"exact creation error"});return options.nullWrapper?null:wrapper;}};
  const host={isBatchRunning:()=>false,addEventListener:name=>{calls.push(name);if(options.hostThrow)throw Error("exact host error");},runBatch:()=>{throw Error("START forbidden");}};
  const global={},context=vm.createContext({Date,BridgeTalk:{appSpecifier:args.targetSpecifier},$:{global},app:{getFrontend:()=>frontend,getEncoderHost:()=>host}});
  const run=a=>JSON.parse(vm.runInContext(jobs.messageScript(a),context));
  return {args,calls,listeners,run,entry:()=>global.aeAgentAMETitleJobsV1.jobs[args.jobId],reply:()=>run(args),status:()=>run({...args,operation:"status",requestNonce:crypto.randomUUID()})};
}
{
  const f=fixture(),r=f.reply(),d=r.job.dispatchDiagnostic;
  assert.equal(r.code,"job_enqueued");assert.equal(r.nativeAssociationVerified,true);assert.equal(d.addDLInvoked,true);assert.equal(d.addDLReturned,true);
  assert(f.calls.indexOf("onBatchItemCreationFailed")<f.calls.findIndex(x=>Array.isArray(x)&&x[0]==="addDLToBatch"));
  assert.deepEqual(f.calls.find(x=>Array.isArray(x)&&x[0]==="addDLToBatch").slice(1),[f.args.sourcePath,"",f.args.presetPath,f.args.sourceGuid,f.args.outputPath]);
  assert.deepEqual(f.calls.find(x=>Array.isArray(x)&&x[0]==="setWorkArea"),["setWorkArea",3,0,15.4]);assert.equal(d.workAreaCallAck.result,true);
  const fresh=f.status();assert.equal(fresh.code,"job_observed");assert.equal(fresh.nativeAssociationVerified,true);assert.deepEqual(fresh.job.outputFiles,[f.args.outputPath]);assert.equal(fresh.job.dispatchDiagnostic.workAreaCallAck.result,true);checks++;
}
for(const [option,phase,invoked,returned] of [["hostThrow","host_listener_setup",false,false],["addThrow","add_dl_submitted",true,false],["areaThrow","work_area_submitted",true,true]]){
  const f=fixture({[option]:true}),r=f.reply(),d=r.job.dispatchDiagnostic;assert.equal(r.code,"native_read_or_submit_error");assert.equal(d.phase,phase);assert.equal(d.error.phase,phase);assert.equal(d.addDLInvoked,invoked);assert.equal(d.addDLReturned,returned);assert.equal(f.status().job.dispatchDiagnostic.error.phase,phase);assert.equal(r.nativeAssociationVerified,false);checks++;
}
{
  const f=fixture({nullWrapper:true}),r=f.reply();assert.equal(r.code,"encoder_wrapper_unsupported_after_submit");assert.equal(r.job.dispatchDiagnostic.addDLReturned,true);assert.equal(f.status().nativeAssociationVerified,false);checks++;
}
{
  const f=fixture({areaFalse:true}),r=f.reply();assert.equal(r.code,"work_area_unverified_after_submit");assert.equal(r.job.dispatchDiagnostic.workAreaCallAck.result,false);assert.equal(f.status().job.workAreaApplied,false);checks++;
}
{
  const f=fixture();f.reply();f.listeners.onBatchItemCreationFailed({srcFilePath:"C:\\foreign.aep",error:"foreign"});assert.equal(f.entry().creationFailures.length,0);
  for(let i=0;i<5;i++)f.listeners.onBatchItemCreationFailed({srcFilePath:f.args.sourcePath,error:"failure".repeat(500)});
  const r=f.status();assert.equal(r.job.dispatchDiagnostic.creationFailures.length,3);assert.equal(r.job.dispatchDiagnostic.creationFailures[0].error.length,2000);assert.equal(r.nativeAssociationVerified,false);assert(r.job.readErrors.includes("batch_item_creation_failed"));checks++;
}
console.log(JSON.stringify({ok:true,checks,evidence:"offline generated AME receiver; exact addDL args, explicit full range call ack, fresh wrapper read and retained failure phases; no live or START"}));
