"use strict";
const assert = require("assert");
const { createVerificationEvidence, linkedEventSlice, sanitizeEvidence, findLeaks, packageReviewEvidence, assessRequirements, assessAudioCoverage, runtimeIdentity } = require("../mcp-server/review-evidence");
const { buildRunOutcome } = require("../mcp-server/run-outcome");
const hash = "a".repeat(64);
const binding = {projectId:"project-1",projectRevision:"revision-B",actionId:"proposal-1",proposalRevision:2};
const subject = {...binding,runId:"subject",stepIndex:1,status:"failed"};
const observed = {...binding,runId:"readback",stepIndex:3,observedAt:"2026-09-18T01:00:00.000Z",audit:{ok:true}};
const evidence = createVerificationEvidence({id:"evidence-1",kind:"post-repair-recomposition",subject,repair:{...binding,runId:"repair",stepIndex:2,status:"completed"},observed});
assert.strictEqual(evidence.subject.status,"failed");
assert.strictEqual(subject.status,"failed");
assert.notStrictEqual(evidence.id,evidence.subject.runId);
assert.match(evidence.auditSha256,/^[a-f0-9]{64}$/);
assert.strictEqual(evidence.acceptance.status,"not_requested");
for(const change of [{projectId:"other"},{projectRevision:"old"},{proposalRevision:null},{runId:""},{stepIndex:null}]) {
  assert.throws(()=>createVerificationEvidence({id:"evidence-1",kind:"post-repair-recomposition",subject,repair:{...binding,runId:"repair",stepIndex:2},observed:{...observed,...change}}));
}
assert.throws(()=>createVerificationEvidence({id:"subject",kind:"direct-read-back",subject,observed}));
assert.throws(()=>createVerificationEvidence({id:"evidence-1",kind:"post-repair-recomposition",subject,observed}));
const acceptedB={...subject,projectRevision:"revision-A"};
assert.throws(()=>createVerificationEvidence({id:"evidence-B",kind:"direct-read-back",subject:acceptedB,observed}));
assert.strictEqual(createVerificationEvidence({id:"evidence-B",kind:"direct-read-back",subject:acceptedB,observed,acceptedRevision:{from:"revision-A",to:"revision-B",decisionId:"manual-revision-accepted"}}).observed.projectRevision,"revision-B");
const events=[
 {type:"proposal",details:{requestId:"request-1",actionId:"proposal-1"}},
 {type:"run",details:{actionId:"proposal-1",runId:"subject",sessionId:"session-1"}},
 {type:"command",details:{runId:"subject",commandId:"command-1"}},
 {type:"command_result",details:{commandId:"command-1",ok:true}},
 {type:"checkpoint",details:{sessionId:"session-1",checkpointId:"checkpoint-1"}},
 {type:"file_proof",details:{checkpointId:"checkpoint-1",artifactId:"artifact-1",sha256:hash}},
 {type:"unrelated",details:{requestId:"request-2",projectId:"project-1"}},
 {type:"other_run_same_session",details:{runId:"unrelated-run",sessionId:"session-1"}}
];
assert.deepStrictEqual(linkedEventSlice(events,{requestIds:["request-1"]}).map(x=>x.type),events.slice(0,6).map(x=>x.type));
assert.deepStrictEqual(linkedEventSlice(events,{runIds:["missing"]}),[]);
assert.throws(()=>linkedEventSlice(events,{}));
const synthetic={nested:[{source:"R:\\Users\\Synthetic Person\\Private Fixture\\clip.mov"}],username:"Synthetic Person",script:'new File("[REDACTED_PATH]Private Fixture/clip.mov")',encoded:JSON.stringify({path:"/Users/SyntheticPerson/private/clip.mov"}),apiKey:"fixture_secret_token",auth:"Bearer synthetic_secret_value_123456789",fragment:"Private Fixture remainder"};
const options={sensitiveFragments:["Private Fixture","Synthetic Person","SyntheticPerson"]};
assert(findLeaks(synthetic,options).length>=6);
const sanitized=sanitizeEvidence(synthetic,options);
assert.deepStrictEqual(findLeaks(sanitized,options),[]);
assert(!JSON.stringify(sanitized).includes("clip.mov"));
for(const value of ["/srv/synthetic-case/clip.mov",'File("/data/private/case.mov")',"\\\\synthetic-host\\private\\case.mov",'Authorization: Basic Zml4dHVyZTphYmM=']){
  assert(findLeaks(value).length);assert.strictEqual(findLeaks(sanitizeEvidence(value)).length,0);
}
assert.strictEqual(sanitizeEvidence(synthetic,options).nested[0].source,sanitized.nested[0].source);
assert.deepStrictEqual(synthetic.nested[0].source,"R:\\Users\\Synthetic Person\\Private Fixture\\clip.mov");
const packed=packageReviewEvidence({events,seeds:{requestIds:["request-1"]},verifications:[evidence],provenance:{manifestSchema:"ae-agent-slideshow.v2",manifestSha256:hash,planSha256:hash,runtime:{gitCommit:"b".repeat(40),sourceSha256:hash}},requirements:[]},options);
assert.strictEqual(packed.manifest.completeClientAcceptance,false);
assert.strictEqual(packed.manifest.eventCount,6);
assert.deepStrictEqual(findLeaks(packed,options),[]);
const fs=require("fs"),os=require("os"),path=require("path");
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"ae-synthetic-evidence-"));
try {
  const target=path.join(temp,"new-package"),{writePackage}=require("./package-review-evidence");
  const input={events,seeds:{requestIds:["request-1"]},verifications:[evidence],provenance:{manifestSchema:"ae-agent-slideshow.v2",manifestSha256:hash,planSha256:hash,runtime:{gitCommit:"b".repeat(40),sourceSha256:hash}},requirements:[]};
  const receipt=writePackage(input,target,options);
  for(const entry of receipt.files)assert.strictEqual(require("../mcp-server/review-evidence").sha256(fs.readFileSync(path.join(target,entry.name))),entry.sha256);
  assert.throws(()=>writePackage(input,target,options),/already_exists/);
} finally {fs.rmSync(temp,{recursive:true,force:true});}
assert.throws(()=>packageReviewEvidence({events,seeds:{requestIds:["request-1"]},files:["private.aep"]},options));
assert.throws(()=>packageReviewEvidence({events,seeds:{requestIds:["request-1"]},provenance:{runtime:{}}},options));
assert.strictEqual(assessRequirements([{id:"source",expectedSourceId:"media-A"}],[{id:"source",sourceId:"media-B"}],[],"revision-B").status,"mismatch");
assert.strictEqual(assessRequirements([{id:"source",expectedSourceId:"media-A"}],[{id:"source",sourceId:"media-B"}],[{id:"source",from:"media-A",to:"media-B",revision:"revision-B",decisionId:"approved"}],"revision-B").status,"matched_with_override");
assert.strictEqual(assessRequirements([{id:"source",expectedSourceId:"media-A"}],[{id:"source",sourceId:"media-B"}],[{id:"source",from:"media-A",to:"media-B",revision:"revision-A",decisionId:"approved"}],"revision-B").status,"mismatch");
const audio=assessAudioCoverage({start:0,end:1},[{start:0,end:0.987}],{frameRate:30,sampleRate:48000});
assert.strictEqual(audio.status,"gap");assert.strictEqual(audio.cause,null);assert.strictEqual(audio.audibleImpact,null);assert(audio.missingSamples>0);
assert.strictEqual(assessAudioCoverage({start:0,end:1},[{start:0,end:1}],{frameRate:30,sampleRate:48000}).status,"covered");
assert.throws(()=>assessAudioCoverage({start:0,end:1},[],{frameRate:30}));
assert.strictEqual(buildRunOutcome({dryRun:true,executedCount:0,failedCount:0}).execution.status,"not_started");
assert.strictEqual(buildRunOutcome({executedCount:1,failedCount:1,steps:[{status:"completed"},{status:"failed"}]}).execution.status,"failed");
const passed=buildRunOutcome({executedCount:1,failedCount:0,steps:[{tool:"save_comp_frame_png",status:"completed"}],semanticVerification:{status:"passed",checks:[{passed:true}]}},{steps:[{tool:"save_comp_frame_png"}]});
assert.strictEqual(passed.execution.status,"completed");assert.strictEqual(passed.acceptance.status,"pending");assert.notStrictEqual(passed.acceptance.status,"accepted");
const gap=buildRunOutcome({executedCount:1,steps:[{tool:"set_effect_property",status:"completed"}],semanticVerification:{status:"needs_review"}});
assert.strictEqual(gap.verification.status,"insufficient");assert.strictEqual(gap.acceptance.status,"not_requested");
assert.strictEqual(buildRunOutcome({executedCount:1,semanticVerification:{status:"needs_review",checks:[{status:"failed"}]}}).verification.status,"failed");
assert.strictEqual(buildRunOutcome({executedCount:1,steps:[{tool:"run_extendscript",status:"completed"}],semanticVerification:{status:"passed",checks:[]}}).verification.status,"insufficient");
const identity=runtimeIdentity(require("path").resolve(__dirname,".."));assert.match(identity.sourceSha256,/^[a-f0-9]{64}$/);assert(!JSON.stringify(identity).includes("Users"));
const rawSteps=[{index:1,tool:"run_extendscript",args:{script:"saved=true"},mutatesProject:true,status:"completed",result:{saved:true,verification:{ok:true}}},{index:2,tool:"get_project_info",status:"completed",result:{file:"synthetic.aep",numItems:2}}];
assert.strictEqual(require("../mcp-server/semantic-verification").buildSemanticVerification({steps:rawSteps},{ok:true,dryRun:false,steps:rawSteps}).status,"needs_review","raw self-reported saved plus generic project readback is not semantic save proof");
const fixture=require("./slideshow-synthetic-fixture"),builder=require("../mcp-server/slideshow-plan-builder");
assert.throws(()=>builder.buildSlideshowPlan({...fixture.manifest,schema:"codx-133-build.v1"},fixture.articles,fixture.inventory),/schema/);
const built=builder.buildSlideshowPlan(fixture.manifest,fixture.articles,fixture.inventory);
assert(built.builderProvenance.manifestSha256);
for(const stage of built.stages)assert.strictEqual(require("../mcp-server/reuse-telemetry").summarizeRun({steps:[]},stage,[]).builderProvenance.contentMatches,true);
console.log(JSON.stringify({ok:true,groups:12,aeCommands:0,liveAeCalled:false,clientData:false}));
