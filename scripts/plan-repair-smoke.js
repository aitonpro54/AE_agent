"use strict";

const assert = require("assert");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const daemonPath = path.join(__dirname, "..", "mcp-server", "bridge-daemon.js");
const nodePath = process.execPath;
const port = String(4750 + Math.floor(Math.random() * 1000));
const token = "plan-repair-smoke-token";
const REQUEST_TIMEOUT_MS = 10000;

function requestJsonWithOptions(options, payload) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: body ? JSON.parse(body) : {} });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`Timed out waiting for ${options.method || "GET"} ${options.path}`));
    });
    if (payload) req.write(JSON.stringify(payload));
    req.end();
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bridgePost(pathname, payload) {
  return requestJsonWithOptions({
    hostname: "127.0.0.1",
    port,
    path: pathname,
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-ae-bridge-token": token
    }
  }, payload);
}

function bridgeGet(pathname) {
  return requestJsonWithOptions({
    hostname: "127.0.0.1",
    port,
    path: pathname,
    method: "GET"
  });
}

async function waitForBridgeHealth(child) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < 7000) {
    if (child.exitCode !== null) break;
    try {
      const response = await bridgeGet("/health");
      if (response.status === 200 && response.body && response.body.ok === true) {
        return response.body;
      }
    } catch (error) {
      lastError = error;
    }
    await wait(100);
  }
  throw new Error(`Bridge did not become healthy for plan repair smoke: ${lastError ? lastError.message : "not ready"}`);
}

async function validatePlan(id, plan, expectations) {
  const response = await bridgePost("/agents/plan/validate", {
    requestId: `plan-repair-${id}`,
    plan
  });
  assert.strictEqual(response.status, 200, `${id}: validate endpoint status`);
  assert.strictEqual(response.body.ok, true, `${id}: validate endpoint ok`);
  assert(response.body.validation, `${id}: validation missing`);
  assert(response.body.planRepair, `${id}: repair metadata missing`);
  if (expectations.applied !== undefined) {
    assert.strictEqual(response.body.planRepair.applied, expectations.applied, `${id}: repair applied`);
  }
  if (expectations.category) {
    assert.strictEqual(response.body.classification.category, expectations.category, `${id}: classification category`);
  }
  if (expectations.validationOk !== undefined) {
    assert.strictEqual(response.body.validation.ok, expectations.validationOk, `${id}: validation ok`);
  }
  if (expectations.toolSequence) {
    assert(response.body.repairedPlan, `${id}: repaired plan missing`);
    assert.deepStrictEqual(response.body.repairedPlan.steps.map((step) => step.tool), expectations.toolSequence, `${id}: repaired tool sequence`);
  }
  if (expectations.actionTypes) {
    const actionTypes = response.body.planRepair.actions.map((action) => action.type);
    for (const type of expectations.actionTypes) {
      assert(actionTypes.includes(type), `${id}: missing repair action type ${type}`);
    }
  }
  return response.body;
}

async function main() {
  const child = spawn(nodePath, [daemonPath], {
    env: {
      ...process.env,
      AE_BRIDGE_PORT: port,
      AE_BRIDGE_TOKEN: token
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const stderr = [];
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => stderr.push(chunk));

  try {
    const health = await waitForBridgeHealth(child);

    const precomposeRepair = await validatePlan("precompose-selected", {
      summary: "Precompose selected layers after inspecting selection.",
      risk: "medium",
      requiresCheckpoint: true,
      steps: [
        { title: "Inspect selected layers", tool: "get_selected_layers", args: {} },
        { title: "Precompose selected layers", tool: "precompose", args: { compIndex: "{{compItemIndex}}", newName: "Codex Repair Precomp", openInViewer: false } }
      ]
    }, {
      applied: true,
      validationOk: true,
      category: "risky",
      toolSequence: ["get_selected_layers", "precompose_layers"],
      actionTypes: ["tool-alias", "arg-alias", "missing-required-binding"]
    });
    assert.strictEqual(precomposeRepair.repairedPlan.steps[1].resultBindings.layerIndices, "{{selectedLayerIndices}}");

    const textRepair = await validatePlan("text-layer-binding", {
      summary: "Create and then update a text layer.",
      risk: "medium",
      requiresCheckpoint: true,
      steps: [
        { title: "Create text", tool: "create_text_layer", args: { text: "Repair Smoke", fontSize: 24 } },
        { title: "Update text", tool: "update_text", args: { content: "Repair Smoke Updated", fontSize: 32, alignment: "center" } }
      ]
    }, {
      applied: true,
      validationOk: true,
      category: "risky",
      toolSequence: ["create_text_layer", "update_text_layer"],
      actionTypes: ["tool-alias", "arg-alias", "missing-required-binding"]
    });
    assert.strictEqual(textRepair.repairedPlan.steps[1].resultBindings.layerIndex, "{{layerIndex}}");
    assert.strictEqual(textRepair.repairedPlan.steps[1].args.justification, "center");

    await validatePlan("camera-layer-alias", {
      summary: "Create a simple generated camera.",
      risk: "medium",
      requiresCheckpoint: true,
      steps: [
        { title: "Add camera", tool: "addCameraLayer", args: { name: "Repair Smoke Camera", pointOfInterest: [320, 180, 0], position: [320, 180, -900], zoom: 600 } }
      ]
    }, {
      applied: true,
      validationOk: true,
      category: "risky",
      toolSequence: ["create_camera_layer"],
      actionTypes: ["tool-alias"]
    });

    const maskRepair = await validatePlan("mask-layer-alias", {
      summary: "Create a bounded generated mask on the first layer.",
      risk: "medium",
      requiresCheckpoint: true,
      steps: [
        { title: "Add mask", tool: "addMask", args: { compName: "Repair Smoke Comp", layerIndex: 1, maskName: "Repair Smoke Mask", points: [[120, 80], [520, 80], [520, 280], [120, 280]], mode: "add" } }
      ]
    }, {
      applied: true,
      validationOk: true,
      category: "risky",
      toolSequence: ["create_layer_mask"],
      actionTypes: ["tool-alias", "arg-alias"]
    });
    assert.strictEqual(maskRepair.repairedPlan.steps[0].args.name, "Repair Smoke Mask");
    assert.deepStrictEqual(maskRepair.repairedPlan.steps[0].args.vertices, [[120, 80], [520, 80], [520, 280], [120, 280]]);
    assert.strictEqual(maskRepair.repairedPlan.steps[0].args.maskMode, "add");

    const duplicateLayerRepair = await validatePlan("duplicate-layer-alias", {
      summary: "Duplicate one explicit generated layer.",
      risk: "medium",
      requiresCheckpoint: true,
      steps: [
        { title: "Copy layer", tool: "copyLayer", args: { compName: "Repair Smoke Comp", layer: 1, layerName: "Repair Smoke Source", newName: "Repair Smoke Copy" } }
      ]
    }, {
      applied: true,
      validationOk: true,
      category: "risky",
      toolSequence: ["duplicate_layer"],
      actionTypes: ["tool-alias", "arg-alias"]
    });
    assert.strictEqual(duplicateLayerRepair.repairedPlan.steps[0].args.layerIndex, 1);
    assert.strictEqual(duplicateLayerRepair.repairedPlan.steps[0].args.sourceName, "Repair Smoke Source");
    assert.strictEqual(duplicateLayerRepair.repairedPlan.steps[0].args.name, "Repair Smoke Copy");

    const duplicateLayersRepair = await validatePlan("duplicate-layers-bulk-alias", {
      summary: "Duplicate two explicit generated layers.",
      risk: "medium",
      requiresCheckpoint: true,
      steps: [
        { title: "Copy layers", tool: "copyLayers", args: { compName: "Repair Smoke Comp", layerIndexes: [1, 2], layerNames: ["Repair Smoke Source A", "Repair Smoke Source B"], suffix: " copy" } }
      ]
    }, {
      applied: true,
      validationOk: true,
      category: "risky",
      toolSequence: ["duplicate_layers"],
      actionTypes: ["tool-alias", "arg-alias"]
    });
    assert.deepStrictEqual(duplicateLayersRepair.repairedPlan.steps[0].args.layerIndices, [1, 2]);
    assert.deepStrictEqual(duplicateLayersRepair.repairedPlan.steps[0].args.sourceNames, ["Repair Smoke Source A", "Repair Smoke Source B"]);
    assert.strictEqual(duplicateLayersRepair.repairedPlan.steps[0].args.nameSuffix, " copy");

    const duplicateLayersStackOrderRepair = await validatePlan("duplicate-layers-stack-order", {
      summary: "Create two generated layers and duplicate both by current layer index.",
      risk: "medium",
      requiresCheckpoint: true,
      steps: [
        { title: "Create source A", tool: "create_solid_layer", args: { compName: "Repair Smoke Comp", name: "Repair Smoke Source A", color: [1, 0, 0], width: 1280, height: 720 } },
        { title: "Create source B", tool: "create_text_layer", args: { compName: "Repair Smoke Comp", name: "Repair Smoke Source B", text: "B" } },
        { title: "Duplicate sources", tool: "duplicate_layers", args: { compName: "Repair Smoke Comp", layerIndices: [1, 2], sourceNames: ["Repair Smoke Source A", "Repair Smoke Source B"], nameSuffix: " copy" } }
      ]
    }, {
      applied: true,
      validationOk: true,
      category: "risky",
      toolSequence: ["create_solid_layer", "create_text_layer", "duplicate_layers"],
      actionTypes: ["layer-stack-order"]
    });
    assert.deepStrictEqual(duplicateLayersStackOrderRepair.repairedPlan.steps[2].args.sourceNames, ["Repair Smoke Source B", "Repair Smoke Source A"]);

    const duplicateLayersAmbiguousOrderRepair = await validatePlan("duplicate-layers-ambiguous-order-readback", {
      summary: "Duplicate two existing generated layers by explicit indexes.",
      risk: "medium",
      requiresCheckpoint: true,
      steps: [
        { title: "Duplicate existing sources", tool: "duplicate_layers", args: { compName: "Repair Smoke Comp", layerIndices: [1, 2], nameSuffix: " copy" } }
      ]
    }, {
      applied: true,
      validationOk: true,
      category: "risky",
      toolSequence: ["get_comp_details", "duplicate_layers"],
      actionTypes: ["layer-stack-readback"]
    });
    assert.strictEqual(duplicateLayersAmbiguousOrderRepair.repairedPlan.steps[0].args.includeLayers, true);
    assert.strictEqual(duplicateLayersAmbiguousOrderRepair.repairedPlan.steps[0].args.compName, "Repair Smoke Comp");

    const selectedDuplicateRepair = await validatePlan("duplicate-selected-layers-with-evidence", {
      summary: "Duplicate the selected generated layers after read-only selection evidence.",
      risk: "medium",
      requiresCheckpoint: true,
      steps: [
        { title: "Inspect selected layers", tool: "getSelectedLayers", args: {} },
        { title: "Duplicate selected layers", tool: "duplicateSelectedLayers", args: { compName: "Repair Smoke Comp", suffix: " copy" } }
      ]
    }, {
      applied: true,
      validationOk: true,
      category: "risky",
      toolSequence: ["get_selected_layers", "duplicate_layers"],
      actionTypes: ["tool-alias", "missing-required-binding"]
    });
    assert.strictEqual(selectedDuplicateRepair.repairedPlan.steps[1].resultBindings.layerIndices, "{{selectedLayerIndices}}");
    assert.strictEqual(selectedDuplicateRepair.repairedPlan.steps[1].args.nameSuffix, " copy");

    const selectedDuplicateWithoutEvidence = await validatePlan("duplicate-selected-layers-no-evidence", {
      summary: "Duplicate selected layers without read-only evidence.",
      risk: "medium",
      requiresCheckpoint: true,
      steps: [
        { title: "Duplicate selected layers", tool: "duplicateSelectedLayers", args: { compName: "Repair Smoke Comp", suffix: " copy" } }
      ]
    }, {
      applied: true,
      validationOk: false,
      toolSequence: ["duplicate_layers"],
      actionTypes: ["tool-alias"]
    });
    assert(!selectedDuplicateWithoutEvidence.repairedPlan.steps[0].args.layerIndices, "selection-only duplicate repair must not invent layerIndices");
    assert(!selectedDuplicateWithoutEvidence.repairedPlan.steps[0].resultBindings, "selection-only duplicate repair must not add bindings without read-only evidence");

    const deleteLayerRepair = await validatePlan("delete-layer-alias-with-evidence", {
      summary: "Delete one explicit generated layer after inspecting the layer stack.",
      risk: "high",
      requiresCheckpoint: true,
      steps: [
        { title: "Inspect generated comp layers", tool: "get_comp_details", args: { compName: "Repair Smoke Comp", includeLayers: true } },
        { title: "Remove explicit layer", tool: "remove layer", args: { compName: "Repair Smoke Comp", layer: 1, layerName: "Repair Smoke Delete Source" } },
        { title: "Read comp after deletion", tool: "get_comp_details", args: { compName: "Repair Smoke Comp", includeLayers: true } }
      ]
    }, {
      applied: true,
      validationOk: true,
      category: "risky",
      toolSequence: ["get_comp_details", "delete_layer", "get_comp_details"],
      actionTypes: ["tool-alias", "arg-alias"]
    });
    assert.strictEqual(deleteLayerRepair.repairedPlan.steps[1].args.layerIndex, 1);
    assert.strictEqual(deleteLayerRepair.repairedPlan.steps[1].args.expectedLayerName, "Repair Smoke Delete Source");

    await validatePlan("delete-layer-alias-no-evidence", {
      summary: "Delete a layer from a naked natural-language alias.",
      risk: "high",
      requiresCheckpoint: true,
      steps: [
        { title: "Remove explicit layer without inspection", tool: "deleteLayer", args: { compName: "Repair Smoke Comp", layer: 1, layerName: "Repair Smoke Delete Source" } }
      ]
    }, {
      applied: false,
      validationOk: false
    });

    await validatePlan("delete-layer-alias-broad-rejected", {
      summary: "Reject broad layer deletion alias.",
      risk: "high",
      requiresCheckpoint: true,
      steps: [
        { title: "Inspect generated comp layers", tool: "get_comp_details", args: { compName: "Repair Smoke Comp", includeLayers: true } },
        { title: "Remove selected layers", tool: "removeLayer", args: { compName: "Repair Smoke Comp", layerIndexes: [1, 2], layerName: "Repair Smoke Delete Source" } }
      ]
    }, {
      applied: false,
      validationOk: false
    });

    const compPropertiesRepair = await validatePlan("set-composition-properties-alias", {
      summary: "Set a narrow generated comp property subset and read it back.",
      risk: "medium",
      requiresCheckpoint: true,
      steps: [
        { title: "Set comp properties", tool: "setCompositionProperties", args: { compositionName: "Repair Smoke Comp", properties: { width: 1920, height: 1080, fps: 30 } } },
        { title: "Read comp properties", tool: "get_comp_details", args: { compName: "Repair Smoke Comp" } }
      ]
    }, {
      applied: true,
      validationOk: true,
      category: "risky",
      toolSequence: ["set_comp_properties", "get_comp_details"],
      actionTypes: ["tool-alias", "arg-alias", "arg-shape"]
    });
    assert.strictEqual(compPropertiesRepair.repairedPlan.steps[0].args.compName, "Repair Smoke Comp");
    assert.strictEqual(compPropertiesRepair.repairedPlan.steps[0].args.width, 1920);
    assert.strictEqual(compPropertiesRepair.repairedPlan.steps[0].args.height, 1080);
    assert.strictEqual(compPropertiesRepair.repairedPlan.steps[0].args.frameRate, 30);
    assert(!Object.prototype.hasOwnProperty.call(compPropertiesRepair.repairedPlan.steps[0].args, "properties"), "safe comp property aliases should be flattened");

    await validatePlan("set-composition-properties-unsafe-rejected", {
      summary: "Reject arbitrary generated comp property mutation alias.",
      risk: "medium",
      requiresCheckpoint: true,
      steps: [
        { title: "Set arbitrary comp property", tool: "setCompositionProperties", args: { compositionName: "Repair Smoke Comp", properties: { shutterAngle: 180 } } }
      ]
    }, {
      applied: false,
      validationOk: false
    });

    const maskSetCreateRepair = await validatePlan("set-layer-mask-create-alias", {
      summary: "Create a bounded mask through Dakkshin alias and read it back.",
      risk: "medium",
      requiresCheckpoint: true,
      steps: [
        { title: "Set layer mask", tool: "setLayerMask", args: { compName: "Repair Smoke Comp", layer: 1, operation: "create", maskName: "Repair Smoke Set Mask", shape: { vertices: [[120, 80], [520, 80], [520, 280], [120, 280]] }, mode: "add" } },
        { title: "Read mask layer", tool: "get_layer_details", args: { compName: "Repair Smoke Comp", layerIndex: 1 } }
      ]
    }, {
      applied: true,
      validationOk: true,
      category: "risky",
      toolSequence: ["set_layer_mask", "get_layer_details"],
      actionTypes: ["tool-alias", "arg-alias", "arg-shape"]
    });
    assert.strictEqual(maskSetCreateRepair.repairedPlan.steps[0].args.layerIndex, 1);
    assert.strictEqual(maskSetCreateRepair.repairedPlan.steps[0].args.name, "Repair Smoke Set Mask");
    assert.deepStrictEqual(maskSetCreateRepair.repairedPlan.steps[0].args.vertices, [[120, 80], [520, 80], [520, 280], [120, 280]]);
    assert.strictEqual(maskSetCreateRepair.repairedPlan.steps[0].args.maskMode, "add");

    const maskSetUpdateRepair = await validatePlan("set-layer-mask-update-alias", {
      summary: "Update one bounded mask through Dakkshin alias and read it back.",
      risk: "medium",
      requiresCheckpoint: true,
      steps: [
        { title: "Set layer mask", tool: "setLayerMask", args: { compName: "Repair Smoke Comp", layer: 1, operation: "update", maskNumber: 1, maskName: "Repair Smoke Set Mask", opacity: 75 } },
        { title: "Read mask layer", tool: "get_layer_details", args: { compName: "Repair Smoke Comp", layerIndex: 1 } }
      ]
    }, {
      applied: true,
      validationOk: true,
      category: "risky",
      toolSequence: ["set_layer_mask", "get_layer_details"],
      actionTypes: ["tool-alias", "arg-alias", "arg-shape"]
    });
    assert.strictEqual(maskSetUpdateRepair.repairedPlan.steps[0].args.maskIndex, 1);
    assert.strictEqual(maskSetUpdateRepair.repairedPlan.steps[0].args.expectedMaskName, "Repair Smoke Set Mask");
    assert(!Object.prototype.hasOwnProperty.call(maskSetUpdateRepair.repairedPlan.steps[0].args, "name"), "update mask alias must not keep a rename field");

    await validatePlan("set-layer-mask-delete-alias-rejected", {
      summary: "Reject mask deletion alias.",
      risk: "medium",
      requiresCheckpoint: true,
      steps: [
        { title: "Delete mask", tool: "setLayerMask", args: { compName: "Repair Smoke Comp", layer: 1, operation: "delete", maskNumber: 1 } }
      ]
    }, {
      applied: false,
      validationOk: false
    });

    const markerRepair = await validatePlan("layer-marker-alias", {
      summary: "Add one explicit marker to the generated layer.",
      risk: "medium",
      requiresCheckpoint: true,
      steps: [
        { title: "Create marker", tool: "createLayerMarker", args: { compName: "Repair Smoke Comp", layer: 1, markerText: "Repair Smoke Marker", markerTime: 1.25, markerDuration: 0.5 } }
      ]
    }, {
      applied: true,
      validationOk: true,
      category: "risky",
      toolSequence: ["add_layer_marker"],
      actionTypes: ["tool-alias", "arg-alias"]
    });
    assert.strictEqual(markerRepair.repairedPlan.steps[0].args.layerIndex, 1);
    assert.strictEqual(markerRepair.repairedPlan.steps[0].args.comment, "Repair Smoke Marker");
    assert.strictEqual(markerRepair.repairedPlan.steps[0].args.time, 1.25);
    assert.strictEqual(markerRepair.repairedPlan.steps[0].args.duration, 0.5);

    const markerUpdateRepair = await validatePlan("layer-marker-update-alias", {
      summary: "Update one explicit marker on the generated layer.",
      risk: "medium",
      requiresCheckpoint: true,
      steps: [
        { title: "Update marker", tool: "editLayerMarker", args: { compName: "Repair Smoke Comp", layer: 1, markerNumber: 1, targetMarkerComment: "Repair Smoke Marker", newMarkerText: "Repair Smoke Marker Updated", newMarkerTime: 1.5, newMarkerDuration: 0.75 } }
      ]
    }, {
      applied: true,
      validationOk: true,
      category: "risky",
      toolSequence: ["update_layer_marker"],
      actionTypes: ["tool-alias", "arg-alias"]
    });
    assert.strictEqual(markerUpdateRepair.repairedPlan.steps[0].args.layerIndex, 1);
    assert.strictEqual(markerUpdateRepair.repairedPlan.steps[0].args.markerIndex, 1);
    assert.strictEqual(markerUpdateRepair.repairedPlan.steps[0].args.targetComment, "Repair Smoke Marker");
    assert.strictEqual(markerUpdateRepair.repairedPlan.steps[0].args.comment, "Repair Smoke Marker Updated");
    assert.strictEqual(markerUpdateRepair.repairedPlan.steps[0].args.time, 1.5);
    assert.strictEqual(markerUpdateRepair.repairedPlan.steps[0].args.duration, 0.75);

    const markerDeleteRepair = await validatePlan("layer-marker-delete-alias", {
      summary: "Delete one explicit marker on the generated layer.",
      risk: "medium",
      requiresCheckpoint: true,
      steps: [
        { title: "Delete marker", tool: "removeLayerMarker", args: { compName: "Repair Smoke Comp", layer: 1, markerNumber: 1, targetMarkerComment: "Repair Smoke Marker Updated" } }
      ]
    }, {
      applied: true,
      validationOk: true,
      category: "risky",
      toolSequence: ["delete_layer_marker"],
      actionTypes: ["tool-alias", "arg-alias"]
    });
    assert.strictEqual(markerDeleteRepair.repairedPlan.steps[0].args.layerIndex, 1);
    assert.strictEqual(markerDeleteRepair.repairedPlan.steps[0].args.markerIndex, 1);
    assert.strictEqual(markerDeleteRepair.repairedPlan.steps[0].args.targetComment, "Repair Smoke Marker Updated");

    const folderTargetRepair = await validatePlan("folder-target-binding-alias", {
      summary: "Move a generated comp into a generated folder.",
      risk: "medium",
      requiresCheckpoint: true,
      steps: [
        { title: "Create folder", tool: "create_project_folder", args: { name: "Repair Smoke Folder" } },
        { title: "Create comp", tool: "create_comp", args: { name: "Repair Smoke Folder Comp", width: 1280, height: 720, duration: 4, frameRate: 24 } },
        { title: "Move comp", tool: "move_project_items_to_folder", args: { itemIndices: "{{itemIndex}}", folderItemIndex: "{{folderItemIndex}}" } }
      ]
    }, {
      applied: true,
      validationOk: true,
      category: "risky",
      toolSequence: ["create_project_folder", "create_comp", "move_project_items_to_folder"],
      actionTypes: ["arg-alias"]
    });
    assert.strictEqual(folderTargetRepair.repairedPlan.steps[2].args.targetFolderItemIndex, "{{folderItemIndex}}");

    const folderMoveSearchBindingRepair = await validatePlan("folder-move-search-binding", {
      summary: "Move explicit generated project search results into a generated folder.",
      risk: "medium",
      requiresCheckpoint: true,
      steps: [
        { title: "Find generated comps", tool: "find_project_items", args: { query: "Repair Smoke Move", type: "comp", limit: 2 } },
        { title: "Create folder", tool: "create_project_folder", args: { name: "Repair Smoke Move Folder" } },
        { title: "Move found comps", tool: "move_project_items_to_folder", args: { targetFolderName: "Repair Smoke Move Folder" } }
      ]
    }, {
      applied: true,
      validationOk: true,
      category: "risky",
      toolSequence: ["find_project_items", "create_project_folder", "move_project_items_to_folder"],
      actionTypes: ["missing-required-binding"]
    });
    assert.strictEqual(folderMoveSearchBindingRepair.repairedPlan.steps[2].resultBindings.itemIndices, "{{steps.1.result}}");

    const markerCompAliasRepair = await validatePlan("marker-comp-binding-alias", {
      summary: "Create a comp, add a layer, and add a marker using a marker comp alias.",
      risk: "medium",
      requiresCheckpoint: true,
      steps: [
        { title: "Create comp", tool: "create_comp", args: { name: "Repair Smoke Marker Comp", width: 1280, height: 720, duration: 4, frameRate: 24 } },
        { title: "Create layer", tool: "create_solid_layer", args: { compItemIndex: "{{itemIndex}}", name: "Repair Smoke Marker Solid", color: [1, 0, 0], width: 1280, height: 720 } },
        { title: "Create marker", tool: "add_layer_marker", args: { markerCompItemIndex: "{{markerCompItemIndex}}", layerIndex: 1, comment: "Repair Smoke Marker", time: 1.25 } }
      ]
    }, {
      applied: true,
      validationOk: true,
      category: "risky",
      toolSequence: ["create_comp", "create_solid_layer", "add_layer_marker"],
      actionTypes: ["arg-alias", "binding-alias"]
    });
    assert.strictEqual(markerCompAliasRepair.repairedPlan.steps[2].args.compItemIndex, "{{compItemIndex}}");

    const exactProjectSearchRepair = await validatePlan("exact-project-search-schema-alias", {
      summary: "Find an exact generated composition by name.",
      risk: "low",
      requiresCheckpoint: false,
      steps: [
        { title: "Find comp", tool: "find_project_items", args: { exactName: "Repair Smoke Exact Comp", itemType: "composition", limit: 1 } }
      ]
    }, {
      applied: true,
      validationOk: true,
      category: "safe typed-tool",
      toolSequence: ["find_project_items"],
      actionTypes: ["arg-alias", "arg-shape", "arg-value-alias"]
    });
    assert.strictEqual(exactProjectSearchRepair.repairedPlan.steps[0].args.query, "Repair Smoke Exact Comp");
    assert.strictEqual(exactProjectSearchRepair.repairedPlan.steps[0].args.exactName, true);
    assert.strictEqual(exactProjectSearchRepair.repairedPlan.steps[0].args.type, "comp");

    const bindingAliasRepair = await validatePlan("binding-alias", {
      summary: "Set selected layers 3D using common aliases.",
      risk: "medium",
      requiresCheckpoint: true,
      steps: [
        { title: "Inspect selected layers", tool: "get_selected_layers", args: {} },
        { title: "Enable 3D", tool: "set_layer_property", args: { layerIndexes: "{{selectedLayerIndexes}}", property: "threeDLayer", newValue: true } }
      ]
    }, {
      applied: true,
      validationOk: true,
      category: "risky",
      toolSequence: ["get_selected_layers", "set_property_value"],
      actionTypes: ["tool-alias", "arg-alias", "binding-alias"]
    });
    assert.strictEqual(bindingAliasRepair.repairedPlan.steps[1].args.layerIndex, "{{selectedLayerIndices}}");

    await validatePlan("ambiguous-missing", {
      summary: "Update an unknown text layer.",
      risk: "low",
      requiresCheckpoint: false,
      steps: [
        { title: "Update text without target", tool: "update_text_layer", args: { text: "Missing target" } }
      ]
    }, {
      applied: false,
      validationOk: false,
      category: "needs clarification"
    });

    await validatePlan("unsupported-tool", {
      summary: "Unsupported local operator request.",
      risk: "low",
      requiresCheckpoint: false,
      steps: [
        { title: "Delete everything", tool: "delete_all_layers", args: {} }
      ]
    }, {
      applied: false,
      validationOk: false,
      category: "unsupported"
    });

    await validatePlan("raw-script-not-repaired", {
      summary: "Try to run a script alias.",
      risk: "high",
      requiresCheckpoint: true,
      steps: [
        { title: "Run script", tool: "execute_script", args: { script: "app.project.close();" } }
      ]
    }, {
      applied: false,
      validationOk: false,
      category: "unsupported"
    });

    await validatePlan("empty-plan-blocked", {
      summary: "Empty pseudo-success must not be runnable.",
      risk: "low",
      requiresCheckpoint: false,
      steps: []
    }, {
      applied: false,
      validationOk: false,
      category: "needs clarification"
    });

    const selectedPrecompDuplicateRepair = await validatePlan("selected-precomp-pseudo-command", {
      summary: "Duplicate the selected pre-composition.",
      risk: "low",
      requiresCheckpoint: true,
      steps: [
        {
          title: "Check active layers",
          tool: "get_active_layers",
          parameters: {}
        },
        {
          type: "conditional",
          condition: "if selected layer source is precomp",
          steps: [
            {
              type: "action",
              action: "execute_command",
              command: "duplicate_layer(layer_index=0, target_comp_name='Duplicated_Precomp_Name')"
            }
          ]
        }
      ]
    }, {
      applied: true,
      validationOk: true,
      category: "risky",
      toolSequence: ["get_active_comp", "deep_duplicate_precomp_sources", "get_comp_details"],
      actionTypes: ["workflow-repair"]
    });
    assert.strictEqual(selectedPrecompDuplicateRepair.repairedPlan.steps[1].args.layerIndex, "{{selectedPrecompLayerIndex}}");
    assert.strictEqual(selectedPrecompDuplicateRepair.repairedPlan.steps[1].args.sourceCompItemIndex, "{{selectedPrecompItemIndex}}");
    assert.strictEqual(selectedPrecompDuplicateRepair.repairedPlan.steps[1].args.unavailableFootagePolicy, "reuse");

    const deepDuplicateParentLayerReadBackRepair = await validatePlan("deep-duplicate-parent-layer-readback", {
      summary: "Duplicate the selected precomp source tree and verify the relinked parent layer.",
      risk: "medium",
      requiresCheckpoint: true,
      steps: [
        { title: "Inspect selected precomp layer", tool: "get_active_comp", args: {} },
        {
          title: "Deep duplicate selected precomp sources",
          tool: "deep_duplicate_precomp_sources",
          args: {
            layerIndex: "{{selectedPrecompLayerIndex}}",
            sourceCompItemIndex: "{{selectedPrecompItemIndex}}",
            nameSuffix: " copy",
            unavailableFootagePolicy: "reuse"
          }
        },
        {
          title: "Read back duplicated source comp",
          tool: "get_comp_details",
          args: {
            compItemIndex: "{{duplicatedRootCompItemIndex}}",
            includeLayers: true
          }
        },
        {
          title: "Verify parent layer after relink",
          tool: "get_layer_details",
          args: {
            compItemIndex: "{{compItemIndex}}",
            layerIndex: "{{selectedPrecompLayerIndex}}"
          }
        }
      ]
    }, {
      applied: true,
      validationOk: true,
      category: "risky",
      toolSequence: ["get_active_comp", "deep_duplicate_precomp_sources", "get_comp_details", "get_layer_details"],
      actionTypes: ["deep-duplicate-parent-layer-readback"]
    });
    assert.strictEqual(deepDuplicateParentLayerReadBackRepair.repairedPlan.steps[3].args.compItemIndex, "steps.2.result.comp.itemIndex");
    assert.strictEqual(deepDuplicateParentLayerReadBackRepair.repairedPlan.steps[3].args.layerIndex, "{{selectedPrecompLayerIndex}}");

    const dryRunResponse = await bridgePost("/agents/plan/run", {
      requestId: "plan-repair-dry-run",
      dryRun: true,
      plan: {
        summary: "Dry-run repaired selected-layer precompose plan.",
        risk: "medium",
        requiresCheckpoint: true,
        steps: [
          { title: "Inspect selected layers", tool: "get_selected_layers", args: {} },
          { title: "Precompose selected layers", tool: "precompose", args: { newName: "Codex Repair Dry Run" } }
        ]
      }
    });
    assert.strictEqual(dryRunResponse.status, 200, "dry-run repaired endpoint status");
    assert.strictEqual(dryRunResponse.body.ok, true, "dry-run repaired ok");
    assert.strictEqual(dryRunResponse.body.run.planRepair.applied, true, "dry-run repair applied");
    assert.strictEqual(dryRunResponse.body.run.validation.classification.category, "risky", "dry-run repaired classification");
    assert(dryRunResponse.body.run.steps.every((step) => step.status === "ready"), "dry-run repaired steps should be ready");

    const emptyRunResponse = await bridgePost("/agents/plan/run", {
      requestId: "plan-repair-empty-run",
      dryRun: false,
      confirm: true,
      plan: {
        summary: "Do not report success for a no-op command plan.",
        risk: "low",
        requiresCheckpoint: false,
        steps: []
      }
    });
    assert.strictEqual(emptyRunResponse.status, 400, "empty run endpoint status");
    assert.strictEqual(emptyRunResponse.body.ok, false, "empty run ok");
    assert.strictEqual(emptyRunResponse.body.run.ok, false, "empty run result ok");
    assert.strictEqual(emptyRunResponse.body.run.validation.ok, false, "empty run validation ok");
    assert.strictEqual(emptyRunResponse.body.run.validation.executableCount, 0, "empty run executable count");

    console.log(JSON.stringify({
      ok: true,
      bridge: {
        version: health.version,
        panelConnected: health.panelConnected
      },
      repairs: {
        precomposeActions: precomposeRepair.planRepair.actions.length,
        textActions: textRepair.planRepair.actions.length,
        maskActions: maskRepair.planRepair.actions.length,
        deleteLayerActions: deleteLayerRepair.planRepair.actions.length,
        compPropertiesActions: compPropertiesRepair.planRepair.actions.length,
        setLayerMaskActions: maskSetCreateRepair.planRepair.actions.length + maskSetUpdateRepair.planRepair.actions.length,
        bindingAliasActions: bindingAliasRepair.planRepair.actions.length,
        selectedPrecompDuplicateActions: selectedPrecompDuplicateRepair.planRepair.actions.length,
        emptyRunStatus: emptyRunResponse.body.run.error,
        dryRunStatus: dryRunResponse.body.run.steps.map((step) => step.status)
      }
    }, null, 2));
  } finally {
    child.kill();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
