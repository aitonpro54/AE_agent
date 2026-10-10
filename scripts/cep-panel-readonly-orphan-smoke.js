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
  for(const mode of ["token-drift","lock-file-replaced","owner-became-live","actor-drift","target-drift","installed-drift","remote-record","panel-active","recovery-active"]){
    await test(mode+" during second observation never retires",async()=>{
      const f=fixture(mode,async(f,expression,queries,value)=>{
        if(queries===3 && expression.includes("api.getResult(")){
          if(mode==="token-drift")fs.writeFileSync(f.lock,JSON.stringify({...f.owner,token:id()}));
          if(mode==="lock-file-replaced"){fs.unlinkSync(f.lock);fs.writeFileSync(f.lock,JSON.stringify(f.owner));}
          if(mode==="owner-became-live")fs.writeFileSync(f.lock,JSON.stringify({...f.owner,pid:process.pid}));
          if(mode==="actor-drift")f.reload();
          if(mode==="target-drift")f.page.webSocketDebuggerUrl="ws://127.0.0.1:8870/devtools/page/changed";
          if(mode==="installed-drift")f.installed.hashes.source="changed";
          if(mode==="remote-record")value.value={protocolVersion:control.PROTOCOL_VERSION,requestId:f.row.requestId,action:"plan.reconcile",state:"completed",phase:"completed",replayAllowed:false};
        }
        if(queries>=2 && expression.includes("api.state(")){
          if(mode==="panel-active")value.value.activeAction={requestId:id(),action:"plan.run"};
          if(mode==="recovery-active")value.value.recoveryTransport={state:"ready"};
        }
      });control.captureReadOnlyOrphanIntent(f.directory,f.inputFile);
      const r=await f.service.getResult(f.row.requestId);assert.equal(r.ok,false,mode);assert(fs.existsSync(f.lock));assert(!audit(f,"disposition"));unchanged(f);
    });
  }
  await test("write-once consumed crash barrier is terminal; no repeat retirement",async()=>{
    const f=fixture("consumed-only");control.captureReadOnlyOrphanIntent(f.directory,f.inputFile);
    fs.writeFileSync(orphan.filename(f.directory,f.row.requestId,"consumed"),JSON.stringify({schema:"offline interrupted attempt"}));
    const r=await f.service.getResult(f.row.requestId);assert.equal(r.code,"readonly_orphan_retirement_unknown_no_replay");assert(fs.existsSync(f.lock));assert(!audit(f,"disposition"));unchanged(f);
  });
  for(const mode of ["later-actor","later-record","later-original","later-disposition"]){
    await test(mode+" invalidates exact admission exception",async()=>{
      let drift=false;const f=fixture(mode,async(_f,expression,_queries,value)=>{if(drift && mode==="later-record" && expression.includes("api.getResult("))value.value={state:"completed"};});
      control.captureReadOnlyOrphanIntent(f.directory,f.inputFile);assert.equal((await f.service.getResult(f.row.requestId)).receipt.state,"unknown");drift=true;
      if(mode==="later-actor")f.reload();
      if(mode==="later-original")fs.appendFileSync(f.receiptFile," ");
      if(mode==="later-disposition"){const file=orphan.filename(f.directory,f.row.requestId,"disposition"),v=JSON.parse(fs.readFileSync(file));v.requestId=id();fs.writeFileSync(file,JSON.stringify(v));}
      const next=await f.service.invoke(effect());assert.equal(next.ok,false,JSON.stringify(next));assert.equal(next.code,"transport_reconciliation_required");assert.equal(f.sends(),0);
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
  await test("allowlist is exact plan.reconcile; protected/lifecycle/provider/local intent actions rejected",async()=>{
    for(const action of ["plan.run","plan.dryRun","agent.hardcore","bridge.connect","bridge.disconnect","panel.reload","autonomy.set","provider.setup","logs.get"])
      assert.throws(()=>orphan.validEnvelope({protocolVersion:control.PROTOCOL_VERSION,requestId:id(),action,args:{}}),/readonly_orphan_action_not_allowed/);
    const f=fixture("bad-run");const input=JSON.parse(fs.readFileSync(f.inputFile));input.raw.args.runId="not-a-run-uuid";input.envelope=control.validateRawInvokeInput(input.raw).envelope;input.signature=control.computeActionSignature(input.envelope);fs.writeFileSync(f.inputFile,JSON.stringify(input));
    assert.throws(()=>control.captureReadOnlyOrphanIntent(f.directory,f.inputFile),/readonly_orphan_action_not_allowed/);assert(!audit(f,"intent"));unchanged(f);
  });
  console.log(JSON.stringify({ok:true,testCases:cases.length,scenarios:cases,scope:"offline production service + VM/fake CDP + temporary receipt files; no live CEP/AE/network/child-process/providers"}));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert(path.basename(root).startsWith("cep-readonly-orphan-"));fs.rmSync(root,{recursive:true,force:true});});
