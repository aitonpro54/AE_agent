"use strict";
// Production service + VM panel + isolated receipt files. No live CDP/AE,
// providers, daemon, child processes, project mutation or replay.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os"),vm=require("node:vm"),crypto=require("node:crypto");
const control=require("../mcp-server/cep-panel-control"),orphan=require("../mcp-server/cep-panel-readonly-orphan"),bootstrap=require("../mcp-server/ae-agent-panel-bootstrap");
const {createPanelEnvironment}=require("./cep-plan-refresh-smoke");
const source=fs.readFileSync(path.resolve(__dirname,"../cep-panel/panel.js"),"utf8"),root=fs.mkdtempSync(path.join(os.tmpdir(),"cep-readonly-orphan-")),cases=[];
const clone=value=>JSON.parse(JSON.stringify(value)),id=()=>crypto.randomUUID();
async function test(name,fn){await fn();cases.push(name);}
function fixture(name,hook=()=>{}){
  let env=createPanelEnvironment(source),queries=0,sends=0;const directory=path.join(root,name);
  const installed={indexPath:path.join(root,"CEP","extensions",bootstrap.TARGET.bundleId,"index.html"),hashes:{source:"fixture"}};
  const page={type:"page",url:require("node:url").pathToFileURL(installed.indexPath).href,webSocketDebuggerUrl:"ws://127.0.0.1:8870/devtools/page/fake"};
  const state=env.api.state(),binding={panelInstanceId:state.panelInstanceId,panelLifecycleEpoch:state.panelLifecycleEpoch,panelGeneration:state.panelGeneration};
  const raw={requestId:id(),action:"plan.reconcile",args:{runId:id()},timeoutMs:30000,wait:true},envelope=control.validateRawInvokeInput(raw).envelope;
  const row={protocolVersion:control.PROTOCOL_VERSION,requestId:raw.requestId,action:raw.action,signature:control.computeActionSignature(envelope),state:"running",phase:"submitted",delivery:"submitted",replayAllowed:false,binding};
  control.saveDurableReceipt(directory,row);const receiptFile=control.createReceiptPath(directory,row.requestId),original=fs.readFileSync(receiptFile,"utf8"),inputFile=path.join(directory,"original-input.json");
  fs.writeFileSync(inputFile,JSON.stringify({schema:"ae-agent.root-recovered-panel-input.v1",producer:"offline-fixture",source:"exact fixture invoke input",raw,envelope,signature:row.signature,
    originalReceiptSha256:orphan.hash(original),originalOutcome:"unknown_no_replay",aeExecutionProven:false}));
  const owner={pid:2147483647,requestId:row.requestId,token:id()},lock=path.join(directory,"controller.lock");fs.writeFileSync(lock,JSON.stringify(owner));
  const f={directory,row,raw,envelope,inputFile,original,owner,lock,installed,page,receiptFile,reload(){env=createPanelEnvironment(source,{storageStore:env.storageStore});},get env(){return env;},sends:()=>sends,queries:()=>queries};
  f.service=control.createPanelControlService({stateDir:directory,inspectInstalledTarget:()=>clone(installed),fetchCdpTargets:async()=>[clone(page)],
    evaluateViaCdp:async(_url,expression)=>{if(expression.includes("api.invoke("))sends++;if(expression.includes("api.getResult("))queries++;const value=clone(vm.runInContext(expression,env.context));await hook(f,expression,queries,value);return value;}});
  return f;
}
function audit(f,kind){return orphan.read(f.directory,f.row.requestId,kind);}
function effect(){return {requestId:id(),action:"ui.sidebar.set",args:{collapsed:true}};}
function unchanged(f){assert.equal(fs.readFileSync(f.receiptFile,"utf8"),f.original);assert.equal(f.sends(),0);}
function evidence(f){return {receipt:fs.readFileSync(f.receiptFile,"utf8"),input:fs.readFileSync(f.inputFile,"utf8"),
  index:JSON.stringify(JSON.parse(fs.readFileSync(path.join(f.directory,"identities.json"))).identities[f.row.requestId]),
  ...Object.fromEntries(["intent","consumed","disposition"].map(kind=>[kind,fs.readFileSync(orphan.filename(f.directory,f.row.requestId,kind),"utf8")]))};}
function alter(f,mode){
  if(mode==="original")fs.appendFileSync(f.receiptFile," ");
  if(mode==="index"){const file=path.join(f.directory,"identities.json"),v=JSON.parse(fs.readFileSync(file));v.identities[f.row.requestId].manualRevision=true;fs.writeFileSync(file,JSON.stringify(v));}
  if(mode==="intent" || mode==="consumed")fs.appendFileSync(orphan.filename(f.directory,f.row.requestId,mode)," ");
  if(mode==="source")fs.appendFileSync(f.inputFile," ");
  if(mode==="disposition"){const file=orphan.filename(f.directory,f.row.requestId,"disposition"),v=JSON.parse(fs.readFileSync(file));v.projectGuardsReleased=true;fs.writeFileSync(file,JSON.stringify(v));}
  if(mode==="disposition-bytes")fs.appendFileSync(orphan.filename(f.directory,f.row.requestId,"disposition")," ");
  if(mode==="historical-actor"){
    const file=orphan.filename(f.directory,f.row.requestId,"consumed"),consumed=JSON.parse(fs.readFileSync(file));consumed.witness.actor.panelInstanceId="another-historical-actor";fs.writeFileSync(file,JSON.stringify(consumed));
    const dispositionFile=orphan.filename(f.directory,f.row.requestId,"disposition"),v=JSON.parse(fs.readFileSync(dispositionFile));v.witness=consumed.witness;v.consumedSha256=orphan.hash(fs.readFileSync(file,"utf8"));fs.writeFileSync(dispositionFile,JSON.stringify(v));
  }
  if(mode==="matching-lock")fs.writeFileSync(f.lock,JSON.stringify(f.owner));
}
async function main(){
  await test("exact legacy input, dead owner, two fresh null/idle snapshots; original bytes and unknown/noReplay preserved",async()=>{
    const f=fixture("success"),fingerprint=control.captureReadOnlyOrphanIntent(f.directory,f.inputFile);assert.match(fingerprint,/^[a-f0-9]{64}$/);
    const r=await f.service.getResult(f.row.requestId);assert.equal(r.ok,false);assert.equal(r.receipt.state,"unknown");assert.equal(r.receipt.phase,"readonly_owner_exited");
    assert.equal(r.receipt.delivery,"unknown");assert.equal(r.receipt.replayAllowed,false);assert.equal(r.receipt.transportDisposition.aeExecutionProven,false);assert.equal(r.receipt.transportDisposition.projectGuardsReleased,false);
    assert.equal(f.queries(),3);assert(!fs.existsSync(f.lock));assert(audit(f,"consumed"));assert(audit(f,"disposition"));unchanged(f);
    assert(!JSON.stringify(r).includes(f.owner.token));assert(!JSON.stringify(audit(f,"disposition")).includes(f.owner.token));
    const dispositionBytes=fs.readFileSync(orphan.filename(f.directory,f.row.requestId,"disposition"),"utf8");
    const again=await f.service.getResult(f.row.requestId);assert.equal(again.receipt.state,"unknown");assert.equal(fs.readFileSync(orphan.filename(f.directory,f.row.requestId,"disposition"),"utf8"),dispositionBytes);unchanged(f);
    const replay=await f.service.invoke(f.raw);assert.equal(replay.receipt.state,"unknown");assert.equal(replay.replayed,false);assert.equal(f.sends(),0);
    const next=await f.service.invoke(effect());assert.equal(next.ok,true,JSON.stringify(next));assert.equal(f.sends(),1);assert.equal(fs.readFileSync(f.receiptFile,"utf8"),f.original);
  });
  await test("missing canonical input never guesses runId or retires",async()=>{const f=fixture("no-intent");const r=await f.service.getResult(f.row.requestId);assert.equal(r.receipt.state,"running");assert(fs.existsSync(f.lock));assert(!audit(f,"consumed"));unchanged(f);});
  for(const mode of ["live-owner","foreign-request","invalid-lock","input-changed","wrong-original-hash","wrong-index","wrong-index-action","wrong-index-binding","wrong-action"]){
    await test(mode+" fails closed without retirement",async()=>{
      const f=fixture(mode);
      if(mode==="wrong-original-hash"){const input=JSON.parse(fs.readFileSync(f.inputFile));input.originalReceiptSha256="a".repeat(64);fs.writeFileSync(f.inputFile,JSON.stringify(input));assert.throws(()=>control.captureReadOnlyOrphanIntent(f.directory,f.inputFile),/readonly_orphan_original_receipt_changed/);}
      else {
        control.captureReadOnlyOrphanIntent(f.directory,f.inputFile);
        if(mode==="live-owner")fs.writeFileSync(f.lock,JSON.stringify({...f.owner,pid:process.pid}));
        if(mode==="foreign-request")fs.writeFileSync(f.lock,JSON.stringify({...f.owner,requestId:id()}));
        if(mode==="invalid-lock")fs.writeFileSync(f.lock,"{bad");
        if(mode==="input-changed")fs.appendFileSync(f.inputFile," ");
        if(mode.startsWith("wrong-index")){const file=path.join(f.directory,"identities.json"),index=JSON.parse(fs.readFileSync(file));
          if(mode==="wrong-index")index.identities[f.row.requestId].signature="f".repeat(64);
          if(mode==="wrong-index-action")index.identities[f.row.requestId].action="bridge.connect";
          if(mode==="wrong-index-binding")index.identities[f.row.requestId].binding.panelGeneration="another";
          fs.writeFileSync(file,JSON.stringify(index));}
        if(mode==="wrong-action"){const file=orphan.filename(f.directory,f.row.requestId,"intent"),capture=JSON.parse(fs.readFileSync(file));capture.envelope.action="bridge.connect";capture.envelope.args={};fs.writeFileSync(file,JSON.stringify(capture));}
        await f.service.getResult(f.row.requestId);
      }
      assert(fs.existsSync(f.lock));assert(!audit(f,"disposition"));assert(!audit(f,"consumed"));unchanged(f);
    });
  }
  await test("stable current actor differing from original binding remains blocked",async()=>{
    const f=fixture("historical-actor");control.captureReadOnlyOrphanIntent(f.directory,f.inputFile);f.reload();
    const r=await f.service.getResult(f.row.requestId);assert.equal(r.code,"readonly_orphan_historical_actor_changed");assert(fs.existsSync(f.lock));assert(!audit(f,"consumed"));unchanged(f);
  });
  for(const mode of ["actor","target","actor-and-target"]){
    await test("completed retirement survives stable current "+mode+" reload with immutable audit",async()=>{
      const f=fixture("retired-reload-"+mode);control.captureReadOnlyOrphanIntent(f.directory,f.inputFile);await f.service.getResult(f.row.requestId);const before=evidence(f),historical=clone(audit(f,"disposition"));
      if(mode.includes("actor"))f.reload();
      if(mode.includes("target")){f.page.webSocketDebuggerUrl="ws://127.0.0.1:8870/devtools/page/reloaded";f.installed.hashes.source="updated-installed-source";}
      const again=await f.service.getResult(f.row.requestId);assert.equal(again.receipt.phase,"readonly_owner_exited",JSON.stringify(again));assert.equal(again.receipt.replayAllowed,false);assert.deepEqual(evidence(f),before);
      assert.deepEqual(audit(f,"disposition"),historical);assert(!fs.existsSync(f.lock));assert.equal(f.queries(),6);unchanged(f);
      assert.deepEqual(await f.service.maintenanceTransportState(),{unresolvedCount:0,requestIds:[],replayAllowed:false});assert.deepEqual(evidence(f),before);
      const replay=await f.service.invoke(f.raw);assert.equal(replay.receipt.phase,"readonly_owner_exited");assert.equal(replay.replayed,false);unchanged(f);
      const next=await f.service.invoke(effect());assert.equal(next.ok,true,JSON.stringify(next));assert.equal(f.sends(),1);assert.deepEqual(evidence(f),before);
    });
  }
  for(const mode of ["token-drift","lock-file-replaced","owner-became-live","actor-drift","target-drift","installed-drift","remote-record","panel-active","recovery-active","input-drift","intent-drift"]){
    await test(mode+" during second observation never retires",async()=>{
      const f=fixture(mode,async(f,expression,queries,value)=>{
        if(queries===3 && expression.includes("api.getResult(")){
          if(mode==="token-drift")fs.writeFileSync(f.lock,JSON.stringify({...f.owner,token:id()}));
          if(mode==="lock-file-replaced"){fs.unlinkSync(f.lock);fs.writeFileSync(f.lock,JSON.stringify(f.owner));}
          if(mode==="owner-became-live")fs.writeFileSync(f.lock,JSON.stringify({...f.owner,pid:process.pid}));
          if(mode==="actor-drift")f.reload();
          if(mode==="target-drift")f.page.webSocketDebuggerUrl="ws://127.0.0.1:8870/devtools/page/changed";
          if(mode==="installed-drift")f.installed.hashes.source="changed";
          if(mode==="input-drift")fs.appendFileSync(f.inputFile," ");
          if(mode==="intent-drift")fs.appendFileSync(orphan.filename(f.directory,f.row.requestId,"intent")," ");
          if(mode==="remote-record")value.value={protocolVersion:control.PROTOCOL_VERSION,requestId:f.row.requestId,action:"plan.reconcile",state:"completed",phase:"completed",replayAllowed:false};
        }
        if(queries>=2 && expression.includes("api.state(")){
          if(mode==="panel-active")value.value.activeAction={requestId:id(),action:"plan.run"};
          if(mode==="recovery-active")value.value.recoveryTransport={state:"ready"};
        }
      });control.captureReadOnlyOrphanIntent(f.directory,f.inputFile);
      const r=await f.service.getResult(f.row.requestId);assert.equal(r.ok,false,mode);assert(fs.existsSync(f.lock));assert(!audit(f,"disposition"));assert(!audit(f,"consumed"));unchanged(f);
      if(mode==="input-drift" || mode==="intent-drift")assert.equal(r.code,mode==="input-drift"?"readonly_orphan_input_changed":"readonly_orphan_transport_changed");
    });
  }
  for(const mode of ["input","intent"]){
    await test(mode+" drift after sidecar writes preserves the lock and terminal no-replay audit",async()=>{
      const f=fixture("before-unlink-"+mode);control.captureReadOnlyOrphanIntent(f.directory,f.inputFile);const write=fs.writeFileSync;let changed=false;
      try{fs.writeFileSync=(file,data,...args)=>{const result=write(file,data,...args);
        if(typeof file==="number" && typeof data==="string" && JSON.parse(data).schema===orphan.SCHEMA){changed=true;fs.appendFileSync(mode==="input"?f.inputFile:orphan.filename(f.directory,f.row.requestId,"intent")," ");}return result;};
        const r=await f.service.getResult(f.row.requestId);assert(changed);assert.equal(r.code,mode==="input"?"readonly_orphan_input_changed":"readonly_orphan_transport_changed");
      }finally{fs.writeFileSync=write;}
      assert(fs.existsSync(f.lock));assert(audit(f,"consumed"));const disposition=audit(f,"disposition");assert.equal(disposition.value.state,"unknown");assert.equal(disposition.value.replayAllowed,false);
      assert.equal(disposition.value.aeExecutionProven,false);assert.equal(disposition.value.projectGuardsReleased,false);unchanged(f);
      const before=evidence(f);assert((await f.service.getResult(f.row.requestId)).code);assert((await f.service.invoke(f.raw)).code);assert(fs.existsSync(f.lock));assert.deepEqual(evidence(f),before);unchanged(f);
    });
  }
  await test("write-once consumed crash barrier is terminal; no repeat retirement",async()=>{
    const f=fixture("consumed-only");control.captureReadOnlyOrphanIntent(f.directory,f.inputFile);
    fs.writeFileSync(orphan.filename(f.directory,f.row.requestId,"consumed"),JSON.stringify({schema:"offline interrupted attempt"}));
    const r=await f.service.getResult(f.row.requestId);assert.equal(r.code,"readonly_orphan_retirement_unknown_no_replay");assert(fs.existsSync(f.lock));assert(!audit(f,"disposition"));unchanged(f);
  });
  for(const mode of ["record","original","index","intent","source","consumed","disposition","historical-actor","matching-lock"]){
    await test(mode+" invalidates exact admission exception",async()=>{
      let drift=false;const f=fixture("later-"+mode,async(_f,expression,_queries,value)=>{if(drift && mode==="record" && expression.includes("api.getResult("))value.value={state:"completed"};});
      control.captureReadOnlyOrphanIntent(f.directory,f.inputFile);assert.equal((await f.service.getResult(f.row.requestId)).receipt.state,"unknown");drift=true;
      alter(f,mode);const before=evidence(f);
      const passive=await f.service.getResult(f.row.requestId);assert(passive.code,JSON.stringify(passive));assert.deepEqual(evidence(f),before);
      assert.deepEqual(await f.service.maintenanceTransportState(),{unresolvedCount:1,requestIds:[f.row.requestId],replayAllowed:false});
      const next=await f.service.invoke(effect());assert.equal(next.ok,false,JSON.stringify(next));assert.equal(next.code,mode==="matching-lock"?"transport_busy":"transport_reconciliation_required");assert.equal(f.sends(),0);
      assert.deepEqual(evidence(f),before);
    });
  }
  await test("persisted owner becoming live invalidates completed retirement without changing evidence",async()=>{
    const f=fixture("later-owner-live");control.captureReadOnlyOrphanIntent(f.directory,f.inputFile);await f.service.getResult(f.row.requestId);const before=evidence(f),kill=process.kill;
    // Scoped fake process-probe result; no process is started or signalled.
    try{process.kill=(pid,...args)=>pid===f.owner.pid?true:kill(pid,...args);
      assert.equal((await f.service.getResult(f.row.requestId)).code,"readonly_orphan_disposition_invalid");
      assert.deepEqual(await f.service.maintenanceTransportState(),{unresolvedCount:1,requestIds:[f.row.requestId],replayAllowed:false});
      assert.equal((await f.service.invoke(effect())).code,"transport_reconciliation_required");assert.equal(f.sends(),0);assert.deepEqual(evidence(f),before);
    }finally{process.kill=kill;}
  });
  for(const mode of ["actor-drift","target-drift","installed-drift","remote-record","panel-active","recovery-active","original","index","intent","source","consumed","disposition","disposition-bytes","matching-lock","owner-live"]){
    await test(mode+" during completed-retirement revalidation fails closed",async()=>{
      let revalidate=false,changedEvidence;const kill=process.kill,f=fixture("revalidate-"+mode,async(f,expression,queries,value)=>{
        if(!revalidate)return;
        if(queries===6 && expression.includes("api.getResult(")){
          if(mode==="actor-drift")f.reload();
          if(mode==="target-drift")f.page.webSocketDebuggerUrl="ws://127.0.0.1:8870/devtools/page/drift";
          if(mode==="installed-drift")f.installed.hashes.source="drift";
          if(mode==="remote-record")value.value={state:"completed"};
          if(mode==="owner-live")process.kill=(pid,...args)=>pid===f.owner.pid?true:kill(pid,...args);
          alter(f,mode);changedEvidence=evidence(f);
        }
        if(queries>=5 && expression.includes("api.state(")){
          if(mode==="panel-active")value.value.activeAction={requestId:id(),action:"plan.run"};
          if(mode==="recovery-active")value.value.recoveryTransport={state:"ready"};
        }
      });control.captureReadOnlyOrphanIntent(f.directory,f.inputFile);await f.service.getResult(f.row.requestId);const before=evidence(f);revalidate=true;
      try{const result=await f.service.getResult(f.row.requestId);assert(result.code,JSON.stringify(result));assert.equal(f.sends(),0);assert.deepEqual(evidence(f),changedEvidence || before);}
      finally{process.kill=kill;}
    });
  }
  await test("other mutating UNKNOWN stays blocked and unchanged after read-only orphan retirement",async()=>{
    const f=fixture("other-unknown"),native={...f.row,requestId:id(),action:"ui.sidebar.set",signature:control.computeActionSignature({...effect(),protocolVersion:control.PROTOCOL_VERSION}),state:"unknown",delivery:"unknown",phase:"delivery_unknown"};
    control.saveDurableReceipt(f.directory,native);const nativeFile=control.createReceiptPath(f.directory,native.requestId),before=fs.readFileSync(nativeFile,"utf8");
    control.captureReadOnlyOrphanIntent(f.directory,f.inputFile);assert.equal((await f.service.getResult(f.row.requestId)).receipt.state,"unknown");
    assert.equal((await f.service.invoke(effect())).code,"transport_reconciliation_required");assert.equal(fs.readFileSync(nativeFile,"utf8"),before);assert.equal(f.sends(),0);
  });
  await test("late old record at the final send bracket prevents the new action",async()=>{
    let admission=false;const f=fixture("late-before-send",async(f,expression,queries,value)=>{
      if(admission && queries===6 && expression.includes("api.getResult("))value.value={state:"completed"};
    });control.captureReadOnlyOrphanIntent(f.directory,f.inputFile);await f.service.getResult(f.row.requestId);admission=true;
    const next=await f.service.invoke(effect());assert.equal(next.code,"readonly_orphan_remote_record_appeared");assert.equal(f.sends(),0);assert.equal(fs.readFileSync(f.receiptFile,"utf8"),f.original);
  });
  for(const mode of ["actor","target"]){
    await test("current "+mode+" drift between revalidation and presend remains blocked",async()=>{
      let admission=false;const f=fixture("presend-"+mode,async(f,expression,queries)=>{
        if(admission && queries===5 && expression.includes("api.state(")){
          if(mode==="actor")f.reload();else f.page.webSocketDebuggerUrl="ws://127.0.0.1:8870/devtools/page/presend";
        }
      });control.captureReadOnlyOrphanIntent(f.directory,f.inputFile);await f.service.getResult(f.row.requestId);const before=evidence(f);admission=true;
      const next=await f.service.invoke(effect());assert.equal(next.ok,false,JSON.stringify(next));assert.equal(f.sends(),0);assert.deepEqual(evidence(f),before);
    });
  }
  await test("allowlist is exact plan.reconcile; protected/lifecycle/provider/local intent actions rejected",async()=>{
    for(const action of ["plan.run","plan.dryRun","agent.hardcore","bridge.connect","bridge.disconnect","panel.reload","autonomy.set","provider.setup","logs.get"])
      assert.throws(()=>orphan.validEnvelope({protocolVersion:control.PROTOCOL_VERSION,requestId:id(),action,args:{}}),/readonly_orphan_action_not_allowed/);
    const f=fixture("bad-run");const input=JSON.parse(fs.readFileSync(f.inputFile));input.raw.args.runId="not-a-run-uuid";input.envelope=control.validateRawInvokeInput(input.raw).envelope;input.signature=control.computeActionSignature(input.envelope);fs.writeFileSync(f.inputFile,JSON.stringify(input));
    assert.throws(()=>control.captureReadOnlyOrphanIntent(f.directory,f.inputFile),/readonly_orphan_action_not_allowed/);assert(!audit(f,"intent"));unchanged(f);
  });
  console.log(JSON.stringify({ok:true,testCases:cases.length,scenarios:cases,scope:"offline production service + VM/fake CDP + temporary receipt files; no live CEP/AE/network/child-process/providers"}));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert(path.basename(root).startsWith("cep-readonly-orphan-"));fs.rmSync(root,{recursive:true,force:true});});
