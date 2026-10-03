"use strict";

// Read-only assembly of recorded claims and current file observations. No runner
// or provider import: this summary is never an execution/acceptance authority.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const records = require("./plan-run-records");
const responses = require("./plan-run-response");
const png = require("./generated-png-proof");
const SCHEMA = "ae-agent-task-completion.v1";
const MAX_RUNS = 32, MAX_ARTIFACTS = 64, MAX_FRAMES = 64;
const JSON_LIMIT = 1024 * 1024, ARTIFACT_LIMIT = 16 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const TASK = /^[a-z0-9][a-z0-9_-]{0,127}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const text = value => typeof value === "string" ? responses.truncateText(value, 240) : null;
const flag = value => typeof value === "boolean" ? value : null;
const fail = code => { throw Object.assign(new Error(code), {code}); };
function contained(root, file) {
  const relative = path.relative(path.resolve(root), path.resolve(file));
  if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) fail("path_containment_violation");
}
function timestamp(value) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    const date = new Date(value * 1000);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  return typeof value === "string" && ISO.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
}
function readBounded(root, file, limit) {
  contained(root, file);
  const real = records.containedFile(root, file);
  const before = fs.statSync(real);
  if (!before.isFile()) fail("evidence_not_file");
  if (before.size > limit) fail("evidence_budget_exceeded");
  const bytes = fs.readFileSync(real);
  const after = fs.statSync(real);
  if (!png.sameFileSnapshot(before, after, bytes.length)) fail("evidence_changed_during_read");
  return {bytes, sha256:hash(bytes), size:bytes.length};
}
function readJson(root, file) {
  try { return JSON.parse(readBounded(root, file, JSON_LIMIT).bytes.toString("utf8")); }
  catch (error) { if (error instanceof SyntaxError) fail("evidence_json_invalid"); throw error; }
}
function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(k => !["taskId","runIds","visualReview"].includes(k))) fail("completion_input_invalid");
  if (typeof input.taskId !== "string" || !TASK.test(input.taskId) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(input.taskId)) fail("task_id_invalid");
  if (!Array.isArray(input.runIds) || input.runIds.length > MAX_RUNS || input.runIds.some(id => typeof id !== "string" || !records.ID.test(id))) fail("run_ids_invalid");
  const ids = input.runIds.map(id => id.toLowerCase());
  if (new Set(ids).size !== ids.length) fail("duplicate_run_ids");
  return ids;
}
function loadConfiguredOptions(projectRoot) {
  const configDirectory = path.join(projectRoot, "config");
  const config = readJson(projectRoot, path.join(configDirectory, "agy-bridge.json"));
  const profile = config.profiles && config.profiles["ae-agent"];
  if (config.version !== 1 || !profile || typeof profile.workspace !== "string" || typeof profile.state_dir !== "string") fail("completion_profile_invalid");
  const workspace = path.resolve(configDirectory, profile.workspace);
  const metadataDir = path.resolve(configDirectory, profile.state_dir);
  contained(workspace, metadataDir);
  const logDir = process.env.AE_BRIDGE_LOG_DIR ? path.resolve(process.env.AE_BRIDGE_LOG_DIR) : path.join(projectRoot, "logs");
  const generatedExportDir = process.env.AE_AGENT_GENERATED_EXPORT_DIR ? path.resolve(process.env.AE_AGENT_GENERATED_EXPORT_DIR) : path.join(logDir, "generated-exports");
  return {workspace, metadataDir, logDir, generatedExportDir};
}
function unknownTransport() {
  return {source:"recorded_transport",fresh:false,status:"unknown",taskStatus:"unknown",terminalResultSeen:null,terminalResultValid:null,schemaValid:null,artifactVerification:null,error:null,
    reportedSummary:null,warnings:[],warningCount:null,claimsSource:"recorded_transport_claims",claimsTruncated:false,
    startedAt:null,finishedAt:null,lastEventAt:null,exitCode:null};
}
function readMetadata(taskId, options) {
  contained(options.workspace, options.metadataDir);
  // The configured state directory itself may be a junction.
  records.containedFile(options.workspace, options.metadataDir);
  const metadata = readJson(options.metadataDir, path.join(options.metadataDir, taskId + ".json"));
  if (!metadata || metadata.protocol_version !== 1 || metadata.task_id !== taskId || !metadata.request ||
      metadata.request.protocol_version !== 1 || metadata.request.task_id !== taskId || metadata.request.profile !== "ae-agent" ||
      metadata.profile !== undefined && metadata.profile !== "ae-agent" || typeof metadata.workspace !== "string" ||
      path.resolve(metadata.workspace) !== path.resolve(options.workspace)) fail("metadata_binding_mismatch");
  if (!Array.isArray(metadata.request.expected_artifacts) || metadata.request.expected_artifacts.length > MAX_ARTIFACTS) fail("expected_artifacts_invalid");
  const transport = {source:"recorded_transport",fresh:false,status:text(metadata.transport_status) || "unknown",taskStatus:text(metadata.task_status) || "unknown",
    terminalResultSeen:flag(metadata.terminal_result_seen),terminalResultValid:flag(metadata.terminal_result_valid),schemaValid:flag(metadata.schema_valid),
    artifactVerification:text(metadata.artifact_verification),error:text(metadata.error),startedAt:timestamp(metadata.started_at),finishedAt:timestamp(metadata.finished_at),
    lastEventAt:timestamp(metadata.last_event_at),exitCode:Number.isSafeInteger(metadata.exit_code) ? metadata.exit_code : null};
  const warnings = Array.isArray(metadata.warnings) ? metadata.warnings : [];
  transport.reportedSummary = text(metadata.summary);
  transport.warnings = warnings.slice(0,8).map(warning => text(warning) || "unstructured_recorded_warning");
  transport.warningCount = Array.isArray(metadata.warnings) ? warnings.length : null;
  transport.claimsSource = "recorded_transport_claims";
  transport.claimsTruncated = typeof metadata.summary === "string" && metadata.summary.length > 240 || warnings.length > 8 || warnings.some(warning => typeof warning !== "string" || warning.length > 240);
  return {metadata,transport};
}
function observeArtifact(artifact, options, observedAt) {
  const observation = {source:"current_disk",observedAt,status:"unknown",path:null,expectedCheck:null,bytes:null,sha256:null,changed:null,changeStatus:"unknown_no_before_proof"};
  if (!artifact || typeof artifact.path !== "string" || artifact.path.length > 1024 || artifact.scope !== "workspace" || !["exists","changed"].includes(artifact.check)) fail("expected_artifact_invalid");
  const file = path.resolve(options.workspace, artifact.path);
  contained(options.workspace, file);
  observation.path = path.relative(options.workspace,file).replace(/\\/g,"/");
  observation.expectedCheck = artifact.check;
  try {
    const current = readBounded(options.workspace,file,ARTIFACT_LIMIT);
    Object.assign(observation,{status:"present",bytes:current.size,sha256:current.sha256});
  } catch (error) {
    observation.status = error.code === "ENOENT" ? "missing" : "unknown";
    observation.errorCode = error.code || "artifact_read_failed";
  }
  return observation;
}
// Match the existing Python request_sha256 encoding (sorted keys, UTF-8,
// default JSON separators). This validates binding, not hostile state authorship.
function requestEncoding(value) {
  if (Array.isArray(value)) return "[" + value.map(requestEncoding).join(", ") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ": " + requestEncoding(value[k])).join(", ") + "}";
  return JSON.stringify(value);
}
function applyArtifactProof(observation, expected, metadata, options) {
  if (observation.status !== "present") return;
  const pairs = metadata.artifact_observations;
  if (!Array.isArray(pairs) || pairs.length !== metadata.request.expected_artifacts.length) return;
  const matching = pairs.filter(p => p && p.before && p.before.scope === expected.scope && p.before.path === expected.path);
  if (matching.length !== 1) return;
  const {before,after} = matching[0], requestSha = hash(Buffer.from(requestEncoding(metadata.request),"utf8"));
  if (metadata.request_sha256 !== requestSha || !before || !after) return;
  const started = metadata.executor_started_at, finished = metadata.finished_at;
  if (!Number.isFinite(metadata.started_at) || !Number.isFinite(started) || !Number.isFinite(finished) || finished < started) return;
  let real;
  try {real = records.containedFile(options.workspace,path.join(options.workspace,expected.path));} catch (_) {return;}
  for (const [phase,proof] of [["before",before],["after",after]]) {
    if (proof.schema !== "agy-bridge-artifact-observation.v1" || proof.source !== "bridge_disk" || proof.phase !== phase ||
        proof.task_id !== metadata.task_id || proof.request_sha256 !== requestSha || proof.scope !== expected.scope || proof.path !== expected.path ||
        proof.root !== path.resolve(options.workspace) || proof.resolved_path !== real || proof.proof_status !== "observed" || proof.error !== null ||
        typeof proof.exists !== "boolean" || !Number.isFinite(proof.observed_at) || proof.observed_at < metadata.started_at || proof.observed_at > finished) return;
    if (proof.exists ? !HASH.test(proof.sha256) || !Number.isSafeInteger(proof.bytes) || proof.bytes < 0 || proof.bytes > ARTIFACT_LIMIT : proof.sha256 !== null || proof.bytes !== null) return;
  }
  if (before.observed_at > started || after.observed_at < started || before.observed_at > after.observed_at ||
      after.exists !== true || after.sha256 !== observation.sha256 || after.bytes !== observation.bytes) return;
  observation.changed = before.exists !== after.exists || before.bytes !== after.bytes || before.sha256 !== after.sha256;
  observation.changeStatus = observation.changed ? "proven_recorded_before_after_current_match" : "proven_unchanged_current_match";
  observation.changeSource = "recorded_bridge_disk_observations";
  observation.beforeObservedAt = timestamp(before.observed_at);
  observation.afterObservedAt = timestamp(after.observed_at);
}
function aggregate(statuses, order, absent) {
  if (!statuses.length) return absent;
  for (const state of order) if (statuses.includes(state)) return state;
  return statuses.every(s => s === statuses[0]) ? statuses[0] : "partial";
}
function nativeState(outcome, dimension, allowed) {
  const state = outcome && outcome[dimension] && outcome[dimension].status;
  return allowed.includes(state) ? state : "unknown";
}
function readStepReceipt(runId, step, record, options) {
  const pageSize = responses.MAX_LIMIT_CHARS;
  const expected = step.evidenceArtifact;
  const page = responses.getPlanRunEvidence(options.logDir,{runId,stepIndex:step.index,offset:0,limitChars:pageSize});
  if (page.schema !== responses.PLAN_RUN_EVIDENCE_SCHEMA || page.runId !== runId || page.stepIndex !== step.index || page.artifactId !== expected.artifactId || page.sha256 !== expected.sha256 ||
      page.actionId !== ((record.run.provenance && record.run.provenance.actionId) || null) || page.fresh !== false || page.evidenceKind !== "recorded") fail("native_receipt_binding_mismatch");
  if (!Number.isSafeInteger(page.totalChars) || page.totalChars < 1 || page.totalChars > records.LIMIT || page.offset !== 0 || page.limitChars !== pageSize || typeof page.text !== "string" ||
      !page.text.length || page.text.length > pageSize || page.text.length > page.totalChars || page.nextOffset !== (page.text.length < page.totalChars ? page.text.length : null)) fail("native_receipt_page_mismatch");
  // The API validates the canonical hash and bindings. Read the server-derived
  // file once at its existing budget instead of rehashing it on every page.
  const current = readBounded(options.logDir,path.join(options.logDir,"verification-evidence",runId,step.index + ".json"),records.LIMIT);
  if (current.sha256 !== expected.sha256 || current.sha256 !== page.sha256) fail("native_receipt_hash_mismatch");
  const body = current.bytes.toString("utf8");
  if (body.length !== page.totalChars || !body.startsWith(page.text)) fail("native_receipt_page_mismatch");
  // Retain only the file-proof fields used by visual review. Diagnostic trees
  // remain recorded evidence and are never copied into the completion response.
  const receipt = JSON.parse(body), raw = receipt.result && receipt.result.file;
  const file = {};
  if (raw && typeof raw === "object") {
    for (const key of ["outputPath","outputFileName"]) if (typeof raw[key] === "string" && raw[key].length <= 1024) file[key] = raw[key];
    if (typeof raw.sha256 === "string" && HASH.test(raw.sha256)) file.sha256 = raw.sha256;
    for (const key of ["byteLength","width","height"]) if (Number.isSafeInteger(raw[key])) file[key] = raw[key];
    for (const key of ["pngComplete","existsAfter","deletedAfterReadBack"]) if (typeof raw[key] === "boolean") file[key] = raw[key];
  }
  return {runId,stepIndex:step.index,artifactId:page.artifactId,sha256:page.sha256,observedAt:timestamp(page.observedAt),file};
}
function nativeRun(runId, options) {
  const reference = {runId,source:"recorded_native_result",fresh:false,coverage:"provided_run_ids_only",binding:"dispatcher_supplied_run_id",status:"unknown",observedAt:null,sha256:null,outcome:null,error:null};
  try {
    const record = records.readRecord(options.logDir,runId,{throwOnError:true});
    const document = responses.getPlanRunEvidence(options.logDir,{runId,limitChars:1});
    if (document.sha256 !== hash(JSON.stringify(record))) fail("native_record_changed_during_read");
    reference.observedAt = timestamp(document.observedAt);
    reference.sha256 = document.sha256;
    const run = record.run;
    const summary = responses.projectPlanRunSummary(run);
    reference.outcome = summary.outcome;
    reference.semanticVerification = summary.semanticVerification;
    reference.recordedError = {code:summary.errorCode || null,message:summary.error || null};
    if (!Array.isArray(run.steps) || run.steps.length > 50) fail("native_steps_invalid");
    const receipts = new Map();
    const stepIds = new Set();
    for (const step of run.steps) {
      if (!step || !Number.isSafeInteger(step.index) || step.index < 1 || stepIds.has(step.index)) fail("native_step_identity_invalid");
      stepIds.add(step.index);
      if (step.evidenceArtifact) receipts.set(step.index,readStepReceipt(runId,step,record,options));
      else if (step.status === "completed") fail("native_step_receipt_missing");
    }
    const after = responses.getPlanRunEvidence(options.logDir,{runId,limitChars:1});
    if (after.sha256 !== document.sha256) fail("native_record_changed_during_read");
    reference.status = "verified_record";
    reference.error = {code:summary.errorCode || null,message:summary.error || null};
    reference.recordWarning = summary.recordWarning || null;
    reference.executedCount = summary.executedCount;
    reference.failedCount = summary.failedCount;
    reference.stepCount = run.steps.length;
    return {reference,record,receipts};
  } catch (error) {
    reference.error = {code:error.code || "native_evidence_invalid",message:text(error.message)};
    return {reference};
  }
}
function declaredVisualReview(review, taskId, native, options, observedAt) {
  const result = {status:"not_established",source:"dispatcher_declaration",machineProofOfViewing:false,completeTaskAcceptance:false,coverage:"provided_review_frames_only",reviewedAt:null,frames:[],errorCode:null};
  if (review === undefined) {result.source = "no_dispatcher_declaration"; return result;}
  try {
    if (!review || typeof review !== "object" || review.taskId !== taskId || review.reviewer !== "dispatcher" || typeof review.reviewedAt !== "string" || !ISO.test(review.reviewedAt) || !timestamp(review.reviewedAt) ||
        !Array.isArray(review.frames) || !review.frames.length || review.frames.length > MAX_FRAMES) fail("visual_review_invalid");
    const seen = new Set();
    result.reviewedAt = review.reviewedAt;
    for (const frame of review.frames) {
      const item = {runId:text(frame && frame.runId),stepIndex:frame && Number.isSafeInteger(frame.stepIndex) ? frame.stepIndex : null,sha256:text(frame && frame.sha256),status:"not_established",decision:null,source:"dispatcher_declared_recorded_frame",fileObservedAt:observedAt};
      result.frames.push(item);
      try {
        if (!frame || typeof frame.runId !== "string" || !records.ID.test(frame.runId) || !Number.isSafeInteger(frame.stepIndex) || frame.stepIndex < 1 || typeof frame.sha256 !== "string" || !HASH.test(frame.sha256) || !["accepted","needs_fix"].includes(frame.decision)) fail("visual_frame_invalid");
        const key = frame.runId.toLowerCase() + ":" + frame.stepIndex;
        if (seen.has(key)) fail("duplicate_visual_frame");
        seen.add(key);
        const run = native.find(row => row.reference.runId === frame.runId.toLowerCase());
        if (!run || !run.record || run.reference.status !== "verified_record") fail("visual_run_not_provided_or_verified");
        const step = run.record.run.steps.find(s => s.index === frame.stepIndex);
        const evidence = run.receipts.get(frame.stepIndex);
        if (!step || step.tool !== "save_comp_frame_png" || step.status !== "completed" || step.isError === true || !evidence) fail("visual_frame_receipt_invalid");
        const file = evidence.file;
        if (!file || file.pngComplete !== true || file.existsAfter !== true || file.deletedAfterReadBack === true || typeof file.outputPath !== "string" ||
            !Number.isSafeInteger(file.byteLength) || file.byteLength <= 0 || file.sha256 !== frame.sha256) fail("visual_frame_proof_invalid");
        const current = readBounded(options.generatedExportDir,path.resolve(options.generatedExportDir,file.outputPath),png.DEFAULT_MAX_PNG_BYTES);
        const proof = png.verifyCompletePngBuffer(current.bytes);
        if (!proof.ok || proof.sha256 !== frame.sha256 || proof.byteLength !== file.byteLength || proof.width !== file.width || proof.height !== file.height) fail("visual_frame_file_mismatch");
        item.status = "validated_declaration";
        item.decision = frame.decision;
        item.pngCompletionProof = "bounded_envelope_not_image_decode";
      } catch (error) {item.errorCode = error.code || "visual_frame_invalid";}
    }
    result.status = result.frames.some(f => f.status === "validated_declaration" && f.decision === "needs_fix") ? "needs_fix" :
      result.frames.every(f => f.status === "validated_declaration") ? "declared_accepted" : "not_established";
    if (result.frames.some(f => f.status !== "validated_declaration")) result.errorCode = "visual_frames_not_established";
  } catch (error) {result.errorCode = error.code || "visual_review_invalid";}
  return result;
}
function buildTaskCompletion(input, options) {
  const runIds = validateInput(input);
  if (!options || ["workspace","metadataDir","logDir","generatedExportDir"].some(k => typeof options[k] !== "string" || !path.isAbsolute(options[k]))) fail("completion_options_invalid");
  const generatedAt = new Date().toISOString();
  const blockers = [];
  const block = (code,source,id = null) => blockers.push({code,source,id});
  let transport = unknownTransport(), artifacts = [];
  try {
    const saved = readMetadata(input.taskId,options);
    transport = saved.transport;
    for (const expected of saved.metadata.request.expected_artifacts) {
      try {
        const artifact = observeArtifact(expected,options,generatedAt);
        applyArtifactProof(artifact,expected,saved.metadata,options);
        artifacts.push(artifact);
        if (artifact.status !== "present") block(artifact.errorCode || "artifact_missing","current_disk",artifact.path);
        else if (artifact.expectedCheck === "changed" && artifact.changed !== true) block("artifact_change_not_proven","current_disk",artifact.path);
      } catch (error) {block(error.code || "artifact_invalid","recorded_task_request");}
    }
    if (transport.status !== "completed" || transport.taskStatus !== "success" || transport.terminalResultSeen !== true || transport.terminalResultValid !== true || transport.schemaValid !== true) block("transport_not_verified_complete","recorded_transport");
  } catch (error) {
    transport.error = error.code === "ENOENT" ? "metadata_missing" : error.code || "metadata_invalid";
    block(transport.error,"recorded_transport");
  }
  const native = runIds.map(id => nativeRun(id,options));
  for (const row of native) if (row.reference.status !== "verified_record") block(row.reference.error.code,"recorded_native_result",row.reference.runId);
  const executions = [], mutations = [], technical = [];
  for (const {reference} of native) {
    const outcome = reference.outcome;
    const verified = reference.status === "verified_record";
    executions.push(verified ? nativeState(outcome,"execution",["completed","failed","partial","not_started","unknown"]) : "unknown");
    mutations.push(verified ? nativeState(outcome,"mutation",["applied","failed","partial","not_started","unknown"]) : "unknown");
    let state = verified ? nativeState(outcome,"verification",["passed","failed","pending","insufficient","not_required","not_requested","unknown"]) : "unknown";
    const semantic = reference.semanticVerification;
    if (state === "passed" && (!semantic || semantic.ok !== true || semantic.status !== "passed" || semantic.coverageStatus === "incomplete" || !semantic.totalChecks || semantic.unverifiedMutationCount > 0 || semantic.failedChecks > 0 || semantic.needsReviewChecks > 0)) state = "insufficient";
    technical.push(state);
    if (["failed","partial"].includes(executions[executions.length - 1])) block("native_execution_" + executions[executions.length - 1],"recorded_native_result",reference.runId);
    if (["failed","unknown","pending","insufficient"].includes(state)) block("native_verification_" + state,"recorded_native_result",reference.runId);
    if (reference.recordWarning) block(reference.recordWarning,"recorded_native_result",reference.runId);
  }
  const visualAcceptance = declaredVisualReview(input.visualReview,input.taskId,native,options,generatedAt);
  if (visualAcceptance.errorCode || visualAcceptance.status === "needs_fix") block(visualAcceptance.errorCode || "visual_needs_fix","dispatcher_declaration");
  const execution = {status:aggregate(executions,["unknown","failed","partial"],"unknown"),mutationStatus:aggregate(mutations,["unknown","failed","partial"],"unknown"),source:"recorded_native_result",fresh:false,coverage:"provided_run_ids_only"};
  const technicalVerification = {status:aggregate(technical,["unknown","failed","pending","insufficient","partial"],"not_requested"),source:"recorded_native_result",fresh:false,coverage:"provided_run_ids_only"};
  const nextAction = execution.mutationStatus === "unknown" || execution.status === "unknown" ? "read_only_reconciliation" :
    blockers.length ? "inspect_missing_or_failed_evidence" : visualAcceptance.status === "not_established" ? "review_frames" : "continue_verified_remaining_work";
  return {schema:SCHEMA,taskId:input.taskId,generatedAt,isError:blockers.length > 0,coverage:"provided_run_ids_only",completeTaskAcceptance:false,
    transport,execution,technicalVerification,visualAcceptance,artifacts,nativeRuns:native.map(row => row.reference),usage:{status:"unknown",reasonCode:"usage_not_loaded"},blockers,nextAction};
}
module.exports = {SCHEMA,MAX_RUNS,MAX_ARTIFACTS,MAX_FRAMES,JSON_LIMIT,validateInput,readJson,loadConfiguredOptions,buildTaskCompletion};
