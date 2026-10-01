"use strict";
const crypto = require("crypto");
const { aeSupportScript, valueEqual, transformValueEqual } = require("./placeholder-protection");
const { mediaKeyForSource } = require("./placeholder-usage");
const ID = value => Number.isSafeInteger(value) && value > 0;
const finite = value => typeof value === "number" && Number.isFinite(value);
const OWNER = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const PREFIX = "AE_AGENT_REVIEW_";
const hash = value => crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
function fail(code) { const error=new Error(code);error.code=code;throw error; }
function validDimensions(item) { return item && finite(item.width) && finite(item.height) && item.width>0 && item.height>0 && item.width<=16384 && item.height<=16384 && item.pixelAspect===1; }
function resolveReviewTargets(input, inventory) {
  if (!inventory || inventory.complete!==true || !input || !Array.isArray(input.targets) || !input.targets.length || input.targets.length>4) fail("invalid_review_scope");
  const output=[];let count=0;let views=0;const seen=new Set();
  for(const request of input.targets) {
    const target=request.target;
    if(!target || !ID(target.compItemId) || !ID(target.layerId) || !ID(request.rootCompItemId))fail("invalid_review_identity");
    const key=target.compItemId+":"+target.layerId;if(seen.has(key))fail("duplicate_review_target");seen.add(key);
    const comp=inventory.comps.find(value=>value.itemId===target.compItemId),root=inventory.comps.find(value=>value.itemId===request.rootCompItemId);
    const layer=comp && comp.layers.find(value=>value.id===target.layerId),source=layer && inventory.sources.find(value=>value.itemId===layer.sourceItemId);
    if(!validDimensions(comp) || !validDimensions(root) || !validDimensions(source) || ![comp,root,source].every(item=>finite(item.duration) && item.duration>0 && finite(item.frameRate) && item.frameRate>0) || !source || source.type!=="footage" || source.hasVideo!==true || source.footageMissing!==false ||
      !layer || layer.stretch!==100 || layer.timeRemapEnabled!==false || layer.enabled!==true)fail("unsupported_review_video_geometry_or_timing");
    const routes=[];
    function visit(current,route,branch) {
      if(branch.includes(current.itemId) || branch.length>16)fail("unsupported_review_route");
      if(current.itemId===comp.itemId){routes.push(route);return;}
      for(const edge of current.layers) {
        const child=inventory.comps.find(value=>value.itemId===edge.sourceItemId);
        if(child && edge.enabled===true)visit(child,[...route,{compItemId:current.itemId,...edge}],[...branch,current.itemId]);
        if(routes.length>1)fail("unsupported_shared_review_target");
      }
    }
    visit(root,[],[]);if(routes.length!==1)fail("review_target_unreachable");
    const route=routes[0];
    if(request.routeLayerIds!==undefined && (!Array.isArray(request.routeLayerIds) || JSON.stringify(request.routeLayerIds)!==JSON.stringify(route.map(value=>value.id))))fail("stale_review_route");
    if(route.some(edge=>edge.stretch!==100 || edge.timeRemapEnabled!==false || ![edge.startTime,edge.inPoint,edge.outPoint].every(finite)))fail("unsupported_review_route_timing");
    const viewKinds=request.viewKinds || ["target_comp"];
    if(!Array.isArray(viewKinds) || !viewKinds.length || new Set(viewKinds).size!==viewKinds.length || viewKinds.some(kind=>!["source","target_comp","root_comp"].includes(kind)))fail("invalid_review_view_kinds");
    if(!Array.isArray(request.samples) || !request.samples.length || request.samples.length>24)fail("review_samples_required");
    const sampleTimes=new Set();
    const samples=request.samples.map((sample,index)=>{
      if(![sample.rootTime,sample.targetTime,sample.sourceTime].every(finite) || !Array.isArray(sample.roles) || !sample.roles.length || sample.roles.some(role=>!["first","middle","last","shot"].includes(role)))fail("invalid_review_sample");
      if(sampleTimes.has(sample.rootTime))fail("duplicate_review_sample");sampleTimes.add(sample.rootTime);
      let time=sample.rootTime;
      if(time<0 || time>=root.duration)fail("review_sample_outside_root");
      for(const edge of route){if(time<edge.inPoint || time>=edge.outPoint)fail("review_sample_outside_route");time-=edge.startTime;const child=inventory.comps.find(item=>item.itemId===edge.sourceItemId);if(!child || !finite(child.duration) || time<0 || time>=child.duration)fail("review_sample_outside_nested_comp");}
      const epsilon=0.25/comp.frameRate;
      if(time<layer.inPoint || time>=layer.outPoint || Math.abs(time-sample.targetTime)>epsilon || Math.abs(time-layer.startTime-sample.sourceTime)>epsilon || sample.sourceTime<0 || sample.sourceTime>=source.duration)fail("stale_review_sample_mapping");
      return {rootTime:sample.rootTime,targetTime:sample.targetTime,sourceTime:sample.sourceTime,index,roles:[...sample.roles]};
    });
    if(!["first","middle","last"].every(role=>samples.some(sample=>sample.roles.includes(role))))fail("review_first_middle_last_required");
    count+=samples.length;views+=samples.length*viewKinds.length;
    if(count>24 || views>24)fail("review_sample_or_view_budget");
    const mediaKey=mediaKeyForSource(source);if(mediaKey==="unknown")fail("review_source_identity_unknown");
    output.push({target:{compItemId:target.compItemId,layerId:target.layerId},rootCompItemId:root.itemId,sourceItemId:source.itemId,sourceKey:hash(mediaKey),
      routeLayerIds:route.map(edge=>edge.id),route:route.map(edge=>({compItemId:edge.compItemId,id:edge.id,sourceItemId:edge.sourceItemId,startTime:edge.startTime,inPoint:edge.inPoint,outPoint:edge.outPoint,stretch:edge.stretch,timeRemapEnabled:edge.timeRemapEnabled,enabled:edge.enabled,
        compDuration:inventory.comps.find(item=>item.itemId===edge.compItemId).duration,compFrameRate:inventory.comps.find(item=>item.itemId===edge.compItemId).frameRate,
        childDuration:inventory.comps.find(item=>item.itemId===edge.sourceItemId).duration,childFrameRate:inventory.comps.find(item=>item.itemId===edge.sourceItemId).frameRate})),
      layer:{id:layer.id,sourceItemId:layer.sourceItemId,startTime:layer.startTime,inPoint:layer.inPoint,outPoint:layer.outPoint,stretch:layer.stretch,timeRemapEnabled:layer.timeRemapEnabled,enabled:layer.enabled},
      viewKinds:[...viewKinds],samples,comp:{itemId:comp.itemId,width:comp.width,height:comp.height,pixelAspect:comp.pixelAspect,duration:comp.duration,frameRate:comp.frameRate},
      root:{itemId:root.itemId,width:root.width,height:root.height,pixelAspect:root.pixelAspect,duration:root.duration,frameRate:root.frameRate},
      source:{itemId:source.itemId,file:source.file,footageMissing:false,width:source.width,height:source.height,pixelAspect:source.pixelAspect,duration:source.duration,frameRate:source.frameRate}});
  }
  return output;
}
function createServiceSpecification(targets, projectKey, owner=crypto.randomUUID()) {
  if(!OWNER.test(owner) || !/^[a-f0-9]{64}$/.test(projectKey))fail("invalid_review_owner");
  const comment=`AE_AGENT_REVIEW:v1:${projectKey}:${owner}`;
  const cells=[];const controls=[];
  for(const [targetIndex,target] of targets.entries()) for(const sample of target.samples)for(const kind of target.viewKinds) {
    const source=kind==="source" ? target.source : kind==="root_comp" ? target.root : target.comp;
    const time=kind==="source" ? sample.sourceTime : kind==="root_comp" ? sample.rootTime : sample.targetTime;
    const index=controls.length;const frameRate=target.root.frameRate;
    const item={name:`${PREFIX}${owner}_${String(index+1).padStart(2,"0")}_${kind}`,comment,width:source.width,height:source.height,frameRate,duration:1/frameRate,
      role:"control",targetIndex,sampleIndex:sample.index,viewKind:kind,
      layers:[{role:"reference",sourceItemId:kind==="source" ? target.sourceItemId : kind==="root_comp" ? target.rootCompItemId : target.target.compItemId,
        startTime:-time,inPoint:0,outPoint:1/frameRate,anchorPoint:[source.width/2,source.height/2],position:[source.width/2,source.height/2],scale:[100,100]}]};
    controls.push(item);
    const column=index%3,row=Math.floor(index/3);const scale=Math.min(640/source.width,360/source.height);
    cells.push({role:"cell",controlIndex:index,startTime:0,inPoint:0,outPoint:1/frameRate,anchorPoint:[source.width/2,source.height/2],
      position:[column*640+320,row*400+180],scale:[scale*100,scale*100]});
    cells.push({role:"label",text:`T${targetIndex+1} S${sample.index+1} ${kind} t=${time.toFixed(3)}`,position:[column*640+8,row*400+388]});
  }
  const sheet={name:`${PREFIX}${owner}_SHEET`,comment,width:1920,height:Math.ceil(controls.length/3)*400,frameRate:targets[0].root.frameRate,duration:1/targets[0].root.frameRate,role:"sheet",layers:cells};
  return {schema:"ae-placeholder-review-artifact.v1",owner,projectKey,comment,targets,controls,sheet,specHash:hash({targets,controls,sheet})};
}
const aeServiceReadSupport=`${aeSupportScript}
function __phReadService(item) {
 if(item.numLayers>48)throw new Error("review_layer_read_budget");
 var row={itemId:item.id,itemIndex:__phProjectIndex(item),name:item.name,comment:item.comment,width:item.width,height:item.height,frameRate:item.frameRate,duration:item.duration,pixelAspect:item.pixelAspect,layers:[]};
 for(var j=1;j<=item.numLayers;j++){var layer=item.layer(j);var group=layer.property("ADBE Transform Group");var unsupported=[];
  var value={id:layer.id,index:j,name:layer.name,matchName:layer.matchName,sourceItemId:layer.source ? layer.source.id : null,startTime:layer.startTime,inPoint:layer.inPoint,outPoint:layer.outPoint,stretch:layer.stretch,timeRemapEnabled:layer.timeRemapEnabled,enabled:layer.enabled,
   anchorPoint:__phReadValue(group.property("ADBE Anchor Point"),unsupported),position:__phReadValue(group.property("ADBE Position"),unsupported),scale:__phReadValue(group.property("ADBE Scale"),unsupported),
   rotation:__phReadValue(group.property("ADBE Rotate Z"),unsupported),opacity:__phReadValue(group.property("ADBE Opacity"),unsupported),threeDLayer:layer.threeDLayer,parentLayerId:layer.parent ? layer.parent.id : null,collapseTransformation:layer.collapseTransformation,
   hasMasks:layer.property("ADBE Mask Parade") ? layer.property("ADBE Mask Parade").numProperties>0 : null,unsupported:unsupported};
  if(!layer.source){var text=layer.property("ADBE Text Properties");if(text){var property=text.property("ADBE Text Document");
   if(text.matchName==="ADBE Text Properties" && property && property.matchName==="ADBE Text Document") {
    value.text=property.value.text;value.fontSize=property.value.fontSize;value.layerKind="text";
    value.textDocument={matchName:property.matchName,numKeys:property.numKeys,expressionEnabled:property.expressionEnabled};
    if(property.numKeys!==0 || property.expressionEnabled!==false)unsupported.push("review_label_animation");
   }else unsupported.push("review_label_text_evidence_missing");}}
  row.layers.push(value);
 }return row;
}
`;
function createServiceScript(spec, projectFile) {
  return `${aeServiceReadSupport}
 var spec=${JSON.stringify(spec)};var created=[];var controls=[];
 if(!app.project.file || __phPath(app.project.file.fsName)!==__phPath(${JSON.stringify(projectFile)}))throw new Error("review_project_changed");
 for(var i=1;i<=app.project.numItems;i++)if(String(app.project.item(i).name).indexOf(${JSON.stringify(PREFIX+spec.owner)})===0)throw new Error("review_name_collision");
 function create(desired){var comp=app.project.items.addComp(desired.name,desired.width,desired.height,1,desired.duration,desired.frameRate);created.push(comp);comp.comment=desired.comment;if(comp.comment!==desired.comment)throw new Error("review_owner_comment_write_failed");return comp;}
 function addReference(comp,desired,source){var layer=comp.layers.add(source);layer.startTime=desired.startTime;layer.inPoint=desired.inPoint;layer.outPoint=desired.outPoint;layer.stretch=100;layer.timeRemapEnabled=false;
  var transform=layer.property("ADBE Transform Group");transform.property("ADBE Anchor Point").setValue(desired.anchorPoint);transform.property("ADBE Position").setValue(desired.position);transform.property("ADBE Scale").setValue(desired.scale);return layer;}
 function find(id){for(var i=1;i<=app.project.numItems;i++)if(app.project.item(i).id===id)return app.project.item(i);throw new Error("review_source_missing");}
 // Validate every source before any creation.
 for(var c=0;c<spec.controls.length;c++){var source=find(spec.controls[c].layers[0].sourceItemId);if(source.width!==spec.controls[c].width || source.height!==spec.controls[c].height || source.pixelAspect!==1)throw new Error("review_source_geometry_changed");}
 for(var t=0;t<spec.targets.length;t++){var target=spec.targets[t];var comp=__phFindComp(target.target.compItemId);var root=__phFindComp(target.rootCompItemId);var layer=__phFindLayer(comp,target.target.layerId);if(!layer.source || layer.source.id!==target.sourceItemId)throw new Error("review_source_changed");
  var media=find(target.sourceItemId);if(!(media instanceof FootageItem) || !media.file || __phPath(media.file.fsName)!==__phPath(target.source.file) || media.footageMissing!==false || media.duration!==target.source.duration || media.frameRate!==target.source.frameRate || media.hasVideo!==true || !media.mainSource || media.mainSource.isStill!==false)throw new Error("review_source_metadata_changed");
  if(comp.duration!==target.comp.duration || comp.frameRate!==target.comp.frameRate || root.duration!==target.root.duration || root.frameRate!==target.root.frameRate)throw new Error("review_comp_sampling_metadata_changed");
  var expectedLayers=[target.layer];var actualLayers=[layer];for(var r=0;r<target.route.length;r++){var edge=target.route[r],parentComp=__phFindComp(edge.compItemId),childComp=__phFindComp(edge.sourceItemId);if(parentComp.duration!==edge.compDuration || parentComp.frameRate!==edge.compFrameRate || childComp.duration!==edge.childDuration || childComp.frameRate!==edge.childFrameRate)throw new Error("review_route_sampling_metadata_changed");expectedLayers.push(edge);actualLayers.push(__phFindLayer(parentComp,edge.id));}
  for(var r=0;r<expectedLayers.length;r++){var e=expectedLayers[r],a=actualLayers[r];if(!a.source || a.source.id!==e.sourceItemId || a.startTime!==e.startTime || a.inPoint!==e.inPoint || a.outPoint!==e.outPoint || a.stretch!==100 || a.timeRemapEnabled!==false || a.enabled!==true)throw new Error("review_sample_mapping_changed");}}
 app.beginUndoGroup("Codex Create Placeholder Review");
 try {
  for(var c=0;c<spec.controls.length;c++){var desired=spec.controls[c];var comp=create(desired);controls.push(comp);addReference(comp,desired.layers[0],find(desired.layers[0].sourceItemId));}
  var sheet=create(spec.sheet);
  for(var cell=0;cell<spec.sheet.layers.length;cell++){var desired=spec.sheet.layers[cell];if(desired.role==="cell")addReference(sheet,desired,controls[desired.controlIndex]);else {
   var label=sheet.layers.addText(desired.text);var text=label.property("ADBE Text Properties").property("ADBE Text Document");var doc=text.value;doc.fontSize=20;text.setValue(doc);label.startTime=0;label.inPoint=0;label.outPoint=spec.sheet.duration;var group=label.property("ADBE Transform Group");group.property("ADBE Anchor Point").setValue([0,0]);group.property("ADBE Scale").setValue([100,100]);group.property("ADBE Position").setValue(desired.position);}}
  var rows=[];for(var i=0;i<created.length;i++)rows.push(__phReadService(created[i]));
  var ids=[];for(var i=0;i<rows.length;i++)ids.push(rows[i].itemId);
  return {ok:true,owner:spec.owner,items:rows,createdItemIds:ids};
 }catch(e){var ids=[];for(var i=0;i<created.length;i++)ids.push(created[i].id);return {ok:false,error:String(e),owner:spec.owner,createdItemIds:ids};}
 finally{app.endUndoGroup();}
 `;
}
function readServiceScript(itemIds) {
  return `${aeServiceReadSupport}
 var ids=${JSON.stringify(itemIds)};var rows=[];
 for(var n=0;n<ids.length;n++){for(var i=1;i<=app.project.numItems;i++){var item=app.project.item(i);if(item.id===ids[n]){if(!(item instanceof CompItem))throw new Error("review_item_type_changed");rows.push(__phReadService(item));}}}
 return {projectFile:app.project.file ? app.project.file.fsName : null,items:rows};`;
}
function verifyServiceReceipt(spec, rows, projectKey) {
  const failures=[];
  if(projectKey!==spec.projectKey || !Array.isArray(rows) || rows.length!==spec.controls.length+1 ||
    rows.some(row=>!row || !ID(row.itemId) || !Array.isArray(row.layers)) || new Set(rows.map(row=>row.itemId)).size!==rows.length) return {ok:false,failures:["review_identity_or_count_mismatch"]};
  const desired=[...spec.controls,spec.sheet];
  const controlIds=spec.controls.map(control=>(rows.find(row=>row.name===control.name)||{}).itemId);
  for(const expected of desired) {
    const row=rows.find(value=>value.name===expected.name);
    if(!row || !ID(row.itemId) || row.comment!==spec.comment || !["width","height","frameRate","duration"].every(key=>valueEqual(row[key],expected[key])) || row.pixelAspect!==1 || row.layers.length!==expected.layers.length){failures.push("review_comp_mismatch:"+expected.name);continue;}
    const actual=[...row.layers].reverse(); // AE adds new layers at the top.
    for(const [index,layer] of expected.layers.entries()) {
      const current=actual[index];
      if(!current || !Array.isArray(current.unsupported) || current.unsupported.length || current.rotation!==0 || current.opacity!==100 || current.threeDLayer!==false || current.parentLayerId!==null || current.hasMasks!==false){failures.push("review_layer_unsupported");continue;}
      if(layer.role==="label") {
        const textDocument = current.textDocument;
        const isProvenText = current.sourceItemId===null && typeof current.text==="string" &&
          current.matchName==="ADBE Text Layer" && current.layerKind==="text" && textDocument &&
          textDocument.matchName==="ADBE Text Document" && textDocument.numKeys===0 && textDocument.expressionEnabled===false;
        if(!isProvenText || (current.collapseTransformation!==true && current.collapseTransformation!==false)) {
          failures.push("review_layer_unsupported");
          continue;
        }
        if(current.text!==layer.text || current.fontSize!==20 ||
          !transformValueEqual(current.position,layer.position,"position",false) ||
          !transformValueEqual(current.anchorPoint,[0,0],"anchorPoint",false) ||
          !transformValueEqual(current.scale,[100,100],"scale",false) ||
          current.startTime!==0 || current.inPoint!==0 || !valueEqual(current.outPoint,expected.duration) ||
          current.enabled!==true || current.stretch!==100 || current.timeRemapEnabled!==false) {
          failures.push("review_label_mismatch");
        }
        continue;
      }
      if(current.collapseTransformation!==false) {
        failures.push("review_layer_unsupported");
        continue;
      }
      const sourceId=layer.role==="cell" ? controlIds[layer.controlIndex] : layer.sourceItemId;
      if(current.sourceItemId!==sourceId || current.stretch!==100 || current.timeRemapEnabled!==false || current.enabled!==true ||
        !valueEqual(current.startTime, layer.startTime) ||
        !valueEqual(current.inPoint, layer.inPoint) ||
        !valueEqual(current.outPoint, layer.outPoint) ||
        !transformValueEqual(current.anchorPoint, layer.anchorPoint, "anchorPoint", false) ||
        !transformValueEqual(current.position, layer.position, "position", false) ||
        !transformValueEqual(current.scale, layer.scale, "scale", false)) {
        failures.push("review_reference_mismatch");
      }
    }
  }
  return {ok:!failures.length,failures};
}
function validateReviewRecord(record) {
  if(record && record.receipt){let key=null;try{key=require("./project-intent-memory").projectStateKey(record.receipt.projectFile);}catch(_error){}if(key!==record.projectKey)fail("review_artifact_project_mismatch");}
  if(!record || record.schema!=="ae-placeholder-review-artifact.v1" || !OWNER.test(record.owner) || !/^[a-f0-9]{64}$/.test(record.projectKey) || !record.spec || record.spec.owner!==record.owner || record.spec.projectKey!==record.projectKey ||
    record.spec.comment!==`AE_AGENT_REVIEW:v1:${record.projectKey}:${record.owner}` || record.spec.specHash!==hash({targets:record.spec.targets,controls:record.spec.controls,sheet:record.spec.sheet}) ||
    !record.receipt || !verifyServiceReceipt(record.spec,record.receipt.items,record.projectKey).ok || record.receiptHash!==hash(record.receipt) || !Array.isArray(record.images) || record.images.length>25 || new Set(record.images.map(image=>image.itemId)).size!==record.images.length ||
    record.images.some(image=>!ID(image.itemId) || !record.receipt.items.some(item=>item.itemId===image.itemId) || typeof image.filePath!=="string" || image.filePath.length>4000 || !/^[a-f0-9]{64}$/.test(image.sha256) || !/^[a-f0-9]{64}$/.test(image.contentHash) || !Number.isSafeInteger(image.byteLength) || image.byteLength<1))fail("invalid_review_artifact_record");
  return record;
}
function cleanupServiceScript(record, projectFile) {
  const rows=record.receipt.items;
  return `${aeServiceReadSupport}
 var expected=${JSON.stringify(rows)};var ids=[];var selected=[];
 if(!app.project.file || __phPath(app.project.file.fsName)!==__phPath(${JSON.stringify(projectFile)}))throw new Error("review_cleanup_project_changed");
 for(var n=0;n<expected.length;n++){var item=null;for(var i=1;i<=app.project.numItems;i++)if(app.project.item(i).id===expected[n].itemId)item=app.project.item(i);
  if(!item || !(item instanceof CompItem) || item.name!==expected[n].name || item.comment!==expected[n].comment)throw new Error("review_cleanup_identity_mismatch");ids.push(item.id);selected.push(item);}
 // Whole-set preflight, including actual usedIn parents, before undo/removal.
 for(var n=0;n<selected.length;n++){var parents=selected[n].usedIn;if(!(parents instanceof Array))throw new Error("review_cleanup_used_in_unknown");for(var p=0;p<parents.length;p++){var found=false;for(var k=0;k<ids.length;k++)if(parents[p].id===ids[k])found=true;if(!found)throw new Error("review_cleanup_foreign_dependency");}}
 var removed=[];app.beginUndoGroup("Codex Cleanup Placeholder Review");
 try {while(selected.length){var progress=false;for(var n=selected.length-1;n>=0;n--){if(selected[n].usedIn.length===0){var id=selected[n].id;selected[n].remove();removed.push(id);selected.splice(n,1);progress=true;}}if(!progress)throw new Error("review_cleanup_cycle");}
  var remaining=[];for(var i=1;i<=app.project.numItems;i++)for(var n=0;n<ids.length;n++)if(app.project.item(i).id===ids[n])remaining.push(ids[n]);return {ok:remaining.length===0,removedItemIds:removed,remainingItemIds:remaining};
 }catch(e){return {ok:false,error:String(e),removedItemIds:removed};}finally{app.endUndoGroup();}`;
}
module.exports={PREFIX,OWNER,hash,resolveReviewTargets,createServiceSpecification,createServiceScript,readServiceScript,
  verifyServiceReceipt,validateReviewRecord,cleanupServiceScript};
