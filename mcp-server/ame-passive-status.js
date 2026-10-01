"use strict";

const path = require("node:path");

const isTime = (value) => typeof value === "number" && Number.isFinite(value);
const isText = (value) => typeof value === "string" && value.trim().length > 0;
const validDate = (value) => isText(value) && Number.isFinite(Date.parse(value));

function validJob(job) {
  return job && job.schema === "ae-agent-ame-job.v1" && isText(job.jobId)
    && isText(job.preset) && isText(job.outputPath) && path.isAbsolute(job.outputPath)
    && job.range && isTime(job.range.startSeconds) && isTime(job.range.endSeconds)
    && job.range.startSeconds >= 0 && job.range.endSeconds > job.range.startSeconds
    && validDate(job.submittedAt);
}

function sameJob(job, other) {
  return other && other.jobId === job.jobId && other.preset === job.preset
    && other.outputPath === job.outputPath && other.range
    && other.range.startSeconds === job.range.startSeconds
    && other.range.endSeconds === job.range.endSeconds;
}

function validFile(file) {
  return !file || file.exists === false || (file.exists === true
    && Number.isSafeInteger(file.bytes) && file.bytes >= 0 && validDate(file.modifiedAt));
}

function evaluateAmePassiveStatus(job, observation, file, previous, now = Date.now()) {
  if (!validJob(job)) return { ok: false, state: "needs_review", reason: "invalid_job_contract" };
  if (!isTime(now)) return { ok: false, state: "needs_review", reason: "invalid_observation_time" };
  if (previous && (!sameJob(job, previous.job) || !validDate(previous.checkedAt)
    || Date.parse(previous.checkedAt) > now || Date.parse(previous.checkedAt) < Date.parse(job.submittedAt)
    || !validFile(previous.file))) {
    return { ok: false, state: "needs_review", reason: "previous_snapshot_mismatch" };
  }
  let reportedAmeStatus = null;
  if (observation) {
    if (!sameJob(job, observation) || !["queued", "running", "done", "failed", "canceled"].includes(observation.status)
      || !validDate(observation.observedAt) || Date.parse(observation.observedAt) < Date.parse(job.submittedAt)
      || Date.parse(observation.observedAt) > now + 60000) {
      return { ok: false, state: "needs_review", reason: "ame_observation_mismatch" };
    }
    reportedAmeStatus = observation.status;
  }
  const exists = !!file && file.exists === true;
  if (!validFile(file)) {
    return { ok: false, state: "needs_review", reason: "invalid_file_evidence" };
  }
  if (exists && Date.parse(file.modifiedAt) < Date.parse(job.submittedAt)) {
    return { ok: false, state: "needs_review", reason: "stale_output_file" };
  }
  const priorBytes = previous && previous.file && previous.file.exists === true ? previous.file.bytes : null;
  const activity = !exists ? "missing" : priorBytes !== null && file.bytes > priorBytes ? "growing"
    : priorBytes !== null && file.bytes < priorBytes ? "shrunk" : "unproven";
  let state = "unknown";
  const observationStale = !!observation && ["queued", "running"].includes(reportedAmeStatus)
    && now - Date.parse(observation.observedAt) > 10 * 60 * 1000;
  if (activity === "shrunk") state = "needs_review";
  else if (reportedAmeStatus === "failed" || reportedAmeStatus === "canceled") state = "needs_review";
  else if (reportedAmeStatus === "done") state = exists ? "needs_media_probe" : "needs_review";
  else if (!observationStale && (reportedAmeStatus === "queued" || reportedAmeStatus === "running")) state = reportedAmeStatus;
  else if (activity === "growing") state = "output_growing";
  return {
    ok: true, state, reportedAmeStatus, observationStale, activity,
    completionVerified: false, job, file: exists ? { exists: true, bytes: file.bytes, modifiedAt: file.modifiedAt } : { exists: false },
    checkedAt: new Date(now).toISOString()
  };
}

module.exports = { evaluateAmePassiveStatus };
