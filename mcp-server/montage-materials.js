"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  MATERIALS_SCHEMA,
  DEFAULT_HARD_CEILINGS,
  isRecord,
  isPositiveInteger,
  isFiniteNumber,
  isSafeId,
  isSha256,
  isAbsolutePath,
  normalizePath,
  normalizeBudgets,
  addBlocker
} = require("./montage-contract");

const CHUNK_SIZE = 64 * 1024; // 64 KiB chunks

/**
 * Checks if a requested file path is authorized against trusted native inventory sources.
 * Caller cannot pass arbitrary paths; only paths exactly matching native footage sources are allowed.
 */
function authorizeMaterialPath({ filePath, sourceItemId, inventory }) {
  if (!isRecord(inventory) || inventory.complete !== true || !Array.isArray(inventory.sources)) {
    return { authorized: false, reason: "incomplete_inventory" };
  }
  if (typeof filePath !== "string" || !isAbsolutePath(filePath)) {
    return { authorized: false, reason: "invalid_file_path" };
  }

  const normalizedInput = normalizePath(filePath);
  const source = inventory.sources.find(s => s.itemId === sourceItemId);
  if (!source) {
    return { authorized: false, reason: "source_not_in_inventory" };
  }
  if (source.type !== "footage") {
    return { authorized: false, reason: "source_not_footage" };
  }
  if (source.hasVideo !== true) {
    return { authorized: false, reason: "source_no_video" };
  }
  if (source.footageMissing !== false) {
    return { authorized: false, reason: "source_footage_missing" };
  }
  if (typeof source.file !== "string" || !isAbsolutePath(source.file)) {
    return { authorized: false, reason: "invalid_source_file_path" };
  }

  const normalizedSourceFile = normalizePath(source.file);
  if (normalizedInput !== normalizedSourceFile) {
    return {
      authorized: false,
      reason: "arbitrary_path_denied",
      details: { inputPath: filePath, authorizedPath: source.file }
    };
  }

  return { authorized: true, source };
}

/**
 * Computes full streaming SHA256 of a file in bounded chunks.
 * Enforces maximum byte limits.
 * Returns { sha256, totalBytes, exceeded } where sha256 is null if exceeded or incomplete.
 */
function streamFileSha256(fileOrFd, maxBytes = Infinity) {
  const isFd = typeof fileOrFd === "number";
  let fd;
  try {
    fd = isFd ? fileOrFd : fs.openSync(fileOrFd, "r");
  } catch (err) {
    return { sha256: null, totalBytes: 0, exceeded: false, error: err.message };
  }

  const hasher = crypto.createHash("sha256");
  const chunkSize = Number.isFinite(maxBytes) && maxBytes < CHUNK_SIZE ? Math.max(1, maxBytes + 1) : CHUNK_SIZE;
  const buffer = Buffer.alloc(Math.min(CHUNK_SIZE, chunkSize));
  let totalBytes = 0;
  let bytesRead = 0;
  let exceeded = false;

  try {
    let position = isFd ? 0 : null;
    while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length, position)) > 0) {
      if (position !== null) position += bytesRead;
      totalBytes += bytesRead;
      if (totalBytes > maxBytes) {
        exceeded = true;
        break;
      }
      hasher.update(buffer.subarray(0, bytesRead));
    }
  } catch (err) {
    return { sha256: null, totalBytes, exceeded: false, error: err.message };
  } finally {
    if (!isFd) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
  }

  return {
    sha256: exceeded ? null : hasher.digest("hex"),
    totalBytes,
    exceeded
  };
}

/**
 * Material adapter: verifies prepared materials against trusted native inventory and filesystem.
 * Enforces native source authorization BEFORE reading bytes.
 * Validates realpath, containment, file budgets, full SHA256, pre/fd/post stat identity, and native metadata.
 */
function verifyMontageMaterials(input = {}) {
  const blockers = [];
  let budgets = DEFAULT_HARD_CEILINGS;

  const blockedResponse = () => ({
    ok: false,
    verified: false,
    catalogRevision: null,
    verifiedMaterials: [],
    blockers,
    budgets
  });

  if (!isRecord(input)) {
    addBlocker(blockers, "invalid_adapter_input", "input");
    return blockedResponse();
  }

  const norm = normalizeBudgets(input.budgets);
  if (norm.blockers.length > 0) {
    for (const b of norm.blockers) blockers.push(b);
    return blockedResponse();
  }
  budgets = norm.budgets;

  const { preparedMaterials, inventory } = input;

  if (!isRecord(preparedMaterials)) {
    addBlocker(blockers, "invalid_prepared_materials_container", "preparedMaterials");
    return blockedResponse();
  }

  if (preparedMaterials.schema !== MATERIALS_SCHEMA) {
    addBlocker(blockers, "invalid_materials_schema", "preparedMaterials.schema");
    return blockedResponse();
  }

  if (!isPositiveInteger(preparedMaterials.revision)) {
    addBlocker(blockers, "invalid_materials_revision", "preparedMaterials.revision");
    return blockedResponse();
  }

  if (!Array.isArray(preparedMaterials.materials)) {
    addBlocker(blockers, "invalid_materials_collection", "preparedMaterials.materials");
    return blockedResponse();
  }

  if (preparedMaterials.materials.length === 0) {
    addBlocker(blockers, "empty_materials_catalog", "preparedMaterials.materials");
    return blockedResponse();
  }

  const allowedMaterialCount = Math.min(budgets.materials, budgets.materialReadRequests);
  if (preparedMaterials.materials.length > allowedMaterialCount) {
    addBlocker(blockers, "materials_count_exceeds_budget", "preparedMaterials.materials", {
      limit: allowedMaterialCount,
      count: preparedMaterials.materials.length
    });
    return blockedResponse();
  }

  if (!isRecord(inventory) || inventory.complete !== true || !Array.isArray(inventory.sources)) {
    addBlocker(blockers, "incomplete_inventory", "inventory");
    return blockedResponse();
  }

  // Preflight: check duplicate material records and duplicate native source records
  const seenMaterialIds = new Set();
  const seenMaterialSourceIds = new Set();
  for (let i = 0; i < preparedMaterials.materials.length; i++) {
    const mat = preparedMaterials.materials[i];
    if (!isRecord(mat)) continue;
    if (seenMaterialIds.has(mat.materialId)) {
      addBlocker(blockers, "duplicate_material_id", `preparedMaterials.materials[${i}].materialId`);
    }
    seenMaterialIds.add(mat.materialId);
    if (seenMaterialSourceIds.has(mat.sourceItemId)) {
      addBlocker(blockers, "duplicate_material_source_item_id", `preparedMaterials.materials[${i}].sourceItemId`);
    }
    seenMaterialSourceIds.add(mat.sourceItemId);
  }

  const seenNativeSourceIds = new Set();
  for (let i = 0; i < inventory.sources.length; i++) {
    const src = inventory.sources[i];
    if (!isRecord(src)) continue;
    if (seenNativeSourceIds.has(src.itemId)) {
      addBlocker(blockers, "duplicate_native_source_id", `inventory.sources[${i}].itemId`);
    }
    seenNativeSourceIds.add(src.itemId);
  }

  if (blockers.length > 0) return blockedResponse();

  let totalCumulativeBytes = 0;
  const verifiedMaterials = [];

  const isValidPositiveFinite = v => typeof v === "number" && Number.isFinite(v) && !Number.isNaN(v) && v > 0;

  for (let i = 0; i < preparedMaterials.materials.length; i++) {
    const material = preparedMaterials.materials[i];
    const pathPrefix = `preparedMaterials.materials[${i}]`;

    if (!isRecord(material) || !isSafeId(material.materialId) || !isPositiveInteger(material.sourceItemId)) {
      addBlocker(blockers, "invalid_material_record", pathPrefix);
      continue;
    }

    if (!isAbsolutePath(material.path)) {
      addBlocker(blockers, "invalid_material_path", `${pathPrefix}.path`);
      continue;
    }

    if (!isSha256(material.sha256)) {
      addBlocker(blockers, "invalid_material_sha256", `${pathPrefix}.sha256`);
      continue;
    }

    if (
      !isValidPositiveFinite(material.width) ||
      !isValidPositiveFinite(material.height) ||
      !isValidPositiveFinite(material.duration) ||
      !isValidPositiveFinite(material.fps) ||
      material.pixelAspect !== 1
    ) {
      addBlocker(blockers, "invalid_material_metadata", pathPrefix);
      continue;
    }

    // 1. Authorization check BEFORE touching filesystem
    const auth = authorizeMaterialPath({
      filePath: material.path,
      sourceItemId: material.sourceItemId,
      inventory
    });

    if (!auth.authorized) {
      addBlocker(blockers, auth.reason, `${pathPrefix}.path`, auth.details);
      continue;
    }

    const source = auth.source;

    if (
      !isValidPositiveFinite(source.width) ||
      !isValidPositiveFinite(source.height) ||
      !isValidPositiveFinite(source.duration) ||
      !isValidPositiveFinite(source.frameRate) ||
      source.pixelAspect !== 1
    ) {
      addBlocker(blockers, "invalid_source_metadata", `${pathPrefix}.sourceItemId`);
      continue;
    }

    // 2. Realpath and symlink containment check
    let realMaterialPath;
    let realSourcePath;
    try {
      realMaterialPath = fs.realpathSync(material.path);
      realSourcePath = fs.realpathSync(source.file);
    } catch (err) {
      addBlocker(blockers, "material_file_not_found", `${pathPrefix}.path`, { error: err.message });
      continue;
    }

    if (normalizePath(realMaterialPath) !== normalizePath(realSourcePath)) {
      addBlocker(blockers, "material_realpath_mismatch", `${pathPrefix}.path`, {
        realMaterial: realMaterialPath,
        realSource: realSourcePath
      });
      continue;
    }

    // Containment within native source directory
    const sourceDir = path.dirname(source.file);
    let realSourceDir;
    try {
      realSourceDir = fs.realpathSync(sourceDir);
    } catch {
      realSourceDir = sourceDir;
    }
    const relSource = path.relative(realSourceDir, realMaterialPath);
    if (relSource.startsWith("..") || path.isAbsolute(relSource)) {
      addBlocker(blockers, "symlink_escape_denied", `${pathPrefix}.path`, {
        realPath: realMaterialPath,
        approvedScope: realSourceDir
      });
      continue;
    }

    // 3. Pre-stat check
    let preStat;
    try {
      preStat = fs.statSync(realMaterialPath);
    } catch (err) {
      addBlocker(blockers, "material_stat_failed", `${pathPrefix}.path`, { error: err.message });
      continue;
    }

    if (!preStat.isFile()) {
      addBlocker(blockers, "material_not_a_file", `${pathPrefix}.path`);
      continue;
    }

    if (preStat.size !== material.byteLength) {
      addBlocker(blockers, "material_byte_length_mismatch", `${pathPrefix}.byteLength`, {
        declared: material.byteLength,
        actual: preStat.size
      });
      continue;
    }

    if (preStat.size > budgets.materialFileBytes) {
      addBlocker(blockers, "material_file_bytes_exceeds_budget", `${pathPrefix}.byteLength`, {
        limit: budgets.materialFileBytes,
        size: preStat.size
      });
      continue;
    }

    totalCumulativeBytes += preStat.size;
    if (totalCumulativeBytes > budgets.materialTotalBytes) {
      addBlocker(blockers, "material_total_bytes_exceeds_budget", "preparedMaterials.materials", {
        limit: budgets.materialTotalBytes,
        totalBytes: totalCumulativeBytes
      });
      break;
    }

    // 4. Open fd and verify identity against preStat
    let fd;
    try {
      fd = fs.openSync(realMaterialPath, "r");
    } catch (err) {
      addBlocker(blockers, "material_open_failed", `${pathPrefix}.path`, { error: err.message });
      continue;
    }

    let fdStat;
    try {
      fdStat = fs.fstatSync(fd);
    } catch (err) {
      try { fs.closeSync(fd); } catch {}
      addBlocker(blockers, "material_fstat_failed", `${pathPrefix}.path`, { error: err.message });
      continue;
    }

    if (
      preStat.dev !== fdStat.dev ||
      preStat.ino !== fdStat.ino ||
      preStat.size !== fdStat.size ||
      preStat.mtimeMs !== fdStat.mtimeMs
    ) {
      try { fs.closeSync(fd); } catch {}
      addBlocker(blockers, "material_changed_during_open", `${pathPrefix}.path`, {
        pre: { dev: preStat.dev, ino: preStat.ino, size: preStat.size, mtimeMs: preStat.mtimeMs },
        fd: { dev: fdStat.dev, ino: fdStat.ino, size: fdStat.size, mtimeMs: fdStat.mtimeMs }
      });
      continue;
    }

    // 5. Streaming SHA256 computation using the opened fd
    const streamResult = streamFileSha256(fd, budgets.materialFileBytes);
    try { fs.closeSync(fd); } catch {}

    if (streamResult.error) {
      addBlocker(blockers, "material_read_error", `${pathPrefix}.path`, { error: streamResult.error });
      continue;
    }

    if (streamResult.exceeded) {
      addBlocker(blockers, "material_file_bytes_exceeds_budget", `${pathPrefix}.byteLength`, {
        limit: budgets.materialFileBytes,
        readBytes: streamResult.totalBytes
      });
      continue;
    }

    if (streamResult.totalBytes !== preStat.size || streamResult.totalBytes !== material.byteLength) {
      addBlocker(blockers, "material_stream_length_mismatch", `${pathPrefix}.byteLength`, {
        streamed: streamResult.totalBytes,
        statSize: preStat.size,
        declared: material.byteLength
      });
      continue;
    }

    // 6. Post-stat and post-realpath check for concurrent drift / mutation during read
    let postStat;
    let postRealpath;
    try {
      postStat = fs.statSync(realMaterialPath);
      postRealpath = fs.realpathSync(material.path);
    } catch (err) {
      addBlocker(blockers, "material_post_stat_failed", `${pathPrefix}.path`, { error: err.message });
      continue;
    }

    if (normalizePath(postRealpath) !== normalizePath(realMaterialPath)) {
      addBlocker(blockers, "material_retargeted_during_read", `${pathPrefix}.path`, {
        pre: realMaterialPath,
        post: postRealpath
      });
      continue;
    }

    if (
      preStat.dev !== postStat.dev ||
      preStat.ino !== postStat.ino ||
      preStat.size !== postStat.size ||
      preStat.mtimeMs !== postStat.mtimeMs ||
      preStat.ctimeMs !== postStat.ctimeMs
    ) {
      addBlocker(blockers, "material_changed_during_read", `${pathPrefix}.path`, {
        pre: { size: preStat.size, mtimeMs: preStat.mtimeMs },
        post: { size: postStat.size, mtimeMs: postStat.mtimeMs }
      });
      continue;
    }

    // 7. Full SHA256 verification
    if (streamResult.sha256.toLowerCase() !== material.sha256.toLowerCase()) {
      addBlocker(blockers, "material_hash_mismatch", `${pathPrefix}.sha256`, {
        declared: material.sha256,
        computed: streamResult.sha256
      });
      continue;
    }

    // 8. Native metadata check
    const metadataMatch =
      source.width === material.width &&
      source.height === material.height &&
      source.pixelAspect === 1 &&
      material.pixelAspect === 1 &&
      Math.abs(source.duration - material.duration) <= 0.01 &&
      Math.abs(source.frameRate - material.fps) <= 0.01;

    if (!metadataMatch) {
      addBlocker(blockers, "native_material_metadata_mismatch", pathPrefix, {
        source: {
          width: source.width,
          height: source.height,
          pixelAspect: source.pixelAspect,
          duration: source.duration,
          frameRate: source.frameRate
        },
        material: {
          width: material.width,
          height: material.height,
          pixelAspect: material.pixelAspect,
          duration: material.duration,
          fps: material.fps
        }
      });
      continue;
    }

    verifiedMaterials.push({
      materialId: material.materialId,
      sourceItemId: material.sourceItemId,
      verified: true,
      path: realMaterialPath,
      sha256: streamResult.sha256,
      byteLength: postStat.size,
      metadata: {
        width: material.width,
        height: material.height,
        pixelAspect: 1,
        duration: material.duration,
        fps: material.fps
      }
    });
  }

  if (blockers.length > 0) return blockedResponse();

  return {
    ok: true,
    verified: true,
    catalogRevision: preparedMaterials.revision,
    verifiedMaterials,
    blockers: [],
    budgets
  };
}

module.exports = {
  authorizeMaterialPath,
  streamFileSha256,
  verifyMontageMaterials
};
