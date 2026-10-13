"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { validateAmeMedia, validateAmeMetadata } = require("../mcp-server/ame-media-probe");
const { inspectDxvPacketHeader, inspectRgbaFrame } = require("../mcp-server/dxv-media-evidence");
const { probeMediaFile } = require("./ame-media-probe");
const job = { range: { startSeconds: 0, endSeconds: 60 }, expectedVideoCodec: "h264", expectedContainer: "mp4" };
const metadata = { format: { duration: "60.013", format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
  streams: [{ codec_type: "video", codec_name: "h264" }] };
assert.equal(validateAmeMedia(job, metadata, { status: 0 }).technicalMediaVerified, true);
assert.equal(validateAmeMedia(job, { ...metadata, streams: [{ codec_type: "video", codec_name: "hevc" }] }, { status: 0 }).reason, "video_codec_mismatch");
assert.equal(validateAmeMedia(job, { ...metadata, format: { ...metadata.format, duration: "59.5" } }, { status: 0 }).reason, "duration_mismatch");
assert.equal(validateAmeMedia(job, metadata, { status: 1 }).reason, "decode_failed");
assert.equal(validateAmeMedia({ ...job, expectedVideoCodec: undefined }, metadata, { status: 0 }).reason, "expected_codec_required");
assert.equal(validateAmeMedia({ ...job, expectedContainer: undefined }, metadata, { status: 0 }).reason, "expected_container_required");
assert.equal(validateAmeMedia({ ...job, expectedContainer: "matroska" }, metadata, { status: 0 }).reason, "container_mismatch");
assert.equal(validateAmeMedia({ ...job, maxDurationErrorSeconds: 2 }, metadata, { status: 0 }).reason, "invalid_duration_tolerance");
// Source-derived byte fixtures and injected process results are OFFLINE contract
// tests. No encoder, native app or production output is started by this smoke.
function packet(tag = 0x59473130, version = 4) {
  const bytes = Buffer.alloc(28);
  bytes.writeUInt32LE(tag); bytes[4] = version; bytes[6] = 1; bytes.writeUInt32LE(16, 8);
  return bytes;
}
const yg10 = packet(), dxt5 = packet(0x44585435), noAlpha = packet(0x59434736);
assert.equal(inspectDxvPacketHeader(yg10, yg10.length).textureMode, "YG10");
assert.equal(inspectDxvPacketHeader(dxt5, dxt5.length).textureMode, "DXT5");
assert.equal(inspectDxvPacketHeader(packet(0x44585431), 28).alphaChannel, false);
assert.equal(inspectDxvPacketHeader(noAlpha, 28).alphaChannel, false);
assert.equal(inspectDxvPacketHeader(yg10.subarray(0, 8), 28).reason, "dxv_packet_header_truncated");
assert.equal(inspectDxvPacketHeader(packet(0), 28).reason, "dxv_header_unsupported");
assert.equal(inspectDxvPacketHeader(packet(0x59473130, 5), 28).reason, "dxv_version_unsupported");
assert.equal(inspectDxvPacketHeader(yg10, 29).reason, "dxv_packet_size_mismatch");
const rgba = Buffer.from([0, 0, 0, 0, 255, 255, 255, 255]);
const alpha = inspectRgbaFrame(rgba, 2, 1, 0);
assert.equal(alpha.transparentBackgroundAndForeground, true);
assert.equal(alpha.textIdentityVerified, false);
assert.equal(inspectRgbaFrame(Buffer.alloc(8, 255), 2, 1, 0).transparentBackgroundAndForeground, false);
assert.equal(inspectRgbaFrame(Buffer.alloc(8), 2, 1, 0).transparentBackgroundAndForeground, false);
assert.equal(inspectRgbaFrame(rgba.subarray(0, 4), 2, 1, 0).ok, false);
const dxvJob = { ...job, expectedVideoCodec: "dxv", expectedContainer: "mov", requireAlpha: true,
  expectedWidth: 2, expectedHeight: 1, expectedFrameRate: "1/30", expectedFrameCount: 2 };
const dxvMetadata = { format: { duration: "60", format_name: "mov" }, streams: [{ codec_type: "video",
  codec_name: "dxv", width: 2, height: 1, avg_frame_rate: "1/30", nb_read_frames: "2", pix_fmt: "rgba" }] };
const evidence = { mediaSha256: "a".repeat(64), mediaStable: true,
  dxv: { supported: true, allPacketsInspected: true, alphaChannel: true }, alphaFrames: [alpha] };
assert.equal(validateAmeMedia(dxvJob, dxvMetadata, { status: 0 }).reason, "dxv_packet_evidence_required");
assert.equal(validateAmeMedia(dxvJob, dxvMetadata, { status: 0 }, evidence).actualAlphaVerified, true);
assert.equal(validateAmeMedia(dxvJob, dxvMetadata, { status: 0 }, { ...evidence, alphaFrames: [] }).reason, "actual_alpha_unverified");
assert.equal(validateAmeMedia(dxvJob, dxvMetadata, { status: 0 }, { ...evidence, dxv: { ...evidence.dxv, alphaChannel: false } }).reason, "actual_alpha_unverified");
assert.equal(validateAmeMedia(dxvJob, dxvMetadata, { status: 0 }, { ...evidence, mediaStable: false }).reason, "stable_media_hash_required");
assert.equal(validateAmeMedia(dxvJob, dxvMetadata, { status: 1 }, evidence).reason, "decode_failed");
assert.equal(validateAmeMetadata({ ...dxvJob, expectedWidth: 3 }, dxvMetadata).reason, "dimensions_mismatch");
assert.equal(validateAmeMetadata({ ...dxvJob, expectedFrameRate: 30 }, dxvMetadata).reason, "frame_rate_mismatch");
assert.equal(validateAmeMetadata({ ...dxvJob, expectedFrameCount: 3 }, dxvMetadata).reason, "frame_count_mismatch");
assert.equal(validateAmeMetadata({ ...dxvJob, requireAlpha: "true" }, dxvMetadata).reason, "invalid_media_requirement");
const hq = validateAmeMedia({ ...dxvJob, requireDxvHighQuality: true }, dxvMetadata, { status: 0 },
  { ...evidence, highQuality: true, highQualityVerified: true });
assert.equal(hq.reason, "dxv_hq_calibration_required");
assert.equal(hq.highQualityVerified, false);
assert.equal(hq.hqComparisonEligible, true);

const scratchRoot = path.resolve(__dirname, "../.codex-runtime");
fs.mkdirSync(scratchRoot, { recursive: true });
const scratch = fs.mkdtempSync(path.join(scratchRoot, "media-probe-unit-"));
try {
  const outputPath = path.join(scratch, "source-derived-packets.bin");
  fs.writeFileSync(outputPath, Buffer.concat([yg10, yg10]));
  let opaque = false, badDecode = false, changed = false, badCount = false;
  const runner = (_program, args) => {
    if (args.includes("-show_packets")) return { status: 0, stdout: JSON.stringify({ packets: [{ pos: "0", size: "28" }, { pos: "28", size: "28" }] }) };
    if (args.includes("-count_frames")) return { status: 0, stdout: JSON.stringify(dxvMetadata) };
    if (args.includes("-version")) return { status: 0, stdout: "OFFLINE injected decoder fixture" };
    if (args.includes("debug")) return { status: 0, stderr: "RAW compression with YG10 texture (version 3.0)" };
    if (args.includes("-vf")) return { status: 0, stdout: Buffer.concat([opaque ? Buffer.alloc(8, 255) : rgba, rgba]) };
    if (changed) fs.writeFileSync(outputPath, Buffer.concat([dxt5, dxt5]));
    return { status: badDecode ? 1 : 0, stdout: `frame=${badCount ? 1 : 2}\nprogress=end\n`, stderr: badDecode ? "invalid data" : "" };
  };
  const fullJob = { ...dxvJob, outputPath, alphaFrameIndices: [0, 1], requireDxvHighQuality: true };
  let checked = probeMediaFile(fullJob, { run: runner });
  assert.equal(checked.reason, "dxv_hq_calibration_required");
  assert.equal(checked.hqComparisonEligible, true);
  assert.equal(checked.mediaEvidence.decoder.dxvMessages.length, 1);
  assert.equal(checked.mediaEvidence.dxv.modes[0].textureMode, "YG10");
  assert.match(checked.mediaEvidence.mediaSha256, /^[a-f0-9]{64}$/);
  opaque = true;
  assert.equal(probeMediaFile(fullJob, { run: runner }).reason, "actual_alpha_unverified");
  opaque = false; badDecode = true;
  assert.equal(probeMediaFile(fullJob, { run: runner }).reason, "decode_failed");
  badDecode = false; badCount = true;
  assert.equal(probeMediaFile(fullJob, { run: runner }).reason, "full_decode_frame_count_mismatch");
  badCount = false; changed = true;
  assert.equal(probeMediaFile(fullJob, { run: runner }).reason, "media_changed_during_probe");
} finally {
  assert.ok(path.resolve(scratch).startsWith(scratchRoot + path.sep));
  fs.rmSync(scratch, { recursive: true, force: true });
}
console.log(JSON.stringify({ ok: true, evidenceKind: "offline_source_and_injected_fixtures", realDxvFixture: false,
  highQualityCalibrationVerified: false, checks: "codec/container/timing/dimensions/fps/frame count/full decode; DXV3 headers; actual transparent+foreground pixels; fail-closed HQ; stable media hash" }));
