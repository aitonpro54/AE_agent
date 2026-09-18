"use strict";
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  if (value === undefined || typeof value === "number" && !Number.isFinite(value)) throw new Error("evidence_value_not_serializable");
  return JSON.stringify(value);
}
function sha256(value) { return crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : canonical(value)).digest("hex"); }
function required(value, label) { if (typeof value !== "string" || !value.trim()) throw new Error(`evidence_${label}_required`); return value; }
function binding(value, label) {
  if (!value || typeof value !== "object") throw new Error(`evidence_${label}_required`);
  for (const key of ["projectId","projectRevision","actionId","runId"]) required(value[key],key);
  if (!Number.isInteger(value.proposalRevision) || value.proposalRevision < 1 || !Number.isInteger(value.stepIndex) || value.stepIndex < 1) throw new Error("evidence_revision_step_required");
  return value;
}
function createVerificationEvidence(input) {
  required(input.id,"id");
  if (!["direct-read-back","post-repair-recomposition"].includes(input.kind)) throw new Error("evidence_kind_invalid");
  const subject=binding(input.subject,"subject"), observed=binding(input.observed,"observed");
  if (input.id === subject.runId || input.id === observed.runId) throw new Error("evidence_identity_must_be_distinct");
  if (subject.projectId !== observed.projectId) throw new Error("evidence_project_mismatch");
  if (subject.projectRevision !== observed.projectRevision) {
    const accepted=input.acceptedRevision;
    if (!accepted || accepted.from !== subject.projectRevision || accepted.to !== observed.projectRevision || !accepted.decisionId) throw new Error("evidence_state_revision_mismatch");
  }
  if (!Number.isFinite(Date.parse(observed.observedAt)) || !observed.audit || typeof observed.audit !== "object") throw new Error("evidence_audit_required");
  let repair=null;
  if (input.kind === "post-repair-recomposition") {
    repair=binding(input.repair,"repair");
    if (repair.projectId !== observed.projectId || repair.projectRevision !== observed.projectRevision || repair.runId === subject.runId) throw new Error("evidence_repair_binding_mismatch");
  }
  // Never change or relabel the subject run. This is a new observation, not a repaired history.
  const record={schema:"ae-agent-verification-evidence.v1",id:input.id,kind:input.kind,subject:{...subject},repair:repair?{...repair}:null,observed:{...observed},auditSha256:sha256(observed.audit),acceptedRevision:input.acceptedRevision||null,acceptance:{status:"not_requested",scope:"none",reasonCode:"no_independent_acceptance_evidence"}};
  return JSON.parse(JSON.stringify(record));
}

const LINK_KEYS = new Set(["requestId","actionId","parentActionId","proposalId","runId","subjectRunId","verificationSubjectRunId","repairRunId","evidenceRunId","commandId","toolCallId","sessionId","editSessionId","checkpointId","checkpointFile","artifactId","artifactFile"]);
function links(value, result=new Set()) {
  if (Array.isArray(value)) value.forEach(item=>links(item,result));
  else if (value && typeof value === "object") for (const [key,item] of Object.entries(value)) {
    if (LINK_KEYS.has(key) && typeof item === "string" && item) result.add(item);
    else if (item && typeof item === "object") links(item,result);
  }
  return result;
}
function linkedEventSlice(events,seeds) {
  if (!Array.isArray(events)) throw new Error("evidence_events_required");
  const selected=new Set(), known=new Set(), secondary=new Set();
  for (const key of ["requestIds","actionIds","runIds"]) for (const id of seeds && seeds[key] || []) known.add(required(id,"seed"));
  if (!known.size) throw new Error("evidence_explicit_seed_required");
  const secondaryKeys=new Set(["sessionId","editSessionId","checkpointId","checkpointFile","artifactId","artifactFile"]);
  const indexes=events.map(event=>{
    const ids=new Set(),other=new Set(),details=event.details||{};
    function collect(value){if(Array.isArray(value))value.forEach(collect);else if(value&&typeof value==="object")for(const [key,item] of Object.entries(value)){if(LINK_KEYS.has(key)&&typeof item==="string"&&item)(secondaryKeys.has(key)?other:ids).add(item);else if(item&&typeof item==="object")collect(item);}}
    collect(event);
    // Existing logs used id for command/tool records; read these without rewriting history.
    if (/^(?:ae_command_|tool_call_)/.test(event.type||"") && details.id) ids.add(details.id);
    return {ids,other};
  });
  let changed=true;
  while(changed) { changed=false; indexes.forEach(({ids,other},index)=>{
    if(selected.has(index))return;
    const primaryMatch=[...ids].some(id=>known.has(id));
    const receipt=/checkpoint|artifact|file_proof|^edit_(?:session_)?(?:start|complete|finish)/.test(events[index].type||"");
    const secondaryMatch=[...other].some(id=>secondary.has(id)) && (receipt || ids.size===0);
    if(primaryMatch||secondaryMatch){selected.add(index);if(primaryMatch)ids.forEach(id=>known.add(id));other.forEach(id=>secondary.add(id));changed=true;}
  }); }
  return events.filter((event,index)=>selected.has(index)).map(event=>JSON.parse(JSON.stringify(event)));
}

const SECRET_KEY=/(?:password|passwd|secret|api.?key|access.?token|authorization|credential|username|user.?name)/i;
const PATH_PATTERN=/(?:[A-Za-z]:[\\/]|\\\\[^\s\\]+[\\/]|(?:^|[\s"'=(])\/(?!\/)[^\s"')]+\/|%USERPROFILE%|~[\\/])/i;
const SECRET_PATTERN=/(?:\b(?:Bearer|Basic)\s+\S+|\bsk-[a-zA-Z0-9_-]{12,}|\bAIza[a-zA-Z0-9_-]{20,}|(?:API_KEY|OPENAI_KEY|TOKEN|PASSWORD|SECRET)\s*[=:]\s*["']?\S+)/i;
const RESIDUAL_PATTERN=/(?:\[(?:REDACTED|CLIENT|PRIVATE)[^\]]*\]|<(?:redacted|client|private)[^>]*>)[\\/\w .-]+/i;
function reasons(text,options) {
  const result=[];
  if(PATH_PATTERN.test(text))result.push("absolute_path");
  if(SECRET_PATTERN.test(text))result.push("secret");
  if(RESIDUAL_PATTERN.test(text))result.push("residual_path_fragment");
  if((options.sensitiveFragments||[]).some(fragment=>fragment && text.toLowerCase().includes(String(fragment).toLowerCase())))result.push("sensitive_fragment");
  return result;
}
function token(value) {return `<redacted:${sha256(String(value)).slice(0,16)}>`;}
function isToken(value) {return /^<redacted:[a-f0-9]{16}>$/.test(value);}
function sanitizeEvidence(value, options={}, key="") {
  if (SECRET_KEY.test(key) && value !== null) return token(typeof value==="string"?value:canonical(value));
  if (typeof value === "string") {
    if(isToken(value))return value;
    try {const parsed=JSON.parse(value);if(parsed && typeof parsed==="object")return JSON.stringify(sanitizeEvidence(parsed,options));}catch(_){}
    return reasons(value,options).length ? token(value) : value;
  }
  if(Array.isArray(value))return value.map(item=>sanitizeEvidence(item,options));
  if(value && typeof value==="object")return Object.fromEntries(Object.entries(value).map(([name,item])=>[reasons(name,options).length?token(name):name,sanitizeEvidence(item,options,name)]));
  return value;
}
function findLeaks(value,options={},location="$",result=[]) {
  if(typeof value==="string" && !isToken(value)) {
    for(const reason of reasons(value,options))result.push({location,reason});
    try{const parsed=JSON.parse(value);if(parsed&&typeof parsed==="object")findLeaks(parsed,options,`${location}.decoded`,result);}catch(_){}
  } else if(Array.isArray(value))value.forEach((item,index)=>findLeaks(item,options,`${location}[${index}]`,result));
  else if(value&&typeof value==="object")for(const [key,item] of Object.entries(value)) {
    if(SECRET_KEY.test(key)&&item!==null&&!isToken(item))result.push({location:`${location}.${key}`,reason:"sensitive_field"});
    for(const reason of reasons(key,options))result.push({location,reason});
    findLeaks(item,options,`${location}.${key}`,result);
  }
  return result;
}

function assessRequirements(requirements,manifest,overrides,revision) {
  required(revision,"requirements_revision");
  const mismatches=[],applied=[];
  for(const requirement of requirements) {
    const rows=manifest.filter(row=>row.id===requirement.id),actual=rows.length===1?rows[0].sourceId:null;
    if(actual===requirement.expectedSourceId)continue;
    const decisions=overrides.filter(row=>row.id===requirement.id&&row.from===requirement.expectedSourceId&&row.to===actual&&row.revision===revision&&row.decisionId);
    if(decisions.length===1)applied.push({...decisions[0]});else mismatches.push({id:requirement.id,expectedSourceId:requirement.expectedSourceId,actualSourceId:actual});
  }
  return {status:mismatches.length?"mismatch":applied.length?"matched_with_override":"matched",revision,mismatches,overrides:applied,acceptance:"not_established"};
}
function assessAudioCoverage(expected,actual,{frameRate,sampleRate}={}) {
  if(!Number.isFinite(frameRate)||frameRate<=0||!Number.isFinite(sampleRate)||sampleRate<=0||![expected.start,expected.end].every(Number.isFinite)||expected.end<=expected.start)throw new Error("audio_interval_and_timebases_required");
  const intervals=actual.map(row=>{if(![row.start,row.end].every(Number.isFinite)||row.end<=row.start)throw new Error("audio_interval_invalid");return row;}).sort((a,b)=>a.start-b.start);
  const gaps=[];let cursor=expected.start;
  for(const interval of intervals){if(interval.end<=cursor)continue;if(interval.start>cursor)gaps.push({start:cursor,end:Math.min(interval.start,expected.end)});cursor=Math.max(cursor,Math.min(interval.end,expected.end));if(cursor>=expected.end)break;}
  if(cursor<expected.end)gaps.push({start:cursor,end:expected.end});
  const missingSeconds=gaps.reduce((sum,gap)=>sum+gap.end-gap.start,0);
  const missingSamples=gaps.reduce((sum,gap)=>sum+Math.max(0,Math.ceil(gap.end*sampleRate-1e-7)-Math.ceil(gap.start*sampleRate-1e-7)),0);
  return {status:missingSeconds>1e-9?"gap":"covered",expected,frameRate,sampleRate,gaps,missingSeconds,missingSamples,cause:null,audibleImpact:null,acceptance:"not_established"};
}

function runtimeIdentity(root) {
  const files=["mcp-server/bridge-daemon.js","mcp-server/semantic-verification.js","mcp-server/slideshow-tools.js","mcp-server/slideshow-plan-builder.js","mcp-server/slideshow-manifest.js","mcp-server/review-evidence.js","mcp-server/run-outcome.js"];
  const modules=files.map(name=>({name,sha256:sha256(fs.readFileSync(path.join(root,name)))}));
  let gitCommit=null;try{gitCommit=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8",windowsHide:true,stdio:["ignore","pipe","ignore"]}).trim();}catch(_){}
  return {schema:"ae-agent-runtime-identity.v1",gitCommit,sourceSha256:sha256(modules),modules};
}

function writeStepEvidence(logDirectory, record) {
  if(!record || !/^[a-f0-9-]{16,64}$/i.test(record.runId||"") || !Number.isInteger(record.stepIndex) || record.stepIndex<1)throw new Error("evidence_artifact_identity_invalid");
  const artifactId=`${record.runId}-step-${record.stepIndex}`,directory=path.join(logDirectory,"verification-evidence",record.runId);
  const artifactFile=path.join(directory,`${record.stepIndex}.json`);
  const body=canonical({schema:"ae-agent-step-evidence.v1",...record});
  fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(artifactFile,body,{encoding:"utf8",flag:"wx"});
  return {artifactId,artifactFile,sha256:sha256(body),bytes:Buffer.byteLength(body)};
}

// Package only machine evidence. Client media, free-form documents, JSX and arbitrary files have no inclusion route.
const EVENT_FIELDS=new Set([...LINK_KEYS,"stepIndex","status","ok","code","errorCode","sha256","planSha256","auditSha256","revision","proposalRevision","projectRevision"]);
function eventProjection(event) {
  function project(value){if(!value||typeof value!=="object")return {};return Object.fromEntries(Object.entries(value).filter(([key])=>EVENT_FIELDS.has(key)).map(([key,item])=>[key,LINK_KEYS.has(key)?token(item):item]));}
  const details={...(event.details||event)};
  if(/^ae_command_/.test(event.type||"")&&details.id)details.commandId=details.id;
  if(/^tool_call_/.test(event.type||"")&&details.id)details.toolCallId=details.id;
  return {timestamp:event.timestamp||event.at||null,type:event.type,details:project(details)};
}
function packageReviewEvidence(input,options={}) {
  const allowed=new Set(["events","seeds","verifications","provenance","requirements"]);
  if(Object.keys(input).some(key=>!allowed.has(key)))throw new Error("evidence_package_field_not_allowlisted");
  const provenance=input.provenance;
  if(!provenance || !provenance.manifestSchema || !/^[a-f0-9]{64}$/i.test(provenance.manifestSha256||"") || !/^[a-f0-9]{64}$/i.test(provenance.planSha256||"") || !provenance.runtime || !/^[a-f0-9]{64}$/i.test(provenance.runtime.sourceSha256||""))throw new Error("evidence_reproducibility_provenance_missing");
  const events=linkedEventSlice(input.events,input.seeds).map(eventProjection);
  const verification=(input.verifications||[]).map(record=>{
    if(record.schema!=="ae-agent-verification-evidence.v1"||sha256(record.observed.audit)!==record.auditSha256)throw new Error("evidence_audit_hash_mismatch");
    const checked=createVerificationEvidence(record);
    const compactBinding=(row)=>row?{projectId:token(row.projectId),projectRevision:token(row.projectRevision),actionId:token(row.actionId),proposalRevision:row.proposalRevision,runId:token(row.runId),stepIndex:row.stepIndex,status:row.status||null}:null;
    return {id:token(checked.id),kind:checked.kind,subject:compactBinding(checked.subject),repair:compactBinding(checked.repair),observed:compactBinding(checked.observed),auditSha256:checked.auditSha256,acceptance:checked.acceptance};
  });
  const files={"events.json":events,"verification.json":verification,"provenance.json":{manifestSchema:provenance.manifestSchema,manifestSha256:provenance.manifestSha256,planSha256:provenance.planSha256,runtime:{gitCommit:provenance.runtime.gitCommit||null,sourceSha256:provenance.runtime.sourceSha256}},"requirements.json":(input.requirements||[]).map(row=>({id:token(row.id),status:row.status,acceptance:"not_established"}))};
  const sanitized=sanitizeEvidence(files,options);
  if(findLeaks(sanitized,options).length)throw new Error("evidence_package_leak_detected");
  const manifest={schema:"ae-agent-review-package.v1",eventCount:events.length,completeClientAcceptance:false,payloadPolicy:"allowlisted_machine_metadata_only; raw payloads and client artifacts excluded",files:Object.entries(sanitized).map(([name,value])=>({name,sha256:sha256(canonical(value))}))};
  return {manifest,files:sanitized};
}
module.exports={canonical,sha256,createVerificationEvidence,linkedEventSlice,sanitizeEvidence,findLeaks,packageReviewEvidence,assessRequirements,assessAudioCoverage,runtimeIdentity,writeStepEvidence};
