#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { startDaemon } = require("./network-test-fixture");

async function main() {
  // Existing isolated loopback fixture: ephemeral port/runtime, no AE/CEP/provider.
  const fixture = await startDaemon({ automationToken: "recovery-offline-token", panelToken: "recovery-offline-panel", devAdmin: false });
  const call = async (name, args, isError = false) => {
    const response = await fixture.request({ path: "/tools/call", token: fixture.automationToken,
      body: { name, arguments: args } });
    assert.equal(response.status, 200, response.text);
    const raw = response.body.result;
    assert.equal(Boolean(raw.isError), isError, JSON.stringify(raw));
    return JSON.parse(raw.content[0].text);
  };
  try {
    const catalog = await fixture.request({ path: "/tools", token: fixture.automationToken });
    assert.equal(catalog.status, 200);
    const tools = new Map(catalog.body.tools.map(tool => [tool.name, tool]));
    for (const name of ["find_missing_footage_candidates", "build_source_recovery_plan", "relink_footage_source", "verify_source_recovery_read_back"]) assert(tools.has(name));
    const required = tools.get("build_source_recovery_plan").inputSchema.properties.requests.items.required;
    for (const key of ["itemName", "currentFilePath", "footageMissing", "candidates", "candidateSelectionConfirmed"]) assert(required.includes(key));
    assert(tools.get("find_project_items").inputSchema.properties.itemIds);
    assert(tools.get("relink_footage_source").inputSchema.required.includes("expectedPreviousFilePath"));
    const found = await call("search_solutions", { query: "missing-footage source-recovery placeholder", limit: 8 });
    assert(found.results.some(result => result.id === "placeholder-source-recovery-plan"));
    const recipe = await call("get_solution", { id: "placeholder-source-recovery-plan", toolNames: [
      "find_missing_footage_candidates", "build_source_recovery_plan", "relink_footage_source", "find_project_items"] });
    assert.equal(recipe.solution.title, "План восстановления отсутствующих исходников");
    assert.equal(recipe.solution.testedAeContext.projectKind, "synthetic");
    assert.equal(recipe.solution.testedAeContext.aeVersion, null);
    assert.equal(recipe.solution.testedAeContext.panelVersion, null);
    assert.equal(recipe.solution.testedAeContext.bridgeVersion, null);
    assert.equal(recipe.toolContracts.length, 4);
    assert(recipe.recipe.text.includes("itemIds"));
    const registry = JSON.parse(fs.readFileSync(path.join(__dirname, "../registry/solutions.json"), "utf8"));
    assert.equal(registry.solutions.filter(result => result.id === "placeholder-source-recovery-plan").length, 1);

    const file = path.join(fixture.runtimeDir, "source.mp4");
    fs.writeFileSync(file, "synthetic source");
    const missing = { itemId: 812, itemIndex: 78, name: "Renamed source", originalPath: "D:/missing/source.mp4", footageMissing: true };
    const result = await call("find_missing_footage_candidates", { searchRoots: [fixture.runtimeDir], missingItems: [missing],
      allowedExtensions: [".mp4"], maxEntries: 100, maxDirectories: 20 });
    assert.equal(result.results[0].candidateCount, 1);
    assert.equal(result.results[0].candidates[0].metadata.width, "unknown");
    const req = { itemId: missing.itemId, itemIndex: missing.itemIndex, itemName: missing.name,
      currentFilePath: missing.originalPath, footageMissing: true, candidates: result.results[0].candidates,
      targetFilePath: file, candidateSelectionConfirmed: true };
    const built = await call("build_source_recovery_plan", { requests: [req] });
    assert.equal(built.ok, true);
    assert.deepEqual(built.plan.expectedReadBack, built.expectedReadBack);
    assert.deepEqual(built.plan.steps[1].args.itemIds, [812]);
    const validation = await call("validate_ai_agent_plan", { plan: built.plan, requestId: "offline-source-recovery" });
    assert.equal(validation.ok, true, JSON.stringify(validation));
    assert.equal(validation.mutatingCount, 1);
    assert.equal(validation.requiresCheckpoint, true);
    const omitted = await call("build_source_recovery_plan", { requests: [{ ...req, candidates: undefined }] }, true);
    assert.equal(omitted.code, "CANDIDATES_REQUIRED");
    const observed = { matches: [{ itemId: 812, itemIndex: 119, name: missing.name, file, footageMissing: false }] };
    assert.equal((await call("verify_source_recovery_read_back", { expected: built.plan.expectedReadBack, observed })).ok, true);
    assert.equal((await call("verify_source_recovery_read_back", { expected: built.plan.expectedReadBack,
      observed: { matches: [{ ...observed.matches[0], footageMissing: undefined }] } }, true)).ok, false);
    const status = await call("get_bridge_status", {});
    assert.equal(status.panelConnected, false);
    assert.equal(status.pendingCommands, 0, "local catalog/search/builder/validation must not enqueue AE commands");
    console.log("PASS: recovery isolated daemon — actual catalog/schema, unique recipe discovery, helper routing, plan validation; AE commands 0.");
  } finally { await fixture.stop(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
