"use strict";

const childProcess = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { writeAgentRunReport } = require("./agent-scenario-report");
const {
  agentAssortedCompositionGuidesScenarioPlans,
  agentBackgroundLayerScenarioPlans,
  agentCompositionRenameFileNameScenarioPlans,
  agentCompositionVersionScenarioPlans,
  agentCompositionMarkerAddScenarioPlans,
  agentCompositionLayerMarkerCopyScenarioPlans,
  agentCompositionMarkerReadScenarioPlans,
  agentCompositionMarkerWorkAreaScenarioPlans,
  agentCompRefreshScenarioPlans,
  agentCompPropertiesScenarioPlans,
  agentCompCurrentTimeScenarioPlans,
  agentCompositionGuideScenarioPlans,
  agentDakkshinTypedToolsScenarioPlans,
  agentDuplicateLayersScenarioPlans,
  agentEffectEnabledScenarioPlans,
  agentEffectPropertyScenarioPlans,
  agentEssentialGraphicsScenarioPlans,
  agentEstimatePathLengthScenarioPlans,
  agentExportPathPointsScenarioPlans,
  agentExpressionScenarioPlans,
  agentFlipPathGeometryScenarioPlans,
  agentParametricAnchorExpressionScenarioPlans,
  agentPuppetPinTypeScenarioPlans,
  agentPuppetOnTransparentScenarioPlans,
  agentKeyframeScenarioPlans,
  agentPathGeometryScenarioPlans,
  agentLayerBlendingModeScenarioPlans,
  agentAdjustmentLayerPlacementScenarioPlans,
  agentLayerConnectionLineScenarioPlans,
  agentLayerEnabledHardSoloScenarioPlans,
  agentLayerMetadataScenarioPlans,
  agentLayerParentBelowScenarioPlans,
  agentLayerParentClosestScenarioPlans,
  agentLayerSelectionScenarioPlans,
  agentLayerSwitchScenarioPlans,
  agentLayerTrackMatteScenarioPlans,
  agentLayerTimingScenarioPlans,
  agentLayerTransformScenarioPlans,
  agentManualTypedToolsScenarioPlans,
  agentMaskSafetyScenarioPlans,
  agentMarkerLifecycleScenarioPlans,
  agentNewToolsScenarioPlans,
  agentParentOpacityExpressionScenarioPlans,
  agentProjectItemMetadataScenarioPlans,
  agentProjectItemsScenarioPlans,
  agentRenameFindReplaceScenarioPlans,
  agentRemainingTailContractsScenarioPlans,
  agentRenderQueueScenarioPlans,
  agentResetWorkAreaScenarioPlans,
  agentSelectedKeyframeMarkerScenarioPlans,
  agentSelectedPropertyValueScenarioPlans,
  agentStickEffectExpressionScenarioPlans,
  agentTextShapesScenarioPlans,
  agentTextToKeysScenarioPlans,
  agentScenarioPlans
} = require("./agent-scenario-fixtures");
const {
  buildAgentQaAuditReport,
  collectAuditPrefixes
} = require("./agent-qa-audit");

const DEFAULT_PORT = Number(process.env.CEP_PANEL_CDP_PORT || 8870);
const EXTENSION_ID = process.env.CEP_PANEL_EXTENSION_ID || "com.codex.aemcpbridge";
const BRIDGE_URL = process.env.CEP_PANEL_BRIDGE_URL || "http://127.0.0.1:3456";
const BRIDGE_TOKEN = process.env.CEP_PANEL_BRIDGE_TOKEN || "codex-ae-local";
const AGENT_ID = process.env.CEP_PANEL_AGENT_ID || "ollama-local";
const MODEL = process.env.CEP_PANEL_MODEL || "gemma4:latest";
const OPENAI_API_AGENT_ID = process.env.CEP_PANEL_OPENAI_API_AGENT_ID || "openai-api";
const OPENAI_API_MODEL = process.env.CEP_PANEL_OPENAI_API_MODEL || "gpt-5.5";
const OPENAI_CLI_AGENT_ID = process.env.CEP_PANEL_OPENAI_CLI_AGENT_ID || "openai-cli";
const OPENAI_CLI_MODEL = process.env.CEP_PANEL_OPENAI_CLI_MODEL || "gpt-5.5";
const OPENAI_CLI_PROMPT = process.env.CEP_PANEL_OPENAI_CLI_PROMPT || "Reply with exactly: AE Agent CLI OK";
const WAIT_MS = Number(process.env.CEP_PANEL_WAIT_MS || 90000);
const OPENAI_CLI_WAIT_MS = Number(process.env.CEP_PANEL_OPENAI_CLI_WAIT_MS || 150000);
const PROMPT = process.env.CEP_PANEL_PROMPT ||
  "\u0421\u043e\u0441\u0442\u0430\u0432\u044c \u0431\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u044b\u0439 \u043f\u043b\u0430\u043d \u0431\u0435\u0437 \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f \u043f\u0440\u043e\u0435\u043a\u0442\u0430: \u043f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c \u0441\u043e\u0441\u0442\u043e\u044f\u043d\u0438\u0435 \u043c\u043e\u0441\u0442\u0430 After Effects.";
const MUTATING_PREFIX = "Codex Test Safe Run";
const AGENT_SCENARIO_PREFIX = process.env.CEP_PANEL_AGENT_SCENARIO_PREFIX || "Codex QA 1.2";
const AGENT_SCENARIO_WAIT_MS = Number(process.env.CEP_PANEL_AGENT_SCENARIO_WAIT_MS || 180000);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const DAEMON_PATH = path.join(PROJECT_ROOT, "mcp-server", "bridge-daemon.js");
const ENSURE_DAEMON_TIMEOUT_MS = Number(process.env.CEP_PANEL_ENSURE_DAEMON_TIMEOUT_MS || 8000);

function defaultAgentScenarioConfig() {
  return {
    label: "configured-agent",
    agentId: AGENT_ID,
    model: MODEL,
    providerGroup: "",
    authMode: "",
    requirePanelPlans: false,
    readinessTimeoutMs: 45000
  };
}

function openAiCliAgentScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS
  };
}

function openAiCliNewToolsScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-new-tools",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_NEW_TOOLS_PREFIX || "Codex QA M190",
    scenarioFactory: agentNewToolsScenarioPlans,
    skipRenderQueueCleanup: true
  };
}

function openAiCliMaskSafetyScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-mask-safety",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_MASK_SAFETY_PREFIX || "Codex QA M191",
    scenarioFactory: agentMaskSafetyScenarioPlans,
    skipRenderQueueCleanup: true
  };
}

function openAiCliMarkerLifecycleScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-marker-lifecycle",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_MARKER_LIFECYCLE_PREFIX || "Codex QA M198",
    scenarioFactory: agentMarkerLifecycleScenarioPlans,
    skipRenderQueueCleanup: true
  };
}

function openAiCliDuplicateLayersScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-duplicate-layers",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_DUPLICATE_LAYERS_PREFIX || "Codex QA M207",
    scenarioFactory: agentDuplicateLayersScenarioPlans,
    skipRenderQueueCleanup: true
  };
}

function openAiCliManualTypedToolsScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-manual-typed-tools",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_MANUAL_TYPED_TOOLS_PREFIX || "Codex QA M219",
    scenarioFactory: agentManualTypedToolsScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true
  };
}

function openAiCliDakkshinTypedToolsScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-dakkshin-typed-tools",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_DAKKSHIN_TYPED_TOOLS_PREFIX || "Codex QA M223",
    scenarioFactory: agentDakkshinTypedToolsScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliResetWorkAreaScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-reset-work-area",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_RESET_WORK_AREA_PREFIX || "Codex QA AUX026",
    scenarioFactory: agentResetWorkAreaScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliRenameFindReplaceScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-rename-find-replace",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_RENAME_FIND_REPLACE_PREFIX || "Codex QA AUX032",
    scenarioFactory: agentRenameFindReplaceScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliAssortedCompositionGuidesScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-assorted-composition-guides",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_ASSORTED_GUIDES_PREFIX || "Codex QA AUX039",
    scenarioFactory: agentAssortedCompositionGuidesScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliCompositionGuideScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-composition-guide",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_COMPOSITION_GUIDE_PREFIX || "Codex QA AUX043",
    scenarioFactory: agentCompositionGuideScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliBackgroundLayerScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-background-layer",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_BACKGROUND_LAYER_PREFIX || "Codex QA AUX041",
    scenarioFactory: agentBackgroundLayerScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliLayerTimingScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-layer-timing",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_LAYER_TIMING_PREFIX || "Codex QA AUX050",
    scenarioFactory: agentLayerTimingScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliLayerTransformScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-layer-transform",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_LAYER_TRANSFORM_PREFIX || "Codex QA AUX050",
    scenarioFactory: agentLayerTransformScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliProjectItemsScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-project-items",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_PROJECT_ITEMS_PREFIX || "Codex QA AUX050",
    scenarioFactory: agentProjectItemsScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliCompositionVersionScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-composition-version",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_COMPOSITION_VERSION_PREFIX || "Codex QA AUX097",
    scenarioFactory: agentCompositionVersionScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliCompositionRenameFileNameScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-composition-rename-file-name",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_COMPOSITION_RENAME_FILE_NAME_PREFIX || "Codex QA AUX-CRFN",
    scenarioFactory: agentCompositionRenameFileNameScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliRenderQueueScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-render-queue",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_RENDER_QUEUE_PREFIX || "Codex QA AUX098",
    scenarioFactory: agentRenderQueueScenarioPlans,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliEffectPropertyScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-effect-property",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_EFFECT_PROPERTY_PREFIX || "Codex QA AUX050",
    scenarioFactory: agentEffectPropertyScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliEffectEnabledScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-effect-enabled",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_EFFECT_ENABLED_PREFIX || "Codex QA EFFECT-ENABLED",
    scenarioFactory: agentEffectEnabledScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliExpressionScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-expression",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_EXPRESSION_PREFIX || "Codex QA AUX061",
    scenarioFactory: agentExpressionScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliProjectItemMetadataScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-project-item-metadata",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_PROJECT_ITEM_METADATA_PREFIX || "Codex QA AUX-PI-META",
    scenarioFactory: agentProjectItemMetadataScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliParametricAnchorExpressionScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-parametric-anchor-expression",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_PARAMETRIC_ANCHOR_PREFIX || "Codex QA AUX-MPAP",
    scenarioFactory: agentParametricAnchorExpressionScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliParentOpacityExpressionScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-parent-opacity-expression",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_PARENT_OPACITY_PREFIX || "Codex QA AUX105",
    scenarioFactory: agentParentOpacityExpressionScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliLayerParentBelowScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-layer-parent-below",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_LAYER_PARENT_BELOW_PREFIX || "Codex QA AUX-LPB",
    scenarioFactory: agentLayerParentBelowScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliLayerParentClosestScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-layer-parent-closest",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_LAYER_PARENT_CLOSEST_PREFIX || "Codex QA AUX-LPC",
    scenarioFactory: agentLayerParentClosestScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliStickEffectExpressionScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-stick-effect-expression",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_STICK_EFFECT_PREFIX || "Codex QA AUX106",
    scenarioFactory: agentStickEffectExpressionScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliEstimatePathLengthScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-estimate-path-length",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_ESTIMATE_PATH_LENGTH_PREFIX || "Codex QA AUX-EPL",
    scenarioFactory: agentEstimatePathLengthScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliPathGeometryScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-path-geometry",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_PATH_GEOMETRY_PREFIX || "Codex QA AUX-PATH",
    scenarioFactory: agentPathGeometryScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliFlipPathGeometryScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-flip-path",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_FLIP_PATH_PREFIX || "Codex QA AUX-FLIP",
    scenarioFactory: agentFlipPathGeometryScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliExportPathPointsScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-export-path-points",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_EXPORT_PATH_POINTS_PREFIX || "Codex QA AUX-EXPORT",
    scenarioFactory: agentExportPathPointsScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliEssentialGraphicsScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-essential-graphics",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_ESSENTIAL_GRAPHICS_PREFIX || "Codex QA AUX-EG",
    scenarioFactory: agentEssentialGraphicsScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliPuppetOnTransparentScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-puppet-on-transparent",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_PUPPET_ON_TRANSPARENT_PREFIX || "Codex QA AUX-PUPPET",
    scenarioFactory: agentPuppetOnTransparentScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliPuppetPinTypeScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-puppet-pin-type",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_PUPPET_PIN_TYPE_PREFIX || "Codex QA AUX-PUPPET-PIN",
    scenarioFactory: agentPuppetPinTypeScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliCompPropertiesScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-comp-properties",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_COMP_PROPERTIES_PREFIX || "Codex QA AUX061",
    scenarioFactory: agentCompPropertiesScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliCompRefreshScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-comp-refresh",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_COMP_REFRESH_PREFIX || "Codex QA AUX-REFRESH",
    scenarioFactory: agentCompRefreshScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliCompCurrentTimeScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-comp-current-time",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_COMP_CURRENT_TIME_PREFIX || "Codex QA AUX-CTI",
    scenarioFactory: agentCompCurrentTimeScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliSelectedPropertyValueScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-selected-property-value",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_SELECTED_PROPERTY_VALUE_PREFIX || "Codex QA AUX072",
    scenarioFactory: agentSelectedPropertyValueScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliLayerSwitchScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-layer-switches",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_LAYER_SWITCH_PREFIX || "Codex QA AUX096",
    scenarioFactory: agentLayerSwitchScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliLayerMetadataScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-layer-metadata",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_LAYER_METADATA_PREFIX || "Codex QA AUX-LM",
    scenarioFactory: agentLayerMetadataScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliLayerEnabledHardSoloScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-layer-enabled-hard-solo",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_LAYER_ENABLED_PREFIX || "Codex QA AUX-LE",
    scenarioFactory: agentLayerEnabledHardSoloScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliLayerDifferenceBlendModeScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-layer-difference-blend-mode",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_LAYER_BLEND_PREFIX || "Codex QA AUX-LB",
    scenarioFactory: agentLayerBlendingModeScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliLayerTrackMatteScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-layer-track-matte",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_LAYER_TRACK_MATTE_PREFIX || "Codex QA AUX-LTM",
    scenarioFactory: agentLayerTrackMatteScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliAdjustmentLayerPlacementScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-adjustment-layer-placement",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_ADJUSTMENT_LAYER_PLACEMENT_PREFIX || "Codex QA AUX109",
    scenarioFactory: agentAdjustmentLayerPlacementScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliLayerConnectionLineScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-layer-connection-line",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_LAYER_CONNECTION_LINE_PREFIX || "Codex QA AUX-LCL",
    scenarioFactory: agentLayerConnectionLineScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliLayerSelectionScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-layer-selection",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_LAYER_SELECTION_PREFIX || "Codex QA AUX101",
    scenarioFactory: agentLayerSelectionScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliKeyframeScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-keyframes",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_KEYFRAMES_PREFIX || "Codex QA AUX083",
    scenarioFactory: agentKeyframeScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliTextShapesScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-text-shapes",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_TEXT_SHAPES_PREFIX || "Codex QA AUX-TTS",
    scenarioFactory: agentTextShapesScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliTextToKeysScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-text-to-keys",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_TEXT_TO_KEYS_PREFIX || "Codex QA AUX-TTK",
    scenarioFactory: agentTextToKeysScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliSelectedKeyframeMarkerScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-selected-keyframe-marker",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_SELECTED_KEYFRAME_MARKER_PREFIX || "Codex QA AUX093",
    scenarioFactory: agentSelectedKeyframeMarkerScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliCompositionMarkerReadScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-composition-marker-read",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_COMPOSITION_MARKER_READ_PREFIX || "Codex QA AUX-CMR",
    scenarioFactory: agentCompositionMarkerReadScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: false,
    disallowProviderFallbacks: true
  };
}

function openAiCliCompositionMarkerWorkAreaScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-composition-marker-work-area",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_COMPOSITION_MARKER_WORK_AREA_PREFIX || "Codex QA AUX-CMWA",
    scenarioFactory: agentCompositionMarkerWorkAreaScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliCompositionLayerMarkerCopyScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-composition-layer-marker-copy",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_COMPOSITION_LAYER_MARKER_COPY_PREFIX || "Codex QA AUX-CMLMC",
    scenarioFactory: agentCompositionLayerMarkerCopyScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliCompositionMarkerAddScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-composition-marker-add",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_COMPOSITION_MARKER_ADD_PREFIX || "Codex QA AUX-CMA",
    scenarioFactory: agentCompositionMarkerAddScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function openAiCliRemainingTailContractsScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5-remaining-tail-contracts",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS,
    runPrefixBase: process.env.CEP_PANEL_AGENT_REMAINING_TAILS_PREFIX || "Codex QA AUX099",
    scenarioFactory: agentRemainingTailContractsScenarioPlans,
    skipRenderQueueCleanup: true,
    requireFinalReadBack: true,
    requireSemanticVerificationPassed: true,
    disallowProviderFallbacks: true
  };
}

function shortDiagnosticText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength || 300) || null;
}

function hasNoActionProposalReadyStatus(state) {
  return state.planRunStatus === "No action proposal ready";
}

function commandCheckReport(check) {
  if (!check) return null;
  return {
    args: Array.isArray(check.args) ? check.args.slice() : [],
    status: typeof check.status === "number" ? check.status : null,
    signal: check.signal || null,
    errorCode: check.errorCode || null,
    output: shortDiagnosticText(check.output, 300)
  };
}

function codexStatusReport(status) {
  if (!status) return null;
  return {
    installed: Boolean(status.installed),
    loggedIn: Boolean(status.loggedIn),
    command: status.command || null,
    version: status.version || null,
    status: status.status || null,
    error: shortDiagnosticText(status.error, 300),
    versionCheck: commandCheckReport(status.versionCheck),
    loginStatusCheck: commandCheckReport(status.loginStatusCheck)
  };
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}

function getJsonWithTimeout(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Timed out after ${timeoutMs}ms: ${url}`));
    });
    req.on("error", reject);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function localBridgeEndpoint() {
  const target = new URL(BRIDGE_URL);
  const hostname = String(target.hostname || "").toLowerCase();
  const local = target.protocol === "http:" && (
    hostname === "127.0.0.1" ||
    hostname === "localhost" ||
    hostname === "::1"
  );
  return {
    host: hostname === "localhost" ? "127.0.0.1" : target.hostname,
    local,
    port: Number(target.port || 80),
    protocol: target.protocol
  };
}

async function readBridgeHealth(timeoutMs) {
  const health = await getJsonWithTimeout(`${BRIDGE_URL.replace(/\/$/, "")}/health`, timeoutMs || 1200);
  if (!health || health.ok !== true) {
    throw new Error(`Bridge health returned not-ok: ${JSON.stringify(health)}`);
  }
  return health;
}

function startLocalBridgeDaemon(endpoint) {
  const child = childProcess.spawn(process.execPath, [DAEMON_PATH], {
    cwd: PROJECT_ROOT,
    detached: true,
    env: {
      ...process.env,
      AE_BRIDGE_HOST: endpoint.host || "127.0.0.1",
      AE_BRIDGE_PORT: String(endpoint.port || 3456),
      AE_BRIDGE_TOKEN: BRIDGE_TOKEN
    },
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
  return child.pid;
}

async function ensureBridgeDaemonRunning(reason) {
  if (process.env.CEP_PANEL_ENSURE_DAEMON === "0") {
    return { ok: true, skipped: true, reason: "disabled_by_env" };
  }

  try {
    const health = await readBridgeHealth(1200);
    return { ok: true, alreadyRunning: true, health, reason };
  } catch (initialError) {
    const endpoint = localBridgeEndpoint();
    if (!endpoint.local) {
      throw new Error(`Bridge daemon is unreachable and ${BRIDGE_URL} is not a local auto-start endpoint: ${initialError.message}`);
    }

    const startedPid = startLocalBridgeDaemon(endpoint);
    const startedAt = Date.now();
    let lastError = initialError;
    while (Date.now() - startedAt < ENSURE_DAEMON_TIMEOUT_MS) {
      await sleep(250);
      try {
        const health = await readBridgeHealth(1200);
        return {
          ok: true,
          alreadyRunning: false,
          health,
          reason,
          startedPid,
          waitedMs: Date.now() - startedAt
        };
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(`Bridge daemon did not become healthy after ${ENSURE_DAEMON_TIMEOUT_MS}ms; startedPid=${startedPid}; lastError=${lastError.message}`);
  }
}

function shouldEnsureDaemonForCommand(command) {
  if (command === "offline-smoke") return false;
  return true;
}

function postBridge(path, payload) {
  return new Promise((resolve, reject) => {
    const target = new URL(path, BRIDGE_URL);
    if (target.protocol !== "http:") {
      reject(new Error(`Unsupported bridge protocol: ${target.protocol}`));
      return;
    }

    const body = JSON.stringify(payload || {});
    const req = http.request({
      hostname: target.hostname,
      port: target.port || 80,
      path: `${target.pathname}${target.search}`,
      method: "POST",
      headers: {
        "x-ae-bridge-token": BRIDGE_TOKEN,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    }, (res) => {
      let responseBody = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        responseBody += chunk;
      });
      res.on("end", () => {
        let parsed = null;
        try {
          parsed = responseBody ? JSON.parse(responseBody) : null;
        } catch (error) {
          reject(error);
          return;
        }
        resolve({ status: res.statusCode, body: parsed });
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function bridgeGetUrl(path, params) {
  const target = new URL(path, BRIDGE_URL);
  if (BRIDGE_TOKEN) target.searchParams.set("token", BRIDGE_TOKEN);
  const entries = params || {};
  for (const key of Object.keys(entries)) {
    if (entries[key] !== undefined && entries[key] !== null) {
      target.searchParams.set(key, String(entries[key]));
    }
  }
  return target.toString();
}

function parseBridgeToolPayload(response, name) {
  if (!response || response.status >= 400 || !response.body || response.body.ok !== true) {
    const error = response && response.body && (response.body.error || (response.body.result && response.body.result.error));
    throw new Error(`${name} failed: ${error || `HTTP ${response ? response.status : "unknown"}`}`);
  }

  const result = response.body.result;
  if (!result) return null;
  if (result.isError) {
    const text = result.content && result.content[0] ? result.content[0].text : "tool returned an error";
    throw new Error(`${name} failed: ${text}`);
  }
  if (result.content && result.content[0] && typeof result.content[0].text === "string") {
    return JSON.parse(result.content[0].text);
  }
  return result;
}

async function callBridgeTool(name, args) {
  const response = await postBridge("/tools/call", {
    name,
    arguments: args || {}
  });
  return parseBridgeToolPayload(response, name);
}

function safeErrorText(error) {
  return error && error.message ? error.message : String(error || "Unknown error");
}

async function safeGetJson(url) {
  try {
    return { ok: true, result: await getJson(url) };
  } catch (error) {
    return { ok: false, error: safeErrorText(error) };
  }
}

async function safeCallBridgeTool(name, args) {
  try {
    return { ok: true, result: await callBridgeTool(name, args) };
  } catch (error) {
    return { ok: false, error: safeErrorText(error) };
  }
}

function boundedNumber(value, fallback, min, max) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

async function connectToPanel() {
  const pages = await getJson(`http://127.0.0.1:${DEFAULT_PORT}/json/list`);
  const page = pages.find((item) => item.url && item.url.indexOf(EXTENSION_ID) >= 0) || pages[0];
  if (!page || !page.webSocketDebuggerUrl) {
    throw new Error(`Could not find AE Agent panel DevTools page on port ${DEFAULT_PORT}.`);
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  };

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  function send(method, params) {
    return new Promise((resolve) => {
      const callId = ++id;
      pending.set(callId, resolve);
      ws.send(JSON.stringify({ id: callId, method, params: params || {} }));
    });
  }

  await send("Runtime.enable");
  return { page, ws, send };
}

async function evaluate(send, expression) {
  const response = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (response.error) throw new Error(response.error.message || JSON.stringify(response.error));
  if (response.result && response.result.exceptionDetails) {
    const details = response.result.exceptionDetails;
    const description = details.exception && details.exception.description ? details.exception.description : "";
    const location = details.lineNumber !== undefined ? ` at ${details.lineNumber}:${details.columnNumber}` : "";
    throw new Error((description || details.text || "Runtime.evaluate failed.") + location);
  }
  return response.result && response.result.result ? response.result.result.value : null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reloadActivePage(send) {
  await send("Page.enable");
  await send("Page.reload", { ignoreCache: true });
  await delay(3000);
}

function stateExpression() {
  return `(() => ({
    title: document.title,
    locationHref: String(window.location.href || ""),
    assetVersion: window.__aeAgentAssetVersion || "",
    scriptSrcs: Array.from(document.scripts || []).map((script) => script.src || ""),
    windowBarExists: !!document.querySelector(".window-bar"),
    windowBarText: document.querySelector(".window-bar") ? document.querySelector(".window-bar").innerText : "",
    appTitleExists: !!document.getElementById("appTitle"),
    appTitle: document.getElementById("appTitle") ? document.getElementById("appTitle").textContent : "",
    appVersionExists: !!document.getElementById("appVersion"),
    appVersion: document.getElementById("appVersion") ? document.getElementById("appVersion").textContent : "",
    status: document.getElementById("status") ? document.getElementById("status").textContent : "",
    badge: document.getElementById("badge") ? document.getElementById("badge").textContent : "",
    bridgeHelp: document.getElementById("bridgeHelp") ? document.getElementById("bridgeHelp").textContent : "",
    bridgeHelpClass: document.getElementById("bridgeHelp") ? document.getElementById("bridgeHelp").className : "",
    connectorStatusButtonText: document.getElementById("connectorStatusButton") ? document.getElementById("connectorStatusButton").textContent : "",
    connectorEmergencyDisabled: document.getElementById("connectorEmergencyDisableButton") ? document.getElementById("connectorEmergencyDisableButton").disabled : null,
    connectorRows: Array.from(document.querySelectorAll("#connectorStatusList .connector-status-row")).map((row) => ({
      key: row.getAttribute("data-connector-status") || "",
      className: row.className || "",
      label: row.querySelector(".connector-status-label") ? row.querySelector(".connector-status-label").textContent : "",
      value: row.querySelector(".connector-status-value") ? row.querySelector(".connector-status-value").textContent : ""
    })),
    activeProviderGroup: (() => {
      const active = document.querySelector("#providerTabs .provider-tab.active");
      return active ? active.getAttribute("data-provider-group") || "" : "";
    })(),
    sidebarCollapsed: document.getElementById("appShell") ? document.getElementById("appShell").className.indexOf("sidebar-collapsed") >= 0 : null,
    collapseButtonText: document.getElementById("collapseSidebarButton") ? document.getElementById("collapseSidebarButton").textContent : "",
    collapseButtonTitle: document.getElementById("collapseSidebarButton") ? document.getElementById("collapseSidebarButton").title : "",
    collapseButtonExpanded: document.getElementById("collapseSidebarButton") ? document.getElementById("collapseSidebarButton").getAttribute("aria-expanded") : null,
    diagnosticsOpen: document.getElementById("appShell") ? document.getElementById("appShell").className.indexOf("diagnostics-open") >= 0 : null,
    diagnosticsDisplay: document.querySelector(".activity-pane") ? window.getComputedStyle(document.querySelector(".activity-pane")).display : "",
    diagnosticsButtonText: document.getElementById("diagnosticsButton") ? document.getElementById("diagnosticsButton").textContent : "",
    diagnosticsButtonTitle: document.getElementById("diagnosticsButton") ? document.getElementById("diagnosticsButton").title : "",
    diagnosticsButtonExpanded: document.getElementById("diagnosticsButton") ? document.getElementById("diagnosticsButton").getAttribute("aria-expanded") : null,
    agentStatus: document.getElementById("agentStatus") ? document.getElementById("agentStatus").textContent : "",
    agentValue: document.getElementById("agentSelect") ? document.getElementById("agentSelect").value : "",
    agentOptions: Array.from(document.querySelectorAll("#agentSelect option")).map((option) => ({ value: option.value, text: option.textContent })),
    agentDetails: document.getElementById("agentDetails") ? document.getElementById("agentDetails").innerText : "",
    selfTestButtonText: document.getElementById("providerSelfTestButton") ? document.getElementById("providerSelfTestButton").textContent : "",
    selfTestButtonDisabled: document.getElementById("providerSelfTestButton") ? document.getElementById("providerSelfTestButton").disabled : null,
    selfTestRows: Array.from(document.querySelectorAll("#providerSelfTestList .self-test-row")).map((row) => ({
      key: row.getAttribute("data-self-test") || "",
      className: row.className || "",
      label: row.querySelector(".self-test-label") ? row.querySelector(".self-test-label").textContent : "",
      state: row.querySelector(".self-test-state") ? row.querySelector(".self-test-state").textContent : "",
      detail: row.querySelector(".self-test-detail") ? row.querySelector(".self-test-detail").textContent : ""
    })),
    providerSelfTestReadinessUrls: (window.__codexProviderSelfTestReadinessUrls || []).slice(),
    model: document.getElementById("agentModel") ? document.getElementById("agentModel").value : "",
    modelOptions: Array.from(document.querySelectorAll("#agentModel option")).map((option) => ({ value: option.value, text: option.textContent })),
    setupTitle: document.getElementById("agentSetupTitle") ? document.getElementById("agentSetupTitle").textContent : "",
    setupText: document.getElementById("agentSetupText") ? document.getElementById("agentSetupText").textContent : "",
    setupActionText: document.getElementById("agentSetupActionButton") ? document.getElementById("agentSetupActionButton").textContent : "",
    setupActionDisabled: document.getElementById("agentSetupActionButton") ? document.getElementById("agentSetupActionButton").disabled : null,
    setupActionVisible: document.getElementById("agentSetupActionButton") ? document.getElementById("agentSetupActionButton").style.display !== "none" : null,
    authModeVisible: document.getElementById("authModeTabs") ? document.getElementById("authModeTabs").style.display !== "none" : null,
    apiKeyVisible: document.getElementById("agentApiKeyRow") ? document.getElementById("agentApiKeyRow").style.display !== "none" : null,
    apiKeyPlaceholder: document.getElementById("agentApiKey") ? document.getElementById("agentApiKey").placeholder : "",
    apiKeyValue: document.getElementById("agentApiKey") ? document.getElementById("agentApiKey").value : "",
    saveKeyDisabled: document.getElementById("saveAgentKeyButton") ? document.getElementById("saveAgentKeyButton").disabled : null,
    saveKeyText: document.getElementById("saveAgentKeyButton") ? document.getElementById("saveAgentKeyButton").textContent : "",
    localServiceVisible: document.getElementById("localServiceCard") ? document.getElementById("localServiceCard").style.display !== "none" : null,
    freeModelsVisible: document.getElementById("freeModelsRow") ? document.getElementById("freeModelsRow").style.display !== "none" : null,
    freeModelsChecked: document.getElementById("freeModelsOnly") ? document.getElementById("freeModelsOnly").checked : null,
    mode: document.getElementById("chatMode") ? document.getElementById("chatMode").value : "",
    chatModeOptions: Array.from(document.querySelectorAll("#chatMode option")).map((option) => ({ value: option.value, text: option.textContent })),
    chatModeButtons: Array.from(document.querySelectorAll("#chatModeTabs button")).map((button) => ({
      value: button.getAttribute("data-chat-mode") || "",
      text: button.textContent,
      active: button.className.indexOf("active") >= 0
    })),
    promptOptimizationChecked: document.getElementById("promptOptimization") ? document.getElementById("promptOptimization").checked : null,
    promptOptimizationLabel: document.querySelector(".prompt-toggle em") ? document.querySelector(".prompt-toggle em").textContent : "",
    workflowPresetValue: document.getElementById("workflowPresetSelect") ? document.getElementById("workflowPresetSelect").value : "",
    workflowPresetOptions: Array.from(document.querySelectorAll("#workflowPresetSelect option")).map((option) => ({ value: option.value, text: option.textContent })),
    workflowInsertDisabled: document.getElementById("applyWorkflowPresetButton") ? document.getElementById("applyWorkflowPresetButton").disabled : null,
    checkDisabled: document.getElementById("checkAgentButton") ? document.getElementById("checkAgentButton").disabled : null,
    promptValue: document.getElementById("chatPrompt") ? document.getElementById("chatPrompt").value : "",
    sendButtonText: document.getElementById("sendChatButton") ? document.getElementById("sendChatButton").textContent : "",
    sendButtonTitle: document.getElementById("sendChatButton") ? document.getElementById("sendChatButton").title : "",
    sendDisabled: document.getElementById("sendChatButton") ? document.getElementById("sendChatButton").disabled : null,
    planRunStatus: document.getElementById("planRunStatus") ? document.getElementById("planRunStatus").textContent : "",
    planRunStatusClass: document.getElementById("planRunStatus") ? document.getElementById("planRunStatus").className : "",
    planRunSemanticVerification: window.__aeAgentLastPlanRunResult && window.__aeAgentLastPlanRunResult.semanticVerification ? window.__aeAgentLastPlanRunResult.semanticVerification : null,
    rawDryRunGate: window.__aeAgentLastAcceptedDryRun || null,
    rawRunGateRequests: window.__codexRawRunGateRequests || [],
    recoverLastPlanText: document.getElementById("recoverLastPlanButton") ? document.getElementById("recoverLastPlanButton").textContent : "",
    recoverLastPlanTitle: document.getElementById("recoverLastPlanButton") ? document.getElementById("recoverLastPlanButton").title : "",
    recoverLastPlanVisible: document.getElementById("recoverLastPlanButton") ? document.getElementById("recoverLastPlanButton").style.display !== "none" : null,
    recoverLastPlanDisabled: document.getElementById("recoverLastPlanButton") ? document.getElementById("recoverLastPlanButton").disabled : null,
    dryRunText: document.getElementById("dryRunPlanButton") ? document.getElementById("dryRunPlanButton").textContent : "",
    dryRunTitle: document.getElementById("dryRunPlanButton") ? document.getElementById("dryRunPlanButton").title : "",
    dryRunVisible: document.getElementById("dryRunPlanButton") ? document.getElementById("dryRunPlanButton").style.display !== "none" : null,
    runText: document.getElementById("runPlanButton") ? document.getElementById("runPlanButton").textContent : "",
    runTitle: document.getElementById("runPlanButton") ? document.getElementById("runPlanButton").title : "",
    runVisible: document.getElementById("runPlanButton") ? document.getElementById("runPlanButton").style.display !== "none" : null,
    prepareDevRequestText: document.getElementById("prepareDevRequestButton") ? document.getElementById("prepareDevRequestButton").textContent : "",
    prepareDevRequestTitle: document.getElementById("prepareDevRequestButton") ? document.getElementById("prepareDevRequestButton").title : "",
    prepareDevRequestVisible: document.getElementById("prepareDevRequestButton") ? document.getElementById("prepareDevRequestButton").style.display !== "none" : null,
    prepareDevRequestDisabled: document.getElementById("prepareDevRequestButton") ? document.getElementById("prepareDevRequestButton").disabled : null,
    dryRunDisabled: document.getElementById("dryRunPlanButton") ? document.getElementById("dryRunPlanButton").disabled : null,
    runDisabled: document.getElementById("runPlanButton") ? document.getElementById("runPlanButton").disabled : null,
    inlinePlanActionCount: document.querySelectorAll(".inline-plan-actions").length,
    inlinePlanActionStatus: document.querySelector(".inline-plan-action-status") ? document.querySelector(".inline-plan-action-status").textContent : "",
    inlineDryRunText: document.querySelector(".inline-dry-run-button") ? document.querySelector(".inline-dry-run-button").textContent : "",
    inlineDryRunDisabled: document.querySelector(".inline-dry-run-button") ? document.querySelector(".inline-dry-run-button").disabled : null,
    inlineRunPlanText: document.querySelector(".inline-run-plan-button") ? document.querySelector(".inline-run-plan-button").textContent : "",
    inlineRunPlanDisabled: document.querySelector(".inline-run-plan-button") ? document.querySelector(".inline-run-plan-button").disabled : null,
    chatHistoryValue: document.getElementById("chatHistorySelect") ? document.getElementById("chatHistorySelect").value : "",
    chatHistoryOptions: Array.from(document.querySelectorAll("#chatHistorySelect option")).map((option) => ({ value: option.value, text: option.textContent })),
    workingExists: !!document.querySelector(".chat-message.chat-working"),
    workingText: document.querySelector(".chat-message.chat-working .typing-indicator") ? document.querySelector(".chat-message.chat-working .typing-indicator").textContent : "",
    workingDots: document.querySelectorAll(".chat-message.chat-working .typing-dots i").length,
    transcript: document.getElementById("chatTranscript") ? document.getElementById("chatTranscript").innerText.slice(0, 16000) : "",
    log: document.getElementById("log") ? document.getElementById("log").innerText.slice(0, 4000) : "",
    hardcoreRequests: window.__codexHardcoreAutopilotRequests || [],
    confirmMessages: window.__codexPanelConfirmMessages || []
  }))()`;
}

async function waitFor(send, label, predicate, timeoutMs) {
  const startedAt = Date.now();
  let state = null;
  while (Date.now() - startedAt < timeoutMs) {
    state = await evaluate(send, stateExpression());
    if (predicate(state)) return state;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const error = new Error(`Timed out waiting for ${label}.`);
  error.state = state;
  throw error;
}

function setupExpression() {
  return `(() => {
    function setValue(el, value) {
      if (!el) return;
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    setValue(document.getElementById("bridgeUrl"), ${JSON.stringify(BRIDGE_URL)});
    setValue(document.getElementById("bridgeToken"), ${JSON.stringify(BRIDGE_TOKEN)});
    localStorage.setItem("codexAeBridgeUrl", ${JSON.stringify(BRIDGE_URL)});
    localStorage.setItem("codexAeBridgeToken", ${JSON.stringify(BRIDGE_TOKEN)});
    localStorage.setItem("codexAeBridgeAutoConnect", "1");
    window.__codexPanelConfirmMessages = [];

    const clearButton = document.getElementById("clearChatButton");
    if (clearButton) clearButton.click();
    const connectButton = document.getElementById("connectButton");
    if (connectButton) connectButton.click();
    return true;
  })()`;
}

function selectAgentExpression(prompt) {
  const promptText = prompt || PROMPT;
  return `(() => {
    function setValue(el, value) {
      if (!el) return;
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    setValue(document.getElementById("agentSelect"), ${JSON.stringify(AGENT_ID)});
    setValue(document.getElementById("agentModel"), ${JSON.stringify(MODEL)});
    setValue(document.getElementById("chatMode"), "plan");
    const planButton = document.querySelector("#chatModeTabs [data-chat-mode='plan']");
    if (planButton) planButton.click();
    setValue(document.getElementById("chatPrompt"), ${JSON.stringify(promptText)});
    return ${stateExpression()};
  })()`;
}

function selectHardcoreAgentExpression(prompt) {
  const promptText = prompt || "Run Agent Hardcore autopilot UI smoke.";
  return `(() => {
    function setValue(el, value) {
      if (!el) return;
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    setValue(document.getElementById("agentSelect"), ${JSON.stringify(AGENT_ID)});
    setValue(document.getElementById("agentModel"), ${JSON.stringify(MODEL)});
    setValue(document.getElementById("chatMode"), "hardcore");
    const hardcoreButton = document.querySelector("#chatModeTabs [data-chat-mode='hardcore']");
    if (hardcoreButton) hardcoreButton.click();
    setValue(document.getElementById("chatPrompt"), ${JSON.stringify(promptText)});
    return ${stateExpression()};
  })()`;
}

function selectAgentScenarioExpression(prompt, config) {
  const scenarioConfig = config || defaultAgentScenarioConfig();
  return `(() => {
    function setValue(el, value) {
      if (!el) return;
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    const clearButton = document.getElementById("clearChatButton");
    if (clearButton) clearButton.click();

    const optimization = document.getElementById("promptOptimization");
    if (optimization) {
      optimization.checked = false;
      optimization.dispatchEvent(new Event("change", { bubbles: true }));
    }
    localStorage.setItem("codexAePromptOptimization", "0");

    const providerGroup = ${JSON.stringify(scenarioConfig.providerGroup || "")};
    const authMode = ${JSON.stringify(scenarioConfig.authMode || "")};
    if (providerGroup) {
      localStorage.setItem("codexAeProviderGroup", providerGroup);
      const providerButton = document.querySelector("#providerTabs [data-provider-group='" + providerGroup + "']");
      if (providerButton) providerButton.click();
    }
    if (authMode) {
      localStorage.setItem("codexAeOpenAiAuthMode", authMode);
      const authButton = document.querySelector("#authModeTabs [data-auth-mode='" + authMode + "']");
      if (authButton) authButton.click();
    }

    localStorage.setItem("codexAeAgentId", ${JSON.stringify(scenarioConfig.agentId)});
    localStorage.setItem("codexAeAgentModel:${scenarioConfig.agentId}", ${JSON.stringify(scenarioConfig.model)});
    localStorage.setItem("codexAeChatMode", "plan");
    setValue(document.getElementById("agentSelect"), ${JSON.stringify(scenarioConfig.agentId)});
    setValue(document.getElementById("agentModel"), ${JSON.stringify(scenarioConfig.model)});
    setValue(document.getElementById("chatMode"), "plan");
    const planButton = document.querySelector("#chatModeTabs [data-chat-mode='plan']");
    if (planButton) planButton.click();
    setValue(document.getElementById("chatPrompt"), ${JSON.stringify(prompt)});
    return ${stateExpression()};
  })()`;
}

function selectOpenAiCliExpression() {
  return `(() => {
    function setValue(el, value) {
      if (!el) return;
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    localStorage.setItem("codexAeProviderGroup", "openai");
    localStorage.setItem("codexAeOpenAiAuthMode", "cli");
    localStorage.setItem("codexAeChatMode", "chat");
    localStorage.setItem("codexAeAgentModel:${OPENAI_CLI_AGENT_ID}", ${JSON.stringify(OPENAI_CLI_MODEL)});

    const providerButton = document.querySelector("#providerTabs [data-provider-group='openai']");
    if (providerButton) providerButton.click();
    const authButton = document.querySelector("#authModeTabs [data-auth-mode='cli']");
    if (authButton) authButton.click();
    const chatButton = document.querySelector("#chatModeTabs [data-chat-mode='chat']");
    if (chatButton) chatButton.click();

    setValue(document.getElementById("agentSelect"), ${JSON.stringify(OPENAI_CLI_AGENT_ID)});
    setValue(document.getElementById("agentModel"), ${JSON.stringify(OPENAI_CLI_MODEL)});
    setValue(document.getElementById("chatMode"), "chat");
    setValue(document.getElementById("chatPrompt"), ${JSON.stringify(OPENAI_CLI_PROMPT)});
    return ${stateExpression()};
  })()`;
}

function selectOpenAiApiExpression() {
  return `(() => {
    function setValue(el, value) {
      if (!el) return;
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    localStorage.setItem("codexAeProviderGroup", "openai");
    localStorage.setItem("codexAeOpenAiAuthMode", "api");
    localStorage.setItem("codexAeAgentModel:${OPENAI_API_AGENT_ID}", ${JSON.stringify(OPENAI_API_MODEL)});

    const providerButton = document.querySelector("#providerTabs [data-provider-group='openai']");
    if (providerButton) providerButton.click();
    const authButton = document.querySelector("#authModeTabs [data-auth-mode='api']");
    if (authButton) authButton.click();

    setValue(document.getElementById("agentSelect"), ${JSON.stringify(OPENAI_API_AGENT_ID)});
    setValue(document.getElementById("agentModel"), ${JSON.stringify(OPENAI_API_MODEL)});
    setValue(document.getElementById("chatMode"), "chat");
    setValue(document.getElementById("chatPrompt"), "OpenAI API setup smoke");
    return ${stateExpression()};
  })()`;
}

function providerStorageExpression() {
  return `(() => ({
    providerGroup: localStorage.getItem("codexAeProviderGroup"),
    authMode: localStorage.getItem("codexAeOpenAiAuthMode"),
    agentId: localStorage.getItem("codexAeAgentId"),
    smokeAgentModel: localStorage.getItem(${JSON.stringify(`codexAeAgentModel:${AGENT_ID}`)})
  }))()`;
}

function writeProviderStorageExpression(values) {
  const storage = values || {};
  return `(() => {
    const values = ${JSON.stringify(storage)};
    function write(key, value) {
      if (value === null || value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
    write("codexAeProviderGroup", values.providerGroup);
    write("codexAeOpenAiAuthMode", values.authMode);
    write("codexAeAgentId", values.agentId);
    write(${JSON.stringify(`codexAeAgentModel:${AGENT_ID}`)}, values.smokeAgentModel);
    return true;
  })()`;
}

function sidebarStorageExpression() {
  return `(() => ({
    collapsed: localStorage.getItem("codexAeSidebarCollapsed")
  }))()`;
}

function writeSidebarStorageExpression(values) {
  const storage = values || {};
  return `(() => {
    const value = ${JSON.stringify(storage.collapsed)};
    if (value === null || value === undefined) localStorage.removeItem("codexAeSidebarCollapsed");
    else localStorage.setItem("codexAeSidebarCollapsed", value);
    return true;
  })()`;
}

function diagnosticsStorageExpression() {
  return `(() => ({
    open: localStorage.getItem("codexAeDiagnosticsOpen")
  }))()`;
}

function writeDiagnosticsStorageExpression(values) {
  const storage = values || {};
  return `(() => {
    const value = ${JSON.stringify(storage.open)};
    if (value === null || value === undefined) localStorage.removeItem("codexAeDiagnosticsOpen");
    else localStorage.setItem("codexAeDiagnosticsOpen", value);
    return true;
  })()`;
}

function selectProviderGroupExpression(group) {
  return `(() => {
    const providerButton = document.querySelector("#providerTabs [data-provider-group='" + ${JSON.stringify(group)} + "']");
    if (!providerButton) return { ok: false, error: "missing provider button" };
    providerButton.click();
    return { ok: true, state: ${stateExpression()} };
  })()`;
}

function clickExpression(id) {
  return `(() => {
    const el = document.getElementById(${JSON.stringify(id)});
    if (!el) return { ok: false, error: "missing" };
    const before = { disabled: !!el.disabled, text: el.textContent };
    if (!el.disabled) el.click();
    return { ok: !before.disabled, before, state: ${stateExpression()} };
  })()`;
}

function selectWorkflowPresetExpression(value) {
  return `(() => {
    const select = document.getElementById("workflowPresetSelect");
    if (!select) return { ok: false, error: "missing workflow preset select" };
    select.value = ${JSON.stringify(value)};
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true, state: ${stateExpression()} };
  })()`;
}

function fillApiKeyExpression(value) {
  return `(() => {
    const el = document.getElementById("agentApiKey");
    if (!el) return { ok: false, error: "missing api key input" };
    el.value = ${JSON.stringify(value)};
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true, state: ${stateExpression()} };
  })()`;
}

function clickSelectorExpression(selector) {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return { ok: false, error: "missing" };
    const before = { disabled: !!el.disabled, text: el.textContent };
    if (!el.disabled) el.click();
    return { ok: !before.disabled, before, state: ${stateExpression()} };
  })()`;
}

function installProviderSelfTestFakeExpression() {
  return `(function () {
    var OriginalXHR = window.__codexOriginalProviderSelfTestXHR || window.XMLHttpRequest;
    window.__codexOriginalProviderSelfTestXHR = OriginalXHR;
    window.__codexProviderSelfTestReadinessUrls = [];
    function queryValue(url, name) {
      var match = new RegExp("[?&]" + name + "=([^&]*)").exec(String(url || ""));
      return match ? decodeURIComponent(match[1].replace(/\\+/g, " ")) : "";
    }
    function check(args, status, output) {
      return { args, status, signal: null, errorCode: null, output };
    }
    function agentForList(id, label, provider, providerGroup, apiKeyEnv, model, models, extra) {
      var agent = {
        id: id,
        label: label,
        provider: provider,
        providerGroup: providerGroup,
        authMode: id === "openai-cli" ? "cli" : providerGroup === "local" ? "local" : "api",
        transport: id === "openai-cli" ? "codex-cli" : providerGroup === "local" ? "ollama-chat" : "openai-chat-completions",
        uiModes: [id === "openai-cli" ? "cli" : providerGroup === "local" ? "local" : "api"],
        apiStyle: provider === "gemini" ? "gemini" : provider === "claude" ? "anthropic" : providerGroup === "local" ? "ollama" : "openai",
        baseUrl: providerGroup === "local" ? "http://127.0.0.1:11434" : "https://example.invalid",
        apiKeyEnv: apiKeyEnv || "",
        model: model,
        models: models,
        modelOptions: models.map(function (item) { return { id: item, name: item }; }),
        configured: false,
        requiresApiKey: Boolean(apiKeyEnv),
        canSaveKey: Boolean(apiKeyEnv),
        setupAction: apiKeyEnv ? "save_api_key" : id === "openai-cli" ? "codex_login" : "detect_ollama",
        reachable: false,
        modelAvailable: false,
        canChat: false,
        status: apiKeyEnv ? "missing_auth" : "not_ready",
        modelSource: "not_checked",
        modelCount: models.length,
        remoteModels: []
      };
      Object.keys(extra || {}).forEach(function (key) { agent[key] = extra[key]; });
      return agent;
    }
    function agentsForList() {
      return [
        agentForList("openai-api", "OpenAI API", "openai", "openai", "OPENAI_API_KEY", "gpt-5.5", ["gpt-5.5"]),
        agentForList("openai-cli", "OpenAI CLI", "openai", "openai", "", "gpt-5.5", ["gpt-5.5"], {
          codexStatus: {
            installed: true,
            loggedIn: false,
            version: "codex-cli smoke",
            status: "not_logged_in",
            error: null,
            versionCheck: check(["--version"], 0, "codex-cli smoke"),
            loginStatusCheck: check(["login", "status"], 1, "Not logged in from CEP smoke")
          }
        }),
        agentForList("gemini-api", "Gemini API", "gemini", "gemini", "GEMINI_API_KEY", "gemini-2.5-flash", ["gemini-2.5-flash"]),
        agentForList("claude-api", "Claude API", "claude", "claude", "ANTHROPIC_API_KEY", "claude-sonnet-4-20250514", ["claude-sonnet-4-20250514"]),
        agentForList("openrouter", "OpenRouter", "openrouter", "openrouter", "OPENROUTER_API_KEY", "openrouter/free", ["openrouter/free", "meta/smoke:free"]),
        agentForList("ollama-local", "Ollama Local", "ollama", "local", "", "gemma4:latest", ["gemma4:latest"], {
          configured: true,
          status: "network_failure"
        })
      ];
    }
    function readinessFor(url) {
      var agentId = queryValue(url, "agentId");
      var model = queryValue(url, "model") || "smoke-model";
      var checkModels = queryValue(url, "checkModels") !== "0";
      if (agentId === "openai-api") {
        return {
          checkedAt: "2026-05-15T00:00:00.000Z",
          model: model,
          configured: false,
          reachable: false,
          modelAvailable: false,
          modelSource: null,
          canChat: false,
          status: "missing_auth",
          error: "Save a valid OPENAI_API_KEY for OpenAI API.",
          providerError: { code: "missing_auth", status: "missing_auth", message: "Save a valid OPENAI_API_KEY for OpenAI API." },
          agent: { id: "openai-api", label: "OpenAI API", apiKeyEnv: "OPENAI_API_KEY", requiresApiKey: true }
        };
      }
      if (agentId === "openai-cli") {
        return {
          checkedAt: "2026-05-15T00:00:00.000Z",
          model: model,
          configured: false,
          reachable: false,
          modelAvailable: false,
          modelSource: null,
          canChat: false,
          status: "missing_auth",
          error: "Run codex login, finish ChatGPT sign-in, then check the model again.",
          providerError: { code: "missing_auth", status: "missing_auth", message: "Run codex login, finish ChatGPT sign-in, then check the model again." },
          agent: {
            id: "openai-cli",
            label: "OpenAI CLI",
            requiresApiKey: false,
            codexStatus: {
              installed: true,
              loggedIn: false,
              version: "codex-cli smoke",
              status: "not_logged_in",
              error: null,
              versionCheck: check(["--version"], 0, "codex-cli smoke"),
              loginStatusCheck: check(["login", "status"], 1, "Not logged in from CEP smoke")
            }
          }
        };
      }
      if (agentId === "gemini-api") {
        return {
          checkedAt: "2026-05-15T00:00:00.000Z",
          model: model,
          configured: false,
          reachable: false,
          modelAvailable: false,
          modelSource: null,
          canChat: false,
          status: "missing_auth",
          error: "Save a valid GEMINI_API_KEY for Gemini.",
          providerError: { code: "missing_auth", status: "missing_auth", message: "Save a valid GEMINI_API_KEY for Gemini." },
          agent: { id: "gemini-api", label: "Gemini", apiKeyEnv: "GEMINI_API_KEY", requiresApiKey: true }
        };
      }
      if (agentId === "claude-api") {
        if (!checkModels) {
          return {
            checkedAt: "2026-05-15T00:00:00.000Z",
            model: model,
            configured: true,
            reachable: null,
            modelAvailable: true,
            modelSource: "not_checked",
            canChat: true,
            status: "ready_unverified",
            error: null,
            agent: { id: "claude-api", label: "Claude", apiKeyEnv: "ANTHROPIC_API_KEY", requiresApiKey: true }
          };
        }
        return {
          checkedAt: "2026-05-15T00:00:00.000Z",
          model: model,
          configured: true,
          reachable: true,
          modelAvailable: false,
          modelSource: "remote_list",
          modelCount: 1,
          remoteModels: [{ id: "claude-other", name: "Claude Other" }],
          canChat: false,
          status: "model_unavailable",
          error: "Model " + model + " was not found in Claude's model list.",
          providerError: { code: "model_unavailable", status: "model_unavailable", message: "Model " + model + " was not found in Claude's model list." },
          agent: { id: "claude-api", label: "Claude", apiKeyEnv: "ANTHROPIC_API_KEY", requiresApiKey: true }
        };
      }
      if (agentId === "openrouter") {
        return {
          checkedAt: "2026-05-15T00:00:00.000Z",
          model: model,
          configured: false,
          reachable: false,
          modelAvailable: false,
          modelSource: null,
          canChat: false,
          status: "missing_auth",
          error: "Save a valid OPENROUTER_API_KEY for OpenRouter.",
          providerError: { code: "missing_auth", status: "missing_auth", message: "Save a valid OPENROUTER_API_KEY for OpenRouter." },
          agent: { id: "openrouter", label: "OpenRouter", apiKeyEnv: "OPENROUTER_API_KEY", requiresApiKey: true }
        };
      }
      if (agentId === "ollama-local") {
        return {
          checkedAt: "2026-05-15T00:00:00.000Z",
          model: model,
          configured: true,
          reachable: false,
          modelAvailable: false,
          modelSource: null,
          modelCount: 0,
          remoteModels: [],
          canChat: false,
          status: "network_failure",
          error: "Ollama is offline for CEP smoke.",
          providerError: { code: "network_failure", status: "network_failure", message: "Ollama is offline for CEP smoke." },
          agent: { id: "ollama-local", label: "Ollama", requiresApiKey: false }
        };
      }
      return null;
    }
    function FakeXHR() {
      this.readyState = 0;
      this.status = 0;
      this.responseText = "";
      this.timeout = 0;
      this._headers = {};
      this.onreadystatechange = null;
      this.onerror = null;
      this.ontimeout = null;
    }
    FakeXHR.prototype.open = function (method, url, isAsync) {
      this._method = method;
      this._url = url;
      this._async = isAsync !== false;
    };
    FakeXHR.prototype.setRequestHeader = function (name, value) {
      this._headers[name] = value;
    };
    FakeXHR.prototype.send = function (body) {
      var self = this;
      var urlText = String(this._url || "");
      var fakeAgents = urlText.indexOf("/agents?") >= 0 || urlText.slice(-7) === "/agents";
      var fakeReadiness = null;
      if (urlText.indexOf("/agents/readiness") >= 0) {
        window.__codexProviderSelfTestReadinessUrls.push(urlText);
        fakeReadiness = readinessFor(this._url);
      }
      if (fakeAgents) {
        setTimeout(function () {
          self.readyState = 4;
          self.status = 200;
          self.responseText = JSON.stringify({ ok: true, defaultAgentId: "openai-cli", agents: agentsForList() });
          if (typeof self.onreadystatechange === "function") self.onreadystatechange();
        }, 25);
        return;
      }
      if (fakeReadiness) {
        setTimeout(function () {
          self.readyState = 4;
          self.status = 200;
          self.responseText = JSON.stringify({ ok: true, readiness: fakeReadiness });
          if (typeof self.onreadystatechange === "function") self.onreadystatechange();
        }, 25);
        return;
      }
      var xhr = new OriginalXHR();
      xhr.timeout = this.timeout;
      xhr.onreadystatechange = function () {
        self.readyState = xhr.readyState;
        self.status = xhr.status;
        self.responseText = xhr.responseText;
        if (typeof self.onreadystatechange === "function") self.onreadystatechange();
      };
      xhr.onerror = function () { if (typeof self.onerror === "function") self.onerror(); };
      xhr.ontimeout = function () { if (typeof self.ontimeout === "function") self.ontimeout(); };
      xhr.open(this._method, this._url, this._async);
      Object.keys(this._headers).forEach(function (name) {
        xhr.setRequestHeader(name, self._headers[name]);
      });
      xhr.send(body);
    };
    window.XMLHttpRequest = FakeXHR;
    window.__codexRestoreProviderSelfTestFake = function () {
      window.XMLHttpRequest = OriginalXHR;
      return true;
    };
    return true;
  })()`;
}

function restoreProviderSelfTestFakeExpression() {
  return `(function () {
    if (typeof window.__codexRestoreProviderSelfTestFake === "function") {
      return window.__codexRestoreProviderSelfTestFake();
    }
    return true;
  })()`;
}

function installConnectorStatusFakeExpression() {
  return `(function () {
    var OriginalXHR = window.XMLHttpRequest;
    var disabled = false;
    function statusBody() {
      return {
        ok: true,
        status: {
          connector: {
            connected: true,
            publicUrlConfigured: true,
            publicUrlOrigin: "https://connector-smoke.example",
            writeActionsEnabled: !disabled,
            emergencyDisabled: disabled,
            exposedToolsSnapshot: [
              { name: "get_connector_status", readOnly: true, bridgeProxy: false },
              { name: "propose_extendscript_candidate", readOnly: false, bridgeProxy: false },
              { name: "run_extendscript_candidate", readOnly: false, bridgeProxy: false },
              { name: "promote_solution_candidate", readOnly: false, bridgeProxy: false },
              { name: "get_active_comp", readOnly: true, bridgeProxy: true }
            ],
            lastToolCall: {
              name: "check_extendscript_candidate",
              ok: true,
              calledAt: "2026-05-15T00:00:00.000Z"
            }
          }
        }
      };
    }
    function FakeXHR() {
      this.readyState = 0;
      this.status = 0;
      this.responseText = "";
      this.timeout = 0;
      this._headers = {};
      this.onreadystatechange = null;
      this.onerror = null;
      this.ontimeout = null;
    }
    FakeXHR.prototype.open = function (method, url, isAsync) {
      this._method = method;
      this._url = url;
      this._async = isAsync !== false;
    };
    FakeXHR.prototype.setRequestHeader = function (name, value) {
      this._headers[name] = value;
    };
    FakeXHR.prototype.send = function (body) {
      var self = this;
      var urlText = String(this._url || "");
      if (urlText.indexOf(":8787/status") >= 0) {
        setTimeout(function () {
          self.readyState = 4;
          self.status = 200;
          self.responseText = JSON.stringify(statusBody());
          if (typeof self.onreadystatechange === "function") self.onreadystatechange();
        }, 25);
        return;
      }
      if (urlText.indexOf(":8787/emergency-disable") >= 0) {
        setTimeout(function () {
          disabled = true;
          self.readyState = 4;
          self.status = 200;
          self.responseText = JSON.stringify(statusBody());
          if (typeof self.onreadystatechange === "function") self.onreadystatechange();
        }, 25);
        return;
      }
      var xhr = new OriginalXHR();
      xhr.timeout = this.timeout;
      xhr.onreadystatechange = function () {
        self.readyState = xhr.readyState;
        self.status = xhr.status;
        self.responseText = xhr.responseText;
        if (typeof self.onreadystatechange === "function") self.onreadystatechange();
      };
      xhr.onerror = function () { if (typeof self.onerror === "function") self.onerror(); };
      xhr.ontimeout = function () { if (typeof self.ontimeout === "function") self.ontimeout(); };
      xhr.open(this._method, this._url, this._async);
      Object.keys(this._headers).forEach(function (name) {
        xhr.setRequestHeader(name, self._headers[name]);
      });
      xhr.send(body);
    };
    window.XMLHttpRequest = FakeXHR;
    window.__codexRestoreConnectorStatusFake = function () {
      window.XMLHttpRequest = OriginalXHR;
      return true;
    };
    return true;
  })()`;
}

function restoreConnectorStatusFakeExpression() {
  return `(function () {
    if (typeof window.__codexRestoreConnectorStatusFake === "function") {
      return window.__codexRestoreConnectorStatusFake();
    }
    return true;
  })()`;
}

function installRawRunGateFakeExpression() {
  return `(function () {
    var OriginalXHR = window.__codexOriginalRawRunGateXHR || window.XMLHttpRequest;
    window.__codexOriginalRawRunGateXHR = OriginalXHR;
    window.__codexRawRunGateRequests = [];
    function respond(xhr, status, body) {
      setTimeout(function () {
        xhr.readyState = 4;
        xhr.status = status;
        xhr.responseText = JSON.stringify(body || {});
        if (typeof xhr.onreadystatechange === "function") xhr.onreadystatechange();
      }, 25);
    }
    function makeStep(payload, status) {
      var step = payload && payload.plan && payload.plan.steps && payload.plan.steps[0] ? payload.plan.steps[0] : {};
      return {
        index: 1,
        title: step.title || "Raw ExtendScript gate smoke",
        tool: step.tool || "run_extendscript",
        status: status,
        targetSummary: step.targetSummary || "active comp / selected layers"
      };
    }
    function runResponse(payload, runId) {
      var dryRun = payload.dryRun === true;
      return {
        ok: true,
        run: {
          id: runId,
          ok: true,
          dryRun: dryRun,
          requestId: payload.requestId || "",
          safety: {
            status: dryRun ? "dry-run" : "protected",
            protection: dryRun ? "dry_run" : "auto_edit_session",
            editSessionFinished: !dryRun,
            rawExtendscriptGate: dryRun
              ? { status: "dry-run-approved", dryRunId: runId }
              : { status: "approved", dryRunId: payload.rawExtendscriptDryRunId || "" }
          },
          steps: [makeStep(payload, dryRun ? "ready" : "completed")]
        }
      };
    }
    function FakeXHR() {
      this.readyState = 0;
      this.status = 0;
      this.responseText = "";
      this.timeout = 0;
      this._headers = {};
      this.onreadystatechange = null;
      this.onerror = null;
      this.ontimeout = null;
    }
    FakeXHR.prototype.open = function (method, url, isAsync) {
      this._method = method;
      this._url = url;
      this._async = isAsync !== false;
    };
    FakeXHR.prototype.setRequestHeader = function (name, value) {
      this._headers[name] = value;
    };
    FakeXHR.prototype.send = function (body) {
      var self = this;
      var urlText = String(this._url || "");
      if (urlText.indexOf("/agents/plan/run") >= 0) {
        var payload = {};
        try {
          payload = body ? JSON.parse(body) : {};
        } catch (_error) {}
        window.__codexRawRunGateRequests.push(payload);
        if (payload.dryRun === true) {
          respond(self, 200, runResponse(payload, "raw-gate-dry-run-smoke"));
          return;
        }
        if (payload.rawExtendscriptDryRunId !== "raw-gate-dry-run-smoke") {
          respond(self, 400, {
            ok: false,
            error: "same current plan dry-run id is required",
            run: {
              id: "raw-gate-blocked-smoke",
              ok: false,
              dryRun: false,
              requestId: payload.requestId || "",
              safety: { status: "blocked_raw_extendscript_gate" },
              steps: []
            }
          });
          return;
        }
        respond(self, 200, runResponse(payload, "raw-gate-run-smoke"));
        return;
      }
      var xhr = new OriginalXHR();
      xhr.timeout = this.timeout;
      xhr.onreadystatechange = function () {
        self.readyState = xhr.readyState;
        self.status = xhr.status;
        self.responseText = xhr.responseText;
        if (typeof self.onreadystatechange === "function") self.onreadystatechange();
      };
      xhr.onerror = function () { if (typeof self.onerror === "function") self.onerror(); };
      xhr.ontimeout = function () { if (typeof self.ontimeout === "function") self.ontimeout(); };
      xhr.open(this._method, this._url, this._async);
      Object.keys(this._headers).forEach(function (name) {
        xhr.setRequestHeader(name, self._headers[name]);
      });
      xhr.send(body);
    };
    window.XMLHttpRequest = FakeXHR;
    window.__codexRestoreRawRunGateFake = function () {
      window.XMLHttpRequest = OriginalXHR;
      return true;
    };
    return true;
  })()`;
}

function restoreRawRunGateFakeExpression() {
  return `(function () {
    if (typeof window.__codexRestoreRawRunGateFake === "function") {
      return window.__codexRestoreRawRunGateFake();
    }
    return true;
  })()`;
}

function installHardcoreAutopilotFakeExpression() {
  return `(function () {
    var OriginalXHR = window.__codexOriginalHardcoreAutopilotXHR || window.XMLHttpRequest;
    window.__codexOriginalHardcoreAutopilotXHR = OriginalXHR;
    window.__codexHardcoreAutopilotRequests = [];
    function respond(xhr, status, body) {
      setTimeout(function () {
        xhr.readyState = 4;
        xhr.status = status;
        xhr.responseText = JSON.stringify(body || {});
        if (typeof xhr.onreadystatechange === "function") xhr.onreadystatechange();
      }, 50);
    }
    function FakeXHR() {
      this.readyState = 0;
      this.status = 0;
      this.responseText = "";
      this.timeout = 0;
      this._headers = {};
      this.onreadystatechange = null;
      this.onerror = null;
      this.ontimeout = null;
    }
    FakeXHR.prototype.open = function (method, url, isAsync) {
      this._method = method;
      this._url = url;
      this._async = isAsync !== false;
    };
    FakeXHR.prototype.setRequestHeader = function (name, value) {
      this._headers[name] = value;
    };
    FakeXHR.prototype.send = function (body) {
      var self = this;
      var urlText = String(this._url || "");
      if (urlText.indexOf("/agents/hardcore/run") >= 0) {
        var payload = {};
        try {
          payload = body ? JSON.parse(body) : {};
        } catch (_error) {}
        window.__codexHardcoreAutopilotRequests.push(payload);
        respond(self, 200, {
          ok: true,
          session: {
            ok: true,
            status: "verified",
            sessionId: "hardcore-ui-smoke",
            maxAttempts: payload.maxAttempts || 3,
            projectOwner: payload.projectOwner === true,
            reasoningEffort: payload.reasoning_effort || null,
            rawFallbackUsed: true,
            typedToolFailures: [
              {
                tool: "get_project_checkpoint_details",
                reason: "The typed tool failed during the owner session and needs a targeted bridge fix.",
                bundle: {
                  startPromptFile: "logs/dev-requests/hardcore-ui-smoke/start-prompt.md",
                  startPrompt: "Continue development from this targeted typed-tool failure. Do not assume a Codex App chat was created automatically."
                }
              }
            ],
            attempts: [
              {
                index: 1,
                status: "verified",
                planResult: {
                  planValidation: { ok: true, mutatingCount: 1 }
                }
              }
            ],
            finalPlanResult: {
              plan: { summary: "Hardcore UI smoke autopilot plan" }
            },
            finalRun: {
              ok: true,
              dryRun: false,
              semanticVerification: {
                status: "passed",
                summary: "Hardcore UI smoke semantic verification passed."
              },
              checkpoint: {
                checkpointFile: "logs/hardcore-ui-smoke-checkpoint.aep"
              }
            },
            artifacts: {
              sessionArtifact: { sessionFile: "logs/hardcore-sessions/hardcore-ui-smoke/session.json" }
            }
          }
        });
        return;
      }
      var xhr = new OriginalXHR();
      xhr.timeout = this.timeout;
      xhr.onreadystatechange = function () {
        self.readyState = xhr.readyState;
        self.status = xhr.status;
        self.responseText = xhr.responseText;
        if (typeof self.onreadystatechange === "function") self.onreadystatechange();
      };
      xhr.onerror = function () { if (typeof self.onerror === "function") self.onerror(); };
      xhr.ontimeout = function () { if (typeof self.ontimeout === "function") self.ontimeout(); };
      xhr.open(this._method, this._url, this._async);
      Object.keys(this._headers).forEach(function (name) {
        xhr.setRequestHeader(name, self._headers[name]);
      });
      xhr.send(body);
    };
    window.XMLHttpRequest = FakeXHR;
    window.__codexRestoreHardcoreAutopilotFake = function () {
      window.XMLHttpRequest = OriginalXHR;
      return true;
    };
    return true;
  })()`;
}

function restoreHardcoreAutopilotFakeExpression() {
  return `(function () {
    if (typeof window.__codexRestoreHardcoreAutopilotFake === "function") {
      return window.__codexRestoreHardcoreAutopilotFake();
    }
    return true;
  })()`;
}

function installConfirmExpression() {
  return `(() => {
    window.__codexPanelConfirmMessages = [];
    window.confirm = function (message) {
      window.__codexPanelConfirmMessages.push(String(message || ""));
      throw new Error("Unexpected confirm: " + String(message || ""));
    };
    return true;
  })()`;
}

function historyStorageExpression() {
  return `(() => ({
    sessions: localStorage.getItem("codexAeChatSessions"),
    active: localStorage.getItem("codexAeActiveChatSessionId"),
    transcript: localStorage.getItem("codexAeChatTranscript")
  }))()`;
}

function writeHistoryStorageExpression(values) {
  const storage = values || {};
  return `(() => {
    const values = ${JSON.stringify(storage)};
    function write(key, value) {
      if (value === null || value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
    write("codexAeChatSessions", values.sessions);
    write("codexAeActiveChatSessionId", values.active);
    write("codexAeChatTranscript", values.transcript);
    return true;
  })()`;
}

function devRequestPlanResult(rawExtendscript) {
  const rawStep = {
    title: "Import and layout photos",
    tool: "run_extendscript",
    args: {
      script: "app.beginUndoGroup('Dev request smoke'); app.endUndoGroup();"
    },
    mutatesProject: true,
    description: "Raw ExtendScript workaround that should be promoted to a typed tool."
  };
  const readOnlyStep = {
    title: "Inspect bridge",
    tool: "get_bridge_status",
    args: {},
    mutatesProject: false,
    description: "Read-only bridge status check."
  };
  const steps = rawExtendscript ? [readOnlyStep, rawStep] : [readOnlyStep];
  const classification = rawExtendscript ? {
    category: "risky",
    label: "Risky / raw ExtendScript",
    allowsDryRun: true,
    blocksNormalRun: true,
    rawExtendscriptStepCount: 1
  } : {
    category: "safe typed-tool",
    label: "Safe typed-tool",
    allowsDryRun: true,
    blocksNormalRun: false,
    rawExtendscriptStepCount: 0
  };
  return {
    planParseOk: true,
    requestId: rawExtendscript ? "dev-request-raw-smoke" : "dev-request-safe-smoke",
    model: "smoke",
    durationMs: 1,
    plan: {
      summary: rawExtendscript ? "Promote photo import and layout workflow to a typed tool." : "Inspect bridge status safely.",
      risk: rawExtendscript ? "medium" : "low",
      steps
    },
    planValidation: {
      ok: true,
      mutatingCount: rawExtendscript ? 1 : 0,
      steps,
      classification
    },
    planClassification: classification
  };
}

function rawRunGatePlanResult() {
  const rawStep = {
    title: "Import and layout photos",
    tool: "run_extendscript",
    args: {
      script: "return { ok: true, smoke: 'raw-run-gate' };"
    },
    mutatesProject: true,
    targetSummary: "active comp / selected layers",
    description: "Raw ExtendScript plan that must be unlocked by a matching dry run."
  };
  const classification = {
    category: "risky",
    label: "Risky / raw ExtendScript",
    tone: "mutating",
    allowsDryRun: true,
    blocksRun: true,
    blocksNormalRun: true,
    rawExtendscriptStepCount: 1,
    runRecommendation: "Dry run this exact raw ExtendScript plan before normal execution."
  };
  return {
    planParseOk: true,
    requestId: "raw-run-gate-smoke",
    model: "smoke",
    durationMs: 1,
    plan: {
      summary: "Import and layout selected photos with a raw ExtendScript workaround.",
      risk: "medium",
      requiresCheckpoint: true,
      steps: [rawStep]
    },
    planValidation: {
      ok: true,
      mutatingCount: 1,
      steps: [rawStep],
      classification
    },
    planClassification: classification
  };
}

function classificationWarningPlanResult() {
  const steps = [
    {
      title: "Read bridge status before review note",
      tool: "get_bridge_status",
      args: {},
      mutatesProject: false,
      targetSummary: "bridge status"
    },
    {
      title: "Review note without a tool",
      tool: null,
      args: {},
      mutatesProject: false,
      warnings: ["No MCP tool for this step."]
    }
  ];
  const classification = {
    category: "needs clarification",
    label: "Needs clarification",
    tone: "mutating",
    allowsDryRun: true,
    blocksRun: false,
    rawExtendscriptStepCount: 0,
    runRecommendation: "Runnable with review; non-tool steps will be skipped or require replanning."
  };
  return {
    planParseOk: true,
    requestId: "classification-warning-controls-smoke",
    model: "smoke",
    durationMs: 1,
    plan: {
      summary: "Validation ok plan with a review warning.",
      risk: "low",
      requiresCheckpoint: false,
      steps
    },
    planValidation: {
      ok: true,
      stepCount: 2,
      executableCount: 1,
      mutatingCount: 0,
      steps,
      classification
    },
    planClassification: classification
  };
}

function installDevRequestTranscriptExpression(planResult, sessionId) {
  const transcript = [
    {
      role: "user",
      text: "Dev request button smoke prompt"
    },
    {
      role: "assistant",
      text: "Plan review: ready\nValidation: ok\nRun readiness: smoke",
      planResult
    }
  ];
  const session = {
    id: sessionId,
    title: "Dev request button smoke",
    updatedAt: "2026-05-17T00:00:00.000Z",
    transcript,
    chatMessages: []
  };
  return `(() => {
    const session = ${JSON.stringify(session)};
    localStorage.setItem("codexAeChatSessions", JSON.stringify([session]));
    localStorage.setItem("codexAeActiveChatSessionId", session.id);
    localStorage.setItem("codexAeChatTranscript", JSON.stringify(session.transcript));
    localStorage.setItem("codexAeChatMode", "plan");
    return true;
  })()`;
}

function installRawRunGateTranscriptExpression(planResult, sessionId) {
  const transcript = [
    {
      role: "user",
      text: "Raw run gate smoke prompt"
    },
    {
      role: "assistant",
      text: "Plan review: ready\nValidation: ok, 1 step, 1 mutating\nRun readiness: Dry run checks without changes",
      planResult
    }
  ];
  const session = {
    id: sessionId,
    title: "Raw run gate smoke",
    updatedAt: "2026-05-18T00:00:00.000Z",
    transcript,
    chatMessages: []
  };
  return `(() => {
    const session = ${JSON.stringify(session)};
    localStorage.setItem("codexAeChatSessions", JSON.stringify([session]));
    localStorage.setItem("codexAeActiveChatSessionId", session.id);
    localStorage.setItem("codexAeChatTranscript", JSON.stringify(session.transcript));
    localStorage.setItem("codexAeChatMode", "plan");
    return true;
  })()`;
}

function composerStateExpression() {
  return `(() => ({
    mode: localStorage.getItem("codexAeChatMode"),
    promptOptimization: localStorage.getItem("codexAePromptOptimization"),
    prompt: document.getElementById("chatPrompt") ? document.getElementById("chatPrompt").value : ""
  }))()`;
}

function writeComposerStateExpression(values) {
  const storage = values || {};
  return `(() => {
    const values = ${JSON.stringify(storage)};
    function write(key, value) {
      if (value === null || value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
    write("codexAeChatMode", values.mode);
    write("codexAePromptOptimization", values.promptOptimization);
    const prompt = document.getElementById("chatPrompt");
    if (prompt) {
      prompt.value = values.prompt || "";
      prompt.dispatchEvent(new Event("input", { bubbles: true }));
      prompt.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return true;
  })()`;
}

function bridgeStorageExpression() {
  return `(() => ({
    url: localStorage.getItem("codexAeBridgeUrl"),
    token: localStorage.getItem("codexAeBridgeToken"),
    autoConnect: localStorage.getItem("codexAeBridgeAutoConnect")
  }))()`;
}

function writeBridgeStorageExpression(values) {
  const storage = values || {};
  return `(() => {
    const values = ${JSON.stringify(storage)};
    function write(key, value) {
      if (value === null || value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
    write("codexAeBridgeUrl", values.url);
    write("codexAeBridgeToken", values.token);
    write("codexAeBridgeAutoConnect", values.autoConnect);
    return true;
  })()`;
}

function offlineBridgeStorage() {
  return {
    url: process.env.CEP_PANEL_OFFLINE_URL || "http://127.0.0.1:59999",
    token: "offline-smoke-token",
    autoConnect: "1"
  };
}

function historyFixtureStorage() {
  const sessions = [
    {
      id: "history-smoke-one",
      title: "First saved prompt",
      updatedAt: new Date().toISOString(),
      transcript: [
        { role: "user", text: "First saved prompt" },
        { role: "assistant", text: "First saved answer" }
      ],
      chatMessages: [
        { role: "user", content: "First saved prompt" },
        { role: "assistant", content: "First saved answer" }
      ]
    },
    {
      id: "history-smoke-two",
      title: "Second saved prompt",
      updatedAt: new Date().toISOString(),
      transcript: [
        { role: "user", text: "Second saved prompt" },
        { role: "assistant", text: "Second saved answer" }
      ],
      chatMessages: [
        { role: "user", content: "Second saved prompt" },
        { role: "assistant", content: "Second saved answer" }
      ]
    }
  ];
  return {
    sessions: JSON.stringify(sessions),
    active: "history-smoke-one",
    transcript: JSON.stringify(sessions[0].transcript)
  };
}

function selectHistoryExpression(value) {
  return `(() => {
    const select = document.getElementById("chatHistorySelect");
    if (!select) return { ok: false, error: "missing chatHistorySelect" };
    select.value = ${JSON.stringify(value)};
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true, state: ${stateExpression()} };
  })()`;
}

async function inspect() {
  const { page, ws, send } = await connectToPanel();
  try {
    const state = await evaluate(send, stateExpression());
    console.log(JSON.stringify({ page: { title: page.title, url: page.url }, state }, null, 2));
  } finally {
    ws.close();
  }
}

async function reloadPanel() {
  const { page, ws, send } = await connectToPanel();
  try {
    await send("Page.enable");
    await send("Page.reload", { ignoreCache: true });
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const state = await evaluate(send, stateExpression());
    console.log(JSON.stringify({ page: { title: page.title, url: page.url }, state }, null, 2));
  } finally {
    ws.close();
  }
}

async function smoke() {
  const { page, ws, send } = await connectToPanel();
  let historyBackup = null;
  let providerBackup = null;
  let composerBackup = null;
  try {
    historyBackup = await evaluate(send, historyStorageExpression());
    providerBackup = await evaluate(send, providerStorageExpression());
    composerBackup = await evaluate(send, composerStateExpression());

    await reloadActivePage(send);
    await evaluate(send, setupExpression());
    await waitFor(send, "panel online", (state) => state.badge === "online", 15000);
    await waitFor(send, "agent list", (state) => state.agentOptions.some((option) => option.value === AGENT_ID), 20000);
    await evaluate(send, selectAgentExpression(PROMPT));
    await waitFor(send, "selected agent ready", (state) => (
      state.agentValue === AGENT_ID &&
      state.model === MODEL &&
      state.mode === "plan" &&
      state.sendDisabled === false &&
      state.agentDetails.indexOf("Provider:") >= 0
    ), 20000);

    const checked = await evaluate(send, clickExpression("checkAgentButton"));
    if (!checked || !checked.ok) throw new Error("Check model button was not clickable.");
    await waitFor(send, "checked agent ready", (state) => (
      state.agentValue === AGENT_ID &&
      state.model === MODEL &&
      state.sendDisabled === false &&
      state.checkDisabled === false
    ), 30000);

    const sent = await evaluate(send, clickExpression("sendChatButton"));
    if (!sent || !sent.ok) throw new Error("Send button was not clickable.");
    await waitFor(send, "planning indicator", (state) => (
      state.workingExists === true &&
      state.workingText.indexOf("Planning") >= 0 &&
      state.workingDots === 3
    ), 5000);

    const planned = await waitFor(send, "AE Plan result", (state) => (
      state.sendDisabled === false &&
      state.transcript.indexOf("Plan review: ready") >= 0 &&
      state.transcript.indexOf("Confidence: Safe typed-tool") >= 0 &&
      state.transcript.indexOf("Validation: ok") >= 0 &&
      state.transcript.indexOf("0 mutating") >= 0 &&
      state.transcript.indexOf("Affected targets:") >= 0 &&
      state.transcript.indexOf("Run readiness:") >= 0 &&
      state.planRunStatus === "Safe typed-tool ready" &&
      state.planRunStatusClass.indexOf("read-only") >= 0 &&
      state.runTitle.indexOf("read-only") >= 0 &&
      state.recoverLastPlanText === "Подхватить последний план из чата" &&
      state.recoverLastPlanDisabled === true &&
      state.dryRunText === "Dry run / Проверить" &&
      state.dryRunDisabled === false &&
      state.runText === "Выполнить план" &&
      state.runDisabled === false &&
      state.inlinePlanActionCount >= 1 &&
      state.inlineDryRunText === "Dry run / Проверить" &&
      state.inlineDryRunDisabled === false &&
      state.inlineRunPlanText === "Выполнить план" &&
      state.inlineRunPlanDisabled === false
    ), WAIT_MS);

    await reloadActivePage(send);
    await waitFor(send, "panel online after plan reload", (state) => state.badge === "online", 15000);
    await waitFor(send, "saved plan recoverable after reload", (state) => (
      state.transcript.indexOf("Plan review: ready") >= 0 &&
      hasNoActionProposalReadyStatus(state) &&
      state.recoverLastPlanText === "Подхватить последний план из чата" &&
      state.recoverLastPlanDisabled === false &&
      state.dryRunDisabled === true &&
      state.runDisabled === true &&
      state.inlinePlanActionCount === 0
    ), 20000);

    const recoveredClick = await evaluate(send, clickExpression("recoverLastPlanButton"));
    if (!recoveredClick || !recoveredClick.ok) throw new Error("Recover last plan button was not clickable.");
    const recovered = await waitFor(send, "recovered plan ready", (state) => (
      state.planRunStatus === "Safe typed-tool ready" &&
      state.planRunStatusClass.indexOf("read-only") >= 0 &&
      state.dryRunDisabled === false &&
      state.runDisabled === false &&
      state.inlinePlanActionCount >= 1 &&
      state.inlineRunPlanDisabled === false
    ), 10000);

    const dryRunClicked = await evaluate(send, clickExpression("dryRunPlanButton"));
    if (!dryRunClicked || !dryRunClicked.ok) throw new Error("Dry run button was not clickable.");
    const dryRun = await waitFor(send, "dry run result", (state) => (
      state.sendDisabled === false &&
      state.transcript.indexOf("Dry run: ok") >= 0 &&
      state.transcript.indexOf("Mode: preview only; project was not changed.") >= 0 &&
      state.transcript.indexOf("Checkpoint/edit session: not needed for read-only dry run.") >= 0
    ), 30000);

    await evaluate(send, installConfirmExpression());
    const runClicked = await evaluate(send, clickSelectorExpression(".inline-run-plan-button"));
    if (!runClicked || !runClicked.ok) throw new Error("Inline Run plan button was not clickable.");
    const run = await waitFor(send, "run result", (state) => (
      state.sendDisabled === false &&
      state.transcript.indexOf("Run: ok") >= 0 &&
      state.transcript.indexOf("Checkpoint/edit session: not needed for read-only run.") >= 0 &&
      state.transcript.indexOf("verification") < 0
    ), 60000).catch(async () => {
      return waitFor(send, "run result with verification text", (state) => (
        state.sendDisabled === false &&
        state.transcript.indexOf("Run: ok") >= 0 &&
        state.transcript.indexOf("Checkpoint/edit session: not needed for read-only run.") >= 0
      ), 5000);
    });

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      planned: {
        agent: planned.agentValue,
        model: planned.model,
        agentDetails: planned.agentDetails,
        transcriptTail: planned.transcript.slice(-3000)
      },
      recovered: {
        status: recovered.planRunStatus,
        statusClass: recovered.planRunStatusClass,
        recoverTitle: recovered.recoverLastPlanTitle,
        transcriptTail: recovered.transcript.slice(-3000)
      },
      dryRun: {
        transcriptTail: dryRun.transcript.slice(-3000)
      },
      run: {
        transcriptTail: run.transcript.slice(-3000),
        logTail: run.log.slice(-1200)
      }
    }, null, 2));
  } finally {
    if (historyBackup || providerBackup || composerBackup) {
      try {
        if (historyBackup) await evaluate(send, writeHistoryStorageExpression(historyBackup));
        if (providerBackup) await evaluate(send, writeProviderStorageExpression(providerBackup));
        if (composerBackup) await evaluate(send, writeComposerStateExpression(composerBackup));
        await reloadActivePage(send);
      } catch (_restoreError) {}
    }
    ws.close();
  }
}

async function devRequestButtonSmoke() {
  const { page, ws, send } = await connectToPanel();
  let historyBackup = null;
  try {
    historyBackup = await evaluate(send, historyStorageExpression());

    async function recoverStoredPlan(label, rawExtendscript) {
      await evaluate(send, installDevRequestTranscriptExpression(
        devRequestPlanResult(rawExtendscript),
        `dev-request-${label}-${Date.now()}`
      ));
      await reloadActivePage(send);
      const loaded = await waitFor(send, `${label} plan transcript loaded`, (state) => (
        state.transcript.indexOf("Plan review: ready") >= 0 &&
        state.recoverLastPlanDisabled === false &&
        hasNoActionProposalReadyStatus(state) &&
        state.prepareDevRequestVisible === false &&
        state.prepareDevRequestDisabled === true
      ), 15000);

      const recoveredClick = await evaluate(send, clickExpression("recoverLastPlanButton"));
      if (!recoveredClick || !recoveredClick.ok) {
        throw new Error(`${label}: Recover last plan button was not clickable.`);
      }

      const recovered = await waitFor(send, `${label} dev request button state`, (state) => {
        if (rawExtendscript) {
          return state.planRunStatus === "Risky plan; dry run first" &&
            state.prepareDevRequestVisible === true &&
            state.prepareDevRequestDisabled === false &&
            state.prepareDevRequestTitle.indexOf("raw ExtendScript") >= 0;
        }
        return state.planRunStatus === "Safe typed-tool ready" &&
          state.prepareDevRequestVisible === false &&
          state.prepareDevRequestDisabled === true;
      }, 10000);

      let prepared = null;
      if (rawExtendscript) {
        const prepareClick = await evaluate(send, clickExpression("prepareDevRequestButton"));
        if (!prepareClick || !prepareClick.ok) {
          throw new Error(`${label}: Prepare typed tool request button was not clickable.`);
        }
        prepared = await waitFor(send, `${label} dev request prepared`, (state) => (
          state.transcript.indexOf("Typed tool request prepared.") >= 0 &&
          state.transcript.indexOf("Start prompt: logs/dev-requests/") >= 0 &&
          state.transcript.indexOf("Codex App: no new chat was created automatically.") >= 0 &&
          state.transcript.indexOf("start a dev chat from the start prompt") >= 0
        ), 15000);
      }

      return {
        loaded: {
          recoverDisabled: loaded.recoverLastPlanDisabled,
          prepareVisible: loaded.prepareDevRequestVisible,
          prepareDisabled: loaded.prepareDevRequestDisabled
        },
        recovered: {
          status: recovered.planRunStatus,
          statusClass: recovered.planRunStatusClass,
          prepareVisible: recovered.prepareDevRequestVisible,
          prepareDisabled: recovered.prepareDevRequestDisabled,
          prepareTitle: recovered.prepareDevRequestTitle
        },
        prepared: prepared ? {
          transcriptTail: prepared.transcript.slice(-1200)
        } : null
      };
    }

    const safe = await recoverStoredPlan("safe", false);
    const toolGap = await recoverStoredPlan("tool-gap", true);
    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      safe,
      toolGap
    }, null, 2));
  } finally {
    if (historyBackup) {
      try {
        await evaluate(send, writeHistoryStorageExpression(historyBackup));
        await reloadActivePage(send);
      } catch (_restoreError) {}
    }
    ws.close();
  }
}

async function rawRunGateSmoke() {
  const { page, ws, send } = await connectToPanel();
  let historyBackup = null;
  try {
    historyBackup = await evaluate(send, historyStorageExpression());
    await evaluate(send, installRawRunGateTranscriptExpression(
      rawRunGatePlanResult(),
      `raw-run-gate-${Date.now()}`
    ));
    await reloadActivePage(send);

    const loaded = await waitFor(send, "raw run gate plan loaded", (state) => (
      state.transcript.indexOf("Plan review: ready") >= 0 &&
      state.recoverLastPlanDisabled === false &&
      hasNoActionProposalReadyStatus(state) &&
      state.dryRunDisabled === true &&
      state.runDisabled === true
    ), 15000);

    const recoveredClick = await evaluate(send, clickExpression("recoverLastPlanButton"));
    if (!recoveredClick || !recoveredClick.ok) throw new Error("Recover last plan button was not clickable.");
    const recovered = await waitFor(send, "raw run gate recovered", (state) => (
      state.planRunStatus === "Dry run available; Run blocked" &&
      state.planRunStatusClass.indexOf("mutating") >= 0 &&
      state.dryRunDisabled === false &&
      state.runDisabled === true &&
      state.inlinePlanActionCount >= 1 &&
      state.inlineDryRunDisabled === false &&
      state.inlineRunPlanDisabled === true
    ), 10000);

    await evaluate(send, installRawRunGateFakeExpression());
    const dryRunClicked = await evaluate(send, clickExpression("dryRunPlanButton"));
    if (!dryRunClicked || !dryRunClicked.ok) throw new Error("Dry run button was not clickable.");
    const dryRun = await waitFor(send, "raw run gate dry-run unlock", (state) => (
      state.sendDisabled === false &&
      state.transcript.indexOf("Dry run: ok") >= 0 &&
      state.rawDryRunGate &&
      state.rawDryRunGate.runId === "raw-gate-dry-run-smoke" &&
      state.rawDryRunGate.requestId === "raw-run-gate-smoke" &&
      state.runDisabled === false &&
      state.inlineRunPlanDisabled === false &&
      state.runTitle.indexOf("explicit raw ExtendScript gate") >= 0 &&
      state.rawRunGateRequests.length === 1
    ), 30000);

    await evaluate(send, installConfirmExpression());
    const runClicked = await evaluate(send, clickExpression("runPlanButton"));
    if (!runClicked || !runClicked.ok) throw new Error("Run plan button was not clickable after matching dry run.");
    const run = await waitFor(send, "raw run gate protected run", (state) => (
      state.sendDisabled === false &&
      state.transcript.indexOf("Run: ok") >= 0 &&
      state.transcript.indexOf("Raw ExtendScript gate: approved by dry run raw-gate-dry-run-smoke.") >= 0 &&
      state.rawRunGateRequests.length === 2
    ), 30000);

    const requests = run.rawRunGateRequests || [];
    const dryRunPayload = requests[0] || {};
    const runPayload = requests[1] || {};
    if (dryRunPayload.dryRun !== true) throw new Error("Expected first raw gate request to be a dry run.");
    if (dryRunPayload.allowRawExtendscript === true) throw new Error("Dry run should not request raw ExtendScript execution approval.");
    if (runPayload.dryRun !== false) throw new Error("Expected second raw gate request to be a real run.");
    if (runPayload.allowRawExtendscript !== true) throw new Error("Real run must include explicit raw ExtendScript approval.");
    if (runPayload.rawExtendscriptDryRunId !== "raw-gate-dry-run-smoke") throw new Error("Real run must include the matching dry-run id.");
    if (runPayload.confirm !== true || runPayload.allowMutations !== true || runPayload.autoEditSession !== true) {
      throw new Error("Real run must keep confirm, mutation, and auto edit-session protection enabled.");
    }

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      loaded: {
        recoverDisabled: loaded.recoverLastPlanDisabled,
        status: loaded.planRunStatus
      },
      recovered: {
        status: recovered.planRunStatus,
        statusClass: recovered.planRunStatusClass,
        runDisabled: recovered.runDisabled,
        inlineRunPlanDisabled: recovered.inlineRunPlanDisabled
      },
      dryRun: {
        rawDryRunGate: dryRun.rawDryRunGate,
        runDisabled: dryRun.runDisabled,
        inlineRunPlanDisabled: dryRun.inlineRunPlanDisabled
      },
      run: {
        requestCount: requests.length,
        dryRunPayload: {
          dryRun: dryRunPayload.dryRun,
          allowRawExtendscript: dryRunPayload.allowRawExtendscript
        },
        runPayload: {
          dryRun: runPayload.dryRun,
          allowRawExtendscript: runPayload.allowRawExtendscript,
          rawExtendscriptDryRunId: runPayload.rawExtendscriptDryRunId,
          autoEditSession: runPayload.autoEditSession
        },
        transcriptTail: run.transcript.slice(-3000)
      }
    }, null, 2));
  } finally {
    try {
      await evaluate(send, restoreRawRunGateFakeExpression());
    } catch (_restoreFakeError) {}
    if (historyBackup) {
      try {
        await evaluate(send, writeHistoryStorageExpression(historyBackup));
        await reloadActivePage(send);
      } catch (_restoreError) {}
    }
    ws.close();
  }
}

async function classificationWarningControlsSmoke() {
  const { page, ws, send } = await connectToPanel();
  let historyBackup = null;
  try {
    historyBackup = await evaluate(send, historyStorageExpression());
    await evaluate(send, installRawRunGateTranscriptExpression(
      classificationWarningPlanResult(),
      `classification-warning-${Date.now()}`
    ));
    await reloadActivePage(send);

    await waitFor(send, "classification warning plan loaded", (state) => (
      state.transcript.indexOf("Plan review: ready") >= 0 &&
      state.recoverLastPlanDisabled === false &&
      hasNoActionProposalReadyStatus(state) &&
      state.dryRunDisabled === true &&
      state.runDisabled === true
    ), 15000);

    const recoveredClick = await evaluate(send, clickExpression("recoverLastPlanButton"));
    if (!recoveredClick || !recoveredClick.ok) throw new Error("Recover last plan button was not clickable.");
    const recovered = await waitFor(send, "classification warning recovered", (state) => (
      state.planRunStatus === "Runnable with review" &&
      state.planRunStatusClass.indexOf("mutating") >= 0 &&
      state.dryRunDisabled === false &&
      state.runDisabled === false &&
      state.inlinePlanActionCount >= 1 &&
      state.inlinePlanActionStatus === "Runnable with review" &&
      state.inlineDryRunDisabled === false &&
      state.inlineRunPlanDisabled === false &&
      state.transcript.indexOf("Plan blocked") < 0
    ), 10000);

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      recovered: {
        status: recovered.planRunStatus,
        statusClass: recovered.planRunStatusClass,
        dryRunDisabled: recovered.dryRunDisabled,
        runDisabled: recovered.runDisabled,
        inlineStatus: recovered.inlinePlanActionStatus,
        inlineRunPlanDisabled: recovered.inlineRunPlanDisabled
      }
    }, null, 2));
  } finally {
    if (historyBackup) {
      try {
        await evaluate(send, writeHistoryStorageExpression(historyBackup));
        await reloadActivePage(send);
      } catch (_restoreError) {}
    }
    ws.close();
  }
}

async function modeToggleSmoke() {
  const { page, ws, send } = await connectToPanel();
  let composerBackup = null;
  try {
    composerBackup = await evaluate(send, composerStateExpression());
    await reloadActivePage(send);
    const initial = await waitFor(send, "mode toggle buttons", (state) => (
      state.chatModeButtons.length === 3 &&
      state.chatModeButtons.some((button) => button.value === "chat" && button.text === "Chat") &&
      state.chatModeButtons.some((button) => button.value === "plan" && button.text === "Agent") &&
      state.chatModeButtons.some((button) => button.value === "hardcore" && button.text === "Agent Hardcore") &&
      state.chatModeOptions.some((option) => option.value === "hardcore" && option.text === "Agent Hardcore")
    ), 15000);

    const clicked = await evaluate(send, clickSelectorExpression("#chatModeTabs [data-chat-mode='hardcore']"));
    if (!clicked || !clicked.ok) throw new Error("Agent Hardcore mode tab was not clickable.");
    const hardcore = await waitFor(send, "hardcore mode selected", (state) => (
      state.mode === "hardcore" &&
      state.chatModeButtons.some((button) => button.value === "hardcore" && button.active === true)
    ), 10000);

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      initial: {
        mode: initial.mode,
        buttons: initial.chatModeButtons,
        options: initial.chatModeOptions
      },
      hardcore: {
        mode: hardcore.mode,
        buttons: hardcore.chatModeButtons
      }
    }, null, 2));
  } finally {
    if (composerBackup) {
      try {
        await evaluate(send, writeComposerStateExpression(composerBackup));
        await reloadActivePage(send);
      } catch (_restoreError) {}
    }
    ws.close();
  }
}

async function hardcoreAutopilotUiSmoke() {
  const { page, ws, send } = await connectToPanel();
  let composerBackup = null;
  try {
    composerBackup = await evaluate(send, composerStateExpression());
    await reloadActivePage(send);
    await evaluate(send, setupExpression());
    await waitFor(send, "panel online", (state) => state.badge === "online", 15000);
    await waitFor(send, "agent list", (state) => state.agentOptions.some((option) => option.value === AGENT_ID), 20000);
    await evaluate(send, installHardcoreAutopilotFakeExpression());
    const selected = await evaluate(send, selectHardcoreAgentExpression("Run Hardcore UI autopilot smoke."));
    if (!selected || selected.mode !== "hardcore") throw new Error("Agent Hardcore mode was not selected.");

    const ready = await waitFor(send, "hardcore autopilot controls", (state) => (
      state.mode === "hardcore" &&
      state.sendDisabled === false &&
      state.planRunStatus === "Hardcore owner: send once; no plan ready" &&
      state.recoverLastPlanVisible === true &&
      state.dryRunVisible === true &&
      state.runVisible === true &&
      state.prepareDevRequestVisible === false &&
      state.dryRunDisabled === true &&
      state.runDisabled === true
    ), 10000);

    const sent = await evaluate(send, clickExpression("sendChatButton"));
    if (!sent || !sent.ok) throw new Error("Hardcore send button was not clickable.");
    await waitFor(send, "hardcore autopilot busy", (state) => (
      state.workingExists === true &&
      state.workingText.indexOf("Hardcore autopilot") >= 0 &&
      state.planRunStatus === "Hardcore owner is running..."
    ), 5000);
    const finished = await waitFor(send, "hardcore autopilot finished", (state) => (
      state.sendDisabled === false &&
      state.transcript.indexOf("Agent Hardcore: verified") >= 0 &&
      state.transcript.indexOf("Protected run: ok") >= 0 &&
      state.transcript.indexOf("TypedTool failures:") >= 0 &&
      state.transcript.indexOf("get_project_checkpoint_details: marked not working.") >= 0 &&
      state.transcript.indexOf("Codex App start prompt file: logs/dev-requests/hardcore-ui-smoke/start-prompt.md") >= 0 &&
      state.transcript.indexOf("Continue development from this targeted typed-tool failure.") >= 0 &&
      state.transcript.indexOf("Fallback: raw ExtendScript was used after a matching dry-run gate.") >= 0 &&
      state.transcript.indexOf("Resource report: hardcore owner session") >= 0 &&
      state.transcript.indexOf("Session evidence: logs/hardcore-sessions/hardcore-ui-smoke/session.json") >= 0 &&
      state.hardcoreRequests.length === 1
    ), 30000);

    const payload = finished.hardcoreRequests[0] || {};
    if (payload.allowMutations !== true || payload.autoEditSession !== true || payload.autoPromoteKnowledge !== true) {
      throw new Error("Hardcore autopilot request must enable protected mutation/session/knowledge gates.");
    }
    if (payload.maxAttempts !== 5 || payload.agentMode !== "hardcore" || payload.reasoning_effort !== "xhigh" || payload.projectOwner !== true || payload.allowRawFallback !== true) {
      throw new Error("Hardcore autopilot request must keep owner-mode xhigh Hardcore payload.");
    }

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      ready: {
        status: ready.planRunStatus,
        dryRunVisible: ready.dryRunVisible,
        runVisible: ready.runVisible,
        recoverVisible: ready.recoverLastPlanVisible,
        sendDisabled: ready.sendDisabled
      },
      request: {
        path: "/agents/hardcore/run",
        agentMode: payload.agentMode,
        maxAttempts: payload.maxAttempts,
        reasoningEffort: payload.reasoning_effort,
        projectOwner: payload.projectOwner,
        allowRawFallback: payload.allowRawFallback,
        allowMutations: payload.allowMutations,
        autoEditSession: payload.autoEditSession,
        autoPromoteKnowledge: payload.autoPromoteKnowledge
      },
      typedToolHandoff: {
        markedNotWorking: finished.transcript.indexOf("get_project_checkpoint_details: marked not working.") >= 0,
        startPromptFile: finished.transcript.indexOf("Codex App start prompt file:") >= 0,
        noAutoChatClaim: finished.transcript.indexOf("Do not assume a Codex App chat was created automatically.") >= 0
      },
      transcriptTail: finished.transcript.slice(-2000)
    }, null, 2));
  } finally {
    try {
      await evaluate(send, restoreHardcoreAutopilotFakeExpression());
    } catch (_restoreFakeError) {}
    if (composerBackup) {
      try {
        await evaluate(send, writeComposerStateExpression(composerBackup));
        await reloadActivePage(send);
      } catch (_restoreError) {}
    }
    ws.close();
  }
}

async function planReviewSmoke() {
  const { page, ws, send } = await connectToPanel();
  try {
    await reloadActivePage(send);
    await evaluate(send, setupExpression());
    await waitFor(send, "panel online", (state) => state.badge === "online", 15000);
    await waitFor(send, "agent list", (state) => state.agentOptions.some((option) => option.value === AGENT_ID), 20000);
    await evaluate(send, selectAgentExpression(PROMPT));
    await waitFor(send, "selected agent ready", (state) => (
      state.agentValue === AGENT_ID &&
      state.model === MODEL &&
      state.mode === "plan" &&
      state.sendDisabled === false
    ), 20000);

    const sent = await evaluate(send, clickExpression("sendChatButton"));
    if (!sent || !sent.ok) throw new Error("Send button was not clickable.");

    const planned = await waitFor(send, "improved plan review text", (state) => (
      state.sendDisabled === false &&
      state.transcript.indexOf("Plan review: ready") >= 0 &&
      state.transcript.indexOf("Confidence: Safe typed-tool") >= 0 &&
      state.transcript.indexOf("Validation: ok") >= 0 &&
      state.transcript.indexOf("Affected targets:") >= 0 &&
      state.transcript.indexOf("Mutations:") >= 0 &&
      state.transcript.indexOf("Checkpoint expectation:") >= 0 &&
      state.transcript.indexOf("Run readiness:") >= 0 &&
      state.planRunStatus === "Safe typed-tool ready" &&
      state.planRunStatusClass.indexOf("read-only") >= 0 &&
      state.dryRunDisabled === false &&
      state.runDisabled === false
    ), WAIT_MS);

    const dryRunClicked = await evaluate(send, clickExpression("dryRunPlanButton"));
    if (!dryRunClicked || !dryRunClicked.ok) throw new Error("Dry run button was not clickable.");
    const dryRun = await waitFor(send, "improved dry run text", (state) => (
      state.sendDisabled === false &&
      state.transcript.indexOf("Dry run: ok") >= 0 &&
      state.transcript.indexOf("Mode: preview only; project was not changed.") >= 0 &&
      state.transcript.indexOf("Checkpoint/edit session: not needed for read-only dry run.") >= 0 &&
      state.transcript.indexOf("Affected targets:") >= 0
    ), 30000);

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      planned: {
        status: planned.planRunStatus,
        statusClass: planned.planRunStatusClass,
        transcriptTail: planned.transcript.slice(-3000)
      },
      dryRun: {
        transcriptTail: dryRun.transcript.slice(-3000)
      }
    }, null, 2));
  } finally {
    ws.close();
  }
}

async function openAiApiSetupSmoke() {
  const { page, ws, send } = await connectToPanel();
  try {
    await reloadActivePage(send);
    await evaluate(send, setupExpression());
    await waitFor(send, "panel online", (state) => state.badge === "online", 15000);
    await waitFor(send, "OpenAI API agent list", (state) => (
      state.agentOptions.some((option) => option.value === OPENAI_API_AGENT_ID)
    ), 20000);
    await evaluate(send, selectOpenAiApiExpression());
    const selected = await waitFor(send, "OpenAI API selected", (state) => (
      state.agentValue === OPENAI_API_AGENT_ID &&
      state.model === OPENAI_API_MODEL &&
      state.apiKeyVisible === true &&
      state.setupTitle.indexOf("OpenAI API") >= 0
    ), 30000);

    const keySaved = selected.agentDetails.indexOf("Setup: key saved") >= 0 || selected.sendDisabled === false;
    if (keySaved) {
      console.log(JSON.stringify({
        ok: true,
        skipped: true,
        reason: "OpenAI API is configured in this environment; no-key disabled state is not expected.",
        page: { title: page.title, url: page.url },
        state: selected
      }, null, 2));
      return;
    }

    const noKey = await waitFor(send, "OpenAI API no-key state", (state) => (
      state.agentValue === OPENAI_API_AGENT_ID &&
      state.sendDisabled === true &&
      state.agentDetails.indexOf("Setup: key required") >= 0 &&
      state.setupText.indexOf("OpenAI API billing") >= 0 &&
      state.modelOptions.some((option) => option.value === OPENAI_API_MODEL && option.text.indexOf("No API key") >= 0)
    ), 10000);

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      agentDetails: noKey.agentDetails,
      modelOptions: noKey.modelOptions,
      setupText: noKey.setupText
    }, null, 2));
  } finally {
    ws.close();
  }
}

async function providerSetupSmoke() {
  const { page, ws, send } = await connectToPanel();
  let backup = null;
  let bridgeBackup = null;
  try {
    backup = await evaluate(send, providerStorageExpression());
    bridgeBackup = await evaluate(send, bridgeStorageExpression());
    await reloadActivePage(send);
    await evaluate(send, installProviderSelfTestFakeExpression());
    await evaluate(send, setupExpression());
    await waitFor(send, "panel online", (state) => state.badge === "online", 15000);
    await waitFor(send, "agent list", (state) => state.agentOptions.some((option) => option.value === OPENAI_CLI_AGENT_ID), 20000);

    const results = [];
    for (const group of ["gemini", "claude", "openrouter"]) {
      const clicked = await evaluate(send, selectProviderGroupExpression(group));
      if (!clicked || !clicked.ok) throw new Error(`Could not click ${group} provider tab.`);
      const label = group === "gemini" ? "Gemini" : group === "claude" ? "Claude" : "OpenRouter";
      const agentId = group === "gemini" ? "gemini-api" : group === "claude" ? "claude-api" : "openrouter";
      const selected = await waitFor(send, `${label} setup selected`, (state) => (
        state.activeProviderGroup === group &&
        state.agentValue === agentId &&
        state.setupTitle.indexOf(label) >= 0 &&
        state.setupText.indexOf("API billing") >= 0 &&
        state.agentDetails.indexOf("Setup: key required") >= 0 &&
        state.authModeVisible === false &&
        state.apiKeyVisible === true &&
        state.localServiceVisible === false &&
        state.freeModelsVisible === (group === "openrouter") &&
        state.setupActionVisible === false &&
        state.sendDisabled === true &&
        state.modelOptions.length > 0 &&
        state.modelOptions.some((option) => option.text.indexOf("No API key") >= 0)
      ), 10000);
      results.push({
        group,
        agent: selected.agentValue,
        setupTitle: selected.setupTitle,
        agentStatus: selected.agentStatus,
        agentDetails: selected.agentDetails,
        modelOptions: selected.modelOptions
      });
    }

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      providers: results
    }, null, 2));
  } finally {
    if (backup) {
      try {
        await evaluate(send, writeProviderStorageExpression(backup));
        if (bridgeBackup) await evaluate(send, writeBridgeStorageExpression(bridgeBackup));
      } catch (_error) {}
    }
    try {
      await evaluate(send, restoreProviderSelfTestFakeExpression());
    } catch (_restoreError) {}
    ws.close();
  }
}

async function providerPlaceholderSmoke() {
  return providerSetupSmoke();
}

function selfTestRowsByKey(state) {
  const rows = {};
  for (const row of state.selfTestRows || []) rows[row.key] = row;
  return rows;
}

async function providerSelfTestSmoke() {
  const { page, ws, send } = await connectToPanel();
  let backup = null;
  let bridgeBackup = null;
  try {
    backup = await evaluate(send, providerStorageExpression());
    bridgeBackup = await evaluate(send, bridgeStorageExpression());
    await reloadActivePage(send);
    await evaluate(send, installProviderSelfTestFakeExpression());
    await evaluate(send, setupExpression());
    await waitFor(send, "panel online", (state) => state.badge === "online", 15000);
    await waitFor(send, "provider self-test rows", (state) => (
      state.selfTestRows.length === 6 &&
      state.agentOptions.some((option) => option.value === OPENAI_CLI_AGENT_ID)
    ), 20000);

    const clicked = await evaluate(send, clickExpression("providerSelfTestButton"));
    if (!clicked || !clicked.ok) throw new Error("Could not start provider self-test.");

    const tested = await waitFor(send, "provider self-test diagnostics", (state) => {
      const rows = selfTestRowsByKey(state);
      const readinessUrls = state.providerSelfTestReadinessUrls || [];
      const setupOnlyReadiness = readinessUrls.length === 5 &&
        readinessUrls.every((url) => String(url).indexOf("checkModels=0") >= 0) &&
        readinessUrls.every((url) => String(url).indexOf("agentId=ollama-local") < 0);
      return rows["openai-api"] &&
        rows["openai-api"].state === "Setup" &&
        rows["openai-api"].detail.indexOf("OPENAI_API_KEY") >= 0 &&
        rows["openai-api"].detail.indexOf("smoke-key") < 0 &&
        rows["openai-cli"] &&
        rows["openai-cli"].state === "Setup" &&
        rows["openai-cli"].detail.indexOf("Not logged in from CEP smoke") >= 0 &&
        rows["openai-cli"].detail.indexOf("login status failed") >= 0 &&
        rows["gemini-api"] &&
        rows["gemini-api"].state === "Setup" &&
        rows["gemini-api"].detail.indexOf("GEMINI_API_KEY") >= 0 &&
        rows["claude-api"] &&
        rows["claude-api"].state === "Ready" &&
        rows["claude-api"].detail.indexOf("model list was not refreshed") >= 0 &&
        rows["openrouter"] &&
        rows["openrouter"].state === "Setup" &&
        rows["openrouter"].detail.indexOf("OPENROUTER_API_KEY") >= 0 &&
        rows["ollama-local"] &&
        rows["ollama-local"].state === "Manual" &&
        rows["ollama-local"].detail.indexOf("Detect Ollama") >= 0 &&
        setupOnlyReadiness &&
        state.selfTestButtonDisabled === false &&
        state.apiKeyValue === "";
    }, 15000);

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      selfTestRows: tested.selfTestRows,
      providerSelfTestReadinessUrls: tested.providerSelfTestReadinessUrls
    }, null, 2));
  } finally {
    if (backup) {
      try {
        await evaluate(send, writeProviderStorageExpression(backup));
        if (bridgeBackup) await evaluate(send, writeBridgeStorageExpression(bridgeBackup));
      } catch (_error) {}
    }
    try {
      await evaluate(send, restoreProviderSelfTestFakeExpression());
    } catch (_restoreError) {}
    ws.close();
  }
}

async function providerKeySaveSmoke() {
  if (process.env.CEP_PANEL_ALLOW_KEY_SAVE_SMOKE !== "1") {
    throw new Error("provider-key-save-smoke writes test API keys. Run scripts/provider-key-save-smoke.js so the bridge uses an isolated temporary secrets file.");
  }

  const { page, ws, send } = await connectToPanel();
  let backup = null;
  let bridgeBackup = null;
  try {
    backup = await evaluate(send, providerStorageExpression());
    bridgeBackup = await evaluate(send, bridgeStorageExpression());
    await reloadActivePage(send);
    await evaluate(send, setupExpression());
    await waitFor(send, "panel online", (state) => state.badge === "online", 15000);
    await waitFor(send, "provider agent list", (state) => (
      state.agentOptions.some((option) => option.value === "gemini-api") &&
      state.agentOptions.some((option) => option.value === "claude-api")
    ), 20000);

    const results = [];
    for (const group of ["gemini", "claude"]) {
      const clicked = await evaluate(send, selectProviderGroupExpression(group));
      if (!clicked || !clicked.ok) throw new Error(`Could not click ${group} provider tab.`);

      const label = group === "gemini" ? "Gemini" : "Claude";
      const agentId = group === "gemini" ? "gemini-api" : "claude-api";
      const key = `${group}-panel-smoke-key-${Date.now()}`;

      const selected = await waitFor(send, `${label} API key entry ready`, (state) => (
        state.activeProviderGroup === group &&
        state.agentValue === agentId &&
        state.apiKeyVisible === true &&
        state.saveKeyDisabled === true &&
        state.agentDetails.indexOf("Setup: key required") >= 0
      ), 10000);

      const filled = await evaluate(send, fillApiKeyExpression(key));
      if (!filled || !filled.ok) throw new Error(`Could not fill ${label} API key.`);
      await waitFor(send, `${label} save key enabled`, (state) => (
        state.agentValue === agentId &&
        state.apiKeyValue === key &&
        state.saveKeyDisabled === false
      ), 10000);

      const savedClick = await evaluate(send, clickExpression("saveAgentKeyButton"));
      if (!savedClick || !savedClick.ok) throw new Error(`${label} Save key button was not clickable.`);
      const saved = await waitFor(send, `${label} key saved`, (state) => (
        state.agentValue === agentId &&
        state.apiKeyValue === "" &&
        state.agentDetails.indexOf("Setup: key saved") >= 0 &&
        state.sendDisabled === false &&
        state.modelOptions.length > 0 &&
        state.modelOptions.every((option) => option.text.indexOf("No API key") < 0)
      ), 30000);

      results.push({
        group,
        agent: saved.agentValue,
        setupTitle: saved.setupTitle,
        agentStatus: saved.agentStatus,
        agentDetails: saved.agentDetails,
        modelOptions: saved.modelOptions,
        saveKeyText: selected.saveKeyText
      });
    }

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      providers: results
    }, null, 2));
  } finally {
    if (backup) {
      try {
        await evaluate(send, writeProviderStorageExpression(backup));
        if (bridgeBackup) await evaluate(send, writeBridgeStorageExpression(bridgeBackup));
        await reloadActivePage(send);
      } catch (_error) {}
    }
    ws.close();
  }
}

async function sidebarCollapseSmoke() {
  const { page, ws, send } = await connectToPanel();
  let backup = null;
  try {
    backup = await evaluate(send, sidebarStorageExpression());
    await evaluate(send, writeSidebarStorageExpression({ collapsed: "0" }));
    await reloadActivePage(send);
    await waitFor(send, "sidebar expanded", (state) => (
      state.sidebarCollapsed === false &&
      state.collapseButtonText === "<" &&
      state.collapseButtonExpanded === "true"
    ), 10000);

    const collapseClick = await evaluate(send, clickExpression("collapseSidebarButton"));
    if (!collapseClick || !collapseClick.ok) throw new Error("Collapse sidebar button was not clickable.");
    const collapsed = await waitFor(send, "sidebar collapsed", (state) => (
      state.sidebarCollapsed === true &&
      state.collapseButtonText === ">" &&
      state.collapseButtonTitle === "Show provider panel" &&
      state.collapseButtonExpanded === "false"
    ), 10000);

    const expandClick = await evaluate(send, clickExpression("collapseSidebarButton"));
    if (!expandClick || !expandClick.ok) throw new Error("Expand sidebar button was not clickable.");
    const expanded = await waitFor(send, "sidebar expanded again", (state) => (
      state.sidebarCollapsed === false &&
      state.collapseButtonText === "<" &&
      state.collapseButtonTitle === "Collapse provider panel" &&
      state.collapseButtonExpanded === "true"
    ), 10000);

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      collapsed: {
        text: collapsed.collapseButtonText,
        title: collapsed.collapseButtonTitle,
        ariaExpanded: collapsed.collapseButtonExpanded
      },
      expanded: {
        text: expanded.collapseButtonText,
        title: expanded.collapseButtonTitle,
        ariaExpanded: expanded.collapseButtonExpanded
      }
    }, null, 2));
  } finally {
    if (backup) {
      try {
        await evaluate(send, writeSidebarStorageExpression(backup));
        await reloadActivePage(send);
      } catch (_error) {}
    }
    ws.close();
  }
}

async function diagnosticsSmoke() {
  const { page, ws, send } = await connectToPanel();
  let backup = null;
  try {
    backup = await evaluate(send, diagnosticsStorageExpression());
    await evaluate(send, writeDiagnosticsStorageExpression({ open: "0" }));
    await reloadActivePage(send);
    await waitFor(send, "diagnostics closed", (state) => (
      state.diagnosticsOpen === false &&
      state.diagnosticsDisplay === "none" &&
      state.diagnosticsButtonText === "Log" &&
      state.diagnosticsButtonExpanded === "false"
    ), 10000);

    const openClick = await evaluate(send, clickExpression("diagnosticsButton"));
    if (!openClick || !openClick.ok) throw new Error("Diagnostics button was not clickable.");
    const opened = await waitFor(send, "diagnostics open", (state) => (
      state.diagnosticsOpen === true &&
      state.diagnosticsDisplay !== "none" &&
      state.diagnosticsButtonText === "Hide log" &&
      state.diagnosticsButtonTitle === "Hide activity log" &&
      state.diagnosticsButtonExpanded === "true"
    ), 10000);

    const closeClick = await evaluate(send, clickExpression("diagnosticsButton"));
    if (!closeClick || !closeClick.ok) throw new Error("Diagnostics close button was not clickable.");
    const closed = await waitFor(send, "diagnostics closed again", (state) => (
      state.diagnosticsOpen === false &&
      state.diagnosticsDisplay === "none" &&
      state.diagnosticsButtonText === "Log" &&
      state.diagnosticsButtonTitle === "Show activity log" &&
      state.diagnosticsButtonExpanded === "false"
    ), 10000);

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      opened: {
        display: opened.diagnosticsDisplay,
        text: opened.diagnosticsButtonText,
        ariaExpanded: opened.diagnosticsButtonExpanded
      },
      closed: {
        display: closed.diagnosticsDisplay,
        text: closed.diagnosticsButtonText,
        ariaExpanded: closed.diagnosticsButtonExpanded
      }
    }, null, 2));
  } finally {
    if (backup) {
      try {
        await evaluate(send, writeDiagnosticsStorageExpression(backup));
        await reloadActivePage(send);
      } catch (_error) {}
    }
    ws.close();
  }
}

async function connectorStatusSmoke() {
  const { page, ws, send } = await connectToPanel();
  try {
    await reloadActivePage(send);
    await evaluate(send, installConnectorStatusFakeExpression());
    const clicked = await evaluate(send, clickExpression("connectorStatusButton"));
    if (!clicked || !clicked.ok) throw new Error("Connector status button was not clickable.");
    const ready = await waitFor(send, "connector status rows", (state) => {
      const rows = {};
      for (const row of state.connectorRows || []) rows[row.key] = row;
      return rows.state &&
        rows.state.value === "Connected" &&
        rows.endpoint &&
        rows.endpoint.value.indexOf("https://connector-smoke.example") >= 0 &&
        rows.tools &&
        rows.tools.value.indexOf("run_extendscript_candidate") >= 0 &&
        rows.last &&
        rows.last.value.indexOf("check_extendscript_candidate ok") >= 0 &&
        rows.writes &&
        rows.writes.value === "Enabled";
    }, 3000);

    const emergencyClick = await evaluate(send, clickExpression("connectorEmergencyDisableButton"));
    if (!emergencyClick || !emergencyClick.ok) throw new Error("Connector emergency disable button was not clickable.");
    const disabled = await waitFor(send, "connector emergency disable", (state) => {
      const rows = {};
      for (const row of state.connectorRows || []) rows[row.key] = row;
      return rows.writes &&
        rows.writes.value === "Emergency disabled" &&
        rows.emergency &&
        rows.emergency.value === "Active" &&
        state.connectorEmergencyDisabled === true;
    }, 3000);

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      readyRows: ready.connectorRows,
      emergencyRows: disabled.connectorRows
    }, null, 2));
  } finally {
    try {
      await evaluate(send, restoreConnectorStatusFakeExpression());
    } catch (_error) {}
    ws.close();
  }
}

async function sendButtonSmoke() {
  const { page, ws, send } = await connectToPanel();
  try {
    await reloadActivePage(send);
    const state = await waitFor(send, "stable send button label", (item) => (
      item.sendButtonText === ">" &&
      item.sendButtonTitle === "Send"
    ), 10000);

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      sendButton: {
        text: state.sendButtonText,
        title: state.sendButtonTitle,
        disabled: state.sendDisabled
      }
    }, null, 2));
  } finally {
    ws.close();
  }
}

async function brandingSmoke() {
  const { page, ws, send } = await connectToPanel();
  try {
    await reloadActivePage(send);
    const state = await waitFor(send, "AE Agent branding", (item) => (
      item.title === "AE Agent 2.0.0" &&
      item.windowBarExists === false &&
      item.windowBarText === "" &&
      item.windowBarText.indexOf("AE GPT") < 0 &&
      item.appTitleExists === false &&
      item.appTitle === "" &&
      item.appVersionExists === false &&
      item.appVersion === ""
    ), 10000);

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      branding: {
        title: state.title,
        windowBarExists: state.windowBarExists,
        windowBarText: state.windowBarText,
        appTitleExists: state.appTitleExists,
        appTitle: state.appTitle,
        appVersionExists: state.appVersionExists,
        appVersion: state.appVersion
      }
    }, null, 2));
  } finally {
    ws.close();
  }
}

async function reloadButtonSmoke() {
  const { page, ws, send } = await connectToPanel();
  try {
    await reloadActivePage(send);
    const clicked = await evaluate(send, clickExpression("reloadButton"));
    if (!clicked || !clicked.ok) throw new Error("Reload button was not clickable.");
    const state = await waitFor(send, "hard reload button result", (item) => (
      item.title === "AE Agent 2.0.0" &&
      item.locationHref.indexOf("v=2.0.0") >= 0 &&
      item.locationHref.indexOf("assets=") >= 0 &&
      item.locationHref.indexOf("reload=") >= 0 &&
      item.assetVersion &&
      item.scriptSrcs.some((src) => src.indexOf("panel.js?v=" + encodeURIComponent(item.assetVersion)) >= 0)
    ), 15000);

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      reload: {
        title: state.title,
        locationHref: state.locationHref,
        assetVersion: state.assetVersion,
        panelScript: state.scriptSrcs.find((src) => src.indexOf("panel.js") >= 0) || ""
      }
    }, null, 2));
  } finally {
    ws.close();
  }
}

async function openAiCliSmoke() {
  const { page, ws, send } = await connectToPanel();
  try {
    await reloadActivePage(send);
    await evaluate(send, setupExpression());
    await waitFor(send, "panel online", (state) => state.badge === "online", 15000);
    await waitFor(send, "OpenAI CLI agent list", (state) => (
      state.agentOptions.some((option) => option.value === OPENAI_CLI_AGENT_ID)
    ), 20000);
    await evaluate(send, selectOpenAiCliExpression());
    await waitFor(send, "OpenAI CLI selected", (state) => (
      state.agentValue === OPENAI_CLI_AGENT_ID &&
      state.model === OPENAI_CLI_MODEL &&
      state.mode === "chat" &&
      state.sendDisabled === false &&
      state.agentDetails.indexOf("codex exec") >= 0
    ), 30000);

    const checked = await evaluate(send, clickExpression("checkAgentButton"));
    if (!checked || !checked.ok) throw new Error("Check model button was not clickable for OpenAI CLI.");
    await waitFor(send, "OpenAI CLI checked ready", (state) => (
      state.agentValue === OPENAI_CLI_AGENT_ID &&
      state.model === OPENAI_CLI_MODEL &&
      state.sendDisabled === false &&
      state.checkDisabled === false &&
      state.agentDetails.indexOf("Status") >= 0
    ), 45000);

    const sent = await evaluate(send, clickExpression("sendChatButton"));
    if (!sent || !sent.ok) throw new Error("Send button was not clickable for OpenAI CLI.");
    const replied = await waitFor(send, "OpenAI CLI chat reply", (state) => (
      state.sendDisabled === false &&
      state.transcript.indexOf("AE Agent CLI OK") >= 0
    ), OPENAI_CLI_WAIT_MS);
    if (
      replied.transcript.indexOf("ERROR") >= 0 ||
      replied.transcript.indexOf("ASSISTANT") < 0
    ) {
      throw new Error(`OpenAI CLI chat did not produce a clean assistant reply.\n${replied.transcript.slice(-3000)}`);
    }

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      agent: replied.agentValue,
      model: replied.model,
      agentDetails: replied.agentDetails,
      transcriptTail: replied.transcript.slice(-3000),
      logTail: replied.log.slice(-1200)
    }, null, 2));
  } finally {
    ws.close();
  }
}

async function openAiCliSetupSmoke() {
  const { page, ws, send } = await connectToPanel();
  try {
    await reloadActivePage(send);
    await evaluate(send, setupExpression());
    await waitFor(send, "panel online", (state) => state.badge === "online", 15000);
    await waitFor(send, "OpenAI CLI agent list", (state) => (
      state.agentOptions.some((option) => option.value === OPENAI_CLI_AGENT_ID)
    ), 20000);
    await evaluate(send, selectOpenAiCliExpression());
    const selected = await waitFor(send, "OpenAI CLI setup action visible", (state) => (
      state.agentValue === OPENAI_CLI_AGENT_ID &&
      state.setupActionVisible === true &&
      (
        state.setupActionText.indexOf("Sign in with ChatGPT") >= 0 ||
        state.setupActionText.indexOf("Signed in") >= 0 ||
        state.setupActionText.indexOf("Retry CLI check") >= 0
      )
    ), 30000);

    const dryRun = await postBridge("/agents/setup", {
      agentId: OPENAI_CLI_AGENT_ID,
      action: "codex_login",
      dryRun: true
    });

    if (dryRun.status >= 400 || !dryRun.body || dryRun.body.ok !== true) {
      throw new Error(`OpenAI CLI setup dry run failed: ${(dryRun.body && dryRun.body.error) || `HTTP ${dryRun.status}`}`);
    }

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      selected: {
        agent: selected.agentValue,
        setupTitle: selected.setupTitle,
        setupText: selected.setupText,
        setupActionText: selected.setupActionText,
        setupActionDisabled: selected.setupActionDisabled
      },
      dryRun: dryRun.body.setup
    }, null, 2));
  } finally {
    ws.close();
  }
}

async function workflowPresetSmoke() {
  const { page, ws, send } = await connectToPanel();
  let historyBackup = null;
  let composerBackup = null;
  try {
    historyBackup = await evaluate(send, historyStorageExpression());
    composerBackup = await evaluate(send, composerStateExpression());
    await evaluate(send, writeHistoryStorageExpression(historyFixtureStorage()));
    await reloadActivePage(send);

    const restored = await waitFor(send, "workflow preset controls", (state) => (
      state.chatHistoryValue === "history-smoke-one" &&
      state.transcript.indexOf("First saved prompt") >= 0 &&
      state.workflowPresetOptions.some((option) => option.value === "selected-layer-timing") &&
      state.workflowPresetOptions.some((option) => option.value === "precompose-rename") &&
      state.workflowPresetOptions.some((option) => option.value === "text-shape-layout") &&
      state.workflowPresetOptions.some((option) => option.value === "basic-animation") &&
      state.workflowPresetOptions.some((option) => option.value === "replace-source") &&
      state.workflowInsertDisabled === true
    ), 15000);

    const selected = await evaluate(send, selectWorkflowPresetExpression("selected-layer-timing"));
    if (!selected || !selected.ok) throw new Error("Could not select workflow preset.");
    const ready = await waitFor(send, "workflow preset insert enabled", (state) => (
      state.workflowPresetValue === "selected-layer-timing" &&
      state.workflowInsertDisabled === false
    ), 10000);

    const insertedClick = await evaluate(send, clickExpression("applyWorkflowPresetButton"));
    if (!insertedClick || !insertedClick.ok) throw new Error("Workflow preset insert button was not clickable.");
    const inserted = await waitFor(send, "workflow preset inserted", (state) => (
      state.mode === "plan" &&
      state.promptOptimizationChecked === true &&
      state.promptOptimizationLabel === "On" &&
      state.workflowPresetValue === "" &&
      state.workflowInsertDisabled === true &&
      state.promptValue.indexOf("Поставь выделенные слои") >= 0 &&
      state.promptValue.indexOf("Align the selected layers") >= 0 &&
      state.promptValue.indexOf("align_layers_to_time") < 0 &&
      state.promptValue.indexOf("Do not use raw ExtendScript") < 0 &&
      state.transcript.indexOf("First saved prompt") >= 0 &&
      state.transcript.indexOf("align_layers_to_time") < 0 &&
      state.chatHistoryValue === "history-smoke-one"
    ), 10000);

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      restored: {
        chatHistoryValue: restored.chatHistoryValue,
        presetOptions: restored.workflowPresetOptions
      },
      selected: {
        workflowPresetValue: ready.workflowPresetValue,
        insertDisabled: ready.workflowInsertDisabled
      },
      inserted: {
        mode: inserted.mode,
        promptOptimizationChecked: inserted.promptOptimizationChecked,
        promptPreview: inserted.promptValue.slice(0, 320),
        transcriptTail: inserted.transcript.slice(-1000)
      }
    }, null, 2));
  } finally {
    if (historyBackup || composerBackup) {
      try {
        if (historyBackup) await evaluate(send, writeHistoryStorageExpression(historyBackup));
        if (composerBackup) await evaluate(send, writeComposerStateExpression(composerBackup));
        await reloadActivePage(send);
        if (composerBackup) await evaluate(send, writeComposerStateExpression(composerBackup));
      } catch (_error) {}
    }
    ws.close();
  }
}

async function historySmoke() {
  const { page, ws, send } = await connectToPanel();
  let backup = null;
  try {
    backup = await evaluate(send, historyStorageExpression());
    await evaluate(send, writeHistoryStorageExpression(historyFixtureStorage()));
    await reloadActivePage(send);

    const restored = await waitFor(send, "restored first chat history item", (state) => (
      state.chatHistoryOptions.length >= 2 &&
      state.chatHistoryValue === "history-smoke-one" &&
      state.transcript.indexOf("First saved prompt") >= 0 &&
      state.transcript.indexOf("First saved answer") >= 0
    ), 15000);

    const selected = await evaluate(send, selectHistoryExpression("history-smoke-two"));
    if (!selected || !selected.ok) throw new Error("Could not select second chat history item.");
    const second = await waitFor(send, "selected second chat history item", (state) => (
      state.chatHistoryValue === "history-smoke-two" &&
      state.transcript.indexOf("Second saved prompt") >= 0 &&
      state.transcript.indexOf("Second saved answer") >= 0
    ), 10000);

    const newChatClicked = await evaluate(send, clickExpression("newChatButton"));
    if (!newChatClicked || !newChatClicked.ok) throw new Error("New Chat button was not clickable.");
    const newChat = await waitFor(send, "new blank chat", (state) => (
      state.chatHistoryOptions.length >= 3 &&
      state.chatHistoryValue !== "history-smoke-one" &&
      state.chatHistoryValue !== "history-smoke-two" &&
      state.transcript.replace(/\s+/g, "") === ""
    ), 10000);

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      restored: {
        chatHistoryValue: restored.chatHistoryValue,
        chatHistoryOptions: restored.chatHistoryOptions
      },
      selected: {
        chatHistoryValue: second.chatHistoryValue,
        transcriptTail: second.transcript.slice(-1000)
      },
      newChat: {
        chatHistoryValue: newChat.chatHistoryValue,
        chatHistoryOptions: newChat.chatHistoryOptions
      }
    }, null, 2));
  } finally {
    if (backup) {
      try {
        await evaluate(send, writeHistoryStorageExpression(backup));
        await reloadActivePage(send);
      } catch (_error) {}
    }
    ws.close();
  }
}

async function offlineSmoke() {
  const { page, ws, send } = await connectToPanel();
  let backup = null;
  try {
    backup = await evaluate(send, bridgeStorageExpression());
    await evaluate(send, writeBridgeStorageExpression(offlineBridgeStorage()));
    await reloadActivePage(send);

    const offline = await waitFor(send, "friendly bridge offline state", (state) => {
      const visibleText = [
        state.status,
        state.bridgeHelp,
        state.agentStatus,
        state.log
      ].join("\n");
      return (
        state.badge === "offline" &&
        state.status === "Bridge offline" &&
        state.bridgeHelp.indexOf("Bridge offline") >= 0 &&
        state.agentStatus.indexOf("Bridge offline") >= 0 &&
        visibleText.indexOf("HTTP 0") < 0 &&
        visibleText.indexOf("Network error") < 0 &&
        visibleText.indexOf("Network timeout") < 0
      );
    }, 15000);

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      state: {
        status: offline.status,
        badge: offline.badge,
        bridgeHelp: offline.bridgeHelp,
        bridgeHelpClass: offline.bridgeHelpClass,
        agentStatus: offline.agentStatus,
        logTail: offline.log.slice(-1000)
      }
    }, null, 2));
  } finally {
    if (backup) {
      try {
        await evaluate(send, writeBridgeStorageExpression(backup));
        await reloadActivePage(send);
      } catch (_error) {}
    }
    ws.close();
  }
}

function agentScenarioStamp() {
  return String(Date.now()).slice(-8);
}

async function agentScenarioReadiness(config) {
  const scenarioConfig = config || defaultAgentScenarioConfig();
  const response = await getJson(bridgeGetUrl("/agents/readiness", {
    agentId: scenarioConfig.agentId,
    model: scenarioConfig.model,
    checkModels: "1",
    timeoutMs: scenarioConfig.readinessTimeoutMs || 45000
  }));
  if (!response || response.ok !== true || !response.readiness) {
    throw new Error(`${scenarioConfig.label}: provider readiness check failed.`);
  }
  if (response.readiness.canChat !== true) {
    const error = response.readiness.error || response.readiness.status || "provider is not ready";
    throw new Error(`${scenarioConfig.label}: ${scenarioConfig.agentId}/${scenarioConfig.model} is not ready for Agent scenario QA: ${error}`);
  }
  return response.readiness;
}

function assertAgentScenarioProviderPolicy(config) {
  const scenarioConfig = config || defaultAgentScenarioConfig();
  if (!scenarioConfig.disallowProviderFallbacks) return;
  const agentId = String(scenarioConfig.agentId || "").toLowerCase();
  const providerGroup = String(scenarioConfig.providerGroup || "").toLowerCase();
  const authMode = String(scenarioConfig.authMode || "").toLowerCase();
  if (providerGroup !== "openai" || authMode !== "cli") {
    throw new Error(`${scenarioConfig.label}: generated-only live lane must use OpenAI CLI; got providerGroup=${scenarioConfig.providerGroup || ""}, authMode=${scenarioConfig.authMode || ""}.`);
  }
  if (agentId.indexOf("ollama") >= 0 || agentId.indexOf("local") >= 0 || agentId.indexOf("openrouter") >= 0) {
    throw new Error(`${scenarioConfig.label}: Local/Ollama/OpenRouter provider fallback is forbidden for this generated-only lane.`);
  }
}

async function agentScenarioAudit() {
  const prefixLimit = boundedNumber(process.env.CEP_PANEL_AUDIT_MAX_PREFIXES, 30, 1, 100);
  const prefixes = collectAuditPrefixes({
    prefixes: process.env.CEP_PANEL_AUDIT_PREFIXES || "",
    includeReportPrefixes: process.env.CEP_PANEL_AUDIT_INCLUDE_REPORT_PREFIXES !== "0",
    reportLimit: boundedNumber(process.env.CEP_PANEL_AUDIT_REPORT_LIMIT, 5, 0, 50)
  }).slice(0, prefixLimit);
  const projectItemLimit = boundedNumber(process.env.CEP_PANEL_AUDIT_PROJECT_ITEM_LIMIT, 50, 1, 250);
  const renderQueueLimit = boundedNumber(process.env.CEP_PANEL_AUDIT_RENDER_QUEUE_LIMIT, 100, 1, 200);
  const checkpointLimit = boundedNumber(process.env.CEP_PANEL_AUDIT_CHECKPOINT_LIMIT, 200, 1, 500);
  const editSessionLimit = boundedNumber(process.env.CEP_PANEL_AUDIT_EDIT_SESSION_LIMIT, 200, 1, 200);
  const detailLimit = boundedNumber(process.env.CEP_PANEL_AUDIT_DETAIL_LIMIT, 20, 0, 200);

  const healthCall = await safeGetJson(`${BRIDGE_URL.replace(/\/$/, "")}/health`);
  const projectInfoCall = await safeCallBridgeTool("get_project_info");
  const projectSearchResults = [];
  for (const prefix of prefixes) {
    const search = await safeCallBridgeTool("find_project_items", {
      query: prefix,
      limit: projectItemLimit,
      caseSensitive: true
    });
    projectSearchResults.push({
      prefix,
      result: search.ok ? search.result : null,
      error: search.ok ? null : search.error
    });
  }

  const renderQueueCall = await safeCallBridgeTool("get_render_queue_status", { limit: renderQueueLimit });
  const checkpointsCall = await safeCallBridgeTool("list_project_checkpoints", { limit: checkpointLimit });
  const editSessionsCall = await safeCallBridgeTool("list_edit_sessions", { limit: editSessionLimit });
  const audit = buildAgentQaAuditReport({
    bridgeUrl: BRIDGE_URL,
    prefixes,
    health: healthCall.ok ? healthCall.result : null,
    healthError: healthCall.ok ? null : healthCall.error,
    projectInfo: projectInfoCall.ok ? projectInfoCall.result : null,
    projectInfoError: projectInfoCall.ok ? null : projectInfoCall.error,
    projectSearchResults,
    renderQueue: renderQueueCall.ok ? renderQueueCall.result : null,
    renderQueueError: renderQueueCall.ok ? null : renderQueueCall.error,
    checkpoints: checkpointsCall.ok ? checkpointsCall.result : null,
    checkpointsError: checkpointsCall.ok ? null : checkpointsCall.error,
    editSessions: editSessionsCall.ok ? editSessionsCall.result : null,
    editSessionsError: editSessionsCall.ok ? null : editSessionsCall.error,
    detailLimit
  });

  console.log(JSON.stringify(audit, null, 2));
}

async function agentScenarioPreflight(config) {
  const health = await getJson(`${BRIDGE_URL.replace(/\/$/, "")}/health`);
  if (!health || health.ok !== true) throw new Error("Bridge health check failed.");
  if (!health.panelConnected) throw new Error("CEP panel is not connected to the bridge.");

  const readiness = await agentScenarioReadiness(config);
  const codexStatus = readiness && readiness.agent ? readiness.agent.codexStatus : null;
  const ping = await callBridgeTool("ping_ae");
  const projectInfo = await callBridgeTool("get_project_info");
  if (!projectInfo || !projectInfo.file) {
    throw new Error("After Effects project must be saved before live QA mutations can run.");
  }
  const activeComp = await callBridgeTool("get_active_comp");
  const editSession = await callBridgeTool("get_edit_session_status");
  if (editSession && editSession.active) {
    throw new Error("An edit session is already active; close or inspect it before running live QA.");
  }
  const renderQueue = await callBridgeTool("get_render_queue_status", { limit: 50 });

  return {
    health: {
      version: health.version,
      panelConnected: health.panelConnected,
      pending: health.pending || health.pendingCommands || 0,
      inflight: health.inflight || health.inflightCommands || 0
    },
    readiness: {
      status: readiness.status,
      canChat: readiness.canChat,
      modelAvailable: readiness.modelAvailable,
      modelSource: readiness.modelSource,
      modelCount: readiness.modelCount || 0,
      codexStatus: codexStatusReport(codexStatus)
    },
    ping,
    projectInfo: {
      file: projectInfo.file,
      name: projectInfo.name,
      numItems: projectInfo.numItems
    },
    activeComp,
    editSession,
    renderQueue
  };
}

function renderQueueItemCompName(item) {
  return item && item.comp && typeof item.comp.name === "string" ? item.comp.name : "";
}

async function cleanupRenderQueueItemsByPrefix(prefix) {
  const status = await callBridgeTool("get_render_queue_status", { limit: 200 });
  const items = Array.isArray(status && status.items) ? status.items : [];
  const matching = items.filter((item) => renderQueueItemCompName(item).indexOf(prefix) === 0);
  if (!matching.length) {
    return {
      prefix,
      removedCount: 0,
      removed: [],
      totalItems: Number(status && status.totalItems || 0),
      skipped: true
    };
  }

  const cleanupPlan = {
    summary: `Clean up generated render queue items for ${prefix}`,
    risk: "medium",
    requiresCheckpoint: false,
    steps: [
      {
        title: "Remove generated live QA render queue items",
        tool: "run_extendscript",
        args: {
          timeoutMs: 60000,
          script: `
      var prefix = ${JSON.stringify(prefix)};
      var rq = app.project.renderQueue;
      var removed = [];
      for (var i = rq.numItems; i >= 1; i--) {
        var item = rq.item(i);
        var compName = "";
        var outputPath = "";
        try { compName = item && item.comp ? item.comp.name : ""; } catch (compError) {}
        try {
          if (item && item.outputModule && item.numOutputModules > 0) {
            outputPath = String(item.outputModule(1).file || "");
          }
        } catch (outputError) {}
        if (compName.indexOf(prefix) === 0) {
          removed.push({ index: i, compName: compName, outputPath: outputPath });
          item.remove();
        }
      }
      return {
        prefix: prefix,
        removedCount: removed.length,
        removed: removed,
        totalItems: rq.numItems
      };
    `
        }
      }
    ]
  };

  const proposedCleanup = await proposeBridgePlan(
    cleanupPlan,
    `agent-scenario-render-queue-cleanup-${Date.now()}`,
    "agent-scenario-render-queue-cleanup"
  );
  const dryRun = await runProposedBridgePlan(proposedCleanup, true, 120000, "agent-scenario-render-queue-cleanup");
  const cleanupRun = await runProposedBridgePlan(proposedCleanup, false, 120000, "agent-scenario-render-queue-cleanup", {
    allowRawExtendscript: true,
    rawExtendscriptDryRunId: dryRun.id
  });
  const firstStep = cleanupRun.steps && cleanupRun.steps[0] ? cleanupRun.steps[0] : null;
  return {
    ...(firstStep && firstStep.result ? firstStep.result : {}),
    dryRun: planRunSummary(dryRun),
    run: planRunSummary(cleanupRun)
  };
}

function m100RunFieldsForProposal(proposal, includeConfirmation, fallbackSurface) {
  const fields = {
    actionId: proposal.actionId,
    payloadRef: proposal.action.payloadRef,
    payloadHash: proposal.action.payloadHash,
    previewHash: proposal.action.previewHash,
    riskLevel: proposal.risk.level,
    riskPolicyVersion: proposal.confirmation.riskPolicyVersion,
    requestId: proposal.requestId
  };
  if (includeConfirmation) {
    fields.confirmationToken = proposal.confirmation.confirmationToken;
    fields.confirmedBySurface = proposal.confirmation.surface || fallbackSurface || "cep-panel-cdp-smoke";
    fields.confirmedBySession = proposal.confirmation.sessionId || "";
  }
  return fields;
}

async function proposeBridgePlan(plan, requestId, surface) {
  const response = await postBridge("/agents/plan/propose", {
    plan,
    requestId,
    repairPlan: true,
    confirmationSurface: surface || "cep-panel-cdp-smoke",
    confirmationSessionId: `${surface || "cep-panel-cdp-smoke"}-${process.pid}`
  });
  if (response.status >= 400 || !response.body || response.body.ok !== true || !response.body.proposal) {
    const error = response.body && (response.body.error || response.body.code);
    throw new Error(`Plan proposal failed: ${error || `HTTP ${response.status}`}`);
  }
  return response.body;
}

async function runProposedBridgePlan(proposed, dryRun, timeoutMs, surface, options) {
  const runOptions = options || {};
  const payload = {
    ...m100RunFieldsForProposal(proposed.proposal, !dryRun, surface),
    dryRun,
    confirm: !dryRun,
    allowMutations: !dryRun,
    autoEditSession: !dryRun,
    timeoutMs: timeoutMs || 120000
  };
  if (runOptions.allowRawExtendscript) payload.allowRawExtendscript = true;
  if (runOptions.rawExtendscriptDryRunId) payload.rawExtendscriptDryRunId = runOptions.rawExtendscriptDryRunId;

  const response = await postBridge("/agents/plan/run", payload);
  if (response.status >= 400 || !response.body || response.body.ok !== true) {
    const error = response.body && (response.body.error || (response.body.run && response.body.run.error));
    throw new Error(`Proposed plan run failed: ${error || `HTTP ${response.status}`}`);
  }
  if (!response.body.run || response.body.run.ok !== true) {
    throw new Error(`Proposed plan run needs review: ${response.body.run && response.body.run.error || "unknown error"}`);
  }
  return response.body.run;
}

async function cleanupAgentScenarioPrefix(prefix, renderQueueBaselineTotal, options) {
  const cleanupOptions = options || {};
  const renderQueueCleanup = cleanupOptions.skipRenderQueueCleanup
    ? { prefix, removedCount: 0, removed: [], totalItems: Number(renderQueueBaselineTotal || 0), skipped: true }
    : await cleanupRenderQueueItemsByPrefix(prefix);
  const cleanupPlan = {
    summary: `Clean up generated live QA items for ${prefix}`,
    risk: "low",
    requiresCheckpoint: false,
    steps: [
      {
        title: "Remove generated live QA project items",
        tool: "cleanup_test_items",
        args: {
          namePrefix: prefix,
          maxItems: 100,
          confirm: true
        }
      }
    ]
  };
  const proposedCleanup = await proposeBridgePlan(
    cleanupPlan,
    `agent-scenario-cleanup-${Date.now()}`,
    "agent-scenario-cleanup"
  );
  const cleanupRun = await runProposedBridgePlan(proposedCleanup, false, 120000, "agent-scenario-cleanup");

  const remaining = await callBridgeTool("find_project_items", {
    query: prefix,
    limit: 20,
    caseSensitive: true
  });
  if (remaining.matches && remaining.matches.length) {
    throw new Error(`Cleanup left generated project items for ${prefix}: ${remaining.matches.map((item) => item.name).join(", ")}`);
  }

  const renderQueue = await callBridgeTool("get_render_queue_status", { limit: 50 });
  if (Number(renderQueue.totalItems || 0) !== Number(renderQueueBaselineTotal || 0)) {
    throw new Error(`Render queue baseline mismatch after cleanup for ${prefix}: expected ${renderQueueBaselineTotal}, got ${renderQueue.totalItems}.`);
  }

  return {
    renderQueueCleanup,
    run: cleanupRun,
    remaining,
    renderQueue
  };
}

function planRunSummary(run) {
  const steps = run && Array.isArray(run.steps) ? run.steps : [];
  return {
    ok: run ? run.ok === true : false,
    dryRun: run ? run.dryRun === true : null,
    safety: run ? run.safety || null : null,
    checkpoint: run && run.editSession && run.editSession.checkpoint ? run.editSession.checkpoint : run && run.checkpoint ? run.checkpoint : null,
    semanticVerification: run ? run.semanticVerification || null : null,
    statuses: steps.map((step) => ({
      title: step.title || step.tool || "Step",
      tool: step.tool || null,
      status: step.status || null,
      targetSummary: step.targetSummary || null,
      error: step.error || null
    }))
  };
}

function valuePreviewNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && typeof value.value === "number") return value.value;
  return null;
}

function pointsMatch(expected, observed) {
  if (!Array.isArray(expected) || !Array.isArray(observed) || observed.length < expected.length) return false;
  return expected.every((point, index) => {
    const actual = observed[index];
    return Array.isArray(point) &&
      Array.isArray(actual) &&
      Math.abs(Number(point[0]) - Number(actual[0])) <= 0.001 &&
      Math.abs(Number(point[1]) - Number(actual[1])) <= 0.001;
  });
}

async function verifyMaskScenarioReadBack(scenario, expected) {
  const found = await callBridgeTool("find_project_items", {
    query: expected.compName,
    type: "comp",
    exactName: true,
    caseSensitive: true,
    limit: 5
  });
  const compMatch = found.matches && found.matches[0];
  if (!compMatch || !compMatch.itemIndex) {
    throw new Error(`${scenario.id}: generated mask comp was not found by exact name.`);
  }

  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: true,
    layerLimit: 20
  });
  const layers = Array.isArray(comp.layers) ? comp.layers : [];
  const layer = layers.find((item) => item.name === expected.layerName);
  if (!layer || !layer.index) {
    throw new Error(`${scenario.id}: generated mask target layer was not found by read-back.`);
  }

  const layerDetails = await callBridgeTool("get_layer_details", {
    compName: expected.compName,
    layerIndex: layer.index,
    includeProperties: false
  });
  const masks = Array.isArray(layerDetails.masks) ? layerDetails.masks : [];
  if (typeof expected.maskCount === "number" && masks.length !== expected.maskCount) {
    throw new Error(`${scenario.id}: expected ${expected.maskCount} mask(s), got ${masks.length}.`);
  }
  const mask = masks.find((item) => item.name === expected.maskName);
  if (!mask) {
    throw new Error(`${scenario.id}: generated mask ${expected.maskName} was not found by read-back.`);
  }
  if (expected.maskMode && mask.maskMode !== expected.maskMode) {
    throw new Error(`${scenario.id}: generated mask mode mismatch; expected ${expected.maskMode}, got ${mask.maskMode}.`);
  }
  const vertices = mask.shape && mask.shape.vertices;
  if (!pointsMatch(expected.maskVertices, vertices)) {
    throw new Error(`${scenario.id}: generated mask vertices read-back mismatch.`);
  }

  return {
    ok: true,
    comp: {
      itemIndex: comp.itemIndex,
      name: comp.name,
      numLayers: comp.numLayers
    },
    layer: {
      index: layer.index,
      name: layer.name
    },
    mask: {
      name: mask.name,
      maskMode: mask.maskMode,
      inverted: mask.inverted,
      vertexCount: mask.shape ? mask.shape.vertexCount : null,
      vertices
    }
  };
}

async function verifyMarkerLifecycleReadBack(scenario, expected) {
  const found = await callBridgeTool("find_project_items", {
    query: expected.compName,
    type: "comp",
    exactName: true,
    caseSensitive: true,
    limit: 5
  });
  const compMatch = found.matches && found.matches[0];
  if (!compMatch || !compMatch.itemIndex) {
    throw new Error(`${scenario.id}: generated marker comp was not found by exact name.`);
  }

  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: true,
    layerLimit: 20
  });
  const layers = Array.isArray(comp.layers) ? comp.layers : [];
  const layer = layers.find((item) => item.name === expected.layerName);
  if (!layer || !layer.index) {
    throw new Error(`${scenario.id}: generated marker target layer was not found by read-back.`);
  }

  const layerDetails = await callBridgeTool("get_layer_details", {
    compName: expected.compName,
    layerIndex: layer.index,
    includeProperties: false
  });
  const markers = layerDetails.markers || {};
  const items = Array.isArray(markers.items) ? markers.items : [];
  const finalCount = Number(markers.count || 0);
  if (finalCount !== Number(expected.finalMarkerCount || 0)) {
    throw new Error(`${scenario.id}: expected final marker count ${expected.finalMarkerCount}, got ${finalCount}.`);
  }
  const deletedStillPresent = items.some((marker) => (
    marker.comment === expected.deletedComment &&
    Math.abs(Number(marker.time) - Number(expected.deletedTime)) <= 0.001
  ));
  if (deletedStillPresent) {
    throw new Error(`${scenario.id}: deleted marker was still present in read-back.`);
  }

  return {
    ok: true,
    comp: {
      itemIndex: comp.itemIndex,
      name: comp.name,
      numLayers: comp.numLayers
    },
    layer: {
      index: layer.index,
      name: layer.name
    },
    markers: {
      count: finalCount,
      returned: Number(markers.returned || items.length),
      deletedCommentAbsent: true
    }
  };
}

async function verifyDuplicateLayersReadBack(scenario, expected) {
  const found = await callBridgeTool("find_project_items", {
    query: expected.compName,
    type: "comp",
    exactName: true,
    caseSensitive: true,
    limit: 5
  });
  const compMatch = found.matches && found.matches[0];
  if (!compMatch || !compMatch.itemIndex) {
    throw new Error(`${scenario.id}: generated duplicate-layers comp was not found by exact name.`);
  }

  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: true,
    layerLimit: 20
  });
  const layers = Array.isArray(comp.layers) ? comp.layers : [];
  const names = layers.map((layer) => layer.name);
  for (const sourceName of expected.sourceNames || []) {
    if (!names.includes(sourceName)) {
      throw new Error(`${scenario.id}: generated source layer ${sourceName} was not found by read-back.`);
    }
  }
  for (const duplicateName of expected.duplicateNames || []) {
    if (!names.includes(duplicateName)) {
      throw new Error(`${scenario.id}: generated duplicate layer ${duplicateName} was not found by read-back.`);
    }
  }
  if (typeof expected.layerCountAfter === "number" && Number(comp.numLayers) !== expected.layerCountAfter) {
    throw new Error(`${scenario.id}: expected ${expected.layerCountAfter} layers after duplicate_layers, got ${comp.numLayers}.`);
  }

  return {
    ok: true,
    comp: {
      itemIndex: comp.itemIndex,
      name: comp.name,
      numLayers: comp.numLayers
    },
    layers: {
      sourceNames: expected.sourceNames || [],
      duplicateNames: expected.duplicateNames || [],
      observedNames: names
    }
  };
}

function numbersMatch(expected, observed, tolerance) {
  return Math.abs(Number(expected) - Number(observed)) <= (typeof tolerance === "number" ? tolerance : 0.001);
}

function numberPreviewArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => valuePreviewNumber(item));
  if (Array.isArray(value.value)) return value.value.map((item) => valuePreviewNumber(item));
  return [];
}

function numberArraysMatch(expected, observed, tolerance) {
  const actual = numberPreviewArray(observed);
  return Array.isArray(expected) &&
    actual.length >= expected.length &&
    expected.every((value, index) => numbersMatch(value, actual[index], tolerance));
}

async function verifyDakkshinTypedToolsReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: true,
    layerLimit: 20
  });
  const props = expected.compProperties || {};
  for (const field of ["width", "height", "pixelAspect", "duration", "frameRate", "displayStartTime"]) {
    if (typeof props[field] === "number" && !numbersMatch(props[field], comp[field], 0.01)) {
      throw new Error(`${scenario.id}: generated comp ${field} mismatch; expected ${props[field]}, got ${comp[field]}.`);
    }
  }
  if (Array.isArray(props.bgColor) && !numberArraysMatch(props.bgColor, comp.bgColor, 0.01)) {
    throw new Error(`${scenario.id}: generated comp bgColor read-back mismatch.`);
  }

  const layers = Array.isArray(comp.layers) ? comp.layers : [];
  const names = layers.map((layer) => layer.name);
  const maskLayer = layers.find((layer) => layer.name === expected.layerName);
  if (!maskLayer || !maskLayer.index) {
    throw new Error(`${scenario.id}: generated Dakkshin mask target layer was not found by read-back.`);
  }
  if (names.includes(expected.deletedLayerName)) {
    throw new Error(`${scenario.id}: generated delete target layer was still present after delete_layer.`);
  }
  if (typeof expected.layerCountAfter === "number" && Number(comp.numLayers) !== expected.layerCountAfter) {
    throw new Error(`${scenario.id}: expected ${expected.layerCountAfter} layer(s) after delete_layer, got ${comp.numLayers}.`);
  }

  const layerDetails = await callBridgeTool("get_layer_details", {
    compName: expected.compName,
    layerIndex: maskLayer.index,
    includeProperties: false
  });
  const masks = Array.isArray(layerDetails.masks) ? layerDetails.masks : [];
  if (typeof expected.maskCount === "number" && masks.length !== expected.maskCount) {
    throw new Error(`${scenario.id}: expected ${expected.maskCount} generated mask(s), got ${masks.length}.`);
  }
  const mask = masks.find((item) => item.name === expected.maskName);
  if (!mask) {
    throw new Error(`${scenario.id}: generated mask ${expected.maskName} was not found by read-back.`);
  }
  if (expected.maskMode && mask.maskMode !== expected.maskMode) {
    throw new Error(`${scenario.id}: generated mask mode mismatch; expected ${expected.maskMode}, got ${mask.maskMode}.`);
  }
  if (typeof expected.inverted === "boolean" && mask.inverted !== expected.inverted) {
    throw new Error(`${scenario.id}: generated mask inverted read-back mismatch.`);
  }
  if (!pointsMatch(expected.maskVertices, mask.shape && mask.shape.vertices)) {
    throw new Error(`${scenario.id}: generated updated mask vertices read-back mismatch.`);
  }
  if (typeof expected.opacity === "number" && !numbersMatch(expected.opacity, valuePreviewNumber(mask.opacity), 0.01)) {
    throw new Error(`${scenario.id}: generated mask opacity read-back mismatch.`);
  }
  if (Array.isArray(expected.feather) && !numberArraysMatch(expected.feather, mask.feather, 0.01)) {
    throw new Error(`${scenario.id}: generated mask feather read-back mismatch.`);
  }
  if (typeof expected.expansion === "number" && !numbersMatch(expected.expansion, valuePreviewNumber(mask.expansion), 0.01)) {
    throw new Error(`${scenario.id}: generated mask expansion read-back mismatch.`);
  }

  return {
    ok: true,
    comp: {
      itemIndex: comp.itemIndex,
      name: comp.name,
      width: comp.width,
      height: comp.height,
      duration: comp.duration,
      frameRate: comp.frameRate,
      displayStartTime: comp.displayStartTime,
      numLayers: comp.numLayers
    },
    layer: {
      index: maskLayer.index,
      name: maskLayer.name,
      deletedLayerAbsent: true
    },
    mask: {
      name: mask.name,
      maskMode: mask.maskMode,
      inverted: mask.inverted,
      opacity: valuePreviewNumber(mask.opacity),
      feather: numberPreviewArray(mask.feather),
      expansion: valuePreviewNumber(mask.expansion),
      vertexCount: mask.shape ? mask.shape.vertexCount : null
    }
  };
}

async function verifyResetWorkAreaReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: false
  });
  const start = Number(comp.workAreaStart);
  const duration = Number(comp.workAreaDuration);
  const expectedStart = Number(expected.fullWorkArea && expected.fullWorkArea.start);
  const expectedDuration = Number(expected.fullWorkArea && expected.fullWorkArea.duration);
  if (!numbersMatch(expectedStart, start, 0.001)) {
    throw new Error(`${scenario.id}: expected final workAreaStart ${expectedStart}, got ${start}.`);
  }
  if (!numbersMatch(expectedDuration, duration, 0.001)) {
    throw new Error(`${scenario.id}: expected final workAreaDuration ${expectedDuration}, got ${duration}.`);
  }
  if (!numbersMatch(expectedDuration, comp.duration, 0.001)) {
    throw new Error(`${scenario.id}: expected comp duration ${expectedDuration}, got ${comp.duration}.`);
  }

  return {
    ok: true,
    comp: {
      itemIndex: comp.itemIndex,
      name: comp.name,
      duration: comp.duration,
      workAreaStart: comp.workAreaStart,
      workAreaDuration: comp.workAreaDuration
    },
    expected: {
      fullWorkArea: expected.fullWorkArea,
      shortWorkArea: expected.shortWorkArea
    }
  };
}

async function verifyFindReplaceLayerRenameReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: true,
    layerLimit: 20
  });
  const layers = Array.isArray(comp.layers) ? comp.layers : [];
  const names = layers.map((layer) => layer.name);

  for (const beforeName of expected.beforeNames || []) {
    if (names.includes(beforeName)) {
      throw new Error(`${scenario.id}: generated pre-rename layer name ${beforeName} was still present after findReplace.`);
    }
  }
  for (const afterName of expected.afterNames || []) {
    if (!names.includes(afterName)) {
      throw new Error(`${scenario.id}: generated renamed layer ${afterName} was not found by read-back.`);
    }
  }
  if (typeof expected.layerCountAfter === "number" && Number(comp.numLayers) !== expected.layerCountAfter) {
    throw new Error(`${scenario.id}: expected ${expected.layerCountAfter} layer(s) after rename_layers, got ${comp.numLayers}.`);
  }

  return {
    ok: true,
    comp: {
      itemIndex: comp.itemIndex,
      name: comp.name,
      numLayers: comp.numLayers
    },
    rename: {
      find: expected.find || null,
      replace: expected.replace || null,
      beforeNames: expected.beforeNames || [],
      afterNames: expected.afterNames || [],
      observedNames: names
    }
  };
}

async function verifyGeneratedLayerTimingReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: true,
    layerLimit: 10
  });
  const layers = Array.isArray(comp.layers) ? comp.layers : [];
  const details = [];
  for (const layerExpectation of expected.layerExpectations || []) {
    const layer = layers.find((item) => item.name === layerExpectation.name);
    if (!layer || !layer.index) {
      throw new Error(`${scenario.id}: generated timing layer ${layerExpectation.name} was not found by read-back.`);
    }
    const layerDetails = await callBridgeTool("get_layer_details", {
      compItemIndex: compMatch.itemIndex,
      layerIndex: layer.index,
      includeProperties: false
    });
    const timing = layerDetails.layer || {};
    for (const field of ["startTime", "inPoint", "outPoint"]) {
      if (!numbersMatch(layerExpectation[field], timing[field], 0.01)) {
        throw new Error(`${scenario.id}: generated timing ${field} mismatch for ${layerExpectation.name}; expected ${layerExpectation[field]}, got ${timing[field]}.`);
      }
    }
    details.push({
      name: layer.name,
      index: layer.index,
      startTime: timing.startTime,
      inPoint: timing.inPoint,
      outPoint: timing.outPoint
    });
  }
  return {
    ok: true,
    comp: {
      itemIndex: comp.itemIndex,
      name: comp.name,
      numLayers: comp.numLayers
    },
    layers: details
  };
}

async function verifyGeneratedLayerTransformReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const details = await callBridgeTool("get_layer_details", {
    compItemIndex: compMatch.itemIndex,
    layerIndex: 1,
    includeProperties: false
  });
  const layer = details && details.layer ? details.layer : {};
  if (!layer || layer.name !== expected.layerName) {
    throw new Error(`${scenario.id}: generated transform layer ${expected.layerName} was not found by read-back.`);
  }
  const transform = details.transform || {};
  const position = numberPreviewArray(transform.position);
  const opacity = valuePreviewNumber(transform.opacity);
  if (!numberArraysMatch(expected.position, position, 0.01)) {
    throw new Error(`${scenario.id}: generated transform position read-back mismatch.`);
  }
  if (!numbersMatch(expected.opacity, opacity, 0.01)) {
    throw new Error(`${scenario.id}: generated transform opacity read-back mismatch; expected ${expected.opacity}, got ${opacity}.`);
  }
  return {
    ok: true,
    layer: {
      index: layer.index,
      name: layer.name,
      position,
      opacity
    }
  };
}

async function verifyGeneratedProjectItemsReadBack(scenario, expected) {
  const found = await callBridgeTool("find_project_items", {
    query: expected.renamedReplacementName,
    type: "comp",
    exactName: true,
    caseSensitive: true,
    limit: 5
  });
  const renamed = found.matches && found.matches[0];
  if (!renamed || !renamed.itemIndex) {
    throw new Error(`${scenario.id}: renamed generated replacement comp was not found by read-back.`);
  }
  const folder = await callBridgeTool("list_project_folder_items", {
    folderName: expected.folderName,
    recursive: true,
    type: "comp",
    limit: 20
  });
  const folderItems = Array.isArray(folder.items) ? folder.items : [];
  if (!folderItems.some((item) => item.name === expected.renamedReplacementName)) {
    throw new Error(`${scenario.id}: generated folder did not contain renamed replacement comp; saw ${folderItems.map((item) => item.name).join(", ") || "no comp items"}.`);
  }
  const compMatch = await findGeneratedCompByExactName(scenario, expected.mainCompName);
  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: true,
    layerLimit: 10
  });
  const layers = Array.isArray(comp.layers) ? comp.layers : [];
  const layer = layers.find((item) => (
    item.name === expected.layerName ||
    (item.source && (item.source.name === expected.renamedReplacementName || item.source.name === expected.replacementName))
  ));
  if (!layer || !layer.index) {
    const observed = layers.map((item) => `${item.name}${item.source && item.source.name ? ` -> ${item.source.name}` : ""}`);
    throw new Error(`${scenario.id}: generated project-items source layer was not found by read-back; saw ${observed.join(", ") || "no layers"}.`);
  }
  return {
    ok: true,
    folder: {
      name: expected.folderName,
      containsComp: expected.renamedReplacementName,
      returned: folder.returned
    },
    mainComp: {
      itemIndex: comp.itemIndex,
      name: comp.name,
      layerName: layer.name
    },
    renamedReplacement: {
      itemIndex: renamed.itemIndex,
      name: renamed.name
    }
  };
}

async function verifyGeneratedProjectItemMetadataReadBack(scenario, expected) {
  const itemNames = Array.isArray(expected.itemNames) ? expected.itemNames : [];
  if (!itemNames.length) {
    throw new Error(`${scenario.id}: expected generated project item names were not configured.`);
  }
  const items = [];
  for (const itemName of itemNames) {
    const found = await callBridgeTool("find_project_items", {
      query: itemName,
      type: "comp",
      exactName: true,
      caseSensitive: true,
      limit: 5
    });
    const match = found.matches && found.matches[0];
    if (!match || !match.itemIndex) {
      throw new Error(`${scenario.id}: generated project item ${itemName} was not found by exact-name read-back.`);
    }
    if (!numbersMatch(Number(expected.label), Number(match.label), 0)) {
      throw new Error(`${scenario.id}: generated project item ${itemName} label read-back mismatch; expected ${expected.label}, got ${match.label}.`);
    }
    items.push({
      itemIndex: match.itemIndex,
      name: match.name,
      type: match.type || null,
      label: match.label
    });
  }
  return {
    ok: true,
    items
  };
}

async function verifyGeneratedCompositionVersionReadBack(scenario, expected) {
  const found = await callBridgeTool("find_project_items", {
    query: expected.base,
    type: "comp",
    caseSensitive: true,
    limit: 10
  });
  const matches = Array.isArray(found.matches) ? found.matches : [];
  const names = matches.map((item) => item.name);
  const missingRenamed = expected.renamedNames.filter((name) => !names.includes(name));
  if (missingRenamed.length) {
    throw new Error(`${scenario.id}: renamed generated versioned comp(s) missing: ${missingRenamed.join(", ")}.`);
  }
  const staleNames = expected.originalNames.filter((name) => names.includes(name));
  if (staleNames.length) {
    throw new Error(`${scenario.id}: stale generated version token name(s) remained: ${staleNames.join(", ")}.`);
  }
  const compMatch = await findGeneratedCompByExactName(scenario, expected.renamedNames[0]);
  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: false
  });
  return {
    ok: true,
    comp: {
      itemIndex: comp.itemIndex,
      name: comp.name,
      numLayers: comp.numLayers
    },
    renamedNames: expected.renamedNames.slice(),
    returned: found.returned
  };
}

function renderQueueOutputPath(item) {
  const modules = Array.isArray(item && item.outputModules) ? item.outputModules : [];
  const first = modules.find((outputModule) => outputModule && typeof outputModule.file === "string");
  return first ? first.file : "";
}

async function verifyGeneratedRenderQueueReadBack(scenario, expected) {
  const status = await callBridgeTool("get_render_queue_status", { limit: Math.max(20, Number(expected.renderQueueItemIndex || 0) + 5) });
  const items = Array.isArray(status.items) ? status.items : [];
  const item = items.find((candidate) => renderQueueItemCompName(candidate) === expected.compName);
  if (!item) {
    throw new Error(`${scenario.id}: generated render queue item for ${expected.compName} was not found by read-back.`);
  }
  const outputPath = renderQueueOutputPath(item);
  if (expected.outputPath) {
    const normalizedOutput = outputPath.replace(/\\/g, "/");
    const normalizedExpected = String(expected.outputPath || "").replace(/\\/g, "/");
    if (!normalizedOutput.endsWith(normalizedExpected)) {
      throw new Error(`${scenario.id}: generated render queue output mismatch; expected suffix ${normalizedExpected}, got ${outputPath || "empty output path"}.`);
    }
  }
  return {
    ok: true,
    renderQueueItem: {
      index: item.index,
      compName: expected.compName,
      outputPath
    },
    totalItems: status.totalItems
  };
}

function effectPropertyValuePreview(value) {
  if (value && Object.prototype.hasOwnProperty.call(value, "value")) return value.value;
  return value;
}

function effectPropertyMatchesExpected(property, expected) {
  if (!property) return false;
  if (Array.isArray(expected.color)) {
    const expectedColor = numberPreviewArray(expected.color);
    const actualColor = numberPreviewArray(property.value);
    const compareLength = Math.min(expectedColor.length, actualColor.length);
    return compareLength >= 3 &&
      expectedColor.slice(0, compareLength).every((value, index) => numbersMatch(value, actualColor[index], 0.02));
  }
  if (Object.prototype.hasOwnProperty.call(expected, "value")) {
    const actualValue = effectPropertyValuePreview(property.value);
    if (typeof expected.value === "boolean") {
      return actualValue === expected.value || Boolean(Number(actualValue)) === expected.value;
    }
    if (typeof expected.value === "number") return numbersMatch(expected.value, actualValue, 0.001);
    return String(actualValue) === String(expected.value);
  }
  return false;
}

function findEffectProperty(properties, expected) {
  for (const item of properties || []) {
    if (expected.propertyMatchName && item.matchName === expected.propertyMatchName) return item;
    if (expected.propertyName && item.name === expected.propertyName) return item;
    if (expected.propertyIndex && Number(item.propertyIndex || item.index) === Number(expected.propertyIndex)) return item;
    const child = findEffectProperty(item.children || [], expected);
    if (child) return child;
  }
  return null;
}

function effectPropertyValueMatches(properties, expected) {
  const property = findEffectProperty(properties, expected);
  if (!property) return false;
  return effectPropertyMatchesExpected(property, expected);
}

async function verifyGeneratedEffectPropertyReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const details = await callBridgeTool("get_effect_details", {
    compItemIndex: compMatch.itemIndex,
    layerIndex: 1,
    effectName: expected.effectName,
    includeProperties: true,
    propertyDepth: 5,
    propertyLimit: 160,
    includeValues: true,
    includeExpressions: true
  });
  if (!details || !details.effect) {
    throw new Error(`${scenario.id}: generated effect ${expected.effectName} was not found by read-back.`);
  }
  if (expected.effectMatchName && details.effect.matchName !== expected.effectMatchName) {
    throw new Error(`${scenario.id}: generated effect matchName mismatch; expected ${expected.effectMatchName}, got ${details.effect.matchName}.`);
  }
  if (!effectPropertyValueMatches(details.properties, expected)) {
    throw new Error(`${scenario.id}: generated effect property value was not found by read-back.`);
  }
  return {
    ok: true,
    effect: {
      name: details.effect.name,
      matchName: details.effect.matchName,
      propertiesReturned: details.propertiesReturned
    }
  };
}

async function verifyGeneratedEffectEnabledReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const details = await callBridgeTool("get_effect_details", {
    compItemIndex: compMatch.itemIndex,
    layerIndex: 1,
    effectName: expected.effectName,
    effectMatchName: expected.effectMatchName,
    includeProperties: false
  });
  if (!details || !details.effect) {
    throw new Error(`${scenario.id}: generated effect ${expected.effectName} was not found by read-back.`);
  }
  if (expected.effectMatchName && details.effect.matchName !== expected.effectMatchName) {
    throw new Error(`${scenario.id}: generated effect matchName mismatch; expected ${expected.effectMatchName}, got ${details.effect.matchName}.`);
  }
  if (details.effect.enabled !== expected.enabled) {
    throw new Error(`${scenario.id}: generated effect enabled mismatch; expected ${expected.enabled}, got ${details.effect.enabled}.`);
  }

  const layerDetails = await callBridgeTool("get_layer_details", {
    compItemIndex: compMatch.itemIndex,
    layerIndex: 1,
    includeProperties: false
  });
  const effects = Array.isArray(layerDetails.effects) ? layerDetails.effects : [];
  const layerEffect = effects.find((effect) => (
    effect.name === expected.effectName &&
    (!expected.effectMatchName || effect.matchName === expected.effectMatchName)
  ));
  if (!layerEffect) {
    throw new Error(`${scenario.id}: generated effect ${expected.effectName} was not present in layer read-back.`);
  }
  if (layerEffect.enabled !== expected.enabled) {
    throw new Error(`${scenario.id}: layer read-back effect enabled mismatch; expected ${expected.enabled}, got ${layerEffect.enabled}.`);
  }

  return {
    ok: true,
    effect: {
      name: details.effect.name,
      matchName: details.effect.matchName,
      enabled: details.effect.enabled
    },
    layerEffect: {
      name: layerEffect.name,
      matchName: layerEffect.matchName,
      enabled: layerEffect.enabled
    }
  };
}

function propertyPathMatches(actualPath, expectedPath) {
  if (!Array.isArray(actualPath) || !Array.isArray(expectedPath)) return false;
  if (actualPath.length < expectedPath.length) return false;
  const tail = actualPath.slice(actualPath.length - expectedPath.length);
  return expectedPath.every((expectedSegment, index) => {
    const segment = tail[index] || {};
    if (expectedSegment && typeof expectedSegment === "object") {
      const expectedMatchName = expectedSegment.matchName || "";
      const expectedName = expectedSegment.name || "";
      return Boolean(expectedMatchName && segment.matchName === expectedMatchName) ||
        Boolean(expectedName && segment.name === expectedName);
    }
    return segment.matchName === expectedSegment || segment.name === expectedSegment;
  });
}

function findPropertyInTree(properties, expectedPath) {
  for (const property of properties || []) {
    if (propertyPathMatches(property.propertyPath, expectedPath)) {
      return property;
    }
    const child = findPropertyInTree(property.children || [], expectedPath);
    if (child) return child;
  }
  return null;
}

async function verifyGeneratedExpressionReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const selected = await callBridgeTool("get_selected_properties", {
    includeValues: true,
    includeExpressions: true
  });
  if (!selected || !selected.comp || selected.comp.name !== expected.compName) {
    throw new Error(`${scenario.id}: get_selected_properties did not read the generated comp context.`);
  }

  const details = await callBridgeTool("get_layer_details", {
    compItemIndex: compMatch.itemIndex,
    layerIndex: 1,
    includeProperties: true,
    propertyDepth: 2,
    propertyLimit: 80,
    includeExpressions: true
  });
  const layer = details && details.layer ? details.layer : {};
  if (layer.name !== expected.layerName) {
    throw new Error(`${scenario.id}: generated expression layer ${expected.layerName} was not found by read-back.`);
  }
  const property = findPropertyInTree(details.propertyTree || [], expected.propertyPath);
  if (!property) {
    throw new Error(`${scenario.id}: generated expression property was not found by read-back.`);
  }
  if (property.expression) {
    throw new Error(`${scenario.id}: generated expression was not cleared by final read-back.`);
  }
  if (property.expressionEnabled === true) {
    throw new Error(`${scenario.id}: generated expression remained enabled after clear_expression.`);
  }

  return {
    ok: true,
    comp: {
      itemIndex: compMatch.itemIndex,
      name: compMatch.name,
      selectedPropertyCount: Array.isArray(selected.selectedProperties) ? selected.selectedProperties.length : 0
    },
    layer: {
      index: layer.index,
      name: layer.name
    },
    expression: {
      propertyPath: expected.propertyPath,
      setExpression: expected.expression,
      cleared: true
    }
  };
}

async function verifyGeneratedParametricAnchorExpressionReadBack(scenario, expected) {
  const targets = Array.isArray(expected.targets) ? expected.targets : [];
  const verifiedTargets = [];
  for (const target of targets) {
    const { comp, layer, property } = await readGeneratedLayerProperty(scenario, {
      compName: expected.compName,
      layerName: target.layerName,
      propertyPath: target.propertyPath
    }, { propertyDepth: 4, propertyLimit: 160 });
    if (target.matchName && property.matchName !== target.matchName) {
      throw new Error(`${scenario.id}: parametric anchor matchName mismatch for ${target.layerName}; expected ${target.matchName}, got ${property.matchName || "empty"}.`);
    }
    if (property.expression !== expected.expression) {
      throw new Error(`${scenario.id}: parametric anchor expression mismatch for ${target.layerName}; expected ${expected.expression}, got ${property.expression || "empty"}.`);
    }
    if (property.expressionEnabled !== true) {
      throw new Error(`${scenario.id}: parametric anchor expression was not enabled for ${target.layerName}.`);
    }
    if (property.expressionError) {
      throw new Error(`${scenario.id}: parametric anchor expression reported an error for ${target.layerName}: ${property.expressionError}.`);
    }
    verifiedTargets.push({
      comp: { itemIndex: comp.itemIndex, name: comp.name },
      layer: { index: layer.index, name: layer.name },
      property: {
        path: target.propertyPath,
        matchName: property.matchName,
        expressionEnabled: property.expressionEnabled === true
      }
    });
  }
  if (verifiedTargets.length !== targets.length || verifiedTargets.length === 0) {
    throw new Error(`${scenario.id}: no parametric anchor expression targets were verified.`);
  }
  return {
    ok: true,
    anchorPositionKey: expected.anchorPositionKey,
    expression: expected.expression,
    targets: verifiedTargets
  };
}

async function verifyGeneratedSelectedPropertyValueReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const selected = await callBridgeTool("get_selected_properties", {
    includeValues: true,
    includeExpressions: true
  });
  if (!selected || !selected.comp || selected.comp.name !== expected.compName) {
    throw new Error(`${scenario.id}: get_selected_properties did not read the generated comp context.`);
  }

  const details = await callBridgeTool("get_layer_details", {
    compItemIndex: compMatch.itemIndex,
    layerIndex: 1,
    includeProperties: true,
    propertyDepth: 2,
    propertyLimit: 80,
    includeValues: true,
    includeExpressions: true
  });
  const layer = details && details.layer ? details.layer : {};
  if (layer.name !== expected.layerName) {
    throw new Error(`${scenario.id}: generated selected-property layer ${expected.layerName} was not found by read-back.`);
  }
  const property = findPropertyInTree(details.propertyTree || [], expected.propertyPath);
  if (!property) {
    throw new Error(`${scenario.id}: generated selected-property value target was not found by read-back.`);
  }
  const observedValue = valuePreviewNumber(property.value);
  if (!numbersMatch(expected.value, observedValue, 0.01)) {
    throw new Error(`${scenario.id}: generated property value mismatch; expected ${expected.value}, got ${observedValue}.`);
  }

  return {
    ok: true,
    comp: {
      itemIndex: compMatch.itemIndex,
      name: compMatch.name,
      selectedPropertyCount: Array.isArray(selected.selectedProperties) ? selected.selectedProperties.length : 0
    },
    layer: {
      index: layer.index,
      name: layer.name
    },
    property: {
      propertyPath: expected.propertyPath,
      value: observedValue
    }
  };
}

async function verifyGeneratedLayerSwitchReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: true,
    layerLimit: 20
  });
  const layers = Array.isArray(comp.layers) ? comp.layers : [];
  const listedLayer = layers.find((layer) => layer.name === expected.layerName);
  if (!listedLayer || !listedLayer.index) {
    throw new Error(`${scenario.id}: generated layer-switch layer ${expected.layerName} was not found by comp read-back.`);
  }

  const details = await callBridgeTool("get_layer_details", {
    compItemIndex: compMatch.itemIndex,
    layerIndex: listedLayer.index,
    includeProperties: false
  });
  const layer = details && details.layer ? details.layer : {};
  const switches = expected.switches || {};
  for (const field of ["collapseTransformation", "motionBlur"]) {
    if (switches[field] === true && layer[field] !== true) {
      throw new Error(`${scenario.id}: generated layer switch ${field} was not enabled by read-back.`);
    }
  }

  return {
    ok: true,
    comp: {
      itemIndex: compMatch.itemIndex,
      name: compMatch.name
    },
    layer: {
      index: listedLayer.index,
      name: layer.name,
      collapseTransformation: layer.collapseTransformation === true,
      motionBlur: layer.motionBlur === true
    }
  };
}

async function verifyGeneratedLayerMetadataReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: true,
    layerLimit: 20
  });
  const layers = Array.isArray(comp.layers) ? comp.layers : [];
  const targetLayerIndices = Array.isArray(expected.targetLayerIndices) ? expected.targetLayerIndices : [];
  const targetLayerNames = Array.isArray(expected.targetLayerNames) ? expected.targetLayerNames : [];
  const metadata = expected.metadata || {};
  const verifiedLayers = [];

  for (let index = 0; index < targetLayerIndices.length; index += 1) {
    const layerIndex = targetLayerIndices[index];
    const layerName = targetLayerNames[index] || "";
    const listedLayer = layers.find((layer) => layer.index === layerIndex && (!layerName || layer.name === layerName));
    if (!listedLayer) {
      throw new Error(`${scenario.id}: generated metadata layer ${layerIndex} ${layerName} was not found by comp read-back.`);
    }

    const details = await callBridgeTool("get_layer_details", {
      compItemIndex: compMatch.itemIndex,
      layerIndex,
      includeProperties: false
    });
    const layer = details && details.layer ? details.layer : {};
    if (layerName && layer.name !== layerName) {
      throw new Error(`${scenario.id}: metadata layer ${layerIndex} name mismatch: ${layer.name}.`);
    }
    if (layer.comment !== metadata.comment) {
      throw new Error(`${scenario.id}: metadata layer ${layerIndex} comment was not read back.`);
    }
    if (Number(layer.label) !== Number(metadata.label)) {
      throw new Error(`${scenario.id}: metadata layer ${layerIndex} label was not read back.`);
    }
    if (layer.locked !== metadata.locked) {
      throw new Error(`${scenario.id}: metadata layer ${layerIndex} locked state was not read back.`);
    }
    verifiedLayers.push({
      index: layer.index,
      name: layer.name,
      comment: layer.comment,
      label: layer.label,
      locked: layer.locked
    });
  }

  return {
    ok: true,
    comp: {
      itemIndex: compMatch.itemIndex,
      name: compMatch.name
    },
    layers: verifiedLayers
  };
}

async function verifyGeneratedLayerEnabledHardSoloReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const selectedLayerIndices = Array.isArray(expected.selectedLayerIndices) ? expected.selectedLayerIndices.map(Number) : [];
  const selectedLayerNames = Array.isArray(expected.selectedLayerNames) ? expected.selectedLayerNames.map(String) : [];
  const disabledLayerIndices = Array.isArray(expected.disabledLayerIndices) ? expected.disabledLayerIndices.map(Number) : [];
  const disabledLayerNames = Array.isArray(expected.disabledLayerNames) ? expected.disabledLayerNames.map(String) : [];
  const checks = [
    ...selectedLayerIndices.map((layerIndex, index) => ({
      layerIndex,
      layerName: selectedLayerNames[index] || "",
      expectedEnabled: true
    })),
    ...disabledLayerIndices.map((layerIndex, index) => ({
      layerIndex,
      layerName: disabledLayerNames[index] || "",
      expectedEnabled: false
    }))
  ];
  const verifiedLayers = [];

  for (const check of checks) {
    const details = await callBridgeTool("get_layer_details", {
      compItemIndex: compMatch.itemIndex,
      layerIndex: check.layerIndex,
      includeProperties: false
    });
    const layer = details && details.layer ? details.layer : {};
    if (check.layerName && layer.name !== check.layerName) {
      throw new Error(`${scenario.id}: hard-solo layer ${check.layerIndex} name mismatch: ${layer.name}.`);
    }
    if (layer.enabled !== check.expectedEnabled) {
      throw new Error(`${scenario.id}: hard-solo layer ${check.layerIndex} enabled mismatch; expected ${check.expectedEnabled}, got ${layer.enabled}.`);
    }
    verifiedLayers.push({
      index: layer.index,
      name: layer.name,
      enabled: layer.enabled
    });
  }

  return {
    ok: true,
    comp: {
      itemIndex: compMatch.itemIndex,
      name: compMatch.name
    },
    layers: verifiedLayers
  };
}

async function verifyGeneratedLayerDifferenceBlendModeReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const targetLayerIndices = Array.isArray(expected.targetLayerIndices) ? expected.targetLayerIndices.map(Number) : [];
  const targetLayerNames = Array.isArray(expected.targetLayerNames) ? expected.targetLayerNames.map(String) : [];
  const expectedMode = String(expected.blendingMode || "difference").toLowerCase();
  const verifiedLayers = [];

  for (let index = 0; index < targetLayerIndices.length; index += 1) {
    const layerIndex = targetLayerIndices[index];
    const layerName = targetLayerNames[index] || "";
    const details = await callBridgeTool("get_layer_details", {
      compItemIndex: compMatch.itemIndex,
      layerIndex,
      includeProperties: false
    });
    const layer = details && details.layer ? details.layer : {};
    if (layerName && layer.name !== layerName) {
      throw new Error(`${scenario.id}: difference blend layer ${layerIndex} name mismatch: ${layer.name}.`);
    }
    const observedMode = String(layer.blendingModeName || "").toLowerCase();
    if (observedMode !== expectedMode) {
      throw new Error(`${scenario.id}: difference blend layer ${layerIndex} mode mismatch; expected ${expectedMode}, got ${observedMode || "missing"}.`);
    }
    verifiedLayers.push({
      index: layer.index,
      name: layer.name,
      blendingModeName: layer.blendingModeName
    });
  }

  return {
    ok: true,
    comp: {
      itemIndex: compMatch.itemIndex,
      name: compMatch.name
    },
    layers: verifiedLayers
  };
}

async function verifyGeneratedLayerSelectionReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const selected = await callBridgeTool("get_selected_layers", {});
  if (!selected || !selected.comp || selected.comp.name !== expected.compName) {
    throw new Error(`${scenario.id}: get_selected_layers did not read the generated comp context.`);
  }
  const selectedLayers = Array.isArray(selected.selectedLayers) ? selected.selectedLayers : [];
  const selectedIndices = selectedLayers.map((layer) => Number(layer.index));
  const selectedNames = selectedLayers.map((layer) => String(layer.name || ""));
  const expectedIndices = (expected.selectedLayerIndices || []).map(Number);
  const expectedNames = (expected.selectedLayerNames || []).map(String);
  const indicesMatch = expectedIndices.length === selectedIndices.length &&
    expectedIndices.every((value, index) => selectedIndices[index] === value);
  const namesMatch = expectedNames.length === selectedNames.length &&
    expectedNames.every((value, index) => selectedNames[index] === value);
  if (!indicesMatch || !namesMatch) {
    throw new Error(`${scenario.id}: selected-layer read-back mismatch; expected ${expectedNames.join(", ")}, got ${selectedNames.join(", ")}.`);
  }

  const details = await callBridgeTool("get_layer_details", {
    compItemIndex: compMatch.itemIndex,
    layerIndex: expectedIndices[0],
    includeProperties: false
  });
  const layer = details && details.layer ? details.layer : {};
  if (layer.name !== expectedNames[0]) {
    throw new Error(`${scenario.id}: selected layer detail read-back mismatch; expected ${expectedNames[0]}, got ${layer.name || "missing"}.`);
  }

  return {
    ok: true,
    comp: {
      itemIndex: compMatch.itemIndex,
      name: compMatch.name
    },
    selection: {
      selectedIndices,
      selectedNames
    },
    layer: {
      index: layer.index,
      name: layer.name
    }
  };
}

async function verifyGeneratedKeyframeReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const selected = await callBridgeTool("get_selected_properties", {
    includeValues: true,
    includeExpressions: true
  });
  if (!selected || !selected.comp || selected.comp.name !== expected.compName) {
    throw new Error(`${scenario.id}: get_selected_properties did not read the generated comp context.`);
  }

  const details = await callBridgeTool("get_layer_details", {
    compItemIndex: compMatch.itemIndex,
    layerIndex: 1,
    includeProperties: true,
    propertyDepth: 2,
    propertyLimit: 80,
    includeValues: true,
    includeExpressions: true
  });
  const layer = details && details.layer ? details.layer : {};
  if (layer.name !== expected.layerName) {
    throw new Error(`${scenario.id}: generated keyframe layer ${expected.layerName} was not found by read-back.`);
  }
  const property = findPropertyInTree(details.propertyTree || [], expected.propertyPath);
  if (!property) {
    throw new Error(`${scenario.id}: generated keyframe property was not found by read-back.`);
  }
  if (Number(property.numKeys || 0) !== Number(expected.keyframeCount || 0)) {
    throw new Error(`${scenario.id}: expected ${expected.keyframeCount} generated keyframe(s), got ${property.numKeys || 0}.`);
  }

  return {
    ok: true,
    comp: {
      itemIndex: compMatch.itemIndex,
      name: compMatch.name,
      selectedPropertyCount: Array.isArray(selected.selectedProperties) ? selected.selectedProperties.length : 0
    },
    layer: {
      index: layer.index,
      name: layer.name
    },
    keyframes: {
      propertyPath: expected.propertyPath,
      count: Number(property.numKeys || 0),
      easedKeyIndices: expected.keyIndices || [],
      interpolation: expected.interpolation || null
    }
  };
}

async function readGeneratedLayerProperty(scenario, expected, options = {}) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: true,
    layerLimit: 20
  });
  const layers = Array.isArray(comp.layers) ? comp.layers : [];
  const listedLayer = layers.find((layer) => layer.name === expected.layerName);
  if (!listedLayer || !listedLayer.index) {
    throw new Error(`${scenario.id}: generated layer ${expected.layerName} was not found by read-back.`);
  }
  const details = await callBridgeTool("get_layer_details", {
    compItemIndex: compMatch.itemIndex,
    layerIndex: listedLayer.index,
    includeProperties: true,
    propertyDepth: options.propertyDepth || 2,
    propertyLimit: options.propertyLimit || 120,
    includeValues: true,
    includeExpressions: true
  });
  const property = findPropertyInTree(details.propertyTree || [], expected.propertyPath);
  if (!property) {
    throw new Error(`${scenario.id}: generated property ${expected.propertyPath.join(".")} was not found by read-back.`);
  }
  return { comp: compMatch, layer: details.layer || listedLayer, property, details };
}

async function verifyGeneratedEssentialGraphicsControllerReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: true,
    layerLimit: 20
  });
  const layers = Array.isArray(comp.layers) ? comp.layers : [];
  const listedLayer = layers.find((layer) => layer.name === expected.layerName);
  if (!listedLayer || !listedLayer.index) {
    throw new Error(`${scenario.id}: generated Essential Graphics layer ${expected.layerName} was not found by read-back.`);
  }

  const controllers = await callBridgeTool("get_essential_graphics_controllers", {
    compItemIndex: compMatch.itemIndex
  });
  const controllerItems = Array.isArray(controllers.controllers) ? controllers.controllers : [];
  const controller = controllerItems.find((item) => item.name === expected.controllerName);
  if (!controller) {
    throw new Error(`${scenario.id}: generated Essential Graphics controller ${expected.controllerName} was not found by read-back.`);
  }

  const details = await callBridgeTool("get_layer_details", {
    compItemIndex: compMatch.itemIndex,
    layerIndex: listedLayer.index,
    includeProperties: true,
    propertyDepth: 2,
    propertyLimit: 80,
    includeValues: true,
    includeExpressions: true
  });
  const layer = details && details.layer ? details.layer : {};
  if (layer.name !== expected.layerName) {
    throw new Error(`${scenario.id}: generated Essential Graphics layer mismatch; expected ${expected.layerName}, got ${layer.name || "missing"}.`);
  }
  const property = findPropertyInTree(details.propertyTree || [], [
    "ADBE Transform Group",
    expected.propertyMatchName
  ]);
  if (!property || property.matchName !== expected.propertyMatchName) {
    throw new Error(`${scenario.id}: generated Essential Graphics source property ${expected.propertyMatchName} was not found by read-back.`);
  }

  return {
    ok: true,
    comp: {
      itemIndex: compMatch.itemIndex,
      name: compMatch.name,
      controllerCount: controllers.controllerCount
    },
    layer: {
      index: layer.index,
      name: layer.name
    },
    controller: {
      index: controller.index,
      name: controller.name
    },
    property: {
      matchName: property.matchName,
      name: property.name
    }
  };
}

async function verifyGeneratedCameraControllerReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: true,
    layerLimit: 20
  });
  const layers = Array.isArray(comp.layers) ? comp.layers : [];
  const camera = layers.find((layer) => layer.name === expected.cameraName);
  const controller = layers.find((layer) => layer.name === expected.controllerName);
  if (!camera || !controller) {
    throw new Error(`${scenario.id}: generated camera/controller layers were not found by read-back.`);
  }
  const cameraDetails = await callBridgeTool("get_layer_details", {
    compItemIndex: compMatch.itemIndex,
    layerIndex: camera.index,
    includeProperties: false
  });
  const controllerDetails = await callBridgeTool("get_layer_details", {
    compItemIndex: compMatch.itemIndex,
    layerIndex: controller.index,
    includeProperties: true,
    propertyDepth: 2,
    propertyLimit: 80,
    includeValues: true
  });
  const parent = cameraDetails.layer && cameraDetails.layer.parent ? cameraDetails.layer.parent : {};
  if (parent.name !== expected.controllerName) {
    throw new Error(`${scenario.id}: camera parent mismatch; expected ${expected.controllerName}, got ${parent.name || "none"}.`);
  }
  if (!controllerDetails.layer || controllerDetails.layer.threeDLayer !== true) {
    throw new Error(`${scenario.id}: controller was not read back as 3D.`);
  }
  const zoom = valuePreviewNumber(cameraDetails.camera && cameraDetails.camera.zoom);
  if (typeof expected.cameraZoom === "number" && !numbersMatch(expected.cameraZoom, zoom, 0.01)) {
    throw new Error(`${scenario.id}: camera zoom mismatch; expected ${expected.cameraZoom}, got ${zoom}.`);
  }
  return {
    ok: true,
    comp: { itemIndex: compMatch.itemIndex, name: compMatch.name },
    camera: { index: camera.index, name: camera.name, parent: parent.name, zoom },
    controller: { index: controller.index, name: controller.name, threeDLayer: true }
  };
}

async function verifyGeneratedParentOpacityExpressionReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: true,
    layerLimit: 20
  });
  const layers = Array.isArray(comp.layers) ? comp.layers : [];
  const childName = expected.childName || expected.cameraName;
  const parentName = expected.parentName || expected.controllerName;
  const child = layers.find((layer) => layer.name === childName);
  const controller = layers.find((layer) => layer.name === parentName);
  if (!child || !controller) {
    throw new Error(`${scenario.id}: generated parent-opacity child/controller layers were not found by read-back.`);
  }
  const details = await callBridgeTool("get_layer_details", {
    compItemIndex: compMatch.itemIndex,
    layerIndex: child.index,
    includeProperties: true,
    propertyDepth: 2,
    propertyLimit: 80,
    includeValues: true,
    includeExpressions: true
  });
  const parent = details.layer && details.layer.parent ? details.layer.parent : {};
  if (parent.name !== parentName) {
    throw new Error(`${scenario.id}: parent-opacity parent mismatch; expected ${parentName}, got ${parent.name || "none"}.`);
  }
  const property = findPropertyInTree(details.propertyTree || [], expected.propertyPath);
  if (!property) {
    throw new Error(`${scenario.id}: parent-opacity property was not found by read-back.`);
  }
  if (property.expression !== expected.expression) {
    throw new Error(`${scenario.id}: parent-opacity expression mismatch; expected ${expected.expression}, got ${property.expression || "empty"}.`);
  }
  if (property.expressionEnabled !== true) {
    throw new Error(`${scenario.id}: parent-opacity expression was not enabled by read-back.`);
  }
  if (property.expressionError) {
    throw new Error(`${scenario.id}: parent-opacity expression reported an error: ${property.expressionError}.`);
  }
  return {
    ok: true,
    comp: { itemIndex: compMatch.itemIndex, name: compMatch.name },
    child: { index: child.index, name: child.name, parent: parent.name },
    property: {
      path: expected.propertyPath,
      expression: property.expression,
      expressionEnabled: property.expressionEnabled === true
    }
  };
}

async function verifyGeneratedLayerParentBelowReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: true,
    layerLimit: 20
  });
  const layers = Array.isArray(comp.layers) ? comp.layers : [];
  const pairs = Array.isArray(expected.parentPairs) ? expected.parentPairs : [];
  if (!pairs.length) {
    throw new Error(`${scenario.id}: no expected layer-below parent pairs were provided.`);
  }

  const readBackPairs = [];
  for (const pair of pairs) {
    const child = layers.find((layer) => layer.name === pair.childName);
    const parentLayer = layers.find((layer) => layer.name === pair.parentName);
    if (!child || !parentLayer) {
      throw new Error(`${scenario.id}: generated child/parent pair was not found for ${pair.childName} -> ${pair.parentName}.`);
    }
    const details = await callBridgeTool("get_layer_details", {
      compItemIndex: compMatch.itemIndex,
      layerIndex: child.index,
      includeProperties: false
    });
    const parent = details.layer && details.layer.parent ? details.layer.parent : {};
    if (parent.name !== pair.parentName) {
      throw new Error(`${scenario.id}: layer-below parent mismatch for ${pair.childName}; expected ${pair.parentName}, got ${parent.name || "none"}.`);
    }
    if (Number(parent.index) !== Number(parentLayer.index)) {
      throw new Error(`${scenario.id}: layer-below parent index mismatch for ${pair.childName}; expected ${parentLayer.index}, got ${parent.index || "none"}.`);
    }
    readBackPairs.push({
      child: { index: child.index, name: child.name },
      parent: { index: parent.index, name: parent.name }
    });
  }

  return {
    ok: true,
    comp: { itemIndex: compMatch.itemIndex, name: compMatch.name },
    pairs: readBackPairs
  };
}

async function verifyGeneratedLayerParentClosestReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: true,
    layerLimit: 20
  });
  const layers = Array.isArray(comp.layers) ? comp.layers : [];
  const pairs = Array.isArray(expected.parentPairs) ? expected.parentPairs : [];
  if (!pairs.length) {
    throw new Error(`${scenario.id}: no expected closest-layer parent pairs were provided.`);
  }

  const readBackPairs = [];
  for (const pair of pairs) {
    const child = layers.find((layer) => layer.name === pair.childName);
    const parentLayer = layers.find((layer) => layer.name === pair.parentName);
    if (!child || !parentLayer) {
      throw new Error(`${scenario.id}: generated closest child/parent pair was not found for ${pair.childName} -> ${pair.parentName}.`);
    }
    const details = await callBridgeTool("get_layer_details", {
      compItemIndex: compMatch.itemIndex,
      layerIndex: child.index,
      includeProperties: false
    });
    const parent = details.layer && details.layer.parent ? details.layer.parent : {};
    if (parent.name !== pair.parentName) {
      throw new Error(`${scenario.id}: closest-layer parent mismatch for ${pair.childName}; expected ${pair.parentName}, got ${parent.name || "none"}.`);
    }
    if (Number(parent.index) !== Number(parentLayer.index)) {
      throw new Error(`${scenario.id}: closest-layer parent index mismatch for ${pair.childName}; expected ${parentLayer.index}, got ${parent.index || "none"}.`);
    }
    readBackPairs.push({
      child: { index: child.index, name: child.name },
      parent: { index: parent.index, name: parent.name },
      expectedDistancePx: pair.distancePx
    });
  }

  return {
    ok: true,
    comp: { itemIndex: compMatch.itemIndex, name: compMatch.name },
    pairs: readBackPairs
  };
}

async function verifyGeneratedStickEffectExpressionReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const effectDetails = await callBridgeTool("get_effect_details", {
    compItemIndex: compMatch.itemIndex,
    layerIndex: 1,
    effectName: expected.effectName,
    includeProperties: true,
    propertyDepth: 1,
    propertyLimit: 20,
    includeValues: true,
    includeExpressions: true
  });
  if (!effectDetails || !effectDetails.effect) {
    throw new Error(`${scenario.id}: generated stick-effect effect ${expected.effectName} was not found by read-back.`);
  }
  if (expected.effectMatchName && effectDetails.effect.matchName !== expected.effectMatchName) {
    throw new Error(`${scenario.id}: stick-effect matchName mismatch; expected ${expected.effectMatchName}, got ${effectDetails.effect.matchName}.`);
  }
  const effectProperty = findPropertyInTree(effectDetails.properties || [], expected.propertyPath);
  if (!effectProperty) {
    throw new Error(`${scenario.id}: generated stick-effect property was not found by effect read-back.`);
  }
  if (effectProperty.expression !== expected.expression) {
    throw new Error(`${scenario.id}: stick-effect expression mismatch; expected ${expected.expression}, got ${effectProperty.expression || "empty"}.`);
  }
  if (effectProperty.expressionEnabled !== true) {
    throw new Error(`${scenario.id}: stick-effect expression was not enabled by effect read-back.`);
  }
  if (effectProperty.expressionError) {
    throw new Error(`${scenario.id}: stick-effect expression reported an error: ${effectProperty.expressionError}.`);
  }

  const layerDetails = await callBridgeTool("get_layer_details", {
    compItemIndex: compMatch.itemIndex,
    layerIndex: 1,
    includeProperties: true,
    propertyDepth: 3,
    propertyLimit: 120,
    includeValues: true,
    includeExpressions: true
  });
  const layer = layerDetails && layerDetails.layer ? layerDetails.layer : {};
  if (layer.name !== expected.layerName) {
    throw new Error(`${scenario.id}: generated stick-effect layer ${expected.layerName} was not found by read-back.`);
  }
  const layerProperty = findPropertyInTree(layerDetails.propertyTree || [], expected.propertyPath);
  if (!layerProperty || layerProperty.expression !== expected.expression) {
    throw new Error(`${scenario.id}: generated stick-effect expression was not found by layer read-back.`);
  }

  return {
    ok: true,
    comp: { itemIndex: compMatch.itemIndex, name: compMatch.name },
    layer: { index: layer.index, name: layer.name },
    effect: { name: effectDetails.effect.name, matchName: effectDetails.effect.matchName },
    property: {
      path: expected.propertyPath,
      expression: effectProperty.expression,
      expressionEnabled: effectProperty.expressionEnabled === true
    }
  };
}

async function verifyGeneratedEstimatePathLengthReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: true,
    layerLimit: 20
  });
  const layers = Array.isArray(comp.layers) ? comp.layers : [];
  const listedLayer = layers.find((layer) => layer.name === expected.layerName);
  if (!listedLayer || !listedLayer.index) {
    throw new Error(`${scenario.id}: generated path-length layer ${expected.layerName} was not found by read-back.`);
  }

  const samplesDetails = await callBridgeTool("get_effect_details", {
    compItemIndex: compMatch.itemIndex,
    layerIndex: listedLayer.index,
    effectName: expected.samplesEffectName,
    includeProperties: true,
    propertyDepth: 1,
    propertyLimit: 20,
    includeValues: true,
    includeExpressions: true
  });
  if (!samplesDetails || !samplesDetails.effect) {
    throw new Error(`${scenario.id}: generated Path Samples effect was not found by read-back.`);
  }
  if (samplesDetails.effect.matchName !== "ADBE Slider Control") {
    throw new Error(`${scenario.id}: Path Samples effect matchName mismatch; got ${samplesDetails.effect.matchName}.`);
  }
  const samplesProperty = findPropertyInTree(samplesDetails.properties || [], expected.samplesPropertyPath);
  if (!samplesProperty) {
    throw new Error(`${scenario.id}: generated Path Samples slider property was not found by read-back.`);
  }
  const samplesValue = valuePreviewNumber(samplesProperty.value);
  if (!numbersMatch(expected.samplesValue, samplesValue, 0.01)) {
    throw new Error(`${scenario.id}: Path Samples value mismatch; expected ${expected.samplesValue}, got ${samplesValue}.`);
  }

  const lengthDetails = await callBridgeTool("get_effect_details", {
    compItemIndex: compMatch.itemIndex,
    layerIndex: listedLayer.index,
    effectName: expected.lengthEffectName,
    includeProperties: true,
    propertyDepth: 1,
    propertyLimit: 20,
    includeValues: true,
    includeExpressions: true
  });
  if (!lengthDetails || !lengthDetails.effect) {
    throw new Error(`${scenario.id}: generated Path Length effect was not found by read-back.`);
  }
  if (lengthDetails.effect.matchName !== "ADBE Slider Control") {
    throw new Error(`${scenario.id}: Path Length effect matchName mismatch; got ${lengthDetails.effect.matchName}.`);
  }
  const lengthProperty = findPropertyInTree(lengthDetails.properties || [], expected.propertyPath);
  if (!lengthProperty) {
    throw new Error(`${scenario.id}: generated Path Length slider property was not found by effect read-back.`);
  }
  if (lengthProperty.expression !== expected.expression) {
    throw new Error(`${scenario.id}: Path Length expression mismatch; expected ${expected.expression}, got ${lengthProperty.expression || "empty"}.`);
  }
  if (lengthProperty.expressionEnabled !== true) {
    throw new Error(`${scenario.id}: Path Length expression was not enabled by effect read-back.`);
  }
  if (lengthProperty.expressionError) {
    throw new Error(`${scenario.id}: Path Length expression reported an error: ${lengthProperty.expressionError}.`);
  }
  const lengthValue = valuePreviewNumber(lengthProperty.value);
  if (typeof expected.minLengthValue === "number" && typeof expected.maxLengthValue === "number") {
    if (typeof lengthValue !== "number" || lengthValue < expected.minLengthValue || lengthValue > expected.maxLengthValue) {
      throw new Error(`${scenario.id}: Path Length value mismatch; expected ${expected.minLengthValue}-${expected.maxLengthValue}, got ${lengthValue}.`);
    }
  }

  const layerDetails = await callBridgeTool("get_layer_details", {
    compItemIndex: compMatch.itemIndex,
    layerIndex: listedLayer.index,
    includeProperties: true,
    propertyDepth: 4,
    propertyLimit: 180,
    includeValues: true,
    includeExpressions: true
  });
  const layer = layerDetails && layerDetails.layer ? layerDetails.layer : {};
  if (layer.name !== expected.layerName) {
    throw new Error(`${scenario.id}: generated path-length layer ${expected.layerName} was not found by layer read-back.`);
  }
  const layerEffects = Array.isArray(layerDetails.effects) ? layerDetails.effects : [];
  const layerSamplesEffect = layerEffects.find((effect) => effect.name === expected.samplesEffectName);
  const layerLengthEffect = layerEffects.find((effect) => effect.name === expected.lengthEffectName);
  if (!layerSamplesEffect || !layerLengthEffect) {
    throw new Error(`${scenario.id}: generated Path Samples/Path Length effects were not found by layer read-back.`);
  }

  return {
    ok: true,
    comp: { itemIndex: compMatch.itemIndex, name: compMatch.name, numLayers: comp.numLayers },
    layer: {
      index: layer.index,
      name: layer.name,
      effects: layerEffects.map((effect) => ({ name: effect.name, matchName: effect.matchName }))
    },
    samples: {
      effectName: samplesDetails.effect.name,
      matchName: samplesDetails.effect.matchName,
      value: samplesValue
    },
    length: {
      effectName: lengthDetails.effect.name,
      matchName: lengthDetails.effect.matchName,
      value: lengthValue,
      expression: lengthProperty.expression,
      expressionEnabled: lengthProperty.expressionEnabled === true
    }
  };
}

async function verifyGeneratedOnionSkinningReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: true,
    layerLimit: 20
  });
  const layer = (Array.isArray(comp.layers) ? comp.layers : []).find((item) => item.name === expected.layerName);
  if (!layer || !layer.index) {
    throw new Error(`${scenario.id}: generated onion skin layer was not found by read-back.`);
  }
  const details = await callBridgeTool("get_effect_details", {
    compItemIndex: compMatch.itemIndex,
    layerIndex: layer.index,
    effectName: expected.effectName,
    includeProperties: true,
    includeValues: true,
    propertyDepth: 1,
    propertyLimit: 80
  });
  const effectText = `${details.effect && details.effect.name || ""} ${details.effect && details.effect.matchName || ""}`;
  if (!/wide time/i.test(effectText)) {
    throw new Error(`${scenario.id}: CC Wide Time effect was not found by read-back; got ${effectText || "missing"}.`);
  }
  return {
    ok: true,
    comp: { itemIndex: compMatch.itemIndex, name: compMatch.name },
    layer: { index: layer.index, name: layer.name },
    effect: { name: details.effect.name, matchName: details.effect.matchName, propertiesReturned: details.propertiesReturned }
  };
}

async function verifyGeneratedFillInKeyframesReadBack(scenario, expected) {
  const { comp, layer, property } = await readGeneratedLayerProperty(scenario, expected, { propertyDepth: 2, propertyLimit: 100 });
  const count = Number(property.numKeys || 0);
  if (count < Number(expected.minKeyframeCount || 1)) {
    throw new Error(`${scenario.id}: expected at least ${expected.minKeyframeCount} filled keyframes, got ${count}.`);
  }
  if (property.expression) {
    throw new Error(`${scenario.id}: fill_in_keyframes did not clear expression by read-back.`);
  }
  return {
    ok: true,
    comp: { itemIndex: comp.itemIndex, name: comp.name },
    layer: { index: layer.index, name: layer.name },
    keyframes: { count, propertyPath: expected.propertyPath }
  };
}

async function verifyGeneratedCurrentExpressionKeyframeReadBack(scenario, expected) {
  const { comp, layer, property } = await readGeneratedLayerProperty(scenario, expected, { propertyDepth: 2, propertyLimit: 100 });
  const keyframes = Array.isArray(property.keyframes) ? property.keyframes : [];
  const keyframe = keyframes.find((item) => numbersMatch(expected.keyframeTime, item.time, 0.001));
  if (!keyframe) {
    throw new Error(`${scenario.id}: expected expression snapshot keyframe at ${expected.keyframeTime}.`);
  }
  if (typeof expected.keyframeValue === "number" && !numbersMatch(expected.keyframeValue, keyframe.value, 0.01)) {
    throw new Error(`${scenario.id}: expression snapshot value mismatch; expected ${expected.keyframeValue}, got ${keyframe.value}.`);
  }
  return {
    ok: true,
    comp: { itemIndex: comp.itemIndex, name: comp.name },
    layer: { index: layer.index, name: layer.name },
    keyframe: { time: keyframe.time, value: keyframe.value }
  };
}

function sourceTextValue(value) {
  if (value && typeof value === "object" && !Array.isArray(value) && value.text !== undefined) {
    return String(value.text);
  }
  return value === undefined || value === null ? "" : String(value);
}

async function verifyGeneratedSourceTextKeyframesReadBack(scenario, expected) {
  const { comp, layer, property } = await readGeneratedLayerProperty(scenario, expected, { propertyDepth: 2, propertyLimit: 100 });
  const expectedKeyframes = Array.isArray(expected.keyframes) ? expected.keyframes : [];
  const keyframes = Array.isArray(property.keyframes) ? property.keyframes : [];
  if (Number(property.numKeys || 0) !== expectedKeyframes.length) {
    throw new Error(`${scenario.id}: expected ${expectedKeyframes.length} Source Text keyframe(s), got ${property.numKeys || 0}.`);
  }
  const observed = [];
  for (const item of expectedKeyframes) {
    const keyframe = keyframes.find((candidate) => numbersMatch(item.time, candidate.time, 0.001));
    if (!keyframe) {
      throw new Error(`${scenario.id}: Source Text keyframe at ${item.time} was not found by read-back.`);
    }
    const expectedText = sourceTextValue(item.value);
    const observedText = sourceTextValue(keyframe.value);
    if (observedText !== expectedText) {
      throw new Error(`${scenario.id}: Source Text keyframe text mismatch at ${item.time}; expected ${expectedText}, got ${observedText}.`);
    }
    observed.push({ time: keyframe.time, text: observedText });
  }
  return {
    ok: true,
    comp: { itemIndex: comp.itemIndex, name: comp.name },
    layer: { index: layer.index, name: layer.name },
    keyframes: observed
  };
}

async function verifyGeneratedSpatialInTangentReadBack(scenario, expected) {
  const { comp, layer, property } = await readGeneratedLayerProperty(scenario, expected, { propertyDepth: 2, propertyLimit: 100 });
  const keyframes = Array.isArray(property.keyframes) ? property.keyframes : [];
  const keyframe = keyframes.find((item) => Number(item.index) === Number(expected.keyIndex));
  if (!keyframe) {
    throw new Error(`${scenario.id}: expected keyframe ${expected.keyIndex} for spatial tangent read-back.`);
  }
  if (!numberArraysMatch(expected.inSpatialTangent, keyframe.inSpatialTangent, 0.001)) {
    throw new Error(`${scenario.id}: spatial in tangent mismatch; expected ${expected.inSpatialTangent}, got ${keyframe.inSpatialTangent || "missing"}.`);
  }
  return {
    ok: true,
    comp: { itemIndex: comp.itemIndex, name: comp.name },
    layer: { index: layer.index, name: layer.name },
    keyframe: { index: keyframe.index, inSpatialTangent: keyframe.inSpatialTangent }
  };
}

async function verifyGeneratedSeparateShapeSizeDimensionsReadBack(scenario, expected) {
  const { comp, layer, property, details } = await readGeneratedLayerProperty(scenario, expected, { propertyDepth: 4, propertyLimit: 180 });
  const expression = String(property.expression || "");
  if (!expression.includes(expected.xSliderName) || !expression.includes(expected.ySliderName)) {
    throw new Error(`${scenario.id}: separate size expression did not reference both slider names.`);
  }
  const effects = Array.isArray(details.effects) ? details.effects : [];
  const effectNames = effects.map((effect) => effect.name);
  if (!effectNames.includes(expected.xSliderName) || !effectNames.includes(expected.ySliderName)) {
    throw new Error(`${scenario.id}: separate size sliders were not found by read-back.`);
  }
  return {
    ok: true,
    comp: { itemIndex: comp.itemIndex, name: comp.name },
    layer: { index: layer.index, name: layer.name },
    sliders: effectNames.filter((name) => name === expected.xSliderName || name === expected.ySliderName),
    expressionPresent: true
  };
}

async function verifyGeneratedCompPropertiesReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: false
  });
  const props = expected.compProperties || {};
  for (const field of ["width", "height", "pixelAspect", "duration", "frameRate", "displayStartTime"]) {
    if (typeof props[field] === "number" && !numbersMatch(props[field], comp[field], 0.01)) {
      throw new Error(`${scenario.id}: generated comp ${field} mismatch; expected ${props[field]}, got ${comp[field]}.`);
    }
  }
  if (Array.isArray(props.bgColor) && !numberArraysMatch(props.bgColor, comp.bgColor, 0.01)) {
    throw new Error(`${scenario.id}: generated comp bgColor read-back mismatch.`);
  }
  const workArea = expected.workArea || {};
  if (typeof workArea.start === "number" && !numbersMatch(workArea.start, comp.workAreaStart, 0.01)) {
    throw new Error(`${scenario.id}: generated comp workAreaStart mismatch; expected ${workArea.start}, got ${comp.workAreaStart}.`);
  }
  if (typeof workArea.duration === "number" && !numbersMatch(workArea.duration, comp.workAreaDuration, 0.01)) {
    throw new Error(`${scenario.id}: generated comp workAreaDuration mismatch; expected ${workArea.duration}, got ${comp.workAreaDuration}.`);
  }

  return {
    ok: true,
    comp: {
      itemIndex: comp.itemIndex,
      name: comp.name,
      width: comp.width,
      height: comp.height,
      duration: comp.duration,
      frameRate: comp.frameRate,
      displayStartTime: comp.displayStartTime,
      workAreaStart: comp.workAreaStart,
      workAreaDuration: comp.workAreaDuration
    }
  };
}

async function verifyGeneratedCompCurrentTimeReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: false
  });
  const frameRate = typeof expected.frameRate === "number" ? expected.frameRate : comp.frameRate;
  const finalTime = typeof expected.frameTargetTime === "number"
    ? expected.frameTargetTime
    : Number(expected.frameTarget) / Number(frameRate);

  if (!Number.isFinite(Number(comp.time))) {
    throw new Error(`${scenario.id}: generated comp current time was not returned by get_comp_details.`);
  }
  if (typeof expected.frameRate === "number" && !numbersMatch(expected.frameRate, comp.frameRate, 0.001)) {
    throw new Error(`${scenario.id}: generated comp frameRate mismatch; expected ${expected.frameRate}, got ${comp.frameRate}.`);
  }
  if (!Number.isFinite(finalTime)) {
    throw new Error(`${scenario.id}: expected generated comp final time is not finite.`);
  }
  if (!numbersMatch(finalTime, comp.time, 0.001)) {
    throw new Error(`${scenario.id}: generated comp current time mismatch; expected ${finalTime}, got ${comp.time}.`);
  }
  if (typeof expected.firstTargetTime === "number" && finalTime <= expected.firstTargetTime) {
    throw new Error(`${scenario.id}: generated comp frame-derived final time did not advance past first target time.`);
  }
  if (typeof comp.duration === "number" && comp.time > comp.duration + 0.001) {
    throw new Error(`${scenario.id}: generated comp current time exceeded duration; time ${comp.time}, duration ${comp.duration}.`);
  }

  return {
    ok: true,
    comp: {
      itemIndex: comp.itemIndex,
      name: comp.name,
      duration: comp.duration,
      frameRate: comp.frameRate,
      time: comp.time
    },
    currentTime: {
      firstTargetTime: expected.firstTargetTime,
      frameTarget: expected.frameTarget,
      frameRate,
      finalTime
    }
  };
}

async function verifyAssortedCompositionGuidesReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: true,
    layerLimit: 30
  });
  const layers = Array.isArray(comp.layers) ? comp.layers : [];
  const names = layers.map((layer) => layer.name);
  const expectedGuides = Array.isArray(expected.guideSpecs) ? expected.guideSpecs : [];

  if (typeof expected.layerCountAfter === "number" && Number(comp.numLayers) !== expected.layerCountAfter) {
    throw new Error(`${scenario.id}: expected ${expected.layerCountAfter} generated guide layer(s), got ${comp.numLayers}.`);
  }

  for (const guide of expectedGuides) {
    if (!names.includes(guide.name)) {
      throw new Error(`${scenario.id}: generated guide overlay ${guide.name} was not found by read-back.`);
    }
  }

  const details = [];
  for (const guide of expectedGuides) {
    const layer = layers.find((item) => item.name === guide.name);
    if (!layer || !layer.index) {
      throw new Error(`${scenario.id}: generated guide overlay ${guide.name} has no readable layer index.`);
    }
    const layerDetails = await callBridgeTool("get_layer_details", {
      compItemIndex: compMatch.itemIndex,
      layerIndex: layer.index,
      includeProperties: false
    });
    const position = numberPreviewArray(layerDetails.transform && layerDetails.transform.position);
    if (!numberArraysMatch(guide.position, position, 0.01)) {
      throw new Error(`${scenario.id}: generated guide overlay ${guide.name} position read-back mismatch.`);
    }
    details.push({
      name: guide.name,
      index: layer.index,
      position
    });
  }

  const effectLayer = layers.find((item) => item.name === expected.effectLayerName);
  if (!effectLayer || !effectLayer.index) {
    throw new Error(`${scenario.id}: generated effect guide layer ${expected.effectLayerName} was not found by read-back.`);
  }
  const effectDetails = await callBridgeTool("get_layer_details", {
    compItemIndex: compMatch.itemIndex,
    layerIndex: effectLayer.index,
    includeProperties: false
  });
  const effects = Array.isArray(effectDetails.effects) ? effectDetails.effects : [];
  const effect = effects.find((item) => (
    item.name === expected.effectName &&
    (!expected.effectMatchName || item.matchName === expected.effectMatchName)
  ));
  if (!effect) {
    throw new Error(`${scenario.id}: generated guide effect ${expected.effectName} was not found by read-back.`);
  }

  return {
    ok: true,
    comp: {
      itemIndex: comp.itemIndex,
      name: comp.name,
      width: comp.width,
      height: comp.height,
      numLayers: comp.numLayers
    },
    guides: details,
    effect: {
      layerName: expected.effectLayerName,
      name: effect.name,
      matchName: effect.matchName
    }
  };
}

async function verifyCompositionGuideReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: true,
    layerLimit: 10
  });
  const layers = Array.isArray(comp.layers) ? comp.layers : [];
  const guide = layers.find((layer) => layer.name === expected.guideName);
  if (!guide || !guide.index) {
    throw new Error(`${scenario.id}: generated composition guide layer ${expected.guideName} was not found by read-back.`);
  }
  if (typeof expected.layerCountAfter === "number" && Number(comp.numLayers) !== expected.layerCountAfter) {
    throw new Error(`${scenario.id}: expected ${expected.layerCountAfter} generated composition guide layer(s), got ${comp.numLayers}.`);
  }

  const layerDetails = await callBridgeTool("get_layer_details", {
    compItemIndex: compMatch.itemIndex,
    layerIndex: guide.index,
    includeProperties: false
  });
  const position = numberPreviewArray(layerDetails.transform && layerDetails.transform.position);
  if (!numberArraysMatch(expected.guidePosition, position, 0.01)) {
    throw new Error(`${scenario.id}: generated composition guide position read-back mismatch.`);
  }

  return {
    ok: true,
    comp: {
      itemIndex: comp.itemIndex,
      name: comp.name,
      width: comp.width,
      height: comp.height,
      numLayers: comp.numLayers
    },
    guide: {
      name: guide.name,
      index: guide.index,
      guideLayer: layerDetails.guideLayer,
      position,
      requestedSize: expected.guideSize,
      requestedStrokeColor: expected.strokeColor,
      requestedStrokeWidth: expected.strokeWidth
    }
  };
}

async function verifyGeneratedBackgroundLayerReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: true,
    layerLimit: 10
  });
  const layers = Array.isArray(comp.layers) ? comp.layers : [];
  const background = layers.find((layer) => layer.name === expected.backgroundName);
  const foreground = layers.find((layer) => layer.name === expected.foregroundName);
  if (!background || !background.index) {
    throw new Error(`${scenario.id}: generated background layer ${expected.backgroundName} was not found by read-back.`);
  }
  if (!foreground || !foreground.index) {
    throw new Error(`${scenario.id}: generated foreground proof layer ${expected.foregroundName} was not found by read-back.`);
  }
  if (typeof expected.layerCountAfter === "number" && Number(comp.numLayers) !== expected.layerCountAfter) {
    throw new Error(`${scenario.id}: expected ${expected.layerCountAfter} generated layer(s), got ${comp.numLayers}.`);
  }
  if (typeof expected.backgroundIndexAfter === "number" && Number(background.index) !== expected.backgroundIndexAfter) {
    throw new Error(`${scenario.id}: expected generated background layer index ${expected.backgroundIndexAfter}, got ${background.index}.`);
  }
  if (typeof expected.foregroundIndexAfter === "number" && Number(foreground.index) !== expected.foregroundIndexAfter) {
    throw new Error(`${scenario.id}: expected generated foreground layer index ${expected.foregroundIndexAfter}, got ${foreground.index}.`);
  }

  const layerDetails = await callBridgeTool("get_layer_details", {
    compItemIndex: compMatch.itemIndex,
    layerIndex: background.index,
    includeProperties: false
  });
  const position = numberPreviewArray(layerDetails.transform && layerDetails.transform.position);
  if (!numberArraysMatch(expected.backgroundPosition, position, 0.01)) {
    throw new Error(`${scenario.id}: generated background position read-back mismatch.`);
  }
  const effects = Array.isArray(layerDetails.effects) ? layerDetails.effects : [];
  const effect = effects.find((item) => (
    item.name === expected.effectName &&
    (!expected.effectMatchName || item.matchName === expected.effectMatchName)
  ));
  if (!effect) {
    throw new Error(`${scenario.id}: generated background effect ${expected.effectName} was not found by read-back.`);
  }

  return {
    ok: true,
    comp: {
      itemIndex: comp.itemIndex,
      name: comp.name,
      width: comp.width,
      height: comp.height,
      numLayers: comp.numLayers
    },
    layers: {
      background: {
        name: background.name,
        index: background.index,
        position
      },
      foreground: {
        name: foreground.name,
        index: foreground.index
      }
    },
    effect: {
      layerName: expected.backgroundName,
      name: effect.name,
      matchName: effect.matchName
    }
  };
}

async function findGeneratedCompByExactName(scenario, compName) {
  const found = await callBridgeTool("find_project_items", {
    query: compName,
    type: "comp",
    exactName: true,
    caseSensitive: true,
    limit: 5
  });
  const compMatch = found.matches && found.matches[0];
  if (!compMatch || !compMatch.itemIndex) {
    throw new Error(`${scenario.id}: generated comp ${compName} was not found by exact-name read-back.`);
  }
  return compMatch;
}

async function verifyFolderMoveReadBack(scenario, expected) {
  const folder = await callBridgeTool("list_project_folder_items", {
    folderName: expected.folderName,
    recursive: false,
    type: "comp",
    limit: 20
  });
  const folderItems = Array.isArray(folder.items) ? folder.items : [];
  const folderComp = folderItems.find((item) => item.name === expected.compName);
  if (!folderComp) {
    throw new Error(`${scenario.id}: generated folder does not contain comp ${expected.compName}.`);
  }
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);

  return {
    ok: true,
    folder: {
      name: expected.folderName,
      returned: folder.returned,
      containsComp: folderComp.name
    },
    comp: {
      itemIndex: compMatch.itemIndex,
      name: compMatch.name,
      type: compMatch.type || null
    }
  };
}

async function verifyExactProjectItemSearchReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  return {
    ok: true,
    comp: {
      itemIndex: compMatch.itemIndex,
      name: compMatch.name,
      type: compMatch.type || null
    }
  };
}

async function verifyMarkerReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: true,
    layerLimit: 20
  });
  const layers = Array.isArray(comp.layers) ? comp.layers : [];
  const layer = layers.find((item) => item.name === expected.layerName);
  if (!layer || !layer.index) {
    throw new Error(`${scenario.id}: generated marker target layer was not found by read-back.`);
  }

  const layerDetails = await callBridgeTool("get_layer_details", {
    compName: expected.compName,
    layerIndex: layer.index,
    includeProperties: false
  });
  const markers = layerDetails.markers || {};
  const items = Array.isArray(markers.items) ? markers.items : [];
  const marker = items.find((item) => (
    item.comment === expected.markerComment &&
    Math.abs(Number(item.time) - Number(expected.markerTime)) <= 0.001
  ));
  if (!marker) {
    throw new Error(`${scenario.id}: generated marker ${expected.markerComment} was not found by read-back.`);
  }
  if (typeof expected.markerDuration === "number" && Math.abs(Number(marker.duration) - expected.markerDuration) > 0.001) {
    throw new Error(`${scenario.id}: generated marker duration mismatch; expected ${expected.markerDuration}, got ${marker.duration}.`);
  }

  return {
    ok: true,
    comp: {
      itemIndex: comp.itemIndex,
      name: comp.name,
      numLayers: comp.numLayers
    },
    layer: {
      index: layer.index,
      name: layer.name
    },
    marker: {
      comment: marker.comment,
      time: marker.time,
      duration: marker.duration
    }
  };
}

function findMarkerByCommentTime(items, expectedMarker) {
  return (items || []).find((item) => (
    item.comment === expectedMarker.comment &&
    Math.abs(Number(item.time) - Number(expectedMarker.time)) <= 0.001
  ));
}

function verifyCompositionMarkerCollection(scenario, markers, expected) {
  const items = Array.isArray(markers.items) ? markers.items : [];
  if (expected.orderedBy && markers.orderedBy !== expected.orderedBy) {
    throw new Error(`${scenario.id}: expected markers orderedBy ${expected.orderedBy}, got ${markers.orderedBy}.`);
  }
  if (typeof expected.markerCount === "number" && Number(markers.count || 0) !== expected.markerCount) {
    throw new Error(`${scenario.id}: expected ${expected.markerCount} composition markers, got ${markers.count}.`);
  }
  for (let index = 1; index < items.length; index += 1) {
    if (Number(items[index].time) < Number(items[index - 1].time)) {
      throw new Error(`${scenario.id}: composition markers were not returned in nondecreasing keyTime order.`);
    }
  }
  if (Array.isArray(expected.markers)) {
    for (const expectedMarker of expected.markers) {
      const marker = findMarkerByCommentTime(items, expectedMarker);
      if (!marker) {
        throw new Error(`${scenario.id}: expected composition marker ${expectedMarker.comment} at ${expectedMarker.time} was not found by read-back.`);
      }
      if (typeof expectedMarker.duration === "number" && Math.abs(Number(marker.duration) - expectedMarker.duration) > 0.001) {
        throw new Error(`${scenario.id}: expected composition marker duration ${expectedMarker.duration}, got ${marker.duration}.`);
      }
    }
  }
  return items;
}

async function verifyCompositionMarkerReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: false,
    includeMarkers: true,
    markerLimit: 10
  });
  const markers = comp.markers || {};
  verifyCompositionMarkerCollection(scenario, markers, expected);

  return {
    ok: true,
    comp: {
      itemIndex: comp.itemIndex,
      name: comp.name
    },
    markers: {
      count: markers.count || 0,
      returned: markers.returned || 0,
      orderedBy: markers.orderedBy || null,
      matched: Array.isArray(expected.markers) ? expected.markers.length : null
    }
  };
}

async function verifyCompositionMarkerWorkAreaReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: false,
    includeMarkers: true,
    markerLimit: 10
  });
  const markers = comp.markers || {};
  verifyCompositionMarkerCollection(scenario, markers, {
    markerCount: expected.markerCount
  });
  const workArea = expected.workArea || {};
  if (typeof workArea.start === "number" && !numbersMatch(workArea.start, comp.workAreaStart, 0.001)) {
    throw new Error(`${scenario.id}: expected workAreaStart ${workArea.start}, got ${comp.workAreaStart}.`);
  }
  if (typeof workArea.duration === "number" && !numbersMatch(workArea.duration, comp.workAreaDuration, 0.001)) {
    throw new Error(`${scenario.id}: expected workAreaDuration ${workArea.duration}, got ${comp.workAreaDuration}.`);
  }

  return {
    ok: true,
    comp: {
      itemIndex: comp.itemIndex,
      name: comp.name,
      workAreaStart: comp.workAreaStart,
      workAreaDuration: comp.workAreaDuration
    },
    markers: {
      count: markers.count || 0,
      returned: markers.returned || 0
    }
  };
}

async function verifyCompositionLayerMarkerCopyReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: true,
    includeMarkers: true,
    markerLimit: 10,
    layerLimit: 20
  });
  const layers = Array.isArray(comp.layers) ? comp.layers : [];
  const layer = layers.find((item) => item.name === expected.layerName);
  if (!layer || !layer.index) {
    throw new Error(`${scenario.id}: generated marker copy layer ${expected.layerName} was not found by read-back.`);
  }
  const compMarkers = comp.markers || {};
  verifyCompositionMarkerCollection(scenario, compMarkers, {
    markerCount: expected.compositionMarkerCount,
    markers: [expected.compToLayerMarker, expected.layerToCompMarker].filter(Boolean)
  });

  const layerDetails = await callBridgeTool("get_layer_details", {
    compItemIndex: compMatch.itemIndex,
    layerIndex: layer.index,
    includeProperties: false
  });
  const layerMarkers = layerDetails.markers || {};
  const layerItems = Array.isArray(layerMarkers.items) ? layerMarkers.items : [];
  if (typeof expected.layerMarkerCount === "number" && Number(layerMarkers.count || 0) !== expected.layerMarkerCount) {
    throw new Error(`${scenario.id}: expected ${expected.layerMarkerCount} layer markers, got ${layerMarkers.count}.`);
  }
  for (const expectedMarker of [expected.compToLayerMarker, expected.layerToCompMarker].filter(Boolean)) {
    const marker = findMarkerByCommentTime(layerItems, expectedMarker);
    if (!marker) {
      throw new Error(`${scenario.id}: expected layer marker ${expectedMarker.comment} at ${expectedMarker.time} was not found by read-back.`);
    }
    if (typeof expectedMarker.duration === "number" && Math.abs(Number(marker.duration) - expectedMarker.duration) > 0.001) {
      throw new Error(`${scenario.id}: expected layer marker duration ${expectedMarker.duration}, got ${marker.duration}.`);
    }
  }

  return {
    ok: true,
    comp: {
      itemIndex: comp.itemIndex,
      name: comp.name
    },
    layer: {
      index: layer.index,
      name: layer.name
    },
    compositionMarkers: {
      count: compMarkers.count || 0,
      returned: compMarkers.returned || 0
    },
    layerMarkers: {
      count: layerMarkers.count || 0,
      returned: layerMarkers.returned || 0
    }
  };
}

async function verifyCompositionMarkerAddReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: true,
    includeMarkers: true,
    markerLimit: 10,
    layerLimit: 20
  });
  const layer = (Array.isArray(comp.layers) ? comp.layers : []).find((item) => item.name === expected.layerName);
  if (!layer || !layer.index) {
    throw new Error(`${scenario.id}: generated marker source layer ${expected.layerName} was not found by read-back.`);
  }
  const markers = comp.markers || {};
  verifyCompositionMarkerCollection(scenario, markers, expected);

  return {
    ok: true,
    comp: {
      itemIndex: comp.itemIndex,
      name: comp.name
    },
    layer: {
      index: layer.index,
      name: layer.name,
      outPoint: layer.outPoint
    },
    markers: {
      count: markers.count || 0,
      returned: markers.returned || 0,
      matched: Array.isArray(expected.markers) ? expected.markers.length : null
    }
  };
}

function shapeGeometryMatches(expected, observed) {
  return Boolean(expected) &&
    Boolean(observed) &&
    observed.closed === expected.closed &&
    pointsMatch(expected.vertices, observed.vertices) &&
    pointsMatch(expected.inTangents, observed.inTangents) &&
    pointsMatch(expected.outTangents, observed.outTangents);
}

function pathGeometryKeyframesMatch(expectedKeyframes, observedKeyframes) {
  if (!Array.isArray(expectedKeyframes) || !Array.isArray(observedKeyframes)) return false;
  if (observedKeyframes.length < expectedKeyframes.length) return false;
  return expectedKeyframes.every((expected) => {
    const observed = observedKeyframes.find((candidate) => numbersMatch(expected.time, candidate.time, 0.001));
    return Boolean(observed) && shapeGeometryMatches(expected.geometry, observed.geometry);
  });
}

async function verifyGeneratedPathGeometryReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: true,
    layerLimit: 20
  });
  const layer = (Array.isArray(comp.layers) ? comp.layers : []).find((item) => item.name === expected.layerName);
  if (!layer || !layer.index) {
    throw new Error(`${scenario.id}: generated path-geometry layer ${expected.layerName} was not found by read-back.`);
  }

  const pathDetails = await callBridgeTool("get_path_geometry", {
    compItemIndex: compMatch.itemIndex,
    layerIndex: layer.index,
    targetKind: "mask",
    maskIndex: 1,
    expectedMaskName: expected.maskName,
    includeKeyframes: true,
    keyframeLimit: 10
  });
  if (!pathDetails || !pathDetails.pathGeometry) {
    throw new Error(`${scenario.id}: get_path_geometry did not return path geometry read-back.`);
  }
  if (!pathDetails.mask || pathDetails.mask.name !== expected.maskName) {
    throw new Error(`${scenario.id}: generated path-geometry mask name mismatch.`);
  }
  const keyframes = Array.isArray(pathDetails.pathGeometry.keyframes) ? pathDetails.pathGeometry.keyframes : [];
  if (!pathGeometryKeyframesMatch(expected.keyframes, keyframes)) {
    throw new Error(`${scenario.id}: generated path-geometry keyframe geometry read-back mismatch.`);
  }

  return {
    ok: true,
    comp: { itemIndex: compMatch.itemIndex, name: compMatch.name },
    layer: { index: layer.index, name: layer.name },
    mask: { name: pathDetails.mask.name },
    keyframes: keyframes.map((item) => ({ index: item.index, time: item.time }))
  };
}

async function verifyGeneratedPathPointsExportReadBack(scenario, expected) {
  const generatedExportDir = process.env.AE_AGENT_GENERATED_EXPORT_DIR
    ? path.resolve(process.env.AE_AGENT_GENERATED_EXPORT_DIR)
    : path.join(__dirname, "..", "logs", "generated-exports");
  const outputPath = path.join(generatedExportDir, expected.outputFileName);
  if (!fs.existsSync(outputPath)) {
    throw new Error(`${scenario.id}: generated path-points export file was not found: ${outputPath}`);
  }
  const content = fs.readFileSync(outputPath, "utf8");
  if (content !== expected.expectedContent) {
    throw new Error(`${scenario.id}: generated path-points export content mismatch.`);
  }

  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: true,
    layerLimit: 20
  });
  const layer = (Array.isArray(comp.layers) ? comp.layers : []).find((item) => item.name === expected.layerName);
  if (!layer || !layer.index) {
    throw new Error(`${scenario.id}: generated export path layer ${expected.layerName} was not found by read-back.`);
  }

  const pathDetails = await callBridgeTool("get_path_geometry", {
    compItemIndex: compMatch.itemIndex,
    layerIndex: layer.index,
    targetKind: "mask",
    maskIndex: 1,
    expectedMaskName: expected.maskName,
    includeKeyframes: true,
    keyframeLimit: 10
  });
  if (!pathDetails || !pathDetails.pathGeometry || !shapeGeometryMatches(expected.geometry, pathDetails.pathGeometry.geometry)) {
    throw new Error(`${scenario.id}: generated path geometry changed or did not read back after export.`);
  }

  try {
    fs.unlinkSync(outputPath);
  } catch (_error) {}

  return {
    ok: true,
    comp: { itemIndex: compMatch.itemIndex, name: compMatch.name },
    layer: { index: layer.index, name: layer.name },
    outputFileName: expected.outputFileName,
    bytes: Buffer.byteLength(content, "utf8"),
    removedGeneratedExport: !fs.existsSync(outputPath)
  };
}

async function verifyCameraReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: true,
    layerLimit: 20
  });
  const layers = Array.isArray(comp.layers) ? comp.layers : [];
  const cameraLayer = layers.find((layer) => layer.name === expected.cameraName);
  if (!cameraLayer || !cameraLayer.index) {
    throw new Error(`${scenario.id}: generated camera layer was not found by read-back.`);
  }

  const layerDetails = await callBridgeTool("get_layer_details", {
    compName: expected.compName,
    layerIndex: cameraLayer.index,
    includeProperties: false
  });
  const zoom = valuePreviewNumber(layerDetails.camera && layerDetails.camera.zoom);
  if (typeof expected.cameraZoom === "number" && Math.abs(Number(zoom) - expected.cameraZoom) > 0.001) {
    throw new Error(`${scenario.id}: generated camera zoom read-back mismatch; expected ${expected.cameraZoom}, got ${zoom}.`);
  }

  return {
    ok: true,
    comp: {
      itemIndex: comp.itemIndex,
      name: comp.name,
      numLayers: comp.numLayers
    },
    camera: {
      layerIndex: cameraLayer.index,
      name: cameraLayer.name,
      zoom
    }
  };
}

async function verifyGeneratedAdjustmentLayerPlacementReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: true,
    layerLimit: 20
  });
  const layers = Array.isArray(comp.layers) ? comp.layers : [];
  const adjustment = layers.find((item) => item.name === expected.adjustmentName);
  const target = layers.find((item) => item.name === expected.targetName);
  const foreground = layers.find((item) => item.name === expected.foregroundName);
  if (!adjustment || !target || !foreground) {
    throw new Error(`${scenario.id}: expected adjustment placement layers were not all found by read-back.`);
  }
  if (adjustment.adjustmentLayer !== true) {
    throw new Error(`${scenario.id}: generated adjustment layer did not read back adjustmentLayer:true.`);
  }
  if (adjustment.index + 1 !== target.index) {
    throw new Error(`${scenario.id}: adjustment layer was not immediately above guarded target; adjustment index ${adjustment.index}, target index ${target.index}.`);
  }
  if (typeof expected.adjustmentLayerIndexAfter === "number" && adjustment.index !== expected.adjustmentLayerIndexAfter) {
    throw new Error(`${scenario.id}: adjustment index mismatch; expected ${expected.adjustmentLayerIndexAfter}, got ${adjustment.index}.`);
  }
  if (typeof expected.targetLayerIndexAfter === "number" && target.index !== expected.targetLayerIndexAfter) {
    throw new Error(`${scenario.id}: target index mismatch; expected ${expected.targetLayerIndexAfter}, got ${target.index}.`);
  }

  const adjustmentDetails = await callBridgeTool("get_layer_details", {
    compName: expected.compName,
    layerIndex: adjustment.index,
    includeProperties: false
  });
  const targetDetails = await callBridgeTool("get_layer_details", {
    compName: expected.compName,
    layerIndex: target.index,
    includeProperties: false
  });

  return {
    ok: true,
    comp: {
      itemIndex: comp.itemIndex,
      name: comp.name,
      numLayers: comp.numLayers
    },
    adjustment: {
      index: adjustment.index,
      name: adjustment.name,
      adjustmentLayer: adjustmentDetails.layer && adjustmentDetails.layer.adjustmentLayer === true
    },
    target: {
      index: target.index,
      name: target.name,
      readBackName: targetDetails.layer && targetDetails.layer.name
    },
    foreground: {
      index: foreground.index,
      name: foreground.name
    }
  };
}

async function verifyGeneratedLayerConnectionLineReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: true,
    layerLimit: 20
  });
  const layers = Array.isArray(comp.layers) ? comp.layers : [];
  const connector = layers.find((item) => item.name === expected.connectorName);
  const fromLayer = layers.find((item) => item.name === expected.fromName);
  const toLayer = layers.find((item) => item.name === expected.toName);
  if (!connector || !fromLayer || !toLayer) {
    throw new Error(`${scenario.id}: expected connection-line layers were not all found by read-back.`);
  }
  if (connector.locked !== true) {
    throw new Error(`${scenario.id}: generated connector layer did not read back locked:true.`);
  }
  if (typeof expected.connectorLayerIndex === "number" && connector.index !== expected.connectorLayerIndex) {
    throw new Error(`${scenario.id}: connector index mismatch; expected ${expected.connectorLayerIndex}, got ${connector.index}.`);
  }

  const connectorDetails = await callBridgeTool("get_layer_details", {
    compName: expected.compName,
    layerIndex: connector.index,
    includeProperties: true,
    propertyDepth: 5,
    propertyLimit: 120,
    includeValues: true,
    includeExpressions: true
  });
  function findConnectorPath(properties) {
    for (const property of properties || []) {
      if (property.matchName === "ADBE Vector Shape" && property.expressionEnabled === true) return property;
      const child = findConnectorPath(property.children || []);
      if (child) return child;
    }
    return null;
  }
  const pathProperty = findConnectorPath(connectorDetails.propertyTree || []);
  if (!pathProperty) {
    throw new Error(`${scenario.id}: generated connector path expression was not found by read-back.`);
  }
  if (pathProperty.expressionError) {
    throw new Error(`${scenario.id}: generated connector path expression reported an error: ${pathProperty.expressionError}`);
  }
  const geometry = pathProperty.value && pathProperty.value.kind === "Shape" ? pathProperty.value : null;
  if (!geometry || geometry.closed === true || Number(geometry.vertexCount || 0) !== 2) {
    throw new Error(`${scenario.id}: generated connector path did not read back as an open two-point path.`);
  }

  return {
    ok: true,
    comp: {
      itemIndex: comp.itemIndex,
      name: comp.name,
      numLayers: comp.numLayers
    },
    connector: {
      index: connector.index,
      name: connector.name,
      locked: connector.locked === true,
      expressionEnabled: pathProperty.expressionEnabled === true,
      vertexCount: geometry.vertexCount
    },
    targets: {
      from: { index: fromLayer.index, name: fromLayer.name },
      to: { index: toLayer.index, name: toLayer.name }
    }
  };
}

async function verifyGeneratedTextShapesFromTextReadBack(scenario, expected) {
  const compMatch = await findGeneratedCompByExactName(scenario, expected.compName);
  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: true,
    layerLimit: 20
  });
  const layers = Array.isArray(comp.layers) ? comp.layers : [];
  const shapeLayer = layers.find((item) => item.name === expected.shapeName);
  const sourceLayer = layers.find((item) => item.name === expected.sourceName);
  if (!shapeLayer || !sourceLayer) {
    throw new Error(`${scenario.id}: expected text-shape source and generated outline layers were not both found by read-back.`);
  }
  if (typeof expected.shapeLayerIndex === "number" && shapeLayer.index !== expected.shapeLayerIndex) {
    throw new Error(`${scenario.id}: generated outline layer index mismatch; expected ${expected.shapeLayerIndex}, got ${shapeLayer.index}.`);
  }
  if (!(shapeLayer.shapeLayer === true || shapeLayer.matchName === "ADBE Vector Layer" || shapeLayer.layerKind === "shape")) {
    throw new Error(`${scenario.id}: generated outline layer did not read back as a shape layer.`);
  }
  if (!(sourceLayer.textLayer === true || sourceLayer.matchName === "ADBE Text Layer" || sourceLayer.layerKind === "text")) {
    throw new Error(`${scenario.id}: source layer did not read back as a text layer.`);
  }

  const sourceDetails = await callBridgeTool("get_layer_details", {
    compName: expected.compName,
    layerIndex: sourceLayer.index,
    includeProperties: false
  });
  const observedSourceText = sourceTextValue(sourceDetails.text && sourceDetails.text.value !== undefined
    ? sourceDetails.text.value
    : sourceDetails.text);
  if (expected.sourceText && observedSourceText !== expected.sourceText) {
    throw new Error(`${scenario.id}: source text mismatch; expected ${expected.sourceText}, got ${observedSourceText}.`);
  }

  const shapeDetails = await callBridgeTool("get_layer_details", {
    compName: expected.compName,
    layerIndex: shapeLayer.index,
    includeProperties: true,
    propertyDepth: 5,
    propertyLimit: 160,
    includeValues: false,
    includeExpressions: true
  });
  const propertyTree = Array.isArray(shapeDetails.propertyTree) ? shapeDetails.propertyTree : [];
  if (!propertyTree.length) {
    throw new Error(`${scenario.id}: generated outline shape layer has no property tree read-back.`);
  }

  return {
    ok: true,
    comp: {
      itemIndex: comp.itemIndex,
      name: comp.name,
      numLayers: comp.numLayers
    },
    shapeLayer: {
      index: shapeLayer.index,
      name: shapeLayer.name,
      matchName: shapeLayer.matchName,
      propertyTreeCount: propertyTree.length
    },
    sourceLayer: {
      index: sourceLayer.index,
      name: sourceLayer.name,
      text: observedSourceText
    }
  };
}

async function verifyAgentScenarioReadBack(scenario) {
  const expected = scenario.expectedReadBack;
  if (!expected) return null;

  if (expected.folderMove) {
    return verifyFolderMoveReadBack(scenario, expected);
  }

  if (expected.exactProjectItemSearch) {
    return verifyExactProjectItemSearchReadBack(scenario, expected);
  }

  if (expected.markerReadBack) {
    return verifyMarkerReadBack(scenario, expected);
  }

  if (expected.compositionMarkerWorkAreaReadBack) {
    return verifyCompositionMarkerWorkAreaReadBack(scenario, expected);
  }

  if (expected.compositionLayerMarkerCopyReadBack) {
    return verifyCompositionLayerMarkerCopyReadBack(scenario, expected);
  }

  if (expected.compositionMarkerAddReadBack) {
    return verifyCompositionMarkerAddReadBack(scenario, expected);
  }

  if (expected.compositionMarkerReadBack) {
    return verifyCompositionMarkerReadBack(scenario, expected);
  }

  if (expected.generatedPathGeometry) {
    return verifyGeneratedPathGeometryReadBack(scenario, expected);
  }

  if (expected.generatedPathPointsExport) {
    return verifyGeneratedPathPointsExportReadBack(scenario, expected);
  }

  if (expected.cameraReadBack) {
    return verifyCameraReadBack(scenario, expected);
  }

  if (expected.duplicateLayers) {
    return verifyDuplicateLayersReadBack(scenario, expected);
  }

  if (expected.dakkshinTypedTools) {
    return verifyDakkshinTypedToolsReadBack(scenario, expected);
  }

  if (expected.resetWorkArea) {
    return verifyResetWorkAreaReadBack(scenario, expected);
  }

  if (expected.findReplaceLayerRename) {
    return verifyFindReplaceLayerRenameReadBack(scenario, expected);
  }

  if (expected.assortedCompositionGuides) {
    return verifyAssortedCompositionGuidesReadBack(scenario, expected);
  }

  if (expected.generatedCompositionGuide) {
    return verifyCompositionGuideReadBack(scenario, expected);
  }

  if (expected.generatedBackgroundLayer) {
    return verifyGeneratedBackgroundLayerReadBack(scenario, expected);
  }

  if (expected.generatedLayerTiming) {
    return verifyGeneratedLayerTimingReadBack(scenario, expected);
  }

  if (expected.generatedLayerTransform) {
    return verifyGeneratedLayerTransformReadBack(scenario, expected);
  }

  if (expected.generatedProjectItems) {
    return verifyGeneratedProjectItemsReadBack(scenario, expected);
  }

  if (expected.generatedProjectItemMetadata) {
    return verifyGeneratedProjectItemMetadataReadBack(scenario, expected);
  }

  if (expected.generatedCompositionVersionToken) {
    return verifyGeneratedCompositionVersionReadBack(scenario, expected);
  }

  if (expected.generatedRenderQueue) {
    return verifyGeneratedRenderQueueReadBack(scenario, expected);
  }

  if (expected.generatedEffectEnabled) {
    return verifyGeneratedEffectEnabledReadBack(scenario, expected);
  }

  if (expected.generatedEffectProperty) {
    return verifyGeneratedEffectPropertyReadBack(scenario, expected);
  }

  if (expected.generatedExpressionSetClear) {
    return verifyGeneratedExpressionReadBack(scenario, expected);
  }

  if (expected.generatedParametricAnchorExpression) {
    return verifyGeneratedParametricAnchorExpressionReadBack(scenario, expected);
  }

  if (expected.generatedSelectedPropertyValue) {
    return verifyGeneratedSelectedPropertyValueReadBack(scenario, expected);
  }

  if (expected.generatedLayerSwitches) {
    return verifyGeneratedLayerSwitchReadBack(scenario, expected);
  }

  if (expected.generatedLayerMetadata) {
    return verifyGeneratedLayerMetadataReadBack(scenario, expected);
  }

  if (expected.generatedLayerEnabledHardSolo) {
    return verifyGeneratedLayerEnabledHardSoloReadBack(scenario, expected);
  }

  if (expected.generatedLayerDifferenceBlendMode) {
    return verifyGeneratedLayerDifferenceBlendModeReadBack(scenario, expected);
  }

  if (expected.generatedAdjustmentLayerPlacement) {
    return verifyGeneratedAdjustmentLayerPlacementReadBack(scenario, expected);
  }

  if (expected.generatedLayerConnectionLine) {
    return verifyGeneratedLayerConnectionLineReadBack(scenario, expected);
  }

  if (expected.generatedTextShapesFromText) {
    return verifyGeneratedTextShapesFromTextReadBack(scenario, expected);
  }

  if (expected.generatedLayerSelection) {
    return verifyGeneratedLayerSelectionReadBack(scenario, expected);
  }

  if (expected.generatedKeyframeEase) {
    return verifyGeneratedKeyframeReadBack(scenario, expected);
  }

  if (expected.generatedSourceTextKeyframes) {
    return verifyGeneratedSourceTextKeyframesReadBack(scenario, expected);
  }

  if (expected.generatedCameraController) {
    return verifyGeneratedCameraControllerReadBack(scenario, expected);
  }

  if (expected.generatedEssentialGraphicsController) {
    return verifyGeneratedEssentialGraphicsControllerReadBack(scenario, expected);
  }

  if (expected.generatedParentOpacityExpression) {
    return verifyGeneratedParentOpacityExpressionReadBack(scenario, expected);
  }

  if (expected.generatedLayerParentBelow) {
    return verifyGeneratedLayerParentBelowReadBack(scenario, expected);
  }

  if (expected.generatedLayerParentClosest) {
    return verifyGeneratedLayerParentClosestReadBack(scenario, expected);
  }

  if (expected.generatedStickEffectExpression) {
    return verifyGeneratedStickEffectExpressionReadBack(scenario, expected);
  }

  if (expected.generatedEstimatePathLength) {
    return verifyGeneratedEstimatePathLengthReadBack(scenario, expected);
  }

  if (expected.generatedOnionSkinning) {
    return verifyGeneratedOnionSkinningReadBack(scenario, expected);
  }

  if (expected.generatedFillInKeyframes) {
    return verifyGeneratedFillInKeyframesReadBack(scenario, expected);
  }

  if (expected.generatedCurrentExpressionKeyframe) {
    return verifyGeneratedCurrentExpressionKeyframeReadBack(scenario, expected);
  }

  if (expected.generatedSpatialInTangent) {
    return verifyGeneratedSpatialInTangentReadBack(scenario, expected);
  }

  if (expected.generatedSeparateShapeSizeDimensions) {
    return verifyGeneratedSeparateShapeSizeDimensionsReadBack(scenario, expected);
  }

  if (expected.generatedCompPropertiesWorkArea) {
    return verifyGeneratedCompPropertiesReadBack(scenario, expected);
  }

  if (expected.generatedCompCurrentTime) {
    return verifyGeneratedCompCurrentTimeReadBack(scenario, expected);
  }

  if (expected.markerLifecycle) {
    return verifyMarkerLifecycleReadBack(scenario, expected);
  }

  if (expected.maskName) {
    return verifyMaskScenarioReadBack(scenario, expected);
  }

  const folder = await callBridgeTool("list_project_folder_items", {
    folderName: expected.folderName,
    recursive: false,
    type: "comp",
    limit: 20
  });
  const folderItems = Array.isArray(folder.items) ? folder.items : [];
  const folderComp = folderItems.find((item) => item.name === expected.compName);
  if (!folderComp) {
    throw new Error(`${scenario.id}: generated folder does not contain comp ${expected.compName}.`);
  }

  const found = await callBridgeTool("find_project_items", {
    query: expected.compName,
    type: "comp",
    exactName: true,
    caseSensitive: true,
    limit: 5
  });
  const compMatch = found.matches && found.matches[0];
  if (!compMatch || !compMatch.itemIndex) {
    throw new Error(`${scenario.id}: generated comp was not found by exact name.`);
  }

  const comp = await callBridgeTool("get_comp_details", {
    compItemIndex: compMatch.itemIndex,
    includeLayers: true,
    layerLimit: 20
  });
  const layers = Array.isArray(comp.layers) ? comp.layers : [];
  const cameraLayer = layers.find((layer) => layer.name === expected.cameraName);
  if (!cameraLayer || !cameraLayer.index) {
    throw new Error(`${scenario.id}: generated camera layer was not found by read-back.`);
  }

  const layerDetails = await callBridgeTool("get_layer_details", {
    compName: expected.compName,
    layerIndex: cameraLayer.index,
    includeProperties: false
  });
  const zoom = valuePreviewNumber(layerDetails.camera && layerDetails.camera.zoom);
  if (typeof expected.cameraZoom === "number" && Math.abs(Number(zoom) - expected.cameraZoom) > 0.001) {
    throw new Error(`${scenario.id}: generated camera zoom read-back mismatch; expected ${expected.cameraZoom}, got ${zoom}.`);
  }

  return {
    ok: true,
    folder: {
      name: expected.folderName,
      returned: folder.returned,
      containsComp: folderComp.name
    },
    comp: {
      itemIndex: comp.itemIndex,
      name: comp.name,
      numLayers: comp.numLayers
    },
    camera: {
      layerIndex: cameraLayer.index,
      name: cameraLayer.name,
      zoom
    }
  };
}

async function runBridgePlanForScenario(scenario, dryRun) {
  const proposed = await proposeBridgePlan(
    scenario.plan,
    `agent-scenario-${scenario.id}-${dryRun ? "dry" : "run"}-${Date.now()}`,
    "agent-scenario-deterministic-fallback"
  );
  return runProposedBridgePlan(proposed, dryRun, 180000, "agent-scenario-deterministic-fallback");
}

function scenarioValidationLine(scenario) {
  return `Validation: ok, ${scenario.expectedStepCount} ${scenario.expectedStepCount === 1 ? "step" : "steps"}, ${scenario.expectedMutatingCount} mutating`;
}

function panelPlanExpectation(scenario, state) {
  const transcript = state && state.transcript ? state.transcript : "";
  const validationLine = scenarioValidationLine(scenario);
  const expectedTools = Array.isArray(scenario.expectedTools) ? scenario.expectedTools : [];
  const missingTools = expectedTools.filter((toolName) => transcript.indexOf(toolName) < 0);
  const checks = {
    reviewReady: transcript.indexOf("Plan review: ready") >= 0,
    validationLine: transcript.indexOf(validationLine) >= 0,
    classificationVerdict: transcript.indexOf("Confidence: Risky") >= 0,
    mutatingStatus: state && state.planRunStatus === "Risky plan; dry run first",
    mutatingStatusClass: Boolean(state && state.planRunStatusClass && state.planRunStatusClass.indexOf("mutating") >= 0),
    dryRunEnabled: Boolean(state && state.dryRunDisabled === false),
    runEnabled: Boolean(state && state.runDisabled === false),
    expectedToolsPresent: missingTools.length === 0
  };
  return {
    ok: checks.reviewReady &&
      checks.classificationVerdict &&
      checks.validationLine &&
      checks.expectedToolsPresent &&
      checks.mutatingStatus &&
      checks.mutatingStatusClass &&
      checks.dryRunEnabled &&
      checks.runEnabled,
    validationLine,
    expectedStepCount: scenario.expectedStepCount,
    expectedMutatingCount: scenario.expectedMutatingCount,
    expectedTools,
    missingTools,
    planRunStatus: state ? state.planRunStatus : "",
    planRunStatusClass: state ? state.planRunStatusClass : "",
    checks
  };
}

function panelPlanReport(scenario, state, expectation) {
  const report = expectation || panelPlanExpectation(scenario, state);
  return {
    accepted: report.ok,
    validationLine: report.validationLine,
    expectedStepCount: report.expectedStepCount,
    expectedMutatingCount: report.expectedMutatingCount,
    expectedTools: report.expectedTools,
    missingTools: report.missingTools,
    planRunStatus: report.planRunStatus,
    planRunStatusClass: report.planRunStatusClass,
    checks: report.checks,
    transcriptTail: state && state.transcript ? state.transcript.slice(-3000) : ""
  };
}

async function runDeterministicScenarioFallback(scenario, panelPlan, expectation) {
  const dryRun = await runBridgePlanForScenario(scenario, true);
  const run = await runBridgePlanForScenario(scenario, false);
  if (!run.editSession && (!run.safety || run.safety.protection !== "auto_edit_session")) {
    throw new Error(`${scenario.id}: deterministic fallback did not use edit-session protection.`);
  }
  return {
    id: scenario.id,
    cleanupPrefix: scenario.cleanupPrefix,
    executionMode: "deterministic-plan-fallback",
    fallbackReason: "Panel Agent planner did not return the expected typed-tool plan and protected run readiness.",
    panelPlan: panelPlanReport(scenario, panelPlan, expectation),
    dryRun: planRunSummary(dryRun),
    run: planRunSummary(run)
  };
}

async function runAgentScenario(send, scenario, config) {
  const scenarioConfig = config || defaultAgentScenarioConfig();
  await evaluate(send, selectAgentScenarioExpression(scenario.prompt, scenarioConfig));
  await waitFor(send, `${scenario.id} agent ready`, (state) => (
    state.agentValue === scenarioConfig.agentId &&
    state.model === scenarioConfig.model &&
    state.mode === "plan" &&
    state.promptOptimizationChecked === false &&
    state.sendDisabled === false
  ), 20000);

  const sent = await evaluate(send, clickExpression("sendChatButton"));
  if (!sent || !sent.ok) throw new Error(`${scenario.id}: Send button was not clickable.`);
  await waitFor(send, `${scenario.id} planning indicator`, (state) => (
    state.workingExists === true &&
    state.workingText.indexOf("Planning") >= 0
  ), 5000).catch(() => null);

  const planned = await waitFor(send, `${scenario.id} Agent plan`, (state) => (
    state.sendDisabled === false &&
    state.transcript.indexOf("Plan review:") >= 0 &&
    state.transcript.indexOf("Validation:") >= 0
  ), AGENT_SCENARIO_WAIT_MS);

  const expectedPanelPlan = panelPlanExpectation(scenario, planned);

  if (!expectedPanelPlan.ok) {
    if (scenarioConfig.requirePanelPlans) {
      const report = panelPlanReport(scenario, planned, expectedPanelPlan);
      const error = new Error(`${scenario.id}: panel Agent planner did not return the required typed plan; deterministic backend fallback is disabled for ${scenarioConfig.label}.`);
      error.state = report;
      throw error;
    }
    return runDeterministicScenarioFallback(scenario, planned, expectedPanelPlan);
  }

  const dryRunClicked = await evaluate(send, clickExpression("dryRunPlanButton"));
  if (!dryRunClicked || !dryRunClicked.ok) throw new Error(`${scenario.id}: Dry run button was not clickable.`);
  const dryRun = await waitFor(send, `${scenario.id} dry run`, (state) => (
    state.sendDisabled === false &&
    state.transcript.indexOf("Dry run: ok") >= 0 &&
    state.transcript.indexOf("Mode: preview only; project was not changed.") >= 0 &&
    state.transcript.indexOf("Checkpoint/edit session: dry-run only; no checkpoint was created.") >= 0
  ), 60000);

  await evaluate(send, installConfirmExpression());
  const runClicked = await evaluate(send, clickExpression("runPlanButton"));
  if (!runClicked || !runClicked.ok) throw new Error(`${scenario.id}: Run plan button was not clickable.`);

  const run = await waitFor(send, `${scenario.id} protected run`, (state) => {
    if (state.sendDisabled !== false) return false;
    if (state.transcript.indexOf("Run: ok") >= 0) return true;
    if (state.transcript.indexOf("Run: needs review") >= 0) return true;
    if (state.transcript.indexOf("Save the After Effects project first") >= 0) return true;
    if (state.transcript.indexOf("Save project first") >= 0) return true;
    return false;
  }, AGENT_SCENARIO_WAIT_MS);

  if ((run.confirmMessages || []).length) {
    throw new Error(`${scenario.id}: Run plan showed an unexpected confirmation dialog.`);
  }

  const blockedSaveFirst = (
    run.transcript.indexOf("Save the After Effects project first") >= 0 ||
    run.transcript.indexOf("Save project first") >= 0
  );
  if (blockedSaveFirst) {
    throw new Error(`${scenario.id}: project must be saved before live QA mutations can run.`);
  }
  if (run.transcript.indexOf("Run: ok") < 0) {
    throw new Error(`${scenario.id}: protected run did not complete cleanly.\n${run.transcript.slice(-3000)}`);
  }
  if (run.transcript.indexOf("Checkpoint/edit session: protected by") < 0) {
    throw new Error(`${scenario.id}: protected run did not report checkpoint/edit-session protection.`);
  }
  const readBackVerification = await verifyAgentScenarioReadBack(scenario);
  if (scenarioConfig.requireFinalReadBack && (!readBackVerification || readBackVerification.ok !== true)) {
    throw new Error(`${scenario.id}: final read-back summary is required for ${scenarioConfig.label}.`);
  }
  if (
    scenarioConfig.requireSemanticVerificationPassed &&
    (!run.planRunSemanticVerification || run.planRunSemanticVerification.status !== "passed")
  ) {
    const semanticDetails = run.planRunSemanticVerification
      ? JSON.stringify(run.planRunSemanticVerification, null, 2).slice(0, 4000)
      : "missing";
    throw new Error(`${scenario.id}: semantic verification was not passed for ${scenarioConfig.label}.\nSemantic: ${semanticDetails}\n${run.transcript.slice(-3000)}`);
  }
  const outcomePassed = run.transcript.indexOf("Outcome verification: passed") >= 0;
  const allowedNeedsReviewWithReadBack = Boolean(
    scenarioConfig.allowSemanticNeedsReviewWithReadBack &&
    readBackVerification &&
    readBackVerification.ok &&
    run.transcript.indexOf("Outcome verification: needs review") >= 0
  );
  if (!outcomePassed && !allowedNeedsReviewWithReadBack) {
    throw new Error(`${scenario.id}: protected run did not report passed outcome verification.\n${run.transcript.slice(-3000)}`);
  }

  return {
    id: scenario.id,
    cleanupPrefix: scenario.cleanupPrefix,
    executionMode: "panel-agent-plan",
    panelPlan: panelPlanReport(scenario, planned, expectedPanelPlan),
    dryRun: {
      transcriptTail: dryRun.transcript.slice(-3000)
    },
    run: {
      transcriptTail: run.transcript.slice(-3000),
      semanticVerification: run.planRunSemanticVerification || null,
      logTail: run.log.slice(-1200),
      readBackVerification
    }
  };
}

async function agentScenarioSmoke(config) {
  const scenarioConfig = config || defaultAgentScenarioConfig();
  assertAgentScenarioProviderPolicy(scenarioConfig);
  const preflight = await agentScenarioPreflight(scenarioConfig);
  const renderQueueBaselineTotal = Number(preflight.renderQueue && preflight.renderQueue.totalItems || 0);
  const runPrefix = `${scenarioConfig.runPrefixBase || AGENT_SCENARIO_PREFIX} ${agentScenarioStamp()}`;
  const scenarioFactory = scenarioConfig.scenarioFactory || agentScenarioPlans;
  const scenarios = scenarioFactory(runPrefix, renderQueueBaselineTotal);
  const { page, ws, send } = await connectToPanel();
  let historyBackup = null;
  let composerBackup = null;
  let finalCleanupDone = false;
  const results = [];
  const cleanups = [];

  try {
    historyBackup = await evaluate(send, historyStorageExpression());
    composerBackup = await evaluate(send, composerStateExpression());
    await reloadActivePage(send);
    await evaluate(send, setupExpression());
    await waitFor(send, "panel online", (state) => state.badge === "online", 15000);
    await waitFor(send, "agent list", (state) => state.agentOptions.some((option) => option.value === scenarioConfig.agentId), 20000);

    for (const scenario of scenarios) {
      const result = await runAgentScenario(send, scenario, scenarioConfig);
      results.push(result);
      const cleanup = await cleanupAgentScenarioPrefix(scenario.cleanupPrefix, renderQueueBaselineTotal, {
        skipRenderQueueCleanup: scenarioConfig.skipRenderQueueCleanup
      });
      cleanups.push({
        id: scenario.id,
        cleanupPrefix: scenario.cleanupPrefix,
        renderQueueRemovedCount: cleanup.renderQueueCleanup ? cleanup.renderQueueCleanup.removedCount : null,
        removedCount: cleanup.run && cleanup.run.steps && cleanup.run.steps[0] && cleanup.run.steps[0].result
          ? cleanup.run.steps[0].result.removedCount
          : null,
        renderQueueTotal: cleanup.renderQueue.totalItems
      });
    }

    const finalCleanup = await cleanupAgentScenarioPrefix(runPrefix, renderQueueBaselineTotal, {
      skipRenderQueueCleanup: scenarioConfig.skipRenderQueueCleanup
    });
    finalCleanupDone = true;
    const fallbackCount = results.filter((result) => result.executionMode === "deterministic-plan-fallback").length;
    const panelPlanCount = results.filter((result) => result.executionMode === "panel-agent-plan").length;
    const report = {
      ok: true,
      page: { title: page.title, url: page.url },
      runPrefix,
      planner: {
        label: scenarioConfig.label,
        agent: scenarioConfig.agentId,
        model: scenarioConfig.model,
        providerGroup: scenarioConfig.providerGroup || null,
        authMode: scenarioConfig.authMode || null,
        requirePanelPlans: scenarioConfig.requirePanelPlans
      },
      preflight: {
        health: preflight.health,
        readiness: preflight.readiness,
        activeComp: preflight.activeComp ? {
          itemIndex: preflight.activeComp.itemIndex,
          name: preflight.activeComp.name,
          selectedLayerCount: Array.isArray(preflight.activeComp.selectedLayers) ? preflight.activeComp.selectedLayers.length : 0
        } : null,
        renderQueueTotal: renderQueueBaselineTotal
      },
      plannerAcceptance: {
        panelPlanCount,
        fallbackCount,
        scenarioCount: results.length
      },
      scenarios: results,
      cleanups,
      finalCleanup: {
        renderQueueRemovedCount: finalCleanup.renderQueueCleanup ? finalCleanup.renderQueueCleanup.removedCount : null,
        removedCount: finalCleanup.run && finalCleanup.run.steps && finalCleanup.run.steps[0] && finalCleanup.run.steps[0].result
          ? finalCleanup.run.steps[0].result.removedCount
          : null,
        renderQueueTotal: finalCleanup.renderQueue.totalItems
      }
    };
    const artifact = writeAgentRunReport(report, { source: "cep-panel-cdp-smoke" });
    report.artifact = {
      schemaVersion: artifact.report.schemaVersion,
      path: artifact.path,
      relativePath: artifact.relativePath
    };
    console.log(JSON.stringify(report, null, 2));
    if (scenarioConfig.requirePanelPlans && fallbackCount > 0) {
      throw new Error(`${scenarioConfig.label}: ${fallbackCount} Agent scenario(s) used deterministic fallback; planner fidelity did not meet the GPT-5.5 acceptance gate.`);
    }
  } finally {
    if (!finalCleanupDone) {
      try {
        await cleanupAgentScenarioPrefix(runPrefix, renderQueueBaselineTotal, {
          skipRenderQueueCleanup: scenarioConfig.skipRenderQueueCleanup
        });
      } catch (_cleanupError) {}
    }
    if (historyBackup || composerBackup) {
      try {
        if (historyBackup) await evaluate(send, writeHistoryStorageExpression(historyBackup));
        if (composerBackup) await evaluate(send, writeComposerStateExpression(composerBackup));
        await reloadActivePage(send);
        if (composerBackup) await evaluate(send, writeComposerStateExpression(composerBackup));
      } catch (_restoreError) {}
    }
    ws.close();
  }
}

function mutatingPrompt(name) {
  return [
    `Create exactly one temporary test composition named "${name}".`,
    "Use inspection first, then one create_test_comp mutation, then verification/readback.",
    "Use create_test_comp with width 320, height 180, duration 1, frameRate 24, openInViewer false.",
    "Do not add cleanup to the plan."
  ].join(" ");
}

async function cleanupMutatingSmoke(name) {
  const response = await postBridge("/agents/plan/run", {
    plan: {
      summary: `Clean up ${name}`,
      risk: "low",
      requiresCheckpoint: false,
      steps: [
        {
          title: "Remove Safe Run smoke test comps",
          tool: "cleanup_test_items",
          args: {
            namePrefix: MUTATING_PREFIX,
            maxItems: 25,
            confirm: true
          }
        }
      ]
    },
    requestId: `cep-panel-mutating-cleanup-${Date.now()}`,
    dryRun: false,
    confirm: true,
    allowMutations: true,
    autoEditSession: true,
    timeoutMs: 120000
  });

  if (response.status >= 400 || !response.body || response.body.ok !== true) {
    const error = response.body && (response.body.error || (response.body.run && response.body.run.error));
    throw new Error(`Cleanup failed: ${error || `HTTP ${response.status}`}`);
  }

  return response.body.run || null;
}

async function mutatingSmoke() {
  const suffix = String(Date.now()).slice(-8);
  const name = `${MUTATING_PREFIX} ${suffix}`;
  const { page, ws, send } = await connectToPanel();
  let cleanup = null;

  try {
    await reloadActivePage(send);
    await evaluate(send, setupExpression());
    await waitFor(send, "panel online", (state) => state.badge === "online", 15000);
    await waitFor(send, "agent list", (state) => state.agentOptions.some((option) => option.value === AGENT_ID), 20000);
    await evaluate(send, selectAgentExpression(process.env.CEP_PANEL_MUTATING_PROMPT || mutatingPrompt(name)));
    await waitFor(send, "selected agent ready", (state) => (
      state.agentValue === AGENT_ID &&
      state.model === MODEL &&
      state.mode === "plan" &&
      state.sendDisabled === false
    ), 20000);

    const sent = await evaluate(send, clickExpression("sendChatButton"));
    if (!sent || !sent.ok) throw new Error("Send button was not clickable.");
    await waitFor(send, "mutating planning indicator", (state) => (
      state.workingExists === true &&
      state.workingText.indexOf("Planning") >= 0 &&
      state.workingDots === 3
    ), 5000);

    const planned = await waitFor(send, "mutating AE Plan result", (state) => (
      state.sendDisabled === false &&
      state.transcript.indexOf("Plan review: ready") >= 0 &&
      state.transcript.indexOf("Confidence: Risky") >= 0 &&
      state.transcript.indexOf("Validation: ok") >= 0 &&
      state.transcript.indexOf("1 mutating") >= 0 &&
      state.transcript.indexOf("Affected targets:") >= 0 &&
      state.transcript.indexOf("Run readiness: Dry run checks without changes") >= 0 &&
      state.planRunStatus === "Risky plan; dry run first" &&
      state.planRunStatusClass.indexOf("mutating") >= 0 &&
      state.runTitle.indexOf("protected edit-session") >= 0 &&
      state.transcript.indexOf("create_test_comp") >= 0 &&
      state.dryRunDisabled === false &&
      state.runDisabled === false
    ), WAIT_MS);

    const dryRunClicked = await evaluate(send, clickExpression("dryRunPlanButton"));
    if (!dryRunClicked || !dryRunClicked.ok) throw new Error("Dry run button was not clickable.");
    const dryRun = await waitFor(send, "mutating dry run result", (state) => (
      state.sendDisabled === false &&
      state.transcript.indexOf("Dry run: ok") >= 0 &&
      state.transcript.indexOf("Mode: preview only; project was not changed.") >= 0 &&
      state.transcript.indexOf("Checkpoint/edit session: dry-run only; no checkpoint was created.") >= 0 &&
      state.transcript.indexOf("ready") >= 0
    ), 30000);

    await evaluate(send, installConfirmExpression());
    const runClicked = await evaluate(send, clickExpression("runPlanButton"));
    if (!runClicked || !runClicked.ok) throw new Error("Run plan button was not clickable.");

    const run = await waitFor(send, "mutating run result", (state) => {
      if (state.sendDisabled !== false) return false;
      if (state.transcript.indexOf("Run: ok") >= 0) return true;
      if (state.transcript.indexOf("Run: needs review") >= 0 && state.transcript.indexOf(name) >= 0) return true;
      if (state.transcript.indexOf("Save the After Effects project first") >= 0) return true;
      if (state.transcript.indexOf("Save project first") >= 0) return true;
      return false;
    }, 90000);

    if ((run.confirmMessages || []).length) {
      throw new Error("Run plan showed an unexpected confirmation dialog.");
    }

    const blockedSaveFirst = (
      run.transcript.indexOf("Save the After Effects project first") >= 0 ||
      run.transcript.indexOf("Save project first") >= 0
    );
    if (!blockedSaveFirst) {
      if (run.transcript.indexOf("auto_edit_session") < 0 && run.transcript.indexOf("Edit session") < 0) {
        throw new Error("Mutating run did not show edit-session protection.");
      }
      if (run.transcript.indexOf("Checkpoint/edit session: protected by") < 0) {
        throw new Error("Mutating run did not show checkpoint/edit-session status.");
      }
      if (run.transcript.indexOf(name) < 0) {
        throw new Error("Mutating run did not mention the created test comp.");
      }
      cleanup = await cleanupMutatingSmoke(name);
    }

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      name,
      safeBlocked: blockedSaveFirst,
      planned: {
        agent: planned.agentValue,
        model: planned.model,
        transcriptTail: planned.transcript.slice(-3000)
      },
      dryRun: {
        transcriptTail: dryRun.transcript.slice(-3000)
      },
      run: {
        transcriptTail: run.transcript.slice(-3000),
        logTail: run.log.slice(-1200),
        confirmMessages: run.confirmMessages
      },
      cleanup: cleanup ? {
        ok: cleanup.ok,
        safety: cleanup.safety,
        steps: cleanup.steps
      } : null
    }, null, 2));
  } finally {
    ws.close();
  }
}

async function main() {
  const command = process.argv[2] || "inspect";
  if (command === "ensure-daemon-only") {
    const ensured = await ensureBridgeDaemonRunning(command);
    console.log(JSON.stringify(ensured, null, 2));
    return;
  }
  if (shouldEnsureDaemonForCommand(command)) {
    await ensureBridgeDaemonRunning(command);
  }
  if (command === "inspect") {
    await inspect();
    return;
  }
  if (command === "smoke") {
    await smoke();
    return;
  }
  if (command === "dev-request-button-smoke") {
    await devRequestButtonSmoke();
    return;
  }
  if (command === "raw-run-gate-smoke") {
    await rawRunGateSmoke();
    return;
  }
  if (command === "classification-warning-controls-smoke") {
    await classificationWarningControlsSmoke();
    return;
  }
  if (command === "mode-toggle-smoke") {
    await modeToggleSmoke();
    return;
  }
  if (command === "hardcore-autopilot-ui-smoke") {
    await hardcoreAutopilotUiSmoke();
    return;
  }
  if (command === "plan-review-smoke") {
    await planReviewSmoke();
    return;
  }
  if (command === "reload") {
    await reloadPanel();
    return;
  }
  if (command === "mutating-smoke") {
    await mutatingSmoke();
    return;
  }
  if (command === "agent-scenario-audit") {
    await agentScenarioAudit();
    return;
  }
  if (command === "agent-scenario-smoke") {
    await agentScenarioSmoke();
    return;
  }
  if (command === "agent-scenario-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliAgentScenarioConfig());
    return;
  }
  if (command === "agent-new-tools-openai-cli-smoke" || command === "full-ui-agent-new-tools-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliNewToolsScenarioConfig());
    return;
  }
  if (command === "agent-mask-safety-openai-cli-smoke" || command === "full-ui-agent-mask-safety-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliMaskSafetyScenarioConfig());
    return;
  }
  if (command === "agent-marker-lifecycle-openai-cli-smoke" || command === "full-ui-agent-marker-lifecycle-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliMarkerLifecycleScenarioConfig());
    return;
  }
  if (command === "agent-duplicate-layers-openai-cli-smoke" || command === "full-ui-agent-duplicate-layers-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliDuplicateLayersScenarioConfig());
    return;
  }
  if (command === "agent-manual-typed-tools-openai-cli-smoke" || command === "full-ui-agent-manual-typed-tools-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliManualTypedToolsScenarioConfig());
    return;
  }
  if (command === "agent-dakkshin-typed-tools-openai-cli-smoke" || command === "full-ui-agent-dakkshin-typed-tools-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliDakkshinTypedToolsScenarioConfig());
    return;
  }
  if (command === "agent-reset-work-area-openai-cli-smoke" || command === "full-ui-agent-reset-work-area-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliResetWorkAreaScenarioConfig());
    return;
  }
  if (command === "agent-rename-find-replace-openai-cli-smoke" || command === "full-ui-agent-rename-find-replace-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliRenameFindReplaceScenarioConfig());
    return;
  }
  if (command === "agent-assorted-composition-guides-openai-cli-smoke" || command === "full-ui-agent-assorted-composition-guides-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliAssortedCompositionGuidesScenarioConfig());
    return;
  }
  if (command === "agent-composition-guide-openai-cli-smoke" || command === "full-ui-agent-composition-guide-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliCompositionGuideScenarioConfig());
    return;
  }
  if (command === "agent-background-layer-openai-cli-smoke" || command === "full-ui-agent-background-layer-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliBackgroundLayerScenarioConfig());
    return;
  }
  if (command === "agent-layer-timing-openai-cli-smoke" || command === "full-ui-agent-layer-timing-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliLayerTimingScenarioConfig());
    return;
  }
  if (command === "agent-layer-transform-openai-cli-smoke" || command === "full-ui-agent-layer-transform-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliLayerTransformScenarioConfig());
    return;
  }
  if (command === "agent-project-items-openai-cli-smoke" || command === "full-ui-agent-project-items-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliProjectItemsScenarioConfig());
    return;
  }
  if (command === "agent-project-item-metadata-openai-cli-smoke" || command === "full-ui-agent-project-item-metadata-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliProjectItemMetadataScenarioConfig());
    return;
  }
  if (command === "agent-composition-version-openai-cli-smoke" || command === "full-ui-agent-composition-version-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliCompositionVersionScenarioConfig());
    return;
  }
  if (command === "agent-comp-rename-file-name-openai-cli-smoke" || command === "full-ui-agent-comp-rename-file-name-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliCompositionRenameFileNameScenarioConfig());
    return;
  }
  if (command === "agent-render-queue-openai-cli-smoke" || command === "full-ui-agent-render-queue-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliRenderQueueScenarioConfig());
    return;
  }
  if (command === "agent-effect-property-openai-cli-smoke" || command === "full-ui-agent-effect-property-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliEffectPropertyScenarioConfig());
    return;
  }
  if (command === "agent-effect-enabled-openai-cli-smoke" || command === "full-ui-agent-effect-enabled-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliEffectEnabledScenarioConfig());
    return;
  }
  if (command === "agent-expression-openai-cli-smoke" || command === "full-ui-agent-expression-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliExpressionScenarioConfig());
    return;
  }
  if (command === "agent-parametric-anchor-expression-openai-cli-smoke" || command === "full-ui-agent-parametric-anchor-expression-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliParametricAnchorExpressionScenarioConfig());
    return;
  }
  if (command === "agent-parent-opacity-expression-openai-cli-smoke" || command === "full-ui-agent-parent-opacity-expression-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliParentOpacityExpressionScenarioConfig());
    return;
  }
  if (command === "agent-layer-parent-below-openai-cli-smoke" || command === "full-ui-agent-layer-parent-below-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliLayerParentBelowScenarioConfig());
    return;
  }
  if (command === "agent-layer-parent-closest-openai-cli-smoke" || command === "full-ui-agent-layer-parent-closest-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliLayerParentClosestScenarioConfig());
    return;
  }
  if (command === "agent-stick-effect-expression-openai-cli-smoke" || command === "full-ui-agent-stick-effect-expression-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliStickEffectExpressionScenarioConfig());
    return;
  }
  if (command === "agent-estimate-path-length-openai-cli-smoke" || command === "full-ui-agent-estimate-path-length-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliEstimatePathLengthScenarioConfig());
    return;
  }
  if (command === "agent-path-geometry-openai-cli-smoke" || command === "full-ui-agent-path-geometry-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliPathGeometryScenarioConfig());
    return;
  }
  if (command === "agent-flip-path-openai-cli-smoke" || command === "full-ui-agent-flip-path-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliFlipPathGeometryScenarioConfig());
    return;
  }
  if (command === "agent-export-path-points-openai-cli-smoke" || command === "full-ui-agent-export-path-points-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliExportPathPointsScenarioConfig());
    return;
  }
  if (command === "agent-essential-graphics-openai-cli-smoke" || command === "full-ui-agent-essential-graphics-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliEssentialGraphicsScenarioConfig());
    return;
  }
  if (command === "agent-puppet-on-transparent-openai-cli-smoke" || command === "full-ui-agent-puppet-on-transparent-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliPuppetOnTransparentScenarioConfig());
    return;
  }
  if (command === "agent-puppet-pin-type-openai-cli-smoke" || command === "full-ui-agent-puppet-pin-type-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliPuppetPinTypeScenarioConfig());
    return;
  }
  if (command === "agent-comp-properties-openai-cli-smoke" || command === "full-ui-agent-comp-properties-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliCompPropertiesScenarioConfig());
    return;
  }
  if (command === "agent-comp-refresh-openai-cli-smoke" || command === "full-ui-agent-comp-refresh-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliCompRefreshScenarioConfig());
    return;
  }
  if (command === "agent-comp-current-time-openai-cli-smoke" || command === "full-ui-agent-comp-current-time-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliCompCurrentTimeScenarioConfig());
    return;
  }
  if (command === "agent-selected-property-value-openai-cli-smoke" || command === "full-ui-agent-selected-property-value-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliSelectedPropertyValueScenarioConfig());
    return;
  }
  if (command === "agent-layer-switches-openai-cli-smoke" || command === "full-ui-agent-layer-switches-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliLayerSwitchScenarioConfig());
    return;
  }
  if (command === "agent-layer-metadata-openai-cli-smoke" || command === "full-ui-agent-layer-metadata-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliLayerMetadataScenarioConfig());
    return;
  }
  if (command === "agent-layer-enabled-hard-solo-openai-cli-smoke" || command === "full-ui-agent-layer-enabled-hard-solo-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliLayerEnabledHardSoloScenarioConfig());
    return;
  }
  if (command === "agent-layer-difference-blend-mode-openai-cli-smoke" || command === "full-ui-agent-layer-difference-blend-mode-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliLayerDifferenceBlendModeScenarioConfig());
    return;
  }
  if (command === "agent-layer-track-matte-openai-cli-smoke" || command === "full-ui-agent-layer-track-matte-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliLayerTrackMatteScenarioConfig());
    return;
  }
  if (command === "agent-adjustment-layer-placement-openai-cli-smoke" || command === "full-ui-agent-adjustment-layer-placement-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliAdjustmentLayerPlacementScenarioConfig());
    return;
  }
  if (command === "agent-layer-connection-line-openai-cli-smoke" || command === "full-ui-agent-layer-connection-line-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliLayerConnectionLineScenarioConfig());
    return;
  }
  if (command === "agent-text-shapes-openai-cli-smoke" || command === "full-ui-agent-text-shapes-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliTextShapesScenarioConfig());
    return;
  }
  if (command === "agent-layer-selection-openai-cli-smoke" || command === "full-ui-agent-layer-selection-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliLayerSelectionScenarioConfig());
    return;
  }
  if (command === "agent-keyframes-openai-cli-smoke" || command === "full-ui-agent-keyframes-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliKeyframeScenarioConfig());
    return;
  }
  if (command === "agent-text-to-keys-openai-cli-smoke" || command === "full-ui-agent-text-to-keys-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliTextToKeysScenarioConfig());
    return;
  }
  if (command === "agent-selected-keyframe-marker-openai-cli-smoke" || command === "full-ui-agent-selected-keyframe-marker-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliSelectedKeyframeMarkerScenarioConfig());
    return;
  }
  if (command === "agent-composition-marker-read-openai-cli-smoke" || command === "full-ui-agent-composition-marker-read-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliCompositionMarkerReadScenarioConfig());
    return;
  }
  if (command === "agent-composition-marker-work-area-openai-cli-smoke" || command === "full-ui-agent-composition-marker-work-area-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliCompositionMarkerWorkAreaScenarioConfig());
    return;
  }
  if (command === "agent-composition-layer-marker-copy-openai-cli-smoke" || command === "full-ui-agent-composition-layer-marker-copy-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliCompositionLayerMarkerCopyScenarioConfig());
    return;
  }
  if (command === "agent-composition-marker-add-openai-cli-smoke" || command === "full-ui-agent-composition-marker-add-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliCompositionMarkerAddScenarioConfig());
    return;
  }
  if (command === "agent-remaining-tail-contracts-openai-cli-smoke" || command === "full-ui-agent-remaining-tail-contracts-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliRemainingTailContractsScenarioConfig());
    return;
  }
  if (command === "openai-api-setup-smoke") {
    await openAiApiSetupSmoke();
    return;
  }
  if (command === "provider-placeholder-smoke") {
    await providerPlaceholderSmoke();
    return;
  }
  if (command === "provider-setup-smoke") {
    await providerSetupSmoke();
    return;
  }
  if (command === "provider-self-test-smoke") {
    await providerSelfTestSmoke();
    return;
  }
  if (command === "provider-key-save-smoke") {
    await providerKeySaveSmoke();
    return;
  }
  if (command === "sidebar-collapse-smoke") {
    await sidebarCollapseSmoke();
    return;
  }
  if (command === "diagnostics-smoke") {
    await diagnosticsSmoke();
    return;
  }
  if (command === "connector-status-smoke") {
    await connectorStatusSmoke();
    return;
  }
  if (command === "send-button-smoke") {
    await sendButtonSmoke();
    return;
  }
  if (command === "branding-smoke") {
    await brandingSmoke();
    return;
  }
  if (command === "reload-button-smoke") {
    await reloadButtonSmoke();
    return;
  }
  if (command === "openai-cli-smoke") {
    await openAiCliSmoke();
    return;
  }
  if (command === "openai-cli-setup-smoke") {
    await openAiCliSetupSmoke();
    return;
  }
  if (command === "workflow-preset-smoke") {
    await workflowPresetSmoke();
    return;
  }
  if (command === "history-smoke") {
    await historySmoke();
    return;
  }
  if (command === "offline-smoke") {
    await offlineSmoke();
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  const output = {
    ok: false,
    error: error.message || String(error),
    state: error.state || null
  };
  console.error(JSON.stringify(output, null, 2));
  process.exit(1);
});
