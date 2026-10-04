#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const {
  getCompVisualReviewManifestTool,
  createManifest,
  validateBuilderPlanShape,
  verifyPathContainment,
  manifestError
} = require("../mcp-server/comp-visual-review-manifest");
const { buildCompVisualReviewPlan } = require("../mcp-server/comp-visual-review-plan");
const { png } = require("./placeholder-visual-fixture");

async function runTests() {
  // 1. Tool declaration
  assert.equal(getCompVisualReviewManifestTool.name, "get_comp_visual_review_manifest");
  assert.deepEqual(getCompVisualReviewManifestTool.inputSchema.required, ["runId"]);
  assert.equal(getCompVisualReviewManifestTool.inputSchema.additionalProperties, false);

  // 2. verifyPathContainment
  const tempExportDir = fs.mkdtempSync(path.join(os.tmpdir(), "ae-manifest-smoke-"));
  try {
    const validFile = path.join(tempExportDir, "sample.png");
    assert.equal(verifyPathContainment(tempExportDir, validFile), path.resolve(validFile));

    assert.throws(
      () => verifyPathContainment(tempExportDir, path.join(tempExportDir, "..", "escape.png")),
      (err) => err.code === "path_containment_violation"
    );

    assert.throws(
      () => verifyPathContainment(tempExportDir, path.resolve("C:/escaped/foreign.png")),
      (err) => err.code === "path_containment_violation"
    );

    assert.throws(
      () => verifyPathContainment("", validFile),
      (err) => err.code === "invalid_export_root"
    );

    // 3. validateBuilderPlanShape
    assert.throws(() => validateBuilderPlanShape(null), (err) => err.code === "non_builder_plan");
    assert.throws(() => validateBuilderPlanShape([]), (err) => err.code === "non_builder_plan");
    assert.throws(() => validateBuilderPlanShape([{ tool: "get_comp_details", args: {} }]), (err) => err.code === "non_builder_plan");

    // Missing final get_project_info
    assert.throws(
      () => validateBuilderPlanShape([
        { tool: "get_project_info", args: {} },
        { tool: "save_comp_frame_png", args: { compItemIndex: 1, expectedCompItemId: 10, expectedCompName: "Comp 1", time: 0, resolutionFactor: [1, 1], allowOverwrite: false, deleteAfterReadBack: false, verifyAfter: true, idempotencyScope: "comp-visual-review", idempotencyKey: "74c0a3b1-1d92-4ae7-9a76-134073fdb281:1", outputFileName: "comp-review-74c0a3b1-1d92-4ae7-9a76-134073fdb281-1.png" } },
        { tool: "get_comp_details", args: { compItemId: 10, includeLayers: false } }
      ]),
      (err) => err.code === "non_builder_plan"
    );

    // Non-contiguous ordinal in save_comp_frame_png
    assert.throws(
      () => validateBuilderPlanShape([
        { tool: "get_project_info", args: {} },
        { tool: "save_comp_frame_png", args: { compItemIndex: 1, expectedCompItemId: 10, expectedCompName: "Comp 1", time: 0, resolutionFactor: [1, 1], allowOverwrite: false, deleteAfterReadBack: false, verifyAfter: true, idempotencyScope: "comp-visual-review", idempotencyKey: "74c0a3b1-1d92-4ae7-9a76-134073fdb281:2", outputFileName: "comp-review-74c0a3b1-1d92-4ae7-9a76-134073fdb281-2.png" } },
        { tool: "get_comp_details", args: { compItemId: 10, includeLayers: false } },
        { tool: "get_project_info", args: {} }
      ]),
      (err) => err.code === "non_builder_plan"
    );

    // Mixed review IDs across save_comp_frame_png
    assert.throws(
      () => validateBuilderPlanShape([
        { tool: "get_project_info", args: {} },
        { tool: "save_comp_frame_png", args: { compItemIndex: 1, expectedCompItemId: 10, expectedCompName: "Comp 1", time: 0, resolutionFactor: [1, 1], allowOverwrite: false, deleteAfterReadBack: false, verifyAfter: true, idempotencyScope: "comp-visual-review", idempotencyKey: "74c0a3b1-1d92-4ae7-9a76-134073fdb281:1", outputFileName: "comp-review-74c0a3b1-1d92-4ae7-9a76-134073fdb281-1.png" } },
        { tool: "save_comp_frame_png", args: { compItemIndex: 1, expectedCompItemId: 10, expectedCompName: "Comp 1", time: 0.1, resolutionFactor: [1, 1], allowOverwrite: false, deleteAfterReadBack: false, verifyAfter: true, idempotencyScope: "comp-visual-review", idempotencyKey: "64c0a3b1-1d92-4ae7-9a76-134073fdb281:2", outputFileName: "comp-review-64c0a3b1-1d92-4ae7-9a76-134073fdb281-2.png" } },
        { tool: "get_comp_details", args: { compItemId: 10, includeLayers: false } },
        { tool: "get_project_info", args: {} }
      ]),
      (err) => err.code === "mixed_review_ids"
    );

    // 4. End-to-end createManifest with realistic builder plan and PNG files
    const reviewId = "74c0a3b1-1d92-4ae7-9a76-134073fdb281";
    const context = {
      projectFile: "C:/work/project.aep",
      observedAt: "2026-10-03T10:00:00.000Z",
      comps: [
        { itemId: 10, itemIndex: 1, name: "Main Comp", width: 100, height: 100, frameRate: 24, duration: 10 },
        { itemId: 20, itemIndex: 2, name: "Second Comp", width: 200, height: 200, frameRate: 24, duration: 10 }
      ]
    };
    const input = {
      targets: [
        { compItemId: 10, times: [0, 1 / 24] },
        { compItemId: 20, times: [0.5] }
      ]
    };

    const built = buildCompVisualReviewPlan(input, context, reviewId);
    assert(built && built.plan && built.plan.steps.length === 7);

    // Write valid PNG buffers for the 3 frames
    const png100 = png(100, 100);
    const png200 = png(200, 200);
    const sha100 = crypto.createHash("sha256").update(png100).digest("hex");
    const sha200 = crypto.createHash("sha256").update(png200).digest("hex");

    const file1Path = path.join(tempExportDir, `comp-review-${reviewId}-1.png`);
    const file2Path = path.join(tempExportDir, `comp-review-${reviewId}-2.png`);
    const file3Path = path.join(tempExportDir, `comp-review-${reviewId}-3.png`);
    fs.writeFileSync(file1Path, png100);
    fs.writeFileSync(file2Path, png100);
    fs.writeFileSync(file3Path, png200);

    const makeBaseRecord = () => ({
      schema: "ae-agent-plan-run-record.v1",
      runId: reviewId,
      plan: built.plan,
      run: {
        id: reviewId,
        dryRun: false,
        ok: true,
        failedCount: 0,
        finishedAt: "2026-10-03T10:05:00.000Z",
        steps: [
          {
            index: 1,
            tool: "get_project_info",
            args: {},
            status: "completed",
            result: { ok: true, file: "C:/work/project.aep", numItems: 2, revision: 42, supported: { revision: true } }
          },
          {
            index: 2,
            tool: "save_comp_frame_png",
            args: built.plan.steps[1].args,
            status: "completed",
            result: {
              ok: true,
              comp: { itemId: 10, itemIndex: 1, name: "Main Comp", width: 100, height: 100, frameRate: 24, duration: 10 },
              frame: { time: 0, frameNumber: 0 },
              resolutionFactor: { before: [1, 1], applied: [1, 1], after: [1, 1], restored: true },
              file: {
                outputFileName: `comp-review-${reviewId}-1.png`,
                outputPath: file1Path,
                sha256: sha100,
                width: 100,
                height: 100,
                byteLength: png100.length,
                pngComplete: true,
                existsAfter: true,
                deletedAfterReadBack: false
              }
            }
          },
          {
            index: 3,
            tool: "save_comp_frame_png",
            args: built.plan.steps[2].args,
            status: "completed",
            result: {
              ok: true,
              comp: { itemId: 10, itemIndex: 1, name: "Main Comp", width: 100, height: 100, frameRate: 24, duration: 10 },
              frame: { time: 1 / 24, frameNumber: 1 },
              resolutionFactor: { before: [2, 2], applied: [1, 1], after: [2, 2], restored: true },
              file: {
                outputFileName: `comp-review-${reviewId}-2.png`,
                outputPath: file2Path,
                sha256: sha100,
                width: 100,
                height: 100,
                byteLength: png100.length,
                pngComplete: true,
                existsAfter: true,
                deletedAfterReadBack: false
              }
            }
          },
          {
            index: 4,
            tool: "save_comp_frame_png",
            args: built.plan.steps[3].args,
            status: "completed",
            result: {
              ok: true,
              comp: { itemId: 20, itemIndex: 2, name: "Second Comp", width: 200, height: 200, frameRate: 24, duration: 10 },
              frame: { time: 0.5, frameNumber: 12 },
              resolutionFactor: { before: [1, 1], applied: [1, 1], after: [1, 1], restored: true },
              file: {
                outputFileName: `comp-review-${reviewId}-3.png`,
                outputPath: file3Path,
                sha256: sha200,
                width: 200,
                height: 200,
                byteLength: png200.length,
                pngComplete: true,
                existsAfter: true,
                deletedAfterReadBack: false
              }
            }
          },
          {
            index: 5,
            tool: "get_comp_details",
            args: built.plan.steps[4].args,
            status: "completed",
            result: { ok: true, itemId: 10, itemIndex: 1, name: "Main Comp" }
          },
          {
            index: 6,
            tool: "get_comp_details",
            args: built.plan.steps[5].args,
            status: "completed",
            result: { ok: true, itemId: 20, itemIndex: 2, name: "Second Comp" }
          },
          {
            index: 7,
            tool: "get_project_info",
            args: {},
            status: "completed",
            result: { ok: true, file: "C:/work/project.aep", numItems: 2, revision: 42, supported: { revision: true } }
          }
        ]
      }
    });

    // Test A: Normal complete execution
    const mValid = await createManifest(makeBaseRecord(), { runId: reviewId, exportRoot: tempExportDir });
    assert.equal(mValid.ok, true);
    assert.equal(mValid.status, "complete");
    assert.equal(mValid.verificationStatus, "verified");
    assert.equal(mValid.executionStatus, "completed");
    assert.equal(mValid.historicalCapture, true);
    assert.equal(mValid.currentProjectStateVerified, false);
    assert.equal(mValid.canonicalFreshness, false);
    assert.equal(mValid.artisticAccepted, false);
    assert.equal(mValid.verifiedFramesCount, 3);
    assert.equal(mValid.totalPlannedFrames, 3);
    assert.equal(mValid.frames.length, 3);
    assert(mValid.frames.every((f) => f.verified === true));

    // Test B: dryRun: true cannot be complete
    const dryRecord = makeBaseRecord();
    dryRecord.run.dryRun = true;
    const mDry = await createManifest(dryRecord, { runId: reviewId, exportRoot: tempExportDir });
    assert.equal(mDry.ok, false);
    assert.equal(mDry.status, "incomplete");
    assert.equal(mDry.historicalCapture, true);
    assert.equal(mDry.currentProjectStateVerified, false);

    // Test C: run.ok === false / failedCount > 0
    const failRecord = makeBaseRecord();
    failRecord.run.ok = false;
    failRecord.run.failedCount = 1;
    const mFail = await createManifest(failRecord, { runId: reviewId, exportRoot: tempExportDir });
    assert.equal(mFail.ok, false);
    assert.equal(mFail.status, "incomplete");
    assert.equal(mFail.executionStatus, "failed");

    // Test D: missing finishedAt
    const unfinRecord = makeBaseRecord();
    delete unfinRecord.run.finishedAt;
    const mUnfin = await createManifest(unfinRecord, { runId: reviewId, exportRoot: tempExportDir });
    assert.equal(mUnfin.ok, false);
    assert.equal(mUnfin.status, "incomplete");

    // Test E: Duplicate step index in run.steps => corrupt
    const dupRecord = makeBaseRecord();
    dupRecord.run.steps.push({ ...dupRecord.run.steps[1] });
    const mDup = await createManifest(dupRecord, { runId: reviewId, exportRoot: tempExportDir });
    assert.equal(mDup.ok, false);
    assert.equal(mDup.status, "corrupt");
    assert.equal(mDup.verificationStatus, "failed");

    // Test F: resolutionFactor unrestored (before !== after) => corrupt
    const badRfRecord = makeBaseRecord();
    badRfRecord.run.steps[1].result.resolutionFactor.after = [2, 2]; // before was [1, 1]
    const mBadRf = await createManifest(badRfRecord, { runId: reviewId, exportRoot: tempExportDir });
    assert.equal(mBadRf.ok, false);
    assert.equal(mBadRf.status, "corrupt");

    // Test G: SHA-256 mismatch or file corruption on disk => corrupt
    const shaRecord = makeBaseRecord();
    shaRecord.run.steps[1].result.file.sha256 = "0".repeat(64);
    const mSha = await createManifest(shaRecord, { runId: reviewId, exportRoot: tempExportDir });
    assert.equal(mSha.ok, false);
    assert.equal(mSha.status, "corrupt");

    // Test H: Output path containment mismatch
    const escapeRecord = makeBaseRecord();
    escapeRecord.run.steps[1].result.file.outputPath = path.resolve(tempExportDir, "..", "escaped.png");
    const mEscape = await createManifest(escapeRecord, { runId: reviewId, exportRoot: tempExportDir });
    assert.equal(mEscape.ok, false);
    assert.equal(mEscape.status, "corrupt");

    // Test I: Post-read get_comp_details ID mismatch => corrupt
    const postCompRecord = makeBaseRecord();
    postCompRecord.run.steps[4].result.itemId = 999;
    const mPostComp = await createManifest(postCompRecord, { runId: reviewId, exportRoot: tempExportDir });
    assert.equal(mPostComp.ok, false);
    assert.equal(mPostComp.status, "corrupt");

    // Test J: Final project info changed file => corrupt
    const postProjRecord = makeBaseRecord();
    postProjRecord.run.steps[6].result.file = "C:/work/modified.aep";
    const mPostProj = await createManifest(postProjRecord, { runId: reviewId, exportRoot: tempExportDir });
    assert.equal(mPostProj.ok, false);
    assert.equal(mPostProj.status, "corrupt");

    // Test K: Missing file on disk => corrupt
    fs.unlinkSync(file1Path);
    const mMissing = await createManifest(makeBaseRecord(), { runId: reviewId, exportRoot: tempExportDir });
    assert.equal(mMissing.ok, false);
    assert.equal(mMissing.status, "corrupt");
  } finally {
    fs.rmSync(tempExportDir, { recursive: true, force: true });
  }

  console.log(JSON.stringify({
    ok: true,
    checks: "comp-visual-review-manifest-smoke: tool schema, strict builder shape, containment guards, complete run gates, dry-run/fail/unfin rejection, payload proofs, disk verification, invariant flags"
  }));
}

runTests().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
