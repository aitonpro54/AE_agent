#!/usr/bin/env node
"use strict";

const http = require("http");
const {
  READ_ONLY_BRIDGE_TOOL_NAMES,
  SERVER_NAME,
  SERVER_VERSION,
  createServer
} = require("../chatgpt-connector/server");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requestJson(port, path, payload, headers) {
  return new Promise((resolve, reject) => {
    const body = payload === undefined ? "" : JSON.stringify(payload);
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path,
      method: payload === undefined ? "GET" : "POST",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
        ...(headers || {})
      },
      timeout: 3000
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
          reject(new Error(`Invalid JSON response from ${path}: ${error.message}`));
          return;
        }
        resolve({ status: res.statusCode || 0, body: parsed });
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error(`Request to ${path} timed out.`));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function callRpc(port, id, method, params, headers) {
  const response = await requestJson(port, "/mcp", {
    jsonrpc: "2.0",
    id,
    method,
    params: params || {}
  }, headers);
  assert(response.status === 200, `Expected HTTP 200 for ${method}, got ${response.status}`);
  assert(response.body && response.body.id === id, `Expected JSON-RPC id ${id} for ${method}`);
  assert(!response.body.error, `Unexpected JSON-RPC error for ${method}: ${JSON.stringify(response.body.error)}`);
  return response.body.result;
}

function assertReadOnlyTools(tools) {
  const names = tools.map((tool) => tool.name);
  const banned = [
    "run_extendscript",
    "run_extendscript_file",
    "chat_with_ai_agent",
    "plan_with_ai_agent",
    "run_ai_agent_plan",
    "create_text_layer",
    "create_solid_layer",
    "create_null_layer",
    "create_adjustment_layer",
    "create_shape_layer",
    "import_footage",
    "add_project_item_to_comp",
    "add_effect",
    "add_comp_to_render_queue",
    "set_property_value",
    "set_layer_transform",
    "set_comp_work_area",
    "set_layer_time_range",
    "stagger_layers",
    "split_layers_at_time",
    "precompose_layers",
    "replace_layer_source",
    "rename_layers",
    "rename_project_items",
    "update_text_layer",
    "delete_project_checkpoint",
    "restore_project_checkpoint",
    "finish_edit_session"
  ];

  for (const expected of ["get_connector_status", "get_project_info", "get_active_comp", "get_render_queue_status"]) {
    assert(names.includes(expected), `Expected connector tool ${expected}`);
  }

  for (const expectedBridgeTool of READ_ONLY_BRIDGE_TOOL_NAMES) {
    assert(names.includes(expectedBridgeTool), `Expected read-only bridge tool ${expectedBridgeTool}`);
  }

  for (const forbidden of banned) {
    assert(!names.includes(forbidden), `Forbidden write/raw/provider tool exposed: ${forbidden}`);
  }

  for (const tool of tools) {
    assert(tool.inputSchema && tool.inputSchema.type === "object", `Expected object inputSchema for ${tool.name}`);
    assert(tool.annotations && tool.annotations.readOnlyHint === true, `Expected readOnlyHint:true for ${tool.name}`);
    assert(tool.annotations.destructiveHint === false, `Expected destructiveHint:false for ${tool.name}`);
    assert(tool.annotations.openWorldHint === false, `Expected openWorldHint:false for ${tool.name}`);
  }
}

async function main() {
  const server = createServer({
    bridgeUrl: "http://127.0.0.1:1",
    bridgeToken: "offline-smoke-token",
    connectorToken: "connector-smoke-token",
    timeoutMs: 750
  });
  const port = await listen(server);
  const headers = { authorization: "Bearer connector-smoke-token" };

  try {
    const health = await requestJson(port, "/health");
    assert(health.status === 200, `Expected health HTTP 200, got ${health.status}`);
    assert(health.body.server === SERVER_NAME, "Expected health server name.");
    assert(health.body.version === SERVER_VERSION, "Expected health server version.");
    assert(health.body.mode === "read-only", "Expected read-only health mode.");

    const unauthorized = await requestJson(port, "/mcp", {
      jsonrpc: "2.0",
      id: 90,
      method: "tools/list",
      params: {}
    });
    assert(unauthorized.status === 401, "Expected token-protected /mcp to reject missing credentials.");

    const init = await callRpc(port, 1, "initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "chatgpt-connector-smoke", version: "0.0.0" }
    }, headers);
    assert(init.serverInfo.name === SERVER_NAME, "Expected initialize server name.");
    assert(init.capabilities && init.capabilities.tools, "Expected tools capability.");

    const listed = await callRpc(port, 2, "tools/list", {}, headers);
    assert(Array.isArray(listed.tools), "Expected tools/list tools array.");
    assertReadOnlyTools(listed.tools);

    const status = await callRpc(port, 3, "tools/call", {
      name: "get_connector_status",
      arguments: {}
    }, headers);
    assert(!status.isError, "Expected get_connector_status to succeed offline.");
    assert(status.structuredContent.connector.writeToolsExposed === false, "Expected write tools disabled.");
    assert(status.structuredContent.connector.rawExtendscriptExposed === false, "Expected raw ExtendScript disabled.");
    assert(status.structuredContent.connector.openAiApiCalls === false, "Expected no connector-side OpenAI API calls.");
    assert(status.structuredContent.bridge.checked === true, "Expected bridge health check attempt.");
    assert(status.structuredContent.bridge.ok === false, "Expected offline bridge status.");

    const activeComp = await callRpc(port, 4, "tools/call", {
      name: "get_active_comp",
      arguments: {}
    }, headers);
    assert(activeComp.isError === true, "Expected offline bridge proxy call to return a tool error.");
    assert(activeComp.content[0].text.includes("Bridge proxy failed for get_active_comp"), "Expected shaped bridge proxy error.");

    console.log(`ChatGPT connector smoke passed with ${listed.tools.length} read-only tools.`);
  } finally {
    await close(server);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
