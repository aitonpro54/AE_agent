"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SCHEMA = "ae-agent-ame-submit-intent.v1";
const RECORD_SCHEMA = "ae-agent-ame-submit-guard.v1";

function normalizedDestination(outputPath) {
  if (typeof outputPath !== "string" || !outputPath.trim() || !path.isAbsolute(outputPath)) return null;
  return path.normalize(outputPath).toLowerCase();
}

function validateIntent(intent) {
  return !!(intent && intent.schema === SCHEMA && typeof intent.sourcePath === "string"
    && path.isAbsolute(intent.sourcePath) && typeof intent.sourceIdentity === "string"
    && intent.sourceIdentity.trim() && typeof intent.preset === "string" && intent.preset.trim()
    && normalizedDestination(intent.outputPath) && intent.range
    && Number.isFinite(intent.range.startSeconds) && intent.range.startSeconds >= 0
    && Number.isFinite(intent.range.endSeconds)
    && intent.range.endSeconds > intent.range.startSeconds);
}

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function intentDigest(intent) {
  return digest(JSON.stringify({ sourcePath: path.normalize(intent.sourcePath), sourceIdentity: intent.sourceIdentity,
    preset: intent.preset, outputPath: normalizedDestination(intent.outputPath),
    range: [intent.range.startSeconds, intent.range.endSeconds] }));
}

function guardPath(stateDir, intent) {
  return path.join(stateDir, `${digest(normalizedDestination(intent.outputPath))}.json`);
}

function existingReservation(file, intent) {
  let record;
  try { record = JSON.parse(fs.readFileSync(file, "utf8")); } catch (_) {
    return { ok: false, blocked: true, reason: "unreadable_reservation" };
  }
  if (!record || record.schema !== RECORD_SCHEMA || record.destination !== normalizedDestination(intent.outputPath)
    || record.state !== "unknown_outcome" || typeof record.intentDigest !== "string") {
    return { ok: false, blocked: true, reason: "invalid_reservation" };
  }
  return { ok: true, blocked: true,
    reason: record.intentDigest === intentDigest(intent) ? "duplicate_submit_blocked" : "destination_reserved_different_intent",
    reservedAt: record.reservedAt, attemptId: record.attemptId };
}

function inspectSubmissionIntent(intent, stateDir) {
  if (!validateIntent(intent) || typeof stateDir !== "string" || !path.isAbsolute(stateDir)) return { ok: false, blocked: true, reason: "invalid_intent_or_state_dir" };
  const file = guardPath(stateDir, intent);
  try {
    fs.accessSync(file, fs.constants.F_OK);
    return existingReservation(file, intent);
  } catch (error) {
    return error && error.code === "ENOENT" ? { ok: true, blocked: false, reason: "unreserved" }
      : { ok: false, blocked: true, reason: "reservation_check_failed" };
  }
}

function reserveSubmissionIntent(intent, stateDir, now = new Date()) {
  if (!validateIntent(intent) || typeof stateDir !== "string" || !path.isAbsolute(stateDir) || !(now instanceof Date) || !Number.isFinite(now.getTime())) {
    return { ok: false, blocked: true, reason: "invalid_intent_or_state_dir" };
  }
  fs.mkdirSync(stateDir, { recursive: true });
  const file = guardPath(stateDir, intent);
  const record = { schema: RECORD_SCHEMA, destination: normalizedDestination(intent.outputPath),
    intentDigest: intentDigest(intent), state: "unknown_outcome", reservedAt: now.toISOString(),
    attemptId: crypto.randomUUID() };
  let fd;
  try {
    fd = fs.openSync(file, "wx");
  } catch (error) {
    if (error && error.code === "EEXIST") return existingReservation(file, intent);
    throw error;
  }
  try {
    fs.writeFileSync(fd, JSON.stringify(record) + "\n", "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  return { ok: true, blocked: false, reason: "reserved_unknown_outcome",
    reservedAt: record.reservedAt, attemptId: record.attemptId };
}

module.exports = { validateIntent, inspectSubmissionIntent, reserveSubmissionIntent };
