"use strict";

const guidelines = require("./planner-tool-guidance");
const MAX_PLANNER_CHARS = 24000;
const MAX_USER_CHARS = 12000;
const FINAL_POLICY = "Final execution contract: draft JSON only; use current typed inspection evidence, explicit targets, dependsOnStep/resultBindings, verifyAfter:true and idempotencyKeyTemplate for mutations. Never execute while planning. Plan validation, dry-run, confirmation, checkpoint/edit-session and read-back gates remain mandatory. End of AE planning instructions.";
const CORE_TOOLS = ["get_active_comp", "get_selected_layers", "get_comp_details", "get_layer_details", "get_project_info", "find_comps", "checkpoint_project"];
const STOP_WORDS = new Set("the a an to in on at for of with and or one use layer layers comp composition selected current after effects".split(" "));

function words(value) {
  return String(value || "").toLowerCase().replace(/_/g, " ").match(/[a-z0-9а-яё]+/g) || [];
}

function flag(value) {
  if (value === undefined || value === null) return false;
  if (value === true || value === 1 || ["true", "1", "yes", "on"].includes(String(value).trim().toLowerCase())) return true;
  if (value === false || value === 0 || ["false", "0", "no", "off"].includes(String(value).trim().toLowerCase())) return false;
  throw new Error("Planner mode flags must be boolean.");
}

function selectTools(userPrompt, tools, retrieval) {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const chosen = new Set(CORE_TOOLS.filter((name) => byName.has(name)));
  const matches = [...(retrieval && retrieval.toolMatches || []), ...(retrieval && retrieval.entries || [])];
  for (const match of matches.slice(0, 3)) {
    for (const name of match.preferredTools || []) if (byName.has(name)) chosen.add(name);
  }
  const query = new Set(words(userPrompt).filter((word) => !STOP_WORDS.has(word)));
  const scored = tools.map((tool) => {
    const nameWords = new Set(words(tool.name));
    const descriptionWords = new Set(words(tool.description));
    const exact = String(userPrompt).includes(tool.name) ? 100 : 0;
    let score = exact;
    for (const word of query) score += nameWords.has(word) ? 4 : descriptionWords.has(word) ? 1 : 0;
    return { tool, score };
  }).filter((item) => item.score >= 4).sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name));
  for (const item of scored.slice(0, 8)) chosen.add(item.tool.name);
  return tools.filter((tool) => chosen.has(tool.name));
}

function relevantGuidelines(selected, tools, mutatingNames) {
  const chosen = new Set(selected.map((tool) => tool.name));
  return guidelines.filter((line) => {
    // Match the operation's first sentence, not read-back tools or exclusions later in the rule.
    const firstSentence = line.split(/\.\s/)[0];
    const names = tools.filter((tool) => firstSentence.includes(tool.name)).map((tool) => tool.name);
    if (!names.length) return true;
    const operations = names.filter((name) => mutatingNames.has(name) && !/^run_extendscript/.test(name));
    return (operations.length ? operations : names).some((name) => chosen.has(name));
  });
}

function contextText(snapshot, maxChars) {
  const value = snapshot || { available: false, reason: "Context snapshot was not captured." };
  const full = JSON.stringify(value);
  if (full.length <= maxChars) return full;
  const compact = { capturedAt: value.capturedAt, activeComp: value.activeComp,
    selectedLayers: (value.selectedLayers || []).slice(0, 2), selectedSourceHints: (value.selectedSourceHints || []).slice(0, 2),
    truncated: true, note: "Context was reduced to fit the prompt. Inspect remaining targets with typed tools." };
  if (JSON.stringify(compact).length <= maxChars) return JSON.stringify(compact);
  return JSON.stringify({ available: false, truncated: true, reason: "Context exceeds prompt budget. Read targets with typed tools before planning mutations." });
}

function buildPlannerContext({ args = {}, snapshot, solutionHints, memorySection, tools, mutatingNames }) {
  const prompt = String(args.prompt || args.message || "").trim();
  if (!prompt) throw new Error("prompt or message is required for AE Plan mode.");
  if (prompt.length > MAX_USER_CHARS) throw new Error(`AE Plan request exceeds ${MAX_USER_CHARS} characters; narrow the task. Nothing was sent to a provider.`);
  const selected = selectTools(prompt, tools, solutionHints && solutionHints.retrieval);
  const catalog = selected.map((tool) => {
    const schema = tool.inputSchema || {};
    return `- ${tool.name} (${mutatingNames.has(tool.name) ? "mutates" : "read-only"}): ${tool.description.slice(0, 130)} Required: ${(schema.required || []).join(", ") || "none"}. Fields: ${Object.keys(schema.properties || {}).join(", ")}.`;
  }).join("\n");
  const otherNames = tools.filter((tool) => !selected.includes(tool)).map((tool) => tool.name);
  const rules = relevantGuidelines(selected, tools, mutatingNames);
  const sections = [
    "User request:", prompt,
    'Return one JSON object with this shape: {"summary":"short user-facing summary","risk":"low|medium|high","requiresCheckpoint":true,"clarifyingQuestion":null,"solutionIds":[],"steps":[{"title":"short step title","intent":"what this checks or changes","tool":"MCP tool name or null","args":{},"dependsOnStep":null,"resultBindings":{},"mutatesProject":false,"verifyAfter":true,"idempotencyKeyTemplate":"ae-plan-{requestId}-step-1"}]}',
    "Human-first planning policy: answer in the user's language; interpret Russian/Cyrillic and English naturally. Choose conservative defaults only when target and scope are clear. Ask for clarification for ambiguous targets, destructive scope or file choices.",
    "Typed-tool and ExtendScript policy: prefer typed tools. Never use raw JSX for broad project deletion, save/saveAs, eval, shell execution, secrets or hard-coded user paths. Raw fallback requires inspected scope, dry-run and typed read-back; it is not a trusted reusable solution.",
    "Reuse workflow: first use reviewed solution hints; solutionIds lists only supplied IDs actually used to design this plan (otherwise []). Reuse current inspection results via resultBindings and request only missing information; never assume old indices remain valid after mutations. For layer properties leave includeProperties=false unless a specific property tree is needed. Use canonical itemIndices/layerIndices, not itemIndexes/layerIndexes. All arbitrary property paths require current inspection.",
    "Available MCP tools. Use these names exactly; do not invent tool names. Relevant contracts:", catalog,
    `Additional supported tool names (schemas and reviewed guidance are available through get_solution/search_solutions outside this single planning call): ${otherNames.join(", ")}. If the contract is unknown, plan inspection or clarification instead of inventing arguments.`,
    "Project intent memory hints. These are local project preferences, not execution shortcuts.", memorySection || "No project intent memory hints were retrieved.",
    "Reviewed solution library hints. These are advisory recipes, not execution shortcuts.", solutionHints && solutionHints.promptSection || "No reviewed solution hints were retrieved.",
    `Available solutionIds for attribution: ${[...(solutionHints && solutionHints.retrieval && solutionHints.retrieval.toolMatches || []), ...(solutionHints && solutionHints.retrieval && solutionHints.retrieval.entries || [])].map((entry) => entry.id).join(", ") || "none"}.`,
    "Task-specific tool guidance:", ...rules,
    flag(args.hardcore) || args.agentMode === "hardcore" ? "Agent Hardcore: plan inspection, dry-run, protected execution and verification explicitly. Report unsupported typed-tool gaps for development." : "",
    flag(args.promptOptimization) ? "Prompt Optimization is enabled: preserve the user's scope and avoid unnecessary steps." : ""
  ].filter(Boolean);
  let context = contextText(snapshot, 4000);
  const assemble = () => [...sections, "Current project context snapshot. Planning hint only; verify before mutations.", context, FINAL_POLICY].join("\n\n");
  let text = assemble();
  if (text.length > MAX_PLANNER_CHARS) { context = contextText(snapshot, 500); text = assemble(); }
  if (text.length > MAX_PLANNER_CHARS) throw new Error(`AE planner context exceeds ${MAX_PLANNER_CHARS} characters; split the request. Required instructions were not truncated and no provider call was made.`);
  return { text, metadata: { version: "bounded-planner-v1", userChars: prompt.length, promptChars: text.length,
    catalogChars: catalog.length, selectedToolCount: selected.length, availableToolCount: tools.length,
    guidanceCount: rules.length, contextChars: context.length, contextReduced: Boolean(JSON.parse(context).truncated),
    truncated: false, maxPromptChars: MAX_PLANNER_CHARS } };
}

module.exports = { buildPlannerContext, MAX_PLANNER_CHARS, FINAL_POLICY };
