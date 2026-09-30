#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { startDaemon, pollPanel, commandEcho, pause } = require("./network-test-fixture");
const { createProject } = require("./placeholder-protection-fixture");
async function main() {
  // Existing HTTP boundary, ephemeral port and disposable runtime. No installed
  // AE/CEP/provider is contacted. Admin authority is fixture-only and distinct.
  const project=createProject();let mutatingCommands=0;let afterMutation=null;
  const fixture=await startDaemon({automationToken:"protection-test-auto",panelToken:"protection-test-panel",adminToken:"protection-test-admin",devAdmin:true,commandTimeoutMs:4000,
    setupRuntime(runtime) { fs.writeFileSync(path.join(runtime,"logs","edit-session-active.json"),JSON.stringify({id:"protection-synthetic-session",status:"active",checkpoint:{sourceFile:"C:/Synthetic/Protected.aep"},operations:[]})); } });
  const post=(route,body,token=fixture.panelToken)=>fixture.request({path:route,token,body,timeoutMs:12000});
  async function withPanel(action) {
    let done=false;let response,error;
    await pollPanel(fixture,{projectFile:project.read('app.project.file && app.project.file.fsName')});
    const pending=action().then(value=>{response=value;done=true;},value=>{error=value;done=true;});
    const deadline=Date.now()+15000;
    while(!done && Date.now()<deadline) {
      const polled=await pollPanel(fixture,{projectFile:project.read('app.project.file && app.project.file.fsName')});
      const command=polled.body.command;
      if(!command) {await pause(10);continue;}
      const script=command.script;
      const allowed=script.includes("bitsPerChannel: project ? project.bitsPerChannel") || script.includes("__codexPlaceholderInventory") ||
        script.includes("__codexPlaceholderProtectionGuard") || script.includes("var includeProperties =") ||
        script.includes("sameNameLayerCount: sameNameLayers.length");
      assert(allowed,"Fake panel refuses commands outside this bounded protection contract: "+script.slice(-2000));
      if(script.includes('app.beginUndoGroup("Codex Set')) {
        assert(script.includes("__codexPlaceholderProtectionGuard"));mutatingCommands++;
      }
      const echo=commandEcho(command);
      const submitted=await post("/bridge/submitted",echo);assert.equal(submitted.status,200,submitted.text);
      const raw=project.execute(script);
      const completed=await post("/bridge/result",{...echo,ok:true,result:JSON.stringify(raw)});assert.equal(completed.status,200,completed.text);
      if(script.includes('app.beginUndoGroup("Codex Set') && afterMutation) { const callback=afterMutation;afterMutation=null;callback(); }
    }
    assert(done,"Bounded fake panel request deadline exceeded");await pending;if(error)throw error;return response;
  }
  const call=async(name,args={},expectedError=false)=>{
    const response=await withPanel(()=>post("/tools/call",{name,arguments:args},fixture.automationToken));
    assert.equal(response.status,200,response.text);const raw=response.body.result;
    assert.equal(Boolean(raw.isError),expectedError,JSON.stringify(raw));return JSON.parse(raw.content[0].text);
  };
  const target={compItemId:10,layerId:11};
  const assignments=[{target,sourceItemId:100,sourceRange:[0,4]},{target:{compItemId:10,layerId:12},sourceItemId:101,sourceRange:[0,4]}];
  const plan=(args)=>({summary:"Синтетическая проверка защищённого плейсхолдера",risk:"high",requiresCheckpoint:true,steps:[{tool:"set_layer_transform",args:{compItemIndex:1,layerIndex:1,expectedCompItemId:10,expectedLayerId:11,...args}},{tool:"get_layer_details",args:{compItemIndex:1,layerIndex:1,compItemId:10,layerId:11}}]});
  try {
    const catalog=await fixture.request({path:"/tools",token:fixture.automationToken});
    const tools=new Map(catalog.body.tools.map(value=>[value.name,value]));
    for(const name of ["get_placeholder_protection","get_placeholder_usage","check_placeholder_assignments"])assert(tools.has(name));
    assert(tools.get("get_layer_details").inputSchema.properties.layerId);
    for(const token of [fixture.automationToken,fixture.adminToken]) {
      const rejected=await post("/placeholder/protection",{action:"release",confirm:true},token);
      assert([401,403].includes(rejected.status),rejected.text);
      if(rejected.status===403)assert.equal(rejected.body.code,"placeholder_panel_role_required");
    }
    const forged=await post("/placeholder/protection",{action:"accept",snapshot:{},allowProtectedChanges:true});assert.equal(forged.status,409);assert.equal(forged.body.code,"client_acceptance_snapshot_forbidden");
    project.change('child.selectedProperties=[target.property("ADBE Effect Parade").property("Custom Effect").property("Custom Value")];');
    const accepted=await withPanel(()=>post("/placeholder/protection",{action:"accept",useSelectedProperties:true}));assert.equal(accepted.status,200,accepted.text);assert.equal(accepted.body.acceptedCount,1);
    const protectedState=await call("get_placeholder_protection");assert.equal(protectedState.acceptedPlaceholders[0].properties.length,1);assert(protectedState.drift[0].ok);
    const usage=await call("get_placeholder_usage",{roots:[{compItemId:20}]});assert(usage.complete);assert.equal(usage.sources.length,2);assert(usage.occurrences.length>=2);
    const unknownGroups=await call("check_placeholder_assignments",{assignments},true);assert.equal(unknownGroups.ok,false);
    assert.equal((await withPanel(()=>post("/placeholder/protection",{action:"map_group",groupId:"Исполнитель A"}))).status,200);
    project.change('child.selectedLayers=[other];');
    assert.equal((await withPanel(()=>post("/placeholder/protection",{action:"map_group",groupId:"Исполнитель B"}))).status,200);
    const good=await call("check_placeholder_assignments",{assignments,usage:{complete:true,entries:[]},groupMappings:[{groupId:"forged"}]});assert(good.ok,JSON.stringify(good));assert.equal(good.authority,"fresh-server-inventory");
    const overlap=await call("check_placeholder_assignments",{assignments:[assignments[0],{...assignments[1],sourceItemId:100,sourceRange:[3,5]}],constraints:{distinctGroups:false,disallowSourceOverlap:true}},true);assert.equal(overlap.ok,false);
    const adjacent=await call("check_placeholder_assignments",{assignments:[assignments[0],{...assignments[1],sourceItemId:100,sourceRange:[4,8]}],constraints:{distinctGroups:false,disallowSourceOverlap:true}});assert(adjacent.ok,JSON.stringify(adjacent));
    project.change('child.selectedLayers=[target];');
    for(const [tool,args] of [
      ["set_layer_transform",{compItemIndex:1,layerIndex:1,compItemId:10,layerId:12,position:[1,2]}],
      ["replace_layer_source",{compItemIndex:1,layerIndices:[1],expectedCompItemId:10,expectedLayerId:11,sourceItemId:100,
        sourceItemIndex:4,sourceItemName:"Performer B",sourceItemType:"footage"}]
    ]) {
      const rejected=await withPanel(()=>post("/dev/tool/"+tool,args,fixture.adminToken));
      assert.equal(rejected.status,500,rejected.text);assert(rejected.text.includes("unsupported_setter_identity_alias"),rejected.text);
      assert.equal(mutatingCommands,0);assert.equal(project.read('target.source.id'),100);
    }
    const conflict=await withPanel(()=>post("/agents/plan/propose",{plan:plan({scale:[95,95]})}));assert.equal(conflict.body.ok,false);assert(JSON.stringify(conflict.body).includes("protected_placeholder_conflict"),conflict.text);assert.equal(mutatingCommands,0);
    const directConflict=await withPanel(()=>post("/dev/tool/set_layer_transform",{compItemIndex:1,layerIndex:1,expectedCompItemId:10,expectedLayerId:11,position:[0,0]},fixture.adminToken));assert.equal(directConflict.status,500);assert(directConflict.text.includes("protected_placeholder_conflict"));assert.equal(mutatingCommands,0);
    const raw=await withPanel(()=>post("/dev/tool/run_extendscript",{script:"app.project.item(1).layer(1).remove();"},fixture.adminToken));assert.equal(raw.status,500);assert(raw.text.includes("unknown_protected_mutation_footprint"),raw.text);assert.equal(mutatingCommands,0);
    const proposalResponse=await withPanel(()=>post("/agents/plan/propose",{plan:plan({position:[960,540]})}));assert.equal(proposalResponse.status,200,proposalResponse.text);const proposal=proposalResponse.body.proposal;assert(proposal,proposalResponse.text);
    project.change('target.property("ADBE Transform Group").property("ADBE Position").value=[100,100];');
    const stale=await withPanel(()=>post("/agents/plan/run",{actionId:proposal.actionId,dryRun:true}));assert(stale.body.run,stale.text);assert.equal(stale.body.run.ok,false);assert.equal(stale.body.run.errorCode,"accepted_placeholder_drift");assert.equal(mutatingCommands,0);
    const drift=await call("get_placeholder_protection");assert.equal(drift.drift[0].ok,false);
    project.change('target.property("ADBE Transform Group").property("ADBE Position").value=[960,540];');
    const stagedPlan=plan({position:[960,540]});
    stagedPlan.steps.splice(1,0,{tool:"set_layer_transform",args:{compItemIndex:1,layerIndex:1,expectedCompItemId:10,expectedLayerId:11,opacity:100}});
    const stagedProposalResponse=await withPanel(()=>post("/agents/plan/propose",{plan:stagedPlan}));
    const stagedProposal=stagedProposalResponse.body.proposal;assert(stagedProposal,stagedProposalResponse.text);
    const preview=await withPanel(()=>post("/agents/plan/run",{actionId:stagedProposal.actionId,dryRun:true}));assert(preview.body.run.ok,preview.text);
    afterMutation=()=>project.change('target.property("ADBE Transform Group").property("ADBE Position").value=[7,8];');
    const stagedRun=await withPanel(()=>post("/agents/plan/run",{actionId:stagedProposal.actionId,payloadHash:stagedProposal.action.payloadHash,previewHash:stagedProposal.action.previewHash,
      riskLevel:stagedProposal.risk.level,riskPolicyVersion:stagedProposal.confirmation.riskPolicyVersion,confirmationToken:stagedProposal.confirmation.confirmationToken,
      confirmedBySurface:stagedProposal.confirmation.surface,dryRun:false,confirm:true,allowMutations:true}));
    assert(stagedRun.body.run,stagedRun.text);assert.equal(stagedRun.body.run.ok,false);assert(JSON.stringify(stagedRun.body.run).includes("accepted_placeholder_drift"),stagedRun.text);
    assert.equal(mutatingCommands,1,"Per-step fresh guard stops the second setter after manual drift.");
    project.change('target.property("ADBE Transform Group").property("ADBE Position").value=[960,540];items.unshift(new CompItem(900,"Index shift"));child._layers.reverse();target.index=2;other.index=1;');
    const direct=await withPanel(()=>post("/dev/tool/set_layer_transform",{compItemIndex:1,layerIndex:1,expectedCompItemId:10,expectedLayerId:11,position:[960,540]},fixture.adminToken));assert.equal(direct.status,200,direct.text);assert.equal(mutatingCommands,2);assert.equal(project.read('other.property("ADBE Transform Group").property("ADBE Position").value[0]'),960);
    project.change('child.selectedLayers=[target,other];');
    const constraints=await withPanel(()=>post("/placeholder/protection",{action:"constraints",distinctGroups:true,disallowSourceOverlap:true}));assert.equal(constraints.status,200,constraints.text);
    // Fresh policy enforcement does not trust old client usage or metadata.
    const constrained=await withPanel(()=>post("/dev/tool/replace_layer_source",{compItemIndex:2,layerIndices:[1],expectedCompItemId:10,expectedLayerId:12,sourceItemIndex:4,expectedSourceItemId:100,sourceItemName:"Performer A",sourceItemType:"footage"},fixture.adminToken));assert.equal(constrained.status,500,constrained.text);assert(constrained.text.includes("placeholder_assignment_conflict"));assert.equal(mutatingCommands,2);
    project.change('child.selectedLayers=[target];app.project.file=null;');
    const unsaved=await withPanel(()=>post("/placeholder/protection",{action:"accept"}));assert.equal(unsaved.status,409);assert.equal(unsaved.body.code,"project_identity_unavailable");
    project.change('app.project.file={fsName:"C:/Synthetic/Other.aep"};');
    const otherProject=await call("get_placeholder_protection");assert.equal(otherProject.acceptedPlaceholders.length,0);
    project.change('app.project.file={fsName:"C:/Synthetic/Protected.aep"};');
    const release=await withPanel(()=>post("/placeholder/protection",{action:"release"}));assert.equal(release.status,200,release.text);assert.equal(release.body.acceptedCount,0);
    fs.writeFileSync(path.join(fixture.runtimeDir,"state","project-intent-state.json"),"{corrupt");
    const corrupt=await withPanel(()=>post("/dev/tool/set_layer_transform",{compItemIndex:2,layerIndex:1,position:[1,2]},fixture.adminToken));assert.equal(corrupt.status,500);assert(corrupt.text.includes("Project Intent runtime"));assert.equal(mutatingCommands,2);
    assert.equal(project.read('writes'),2,"Only authorized preserving setters reached the synthetic project.");
    console.log("PASS: protection isolated daemon — actual catalog/read APIs, panel-role-only acceptance/release, selected properties, fresh groups/intervals, proposal+runner+per-step+direct/raw enforcement and index rebinding; two preserving synthetic writes, AE 0.");
  } finally {await fixture.stop();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
