"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const MAX_FILE_BYTES = 128 * 1024 * 1024;
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELDS = ["input_tokens", "cached_input_tokens", "output_tokens", "reasoning_output_tokens"];

function findRollouts(root, ids) {
  const pending = new Set(ids);
  const found = new Map();
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        const id = [...pending].find((value) => entry.name.endsWith(`${value}.jsonl`));
        if (id) {
          if (found.has(id)) throw new Error(`duplicate_rollout:${id}`);
          found.set(id, full);
        }
      }
    }
  };
  visit(root);
  for (const id of ids) if (!found.has(id)) throw new Error(`rollout_missing:${id}`);
  return found;
}

function validUsage(value) {
  if (!value || !FIELDS.every((key) => Number.isSafeInteger(value[key]) && value[key] >= 0)) return false;
  return value.cached_input_tokens <= value.input_tokens && value.reasoning_output_tokens <= value.output_tokens;
}

async function readRollout(file, expectedId) {
  if (fs.statSync(file).size > MAX_FILE_BYTES) throw new Error(`rollout_too_large:${expectedId}`);
  const turns = new Map();
  const records = new Map();
  let sessionId = null;
  let parentThreadId = null;
  const input = fs.createReadStream(file, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      let row;
      try { row = JSON.parse(line); } catch { throw new Error(`invalid_jsonl:${expectedId}`); }
      if (row.type === "session_meta") {
        if (sessionId) throw new Error(`duplicate_session_meta:${expectedId}`);
        sessionId = row.payload && (row.payload.id || row.payload.session_id);
        parentThreadId = row.payload && (row.payload.parent_thread_id || null);
      } else if (row.type === "turn_context") {
        const p = row.payload || {};
        if (typeof p.turn_id === "string" && typeof p.model === "string") turns.set(p.turn_id, {
          model: p.model, effort: typeof p.effort === "string" ? p.effort : null
        });
      } else if (row.type === "token_usage_record") {
        const p = row.payload || {};
        if (p.thread_id !== expectedId || typeof p.response_id !== "string" || !p.response_id || !validUsage(p.usage)) throw new Error(`invalid_usage_record:${expectedId}`);
        const current = records.get(p.response_id);
        const next = { timestamp: row.timestamp, turnId: p.turn_id, usage: Object.fromEntries(FIELDS.map((key) => [key, p.usage[key]])) };
        if (current && JSON.stringify(current) !== JSON.stringify(next)) throw new Error(`conflicting_response_id:${expectedId}`);
        records.set(p.response_id, next);
      }
    }
  } finally { lines.close(); input.destroy(); }
  if (sessionId !== expectedId) throw new Error(`session_id_mismatch:${expectedId}`);
  return { threadId: expectedId, parentThreadId, turns, records };
}

async function summarizeTask(root, ids) {
  if (!ids.length || new Set(ids).size !== ids.length || ids.some((id) => !ID_PATTERN.test(id))) throw new Error("invalid_thread_ids");
  const files = findRollouts(root, ids);
  const sessions = await Promise.all(ids.map((id) => readRollout(files.get(id), id)));
  const totals = { inputTokens: 0, cachedInputTokens: 0, uncachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0 };
  const models = {};
  let responses = 0;
  let unknownModels = 0;
  for (const session of sessions) for (const record of session.records.values()) {
    const u = record.usage;
    const model = session.turns.get(record.turnId)?.model || null;
    const bucket = model || "unknown";
    if (!model) unknownModels += 1;
    models[bucket] ||= { responses: 0, inputTokens: 0, cachedInputTokens: 0, uncachedInputTokens: 0, outputTokens: 0 };
    models[bucket].responses += 1;
    models[bucket].inputTokens += u.input_tokens;
    models[bucket].cachedInputTokens += u.cached_input_tokens;
    models[bucket].uncachedInputTokens += u.input_tokens - u.cached_input_tokens;
    models[bucket].outputTokens += u.output_tokens;
    totals.inputTokens += u.input_tokens;
    totals.cachedInputTokens += u.cached_input_tokens;
    totals.uncachedInputTokens += u.input_tokens - u.cached_input_tokens;
    totals.outputTokens += u.output_tokens;
    totals.reasoningOutputTokens += u.reasoning_output_tokens;
    responses += 1;
  }
  return {
    schema: "codex-task-ledger.v1", source: "local_codex_token_usage_record", threadIds: ids,
    sessions: sessions.map((s) => ({ threadId: s.threadId, parentThreadId: s.parentThreadId, responses: s.records.size })),
    responses, totals, models, unknownModels,
    taskEstimatePercent: null, estimateStatus: "calibration_unavailable",
    limitations: ["Response usage includes repeated context; cached input is a subset of input.", "Other account activity and model speed are not covered by this ledger."]
  };
}

module.exports = { findRollouts, readRollout, summarizeTask };
