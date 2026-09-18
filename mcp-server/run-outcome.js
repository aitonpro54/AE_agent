"use strict";

// These dimensions deliberately do not replace the runner's fail-closed ok/code gate.
function buildRunOutcome(run = {}, plan = {}) {
  const steps = Array.isArray(run.steps) ? run.steps : [];
  const planned = Array.isArray(plan.steps) ? plan.steps : [];
  const completed = steps.filter((step) => step.status === "completed");
  const failed = Number(run.failedCount || 0) > 0 || steps.some((step) => ["failed", "error", "blocked"].includes(step.status));
  const executed = Math.max(Number(run.executedCount || 0), completed.length);
  const execution = run.dryRun || !executed ? "not_started" : failed ? "failed" : "completed";
  const semantic = run.semanticVerification;
  const checks = semantic && Array.isArray(semantic.checks) ? semantic.checks : [];
  const unsafeEmptyPass = completed.some((step) => /^run_extendscript(?:_file)?$/.test(step.tool)) && !checks.length;
  let verification = "not_required";
  if (!run.dryRun && executed) {
    verification = !semantic || unsafeEmptyPass || Number(semantic.unverifiedMutationCount || 0) > 0 ? "insufficient" : semantic.status === "passed" ? "passed" :
      semantic.status === "failed" || checks.some((check) => check.passed === false) ? "failed" : "insufficient";
    if (run.solutionPlanReadBack && run.solutionPlanReadBack.status !== "passed") verification = run.solutionPlanReadBack.status === "failed" ? "failed" : "insufficient";
  }
  const visual = [...planned, ...completed].some((step) => step.tool === "save_comp_frame_png" || step.tool === "add_comp_to_render_queue");
  return {
    schema: "ae-agent-run-outcome.v1",
    execution: {status: failed && !run.dryRun ? "failed" : execution, scope: "plan_steps", reasonCode: run.dryRun ? "dry_run_only" : failed ? "step_execution_failed" : executed ? "steps_completed" : "no_steps_executed"},
    verification: {status: verification, scope: "declared_semantic_invariants", reasonCode: unsafeEmptyPass ? "raw_outcome_proof_missing" : verification === "insufficient" ? "semantic_evidence_incomplete" : `semantic_${verification}`},
    acceptance: {status: visual ? "pending" : "not_requested", scope: visual ? "visual_and_user_acceptance" : "none", reasonCode: visual ? "independent_acceptance_required" : "no_acceptance_evidence"}
  };
}

module.exports = { buildRunOutcome };
