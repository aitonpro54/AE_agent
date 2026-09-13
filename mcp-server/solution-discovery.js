"use strict";

const fs = require("fs");
const path = require("path");
const { retrieveSolutionHints, PLANNER_USE } = require("./solution-library");
const { getBuilderContract } = require("./solution-plan-builder");
const ROOT = path.resolve(__dirname, "..");
const APPROVED_STATUSES = new Set(["recipe", "tool", "typed-tool-candidate"]);

function loadSolutions() {
  const file = process.env.AE_SOLUTION_REGISTRY_PATH || path.join(ROOT, "registry", "solutions.json");
  const registry = JSON.parse(fs.readFileSync(file, "utf8"));
  if (registry.schema !== "ae-solution-registry.v1" || !registry.policy || registry.policy.plannerUse !== PLANNER_USE || !Array.isArray(registry.solutions)) {
    throw new Error("Reviewed solution discovery is unavailable or disabled by policy.");
  }
  return registry;
}

function safeId(value) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{0,159}$/.test(value)) throw new Error("Provide one registry solution id, not a file path.");
  return value;
}

function knownSolution(id, tools, registry = loadSolutions()) {
  id = safeId(id);
  const matches = registry.solutions.filter((entry) => entry.id === id && APPROVED_STATUSES.has(entry.status));
  if (matches.length !== 1) throw new Error("Reviewed solution was not found or its id is ambiguous.");
  const entry = matches[0];
  const available = new Set(tools.map((tool) => tool.name));
  if (!(entry.execution && Array.isArray(entry.execution.preferredTools)) || entry.execution.preferredTools.some((name) => !available.has(name))) {
    throw new Error("Solution refers to unavailable tools; do not execute it.");
  }
  return entry;
}

function searchSolutions(args, tools) {
  if (typeof args.query !== "string" || !args.query.trim() || args.query.length > 2000) throw new Error("query must contain 1–2000 characters.");
  const limit = args.limit === undefined ? 3 : args.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > 8) throw new Error("limit must be an integer from 1 to 8.");
  const retrieval = retrieveSolutionHints(args.query, { registry: loadSolutions(), topN: limit, availableToolNames: tools.map((tool) => tool.name) });
  if (!retrieval.ok) throw new Error(retrieval.error || "Solution retrieval failed.");
  const results = [...retrieval.toolMatches, ...retrieval.entries].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, limit)
    .map((entry) => ({ id: entry.id, title: entry.title, score: entry.score, mutating: entry.mutating,
      riskLevel: entry.riskLevel, summary: entry.intentSummary, preferredTools: entry.preferredTools }));
  return { ok: true, mode: "local-advisory", results, count: results.length,
    next: "Use get_solution with a result id for the reviewed procedure and tool contracts. Inspect current AE targets, then propose and dry-run a normal plan. No provider was called." };
}

function readRecipe(relativePath) {
  if (!relativePath) return "";
  const base = fs.realpathSync(path.join(ROOT, "recipes"));
  const candidate = path.resolve(ROOT, relativePath);
  const real = fs.realpathSync(candidate);
  const relative = path.relative(base, real);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || path.extname(real).toLowerCase() !== ".md") {
    throw new Error("Recipe must resolve to reviewed Markdown under recipes/.");
  }
  if (fs.statSync(real).size > 128000) throw new Error("Recipe exceeds the supported document size.");
  return fs.readFileSync(real, "utf8");
}

function getSolution(args, tools) {
  const entry = knownSolution(args.id, tools);
  const offset = args.offset === undefined ? 0 : args.offset;
  const limit = args.limit === undefined ? 6000 : args.limit;
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 500 || limit > 12000) throw new Error("offset must be nonnegative; limit must be 500–12000 characters.");
  const content = readRecipe(entry.execution.recipePath);
  if (offset > content.length) throw new Error("offset exceeds recipe length.");
  const names = args.toolNames === undefined ? [] : args.toolNames;
  if (!Array.isArray(names) || names.length > 4 || names.some((name) => !entry.execution.preferredTools.includes(name))) throw new Error("toolNames must contain at most four preferred tool names from this solution.");
  const selected = tools.filter((tool) => names.includes(tool.name));
  if (JSON.stringify(selected).length > 24000) throw new Error("Requested contracts are too large; request fewer toolNames.");
  return { ok: true, mode: "local-advisory", solution: offset > 0 ? {id: entry.id, title: entry.title} : { id: entry.id, title: entry.title, status: entry.status,
    intent: entry.intent, inputs: entry.inputs, targetAssumptions: entry.targetAssumptions, execution: entry.execution,
    requiredSafetyGates: entry.requiredSafetyGates, verificationRecipe: entry.verificationRecipe, testedAeContext: entry.testedAeContext },
    recipe: { text: content.slice(offset, offset + limit), offset, totalChars: content.length,
      nextOffset: offset + limit < content.length ? offset + limit : null, truncated: offset + limit < content.length },
    toolContracts: selected,
    planBuilder: offset === 0 ? getBuilderContract(entry.id) : undefined,
    next: "Read every recipe page needed for the operation. Build a proposal and dry-run first. A temporary CEP Autonomous Codex session can authorize proposal-backed typed mutations; raw JSX and destructive plans retain manual confirmation. This result authorizes no mutation." };
}

const discoveryTools = [
  { name: "search_solutions", description: "Search reviewed AE solutions in Russian or English before writing custom JSX. Local lookup, no model call or AE mutation; returns compact ids and preferred typed tools. Follow with get_solution.",
    inputSchema: {type: "object", properties: {query: {type: "string", description: "Natural user task, RU or EN."}, limit: {type: "integer", minimum: 1, maximum: 8, default: 3}}, required: ["query"]} },
  { name: "get_solution", description: "Read a reviewed AE recipe by id, including its actual algorithm, inputs, safety gates, and optional preferred-tool JSON schemas. Local paginated lookup; no execution or provider call.",
    inputSchema: {type: "object", properties: {id: {type: "string"}, offset: {type: "integer", minimum: 0}, limit: {type: "integer", minimum: 500, maximum: 12000, default: 6000}, toolNames: {type: "array", maxItems: 4, items: {type: "string"}, description: "Preferred tool names whose full contracts are needed; omit to keep the response compact."}}, required: ["id"]} },
  { name: "build_solution_plan", description: "Build a deterministic reviewed AE keyframe-distribution plan from explicit complete inspected evidence. Local computation, no LLM or AE mutation. Returns normal plan for review/proposal, with scalar linear-only limits.",
    inputSchema: {type: "object", properties: {solutionId: {type: "string"}, inputs: {type: "object", description: "Explicit complete inspected evidence per the supported builder input contract returned by get_solution."}}, required: ["solutionId", "inputs"]} },
  { name: "propose_ai_agent_plan", description: "Create a server-owned action proposal for an explicit AE plan without a provider call or AE mutation. Returns a redacted proposal for dry-run and, while the user-enabled CEP Autonomous Codex session is active, proposal-backed typed mutation. Raw JSX and destructive plans retain manual confirmation.",
    inputSchema: {type: "object", properties: {plan: {type: "object"}, requestId: {type: "string"}}, required: ["plan"]} }
];

function reviewedIds() {
  return loadSolutions().solutions.filter((entry) => APPROVED_STATUSES.has(entry.status)).map((entry) => entry.id);
}

module.exports = { searchSolutions, getSolution, knownSolution, reviewedIds, discoveryTools };
