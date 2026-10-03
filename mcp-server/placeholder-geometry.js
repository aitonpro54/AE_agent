"use strict";
const { aeSupportScript } = require("./placeholder-protection");
// Same bounded normalization is used in Node and serialized into ExtendScript.
// An observed disabled 3D switch is mandatory; unknown Z is never discarded.
function normalizeTransformValue(key,value,threeD) {
 if(key!=="anchorPoint" && key!=="position" && key!=="scale")return value;
 if(threeD!==false || !(value instanceof Array) || (value.length!==2 && value.length!==3))throw new Error("unsupported_placeholder_transform_dimensions");
 for(var i=0;i<value.length;i++)if(typeof value[i]!=="number" || !isFinite(value[i]))throw new Error("unknown_placeholder_transform_value");
 if(value.length===3 && value[2]!==(key==="scale"?100:0))throw new Error("unsupported_placeholder_transform_z");
 return [value[0],value[1]];
}
const aeGeometrySupport = `${aeSupportScript}
${normalizeTransformValue.toString()}
function __phCanonicalSource(source,unsupported) {
 unsupported=unsupported||[];
 var id=null;try{id=source ? source.id : null;}catch(e){}
 if(typeof id!=="number" || !isFinite(id) || id<=0 || Math.floor(id)!==id || id>9007199254740991){unsupported.push("unknown_placeholder_source_identity");return null;}
 var count=app.project.numItems,found=null;
 if(typeof count!=="number" || !isFinite(count) || count<0 || Math.floor(count)!==count || count>2000){unsupported.push("placeholder_source_lookup_budget");return null;}
 for(var i=1;i<=count;i++){var item=app.project.item(i);if(item && item.id===id){if(found){unsupported.push("ambiguous_placeholder_source_identity");return null;}found=item;}}
 if(!found){unsupported.push("missing_canonical_placeholder_source");return null;}
 if(!(found instanceof CompItem) && !(found instanceof FootageItem)){unsupported.push("unsupported_canonical_placeholder_source");return null;}
 return found;
}
function __phGeometry(comp,layer,sourceOverride) {
 var transform={};var unsupported=[];var source=__phCanonicalSource(sourceOverride||layer.source,unsupported);var group=layer.property("ADBE Transform Group");
 var names={anchorPoint:"ADBE Anchor Point",position:"ADBE Position",scale:"ADBE Scale",rotation:"ADBE Rotate Z"};
 if(!layer.source || layer.matchName==="ADBE Text Layer" || layer.matchName==="ADBE Vector Layer")unsupported.push("unsupported_placeholder_layer_kind");
 for(var key in names)if(names.hasOwnProperty(key))transform[key]=__phReadValue(group && group.property(names[key]),unsupported);
 var masks=null;try{masks=layer.property("ADBE Mask Parade");}catch(e){}
 var sourceKnown=source instanceof FootageItem || source instanceof CompItem;
 var parentId=null;try{parentId=layer.parent ? layer.parent.id : null;}catch(e){parentId="unknown";}
 var threeD=typeof layer.threeDLayer==="boolean" ? layer.threeDLayer : null;
 for(var field in names)if(names.hasOwnProperty(field) && field!=="rotation")try{transform[field]=normalizeTransformValue(field,transform[field],threeD);}catch(e){unsupported.push(String(e.message || e));}
 var canonicalAnchor=transform.anchorPoint;
 return {geometry:{comp:{width:comp.width,height:comp.height,pixelAspect:comp.pixelAspect,frameRate:comp.frameRate},
  source:{width:sourceKnown ? source.width : null,height:sourceKnown ? source.height : null,pixelAspect:sourceKnown ? source.pixelAspect : null,duration:sourceKnown ? source.duration : null,frameRate:sourceKnown ? source.frameRate : null},
  layer:{threeDLayer:threeD,parentLayerId:parentId,
   rotation:transform.rotation,anchorPoint:canonicalAnchor,transformStatic:unsupported.length===0,
   hasMasks:masks && typeof masks.numProperties==="number" ? masks.numProperties>0 : null,
   collapseTransformation:typeof layer.collapseTransformation==="boolean" ? layer.collapseTransformation : null}},
  transform:transform,unsupported:unsupported,target:{compItemId:comp.id,layerId:layer.id},sourceItemId:source ? source.id : null};
}
function __phRequireCoverGeometry(read) {
 var g=read.geometry;var c=g.comp;var s=g.source;var l=g.layer;
 var a=l.anchorPoint;
 var validAnchor=(a instanceof Array) && ((a.length===2 && isFinite(a[0]) && isFinite(a[1])) || (l.threeDLayer===false && a.length===3 && isFinite(a[0]) && isFinite(a[1]) && a[2]===0));
 if(!(c.width>0 && c.height>0 && s.width>0 && s.height>0 && isFinite(c.width) && isFinite(c.height) && isFinite(s.width) && isFinite(s.height) && c.frameRate>0 && isFinite(c.frameRate) && s.frameRate>0 && isFinite(s.frameRate) && s.duration>0 && isFinite(s.duration)) || c.pixelAspect!==1 || s.pixelAspect!==1 ||
  l.threeDLayer!==false || l.parentLayerId!==null || l.rotation!==0 || l.transformStatic!==true || l.hasMasks!==false || l.collapseTransformation!==false ||
  !validAnchor) throw new Error("unsupported_placeholder_cover_geometry");
}
`;
function geometryReadScript(target, sourceItemId = null) {
  return `${aeGeometrySupport}
 var comp=__phFindComp(${JSON.stringify(target.compItemId)});var layer=__phFindLayer(comp,${JSON.stringify(target.layerId)});
 var source=null;var wanted=${JSON.stringify(sourceItemId)};
 if(wanted!==null){for(var i=1;i<=app.project.numItems;i++)if(app.project.item(i).id===wanted)source=app.project.item(i);if(!source)throw new Error("planned_source_identity_unavailable");}
 return __phGeometry(comp,layer,source);`;
}
function geometryGuardScript(baselines) {
  return `${aeGeometrySupport}
 function __phEqualVector2D(a,b,threeD) {
  if(threeD===false && (a instanceof Array) && (b instanceof Array)) {
   var a2=(a.length===2)?a:(a.length===3 && a[2]===0?[a[0],a[1]]:null);
   var b2=(b.length===2)?b:(b.length===3 && b[2]===0?[b[0],b[1]]:null);
   if(a2 && b2) return __phEqual(a2,b2);
  }
  return __phEqual(a,b);
 }
 var baselines=${JSON.stringify(baselines)};
 for(var n=0;n<baselines.length;n++){var row=baselines[n];var comp=__phFindComp(row.target.compItemId);var layer=__phFindLayer(comp,row.target.layerId);var source=null;
  for(var i=1;i<=app.project.numItems;i++)if(app.project.item(i).id===row.sourceItemId)source=app.project.item(i);if(!source)throw new Error("planned_source_identity_unavailable");
  var current=__phGeometry(comp,layer,source);__phRequireCoverGeometry(current);
  for(var group in row.geometry)if(row.geometry.hasOwnProperty(group))for(var field in row.geometry[group])if(row.geometry[group].hasOwnProperty(field)){
   var match=(field==="anchorPoint")?__phEqualVector2D(row.geometry[group][field],current.geometry[group][field],current.geometry.layer.threeDLayer):__phEqual(row.geometry[group][field],current.geometry[group][field]);
   if(!match)throw new Error("placeholder_framing_geometry_changed");
  }
 }`;
}
module.exports = { aeGeometrySupport, geometryReadScript,geometryGuardScript,normalizeTransformValue };
