"use strict";

const { inspectDxv3HqAlphaInventory } = require("./dxv-media-evidence");

function frameRate(value) {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?$/.test(value)) return null;
  const [numerator, denominator = "1"] = value.split("/");
  const rate = Number(numerator) / Number(denominator);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

function validateAmeMetadata(job, metadata) {
  if (!job || typeof job.expectedVideoCodec !== "string" || !/^[a-z0-9_]+$/i.test(job.expectedVideoCodec)) {
    return { technicalMediaVerified: false, reason: "expected_codec_required" };
  }
  if (typeof job.expectedContainer !== "string" || !/^[a-z0-9_]+$/i.test(job.expectedContainer)) {
    return { technicalMediaVerified: false, reason: "expected_container_required" };
  }
  const tolerance = job.maxDurationErrorSeconds === undefined ? 0.25 : job.maxDurationErrorSeconds;
  if (typeof tolerance !== "number" || !Number.isFinite(tolerance) || tolerance < 0 || tolerance > 1) {
    return { technicalMediaVerified: false, reason: "invalid_duration_tolerance" };
  }
  const expectedDuration = job.range && job.range.endSeconds - job.range.startSeconds;
  const actualDuration = Number(metadata && metadata.format && metadata.format.duration);
  const containerNames = metadata && metadata.format && typeof metadata.format.format_name === "string"
    ? metadata.format.format_name.split(",") : [];
  const video = metadata && Array.isArray(metadata.streams)
    ? metadata.streams.find((stream) => stream.codec_type === "video") : null;
  if (!video || video.codec_name !== job.expectedVideoCodec) {
    return { technicalMediaVerified: false, reason: "video_codec_mismatch", expectedVideoCodec: job.expectedVideoCodec,
      actualVideoCodec: video ? video.codec_name || null : null };
  }
  if (!containerNames.includes(job.expectedContainer)) {
    return { technicalMediaVerified: false, reason: "container_mismatch",
      expectedContainer: job.expectedContainer, actualContainers: containerNames };
  }
  if (!Number.isFinite(expectedDuration) || !Number.isFinite(actualDuration) || actualDuration <= 0
    || Math.abs(actualDuration - expectedDuration) > tolerance) {
    return { technicalMediaVerified: false, reason: "duration_mismatch", expectedDuration,
      actualDuration: Number.isFinite(actualDuration) ? actualDuration : null, tolerance };
  }
  for (const key of ["requireAlpha", "requireDxv3", "requireDxvHighQuality"]) {
    if (job[key] !== undefined && typeof job[key] !== "boolean") {
      return { technicalMediaVerified: false, reason: "invalid_media_requirement", field: key };
    }
  }
  const dimensions = { width: Number(video.width), height: Number(video.height) };
  for (const [key, actual] of [["expectedWidth", dimensions.width], ["expectedHeight", dimensions.height]]) {
    if (job[key] !== undefined && (!Number.isSafeInteger(job[key]) || job[key] < 1)) {
      return { technicalMediaVerified: false, reason: "invalid_expected_dimensions", field: key };
    }
    if (job[key] !== undefined && actual !== job[key]) {
      return { technicalMediaVerified: false, reason: "dimensions_mismatch", field: key, actual, expected: job[key] };
    }
  }
  const actualFrameRate = frameRate(video.avg_frame_rate);
  if (job.expectedFrameRate !== undefined) {
    const expectedFrameRate = frameRate(job.expectedFrameRate);
    if (!expectedFrameRate) return { technicalMediaVerified: false, reason: "invalid_expected_frame_rate" };
    if (!actualFrameRate || Math.abs(actualFrameRate - expectedFrameRate) > 0.0001) {
      return { technicalMediaVerified: false, reason: "frame_rate_mismatch", actualFrameRate, expectedFrameRate };
    }
  }
  const frameCount = Number(video.nb_read_frames);
  if (job.expectedFrameCount !== undefined) {
    if (!Number.isSafeInteger(job.expectedFrameCount) || job.expectedFrameCount < 1) {
      return { technicalMediaVerified: false, reason: "invalid_expected_frame_count" };
    }
    if (frameCount !== job.expectedFrameCount) return { technicalMediaVerified: false, reason: "frame_count_mismatch",
      frameCount: Number.isSafeInteger(frameCount) ? frameCount : null, expectedFrameCount: job.expectedFrameCount };
  }
  if (video.codec_name === "dxv" && (!Number.isSafeInteger(dimensions.width) || dimensions.width < 1
    || !Number.isSafeInteger(dimensions.height) || dimensions.height < 1 || !actualFrameRate
    || !Number.isSafeInteger(frameCount) || frameCount < 1)) {
    return { technicalMediaVerified: false, reason: "dxv_stream_measurements_required" };
  }
  if ((job.requireDxv3 || job.requireDxvHighQuality) && video.codec_name !== "dxv") {
    return { technicalMediaVerified: false, reason: "dxv_required" };
  }
  const streamDuration = Number(video.duration);
  if (Number.isFinite(streamDuration) && (streamDuration <= 0 || Math.abs(streamDuration - expectedDuration) > tolerance)) {
    return { technicalMediaVerified: false, reason: "video_duration_mismatch", streamDuration, expectedDuration, tolerance };
  }
  return { technicalMediaVerified: true, reason: null, videoCodec: video.codec_name,
    container: job.expectedContainer,
    durationSeconds: actualDuration, expectedDuration, tolerance,
    width: Number.isSafeInteger(dimensions.width) ? dimensions.width : null,
    height: Number.isSafeInteger(dimensions.height) ? dimensions.height : null,
    frameRate: actualFrameRate, frameRateRational: video.avg_frame_rate || null,
    frameCount: Number.isSafeInteger(frameCount) && frameCount > 0 ? frameCount : null,
    reportedFrameCount: video.nb_frames || null, pixelFormat: video.pix_fmt || null };
}

function validateAmeMedia(job, metadata, decode, evidence = {}) {
  const measured = validateAmeMetadata(job, metadata);
  if (!measured.technicalMediaVerified) return measured;
  const fail = reason => ({ ...measured, technicalMediaVerified: false, highQualityVerified: false,
    encodedFormatHqAlphaVerified: false, hqConfigurationVerified: false, frozenParametersVerified: false,
    exporterQualityEnumMappingVerified: false, productionAuthority: false, nativeProvenanceVerified: false,
    highQualityMapping: "UNVERIFIED", hqComparisonEligible: false, reason, mediaEvidence: evidence });
  if (!decode || decode.status !== 0 || decode.error) return { ...fail("decode_failed"), decodeExitCode: decode && decode.status };
  const dxv = evidence.dxv;
  if (measured.videoCodec === "dxv" && (!dxv || !dxv.supported || !dxv.allPacketsInspected)) {
    return fail(dxv && dxv.reason || "dxv_packet_evidence_required");
  }
  const frames = evidence.alphaFrames;
  const alphaVerified = Array.isArray(frames) && frames.length > 0
    && frames.every(frame => frame.ok === true && frame.transparentBackgroundAndForeground === true);
  if (job.requireAlpha && (dxv && !dxv.alphaChannel || !alphaVerified)) return fail("actual_alpha_unverified");
  const hashVerified = typeof evidence.mediaSha256 === "string" && /^[a-f0-9]{64}$/.test(evidence.mediaSha256)
    && evidence.mediaStable === true;
  if (measured.videoCodec === "dxv" && !hashVerified) return fail("stable_media_hash_required");
  const result = { ...measured, fullDecodeVerified: true, actualAlphaVerified: alphaVerified,
    highQualityVerified: false, highQualityMapping: "UNVERIFIED", encodedFormatHqAlphaVerified: false,
    hqConfigurationVerified: false, frozenParametersVerified: false, exporterQualityEnumMappingVerified: false,
    productionAuthority: false, nativeProvenanceVerified: false,
    hqComparisonEligible: measured.videoCodec === "dxv" && hashVerified && dxv.supported
      && dxv.allPacketsInspected && dxv.alphaChannel && alphaVerified,
    mediaEvidence: evidence };
  if (job.requireDxvHighQuality) {
    const classification = inspectDxv3HqAlphaInventory(dxv, measured.frameCount);
    if (!classification.eligible) return { ...result, technicalMediaVerified: false, reason: classification.reason };
    if (!hashVerified) return fail("stable_media_hash_required");
    const full = evidence.fullDecode;
    if (!full || full.exitCode !== 0 || full.error !== null || full.decodedFrames !== measured.frameCount || full.progressEnd !== true)
      return fail("dxv_hq_complete_decode_required");
    const expected = job.alphaFrameIndices === undefined
      ? [...new Set([0.25, 0.5, 0.75].map(fraction => Math.min(measured.frameCount - 1, Math.floor(measured.frameCount * fraction))))]
      : job.alphaFrameIndices;
    if (!Array.isArray(expected) || !expected.length || expected.length > 8 || new Set(expected).size !== expected.length
      || expected.some(index => !Number.isSafeInteger(index) || index < 0 || index >= measured.frameCount)
      || !Array.isArray(frames) || frames.length !== expected.length) return fail("dxv_hq_alpha_coverage_required");
    const seen = new Set();
    for (const frame of frames) {
      if (!frame || !expected.includes(frame.frameIndex) || seen.has(frame.frameIndex) || frame.width !== measured.width || frame.height !== measured.height
        || frame.ok !== true || frame.transparentBackgroundAndForeground !== true || !(frame.transparentPixels > 0) || !(frame.foregroundPixels > 0)
        || frame.alphaMin !== 0 || !(frame.alphaMax > 0)) return fail("dxv_hq_alpha_coverage_required");
      seen.add(frame.frameIndex);
    }
    return { ...result, highQualityVerified: true, encodedFormatHqAlphaVerified: true, highQualityMapping: "ENCODED_FORMAT_VERIFIED",
      encodedFormatMapping: classification.mapping, hqComparisonEligible: true, reason: null };
  }
  return result;
}

module.exports = { validateAmeMedia, validateAmeMetadata, frameRate };
