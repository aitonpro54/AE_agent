#!/usr/bin/env node
"use strict";

const assert = require("assert");
const crypto = require("crypto");
const { createServer: createConnectorServer } = require("../chatgpt-connector/server");
const {
  collectRuntimeText,
  completeProjectInfoCommand,
  expectDaemonStartRejected,
  pause,
  pollPanel,
  startDaemon
} = require("./network-test-fixture");

const PROJECT_FILE = "C:\\Synthetic\\NetworkBoundary.aep";

function token(label) {
  return `${label}-${crypto.randomBytes(20).toString("hex")}`;
}

function includesCode(value, expected) {
  if (value === expected) return true;
  if (typeof value === "string") {
    try { return includesCode(JSON.parse(value), expected); } catch (_error) { return false; }
  }
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((entry) => includesCode(entry, expected));
  return Object.values(value).some((entry) => includesCode(entry, expected));
}

function assertStatus(response, expected, label) {
  assert.strictEqual(
    response.status,
    expected,
    `${label}: expected HTTP ${expected}, got ${response.status}: ${response.text}`
  );
}

function assertNoConfirmationCredential(value, label) {
  const serialized = JSON.stringify(value);
  assert(!serialized.includes("confirmationToken"), `${label}: response exposed confirmationToken`);
  assert(!serialized.includes("m100ConfirmationToken"), `${label}: response exposed m100ConfirmationToken`);
}

async function waitForPending(fixture, expected = 1, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const health = await fixture.request({ path: "/health" });
    if (health.body && health.body.pending >= expected) return health;
    await pause(20);
  }
  throw new Error(`Expected at least ${expected} queued command(s).`);
}

async function completeOneProjectInfo(fixture) {
  const next = await pollPanel(fixture, {
    panelConnectionId: "network-panel",
    panelGeneration: "7",
    projectFile: PROJECT_FILE
  });
  assertStatus(next, 200, "fake CEP poll");
  assert(next.body && next.body.command, "fake CEP poll must receive the queued read command");
  const completed = await completeProjectInfoCommand(fixture, next.body.command);
  assertStatus(completed.submitted, 200, "fake CEP submitted acknowledgement");
  assertStatus(completed.result, 200, "fake CEP result acknowledgement");
  return next.body.command;
}

function readOnlyPlan(extra) {
  return {
    summary: "Inspect the isolated synthetic project.",
    targetProject: { file: PROJECT_FILE },
    steps: [{
      title: "Read project information",
      intent: "Inspect the isolated synthetic project without changing it.",
      tool: "get_project_info",
      args: {},
      targetSummary: "Synthetic project",
      mutatesProject: false
    }],
    ...(extra || {})
  };
}

async function testCredentialConfiguration() {
  const shared = token("shared");
  for (const invalid of [
    { automationToken: shared, panelToken: shared },
    { automationToken: shared, adminToken: shared, devAdmin: true },
    { panelToken: shared, adminToken: shared, devAdmin: true },
    { automationToken: token("automation"), panelToken: token("panel"), devAdmin: true }
  ]) {
    const rejected = await expectDaemonStartRejected(invalid);
    assert.notStrictEqual(rejected.exitCode, 0, "invalid credential configuration must fail daemon startup");
  }

  const anonymous = await startDaemon({ commandTimeoutMs: 1500 });
  try {
    assertStatus(await anonymous.request({ path: "/health" }), 200, "anonymous health");
    assertStatus(await anonymous.request({ path: "/tools" }), 401, "anonymous tool inventory");
    assertStatus(await anonymous.request({ path: "/bridge/next" }), 401, "anonymous panel poll");
    assertStatus(await anonymous.request({
      path: "/agents/plan/propose",
      body: { plan: readOnlyPlan() }
    }), 401, "anonymous proposal");
  } finally {
    await anonymous.stop();
  }
}

function testPublicConnectorRequiresAuth() {
  assert.throws(
    () => createConnectorServer({ host: "0.0.0.0", port: 0, connectorToken: "", bridgeToken: "" }),
    /requires authentication/i,
    "network-bound connector must fail closed without connector authentication"
  );
  assert.throws(
    () => createConnectorServer({
      host: "127.0.0.1",
      port: 0,
      publicUrl: "https://connector.invalid/mcp",
      connectorToken: "",
      bridgeToken: ""
    }),
    /requires authentication/i,
    "public connector URL must fail closed without connector authentication"
  );
  const authenticated = createConnectorServer({
    host: "0.0.0.0",
    port: 0,
    connectorToken: token("connector"),
    bridgeToken: token("connector-bridge")
  });
  assert(authenticated && typeof authenticated.listen === "function", "authenticated network connector should be constructible");
}

async function testNetworkBoundary() {
  const credentials = {
    automationToken: token("automation"),
    panelToken: token("panel"),
    adminToken: token("admin")
  };
  const fixture = await startDaemon({
    ...credentials,
    devAdmin: true,
    bodyLimitBytes: 4096,
    commandTimeoutMs: 4000
  });

  try {
    assertStatus(await fixture.request({ path: "/health", headers: { host: "attacker.invalid" } }), 403, "host allowlist");
    assertStatus(await fixture.request({ path: "/health", headers: { origin: "https://attacker.invalid" } }), 403, "origin allowlist");
    assertStatus(await fixture.request({ path: "/health", headers: { origin: "null" } }), 200, "CEP null origin");
    assertStatus(await fixture.request({ path: "/health", headers: { origin: "file://" } }), 200, "CEP file origin");
    assertStatus(await fixture.request({ path: "/tools", token: fixture.automationToken }), 200, "CLI without Origin");
    assertStatus(await pollPanel(fixture, { origin: "null" }), 200, "CEP authenticated handshake");

    assertStatus(await pollPanel(fixture, { token: fixture.automationToken }), 401, "automation credential on panel route");
    assertStatus(await pollPanel(fixture, { token: fixture.adminToken }), 401, "admin credential on panel route");
    assertStatus(await fixture.request({ path: "/tools", token: fixture.adminToken }), 401, "admin credential on normal route");
    assertStatus(await fixture.request({
      method: "POST",
      path: "/autonomy/session",
      token: fixture.automationToken,
      body: { enabled: true, panelConnectionId: "forged", panelGeneration: "7" }
    }), 401, "automation self-enable");
    assertStatus(await fixture.request({
      method: "POST",
      path: "/agents/plan/adopt",
      token: fixture.automationToken,
      body: { actionId: "forged", revision: 1, panelConnectionId: "forged", panelGeneration: "7" }
    }), 401, "automation forged adoption");
    assertStatus(await fixture.request({
      method: "POST",
      path: "/agents/plan/run",
      token: fixture.automationToken,
      body: { actionId: "forged", confirm: true, allowMutations: true, confirmedBySurface: "cep-panel" }
    }), 401, "automation forged manual run");

    const proposed = await fixture.request({
      path: "/agents/plan/propose",
      token: fixture.automationToken,
      body: {
        plan: readOnlyPlan(),
        confirmationSurface: "cep-panel",
        m100ConfirmationSurface: "cep-panel",
        confirmedBySurface: "cep-panel",
        confirmationSessionId: "forged-panel-session"
      }
    });
    assertStatus(proposed, 200, "ordinary HTTP proposal");
    assertNoConfirmationCredential(proposed.body, "ordinary HTTP proposal");

    const current = await fixture.request({ path: "/agents/plan/current", token: fixture.automationToken });
    assertStatus(current, 200, "ordinary current proposal read");
    assertNoConfirmationCredential(current.body, "ordinary current proposal read");

    const toolProposal = await fixture.request({
      path: "/tools/call",
      token: fixture.automationToken,
      body: { name: "propose_ai_agent_plan", arguments: { plan: readOnlyPlan() } }
    });
    assertStatus(toolProposal, 200, "ordinary typed proposal");
    assertNoConfirmationCredential(toolProposal.body, "ordinary typed proposal");

    const spoofedRun = await fixture.request({
      path: "/tools/call",
      token: fixture.automationToken,
      body: {
        name: "run_ai_agent_plan",
        arguments: {
          actionId: "forged",
          confirm: true,
          allowMutations: true,
          confirmationToken: token("forged-confirmation"),
          confirmedBySurface: "cep-panel",
          confirmationSessionId: "forged-panel-session"
        }
      }
    });
    assertStatus(spoofedRun, 200, "ordinary direct run gate");
    assert(includesCode(spoofedRun.body, "proposal_required"), `ordinary direct run must require a proposal: ${spoofedRun.text}`);

    const mutatingCall = { name: "create_comp", arguments: { name: "Must Not Exist" } };
    const direct = await fixture.request({ path: "/tools/call", token: fixture.automationToken, body: mutatingCall });
    assertStatus(direct, 200, "normal direct mutation");
    assert(includesCode(direct.body, "proposal_required"), `normal direct mutation must be blocked: ${direct.text}`);

    const mcp = await fixture.request({
      path: "/mcp/tools/call",
      token: fixture.automationToken,
      headers: { "x-ae-mcp-adapter": "codex-stdio-v1" },
      body: mutatingCall
    });
    assertStatus(mcp, 200, "normal MCP mutation");
    assert(includesCode(mcp.body, "proposal_required"), `normal MCP mutation must be blocked: ${mcp.text}`);

    const dev = await fixture.request({
      path: "/dev/tool/create_comp",
      token: fixture.automationToken,
      body: { name: "Must Not Exist" }
    });
    assert(dev.status >= 400 && dev.status < 600, `normal dev HTTP mutation must fail: ${dev.text}`);
    assert(includesCode(dev.body, "proposal_required"), `normal dev HTTP mutation must use proposal policy: ${dev.text}`);

    for (const role of [fixture.automationToken, fixture.adminToken]) {
      const getMutation = await fixture.request({
        method: "GET",
        path: "/dev/tool/create_comp?name=MustNotExist",
        token: role
      });
      assertStatus(getMutation, 405, "GET mutation");
      assert(includesCode(getMutation.body, "get_mutation_forbidden"), "GET mutation must return get_mutation_forbidden");
    }

    const adminStatus = await fixture.request({
      method: "POST",
      path: "/dev/tool/get_bridge_status",
      token: fixture.adminToken,
      body: {}
    });
    assertStatus(adminStatus, 200, "opt-in admin dev diagnostic");
    const adminSave = await fixture.request({
      method: "POST",
      path: "/dev/tool/save_current_named_project",
      token: fixture.adminToken,
      body: {
        expectedProjectFile: PROJECT_FILE,
        expectedSavedFileSha25664: "a".repeat(64),
        checkpointLabel: "network-boundary-admin-save"
      }
    });
    assertStatus(adminSave, 403, "admin named-project save");
    assert(includesCode(adminSave.body, "project_save_manual_only"), "admin named-project save must remain manual-only");

    const afterPolicy = await fixture.request({ path: "/health" });
    assert.strictEqual(afterPolicy.body.pending, 0, "blocked normal mutations must not queue AE work");
    assert.strictEqual(afterPolicy.body.inflight, 0, "blocked normal mutations must not enter AE execution");

    let legitimateError = null;
    const legitimate = fixture.request({
      path: "/tools/call",
      token: fixture.automationToken,
      timeoutMs: 6000,
      body: { name: "get_project_info", arguments: {} }
    }).catch((error) => {
      legitimateError = error;
      return null;
    });
    await waitForPending(fixture);

    const malformedCases = [
      ["malformed JSON", "{", 400],
      ["null JSON", "null", 400],
      ["array JSON", "[]", 400],
      ["string JSON", "\"bad\"", 400],
      ["number JSON", "42", 400]
    ];
    for (const [label, rawBody, expected] of malformedCases) {
      const response = await fixture.request({
        method: "POST",
        path: "/tools/call",
        token: fixture.automationToken,
        rawBody
      });
      assertStatus(response, expected, label);
    }

    for (const [label, body] of [
      ["null arguments", { name: "get_project_info", arguments: null }],
      ["array arguments", { name: "get_project_info", arguments: [] }],
      ["string arguments", { name: "get_project_info", arguments: "bad" }],
      ["object name", { name: {}, arguments: {} }],
      ["array name", { name: [], arguments: {} }]
    ]) {
      const response = await fixture.request({ path: "/tools/call", token: fixture.automationToken, body });
      assertStatus(response, 400, label);
    }

    const oversized = await fixture.request({
      method: "POST",
      path: "/tools/call",
      token: fixture.automationToken,
      rawBody: JSON.stringify({ name: "get_project_info", arguments: {}, padding: "x".repeat(8192) })
    });
    assertStatus(oversized, 413, "oversized JSON");

    await fixture.abort({
      path: "/tools/call",
      token: fixture.automationToken,
      claimedLength: 512,
      partialBody: "{\"name\":\"get_project_info\",\"arguments\":"
    });
    await pause(50);

    const queuedHealth = await fixture.request({ path: "/health" });
    assertStatus(queuedHealth, 200, "daemon after malformed/abort requests");
    assert.strictEqual(queuedHealth.body.pending, 1, "malformed/abort requests must preserve legitimate queued work");
    await completeOneProjectInfo(fixture);
    const legitimateResponse = await legitimate;
    assert.ifError(legitimateError);
    assertStatus(legitimateResponse, 200, "legitimate queued request after malformed traffic");
    assert.strictEqual(legitimateResponse.body.ok, true, "legitimate queued request must complete successfully");

    let secondLegitimateError = null;
    const secondLegitimate = fixture.request({
      path: "/tools/call",
      token: fixture.automationToken,
      timeoutMs: 6000,
      body: { name: "get_project_info", arguments: {} }
    }).catch((error) => {
      secondLegitimateError = error;
      return null;
    });
    await waitForPending(fixture);
    await completeOneProjectInfo(fixture);
    const secondLegitimateResponse = await secondLegitimate;
    assert.ifError(secondLegitimateError);
    assertStatus(secondLegitimateResponse, 200, "second legitimate request after malformed traffic");

    for (const credential of Object.values(credentials)) {
      const urlCredential = await fixture.request({
        path: `/health?token=${encodeURIComponent(credential)}`
      });
      assertStatus(urlCredential, 401, "URL credential rejection");
    }

    const runtimeText = collectRuntimeText(fixture);
    for (const credential of Object.values(credentials)) {
      assert(!runtimeText.includes(credential), "bridge credentials must not appear in daemon output, logs, state, or settings");
    }
  } finally {
    await fixture.stop();
  }
}

async function main() {
  await testCredentialConfiguration();
  testPublicConnectorRequiresAuth();
  await testNetworkBoundary();
  process.stdout.write("Network boundary smoke passed.\n");
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : error}\n`);
  process.exitCode = 1;
});
