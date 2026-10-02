"use strict";

// Portable read-only assembly fixtures. No AE, provider, bridge startup or JSX.
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), crypto = require("node:crypto");
const {spawnSync} = require("node:child_process");
const Module = require("node:module");
const repo = path.resolve(__dirname,"..");
const base = fs.mkdtempSync(path.join(os.tmpdir(),"ae-task-completion-"));
const workspace = path.join(base,"workspace"), metadataDir = path.join(workspace,"state"), logDir = path.join(workspace,"logs"), generatedExportDir = path.join(logDir,"generated-exports");
const options = {workspace,metadataDir,logDir,generatedExportDir};
const taskId = "fixture-completion-01", runId = crypto.randomUUID();
let groups = 0;
const load = Module._load;
let completion;
try {
  Module._load = function(name,...args) {
    if (/^(?:node:)?(?:http|https|net|child_process)$/.test(name) || /bridge-daemon|ai-agents|provider|agy-bridge/.test(name)) throw new Error("Forbidden runtime dependency: " + name);
    return load.call(this,name,...args);
  };
  completion = require("../mcp-server/ae-task-completion");
} finally {Module._load = load;}
const records = require("../mcp-server/plan-run-records"), receipts = require("../mcp-server/review-evidence");
const {buildRunOutcome} = require("../mcp-server/run-outcome");
const metadataFile = path.join(metadataDir,taskId + ".json");
const input = {taskId,runIds:[runId]};
const digest = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const clone = value => JSON.parse(JSON.stringify(value));
function test(label,fn) {fn();groups++;console.log("PASS " + label);}
function json(file,value) {fs.writeFileSync(file,JSON.stringify(value));}
function snapshot(directory) {
  const result = {};
  for (const entry of fs.readdirSync(directory,{withFileTypes:true})) {
    const file = path.join(directory,entry.name);
    if (entry.isDirectory()) Object.assign(result,snapshot(file)); else if (entry.isFile()) result[file]=digest(fs.readFileSync(file));
  }
  return result;
}
function fixtureRun(result,tool="save_comp_frame_png",status="completed") {
  const plan = {summary:"Recorded fixture",steps:[{tool,args:{}}]};
  const run = {id:runId,ok:status === "completed",dryRun:false,executedCount:status === "completed" ? 1 : 0,failedCount:0,
    startedAt:"2026-10-01T12:00:00.000Z",finishedAt:"2026-10-01T12:00:01.000Z",
    provenance:{actionId:"fixture-action",projectId:"fixture-project",proposalRevision:1,projectRevision:null},
    semanticVerification:{status:"passed",ok:true,coverageStatus:"complete",unverifiedMutationCount:0,passedChecks:1,failedChecks:0,needsReviewChecks:0,checks:[{id:"fixture-check",status:"passed",passed:true}]},
    steps:[{index:1,tool,status,mutatesProject:true,result}]};
  if (status === "completed") {
    run.steps[0].evidenceArtifact = receipts.writeStepEvidence(logDir,{runId,stepIndex:1,tool,actionId:"fixture-action",projectId:"fixture-project",proposalRevision:1,projectRevision:null,
      observedAt:run.finishedAt,result});
  }
  run.outcome = buildRunOutcome(run,plan);
  return {schema:"ae-agent-plan-run-record.v1",runId,createdAt:run.startedAt,project:{file:"synthetic.aep"},plan,run};
}
function build(extra={},opts=options) {return completion.buildTaskCompletion({...input,...extra},opts);}
try {
  for (const dir of [metadataDir,generatedExportDir]) fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(workspace,"artifact.txt"),"current artifact");
  const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2ioAAAAASUVORK5CYII=","base64");
  const imageFile = path.join(generatedExportDir,"fixture.png");
  fs.writeFileSync(imageFile,image);
  const proof = require("../mcp-server/generated-png-proof").verifyCompletePngBuffer(image);
  assert(proof.ok);
  const result = {file:{outputFileName:"fixture.png",outputPath:imageFile,sha256:proof.sha256,byteLength:proof.byteLength,width:proof.width,height:proof.height,pngComplete:true,existsAfter:true,deletedAfterReadBack:false}};
  const canonical = fixtureRun(result);
  records.writeRecord(logDir,canonical);
  const metadata = {protocol_version:1,task_id:taskId,workspace,transport_status:"completed",task_status:"success",terminal_result_seen:true,terminal_result_valid:true,schema_valid:true,artifact_verification:"passed",
    started_at:1790856000,finished_at:1790856001,request:{protocol_version:1,task_id:taskId,profile:"ae-agent",expected_artifacts:[{path:"artifact.txt",scope:"workspace",check:"exists"}]},
    reported_outputs:["../foreign.txt"],summary:"MODEL CLAIM: all visual acceptance passed",visual_acceptance:"accepted"};
  json(metadataFile,metadata);
  const declaration = {taskId,reviewer:"dispatcher",reviewedAt:"2026-10-02T12:00:00.000Z",frames:[{runId,stepIndex:1,sha256:proof.sha256,decision:"accepted"}]};
  test("valid recorded metadata/artifact/native; no visual promotion",()=>{
    const summary=build();
    assert.equal(summary.schema,completion.SCHEMA);assert.equal(summary.isError,false);
    assert.equal(summary.execution.status,"completed");assert.equal(summary.execution.mutationStatus,"applied");assert.equal(summary.technicalVerification.status,"passed");
    assert.equal(summary.visualAcceptance.status,"not_established");assert.equal(summary.completeTaskAcceptance,false);assert.equal(summary.coverage,"provided_run_ids_only");
    assert.equal(summary.nativeRuns[0].fresh,false);assert.equal(summary.artifacts[0].sha256,digest("current artifact"));assert.equal(summary.artifacts[0].changed,null);
    assert.equal(summary.transport.startedAt,"2026-10-01T12:00:00.000Z");assert.equal(summary.usage.status,"unknown");
    assert.equal(summary.transport.reportedSummary,metadata.summary);assert.equal(summary.transport.claimsSource,"recorded_transport_claims");
    assert.equal(summary.visualAcceptance.status,"not_established");assert(!JSON.stringify(summary).includes("foreign.txt"));
  });
  test("failed transport still preserves applied native execution",()=>{
    json(metadataFile,{...metadata,transport_status:"failed",task_status:"unknown",terminal_result_valid:false,schema_valid:false});
    const summary=build();assert.equal(summary.isError,true);assert.equal(summary.transport.status,"failed");assert.equal(summary.execution.mutationStatus,"applied");assert.equal(summary.technicalVerification.status,"passed");
    json(metadataFile,metadata);
  });
  test("submitted timeout stays unknown; explicit native error retained",()=>{
    const timeout=clone(canonical);timeout.run.ok=false;timeout.run.errorCode="command_timeout";timeout.run.error="Submitted command timed out";
    timeout.run.steps=[{index:1,tool:"set_layer_transform",status:"failed",mutatesProject:true,errorCode:"command_timeout",error:"Submitted command timed out",commands:[{role:"mutation",state:"submitted",submittedAt:"2026-10-01T12:00:00Z"}]}];
    timeout.plan.steps=[{tool:"set_layer_transform",args:{}}];timeout.run.outcome=buildRunOutcome(timeout.run,timeout.plan);
    records.writeRecord(logDir,timeout);
    const summary=build();assert.equal(summary.execution.mutationStatus,"unknown");assert.equal(summary.technicalVerification.status,"pending");assert.equal(summary.nextAction,"read_only_reconciliation");
    assert.equal(summary.nativeRuns[0].error.code,"command_timeout");records.writeRecord(logDir,canonical);
  });
  test("malformed/false success metadata never invents native proof",()=>{
    fs.writeFileSync(metadataFile,"{");const malformed=build({runIds:[]});assert.equal(malformed.transport.status,"unknown");assert.equal(malformed.isError,true);
    json(metadataFile,{...metadata,terminal_result_valid:false,reported_outputs:[{ok:true}]});
    const falseSuccess=build({runIds:[]});assert.equal(falseSuccess.execution.status,"unknown");assert.equal(falseSuccess.technicalVerification.status,"not_requested");assert.equal(falseSuccess.isError,true);json(metadataFile,metadata);
  });
  test("task/profile/workspace binding and missing metadata",()=>{
    for(const mutation of [{task_id:"other"},{workspace:base},{request:{...metadata.request,task_id:"other"}},{request:{...metadata.request,profile:"codex"}}]) {
      json(metadataFile,{...metadata,...mutation});const summary=build();assert.equal(summary.transport.status,"unknown");assert(summary.blockers.some(b=>b.code==="metadata_binding_mismatch"));
    }
    fs.unlinkSync(metadataFile);const missing=build();assert.equal(missing.transport.status,"unknown");assert.equal(missing.isError,true);json(metadataFile,metadata);
  });
  test("strict identities/unique IDs/limits/no public root options",()=>{
    for(const bad of ["../escape","CON","x.json","","x".repeat(129)]) assert.throws(()=>build({taskId:bad}),e=>e.code==="task_id_invalid");
    assert.throws(()=>build({runIds:[runId,runId.toUpperCase()]}),e=>e.code==="duplicate_run_ids");
    assert.throws(()=>build({runIds:[true]}),e=>e.code==="run_ids_invalid");
    assert.throws(()=>build({runIds:Array.from({length:33},()=>crypto.randomUUID())}),e=>e.code==="run_ids_invalid");
    assert.throws(()=>build({workspace:base}),e=>e.code==="completion_input_invalid");
  });
  test("changed claim without independent before proof stays unknown",()=>{
    json(metadataFile,{...metadata,request:{...metadata.request,expected_artifacts:[{path:"artifact.txt",scope:"workspace",check:"changed"}]}});
    const summary=build();assert.equal(summary.artifacts[0].status,"present");assert.equal(summary.artifacts[0].changed,null);assert(summary.blockers.some(b=>b.code==="artifact_change_not_proven"));json(metadataFile,metadata);
  });
  test("missing artifact and escaping workspace path",()=>{
    json(metadataFile,{...metadata,request:{...metadata.request,expected_artifacts:[{path:"missing.txt",scope:"workspace",check:"exists"}]}});
    assert.equal(build().artifacts[0].status,"missing");
    json(metadataFile,{...metadata,request:{...metadata.request,expected_artifacts:[{path:"../outside.txt",scope:"workspace",check:"exists"}]}});
    assert(build().blockers.some(b=>b.code==="path_containment_violation"));json(metadataFile,metadata);
  });
  test("state directory junction escape rejected before metadata trust",()=>{
    const foreign=path.join(base,"foreign-state");fs.mkdirSync(foreign);json(path.join(foreign,taskId+".json"),metadata);
    const local=path.join(workspace,"linked-state");fs.symlinkSync(foreign,local,process.platform==="win32"?"junction":"dir");
    try {const summary=build({}, {...options,metadataDir:local});assert.equal(summary.transport.status,"unknown");assert(summary.blockers.some(b=>b.code==="path_containment_violation"));}
    finally {fs.unlinkSync(local);}
  });
  test("artifact parent junction escape rejected",()=>{
    const foreign=path.join(base,"foreign-artifacts");fs.mkdirSync(foreign);fs.writeFileSync(path.join(foreign,"same.txt"),"foreign");
    const local=path.join(workspace,"linked-artifacts");fs.symlinkSync(foreign,local,process.platform==="win32"?"junction":"dir");
    json(metadataFile,{...metadata,request:{...metadata.request,expected_artifacts:[{path:"linked-artifacts/same.txt",scope:"workspace",check:"exists"}]}});
    try {const summary=build();assert.equal(summary.artifacts[0].status,"unknown");assert(summary.blockers.some(b=>b.code==="path_containment_violation"));}
    finally {fs.unlinkSync(local);json(metadataFile,metadata);}
  });
  test("run identity and step hash/binding failure are never passed",()=>{
    const wrong=clone(canonical);wrong.run.id=crypto.randomUUID();records.writeRecord(logDir,wrong);assert.equal(build().execution.status,"unknown");
    records.writeRecord(logDir,canonical);
    const artifactFile=canonical.run.steps[0].evidenceArtifact.artifactFile, saved=fs.readFileSync(artifactFile);
    fs.writeFileSync(artifactFile,"tampered");const mismatch=build();assert.equal(mismatch.technicalVerification.status,"unknown");assert.equal(mismatch.nativeRuns[0].error.code,"evidence_hash_mismatch");
    const altered=JSON.parse(saved);altered.actionId="other";const alteredText=JSON.stringify(altered);fs.writeFileSync(artifactFile,alteredText);
    const changed=clone(canonical);changed.run.steps[0].evidenceArtifact.sha256=digest(alteredText);records.writeRecord(logDir,changed);
    assert.equal(build().nativeRuns[0].error.code,"step_evidence_binding_mismatch");fs.writeFileSync(artifactFile,saved);records.writeRecord(logDir,canonical);
  });
  test("native incomplete coverage is preserved instead of passed",()=>{
    const incomplete=clone(canonical);incomplete.run.semanticVerification.unverifiedMutationCount=1;incomplete.run.semanticVerification.coverageStatus="incomplete";
    records.writeRecord(logDir,incomplete);assert.equal(build().technicalVerification.status,"insufficient");records.writeRecord(logDir,canonical);
  });
  test("missing native statuses and partial execution remain explicit",()=>{
    const missing=clone(canonical);missing.run.outcome={execution:{},mutation:{},verification:{}};records.writeRecord(logDir,missing);
    const summary=build();assert.equal(summary.execution.status,"unknown");assert.equal(summary.execution.mutationStatus,"unknown");assert.equal(summary.technicalVerification.status,"unknown");
    const partial=clone(canonical);partial.run.outcome.execution.status="partial";partial.run.outcome.mutation.status="partial";records.writeRecord(logDir,partial);
    assert.equal(build().execution.status,"partial");assert.equal(build().execution.mutationStatus,"partial");records.writeRecord(logDir,canonical);
  });
  test("explicit dispatcher review is declared acceptance, not machine viewing proof",()=>{
    const summary=build({visualReview:declaration});assert.equal(summary.visualAcceptance.status,"declared_accepted");assert.equal(summary.visualAcceptance.machineProofOfViewing,false);
    assert.equal(summary.completeTaskAcceptance,false);assert.equal(summary.visualAcceptance.frames[0].status,"validated_declaration");
    const fix=clone(declaration);fix.frames[0].decision="needs_fix";assert.equal(build({visualReview:fix}).visualAcceptance.status,"needs_fix");
  });
  test("large actual receipt establishes the same declaration without diagnostic output",()=>{
    const artifactFile=canonical.run.steps[0].evidenceArtifact.artifactFile,saved=fs.readFileSync(artifactFile);
    const receipt=JSON.parse(saved);receipt.result.diagnostic="LARGE_DIAGNOSTIC_ONLY_🎬".repeat(12001);
    const body=JSON.stringify(receipt);assert(body.length>12000);fs.writeFileSync(artifactFile,body);
    const large=clone(canonical);large.run.steps[0].evidenceArtifact.sha256=digest(body);large.run.steps[0].result=receipt.result;records.writeRecord(logDir,large);
    try {
      const summary=build({visualReview:declaration});assert.equal(summary.visualAcceptance.status,"declared_accepted");assert.equal(summary.technicalVerification.status,"passed");
      assert(!JSON.stringify(summary).includes("LARGE_DIAGNOSTIC_ONLY_"));assert(Buffer.byteLength(JSON.stringify(summary))<12000);
    } finally {fs.writeFileSync(artifactFile,saved);records.writeRecord(logDir,canonical);}
  });
  test("canonical change after receipt validation rejects mixed generations",()=>{
    const responses=require("../mcp-server/plan-run-response"),original=responses.getPlanRunEvidence;
    let changed=false;
    responses.getPlanRunEvidence=function(root,args) {
      const page=original(root,args);
      if(args.stepIndex===1&&!changed) {
        const next=clone(canonical);next.run.outcome.execution.reasonCode="changed_after_receipt_read";records.writeRecord(logDir,next);changed=true;
      }
      return page;
    };
    try {
      const summary=build({visualReview:declaration});assert(changed);assert.equal(summary.execution.status,"unknown");assert.equal(summary.technicalVerification.status,"unknown");
      assert.equal(summary.nativeRuns[0].error.code,"native_record_changed_during_read");assert.equal(summary.visualAcceptance.status,"not_established");
    } finally {responses.getPlanRunEvidence=original;records.writeRecord(logDir,canonical);}
  });
  test("receipt changed between API validation and bounded full read rejects hash substitution",()=>{
    const responses=require("../mcp-server/plan-run-response"),original=responses.getPlanRunEvidence;
    const artifactFile=canonical.run.steps[0].evidenceArtifact.artifactFile,saved=fs.readFileSync(artifactFile);let changed=false;
    responses.getPlanRunEvidence=function(root,args) {
      const page=original(root,args);
      if(args.stepIndex===1&&!changed) {
        const receipt=JSON.parse(saved);receipt.result.diagnostic="replacement receipt";const body=JSON.stringify(receipt);fs.writeFileSync(artifactFile,body);
        const next=clone(canonical);next.run.steps[0].evidenceArtifact.sha256=digest(body);records.writeRecord(logDir,next);changed=true;
      }
      return page;
    };
    try {
      const summary=build();assert(changed);assert.equal(summary.execution.status,"unknown");assert.equal(summary.nativeRuns[0].error.code,"native_receipt_hash_mismatch");
    } finally {responses.getPlanRunEvidence=original;fs.writeFileSync(artifactFile,saved);records.writeRecord(logDir,canonical);}
  });
  test("applied/not-started and passed/not-required pairs keep partial coverage",()=>{
    const idleId=crypto.randomUUID(),idle=clone(canonical);idle.runId=idleId;idle.run.id=idleId;idle.plan.steps=[{tool:"get_project_info",args:{}}];
    idle.run.dryRun=true;idle.run.steps=[];idle.run.executedCount=0;idle.run.semanticVerification=null;idle.run.outcome=buildRunOutcome(idle.run,idle.plan);records.writeRecord(logDir,idle);
    const summary=build({runIds:[runId,idleId]});assert.equal(summary.execution.status,"partial");assert.equal(summary.execution.mutationStatus,"partial");assert.equal(summary.technicalVerification.status,"partial");
    assert.equal(summary.completeTaskAcceptance,false);assert.equal(summary.coverage,"provided_run_ids_only");
  });
  test("reported transport diagnosis/warnings stay bounded recorded claims",()=>{
    json(metadataFile,{...metadata,summary:"remote wsarecv socket closed "+"X".repeat(500),warnings:Array.from({length:9},()=>"W".repeat(500))});
    try {
      const summary=build();assert(summary.transport.reportedSummary.startsWith("remote wsarecv socket closed"));assert(summary.transport.reportedSummary.length<=240);
      assert.equal(summary.transport.warnings.length,8);assert.equal(summary.transport.warningCount,9);assert(summary.transport.warnings.every(w=>w.length<=240));assert.equal(summary.transport.claimsTruncated,true);
      assert.equal(summary.transport.claimsSource,"recorded_transport_claims");assert.equal(summary.execution.mutationStatus,"applied");assert.equal(summary.visualAcceptance.status,"not_established");
    } finally {json(metadataFile,metadata);}
  });
  test("wrong task/reviewer/run/hash/decision and corrupt acknowledgement",()=>{
    for(const review of [{...declaration,taskId:"other"},{...declaration,reviewer:"model"},{...declaration,reviewedAt:"yesterday"},
      {...declaration,frames:[{...declaration.frames[0],runId:crypto.randomUUID()}]},
      {...declaration,frames:[{...declaration.frames[0],sha256:"0".repeat(64)}]},
      {...declaration,frames:[{...declaration.frames[0],decision:"success"}]},
      {...declaration,frames:[declaration.frames[0],declaration.frames[0]]}]) assert.equal(build({visualReview:review}).visualAcceptance.status,"not_established");
    fs.writeFileSync(imageFile,"bad PNG");assert.equal(build({visualReview:declaration}).visualAcceptance.status,"not_established");fs.writeFileSync(imageFile,image);
    fs.unlinkSync(imageFile);assert.equal(build({visualReview:declaration}).visualAcceptance.status,"not_established");fs.writeFileSync(imageFile,image);
  });
  test("valid hash outside server export root cannot establish frame review",()=>{
    const artifactFile=canonical.run.steps[0].evidenceArtifact.artifactFile,saved=fs.readFileSync(artifactFile);
    const outsideExport=path.join(workspace,"outside-export.png");fs.writeFileSync(outsideExport,image);
    const altered=JSON.parse(saved);altered.result.file.outputPath=outsideExport;
    const changedText=JSON.stringify(altered);fs.writeFileSync(artifactFile,changedText);
    const changed=clone(canonical);changed.run.steps[0].evidenceArtifact.sha256=digest(changedText);records.writeRecord(logDir,changed);
    const summary=build({visualReview:declaration});assert.equal(summary.visualAcceptance.status,"not_established");assert.equal(summary.visualAcceptance.frames[0].errorCode,"path_containment_violation");
    fs.writeFileSync(artifactFile,saved);records.writeRecord(logDir,canonical);
  });
  test("timestamp absent is null; no native runs means no technical PASS",()=>{
    const absent=clone(metadata);delete absent.started_at;delete absent.finished_at;json(metadataFile,absent);
    const summary=build({runIds:[]});assert.equal(summary.transport.startedAt,null);assert.equal(summary.execution.status,"unknown");assert.equal(summary.technicalVerification.status,"not_requested");assert.equal(summary.completeTaskAcceptance,false);json(metadataFile,metadata);
  });
  test("actual CLI JSON/exit behavior and unchanged fixtures",()=>{
    // Copy the actual read-only CLI plus its exact dependencies into a fixture
    // project. Public input cannot override roots; no production config edits.
    for(const name of ["scripts/ae-task-completion.js","mcp-server/ae-task-completion.js","mcp-server/plan-run-records.js","mcp-server/plan-run-response.js","mcp-server/generated-png-proof.js"]) {
      const destination=path.join(workspace,name);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(path.join(repo,name),destination);
    }
    fs.mkdirSync(path.join(workspace,"config"));json(path.join(workspace,"config","agy-bridge.json"),{version:1,profiles:{"ae-agent":{workspace:"..",state_dir:"../state"}}});
    const inputFile=path.join(workspace,"input.json");json(inputFile,input);
    const env={...process.env};delete env.AE_BRIDGE_LOG_DIR;delete env.AE_AGENT_GENERATED_EXPORT_DIR;
    const before=snapshot(workspace);
    const success=spawnSync(process.execPath,[path.join(workspace,"scripts/ae-task-completion.js"),inputFile],{env,encoding:"utf8",windowsHide:true,timeout:5000});
    assert.equal(success.status,0,success.stderr+success.stdout);assert.equal(JSON.parse(success.stdout).schema,completion.SCHEMA);assert.equal(success.stderr,"");assert.deepEqual(snapshot(workspace),before);
    json(inputFile,{taskId:"missing-metadata",runIds:[]});const beforeMissing=snapshot(workspace);
    const missing=spawnSync(process.execPath,[path.join(workspace,"scripts/ae-task-completion.js"),inputFile],{env,encoding:"utf8",windowsHide:true,timeout:5000});
    assert.equal(missing.status,1);assert.equal(JSON.parse(missing.stdout).isError,true);assert.deepEqual(snapshot(workspace),beforeMissing);
    const invalid=spawnSync(process.execPath,[path.join(workspace,"scripts/ae-task-completion.js")],{env,encoding:"utf8",windowsHide:true,timeout:5000});
    assert.equal(invalid.status,1);assert.equal(JSON.parse(invalid.stdout).errorCode,"completion_input_file_required");
  });
  console.log(JSON.stringify({ok:true,groups,actualModule:true,actualCli:true,readOnly:true,providedRunsOnly:true,aeCalls:0,providerCalls:0}));
} finally {
  const absolute=path.resolve(base),allowed=path.resolve(os.tmpdir());
  assert(absolute.startsWith(allowed+path.sep)&&path.basename(absolute).startsWith("ae-task-completion-"));
  fs.rmSync(absolute,{recursive:true,force:true});
}
