"use strict";

// Изолированный runner и фальшивая панель: JSX здесь никогда не исполняется.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const {spawn} = require("child_process");
const {buildSolutionPlan, getBuilderContract} = require("../mcp-server/solution-plan-builder");
const {withProjectPanel, isProjectInfo, PROJECT_FILE} = require("./fake-project-panel");
const root = path.resolve(__dirname, "..");
const port = 28000 + Math.floor(Math.random() * 10000);
const token = "isolated-solution-run-test";
const runtime = fs.mkdtempSync(path.join(os.tmpdir(), "ae-solution-run-"));
fs.writeFileSync(path.join(runtime, "edit-session-active.json"), JSON.stringify({
  id: "synthetic-active-session", status: "active", startedAt: new Date().toISOString(), operations: []
}));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function request(route, payload) {
  return new Promise((resolve, reject) => {
    const req = http.request({hostname: "127.0.0.1", port, path: route, method: payload ? "POST" : "GET",
      headers: {"content-type": "application/json", "x-ae-bridge-token": token}, timeout: 10000}, (res) => {
      let text = ""; res.setEncoding("utf8"); res.on("data", (chunk) => {text += chunk;});
      res.on("end", () => {try {resolve(JSON.parse(text));} catch (e) {reject(e);}});
    });
    req.on("error", reject); req.on("timeout", () => req.destroy(new Error("Isolated runner request timeout")));
    req.end(payload ? JSON.stringify(payload) : undefined);
  });
}
async function main() {
  const daemon = spawn(process.execPath, [path.join(root, "mcp-server/bridge-daemon.js")], {
    env: {...process.env, AE_BRIDGE_PORT: String(port), AE_BRIDGE_TOKEN: token, AE_BRIDGE_LOG_DIR: runtime},
    windowsHide: true, stdio: ["ignore", "ignore", "pipe"]
  });
  let stderr = ""; daemon.stderr.on("data", (chunk) => {stderr += chunk;});
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try {ready = (await request("/health")).ok; if (ready) break;} catch (_) {}
      await pause(100);
    }
    assert(ready, stderr);
    const id = "ar-distributekeyframesevenly-typed-plan";
    for (const mode of ["exact", "stale", "wrong-after"]) {
      const built = buildSolutionPlan(id, getBuilderContract(id).example);
      assert(built.ok);
      const proposalResult = await withProjectPanel(port, token, () => request("/agents/plan/propose", {plan: built.plan}));
      const proposal = proposalResult.proposal;
      assert(proposal, JSON.stringify(proposalResult));
      const preview = await withProjectPanel(port, token, () => request("/agents/plan/run", {actionId: proposal.actionId, dryRun: true}));
      assert(preview.run.ok);
      let completed = false;
      let keyWrites = 0;
      let reads = 0;
      const running = request("/agents/plan/run", {
        actionId: proposal.actionId, payloadHash: proposal.action.payloadHash, previewHash: proposal.action.previewHash,
        riskLevel: proposal.risk.level, riskPolicyVersion: proposal.confirmation.riskPolicyVersion,
        confirmationToken: proposal.confirmation.confirmationToken, confirmedBySurface: proposal.confirmation.surface,
        dryRun: false, confirm: true, allowMutations: true
      }).finally(() => {completed = true;});
      running.catch(() => {}); // A failing panel assertion kills this isolated daemon in finally.
      while (!completed) {
        // Check the isolated queue before polling, so a blocked run needs no long-poll timeout.
        const health = await request("/health");
        if (!health.pending) {await pause(10); continue;}
        const {command} = await request("/bridge/next");
        if (!command) continue;
        let result;
        if (isProjectInfo(command)) {
          result = {file: PROJECT_FILE};
        } else if (command.script.includes("sameNameLayerCount: sameNameLayers.length")) {
          result = {comp: {itemIndex: 7, name: "Main", frameRate: 24, duration: 8},
            layer: {index: 2, name: "Card"}, sameNameLayerCount: 1, sameNameLayers: [{index: 2, name: "Card"}]};
        } else if (command.script.includes("propertyTreeTruncated: propertyState")) {
          reads++;
          const expected = built.plan.expectedReadBack[reads === 1 ? "before" : "after"][0];
          const keys = expected.completeKeyframes.map((key) => ({...key}));
          if (mode === "stale" && reads === 1 || mode === "wrong-after" && reads > 1) keys[0].value += 1;
          result = {comp: {itemIndex: expected.compItemIndex, name: expected.compName},
            layer: {index: expected.layerIndex, name: expected.layerName}, propertyTreeTruncated: false,
            propertyTree: [{propertyPath: expected.propertyPath, expressionEnabled: false,
              numKeys: keys.length, keyframes: keys, keyframesTruncated: false}]};
        } else if (command.script.includes("setValueAtTime")) {
          keyWrites++; result = {keyframeCount: 3, clearExisting: true, propertyPath: [2, 11]};
        } else if (command.script.includes("setInterpolationTypeAtKey")) {
          keyWrites++; result = {keyIndices: [1, 2, 3], interpolation: "linear"};
        } else throw new Error(`Unexpected synthetic panel command: ${command.script.slice(-1600)}`);
        await request("/bridge/result", {id: command.id, ok: true, result: JSON.stringify({ok: true, result})});
      }
      const {run} = await running;
      assert(run, "Missing run result");
      assert.strictEqual(run.ok, mode === "exact", JSON.stringify({mode, error: run.error, preflight: run.solutionPlanPreflight, readBack: run.solutionPlanReadBack}));
      if (mode === "stale") {
        assert.strictEqual(keyWrites, 0);
        assert.strictEqual(run.solutionPlanPreflight.status, "failed");
      } else {
        assert.strictEqual(keyWrites, 2);
        assert.strictEqual(run.solutionPlanReadBack.status, mode === "exact" ? "passed" : "failed");
      }
    }
    console.log(JSON.stringify({ok: true, isolatedRunner: true, exactPass: true, staleBlockedBeforeWrite: true, wrongAfterFails: true}));
  } finally {daemon.kill();}
}
main().catch((error) => {console.error(error.stack); process.exitCode = 1;});
