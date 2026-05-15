"use strict";

const fs = require("fs");
const path = require("path");

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
  updateProjectIntentMemory
};