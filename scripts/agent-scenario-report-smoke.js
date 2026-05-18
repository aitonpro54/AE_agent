"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  REPORT_SCHEMA_VERSION,
  writeAgentRunReport
} = require("./agent-scenario-report");

function fixtureReport() {
  return {
    ok: true,
    page: { title: "AE Agent 1.0.6", url: "devtools://fixture" },
    runPrefix: "Codex QA 1.2 12345678",
    planner: {
      label: "openai-cli-gpt-5.5",
      agent: "openai-cli",
      model: "gpt-5.5",
      providerGroup: "openai",
      authMode: "cli",
      requirePanelPlans: true
    },
    preflight: {
      health: { version: "1.0.6", panelConnected: true, pending: 0, inflight: 0 },
      readiness: {
        status: "ready",
        canChat: true,
        modelAvailable: true,
        modelSource: "remote",
        modelCount: 6
      },
      activeComp: { itemIndex: 7, name: "Fixture", selectedLayerCount: 0 },
      renderQueueTotal: 0
    },
    plannerAcceptance: {
      panelPlanCount: 1,
      fallbackCount: 1,
      scenarioCount: 2
    },
    scenarios: [
      {
        id: "timeline-layer-timing",
        cleanupPrefix: "Codex QA 1.2 12345678 Timeline",
        executionMode: "panel-agent-plan",
        panelPlan: {
          accepted: true,
          validationLine: "Validation: ok, 9 steps, 8 mutating",
          expectedStepCount: 9,
          expectedMutatingCount: 8,
          expectedTools: ["create_test_comp", "find_project_items"],
          checks: { reviewReady: true, validationLine: true }
        },
        dryRun: { transcriptTail: "Dry run: ok" },
        run: {
          transcriptTail: "Run: ok",
          logTail: "protected",
          semanticVerification: {
            schema: "ae-agent-semantic-verification.v1",
            status: "passed",
            ok: true,
            summary: "Fixture semantic verification passed.",
            readBackCount: 1,
            mutationVerificationCount: 2,
            passedChecks: 3,
            failedChecks: 0,
            checks: [
              { id: "fixture", status: "passed", title: "Fixture check", expected: "expected", observed: "observed", evidence: "read-back" }
            ],
            warnings: []
          }
        }
      },
      {
        id: "render-queue-setup",
        cleanupPrefix: "Codex QA 1.2 12345678 Render",
        executionMode: "deterministic-plan-fallback",
        fallbackReason: "Fixture fallback",
        panelPlan: {
          accepted: false,
          validationLine: "Validation: ok, 4 steps, 3 mutating",
          expectedStepCount: 4,
          expectedMutatingCount: 3,
          expectedTools: ["create_test_comp", "get_render_queue_status"],
          checks: { reviewReady: false, validationLine: true }
        },
        dryRun: { ok: true, dryRun: true, statuses: [{ status: "ready" }] },
        run: { ok: true, dryRun: false, safety: { protection: "auto_edit_session" }, statuses: [{ status: "completed" }] }
      }
    ],
    cleanups: [
      {
        id: "timeline-layer-timing",
        cleanupPrefix: "Codex QA 1.2 12345678 Timeline",
        renderQueueRemovedCount: 0,
        removedCount: 3,
        renderQueueTotal: 0
      },
      {
        id: "render-queue-setup",
        cleanupPrefix: "Codex QA 1.2 12345678 Render",
        renderQueueRemovedCount: 1,
        removedCount: 1,
        renderQueueTotal: 0
      }
    ],
    finalCleanup: {
      renderQueueRemovedCount: 0,
      removedCount: 0,
      renderQueueTotal: 0
    }
  };
}

function main() {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "ae-agent-run-report-"));
  const artifact = writeAgentRunReport(fixtureReport(), {
    outputDir,
    generatedAt: "2026-05-15T00:00:00.000Z",
    source: "agent-scenario-report-smoke"
  });
  const onDisk = JSON.parse(fs.readFileSync(artifact.path, "utf8"));

  assert.deepStrictEqual(onDisk, artifact.report);
  assert.strictEqual(onDisk.schemaVersion, REPORT_SCHEMA_VERSION);
  assert.strictEqual(onDisk.planner.agent, "openai-cli");
  assert.strictEqual(onDisk.planner.model, "gpt-5.5");
  assert.strictEqual(onDisk.planner.providerGroup, "openai");
  assert.strictEqual(onDisk.planner.authMode, "cli");
  assert.strictEqual(onDisk.planSources.panelAgentPlan, 1);
  assert.strictEqual(onDisk.planSources.deterministicPlanFallback, 1);
  assert.strictEqual(onDisk.acceptance.scenarioCount, 2);
  assert.strictEqual(onDisk.acceptance.acceptedCount, 1);
  assert.strictEqual(onDisk.acceptance.rejectedCount, 1);
  assert.strictEqual(onDisk.semanticVerification.reportedCount, 1);
  assert.strictEqual(onDisk.semanticVerification.passedCount, 1);
  assert.strictEqual(onDisk.semanticVerification.needsReviewCount, 0);
  assert.strictEqual(onDisk.scenarios[0].planSource, "panel-agent-plan");
  assert.strictEqual(onDisk.scenarios[0].run.semanticVerification.status, "passed");
  assert.strictEqual(onDisk.scenarios[0].run.semanticVerification.checks.length, 1);
  assert.strictEqual(onDisk.scenarios[1].planSource, "deterministic-plan-fallback");
  assert.strictEqual(onDisk.cleanup.projectItemsRemovedTotal, 4);
  assert.strictEqual(onDisk.cleanup.renderQueueItemsRemovedTotal, 1);
  assert.strictEqual(onDisk.cleanup.final.renderQueueTotal, 0);
  assert.strictEqual(onDisk.finalRenderQueueStatus.baselineTotal, 0);
  assert.strictEqual(onDisk.finalRenderQueueStatus.totalItems, 0);
  assert.strictEqual(onDisk.finalRenderQueueStatus.returnedToBaseline, true);
  assert.strictEqual(JSON.stringify(onDisk).indexOf("transcriptTail"), -1);
  assert.strictEqual(JSON.stringify(onDisk).indexOf("logTail"), -1);

  console.log(JSON.stringify({
    ok: true,
    schemaVersion: onDisk.schemaVersion,
    reportPath: artifact.path,
    scenarioCount: onDisk.acceptance.scenarioCount,
    acceptedCount: onDisk.acceptance.acceptedCount,
    fallbackCount: onDisk.acceptance.fallbackCount,
    finalRenderQueueTotal: onDisk.finalRenderQueueStatus.totalItems
  }, null, 2));
}

main();
