"use strict";
const assert=require("node:assert/strict");
const bridge=require("../mcp-server/bridge-daemon");
const {createProject}=require("./placeholder-protection-fixture");
const protect=require("../mcp-server/placeholder-protection");
async function main(){
  const project=createProject();
  project.change('items.unshift(new CompItem(900,"Index shift"));child._layers.reverse();target.index=2;other.index=1;');
  const identity={compItemIndex:1,layerIndex:1,expectedCompItemId:10,expectedLayerId:11};
  async function execute(tool,args){const prepared=await bridge.prepareToolScript(tool,args);return project.execute(prepared.script);}
  let result=await execute("set_layer_transform",{...identity,position:[10,20]});
  assert(result.ok,JSON.stringify(result));assert.equal(result.result.comp.itemId,10);assert.equal(result.result.layer.id,11);
  assert.deepEqual(project.read('target.property("ADBE Transform Group").property("ADBE Position").value'),[10,20]);
  assert.deepEqual(project.read('other.property("ADBE Transform Group").property("ADBE Position").value'),[960,540]);
  let read=await execute("get_layer_details",{compItemId:10,layerId:11});assert(read.ok);assert.equal(read.result.layer.id,11);assert.equal(read.result.comp.itemId,10);
  const before=project.read("({writes:writes,undo:undo.length})");
  result=await execute("set_layer_transform",{...identity,expectedLayerId:99,scale:[50,50]});assert(!result.ok);assert.deepEqual(project.read("({writes:writes,undo:undo.length})"),before);
  const path=[{name:"ADBE Effect Parade",matchName:"ADBE Effect Parade",propertyIndex:2},{name:"Custom Effect",matchName:"Custom Effect",propertyIndex:1},{name:"Custom Value",matchName:"Custom Value",propertyIndex:1}];
  result=await execute("set_property_value",{...identity,propertyPath:path,value:8});assert(result.ok,JSON.stringify(result));assert.equal(result.result.comp.itemId,10);assert.equal(result.result.layer.id,11);
  read=await execute("get_property_value",{compItemId:10,layerId:11,propertyPath:path});assert(read.ok,JSON.stringify(read));assert.equal(read.result.property.value.value,8);
  read=await execute("get_property_value",{compItemId:10,layerId:11,propertyPath:["threeDLayer"]});assert(!read.ok,"Unavailable attribute must not become false evidence");
  result=await execute("set_effect_property",{...identity,effectIndex:1,effectName:"Custom Effect",effectMatchName:"Custom Effect",propertyIndex:1,propertyName:"Custom Value",propertyMatchName:"Custom Value",value:9});assert(result.ok,JSON.stringify(result));assert.equal(result.result.comp.itemId,10);assert.equal(result.result.layer.id,11);
  read=await execute("get_effect_details",{compItemId:10,layerId:11,effectIndex:1,effectName:"Custom Effect",effectMatchName:"Custom Effect"});assert(read.ok);assert.equal(read.result.comp.itemId,10);assert.equal(read.result.layer.id,11);
  const noWrites=project.read("({writes:writes,undo:undo.length})");
  result=await execute("set_effect_property",{...identity,expectedCompItemId:99,effectIndex:1,propertyIndex:1,value:99});assert(!result.ok);assert.deepEqual(project.read("({writes:writes,undo:undo.length})"),noWrites);
  result=await execute("get_property_value",{compItemId:10,layerId:11,propertyPath:[...path.slice(0,2),{...path[2],propertyIndex:2}]});assert(!result.ok,"Wrong property index cannot fall back to name");
  project.change('target.property("ADBE Effect Parade").property(1).property(1).fail=true;');
  const undoBefore=project.read("undo.length");result=await execute("set_effect_property",{...identity,effectIndex:1,propertyIndex:1,value:99});assert(!result.ok);assert.equal(project.read("undo.length"),undoBefore+2);assert.deepEqual(project.read("undo.slice(-2)"),["begin","end"]);
  project.change('target.property("ADBE Effect Parade").property(1).property(1).fail=false;');
  result=await execute("set_property_value",{compItemIndex:1,layerIndex:[1,2],expectedCompItemId:10,expectedLayerIds:[11,12],propertyPath:["ADBE Transform Group","ADBE Opacity"],value:77});assert(result.ok,JSON.stringify(result));assert.deepEqual(result.result.layers.map(layer=>layer.id),[11,12]);
  const inventory={comps:[{itemId:10,itemIndex:2,layers:[{id:12,index:1},{id:11,index:2}]}]};
  assert.deepEqual(protect.resolveTargets({expectedCompItemId:10,expectedLayerIds:[11,12],layerIndex:[1,2]},inventory).map(target=>target.layerIndex),[2,1]);
  project.change('target.property("ADBE Transform Group").property("ADBE Scale").fail=true;');
  const writesBefore=project.read("writes");result=await execute("set_layer_transform",{...identity,position:[21,22],scale:[50,50]});assert(!result.ok);assert.equal(project.read("writes"),writesBefore+1);assert.deepEqual(project.read("undo.slice(-2)"),["begin","end"]);
  console.log("PASS: actual generated JSX stable index drift/IDs, exact property paths, bulk stable binding, rejected targets before undo, partial setter and finally; AE0.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
