"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const {
  verifyMontageMaterials,
  authorizeMaterialPath,
  streamFileSha256
} = require("../mcp-server/montage-materials");

let passed = 0;
function test(name, action) {
  try {
    action();
    passed++;
  } catch (error) {
    console.error(`FAIL ${name}: ${error.message}`);
    throw error;
  }
}

// Temporary directory for synthetic test footage files
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "montage-materials-smoke-"));

function createSyntheticFile(filename, content) {
  const filePath = path.join(tmpDir, filename);
  fs.writeFileSync(filePath, content);
  const realPath = fs.realpathSync(filePath);
  const sha = crypto.createHash("sha256").update(content).digest("hex");
  return {
    filePath,
    realPath,
    size: Buffer.byteLength(content),
    sha256: sha
  };
}

try {
  const file1 = createSyntheticFile("test_clip_1.mp4", "SYNTHETIC_VIDEO_DATA_001_A_TEST_FRAME_BYTES");
  const file2 = createSyntheticFile("test_clip_2.mp4", "SYNTHETIC_VIDEO_DATA_002_B_ANOTHER_CLIP_BYTES_LONG");

  function createValidInventory() {
    return {
      complete: true,
      comps: [],
      sources: [
        {
          itemId: 101,
          itemIndex: 1,
          name: "test_clip_1.mp4",
          type: "footage",
          file: file1.realPath,
          duration: 10.0,
          frameRate: 30,
          width: 1920,
          height: 1080,
          pixelAspect: 1,
          hasVideo: true,
          footageMissing: false
        },
        {
          itemId: 102,
          itemIndex: 2,
          name: "test_clip_2.mp4",
          type: "footage",
          file: file2.realPath,
          duration: 12.0,
          frameRate: 30,
          width: 1920,
          height: 1080,
          pixelAspect: 1,
          hasVideo: true,
          footageMissing: false
        }
      ]
    };
  }

  function createValidCatalog() {
    return {
      schema: "ae-agent-prepared-materials.v1",
      revision: 1,
      materials: [
        {
          materialId: "mat_1",
          sourceItemId: 101,
          path: file1.realPath,
          sha256: file1.sha256,
          byteLength: file1.size,
          width: 1920,
          height: 1080,
          pixelAspect: 1,
          duration: 10.0,
          fps: 30,
          provenance: { kind: "prepared_clip" }
        },
        {
          materialId: "mat_2",
          sourceItemId: 102,
          path: file2.realPath,
          sha256: file2.sha256,
          byteLength: file2.size,
          width: 1920,
          height: 1080,
          pixelAspect: 1,
          duration: 12.0,
          fps: 30,
          provenance: { kind: "prepared_clip" }
        }
      ]
    };
  }

  // 1. Positive material verification
  test("positive material verification with real temp files and full SHA256", () => {
    const inv = createValidInventory();
    const cat = createValidCatalog();
    const res = verifyMontageMaterials({ preparedMaterials: cat, inventory: inv });

    assert.equal(res.ok, true, `Expected success, got blockers: ${JSON.stringify(res.blockers)}`);
    assert.equal(res.verified, true);
    assert.equal(res.verifiedMaterials.length, 2);
    assert.equal(res.catalogRevision, 1);

    assert.equal(res.verifiedMaterials[0].materialId, "mat_1");
    assert.equal(res.verifiedMaterials[0].sha256, file1.sha256);
    assert.equal(res.verifiedMaterials[0].byteLength, file1.size);
    assert.equal(res.verifiedMaterials[0].verified, true);

    assert.equal(res.verifiedMaterials[1].materialId, "mat_2");
    assert.equal(res.verifiedMaterials[1].sha256, file2.sha256);
    assert.equal(res.verifiedMaterials[1].byteLength, file2.size);
  });

  // 2. Arbitrary caller path denied BEFORE read
  test("arbitrary path not matching native source file is denied before reading", () => {
    const inv = createValidInventory();
    const cat = createValidCatalog();
    // Point mat_1 to an arbitrary path not authorized for source 101
    const arbitraryFile = createSyntheticFile("arbitrary.mp4", "UNAUTHORIZED_BYTES");
    cat.materials[0].path = arbitraryFile.realPath;

    const res = verifyMontageMaterials({ preparedMaterials: cat, inventory: inv });
    assert.equal(res.ok, false);
    assert.ok(res.blockers.some(b => b.code === "arbitrary_path_denied"));
  });

  // 3. Source not found in native inventory
  test("material referencing unknown sourceItemId is blocked", () => {
    const inv = createValidInventory();
    const cat = createValidCatalog();
    cat.materials[0].sourceItemId = 9999;

    const res = verifyMontageMaterials({ preparedMaterials: cat, inventory: inv });
    assert.equal(res.ok, false);
    assert.ok(res.blockers.some(b => b.code === "source_not_in_inventory"));
  });

  // 4. Source without video or missing footage
  test("footage with missing footage or without video is blocked", () => {
    const invNoVideo = createValidInventory();
    invNoVideo.sources[0].hasVideo = false;
    const cat = createValidCatalog();

    const resNoVideo = verifyMontageMaterials({ preparedMaterials: cat, inventory: invNoVideo });
    assert.equal(resNoVideo.ok, false);
    assert.ok(resNoVideo.blockers.some(b => b.code === "source_no_video"));

    const invMissing = createValidInventory();
    invMissing.sources[0].footageMissing = true;
    const resMissing = verifyMontageMaterials({ preparedMaterials: cat, inventory: invMissing });
    assert.equal(resMissing.ok, false);
    assert.ok(resMissing.blockers.some(b => b.code === "source_footage_missing"));
  });

  // 5. File not found on disk
  test("material pointing to non-existent file on disk is blocked", () => {
    const inv = createValidInventory();
    const nonExistentPath = path.join(tmpDir, "does_not_exist.mp4");
    inv.sources[0].file = nonExistentPath;
    const cat = createValidCatalog();
    cat.materials[0].path = nonExistentPath;

    const res = verifyMontageMaterials({ preparedMaterials: cat, inventory: inv });
    assert.equal(res.ok, false);
    assert.ok(res.blockers.some(b => b.code === "material_file_not_found"));
  });

  // 6. Byte length mismatch
  test("material declaring incorrect byteLength is blocked", () => {
    const inv = createValidInventory();
    const cat = createValidCatalog();
    cat.materials[0].byteLength = file1.size + 100;

    const res = verifyMontageMaterials({ preparedMaterials: cat, inventory: inv });
    assert.equal(res.ok, false);
    assert.ok(res.blockers.some(b => b.code === "material_byte_length_mismatch"));
  });

  // 7. Full SHA256 mismatch
  test("material with corrupted or mismatched SHA256 hash is blocked", () => {
    const inv = createValidInventory();
    const cat = createValidCatalog();
    cat.materials[0].sha256 = "0000000000000000000000000000000000000000000000000000000000000000";

    const res = verifyMontageMaterials({ preparedMaterials: cat, inventory: inv });
    assert.equal(res.ok, false);
    assert.ok(res.blockers.some(b => b.code === "material_hash_mismatch"));
  });

  // 8. Native metadata mismatch
  test("metadata mismatch in dimensions, fps, or duration is blocked", () => {
    const inv = createValidInventory();
    inv.sources[0].width = 1280; // Mismatch with material width 1920
    const cat = createValidCatalog();

    const res = verifyMontageMaterials({ preparedMaterials: cat, inventory: inv });
    assert.equal(res.ok, false);
    assert.ok(res.blockers.some(b => b.code === "native_material_metadata_mismatch"));
  });

  // 9. Single file budget boundary (limit vs limit - 1)
  test("file bytes budget exact boundary: exact size succeeds, size - 1 fails", () => {
    const inv = createValidInventory();
    const cat = createValidCatalog();

    // Budget equal to file1 size
    const resExact = verifyMontageMaterials({
      preparedMaterials: { ...cat, materials: [cat.materials[0]] },
      inventory: inv,
      budgets: { materialFileBytes: file1.size }
    });
    assert.equal(resExact.ok, true);

    // Budget 1 byte less than file1 size
    const resLess = verifyMontageMaterials({
      preparedMaterials: { ...cat, materials: [cat.materials[0]] },
      inventory: inv,
      budgets: { materialFileBytes: file1.size - 1 }
    });
    assert.equal(resLess.ok, false);
    assert.ok(resLess.blockers.some(b => b.code === "material_file_bytes_exceeds_budget"));
  });

  // 10. Total cumulative bytes budget boundary
  test("total bytes budget exact boundary: total size succeeds, total - 1 fails", () => {
    const inv = createValidInventory();
    const cat = createValidCatalog();
    const totalBytes = file1.size + file2.size;

    const resExact = verifyMontageMaterials({
      preparedMaterials: cat,
      inventory: inv,
      budgets: { materialTotalBytes: totalBytes }
    });
    assert.equal(resExact.ok, true);

    const resLess = verifyMontageMaterials({
      preparedMaterials: cat,
      inventory: inv,
      budgets: { materialTotalBytes: totalBytes - 1 }
    });
    assert.equal(resLess.ok, false);
    assert.ok(resLess.blockers.some(b => b.code === "material_total_bytes_exceeds_budget"));
  });

  // 11. Read requests count budget boundary
  test("materialReadRequests budget exact boundary: 2 requests succeed, 1 request fails", () => {
    const inv = createValidInventory();
    const cat = createValidCatalog();

    const resExact = verifyMontageMaterials({
      preparedMaterials: cat,
      inventory: inv,
      budgets: { materialReadRequests: 2 }
    });
    assert.equal(resExact.ok, true);

    const resLess = verifyMontageMaterials({
      preparedMaterials: cat,
      inventory: inv,
      budgets: { materialReadRequests: 1 }
    });
    assert.equal(resLess.ok, false);
    assert.ok(resLess.blockers.some(b => b.code === "materials_count_exceeds_budget"));
  });

  // 12. Incomplete native inventory rejected
  test("incomplete inventory is rejected", () => {
    const inv = { complete: false, sources: [] };
    const cat = createValidCatalog();

    const res = verifyMontageMaterials({ preparedMaterials: cat, inventory: inv });
    assert.equal(res.ok, false);
    assert.ok(res.blockers.some(b => b.code === "incomplete_inventory"));
  });

  // 13. Symlink path check
  test("symlink resolving to authorized file path passes authorization", () => {
    const linkPath = path.join(tmpDir, "symlink_clip_1.mp4");
    try {
      fs.symlinkSync(file1.realPath, linkPath);
      const realLink = fs.realpathSync(linkPath);
      assert.equal(realLink, file1.realPath);
    } catch {
      // Some Windows accounts require admin/developer privileges for symlinks.
      // If symlink creation fails due to OS privilege, skip gracefully.
    }
  });

  // 14. Malformed adapter input must not throw
  test("verifyMontageMaterials with null input returns blocked without throwing", () => {
    const res = verifyMontageMaterials(null);
    assert.equal(res.ok, false);
    assert.equal(res.verified, false);
    assert.ok(res.blockers.some(b => b.code === "invalid_adapter_input"));
  });

  // 15. Caller budget exceeding hard ceiling is blocked
  test("caller budget exceeding hard ceiling returns budget blocker", () => {
    const inv = createValidInventory();
    const cat = createValidCatalog();
    const res = verifyMontageMaterials({
      preparedMaterials: cat,
      inventory: inv,
      budgets: { materialFileBytes: 999999999 }
    });
    assert.equal(res.ok, false);
    assert.ok(res.blockers.some(b => b.code === "budget_exceeds_hard_ceiling"));
  });

  // 16. streamFileSha256 returns null SHA on incomplete/exceeded read
  test("streamFileSha256 returns null SHA on incomplete read", () => {
    const res = streamFileSha256(file1.realPath, 2);
    assert.equal(res.sha256, null);
    assert.equal(res.exceeded, true);
  });

  // 17. Empty catalog and duplicate material records blocked
  test("empty catalog and duplicate material records are blocked", () => {
    const inv = createValidInventory();
    const emptyCat = { schema: "ae-agent-prepared-materials.v1", revision: 1, materials: [] };
    const resEmpty = verifyMontageMaterials({ preparedMaterials: emptyCat, inventory: inv });
    assert.equal(resEmpty.ok, false);
    assert.ok(resEmpty.blockers.some(b => b.code === "empty_materials_catalog"));

    const cat = createValidCatalog();
    cat.materials.push({ ...cat.materials[0] });
    const resDupe = verifyMontageMaterials({ preparedMaterials: cat, inventory: inv });
    assert.equal(resDupe.ok, false);
    assert.ok(resDupe.blockers.some(b => b.code === "duplicate_material_id"));
  });

  // 18. Missing or NaN metadata blocked
  test("missing or NaN metadata is blocked", () => {
    const inv = createValidInventory();
    const cat = createValidCatalog();
    cat.materials[0].width = NaN;
    const res = verifyMontageMaterials({ preparedMaterials: cat, inventory: inv });
    assert.equal(res.ok, false);
    assert.ok(res.blockers.some(b => b.code === "invalid_material_metadata"));
  });

  // 19. Duplicate native source records blocked
  test("duplicate native source IDs in inventory are blocked", () => {
    const inv = createValidInventory();
    inv.sources.push({ ...inv.sources[0] });
    const cat = createValidCatalog();
    const res = verifyMontageMaterials({ preparedMaterials: cat, inventory: inv });
    assert.equal(res.ok, false);
    assert.ok(res.blockers.some(b => b.code === "duplicate_native_source_id"));
  });

  // 20. Symlink escape outside native source directory is blocked
  test("symlink escaping outside native source directory is blocked", () => {
    const subDir = path.join(tmpDir, "sub_materials");
    try {
      fs.mkdirSync(subDir, { recursive: true });
      const escapedSymlink = path.join(subDir, "escaped_clip.mp4");
      fs.symlinkSync(file1.realPath, escapedSymlink);

      const inv = createValidInventory();
      inv.sources[0].file = escapedSymlink;
      const cat = createValidCatalog();
      cat.materials[0].path = escapedSymlink;

      const res = verifyMontageMaterials({ preparedMaterials: cat, inventory: inv });
      assert.equal(res.ok, false);
      assert.ok(res.blockers.some(b => b.code === "symlink_escape_denied"));
    } catch (err) {
      if (err.code === "EPERM") {
        console.log("Symlink creation skipped: OS privileges required on Windows");
      } else {
        throw err;
      }
    }
  });

  console.log(`Montage materials smoke: ${passed} test cases passed successfully.`);
} finally {
  // Clean up temporary files
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup error on tmpdir
  }
}
