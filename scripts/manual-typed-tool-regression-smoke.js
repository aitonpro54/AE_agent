"use strict";

const assert = require("assert");

const FAILURE_IDS = {
  unresolvedFolderItemIndex: "unresolved-folderItemIndex",
  unresolvedMarkerCompItemIndex: "unresolved-markerCompItemIndex",
  wrongExactNameBinding: "wrong-exactName-binding",
  wrongDuplicateLayersOrder: "wrong-duplicate_layers-layer-name-order",
  missingFinalReadbackSummary: "missing-final-readback-summary",
  unsafeDeleteAliasNotRejected: "unsafe-delete-alias-not-rejected",
  missingDeleteLayerEvidence: "missing-delete_layer-evidence",
  unsafeCompPropertyMutation: "unsafe-comp-property-mutation",
  unsafeMaskMutation: "unsafe-mask-mutation"
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
  "delete_layer",
  "set_comp_properties",
  "set_layer_mask",
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
    expectedCurrentFailures: [],
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
    expectedCurrentFailures: [],
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
            compItemIndex: "{{compItemIndex}}",
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
    expectedCurrentFailures: [],
    plan: {
      summary: "Manual exact-name project-item lookup.",
      risk: "low",
      requiresCheckpoint: false,
      steps: [
        {
          title: "Find generated comp",
          tool: "find_project_items",
          args: { query: "Codex Manual Search Comp", exactName: true, type: "comp", limit: 1 }
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
    expectedCurrentFailures: [],
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
            sourceNames: ["Codex Manual Source B", "Codex Manual Source A"],
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
    expectedCurrentFailures: [],
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
        },
        {
          title: "Read generated camera result",
          tool: "get_comp_details",
          args: { includeLayers: true }
        }
      ]
    }
  },
  {
    id: "dakkshin-safe-delete-layer-alias-evidence",
    promptFamily: "dakkshin-delete-layer-alias-manual-panel",
    sourceContext: "M222 Dakkshin risky typed-tool alias repair for deleteLayer/delete layer/remove layer.",
    prompt: "Inspect the generated comp, remove only the named generated layer, then prove it is gone.",
    ownerToFlip: "M222",
    fixedExpectation: "delete_layer is used only with prior comp/layer inspection, explicit layerIndex, expectedLayerName, and post-run read-back.",
    expectedCurrentFailures: [],
    plan: {
      summary: "Manual delete_layer evidence-bound flow.",
      risk: "high",
      requiresCheckpoint: true,
      steps: [
        {
          title: "Inspect delete target layers",
          tool: "get_comp_details",
          args: { compName: "Codex Manual Delete Comp", includeLayers: true }
        },
        {
          title: "Delete one generated layer",
          tool: "delete_layer",
          args: {
            compName: "Codex Manual Delete Comp",
            layerIndex: 1,
            expectedLayerName: "Codex Manual Delete Source"
          }
        },
        {
          title: "Read comp after deletion",
          tool: "get_comp_details",
          args: { compName: "Codex Manual Delete Comp", includeLayers: true }
        }
      ]
    }
  },
  {
    id: "dakkshin-unsafe-delete-alias-rejected",
    promptFamily: "dakkshin-delete-layer-naked-natural-language",
    sourceContext: "M222 Dakkshin risky typed-tool alias rejection for naked deleteLayer/remove layer plans.",
    prompt: "Remove the selected layer.",
    ownerToFlip: "M222",
    fixedExpectation: "deleteLayer/delete layer/remove layer is not repaired from naked natural-language intent without prior inspection evidence.",
    expectedCurrentFailures: [],
    repairExpectation: {
      status: "rejected",
      reason: "missing prior comp/layer inspection evidence"
    },
    plan: {
      summary: "Unsafe naked delete alias should stay rejected.",
      risk: "high",
      requiresCheckpoint: true,
      steps: [
        {
          title: "Remove selected layer without inspection",
          tool: "deleteLayer",
          args: { layer: "selected" }
        }
      ]
    }
  },
  {
    id: "dakkshin-set-comp-properties-readback",
    promptFamily: "dakkshin-set-composition-properties-alias",
    sourceContext: "M222 Dakkshin setCompositionProperties alias normalization and semantic read-back.",
    prompt: "Set only the generated comp width, height, frame rate, and background color, then read it back.",
    ownerToFlip: "M222",
    fixedExpectation: "set_comp_properties updates only the approved comp property subset and is followed by comp read-back.",
    expectedCurrentFailures: [],
    plan: {
      summary: "Manual set_comp_properties bounded flow.",
      risk: "medium",
      requiresCheckpoint: true,
      steps: [
        {
          title: "Set generated comp properties",
          tool: "set_comp_properties",
          args: {
            compName: "Codex Manual Properties Comp",
            width: 1920,
            height: 1080,
            frameRate: 30,
            bgColor: [0.1, 0.2, 0.3]
          }
        },
        {
          title: "Read generated comp properties",
          tool: "get_comp_details",
          args: { compName: "Codex Manual Properties Comp" }
        }
      ]
    }
  },
  {
    id: "dakkshin-set-layer-mask-readback",
    promptFamily: "dakkshin-set-layer-mask-alias",
    sourceContext: "M222 Dakkshin setLayerMask alias normalization and semantic mask read-back.",
    prompt: "Create one generated mask, update its opacity, and read the mask after each change.",
    ownerToFlip: "M222",
    fixedExpectation: "set_layer_mask uses only create/update on one explicit layer/mask and reads the mask back after each mutation.",
    expectedCurrentFailures: [],
    plan: {
      summary: "Manual set_layer_mask bounded flow.",
      risk: "medium",
      requiresCheckpoint: true,
      steps: [
        {
          title: "Create generated mask",
          tool: "set_layer_mask",
          args: {
            compName: "Codex Manual Mask Comp",
            layerIndex: 1,
            operation: "create",
            name: "Codex Manual Mask",
            vertices: [[120, 80], [520, 80], [520, 280], [120, 280]],
            maskMode: "add"
          }
        },
        {
          title: "Read mask after create",
          tool: "get_layer_details",
          args: { compName: "Codex Manual Mask Comp", layerIndex: 1 }
        },
        {
          title: "Update generated mask",
          tool: "set_layer_mask",
          args: {
            compName: "Codex Manual Mask Comp",
            layerIndex: 1,
            operation: "update",
            maskIndex: 1,
            expectedMaskName: "Codex Manual Mask",
            opacity: 75
          }
        },
        {
          title: "Read mask after update",
          tool: "get_layer_details",
          args: { compName: "Codex Manual Mask Comp", layerIndex: 1 }
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
  if (isPlainObject(result.folder) && result.folder.itemIndex !== undefined && result.folder.itemIndex !== null) {
    bindings.set("folderItemIndex", result.folder.itemIndex);
    bindings.set("targetFolderItemIndex", result.folder.itemIndex);
  }
  if ((result.type === "comp" || result.type === "composition") && result.itemIndex !== undefined && result.itemIndex !== null) {
    bindings.set("compItemIndex", result.itemIndex);
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

function hasReadbackBefore(steps, index) {
  return steps.slice(0, index).some((step) => READBACK_TOOLS.has(step.tool));
}

function hasReadbackAfter(steps, index) {
  return steps.slice(index + 1).some((step) => READBACK_TOOLS.has(step.tool));
}

function inspectDakkshinM222Cases(testCase, failures) {
  if (testCase.repairExpectation && testCase.repairExpectation.status === "rejected") {
    const hasCanonicalDelete = testCase.plan.steps.some((step) => step.tool === "delete_layer");
    const unsafeAlias = testCase.plan.steps.some((step) => ["deleteLayer", "delete layer", "remove layer", "removeLayer"].includes(step.tool));
    if (!unsafeAlias || hasCanonicalDelete) {
      addFailure(failures, FAILURE_IDS.unsafeDeleteAliasNotRejected, null, "unsafe delete alias case must remain an unrepaired alias with an explicit rejected expectation.");
    }
    return;
  }

  const safeCompFields = new Set(["compItemIndex", "compName", "width", "height", "pixelAspect", "duration", "frameRate", "bgColor", "displayStartTime"]);
  const maskForbiddenFields = new Set(["delete", "remove", "maskIndices", "roto", "rotobrush", "script", "jsx", "propertyPath"]);
  const steps = testCase.plan.steps || [];
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const args = step.args || {};
    if (step.tool === "delete_layer") {
      if (!hasReadbackBefore(steps, index) || !hasReadbackAfter(steps, index) || !args.layerIndex || !args.expectedLayerName) {
        addFailure(failures, FAILURE_IDS.missingDeleteLayerEvidence, step, "delete_layer requires prior inspection evidence, explicit layerIndex/expectedLayerName, and post-run read-back.");
      }
    }
    if (step.tool === "set_comp_properties") {
      const unsafeFields = Object.keys(args).filter((field) => !safeCompFields.has(field));
      if (unsafeFields.length || !hasReadbackAfter(steps, index)) {
        addFailure(failures, FAILURE_IDS.unsafeCompPropertyMutation, step, `set_comp_properties unsafe fields or missing read-back: ${unsafeFields.join(", ") || "none"}`);
      }
    }
    if (step.tool === "set_layer_mask") {
      const operation = String(args.operation || "").toLowerCase();
      const unsafeFields = Object.keys(args).filter((field) => maskForbiddenFields.has(field));
      if (!["create", "update"].includes(operation) || unsafeFields.length || !args.layerIndex || !hasReadbackAfter(steps, index)) {
        addFailure(failures, FAILURE_IDS.unsafeMaskMutation, step, `set_layer_mask unsafe operation/fields or missing read-back: ${operation || "missing"}`);
      }
    }
  }
}

function classifyCase(testCase) {
  const failures = new Map();
  inspectUnresolvedBindings(testCase, failures);
  inspectExactNameBinding(testCase, failures);
  inspectDuplicateLayersOrder(testCase, failures);
  inspectFinalReadbackSummary(testCase, failures);
  inspectDakkshinM222Cases(testCase, failures);
  const observedCurrentFailures = Array.from(failures.keys()).sort();
  return {
    id: testCase.id,
    classification: observedCurrentFailures.length > 0 ? "expected-current-failure" : "fixed",
    observedCurrentFailures,
    details: Array.from(failures.values())
  };
}

function main() {
  assert.strictEqual(MANUAL_TYPED_TOOL_CORPUS.length, 9, "M222 corpus must cover the five existing manual prompt families plus four Dakkshin typed-tool regressions");

  const seenExpectedFailures = new Set();
  const reports = MANUAL_TYPED_TOOL_CORPUS.map((testCase) => {
    const report = classifyCase(testCase);
    const expected = testCase.expectedCurrentFailures.slice().sort();
    assert.deepStrictEqual(
      report.observedCurrentFailures,
      expected,
      `${testCase.id}: expected current-failure classification must match the current M217 corpus state`
    );
    assert.strictEqual(
      report.classification,
      expected.length > 0 ? "expected-current-failure" : "fixed",
      `${testCase.id}: classification must match the owner milestone flip state`
    );
    for (const failureId of expected) seenExpectedFailures.add(failureId);
    return { testCase, report };
  });

  assert.deepStrictEqual(
    Array.from(seenExpectedFailures).sort(),
    [],
    "M222 corpus must have no expected manual typed-tool failures before live acceptance"
  );

  console.log("manual-typed-tool-regression-smoke: M222 Dakkshin planner and semantic regression cases fixed");
  for (const { testCase, report } of reports) {
    const observed = report.observedCurrentFailures.length ? report.observedCurrentFailures.join(", ") : "fixed";
    console.log(`- ${testCase.id}: ${observed}; flipOwner=${testCase.ownerToFlip}`);
  }
}

main();
