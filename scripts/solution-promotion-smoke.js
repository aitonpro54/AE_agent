"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  writeSolutionCandidateReport
} = require("./solution-candidate-report");
const {
  PROMOTION_REVIEW_SCHEMA,
  promoteCandidate
} = require("./solution-promotion-helper");
const { PLANNER_USE } = require("./solution-registry-smoke");

const REPO_ROOT = path.join(__dirname, "..");
const TEMP_SCRIPT_RELATIVE = "scripts/solutions/.tmp-promotion-smoke-safe.jsx";
const TEMP_SCRIPT_PATH = path.join(REPO_ROOT, ...TEMP_SCRIPT_RELATIVE.split("/"));

function baseRegistry() {
  return {
    schema: "ae-solution-registry.v1",
    solutionSchema: "ae-solution.v1",
    updatedAt: "2026-05-15",
    policy: {
      trackedStatuses: ["recipe", "typed-tool-candidate", "tool"],
      candidateLocation: "logs/solution-candidates/",
      plannerUse: PLANNER_USE,
      executionRule: "Solutions are advisory metadata; execution still uses validated Agent plans."
    },
    solutions: []
  };
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function fixtureCandidate(overrides = {}) {
  return Object.assign({
    title: "Create reviewed smoke title",
    tags: ["text", "shape", "typed-tool"],
    intent: {
      summary: "Create a generated title element and verify it with typed read-back.",
      appliesWhen: ["A generated test composition needs a reusable title recipe."]
    },
    generatedPlan: {
      summary: "Inspect active comp, create a text layer, and read it back.",
      steps: [
        { tool: "get_active_comp", mutating: false, targetSummary: "Active generated comp", status: "completed" },
        { tool: "create_text_layer", mutating: true, targetSummary: "Generated title layer", status: "completed" },
        { tool: "get_selected_layers", mutating: false, targetSummary: "Read back created layer", status: "completed" }
      ]
    },
    runResult: {
      ok: true,
      dryRun: false,
      mutating: true,
      outputSummary: "Generated title layer was created."
    },
    verificationReadBack: {
      summary: "Read generated layer text and position after mutation.",
      evidence: ["Generated title layer exists.", "Layer text matches the requested label."]
    },
    projectAssumptions: ["A generated test comp is active."],
    suggestedPromotionAction: {
      action: "promote-to-recipe",
      rationale: "Fixture has local review evidence."
    }
  }, overrides);
}

function baseReview(overrides = {}) {
  const review = {
    schemaVersion: PROMOTION_REVIEW_SCHEMA,
    explicitReview: true,
    decision: "promote",
    targetStatus: "recipe",
    reviewer: "codex",
    date: "2026-05-15",
    promotionEvidence: "Promotion smoke validated fixture review metadata.",
    execution: {
      mode: "typed-plan",
      mutating: true,
      riskLevel: "medium",
      recipePath: "recipes/README.md",
      scriptPath: null,
      preferredTools: ["get_active_comp", "create_text_layer", "get_selected_layers"]
    },
    inputs: [
      {
        name: "titleText",
        type: "string",
        required: true,
        description: "Generated title text to create."
      }
    ],
    targetAssumptions: ["A generated test composition is active."],
    verificationRecipe: {
      summary: "Read back the generated title layer.",
      steps: ["Run get_selected_layers or get_layer_details after the mutation."],
      expectedEvidence: ["The generated title layer exists with the requested text."]
    },
    testedAeContext: {
      aeVersion: null,
      panelVersion: "AE Agent 1.0.11",
      bridgeVersion: "1.0.11",
      projectKind: "synthetic",
      notes: ["Promotion smoke fixture only."]
    },
    planValidationFixtures: [
      {
        id: "typed-title-recipe",
        plan: {
          summary: "Create a generated title through typed tools.",
          steps: [
            { title: "Inspect active comp", tool: "get_active_comp", args: {} },
            {
              title: "Create generated text",
              tool: "create_text_layer",
              idempotencyKeyTemplate: "promotion-smoke-title",
              args: { text: "Smoke Title", verifyAfter: true }
            },
            { title: "Read back selection", tool: "get_selected_layers", args: {} }
          ]
        },
        expected: { stepCount: 3, mutatingCount: 1, noRawExtendscript: true }
      }
    ],
    notes: ["Repeated stable recipes should become typed bridge tools rather than permanent raw JSX shortcuts."]
  };
  return Object.assign(review, overrides);
}

function writeCandidate(outputDir, rawCandidate) {
  return writeSolutionCandidateReport(rawCandidate, {
    outputDir,
    generatedAt: "2026-05-15T00:00:00.000Z",
    source: "solution-promotion-smoke"
  }).path;
}

function assertRejects(fn, pattern, label) {
  assert.throws(fn, pattern, label);
}

function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ae-solution-promotion-"));
  const registryPath = path.join(tempDir, "solutions.json");
  const reviewPath = path.join(tempDir, "review.json");
  const rawReviewPath = path.join(tempDir, "raw-review.json");
  writeJson(registryPath, baseRegistry());

  const candidatePath = writeCandidate(tempDir, fixtureCandidate());
  writeJson(reviewPath, baseReview());
  const typedResult = promoteCandidate(candidatePath, reviewPath, {
    registryPath,
    write: true,
    now: "2026-05-15T00:00:00.000Z"
  });
  assert.strictEqual(typedResult.wrote, true);
  assert.strictEqual(typedResult.solutionId, "create-reviewed-smoke-title");
  assert.strictEqual(typedResult.executionMode, "typed-plan");
  assert.strictEqual(typedResult.registry.solutions.length, 1);

  writeJson(registryPath, baseRegistry());
  writeJson(reviewPath, baseReview({ explicitReview: false }));
  assertRejects(
    () => promoteCandidate(candidatePath, reviewPath, { registryPath }),
    /explicitReview:true/,
    "promotion must require explicit review"
  );

  writeJson(reviewPath, baseReview({
    execution: {
      mode: "recipe",
      mutating: true,
      riskLevel: "medium",
      recipePath: "recipes/README.md",
      scriptPath: null,
      preferredTools: ["run_extendscript"]
    }
  }));
  assertRejects(
    () => promoteCandidate(candidatePath, reviewPath, { registryPath }),
    /inline run_extendscript/,
    "promotion must reject inline raw ExtendScript"
  );

  try {
    fs.writeFileSync(TEMP_SCRIPT_PATH, [
      "// AE Agent generated-prefix fixture: Codex Promotion Smoke",
      "app.beginUndoGroup('Promotion smoke fixture');",
      "var comp = app.project && app.project.activeItem;",
      "if (comp && comp.layers) {",
      "  var layer = comp.layers.addText('Codex Promotion Smoke');",
      "  layer.comment = 'Generated by AE Agent promotion smoke';",
      "}",
      "app.endUndoGroup();",
      ""
    ].join("\n"), "utf8");

    const rawCandidatePath = writeCandidate(tempDir, fixtureCandidate({
      title: "Reviewed raw smoke script",
      tags: ["extendscript-candidate", "reviewed-jsx"],
      generatedPlan: {
        summary: "Run reviewed file-based ExtendScript and read back generated layer.",
        steps: [
          { tool: "get_active_comp", mutating: false, targetSummary: "Active generated comp", status: "completed" },
          { tool: "run_extendscript_file", mutating: true, targetSummary: "Generated title layer", status: "completed" },
          { tool: "get_selected_layers", mutating: false, targetSummary: "Read back generated layer", status: "completed" }
        ]
      }
    }));
    const rawReview = baseReview({
      id: "reviewed-raw-smoke-script",
      execution: {
        mode: "extendscript-file",
        mutating: true,
        riskLevel: "medium",
        recipePath: "recipes/README.md",
        scriptPath: TEMP_SCRIPT_RELATIVE,
        preferredTools: ["run_extendscript_file"],
        generatedPrefix: "Codex Promotion Smoke"
      },
      typedToolComparison: {
        existingTypedToolFits: false,
        checkedTools: ["create_text_layer", "set_layer_transform"],
        rationale: "Fixture exercises raw promotion gates; production repeats should become a typed bridge tool."
      },
      planValidationFixtures: [
        {
          id: "raw-file-reviewed-plan",
          plan: {
            summary: "Run reviewed file-based JSX.",
            steps: [
              {
                title: "Run reviewed script file",
                tool: "run_extendscript_file",
                idempotencyKeyTemplate: "promotion-smoke-raw",
                args: { filePath: TEMP_SCRIPT_RELATIVE, verifyAfter: true }
              }
            ]
          },
          expected: { stepCount: 1, mutatingCount: 1, noRawExtendscript: false }
        }
      ]
    });

    writeJson(rawReviewPath, rawReview);
    const rawResult = promoteCandidate(rawCandidatePath, rawReviewPath, {
      registryPath,
      write: false,
      now: "2026-05-15T00:00:00.000Z"
    });
    assert.strictEqual(rawResult.executionMode, "extendscript-file");
    assert.strictEqual(rawResult.solution.typedToolComparison.existingTypedToolFits, false);

    writeJson(rawReviewPath, baseReview({
      id: "rejected-raw-typed-tool-fits",
      execution: rawReview.execution,
      typedToolComparison: {
        existingTypedToolFits: true,
        checkedTools: ["create_text_layer"],
        rationale: "A typed tool already fits."
      },
      planValidationFixtures: rawReview.planValidationFixtures
    }));
    assertRejects(
      () => promoteCandidate(rawCandidatePath, rawReviewPath, { registryPath }),
      /existingTypedToolFits:false/,
      "raw promotion must reject workflows covered by existing typed tools"
    );
  } finally {
    if (fs.existsSync(TEMP_SCRIPT_PATH)) {
      fs.unlinkSync(TEMP_SCRIPT_PATH);
    }
  }

  console.log(JSON.stringify({
    ok: true,
    typedPromotion: typedResult.solutionId,
    registryPath,
    rejectedCases: ["missing-explicit-review", "inline-extendscript", "typed-tool-fits-raw"],
    rawPromotionStaticChecks: true
  }, null, 2));
}

main();
