"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  CANDIDATE_SCHEMA_VERSION,
  writeSolutionCandidateReport
} = require("./solution-candidate-report");

function fixtureCandidate() {
  return {
    title: "Align generated lower thirds",
    tags: ["text", "layout", "extendscript-candidate"],
    intent: {
      summary: "Align generated lower-third text layers after a live Agent experiment.",
      appliesWhen: [
        "A generated test composition contains lower-third text layers.",
        "The user wants the text aligned without changing source footage."
      ]
    },
    generatedPlan: {
      summary: "Read active comp, align selected generated text layers, and read back positions.",
      steps: [
        {
          tool: "get_active_comp",
          mutating: false,
          targetSummary: "Active generated QA comp",
          status: "completed"
        },
        {
          tool: "run_extendscript_file",
          mutating: true,
          targetSummary: "Generated text layers only",
          status: "completed",
          safety: {
            planValidation: true,
            explicitConfirmation: true,
            allowMutations: true,
            postMutationReadBack: true
          }
        }
      ]
    },
    generatedScript: {
      language: "extendscript",
      summary: "Candidate script captured for review.",
      body: "var apiKey = 'sk-fixturefixturefixturefixturefixture';\nvar projectPath = 'C:\\Users\\Ant\\Documents\\Client\\shot.aep';\napp.beginUndoGroup('Align lower thirds');\napp.endUndoGroup();"
    },
    affectedTargets: [
      "Comp: Codex QA 1.2 fixture",
      "Layer range only, not a full project scan."
    ],
    runResult: {
      ok: true,
      dryRun: false,
      mutating: true,
      safety: { protection: "auto_edit_session" },
      checkpoint: { mode: "edit-session" },
      statuses: [{ status: "completed" }],
      transcriptTail: "This raw transcript tail must not be persisted.",
      logTail: "This raw log tail must not be persisted.",
      outputSummary: "Text layers were aligned."
    },
    verificationReadBack: {
      summary: "Read selected text layer positions after mutation.",
      evidence: [
        "Each generated text layer reported expected x position.",
        "No render queue items were created."
      ]
    },
    projectAssumptions: [
      "Only generated test layers were selected.",
      "Do not save absolute path C:\\Users\\Ant\\Documents\\Client\\shot.aep."
    ],
    warnings: ["Raw ExtendScript should become a typed bridge tool if repeated."],
    suggestedPromotionAction: {
      action: "promote-to-recipe",
      rationale: "Candidate has read-back evidence but still needs review and typed-tool comparison.",
      nextReviewChecks: [
        "Check whether existing text/layout typed tools cover the workflow.",
        "Keep promotion file-based and require undo group if raw JSX remains necessary."
      ]
    },
    agentRunReport: {
      schemaVersion: "agent-run-report.v1",
      run: { runPrefix: "Codex QA 1.2 12345678" },
      planner: {
        label: "openai-cli-gpt-5.5",
        agent: "openai-cli",
        model: "gpt-5.5",
        providerGroup: "openai",
        authMode: "cli"
      }
    },
    scenarioId: "text-shape-layout-animation",
    rawTranscript: "This full transcript must never land in the candidate report.",
    fullProjectScan: [{ name: "Do not store broad project scan" }],
    apiKey: "sk-fixturefixturefixturefixturefixture"
  };
}

function main() {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "ae-solution-candidate-"));
  const artifact = writeSolutionCandidateReport(fixtureCandidate(), {
    outputDir,
    generatedAt: "2026-05-15T00:00:00.000Z",
    source: "solution-candidate-report-smoke"
  });
  const onDisk = JSON.parse(fs.readFileSync(artifact.path, "utf8"));
  const text = JSON.stringify(onDisk);

  assert.deepStrictEqual(onDisk, artifact.report);
  assert.strictEqual(onDisk.schemaVersion, CANDIDATE_SCHEMA_VERSION);
  assert.strictEqual(onDisk.source, "solution-candidate-report-smoke");
  assert.strictEqual(onDisk.status, "candidate");
  assert.strictEqual(onDisk.safety.quarantineOnly, true);
  assert.strictEqual(onDisk.safety.plannerVisible, false);
  assert.strictEqual(onDisk.safety.promotionRequired, true);
  assert.strictEqual(onDisk.safety.rawTranscriptStored, false);
  assert.strictEqual(onDisk.safety.fullProjectScanStored, false);
  assert.strictEqual(onDisk.candidate.generatedPlan.stepCount, 2);
  assert.strictEqual(onDisk.candidate.generatedPlan.mutatingStepCount, 1);
  assert.strictEqual(onDisk.candidate.generatedScript.included, true);
  assert.strictEqual(onDisk.candidate.runResult.ok, true);
  assert.strictEqual(onDisk.candidate.runResult.statusCount, 1);
  assert.strictEqual(onDisk.candidate.verificationReadBack.evidence.length, 2);
  assert.strictEqual(onDisk.candidate.suggestedPromotionAction.action, "promote-to-recipe");
  assert.strictEqual(onDisk.candidate.provenance.source, "solution-candidate-report-smoke");
  assert.strictEqual(onDisk.candidate.provenance.sourceReportSchema, "agent-run-report.v1");
  assert.strictEqual(onDisk.candidate.provenance.planner.agent, "openai-cli");
  assert(onDisk.candidate.warnings.some((warning) => warning.indexOf("OpenAI-style API key") >= 0));
  assert(onDisk.candidate.warnings.some((warning) => warning.indexOf("Windows drive path") >= 0));
  assert(onDisk.candidate.warnings.some((warning) => warning.indexOf("rawTranscript") >= 0));
  assert(onDisk.candidate.warnings.some((warning) => warning.indexOf("fullProjectScan") >= 0));
  assert(onDisk.safety.redactions.length >= 2);
  assert.strictEqual(text.indexOf("sk-fixture"), -1);
  assert.strictEqual(text.indexOf("C:\\Users\\Ant"), -1);
  assert.strictEqual(text.indexOf("raw transcript tail"), -1);
  assert.strictEqual(text.indexOf("raw log tail"), -1);
  assert.strictEqual(text.indexOf("full transcript"), -1);
  assert.strictEqual(text.indexOf("broad project scan"), -1);

  console.log(JSON.stringify({
    ok: true,
    schemaVersion: onDisk.schemaVersion,
    reportPath: artifact.path,
    candidateId: onDisk.candidate.id,
    stepCount: onDisk.candidate.generatedPlan.stepCount,
    redactionCount: onDisk.safety.redactions.length,
    warningCount: onDisk.candidate.warnings.length
  }, null, 2));
}

main();
