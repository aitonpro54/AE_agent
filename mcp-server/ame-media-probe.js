"use strict";

function validateAmeMedia(job, metadata, decode) {
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
  if (!decode || decode.status !== 0 || decode.error) {
    return { technicalMediaVerified: false, reason: "decode_failed", decodeExitCode: decode && decode.status };
  }
  return { technicalMediaVerified: true, reason: null, videoCodec: video.codec_name,
    container: job.expectedContainer,
    durationSeconds: actualDuration, expectedDuration, tolerance };
}

module.exports = { validateAmeMedia };
