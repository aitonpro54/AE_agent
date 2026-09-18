#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { normalizeManifest } = require("../mcp-server/slideshow-manifest");
const { TOOL_NAMES, createToolDefinitions, validateToolInput } = require("../mcp-server/slideshow-tools");
const { buildSlideshowPlan, MAX_STAGE_STEPS } = require("../mcp-server/slideshow-plan-builder");
const { buildSemanticVerification } = require("../mcp-server/semantic-verification");

const {manifest,articles,inventory}=require("./slideshow-synthetic-fixture");

const manifestBefore=JSON.stringify(manifest),articlesBefore=JSON.stringify(articles),inventoryBefore=JSON.stringify(inventory);
const normalized=normalizeManifest(manifest,articles);
assert.strictEqual(JSON.stringify(manifest),manifestBefore,"manifest normalization must not mutate caller input");
assert.strictEqual(JSON.stringify(articles),articlesBefore,"article normalization must not mutate caller input");
assert.strictEqual(normalized.manifest.events.length,10);
assert.strictEqual(normalized.manifest.audioRouting,"master-only");
assert.deepStrictEqual(normalized.manifest.events.slice(0,10).map((event)=>event.scene),[1,2,5,4,7,6,9,8,10,3]);
assert.throws(()=>normalizeManifest({...manifest,jsx:"alert(1)"},articles),/forbidden|not supported/);
assert.throws(()=>normalizeManifest({...manifest,unknown:true},articles),/not supported/);
assert.throws(()=>normalizeManifest({...manifest,schema:"ae-agent-slideshow.v1"},articles),/ae-agent-slideshow.v2/);
assert.throws(()=>normalizeManifest({...manifest,audioRouting:"preserve"},articles),/master-only/);
{
  const tooMany=JSON.parse(JSON.stringify(manifest));
  tooMany.events[0].audioOnly=Array.from({length:24},(_,index)=>({path:`C:\\fixture\\audio-${index}.wav`,start:0,duration:5,sourceIn:0,audio:true}));
  assert.throws(()=>normalizeManifest(tooMany,articles),/more than 24 unique master audio routes/);
}

const definitions=createToolDefinitions({idempotencyKey:{type:"string"}});
assert.strictEqual(definitions.length,TOOL_NAMES.length);
definitions.forEach((definition)=>assert.strictEqual(definition.inputSchema.additionalProperties,false));
assert(TOOL_NAMES.includes("audit_slideshow_generated"));
assert(TOOL_NAMES.includes("extend_slideshow_cloned_tree"));

const project=manifest.projectPath,prefix=manifest.prefix;
const clone=validateToolInput("clone_slideshow_event_tree",{expectedProjectFile:project,generatedPrefix:prefix,sourceCompItemIndex:1,expectedSourceCompName:"Scene 1",generatedRootName:"CODX_133_E01_ROOT"});
assert(clone.script.includes("generated_name_collision"));
assert(clone.script.includes("sourceFingerprint"));
assert(!clone.script.includes("c.duration=__d.targetDuration"));
const extend=validateToolInput("extend_slideshow_cloned_tree",{expectedProjectFile:project,generatedPrefix:prefix,rootCompItemIndex:2,expectedRootCompName:"CODX_133_E01_ROOT",targetDuration:8,introDuration:2});
assert(extend.script.includes("setTemporalEaseAtKey"));
assert(extend.script.includes("setSpatialTangentsAtKey"));
assert(extend.script.includes("nt=willMove?t+delta:t"));
assert(!extend.script.includes("/(Math.max"));
const media=validateToolInput("replace_slideshow_media_leaf",{expectedProjectFile:project,generatedPrefix:prefix,rootCompItemIndex:2,expectedRootCompName:"CODX_133_E01_ROOT",leafName:"Image 01",generatedLeafName:"CODX_133_E01_MEDIA_1",duration:8,mediaItems:[{path:"C:\\fixture.png",start:0,duration:8,sourceIn:0,audio:true}]});
assert(media.script.includes("layer.enabled=true"));
assert(media.script.includes("sourceIn_exceeds_media"));
assert(!media.script.includes(".remove()"));
const pair=validateToolInput("copy_slideshow_event_pair",{expectedProjectFile:project,generatedPrefix:prefix,finalCompItemIndex:1,expectedFinalCompName:"Final Comp",masterCompItemIndex:2,expectedMasterCompName:"CODX_133_MASTER",rootCompItemIndex:3,expectedRootCompName:"CODX_133_E01_ROOT",sourceSceneName:"Scene 1",sceneNumber:1,eventStart:0,eventDuration:5,introDuration:2,rootHasAudio:true,introEffectCount:0,mainEffectCount:0});
assert(pair.script.includes("copy.startTime=__d.eventStart"));
assert(pair.script.includes("scene1_single_source_required"));
assert(pair.script.includes("__zeroShutter(copy)"));
const text=validateToolInput("apply_slideshow_event_text",{expectedProjectFile:project,generatedPrefix:prefix,rootCompItemIndex:3,expectedRootCompName:"CODX_133_E01_ROOT",sceneNumber:1,titleCompName:"Text 01",hero:"both",title:"TITLE",titleWrap:24,articleChunks:["A".repeat(240)]});
assert(text.script.includes("sourceRectAtTime"));
assert(text.script.includes("native")===false); // Behavior is encoded directly, without a dynamic code hook.
assert(text.script.includes("baked="));
assert.throws(()=>validateToolInput("apply_slideshow_event_text",{expectedProjectFile:project,generatedPrefix:prefix,rootCompItemIndex:3,expectedRootCompName:"CODX_133_E01_ROOT",sceneNumber:1,titleCompName:"Text 01",hero:"bad",title:"TITLE",titleWrap:24,articleChunks:["A".repeat(240)]}),/hero must/);

const emittedBodies=[clone,extend,media,pair,text,
  validateToolInput("rewrite_slideshow_tree_expressions",{expectedProjectFile:project,generatedPrefix:prefix,rootCompItemIndex:3,expectedRootCompName:"CODX_133_E01_ROOT",masterCompName:"CODX_133_MASTER",replacements:[]}),
  validateToolInput("add_slideshow_event_overlays",{expectedProjectFile:project,generatedPrefix:prefix,masterCompItemIndex:2,expectedMasterCompName:"CODX_133_MASTER",eventId:"01",eventStart:0,eventDuration:8,audioItems:[],captions:[]}),
  validateToolInput("copy_slideshow_control_layer",{expectedProjectFile:project,generatedPrefix:prefix,sourceCompItemIndex:1,expectedSourceCompName:"Final Comp",sourceLayerName:"CONTROL",targetLayerName:"CONTROL",expectedEffectCount:0,masterCompItemIndex:2,expectedMasterCompName:"CODX_133_MASTER",duration:8}),
  validateToolInput("audit_slideshow_generated",{expectedProjectFile:project,generatedPrefix:prefix,rootCompItemIndex:2,expectedRootCompName:"CODX_133_MASTER",expectedDuration:8,sourceFingerprints:[]}),
  validateToolInput("configure_slideshow_tree_audio",{expectedProjectFile:project,generatedPrefix:prefix,rootCompItemIndex:3,expectedRootCompName:"CODX_133_E01_ROOT"}),
  validateToolInput("create_slideshow_master",{expectedProjectFile:project,generatedPrefix:prefix,masterName:"CODX_133_MASTER",width:1280,height:720,pixelAspect:1,duration:8,frameRate:30,backgroundColor:[.9,.9,.9]})];
emittedBodies.forEach((prepared,index)=>assert.doesNotThrow(()=>new Function(prepared.script),`emitted JSX body ${index+1} must parse`));

const plan=buildSlideshowPlan(manifest,articles,inventory);
assert.strictEqual(JSON.stringify(inventory),inventoryBefore,"plan builder must not mutate inventory input");
assert.strictEqual(JSON.stringify(manifest),manifestBefore,"plan builder must not mutate manifest input");
for(const stage of plan.stages)for(const item of stage.steps)for(const field of Object.keys(item.resultBindings||{}))assert(!Object.prototype.hasOwnProperty.call(item.args,field),`${item.tool}.${field}: a literal must not shadow its runtime binding`);
assert.strictEqual(plan.manifest.duration,50);
assert.strictEqual(plan.audioRouting,"master-only");
assert(plan.stages.length>1);
assert(plan.stages.every((stage)=>stage.steps.length<=MAX_STAGE_STEPS));
assert(plan.stages.every((stage)=>stage.targetProject.file===manifest.projectPath));
for(const stage of plan.stages){for(let i=0;i<stage.steps.length;i+=1){const current=stage.steps[i];if(TOOL_NAMES.includes(current.tool)&&current.tool!=="audit_slideshow_generated"){assert(stage.steps[i+1],`${current.tool} must have following audit`);assert.strictEqual(stage.steps[i+1].tool,"audit_slideshow_generated",`${current.tool} must be independently audited before next mutation`);}}}
const plannedSteps=plan.stages.flatMap((stage)=>stage.steps);
assert(!plannedSteps.some((item)=>item.tool==="configure_slideshow_tree_audio"));
assert(plannedSteps.filter((item)=>item.tool==="copy_slideshow_control_layer").some((item)=>item.args.targetLayerName==="CONTROL"&&item.args.expectedEffectCount===2));
assert(plannedSteps.filter((item)=>item.tool==="copy_slideshow_control_layer").some((item)=>item.args.targetLayerName==="COLOR"&&item.args.expectedEffectCount===7));
assert(plannedSteps.filter((item)=>item.tool==="clone_slideshow_event_tree").every((item)=>item.args.audioMode==="mute"));
assert(plannedSteps.filter((item)=>item.tool==="copy_slideshow_event_pair").every((item)=>item.args.rootHasAudio===false&&!Object.prototype.hasOwnProperty.call(item,"resultBindings")));
const scene1Pair=plannedSteps.find((item)=>item.tool==="copy_slideshow_event_pair"&&item.args.sceneNumber===1);assert.strictEqual(scene1Pair.args.introEffectCount,0);assert.strictEqual(scene1Pair.args.mainEffectCount,0);
const visual=plannedSteps.find((item)=>item.tool==="replace_slideshow_media_leaf");assert(visual.args.mediaItems.every((item)=>item.audio===false));
const overlay=plannedSteps.find((item)=>item.tool==="add_slideshow_event_overlays"&&item.args.eventId==="01");assert.deepStrictEqual(overlay.args.audioItems.map((item)=>item.path),["C:\\fixture\\generated.mp4","C:\\fixture\\voice.wav"]);
for(const item of plannedSteps)if(TOOL_NAMES.includes(item.tool))assert.doesNotThrow(()=>validateToolInput(item.tool,item.args),`${item.tool} planned args must validate`);
{
  const missingColor=JSON.parse(JSON.stringify(inventory));delete missingColor.finalComp.controlLayers.COLOR;assert.throws(()=>buildSlideshowPlan(manifest,articles,missingColor),/COLOR/);
  const missingControl=JSON.parse(JSON.stringify(inventory));delete missingControl.finalComp.controlLayers.CONTROL;assert.throws(()=>buildSlideshowPlan(manifest,articles,missingControl),/CONTROL/);
  const collision=JSON.parse(JSON.stringify(inventory));collision.finalComp.controlLayers.COLOR.sourceLayerName="CONTROL";assert.throws(()=>buildSlideshowPlan(manifest,articles,collision),/distinct source layers/);
}

const mediaPath="C:\\fixture.png",audioPath="C:\\fixture.wav";
const semanticProtected=[{itemId:900,name:"Protected Source",duration:4,numLayers:0,structureSchema:"ae-agent-comp-structure.v1",layers:[]}];
function structureDigest(value){const normalized={itemId:value.itemId,name:value.name,duration:value.duration,numLayers:value.numLayers,structureSchema:value.structureSchema,layers:value.layers},text=JSON.stringify(normalized);let hash=2166136261;for(let i=0;i<text.length;i+=1){hash^=text.charCodeAt(i);hash+=(hash<<1)+(hash<<4)+(hash<<7)+(hash<<8)+(hash<<24);}return (`00000000${(hash>>>0).toString(16)}`).slice(-8);}
const semanticCases=[
  ["clone_slideshow_event_tree",{generatedPrefix:prefix,generatedRootName:"CODX_133_E01_ROOT",protectedSourceFingerprints:semanticProtected}],
  ["rewrite_slideshow_tree_expressions",{generatedPrefix:prefix,expectedRootCompName:"CODX_133_E01_ROOT",masterCompName:"CODX_133_MASTER",replacements:[]}],
  ["apply_slideshow_event_text",{generatedPrefix:prefix,expectedRootCompName:"CODX_133_E01_ROOT",title:"FULL TITLE"}],
  ["replace_slideshow_media_leaf",{generatedPrefix:prefix,expectedRootCompName:"CODX_133_E01_ROOT",generatedLeafName:"CODX_133_E01_MEDIA_1",mediaItems:[{path:mediaPath,start:0,duration:4,sourceIn:0,audio:false}]}],
  ["copy_slideshow_event_pair",{generatedPrefix:prefix,rootCompItemIndex:3,expectedRootCompName:"CODX_133_E01_ROOT",expectedMasterCompName:"CODX_133_MASTER",eventStart:0,eventDuration:8,introDuration:2,rootHasAudio:false,introEffectCount:1,mainEffectCount:0,protectedSourceFingerprints:semanticProtected}],
  ["add_slideshow_event_overlays",{generatedPrefix:prefix,expectedMasterCompName:"CODX_133_MASTER",eventId:"01",eventStart:0,audioItems:[{path:audioPath,start:0,duration:4,sourceIn:0,audio:true}],captions:["CAP"]}],
  ["copy_slideshow_control_layer",{generatedPrefix:prefix,expectedMasterCompName:"CODX_133_MASTER",targetLayerName:"CONTROL",expectedEffectCount:0,duration:8,protectedSourceFingerprints:semanticProtected}],
  ["configure_slideshow_tree_audio",{generatedPrefix:prefix,expectedRootCompName:"CODX_133_E01_ROOT"}],
  ["create_slideshow_master",{generatedPrefix:prefix,masterName:"CODX_133_MASTER",duration:8}]
];
function auditFor(args){
  const rootName=args.expectedMasterCompName||args.masterName||args.generatedRootName||args.expectedRootCompName,token="E01_ROOT",targetLayerName=args.targetLayerName||"CONTROL";
  const sourceFingerprints=(args.protectedSourceFingerprints||[]).map((item)=>{const digest=structureDigest(item),summary={itemId:item.itemId,name:item.name,duration:item.duration,numLayers:item.numLayers,structureSchema:item.structureSchema,digest};return{unchanged:true,reason:null,expected:{...summary},actual:{...summary}};});
  const propertyPath=[{propertyIndex:1,matchName:"ADBE Opacity",name:"Opacity"}];
  return{ok:true,operation:"audit_generated",root:{name:rootName,duration:args.duration||args.targetDuration||8,itemIndex:2,itemId:102,frameDuration:1/30},issues:[],stats:{videoLayers:1,keyframes:0,keyMetadataTotal:0,backgroundLayers:1},sourceFingerprints,details:{keyMetadata:[],keyMetadataTruncated:false,expressionProvenance:[{comp:rootName,compItemId:102,sourceName:"Scene 1"}],expressions:[{comp:rootName,compItemId:102,layer:"Expression",layerId:7001,property:"ADBE Opacity",propertyIdentity:"comp:102/layer:7001/property:1:ADBE%20Opacity:Opacity",propertyPath,expression:'comp("CODX_133_MASTER")',error:""}],texts:[{layer:`${prefix}TITLE`,text:args.title||"FULL TITLE",font:"TimesNewRomanPS-BoldMT",rect:{width:400,height:100},compWidth:1280,compHeight:720},{layer:`${prefix}CAPTION_01_1`,text:"CAP",font:"TimesNewRomanPSMT",rect:{width:100,height:30},compWidth:1280,compHeight:720}],layers:[
    {comp:args.generatedLeafName||rootName,compItemId:103,compFrameDuration:1/30,layer:`${prefix}MEDIA_1`,name:`${prefix}MEDIA_1`,layerId:3001,sourceType:"footage",sourceName:"fixture.png",sourceItemIndex:11,sourceItemId:501,sourcePath:mediaPath,hasVideo:true,hasAudio:false,enabled:true,audioEnabled:false,stretch:100,startTime:0,inPoint:0,outPoint:4,sourceIn:0,effects:0},
    {comp:rootName,compItemId:102,compFrameDuration:1/30,layer:`${prefix}AUDIO_01_1`,name:`${prefix}AUDIO_01_1`,layerId:3002,sourceType:"footage",sourceName:"fixture.wav",sourceItemIndex:12,sourceItemId:502,sourcePath:audioPath,hasVideo:false,hasAudio:true,enabled:false,audioEnabled:true,stretch:100,startTime:0,inPoint:0,outPoint:4,sourceIn:0,effects:0},
    {comp:rootName,compItemId:102,compFrameDuration:1/30,layer:`${prefix}EVENT_${token}_INTRO`,name:`${prefix}EVENT_${token}_INTRO`,layerId:3003,sourceType:"comp",sourceName:args.expectedRootCompName||"CODX_133_E01_ROOT",sourceItemIndex:3,sourceItemId:503,hasVideo:true,hasAudio:true,enabled:true,startTime:0,inPoint:0,outPoint:2,sourceIn:0,audioEnabled:args.rootHasAudio===true,effects:args.introEffectCount===undefined?1:args.introEffectCount},
    {comp:rootName,compItemId:102,compFrameDuration:1/30,layer:`${prefix}EVENT_${token}_MAIN`,name:`${prefix}EVENT_${token}_MAIN`,layerId:3004,sourceType:"comp",sourceName:args.expectedRootCompName||"CODX_133_E01_ROOT",sourceItemIndex:3,sourceItemId:503,hasVideo:true,hasAudio:true,enabled:true,startTime:0,inPoint:2,outPoint:8,sourceIn:2,audioEnabled:args.rootHasAudio===true,effects:args.mainEffectCount===undefined?0:args.mainEffectCount},
    {comp:rootName,compItemId:102,compFrameDuration:1/30,layer:targetLayerName,name:targetLayerName,layerId:3005,sourceType:"none",sourceName:null,sourceItemId:null,hasVideo:true,hasAudio:false,comment:`AE_AGENT_SLIDESHOW:${prefix}:${rootName}:${targetLayerName}`,enabled:false,audioEnabled:false,inPoint:0,outPoint:8,effects:args.expectedEffectCount===undefined?0:args.expectedEffectCount},
    {comp:rootName,compItemId:102,compFrameDuration:1/30,layer:`${prefix}BACKGROUND`,name:`${prefix}BACKGROUND`,layerId:3006,sourceType:"none",sourceName:null,sourceItemId:null,hasVideo:true,hasAudio:false,enabled:true,audioEnabled:false,inPoint:0,outPoint:8}
  ]}};
}
function semanticResult(tool,args,audit){
  if(tool==="rewrite_slideshow_tree_expressions")return{ok:true,expressionReplacements:[{kind:"master",from:"Final Comp",to:args.masterCompName,status:"not_referenced",occurrencesBefore:0,occurrencesAfter:0,changedProperties:[]},{kind:"derived",from:"Scene 1",to:args.expectedRootCompName,status:"not_referenced",occurrencesBefore:0,occurrencesAfter:0,changedProperties:[]}],postVerification:{ok:true,expressionCount:0,replacementsProven:true}};
  if(tool==="configure_slideshow_tree_audio"){const audioRoutes=audit.details.layers.filter((item)=>item.sourceType==="comp").map((item)=>({compItemId:item.compItemId,layerId:item.layerId,sourceItemId:item.sourceItemId,inPoint:item.inPoint,outPoint:item.outPoint,sourceIn:item.sourceIn,audioEnabledBefore:item.audioEnabled,audioEnabledAfter:item.audioEnabled,action:item.audioEnabled?"preserve_audible":"preserve_muted",reason:item.audioEnabled?"unique_audible_route":"muted_before",audiblePaths:item.audioEnabled?[{sourceItemId:9000+item.layerId,inPoint:item.inPoint,outPoint:item.outPoint,sourceIn:item.sourceIn}]:[]}));return{ok:true,audioRouteCountBefore:audioRoutes.length,audioRoutes};}
  return{ok:true};
}
for(const [tool,args] of semanticCases){const audit=auditFor(args),result=semanticResult(tool,args,audit),steps=[{index:1,title:tool,tool,args,mutatesProject:true,status:"completed",result},{index:2,title:"independent audit",tool:"audit_slideshow_generated",args:{},mutatesProject:false,status:"completed",result:audit}],verification=buildSemanticVerification({summary:tool,steps},{ok:true,dryRun:false,steps});assert.strictEqual(verification.unverifiedMutationCount,0,`${tool} must have semantic checks`);assert.strictEqual(verification.status,"passed",`${tool} semantic audit must pass: ${JSON.stringify(verification.checks)}`);}
{
  const args={generatedPrefix:prefix,generatedRootName:"CODX_133_E01_ROOT",audioMode:"mute",protectedSourceFingerprints:semanticProtected},audit=auditFor(args);audit.details.layers.forEach((layer)=>{layer.audioEnabled=false;});assert.strictEqual(verifyAudit("clone_slideshow_event_tree",args,audit).status,"passed");audit.details.layers[0].audioEnabled=true;assert.strictEqual(verifyAudit("clone_slideshow_event_tree",args,audit).status,"needs_review");
  const colorArgs={generatedPrefix:prefix,expectedMasterCompName:"CODX_133_MASTER",targetLayerName:"COLOR",expectedEffectCount:7,duration:8,protectedSourceFingerprints:semanticProtected},colorAudit=auditFor(colorArgs);assert.strictEqual(verifyAudit("copy_slideshow_control_layer",colorArgs,colorAudit).status,"passed");
}

const beforeKey={comp:"CODX_133_E01_ROOT",compItemId:102,layer:"Animated",layerId:8001,property:"ADBE Position",propertyIdentity:"comp:102/layer:8001/property:1:ADBE%20Position:Position",propertyPath:[{propertyIndex:1,matchName:"ADBE Position",name:"Position"}],keyIndex:1,value:{type:"vector",value:[10,20]},time:3,inType:"BEZIER",outType:"BEZIER",inEase:[{speed:1,influence:40}],outEase:[{speed:2,influence:50}],temporalContinuous:true,temporalAutoBezier:false,spatial:true,inSpatial:[-1,0],outSpatial:[1,0],roving:false,spatialContinuous:true,spatialAutoBezier:false};
beforeKey.compDuration=4;
beforeKey.compFrameDuration=1/30;
beforeKey.translationEligible=true;
const afterKey={...beforeKey,time:5,compDuration:6},cloneArgs={generatedPrefix:prefix,generatedRootName:"CODX_133_E01_ROOT",protectedSourceFingerprints:semanticProtected},extendArgs={generatedPrefix:prefix,expectedRootCompName:"CODX_133_E01_ROOT",targetDuration:6,introDuration:2};
const beforeAudit=auditFor(cloneArgs);beforeAudit.root.duration=4;beforeAudit.stats.keyframes=1;beforeAudit.stats.keyMetadataTotal=1;beforeAudit.details.keyMetadata=[beforeKey];const afterAudit=auditFor(extendArgs);afterAudit.root.duration=6;afterAudit.stats.keyframes=1;afterAudit.stats.keyMetadataTotal=1;afterAudit.details.keyMetadata=[afterKey];
const extendSteps=[{index:1,title:"clone",tool:"clone_slideshow_event_tree",args:cloneArgs,mutatesProject:true,status:"completed",result:{ok:true}},{index:2,title:"before",tool:"audit_slideshow_generated",status:"completed",result:beforeAudit},{index:3,title:"extend",tool:"extend_slideshow_cloned_tree",args:extendArgs,mutatesProject:true,status:"completed",result:{ok:true}},{index:4,title:"after",tool:"audit_slideshow_generated",status:"completed",result:afterAudit}],extendVerification=buildSemanticVerification({summary:"extend",steps:extendSteps},{ok:true,dryRun:false,steps:extendSteps});assert.strictEqual(extendVerification.status,"passed",JSON.stringify(extendVerification.checks));

for(const tool of ["apply_slideshow_event_text","replace_slideshow_media_leaf","add_slideshow_event_overlays"]){const args=semanticCases.find((entry)=>entry[0]===tool)[1],audit=auditFor(args);audit.details.texts=[];audit.details.layers=[];const steps=[{index:1,title:tool,tool,args,mutatesProject:true,status:"completed",result:{ok:true}},{index:2,title:"empty audit",tool:"audit_slideshow_generated",status:"completed",result:audit}],verification=buildSemanticVerification({summary:"negative",steps},{ok:true,dryRun:false,steps});assert.strictEqual(verification.status,"needs_review",`${tool} no-op audit must fail`);}

function verifyAudit(tool,args,audit){const steps=[{index:1,title:tool,tool,args,mutatesProject:true,status:"completed",result:{ok:true}},{index:2,title:"independent audit",tool:"audit_slideshow_generated",status:"completed",result:audit}];return buildSemanticVerification({summary:tool,steps},{ok:true,dryRun:false,steps});}
for (const sample of [
  {label:"shortening preserves key time",duration:3,time:3,eligible:true,status:"passed"},
  {label:"shortening must not translate outro",duration:3,time:2,eligible:true,status:"needs_review"},
  {label:"sub-frame margin preserves key time",duration:4.05,time:3,eligible:true,status:"passed"},
  {label:"expression property preserves key time",duration:6,time:3,eligible:false,status:"passed"},
  {label:"expression property must not translate",duration:6,time:5,eligible:false,status:"needs_review"}
]) {
  const steps=JSON.parse(JSON.stringify(extendSteps));
  steps[1].result.details.keyMetadata[0].translationEligible=sample.eligible;
  steps[2].args.targetDuration=sample.duration;
  steps[3].result.root.duration=sample.duration;
  Object.assign(steps[3].result.details.keyMetadata[0],{compDuration:sample.duration,time:sample.time,translationEligible:sample.eligible});
  const verification=buildSemanticVerification({summary:sample.label,steps},{ok:true,dryRun:false,steps});
  assert.strictEqual(verification.status,sample.status,sample.label);
}
for (const [delta,expected] of [[0.0000058,"passed"],[0.0001001,"needs_review"],[0.01,"needs_review"]]) {
  const steps=JSON.parse(JSON.stringify(extendSteps));
  steps[3].result.details.keyMetadata[0].inSpatial[0]+=delta;
  const verification=buildSemanticVerification({summary:"AE spatial float precision",steps},{ok:true,dryRun:false,steps});
  assert.strictEqual(verification.status,expected,`Spatial tangent delta ${delta}`);
}
{
  const steps=JSON.parse(JSON.stringify(extendSteps));steps[3].result.details.keyMetadata[0].inSpatial.push(0);
  assert.strictEqual(buildSemanticVerification({summary:"Spatial dimensions mismatch",steps},{ok:true,dryRun:false,steps}).status,"needs_review");
}
const negativeAudits=[
  ["clone_slideshow_event_tree","source changed",a=>{a.sourceFingerprints[0].unchanged=false;}],
  ["clone_slideshow_event_tree","source evidence missing",a=>{a.sourceFingerprints=[];}],
  ["rewrite_slideshow_tree_expressions","old double quoted target",a=>{a.details.expressions[0].expression='comp("Final Comp")';}],
  ["rewrite_slideshow_tree_expressions","old single quoted target",a=>{a.details.expressions[0].expression="comp('Final Comp')";}],
  ["rewrite_slideshow_tree_expressions","expression error",a=>{a.details.expressions[0].error="missing comp";}],
  ["apply_slideshow_event_text","partial title",a=>{a.details.texts[0].text="FULL";}],
  ["apply_slideshow_event_text","wrong weight",a=>{a.details.texts[0].font="TimesNewRomanPSMT";}],
  ["apply_slideshow_event_text","title outside frame",a=>{a.details.texts[0].rect.width=2000;}],
  ["replace_slideshow_media_leaf","wrong leaf",a=>{a.details.layers[0].comp="unrelated";}],
  ["replace_slideshow_media_leaf","wrong media",a=>{a.details.layers[0].sourcePath="C:\\wrong.png";}],
  ["replace_slideshow_media_leaf","wrong source offset",a=>{a.details.layers[0].startTime=-1;}],
  ["replace_slideshow_media_leaf","short coverage",a=>{a.details.layers[0].outPoint=3;}],
  ["replace_slideshow_media_leaf","hidden visual",a=>{a.details.layers[0].enabled=false;}],
  ["replace_slideshow_media_leaf","unexpected audio",a=>{a.details.layers[0].audioEnabled=true;}],
  ["replace_slideshow_media_leaf","changed speed",a=>{a.details.layers[0].stretch=150;}],
  ["copy_slideshow_event_pair","gap at intro/main",a=>{a.details.layers[3].inPoint=2.5;}],
  ["copy_slideshow_event_pair","lost entrance effect",a=>{a.details.layers[2].effects=0;}],
  ["copy_slideshow_event_pair","unexpected main effect",a=>{a.details.layers[3].effects=1;}],
  ["copy_slideshow_event_pair","duplicate intro",a=>{a.details.layers.push({...a.details.layers[2]});}],
  ["copy_slideshow_event_pair","intro outside exact master",a=>{a.details.layers[2].comp="OTHER_MASTER";}],
  ["add_slideshow_event_overlays","audio visible",a=>{a.details.layers[1].enabled=true;}],
  ["add_slideshow_event_overlays","audio muted",a=>{a.details.layers[1].audioEnabled=false;}],
  ["add_slideshow_event_overlays","wrong audio",a=>{a.details.layers[1].sourcePath="C:\\wrong.wav";}],
  ["add_slideshow_event_overlays","audio short coverage",a=>{a.details.layers[1].outPoint=3;}],
  ["add_slideshow_event_overlays","wrong caption",a=>{a.details.texts[1].text="OTHER";}],
  ["copy_slideshow_control_layer","unowned control",a=>{a.details.layers[4].comment="";}],
  ["copy_slideshow_control_layer","short control",a=>{a.details.layers[4].outPoint=7;}],
  ["copy_slideshow_control_layer","wrong control effects",a=>{a.details.layers[4].effects=1;}],
  ["copy_slideshow_control_layer","duplicate control",a=>{a.details.layers.push({...a.details.layers[4]});}],
  ["copy_slideshow_control_layer","control outside exact master",a=>{a.details.layers[4].comp="OTHER_MASTER";}],
  ["configure_slideshow_tree_audio","duplicate audible path",a=>{a.issues=["duplicate_audible_path"];a.ok=false;}],
  ["create_slideshow_master","missing background",a=>{a.details.layers.pop();}],
  ["create_slideshow_master","wrong duration",a=>{a.root.duration=7;}]
];
for(const [tool,label,mutate] of negativeAudits){const args=semanticCases.find(entry=>entry[0]===tool)[1],audit=auditFor(args);mutate(audit);assert.strictEqual(verifyAudit(tool,args,audit).status,"needs_review",`${tool}: ${label} must fail`);}
for(const [label,mutate] of [
  ["wrong key time",a=>{a.details.keyMetadata[0].time=4;}],
  ["changed key value",a=>{a.details.keyMetadata[0].value.value=[999,999];}],
  ["changed property identity",a=>{a.details.keyMetadata[0].propertyIdentity="comp:102/layer:8001/property:9:ADBE Position:Position";}],
  ["changed full property path",a=>{a.details.keyMetadata[0].propertyPath[0].propertyIndex=9;}],
  ["lost temporal easing",a=>{a.details.keyMetadata[0].inEase[0].influence=33;}],
  ["lost spatial tangent",a=>{a.details.keyMetadata[0].inSpatial=[0,0];}],
  ["lost continuous flag",a=>{a.details.keyMetadata[0].temporalContinuous=false;}],
  ["truncated read-back",a=>{a.details.keyMetadataTruncated=true;}],
  ["missing key",a=>{a.details.keyMetadata=[];a.stats.keyMetadataTotal=0;}]
]){const steps=JSON.parse(JSON.stringify(extendSteps));mutate(steps[3].result);const verification=buildSemanticVerification({summary:label,steps},{ok:true,dryRun:false,steps});assert.strictEqual(verification.status,"needs_review",`${label} must fail`);}

process.stdout.write(`${JSON.stringify({ok:true,tools:TOOL_NAMES.length,stages:plan.stageCount,maxStepsPerStage:plan.maxStepsPerStage,negativeAudits:negativeAudits.length+9})}\n`);
