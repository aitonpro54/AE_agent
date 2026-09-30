#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { findMissingFootageCandidates: search, buildSourceRecoveryPlan: build,
  verifySourceRecoveryReadBack: verify, scanRoots } = require("../mcp-server/placeholder-source-recovery");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "codex-recovery-smoke-"));
const root = path.join(temp, "root");
const nested = path.join(root, "nested");
const other = path.join(temp, "other");
const file = path.join(root, "clip.mp4");
const alternate = path.join(other, "clip.mov");
const old = "D:\\legacy\\clip.mp4";
const item = { itemId: 101, itemIndex: 1, name: "Manually renamed", originalPath: old, footageMissing: true };
try {
  fs.mkdirSync(nested, { recursive: true });
  fs.mkdirSync(other);
  fs.writeFileSync(file, "synthetic-video");
  fs.writeFileSync(alternate, "synthetic-other-video-longer");
  fs.writeFileSync(path.join(nested, "unrelated.txt"), "filtered");
  const single = search({ searchRoots: [root, root, nested], missingItems: [item], expectedSize: 0 });
  assert.equal(single.results[0].status, "matched");
  assert.equal(single.results[0].candidates.length, 1, "same and overlapping roots are deduplicated");
  assert.equal(single.validRoots.length, 1);
  assert.equal(single.results[0].selectedCandidate.filePath, fs.realpathSync(file));
  assert.equal(single.results[0].candidates[0].metadata.width, "unknown");
  assert.equal(single.results[0].candidates[0].probe.status, "not_read");
  assert.equal(single.results[0].candidates[0].comparisons.width.status, "unknown");

  const multiple = search({ searchRoots: [root, other], missingItems: [{ ...item, expectedSize: fs.statSync(file).size,
    expectedMetadata: { width: 1920, duration: 30 } }] });
  const matches = multiple.results[0];
  assert.equal(matches.status, "ambiguous");
  assert.equal(matches.selectedCandidate, null);
  assert.equal(matches.candidates.length, 2, "size mismatch does not hide an alternative");
  assert(matches.candidates[0].reasons.includes("exact_size_match"), "expectedSize reaches production scoring");
  assert(matches.candidates[1].reasons.includes("size_mismatch"));
  assert.equal(matches.candidates[0].comparisons.width.status, "unknown");
  const renamedOnly = search({ searchRoots: [root], missingItems: [{ ...item, originalPath: "C:/old/missing.mp4", name: "clip.mp4" }] });
  assert.equal(renamedOnly.results[0].status, "unmatched", "renamed name cannot replace original basename");
  const absentRoot = search({ searchRoots: [root, path.join(temp, "absent")], missingItems: [item] });
  assert.equal(absentRoot.incomplete, true);
  assert.equal(absentRoot.rootErrors.length, 1);
  assert.equal(absentRoot.results[0].status, "ambiguous");
  assert.equal(absentRoot.results[0].selectedCandidate, null);
  assert.equal(scanRoots([path.join(temp, "absent")]).incomplete, true);
  const depth = search({ searchRoots: [root], missingItems: [item], maxDepth: 1 });
  assert.equal(depth.incomplete, true);
  assert.equal(depth.results[0].status, "ambiguous");
  const entryBudget = scanRoots([root], { allowedExtensions: [".doesnotexist"], maxEntries: 1 });
  assert.equal(entryBudget.scannedFilesCount, 0);
  assert(entryBudget.scannedEntriesCount <= 1);
  assert.equal(entryBudget.truncated, true, "filtered files consume the entry budget");
  const dirBudget = scanRoots([root], { maxDirectories: 1 });
  assert.equal(dirBudget.visitedDirsCount, 1);
  assert.equal(dirBudget.incomplete, true);
  assert.equal(dirBudget.truncated, true);

  const junction = path.join(root, "outside-link");
  fs.symlinkSync(other, junction, process.platform === "win32" ? "junction" : "dir");
  const links = scanRoots([root]);
  assert.equal(links.incomplete, true);
  assert(links.traversalErrors.some(error => error.path === junction));
  assert(!links.files.some(candidate => candidate.filePath === fs.realpathSync(alternate)));
  fs.unlinkSync(junction);
  // Simulate a child canonical path changing to a location outside the allowed root.
  const realpath = fs.realpathSync;
  try {
    fs.realpathSync = value => path.resolve(value) === file ? realpath(alternate) : realpath(value);
    const escape = scanRoots([root]);
    assert.equal(escape.incomplete, true);
    assert(escape.traversalErrors.some(error => /searchRoot/.test(error.error)));
    assert(!escape.files.some(candidate => candidate.filePath === realpath(alternate)));
  } finally { fs.realpathSync = realpath; }
  assert.throws(() => search({ searchRoots: [root], missingItems: [item, item] }), /unique/);

  const request = { ...matches, itemName: item.name, currentFilePath: old,
    footageMissing: true, targetFilePath: file, candidateSelectionConfirmed: true };
  const code = (changes, expected) => assert.equal(build({ requests: [{ ...request, ...changes }] }).code, expected);
  code({ candidates: undefined, isAmbiguous: undefined }, "CANDIDATES_REQUIRED");
  code({ candidates: [] }, "CANDIDATES_REQUIRED");
  code({ footageMissing: undefined }, "EXPECTED_MISSING_STATE_REQUIRED");
  code({ footageMissing: false }, "EXPECTED_MISSING_STATE_REQUIRED");
  code({ candidateSelectionConfirmed: undefined, isAmbiguous: undefined }, "UNCONFIRMED_CANDIDATE_SELECTION");
  code({ currentFilePath: "", originalPath: "" }, "MISSING_PREVIOUS_FILE_PATH");
  code({ itemName: "", name: "" }, "MISSING_ITEM_NAME");
  code({ targetFilePath: path.join(temp, "ghost.mp4") }, "TARGET_FILE_NOT_FOUND");
  code({ targetFilePath: root }, "TARGET_IS_NOT_FILE");
  code({ candidates: [{ filePath: alternate }], targetFilePath: file }, "TARGET_NOT_IN_CANDIDATES");
  assert.equal(build({ requests: [request, request] }).code, "DUPLICATE_TARGET_ITEM");
  const success = build({ requests: [request] });
  assert.equal(success.ok, true);
  assert.deepEqual(success.plan.expectedReadBack, success.expectedReadBack);
  assert.deepEqual(success.plan.steps[1], { tool: "find_project_items", args: { type: "footage", itemIds: [101], limit: 1 } });
  assert.equal(success.plan.steps[0].args.expectedName, item.name);
  assert.equal(success.plan.steps[0].args.expectedPreviousFilePath, old);
  const second = { ...request, itemId: 102, targetFilePath: alternate };
  assert.equal(build({ requests: [request, second] }).plan.steps.length, 3);

  const observed = { itemId: 101, itemIndex: 99, name: item.name, file, footageMissing: false };
  assert.equal(verify(success.expectedReadBack, { matches: [observed] }).ok, true, "production matches envelope and shifted index");
  const failObserved = changes => assert.equal(verify(success.expectedReadBack, { matches: [{ ...observed, ...changes }] }).status, "needs_review");
  for (const footageMissing of [undefined, null, 0, "", "false", true]) failObserved({ footageMissing });
  failObserved({ file: path.join(other, "clip.mp4") });
  failObserved({ itemId: 999 });
  assert.equal(verify(success.expectedReadBack, { matches: [observed, observed] }).ok, false);
  assert.equal(verify(success.expectedReadBack, { item: observed }).ok, false, "setter payload is not independent evidence");
  for (const expected of [[], [{ file, footageMissing: false }], [{ itemId: 101, file, footageMissing: true }],
    [{ itemId: 101, file: "clip.mp4", footageMissing: false }], [...success.expectedReadBack, ...success.expectedReadBack]]) {
    assert.equal(verify(expected, { matches: [observed] }).status, "needs_review");
  }

  const png = path.join(root, "one.png");
  fs.writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1EAAAAASUVORK5CYII=", "base64"));
  const probe = search({ searchRoots: [root], missingItems: [{ itemId: 201, name: "one.png", expectedMetadata: { width: 1, height: 2 } }],
    probeMedia: true, maxProbeFiles: 1, probeTimeoutMs: 2000 });
  assert.equal(probe.probedFilesCount, 1);
  const candidate = probe.results[0].candidates[0];
  if (candidate.probe.status === "read") {
    assert.equal(candidate.metadata.source, "ffprobe");
    assert.equal(candidate.metadata.width, 1);
    assert.equal(candidate.comparisons.width.status, "matched");
    assert.equal(candidate.comparisons.height.status, "mismatch");
    console.log("PASS: existing ffprobe read 1x1 PNG; expected metadata compared.");
  } else {
    assert.equal(candidate.metadata.width, "unknown");
    console.log("LIMIT: ffprobe unavailable/unsupported; media remains unknown.");
  }
  console.log("PASS: recovery production helper — bounded search, ambiguity, guards and independent readback.");
} finally {
  assert(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep), "cleanup stays in temp workspace");
  fs.rmSync(temp, { recursive: true, force: true });
}
