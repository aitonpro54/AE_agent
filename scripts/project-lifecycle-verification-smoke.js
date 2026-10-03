"use strict";
const assert=require("assert/strict"),crypto=require("crypto");
const c=require("../mcp-server/project-lifecycle-contract"),t=require("../mcp-server/project-lifecycle-transition");
const {createProjectLifecycleService}=require("../mcp-server/project-lifecycle-service");
const {verifyLifecycleStep,nativeResult}=require("../mcp-server/project-lifecycle-verification");
const {buildSemanticVerification}=require("../mcp-server/semantic-verification");
const {fixture}=require("./project-lifecycle-fixture");
async function main() {
  const f=fixture();
  try {
    const commands=[],args=f.args();
    const service=createProjectLifecycleService({...f.deps,readNative:async(script,cap)=>{
      const id=crypto.randomUUID(),facts=t.phaseCapabilityFacts(cap);
      t.validateCommandCapability(cap,{rawScript:script,commandId:id});
      const result=await f.deps.readNative(script,cap);
      commands.push({id,executionId:"fixture-run",role:facts.readOnly?"readback":"mutation",state:"completed",ok:true,
        completedAt:new Date().toISOString(),result});return result;
    }});
    const receipt=await service.execute("save_project_as",args,f.context);
    const step={index:1,tool:"save_project_as",args,status:"completed",mutatesProject:true,result:{ok:true,lifecycleReceipt:receipt},commands};
    const plan={targetProject:{file:f.source},steps:[{tool:step.tool,args}]};
    const run={id:"fixture-run",ok:true,dryRun:false,provenance:{actionId:"fixture-action",payloadHash:c.hash("fixture-plan")},steps:[step]};
    const valid=verifyLifecycleStep(step,run);
    assert(valid.reads.length>0);
    const report=buildSemanticVerification(plan,run);
    assert.equal(report.status,"passed",JSON.stringify(report));
    assert.equal(report.verificationScope,"project_lifecycle_native_and_disk_proof");
    assert(report.readBackCount>0);assert.equal(report.acceptance,"not_established");
    const clone=v=>JSON.parse(JSON.stringify(v));
    const deny=mutate=>{const copy=clone(run);mutate(copy.steps[0],copy);
      assert.notEqual(buildSemanticVerification(plan,copy).status,"passed");};
    deny(s=>delete s.commands);
    deny(s=>s.commands.push(s.commands[0]));
    deny(s=>s.result.lifecycleReceipt.authorization.runId="foreign-run");
    deny(s=>s.result.lifecycleReceipt.authorization.payloadHash=c.hash("foreign-plan"));
    deny(s=>s.args.targetProjectFile=f.source);
    deny(s=>s.args.expectedSourceRevision=999);
    deny(s=>s.args.expectedSourceDirty=!s.args.expectedSourceDirty);
    deny(s=>s.result.lifecycleReceipt.sourceAfter.sha256=c.hash("source drift"));
    deny(s=>s.result.lifecycleReceipt.artisticAccepted=true);
    deny(s=>{for(const row of s.commands)if(row.role==="readback")row.ok=false;});
    deny(s=>{for(const row of s.commands)if(row.role==="readback")row.executionId="foreign-run";});
    deny(s=>{for(const row of s.commands)if(row.role==="readback")row.result={ok:false,result:row.result};});
    deny(s=>{for(const row of s.commands){try{const raw=nativeResult(row.result);if(raw.native && raw.native.file===f.target)raw.native.revision++;}catch(_){}}});
    deny(s=>{for(const row of s.commands){try{const raw=nativeResult(row.result);if(raw.items && raw.native.file===f.target)raw.items[0].mainFile.path+="-drift";}catch(_){}}});
    const missingProof=clone(run);missingProof.steps[0].result={ok:true,saved:true};
    assert.notEqual(buildSemanticVerification(plan,missingProof).status,"passed");
    const tagged=clone(run);tagged.provenance.payloadHash="sha256:"+tagged.provenance.payloadHash;
    assert.equal(buildSemanticVerification(plan,tagged).status,"passed");
    assert.throws(()=>c.canonicalPlanHash("sha512:"+c.hash("wrong")));
    console.log("lifecycle verification: PASS; command-backed native proof, exact run/input pins, malformed/foreign/stale/partial denials.");
  } finally { f.dispose(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
