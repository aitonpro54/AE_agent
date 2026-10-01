#!/usr/bin/env node
"use strict";
const assert=require("assert/strict"),fs=require("fs"),os=require("os"),path=require("path");
const bridge=require("../mcp-server/bridge-daemon"),service=require("../mcp-server/placeholder-review-service"),geometry=require("../mcp-server/placeholder-geometry"),visual=require("../mcp-server/placeholder-visual-review");
const {createVisualProject,request,png}=require("./placeholder-visual-fixture");
async function inventory(project){const prepared=await bridge.preparePlaceholderInventoryScript({targets:[{target:{compItemId:10,layerId:11},protectedProperties:[]}]});return project.execute(prepared.script).result;}
async function main(){
 const project=createVisualProject(),before=project.read('child.numLayers+root.numLayers');
 const found=await inventory(project);assert(found.complete);const targets=service.resolveReviewTargets(request,found);
 const projectKey=require("../mcp-server/project-intent-memory").projectStateKey("C:/Synthetic/Protected.aep"),spec=service.createServiceSpecification(targets,projectKey,"11111111-1111-4111-8111-111111111111");
 const created=project.body(service.createServiceScript(spec,"C:/Synthetic/Protected.aep"));assert(created.ok);assert.deepEqual(project.read('undo'),["begin","end"]);assert.equal(project.read('child.numLayers+root.numLayers'),before);
 const receipt=project.body(service.readServiceScript(created.createdItemIds));assert(service.verifyServiceReceipt(spec,receipt.items,projectKey).ok);
 const control=receipt.items.find(item=>item.name===spec.controls[2].name).layers[0];assert.equal(control.startTime,-3.96);assert.equal(control.inPoint,0);assert.equal(control.outPoint,1/25);assert(0>=control.inPoint && 0<control.outPoint);
 const sheet=spec.sheet;for(const cell of sheet.layers.filter(layer=>layer.role==="cell")){const native=spec.controls[cell.controlIndex],scale=cell.scale[0]/100;assert.equal(cell.scale[0],cell.scale[1]);assert(native.width*scale<=640 && native.height*scale<=360);}
 assert(!service.verifyServiceReceipt(spec,receipt.items,"b".repeat(64)).ok);
 for(const change of ['a.file.fsName="C:/Synthetic/relinked.mp4";','a.footageMissing=true;','a.duration=1;','a.frameRate=60;','child.duration=1;','child.frameRate=60;','root.frameRate=60;']){
  const stale=createVisualProject();stale.change(change);assert.throws(()=>stale.body(service.createServiceScript(spec,receipt.projectFile)),/review_.*(metadata|geometry|source).*changed/);assert.deepEqual(stale.read('undo'),[]);assert.equal(stale.read('items.length'),4);
 }
 const altered=JSON.parse(JSON.stringify(receipt.items));altered[0].comment="foreign";assert(!service.verifyServiceReceipt(spec,altered,projectKey).ok);
 for(const change of [row=>{row[0].layers[0].rotation=90;},row=>{row[0].layers[0].opacity=10;},row=>{row[row.length-1].layers[0].inPoint=100;}]){const changed=JSON.parse(JSON.stringify(receipt.items));change(changed);assert(!service.verifyServiceReceipt(spec,changed,projectKey).ok);}
 project.change('items[items.length-1].failRemove=true;');const failedCleanup=project.body(service.cleanupServiceScript({receipt},receipt.projectFile));assert.equal(failedCleanup.ok,false);assert.equal(project.read('undo[undo.length-1]'),"end");assert.equal(project.read('items.length'),8);
 project.change('items[items.length-1].failRemove=false;root.__insert(new AVLayer(999,"Foreign use",items[items.length-1]));undo=[];');assert.throws(()=>project.body(service.cleanupServiceScript({receipt},receipt.projectFile)),/foreign_dependency/);assert.deepEqual(project.read('undo'),[]);
 project.change('root._layers.shift();');const cleaned=project.body(service.cleanupServiceScript({receipt},receipt.projectFile));assert(cleaned.ok);assert.deepEqual(project.body(service.readServiceScript(created.createdItemIds)).items,[]);assert.equal(project.read('items.length'),4);
 const errorProject=createVisualProject();errorProject.change('failComment=true;');const errorInventory=await inventory(errorProject),errorSpec=service.createServiceSpecification(service.resolveReviewTargets(request,errorInventory),projectKey);const errored=errorProject.body(service.createServiceScript(errorSpec,receipt.projectFile));assert(!errored.ok);assert.equal(errored.createdItemIds.length,1);assert.deepEqual(errorProject.read('undo'),["begin","end"]);
 project.change('target.property("ADBE Transform Group").property("ADBE Anchor Point").value=[0,0];');const fit=await bridge.prepareToolScript("fit_layer_to_comp",{compItemIndex:2,layerIndices:[99],expectedCompItemId:10,expectedLayerId:11,mode:"cover"});const fitResult=project.execute(fit.script);assert(fitResult.ok,JSON.stringify(fitResult));const read=project.body(geometry.geometryReadScript({compItemId:10,layerId:11}));assert.deepEqual(read.transform.anchorPoint,[0,0]);const coverage=require("../mcp-server/placeholder-framing").verifyPlaceholderCoverage(read);assert(coverage.covered && coverage.eligible);
 project.change('target.threeDLayer=true;undo=[];');const unsupported=project.execute(fit.script);assert(!unsupported.ok);assert.deepEqual(project.read('undo'),[]);
 const framingProject=createVisualProject();framingProject.change('b.width=1280;b.height=720;');
 const plannedGeometry=framingProject.body(geometry.geometryReadScript({compItemId:10,layerId:11},101));
 const framingInput={rootComp:{itemId:20,itemIndex:2,name:"Root",duration:10,frameRate:25},targetComp:{itemId:10,itemIndex:1,name:"Placeholder",duration:10,frameRate:25},
  route:[{parentCompItemId:20,childCompItemId:10,layerId:21,layerIndex:1,startTime:0,inPoint:0,outPoint:10,stretch:100,timeRemapEnabled:false}],
  targetLayer:{id:11,index:1,name:"Selected placeholder",sourceItemId:100,locked:false,stretch:100,timeRemapEnabled:false},sourceItem:{itemId:101,itemIndex:4,name:"Performer B",type:"footage",duration:10},rootRange:[0,4],sourceRange:[0,4],
  framing:{geometry:plannedGeometry.geometry,samples:[0,1.96,3.96].map(sourceTime=>({sourceTime,coordinateSpace:"source_pixels",imageRef:"synthetic-source-frame",imageSha256:"d".repeat(64),observation:"На этом синтетическом исходном кадре значимых людей нет.",noSignificantSubjects:true}))}};
 const built=require("../mcp-server/placeholder-plan-builder").buildPlaceholderPlan(framingInput);assert(built.ok,JSON.stringify(built));assert.equal(built.plan.steps[2].tool,"set_layer_transform");assert.equal(built.plan.placeholderFraming.sourceItemId,101);assert.equal(built.expectedReadBack.geometry.source.width,1280);
 for(const step of built.plan.steps.slice(0,-1)){const prepared=await bridge.prepareToolScript(step.tool,step.args);const applied=framingProject.execute(prepared.script);assert(applied.ok,JSON.stringify(applied));}
 const readBackStep=built.plan.steps[built.plan.steps.length-1],preparedRead=await bridge.prepareToolScript(readBackStep.tool,{...readBackStep.args,responseView:"full"}),observed=require("../mcp-server/placeholder-evidence").projectPlaceholderLayerEvidence(framingProject.execute(preparedRead.script).result);
 const readBack=require("../mcp-server/placeholder-readback").verifyPlaceholderReadBack(built.expectedReadBack,observed);assert(readBack.ok && readBack.coverage.covered,JSON.stringify(readBack));assert.equal(readBack.artisticAccepted,false);
 const wrongGeometry=JSON.parse(JSON.stringify(observed));wrongGeometry.geometry.source.width=1920;assert(!require("../mcp-server/placeholder-readback").verifyPlaceholderReadBack(built.expectedReadBack,wrongGeometry).ok);
 const staleGeometry=geometry.geometryGuardScript([built.plan.placeholderFraming]);framingProject.change('b.width=1000;');assert.throws(()=>framingProject.body(staleGeometry),/framing_geometry_changed/);
 const semantic=require("../mcp-server/semantic-verification").buildSemanticVerification;
 const fitPlan={steps:[{tool:"fit_layer_to_comp",args:{mode:"cover"}},{tool:"get_layer_details",args:{compItemId:10,layerId:11,layerIndex:1}}]};
 const fitRun=payload=>semantic(fitPlan,{ok:true,dryRun:false,steps:[{index:1,tool:"fit_layer_to_comp",mutatesProject:true,args:{mode:"cover"},status:"completed",result:payload},{index:2,tool:"get_layer_details",status:"completed",result:observed}]});
 const noProof=fitRun({mode:"cover",changed:[{scale:[100,100]}]});assert.equal(noProof.status,"needs_review");assert(noProof.checks.some(check=>check.id.includes(":fit_layer_to_comp:fit") && check.status==="failed"));
 const freshProof=require("../mcp-server/placeholder-framing").verifyPlaceholderCoverage({geometry:observed.geometry,transform:observed.transform});
 const supportedFit=fitRun({mode:"cover",verification:{ok:true,scope:"fresh_rectangular_footprint_only",checks:[freshProof]}});
 assert.equal(supportedFit.status,"passed",JSON.stringify(supportedFit));
 const missingMap=JSON.parse(JSON.stringify(found));missingMap.complete=false;assert.throws(()=>service.resolveReviewTargets(request,missingMap),/invalid_review_scope/);
 const sharedMap=JSON.parse(JSON.stringify(found));sharedMap.comps.find(comp=>comp.itemId===20).layers.push({...sharedMap.comps.find(comp=>comp.itemId===20).layers[0],id:222});assert.throws(()=>service.resolveReviewTargets(request,sharedMap),/shared_review_target/);
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),"ae-placeholder-visual-"));
 try{
  const record={schema:spec.schema,owner:spec.owner,projectKey,spec,receipt,receiptHash:service.hash(receipt),images:receipt.items.map(item=>{const filePath=path.join(temp,item.itemId+".png"),bytes=png(item.width,item.height);fs.writeFileSync(filePath,bytes);return {itemId:item.itemId,filePath,sha256:service.hash(bytes),contentHash:"c".repeat(64),byteLength:bytes.length};})};
  const manifest=visual.buildManifest(record,temp);assert(!JSON.stringify(manifest).includes("Synthetic/a.mp4"));const material=visual.inspectionMaterial(manifest,temp);assert(material.requiredInputs.every(input=>input.scope==="workspace" && !path.isAbsolute(input.path)));
  const wrongProject=JSON.parse(JSON.stringify(record));wrongProject.receipt.projectFile="C:/Synthetic/Other.aep";wrongProject.receiptHash=service.hash(wrongProject.receipt);assert.throws(()=>service.validateReviewRecord(wrongProject),/project_mismatch/);
  const state={transport_status:"completed",task_status:"success",terminal_result_seen:true,terminal_result_valid:true,schema_valid:true,conversation_id:"fixture",workspace:temp,request:{kind:"inspect",profile:"ae-agent",instructions:material.instructions,required_inputs:material.requiredInputs}};
  const events=[{event:"init",conversation_id:"fixture",init:{model:"gemini-3.8-flash-high"}}];for(const [index,input] of material.requiredInputs.entries())for(const flag of ["ACTIVE","DONE"])events.push({event:"step_update",step_update:{conversation_id:"fixture",step_index:index,state:flag,step_type:"tool",tool_name:"view_file",tool_info:{name:"view_file",parameters:{AbsolutePath:path.resolve(temp,input.path)}}}});
  const response={status:"success",outputs:manifest.frames.map(frame=>JSON.stringify({frameId:frame.frameId,decision:frame.frameId==="review-0" ? "reject" : "safe",observation:"Голова человека у верхней границы, отступ сверху мал и видна линия обрезания."}))};
  const checked=visual.verifyVisualReview(manifest,state,events,response);assert.equal(checked.status,"rejected_sampled_frames");assert(!checked.artisticAccepted);
  const unpinned={...state,request:{...state.request,instructions:"viewed:true"}};assert.equal(visual.verifyVisualReview(manifest,unpinned,events,response).reason,"inspection_manifest_not_pinned");
  assert.equal(visual.verifyVisualReview(manifest,state,events.slice(0,-1),response).status,"insufficient_material");
  const decode=JSON.parse(JSON.stringify(events));decode[2].step_update.tool_info.output="Cannot decode image";assert.equal(visual.verifyVisualReview(manifest,state,decode,response).status,"insufficient_material");
  const generic={status:"success",outputs:manifest.frames.map(frame=>JSON.stringify({frameId:frame.frameId,decision:"safe",observation:"Кадр хороший, композиция очень гармонична и выглядит вполне приемлемо."}))};assert.equal(visual.verifyVisualReview(manifest,state,events,generic).reason,"concrete_sample_observation_required");
  fs.appendFileSync(record.images[0].filePath,"changed");assert.throws(()=>visual.buildManifest(record,temp),/hash_changed/);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
 console.log("PASS: actual service/fit JSX VM, live-link sample visibility, contain/native geometry, receipts/ownership, errors/finally, foreign dependency, exact absence, pinned image event proof and honest sampled rejection; AE 0.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
