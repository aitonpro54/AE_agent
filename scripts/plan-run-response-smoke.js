"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");

const planRunResponse = require("../mcp-server/plan-run-response");
const planRunRecords = require("../mcp-server/plan-run-records");
// Isolate every handler write from the workspace and from any live bridge.
const handlerRuntime = fs.mkdtempSync(path.join(os.tmpdir(), "ae-response-handler-"));
process.env.AE_BRIDGE_LOG_DIR = handlerRuntime;
process.env.AE_BRIDGE_STATE_DIR = handlerRuntime;
const bridgeDaemon = require("../mcp-server/bridge-daemon");

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function makeUuid() {
  return crypto.randomUUID();
}

async function runTests() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ae-plan-run-response-smoke-"));

  try {
    // -------------------------------------------------------------
    // Test 1: Tool definitions and input schemas in bridge-daemon
    // -------------------------------------------------------------
    console.log("Test 1: Tools catalog exposure");
    // Test callToolLogged or tools catalog via callTool
    const dummyRunId = makeUuid();
    const missingEvidenceCall = await bridgeDaemon.callTool("get_plan_run_evidence", { runId: dummyRunId });
    assert.equal(missingEvidenceCall.isError, true, "Should fail on missing record");
    const missingPayload = JSON.parse(missingEvidenceCall.content[0].text);
    assert.equal(missingPayload.code, "run_record_missing");

    // -------------------------------------------------------------
    // Test 2: Pre-execution validation of responseView
    // -------------------------------------------------------------
    console.log("Test 2: Pre-execution responseView validation");
    assert.equal(planRunResponse.assertValidResponseView(undefined), "full");
    assert.equal(planRunResponse.assertValidResponseView(null), "full");
    assert.equal(planRunResponse.assertValidResponseView("full"), "full");
    assert.equal(planRunResponse.assertValidResponseView("summary"), "summary");

    for (const badView of ["compact", "short", "SUMARY", 123, false, {}]) {
      assert.throws(
        () => planRunResponse.assertValidResponseView(badView),
        (err) => err.code === "response_view_invalid",
        `Expected response_view_invalid for ${badView}`
      );
    }

    const invalidToolResult = await bridgeDaemon.callTool("run_ai_agent_plan", { responseView: "invalid_view" });
    assert.equal(invalidToolResult.isError, true);
    const invalidResultPayload = JSON.parse(invalidToolResult.content[0].text);
    assert.equal(invalidResultPayload.code, "response_view_invalid");

    // -------------------------------------------------------------
    // Test 3: 20-step successful fixture summary byte budget (<= 12 KiB)
    // -------------------------------------------------------------
    console.log("Test 3: 20-step fixture UTF-8 summary byte budget <= 12 KiB");
    const runId20 = makeUuid();
    const actionId20 = makeUuid();

    // Build a realistic 20-step run with bulky data (property trees, large command histories, etc.)
    const heavySteps = [];
    for (let i = 1; i <= 20; i++) {
      heavySteps.push({
        index: i,
        tool: i % 2 === 0 ? "set_property_value" : "save_comp_frame_png",
        status: "completed",
        mutatesProject: i % 2 === 0,
        durationMs: 45 + i,
        title: `Synthetic montage shot adjustment step #${i} with extended explanation`,
        isError: false,
        result: {
          ok: true,
          comp: { itemId: 100, itemIndex: 1, name: "Main_Montage_Comp" },
          layer: { id: 200 + i, index: i, name: `Layer_Shot_${i}`, source: {itemId: 300 + i} },
          postVerification: { ok: true },
          // Bulky diagnostic tree that summary must strip
          bulkyInternalPropertyTree: {
            matchName: "ADBE Root Vectors Group",
            numProperties: 150,
            children: Array.from({ length: 40 }, (_, idx) => ({
              name: `Property_${idx}`,
              matchName: `ADBE Vector_${idx}`,
              value: [idx * 1.5, idx * 2.5, idx * 3.5],
              expression: `time * ${idx}`
            }))
          },
          bulkyExtendedLog: "x".repeat(1500)
        },
        commands: [
          { id: makeUuid(), role: "mutation", script: "app.project.item(1)...", state: "completed" },
          { id: makeUuid(), role: "readback", script: "app.project.item(1)...", state: "completed" }
        ],
        evidenceArtifact: {
          artifactId: `${runId20}-step-${i}`,
          sha256: sha256(`synthetic-artifact-content-${i}`)
        }
      });
    }

    const fullRun20 = {
      id: runId20,
      startedAt: "2026-10-02T16:00:00.000Z",
      finishedAt: "2026-10-02T16:00:02.500Z",
      ok: true,
      dryRun: false,
      confirm: true,
      allowMutations: true,
      autoEditSession: true,
      executedCount: 20,
      skippedCount: 0,
      failedCount: 0,
      steps: heavySteps,
      safety: {
        mutatingExecution: true,
        checkpointStepPresent: true,
        activeEditSessionAtStart: true,
        autoEditSession: true,
        allowWithoutCheckpoint: false,
        allowRawExtendscript: false,
        protection: "active_edit_session",
        status: "passed"
      },
      editSession: {
        id: "session-uuid-1",
        status: "active"
      },
      checkpoint: {
        label: "pre-montage-checkpoint",
        sourceFile: "C:/Projects/Montage.aep",
        checkpointFile: "C:/Projects/Montage_cp.aep"
      },
      provenance: {
        schema: "ae-agent-run-provenance.v1",
        actionId: actionId20,
        proposalRevision: 1,
        projectId: sha256("C:/Projects/Montage.aep"),
        projectRevision: "rev-1",
        projectRevisionReason: "in_memory_revision_not_observed",
        planSha256: sha256("plan-data"),
        runtime: {
          gitCommit: "c0ffeebabe1234567890abcdef1234567890abcd",
          sourceSha256: sha256("source-data")
        }
      },
      outcome: {
        execution: { status: "completed" },
        mutation: { status: "applied", count: 10 },
        verification: { status: "passed", count: 20 },
        acceptance: { status: "pending" }
      },
      semanticVerification: {
        status: "passed",
        ok: true,
        unverifiedMutationCount: 0,
        checks: Array.from({ length: 20 }, (_, idx) => ({
          tool: "set_property_value",
          passed: true,
          scope: `layer_${idx}`
        }))
      },
      solutionPlanPreflight: { status: "passed" },
      solutionPlanReadBack: { status: "passed" },
      solutionReuse: {
        builderProvenance: {
          templateId: "montage-template-v1"
        }
      },
      repairDirective: null
    };

    // Native run-outcome and semantic module objects, including mutation.steps.
    const nativePlan = {steps: heavySteps.map(s => ({tool:s.tool, args:{}}))};
    fullRun20.outcome = require("../mcp-server/run-outcome").buildRunOutcome(fullRun20, nativePlan);
    const fullJson = JSON.stringify(fullRun20);
    const fullByteLength = Buffer.byteLength(fullJson, "utf8");
    assert(fullByteLength > 15000, `Full run should be substantial in size (was ${fullByteLength} bytes)`);

    const summary20 = planRunResponse.projectPlanRunSummary(fullRun20);
    const summaryJson = JSON.stringify(summary20);
    const summaryByteLength = Buffer.byteLength(summaryJson, "utf8");

    console.log(`20-step full run size: ${fullByteLength} bytes`);
    console.log(`20-step summary size: ${summaryByteLength} bytes (limit is 12288 bytes)`);

    assert(
      summaryByteLength <= 12288,
      `Summary must be <= 12288 UTF-8 bytes, got ${summaryByteLength} bytes`
    );
    assert.equal(summary20.schema, "ae-agent-plan-run-summary.v1");
    assert.equal(summary20.responseView, "summary");
    assert.equal(summary20.steps.length, 20);
    // Ensure raw trees were stripped
    for (const step of summary20.steps) {
      assert.equal(step.bulkyInternalPropertyTree, undefined);
      assert.equal(step.commands, undefined);
      assert.equal(step.status, "completed");
      assert.equal(step.resultRef.ok, true);
    }

    // -------------------------------------------------------------
    // Test 4: Full and summary parity
    // -------------------------------------------------------------
    console.log("Test 4: Parity between full and summary");
    assert.equal(summary20.id, fullRun20.id);
    assert.equal(summary20.startedAt, fullRun20.startedAt);
    assert.equal(summary20.finishedAt, fullRun20.finishedAt);
    assert.equal(summary20.ok, fullRun20.ok);
    assert.equal(summary20.dryRun, fullRun20.dryRun);
    assert.equal(summary20.confirm, fullRun20.confirm);
    assert.equal(summary20.allowMutations, fullRun20.allowMutations);
    assert.equal(summary20.executedCount, fullRun20.executedCount);
    assert.equal(summary20.skippedCount, fullRun20.skippedCount);
    assert.equal(summary20.failedCount, fullRun20.failedCount);
        for (const axis of ["execution", "mutation", "verification", "coverage", "acceptance"]) {
      assert.equal(summary20.outcome[axis].status, fullRun20.outcome[axis].status);
    }
    assert.deepEqual(summary20.outcome.mutation.counts, fullRun20.outcome.mutation.counts);
    assert.equal(summary20.outcome.mutation.stepCount, fullRun20.outcome.mutation.steps.length);
    assert.equal(summary20.steps[0].resultRef.comp.itemId, 100);
    assert.equal(summary20.steps[0].resultRef.layer.id, 201);
    assert.equal(summary20.steps[0].resultRef.source.itemId, 301);
    assert.deepEqual(summary20.provenance, fullRun20.provenance);
    assert.equal(summary20.evidenceReference.runId, fullRun20.id);
    assert.equal(summary20.evidenceReference.totalSteps, 20);

    // -------------------------------------------------------------
    // Test 5: Error truncation and unknown preservation
    // -------------------------------------------------------------
    console.log("Test 5: Error truncation and unknown preservation");
    const longErrorMessage = "Detailed After Effects ExtendScript stack trace: ".repeat(20);
    const failureRun = {
      id: makeUuid(),
      startedAt: "2026-10-02T16:05:00.000Z",
      finishedAt: "2026-10-02T16:05:01.000Z",
      ok: false,
      dryRun: false,
      confirm: true,
      allowMutations: true,
      executedCount: 1,
      skippedCount: 1,
      failedCount: 1,
      errorCode: "execution_timed_out",
      error: longErrorMessage,
      recoveryHint: "Wait for background render or rebind composition.",
      steps: [
        {
          index: 1,
          tool: "set_layer_transform",
          status: "unknown",
          mutatesProject: true,
          durationMs: 5000,
          errorCode: "timeout_after_submitted",
          error: longErrorMessage,
          result: { error: longErrorMessage }
        },
        {
          index: 2,
          tool: "save_comp_frame_png",
          status: "skipped",
          mutatesProject: false,
          durationMs: 0
        }
      ],
      outcome: {
        execution: { status: "unknown" },
        mutation: { status: "unknown" },
        verification: { status: "not_started" },
        acceptance: { status: "not_requested" }
      },
      semanticVerification: {
        status: "needs_review",
        ok: false,
        unverifiedMutationCount: 1,
        checks: [
          { tool: "set_layer_transform", passed: false, reason: "Command timed out in submitted state" },
          { tool: "set_layer_transform", passed: false, reason: "Second verification failure reason" }
        ]
      },
      repairDirective: {
        action: "reconcile_plan_run",
        runId: "will-match"
      }
    };

    const failureSummary = planRunResponse.projectPlanRunSummary(failureRun);
    assert.equal(failureSummary.ok, false);
    assert.equal(failureSummary.errorCode, "execution_timed_out");
    assert(failureSummary.error.endsWith("...<truncated>"));
    assert(failureSummary.error.length <= 420);
    assert.equal(failureSummary.outcome.execution.status, "unknown");
    assert.equal(failureSummary.outcome.mutation.status, "unknown");
    assert.equal(failureSummary.steps[0].status, "unknown");
    assert.equal(failureSummary.steps[0].truncated, true);
    assert(failureSummary.steps[0].error.endsWith("...<truncated>"));
    assert.equal(failureSummary.steps[1].status, "skipped");
    assert.equal(failureSummary.semanticVerification.ok, false);
    assert.equal(failureSummary.semanticVerification.failedChecks, 2);
    assert.equal(failureSummary.semanticVerification.failureExcerpt.length, 2);
    assert.equal(failureSummary.repairDirective.action, "reconcile_plan_run");

    // -------------------------------------------------------------
    // Test 6: get_plan_run_evidence - Full canonical run retrieval
    // -------------------------------------------------------------
    console.log("Test 6: get_plan_run_evidence for full canonical run");
    const recordRunId = makeUuid();
    const fullCanonicalRecord = {
      schema: "ae-agent-plan-run-record.v1",
      runId: recordRunId,
      createdAt: "2026-10-02T16:10:00.000Z",
      plan: {
        summary: "Synthetic Montage Plan",
        steps: [{ tool: "get_layer_details", args: { layerIndex: 1 } }]
      },
      project: { file: "C:/Projects/Montage.aep" },
      run: {
        id: recordRunId,
        startedAt: "2026-10-02T16:10:00.000Z",
        finishedAt: "2026-10-02T16:10:00.500Z",
        ok: true,
        dryRun: false,
        confirm: true,
        allowMutations: false,
        executedCount: 1,
        skippedCount: 0,
        failedCount: 0,
        steps: [
          {
            index: 1,
            tool: "get_layer_details",
            status: "completed",
            mutatesProject: false,
            durationMs: 30,
            result: { ok: true, layer: { index: 1, name: "Title" } }
          }
        ],
        provenance: {
          schema: "ae-agent-run-provenance.v1",
          actionId: makeUuid()
        }
      }
    };

    planRunRecords.writeRecord(tmpDir, fullCanonicalRecord);

    const fullEvidence = planRunResponse.getPlanRunEvidence(tmpDir, { runId: recordRunId });
    assert.equal(fullEvidence.schema, "ae-agent-plan-run-evidence.v1");
    assert.equal(fullEvidence.runId, recordRunId);
    assert.equal(fullEvidence.stepIndex, null);
    assert.equal(fullEvidence.fresh, false);
    assert.equal(fullEvidence.evidenceKind, "recorded");
    assert.equal(typeof fullEvidence.sha256, "string");
    assert.equal(fullEvidence.offset, 0);
    assert.equal(fullEvidence.limitChars, 6000);
    assert(fullEvidence.totalChars > 0);
    assert.equal(fullEvidence.text, JSON.stringify(fullCanonicalRecord));
    assert.equal(fullEvidence.nextOffset, null);

    // -------------------------------------------------------------
    // Test 7: get_plan_run_evidence - Step artifact retrieval
    // -------------------------------------------------------------
    console.log("Test 7: get_plan_run_evidence for step artifact");
    const stepRunId = makeUuid();
    const nativeArtifact = require("../mcp-server/review-evidence").writeStepEvidence(tmpDir, {
      schema: "ae-agent-step-evidence.v1",
      runId: stepRunId,
      stepIndex: 1,
      actionId: null,
      observedAt: "2026-10-02T16:12:00.000Z",
      tool: "set_property_value",
      verification: {
        ok: true,
        observedValue: [960, 540]
      }
    });
    const step1ArtifactContent = fs.readFileSync(nativeArtifact.artifactFile,"utf8");
    const step1Sha256 = nativeArtifact.sha256;

    const stepCanonicalRecord = {
      schema: "ae-agent-plan-run-record.v1",
      runId: stepRunId,
      createdAt: "2026-10-02T16:12:00.000Z",
      plan: {
        summary: "Step test plan",
        steps: [{ tool: "set_property_value" }]
      },
      project: { file: "C:/Projects/Montage.aep" },
      run: {
        id: stepRunId,
        startedAt: "2026-10-02T16:12:00.000Z",
        finishedAt: "2026-10-02T16:12:01.000Z",
        ok: true,
        dryRun: false,
        confirm: true,
        allowMutations: true,
        executedCount: 1,
        skippedCount: 0,
        failedCount: 0,
        steps: [
          {
            index: 1,
            tool: "set_property_value",
            status: "completed",
            mutatesProject: true,
            durationMs: 40,
            evidenceArtifact: {
              artifactId: `${stepRunId}-step-1`,
              sha256: step1Sha256
            }
          }
        ]
      }
    };

    planRunRecords.writeRecord(tmpDir, stepCanonicalRecord);

    // Write step artifact file
    const stepArtifactDir = path.join(tmpDir, "verification-evidence", stepRunId);
    fs.mkdirSync(stepArtifactDir, { recursive: true });
    fs.writeFileSync(path.join(stepArtifactDir, "1.json"), step1ArtifactContent, "utf8");

    const stepEvidence = planRunResponse.getPlanRunEvidence(tmpDir, { runId: stepRunId, stepIndex: 1 });
    assert.equal(stepEvidence.schema, "ae-agent-plan-run-evidence.v1");
    assert.equal(stepEvidence.runId, stepRunId);
    assert.equal(stepEvidence.stepIndex, 1);
    assert.equal(stepEvidence.artifactId, `${stepRunId}-step-1`);
    assert.equal(stepEvidence.sha256, step1Sha256);
    assert.equal(stepEvidence.fresh, false);
    assert.equal(stepEvidence.evidenceKind, "recorded");
    assert.equal(stepEvidence.text, step1ArtifactContent);

    // -------------------------------------------------------------
    // Test 8: Security & integrity gates
    // -------------------------------------------------------------
    console.log("Test 8: Security and integrity gates");
    // Invalid runId
    assert.throws(
      () => planRunResponse.getPlanRunEvidence(tmpDir, { runId: "not-a-uuid" }),
      (err) => err.code === "plan_run_id_invalid"
    );

    // Invalid stepIndex
    assert.throws(
      () => planRunResponse.getPlanRunEvidence(tmpDir, { runId: stepRunId, stepIndex: 0 }),
      (err) => err.code === "step_index_invalid"
    );
    assert.throws(
      () => planRunResponse.getPlanRunEvidence(tmpDir, { runId: stepRunId, stepIndex: -1 }),
      (err) => err.code === "step_index_invalid"
    );
    assert.throws(
      () => planRunResponse.getPlanRunEvidence(tmpDir, { runId: stepRunId, stepIndex: 1.5 }),
      (err) => err.code === "step_index_invalid"
    );

    // Invalid offset & limitChars
    assert.throws(
      () => planRunResponse.getPlanRunEvidence(tmpDir, { runId: stepRunId, offset: -1 }),
      (err) => err.code === "offset_invalid"
    );
    assert.throws(
      () => planRunResponse.getPlanRunEvidence(tmpDir, { runId: stepRunId, limitChars: 0 }),
      (err) => err.code === "limit_chars_invalid"
    );
    assert.throws(
      () => planRunResponse.getPlanRunEvidence(tmpDir, { runId: stepRunId, limitChars: 12001 }),
      (err) => err.code === "limit_chars_invalid"
    );

    // Tampered run envelope
    const tamperedRunId = makeUuid();
    const tamperedFile = path.join(tmpDir, "evidence", "plan-runs", `${tamperedRunId}.json`);
    fs.writeFileSync(
      tamperedFile,
      JSON.stringify({
        schema: "ae-agent-plan-run-record-envelope.v1",
        sha256: "0".repeat(64),
        record: { schema: "ae-agent-plan-run-record.v1", runId: tamperedRunId, plan: {}, run: {} }
      }),
      "utf8"
    );
    assert.throws(
      () => planRunResponse.getPlanRunEvidence(tmpDir, { runId: tamperedRunId }),
      (err) => err.code === "record_integrity_failed"
    );

    // Tampered step artifact file (content altered without updating canonical record)
    const tamperedStepRunId = makeUuid();
    const tamperedStepRecord = {
      schema: "ae-agent-plan-run-record.v1",
      runId: tamperedStepRunId,
      createdAt: "2026-10-02T16:15:00.000Z",
      plan: { steps: [{ tool: "set_property_value" }] },
      project: { file: "C:/Projects/Montage.aep" },
      run: {
        id: tamperedStepRunId,
        steps: [
          {
            index: 1,
            tool: "set_property_value",
            evidenceArtifact: {
              artifactId: `${tamperedStepRunId}-step-1`,
              sha256: sha256("original-untampered-content")
            }
          }
        ]
      }
    };
    planRunRecords.writeRecord(tmpDir, tamperedStepRecord);
    const tamperedStepDir = path.join(tmpDir, "verification-evidence", tamperedStepRunId);
    fs.mkdirSync(tamperedStepDir, { recursive: true });
    fs.writeFileSync(path.join(tamperedStepDir, "1.json"), JSON.stringify({ hacked: true }), "utf8");

    assert.throws(
      () => planRunResponse.getPlanRunEvidence(tmpDir, { runId: tamperedStepRunId, stepIndex: 1 }),
      (err) => err.code === "evidence_hash_mismatch"
    );

    // -------------------------------------------------------------
    // Test 9: Unicode / Cyrillic paging and surrogate pair handling
    // -------------------------------------------------------------
    console.log("Test 9: Unicode / Cyrillic paging and surrogate preservation");
    const unicodeText = "Префиксы монтажа: сцена 1 — крупный план 🎬, исполнитель 𠮷野. Конец фрагмента.";
    // Safe char slicing should not split surrogate pair
    const slice1 = planRunResponse.safeCharSlice(unicodeText, 0, 45);
    const slice2 = planRunResponse.safeCharSlice(unicodeText, 45, 100);
    assert.equal(slice1 + slice2, unicodeText);

    // Multi-page retrieval
    const pagedRunId = makeUuid();
    const longCyrillicText = "Монтажный план: кадры, переходы, титры и цветокоррекция. ".repeat(200);
    const pagedRecord = {
      schema: "ae-agent-plan-run-record.v1",
      runId: pagedRunId,
      createdAt: "2026-10-02T16:20:00.000Z",
      plan: { summary: longCyrillicText, steps: [] },
      project: { file: "C:/Projects/Montage.aep" },
      run: { id: pagedRunId, steps: [] }
    };
    planRunRecords.writeRecord(tmpDir, pagedRecord);

    const fullDoc = JSON.stringify(pagedRecord);
    const pageSize = 1500;
    let accumulated = "";
    let curOffset = 0;
    let pageCount = 0;

    while (curOffset !== null) {
      pageCount++;
      const page = planRunResponse.getPlanRunEvidence(tmpDir, {
        runId: pagedRunId,
        offset: curOffset,
        limitChars: pageSize
      });
      accumulated += page.text;
      curOffset = page.nextOffset;
      assert(pageCount <= 20, "Paging safety counter");
    }

    assert.equal(accumulated, fullDoc, "Concatenated paged chunks must perfectly match original document");
    assert(pageCount > 1, "Should have required multiple pages");

    console.log(`Paging passed: ${pageCount} pages reassembled perfectly (${accumulated.length} chars)`);

    console.log("Test 10: Strict numeric args, unknown timestamps, binding and Unicode boundaries");
    for (const [key, code] of [["stepIndex","step_index_invalid"],["offset","offset_invalid"],["limitChars","limit_chars_invalid"]]) {
      for (const invalid of [true, false, null, "1", {}, NaN, Infinity]) {
        assert.throws(() => planRunResponse.getPlanRunEvidence(tmpDir, {runId: stepRunId, [key]: invalid}), e => e.code === code);
      }
    }
    const changedRun = {...fullCanonicalRecord,run:{...fullCanonicalRecord.run,id:makeUuid()}};
    planRunRecords.writeRecord(tmpDir,changedRun);
    assert.throws(() => planRunResponse.getPlanRunEvidence(tmpDir,{runId:recordRunId}),e=>e.code==="record_integrity_failed");
    for (const key of ["actionId","projectId","proposalRevision","projectRevision","tool"]) {
      const native = JSON.parse(step1ArtifactContent);
      native[key] = key === "proposalRevision" ? 5 : "mismatched";
      const changed = JSON.stringify(native);
      fs.writeFileSync(path.join(stepArtifactDir,"1.json"),changed,"utf8");
      const canonical = JSON.parse(JSON.stringify(stepCanonicalRecord));
      canonical.run.steps[0].evidenceArtifact.sha256 = sha256(changed);
      planRunRecords.writeRecord(tmpDir,canonical);
      assert.throws(() => planRunResponse.getPlanRunEvidence(tmpDir,{runId:stepRunId,stepIndex:1}),e=>e.code==="step_evidence_binding_mismatch");
    }
    const badArtifactId = JSON.parse(JSON.stringify(stepCanonicalRecord));
    badArtifactId.run.steps[0].evidenceArtifact.artifactId = "self-invented";
    planRunRecords.writeRecord(tmpDir,badArtifactId);
    assert.throws(() => planRunResponse.getPlanRunEvidence(tmpDir,{runId:stepRunId,stepIndex:1}),e=>e.code==="step_evidence_binding_mismatch");
    const ownedRoot = path.join(tmpDir,"owned"), foreignRoot = path.join(tmpDir,"foreign");
    fs.mkdirSync(ownedRoot); fs.mkdirSync(foreignRoot);
    const linkId = makeUuid();
    const linkRecord = {schema:"ae-agent-plan-run-record.v1",runId:linkId,plan:{steps:[]},run:{id:linkId,steps:[]}};
    planRunRecords.writeRecord(foreignRoot,linkRecord);
    fs.mkdirSync(path.join(ownedRoot,"evidence"));
    const linkPath = path.join(ownedRoot,"evidence","plan-runs");
    fs.symlinkSync(path.join(foreignRoot,"evidence","plan-runs"),linkPath,process.platform === "win32" ? "junction" : "dir");
    try {
      assert.throws(() => planRunResponse.getPlanRunEvidence(ownedRoot,{runId:linkId}),e=>e.code==="path_containment_violation");
      assert.throws(() => planRunRecords.writeRecord(ownedRoot,linkRecord),e=>e.code==="path_containment_violation");
    } finally {fs.unlinkSync(linkPath);}
    // A linked verification parent/run directory must also stay inside the trusted log root.
    planRunRecords.writeRecord(ownedRoot,stepCanonicalRecord);
    fs.mkdirSync(path.join(ownedRoot,"verification-evidence"));
    const foreignSteps = path.join(foreignRoot,"verification-evidence",stepRunId);
    fs.mkdirSync(foreignSteps,{recursive:true});
    fs.writeFileSync(path.join(foreignSteps,"1.json"),step1ArtifactContent,"utf8");
    const stepLinkPath = path.join(ownedRoot,"verification-evidence",stepRunId);
    fs.symlinkSync(foreignSteps,stepLinkPath,process.platform === "win32" ? "junction" : "dir");
    try {
      assert.throws(() => planRunResponse.getPlanRunEvidence(ownedRoot,{runId:stepRunId,stepIndex:1}),e=>e.code==="path_containment_violation");
    } finally {fs.unlinkSync(stepLinkPath);}
    const noTimeId = makeUuid();
    const noTime = {schema:"ae-agent-plan-run-record.v1", runId:noTimeId, plan:{steps:[]}, run:{id:noTimeId, steps:[]}};
    planRunRecords.writeRecord(tmpDir, noTime);
    assert.equal(planRunResponse.getPlanRunEvidence(tmpDir, {runId:noTimeId}).observedAt, null);
    const emojiRecord = {...noTime, plan:{summary:"😀😀😀😀", steps:[]}};
    planRunRecords.writeRecord(tmpDir, emojiRecord);
    const emojiDoc = JSON.stringify(emojiRecord);
    const middle = emojiDoc.indexOf("😀") + 1;
    assert.throws(() => planRunResponse.getPlanRunEvidence(tmpDir, {runId:noTimeId, offset:middle}), e => e.code === "offset_surrogate_boundary_invalid");
    let emojiOffset = 0, emojiAccumulated = "";
    while (emojiOffset !== null) {
      const page = planRunResponse.getPlanRunEvidence(tmpDir, {runId:noTimeId, offset:emojiOffset, limitChars:1});
      emojiAccumulated += page.text;
      assert.equal(page.nextOffset, emojiOffset + page.text.length < page.totalChars ? emojiOffset + page.text.length : null);
      emojiOffset = page.nextOffset;
    }
    assert.equal(emojiAccumulated, emojiDoc);
    assert.equal(sha256(emojiAccumulated), planRunResponse.getPlanRunEvidence(tmpDir, {runId:noTimeId}).sha256);
    const semantic = planRunResponse.compactSemanticVerification({status:"needs_review", passedChecks:7, failedChecks:1, needsReviewChecks:2, unverifiedMutationCount:3,
      checks:[{id:"check-1",title:"Actual title",status:"needs_review",evidence:"Actual reason"}]});
    assert.equal(semantic.passedChecks,7); assert.equal(semantic.failedChecks,1); assert.equal(semantic.needsReviewChecks,2);
    assert.equal(semantic.unverifiedMutationCount,3); assert.equal(semantic.failureExcerpt[0].id,"check-1");
    assert.equal(semantic.failureExcerpt[0].title,"Actual title"); assert.equal(semantic.failureExcerpt[0].reason,"Actual reason");
    const warningSummary = planRunResponse.projectPlanRunSummary({id:makeUuid(),recordWarning:"run_record_update_failed",steps:[{recordWarning:"step_record_update_failed",status:"unknown",result:{}}]});
    assert.equal(warningSummary.recordWarning,"run_record_update_failed");
    assert.equal(warningSummary.steps[0].recordWarning,"step_record_update_failed"); assert.equal(warningSummary.steps[0].resultRef.ok,null);

    console.log("ALL SMOKE TESTS COMPLETED SUCCESSFULLY.");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(handlerRuntime, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error("SMOKE TEST FAILED:", err);
  process.exit(1);
});
