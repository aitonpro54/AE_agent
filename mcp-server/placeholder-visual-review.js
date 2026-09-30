"use strict";
// Read-only evidence validation. This module never dispatches a provider or an AE command.
const fs=require("fs"),path=require("path");
const {hash,OWNER,validateReviewRecord}=require("./placeholder-review-service");
const PNG=Buffer.from([137,80,78,71,13,10,26,10]);
function fail(code){const error=new Error(code);error.code=code;throw error;}
function normalized(file){return path.resolve(file).replace(/\\/g,"/").toLowerCase();}
function readImage(image,root){
 const realRoot=fs.realpathSync(root),file=fs.realpathSync(image.filePath),relative=path.relative(realRoot,file);
 if(relative.startsWith("..") || path.isAbsolute(relative) || path.extname(file).toLowerCase()!==".png")fail("review_image_outside_generated_root");
 const stat=fs.statSync(file);if(!stat.isFile() || stat.size<24 || stat.size>32*1024*1024)fail("review_image_size_invalid");
 const bytes=fs.readFileSync(file);if(!bytes.subarray(0,8).equals(PNG) || bytes.toString("ascii",12,16)!=="IHDR")fail("review_image_not_png");
 if(hash(bytes)!==image.sha256 || bytes.length!==image.byteLength)fail("review_image_hash_changed");
 return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
}
function buildManifest(record,exportRoot){
 validateReviewRecord(record);const images=[];
 for(const image of record.images){const receipt=record.receipt.items.find(item=>item.itemId===image.itemId),dimensions=readImage(image,exportRoot);
  if(dimensions.width!==receipt.width || dimensions.height!==receipt.height)fail("review_image_dimensions_mismatch");
  images.push({itemId:image.itemId,filePath:image.filePath,sha256:image.sha256,byteLength:image.byteLength,...dimensions});}
 const frames=record.spec.controls.map((control,index)=>{const target=record.spec.targets[control.targetIndex],sample=target.samples[control.sampleIndex],receipt=record.receipt.items.find(item=>item.name===control.name);
  return {frameId:"review-"+index,itemId:receipt.itemId,target:target.target,rootCompItemId:target.rootCompItemId,sourceItemId:target.sourceItemId,sourceKey:target.sourceKey,
   routeLayerIds:target.routeLayerIds,sampleIndex:control.sampleIndex,roles:sample.roles,rootTime:sample.rootTime,targetTime:sample.targetTime,sourceTime:sample.sourceTime,
   viewKind:control.viewKind,image:images.find(image=>image.itemId===receipt.itemId)||null};});
 const sheet=record.receipt.items.find(item=>item.name===record.spec.sheet.name);
 return {schema:"ae-placeholder-review-manifest.v1",owner:record.owner,projectKey:record.projectKey,receiptHash:record.receiptHash,
  geometryScope:"rectangular_footprint_only; alpha/effects/artistic require image review",frames,sheet:{itemId:sheet.itemId,image:images.find(image=>image.itemId===sheet.itemId)||null},
  limits:"Only supplied sampled frames; continuity between frames and unsampled shots is unknown."};
}
function inspectionMaterial(manifest,workspaceRoot=path.resolve(__dirname,"..")){
 const required=manifest.frames.filter(frame=>frame.viewKind!=="source");
 if(!required.length || required.some(frame=>!frame.image) || !manifest.sheet.image)fail("target_images_required");
 // Native control images are required: sheet readability never silently replaces a full control frame.
 const images=[manifest.sheet.image,...required.map(frame=>frame.image)];
 if(images.length>11)fail("inspection_file_budget_requires_smaller_review_scope");
 const manifestSha256=hash(manifest),pin="AE_PLACEHOLDER_REVIEW_PIN:"+manifestSha256;
 const inputs=images.map(image=>{const relative=path.relative(workspaceRoot,image.filePath);if(relative.startsWith("..") || path.isAbsolute(relative))fail("inspection_images_outside_workspace");return {path:relative.replace(/\\/g,"/"),access:"view_file",scope:"workspace"};});
 return {manifestSha256,pin,inlineManifest:manifest,requiredInputs:inputs,
  instructions:pin+"\n"+JSON.stringify(manifest)+"\nФактически вызови view_file для каждого PNG. Ничего не записывай. В outputs верни по одному JSON-encoded объекту {frameId,decision:'safe'|'reject',observation} для каждого target_comp/root_comp кадра. В observation конкретно опиши границы, головы/людей и отступы. Только эти кадры; между ними неизвестно. Наличие PNG или JSON не доказательство просмотра."};
}
function parseViewEvidence(state,events){
 if(!state || state.transport_status!=="completed" || state.task_status!=="success" || state.terminal_result_seen!==true || state.terminal_result_valid!==true || state.schema_valid!==true ||
  !state.request || state.request.kind!=="inspect" || state.request.profile!=="ae-agent" || typeof state.conversation_id!=="string")return {ok:false,reason:"inspection_run_not_verified",viewed:[]};
 const active=new Map(),viewed=new Set();let model=null;
 for(const event of events){if(event.event==="init" && event.conversation_id===state.conversation_id)model=event.init && event.init.model;
  const step=event.step_update;if(event.event!=="step_update" || !step || step.step_type!=="tool")continue;
  if(step.tool_name!=="view_file" || !step.tool_info || step.tool_info.name!=="view_file")return {ok:false,reason:"inspection_used_unexpected_tool",viewed:[]};
  if(step.conversation_id!==state.conversation_id || !Number.isSafeInteger(step.step_index))return {ok:false,reason:"inspection_event_identity_mismatch",viewed:[]};
  const file=step.tool_info.parameters && step.tool_info.parameters.AbsolutePath;if(typeof file!=="string")return {ok:false,reason:"inspection_view_path_missing",viewed:[]};
  const key=step.step_index;if(step.state==="ACTIVE"){if(active.has(key))return {ok:false,reason:"inspection_duplicate_active",viewed:[]};active.set(key,normalized(file));}
  else if(step.state==="DONE") {if(active.get(key)!==normalized(file) || step.error || step.tool_info.error || step.tool_info.isError===true || step.success===false)return {ok:false,reason:"inspection_view_failed_or_unpaired",viewed:[]};
   // Actual dispatcher image DONE events omit output. An explicit error output must never pass.
   const output=step.tool_info.output;
   if(path.extname(file).toLowerCase()===".png" && output!==undefined && output!=="" || typeof output==="string" && /^(error|failed|denied|not found|permission)/i.test(output.trim()))return {ok:false,reason:"inspection_view_failed_or_unknown_output",viewed:[]};
   active.delete(key);viewed.add(normalized(file));}
  else return {ok:false,reason:"inspection_tool_not_completed",viewed:[]};
 }
 if(model!=="gemini-3.8-flash-high" || active.size)return {ok:false,reason:"inspection_model_or_completion_unverified",viewed:[]};
 return {ok:true,viewed:[...viewed]};
}
function verifyVisualReview(manifest,state,events,response){
 const pending=(reason)=>({ok:false,status:"insufficient_material",reason,limits:manifest.limits,artisticAccepted:false});
 const proof=parseViewEvidence(state,events);if(!proof.ok)return pending(proof.reason);
 let material;try{material=inspectionMaterial(manifest,state.workspace);}catch(error){return pending(error.code);}
 if(!state.request.instructions || !state.request.instructions.includes(material.pin) || !state.request.instructions.includes(JSON.stringify(manifest)))return pending("inspection_manifest_not_pinned");
 const inputs=state.request.required_inputs;const resolved=value=>normalized(path.resolve(state.workspace,value));
 if(typeof state.workspace!=="string" || !path.isAbsolute(state.workspace))return pending("inspection_workspace_missing");
 if(!Array.isArray(inputs) || material.requiredInputs.some(input=>!inputs.some(value=>value.access==="view_file" && value.scope==="workspace" && resolved(value.path)===resolved(input.path))))return pending("inspection_required_inputs_mismatch");
 if(material.requiredInputs.some(input=>!proof.viewed.includes(resolved(input.path))))return pending("actual_image_view_missing");
 if(!response || response.status!=="success" || !Array.isArray(response.outputs))return pending("inspection_response_invalid");
 const observations=[];for(const text of response.outputs){try{observations.push(JSON.parse(text));}catch(_error){return pending("concrete_structured_observations_required");}}
 const frames=manifest.frames.filter(frame=>frame.viewKind!=="source");
 if(observations.length!==frames.length || new Set(observations.map(value=>value.frameId)).size!==frames.length)return pending("observation_sample_count_mismatch");
 for(const frame of frames){const observed=observations.find(value=>value.frameId===frame.frameId);
  if(!observed || !["safe","reject"].includes(observed.decision) || typeof observed.observation!=="string" || observed.observation.trim().length<30 || observed.observation.length>2000 ||
   !/(голов|человек|люд|фигур|лиц|head|person|people|face|subject)/i.test(observed.observation) || !/(границ|кра[йя]|отступ|верх|низ|слева|справа|обрез|edge|margin|top|bottom|left|right|crop)/i.test(observed.observation))return pending("concrete_sample_observation_required");}
 const accepted=observations.every(value=>value.decision==="safe");
 return {ok:true,status:accepted ? "accepted_sampled_frames" : "rejected_sampled_frames",artisticAccepted:accepted,observations,manifestSha256:material.manifestSha256,
  provenance:{conversationId:state.conversation_id,taskId:state.task_id,actualViewedImages:material.requiredInputs.length},limits:manifest.limits};
}
function readInspectionRun(taskId,stateDirectory){
 if(typeof taskId!=="string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/.test(taskId))fail("invalid_inspection_run_id");
 function read(extension,budget){const file=path.join(stateDirectory,taskId+extension);const stat=fs.statSync(file);if(!stat.isFile() || stat.size>budget)fail("inspection_log_budget");return fs.readFileSync(file,"utf8");}
 const state=JSON.parse(read(".json",512*1024));if(state.task_id!==taskId)fail("inspection_task_identity_mismatch");
 const lines=read(".ndjson",4*1024*1024).trim().split(/\r?\n/);if(lines.length>10000)fail("inspection_event_budget");
 return {state,events:lines.map(line=>JSON.parse(line)),response:JSON.parse(read(".response.json",256*1024))};
}
module.exports={readImage,buildManifest,inspectionMaterial,parseViewEvidence,verifyVisualReview,readInspectionRun};
