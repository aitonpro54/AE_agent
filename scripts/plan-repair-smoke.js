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
        { title: "Update text", tool: "update_text", args: { content: "Repair Smoke Updated", fontSize: 32 } }
      ]
    }, {
      applied: true,
      validationOk: true,
      category: "risky",
      toolSequence: ["create_text_layer", "update_text_layer"],
      actionTypes: ["tool-alias", "arg-alias", "missing-required-binding"]
    });
    assert.strictEqual(textRepair.repairedPlan.steps[1].resultBindings.layerIndex, "{{layerIndex}}");

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
