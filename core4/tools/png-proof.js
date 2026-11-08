'use strict';

// Pure checks extracted from the byte-pinned legacy generated-png-proof.js.
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
const DEFAULT_MAX_PNG_BYTES = 64 * 1024 * 1024; // 64 MB cap
const IHDR_DATA_LENGTH = 13;
const VALID_BIT_DEPTHS = new Set([1, 2, 4, 8, 16]);
const VALID_COLOR_TYPES = new Set([0, 2, 3, 4, 6]);

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

module.exports = { DEFAULT_MAX_PNG_BYTES, inspectPngBuffer, sameFileSnapshot };
