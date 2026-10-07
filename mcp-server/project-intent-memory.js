"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("node:zlib");
const placeholderProtection = require("./placeholder-protection");

const REPO_ROOT = path.resolve(__dirname, "..");
const MEMORY_SCHEMA = "ae-project-intent-memory.v1";
const MEMORY_ENTRY_SCHEMA = "ae-project-intent-memory-entry.v1";
const PLANNER_USE = "advisory-memory-enabled";
const DEFAULT_MAX_HINTS = 4;
const MAX_PROMPT_SECTION_CHARS = 1800;
const MAX_ENTRIES = 80;
const MAX_ARRAY_ITEMS = 10;
const MAX_ENTRY_TEXT_CHARS = 360;
const MIN_RELEVANCE_SCORE = 4;
const ALLOWED_STATUSES = new Set(["active", "disabled"]);
const ALLOWED_CATEGORIES = new Set([
  "main-comps",
  "protected-assets",
  "naming-convention",
  "generated-prefix",
  "workflow-hint",
  "user-preference",
  "project-hint"
]);
const ALLOWED_CONFIDENCE = new Set(["low", "medium", "high"]);

function defaultMemoryPath() {
  return process.env.AE_PROJECT_INTENT_MEMORY_PATH
    ? path.resolve(process.env.AE_PROJECT_INTENT_MEMORY_PATH)
    : path.join(REPO_ROOT, "registry", "project-intent-memory.json");
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
    : [];
}

function collectStrings(value, output = []) {
  if (typeof value === "string") {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, output));
    return output;
  }
  if (isPlainObject(value)) {
    Object.keys(value).forEach((key) => collectStrings(value[key], output));
  }
  return output;
}

function compactText(value, limit = 180) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text || text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trim()}...`;
}

function compactList(value, limit) {
  return stringArray(value).slice(0, limit);
}

function tokenize(value) {
  const text = collectStrings(value)
    .join(" ")
    .replace(/[_-]+/g, " ")
    .toLowerCase();
  const matches = text.match(/[a-z0-9а-яё]+/gi);
  return matches ? matches.map((item) => item.toLowerCase()) : [];
}

function tokenSet(value) {
  return new Set(tokenize(value));
}

function overlapCount(left, right) {
  let count = 0;
  for (const token of left) {
    if (right.has(token)) count += 1;
  }
  return count;
}

function unsafeTextIssues(text, label) {
  const source = String(text || "");
  const issues = [];
  const checks = [
    {
      code: "provider-secret",
      pattern: /(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY|OPENROUTER_API_KEY|AE_CHATGPT_CONNECTOR_TOKEN|Bearer\s+[A-Za-z0-9._-]{16,}|sk-[A-Za-z0-9_-]{12,}|AIza[0-9A-Za-z_-]{20,})/i
    },
    {
      code: "absolute-path",
      pattern: /(^|[^A-Za-z0-9])(?:[A-Za-z]:[\\/]|\\\\[^\\/\s]+[\\/][^\\/\s]+|\/(?:Users|home|mnt|Volumes|var|tmp|ProgramData|Applications)\/)/
    },
    {
      code: "public-or-tunnel-url",
      pattern: /https?:\/\/(?!127\.0\.0\.1(?::\d+)?(?:\/|$)|localhost(?::\d+)?(?:\/|$))\S+/i
    },
    {
      code: "raw-transcript",
      pattern: /(^|\n)\s*(?:system|user|assistant)\s*:/i
    },
    {
      code: "raw-chat-messages",
      pattern: /"messages"\s*:\s*\[/i
    },
    {
      code: "project-scan-dump",
      pattern: /"(?:projectItems|items|layers)"\s*:\s*\[[\s\S]{600,}\]/i
    }
  ];

  checks.forEach((check) => {
    if (check.pattern.test(source)) {
      issues.push({ label, code: check.code });
    }
  });
  if (source.length > MAX_ENTRY_TEXT_CHARS * 2) {
    issues.push({ label, code: "too-long" });
  }
  return issues;
}

function findUnsafeText(value, label) {
  const strings = collectStrings(value);
  const issues = [];
  strings.forEach((text, index) => {
    unsafeTextIssues(text, `${label}[${index}]`).forEach((issue) => issues.push(issue));
  });
  return issues;
}

function assertNoUnsafeText(value, label) {
  const issues = findUnsafeText(value, label);
  if (issues.length) {
    const summary = issues.map((issue) => `${issue.label}:${issue.code}`).join(", ");
    throw new Error(`${label} contains unsafe memory text: ${summary}`);
  }
}

function assertString(value, label, options = {}) {
  if (typeof value !== "string" || !value.trim()) {
    if (options.required === false) return;
    throw new Error(`${label} must be a non-empty string.`);
  }
  const max = options.max || MAX_ENTRY_TEXT_CHARS;
  if (value.length > max) throw new Error(`${label} is too long (${value.length} > ${max}).`);
}

function assertStringArray(value, label, options = {}) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  const maxItems = options.maxItems || MAX_ARRAY_ITEMS;
  const minItems = options.minItems || 0;
  if (value.length < minItems) throw new Error(`${label} must include at least ${minItems} item(s).`);
  if (value.length > maxItems) throw new Error(`${label} has too many items (${value.length} > ${maxItems}).`);
  value.forEach((item, index) => assertString(item, `${label}[${index}]`, { max: options.maxText || 180 }));
}

function normalizeEntry(entry, existing) {
  const source = isPlainObject(entry) ? entry : {};
  const previous = isPlainObject(existing) ? existing : {};
  const normalized = {
    schema: MEMORY_ENTRY_SCHEMA,
    id: compactText(source.id || previous.id || "", 80),
    status: compactText(source.status || previous.status || "active", 20),
    category: compactText(source.category || previous.category || "project-hint", 40),
    title: compactText(source.title || previous.title || "", 100),
    summary: compactText(source.summary || previous.summary || "", MAX_ENTRY_TEXT_CHARS),
    tags: compactList(source.tags || previous.tags, MAX_ARRAY_ITEMS),
    appliesWhen: compactList(source.appliesWhen || previous.appliesWhen, 5),
    priority: Number.isFinite(Number(source.priority !== undefined ? source.priority : previous.priority))
      ? Math.max(0, Math.min(10, Math.round(Number(source.priority !== undefined ? source.priority : previous.priority))))
      : 5,
    confidence: compactText(source.confidence || previous.confidence || "medium", 20),
    source: {
      kind: compactText(source.source && source.source.kind || previous.source && previous.source.kind || "manual", 40),
      date: compactText(source.source && source.source.date || previous.source && previous.source.date || new Date().toISOString().slice(0, 10), 20),
      reviewed: Boolean(source.source && Object.prototype.hasOwnProperty.call(source.source, "reviewed") ? source.source.reviewed : previous.source && previous.source.reviewed)
    },
    notes: compactList(source.notes || previous.notes, 5)
  };
  return normalized;
}

function validateEntry(entry, index) {
  if (!isPlainObject(entry)) throw new Error(`entries[${index}] must be an object.`);
  if (entry.schema !== MEMORY_ENTRY_SCHEMA) throw new Error(`${entry.id || `entries[${index}]`}: schema must be ${MEMORY_ENTRY_SCHEMA}.`);
  assertString(entry.id, `${entry.id || `entries[${index}]`}.id`, { max: 80 });
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id)) throw new Error(`${entry.id}: id must be kebab-case.`);
  if (!ALLOWED_STATUSES.has(entry.status)) throw new Error(`${entry.id}: unsupported status ${entry.status}.`);
  if (!ALLOWED_CATEGORIES.has(entry.category)) throw new Error(`${entry.id}: unsupported category ${entry.category}.`);
  assertString(entry.title, `${entry.id}.title`, { max: 100 });
  assertString(entry.summary, `${entry.id}.summary`, { max: MAX_ENTRY_TEXT_CHARS });
  assertStringArray(entry.tags, `${entry.id}.tags`, { minItems: 1, maxItems: MAX_ARRAY_ITEMS, maxText: 40 });
  assertStringArray(entry.appliesWhen, `${entry.id}.appliesWhen`, { minItems: 1, maxItems: 5, maxText: 180 });
  if (!Number.isInteger(entry.priority) || entry.priority < 0 || entry.priority > 10) {
    throw new Error(`${entry.id}: priority must be an integer from 0 to 10.`);
  }
  if (!ALLOWED_CONFIDENCE.has(entry.confidence)) throw new Error(`${entry.id}: unsupported confidence ${entry.confidence}.`);
  if (!isPlainObject(entry.source)) throw new Error(`${entry.id}: source must be an object.`);
  assertString(entry.source.kind, `${entry.id}.source.kind`, { max: 40 });
  assertString(entry.source.date, `${entry.id}.source.date`, { max: 20 });
  if (typeof entry.source.reviewed !== "boolean") throw new Error(`${entry.id}: source.reviewed must be boolean.`);
  assertStringArray(entry.notes || [], `${entry.id}.notes`, { maxItems: 5, maxText: 180 });
  assertNoUnsafeText(entry, `${entry.id}: memory entry`);
}

function validateMemoryRegistry(memory) {
  if (!isPlainObject(memory)) throw new Error("Project intent memory must be an object.");
  if (memory.schema !== MEMORY_SCHEMA) throw new Error(`memory.schema must be ${MEMORY_SCHEMA}.`);
  if (memory.entrySchema !== MEMORY_ENTRY_SCHEMA) throw new Error(`memory.entrySchema must be ${MEMORY_ENTRY_SCHEMA}.`);
  assertString(memory.updatedAt, "memory.updatedAt", { max: 40 });
  if (!isPlainObject(memory.policy)) throw new Error("memory.policy must be an object.");
  if (memory.policy.plannerUse !== PLANNER_USE) throw new Error(`memory.policy.plannerUse must be ${PLANNER_USE}.`);
  if (memory.policy.maxPromptChars !== undefined && (!Number.isInteger(memory.policy.maxPromptChars) || memory.policy.maxPromptChars > MAX_PROMPT_SECTION_CHARS)) {
    throw new Error(`memory.policy.maxPromptChars must be an integer <= ${MAX_PROMPT_SECTION_CHARS}.`);
  }
  if (!Array.isArray(memory.entries)) throw new Error("memory.entries must be an array.");
  if (memory.entries.length > MAX_ENTRIES) throw new Error(`memory.entries has too many entries (${memory.entries.length} > ${MAX_ENTRIES}).`);
  const ids = new Set();
  memory.entries.forEach((entry, index) => {
    validateEntry(entry, index);
    if (ids.has(entry.id)) throw new Error(`Duplicate project intent memory id: ${entry.id}`);
    ids.add(entry.id);
  });
  assertNoUnsafeText(memory.policy, "memory.policy");
  return {
    ok: true,
    schema: memory.schema,
    entrySchema: memory.entrySchema,
    entryCount: memory.entries.length,
    activeCount: memory.entries.filter((entry) => entry.status === "active").length
  };
}

function loadMemory(options = {}) {
  if (options.memory) return options.memory;
  const memoryPath = options.memoryPath ? path.resolve(options.memoryPath) : defaultMemoryPath();
  const text = fs.readFileSync(memoryPath, "utf8");
  return JSON.parse(text);
}

function summarizeMemoryRegistry(memory) {
  return {
    schema: memory && memory.schema ? memory.schema : null,
    plannerUse: memory && memory.policy ? memory.policy.plannerUse || null : null,
    entryCount: memory && Array.isArray(memory.entries) ? memory.entries.length : 0,
    activeCount: memory && Array.isArray(memory.entries) ? memory.entries.filter((entry) => entry.status === "active").length : 0
  };
}

function scoreMemoryEntry(entry, promptTokens) {
  if (!entry || entry.status !== "active" || promptTokens.size === 0) return 0;
  let score = 0;
  score += overlapCount(tokenSet(entry.tags || []), promptTokens) * 8;
  score += overlapCount(tokenSet(entry.category || ""), promptTokens) * 4;
  score += overlapCount(tokenSet(entry.title || ""), promptTokens) * 4;
  score += overlapCount(tokenSet(entry.summary || ""), promptTokens) * 3;
  score += overlapCount(tokenSet(entry.appliesWhen || []), promptTokens) * 2;
  if (score <= 0) return 0;
  score += Math.min(4, Math.max(0, Number(entry.priority || 0)));
  if (entry.confidence === "high") score += 2;
  if (entry.confidence === "low") score -= 1;
  return score;
}

function compactMemoryEntry(entry, score) {
  return {
    id: entry.id,
    category: entry.category,
    title: entry.title,
    score,
    tags: compactList(entry.tags, 8),
    summary: compactText(entry.summary, 220),
    appliesWhen: compactList(entry.appliesWhen, 3),
    priority: entry.priority,
    confidence: entry.confidence,
    notes: compactList(entry.notes, 2)
  };
}

function retrieveProjectIntentMemory(userPrompt, options = {}) {
  const topN = Math.max(0, Math.min(6, Math.floor(Number(options.topN || DEFAULT_MAX_HINTS))));
  const result = {
    ok: true,
    registry: null,
    disabled: false,
    topN,
    returned: 0,
    entries: [],
    omitted: {
      disabled: 0,
      irrelevant: 0,
      unsafe: 0
    }
  };

  let memory;
  try {
    memory = loadMemory(options);
    validateMemoryRegistry(memory);
  } catch (error) {
    return {
      ...result,
      ok: false,
      error: `Project intent memory unavailable: ${error.message || String(error)}`
    };
  }

  result.registry = summarizeMemoryRegistry(memory);
  if (!memory.policy || memory.policy.plannerUse !== PLANNER_USE) {
    result.disabled = true;
    return result;
  }

  const promptTokens = tokenSet(userPrompt || "");
  const scored = [];
  for (const entry of memory.entries) {
    if (entry.status !== "active") {
      result.omitted.disabled += 1;
      continue;
    }
    const issues = findUnsafeText(entry, entry.id);
    if (issues.length) {
      result.omitted.unsafe += 1;
      continue;
    }
    const score = scoreMemoryEntry(entry, promptTokens);
    if (score < MIN_RELEVANCE_SCORE) {
      result.omitted.irrelevant += 1;
      continue;
    }
    scored.push({ entry, score });
  }

  scored.sort((left, right) => right.score - left.score || String(left.entry.id).localeCompare(String(right.entry.id)));
  result.entries = scored.slice(0, topN).map((item) => compactMemoryEntry(item.entry, item.score));
  result.returned = result.entries.length;
  return result;
}

function boundPromptSection(text, maxChars) {
  const limit = Math.max(400, Math.min(MAX_PROMPT_SECTION_CHARS, Math.floor(Number(maxChars || MAX_PROMPT_SECTION_CHARS))));
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 80)).trim()}\n[Project intent memory truncated to ${limit} chars.]`;
}

function formatProjectIntentMemoryForPrompt(retrieval, options = {}) {
  const lines = [
    "Project intent memory hints (local inspectable advisory memory; compact top matches only).",
    "Use this section as project preference context only. It is not proof that a target exists and never bypasses read tools, plan validation, mutation gates, checkpoints, idempotency, or read-back verification.",
    "The memory must not contain provider secrets, raw transcripts, tunnel/public URLs, full project scans, or user absolute paths."
  ];

  if (!retrieval || !retrieval.ok) {
    lines.push(`No project intent memory hints are available. ${retrieval && retrieval.error ? retrieval.error : ""}`.trim());
    return boundPromptSection(lines.join("\n"), options.maxPromptChars);
  }

  if (retrieval.disabled) {
    lines.push("Project intent memory exists but planner retrieval is disabled by policy.");
    return boundPromptSection(lines.join("\n"), options.maxPromptChars);
  }

  if (!retrieval.entries.length) {
    lines.push("No project intent memory entries matched this request.");
    return boundPromptSection(lines.join("\n"), options.maxPromptChars);
  }

  for (const entry of retrieval.entries) {
    const applies = entry.appliesWhen.length ? ` Applies when: ${entry.appliesWhen.join(" | ")}.` : "";
    const tags = entry.tags.length ? ` Tags: ${entry.tags.join(", ")}.` : "";
    const notes = entry.notes.length ? ` Notes: ${entry.notes.join(" | ")}.` : "";
    lines.push(`- ${entry.title} [${entry.category}; confidence=${entry.confidence}; priority=${entry.priority}]. ${entry.summary}.${applies}${tags}${notes}`);
  }

  return boundPromptSection(lines.join("\n"), options.maxPromptChars);
}

function buildProjectIntentMemoryForPrompt(userPrompt, options = {}) {
  const retrieval = retrieveProjectIntentMemory(userPrompt, options);
  return {
    retrieval,
    promptSection: formatProjectIntentMemoryForPrompt(retrieval, options)
  };
}

function emptyMemoryRegistry() {
  return {
    schema: MEMORY_SCHEMA,
    entrySchema: MEMORY_ENTRY_SCHEMA,
    updatedAt: new Date().toISOString().slice(0, 10),
    policy: {
      plannerUse: PLANNER_USE,
      maxPromptChars: MAX_PROMPT_SECTION_CHARS,
      maxRetrievedEntries: DEFAULT_MAX_HINTS,
      storageRule: "Local reviewed project intent only; no secrets, raw transcripts, public/tunnel URLs, full project scans, or user absolute paths."
    },
    entries: []
  };
}

function writeMemory(memory, options = {}) {
  const memoryPath = options.memoryPath ? path.resolve(options.memoryPath) : defaultMemoryPath();
  fs.mkdirSync(path.dirname(memoryPath), { recursive: true });
  fs.writeFileSync(memoryPath, `${JSON.stringify(memory, null, 2)}\n`, "utf8");
  return memoryPath;
}

function readProjectIntentMemory(args = {}, options = {}) {
  const memory = loadMemory(options);
  const validation = validateMemoryRegistry(memory);
  const prompt = typeof args.prompt === "string" ? args.prompt : "";
  const retrieval = prompt
    ? retrieveProjectIntentMemory(prompt, { ...options, memory, topN: args.topN })
    : null;
  return {
    ok: true,
    memoryPath: options.memoryPath ? path.resolve(options.memoryPath) : defaultMemoryPath(),
    validation,
    registry: summarizeMemoryRegistry(memory),
    retrieval,
    entries: args.includeEntries === false ? undefined : memory.entries
  };
}

function updateProjectIntentMemory(args = {}, options = {}) {
  if (args.projectState !== undefined || args.acceptedPlaceholders !== undefined || args.allowProtectedChanges !== undefined) {
    return { ok: false, code: "project_state_panel_only", error: "Авторитетное состояние плейсхолдеров меняется только доверенным действием CEP." };
  }
  if (args.confirm !== true) {
    return { ok: false, error: "confirm:true is required to update Project Intent Memory." };
  }
  const action = String(args.action || "upsert").trim();
  let memory;
  try {
    memory = loadMemory(options);
    validateMemoryRegistry(memory);
  } catch (error) {
    if (options.allowCreate === false) {
      return { ok: false, error: error.message || String(error) };
    }
    memory = emptyMemoryRegistry();
  }

  if (action === "upsert") {
    const input = args.entry;
    if (!isPlainObject(input)) return { ok: false, error: "entry object is required for upsert." };
    const existingIndex = memory.entries.findIndex((entry) => entry.id === input.id);
    const existing = existingIndex >= 0 ? memory.entries[existingIndex] : null;
    const normalized = normalizeEntry(input, existing);
    try {
      validateEntry(normalized, existingIndex >= 0 ? existingIndex : memory.entries.length);
    } catch (error) {
      return { ok: false, error: error.message || String(error), issues: findUnsafeText(normalized, normalized.id || "entry") };
    }
    if (existingIndex >= 0) {
      memory.entries[existingIndex] = normalized;
    } else {
      memory.entries.push(normalized);
    }
  } else if (action === "disable") {
    const id = String(args.id || "").trim();
    if (!id) return { ok: false, error: "id is required for disable." };
    const existing = memory.entries.find((entry) => entry.id === id);
    if (!existing) return { ok: false, error: `Project intent memory entry not found: ${id}` };
    existing.status = "disabled";
  } else {
    return { ok: false, error: `Unsupported Project Intent Memory action: ${action}` };
  }

  memory.updatedAt = new Date().toISOString().slice(0, 10);
  let validation;
  try {
    validation = validateMemoryRegistry(memory);
  } catch (error) {
    return { ok: false, error: error.message || String(error), issues: findUnsafeText(memory, "memory") };
  }

  const memoryPath = options.memoryPath ? path.resolve(options.memoryPath) : defaultMemoryPath();
  if (args.dryRun === true || options.dryRun === true) {
    return { ok: true, dryRun: true, memoryPath, validation, registry: summarizeMemoryRegistry(memory) };
  }
  writeMemory(memory, options);
  return { ok: true, dryRun: false, memoryPath, validation, registry: summarizeMemoryRegistry(memory) };
}

const PROJECT_STATE_SCHEMA = "ae-project-intent-runtime.v1";
const reviewService = require("./placeholder-review-service");
const PACKED_REVIEW_SCHEMA="ae-agent-canonical-review-packed.v1";
const MAX_PACKED_STATE_BYTES=2*1024*1024,MAX_REVIEW_LOGICAL_BYTES=16*1024*1024,MAX_STATE_LOGICAL_BYTES=32*1024*1024;
function packedReviewError(code){throw new Error(code);}
function packCanonicalReview(record){
  reviewService.validateReviewRecord(record);
  if(!record.canonicalBinding)return record;
  const raw=Buffer.from(JSON.stringify(record),"utf8");
  if(raw.length>MAX_REVIEW_LOGICAL_BYTES)packedReviewError("canonical_review_logical_size_limit");
  const compressed=zlib.deflateRawSync(raw),payloadBase64=compressed.toString("base64");
  return {schema:PACKED_REVIEW_SCHEMA,codec:"deflate-raw",rawByteLength:raw.length,compressedByteLength:compressed.length,
    rawSha256:reviewService.hash(raw),compressedSha256:reviewService.hash(compressed),payloadBase64};
}
function unpackCanonicalReview(envelope){
  if(!envelope || envelope.schema!==PACKED_REVIEW_SCHEMA)return envelope;
  const keys=["schema","codec","rawByteLength","compressedByteLength","rawSha256","compressedSha256","payloadBase64"];
  if(Object.keys(envelope).length!==keys.length || Object.keys(envelope).some(k=>!keys.includes(k)) || envelope.codec!=="deflate-raw" ||
    !Number.isSafeInteger(envelope.rawByteLength) || envelope.rawByteLength<1 || envelope.rawByteLength>MAX_REVIEW_LOGICAL_BYTES ||
    !Number.isSafeInteger(envelope.compressedByteLength) || envelope.compressedByteLength<1 || envelope.compressedByteLength>MAX_PACKED_STATE_BYTES ||
    !/^[a-f0-9]{64}$/.test(envelope.rawSha256) || !/^[a-f0-9]{64}$/.test(envelope.compressedSha256) || typeof envelope.payloadBase64!=="string" ||
    envelope.payloadBase64.length!==4*Math.ceil(envelope.compressedByteLength/3) || !/^[A-Za-z0-9+/]*={0,2}$/.test(envelope.payloadBase64))packedReviewError("invalid_canonical_review_packed_envelope");
  const compressed=Buffer.from(envelope.payloadBase64,"base64");
  if(compressed.length!==envelope.compressedByteLength || compressed.toString("base64")!==envelope.payloadBase64 || reviewService.hash(compressed)!==envelope.compressedSha256)packedReviewError("canonical_review_packed_hash_mismatch");
  let raw;try{const inflated=zlib.inflateRawSync(compressed,{maxOutputLength:envelope.rawByteLength,info:true});if(inflated.engine.bytesWritten!==compressed.length)packedReviewError("canonical_review_compressed_trailing_bytes");raw=inflated.buffer;}catch(_error){packedReviewError("canonical_review_inflate_budget_or_format");}
  if(raw.length!==envelope.rawByteLength || reviewService.hash(raw)!==envelope.rawSha256)packedReviewError("canonical_review_decoded_hash_mismatch");
  const text=raw.toString("utf8");if(!Buffer.from(text,"utf8").equals(raw))packedReviewError("canonical_review_invalid_utf8");
  let record;try{record=JSON.parse(text);}catch(_error){packedReviewError("canonical_review_invalid_json");}
  if(JSON.stringify(record)!==text || !record?.canonicalBinding)packedReviewError("canonical_review_noncanonical_json_or_legacy");
  reviewService.validateReviewRecord(record);return record;
}
function transformReviewStore(store,pack){
  if(!store || !isPlainObject(store.projectState) || Object.keys(store.projectState).length>100)packedReviewError("invalid_project_state_schema");
  let logicalBytes=0;const projectState=Object.create(null);
  for(const [key,state] of Object.entries(store.projectState)){
    if(!/^[a-f0-9]{64}$/.test(key) || !state || !isPlainObject(state))packedReviewError("invalid_project_state");
    if(state.reviewArtifacts!==undefined && (!isPlainObject(state.reviewArtifacts) || Object.keys(state.reviewArtifacts).length>8))packedReviewError("invalid_review_artifact_store");
    const reviews=Object.create(null);
    for(const [owner,value] of Object.entries(state.reviewArtifacts || {})){
      if(!reviewService.OWNER.test(owner))packedReviewError("invalid_review_artifact_owner");
      if(!pack && value?.schema===PACKED_REVIEW_SCHEMA){logicalBytes+=value.rawByteLength;if(logicalBytes>MAX_STATE_LOGICAL_BYTES)packedReviewError("project_state_logical_size_limit");}
      const record=pack ? value : unpackCanonicalReview(value);
      if(pack || value?.schema!==PACKED_REVIEW_SCHEMA){logicalBytes+=Buffer.byteLength(JSON.stringify(record),"utf8");if(logicalBytes>MAX_STATE_LOGICAL_BYTES)packedReviewError("project_state_logical_size_limit");}
      reviews[owner]=pack ? packCanonicalReview(record) : record;
    }
    projectState[key]={...state,...(state.reviewArtifacts!==undefined ? {reviewArtifacts:reviews} : {})};
  }
  const logical={...store,projectState};
  if(!pack && Buffer.byteLength(JSON.stringify(logical),"utf8")>MAX_STATE_LOGICAL_BYTES)packedReviewError("project_state_logical_size_limit");
  return logical;
}
function projectStatePath(options = {}) {
  return options.statePath ? path.resolve(options.statePath) : path.join(
    process.env.AE_BRIDGE_STATE_DIR || path.join(REPO_ROOT, ".codex-runtime", "project-intent"), "project-intent-state.json");
}
function canonicalSavedProject(file) {
  if (typeof file !== "string" || !file.trim() || !(path.win32.isAbsolute(file) || path.posix.isAbsolute(file))) {
    const error = new Error("Для принятия плейсхолдера требуется идентичность сохранённого проекта; AEP автоматически не сохраняется.");
    error.code = "project_identity_unavailable";
    throw error;
  }
  let canonical;
  try { canonical = fs.realpathSync(file); } catch (_error) {
    canonical = /^[A-Za-z]:[\\/]|^\\\\/.test(file) ? path.win32.normalize(file) : path.resolve(file);
  }
  return canonical.replace(/\\/g, "/").toLowerCase();
}
function projectStateKey(file) { return crypto.createHash("sha256").update(canonicalSavedProject(file)).digest("hex"); }
function validateProjectStateStore(store) {
  if(store && store.schema===PROJECT_STATE_SCHEMA && ["pendingLifecycle","lifecycleGeneration","lifecycleReceipts"].some(key=>Object.prototype.hasOwnProperty.call(store,key)))throw new Error("lifecycle_schema_downgrade");
  if (!store || ![PROJECT_STATE_SCHEMA, "ae-project-intent-runtime.v2"].includes(store.schema) || !isPlainObject(store.projectState) ||
    Object.keys(store.projectState).length > 100) throw new Error("invalid_project_state_schema");
  for (const [key, state] of Object.entries(store.projectState)) {
    if (!/^[a-f0-9]{64}$/.test(key) || !state || key !== projectStateKey(state.projectFile) ||
      !Number.isSafeInteger(state.revision) || state.revision < 0 || !Array.isArray(state.acceptedPlaceholders) ||
      state.acceptedPlaceholders.length > 200 || !Array.isArray(state.groupMappings) || state.groupMappings.length > 500) throw new Error("invalid_project_state");
    const targets = new Set();
    if(state.sourceLoadEpochs!==undefined){
      if(!isPlainObject(state.sourceLoadEpochs) || Object.keys(state.sourceLoadEpochs).length>64)throw new Error("invalid_native_source_load_epoch_store");
      for(const [sourceId,epoch] of Object.entries(state.sourceLoadEpochs)){
        if(String(epoch.sourceItemId)!==sourceId)throw new Error("invalid_native_source_load_epoch_identity");
        require("./montage-capture-service").validateLoadEpoch(epoch,state);
      }
    }
    if(state.reviewArtifacts!==undefined) {
      if(!isPlainObject(state.reviewArtifacts) || Object.keys(state.reviewArtifacts).length>8)throw new Error("invalid_review_artifact_store");
      let reviewItems=0;
      for(const [owner,record] of Object.entries(state.reviewArtifacts)) {
        reviewService.validateReviewRecord(record);
        if(owner!==record.owner || record.projectKey!==key)throw new Error("review_artifact_project_mismatch");
        reviewItems+=record.receipt.items.length;
      }
      if(reviewItems>200)throw new Error("review_artifact_item_limit");
    }
    for (const snapshot of state.acceptedPlaceholders) {
      placeholderProtection.validateSnapshot(snapshot);
      const target = placeholderProtection.targetKey(snapshot.target);
      if (targets.has(target)) throw new Error("duplicate_accepted_placeholder");
      targets.add(target);
    }
    const mediaKeys = new Set();
    for (const mapping of state.groupMappings) {
      if (!mapping || typeof mapping.mediaKey !== "string" || !mapping.mediaKey || mapping.mediaKey.length > 4000 ||
        typeof mapping.groupId !== "string" || !mapping.groupId.trim() || mapping.groupId.length > 120 ||
        mapping.provenance !== "user_confirmed" || mapping.confirmed !== true || mediaKeys.has(mapping.mediaKey)) throw new Error("invalid_confirmed_group_mapping");
      mediaKeys.add(mapping.mediaKey);
    }
    if (state.constraints !== null && state.constraints !== undefined) {
      const value = state.constraints;
      if (!value || typeof value.distinctGroups !== "boolean" || typeof value.disallowSourceOverlap !== "boolean" ||
        !Array.isArray(value.selectedTargets) || !value.selectedTargets.length || value.selectedTargets.length > 32 ||
        value.selectedTargets.some(target => !target || !Number.isSafeInteger(target.compItemId) || target.compItemId < 1 || !Number.isSafeInteger(target.layerId) || target.layerId < 1)) throw new Error("invalid_placeholder_constraints");
    }
  }
  return require("./project-lifecycle-transition").validateV2Store(store);
}
function loadProjectStateStore(options = {}) {
  if (options.skipLifecycleReadGuard !== true) require("./project-lifecycle-transition").assertReadableProtectionStore(options);
  const file = projectStatePath(options), io = options.filesystem || fs;
  if (!io.existsSync(file)) return { schema: PROJECT_STATE_SCHEMA, projectState: {} };
  try {
    if (io.statSync(file).size > MAX_PACKED_STATE_BYTES) throw new Error("state_size_limit");
    return validateProjectStateStore(transformReviewStore(JSON.parse(io.readFileSync(file, "utf8")),false));
  } catch (cause) {
    const error = new Error("Project Intent runtime повреждён: " + cause.message);
    error.code = "project_state_corrupt";
    throw error;
  }
}
function readProjectState(projectFile, options = {}) {
  const store = loadProjectStateStore(options); // Corrupt never becomes an empty successful state.
  const key = projectStateKey(projectFile);
  return JSON.parse(JSON.stringify(store.projectState[key] || { projectFile: canonicalSavedProject(projectFile),
    projectKey: key, revision: 0, acceptedPlaceholders: [], groupMappings: [], constraints: null, reviewArtifacts: {} }));
}
function serializeProjectStateStore(store) {
  return JSON.stringify(transformReviewStore(store, true)) + "\n";
}
function atomicProjectStateWrite(store, options = {}) {
  require("./project-lifecycle-transition").assertPolicyWriteAllowed(options);
  validateProjectStateStore(store);
  if(Buffer.byteLength(JSON.stringify(store),"utf8")>MAX_STATE_LOGICAL_BYTES)throw new Error("project_state_logical_size_limit");
  const serialized = serializeProjectStateStore(store);
  if(Buffer.byteLength(serialized,"utf8")>MAX_PACKED_STATE_BYTES)throw new Error("project_state_size_limit");
  const file = projectStatePath(options), io = options.filesystem || fs;
  io.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + "." + crypto.randomUUID() + ".tmp";
  let descriptor;
  try {
    descriptor = io.openSync(temporary, "wx");
    io.writeFileSync(descriptor, serialized, "utf8");
    io.fsyncSync(descriptor);
    io.closeSync(descriptor);
    descriptor = null;
    io.renameSync(temporary, file);
  } finally {
    if (descriptor !== undefined && descriptor !== null) io.closeSync(descriptor);
    if (io.existsSync(temporary)) io.unlinkSync(temporary);
  }
}
// Invalid-proof inherited objects cannot be mutated, cleaned up or re-registered.
// The daemon must call this before its accepted-placeholder empty-state shortcuts.
function checkInheritedOwnershipSteps({ state, inventory, steps = [] }) {
  const rows = state && state.inheritedOwnership || [];
  require("./project-lifecycle-transition").validateInheritedOwnership(rows);
  if (!rows.length) return { ok: true, conflicts: [] };
  const ids = new Set(rows.flatMap(row => row.itemIds)), owners = new Set(rows.map(row => row.owner)), conflicts = [];
  const newItems = new Set(["create_comp", "create_test_comp", "import_footage", "create_project_folder"]);
  const nonItemMutations = new Set(["save_current_named_project","checkpoint_project","backup_project_file","start_edit_session","finish_edit_session"]);
  for (const [index, step] of steps.entries()) {
    const tool = step.tool || step.toolName, args = step.safeArgs || step.args || step.arguments || {};
    if (newItems.has(tool) || nonItemMutations.has(tool)) continue;
    if (!placeholderProtection.TARGET_SETTERS.has(tool)) {
      conflicts.push({index,tool,reason:"inherited_ownership_unknown_mutation_footprint",itemIds:[]});
      continue;
    }
    const referenced = [];
    for (const field of ["itemId", "compItemId", "sourceItemId", "expectedCompItemId", "expectedSourceItemId", "rootCompItemId"]) if (Number.isSafeInteger(args[field])) referenced.push(args[field]);
    for (const field of ["itemIds", "compItemIds"]) if (Array.isArray(args[field])) referenced.push(...args[field]);
    let resolved = referenced.length > 0;
    for (const [field, key] of [["compItemIndex", "itemIndex"], ["sourceItemIndex", "itemIndex"], ["compName", "name"], ["sourceItemName", "name"]]) {
      if (args[field] === undefined) continue;
      if (!inventory || inventory.complete !== true) { resolved = false; break; }
      const items = inventory.items || [...(inventory.comps || []), ...(inventory.sources || [])];
      const matches = items.filter(item => (key === "itemIndex" ? item.itemIndex ?? item.index : item.name) === args[field]);
      if (matches.length !== 1) { resolved = false; break; } referenced.push(matches[0].itemId ?? matches[0].id); resolved = true;
    }
    const ownerConflict = owners.has(args.owner), affected = referenced.filter(id => ids.has(id));
    if (ownerConflict || affected.length || !resolved) conflicts.push({ index, tool, reason: ownerConflict || affected.length ? "inherited_ownership_requires_adoption" : "inherited_ownership_unknown_mutation_footprint", itemIds: affected });
  }
  return { ok: !conflicts.length, code: conflicts.length ? "inherited_ownership_conflict" : null, conflicts };
}
function assertInheritedRegistration(state, owner, itemIds) {
  const rows = state.inheritedOwnership || [];
  if (rows.some(row => row.owner === owner || row.itemIds.some(id => itemIds.includes(id)))) {
    const error = new Error("inherited_ownership_requires_adoption"); error.code = "inherited_ownership_requires_adoption"; throw error;
  }
}
// A server-held capability, not a client confirm/allowProtectedChanges boolean.
// The bridge calls these methods only after authenticating a trusted panel action.
function createProjectStateController(options = {}) {
  function update(projectFile, expectedRevision, mutate) {
    require("./project-lifecycle-transition").assertMutationAllowed(options);
    const store = loadProjectStateStore(options);
    const key = projectStateKey(projectFile);
    const state = store.projectState[key] || readProjectState(projectFile, options);
    if (state.revision !== expectedRevision) {
      const error = new Error("Состояние принятия изменилось во время чтения. Повторите явное действие CEP.");
      error.code = "project_state_revision_changed";
      throw error;
    }
    mutate(state);
    state.revision++;
    store.projectState[key] = state;
    atomicProjectStateWrite(store, options);
    return JSON.parse(JSON.stringify(state));
  }
  return {
    read: projectFile => readProjectState(projectFile, options),
    accept(projectFile, snapshot, expectedRevision) {
      placeholderProtection.validateSnapshot(snapshot);
      return update(projectFile, expectedRevision, state => {
        assertInheritedRegistration(state, null, [snapshot.target.compItemId, snapshot.source.itemId, ...snapshot.dependencies.flatMap(edge => [edge.compItemId, edge.sourceItemId])]);
        const key = placeholderProtection.targetKey(snapshot.target);
        state.acceptedPlaceholders = state.acceptedPlaceholders.filter(value => placeholderProtection.targetKey(value.target) !== key);
        state.acceptedPlaceholders.push(JSON.parse(JSON.stringify(snapshot)));
      });
    },
    release(projectFile, target, expectedRevision) {
      return update(projectFile, expectedRevision, state => {
        assertInheritedRegistration(state, null, [target.compItemId]);
        const key = placeholderProtection.targetKey(target);
        const next = state.acceptedPlaceholders.filter(value => placeholderProtection.targetKey(value.target) !== key);
        if (next.length === state.acceptedPlaceholders.length) throw new Error("selected_placeholder_not_protected");
        state.acceptedPlaceholders = next;
      });
    },
    mapGroup(projectFile, mapping, expectedRevision) {
      return update(projectFile, expectedRevision, state => {
        state.groupMappings = state.groupMappings.filter(value => value.mediaKey !== mapping.mediaKey);
        state.groupMappings.push({ mediaKey: mapping.mediaKey, groupId: mapping.groupId,
          provenance: "user_confirmed", confirmed: true });
      });
    },
    setConstraints(projectFile, constraints, expectedRevision) {
      return update(projectFile, expectedRevision, state => { state.constraints = JSON.parse(JSON.stringify(constraints)); });
    },
    registerReview(projectFile, record, expectedRevision) {
      reviewService.validateReviewRecord(record);
      return update(projectFile,expectedRevision,state=>{
        assertInheritedRegistration(state, record.owner, record.receipt.items.map(item => item.itemId));
        if(record.projectKey!==state.projectKey)throw new Error("review_artifact_project_mismatch");
        state.reviewArtifacts=state.reviewArtifacts || {};
        if(state.reviewArtifacts[record.owner])throw new Error("review_owner_already_registered");
        const owned=JSON.parse(JSON.stringify(record));
        if(owned.canonicalBinding)require("./montage-capture-service").registerOwnerPolicy(owned,state);
        state.reviewArtifacts[record.owner]=owned;
      });
    },
    registerSourceLoadEpoch(projectFile,epoch,expectedRevision){
      return update(projectFile,expectedRevision,state=>{
        assertInheritedRegistration(state, null, [epoch.sourceItemId]);
        require("./montage-capture-service").validateLoadEpoch(epoch,state);
        state.sourceLoadEpochs=state.sourceLoadEpochs || {};state.sourceLoadEpochs[epoch.sourceItemId]=JSON.parse(JSON.stringify(epoch));
      });
    },
    addReviewImage(projectFile,owner,image,expectedRevision) {
      return update(projectFile,expectedRevision,state=>{
        assertInheritedRegistration(state, owner, [image.itemId]);
        const record=state.reviewArtifacts && state.reviewArtifacts[owner];if(!record)throw new Error("review_owner_unregistered");
        if(record.canonicalBinding){
          const capture=require("./montage-capture-service");capture.assertOwnerPolicy(record,state);
          if(record.images.some(value=>value.itemId===image.itemId))throw new Error("root_png_replay_requires_fresh_capture");
          if(capture.frameForItem(record,image.itemId))capture.validateCaptureReceipt(record,image);
          capture.advanceOwnerPolicy(record,state);
        }
        record.images=record.images.filter(value=>value.itemId!==image.itemId);record.images.push(JSON.parse(JSON.stringify(image)));
      });
    },
    unregisterReview(projectFile,owner,absentIds,expectedRevision) {
      return update(projectFile,expectedRevision,state=>{
        assertInheritedRegistration(state, owner, absentIds || []);
        const record=state.reviewArtifacts && state.reviewArtifacts[owner];if(!record)throw new Error("review_owner_unregistered");
        if(!Array.isArray(absentIds) || JSON.stringify([...absentIds].sort((a,b)=>a-b))!==JSON.stringify(record.receipt.items.map(item=>item.itemId).sort((a,b)=>a-b)))throw new Error("review_removal_proof_incomplete");
        delete state.reviewArtifacts[owner];
      });
    }
  };
}

module.exports = {
  MEMORY_SCHEMA,
  MEMORY_ENTRY_SCHEMA,
  PLANNER_USE,
  DEFAULT_MAX_HINTS,
  MAX_PROMPT_SECTION_CHARS,
  validateMemoryRegistry,
  retrieveProjectIntentMemory,
  formatProjectIntentMemoryForPrompt,
  buildProjectIntentMemoryForPrompt,
  readProjectIntentMemory,
  updateProjectIntentMemory,
  PROJECT_STATE_SCHEMA, canonicalSavedProject, projectStateKey, projectStatePath,
  validateProjectStateStore, loadProjectStateStore, readProjectState, createProjectStateController
  ,PACKED_REVIEW_SCHEMA,MAX_PACKED_STATE_BYTES,MAX_REVIEW_LOGICAL_BYTES,MAX_STATE_LOGICAL_BYTES,packCanonicalReview,unpackCanonicalReview,
  transformReviewStore, serializeProjectStateStore, atomicProjectStateWrite, checkInheritedOwnershipSteps, assertInheritedRegistration
};
