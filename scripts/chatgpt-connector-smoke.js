#!/usr/bin/env node
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const {
  READ_ONLY_BRIDGE_TOOL_NAMES,
  SERVER_NAME,
  SERVER_VERSION,
  createServer
} = require("../chatgpt-connector/server");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const PROJECT_ROOT = path.resolve(__dirname, "..");

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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function writeJson(res, status, body) {
  const text = JSON.stringify(body || {});
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text)
  });
  res.end(text);
}

function createFakeBridgeServer(captured) {
  return http.createServer(async (req, res) => {
    if (req.url === "/health" && req.method === "GET") {
      writeJson(res, 200, {
        ok: true,
        server: "fake-ae-bridge",
        version: "2.0.0",
        panelConnected: true,
        pendingCommands: 0,
        inflightCommands: 0
      });
      return;
    }

    if (req.url === "/agents/plan/propose" && req.method === "POST") {
      const body = await readBody(req);
      if (!Array.isArray(captured.proposals)) captured.proposals = [];
      const actionId = `fake-action-${captured.proposals.length + 1}`;
      const payloadRef = `fake-payload-${captured.proposals.length + 1}`;
      const proposal = {
        protocolVersion: "m100.v1",
        messageType: "action_proposal",
        status: "awaiting_confirmation",
        createdBy: "ae-agent-bridge",
        serverCreated: true,
        requestId: body.requestId || `fake-request-${captured.proposals.length + 1}`,
        actionId,
        summary: "Fake connector proposal",
        risk: {
          level: "raw_jsx",
          requiresConfirmation: true,
          reasons: ["fake connector raw JSX proposal"]
        },
        action: {
          kind: "ae_tool",
          toolName: "run_ai_agent_plan",
          preview: "Fake connector proposal",
          payloadRef,
          payloadHash: `sha256:${"a".repeat(64)}`,
          previewHash: `sha256:${"b".repeat(64)}`
        },
        confirmation: {
          required: true,
          state: "pending",
          proposalExpiresAt: new Date(Date.now() + 600000).toISOString(),
          riskPolicyVersion: "m100-risk-v1",
          confirmationToken: `confirm_${"c".repeat(48)}`,
          surface: body.m100ConfirmationSurface || "chatgpt-connector",
          sessionId: body.m100ConfirmationSessionId || ""
        }
      };
      captured.proposals.push({ proposal, plan: body.plan });
      captured.proposal = { proposal, plan: body.plan };
      writeJson(res, 200, {
        ok: true,
        proposal,
        validation: {
          ok: true,
          stepCount: body.plan && body.plan.steps ? body.plan.steps.length : 1,
          mutatingCount: 1
        }
      });
      return;
    }

    if (req.url === "/agents/plan/run" && req.method === "POST") {
      const body = await readBody(req);
      if (!Array.isArray(captured.planRuns)) captured.planRuns = [];
      const proposalRecord = Array.isArray(captured.proposals)
        ? captured.proposals.find((item) => item && item.proposal && item.proposal.actionId === body.actionId)
        : null;
      const plan = body.plan || (proposalRecord && proposalRecord.plan) || null;
      const runId = body.dryRun === true ? `fake-dry-run-${captured.planRuns.length + 1}` : `fake-run-${captured.planRuns.length + 1}`;
      const approvedDryRunId = captured.planRuns
        .slice()
        .reverse()
        .find((item) => item && item.dryRun === true && item.__fakeRunId);
      body.__fakeRunId = runId;
      captured.planRuns.push(body);
      captured.planRun = body;
      if (body.dryRun !== true && body.allowRawExtendscript === true) {
        const expectedDryRunId = approvedDryRunId ? approvedDryRunId.__fakeRunId : "";
        if (!body.rawExtendscriptDryRunId || body.rawExtendscriptDryRunId !== expectedDryRunId) {
          writeJson(res, 400, {
            ok: false,
            error: "missing matching raw ExtendScript dry-run id",
            run: {
              id: runId,
              ok: false,
              dryRun: false,
              safety: {
                status: "blocked_raw_extendscript_gate"
              },
              steps: []
            }
          });
          return;
        }
      }
      writeJson(res, 200, {
        ok: true,
        run: {
          id: runId,
          ok: true,
          dryRun: body.dryRun === true,
          safety: {
            status: body.dryRun === true ? "dry-run" : "protected",
            protection: "auto_edit_session",
            editSessionFinished: body.dryRun !== true,
            rawExtendscriptGate: body.dryRun === true
              ? { status: "dry-run-approved", dryRunId: runId }
              : { status: "approved", dryRunId: body.rawExtendscriptDryRunId || "" }
          },
          steps: [
            {
              index: 1,
              tool: "run_extendscript_file",
              status: body.dryRun === true ? "ready" : "completed",
              args: plan && plan.steps && plan.steps[0] ? plan.steps[0].args : {}
            }
          ]
        }
      });
      return;
    }

    if (req.url === "/tools/call" && req.method === "POST") {
      const body = await readBody(req);
      captured.readBack = body;
      writeJson(res, 200, {
        ok: true,
        tool: body.name,
        result: {
          content: [{
            type: "text",
            text: JSON.stringify({
              comp: { name: "Codex Smoke Comp", numLayers: 1 },
              selectedLayers: []
            })
          }]
        }
      });
      return;
    }

    writeJson(res, 404, { ok: false, error: "not found" });
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
  const candidateTools = [
    "propose_extendscript_candidate",
    "check_extendscript_candidate",
    "run_extendscript_candidate",
    "promote_solution_candidate"
  ];
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
    "create_camera_layer",
    "create_layer_mask",
    "set_layer_mask",
    "duplicate_layer",
    "duplicate_layers",
    "set_layer_parent",
    "delete_layer",
    "add_comp_marker",
    "add_layer_marker",
    "update_layer_marker",
    "delete_layer_marker",
    "create_shape_layer",
    "import_footage",
    "add_project_item_to_comp",
    "add_effect",
    "add_comp_to_render_queue",
    "set_property_value",
    "set_puppet_pin_type",
    "add_property_to_essential_graphics",
    "set_layer_metadata",
    "set_layer_blending_mode",
    "set_project_item_metadata",
    "set_layer_transform",
    "set_comp_current_time",
    "set_comp_properties",
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

  for (const expected of candidateTools) {
    assert(names.includes(expected), `Expected JSX Lab connector tool ${expected}`);
  }

  for (const expectedBridgeTool of READ_ONLY_BRIDGE_TOOL_NAMES) {
    assert(names.includes(expectedBridgeTool), `Expected read-only bridge tool ${expectedBridgeTool}`);
  }

  const compDetailsTool = tools.find((tool) => tool.name === "get_comp_details");
  assert(compDetailsTool, "Expected get_comp_details connector tool.");
  assert(compDetailsTool.inputSchema.properties.compName, "Expected get_comp_details compName schema.");
  assert(compDetailsTool.inputSchema.properties.includeMarkers, "Expected get_comp_details includeMarkers schema.");
  assert(compDetailsTool.inputSchema.properties.markerLimit, "Expected get_comp_details markerLimit schema.");
  const essentialPropertiesTool = tools.find((tool) => tool.name === "get_layer_essential_properties");
  assert(essentialPropertiesTool, "Expected get_layer_essential_properties connector tool.");
  assert(essentialPropertiesTool.inputSchema.properties.layerIndex, "Expected get_layer_essential_properties layerIndex schema.");
  const essentialControllersTool = tools.find((tool) => tool.name === "get_essential_graphics_controllers");
  assert(essentialControllersTool, "Expected get_essential_graphics_controllers connector tool.");
  assert(essentialControllersTool.inputSchema.properties.compName, "Expected get_essential_graphics_controllers compName schema.");

  for (const forbidden of banned) {
    assert(!names.includes(forbidden), `Forbidden write/raw/provider tool exposed: ${forbidden}`);
  }

  for (const tool of tools) {
    assert(tool.inputSchema && tool.inputSchema.type === "object", `Expected object inputSchema for ${tool.name}`);
    if (["propose_extendscript_candidate", "run_extendscript_candidate", "promote_solution_candidate"].includes(tool.name)) {
      assert(tool.annotations && tool.annotations.readOnlyHint === false, `Expected ${tool.name} to disclose local write/gated mutation behavior.`);
      assert(tool.annotations && tool.annotations.idempotentHint === false, `Expected ${tool.name} to be non-idempotent.`);
    } else {
      assert(tool.annotations && tool.annotations.readOnlyHint === true, `Expected readOnlyHint:true for ${tool.name}`);
    }
    assert(tool.annotations.destructiveHint === false, `Expected destructiveHint:false for ${tool.name}`);
    assert(tool.annotations.openWorldHint === false, `Expected openWorldHint:false for ${tool.name}`);
  }
}

async function main() {
  const candidateDir = path.join(PROJECT_ROOT, "logs", "solution-candidates", `chatgpt-connector-smoke-${process.pid}-${Date.now()}`);
  const server = createServer({
    bridgeUrl: "http://127.0.0.1:1",
    bridgeToken: "offline-smoke-token",
    connectorToken: "connector-smoke-token",
    timeoutMs: 750,
    candidateDir,
    solutionCandidateDir: candidateDir,
    maxCandidateJsxBytes: 768
  });
  let fakeBridge = null;
  let runServer = null;
  const port = await listen(server);
  const headers = { authorization: "Bearer connector-smoke-token" };

  try {
    const health = await requestJson(port, "/health");
    assert(health.status === 200, `Expected health HTTP 200, got ${health.status}`);
    assert(health.body.server === SERVER_NAME, "Expected health server name.");
    assert(health.body.version === SERVER_VERSION, "Expected health server version.");
    assert(health.body.mode === "read-only-bridge-with-gated-jsx-lab", "Expected gated JSX Lab health mode.");
    assert(health.body.writeActionsEnabled === false, "Expected gated AE write actions disabled by default.");

    const httpStatus = await requestJson(port, "/status?checkBridge=0");
    assert(httpStatus.status === 200 && httpStatus.body.ok === true, "Expected public connector status endpoint.");
    assert(httpStatus.body.status.connector.publicUrlConfigured === false, "Expected local-only status by default.");
    assert(httpStatus.body.status.connector.writeActionsEnabled === false, "Expected write actions disabled in status.");
    assert(httpStatus.body.status.connector.exposedToolsSnapshot.some((tool) => tool.name === "run_extendscript_candidate"), "Expected status tools snapshot.");

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
    assert(status.structuredContent.connector.bridgeWriteToolsExposed === false, "Expected bridge write tools disabled.");
    assert(status.structuredContent.connector.localQuarantineWrites === true, "Expected local quarantine candidate writes to be disclosed.");
    assert(status.structuredContent.connector.gatedCandidateRunExposed === true, "Expected gated candidate run tool disclosure.");
    assert(status.structuredContent.connector.writeActionsEnabled === false, "Expected gated AE writes disabled in connector status.");
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

    const savedCandidate = await callRpc(port, 5, "tools/call", {
      name: "propose_extendscript_candidate",
      arguments: {
        title: "Safe generated label",
        intentSummary: "Create a generated label without using C:\\Users\\Ant\\secret.aep.",
        tags: ["jsx-lab", "smoke"],
        appliesWhen: ["Generated test comps need a small label."],
        expectedOutcome: "A reviewed label script candidate is stored for static checks.",
        jsx: [
          "#target aftereffects",
          "app.beginUndoGroup(\"Codex Smoke Label\");",
          "var labelText = \"Codex Smoke\";",
          "var generatedPrefix = \"Codex Smoke\";",
          "app.endUndoGroup();"
        ].join("\n")
      }
    }, headers);
    assert(!savedCandidate.isError, "Expected propose_extendscript_candidate to save a candidate.");
    assert(savedCandidate.structuredContent.status === "candidate-saved", "Expected saved candidate status.");
    assert(savedCandidate.structuredContent.metadataPath.startsWith("logs/solution-candidates/"), "Expected relative quarantine metadata path.");
    assert(savedCandidate.structuredContent.jsxPath.startsWith("logs/solution-candidates/"), "Expected relative quarantine JSX path.");
    assert(!/^[A-Za-z]:\\/.test(savedCandidate.structuredContent.metadataPath), "Candidate metadata path must not be absolute.");
    assert(savedCandidate.structuredContent.safety.aeMutated === false, "Propose must not mutate AE.");
    assert(savedCandidate.structuredContent.safety.bridgeCalled === false, "Propose must not call the bridge.");

    const savedMetadataPath = path.join(PROJECT_ROOT, savedCandidate.structuredContent.metadataPath);
    const savedJsxPath = path.join(PROJECT_ROOT, savedCandidate.structuredContent.jsxPath);
    assert(fs.existsSync(savedMetadataPath), "Expected saved candidate metadata file.");
    assert(fs.existsSync(savedJsxPath), "Expected saved candidate JSX file.");
    const metadataText = fs.readFileSync(savedMetadataPath, "utf8");
    assert(!metadataText.includes("C:\\Users\\Ant"), "Candidate metadata must redact Windows absolute paths.");
    assert(!metadataText.includes("app.beginUndoGroup"), "Candidate metadata must not embed raw JSX.");

    const checkReport = await callRpc(port, 6, "tools/call", {
      name: "check_extendscript_candidate",
      arguments: {
        metadataPath: savedCandidate.structuredContent.metadataPath
      }
    }, headers);
    assert(!checkReport.isError, "Expected check_extendscript_candidate to return a report.");
    assert(checkReport.structuredContent.status === "accepted", `Expected safe candidate accepted, got ${checkReport.structuredContent.status}.`);
    assert(checkReport.structuredContent.safety.staticOnly === true, "Check report must be static-only.");
    assert(checkReport.structuredContent.safety.executed === false, "Check report must not execute JSX.");
    assert(checkReport.structuredContent.safety.bridgeCalled === false, "Check report must not call the bridge.");
    assert(checkReport.structuredContent.safety.aeMutated === false, "Check report must not mutate AE.");

    const blockedRun = await callRpc(port, 61, "tools/call", {
      name: "run_extendscript_candidate",
      arguments: {
        metadataPath: savedCandidate.structuredContent.metadataPath,
        confirm: true,
        allowMutations: true,
        autoEditSession: true,
        confirmedJsxSha256: checkReport.structuredContent.jsxSha256,
        expectedGeneratedPrefix: "Codex Smoke",
        readBackToolCalls: [{ name: "get_active_comp", arguments: {} }],
        dryRun: false
      }
    }, headers);
    assert(blockedRun.isError === true, "Expected run_extendscript_candidate to be disabled without write-actions opt-in.");
    assert(blockedRun.content[0].text.includes("AE_CHATGPT_CONNECTOR_WRITE_ACTIONS=1"), "Expected write-actions opt-in guidance.");

    const promotionHook = await callRpc(port, 62, "tools/call", {
      name: "promote_solution_candidate",
      arguments: {
        metadataPath: savedCandidate.structuredContent.metadataPath,
        targetStatus: "recipe",
        promotionRationale: "Smoke verifies JSX Lab candidate can enter Solution Library review without registry writes.",
        verificationEvidence: ["Static check accepted; gated run remains separately required."]
      }
    }, headers);
    assert(!promotionHook.isError, "Expected promote_solution_candidate to create a quarantine promotion hook.");
    assert(promotionHook.structuredContent.status === "promotion-hook-created", "Expected promotion hook status.");
    assert(promotionHook.structuredContent.safety.writesTrackedRegistry === false, "Promotion hook must not write tracked registry.");
    assert(fs.existsSync(path.join(PROJECT_ROOT, promotionHook.structuredContent.solutionCandidateReportPath)), "Expected solution candidate report artifact.");

    const toolPromotion = await callRpc(port, 63, "tools/call", {
      name: "promote_solution_candidate",
      arguments: {
        metadataPath: savedCandidate.structuredContent.metadataPath,
        targetStatus: "tool",
        promotionRationale: "Direct tool promotion should be blocked."
      }
    }, headers);
    assert(toolPromotion.isError === true, "Expected direct candidate-to-tool promotion to be blocked.");
    assert(toolPromotion.content[0].text.includes("direct candidate-to-tool promotion is not allowed"), "Expected lifecycle error.");

    const captured = {};
    fakeBridge = createFakeBridgeServer(captured);
    const fakeBridgePort = await listen(fakeBridge);
    runServer = createServer({
      bridgeUrl: `http://127.0.0.1:${fakeBridgePort}`,
      bridgeToken: "fake-bridge-token",
      connectorToken: "connector-smoke-token",
      timeoutMs: 1500,
      candidateDir,
      solutionCandidateDir: candidateDir,
      maxCandidateJsxBytes: 768,
      writeActionsEnabled: true
    });
    const runPort = await listen(runServer);
    const runStatus = await callRpc(runPort, 64, "tools/call", {
      name: "get_connector_status",
      arguments: { checkBridge: true }
    }, headers);
    assert(runStatus.structuredContent.connector.writeActionsEnabled === true, "Expected write actions enabled in opted-in run server.");
    assert(runStatus.structuredContent.bridge.ok === true, "Expected fake bridge health to be reachable.");

    const missingConfirm = await callRpc(runPort, 65, "tools/call", {
      name: "run_extendscript_candidate",
      arguments: {
        metadataPath: savedCandidate.structuredContent.metadataPath,
        allowMutations: true,
        autoEditSession: true,
        confirmedJsxSha256: checkReport.structuredContent.jsxSha256,
        expectedGeneratedPrefix: "Codex Smoke",
        dryRun: true
      }
    }, headers);
    assert(missingConfirm.isError === true, "Expected explicit confirm gate.");
    assert(missingConfirm.content[0].text.includes("confirm:true"), "Expected confirm gate error.");

    const badPrefix = await callRpc(runPort, 66, "tools/call", {
      name: "run_extendscript_candidate",
      arguments: {
        metadataPath: savedCandidate.structuredContent.metadataPath,
        confirm: true,
        allowMutations: true,
        autoEditSession: true,
        confirmedJsxSha256: checkReport.structuredContent.jsxSha256,
        expectedGeneratedPrefix: "Missing Prefix",
        dryRun: true
      }
    }, headers);
    assert(badPrefix.isError === true, "Expected generated prefix gate.");
    assert(badPrefix.content[0].text.includes("expectedGeneratedPrefix"), "Expected prefix gate error.");

    const badReadBack = await callRpc(runPort, 661, "tools/call", {
      name: "run_extendscript_candidate",
      arguments: {
        metadataPath: savedCandidate.structuredContent.metadataPath,
        confirm: true,
        allowMutations: true,
        autoEditSession: true,
        confirmedJsxSha256: checkReport.structuredContent.jsxSha256,
        expectedGeneratedPrefix: "Codex Smoke",
        readBackToolCalls: [{ name: "create_text_layer", arguments: {} }],
        dryRun: false
      }
    }, headers);
    assert(badReadBack.isError === true, "Expected read-back allowlist gate.");
    assert(badReadBack.content[0].text.includes("read-only allowlist"), "Expected read-back allowlist error.");
    assert(!captured.planRun && (!captured.planRuns || captured.planRuns.length === 0), "Invalid read-back gate must block before bridge plan run.");

    const runCandidate = await callRpc(runPort, 67, "tools/call", {
      name: "run_extendscript_candidate",
      arguments: {
        metadataPath: savedCandidate.structuredContent.metadataPath,
        confirm: true,
        allowMutations: true,
        autoEditSession: true,
        confirmedJsxSha256: checkReport.structuredContent.jsxSha256,
        expectedGeneratedPrefix: "Codex Smoke",
        readBackToolCalls: [{ name: "get_active_comp", arguments: {} }],
        dryRun: false
      }
    }, headers);
    assert(!runCandidate.isError, "Expected gated candidate run through fake bridge.");
    assert(runCandidate.structuredContent.status === "completed", "Expected completed gated run status.");
    assert(runCandidate.structuredContent.safety.bridgePlanRunnerRequired === true, "Expected bridge plan runner safety metadata.");
    assert(runCandidate.structuredContent.safety.checkpointEditSessionRequired === true, "Expected checkpoint/edit-session safety metadata.");
    assert(runCandidate.structuredContent.safety.readBackCompleted === true, "Expected read-back verification to run.");
    assert(runCandidate.structuredContent.bridgePlanRun.safety.protection === "auto_edit_session", "Expected protected fake run.");
    assert(Array.isArray(captured.planRuns) && captured.planRuns.length === 2, "Expected dry-run gate and real bridge plan run.");
    const preflightPlanRun = captured.planRuns[0];
    const protectedPlanRun = captured.planRuns[1];
    assert(preflightPlanRun.dryRun === true, "Expected connector wrapper to dry-run before raw ExtendScript execution.");
    assert(preflightPlanRun.allowRawExtendscript !== true, "Dry-run gate should not request raw ExtendScript execution approval.");
    assert(protectedPlanRun.allowRawExtendscript === true, "Expected connector wrapper to enable raw ExtendScript only inside the protected plan runner.");
    assert(protectedPlanRun.rawExtendscriptDryRunId === preflightPlanRun.__fakeRunId, "Expected real run to include the matching dry-run gate id.");
    assert(protectedPlanRun.autoEditSession === true, "Expected auto edit session in bridge payload.");
    assert(protectedPlanRun.actionId && protectedPlanRun.payloadRef && protectedPlanRun.confirmationToken, "Expected proposal-backed bridge payload.");
    assert(!protectedPlanRun.plan, "Protected connector run must not post executable plan body.");
    assert(captured.proposal.plan.steps[0].tool === "run_extendscript_file", "Expected file-based candidate execution.");
    assert(captured.proposal.plan.steps[0].args.filePath === savedCandidate.structuredContent.jsxPath, "Expected saved candidate JSX path.");
    assert(captured.proposal.plan.steps[0].args.verifyAfter === true, "Expected bridge verification enabled.");
    assert(captured.readBack.name === "get_active_comp", "Expected configured read-back tool call.");
    assert(!JSON.stringify(runCandidate.structuredContent).includes("app.beginUndoGroup"), "Run result must not return raw JSX.");

    const disabled = await requestJson(runPort, "/emergency-disable", {}, headers);
    assert(disabled.status === 200 && disabled.body.status.connector.emergencyDisabled === true, "Expected emergency disable endpoint.");
    const blockedAfterEmergency = await callRpc(runPort, 68, "tools/call", {
      name: "propose_extendscript_candidate",
      arguments: {
        title: "Blocked after emergency",
        intentSummary: "Should not write after emergency disable.",
        jsx: "return 1;"
      }
    }, headers);
    assert(blockedAfterEmergency.isError === true, "Expected emergency disable to block local write tools.");

    const unsafeCandidate = await callRpc(port, 7, "tools/call", {
      name: "propose_extendscript_candidate",
      arguments: {
        title: "Unsafe eval candidate",
        intentSummary: "Exercise static rejection and path hygiene.",
        jsx: [
          "var f = File(\"C:\\\\Users\\\\Ant\\\\secret.txt\");",
          "eval(\"app.project.save()\");"
        ].join("\n")
      }
    }, headers);
    assert(!unsafeCandidate.isError, "Expected unsafe candidate to be saved for quarantine checks.");

    const rejectedReport = await callRpc(port, 8, "tools/call", {
      name: "check_extendscript_candidate",
      arguments: {
        metadataPath: unsafeCandidate.structuredContent.metadataPath
      }
    }, headers);
    assert(!rejectedReport.isError, "Expected unsafe candidate check to return a report, not execute.");
    assert(rejectedReport.structuredContent.status === "rejected", `Expected unsafe candidate rejected, got ${rejectedReport.structuredContent.status}.`);
    assert(rejectedReport.structuredContent.findings.some((finding) => finding.code === "dynamic_eval"), "Expected dynamic eval denial finding.");
    assert(!JSON.stringify(rejectedReport.structuredContent).includes("C:\\Users\\Ant"), "Check report must redact absolute path previews.");
    assert(rejectedReport.structuredContent.safety.executed === false, "Rejected check must not execute JSX.");

    const badPath = await callRpc(port, 9, "tools/call", {
      name: "check_extendscript_candidate",
      arguments: {
        metadataPath: "C:\\Users\\Ant\\outside.json"
      }
    }, headers);
    assert(badPath.isError === true, "Expected absolute metadata path to be rejected.");
    assert(badPath.content[0].text.includes("relative quarantine paths"), "Expected path hygiene error.");

    console.log(`ChatGPT connector smoke passed with ${listed.tools.length} connector tools, gated JSX Lab run checks, and promotion hooks.`);
  } finally {
    if (runServer) await close(runServer);
    if (fakeBridge) await close(fakeBridge);
    await close(server);
    const allowedCleanupRoot = path.join(PROJECT_ROOT, "logs", "solution-candidates");
    if (candidateDir.startsWith(allowedCleanupRoot)) {
      fs.rmSync(candidateDir, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
