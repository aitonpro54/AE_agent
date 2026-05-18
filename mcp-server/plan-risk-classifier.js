"use strict";

const CLASSIFICATION_SCHEMA = "ae-agent-plan-classification.v1";
const RAW_EXTENDSCRIPT_TOOLS = new Set(["run_extendscript", "run_extendscript_file"]);
const HIGH_RISK_WORDS = /\b(high|risky|danger|dangerous|destructive|delete|remove|overwrite|raw|extendscript|unsafe)\b/i;
const MEDIUM_RISK_WORDS = /\b(medium|moderate|mutat|change|edit|rename|replace|import|create|render)\b/i;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function compactText(value, limit) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text || text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trim()}...`;
}

function pushUnique(target, value) {
  const text = compactText(value, 220);
  if (!text || target.includes(text)) return;
  target.push(text);
}

function affectedTargetsForValidation(validation) {
  const targets = [];
  for (const step of safeArray(validation && validation.steps)) {
    pushUnique(targets, step && step.targetSummary);
  }
  return targets.slice(0, 8);
}

function stepWarningText(step) {
  return safeArray(step && step.warnings).join(" ");
}

function rawStepCount(validation) {
  return safeArray(validation && validation.steps).filter((step) => RAW_EXTENDSCRIPT_TOOLS.has(step && step.tool)).length;
}

function noToolStepCount(validation) {
  return safeArray(validation && validation.steps).filter((step) => !step || !step.tool).length;
}

function nonPlanningStepCount(validation) {
  return safeArray(validation && validation.steps).filter((step) => (
    step &&
    step.tool &&
    step.valid === false &&
    /not available for AI Agent plans/i.test(stepWarningText(step))
  )).length;
}

function missingRequiredCount(validation) {
  let count = 0;
  for (const step of safeArray(validation && validation.steps)) {
    count += safeArray(step && step.missingRequired).length;
  }
  return count;
}

function boundRequiredCount(validation) {
  let count = 0;
  for (const step of safeArray(validation && validation.steps)) {
    count += safeArray(step && step.boundRequired).length;
  }
  return count;
}

function planRiskLevel(plan) {
  const risk = compactText(isPlainObject(plan) ? plan.risk : "", 120);
  if (!risk) return "none";
  if (HIGH_RISK_WORDS.test(risk)) return "high";
  if (MEDIUM_RISK_WORDS.test(risk)) return "medium";
  return "declared";
}

function solutionSignals(solutionHints) {
  const retrieval = isPlainObject(solutionHints) ? solutionHints : {};
  const entries = safeArray(retrieval.entries);
  const toolMatches = safeArray(retrieval.toolMatches);
  const rawEntries = entries.filter((entry) => entry && entry.rawExtendscriptRisk);
  const highRiskEntries = entries.filter((entry) => entry && String(entry.riskLevel || "").toLowerCase() === "high");
  const mutatingEntries = entries.filter((entry) => entry && entry.mutating === true);
  const typedToolCandidates = entries.filter((entry) => entry && entry.status === "typed-tool-candidate");
  return {
    returned: Number(retrieval.returned || entries.length || 0),
    toolMatches: toolMatches.length,
    rawExtendscriptHints: rawEntries.length,
    highRiskHints: highRiskEntries.length,
    mutatingHints: mutatingEntries.length,
    typedToolCandidateHints: typedToolCandidates.length,
    ids: entries.map((entry) => entry && entry.id).filter(Boolean).slice(0, 6)
  };
}

function memorySignals(projectIntentMemory) {
  const retrieval = isPlainObject(projectIntentMemory) ? projectIntentMemory : {};
  const entries = safeArray(retrieval.entries);
  const categories = [];
  const highPriority = [];
  for (const entry of entries) {
    pushUnique(categories, entry && entry.category);
    if (entry && String(entry.priority || "").toLowerCase() === "high") pushUnique(highPriority, entry.id || entry.title);
  }
  return {
    returned: Number(retrieval.returned || entries.length || 0),
    categories,
    highPriorityIds: highPriority.slice(0, 6),
    ids: entries.map((entry) => entry && entry.id).filter(Boolean).slice(0, 6)
  };
}

function confidenceLabel(score) {
  if (score >= 0.8) return "high";
  if (score >= 0.55) return "medium";
  return "low";
}

function categoryLabel(category) {
  if (category === "safe typed-tool") return "Safe typed-tool";
  if (category === "needs clarification") return "Needs clarification";
  if (category === "risky") return "Risky";
  return "Unsupported";
}

function runRecommendationFor(category, validation, rawCount, blocksRun) {
  const mutatingCount = Number(validation && validation.mutatingCount || 0);
  if (category === "unsupported") return "Replace unsupported or unavailable tools before dry-run or run.";
  if (category === "needs clarification") {
    if (blocksRun && rawCount > 0) return "Dry-run first; raw ExtendScript still requires an explicit raw-script execution gate.";
    return "Runnable with review; non-tool steps will be skipped or require replanning.";
  }
  if (blocksRun) return "Dry-run may preview the plan, but normal Run is blocked until raw ExtendScript risk is handled explicitly.";
  if (category === "risky") {
    if (rawCount > 0) return "Dry-run first; raw ExtendScript still requires an explicit raw-script execution gate.";
    if (mutatingCount > 0) return "Dry-run first; Run plan must use project-change protection.";
    return "Dry-run first and review risk signals before running.";
  }
  return "Dry-run can verify the read-only typed-tool plan; Run stays read-only.";
}

function classifyAgentPlan(plan, validation, context = {}) {
  const safeValidation = isPlainObject(validation) ? validation : null;
  const sourcePlan = isPlainObject(plan) ? plan : {};
  const reasons = [];
  const blockers = [];
  const riskSignals = [];
  const safetySignals = [];

  if (!safeValidation) {
    return {
      schema: CLASSIFICATION_SCHEMA,
      category: "unsupported",
      label: categoryLabel("unsupported"),
      confidence: "low",
      score: 0.2,
      verdict: "Unsupported / low confidence - plan validation is unavailable.",
      blocksRun: true,
      allowsDryRun: false,
      tone: "blocked",
      reasons: ["Plan validation is unavailable."],
      blockers: ["Validate the plan before dry-run or run."],
      riskSignals: [],
      safetySignals: [],
      runRecommendation: "Validate the plan before dry-run or run.",
      affectedTargets: [],
      contextSignals: {
        solutionHints: solutionSignals(context.solutionHints),
        projectIntentMemory: memorySignals(context.projectIntentMemory)
      }
    };
  }

  const mutatingCount = Number(safeValidation.mutatingCount || 0);
  const stepCount = Number(safeValidation.stepCount || 0);
  const executableCount = Number(safeValidation.executableCount || 0);
  const unknownToolCount = Number(safeValidation.unknownToolCount || 0);
  const invalidStepCount = Number(safeValidation.invalidStepCount || 0);
  const rawCount = rawStepCount(safeValidation);
  const noToolCount = noToolStepCount(safeValidation);
  const nonPlanningCount = nonPlanningStepCount(safeValidation);
  const missingCount = missingRequiredCount(safeValidation);
  const bindingCount = boundRequiredCount(safeValidation);
  const affectedTargets = affectedTargetsForValidation(safeValidation);
  const solution = solutionSignals(context.solutionHints);
  const memory = memorySignals(context.projectIntentMemory);
  const declaredRisk = planRiskLevel(sourcePlan);

  pushUnique(safetySignals, `Validation summary: ${stepCount} step${stepCount === 1 ? "" : "s"}, ${mutatingCount} mutating, ${executableCount} executable.`);
  if (affectedTargets.length) pushUnique(safetySignals, `Affected targets summarized: ${affectedTargets.join("; ")}.`);
  if (bindingCount > 0) pushUnique(safetySignals, `${bindingCount} runtime binding field${bindingCount === 1 ? "" : "s"} must resolve during execution.`);
  if (memory.returned > 0) {
    pushUnique(safetySignals, `Project intent memory hints available: ${memory.ids.join(", ") || memory.returned}.`);
  }

  if (mutatingCount > 0) pushUnique(riskSignals, `${mutatingCount} mutating step${mutatingCount === 1 ? "" : "s"} can change the AE project.`);
  if (safeValidation.requiresCheckpoint) pushUnique(riskSignals, "Checkpoint or protected edit-session expected before project changes.");
  if (rawCount > 0) pushUnique(riskSignals, `${rawCount} raw ExtendScript step${rawCount === 1 ? "" : "s"} planned.`);
  if (declaredRisk === "high" || declaredRisk === "medium") pushUnique(riskSignals, `Planner declared ${declaredRisk} risk.`);
  if (solution.rawExtendscriptHints > 0) pushUnique(riskSignals, "Reviewed solution hints include raw ExtendScript escape-hatch guidance.");
  if (solution.highRiskHints > 0) pushUnique(riskSignals, "Reviewed solution hints include high-risk recipe metadata.");
  if (solution.mutatingHints > 0) pushUnique(riskSignals, "Reviewed solution hints match mutating workflows.");
  if (solution.typedToolCandidateHints > 0) {
    pushUnique(safetySignals, "Solution hints prefer a typed-tool candidate instead of repeating a workaround.");
  }
  if (memory.highPriorityIds.length) {
    pushUnique(safetySignals, `High-priority project memory present: ${memory.highPriorityIds.join(", ")}.`);
  }

  let category = "safe typed-tool";
  let score = 0.92;
  let blocksRun = false;
  let allowsDryRun = true;

  if (unknownToolCount > 0 || nonPlanningCount > 0) {
    category = "unsupported";
    score = 0.24;
    blocksRun = true;
    allowsDryRun = false;
    if (unknownToolCount > 0) pushUnique(blockers, `${unknownToolCount} unknown MCP tool${unknownToolCount === 1 ? "" : "s"} in plan.`);
    if (nonPlanningCount > 0) pushUnique(blockers, `${nonPlanningCount} tool${nonPlanningCount === 1 ? " is" : "s are"} not available for AI Agent plans.`);
  } else if (sourcePlan.clarifyingQuestion || stepCount === 0 || noToolCount > 0 || missingCount > 0 || invalidStepCount > 0) {
    category = "needs clarification";
    score = 0.46;
    blocksRun = safeValidation.ok ? rawCount > 0 : true;
    allowsDryRun = safeValidation.ok ? true : false;
    if (sourcePlan.clarifyingQuestion) pushUnique(blockers, `Clarifying question: ${sourcePlan.clarifyingQuestion}`);
    if (stepCount === 0) pushUnique(blockers, "Plan has no executable steps.");
    if (noToolCount > 0) pushUnique(blockers, `${noToolCount} step${noToolCount === 1 ? "" : "s"} have no MCP tool.`);
    if (missingCount > 0) pushUnique(blockers, `${missingCount} required field${missingCount === 1 ? "" : "s"} missing from plan steps.`);
    if (invalidStepCount > 0 && missingCount === 0) pushUnique(blockers, `${invalidStepCount} invalid step${invalidStepCount === 1 ? "" : "s"} need review.`);
  } else if (
    mutatingCount > 0 ||
    rawCount > 0 ||
    safeValidation.requiresCheckpoint ||
    declaredRisk === "high" ||
    solution.rawExtendscriptHints > 0 ||
    solution.highRiskHints > 0
  ) {
    category = "risky";
    score = rawCount > 0 || declaredRisk === "high" || solution.rawExtendscriptHints > 0 || solution.highRiskHints > 0 ? 0.64 : 0.72;
    blocksRun = rawCount > 0;
  }

  if (category === "safe typed-tool") {
    pushUnique(reasons, "Validated plan uses available typed MCP tools without project mutation.");
  } else if (category === "risky") {
    pushUnique(reasons, "Plan is valid, but project-change or escape-hatch risk needs explicit review.");
  } else if (category === "needs clarification") {
    pushUnique(reasons, safeValidation.ok
      ? "Plan passed validation but has review warnings; runner can execute tool steps and skip non-tool notes."
      : "Plan is not actionable until the ambiguous or incomplete details are resolved.");
  } else {
    pushUnique(reasons, "Plan references tools that the AI Agent plan runner cannot accept.");
  }

  for (const signal of riskSignals) pushUnique(reasons, signal);
  for (const blocker of blockers) pushUnique(reasons, blocker);

  const confidence = confidenceLabel(score);
  const label = categoryLabel(category);
  const runRecommendation = runRecommendationFor(category, safeValidation, rawCount, blocksRun);
  const tone = category === "unsupported" || (category === "needs clarification" && !safeValidation.ok)
    ? "blocked"
    : category === "risky" || category === "needs clarification"
      ? "mutating"
      : "read-only";

  return {
    schema: CLASSIFICATION_SCHEMA,
    category,
    label,
    confidence,
    score,
    verdict: `${label} / ${confidence} confidence - ${runRecommendation}`,
    blocksRun,
    allowsDryRun,
    tone,
    reasons,
    blockers,
    riskSignals,
    safetySignals,
    runRecommendation,
    affectedTargets,
    rawExtendscriptStepCount: rawCount,
    validationSummary: {
      stepCount,
      executableCount,
      mutatingCount,
      unknownToolCount,
      invalidStepCount,
      requiresCheckpoint: Boolean(safeValidation.requiresCheckpoint)
    },
    contextSignals: {
      solutionHints: solution,
      projectIntentMemory: memory
    }
  };
}

module.exports = {
  CLASSIFICATION_SCHEMA,
  classifyAgentPlan
};
