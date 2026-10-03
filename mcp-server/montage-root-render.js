"use strict";

const {createHash}=require("node:crypto");
const {inspectPayloadSafety,normalizeBudgets,isPositiveInteger:id,isNonNegativeInteger:uint,isSafeId,isAbsolutePath,
  isFiniteNumber:finite,stableJson,deepClone,normalizePath,isRecord}=require("./montage-contract");
const {EPSILON,isGridAligned,isValidStretch}=require("./placeholder-timing");
const {projectStateKey}=require("./project-intent-memory");
const SCHEMA="ae-agent-root-render-graph.v1";
const NATIVE_RENDER_STATE_SCHEMA="ae-agent-native-render-state.v1";
const NATIVE_RENDER_GUID_MAX_READS=32;
const BLOCKER="unsupported_unknown_render_graph";
const hash=v=>createHash("sha256").update(stableJson(v)).digest("hex");
const close=(a,b)=>finite(a)&&finite(b)&&Math.abs(a-b)<=EPSILON;
const vector=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(finite);
const enumIs=(v,names)=>isRecord(v)&&names.includes(v.name)&&(finite(v.raw)||typeof v.raw==="string"&&v.raw.length>0&&v.raw.length<=128);
const notApplicable=(v,basis)=>v?.status==="not_applicable"&&v.basis===basis;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const mediaClassMatches=(flags,itemId,kind)=>isRecord(flags)&&flags.canonicalItemId===itemId&&flags.kind===kind&&
  (kind==="comp"?flags.CompItem===true&&flags.FootageItem===false:kind==="file_footage"&&flags.CompItem===false&&flags.FootageItem===true);

// Parent inspected Classic 3D in Composition Settings for saved fixture comp 5,
// paired with native bootstrap/probe 26.2x49, root18/comp5. Exact available order
// is part of this bounded host contract; another host/plugin list stays unknown.
function aeAgentKnownClassic3DRenderer(hostVersion,raw,available){
  var known=["ADBE Advanced 3d","ADBE Calder","ADBE Ernst"];
  if(hostVersion!=="26.2x49" || raw!==known[0] || !available || available.length!==known.length)return false;
  for(var i=0;i<known.length;i++)if(available[i]!==known[i])return false;
  return true;
}

// Diagnostic only: compare immediate native access with object-slot round trips.
// Neither constructor names nor capability-looking fields authorize a class.
function aeAgentReadNativeClassDiagnostics(rootCompItemId,indices){
  var out={schema:"ae-agent-native-class-diagnostics.v1",rootCompItemId:rootCompItemId,
    globals:{CompItem:typeof CompItem,FootageItem:typeof FootageItem,AVItem:typeof AVItem,Item:typeof Item,FileSource:typeof FileSource},
    projectItems:[],sources:[],blockers:[],complete:false},maxItems=32,maxLayers=32,totalLayers=0;
  function problem(reason){out.blockers.push({reason:reason});}
  function getter(object,key){
    try{var v=object[key],t=typeof v;
      if(t==="undefined")return {state:"missing",type:t,value:null};
      if(v===null)return {state:"observed",type:"null",value:null};
      if(t==="string")return {state:"observed",type:t,value:v.length<=4096?v:v.substring(0,4096),truncated:v.length>4096};
      if(t==="boolean" || t==="number")return {state:"observed",type:t,value:v};
      return {state:"observed",type:t,value:null};
    }catch(e){return {state:"threw",type:null,value:null};}
  }
  function instance(object,ctor){try{return ctor===null?{state:"missing",value:null}:{state:"observed",value:object instanceof ctor};}catch(e){return {state:"threw",value:null};}}
  function snap(object){
    if(!object)return {state:"missing"};
    var names=["id","name","numLayers","layers","layer","renderer","renderers","file","mainSource","getRenderGUID"],row={state:"observed",getters:{},
      instances:{CompItem:instance(object,typeof CompItem==="undefined"?null:CompItem),FootageItem:instance(object,typeof FootageItem==="undefined"?null:FootageItem),
        AVItem:instance(object,typeof AVItem==="undefined"?null:AVItem),Item:instance(object,typeof Item==="undefined"?null:Item)},
      constructorType:null,constructorName:null,reflectName:null};
    for(var i=0;i<names.length;i++)row.getters[names[i]]=getter(object,names[i]);
    try{row.constructorType=typeof object.constructor;row.constructorName=object.constructor?getter(object.constructor,"name"):null;}catch(e){row.constructorType="threw";}
    try{row.reflectName=object.reflect?getter(object.reflect,"name"):{state:"missing",type:null,value:null};}catch(e){row.reflectName={state:"threw",type:null,value:null};}
    return row;
  }
  var count=null;try{count=app.project.numItems;}catch(e){}
  out.numItems=count;
  if(typeof count!=="number" || !isFinite(count) || count<0 || count%1!==0 || count>maxItems){problem("native_class_probe_item_budget_or_unknown");return out;}
  for(var i=1;i<=count;i++){
    var direct=app.project.item(i),id=direct?direct.id:null,compImmediate=null,footageImmediate=null;
    try{compImmediate=typeof CompItem==="undefined"?{state:"missing",value:null}:{state:"observed",value:app.project.item(i) instanceof CompItem};}catch(e){compImmediate={state:"threw",value:null};}
    try{footageImmediate=typeof FootageItem==="undefined"?{state:"missing",value:null}:{state:"observed",value:app.project.item(i) instanceof FootageItem};}catch(e){footageImmediate={state:"threw",value:null};}
    var immediateLayers=null,immediateLayerMethod=null;
    try{immediateLayers={state:"observed",type:typeof app.project.item(i).numLayers,value:typeof app.project.item(i).numLayers==="number"?app.project.item(i).numLayers:null};}catch(e){immediateLayers={state:"threw",type:null,value:null};}
    try{immediateLayerMethod={state:"observed",type:typeof app.project.item(i).layer};}catch(e){immediateLayerMethod={state:"threw",type:null};}
    var localSlots={};localSlots["i"+id]=direct;
    var localComp=null,slotComp=null,readerIndex=indices["i"+id],readerFresh=null;
    if(typeof readerIndex==="number")readerFresh=app.project.item(readerIndex);
    try{localComp=typeof CompItem==="undefined"?{state:"missing",value:null}:{state:"observed",value:localSlots["i"+id] instanceof CompItem};}catch(e){localComp={state:"threw",value:null};}
    try{slotComp=typeof CompItem==="undefined"?{state:"missing",value:null}:{state:"observed",value:app.project.item(readerIndex) instanceof CompItem};}catch(e){slotComp={state:"threw",value:null};}
    out.projectItems.push({itemIndex:i,itemId:id,immediateComp:compImmediate,immediateFootage:footageImmediate,
      immediateNumLayers:immediateLayers,immediateLayerMethod:immediateLayerMethod,direct:snap(direct),
      localObjectSlotComp:localComp,readerFreshComp:slotComp,readerSlotIndex:readerIndex,
      localObjectSlot:snap(localSlots["i"+id]),readerProjectItem:snap(readerFresh),fresh:snap(app.project.item(i))});
    var c=app.project.item(i),n=null;
    try{n=c.numLayers;}catch(e){}
    if(compImmediate.value===true && (typeof n!=="number" || n<0 || n%1!==0)){problem("native_class_probe_comp_layers_unknown");continue;}
    // These are read-only diagnostics of positively native CompItem objects.
    if(compImmediate.value===true && typeof n==="number" && n>=0 && n%1===0){
      if(n>maxLayers || totalLayers+n>128){problem("native_class_probe_layer_budget");continue;}
      totalLayers+=n;
      for(var l=1;l<=n;l++){
        var layer=null,source=null,sourceId=null,index=null;
        try{layer=c.layer(l);}catch(e){problem("native_class_probe_layer_read_failed");continue;}
        if(!layer){problem("native_class_probe_layer_missing");continue;}
        try{source=layer.source;sourceId=source?source.id:null;}catch(e){}
        if(sourceId!==null)for(var p=1;p<=count;p++)if(app.project.item(p).id===sourceId){index=p;break;}
        var sourceComp=null,sourceFootage=null;
        try{sourceComp=typeof CompItem==="undefined"?{state:"missing",value:null}:{state:"observed",value:c.layer(l).source instanceof CompItem};}catch(e){sourceComp={state:"threw",value:null};}
        try{sourceFootage=typeof FootageItem==="undefined"?{state:"missing",value:null}:{state:"observed",value:c.layer(l).source instanceof FootageItem};}catch(e){sourceFootage={state:"threw",value:null};}
        out.sources.push({compItemId:c.id,layerId:layer.id,sourceItemId:sourceId,sourceImmediateComp:sourceComp,sourceImmediateFootage:sourceFootage,sourceView:snap(source),
          readerSlotIndex:indices["i"+sourceId],freshProjectItem:index===null?{state:"missing"}:snap(app.project.item(index))});
      }
    }
  }
  out.complete=out.blockers.length===0;
  return out;
}

// This function is serialized verbatim into ExtendScript. Keep it ES3 and read-only.
// Native enum numbers and renderer identifiers are never assumed here.
function aeAgentReadRootRender(options) {
  var o=options, b=o.budgets, result={schema:"ae-agent-root-render-graph.v1",readerId:o.readerId,
    rootCompItemId:o.rootCompItemId,hostVersion:null,project:null,comps:[],sources:[],blockers:[],completeObservation:false,
    nativeAcquisition:{revisionBefore:null,revisionAfter:null,stable:false}};
  var seen={},visiting={},projectIndicesById={},nodes=0,bytes=512,stopped=false;
  function block(path,reason){if(result.blockers.length<128)result.blockers.push({code:"unsupported_unknown_render_graph",path:path,reason:reason});}
  function read(object,key,path){try{var value=object[key];if(value===undefined){block(path,"missing_native_field");return null;}return value;}catch(e){block(path,"native_getter_failed");return null;}}
  function copy(value,path){
    if(value===null || typeof value==="boolean" || typeof value==="number")return value;
    if(typeof value==="string"){if(value.length>4096){block(path,"native_string_budget_exceeded");return null;}return value;}
    if(value && typeof value.length==="number" && value.length>=0 && value.length<=16){var a=[];for(var i=0;i<value.length;i++)a.push(copy(value[i],path+"["+i+"]"));return a;}
    block(path,"unsupported_native_field_type");return null;
  }
  function fields(object,names,path){var row={};for(var i=0;i<names.length;i++)row[names[i]]=copy(read(object,names[i],path+"."+names[i]),path+"."+names[i]);return row;}
  function freshProjectItem(itemId,path){
    var index=projectIndicesById["i"+itemId],item=null;
    if(typeof index!=="number" || index<=0 || index%1!==0){block(path,"canonical_source_item_unavailable");return null;}
    try{item=app.project.item(index);}catch(e){block(path,"canonical_item_lookup_failed");return null;}
    if(item===null || item===undefined){block(path,"canonical_source_item_unavailable");return null;}
    if(read(item,"id",path+".itemId")!==itemId){block(path,"canonical_item_index_identity_changed");return null;}
    return item;
  }
  function mediaClass(object,path){
    var flags={canonicalItemId:null,CompItem:null,FootageItem:null,kind:"unsupported"};
    if(object===null || object===undefined){block(path,"canonical_media_item_unavailable");return flags;}
    flags.canonicalItemId=read(object,"id",path+".canonicalItemId");
    // Keep each native instanceof independent. The actual host disagreed with a
    // compound chained conditional while standalone probes returned CompItem.
    try{if(typeof CompItem!=="undefined")flags.CompItem=(object instanceof CompItem);else block(path,"native_comp_constructor_unavailable");}
    catch(e){block(path,"native_comp_instance_check_failed");}
    try{if(typeof FootageItem!=="undefined")flags.FootageItem=(object instanceof FootageItem);else block(path,"native_footage_constructor_unavailable");}
    catch(e){block(path,"native_footage_instance_check_failed");}
    if(flags.CompItem===true){
      if(flags.FootageItem===false)flags.kind="comp";
      else block(path,"ambiguous_native_media_class");
    }else if(flags.CompItem===false){
      if(flags.FootageItem===true)flags.kind="file_footage";
      else if(flags.FootageItem===false)block(path,"unsupported_native_media_class");
      else block(path,"unknown_native_media_class");
    }else block(path,"unknown_native_media_class");
    return flags;
  }
  function nativeEnum(object,key,enumObject,names,path){
    var value=read(object,key,path), name=null, raw=null;
    if(value!==null){try{raw=Number(value);if(!isFinite(raw))raw=String(value);}catch(e){block(path,"native_enum_raw_unavailable");}}
    if(enumObject && value!==null)for(var i=0;i<names.length;i++)try{if(enumObject[names[i]]!==undefined && value==enumObject[names[i]])name=names[i];}catch(ignore){}
    if(name===null)block(path,"unknown_native_enum");
    return {name:name,raw:raw};
  }
  function budget(){nodes++;if(nodes>b.graphNodes){block("graph","graph_nodes_budget_exceeded");stopped=true;return false;}return true;}
  function charge(row){try{bytes+=unescape(encodeURIComponent(JSON.stringify(row))).length+2;
    if(bytes>b.snapshotBytes){block("graph","snapshot_bytes_budget_exceeded");stopped=true;return false;}
    return true;}catch(e){block("graph","native_serialization_failed");stopped=true;return false;}}
  function proxy(item,path){var use=read(item,"useProxy",path+".useProxy");return {useProxy:use,
    proxySource:use===false?{status:"not_applicable",basis:"useProxy=false"}:{status:"unsupported",code:"active_or_unknown_proxy"}};}
  function prop(layer,matchName,path){
    var p=null;try{p=layer.property("ADBE Transform Group").property(matchName);}catch(e){block(path,"native_property_getter_failed");}
    if(!p){block(path,"missing_native_property");return null;}
    var row=fields(p,["numKeys","expressionEnabled"],path);
    try{row.value=copy(p.value,path+".value");}catch(e){row.value=null;block(path+".value","native_property_value_failed");}
    if(matchName==="ADBE Position")row.dimensionsSeparated=read(p,"dimensionsSeparated",path+".dimensionsSeparated");
    return row;
  }
  function count(layer,name,path){try{var group=layer.property(name);if(!group){block(path,"missing_native_property_group");return null;}return read(group,"numProperties",path);}catch(e){block(path,"native_property_group_failed");return null;}}
  function footage(item,path){
    var itemId=read(item,"id",path+".itemId"),key="s"+itemId;
    if(seen[key] || stopped)return;
    if(!budget())return;
    seen[key]=true;
    var row=fields(item,["name","width","height","pixelAspect","duration","frameRate","frameDuration","hasVideo","hasAudio","footageMissing"],path);
    row.itemId=itemId;row.kind="file_footage";
    try{row.file=item.file?copy(item.file.fsName,path+".file"):null;}catch(e){row.file=null;block(path+".file","native_file_getter_failed");}
    row.proxy=proxy(item,path);
    var source=null;try{source=item.mainSource;}catch(e){block(path+".mainSource","native_source_getter_failed");}
    if(!source || typeof FileSource==="undefined" || !(source instanceof FileSource)){block(path+".mainSource","unsupported_source_type");row.sourceKind="unsupported";row.interpretation=null;if(charge(row))result.sources.push(row);return;}
    row.sourceKind="FileSource";
    try{row.mainSourceFile=source.file?copy(source.file.fsName,path+".mainSourceFile"):null;}catch(e){row.mainSourceFile=null;block(path+".mainSourceFile","native_file_getter_failed");}
    var si=fields(source,["isStill","hasAlpha","nativeFrameRate","displayFrameRate","conformFrameRate","loop"],path+".interpretation");
    si.fieldSeparationType=nativeEnum(source,"fieldSeparationType",typeof FieldSeparationType!=="undefined"?FieldSeparationType:null,["OFF","UPPER_FIELD_FIRST","LOWER_FIELD_FIRST"],path+".interpretation.fieldSeparationType");
    si.removePulldown=nativeEnum(source,"removePulldown",typeof PulldownPhase!=="undefined"?PulldownPhase:null,["OFF"],path+".interpretation.removePulldown");
    si.highQualityFieldSeparation=si.fieldSeparationType.name==="OFF"?{status:"not_applicable",basis:"fieldSeparationType=OFF"}:read(source,"highQualityFieldSeparation",path+".interpretation.highQualityFieldSeparation");
    si.alpha=si.hasAlpha===false?{status:"not_applicable",basis:"hasAlpha=false"}:{status:"unsupported",code:"alpha_source"};
    // No documented ExtendScript getter covers Interpret As Linear Light. None
    // workingSpace does not disable it (Adobe Color Management documentation).
    si.color={status:"unsupported",code:"native_source_color_interpretation_unavailable"};
    row.interpretation=si;if(charge(row))result.sources.push(row);
  }
  function comp(item,depth,path){
    if(stopped)return;
    var itemId=read(item,"id",path+".itemId"),key="c"+itemId;
    if(visiting[key]){block(path,"render_graph_cycle");return;}
    if(depth>b.routeDepth){block(path,"render_graph_depth_budget_exceeded");return;}
    if(seen[key])return;
    if(!budget())return;
    visiting[key]=true;seen[key]=true;
    var row=fields(item,["name","width","height","pixelAspect","duration","frameRate","frameDuration","displayStartTime",
      "preserveNestedFrameRate","preserveNestedResolution","motionBlur","frameBlending","draft3d","bgColor","resolutionFactor","numLayers","renderer"],path);
    row.itemId=itemId;row.proxy=proxy(item,path);row.kind="comp";row.stackOrder=[];row.layers=[];
    try{var renderers=item.renderers;row.renderers=[];if(!renderers || renderers.length>16){block(path+".renderers","native_renderer_list_unavailable");}else for(var ri=0;ri<renderers.length;ri++)row.renderers.push(copy(renderers[ri],path+".renderers"));}catch(e){row.renderers=[];block(path+".renderers","native_renderer_list_failed");}
    row.rendererClass=aeAgentKnownClassic3DRenderer(result.hostVersion,row.renderer,row.renderers)?"classic_3d":"unknown";
    if(row.rendererClass!=="classic_3d")block(path+".renderer","unverified_native_renderer");
    if(!charge(row)){delete visiting[key];return;}
    result.comps.push(row);
    if(typeof row.numLayers!=="number" || row.numLayers<0 || row.numLayers%1!==0 || row.numLayers>b.graphNodes){block(path+".numLayers","invalid_or_excessive_layer_count");delete visiting[key];return;}
    for(var li=1;li<=row.numLayers && !stopped;li++){
      if(!budget())break;
      var layer=null,lp=path+".layers["+li+"]";
      try{layer=item.layer(li);}catch(e){block(lp,"native_layer_getter_failed");}
      if(!layer){block(lp,"missing_native_layer");continue;}
      var l=fields(layer,["id","index","name","matchName","enabled","locked","shy","audioEnabled","hasAudio","solo","guideLayer","adjustmentLayer","nullLayer",
        "threeDLayer","collapseTransformation","motionBlur","frameBlending","preserveTransparency","hasTrackMatte","isTrackMatte",
        "startTime","inPoint","outPoint","stretch","timeRemapEnabled"],lp);
      l.kind=typeof AVLayer!=="undefined"&&layer instanceof AVLayer?"av":"unsupported";
      l.blendingMode=nativeEnum(layer,"blendingMode",typeof BlendingMode!=="undefined"?BlendingMode:null,["NORMAL"],lp+".blendingMode");
      l.frameBlendingType=nativeEnum(layer,"frameBlendingType",typeof FrameBlendingType!=="undefined"?FrameBlendingType:null,["NO_FRAME_BLEND"],lp+".frameBlendingType");
      l.trackMatteType=nativeEnum(layer,"trackMatteType",typeof TrackMatteType!=="undefined"?TrackMatteType:null,["NO_TRACK_MATTE"],lp+".trackMatteType");
      l.quality=nativeEnum(layer,"quality",typeof LayerQuality!=="undefined"?LayerQuality:null,["BEST"],lp+".quality");
      l.samplingQuality=nativeEnum(layer,"samplingQuality",typeof LayerSamplingQuality!=="undefined"?LayerSamplingQuality:null,["BILINEAR","BICUBIC"],lp+".samplingQuality");
      l.autoOrient=nativeEnum(layer,"autoOrient",typeof AutoOrientType!=="undefined"?AutoOrientType:null,["NO_AUTO_ORIENT"],lp+".autoOrient");
      try{l.parentId=layer.parent===null?null:layer.parent.id;}catch(e){l.parentId=null;block(lp+".parentId","native_parent_getter_failed");}
      l.effectsCount=count(layer,"ADBE Effect Parade",lp+".effectsCount");l.masksCount=count(layer,"ADBE Mask Parade",lp+".masksCount");
      l.transform={anchorPoint:prop(layer,"ADBE Anchor Point",lp+".transform.anchorPoint"),position:prop(layer,"ADBE Position",lp+".transform.position"),
        scale:prop(layer,"ADBE Scale",lp+".transform.scale"),rotation:prop(layer,"ADBE Rotate Z",lp+".transform.rotation"),opacity:prop(layer,"ADBE Opacity",lp+".transform.opacity")};
      var src=null;try{src=layer.source;}catch(e){block(lp+".sourceItemId","native_source_getter_failed");}
      l.sourceItemId=src?read(src,"id",lp+".sourceItemId"):null;
      // layer.source may be a generic AV wrapper on a real host. Classify only
      // the canonical project.item with the exact observed stable source ID.
      src=l.sourceItemId!==null?freshProjectItem(l.sourceItemId,lp+".sourceItemId"):null;
      if(!src)block(lp+".sourceItemId","canonical_source_item_unavailable");
      l.sourceClass=mediaClass(src,lp+".sourceClass");
      l.sourceKind=l.sourceClass.kind;
      if(l.sourceClass.canonicalItemId!==l.sourceItemId)block(lp+".sourceClass","canonical_source_identity_changed");
      if(!charge(l))break;
      row.stackOrder.push(l.id);row.layers.push(l);
      if(l.sourceKind==="comp")comp(src,depth+1,"comp:"+l.sourceItemId);
      else if(l.sourceKind==="file_footage")footage(src,"source:"+l.sourceItemId);
      else block(lp+".source","unsupported_layer_source");
      if(o.includeClassDiagnostics===true){
        if(!result.nativeClassificationTrace)result.nativeClassificationTrace=[];
        var afterClass=mediaClass(freshProjectItem(l.sourceItemId,lp+".sourceClassAfterLookup"),lp+".sourceClassAfter");
        result.nativeClassificationTrace.push({compItemId:itemId,layerId:l.id,sourceItemId:l.sourceItemId,
          beforeSpecificSourceReads:l.sourceClass,selectedKind:l.sourceKind,afterSpecificSourceReads:afterClass});
      }
    }
    delete visiting[key];
  }
  try{
    result.hostVersion=copy(read(app,"version","hostVersion"),"hostVersion");
    var project=app.project;
    result.nativeAcquisition.revisionBefore=read(project,"revision","nativeAcquisition.revisionBefore");
    result.project=fields(project,["bitsPerChannel","workingSpace","workingGamma","linearizeWorkingSpace","linearBlending","compensateForSceneReferredProfiles","colorManagementSystem"],"project");
    result.project.workingSpaceClass=result.project.colorManagementSystem===0 && (result.project.workingSpace==="" ||
      result.hostVersion==="26.2x49" && result.project.workingSpace==="None")?"none":"unsupported";
    result.project.sceneReferredCompensation=result.project.workingSpaceClass==="none" && typeof result.project.compensateForSceneReferredProfiles==="boolean"?
      {status:"not_applicable",basis:"colorManagementSystem=0;workingSpace=none"}:{status:"unsupported",code:"active_or_unknown_scene_referred_compensation"};
    result.project.gpuAccelType=nativeEnum(project,"gpuAccelType",typeof GpuAccelType!=="undefined"?GpuAccelType:null,["SOFTWARE","CUDA","OPENCL","Metal"],"project.gpuAccelType");
    result.project.projectFile=project.file?copy(project.file.fsName,"project.projectFile"):null;
    var total=project.numItems,root=null;
    if(typeof total!=="number" || total<0 || total%1!==0 || total>b.graphNodes){block("project.numItems","native_item_lookup_budget_exceeded");}
    else for(var ii=1;ii<=total;ii++){
      var candidate=project.item(ii),candidateId=candidate?candidate.id:null;
      if(typeof candidateId!=="number" || candidateId<=0 || candidateId%1!==0 || candidateId>9007199254740991 || projectIndicesById["i"+candidateId]){
        block("project.items","invalid_or_duplicate_native_item_id");continue;
      }
      projectIndicesById["i"+candidateId]=ii;
    }
    root=freshProjectItem(o.rootCompItemId,"rootCompItemId");
    result.rootNativeClass=mediaClass(root,"rootNativeClass");
    if(result.rootNativeClass.kind==="comp")comp(root,0,"comp:"+o.rootCompItemId);
    else block("rootCompItemId","root_comp_not_found");
  }catch(e){block("graph","native_reader_failed");}
  result.comps.sort(function(a,c){return a.itemId-c.itemId;});result.sources.sort(function(a,c){return a.itemId-c.itemId;});
  if(o.rootTimes){
    var state={schema:"ae-agent-native-render-state.v1",samples:[],complete:false,nativeRevisionBefore:null,nativeRevisionAfter:null},guidReads=0,guidFailed=false,guidStopped=false;
    var guidReadMax=typeof o.nativeRenderGuidMaxReads==="number" && o.nativeRenderGuidMaxReads>0 && o.nativeRenderGuidMaxReads<=32?o.nativeRenderGuidMaxReads:32;
    state.nativeRevisionBefore=read(app.project,"revision","nativeRenderState.nativeRevisionBefore");
    var thread=null;
    try{if(typeof ProjectThread!=="undefined" && ProjectThread.MainThread!==undefined)thread=ProjectThread.MainThread;}catch(e){}
    function guid(kind,itemId,seconds,route){
      var row={kind:kind,itemId:itemId,seconds:seconds,routeLayerIds:route,method:"getRenderGUID",thread:{name:"MainThread",raw:null},trace:false,
        responseType:null,waitApplied:false,guid:null};
      if(thread===null){block("nativeRenderState","native_project_thread_unavailable");guidFailed=true;guidStopped=true;return row;}
      try{row.thread.raw=Number(thread);}catch(e){guidFailed=true;guidStopped=true;block("nativeRenderState","native_project_thread_unknown");return row;}
      guidReads++;
      if(guidReads>guidReadMax){block("nativeRenderState","native_render_guid_budget_exceeded");guidFailed=true;guidStopped=true;return row;}
      var nativeItem=freshProjectItem(itemId,"nativeRenderState."+kind+":"+itemId),nativeClass=mediaClass(nativeItem,"nativeRenderState."+kind+":"+itemId+".class");
      if(nativeClass.kind!==kind || nativeClass.canonicalItemId!==itemId){block("nativeRenderState","native_render_guid_item_class_changed");guidFailed=true;guidStopped=true;return row;}
      if(!nativeItem || typeof nativeItem.getRenderGUID!=="function"){block("nativeRenderState."+kind+":"+itemId,"native_render_guid_unavailable");guidFailed=true;guidStopped=true;return row;}
      try{
        var value=nativeItem.getRenderGUID(seconds,thread,false);row.responseType=typeof value;
        if(value && typeof value.wait==="function"){value=value.wait();row.waitApplied=true;}
        if(typeof value!=="string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)){
          block("nativeRenderState."+kind+":"+itemId,"invalid_native_render_guid");guidFailed=true;guidStopped=true;
        }else row.guid=value;
      }catch(e){block("nativeRenderState."+kind+":"+itemId,"native_render_guid_failed");guidFailed=true;guidStopped=true;}
      return row;
    }
    function at(compId,seconds,route,active,sample){
      if(guidStopped || stopped)return;
      if(route.length>b.routeDepth || active["c"+compId]){block("nativeRenderState","native_render_guid_route_invalid");guidFailed=true;return;}
      var c=null;for(var ci=0;ci<result.comps.length;ci++)if(result.comps[ci].itemId===compId)c=result.comps[ci];
      if(!c || typeof seconds!=="number" || !isFinite(seconds) || seconds<0 || seconds>=c.duration){block("nativeRenderState","native_render_guid_time_invalid");guidFailed=true;return;}
      if(route.length===0 && (typeof c.frameRate!=="number" || !isFinite(c.frameRate) || c.frameRate<=0 ||
        Math.abs(seconds*c.frameRate-Math.round(seconds*c.frameRate))>0.000001)){
        block("nativeRenderState","native_render_guid_time_off_grid");guidFailed=true;return;
      }
      active["c"+compId]=true;sample.items.push(guid("comp",compId,seconds,route));
      for(var lx=0;lx<c.layers.length && !guidStopped && !stopped;lx++){
        var l=c.layers[lx];
        if(l.enabled!==true || seconds<l.inPoint || seconds>=l.outPoint)continue;
        if(l.timeRemapEnabled!==false || typeof l.stretch!=="number" || l.stretch<25 || l.stretch>400){guidFailed=true;block("nativeRenderState","unsupported_render_guid_mapping");continue;}
        var sourceTime=(seconds-l.startTime)/(l.stretch/100),next=route.concat([l.id]);
        if(l.sourceKind==="comp" && l.stretch===100)at(l.sourceItemId,sourceTime,next,active,sample);
        else if(l.sourceKind==="file_footage"){
          var leaf=null;for(var fi=0;fi<result.sources.length;fi++)if(result.sources[fi].itemId===l.sourceItemId)leaf=result.sources[fi];
          if(!leaf || !isFinite(sourceTime)||sourceTime<0||sourceTime>=leaf.duration){guidFailed=true;block("nativeRenderState","native_render_guid_source_time_invalid");}
          else sample.items.push(guid("file_footage",l.sourceItemId,sourceTime,next));
        }
        else{guidFailed=true;block("nativeRenderState","unsupported_render_guid_source");}
      }
      delete active["c"+compId];
    }
    for(var ti=0;ti<o.rootTimes.length && !guidStopped && !stopped;ti++){
      var sample={rootTime:o.rootTimes[ti],items:[]};at(o.rootCompItemId,sample.rootTime,[],{},sample);if(charge(sample))state.samples.push(sample);
    }
    state.nativeRevisionAfter=read(app.project,"revision","nativeRenderState.nativeRevisionAfter");
    state.complete=!guidFailed && !stopped && typeof state.nativeRevisionBefore==="number" && state.nativeRevisionBefore===state.nativeRevisionAfter && state.samples.length===o.rootTimes.length;
    if(!state.complete)block("nativeRenderState","incomplete_native_render_guid_observation");
    result.nativeRenderState=state;
  }
  if(o.includeClassDiagnostics===true)try{result.nativeClassDiagnostics=aeAgentReadNativeClassDiagnostics(o.rootCompItemId,projectIndicesById);}
    catch(e){result.nativeClassDiagnostics={schema:"ae-agent-native-class-diagnostics.v1",complete:false,blockers:[{reason:"native_class_probe_failed"}]};}
  result.nativeAcquisition.revisionAfter=read(app.project,"revision","nativeAcquisition.revisionAfter");
  result.nativeAcquisition.stable=typeof result.nativeAcquisition.revisionBefore==="number" && result.nativeAcquisition.revisionBefore>=0 &&
    result.nativeAcquisition.revisionBefore%1===0 && result.nativeAcquisition.revisionBefore===result.nativeAcquisition.revisionAfter;
  if(!result.nativeAcquisition.stable)block("nativeAcquisition","native_project_changed_during_graph_read");
  try{if(unescape(encodeURIComponent(JSON.stringify(result))).length>b.snapshotBytes)block("graph","snapshot_bytes_budget_exceeded");}catch(e){block("graph","native_serialization_failed");}
  result.completeObservation=result.blockers.length===0;
  return result;
}

function rootRenderReaderFunctionSource(){return aeAgentKnownClassic3DRenderer.toString()+"\n"+aeAgentReadNativeClassDiagnostics.toString()+"\n"+aeAgentReadRootRender.toString();}
function nativeRootRenderScript(options={}){
  const norm=normalizeBudgets(options.budgets),safe=inspectPayloadSafety(options,8192);
  if(norm.blockers.length || safe.invalid || safe.exceeded || safe.cycleDetected || safe.depthExceeded || !id(options.rootCompItemId) || !isSafeId(options.readerId))
    throw new Error("invalid_root_render_reader_options");
  if(options.classic3dRenderer!==undefined)throw new Error("client_renderer_mapping_not_allowed");
  if(options.rootTimes!==undefined && (!Array.isArray(options.rootTimes)||!options.rootTimes.length||options.rootTimes.length>24 ||
    options.rootTimes.some(t=>!finite(t)||t<0)||new Set(options.rootTimes).size!==options.rootTimes.length))throw new Error("invalid_root_render_reader_times");
  const guidBudget=options.nativeRenderGuidMaxReads ?? NATIVE_RENDER_GUID_MAX_READS;
  if(!id(guidBudget)||guidBudget>NATIVE_RENDER_GUID_MAX_READS)throw new Error("invalid_root_render_guid_budget");
  return rootRenderReaderFunctionSource()+"\nreturn aeAgentReadRootRender("+JSON.stringify({...options,budgets:norm.budgets,nativeRenderGuidMaxReads:guidBudget})+");";
}
const nativeRootRenderProbeScript=options=>nativeRootRenderScript({...options,includeClassDiagnostics:true});

// Serialized into the same native capture script. Observation revisions may
// change between stable reads (own restored resolution writes, owner bookkeeping),
// but may never change during one read. Their numbers are acquisition metadata.
function aeAgentRootRenderCanonicalFacts(graph){
  var a=graph.nativeAcquisition,s=graph.nativeRenderState;
  if(graph.completeObservation!==true || !graph.blockers || graph.blockers.length!==0 || !a || a.stable!==true || typeof a.revisionBefore!=="number" ||
    a.revisionBefore<0 || a.revisionBefore%1!==0 || a.revisionBefore!==a.revisionAfter)throw new Error("unstable_root_render_observation");
  if(s && (s.complete!==true || typeof s.nativeRevisionBefore!=="number" || s.nativeRevisionBefore<0 ||
    s.nativeRevisionBefore%1!==0 || s.nativeRevisionBefore!==s.nativeRevisionAfter))throw new Error("unstable_native_render_guid_observation");
  var row=JSON.parse(JSON.stringify(graph));delete row.readerId;
  delete row.nativeAcquisition.revisionBefore;delete row.nativeAcquisition.revisionAfter;
  if(row.nativeRenderState){delete row.nativeRenderState.nativeRevisionBefore;delete row.nativeRenderState.nativeRevisionAfter;}
  return row;
}
function rootRenderCanonicalFactsFunctionSource(){return aeAgentRootRenderCanonicalFacts.toString();}
function canonicalRootRenderFacts(graph){
  const safe=inspectPayloadSafety(graph,4194304);
  if(safe.invalid||safe.exceeded||safe.cycleDetected||safe.depthExceeded)throw new Error("invalid_root_render_facts");
  return aeAgentRootRenderCanonicalFacts(graph);
}

function validateNativeRenderState(graph,{rootTimes,budgets}={}){
  const norm=normalizeBudgets(budgets),safe=inspectPayloadSafety(graph,norm.budgets.snapshotBytes),blockers=[];
  const block=reason=>blockers.push({code:BLOCKER,path:"nativeRenderState",reason});
  if(norm.blockers.length||safe.invalid||safe.exceeded||safe.cycleDetected||safe.depthExceeded||!Array.isArray(graph?.comps)||!Array.isArray(graph.sources)){
    block("invalid_native_render_guid_graph");return {ok:false,blockers};
  }
  const state=graph.nativeRenderState,byComp=new Map(graph.comps.filter(isRecord).map(c=>[c.itemId,c])),bySource=new Map(graph.sources.filter(isRecord).map(s=>[s.itemId,s]));
  if(state?.schema!==NATIVE_RENDER_STATE_SCHEMA || state.complete!==true || !uint(state.nativeRevisionBefore) ||
    state.nativeRevisionBefore!==state.nativeRevisionAfter || !Array.isArray(state.samples)||!state.samples.length||state.samples.length>24){
    block("incomplete_native_render_guid_observation");return {ok:false,blockers};
  }
  if(rootTimes!==undefined && (!Array.isArray(rootTimes)||rootTimes.length!==state.samples.length||rootTimes.some((t,i)=>!close(t,state.samples[i]?.rootTime))))block("native_render_guid_sample_binding_mismatch");
  let total=0;const times=new Set();
  for(const sample of state.samples){
    const root=byComp.get(graph.rootCompItemId),expected=[],active=new Set();let overflow=false;
    if(!isRecord(sample)||!root||!isGridAligned(sample.rootTime,root.frameRate)||sample.rootTime<0||sample.rootTime>=root.duration||times.has(sample.rootTime)||!Array.isArray(sample.items)){
      block("invalid_native_render_guid_sample");continue;
    }
    times.add(sample.rootTime);
    function add(kind,itemId,seconds,routeLayerIds){if(++total>NATIVE_RENDER_GUID_MAX_READS){overflow=true;return;}expected.push({kind,itemId,seconds,routeLayerIds});}
    function walk(compId,time,route){
      if(overflow)return;
      const c=byComp.get(compId);
      if(!c||!finite(time)||time<0||time>=c.duration||route.length>norm.budgets.routeDepth||active.has(compId)||!Array.isArray(c.layers)){
        block("invalid_native_render_guid_route");return;
      }
      active.add(compId);add("comp",compId,time,route);
      for(const l of c.layers){
        if(overflow)break;
        if(!isRecord(l)){block("invalid_native_render_guid_layer");continue;}
        if(l.enabled!==true||time<l.inPoint||time>=l.outPoint)continue;
        if(![l.startTime,l.inPoint,l.outPoint].every(finite)||!isValidStretch(l.stretch)||l.timeRemapEnabled!==false){block("invalid_native_render_guid_mapping");continue;}
        const sourceTime=(time-l.startTime)/(l.stretch/100),next=[...route,l.id];
        if(l.sourceKind==="comp"&&l.stretch===100)walk(l.sourceItemId,sourceTime,next);
        else if(l.sourceKind==="file_footage"){
          const source=bySource.get(l.sourceItemId);
          if(!source||!finite(sourceTime)||sourceTime<0||sourceTime>=source.duration)block("invalid_native_render_guid_source_time");
          else add("file_footage",l.sourceItemId,sourceTime,next);
        }else block("unsupported_native_render_guid_source");
      }
      active.delete(compId);
    }
    walk(graph.rootCompItemId,sample.rootTime,[]);
    if(overflow){block("native_render_guid_budget_exceeded");break;}
    if(sample.items.length!==expected.length){block("incomplete_native_render_guid_closure");continue;}
    for(const [i,row] of sample.items.entries()){
      const e=expected[i];
      if(!isRecord(row)||row.kind!==e.kind||row.itemId!==e.itemId||!close(row.seconds,e.seconds)||stableJson(row.routeLayerIds)!==stableJson(e.routeLayerIds)||
        row.method!=="getRenderGUID"||row.thread?.name!=="MainThread"||!id(row.thread.raw)||row.trace!==false||
        !["string","object"].includes(row.responseType)||typeof row.waitApplied!=="boolean"||
        row.responseType==="string"&&row.waitApplied!==false||row.responseType==="object"&&row.waitApplied!==true||typeof row.guid!=="string"||!UUID.test(row.guid))block("invalid_native_render_guid_fact");
    }
  }
  if(blockers.length)return {ok:false,blockers};
  const canonical=deepClone(state);delete canonical.nativeRevisionBefore;delete canonical.nativeRevisionAfter;
  return {ok:true,blockers:[],canonical};
}

function validateRootRenderGraph(graph,options={}){
  const norm=normalizeBudgets(options.budgets),blockers=[];
  const block=(path,reason)=>{if(blockers.length<128)blockers.push({code:BLOCKER,path,reason});};
  const safety=inspectPayloadSafety(graph,norm.budgets.snapshotBytes);
  if(options.classic3dRenderer!==undefined){block("renderer","client_renderer_mapping_not_allowed");return {ok:false,blockers,completeRootRenderState:false};}
  if(norm.blockers.length || safety.invalid || safety.exceeded || safety.cycleDetected || safety.depthExceeded || graph?.schema!==SCHEMA ||
    !id(graph.rootCompItemId) || !isSafeId(graph.readerId) || typeof graph.hostVersion!=="string" || !graph.hostVersion ||
    !Array.isArray(graph.comps) || !Array.isArray(graph.sources) || !Array.isArray(graph.blockers) || graph.blockers.length!==0 || graph.completeObservation!==true){
    block("graph","incomplete_or_invalid_native_observation");
    if(Array.isArray(graph?.blockers))for(const b of graph.blockers.slice(0,127))block(b.path,b.reason);
    return {ok:false,blockers,completeRootRenderState:false};
  }
  const acquisition=graph.nativeAcquisition;
  if(acquisition?.stable!==true||!uint(acquisition.revisionBefore)||acquisition.revisionBefore!==acquisition.revisionAfter)
    block("nativeAcquisition","native_project_changed_during_graph_read");
  if(!mediaClassMatches(graph.rootNativeClass,graph.rootCompItemId,"comp"))block("rootNativeClass","unknown_or_ambiguous_root_native_class");
  const p=graph.project;
  if(!isAbsolutePath(p?.projectFile) || options.rootCompItemId!==undefined&&graph.rootCompItemId!==options.rootCompItemId ||
    options.projectFile!==undefined&&normalizePath(p.projectFile)!==normalizePath(options.projectFile) ||
    options.projectKey!==undefined&&projectStateKey(p.projectFile)!==options.projectKey)block("project","native_project_binding_mismatch");
  const noneSpace=p?.workingSpace==="" || graph.hostVersion==="26.2x49"&&p?.workingSpace==="None";
  if(p?.bitsPerChannel!==8 || !noneSpace || p.workingSpaceClass!=="none" || ![2.2,2.4].includes(p.workingGamma) ||
    p.colorManagementSystem!==0 || ["linearizeWorkingSpace","linearBlending"].some(k=>p?.[k]!==false) ||
    typeof p.compensateForSceneReferredProfiles!=="boolean" || !notApplicable(p.sceneReferredCompensation,"colorManagementSystem=0;workingSpace=none") ||
    !enumIs(p?.gpuAccelType,["SOFTWARE","CUDA","OPENCL","Metal"]))block("project","unsupported_or_unknown_project_render_settings");
  const byComp=new Map(),bySource=new Map(),layerIds=new Set();let nodes=0;
  for(const c of graph.comps){if(!id(c?.itemId)||byComp.has(c.itemId)){block("comps","invalid_or_duplicate_comp_id");continue;}byComp.set(c.itemId,c);nodes+=1+(Array.isArray(c.layers)?c.layers.length:0);}
  for(const s of graph.sources){if(!id(s?.itemId)||bySource.has(s.itemId)||byComp.has(s.itemId)){block("sources","invalid_or_duplicate_source_id");continue;}bySource.set(s.itemId,s);nodes++;}
  if(nodes>norm.budgets.graphNodes)block("graph","graph_nodes_budget_exceeded");
  const root=byComp.get(graph.rootCompItemId),fps=options.fps ?? root?.frameRate;
  if(!finite(fps)||fps<=0||!root)block("rootCompItemId","root_comp_missing_or_unknown_fps");
  const nativeState=validateNativeRenderState(graph,{rootTimes:options.rootTimes,budgets:options.budgets});
  if(graph.nativeRenderState!==undefined&&!nativeState.ok)blockers.push(...nativeState.blockers);
  if(options.rootTimes!==undefined&&graph.nativeRenderState===undefined)block("nativeRenderState","missing_native_render_guid_observation");
  for(const c of byComp.values()){
    const path=`comp:${c.itemId}`;
    if(c.kind!=="comp" || typeof c.name!=="string" || ![c.width,c.height,c.duration,c.frameRate,c.frameDuration].every(v=>finite(v)&&v>0) ||
      c.pixelAspect!==1 || !close(c.frameRate,fps) || !close(c.frameDuration,1/fps) || c.displayStartTime!==0 ||
      ["preserveNestedFrameRate","preserveNestedResolution","motionBlur","frameBlending","draft3d"].some(k=>c[k]!==false) ||
      !vector(c.bgColor,3)||c.bgColor.some(v=>v<0||v>1) || !vector(c.resolutionFactor,2)||c.resolutionFactor.some(v=>!id(v)) ||
      c.proxy?.useProxy!==false || !notApplicable(c.proxy?.proxySource,"useProxy=false"))block(path,"unsupported_or_unknown_comp_render_settings");
    if(c.rendererClass!=="classic_3d" || typeof c.renderer!=="string" || !Array.isArray(c.renderers) ||
      !aeAgentKnownClassic3DRenderer(graph.hostVersion,c.renderer,c.renderers))block(path+".renderer","unverified_native_renderer");
    if(!uint(c.numLayers) || !Array.isArray(c.layers) || c.layers.length!==c.numLayers || !Array.isArray(c.stackOrder) ||
      c.stackOrder.length!==c.numLayers || stableJson(c.stackOrder)!==stableJson(c.layers.map(l=>l?.id))) {block(path+".stackOrder","incomplete_native_layer_order");continue;}
    for(const [index,l] of c.layers.entries()){
      const lp=`${path}.layer:${l?.id}`;
      if(!isRecord(l)){block(lp,"invalid_native_layer");continue;}
      if(!id(l?.id)||layerIds.has(l.id)||l.index!==index+1||l.kind!=="av"||l.matchName!=="ADBE AV Layer"||typeof l.name!=="string"||!id(l.sourceItemId))block(lp,"unsupported_or_unknown_layer_identity");
      layerIds.add(l?.id);
      if(["enabled","locked","shy","audioEnabled","hasAudio"].some(k=>typeof l?.[k]!=="boolean") ||
        ["solo","guideLayer","adjustmentLayer","nullLayer","threeDLayer","collapseTransformation","motionBlur","frameBlending","preserveTransparency","hasTrackMatte","isTrackMatte","timeRemapEnabled"].some(k=>l?.[k]!==false) ||
        l.parentId!==null || !enumIs(l.blendingMode,["NORMAL"])||!enumIs(l.frameBlendingType,["NO_FRAME_BLEND"])||!enumIs(l.trackMatteType,["NO_TRACK_MATTE"])||
        !enumIs(l.quality,["BEST"])||!enumIs(l.samplingQuality,["BILINEAR","BICUBIC"])||!enumIs(l.autoOrient,["NO_AUTO_ORIENT"]) ||
        l.effectsCount!==0||l.masksCount!==0)block(lp,"unsupported_or_unknown_layer_render_settings");
      if(![l.startTime,l.inPoint,l.outPoint].every(finite)||l.outPoint<=l.inPoint || !isValidStretch(l.stretch) ||
        l.sourceKind==="comp"&&l.stretch!==100)block(lp+".timing","unsupported_layer_timing");
      if(l.sourceKind==="comp" ? !byComp.has(l.sourceItemId) : l.sourceKind==="file_footage" ? !bySource.has(l.sourceItemId) : true)
        block(lp+".sourceItemId","incomplete_or_unsupported_source_closure");
      if(!mediaClassMatches(l.sourceClass,l.sourceItemId,l.sourceKind))block(lp+".sourceClass","unknown_or_ambiguous_source_native_class");
      for(const key of ["anchorPoint","position","scale","rotation","opacity"]){
        const prop=l.transform?.[key],value=prop?.value;
        const scalar=["rotation","opacity"].includes(key);
        const validValue=scalar?finite(value):(vector(value,2)||vector(value,3)&&value[2]===(key==="scale"?100:0));
        if(!prop || prop.numKeys!==0 || prop.expressionEnabled!==false || key==="position"&&prop.dimensionsSeparated!==false || !validValue)
          block(lp+".transform."+key,"unsupported_or_unknown_transform_property");
      }
      if(l.transform?.rotation?.value!==0 || !finite(l.transform?.opacity?.value) || l.transform.opacity.value<0 || l.transform.opacity.value>100 ||
        !Array.isArray(l.transform?.scale?.value)||l.transform.scale.value.slice(0,2).some(v=>!finite(v)||v<=0))block(lp+".transform","unsupported_static_transform");
    }
  }
  for(const s of bySource.values()){
    const path=`source:${s.itemId}`,i=s.interpretation;
    // MP4/M4V alone cannot be an AE still-image sequence. Reference MOV and other
    // externally resolving containers need their own content closure contract.
    if(s.kind!=="file_footage"||s.sourceKind!=="FileSource"||!isAbsolutePath(s.file)||normalizePath(s.mainSourceFile)!==normalizePath(s.file)||
      !/\.(mp4|m4v)$/i.test(s.file)||s.hasVideo!==true||typeof s.hasAudio!=="boolean"||s.footageMissing!==false||
      ![s.width,s.height,s.duration,s.frameRate,s.frameDuration].every(v=>finite(v)&&v>0)||s.pixelAspect!==1||!close(s.frameRate,fps)||!close(s.frameDuration,1/fps)||
      s.proxy?.useProxy!==false||!notApplicable(s.proxy?.proxySource,"useProxy=false"))block(path,"unsupported_or_unknown_footage_source");
    if(!i || i.isStill!==false||i.hasAlpha!==false||!notApplicable(i.alpha,"hasAlpha=false")||!enumIs(i.fieldSeparationType,["OFF"])||
      !enumIs(i.removePulldown,["OFF"])||!(i.highQualityFieldSeparation===false||notApplicable(i.highQualityFieldSeparation,"fieldSeparationType=OFF"))||
      i.conformFrameRate!==0||i.loop!==1||!close(i.nativeFrameRate,fps)||!close(i.displayFrameRate,fps))block(path+".interpretation","unsupported_or_unknown_source_interpretation");
    if(i?.color?.status!=="unsupported"||i.color.code!=="native_source_color_interpretation_unavailable")
      block(path+".interpretation.color","missing_explicit_source_color_observation_status");
    // A separate native API can eventually supply this observation. It must be
    // bound to this very read/source/file/host, never copied from a material hash.
    const evidence=options.sourceInterpretationEvidence?.find?.(e=>e.sourceItemId===s.itemId && e.readerId===graph.readerId);
    const directColor=!!evidence && evidence.schema==="ae-agent-native-source-color.v1" && evidence.readerId===graph.readerId &&
      evidence.hostVersion===graph.hostVersion && normalizePath(evidence.file)===normalizePath(s.file) &&
      isSafeId(evidence.commandId)&&evidence.colorEngine==="adobe"&&evidence.inputProfileDisabled===true&&evidence.interpretAsLinearLight===false;
    // The native GUID is an opaque render-state observation at the exact frame;
    // it is not a claim that hidden source-color settings are disabled. The full
    // structural whitelist and source bytes/load-epoch gates remain separate.
    if(!directColor&&!nativeState.ok)block(path+".interpretation.color","native_source_color_interpretation_unavailable");
  }
  const visited=new Set(),visiting=new Set(),sourceUses=new Set();
  function walk(itemId,depth){
    if(depth>norm.budgets.routeDepth){block(`comp:${itemId}`,"render_graph_depth_budget_exceeded");return;}
    if(visiting.has(itemId)){block(`comp:${itemId}`,"render_graph_cycle");return;}
    if(visited.has(itemId))return;
    visited.add(itemId);visiting.add(itemId);
    const layers=byComp.get(itemId)?.layers;
    for(const l of Array.isArray(layers)?layers:[])if(l?.sourceKind==="comp")walk(l.sourceItemId,depth+1);else if(l)sourceUses.add(l.sourceItemId);
    visiting.delete(itemId);
  }
  if(root)walk(root.itemId,0);
  if(visited.size!==byComp.size || [...bySource.keys()].some(id=>!sourceUses.has(id)))block("graph","foreign_or_unreachable_graph_node");
  const sourceReferences=[...bySource.values()].map(s=>({sourceItemId:s.itemId,file:s.file,
    metadata:{width:s.width,height:s.height,pixelAspect:s.pixelAspect,duration:s.duration,fps:s.frameRate},interpretation:deepClone(s.interpretation)}));
  if(blockers.length)return {ok:false,blockers,sourceReferences,completeRootRenderState:false};
  const canonical=canonicalRootRenderFacts({...graph,comps:[...byComp.values()].sort((a,b)=>a.itemId-b.itemId),
    sources:[...bySource.values()].sort((a,b)=>a.itemId-b.itemId)});
  // Diagnostic contract equality does not establish capture freshness, byte/load
  // evidence, server provenance, or source decoder epoch.
  return {ok:true,blockers:[],canonical,graphSha256:hash(canonical),sourceReferences,
    renderStateMode:nativeState.ok?"native_render_guid_opaque_sources":"explicit_native_source_color",completeRootRenderState:false};
}

function compareRootRenderGraphs(before,after,options={}){
  const a=validateRootRenderGraph(before,options),b=validateRootRenderGraph(after,options);
  if(!a.ok||!b.ok)return {ok:false,reason:BLOCKER,before:a,after:b};
  if(stableJson(a.canonical)!==stableJson(b.canonical))return {ok:false,reason:"root_render_state_drift",before:a,after:b};
  return {ok:true,graphSha256:a.graphSha256,completeRootRenderState:false};
}

function mapRootRenderSample(graph,requirement){
  const fail=reason=>({ok:false,reason});
  const safety=inspectPayloadSafety({graph,requirement},4194304);
  if(safety.invalid||safety.exceeded||safety.cycleDetected||safety.depthExceeded||graph?.schema!==SCHEMA||
    !Array.isArray(graph.comps)||!Array.isArray(graph.sources)||requirement?.rootCompItemId!==graph.rootCompItemId||
    !id(requirement.target?.compItemId)||!id(requirement.target?.layerId)||!finite(requirement.rootTime))return fail("invalid_root_render_sample");
  const compById=new Map(graph.comps.filter(isRecord).map(c=>[c.itemId,c])),root=compById.get(graph.rootCompItemId);
  if(!root||!isGridAligned(requirement.rootTime,root.frameRate)||requirement.rootTime<0||requirement.rootTime>=root.duration)return fail("invalid_root_render_sample_time");
  const paths=[];let visits=0,budgetExceeded=false;
  function walk(compId,time,route,ancestors){
    if(++visits>5000){budgetExceeded=true;return;}
    if(route.length>4 || ancestors.has(compId))return;
    const c=compById.get(compId);if(!c || time<0 || time>=c.duration)return;
    const next=new Set(ancestors);next.add(compId);
    for(const l of Array.isArray(c.layers)?c.layers:[]){
      if(budgetExceeded)break;
      if(!isRecord(l))continue;
      if(l.enabled!==true || l.timeRemapEnabled!==false || !isValidStretch(l.stretch)||time<l.inPoint||time>=l.outPoint)continue;
      const mapped=(time-l.startTime)/(l.stretch/100);
      if(compId===requirement.target.compItemId&&l.id===requirement.target.layerId&&l.sourceKind==="file_footage")
        paths.push({targetTime:time,sourceTime:mapped,observedStretch:l.stretch,routeLayerIds:route,sourceItemId:l.sourceItemId});
      if(l.sourceKind==="comp"&&l.stretch===100)walk(l.sourceItemId,mapped,[...route,l.id],next);
    }
  }
  walk(graph.rootCompItemId,requirement.rootTime,[],new Set());
  if(budgetExceeded)return fail("root_render_sample_budget_exceeded");
  const filtered=Array.isArray(requirement.routeLayerIds)?paths.filter(p=>stableJson(p.routeLayerIds)===stableJson(requirement.routeLayerIds)):paths;
  if(filtered.length!==1)return fail("ambiguous_or_invisible_root_render_sample");
  const mapped=filtered[0],source=graph.sources.find(s=>s?.itemId===mapped.sourceItemId);
  if(!source||requirement.sourceItemId!==undefined&&mapped.sourceItemId!==requirement.sourceItemId ||
    mapped.sourceTime<0||mapped.sourceTime>=source.duration||!close(mapped.targetTime,requirement.targetTime)||
    !close(mapped.sourceTime,requirement.sourceTime)||mapped.observedStretch!==requirement.observedStretch)return fail("root_render_sample_mapping_mismatch");
  return {ok:true,...mapped};
}

module.exports={SCHEMA,BLOCKER,NATIVE_RENDER_STATE_SCHEMA,NATIVE_RENDER_GUID_MAX_READS,rootRenderReaderFunctionSource,nativeRootRenderScript,
  nativeRootRenderProbeScript,rootRenderCanonicalFactsFunctionSource,rootRenderCanonicalCompareFunctionSource:rootRenderCanonicalFactsFunctionSource,
  canonicalRootRenderFacts,nativeGraphFacts:canonicalRootRenderFacts,validateNativeRenderState,validateRootRenderGraph,compareRootRenderGraphs,mapRootRenderSample};
