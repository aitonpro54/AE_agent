"use strict";
// Source-extracted real bridge protection wiring, injected offline checkpoint IO
// and dispatch. This does not start a daemon, Adobe process, or network client.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),vm=require("node:vm"),assert=require("node:assert/strict");
const series=require("../mcp-server/ame-title-series"),protocol=require("../mcp-server/m100-protocol");
const source=fs.readFileSync(path.resolve(__dirname,"../mcp-server/bridge-daemon.js"),"utf8").replace(/\r\n/g,"\n");
function section(start,end){const from=source.indexOf(start);assert(from>=0,start);const to=source.indexOf(end,from+start.length);assert(to>from,end);return source.slice(from,to);}
function extract(name){const start=source.indexOf("function "+name+"(");assert(start>=0);return source.slice(source.lastIndexOf("\n",start)+1,source.indexOf("\n}",start)+2);}
const auto=section("  if (mutatingExecution && !lifecycleCompletion && !boundedPropertyJournal && !activeEditSessionAtStart && !checkpointStepPresent)","  if (mutatingExecution && seriesArgs)");
const begin=section("  if (mutatingExecution && seriesArgs)","  if (lifecycleStep && !dryRun)");
const reserve=section("        if (seriesArgs) {\n          if (activeEditSession !== seriesSession)","        if (activeEditSession && require");
const cleanup=section("    if (!dryRun && seriesSession && activeEditSession === seriesSession)","    if (!run.dryRun && validation.mutatingCount");
const preflight=section("  try { if(validation.mutatingCount>0)seriesArgs = preflightAmeTitleSeries", "  const montageRunMaterialReader");
const scratch=path.resolve(__dirname,"../.codex-runtime/ame-title-series-bridge");fs.mkdirSync(scratch,{recursive:true});let checks=0;
function fixture(fault){
  const dir=fs.mkdtempSync(path.join(scratch,"case-")),project=path.join(dir,"source.aep");fs.writeFileSync(project,"offline unchanged source AEP");let copies=0,dispatches=0,persists=0;
  const manifest={targetSpecifier:"ame-26.0",expectedProcess:{pid:77,startedAt:"2026-10-21T00:00:00.000Z"},expectedSessionNonce:null,source:{path:project,sha25664:crypto.createHash("sha256").update(fs.readFileSync(project)).digest("hex")},presetId:"amep_"+"a".repeat(40),presetSha25664:"b".repeat(64),entries:Array.from({length:11},(_,i)=>({sourceGuid:"GUID"+i,outputFileName:i+".mov",range:{startSeconds:0,endSeconds:10}}))};
  manifest.pin={processBinding:"c".repeat(64),presetIdentity:"d".repeat(64)};
  const context=vm.createContext({require:name=>require(path.resolve(__dirname,"../mcp-server",name)),Date,crypto,m100Protocol:protocol,ameTitleSeries:series.createSeries(),amePending:{isPendingRun:r=>r.pending===true},activeEditSession:null,lastPanelInfo:{panelConnectionId:"panel",panelGeneration:"one"},lastPanelSeenAt:Date.now(),currentProposalState:{snapshot:()=>({instanceId:"daemon"})},lifecycle:{epoch:()=>7},productRuntimeCurrent:()=>true,autonomousSession:{authorization:()=>({sessionHash:"session"})},
    m100ProtocolError:(code,message)=>Object.assign(Error(message),{code}),autonomousCommandContext:{run:(_guard,fn)=>fn()},ameFixtureGrant:{TOOL_NAME:"never-fixture"},
    editSessionText:(a,k,v)=>a[k]||v,timestampForFilename:()=>"stamp",EDIT_SESSION_ACTIVE_FILE:"offline",EDIT_SESSION_LOG_FILE:"offline",toolResult:(value,isError=false)=>({value,isError}),firstToolPayload:r=>r.value,operationErrorFromPayload:p=>p?.error,compactCheckpoint:x=>x,
    copySavedProjectFile:async()=>{const file=path.join(dir,"checkpoint-"+(++copies)+".aep");fs.copyFileSync(project,file);if(fault==="actor")context.lastPanelInfo.panelGeneration="changed-during-checkpoint";return {sourceFile:project,destinationFile:file,bytes:fs.statSync(file).size,project:{},createdAt:new Date().toISOString()};},
    persistActiveEditSession:()=>{persists++;if(fault==="persist-first"&&persists===1||fault==="persist-binding"&&persists===2)throw Error("injected persist fault");},appendEditSessionEvent:()=>{},clearActiveEditSession:()=>{},editSessionDetails:s=>s,
    dispatch:()=>{dispatches++;if(fault==="member11"&&dispatches===11)throw Error("injected final member refusal");}
  });
  for(const name of ["startEditSession","finishEditSession","planRunSessionLabel","isUnsavedProjectError","startPlanRunEditSession","finishPlanRunEditSession","compactEditSession","ameTitleSeriesActor","preflightAmeTitleSeries"])vm.runInContext(extract(name),context);
  vm.runInContext(`async function runOne(plan, readOnly=false) {
    const prepared={plan},validation={mutatingCount:readOnly?0:1,steps:plan.steps},mutatingExecution=!readOnly,dryRun=false,lifecycleCompletion=false,boundedPropertyJournal=false,activeEditSessionAtStart=Boolean(activeEditSession),checkpointStepPresent=false,autoEditSession=true,options={},autonomous=null;
    let ameFixturePrimaryBaseline=null,seriesArgs=null,seriesSession=null,createdSeriesSession=null,seriesActor=null;
    const run={id:crypto.randomUUID(),dryRun:false,safety:{protection:activeEditSessionAtStart?'active_edit_session':null},failedCount:0,steps:[]};
    async function finishRun(){${cleanup}return run;}
    ${preflight}
    ${auto}
    ${begin}
    if(!readOnly){try {${reserve}ameTitleSeries.assertDispatch(activeEditSession,seriesArgs,ameTitleSeriesActor(),run.id);dispatch();run.pending=true;}catch(error){run.ok=false;run.errorCode=error.code||error.message;}}
    return finishRun();
  }`,context);
  return {context,manifest,plans:series.buildSeriesPlans(manifest),counts:()=>({copies,dispatches}),dir,project};
}
async function main(){
  const f=fixture(),original=fs.readFileSync(f.project);let checkpointFile,sessionId;
  for(let i=0;i<11;i++){
    const item=f.plans[i],run=await f.context.runOne(item.plan);assert.equal(run.pending,true,JSON.stringify(run));assert.equal(run.editSession.checkpoint.sourceFile,f.project);
    checkpointFile??=run.editSession.checkpoint.checkpointFile;sessionId??=run.editSession.id;assert.equal(run.editSession.checkpoint.checkpointFile,checkpointFile);assert.equal(run.editSession.id,sessionId);
    if(i===0){const owned=f.context.activeEditSession;const read=await f.context.runOne({steps:[{tool:"get_project_info",args:{}}]},true);assert.equal(read.errorCode,undefined);assert.equal(f.context.activeEditSession,owned);const foreign=await f.context.runOne({steps:[{tool:"set_layer_transform",args:{}}]});assert.equal(foreign.errorCode,"ame_title_series_foreign_plan");assert.equal(f.context.activeEditSession,owned);}
  }
  assert.deepEqual(f.counts(),{copies:1,dispatches:11});assert.equal(f.context.activeEditSession,null);assert.deepEqual(fs.readFileSync(f.project),original);assert.equal(fs.readdirSync(f.dir).filter(n=>/^checkpoint-/.test(n)).length,1);checks++;
  for(const fault of ["actor","persist-first","persist-binding","member11"]){const g=fixture(fault);const count=fault==="member11"?11:1;let result;for(let i=0;i<count;i++)result=await g.context.runOne(g.plans[i].plan);assert.equal(g.context.activeEditSession,null,fault);assert.equal(g.counts().copies,1);assert.equal(g.counts().dispatches,fault==="member11"?11:0);assert(result.errorCode||result.error||result.safety.error,fault);checks++;}
  const h=fixture();await h.context.runOne(h.plans[0].plan);const owned=h.context.activeEditSession,foreign={id:crypto.randomUUID(),status:"active",checkpoint:{sourceFile:h.project}};h.context.activeEditSession=foreign;const refused=h.context.finishPlanRunEditSession({id:crypto.randomUUID(),editSession:owned,failedCount:0,steps:[],safety:{}},owned.id);assert.equal(refused,null);assert.equal(h.context.activeEditSession,foreign);checks++;
  console.log(JSON.stringify({ok:true,checks,evidence:"real bridge protection blocks/functions in offline VM: 11 separate runs, one physical fixture copy, START0; actual daemon/native applications not run"}));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
