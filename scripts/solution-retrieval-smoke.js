"use strict";

const assert = require("assert");

const {
  PLANNER_USE,
  retrieveSolutionHints,
  formatSolutionHintsForPrompt
} = require("../mcp-server/solution-library");

const AVAILABLE_TOOLS = [
  "get_active_comp",
  "get_selected_layers",
  "align_layers_to_time",
  "duplicate_layers",
  "create_text_layer",
  "get_render_queue_status",
  "run_extendscript_file"
];

function solution(overrides = {}) {
  return Object.assign({
    schema: "ae-solution.v1",
    id: "fixture-align-selected-layers",
    title: "Align Selected Layers To CTI",
    status: "recipe",
    tags: ["timeline", "layers", "align"],
    intent: {
      summary: "Align selected layers to the active comp current time indicator.",
      appliesWhen: ["The user asks to align selected layers, clips, or precomps to the CTI."]
    },
    inputs: [
      {
        name: "selectedLayerIndices",
        type: "layer-selection",
        required: true,
        description: "Selected layers from get_active_comp or get_selected_layers."
      }
    ],
    targetAssumptions: ["An active comp exists.", "One or more layers are selected."],
    execution: {
      mode: "typed-plan",
      mutating: true,
      riskLevel: "medium",
      recipePath: "recipes/README.md",
      scriptPath: null,
      preferredTools: ["get_active_comp", "align_layers_to_time", "get_selected_layers"]
    },
    requiredSafetyGates: {
      planValidation: true,
      explicitConfirmation: true,
      allowMutations: true,
      idempotency: true,
      checkpointOrEditSession: true,
      postMutationReadBack: true
    },
    verificationRecipe: {
      summary: "Read back selected layer timing after the run.",
      steps: ["Use get_selected_layers and compare startTime to the CTI."],
      expectedEvidence: ["Affected layers report the expected startTime."]
    },
    testedAeContext: {
      aeVersion: null,
      panelVersion: "AE Agent 2.0.0",
      bridgeVersion: "2.0.0",
      projectKind: "synthetic",
      notes: []
    },
    promotionHistory: [
      {
        date: "2026-05-15",
        from: "candidate",
        to: "recipe",
        reviewer: "codex",
        evidence: "Fixture review.",
        commit: null
      }
    ],
    notes: []
  }, overrides);
}

function registry(solutions) {
  return {
    schema: "ae-solution-registry.v1",
    solutionSchema: "ae-solution.v1",
    updatedAt: "2026-05-15",
    policy: {
      trackedStatuses: ["recipe", "typed-tool-candidate", "tool"],
      candidateLocation: "logs/solution-candidates/",
      plannerUse: PLANNER_USE,
      executionRule: "Solutions are advisory metadata; execution still uses validated Agent plans."
    },
    solutions
  };
}

function ids(retrieval) {
  return retrieval.entries.map((entry) => entry.id);
}

function run() {
  const relevant = solution();
  const irrelevant = solution({
    id: "fixture-render-queue-only",
    title: "Render Queue Status Only",
    tags: ["render", "queue"],
    intent: {
      summary: "Inspect render queue status for queued comps.",
      appliesWhen: ["The user asks about render queue items."]
    },
    execution: {
      mode: "typed-plan",
      mutating: false,
      riskLevel: "low",
      recipePath: "recipes/README.md",
      scriptPath: null,
      preferredTools: ["get_render_queue_status"]
    },
    requiredSafetyGates: {
      planValidation: true,
      explicitConfirmation: false,
      allowMutations: false,
      idempotency: false,
      checkpointOrEditSession: false,
      postMutationReadBack: false
    },
    targetAssumptions: [],
    verificationRecipe: {
      summary: "Render queue metadata is returned.",
      steps: [],
      expectedEvidence: []
    }
  });
  const stale = solution({
    id: "fixture-stale-align-legacy-tool",
    title: "Stale Legacy Align Recipe",
    execution: {
      mode: "typed-plan",
      mutating: true,
      riskLevel: "medium",
      recipePath: "recipes/README.md",
      scriptPath: null,
      preferredTools: ["legacy_align_layers"]
    }
  });
  const candidate = solution({
    id: "fixture-candidate-align",
    title: "Candidate Align Recipe",
    status: "candidate"
  });

  const baseRetrieval = retrieveSolutionHints("Align selected layers to the current time indicator.", {
    registry: registry([relevant, irrelevant, stale, candidate]),
    availableToolNames: AVAILABLE_TOOLS,
    topN: 3
  });
  assert.strictEqual(baseRetrieval.ok, true);
  assert(ids(baseRetrieval).includes("fixture-align-selected-layers"), "relevant reviewed recipe should surface.");
  assert(!ids(baseRetrieval).includes("fixture-render-queue-only"), "irrelevant recipe should be omitted.");
  assert(!ids(baseRetrieval).includes("fixture-stale-align-legacy-tool"), "stale recipe should be omitted.");
  assert(!ids(baseRetrieval).includes("fixture-candidate-align"), "candidate entries must remain invisible.");
  assert.strictEqual(baseRetrieval.omitted.candidates, 1);
  assert.strictEqual(baseRetrieval.omitted.stale, 1);

  const raw = solution({
    id: "fixture-reviewed-glitch-jsx",
    title: "Reviewed Glitch Matte JSX",
    tags: ["glitch", "matte", "reviewed-jsx"],
    intent: {
      summary: "Create a specialized generated glitch matte with a reviewed script.",
      appliesWhen: ["The user asks for the reviewed glitch matte workflow."]
    },
    execution: {
      mode: "extendscript-file",
      mutating: true,
      riskLevel: "high",
      recipePath: "recipes/README.md",
      scriptPath: "scripts/solutions/reviewed-glitch-matte.jsx",
      preferredTools: ["run_extendscript_file"]
    }
  });
  const rawRetrieval = retrieveSolutionHints("Use the reviewed glitch matte workflow.", {
    registry: registry([raw]),
    availableToolNames: AVAILABLE_TOOLS,
    topN: 3
  });
  assert.strictEqual(rawRetrieval.entries.length, 1);
  assert.strictEqual(rawRetrieval.entries[0].rawExtendscriptRisk, true);
  assert(formatSolutionHintsForPrompt(rawRetrieval).indexOf("RAW EXTENDSCRIPT REVIEWED FILE") >= 0);

  const rawAlign = solution({
    id: "fixture-raw-align-jsx",
    title: "Legacy Raw Align JSX",
    tags: ["timeline", "layers", "align", "reviewed-jsx"],
    execution: {
      mode: "extendscript-file",
      mutating: true,
      riskLevel: "high",
      recipePath: "recipes/README.md",
      scriptPath: "scripts/solutions/legacy-align.jsx",
      preferredTools: ["run_extendscript_file"]
    }
  });
  const toolAlign = solution({
    id: "fixture-align-tool",
    title: "Align Layers Typed Tool",
    status: "tool",
    tags: ["timeline", "layers", "align"],
    execution: {
      mode: "typed-plan",
      mutating: true,
      riskLevel: "medium",
      recipePath: null,
      scriptPath: null,
      preferredTools: ["align_layers_to_time"]
    }
  });
  const equivalentRetrieval = retrieveSolutionHints("Align selected layers to the CTI.", {
    registry: registry([rawAlign, toolAlign]),
    availableToolNames: AVAILABLE_TOOLS,
    topN: 3
  });
  assert.strictEqual(equivalentRetrieval.entries.length, 0, "raw recipe should not surface when a typed-tool equivalent matches.");
  assert.strictEqual(equivalentRetrieval.toolMatches.length, 1, "tool status should be represented as a tool-catalog match.");
  assert.strictEqual(equivalentRetrieval.omitted.typedToolEquivalent, 1);
  assert(formatSolutionHintsForPrompt(equivalentRetrieval).indexOf("normal MCP tool catalog") >= 0);

  const duplicateTool = solution({
    id: "fixture-duplicate-layers-tool",
    title: "Duplicate Layers Typed Tool",
    status: "tool",
    tags: ["layers", "duplicate", "selected-layers"],
    intent: {
      summary: "Use duplicate_layers for explicit bulk or selected-layer duplicate requests.",
      appliesWhen: ["The user asks to duplicate multiple explicit or selected layers."]
    },
    execution: {
      mode: "typed-plan",
      mutating: true,
      riskLevel: "medium",
      recipePath: null,
      scriptPath: null,
      preferredTools: ["get_selected_layers", "duplicate_layers"]
    },
    verificationRecipe: {
      summary: "Selected-layer duplicate plans require get_selected_layers evidence before duplicate_layers.",
      steps: ["Run get_selected_layers before selected-layer duplication."],
      expectedEvidence: ["duplicate_layers returns source/duplicate pairs."]
    },
    notes: [
      "Selected-layer duplicate workflows require prior get_selected_layers evidence.",
      "Keep raw ExtendScript and deep precomp/source duplication out of this guidance."
    ]
  });
  const duplicateRetrieval = retrieveSolutionHints("Duplicate selected layers in the active comp.", {
    registry: registry([duplicateTool]),
    availableToolNames: AVAILABLE_TOOLS,
    topN: 3
  });
  const duplicatePromptSection = formatSolutionHintsForPrompt(duplicateRetrieval);
  assert.strictEqual(duplicateRetrieval.entries.length, 0, "tool status guidance should be represented by toolMatches, not recipe entries.");
  assert.strictEqual(duplicateRetrieval.toolMatches.length, 1, "duplicate_layers tool guidance should surface as a tool match.");
  assert(duplicatePromptSection.includes("Duplicate Layers Typed Tool"), "tool guidance title should be included in the prompt section.");
  assert(duplicatePromptSection.includes("get_selected_layers"), "selected-layer duplicate guidance should mention prior selected-layer evidence.");
  assert(duplicatePromptSection.includes("duplicate_layers"), "bulk duplicate guidance should prefer duplicate_layers.");

  const typedCandidate = solution({
    id: "fixture-tool-candidate",
    title: "Implement Narrow Matte Tool",
    status: "typed-tool-candidate",
    tags: ["matte", "tooling"],
    intent: {
      summary: "The workflow should become a narrow typed bridge tool before repeated use.",
      appliesWhen: ["The user asks to repeat the same matte-generation workaround."]
    },
    execution: {
      mode: "recipe",
      mutating: true,
      riskLevel: "medium",
      recipePath: "recipes/README.md",
      scriptPath: null,
      preferredTools: ["future_create_matte_tool"]
    }
  });
  const candidateRetrieval = retrieveSolutionHints("Repeat the matte generation workaround.", {
    registry: registry([typedCandidate]),
    availableToolNames: AVAILABLE_TOOLS,
    topN: 3
  });
  assert.strictEqual(candidateRetrieval.entries.length, 1);
  assert.strictEqual(candidateRetrieval.entries[0].status, "typed-tool-candidate");
  assert(formatSolutionHintsForPrompt(candidateRetrieval).indexOf("recommend implementing") >= 0);

  console.log(JSON.stringify({
    ok: true,
    surfaced: ids(baseRetrieval),
    rawRisk: rawRetrieval.entries[0].rawExtendscriptRisk,
    toolMatches: equivalentRetrieval.toolMatches.map((match) => match.id),
    duplicateToolMatches: duplicateRetrieval.toolMatches.map((match) => match.id),
    typedToolCandidate: candidateRetrieval.entries[0].id
  }, null, 2));
}

run();
