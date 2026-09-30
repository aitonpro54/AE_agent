#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const memory = require("../mcp-server/project-intent-memory");
const protection = require("../mcp-server/placeholder-protection");
const usage = require("../mcp-server/placeholder-usage");
const { prepareToolScript, preparePlaceholderInventoryScript } = require("../mcp-server/bridge-daemon");
const { verifyPlaceholderReadBack } = require("../mcp-server/placeholder-readback");
const { createProject } = require("./placeholder-protection-fixture");
const paths = [[{matchName:"ADBE Effect Parade",propertyIndex:2},{matchName:"Custom Effect",propertyIndex:1},{matchName:"Custom Value",propertyIndex:1}]];
async function inventory(project, selected = true) {
  const prepared = await preparePlaceholderInventoryScript({ selected, protectedProperties: selected ? paths : [] });
  const result = project.execute(prepared.script);
  assert(result.ok, result.error);
  return result.result;
}
async function main() {
  const project = createProject();
  const baseline = await inventory(project);
  const accepted = protection.snapshotFromEvidence(baseline.evidence[0], baseline, paths);
  assert.equal(accepted.dependencies.length, 1);
  const targetArgs = { compItemIndex: 1, layerIndex: 1, expectedCompItemId: 10, expectedLayerId: 11 };
  const check = (tool, args) => protection.checkProtectedSteps({ accepted: [accepted], inventory: baseline, steps: [{ tool, args: { ...targetArgs, ...args } }] });
  for (const [tool, args] of [
    ["replace_layer_source", { expectedSourceItemId: 100 }], ["set_layer_time_range", { startTime: 0, inPoint: 0, outPoint: 4, duration: 4 }],
    ["set_layer_transform", { position: [960,540], scale: [100,100] }], ["set_property_value", { propertyPath: paths[0], value: 7 }],
    ["set_property_value", { propertyPath: ["ADBE Effect Parade","Custom Effect","Custom Value"], value: 7 }]
  ]) assert(check(tool,args).ok, tool);
  for (const [tool, args] of [
    ["replace_layer_source", { expectedSourceItemId: 101 }], ["set_layer_time_range", { duration: 5 }],
    ["set_layer_time_range", { startTime: 1 }], ["set_layer_transform", { scale: [99,99] }],
    ["set_property_value", { propertyPath: ["ADBE Effect Parade","Custom Effect","Custom Value"], value: 8 }],
    ["set_property_value", { propertyPath: ["ADBE Transform Group","ADBE Position"], value: [1,2] }],
    ["set_property_value", { propertyPath: ["ADBE Transform Group","ADBE Position"], value: [960,540], time: 0 }],
    ["set_property_value", { propertyPath: ["threeDLayer"], value: true }],
    ["execute_script", { script: "arbitrary" }], ["set_layer_transform", { opacity: 100, allowProtectedChanges: true }]
  ]) assert.equal(check(tool,args).ok,false,tool+JSON.stringify(args));
  assert.equal(check("set_layer_transform",{expectedLayerId:12,scale:[50,50]}).ok,true,"Known unrelated layer write remains allowed.");
  assert.equal(check("set_layer_time_range",{expectedCompItemId:20,expectedLayerId:21,startTime:1}).ok,false,"Ancestor timing is a dependency.");
  assert.equal(check("relink_footage_source",{itemId:100,filePath:"C:/Synthetic/c.mp4"}).ok,false,"Shared source relink affects accepted target.");
  assert.equal(check("relink_footage_source",{itemId:101,filePath:"C:/Synthetic/c.mp4"}).ok,true);
  // Regression: unsupported aliases must never guide the gate to one identity
  // while the actual setter body still uses another index/name.
  const aliasCases = [
    ["set_layer_transform",{compItemIndex:1,layerIndex:1,compItemId:10,layerId:12,position:[1,2]}],
    ["replace_layer_source",{compItemIndex:1,layerIndices:[1],expectedCompItemId:10,expectedLayerId:11,
      sourceItemId:100,sourceItemIndex:4,sourceItemName:"Performer B",sourceItemType:"footage"}],
    ["set_layer_time_range",{compItemIndex:1,layerIndices:[1],compItemId:10,layerId:12,startTime:1}],
    ["set_property_value",{compItemIndex:1,layerIndex:1,compItemId:10,layerId:12,propertyPath:["ADBE Transform Group","ADBE Opacity"],value:90}]
  ];
  for(const [tool,args] of aliasCases) {
    const checked=protection.checkProtectedSteps({accepted:[accepted],inventory:baseline,steps:[{tool,args}]});
    assert.equal(checked.ok,false);assert(checked.conflicts[0].reason.includes("unsupported_setter_identity_alias"));
    const prepared=await prepareToolScript(tool,args);
    assert(prepared.script,"Actual setter JSX includes its own defensive alias guard.");
    const beforeUndo=project.read('undo.length');const beforeWrites=project.read('writes');
    const result=project.execute(prepared.script);
    assert.equal(result.ok,false);assert(result.error.includes("unsupported_setter_identity_alias"),result.error);
    assert.equal(project.read('undo.length'),beforeUndo,"Alias rejection precedes undo.");assert.equal(project.read('writes'),beforeWrites);
    assert.equal(project.read('target.source.id'),100);assert.deepEqual(project.read('target.property("ADBE Transform Group").property("ADBE Position").value'),[960,540]);
  }
  assert.throws(()=>protection.resolveTargets({compItemId:10,layerId:12,compItemIndex:1,layerIndex:1},baseline),/unsupported_setter_identity_alias/);
  assert.throws(()=>protection.sourceId({sourceItemId:100,sourceItemIndex:4},baseline),/unsupported_setter_identity_alias/);

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(),"codex-placeholder-state-"));
  const statePath = path.join(temporary,"state.json");
  const controller = memory.createProjectStateController({statePath});
  try {
    assert.equal(memory.projectStateKey("C:/Synthetic/Protected.aep"),memory.projectStateKey("c:\\synthetic\\PROTECTED.aep"));
    assert.throws(()=>controller.read(null),error=>error.code==="project_identity_unavailable");
    const state=controller.accept(baseline.projectFile,accepted,0);
    assert.equal(state.revision,1);
    assert.equal(controller.read("C:/Synthetic/Other.aep").acceptedPlaceholders.length,0);
    assert.throws(()=>controller.release(baseline.projectFile,accepted.target,0),error=>error.code==="project_state_revision_changed");
    assert.equal(controller.mapGroup(baseline.projectFile,{mediaKey:usage.mediaKeyForSource(baseline.sources[0]),groupId:"A"},1).revision,2);
    assert.equal(fs.readdirSync(temporary).length,1,"Atomic write leaves no temporary artifacts.");
    assert.equal(memory.updateProjectIntentMemory({confirm:true,projectState:{},action:"clear"}).code,"project_state_panel_only");
    fs.writeFileSync(statePath,"{corrupt");
    assert.throws(()=>controller.read(baseline.projectFile),error=>error.code==="project_state_corrupt");
    assert.throws(()=>controller.accept(baseline.projectFile,accepted,0),error=>error.code==="project_state_corrupt");
  } finally {
    assert(path.resolve(temporary).startsWith(path.resolve(os.tmpdir())+path.sep));
    fs.rmSync(temporary,{recursive:true,force:true});
  }

  // Stable identities survive both project and layer index changes. Actual JSX
  // body must use rebound addresses, not merely validate fresh separate bindings.
  project.change('items.unshift(new CompItem(900,"Index shift"));child._layers.reverse();target.index=2;other.index=1;');
  const shifted=await inventory(project);
  assert(protection.compareSnapshot(accepted,shifted.evidence[0],shifted).ok);
  const guard={projectFile:baseline.projectFile,snapshots:[accepted],bindings:[{compItemId:10,layerId:11,compItemIndex:2,layerIndex:2}],_inventory:shifted};
  for(const [tool,args] of [
    ["set_layer_transform",{...targetArgs,position:[960,540]}],
    ["set_property_value",{...targetArgs,propertyPath:paths[0],value:7}],
    ["set_layer_time_range",{...targetArgs,layerIndices:[1],inPoint:0,outPoint:4}],
    ["replace_layer_source",{...targetArgs,layerIndices:[1],sourceItemIndex:3,sourceItemName:"Performer A",sourceItemType:"footage",expectedSourceItemId:100}]
  ]) {
    const prepared=await prepareToolScript(tool,args,null,guard);
    const result=project.execute(prepared.script);
    assert(result.ok,tool+": "+result.error);
    assert.equal(project.read('other.source.id'),101,"Old source index must not relink the other layer.");
  }
  const read=await prepareToolScript("get_layer_details",{compItemIndex:1,layerIndex:1,compItemId:10,layerId:11,responseView:"placeholder",protectedProperties:paths},{comp:{},layer:{}});
  const observed=project.execute(read.script);
  assert(observed.ok,observed.error);
  const { projectPlaceholderLayerEvidence }=require("../mcp-server/placeholder-evidence");
  observed.result=projectPlaceholderLayerEvidence(observed.result);
  assert.equal(observed.result.layer.id,11);
  assert.deepEqual(observed.result.transform.position.value,[960,540]);
  const expected={compItemIndex:1,compItemId:10,compName:"Placeholder",frameRate:25,layerIndex:1,layerId:11,layerName:"Selected placeholder",sourceItemId:100,sourceName:"Performer A",sourceFile:accepted.source.file,footageMissing:false,...accepted.timing,transform:accepted.transform,properties:accepted.properties};
  assert(verifyPlaceholderReadBack(expected,observed.result).ok);
  assert.equal(verifyPlaceholderReadBack(expected,{...observed.result,transform:{...observed.result.transform,position:{...observed.result.transform.position,value:[0,0]}}}).ok,false);

  const prepared=await prepareToolScript("set_layer_transform",{...targetArgs,position:[960,540]},null,guard);
  const before=project.read('undo.length');
  project.change('target.property("ADBE Transform Group").property("ADBE Position").value=[5,6];');
  const drift=project.execute(prepared.script);
  assert.equal(drift.ok,false);assert(drift.error.includes("accepted_placeholder_drift"));assert.equal(project.read('undo.length'),before);
  project.change('target.property("ADBE Transform Group").property("ADBE Position").value=[960,540];child._layers.reverse();target.index=1;other.index=2;');
  const raced=project.execute(prepared.script);
  assert.equal(raced.ok,false);assert(raced.error.includes("protected_mutation_target_shifted"));assert.equal(project.read('undo.length'),before);
  project.change('child._layers.reverse();target.index=2;other.index=1;target.property("ADBE Transform Group").property("ADBE Position").fail=true;');
  const threw=project.execute(prepared.script);assert.equal(threw.ok,false);assert(threw.error.includes("synthetic setter failure"));assert.deepEqual(project.read('undo.slice(-2)'),["begin","end"]);
  for (const expression of ['target.property("ADBE Transform Group").property("ADBE Scale").numKeys=1;',
    'target.property("ADBE Transform Group").property("ADBE Scale").expressionEnabled=true;',
    'target.property("ADBE Transform Group").property("ADBE Scale").dimensionsSeparated=true;']) {
    const unsupported=createProject();unsupported.change(expression);
    const inv=await inventory(unsupported);
    assert.throws(()=>protection.snapshotFromEvidence(inv.evidence[0],inv,paths),/unsupported/);
  }
  const selected=createProject();selected.change('child.selectedProperties=[target.property("ADBE Effect Parade").property("Custom Effect").property("Custom Value")];');
  const selectedScript=await preparePlaceholderInventoryScript({selected:true,useSelectedProperties:true});
  const selectedResult=selected.execute(selectedScript.script);assert(selectedResult.ok,selectedResult.error);assert.equal(selectedResult.result.selectedProtectedProperties.length,1);
  selected.change('child.selectedProperties=[other.property("ADBE Effect Parade").property("Custom Effect").property("Custom Value")];');
  assert.equal(selected.execute(selectedScript.script).ok,false);
  const realUsage=usage.buildSourceUsageMap({inventory:baseline,roots:[{compItemId:20}],groupMappings:[]});
  assert(realUsage.ok,JSON.stringify(realUsage));assert.equal(realUsage.sources.length,2);assert(realUsage.occurrences.length>=2);
  const mixed=createProject();mixed.change('var still=new FootageItem(102,"Solid/still","C:/Synthetic/still.png");still.mainSource.isStill=true;items.push(still);child.add(new AVLayer(13,"Still",still));var audio=new FootageItem(103,"Audio","C:/Synthetic/audio.wav");audio.hasVideo=false;audio.hasAudio=true;items.push(audio);child.add(new AVLayer(14,"Audio",audio));var shape=child.add(new AVLayer(15,"Shape",null));shape.matchName="ADBE Vector Layer";');
  const mixedInventory=await inventory(mixed);
  const mixedUsage=usage.buildSourceUsageMap({inventory:mixedInventory,roots:[{compItemId:20}],groupMappings:[]});
  assert(mixedUsage.ok,JSON.stringify(mixedUsage));assert.equal(mixedUsage.entries.length,2,"Confirmed still/audio/shape must not poison video usage.");
  const shared=createProject();shared.change('var repeated=root.add(new AVLayer(22,"Repeated route",child));repeated.startTime=6;repeated.inPoint=6;repeated.outPoint=10;');
  const sharedInventory=await inventory(shared);
  const sharedUsage=usage.buildSourceUsageMap({inventory:sharedInventory,roots:[{compItemId:20}],groupMappings:[]});
  assert(sharedUsage.ok,JSON.stringify(sharedUsage));
  assert.equal(usage.checkPlaceholderAssignments({usage:sharedUsage,assignments:[{target:{compItemId:10,layerId:11},sourceItemId:100,sourceRange:[0,4]}],constraints:{distinctGroups:false,disallowSourceOverlap:true,selectedTargets:[{compItemId:10,layerId:11}]}}).ok,false,"Repeated structural occurrence cannot be ignored even beyond footage range.");
  const usageGuard=protection.aeInventoryGuardScript(baseline)+'app.beginUndoGroup("test");app.endUndoGroup();';
  const guardProject=createProject();guardProject.change('a.file.fsName="C:/Synthetic/changed.mp4";');
  assert.throws(()=>guardProject.change(usageGuard),/placeholder_usage_changed:source_identity/);assert.deepEqual(guardProject.read('undo'),[]);
  console.log("PASS: protection actual memory/helper/JSX — source/time/transform/property and route conflicts, stable index rebinding, drift, static bounds, atomic/corrupt/project isolation, selected properties and fresh usage.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
