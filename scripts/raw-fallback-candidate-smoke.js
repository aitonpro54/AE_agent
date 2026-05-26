"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  buildRawExtendscriptFallbackCandidateInput,
  rawExtendscriptStepCount
} = require("../mcp-server/raw-fallback-candidate");
const {
  writeSolutionCandidateReport
} = require("./solution-candidate-report");

const plan = {
  summary: "Create a generated matte layout with a raw fallback.",
  risk: "medium",
  requiresCheckpoint: true,
  steps: [
    {
      title: "Inspect the active comp",
      tool: "get_active_comp",
      args: {}
    },
    {
      title: "Create the matte with a narrow raw fallback",
      tool: "run_extendscript",
      args: {
        script: [
          "var secret = 'sk-smoke-smoke-smoke-smoke-smoke';",
          "var projectPath = 'C:\\Users\\Ant\\Documents\\Client\\shot.aep';",
          "app.beginUndoGroup('AE Agent generated matte');",
          "app.endUndoGroup();",
          "return { ok: true, name: 'AE Agent generated matte' };"
        ].join("\n")
      }
    },
    {
      title: "Read back the generated comp",
      tool: "get_comp_details",
      args: {
        compItemIndex: "{{compItemIndex}}"
      }
    }
  ]
};

const validation = {
  ok: true,
  stepCount: 3,
  mutatingCount: 1,
  classification: {
    category: "risky",
    blocksRun: true,
    rawExtendscriptStepCount: 1
  },
  steps: [
    {
      index: 1,
      title: "Inspect the active comp",
      tool: "get_active_comp",
      executable: true,
      mutatesProject: false,
      targetSummary: "active comp",
      safeArgs: {}
    },
    {
      index: 2,
      title: "Create the matte with a narrow raw fallback",
      tool: "run_extendscript",
      executable: true,
      mutatesProject: true,
      targetSummary: "generated matte layer",
      safeArgs: {
        verifyAfter: true,
        idempotencyKey: "raw-fallback-smoke"
      }
    },
    {
      index: 3,
      title: "Read back the generated comp",
      tool: "get_comp_details",
      executable: true,
      mutatesProject: false,
      targetSummary: "generated matte comp",
      safeArgs: {}
    }
  ]
};

const run = {
  id: "raw-fallback-smoke-run",
  ok: true,
  dryRun: false,
  safety: {
    rawExtendscriptGate: {
      status: "approved",
      dryRunId: "raw-fallback-smoke-dry-run"
    },
    protection: "auto_edit_session"
  },
  validation,
  steps: [
    { index: 1, tool: "get_active_comp", status: "completed", targetSummary: "active comp" },
    { index: 2, tool: "run_extendscript", status: "completed", targetSummary: "generated matte layer" },
    {
      index: 3,
      tool: "get_comp_details",
      status: "completed",
      targetSummary: "generated matte comp",
      result: {
        verification: {
          ok: true
        }
      }
    }
  ],
  semanticVerification: {
    status: "passed",
    summary: "Generated matte read-back matched the requested workflow.",
    checks: [
      { id: "matte-readback", title: "Generated matte read-back", status: "passed" }
    ]
  }
};

const candidate = buildRawExtendscriptFallbackCandidateInput({
  source: "raw-fallback-candidate-smoke",
  requestId: "raw-fallback-smoke",
  userPrompt: "Сделай матт для выделенного слоя, если обычных действий не хватает.",
  planner: {
    agentId: "openai-cli",
    model: "gpt-5.5",
    agentMode: "agent"
  },
  plan,
  validation,
  run
});

assert.strictEqual(rawExtendscriptStepCount(plan, validation, run), 1);
assert.strictEqual(candidate.suggestedPromotionAction.action, "promote-to-typed-tool-candidate");
assert.strictEqual(candidate.generatedPlan.stepCount, 3);
assert.strictEqual(candidate.generatedPlan.mutatingStepCount, 1);
assert.strictEqual(candidate.generatedScript.language, "extendscript");
assert(candidate.generatedScript.body.indexOf("app.beginUndoGroup") >= 0, "Expected raw fallback body to be captured before report redaction.");

const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "ae-raw-fallback-candidate-"));
const artifact = writeSolutionCandidateReport(candidate, {
  outputDir,
  source: "raw-fallback-candidate-smoke",
  generatedAt: "2026-05-26T00:00:00.000Z"
});
const onDisk = JSON.parse(fs.readFileSync(artifact.path, "utf8"));
const text = JSON.stringify(onDisk);

assert.strictEqual(onDisk.status, "candidate");
assert.strictEqual(onDisk.safety.quarantineOnly, true);
assert.strictEqual(onDisk.safety.plannerVisible, false);
assert.strictEqual(onDisk.safety.promotionRequired, true);
assert.strictEqual(onDisk.candidate.suggestedPromotionAction.action, "promote-to-typed-tool-candidate");
assert.strictEqual(onDisk.candidate.generatedPlan.stepCount, 3);
assert.strictEqual(onDisk.candidate.generatedPlan.mutatingStepCount, 1);
assert.strictEqual(onDisk.candidate.generatedScript.included, true);
assert.strictEqual(onDisk.candidate.runResult.ok, true);
assert.strictEqual(onDisk.candidate.verificationReadBack.status, "passed");
assert(onDisk.candidate.warnings.some((warning) => warning.indexOf("OpenAI-style API key") >= 0), "Expected API key redaction warning.");
assert(onDisk.candidate.warnings.some((warning) => warning.indexOf("Windows drive path") >= 0), "Expected absolute path redaction warning.");
assert.strictEqual(text.indexOf("sk-smoke"), -1);
assert.strictEqual(text.indexOf("C:\\Users\\Ant"), -1);

console.log(JSON.stringify({
  ok: true,
  candidateId: onDisk.candidate.id,
  suggestedAction: onDisk.candidate.suggestedPromotionAction.action,
  reportPath: artifact.path,
  warningCount: onDisk.candidate.warnings.length
}, null, 2));
