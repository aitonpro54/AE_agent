#!/usr/bin/env node
"use strict";

const http = require("http");
const https = require("https");
const {
  DEFAULT_CANDIDATE_DIR,
  DEFAULT_MAX_JSX_BYTES,
  checkExtendscriptCandidate,
  prepareExtendscriptCandidateRun,
  promoteSolutionCandidateHook,
  proposeExtendscriptCandidate,
  repoRelative
} = require("./jsx-lab");

const SERVER_NAME = "ae-agent-chatgpt-connector";
const SERVER_VERSION = "0.1.0";
const PROTOCOL_VERSION = "2025-03-26";
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8787;
const DEFAULT_BRIDGE_HOST = "127.0.0.1";
const DEFAULT_BRIDGE_PORT = 3456;
const DEFAULT_BRIDGE_TOKEN = "codex-ae-local";
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_BODY_LIMIT_BYTES = 1024 * 1024;
const CONNECTOR_MODE = "read-only-bridge-with-gated-jsx-lab";

const READ_ONLY_BRIDGE_TOOLS = [
  {
    name: "get_project_info",
    title: "Get project info",
    description: "Return basic After Effects project information.",
    inputSchema: objectSchema({})
  },
  {
    name: "get_project_snapshot",
    title: "Get project snapshot",
    description: "Return a compact snapshot of project items for navigation and review.",
    inputSchema: objectSchema({
      maxItems: numberField("Maximum number of project items to return. Defaults to 500, maximum 2000."),
      includeComps: booleanField("Whether to include compositions. Defaults to true."),
      includeFootage: booleanField("Whether to include footage items. Defaults to true."),
      includeFolders: booleanField("Whether to include folders. Defaults to true.")
    })
  },
  {
    name: "find_project_items",
    title: "Find project items",
    description: "Find project items by name substring, exact name, and optional item type.",
    inputSchema: objectSchema({
      query: stringField("Name substring or exact name to search for. Empty query returns the first results."),
      type: enumField(["comp", "footage", "folder"], "Optional project item type filter."),
      exactName: booleanField("Whether query must match the full item name. Defaults to false."),
      caseSensitive: booleanField("Whether name matching is case-sensitive. Defaults to false."),
      limit: numberField("Maximum number of items to return. Defaults to 25.")
    })
  },
  {
    name: "list_comps",
    title: "List comps",
    description: "List compositions in the current After Effects project.",
    inputSchema: objectSchema({})
  },
  {
    name: "list_layers",
    title: "List layers",
    description: "List layers for a composition by 1-based project item index.",
    inputSchema: objectSchema({
      compItemIndex: numberField("1-based project item index for the composition.")
    }, ["compItemIndex"])
  },
  {
    name: "get_comp_details",
    title: "Get comp details",
    description: "Return detailed information for a composition, optionally including its layers.",
    inputSchema: objectSchema({
      compItemIndex: numberField("Optional 1-based project item index for the composition. Defaults to active comp."),
      compName: stringField("Optional exact composition name to target when compItemIndex is not provided."),
      includeLayers: booleanField("Whether to include layer summaries. Defaults to true."),
      layerLimit: numberField("Maximum number of layers to include. Defaults to 200, maximum 1000."),
      includeMarkers: booleanField("Whether to include composition marker read-back from comp.markerProperty. Defaults to false."),
      markerLimit: numberField("Maximum number of composition markers to include. Defaults to 50, maximum 1000.")
    })
  },
  {
    name: "get_layer_details",
    title: "Get layer details",
    description: "Return detailed information for one layer, including source, transform, text, effects, masks, and optional property tree.",
    inputSchema: objectSchema({
      compItemIndex: numberField("Optional 1-based project item index for the target composition. Defaults to active comp."),
      compName: stringField("Optional exact composition name to target when compItemIndex is not provided."),
      layerIndex: numberField("1-based layer index in the target composition."),
      includeProperties: booleanField("Whether to include a property tree. Defaults to false."),
      propertyDepth: numberField("Property tree depth. Defaults to 1, maximum 5."),
      propertyLimit: numberField("Maximum property nodes to include. Defaults to 120, maximum 1000."),
      includeValues: booleanField("Whether to include compact value previews for properties. Defaults to false."),
      includeExpressions: booleanField("Whether to include expression text where available. Defaults to true.")
    }, ["layerIndex"])
  },
  {
    name: "get_layer_essential_properties",
    title: "Get layer essential properties",
    description: "Read Essential Properties exposed on one explicit precomp layer, including source evidence and expression state.",
    inputSchema: objectSchema({
      compItemIndex: numberField("Optional 1-based project item index for the target composition. Defaults to active comp."),
      compName: stringField("Optional exact composition name to target when compItemIndex is not provided."),
      layerIndex: numberField("1-based layer index in the target composition."),
      includeValues: booleanField("Whether to include compact value previews. Defaults to true."),
      includeExpressions: booleanField("Whether to include expression text and expression state. Defaults to true."),
      propertyLimit: numberField("Maximum Essential Properties to return. Defaults to 80, maximum 200.")
    }, ["layerIndex"])
  },
  {
    name: "get_essential_graphics_controllers",
    title: "Get Essential Graphics controllers",
    description: "Read the Essential Graphics / Motion Graphics Template controller list for one explicit composition.",
    inputSchema: objectSchema({
      compItemIndex: numberField("Optional 1-based project item index for the target composition. Defaults to active comp."),
      compName: stringField("Optional exact composition name to target when compItemIndex is not provided.")
    })
  },
  {
    name: "get_path_geometry",
    title: "Get path geometry",
    description: "Read one explicit Shape or Mask path geometry from one layer, including vertices, inTangents, outTangents, closed state, and optional keyframes.",
    inputSchema: objectSchema({
      compItemIndex: numberField("Optional 1-based project item index for the target composition. Defaults to active comp."),
      compName: stringField("Optional exact composition name to target when compItemIndex is not provided."),
      layerIndex: numberField("Required 1-based layer index in the target composition."),
      targetKind: stringField("Path target kind: shape or mask."),
      propertyPath: stringField("Required for targetKind=shape. Exact property path to an ADBE Vector Shape path property."),
      maskIndex: numberField("Required for targetKind=mask. 1-based mask index in the layer mask group."),
      expectedLayerName: stringField("Optional exact layer name guard."),
      expectedMaskName: stringField("Optional exact mask name guard for targetKind=mask."),
      includeKeyframes: booleanField("Whether to include up to keyframeLimit Shape keyframes. Defaults to true."),
      keyframeLimit: numberField("Maximum keyframes to include. Defaults to 80, maximum 80.")
    }, ["layerIndex", "targetKind"])
  },
  {
    name: "list_effect_presets",
    title: "List effect presets",
    description: "Return curated After Effects effect matchName presets and automation hints.",
    inputSchema: objectSchema({
      query: stringField("Optional case-insensitive search across name, matchName, category, description, and notes."),
      category: stringField("Optional category filter such as color, blur, stylize, distort, or perspective."),
      includePropertyHints: booleanField("Whether to include curated property hints when known. Defaults to true."),
      limit: numberField("Maximum number of presets to return. Defaults to 50, maximum 100.")
    })
  },
  {
    name: "list_effects",
    title: "List effects",
    description: "Return effects applied to a layer, optionally including first-level effect properties.",
    inputSchema: objectSchema({
      compItemIndex: numberField("Optional 1-based project item index for the target composition. Defaults to active comp."),
      compName: stringField("Optional exact composition name to target when compItemIndex is not provided."),
      layerIndex: numberField("1-based layer index in the target composition."),
      includeProperties: booleanField("Whether to include first-level effect properties. Defaults to false."),
      includeValues: booleanField("Whether to include compact value previews for properties. Defaults to false."),
      includeExpressions: booleanField("Whether to include expression text where available. Defaults to true.")
    }, ["layerIndex"])
  },
  {
    name: "get_effect_details",
    title: "Get effect details",
    description: "Return detailed information for one layer effect, including optional property tree.",
    inputSchema: objectSchema({
      compItemIndex: numberField("Optional 1-based project item index for the target composition. Defaults to active comp."),
      compName: stringField("Optional exact composition name to target when compItemIndex is not provided."),
      layerIndex: numberField("1-based layer index in the target composition."),
      effectIndex: numberField("Optional 1-based effect index in the layer effects group."),
      effectName: stringField("Optional exact effect instance name."),
      effectMatchName: stringField("Optional effect matchName, such as ADBE Fill."),
      includeProperties: booleanField("Whether to include a property tree. Defaults to true."),
      propertyDepth: numberField("Property tree depth below each effect property. Defaults to 1, maximum 5."),
      propertyLimit: numberField("Maximum property nodes to include. Defaults to 120, maximum 1000."),
      includeValues: booleanField("Whether to include compact value previews for properties. Defaults to true."),
      includeExpressions: booleanField("Whether to include expression text where available. Defaults to true.")
    }, ["layerIndex"])
  },
  {
    name: "get_active_comp",
    title: "Get active comp",
    description: "Return details about the active After Effects composition and its selected layers.",
    inputSchema: objectSchema({})
  },
  {
    name: "get_selected_layers",
    title: "Get selected layers",
    description: "Return selected layers in the active composition.",
    inputSchema: objectSchema({})
  },
  {
    name: "get_selected_properties",
    title: "Get selected properties",
    description: "Return selected properties in the active composition, including layer context when available.",
    inputSchema: objectSchema({
      includeValues: booleanField("Whether to include compact value previews. Defaults to true."),
      includeExpressions: booleanField("Whether to include expression text where available. Defaults to true.")
    })
  },
  {
    name: "find_comps",
    title: "Find comps",
    description: "Find compositions by case-insensitive name substring.",
    inputSchema: objectSchema({
      query: stringField("Case-insensitive substring to search for. Empty query returns the first results."),
      limit: numberField("Maximum number of compositions to return. Defaults to 25.")
    })
  },
  {
    name: "get_render_queue_status",
    title: "Get render queue status",
    description: "Return compact status for After Effects render queue items.",
    inputSchema: objectSchema({
      limit: numberField("Maximum render queue items to return. Defaults to 50.")
    })
  }
];

const LOCAL_TOOLS = [
  {
    name: "get_connector_status",
    title: "Get connector status",
    description: "Return the local ChatGPT connector status, bridge reachability, and the read-only AE tools exposed to ChatGPT.",
    inputSchema: objectSchema({
      checkBridge: booleanField("Whether to make a short bridge health request. Defaults to true.")
    }),
    local: true
  },
  {
    name: "propose_extendscript_candidate",
    title: "Propose ExtendScript candidate",
    description: "Save a raw JSX/ExtendScript candidate into local ignored quarantine for later static checks. This never executes JSX and never calls After Effects.",
    inputSchema: objectSchema({
      title: stringField("Short candidate title."),
      intentSummary: stringField("What the JSX candidate is intended to accomplish."),
      jsx: stringField("Raw JSX/ExtendScript source to save in quarantine. It will not be executed."),
      tags: stringArrayField("Optional short tags for later review."),
      appliesWhen: stringArrayField("Optional conditions where this candidate may apply."),
      expectedOutcome: stringField("Optional expected user-visible result."),
      riskNotes: stringField("Optional known risks or review notes.")
    }, ["title", "intentSummary", "jsx"]),
    local: true,
    handler: "proposeExtendscriptCandidate",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: false
    }
  },
  {
    name: "check_extendscript_candidate",
    title: "Check ExtendScript candidate",
    description: "Run offline syntax, size, static risk, and denylist checks for a saved JSX Lab candidate. This never executes JSX and never calls After Effects.",
    inputSchema: objectSchema({
      metadataPath: stringField("Relative metadata path returned by propose_extendscript_candidate.")
    }, ["metadataPath"]),
    local: true,
    handler: "checkExtendscriptCandidate",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true
    }
  },
  {
    name: "run_extendscript_candidate",
    title: "Run checked ExtendScript candidate",
    description: "Run a saved JSX Lab candidate only through the bridge Agent plan runner after explicit confirmation, accepted static checks, checkpoint/edit-session protection, generated-prefix evidence, and read-back configuration.",
    inputSchema: objectSchema({
      metadataPath: stringField("Relative metadata path returned by propose_extendscript_candidate."),
      confirm: booleanField("Must be true to confirm this gated candidate run."),
      allowMutations: booleanField("Must be true. The bridge plan runner still enforces mutation gates."),
      autoEditSession: booleanField("Must be true so the bridge creates protected checkpoint/edit-session coverage when needed."),
      confirmedJsxSha256: stringField("Candidate JSX SHA-256 copied from check_extendscript_candidate."),
      expectedGeneratedPrefix: stringField("Generated item/text prefix expected in the JSX source and later read-back evidence."),
      dryRun: booleanField("When true, validate through the bridge plan runner without executing. Defaults to true."),
      timeoutMs: numberField("Optional ExtendScript execution timeout in milliseconds."),
      requestId: stringField("Optional stable request id for the bridge plan runner."),
      readBackToolCalls: {
        type: "array",
        description: "Required for real runs. Read-only bridge tool calls to verify the result after execution.",
        items: objectSchema({
          name: stringField("Read-only bridge tool name, such as get_active_comp or get_comp_details."),
          arguments: {
            type: "object",
            description: "Arguments for the read-only bridge tool."
          }
        }, ["name"])
      }
    }, ["metadataPath", "confirm", "allowMutations", "autoEditSession", "confirmedJsxSha256", "expectedGeneratedPrefix"]),
    local: true,
    handler: "runExtendscriptCandidate",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: false
    }
  },
  {
    name: "promote_solution_candidate",
    title: "Prepare solution promotion hook",
    description: "Create an ignored Solution Library candidate report from a JSX Lab candidate for explicit human review. This never writes the tracked registry and blocks direct candidate-to-tool promotion.",
    inputSchema: objectSchema({
      metadataPath: stringField("Relative metadata path returned by propose_extendscript_candidate."),
      targetStatus: enumField(["recipe", "typed-tool-candidate"], "Tracked lifecycle status to prepare for explicit review."),
      promotionRationale: stringField("Short rationale for why this candidate merits review."),
      affectedTargets: stringArrayField("Optional compact target summary lines."),
      affectedTargetSummary: stringField("Optional one-line target summary."),
      runSummary: stringField("Optional summary of a prior gated candidate run."),
      verificationSummary: stringField("Optional read-back summary from prior verification."),
      verificationEvidence: stringArrayField("Optional compact read-back evidence lines."),
      projectAssumptions: stringArrayField("Optional project assumptions, without absolute paths or secrets.")
    }, ["metadataPath", "targetStatus", "promotionRationale"]),
    local: true,
    handler: "promoteSolutionCandidate",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: false
    }
  }
];

const READ_ONLY_TOOL_NAMES = READ_ONLY_BRIDGE_TOOLS.map((tool) => tool.name);
const ALL_TOOL_DESCRIPTORS = LOCAL_TOOLS.concat(READ_ONLY_BRIDGE_TOOLS).map(toMcpToolDescriptor);
const TOOL_BY_NAME = new Map(LOCAL_TOOLS.concat(READ_ONLY_BRIDGE_TOOLS).map((tool) => [tool.name, tool]));

function objectSchema(properties, required) {
  const schema = { type: "object", properties: properties || {} };
  if (required && required.length) schema.required = required;
  return schema;
}

function stringField(description) {
  return { type: "string", description };
}

function numberField(description) {
  return { type: "number", description };
}

function booleanField(description) {
  return { type: "boolean", description };
}

function stringArrayField(description) {
  return { type: "array", items: { type: "string" }, description };
}

function enumField(values, description) {
  return { type: "string", enum: values, description };
}

function toMcpToolDescriptor(tool) {
  const annotations = Object.assign({
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true
  }, tool.annotations || {});
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations
  };
}

function getConfig(overrides) {
  const bridgeUrl = overrides.bridgeUrl || process.env.AE_CHATGPT_CONNECTOR_BRIDGE_URL || `http://${process.env.AE_BRIDGE_HOST || DEFAULT_BRIDGE_HOST}:${process.env.AE_BRIDGE_PORT || DEFAULT_BRIDGE_PORT}`;
  return {
    host: overrides.host || process.env.AE_CHATGPT_CONNECTOR_HOST || DEFAULT_HOST,
    port: Number(overrides.port || process.env.AE_CHATGPT_CONNECTOR_PORT || DEFAULT_PORT),
    bridgeUrl,
    bridgeToken: overrides.bridgeToken || process.env.AE_BRIDGE_TOKEN || DEFAULT_BRIDGE_TOKEN,
    connectorToken: overrides.connectorToken || process.env.AE_CHATGPT_CONNECTOR_TOKEN || "",
    timeoutMs: Number(overrides.timeoutMs || process.env.AE_CHATGPT_CONNECTOR_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
    bodyLimitBytes: Number(overrides.bodyLimitBytes || process.env.AE_CHATGPT_CONNECTOR_BODY_LIMIT_BYTES || DEFAULT_BODY_LIMIT_BYTES),
    candidateDir: overrides.candidateDir || process.env.AE_CHATGPT_CONNECTOR_CANDIDATE_DIR || DEFAULT_CANDIDATE_DIR,
    solutionCandidateDir: overrides.solutionCandidateDir || process.env.AE_CHATGPT_CONNECTOR_SOLUTION_CANDIDATE_DIR || "",
    maxCandidateJsxBytes: Number(overrides.maxCandidateJsxBytes || process.env.AE_CHATGPT_CONNECTOR_MAX_JSX_BYTES || DEFAULT_MAX_JSX_BYTES),
    publicUrl: overrides.publicUrl || process.env.AE_CHATGPT_CONNECTOR_PUBLIC_URL || process.env.AE_CHATGPT_CONNECTOR_TUNNEL_URL || "",
    writeActionsEnabled: booleanConfig(overrides.writeActionsEnabled, process.env.AE_CHATGPT_CONNECTOR_WRITE_ACTIONS, false),
    emergencyDisabled: booleanConfig(overrides.emergencyDisabled, process.env.AE_CHATGPT_CONNECTOR_EMERGENCY_DISABLE, false)
  };
}

function booleanConfig(overrideValue, envValue, fallback) {
  if (typeof overrideValue === "boolean") return overrideValue;
  const text = String(envValue === undefined || envValue === null ? "" : envValue).trim().toLowerCase();
  if (!text) return Boolean(fallback);
  return ["1", "true", "yes", "on"].includes(text);
}

function safeBridgeOrigin(bridgeUrl) {
  try {
    const parsed = new URL(bridgeUrl);
    return parsed.origin;
  } catch (_error) {
    return "invalid-bridge-url";
  }
}

function safeOrigin(value) {
  if (!value) return "";
  try {
    return new URL(value).origin;
  } catch (_error) {
    return "invalid-url";
  }
}

function createRuntimeState(config) {
  return {
    startedAt: new Date().toISOString(),
    emergencyDisabled: Boolean(config.emergencyDisabled),
    lastToolCall: null
  };
}

function effectiveWriteActionsEnabled(config, state) {
  return Boolean(config.writeActionsEnabled) && !(state && state.emergencyDisabled);
}

function toolSnapshot() {
  return ALL_TOOL_DESCRIPTORS.map((tool) => ({
    name: tool.name,
    readOnly: tool.annotations && tool.annotations.readOnlyHint === true,
    bridgeProxy: READ_ONLY_TOOL_NAMES.includes(tool.name)
  }));
}

function toolArgumentKeys(args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) return [];
  return Object.keys(args).sort().slice(0, 20);
}

function recordToolCall(state, name, args, result, startedAt) {
  if (!state) return;
  state.lastToolCall = {
    name,
    calledAt: new Date().toISOString(),
    ok: !(result && result.isError),
    durationMs: Date.now() - startedAt,
    argumentKeys: toolArgumentKeys(args)
  };
}

function isWriteLikeLocalTool(tool) {
  return Boolean(tool && tool.local && tool.annotations && tool.annotations.readOnlyHint === false);
}

function jsonResponse(res, statusCode, body) {
  const text = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(statusCode, {
    "access-control-allow-headers": "authorization, content-type, mcp-session-id, x-ae-chatgpt-connector-token",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-origin": "*",
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text)
  });
  res.end(text);
}

function hasValidConnectorToken(req, config) {
  if (!config.connectorToken) return true;
  const authorization = String(req.headers.authorization || "");
  const headerToken = String(req.headers["x-ae-chatgpt-connector-token"] || "");
  return authorization === `Bearer ${config.connectorToken}` || headerToken === config.connectorToken;
}

function readJsonBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;

    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > limitBytes) {
        reject(new Error(`Request body exceeds ${limitBytes} bytes.`));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error(`Invalid JSON body: ${error.message}`));
      }
    });
    req.on("error", reject);
  });
}

function bridgeRequest(config, method, requestPath, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    let target;
    try {
      target = new URL(requestPath, config.bridgeUrl.endsWith("/") ? config.bridgeUrl : `${config.bridgeUrl}/`);
    } catch (error) {
      reject(new Error(`Invalid bridge URL: ${error.message}`));
      return;
    }

    const body = payload === undefined ? "" : JSON.stringify(payload);
    const transport = target.protocol === "https:" ? https : http;
    const req = transport.request({
      hostname: target.hostname,
      port: target.port || (target.protocol === "https:" ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      method,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        "x-ae-bridge-token": config.bridgeToken
      },
      timeout: timeoutMs || config.timeoutMs
    }, (res) => {
      let responseBody = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        responseBody += chunk;
      });
      res.on("end", () => {
        let parsed = {};
        try {
          parsed = responseBody ? JSON.parse(responseBody) : {};
        } catch (error) {
          reject(new Error(`Bridge returned invalid JSON from ${requestPath}: ${error.message}`));
          return;
        }
        resolve({ status: res.statusCode || 0, body: parsed });
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error(`Bridge request timed out after ${timeoutMs || config.timeoutMs}ms`));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function parseToolText(text) {
  if (typeof text !== "string") return text;
  try {
    return JSON.parse(text);
  } catch (_error) {
    return text;
  }
}

function toolResult(value, isError) {
  const result = {
    content: [{
      type: "text",
      text: typeof value === "string" ? value : JSON.stringify(value, null, 2)
    }]
  };
  if (isError) result.isError = true;
  if (!isError && value && typeof value === "object") {
    result.structuredContent = value;
  }
  return result;
}

function normalizeBridgeToolResult(toolName, bridgeResult) {
  if (!bridgeResult || !Array.isArray(bridgeResult.content)) {
    return toolResult({
      bridgeTool: toolName,
      result: bridgeResult === undefined ? null : bridgeResult
    }, false);
  }

  const normalized = {
    content: bridgeResult.content
  };
  if (bridgeResult.isError) normalized.isError = true;
  if (bridgeResult.structuredContent !== undefined) {
    normalized.structuredContent = bridgeResult.structuredContent;
  } else {
    const firstText = bridgeResult.content.find((item) => item && item.type === "text");
    normalized.structuredContent = {
      bridgeTool: toolName,
      result: parseToolText(firstText ? firstText.text : "")
    };
  }
  return normalized;
}

async function getBridgeHealth(config) {
  const response = await bridgeRequest(config, "GET", "/health", undefined, Math.min(config.timeoutMs, 1500));
  if (response.status !== 200 || !response.body || !response.body.ok) {
    throw new Error(response.body && response.body.error ? response.body.error : `Bridge health failed with HTTP ${response.status}`);
  }
  return response.body;
}

async function buildConnectorStatus(config, args, state) {
  const checkBridge = !args || args.checkBridge !== false;
  const status = {
    connector: {
      name: SERVER_NAME,
      version: SERVER_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      connected: true,
      mode: CONNECTOR_MODE,
      writeToolsExposed: false,
      bridgeWriteToolsExposed: false,
      rawExtendscriptExposed: false,
      localQuarantineWrites: true,
      gatedCandidateRunExposed: true,
      writeActionsEnabled: effectiveWriteActionsEnabled(config, state),
      emergencyDisabled: Boolean(state && state.emergencyDisabled),
      openAiApiCalls: false,
      localEndpoint: `http://${config.host}:${config.port}`,
      publicUrlConfigured: Boolean(config.publicUrl),
      publicUrlOrigin: safeOrigin(config.publicUrl),
      bridgeOrigin: safeBridgeOrigin(config.bridgeUrl),
      candidateLocation: repoRelative(config.candidateDir),
      candidateTools: ["propose_extendscript_candidate", "check_extendscript_candidate", "run_extendscript_candidate", "promote_solution_candidate"],
      exposedToolCount: ALL_TOOL_DESCRIPTORS.length,
      exposedBridgeTools: READ_ONLY_TOOL_NAMES,
      exposedToolsSnapshot: toolSnapshot(),
      lastToolCall: state && state.lastToolCall ? state.lastToolCall : null
    },
    bridge: {
      checked: checkBridge
    }
  };

  if (checkBridge) {
    try {
      const health = await getBridgeHealth(config);
      status.bridge = {
        checked: true,
        ok: true,
        server: health.server || null,
        version: health.version || null,
        panelConnected: Boolean(health.panelConnected),
        pendingCommands: Number(health.pendingCommands || 0),
        inflightCommands: Number(health.inflightCommands || 0)
      };
    } catch (error) {
      status.bridge = {
        checked: true,
        ok: false,
        error: error.message || String(error)
      };
    }
  }

  return status;
}

async function getConnectorStatus(config, args, state) {
  return toolResult(await buildConnectorStatus(config, args, state), false);
}

function assertReadBackAllowed(call) {
  if (!READ_ONLY_TOOL_NAMES.includes(call.name)) {
    throw new Error(`read-back tool is not in the connector read-only allowlist: ${call.name}`);
  }
}

async function callBridgeTool(config, name, args) {
  const response = await bridgeRequest(config, "POST", "/tools/call", {
    name,
    arguments: args || {}
  });
  if (response.status !== 200 || !response.body || !response.body.ok) {
    throw new Error(response.body && response.body.error ? response.body.error : `HTTP ${response.status}`);
  }
  return normalizeBridgeToolResult(name, response.body.result);
}

async function createBridgePlanProposal(config, prepared, timeoutMs) {
  const response = await bridgeRequest(config, "POST", "/agents/plan/propose", {
    plan: prepared.planRunPayload.plan,
    requestId: prepared.planRunPayload.requestId,
    repairPlan: true,
    m100ConfirmationSurface: "chatgpt-connector",
    m100ConfirmationSessionId: prepared.candidateId
  }, timeoutMs);
  if (response.status !== 200 || !response.body || response.body.ok !== true || !response.body.proposal) {
    throw new Error(response.body && response.body.error ? response.body.error : `Bridge plan proposal failed with HTTP ${response.status}`);
  }
  return response.body.proposal;
}

function bridgePlanRunFieldsForProposal(proposal, includeConfirmation) {
  const action = proposal && proposal.action || {};
  const confirmation = proposal && proposal.confirmation || {};
  const risk = proposal && proposal.risk || {};
  const fields = {
    actionId: proposal && proposal.actionId,
    payloadRef: action.payloadRef,
    payloadHash: action.payloadHash,
    previewHash: action.previewHash,
    riskLevel: risk.level,
    riskPolicyVersion: confirmation.riskPolicyVersion,
    requestId: proposal && proposal.requestId
  };
  if (includeConfirmation) {
    fields.confirmationToken = confirmation.confirmationToken;
    fields.confirmedBySurface = confirmation.surface || "chatgpt-connector";
    fields.confirmedBySession = confirmation.sessionId || "";
  }
  return fields;
}

function bridgePlanRunPayloadForProposal(prepared, proposal, overrides) {
  return Object.assign({
    dryRun: prepared.dryRun,
    confirm: prepared.planRunPayload.confirm,
    allowMutations: prepared.planRunPayload.allowMutations,
    autoEditSession: prepared.planRunPayload.autoEditSession,
    allowRawExtendscript: prepared.planRunPayload.allowRawExtendscript,
    maxSteps: prepared.planRunPayload.maxSteps
  }, bridgePlanRunFieldsForProposal(proposal, prepared.dryRun !== true), overrides || {});
}

async function runExtendscriptCandidate(config, args) {
  const prepared = prepareExtendscriptCandidateRun(config, args || {});
  for (const call of prepared.readBackToolCalls) {
    assertReadBackAllowed(call);
  }
  const timeoutMs = Number(args && args.timeoutMs) || config.timeoutMs;
  const actionProposal = await createBridgePlanProposal(config, prepared, timeoutMs);
  let preflightDryRun = null;
  let planRunPayload = bridgePlanRunPayloadForProposal(prepared, actionProposal);
  if (!prepared.dryRun) {
    const dryRunPayload = bridgePlanRunPayloadForProposal(prepared, actionProposal, {
      dryRun: true,
      confirm: true,
      allowRawExtendscript: false
    });
    const dryRunResponse = await bridgeRequest(config, "POST", "/agents/plan/run", dryRunPayload, timeoutMs);
    if (!dryRunResponse.body || !dryRunResponse.body.run) {
      throw new Error(dryRunResponse.body && dryRunResponse.body.error ? dryRunResponse.body.error : `Bridge plan dry run failed with HTTP ${dryRunResponse.status}`);
    }
    preflightDryRun = dryRunResponse.body.run;
    if (dryRunResponse.body.ok !== true) {
      return {
        schemaVersion: prepared.schemaVersion,
        status: "blocked",
        candidateId: prepared.candidateId,
        dryRun: prepared.dryRun,
        metadataPath: prepared.paths.metadataPath,
        jsxPath: prepared.paths.jsxPath,
        jsxSha256: prepared.staticCheck.jsxSha256,
        staticCheck: {
          status: prepared.staticCheck.status,
          summary: prepared.staticCheck.summary,
          findings: prepared.staticCheck.findings
        },
        bridgePlanRun: preflightDryRun,
        preflightDryRun,
        readBack: [],
        safety: Object.assign({}, prepared.safety, {
          bridgeCalled: true,
          rawExtendscriptDryRunRequired: true,
          rawExtendscriptDryRunId: preflightDryRun.id || "",
          aeMutated: false,
          readBackCompleted: false
        })
      };
    }
    planRunPayload = bridgePlanRunPayloadForProposal(prepared, actionProposal, {
      rawExtendscriptDryRunId: preflightDryRun.id || ""
    });
  }

  const response = await bridgeRequest(config, "POST", "/agents/plan/run", planRunPayload, timeoutMs);
  if (!response.body || !response.body.run) {
    throw new Error(response.body && response.body.error ? response.body.error : `Bridge plan run failed with HTTP ${response.status}`);
  }

  const readBack = [];
  if (!prepared.dryRun && response.body.ok === true) {
    for (const call of prepared.readBackToolCalls) {
      const result = await callBridgeTool(config, call.name, call.arguments);
      readBack.push({
        name: call.name,
        ok: !result.isError,
        result: result.structuredContent || null
      });
    }
  }

  return {
    schemaVersion: prepared.schemaVersion,
    status: response.body.ok ? (prepared.dryRun ? "dry-run-ready" : "completed") : "blocked",
    candidateId: prepared.candidateId,
    dryRun: prepared.dryRun,
    metadataPath: prepared.paths.metadataPath,
    jsxPath: prepared.paths.jsxPath,
    jsxSha256: prepared.staticCheck.jsxSha256,
    staticCheck: {
      status: prepared.staticCheck.status,
      summary: prepared.staticCheck.summary,
      findings: prepared.staticCheck.findings
    },
    bridgePlanRun: response.body.run,
    preflightDryRun,
    readBack,
    safety: Object.assign({}, prepared.safety, {
      bridgeCalled: true,
      rawExtendscriptDryRunRequired: !prepared.dryRun,
      rawExtendscriptDryRunId: preflightDryRun && preflightDryRun.id ? preflightDryRun.id : "",
      aeMutated: !prepared.dryRun && response.body.ok === true,
      readBackCompleted: prepared.dryRun ? false : readBack.length > 0
    })
  };
}

async function callConnectorTool(config, state, name, args) {
  const startedAt = Date.now();
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) {
    const result = toolResult(`Unknown or unavailable read-only connector tool: ${name}`, true);
    recordToolCall(state, name, args, result, startedAt);
    return result;
  }
  if (tool.local) {
    try {
      if (state && state.emergencyDisabled && isWriteLikeLocalTool(tool)) {
        throw new Error("Connector emergency disable is active; local write actions are blocked until restart.");
      }
      if (tool.handler === "proposeExtendscriptCandidate") {
        const result = toolResult(proposeExtendscriptCandidate(config, args || {}), false);
        recordToolCall(state, name, args, result, startedAt);
        return result;
      }
      if (tool.handler === "checkExtendscriptCandidate") {
        const result = toolResult(checkExtendscriptCandidate(config, args || {}), false);
        recordToolCall(state, name, args, result, startedAt);
        return result;
      }
      if (tool.handler === "runExtendscriptCandidate") {
        if (!effectiveWriteActionsEnabled(config, state)) {
          throw new Error("run_extendscript_candidate is disabled. Set AE_CHATGPT_CONNECTOR_WRITE_ACTIONS=1 and restart the connector to enable gated AE write actions.");
        }
        const result = toolResult(await runExtendscriptCandidate(config, args || {}), false);
        recordToolCall(state, name, args, result, startedAt);
        return result;
      }
      if (tool.handler === "promoteSolutionCandidate") {
        const result = toolResult(promoteSolutionCandidateHook(config, args || {}), false);
        recordToolCall(state, name, args, result, startedAt);
        return result;
      }
      const result = await getConnectorStatus(config, args || {}, state);
      recordToolCall(state, name, args, result, startedAt);
      return result;
    } catch (error) {
      const result = toolResult(`Connector local tool failed for ${name}: ${error.message || String(error)}`, true);
      recordToolCall(state, name, args, result, startedAt);
      return result;
    }
  }

  try {
    const result = await callBridgeTool(config, name, args || {});
    recordToolCall(state, name, args, result, startedAt);
    return result;
  } catch (error) {
    const result = toolResult(`Bridge proxy failed for ${name}: ${error.message || String(error)}`, true);
    recordToolCall(state, name, args, result, startedAt);
    return result;
  }
}

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: "2.0", id, error };
}

async function handleRpcMessage(config, state, message) {
  if (!message || message.jsonrpc !== "2.0") {
    return rpcError(message && message.id !== undefined ? message.id : null, -32600, "Invalid JSON-RPC request.");
  }

  const id = message.id;
  if (id === undefined || id === null) {
    return undefined;
  }

  if (message.method === "initialize") {
    return rpcResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: {
        name: SERVER_NAME,
        version: SERVER_VERSION
      }
    });
  }

  if (message.method === "tools/list") {
    return rpcResult(id, { tools: ALL_TOOL_DESCRIPTORS });
  }

  if (message.method === "tools/call") {
    const params = message.params || {};
    const result = await callConnectorTool(config, state, String(params.name || ""), params.arguments || {});
    return rpcResult(id, result);
  }

  return rpcError(id, -32601, `Method not found: ${message.method}`);
}

async function handleRpcBody(config, state, body) {
  if (Array.isArray(body)) {
    const responses = [];
    for (const message of body) {
      const response = await handleRpcMessage(config, state, message);
      if (response) responses.push(response);
    }
    return responses.length ? responses : undefined;
  }
  return await handleRpcMessage(config, state, body);
}

function createServer(options) {
  const config = getConfig(options || {});
  const state = createRuntimeState(config);
  return http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      jsonResponse(res, 204);
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);

    if (url.pathname === "/health" && req.method === "GET") {
      jsonResponse(res, 200, {
        ok: true,
        server: SERVER_NAME,
        version: SERVER_VERSION,
        mode: CONNECTOR_MODE,
        bridgeOrigin: safeBridgeOrigin(config.bridgeUrl),
        exposedToolCount: ALL_TOOL_DESCRIPTORS.length,
        writeActionsEnabled: effectiveWriteActionsEnabled(config, state),
        emergencyDisabled: Boolean(state.emergencyDisabled)
      });
      return;
    }

    if (url.pathname === "/status" && req.method === "GET") {
      const checkBridge = url.searchParams.get("checkBridge") !== "0";
      jsonResponse(res, 200, {
        ok: true,
        status: await buildConnectorStatus(config, { checkBridge }, state)
      });
      return;
    }

    if (url.pathname === "/emergency-disable" && req.method === "POST") {
      if (!hasValidConnectorToken(req, config)) {
        jsonResponse(res, 401, { ok: false, error: "Unauthorized" });
        return;
      }
      state.emergencyDisabled = true;
      jsonResponse(res, 200, {
        ok: true,
        status: await buildConnectorStatus(config, { checkBridge: false }, state)
      });
      return;
    }

    if (url.pathname !== "/mcp") {
      jsonResponse(res, 404, { ok: false, error: "Not found" });
      return;
    }

    if (!hasValidConnectorToken(req, config)) {
      jsonResponse(res, 401, { ok: false, error: "Unauthorized" });
      return;
    }

    if (req.method !== "POST") {
      jsonResponse(res, 405, { ok: false, error: "Use POST for MCP JSON-RPC requests." });
      return;
    }

    try {
      const body = await readJsonBody(req, config.bodyLimitBytes);
      const response = await handleRpcBody(config, state, body);
      if (response === undefined) {
        jsonResponse(res, 202, { ok: true });
        return;
      }
      jsonResponse(res, 200, response);
    } catch (error) {
      jsonResponse(res, 400, rpcError(null, -32700, error.message || String(error)));
    }
  });
}

function startServer(options) {
  const config = getConfig(options || {});
  const server = createServer(config);
  server.listen(config.port, config.host, () => {
    process.stderr.write(`[${SERVER_NAME}] listening on http://${config.host}:${config.port}/mcp\n`);
    process.stderr.write(`[${SERVER_NAME}] bridge proxy target ${safeBridgeOrigin(config.bridgeUrl)}\n`);
    process.stderr.write(`[${SERVER_NAME}] gated AE write actions ${config.writeActionsEnabled ? "enabled" : "disabled"}\n`);
  });
  server.on("error", (error) => {
    process.stderr.write(`[${SERVER_NAME}] server error: ${error.message}\n`);
    process.exitCode = 1;
  });
  return server;
}

module.exports = {
  ALL_TOOL_DESCRIPTORS,
  READ_ONLY_BRIDGE_TOOL_NAMES: READ_ONLY_TOOL_NAMES,
  SERVER_NAME,
  SERVER_VERSION,
  callConnectorTool,
  createServer,
  getConnectorStatus,
  startServer
};

if (require.main === module) {
  startServer();
}
