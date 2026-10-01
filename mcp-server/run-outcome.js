"use strict";

const {isMutatingStep} = require("./semantic-verification");
const own = (value, key) => Boolean(value && Object.prototype.hasOwnProperty.call(value, key));
function decoded(value) {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch (_) { return null; }
}
function successfulResult(value) {
  const result = decoded(value);
  return result !== null && result !== undefined && !(result && (result.ok === false || result.isError === true));
}

// Lifecycle is supplied by the runner. A failed setter may have written some
// fields; only a pre-mutation rejection or an undelivered command proves no edit.
function classifyMutationStep(step = {}) {
  if (!isMutatingStep(step)) return {status: "not_started", reasonCode: "read_only_step"};
  const commands = (Array.isArray(step.commands) ? step.commands : []).filter(command => command && command.role === "mutation");
  if (own(step, "mutationResult") && step.mutationResultIsError !== true && successfulResult(step.mutationResult)) return {status: "applied", reasonCode: "typed_mutation_result_received"};
  if (step.status === "completed" && step.mutationResultIsError !== true && (!own(step, "result") || successfulResult(step.result))) return {status: "applied", reasonCode: "typed_step_completed"};
  if (step.preMutationRejected === true || commands.length && commands.every(command => command.preMutationRejected === true)) return {status: "failed", reasonCode: "rejected_before_mutation"};
  const delivered = commands.some(command => command.submittedAt || command.leasedAt ||
    ["leased", "submitted", "result_received", "completed"].includes(command.lifecycleState || command.state) || ["leased", "submitted", "result_received"].includes(command.timedOutFrom));
  if (!delivered && commands.length && commands.every(command => command.neverSubmitted === true && !command.submittedAt && !command.leasedAt) || step.phase === "before_delivery" && !delivered) return {status: "not_started", reasonCode: "mutation_not_delivered"};
  if (delivered || commands.some(command => command.neverSubmitted !== true && !["queued", "cancelled"].includes(command.lifecycleState || command.state)) ||
    step.mutationResultIsError === true || own(step, "result") && !successfulResult(step.result) || /timeout|timed.?out|unknown/i.test(step.errorCode || "")) return {status: "unknown", reasonCode: "mutation_delivery_outcome_unknown"};
  if (commands.length && commands.every(command => command.neverSubmitted === true && !command.submittedAt && !command.leasedAt) ||
    step.phase === "before_delivery" || ["blocked", "pending", "skipped", "not_started", "dry_run"].includes(step.status)) return {status: "not_started", reasonCode: "mutation_not_delivered"};
  if (["failed", "error"].includes(step.status)) return {status: "unknown", reasonCode: "partial_mutation_not_excluded"};
  return {status: "not_started", reasonCode: "no_mutation_execution_evidence"};
}

function originalExecutionError(run) {
  const error = run.originalExecutionError || run.executionError || run.originalError;
  if (error && typeof error === "object") return {code: error.code || error.errorCode || null, message: error.message || error.error || null};
  const nested = (Array.isArray(run.steps) ? run.steps : []).flatMap(step => {
    const verification = step.result && step.result.verification;
    const command = (Array.isArray(step.commands) ? step.commands : []).find(row => row && row.role !== "checkpoint" &&
      (row.error || /timeout|timed.?out/i.test(row.state || row.lifecycleState || "")));
    const commandError = command && {code: command.errorCode || (/timeout|timed.?out/i.test(command.state || command.lifecycleState || "") ? "command_timeout" : "command_failed"), message: typeof command.error === "string" ? command.error : command.error && command.error.message || null};
    return [step.error || step.errorCode ? {code: step.errorCode || null, message: step.error || null} : null,
      commandError, verification && verification.error ? {code: verification.errorCode || "verification_read_failed", message: verification.error} : null].filter(Boolean);
  })[0];
  if (nested && (!run.errorCode || run.errorCode === "verification_required")) return nested;
  return run.error || run.errorCode ? {code: run.errorCode || null, message: typeof run.error === "string" ? run.error : null} : null;
}

// These dimensions do not replace the runner's fail-closed ok/code gate.
function buildRunOutcome(run = {}, plan = {}) {
  const steps = Array.isArray(run.steps) ? run.steps : [], planned = Array.isArray(plan.steps) ? plan.steps : [];
  const mutationSteps = steps.filter(isMutatingStep);
  const classified = run.dryRun ? [] : mutationSteps.map(step => ({index: step.index, tool: step.tool, ...classifyMutationStep(step)}));
  const counts = {applied: 0, unknown: 0, failed: 0, not_started: 0};
  classified.forEach(step => counts[step.status]++);
  const plannedMutationCount = planned.filter(isMutatingStep).length;
  counts.not_started += Math.max(0, plannedMutationCount - mutationSteps.length);
  const mutation = run.dryRun ? "not_started" : counts.unknown ? "unknown" : counts.failed ? "failed" : counts.applied ? "applied" : "not_started";
  const completed = steps.filter(step => step.status === "completed");
  const originalError = originalExecutionError(run);
  const failed = Number(run.failedCount || 0) > 0 || steps.some(step => ["failed", "error", "blocked"].includes(step.status)) || originalError && originalError.code !== "verification_required";
  const attempted = steps.length || Number(run.executedCount || 0) || classified.some(step => step.status !== "not_started");
  const execution = run.dryRun || !attempted ? "not_started" : failed ? "failed" : "completed";
  const semantic = run.semanticVerification;
  const checks = semantic && Array.isArray(semantic.checks) ? semantic.checks : [];
  const mutationRequested = plannedMutationCount > 0 || mutationSteps.length > 0;
  const raw = mutationSteps.some(step => /^run_extendscript(?:_file)?$/.test(step.tool));
  const unsafeEmptyPass = raw && !checks.length;
  const knownFailure = semantic && (semantic.status === "failed" || checks.some(check => check.passed === false || check.status === "failed")) || run.solutionPlanReadBack && run.solutionPlanReadBack.status === "failed";
  const incomplete = !semantic || unsafeEmptyPass || mutationRequested && !checks.length || Number(semantic && semantic.unverifiedMutationCount || 0) > 0 ||
    checks.some(check => ["needs_review", "pending", "insufficient"].includes(check.status)) || run.solutionPlanReadBack && !["passed", "failed"].includes(run.solutionPlanReadBack.status);
  let verification = "not_required";
  const timedOutVerification = /timeout|timed.?out/i.test(originalError && originalError.code || "") || steps.some(step => (Array.isArray(step.commands) ? step.commands : []).some(command => command.role === "readback" && /timeout|timed.?out/i.test(command.state || command.lifecycleState || "")));
  if (!run.dryRun && (mutationRequested && (counts.applied || counts.unknown || counts.failed) || knownFailure)) verification = knownFailure ? "failed" : mutation === "unknown" || timedOutVerification ? "pending" : incomplete ? "insufficient" : semantic.status === "passed" ? "passed" : "insufficient";
  const visual = [...planned, ...completed].some(step => step.tool === "save_comp_frame_png" || step.tool === "add_comp_to_render_queue");
  return {
    schema: "ae-agent-run-outcome.v2",
    execution: {status: execution, scope: "plan_steps", reasonCode: run.dryRun ? "dry_run_only" : failed ? "step_execution_failed" : attempted ? "steps_completed" : "no_steps_executed", originalError},
    mutation: {status: mutation, scope: "mutation_commands", reasonCode: mutation === "unknown" ? "read_only_reconciliation_required" : counts.applied ? "typed_mutations_applied" : "no_confirmed_mutation", counts, steps: classified},
    verification: {status: verification, scope: "declared_semantic_invariants", reasonCode: unsafeEmptyPass ? "raw_outcome_proof_missing" : verification === "pending" ? "read_only_reconciliation_required" : verification === "insufficient" ? "semantic_evidence_incomplete" : `semantic_${verification}`},
    coverage: {status: verification === "not_required" ? "not_required" : incomplete || verification === "pending" ? "incomplete" : "complete", scope: "declared_semantic_invariants", reasonCode: incomplete || verification === "pending" ? "semantic_evidence_incomplete" : "declared_checks_covered"},
    acceptance: {status: visual ? "pending" : "not_requested", scope: visual ? "visual_and_user_acceptance" : "none", reasonCode: visual ? "independent_acceptance_required" : "no_acceptance_evidence"}
  };
}

module.exports = {buildRunOutcome, classifyMutationStep, originalExecutionError};
