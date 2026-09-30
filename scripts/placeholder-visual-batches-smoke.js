"use strict";
const assert=require("assert"),path=require("path");
const {buildInspectionBatches,verifyVisualReviewBatches}=require("../mcp-server/placeholder-visual-batches");
const root=path.resolve(__dirname,"..");
function image(index){return {itemId:index,filePath:path.join(root,".codex-runtime","batch-fixture-"+index+".png"),sha256:"a".repeat(64),byteLength:24,width:320,height:220};}
const manifest={schema:"ae-placeholder-review-manifest.v1",owner:"synthetic-only",projectKey:"b".repeat(64),receiptHash:"c".repeat(64),frames:Array.from({length:12},(_,index)=>({frameId:"frame-"+index,itemId:index,target:{compItemId:10+Math.floor(index/3),layerId:20+Math.floor(index/3)},viewKind:"target_comp",sampleIndex:index%3,image:image(index)})),sheet:{itemId:100,image:image(100)},limits:"Только синтетические выбранные кадры, не live proof."};
function runFor(batch,index,reject=false){
 const conversationId="synthetic-conversation-"+index,events=[{event:"init",conversation_id:conversationId,init:{model:"gemini-3.8-flash-high"}}];
 batch.material.requiredInputs.forEach((input,step_index)=>{
  const info={name:"view_file",parameters:{AbsolutePath:path.resolve(root,input.path)}};
  for(const state of ["ACTIVE","DONE"])events.push({event:"step_update",step_update:{conversation_id:conversationId,step_index,state,step_type:"tool",tool_name:"view_file",tool_info:info}});
 });
 return {state:{task_id:"synthetic-job-"+index,conversation_id:conversationId,workspace:root,transport_status:"completed",task_status:"success",terminal_result_seen:true,terminal_result_valid:true,schema_valid:true,request:{kind:"inspect",profile:"ae-agent",instructions:batch.material.instructions,required_inputs:batch.material.requiredInputs}},events,response:{status:"success",outputs:batch.frameIds.map((frameId,i)=>JSON.stringify({frameId,decision:reject&&i===0?"reject":"safe",observation:reject&&i===0?"Голова человека обрезана верхней границей рамки, верхнего отступа нет.":"Голова человека полностью видна с верхним отступом, боковые границы сохраняют плечи."}))}};
}
const built=buildInspectionBatches(manifest);
assert.equal(built.batches.length,2,"Four targets x3 frames must fit provider batches without truncation.");
assert.deepEqual(built.batches.map(batch=>batch.frameIds.length),[10,2]);
assert(built.batches.every(batch=>batch.material.requiredInputs.length<=11));
assert.equal(new Set(built.batches.flatMap(batch=>batch.frameIds)).size,12);
const runs=built.batches.map((batch,index)=>runFor(batch,index));
let result=verifyVisualReviewBatches(manifest,runs);assert.equal(result.ok,true);assert.equal(result.artisticAccepted,true);assert.equal(result.observations.length,12);
result=verifyVisualReviewBatches(manifest,[runs[0]]);assert.equal(result.ok,false);assert.equal(result.artisticAccepted,false);assert.deepEqual(result.coverage,{reviewedFrames:10,expectedFrames:12});
result=verifyVisualReviewBatches(manifest,[runs[0],runFor(built.batches[1],1,true)]);assert.equal(result.ok,true);assert.equal(result.artisticAccepted,false);assert.equal(result.status,"rejected_sampled_frames");
assert.equal(verifyVisualReviewBatches(manifest,[runs[0],runs[0]]).ok,false);
const stale=JSON.parse(JSON.stringify(manifest));stale.frames[11].image.sha256="d".repeat(64);assert.equal(verifyVisualReviewBatches(stale,runs).ok,false,"Changed frame hashes invalidate owner-wide proof.");
const extra=runFor(built.batches[0],2);assert.equal(verifyVisualReviewBatches(manifest,[...runs,extra]).ok,false);
const large={...manifest,frames:Array.from({length:81},(_,index)=>({...manifest.frames[0],frameId:"large-"+index}))};assert.throws(()=>buildInspectionBatches(large),/inspection_batch_budget/);
const sourceOnly={...manifest,frames:manifest.frames.map(frame=>({...frame,viewKind:"source"}))};assert.throws(()=>buildInspectionBatches(sourceOnly),/review_frame_identity_invalid/);
const single={...manifest,frames:manifest.frames.slice(0,6)},singleBuilt=buildInspectionBatches(single);assert.deepEqual(singleBuilt.batches[0].manifest,single,"Legacy single-batch pin stays unchanged.");assert.equal(verifyVisualReviewBatches(single,[runFor(singleBuilt.batches[0],0)]).artisticAccepted,true);
assert.throws(()=>buildInspectionBatches({...manifest,frames:[null,...manifest.frames]}),/review_frame_view_kind_invalid/);
console.log("PASS: four-target evidence batches, complete/partial/rejected scope, duplicates/stale hashes/extra runs/budgets; synthetic validator fixtures, AE/provider calls0.");
