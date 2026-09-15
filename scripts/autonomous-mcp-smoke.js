"use strict";

// Изолированный daemon, MCP adapter и фальшивая CEP-панель; AE здесь не запускается.
const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const readline = require("readline");
const {spawn} = require("child_process");
const {buildSolutionPlan, getBuilderContract} = require("../mcp-server/solution-plan-builder");
const {withProjectPanel, isProjectInfo, PROJECT_FILE} = require("./fake-project-panel");

const root = path.resolve(__dirname, "..");
const port = 38000 + Math.floor(Math.random() * 10000);
const token = "autonomous-mcp-smoke";
const runtime = fs.mkdtempSync(path.join(os.tmpdir(), "ae-autonomous-mcp-"));
fs.writeFileSync(path.join(runtime, "edit-session-active.json"), JSON.stringify({
  id: "synt-active-session",
  status: "active",
  startedAt: new Date().toISOString(),
  checkpoint: {sourceFile: PROJECT_FILE},
  operations: []
}));
const env = {...process.env, AE_BRIDGE_PORT: String(port), AE_BRIDGE_TOKEN: token, AE_BRIDGE_LOG_DIR: runtime, AE_DAEMON_AUTO_START: "0"};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function request(route, payload, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request({hostname: "127.0.0.1", port, path: route, method: payload ? "POST" : "GET",
      headers: {"content-type": "application/json", "x-ae-bridge-token": token, ...(headers || {})}, timeout: 10000}, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => {
        try { resolve({status: res.statusCode, body: text ? JSON.parse(text) : {}}); }
        catch (error) { reject(error); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("Autonomous MCP smoke request timed out")));
    req.end(payload ? JSON.stringify(payload) : undefined);
  });
}

async function main() {
  const daemon = spawn(process.execPath, [path.join(root, "mcp-server/bridge-daemon.js")], {
    env, windowsHide: true, stdio: ["ignore", "ignore", "pipe"]
  });
  let adapter;
  let stderr = "";
  daemon.stderr.on("data", (chunk) => { stderr += chunk; });
  try {
    let ready = false;
    for (let index = 0; index < 60; index++) {
      try { ready = (await request("/health")).body.ok === true; if (ready) break; } catch (_error) {}
      await pause(100);
    }
    assert(ready, stderr);

    adapter = spawn(process.execPath, [path.join(root, "mcp-server/mcp-adapter.js")], {
      env, windowsHide: true, stdio: ["pipe", "pipe", "ignore"]
    });
    const pending = new Map();
    readline.createInterface({input: adapter.stdout}).on("line", (line) => {
      const message = JSON.parse(line);
      const item = pending.get(message.id);
      if (!item) return;
      pending.delete(message.id);
      clearTimeout(item.timer);
      message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result);
    });
    let rpcId = 0;
    function rpc(method, params) {
      return new Promise((resolve, reject) => {
        const id = ++rpcId;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`RPC timeout: ${method}`)); }, 30000);
        pending.set(id, {resolve, reject, timer});
        adapter.stdin.write(JSON.stringify({jsonrpc: "2.0", id, method, params}) + "\n");
      });
    }
    async function call(name, args) {
      const result = await rpc("tools/call", {name, arguments: args || {}});
      return {isError: Boolean(result.isError), value: JSON.parse(result.content[0].text)};
    }

    await rpc("initialize", {});
    const solutionId = "ar-distributekeyframesevenly-typed-plan";
    const built = buildSolutionPlan(solutionId, getBuilderContract(solutionId).example);
    assert(built.ok);
    const proposed = await withProjectPanel(port, token, () => call("propose_ai_agent_plan", {plan: built.plan}));
    assert.strictEqual(proposed.isError, false);
    const proposal = proposed.value.proposal;
    assert(proposal.actionId);
    assert.strictEqual(proposal.confirmation.confirmationToken, undefined, "MCP must never receive the confirmation token.");
    const current = (await request("/agents/plan/current")).body.current;
    assert.equal(current.actionId, proposal.actionId);
    assert.equal(current.project.expectedFile, PROJECT_FILE);
    assert.equal(current.proposal.confirmation.confirmationToken, undefined);
    const forged = await request("/agents/plan/run", {plan: built.plan, dryRun: false, confirm: true, allowMutations: true,
      _m100ActionRecord: {...current, executionState: "pending"}, _m100AutonomousSession: {authorized: true}});
    assert.equal(forged.body.errorCode || forged.body.code, "internal_authority_fields_forbidden");

    const runArgs = {
      actionId: proposal.actionId,
      payloadHash: proposal.action.payloadHash,
      previewHash: proposal.action.previewHash,
      riskLevel: proposal.risk.level,
      riskPolicyVersion: proposal.confirmation.riskPolicyVersion,
      dryRun: false
    };
    const withoutLease = await call("run_ai_agent_plan", runArgs);
    assert.strictEqual(withoutLease.isError, true);
    assert.strictEqual(withoutLease.value.code, "proposal_required");

    const panelRoute = "/bridge/next?panelConnectionId=panel-smoke&panelGeneration=1";
    await request(panelRoute);
    const activated = await request("/autonomy/session", {
      enabled: true,
      panelConnectionId: "panel-smoke",
      panelGeneration: "1"
    });
    assert.strictEqual(activated.status, 200);
    assert.strictEqual(activated.body.session.active, true);
    assert.strictEqual(JSON.stringify(activated.body).includes("sessionHash"), false);

    const activeWithoutDryRun = await withProjectPanel(port, token, () => call("run_ai_agent_plan", runArgs));
    assert.strictEqual(activeWithoutDryRun.isError, true);
    assert.strictEqual(activeWithoutDryRun.value.errorCode, "autonomous_session_dry_run_required");
    const preview = await withProjectPanel(port, token, () => call("run_ai_agent_plan", {...runArgs, dryRun: true}));
    assert.strictEqual(preview.isError, false);
    assert.strictEqual(preview.value.ok, true);
    assert.strictEqual(preview.value.executedCount, 0);

    const directMutation = await call("set_layer_transform", {compItemIndex: 1, layerIndex: 1, position: [10, 20]});
    assert.strictEqual(directMutation.isError, true, "Autonomy must not allow individual mutating tools.");
    assert.strictEqual(directMutation.value.code, "proposal_required");
    const rawDirect = await call("run_extendscript", {body: "return true;"});
    assert.strictEqual(rawDirect.isError, true, "Autonomy must not allow direct raw JSX.");
    const destructiveDirect = await call("cleanup_test_items", {namePrefix: "AE_AGENT_QA_", confirm: true});
    assert.strictEqual(destructiveDirect.isError, true, "Autonomy must not allow direct destructive tools.");

    const rawProposalResult = await withProjectPanel(port, token, () => call("propose_ai_agent_plan", {plan: {
      summary: "Raw JSX must remain outside autonomous scope.",
      steps: [{
        title: "Run raw JSX",
        intent: "Exercise the autonomous scope gate without reaching AE.",
        tool: "run_extendscript",
        args: {script: "return true;"},
        targetSummary: "Synthetic smoke target",
        mutatesProject: true
      }]
    }}));
    assert.strictEqual(rawProposalResult.isError, false, JSON.stringify(rawProposalResult.value));
    const rawProposal = rawProposalResult.value.proposal;
    const rawPlanRun = await withProjectPanel(port, token, () => call("run_ai_agent_plan", {
      actionId: rawProposal.actionId,
      payloadHash: rawProposal.action.payloadHash,
      previewHash: rawProposal.action.previewHash,
      riskLevel: rawProposal.risk.level,
      riskPolicyVersion: rawProposal.confirmation.riskPolicyVersion,
      dryRun: false
    }));
    assert.strictEqual(rawPlanRun.isError, true);
    assert.strictEqual(rawPlanRun.value.errorCode, "autonomous_session_scope_blocked");
    const stale = await call("run_ai_agent_plan", {...runArgs, dryRun: true});
    assert.equal(stale.value.errorCode, "plan_superseded");

    // Adopt удерживает capture; новый read-only proposal побеждает до register старого payload.
    const adopting = request("/agents/plan/adopt", {actionId: rawProposal.actionId, revision: rawProposal.revision,
      panelConnectionId: "panel-smoke", panelGeneration: "1", confirmationSessionId: "qa-panel"});
    let heldCapture;
    for (let tries = 0; tries < 200 && !heldCapture; tries++) {
      heldCapture = (await request(panelRoute)).body.command;
      if (!heldCapture) await pause(10);
    }
    assert(isProjectInfo(heldCapture));
    const readOnlyReplacement = await call("propose_ai_agent_plan", {plan: {summary: "Read-only current plan", steps: [{tool: "get_project_info", args: {}}]}});
    assert(!readOnlyReplacement.isError);
    await request("/bridge/result", {id: heldCapture.id, ok: true, result: JSON.stringify({ok: true, result: {file: PROJECT_FILE}})});
    const staleAdopt = await adopting;
    assert.equal(staleAdopt.body.errorCode || staleAdopt.body.code, "plan_superseded");
    assert.equal((await request("/agents/plan/current")).body.current.actionId, readOnlyReplacement.value.proposal.actionId);

    const otherFile = "C:\\Synthetic\\Other.aep";
    const otherProposal = (await withProjectPanel(port, token, () => call("propose_ai_agent_plan", {plan: {...built.plan, targetProject: {file: otherFile}}}), "panel-smoke", otherFile)).value.proposal;
    const otherArgs = {actionId: otherProposal.actionId, payloadHash: otherProposal.action.payloadHash, previewHash: otherProposal.action.previewHash,
      riskLevel: otherProposal.risk.level, riskPolicyVersion: otherProposal.confirmation.riskPolicyVersion};
    await withProjectPanel(port, token, () => call("run_ai_agent_plan", {...otherArgs, dryRun: true}), "panel-smoke", otherFile);
    const wrongCheckpoint = await withProjectPanel(port, token, () => call("run_ai_agent_plan", {...otherArgs, dryRun: false}), "panel-smoke", otherFile);
    assert.equal(wrongCheckpoint.value.errorCode, "edit_session_project_mismatch");
    assert.equal(wrongCheckpoint.value.executedCount, 0);

    // Новая single-lane версия заменяет pending proposal; повторно предложить typed payload.
    const replacement = await withProjectPanel(port, token, () => call("propose_ai_agent_plan", {plan: built.plan}));
    const activeProposal = replacement.value.proposal;
    Object.assign(runArgs, {actionId: activeProposal.actionId, payloadHash: activeProposal.action.payloadHash, previewHash: activeProposal.action.previewHash});
    const limited = await call("run_ai_agent_plan", {...runArgs, dryRun: true, maxSteps: 1});
    assert.equal(limited.value.errorCode, "plan_step_limit_exceeded");
    assert.equal(limited.value.executedCount, 0);
    const wrongProject = await withProjectPanel(port, token, () => call("run_ai_agent_plan", {...runArgs, dryRun: true}), "panel-smoke", "C:\\Synthetic\\Other.aep");
    assert.equal(wrongProject.value.errorCode, "project_target_mismatch");
    assert.equal(wrongProject.value.executedCount, 0);
    await withProjectPanel(port, token, () => call("run_ai_agent_plan", {...runArgs, dryRun: true}));
    let completed = false;
    const running = call("run_ai_agent_plan", runArgs).finally(() => { completed = true; });
    running.catch(() => {});
    let reads = 0;
    let concurrentChecked = false;
    while (!completed) {
      const next = await request(panelRoute);
      const command = next.body.command;
      if (!command) { await pause(10); continue; }
      let result;
      if (isProjectInfo(command)) {
        result = {file: PROJECT_FILE};
      } else if (command.script.includes("sameNameLayerCount: sameNameLayers.length")) {
        result = {comp: {itemIndex: 7, name: "Main", frameRate: 24, duration: 8},
          layer: {index: 2, name: "Card"}, sameNameLayerCount: 1, sameNameLayers: [{index: 2, name: "Card"}]};
      } else if (command.script.includes("propertyTreeTruncated: propertyState")) {
        reads += 1;
        const expected = built.plan.expectedReadBack[reads === 1 ? "before" : "after"][0];
        result = {comp: {itemIndex: expected.compItemIndex, name: expected.compName},
          layer: {index: expected.layerIndex, name: expected.layerName}, propertyTreeTruncated: false,
          propertyTree: [{propertyPath: expected.propertyPath, expressionEnabled: false,
            numKeys: expected.completeKeyframes.length,
            keyframes: expected.completeKeyframes.map((key) => ({...key})), keyframesTruncated: false}]};
      } else if (command.script.includes("setValueAtTime")) {
        if (!concurrentChecked) {
          concurrentChecked = true;
          const duplicate = await call("run_ai_agent_plan", runArgs);
          assert.equal(duplicate.value.errorCode, "m100_confirmation_replayed");
          const stillRunning = (await request("/agents/plan/current")).body.current;
          assert.equal(stillRunning.actionId, activeProposal.actionId); assert.equal(stillRunning.state, "executing");
          const competing = await call("propose_ai_agent_plan", {plan: {summary: "Concurrent replacement", steps: [{tool: "get_project_info", args: {}}]}});
          assert.equal(competing.value.errorCode || competing.value.code, "plan_execution_in_progress");
          assert.equal((await request("/agents/plan/current")).body.current.state, "executing");
        }
        result = {keyframeCount: 3, clearExisting: true, propertyPath: [2, 11]};
      } else if (command.script.includes("setInterpolationTypeAtKey")) {
        result = {keyIndices: [1, 2, 3], interpolation: "linear"};
      } else {
        throw new Error(`Unexpected synthetic panel command: ${command.script.slice(-1600)}`);
      }
      await request("/bridge/result", {id: command.id, ok: true, result: JSON.stringify({ok: true, result}), error: null});
    }
    const completedRun = await running;
    assert.strictEqual(completedRun.isError, false, JSON.stringify({
      error: completedRun.value.error,
      errorCode: completedRun.value.errorCode,
      safety: completedRun.value.safety,
      steps: completedRun.value.steps,
      readBack: completedRun.value.solutionPlanReadBack,
      semantic: completedRun.value.semanticVerification
    }, null, 2));
    assert.strictEqual(completedRun.value.ok, true);
    assert.strictEqual(completedRun.value.m100Action.confirmedBySurface, "cep-autonomous-session");
    assert.strictEqual(completedRun.value.safety.autonomousSession.capability, "typed_mutating_plan");
    assert.strictEqual(JSON.stringify(completedRun.value).includes("confirmationToken"), false);

    const replay = await withProjectPanel(port, token, () => call("run_ai_agent_plan", runArgs));
    assert.strictEqual(replay.isError, true);
    assert.strictEqual(replay.value.errorCode, "m100_confirmation_replayed");

    const freshPlan = JSON.parse(JSON.stringify(built.plan));
    freshPlan.steps.forEach((step) => {delete step.args.idempotencyKey; delete step.args.idempotencyScope;});
    const revokeProposal = (await withProjectPanel(port, token, () => call("propose_ai_agent_plan", {plan: freshPlan}))).value.proposal;
    await withProjectPanel(port, token, () => call("run_ai_agent_plan", {actionId: revokeProposal.actionId, dryRun: true}));
    let revokeDone = false;
    let mutationCommands = 0;
    const revokeRun = call("run_ai_agent_plan", {...runArgs, actionId: revokeProposal.actionId,
      payloadHash: revokeProposal.action.payloadHash, previewHash: revokeProposal.action.previewHash, dryRun: false}).finally(() => {revokeDone = true;});
    revokeRun.catch(() => {});
    while (!revokeDone) {
      const command = (await request(panelRoute)).body.command;
      if (!command) {await pause(10); continue;}
      let result;
      if (isProjectInfo(command)) result = {file: PROJECT_FILE};
      else if (command.script.includes("sameNameLayerCount: sameNameLayers.length")) result = {comp: {itemIndex: 7, name: "Main"}, layer: {index: 2, name: "Card"}, sameNameLayerCount: 1, sameNameLayers: [{index: 2, name: "Card"}]};
      else if (command.script.includes("propertyTreeTruncated: propertyState")) {
        const expected = built.plan.expectedReadBack.before[0];
        result = {comp: {itemIndex: 7, name: "Main"}, layer: {index: 2, name: "Card"}, propertyTreeTruncated: false,
          propertyTree: [{propertyPath: expected.propertyPath, expressionEnabled: false, numKeys: expected.completeKeyframes.length,
            keyframes: expected.completeKeyframes, keyframesTruncated: false}]};
      } else if (command.script.includes("setValueAtTime")) {
        mutationCommands++;
        // Отзыв после выполнения первой команды; следующая мутация не должна выдаваться.
        result = {keyframeCount: 3, propertyPath: [2, 11]};
        await request("/autonomy/session", {enabled: false, panelConnectionId: "panel-smoke", panelGeneration: "1"});
      } else throw new Error("Unexpected command after revoke: " + command.script.slice(-200));
      await request("/bridge/result", {id: command.id, ok: true, result: JSON.stringify({ok: true, result})});
    }
    const stopped = (await revokeRun).value;
    assert.equal(stopped.ok, false);
    assert.equal(stopped.errorCode, "autonomous_session_expired_or_revoked");
    assert.equal(mutationCommands, 1);
    assert.equal(stopped.repairDirective.disposition, "inspect_and_stop");

    // Успешный transport с неверным audit не разрешает следующую mutation.
    await request("/autonomy/session", {enabled: true, panelConnectionId: "panel-smoke", panelGeneration: "1"});
    const qaPrefix = "CODX_AUDIT_STOP_", qaMaster = qaPrefix + "MASTER";
    const auditPlan = {summary: "Stop on semantically incorrect typed audit", targetProject: {file: PROJECT_FILE}, requiresCheckpoint: true, steps: [
      {tool: "create_slideshow_master", args: {expectedProjectFile: PROJECT_FILE, generatedPrefix: qaPrefix, masterName: qaMaster,
        width: 640, height: 360, pixelAspect: 1, duration: 8, frameRate: 30, backgroundColor: [0, 0, 0]}},
      {tool: "audit_slideshow_generated", args: {expectedProjectFile: PROJECT_FILE, generatedPrefix: qaPrefix,
        rootCompItemIndex: 99, expectedRootCompName: qaMaster, expectedDuration: 8, sourceFingerprints: []}},
      {tool: "set_comp_properties", args: {compItemIndex: 99, expectedCompName: qaMaster, motionBlur: true}}
    ]};
    const auditProposal = (await withProjectPanel(port, token, () => call("propose_ai_agent_plan", {plan: auditPlan}))).value.proposal;
    await withProjectPanel(port, token, () => call("run_ai_agent_plan", {actionId: auditProposal.actionId, dryRun: true}));
    let auditDone = false, auditMutations = 0;
    const auditRun = call("run_ai_agent_plan", {actionId: auditProposal.actionId, payloadHash: auditProposal.action.payloadHash,
      previewHash: auditProposal.action.previewHash, riskLevel: auditProposal.risk.level, riskPolicyVersion: auditProposal.confirmation.riskPolicyVersion,
      dryRun: false, stopOnError: false}).finally(() => {auditDone = true;});
    auditRun.catch(() => {});
    while (!auditDone) {
      const command = (await request(panelRoute)).body.command;
      if (!command) {await pause(10); continue;}
      let result;
      if (isProjectInfo(command)) result = {file: PROJECT_FILE};
      else if (command.script.includes('operation:"create_master"')) {auditMutations++; result = {ok: true, masterCompItemIndex: 99, masterCompName: qaMaster};}
      else if (command.script.includes("sameNameLayerCount: sameNameLayers.length")) result = {comp: {itemIndex: 99, name: qaMaster}, sameNameLayerCount: 0};
      else if (command.script.includes('operation:"audit_generated"')) result = {ok: true, root: {itemIndex: 99, name: qaMaster, duration: 8},
        issues: [], stats: {backgroundLayers: 0}, details: {layers: [], keyMetadata: []}, sourceFingerprints: []};
      else throw new Error("Mutation after failed slideshow audit: " + command.script.slice(-200));
      await request("/bridge/result", {id: command.id, ok: true, result: JSON.stringify({ok: true, result})});
    }
    const auditStopped = (await auditRun).value;
    assert.equal(auditStopped.errorCode, "slideshow_verification_failed", JSON.stringify({error:auditStopped.error,steps:auditStopped.steps}));
    assert.equal(auditMutations, 1);
    const invalidTarget = (await withProjectPanel(port, token, () => call("propose_ai_agent_plan", {plan: {
      summary: "Keep exact runtime refusal", targetProject: {file: PROJECT_FILE}, steps: [
        {tool: "create_text_layer", args: {compItemIndex: 0, name: "CODX_INVALID", text: "fixture"}}
      ]
    }}))).value.proposal;
    await withProjectPanel(port, token, () => call("run_ai_agent_plan", {actionId: invalidTarget.actionId, dryRun: true}));
    const invalidRun = (await withProjectPanel(port, token, () => call("run_ai_agent_plan", {actionId: invalidTarget.actionId,
      payloadHash: invalidTarget.action.payloadHash, previewHash: invalidTarget.action.previewHash, riskLevel: invalidTarget.risk.level,
      riskPolicyVersion: invalidTarget.confirmation.riskPolicyVersion, dryRun: false}))).value;
    assert.equal(invalidRun.ok, false);
    assert.match(invalidRun.error, /compItemIndex must be a positive/);
    assert.equal((await request("/agents/plan/current")).body.current.lastRun.error, invalidRun.error);
    const telemetry = fs.readFileSync(path.join(runtime, "autonomy-obstacles.jsonl"), "utf8");
    assert(!telemetry.includes(PROJECT_FILE)); assert(!telemetry.includes("confirmationToken"));

    const revoked = await request("/autonomy/session", {enabled: false, panelConnectionId: "panel-smoke", panelGeneration: "1"});
    assert.strictEqual(revoked.body.session.active, false);
    console.log(JSON.stringify({ok: true, noLeaseBlocked: true, dryRunRequired: true, typedPlanExecuted: true, directMutationBlocked: true,
      rawDirectBlocked: true, rawPlanBlocked: true, destructiveDirectBlocked: true, replayBlocked: true,
      authorityNotExposed: true, revoked: true, currentPlanSynchronized: true, obsoletePreviewBlocked: true,
      wrongProjectBlocked: true, stepLimitFailClosed: true, revokeBetweenMutations: true, telemetryRedacted: true,
      internalAuthorityRejected: true, staleAdoptRaceBlocked: true, checkpointProjectMatched: true, concurrentExecutionPreserved: concurrentChecked,
      slideshowReadBackStopsNextMutation: true, exactRuntimeRefusalPreserved: true}, null, 2));
  } finally {
    if (adapter) adapter.kill();
    daemon.kill();
  }
}

main().catch((error) => { console.error(error.stack || String(error)); process.exitCode = 1; });
