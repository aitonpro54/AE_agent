"use strict";

const { normalizeManifest } = require("./slideshow-manifest");

const MAX_STAGE_STEPS = 50;

function inputError(message) { const error = new Error(message); error.code = "INVALID_SLIDESHOW_INVENTORY"; throw error; }
function exactKeys(value, allowed, label) { if (!value || typeof value !== "object" || Array.isArray(value)) inputError(`${label} must be an object.`); const extra=Object.keys(value).find((key)=>!allowed.includes(key)); if(extra) inputError(`${label}.${extra} is not supported.`); }
function positiveInt(value,label,allowZero=false){if(!Number.isInteger(value)||value<(allowZero?0:1))inputError(`${label} must be ${allowZero?"a non-negative":"a positive"} integer.`);return value;}
function finite(value,label){if(typeof value!=="number"||!Number.isFinite(value)||value<=0)inputError(`${label} must be a positive finite number.`);return value;}
function nonempty(value,label){if(typeof value!=="string"||!value.trim())inputError(`${label} must be a non-empty string.`);return value.trim();}

function normalizeInventory(value, manifest) {
  exactKeys(value, ["finalComp", "scenes"], "inventory");
  exactKeys(value.finalComp, ["itemIndex","name","duration","numLayers","controlLayerName"], "inventory.finalComp");
  const finalComp = {
    itemIndex: positiveInt(value.finalComp.itemIndex,"inventory.finalComp.itemIndex"),
    name: nonempty(value.finalComp.name,"inventory.finalComp.name"),
    duration: finite(value.finalComp.duration,"inventory.finalComp.duration"),
    numLayers: positiveInt(value.finalComp.numLayers,"inventory.finalComp.numLayers"),
    controlLayerName: nonempty(value.finalComp.controlLayerName||"CONTROL","inventory.finalComp.controlLayerName")
  };
  if(finalComp.name!==manifest.finalComp.name)inputError("inventory.finalComp.name does not match manifest.finalComp.name.");
  if(!Array.isArray(value.scenes)||!value.scenes.length)inputError("inventory.scenes must be a non-empty array.");
  const byScene = new Map();
  value.scenes.forEach((scene,index)=>{
    exactKeys(scene,["scene","itemIndex","name","duration","numLayers"],`inventory.scenes[${index}]`);
    const row={scene:positiveInt(scene.scene,`inventory.scenes[${index}].scene`),itemIndex:positiveInt(scene.itemIndex,`inventory.scenes[${index}].itemIndex`),name:nonempty(scene.name,`inventory.scenes[${index}].name`),duration:finite(scene.duration,`inventory.scenes[${index}].duration`),numLayers:positiveInt(scene.numLayers,`inventory.scenes[${index}].numLayers`)};
    if(row.name!==`Scene ${row.scene}`)inputError(`${row.name} does not match Scene ${row.scene}.`);
    if(byScene.has(row.scene))inputError(`Duplicate inventory scene ${row.scene}.`);
    byScene.set(row.scene,row);
  });
  manifest.events.forEach((event)=>{if(!byScene.has(event.scene))inputError(`Missing inventory for Scene ${event.scene}.`);});
  return { finalComp, scenes: byScene };
}

function step(title, tool, args, mutatesProject, resultBindings) {
  const bindings=resultBindings||{},unboundArgs={...(args||{})};for(const field of Object.keys(bindings))delete unboundArgs[field];
  return { title, intent:title,tool,args:unboundArgs,resultBindings:bindings,dependsOnStep:null,mutatesProject,verifyAfter:mutatesProject,idempotencyKeyTemplate:mutatesProject?`ae-plan-{requestId}-${tool}-{stepIndex}`:null };
}
function binding(index, path) { return `{{steps.${index}.${path}}}`; }
function add(steps, value) { steps.push(value); return steps.length; }
function auditArgs(base,name,duration,fingerprints){return {...base,expectedRootCompName:name,expectedDuration:duration,sourceFingerprints:(fingerprints||[]).map((item)=>({name:item.name,duration:item.duration,numLayers:item.numLayers}))};}

function makeStage(name, targetProjectFile, steps, eventIds) {
  if(steps.length>MAX_STAGE_STEPS)throw new Error(`Stage ${name} exceeds ${MAX_STAGE_STEPS} steps.`);
  return { name, targetProject:{file:targetProjectFile}, summary:name, risk:"medium",requiresCheckpoint:true,solutionIds:[],clarifyingQuestion:null,eventIds:eventIds||[],steps };
}

function setupStage(data, inventory) {
  const m=data.manifest, base={expectedProjectFile:m.projectPath,generatedPrefix:m.prefix},steps=[];
  add(steps,step("Read and guard the exact saved project","get_project_info",{},false));
  const master=add(steps,step("Create owned generated slideshow master","create_slideshow_master",{...base,masterName:m.masterName,width:m.width,height:m.height,pixelAspect:m.pixelAspect,duration:m.duration,frameRate:m.frameRate,backgroundColor:[0.917647,0.917647,0.917647]},true));
  add(steps,step("Audit new generated master","audit_slideshow_generated",auditArgs(base,m.masterName,m.duration,[]),false));
  add(steps,step("Copy guarded CONTROL layer and preserve its identity","copy_slideshow_control_layer",{...base,expectedSourceCompName:inventory.finalComp.name,sourceLayerName:inventory.finalComp.controlLayerName,expectedMasterCompName:m.masterName,duration:m.duration},true));
  add(steps,step("Audit master after CONTROL copy","audit_slideshow_generated",auditArgs(base,m.masterName,m.duration,[inventory.finalComp]),false));
  return makeStage("slideshow-setup",m.projectPath,steps,[]);
}

function appendEvent(steps,data,inventory,event,masterReadStep){
  const m=data.manifest,scene=inventory.scenes.get(event.scene),base={expectedProjectFile:m.projectPath,generatedPrefix:m.prefix},rootName=`${m.prefix}E${event.id}_ROOT`,fingerprints=[{itemIndex:scene.itemIndex,name:scene.name,duration:scene.duration,numLayers:scene.numLayers}];
  add(steps,step(`Clone Scene ${event.scene} for event ${event.id}`,"clone_slideshow_event_tree",{...base,expectedSourceCompName:scene.name,generatedRootName:rootName},true));
  add(steps,step(`Audit isolated clone for event ${event.id}`,"audit_slideshow_generated",auditArgs(base,rootName,scene.duration,fingerprints),false));
  add(steps,step(`Extend event ${event.id} clone at 1x speed`,"extend_slideshow_cloned_tree",{...base,expectedRootCompName:rootName,targetDuration:event.duration,introDuration:m.introDuration},true));
  add(steps,step(`Audit duration and key metadata for event ${event.id}`,"audit_slideshow_generated",auditArgs(base,rootName,event.duration,fingerprints),false));
  add(steps,step(`Rewrite explicit comp references for event ${event.id}`,"rewrite_slideshow_tree_expressions",{...base,expectedRootCompName:rootName,masterCompName:m.masterName,replacements:[]},true));
  add(steps,step(`Audit rewritten expressions for event ${event.id}`,"audit_slideshow_generated",auditArgs(base,rootName,event.duration,fingerprints),false));
  add(steps,step(`Apply title and newspaper text for event ${event.id}`,"apply_slideshow_event_text",{...base,expectedRootCompName:rootName,sceneNumber:event.scene,titleCompName:`Text ${String(event.scene).padStart(2,"0")}`,hero:event.hero,title:event.title,titleWrap:event.titleWrap,articleChunks:data.articles[event.hero]},true));
  add(steps,step(`Audit fitted text and newspaper layout for event ${event.id}`,"audit_slideshow_generated",auditArgs(base,rootName,event.duration,fingerprints),false));
  for(let i=0;i<event.images.length;i+=1){const group=event.images[i];add(steps,step(`Relink clean media leaf ${i+1} for event ${event.id}`,"replace_slideshow_media_leaf",{...base,expectedRootCompName:rootName,leafName:group.leaf,generatedLeafName:`${m.prefix}E${event.id}_MEDIA_${i+1}`,duration:event.duration,mediaItems:group.items},true));add(steps,step(`Audit clean media leaf ${i+1} for event ${event.id}`,"audit_slideshow_generated",auditArgs(base,rootName,event.duration,fingerprints),false));}
  const audio=add(steps,step(`Dedupe audible paths for event ${event.id}`,"configure_slideshow_tree_audio",{...base,expectedRootCompName:rootName},true));
  add(steps,step(`Audit text, media, audio, effects, and source fingerprint for event ${event.id}`,"audit_slideshow_generated",auditArgs(base,rootName,event.duration,fingerprints),false));
  add(steps,step(`Copy guarded intro/main pair for event ${event.id}`,"copy_slideshow_event_pair",{...base,expectedFinalCompName:inventory.finalComp.name,expectedMasterCompName:m.masterName,expectedRootCompName:rootName,sourceSceneName:scene.name,sceneNumber:event.scene,eventStart:event.start,eventDuration:event.duration,introDuration:m.introDuration,rootHasAudio:false,minimumCopiedEffects:1},true,{rootHasAudio:binding(audio,"result.rootHasAudio")}));
  add(steps,step(`Audit copied pair for event ${event.id}`,"audit_slideshow_generated",auditArgs(base,m.masterName,m.duration,fingerprints),false));
  add(steps,step(`Add explicit overlays for event ${event.id}`,"add_slideshow_event_overlays",{...base,expectedMasterCompName:m.masterName,eventId:event.id,eventStart:event.start,eventDuration:event.duration,audioItems:event.audioOnly,captions:event.captions},true));
  add(steps,step(`Audit master coverage after event ${event.id}`,"audit_slideshow_generated",auditArgs(base,m.masterName,m.duration,fingerprints),false));
}

function eventStages(data,inventory){const stages=[];let cursor=0;while(cursor<data.manifest.events.length){const steps=[];add(steps,step("Read and guard the exact saved project","get_project_info",{},false));const masterRead=add(steps,step("Resolve generated master by exact name","get_comp_details",{compName:data.manifest.masterName,includeLayers:false},false));const ids=[];while(cursor<data.manifest.events.length){const before=steps.length;appendEvent(steps,data,inventory,data.manifest.events[cursor],masterRead);if(steps.length>MAX_STAGE_STEPS){steps.splice(before);break;}ids.push(data.manifest.events[cursor].id);cursor++;}if(!ids.length)throw new Error(`Event ${data.manifest.events[cursor].id} exceeds the stage limit.`);stages.push(makeStage(`slideshow-events-${ids[0]}-${ids[ids.length-1]}`,data.manifest.projectPath,steps,ids));}return stages;}

function buildSlideshowPlan(manifest,articles,inventory){const data=normalizeManifest(manifest,articles),checked=normalizeInventory(inventory,data.manifest),stages=[setupStage(data,checked),...eventStages(data,checked)];return {ok:true,schema:"ae-agent-slideshow-plan.v1",previewLocal:true,mutatesProject:false,requiresFreshEvidenceReview:true,targetProject:{file:data.manifest.projectPath},manifest:data.manifest,stageCount:stages.length,maxStepsPerStage:Math.max(...stages.map((stage)=>stage.steps.length)),stages};}

module.exports={MAX_STAGE_STEPS,buildSlideshowPlan,normalizeInventory};
