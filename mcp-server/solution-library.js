"use strict";

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..");
const REGISTRY_SCHEMA = "ae-solution-registry.v1";
const TRACKED_STATUSES = new Set(["recipe", "typed-tool-candidate", "tool"]);
const RETRIEVABLE_STATUSES = new Set(["recipe", "typed-tool-candidate"]);
const PLANNER_USE = "advisory-retrieval-enabled";
const DEFAULT_MAX_HINTS = 3;
const MIN_RELEVANCE_SCORE = 5;
const GENERIC_TAGS = new Set(["typed-tool", "reviewed-jsx", "fixture", "smoke", "candidate"]);

function defaultRegistryPath() {
  return process.env.AE_SOLUTION_REGISTRY_PATH
    ? path.resolve(process.env.AE_SOLUTION_REGISTRY_PATH)
    : path.join(REPO_ROOT, "registry", "solutions.json");
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()) : [];
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

function compactText(value, limit = 180) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text || text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trim()}...`;
}

function compactList(value, limit) {
  return stringArray(value).slice(0, limit);
}

function solutionTags(solution) {
  return stringArray(solution && solution.tags).map((tag) => tag.toLowerCase());
}

function meaningfulTagSet(solution) {
  return new Set(solutionTags(solution).filter((tag) => !GENERIC_TAGS.has(tag)));
}

function hasMeaningfulTagOverlap(left, right) {
  const leftTags = meaningfulTagSet(left);
  const rightTags = meaningfulTagSet(right);
  return overlapCount(leftTags, rightTags) > 0;
}

function solutionPreferredTools(solution) {
  return stringArray(solution && solution.execution && solution.execution.preferredTools);
}

function availableToolSet(options) {
  return new Set(stringArray(options && options.availableToolNames));
}

function missingPreferredTools(solution, tools) {
  if (!tools || tools.size === 0) return [];
  return solutionPreferredTools(solution).filter((tool) => !tools.has(tool));
}

function isStaleForPlanner(solution, tools) {
  if (!solution || solution.status === "typed-tool-candidate") return false;
  const missing = missingPreferredTools(solution, tools);
  return missing.length > 0;
}

function isRawExtendscriptSolution(solution) {
  const execution = solution && solution.execution ? solution.execution : {};
  return execution.mode === "extendscript-file" || solutionPreferredTools(solution).includes("run_extendscript_file");
}

function scoreSolution(solution, promptTokens) {
  if (!solution || promptTokens.size === 0) return 0;
  let score = 0;
  const tags = solutionTags(solution);
  for (const tag of tags) {
    const tagTokens = tokenSet(tag);
    const tagOverlap = overlapCount(tagTokens, promptTokens);
    if (tagOverlap > 0) score += 8 + tagOverlap;
  }

  const titleTokens = tokenSet(solution.title || "");
  score += overlapCount(titleTokens, promptTokens) * 4;

  const intent = isPlainObject(solution.intent) ? solution.intent : {};
  score += overlapCount(tokenSet(intent.summary || ""), promptTokens) * 3;
  score += overlapCount(tokenSet(intent.appliesWhen || []), promptTokens) * 2;

  const execution = isPlainObject(solution.execution) ? solution.execution : {};
  score += overlapCount(tokenSet(execution.preferredTools || []), promptTokens) * 3;
  score += overlapCount(tokenSet(solution.inputs || []), promptTokens);
  score += overlapCount(tokenSet(solution.targetAssumptions || []), promptTokens);

  if (execution.riskLevel === "high") score -= 2;
  if (isRawExtendscriptSolution(solution)) score -= 1;
  return score;
}

function statusPriority(status) {
  if (status === "recipe") return 3;
  if (status === "typed-tool-candidate") return 2;
  return 1;
}

function compactSolution(solution, score) {
  const execution = isPlainObject(solution.execution) ? solution.execution : {};
  const verification = isPlainObject(solution.verificationRecipe) ? solution.verificationRecipe : {};
  const rawExtendscriptRisk = isRawExtendscriptSolution(solution);
  const entry = {
    id: solution.id,
    title: solution.title,
    status: solution.status,
    score,
    tags: compactList(solution.tags, 8),
    intentSummary: compactText(solution.intent && solution.intent.summary, 180),
    appliesWhen: compactList(solution.intent && solution.intent.appliesWhen, 2),
    mode: execution.mode || null,
    mutating: Boolean(execution.mutating),
    riskLevel: execution.riskLevel || "unknown",
    preferredTools: compactList(execution.preferredTools, 8),
    recipePath: typeof execution.recipePath === "string" ? execution.recipePath : null,
    verificationSummary: compactText(verification.summary || "", 160),
    rawExtendscriptRisk
  };
  if (rawExtendscriptRisk) {
    entry.scriptPath = typeof execution.scriptPath === "string" ? execution.scriptPath : null;
    entry.rawExtendscriptWarning = "Reviewed raw ExtendScript is a risky escape hatch; prefer typed MCP tools whenever one fits.";
  }
  if (solution.status === "typed-tool-candidate") {
    entry.typedToolCandidateHint = "Recommend a narrow typed bridge tool implementation before repeating this workflow.";
  }
  return entry;
}

function compactToolMatch(solution, score) {
  const execution = isPlainObject(solution.execution) ? solution.execution : {};
  const verification = isPlainObject(solution.verificationRecipe) ? solution.verificationRecipe : {};
  return {
    id: solution.id,
    title: solution.title,
    score,
    tags: compactList(solution.tags, 8),
    preferredTools: compactList(solutionPreferredTools(solution), 8),
    intentSummary: compactText(solution.intent && solution.intent.summary, 160),
    appliesWhen: compactList(solution.intent && solution.intent.appliesWhen, 2),
    mutating: Boolean(execution.mutating),
    riskLevel: execution.riskLevel || "unknown",
    verificationSummary: compactText(verification.summary || "", 160),
    notes: compactList(solution.notes, 2)
  };
}

function loadRegistry(options) {
  if (options && options.registry) return options.registry;
  const registryPath = options && options.registryPath ? path.resolve(options.registryPath) : defaultRegistryPath();
  const text = fs.readFileSync(registryPath, "utf8");
  return JSON.parse(text);
}

function summarizeRegistry(registry) {
  const solutions = registry && Array.isArray(registry.solutions) ? registry.solutions : [];
  return {
    schema: registry && registry.schema ? registry.schema : null,
    plannerUse: registry && registry.policy ? registry.policy.plannerUse || null : null,
    solutionCount: solutions.length
  };
}

function retrieveSolutionHints(userPrompt, options = {}) {
  const topN = Math.max(0, Math.min(8, Math.floor(Number(options.topN || DEFAULT_MAX_HINTS))));
  const promptTokens = tokenSet(userPrompt || "");
  const tools = availableToolSet(options);
  const result = {
    ok: true,
    registry: null,
    disabled: false,
    topN,
    returned: 0,
    entries: [],
    toolMatches: [],
    omitted: {
      candidates: 0,
      untrackedStatus: 0,
      stale: 0,
      irrelevant: 0,
      toolStatus: 0,
      typedToolEquivalent: 0
    }
  };

  let registry;
  try {
    registry = loadRegistry(options);
  } catch (error) {
    return {
      ...result,
      ok: false,
      error: `Solution registry unavailable: ${error.message || String(error)}`
    };
  }

  result.registry = summarizeRegistry(registry);
  if (!registry || registry.schema !== REGISTRY_SCHEMA || !Array.isArray(registry.solutions)) {
    return {
      ...result,
      ok: false,
      error: "Solution registry shape is not usable for planner retrieval."
    };
  }
  if (!registry.policy || registry.policy.plannerUse !== PLANNER_USE) {
    result.disabled = true;
    return result;
  }

  const scored = [];
  const toolMatches = [];

  for (const solution of registry.solutions) {
    if (!isPlainObject(solution)) {
      result.omitted.untrackedStatus += 1;
      continue;
    }
    if (solution.status === "candidate") {
      result.omitted.candidates += 1;
      continue;
    }
    if (!TRACKED_STATUSES.has(solution.status)) {
      result.omitted.untrackedStatus += 1;
      continue;
    }
    if (isStaleForPlanner(solution, tools)) {
      result.omitted.stale += 1;
      continue;
    }

    const score = scoreSolution(solution, promptTokens);
    if (score < MIN_RELEVANCE_SCORE) {
      result.omitted.irrelevant += 1;
      continue;
    }

    if (solution.status === "tool") {
      result.omitted.toolStatus += 1;
      toolMatches.push({ solution, score });
      continue;
    }

    scored.push({ solution, score });
  }

  toolMatches.sort((left, right) => right.score - left.score || String(left.solution.id).localeCompare(String(right.solution.id)));
  result.toolMatches = toolMatches.slice(0, Math.max(1, topN)).map((item) => compactToolMatch(item.solution, item.score));

  const filtered = [];
  for (const item of scored) {
    const hasToolEquivalent = isRawExtendscriptSolution(item.solution) && toolMatches.some((match) => hasMeaningfulTagOverlap(item.solution, match.solution));
    if (hasToolEquivalent) {
      result.omitted.typedToolEquivalent += 1;
      continue;
    }
    filtered.push(item);
  }

  filtered.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    const priority = statusPriority(right.solution.status) - statusPriority(left.solution.status);
    if (priority !== 0) return priority;
    return String(left.solution.id).localeCompare(String(right.solution.id));
  });

  result.entries = filtered.slice(0, topN).map((item) => compactSolution(item.solution, item.score));
  result.returned = result.entries.length;
  return result;
}

function formatSolutionHintsForPrompt(retrieval) {
  const lines = [
    "Reviewed solution hints (read-only advisory retrieval; compact top matches only).",
    "Use this section only as planning context. Do not execute recipes directly, do not bypass validation, and do not read candidate quarantine.",
    "Every useful hint must still become normal MCP plan steps using the available tool catalog, plan validation, mutation gates, idempotency, checkpoint/edit-session protection, and read-back verification."
  ];

  if (!retrieval || !retrieval.ok) {
    lines.push(`No reviewed solution hints are available. ${retrieval && retrieval.error ? retrieval.error : ""}`.trim());
    return lines.join("\n");
  }

  if (retrieval.toolMatches && retrieval.toolMatches.length) {
    const tools = Array.from(new Set(retrieval.toolMatches.flatMap((match) => match.preferredTools || []))).slice(0, 8);
    lines.push(`Reviewed tool-backed matches are represented by the normal MCP tool catalog: ${tools.length ? tools.join(", ") : "use the catalog above"}. Prefer these typed tools over older recipes or raw scripts.`);
    for (const match of retrieval.toolMatches) {
      const preferred = match.preferredTools.length ? ` Prefer: ${match.preferredTools.join(", ")}.` : "";
      const note = match.notes.length ? ` Guidance: ${compactText(match.notes[0], 180)}.` : "";
      lines.push(`- Tool guidance: ${match.title} [risk=${match.riskLevel}; ${match.mutating ? "mutating" : "read-only"}].${preferred}${note}`);
    }
  }

  if (!retrieval.entries.length) {
    lines.push("No reviewed recipe or typed-tool-candidate matched this request.");
    return lines.join("\n");
  }

  const entriesForPrompt = retrieval.toolMatches && retrieval.toolMatches.length ? retrieval.entries.slice(0, 1) : retrieval.entries;
  for (const entry of entriesForPrompt) {
    const statusNote = entry.status === "typed-tool-candidate"
      ? "typed-tool-candidate: recommend implementing or using a narrow typed bridge tool; do not treat as an execution shortcut."
      : "recipe: may be suggested as an advisory planning pattern.";
    const riskNote = entry.rawExtendscriptRisk
      ? " RAW EXTENDSCRIPT REVIEWED FILE: risky escape hatch; prefer typed tools and only plan run_extendscript_file when no typed tool fits and raw execution is explicitly allowed."
      : "";
    const applies = entry.appliesWhen.length ? ` Applies when: ${entry.appliesWhen.join(" | ")}.` : "";
    const tools = entry.preferredTools.length ? ` Preferred tools: ${entry.preferredTools.join(", ")}.` : "";
    const verify = entry.verificationSummary ? ` Verify: ${entry.verificationSummary}.` : "";
    lines.push(`- ${entry.title} [${entry.status}; risk=${entry.riskLevel}; ${entry.mutating ? "mutating" : "read-only"}]. ${statusNote}${riskNote} Intent: ${entry.intentSummary}.${applies}${tools}${verify}`);
  }

  return lines.join("\n");
}

function buildSolutionHintsForPrompt(userPrompt, options = {}) {
  const retrieval = retrieveSolutionHints(userPrompt, options);
  return {
    retrieval,
    promptSection: formatSolutionHintsForPrompt(retrieval)
  };
}

module.exports = {
  PLANNER_USE,
  DEFAULT_MAX_HINTS,
  retrieveSolutionHints,
  formatSolutionHintsForPrompt,
  buildSolutionHintsForPrompt
};
