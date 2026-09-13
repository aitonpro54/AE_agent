"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { writeSolutionCandidateReport } = require("./solution-candidate-report");
const {
  getSolutionCandidate,
  listSolutionCandidates,
  solutionCandidateQueueTools
} = require("../mcp-server/solution-candidate-queue");

function fixture(title, body) {
  return {
    title,
    tags: ["raw-extendscript-fallback", "typed-tool-candidate"],
    intent: { summary: `Review ${title}.`, appliesWhen: ["The exact JSX workflow repeats."] },
    affectedTargets: ["One inspected generated layer."],
    projectAssumptions: ["The candidate remains in local quarantine."],
    generatedPlan: {
      summary: "Run one guarded raw fallback.",
      steps: [{ tool: "run_extendscript_file", mutating: true, targetSummary: "One generated layer", status: "completed" }]
    },
    generatedScript: { language: "extendscript", summary: "Smoke candidate JSX.", body },
    runResult: { ok: true, dryRun: false, mutating: true, outputSummary: "Completed." },
    verificationReadBack: { summary: "Read back the target.", status: "passed", evidence: ["Target matched."] },
    suggestedPromotionAction: { action: "keep-in-quarantine", rationale: "Requires explicit review." }
  };
}

function diskSnapshot(directory) {
  const snapshot = {};
  fs.readdirSync(directory).sort().forEach((name) => {
    const filePath = path.join(directory, name);
    const stat = fs.statSync(filePath);
    snapshot[name] = { bytes: fs.readFileSync(filePath).toString("base64"), mtimeMs: stat.mtimeMs, size: stat.size };
  });
  return snapshot;
}

function rejects(fn, pattern) {
  assert.throws(fn, pattern);
}

function main() {
  const candidateDir = fs.mkdtempSync(path.join(os.tmpdir(), "ae-candidate-queue-"));
  const sharedBody = "app.beginUndoGroup('Exact repeat');\nvar layer = 1;\napp.endUndoGroup();";
  const first = writeSolutionCandidateReport(fixture("First exact candidate", sharedBody), {
    outputDir: candidateDir,
    generatedAt: "2026-09-10T10:00:00.000Z",
    source: "candidate-queue-smoke"
  });
  const second = writeSolutionCandidateReport(fixture("Second exact candidate", sharedBody), {
    outputDir: candidateDir,
    generatedAt: "2026-09-11T10:00:00.000Z",
    source: "candidate-queue-smoke"
  });
  writeSolutionCandidateReport(fixture("Different candidate", `${sharedBody}\n// distinct`), {
    outputDir: candidateDir,
    generatedAt: "2026-09-12T10:00:00.000Z",
    source: "candidate-queue-smoke"
  });
  fs.writeFileSync(path.join(candidateDir, "malformed.json"), "{ definitely not JSON", "utf8");

  const before = diskSnapshot(candidateDir);
  const options = { candidateDir };
  const descriptors = new Map(solutionCandidateQueueTools.map((tool) => [tool.name, tool]));
  assert(descriptors.has("list_solution_candidates"));
  assert(descriptors.has("get_solution_candidate"));
  assert.strictEqual(descriptors.get("get_solution_candidate").inputSchema.required[0], "candidateRef");

  const listed = listSolutionCandidates({ limit: 2, groupLimit: 10 }, options);
  assert.strictEqual(listed.ok, true);
  assert.strictEqual(listed.total, 3);
  assert.strictEqual(listed.skipped, 1);
  assert.strictEqual(listed.candidates.length, 2);
  assert.strictEqual(listed.latest.generatedAt, "2026-09-12T10:00:00.000Z");
  assert.strictEqual(listed.page.nextOffset, 2);
  assert.strictEqual(listed.exactFingerprintGroupTotal, 1);
  assert.strictEqual(listed.exactFingerprintGroups[0].repeatCount, 2);
  assert.deepStrictEqual(listed.exactFingerprintGroups[0].candidateRefs, [path.basename(second.path), path.basename(first.path)]);
  assert(!JSON.stringify(listed).includes("beginUndoGroup"), "List response must not include JSX bodies.");
  const repeated = listSolutionCandidates({ limit: 3 }, options).candidates.filter((item) => item.repeatCount === 2);
  assert.strictEqual(repeated.length, 2);
  assert.strictEqual(repeated[0].exactFingerprint, repeated[1].exactFingerprint);

  const firstRef = path.basename(first.path);
  const pageOne = getSolutionCandidate({ candidateRef: firstRef, offset: 0, limit: 18 }, options);
  assert.strictEqual(pageOne.generatedScript.body, sharedBody.slice(0, 18));
  assert.strictEqual(pageOne.generatedScript.totalChars, sharedBody.length);
  assert.strictEqual(pageOne.generatedScript.nextOffset, 18);
  assert.strictEqual(pageOne.generatedScript.truncated, true);
  assert.strictEqual(pageOne.repeatCount, 2);
  assert.strictEqual(pageOne.report.candidate.generatedScript.body, undefined);
  assert.strictEqual(pageOne.report.safety.quarantineOnly, true);
  assert.strictEqual(pageOne.report.safety.plannerVisible, false);
  assert.strictEqual(JSON.stringify(pageOne).includes(candidateDir), false, "Response must not expose the configured absolute directory.");

  const pageTwo = getSolutionCandidate({ candidateRef: firstRef, offset: 18, limit: 6000 }, options);
  assert.strictEqual(pageOne.generatedScript.body + pageTwo.generatedScript.body, sharedBody);
  assert.strictEqual(pageTwo.generatedScript.nextOffset, null);
  assert.strictEqual(pageTwo.generatedScript.truncated, false);

  rejects(() => getSolutionCandidate({ candidateRef: "../outside.json" }, options), /not a file path/);
  rejects(() => getSolutionCandidate({ candidateRef: "C:\\outside.json" }, options), /not a file path/);
  rejects(() => getSolutionCandidate({ candidateRef: "malformed.json" }, options), /not found/);
  rejects(() => listSolutionCandidates({ limit: 51 }, options), /limit must be an integer/);
  rejects(() => getSolutionCandidate({ candidateRef: firstRef, limit: 6001 }, options), /limit must be an integer/);

  const after = diskSnapshot(candidateDir);
  assert.deepStrictEqual(after, before, "Queue reads must not mutate candidate quarantine files.");

  console.log(JSON.stringify({
    ok: true,
    total: listed.total,
    skipped: listed.skipped,
    repeatCount: listed.exactFingerprintGroups[0].repeatCount,
    paginatedChars: pageOne.generatedScript.body.length + pageTwo.generatedScript.body.length,
    filesUnchanged: true
  }, null, 2));
}

main();
