"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { buildSemanticVerification } = require("../mcp-server/semantic-verification");

const repoRoot = path.resolve(__dirname, "..");
const bridgeSource = fs.readFileSync(path.join(repoRoot, "mcp-server", "bridge-daemon.js"), "utf8");
const guidanceSource = fs.readFileSync(path.join(repoRoot, "mcp-server", "planner-tool-guidance.js"), "utf8");

function sectionBetween(source, start, end, fromIndex = 0) {
  const startIndex = source.indexOf(start, fromIndex);
  assert(startIndex >= 0, `Missing source anchor: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert(endIndex >= 0, `Missing source end anchor: ${end}`);
  return source.slice(startIndex, endIndex);
}

function assertTypedContracts() {
  const toolsIndex = bridgeSource.indexOf("const tools = [");
  const layerSchema = sectionBetween(bridgeSource, 'name: "set_layer_metadata"', 'name: "set_layer_parent"', toolsIndex);
  const compSchema = sectionBetween(bridgeSource, 'name: "set_comp_properties"', 'name: "refresh_comp_panel"', toolsIndex);
  const callToolIndex = bridgeSource.indexOf("async function callTool");
  const layerHandler = sectionBetween(bridgeSource, 'if (name === "set_layer_metadata")', 'if (name === "set_layer_blending_mode")', callToolIndex);
  const compHandler = sectionBetween(bridgeSource, 'if (name === "set_comp_properties")', 'if (name === "refresh_comp_panel")', callToolIndex);

  for (const field of ["expectedCompName", "motionBlur", "audioEnabled"]) {
    assert(layerSchema.includes(`${field}: {`), `set_layer_metadata schema must expose ${field}.`);
  }
  for (const field of ["expectedCompName", "motionBlur"]) {
    assert(compSchema.includes(`${field}: {`), `set_comp_properties schema must expose ${field}.`);
  }
  assert(!compSchema.includes("audioEnabled"), "audioEnabled must stay a layer-only switch.");

  assert(layerHandler.includes('typeof args.motionBlur !== "boolean"'), "Layer motionBlur must reject coercible non-booleans.");
  assert(layerHandler.includes('typeof args.audioEnabled !== "boolean"'), "Layer audioEnabled must reject coercible non-booleans.");
  assert(compHandler.includes('typeof args.motionBlur !== "boolean"'), "Composition motionBlur must reject coercible non-booleans.");
  assert(layerHandler.includes("layer.motionBlur = requested.motionBlur"), "Layer handler must write motionBlur directly.");
  assert(layerHandler.includes("layer.audioEnabled = requested.audioEnabled"), "Layer handler must write audioEnabled independently.");
  assert(compHandler.includes("comp.motionBlur = requested.motionBlur"), "Composition handler must write motionBlur directly.");
  assert(layerHandler.includes("Composition name mismatch"), "Layer handler must fail closed on expected composition-name mismatch.");
  assert(compHandler.includes("Composition name mismatch"), "Composition handler must fail closed on expected composition-name mismatch.");

  assert(guidanceSource.includes("composition motionBlur switch"), "Planner guidance must route composition motionBlur to set_comp_properties.");
  assert(guidanceSource.includes("audioEnabled is independent from enabled"), "Planner guidance must keep audio and visibility switches distinct.");
}

function compPlan() {
  return {
    summary: "Enable motion blur on one inspected generated composition.",
    risk: "medium",
    requiresCheckpoint: true,
    steps: [
      {
        index: 1,
        title: "Enable composition motion blur",
        tool: "set_comp_properties",
        args: { compItemIndex: 12, expectedCompName: "CODX_SWITCH_COMP", motionBlur: true }
      },
      {
        index: 2,
        title: "Read composition switches",
        tool: "get_comp_details",
        args: { compItemIndex: 12 }
      }
    ]
  };
}

function compRun(readBackMotionBlur) {
  const after = { itemIndex: 12, name: "CODX_SWITCH_COMP", motionBlur: true, numLayers: 1 };
  return {
    ok: true,
    dryRun: false,
    steps: [
      {
        index: 1,
        tool: "set_comp_properties",
        args: compPlan().steps[0].args,
        ok: true,
        mutatesProject: true,
        status: "completed",
        result: {
          comp: after,
          before: { ...after, motionBlur: false },
          after,
          updates: { motionBlur: true },
          updatedFields: ["motionBlur"],
          postVerification: {
            ok: true,
            fieldMatches: { motionBlur: true },
            compIdentityMatches: true,
            layerCountUnchanged: true
          }
        }
      },
      {
        index: 2,
        tool: "get_comp_details",
        args: compPlan().steps[1].args,
        ok: true,
        mutatesProject: false,
        status: "completed",
        result: { comp: { ...after, motionBlur: readBackMotionBlur } }
      }
    ]
  };
}

function layerPlan() {
  return {
    summary: "Set independent layer visibility, motion blur, and audio switches.",
    risk: "medium",
    requiresCheckpoint: true,
    steps: [
      {
        index: 1,
        title: "Set layer switches",
        tool: "set_layer_metadata",
        args: {
          compItemIndex: 12,
          expectedCompName: "CODX_SWITCH_COMP",
          layerIndices: [1],
          expectedLayerNames: ["CODX_SWITCH_LAYER"],
          enabled: true,
          motionBlur: true,
          audioEnabled: false
        }
      },
      {
        index: 2,
        title: "Read layer switches",
        tool: "get_layer_details",
        args: { compItemIndex: 12, layerIndex: 1 }
      }
    ]
  };
}

function layerRun(readBackAudioEnabled) {
  const args = layerPlan().steps[0].args;
  const after = {
    index: 1,
    id: 1201,
    name: "CODX_SWITCH_LAYER",
    enabled: true,
    motionBlur: true,
    audioEnabled: false
  };
  return {
    ok: true,
    dryRun: false,
    steps: [
      {
        index: 1,
        tool: "set_layer_metadata",
        args,
        ok: true,
        mutatesProject: true,
        status: "completed",
        result: {
          comp: { itemIndex: 12, name: "CODX_SWITCH_COMP" },
          requestedLayerIndices: args.layerIndices,
          expectedLayerNames: args.expectedLayerNames,
          updates: { enabled: true, motionBlur: true, audioEnabled: false },
          updatedFields: ["enabled", "motionBlur", "audioEnabled"],
          changedCount: 1,
          layer: after,
          layers: [after],
          changed: [{
            layerIndex: 1,
            expectedLayerName: "CODX_SWITCH_LAYER",
            before: { ...after, motionBlur: false, audioEnabled: true },
            after,
            fieldMatches: { enabled: true, motionBlur: true, audioEnabled: true }
          }],
          postVerification: { ok: true, requestedCount: 1, changedCount: 1, updatedFields: ["enabled", "motionBlur", "audioEnabled"] }
        }
      },
      {
        index: 2,
        tool: "get_layer_details",
        args: layerPlan().steps[1].args,
        ok: true,
        mutatesProject: false,
        status: "completed",
        result: { layer: { ...after, audioEnabled: readBackAudioEnabled } }
      }
    ]
  };
}

function assertSemanticReadBack() {
  const compPassed = buildSemanticVerification(compPlan(), compRun(true));
  assert.strictEqual(compPassed.status, "passed", `Comp switch read-back should pass: ${compPassed.summary}`);
  assert(compPassed.checks.some((check) => check.id.includes("set_comp_properties:motionBlur") && check.status === "passed"));

  const compMismatch = buildSemanticVerification(compPlan(), compRun(false));
  assert.strictEqual(compMismatch.status, "needs_review", "Comp motionBlur mismatch must fail closed.");

  const layerPassed = buildSemanticVerification(layerPlan(), layerRun(false));
  assert.strictEqual(layerPassed.status, "passed", `Layer switch read-back should pass: ${layerPassed.summary}; checks=${JSON.stringify(layerPassed.checks)}`);
  assert(layerPassed.checks.some((check) => check.id.includes("set_layer_metadata:metadata") && check.status === "passed"));

  const audioMismatch = buildSemanticVerification(layerPlan(), layerRun(true));
  assert.strictEqual(audioMismatch.status, "needs_review", "Layer audioEnabled mismatch must fail closed.");
}

function main() {
  assertTypedContracts();
  assertSemanticReadBack();
  console.log("typed switches smoke passed");
}

main();
