"use strict";

// Изолированный runner и фальшивая панель: JSX здесь никогда не исполняется.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const {spawn} = require("child_process");
const {buildSolutionPlan, getBuilderContract} = require("../mcp-server/solution-plan-builder");
const {withProjectPanel, isProjectInfo, PROJECT_FILE, panelRoute, completeCommand} = require("./fake-project-panel");
const records = require("../mcp-server/plan-run-records");
const views = require("../mcp-server/plan-run-response");
const {isolatedEnvironment} = require("./network-test-fixture");
const root = path.resolve(__dirname, "..");
const port = 28000 + Math.floor(Math.random() * 10000);
const token = "isolated-solution-run-test";
const panelToken = `${token}-panel`;
const runtime = fs.mkdtempSync(path.join(os.tmpdir(), "ae-response-integration-"));
fs.writeFileSync(path.join(runtime, "edit-session-active.json"), JSON.stringify({
  id: "synthetic-active-session", status: "active", startedAt: new Date().toISOString(),
  checkpoint: {sourceFile: PROJECT_FILE}, operations: []
}));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function request(route, payload, authToken = token) {
  return new Promise((resolve, reject) => {
    const req = http.request({hostname: "127.0.0.1", port, path: route, method: payload ? "POST" : "GET",
      headers: {"content-type": "application/json", "x-ae-bridge-token": authToken}, timeout: 10000}, (res) => {
      let text = ""; res.setEncoding("utf8"); res.on("data", (chunk) => {text += chunk;});
      res.on("end", () => {try {resolve(JSON.parse(text));} catch (e) {reject(e);}});
    });
    req.on("error", reject); req.on("timeout", () => req.destroy(new Error("Isolated runner request timeout")));
    req.end(payload ? JSON.stringify(payload) : undefined);
  });
}
async function main() {
  const env = isolatedEnvironment(runtime, {port, automationToken: token, panelToken, devAdmin: false, commandTimeoutMs: 10000});
  Object.assign(env, {AE_BRIDGE_LOG_DIR: runtime, AE_BRIDGE_STATE_DIR: runtime});
  const daemon = spawn(process.execPath, [path.join(root, "mcp-server/bridge-daemon.js")], {
    env,
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
    const catalog = (await request("/tools")).tools;
    assert(catalog.find(t => t.name === "run_ai_agent_plan").inputSchema.properties.responseView.enum.includes("summary"));
    assert(catalog.find(t => t.name === "get_plan_run_evidence").inputSchema.required.includes("runId"));
    const noCommands = (await request("/health")).pending;
    const invalid = await request("/agents/plan/run", {responseView:"invalid", plan:{summary:"Read-only synthetic project info",steps:[{tool:"get_project_info",args:{}}]}}, panelToken);
    assert.equal(invalid.errorCode || invalid.code, "response_view_invalid", JSON.stringify(invalid));
    assert.equal((await request("/health")).pending, noCommands);
    assert(!fs.existsSync(path.join(runtime,"evidence","plan-runs")));
    for (const dryRun of [true, false]) {
      const {run} = await withProjectPanel(port, panelToken, () => request("/agents/plan/run", {dryRun, confirm:true, responseView:"summary",plan:{summary:"Read-only synthetic project info",steps:[{tool:"get_project_info",args:{}}]}}, panelToken));
      const canonical = records.readRecord(runtime, run.id, {throwOnError:true});
      assert.deepStrictEqual(run, JSON.parse(JSON.stringify(views.projectPlanRunSummary(canonical.run))));
      assert.equal(canonical.run.responseView, undefined);
      assert.equal(canonical.run.dryRun,dryRun);
      assert.equal(run.ok,true,JSON.stringify(run));
      if (!dryRun) assert.equal(canonical.run.steps[0].status,"completed");
    }
    const parity = new Map();
    const id = "ar-distributekeyframesevenly-typed-plan";
    for (const [mode, responseView] of [["exact", undefined],["exact","summary"],["wrong-after",undefined],["wrong-after","summary"]]) {
      const built = buildSolutionPlan(id, getBuilderContract(id).example);
      assert(built.ok);
      const proposalResult = await withProjectPanel(port, panelToken,
        () => request("/agents/plan/propose", {plan: built.plan}, panelToken));
      const proposal = proposalResult.proposal;
      assert(proposal, JSON.stringify(proposalResult));
      const invalidProposal = await request("/agents/plan/run", {actionId:proposal.actionId,responseView:"invalid"}, panelToken);
      assert.equal(invalidProposal.errorCode || invalidProposal.code,"response_view_invalid");
      const preview = await withProjectPanel(port, panelToken,
        () => request("/agents/plan/run", {actionId: proposal.actionId, dryRun: true, responseView}, panelToken));
      assert(preview.run.ok);
      const dryRecord = records.readRecord(runtime, preview.run.id, {throwOnError:true});
      assert.deepStrictEqual(preview.run, responseView ? JSON.parse(JSON.stringify(views.projectPlanRunSummary(dryRecord.run))) : dryRecord.run);
      let completed = false;
      let keyWrites = 0;
      let reads = 0;
      const running = request("/agents/plan/run", {
        actionId: proposal.actionId, payloadHash: proposal.action.payloadHash, previewHash: proposal.action.previewHash,
        riskLevel: proposal.risk.level, riskPolicyVersion: proposal.confirmation.riskPolicyVersion,
        confirmationToken: proposal.confirmation.confirmationToken, confirmedBySurface: proposal.confirmation.surface,
        dryRun: false, confirm: true, allowMutations: true, responseView
      }, panelToken).finally(() => {completed = true;});
      running.catch(() => {}); // A failing panel assertion kills this isolated daemon in finally.
      while (!completed) {
        // Check the isolated queue before polling, so a blocked run needs no long-poll timeout.
        const health = await request("/health");
        if (!health.pending) {await pause(10); continue;}
        const {command} = await request(panelRoute("panel-smoke", PROJECT_FILE), undefined, panelToken);
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
        await completeCommand(port, panelToken, command, result);
      }
      const {run} = await running;
      assert(run, "Missing run result");
      assert.strictEqual(run.provenance.actionId, proposal.actionId);
      assert(Number.isInteger(run.provenance.proposalRevision));
      assert.match(run.provenance.planSha256, /^[a-f0-9]{64}$/);
      assert.match(run.provenance.runtime.sourceSha256, /^[a-f0-9]{64}$/);
      assert.strictEqual(run.provenance.projectRevision, null, "An unobserved in-memory revision must stay unknown");
      assert.strictEqual(run.outcome.acceptance.status, "not_requested");
      assert.strictEqual(run.ok, mode === "exact", JSON.stringify({mode, error: run.error, preflight: run.solutionPlanPreflight, readBack: run.solutionPlanReadBack}));
      if (mode === "stale") {
        assert.strictEqual(keyWrites, 0);
        assert.strictEqual(run.solutionPlanPreflight.status, "failed");
      } else {
        assert.strictEqual(keyWrites, 2);
        assert.strictEqual(run.solutionPlanReadBack.status, mode === "exact" ? "passed" : "failed");
        // Preserve the existing full pipeline: this fixture's native semantic
        // coverage is incomplete even when solution-plan read-back passes.
        assert.strictEqual(run.outcome.verification.status, mode === "exact" ? "insufficient" : "failed");
      }
      const canonical = records.readRecord(runtime, run.id, {throwOnError:true});
      assert.deepStrictEqual(run, responseView ? JSON.parse(JSON.stringify(views.projectPlanRunSummary(canonical.run))) : canonical.run);
      assert(canonical.run.validation, "Canonical response must retain full validation before projection");
      assert(canonical.run.outcome.mutation.steps, "Native full outcome retained");
      const evidenceResult = await request("/tools/call", {name:"get_plan_run_evidence",arguments:{runId:run.id,stepIndex:1}});
      assert(!evidenceResult.result.isError,JSON.stringify(evidenceResult));
      assert.equal(JSON.parse(evidenceResult.result.content[0].text).fresh,false);
      const comparison = {writes:keyWrites,reads,nativeResults:canonical.run.steps.map(s=> {
        const result = JSON.parse(JSON.stringify(s.result));
        if (result && result.idempotency) {
          // Per-run receipt identities vary; compare the execution and replay contract.
          delete result.idempotency.key; delete result.idempotency.firstEventId; delete result.idempotency.recordedAt;
        }
        return result;
      }), semantic:canonical.run.semanticVerification, outcome:canonical.run.outcome};
      if (responseView) assert.deepStrictEqual(comparison,parity.get(mode)); else parity.set(mode,comparison);
      const beforeReplay = (await request("/health")).pending;
      const replay = await request("/agents/plan/run", {actionId:proposal.actionId,dryRun:false,responseView:responseView?"full":"summary"},panelToken);
      assert.equal(replay.errorCode || replay.code,"m100_confirmation_replayed",JSON.stringify(replay));
      assert.equal((await request("/health")).pending,beforeReplay);
      const events=fs.readFileSync(path.join(runtime,"bridge-events.jsonl"),"utf8").trim().split(/\r?\n/).map(JSON.parse);
      const slice=require("../mcp-server/review-evidence").linkedEventSlice(events,{runIds:[run.id]});
      assert(slice.some(event=>event.type==="tool_call_finished"));
      assert(slice.some(event=>event.type==="ae_command_result"));
      assert(slice.some(event=>event.type==="plan_step_evidence" && event.details.auditSha256));
      for(const event of slice.filter(event=>event.type==="plan_step_evidence"&&event.details.evidenceRunId===run.id)){
        const artifact=fs.readFileSync(event.details.artifactFile),record=JSON.parse(artifact);
        assert.strictEqual(require("../mcp-server/review-evidence").sha256(artifact),event.details.sha256);
        assert.strictEqual(record.runId,run.id);assert.strictEqual(record.stepIndex,event.details.stepIndex);
        assert.strictEqual(require("../mcp-server/review-evidence").sha256(record.result),event.details.auditSha256);
      }
      assert(slice.filter(event=>event.type==="plan_step_evidence").every(event=>event.details.verificationSubjectRunId===run.id));
      assert(!slice.some(event=>event.details.runId && event.details.runId!==run.id && event.details.actionId!==proposal.actionId));
    }
    console.log(JSON.stringify({ok:true,isolatedRunner:true,fullSummaryNativeParity:true,invalidBeforeCommands:true,dryReadOnlyPersisted:true,canonicalAfterVerification:true,replayRejected:true,liveAeCommands:0}));
  } finally {
    daemon.kill();
    await new Promise(resolve => { if (daemon.exitCode !== null) resolve(); else daemon.once("exit",resolve); });
    fs.rmSync(runtime,{recursive:true,force:true});
  }
}
main().catch((error) => {console.error(error.stack); process.exitCode = 1;});
