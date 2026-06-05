"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  REPORT_SCHEMA_VERSION,
  writeAgentRunReport
} = require("./agent-scenario-report");
const {
  agentAssortedCompositionGuidesScenarioPlans,
  agentBackgroundLayerScenarioPlans,
  agentCompositionVersionScenarioPlans,
  agentCompPropertiesScenarioPlans,
  agentCompositionGuideScenarioPlans,
  agentDakkshinTypedToolsScenarioPlans,
  agentEffectPropertyScenarioPlans,
  agentExpressionScenarioPlans,
  agentKeyframeScenarioPlans,
  agentLayerMetadataScenarioPlans,
  agentLayerSelectionScenarioPlans,
  agentLayerSwitchScenarioPlans,
  agentLayerTimingScenarioPlans,
  agentLayerTransformScenarioPlans,
  agentRenameFindReplaceScenarioPlans,
  agentRemainingTailContractsScenarioPlans,
  agentParentOpacityExpressionScenarioPlans,
  agentProjectItemsScenarioPlans,
  agentResetWorkAreaScenarioPlans,
  agentRenderQueueScenarioPlans,
  agentSelectedKeyframeMarkerScenarioPlans,
  agentSelectedPropertyValueScenarioPlans,
  agentStickEffectExpressionScenarioPlans,
  agentTextToKeysScenarioPlans
} = require("./agent-scenario-fixtures");

function fixtureReport() {
  return {
    ok: true,
    page: { title: "AE Agent 2.0.0", url: "devtools://fixture" },
    runPrefix: "Codex QA 1.2 12345678",
    planner: {
      label: "openai-cli-gpt-5.5",
      agent: "openai-cli",
      model: "gpt-5.5",
      providerGroup: "openai",
      authMode: "cli",
      requirePanelPlans: true
    },
    preflight: {
      health: { version: "2.0.0", panelConnected: true, pending: 0, inflight: 0 },
      readiness: {
        status: "ready",
        canChat: true,
        modelAvailable: true,
        modelSource: "remote",
        modelCount: 6
      },
      activeComp: { itemIndex: 7, name: "Fixture", selectedLayerCount: 0 },
      renderQueueTotal: 0
    },
    plannerAcceptance: {
      panelPlanCount: 1,
      fallbackCount: 1,
      scenarioCount: 2
    },
    scenarios: [
      {
        id: "timeline-layer-timing",
        cleanupPrefix: "Codex QA 1.2 12345678 Timeline",
        executionMode: "panel-agent-plan",
        panelPlan: {
          accepted: true,
          validationLine: "Validation: ok, 9 steps, 8 mutating",
          expectedStepCount: 9,
          expectedMutatingCount: 8,
          expectedTools: ["create_test_comp", "find_project_items"],
          checks: { reviewReady: true, validationLine: true }
        },
        dryRun: { transcriptTail: "Dry run: ok" },
        run: {
          transcriptTail: "Run: ok",
          logTail: "protected",
          semanticVerification: {
            schema: "ae-agent-semantic-verification.v1",
            status: "passed",
            ok: true,
            summary: "Fixture semantic verification passed.",
            readBackCount: 1,
            mutationVerificationCount: 2,
            passedChecks: 3,
            failedChecks: 0,
            checks: [
              { id: "fixture", status: "passed", title: "Fixture check", expected: "expected", observed: "observed", evidence: "read-back" }
            ],
            warnings: []
          }
        }
      },
      {
        id: "render-queue-setup",
        cleanupPrefix: "Codex QA 1.2 12345678 Render",
        executionMode: "deterministic-plan-fallback",
        fallbackReason: "Fixture fallback",
        panelPlan: {
          accepted: false,
          validationLine: "Validation: ok, 4 steps, 3 mutating",
          expectedStepCount: 4,
          expectedMutatingCount: 3,
          expectedTools: ["create_test_comp", "get_render_queue_status"],
          checks: { reviewReady: false, validationLine: true }
        },
        dryRun: { ok: true, dryRun: true, statuses: [{ status: "ready" }] },
        run: { ok: true, dryRun: false, safety: { protection: "auto_edit_session" }, statuses: [{ status: "completed" }] }
      }
    ],
    cleanups: [
      {
        id: "timeline-layer-timing",
        cleanupPrefix: "Codex QA 1.2 12345678 Timeline",
        renderQueueRemovedCount: 0,
        removedCount: 3,
        renderQueueTotal: 0
      },
      {
        id: "render-queue-setup",
        cleanupPrefix: "Codex QA 1.2 12345678 Render",
        renderQueueRemovedCount: 1,
        removedCount: 1,
        renderQueueTotal: 0
      }
    ],
    finalCleanup: {
      renderQueueRemovedCount: 0,
      removedCount: 0,
      renderQueueTotal: 0
    }
  };
}

function assertDakkshinGeneratedOnlyFixture() {
  const [scenario] = agentDakkshinTypedToolsScenarioPlans("Codex QA M223 Fixture");
  assert(scenario, "M223 Dakkshin scenario should be registered.");
  assert.strictEqual(scenario.id, "generated-dakkshin-typed-tools-matrix");
  assert.strictEqual(scenario.cleanupPrefix, "Codex QA M223 Fixture Dakkshin Typed Tools");
  assert.deepStrictEqual(scenario.expectedTools, [
    "create_comp",
    "set_comp_properties",
    "create_solid_layer",
    "get_comp_details",
    "delete_layer",
    "set_layer_mask",
    "get_layer_details"
  ]);
  assert.strictEqual(scenario.expectedStepCount, 13);
  assert.strictEqual(scenario.expectedMutatingCount, 7);
  assert.strictEqual(scenario.expectedReadBack.dakkshinTypedTools, true);
  assert.strictEqual(scenario.expectedReadBack.compName.indexOf(scenario.cleanupPrefix), 0);
  assert.strictEqual(scenario.expectedReadBack.layerName.indexOf(scenario.cleanupPrefix), 0);
  assert.strictEqual(scenario.expectedReadBack.deletedLayerName.indexOf(scenario.cleanupPrefix), 0);
  assert.strictEqual(scenario.expectedReadBack.maskName.indexOf(scenario.cleanupPrefix), 0);

  const toolSequence = scenario.plan.steps.map((step) => step.tool);
  assert.deepStrictEqual(toolSequence, [
    "create_comp",
    "set_comp_properties",
    "get_comp_details",
    "create_solid_layer",
    "create_solid_layer",
    "get_comp_details",
    "delete_layer",
    "get_comp_details",
    "set_layer_mask",
    "get_layer_details",
    "set_layer_mask",
    "get_comp_details",
    "get_layer_details"
  ]);
  assert.strictEqual(toolSequence[toolSequence.indexOf("set_comp_properties") + 1], "get_comp_details");
  assert.strictEqual(toolSequence[toolSequence.indexOf("delete_layer") + 1], "get_comp_details");
  const firstMaskMutationIndex = toolSequence.indexOf("set_layer_mask");
  assert.strictEqual(toolSequence[firstMaskMutationIndex + 1], "get_layer_details");
  assert.strictEqual(toolSequence[firstMaskMutationIndex + 2], "set_layer_mask");
  assert(!toolSequence.includes("run_extendscript"), "M223 fixture must not use raw ExtendScript.");
  assert(!toolSequence.includes("cleanup_test_items"), "M223 fixture cleanup is owned by the scenario runner, not the planner fixture.");
  assert(scenario.prompt.indexOf("Return exactly this JSON object") >= 0);
}

function assertResetWorkAreaGeneratedOnlyFixture() {
  const [scenario] = agentResetWorkAreaScenarioPlans("Codex QA AUX026 Fixture");
  assert(scenario, "AUX-026 reset work area scenario should be registered.");
  assert.strictEqual(scenario.id, "generated-reset-work-area");
  assert.strictEqual(scenario.cleanupPrefix, "Codex QA AUX026 Fixture Reset Work Area");
  assert.deepStrictEqual(scenario.expectedTools, [
    "create_test_comp",
    "set_comp_work_area",
    "get_comp_details"
  ]);
  assert.strictEqual(scenario.expectedStepCount, 5);
  assert.strictEqual(scenario.expectedMutatingCount, 3);
  assert.strictEqual(scenario.expectedReadBack.resetWorkArea, true);
  assert.strictEqual(scenario.expectedReadBack.compName.indexOf(scenario.cleanupPrefix), 0);
  assert.deepStrictEqual(scenario.expectedReadBack.shortWorkArea, { start: 1, duration: 2 });
  assert.deepStrictEqual(scenario.expectedReadBack.fullWorkArea, { start: 0, duration: 5 });

  const toolSequence = scenario.plan.steps.map((step) => step.tool);
  assert.deepStrictEqual(toolSequence, [
    "create_test_comp",
    "set_comp_work_area",
    "get_comp_details",
    "set_comp_work_area",
    "get_comp_details"
  ]);
  assert.strictEqual(scenario.plan.steps[1].args.start, 1);
  assert.strictEqual(scenario.plan.steps[3].args.start, 0);
  assert.strictEqual(scenario.plan.steps[3].args.duration, 5);
  assert(!toolSequence.includes("run_extendscript"), "AUX-026 fixture must not use raw ExtendScript.");
  assert(!toolSequence.includes("cleanup_test_items"), "AUX-026 fixture cleanup is owned by the scenario runner.");
  assert(scenario.prompt.indexOf("Return exactly this JSON object") >= 0);
}

function assertRenameFindReplaceGeneratedOnlyFixture() {
  const [scenario] = agentRenameFindReplaceScenarioPlans("Codex QA AUX032 Fixture");
  assert(scenario, "AUX-032 rename findReplace scenario should be registered.");
  assert.strictEqual(scenario.id, "generated-rename-find-replace");
  assert.strictEqual(scenario.cleanupPrefix, "Codex QA AUX032 Fixture Rename Find Replace");
  assert.deepStrictEqual(scenario.expectedTools, [
    "create_comp",
    "create_solid_layer",
    "create_text_layer",
    "get_comp_details",
    "rename_layers"
  ]);
  assert.strictEqual(scenario.expectedStepCount, 6);
  assert.strictEqual(scenario.expectedMutatingCount, 4);
  assert.strictEqual(scenario.expectedReadBack.findReplaceLayerRename, true);
  assert.strictEqual(scenario.expectedReadBack.compName.indexOf(scenario.cleanupPrefix), 0);
  assert.deepStrictEqual(scenario.expectedReadBack.beforeNames, [
    "Codex QA AUX032 Fixture Rename Find Replace Alpha Plate",
    "Codex QA AUX032 Fixture Rename Find Replace Alpha Text"
  ]);
  assert.deepStrictEqual(scenario.expectedReadBack.afterNames, [
    "Codex QA AUX032 Fixture Rename Find Replace Beta Plate",
    "Codex QA AUX032 Fixture Rename Find Replace Beta Text"
  ]);

  const toolSequence = scenario.plan.steps.map((step) => step.tool);
  assert.deepStrictEqual(toolSequence, [
    "create_comp",
    "create_solid_layer",
    "create_text_layer",
    "get_comp_details",
    "rename_layers",
    "get_comp_details"
  ]);
  assert.strictEqual(scenario.plan.steps[4].args.mode, "findReplace");
  assert.strictEqual(scenario.plan.steps[4].args.find, "Alpha");
  assert.strictEqual(scenario.plan.steps[4].args.replace, "Beta");
  assert.strictEqual(scenario.plan.steps[4].args.caseSensitive, true);
  assert(!toolSequence.includes("run_extendscript"), "AUX-032 fixture must not use raw ExtendScript.");
  assert(!toolSequence.includes("cleanup_test_items"), "AUX-032 fixture cleanup is owned by the scenario runner.");
  assert(scenario.prompt.indexOf("Return exactly this JSON object") >= 0);
}

function assertAssortedCompositionGuidesGeneratedOnlyFixture() {
  const [scenario] = agentAssortedCompositionGuidesScenarioPlans("Codex QA AUX039 Fixture");
  assert(scenario, "AUX-039 assorted composition guides scenario should be registered.");
  assert.strictEqual(scenario.id, "generated-assorted-composition-guides");
  assert.strictEqual(scenario.cleanupPrefix, "Codex QA AUX039 Fixture Assorted Guides");
  assert.deepStrictEqual(scenario.expectedTools, [
    "create_comp",
    "create_shape_layer",
    "add_effect",
    "get_comp_details",
    "get_layer_details"
  ]);
  assert.strictEqual(scenario.expectedStepCount, 9);
  assert.strictEqual(scenario.expectedMutatingCount, 7);
  assert.strictEqual(scenario.expectedReadBack.assortedCompositionGuides, true);
  assert.strictEqual(scenario.expectedReadBack.compName.indexOf(scenario.cleanupPrefix), 0);
  assert.strictEqual(scenario.expectedReadBack.layerCountAfter, 5);
  assert.strictEqual(scenario.expectedReadBack.effectMatchName, "ADBE Fill");
  assert.strictEqual(scenario.expectedReadBack.effectLayerName, "Codex QA AUX039 Fixture Assorted Guides Title Safe Frame");
  assert.deepStrictEqual(scenario.expectedReadBack.guideSpecs.map((guide) => guide.key), [
    "edges",
    "centerVertical",
    "centerHorizontal",
    "actionSafe",
    "titleSafe"
  ]);
  assert.deepStrictEqual(scenario.expectedReadBack.guideSpecs.map((guide) => guide.position), [
    [400, 225],
    [400, 225],
    [400, 225],
    [400, 225],
    [400, 225]
  ]);

  const toolSequence = scenario.plan.steps.map((step) => step.tool);
  assert.deepStrictEqual(toolSequence, [
    "create_comp",
    "create_shape_layer",
    "create_shape_layer",
    "create_shape_layer",
    "create_shape_layer",
    "create_shape_layer",
    "add_effect",
    "get_comp_details",
    "get_layer_details"
  ]);
  assert.strictEqual(scenario.plan.steps[6].args.effect, "ADBE Fill");
  assert.strictEqual(scenario.plan.steps[6].resultBindings.layerIndex, "{{steps.6.layer.index}}");
  assert.strictEqual(scenario.plan.steps[8].resultBindings.layerIndex, "{{steps.6.layer.index}}");
  assert(!toolSequence.includes("run_extendscript"), "AUX-039 fixture must not use raw ExtendScript.");
  assert(!toolSequence.includes("cleanup_test_items"), "AUX-039 fixture cleanup is owned by the scenario runner.");
  assert(scenario.prompt.indexOf("Return exactly this JSON object") >= 0);
}

function assertBackgroundLayerGeneratedOnlyFixture() {
  const [scenario] = agentBackgroundLayerScenarioPlans("Codex QA AUX041 Fixture");
  assert(scenario, "AUX-041 background layer scenario should be registered.");
  assert.strictEqual(scenario.id, "generated-background-layer");
  assert.strictEqual(scenario.cleanupPrefix, "Codex QA AUX041 Fixture Background Layer");
  assert.deepStrictEqual(scenario.expectedTools, [
    "create_comp",
    "create_shape_layer",
    "add_effect",
    "get_comp_details",
    "get_layer_details"
  ]);
  assert.strictEqual(scenario.expectedStepCount, 6);
  assert.strictEqual(scenario.expectedMutatingCount, 4);
  assert.strictEqual(scenario.expectedReadBack.generatedBackgroundLayer, true);
  assert.strictEqual(scenario.expectedReadBack.compName.indexOf(scenario.cleanupPrefix), 0);
  assert.strictEqual(scenario.expectedReadBack.layerCountAfter, 2);
  assert.strictEqual(scenario.expectedReadBack.backgroundIndexAfter, 2);
  assert.strictEqual(scenario.expectedReadBack.foregroundIndexAfter, 1);
  assert.deepStrictEqual(scenario.expectedReadBack.backgroundSize, [640, 360]);
  assert.deepStrictEqual(scenario.expectedReadBack.backgroundPosition, [320, 180]);
  assert.strictEqual(scenario.expectedReadBack.effectMatchName, "ADBE Fill");
  assert.strictEqual(scenario.expectedReadBack.effectLayerName, undefined);

  const toolSequence = scenario.plan.steps.map((step) => step.tool);
  assert.deepStrictEqual(toolSequence, [
    "create_comp",
    "create_shape_layer",
    "add_effect",
    "create_shape_layer",
    "get_comp_details",
    "get_layer_details"
  ]);
  assert.strictEqual(scenario.plan.steps[2].args.effect, "ADBE Fill");
  assert.strictEqual(scenario.plan.steps[2].resultBindings.layerIndex, "{{steps.2.layer.index}}");
  assert.strictEqual(scenario.plan.steps[5].args.layerIndex, 2);
  assert(!toolSequence.includes("run_extendscript"), "AUX-041 fixture must not use raw ExtendScript.");
  assert(!toolSequence.includes("cleanup_test_items"), "AUX-041 fixture cleanup is owned by the scenario runner.");
  assert(scenario.prompt.indexOf("Return exactly this JSON object") >= 0);
}

function assertCompositionGuideGeneratedOnlyFixture() {
  const [scenario] = agentCompositionGuideScenarioPlans("Codex QA AUX043 Fixture");
  assert(scenario, "AUX-043 composition guide scenario should be registered.");
  assert.strictEqual(scenario.id, "generated-composition-guide");
  assert.strictEqual(scenario.cleanupPrefix, "Codex QA AUX043 Fixture Composition Guide");
  assert.deepStrictEqual(scenario.expectedTools, [
    "create_comp",
    "create_shape_layer",
    "get_comp_details",
    "get_layer_details"
  ]);
  assert.strictEqual(scenario.expectedStepCount, 4);
  assert.strictEqual(scenario.expectedMutatingCount, 2);
  assert.strictEqual(scenario.expectedReadBack.generatedCompositionGuide, true);
  assert.strictEqual(scenario.expectedReadBack.compName.indexOf(scenario.cleanupPrefix), 0);
  assert.strictEqual(scenario.expectedReadBack.layerCountAfter, 1);
  assert.deepStrictEqual(scenario.expectedReadBack.guideSize, [1260, 720]);
  assert.deepStrictEqual(scenario.expectedReadBack.guidePosition, [640, 360]);
  assert.deepStrictEqual(scenario.expectedReadBack.strokeColor, [1, 0, 1]);
  assert.strictEqual(scenario.expectedReadBack.strokeWidth, 20);

  const toolSequence = scenario.plan.steps.map((step) => step.tool);
  assert.deepStrictEqual(toolSequence, [
    "create_comp",
    "create_shape_layer",
    "get_comp_details",
    "get_layer_details"
  ]);
  assert.strictEqual(scenario.plan.steps[1].args.strokeWidth, 20);
  assert.deepStrictEqual(scenario.plan.steps[1].args.strokeColor, [1, 0, 1]);
  assert.strictEqual(scenario.plan.steps[3].resultBindings.layerIndex, "{{steps.2.layer.index}}");
  assert(!toolSequence.includes("run_extendscript"), "AUX-043 fixture must not use raw ExtendScript.");
  assert(!toolSequence.includes("cleanup_test_items"), "AUX-043 fixture cleanup is owned by the scenario runner.");
  assert(scenario.prompt.indexOf("Return exactly this JSON object") >= 0);
}

function assertResolutionFamilyGeneratedOnlyFixtures() {
  const [timing] = agentLayerTimingScenarioPlans("Codex QA AUX050 Fixture");
  assert.strictEqual(timing.id, "generated-layer-timing");
  assert.strictEqual(timing.expectedReadBack.generatedLayerTiming, true);
  assert.deepStrictEqual(timing.plan.steps.map((step) => step.tool), [
    "create_comp",
    "create_solid_layer",
    "create_solid_layer",
    "set_layer_time_range",
    "stagger_layers",
    "get_comp_details",
    "get_layer_details",
    "get_layer_details"
  ]);
  assert(!timing.plan.steps.some((step) => step.tool === "run_extendscript"));

  const [transform] = agentLayerTransformScenarioPlans("Codex QA AUX050 Fixture");
  assert.strictEqual(transform.id, "generated-layer-transform");
  assert.strictEqual(transform.expectedReadBack.generatedLayerTransform, true);
  assert.deepStrictEqual(transform.plan.steps.map((step) => step.tool), [
    "create_comp",
    "create_shape_layer",
    "fit_layer_to_comp",
    "set_layer_transform",
    "get_layer_details"
  ]);
  assert.strictEqual(transform.plan.steps[3].args.opacity, 64);

  const [projectItems] = agentProjectItemsScenarioPlans("Codex QA AUX050 Fixture");
  assert.strictEqual(projectItems.id, "generated-project-items");
  assert.strictEqual(projectItems.expectedReadBack.generatedProjectItems, true);
  assert(projectItems.plan.steps.some((step) => step.tool === "move_project_items_to_folder"));
  assert(projectItems.plan.steps.some((step) => step.tool === "replace_layer_source"));
  assert(projectItems.plan.steps.some((step) => step.tool === "rename_project_items"));
  assert.strictEqual(projectItems.plan.steps[6].resultBindings.itemIndices, "{{steps.6.renamed.0.itemIndex}}");

  const [compositionVersion] = agentCompositionVersionScenarioPlans("Codex QA AUX097 Fixture");
  assert.strictEqual(compositionVersion.id, "generated-composition-version-token");
  assert.strictEqual(compositionVersion.expectedReadBack.generatedCompositionVersionToken, true);
  assert.deepStrictEqual(compositionVersion.plan.steps.map((step) => step.tool), [
    "create_comp",
    "create_comp",
    "rename_project_items",
    "find_project_items",
    "get_comp_details"
  ]);
  assert.strictEqual(compositionVersion.plan.steps[2].args.mode, "findReplace");
  assert.strictEqual(compositionVersion.plan.steps[2].args.find, "v001");
  assert.strictEqual(compositionVersion.plan.steps[2].args.replace, "v002");

  const [renderQueue] = agentRenderQueueScenarioPlans("Codex QA AUX098 Fixture", 2);
  assert.strictEqual(renderQueue.id, "generated-render-queue-setup");
  assert.strictEqual(renderQueue.expectedReadBack.generatedRenderQueue, true);
  assert.deepStrictEqual(renderQueue.plan.steps.map((step) => step.tool), [
    "create_test_comp",
    "add_comp_to_render_queue",
    "set_render_queue_output",
    "get_render_queue_status"
  ]);
  assert.strictEqual(renderQueue.plan.steps[2].args.renderQueueItemIndex, 3);
  assert.strictEqual(renderQueue.plan.steps[3].args.limit, 6);

  const [effectProperty] = agentEffectPropertyScenarioPlans("Codex QA AUX050 Fixture");
  assert.strictEqual(effectProperty.id, "generated-effect-property");
  assert.strictEqual(effectProperty.expectedReadBack.generatedEffectProperty, true);
  assert.deepStrictEqual(effectProperty.plan.steps.map((step) => step.tool), [
    "create_comp",
    "create_shape_layer",
    "add_effect",
    "get_effect_details",
    "set_effect_property",
    "get_effect_details"
  ]);
  assert.strictEqual(effectProperty.plan.steps[4].args.propertyIndex, 3);

  const [expression] = agentExpressionScenarioPlans("Codex QA AUX061 Fixture");
  assert.strictEqual(expression.id, "generated-expression-set-clear");
  assert.strictEqual(expression.expectedReadBack.generatedExpressionSetClear, true);
  assert.deepStrictEqual(expression.plan.steps.map((step) => step.tool), [
    "create_comp",
    "create_shape_layer",
    "get_selected_properties",
    "set_expression",
    "get_layer_details",
    "clear_expression",
    "get_layer_details"
  ]);
  assert.strictEqual(expression.plan.steps[3].args.propertyPath, "ADBE Transform Group.ADBE Position");

  const [parentOpacity] = agentParentOpacityExpressionScenarioPlans("Codex QA AUX105 Fixture");
  assert.strictEqual(parentOpacity.id, "generated-parent-opacity-expression");
  assert.strictEqual(parentOpacity.expectedReadBack.generatedParentOpacityExpression, true);
  assert.deepStrictEqual(parentOpacity.plan.steps.map((step) => step.tool), [
    "create_comp",
    "create_camera_with_controller",
    "get_layer_details",
    "set_expression",
    "get_layer_details"
  ]);
  assert.strictEqual(parentOpacity.plan.steps[3].args.propertyPath, "ADBE Transform Group.ADBE Opacity");
  assert.strictEqual(parentOpacity.plan.steps[3].resultBindings.layerIndex, "{{steps.2.cameraLayer.index}}");

  const [stickEffect] = agentStickEffectExpressionScenarioPlans("Codex QA AUX106 Fixture");
  assert.strictEqual(stickEffect.id, "generated-stick-effect-expression");
  assert.strictEqual(stickEffect.expectedReadBack.generatedStickEffectExpression, true);
  assert.deepStrictEqual(stickEffect.plan.steps.map((step) => step.tool), [
    "create_comp",
    "create_shape_layer",
    "add_effect",
    "get_effect_details",
    "set_expression",
    "get_layer_details",
    "get_effect_details"
  ]);
  assert.strictEqual(stickEffect.plan.steps[4].args.expression, "toComp(anchorPoint + value);");
  assert.strictEqual(stickEffect.plan.steps[4].args.propertyPath[1].matchName, "ADBE Ramp");
  assert.strictEqual(stickEffect.plan.steps[4].args.propertyPath[2].matchName, "ADBE Ramp-0001");

  const [compProperties] = agentCompPropertiesScenarioPlans("Codex QA AUX061 Fixture");
  assert.strictEqual(compProperties.id, "generated-comp-properties-work-area");
  assert.strictEqual(compProperties.expectedReadBack.generatedCompPropertiesWorkArea, true);
  assert.deepStrictEqual(compProperties.plan.steps.map((step) => step.tool), [
    "create_comp",
    "set_comp_properties",
    "get_comp_details",
    "set_comp_work_area",
    "get_comp_details"
  ]);
  assert.strictEqual(compProperties.plan.steps[1].args.width, 720);
  assert.strictEqual(compProperties.plan.steps[3].args.duration, 3.5);

  const [selectedPropertyValue] = agentSelectedPropertyValueScenarioPlans("Codex QA AUX072 Fixture");
  assert.strictEqual(selectedPropertyValue.id, "generated-selected-property-value");
  assert.strictEqual(selectedPropertyValue.expectedReadBack.generatedSelectedPropertyValue, true);
  assert.deepStrictEqual(selectedPropertyValue.plan.steps.map((step) => step.tool), [
    "create_comp",
    "create_shape_layer",
    "get_selected_properties",
    "set_property_value",
    "get_layer_details"
  ]);
  assert.strictEqual(selectedPropertyValue.plan.steps[3].args.propertyPath, "ADBE Transform Group.ADBE Opacity");
  assert.strictEqual(selectedPropertyValue.plan.steps[3].args.value, 42);

  const [layerSwitches] = agentLayerSwitchScenarioPlans("Codex QA AUX096 Fixture");
  assert.strictEqual(layerSwitches.id, "generated-layer-switches");
  assert.strictEqual(layerSwitches.expectedReadBack.generatedLayerSwitches, true);
  assert.deepStrictEqual(layerSwitches.plan.steps.map((step) => step.tool), [
    "create_comp",
    "create_comp",
    "add_project_item_to_comp",
    "get_layer_details",
    "set_property_value",
    "get_layer_details",
    "set_property_value",
    "get_layer_details"
  ]);
  assert.strictEqual(layerSwitches.plan.steps[4].args.propertyPath, "collapseTransformation");
  assert.strictEqual(layerSwitches.plan.steps[6].args.propertyPath, "motionBlur");

  const [layerMetadata] = agentLayerMetadataScenarioPlans("Codex QA AUX-LM Fixture");
  assert.strictEqual(layerMetadata.id, "generated-layer-metadata");
  assert.strictEqual(layerMetadata.expectedReadBack.generatedLayerMetadata, true);
  assert.deepStrictEqual(layerMetadata.plan.steps.map((step) => step.tool), [
    "create_comp",
    "create_solid_layer",
    "create_text_layer",
    "get_comp_details",
    "set_layer_metadata",
    "get_layer_details",
    "get_layer_details"
  ]);
  assert.deepStrictEqual(layerMetadata.plan.steps[4].args.layerIndices, [1, 2]);
  assert.deepStrictEqual(layerMetadata.plan.steps[4].args.expectedLayerNames, [
    "Codex QA AUX-LM Fixture Layer Metadata Text",
    "Codex QA AUX-LM Fixture Layer Metadata Solid"
  ]);

  const [layerSelection] = agentLayerSelectionScenarioPlans("Codex QA AUX101 Fixture");
  assert.strictEqual(layerSelection.id, "generated-layer-selection-set");
  assert.strictEqual(layerSelection.expectedReadBack.generatedLayerSelection, true);
  assert.deepStrictEqual(layerSelection.plan.steps.map((step) => step.tool), [
    "create_comp",
    "create_solid_layer",
    "create_shape_layer",
    "create_text_layer",
    "get_comp_details",
    "set_layer_selection",
    "get_selected_layers",
    "get_layer_details"
  ]);
  assert.deepStrictEqual(layerSelection.plan.steps[5].args.layerIndices, [1, 2]);
  assert.deepStrictEqual(layerSelection.plan.steps[5].args.expectedLayerNames, [
    "Codex QA AUX101 Fixture Layer Selection Text",
    "Codex QA AUX101 Fixture Layer Selection Shape"
  ]);

  const [keyframes] = agentKeyframeScenarioPlans("Codex QA AUX083 Fixture");
  assert.strictEqual(keyframes.id, "generated-keyframe-ease");
  assert.strictEqual(keyframes.expectedReadBack.generatedKeyframeEase, true);
  assert.deepStrictEqual(keyframes.plan.steps.map((step) => step.tool), [
    "create_comp",
    "create_shape_layer",
    "get_selected_properties",
    "set_property_keyframes",
    "apply_keyframe_ease",
    "get_layer_details"
  ]);
  assert.strictEqual(keyframes.plan.steps[3].args.propertyPath, "ADBE Transform Group.ADBE Opacity");
  assert.strictEqual(keyframes.plan.steps[3].args.keyframes.length, 3);
  assert.deepStrictEqual(keyframes.plan.steps[4].args.keyIndices, [1, 2, 3]);

  const [textToKeys] = agentTextToKeysScenarioPlans("Codex QA AUX-TTK Fixture");
  assert.strictEqual(textToKeys.id, "generated-source-text-keyframes");
  assert.strictEqual(textToKeys.expectedReadBack.generatedSourceTextKeyframes, true);
  assert.deepStrictEqual(textToKeys.plan.steps.map((step) => step.tool), [
    "create_comp",
    "create_text_layer",
    "set_property_keyframes",
    "get_layer_details"
  ]);
  assert.strictEqual(textToKeys.plan.steps[2].args.propertyPath, "ADBE Text Properties.ADBE Text Document");
  assert.deepStrictEqual(textToKeys.plan.steps[2].args.keyframes.map((keyframe) => keyframe.value.text), [
    "A",
    "AE",
    "AE Agent"
  ]);

  const [selectedKeyframeMarker] = agentSelectedKeyframeMarkerScenarioPlans("Codex QA AUX093 Fixture");
  assert.strictEqual(selectedKeyframeMarker.id, "generated-selected-keyframe-layer-marker");
  assert.strictEqual(selectedKeyframeMarker.expectedReadBack.markerReadBack, true);
  assert.deepStrictEqual(selectedKeyframeMarker.plan.steps.map((step) => step.tool), [
    "create_comp",
    "create_shape_layer",
    "set_property_keyframes",
    "get_selected_properties",
    "add_layer_marker",
    "get_layer_details"
  ]);
  assert.strictEqual(selectedKeyframeMarker.plan.steps[4].args.time, 1);
  assert.strictEqual(selectedKeyframeMarker.plan.steps[4].args.comment, "");

  const remainingTails = agentRemainingTailContractsScenarioPlans("Codex QA AUX099 Fixture");
  assert.deepStrictEqual(remainingTails.map((scenario) => scenario.id), [
    "generated-camera-controller-rig",
    "generated-onion-skinning-wide-time",
    "generated-fill-in-keyframes",
    "generated-current-expression-keyframe",
    "generated-spatial-in-tangent",
    "generated-separate-shape-size-dimensions"
  ]);
  assert(remainingTails[0].plan.steps.some((step) => step.tool === "create_camera_with_controller"));
  assert(remainingTails[1].plan.steps.some((step) => step.tool === "toggle_onion_skinning"));
  assert(remainingTails[2].plan.steps.some((step) => step.tool === "fill_in_keyframes"));
  assert(remainingTails[3].plan.steps.some((step) => step.tool === "keyframe_current_value_from_expression"));
  assert(remainingTails[4].plan.steps.some((step) => step.tool === "set_spatial_in_tangent"));
  assert(remainingTails[5].plan.steps.some((step) => step.tool === "separate_shape_size_dimensions"));

  for (const scenario of [timing, transform, projectItems, effectProperty, expression, compProperties, selectedPropertyValue, layerSwitches, layerMetadata, layerSelection, keyframes, textToKeys, selectedKeyframeMarker, ...remainingTails]) {
    assert(scenario.prompt.indexOf("Return exactly this JSON object") >= 0);
    assert(!scenario.plan.steps.some((step) => step.tool === "cleanup_test_items"));
  }
}

function main() {
  assertDakkshinGeneratedOnlyFixture();
  assertResetWorkAreaGeneratedOnlyFixture();
  assertRenameFindReplaceGeneratedOnlyFixture();
  assertAssortedCompositionGuidesGeneratedOnlyFixture();
  assertCompositionGuideGeneratedOnlyFixture();
  assertBackgroundLayerGeneratedOnlyFixture();
  assertResolutionFamilyGeneratedOnlyFixtures();

  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "ae-agent-run-report-"));
  const artifact = writeAgentRunReport(fixtureReport(), {
    outputDir,
    generatedAt: "2026-05-15T00:00:00.000Z",
    source: "agent-scenario-report-smoke"
  });
  const onDisk = JSON.parse(fs.readFileSync(artifact.path, "utf8"));

  assert.deepStrictEqual(onDisk, artifact.report);
  assert.strictEqual(onDisk.schemaVersion, REPORT_SCHEMA_VERSION);
  assert.strictEqual(onDisk.planner.agent, "openai-cli");
  assert.strictEqual(onDisk.planner.model, "gpt-5.5");
  assert.strictEqual(onDisk.planner.providerGroup, "openai");
  assert.strictEqual(onDisk.planner.authMode, "cli");
  assert.strictEqual(onDisk.planSources.panelAgentPlan, 1);
  assert.strictEqual(onDisk.planSources.deterministicPlanFallback, 1);
  assert.strictEqual(onDisk.acceptance.scenarioCount, 2);
  assert.strictEqual(onDisk.acceptance.acceptedCount, 1);
  assert.strictEqual(onDisk.acceptance.rejectedCount, 1);
  assert.strictEqual(onDisk.semanticVerification.reportedCount, 1);
  assert.strictEqual(onDisk.semanticVerification.passedCount, 1);
  assert.strictEqual(onDisk.semanticVerification.needsReviewCount, 0);
  assert.strictEqual(onDisk.scenarios[0].planSource, "panel-agent-plan");
  assert.strictEqual(onDisk.scenarios[0].run.semanticVerification.status, "passed");
  assert.strictEqual(onDisk.scenarios[0].run.semanticVerification.checks.length, 1);
  assert.strictEqual(onDisk.scenarios[1].planSource, "deterministic-plan-fallback");
  assert.strictEqual(onDisk.cleanup.projectItemsRemovedTotal, 4);
  assert.strictEqual(onDisk.cleanup.renderQueueItemsRemovedTotal, 1);
  assert.strictEqual(onDisk.cleanup.final.renderQueueTotal, 0);
  assert.strictEqual(onDisk.finalRenderQueueStatus.baselineTotal, 0);
  assert.strictEqual(onDisk.finalRenderQueueStatus.totalItems, 0);
  assert.strictEqual(onDisk.finalRenderQueueStatus.returnedToBaseline, true);
  assert.strictEqual(JSON.stringify(onDisk).indexOf("transcriptTail"), -1);
  assert.strictEqual(JSON.stringify(onDisk).indexOf("logTail"), -1);

  console.log(JSON.stringify({
    ok: true,
    schemaVersion: onDisk.schemaVersion,
    reportPath: artifact.path,
    scenarioCount: onDisk.acceptance.scenarioCount,
    acceptedCount: onDisk.acceptance.acceptedCount,
    fallbackCount: onDisk.acceptance.fallbackCount,
    finalRenderQueueTotal: onDisk.finalRenderQueueStatus.totalItems
  }, null, 2));
}

main();
