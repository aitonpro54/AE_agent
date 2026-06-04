"use strict";

const RAW_EXTENDSCRIPT_TOOLS = new Set(["run_extendscript", "run_extendscript_file"]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function compactText(value, limit) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const max = Math.max(20, limit || 240);
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function planSteps(plan) {
  return safeArray(plan && plan.steps);
}

function validationSteps(validation) {
  return safeArray(validation && validation.steps);
}

function runSteps(run) {
  return safeArray(run && run.steps);
}

function stepTool(step) {
  return String(step && step.tool || "").trim();
}

function stepArgs(step) {
  if (!isPlainObject(step)) return {};
  if (isPlainObject(step.args)) return step.args;
  if (isPlainObject(step.safeArgs)) return step.safeArgs;
  return {};
}

function stepTitle(step) {
  return compactText(step && (step.title || step.intent || step.tool), 140) || "Raw ExtendScript fallback";
}

function rawExtendscriptStepsFromPlan(plan) {
  return planSteps(plan).filter((step) => RAW_EXTENDSCRIPT_TOOLS.has(stepTool(step)));
}

function rawExtendscriptStepCount(plan, validation, run) {
  const classificationCount = Number(validation && validation.classification && validation.classification.rawExtendscriptStepCount || 0);
  if (classificationCount > 0) return classificationCount;

  const validationCount = validationSteps(validation).filter((step) => RAW_EXTENDSCRIPT_TOOLS.has(stepTool(step))).length;
  if (validationCount > 0) return validationCount;

  const planCount = rawExtendscriptStepsFromPlan(plan).length;
  if (planCount > 0) return planCount;

  return runSteps(run).filter((step) => RAW_EXTENDSCRIPT_TOOLS.has(stepTool(step))).length;
}

function rawStepScriptSummary(step) {
  const args = stepArgs(step);
  if (typeof args.script === "string" && args.script.trim()) {
    return {
      title: stepTitle(step),
      tool: stepTool(step),
      body: args.script,
      filePath: null
    };
  }
  if (typeof args.filePath === "string" && args.filePath.trim()) {
    return {
      title: stepTitle(step),
      tool: stepTool(step),
      body: null,
      filePath: args.filePath
    };
  }
  return {
    title: stepTitle(step),
    tool: stepTool(step),
    body: null,
    filePath: null
  };
}

function rawScriptSummaries(plan) {
  return rawExtendscriptStepsFromPlan(plan).map(rawStepScriptSummary);
}

function generatedScriptFromPlan(plan) {
  const scripts = rawScriptSummaries(plan);
  const inlineBodies = scripts
    .filter((script) => script.body)
    .map((script, index) => [
      `// Candidate raw ExtendScript fallback ${index + 1}: ${script.title}`,
      script.body
    ].join("\n"));
  const filePaths = scripts
    .filter((script) => script.filePath)
    .map((script) => `${script.title}: ${script.filePath}`);

  return {
    language: "extendscript",
    summary: compactText([
      inlineBodies.length ? `${inlineBodies.length} inline raw fallback script(s) captured for quarantine review.` : "",
      filePaths.length ? `${filePaths.length} file-based raw fallback reference(s): ${filePaths.join("; ")}` : ""
    ].filter(Boolean).join(" "), 700) || "Raw ExtendScript fallback captured for quarantine review.",
    body: inlineBodies.length ? inlineBodies.join("\n\n") : null
  };
}

function statusForIndex(index, runStepByIndex) {
  const step = runStepByIndex.get(index);
  return step && step.status ? step.status : null;
}

function compactGeneratedPlan(plan, validation, run) {
  const validationList = validationSteps(validation);
  const runStepByIndex = new Map();
  runSteps(run).forEach((step, index) => {
    const stepIndex = Number(step && step.index || index + 1);
    runStepByIndex.set(stepIndex, step);
  });

  const sourceSteps = validationList.length ? validationList : planSteps(plan);
  return {
    summary: compactText(plan && plan.summary, 700) || "Raw ExtendScript fallback plan.",
    stepCount: Number(validation && validation.stepCount || sourceSteps.length || 0),
    mutatingStepCount: Number(validation && validation.mutatingCount || 0),
    steps: sourceSteps.map((step, index) => {
      const stepIndex = Number(step && step.index || index + 1);
      const args = stepArgs(step);
      return {
        index: stepIndex,
        tool: stepTool(step) || null,
        mutating: Boolean(step && (step.mutatesProject || step.mutating)),
        targetSummary: compactText(step && (step.targetSummary || step.intent || step.title), 500),
        status: statusForIndex(stepIndex, runStepByIndex) || (step && step.valid === false ? "needs-review" : "planned"),
        safety: {
          executable: step && Object.prototype.hasOwnProperty.call(step, "executable") ? Boolean(step.executable) : null,
          verifyAfter: args.verifyAfter === true,
          hasIdempotency: Boolean(args.idempotencyKey || step && step.idempotencyKeyTemplate),
          rawExtendscript: RAW_EXTENDSCRIPT_TOOLS.has(stepTool(step))
        }
      };
    })
  };
}

function affectedTargetsFromRun(run, validation) {
  const targets = [];
  for (const step of runSteps(run).concat(validationSteps(validation))) {
    const text = compactText(step && (step.targetSummary || step.title || step.tool), 300);
    if (text && !targets.includes(text)) targets.push(text);
    if (targets.length >= 12) break;
  }
  return targets;
}

function runStatuses(run) {
  return runSteps(run).map((step) => ({
    status: step && step.status || "unknown",
    tool: step && step.tool || null,
    targetSummary: compactText(step && step.targetSummary, 240)
  }));
}

function verificationEvidence(run) {
  const semantic = run && run.semanticVerification || {};
  const checks = safeArray(semantic.checks).map((check) => {
    const title = check && (check.title || check.id) || "semantic check";
    const status = check && check.status || "unknown";
    return compactText(`${title}: ${status}`, 300);
  });
  if (checks.length) return checks.slice(0, 10);

  const evidence = [];
  for (const step of runSteps(run)) {
    const verification = step && step.result && step.result.verification;
    if (!verification) continue;
    evidence.push(compactText(`${step.tool || step.title || "step"} verification: ${verification.ok ? "ok" : "needs review"}`, 300));
  }
  if (evidence.length) return evidence.slice(0, 10);

  if (run && run.ok) return ["Protected run completed; reviewer must confirm typed-tool contract and read-back expectations before promotion."];
  return ["Run did not complete successfully; keep candidate in quarantine."];
}

function checkpointForRun(run) {
  if (!run) return null;
  if (run.checkpoint) return run.checkpoint;
  if (run.editSession && run.editSession.checkpoint) return run.editSession.checkpoint;
  return null;
}

function buildRawExtendscriptFallbackCandidateInput(input) {
  const source = isPlainObject(input) ? input : {};
  const plan = isPlainObject(source.plan) ? source.plan : {};
  const run = isPlainObject(source.run) ? source.run : {};
  const validation = isPlainObject(source.validation) ? source.validation : (isPlainObject(run.validation) ? run.validation : {});
  const rawCount = rawExtendscriptStepCount(plan, validation, run);
  const userIntent = compactText(source.userPrompt || source.prompt || plan.summary || "Raw ExtendScript fallback workflow", 900);
  const semantic = run.semanticVerification || {};
  const verified = run.ok === true && semantic.status !== "needs_review";

  return {
    title: compactText(`Raw ExtendScript fallback: ${plan.summary || userIntent}`, 100),
    tags: ["raw-extendscript-fallback", "typed-tool-candidate"],
    intent: {
      summary: userIntent,
      appliesWhen: [
        "A normal AE Agent request needed raw ExtendScript because no current typed tool fit the workflow.",
        "The same workflow may repeat and should be reviewed for a narrow typed bridge tool."
      ]
    },
    generatedPlan: compactGeneratedPlan(plan, validation, run),
    generatedScript: generatedScriptFromPlan(plan),
    affectedTargets: affectedTargetsFromRun(run, validation),
    runResult: {
      ok: run.ok === true,
      dryRun: run.dryRun === true,
      mutating: Boolean(validation && Number(validation.mutatingCount || 0) > 0),
      safety: run.safety || null,
      checkpoint: checkpointForRun(run),
      statuses: runStatuses(run),
      outputSummary: compactText(run.summary || `${rawCount} raw ExtendScript fallback step(s) completed under protected plan gates.`, 700),
      errorSummary: run.error || null
    },
    verificationReadBack: {
      summary: compactText(semantic.summary || "Review protected run result and post-run read-back before promotion.", 700),
      status: semantic.status || (run.ok ? "passed" : "needs_review"),
      evidence: verificationEvidence(run)
    },
    projectAssumptions: [
      "Execution already passed AE Agent plan validation and the raw ExtendScript dry-run gate.",
      "Candidate evidence is quarantine-only and must not become planner-visible without explicit promotion review."
    ],
    warnings: [
      "Do not promote inline raw ExtendScript directly to a trusted tool.",
      "Check whether existing typed tools already cover this workflow before implementing a new typed tool."
    ],
    suggestedPromotionAction: {
      action: verified ? "promote-to-typed-tool-candidate" : "keep-in-quarantine",
      rationale: verified
        ? "Successful fallback is evidence for a reviewed typed-tool request, not an automatic trusted tool."
        : "Only successful verified fallbacks may be reviewed for typed-tool candidacy.",
      nextReviewChecks: [
        "Confirm no existing typed bridge tool fits the workflow.",
        "Define a narrow input schema, safety gates, idempotency, and read-back contract.",
        "Add local smoke coverage and generated-only live validation before marking the typed tool done."
      ]
    },
    provenance: {
      source: source.source || "agent-plan-raw-fallback",
      runPrefix: run.id || source.requestId || null,
      planner: source.planner || null
    }
  };
}

module.exports = {
  RAW_EXTENDSCRIPT_TOOLS,
  buildRawExtendscriptFallbackCandidateInput,
  rawExtendscriptStepCount,
  rawExtendscriptStepsFromPlan
};
