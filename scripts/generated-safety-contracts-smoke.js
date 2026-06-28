"use strict";

const assert = require("assert");
const path = require("path");

const generatedSafety = require("../mcp-server/generated-safety-contracts");

const repoRoot = path.resolve(__dirname, "..");
const generatedExportRoot = path.join(repoRoot, generatedSafety.DEFAULT_GENERATED_EXPORT_ROOT);
const generatedRenderRoot = path.join(repoRoot, generatedSafety.DEFAULT_GENERATED_RENDER_OUTPUT_ROOT);

function assertRejects(fn, pattern, label) {
  let error = null;
  try {
    fn();
  } catch (caught) {
    error = caught;
  }
  assert(error, `${label}: expected rejection`);
  assert(pattern.test(error.message), `${label}: unexpected error ${error.message}`);
}

function assertGeneratedFilePolicy() {
  const text = generatedSafety.resolveGeneratedFile({
    root: generatedExportRoot,
    requestedName: "points-smoke.txt",
    allowedExtensions: [".txt"],
    label: "outputFileName"
  });
  assert.strictEqual(text.outputFileName, "points-smoke.txt");
  assert.strictEqual(path.dirname(text.resolvedPath), generatedExportRoot);

  const png = generatedSafety.resolveGeneratedFile({
    root: generatedExportRoot,
    requestedName: "frame-smoke.png",
    allowedExtensions: [".png"],
    label: "outputFileName"
  });
  assert.strictEqual(png.outputFileName, "frame-smoke.png");

  assertRejects(
    () => generatedSafety.resolveGeneratedFile({ root: generatedExportRoot, requestedName: "..\\escape.txt", allowedExtensions: [".txt"] }),
    /not a path|basename/,
    "backslash escape"
  );
  assertRejects(
    () => generatedSafety.resolveGeneratedFile({ root: generatedExportRoot, requestedName: "wrong.jsx", allowedExtensions: [".txt"] }),
    /extension/,
    "wrong extension"
  );
}

function assertGeneratedRenderOutputPolicy() {
  const simple = generatedSafety.resolveGeneratedRenderOutputPath({
    projectRoot: repoRoot,
    generatedRenderOutputDir: generatedRenderRoot,
    requestedPath: "render-smoke.mov"
  });
  assert.strictEqual(simple.outputFileName, "render-smoke.mov");
  assert.strictEqual(path.dirname(simple.resolvedPath), generatedRenderRoot);

  const rooted = generatedSafety.resolveGeneratedRenderOutputPath({
    projectRoot: repoRoot,
    generatedRenderOutputDir: generatedRenderRoot,
    requestedPath: "logs/generated-renders/render-smoke-updated.png"
  });
  assert.strictEqual(rooted.outputFileName, "render-smoke-updated.png");

  assertRejects(
    () => generatedSafety.resolveGeneratedRenderOutputPath({
      projectRoot: repoRoot,
      generatedRenderOutputDir: generatedRenderRoot,
      requestedPath: "logs/render-smoke.mov"
    }),
    /logs\/generated-renders/,
    "legacy broad logs path"
  );
  assertRejects(
    () => generatedSafety.resolveGeneratedRenderOutputPath({
      projectRoot: repoRoot,
      generatedRenderOutputDir: generatedRenderRoot,
      requestedPath: "logs/generated-renders/nested/render.mov"
    }),
    /not a nested path|one generated render output file/,
    "nested render path"
  );
}

function assertPlanContractMetadata() {
  const fileContracts = generatedSafety.contractsForPlanStep("save_comp_frame_png", { outputFileName: "frame.png" });
  assert.strictEqual(fileContracts.length, 1);
  assert.strictEqual(fileContracts[0].kind, "generated-file-output");

  const renderContracts = generatedSafety.contractsForPlanStep("set_render_queue_output", { outputPath: "logs/generated-renders/render.png" });
  assert.strictEqual(renderContracts.length, 1);
  assert.strictEqual(renderContracts[0].kind, "generated-render-output");

  const cleanupContracts = generatedSafety.contractsForPlanStep("cleanup_test_items", { namePrefix: "Codex QA", confirm: true });
  assert.strictEqual(cleanupContracts.length, 1);
  assert.strictEqual(cleanupContracts[0].kind, "generated-cleanup-delete");

  assert.deepStrictEqual(generatedSafety.validateGeneratedSafetyStep("export_path_points", { outputFileName: "points.txt" }), []);
  assert(generatedSafety.validateGeneratedSafetyStep("export_path_points", { outputFileName: "Desktop/points.txt" }).length > 0);
  assert.deepStrictEqual(generatedSafety.validateGeneratedSafetyStep("cleanup_test_items", { namePrefix: "Codex QA", confirm: true }), []);
  assert(generatedSafety.validateGeneratedSafetyStep("cleanup_test_items", { namePrefix: "User", confirm: true }).some((issue) => /generated prefix/.test(issue)));
}

function assertTerminalTaxonomyCoverage() {
  const taxonomy = generatedSafety.TERMINAL_SAFETY_CANDIDATE_TAXONOMY;
  assert.strictEqual(Object.keys(taxonomy.fileIo).length, 8);
  assert.strictEqual(Object.keys(taxonomy.cleanupDelete).length, 5);
  for (const entry of Object.values(taxonomy.fileIo).concat(Object.values(taxonomy.cleanupDelete))) {
    assert(entry.blockerClass, "taxonomy entries must include blockerClass");
    assert(entry.contractPrimitive, "taxonomy entries must include contractPrimitive");
    assert(entry.unblockCondition, "taxonomy entries must include unblockCondition");
  }
}

function assertEvidenceContract() {
  assert.deepStrictEqual(generatedSafety.generatedFileEvidenceIssues("save_comp_frame_png", {
    outputFileName: "frame.png",
    outputPath: path.join(generatedExportRoot, "frame.png"),
    byteLength: 128,
    sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    existsAfter: false,
    deletedAfterReadBack: true
  }), []);

  assert(generatedSafety.generatedFileEvidenceIssues("save_comp_frame_png", {
    outputFileName: "frame.png",
    outputPath: path.join(generatedExportRoot, "other.png"),
    byteLength: 0,
    sha256: "bad",
    existsAfter: true,
    deletedAfterReadBack: true
  }).length >= 3);
}

function main() {
  assertGeneratedFilePolicy();
  assertGeneratedRenderOutputPolicy();
  assertPlanContractMetadata();
  assertTerminalTaxonomyCoverage();
  assertEvidenceContract();
  console.log("generated-safety-contracts smoke passed");
}

main();
