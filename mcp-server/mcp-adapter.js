#!/usr/bin/env node
"use strict";

const http = require("http");
const readline = require("readline");
const { TEXT_LAYOUT_POLICY } = require("./text-layout-policy");
const { decorateToolResult, sanitizeHttpFailure } = require("./tool-error-response");
const { isPanelControlTool } = require("./cep-panel-control");
const {
  productionUsageTools,
  isProductionUsageTool,
  handleProductionUsageTool
} = require("./production-usage-tools");

const SERVER_NAME = "codex-ae-mcp-adapter";
const SERVER_VERSION = "3.3.1";
const PROTOCOL_VERSION = "2025-03-26";
const DAEMON_HOST = process.env.AE_BRIDGE_HOST || "127.0.0.1";
const DAEMON_PORT = Number(process.env.AE_BRIDGE_PORT || 3456);
const TOKEN = process.env.AE_BRIDGE_TOKEN || "";
const DAEMON_TIMEOUT_MS = Number(process.env.AE_DAEMON_HTTP_TIMEOUT_MS || 125000);
const AUTO_START_DAEMON = process.env.AE_DAEMON_AUTO_START !== "0";
const trustedSourceCensus=require("./owned-runtime-initial-source-census");
const initialRuntime = require("./owned-runtime-initial-runtime").createInitialRuntime();
const OWNED_TOOL_METHODS=Object.freeze({get_owned_runtime_status:"status",ensure_owned_runtime_daemon:"ensure",restart_owned_runtime_daemon:"restart",shutdown_owned_runtime_daemon:"shutdown"});
const ownedRuntimeTools=Object.entries(OWNED_TOOL_METHODS).map(([name,method])=>({name,description:method==="status"?"Read privately registered owned daemon status and retained lifecycle evidence.":"Perform the named owned daemon operation using fixed private authority, persistent user policy and one-shot journal. Unknown effects are read-back only.",inputSchema:{type:"object",additionalProperties:false,properties:{}},annotations:{readOnlyHint:method==="status",destructiveHint:false,idempotentHint:method==="status",openWorldHint:false}}));
async function handleOwnedRuntimeTool(name,args,controller) {
  if(!Object.hasOwn(OWNED_TOOL_METHODS,name))throw Object.assign(Error("owned_adapter_tool_invalid"),{code:"owned_adapter_tool_invalid"});
  require("./owned-runtime-authority").exact(args,[],"owned_adapter_arguments_forbidden");
  if(initialRuntime){const method=OWNED_TOOL_METHODS[name],result=method==="status"?await initialRuntime.readStatus(args):await initialRuntime[method](args);return toolResult(result,result.ok===false);}
  const supervisor=controller || require("./owned-runtime-supervisor").createOwnedRuntimeSupervisor();
  try{const result=await supervisor[OWNED_TOOL_METHODS[name]]();return toolResult(result,result.ok===false);}catch(error){return toolResult({ok:false,code:/^owned_[a-z0-9_]+$/.test(error.code || "")?error.code:"owned_adapter_operation_unknown",replayAllowed:false},true);}
}

let daemonEnsurePromise = null;

function log(message) {
  process.stderr.write(`[${SERVER_NAME}] ${message}\n`);
}

function sendRpc(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function ok(id, result) {
  sendRpc({ jsonrpc: "2.0", id, result });
}

function err(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  sendRpc({ jsonrpc: "2.0", id, error });
}

function toolResult(text, isError) {
  return {
    content: [{ type: "text", text: typeof text === "string" ? text : JSON.stringify(text, null, 2) }],
    isError: Boolean(isError)
  };
}

function daemonRequest(method, requestPath, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const body = payload === undefined ? "" : JSON.stringify(payload);
    const req = http.request({
      hostname: DAEMON_HOST,
      port: DAEMON_PORT,
      path: requestPath,
      method,
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        "x-ae-bridge-token": TOKEN,
        "x-ae-mcp-adapter": "codex-stdio-v1"
      },
      timeout: timeoutMs || DAEMON_TIMEOUT_MS
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
          reject(new Error(`Bridge daemon returned invalid JSON from ${requestPath}: ${error.message}`));
          return;
        }
        resolve({ status: res.statusCode || 0, body: parsed });
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error(`Bridge daemon request timed out after ${timeoutMs || DAEMON_TIMEOUT_MS}ms`));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getDaemonHealth(timeoutMs) {
  const response = await daemonRequest("GET", "/health", undefined, timeoutMs || 1200);
  if (response.status !== 200 || !response.body.ok) {
    throw new Error(response.body.error || `Bridge daemon health failed with HTTP ${response.status}`);
  }
  return response.body;
}

async function ensureDaemonRunning() {
  if(initialRuntime)initialRuntime.assertIngress();
  if (daemonEnsurePromise) return daemonEnsurePromise;

  daemonEnsurePromise = (async () => {
    try {
      return await getDaemonHealth(1200);
    } catch (firstError) {
      if (!AUTO_START_DAEMON) {
        throw firstError;
      }

      if(DAEMON_HOST!=="127.0.0.1" || DAEMON_PORT!==3456)throw Object.assign(Error("owned_adapter_fixed_endpoint_required"),{code:"owned_adapter_fixed_endpoint_required"});
      const result=await require("./owned-runtime-supervisor").createOwnedRuntimeSupervisor().ensure();
      if(result.ok!==true)throw Object.assign(Error("owned_adapter_ensure_readback_only"),{code:"owned_adapter_ensure_readback_only"});
      return await getDaemonHealth(1200);
    }
  })();

  try {
    return await daemonEnsurePromise;
  } finally {
    daemonEnsurePromise = null;
  }
}

async function getTools() {
  const localTools = [...productionUsageTools,...ownedRuntimeTools];
  if(initialRuntime)return [...initialRuntime.tools,...ownedRuntimeTools];
  try {
    await ensureDaemonRunning();
    const response = await daemonRequest("GET", "/tools", undefined, 5000);
    if (response.status === 200 && response.body && response.body.ok && Array.isArray(response.body.tools)) {
      const daemonTools = response.body.tools;
      const localNames = new Set(localTools.map((t) => t.name));
      const filteredDaemonTools = daemonTools.filter((t) => !localNames.has(t.name));
      return [...filteredDaemonTools, ...localTools];
    }
  } catch (error) {
    log(`Bridge daemon is not reachable for tools/list; returning local tools only. Reason: ${error.message}`);
  }
  return localTools;


}

async function callDaemonTool(name, args) {
  if(initialRuntime)return initialRuntime.callTool(name,args===undefined?{}:args);
  if (!isPanelControlTool(name)) await ensureDaemonRunning();
  const response = await daemonRequest("POST", "/mcp/tools/call", {
    name,
    arguments: isPanelControlTool(name) ? args : (args || {})
  });

  if (response.status !== 200 || !response.body.ok || !response.body.result) {
    // Keep sanitized server diagnostics and exact proof IDs. A rejected HTTP
    // exchange cannot establish the availability of a recovery tool catalog.
    return decorateToolResult(toolResult(sanitizeHttpFailure(response.body, response.status), true), {
      toolName: name, daemonAvailable: true, exposedTools: []
    });
  }

  return response.body.result;
}

async function handleRpc(message) {
  if (!message || message.jsonrpc !== "2.0") return;
  const id = message.id;

  try {
    if (message.method === "initialize") {
      ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools: {}
        },
        instructions: [
          "For AE tasks, use search_solutions first, then get_solution. Prefer build_solution_plan, propose_ai_agent_plan, and a dry run. When the user has enabled the temporary Autonomous Codex session in CEP, run_ai_agent_plan may execute a proposal-backed typed mutating plan; raw JSX and destructive plans still require the normal CEP confirmation flow. Use get_current_ai_agent_plan to reconcile the current project, revision, expiry and run. A new proposal supersedes the pending one. On failure inspect repairDirective and the affected targets; at most two eligible setter corrections may be proposed with parentActionId, followed by a fresh dry-run and read-back. Never retry creation, imports or an unknown outcome automatically. Inspect list_solution_candidates only when reviewing repeated quarantined raw JSX, and use get_solution_candidate for a selected candidate. Candidates remain planner-invisible until explicit promotion. For token usage and telemetry, use read-only get_task_usage with confirmed runtime thread UUID (never 'current') or get_usage_history from local analytics store. For CEP panel functions, use list_panel_actions, get_panel_state, invoke_panel_action, and get_panel_action_result programmatically without Computer Use.",
          TEXT_LAYOUT_POLICY
        ].join("\n\n"),
        serverInfo: {
          name: SERVER_NAME,
          version: SERVER_VERSION
        }
      });
      return;
    }

    if (message.method === "tools/list") {
      ok(id, { tools: await getTools() });
      return;
    }

    if (message.method === "tools/call") {
      const params = message.params || {};
      const toolName = params.name;
      if(initialRuntime){ok(id,Object.hasOwn(OWNED_TOOL_METHODS,toolName)?await handleOwnedRuntimeTool(toolName,Object.hasOwn(params,"arguments")?params.arguments:{}):
        await callDaemonTool(toolName,Object.hasOwn(params,"arguments")?params.arguments:{}));return;}
      const toolArgs = isPanelControlTool(toolName)
        ? (Object.prototype.hasOwnProperty.call(params, "arguments") ? params.arguments : {})
        : (params.arguments || {});
      if (isProductionUsageTool(toolName)) {
        try {
          ok(id, decorateToolResult(await handleProductionUsageTool(toolName, toolArgs), {
            toolName, daemonAvailable: true, exposedTools: []
          }));
        } catch (error) {
          ok(id, decorateToolResult(toolResult({ ok: false, error: error.message || String(error) }, true), {
            toolName, daemonAvailable: true, exposedTools: []
          }));
        }
        return;
      }
      if(Object.hasOwn(OWNED_TOOL_METHODS,toolName)){ok(id,await handleOwnedRuntimeTool(toolName,Object.hasOwn(params,"arguments")?params.arguments:{}));return;}
      try {
        ok(id, await callDaemonTool(toolName, toolArgs));
      } catch (error) {
        ok(id, decorateToolResult(toolResult({ok: false, code: "bridge_unreachable", phase: "bridge_offline", error: error.message}, true), {
          toolName, daemonAvailable: false, transportUnavailable: true
        }));
      }
      return;
    }

    if (message.method === "notifications/initialized" || id === undefined || id === null) {
      return;
    }

    err(id, -32601, `Method not found: ${message.method}`);
  } catch (error) {
    err(id, -32000, error.message || String(error), {
      stack: error.stack
    });
  }
}

function startStdioMcp() {
  log(`Using bridge daemon at http://${DAEMON_HOST}:${DAEMON_PORT}`);
  if(!initialRuntime)ensureDaemonRunning()
    .then((health) => {
      log(`Bridge daemon ready: ${health.server || "unknown"} ${health.version || "unknown"}`);
    })
    .catch((error) => {
      log(`Bridge daemon is not ready yet: ${error.message}`);
    });

  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity
  });

  rl.on("line", (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch (parseError) {
      log(`Bad JSON-RPC message: ${parseError.message}`);
      return;
    }

    if (Array.isArray(message)) {
      for (const item of message) {
        handleRpc(item);
      }
      return;
    }

    handleRpc(message);
  });

  rl.on("close", async () => {
    log("stdin closed");
    if(initialRuntime)await initialRuntime.revoke();
    process.exit(0);
  });
  if(initialRuntime){
    // Installed before the first explicit ensure can invoke the native factory.
    // These handlers only revoke this original controller; EOF never relaunches.
    process.stdin.on("error",async()=>{await initialRuntime.revoke();process.exit(1);});
    process.stdin.on("end",()=>{void initialRuntime.revoke();});
    process.stdout.on("error",()=>{void initialRuntime.revoke();});
  }
}

if (require.main === module) {
  if(trustedSourceCensus.requested()){
    void trustedSourceCensus.collectFixed("controller").then(value=>process.stdout.write(JSON.stringify(value)+"\n"),error=>{
      process.stderr.write(JSON.stringify({authority:false,code:error.code||"owned_initial_passive_census_unknown"})+"\n");process.exitCode=1;});
  }else startStdioMcp();
}

module.exports = {
  getTools,
  handleRpc,
  startStdioMcp,
  toolResult,
  ownedRuntimeTools,handleOwnedRuntimeTool,ensureDaemonRunning
};
