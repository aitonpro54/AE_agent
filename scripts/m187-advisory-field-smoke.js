#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawnSync } = require("child_process");

const {
  DEFAULT_MAX_HINTS,
  retrieveSolutionHints
} = require("../mcp-server/solution-library");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_BRIDGE_URL = process.env.AE_AGENT_RELIABILITY_BRIDGE_URL || process.env.CEP_PANEL_BRIDGE_URL || "http://127.0.0.1:3456";
const DEFAULT_BRIDGE_TOKEN = process.env.AE_AGENT_RELIABILITY_BRIDGE_TOKEN || process.env.CEP_PANEL_BRIDGE_TOKEN || "codex-ae-local";
const DEFAULT_PREFIX = "AE Agent M188 M187 Field Smoke";
const REPORT_SCHEMA = "m187-advisory-field-smoke.v1";
const EFFECT_ALLOWLIST = ["ADBE Fill", "ADBE Tint", "ADBE Gaussian Blur 2"];
const AVAILABLE_TOOLS = [
  "get_bridge_status",
  "ping_ae",
  "get_project_info",
  "get_active_comp",
  "get_selected_layers",
  "list_layers",
  "get_comp_details",
  "get_layer_details",
  "get_render_queue_status",
  "find_project_items",
  "create_comp",
  "create_shape_layer",
  "list_effect_presets",
  "list_effects",
  "add_effect",
  "get_effect_details",
  "set_effect_property",
  "set_property_keyframes",
  "apply_keyframe_ease",
  "set_layer_transform",
  "deep_duplicate_precomp_sources",
  "run_extendscript_file"
];
const MUTATING_TOOLS = new Set([
  "checkpoint_project",
  "start_edit_session",
  "finish_edit_session",
  "create_comp",
  "create_project_folder",
  "move_project_items_to_folder",
  "create_text_layer",
  "import_footage",
  "create_solid_layer",
  "create_null_layer",
  "create_adjustment_layer",
  "create_camera_layer",
  "add_project_item_to_comp",
  "duplicate_comp",
  "deep_duplicate_precomp_sources",
  "add_effect",
  "set_effect_property",
  "set_property_value",
  "align_layers_to_time",
  "set_comp_work_area",
  "set_layer_time_range",
  "stagger_layers",
  "split_layers_at_time",
  "precompose_layers",
  "replace_layer_source",
  "rename_layers",
  "rename_project_items",
  "update_text_layer",
  "create_shape_layer",
  "fit_layer_to_comp",
  "set_property_keyframes",
  "apply_keyframe_ease",
  "set_expression",
  "clear_expression",
  "add_comp_to_render_queue",
  "set_render_queue_output",
  "cleanup_test_items",
  "run_ai_agent_plan",
  "run_agent_hardcore_session"
]);

const RETRIEVAL_CASES = [
  {
    id: "basic-comp",
    prompt: "Create a basic 1920 by 1080 composition at 24 fps.",
    expectedSolutionId: "basic-comp-setup-typed-plan"
  },
  {
    id: "safe-effect",
    prompt: "Add a blur effect safely to the selected layer and inspect effect properties.",
    expectedSolutionId: "safe-effect-addition-typed-plan"
  },
  {
    id: "selected-layer-animation",
    prompt: "Animate the selected layers with opacity and position keyframes.",
    expectedSolutionId: "selected-layers-animation-typed-plan"
  }
];

function usage() {
  return [
    "Usage: node scripts/m187-advisory-field-smoke.js [read-only|mutating|both] [options]",
    "Options:",
    "  --bridge-url <url>       Bridge URL. Defaults to local AE Agent bridge.",
    "  --bridge-token <token>   Bridge token. Defaults to codex-ae-local.",
    "  --generated-prefix <p>   Prefix for generated project items.",
    "  --dry-run                In mutating mode, validate/propose but do not mutate AE.",
    "  --mock-bridge            Use a local mocked bridge for unit smoke.",
    "  --json                   Print JSON report.",
    "  --help                   Show this help."
  ].join("\n");
}

function splitInlineOption(raw) {
  const equalsIndex = raw.indexOf("=");
  if (equalsIndex === -1) return { name: raw, inlineValue: undefined };
  return { name: raw.slice(0, equalsIndex), inlineValue: raw.slice(equalsIndex + 1) };
}

function parseArgs(argv) {
  const opts = {
    stage: "read-only",
    bridgeUrl: DEFAULT_BRIDGE_URL,
    bridgeToken: DEFAULT_BRIDGE_TOKEN,
    generatedPrefix: process.env.M187_FIELD_SMOKE_PREFIX || DEFAULT_PREFIX,
    dryRun: false,
    json: false,
    mockBridge: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (["read-only", "mutating", "both"].includes(arg)) {
      opts.stage = arg;
      continue;
    }
    if (!arg.startsWith("--")) throw new Error(`Unexpected positional argument: ${arg}`);
    const { name, inlineValue } = splitInlineOption(arg.slice(2));
    if (name === "help" || name === "h") opts.help = true;
    else if (name === "dry-run") opts.dryRun = true;
    else if (name === "json") opts.json = true;
    else if (name === "mock-bridge") opts.mockBridge = true;
    else if (["bridge-url", "bridge-token", "generated-prefix"].includes(name)) {
      const value = inlineValue ?? argv[index + 1];
      if (value === undefined || value === "" || value.startsWith("--")) {
        throw new Error(`Missing value for --${name}`);
      }
      if (name === "bridge-url") opts.bridgeUrl = value;
      if (name === "bridge-token") opts.bridgeToken = value;
      if (name === "generated-prefix") opts.generatedPrefix = value;
      if (inlineValue === undefined) index += 1;
    } else {
      throw new Error(`Unknown option: --${name}`);
    }
  }

  if (!["read-only", "mutating", "both"].includes(opts.stage)) {
    throw new Error(`Invalid stage: ${opts.stage}`);
  }
  if (!String(opts.generatedPrefix || "").trim()) {
    throw new Error("--generated-prefix must not be empty.");
  }
  return opts;
}

function requestJson(method, targetUrl, payload, headers = {}, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);
    const body = payload === undefined ? null : JSON.stringify(payload);
    const req = http.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method,
      headers: {
        ...(body ? { "content-type": "application/json", "content-length": Buffer.byteLength(body) } : {}),
        ...headers
      }
    }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode || 0, body: text ? JSON.parse(text) : {} });
        } catch (error) {
          reject(new Error(`Invalid JSON from ${targetUrl}: ${error.message || String(error)}`));
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timed out waiting for ${targetUrl}`)));
    if (body) req.write(body);
    req.end();
  });
}

function bridgeUrl(client, pathname, params = {}) {
  const url = new URL(pathname, client.bridgeUrl);
  if (client.bridgeToken) url.searchParams.set("token", client.bridgeToken);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function authHeaders(client) {
  return client.bridgeToken ? { "x-ae-bridge-token": client.bridgeToken } : {};
}

function parseBridgeToolPayload(response, name) {
  if (!response || response.status >= 400 || !response.body || response.body.ok !== true) {
    const error = response && response.body && (response.body.error || response.body.message || (response.body.result && response.body.result.error));
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

async function callBridgeTool(client, name, args = {}) {
  const response = await requestJson("POST", bridgeUrl(client, "/tools/call"), {
    name,
    arguments: args
  }, authHeaders(client));
  return parseBridgeToolPayload(response, name);
}

async function postBridge(client, pathname, body, timeoutMs = 120000) {
  const response = await requestJson("POST", bridgeUrl(client, pathname), body, authHeaders(client), timeoutMs);
  if (!response || response.status >= 400 || !response.body || response.body.ok !== true) {
    const error = response && response.body && (response.body.error || response.body.message || (response.body.run && response.body.run.error));
    throw new Error(`${pathname} failed: ${error || `HTTP ${response ? response.status : "unknown"}`}`);
  }
  return response.body;
}

async function getHealth(client) {
  const response = await requestJson("GET", new URL("/health", client.bridgeUrl).toString(), undefined, {}, 10000);
  if (response.status !== 200 || !response.body || response.body.ok !== true) {
    throw new Error(`Bridge health failed: HTTP ${response.status}`);
  }
  return response.body;
}

function tail(value, maxLength = 1200) {
  const text = String(value || "").trim();
  return text.length > maxLength ? text.slice(text.length - maxLength) : text;
}

function runCepInspect(opts) {
  if (opts.mockBridge) {
    return { ok: true, mocked: true, command: "node scripts/cep-panel-cdp-smoke.js inspect" };
  }
  const result = spawnSync(process.execPath, [path.join("scripts", "cep-panel-cdp-smoke.js"), "inspect"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 90000,
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error(`CEP inspect failed: ${tail(result.stderr || result.stdout)}`);
  }
  return {
    ok: true,
    command: "node scripts/cep-panel-cdp-smoke.js inspect",
    stdoutTail: tail(result.stdout),
    stderrTail: tail(result.stderr)
  };
}

async function preflight(client, opts = {}) {
  const health = await getHealth(client);
  if (!health.panelConnected) {
    throw new Error("CEP panel is not connected to the bridge.");
  }
  const status = await callBridgeTool(client, "get_bridge_status");
  if (opts.requireNoActiveEditSession && status && status.activeEditSession && status.activeEditSession.active) {
    throw new Error("An edit session is already active; close it before M188 live validation.");
  }
  const ping = await callBridgeTool(client, "ping_ae");
  const projectInfo = await callBridgeTool(client, "get_project_info");
  if (!projectInfo || !projectInfo.file) {
    throw new Error("The current After Effects project must be saved before M188 live validation.");
  }
  const renderQueue = await callBridgeTool(client, "get_render_queue_status", { limit: 50 });
  return { health, status, ping, projectInfo, renderQueue };
}

function readRegistry() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "registry", "solutions.json"), "utf8"));
}

function ids(retrieval) {
  return retrieval.entries.map((entry) => entry.id);
}

function assertSolutionRetrieval() {
  const registry = readRegistry();
  const cases = RETRIEVAL_CASES.map((item) => {
    const retrieval = retrieveSolutionHints(item.prompt, {
      registry,
      availableToolNames: AVAILABLE_TOOLS,
      topN: DEFAULT_MAX_HINTS
    });
    assert.strictEqual(retrieval.ok, true, `${item.id}: solution retrieval failed.`);
    assert(ids(retrieval).includes(item.expectedSolutionId), `${item.id}: expected ${item.expectedSolutionId} in retrieval.`);
    return {
      id: item.id,
      expectedSolutionId: item.expectedSolutionId,
      returned: retrieval.returned,
      ids: ids(retrieval)
    };
  });
  return { ok: true, cases };
}

function basicCompPlan(name) {
  return {
    summary: "M187 field smoke validates the basic comp setup advisory recipe.",
    risk: "medium",
    requiresCheckpoint: false,
    steps: [
      {
        title: "Create generated comp",
        tool: "create_comp",
        args: {
          name,
          width: 1920,
          height: 1080,
          duration: 2,
          frameRate: 24,
          bgColor: [0, 0, 0],
          allowDuplicateName: false,
          openInViewer: false
        }
      },
      {
        title: "Read back generated comp",
        tool: "get_comp_details",
        args: { includeLayers: false },
        resultBindings: { compItemIndex: "{{compItemIndex}}" }
      }
    ]
  };
}

function effectPlan(name, layerName, effectMatchName, effectName) {
  return {
    summary: "M187 field smoke validates the safe effect addition advisory recipe.",
    risk: "medium",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Create generated comp",
        tool: "create_comp",
        args: {
          name,
          width: 640,
          height: 360,
          duration: 2,
          frameRate: 24,
          allowDuplicateName: false,
          openInViewer: false
        }
      },
      {
        title: "Create generated shape layer",
        tool: "create_shape_layer",
        args: {
          name: layerName,
          shape: "rectangle",
          size: [240, 140],
          fillColor: [0.2, 0.8, 0.55],
          duration: 2
        },
        resultBindings: { compItemIndex: "{{compItemIndex}}" }
      },
      {
        title: "Add safe allowlisted effect",
        tool: "add_effect",
        args: {
          effect: effectMatchName,
          name: effectName
        },
        resultBindings: {
          compItemIndex: "{{compItemIndex}}",
          layerIndex: "{{layerIndex}}"
        }
      },
      {
        title: "Read back effect details",
        tool: "get_effect_details",
        args: {
          effectName,
          includeProperties: true,
          propertyDepth: 1,
          propertyLimit: 40
        },
        resultBindings: {
          compItemIndex: "{{compItemIndex}}",
          layerIndex: "{{layerIndex}}"
        }
      }
    ]
  };
}

function animationPlan(name, layerName) {
  return {
    summary: "M187 field smoke validates the selected-layer animation advisory recipe.",
    risk: "medium",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Create generated comp",
        tool: "create_comp",
        args: {
          name,
          width: 640,
          height: 360,
          duration: 2,
          frameRate: 24,
          allowDuplicateName: false,
          openInViewer: false
        }
      },
      {
        title: "Create generated shape layer",
        tool: "create_shape_layer",
        args: {
          name: layerName,
          shape: "rectangle",
          size: [220, 120],
          fillColor: [0.9, 0.5, 0.2],
          duration: 2
        },
        resultBindings: { compItemIndex: "{{compItemIndex}}" }
      },
      {
        title: "Set opacity keyframes",
        tool: "set_property_keyframes",
        args: {
          propertyPath: "ADBE Transform Group.ADBE Opacity",
          keyframes: [
            { time: 0, value: 0 },
            { time: 1, value: 100 }
          ],
          clearExisting: true
        },
        resultBindings: {
          compItemIndex: "{{compItemIndex}}",
          layerIndex: "{{layerIndex}}"
        }
      },
      {
        title: "Read back animated layer",
        tool: "get_layer_details",
        args: {
          includeProperties: true,
          propertyDepth: 2,
          propertyLimit: 80,
          includeValues: true
        },
        resultBindings: {
          compItemIndex: "{{compItemIndex}}",
          layerIndex: "{{layerIndex}}"
        }
      }
    ]
  };
}

function validationPlans(prefix, effectMatchName = "ADBE Fill") {
  return [
    { id: "basic-comp", plan: basicCompPlan(`${prefix} Readonly Basic Comp`) },
    { id: "safe-effect", plan: effectPlan(`${prefix} Readonly Effect Comp`, `${prefix} Readonly Shape`, effectMatchName, `${prefix} Readonly Effect`) },
    { id: "selected-layer-animation", plan: animationPlan(`${prefix} Readonly Animation Comp`, `${prefix} Readonly Animated Shape`) }
  ];
}

async function validateAndDryRunPlans(client, opts) {
  const results = [];
  for (const item of validationPlans(opts.generatedPrefix)) {
    const requestId = `m187-field-${item.id}-${Date.now()}`;
    const validation = await postBridge(client, "/agents/plan/validate", {
      requestId,
      plan: item.plan,
      repairPlan: true
    });
    assert(validation.validation && validation.validation.ok === true, `${item.id}: plan validation did not pass.`);

    const dryRun = await postBridge(client, "/agents/plan/run", {
      requestId: `${requestId}-dry-run`,
      plan: validation.repairedPlan || item.plan,
      dryRun: true,
      timeoutMs: 120000
    });
    assert(dryRun.run && dryRun.run.ok === true, `${item.id}: plan dry-run did not pass.`);
    assert(dryRun.run.steps.every((step) => step.status === "ready" || step.status === "skipped"), `${item.id}: unexpected dry-run step status.`);
    results.push({
      id: item.id,
      mutatingCount: validation.validation.mutatingCount,
      dryRunSteps: dryRun.run.steps.map((step) => ({ tool: step.tool, status: step.status }))
    });
  }
  return { ok: true, plans: results };
}

async function discoverSafeEffect(client) {
  const presets = await callBridgeTool(client, "list_effect_presets", { limit: 100, includePropertyHints: true });
  const presetList = Array.isArray(presets && presets.presets) ? presets.presets : [];
  const selected = EFFECT_ALLOWLIST.map((matchName) => presetList.find((preset) => preset.matchName === matchName)).find(Boolean);
  if (!selected) {
    throw new Error(`No allowlisted effect preset was available. Allowlist: ${EFFECT_ALLOWLIST.join(", ")}`);
  }
  return {
    matchName: selected.matchName,
    name: selected.name || selected.id || selected.matchName,
    allowlist: EFFECT_ALLOWLIST.slice()
  };
}

function m100RunFieldsForProposal(proposal, includeConfirmation) {
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
    fields.confirmedBySurface = proposal.confirmation.surface || "m188-live-validation";
    fields.confirmedBySession = proposal.confirmation.sessionId || "";
  }
  return fields;
}

async function proposePlan(client, plan, requestId) {
  const proposed = await postBridge(client, "/agents/plan/propose", {
    plan,
    requestId,
    repairPlan: true,
    confirmationSurface: "m188-live-validation",
    confirmationSessionId: `m188-${process.pid}`
  });
  if (!proposed.proposal || !proposed.proposal.action || !proposed.proposal.confirmation) {
    throw new Error("Bridge did not return an M100 proposal.");
  }
  return proposed;
}

async function runProposedPlan(client, proposed, dryRun) {
  const body = {
    ...m100RunFieldsForProposal(proposed.proposal, !dryRun),
    dryRun,
    confirm: !dryRun,
    allowMutations: !dryRun,
    autoEditSession: !dryRun,
    timeoutMs: 180000
  };
  const response = await postBridge(client, "/agents/plan/run", body, 240000);
  if (!response.run || response.run.ok !== true) {
    throw new Error(response.run && response.run.error || "Proposed plan run did not pass.");
  }
  return response.run;
}

async function cleanupGeneratedPrefix(client, prefix, renderQueueBaselineTotal) {
  const plan = {
    summary: `Clean up generated M187 field smoke items for ${prefix}`,
    risk: "medium",
    requiresCheckpoint: false,
    steps: [
      {
        title: "Remove generated M187 field smoke project items",
        tool: "cleanup_test_items",
        args: {
          namePrefix: prefix,
          maxItems: 50,
          confirm: true
        }
      }
    ]
  };
  const proposed = await proposePlan(client, plan, `m187-field-cleanup-${Date.now()}`);
  const run = await runProposedPlan(client, proposed, false);
  const remaining = await callBridgeTool(client, "find_project_items", {
    query: prefix,
    limit: 50,
    caseSensitive: true
  });
  const renderQueue = await callBridgeTool(client, "get_render_queue_status", { limit: 50 });
  const leftovers = Array.isArray(remaining && remaining.matches) ? remaining.matches : [];
  if (leftovers.length > 0) {
    throw new Error(`Cleanup left generated project items: ${leftovers.map((item) => item.name).join(", ")}`);
  }
  if (Number(renderQueue.totalItems || 0) !== Number(renderQueueBaselineTotal || 0)) {
    throw new Error(`Render queue drift after cleanup: expected ${renderQueueBaselineTotal}, got ${renderQueue.totalItems}.`);
  }
  return {
    ok: true,
    run: compactRun(run),
    remainingCount: leftovers.length,
    renderQueueTotal: renderQueue.totalItems
  };
}

function compactRun(run) {
  return {
    id: run && run.id || null,
    ok: Boolean(run && run.ok),
    dryRun: Boolean(run && run.dryRun),
    safety: run && run.safety || null,
    semanticVerification: run && run.semanticVerification || null,
    steps: Array.isArray(run && run.steps)
      ? run.steps.map((step) => ({ title: step.title, tool: step.tool, status: step.status, reason: step.reason || null, error: step.error || null }))
      : []
  };
}

async function runReadOnlyStage(client, opts) {
  const preflightReport = await preflight(client, { requireNoActiveEditSession: false });
  const cepInspect = runCepInspect(opts);
  const solutionRetrieval = assertSolutionRetrieval();
  const plans = await validateAndDryRunPlans(client, opts);
  return {
    ok: true,
    preflight: {
      health: {
        version: preflightReport.health.version,
        panelConnected: preflightReport.health.panelConnected,
        pending: preflightReport.health.pending,
        inflight: preflightReport.health.inflight
      },
      project: {
        filePresent: Boolean(preflightReport.projectInfo.file),
        numItems: preflightReport.projectInfo.numItems,
        activeItemName: preflightReport.projectInfo.activeItemName || null
      },
      renderQueueTotal: preflightReport.renderQueue.totalItems || 0
    },
    cepInspect,
    solutionRetrieval,
    typedPlanDryRuns: plans
  };
}

async function runMutatingStage(client, opts) {
  const preflightReport = await preflight(client, { requireNoActiveEditSession: true });
  const renderQueueBaselineTotal = Number(preflightReport.renderQueue && preflightReport.renderQueue.totalItems || 0);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const prefix = `${opts.generatedPrefix} ${stamp}`;
  const compName = `${prefix} Comp`;
  const layerName = `${prefix} Shape`;
  const effectName = `${prefix} Effect`;
  const existing = await callBridgeTool(client, "find_project_items", {
    query: prefix,
    limit: 25,
    caseSensitive: true
  });
  if (existing.matches && existing.matches.length) {
    throw new Error(`Generated prefix is not clean before run: ${existing.matches.map((item) => item.name).join(", ")}`);
  }

  const effect = await discoverSafeEffect(client);
  const plan = {
    summary: "M187 field smoke generated-only mutation for advisory recipe validation.",
    risk: "medium",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Create generated validation comp",
        tool: "create_comp",
        args: {
          name: compName,
          width: 640,
          height: 360,
          duration: 2,
          frameRate: 24,
          bgColor: [0.03, 0.04, 0.05],
          allowDuplicateName: false,
          openInViewer: false,
          comment: prefix
        }
      },
      {
        title: "Create generated validation layer",
        tool: "create_shape_layer",
        args: {
          name: layerName,
          shape: "rectangle",
          size: [240, 140],
          fillColor: [0.2, 0.75, 0.55],
          duration: 2
        },
        resultBindings: { compItemIndex: "{{compItemIndex}}" }
      },
      {
        title: "Add allowlisted effect",
        tool: "add_effect",
        args: {
          effect: effect.matchName,
          name: effectName
        },
        resultBindings: {
          compItemIndex: "{{compItemIndex}}",
          layerIndex: "{{layerIndex}}"
        }
      },
      {
        title: "Set generated layer opacity keyframes",
        tool: "set_property_keyframes",
        args: {
          propertyPath: "ADBE Transform Group.ADBE Opacity",
          keyframes: [
            { time: 0, value: 25 },
            { time: 1, value: 100 }
          ],
          clearExisting: true
        },
        resultBindings: {
          compItemIndex: "{{compItemIndex}}",
          layerIndex: "{{layerIndex}}"
        }
      },
      {
        title: "Read back generated layer details",
        tool: "get_layer_details",
        args: {
          includeProperties: true,
          propertyDepth: 2,
          propertyLimit: 100,
          includeValues: true
        },
        resultBindings: {
          compItemIndex: "{{compItemIndex}}",
          layerIndex: "{{layerIndex}}"
        }
      },
      {
        title: "Read back generated effect details",
        tool: "get_effect_details",
        args: {
          effectName,
          includeProperties: true,
          propertyDepth: 1,
          propertyLimit: 50
        },
        resultBindings: {
          compItemIndex: "{{compItemIndex}}",
          layerIndex: "{{layerIndex}}"
        }
      }
    ]
  };

  const dryRun = await postBridge(client, "/agents/plan/run", {
    plan,
    requestId: `m187-field-generated-dry-${Date.now()}`,
    dryRun: true,
    timeoutMs: 120000
  });
  if (!dryRun.run || dryRun.run.ok !== true) {
    throw new Error(dryRun.run && dryRun.run.error || "Generated mutation dry-run did not pass.");
  }

  const proposed = await proposePlan(client, plan, `m187-field-generated-run-${Date.now()}`);
  if (opts.dryRun) {
    return {
      ok: true,
      dryRunOnly: true,
      prefix,
      selectedEffect: effect,
      renderQueueBaselineTotal,
      dryRun: compactRun(dryRun.run),
      proposal: {
        actionId: proposed.proposal.actionId,
        riskLevel: proposed.proposal.risk.level,
        payloadRef: proposed.proposal.action.payloadRef
      }
    };
  }

  let run = null;
  let readBack = null;
  let cleanup = null;
  let failure = null;
  try {
    run = await runProposedPlan(client, proposed, false);
    const found = await callBridgeTool(client, "find_project_items", {
      query: compName,
      type: "comp",
      exactName: true,
      limit: 5
    });
    const compItem = found.matches && found.matches[0];
    if (!compItem || !compItem.itemIndex) {
      throw new Error(`Generated comp was not found after run: ${compName}`);
    }
    const comp = await callBridgeTool(client, "get_comp_details", {
      compItemIndex: compItem.itemIndex,
      includeLayers: true,
      layerLimit: 20
    });
    const layer = Array.isArray(comp.layers) ? comp.layers.find((item) => item.name === layerName) : null;
    if (!layer || !layer.index) {
      throw new Error(`Generated layer was not found after run: ${layerName}`);
    }
    const effects = await callBridgeTool(client, "list_effects", {
      compItemIndex: compItem.itemIndex,
      layerIndex: layer.index,
      includeProperties: true,
      includeValues: true
    });
    const effectMatch = Array.isArray(effects.effects)
      ? effects.effects.find((item) => item.name === effectName || item.matchName === effect.matchName)
      : null;
    if (!effectMatch) {
      throw new Error(`Generated effect was not found after run: ${effectName} (${effect.matchName})`);
    }
    const effectDetails = await callBridgeTool(client, "get_effect_details", {
      compItemIndex: compItem.itemIndex,
      layerIndex: layer.index,
      effectName,
      includeProperties: true,
      propertyDepth: 1,
      propertyLimit: 50,
      includeValues: true
    });
    const layerDetails = await callBridgeTool(client, "get_layer_details", {
      compItemIndex: compItem.itemIndex,
      layerIndex: layer.index,
      includeProperties: true,
      propertyDepth: 2,
      propertyLimit: 100,
      includeValues: true
    });
    const renderQueue = await callBridgeTool(client, "get_render_queue_status", { limit: 50 });
    if (Number(renderQueue.totalItems || 0) !== renderQueueBaselineTotal) {
      throw new Error(`Render queue drift before cleanup: expected ${renderQueueBaselineTotal}, got ${renderQueue.totalItems}.`);
    }
    readBack = {
      comp: { itemIndex: comp.itemIndex, name: comp.name, numLayers: comp.numLayers },
      layer: { index: layer.index, name: layer.name },
      effect: { name: effectMatch.name, matchName: effectMatch.matchName },
      effectPropertiesReturned: effectDetails.propertiesReturned || (effectDetails.properties || []).length || 0,
      layerPropertiesReturned: layerDetails.propertiesReturned || (layerDetails.properties || []).length || 0,
      renderQueueTotal: renderQueue.totalItems
    };
  } catch (error) {
    failure = error;
  }

  try {
    cleanup = await cleanupGeneratedPrefix(client, prefix, renderQueueBaselineTotal);
  } catch (error) {
    cleanup = { ok: false, error: error.message || String(error) };
    if (!failure) failure = error;
  }

  if (failure) {
    const detail = cleanup && cleanup.ok ? "cleanup completed" : `cleanup failed: ${cleanup && cleanup.error || "unknown"}`;
    throw new Error(`Generated mutating field smoke failed: ${failure.message || String(failure)}; ${detail}`);
  }

  return {
    ok: true,
    dryRunOnly: false,
    prefix,
    selectedEffect: effect,
    renderQueueBaselineTotal,
    dryRun: compactRun(dryRun.run),
    run: compactRun(run),
    readBack,
    cleanup
  };
}

function mockToolResult(payload) {
  return {
    ok: true,
    result: {
      content: [
        {
          type: "text",
          text: JSON.stringify(payload)
        }
      ]
    }
  };
}

function mockValidation(plan) {
  const steps = Array.isArray(plan && plan.steps) ? plan.steps : [];
  const mutatingCount = steps.filter((step) => MUTATING_TOOLS.has(String(step.tool || ""))).length;
  return {
    ok: true,
    validationId: `mock-${crypto.randomUUID()}`,
    stepCount: steps.length,
    executableCount: steps.filter((step) => step.tool).length,
    mutatingCount,
    unknownToolCount: 0,
    invalidStepCount: 0,
    requiresCheckpoint: mutatingCount > 1 || plan.requiresCheckpoint === true,
    warnings: [],
    classification: {
      category: mutatingCount ? "risky" : "safe typed-tool",
      blocksRun: false,
      allowsDryRun: true
    },
    steps: steps.map((step, index) => ({
      index: index + 1,
      title: step.title || step.tool,
      tool: step.tool || null,
      valid: true,
      executable: true,
      mutatesProject: MUTATING_TOOLS.has(String(step.tool || "")),
      safeArgs: step.args || {},
      resultBindings: step.resultBindings || {}
    }))
  };
}

function mockRun(plan, dryRun, action) {
  const validation = mockValidation(plan);
  return {
    ok: true,
    run: {
      id: crypto.randomUUID(),
      ok: true,
      dryRun,
      confirm: !dryRun,
      allowMutations: !dryRun,
      autoEditSession: !dryRun,
      validation,
      safety: {
        mutatingExecution: !dryRun && validation.mutatingCount > 0,
        protection: !dryRun && validation.mutatingCount > 0 ? "auto_edit_session" : null,
        status: !dryRun && validation.mutatingCount > 0 ? "protected" : null
      },
      steps: validation.steps.map((step) => ({
        index: step.index,
        title: step.title,
        tool: step.tool,
        status: dryRun ? "ready" : "completed",
        mutatesProject: step.mutatesProject,
        result: step.tool === "create_comp"
          ? { itemIndex: 101, name: "Mock Comp", type: "comp" }
          : step.tool === "create_shape_layer"
            ? { layer: { index: 1, name: "Mock Shape" }, comp: { itemIndex: 101, name: "Mock Comp" } }
            : {}
      })),
      m100Action: action || null,
      semanticVerification: dryRun ? null : { ok: true, summary: "mocked semantic verification" },
      finishedAt: new Date().toISOString()
    }
  };
}

function createMockProposal(plan, requestId) {
  const payload = { kind: "agent_plan", requestId, plan };
  const preview = JSON.stringify({ summary: plan.summary, stepCount: plan.steps.length });
  return {
    protocolVersion: "m100.v1",
    messageType: "action_proposal",
    status: "awaiting_confirmation",
    createdBy: "ae-agent-bridge",
    serverCreated: true,
    requestId,
    actionId: `act_${crypto.randomUUID()}`,
    summary: plan.summary,
    risk: {
      level: mockValidation(plan).mutatingCount > 0 ? "mutating" : "read_only",
      requiresConfirmation: true,
      reasons: ["mock proposal"]
    },
    action: {
      kind: "ae_tool",
      toolName: "run_ai_agent_plan",
      preview,
      payloadRef: `payload_${crypto.randomUUID()}`,
      payloadHash: crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
      previewHash: crypto.createHash("sha256").update(preview).digest("hex")
    },
    confirmation: {
      required: true,
      state: "pending",
      proposalExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      riskPolicyVersion: "m100-risk-v1",
      confirmationToken: `confirm_${crypto.randomBytes(24).toString("hex")}`,
      surface: "m188-live-validation",
      sessionId: `m188-${process.pid}`
    },
    logs: []
  };
}

async function startMockBridge() {
  const proposals = new Map();
  const server = http.createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const send = (status, payload) => {
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(payload));
      };
      const parsed = body ? JSON.parse(body) : {};
      if (req.method === "GET" && req.url.startsWith("/health")) {
        send(200, {
          ok: true,
          server: "mock-ae-agent-bridge",
          version: "2.0.0",
          panelConnected: true,
          pending: 0,
          inflight: 0,
          lastPanelInfo: { title: "AE Agent 2.0.0" }
        });
        return;
      }
      if (req.method === "POST" && req.url.startsWith("/tools/call")) {
        const name = parsed.name;
        const args = parsed.arguments || {};
        const toolPayloads = {
          get_bridge_status: {
            ok: true,
            version: "2.0.0",
            panelConnected: true,
            activeEditSession: null,
            pendingCommands: 0,
            inflightCommands: []
          },
          ping_ae: { ok: true, appName: "After Effects", version: "26.2x49", projectItems: 12 },
          get_project_info: { file: "C:\\Mock\\M187-field-smoke.aep", numItems: 12, activeItemName: "Mock Comp", activeItemType: "Composition" },
          get_render_queue_status: { totalItems: 0, returned: 0, items: [] },
          find_project_items: args.exactName
            ? { query: args.query, matches: [{ itemIndex: 101, name: args.query, type: "comp" }] }
            : { query: args.query, matches: [] },
          list_effect_presets: {
            presets: EFFECT_ALLOWLIST.map((matchName) => ({ matchName, name: matchName.replace(/^ADBE /, ""), category: "mock" })),
            returned: EFFECT_ALLOWLIST.length
          },
          get_comp_details: {
            itemIndex: 101,
            name: args.compName || "Mock Comp",
            type: "comp",
            numLayers: 1,
            layers: [{ index: 1, name: "Mock Shape", matchName: "ADBE Vector Layer" }]
          },
          get_layer_details: {
            comp: { itemIndex: 101, name: "Mock Comp" },
            layer: { index: 1, name: "Mock Shape" },
            propertiesReturned: 3,
            properties: []
          },
          list_effects: {
            comp: { itemIndex: 101, name: "Mock Comp" },
            layer: { index: 1, name: "Mock Shape" },
            effects: [{ index: 1, name: "Mock Effect", matchName: EFFECT_ALLOWLIST[0] }]
          },
          get_effect_details: {
            comp: { itemIndex: 101, name: "Mock Comp" },
            layer: { index: 1, name: "Mock Shape" },
            effect: { index: 1, name: "Mock Effect", matchName: EFFECT_ALLOWLIST[0] },
            propertiesReturned: 2,
            properties: []
          }
        };
        if (!toolPayloads[name]) {
          send(400, { ok: false, error: `Unknown mock tool: ${name}` });
          return;
        }
        send(200, mockToolResult(toolPayloads[name]));
        return;
      }
      if (req.method === "POST" && req.url.startsWith("/agents/plan/validate")) {
        send(200, { ok: true, validation: mockValidation(parsed.plan || {}) });
        return;
      }
      if (req.method === "POST" && req.url.startsWith("/agents/plan/propose")) {
        const proposal = createMockProposal(parsed.plan || {}, parsed.requestId || crypto.randomUUID());
        proposals.set(proposal.actionId, { proposal, plan: parsed.plan || {} });
        proposals.set(proposal.action.payloadRef, { proposal, plan: parsed.plan || {} });
        send(200, { ok: true, proposal, validation: mockValidation(parsed.plan || {}) });
        return;
      }
      if (req.method === "POST" && req.url.startsWith("/agents/plan/run")) {
        const record = proposals.get(parsed.actionId) || proposals.get(parsed.payloadRef);
        const plan = record ? record.plan : parsed.plan || {};
        send(200, mockRun(plan, parsed.dryRun === true, record ? {
          actionId: record.proposal.actionId,
          payloadRef: record.proposal.action.payloadRef,
          riskLevel: record.proposal.risk.level
        } : null));
        return;
      }
      send(404, { ok: false, error: "Not found" });
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    bridgeUrl: `http://127.0.0.1:${address.port}`,
    bridgeToken: "mock-token",
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function run(opts) {
  let mock = null;
  if (opts.mockBridge) {
    mock = await startMockBridge();
    opts.bridgeUrl = mock.bridgeUrl;
    opts.bridgeToken = mock.bridgeToken;
  }

  const client = {
    bridgeUrl: opts.bridgeUrl,
    bridgeToken: opts.bridgeToken
  };

  try {
    const report = {
      schemaVersion: REPORT_SCHEMA,
      generatedAt: new Date().toISOString(),
      stage: opts.stage,
      dryRun: opts.dryRun,
      mockBridge: opts.mockBridge,
      bridge: {
        url: opts.bridgeUrl,
        tokenProvided: Boolean(opts.bridgeToken)
      },
      generatedPrefix: opts.generatedPrefix,
      readOnly: null,
      mutating: null
    };

    if (opts.stage === "read-only" || opts.stage === "both") {
      report.readOnly = await runReadOnlyStage(client, opts);
    }
    if (opts.stage === "mutating" || opts.stage === "both") {
      report.mutating = await runMutatingStage(client, opts);
    }
    report.ok = true;
    return report;
  } finally {
    if (mock) await mock.close();
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(usage());
    return;
  }
  const report = await run(opts);
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`M187 advisory field smoke: ${report.ok ? "pass" : "failed"}`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  EFFECT_ALLOWLIST,
  REPORT_SCHEMA,
  buildPlans: validationPlans,
  parseArgs,
  run
};
