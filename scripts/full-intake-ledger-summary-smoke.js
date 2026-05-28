"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repo = path.resolve(__dirname, "..");
const runner = path.join(repo, "orchestrator", "full-intake-ledger-summary.mjs");

function run(args, cwd = repo) {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function assertNoLargeEvidence(rawOutput, output) {
  const text = rawOutput || JSON.stringify(output);
  for (const forbidden of [
    '"stdout"',
    '"stderr"',
    '"transcript"',
    '"prompt"',
    '"importer"',
    '"result"',
    '"batchReport"',
    '"state"',
    "batch-report.json",
    "PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP"
  ]) {
    assert(!text.includes(forbidden), `ledger summary leaked forbidden content: ${forbidden}`);
  }
}

function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "full-intake-ledger-summary-"));
  try {
    const target = path.join(root, "target");
    const ledgerPath = path.join(target, ".codex-runtime", "sdk", "generic-repo-importer", "fixture", "queue-ledger.json");
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
    fs.writeFileSync(
      ledgerPath,
      `${JSON.stringify(
        {
          schema: "generic-repo-importer.fixture-ledger.v1",
          target: { repoPath: target },
          entries: [
            {
              id: "tool-compositions-change-nested-composition-work-area",
              sourcePath: "Compositions/Change_Nested_Composition_Work_Area.jsx",
              status: "queued",
              classification: "live_lane_needed",
              prompt: "P".repeat(4096),
              transcript: "P".repeat(4096)
            },
            {
              id: "tool-keyframes-apply-ease",
              sourcePath: "Keyframes/Apply_Ease.jsx",
              status: "queued",
              classification: "live_lane_needed"
            },
            {
              id: "tool-properties-set-new-color",
              sourcePath: "Properties/Set_New_Color.jsx",
              status: "completed",
              classification: "existing_typed_tools_recipe_only"
            },
            {
              id: "tool-layers-child-timeout",
              sourcePath: "Layers/Child_Timeout.jsx",
              status: "failed_import",
              classification: "existing_typed_tools_recipe_only",
              failClosed: {
                status: "failed_import",
                reason: "implementation-child-run-timeout"
              },
              batchReport: ".codex-runtime/sdk/generic-repo-full-intake/fixture/queue-supervisor/batch/batch-report.json",
              stdout: "P".repeat(4096),
              stderr: "P".repeat(4096)
            }
          ]
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const jsonResult = run(["--ledger", ledgerPath, "--target-repo", target, "--compact-json"]);
    assert.strictEqual(jsonResult.status, 0, jsonResult.stderr || jsonResult.stdout);
    const output = JSON.parse(jsonResult.stdout);
    assert.strictEqual(output.schema, "generic-repo-full-intake.ledger-summary.v1");
    assert.strictEqual(output.counts.entries, 4);
    assert.strictEqual(output.queuedLiveLaneNeeded.count, 2);
    assert.deepStrictEqual(output.queuedLiveLaneNeeded.candidateIds.ids.sort(), [
      "tool-compositions-change-nested-composition-work-area",
      "tool-keyframes-apply-ease"
    ]);
    assert.strictEqual(output.failed.count, 1);
    assert.deepStrictEqual(output.failed.items.map((item) => item.id), ["tool-layers-child-timeout"]);
    assertNoLargeEvidence(jsonResult.stdout, output);

    const compactResult = run(["--ledger", ledgerPath, "--target-repo", target, "--compact"]);
    assert.strictEqual(compactResult.status, 0, compactResult.stderr || compactResult.stdout);
    assert(compactResult.stdout.includes("Queued live_lane_needed: 2"));
    assertNoLargeEvidence(compactResult.stdout, null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log(JSON.stringify({ ok: true, smoke: "full-intake-ledger-summary" }, null, 2));
}

main();
