"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const visual=require("../mcp-server/placeholder-visual-review"),{hash}=require("../mcp-server/placeholder-review-service");
const batches=require("../mcp-server/placeholder-visual-batches");
const copy=v=>JSON.parse(JSON.stringify(v));let passed=0;
function test(name,fn){try{fn();passed++;}catch(e){console.error(name);throw e;}}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"ae-canonical-visual-file-")),workspace=path.join(temp,"workspace");fs.mkdirSync(workspace);
function image(index){return {itemId:index,filePath:path.join(workspace,"images",index+".png"),sha256:"a".repeat(64),byteLength:2400,width:1920,height:1080};}
const manifest={schema:"ae-placeholder-review-manifest.v1",owner:"synthetic-owned",projectKey:"b".repeat(64),receiptHash:"c".repeat(64),
 canonicalBinding:{schema:"ae-agent-montage-owner-binding-reference.v1",sha256:"d".repeat(64),frameIds:Array.from({length:18},(_,i)=>"canonical-"+i)},
 frames:Array.from({length:18},(_,i)=>({frameId:"canonical-"+i,viewKind:"root_comp",itemId:i+1,target:{compItemId:5,layerId:17},rootCompItemId:18,sourceItemId:2,
  rootTime:i/25,targetTime:i/25,sourceTime:i/25,roles:["scene_first","unit_required"],reasons:["Canonical coverage preserves full visual requirements."],image:image(i+1),
  capture:{schema:"ae-agent-montage-native-capture-reference.v1",captureId:"00000000-0000-4000-8000-000000000001",receiptSha256:"e".repeat(64),completeRootRenderState:true,
   export:{runId:"00000000-0000-4000-8000-000000000002",commandId:"00000000-0000-4000-8000-000000000003",actionId:"stored-action",proposalRevision:8,planSha256:"f".repeat(64),stepIndex:i+2}}})),
 sheet:{itemId:100,image:image(100)},limits:"Synthetic sampled proof only; AE/provider calls0."};
function runFor(batch,index=0){
 const conversationId="synthetic-conversation-"+index,events=[{event:"init",conversation_id:conversationId,init:{model:"gemini-3.8-flash-high"}}];
 batch.material.requiredInputs.forEach((input,step_index)=>{const info={name:"view_file",parameters:{AbsolutePath:path.resolve(workspace,input.path)}};
  for(const state of ["ACTIVE","DONE"])events.push({event:"step_update",step_update:{conversation_id:conversationId,step_index,state,step_type:"tool",tool_name:"view_file",tool_info:copy(info)}});});
 return {state:{task_id:"synthetic-file-job-"+index,conversation_id:conversationId,workspace,transport_status:"completed",task_status:"success",terminal_result_seen:true,terminal_result_valid:true,schema_valid:true,
  request:{kind:"inspect",profile:"ae-agent",instructions:batch.material.instructions,required_inputs:batch.material.requiredInputs}},events,
  response:{status:"success",outputs:batch.frameIds.map(frameId=>JSON.stringify({frameId,decision:"safe",observation:"Голова человека полностью видна с верхним отступом; боковые границы сохраняют плечи и фигуру."}))}};
}
try{
 const built=batches.buildInspectionBatches(manifest,{workspaceRoot:workspace}),runs=built.batches.map(runFor),first=built.batches[0],run=runs[0],ref=first.material.manifestReference;
 const check=(r=run,m=first.manifest)=>visual.verifyVisualReview(m,r.state,r.events,r.response);
 test("18 canonical frames retain exact manifest in bounded SHA-pinned JSON+sheet+10PNG packets",()=>{
  assert.deepEqual(built.batches.map(b=>b.frameIds.length),[10,8]);assert.equal(first.material.requiredInputs.length,12);
  for(const b of built.batches){assert(b.material.instructions.length<=6000);assert(!b.material.inlineManifest);const r=b.material.manifestReference,bytes=fs.readFileSync(r.filePath);
   assert.equal(bytes.length,r.byteLength);assert.equal(hash(bytes),hash(b.manifest));assert.deepEqual(JSON.parse(bytes),b.manifest);assert.equal(fs.realpathSync(r.filePath),r.realPath);}
  assert.equal(check().artisticAccepted,true);assert.equal(batches.verifyVisualReviewBatches(manifest,runs,{workspaceRoot:workspace}).observations.length,18);
 });
 test("same pin is immutable and creation is idempotent",()=>{const before=fs.statSync(ref.filePath);const again=visual.inspectionMaterial(first.manifest,workspace);assert.deepEqual(again,first.material);assert.equal(fs.statSync(ref.filePath).mtimeMs,before.mtimeMs);});
 test("JSON declaration without actual paired view is insufficient",()=>{const r=copy(run);r.events=r.events.filter(e=>e.step_update?.step_index!==0);assert.equal(check(r).reason,"actual_manifest_view_missing");});
 test("unpaired JSON DONE cannot prove viewing",()=>{const r=copy(run);r.events.splice(1,1);assert.equal(check(r).reason,"inspection_view_failed_or_unpaired");});
 test("foreign view path cannot cover pinned JSON",()=>{const r=copy(run);for(const e of r.events)if(e.step_update?.step_index===0)e.step_update.tool_info.parameters.AbsolutePath=path.join(workspace,"other.json");assert.equal(check(r).reason,"actual_manifest_view_missing");});
 test("JSON read error fails even with a paired DONE",()=>{const r=copy(run);r.events[2].step_update.tool_info.output="Error: inaccessible JSON";assert.equal(check(r).reason,"inspection_view_failed_or_unknown_output");});
 test("missing full native PNG cannot be replaced by sheet or JSON",()=>{const r=copy(run);r.events=r.events.filter(e=>e.step_update?.step_index!==2);assert.equal(check(r).reason,"actual_image_view_missing");});
 test("wrong SHA/path pin and oversized instructions block",()=>{const r=copy(run);r.state.request.instructions=r.state.request.instructions.replace(ref.sha256,"0".repeat(64));assert.equal(check(r).reason,"inspection_manifest_not_pinned");r.state.request.instructions=run.state.request.instructions+" ".repeat(6001);assert.equal(check(r).reason,"inspection_manifest_not_pinned");});
 test("required JSON input and exact task identity remain required",()=>{const r=copy(run);r.state.request.required_inputs.shift();assert.equal(check(r).reason,"inspection_required_inputs_mismatch");r.state.request=copy(run.state.request);delete r.state.task_id;assert.equal(check(r).reason,"inspection_task_identity_mismatch");});
 test("changed JSON bytes cannot be overwritten by material creation or accepted",()=>{const bytes=fs.readFileSync(ref.filePath),changed=Buffer.from(bytes);changed[changed.length-2]^=1;fs.writeFileSync(ref.filePath,changed);
  assert.equal(check().reason,"inspection_manifest_file_changed");assert.throws(()=>visual.inspectionMaterial(first.manifest,workspace),/inspection_manifest_file_changed/);assert.deepEqual(fs.readFileSync(ref.filePath),changed);fs.writeFileSync(ref.filePath,bytes);});
 test("missing JSON cannot be silently regenerated during verification",()=>{const bytes=fs.readFileSync(ref.filePath);fs.unlinkSync(ref.filePath);assert.equal(check().ok,false);assert.equal(fs.existsSync(ref.filePath),false);
  assert.equal(batches.verifyVisualReviewBatches(manifest,runs,{workspaceRoot:workspace}).ok,false);assert.equal(fs.existsSync(ref.filePath),false);fs.writeFileSync(ref.filePath,bytes);});
 test("manifest byte cap blocks before file creation",()=>{const huge={...first.manifest,limits:"X".repeat(visual.MAX_MANIFEST_BYTES)};assert.throws(()=>visual.inspectionMaterial(huge,workspace),/inspection_manifest_byte_budget/);});
 test("workspace junction escape fails closed",()=>{const w=path.join(temp,"junction-workspace"),outside=path.join(temp,"outside");fs.mkdirSync(path.join(w,".codex-runtime"),{recursive:true});fs.mkdirSync(outside);
  fs.symlinkSync(outside,path.join(w,".codex-runtime","placeholder-review-manifests"),"junction");const m=copy(first.manifest);for(const f of m.frames)f.image.filePath=path.join(w,"image.png");m.sheet.image.filePath=path.join(w,"sheet.png");
  assert.throws(()=>visual.inspectionMaterial(m,w),/inspection_manifest_outside_workspace/);assert.equal(fs.readdirSync(outside).length,0);});
 test("ancestor junction is rejected BEFORE creating any external child",()=>{const w=path.join(temp,"ancestor-workspace"),outside=path.join(temp,"ancestor-outside");fs.mkdirSync(w);fs.mkdirSync(outside);
  fs.symlinkSync(outside,path.join(w,".codex-runtime"),"junction");const m=copy(first.manifest);for(const f of m.frames)f.image.filePath=path.join(w,"image.png");m.sheet.image.filePath=path.join(w,"sheet.png");
  assert.throws(()=>visual.inspectionMaterial(m,w),/inspection_manifest_outside_workspace/);assert.equal(fs.existsSync(path.join(outside,"placeholder-review-manifests")),false);assert.deepEqual(fs.readdirSync(outside),[]);});
 test("workspace root alias is rejected before runtime directory creation",()=>{const outside=path.join(temp,"root-outside"),w=path.join(temp,"root-alias");fs.mkdirSync(outside);fs.symlinkSync(outside,w,"junction");
  const m=copy(first.manifest);for(const f of m.frames)f.image.filePath=path.join(w,"image.png");m.sheet.image.filePath=path.join(w,"sheet.png");assert.throws(()=>visual.inspectionMaterial(m,w),/inspection_manifest_outside_workspace/);assert.deepEqual(fs.readdirSync(outside),[]);});
 test("legacy small inline packet remains compatible and below official limit",()=>{const legacy={...manifest,frames:manifest.frames.slice(0,1)};delete legacy.canonicalBinding;delete legacy.frames[0].capture;
  const material=visual.inspectionMaterial(legacy,workspace);assert(material.inlineManifest);assert(material.instructions.length<=6000);assert.equal(material.requiredInputs.length,2);});
 console.log(`PASS: ${passed} pinned JSON/compact canonical packet/events/tamper/path/budget/legacy cases; AE/provider0, productionstore writes0.`);
}finally{const target=path.resolve(temp);assert(target.startsWith(path.resolve(os.tmpdir())+path.sep) && path.basename(target).startsWith("ae-canonical-visual-file-"));fs.rmSync(target,{recursive:true,force:true});}
