"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { reduceCandidateReview } = require("../mcp-server/solution-candidate-review");
const { listSolutionCandidates } = require("../mcp-server/solution-candidate-queue");
const { writeSolutionCandidateReport } = require("./solution-candidate-report");
const { validatePromotionReview } = require("./solution-promotion-helper");
const { searchSolutions } = require("../mcp-server/solution-discovery");

const registryFile = path.join(__dirname, "../registry/solutions.json");
const registryBytes = fs.readFileSync(registryFile);
const registry = JSON.parse(registryBytes);
const candidateDir = fs.mkdtempSync(path.join(os.tmpdir(), "ae-candidate-review-"));
const options = { candidateDir, registry };
const safeBody = "var targetNames = ['ROOT'];\nthrow new Error('compile only; never execute');\nreturn targetNames;";

function writeGroup(body, count = 2, overrides = {}) {
  const refs = [];
  for (let index = 0; index < count; index += 1) {
    refs.push(path.basename(writeSolutionCandidateReport({
      title: `Review fixture ${index} ${fs.readdirSync(candidateDir).length}`,
      generatedScript: { language: "extendscript", body },
      runResult: { ok: true, dryRun: false, mutating: false },
      ...overrides
    }, { outputDir: candidateDir, generatedAt: `2026-09-13T10:00:${String(index).padStart(2, "0")}.000Z`, source: "isolated-review-smoke" }).path));
  }
  return refs;
}

function inputFor(ref) {
  const listed = listSolutionCandidates({ limit: 50 }, options);
  const selected = listed.candidates.find((entry) => entry.candidateRef === ref);
  return {
    candidateRef: ref, expectedFingerprint: selected.exactFingerprint,
    proposal: {
      id: "isolated-review-builder", kind: "deterministic-builder", summary: "Inspect exact targets.",
      parameters: [{ name: "targetNames", type: "array", sourceAnchor: "var targetNames = ['ROOT'];", constraints: ["Unique exact names; reject missing targets."] }],
      comparisons: [{ solutionId: "getlayerinfo-typed-plan", tools: ["get_comp_details"], coverage: "Reads composition.", gap: "Does not orchestrate nested traversal." }],
      algorithm: ["Resolve exact names from bounded inspection; deduplicate identities."],
      criteria: { syntax: ["Check ES3 compatibility."], safety: ["No filesystem or selection writes."],
        isolatedReproduction: ["Two roots share one nested comp; visit once."], readBack: ["Compare identities and complete counts."] }
    }
  };
}

function snapshot() {
  return fs.readdirSync(candidateDir).sort().map((name) => [name, fs.readFileSync(path.join(candidateDir, name), "utf8")]);
}

function main() {
  const refs = writeGroup(safeBody);
  const input = inputFor(refs[0]);
  const tools = [...new Set(registry.solutions.flatMap((entry) => entry.execution.preferredTools))].map((name) => ({ name }));
  const searchBefore = searchSolutions({ query: "isolated-review-builder", limit: 3 }, tools);
  const before = snapshot();
  const result = reduceCandidateReview(input, options);
  assert.strictEqual(result.status, "proposal-prepared");
  assert.strictEqual(result.source.repeatCount, 2);
  assert.strictEqual(result.checks.syntax.executed, false);
  assert.strictEqual(result.checks.syntax.aeCompatibility, "unverified");
  assert(Object.values(result.checks.criteria).every((entry) => entry.status === "pending-review"));
  assert.strictEqual(result.quarantine.plannerVisible, false);
  assert.strictEqual(result.promotion.explicitReview, false);
  assert.strictEqual(result.generatedScript, undefined);
  assert.strictEqual(result.plan, undefined);
  assert.deepStrictEqual(result, reduceCandidateReview(input, options), "Same queue/input must reduce deterministically.");
  assert.deepStrictEqual(snapshot(), before, "Reducer cannot modify quarantine.");
  assert.throws(() => validatePromotionReview(result, JSON.parse(before[0][1])), /schemaVersion/);
  assert.deepStrictEqual(searchSolutions({ query: "isolated-review-builder", limit: 3 }, tools), searchBefore);
  assert.deepStrictEqual(fs.readFileSync(registryFile), registryBytes, "Registry must remain byte-identical.");

  function altered(change) { const copy = JSON.parse(JSON.stringify(input)); change(copy); return copy; }
  assert.throws(() => reduceCandidateReview(altered((copy) => { copy.expectedFingerprint = `sha256:${"0".repeat(64)}`; }), options), /fingerprint changed/);
  assert.throws(() => reduceCandidateReview(altered((copy) => { copy.candidateRef = "../outside.json"; }), options), /basename/);
  assert.throws(() => reduceCandidateReview(altered((copy) => { copy.proposal.plannerVisible = true; }), options), /unknown field/);
  assert.throws(() => reduceCandidateReview(altered((copy) => { delete copy.proposal.criteria.readBack; }), options), /readBack/);
  assert.throws(() => reduceCandidateReview(altered((copy) => { copy.proposal.comparisons[0].solutionId = "nonexistent"; }), options), /reviewed solution/);
  assert.throws(() => reduceCandidateReview(altered((copy) => { copy.proposal.comparisons[0].tools = ["run_extendscript"]; }), options), /raw JSX/);
  assert.throws(() => reduceCandidateReview(altered((copy) => { copy.proposal.parameters.push(copy.proposal.parameters[0]); }), options), /duplicate/);
  assert(reduceCandidateReview(altered((copy) => { copy.proposal.parameters[0].sourceAnchor = "missing literal"; }), options).blockers.includes("parameter-anchor:targetNames"));
  assert(reduceCandidateReview(inputFor(writeGroup(`${safeBody}\n// singleton`, 1)[0]), options).blockers.includes("exact-repeat-required"));
  assert(reduceCandidateReview(inputFor(writeGroup(`${safeBody}\nvar broken = ;`)[0]), options).blockers.includes("syntax-needs-review"));
  assert(reduceCandidateReview(inputFor(writeGroup(`${safeBody}\nnew File('out.json');`)[0]), options).blockers.includes("raw-source-safety-findings"));
  assert(reduceCandidateReview(inputFor(writeGroup(`${safeBody}\nvar targetNames = ['ROOT'];`)[0]), options).blockers.includes("parameter-anchor:targetNames"));
  assert(reduceCandidateReview(inputFor(writeGroup(`${safeBody}\n// failed`, 2, { runResult: { ok: false, dryRun: false } })[0]), options).blockers.includes("unsuccessful-or-dry-run-member"));
  assert(reduceCandidateReview(inputFor(writeGroup(`${safeBody}\n// preview`, 2, { runResult: { ok: true, dryRun: true } })[0]), options).blockers.includes("unsuccessful-or-dry-run-member"));
  assert(reduceCandidateReview(inputFor(writeGroup(`${safeBody}\nvar sample = '[redacted:absolute-path]';`)[0]), options).blockers.includes("source-incomplete-or-redacted"));
  assert(reduceCandidateReview(inputFor(writeGroup(`${safeBody}\n/*${"x".repeat(12500)}*/`)[0]), options).blockers.includes("source-incomplete-or-redacted"));
  const large = reduceCandidateReview(inputFor(writeGroup(`${safeBody}\n// large group`, 21)[0]), options);
  assert(large.blockers.includes("group-exceeds-review-bound"));
  assert.strictEqual(large.source.candidateRefs.length, 20);
  assert.strictEqual(large.source.refsTruncated, true);
  fs.writeFileSync(path.join(candidateDir, "malformed.json"), "{bad", "utf8");
  assert(reduceCandidateReview(input, options).blockers.includes("queue-has-unreadable-candidates"));
  fs.renameSync(path.join(candidateDir, refs[1]), path.join(candidateDir, `${refs[1]}.removed`));
  assert(reduceCandidateReview(input, options).blockers.includes("exact-repeat-required"), "Membership must be freshly loaded.");

  const inputPath = path.join(os.tmpdir(), `ae-review-input-${process.pid}.json`);
  fs.writeFileSync(inputPath, JSON.stringify(input), "utf8");
  const cli = spawnSync(process.execPath, [path.join(__dirname, "solution-candidate-review.js"), inputPath], {
    env: { ...process.env, AE_SOLUTION_CANDIDATE_DIR: candidateDir }, encoding: "utf8", windowsHide: true
  });
  assert.strictEqual(cli.status, 2, cli.stderr);
  assert.strictEqual(JSON.parse(cli.stdout).status, "blocked");
  assert.deepStrictEqual(fs.readFileSync(registryFile), registryBytes);
  console.log(JSON.stringify({ ok: true, deterministic: true, sourceExecuted: false, registryUnchanged: true, plannerVisible: false, candidateAeReproduction: "not-run" }));
}

main();
