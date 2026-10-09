"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),vm=require("node:vm"),{spawnSync}=require("node:child_process");
const native=require("../mcp-server/native-render-variant");
const {buildSemanticVerification}=require("../mcp-server/semantic-verification");
const {reconcilePlanRun,reconciliationReadRequests}=require("../mcp-server/plan-run-reconciliation");
const root=fs.mkdtempSync(path.join(os.tmpdir(),"ae-native-title-"));
const file=path.join(root,"source.aep");fs.writeFileSync(file,"fixture");
const base={expectedProjectFile:file,rootCompItemId:10,variantCompItemId:20,controlledLayerIds:[11,12]};
const variants=[{variantId:"one",activeLayerIds:[11],outputFileName:"one.mov"},{variantId:"two",activeLayerIds:[12],outputFileName:"two.mov"}];
const inspection={...base,variants};
const raw={...base,...variants[0],expectedStateHash:"a".repeat(64),renderSettingsTemplate:"Best Settings",outputModuleTemplate:"Movie",range:{startFrame:3,frameCount:20},timeoutMs:1000};
const copy=v=>JSON.parse(JSON.stringify(v));
if(process.argv.includes("--es3")){
  const acorn=require("internal/deps/acorn/acorn/dist/acorn");
  const parse=body=>acorn.parse("(function(){"+body+"})();",{ecmaVersion:3,allowReserved:"never"});
  parse(native.inspectScript(inspection));parse(native.renderScript(raw,{},path.join(root,"one.mov"),"b".repeat(64)));
  assert.throws(()=>parse("return ()=>1;"));assert.throws(()=>parse("return {native:1};"));
  console.log("Strict ES3 generated host parse PASS; negative parser controls PASS");process.exit(0);
}
let checks=0;
const check=(value,message)=>{assert(value,message);checks++;};
function fixture(options={}) {
  class CompItem {constructor(id,layers){Object.assign(this,{id,name:"comp"+id,_layers:layers,width:1920,height:1080,duration:2,frameDuration:0.04});}get numLayers(){return this._layers.length;}layer(i){return this._layers[i-1];}}
  class TextLayer {constructor(id,enabled){Object.assign(this,{id,name:"text"+id,enabled,solo:false,guideLayer:false,locked:false,hasTrackMatte:false,isTrackMatte:false,trackMatteType:0});}property(){return {property:()=>({expressionEnabled:false,value:{text:this.name}})};}}
  const layers=[new TextLayer(11,true),new TextLayer(12,false)],target=new CompItem(20,layers),other=new CompItem(30,[]);
  const rootComp=new CompItem(10,[{id:21,name:"common",enabled:true,solo:false,guideLayer:false,locked:false,hasTrackMatte:false,isTrackMatte:false,trackMatteType:0,source:target}]);
  const nativeFiles=new Set(),samples=[];
  function File(p){this.fsName=p;Object.defineProperty(this,"exists",{get:()=>nativeFiles.has(p)||fs.existsSync(p)});}
  function queueItem(comp,flag){
    const om={templates:["Movie","AVI","Sequence","Dangerous"],file:new File(path.join(root,"foreign"+comp.id+".mov")),postRenderAction:0,
      applyTemplate(t){this.format=t==="AVI" ? "AVI" : t==="Sequence" ? "PNG Sequence" : "QuickTime";if(t==="Dangerous")this.postRenderAction=1;if(options.templateError)throw Error("template error");},getSettings(){return {Format:this.format||"QuickTime"};}};
    return {comp,render:flag,status:"QUEUED",templates:["Best Settings"],numOutputModules:1,timeSpanStart:0,timeSpanDuration:2,outputModule:()=>om,applyTemplate(){if(options.renderTemplateError)throw Error("render template error");}};
  }
  const items=[queueItem(rootComp,true),queueItem(other,false)],original=items.slice();
  const project={file:new File(file),revision:1,numItems:3,item:i=>[rootComp,target,other][i-1]};
  const rq={rendering:false,get numItems(){return items.length;},item:i=>items[i-1],items:{add(comp){const item=queueItem(comp,true);items.push(item);project.revision++;return item;}},render(){
    const owned=items[items.length-1];samples.push({visible:layers.filter(l=>l.enabled).map(l=>l.id),flags:items.map(q=>q.render),post:owned.outputModule(1).postRenderAction});
    if(options.error)throw Error("renderer failed");
    owned.status=options.cancel ? "USER_STOPPED" : "DONE";
    if(!options.cancel)nativeFiles.add(owned.outputModule(1).file.fsName);
  }};project.renderQueue=rq;
  // Explicitly remove JSON and modern array helpers in the actual host VM.
  const context=vm.createContext({app:{project},File,CompItem,TextLayer,TrackMatteType:{NO_TRACK_MATTE:0},RQItemStatus:{DONE:"DONE"},PostRenderAction:{NONE:0},GetSettingsFormat:{STRING:1},JSON:undefined});
  vm.runInContext("Array.prototype.includes=undefined;Array.prototype.map=undefined;Array.prototype.filter=undefined;",context);
  const run=body=>copy(vm.runInContext("(function(){"+body+"}).call(this)",context));
  return {project,target,rootComp,other,layers,items,original,nativeFiles,samples,context,run,rq};
}
function executor(f,label="main", delivery) {
  const deps={stateDir:path.join(root,"state-"+label),resolveOutputFilePath:name=>path.join(root,"out-"+label,name),runExtendScriptBody:async(body,meta)=>delivery ? delivery(body,meta,f) : {result:f.run(body)}};
  return {exec:native.createExecutor(deps),deps};
}
let grantCounter=0;
function grant(exec,override={}) {
  const record={actionId:"action"+(++grantCounter),payloadHash:"hash",confirmedBySurface:"cep-panel",executionState:"executing",dryRunCompletedAt:new Date().toISOString(),project:{expectedFile:file},dryRunReceipt:{payloadHash:"hash",contractVersion:"test-v1",stepCount:1,projectFile:file}};
  return exec.authorize({record,runId:"run"+grantCounter,confirm:true,autonomous:false,allowWithoutCheckpoint:false,stepCount:1,contractVersion:"test-v1",checkpoint:{sourceFile:file,checkpointFile:path.join(root,"checkpoint.aep")},...override});
}
async function renderArgs(exec,v=variants[0]){const read=await exec.inspect(inspection);return {...raw,...v,expectedStateHash:read.stateHash};}
function restored(f){check(f.layers[0].enabled===true && f.layers[1].enabled===false,"visibility restored");check(f.original[0].render===true && f.original[1].render===false,"all foreign queue flags restored");check(f.items[f.items.length-1].render===false,"owned disabled");}
async function main(){
  const parser=spawnSync(process.execPath,["--expose-internals",__filename,"--es3"],{encoding:"utf8",windowsHide:true});check(parser.status===0,parser.stderr||parser.stdout);
  const f=fixture(),{exec,deps}=executor(f);
  const first=await exec.inspect(inspection);check(f.items.length===2 && f.samples.length===0,"inspect never stages");check(first.snapshot.controlled.length===2 && first.stateHash.length===64,"exact native facts/hash");
  for(const bad of [{},JSON.parse(JSON.stringify({proposalId:"a",runId:"r",authorized:true}))])await assert.rejects(exec.execute(raw,bad),/manual_authorization/);
  for(const extra of [{autonomous:true},{confirm:false},{allowWithoutCheckpoint:true},{checkpoint:null}])assert.throws(()=>grant(exec,extra));
  const recordOverride={actionId:"a",payloadHash:"new",confirmedBySurface:"cep-panel",executionState:"executing",project:{expectedFile:file},dryRunCompletedAt:"yes",dryRunReceipt:{payloadHash:"old",contractVersion:"test-v1",stepCount:1,projectFile:file}};
  assert.throws(()=>grant(exec,{record:recordOverride}),e=>e.code==="project_save_dry_run_stale");checks+=7;
  const a=await renderArgs(exec),result=await exec.execute(a,grant(exec));check(result.ok===true,JSON.stringify(result));restored(f);
  check(JSON.stringify(f.samples[0].visible)==="[11]" && JSON.stringify(f.samples[0].flags)==="[false,false,true]","samples chosen variant and isolates queue");
  check(native.verifyInspection(result.renderReceipt,result.inspection,a),"persisted native receipt and independent read");
  check(result.alphaDxvProof==="not_verified","template name is not codec alpha proof");
  const b=await renderArgs(exec,variants[1]),r2=await exec.execute(b,grant(exec));check(r2.ok,JSON.stringify(r2));restored(f);check(JSON.stringify(f.samples[1].visible)==="[12]","second title uses same common comp");check(f.project.numItems===3 && f.items.length===4,"one owned item per title, zero comp creation");
  const restart=native.createExecutor(deps),again=await renderArgs(restart);await assert.rejects(restart.execute(again,grant(restart)),/reserved_replay_blocked/);check(f.samples.length===2,"restart duplicate never delivered");
  for(const mode of ["error","cancel","templateError"]){const fx=fixture({[mode]:true}),e=executor(fx,mode).exec;const args=await renderArgs(e);const r=await e.execute(args,grant(e));check(!r.ok,"failure not native success");restored(fx);check(fx.items.length===3,"failure keeps exactly one owned item");}
  const dangerous=fixture(),de=executor(dangerous,"post").exec,da={...await renderArgs(de),outputModuleTemplate:"Dangerous"};const dr=await de.execute(da,grant(de));check(dr.ok && dangerous.samples[0].post===0,"dangerous postrender template forced NONE");
  for(const tpl of ["AVI","Sequence"]){const fx=fixture(),e=executor(fx,"format"+tpl).exec;const r=await e.execute({...await renderArgs(e),outputModuleTemplate:tpl},grant(e));check(!r.ok && fx.samples.length===0,"format/extension sequence rejected before render");restored(fx);}
  const stale=fixture(),se=executor(stale,"stale").exec,sa=await renderArgs(se);stale.project.revision++;await assert.rejects(se.execute(sa,grant(se)),/stale_state/);check(stale.items.length===2,"stale native no mutation");
  const freshStale=fixture(),fe=executor(freshStale,"freshstale",(body,meta,fx)=>{if(meta.phase==="render")fx.project.revision++;return {result:fx.run(body)};}).exec;
  const fr=await fe.execute(await renderArgs(fe),grant(fe));check(!fr.ok && freshStale.items.length===2 && freshStale.samples.length===0,"synchronous recheck no mutation on stale delivery");
  const timeout=fixture(),teParts=executor(timeout,"timeout",(body,meta,fx)=>{if(meta.phase==="render"){fx.run(body);throw Error("command timeout after delivery");}return {result:fx.run(body)};}),te=teParts.exec,ta=await renderArgs(te),tr=await te.execute(ta,grant(te));
  check(tr.code==="native_render_outcome_unknown" && tr.replayAllowed===false,"timeout explicitly unknown, no cancellation/retry");const ti=await te.inspect({...inspection,variants:[variants[0]],attemptId:tr.attemptId});check(ti.attempt.state==="unknown" && ti.attempt.receiptConfirmed===false,"later DONE/file cannot synthesize lost receipt");
  const teRestart=native.createExecutor(teParts.deps);await assert.rejects(teRestart.execute(await renderArgs(teRestart),grant(teRestart)),/reserved_replay_blocked/);check(timeout.samples.length===1,"timeout replay after restart blocked");
  for(const field of ["solo","guideLayer","locked","hasTrackMatte","isTrackMatte"]){const fx=fixture();fx.layers[0][field]=true;await assert.rejects(executor(fx,field).exec.inspect(inspection));checks++;}
  const duplicate=fixture();duplicate.rootComp._layers.push({...duplicate.rootComp._layers[0],id:22});await assert.rejects(executor(duplicate,"duplicate").exec.inspect(inspection));checks++;
  const empty=fixture();empty.items.length=0;const emptyRead=await executor(empty,"empty").exec.inspect(inspection);check(emptyRead.snapshot.templates.gap==="existing_queue_template_carrier_required" && empty.items.length===0,"empty queue honest no-staging gap");
  for(const name of ["CON.mov","nul.avi","x.mov.","../x.mov","same.MOV ","x.png","COM1.mov"]){assert.throws(()=>native.validateInput(native.RENDER,{...raw,outputFileName:name}));checks++;}
  assert.throws(()=>native.validateInput(native.INSPECT,{...inspection,variants:[variants[0],{...variants[1],outputFileName:"ONE.MOV"}]}));checks++;
  const nativeStep={index:1,tool:native.RENDER,args:a,status:"completed",mutating:true,result:result};
  const readStep={index:2,tool:native.INSPECT,args:native.inspectionArgs(a,result.renderReceipt.attemptId),status:"completed",result:result.inspection};
  const run={id:result.renderReceipt.authorization.runId,provenance:{actionId:result.renderReceipt.authorization.proposalId},steps:[nativeStep,readStep],ok:true};
  const plan={steps:[{tool:native.RENDER,args:a},{tool:native.INSPECT,args:readStep.args}]};
  const semantic=buildSemanticVerification(plan,run);
  check(semantic.checks.some(c=>c.id.includes("native-done") && c.status==="passed"),"semantic matches independent bound native receipt");
  const noReceipt=copy(run);delete noReceipt.steps[0].result.renderReceipt;const badSemantic=buildSemanticVerification(plan,noReceipt);check(!badSemantic.checks.some(c=>c.id.includes("native-done") && c.status==="passed"),"semantic rejects output-only proof");
  const attached=copy(run);attached.steps[0].independentReadBack=[{...readStep,source:"server_typed_readback",observedAt:new Date().toISOString()}];
  check(buildSemanticVerification(plan,attached).checks.some(c=>c.id.includes("native-done") && c.status==="passed"),"server attachment + explicit documented read agree");
  attached.steps[0].independentReadBack[0].status="failed";
  check(!buildSemanticVerification(plan,attached).checks.some(c=>c.id.includes("native-done") && c.status==="passed"),"failed attachment cannot be hidden by good explicit read");
  const rec={schema:"ae-agent-plan-run-record.v1",runId:run.id,project:{file},plan,run};const requests=reconciliationReadRequests(rec);check(requests.length===1 && requests[0].tool===native.INSPECT,"reconciliation requests exact typed inspection");
  const reconcile=record=>reconcilePlanRun({record,freshReadSteps:[{tool:"get_project_info",status:"completed",result:{file}},readStep],project:{file}});
  check(reconcile(rec).steps[0].mutationStatus==="applied","reconciliation native receipt + fresh read");const unknown=copy(rec);delete unknown.run.steps[0].result.renderReceipt;check(reconcile(unknown).steps[0].mutationStatus==="unknown","reconciliation never upgrades lost receipt");
  const source=fs.readFileSync(path.join(__dirname,"../mcp-server/bridge-daemon.js"),"utf8");
  check(source.includes("nativeRenderExecutor.assertAuthorization(executionContext") && source.includes("nativeRenderExecutor.authorize({"),"bridge server-owned direct and runner auth hooks");
  console.log(JSON.stringify({ok:true,checks,scope:"offline ES3 parse + actual generated host VM + durable guard/semantic/reconciliation; no live render/media proof"}));
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
