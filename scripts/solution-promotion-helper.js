"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  validateSolutionCandidateReport
} = require("./solution-candidate-report");
const {
  REGISTRY_SCHEMA,
  SOLUTION_SCHEMA,
  TRACKED_STATUSES,
  PLANNER_USE,
  validateRegistry
} = require("./solution-registry-smoke");

const REPO_ROOT = path.join(__dirname, "..");
const DEFAULT_REGISTRY_PATH = path.join(REPO_ROOT, "registry", "solutions.json");
const PROMOTION_REVIEW_SCHEMA = "solution-promotion-review.v1";
const MAX_PROMOTED_SCRIPT_BYTES = 16000;

const KNOWN_BRIDGE_TOOLS = new Set([
  "get_bridge_status",
  "ping_ae",
  "get_active_comp",
  "get_selected_layers",
  "get_selected_properties",
  "get_project_info",
  "get_project_snapshot",
  "find_project_items",
  "find_comps",
  "list_comps",
  "list_layers",
  "get_comp_details",
  "get_layer_details",
  "list_effect_presets",
  "list_effects",
  "get_effect_details",
  "run_extendscript",
  "run_extendscript_file",
  "create_text_layer",
  "import_footage",
  "create_solid_layer",
  "create_null_layer",
  "create_adjustment_layer",
  "add_project_item_to_comp",
  "duplicate_comp",
  "deep_duplicate_precomp_sources",
  "add_effect",
  "set_effect_property",
  "set_property_value",
  "align_layers_to_time",
  "set_comp_work_area",
  "set_layer_time_range",
  "stagger_layers",
  "split_layers_at_time",
  "precompose_layers",
  "replace_layer_source",
  "rename_layers",
  "rename_project_items",
  "update_text_layer",
  "create_shape_layer",
  "fit_layer_to_comp",
  "set_property_keyframes",
  "apply_keyframe_ease",
  "set_expression",
  "clear_expression",
  "add_comp_to_render_queue",
  "set_render_queue_output",
  "get_render_queue_status",
  "set_layer_transform",
  "apply_transform_expression",
  "add_layer_marker",
  "create_test_comp",
  "cleanup_test_items"
]);

const MUTATING_TOOLS = new Set([
  "run_extendscript",
  "run_extendscript_file",
  "create_text_layer",
  "import_footage",
  "create_solid_layer",
  "create_null_layer",
  "create_adjustment_layer",
  "add_project_item_to_comp",
  "duplicate_comp",
  "deep_duplicate_precomp_sources",
  "add_effect",
  "set_effect_property",
  "set_property_value",
  "align_layers_to_time",
  "set_comp_work_area",
  "set_layer_time_range",
  "stagger_layers",
  "split_layers_at_time",
  "precompose_layers",
  "replace_layer_source",
  "rename_layers",
  "rename_project_items",
  "update_text_layer",
  "create_shape_layer",
  "fit_layer_to_comp",
  "set_property_keyframes",
  "apply_keyframe_ease",
  "set_expression",
  "clear_expression",
  "add_comp_to_render_queue",
  "set_render_queue_output",
  "set_layer_transform",
  "apply_transform_expression",
  "add_layer_marker",
  "create_test_comp",
  "cleanup_test_items"
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertPlainObject(value, label) {
  assert(isPlainObject(value), `${label} must be an object.`);
}

function assertString(value, label) {
  assert.strictEqual(typeof value, "string", `${label} must be a string.`);
  assert(value.trim().length > 0, `${label} must not be empty.`);
}

function assertStringArray(value, label, minItems) {
  assert(Array.isArray(value), `${label} must be an array.`);
  if (minItems !== undefined) {
    assert(value.length >= minItems, `${label} must contain at least ${minItems} item(s).`);
  }
  value.forEach((item, index) => assertString(item, `${label}[${index}]`));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function todayIsoDate(now) {
  return String(now || new Date().toISOString()).slice(0, 10);
}

function slugId(value) {
  return String(value || "promoted-solution")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "promoted-solution";
}

function uniqueStrings(values) {
  const output = [];
  for (const value of values || []) {
    if (typeof value !== "string") continue;
    const text = value.trim();
    if (text && !output.includes(text)) output.push(text);
  }
  return output;
}

function candidateTools(report) {
  const steps = report && report.candidate && report.candidate.generatedPlan && Array.isArray(report.candidate.generatedPlan.steps)
    ? report.candidate.generatedPlan.steps
    : [];
  return uniqueStrings(steps.map((step) => step && step.tool));
}

function candidateMutating(report) {
  const candidate = report.candidate || {};
  const plan = candidate.generatedPlan || {};
  const run = candidate.runResult || {};
  return plan.mutatingStepCount > 0 || run.mutating === true;
}

function inferPreferredTools(report, review) {
  const explicit = review.execution && Array.isArray(review.execution.preferredTools)
    ? review.execution.preferredTools
    : [];
  const inferred = candidateTools(report).filter((tool) => tool !== "run_extendscript");
  return uniqueStrings(explicit.length ? explicit : inferred);
}

function normalizeSafetyGates(execution, review) {
  if (review.requiredSafetyGates !== undefined) {
    return review.requiredSafetyGates;
  }

  const mutating = execution.mutating === true;
  return {
    planValidation: true,
    explicitConfirmation: mutating,
    allowMutations: mutating,
    idempotency: mutating,
    checkpointOrEditSession: mutating && (execution.mode === "extendscript-file" || execution.riskLevel === "high"),
    postMutationReadBack: mutating
  };
}

function normalizeTypedToolComparison(review, execution) {
  const comparison = review.typedToolComparison;
  if (execution.mode !== "extendscript-file") {
    return comparison || null;
  }
  assertPlainObject(comparison, "typedToolComparison");
  assert.strictEqual(
    comparison.existingTypedToolFits,
    false,
    "raw ExtendScript promotion requires existingTypedToolFits:false after typed-tool review."
  );
  assertStringArray(comparison.checkedTools, "typedToolComparison.checkedTools", 1);
  assertString(comparison.rationale, "typedToolComparison.rationale");
  return {
    existingTypedToolFits: false,
    checkedTools: uniqueStrings(comparison.checkedTools),
    rationale: comparison.rationale
  };
}

function normalizeExecution(report, review) {
  assertPlainObject(review.execution, "execution");
  const preferredTools = inferPreferredTools(report, review);
  const mode = review.execution.mode || (preferredTools.includes("run_extendscript_file") ? "extendscript-file" : "typed-plan");
  const mutating = typeof review.execution.mutating === "boolean" ? review.execution.mutating : candidateMutating(report);
  const riskLevel = review.execution.riskLevel || (mutating ? "medium" : "low");

  assert(!preferredTools.includes("run_extendscript"), "Promotion must not recommend inline run_extendscript.");
  if (preferredTools.includes("run_extendscript_file")) {
    assert.strictEqual(mode, "extendscript-file", "run_extendscript_file requires extendscript-file execution mode.");
  }

  return {
    mode,
    mutating,
    riskLevel,
    recipePath: review.execution.recipePath || null,
    scriptPath: review.execution.scriptPath || null,
    preferredTools,
    generatedPrefix: review.execution.generatedPrefix || null
  };
}

function validatePromotedScriptStatic(execution) {
  if (execution.mode !== "extendscript-file") return null;

  assertString(execution.scriptPath, "execution.scriptPath");
  assert(execution.scriptPath.replace(/\\/g, "/").startsWith("scripts/solutions/"), "raw JSX promotion must use a reviewed file under scripts/solutions/.");
  assert(execution.preferredTools.includes("run_extendscript_file"), "raw JSX promotion must be file-based through run_extendscript_file.");

  const scriptPath = path.join(REPO_ROOT, ...execution.scriptPath.replace(/\\/g, "/").split("/"));
  const source = fs.readFileSync(scriptPath, "utf8");
  const bytes = Buffer.byteLength(source, "utf8");
  assert(bytes > 0, "promoted ExtendScript file must not be empty.");
  assert(bytes <= MAX_PROMOTED_SCRIPT_BYTES, `promoted ExtendScript file must stay small (${bytes} bytes > ${MAX_PROMOTED_SCRIPT_BYTES}).`);
  assert(!/app\.project\.file\s*=/.test(source), "promoted ExtendScript must not assign or hard-code the active project file.");
  assert(!/app\.project\.save(?:WithDialog|As)?\s*\(/.test(source), "promoted ExtendScript must not save the project directly.");
  assert(!/app\.project\.(?:item|items)\s*\([^)]*\)\.remove\s*\(/.test(source), "promoted ExtendScript must not broadly delete project items.");
  assert(!/for\s*\([^)]*app\.project\.numItems[^)]*\)[\s\S]{0,300}\.remove\s*\(/.test(source), "promoted ExtendScript must not loop over project items and remove them.");
  assert(!/while\s*\([^)]*app\.project\.numItems[^)]*\)[\s\S]{0,300}\.remove\s*\(/.test(source), "promoted ExtendScript must not loop over project items and remove them.");
  assert(!/eval\s*\(/.test(source), "promoted ExtendScript must not use eval.");
  if (execution.mutating) {
    assert(/app\.beginUndoGroup\s*\(/.test(source), "mutating promoted ExtendScript must call app.beginUndoGroup.");
    assert(/app\.endUndoGroup\s*\(/.test(source), "mutating promoted ExtendScript must call app.endUndoGroup.");
    if (/\.remove\s*\(|\.add(?:Text|Solid|Null|Shape)?\s*\(|items\.add|layers\.add|duplicate\s*\(/.test(source)) {
      assert(execution.generatedPrefix || /Codex|AE Agent|Generated/i.test(source), "mutating generated-object JSX must document a generated prefix or comment.");
    }
  }
  return { scriptPath: execution.scriptPath, bytes };
}

function validatePlanValidationFixtures(review) {
  assert(Array.isArray(review.planValidationFixtures), "planValidationFixtures must be an array.");
  assert(review.planValidationFixtures.length > 0, "promotion review requires at least one plan validation/dry-run fixture.");

  for (const fixture of review.planValidationFixtures) {
    assertPlainObject(fixture, "planValidationFixtures[]");
    assertString(fixture.id, "planValidationFixtures[].id");
    assertPlainObject(fixture.plan, `${fixture.id}: plan`);
    assert(Array.isArray(fixture.plan.steps), `${fixture.id}: plan.steps must be an array.`);
    assert(fixture.plan.steps.length > 0, `${fixture.id}: plan must include at least one step.`);

    const expected = fixture.expected || {};
    let mutatingCount = 0;
    for (const step of fixture.plan.steps) {
      assertPlainObject(step, `${fixture.id}: step`);
      assertString(step.tool, `${fixture.id}: step.tool`);
      assert(KNOWN_BRIDGE_TOOLS.has(step.tool), `${fixture.id}: unknown bridge tool in fixture: ${step.tool}`);
      assert(step.tool !== "run_extendscript", `${fixture.id}: fixtures must not use inline run_extendscript.`);
      if (expected.noRawExtendscript !== false) {
        assert(step.tool !== "run_extendscript_file", `${fixture.id}: fixture should use typed tools unless raw JSX is explicitly being validated.`);
      }
      if (MUTATING_TOOLS.has(step.tool)) {
        mutatingCount += 1;
        const args = isPlainObject(step.args) ? step.args : {};
        assert(args.verifyAfter !== false, `${fixture.id}: mutating fixture must keep verifyAfter enabled.`);
        assert(
          typeof step.idempotencyKeyTemplate === "string" || typeof args.idempotencyKey === "string",
          `${fixture.id}: mutating fixture must include idempotency evidence.`
        );
      }
    }

    if (expected.stepCount !== undefined) {
      assert.strictEqual(fixture.plan.steps.length, expected.stepCount, `${fixture.id}: expected.stepCount mismatch.`);
    }
    if (expected.mutatingCount !== undefined) {
      assert.strictEqual(mutatingCount, expected.mutatingCount, `${fixture.id}: expected.mutatingCount mismatch.`);
    }
  }
}

function validatePromotionReview(review, report) {
  assertPlainObject(review, "promotion review");
  assert.strictEqual(review.schemaVersion, PROMOTION_REVIEW_SCHEMA, `schemaVersion must be ${PROMOTION_REVIEW_SCHEMA}.`);
  assert.strictEqual(review.explicitReview, true, "promotion requires explicitReview:true.");
  assert.strictEqual(review.decision, "promote", "promotion helper only writes reviewed promote decisions.");
  assert(TRACKED_STATUSES.includes(review.targetStatus), `targetStatus must be one of: ${TRACKED_STATUSES.join(", ")}.`);
  assertString(review.reviewer, "reviewer");
  assertString(review.promotionEvidence, "promotionEvidence");
  validatePlanValidationFixtures(review);

  const execution = normalizeExecution(report, review);
  normalizeTypedToolComparison(review, execution);
  validatePromotedScriptStatic(execution);
  return execution;
}

function buildPromotedSolution(report, review, options = {}) {
  validateSolutionCandidateReport(report);
  const execution = validatePromotionReview(review, report);
  const candidate = report.candidate;
  const typedToolComparison = normalizeTypedToolComparison(review, execution);
  const solution = {
    schema: SOLUTION_SCHEMA,
    id: slugId(review.id || candidate.id),
    title: review.title || candidate.title,
    status: review.targetStatus,
    tags: uniqueStrings((review.tags || candidate.tags || []).concat(execution.mode === "extendscript-file" ? ["reviewed-jsx"] : [])),
    intent: review.intent || candidate.intent,
    inputs: review.inputs || [],
    targetAssumptions: review.targetAssumptions || candidate.projectAssumptions || [],
    execution,
    requiredSafetyGates: normalizeSafetyGates(execution, review),
    verificationRecipe: review.verificationRecipe || {
      summary: candidate.verificationReadBack.summary || "Verify promoted solution output with read-back steps.",
      steps: candidate.verificationReadBack.evidence || [],
      expectedEvidence: candidate.verificationReadBack.evidence || []
    },
    testedAeContext: review.testedAeContext || {
      aeVersion: null,
      panelVersion: "AE Agent 1.0.8",
      bridgeVersion: "1.0.8",
      projectKind: "unknown",
      notes: []
    },
    promotionHistory: [
      {
        date: review.date || todayIsoDate(options.now),
        from: "candidate",
        to: review.targetStatus,
        reviewer: review.reviewer,
        evidence: review.promotionEvidence,
        commit: null
      }
    ],
    notes: uniqueStrings(review.notes || [])
  };

  if (typedToolComparison) {
    solution.typedToolComparison = typedToolComparison;
  }

  validateRegistry({
    schema: REGISTRY_SCHEMA,
    solutionSchema: SOLUTION_SCHEMA,
    updatedAt: review.date || todayIsoDate(options.now),
    policy: options.registryPolicy || {
      trackedStatuses: TRACKED_STATUSES,
      candidateLocation: "logs/solution-candidates/",
      plannerUse: PLANNER_USE,
      executionRule: "Solutions are advisory metadata; execution still uses validated Agent plans."
    },
    solutions: [solution]
  });
  return solution;
}

function promoteCandidate(candidatePath, reviewPath, options = {}) {
  const registryPath = options.registryPath || DEFAULT_REGISTRY_PATH;
  const report = readJson(candidatePath);
  const review = readJson(reviewPath);
  const registry = readJson(registryPath);
  const solution = buildPromotedSolution(report, review, {
    now: options.now,
    registryPolicy: registry.policy
  });

  assert(!registry.solutions.some((entry) => entry.id === solution.id), `registry already contains solution id: ${solution.id}`);
  const nextRegistry = {
    ...registry,
    updatedAt: review.date || todayIsoDate(options.now),
    solutions: registry.solutions.concat(solution).sort((left, right) => left.id.localeCompare(right.id))
  };
  validateRegistry(nextRegistry);

  if (options.write) {
    writeJson(registryPath, nextRegistry);
  }

  return {
    ok: true,
    wrote: Boolean(options.write),
    registryPath,
    solutionId: solution.id,
    status: solution.status,
    executionMode: solution.execution.mode,
    preferredTools: solution.execution.preferredTools,
    registrySolutionCount: nextRegistry.solutions.length,
    solution,
    registry: nextRegistry
  };
}

function promotionReviewTemplate() {
  return {
    schemaVersion: PROMOTION_REVIEW_SCHEMA,
    explicitReview: true,
    decision: "promote",
    targetStatus: "recipe",
    reviewer: "codex",
    date: todayIsoDate(),
    promotionEvidence: "Summarize validation evidence and review decision.",
    execution: {
      mode: "typed-plan",
      mutating: true,
      riskLevel: "medium",
      recipePath: "recipes/example-reviewed-recipe.md",
      scriptPath: null,
      preferredTools: ["get_active_comp"]
    },
    inputs: [],
    targetAssumptions: ["No absolute project paths."],
    requiredSafetyGates: {
      planValidation: true,
      explicitConfirmation: true,
      allowMutations: true,
      idempotency: true,
      checkpointOrEditSession: false,
      postMutationReadBack: true
    },
    verificationRecipe: {
      summary: "How to verify the promoted solution.",
      steps: ["Read back the affected target with typed inspection tools."],
      expectedEvidence: ["Observed state matches the requested outcome."]
    },
    testedAeContext: {
      aeVersion: null,
      panelVersion: "AE Agent 1.0.8",
      bridgeVersion: "1.0.8",
      projectKind: "synthetic",
      notes: []
    },
    typedToolComparison: {
      existingTypedToolFits: false,
      checkedTools: ["get_active_comp"],
      rationale: "Required only for raw ExtendScript promotions."
    },
    planValidationFixtures: [
      {
        id: "reviewed-plan-shape",
        plan: {
          summary: "Fixture plan for local validation.",
          steps: [
            {
              title: "Inspect active comp",
              tool: "get_active_comp",
              args: {}
            }
          ]
        },
        expected: {
          stepCount: 1,
          mutatingCount: 0,
          noRawExtendscript: true
        }
      }
    ],
    notes: ["Repeated stable recipes should become typed bridge tools rather than permanent raw JSX shortcuts."]
  };
}

function parseArgs(argv) {
  const args = {
    candidate: null,
    review: null,
    registry: DEFAULT_REGISTRY_PATH,
    write: false,
    printTemplate: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--print-review-template") {
      args.printTemplate = true;
    } else if (arg === "--candidate") {
      args.candidate = argv[index + 1];
      index += 1;
    } else if (arg === "--review") {
      args.review = argv[index + 1];
      index += 1;
    } else if (arg === "--registry") {
      args.registry = argv[index + 1];
      index += 1;
    } else if (arg === "--write") {
      args.write = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function printUsage() {
  console.log([
    "Usage:",
    "  node scripts\\solution-promotion-helper.js --print-review-template",
    "  node scripts\\solution-promotion-helper.js --candidate logs\\solution-candidates\\candidate.json --review review.json [--registry registry\\solutions.json] [--write]",
    "",
    "Without --write, the helper validates and prints the promoted solution preview only."
  ].join("\n"));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }
  if (args.printTemplate) {
    console.log(JSON.stringify(promotionReviewTemplate(), null, 2));
    return;
  }
  if (!args.candidate || !args.review) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const result = promoteCandidate(args.candidate, args.review, {
    registryPath: path.resolve(args.registry),
    write: args.write
  });
  console.log(JSON.stringify({
    ok: result.ok,
    wrote: result.wrote,
    registryPath: result.registryPath,
    solutionId: result.solutionId,
    status: result.status,
    executionMode: result.executionMode,
    preferredTools: result.preferredTools,
    registrySolutionCount: result.registrySolutionCount
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  PROMOTION_REVIEW_SCHEMA,
  buildPromotedSolution,
  promoteCandidate,
  promotionReviewTemplate,
  validatePromotionReview
};
