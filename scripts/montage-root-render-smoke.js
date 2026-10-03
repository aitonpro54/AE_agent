"use strict";
const assert=require("node:assert/strict");
const {createMontageNativeFixture}=require("./montage-native-fixture");
const {nativeRootRenderScript,nativeRootRenderProbeScript,rootRenderReaderFunctionSource,validateRootRenderGraph,compareRootRenderGraphs,mapRootRenderSample,
  validateNativeRenderState,canonicalRootRenderFacts,rootRenderCanonicalFactsFunctionSource}=require("../mcp-server/montage-root-render");
const {deepClone,normalizeBudgets}=require("../mcp-server/montage-contract");
const {nativeLayerScript,readNativeLayer}=require("../mcp-server/montage-native");
const {geometryReadScript,normalizeTransformValue}=require("../mcp-server/placeholder-geometry");
let passed=0;
function test(name,action){try{action();passed++;}catch(e){console.error("FAIL "+name);throw e;}}

function fixture(){
  const f=createMontageNativeFixture();
  // These are synthetic SDK observations, not evidence of an AE host. Exercise
  // the actual emitted reader against native-style objects and getter failures.
  f.change(`
    app.version="26.2x49";
    var GpuAccelType={SOFTWARE:17,CUDA:18,OPENCL:19,Metal:20};
    var BlendingMode={NORMAL:110};
    var FrameBlendingType={NO_FRAME_BLEND:210};
    var LayerQuality={BEST:310};
    var LayerSamplingQuality={BILINEAR:410,BICUBIC:411};
    var AutoOrientType={NO_AUTO_ORIENT:510};
    var FieldSeparationType={OFF:610,UPPER_FIELD_FIRST:611};
    var PulldownPhase={OFF:710};
    app.project.workingSpace="";app.project.workingGamma=2.2;app.project.linearizeWorkingSpace=false;
    app.project.linearBlending=false;app.project.compensateForSceneReferredProfiles=false;app.project.gpuAccelType=17;
    app.project.colorManagementSystem=0;app.project.revision=123;
    function FileSource(file){this.file=file;this.isStill=false;this.hasAlpha=false;this.nativeFrameRate=30;
      this.displayFrameRate=30;this.conformFrameRate=0;this.loop=1;this.fieldSeparationType=610;this.removePulldown=710;}
    for(var gi=0;gi<items.length;gi++){
      var item=items[gi];item.useProxy=false;item.frameDuration=1/30;
      if(item instanceof CompItem){
        item.displayStartTime=0;item.preserveNestedFrameRate=false;item.preserveNestedResolution=false;item.motionBlur=false;
        item.frameBlending=false;item.draft3d=false;item.bgColor=[0,0,0];
        // Synthetic observations of the parent-verified exact host mapping.
        item.renderer="ADBE Advanced 3d";item.renderers=[item.renderer,"ADBE Calder","ADBE Ernst"];
        for(var gl=0;gl<item._layers.length;gl++){
          var layer=item._layers[gl];layer.shy=false;layer.audioEnabled=true;layer.hasAudio=true;layer.solo=false;
          layer.guideLayer=false;layer.adjustmentLayer=false;layer.nullLayer=false;layer.motionBlur=false;layer.frameBlending=false;
          layer.preserveTransparency=false;layer.blendingMode=110;layer.frameBlendingType=210;layer.quality=310;
          layer.samplingQuality=410;layer.autoOrient=510;layer.groups[0].children[1].dimensionsSeparated=false;
        }
      }else item.mainSource=new FileSource(item.file);
    }
  `);
  const opts={rootCompItemId:100,readerId:"fixture_read"};
  const read=options=>f.execute(`JSON.stringify((function(){${nativeRootRenderScript({...opts,...options})}})())`);
  // This separately supplied fixture-only native-API record establishes how the
  // pure validator treats a real future source-color read. Reader never invents it.
  const optionsFor=graph=>({...opts,projectFile:f.projectFilePath,fps:30,sourceInterpretationEvidence:graph.sources.map(s=>({
    schema:"ae-agent-native-source-color.v1",readerId:graph.readerId,hostVersion:graph.hostVersion,sourceItemId:s.itemId,file:s.file,
    commandId:"fixture_native_color",colorEngine:"adobe",inputProfileDisabled:true,interpretAsLinearLight:false}))});
  return {...f,read,optionsFor};
}
function isolated(action){const f=fixture();try{action(f);}finally{f.cleanup();}}
function expectBlocked(f,options){const g=f.read(options),v=validateRootRenderGraph(g,f.optionsFor(g));assert.equal(v.ok,false,JSON.stringify(v));assert.equal(v.completeRootRenderState,false);return {g,v};}

test("actual emitted reader closes root/nested/file graph without writes",()=>isolated(f=>{
  const g=f.read();assert.equal(g.completeObservation,true,JSON.stringify(g.blockers));assert.equal(g.comps.length,3);assert.equal(g.sources.length,2);
  assert.deepEqual(g.comps.find(c=>c.itemId===100).stackOrder,[10,11]);assert.equal(f.getWrites(),0);assert.deepEqual(JSON.parse(f.change("JSON.stringify(undo)")),[]);
  const v=validateRootRenderGraph(g,f.optionsFor(g));assert.equal(v.ok,true,JSON.stringify(v.blockers));assert.equal(v.sourceReferences.length,2);
  assert.equal(v.completeRootRenderState,false);assert.equal(v.graphSha256.length,64);
}));
test("documented source-color gap and renderer claims stay blocked",()=>isolated(f=>{
  const g=f.read();assert.equal(validateRootRenderGraph(g).ok,false);assert.equal(validateRootRenderGraph(g,{classic3dRenderer:{hostVersion:g.hostVersion,raw:g.comps[0].renderer}}).ok,false);
  assert(validateRootRenderGraph(g,f.optionsFor(g)).ok);
  assert.throws(()=>f.read({classic3dRenderer:{hostVersion:g.hostVersion,raw:"guessed renderer"}}),/client_renderer_mapping_not_allowed/);
  assert.equal(f.getWrites(),0);
}));
test("reader definition can be embedded for a capture bracket",()=>isolated(f=>{
  const options={...f.optionsFor(f.read()),readerId:"embedded_read",budgets:normalizeBudgets().budgets};delete options.sourceInterpretationEvidence;
  const body=`(function(){${rootRenderReaderFunctionSource()}return [aeAgentReadRootRender(${JSON.stringify(options)}),aeAgentReadRootRender(${JSON.stringify(options)})];})()`;
  const rows=f.execute(`JSON.stringify(${body})`);assert.equal(rows.length,2);assert.equal(rows[0].completeObservation,true);assert.equal(rows[1].completeObservation,true);
}));

for(const [name,code] of [
  ["omitted project getter","delete app.project.workingGamma;"],
  ["throwing getter","Object.defineProperty(app.project,'linearBlending',{get:function(){throw new Error('offline getter');}});"],
  ["omitted layer flag","delete precomp2.guideLayer;"],
  ["unknown enum","target1.samplingQuality=999;"],
  ["unsupported effect","precomp2.groups[1].add('effect',1);"],
  ["unsupported keys","target2.groups[0].children[1].numKeys=1;"],
  ["unsupported expression","target2.groups[0].children[0].expressionEnabled=true;"],
  ["unsupported masks","target2.groups[2].add('mask',1);"],
  ["source proxy","footageB.useProxy=true;"],
  ["comp proxy","scene2Comp.useProxy=true;"],
  ["alpha interpretation","footageB.mainSource.hasAlpha=true;"],
  ["field interpretation","footageB.mainSource.fieldSeparationType=611;footageB.mainSource.highQualityFieldSeparation=true;"],
  ["source loop","footageB.mainSource.loop=2;"],
  ["still source","footageB.mainSource.isStill=true;"],
  ["image sequence","footageB.file.fsName='C:/fixture/frame0001.png';"],
  ["reference MOV","footageB.file.fsName='C:/fixture/reference.mov';"],
  ["missing native source file","delete footageB.mainSource.file;"],
  ["disabled unsupported sibling","precomp2.enabled=false;precomp2.groups[1].add('effect',1);"],
  ["out-of-range unsupported sibling","precomp2.inPoint=100;precomp2.outPoint=200;precomp2.groups[2].add('mask',1);"],
  ["cycle","target2.source=masterComp;"],
  ["unobservable transform","delete target2.groups[0].children[1].dimensionsSeparated;"],
  ["separated position","target2.groups[0].children[1].dimensionsSeparated=true;"],
  ["source alpha unknown","delete footageB.mainSource.hasAlpha;"],
  ["source native fps unknown","delete footageB.mainSource.nativeFrameRate;"]
])test(name,()=>isolated(f=>{f.change(code);expectBlocked(f);assert.equal(f.getWrites(),0);}));
test("node/depth/bytes budgets never truncate into complete",()=>isolated(f=>{
  expectBlocked(f,{budgets:{graphNodes:7}});f.change("target1.source=scene2Comp;");
  expectBlocked(f,{budgets:{routeDepth:1}});expectBlocked(f,{budgets:{snapshotBytes:512}});
  assert.throws(()=>f.read({budgets:{graphNodes:5001}}),/invalid_root_render_reader_options/);
}));
test("all native and pure order facts are checked",()=>isolated(f=>{
  const original=f.read();f.change("masterComp._layers.reverse();masterComp._layers[0].index=1;masterComp._layers[1].index=2;");
  const after=f.read();assert.equal(after.completeObservation,true);assert.equal(compareRootRenderGraphs(original,after,f.optionsFor(original)).reason,"root_render_state_drift");
  const omitted=deepClone(original);omitted.comps[0].stackOrder.pop();assert.equal(validateRootRenderGraph(omitted,f.optionsFor(omitted)).ok,false);
  const reordered=deepClone(original);reordered.comps[0].layers.reverse();assert.equal(validateRootRenderGraph(reordered,f.optionsFor(reordered)).ok,false);
  const duplicate=deepClone(original);duplicate.comps[0].layers[0].id=duplicate.comps[0].layers[1].id;assert.equal(validateRootRenderGraph(duplicate,f.optionsFor(duplicate)).ok,false);
}));
for(const [name,code] of [
  ["root bg sibling state","masterComp.bgColor=[0.1,0,0];"],
  ["sibling transform state","target2.groups[0].children[1].value=[950,540];"],
  ["source drift","footageB.duration=11;"],
  ["native quality drift","target2.samplingQuality=411;"],
  ["source path drift","footageB.file.fsName='C:/fixture/new.mp4';"]
])test(name,()=>isolated(f=>{const a=f.read();f.change(code);const b=f.read();assert.equal(compareRootRenderGraphs(a,b,f.optionsFor(a)).ok,false);}));
test("getter absence in returned JSON cannot become complete",()=>isolated(f=>{
  const a=f.read();delete a.sources[0].interpretation.loop;assert.equal(validateRootRenderGraph(a,f.optionsFor(a)).ok,false);
  const b=f.read();b.comps[0].layers[0]=null;assert.doesNotThrow(()=>validateRootRenderGraph(b,f.optionsFor(b)));assert.equal(validateRootRenderGraph(b,f.optionsFor(b)).ok,false);
  const c=f.read();c.sources.push(deepClone(c.sources[0]));assert.equal(validateRootRenderGraph(c,f.optionsFor(c)).ok,false);
}));
test("fractional source samples preserve affine mapping and half-open visibility",()=>isolated(f=>{
  f.change("target1.stretch=200;target1.startTime=0;target1.inPoint=0;target1.outPoint=6;");
  const g=f.read(),req={rootCompItemId:100,target:{compItemId:110,layerId:20},rootTime:1/30,targetTime:1/30,sourceTime:1/60,observedStretch:200,routeLayerIds:[10]};
  const positive=mapRootRenderSample(g,req);assert.equal(positive.ok,true);assert.equal(positive.sourceTime,1/60);assert.equal(positive.sourceItemId,202);
  assert.equal(mapRootRenderSample(g,{...req,sourceTime:1/30}).ok,false);
  assert.equal(mapRootRenderSample(g,{...req,rootTime:6,targetTime:6,sourceTime:3}).ok,false);
  assert.equal(mapRootRenderSample(g,{...req,rootTime:0.015}).ok,false);
  assert.equal(mapRootRenderSample(g,{...req,routeLayerIds:[11]}).ok,false);
}));
test("same graph equality is diagnostic; reader IDs cannot fabricate freshness",()=>isolated(f=>{
  const a=f.read(),b=f.read({readerId:"second_read"});const opt=f.optionsFor(a);
  opt.sourceInterpretationEvidence.push(...f.optionsFor(b).sourceInterpretationEvidence);
  // The validator picks the evidence matching this native read, not old tokens.
  assert.equal(compareRootRenderGraphs(a,b,opt).ok,true);assert.equal(compareRootRenderGraphs(a,b,opt).completeRootRenderState,false);
}));
function guidFixture(f){
  f.change(`
    var ProjectThread={MainThread:801},guidCalls=[];
    function renderGuid(seconds,thread,trace){
      if(thread!==801 || trace!==false)throw new Error('wrong native signature');
      guidCalls.push({itemId:this.id,seconds:seconds,thread:thread,trace:trace});
      return '00000000-0000-0000-0000-'+('000000000000'+this.id).slice(-12);
    }
    CompItem.prototype.getRenderGUID=renderGuid;FootageItem.prototype.getRenderGUID=renderGuid;
  `);
}
test("actual native GUID emitter uses exact enum and fractional leaf time",()=>isolated(f=>{
  guidFixture(f);f.change("target1.stretch=200;target1.startTime=0;target1.inPoint=0;target1.outPoint=6;");
  const g=f.read({rootTimes:[1/30]});assert.equal(g.completeObservation,true,JSON.stringify(g.blockers));assert.equal(g.nativeRenderState.complete,true);
  const sample=g.nativeRenderState.samples[0];assert.equal(sample.rootTime,1/30);assert.equal(sample.items.length,3);
  assert.equal(sample.items.at(-1).seconds,1/60);assert.equal(sample.items.at(-1).itemId,202);assert.deepEqual(sample.items.at(-1).routeLayerIds,[10,20]);
  assert(sample.items.every(i=>i.thread.raw===801 && i.trace===false && i.waitApplied===false));
  assert.equal(g.nativeRenderState.nativeRevisionBefore,123);assert.equal(g.nativeRenderState.nativeRevisionAfter,123);assert.equal(f.getWrites(),0);
  assert.equal(validateRootRenderGraph(g).completeRootRenderState,false,"pure GUID validation never creates trusted native capture freshness");
}));
test("native DeferredCall wait is supported, only a UUID string is accepted",()=>isolated(f=>{
  guidFixture(f);f.change("CompItem.prototype.getRenderGUID=function(t,thread,trace){var g=renderGuid.call(this,t,thread,trace);return {wait:function(){return g;}};};");
  const g=f.read({rootTimes:[0.5]});assert.equal(g.nativeRenderState.complete,true);assert.equal(g.nativeRenderState.samples[0].items[0].waitApplied,true);
  assert.equal(g.nativeRenderState.samples[0].items[0].responseType,"object");
}));
for(const [name,code,reason] of [
  ["missing thread enum","ProjectThread=undefined;","native_project_thread_unavailable"],
  ["missing main thread enum","delete ProjectThread.MainThread;","native_project_thread_unavailable"],
  ["unavailable comp method","delete CompItem.prototype.getRenderGUID;","native_render_guid_unavailable"],
  ["unavailable footage method","delete FootageItem.prototype.getRenderGUID;","native_render_guid_unavailable"],
  ["throwing native method","CompItem.prototype.getRenderGUID=function(){throw new Error('native unavailable');};","native_render_guid_failed"],
  ["fake caller hash","CompItem.prototype.getRenderGUID=function(){return 'a'.repeat(64);};","invalid_native_render_guid"],
  ["non UUID native result","CompItem.prototype.getRenderGUID=function(){return 123;};","invalid_native_render_guid"],
  ["unresolved deferred call","CompItem.prototype.getRenderGUID=function(){return {wait:function(){return {status:'pending'};}};};","invalid_native_render_guid"],
  ["revision drift inside native read","CompItem.prototype.getRenderGUID=function(t,thread,trace){app.project.revision++;return renderGuid.call(this,t,thread,trace);};","incomplete_native_render_guid_observation"]
])test(name,()=>isolated(f=>{guidFixture(f);f.change(code);const g=f.read({rootTimes:[0.5]});assert.equal(g.nativeRenderState.complete,false);assert(g.blockers.some(b=>b.reason===reason),JSON.stringify(g.blockers));}));
test("native GUID budget and root-time budget are explicit blockers",()=>isolated(f=>{
  guidFixture(f);const g=f.read({rootTimes:[0.5,6.5],nativeRenderGuidMaxReads:3});assert.equal(g.nativeRenderState.complete,false);
  assert(g.blockers.some(b=>b.reason==="native_render_guid_budget_exceeded"));
  const calls=JSON.parse(f.change("JSON.stringify(guidCalls)"));assert.equal(calls.length,3);
  assert.throws(()=>f.read({rootTimes:new Array(25).fill(0.5)}),/invalid_root_render_reader_times/);
  assert.throws(()=>f.read({rootTimes:[0.5],nativeRenderGuidMaxReads:33}),/invalid_root_render_guid_budget/);
  const offGrid=f.read({rootTimes:[0.015]});assert.equal(offGrid.nativeRenderState.complete,false);
  assert(offGrid.blockers.some(b=>b.reason==="native_render_guid_time_off_grid"));
}));
test("pure sample mapping bounds path explosion and tolerates invalid leaf rows",()=>{
  const comps=[];
  for(let depth=0;depth<=4;depth++)comps.push({itemId:100+depth,duration:10,frameRate:30,layers:Array.from({length:20},(_,i)=>({
    id:(100+depth)*100+i,sourceKind:depth===4?"file_footage":"comp",sourceItemId:depth===4?200:101+depth,enabled:true,timeRemapEnabled:false,
    stretch:100,startTime:0,inPoint:0,outPoint:10}))});
  const graph={schema:"ae-agent-root-render-graph.v1",rootCompItemId:100,comps,sources:[{itemId:200,duration:10}]};
  const req={rootCompItemId:100,rootTime:0.5,target:{compItemId:104,layerId:10400},targetTime:0.5,sourceTime:0.5,observedStretch:100};
  assert.equal(mapRootRenderSample(graph,req).reason,"root_render_sample_budget_exceeded");
  graph.comps=[null,{...comps[0],layers:[null]}];graph.sources=[null];assert.doesNotThrow(()=>mapRootRenderSample(graph,req));
});
test("canonical source-ID lookup resolves generic AV wrappers as comp and footage",()=>isolated(f=>{
  f.change("function GenericAV(id){this.id=id;}GenericAV.prototype=FootageItem.prototype;precomp1.source=new GenericAV(scene1Comp.id);target1.source=new GenericAV(footageC.id);");
  const g=f.read();assert.equal(g.completeObservation,true,JSON.stringify(g.blockers));assert.equal(g.comps.length,3);assert.equal(g.sources.length,2);
  assert.equal(g.comps[0].layers[0].sourceKind,"comp");assert.equal(g.comps.find(c=>c.itemId===110).layers[0].sourceKind,"file_footage");
  assert(g.sources.some(s=>s.itemId===202));assert.equal(validateRootRenderGraph(g,f.optionsFor(g)).ok,true);assert.equal(f.getWrites(),0);
}));
test("missing/duplicate canonical project IDs never use wrapper shape as fallback",()=>isolated(f=>{
  f.change("precomp1.source={id:99999};");const g=f.read();assert.equal(g.completeObservation,false);
  assert(g.blockers.some(b=>b.reason==="canonical_source_item_unavailable"));
  f.change("precomp1.source=scene1Comp;footageB.id=scene1Comp.id;");const duplicate=f.read();assert.equal(duplicate.completeObservation,false);
  assert(duplicate.blockers.some(b=>b.reason==="invalid_or_duplicate_native_item_id"));
}));
test("native 2D three-coordinate observations are accepted only with disabled 3D",()=>isolated(f=>{
  f.change("target1.groups[0].children[0].value=[960,540,0];target1.groups[0].children[1].value=[970,530,0];target1.groups[0].children[2].value=[90,90,100];");
  const g=f.read();assert.equal(validateRootRenderGraph(g,f.optionsFor(g)).ok,true);
  f.change("target1.threeDLayer=true;");expectBlocked(f);
}));
test("observed engine0/None project admits positively inactive compensation, preserves raw true",()=>isolated(f=>{
  f.change("app.version='26.2x49';app.project.workingSpace='None';app.project.compensateForSceneReferredProfiles=true;");
  const g=f.read(),opt=f.optionsFor(g);assert.equal(g.project.compensateForSceneReferredProfiles,true);
  assert.equal(g.project.sceneReferredCompensation.status,"not_applicable");assert.equal(validateRootRenderGraph(g,opt).ok,true);
  f.change("app.project.colorManagementSystem=1;");assert.equal(validateRootRenderGraph(f.read(),opt).ok,false);
}));
test("full native opaque state supplies source-state observation without color false claims",()=>isolated(f=>{
  guidFixture(f);const g=f.read({rootTimes:[0.5]}),opt={...f.optionsFor(g),rootTimes:[0.5]};delete opt.sourceInterpretationEvidence;
  const native=validateNativeRenderState(g,{rootTimes:[0.5]}),v=validateRootRenderGraph(g,opt);
  assert.equal(native.ok,true,JSON.stringify(native.blockers));assert.equal(v.ok,true,JSON.stringify(v.blockers));
  assert.equal(v.renderStateMode,"native_render_guid_opaque_sources");assert.equal(v.completeRootRenderState,false);
  assert.equal(g.sources[0].interpretation.color.status,"unsupported");assert(v.canonical.nativeRenderState.samples[0].items.length>=3);
}));
test("native GUID schema rejects missing/foreign/reordered/duplicate/mis-mapped facts",()=>isolated(f=>{
  guidFixture(f);f.change("target1.stretch=200;target1.startTime=0;target1.inPoint=0;target1.outPoint=6;");
  const g=f.read({rootTimes:[1/30]}),opt={...f.optionsFor(g),rootTimes:[1/30]};delete opt.sourceInterpretationEvidence;
  for(const mutate of [a=>a.nativeRenderState.samples[0].items.pop(),a=>a.nativeRenderState.samples[0].items.reverse(),
    a=>a.nativeRenderState.samples[0].items.push(deepClone(a.nativeRenderState.samples[0].items[0])),
    a=>a.nativeRenderState.samples[0].items.at(-1).itemId=999,
    a=>a.nativeRenderState.samples[0].items.at(-1).seconds=1/30,
    a=>a.nativeRenderState.samples[0].items[0].guid="a".repeat(64),a=>a.nativeRenderState.samples[0].items[0].thread.name="unknown",
    a=>a.nativeRenderState.samples[0].items[0].trace=true,a=>a.nativeRenderState.samples[0].items[0].waitApplied=true,
    a=>a.nativeRenderState.samples[0].items[0].routeLayerIds=[999],a=>delete a.sources[0].interpretation.color,
    a=>a.nativeRenderState.nativeRevisionAfter++,a=>a.nativeAcquisition.revisionAfter++]){
    const altered=deepClone(g);mutate(altered);assert.equal(validateRootRenderGraph(altered,opt).ok,false);
  }
  assert.equal(validateNativeRenderState(g,{rootTimes:[2/30]}).ok,false);
}));
test("native acquisition stability is checked before excluding only observation revisions",()=>isolated(f=>{
  guidFixture(f);const a=f.read({rootTimes:[0.5]});f.change("app.project.revision=124;");const b=f.read({readerId:"other_acquisition",rootTimes:[0.5]});
  const opt={...f.optionsFor(a),rootTimes:[0.5]};delete opt.sourceInterpretationEvidence;
  assert.equal(compareRootRenderGraphs(a,b,opt).ok,true);
  const projection=canonicalRootRenderFacts(a);assert.equal(projection.readerId,undefined);assert.deepEqual(projection.nativeAcquisition,{stable:true});
  assert.equal(projection.nativeRenderState.nativeRevisionBefore,undefined);assert.deepEqual(projection.nativeRenderState.samples,a.nativeRenderState.samples);
  const unstable=deepClone(b);unstable.nativeAcquisition.revisionAfter++;assert.throws(()=>canonicalRootRenderFacts(unstable),/unstable/);
  const nativeProjection=f.execute(`JSON.stringify((function(){${rootRenderCanonicalFactsFunctionSource()}return aeAgentRootRenderCanonicalFacts(${JSON.stringify(a)});})())`);
  assert.deepEqual(nativeProjection,projection);
}));
test("opaque native render GUID drift is included in canonical equality",()=>isolated(f=>{
  guidFixture(f);const a=f.read({rootTimes:[0.5]});
  f.change("FootageItem.prototype.getRenderGUID=function(t,thread,trace){renderGuid.call(this,t,thread,trace);return '11111111-1111-1111-1111-111111111111';};");
  const b=f.read({rootTimes:[0.5]}),opt={...f.optionsFor(a),rootTimes:[0.5]};delete opt.sourceInterpretationEvidence;
  assert.equal(compareRootRenderGraphs(a,b,opt).reason,"root_render_state_drift");
}));
for(const [name,code] of [
  ["wrong host","app.version='26.2x50';"],
  ["wrong active renderer","masterComp.renderer='ADBE Ernst';"],
  ["unknown renderer enum","masterComp.renderer='caller invented raw';"],
  ["unknown renderer list","masterComp.renderers.push('unknown plugin');"],
  ["reordered available renderers","masterComp.renderers.reverse();"]
])test(`default renderer mapping blocks ${name}`,()=>isolated(f=>{f.change(code);const g=f.read();assert.equal(g.completeObservation,false);
  assert(g.blockers.some(b=>b.reason==="unverified_native_renderer"));assert.equal(validateRootRenderGraph(g,f.optionsFor(g)).ok,false);
}));
test("narrow actual layer emitter canonicalizes observed 2D vector3 and wrapper source ID",()=>isolated(f=>{
  f.change("function GenericAV(id){this.id=id;}GenericAV.prototype=FootageItem.prototype;target1.source=new GenericAV(footageC.id);target1.groups[0].children[0].value=[960,540,0];target1.groups[0].children[1].value=[970,530,0];target1.groups[0].children[2].value=[90,90,100];");
  const body=nativeLayerScript({compItemId:110,layerId:20},200),row=f.execute(`JSON.stringify((function(){${body}})())`);
  assert.deepEqual(row.transform.anchorPoint,[960,540]);assert.deepEqual(row.transform.position,[970,530]);assert.deepEqual(row.transform.scale,[90,90]);
  assert.equal(row.geometry.layer.transformStatic,true);assert.equal(row.sourceItemId,200);assert.equal(row.layer.sourceItemId,202);
  assert.equal(row.layer.source.itemId,202);assert.equal(row.layer.source.file,f.fileCPath);assert.equal(row.layer.source.footageMissing,false);
  assert.equal(row.footprint.complete,true);assert.deepEqual(row.unsupported,[]);assert.equal(f.getWrites(),0);
}));
test("narrow actual route emitter uses canonical CompItem from a generic source wrapper",()=>isolated(f=>{
  f.change("function GenericAV(id){this.id=id;}GenericAV.prototype=FootageItem.prototype;precomp1.source=new GenericAV(scene1Comp.id);precomp1.groups[0].children[0].value=[960,540,0];precomp1.groups[0].children[1].value=[960,540,0];precomp1.groups[0].children[2].value=[100,100,100];");
  const body=nativeLayerScript({compItemId:100,layerId:10}),row=f.execute(`JSON.stringify((function(){${body}})())`);
  assert.equal(row.layer.sourceItemId,110);assert.equal(row.layer.source.file,null);assert.equal(row.layer.source.width,1920);
  assert.equal(row.geometry.source.width,1920);assert.equal(row.geometry.layer.transformStatic,true);assert.deepEqual(row.transform.scale,[100,100]);
}));
for(const [name,code] of [
  ["position nonzero Z","target1.groups[0].children[1].value=[970,530,1];"],
  ["anchor nonzero Z","target1.groups[0].children[0].value=[960,540,1];"],
  ["scale unknown Z","target1.groups[0].children[2].value=[90,90,99];"],
  ["unobserved 3D flag","delete target1.threeDLayer;"],
  ["enabled 3D","target1.threeDLayer=true;"],
  ["missing canonical source","target1.source={id:99999};"],
  ["duplicate canonical source","footageB.id=footageC.id;"],
  ["separated position","target1.groups[0].children[1].dimensionsSeparated=true;"],
  ["animated transform","target1.groups[0].children[1].numKeys=1;"]
])test(`narrow geometry rejects ${name}`,()=>isolated(f=>{
  f.change(code);const body=geometryReadScript({compItemId:110,layerId:20}),row=f.execute(`JSON.stringify((function(){${body}})())`);
  assert.equal(row.geometry.layer.transformStatic,false);assert(row.unsupported.length>0);assert.equal(f.getWrites(),0);
}));
test("shared transform normalization refuses assumptions and accepts only observed planar tuples",()=>{
  assert.deepEqual(normalizeTransformValue("position",[1,2,0],false),[1,2]);assert.deepEqual(normalizeTransformValue("scale",[100,100,100],false),[100,100]);
  for(const tuple of [["position",[1,2,1],false],["scale",[100,100,0],false],["anchorPoint",[1,2,0],true],["position",[1,2],undefined],["scale",[1,"2"],false]])
    assert.throws(()=>normalizeTransformValue(...tuple),/placeholder_transform/);
});
test("actual readonly class probe records native getters, constructors and slot views",()=>isolated(f=>{
  guidFixture(f);f.change("function GenericAV(id){this.id=id;}GenericAV.prototype=FootageItem.prototype;precomp1.source=new GenericAV(scene1Comp.id);");
  const body=nativeRootRenderProbeScript({rootCompItemId:100,readerId:"class_probe",rootTimes:[0.5]}),g=f.execute(`JSON.stringify((function(){${body}})())`);
  const d=g.nativeClassDiagnostics;assert.equal(d.schema,"ae-agent-native-class-diagnostics.v1");assert.equal(d.complete,true);assert.equal(d.projectItems.length,6);
  const comp=d.projectItems.find(i=>i.itemId===110);assert.equal(comp.immediateComp.value,true);assert.equal(comp.readerProjectItem.instances.CompItem.value,true);
  assert.equal(typeof comp.readerSlotIndex,"number");
  assert.equal(comp.direct.getters.numLayers.type,"number");assert.equal(comp.direct.getters.layer.type,"function");
  const source=d.sources.find(s=>s.compItemId===100&&s.sourceItemId===110);assert.equal(source.sourceImmediateComp.value,false);
  assert.equal(source.sourceImmediateFootage.value,true);assert.equal(source.freshProjectItem.instances.CompItem.value,true);
  assert.equal(f.getWrites(),0);assert.equal(g.nativeAcquisition.stable,true);
}));
test("class probe marks inaccessible getters and bounded omissions without class fallback",()=>isolated(f=>{
  f.change("Object.defineProperty(scene1Comp,'constructor',{get:function(){throw new Error('native constructor inaccessible');}});");
  const body=nativeRootRenderProbeScript({rootCompItemId:100,readerId:"class_probe",rootTimes:[0.5]}),g=f.execute(`JSON.stringify((function(){${body}})())`);
  assert.equal(g.nativeClassDiagnostics.projectItems.find(i=>i.itemId===110).direct.constructorType,"threw");
  f.change("for(var k=0;k<27;k++)items.push({id:1000+k});");
  const large=f.execute(`JSON.stringify((function(){${body}})())`);assert.equal(large.nativeClassDiagnostics.complete,false);
  assert.equal(large.nativeClassDiagnostics.blockers[0].reason,"native_class_probe_item_budget_or_unknown");
  assert.equal(f.getWrites(),0);
}));
test("plain class branches record positive native Comp/Footage flags before other source reads",()=>isolated(f=>{
  guidFixture(f);const body=nativeRootRenderProbeScript({rootCompItemId:100,readerId:"class_branch",rootTimes:[0.5]});
  const g=f.execute(`JSON.stringify((function(){${body}})())`),rootLayer=g.comps.find(c=>c.itemId===100).layers[0];
  assert.deepEqual(rootLayer.sourceClass,{canonicalItemId:110,CompItem:true,FootageItem:false,kind:"comp"});
  assert.deepEqual(g.rootNativeClass,{canonicalItemId:100,CompItem:true,FootageItem:false,kind:"comp"});
  assert(g.nativeClassificationTrace.every(t=>stableSame(t.beforeSpecificSourceReads,t.afterSpecificSourceReads)));
  assert.equal(validateRootRenderGraph(g,{rootTimes:[0.5]}).ok,true);assert.equal(f.getWrites(),0);
  function stableSame(a,b){return JSON.stringify(a)===JSON.stringify(b);}
}));
test("unknown and ambiguous native class flags block rather than selecting a label",()=>isolated(f=>{
  f.change("Object.setPrototypeOf(CompItem.prototype,FootageItem.prototype);");
  const ambiguous=f.read();assert.equal(ambiguous.completeObservation,false);assert.equal(ambiguous.rootNativeClass.CompItem,true);
  assert.equal(ambiguous.rootNativeClass.FootageItem,true);assert(ambiguous.blockers.some(b=>b.reason==="ambiguous_native_media_class"));
  f.change("Object.setPrototypeOf(CompItem.prototype,Object.prototype);FootageItem=undefined;");
  const unknown=f.read();assert.equal(unknown.completeObservation,false);assert.equal(unknown.rootNativeClass.FootageItem,null);
  assert(unknown.blockers.some(b=>b.reason==="native_footage_constructor_unavailable"));
}));
test("declared complete cannot hide omitted/wrong class observation",()=>isolated(f=>{
  guidFixture(f);const g=f.read({rootTimes:[0.5]});
  for(const mutate of [a=>delete a.rootNativeClass,a=>delete a.comps[0].layers[0].sourceClass,
    a=>a.comps[0].layers[0].sourceClass.canonicalItemId++,a=>a.comps[0].layers[0].sourceClass.FootageItem=true]){
    const changed=deepClone(g);mutate(changed);assert.equal(validateRootRenderGraph(changed,{rootTimes:[0.5]}).ok,false);
  }
}));
test("mutable native-handle fixture requires a fresh item lookup after layer.source access",()=>isolated(f=>{
  guidFixture(f);
  // Fault injection models the observed failure shape, not proof of its native
  // cause: source access changes a shared wrapper's prototype; native lookup
  // restores the canonical subtype. Retaining the wrapper in a map would fail.
  f.change(`var rawSource=scene1Comp;var oldItem=app.project.item;
    app.project.item=function(index){var value=oldItem(index);if(value===scene1Comp)Object.setPrototypeOf(value,CompItem.prototype);return value;};
    Object.defineProperty(precomp1,'source',{get:function(){Object.setPrototypeOf(scene1Comp,FootageItem.prototype);return rawSource;}});`);
  const g=f.read({rootTimes:[0.5]});assert.equal(g.completeObservation,true,JSON.stringify(g.blockers));
  assert.equal(g.comps.find(c=>c.itemId===100).layers[0].sourceClass.CompItem,true);
  assert(g.comps.some(c=>c.itemId===110));assert(g.sources.some(s=>s.itemId===202));
  assert.equal(validateRootRenderGraph(g,{rootTimes:[0.5]}).ok,true);assert.equal(f.getWrites(),0);
}));
test("fresh canonical index lookup rejects ID drift before class or GUID calls",()=>isolated(f=>{
  f.change(`var oldSource=scene1Comp;Object.defineProperty(precomp1,'source',{get:function(){items[1]=footageC;items[5]=scene1Comp;return oldSource;}});`);
  const g=f.read();assert.equal(g.completeObservation,false);
  assert(g.blockers.some(b=>b.reason==="canonical_item_index_identity_changed"));assert.equal(f.getWrites(),0);
}));
console.log(`Montage root-render smoke: ${passed} offline/actual-emitter cases passed; no live proof.`);
async function typedNativeCases(){
  const f=fixture();
  try{
    const run=async body=>({result:f.execute(`JSON.stringify((function(){${body}})())`)});
    f.change("function GenericAV(id){this.id=id;}GenericAV.prototype=FootageItem.prototype;target1.source=new GenericAV(footageC.id);target1.groups[0].children[0].value=[960,540,0];target1.groups[0].children[1].value=[970,530,0];target1.groups[0].children[2].value=[90,90,100];");
    const positive=await readNativeLayer({compItemId:110,layerId:20},200,run);assert.equal(positive.layer.sourceItemId,202);
    assert.deepEqual(positive.transform.position,[970,530]);assert.deepEqual(positive.transform.scale,[90,90]);
    f.change("target1.groups[0].children[1].value=[970,530,1];");
    await assert.rejects(readNativeLayer({compItemId:110,layerId:20},200,run),/montage_native_read_incomplete/);
    f.change("target1.groups[0].children[1].value=[970,530,0];target1.source={id:99999};");
    await assert.rejects(readNativeLayer({compItemId:110,layerId:20},200,run),/montage_native_read_incomplete/);
    assert.equal(f.getWrites(),0);console.log("Montage typed native reader: 3 actual-emitter parser cases passed; no live proof.");
  }finally{f.cleanup();}
}
typedNativeCases().catch(error=>{console.error(error);process.exitCode=1;});
