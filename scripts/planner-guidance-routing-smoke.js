"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { buildPlannerContext, MAX_PLANNER_CHARS, FINAL_POLICY, relevantGuidelines, selectTools } = require("../mcp-server/planner-context");
const guidelines = require("../mcp-server/planner-tool-guidance");
const projectLifecycleContract = require("../mcp-server/project-lifecycle-contract");
const projectSave = require("../mcp-server/project-save");
const ameTransport = require("../mcp-server/ame-transport");
const amePresets = require("../mcp-server/ame-presets");
const ameRunning = require("../mcp-server/ame-running");
const ameFixtureGrant = require("../mcp-server/ame-native-fixture-grant");
const ameFixtureRunner = require("../mcp-server/ame-native-fixture-runner");
const ameTitleJobs = require("../mcp-server/ame-title-jobs");
const nativeRenderVariant = require("../mcp-server/native-render-variant");
const slideshowTools = require("../mcp-server/slideshow-tools");
const montageTools = require("../mcp-server/montage-tools");
const { startDaemon } = require("./network-test-fixture");

const PROBE_RESULTS_PATH = ".codex-runtime/tool-first-audit-20261005/planner-guidance-probe/results.json";

const TEST_PROMPTS = [
  {
    id: "prompt-1-text-update",
    prompt: "Update the selected title layer text to Autumn 2026, preserve its styling, and verify the result.",
    expectedSetter: "update_text_layer"
  },
  {
    id: "prompt-2-layer-transform",
    prompt: "Move the selected layer 80 pixels right and 20 pixels down, preserve other properties, and verify its transform.",
    expectedSetter: "set_layer_transform"
  },
  {
    id: "prompt-3-font-size",
    prompt: "Change the font size of the selected title layer to 72 and read back the text style.",
    expectedSetter: "update_text_layer"
  }
];

const UNRELATED_SPECIALIZED_PATTERNS = [
  "For data-driven newspaper slideshows",
  "For Puppet pin type changes",
  "For camera controller rigs",
  "For onion skinning",
  "For requests to align selected layers, clips, or precomps"
];

const TITLE_ROUTING_PROMPTS = [
  { id: "font-title-en", prompt: TEST_PROMPTS[2].prompt, expected: ["create_text_layer", "update_text_layer"], absent: [nativeRenderVariant.INSPECT, nativeRenderVariant.RENDER] },
  { id: "font-title-ru", prompt: "Измени размер шрифта выбранного титра на 72 и прочитай стиль текста.", expected: ["create_text_layer", "update_text_layer"], absent: [nativeRenderVariant.INSPECT, nativeRenderVariant.RENDER] },
  { id: "create-title-en", prompt: "Create a title text layer with font size 72.", expected: ["create_text_layer"], absent: [nativeRenderVariant.RENDER] },
  { id: "create-title-ru", prompt: "Создай текстовый слой титра с размером шрифта 72.", expected: ["create_text_layer"], absent: [nativeRenderVariant.RENDER] },
  { id: "title-only-en", prompt: "title", expected: [], absent: [nativeRenderVariant.INSPECT, nativeRenderVariant.RENDER] },
  { id: "title-only-ru", prompt: "титр", expected: [], absent: [nativeRenderVariant.INSPECT, nativeRenderVariant.RENDER] },
  { id: "native-render-en", prompt: "Render one title variant using the native Render Queue to a generated MOV video.", expected: [nativeRenderVariant.INSPECT, nativeRenderVariant.RENDER], absent: [] },
  { id: "native-render-ru", prompt: "Отрендери один вариант титра через штатную очередь рендера в MOV.", expected: [nativeRenderVariant.INSPECT, nativeRenderVariant.RENDER], absent: [] },
  { id: "native-render-heading-ru", prompt: "Отрендери варианты заголовков.", expected: [nativeRenderVariant.INSPECT, nativeRenderVariant.RENDER], absent: [] },
  { id: "video-export-en", prompt: "Export one title variant as an AVI movie.", expected: [nativeRenderVariant.INSPECT, nativeRenderVariant.RENDER], absent: [] },
  { id: "video-export-ru", prompt: "Экспортируй один вариант титра в видео.", expected: [nativeRenderVariant.INSPECT, nativeRenderVariant.RENDER], absent: [] },
  { id: "inspect-variants-en", prompt: "Inspect title variants and read native render queue settings.", expected: [nativeRenderVariant.INSPECT], absent: [nativeRenderVariant.RENDER] },
  { id: "inspect-variants-ru", prompt: "Проверь варианты титра и прочитай настройки очереди рендера.", expected: [nativeRenderVariant.INSPECT], absent: [nativeRenderVariant.RENDER] },
  { id: "png-export-en", prompt: "Export a preview frame of one title variant as PNG.", expected: [], absent: [nativeRenderVariant.RENDER] },
  { id: "png-export-ru", prompt: "Экспортируй кадр предпросмотра одного варианта титра в PNG.", expected: [], absent: [nativeRenderVariant.RENDER] },
  { id: "png-render-en", prompt: "Render a preview frame of one title variant to PNG.", expected: [], absent: [nativeRenderVariant.RENDER] },
  { id: "png-render-ru", prompt: "Отрендери кадр предпросмотра одного варианта титра в PNG.", expected: [], absent: [nativeRenderVariant.RENDER] },
  { id: "named-render", prompt: "Use render_one_title_variant for this explicit title variant render.", expected: [nativeRenderVariant.INSPECT, nativeRenderVariant.RENDER], absent: [] },
  { id: "named-inspection", prompt: "Use inspect_title_variants for the common title comp.", expected: [nativeRenderVariant.INSPECT], absent: [nativeRenderVariant.RENDER] }
];

/**
 * Recreates the legacy filtering behavior to prove defect reproduction:
 * Legacy relevantGuidelines filtered solely by whether the first sentence contained selected tool names.
 */
function legacyRelevantGuidelines(selected, tools, mutatingNames) {
  const chosen = new Set(selected.map((tool) => tool.name));
  return guidelines.filter((line) => {
    const firstSentence = line.split(/\.\s/)[0];
    const names = tools.filter((tool) => firstSentence.includes(tool.name)).map((tool) => tool.name);
    if (!names.length) return true;
    const operations = names.filter((name) => mutatingNames.has(name) && !/^run_extendscript/.test(name));
    return (operations.length ? operations : names).some((name) => chosen.has(name));
  });
}

async function fetchToolCatalog() {
  const fixture = await startDaemon({ automationToken: `planner-smoke-${crypto.randomBytes(20).toString("hex")}` });
  try {
    const anonymous = await fixture.request({ path: "/tools", method: "GET" });
    assert.strictEqual(anonymous.status, 401, "Isolated /tools catalog must still require automation authentication");
    const response = await fixture.request({ path: "/tools", method: "GET", token: fixture.automationToken });
    assert.strictEqual(response.status, 200, "Failed to retrieve /tools catalog from isolated bridge fixture");
    assert(response.body && Array.isArray(response.body.tools), "Catalog response must contain tools array");
    return response.body.tools;
  } finally {
    await fixture.stop();
  }
}

function extractOne(source, pattern, label) {
  const matches = [...source.matchAll(pattern)];
  assert.strictEqual(matches.length, 1, `Expected exactly one bounded ${label} declaration in bridge-daemon.js`);
  return matches[0][0];
}

function productionPlannerFixture(catalog) {
  // Evaluate only these trusted local declarations, never require/start the daemon here.
  // Actual exported dependency names preserve spreads and derived .filter() expressions.
  const source = fs.readFileSync(path.join(__dirname, "..", "mcp-server", "bridge-daemon.js"), "utf8");
  const declarations = [
    extractOne(source, /^const MUTATING_TOOL_NAMES = new Set\(\[[\s\S]*?^\]\);/gm, "MUTATING_TOOL_NAMES"),
    extractOne(source, /^const PLANNING_TOOL_NAMES = \[[\s\S]*?^\];/gm, "PLANNING_TOOL_NAMES"),
    extractOne(source, /^function buildAePlanPrompt\(args, projectContextSnapshot, solutionHints, projectIntentMemorySection\) \{[\s\S]*?^\}/gm, "buildAePlanPrompt")
  ];
  let forwardedInput;
  const sandbox = {
    tools: catalog,
    projectLifecycleContract: { MUTATIONS: projectLifecycleContract.MUTATIONS },
    projectSave: { TOOL_NAME: projectSave.TOOL_NAME },
    ameTransport: { TOOL_NAME: ameTransport.TOOL_NAME },
    amePresets: { listAmePresetsTool: amePresets.listAmePresetsTool },
    ameRunning: { TOOL_NAME: ameRunning.TOOL_NAME },
    ameFixtureGrant: { TOOL_NAME: ameFixtureGrant.TOOL_NAME },
    ameFixtureRunner: { INSPECT: ameFixtureRunner.INSPECT },
    ameTitleJobs: { ENQUEUE: ameTitleJobs.ENQUEUE, START: ameTitleJobs.START, tools: ameTitleJobs.tools },
    nativeRenderVariant,
    slideshowTools: { TOOL_NAMES: slideshowTools.TOOL_NAMES },
    montageTools: { TOOL_NAMES: montageTools.TOOL_NAMES },
    buildPlannerContext(input) {
      forwardedInput = input;
      return buildPlannerContext(input);
    }
  };
  const production = vm.runInNewContext(
    `"use strict";\n${declarations.join("\n")}\n({ planningNames: PLANNING_TOOL_NAMES, mutatingNames: Array.from(MUTATING_TOOL_NAMES), buildAePlanPrompt });`,
    sandbox,
    { filename: "planner-smoke-production-declarations.js", timeout: 1000 }
  );
  const planningNames = Array.from(production.planningNames);
  const mutatingNames = new Set(Array.from(production.mutatingNames));
  const catalogNames = new Set(catalog.map((tool) => tool.name));
  assert(planningNames.length > 0 && mutatingNames.size > 0, "Production planning and mutation sets must not be empty");
  assert.strictEqual(new Set(planningNames).size, planningNames.length, "Production planning names must be unique");
  for (const name of [...planningNames, ...mutatingNames]) {
    assert(catalogNames.has(name), `Production tool ${name} must exist in the isolated actual catalog`);
  }
  const planningTools = catalog.filter((tool) => planningNames.includes(tool.name));
  assert(planningTools.length < catalog.length, "Production planning input must exclude non-planning tools");

  return {
    planningNames,
    planningTools,
    mutatingNames,
    build(args, snapshot) {
      forwardedInput = null;
      const context = production.buildAePlanPrompt(args, snapshot, null, null);
      assert(forwardedInput, "Production buildAePlanPrompt must forward its input to buildPlannerContext");
      assert.deepStrictEqual(Array.from(forwardedInput.tools, (tool) => tool.name), planningTools.map((tool) => tool.name), "Production wrapper must supply the exact planning catalog, in actual catalog order");
      assert.deepStrictEqual(Array.from(forwardedInput.mutatingNames).sort(), Array.from(mutatingNames).sort(), "Production wrapper must supply the actual mutating set");
      assert.strictEqual(context.metadata.availableToolCount, planningTools.length, "Planner metadata must reflect the production planning catalog");
      return context;
    }
  };
}

function assertRequiredPolicy(context, label) {
  assert(context.text.includes(guidelines.PASSIVE_WAIT_RULE), `${label}: prompt text must contain passive wait rule`);
  assert(context.text.includes(guidelines.MCP_FIRST_COMPUTER_USE_RULE), `${label}: prompt text must contain MCP-first / CU rule`);
  assert(context.text.includes("For any project-changing request, plan inspection steps first"), `${label}: prompt text must contain general rule`);
  assert(context.metadata.promptChars <= MAX_PLANNER_CHARS, `${label}: prompt characters (${context.metadata.promptChars}) must not exceed limit ${MAX_PLANNER_CHARS}`);
  assert.strictEqual(context.metadata.truncated, false, `${label}: prompt context must not be truncated`);
  assert(context.text.endsWith(FINAL_POLICY), `${label}: prompt must end with FINAL_POLICY contract`);
}

async function main() {
  // 1. Verify metadata and named groups in planner-tool-guidance
  assert(Array.isArray(guidelines), "planner-tool-guidance must export an Array for legacy compatibility");
  assert(Array.isArray(guidelines.CROSS_CUTTING_GUIDELINES), "Must export CROSS_CUTTING_GUIDELINES array");
  assert.strictEqual(guidelines.CROSS_CUTTING_GUIDELINES.length, 2, "Must contain exactly 2 cross-cutting rules (rules 41 and 42)");
  assert(guidelines.alwaysIncluded instanceof Set, "Must export alwaysIncluded Set");
  assert.strictEqual(typeof guidelines.isAlwaysIncluded, "function", "Must export isAlwaysIncluded helper");

  assert(guidelines.isAlwaysIncluded(guidelines.PASSIVE_WAIT_RULE), "PASSIVE_WAIT_RULE must be marked always included");
  assert(guidelines.isAlwaysIncluded(guidelines.MCP_FIRST_COMPUTER_USE_RULE), "MCP_FIRST_COMPUTER_USE_RULE must be marked always included");
  assert.strictEqual(guidelines.isAlwaysIncluded("For Puppet pin type changes..."), false, "Specialized rules must not be marked always included");

  // 2. Fetch the authenticated actual catalog, then use the production planner input.
  const catalog = await fetchToolCatalog();
  assert(catalog.length >= 160, `Expected full tool catalog (~170 tools), got ${catalog.length}`);
  const production = productionPlannerFixture(catalog);
  const { planningTools: tools, mutatingNames } = production;

  const promptEvaluations = [];

  for (const item of TEST_PROMPTS) {
    const { id, prompt, expectedSetter } = item;

    // Evaluate tool selection
    const selected = selectTools(prompt, tools, null);
    const selectedNames = new Set(selected.map((t) => t.name));
    assert(selectedNames.has(expectedSetter), `${id}: expected setter ${expectedSetter} to be selected, got: ${Array.from(selectedNames).join(", ")}`);

    // Reproduce the original full-catalog probe separately from production parity.
    const probeSelected = selectTools(prompt, catalog, null);
    const probeLegacyRules = legacyRelevantGuidelines(probeSelected, catalog, mutatingNames);
    assert(!probeLegacyRules.includes(guidelines.PASSIVE_WAIT_RULE), `${id}: original probe must reproduce dropping passive wait rule`);
    assert(!probeLegacyRules.includes(guidelines.MCP_FIRST_COMPUTER_USE_RULE), `${id}: original probe must reproduce dropping MCP-first rule`);

    // The production subset has no run_ai_agent_plan/validate_ai_agent_plan names;
    // legacy MCP-first inclusion there can differ from the original exposed-catalog probe.
    const legacyRules = legacyRelevantGuidelines(selected, tools, mutatingNames);
    const legacyHasPassive = legacyRules.includes(guidelines.PASSIVE_WAIT_RULE);
    const legacyHasMcpFirst = legacyRules.includes(guidelines.MCP_FIRST_COMPUTER_USE_RULE);
    assert.strictEqual(legacyHasPassive, false, `${id}: legacy filter must reproduce dropping passive wait rule`);

    // Evaluate fixed relevantGuidelines
    const activeRules = relevantGuidelines(selected, tools, mutatingNames);
    const hasPassive = activeRules.includes(guidelines.PASSIVE_WAIT_RULE);
    const hasMcpFirst = activeRules.includes(guidelines.MCP_FIRST_COMPUTER_USE_RULE);
    const hasGeneral = activeRules.some((r) => r.startsWith("For any project-changing request"));

    assert.strictEqual(hasPassive, true, `${id}: fixed filter must preserve passive wait rule`);
    assert.strictEqual(hasMcpFirst, true, `${id}: fixed filter must preserve MCP-first rule`);
    assert.strictEqual(hasGeneral, true, `${id}: fixed filter must preserve general project change rule`);

    // Build full planner context
    const context = production.build({ prompt }, {
      activeComp: { name: "Main Comp", itemIndex: 1, duration: 10, width: 1920, height: 1080 },
      selectedLayers: [{ index: 1, name: "Title Layer" }]
    });

    assertRequiredPolicy(context, id);
    assert.strictEqual(context.metadata.selectedToolCount, selected.length, `${id}: production context must preserve the selection evaluated above`);

    // Assert expected setter is present in the context catalog
    assert(context.text.includes(`- ${expectedSetter} (mutates):`), `${id}: prompt catalog must include setter ${expectedSetter}`);

    // Assert unrelated specialized guidance remains filtered
    for (const pattern of UNRELATED_SPECIALIZED_PATTERNS) {
      assert(
        !context.text.includes(pattern),
        `${id}: unrelated specialized guidance "${pattern}" should be filtered out`
      );
    }

    // Assert token / character budgets
    assert(context.metadata.selectedToolCount < tools.length, `${id}: tool selection must filter irrelevant tools`);

    promptEvaluations.push({
      id,
      prompt,
      selectedToolCount: context.metadata.selectedToolCount,
      guidanceCount: context.metadata.guidanceCount,
      promptChars: context.metadata.promptChars,
      appropriateSetterSelected: true,
      originalProbeLegacyDefectReproduced: true,
      productionLegacyRules: { passiveWaitRule: legacyHasPassive, mcpFirstComputerUseRule: legacyHasMcpFirst },
      productionInputParity: true,
      crossCuttingRulesPreserved: hasPassive && hasMcpFirst,
      unrelatedSpecializedFiltered: true,
      budgetRespected: true
    });
  }

  const titleRoutingEvaluations = [];
  for (const item of TITLE_ROUTING_PROMPTS) {
    for (const retrieval of [null, { toolMatches: [{ preferredTools: [nativeRenderVariant.INSPECT, nativeRenderVariant.RENDER] }] }]) {
      const selectedNames = new Set(selectTools(item.prompt, tools, retrieval).map((tool) => tool.name));
      for (const name of item.expected) assert(selectedNames.has(name), `${item.id}: must select ${name}`);
      for (const name of item.absent) assert(!selectedNames.has(name), `${item.id}: must not select ${name}, including retrieval hints`);
    }
    const context = production.build({ prompt: item.prompt });
    assertRequiredPolicy(context, item.id);
    for (const name of item.expected) {
      const mode = mutatingNames.has(name) ? "mutates" : "read-only";
      assert(context.text.includes(`- ${name} (${mode}):`), `${item.id}: production context must contain the selected ${name} contract`);
    }
    for (const name of item.absent) assert(!context.text.includes(`- ${name} (`), `${item.id}: production context must exclude the unrelated ${name} contract`);
    if (item.expected.includes(nativeRenderVariant.RENDER)) {
      assert(mutatingNames.has(nativeRenderVariant.RENDER), `${item.id}: native render must remain a mutation`);
      assert(context.text.includes("Protected manual CEP synchronous native render"), `${item.id}: manual CEP render contract must remain explicit`);
      assert(context.text.includes("Requires current dry-run"), `${item.id}: render dry-run requirement must remain explicit`);
      assert(context.text.includes("expectedStateHash") && context.text.includes("renderSettingsTemplate") && context.text.includes("outputModuleTemplate"), `${item.id}: current state and inspected templates must remain required`);
    }
    titleRoutingEvaluations.push({ id: item.id, expected: item.expected, absent: item.absent, retrievalIntentGuardChecked: true });
  }

  const lifecycleEvaluations = [];
  for (const name of projectLifecycleContract.MUTATIONS) {
    const tool = tools.find((item) => item.name === name);
    assert(tool, `Lifecycle mutation ${name} must be in the production planning catalog`);
    assert(mutatingNames.has(name), `Lifecycle mutation ${name} must belong to the production mutating set`);
    assert(!Object.hasOwn(tool.inputSchema.properties || {}, "autoCheckpoint"), `Lifecycle ${name} must exercise mutation labeling without autoCheckpoint`);
    const context = production.build({ prompt: `Use ${name} for the explicitly requested project lifecycle operation and verify the result.` });
    assertRequiredPolicy(context, name);
    assert(context.text.includes(`- ${name} (mutates):`), `Lifecycle ${name} must be labeled as mutating in the production prompt`);
    assert(!context.text.includes(`- ${name} (read-only):`), `Lifecycle ${name} must not be mislabeled read-only`);
    assert(context.text.includes("Run project lifecycle steps only through a valid manual CEP proposal, exact successful dry-run, and explicit confirmation"), `Lifecycle ${name}: manual lifecycle gates must remain in the prompt`);
    lifecycleEvaluations.push({ tool: name, lacksAutoCheckpoint: true, labeledMutating: true, manualGatesPreserved: true });
  }

  const report = {
    ok: true,
    suite: "planner-guidance-routing-smoke",
    probeResultsSource: PROBE_RESULTS_PATH,
    productionPolicySource: "mcp-server/bridge-daemon.js: MUTATING_TOOL_NAMES, PLANNING_TOOL_NAMES, buildAePlanPrompt (bounded evaluation with actual exported dependency names)",
    toolsCatalogCount: catalog.length,
    productionPlanningToolCount: tools.length,
    productionMutatingToolCount: mutatingNames.size,
    nonPlanningToolsExcluded: catalog.filter((tool) => !production.planningNames.includes(tool.name)).map((tool) => tool.name),
    crossCuttingRulesCount: guidelines.CROSS_CUTTING_GUIDELINES.length,
    promptEvaluations,
    titleRoutingEvaluations,
    lifecycleEvaluations,
    verifications: {
      defectF02ReproducedAndFixed: true,
      crossCuttingGuidanceAlwaysIncluded: true,
      specializedGuidanceStillFiltered: true,
      appropriateSettersSelected: true,
      titleVariantRenderIntentScoped: true,
      tokenBudgetsPreserved: true,
      legacyArrayContractPreserved: true,
      productionPlannerInputParity: true,
      lifecycleMutationLabelsPreserved: true,
      automationAuthenticationPreserved: true,
      offlineOnlyNoAeWrites: true
    }
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message || String(error) }, null, 2));
  process.exit(1);
});
