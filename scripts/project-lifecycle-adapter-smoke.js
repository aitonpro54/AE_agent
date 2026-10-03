"use strict";
const assert=require("assert/strict"),fs=require("fs");
const {fixture}=require("./project-lifecycle-fixture");
const {createProposalState,CONTRACT_VERSION}=require("../mcp-server/proposal-state");
const save=require("../mcp-server/project-save");
const c=require("../mcp-server/project-lifecycle-contract");
const m=require("../mcp-server/project-intent-memory");
const {createLifecycleBridgeAdapter}=require("../mcp-server/project-lifecycle-bridge-adapter");
async function setup(fn) {
  const f=fixture();
  try {
    const proposals=createProposalState(),plan={targetProject:{file:f.source},steps:[{tool:"save_project_as",args:f.args()}]};
    const record={actionId:"adapter-action",payload:{plan},payloadHash:c.hash(plan),executionState:"pending",proposalExpiresAt:new Date(Date.now()+60000).toISOString()};
    proposals.register(record);proposals.bindProject(record,f.source);
    const run={id:"adapter-run",dryRun:false};
    const adapter=createLifecycleBridgeAdapter({storage:f.storage,proposals,readNative:f.deps.readNative,
      sourceCheckpoint:f.deps.sourceCheckpoint,isIdle:()=>true,verifyDryRun:(r,n)=>save.verifyDryRunReceipt(r,n,CONTRACT_VERSION),
      retireContext:async(saved,hints)=>{proposals.retireLifecycle(saved.record,saved.run.id,hints.transitionId);
        return {sessionClosed:true,proposalRetired:true,cachesInvalidated:true,desiredEnabledPreserved:true};}});
    await adapter.preflight(plan,record,true);
    record.dryRunCompletedAt=new Date().toISOString();
    record.dryRunReceipt={payloadHash:record.payloadHash,contractVersion:CONTRACT_VERSION,stepCount:1,projectFile:f.source};
    record.confirmedBySurface="cep-panel";record.executionState="executing";record.executionId=run.id;
    await fn({f,proposals,plan,record,run,adapter});
  } finally { f.dispose(); }
}
async function main() {
  await setup(async({f,plan,record,run,adapter,proposals})=>{
    assert(!f.calls.some(call=>!call.readOnly),"Dry-run preflight must only observe");
    for(const forged of [{confirm:true},Object.freeze({manual:true}),{record,run}])
      await assert.rejects(adapter.execute("save_project_as",f.args(),forged),e=>e.code==="lifecycle_manual_authorization_required");
    assert.throws(()=>adapter.issueContext({record,run,plan,manual:false}),e=>e.code==="lifecycle_manual_authorization_required");
    const context=adapter.issueContext({record,run,plan,manual:true,ownedSessionId:"adapter-session"});
    const bytes=fs.readFileSync(f.source);
    const receipt=await adapter.execute("save_project_as",f.args(),context);
    c.verifyReceipt(receipt);assert.equal(receipt.contextRetired,true);
    assert(fs.readFileSync(f.source).equals(bytes));
    assert.equal(record.project.expectedFile,f.source);
    assert.throws(()=>proposals.assertCurrent(record),e=>e.code==="plan_project_lifecycle_retired");
    await assert.rejects(adapter.execute("save_project_as",plan.steps[0].args,context));
    assert.throws(()=>adapter.validateCommand({phase:"open_final"},"app.open()"),e=>e.code==="lifecycle_phase_capability_required");
  });
  await setup(async({f,plan,record,run,adapter})=>{
    const context=adapter.issueContext({record,run,plan,manual:true});
    const store=f.storage.load();store.projectState[m.projectStateKey(f.source)].revision++;
    fs.writeFileSync(f.statePath,JSON.stringify(store));
    await assert.rejects(adapter.execute("save_project_as",f.args(),context),e=>e.code==="lifecycle_dry_run_pins_changed");
    assert(!f.calls.some(call=>!call.readOnly));
  });
  await setup(async({f,plan,record,run,adapter})=>{
    assert.throws(()=>adapter.planStep({...plan,steps:[...plan.steps,{tool:"get_project_info",args:{}}]}),e=>e.code==="lifecycle_terminal_plan_required");
    assert.throws(()=>adapter.planStep({...plan,targetProject:{file:f.target}}),e=>e.code==="lifecycle_source_plan_mismatch");
    const context=adapter.issueContext({record,run,plan,manual:true});
    record.dryRunReceipt.payloadHash=c.hash("stale");
    await assert.rejects(adapter.execute("save_project_as",f.args(),context),e=>e.code==="project_save_dry_run_stale");
    assert(!f.calls.some(call=>!call.readOnly));
    const state=await adapter.readState();
    assert.equal(state.file,f.source);assert.equal(state.revision,7);
  });
  console.log("lifecycle adapter: PASS; emitted native phases, private manual contexts, stale dry-run/policy refusal, source-bound retirement.");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
