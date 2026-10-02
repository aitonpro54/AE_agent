"use strict";

const { geometryReadScript } = require("./placeholder-geometry");
const { isPositiveInteger, inspectPayloadSafety, stableJson, deepClone } = require("./montage-contract");

// A missing group/property is unknown. Both consumer and producer matte roles
// must be observed; a layer used as a matte is also outside the supported subset.
const footprintSupport = `
function __montageFootprint(layer) {
 try {
  var fx=layer.property("ADBE Effect Parade");
  if(!fx || typeof fx.numProperties!=="number" || !isFinite(fx.numProperties) || fx.numProperties<0 || Math.floor(fx.numProperties)!==fx.numProperties) return {complete:false,reason:"effect_group_unknown"};
  if(typeof layer.hasTrackMatte!=="boolean" || typeof layer.isTrackMatte!=="boolean" ||
     typeof TrackMatteType==="undefined" || TrackMatteType.NO_TRACK_MATTE===undefined ||
     layer.trackMatteType===undefined || layer.trackMatteType===null) return {complete:false,reason:"matte_roles_unknown"};
  var tg=layer.property("ADBE Transform Group");
  if(!tg) return {complete:false,reason:"transform_group_unknown"};
  var names=["ADBE Anchor Point","ADBE Position","ADBE Scale","ADBE Rotate Z","ADBE Opacity"];
  var expressions=false,keys=false;
  for(var p=0;p<names.length;p++) {
   var prop=tg.property(names[p]);
   if(!prop || typeof prop.numKeys!=="number" || !isFinite(prop.numKeys) || prop.numKeys<0 || Math.floor(prop.numKeys)!==prop.numKeys || typeof prop.expressionEnabled!=="boolean") return {complete:false,reason:"transform_property_unknown"};
   if(prop.expressionEnabled)expressions=true;
   if(prop.numKeys>0)keys=true;
  }
  return {complete:true,hasEffects:fx.numProperties>0,
   hasTrackMatte:layer.hasTrackMatte || layer.isTrackMatte || layer.trackMatteType!==TrackMatteType.NO_TRACK_MATTE,
   hasExpressions:expressions,hasTransformKeys:keys};
 } catch(e) {return {complete:false,reason:"footprint_read_failed"};}
}
`;

function narrowFootprintScript(target) {
  if (!isPositiveInteger(target?.compItemId) || !isPositiveInteger(target?.layerId)) throw new Error("invalid_montage_target");
  return `${footprintSupport}
 var comp=null,layer=null;
 if(app.project.numItems>2000)return {complete:false,reason:"project_item_budget"};
 for(var i=1;i<=app.project.numItems;i++){var c=app.project.item(i);if(c instanceof CompItem && c.id===${target.compItemId}){comp=c;break;}}
 if(!comp || comp.numLayers>5000)return {complete:false,reason:"comp_unknown_or_budget"};
 for(var j=1;j<=comp.numLayers;j++)if(comp.layer(j).id===${target.layerId}){layer=comp.layer(j);break;}
 if(!layer)return {complete:false,reason:"layer_unknown"};
 return __montageFootprint(layer);`;
}

async function defaultFootprintReader(target, run) {
  if (typeof run !== "function") return {complete:false,reason:"native_reader_unavailable"};
  try {
    const raw = await run(narrowFootprintScript(target)), row = raw?.result ?? raw;
    if (row?.complete !== true || !["hasEffects","hasTrackMatte","hasExpressions","hasTransformKeys"].every(k => typeof row[k] === "boolean"))
      return {complete:false,reason:row?.reason || "footprint_incomplete"};
    return row;
  } catch (_) { return {complete:false,reason:"footprint_read_error"}; }
}

function nativeLayerScript(target, plannedSourceId = null) {
  // Existing geometry emitter owns masks/parent/3D/collapse/source dimensions.
  const geometry = geometryReadScript(target, plannedSourceId).replace("return __phGeometry(comp,layer,source);", "var read=__phGeometry(comp,layer,source);");
  return `${geometry}
 ${footprintSupport}
 read.footprint=__montageFootprint(layer);
 read.transform.opacity=__phReadValue(layer.property("ADBE Transform Group").property("ADBE Opacity"),read.unsupported);
 read.geometry.layer.transformStatic=read.unsupported.length===0;
 var current=layer.source;var ci=null;
 for(var q=1;q<=app.project.numItems;q++)if(app.project.item(q).id===comp.id){ci=q;break;}
 read.comp={itemId:comp.id,itemIndex:ci,name:comp.name,frameRate:comp.frameRate};
 read.layer={id:layer.id,index:layer.index,name:layer.name,sourceItemId:current ? current.id : null,
  startTime:layer.startTime,inPoint:layer.inPoint,outPoint:layer.outPoint,stretch:layer.stretch,
  enabled:layer.enabled,locked:layer.locked,threeDLayer:layer.threeDLayer,timeRemapEnabled:layer.timeRemapEnabled,
  source:current ? {itemId:current.id,name:current.name,file:current.file ? current.file.fsName : null,
   footageMissing:current instanceof FootageItem ? current.footageMissing : false,
   width:current.width,height:current.height,pixelAspect:current.pixelAspect,duration:current.duration,frameRate:current.frameRate} : null};
 return read;`;
}

async function readNativeLayer(target, sourceId, run) {
  if (typeof run !== "function") throw new Error("montage_native_reader_unavailable");
  const raw = await run(nativeLayerScript(target, sourceId)), read = raw?.result ?? raw;
  const safety = inspectPayloadSafety(read, 65536);
  if (!read || safety.invalid || safety.exceeded || safety.cycleDetected || safety.depthExceeded || !read.comp || !read.layer ||
      !isPositiveInteger(read.comp.itemId) || !isPositiveInteger(read.comp.itemIndex) || !isPositiveInteger(read.layer.id) ||
      !isPositiveInteger(read.layer.index) || !["enabled","locked","threeDLayer","timeRemapEnabled"].every(k => typeof read.layer[k] === "boolean") ||
      !["startTime","inPoint","outPoint","stretch"].every(k => Number.isFinite(read.layer[k])) ||
      typeof read.comp.name !== "string" || !read.comp.name || typeof read.layer.name !== "string" || !read.layer.name || !read.layer.source ||
      !isPositiveInteger(read.layer.source.itemId) || typeof read.layer.source.name!=="string" || !read.layer.source.name ||
      typeof read.layer.source.footageMissing!=="boolean" ||
      !["width","height","pixelAspect","duration","frameRate"].every(k=>Number.isFinite(read.layer.source[k]) && read.layer.source[k]>0) ||
      !["anchorPoint","position","scale"].every(k => Array.isArray(read.transform?.[k]) && read.transform[k].length === 2 && read.transform[k].every(Number.isFinite)) ||
      !Number.isFinite(read.transform.rotation) || !Number.isFinite(read.transform.opacity) || read.footprint?.complete !== true)
    throw new Error("montage_native_read_incomplete");
  return read;
}

function routeEdge(read) {
  return {parentCompItemId:read.comp.itemId,childCompItemId:read.layer.sourceItemId,layerId:read.layer.id,
    layerIndex:read.layer.index,layerName:read.layer.name,enabled:read.layer.enabled,locked:read.layer.locked,
    startTime:read.layer.startTime,inPoint:read.layer.inPoint,outPoint:read.layer.outPoint,stretch:read.layer.stretch,
    timeRemapEnabled:read.layer.timeRemapEnabled,geometry:deepClone(read.geometry),transform:deepClone(read.transform),footprint:deepClone(read.footprint)};
}
const equal = (a,b) => stableJson(a) === stableJson(b);
module.exports = {narrowFootprintScript,defaultFootprintReader,nativeLayerScript,readNativeLayer,routeEdge,equal};
