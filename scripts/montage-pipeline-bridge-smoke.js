#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {spawn}=require("node:child_process");
const readline=require("node:readline");
const { startDaemon, pollPanel, commandEcho, pause,isolatedEnvironment } = require("./network-test-fixture");
const { createMontageNativeFixture } = require("./montage-native-fixture");
const { summarizeMontagePipeline } = require("../mcp-server/montage-pipeline-summary");
const {mediaKeyForSource} = require("../mcp-server/placeholder-usage");
const projectMemory = require("../mcp-server/project-intent-memory");
const planRunRecords = require("../mcp-server/plan-run-records");
const {technicalFacts,recordBinding} = require("../mcp-server/montage-run-bindings");
const {guardMontagePlan} = require("../mcp-server/montage-plan-guard");
const {computeUnitContentHash} = require("../mcp-server/montage-pipeline");
const {deepClone} = require("../mcp-server/montage-contract");
const {normalizeBudgets} = require("../mcp-server/montage-contract");
const {boundedMaterialReader} = require("../mcp-server/montage-pipeline-service");
const {buildMontagePipelinePlan} = require("../mcp-server/montage-pipeline-service");
const {buildPostRunReadBack} = require("../mcp-server/montage-postread");
const {verifyPlaceholderReadBack} = require("../mcp-server/placeholder-readback");
const {verifyPlaceholderCoverage} = require("../mcp-server/placeholder-framing");

async function main() {
  const nativeFixture = createMontageNativeFixture();
  let nativeCommands = 0, nativeHook = null, negativeCases = 0;
  let mcpChild=null,mcpId=0;
  const mcpPending=new Map();

  const fixture = await startDaemon({
    automationToken: "montage-auto",
    panelToken: "montage-panel",
    adminToken: "montage-admin",
    devAdmin: true,
    commandTimeoutMs: 5000,
    setupRuntime(runtime) {
      const key=nativeFixture.manifest.project.projectKey;
      fs.writeFileSync(path.join(runtime,"state","project-intent-state.json"),JSON.stringify({schema:projectMemory.PROJECT_STATE_SCHEMA,projectState:{[key]:{
        projectFile:nativeFixture.projectFilePath,projectKey:key,revision:0,acceptedPlaceholders:[],constraints:null,reviewArtifacts:{},
        groupMappings:[...nativeFixture.preparedMaterials.materials.map((m,i)=>({mediaKey:mediaKeyForSource({itemId:m.sourceItemId,file:m.path,type:"footage"}),groupId:`grp_0${i+1}`,provenance:"user_confirmed",confirmed:true})),
          {mediaKey:mediaKeyForSource({type:"footage",file:nativeFixture.fileCPath}),groupId:"grp_initial",provenance:"user_confirmed",confirmed:true}]
      }}}));
      fs.writeFileSync(path.join(runtime, "logs", "edit-session-active.json"), JSON.stringify({
        id: "montage-synthetic-session",
        status: "active",
        checkpoint: { sourceFile: nativeFixture.projectFilePath },
        operations: []
      }));
    }
  });

  const post = (route, body, token = fixture.panelToken) =>
    fixture.request({ path: route, token, body, timeoutMs: 30000 });

  async function withPanel(action) {
    let done = false, response, error;
    await pollPanel(fixture, { projectFile: nativeFixture.read("app.project.file.fsName") });
    const pending = action().then(
      value => { response = value; done = true; },
      value => { error = value; done = true; }
    );
    const deadline = Date.now() + 35000;

    while (!done && Date.now() < deadline) {
      const polled = await pollPanel(fixture, { projectFile: nativeFixture.read("app.project.file.fsName") });
      const command = polled.body.command;
      if (!command) {
        await pause(10);
        continue;
      }

      const script = command.script;
      nativeCommands++;
      if(nativeHook)nativeHook(script);
      const echo = commandEcho(command);
      assert.equal((await post("/bridge/submitted", echo)).status, 200);

      let raw;
      try {
        raw = nativeFixture.execute(script);
      } catch (scriptErr) {
        raw = { ok: false, error: scriptErr.message };
      }

      const result = await post("/bridge/result", { ...echo, ok: true, result: JSON.stringify(raw) });
      assert.equal(result.status, 200, result.text);
    }

    assert(done, "Bounded fake panel deadline exceeded");
    await pending;
    if (error) throw error;
    return response;
  }

  async function call(name, args = {}, isError = false) {
    const response = await withPanel(() =>
      post("/tools/call", { name, arguments: args }, fixture.automationToken)
    );
    assert.equal(response.status, 200, response.body?.code || "tool_http_error");
    const result = response.body.result;
    const payload=JSON.parse(result.content[0].text);
    assert.equal(Boolean(result.isError), isError,JSON.stringify({code:payload.code,blockers:payload.blockers?.map(b=>b.code)}));
    return payload;
  }
  const rpc=(method,params)=>new Promise((resolve,reject)=>{
    const id=++mcpId,timer=setTimeout(()=>{mcpPending.delete(id);reject(new Error(`MCP fixture timeout: ${method}`));},30000);
    mcpPending.set(id,{resolve,reject,timer});mcpChild.stdin.write(JSON.stringify({jsonrpc:"2.0",id,method,params})+"\n");
  });
  async function mcpCall(name,args,isError=false) {
    const result=await withPanel(()=>rpc("tools/call",{name,arguments:args})),payload=JSON.parse(result.content[0].text);
    assert.equal(Boolean(result.isError),isError,payload.code || payload.errorCode);
    return payload;
  }

  try {
    // 1. Tool catalog verification
    const catalog = await fixture.request({ path: "/tools", token: fixture.automationToken });
    const toolNames = new Set(catalog.body.tools.map(tool => tool.name));
    assert.ok(toolNames.has("build_montage_pipeline_plan"), "Tool catalog must include build_montage_pipeline_plan");

    // 2. Client authority rejection tests
    const clientObsTest = await call("build_montage_pipeline_plan", {
      manifest: nativeFixture.manifest,
      preparedMaterials: nativeFixture.preparedMaterials,
      observations: { some: "client_data" }
    }, true);
    assert.equal(clientObsTest.code, "client_authority_forbidden");

    const clientUsageTest = await call("build_montage_pipeline_plan", {
      manifest: nativeFixture.manifest,
      preparedMaterials: nativeFixture.preparedMaterials,
      usage: { some: "usage_data" }
    }, true);
    assert.equal(clientUsageTest.code, "client_authority_forbidden");

    const clientVerifiedTest = await call("build_montage_pipeline_plan", {
      manifest: nativeFixture.manifest,
      preparedMaterials: nativeFixture.preparedMaterials,
      verified: true
    }, true);
    assert.equal(clientVerifiedTest.code, "client_authority_forbidden");

    const unknownPropTest = await call("build_montage_pipeline_plan", {
      manifest: nativeFixture.manifest,
      preparedMaterials: nativeFixture.preparedMaterials,
      arbitraryField: "not_allowed"
    }, true);
    assert.equal(unknownPropTest.code, "unknown_input_property");
    assert.equal(nativeCommands,0,"Client authority must be rejected before AE reads");
    for(const mutate of [
      x=>{x.manifest.assignments=Array(33).fill(x.manifest.assignments[0]);},
      x=>{x.preparedMaterials.materials[0].verified=true;},
      x=>{x.preparedMaterials.materials[0].byteLength=536870913;},
      x=>{x.manifest.assignments[0].routeLayerIds=Array(5).fill(10);}
    ]) {
      const input=deepClone({manifest:nativeFixture.manifest,preparedMaterials:nativeFixture.preparedMaterials});mutate(input);
      const reads=nativeCommands,r=await call("build_montage_pipeline_plan",input,true);
      assert.equal(r.ok,false);assert.equal(nativeCommands,reads,"Invalid structural input reached native reader");negativeCases++;
    }
    const buildInput=()=>({manifest:nativeFixture.manifest,preparedMaterials:nativeFixture.preparedMaterials});
    for(const [label,change,restore] of [
      ["matte producer","target1.isTrackMatte=true;","target1.isTrackMatte=false;"],
      ["unknown consumer","delete target1.hasTrackMatte;","target1.hasTrackMatte=false;"],
      ["unknown producer","delete target1.isTrackMatte;","target1.isTrackMatte=false;"],
      ["missing effects","var savedFx=target1.groups[1];target1.groups[1]=null;","target1.groups[1]=savedFx;"],
      ["missing opacity","var savedOpacity=target1.groups[0].children.pop();","target1.groups[0].children.push(savedOpacity);"],
      ["keys","target1.groups[0].children[1].numKeys=1;","target1.groups[0].children[1].numKeys=0;"],
      ["expression","target1.groups[0].children[1].expressionEnabled=true;","target1.groups[0].children[1].expressionEnabled=false;"],
      ["locked unknown","delete target1.locked;","target1.locked=false;"]
    ]) {
      nativeFixture.change(change);
      const r=await call("build_montage_pipeline_plan",buildInput(),true);
      assert.equal(r.ok,false,label);assert.equal(nativeFixture.getWrites(),0,label);negativeCases++;
      nativeFixture.change(restore);
    }
    const statePath=path.join(fixture.runtimeDir,"state","project-intent-state.json"),originalState=fs.readFileSync(statePath,"utf8");
    const changeState=fn=>{const s=JSON.parse(originalState);fn(s.projectState[nativeFixture.manifest.project.projectKey]);fs.writeFileSync(statePath,JSON.stringify(s));};
    nativeHook=script=>{if(script.includes("__montageFootprint")){nativeHook=null;changeState(s=>{s.revision=1;});}};
    const duringBuild=await call("build_montage_pipeline_plan",buildInput(),true);
    assert.equal(duringBuild.ok,false,"Policy/revision drift during build must block readiness");negativeCases++;
    nativeHook=null;fs.writeFileSync(statePath,originalState);
    for(const [label,change,restore] of [
      ["policy during build",()=>changeState(s=>{s.constraints={distinctGroups:true,disallowSourceOverlap:true,selectedTargets:[{compItemId:110,layerId:20}]};}),()=>fs.writeFileSync(statePath,originalState)],
      ["material during build",()=>fs.writeFileSync(nativeFixture.realFileAPath,"X".repeat(nativeFixture.sizeA)),()=>fs.writeFileSync(nativeFixture.realFileAPath,nativeFixture.contentA)],
      ["target transform during build",()=>nativeFixture.change("target1.groups[0].children[1].value=[971,530];"),()=>nativeFixture.change("target1.groups[0].children[1].value=[970,530];")],
      ["route transform during build",()=>nativeFixture.change("precomp1.groups[0].children[2].value=[101,101];"),()=>nativeFixture.change("precomp1.groups[0].children[2].value=[100,100];")]
    ]) {
      let layersRead=0;
      nativeHook=script=>{if(script.includes("__montageFootprint") && ++layersRead===5){nativeHook=null;change();}};
      const r=await call("build_montage_pipeline_plan",buildInput(),true);
      assert.equal(r.ok,false,label);assert.equal(nativeFixture.getWrites(),0,label);negativeCases++;
      nativeHook=null;restore();
    }
    const wrongKey=deepClone(buildInput());wrongKey.manifest.project.projectKey="wrong_project_key";
    assert.equal((await call("build_montage_pipeline_plan",wrongKey,true)).ok,false);negativeCases++;

    // 3. Read-only build verification (zero mutations during build)
    const initialWrites = nativeFixture.getWrites();
    assert.equal(initialWrites, 0, "Initial writes must be 0");

    const buildResult = await call("build_montage_pipeline_plan", {
      manifest: nativeFixture.manifest,
      preparedMaterials: nativeFixture.preparedMaterials
    });

    assert.equal(buildResult.ok, true,JSON.stringify(buildResult.blockers));
    assert.equal(buildResult.readiness, "ready");
    assert.equal(buildResult.previewLocal, true);
    assert.equal(buildResult.mutatesProject, false);
    assert.equal(buildResult.compilation.units.length, 2);
    assert.equal(nativeFixture.getWrites(), 0, "Build must cause zero project mutations in AE");

    // 4. Metadata retention on compiled units
    const unit0 = buildResult.compilation.units[0];
    const mp = unit0.plan.montagePipeline;
    assert.ok(mp, "plan.montagePipeline must be present on compiled unit plan");
    assert.equal(mp.unitId, unit0.unitId);
    assert.equal(mp.manifestRevision, nativeFixture.manifest.revision);
    assert.equal(mp.materialRevision, nativeFixture.preparedMaterials.revision);
    assert.equal(mp.materialId, "mat_01");
    assert.equal(mp.sourceItemId, 200);
    assert.equal(mp.path, nativeFixture.realFileAPath);
    assert.equal(mp.sha256, nativeFixture.shaA);
    assert.equal(mp.byteLength, nativeFixture.sizeA);
    assert.ok(mp.unitContentHash, "unitContentHash must be present");
    assert.ok(mp.verificationBindings, "verificationBindings must be present");
    // Actual native inventory emitter + the same production guard, same realm.
    // Reseal malformed input to exercise authorization rather than a stale hash.
    const emittedInventory=await require("../mcp-server/bridge-daemon").preparePlaceholderInventoryScript();
    const directDeps={currentPlaceholderState:async()=>({projectFile:nativeFixture.projectFilePath,state:JSON.parse(originalState).projectState[mp.project.projectKey]}),
      readPlaceholderInventory:async()=>nativeFixture.execute(emittedInventory.script).result,
      runExtendScriptBody:async body=>({result:nativeFixture.read(`(function(){${body}})()`)})};
    const reseal=plan=>{const p=plan.montagePipeline,b=p.verificationBindings;p.unitContentHash=computeUnitContentHash({unitId:p.unitId,assignment:p.intent.assignment,rootRange:p.intent.rootRange,
      material:b.material,crop:p.intent.assignment.crop,geometry:b.geometry,route:b.route,plan,project:p.project,manifestRevision:p.manifestRevision,materialRevision:p.materialRevision});};
    for(const [label,mutate,resealNeeded] of [
      ["unauthorized path",p=>{p.path=path.join(nativeFixture.tmpDir,"unauthorized.mp4");p.verificationBindings.material.path=p.path;},true],
      ["oversized guard",p=>{p.byteLength=536870913;p.verificationBindings.material.byteLength=p.byteLength;},true],
      ["missing bindings",p=>{delete p.verificationBindings;},false]
    ]) {
      const plan=deepClone(unit0.plan);mutate(plan.montagePipeline);if(resealNeeded)reseal(plan);
      let fsCalls=0;const originals={};
      for(const key of ["realpathSync","statSync","openSync","readSync","fstatSync"]) {originals[key]=fs[key];fs[key]=(...a)=>{fsCalls++;return originals[key](...a);};}
      try {await assert.rejects(()=>guardMontagePlan(plan,directDeps),undefined,label);assert.equal(fsCalls,0,label);negativeCases++;}
      finally {for(const [key,value] of Object.entries(originals))fs[key]=value;}
    }
    const alteredIntent=deepClone(unit0.plan);alteredIntent.steps[1].args.outPoint-=1;
    await assert.rejects(()=>guardMontagePlan(alteredIntent,directDeps),{code:"montage_unit_chain_invalid"});negativeCases++;
    const unrelated=deepClone(unit0.plan);unrelated.steps.splice(2,0,{tool:"create_comp",args:{name:"unrelated"}});reseal(unrelated);
    await assert.rejects(()=>guardMontagePlan(unrelated,directDeps),{code:"montage_unit_chain_invalid"});negativeCases++;
    const unrelatedTarget=deepClone(unit0.plan);unrelatedTarget.steps[0].args.expectedLayerId=30;reseal(unrelatedTarget);
    await assert.rejects(()=>guardMontagePlan(unrelatedTarget,directDeps),{code:"montage_unit_chain_invalid"});negativeCases++;
    const predictableBudget=deepClone(unit0.plan);predictableBudget.montagePipeline.readBudgets.materialReadRequests=3;reseal(predictableBudget);
    await assert.rejects(()=>guardMontagePlan(predictableBudget,directDeps,{montageRunPreflight:true}),{code:"montage_run_material_budget_exceeded"});negativeCases++;
    const nativeInventory=await directDeps.readPlaceholderInventory();
    for(const missing of ["validateAgentPlanWithRepair","guardPlaceholderPlan"]) {
      const deps={...directDeps,getProjectInfo:async()=>({file:nativeFixture.read("app.project.file.fsName")}),
        validateAgentPlanWithRepair:()=>{throw new Error("Must stop at missing dependency before validation");},
        guardPlaceholderPlan:()=>{throw new Error("Must stop at missing dependency before guard");}};
      delete deps[missing];const r=await buildMontagePipelinePlan(buildInput(),deps);
      assert.equal(r.ok,false);assert.equal(r.blockers[0].code,`montage_required_dependency_${missing}`);negativeCases++;
    }
    for(const limit of [{materialReadRequests:2},{materialTotalBytes:nativeFixture.sizeA+nativeFixture.sizeB}]) {
      const budgets=normalizeBudgets(limit).budgets,reader=boundedMaterialReader(budgets);
      let bytes=0;const oldRead=fs.readSync;fs.readSync=(...a)=>{const n=oldRead(...a);bytes+=n;return n;};
      try {
        assert.equal((await reader({preparedMaterials:nativeFixture.preparedMaterials,inventory:nativeInventory})).ok,true);
        const before=bytes;assert.equal((await reader({preparedMaterials:nativeFixture.preparedMaterials,inventory:nativeInventory})).ok,false);
        assert.equal(bytes,before,"Aggregate exhaustion must precede the next file read");assert.equal(bytes,nativeFixture.sizeA+nativeFixture.sizeB);negativeCases++;
      }finally {fs.readSync=oldRead;}
    }
    const tinyBudget=await call("build_montage_pipeline_plan",{...buildInput(),budgets:{materialReadRequests:3}},true);
    assert.equal(tinyBudget.ok,false);assert.ok(tinyBudget.blockers.some(b=>b.code==="material_operation_budget_exhausted"));negativeCases++;

    // Existing MCP/autonomous gates for the actual montage unit. The fixture's
    // temporary session settings affect only its isolated daemon.
    mcpChild=spawn(process.execPath,[path.join(__dirname,"..","mcp-server","mcp-adapter.js")],{
      cwd:path.join(__dirname,".."),windowsHide:true,stdio:["pipe","pipe","ignore"],
      env:isolatedEnvironment(fixture.runtimeDir,{port:fixture.port,automationToken:fixture.automationToken,panelToken:fixture.panelToken,adminToken:fixture.adminToken,devAdmin:true})});
    readline.createInterface({input:mcpChild.stdout}).on("line",line=>{
      const message=JSON.parse(line),pending=mcpPending.get(message.id);if(!pending)return;
      mcpPending.delete(message.id);clearTimeout(pending.timer);message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
    });
    await rpc("initialize",{});
    const mcpProposed=await mcpCall("propose_ai_agent_plan",{plan:unit0.plan});
    assert.equal(mcpProposed.proposal.confirmation.confirmationToken,undefined);
    assert.equal(mcpProposed.plan.montagePipeline.unitContentHash,unit0.contentHash);
    const mcpArgs={actionId:mcpProposed.proposal.actionId,payloadHash:mcpProposed.proposal.action.payloadHash,
      previewHash:mcpProposed.proposal.action.previewHash,riskLevel:mcpProposed.proposal.risk.level,
      riskPolicyVersion:mcpProposed.proposal.confirmation.riskPolicyVersion,dryRun:false};
    const session=enabled=>post("/autonomy/session",{enabled,panelConnectionId:"network-panel",panelGeneration:"1"});
    assert.equal((await session(false)).body.session.desiredEnabled,false);
    assert.equal((await mcpCall("run_ai_agent_plan",mcpArgs,true)).code,"proposal_required");negativeCases++;
    assert.equal((await session(true)).body.session.active,true);
    const noDryRun=await mcpCall("run_ai_agent_plan",mcpArgs,true);
    assert.equal(noDryRun.errorCode || noDryRun.code,"autonomous_session_dry_run_required");negativeCases++;
    assert.equal((await mcpCall("run_ai_agent_plan",{...mcpArgs,payloadHash:"sha256:"+"0".repeat(64)},true)).ok,false);negativeCases++;
    assert.equal((await mcpCall("run_ai_agent_plan",{...mcpArgs,dryRun:true})).ok,true);
    const direct=await mcpCall("set_layer_transform",{compItemIndex:2,layerIndex:1,expectedCompItemId:110,expectedLayerId:20,position:[10,20]},true);
    assert.equal(direct.code,"proposal_required");negativeCases++;
    assert.equal(nativeFixture.getWrites(),0,"Autonomous dry-run/gate negatives cannot write");
    await session(false);

    // 5. Propose unit plan through normal CEP confirmation flow.
    const proposeRes = await withPanel(() =>
      post("/agents/plan/propose", { plan: unit0.plan })
    );
    assert.equal(proposeRes.status, 200, proposeRes.text);
    const action = proposeRes.body.proposal;
    assert.ok(action && action.actionId, "Action proposal must be returned");

    // 6. Dry run verification (still zero mutations)
    const dryRunRes = await withPanel(() =>
      post("/agents/plan/run", { actionId: action.actionId, dryRun: true })
    );
    assert.equal(dryRunRes.status, 200, dryRunRes.text);
    assert.equal(dryRunRes.body.run.ok, true, dryRunRes.text);
    assert.equal(nativeFixture.getWrites(), 0, "Dry-run must cause zero project mutations in AE");
    const runBody=()=>({actionId:action.actionId,payloadHash:action.action.payloadHash,previewHash:action.action.previewHash,
      riskLevel:action.risk.level,riskPolicyVersion:action.confirmation.riskPolicyVersion,confirmationToken:action.confirmation.confirmationToken,
      confirmedBySurface:action.confirmation.surface,dryRun:false,confirm:true,allowMutations:true});
    for(const [label,change,restore] of [
      ["target source to later planned state","target1.source=footageA;","target1.source=footageC;"],
      ["target timing to later planned state","target1.outPoint=6;","target1.outPoint=5.8;"],
      ["route source","precomp1.source=scene2Comp;","precomp1.source=scene1Comp;"],
      ["route timing","precomp1.startTime=0.01;","precomp1.startTime=0;"],
      ["route position","precomp1.groups[0].children[1].value=[961,540];","precomp1.groups[0].children[1].value=[960,540];"],
      ["route scale","precomp1.groups[0].children[2].value=[101,101];","precomp1.groups[0].children[2].value=[100,100];"],
      ["native metadata","footageA.width=1919;","footageA.width=1920;"]
    ]) {
      nativeFixture.change(change);const r=await withPanel(()=>post("/agents/plan/run",runBody()));
      assert.equal(r.body.run.ok,false,label);assert.equal(nativeFixture.getWrites(),0,label);negativeCases++;
      nativeFixture.change(restore);
    }
    for(const [label,change] of [["revision zero",s=>{s.revision=1;}],["policy",s=>{s.constraints={distinctGroups:true,disallowSourceOverlap:true,selectedTargets:[{compItemId:110,layerId:20}]};}]]) {
      changeState(change);const r=await withPanel(()=>post("/agents/plan/run",runBody()));
      assert.equal(r.body.run.ok,false,label);assert.equal(nativeFixture.getWrites(),0,label);negativeCases++;
      fs.writeFileSync(statePath,originalState);
    }

    // 7. Drift rejection before mutating steps: Material drift
    nativeFixture.injectMaterialDrift();
    const materialDriftRun = await withPanel(() =>
      post("/agents/plan/run", {
        actionId: action.actionId,
        payloadHash: action.action.payloadHash,
        previewHash: action.action.previewHash,
        riskLevel: action.risk.level,
        riskPolicyVersion: action.confirmation.riskPolicyVersion,
        confirmationToken: action.confirmation.confirmationToken,
        confirmedBySurface: action.confirmation.surface,
        dryRun: false,
        confirm: true,
        allowMutations: true
      })
    );
    assert.equal(materialDriftRun.body.run.ok, false, "Run must fail when material on disk drifts");
    assert.equal(materialDriftRun.body.run.errorCode, "montage_material_drift_detected");
    assert.equal(nativeFixture.getWrites(), 0, "No mutations must be made when material drifts");

    // Restore material file
    fs.writeFileSync(nativeFixture.realFileAPath, nativeFixture.contentA);

    // 8. Drift rejection: Project drift
    nativeFixture.injectProjectDrift();
    const projectDriftRun = await withPanel(() =>
      post("/agents/plan/run", {
        actionId: action.actionId,
        payloadHash: action.action.payloadHash,
        previewHash: action.action.previewHash,
        riskLevel: action.risk.level,
        riskPolicyVersion: action.confirmation.riskPolicyVersion,
        confirmationToken: action.confirmation.confirmationToken,
        confirmedBySurface: action.confirmation.surface,
        dryRun: false,
        confirm: true,
        allowMutations: true
      })
    );
    assert.equal(projectDriftRun.body.run.ok, false, "Run must fail when project drifts");
    assert.equal(projectDriftRun.body.run.errorCode, "montage_project_drift_detected");
    assert.equal(nativeFixture.getWrites(), 0, "No mutations must be made when project drifts");

    // Restore project file
    nativeFixture.change(`app.project.file.fsName = ${JSON.stringify(nativeFixture.projectFilePath)};`);

    // 9. Drift rejection: Target footprint drift
    nativeFixture.injectFootprintEffect();
    const footprintDriftRun = await withPanel(() =>
      post("/agents/plan/run", {
        actionId: action.actionId,
        payloadHash: action.action.payloadHash,
        previewHash: action.action.previewHash,
        riskLevel: action.risk.level,
        riskPolicyVersion: action.confirmation.riskPolicyVersion,
        confirmationToken: action.confirmation.confirmationToken,
        confirmedBySurface: action.confirmation.surface,
        dryRun: false,
        confirm: true,
        allowMutations: true
      })
    );
    assert.equal(footprintDriftRun.body.run.ok, false, "Run must fail when target footprint drifts");
    assert.equal(footprintDriftRun.body.run.errorCode, "montage_target_footprint_drift_detected");
    assert.equal(nativeFixture.getWrites(), 0, "No mutations must be made when footprint drifts");

    // Restore target footprint
    nativeFixture.change("target1.groups[1].children.pop();");

    // 10. Actual Execution of verified unit plan
    const executeRun = await withPanel(() =>
      post("/agents/plan/run", {
        actionId: action.actionId,
        payloadHash: action.action.payloadHash,
        previewHash: action.action.previewHash,
        riskLevel: action.risk.level,
        riskPolicyVersion: action.confirmation.riskPolicyVersion,
        confirmationToken: action.confirmation.confirmationToken,
        confirmedBySurface: action.confirmation.surface,
        dryRun: false,
        confirm: true,
        allowMutations: true
      })
    );
    assert.equal(executeRun.status, 200, executeRun.body?.run?.errorCode);
    assert.equal(executeRun.body.run.ok, true, executeRun.body?.run?.errorCode);
    const writesAfter = nativeFixture.getWrites();
    assert.ok(writesAfter > 0, "Execution must mutate target layer in AE");
    assert.equal(nativeFixture.read("target1.source.id"),200,"Own replace_source transition must be observed");
    assert.equal(nativeFixture.read("target1.outPoint"),6,"Own timing transition must be observed");
    assert.deepEqual(nativeFixture.read("target1.groups[0].children[1].value"),[960,540],"Own framing transition must be observed");
    const runId = executeRun.body.run.id;

    // 11. Reconciliation and post-run read-back
    const reconciliation = await call("reconcile_plan_run", { runId });
    assert.equal(reconciliation.runId, runId);
    assert.ok(reconciliation.montageReadBack, "Reconciliation must attach montageReadBack");
    assert.equal(reconciliation.montageReadBack.projects.length, 1);
    assert.equal(reconciliation.montageReadBack.targets.length, 1);
    assert.equal(reconciliation.montageReadBack.materials.length, 1);
    assert.equal(reconciliation.montageReadBack.routes.length, 1);

    // Verify observation evidence structure
    for (const coll of ["projects", "targets", "materials", "routes"]) {
      const item = reconciliation.montageReadBack[coll][0];
      assert.equal(item.evidence.schema, "ae-agent-montage-post-run-read.v1");
      assert.equal(item.evidence.phase, "after_run");
      assert.equal(item.evidence.runId, runId);
      assert.equal(item.evidence.actionId, action.actionId);
    }
    const record=planRunRecords.readRecord(path.join(fixture.runtimeDir,"logs"),runId,{throwOnError:true});
    const oneUnitCompilation={...buildResult.compilation,units:[unit0],reviewPackets:[]};
    const summaryFor=report=>summarizeMontagePipeline({compilation:oneUnitCompilation,runEvidence:[record],
      reconciliation:[report],readBack:report.montageReadBack});
    const summary=summaryFor(reconciliation);
    const facts=technicalFacts({readBack:reconciliation.montageReadBack,record,unit:unit0,project:oneUnitCompilation.project});
    assert.deepEqual(facts.missing,[]);
    assert.deepEqual(facts.drift,[]);
    const rb=verifyPlaceholderReadBack(unit0.expectedReadBack,facts.target);
    assert.equal(rb.ok,true,rb.reason);
    const cov=verifyPlaceholderCoverage({geometry:facts.target.geometry,transform:facts.target.transform});
    assert.equal(cov.covered,true,cov.reason);
    assert.ok(reconciliation.steps.every(s=>s.verificationStatus==="passed"),JSON.stringify(reconciliation.steps.map(s=>({index:s.index,status:s.verificationStatus,reason:s.reasonCode}))));
    assert.equal(summary.technicalVerification.status,"passed",JSON.stringify(summary.blockers));
    assert.equal(summary.ok,true,JSON.stringify(summary.blockers));
    assert.equal(summary.visualAcceptance.artisticAccepted,false);
    const futureRecord=deepClone(record);futureRecord.run.finishedAt=new Date(Date.now()+86400000).toISOString();
    const futureReads=await buildPostRunReadBack(futureRecord,directDeps);
    assert.equal(Object.values(futureReads).flat().length,0,"A future finishedAt cannot cause a fabricated future receipt timestamp");negativeCases++;
    assert.equal(recordBinding(record,unit0,oneUnitCompilation.project),null);
    for(const [label,mutate] of [
      ["safety without validation",r=>{delete r.run.validation;}],
      ["changed source",r=>{r.run.steps[0].args.expectedSourceItemId=201;}],
      ["changed timing",r=>{r.run.steps[1].args.outPoint=5;}],
      ["changed safety",r=>{r.run.steps[0].args.idempotencyKey="tampered";}],
      ["unexpected extra",r=>{r.run.steps[0].args.unexpected=true;}]
    ]) {
      const changed=deepClone(record);mutate(changed);
      assert.equal(recordBinding(changed,unit0,oneUnitCompilation.project),"executed_args_binding_mismatch",label);negativeCases++;
    }
    // The same successful record/readers must now fail or become insufficient
    // for actual post-run drift; desired values never become evidence fallbacks.
    for(const [label,change,restore,expected] of [
      ["target source","target1.source=footageB;","target1.source=footageA;","failed"],
      ["tiny timing","target1.outPoint=6.00001;","target1.outPoint=6;","failed"],
      ["tiny opacity","target1.groups[0].children[4].value=99.99999;","target1.groups[0].children[4].value=100;","failed"],
      ["route source","precomp1.source=scene2Comp;","precomp1.source=scene1Comp;","failed"],
      ["route timing","precomp1.outPoint=5.9;","precomp1.outPoint=6;","failed"],
      ["route position","precomp1.groups[0].children[1].value=[961,540];","precomp1.groups[0].children[1].value=[960,540];","failed"],
      ["route scale","precomp1.groups[0].children[2].value=[101,101];","precomp1.groups[0].children[2].value=[100,100];","failed"],
      ["source metadata","footageA.duration=9.99;","footageA.duration=10;","failed"],
      ["matte producer","target1.isTrackMatte=true;","target1.isTrackMatte=false;","failed"],
      ["unknown matte","delete target1.isTrackMatte;","target1.isTrackMatte=false;","insufficient"],
      ["native read error","var savedProperty=target1.property;target1.property=function(){throw Error('native unavailable');};","target1.property=savedProperty;","insufficient"]
    ]) {
      nativeFixture.change(change);const report=await call("reconcile_plan_run",{runId}),s=summaryFor(report);
      assert.equal(s.technicalVerification.status,expected,label);assert.equal(nativeFixture.getWrites(),writesAfter,label);negativeCases++;
      nativeFixture.change(restore);
    }
    for(const [label,apply,expected] of [
      ["file removed",()=>fs.unlinkSync(nativeFixture.realFileAPath),"insufficient"],
      ["file changed",()=>fs.writeFileSync(nativeFixture.realFileAPath,"X".repeat(nativeFixture.sizeA)),"failed"],
      ["file grown",()=>fs.writeFileSync(nativeFixture.realFileAPath,nativeFixture.contentA+"GROW"),"failed"]
    ]) {
      apply();const report=await call("reconcile_plan_run",{runId}),s=summaryFor(report);
      assert.equal(s.technicalVerification.status,expected,label);assert.equal(nativeFixture.getWrites(),writesAfter,label);negativeCases++;
      fs.writeFileSync(nativeFixture.realFileAPath,nativeFixture.contentA);
    }
    for(const [label,change] of [["project key",s=>{s.projectKey="wrong_project_key";}],["revision zero",s=>{s.revision=1;}],
      ["policy",s=>{s.constraints={distinctGroups:true,disallowSourceOverlap:true,selectedTargets:[{compItemId:110,layerId:20}]};}]]) {
      changeState(change);assert.equal(summaryFor(await call("reconcile_plan_run",{runId})).technicalVerification.status,"failed",label);negativeCases++;
      fs.writeFileSync(statePath,originalState);
    }

    // 12. Solution plan builder route verification
    const refreshedManifest=deepClone(nativeFixture.manifest);
    refreshedManifest.revision++;
    refreshedManifest.observedAt=new Date().toISOString();
    refreshedManifest.dependencies.scope.sourceItemIds=refreshedManifest.dependencies.scope.sourceItemIds.filter(id=>id!==202);
    refreshedManifest.dependencies.edges=refreshedManifest.dependencies.edges.filter(e=>e.sourceItemId!==202);
    const solutionPlanBuild = await call("build_solution_plan", {
      solutionId: "montage-pipeline-plan",
      inputs: {
        manifest: refreshedManifest,
        preparedMaterials: nativeFixture.preparedMaterials
      }
    });
    assert.equal(solutionPlanBuild.ok, true);
    assert.equal(solutionPlanBuild.compilation.units.length, 2);

    console.log(`PASS: montage-pipeline-bridge-smoke (actual emitter build/proposal/dry-run/run/reconcile/M3 positive, ${negativeCases} bounded/drift/read-error cases; artistic not established)`);
  } finally {
    if(mcpChild) {
      mcpChild.kill();
      for(const pending of mcpPending.values()){clearTimeout(pending.timer);pending.reject(new Error("MCP fixture stopped"));}
      mcpPending.clear();
      await Promise.race([new Promise(resolve=>mcpChild.exitCode!==null ? resolve() : mcpChild.once("close",resolve)),pause(2000)]);
    }
    await fixture.stop();
    nativeFixture.cleanup();
  }
}

main().catch(err => {
  console.error("FATAL ERROR in montage-pipeline-bridge-smoke:", err);
  process.exitCode = 1;
});
