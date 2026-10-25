"use strict";
// Four public-MCP workflows. Native reads are bounded synthetic VM/stub
// responses; dry-run must never dispatch a mutation or produce visual proof.
const assert=require("node:assert/strict"),{createScenarioFixture}=require("./core-scenario-fixture");
function textModel(h){h.model.change(`
  root.width=1920;root.height=1080;child.width=1280;child.height=720;root.frameRate=child.frameRate=30;
  var ParagraphJustification={LEFT_JUSTIFY:1,CENTER_JUSTIFY:2,RIGHT_JUSTIFY:3};
  var textGroup=new Group("ADBE Text Properties",4,target);
  var pointDocument={text:"Scaled Text",font:"ArialMT",fontSize:72,justification:2,leading:82,tracking:0};
  var sourceTextProperty=textGroup.add("ADBE Text Document",pointDocument);
  target.groups.push(textGroup);target.source=null;target.matchName="ADBE Text Layer";target.collapseTransformation=true;
  TextLayer.prototype=Object.create(AVLayer.prototype);Object.setPrototypeOf(target,TextLayer.prototype);
`);}
async function validated(h,plan){const r=await h.call("validate_ai_agent_plan",{plan,repairPlan:false});assert.equal(r.isError,false);assert.equal(r.value.ok,true,JSON.stringify(r.value));return r.value;}
async function roundTrip(h,plan,label){const before=h.counts();const validation=await validated(h,plan);const p=await h.propose(plan);const dry=await h.dry(p);
  assert.equal(dry.isError,false,JSON.stringify(dry.value));assert.equal(dry.value.ok,true,JSON.stringify(dry.value));assert.equal(dry.value.dryRun,true);assert.equal(dry.value.executedCount,0);
  assert.equal(h.counts().mutations,before.mutations,label);assert.equal(h.counts().writes,before.writes,label);assert.equal(dry.value.outcome.mutation.status,"not_started");
  assert.equal(dry.value.provenance.actionId,p.actionId);assert.equal(dry.value.provenance.proposalRevision,p.revision);assert.match(dry.value.provenance.runtime.sourceSha256,/^[a-f0-9]{64}$/);
  return {validation,p,dry:dry.value};}
async function main(){const h=await createScenarioFixture();const results=[];try{
  textModel(h);
  const read=await h.withPanel(()=>h.call("get_layer_details",{compItemId:10,layerId:11,protectedProperties:[["ADBE Text Properties","ADBE Text Document"]]}));
  assert.equal(read.isError,false,JSON.stringify(read.value));assert.equal(read.value.layer.id,11);assert.equal(read.value.text.text,"Scaled Text");
  const target={compItemIndex:1,layerIndex:1,expectedCompItemId:10,expectedLayerId:11};
  const title={summary:"Uniform title typed migration contract",targetProject:{file:h.projectFile},requiresCheckpoint:true,steps:[
    {tool:"update_text_layer",args:{...target,text:"25 октября\rСОЛЬНЫЙ КОНЦЕРТ",font:"ArialMT",fontSize:72,leading:82,tracking:0,justification:"center"}},
    {tool:"get_layer_details",args:{compItemId:10,layerId:11,protectedProperties:[["ADBE Text Properties","ADBE Text Document"]]}}]};
  const titleResult=await roundTrip(h,title,"title dry-run");assert.equal(titleResult.validation.classification.rawExtendscriptStepCount,0);results.push({workflow:"titles",steps:titleResult.validation.steps.length,proposalRisk:titleResult.p.risk.level,dryRunExecuted:0});
  const align={summary:"Explicit text transform migration contract",targetProject:{file:h.projectFile},requiresCheckpoint:true,steps:[{tool:"set_layer_transform",args:{...target,position:[640,360]}},{tool:"get_layer_details",args:{compItemId:10,layerId:11}}]};
  await roundTrip(h,align,"text alignment dry-run");
  const contract=await h.call("get_plan_builder_contract",{solutionId:"text-visual-review-plan"});assert.equal(contract.isError,false);
  const input={caseId:"scaled-precomp-text",rootCompItemId:20,textTarget:{compItemId:10,layerId:11},route:[{parentCompItemId:20,layerId:21,childCompItemId:10}],frames:[{time:0,phase:"entry"},{time:1,phase:"hold"},{time:2.5,phase:"exit"}],checks:["staticSourceText","transformedBounds","phaseCoverage"],expectedText:"Scaled Text"};
  const builtReview=await h.withPanel(()=>h.call("build_solution_plan",{solutionId:"text-visual-review-plan",inputs:input}));assert.equal(builtReview.isError,false,JSON.stringify(builtReview.value));assert.equal(builtReview.value.ok,true);assert.equal(builtReview.value.plan.steps.length,10);
  const review=await roundTrip(h,builtReview.value.plan,"review dry-run");results.push({workflow:"text-alignment",typedSteps:align.steps.length,reviewSteps:review.validation.steps.length,dryRunExecuted:0,visualAcceptance:"pending"});
  // One revision change during the actual read-only builder's observations
  // must invalidate the observation rather than issue a usable stale plan.
  let drifted=false;h.handler=(command)=>{if(!drifted&&command.script.includes("var includeProperties =")){const raw=h.model.execute(command.script);h.model.change("app.project.revision=99;");drifted=true;return raw.result;}};
  const stale=await h.withPanel(()=>h.call("build_solution_plan",{solutionId:"text-visual-review-plan",inputs:input}));assert.equal(stale.isError,true);assert.match(JSON.stringify(stale.value),/stale_project/);assert(drifted);h.handler=null;
  h.freshModel();
  const placeholderInput={rootComp:{itemId:20,itemIndex:2,name:"Root",duration:10,frameRate:25},targetComp:{itemId:10,itemIndex:1,name:"Placeholder",duration:10,frameRate:25},route:[{parentCompItemId:20,childCompItemId:10,layerId:21,layerIndex:1,startTime:0,inPoint:0,outPoint:10,stretch:100,timeRemapEnabled:false}],targetLayer:{id:11,index:1,name:"Selected placeholder",sourceItemId:100,locked:false,stretch:100,timeRemapEnabled:false},sourceItem:{itemId:101,itemIndex:4,name:"Performer B",type:"footage",duration:10},rootRange:[0,4],sourceRange:[2,6]};
  const built=await h.call("build_placeholder_plan",{input:placeholderInput});assert.equal(built.isError,false,JSON.stringify(built.value));assert.equal(built.value.validation.ok,true);assert.deepEqual(built.value.plan.steps.map(s=>s.tool),["replace_layer_source","set_layer_time_range","get_layer_details"]);assert.equal(built.value.plan.steps[1].args.startTime,-2);
  const filled=await roundTrip(h,{...built.value.plan,targetProject:{file:h.projectFile}},"placeholder dry-run");
  const observed={comp:{itemIndex:1,itemId:10,name:"Placeholder",frameRate:25},layer:{index:1,id:11,name:"Selected placeholder",source:{itemId:101,name:"Performer B"},startTime:-2,inPoint:0,outPoint:4,stretch:100,timeRemapEnabled:false}};
  const verified=await h.call("verify_placeholder_read_back",{expected:built.value.expectedReadBack,observed});assert.equal(verified.value.status,"passed");
  const mismatch=await h.call("verify_placeholder_read_back",{expected:built.value.expectedReadBack,observed:{...observed,layer:{...observed.layer,source:{itemId:100,name:"Performer B"}}}});assert.equal(mismatch.value.status,"needs_review");results.push({workflow:"slideshow-placeholder",steps:filled.validation.steps.length,startTime:-2,dryRunExecuted:0,sourceMismatch:"needs_review"});
  const inspectionArgs={expectedProjectFile:h.projectFile,rootCompItemId:10,variantCompItemId:20,controlledLayerIds:[11,12],variants:[{variantId:"one",activeLayerIds:[11],outputFileName:"one.mov"}]};
  h.handler=command=>command.script.includes("var nativeSnapshot=")?{projectFile:h.projectFile,revision:42,rootCompItemId:10,variantCompItemId:20,duration:2,frameDuration:0.04,controlled:[{id:11,index:1,name:"One",enabled:true},{id:12,index:2,name:"Two",enabled:false}],graph:[],queue:[],templates:{renderSettings:["Best Settings"],outputModule:["Movie"],gap:null}}:undefined;
  const inspected=await h.withPanel(()=>h.call("inspect_title_variants",inspectionArgs));assert.equal(inspected.isError,false,JSON.stringify(inspected.value));assert.match(inspected.value.stateHash,/^[a-f0-9]{64}$/);
  const render={summary:"AE-only render migration contract",targetProject:{file:h.projectFile},requiresCheckpoint:true,steps:[{tool:"render_one_title_variant",args:{expectedProjectFile:h.projectFile,rootCompItemId:10,variantCompItemId:20,controlledLayerIds:[11,12],variantId:"one",activeLayerIds:[11],outputFileName:"one.mov",expectedStateHash:inspected.value.stateHash,renderSettingsTemplate:"Best Settings",outputModuleTemplate:"Movie",range:{startFrame:3,frameCount:20},timeoutMs:1000}}]};
  const rendered=await roundTrip(h,render,"AE render dry-run");assert.equal(rendered.p.risk.level,"destructive");results.push({workflow:"ae-render",steps:1,proposalRisk:rendered.p.risk.level,dryRunExecuted:0,mediaProof:"not_inspected"});
  assert.equal(h.counts().mutations,0);assert.equal(h.counts().writes,0);
  console.log(JSON.stringify({ok:true,proof:"public MCP typed/build→validation→server proposal→dry-run with bounded native stubs",results,revisionDrift:"rejected",counts:h.counts(),liveAE:false,visualProof:false,actualRender:false,ameChecks:0}));
}finally{await h.close();}}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
