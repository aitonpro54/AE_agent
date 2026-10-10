"use strict";
// Изолированный HTTP daemon и fake read-only panel. Никогда не evalScript/AE.
const assert = require("assert/strict");
const fs = require("fs"), path = require("path");
const {startDaemon, pollPanel, commandEcho, pause} = require("./network-test-fixture");
const {isProjectInfo, PROJECT_FILE} = require("./fake-project-panel");
const options = {automationToken:"raw-dry-automation-fixture",panelToken:"raw-dry-panel-fixture",devAdmin:false,commandTimeoutMs:1500};
const marker = "__AE_RAW_DRY_RUN_MUST_NOT_EXECUTE__";
const plan = {summary:"Первый raw dry-run без исполнения",risk:"high",requiresCheckpoint:false,
  steps:[{tool:"run_extendscript",args:{script:"throw new Error('"+marker+"');"}}]};
const diagnostic = body => JSON.stringify({ok:body.ok,code:body.code,error:body.run && body.run.error,
  steps:body.run && body.run.steps.map(step=>({tool:step.tool,status:step.status,reason:step.reason}))});
async function main() {
  const fixture = await startDaemon(options), commands = [];
  const request = (route, body) => fixture.request({path:route,body,token:options.panelToken});
  const poll = () => pollPanel(fixture,{panelConnectionId:"raw-dry-offline-panel",panelGeneration:"1",projectFile:PROJECT_FILE});
  async function pump(action) {
    let finished = false;
    const result = Promise.resolve().then(action).finally(()=>{finished=true;});
    result.catch(()=>{});
    const deadline = Date.now()+6000;
    while (!finished) {
      assert(Date.now()<deadline,"Офлайн read-only pump ограничен шестью секундами");
      const response = await poll();
      const command = response.body.command;
      if (!command) {await pause(5);continue;}
      commands.push(command);
      assert(!command.script.includes(marker),"Raw step никогда не отправляется fake panel");
      assert(isProjectInfo(command),"Fixture допускает только get_project_info, без raw/изменений");
      const identity = commandEcho(command);
      assert.equal((await request("/bridge/submitted",identity)).body.ok,true);
      assert.equal((await request("/bridge/result",{...identity,ok:true,
        result:JSON.stringify({ok:true,result:{file:PROJECT_FILE,numItems:0,activeItemName:null}})})).body.ok,true);
    }
    return result;
  }
  const fields = p => ({actionId:p.actionId,payloadRef:p.action.payloadRef,payloadHash:p.action.payloadHash,
    previewHash:p.action.previewHash,riskLevel:p.risk.level,riskPolicyVersion:p.confirmation.riskPolicyVersion,
    confirmationToken:p.confirmation.confirmationToken,confirmedBySurface:p.confirmation.surface,
    confirmedBySession:p.confirmation.sessionId || ""});
  const propose = async (extra={}) => {
    const response = await pump(()=>request("/agents/plan/propose",{plan,repairPlan:false,...extra}));
    assert.equal(response.body.ok,true,diagnostic(response.body));
    return response.body.proposal;
  };
  const run = (p,extra={}) => pump(()=>request("/agents/plan/run",{...fields(p),...extra}));
  try {
    await poll();
    const first = await pump(()=>request("/agents/plan/run",{plan,dryRun:true,allowMutations:true,requestId:"raw-first-dry"}));
    assert.equal(first.body.ok,true,diagnostic(first.body));
    assert.equal(first.body.run.steps[0].status,"ready");
    assert.equal(first.body.run.executedCount,0);
    assert.equal(first.body.run.safety.rawExtendscriptGate.status,"dry-run-approved");
    assert.equal(commands.length,0,"Первый raw dry-run не dispatch-ит даже native reads");
    const filePath=path.join(fixture.runtimeDir,"raw-must-not-be-created.jsx");
    const fileDry=await pump(()=>request("/agents/plan/run",{plan:{...plan,steps:[{tool:"run_extendscript_file",args:{filePath}}]},
      dryRun:true,allowMutations:true,requestId:"raw-file-first-dry"}));
    assert.equal(fileDry.body.ok,true,diagnostic(fileDry.body));
    assert.equal(fileDry.body.run.steps[0].status,"ready");
    assert.equal(fileDry.body.run.executedCount,0);
    assert.equal(commands.length,0,"Raw file dry-run не читает и не dispatch-ит файл");
    assert.equal(fs.existsSync(filePath),false,"Dry-run не создаёт native script file");
    const direct = await pump(()=>request("/agents/plan/run",{plan,dryRun:false,confirm:true,
      allowMutations:true,allowRawExtendscript:true,rawExtendscriptDryRunId:first.body.run.id,requestId:"raw-first-dry"}));
    assert.equal(direct.body.ok,false);
    assert.equal(direct.body.run.errorCode,"m100_confirmation_required");
    const proposal = await propose();
    const beforeDry = await run(proposal,{dryRun:false,confirm:true,allowMutations:true,allowRawExtendscript:true});
    assert.equal(beforeDry.body.ok,false);
    assert.equal(beforeDry.body.run.safety.status,"blocked_raw_extendscript_gate");
    const dry = await run(proposal,{dryRun:true,allowMutations:true});
    assert.equal(dry.body.ok,true,diagnostic(dry.body));
    assert.equal(dry.body.run.executedCount,0);
    assert.equal(dry.body.run.steps[0].status,"ready");
    const noPermit = await run(proposal,{dryRun:false,confirm:true,allowMutations:true,rawExtendscriptDryRunId:dry.body.run.id});
    assert.equal(noPermit.body.ok,false);
    assert.equal(noPermit.body.run.safety.status,"blocked_raw_extendscript_gate");
    const wrongId = await run(proposal,{dryRun:false,confirm:true,allowMutations:true,allowRawExtendscript:true,rawExtendscriptDryRunId:"foreign-dry-run"});
    assert.equal(wrongId.body.ok,false);
    assert.equal(wrongId.body.run.safety.status,"blocked_raw_extendscript_gate");
    const noConfirm=await run(proposal,{dryRun:false,confirm:false,allowMutations:true,allowRawExtendscript:true,rawExtendscriptDryRunId:dry.body.run.id});
    assert.equal(noConfirm.body.ok,false);
    assert.equal(noConfirm.body.run.error,"confirm:true is required to run a plan.");
    const wrongToken=await run(proposal,{dryRun:false,confirm:true,allowMutations:true,allowRawExtendscript:true,
      rawExtendscriptDryRunId:dry.body.run.id,confirmationToken:"confirm_"+"f".repeat(48)});
    assert.equal(wrongToken.body.ok,false);
    assert.equal(wrongToken.body.run.errorCode,"m100_confirmation_token_mismatch");
    const wrongSurface=await run(proposal,{dryRun:false,confirm:true,allowMutations:true,allowRawExtendscript:true,
      rawExtendscriptDryRunId:dry.body.run.id,confirmedBySurface:"mcp"});
    assert.equal(wrongSurface.body.ok,false);
    assert.equal(wrongSurface.body.run.errorCode,"m100_confirmation_surface_mismatch");
    for (const key of ["payloadHash","previewHash"]) {
      const mismatch = await run(proposal,{dryRun:false,confirm:true,allowMutations:true,allowRawExtendscript:true,
        rawExtendscriptDryRunId:dry.body.run.id,[key]:"f".repeat(64)});
      assert.equal(mismatch.body.ok,false);
      assert.equal(mismatch.body.code,"m100_"+(key === "payloadHash" ? "payload" : "preview")+"_hash_mismatch");
    }
    const newer = await propose();
    const superseded = await run(proposal,{dryRun:true});
    assert.equal(superseded.body.ok,false);
    assert.equal(superseded.body.code,"plan_superseded");
    const reusedDry = await run(newer,{dryRun:false,confirm:true,allowMutations:true,allowRawExtendscript:true,rawExtendscriptDryRunId:dry.body.run.id});
    assert.equal(reusedDry.body.ok,false);
    assert.equal(reusedDry.body.run.safety.status,"blocked_raw_extendscript_gate");
    const expiring = await propose({ttlMs:1000});
    await pause(1050);
    const expired = await run(expiring,{dryRun:true});
    assert.equal(expired.body.ok,false);
    assert.equal(expired.body.code,"m100_action_proposal_expired");
    assert(commands.every(isProjectInfo),"Только synthetic read-only project captures");
    console.log(JSON.stringify({ok:true,live:false,rawDispatches:0,firstDryRunDispatches:0,
      cases:["first-inline-and-file-dry-run","server-proposal-required","matching-dry-run-required","raw-permit-required",
        "manual-confirmation-token-surface","payload-preview-mismatch","superseded-proposal","expired-proposal"]}));
  } finally {await fixture.stop();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
