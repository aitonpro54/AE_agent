"use strict";

// Decoder syntax, not a calibration of Adobe's exporter quality enums:
// https://github.com/FFmpeg/FFmpeg/blob/master/libavcodec/dxv.c
// https://github.com/FFmpeg/FFmpeg/blob/master/libavcodec/dxv.h
// MKBETAG constants are read as little-endian uint32 by the decoder.
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
    compression: header[6] ? "RAW" : "texture_specific", unknownHeaderByte: header[7], payloadBytes,
    headerHex: header.subarray(0, 12).toString("hex"), highQualityVerified: false,
    highQualityMapping: "UNVERIFIED" };
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

module.exports = { inspectDxvPacketHeader, inspectRgbaFrame };
