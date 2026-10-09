"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),vm=require("node:vm"),{spawnSync}=require("node:child_process");
const native=require("../mcp-server/native-render-variant");
const {buildSemanticVerification}=require("../mcp-server/semantic-verification");
const {reconcilePlanRun,reconciliationReadRequests}=require("../mcp-server/plan-run-reconciliation");
const root=fs.mkdtempSync(path.join(os.tmpdir(),"ae-native-title-"));
const file=path.join(root,"source.aep");fs.writeFileSync(file,"fixture");
const base={expectedProjectFile:file,rootCompItemId:10,variantCompItemId:20,controlledLayerIds:[11,12]};
const variants=[{variantId:"one",activeLayerIds:[11],outputFileName:"one.mov"},{variantId:"two",activeLayerIds:[12],outputFileName:"two.mov"}];
const inspection={...base,variants};
const raw={...base,...variants[0],expectedStateHash:"a".repeat(64),renderSettingsTemplate:"Best Settings",outputModuleTemplate:"Movie",range:{startFrame:3,frameCount:20},timeoutMs:1000};
const copy=v=>JSON.parse(JSON.stringify(v));
if(process.argv.includes("--es3")){
  const acorn=require("internal/deps/acorn/acorn/dist/acorn");
  const parse=body=>acorn.parse("(function(){"+body+"})();",{ecmaVersion:3,allowReserved:"never"});
  parse(native.inspectScript(inspection));parse(native.renderScript(raw,{},path.join(root,"one.mov"),"b".repeat(64)));
  assert.throws(()=>parse("return ()=>1;"));assert.throws(()=>parse("return {native:1};"));
  console.log("Strict ES3 generated host parse PASS; negative parser controls PASS");process.exit(0);
}
let checks=0;
const check=(value,message)=>{assert(value,message);checks++;};
function fixture(options={}) {
  function property(value,keys=[],expression="",spatial=false) {
    return {value,numKeys:keys.length,isSpatial:spatial,canSetExpression:true,expression,expressionEnabled:Boolean(expression),expressionError:"",dimensionsSeparated:false,
      valueAtTime(time,pre){assert(time===0 && pre===true,"static expression reads only pre-expression base at zero");return value;},
      keyTime:i=>keys[i-1].time,keyValue:i=>keys[i-1].value,keyInInterpolationType:()=>"BEZIER",keyOutInterpolationType:()=>"BEZIER",
      keyInTemporalEase:()=>Array.from({length:spatial?1:Array.isArray(value)?value.length:1},()=>({speed:0,influence:33.333})),keyOutTemporalEase:()=>Array.from({length:spatial?1:Array.isArray(value)?value.length:1},()=>({speed:0,influence:33.333})),
      keyTemporalContinuous:()=>true,keyTemporalAutoBezier:()=>false,keyInSpatialTangent:()=>value.map(()=>0),keyOutSpatialTangent:()=>value.map(()=>0),keyRoving:()=>false,keySpatialContinuous:()=>true,keySpatialAutoBezier:()=>false};
  }
  function definitions(layer){
    Object.assign(layer,{startTime:0,inPoint:0,outPoint:2,stretch:100,timeRemapEnabled:false,threeDLayer:false,collapseTransformation:false,parent:null});
    layer.transform={"ADBE Anchor Point":property([0,0],[],"",true),"ADBE Position":property([960,540],[],"",true),"ADBE Scale":property([100,100]),"ADBE Rotate Z":property(0),"ADBE Opacity":property(100)};
    layer.property=name=>name==="ADBE Transform Group" ? {property:n=>layer.transform[n]} : name==="ADBE Text Properties" ? {property:()=>({expressionEnabled:false,value:{text:layer.name}})} : null;
    return layer;
  }
  class CompItem {constructor(id,layers){Object.assign(this,{id,name:"comp"+id,_layers:layers,width:1920,height:1080,pixelAspect:1,duration:2,frameDuration:0.04,displayStartTime:0,useProxy:false,time:0});}get numLayers(){return this._layers.length;}layer(i){return this._layers[i-1];}}
  class AVLayer {constructor(id,enabled,source){Object.assign(this,{id,name:"av"+id,enabled,source,solo:false,guideLayer:false,locked:false,hasTrackMatte:false,isTrackMatte:false,trackMatteType:0,trackMatteLayer:null});definitions(this);}}
  class FootageItem {constructor(id){Object.assign(this,{id,name:"image"+id,file:new File(path.join(root,"image"+id+".png")),width:1920,height:1080,pixelAspect:1,duration:0,frameRate:0,hasVideo:true,hasAudio:false,footageMissing:false,useProxy:false,mainSource:{isStill:true,hasAlpha:true,alphaMode:"STRAIGHT",premulColor:[0,0,0],invertAlpha:false}});}}
  class TextLayer {constructor(id,enabled){Object.assign(this,{id,name:"text"+id,enabled,solo:false,guideLayer:false,locked:false,hasTrackMatte:false,isTrackMatte:false,trackMatteType:0,trackMatteLayer:null});definitions(this);}}
  const layers=[new TextLayer(11,true),new TextLayer(12,false)],target=new CompItem(20,layers),other=new CompItem(30,[]);
  if(options.immutableCompletedLayer)Object.defineProperty(layers[1],"enabled",{get(){return false;},set(){throw Error("already-disabled layer is immutable");}});
  const rootComp=new CompItem(10,[{id:21,name:"common",enabled:true,solo:false,guideLayer:false,locked:false,hasTrackMatte:false,isTrackMatte:false,trackMatteType:0,source:target}]);
  const projectItems=[rootComp,target,other],writes=[];
  let producer=null,background=null,matteSource=null;
  if(options.matted){
    matteSource=new CompItem(40,[]);projectItems.push(matteSource);
    producer=new AVLayer(13,false,matteSource);Object.assign(producer,{name:"matte",isTrackMatte:true});
    let enabled=false;Object.defineProperty(producer,"enabled",{get:()=>enabled,set:v=>{writes.push({id:13,property:"enabled",value:v});enabled=v;},configurable:true});
    for(const layer of layers)Object.assign(layer,{hasTrackMatte:true,trackMatteType:1,trackMatteLayer:producer});
    target._layers.push(producer);
    if(options.background){background=definitions({id:14,name:"background",enabled:true,solo:false,guideLayer:false,locked:false,hasTrackMatte:false,isTrackMatte:false,trackMatteType:0,trackMatteLayer:null,source:matteSource});background.startTime=0.04;background.inPoint=0.04;background.outPoint=2.04;target._layers.push(background);}
  }
  let nested=null;
  if(options.nested){
    const splash=matteSource || new CompItem(40,[]),bg=new CompItem(50,[]),paper=new CompItem(60,[]),png=new FootageItem(70),legacyMatte=new FootageItem(71);
    if(!matteSource)projectItems.push(splash);projectItems.push(bg,paper,png,legacyMatte);
    const nestedProducer=new AVLayer(51,false,options.legacyFootageMatte ? legacyMatte : paper),consumer=new AVLayer(52,true,png),visible=new AVLayer(53,true,options.legacyFootageMatte ? legacyMatte : paper);
    nestedProducer.isTrackMatte=true;Object.assign(consumer,{hasTrackMatte:true,trackMatteType:1,trackMatteLayer:nestedProducer});visible.startTime=0.04;visible.inPoint=0.04;visible.outPoint=2.04;
    bg._layers.push(nestedProducer,consumer,visible);let sharedConsumer=null;
    if(options.sharedConsumer){sharedConsumer=new AVLayer(54,false,png);Object.assign(sharedConsumer,{hasTrackMatte:true,trackMatteType:1,trackMatteLayer:nestedProducer});bg._layers.push(sharedConsumer);}
    splash._layers.push(new AVLayer(41,true,bg),new AVLayer(42,true,bg));if(!matteSource)rootComp._layers.push(new AVLayer(22,true,splash));
    nested={splash,bg,paper,png,legacyMatte,producer:nestedProducer,consumer,visible,sharedConsumer};
  }
  const nativeFiles=new Set(),samples=[];
  function File(p){this.fsName=p;Object.defineProperty(this,"exists",{get:()=>nativeFiles.has(p)||fs.existsSync(p)});}
  function queueItem(comp,flag){
    const om={templates:["Movie","AVI","Sequence","Dangerous"],file:new File(path.join(root,"foreign"+comp.id+".mov")),postRenderAction:0,
      applyTemplate(t){this.format=options.outputFormat || (t==="AVI" ? "AVI" : t==="Sequence" ? "PNG Sequence" : "QuickTime");if(t==="Dangerous")this.postRenderAction=1;if(options.templateError)throw Error("template error");},getSettings(){return {Format:this.format||"QuickTime"};}};
    const item={comp,render:flag,status:comp.id===30 && options.immutableCompletedQueue ? "DONE" : "QUEUED",templates:["Best Settings"],numOutputModules:1,timeSpanStart:0,timeSpanDuration:2,outputModule:()=>om,applyTemplate(){if(options.renderTemplateError)throw Error("render template error");}};
    if(comp.id===30 && options.immutableCompletedQueue)Object.defineProperty(item,"render",{get(){return flag;},set(){throw Error("completed queue item render is immutable");}});
    return item;
  }
  const items=[queueItem(rootComp,true),queueItem(other,false)],original=items.slice();
  const project={file:new File(file),revision:1,get numItems(){return projectItems.length;},item:i=>projectItems[i-1]};
  const rq={rendering:false,get numItems(){return items.length;},item:i=>items[i-1],items:{add(comp){const item=queueItem(comp,true);items.push(item);project.revision++;return item;}},render(){
    const owned=items[items.length-1];samples.push({visible:layers.filter(l=>l.enabled).map(l=>l.id),flags:items.map(q=>q.render),post:owned.outputModule(1).postRenderAction});
    if(options.error)throw Error("renderer failed");
    owned.status=options.cancel ? "USER_STOPPED" : "DONE";
    if(!options.cancel)nativeFiles.add(owned.outputModule(1).file.fsName);
    if(options.afterRender)options.afterRender({producer,background,matteSource,target,nested});
  }};project.renderQueue=rq;
  // Explicitly remove JSON and modern array helpers in the actual host VM.
  const context=vm.createContext({app:{project},File,CompItem,TextLayer,AVLayer,FootageItem,TrackMatteType:{NO_TRACK_MATTE:0,ALPHA:1},RQItemStatus:{DONE:"DONE"},PostRenderAction:{NONE:0},GetSettingsFormat:{STRING:1},JSON:undefined});
  vm.runInContext("Array.prototype.includes=undefined;Array.prototype.map=undefined;Array.prototype.filter=undefined;",context);
  const run=body=>copy(vm.runInContext("(function(){"+body+"}).call(this)",context));
  return {project,target,rootComp,other,layers,items,original,nativeFiles,samples,context,run,rq,producer,background,matteSource,writes,property,nested,AVLayer,FootageItem};
}
function executor(f,label="main", delivery) {
  const deps={stateDir:path.join(root,"state-"+label),resolveOutputFilePath:name=>path.join(root,"out-"+label,name),runExtendScriptBody:async(body,meta)=>delivery ? delivery(body,meta,f) : {result:f.run(body)}};
  return {exec:native.createExecutor(deps),deps};
}
let grantCounter=0;
function grant(exec,override={}) {
  const record={actionId:"action"+(++grantCounter),payloadHash:"hash",confirmedBySurface:"cep-panel",executionState:"executing",dryRunCompletedAt:new Date().toISOString(),project:{expectedFile:file},dryRunReceipt:{payloadHash:"hash",contractVersion:"test-v1",stepCount:1,projectFile:file}};
  return exec.authorize({record,runId:"run"+grantCounter,confirm:true,autonomous:false,allowWithoutCheckpoint:false,stepCount:1,contractVersion:"test-v1",checkpoint:{sourceFile:file,checkpointFile:path.join(root,"checkpoint.aep")},...override});
}
async function renderArgs(exec,v=variants[0]){const read=await exec.inspect(inspection);return {...raw,...v,expectedStateHash:read.stateHash};}
function restored(f){check(f.layers[0].enabled===true && f.layers[1].enabled===false,"visibility restored");check(f.original[0].render===true && f.original[1].render===false,"all foreign queue flags restored");check(f.items[f.items.length-1].render===false,"owned disabled");}
async function matteChecks(){
  for(const background of [false,true]){
    const f=fixture({matted:true,background}),{exec,deps}=executor(f,"matte"+background),read=await exec.inspect(inspection);
    check(read.snapshot.matteDependencies.length===2 && read.snapshot.matteDependencies[0].producer.id===13,"direct alpha binding uses stable same-comp producer");
    check(read.snapshot.matteDependencies[0].producer.enabled===false,"disabled matte is captured without enabling it");
    if(background)check(read.snapshot.graph.filter(c=>c.id===40).length===2 && f.background.enabled===true,"producer and visible background may share a precomp with separate timing");
    const a=await renderArgs(exec),result=await exec.execute(a,grant(exec));check(result.ok,JSON.stringify(result));restored(f);
    check(f.producer.enabled===false && f.writes.length===0 && (!background || f.background.enabled===true),"render/restoration writes only controlled visibility, never matte/background");
    check(result.renderReceipt.matteDependenciesUnchanged===true && native.verifyInspection(result.renderReceipt,result.inspection,a),"native post-render/restoration and independent durable dependency proof");
    const changed=copy(result.inspection);changed.snapshot.matteDependencies[0].producer.enabled=true;
    check(!native.verifyInspection(result.renderReceipt,changed,a),"tampered dependency read cannot retain success");
    const changedReceipt=copy(result.renderReceipt),changedRead=copy(result.inspection);delete changedReceipt.matteDependencies;delete changedReceipt.matteDependenciesUnchanged;changedRead.attempt.receipt=changedReceipt;
    check(!native.verifyInspection(changedReceipt,changedRead,a),"removed matte receipt cannot masquerade as legacy receipt");
    const recordFile=path.join(deps.stateDir,result.renderReceipt.attemptId+".json"),record=JSON.parse(fs.readFileSync(recordFile,"utf8"));record.receipt.matteDependencies[0].producer.enabled=true;fs.writeFileSync(recordFile,JSON.stringify(record));
    const durable=await exec.inspect({...inspection,variants:[variants[0]],attemptId:result.renderReceipt.attemptId});check(durable.attempt.receiptConfirmed===false,"durable receipt tampering is rejected against saved baseline");
  }
  const failures={
    missingLink:f=>{f.layers[0].trackMatteLayer=null;},foreignLink:f=>{f.layers[0].trackMatteLayer={...f.producer};},wrongType:f=>{f.layers[0].trackMatteType=2;},
    controlledProducer:f=>{f.layers[0].trackMatteLayer=f.layers[1];f.layers[1].isTrackMatte=true;},consumerProducer:f=>{f.producer.hasTrackMatte=true;f.producer.trackMatteLayer=f.layers[0];},
    fillProducer:f=>{f.layers[0].isTrackMatte=true;},badNoMatteLink:f=>{f.layers[0].hasTrackMatte=false;},cycle:f=>{f.producer.source=f.target;},duplicateProducerId:f=>{f.background.id=f.producer.id;},
    missingSource:f=>{f.producer.source=null;},proxy:f=>{f.matteSource.useProxy=true;},missingMetadata:f=>{delete f.matteSource.pixelAspect;},
    missingTransform:f=>{delete f.producer.transform["ADBE Scale"];},separated:f=>{f.producer.transform["ADBE Position"].dimensionsSeparated=true;},
    parent:f=>{f.producer.parent=f.layers[0];},threeD:f=>{f.producer.threeDLayer=true;},missingFlags:f=>{delete f.producer.guideLayer;},missingProducerLink:f=>{delete f.producer.trackMatteLayer;},
    sameSourceUnregistered:f=>{f.background.isTrackMatte=true;}
  };
  for(const flag of ["solo","guideLayer","locked"])failures[flag]=f=>{f.producer[flag]=true;};
  for(const [name,change] of Object.entries(failures)){const f=fixture({matted:true,background:true});change(f);await assert.rejects(executor(f,"matte-negative-"+name).exec.inspect(inspection));check(f.samples.length===0 && f.items.length===2 && f.writes.length===0,"unsupported matte fails closed without staging: "+name);}
  const stale=fixture({matted:true}),se=executor(stale,"matte-stale").exec,sa=await renderArgs(se);stale.producer.startTime=0.04;await assert.rejects(se.execute(sa,grant(se)),/stale_state/);check(stale.samples.length===0 && stale.items.length===2,"producer timing drift fails preflight before mutation");
  const delivery=fixture({matted:true}),de=executor(delivery,"matte-delivery",(body,meta,f)=>{if(meta.phase==="render")f.producer.transform["ADBE Scale"].value=[99,99];return {result:f.run(body)};}).exec;
  const dr=await de.execute(await renderArgs(de),grant(de));check(!dr.ok && dr.renderReceipt.renderInvoked===false && delivery.items.length===2,"dependency drift at native delivery fails before writes");
  const post=fixture({matted:true,afterRender:({producer})=>{producer.enabled=true;}}),pe=executor(post,"matte-post").exec,pr=await pe.execute(await renderArgs(pe),grant(pe));
  check(!pr.ok && pr.renderReceipt.matteDependenciesUnchanged===false && pr.renderReceipt.error==="matte_dependency_drift_after_render","native DONE with producer drift is failure");
  check(post.producer.enabled===true && post.writes.length===1,"matte drift is reported and never automatically restored");restored(post);
  const restore=fixture({matted:true});restore.layers[0].enabled=false;let originalEnabled=restore.layers[0].enabled,sets=0;Object.defineProperty(restore.layers[0],"enabled",{get:()=>originalEnabled,set:v=>{originalEnabled=v;if(++sets===2)restore.producer.outPoint=3;}});
  const re=executor(restore,"matte-restore").exec,rr=await re.execute(await renderArgs(re),grant(re));check(!rr.ok && rr.renderReceipt.restoreErrors.includes("matte_dependency_drift_after_restore"),"drift during controlled restoration is failure without matte repair");
  const independent=fixture({matted:true});let delivered=false;const ie=executor(independent,"matte-readback",(body,meta,f)=>{if(delivered && meta.phase==="inspection")f.producer.stretch=99;const result=f.run(body);if(meta.phase==="render")delivered=true;return {result};}).exec;
  const ir=await ie.execute(await renderArgs(ie),grant(ie));check(ir.code==="native_render_readback_failed" && ir.renderReceipt.ok===true && ir.inspection.attempt.receiptConfirmed===false,"drift only at independent read-back cannot count as success");
  const dynamic=fixture({matted:true}),position=dynamic.property([960,540],[{time:0,value:[960,540]},{time:1,value:[1000,540]}],"value + [0,0]",true);
  Object.defineProperty(position,"value",{get(){throw Error("animated value must not be sampled");}});dynamic.producer.transform["ADBE Position"]=position;
  const opacity=dynamic.property(100,[],"value");Object.defineProperty(opacity,"value",{get(){throw Error("expression value must not be sampled");}});dynamic.producer.transform["ADBE Opacity"]=opacity;
  dynamic.producer.transform["ADBE Scale"]=dynamic.property([100,100,100],[{time:0,value:[100,100,100]},{time:1,value:[99,99,100]}]);
  const dy=executor(dynamic,"matte-definitions").exec,dya=await renderArgs(dy);dynamic.target.time=1.3;dynamic.matteSource.time=0.9;
  const dyr=await dy.execute(dya,grant(dy));check(dyr.ok,JSON.stringify(dyr));
  const defs=dyr.renderReceipt.matteDependencies[0].producer.definition.transform;
  check(defs[1].definition.keys.length===2 && defs[1].definition.keys[0].inEase.length===1 && defs[1].definition.keys[0].inSpatial.length===2 && defs[2].definition.keys[0].inEase.length===3 && !Object.hasOwn(defs[1].definition,"value") && defs[4].definition.value===100,"2D spatial ease/tangents and multidimensional nonspatial ease are definition-based, independent of comp.time");
  const expressionStale=fixture({matted:true}),ee=executor(expressionStale,"matte-expression").exec;expressionStale.producer.transform["ADBE Opacity"]=expressionStale.property(100,[],"value");const ea=await renderArgs(ee);expressionStale.producer.transform["ADBE Opacity"].expression="value/2";
  await assert.rejects(ee.execute(ea,grant(ee)),/stale_state/);check(expressionStale.samples.length===0,"expression definition drift changes state hash");
}
async function nestedMatteChecks(){
  for(const mixed of [false,true]){
    const f=fixture({nested:true,sharedConsumer:true,matted:mixed,background:mixed}),e=executor(f,"nested"+mixed).exec,read=await e.inspect(inspection),deps=read.snapshot.matteDependencies,nested=deps.filter(d=>d.ownerCompItemId===50);
    check(nested.length===2 && nested.map(d=>d.consumerLayerId).join(",")==="52,54" && nested.every(d=>d.producer.id===51),"repeated BG visits and shared consumers dedupe by owner comp/consumer identity");
    check(nested.every(d=>d.consumerRole==="immutable_footage" && d.consumer.source.id===70 && d.producer.enabled===false),"immutable PNG consumers carry source/roles/enabled and disabled precomp producer");
    check(read.snapshot.graph.filter(c=>c.id===50).length===(mixed ? 4 : 2),"existing repeated graph traversal/occurrence behavior is preserved");
    const a=await renderArgs(e),r=await e.execute(a,grant(e));check(r.ok,JSON.stringify(r));restored(f);
    check(f.nested.producer.enabled===false && f.nested.consumer.enabled===true && f.nested.sharedConsumer.enabled===false && f.nested.visible.enabled===true && f.writes.length===0,"nested producer/consumers/visible source alias are immutable through render and restoration");
    check(native.verifyInspection(r.renderReceipt,r.inspection,a),"mixed/nested native and independent durable matte read-back agree");
  }
  const failures={
    crossComp:f=>{f.nested.consumer.trackMatteLayer=f.producer;},
    sourceAlias:f=>{f.nested.consumer.trackMatteLayer=new f.AVLayer(51,false,f.nested.paper);},
    chain:f=>{f.nested.producer.hasTrackMatte=true;f.nested.producer.trackMatteLayer=f.nested.consumer;},
    nonAlpha:f=>{f.nested.consumer.trackMatteType=2;},missingLink:f=>{f.nested.consumer.trackMatteLayer=null;},
    unknownFlags:f=>{f.nested.consumer.guideLayer=undefined;},consumerProducer:f=>{f.nested.consumer.isTrackMatte=true;},
    precompConsumer:f=>{f.nested.consumer.source=f.nested.paper;},unknownSource:f=>{f.nested.png.mainSource.hasAlpha=undefined;},
    cycle:f=>{f.nested.paper._layers.push(new f.AVLayer(90,true,f.nested.bg));},
    sourceIdentity:f=>{f.nested.consumer.source={...f.nested.png};}
  };
  for(const [name,change] of Object.entries(failures)){const f=fixture({nested:true,matted:true});change(f);await assert.rejects(executor(f,"nested-negative-"+name).exec.inspect(inspection));check(f.samples.length===0 && f.items.length===2 && f.writes.length===0,"nested unsupported dependency fails closed: "+name);}
  const stale=fixture({nested:true}),se=executor(stale,"nested-stale").exec,sa=await renderArgs(se);stale.nested.consumer.startTime=0.04;
  await assert.rejects(se.execute(sa,grant(se)),/stale_state/);check(stale.samples.length===0 && stale.items.length===2,"immutable consumer timing drift blocks before write");
  const nativeStale=fixture({nested:true}),ne=executor(nativeStale,"nested-native-stale",(body,meta,f)=>{if(meta.phase==="render")f.nested.png.mainSource.alphaMode="PREMULTIPLIED";return {result:f.run(body)};}).exec;
  const nr=await ne.execute(await renderArgs(ne),grant(ne));check(!nr.ok && nr.renderReceipt.renderInvoked===false && nativeStale.items.length===2,"consumer source metadata drift is rejected by native preflight");
  const post=fixture({nested:true,afterRender:({nested})=>{nested.consumer.enabled=false;}}),pe=executor(post,"nested-post").exec,pr=await pe.execute(await renderArgs(pe),grant(pe));
  check(!pr.ok && pr.renderReceipt.matteDependenciesUnchanged===false && post.nested.consumer.enabled===false,"consumer drift after DONE fails without consumer repair writes");restored(post);
  const independent=fixture({nested:true});let delivered=false;const ie=executor(independent,"nested-independent",(body,meta,f)=>{if(delivered && meta.phase==="inspection")f.nested.consumer.transform["ADBE Opacity"].value=75;const result=f.run(body);if(meta.phase==="render")delivered=true;return {result};}).exec;
  const ir=await ie.execute(await renderArgs(ie),grant(ie));check(ir.code==="native_render_readback_failed" && ir.inspection.attempt.receiptConfirmed===false,"immutable consumer transform drift invalidates durable exact-attempt read-back");
  const legacy=fixture({nested:true,legacyFootageMatte:true}),le=executor(legacy,"legacy-footage-matte").exec;
  // These previously allowed branches must not acquire definition reads or stricter role checks.
  delete legacy.nested.png.mainSource.isStill;delete legacy.nested.legacyMatte.mainSource.hasAlpha;
  const read=await le.inspect(inspection),row=(l,index)=>({id:l.id,index,name:l.name,enabled:l.enabled===true,solo:false,guide:false,locked:false,sourceId:l.source ? l.source.id : null}),comp=c=>({id:c.id,name:c.name,width:1920,height:1080,duration:2,frameDuration:0.04,layers:c._layers.map((l,i)=>row(l,i+1))});
  const expected={projectFile:file,revision:1,rootCompItemId:10,variantCompItemId:20,frameDuration:0.04,duration:2,controlled:[{id:11,index:1,name:"text11",enabled:true,text:"text11"},{id:12,index:2,name:"text12",enabled:false,text:"text12"}],graph:[comp(legacy.target),comp(legacy.nested.bg),comp(legacy.nested.bg),comp(legacy.nested.splash),comp(legacy.rootComp)],queue:[10,30].map((id,i)=>({index:i+1,compItemId:id,render:i===0,status:"QUEUED",start:0,duration:2,outputs:[path.join(root,"foreign"+id+".mov")]})),templates:{renderSettings:["Best Settings"],outputModule:["Movie","AVI","Sequence","Dangerous"],gap:null}};
  assert.deepEqual(read.snapshot,expected);check(read.stateHash===native.digest(expected) && !Object.hasOwn(read.snapshot,"matteDependencies"),"legacy footage+footage matte snapshot shape/hash remain exactly unchanged");
}
async function main(){
  const parser=spawnSync(process.execPath,["--expose-internals",__filename,"--es3"],{encoding:"utf8",windowsHide:true});check(parser.status===0,parser.stderr||parser.stdout);
  const f=fixture(),{exec,deps}=executor(f);
  const first=await exec.inspect(inspection);check(f.items.length===2 && f.samples.length===0,"inspect never stages");check(first.snapshot.controlled.length===2 && first.stateHash.length===64,"exact native facts/hash");
  const row=(id,index,name,enabled,sourceId=null)=>({id,index,name,enabled,solo:false,guide:false,locked:false,sourceId});
  const legacy={projectFile:file,revision:1,rootCompItemId:10,variantCompItemId:20,frameDuration:0.04,duration:2,controlled:[{id:11,index:1,name:"text11",enabled:true,text:"text11"},{id:12,index:2,name:"text12",enabled:false,text:"text12"}],graph:[{id:20,name:"comp20",width:1920,height:1080,duration:2,frameDuration:0.04,layers:[row(11,1,"text11",true),row(12,2,"text12",false)]},{id:10,name:"comp10",width:1920,height:1080,duration:2,frameDuration:0.04,layers:[row(21,1,"common",true,20)]}],queue:[10,30].map((id,i)=>({index:i+1,compItemId:id,render:i===0,status:"QUEUED",start:0,duration:2,outputs:[path.join(root,"foreign"+id+".mov")]})),templates:{renderSettings:["Best Settings"],outputModule:["Movie","AVI","Sequence","Dangerous"],gap:null}};
  assert.deepEqual(first.snapshot,legacy);check(first.stateHash===native.digest(legacy) && !Object.hasOwn(first.snapshot,"matteDependencies"),"legacy unmatted snapshot shape and hash are exactly unchanged");
  await matteChecks();
  await nestedMatteChecks();
  for(const bad of [{},JSON.parse(JSON.stringify({proposalId:"a",runId:"r",authorized:true}))])await assert.rejects(exec.execute(raw,bad),/manual_authorization/);
  for(const extra of [{autonomous:true},{confirm:false},{allowWithoutCheckpoint:true},{checkpoint:null}])assert.throws(()=>grant(exec,extra));
  const recordOverride={actionId:"a",payloadHash:"new",confirmedBySurface:"cep-panel",executionState:"executing",project:{expectedFile:file},dryRunCompletedAt:"yes",dryRunReceipt:{payloadHash:"old",contractVersion:"test-v1",stepCount:1,projectFile:file}};
  assert.throws(()=>grant(exec,{record:recordOverride}),e=>e.code==="project_save_dry_run_stale");checks+=7;
  const a=await renderArgs(exec),result=await exec.execute(a,grant(exec));check(result.ok===true,JSON.stringify(result));restored(f);
  check(JSON.stringify(f.samples[0].visible)==="[11]" && JSON.stringify(f.samples[0].flags)==="[false,false,true]","samples chosen variant and isolates queue");
  check(native.verifyInspection(result.renderReceipt,result.inspection,a),"persisted native receipt and independent read");
  check(result.alphaDxvProof==="not_verified","template name is not codec alpha proof");
  const b=await renderArgs(exec,variants[1]),r2=await exec.execute(b,grant(exec));check(r2.ok,JSON.stringify(r2));restored(f);check(JSON.stringify(f.samples[1].visible)==="[12]","second title uses same common comp");check(f.project.numItems===3 && f.items.length===4,"one owned item per title, zero comp creation");
  const restart=native.createExecutor(deps),again=await renderArgs(restart);await assert.rejects(restart.execute(again,grant(restart)),/reserved_replay_blocked/);check(f.samples.length===2,"restart duplicate never delivered");
  const immutable=fixture({immutableCompletedQueue:true,immutableCompletedLayer:true}),immutableExec=executor(immutable,"immutable-completed").exec,immutableResult=await immutableExec.execute(await renderArgs(immutableExec),grant(immutableExec));
  check(immutableResult.ok && immutable.items[1].status==="DONE" && immutable.items[1].render===false,"completed disabled foreign queue item and already-correct layer receive no setter writes");restored(immutable);
  for(const mode of ["error","cancel","templateError"]){const fx=fixture({[mode]:true}),e=executor(fx,mode).exec;const args=await renderArgs(e);const r=await e.execute(args,grant(e));check(!r.ok,"failure not native success");restored(fx);check(fx.items.length===3,"failure keeps exactly one owned item");}
  const dangerous=fixture(),de=executor(dangerous,"post").exec,da={...await renderArgs(de),outputModuleTemplate:"Dangerous"};const dr=await de.execute(da,grant(de));check(dr.ok && dangerous.samples[0].post===0,"dangerous postrender template forced NONE");
  const dxv=fixture({outputFormat:"DXV 3"}),dxvExec=executor(dxv,"format-dxv3").exec,dxvResult=await dxvExec.execute(await renderArgs(dxvExec),grant(dxvExec));
  check(dxvResult.ok && dxv.samples.length===1,"exact DXV 3 format accepts one MOV render");restored(dxv);
  for(const [label,options,outputFileName,outputModuleTemplate] of [
    ["dxv-avi",{outputFormat:"DXV 3"},"bad.avi","Movie"],
    ["other-dxv",{outputFormat:"Other DXV"},"other.mov","Movie"],
    ["sequence",{},"sequence.mov","Sequence"],
    ["avi",{},"avi.mov","AVI"]
  ]){const fx=fixture(options),e=executor(fx,"format"+label).exec;const r=await e.execute({...await renderArgs(e),outputFileName,outputModuleTemplate},grant(e));check(!r.ok && fx.samples.length===0,"unsupported format or extension rejected before render: "+label);restored(fx);}
  const stale=fixture(),se=executor(stale,"stale").exec,sa=await renderArgs(se);stale.project.revision++;await assert.rejects(se.execute(sa,grant(se)),/stale_state/);check(stale.items.length===2,"stale native no mutation");
  const freshStale=fixture(),fe=executor(freshStale,"freshstale",(body,meta,fx)=>{if(meta.phase==="render")fx.project.revision++;return {result:fx.run(body)};}).exec;
  const fr=await fe.execute(await renderArgs(fe),grant(fe));check(!fr.ok && freshStale.items.length===2 && freshStale.samples.length===0,"synchronous recheck no mutation on stale delivery");
  const timeout=fixture(),teParts=executor(timeout,"timeout",(body,meta,fx)=>{if(meta.phase==="render"){fx.run(body);throw Error("command timeout after delivery");}return {result:fx.run(body)};}),te=teParts.exec,ta=await renderArgs(te),tr=await te.execute(ta,grant(te));
  check(tr.code==="native_render_outcome_unknown" && tr.replayAllowed===false,"timeout explicitly unknown, no cancellation/retry");const ti=await te.inspect({...inspection,variants:[variants[0]],attemptId:tr.attemptId});check(ti.attempt.state==="unknown" && ti.attempt.receiptConfirmed===false,"later DONE/file cannot synthesize lost receipt");
  const teRestart=native.createExecutor(teParts.deps);await assert.rejects(teRestart.execute(await renderArgs(teRestart),grant(teRestart)),/reserved_replay_blocked/);check(timeout.samples.length===1,"timeout replay after restart blocked");
  for(const field of ["solo","guideLayer","locked","hasTrackMatte","isTrackMatte"]){const fx=fixture();fx.layers[0][field]=true;await assert.rejects(executor(fx,field).exec.inspect(inspection));checks++;}
  const duplicate=fixture();duplicate.rootComp._layers.push({...duplicate.rootComp._layers[0],id:22});await assert.rejects(executor(duplicate,"duplicate").exec.inspect(inspection));checks++;
  const empty=fixture();empty.items.length=0;const emptyRead=await executor(empty,"empty").exec.inspect(inspection);check(emptyRead.snapshot.templates.gap==="existing_queue_template_carrier_required" && empty.items.length===0,"empty queue honest no-staging gap");
  for(const name of ["CON.mov","nul.avi","x.mov.","../x.mov","same.MOV ","x.png","COM1.mov"]){assert.throws(()=>native.validateInput(native.RENDER,{...raw,outputFileName:name}));checks++;}
  assert.throws(()=>native.validateInput(native.INSPECT,{...inspection,variants:[variants[0],{...variants[1],outputFileName:"ONE.MOV"}]}));checks++;
  const nativeStep={index:1,tool:native.RENDER,args:a,status:"completed",mutating:true,result:result};
  const readStep={index:2,tool:native.INSPECT,args:native.inspectionArgs(a,result.renderReceipt.attemptId),status:"completed",result:result.inspection};
  const run={id:result.renderReceipt.authorization.runId,provenance:{actionId:result.renderReceipt.authorization.proposalId},steps:[nativeStep,readStep],ok:true};
  const plan={steps:[{tool:native.RENDER,args:a},{tool:native.INSPECT,args:readStep.args}]};
  const semantic=buildSemanticVerification(plan,run);
  check(semantic.checks.some(c=>c.id.includes("native-done") && c.status==="passed"),"semantic matches independent bound native receipt");
  const noReceipt=copy(run);delete noReceipt.steps[0].result.renderReceipt;const badSemantic=buildSemanticVerification(plan,noReceipt);check(!badSemantic.checks.some(c=>c.id.includes("native-done") && c.status==="passed"),"semantic rejects output-only proof");
  const attached=copy(run);attached.steps[0].independentReadBack=[{...readStep,source:"server_typed_readback",observedAt:new Date().toISOString()}];
  check(buildSemanticVerification(plan,attached).checks.some(c=>c.id.includes("native-done") && c.status==="passed"),"server attachment + explicit documented read agree");
  attached.steps[0].independentReadBack[0].status="failed";
  check(!buildSemanticVerification(plan,attached).checks.some(c=>c.id.includes("native-done") && c.status==="passed"),"failed attachment cannot be hidden by good explicit read");
  const rec={schema:"ae-agent-plan-run-record.v1",runId:run.id,project:{file},plan,run};const requests=reconciliationReadRequests(rec);check(requests.length===1 && requests[0].tool===native.INSPECT,"reconciliation requests exact typed inspection");
  const reconcile=record=>reconcilePlanRun({record,freshReadSteps:[{tool:"get_project_info",status:"completed",result:{file}},readStep],project:{file}});
  check(reconcile(rec).steps[0].mutationStatus==="applied","reconciliation native receipt + fresh read");const unknown=copy(rec);delete unknown.run.steps[0].result.renderReceipt;check(reconcile(unknown).steps[0].mutationStatus==="unknown","reconciliation never upgrades lost receipt");
  const source=fs.readFileSync(path.join(__dirname,"../mcp-server/bridge-daemon.js"),"utf8");
  check(source.includes("nativeRenderExecutor.assertAuthorization(executionContext") && source.includes("nativeRenderExecutor.authorize({"),"bridge server-owned direct and runner auth hooks");
  console.log(JSON.stringify({ok:true,checks,scope:"offline ES3 parse + actual generated host VM + durable guard/semantic/reconciliation; no live render/media proof"}));
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
