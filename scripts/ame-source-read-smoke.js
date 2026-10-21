"use strict";
// Offline only. Deliver fixed AME reads after the AE script returns (DL reentry).
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),vm=require("node:vm");
const jobs=require("../mcp-server/ame-title-jobs"),{createProductReadDispatch}=require("../mcp-server/ame-product-read-dispatch");
const scratch=path.resolve(__dirname,"../.codex-runtime/ame-source-read/fixtures");fs.mkdirSync(scratch,{recursive:true});const root=fs.mkdtempSync(path.join(scratch,"bounded-"));let checks=0;
const sha=file=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),hash=v=>crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex"),copy=v=>JSON.parse(JSON.stringify(v));
async function check(name,fn){await fn();checks++;console.log("PASS "+name);}
function fixture(name){
  const dir=path.join(root,name);fs.mkdirSync(dir);const source=path.join(dir,"Проект (пример).aep"),stateDir=path.join(dir,"state");fs.writeFileSync(source,"one existing AEP");
  const args={sourceProjectFile:source,expectedSourceSha25664:sha(source),targetSpecifier:"ame-26.0",expectedSessionNonce:"boot-session",expectedProcess:{pid:77,startedAt:"2026-10-20T12:00:00.000Z"},timeoutMs:1000};
  let clock=Date.now(),activeAE=false,processInfo={...args.expectedProcess,path:path.join(dir,"AME.exe")},dlCalls=0,dispatches=0,product=true,afterRead=null;
  const inbox=[],sent=[],commands=[],guids=Array.from({length:13},(_,i)=>"000112"+String(i).padStart(2,"0")+"-0000-0000-0000-000000000000"),forbidden=()=>{throw Error("queue/START/save/launch/pump/sleep forbidden");};
  class TestDate extends Date{constructor(value){super(arguments.length?value:clock);}static now(){return clock;}}
  const original={operation:"enqueue",requestNonce:"original-UNKNOWN",callback:"timeout",body:null,message:{untouched:true}},originalAME={untouched:true};
  const frontend={getDLItemsAtRoot:file=>{assert.equal(activeAE,false,"DL must run after AE released");assert.equal(file,source);dlCalls++;clock+=175664;if(afterRead)afterRead();return guids;},addDLToBatch:forbidden,removeAllBatchItems:forbidden};
  for(const name of ["getBatchItems","getQueue","getEncoderHost","getBatchEncoder","getExporter","runBatch","save"])Object.defineProperty(frontend,name,{get:forbidden});
  function File(file){const s=fs.lstatSync(file);this.exists=true;this.alias=s.isSymbolicLink();this.length=s.size;this.modified=s.mtime;}
  const ame=vm.createContext({Date:TestDate,File,BridgeTalk:{appSpecifier:args.targetSpecifier},$:{global:{aeAgentAMEProbeSessionNonce:args.expectedSessionNonce,aeAgentAMETitleJobsV1:originalAME}},app:{getFrontend:()=>frontend,getEncoderHost:forbidden}});
  function BridgeTalk(){this.send=function(){assert.equal(arguments.length,0,"async send must have no timeout argument");inbox.push(this);sent.push(this);return true;};}
  BridgeTalk.isRunning=()=>true;BridgeTalk.getStatus=()=>"IDLE";BridgeTalk.pump=forbidden;BridgeTalk.launch=forbidden;
  const ae=vm.createContext({Date:TestDate,BridgeTalk,$:{global:{aeAgentAMETitleSendV1:original},sleep:forbidden}});
  const port=createProductReadDispatch({assertProduct:()=>product,dispatch:async(script,timeout,metadata)=>{dispatches++;commands.push(script);assert.equal(metadata.operation,"sources");assert.equal(metadata.mutating,false);assert.equal(timeout,30000);activeAE=true;try{return {result:copy(vm.runInContext("(function(){"+script+"}())",ae,{timeout:1000}))};}finally{activeAE=false;}}});
  const deps={stateDir,now:()=>clock,inspectProcesses:async()=>[processInfo],runExtendScriptBody:forbidden,resolveOutputFilePath:forbidden,assertManualIngress:forbidden,assertServerContext:forbidden,nativeDispatchPort:port};
  let executor=jobs.createExecutor(deps);
  const call=(overrides={})=>executor.execute(jobs.INSPECT,{...args,...overrides});
  const reconcile=r=>executor.execute(jobs.INSPECT,r.reconcileArgs);
  const deliver=()=>{assert(inbox.length);const m=inbox.shift();m.onResult({body:vm.runInContext(m.body,ame,{timeout:1000})});return m;};
  const untouched=()=>{assert.equal(ae.$.global.aeAgentAMETitleSendV1,original);assert.equal(original.callback,"timeout");assert.equal(ame.$.global.aeAgentAMETitleJobsV1,originalAME);assert.equal(fs.existsSync(stateDir),false);};
  return {args,source,ae,ame,frontend,guids,sent,inbox,commands,call,reconcile,deliver,untouched,counts:()=>({dlCalls,dispatches}),restart:()=>{executor=jobs.createExecutor(deps);},afterRead:fn=>{afterRead=fn;},process:info=>{processInfo=info;},product:value=>{product=value;},change:()=>{fs.appendFileSync(source," changed");return sha(source);},legacy:()=>{const old={requestNonce:crypto.randomUUID(),targetSpecifier:args.targetSpecifier,processBinding:hash({target:args.targetSpecifier,session:args.expectedSessionNonce,pid:processInfo.pid,startedAt:processInfo.startedAt,path:processInfo.path.replace(/\\/g,"/").toLowerCase()}),operationBinding:hash({operation:"sources",sourcePath:fs.realpathSync(source),sha256:args.expectedSourceSha25664}),callback:"timeout",body:null,message:{untouched:true}};ae.$.global.aeAgentAMETitleSendV1=old;return old;},clock:()=>clock};
}
(async()=>{
  await check("async pending, 300s budget, exact nonce reconcile and 175s DL completion; no queue/pump",async()=>{
    const f=fixture("normal"),first=await f.call();assert.equal(first.code,"source_read_pending");assert.equal(first.pending,true);assert.equal(first.sourceRead.sourceReadBudgetMs,300000);assert.equal(first.sourceRead.deadlineAt-first.sourceRead.submittedAt,300000);assert.equal(f.sent[0].timeout,300);assert.equal(first.transportDiagnostic.sendMode,"async_no_wait");assert.equal(first.transportDiagnostic.pumpPerformed,false);assert.equal(f.counts().dlCalls,0);
    const duplicate=await f.call();assert.equal(duplicate.code,"source_read_reconcile_required");assert.equal(duplicate.requestNonce,first.requestNonce);assert.equal(f.counts().dispatches,1);assert.equal((await f.reconcile(first)).requestNonce,first.requestNonce);assert.equal(f.sent.length,1);
    f.deliver();const completed=await f.reconcile(first);assert.equal(completed.ok,true,JSON.stringify(completed));assert.deepEqual(completed.sourceGuids,f.guids);assert.equal(completed.native.sourceReadFinishedAt-completed.native.sourceReadStartedAt,175664);assert.equal(f.counts().dlCalls,1);assert.equal((await f.call()).requestNonce,first.requestNonce);assert.equal(f.sent.length,1);f.untouched();
  });
  await check("timeout retains exact original; late result and daemon reader restart do not resend",async()=>{
    const f=fixture("timeout"),first=await f.call();f.sent[0].onTimeout();const timed=await f.reconcile(first);assert.equal(timed.code,"timeout");assert.equal(timed.pending,true);f.restart();const rediscovered=await f.call();assert.equal(rediscovered.code,"source_read_reconcile_required");assert.equal(rediscovered.requestNonce,first.requestNonce);assert.equal(f.sent.length,1);f.deliver();const done=await f.reconcile(first);assert.equal(done.ok,true);assert.equal(done.requestNonce,first.requestNonce);assert.equal(f.counts().dlCalls,1);f.untouched();
  });
  await check("wrong/missing reconcile nonce cannot poison original claim or replay source",async()=>{
    const f=fixture("nonce"),first=await f.call(),wrong=crypto.randomUUID(),before=f.counts().dispatches;
    const mismatch=await f.call({reconcileRequestNonce:wrong});assert.equal(mismatch.code,"source_read_reconcile_nonce_mismatch");assert.equal(mismatch.requestNonce,first.requestNonce);assert.equal(f.counts().dispatches,before);assert.equal((await f.call()).reconcileArgs.reconcileRequestNonce,first.requestNonce);
    f.restart();assert.equal((await f.call({reconcileRequestNonce:wrong})).code,"source_read_request_missing");assert.equal((await f.call()).requestNonce,first.requestNonce);assert.equal(f.sent.length,1);f.deliver();assert.equal((await f.reconcile(first)).ok,true);f.untouched();
  });
  await check("new SHA independent read; completed old SHA only historical GUIDs, never current proof",async()=>{
    const f=fixture("new-sha"),first=await f.call();f.deliver();assert.equal((await f.reconcile(first)).ok,true);const currentSha=f.change();
    const old=await f.reconcile(first);assert.equal(old.code,"source_read_historical");assert.equal(old.ok,false);assert.equal(old.currentSourceMatch,false);assert.deepEqual(old.sourceGuids,[]);assert.deepEqual(old.retainedSourceGuids,f.guids);assert.equal(old.native,null);
    const fresh=await f.call({expectedSourceSha25664:currentSha});assert.equal(fresh.code,"source_read_pending");assert.notEqual(fresh.requestNonce,first.requestNonce);assert.equal(f.sent.length,2);f.deliver();assert.equal((await f.reconcile(fresh)).ok,true);assert.equal((await f.call({expectedSourceSha25664:currentSha})).requestNonce,fresh.requestNonce);f.untouched();
  });
  await check("legacy UNKNOWN remains byte-for-byte owned; same hash no replay, new hash independent",async()=>{
    const f=fixture("legacy"),old=f.legacy(),snapshot=copy(old),fresh=await f.call();assert.equal(fresh.code,"source_read_reconcile_required");assert.equal(fresh.requestNonce,old.requestNonce);assert.equal(f.sent.length,0);assert.equal((await f.reconcile(fresh)).code,"timeout");assert.deepEqual(copy(old),snapshot);assert.equal(old.operation,undefined);
    const currentSha=f.change(),next=await f.call({expectedSourceSha25664:currentSha});assert.equal(next.code,"source_read_pending");assert.equal(f.sent.length,1);assert.deepEqual(copy(old),snapshot);f.deliver();assert.equal((await f.reconcile(next)).ok,true);assert.deepEqual(copy(old),snapshot);assert.equal(f.ae.$.global.aeAgentAMETitleSendV1,old);
  });
  await check("file TOCTOU before/during DL and postread session/app changes reject GUID proof",async()=>{
    const f=fixture("pre-file"),first=await f.call();f.change();f.deliver();const changed=await f.reconcile(first);assert.equal(changed.ok,false);assert.equal(f.counts().dlCalls,0);assert.deepEqual(changed.sourceGuids,[]);
    const g=fixture("during-file"),second=await g.call();g.afterRead(()=>g.change());g.deliver();assert.equal((await g.reconcile(second)).ok,false);assert.equal(g.counts().dlCalls,1);
    for(const field of ["session","app"]){const h=fixture("during-"+field),read=await h.call();h.afterRead(()=>{if(field==="session")h.ame.$.global.aeAgentAMEProbeSessionNonce="changed";else h.ame.BridgeTalk.appSpecifier="ame-25.0";});h.deliver();const r=await h.reconcile(read);assert.equal(r.code,"target_session_changed");assert.equal(r.ok,false);assert.deepEqual(r.sourceGuids,[]);}
    const n=fixture("explicit-null"),read=await n.call({expectedSessionNonce:null});n.deliver();assert.equal((await n.reconcile(read)).code,"native_correlation_unknown");assert.equal(n.counts().dlCalls,0);
  });
  await check("process/product/alias guards and fixed source budget/schema fail closed",async()=>{
    const f=fixture("process");f.process({...f.args.expectedProcess,pid:78,path:"other.exe"});assert.equal((await f.call()).code,"ame_title_process_changed_or_ambiguous");assert.equal(f.sent.length,0);
    const g=fixture("product");g.product(false);const denied=await g.call();assert.equal(denied.ok,false);assert.equal(g.sent.length,0);assert.equal((await g.call()).code,"source_read_reconcile_required");
    const h=fixture("hardlink");fs.linkSync(h.source,path.join(path.dirname(h.source),"hardlink.aep"));assert.equal((await h.call()).code,"ame_source_read_file_identity");assert.equal(h.sent.length,0);
    const n=fixture("schema");for(const budget of [299999,600001,3.5,"300000"])assert.throws(()=>jobs.validateInput(jobs.INSPECT,{...n.args,sourceReadBudgetMs:budget}),/budget_invalid/);assert.equal(jobs.validateInput(jobs.INSPECT,n.args).sourceReadBudgetMs,300000);assert.equal(jobs.validateInput(jobs.INSPECT,{...n.args,sourceReadBudgetMs:600000}).sourceReadBudgetMs,600000);for(const field of ["script","messageBody","proof","queueMode"])assert.throws(()=>jobs.validateInput(jobs.INSPECT,{...n.args,[field]:"x"}),/invalid_input/);assert.throws(()=>jobs.validateInput(jobs.ENQUEUE,{...n.args,sourceReadBudgetMs:300000}),/invalid_input/);
  });
  await check("ES-compatible explicit selector: own/legacy/preference/missing/control nonce; no send or cache writes",async()=>{
    const f=fixture("selector"),first=await f.call(),read=first.sourceRead,key=read.processBinding+":"+read.operationBinding,cache=f.ae.$.global.aeAgentAMESourceReadsV1,own=cache[key],otherNonce=crypto.randomUUID(),freshNonce=crypto.randomUUID();own.callback="result";own.body="own retained result";
    const a={...jobs.validateInput(jobs.INSPECT,first.reconcileArgs),operation:"sources",sourcePath:first.source.path,sourcePin:first.source,sourcePinSha25664:read.sourcePinSha25664,processBinding:read.processBinding,operationBinding:read.operationBinding,requestNonce:freshNonce,minimumObservedAt:0};
    const run=extra=>copy(vm.runInContext("(function(){"+jobs.commandScript({...a,...extra})+"}())",f.ae,{timeout:1000}));
    const before=JSON.stringify(cache),originalLegacy=f.ae.$.global.aeAgentAMETitleSendV1;
    let actual=run({});assert.equal(actual.code,"result");assert.equal(actual.requestNonce,first.requestNonce);assert.equal(actual.responseBody,"own retained result");assert.equal(actual.sourceRead.legacy,false);
    const legacy={...own,requestNonce:otherNonce,body:"legacy retained result"};f.ae.$.global.aeAgentAMETitleSendV1=legacy;actual=run({reconcileRequestNonce:otherNonce});assert.equal(actual.code,"result");assert.equal(actual.requestNonce,otherNonce);assert.equal(actual.responseBody,"legacy retained result");assert.equal(actual.sourceRead.legacy,true);
    legacy.requestNonce=first.requestNonce;actual=run({});assert.equal(actual.responseBody,"own retained result");assert.equal(actual.sourceRead.legacy,false);actual=run({reconcileRequestNonce:crypto.randomUUID()});assert.equal(actual.code,"source_read_request_missing");assert.equal(actual.sourceRead,null);
    actual=run({reconcileRequestNonce:undefined});assert.equal(actual.code,"source_read_reconcile_required");assert.equal(actual.requestNonce,freshNonce);assert.equal(actual.sourceRead.originalRequestNonce,first.requestNonce);
    f.ae.$.global.aeAgentAMESourceReadsV1={};actual=run({});assert.equal(actual.responseBody,"legacy retained result");assert.equal(actual.sourceRead.legacy,true);f.ae.$.global.aeAgentAMESourceReadsV1=cache;f.ae.$.global.aeAgentAMETitleSendV1=originalLegacy;assert.equal(JSON.stringify(cache),before);assert.equal(f.sent.length,1);assert.equal(f.counts().dlCalls,0);f.untouched();
    // Node's parser cannot reproduce the observed native chained-ternary bug.
    // Keep the emitted ES3 sender free of chained conditional branches.
    const ast=require("internal/deps/acorn/acorn/dist/acorn").parse(jobs.commandScript(a),{ecmaVersion:3,allowReturnOutsideFunction:true});
    function walk(node){if(!node||typeof node!=="object")return;if(node.type==="ConditionalExpression")assert(node.consequent.type!=="ConditionalExpression"&&node.alternate.type!=="ConditionalExpression","native sender must use explicit selection");for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==="object")walk(value);}walk(ast);
  });
  await check("native source and sender remain ES3; runtime pins include source-only module",async()=>{
    const acorn=require("internal/deps/acorn/acorn/dist/acorn"),f=fixture("parse"),first=await f.call();await f.reconcile(first);acorn.parse(f.sent[0].body,{ecmaVersion:3});for(const script of f.commands)acorn.parse(script,{ecmaVersion:3,allowReturnOutsideFunction:true});const modulePath=path.resolve(__dirname,"../mcp-server/ame-source-read.js"),pin=require("../mcp-server/review-evidence").runtimeNamedHashSet(path.resolve(__dirname,"..")).find(p=>p.name==="mcp-server/ame-source-read.js");assert(pin);assert.equal(pin.sha256,sha(modulePath));
  });
  console.log(JSON.stringify({ok:true,checks,evidence:"offline production executor/read port/fixed native VMs; no live Adobe, queue or START"}));
})().catch(e=>{console.error(e);process.exitCode=1;});
