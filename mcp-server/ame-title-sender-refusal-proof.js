"use strict";
// Reviewed historical evidence, not a caller-supplied recovery grant. The old
// journal truncated scripts and did not retain native result bytes. Therefore
// this exception pins the complete original run and its complete command slice;
// it deliberately admits no other run, including future similar refusals.
const review=require("./review-evidence"),records=require("./plan-run-records");
const REVIEWED=Object.freeze({
  runId:"8cd2d301-651e-44c7-9033-1dc181fab3fd",
  recordSha256:"49ec31b90978b6cfeca67aa2101c3884e0b104a27b91b6ca73fc2ce9aafbbfb6",
  gitCommit:"b4478b6b62a29e6639421748e09f35c8085c7cb8",
  sourceSha256:"a6555f60e46a38ce27b3be4dbedbbd13a12a96d6c7ec8c0f6d0967ee82d8740f",
  commandEventCount:20,
  commandEventsSha256:"b4ffd1a110679beb3ddfa9187f47a2e76589ef1d574c2df6ceb8427d71ea04b0",
  queued:Object.freeze([
    {id:"c7ef88fd-bf1b-4ae4-bd6c-71b5b6661604",stepIndex:null,scriptSha25664:"a2fd895de27b17b82187c5580968cdae169136af3aff4c045c809e3fd212baa3"},
    {id:"1d66576d-1425-4214-8a72-5600465ce7ab",stepIndex:null,scriptSha25664:"7a4a37d1e43e1fffb713465821c420aff74837add0e8417f9ce23194a99a189d"},
    {id:"651f5a7f-8075-49c3-8c21-99c6ab90e47c",stepIndex:null,scriptSha25664:"a2fd895de27b17b82187c5580968cdae169136af3aff4c045c809e3fd212baa3"},
    {id:"4359692a-f727-4f69-8c27-96eb26236056",stepIndex:1,scriptSha25664:"dca60ef8b815845f4295ecd41314102fff432bcdd693497f4939c8457b7fe559"},
    {id:"1ee248f6-707d-47c8-98ee-ff8a3b0d9a26",stepIndex:1,scriptSha25664:"d279468231c6055af169ac91feb8deecd89cda90581299f6b83dc7b68435e2b3"}
  ].map(Object.freeze)),
  commands:Object.freeze([
    {id:"4359692a-f727-4f69-8c27-96eb26236056",role:"readback",resultSha256:"6dd82b2673209ab5fbaa4e5fd47ccc78c2fe2d294236531a390f9f1891224d8d"},
    {id:"1ee248f6-707d-47c8-98ee-ff8a3b0d9a26",role:"mutation",resultSha256:"29e248eddb33b63d1fd635ea6d6c0d7f88cebad2546bb503eaecba061a89b121"}
  ].map(Object.freeze))
});
// The optional reference is a private offline fixture seam. Production wiring
// always uses the module-local reviewed reference; no tool JSON can choose it.
function assertRuntime(record,reference=REVIEWED){
  try{
    const runtime=record.run?.provenance?.runtime,modules=runtime?.modules;
    return record.runId===reference.runId&&record.run?.id===reference.runId&&records.digest(JSON.stringify(record))===reference.recordSha256&&
      runtime?.gitCommit===reference.gitCommit&&runtime.sourceSha256===reference.sourceSha256&&Array.isArray(modules)&&new Set(modules.map(m=>m.name)).size===modules.length&&review.sha256(modules)===runtime.sourceSha256;
  }catch(_){return false;}
}
function assertRecord(record,command,journal,reference=REVIEWED){
  try{
    if(!assertRuntime(record,reference)||!Array.isArray(journal))return false;
    const commands=record.run.steps[0].commands,expected=reference.commands,provenance=record.run.provenance;
    if(commands.length!==expected.length||command.id!==expected[expected.length-1].id||review.sha256(command)!==review.sha256(commands[commands.length-1])||
      !commands.every((c,i)=>c.id===expected[i].id&&c.role===expected[i].role&&review.sha256(c.result)===expected[i].resultSha256))return false;
    // Collect every queued entry for this run BEFORE inspecting stepIndex.
    // Safety/checkpoint commands outside the step are pinned too.
    const queued=journal.filter(e=>e.type==="ae_command_queued"&&e.details?.runId===record.runId);
    if(queued.length!==reference.queued.length||new Set(queued.map(e=>e.details.id)).size!==queued.length||!queued.every((e,i)=>{
      const d=e.details,wanted=reference.queued[i];return d.id===wanted.id&&d.commandId===wanted.id&&(d.stepIndex??null)===wanted.stepIndex&&d.scriptSha25664===wanted.scriptSha25664&&d.actionId===provenance.actionId&&d.planSha256===provenance.planSha256&&e.runtime?.sourceSha256===reference.sourceSha256&&e.runtime.gitCommit===reference.gitCommit;
    }))return false;
    const ids=new Set(reference.queued.map(e=>e.id)),events=journal.filter(e=>/^ae_command_/.test(e.type)&&(ids.has(e.details?.id)||ids.has(e.details?.commandId)||e.details?.runId===record.runId));
    // Exact complete lifecycle slice rejects missing, late, duplicate, timeout,
    // stale or conflicting results without modifying the historical record.
    return events.length===reference.commandEventCount&&review.sha256(events)===reference.commandEventsSha256;
  }catch(_){return false;}
}
module.exports={assertRuntime,assertRecord};
