"use strict";

const fs = require("fs");
const path = require("path");

const BOUNDED_PROCESS_RESULT_SCHEMA = "ae-agent.bounded-subprocess-result.v1";
const DEFAULT_TAIL_LINES = 40;
const DEFAULT_TAIL_CHARS = 4000;
const DEFAULT_COMPACT_JSON_MAX_BYTES = 64 * 1024;

function textOf(value) {
  if (!value) return "";
  return typeof value === "string" ? value : value.toString("utf8");
}

function byteLength(value) {
  return Buffer.byteLength(textOf(value), "utf8");
}

function tailLines(value, maxLines = DEFAULT_TAIL_LINES, maxChars = DEFAULT_TAIL_CHARS) {
  const text = textOf(value).trimEnd();
  if (!text) return "";
  const tail = text.split(/\r?\n/).slice(-maxLines).join("\n").trim();
  return tail.length > maxChars ? tail.slice(tail.length - maxChars) : tail;
}

function lineCount(value) {
  const text = textOf(value).trimEnd();
  if (!text) return 0;
  return text.split(/\r?\n/).length;
}

function streamSummary(value, maxLines = DEFAULT_TAIL_LINES) {
  const text = textOf(value);
  const lines = lineCount(text);
  return {
    bytes: byteLength(text),
    lineCount: lines,
    tail: tailLines(text, maxLines),
    tailLineCount: Math.min(lines, maxLines),
    truncated: lines > maxLines,
  };
}

function writeProcessLog(logPath, details) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const stdout = textOf(details.stdout);
  const stderr = textOf(details.stderr);
  fs.writeFileSync(
    logPath,
    [
      `# ${details.label || "subprocess"}`,
      `command: ${details.command || ""}`,
      `startedAt: ${details.startedAt || ""}`,
      `completedAt: ${details.completedAt || ""}`,
      `durationMs: ${details.durationMs ?? ""}`,
      `exitCode: ${details.exitCode ?? details.status ?? ""}`,
      `signal: ${details.signal || ""}`,
      `timedOut: ${details.timedOut === true}`,
      `error: ${details.error || ""}`,
      "",
      "## stdout",
      stdout || "",
      "",
      "## stderr",
      stderr || "",
      "",
    ].join("\n"),
    "utf8",
  );
}

function boundedSpawnSyncResult(result, details) {
  const stdout = streamSummary(result && result.stdout, details.tailLines || DEFAULT_TAIL_LINES);
  const stderr = streamSummary(result && result.stderr, details.tailLines || DEFAULT_TAIL_LINES);
  const timedOut = Boolean(result && result.error && result.error.code === "ETIMEDOUT");
  const exitCode = result ? result.status : null;
  return {
    schema: BOUNDED_PROCESS_RESULT_SCHEMA,
    command: details.command || "",
    completedAt: details.completedAt || null,
    durationMs: details.durationMs ?? null,
    error: result && result.error ? result.error.message : null,
    exitCode,
    label: details.label || null,
    logPath: details.logPath || null,
    ok: exitCode === 0 && !(result && result.error),
    signal: result && result.signal ? result.signal : null,
    startedAt: details.startedAt || null,
    status: exitCode,
    stderr,
    stdout,
    timedOut,
  };
}

function createTailAccumulator(maxLines = DEFAULT_TAIL_LINES) {
  let bytes = 0;
  let lines = [];
  let lineRemainder = "";
  let totalLines = 0;
  return {
    push(chunk) {
      const text = textOf(chunk);
      if (!text) return;
      bytes += Buffer.byteLength(text, "utf8");
      const parts = (lineRemainder + text).split(/\r?\n/);
      lineRemainder = parts.pop() || "";
      for (const line of parts) {
        totalLines += 1;
        lines.push(line.length > DEFAULT_TAIL_CHARS ? line.slice(line.length - DEFAULT_TAIL_CHARS) : line);
      }
      if (lines.length > maxLines) {
        lines = lines.slice(-maxLines);
      }
    },
    summary() {
      const tail = [...lines];
      if (lineRemainder) {
        tail.push(lineRemainder);
      }
      const effectiveLineCount = totalLines + (lineRemainder ? 1 : 0);
      const tailSlice = tail.slice(-maxLines);
      const tailText = tailSlice.join("\n").trim();
      return {
        bytes,
        lineCount: effectiveLineCount,
        tail: tailText.length > DEFAULT_TAIL_CHARS ? tailText.slice(tailText.length - DEFAULT_TAIL_CHARS) : tailText,
        tailLineCount: Math.min(effectiveLineCount, maxLines),
        truncated: effectiveLineCount > maxLines,
      };
    },
  };
}

function readCompactJson(filePath, label, maxBytes = DEFAULT_COMPACT_JSON_MAX_BYTES) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`${label || "compact-json"}-missing:${filePath || "none"}`);
  }
  const stats = fs.statSync(filePath);
  if (!stats.isFile()) {
    throw new Error(`${label || "compact-json"}-not-file:${filePath}`);
  }
  if (stats.size > maxBytes) {
    throw new Error(`${label || "compact-json"}-too-large:${stats.size}>${maxBytes}:${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

module.exports = {
  BOUNDED_PROCESS_RESULT_SCHEMA,
  DEFAULT_COMPACT_JSON_MAX_BYTES,
  DEFAULT_TAIL_LINES,
  boundedSpawnSyncResult,
  byteLength,
  createTailAccumulator,
  readCompactJson,
  streamSummary,
  tailLines,
  textOf,
  writeProcessLog,
};
