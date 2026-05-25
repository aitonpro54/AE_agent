"use strict";

const assert = require("assert");

const FAILURE_IDS = {
  unresolvedFolderItemIndex: "unresolved-folderItemIndex",
  unresolvedMarkerCompItemIndex: "unresolved-markerCompItemIndex",
  wrongExactNameBinding: "wrong-exactName-binding",
  wrongDuplicateLayersOrder: "wrong-duplicate_layers-layer-name-order",
  missingFinalReadbackSummary: "missing-final-readback-summary"
};

const MUTATING_TOOLS = new Set([
  "add_layer_marker",
  "create_camera_layer",
  "create_comp",
  "create_project_folder",
  "create_solid_layer",
  "create_text_layer",
  "duplicate_layer",
  "duplicate_layers",
  "move_project_items_to_folder"
]);

const READBACK_TOOLS = new Set([
  "find_project_items",
  "get_active_comp",
  "get_comp_details",
  "get_layer_details",
  "get_project_info",
  "list_project_folder_items"
]);

const MANUAL_TYPED_TOOL_CORPUS = [
  {
    id: "openai-cli-folder-move-from-reference-layout",
    promptFamily: "screenshot-openai-cli-agent-folder-setup",
    sourceContext: "Reference 1 compact OpenAI CLI Agent flow plus Dakkshin typed project-structure intake.",
    prompt: "Create a generated folder, make a comp, move the comp into the folder, then show the folder contents.",
    ownerToFlip: "M217",
    fixedExpectation: "folder.itemIndex is bound as targetFolderItemIndex or normalized to folderItemIndex before validation.",
    expectedCurrentFailures: [FAILURE_IDS.unresolvedFolderItemIndex],
    plan: {
      summary: "Manual folder organization flow.",
      risk: "medium",
      requiresCheckpoint: true,
      steps: [
        {
          title: "Create generated folder",
          tool: "create_project_folder",
          args: { name: "Codex Manual Folder" },
          simulatedResult: {
            ok: true,
            folder: { itemIndex: 41, name: "Codex Manual Folder", type: "folder" }
          }
        },
        {
          title: "Create generated comp",
          tool: "create_comp",
          args: { name: "Codex Manual Folder Comp", width: 1280, height: 720, duration: 4, frameRate: 24 },
          simulatedResult: { ok: true, itemIndex: 42, name: "Codex Manual Folder Comp", type: "comp" }
        },
        {
          title: "Move comp into folder",
          tool: "move_project_items_to_folder",
          args: { itemIndices: ["{{itemIndex}}"], targetFolderItemIndex: "{{folderItemIndex}}" }
        },
        {
          title: "Read folder contents",
          tool: "list_project_folder_items",
          args: { folderName: "Codex Manual Folder" }
        }
      ]
    }
  },
  {
    id: "agent-marker-comp-binding-from-dakkshin-intake",
    promptFamily: "dakkshin-marker-lifecycle-manual-panel",
    sourceContext: "Dakkshin typed-tool intake for marker workflows shown through the Agent step-card surface.",
    prompt: "Create a generated comp, add a layer, place a marker, and read back marker details.",
    ownerToFlip: "M217",
    fixedExpectation: "markerCompItemIndex is normalized into compItemIndex and binds to the created comp item index.",
    expectedCurrentFailures: [FAILURE_IDS.unresolvedMarkerCompItemIndex],
    plan: {
      summary: "Manual marker lifecycle flow.",
      risk: "medium",
      requiresCheckpoint: true,
      steps: [
        {
          title: "Create marker comp",
          tool: "create_comp",
          args: { name: "Codex Manual Marker Comp", width: 1280, height: 720, duration: 4, frameRate: 24 },
          simulatedResult: { ok: true, itemIndex: 51, name: "Codex Manual Marker Comp", type: "comp" }
        },
        {
          title: "Create source layer",
          tool: "create_solid_layer",
          args: { compItemIndex: "{{itemIndex}}", name: "Codex Manual Marker Solid", color: [1, 0, 0], width: 1280, height: 720 },
          simulatedResult: { ok: true, layer: { index: 1, name: "Codex Manual Marker Solid" } }
        },
        {
          title: "Add marker",
          tool: "add_layer_marker",
          args: {
            markerCompItemIndex: "{{markerCompItemIndex}}",
            layerIndex: 1,
            comment: "Codex Manual Marker",
            time: 1,
            duration: 0.25
          }
        },
        {
          title: "Read marker details",
          tool: "get_layer_details",
          args: { compName: "Codex Manual Marker Comp", layerIndex: 1 }
        }
      ]
    }
  },
  {
    id: "openai-api-exact-name-project-search",
    promptFamily: "screenshot-openai-api-without-key-project-search",
    sourceContext: "Reference 3 API setup prompt shape plus Dakkshin project-item typed search intake.",
    prompt: "Find the exact generated comp named Codex Manual Search Comp before reusing it.",
    ownerToFlip: "M217",
    fixedExpectation: "find_project_items uses query:\"Name\", exactName:true, and type:\"comp\" for exact comp lookup.",
    expectedCurrentFailures: [FAILURE_IDS.wrongExactNameBinding],
    plan: {
      summary: "Manual exact-name project-item lookup.",
      risk: "low",
      requiresCheckpoint: false,
      steps: [
        {
          title: "Find generated comp",
          tool: "find_project_items",
          args: { exactName: "Codex Manual Search Comp", itemType: "composition", limit: 1 }
        }
      ]
    }
  },
  {
    id: "focused-chat-duplicate-layers-order",
    promptFamily: "screenshot-focused-chat-duplicate-layers",
    sourceContext: "Reference 5 step-card duplicate flow plus Dakkshin duplicate-layer typed intake.",
    prompt: "Create two visible source layers, duplicate both with duplicate_layers, and verify source/duplicate pairs.",
    ownerToFlip: "M218",
    fixedExpectation: "duplicate_layers sourceNames match After Effects layer-index stack order after new layers insert at index 1.",
    expectedCurrentFailures: [FAILURE_IDS.wrongDuplicateLayersOrder],
    plan: {
      summary: "Manual duplicate_layers stack-order flow.",
      risk: "medium",
      requiresCheckpoint: true,
      steps: [
        {
          title: "Create comp",
          tool: "create_comp",
          args: { name: "Codex Manual Duplicate Comp", width: 1280, height: 720, duration: 4, frameRate: 24 },
          simulatedResult: { ok: true, itemIndex: 61, name: "Codex Manual Duplicate Comp", type: "comp" }
        },
        {
          title: "Create first source",
          tool: "create_solid_layer",
          args: { compItemIndex: "{{itemIndex}}", name: "Codex Manual Source A", color: [1, 0, 0], width: 1280, height: 720 },
          simulatedLayerName: "Codex Manual Source A"
        },
        {
          title: "Create second source",
          tool: "create_text_layer",
          args: { compItemIndex: "{{itemIndex}}", name: "Codex Manual Source B", text: "Manual B", fontSize: 48 },
          simulatedLayerName: "Codex Manual Source B"
        },
        {
          title: "Duplicate both sources",
          tool: "duplicate_layers",
          args: {
            compItemIndex: "{{itemIndex}}",
            layerIndices: [1, 2],
            sourceNames: ["Codex Manual Source A", "Codex Manual Source B"],
            nameSuffix: " copy"
          }
        },
        {
          title: "Read duplicate result",
          tool: "get_comp_details",
          args: { compItemIndex: "{{itemIndex}}" }
        }
      ]
    }
  },
  {
    id: "model-menu-camera-without-final-summary",
    promptFamily: "screenshot-openai-cli-model-menu-camera",
    sourceContext: "Reference 2 model-menu Agent prompt plus Dakkshin camera typed-tool intake.",
    prompt: "Add a generated camera and report the final camera position and zoom back to the user.",
    ownerToFlip: "M218",
    fixedExpectation: "mutating manual typed-tool plans end with a final read-back summary step for the created camera/layer.",
    expectedCurrentFailures: [FAILURE_IDS.missingFinalReadbackSummary],
    plan: {
      summary: "Manual camera creation without final read-back.",
      risk: "medium",
      requiresCheckpoint: true,
      steps: [
        {
          title: "Create generated camera",
          tool: "create_camera_layer",
          args: {
            name: "Codex Manual Camera",
            pointOfInterest: [640, 360, 0],
            position: [640, 360, -900],
            zoom: 600
          }
        }
      ]
    }
  }
];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function collectBindingTokens(value, tokens = []) {
  if (typeof value === "string") {
    const match = value.match(/^{{([^{}]+)}}$/);
    if (match) tokens.push(match[1]);
    return tokens;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectBindingTokens(item, tokens);
    return tokens;
  }
  if (isPlainObject(value)) {
    for (const item of Object.values(value)) collectBindingTokens(item, tokens);
  }
  return tokens;
}

function addTopLevelResultBindings(bindings, result) {
  if (!isPlainObject(result)) return;
  for (const [key, value] of Object.entries(result)) {
    if (value === undefined || value === null) continue;
    bindings.set(key, value);
  }
}

function addFailure(failures, id, step, detail) {
  failures.set(id, {
    id,
    stepTitle: step ? step.title : null,
    tool: step ? step.tool : null,
    detail
  });
}

function inspectUnresolvedBindings(testCase, failures) {
  const bindings = new Map();
  for (const step of testCase.plan.steps) {
    const args = step.args || {};
    const tokens = collectBindingTokens(args);
    for (const token of tokens) {
      if (!bindings.has(token)) {
        if (token === "folderItemIndex") {
          addFailure(failures, FAILURE_IDS.unresolvedFolderItemIndex, step, "folder.itemIndex is present only as a nested result value.");
        }
        if (token === "markerCompItemIndex") {
          addFailure(failures, FAILURE_IDS.unresolvedMarkerCompItemIndex, step, "markerCompItemIndex is not normalized or bound before marker execution.");
        }
      }
    }

    if (step.tool === "add_layer_marker" && Object.prototype.hasOwnProperty.call(args, "markerCompItemIndex") && !Object.prototype.hasOwnProperty.call(args, "compItemIndex")) {
      addFailure(failures, FAILURE_IDS.unresolvedMarkerCompItemIndex, step, "markerCompItemIndex remains an unsupported alias for compItemIndex.");
    }

    addTopLevelResultBindings(bindings, step.simulatedResult);
  }
}

function inspectExactNameBinding(testCase, failures) {
  for (const step of testCase.plan.steps) {
    const args = step.args || {};
    if (step.tool !== "find_project_items") continue;
    if (typeof args.exactName === "string" && !Object.prototype.hasOwnProperty.call(args, "query")) {
      addFailure(failures, FAILURE_IDS.wrongExactNameBinding, step, "exactName carries the search string instead of query plus exactName:true.");
    }
  }
}

function inspectDuplicateLayersOrder(testCase, failures) {
  const aeLayerStack = [];
  for (const step of testCase.plan.steps) {
    if (step.tool === "create_solid_layer" || step.tool === "create_text_layer") {
      const layerName = step.simulatedLayerName || step.args && step.args.name;
      if (layerName) aeLayerStack.unshift(layerName);
    }
    if (step.tool !== "duplicate_layers") continue;
    const args = step.args || {};
    const layerIndices = Array.isArray(args.layerIndices) ? args.layerIndices : [];
    const sourceNames = Array.isArray(args.sourceNames) ? args.sourceNames : [];
    const mismatches = [];
    for (let index = 0; index < layerIndices.length; index += 1) {
      const requestedLayerIndex = layerIndices[index];
      const expectedName = sourceNames[index];
      const actualName = aeLayerStack[requestedLayerIndex - 1];
      if (expectedName && actualName && expectedName !== actualName) {
        mismatches.push({ requestedLayerIndex, expectedName, actualName });
      }
    }
    if (mismatches.length > 0) {
      addFailure(
        failures,
        FAILURE_IDS.wrongDuplicateLayersOrder,
        step,
        `sourceNames do not match AE stack order: ${JSON.stringify(mismatches)}`
      );
    }
  }
}

function inspectFinalReadbackSummary(testCase, failures) {
  const steps = testCase.plan.steps;
  let lastMutatingIndex = -1;
  for (let index = 0; index < steps.length; index += 1) {
    if (MUTATING_TOOLS.has(steps[index].tool)) lastMutatingIndex = index;
  }
  if (lastMutatingIndex < 0) return;
  const hasReadbackAfterMutation = steps.slice(lastMutatingIndex + 1).some((step) => READBACK_TOOLS.has(step.tool));
  if (!hasReadbackAfterMutation) {
    addFailure(
      failures,
      FAILURE_IDS.missingFinalReadbackSummary,
      steps[lastMutatingIndex],
      "last mutating manual typed-tool step is not followed by a read-back summary tool."
    );
  }
}

function classifyCase(testCase) {
  const failures = new Map();
  inspectUnresolvedBindings(testCase, failures);
  inspectExactNameBinding(testCase, failures);
  inspectDuplicateLayersOrder(testCase, failures);
  inspectFinalReadbackSummary(testCase, failures);
  const observedCurrentFailures = Array.from(failures.keys()).sort();
  return {
    id: testCase.id,
    classification: observedCurrentFailures.length > 0 ? "expected-current-failure" : "fixed",
    observedCurrentFailures,
    details: Array.from(failures.values())
  };
}

function main() {
  assert.strictEqual(MANUAL_TYPED_TOOL_CORPUS.length, 5, "M216 corpus must cover exactly five manual prompt families");

  const seenExpectedFailures = new Set();
  const reports = MANUAL_TYPED_TOOL_CORPUS.map((testCase) => {
    const report = classifyCase(testCase);
    const expected = testCase.expectedCurrentFailures.slice().sort();
    assert.deepStrictEqual(
      report.observedCurrentFailures,
      expected,
      `${testCase.id}: expected current-failure classification must match the M216 corpus`
    );
    assert.strictEqual(report.classification, "expected-current-failure", `${testCase.id}: M216 keeps this case as an expected current failure`);
    for (const failureId of expected) seenExpectedFailures.add(failureId);
    return { testCase, report };
  });

  assert.deepStrictEqual(
    Array.from(seenExpectedFailures).sort(),
    Object.values(FAILURE_IDS).sort(),
    "M216 corpus must reproduce every required manual typed-tool failure family"
  );

  console.log("manual-typed-tool-regression-smoke: recorded 5 expected current failures");
  for (const { testCase, report } of reports) {
    console.log(`- ${testCase.id}: ${report.observedCurrentFailures.join(", ")}; flipOwner=${testCase.ownerToFlip}`);
  }
}

main();
