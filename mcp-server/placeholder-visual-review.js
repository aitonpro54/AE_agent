"use strict";
// Evidence validation and bounded server-created inspection packets. Never dispatches a provider or AE command.
const fs=require("fs"),path=require("path");
const {hash,OWNER,validateReviewRecord}=require("./placeholder-review-service");
const PNG=Buffer.from([137,80,78,71,13,10,26,10]);
const MAX_INSPECTION_INSTRUCTIONS=6000,MAX_MANIFEST_BYTES=1024*1024;
const MANIFEST_DIRECTORY=path.join(".codex-runtime","placeholder-review-manifests");
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
function applicationReference(binding){
 return {applicationRunId:binding.applicationRunId,actionId:binding.actionId,proposalRevision:binding.proposalRevision,
  planSha256:binding.planSha256,unitId:binding.unitId,unitContentHash:binding.unitContentHash,bindingSha256:hash(binding)};
}
function captureReference(record,image){
 if(!image?.canonicalCapture)return null;
 // Presentation refs are derived only after the full original receipt validator.
 const capture=require("./montage-capture-service");capture.validateCaptureReceipt(record,image);const c=image.canonicalCapture;
 return {schema:"ae-agent-montage-native-capture-reference.v1",captureId:c.captureId,owner:c.owner,itemId:c.itemId,receiptSha256:hash(c),
  application:applicationReference(c.application),export:c.export,originalPolicy:c.policy.original,frameSha256:hash(c.frame),
  graph:Object.fromEntries(Object.entries(c.graph).map(([stage,g])=>[stage,{readerId:g.readerId,sha256:hash(g)}])),
  files:{sha256:hash(c.files),sources:c.files.after.map(f=>({sourceItemId:f.sourceItemId,sha256:f.sha256,byteLength:f.byteLength}))},
  png:c.png,resolutionFactor:c.resolutionFactor,completeRootRenderState:c.completeRootRenderState,artisticAccepted:false};
}
function bindingReference(record){
 const b=record.canonicalBinding,apps=b.schema==="ae-agent-montage-owner-bindings.v1" ? b.applications : [b];
 return {schema:"ae-agent-montage-owner-binding-reference.v1",sha256:hash(b),applications:apps.map(applicationReference),
  originalPolicy:b.originalPolicy,frameIds:b.frames.map(f=>f.frameId),...(record.captureSession ? {captureSession:record.captureSession} : {})};
}
function buildManifest(record,exportRoot){
 validateReviewRecord(record);const images=[];
 for(const image of record.images){const receipt=record.receipt.items.find(item=>item.itemId===image.itemId),dimensions=readImage(image,exportRoot);
  if(dimensions.width!==receipt.width || dimensions.height!==receipt.height)fail("review_image_dimensions_mismatch");
  images.push({itemId:image.itemId,filePath:image.filePath,sha256:image.sha256,byteLength:image.byteLength,...dimensions});}
 const frames=record.spec.controls.map((control,index)=>{const target=record.spec.targets[control.targetIndex],sample=target.samples[control.sampleIndex],receipt=record.receipt.items.find(item=>item.name===control.name);
  return {frameId:sample.canonicalFrame?.frameId || "review-"+index,...(sample.canonicalFrame ? {canonicalFrame:sample.canonicalFrame} : {}),itemId:receipt.itemId,target:target.target,rootCompItemId:target.rootCompItemId,sourceItemId:target.sourceItemId,sourceKey:target.sourceKey,
   routeLayerIds:target.routeLayerIds,sampleIndex:control.sampleIndex,roles:sample.roles,rootTime:sample.rootTime,targetTime:sample.targetTime,sourceTime:sample.sourceTime,
   viewKind:control.viewKind,image:images.find(image=>image.itemId===receipt.itemId)||null,
   ...(record.canonicalBinding ? {capture:captureReference(record,record.images.find(image=>image.itemId===receipt.itemId))} : {})};});
 const sheet=record.receipt.items.find(item=>item.name===record.spec.sheet.name);
 return {schema:"ae-placeholder-review-manifest.v1",owner:record.owner,projectKey:record.projectKey,receiptHash:record.receiptHash,
  geometryScope:"rectangular_footprint_only; alpha/effects/artistic require image review",frames,sheet:{itemId:sheet.itemId,image:images.find(image=>image.itemId===sheet.itemId)||null},
  ...(record.canonicalBinding ? {canonicalBinding:bindingReference(record),completeRootRenderState:frames.every(f=>f.capture?.completeRootRenderState===true)} : {}),
  limits:"Only supplied sampled frames; continuity between frames and unsampled shots is unknown."};
}
function relativeInput(workspaceRoot,file){
 const relative=path.relative(workspaceRoot,file);if(relative.startsWith("..") || path.isAbsolute(relative))fail("inspection_images_outside_workspace");
 return {path:relative.replace(/\\/g,"/"),access:"view_file",scope:"workspace"};
}
function manifestDirectoryAncestors(workspace,directory){
 const relative=path.relative(workspace,directory);
 if(relative.startsWith("..") || path.isAbsolute(relative) || !fs.lstatSync(workspace).isDirectory() || normalized(fs.realpathSync(workspace))!==normalized(workspace))fail("inspection_manifest_outside_workspace");
 const nodes=[];let current=workspace;
 for(const part of relative.split(path.sep)){current=path.join(current,part);nodes.push(current);}
 for(const node of nodes){let stat;try{stat=fs.lstatSync(node);}catch(error){if(error.code==="ENOENT")break;throw error;}
  if(!stat.isDirectory() || stat.isSymbolicLink() || normalized(fs.realpathSync(node))!==normalized(node))fail("inspection_manifest_outside_workspace");}
 return nodes;
}
function pinnedManifestFile(manifest,workspaceRoot,allowWrite){
 const text=JSON.stringify(manifest),bytes=Buffer.from(text,"utf8"),sha256=hash(bytes);
 if(bytes.length<1 || bytes.length>MAX_MANIFEST_BYTES)fail("inspection_manifest_byte_budget");
 if(typeof workspaceRoot!=="string" || !path.isAbsolute(workspaceRoot))fail("inspection_workspace_missing");
 const workspace=fs.realpathSync(workspaceRoot),directory=path.join(workspace,MANIFEST_DIRECTORY);
 if(normalized(workspace)!==normalized(workspaceRoot))fail("inspection_manifest_outside_workspace");
 // Inspect every existing ancestor before any mkdir; a junction at an earlier
 // node must not create a child in its external target before it is rejected.
 const nodes=manifestDirectoryAncestors(workspace,directory);
 if(allowWrite)for(const node of nodes){manifestDirectoryAncestors(workspace,node);
  if(!fs.existsSync(node)){try{fs.mkdirSync(node);}catch(error){if(error.code!=="EEXIST")throw error;}}
  manifestDirectoryAncestors(workspace,node);}
 manifestDirectoryAncestors(workspace,directory);
 const realDirectory=fs.realpathSync(directory),relativeDirectory=path.relative(workspace,realDirectory);
 if(relativeDirectory.startsWith("..") || path.isAbsolute(relativeDirectory) || normalized(realDirectory)!==normalized(directory))fail("inspection_manifest_outside_workspace");
 const filePath=path.join(directory,sha256+".json");
 if(allowWrite && !fs.existsSync(filePath)){try{fs.writeFileSync(filePath,bytes,{flag:"wx"});}catch(error){if(error.code!=="EEXIST")throw error;}}
 manifestDirectoryAncestors(workspace,directory);
 const realPath=fs.realpathSync(filePath);if(normalized(realPath)!==normalized(filePath))fail("inspection_manifest_path_changed");
 let fd;try{
  fd=fs.openSync(realPath,"r");const before=fs.fstatSync(fd),identity=s=>JSON.stringify([s.dev,s.ino,s.size,s.mtimeMs,s.ctimeMs]);
  if(!before.isFile() || before.size!==bytes.length || before.size>MAX_MANIFEST_BYTES)fail("inspection_manifest_file_changed");
  const buffer=Buffer.alloc(bytes.length+1);let length=0,count;
  while(length<buffer.length && (count=fs.readSync(fd,buffer,length,buffer.length-length,null))>0)length+=count;
  const actual=buffer.subarray(0,length);
  if(actual.length!==bytes.length || hash(actual)!==sha256 || !actual.equals(bytes) || identity(before)!==identity(fs.fstatSync(fd)) ||
   identity(before)!==identity(fs.statSync(realPath)) || fs.realpathSync(filePath)!==realPath)fail("inspection_manifest_file_changed");
 }finally{if(fd!==undefined)fs.closeSync(fd);}
 return {schema:"ae-placeholder-review-manifest-file.v1",...relativeInput(workspace,filePath),filePath,realPath,sha256,byteLength:bytes.length};
}
const INSPECTION_GUIDANCE="Фактически вызови view_file для каждого required_input: сначала JSON manifest, если задан, затем sheet и каждый полный native PNG. Ничего не записывай. В outputs верни по одному JSON-encoded объекту {frameId,decision:'safe'|'reject',observation} для каждого target_comp/root_comp кадра. В observation конкретно опиши границы, головы/людей и отступы. Только эти кадры; между ними неизвестно. Наличие PNG или JSON не доказательство просмотра.";
function inspectionMaterial(manifest,workspaceRoot=path.resolve(__dirname,".."),{allowManifestWrite=true}={}){
 const required=manifest.frames.filter(frame=>frame.viewKind!=="source");
 if(!required.length || required.some(frame=>!frame.image) || !manifest.sheet.image)fail("target_images_required");
 // Native control images are required: sheet readability never silently replaces a full control frame.
 const images=[manifest.sheet.image,...required.map(frame=>frame.image)];
 if(images.length>11)fail("inspection_file_budget_requires_smaller_review_scope");
 const manifestSha256=hash(manifest),pin="AE_PLACEHOLDER_REVIEW_PIN:"+manifestSha256;
 const inputs=images.map(image=>relativeInput(workspaceRoot,image.filePath)),inline=pin+"\n"+JSON.stringify(manifest)+"\n"+INSPECTION_GUIDANCE;
 if(!manifest.canonicalBinding && inline.length<=MAX_INSPECTION_INSTRUCTIONS)return {manifestSha256,pin,inlineManifest:manifest,requiredInputs:inputs,instructions:inline};
 const reference=pinnedManifestFile(manifest,workspaceRoot,allowManifestWrite),manifestFilePin="AE_PLACEHOLDER_REVIEW_MANIFEST:"+JSON.stringify({path:reference.path,sha256:reference.sha256,byteLength:reference.byteLength});
 const instructions=pin+"\n"+manifestFilePin+"\n"+INSPECTION_GUIDANCE;if(instructions.length>MAX_INSPECTION_INSTRUCTIONS)fail("inspection_instructions_budget");
 return {manifestSha256,pin,manifestFilePin,manifestReference:reference,requiredInputs:[{path:reference.path,access:"view_file",scope:"workspace"},...inputs],instructions};
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
function validateReviewOutputs(manifest,rawOutputs){
 if(!Array.isArray(rawOutputs))return {ok:false,reason:"inspection_response_invalid"};
 const observations=[];
 for(const item of rawOutputs){
  if(typeof item==="string"){try{const parsed=JSON.parse(item);if(!parsed || typeof parsed!=="object" || Array.isArray(parsed))return {ok:false,reason:"concrete_structured_observations_required"};observations.push(parsed);}catch(_error){return {ok:false,reason:"concrete_structured_observations_required"};}}
  else return {ok:false,reason:"concrete_structured_observations_required"};
 }
 const frames=manifest.frames.filter(frame=>frame.viewKind!=="source");
 if(observations.length!==frames.length || new Set(observations.map(value=>value.frameId)).size!==frames.length)return {ok:false,reason:"observation_sample_count_mismatch"};
 for(const frame of frames){const observed=observations.find(value=>value.frameId===frame.frameId);
  if(!observed || !["safe","reject"].includes(observed.decision) || typeof observed.observation!=="string" || observed.observation.trim().length<30 || observed.observation.length>2000 ||
   !/(голов|человек|люд|фигур|лиц|head|person|people|face|subject)/i.test(observed.observation) || !/(границ|кра[йя]|отступ|верх|низ|слева|справа|обрез|поля по (?:четыр[её]м|всем) сторонам|edge|margin|top|bottom|left|right|crop)/i.test(observed.observation))return {ok:false,reason:"concrete_sample_observation_required"};}
 const accepted=observations.every(value=>value.decision==="safe");
 return {ok:true,accepted,observations};
}
function verifyVisualReview(manifest,state,events,response){
 const pending=(reason)=>({ok:false,status:"insufficient_material",reason,limits:manifest.limits,artisticAccepted:false});
 const proof=parseViewEvidence(state,events);if(!proof.ok)return pending(proof.reason);
 if(typeof state.workspace!=="string" || !path.isAbsolute(state.workspace))return pending("inspection_workspace_missing");
 let material;try{material=inspectionMaterial(manifest,state.workspace,{allowManifestWrite:false});}catch(error){return pending(error.code || "inspection_manifest_file_unavailable");}
 if(typeof state.request.instructions!=="string" || state.request.instructions.length>MAX_INSPECTION_INSTRUCTIONS || !state.request.instructions.includes(material.pin) ||
  !state.request.instructions.includes(material.manifestFilePin || JSON.stringify(manifest)))return pending("inspection_manifest_not_pinned");
 if(material.manifestReference && (typeof state.task_id!=="string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/.test(state.task_id)))return pending("inspection_task_identity_mismatch");
 const inputs=state.request.required_inputs;const resolved=value=>normalized(path.resolve(state.workspace,value));
 if(!Array.isArray(inputs) || inputs.length>12 || material.requiredInputs.some(input=>!inputs.some(value=>typeof value?.path==="string" && value.access==="view_file" && value.scope==="workspace" && resolved(value.path)===resolved(input.path))))return pending("inspection_required_inputs_mismatch");
 if(material.manifestReference && inputs.length!==material.requiredInputs.length)return pending("inspection_required_inputs_mismatch");
 if(material.manifestReference && !proof.viewed.includes(resolved(material.manifestReference.path)))return pending("actual_manifest_view_missing");
 if(material.requiredInputs.some(input=>!proof.viewed.includes(resolved(input.path))))return pending("actual_image_view_missing");
 if(!response || response.status!=="success" || !Array.isArray(response.outputs))return pending("inspection_response_invalid");
 const validated=validateReviewOutputs(manifest,response.outputs);
 if(!validated.ok)return pending(validated.reason);
 const observations=validated.observations;
 const accepted=validated.accepted;
 return {ok:true,status:accepted ? "accepted_sampled_frames" : "rejected_sampled_frames",artisticAccepted:accepted,observations,manifestSha256:material.manifestSha256,
  provenance:{conversationId:state.conversation_id,taskId:state.task_id,actualViewedImages:material.requiredInputs.length-(material.manifestReference ? 1 : 0),
   ...(material.manifestReference ? {manifestFile:material.manifestReference,actualManifestView:true} : {})},limits:manifest.limits};
}
function readInspectionRun(taskId,stateDirectory){
 if(typeof taskId!=="string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/.test(taskId))fail("invalid_inspection_run_id");
 function read(extension,budget){const file=path.join(stateDirectory,taskId+extension);const stat=fs.statSync(file);if(!stat.isFile() || stat.size>budget)fail("inspection_log_budget");return fs.readFileSync(file,"utf8");}
 const state=JSON.parse(read(".json",512*1024));if(state.task_id!==taskId)fail("inspection_task_identity_mismatch");
 const lines=read(".ndjson",4*1024*1024).trim().split(/\r?\n/);if(lines.length>10000)fail("inspection_event_budget");
 return {state,events:lines.map(line=>JSON.parse(line)),response:JSON.parse(read(".response.json",256*1024))};
}
module.exports={readImage,buildManifest,inspectionMaterial,parseViewEvidence,validateReviewOutputs,verifyVisualReview,readInspectionRun,MAX_INSPECTION_INSTRUCTIONS,MAX_MANIFEST_BYTES};
