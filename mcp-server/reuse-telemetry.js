"use strict";

function finiteCount(value) { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null; }
function firstCount(...values) { for (const value of values) { const count = finiteCount(value); if (count !== null) return count; } return null; }

function summarizeUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  const result = {
    inputTokens: firstCount(usage.input_tokens, usage.prompt_tokens, usage.promptTokenCount, usage.prompt_eval_count),
    outputTokens: firstCount(usage.output_tokens, usage.completion_tokens, usage.candidatesTokenCount, usage.eval_count),
    cachedInputTokens: firstCount(usage.cached_input_tokens, usage.input_tokens_details && usage.input_tokens_details.cached_tokens,
      usage.prompt_tokens_details && usage.prompt_tokens_details.cached_tokens, usage.cachedContentTokenCount),
    reasoningTokens: firstCount(usage.output_tokens_details && usage.output_tokens_details.reasoning_tokens,
      usage.completion_tokens_details && usage.completion_tokens_details.reasoning_tokens, usage.thoughtsTokenCount),
    totalTokens: firstCount(usage.total_tokens, usage.totalTokenCount)
  };
  return Object.values(result).some((value) => value !== null) ? result : null;
}

function solutionIds(plan, allowedIds) {
  const allowed = new Set(allowedIds || []);
  return Array.from(new Set(Array.isArray(plan && plan.solutionIds) ? plan.solutionIds : []))
    .filter((id) => typeof id === "string" && allowed.has(id)).slice(0, 8);
}

function retrievalIds(retrieval) {
  return [...(retrieval && retrieval.toolMatches || []), ...(retrieval && retrieval.entries || [])].map((entry) => entry.id);
}

function summarizeReuse(plan, retrieval) {
  const surfacedSolutionIds = retrievalIds(retrieval);
  return { version: "solution-reuse-v1", surfacedSolutionIds,
    declaredSolutionIds: solutionIds(plan, surfacedSolutionIds),
    attribution: "model-declared; not proof that a recipe caused success" };
}

function summarizeRun(run, plan, allowedIds) {
  const completed = (run.steps || []).filter((step) => step.status === "completed");
  return { version: "solution-reuse-v1", runId: run.id, dryRun: run.dryRun, ok: run.ok,
    declaredSolutionIds: solutionIds(plan, allowedIds),
    executedTools: completed.map((step) => step.tool).filter(Boolean),
    executedCount: run.executedCount, failedCount: run.failedCount,
    rawStepCount: completed.filter((step) => /^run_extendscript(?:_file)?$/.test(step.tool)).length,
    semanticStatus: run.semanticVerification && run.semanticVerification.status || null,
    solutionVerificationStatus: run.solutionPlanReadBack && run.solutionPlanReadBack.status || null,
    attribution: "declared ids plus observed execution; no causal token-saving estimate" };
}

module.exports = { summarizeUsage, summarizeReuse, summarizeRun, solutionIds, retrievalIds };
