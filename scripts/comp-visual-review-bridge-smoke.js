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

  async function withPanel(action, afterNativeResult = null) {
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
      if (typeof afterNativeResult === "function") {
        afterNativeResult(command, raw);
      }
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

    // 3. get_project_info: confirmed native revision and supported.revision
    const projectInfo = await call("get_project_info", {});
    assert.equal(projectInfo.revision, 42);
    assert.equal(projectInfo.supported && projectInfo.supported.revision, true);

    // 4. build_comp_visual_review_plan: strict bad input (zero native queries) and revision guards
    const badBuild1 = await call("build_comp_visual_review_plan", { targets: [] }, true);
    assert.equal(badBuild1.code, "target_count_out_of_range");

    const badBuild2 = await call("build_comp_visual_review_plan", { targets: [{ compItemId: "invalid" }] }, true);
    assert.equal(badBuild2.code, "invalid_target_shape");

    // 4a. Native reads never coerce unknown, nonnumeric or unsafe revisions into proof.
    for (const value of ["undefined", "null", '"42"', "false", "9007199254740992", "-1", "1.5"]) {
      project.change(`app.project.revision = ${value};`);
      const info = await call("get_project_info", {});
      assert.equal(info.revision, null, value);
      assert.equal(info.supported.revision, false, value);
      const badRevisionBuild = await call("build_comp_visual_review_plan", {
        targets: [{ compItemId: 10, times: [0] }]
      }, true);
      assert.equal(badRevisionBuild.ok, false, value);
      assert.equal(badRevisionBuild.code, "project_revision_unavailable", value);
    }

    const isProjectInfoResult = (command, raw) =>
      command.script.includes("var framesCount = __codexFramesCountTypeSnapshot(project);") &&
      raw && raw.result && Object.hasOwn(raw.result, "revision");
    const buildRequest = () => post("/tools/call", {
      name: "build_comp_visual_review_plan",
      arguments: { targets: [{ compItemId: 10, times: [0] }] }
    }, fixture.automationToken);
    const assertBuildRejected = (response, code) => {
      assert.equal(response.status, 200, response.text);
      assert.equal(response.body.result.isError, true);
      const result = JSON.parse(response.body.result.content[0].text);
      assert.equal(result.ok, false);
      assert.equal(result.code, code);
    };

    // 4b. Reject revision drift (10 -> 11) with same file and numItems
    project.change("app.project.revision = 10;");
    const driftObservations = [];
    const driftResponse = await withPanel(buildRequest,
      (command, raw) => {
        if (isProjectInfoResult(command, raw)) {
          driftObservations.push(raw.result);
          if (driftObservations.length === 1) {
            project.change("app.project.revision = 11;");
          }
        }
      }
    );
    assertBuildRejected(driftResponse, "stale_project");
    assert.deepEqual(driftObservations.map((info) => info.revision), [10, 11]);
    assert.equal(driftObservations[0].file, driftObservations[1].file);
    assert.equal(driftObservations[0].numItems, driftObservations[1].numItems);

    // The closing bracket must also prove a native revision.
    project.change("app.project.revision = 42;");
    const unavailableObservations = [];
    const unavailableResponse = await withPanel(buildRequest, (command, raw) => {
      if (isProjectInfoResult(command, raw)) {
        unavailableObservations.push(raw.result);
        if (unavailableObservations.length === 1) project.change("delete app.project.revision;");
      }
    });
    assertBuildRejected(unavailableResponse, "project_revision_unavailable");
    assert.deepEqual(unavailableObservations.map((info) => info.revision), [42, null]);
    assert.equal(unavailableObservations[1].supported.revision, false);

    // An unconfirmed numeric value cannot serve as equality proof either.
    project.change("app.project.revision = 42;");
    const unconfirmedResponse = await withPanel(buildRequest, (command, raw) => {
      if (isProjectInfoResult(command, raw)) raw.result.supported.revision = false;
    });
    assertBuildRejected(unconfirmedResponse, "project_revision_unavailable");
    project.change("app.project.revision = 42;");

    // 4c. Equal known revisions (42 -> 42) => build success
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
      checks: "comp-visual-review-bridge-smoke: tools catalog, strict lifecycle noargs, get_project_info native revision, builder revision bracket and drift rejection, builder zero-query input validation, manifest strict args, propose/dry-run gates, mutating execution with PNG export, verified completed manifest with invariant flags"
    }));
  } finally {
    await fixture.stop();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
