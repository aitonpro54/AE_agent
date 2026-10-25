"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const projectSave = require("./project-save");
const INSPECT = "inspect_title_variants";
const RENDER = "render_one_title_variant";
const SCHEMA = "ae-agent-native-title-render.v1";
const digest = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const samePath = (a,b) => String(a || "").replace(/\\/g,"/").toLowerCase() === String(b || "").replace(/\\/g,"/").toLowerCase();
function fail(code) { const error = new Error(code); error.code = code; throw error; }
function object(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) fail("native_render_invalid_input");
}
function text(value, max = 120) {
  if (typeof value !== "string" || !value || value !== value.trim() || value.length > max || /[\x00-\x1f]/.test(value)) fail("native_render_invalid_input");
  return value;
}
function ids(value) {
  if (!Array.isArray(value) || !value.length || value.length > 64 || value.some(id => !Number.isSafeInteger(id) || id < 1) || new Set(value).size !== value.length) fail("native_render_invalid_layer_ids");
  return value.slice().sort((a,b) => a-b);
}
function fileName(value) {
  text(value,96);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.(mov|avi)$/i.test(value) || /\.\.|\.$/.test(value) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(value)) fail("native_render_invalid_output_filename");
  return value;
}
function validateInput(name, raw) {
  if (![INSPECT,RENDER].includes(name)) fail("native_render_unknown_tool");
  const common = ["expectedProjectFile","rootCompItemId","variantCompItemId","controlledLayerIds"];
  object(raw, common.concat(name === INSPECT ? ["variants","attemptId"] : ["activeLayerIds","variantId","expectedStateHash","outputFileName","renderSettingsTemplate","outputModuleTemplate","range","timeoutMs"]));
  const a = {expectedProjectFile:text(raw.expectedProjectFile,4096),rootCompItemId:raw.rootCompItemId,variantCompItemId:raw.variantCompItemId,controlledLayerIds:ids(raw.controlledLayerIds)};
  if ((!path.win32.isAbsolute(a.expectedProjectFile) && !path.posix.isAbsolute(a.expectedProjectFile)) || /^(\\\\|\/\/)/.test(a.expectedProjectFile) || a.expectedProjectFile.replace(/\\/g,"/").split("/").some(p => p === "." || p === "..") || !/\.aep$/i.test(a.expectedProjectFile)) fail("native_render_invalid_project_path");
  if (![a.rootCompItemId,a.variantCompItemId].every(id => Number.isSafeInteger(id) && id > 0)) fail("native_render_invalid_comp_ids");
  const variant = v => {
    object(v,["variantId","activeLayerIds","outputFileName"]);
    const row = {variantId:text(v.variantId),activeLayerIds:ids(v.activeLayerIds),outputFileName:fileName(v.outputFileName)};
    if (row.activeLayerIds.some(id => !a.controlledLayerIds.includes(id))) fail("native_render_active_not_controlled");
    return row;
  };
  if (name === INSPECT) {
    if (!Array.isArray(raw.variants) || !raw.variants.length || raw.variants.length > 64) fail("native_render_invalid_variants");
    a.variants = raw.variants.map(variant);
    if (new Set(a.variants.map(v => v.variantId)).size !== a.variants.length || new Set(a.variants.map(v => v.outputFileName.toLowerCase())).size !== a.variants.length) fail("native_render_duplicate_variant_or_output");
    if (raw.attemptId !== undefined) { if (!/^[a-f0-9]{64}$/.test(raw.attemptId)) fail("native_render_invalid_attempt"); a.attemptId = raw.attemptId; }
  } else {
    Object.assign(a,variant({variantId:raw.variantId,activeLayerIds:raw.activeLayerIds,outputFileName:raw.outputFileName}));
    if (!/^[a-f0-9]{64}$/.test(raw.expectedStateHash)) fail("native_render_invalid_state_hash");
    a.expectedStateHash = raw.expectedStateHash;
    a.renderSettingsTemplate = text(raw.renderSettingsTemplate);
    a.outputModuleTemplate = text(raw.outputModuleTemplate);
    object(raw.range,["startFrame","frameCount"]);
    if (!Number.isSafeInteger(raw.range.startFrame) || raw.range.startFrame < 0 || !Number.isSafeInteger(raw.range.frameCount) || raw.range.frameCount < 1) fail("native_render_invalid_range");
    a.range = {...raw.range};
    a.timeoutMs = raw.timeoutMs === undefined ? 30000 : raw.timeoutMs;
    if (!Number.isSafeInteger(a.timeoutMs) || a.timeoutMs < 1000 || a.timeoutMs > 600000) fail("native_render_invalid_timeout");
  }
  return a;
}

// Host functions deliberately use ES3 syntax. No Node or modern Array methods.
function nativeSnapshot(a) {
  function norm(p) { return String(p || "").replace(/\\/g,"/").toLowerCase(); }
  function bad(s) { throw new Error(s); }
  function comp(id) { var i, found = null; for (i=1;i<=app.project.numItems;i++) { if (app.project.item(i).id===id) { if(found)bad("ambiguous_comp_id"); found=app.project.item(i); } } if (!(found instanceof CompItem))bad("missing_comp_id"); return found; }
  if (!app.project || !app.project.file || norm(app.project.file.fsName)!==norm(a.expectedProjectFile))bad("project_target_mismatch");
  if (typeof app.project.revision !== "number" || !isFinite(app.project.revision))bad("project_revision_unavailable");
  var rq=app.project.renderQueue;
  if (rq.rendering || rq.numItems>200)bad("queue_busy_or_too_large");
  var root=comp(a.rootCompItemId), target=comp(a.variantCompItemId), nodes=[], layerTotal=0, visits=0, occurrences=0, controlled=[], queue=[], bindings=[], producers=[], bindingKeys=[], definitionKeys=0, i,j,k;
  function contains(arr,id){var n;for(n=0;n<arr.length;n++)if(arr[n]===id)return true;return false;}
  function number(v){if(typeof v!=="number" || !isFinite(v))bad("matte_definition_unavailable");return v;}
  function readBool(v){if(typeof v!=="boolean")bad("matte_definition_unavailable");return v;}
  function value(v){var n,out=[];if(typeof v==="number")return number(v);if(!v || Object.prototype.toString.call(v)!=="[object Array]" || !v.length || v.length>3)bad("matte_definition_unsupported");for(n=0;n<v.length;n++)out.push(number(v[n]));return out;}
  function ease(v){var n,out=[];if(!v || typeof v.length!=="number" || !v.length || v.length>3)bad("matte_definition_unavailable");for(n=0;n<v.length;n++)out.push({speed:number(v[n].speed),influence:number(v[n].influence)});return out;}
  function definition(p){
    var n,row,keys=[],count,expression,spatial;
    if(!p || typeof p.numKeys!=="number" || p.numKeys<0 || p.numKeys!==Math.floor(p.numKeys) || p.numKeys>2000)bad("matte_definition_unavailable");
    count=p.numKeys;definitionKeys+=count;if(definitionKeys>12000)bad("matte_definition_too_large");spatial=readBool(p.isSpatial);
    if(readBool(p.canSetExpression)){if(typeof p.expression!=="string")bad("matte_definition_unavailable");expression=p.expression;}else expression="";
    row={numKeys:count,expressionEnabled:readBool(p.expressionEnabled),expression:expression,isSpatial:spatial};
    if(row.expressionEnabled && (!p.canSetExpression || !expression || typeof p.expressionError!=="string" || p.expressionError))bad("matte_expression_unavailable");
    for(n=1;n<=count;n++){
      var key={time:number(p.keyTime(n)),value:value(p.keyValue(n)),inType:String(p.keyInInterpolationType(n)),outType:String(p.keyOutInterpolationType(n)),inEase:ease(p.keyInTemporalEase(n)),outEase:ease(p.keyOutTemporalEase(n)),temporalContinuous:readBool(p.keyTemporalContinuous(n)),temporalAutoBezier:readBool(p.keyTemporalAutoBezier(n))};
      if(!key.inType || !key.outType || key.inType==="undefined" || key.outType==="undefined")bad("matte_definition_unavailable");
      if(spatial){key.inSpatial=value(p.keyInSpatialTangent(n));key.outSpatial=value(p.keyOutSpatialTangent(n));key.roving=readBool(p.keyRoving(n));key.spatialContinuous=readBool(p.keySpatialContinuous(n));key.spatialAutoBezier=readBool(p.keySpatialAutoBezier(n));}
      keys.push(key);
    }
    if(count)row.keys=keys;
    // With no keys the pre-expression base is constant. Never sample comp.time or a rendered expression value.
    else row.value=value(row.expressionEnabled ? p.valueAtTime(0,true) : p.value);
    return row;
  }
  function layerDefinition(l){
    var group=l.property("ADBE Transform Group"),names=["ADBE Anchor Point","ADBE Position","ADBE Scale","ADBE Rotate Z","ADBE Opacity"],rows=[],n,p;
    if(!group || l.parent || readBool(l.threeDLayer))bad("matte_transform_unsupported");
    for(n=0;n<names.length;n++){p=group.property(names[n]);if(names[n]==="ADBE Position" && (!p || p.dimensionsSeparated!==false))bad("matte_transform_unsupported");rows.push({matchName:names[n],definition:definition(p)});}
    var row={startTime:number(l.startTime),inPoint:number(l.inPoint),outPoint:number(l.outPoint),stretch:number(l.stretch),timeRemapEnabled:readBool(l.timeRemapEnabled),threeDLayer:false,collapseTransformation:readBool(l.collapseTransformation),transform:rows};
    if(row.outPoint<=row.inPoint || row.stretch===0)bad("matte_timing_unsupported");
    if(row.timeRemapEnabled)row.timeRemap=definition(l.property("ADBE Time Remapping"));
    return row;
  }
  function sourceDefinition(s){
    if(!(s instanceof CompItem) || typeof s.id!=="number" || s.id<1 || s.useProxy!==false)bad("matte_source_unsupported");
    return {id:s.id,name:String(s.name),type:"comp",width:number(s.width),height:number(s.height),pixelAspect:number(s.pixelAspect),duration:number(s.duration),frameDuration:number(s.frameDuration),displayStartTime:number(s.displayStartTime),useProxy:false};
  }
  function footageDefinition(s){
    if(typeof FootageItem==="undefined" || !(s instanceof FootageItem) || typeof s.id!=="number" || s.id<1 || s.useProxy!==false || s.footageMissing!==false || !s.file || !s.file.fsName || !s.mainSource)bad("matte_consumer_source_unsupported");
    var main=s.mainSource,row={id:s.id,name:String(s.name),type:"footage",file:String(s.file.fsName),width:number(s.width),height:number(s.height),pixelAspect:number(s.pixelAspect),duration:number(s.duration),frameRate:number(s.frameRate),hasVideo:readBool(s.hasVideo),hasAudio:readBool(s.hasAudio),footageMissing:false,useProxy:false,isStill:readBool(main.isStill),hasAlpha:readBool(main.hasAlpha)};
    if(row.hasAlpha){if(main.alphaMode===undefined)bad("matte_consumer_source_unsupported");row.alphaMode=String(main.alphaMode);row.premulColor=value(main.premulColor);row.invertAlpha=readBool(main.invertAlpha);}
    return row;
  }
  function registeredProducer(c,l){var n;for(n=0;n<producers.length;n++)if(producers[n].ownerCompItemId===c.id && producers[n].layer===l)return true;return false;}
  function immutableTextDefinition(l){
    var p=l.property("ADBE Text Properties").property("ADBE Text Document"),doc,n,range,styles=[],row;
    if(!p || p.expressionEnabled!==false || p.numKeys!==0)bad("immutable_text_animation_unsupported");
    doc=p.value;
    if(!doc || typeof doc.text!=="string" || doc.text.length>4096 || typeof doc.characterRange!=="function")bad("immutable_text_styles_unavailable");
    var fields=["font","fontSize","applyFill","fillColor","applyStroke","strokeColor","strokeWidth","tracking","leading","autoLeading","baselineShift","horizontalScale","verticalScale","fauxBold","fauxItalic","allCaps","smallCaps","justification"];
    function style(s){var out={},i,v,key;for(i=0;i<fields.length;i++){key=fields[i];if(key==="fillColor" && s.applyFill===false || (key==="strokeColor" || key==="strokeWidth") && s.applyStroke===false){out[key]=null;continue;}v=s[key];if(v===undefined){out[key]=null;continue;}if(typeof v==="number")out[key]=number(v);else if(typeof v==="string" || typeof v==="boolean")out[key]=v;else if(v && typeof v.length==="number")out[key]=value(v);else out[key]=String(v);}return out;}
    for(n=0;n<doc.text.length;n++){range=doc.characterRange(n,n+1);row=style(range);if(typeof row.font!=="string" || typeof row.fontSize!=="number")bad("immutable_text_styles_unavailable");styles.push(row);}
    return {text:doc.text,numKeys:0,expressionEnabled:false,documentStyle:style(doc),characterStyles:styles};
  }
  // Local first pass in each visited comp. Permission is exact owner/layer identity, never shared source identity.
  function deriveBindings(c){
    var n,m,fill,isControlled,producer,found,producerIdCount,fillIdCount,producerIndex,key,row,producerRow;
    for(n=1;n<=c.numLayers;n++){
      fill=c.layer(n);isControlled=c.id===target.id && contains(a.controlledLayerIds,fill.id);
      if(isControlled){
        if(!(fill instanceof TextLayer))bad("controlled_layer_not_text");
        if(fill.guideLayer || fill.locked || fill.isTrackMatte)bad("controlled_flags_unsupported");
        if(fill.hasTrackMatte!==true){if(fill.hasTrackMatte || fill.trackMatteLayer || (fill.trackMatteType!==undefined && fill.trackMatteType!==TrackMatteType.NO_TRACK_MATTE))bad("controlled_flags_unsupported");continue;}
      }else{
        // Preserve previously allowed footage/shape producers without introducing dependencies or new restrictions.
        if(fill.hasTrackMatte!==true || !fill.trackMatteLayer || !(fill.trackMatteLayer.source instanceof CompItem))continue;
        if(!(fill instanceof TextLayer) && (typeof AVLayer==="undefined" || !(fill instanceof AVLayer) || typeof FootageItem==="undefined" || !(fill.source instanceof FootageItem)) || fill.isTrackMatte!==false)bad("immutable_matte_consumer_unsupported");
      }
      if(typeof TrackMatteType.ALPHA==="undefined" || fill.trackMatteType!==TrackMatteType.ALPHA)bad("controlled_matte_type_unsupported");
      producer=fill.trackMatteLayer;found=0;producerIdCount=0;fillIdCount=0;producerIndex=0;
      if(!producer || typeof producer.id!=="number" || producer.id<1)bad("controlled_matte_link_unavailable");
      for(m=1;m<=c.numLayers;m++){if(c.layer(m).id===fill.id)fillIdCount++;if(c.layer(m).id===producer.id)producerIdCount++;if(c.layer(m)===producer){found++;producerIndex=m;}}
      if(found!==1 || producerIdCount!==1 || fillIdCount!==1 || fill.trackMatteLayer!==producer || producer===fill || c.id===target.id && contains(a.controlledLayerIds,producer.id))bad("controlled_matte_link_unsupported");
      if(typeof AVLayer==="undefined" || !(producer instanceof AVLayer) || producer.hasTrackMatte!==false || producer.isTrackMatte!==true || producer.trackMatteType!==TrackMatteType.NO_TRACK_MATTE || producer.trackMatteLayer!==null || readBool(producer.solo) || readBool(producer.guideLayer) || readBool(producer.locked))bad("matte_producer_flags_unsupported");
      key=c.id+":"+fill.id;if(contains(bindingKeys,key))continue;
      producerRow={id:producer.id,index:producerIndex,name:String(producer.name),enabled:readBool(producer.enabled),solo:false,guide:false,locked:false,hasTrackMatte:false,isTrackMatte:true,trackMatteType:"none",trackMatteLayerId:null,source:sourceDefinition(producer.source),definition:layerDefinition(producer)};
      row={ownerCompItemId:c.id,consumerLayerId:fill.id,consumerRole:isControlled ? "controlled_text" : fill instanceof TextLayer ? "immutable_text" : "immutable_footage",trackMatteType:"alpha",trackMatteLayerId:producer.id,producer:producerRow};
      if(isControlled){row.controlledLayerId=fill.id;row.controlledLayerIndex=n;row.controlledDefinition=layerDefinition(fill);}
      else {row.consumer={id:fill.id,index:n,name:String(fill.name),enabled:readBool(fill.enabled),solo:readBool(fill.solo),guide:readBool(fill.guideLayer),locked:readBool(fill.locked),hasTrackMatte:true,isTrackMatte:false,source:fill instanceof TextLayer ? null : footageDefinition(fill.source),definition:layerDefinition(fill)};if(fill instanceof TextLayer)row.consumer.textDefinition=immutableTextDefinition(fill);}
      bindings.push(row);bindingKeys.push(key);
      if(!registeredProducer(c,producer))producers.push({ownerCompItemId:c.id,layer:producer});
    }
  }
  function walk(c, stack, live) {
    var n,l,rows=[],next=[],x;
    visits++; if(visits>100)bad("comp_graph_too_large");
    for(n=0;n<stack.length;n++)if(stack[n]===c.id)bad("cyclic_comp_graph");
    if(c.id===target.id){occurrences++; if(!live)bad("variant_path_disabled");}
    for(n=0;n<stack.length;n++)next.push(stack[n]); next.push(c.id);
    deriveBindings(c);
    for(n=1;n<=c.numLayers;n++){
      l=c.layer(n);layerTotal++; if(layerTotal>1000)bad("layer_graph_too_large");
      if(typeof l.id!=="number" || l.id<1)bad("layer_identity_unavailable");
      if(l.solo)bad("solo_unsupported");
      rows.push({id:l.id,index:n,name:String(l.name),enabled:l.enabled===true,solo:l.solo===true,guide:l.guideLayer===true,locked:l.locked===true,sourceId:l.source ? l.source.id : null});
      if(c.id===target.id){
        for(x=0;x<a.controlledLayerIds.length;x++)if(l.id===a.controlledLayerIds[x]){
          if(!(l instanceof TextLayer))bad("controlled_layer_not_text");
          if(l.property("ADBE Text Properties").property("ADBE Text Document").expressionEnabled)bad("text_expression_unsupported");
          controlled.push({id:l.id,index:n,name:String(l.name),enabled:l.enabled===true,text:String(l.property("ADBE Text Properties").property("ADBE Text Document").value.text)});
        }
      }
      if(l.source instanceof CompItem){
        if(l.guideLayer || l.locked || l.hasTrackMatte || (l.isTrackMatte && !registeredProducer(c,l)) || (l.trackMatteType!==undefined && l.trackMatteType!==TrackMatteType.NO_TRACK_MATTE))bad("comp_path_flags_unsupported");
        walk(l.source,next,live && l.enabled===true);
      }
    }
    nodes.push({id:c.id,name:String(c.name),width:c.width,height:c.height,duration:c.duration,frameDuration:c.frameDuration,layers:rows});
  }
  walk(root,[],true);
  if(occurrences!==1 || controlled.length!==a.controlledLayerIds.length)bad("variant_not_uniquely_reachable_or_missing_layers");
  controlled.sort(function(a,b){return a.id-b.id;});
  bindings.sort(function(a,b){return a.ownerCompItemId-b.ownerCompItemId || a.consumerLayerId-b.consumerLayerId;});
  var rt=[],ot=[],item,om;
  for(i=1;i<=rq.numItems;i++){
    item=rq.item(i); var outputs=[];
    for(j=1;j<=item.numOutputModules;j++){om=item.outputModule(j);outputs.push(om.file ? String(om.file.fsName) : null);}
    queue.push({index:i,compItemId:item.comp.id,render:item.render===true,status:String(item.status),start:item.timeSpanStart,duration:item.timeSpanDuration,outputs:outputs});
    if(i===1){for(k=0;k<item.templates.length;k++)rt.push(String(item.templates[k]));om=item.outputModule(1);for(k=0;k<om.templates.length;k++)ot.push(String(om.templates[k]));}
  }
  var snapshot={projectFile:String(app.project.file.fsName),revision:app.project.revision,rootCompItemId:root.id,variantCompItemId:target.id,frameDuration:root.frameDuration,duration:root.duration,controlled:controlled,graph:nodes,queue:queue,templates:{renderSettings:rt,outputModule:ot,gap:rq.numItems ? null : "existing_queue_template_carrier_required"}};
  if(bindings.length)snapshot.matteDependencies=bindings;
  return snapshot;
}
function nativeRender(a, baseline, outputPath, attemptId) {
  var before, owned=null, oldQueue=[], oldLayers=[], rq=app.project.renderQueue, target=null, i,j,l,error=null,invoked=false,terminal=null,restoreErrors=[],phase="before_delivery",matteUnchanged=true;
  function norm(p){return String(p || "").replace(/\\/g,"/").toLowerCase();}
  function contains(arr,v){var n;for(n=0;n<arr.length;n++)if(arr[n]===v)return true;return false;}
  function equal(left,right){
    var key,lc=0,rc=0;
    if(left===right)return true;
    if(left===null || right===null || typeof left!=="object" || typeof right!=="object")return false;
    if((left instanceof Array)!==(right instanceof Array))return false;
    for(key in left)if(Object.prototype.hasOwnProperty.call(left,key)){lc++;if(!Object.prototype.hasOwnProperty.call(right,key) || !equal(left[key],right[key]))return false;}
    for(key in right)if(Object.prototype.hasOwnProperty.call(right,key))rc++;
    return lc===rc;
  }
  try {
    before=nativeSnapshot(a);
    if(!equal(before,baseline))throw new Error("stale_native_state");
    if(new File(outputPath).exists)throw new Error("output_exists");
    if(a.range.startFrame+a.range.frameCount>Math.floor(before.duration/before.frameDuration+0.000001))throw new Error("range_outside_comp");
    if(!contains(before.templates.renderSettings,a.renderSettingsTemplate) || !contains(before.templates.outputModule,a.outputModuleTemplate))throw new Error("template_not_inspected");
    for(i=1;i<=app.project.numItems;i++)if(app.project.item(i).id===a.variantCompItemId)target=app.project.item(i);
    for(i=1;i<=rq.numItems;i++)oldQueue.push({item:rq.item(i),render:rq.item(i).render});
    for(i=1;i<=target.numLayers;i++){l=target.layer(i);if(contains(a.controlledLayerIds,l.id))oldLayers.push({layer:l,enabled:l.enabled});}
    phase="mutating";
    for(i=0;i<oldQueue.length;i++)if(oldQueue[i].item.render!==false)oldQueue[i].item.render=false;
    for(i=0;i<oldLayers.length;i++){var wanted=contains(a.activeLayerIds,oldLayers[i].layer.id);if(oldLayers[i].layer.enabled!==wanted)oldLayers[i].layer.enabled=wanted;}
    var root=null;for(i=1;i<=app.project.numItems;i++)if(app.project.item(i).id===a.rootCompItemId)root=app.project.item(i);
    owned=rq.items.add(root); owned.render=false;
    owned.applyTemplate(a.renderSettingsTemplate);
    if(owned.numOutputModules!==1)throw new Error("multiple_output_modules_unsupported");
    var om=owned.outputModule(1);om.applyTemplate(a.outputModuleTemplate);
    var settings=om.getSettings(GetSettingsFormat.STRING),format=String(settings.Format || "");
    if(!/^(quicktime|avi|dxv 3)$/i.test(format))throw new Error("single_movie_template_required");
    if(((/^quicktime$/i.test(format) || /^dxv 3$/i.test(format)) && !/\.mov$/i.test(outputPath)) || (/^avi$/i.test(format) && !/\.avi$/i.test(outputPath)))throw new Error("movie_format_extension_mismatch");
    if(typeof PostRenderAction==="undefined" || PostRenderAction.NONE===undefined || om.postRenderAction===undefined)throw new Error("post_render_action_unavailable");
    om.postRenderAction=PostRenderAction.NONE;
    if(om.postRenderAction!==PostRenderAction.NONE)throw new Error("post_render_action_not_disabled");
    owned.timeSpanStart=a.range.startFrame*before.frameDuration;
    owned.timeSpanDuration=a.range.frameCount*before.frameDuration;
    om.file=new File(outputPath);
    if(norm(om.file.fsName)!==norm(outputPath) || Math.abs(owned.timeSpanStart-a.range.startFrame*before.frameDuration)>0.000001 || Math.abs(owned.timeSpanDuration-a.range.frameCount*before.frameDuration)>0.000001)throw new Error("output_or_range_readback_mismatch");
    if(new File(outputPath).exists)throw new Error("output_exists_before_render");
    owned.render=true;invoked=true;rq.render();
    terminal=owned.status===RQItemStatus.DONE ? "DONE" : String(owned.status);
    if(terminal!=="DONE")throw new Error("native_render_not_done");
    if(baseline.matteDependencies){
      var rendered=nativeSnapshot(a);
      if(!equal(rendered.matteDependencies,baseline.matteDependencies)){matteUnchanged=false;throw new Error("matte_dependency_drift_after_render");}
    }
  } catch(e) { error=String(e.message || e); }
  finally {
    if(owned){try{owned.render=false;}catch(e0){restoreErrors.push("owned_disable_failed");}}
    for(i=0;i<oldLayers.length;i++){try{if(oldLayers[i].layer.enabled!==oldLayers[i].enabled)oldLayers[i].layer.enabled=oldLayers[i].enabled;}catch(e1){restoreErrors.push("layer_restore_failed");}}
    for(i=0;i<oldQueue.length;i++){try{if(oldQueue[i].item.render!==oldQueue[i].render)oldQueue[i].item.render=oldQueue[i].render;}catch(e2){restoreErrors.push("queue_restore_failed");}}
    for(i=0;i<oldLayers.length;i++)if(oldLayers[i].layer.enabled!==oldLayers[i].enabled)restoreErrors.push("layer_restore_mismatch");
    for(i=0;i<oldQueue.length;i++)if(rq.item(i+1)!==oldQueue[i].item || oldQueue[i].item.render!==oldQueue[i].render)restoreErrors.push("queue_restore_mismatch");
    if(owned && (owned.render!==false || rq.item(rq.numItems)!==owned || rq.numItems!==oldQueue.length+1))restoreErrors.push("owned_identity_or_disable_mismatch");
    if(baseline.matteDependencies){
      try{if(!equal(nativeSnapshot(a).matteDependencies,baseline.matteDependencies)){matteUnchanged=false;restoreErrors.push("matte_dependency_drift_after_restore");}}
      catch(e3){matteUnchanged=false;restoreErrors.push("matte_dependency_read_failed_after_restore");}
    }
  }
  var receipt={schema:"ae-agent-native-title-render.v1",attemptId:attemptId,ok:!error && restoreErrors.length===0,phase:phase,error:error,renderInvoked:invoked,terminal:terminal,nativeDoneStatus:String(RQItemStatus.DONE),ownedStatusAfterRestore:owned ? String(owned.status) : null,restored:restoreErrors.length===0,restoreErrors:restoreErrors,ownedQueueIndex:owned ? rq.numItems : null,ownedDisabled:owned ? owned.render===false : null,outputPath:outputPath,rootCompItemId:a.rootCompItemId,variantCompItemId:a.variantCompItemId,variantId:a.variantId,activeLayerIds:a.activeLayerIds,range:a.range,renderSettingsTemplate:a.renderSettingsTemplate,outputModuleTemplate:a.outputModuleTemplate};
  if(baseline.matteDependencies){receipt.matteDependencies=baseline.matteDependencies;receipt.matteDependenciesUnchanged=matteUnchanged;}
  return receipt;
}
const literal = v => JSON.stringify(v).replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029");
function inspectScript(a) { return `var nativeSnapshot=${nativeSnapshot.toString()};return nativeSnapshot(${literal(a)});`; }
function renderScript(a, baseline, output, attempt) { return `var nativeSnapshot=${nativeSnapshot.toString()};var nativeRender=${nativeRender.toString()};return nativeRender(${literal(a)},${literal(baseline)},${literal(output)},${literal(attempt)});`; }
function unwrap(v) { return v && Object.prototype.hasOwnProperty.call(v,"result") ? v.result : v; }
function sameMatteDependencies(left,right) {
  const l=left && Object.prototype.hasOwnProperty.call(left,"matteDependencies"),r=right && Object.prototype.hasOwnProperty.call(right,"matteDependencies");
  return l===r && (!l || Array.isArray(left.matteDependencies) && left.matteDependencies.length>0 && digest(left.matteDependencies)===digest(right.matteDependencies));
}
function verifyReceipt(receipt,args) {
  const a=validateInput(RENDER,args);
  if (!receipt || receipt.schema!==SCHEMA || receipt.ok!==true || receipt.renderInvoked!==true || receipt.terminal!=="DONE" || receipt.restored!==true || receipt.ownedDisabled!==true || !Number.isSafeInteger(receipt.ownedQueueIndex) || receipt.ownedQueueIndex<1 || !/^[a-f0-9]{64}$/.test(receipt.attemptId) || receipt.argsHash!==digest(a) || !samePath(receipt.projectFile,a.expectedProjectFile) || receipt.stateHash!==a.expectedStateHash || receipt.variantId!==a.variantId || receipt.rootCompItemId!==a.rootCompItemId || receipt.variantCompItemId!==a.variantCompItemId || JSON.stringify(receipt.activeLayerIds)!==JSON.stringify(a.activeLayerIds) || JSON.stringify(receipt.range)!==JSON.stringify(a.range) || receipt.renderSettingsTemplate!==a.renderSettingsTemplate || receipt.outputModuleTemplate!==a.outputModuleTemplate || path.basename(receipt.outputPath || "").toLowerCase()!==a.outputFileName.toLowerCase()) fail("native_render_invalid_receipt");
  if(Object.prototype.hasOwnProperty.call(receipt,"matteDependencies") && (!Array.isArray(receipt.matteDependencies) || !receipt.matteDependencies.length || receipt.matteDependenciesUnchanged!==true))fail("native_render_invalid_matte_receipt");
  return true;
}
function inspectionArgs(args, attemptId) { const a=validateInput(RENDER,args);return {expectedProjectFile:a.expectedProjectFile,rootCompItemId:a.rootCompItemId,variantCompItemId:a.variantCompItemId,controlledLayerIds:a.controlledLayerIds,variants:[{variantId:a.variantId,activeLayerIds:a.activeLayerIds,outputFileName:a.outputFileName}],...(attemptId ? {attemptId} : {})}; }
function verifyInspection(receipt, read, args) {
  try{verifyReceipt(receipt,args);}catch(_){return false;}
  const a=validateInput(RENDER,args), attempt=read && read.attempt;
  if(!read || read.ok!==true || !attempt || attempt.attemptId!==receipt.attemptId || attempt.state!=="completed" || attempt.receiptConfirmed!==true || !samePath(read.snapshot && read.snapshot.projectFile,a.expectedProjectFile) || digest(attempt.receipt)!==digest(receipt))return false;
  if(!sameMatteDependencies(receipt,read.snapshot) || receipt.matteDependencies && digest(read.snapshot)!==read.stateHash)return false;
  return true;
}
function createExecutor(deps) {
  if(!deps || typeof deps.runExtendScriptBody!=="function" || typeof deps.resolveOutputFilePath!=="function" || !path.isAbsolute(deps.stateDir))fail("native_render_invalid_dependencies");
  const grants=new WeakSet(), used=new Set();let busy=false;
  function authorize(context) {
    const c=context || {},r=c.record,cp=c.checkpoint;
    if(c.autonomous || !c.confirm || c.allowWithoutCheckpoint || !r || r.confirmedBySurface!=="cep-panel" || r.executionState!=="executing" || !r.actionId || !c.runId || !cp || !cp.checkpointFile || !samePath(cp.sourceFile,r.project && r.project.expectedFile))fail("native_render_manual_authorization_required");
    projectSave.verifyDryRunReceipt(r,c.stepCount,c.contractVersion);
    const grant=Object.freeze({proposalId:r.actionId,runId:c.runId,projectFile:r.project.expectedFile,key:r.actionId+":"+c.runId});grants.add(grant);return grant;
  }
  function assertAuthorization(grant,args) { if(!grant || !grants.has(grant) || args && !samePath(grant.projectFile,args.expectedProjectFile))fail("native_render_manual_authorization_required"); }
  const recordPath = id => path.join(deps.stateDir,id+".json");
  function readRecord(id) {try { const r=JSON.parse(fs.readFileSync(recordPath(id),"utf8"));if(r.schema!==SCHEMA || r.attemptId!==id)fail("native_render_corrupt_attempt");return r;}catch(e){if(e.code==="ENOENT")return null;throw e;} }
  function writeRecord(record,exclusive) {
    fs.mkdirSync(deps.stateDir,{recursive:true});
    const file=recordPath(record.attemptId), temp=exclusive ? file : file+"."+crypto.randomUUID()+".tmp";
    const fd=fs.openSync(temp,"wx");try{fs.writeFileSync(fd,JSON.stringify(record)+"\n","utf8");fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    if(!exclusive)fs.renameSync(temp,file);
  }
  function outputPath(a) {
    const resolved=deps.resolveOutputFilePath(a.outputFileName),parent=path.dirname(resolved);
    fs.mkdirSync(parent,{recursive:true});
    const canonical=fs.realpathSync(parent);
    if(!samePath(canonical,parent))fail("native_render_output_root_alias");
    if(fs.existsSync(resolved) || fs.readdirSync(parent).some(n=>n.toLowerCase()===a.outputFileName.toLowerCase()))fail("native_render_output_exists");
    // Reject dangling symlinks too (existsSync follows the link).
    try{fs.lstatSync(resolved);fail("native_render_output_exists");}catch(e){if(e.code!=="ENOENT")throw e;}
    return path.join(canonical,a.outputFileName);
  }
  async function inspect(raw) {
    const a=validateInput(INSPECT,raw),snapshot=unwrap(await deps.runExtendScriptBody(inspectScript(a),{tool:INSPECT,phase:"inspection",mutatesProject:false}));
    if(!snapshot || !samePath(snapshot.projectFile,a.expectedProjectFile) || !Array.isArray(snapshot.controlled) || snapshot.controlled.length!==a.controlledLayerIds.length)fail("native_render_invalid_inspection");
    let attempt=null;
    if(a.attemptId){
      const record=readRecord(a.attemptId);
      attempt=record ? {attemptId:record.attemptId,state:record.state,receipt:record.receipt || null,receiptConfirmed:false,replayAllowed:false} : {attemptId:a.attemptId,state:"missing",replayAllowed:false};
      if(record && record.receipt && record.state==="completed" && digest(inspectionArgs(record.args))===digest({...a,attemptId:undefined})) {
        const r=record.receipt,q=snapshot.queue[r.ownedQueueIndex-1],b=record.baseline;
        attempt.receiptConfirmed=Boolean(q && q.compItemId===r.rootCompItemId && q.render===false && q.status===r.ownedStatusAfterRestore && q.outputs.length===1 && samePath(q.outputs[0],r.outputPath) && Math.abs(q.start-r.range.startFrame*snapshot.frameDuration)<0.000001 && Math.abs(q.duration-r.range.frameCount*snapshot.frameDuration)<0.000001 && snapshot.queue.length===b.queue.length+1 && b.queue.every((v,i)=>snapshot.queue[i].compItemId===v.compItemId && snapshot.queue[i].render===v.render && JSON.stringify(snapshot.queue[i].outputs)===JSON.stringify(v.outputs)) && b.controlled.every(v=>snapshot.controlled.some(l=>l.id===v.id && l.enabled===v.enabled)));
        if(b.matteDependencies || r.matteDependencies || snapshot.matteDependencies){
          try{verifyReceipt(r,record.args);attempt.receiptConfirmed=attempt.receiptConfirmed && digest(b)===record.args.expectedStateHash && sameMatteDependencies(b,r) && sameMatteDependencies(b,snapshot);}catch(_){attempt.receiptConfirmed=false;}
        }
      }
    }
    return {ok:true,schema:SCHEMA,snapshot,stateHash:digest(snapshot),variants:a.variants,attempt,mediaProof:"not_inspected",visualProof:"not_reviewed",alphaDxvProof:"not_verified"};
  }
  async function execute(raw, grant) {
    const a=validateInput(RENDER,raw);assertAuthorization(grant,a);
    if(used.has(grant.key) || busy)fail("native_render_authorization_replay_or_busy");
    used.add(grant.key);busy=true;
    let record=null,reserved=false;
    try{
      const pre=await inspect(inspectionArgs(a));
      if(pre.stateHash!==a.expectedStateHash)fail("native_render_stale_state");
      if(pre.snapshot.templates.gap || !pre.snapshot.templates.renderSettings.includes(a.renderSettingsTemplate) || !pre.snapshot.templates.outputModule.includes(a.outputModuleTemplate))fail("native_render_template_not_inspected");
      if(a.range.startFrame+a.range.frameCount>Math.floor(pre.snapshot.duration/pre.snapshot.frameDuration+0.000001))fail("native_render_range_outside_comp");
      const output=outputPath(a),attemptId=digest(output.toLowerCase());
      record={schema:SCHEMA,attemptId,outputPath:output,args:a,argsHash:digest(a),state:"unknown",reservedAt:new Date().toISOString(),authorization:{proposalId:grant.proposalId,runId:grant.runId},baseline:pre.snapshot};
      try{writeRecord(record,true);reserved=true;}catch(e){if(e.code==="EEXIST")fail("native_render_output_reserved_replay_blocked");throw e;}
      // Reservation is durable before delivery. A timeout never cancels AE or releases it.
      let result;
      try{result=unwrap(await deps.runExtendScriptBody(renderScript(a,pre.snapshot,output,attemptId),{tool:RENDER,phase:"render",mutatesProject:true,timeoutMs:a.timeoutMs}));}
      catch(e){return {ok:false,code:"native_render_outcome_unknown",attemptId,deliveryUnknown:true,replayAllowed:false,error:String(e.message || e)};}
      if(!result || result.schema!==SCHEMA || result.attemptId!==attemptId)return {ok:false,code:"native_render_outcome_unknown",attemptId,deliveryUnknown:true,replayAllowed:false};
      const receipt={...result,projectFile:a.expectedProjectFile,argsHash:record.argsHash,stateHash:a.expectedStateHash,authorization:record.authorization};
      record.receipt=receipt;
      record.state=receipt.ok ? "completed" : receipt.phase==="before_delivery" ? "rejected_before_mutation" : "failed";
      // Expected status comes from the native receipt, never from an untrusted later read.
      if(receipt.ok)verifyReceipt(receipt,a);
      if(receipt.ok && !sameMatteDependencies(record.baseline,receipt))fail("native_render_invalid_matte_receipt");
      writeRecord(record,false);
      const read=await inspect(inspectionArgs(a,attemptId));
      if(!receipt.ok || !verifyInspection(receipt,read,a))return {ok:false,code:receipt.ok ? "native_render_readback_failed" : "native_render_failed",attemptId,renderReceipt:receipt,inspection:read,replayAllowed:false};
      return {ok:true,renderReceipt:receipt,inspection:read,replayAllowed:false,mediaProof:"not_inspected",visualProof:"not_reviewed",alphaDxvProof:"not_verified"};
    }catch(e){
      if(reserved)return {ok:false,code:"native_render_outcome_unknown",attemptId:record.attemptId,deliveryUnknown:true,replayAllowed:false,error:String(e.message || e)};
      throw e;
    }finally{busy=false;}
  }
  return {authorize,assertAuthorization,inspect,execute};
}
function createToolDefinitions() {
  const common={expectedProjectFile:{type:"string"},rootCompItemId:{type:"integer",minimum:1},variantCompItemId:{type:"integer",minimum:1},controlledLayerIds:{type:"array",minItems:1,maxItems:64,items:{type:"integer",minimum:1}}};
  const variant={variantId:{type:"string"},activeLayerIds:common.controlledLayerIds,outputFileName:{type:"string"}};
  return [{name:INSPECT,description:"Read exact common-comp title variants, native state hash and existing queue templates without staging. Optional durable attempt read-back never grants replay.",inputSchema:{type:"object",additionalProperties:false,properties:{...common,variants:{type:"array",minItems:1,maxItems:64,items:{type:"object",additionalProperties:false,properties:variant,required:Object.keys(variant)}},attemptId:{type:"string",pattern:"^[a-f0-9]{64}$"}},required:[...Object.keys(common),"variants"]}},
    {name:RENDER,description:"Protected manual CEP synchronous native render of exactly one explicit title visibility group. Requires current dry-run and checkpoint. Reserves a unique generated MOV/AVI output durably; timeout is unknown and cannot replay. No AME/media/alpha/DXV proof.",inputSchema:{type:"object",additionalProperties:false,properties:{...common,...variant,expectedStateHash:{type:"string",pattern:"^[a-f0-9]{64}$"},renderSettingsTemplate:{type:"string"},outputModuleTemplate:{type:"string"},range:{type:"object",additionalProperties:false,properties:{startFrame:{type:"integer",minimum:0},frameCount:{type:"integer",minimum:1}},required:["startFrame","frameCount"]},timeoutMs:{type:"integer",minimum:1000,maximum:600000}},required:[...Object.keys(common),...Object.keys(variant),"expectedStateHash","renderSettingsTemplate","outputModuleTemplate","range"]}}];
}
module.exports={INSPECT,RENDER,SCHEMA,validateInput,createToolDefinitions,createExecutor,verifyReceipt,verifyInspection,inspectionArgs,inspectScript,renderScript,nativeSnapshot,digest};
