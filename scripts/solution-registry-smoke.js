"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..");
const REGISTRY_PATH = path.join(REPO_ROOT, "registry", "solutions.json");
const REGISTRY_SCHEMA = "ae-solution-registry.v1";
const SOLUTION_SCHEMA = "ae-solution.v1";
const PLANNER_USE = "advisory-retrieval-enabled";

const TRACKED_STATUSES = ["recipe", "typed-tool-candidate", "tool"];
const ALLOWED_STATUSES = new Set(TRACKED_STATUSES);
const ALLOWED_RISK_LEVELS = new Set(["low", "medium", "high"]);
const ALLOWED_EXECUTION_MODES = new Set(["typed-plan", "recipe", "extendscript-file"]);
const MAX_REVIEWED_EXTENDSCRIPT_BYTES = 16000;
const ALLOWED_INPUT_TYPES = new Set([
  "string",
  "number",
  "boolean",
  "enum",
  "array",
  "object",
  "layer-selection",
  "comp",
  "project-item",
  "file-path"
]);
const SAFETY_GATE_KEYS = [
  "planValidation",
  "explicitConfirmation",
  "allowMutations",
  "idempotency",
  "checkpointOrEditSession",
  "postMutationReadBack"
];

const ABSOLUTE_PATH_PATTERNS = [
  { label: "Windows drive path", pattern: /(^|[\s"'`])([A-Za-z]:\\)/ },
  { label: "Windows UNC path", pattern: /(^|[\s"'`])\\\\[^\\\s]+\\/ },
  { label: "Unix user path", pattern: /(^|[\s"'`])(\/Users\/|\/home\/|\/Volumes\/)/ }
];

const SECRET_PATTERNS = [
  { label: "OpenAI-style API key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { label: "provider secret environment variable", pattern: /\b(OPENAI_API_KEY|OPENAI_KEY|ANTHROPIC_API_KEY|CLAUDE_API_KEY|GEMINI_API_KEY|GOOGLE_API_KEY|AE_BRIDGE_TOKEN)\b/i },
  { label: "inline secret assignment", pattern: /\b(api[_-]?key|secret|token)\s*[:=]\s*["'][^"']{8,}["']/i }
];

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

function assertStringArray(value, label, options = {}) {
  assert(Array.isArray(value), `${label} must be an array.`);
  if (options.minItems !== undefined) {
    assert(value.length >= options.minItems, `${label} must contain at least ${options.minItems} item(s).`);
  }
  value.forEach((item, index) => assertString(item, `${label}[${index}]`));
}

function collectStrings(value, output = []) {
  if (typeof value === "string") {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, output));
    return output;
  }
  if (isPlainObject(value)) {
    Object.keys(value).forEach((key) => collectStrings(value[key], output));
  }
  return output;
}

function assertNoUnsafeText(text, label) {
  for (const item of ABSOLUTE_PATH_PATTERNS) {
    assert(!item.pattern.test(text), `${label} contains an absolute or project-specific path (${item.label}).`);
  }
  for (const item of SECRET_PATTERNS) {
    assert(!item.pattern.test(text), `${label} contains a secret-like value (${item.label}).`);
  }
}

function assertNoUnsafeStrings(value, label) {
  for (const text of collectStrings(value)) {
    assertNoUnsafeText(text, label);
  }
}

function normalizeRepoRelativePath(value, label, requiredPrefix) {
  assertString(value, label);
  assert(!path.isAbsolute(value), `${label} must be relative to the repository root.`);

  const normalized = value.replace(/\\/g, "/");
  assert(!normalized.startsWith("/"), `${label} must be relative to the repository root.`);
  assert(!normalized.split("/").includes(".."), `${label} must not escape the repository root.`);
  assert(normalized.startsWith(requiredPrefix), `${label} must live under ${requiredPrefix}.`);

  const diskPath = path.join(REPO_ROOT, ...normalized.split("/"));
  assert(fs.existsSync(diskPath), `${label} points to a missing file: ${normalized}`);
  return { normalized, diskPath };
}

function assertDateString(value, label) {
  assertString(value, label);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(value), `${label} must use YYYY-MM-DD.`);
}

function validateInputs(solution) {
  assert(Array.isArray(solution.inputs), `${solution.id}: inputs must be an array.`);
  solution.inputs.forEach((input, index) => {
    const label = `${solution.id}: inputs[${index}]`;
    assertPlainObject(input, label);
    assertString(input.name, `${label}.name`);
    assert(/^[a-z][A-Za-z0-9]*$/.test(input.name), `${label}.name must be camelCase.`);
    assertString(input.type, `${label}.type`);
    assert(ALLOWED_INPUT_TYPES.has(input.type), `${label}.type is not allowed: ${input.type}`);
    assert.strictEqual(typeof input.required, "boolean", `${label}.required must be boolean.`);
    assertString(input.description, `${label}.description`);
    if (input.type === "enum") {
      assertStringArray(input.options, `${label}.options`, { minItems: 1 });
    }
  });
}

function validateIntent(solution) {
  assertPlainObject(solution.intent, `${solution.id}: intent`);
  assertString(solution.intent.summary, `${solution.id}: intent.summary`);
  assertStringArray(solution.intent.appliesWhen, `${solution.id}: intent.appliesWhen`, { minItems: 1 });
}

function validateExecution(solution) {
  const execution = solution.execution;
  assertPlainObject(execution, `${solution.id}: execution`);
  assertString(execution.mode, `${solution.id}: execution.mode`);
  assert(ALLOWED_EXECUTION_MODES.has(execution.mode), `${solution.id}: unsupported execution mode: ${execution.mode}`);
  assert.strictEqual(typeof execution.mutating, "boolean", `${solution.id}: execution.mutating must be boolean.`);
  assertString(execution.riskLevel, `${solution.id}: execution.riskLevel`);
  assert(ALLOWED_RISK_LEVELS.has(execution.riskLevel), `${solution.id}: unsupported riskLevel: ${execution.riskLevel}`);

  assert(Array.isArray(execution.preferredTools), `${solution.id}: execution.preferredTools must be an array.`);
  execution.preferredTools.forEach((tool, index) => {
    assertString(tool, `${solution.id}: execution.preferredTools[${index}]`);
    assert(/^[a-z][a-z0-9_]*$/.test(tool), `${solution.id}: preferred tool must be a bridge tool id: ${tool}`);
  });
  assert(!execution.preferredTools.includes("run_extendscript"), `${solution.id}: promoted solutions must not recommend inline run_extendscript.`);
  if (execution.preferredTools.includes("run_extendscript_file")) {
    assert.strictEqual(execution.mode, "extendscript-file", `${solution.id}: run_extendscript_file is only allowed for reviewed file-based raw JSX.`);
  }

  if (solution.status === "tool") {
    assert(execution.preferredTools.length > 0, `${solution.id}: tool status requires preferredTools.`);
  }

  if (solution.status === "recipe" || solution.status === "typed-tool-candidate") {
    assertString(execution.recipePath, `${solution.id}: execution.recipePath`);
  }

  if (execution.recipePath !== null && execution.recipePath !== undefined) {
    const recipe = normalizeRepoRelativePath(execution.recipePath, `${solution.id}: execution.recipePath`, "recipes/");
    assert(recipe.normalized.endsWith(".md"), `${solution.id}: recipePath must point to a markdown file.`);
    assertNoUnsafeText(fs.readFileSync(recipe.diskPath, "utf8"), `${solution.id}: recipe file`);
  }

  if (execution.mode === "extendscript-file") {
    const script = normalizeRepoRelativePath(execution.scriptPath, `${solution.id}: execution.scriptPath`, "scripts/solutions/");
    assert(/\.jsx(inc)?$/.test(script.normalized), `${solution.id}: ExtendScript solution must use .jsx or .jsxinc.`);
    const source = fs.readFileSync(script.diskPath, "utf8");
    const bytes = Buffer.byteLength(source, "utf8");
    assert(bytes > 0, `${solution.id}: ExtendScript file must not be empty.`);
    assert(bytes <= MAX_REVIEWED_EXTENDSCRIPT_BYTES, `${solution.id}: ExtendScript file must stay small (${bytes} bytes > ${MAX_REVIEWED_EXTENDSCRIPT_BYTES}).`);
    assertNoUnsafeText(source, `${solution.id}: script file`);
    assert(execution.preferredTools.includes("run_extendscript_file"), `${solution.id}: file-based ExtendScript promotion must prefer run_extendscript_file.`);
    assert(!/app\.project\.file\s*=/.test(source), `${solution.id}: ExtendScript must not assign or hard-code the active project file.`);
    assert(!/app\.project\.save(?:WithDialog|As)?\s*\(/.test(source), `${solution.id}: ExtendScript solution must not save the project directly.`);
    assert(!/app\.project\.(?:item|items)\s*\([^)]*\)\.remove\s*\(/.test(source), `${solution.id}: ExtendScript must not broadly remove project items.`);
    assert(!/for\s*\([^)]*app\.project\.numItems[^)]*\)[\s\S]{0,300}\.remove\s*\(/.test(source), `${solution.id}: ExtendScript must not loop over project items and remove them.`);
    assert(!/while\s*\([^)]*app\.project\.numItems[^)]*\)[\s\S]{0,300}\.remove\s*\(/.test(source), `${solution.id}: ExtendScript must not loop over project items and remove them.`);
    assert(!/eval\s*\(/.test(source), `${solution.id}: ExtendScript must not use eval.`);
    if (execution.mutating) {
      assert(/app\.beginUndoGroup\s*\(/.test(source), `${solution.id}: mutating ExtendScript must call app.beginUndoGroup.`);
      assert(/app\.endUndoGroup\s*\(/.test(source), `${solution.id}: mutating ExtendScript must call app.endUndoGroup.`);
      if (/\.remove\s*\(|\.add(?:Text|Solid|Null|Shape)?\s*\(|items\.add|layers\.add|duplicate\s*\(/.test(source)) {
        const prefix = typeof execution.generatedPrefix === "string" ? execution.generatedPrefix.trim() : "";
        assert(prefix || /Codex|AE Agent|Generated/i.test(source), `${solution.id}: mutating generated-object JSX must document a generated prefix or comment.`);
      }
    }
    validateTypedToolComparison(solution, true);
  } else {
    assert(
      execution.scriptPath === null || execution.scriptPath === undefined,
      `${solution.id}: scriptPath is only allowed for extendscript-file execution.`
    );
  }
}

function validateTypedToolComparison(solution, rawExecution) {
  if (!rawExecution) return;
  assertPlainObject(solution.typedToolComparison, `${solution.id}: typedToolComparison`);
  assert.strictEqual(
    solution.typedToolComparison.existingTypedToolFits,
    false,
    `${solution.id}: raw ExtendScript promotion requires explicit evidence that no existing typed tool fits.`
  );
  assertStringArray(solution.typedToolComparison.checkedTools, `${solution.id}: typedToolComparison.checkedTools`, { minItems: 1 });
  assertString(solution.typedToolComparison.rationale, `${solution.id}: typedToolComparison.rationale`);
}

function validateSafetyGates(solution) {
  const gates = solution.requiredSafetyGates;
  assertPlainObject(gates, `${solution.id}: requiredSafetyGates`);
  for (const key of SAFETY_GATE_KEYS) {
    assert.strictEqual(typeof gates[key], "boolean", `${solution.id}: requiredSafetyGates.${key} must be boolean.`);
  }
  assert.strictEqual(gates.planValidation, true, `${solution.id}: planValidation must stay enabled.`);

  if (solution.execution.mutating) {
    assert.strictEqual(gates.explicitConfirmation, true, `${solution.id}: mutating solutions require explicitConfirmation.`);
    assert.strictEqual(gates.allowMutations, true, `${solution.id}: mutating solutions require allowMutations.`);
    assert.strictEqual(gates.idempotency, true, `${solution.id}: mutating solutions require idempotency.`);
    assert.strictEqual(gates.postMutationReadBack, true, `${solution.id}: mutating solutions require postMutationReadBack.`);
  } else {
    assert.strictEqual(gates.explicitConfirmation, false, `${solution.id}: read-only solutions should not require explicitConfirmation.`);
    assert.strictEqual(gates.allowMutations, false, `${solution.id}: read-only solutions must not require allowMutations.`);
  }

  if (solution.execution.mode === "extendscript-file" && solution.execution.mutating) {
    assert.strictEqual(gates.checkpointOrEditSession, true, `${solution.id}: mutating raw ExtendScript requires checkpointOrEditSession.`);
    assert.notStrictEqual(solution.execution.riskLevel, "low", `${solution.id}: mutating raw ExtendScript cannot be low risk.`);
  }

  if (solution.execution.riskLevel === "high") {
    assert.strictEqual(gates.checkpointOrEditSession, true, `${solution.id}: high-risk solutions require checkpointOrEditSession.`);
  }
}

function validateVerification(solution) {
  const verification = solution.verificationRecipe;
  assertPlainObject(verification, `${solution.id}: verificationRecipe`);
  assertString(verification.summary, `${solution.id}: verificationRecipe.summary`);
  assertStringArray(verification.steps, `${solution.id}: verificationRecipe.steps`, { minItems: solution.execution.mutating ? 1 : 0 });
  assertStringArray(verification.expectedEvidence, `${solution.id}: verificationRecipe.expectedEvidence`, { minItems: solution.execution.mutating ? 1 : 0 });
}

function validateTestedContext(solution) {
  const context = solution.testedAeContext;
  assertPlainObject(context, `${solution.id}: testedAeContext`);
  assert(
    context.aeVersion === null || typeof context.aeVersion === "string",
    `${solution.id}: testedAeContext.aeVersion must be string or null.`
  );
  assert(
    context.panelVersion === null || typeof context.panelVersion === "string",
    `${solution.id}: testedAeContext.panelVersion must be string or null.`
  );
  assert(
    context.bridgeVersion === null || typeof context.bridgeVersion === "string",
    `${solution.id}: testedAeContext.bridgeVersion must be string or null.`
  );
  assertString(context.projectKind, `${solution.id}: testedAeContext.projectKind`);
  assert(["unknown", "synthetic", "live-readonly", "live-generated"].includes(context.projectKind), `${solution.id}: unsupported projectKind.`);
  assertStringArray(context.notes, `${solution.id}: testedAeContext.notes`);
}

function validatePromotionHistory(solution) {
  assert(Array.isArray(solution.promotionHistory), `${solution.id}: promotionHistory must be an array.`);
  assert(solution.promotionHistory.length > 0, `${solution.id}: tracked solutions require promotionHistory evidence.`);
  solution.promotionHistory.forEach((entry, index) => {
    const label = `${solution.id}: promotionHistory[${index}]`;
    assertPlainObject(entry, label);
    assertDateString(entry.date, `${label}.date`);
    assertString(entry.from, `${label}.from`);
    assertString(entry.to, `${label}.to`);
    assert(ALLOWED_STATUSES.has(entry.to), `${label}.to must be a tracked status.`);
    assertString(entry.reviewer, `${label}.reviewer`);
    assertString(entry.evidence, `${label}.evidence`);
    assert(entry.commit === null || typeof entry.commit === "string", `${label}.commit must be string or null.`);
  });
}

function validateSolution(solution, ids) {
  assertPlainObject(solution, "solution entry");
  assert.strictEqual(solution.schema, SOLUTION_SCHEMA, `${solution.id || "solution"}: schema must be ${SOLUTION_SCHEMA}.`);
  assertString(solution.id, "solution.id");
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(solution.id), `${solution.id}: id must be kebab-case.`);
  assert(!ids.has(solution.id), `Duplicate solution id: ${solution.id}`);
  ids.add(solution.id);

  assertString(solution.title, `${solution.id}: title`);
  assertString(solution.status, `${solution.id}: status`);
  assert(ALLOWED_STATUSES.has(solution.status), `${solution.id}: tracked registry does not allow status: ${solution.status}`);
  assertStringArray(solution.tags, `${solution.id}: tags`, { minItems: 1 });
  assertStringArray(solution.targetAssumptions, `${solution.id}: targetAssumptions`, { minItems: solution.execution && solution.execution.mutating ? 1 : 0 });
  validateIntent(solution);
  validateInputs(solution);
  validateExecution(solution);
  validateSafetyGates(solution);
  validateVerification(solution);
  validateTestedContext(solution);
  validatePromotionHistory(solution);
  assertStringArray(solution.notes, `${solution.id}: notes`);
  assertNoUnsafeStrings(solution, `${solution.id}: registry entry`);
}

function validateRegistry(registry) {
  assertPlainObject(registry, "registry");
  assert.strictEqual(registry.schema, REGISTRY_SCHEMA, `registry.schema must be ${REGISTRY_SCHEMA}.`);
  assert.strictEqual(registry.solutionSchema, SOLUTION_SCHEMA, `registry.solutionSchema must be ${SOLUTION_SCHEMA}.`);
  assertDateString(registry.updatedAt, "registry.updatedAt");
  assertPlainObject(registry.policy, "registry.policy");
  assert.deepStrictEqual(registry.policy.trackedStatuses, TRACKED_STATUSES, "registry.policy.trackedStatuses changed unexpectedly.");
  assert.strictEqual(registry.policy.candidateLocation, "logs/solution-candidates/", "registry.policy.candidateLocation must point to ignored candidate quarantine.");
  assert.strictEqual(registry.policy.plannerUse, PLANNER_USE, "registry.policy.plannerUse must enable read-only advisory retrieval.");
  assertString(registry.policy.executionRule, "registry.policy.executionRule");
  assert(Array.isArray(registry.solutions), "registry.solutions must be an array.");
  assertNoUnsafeStrings(registry.policy, "registry.policy");

  const ids = new Set();
  for (const solution of registry.solutions) {
    validateSolution(solution, ids);
  }

  return {
    schema: registry.schema,
    solutionSchema: registry.solutionSchema,
    solutionCount: registry.solutions.length,
    ids: Array.from(ids).sort(),
    trackedStatuses: registry.policy.trackedStatuses
  };
}

function readRegistry() {
  const text = fs.readFileSync(REGISTRY_PATH, "utf8");
  assertNoUnsafeText(text, "registry file");
  return JSON.parse(text);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function fixtureRegistry(solutions) {
  return {
    schema: REGISTRY_SCHEMA,
    solutionSchema: SOLUTION_SCHEMA,
    updatedAt: "2026-05-15",
    policy: {
      trackedStatuses: TRACKED_STATUSES,
      candidateLocation: "logs/solution-candidates/",
      plannerUse: PLANNER_USE,
      executionRule: "Solutions are advisory metadata; execution still uses validated Agent plans."
    },
    solutions
  };
}

function fixtureSolution(overrides = {}) {
  const solution = {
    schema: SOLUTION_SCHEMA,
    id: "fixture-readonly-recipe",
    title: "Fixture Read-only Recipe",
    status: "recipe",
    tags: ["fixture", "read-only"],
    intent: {
      summary: "Inspect the active composition without changing the project.",
      appliesWhen: ["A user asks for active composition details."]
    },
    inputs: [
      {
        name: "activeComp",
        type: "comp",
        required: true,
        description: "The active composition returned by get_active_comp."
      }
    ],
    targetAssumptions: [],
    execution: {
      mode: "typed-plan",
      mutating: false,
      riskLevel: "low",
      recipePath: "recipes/README.md",
      scriptPath: null,
      preferredTools: ["get_active_comp"]
    },
    requiredSafetyGates: {
      planValidation: true,
      explicitConfirmation: false,
      allowMutations: false,
      idempotency: false,
      checkpointOrEditSession: false,
      postMutationReadBack: false
    },
    verificationRecipe: {
      summary: "The plan returns active comp metadata only.",
      steps: [],
      expectedEvidence: []
    },
    testedAeContext: {
      aeVersion: null,
      panelVersion: "AE Agent 1.0.0",
      bridgeVersion: "1.0.0",
      projectKind: "synthetic",
      notes: []
    },
    promotionHistory: [
      {
        date: "2026-05-15",
        from: "candidate",
        to: "recipe",
        reviewer: "codex",
        evidence: "Validator fixture coverage.",
        commit: null
      }
    ],
    notes: []
  };
  return Object.assign(solution, overrides);
}

function assertValidationRejects(registry, pattern, label) {
  assert.throws(() => validateRegistry(registry), pattern, label);
}

function runValidatorSelfTest() {
  const valid = fixtureSolution();
  validateRegistry(fixtureRegistry([valid]));

  assertValidationRejects(
    fixtureRegistry([fixtureSolution({ status: "candidate" })]),
    /does not allow status: candidate/,
    "tracked candidate entries must be rejected"
  );

  const absolutePath = cloneJson(valid);
  absolutePath.intent.summary = "Inspect C:\\Projects\\client\\shot.aep";
  assertValidationRejects(fixtureRegistry([absolutePath]), /absolute or project-specific path/, "absolute paths must be rejected");

  const rawScript = cloneJson(valid);
  rawScript.id = "fixture-raw-script";
  rawScript.execution.mode = "extendscript-file";
  rawScript.execution.mutating = true;
  rawScript.execution.riskLevel = "medium";
  rawScript.execution.recipePath = "recipes/README.md";
  rawScript.execution.scriptPath = "scripts/solutions/missing.jsx";
  rawScript.targetAssumptions = ["A generated test comp is active."];
  rawScript.requiredSafetyGates.explicitConfirmation = true;
  rawScript.requiredSafetyGates.allowMutations = true;
  rawScript.requiredSafetyGates.idempotency = true;
  rawScript.requiredSafetyGates.checkpointOrEditSession = true;
  rawScript.requiredSafetyGates.postMutationReadBack = true;
  rawScript.verificationRecipe.steps = ["Read back generated test comp state."];
  rawScript.verificationRecipe.expectedEvidence = ["Generated test comp contains expected layers."];
  assertValidationRejects(fixtureRegistry([rawScript]), /missing file: scripts\/solutions\/missing\.jsx/, "raw scripts must be reviewed files under scripts/solutions");

  const tempScriptRelative = "scripts/solutions/.tmp-solution-registry-smoke.jsx";
  const tempScriptPath = path.join(REPO_ROOT, ...tempScriptRelative.split("/"));
  try {
    fs.writeFileSync(tempScriptPath, [
      "// AE Agent generated-prefix fixture: Codex Registry Smoke",
      "app.beginUndoGroup('Registry smoke fixture');",
      "var comp = app.project && app.project.activeItem;",
      "if (comp && comp.layers) {",
      "  var layer = comp.layers.addText('Codex Registry Smoke');",
      "  layer.comment = 'Generated by AE Agent registry smoke';",
      "}",
      "app.endUndoGroup();",
      ""
    ].join("\n"), "utf8");

    const reviewedRawScript = cloneJson(rawScript);
    reviewedRawScript.id = "fixture-reviewed-raw-script";
    reviewedRawScript.execution.scriptPath = tempScriptRelative;
    reviewedRawScript.execution.preferredTools = ["run_extendscript_file"];
    reviewedRawScript.execution.generatedPrefix = "Codex Registry Smoke";
    reviewedRawScript.typedToolComparison = {
      existingTypedToolFits: false,
      checkedTools: ["create_text_layer"],
      rationale: "Fixture only; raw promotion requires proof no typed bridge tool fits."
    };
    validateRegistry(fixtureRegistry([reviewedRawScript]));

    const inlineRawPreferred = cloneJson(reviewedRawScript);
    inlineRawPreferred.id = "fixture-inline-raw-preferred";
    inlineRawPreferred.execution.preferredTools = ["run_extendscript"];
    assertValidationRejects(
      fixtureRegistry([inlineRawPreferred]),
      /inline run_extendscript/,
      "promoted solutions must not recommend inline raw ExtendScript"
    );
  } finally {
    if (fs.existsSync(tempScriptPath)) {
      fs.unlinkSync(tempScriptPath);
    }
  }
}

function main() {
  runValidatorSelfTest();
  const summary = validateRegistry(readRegistry());
  console.log(JSON.stringify({ ok: true, registryPath: path.relative(REPO_ROOT, REGISTRY_PATH), selfTestCases: 6, ...summary }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  REGISTRY_SCHEMA,
  SOLUTION_SCHEMA,
  TRACKED_STATUSES,
  PLANNER_USE,
  validateRegistry
};
