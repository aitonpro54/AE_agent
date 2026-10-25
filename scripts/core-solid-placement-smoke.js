"use strict";
// Generated JSX contract only: fake AE operation body, never an AE connection.
const assert=require("assert"),vm=require("vm"),daemon=require("../mcp-server/bridge-daemon");
function execute(script){
  const start=script.indexOf("      var comp = __codexResolveComp("),end=script.indexOf("return response;",start)+"return response;".length;
  assert(start>=0&&end>start,"exact generated tool body exists");
  const counts={add:0,move:0,begin:0,end:0};
  const layers=[{name:"Anchor",index:1},{name:"Other",index:2}];
  const comp={name:"Fixture",width:1920,height:1080,pixelAspect:1,duration:10,get numLayers(){return layers.length;},layer:i=>layers[i-1]};
  comp.layers={addSolid(color,name,width,height,pixelAspect,duration){counts.add++;const layer={name,index:1,inPoint:0,outPoint:duration,startTime:0,moveBefore(before){counts.move++;const i=layers.indexOf(layer);layers.splice(i,1);layers.splice(layers.indexOf(before),0,layer);layers.forEach((v,j)=>v.index=j+1);}};layers.unshift(layer);layers.forEach((v,j)=>v.index=j+1);return layer;}};
  const context={app:{beginUndoGroup(){counts.begin++;},endUndoGroup(){counts.end++;}},__codexResolveComp:()=>comp,__codexProjectIndexForItem:()=>1,__codexLayerInfo:l=>({name:l.name,index:l.index}),Math};
  try{return {result:vm.runInNewContext('(function(){'+script.slice(start,end)+'})()',context),counts};}
  catch(error){return {error,counts};}
}
async function main(){
  const schema=daemon.exposedTools().find(t=>t.name==="create_solid_layer").inputSchema;assert(schema.properties.insertBeforeLayerIndex);assert(schema.properties.expectedBeforeLayerName);
  const prepared=await daemon.prepareToolScript("create_solid_layer",{name:"Solid",insertBeforeLayerIndex:1,expectedBeforeLayerName:"Anchor"},{});
  const placed=execute(prepared.script);assert.ifError(placed.error);assert.strictEqual(placed.counts.add,1);assert.strictEqual(placed.counts.move,1);assert.strictEqual(placed.result.placement.immediatelyBefore,true);
  for(const args of [{insertBeforeLayerIndex:3},{insertBeforeLayerIndex:1,expectedBeforeLayerName:"Wrong"}]){const p=await daemon.prepareToolScript("create_solid_layer",args,{}),r=execute(p.script);assert(r.error);assert.match(r.error.message,/insertBeforeLayerIndex|expectedBeforeLayerName/);assert.strictEqual(r.counts.add,0);assert.strictEqual(r.counts.begin,0);assert.strictEqual(r.counts.move,0);}
  await assert.rejects(daemon.prepareToolScript("create_solid_layer",{insertBeforeLayerIndex:0},{}),/positive|1-based|integer|greater/i);
  const normal=execute((await daemon.prepareToolScript("create_solid_layer",{},{})).script);assert.ifError(normal.error);assert.strictEqual(normal.counts.move,0);
  const adjustment=await daemon.prepareToolScript("create_adjustment_layer",{},{});assert(!adjustment.script.includes("var insertBeforeLayerIndex"));const adjusted=execute(adjustment.script);assert.ifError(adjusted.error);assert.strictEqual(adjusted.counts.add,1);assert.strictEqual(adjusted.counts.move,0);assert.strictEqual(adjusted.result.layer.name,"Codex Adjustment");
  console.log(JSON.stringify({ok:true,proof:"generated JSX offline operation body",positive:"solid guarded insertion",negative:["out-of-range index","name mismatch","invalid typed index"],adjustment:"ordinary addSolid without unbound placement locals",liveAE:false}));
}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
