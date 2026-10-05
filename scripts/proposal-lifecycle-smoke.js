"use strict";
// Actual proposal/wait state and extracted runner final publication. No daemon or AE.
const assert=require("assert/strict"),fs=require("fs"),path=require("path"),vm=require("vm");
const {createProposalState,obstacleEvent,CONTRACT_VERSION}=require("../mcp-server/proposal-state");
const {waitForPlanState}=require("../mcp-server/operation-wait");
let checks=0;
const SOURCE="C:/Synthetic/Source.aep",TARGET="C:/Synthetic/Target.aep",FROZEN="2026-10-05T14:01:41.729Z";
function proposal(id,file=SOURCE) {return {actionId:id,payload:{plan:{targetProject:{file},steps:[]}},executionState:"pending",proposalExpiresAt:"2099-01-01T00:00:00.000Z"};}
function summary(run) {return {id:run.id,ok:run.ok,dryRun:run.dryRun,errorCode:run.ok?"ok":"late_failure",executedCount:1,failedCount:run.ok?0:1,verification:run.ok?"passed":"needs_review"};}
function finished(id,ok=true,dryRun=false) {return {id,ok,dryRun,finishedAt:FROZEN};}
function start(state,record,id="life-run") {record.executionState="executing";record.executionId=id;state.bindProject(record,SOURCE);}
function pins(state) {const s=state.snapshot();return {actionId:s.actionId,instanceId:s.instanceId,revision:s.revision,waitMs:0};}
const daemon=fs.readFileSync(path.join(__dirname,"../mcp-server/bridge-daemon.js"),"utf8");
const begin=daemon.indexOf("  function finishRun() {"),end=daemon.indexOf("\n  if (!validation.ok)",begin);
assert(begin>0&&end>begin);
const finishSource=daemon.slice(begin,end);
assert(!finishSource.includes('actionRecord.executionState = run.ok ? "completed" : "failed"'),"No early terminal assignment");
assert(finishSource.indexOf("publishRunResult(")>finishSource.indexOf("const lastRunSummary ="));
assert(finishSource.indexOf("publishRunResult(")>finishSource.indexOf("persistRun(null, true)"));
function runner(state,record,options={}) {
  const events=[],run={id:options.runId||record.executionId||"dry-run",dryRun:options.dryRun===true,ok:true,startedAt:FROZEN,
    failedCount:0,executedCount:1,steps:[],safety:{}};
  const snapshot=()=>{const s=state.snapshot();return {state:s.state,lastRun:s.lastRun&&{...s.lastRun}};};
  const mark=where=>events.push({where,...snapshot()});
  class FrozenDate extends Date {constructor(...args){super(...(args.length?args:[FROZEN]));}static now(){return Date.parse(FROZEN);}}
  const scope={run,currentProposalState:state,Date:FrozenDate,prepared:{plan:record.payload.plan},validation:{mutatingCount:1,steps:[{}]},
    autonomous:null,internalReadOnly:false,dryRun:run.dryRun,responseView:"full",provenance:{runtime:{}},RUNTIME_IDENTITY:{},AUTONOMY_CONTRACT_VERSION:CONTRACT_VERSION,
    options:{_m100ActionRecord:record,_m100ActionProposal:{actionId:record.actionId,action:{payloadHash:"fixture-hash",previewHash:"fixture-preview"},confirmation:{}}},
    buildServerSemanticVerification:()=>{mark("semantic");return {status:"passed",unverifiedMutationCount:0};},
    verifySolutionPlanReadBack:()=>{mark("readback_tail");if(options.fail){run.error="late semantic failure";run.errorCode="semantic_verification_failed";}return {status:options.fail?"needs_review":"passed"};},
    rawExtendscriptStepCount:()=>0,recordRawExtendscriptDryRunApproval:()=>null,planRunRecoveryHint:()=>"fresh inspection required",
    m100ActionRecordState:r=>r.executionState,m100Protocol:{createActionResultEnvelope:v=>v,redactForUserDiagnostic:(v,max)=>String(v).slice(0,max)},
    m100PlanRunFailurePhase:()=>"verification",m100PlanRunFailureCode:r=>r.errorCode,m100PlanRunRawPreview:()=>null,
    attachM100PlanRunDiagnostic:()=>{},buildRunOutcome:r=>({ok:r.ok}),solutionDiscovery:{reviewedIds:()=>[]},reuseTelemetry:{summarizeRun:()=>({})},
    recordEvent:()=>mark("telemetry"),obstacleEvent,fs:{appendFileSync:()=>{}},path,LOG_DIR:"unused-fixture",
    autonomousRepair:{directive:()=>null},persistRun:()=>{mark("persistence");if(options.persistFail)throw new Error("injected record fault");},planRunResponse:{}};
  const finish=vm.runInNewContext("("+finishSource.trim()+")",scope);
  return {run,events,finish};
}
async function main() {
  for(const fail of [false,true]) {
    const state=createProposalState(),record=proposal("life-"+fail);state.register(record);
    record.lastRun=summary(finished("old-dry-run",true,true));record.dryRunCompletedAt=FROZEN;
    start(state,record);const before={...record.project},oldSummary={...record.lastRun};
    assert.throws(()=>state.retireLifecycle({...record},"life-run","transition-1"),e=>e.code==="plan_superseded");
    assert.throws(()=>state.retireLifecycle(record,"foreign-run","transition-1"),e=>e.code==="plan_execution_owner_changed");
    assert.throws(()=>state.retireLifecycle(record,"life-run","../bad"),e=>e.code==="invalid_lifecycle_retirement");checks+=3;
    let release;const tail=new Promise(resolve=>{release=resolve;}),actual=runner(state,record,{fail});
    const execution=(async()=>{state.retireLifecycle(record,"life-run","transition-1");await tail;return actual.finish();})();
    assert.equal(record.executionState,"executing");assert.equal(record.executionId,"life-run");assert.deepEqual(record.project,before);
    assert(Object.isFrozen(record.lifecycleRetired));assert.equal(state.snapshot().lifecycleRetired.transitionId,"transition-1");
    assert.throws(()=>state.assertCurrent(record),e=>e.code==="plan_project_lifecycle_retired");
    assert.throws(()=>state.assertExecution({actionId:record.actionId,executionId:"life-run",proposalExpiresAt:record.proposalExpiresAt}),e=>e.code==="plan_project_lifecycle_retired");
    assert.throws(()=>state.retireLifecycle(record,"life-run","transition-1"),e=>e.code==="plan_project_lifecycle_retired");checks+=3;
    // Native/store checkpoint may complete while the runner's tail remains held.
    for(const window of ["post_retirement_read","post_commit_read","semantic_tail"]) {
      const current=state.snapshot();assert.equal(current.state,"executing",window);assert.deepEqual(current.lastRun,oldSummary);
      const waiting=await waitForPlanState(()=>state.snapshot(),pins(state));assert.equal(waiting.status,"executing");assert.equal(waiting.timedOut,true);assert.equal(waiting.lastRun.dryRun,true);
      const completed=await waitForPlanState(()=>state.snapshot(),{...pins(state),targetStates:["completed","failed"]});assert.equal(completed.status,"executing");assert.equal(completed.timedOut,true);
      assert.throws(()=>state.register(proposal("premature-"+window,TARGET)),e=>e.code==="plan_execution_in_progress");checks+=3;
    }
    assert.equal(state.publishRunResult({...record},finished("life-run"),summary(finished("life-run"))),false);
    assert.equal(state.publishRunResult(record,finished("foreign-run"),summary(finished("foreign-run"))),false);
    delete record.executionId;assert.equal(state.publishRunResult(record,finished("life-run"),summary(finished("life-run"))),false);record.executionId="life-run";
    assert.deepEqual(record.lastRun,oldSummary);checks+=2;
    release();const result=await execution;
    const terminal=fail?"failed":"completed";
    assert.equal(result.ok,!fail);assert.equal(record.executionState,terminal);assert.equal(record.lastRun.id,"life-run");assert.equal(record.lastRun.dryRun,false);
    assert.equal(record.lastRun.ok,!fail);assert.equal(record.lastRun.verification,fail?"needs_review":"passed");assert.equal(result.m100Action.confirmationState,terminal);
    assert.equal(record.lifecycleRetired.transitionId,"transition-1");assert.deepEqual(record.project,before);
    assert(actual.events.every(event=>event.state==="executing"&&event.lastRun.id==="old-dry-run"),JSON.stringify(actual.events));
    const observed=await waitForPlanState(()=>state.snapshot(),pins(state));assert.equal(observed.status,terminal);assert.equal(observed.timedOut,false);assert.equal(observed.lastRun.id,"life-run");assert.equal(observed.lastRun.dryRun,false);checks++;
    const next=proposal("next-"+fail,TARGET);state.register(next);state.bindProject(next,TARGET);state.assertCurrent(next);
    assert.throws(()=>state.bindProject(next,SOURCE),e=>e.code==="project_target_mismatch");state.bindProject(next,TARGET);
    next.lastRun=summary(finished("next-dry",true,true));const nextBefore=JSON.stringify(state.snapshot());
    assert.equal(state.publishRunResult(record,finished("life-run",false),summary(finished("life-run",false))),false);
    const late=runner(state,record,{fail:true});late.finish();assert.equal(JSON.stringify(state.snapshot()),nextBefore);checks+=2;
  }
  // Completed historical retirement stays historical and does not regain authority.
  {
    const state=createProposalState(),historical=proposal("historical");historical.executionState="completed";historical.executionId="old-finished";
    historical.lifecycleRetired=Object.freeze({transitionId:"old-transition",retiredAt:FROZEN});historical.lastRun=summary(finished("old-finished"));state.register(historical);
    const before=JSON.stringify(state.snapshot());assert.equal(state.snapshot().state,"completed");
    assert.equal(state.publishRunResult(historical,finished("old-finished",false),summary(finished("old-finished",false))),false);assert.equal(JSON.stringify(state.snapshot()),before);
    assert.throws(()=>state.assertCurrent(historical),e=>e.code==="plan_project_lifecycle_retired");state.register(proposal("after-history",TARGET));checks++;
  }
  // Ordinary dry-run/non-lifecycle result states retain their existing contract.
  {
    const state=createProposalState(),record=proposal("ordinary");state.register(record);
    const dry=runner(state,record,{dryRun:true,runId:"dry-current"});dry.finish();assert.equal(state.snapshot().state,"dry_run_passed");assert.equal(record.lastRun.id,"dry-current");assert.equal(record.lastRun.dryRun,true);
    start(state,record,"ordinary-run");const run=runner(state,record);run.finish();assert.equal(record.executionState,"completed");assert.equal(record.lastRun.id,"ordinary-run");assert.equal(record.lastRun.dryRun,false);checks++;
  }
  // Persist warning retains the previous result contract; no store contract changes.
  {
    const state=createProposalState(),record=proposal("persist-fault");state.register(record);start(state,record);state.retireLifecycle(record,"life-run","transition-2");
    const actual=runner(state,record,{persistFail:true}),result=actual.finish();assert.equal(result.recordWarning,"run_record_update_failed");assert.equal(record.executionState,"completed");assert.equal(record.lastRun.id,"life-run");checks++;
  }
  {
    const state=createProposalState(),record=proposal("invalid-summary");state.register(record);start(state,record);record.lastRun=summary(finished("old-dry",true,true));
    const before=JSON.stringify(state.snapshot());assert.throws(()=>state.publishRunResult(record,finished("life-run"),summary(finished("wrong-summary"))),e=>e.code==="invalid_plan_run_publication");assert.equal(JSON.stringify(state.snapshot()),before);checks++;
  }
  console.log("proposal lifecycle: PASS",checks,"retirement/held tail/actual finishRun/wait/late failure/owner/frozen-clock checks; no live daemon or AE");
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
