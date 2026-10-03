#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { startDaemon, pollPanel, commandEcho, pause } = require("./network-test-fixture");
const { createVisualProject } = require("./placeholder-visual-fixture");

async function main() {
  const project = createVisualProject({ nativeFilesystem: true });
  project.change(`
    app.version = "24.2.1";
    app.project.dirty = false;
    app.project.revision = 42;
  `);

  const fixture = await startDaemon({
    automationToken: "cvr-auto",
    panelToken: "cvr-panel",
    adminToken: "cvr-admin",
    devAdmin: true,
    commandTimeoutMs: 4000,
    setupRuntime(runtime) {
      fs.writeFileSync(
        path.join(runtime, "logs", "edit-session-active.json"),
        JSON.stringify({
          id: "cvr-synthetic-session",
          status: "active",
          checkpoint: { sourceFile: "C:/Synthetic/Protected.aep" },
          operations: []
        })
      );
    }
  });

  const post = (route, body, token = fixture.panelToken) =>
    fixture.request({ path: route, token, body, timeoutMs: 30000 });

  async function withPanel(action) {
    let done = false, response, error;
    await pollPanel(fixture, { projectFile: project.read("app.project.file.fsName") });
    const pending = action().then(
      (value) => { response = value; done = true; },
      (value) => { error = value; done = true; }
    );
    const deadline = Date.now() + 35000;
    while (!done && Date.now() < deadline) {
      const polled = await pollPanel(fixture, { projectFile: project.read("app.project.file.fsName") });
      const command = polled.body.command;
      if (!command) {
        await pause(10);
        continue;
      }
      const script = command.script;
      const echo = commandEcho(command);
      assert.equal((await post("/bridge/submitted", echo)).status, 200);
      const raw = project.execute(script);
      const result = await post("/bridge/result", { ...echo, ok: true, result: JSON.stringify(raw) });
      assert.equal(result.status, 200, result.text);
    }
    assert(done, "Bounded fake panel deadline exceeded");
    await pending;
    if (error) throw error;
    return response;
  }

  async function call(name, args = {}, isError = false) {
    const response = await withPanel(() =>
      post("/tools/call", { name, arguments: args }, fixture.automationToken)
    );
    assert.equal(response.status, 200, response.text);
    const result = response.body.result;
    assert.equal(Boolean(result.isError), isError, JSON.stringify(result));
    return JSON.parse(result.content[0].text);
  }

  try {
    // 1. Tool catalog verification
    const catalog = await fixture.request({ path: "/tools", token: fixture.automationToken });
    const toolNames = new Set(catalog.body.tools.map((t) => t.name));
    for (const tool of ["build_comp_visual_review_plan", "get_comp_visual_review_manifest", "get_project_lifecycle_state"]) {
      assert(toolNames.has(tool), `Missing expected tool in catalog: ${tool}`);
    }

    // 2. get_project_lifecycle_state: strict noargs rejection and valid read
    const badLifecycle = await call("get_project_lifecycle_state", { extraArg: true }, true);
    assert.equal(badLifecycle.ok, false);
    assert.equal(badLifecycle.code, "invalid_lifecycle_state_input");
    assert.match(badLifecycle.error, /accepts no arguments/);

    const lifecycle = await call("get_project_lifecycle_state", {});
    assert.equal(lifecycle.project, "named");
    assert.equal(lifecycle.dirty, false);
    assert.equal(lifecycle.revision, 42);
    assert.equal(lifecycle.appVersion, "24.2.1");
    assert.equal(lifecycle.lifecycleReady, true);

    // 3. build_comp_visual_review_plan: strict bad input (zero native queries) and valid build
    const badBuild1 = await call("build_comp_visual_review_plan", { targets: [] }, true);
    assert.equal(badBuild1.code, "target_count_out_of_range");

    const badBuild2 = await call("build_comp_visual_review_plan", { targets: [{ compItemId: "invalid" }] }, true);
    assert.equal(badBuild2.code, "invalid_target_shape");

    const build = await call("build_comp_visual_review_plan", {
      targets: [{ compItemId: 10, times: [0, 0.04] }]
    });
    assert.equal(build.ok, true);
    assert.equal(build.previewOnly, true);
    assert.equal(build.projectMutations, 0);
    assert.equal(build.plan.steps.length, 5); // get_project_info, save_comp_frame_png x 2, get_comp_details, get_project_info
    assert.equal(build.plan.steps[0].tool, "get_project_info");
    assert.equal(build.plan.steps[1].tool, "save_comp_frame_png");
    assert.equal(build.plan.steps[2].tool, "save_comp_frame_png");
    assert.equal(build.plan.steps[3].tool, "get_comp_details");
    assert.equal(build.plan.steps[4].tool, "get_project_info");

    // 4. get_comp_visual_review_manifest: strict argument validation
    const badManifest1 = await call("get_comp_visual_review_manifest", { runId: "not-a-uuid" }, true);
    assert.equal(badManifest1.code, "invalid_run_id");

    const badManifest2 = await call("get_comp_visual_review_manifest", { runId: "74c0a3b1-1d92-4ae7-9a76-134073fdb281", extra: true }, true);
    assert.equal(badManifest2.code, "invalid_arguments");

    const badManifest3 = await call("get_comp_visual_review_manifest", { runId: 12345 }, true);
    assert.equal(badManifest3.code, "invalid_arguments");

    // 5. Propose and Dry-run
    const proposal = await withPanel(() => post("/agents/plan/propose", { plan: build.plan }));
    assert(proposal.body.proposal, proposal.text);
    const action = proposal.body.proposal;

    const dryRun = await withPanel(() => post("/agents/plan/run", { actionId: action.actionId, dryRun: true }));
    assert.equal(dryRun.body.run.ok, true, dryRun.text);

    // Dry-run manifest cannot be complete
    const dryManifest = await call("get_comp_visual_review_manifest", { runId: dryRun.body.run.id }, true);
    assert.equal(dryManifest.ok, false);
    assert.equal(dryManifest.status, "incomplete");
    assert.equal(dryManifest.historicalCapture, true);
    assert.equal(dryManifest.currentProjectStateVerified, false);
    assert.equal(dryManifest.artisticAccepted, false);

    // 6. Mutating Execution
    const execution = await withPanel(() =>
      post("/agents/plan/run", {
        actionId: action.actionId,
        payloadHash: action.action.payloadHash,
        previewHash: action.action.previewHash,
        riskLevel: action.risk.level,
        riskPolicyVersion: action.confirmation.riskPolicyVersion,
        confirmationToken: action.confirmation.confirmationToken,
        confirmedBySurface: action.confirmation.surface,
        dryRun: false,
        confirm: true,
        allowMutations: true
      })
    );

    assert.equal(execution.body.run.ok, true, execution.text);
    assert.equal(execution.body.run.steps.length, 5);
    for (const step of execution.body.run.steps) {
      assert.equal(step.status, "completed");
    }

    // 7. Completed manifest verification
    const manifest = await call("get_comp_visual_review_manifest", { runId: execution.body.run.id });
    assert.equal(manifest.ok, true);
    assert.equal(manifest.status, "complete");
    assert.equal(manifest.verificationStatus, "verified");
    assert.equal(manifest.executionStatus, "completed");
    assert.equal(manifest.historicalCapture, true);
    assert.equal(manifest.currentProjectStateVerified, false);
    assert.equal(manifest.canonicalFreshness, false);
    assert.equal(manifest.artisticAccepted, false);
    assert.equal(manifest.totalPlannedFrames, 2);
    assert.equal(manifest.verifiedFramesCount, 2);
    assert.equal(manifest.frames.length, 2);
    assert.equal(manifest.frames[0].verified, true);
    assert.equal(manifest.frames[1].verified, true);
    assert.equal(manifest.frames[0].status, "verified");
    assert.equal(manifest.frames[1].status, "verified");
    assert(manifest.frames[0].sha256);
    assert(manifest.frames[1].sha256);

    console.log(JSON.stringify({
      ok: true,
      checks: "comp-visual-review-bridge-smoke: tools catalog, strict lifecycle noargs, builder zero-query input validation, manifest strict args, propose/dry-run gates, mutating execution with PNG export, verified completed manifest with invariant flags"
    }));
  } finally {
    await fixture.stop();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
