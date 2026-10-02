"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const planRunRecords = require("./plan-run-records");

const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const PLAN_RUN_SUMMARY_SCHEMA = "ae-agent-plan-run-summary.v1";
const PLAN_RUN_EVIDENCE_SCHEMA = "ae-agent-plan-run-evidence.v1";
const DEFAULT_LIMIT_CHARS = 6000;
const MAX_LIMIT_CHARS = 12000;
const FILE_SIZE_LIMIT = 16 * 1024 * 1024;

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function assertValidResponseView(view) {
  if (view === undefined || view === null) return "full";
  if (typeof view !== "string" || !["full", "summary"].includes(view)) {
    throw Object.assign(new Error("responseView must be 'summary' or 'full'."), { code: "response_view_invalid" });
  }
  return view;
}

function truncateText(value, maxChars) {
  if (value === null || value === undefined) return null;
  const str = String(value);
  if (str.length <= maxChars) return str;
  const suffix = "...<truncated>";
  let end = Math.max(0, maxChars - suffix.length);
  if (end > 0 && isHighSurrogate(str.charCodeAt(end - 1)) && isLowSurrogate(str.charCodeAt(end))) end--;
  return `${str.slice(0, end)}${suffix}`;
}

function compactSemanticVerification(sv) {
  if (!sv || typeof sv !== "object") return null;
  const checks = Array.isArray(sv.checks) ? sv.checks : [];
  const failed = checks.filter((c) => c && (c.passed === false || c.status === "failed" || c.ok === false));
  const noteworthy = checks.filter(c => c && (c.status !== "passed" && c.passed !== true || c.passed === false));
  return {
    status: sv.status || null,
    ok: typeof sv.ok === "boolean" ? sv.ok : null,
    unverifiedMutationCount: Number(sv.unverifiedMutationCount || 0),
    totalChecks: checks.length,
    passedChecks: sv.passedChecks ?? checks.filter(c => c && (c.status === "passed" || c.passed === true)).length,
    failedChecks: sv.failedChecks ?? failed.length,
    needsReviewChecks: sv.needsReviewChecks ?? checks.filter(c => c && c.status === "needs_review").length,
    coverageStatus: sv.coverageStatus || null,
    readBackCount: sv.readBackCount ?? null,
    mutationVerificationCount: sv.mutationVerificationCount ?? null,
    excerptCount: Math.min(noteworthy.length, 3),
    truncated: noteworthy.length > 3,
    failureExcerpt: noteworthy.length
      ? noteworthy.slice(0, 3).map((c) => ({
          id: truncateText(c.id, 80), title: truncateText(c.title, 120), status: c.status || null,
          tool: c.tool || null,
          scope: c.scope || null,
          reason: truncateText(c.reason || c.error || c.evidence || "verification_check_failed", 240)
        }))
      : null,
    warningCount: Array.isArray(sv.warnings) ? sv.warnings.length : 0,
    warnings: Array.isArray(sv.warnings) ? sv.warnings.slice(0, 3).map(w => truncateText(w, 200)) : []
  };
}

// Arbitrary native payloads are never copied into these bounded dimensions.
function scalarFields(value, keys, maxChars = 160) {
  if (!value || typeof value !== "object") return null;
  const result = {};
  for (const key of keys) {
    const item = value[key];
    if (typeof item === "string") { result[key] = truncateText(item, maxChars); if (item.length > maxChars) result.truncated = true; }
    else if (typeof item === "boolean" || typeof item === "number" && Number.isFinite(item)) result[key] = item;
  }
  return result;
}
function compactOutcome(outcome) {
  if (!outcome || typeof outcome !== "object") return null;
  const result = {};
  for (const key of ["execution", "mutation", "verification", "coverage", "acceptance"]) {
    if (!outcome[key]) continue;
    result[key] = scalarFields(outcome[key], ["status", "scope", "reasonCode", "count"]);
    if (outcome[key].counts) result[key].counts = scalarFields(outcome[key].counts, ["applied", "unknown", "failed", "not_started"]);
    if (outcome[key].originalError) result[key].originalError = typeof outcome[key].originalError === "string" ? truncateText(outcome[key].originalError, 300) : scalarFields(outcome[key].originalError, ["code", "message"], 300);
    if (Array.isArray(outcome[key].steps)) {
      result[key].stepCount = outcome[key].steps.length;
      result[key].truncated = outcome[key].steps.length > 0;
    }
  }
  return result;
}

function compactStepSummary(step, runId) {
  if (!step || typeof step !== "object") return step;
  const isErr = Boolean(step.isError || step.status === "failed" || step.status === "blocked");
  const rawErr = step.error || (step.result && step.result.error) || null;
  const errStr = rawErr ? truncateText(String(rawErr), 300) : null;
  const truncated = Boolean((rawErr && String(rawErr).length > 300) || step.resultTruncated);

  let resultRef = null;
  if (step.result && typeof step.result === "object" && !Array.isArray(step.result)) {
    resultRef = { ok: typeof step.result.ok === "boolean" ? step.result.ok : step.status === "completed" ? !isErr : null };
    for (const key of ["comp", "layer", "source"]) {
      if (step.result[key]) resultRef[key] = scalarFields(step.result[key], ["itemId", "id", "itemIndex", "index", "name"], 60);
    }
    if (step.result.layer && step.result.layer.source) resultRef.source = scalarFields(step.result.layer.source, ["itemId", "itemIndex", "name"], 60);
    if (step.result.postVerification && step.result.postVerification.ok !== undefined) {
      resultRef.postVerification = { ok: Boolean(step.result.postVerification.ok) };
    }
    if (step.result.file && (step.result.file.outputFileName || step.result.file.sha256)) {
      resultRef.file = {
        outputFileName: truncateText(step.result.file.outputFileName, 120),
          sha256: truncateText(step.result.file.sha256, 64)
      };
    }
  } else if (step.result !== undefined && step.result !== null) {
    resultRef = { ok: step.status === "completed" ? !isErr : null };
  }

  const evidence = step.evidenceArtifact
    ? {
        artifactId: step.evidenceArtifact.artifactId,
        sha256: step.evidenceArtifact.sha256
      }
    : null;

  const res = {
    index: step.index,
    tool: step.tool || null,
    status: step.status || "unknown",
    mutatesProject: Boolean(step.mutatesProject),
    durationMs: Number(step.durationMs || 0)
  };

  if (step.title) res.title = truncateText(step.title, 30);
  if (step.errorCode) res.errorCode = step.errorCode;
  if (step.reason) res.reason = truncateText(step.reason, 240);
  if (step.recordWarning) res.recordWarning = truncateText(step.recordWarning, 160);
  if (errStr) res.error = errStr;
  if (truncated) res.truncated = true;
  if (evidence) res.evidence = evidence;
  if (resultRef) res.resultRef = resultRef;

  return res;
}

function projectPlanRunSummary(run) {
  if (!run || typeof run !== "object") return run;
  const actionId =
    (run.provenance && run.provenance.actionId) ||
    (run.m100Action && run.m100Action.actionId) ||
    null;
  const requestId = (run.m100Message && run.m100Message.requestId) || null;

  const steps = Array.isArray(run.steps) ? run.steps : [];
  const compactSteps = steps.map((step) => compactStepSummary(step, run.id));

  const summary = {
    schema: PLAN_RUN_SUMMARY_SCHEMA,
    id: run.id,
    responseView: "summary",
    actionId,
    requestId,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt || null,
    ok: Boolean(run.ok),
    dryRun: Boolean(run.dryRun),
    confirm: Boolean(run.confirm),
    allowMutations: Boolean(run.allowMutations),
    autoEditSession: Boolean(run.autoEditSession),
    executedCount: Number(run.executedCount || 0),
    skippedCount: Number(run.skippedCount || 0),
    failedCount: Number(run.failedCount || 0),
    errorCode: run.errorCode || null,
    error: run.error ? truncateText(run.error, 400) : null,
    recoveryHint: run.recoveryHint ? truncateText(run.recoveryHint, 400) : null,
    repairDirective: scalarFields(run.repairDirective, ["eligible", "rootActionId", "parentActionId", "attempt", "maxAttempts", "disposition", "reason", "automaticReplayAllowed", "action", "runId"], 240),
    recordWarning: truncateText(run.recordWarning, 160),
    telemetryWarning: truncateText(run.telemetryWarning, 160),
    warnings: Array.isArray(run.warnings) ? run.warnings.slice(0, 3).map(w => truncateText(w, 200)) : [],
    warningCount: Array.isArray(run.warnings) ? run.warnings.length : 0,
    provenance: run.provenance
      ? {
          schema: run.provenance.schema,
          actionId: run.provenance.actionId || null,
          proposalRevision: run.provenance.proposalRevision || null,
          projectId: run.provenance.projectId || null,
          projectRevision: run.provenance.projectRevision || null,
          projectRevisionReason: run.provenance.projectRevisionReason || null,
          planSha256: run.provenance.planSha256 || null,
          runtime: run.provenance.runtime
            ? {
                gitCommit: run.provenance.runtime.gitCommit || null,
                sourceSha256: run.provenance.runtime.sourceSha256 || null
              }
            : null
        }
      : null,
    safety: run.safety
      ? {
          mutatingExecution: Boolean(run.safety.mutatingExecution),
          checkpointStepPresent: Boolean(run.safety.checkpointStepPresent),
          activeEditSessionAtStart: Boolean(run.safety.activeEditSessionAtStart),
          autoEditSession: Boolean(run.safety.autoEditSession),
          allowWithoutCheckpoint: Boolean(run.safety.allowWithoutCheckpoint),
          allowRawExtendscript: Boolean(run.safety.allowRawExtendscript),
          protection: run.safety.protection || null,
          status: run.safety.status || null
        }
      : null,
    editSession: run.editSession
      ? {
          id: run.editSession.id,
          status: run.editSession.status
        }
      : null,
    checkpoint: run.checkpoint
      ? {
          label: run.checkpoint.label || null,
          sourceFile: run.checkpoint.sourceFile || null,
          checkpointFile: run.checkpoint.checkpointFile || null
        }
      : null,
    outcome: compactOutcome(run.outcome),
    semanticVerification: compactSemanticVerification(run.semanticVerification),
    solutionPlanPreflight: run.solutionPlanPreflight
      ? { status: run.solutionPlanPreflight.status }
      : null,
    solutionPlanReadBack: run.solutionPlanReadBack
      ? { status: run.solutionPlanReadBack.status }
      : null,
    solutionReuse: run.solutionReuse
      ? { builderProvenance: scalarFields(run.solutionReuse.builderProvenance, ["status", "templateId", "solutionId", "planSha256"]) }
      : null,
    m100Action: run.m100Action
      ? {
          actionId: run.m100Action.actionId,
          riskLevel: run.m100Action.riskLevel,
          confirmationState: run.m100Action.confirmationState
        }
      : null,
    m100Message: run.m100Message
      ? {
          ok: run.m100Message.ok,
          actionId: run.m100Message.actionId,
          summary: truncateText(run.m100Message.summary, 300),
          code: run.m100Message.code
        }
      : null,
    steps: compactSteps,
    evidenceReference: {
      runId: run.id,
      totalSteps: compactSteps.length
    }
  };
  for (const key of ["errorCode", "error", "recoveryHint", "repairDirective", "recordWarning", "telemetryWarning", "checkpoint", "editSession", "m100Action", "m100Message", "solutionPlanPreflight", "solutionPlanReadBack", "solutionReuse"]) {
    if (summary[key] === null) delete summary[key];
  }
  if (run.error && String(run.error).length > 400 || run.recoveryHint && String(run.recoveryHint).length > 400) summary.truncated = true;
  if (run.validation && run.validation.ok === false) {
    const errors = Array.isArray(run.validation.errors) ? run.validation.errors : [];
    summary.validation = {ok:false, errorCount:errors.length, truncated:errors.length > 3,
      errorExcerpt:errors.slice(0,3).map(error => typeof error === "string" ? truncateText(error,240) : scalarFields(error,["index","tool","code","errorCode","message","error","reason"],240))};
  }
  return summary;
}

function isHighSurrogate(code) {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code) {
  return code >= 0xdc00 && code <= 0xdfff;
}

function safeCharSlice(str, start, length) {
  if (typeof str !== "string") return "";
  let s = Math.max(0, start);
  if (s >= str.length) return "";
  let e = Math.min(str.length, s + length);

  if (s > 0 && isLowSurrogate(str.charCodeAt(s)) && isHighSurrogate(str.charCodeAt(s - 1))) {
    throw Object.assign(new Error("offset_surrogate_boundary_invalid"), {code: "offset_surrogate_boundary_invalid"});
  }
  if (e < str.length && isHighSurrogate(str.charCodeAt(e - 1)) && isLowSurrogate(str.charCodeAt(e))) {
    // Ordinary pages stay within their requested UTF-16 budget. A one-unit
    // request at a two-unit character consumes that whole character atomically.
    e += e - s === 1 ? 1 : -1;
  }
  return str.slice(s, e);
}

function getPlanRunEvidence(logDir, args) {
  const rawId = args && args.runId;
  if (typeof rawId !== "string" || !ID.test(rawId)) {
    throw Object.assign(new Error("plan_run_id_invalid"), { code: "plan_run_id_invalid" });
  }
  const runId = rawId;

  let stepIndex = null;
  if (args && args.stepIndex !== undefined) {
    const rawStep = args.stepIndex;
    if (!Number.isSafeInteger(rawStep) || rawStep < 1) {
      throw Object.assign(new Error("step_index_invalid"), { code: "step_index_invalid" });
    }
    stepIndex = rawStep;
  }

  let offset = 0;
  if (args && args.offset !== undefined) {
    const rawOffset = args.offset;
    if (!Number.isSafeInteger(rawOffset) || rawOffset < 0) {
      throw Object.assign(new Error("offset_invalid"), { code: "offset_invalid" });
    }
    offset = rawOffset;
  }

  let limitChars = DEFAULT_LIMIT_CHARS;
  if (args && args.limitChars !== undefined) {
    const rawLimit = args.limitChars;
    if (!Number.isSafeInteger(rawLimit) || rawLimit < 1 || rawLimit > MAX_LIMIT_CHARS) {
      throw Object.assign(new Error("limit_chars_invalid"), { code: "limit_chars_invalid" });
    }
    limitChars = rawLimit;
  }

  const record = planRunRecords.readRecord(logDir, runId, {throwOnError: true});
  const computedRunHash = sha256(JSON.stringify(record));

  if (stepIndex === null) {
    const fullDocText = JSON.stringify(record);
    const docSha256 = computedRunHash;
    const observedAt =
      record.createdAt ||
      (record.run && record.run.startedAt) ||
      null;
    const actionId =
      (record.run && record.run.provenance && record.run.provenance.actionId) ||
      null;

    const totalChars = fullDocText.length;
    const pageText = safeCharSlice(fullDocText, offset, limitChars);
    const nextOffset = offset + pageText.length < totalChars ? offset + pageText.length : null;

    return {
      schema: PLAN_RUN_EVIDENCE_SCHEMA,
      runId,
      stepIndex: null,
      actionId,
      artifactId: null,
      observedAt,
      sha256: docSha256,
      text: pageText,
      offset,
      limitChars,
      nextOffset,
      totalChars,
      fresh: false,
      evidenceKind: "recorded"
    };
  }

  const steps = Array.isArray(record.run.steps) ? record.run.steps : [];
  const step = steps.find((s) => s && s.index === stepIndex);
  if (!step) {
    throw Object.assign(new Error("step_not_found"), { code: "step_not_found" });
  }

  if (!step.evidenceArtifact || !step.evidenceArtifact.sha256) {
    throw Object.assign(new Error("step_evidence_missing"), { code: "step_evidence_missing" });
  }
  const expectedArtifactSha256 = step.evidenceArtifact.sha256;
  const artifactId = step.evidenceArtifact.artifactId;
  if (artifactId !== `${runId}-step-${stepIndex}`) {
    throw Object.assign(new Error("step_evidence_binding_mismatch"), {code: "step_evidence_binding_mismatch"});
  }

  const stepDir = path.resolve(logDir, "verification-evidence", runId);
  const stepFile = path.resolve(stepDir, `${stepIndex}.json`);

  if (!fs.existsSync(stepFile)) {
    throw Object.assign(new Error("step_evidence_missing"), { code: "step_evidence_missing" });
  }

  let realStepFile;
  try {
    realStepFile = planRunRecords.containedFile(logDir, stepFile);
  } catch (err) {
    if (err.code === "ENOENT" || err.code === "ENOTDIR") {
      throw Object.assign(new Error("step_evidence_missing"), { code: "step_evidence_missing" });
    }
    throw err;
  }

  const stepStat = fs.statSync(realStepFile);
  if (!stepStat.isFile() || stepStat.size > FILE_SIZE_LIMIT) {
    throw Object.assign(new Error("record_budget_exceeded"), { code: "record_budget_exceeded" });
  }

  const rawStepText = fs.readFileSync(realStepFile, "utf8");
  const actualSha256 = sha256(rawStepText);

  if (actualSha256 !== expectedArtifactSha256) {
    throw Object.assign(new Error("evidence_hash_mismatch"), { code: "evidence_hash_mismatch" });
  }

  let stepRecord;
  try {
    stepRecord = JSON.parse(rawStepText);
  } catch (err) {
    throw Object.assign(new Error("step_evidence_invalid"), { code: "step_evidence_invalid" });
  }

  if (
    !stepRecord ||
    stepRecord.schema !== "ae-agent-step-evidence.v1" ||
    stepRecord.runId !== runId ||
    stepRecord.stepIndex !== stepIndex ||
    stepRecord.tool !== step.tool ||
    !record.plan.steps || !record.plan.steps[stepIndex - 1] ||
    record.plan.steps[stepIndex - 1].tool !== step.tool ||
    ["actionId", "projectId", "proposalRevision", "projectRevision"].some(key =>
      (stepRecord[key] ?? null) !== ((record.run.provenance && record.run.provenance[key]) ?? null))
  ) {
    throw Object.assign(new Error("step_evidence_binding_mismatch"), { code: "step_evidence_binding_mismatch" });
  }

  const observedAt = stepRecord.observedAt || null;
  const actionId =
    stepRecord.actionId ||
    (record.run && record.run.provenance && record.run.provenance.actionId) ||
    null;

  const totalChars = rawStepText.length;
  const pageText = safeCharSlice(rawStepText, offset, limitChars);
  const nextOffset = offset + pageText.length < totalChars ? offset + pageText.length : null;

  return {
    schema: PLAN_RUN_EVIDENCE_SCHEMA,
    runId,
    stepIndex,
    actionId,
    artifactId,
    observedAt,
    sha256: actualSha256,
    text: pageText,
    offset,
    limitChars,
    nextOffset,
    totalChars,
    fresh: false,
    evidenceKind: "recorded"
  };
}

module.exports = {
  PLAN_RUN_SUMMARY_SCHEMA,
  PLAN_RUN_EVIDENCE_SCHEMA,
  DEFAULT_LIMIT_CHARS,
  MAX_LIMIT_CHARS,
  assertValidResponseView,
  truncateText,
  compactSemanticVerification,
  compactStepSummary,
  projectPlanRunSummary,
  safeCharSlice,
  getPlanRunEvidence
};
