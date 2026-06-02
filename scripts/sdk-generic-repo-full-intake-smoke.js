"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repo = path.resolve(__dirname, "..");
const runner = path.join(repo, "orchestrator/run-generic-repo-full-intake.mjs");

function sh(cwd, args, options = {}) {
  const result = spawnSync(args[0], args.slice(1), {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...(options.env || {}) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function run(args, cwd = repo, env = {}) {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function parseJson(result) {
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function assertCompactParentOutputIsBounded(rawOutput, output) {
  const text = rawOutput || JSON.stringify(output);
  assert.strictEqual(output.schema, "generic-repo-full-intake.parent-compact-output.v1");
  assert(!Object.prototype.hasOwnProperty.call(output, "items"), "compact parent output must not include full items array");
  assert(!Array.isArray(output.resolutionQueue?.tickets), "compact parent output must not include resolutionQueue.tickets");
  for (const forbidden of [
    '"stdout"',
    '"stderr"',
    '"transcript"',
    '"prompt"',
    '"importer"',
    '"result"',
    '"batchReport"',
    '"state"',
    "batch-report.json",
    "HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH",
    "EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE"
  ]) {
    assert(!text.includes(forbidden), `compact parent output leaked forbidden content: ${forbidden}`);
  }
}

function createFixture(name) {
  const parent = path.resolve(os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, `generic-full-intake-${name}-`));
  assert(root.startsWith(`${parent}${path.sep}`), `unexpected temp path: ${root}`);
  const target = path.join(root, "target");
  const source = path.join(root, "source-checkout");
  fs.mkdirSync(target, { recursive: true });
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(path.join(source, "Compositions"), { recursive: true });
  fs.mkdirSync(path.join(source, "Expressions"), { recursive: true });
  fs.mkdirSync(path.join(source, "Keyframes"), { recursive: true });
  fs.mkdirSync(path.join(source, "Layers"), { recursive: true });
  fs.mkdirSync(path.join(source, "Project"), { recursive: true });
  fs.mkdirSync(path.join(source, "Properties"), { recursive: true });
  fs.writeFileSync(path.join(source, "README.md"), "# Source fixture\n", "utf8");
  fs.writeFileSync(path.join(source, "LICENSE"), "Fixture license\n", "utf8");
  fs.writeFileSync(path.join(source, "package.json"), "{\"name\":\"source-fixture\"}\n", "utf8");
  fs.writeFileSync(
    path.join(source, "Compositions", "Add_Composition_Guide.jsx"),
    "function addCompositionGuide() { return true; }\n",
    "utf8"
  );
  fs.writeFileSync(
    path.join(source, "Compositions", "Add_Posterize_Time_Adjustment_Layer.jsx"),
    "function addPosterizeTimeAdjustmentLayer() { return true; }\n",
    "utf8"
  );
  fs.writeFileSync(
    path.join(source, "Compositions", "Change_Nested_Composition_Work_Area.jsx"),
    "function changeNestedCompositionWorkArea() { return true; }\n",
    "utf8"
  );
  fs.writeFileSync(
    path.join(source, "Expressions", "Add_Simple_Loop_Expression.jsx"),
    "function addSimpleLoopExpression() { return true; }\n",
    "utf8"
  );
  fs.writeFileSync(
    path.join(source, "Keyframes", "Round_Selected_Keyframe_Values.jsx"),
    "function roundSelectedKeyframeValues() { return true; }\n",
    "utf8"
  );
  fs.writeFileSync(path.join(source, "Layers", "Read_Only_Fixture.jsx"), "function readOnlyTool() { return true; }\n", "utf8");
  fs.writeFileSync(path.join(source, "Layers", "Extend_All_Layers.jsx"), "function extendAllLayers() { return true; }\n", "utf8");
  fs.writeFileSync(path.join(source, "Layers", "Shift_Layer_Start_Time.jsx"), "function shiftLayerStartTime() { return true; }\n", "utf8");
  fs.writeFileSync(path.join(source, "Project", "Add_Selected_Compositions_To_Render_Queue.jsx"), "function addSelectedCompsToRenderQueue() { return true; }\n", "utf8");
  fs.writeFileSync(path.join(source, "Properties", "Set_Selected_Property_Value.jsx"), "function setSelectedPropertyValue() { return true; }\n", "utf8");

  fs.mkdirSync(path.join(target, "plans"), { recursive: true });
  fs.mkdirSync(path.join(target, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(target, ".gitignore"), ".codex-runtime/\n.codex/\n", "utf8");
  fs.writeFileSync(
    path.join(target, "plans", "target-app-execplan.md"),
    [
      "# Target App Execution Plan",
      "",
      "## Progress",
      "",
      "- [x] Fixture baseline.",
      "",
      "## Decision Log",
      "",
      "- Fixture decision.",
      "",
      "## Validation",
      "",
      "| Item | Requirement | Evidence |",
      "| --- | --- | --- |",
      "| Fixture | Baseline | Passed. |",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(
    path.join(target, "scripts", "cep-panel-cdp-smoke.js"),
    [
      '"use strict";',
      "const command = process.argv[2] || 'inspect';",
      "if (command === 'inspect' || command === 'connector-status-smoke' || /openai-cli-smoke$/.test(command)) {",
      '  if (/openai-cli-smoke$/.test(command) && process.env.FAKE_LIVE_PROOF_FAIL === "1") {',
      '    console.error("fixture live proof failed");',
      "    process.exit(7);",
      "  }",
      "  console.log(JSON.stringify({ ok: true, command }));",
      "  process.exit(0);",
      "}",
      "console.error(`unexpected command ${command}`);",
      "process.exit(2);",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(path.join(target, "scripts", "fail-live-lane.js"), "process.exit(7);\n", "utf8");
  fs.writeFileSync(
    path.join(target, "scripts", "flaky-live-proof.js"),
    [
      '"use strict";',
      'if (process.env.FAKE_LIVE_PROOF_FAIL === "1") {',
      '  console.error("fixture live proof failed");',
      "  process.exit(7);",
      "}",
      'console.log(JSON.stringify({ ok: true, proof: "flaky-live-proof" }));',
      ""
    ].join("\n"),
    "utf8"
  );

  sh(target, ["git", "init", "-b", "main"]);
  sh(target, ["git", "config", "user.name", "Fixture"]);
  sh(target, ["git", "config", "user.email", "fixture@example.local"]);
  sh(target, ["git", "add", "."]);
  sh(target, ["git", "commit", "-m", "fixture baseline"]);

  const head = sh(target, ["git", "rev-parse", "HEAD"]);
  return { root, source, target, head };
}

function removeFixture(root) {
  if (process.env.KEEP_GENERIC_FULL_INTAKE_FIXTURES === "1") {
    return;
  }
  const parent = path.resolve(os.tmpdir());
  if (!root || !root.startsWith(`${parent}${path.sep}`)) {
    throw new Error(`refusing to remove unexpected temp path: ${root}`);
  }
  fs.rmSync(root, { recursive: true, force: true });
}

function findFiles(root, predicate) {
  if (!fs.existsSync(root)) {
    return [];
  }
  const found = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      found.push(...findFiles(absolute, predicate));
    } else if (predicate(absolute)) {
      found.push(absolute);
    }
  }
  return found.sort();
}

function writeFakeCodex(root) {
  const binDir = path.join(root, "fake-bin");
  fs.mkdirSync(binDir, { recursive: true });
  const fakeScript = path.join(binDir, "fake-codex.js");
  fs.writeFileSync(
    fakeScript,
    [
      '"use strict";',
      'const fs = require("fs");',
      'const path = require("path");',
      'const cdIndex = process.argv.indexOf("--cd");',
      'const cwd = cdIndex >= 0 ? process.argv[cdIndex + 1] : process.cwd();',
      'let input = "";',
      'process.stdin.setEncoding("utf8");',
      'process.stdin.on("data", (chunk) => { input += chunk; });',
      'process.stdin.on("end", () => {',
      '  if (!input.includes("AUX-021 generic repository importer child-run execution wrapper")) {',
      '    console.error("missing AUX-021 wrapper");',
      '    process.exit(9);',
      '  }',
      '  if (process.argv[process.argv.indexOf("--model") + 1] !== "gpt-5.5") {',
      '    console.error("missing gpt-5.5 writer model");',
      '    process.exit(10);',
      '  }',
      '  if (!process.argv.includes("model_reasoning_effort=\\"high\\"")) {',
      '    console.error("missing high reasoning effort");',
      '    process.exit(11);',
      '  }',
      '  const match = input.match(/<child_run_intent_json>\\n([\\s\\S]*?)\\n<\\/child_run_intent_json>/);',
      '  const intent = match ? JSON.parse(match[1]) : { plannedPaths: [] };',
      '  const packMatch = input.match(/<child_run_context_pack_json>\\n([\\s\\S]*?)\\n<\\/child_run_context_pack_json>/);',
      '  if (!packMatch) {',
      '    console.error("missing compact child context pack");',
      '    process.exit(12);',
      '  }',
      '  const contextPack = JSON.parse(packMatch[1]);',
      '  if (contextPack.schema !== "generic-repo-tool-importer.child-run-context-pack.v1") {',
      '    console.error("bad compact child context pack schema");',
      '    process.exit(13);',
      '  }',
      '  if (contextPack.promptArtifact.fullPromptOmittedFromChildStdin !== true) {',
      '    console.error("prompt artifact should be omitted from child stdin");',
      '    process.exit(14);',
      '  }',
      '  if (Buffer.byteLength(input, "utf8") > 32 * 1024) {',
      '    console.error("child stdin prompt too large");',
      '    process.exit(15);',
      '  }',
      '  const relative = process.env.FAKE_CODEX_WRITE_PATH || intent.plannedPaths.find((item) => /\\.js$/i.test(item)) || intent.plannedPaths[0];',
      '  if (!relative) {',
      '    console.error("missing planned path");',
      '    process.exit(8);',
      '  }',
      '  const absolute = path.join(cwd, relative);',
      '  fs.mkdirSync(path.dirname(absolute), { recursive: true });',
      '  fs.writeFileSync(absolute, `// fake full-intake import\\nmodule.exports = ${JSON.stringify(relative)};\\n`, "utf8");',
      '  if (process.env.FAKE_CODEX_HUGE_STDOUT === "1") {',
      '    console.log("H".repeat(512 * 1024));',
      '    console.error("E".repeat(256 * 1024));',
      '  }',
      '  console.log(`fake codex wrote ${relative}`);',
      '});',
      ""
    ].join("\n"),
    "utf8"
  );

  if (process.platform === "win32") {
    fs.writeFileSync(path.join(binDir, "codex.cmd"), '@echo off\r\nnode "%~dp0fake-codex.js" %*\r\n', "utf8");
  } else {
    const binPath = path.join(binDir, "codex");
    fs.writeFileSync(binPath, `#!/bin/sh\nnode "${fakeScript}" "$@"\n`, "utf8");
    fs.chmodSync(binPath, 0o755);
  }
  return binDir;
}

function fakeCodexEnv(binDir) {
  const currentPath = process.env.PATH || process.env.Path || "";
  const nextPath = `${binDir}${path.delimiter}${currentPath}`;
  return {
    PATH: nextPath,
    Path: nextPath
  };
}

function entry(overrides = {}) {
  return {
    id: "tool-compositions-add-composition-guide",
    sourcePath: "Compositions/Add_Composition_Guide.jsx",
    name: "Add Composition Guide",
    description: "Fixture composition guide.",
    sourceSha256: "fixture",
    sourceBytes: 128,
    status: "queued",
    classification: "small_safe_typed_tool_library_recipe_addition",
    shortReason: "Fixture safe candidate.",
    suggestedTools: ["create_comp", "create_shape_layer", "get_comp_details", "get_layer_details"],
    liveGate: { required: true, status: "needed_or_reusable_lane_required" },
    implementation: {
      sliceId: "fixture-composition-guide-import",
      plannedPaths: ["scripts/imported-tools/composition-guide.js"]
    },
    safetySignals: {},
    queueRank: 1,
    ...overrides
  };
}

function posterizeEntry(overrides = {}) {
  return entry({
    id: "tool-compositions-add-posterize-time-adjustment-layer",
    sourcePath: "Compositions/Add_Posterize_Time_Adjustment_Layer.jsx",
    name: "Add Posterize Time Adjustment Layer",
    description: "Fixture generated shape/effect-style layer candidate.",
    suggestedTools: ["get_active_comp", "create_shape_layer", "add_effect", "get_layer_details"],
    implementation: {
      sliceId: "fixture-posterize-time-import",
      plannedPaths: ["scripts/imported-tools/posterize-time.js"]
    },
    ...overrides
  });
}

function timingEntry(overrides = {}) {
  return entry({
    id: "tool-layers-extend-all-layers",
    sourcePath: "Layers/Extend_All_Layers.jsx",
    name: "Extend All Layers",
    description: "Fixture generated layer timing candidate.",
    suggestedTools: ["get_active_comp", "get_selected_layers", "set_layer_time_range", "stagger_layers", "get_comp_details"],
    implementation: {
      sliceId: "fixture-layer-timing-import",
      plannedPaths: ["scripts/imported-tools/layer-timing.js"]
    },
    ...overrides
  });
}

function expressionLiveLaneNeededEntry(overrides = {}) {
  return entry({
    id: "tool-expressions-add-simple-loop-expression",
    sourcePath: "Expressions/Add_Simple_Loop_Expression.jsx",
    name: "Add Simple Loop Expression",
    description: "Fixture expression set/clear live-lane-needed candidate.",
    classification: "live_lane_needed",
    shortReason: "Expression edits need generated-only set/clear proof.",
    suggestedTools: ["get_active_comp", "get_selected_properties", "set_expression", "clear_expression", "get_layer_details"],
    implementation: {
      sliceId: "fixture-expression-import",
      plannedPaths: ["scripts/imported-tools/expression.js"]
    },
    queueRank: null,
    ...overrides
  });
}

function compPropertiesLiveLaneNeededEntry(overrides = {}) {
  return entry({
    id: "tool-compositions-change-nested-composition-work-area",
    sourcePath: "Compositions/Change_Nested_Composition_Work_Area.jsx",
    name: "Change Nested Composition Work Area",
    description: "Fixture comp properties/work-area live-lane-needed candidate.",
    classification: "live_lane_needed",
    shortReason: "Comp property edits need generated-only set_comp_properties/set_comp_work_area proof.",
    suggestedTools: [
      "get_active_comp",
      "get_comp_details",
      "set_comp_properties",
      "set_comp_work_area",
      "rename_project_items",
      "set_property_value"
    ],
    implementation: {
      sliceId: "fixture-comp-properties-import",
      plannedPaths: ["scripts/imported-tools/comp-properties.js"]
    },
    queueRank: null,
    ...overrides
  });
}

function selectedPropertyValueLiveLaneNeededEntry(overrides = {}) {
  return entry({
    id: "tool-properties-set-selected-property-value",
    sourcePath: "Properties/Set_Selected_Property_Value.jsx",
    name: "Set Selected Property Value",
    description: "Fixture unknown selected-property value live-lane-needed candidate.",
    classification: "live_lane_needed",
    shortReason: "Selected property value edits need a generated-only value proof.",
    suggestedTools: ["get_active_comp", "get_selected_properties", "set_property_value", "get_layer_details"],
    implementation: {
      sliceId: "fixture-selected-property-value-import",
      plannedPaths: ["scripts/imported-tools/selected-property-value.js"]
    },
    queueRank: null,
    ...overrides
  });
}

function keyframeLiveLaneNeededEntry(overrides = {}) {
  return entry({
    id: "tool-keyframes-round-selected-keyframe-values",
    sourcePath: "Keyframes/Round_Selected_Keyframe_Values.jsx",
    name: "Round Selected Keyframe Values",
    description: "Fixture selected-property keyframe live-lane-needed candidate.",
    classification: "live_lane_needed",
    shortReason: "Keyframe edits need generated-only set/ease proof.",
    suggestedTools: ["get_active_comp", "get_selected_properties", "set_property_keyframes", "apply_keyframe_ease", "get_layer_details"],
    implementation: {
      sliceId: "fixture-keyframe-import",
      plannedPaths: ["scripts/imported-tools/keyframes.js"]
    },
    queueRank: null,
    ...overrides
  });
}

function renderQueueLiveLaneNeededEntry(overrides = {}) {
  return entry({
    id: "tool-project-add-selected-compositions-to-render-queue",
    sourcePath: "Project/Add_Selected_Compositions_To_Render_Queue.jsx",
    name: "Add Selected Compositions To Render Queue",
    description: "Fixture render queue live-lane-needed candidate.",
    classification: "live_lane_needed",
    shortReason: "Render queue edits need generated-only setup, read-back, and cleanup proof.",
    suggestedTools: ["get_project_info", "add_comp_to_render_queue", "set_render_queue_output", "get_render_queue_status"],
    implementation: {
      sliceId: "fixture-render-queue-import",
      plannedPaths: ["scripts/imported-tools/render-queue.js"]
    },
    safetySignals: { usesRenderQueue: true },
    queueRank: null,
    ...overrides
  });
}

function validLedger(fixture, entries = null) {
  const ledgerEntries = entries || [entry()];
  return {
    schema: "generic-repo-importer.fixture-ledger.v1",
    source: {
      repo: "fixture/source",
      checkout: fixture.source,
      revision: "fixture"
    },
    target: {
      repoPath: fixture.target,
      branch: "main",
      head: fixture.head,
      remoteName: "fixture",
      remoteBranch: "main"
    },
    constraints: {
      noLocalOllama: true,
      noDependencyOrPackageChanges: true,
      noRawJsxCopiedIntoProduct: true,
      noUserAssetMutation: true
    },
    entries: ledgerEntries,
    nextCandidate: {
      id: ledgerEntries[0].id,
      sourcePath: ledgerEntries[0].sourcePath,
      classification: ledgerEntries[0].classification,
      suggestedTools: ledgerEntries[0].suggestedTools,
      reason: "Fixture next candidate."
    }
  };
}

function writeLedger(fixture, ledger, name = "queue-ledger.json") {
  const ledgerPath = path.join(fixture.target, ".codex-runtime", "sdk", "generic-repo-importer", "fixture-intake", name);
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  return ledgerPath;
}

function writeRegistry(fixture, overrides = {}) {
  const entries = Object.prototype.hasOwnProperty.call(overrides, "entries")
    ? overrides.entries
    : [
        {
          candidateId: "tool-compositions-add-composition-guide",
          laneId: "fixture-composition-guide-openai-cli",
          command: "node scripts/cep-panel-cdp-smoke.js full-ui-agent-fixture-openai-cli-smoke",
          providerPath: "openai-cli",
          scope: "fixture generated-only OpenAI CLI lane",
          plannedPaths: ["scripts/cep-panel-cdp-smoke.js"],
          nonLiveValidationCommands: ["node --check scripts/cep-panel-cdp-smoke.js"],
          ...(overrides.entry || {})
        }
      ];
  const registry = {
    schema: "generic-repo-live-lane-registry.v1",
    entries,
    selfImprovementFamilies: overrides.selfImprovementFamilies || []
  };
  const registryPath = path.join(fixture.root, "live-lane-registry.json");
  fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  return registryPath;
}

function withDefaultContextPercent(extraArgs) {
  return extraArgs.includes("--context-percent") ? extraArgs : ["--context-percent", "5", ...extraArgs];
}

function runFullIntakeFixture(fixture, ledgerPath, registryPath, runId, maxItems, env = {}, extraArgs = []) {
  const batchArgs = maxItems > 1 ? ["--allow-batch-mode"] : [];
  const contextArgs = withDefaultContextPercent(extraArgs);
  return run(
    [
      "--ledger",
      ledgerPath,
      "--live-lane-registry",
      registryPath,
      "--run-id",
      runId,
      "--max-items",
      String(maxItems),
      "--target-repo",
      fixture.target,
      "--json",
      "--allow-full-json-for-debug",
      ...batchArgs,
      ...contextArgs
    ],
    repo,
    env
  );
}

function runFullIntakeFixtureCompactPhase(fixture, ledgerPath, registryPath, runId, maxItems, env = {}, extraArgs = []) {
  const batchArgs = maxItems > 1 ? ["--allow-batch-mode"] : [];
  const contextArgs = withDefaultContextPercent(extraArgs);
  return run(
    [
      "--ledger",
      ledgerPath,
      "--live-lane-registry",
      registryPath,
      "--run-id",
      runId,
      "--max-items",
      String(maxItems),
      "--target-repo",
      fixture.target,
      "--compact-json",
      ...batchArgs,
      ...contextArgs
    ],
    repo,
    env
  );
}

function runFullIntakeFixtureCompact(fixture, ledgerPath, registryPath, runId, maxItems, env = {}, extraArgs = []) {
  let last = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    last = runFullIntakeFixtureCompactPhase(fixture, ledgerPath, registryPath, runId, maxItems, env, extraArgs);
    if (last.status !== 0) {
      return last;
    }
    const output = JSON.parse(last.stdout);
    if (output.status !== "phase_boundary") {
      return last;
    }
  }
  return last;
}

function parseJsonFromAnyStatus(result) {
  assert(result.stdout && result.stdout.trim(), result.stderr || "expected JSON stdout");
  return JSON.parse(result.stdout);
}

function parallelRecipeContent(id) {
  return [
    `# ${id}`,
    "",
    "Fixture-only parallel candidate recipe.",
    "",
    "- Uses typed tools only.",
    "- Requires parent-owned reducer acceptance.",
    ""
  ].join("\n");
}

function parallelSolution(solutionId, recipePath) {
  return {
    schema: "ae-solution.v1",
    id: solutionId,
    title: solutionId.replace(/-/g, " "),
    status: "recipe",
    tags: ["fixture", "parallel-candidate"],
    intent: {
      summary: "Fixture parallel candidate proposal.",
      appliesWhen: ["A fixture smoke needs a deterministic structured registry merge."]
    },
    inputs: [],
    targetAssumptions: ["Fixture-only entry."],
    execution: {
      mode: "typed-plan",
      mutating: false,
      riskLevel: "low",
      recipePath,
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
      summary: "Fixture registry merge can retrieve the advisory recipe.",
      steps: [],
      expectedEvidence: []
    },
    testedAeContext: {
      aeVersion: null,
      panelVersion: "fixture",
      bridgeVersion: "fixture",
      projectKind: "fixture",
      notes: ["Generated by parallel candidate worktree smoke."]
    },
    promotionHistory: [
      {
        date: "2026-06-02",
        from: "fixture",
        to: "recipe",
        reviewer: "codex",
        evidence: "parallel candidate worktree smoke"
      }
    ]
  };
}

function parallelProposal(recipePath, solutionId, overrides = {}) {
  return {
    structuredChanges: {
      recipe: {
        path: recipePath,
        content: parallelRecipeContent(solutionId)
      },
      registrySolutions: [parallelSolution(solutionId, recipePath)],
      smokeEntries: overrides.smokeEntry
        ? [
            {
              id: `${solutionId}-smoke`,
              file: "scripts/solution-library-validation-smoke.js",
              appendText: `\n// fixture parallel smoke entry ${solutionId}\n`
            }
          ]
        : []
    },
    validationCommands: ["node --check scripts/solution-library-validation-smoke.js"],
    validationResults: [{ command: "node --check scripts/solution-library-validation-smoke.js", status: "passed" }],
    ...overrides
  };
}

function parallelEntry(id, rank, overrides = {}) {
  const sourceBase = id
    .replace(/^tool-/, "")
    .replace(/-/g, "_")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  return entry({
    id,
    sourcePath: `Selection/${sourceBase}.jsx`,
    classification: "existing_typed_tools_recipe_only",
    liveGate: { required: false, status: "not_required_for_fixture" },
    suggestedTools: ["get_active_comp", "get_selected_layers"],
    implementation: {
      sliceId: `${id}-slice`,
      plannedPaths: [],
      ...(overrides.implementation || {})
    },
    queueRank: rank,
    ...overrides,
    implementation: {
      sliceId: `${id}-slice`,
      plannedPaths: [],
      ...(overrides.implementation || {})
    }
  });
}

function assertParallelCandidateWorktreesOptInAndPlanning() {
  const fixture = createFixture("pp");
  try {
    const candidate = parallelEntry("tool-parallel-plan-only", 1);
    const ledgerPath = writeLedger(fixture, validLedger(fixture, [candidate]));
    const registryPath = writeRegistry(fixture, { entries: [] });
    const output = parseJson(runFullIntakeFixture(
      fixture,
      ledgerPath,
      registryPath,
      "pp",
      1,
      {},
      ["--plan-parallel-candidate-worktrees", "--parallel-candidate-limit", "2"]
    ));
    assert.strictEqual(output.status, "parallel_plan_ready");
    assert.strictEqual(output.parallel.optIn, true);
    assert.strictEqual(output.parallel.mode, "parallel_plan_only");
    assert.deepStrictEqual(output.parallel.selectedCandidateIds, ["tool-parallel-plan-only"]);
    assert.strictEqual(output.parallel.worktrees.created, 0);
    const planPath = path.join(fixture.target, output.parallel.planPath);
    assert(fs.existsSync(planPath), "parallel planning artifact should exist");
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    assert.strictEqual(ledger.entries[0].status, "queued", "planning must not mutate ledger");
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertParallelWorktreesAndProposalSchema() {
  const fixture = createFixture("pws");
  try {
    const candidate = parallelEntry("tool-parallel-schema", 1);
    const ledgerPath = writeLedger(fixture, validLedger(fixture, [candidate]));
    const registryPath = writeRegistry(fixture, { entries: [] });
    const output = parseJson(runFullIntakeFixture(
      fixture,
      ledgerPath,
      registryPath,
      "pws",
      1,
      {},
      ["--parallel-candidate-worktrees", "--parallel-candidate-limit", "1"]
    ));
    assert.strictEqual(output.status, "parallel_proposals_blocked");
    assert.strictEqual(output.parallel.worktrees.created, 1);
    assert.strictEqual(output.parallel.worktrees.detached, 1);
    assert.strictEqual(output.parallel.worktrees.runOwned, 1);
    assert.strictEqual(output.parallel.worktrees.cleaned, 1);
    const proposalPath = path.join(fixture.target, output.parallel.proposals[0].path);
    const proposal = JSON.parse(fs.readFileSync(proposalPath, "utf8"));
    assert.strictEqual(proposal.schema, "generic-repo-full-intake.parallel-candidate-proposal.v1");
    assert.strictEqual(proposal.candidateId, "tool-parallel-schema");
    assert.strictEqual(proposal.status, "blocked");
    assert.strictEqual(proposal.liveRerunRequired, false);
    assert(proposal.proofSha256, "proposal should include proof hash");
    assert(proposal.worktreePath.includes(`${path.sep}codex-pi${path.sep}`));
    assert.strictEqual(fs.existsSync(proposal.worktreePath), false, "child worktree should be cleaned after proposal persistence");
    const proof = JSON.parse(fs.readFileSync(path.join(fixture.target, output.proofEnvelopePath), "utf8"));
    assert.strictEqual(proof.schema, "generic-repo-full-intake.parallel-candidate-proof.v1");
    assert.strictEqual(proof.evidence.worktreesRunOwned, true);
    assert.strictEqual(proof.evidence.childWorktreesDetached, true);
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertParallelProposalRejectGates() {
  const fixture = createFixture("prj");
  try {
    fs.mkdirSync(path.join(fixture.target, "recipes"), { recursive: true });
    fs.writeFileSync(path.join(fixture.target, "recipes", "parallel-duplicate-typed-plan.md"), "# Existing duplicate\n", "utf8");
    fs.mkdirSync(path.join(fixture.target, "registry"), { recursive: true });
    fs.writeFileSync(
      path.join(fixture.target, "registry", "solutions.json"),
      `${JSON.stringify({
        schema: "ae-solution-registry.v1",
        solutionSchema: "ae-solution.v1",
        updatedAt: "2026-06-02",
        policy: {
          trackedStatuses: ["recipe", "typed-tool-candidate", "tool"],
          candidateLocation: "logs/solution-candidates/",
          plannerUse: "advisory-retrieval-enabled",
          executionRule: "fixture"
        },
        solutions: [parallelSolution("parallel-duplicate-id", "recipes/existing.md")]
      }, null, 2)}\n`,
      "utf8"
    );
    sh(fixture.target, ["git", "add", "."]);
    sh(fixture.target, ["git", "commit", "-m", "fixture duplicate baselines"]);

    const candidates = [
      parallelEntry("tool-parallel-unplanned", 1, {
        implementation: {
          parallelProposal: parallelProposal("recipes/parallel-unplanned-typed-plan.md", "parallel-unplanned", {
            changedPaths: ["recipes/parallel-unplanned-typed-plan.md", "scripts/unplanned.js"]
          })
        }
      }),
      parallelEntry("tool-parallel-central-doc", 2, {
        implementation: {
          parallelProposal: parallelProposal("recipes/parallel-central-doc-typed-plan.md", "parallel-central-doc", {
            changedPaths: ["plans/target-app-execplan.md"]
          })
        }
      }),
      parallelEntry("tool-parallel-duplicate-recipe", 3, {
        sourcePath: "Selection/Parallel_Duplicate.jsx",
        implementation: {
          parallelProposal: parallelProposal("recipes/parallel-duplicate-typed-plan.md", "parallel-duplicate-recipe")
        }
      }),
      parallelEntry("tool-parallel-duplicate-id", 4, {
        implementation: {
          parallelProposal: parallelProposal("recipes/parallel-duplicate-id-typed-plan.md", "parallel-duplicate-id")
        }
      }),
      parallelEntry("tool-parallel-stale-base", 5, {
        implementation: {
          parallelProposal: parallelProposal("recipes/parallel-stale-base-typed-plan.md", "parallel-stale-base", {
            baseHead: "0000000000000000000000000000000000000000"
          })
        }
      }),
      parallelEntry("tool-parallel-missing-proof", 6, {
        implementation: {
          parallelProposal: parallelProposal("recipes/parallel-missing-proof-typed-plan.md", "parallel-missing-proof", {
            proofSha256: ""
          })
        }
      }),
      parallelEntry("tool-parallel-live-rerun", 7, {
        liveGate: { required: true, status: "ready", laneId: "fixture-openai-cli-lane" },
        implementation: {
          parallelProposal: parallelProposal("recipes/parallel-live-rerun-typed-plan.md", "parallel-live-rerun", {
            liveLaneStatus: "ready",
            liveRerunRequired: true
          })
        }
      })
    ];
    const ledgerPath = writeLedger(fixture, validLedger(fixture, candidates));
    const registryPath = writeRegistry(fixture, { entries: [] });
    const output = parseJson(runFullIntakeFixture(
      fixture,
      ledgerPath,
      registryPath,
      "prj",
      1,
      {},
      [
        "--parallel-candidate-worktrees",
        "--parallel-candidate-limit",
        "7",
        "--parallel-candidate-ids",
        candidates.map((item) => item.id).join(",")
      ]
    ));
    assert.strictEqual(output.status, "parallel_reducer_rejected_all");
    const rejectedCodes = output.parallel.reducer.rejected.map((entry) => entry.code).sort();
    assert.deepStrictEqual(rejectedCodes, [
      "duplicate-recipe-path",
      "duplicate-registry-solution-id",
      "forbidden-paths",
      "live-rerun-parent-serial-unavailable",
      "missing-proof-hash",
      "stale-base-head",
      "unplanned-paths"
    ].sort());
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    assert(ledger.entries.every((item) => item.status === "queued"), "rejected proposals must not complete candidates");
    assert(ledger.entries.every((item) => item.failClosed?.schema === "generic-repo-full-intake.parallel-candidate-rejection.v1"));
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertParallelReducerSeriallyAppliesIndependentProposals() {
  const fixture = createFixture("pac");
  try {
    const first = parallelEntry("tool-parallel-alpha", 1, {
      sourcePath: "Selection/Parallel_Alpha.jsx",
      implementation: {
        parallelProposal: parallelProposal("recipes/parallel-alpha-typed-plan.md", "parallel-alpha", { smokeEntry: true })
      }
    });
    const second = parallelEntry("tool-parallel-beta", 2, {
      sourcePath: "Selection/Parallel_Beta.jsx",
      implementation: {
        parallelProposal: parallelProposal("recipes/parallel-beta-typed-plan.md", "parallel-beta")
      }
    });
    const ledgerPath = writeLedger(fixture, validLedger(fixture, [first, second]));
    const registryPath = writeRegistry(fixture, { entries: [] });
    const output = parseJson(runFullIntakeFixture(
      fixture,
      ledgerPath,
      registryPath,
      "pac",
      1,
      {},
      ["--parallel-candidate-worktrees", "--parallel-candidate-limit", "2"]
    ));
    assert.strictEqual(output.status, "parallel_reducer_completed");
    assert.deepStrictEqual(output.parallel.reducer.accepted.map((entry) => entry.candidateId), [
      "tool-parallel-alpha",
      "tool-parallel-beta"
    ]);
    assert.strictEqual(output.parallel.reducer.liveRerun.parentOwned, true);
    assert.strictEqual(output.parallel.reducer.liveRerun.serial, true);
    assert.strictEqual(output.parallel.reducer.liveRerun.runByChild, false);
    assert(output.commits.length === 1, "accepted parallel proposals should commit parent-owned changes");
    assert(fs.existsSync(path.join(fixture.target, "recipes", "parallel-alpha-typed-plan.md")));
    assert(fs.existsSync(path.join(fixture.target, "recipes", "parallel-beta-typed-plan.md")));
    const registry = JSON.parse(fs.readFileSync(path.join(fixture.target, "registry", "solutions.json"), "utf8"));
    assert(registry.solutions.some((item) => item.id === "parallel-alpha"));
    assert(registry.solutions.some((item) => item.id === "parallel-beta"));
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    assert.strictEqual(ledger.entries[0].status, "completed");
    assert.strictEqual(ledger.entries[1].status, "completed");
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertParallelChildExecutionProducesAcceptedFileProposals() {
  const fixture = createFixture("pce");
  try {
    const binDir = writeFakeCodex(fixture.root);
    const first = entry({
      classification: "existing_typed_tools_recipe_only",
      liveGate: { required: false, status: "not_required_for_fixture" },
      implementation: {
        sliceId: "fixture-parallel-child-alpha",
        plannedPaths: ["scripts/imported-tools/parallel-child-alpha.js"]
      },
      queueRank: 1
    });
    const second = timingEntry({
      classification: "existing_typed_tools_recipe_only",
      liveGate: { required: false, status: "not_required_for_fixture" },
      implementation: {
        sliceId: "fixture-parallel-child-beta",
        plannedPaths: ["scripts/imported-tools/parallel-child-beta.js"]
      },
      queueRank: 2
    });
    const ledgerPath = writeLedger(fixture, validLedger(fixture, [first, second]));
    const registryPath = writeRegistry(fixture, { entries: [] });
    const result = runFullIntakeFixture(
      fixture,
      ledgerPath,
      registryPath,
      "pce",
      1,
      { ...fakeCodexEnv(binDir), FAKE_CODEX_HUGE_STDOUT: "1" },
      ["--parallel-candidate-worktrees", "--parallel-candidate-limit", "2"]
    );
    assert(result.stdout.length < 64 * 1024, `parallel child output should stay compact, got ${result.stdout.length}`);
    assert(!result.stdout.includes("HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH"));
    const output = parseJson(result);
    assert.strictEqual(output.status, "parallel_reducer_completed");
    assert.strictEqual(output.parallel.worktrees.created, 2);
    assert.strictEqual(output.parallel.worktrees.cleaned, 2);
    assert.deepStrictEqual(output.parallel.reducer.accepted.map((item) => item.candidateId), [
      "tool-compositions-add-composition-guide",
      "tool-layers-extend-all-layers"
    ]);
    assert(output.commits.length === 1, "parallel child proposals should commit once through parent reducer");
    assert(fs.existsSync(path.join(fixture.target, "scripts", "imported-tools", "parallel-child-alpha.js")));
    assert(fs.existsSync(path.join(fixture.target, "scripts", "imported-tools", "parallel-child-beta.js")));
    for (const proposalRef of output.parallel.proposals) {
      const proposal = JSON.parse(fs.readFileSync(path.join(fixture.target, proposalRef.path), "utf8"));
      assert.strictEqual(proposal.status, "proposal_ready");
      assert.strictEqual(proposal.importStatus, "imported_non_live_validated");
      assert.strictEqual(proposal.liveRerunRequired, false);
      assert(proposal.structuredChanges.fileChangePaths.length === 1, "expected one file snapshot per child proposal");
      assert.strictEqual(fs.existsSync(proposal.worktreePath), false, "child worktree should be removed after reducer");
      const proofPath = path.join(fixture.target, proposal.proofPaths[0]);
      const proof = JSON.parse(fs.readFileSync(proofPath, "utf8"));
      assert.strictEqual(proof.evidence.queueSupervisorStatus, "imported_non_live_validated");
      assert.strictEqual(proof.evidence.childProcess.ok, true);
    }
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    assert(ledger.entries.every((item) => item.status === "completed"));
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertParallelReducerRefusesDirtyCentralTree() {
  const fixture = createFixture("pdt");
  try {
    const candidate = parallelEntry("tool-parallel-dirty", 1, {
      sourcePath: "Selection/Parallel_Dirty.jsx",
      implementation: {
        parallelProposal: parallelProposal("recipes/parallel-dirty-typed-plan.md", "parallel-dirty")
      }
    });
    const ledgerPath = writeLedger(fixture, validLedger(fixture, [candidate]));
    const registryPath = writeRegistry(fixture, { entries: [] });
    fs.writeFileSync(path.join(fixture.target, "dirty-central.txt"), "dirty\n", "utf8");
    const result = runFullIntakeFixture(
      fixture,
      ledgerPath,
      registryPath,
      "pdt",
      1,
      {},
      ["--parallel-candidate-worktrees", "--parallel-candidate-limit", "1"]
    );
    assert.notStrictEqual(result.status, 0, "dirty central tree should fail closed");
    const output = parseJsonFromAnyStatus(result);
    assert.strictEqual(output.status, "blocked_parallel_reducer_dirty_central_tree");
    assert.strictEqual(output.parallel.worktrees.created, 0);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertParallelContextBudgetStopsBeforeNewWork() {
  const fixture = createFixture("pct");
  try {
    const candidate = parallelEntry("tool-parallel-context", 1);
    const ledgerPath = writeLedger(fixture, validLedger(fixture, [candidate]));
    const registryPath = writeRegistry(fixture, { entries: [] });
    const result = runFullIntakeFixtureCompact(
      fixture,
      ledgerPath,
      registryPath,
      "pct",
      1,
      {},
      ["--parallel-candidate-worktrees", "--context-percent", "79"]
    );
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assert.strictEqual(output.status, "resume_only_context_budget");
    assert.strictEqual(output.parallel, null);
    assert.strictEqual(output.contextBudget.lastDecision.threshold, "noNewWorkPercent");
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertCompletedCandidateAndAutoLane() {
  const fixture = createFixture("registry-lane");
  try {
    const binDir = writeFakeCodex(fixture.root);
    const ledgerPath = writeLedger(fixture, validLedger(fixture));
    const registryPath = writeRegistry(fixture);
    const output = parseJson(
      runFullIntakeFixture(
        fixture,
        ledgerPath,
        registryPath,
        "fixture-registry-lane",
        1,
        fakeCodexEnv(binDir)
      )
    );
    assert.strictEqual(output.schema, "generic-repo-full-intake.run.v1");
    assert.strictEqual(output.auxiliaryId, "AUX-043");
    assert.strictEqual(output.ok, true);
    assert.strictEqual(output.status, "completed");
    assert.strictEqual(output.items.length, 1);
    assert.strictEqual(output.items[0].status, "completed");
    assert.strictEqual(output.items[0].liveLaneStatus, "passed");
    assert.strictEqual(output.items[0].liveRerunStatus, "passed");
    assert(output.commits.length === 1, "completed candidate should commit reviewable changes");

    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    const completed = ledger.entries.find((item) => item.id === "tool-compositions-add-composition-guide");
    assert.strictEqual(completed.status, "completed");
    assert.strictEqual(completed.liveGate.status, "passed");
    assert.strictEqual(completed.liveGate.laneId, "fixture-composition-guide-openai-cli");
    assert.strictEqual(completed.liveGate.templateSource, "registry");
    assert.strictEqual(completed.liveGate.synthesized, false);
    assert.strictEqual(completed.implementation.commit, output.commits[0]);
    assert(fs.existsSync(path.join(fixture.target, "scripts", "imported-tools", "composition-guide.js")));
    assert(fs.readFileSync(path.join(fixture.target, "plans", "target-app-execplan.md"), "utf8").includes("full-intake:fixture-registry-lane:tool-compositions-add-composition-guide"));
    const contextPacks = findFiles(
      path.join(fixture.target, ".codex-runtime", "sdk", "generic-repo-importer"),
      (filePath) => filePath.endsWith(".json") && filePath.includes(`${path.sep}child-run-context-packs${path.sep}`)
    );
    assert.strictEqual(contextPacks.length, 1, `expected one compact child context pack, got ${contextPacks.length}`);
    const contextPackText = fs.readFileSync(contextPacks[0], "utf8");
    assert(contextPackText.length < 24 * 1024, `compact child context pack too large: ${contextPackText.length}`);
    const contextPack = JSON.parse(contextPackText);
    assert.strictEqual(contextPack.schema, "generic-repo-tool-importer.child-run-context-pack.v1");
    assert.strictEqual(contextPack.protocol, "compact_context_pack_v1");
    assert.strictEqual(contextPack.promptArtifact.fullPromptOmittedFromChildStdin, true);
    assert(contextPack.plannedPaths.includes("scripts/imported-tools/composition-guide.js"));
    assert(contextPack.plannedPaths.length <= 8, "compact context pack should not balloon planned paths");
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertHugeChildOutputDoesNotBloatParentReports() {
  const fixture = createFixture("huge-child-output");
  try {
    const binDir = writeFakeCodex(fixture.root);
    const ledgerPath = writeLedger(fixture, validLedger(fixture));
    const registryPath = writeRegistry(fixture);
    const result = runFullIntakeFixture(
      fixture,
      ledgerPath,
      registryPath,
      "fixture-huge-child-output",
      1,
      { ...fakeCodexEnv(binDir), FAKE_CODEX_HUGE_STDOUT: "1" }
    );
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    assert(result.stdout.length < 64 * 1024, `full-intake JSON should stay compact, got ${result.stdout.length}`);
    assert(!result.stdout.includes("HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH"));
    const output = JSON.parse(result.stdout);
    const runReportText = fs.readFileSync(
      path.join(fixture.target, ".codex-runtime", "sdk", "generic-repo-full-intake", "fixture-huge-child-output", "run-report.json"),
      "utf8"
    );
    assert(runReportText.length < 64 * 1024, `run report should stay compact, got ${runReportText.length}`);
    assert(!runReportText.includes("HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH"));
    const batchReportText = fs.readFileSync(path.join(fixture.target, output.items[0].batchReport), "utf8");
    assert(batchReportText.length < 64 * 1024, `batch report should stay compact, got ${batchReportText.length}`);
    assert(!batchReportText.includes("HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH"));
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertCompactParentOutputDoesNotLeakRuntimeDetails() {
  const fixture = createFixture("compact-bounds");
  try {
    const binDir = writeFakeCodex(fixture.root);
    const ledgerPath = writeLedger(fixture, validLedger(fixture));
    const registryPath = writeRegistry(fixture);
    const result = runFullIntakeFixtureCompact(
      fixture,
      ledgerPath,
      registryPath,
      "fixture-compact-bounds",
      1,
      { ...fakeCodexEnv(binDir), FAKE_CODEX_HUGE_STDOUT: "1" }
    );
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    assert(result.stdout.length < 16 * 1024, `compact parent output should stay tiny, got ${result.stdout.length}`);
    const output = JSON.parse(result.stdout);
    assertCompactParentOutputIsBounded(result.stdout, output);
    assert(String(output.status || "").startsWith("completed"), result.stdout);
    assert.strictEqual(output.counts.items, 1);
    assert.strictEqual(output.lastItem.candidateId, "tool-compositions-add-composition-guide");
    assert.strictEqual(output.resolutionQueue.ticketCount, 0);
    assert(output.proofEnvelope.path.endsWith("proof-envelope.json"));
    assert(output.proofEnvelope.sha256);
    assert(output.resumeCard.path.endsWith("resume-card.json"));
    assert(output.compactPaths.compactStatusCommand.includes("full-intake-status.mjs"));
    assert(output.compactPaths.proofCommand.includes("full-intake-proof.mjs"));
    assert(output.compactPaths.ledgerSummaryCommand.includes("full-intake-ledger-summary.mjs"));
  } finally {
    removeFixture(fixture.root);
  }
}

function assertStrictCompactParentRunsOnePhaseAtBoundary() {
  const fixture = createFixture("strict-phase");
  try {
    const binDir = writeFakeCodex(fixture.root);
    const ledgerPath = writeLedger(fixture, validLedger(fixture));
    const registryPath = writeRegistry(fixture);
    const env = fakeCodexEnv(binDir);
    const expectedPhases = [
      ["select_candidate", "prove_or_register_live_lane"],
      ["prove_or_register_live_lane", "run_importer_phase"],
      ["run_importer_phase", "controlled_merge"],
      ["controlled_merge", "non_live_validation"],
      ["non_live_validation", "generated_only_live_rerun"],
      ["generated_only_live_rerun", "ledger_docs_handoff_commit_finalization"]
    ];

    for (const [completedPhase, nextPhase] of expectedPhases) {
      const contextArgs = completedPhase === "generated_only_live_rerun" ? ["--context-percent", "66"] : [];
      const result = runFullIntakeFixtureCompactPhase(
        fixture,
        ledgerPath,
        registryPath,
        "fixture-strict-phase",
        1,
        env,
        contextArgs
      );
      assert.strictEqual(result.status, 0, result.stderr || result.stdout);
      const output = JSON.parse(result.stdout);
      assertCompactParentOutputIsBounded(result.stdout, output);
      assert.strictEqual(output.status, "phase_boundary", result.stdout);
      assert.strictEqual(output.strictOnePhase.enabled, true);
      assert.strictEqual(output.strictOnePhase.completedPhase, completedPhase);
      assert.strictEqual(output.strictOnePhase.nextPhase, nextPhase);
      assert.strictEqual(output.proofEnvelope.contractComplete, false);
      if (completedPhase === "generated_only_live_rerun") {
        assert.strictEqual(output.contextBudget.lastDecision.nextStep, "liveRerun");
        assert.strictEqual(output.contextBudget.lastDecision.predictedNextStepCost, 6);
        assert.strictEqual(output.contextBudget.lastDecision.threshold, "softStopPercent");
      }
    }

    const final = runFullIntakeFixtureCompactPhase(
      fixture,
      ledgerPath,
      registryPath,
      "fixture-strict-phase",
      1,
      env
    );
    assert.strictEqual(final.status, 0, final.stderr || final.stdout);
    const output = JSON.parse(final.stdout);
    assertCompactParentOutputIsBounded(final.stdout, output);
    assert.strictEqual(output.status, "completed");
    assert.strictEqual(output.strictOnePhase.enabled, true);
    assert.strictEqual(output.proofEnvelope.contractComplete, true);
    assert.strictEqual(output.lastItem.status, "completed");
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertFailedLiveRerunCanRecoverPlannedDirtyTransaction() {
  const fixture = createFixture("live-retry");
  try {
    const binDir = writeFakeCodex(fixture.root);
    const candidate = entry({
      liveGate: {
        required: true,
        status: "needed_or_reusable_lane_required"
      }
    });
    const ledgerPath = writeLedger(fixture, validLedger(fixture, [candidate]));
    const registryPath = writeRegistry(fixture, {
      entry: {
        command: "node scripts/cep-panel-cdp-smoke.js full-ui-agent-fixture-openai-cli-smoke",
        laneId: "fixture-flaky-live-proof-openai-cli",
        nonLiveValidationCommands: ["node --check scripts/flaky-live-proof.js"],
        scope: "fixture generated-only flaky live proof"
      }
    });
    const runId = "fixture-live-retry";
    const env = fakeCodexEnv(binDir);

    for (const [completedPhase, nextPhase] of [
      ["select_candidate", "prove_or_register_live_lane"],
      ["prove_or_register_live_lane", "run_importer_phase"],
      ["run_importer_phase", "controlled_merge"],
      ["controlled_merge", "non_live_validation"],
      ["non_live_validation", "generated_only_live_rerun"]
    ]) {
      const result = runFullIntakeFixtureCompactPhase(fixture, ledgerPath, registryPath, runId, 1, env);
      assert.strictEqual(result.status, 0, result.stderr || result.stdout);
      const output = JSON.parse(result.stdout);
      assert.strictEqual(output.status, "phase_boundary", result.stdout);
      assert.strictEqual(output.strictOnePhase.completedPhase, completedPhase);
      assert.strictEqual(output.strictOnePhase.nextPhase, nextPhase);
    }

    const failed = runFullIntakeFixtureCompactPhase(
      fixture,
      ledgerPath,
      registryPath,
      runId,
      1,
      { ...env, FAKE_LIVE_PROOF_FAIL: "1" }
    );
    assert.notStrictEqual(failed.status, 0, failed.stdout);
    const failedOutput = JSON.parse(failed.stdout);
    assert.strictEqual(failedOutput.status, "stopped_after_failed_live_rerun");
    assert.strictEqual(failedOutput.lastItem.status, "failed_live_rerun");
    assert.notStrictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");

    const recovered = runFullIntakeFixtureCompactPhase(fixture, ledgerPath, registryPath, runId, 1, env);
    assert.strictEqual(recovered.status, 0, recovered.stderr || recovered.stdout);
    const recoveredOutput = JSON.parse(recovered.stdout);
    assert.strictEqual(recoveredOutput.status, "phase_boundary", recovered.stdout);
    assert.strictEqual(recoveredOutput.strictOnePhase.completedPhase, "generated_only_live_rerun");
    assert.strictEqual(recoveredOutput.strictOnePhase.nextPhase, "ledger_docs_handoff_commit_finalization");
    assert.strictEqual(recoveredOutput.lastItem.status, "generated_only_live_rerun_complete");

    const final = runFullIntakeFixtureCompactPhase(fixture, ledgerPath, registryPath, runId, 1, env);
    assert.strictEqual(final.status, 0, final.stderr || final.stdout);
    const finalOutput = JSON.parse(final.stdout);
    assert.strictEqual(finalOutput.status, "completed");
    assert.strictEqual(finalOutput.lastItem.status, "completed");
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertParentJsonIsSealedAndBatchRequiresApproval() {
  const fixture = createFixture("json-sealed");
  try {
    const ledgerPath = writeLedger(fixture, validLedger(fixture));
    const registryPath = writeRegistry(fixture);
    const fullJson = run(
      [
        "--ledger",
        ledgerPath,
        "--live-lane-registry",
        registryPath,
        "--run-id",
        "fixture-json-refusal",
        "--max-items",
        "1",
        "--target-repo",
        fixture.target,
        "--json"
      ],
      repo
    );
    assert.notStrictEqual(fullJson.status, 0, "full --json without output/debug must be refused before work starts");
    assert(fullJson.stderr.includes("full-json-stdout-forbidden"), fullJson.stderr || fullJson.stdout);
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");

    const batch = run(
      [
        "--ledger",
        ledgerPath,
        "--live-lane-registry",
        registryPath,
        "--run-id",
        "fixture-batch-refusal",
        "--max-items",
        "2",
        "--target-repo",
        fixture.target,
        "--compact-json"
      ],
      repo
    );
    assert.notStrictEqual(batch.status, 0, "max-items > 1 must require explicit batch approval");
    assert(batch.stderr.includes("max-items-greater-than-1-requires-allow-batch-mode"), batch.stderr || batch.stdout);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertContextBudgetStopsBeforeNewWork() {
  const fixture = createFixture("context-budget");
  try {
    const ledgerPath = writeLedger(fixture, validLedger(fixture));
    const registryPath = writeRegistry(fixture);
    const result = runFullIntakeFixtureCompact(
      fixture,
      ledgerPath,
      registryPath,
      "fixture-context-budget",
      1,
      {},
      ["--context-percent", "79"]
    );
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assert.strictEqual(output.status, "resume_only_context_budget");
    assert.strictEqual(output.contextBudget.lastDecision.threshold, "noNewWorkPercent");
    assert.strictEqual(output.counts.items, 0);
    assert(output.proofEnvelope.path.endsWith("proof-envelope.json"));
    assert.strictEqual(output.proofEnvelope.contractComplete, false);
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    assert.strictEqual(ledger.entries[0].status, "queued");
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertUnknownContextStopsBeforeNewWork() {
  const fixture = createFixture("unknown-context");
  try {
    const ledgerPath = writeLedger(fixture, validLedger(fixture));
    const registryPath = writeRegistry(fixture);
    const result = run(
      [
        "--ledger",
        ledgerPath,
        "--live-lane-registry",
        registryPath,
        "--run-id",
        "fixture-unknown-context",
        "--max-items",
        "1",
        "--target-repo",
        fixture.target,
        "--compact-json"
      ],
      repo
    );
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assert.strictEqual(output.status, "resume_only_context_budget");
    assert.strictEqual(output.counts.items, 0);
    assert.strictEqual(output.contextBudget.lastDecision.threshold, "contextPercentUnknown");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertHighContextThresholdsAllowCeiling() {
  const fixture = createFixture("high-thresholds");
  try {
    const ledgerPath = writeLedger(fixture, validLedger(fixture));
    const registryPath = writeRegistry(fixture);
    const result = run(
      [
        "--ledger",
        ledgerPath,
        "--live-lane-registry",
        registryPath,
        "--run-id",
        "fixture-high-thresholds",
        "--max-items",
        "1",
        "--target-repo",
        fixture.target,
        "--context-percent",
        "5",
        "--handoff-percent",
        "100",
        "--hard-stop-percent",
        "100",
        "--compact-json"
      ],
      repo
    );
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assert.strictEqual(output.status, "phase_boundary");
    assert.strictEqual(output.contextBudget.lastDecision.action, "continue");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertContextRegressionOutputBounds() {
  for (const count of [1, 3, 10]) {
    const fixture = createFixture(`context-regression-${count}`);
    try {
      const candidates = Array.from({ length: count }, (_, index) => entry({
        id: `tool-unsafe-${index + 1}`,
        sourcePath: `Unsafe_${index + 1}.jsx`,
        classification: "unsafe_destructive_operation",
        liveGate: { required: false, status: "not_required_for_read_only_or_skip" },
        implementation: { sliceId: `unsafe-${index + 1}`, plannedPaths: [`scripts/imported-tools/unsafe-${index + 1}.js`] },
        queueRank: index + 1
      }));
      const ledgerPath = writeLedger(fixture, validLedger(fixture, candidates));
      const registryPath = writeRegistry(fixture);
      const result = runFullIntakeFixtureCompactPhase(fixture, ledgerPath, registryPath, `fixture-context-regression-${count}`, count);
      assert.strictEqual(result.status, 0, result.stderr || result.stdout);
      assert(result.stdout.length < 12 * 1024, `compact output for ${count} candidates exceeded bound: ${result.stdout.length}`);
      const output = JSON.parse(result.stdout);
      assertCompactParentOutputIsBounded(result.stdout, output);
      assert.strictEqual(output.counts.items, 1);
      assert(!result.stdout.includes("items\": ["), "compact output must not expose item arrays");
    } finally {
      removeFixture(fixture.root);
    }
  }
}

function assertProofAndDiagnoseCommandsAreBounded() {
  const fixture = createFixture("proof-diagnose");
  try {
    const binDir = writeFakeCodex(fixture.root);
    const ledgerPath = writeLedger(fixture, validLedger(fixture));
    const registryPath = writeRegistry(fixture);
    const result = runFullIntakeFixtureCompact(
      fixture,
      ledgerPath,
      registryPath,
      "fixture-proof-diagnose",
      1,
      fakeCodexEnv(binDir)
    );
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assert.strictEqual(output.proofEnvelope.contractComplete, true);

    const proofRunner = path.join(repo, "orchestrator", "full-intake-proof.mjs");
    const proof = spawnSync(process.execPath, [
      proofRunner,
      "--target-repo",
      fixture.target,
      "--run-id",
      "fixture-proof-diagnose",
      "--candidate",
      "tool-compositions-add-composition-guide",
      "--compact-json"
    ], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    assert.strictEqual(proof.status, 0, proof.stderr || proof.stdout);
    assert(proof.stdout.length < 4096, `proof output too large: ${proof.stdout.length}`);
    const proofOutput = JSON.parse(proof.stdout);
    assert.strictEqual(proofOutput.contractComplete, true);

    const diagnoseRunner = path.join(repo, "orchestrator", "full-intake-diagnose.mjs");
    const diagnose = spawnSync(process.execPath, [
      diagnoseRunner,
      "--target-repo",
      fixture.target,
      "--run-id",
      "fixture-proof-diagnose",
      "--candidate",
      "tool-compositions-add-composition-guide",
      "--phase",
      "importer",
      "--max-bytes",
      "1024",
      "--compact-json"
    ], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    assert.strictEqual(diagnose.status, 0, diagnose.stderr || diagnose.stdout);
    assert(diagnose.stdout.length < 4096, `diagnose output too large: ${diagnose.stdout.length}`);
    assert(!diagnose.stdout.includes("HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH"));
  } finally {
    removeFixture(fixture.root);
  }
}

function assertMissingProofHashesPreventCompletion() {
  const fixture = createFixture("proof-missing-hash");
  try {
    const binDir = writeFakeCodex(fixture.root);
    const ledgerPath = writeLedger(fixture, validLedger(fixture));
    const registryPath = writeRegistry(fixture);
    const result = runFullIntakeFixtureCompact(
      fixture,
      ledgerPath,
      registryPath,
      "fixture-proof-missing-hash",
      1,
      {
        ...fakeCodexEnv(binDir),
        AE_AGENT_FULL_INTAKE_TEST_DROP_MANIFEST_HASH: "1"
      }
    );
    assert.notStrictEqual(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stderr, /proof-envelope-missing-required-hashes:manifestSha256/);
    assert(!result.stdout.includes('"status": "completed"'), "missing proof hashes must not print completed parent output");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertSelfImprovementSynthesisDisabledByDefault() {
  const fixture = createFixture("synth-disabled");
  try {
    const ledgerPath = writeLedger(fixture, validLedger(fixture, [posterizeEntry()]));
    const registryPath = writeRegistry(fixture, { entries: [] });
    const output = parseJson(runFullIntakeFixture(fixture, ledgerPath, registryPath, "fixture-synth-disabled", 1));
    assert.strictEqual(output.status, "completed_with_blocked_candidates");
    assert.strictEqual(output.items[0].status, "blocked_live_lane_template_missing");
    assert.strictEqual(output.items[0].reason, "self_improvement_lane_synthesis_disabled");
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    assert.strictEqual(ledger.entries[0].status, "blocked_live_lane_template_missing");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertSynthesizedAutoLaneCompletesWithoutRegistryEntry() {
  const fixture = createFixture("synth-lane");
  try {
    const binDir = writeFakeCodex(fixture.root);
    const ledgerPath = writeLedger(fixture, validLedger(fixture, [posterizeEntry()]));
    const registryPath = writeRegistry(fixture, { entries: [] });
    const output = parseJson(
      runFullIntakeFixture(
        fixture,
        ledgerPath,
        registryPath,
        "fixture-synth-lane",
        1,
        fakeCodexEnv(binDir),
        ["--allow-self-improvement-lane-synthesis"]
      )
    );
    assert.strictEqual(output.status, "completed");
    assert.strictEqual(output.items[0].candidateId, "tool-compositions-add-posterize-time-adjustment-layer");
    assert.strictEqual(output.items[0].liveLaneStatus, "passed");
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    const completed = ledger.entries.find((item) => item.id === "tool-compositions-add-posterize-time-adjustment-layer");
    assert.strictEqual(completed.status, "completed");
    assert.strictEqual(completed.liveGate.status, "passed");
    assert.strictEqual(completed.liveGate.templateSource, "auto_synthesis");
    assert.strictEqual(completed.liveGate.synthesized, true);
    assert.strictEqual(completed.liveGate.synthesisFamily, "generated-shape-effect-layer");
    assert(completed.liveGate.laneId.includes("auto-generated-shape-effect-layer"));
    assert(fs.existsSync(path.join(fixture.target, completed.liveGate.synthesisEvidence)));
    assert(fs.existsSync(path.join(fixture.target, output.items[0].liveLaneReport)));
    assert(fs.existsSync(path.join(fixture.target, "scripts", "imported-tools", "posterize-time.js")));
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertAutoLaneSynthesisFailClosedEvidence() {
  const fixture = createFixture("synth-fail");
  try {
    const unsafe = posterizeEntry({
      id: "tool-compositions-file-io-layer",
      sourcePath: "Compositions/File_IO_Layer.jsx",
      safetySignals: { usesFileIo: true },
      queueRank: 1
    });
    const ambiguous = posterizeEntry({
      id: "tool-layers-shape-and-rename-ambiguous",
      sourcePath: "Layers/Shape_And_Rename_Ambiguous.jsx",
      suggestedTools: ["get_active_comp", "get_selected_layers", "create_shape_layer", "add_effect", "rename_layers", "get_comp_details"],
      safetySignals: {},
      queueRank: 2
    });
    const ledgerPath = writeLedger(fixture, validLedger(fixture, [unsafe, ambiguous]));
    const registryPath = writeRegistry(fixture, { entries: [] });
    const output = parseJson(runFullIntakeFixture(
      fixture,
      ledgerPath,
      registryPath,
      "fixture-synth-fail",
      2,
      {},
      ["--allow-self-improvement-lane-synthesis"]
    ));
    assert.strictEqual(output.status, "completed_with_blocked_candidates");
    assert.deepStrictEqual(output.items.map((item) => item.status), [
      "blocked_live_lane_synthesis_unsafe",
      "blocked_live_lane_synthesis_ambiguous"
    ]);
    for (const item of output.items) {
      assert(item.liveLaneReport, `${item.candidateId}: expected live lane report`);
      const report = JSON.parse(fs.readFileSync(path.join(fixture.target, item.liveLaneReport), "utf8"));
      assert.strictEqual(report.ok, false);
      assert(report.synthesisReport, `${item.candidateId}: expected synthesis evidence path`);
      const synthesis = JSON.parse(fs.readFileSync(path.join(fixture.target, report.synthesisReport), "utf8"));
      assert.strictEqual(synthesis.status, item.status);
      assert.strictEqual(synthesis.ok, false);
      assert(Array.isArray(synthesis.candidateTools));
    }
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    assert.strictEqual(ledger.entries[0].status, "blocked_live_lane_synthesis_unsafe");
    assert.strictEqual(ledger.entries[1].status, "blocked_live_lane_synthesis_ambiguous");
    assert.strictEqual(ledger.entries[0].failClosed.status, "blocked_live_lane_synthesis_unsafe");
    assert.strictEqual(ledger.entries[1].failClosed.status, "blocked_live_lane_synthesis_ambiguous");
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertUnsafeCandidateSkipAndContinue() {
  const fixture = createFixture("unsafe-skip");
  try {
    const binDir = writeFakeCodex(fixture.root);
    const unsafe = entry({
      id: "tool-unsafe-render-queue-delete",
      sourcePath: "Unsafe.jsx",
      classification: "unsafe_destructive_operation",
      liveGate: { required: false, status: "not_required_for_read_only_or_skip" },
      implementation: { sliceId: "unsafe", plannedPaths: ["scripts/imported-tools/unsafe.js"] },
      queueRank: 1
    });
    const safe = entry({
      id: "tool-layers-read-only-fixture",
      sourcePath: "Layers/Read_Only_Fixture.jsx",
      classification: "existing_typed_tools_recipe_only",
      liveGate: { required: false, status: "not_required_for_read_only_or_skip" },
      implementation: { sliceId: "read-only-fixture", plannedPaths: ["scripts/imported-tools/read-only-fixture.js"] },
      queueRank: 2
    });
    const ledgerPath = writeLedger(fixture, validLedger(fixture, [unsafe, safe]));
    const registryPath = writeRegistry(fixture);
    const output = parseJson(
      runFullIntakeFixture(
        fixture,
        ledgerPath,
        registryPath,
        "fixture-unsafe-skip",
        2,
        fakeCodexEnv(binDir)
      )
    );
    assert.strictEqual(output.status, "completed_with_blocked_or_skipped_candidates");
    assert.strictEqual(output.items[0].candidateId, "tool-unsafe-render-queue-delete");
    assert.strictEqual(output.items[0].status, "skipped_unsafe_candidate");
    assert.strictEqual(output.items[1].candidateId, "tool-layers-read-only-fixture");
    assert.strictEqual(output.items[1].status, "completed");
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    assert.strictEqual(ledger.entries.find((item) => item.id === "tool-layers-read-only-fixture").status, "completed");
    const skipped = ledger.entries.find((item) => item.id === "tool-unsafe-render-queue-delete");
    assert.strictEqual(skipped.status, "skipped_unsafe_candidate");
    assert.strictEqual(skipped.failClosed.status, "skipped_unsafe_candidate");
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertLiveLaneFailureEvidence() {
  const fixture = createFixture("live-failure");
  try {
    const ledgerPath = writeLedger(fixture, validLedger(fixture));
    const registryPath = writeRegistry(fixture, {
      entry: {
        nonLiveValidationCommands: ["node scripts/fail-live-lane.js"]
      }
    });
    const output = parseJson(runFullIntakeFixture(fixture, ledgerPath, registryPath, "fixture-live-failure", 1));
    assert.strictEqual(output.ok, true);
    assert.strictEqual(output.status, "completed_with_blocked_candidates");
    assert.strictEqual(output.items[0].status, "blocked_live_lane_validation_failed");
    assert(output.items[0].liveLaneReport, "blocked live lane should record report path");
    const reportPath = path.join(fixture.target, output.items[0].liveLaneReport);
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    assert.strictEqual(report.status, "blocked_live_lane_validation_failed");
    assert.strictEqual(report.failedCommand.exitCode, 7);
    assert(fs.existsSync(path.join(fixture.target, report.failedCommand.logPath)));
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    assert.strictEqual(ledger.entries[0].status, "blocked_live_lane_validation_failed");
    assert.strictEqual(ledger.entries[0].liveGate.status, "blocked_live_lane_validation_failed");
    assert.strictEqual(ledger.entries[0].failClosed.status, "blocked_live_lane_validation_failed");
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertQueuedLedgerStaleBlockedStateIsRetried() {
  const fixture = createFixture("stale-blocked-resume");
  try {
    const binDir = writeFakeCodex(fixture.root);
    const ledgerPath = writeLedger(fixture, validLedger(fixture, [posterizeEntry()]));
    const registryPath = writeRegistry(fixture, { entries: [] });
    const runId = "fixture-stale-blocked-resume";
    const runRoot = path.join(fixture.target, ".codex-runtime", "sdk", "generic-repo-full-intake", runId);
    fs.mkdirSync(runRoot, { recursive: true });
    fs.writeFileSync(
      path.join(runRoot, "state.json"),
      `${JSON.stringify(
        {
          schema: "generic-repo-full-intake.state.v1",
          auxiliaryId: "AUX-043",
          runId,
          status: "completed_with_blocked_candidates",
          startedAt: "2026-05-27T00:00:00.000Z",
          updatedAt: "2026-05-27T00:00:00.000Z",
          ledgerPath,
          maxItems: 1,
          resumeCount: 0,
          items: [
            {
              candidateId: "tool-compositions-add-posterize-time-adjustment-layer",
              status: "blocked_live_lane_template_missing"
            }
          ],
          completedCandidateIds: [],
          blockedCandidateIds: ["tool-compositions-add-posterize-time-adjustment-layer"],
          skippedCandidateIds: [],
          commitIds: []
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const output = parseJson(
      runFullIntakeFixture(
        fixture,
        ledgerPath,
        registryPath,
        runId,
        1,
        fakeCodexEnv(binDir),
        ["--allow-self-improvement-lane-synthesis"]
      )
    );
    assert.strictEqual(output.resumed, true);
    assert.strictEqual(output.status, "completed");
    assert.strictEqual(output.items[0].candidateId, "tool-compositions-add-posterize-time-adjustment-layer");
    assert.strictEqual(output.items[0].status, "completed");
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    assert.strictEqual(ledger.entries[0].status, "completed");
    assert.strictEqual(ledger.entries[0].liveGate.templateSource, "auto_synthesis");
    const state = JSON.parse(fs.readFileSync(path.join(runRoot, "state.json"), "utf8"));
    assert.strictEqual(state.items[0].status, "completed");
    assert.deepStrictEqual(state.blockedCandidateIds, []);
    assert.strictEqual(state.maxItems, 1);
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertResolutionTicketRequeuesBlockedFamily() {
  const fixture = createFixture("resolution-family");
  try {
    const binDir = writeFakeCodex(fixture.root);
    const first = timingEntry({
      status: "blocked_live_lane_synthesis_incomplete",
      failClosed: {
        status: "blocked_live_lane_synthesis_incomplete",
        reason: "candidate_tools_do_not_match_a_supported_auto_lane_family"
      },
      liveGate: { required: true, status: "blocked_live_lane_synthesis_incomplete" },
      queueRank: 1
    });
    const second = timingEntry({
      id: "tool-layers-shift-layer-start-time",
      sourcePath: "Layers/Shift_Layer_Start_Time.jsx",
      status: "blocked_live_lane_synthesis_incomplete",
      failClosed: {
        status: "blocked_live_lane_synthesis_incomplete",
        reason: "candidate_tools_do_not_match_a_supported_auto_lane_family"
      },
      implementation: {
        sliceId: "fixture-layer-shift-import",
        plannedPaths: ["scripts/imported-tools/layer-shift.js"]
      },
      liveGate: { required: true, status: "blocked_live_lane_synthesis_incomplete" },
      queueRank: 2
    });
    const ledgerPath = writeLedger(fixture, validLedger(fixture, [first, second]));
    const registryPath = writeRegistry(fixture, { entries: [] });
    const output = parseJson(
      runFullIntakeFixture(
        fixture,
        ledgerPath,
        registryPath,
        "fixture-resolution-family",
        1,
        fakeCodexEnv(binDir)
      )
    );
    assert.strictEqual(output.status, "completed");
    assert.strictEqual(output.resolutionQueue.openTicketCount, 0);
    assert.strictEqual(output.resolutionQueue.terminalTicketCount, 1);
    assert.deepStrictEqual(output.resolutionQueue.requeuedCandidateIds.sort(), [
      "tool-layers-extend-all-layers",
      "tool-layers-shift-layer-start-time"
    ]);
    assert.strictEqual(output.resolutionQueue.tickets[0].type, "live-lane-family");

    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    const completed = ledger.entries.find((item) => item.id === "tool-layers-extend-all-layers");
    const queued = ledger.entries.find((item) => item.id === "tool-layers-shift-layer-start-time");
    assert.strictEqual(completed.status, "completed");
    assert.strictEqual(completed.liveGate.synthesisFamily, "layer-timing-generated-only");
    assert.strictEqual(queued.status, "queued");
    assert.strictEqual(queued.liveGate.status, "passed");
    assert.strictEqual(queued.liveGate.command, "node scripts/cep-panel-cdp-smoke.js full-ui-agent-layer-timing-openai-cli-smoke");
    assert(fs.existsSync(path.join(fixture.target, output.resolutionQueue.tickets[0].path)));
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertCompactParentOutputSummarizesResolutionQueue() {
  const fixture = createFixture("compact-resolution-family");
  try {
    const binDir = writeFakeCodex(fixture.root);
    const first = timingEntry({
      status: "blocked_live_lane_synthesis_incomplete",
      failClosed: {
        status: "blocked_live_lane_synthesis_incomplete",
        reason: "candidate_tools_do_not_match_a_supported_auto_lane_family"
      },
      liveGate: { required: true, status: "blocked_live_lane_synthesis_incomplete" },
      queueRank: 1
    });
    const second = timingEntry({
      id: "tool-layers-shift-layer-start-time",
      sourcePath: "Layers/Shift_Layer_Start_Time.jsx",
      status: "blocked_live_lane_synthesis_incomplete",
      failClosed: {
        status: "blocked_live_lane_synthesis_incomplete",
        reason: "candidate_tools_do_not_match_a_supported_auto_lane_family"
      },
      implementation: {
        sliceId: "fixture-layer-shift-import",
        plannedPaths: ["scripts/imported-tools/layer-shift.js"]
      },
      liveGate: { required: true, status: "blocked_live_lane_synthesis_incomplete" },
      queueRank: 2
    });
    const ledgerPath = writeLedger(fixture, validLedger(fixture, [first, second]));
    const registryPath = writeRegistry(fixture, { entries: [] });
    const result = runFullIntakeFixtureCompactPhase(
      fixture,
      ledgerPath,
      registryPath,
      "fixture-compact-resolution-family",
      1,
      fakeCodexEnv(binDir)
    );
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assertCompactParentOutputIsBounded(result.stdout, output);
    assert.strictEqual(output.resolutionQueue.terminalTicketCount, 1);
    assert.strictEqual(output.resolutionQueue.requeuedCandidateIds.count, 2);
    assert.deepStrictEqual(output.requeuedCandidateIds.ids.sort(), [
      "tool-layers-extend-all-layers",
      "tool-layers-shift-layer-start-time"
    ]);
    assert.strictEqual(output.resolutionQueue.affectedFamilies.length, 1);
    assert.strictEqual(output.resolutionQueue.affectedFamilies[0].affectedCandidateIds.count, 2);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertQueuedLiveLaneNeededFamiliesAreProvedAndRanked() {
  const fixture = createFixture("qln-family");
  try {
    const binDir = writeFakeCodex(fixture.root);
    const expression = expressionLiveLaneNeededEntry();
    const compProperties = compPropertiesLiveLaneNeededEntry();
    const ledgerPath = writeLedger(fixture, validLedger(fixture, [expression, compProperties]));
    const registryPath = writeRegistry(fixture, { entries: [] });
    const output = parseJson(
      runFullIntakeFixture(
        fixture,
        ledgerPath,
        registryPath,
        "fixture-qln-family",
        2,
        fakeCodexEnv(binDir),
        [
          "--allow-self-improvement-lane-synthesis",
          "--soft-stop-percent",
          "70",
          "--no-new-work-percent",
          "80",
          "--handoff-percent",
          "80",
          "--hard-stop-percent",
          "90"
        ]
      )
    );
    assert.strictEqual(output.status, "completed");
    assert.deepStrictEqual(output.resolutionQueue.requeuedCandidateIds.sort(), [
      "tool-compositions-change-nested-composition-work-area",
      "tool-expressions-add-simple-loop-expression"
    ]);

    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    const completedExpression = ledger.entries.find((item) => item.id === "tool-expressions-add-simple-loop-expression");
    const completedCompProperties = ledger.entries.find((item) => item.id === "tool-compositions-change-nested-composition-work-area");
    assert.strictEqual(completedExpression.status, "completed");
    assert.strictEqual(completedExpression.previousClassification, "live_lane_needed");
    assert.strictEqual(completedExpression.classification, "existing_typed_tools_recipe_only");
    assert.strictEqual(completedExpression.liveGate.synthesisFamily, "selected-property-expression-generated-only");
    assert.strictEqual(completedExpression.liveGate.command, "node scripts/cep-panel-cdp-smoke.js full-ui-agent-expression-openai-cli-smoke");
    assert(Number.isInteger(completedExpression.queueRank));
    assert.strictEqual(completedCompProperties.status, "completed");
    assert.strictEqual(completedCompProperties.previousClassification, "live_lane_needed");
    assert.strictEqual(completedCompProperties.classification, "existing_typed_tools_recipe_only");
    assert.strictEqual(completedCompProperties.liveGate.synthesisFamily, "comp-properties-work-area-generated-only");
    assert.strictEqual(completedCompProperties.liveGate.command, "node scripts/cep-panel-cdp-smoke.js full-ui-agent-comp-properties-openai-cli-smoke");
    assert(Number.isInteger(completedCompProperties.queueRank));
    assert(completedExpression.queueRank < completedCompProperties.queueRank);
    assert(fs.existsSync(path.join(fixture.target, "scripts", "imported-tools", "expression.js")));
    assert(fs.existsSync(path.join(fixture.target, "scripts", "imported-tools", "comp-properties.js")));
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertBoundedSelfImprovementCreatesAndRejectsLanes() {
  const fixture = createFixture("self-improvement");
  try {
    const binDir = writeFakeCodex(fixture.root);
    const accepted = selectedPropertyValueLiveLaneNeededEntry();
    const rejected = selectedPropertyValueLiveLaneNeededEntry({
      id: "tool-properties-set-selected-property-value-missing-tool",
      sourcePath: "Properties/Set_Selected_Property_Value.jsx",
      implementation: {
        sliceId: "fixture-selected-property-value-rejected",
        plannedPaths: ["scripts/imported-tools/selected-property-value-rejected.js"]
      },
      suggestedTools: ["get_active_comp", "get_selected_properties", "set_property_value", "missing_production_tool"],
    });
    const ledgerPath = writeLedger(fixture, validLedger(fixture, [accepted, rejected]));
    const registryPath = writeRegistry(fixture, {
      entries: [],
      selfImprovementFamilies: [
        {
          id: "selected-property-value-generated-only",
          requiredTools: ["get_selected_properties", "set_property_value"],
          allowedTools: ["get_active_comp", "get_selected_properties", "set_property_value", "get_layer_details"],
          command: "node scripts/cep-panel-cdp-smoke.js full-ui-agent-selected-property-value-openai-cli-smoke",
          providerPath: "openai-cli",
          proofLane: "selected-property-value",
          productionTypedTools: true,
          readBackTools: ["get_selected_properties", "get_layer_details"],
          semanticVerification: true,
          plannedPaths: ["scripts/cep-panel-cdp-smoke.js"],
          nonLiveValidationCommands: ["node --check scripts/cep-panel-cdp-smoke.js"],
          reclassifiedClassification: "existing_typed_tools_recipe_only",
          scope: "fixture selected-property value generated-only proof"
        },
        {
          id: "selected-property-value-missing-production-tool",
          requiredTools: ["get_selected_properties", "set_property_value", "missing_production_tool"],
          allowedTools: ["get_active_comp", "get_selected_properties", "set_property_value", "missing_production_tool"],
          command: "node scripts/cep-panel-cdp-smoke.js full-ui-agent-selected-property-value-openai-cli-smoke",
          providerPath: "openai-cli",
          proofLane: "selected-property-value",
          productionTypedTools: false,
          readBackTools: ["get_selected_properties"],
          semanticVerification: true,
          plannedPaths: ["scripts/cep-panel-cdp-smoke.js"],
          nonLiveValidationCommands: ["node --check scripts/cep-panel-cdp-smoke.js"],
          scope: "fixture missing production typed tool proof"
        }
      ]
    });
    const output = parseJson(
      runFullIntakeFixture(
        fixture,
        ledgerPath,
        registryPath,
        "fixture-self-improvement",
        1,
        fakeCodexEnv(binDir),
        ["--allow-self-improvement-lane-synthesis"]
      )
    );
    assert.strictEqual(output.status, "completed");
    assert.deepStrictEqual(output.resolutionQueue.requeuedCandidateIds, ["tool-properties-set-selected-property-value"]);
    assert(output.resolutionQueue.terminalTicketCount >= 1);
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    const completed = ledger.entries.find((item) => item.id === accepted.id);
    const terminal = ledger.entries.find((item) => item.id === rejected.id);
    assert.strictEqual(completed.status, "completed");
    assert.strictEqual(completed.liveGate.templateSource, "bounded_self_improvement");
    assert.strictEqual(completed.liveGate.providerPath, "openai-cli");
    assert.strictEqual(completed.liveGate.synthesisFamily, "selected-property-value-generated-only");
    assert(Number.isInteger(completed.queueRank));
    assert.strictEqual(terminal.resolution.status, "terminal_unresolved");
    const ticket = JSON.parse(fs.readFileSync(path.join(fixture.target, terminal.resolution.latestTicket), "utf8"));
    assert(ticket.evidence.selfImprovement.packetPath);
    assert(ticket.evidence.selfImprovement.roles["lane-designer"] || ticket.evidence.selfImprovement.roles["lane-reviewer"]);
    assert(!JSON.stringify(ticket).includes("Local/Ollama"));
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertBoundedSelfImprovementAllowsDeclaredRenderQueueSignal() {
  const fixture = createFixture("si-rq");
  try {
    const binDir = writeFakeCodex(fixture.root);
    const accepted = renderQueueLiveLaneNeededEntry();
    const ledgerPath = writeLedger(fixture, validLedger(fixture, [accepted]));
    const registryPath = writeRegistry(fixture, {
      entries: [],
      selfImprovementFamilies: [
        {
          id: "render-queue-generated-only",
          requiredTools: ["add_comp_to_render_queue", "set_render_queue_output", "get_render_queue_status"],
          allowedTools: ["get_project_info", "add_comp_to_render_queue", "set_render_queue_output", "get_render_queue_status"],
          allowedUnsafeSignals: ["usesRenderQueue"],
          candidateIds: [accepted.id],
          command: "node scripts/cep-panel-cdp-smoke.js full-ui-agent-render-queue-openai-cli-smoke",
          providerPath: "openai-cli",
          proofLane: "render-queue",
          productionTypedTools: true,
          readBackTools: ["get_render_queue_status"],
          semanticVerification: true,
          plannedPaths: ["scripts/cep-panel-cdp-smoke.js"],
          nonLiveValidationCommands: ["node --check scripts/cep-panel-cdp-smoke.js"],
          reclassifiedClassification: "existing_typed_tools_recipe_only",
          scope: "fixture generated-only render queue proof"
        }
      ]
    });
    const output = parseJson(
      runFullIntakeFixture(
        fixture,
        ledgerPath,
        registryPath,
        "fixture-si-rq",
        1,
        fakeCodexEnv(binDir),
        ["--allow-self-improvement-lane-synthesis"]
      )
    );
    assert.strictEqual(output.status, "completed");
    assert.deepStrictEqual(output.resolutionQueue.requeuedCandidateIds, [accepted.id]);
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    const completed = ledger.entries.find((item) => item.id === accepted.id);
    assert.strictEqual(completed.status, "completed");
    assert.strictEqual(completed.liveGate.synthesisFamily, "render-queue-generated-only");
    assert.strictEqual(completed.liveGate.command, "node scripts/cep-panel-cdp-smoke.js full-ui-agent-render-queue-openai-cli-smoke");
    const template = JSON.parse(fs.readFileSync(path.join(
      fixture.target,
      output.runRoot,
      "candidates",
      accepted.id,
      "live-lane",
      "live-lane-template.json"
    ), "utf8"));
    assert.deepStrictEqual(template.synthesis.allowedUnsafeSignals, ["usesRenderQueue"]);
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertScopedResolutionCandidateIdsOnlyProcessRequestedLane() {
  const fixture = createFixture("scoped-resolution");
  try {
    const binDir = writeFakeCodex(fixture.root);
    const keyframes = keyframeLiveLaneNeededEntry();
    const compProperties = compPropertiesLiveLaneNeededEntry();
    const ledgerPath = writeLedger(fixture, validLedger(fixture, [keyframes, compProperties]));
    const registryPath = writeRegistry(fixture, {
      entries: [],
      selfImprovementFamilies: [
        {
          id: "selected-property-keyframe-generated-only",
          requiredTools: ["get_selected_properties", "set_property_keyframes", "apply_keyframe_ease"],
          allowedTools: ["get_active_comp", "get_selected_properties", "set_property_keyframes", "apply_keyframe_ease", "get_layer_details"],
          candidateIds: [keyframes.id],
          command: "node scripts/cep-panel-cdp-smoke.js full-ui-agent-keyframes-openai-cli-smoke",
          providerPath: "openai-cli",
          proofLane: "selected-property-keyframe",
          productionTypedTools: true,
          readBackTools: ["get_selected_properties", "get_layer_details"],
          semanticVerification: true,
          plannedPaths: ["scripts/cep-panel-cdp-smoke.js"],
          nonLiveValidationCommands: ["node --check scripts/cep-panel-cdp-smoke.js"],
          reclassifiedClassification: "existing_typed_tools_recipe_only",
          scope: "fixture keyframe generated-only proof"
        }
      ]
    });
    const output = parseJson(
      runFullIntakeFixture(
        fixture,
        ledgerPath,
        registryPath,
        "fixture-scoped-resolution",
        1,
        fakeCodexEnv(binDir),
        [
          "--allow-self-improvement-lane-synthesis",
          "--resolution-candidate-ids",
          keyframes.id
        ]
      )
    );
    assert.strictEqual(output.status, "completed");
    assert.deepStrictEqual(output.resolutionQueue.requeuedCandidateIds, [keyframes.id]);
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    const completedKeyframes = ledger.entries.find((item) => item.id === keyframes.id);
    const untouchedCompProperties = ledger.entries.find((item) => item.id === compProperties.id);
    assert.strictEqual(completedKeyframes.status, "completed");
    assert.strictEqual(completedKeyframes.liveGate.synthesisFamily, "selected-property-keyframe-generated-only");
    assert.strictEqual(completedKeyframes.liveGate.command, "node scripts/cep-panel-cdp-smoke.js full-ui-agent-keyframes-openai-cli-smoke");
    assert.strictEqual(untouchedCompProperties.status, "queued");
    assert.strictEqual(untouchedCompProperties.classification, "live_lane_needed");
    assert.strictEqual(untouchedCompProperties.resolution, undefined);
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function writeLegacyReasoningEffortCliEvidence(fixture, entryToRecover, runId) {
  const importerRunId = "queue-fixture-legacy-reasoning-cli-import";
  const batchRunId = "fixture-legacy-reasoning-cli-import";
  const batchId = "queue-batch-1-legacyreasoning";
  const runRoot = path.join(fixture.target, ".codex-runtime", "sdk", "generic-repo-importer", importerRunId);
  const childSummaryDir = path.join(runRoot, "implementation", "child-run-summaries");
  fs.mkdirSync(childSummaryDir, { recursive: true });

  fs.writeFileSync(
    path.join(childSummaryDir, `${batchId}.result-summary.json`),
    `${JSON.stringify({
      schema: "generic-repo-tool-importer.implementation-child-run-result-summary.v1",
      runId: importerRunId,
      manifestHash: "fixture-legacy-reasoning-cli",
      batchId,
      status: "failed_process",
      timeoutMs: 600000,
      model: "gpt-5.5",
      reasoningEffort: "high",
      plannedPaths: entryToRecover.implementation.plannedPaths,
      changedPaths: [],
      unplannedPaths: [],
      plannedPathGate: "passed",
      exitCode: 2,
      stdout: { bytes: 0, lineCount: 0, tail: "", tailLineCount: 0, truncated: false },
      stderr: {
        bytes: 251,
        lineCount: 8,
        tail: "error: unexpected argument '--reasoning-effort' found\n\nUsage: codex exec [OPTIONS] [PROMPT]",
        tailLineCount: 3,
        truncated: false
      },
      contextGuard: { status: "passed", violations: [] },
      worktreeCreated: true,
      childRunCreated: true,
      controlledMergeApplied: false,
      validationCommandsRun: false,
      liveCepAeRun: false,
      localOllamaUsed: false,
      fallbackProviderUsed: false,
      dependencyChanged: false,
      productRuntimeEdited: false
    }, null, 2)}\n`,
    "utf8"
  );

  const batchReportPath = path.join(
    fixture.target,
    ".codex-runtime",
    "sdk",
    "generic-repo-full-intake",
    runId,
    "queue-supervisor",
    batchRunId,
    "batch-report.json"
  );
  const relativeBatchReportPath = path.relative(fixture.target, batchReportPath).replace(/\\/g, "/");
  fs.mkdirSync(path.dirname(batchReportPath), { recursive: true });
  fs.writeFileSync(
    batchReportPath,
    `${JSON.stringify({
      schema: "generic-repo-queue-supervisor.batch-report.v1",
      ok: false,
      status: "failed_during_import",
      runId: batchRunId,
      reportPath: relativeBatchReportPath,
      selectedCandidateIds: [entryToRecover.id],
      importer: {
        manifestPath: null,
        runId: importerRunId,
        result: null,
        error: `implementation-child-run-failed: ${batchId}`
      },
      items: [
        {
          candidateId: entryToRecover.id,
          sourcePath: entryToRecover.sourcePath,
          status: "failed_importer",
          reason: `implementation-child-run-failed: ${batchId}`,
          importerRunId,
          plannedPaths: entryToRecover.implementation.plannedPaths
        }
      ]
    }, null, 2)}\n`,
    "utf8"
  );
  return { batchReportPath: relativeBatchReportPath };
}

function assertLegacyReasoningEffortCliFailureIsScopedImportRetry() {
  const fixture = createFixture("legacy-cli");
  try {
    const binDir = writeFakeCodex(fixture.root);
    const runId = "legacy-cli";
    fs.mkdirSync(path.join(fixture.source, "Selection"), { recursive: true });
    fs.writeFileSync(
      path.join(fixture.source, "Selection", "Layer_Selection_Set.jsx"),
      "function layerSelectionSet() { return true; }\n",
      "utf8"
    );
    const failed = entry({
      id: "tool-selection-layer-selection-set",
      sourcePath: "Selection/Layer_Selection_Set.jsx",
      classification: "existing_typed_tools_recipe_only",
      liveGate: { required: false, status: "not_required_for_fixture_retry" },
      suggestedTools: ["get_active_comp", "get_selected_layers"],
      implementation: {
        failureReason: "implementation-child-run-failed: queue-batch-1-legacyreasoning",
        plannedPaths: ["scripts/imported-tools/layer-selection-set.js"],
        sliceId: "fixture-layer-selection-set-import"
      },
      status: "failed_import",
      queueRank: 1
    });
    const evidence = writeLegacyReasoningEffortCliEvidence(fixture, failed, runId);
    failed.failClosed = {
      status: "failed_import",
      reason: "batch-importer-failed: implementation-child-run-failed: queue-batch-1-legacyreasoning",
      batchReport: evidence.batchReportPath
    };
    const ledgerPath = writeLedger(fixture, validLedger(fixture, [failed]));
    const registryPath = writeRegistry(fixture, { entries: [] });
    const output = parseJson(
      runFullIntakeFixture(
        fixture,
        ledgerPath,
        registryPath,
        runId,
        1,
        fakeCodexEnv(binDir),
        ["--resolution-candidate-ids", failed.id]
      )
    );
    assert.strictEqual(output.status, "completed");
    assert.deepStrictEqual(output.resolutionQueue.requeuedCandidateIds, [failed.id]);
    const ticket = JSON.parse(fs.readFileSync(path.join(fixture.target, output.resolutionQueue.tickets[0].path), "utf8"));
    assert.strictEqual(ticket.reason, "fresh_retry_queued_after_legacy_reasoning_effort_cli_arg");
    assert(fs.existsSync(path.join(fixture.target, "scripts", "imported-tools", "layer-selection-set.js")));
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    assert.strictEqual(ledger.entries[0].status, "completed");
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]).includes("layer-selection-set.js"), false);
  } finally {
    removeFixture(fixture.root);
  }
}

function writeChildTimeoutEvidence(fixture, entryToRecover) {
  const importerRunId = "queue-fixture-child-timeout-import";
  const batchRunId = "fixture-child-timeout-import";
  const batchId = "queue-batch-1-childtimeout";
  const runRoot = path.join(fixture.target, ".codex-runtime", "sdk", "generic-repo-importer", importerRunId);
  const childResultDir = path.join(runRoot, "implementation", "child-run-results");
  const childSummaryDir = path.join(runRoot, "implementation", "child-run-summaries");
  fs.mkdirSync(childResultDir, { recursive: true });
  fs.mkdirSync(childSummaryDir, { recursive: true });

  const worktreePath = path.join(runRoot, "worktrees", batchId);
  fs.mkdirSync(path.dirname(worktreePath), { recursive: true });
  sh(fixture.target, ["git", "worktree", "add", "--detach", worktreePath, "HEAD"]);
  const recoveredPath = "scripts/imported-tools/recovered-child-timeout.js";
  fs.mkdirSync(path.join(worktreePath, "scripts", "imported-tools"), { recursive: true });
  fs.writeFileSync(
    path.join(worktreePath, recoveredPath),
    "// recovered from timed-out child\nmodule.exports = 'child-timeout';\n",
    "utf8"
  );

  const childResult = {
    schema: "generic-repo-tool-importer.implementation-child-run-result.v1",
    runId: importerRunId,
    manifestHash: "fixture-child-timeout",
    batchId,
    status: "failed_timeout",
    timeoutMs: 600000,
    plannedPaths: [recoveredPath],
    changedPaths: [recoveredPath],
    unplannedPaths: [],
    plannedPathGate: "passed",
    actualWorktreePath: worktreePath,
    actualWorktreeRelativePath: path.relative(fixture.target, worktreePath).replace(/\\/g, "/"),
    worktreeCreated: true,
    childRunCreated: true,
    controlledMergeApplied: false,
    validationCommandsRun: false,
    liveCepAeRun: false,
    localOllamaUsed: false,
    fallbackProviderUsed: false,
    dependencyChanged: false,
    productRuntimeEdited: false
  };
  fs.writeFileSync(path.join(childResultDir, `${batchId}.json`), `${JSON.stringify(childResult, null, 2)}\n`, "utf8");
  const childSummaryPath = path.join(childSummaryDir, `${batchId}.result-summary.json`);
  fs.writeFileSync(
    childSummaryPath,
    `${JSON.stringify({
      schema: "generic-repo-tool-importer.implementation-child-run-result-summary.v1",
      ...childResult,
      childRunResultPath: `implementation/child-run-results/${batchId}.json`,
      stdout: { bytes: 0, lineCount: 0, tail: "", tailLineCount: 0, truncated: false },
      stderr: { bytes: 0, lineCount: 0, tail: "", tailLineCount: 0, truncated: false }
    }, null, 2)}\n`,
    "utf8"
  );

  const batchReportPath = path.join(
    fixture.target,
    ".codex-runtime",
    "sdk",
    "generic-repo-full-intake",
    "fixture-child-timeout",
    "queue-supervisor",
    batchRunId,
    "batch-report.json"
  );
  const relativeBatchReportPath = path.relative(fixture.target, batchReportPath).replace(/\\/g, "/");
  fs.mkdirSync(path.dirname(batchReportPath), { recursive: true });
  const batchReport = {
    schema: "generic-repo-queue-supervisor.batch-report.v1",
    ok: false,
    status: "failed_during_import",
    runId: batchRunId,
    reportPath: relativeBatchReportPath,
    importer: {
      manifestPath: null,
      runId: importerRunId,
      result: null,
      error: `implementation-child-run-timeout: ${batchId}`
    },
    items: [
      {
        candidateId: entryToRecover.id,
        sourcePath: entryToRecover.sourcePath,
        status: "failed_importer",
        reason: `implementation-child-run-timeout: ${batchId}`,
        importerRunId,
        plannedPaths: [recoveredPath]
      }
    ]
  };
  fs.writeFileSync(batchReportPath, `${JSON.stringify(batchReport, null, 2)}\n`, "utf8");
  return { batchReportPath: relativeBatchReportPath, childSummaryPath, recoveredPath };
}

function assertChildTimeoutResolutionRecoversImporterWorktreePatch() {
  const fixture = createFixture("child-timeout-recovery");
  try {
    const failed = entry({
      id: "tool-layers-child-timeout-recovery",
      sourcePath: "Layers/Read_Only_Fixture.jsx",
      classification: "existing_typed_tools_recipe_only",
      liveGate: { required: false, status: "not_required_for_read_only_or_skip" },
      implementation: {
        sliceId: "fixture-child-timeout-recovery",
        plannedPaths: ["scripts/imported-tools/recovered-child-timeout.js"]
      },
      status: "failed_import",
      queueRank: 1
    });
    const evidence = writeChildTimeoutEvidence(fixture, failed);
    failed.failClosed = {
      status: "failed_import",
      reason: "batch-importer-failed: implementation-child-run-timeout: queue-batch-1-childtimeout",
      batchReport: evidence.batchReportPath
    };
    const ledgerPath = writeLedger(fixture, validLedger(fixture, [failed]));
    const registryPath = writeRegistry(fixture, { entries: [] });
    const output = parseJson(
      runFullIntakeFixture(
        fixture,
        ledgerPath,
        registryPath,
        "fixture-child-timeout",
        1
      )
    );
    assert.strictEqual(output.status, "stopped_recovery_pending_semantic_review");
    assert.strictEqual(output.items[0].status, "recovered_patch_non_live_validated_pending_semantic_review");
    assert.strictEqual(output.items[0].importStatus, "imported_non_live_validated");
    assert(fs.existsSync(path.join(fixture.target, evidence.recoveredPath)));
    const recovered = fs.readFileSync(path.join(fixture.target, evidence.recoveredPath), "utf8");
    assert(recovered.includes("child-timeout"));
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    assert.strictEqual(ledger.entries[0].status, "recovered_patch_non_live_validated_pending_semantic_review");
    assert.strictEqual(ledger.entries[0].failClosed.status, "recovered_patch_non_live_validated_pending_semantic_review");
    assert(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]).includes("recovered-child-timeout.js"));
  } finally {
    removeFixture(fixture.root);
  }
}

function assertChildTimeoutRecoveryDiscoversMissingBatchReportPath() {
  const fixture = createFixture("child-timeout-discover");
  try {
    const runId = "fixture-child-timeout";
    const failed = entry({
      id: "tool-layers-child-timeout-discover",
      sourcePath: "Layers/Read_Only_Fixture.jsx",
      classification: "existing_typed_tools_recipe_only",
      liveGate: { required: false, status: "not_required_for_read_only_or_skip" },
      implementation: {
        childTimeoutRecoveryExhausted: true,
        failureReason: "child-timeout-recovery-exhausted:batch-importer-failed: implementation-child-run-timeout: queue-batch-1-childtimeout",
        plannedPaths: ["scripts/imported-tools/recovered-child-timeout.js"],
        sliceId: "fixture-child-timeout-discover"
      },
      status: "failed_import",
      queueRank: 1
    });
    const evidence = writeChildTimeoutEvidence(fixture, failed);
    failed.failClosed = {
      status: "failed_import",
      reason: "child-timeout-recovery-exhausted:batch-importer-failed: implementation-child-run-timeout: queue-batch-1-childtimeout",
      batchReport: null
    };
    const ledgerPath = writeLedger(fixture, validLedger(fixture, [failed]));
    const registryPath = writeRegistry(fixture, { entries: [] });
    const output = parseJson(
      runFullIntakeFixture(
        fixture,
        ledgerPath,
        registryPath,
        runId,
        1
      )
    );
    assert.strictEqual(output.status, "stopped_recovery_pending_semantic_review");
    assert.strictEqual(output.items[0].status, "recovered_patch_non_live_validated_pending_semantic_review");
    assert.strictEqual(output.items[0].importStatus, "imported_non_live_validated");
    assert(fs.existsSync(path.join(fixture.target, evidence.recoveredPath)));
    const recovered = fs.readFileSync(path.join(fixture.target, evidence.recoveredPath), "utf8");
    assert(recovered.includes("child-timeout"));
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    assert.strictEqual(ledger.entries[0].status, "recovered_patch_non_live_validated_pending_semantic_review");
    const recoveryReportPath = ledger.entries[0].implementation.batchReport;
    const recoveryReport = JSON.parse(fs.readFileSync(path.join(fixture.target, recoveryReportPath), "utf8"));
    assert.strictEqual(recoveryReport.sourceBatchReport, evidence.batchReportPath);
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]).includes("recovered-child-timeout.js"), true);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertChildTimeoutSummaryContractFailsClosed() {
  for (const variant of ["missing", "too-large"]) {
    const fixture = createFixture(`child-summary-${variant}`);
    try {
      const failed = entry({
        id: `tool-layers-child-summary-${variant}`,
        sourcePath: "Layers/Read_Only_Fixture.jsx",
        classification: "existing_typed_tools_recipe_only",
        liveGate: { required: false, status: "not_required_for_read_only_or_skip" },
        implementation: {
          sliceId: `fixture-child-summary-${variant}`,
          plannedPaths: ["scripts/imported-tools/recovered-child-timeout.js"]
        },
        status: "failed_import",
        queueRank: 1
      });
      const evidence = writeChildTimeoutEvidence(fixture, failed);
      if (variant === "missing") {
        fs.rmSync(evidence.childSummaryPath, { force: true });
      } else {
        fs.writeFileSync(evidence.childSummaryPath, `${JSON.stringify({ huge: "x".repeat(80 * 1024) })}\n`, "utf8");
      }
      failed.failClosed = {
        status: "failed_import",
        reason: "batch-importer-failed: implementation-child-run-timeout: queue-batch-1-childtimeout",
        batchReport: evidence.batchReportPath
      };
      const ledgerPath = writeLedger(fixture, validLedger(fixture, [failed]));
      const registryPath = writeRegistry(fixture, { entries: [] });
      const output = parseJson(
        runFullIntakeFixture(
          fixture,
          ledgerPath,
          registryPath,
          `fixture-child-summary-${variant}`,
          1
        )
      );
      assert.strictEqual(output.status, "completed_with_failed_candidates");
      assert.strictEqual(output.items[0].status, "failed_import");
      assert.match(output.items[0].reason, variant === "missing" ? /child-summary-missing/ : /too-large/);
      assert(!fs.existsSync(path.join(fixture.target, evidence.recoveredPath)));
      const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
      assert.strictEqual(ledger.entries[0].status, "failed_import");
      assert.match(ledger.entries[0].failClosed.reason, variant === "missing" ? /child-summary-missing/ : /too-large/);
      assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
    } finally {
      removeFixture(fixture.root);
    }
  }
}

function assertCompactParentOutputListsFailedIdsWithoutEvidenceBlob() {
  const fixture = createFixture("compact-child-summary-missing");
  try {
    const failed = entry({
      id: "tool-layers-compact-child-summary-missing",
      sourcePath: "Layers/Read_Only_Fixture.jsx",
      classification: "existing_typed_tools_recipe_only",
      liveGate: { required: false, status: "not_required_for_read_only_or_skip" },
      implementation: {
        sliceId: "fixture-compact-child-summary-missing",
        plannedPaths: ["scripts/imported-tools/recovered-child-timeout.js"]
      },
      status: "failed_import",
      queueRank: 1
    });
    const evidence = writeChildTimeoutEvidence(fixture, failed);
    fs.rmSync(evidence.childSummaryPath, { force: true });
    failed.failClosed = {
      status: "failed_import",
      reason: "batch-importer-failed: implementation-child-run-timeout: queue-batch-1-childtimeout",
      batchReport: evidence.batchReportPath
    };
    const ledgerPath = writeLedger(fixture, validLedger(fixture, [failed]));
    const registryPath = writeRegistry(fixture, { entries: [] });
    const result = runFullIntakeFixtureCompact(
      fixture,
      ledgerPath,
      registryPath,
      "fixture-compact-child-summary-missing",
      1
    );
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assertCompactParentOutputIsBounded(result.stdout, output);
    assert.strictEqual(output.status, "completed_with_failed_candidates");
    assert.deepStrictEqual(output.failedCandidateIds.ids, ["tool-layers-compact-child-summary-missing"]);
    assert.match(output.lastItem.reason, /child-summary-missing/);
  } finally {
    removeFixture(fixture.root);
  }
}

function assertChildTimeoutTerminalTicketDoesNotRequeue() {
  const fixture = createFixture("child-timeout-terminal");
  try {
    const runId = "fixture-child-timeout-terminal";
    const failed = entry({
      id: "tool-layers-child-timeout-terminal",
      sourcePath: "Layers/Read_Only_Fixture.jsx",
      classification: "existing_typed_tools_recipe_only",
      liveGate: { required: false, status: "ready" },
      implementation: {
        sliceId: "fixture-child-timeout-terminal",
        plannedPaths: ["scripts/imported-tools/terminal-child-timeout.js"]
      },
      status: "failed_import",
      queueRank: 1
    });
    failed.failClosed = {
      status: "failed_import",
      reason: "batch-importer-failed: implementation-child-run-timeout: queue-batch-1-timeout",
      batchReport: ".codex-runtime/sdk/generic-repo-full-intake/fixture-child-timeout-terminal/queue-supervisor/timeout/batch-report.json"
    };
    const ledgerPath = writeLedger(fixture, validLedger(fixture, [failed]));
    const registryPath = writeRegistry(fixture, { entries: [] });
    const ticketPath = path.join(
      fixture.target,
      ".codex-runtime",
      "sdk",
      "generic-repo-full-intake",
      runId,
      "resolution-tickets",
      "child-timeout-fixture",
      "ticket.json"
    );
    const ticketRef = path.relative(fixture.target, ticketPath).replace(/\\/g, "/");
    fs.mkdirSync(path.dirname(ticketPath), { recursive: true });
    fs.writeFileSync(
      ticketPath,
      `${JSON.stringify({
        schema: "generic-repo-full-intake.resolution-ticket.v1",
        runId,
        groupId: "child-timeout-fixture",
        type: "child-timeout",
        status: "running_recovery",
        reason: "runtime_child_timeout_recovery_started",
        affectedCandidateIds: [failed.id],
        group: {
          suggestedTools: failed.suggestedTools,
          safetySignals: [],
          synthesisFamily: null
        },
        isolation: {
          runtimeOnly: true,
          ticketPath: ticketRef,
          trackedSharedFileMerge: "serial_only",
          worktrees: "importer_owned_ignored_dirs_only"
        },
        evidence: {
          failureReason: failed.failClosed.reason
        },
        createdAt: new Date().toISOString()
      }, null, 2)}\n`,
      "utf8"
    );

    const output = parseJson(
      runFullIntakeFixture(
        fixture,
        ledgerPath,
        registryPath,
        runId,
        1
      )
    );
    assert.strictEqual(output.status, "completed_no_candidates");
    assert.strictEqual(output.resolutionQueue.terminalTicketCount, 1);
    assert.deepStrictEqual(output.resolutionQueue.closedCandidateIds, [failed.id]);
    assert.deepStrictEqual(output.resolutionQueue.requeuedCandidateIds, []);
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    assert.strictEqual(ledger.entries[0].status, "failed_import");
    assert.strictEqual(ledger.entries[0].implementation.childTimeoutRecoveryExhausted, true);
    assert.strictEqual(ledger.entries[0].resolution.status, "terminal_unresolved");
    const ticket = JSON.parse(fs.readFileSync(ticketPath, "utf8"));
    assert.strictEqual(ticket.status, "terminal_unresolved");
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function assertResumeFromState() {
  const fixture = createFixture("resume");
  try {
    const binDir = writeFakeCodex(fixture.root);
    const ledgerPath = writeLedger(fixture, validLedger(fixture));
    const registryPath = writeRegistry(fixture);
    const env = fakeCodexEnv(binDir);
    const first = parseJson(runFullIntakeFixture(fixture, ledgerPath, registryPath, "fixture-resume", 1, env));
    assert.strictEqual(first.status, "completed");
    const second = parseJson(runFullIntakeFixture(fixture, ledgerPath, registryPath, "fixture-resume", 1, env));
    assert.strictEqual(second.resumed, true);
    assert.strictEqual(second.status, "completed_no_candidates");
    const state = JSON.parse(fs.readFileSync(path.join(fixture.target, ".codex-runtime", "sdk", "generic-repo-full-intake", "fixture-resume", "state.json"), "utf8"));
    assert(state.resumeCount >= 1);
    assert.deepStrictEqual(state.completedCandidateIds, ["tool-compositions-add-composition-guide"]);
    assert.strictEqual(sh(fixture.target, ["git", "status", "--porcelain", "--untracked-files=all"]), "");
  } finally {
    removeFixture(fixture.root);
  }
}

function main() {
  assertParallelCandidateWorktreesOptInAndPlanning();
  assertParallelWorktreesAndProposalSchema();
  assertParallelProposalRejectGates();
  assertParallelReducerSeriallyAppliesIndependentProposals();
  assertParallelChildExecutionProducesAcceptedFileProposals();
  assertParallelReducerRefusesDirtyCentralTree();
  assertParallelContextBudgetStopsBeforeNewWork();
  assertCompletedCandidateAndAutoLane();
  assertHugeChildOutputDoesNotBloatParentReports();
  assertCompactParentOutputDoesNotLeakRuntimeDetails();
  assertStrictCompactParentRunsOnePhaseAtBoundary();
  assertFailedLiveRerunCanRecoverPlannedDirtyTransaction();
  assertParentJsonIsSealedAndBatchRequiresApproval();
  assertContextBudgetStopsBeforeNewWork();
  assertUnknownContextStopsBeforeNewWork();
  assertHighContextThresholdsAllowCeiling();
  assertContextRegressionOutputBounds();
  assertProofAndDiagnoseCommandsAreBounded();
  assertMissingProofHashesPreventCompletion();
  assertSelfImprovementSynthesisDisabledByDefault();
  assertSynthesizedAutoLaneCompletesWithoutRegistryEntry();
  assertAutoLaneSynthesisFailClosedEvidence();
  assertUnsafeCandidateSkipAndContinue();
  assertLiveLaneFailureEvidence();
  assertQueuedLedgerStaleBlockedStateIsRetried();
  assertResolutionTicketRequeuesBlockedFamily();
  assertCompactParentOutputSummarizesResolutionQueue();
  assertQueuedLiveLaneNeededFamiliesAreProvedAndRanked();
  assertBoundedSelfImprovementCreatesAndRejectsLanes();
  assertBoundedSelfImprovementAllowsDeclaredRenderQueueSignal();
  assertScopedResolutionCandidateIdsOnlyProcessRequestedLane();
  assertLegacyReasoningEffortCliFailureIsScopedImportRetry();
  assertChildTimeoutResolutionRecoversImporterWorktreePatch();
  assertChildTimeoutRecoveryDiscoversMissingBatchReportPath();
  assertChildTimeoutSummaryContractFailsClosed();
  assertCompactParentOutputListsFailedIdsWithoutEvidenceBlob();
  assertChildTimeoutTerminalTicketDoesNotRequeue();
  assertResumeFromState();
  console.log(JSON.stringify({ ok: true, smoke: "generic-repo-full-intake" }, null, 2));
}

main();
