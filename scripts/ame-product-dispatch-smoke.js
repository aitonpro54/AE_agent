"use strict";
const assert=require("node:assert/strict"),crypto=require("node:crypto"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const {createProductDispatch}=require("../mcp-server/ame-product-dispatch"),jobs=require("../mcp-server/ame-title-jobs"),m100=require("../mcp-server/m100-protocol");
(async()=>{
  let product=true,session=true,sends=0,checks=0;
  const args={targetSpecifier:"ame-26.0",expectedProcess:{pid:77,startedAt:"2026-10-15T00:00:00.000Z"},batchId:crypto.randomUUID(),queueMode:"shared_queue_v1"},context={args};
  const port=createProductDispatch({assertProduct:()=>product,assertContext:c=>{assert(c===context && session,"current runner required");},dispatch:async()=>{sends++;return "sent";}});
  const script=jobs.commandScript({operation:"start",requestNonce:crypto.randomUUID()}),selector={schema:"ae-agent-ame-title-reservation-selector.v1",operation:"start",argsHash:jobs.operationArgsHash(jobs.START,args),processBinding:"a".repeat(64)};
  const metadata={schema:"ae-agent-ame-title-dispatch.v2",operation:"start",mutating:true,batchId:args.batchId,targetSpecifier:args.targetSpecifier,expectedProcess:args.expectedProcess,processBinding:selector.processBinding,scriptSha25664:crypto.createHash("sha256").update(script).digest("hex")};
  const preparation=port.prepareStart(selector,context);
  assert.throws(()=>port.authorize(metadata,context,preparation),/binding_changed/);checks++;
  port.assertPreparation(preparation,selector,context);
  for(const changed of [{...metadata,batchId:crypto.randomUUID()},{...metadata,processBinding:"b".repeat(64)},{...metadata,mutating:false},{...metadata,operation:"enqueue"}]){assert.throws(()=>port.authorize(changed,context,preparation),/binding_changed/);checks++;}
  const cap=port.authorize(metadata,context,preparation);
  await assert.rejects(port.dispatch(cap,script+" ",1,metadata,context),/script_changed/);checks++;
  session=false;await assert.rejects(port.dispatch(cap,script,1,metadata,context),/current runner/);checks++;session=true;
  product=false;await assert.rejects(port.dispatch(cap,script,1,metadata,context),/provenance_required/);checks++;product=true;
  assert.equal(await port.dispatch(cap,script,1,metadata,context),"sent");checks++;
  await assert.rejects(port.dispatch(cap,script,1,metadata,context),/capability_required/);checks++;
  assert.throws(()=>port.authorize(metadata,context,preparation),/binding_changed/);checks++;
  assert.equal(sends,1);
  // Exercise the actual daemon brand/assertion functions, not a copied gate.
  const source=fs.readFileSync(path.join(__dirname,"../mcp-server/bridge-daemon.js"),"utf8"),begin=source.indexOf("const productAmeContexts=new WeakMap();"),end=source.indexOf("const titleExportExecutor=",begin);
  assert(begin>0 && end>begin);
  let current=true,authority={sessionHash:"session"},dryRun=true;
  const payload={plan:{steps:[{tool:jobs.START,args}]}},record={payload,payloadHash:m100.sha256Payload(payload),confirmedBySurface:"cep-autonomous-session",confirmedBySession:"session-session",actionId:"act",proposalExpiresAt:"future"};
  const box={deploymentMode:"product",ownedRuntimeStartup:{managed:true},panelControlUsesRetainedTransport:()=>false,m100Protocol:m100,
    autonomousSession:{authorization:()=>authority},currentProposalState:{assertExecution:()=>assert(current,"stale proposal")},projectSave:{verifyDryRunReceipt:()=>assert(dryRun,"dry run changed")},AUTONOMY_CONTRACT_VERSION:"test",ameSharedQueue:{MODE:"shared_queue_v1"},manualPlanIngress:{brand:()=>{throw Error("manual required");}}};
  const actual=vm.runInNewContext(source.slice(begin,end)+"\n({brandAmeTitleContext,assertProductAmeContext})",box);
  const run={source:"ai-plan-run",record,runId:"run",args,checkpoint:{sourceFile:"source.aep"},confirm:true,allowWithoutCheckpoint:false,autonomous:true,stepCount:1};
  actual.brandAmeTitleContext(run,authority);assert.equal(actual.assertProductAmeContext(run),true);checks++;
  assert.throws(()=>actual.assertProductAmeContext({...run}),/current_runner/);checks++;
  current=false;assert.throws(()=>actual.assertProductAmeContext(run),/stale proposal/);checks++;current=true;
  dryRun=false;assert.throws(()=>actual.assertProductAmeContext(run),/dry run changed/);checks++;dryRun=true;
  authority=null;assert.throws(()=>actual.assertProductAmeContext(run),/current_runner/);checks++;authority={sessionHash:"session"};
  run.args={...args,batchId:crypto.randomUUID()};assert.throws(()=>actual.assertProductAmeContext(run),/current_runner/);checks++;run.args=args;
  assert.throws(()=>actual.brandAmeTitleContext({...run,autonomous:false},null),/manual required/);checks++;
  // Fixed native program skips source census only with the private saved-source
  // field; the public typed input rejects that field. Own wrapper still decides acceptance.
  const sourceFile=path.resolve(".codex-runtime/snapshot.aep"),output=path.resolve(".codex-runtime/item.mov");
  const nativeArgs={operation:"enqueue",targetSpecifier:"ame-26.0",batchId:args.batchId,jobId:crypto.randomUUID(),requestNonce:crypto.randomUUID(),sourcePath:sourceFile,sourceGuid:"native-guid",outputPath:output,presetPath:path.resolve(".codex-runtime/preset.epr"),range:{startSeconds:0,endSeconds:10},queueMode:"shared_queue_v1",newWrapperSessionNonce:crypto.randomUUID(),presetIdentity:"b".repeat(64),processBinding:"a".repeat(64)};
  let added=0;
  const host={isBatchRunning:()=>false,addEventListener:()=>{}},frontend={addDLToBatch:(source,format,preset,guid,out)=>{added++;assert.equal(guid,"native-guid");return {outputFiles:[out],getEncodeProgress:()=>0,getEncodeTime:()=>0,setWorkArea:()=>true,addEventListener:()=>{}};}};
  const nativeContext=()=>({BridgeTalk:{appSpecifier:"ame-26.0"},$:{global:{}},app:{getFrontend:()=>frontend,getEncoderHost:()=>host}});
  assert.equal(JSON.parse(vm.runInNewContext(jobs.messageScript(nativeArgs),nativeContext())).code,"dl_items_unsupported");checks++;
  assert.equal(JSON.parse(vm.runInNewContext(jobs.messageScript({...nativeArgs,savedNativeSourceVerified:true}),nativeContext())).code,"job_enqueued");assert.equal(added,1);checks++;
  assert.throws(()=>jobs.validateInput(jobs.START,{...args,savedNativeSourceVerified:true}),/invalid_input/);checks++;
  const shared=require("../mcp-server/ame-shared-queue-grant"),digest=v=>crypto.createHash("sha256").update(m100.stableStringify(v)).digest("hex"),nonce=crypto.randomUUID();
  const binding={schema:shared.BINDING_SCHEMA,targetSpecifier:args.targetSpecifier,batchId:args.batchId,process:{...args.expectedProcess,path:path.resolve("ame.exe")},processBinding:"a".repeat(64),nativeSessionNonce:null,retainedWrapperSessionNonce:crypto.randomUUID(),presetIdentity:"b".repeat(64),jobs:[0,1].map(i=>{const id=crypto.randomUUID();return {jobId:id,handleKey:id,enqueueRequestNonce:crypto.randomUUID(),operationBinding:"c".repeat(64),source:{path:path.resolve(`source${i}.aep`),sha25664:"d".repeat(64),guid:`guid${i}`},preset:{path:path.resolve("preset.epr"),sha25664:"e".repeat(64),id:"amep_"+"f".repeat(40)},outputPath:path.resolve(`item${i}.mov`),range:{startSeconds:0,endSeconds:10}};})};
  const receipt={binding,proofSource:"server_private_shared_queue_capability",globalQueueStart:true,bindingHash:shared.bindingHash(binding),requestNonce:nonce,operationBinding:"c".repeat(64)};
  const reserved={schema:shared.RESERVATION_SCHEMA,batchId:args.batchId,requestNonce:nonce,operationBinding:receipt.operationBinding,lastDispatchGuardVerified:true,sharedQueueReceipt:receipt,receiptHash:digest(receipt)};
  const started={requestNonce:nonce,invoked:true,accepted:true},startResult={ok:true,code:"batch_start_accepted",dispatchAcceptanceVerified:true,globalQueueStart:true,requestNonce:nonce,startReservation:reserved,authorization:{runId:"run",proposalId:"act"},native:{start:started,observedAt:10}};
  const ownReads=binding.jobs.map(job=>({tool:jobs.STATUS,status:"completed",args:{...args,jobId:job.jobId},result:{ok:true,batchId:args.batchId,jobId:job.jobId,startAcceptanceVerified:true,nativeAssociationVerified:true,startReservation:reserved,native:{code:"job_observed",requestNonce:crypto.randomUUID(),observedAt:11,start:started,job:{handleKey:job.jobId,sourcePath:job.source.path,sourceGuid:job.source.guid,outputPath:job.outputPath,retainedWrapperSessionNonce:binding.retainedWrapperSessionNonce,processBinding:binding.processBinding}}}}));
  assert.equal(shared.verifyStartEvidence(args,startResult,{id:"run",provenance:{actionId:"act"}},ownReads),true);checks++;
  const forged=JSON.parse(JSON.stringify(ownReads));forged[1].result.native.job.outputPath=path.resolve("foreign.mov");assert.equal(shared.verifyStartEvidence(args,startResult,{id:"run",provenance:{actionId:"act"}},forged),false);checks++;
  assert.equal(shared.verifyStartEvidence(args,startResult,{id:"other",provenance:{actionId:"act"}},ownReads),false);checks++;
  const badStart=JSON.parse(JSON.stringify(startResult));badStart.startReservation.receiptHash="0".repeat(64);assert.equal(shared.verifyStartEvidence(args,badStart,{id:"run",provenance:{actionId:"act"}},ownReads),false);checks++;
  console.log(JSON.stringify({ok:true,checks,sends,evidence:"actual product dispatch + daemon context; no live effects"}));
})().catch(error=>{console.error(error);process.exitCode=1;});
