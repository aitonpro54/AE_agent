"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
const DEFAULT_MAX_PNG_BYTES = 64 * 1024 * 1024; // 64 MB cap
const IHDR_DATA_LENGTH = 13;
const VALID_BIT_DEPTHS = new Set([1, 2, 4, 8, 16]);
const VALID_COLOR_TYPES = new Set([0, 2, 3, 4, 6]);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Checks a complete PNG envelope. CRC and image decoding are intentionally
 * outside this bounded file-completion proof.
 *
 * Requirements:
 * - PNG signature matches exact 8-byte magic.
 * - First chunk is IHDR with width > 0, height > 0, and valid color/compression headers.
 * - Safe chunk bounds: chunk length must not exceed buffer bounds.
 * - At least one IDAT chunk is present.
 * - Zero-length IEND chunk strictly at the end with NO trailing bytes.
 */
function inspectPngBuffer(buffer, maxBytes = DEFAULT_MAX_PNG_BYTES) {
  maxBytes = resolveMaxBytes(maxBytes);
  if (!Buffer.isBuffer(buffer)) {
    return { complete: false, reason: "invalid_buffer" };
  }
  if (buffer.length > maxBytes) {
    return { complete: false, reason: "buffer_oversize", byteLength: buffer.length };
  }
  // Minimum length: 8 (sig) + 25 (IHDR) + 12 (IEND) = 45 bytes
  if (buffer.length < 45) {
    return { complete: false, reason: "buffer_too_short", byteLength: buffer.length };
  }
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return { complete: false, reason: "invalid_png_signature" };
  }

  // First chunk must be IHDR
  const firstChunkDataLength = buffer.readUInt32BE(8);
  const firstChunkType = buffer.toString("ascii", 12, 16);
  if (firstChunkType !== "IHDR" || firstChunkDataLength !== IHDR_DATA_LENGTH) {
    return { complete: false, reason: "first_chunk_not_ihdr" };
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const bitDepth = buffer.readUInt8(24);
  const colorType = buffer.readUInt8(25);
  const compressionMethod = buffer.readUInt8(26);
  const filterMethod = buffer.readUInt8(27);
  const interlaceMethod = buffer.readUInt8(28);

  if (width === 0 || height === 0 || width > 0x7fffffff || height > 0x7fffffff) {
    return { complete: false, reason: "invalid_ihdr_dimensions", width, height };
  }
  if (!VALID_BIT_DEPTHS.has(bitDepth) || !VALID_COLOR_TYPES.has(colorType)) {
    return { complete: false, reason: "invalid_ihdr_format", bitDepth, colorType };
  }
  if (compressionMethod !== 0 || filterMethod !== 0 || (interlaceMethod !== 0 && interlaceMethod !== 1)) {
    return { complete: false, reason: "invalid_ihdr_methods" };
  }

  let offset = 8;
  let idatCount = 0;
  let totalChunks = 0;
  let iendFound = false;

  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) {
      return { complete: false, reason: "truncated_chunk_header", offset, byteLength: buffer.length };
    }
    const chunkDataLength = buffer.readUInt32BE(offset);
    if (chunkDataLength > maxBytes || chunkDataLength > 0x7fffffff) {
      return { complete: false, reason: "invalid_chunk_length", chunkDataLength, offset };
    }
    const chunkType = buffer.toString("ascii", offset + 4, offset + 8);
    const chunkTotalSize = 12 + chunkDataLength;
    if (offset + chunkTotalSize > buffer.length) {
      return {
        complete: false,
        reason: "truncated_chunk_data",
        chunkType,
        expectedChunkSize: chunkTotalSize,
        remainingBytes: buffer.length - offset
      };
    }

    totalChunks++;
    if (chunkType === "IDAT") {
      idatCount++;
    } else if (chunkType === "IEND") {
      iendFound = true;
      if (chunkDataLength !== 0) {
        return { complete: false, reason: "invalid_iend_length", chunkDataLength };
      }
      if (offset + chunkTotalSize !== buffer.length) {
        return {
          complete: false,
          reason: "trailing_bytes_after_iend",
          trailingBytes: buffer.length - (offset + chunkTotalSize)
        };
      }
      if (idatCount === 0) {
        return { complete: false, reason: "missing_idat_chunk" };
      }
      return {
        complete: true,
        width,
        height,
        byteLength: buffer.length,
        idatCount,
        totalChunks
      };
    }

    offset += chunkTotalSize;
  }

  if (!iendFound) {
    return { complete: false, reason: "missing_terminal_iend", idatCount, totalChunks };
  }

  return { complete: false, reason: "unknown_png_state" };
}

function resolveMaxBytes(rawMaxBytes) {
  if (rawMaxBytes === undefined || rawMaxBytes === null) {
    return DEFAULT_MAX_PNG_BYTES;
  }
  const n = Number(rawMaxBytes);
  if (!Number.isFinite(n) || n <= 0) {
    return DEFAULT_MAX_PNG_BYTES;
  }
  return Math.min(Math.floor(n), DEFAULT_MAX_PNG_BYTES);
}

function sameFileSnapshot(before, after, byteLength) {
  return Boolean(before && after && before.isFile() && after.isFile() &&
    before.dev === after.dev && before.ino === after.ino &&
    before.size === after.size && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs &&
    (byteLength === undefined || byteLength === after.size));
}

function boundedMilliseconds(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

/**
 * Synchronous verification of an in-memory buffer.
 */
function verifyCompletePngBuffer(buffer, options = {}) {
  const maxBytes = resolveMaxBytes(options.maxBytes);
  const parsed = inspectPngBuffer(buffer, maxBytes);
  if (!parsed.complete) {
    return { ok: false, reason: parsed.reason || "incomplete_png", ...parsed };
  }
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  return {
    ok: true,
    buffer,
    byteLength: buffer.length,
    sha256,
    width: parsed.width,
    height: parsed.height,
    pngComplete: true
  };
}

/**
 * Bounded waiting for a complete, stable PNG file on disk.
 *
 * Verifies file identity/size/mtime before and after read, and observes a
 * short bounded stability interval to ensure the host write has completely
 * finished. All bytes, hash, dimensions, and completion proof are computed
 * from a single accepted Buffer snapshot.
 */
async function waitForCompletePng(filePath, options = {}) {
  if (typeof filePath !== "string" || !filePath.trim()) {
    return { ok: false, reason: "invalid_file_path" };
  }

  const resolvedPath = path.resolve(filePath);
  if (path.extname(resolvedPath).toLowerCase() !== ".png") {
    return { ok: false, reason: "invalid_extension", path: resolvedPath };
  }

  if (options.exportDir) {
    const allowedDir = path.resolve(options.exportDir);
    if (!resolvedPath.startsWith(allowedDir + path.sep) && resolvedPath !== allowedDir) {
      return { ok: false, reason: "path_escape", path: resolvedPath, allowedDir };
    }
  }

  const timeoutMs = boundedMilliseconds(options.timeoutMs === undefined ? 5000 : options.timeoutMs, 5000, 50, 10000);
  const intervalMs = boundedMilliseconds(options.intervalMs === undefined ? 50 : options.intervalMs, 50, 10, 1000);
  const stabilityIntervalMs = boundedMilliseconds(options.stabilityIntervalMs === undefined ? 50 : options.stabilityIntervalMs, 50, 0, 500);
  const maxBytes = resolveMaxBytes(options.maxBytes);
  const minMtimeMs = Number(options.minMtimeMs || 0);

  const startedAt = Date.now();
  const deadline = startedAt + timeoutMs;
  let lastFailureReason = "file_not_found";

  while (Date.now() <= deadline) {
    if (!fs.existsSync(resolvedPath)) {
      lastFailureReason = "file_not_found";
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;
      await delay(Math.min(intervalMs, remainingMs));
      continue;
    }

    let realFilePath = resolvedPath;
    try {
      realFilePath = fs.realpathSync(resolvedPath);
    } catch {
      lastFailureReason = "realpath_failed";
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;
      await delay(Math.min(intervalMs, remainingMs));
      continue;
    }

    if (options.exportDir) {
      let realExportDir = path.resolve(options.exportDir);
      try {
        if (fs.existsSync(realExportDir)) {
          realExportDir = fs.realpathSync(realExportDir);
        }
      } catch {}
      if (!realFilePath.startsWith(realExportDir + path.sep) && realFilePath !== realExportDir) {
        return { ok: false, reason: "path_escape", path: realFilePath, allowedDir: realExportDir };
      }
    }

    let statBefore;
    try {
      statBefore = fs.statSync(resolvedPath);
    } catch {
      lastFailureReason = "stat_failed";
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;
      await delay(Math.min(intervalMs, remainingMs));
      continue;
    }

    if (!statBefore.isFile()) {
      return { ok: false, reason: "not_a_file", path: resolvedPath };
    }
    if (statBefore.size === 0) {
      lastFailureReason = "file_empty";
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;
      await delay(Math.min(intervalMs, remainingMs));
      continue;
    }
    if (statBefore.size > maxBytes) {
      return { ok: false, reason: "file_oversize", byteLength: statBefore.size, path: resolvedPath };
    }
    if (minMtimeMs > 0 && statBefore.mtimeMs < minMtimeMs - 50) {
      lastFailureReason = "stale_file_before_export";
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;
      await delay(Math.min(intervalMs, remainingMs));
      continue;
    }

    let buffer;
    try {
      buffer = fs.readFileSync(resolvedPath);
    } catch {
      lastFailureReason = "read_failed";
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;
      await delay(Math.min(intervalMs, remainingMs));
      continue;
    }

    let statAfter;
    try {
      statAfter = fs.statSync(resolvedPath);
    } catch {
      lastFailureReason = "stat_after_read_failed";
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;
      await delay(Math.min(intervalMs, remainingMs));
      continue;
    }

    // Ensure dev/ino (where available), size, and mtime match
    if (!sameFileSnapshot(statBefore, statAfter, buffer.length)) {
      lastFailureReason = "concurrent_modification";
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;
      await delay(Math.min(intervalMs, remainingMs));
      continue;
    }

    const parsed = inspectPngBuffer(buffer, maxBytes);
    if (!parsed.complete) {
      lastFailureReason = parsed.reason || "incomplete_png";
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;
      await delay(Math.min(intervalMs, remainingMs));
      continue;
    }

    // Bounded stability interval: ensure writer has settled, bounded by deadline
    if (stabilityIntervalMs > 0) {
      const remainingMs = deadline - Date.now();
      if (remainingMs < stabilityIntervalMs) {
        lastFailureReason = "timeout_during_stability";
        break;
      }
      await delay(stabilityIntervalMs);
      let statStable;
      try {
        statStable = fs.statSync(resolvedPath);
      } catch {
        lastFailureReason = "stat_stability_failed";
        const rem = deadline - Date.now();
        if (rem <= 0) break;
        await delay(Math.min(intervalMs, rem));
        continue;
      }
      if (!sameFileSnapshot(statAfter, statStable, buffer.length)) {
        lastFailureReason = "late_append_during_stability";
        const rem = deadline - Date.now();
        if (rem <= 0) break;
        await delay(Math.min(intervalMs, rem));
        continue;
      }
    }

    // Single buffer verification guarantees all proof properties match
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    return {
      ok: true,
      buffer,
      byteLength: buffer.length,
      sha256,
      width: parsed.width,
      height: parsed.height,
      pngComplete: true,
      mtimeMs: statAfter.mtimeMs,
      birthtimeMs: statAfter.birthtimeMs,
      dev: statAfter.dev,
      ino: statAfter.ino,
      path: realFilePath
    };
  }

  return { ok: false, reason: "timeout", lastFailureReason, path: resolvedPath };
}

module.exports = {
  PNG_SIGNATURE,
  DEFAULT_MAX_PNG_BYTES,
  resolveMaxBytes,
  sameFileSnapshot,
  inspectPngBuffer,
  verifyCompletePngBuffer,
  waitForCompletePng
};
