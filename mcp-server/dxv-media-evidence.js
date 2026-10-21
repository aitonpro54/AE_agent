"use strict";

// Encoded format mapping from the reviewed FFmpeg n9.0.2 FATE HQwa sample
// and decoder. This does not identify Adobe exporter settings or issue a job
// capability. Native media acceptance additionally requires its own provenance.
// https://github.com/FFmpeg/FFmpeg/blob/n9.0.2/tests/fate/video.mak
// https://github.com/FFmpeg/FFmpeg/blob/n9.0.2/libavcodec/dxv.c
// MKBETAG constants are read as little-endian uint32 by the decoder.
const DXV3_HQ_ALPHA_MAPPING = Object.freeze({
  version: "FFmpeg-n9.0.2-DXV3-YG10-HQ-alpha-v1",
  descriptorSha256: "45fd6a5f73669acded391518c29c1be1a171a2bedd44edb20b9ce5c4b8942fa9",
  exporterEnumMappingVerified: false
});
const MODES = new Map([
  [0x44585431, { textureMode: "DXT1", alphaChannel: false }],
  [0x44585435, { textureMode: "DXT5", alphaChannel: true }],
  [0x59434736, { textureMode: "YCG6", alphaChannel: false }],
  [0x59473130, { textureMode: "YG10", alphaChannel: true }]
]);

function inspectDxvPacketHeader(header, packetBytes) {
  const fail = reason => ({ supported: false, reason });
  if (!Buffer.isBuffer(header) || header.length < 12 || !Number.isSafeInteger(packetBytes) || packetBytes < 13) {
    return fail("dxv_packet_header_truncated");
  }
  const tag = header.readUInt32LE(0), mode = MODES.get(tag);
  if (!mode) return { ...fail("dxv_header_unsupported"), observedTagHex: tag.toString(16).padStart(8, "0") };
  const versionMajor = header[4] - 1, versionMinor = header[5];
  // Positively identify only the current DXV3 header. Legacy and future
  // versions need their own observed fixtures before becoming supported.
  if (versionMajor !== 3) return { ...fail("dxv_version_unsupported"), versionMajor, versionMinor, ...mode };
  const payloadBytes = header.readUInt32LE(8);
  if (payloadBytes !== packetBytes - 12) return fail("dxv_packet_size_mismatch");
  return { supported: true, reason: null, versionMajor, versionMinor, ...mode,
    compression: header[6] ? "RAW" : "texture_specific", rawCopyByte: header[6], unknownHeaderByte: header[7], payloadBytes,
    headerHex: header.subarray(0, 12).toString("hex"), highQualityVerified: false,
    highQualityMapping: "UNVERIFIED", encodedHqAlphaPacket: mode.textureMode === "YG10" };
}

function inspectDxv3HqAlphaInventory(dxv, expectedPacketCount) {
  const fail = reason => ({ eligible: false, reason });
  if (!Number.isSafeInteger(expectedPacketCount) || expectedPacketCount < 1 || !dxv || dxv.supported !== true
    || dxv.allPacketsInspected !== true || dxv.packetCount !== expectedPacketCount || !Array.isArray(dxv.modes)
    || !dxv.modes.length || dxv.modes.length > expectedPacketCount) return fail("dxv_hq_complete_packet_inventory_required");
  let count = 0;
  const keys = new Set();
  for (const row of dxv.modes) {
    if (!row || !Number.isSafeInteger(row.packetCount) || row.packetCount < 1 || row.packetCount > expectedPacketCount - count
      || typeof row.firstHeaderHex !== "string" || !/^[a-f0-9]{24}$/.test(row.firstHeaderHex)) return fail("dxv_hq_packet_inventory_invalid");
    const header = Buffer.from(row.firstHeaderHex, "hex"), parsed = inspectDxvPacketHeader(header, header.readUInt32LE(8) + 12);
    if (!parsed.supported || parsed.versionMajor !== 3 || parsed.textureMode !== "YG10" || !parsed.alphaChannel
      || row.versionMajor !== parsed.versionMajor || row.versionMinor !== parsed.versionMinor || row.textureMode !== parsed.textureMode
      || row.alphaChannel !== parsed.alphaChannel || row.rawCopyByte !== parsed.rawCopyByte || row.unknownHeaderByte !== parsed.unknownHeaderByte)
      return fail("dxv_hq_alpha_format_required");
    const key = `${parsed.versionMajor}.${parsed.versionMinor}/${parsed.textureMode}/${parsed.rawCopyByte}/${parsed.unknownHeaderByte}`;
    if (keys.has(key)) return fail("dxv_hq_packet_inventory_duplicate");
    keys.add(key); count += row.packetCount;
  }
  if (count !== expectedPacketCount || dxv.alphaChannel !== true) return fail("dxv_hq_complete_packet_inventory_required");
  // Headers alone establish eligibility. Complete decode/alpha/file checks are
  // deliberately performed by the media validator, not a caller HQ boolean.
  return { eligible: true, reason: null, mapping: DXV3_HQ_ALPHA_MAPPING };
}

function inspectRgbaFrame(rgba, width, height, frameIndex) {
  const pixels = width * height;
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1
    || !Number.isSafeInteger(pixels) || !Buffer.isBuffer(rgba) || rgba.length !== pixels * 4) {
    return { ok: false, reason: "rgba_frame_size_mismatch", frameIndex };
  }
  let transparentPixels = 0, nonOpaquePixels = 0, foregroundPixels = 0, coloredForegroundPixels = 0;
  let alphaMin = 255, alphaMax = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const alpha = rgba[i + 3];
    alphaMin = Math.min(alphaMin, alpha); alphaMax = Math.max(alphaMax, alpha);
    if (alpha === 0) transparentPixels++;
    if (alpha < 255) nonOpaquePixels++;
    if (alpha > 0) {
      foregroundPixels++;
      if (rgba[i] || rgba[i + 1] || rgba[i + 2]) coloredForegroundPixels++;
    }
  }
  return { ok: true, frameIndex, width, height, pixels, transparentPixels, nonOpaquePixels,
    foregroundPixels, coloredForegroundPixels, alphaMin, alphaMax,
    transparentBackgroundAndForeground: transparentPixels > 0 && foregroundPixels > 0,
    // Pixel statistics cannot identify title text or assess its layout.
    textIdentityVerified: false };
}

module.exports = { inspectDxvPacketHeader, inspectDxv3HqAlphaInventory, inspectRgbaFrame, DXV3_HQ_ALPHA_MAPPING };
