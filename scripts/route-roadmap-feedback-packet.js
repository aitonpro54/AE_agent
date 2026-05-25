"use strict";

const fs = require("fs");
const path = require("path");

const FORBIDDEN_ACTIONS = [
  "edit_source_from_feedback_without_new_approval",
  "auto_fix",
  "retry_command",
  "create_branch_or_worktree",
  "push_or_pr",
  "github_issue_or_action",
  "install_or_run_ao",
  "touch_cep_live_production_dependency_package_paths",
  "run_live_cep_ae",
  "external_provider_planner_validation",
  "use_local_ollama",
];

function usage() {
  return [
    "Usage: node scripts/route-roadmap-feedback-packet.js [--validation <path>] [--reviewer <path>] [--context <path>] [--analyzer <path>] [--format json|markdown]",
    "",
    "Reads explicit roadmap feedback packet paths and emits bounded next-task envelopes to stdout.",
    "It does not edit source files, retry commands, create issues, open PRs, install AO, or run live AE/CEP.",
  ].join("\n");
}

function parseArgs(argv) {
  const args = {
    validation: [],
    reviewer: [],
    context: [],
    analyzer: [],
    format: "json",
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--validation") {
      index += 1;
      args.validation.push(requireValue(argv[index], arg));
    } else if (arg === "--reviewer") {
      index += 1;
      args.reviewer.push(requireValue(argv[index], arg));
    } else if (arg === "--context") {
      index += 1;
      args.context.push(requireValue(argv[index], arg));
    } else if (arg === "--analyzer") {
      index += 1;
      args.analyzer.push(requireValue(argv[index], arg));
    } else if (arg === "--format") {
      index += 1;
      args.format = requireValue(argv[index], arg);
      if (!["json", "markdown"].includes(args.format)) {
        throw new Error(`Unsupported --format: ${args.format}`);
      }
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  const packetCount = args.validation.length + args.reviewer.length + args.context.length + args.analyzer.length;
  if (!args.help && packetCount === 0) {
    throw new Error("At least one feedback packet path is required");
  }

  return args;
}

function requireValue(value, flag) {
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function resolveExisting(inputPath, label) {
  const absolutePath = path.resolve(process.cwd(), inputPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`${label} does not exist: ${absolutePath}`);
  }
  if (!fs.statSync(absolutePath).isFile()) {
    throw new Error(`${label} is not a file: ${absolutePath}`);
  }
  return absolutePath;
}

function readJson(inputPath, label) {
  const absolutePath = resolveExisting(inputPath, label);
  try {
    return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch (error) {
    throw new Error(`Failed to parse ${label} JSON ${absolutePath}: ${error.message}`);
  }
}

function normalizePath(value) {
  return String(value).replace(/\\/g, "/");
}

function normalizeList(value) {
  if (value === undefined || value === null || value === "") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(normalizeList);
  }
  return [String(value)];
}

function uniqueList(values) {
  return [...new Set(normalizeList(values).map(normalizePath))].sort();
}

function readSelector(root, selector) {
  return selector.split(".").reduce((current, part) => {
    if (current && Object.prototype.hasOwnProperty.call(current, part)) {
      return current[part];
    }
    return undefined;
  }, root);
}

function valuesForSelectors(root, selectors) {
  return selectors.flatMap((selector) => normalizeList(readSelector(root, selector)));
}

function firstValue(root, selectors) {
  return valuesForSelectors(root, selectors).find((value) => value !== "");
}

function firstNumber(root, selectors) {
  for (const value of valuesForSelectors(root, selectors)) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function statusIsFailure(status) {
  if (!status) {
    return false;
  }
  const normalized = String(status).toLowerCase();
  return ["failed", "failure", "error", "errored", "blocked", "nonzero", "not_passed"].some((token) => normalized.includes(token));
}

function statusIsBlockingReviewerDecision(decision) {
  return ["blocking_finding", "needs_handoff_refresh"].includes(String(decision || "").toLowerCase());
}

function collectPlannedPaths(packet) {
  return uniqueList([
    ...valuesForSelectors(packet, [
      "plannedPaths",
      "queueItem.plannedPaths",
      "nextBoundedTask.plannedPaths",
      "task.plannedPaths",
    ]),
  ]);
}

function collectValidationCommands(packet) {
  return uniqueList(valuesForSelectors(packet, [
    "validationCommands",
    "validation.commands",
    "nextBoundedTask.validationCommands",
    "task.validationCommands",
  ]));
}

function collectChangedPaths(packet) {
  return uniqueList(valuesForSelectors(packet, [
    "changedPaths",
    "changed_paths",
    "diff.changedPaths",
    "result.changedPaths",
    "nextBoundedTask.changedPaths",
  ]));
}

function buildEnvelope(options) {
  const plannedPaths = uniqueList(options.plannedPaths || []);
  return {
    id: options.id,
    feedbackClass: options.feedbackClass,
    sourceType: options.sourceType,
    sourcePath: normalizePath(options.sourcePath),
    priority: options.priority,
    goal: options.goal,
    plannedPaths,
    changedPaths: uniqueList(options.changedPaths || []),
    forbiddenActions: FORBIDDEN_ACTIONS.slice(),
    validationCommands: uniqueList(options.validationCommands || []),
    evidence: options.evidence || {},
    nextRequiredAction: options.nextRequiredAction,
    requiresFreshApproval: true,
    implementationAllowed: false,
  };
}

function routeValidation(packet, sourcePath, index) {
  const status = firstValue(packet, [
    "validation.status",
    "validation.result",
    "validationResult",
    "status",
    "result.status",
  ]);
  const exitCode = firstNumber(packet, [
    "validation.exitCode",
    "exitCode",
    "result.exitCode",
  ]);
  const okValue = readSelector(packet, "ok");
  if (!statusIsFailure(status) && exitCode !== 1 && exitCode !== 2 && okValue !== false) {
    return null;
  }

  return buildEnvelope({
    id: `feedback-validation-failure-${index + 1}`,
    feedbackClass: "validation_failure",
    sourceType: "validation",
    sourcePath,
    priority: "blocking",
    goal: "Create one bounded validation repair task limited to the original planned paths and failed command evidence.",
    plannedPaths: collectPlannedPaths(packet),
    changedPaths: collectChangedPaths(packet),
    validationCommands: collectValidationCommands(packet),
    nextRequiredAction: "create_bounded_validation_repair_task",
    evidence: {
      status: status || "",
      exitCode,
      command: firstValue(packet, ["validation.command", "command", "failedCommand", "result.command"]) || "",
    },
  });
}

function routeReviewer(packet, sourcePath, index) {
  const decision = firstValue(packet, ["decision", "review.decision", "result.decision"]);
  if (!statusIsBlockingReviewerDecision(decision)) {
    return null;
  }

  return buildEnvelope({
    id: `feedback-reviewer-blocking-${index + 1}`,
    feedbackClass: "reviewer_blocking",
    sourceType: "reviewer",
    sourcePath,
    priority: decision === "needs_handoff_refresh" ? "handoff_required" : "blocking",
    goal: "Create one bounded reviewer follow-up task from the explicit reviewer finding without applying fixes automatically.",
    plannedPaths: collectPlannedPaths(packet),
    changedPaths: collectChangedPaths(packet),
    validationCommands: collectValidationCommands(packet),
    nextRequiredAction: "create_bounded_reviewer_followup_task",
    evidence: {
      decision: decision || "",
      findings: normalizeList(readSelector(packet, "findings")),
      summary: firstValue(packet, ["summary", "review.summary"]) || "",
    },
  });
}

function routeContext(packet, sourcePath, index) {
  const stop = readSelector(packet, "stop") === true || readSelector(packet, "implementationAllowed") === false;
  const level = firstValue(packet, ["level", "context.level"]);
  const stopReasons = normalizeList(readSelector(packet, "stopReasons"));
  if (!stop && stopReasons.length === 0) {
    return null;
  }

  return buildEnvelope({
    id: `feedback-context-pressure-${index + 1}`,
    feedbackClass: "context_pressure",
    sourceType: "context",
    sourcePath,
    priority: "stop",
    goal: "Stop implementation and create or refresh the bounded handoff before any new roadmap work.",
    plannedPaths: uniqueList([".codex/handoff.md", "plans/target-app-execplan.md"]),
    changedPaths: [],
    validationCommands: [],
    nextRequiredAction: "stop_and_update_handoff",
    evidence: {
      level: level || "",
      stopReasons,
      routerObservedNextRequiredAction: firstValue(packet, ["nextRequiredAction"]) || "",
    },
  });
}

function routeAnalyzer(packet, sourcePath, index) {
  const failureClass = firstValue(packet, ["failureClass", "packet.failureClass", "result.failureClass"]);
  const nextTask = readSelector(packet, "nextBoundedTask") || readSelector(packet, "task") || {};
  if (!failureClass && Object.keys(nextTask).length === 0) {
    return null;
  }

  return buildEnvelope({
    id: `feedback-analyzer-packet-${index + 1}`,
    feedbackClass: "analyzer_packet",
    sourceType: "analyzer",
    sourcePath,
    priority: failureClass === "unknown_failure" ? "needs_triage" : "blocking",
    goal: firstValue(nextTask, ["goal"]) || "Create one bounded analyzer follow-up task from the explicit failure packet.",
    plannedPaths: collectPlannedPaths(packet),
    changedPaths: collectChangedPaths(packet),
    validationCommands: collectValidationCommands(packet),
    nextRequiredAction: "create_bounded_analyzer_followup_task",
    evidence: {
      failureClass: failureClass || "",
      command: firstValue(packet, ["command", "nextBoundedTask.command"]) || "",
      status: firstValue(packet, ["status", "nextBoundedTask.status"]) || "",
      suspectedCause: readSelector(packet, "suspectedCause") || {},
    },
  });
}

function routeUnknown(packet, sourcePath, sourceType, index) {
  return buildEnvelope({
    id: `feedback-unknown-${sourceType}-${index + 1}`,
    feedbackClass: "unknown_feedback",
    sourceType,
    sourcePath,
    priority: "manual_triage",
    goal: "Stop automatic routing and ask for a new bounded queue item with explicit planned paths.",
    plannedPaths: [],
    changedPaths: [],
    validationCommands: [],
    nextRequiredAction: "manual_triage_with_new_bounded_queue_item",
    evidence: {
      schema: firstValue(packet, ["schema"]) || "",
      status: firstValue(packet, ["status", "validation.status", "decision", "failureClass"]) || "",
    },
  });
}

function readPackets(paths, sourceType) {
  return paths.map((inputPath) => ({
    sourceType,
    sourcePath: normalizePath(inputPath),
    packet: readJson(inputPath, `${sourceType} packet`),
  }));
}

function routeFeedback(args) {
  const inputs = [
    ...readPackets(args.validation, "validation"),
    ...readPackets(args.reviewer, "reviewer"),
    ...readPackets(args.context, "context"),
    ...readPackets(args.analyzer, "analyzer"),
  ];

  const routes = [];
  inputs.forEach((input, index) => {
    const router = {
      validation: routeValidation,
      reviewer: routeReviewer,
      context: routeContext,
      analyzer: routeAnalyzer,
    }[input.sourceType];
    const route = router(input.packet, input.sourcePath, index);
    routes.push(route || routeUnknown(input.packet, input.sourcePath, input.sourceType, index));
  });

  const unknownRoutes = routes.filter((route) => route.feedbackClass === "unknown_feedback");
  return {
    schema: "roadmap-feedback-router-result.v1",
    ok: unknownRoutes.length === 0,
    status: unknownRoutes.length === 0 ? "routed" : "needs_manual_triage",
    sourcePaths: inputs.map((input) => input.sourcePath),
    routeCount: routes.length,
    routes,
    forbiddenActions: FORBIDDEN_ACTIONS.slice(),
  };
}

function renderMarkdown(result) {
  const lines = [
    "# Roadmap Feedback Router",
    "",
    `- Status: \`${result.status}\``,
    `- OK: \`${result.ok}\``,
    `- Routes: \`${result.routeCount}\``,
    "",
  ];
  for (const route of result.routes) {
    lines.push(
      `## ${route.feedbackClass}`,
      "",
      `- Source: \`${route.sourceType}:${route.sourcePath}\``,
      `- Priority: \`${route.priority}\``,
      `- Next required action: \`${route.nextRequiredAction}\``,
      `- Planned paths: ${route.plannedPaths.length > 0 ? route.plannedPaths.map((item) => `\`${item}\``).join(", ") : "(none)"}`,
      "",
    );
  }
  return lines.join("\n");
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    const result = routeFeedback(args);
    if (args.format === "markdown") {
      process.stdout.write(renderMarkdown(result));
    } else {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
    if (!result.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${usage()}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}
