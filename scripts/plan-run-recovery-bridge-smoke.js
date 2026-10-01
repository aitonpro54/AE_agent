"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {startDaemon,pollPanel,commandEcho,pause}=require("./network-test-fixture");
const {createProject}=require("./placeholder-protection-fixture");
const records=require("../mcp-server/plan-run-records");
async function main(){
  const project=createProject();let writes=0;
  let fixture=await startDaemon({automationToken:"recovery-auto",panelToken:"recovery-panel",adminToken:"recovery-admin",devAdmin:true,commandTimeoutMs:700,
    setupRuntime(runtime){fs.writeFileSync(path.join(runtime,"logs","edit-session-active.json"),JSON.stringify({id:"synthetic-session",status:"active",checkpoint:{sourceFile:"C:/Synthetic/Protected.aep"},operations:[]}));}});
  const post=(route,body,token=fixture.panelToken)=>fixture.request({path:route,token,body,timeoutMs:15000});
  const logRoot=()=>path.join(fixture.runtimeDir,"logs");
  function commandRole(id){const dir=path.join(logRoot(),"evidence","plan-runs");if(!fs.existsSync(dir))return null;for(const file of fs.readdirSync(dir)){const value=JSON.parse(fs.readFileSync(path.join(dir,file),"utf8")).record;for(const step of value.run.steps || [])for(const command of step.commands || [])if(command.id===id)return {command,step};}return null;}
  async function withPanel(action,mode="normal"){
    let done=false,response,error,held=false;await pollPanel(fixture,{projectFile:"C:/Synthetic/Protected.aep"});
    const pending=action().then(value=>{response=value;done=true;},value=>{error=value;done=true;});
    const end=Date.now()+12000;
    while(!done && Date.now()<end){
      if(mode==="queued" && !held){const dir=path.join(logRoot(),"evidence","plan-runs");if(fs.existsSync(dir) && fs.readdirSync(dir).some(file=>{const record=JSON.parse(fs.readFileSync(path.join(dir,file),"utf8")).record;return !record.run.finishedAt && (record.run.steps || []).some(step=>(step.commands || []).some(row=>row.role==="mutation" && row.state==="queued"));})){held=true;await pause(850);continue;}}
      const polled=await pollPanel(fixture,{projectFile:"C:/Synthetic/Protected.aep"});const command=polled.body.command;
      if(command){const role=commandRole(command.id);const echo=commandEcho(command);assert.equal((await post("/bridge/submitted",echo)).status,200);
        const result=project.execute(command.script);
        if(command.script.includes('app.beginUndoGroup("Codex Set Layer Transform")'))writes++;
        if(!held && (mode==="after_apply" && role && role.command.role==="mutation" || mode==="readback_timeout" && role && role.command.role==="readback" && role.step.mutationResult)) {held=true;continue;}
        const posted=await post("/bridge/result",{...echo,ok:true,result:JSON.stringify(result)});assert.equal(posted.status,200,posted.text);
        if(mode==="queued") await pause(20);
      }else await pause(10);
    }
    await pending;if(error)throw error;assert(done,"fixture action timed out");return response;
  }
  async function run(args,mode,additionalSteps=[]){const plan={summary:"Synthetic timeout recovery",risk:"high",requiresCheckpoint:true,targetProject:{file:"C:/Synthetic/Protected.aep"},steps:[{tool:"set_layer_transform",args:{compItemIndex:1,layerIndex:1,expectedCompItemId:10,expectedLayerId:11,...args}},...additionalSteps]};
    const proposed=await withPanel(()=>post("/agents/plan/propose",{plan}));assert(proposed.body.proposal,proposed.text);const proposal=proposed.body.proposal;
    const response=await withPanel(()=>post("/agents/plan/run",{actionId:proposal.actionId,payloadHash:proposal.action.payloadHash,previewHash:proposal.action.previewHash,riskLevel:proposal.risk.level,riskPolicyVersion:proposal.confirmation.riskPolicyVersion,confirmationToken:proposal.confirmation.confirmationToken,confirmedBySurface:proposal.confirmation.surface,dryRun:false,confirm:true,allowMutations:true}),mode);
    assert(response.body.run,response.text);return response.body.run;
  }
  async function reconcile(id,extra={}){const response=await withPanel(()=>post("/dev/tool/reconcile_plan_run",{runId:id,...extra},fixture.adminToken));assert.equal(response.status,200,response.text);return response.body.result && response.body.result.content ? JSON.parse(response.body.result.content[0].text) : response.body.result;}
  try{
    const catalog=await fixture.request({path:"/tools",token:fixture.automationToken});assert(catalog.body.tools.some(tool=>tool.name==="reconcile_plan_run"));assert(catalog.body.tools.some(tool=>tool.name==="get_property_value"));
    const run1=await run({position:[10,20]},"after_apply");assert.equal(writes,1);assert.equal(run1.outcome.mutation.status,"unknown");assert(/timed.*out|timeout|unknown/.test(run1.errorCode),run1.errorCode);
    const original=records.readRecord(logRoot(),run1.id);assert(!original.unavailable);assert(original.run.steps[0].commands.some(row=>row.role==="mutation" && row.timedOutFrom==="submitted"));
    project.change('items.unshift(new CompItem(900,"Shift"));child._layers.reverse();target.index=2;other.index=1;');
    const checked=await reconcile(run1.id);assert.equal(checked.steps[0].mutationStatus,"applied",JSON.stringify(checked));assert.equal(checked.replayAllowed,false);assert.equal(writes,1);assert(checked.originalError,JSON.stringify(checked));
    project.change('target.property("ADBE Transform Group").property("ADBE Position").value=[99,99];');const drift=await reconcile(run1.id);assert.equal(drift.steps[0].mutationStatus,"unknown");assert.equal(writes,1);
    project.change('target.property("ADBE Transform Group").property("ADBE Position").value=[10,20];');
    const run2=await run({scale:[90,90]},"readback_timeout");assert.equal(run2.outcome.mutation.status,"applied",JSON.stringify(run2.outcome));assert.equal(run2.outcome.verification.status,"pending",JSON.stringify(run2.outcome));assert.equal(writes,2);assert.equal((await reconcile(run2.id)).steps[0].mutationStatus,"applied");assert.equal(writes,2);
    const run3=await run({position:[30,40]},"queued");assert.equal(writes,2);assert.equal(run3.outcome.mutation.status,"not_started",JSON.stringify(run3));assert.equal((await reconcile(run3.id)).steps[0].mutationStatus,"not_applied");
    project.change('target.property("ADBE Transform Group").property("ADBE Scale").fail=true;');const run4=await run({position:[21,22],scale:[50,50]},"normal");assert.equal(run4.outcome.mutation.status,"unknown",JSON.stringify(run4));assert.equal((await reconcile(run4.id)).steps[0].mutationStatus,"unknown");assert.equal(writes,3);assert.deepEqual(project.read("undo.slice(-2)"),["begin","end"]);project.change('target.property("ADBE Transform Group").property("ADBE Scale").fail=false;');
    const missing=await reconcile(crypto.randomUUID());assert.equal(missing.status,"unknown");assert.equal(missing.reasonCode,"run_record_missing");
    const file=records.fileFor(logRoot(),run4.id);const saved=fs.readFileSync(file,"utf8");fs.writeFileSync(file,'{"record":{}}');assert.equal((await reconcile(run4.id)).reasonCode,"run_record_invalid");fs.writeFileSync(file,saved);
    project.change('app.project.file.fsName="C:/Synthetic/Other.aep";');assert.equal((await reconcile(run1.id)).steps[0].mutationStatus,"unknown");project.change('app.project.file.fsName="C:/Synthetic/Protected.aep";');
    const runtime=fixture.runtimeDir;await fixture.stop(false);fixture=await startDaemon({runtimeDir:runtime,automationToken:"recovery-auto",panelToken:"recovery-panel",adminToken:"recovery-admin",devAdmin:true,commandTimeoutMs:700});
    assert.equal((await reconcile(run2.id)).steps[0].mutationStatus,"applied");assert.equal(writes,3);assert.equal(records.readRecord(logRoot(),run1.id).run.errorCode,run1.errorCode);
    const multi=await run({position:[31,32]},"normal",[{tool:"set_layer_time_range",args:{compItemIndex:1,layerIndices:[1],expectedCompItemId:10,expectedLayerId:11,startTime:0,inPoint:0,outPoint:4}}]);
    const multiChecked=await reconcile(multi.id);assert.equal(multiChecked.steps.length,2);assert(multiChecked.steps.every(step=>step.mutationStatus==="applied"),JSON.stringify(multiChecked));assert.equal(writes,4);
    const forged=await withPanel(()=>post("/dev/tool/reconcile_plan_run",{runId:run1.id,plan:{steps:[]}},fixture.adminToken));assert.equal(forged.status,500);
    console.log("PASS: ordinary isolated daemon submitted timeout after write, queued cancellation, readback timeout, partial setter, drift/project/missing/corrupt/restart records; reconcile readonly/no replay, AE0.");
  }finally{await fixture.stop();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
