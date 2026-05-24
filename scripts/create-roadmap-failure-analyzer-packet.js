"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_TAIL_LINES = 40;
const MAX_TAIL_BYTES = 64 * 1024;

const FORBIDDEN_AUTO_ACTIONS = [
  "auto_fix",
  "retry_command",
  "run_live_cep_ae",
  "install_dependencies",
  "create_branch_or_worktree",
  "push_or_pr",
  "github_issue_or_action",
  "edit_source_from_logs",
  "touch_cep_live_production_package_paths",
];

function usage() {
  return [
    "Usage: node scripts/create-roadmap-failure-analyzer-packet.js [--report <path>] [--log <path>] [--session <path>] [--changed-path <path>] [--tail-lines <n>] [--format json|markdown]",
    "",
    "Reads only explicit failure report, log, or session fixture paths.",
    "Emits a read-only repair packet to stdout. It does not edit source files, retry commands, install packages, or run live AE/CEP.",
  ].join("\n");
}

function parseArgs(argv) {
  const args = {
    reports: [],
    logs: [],
    sessions: [],
    changedPaths: [],
    format: "json",
    tailLines: DEFAULT_TAIL_LINES,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--report") {
      index += 1;
      args.reports.push(requireValue(argv[index], arg));
    } else if (arg === "--log") {
      index += 1;
      args.logs.push(requireValue(argv[index], arg));
    } else if (arg === "--session") {
      index += 1;
      args.sessions.push(requireValue(argv[index], arg));
    } else if (arg === "--changed-path") {
      index += 1;
      args.changedPaths.push(requireValue(argv[index], arg));
    } else if (arg === "--tail-lines") {
      index += 1;
      args.tailLines = parsePositiveInteger(requireValue(argv[index], arg), arg);
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

  return args;
}

function requireValue(value, flag) {
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parsePositiveInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function resolveExisting(inputPath, label) {
  const absolutePath = path.resolve(process.cwd(), inputPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`${label} does not exist: ${absolutePath}`);
  }
  return absolutePath;
}

function readJsonFile(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Failed to parse ${label} JSON ${filePath}: ${error.message}`);
  }
}

function readTailText(filePath, tailLines) {
  const stat = fs.statSync(filePath);
  const readBytes = Math.min(stat.size, MAX_TAIL_BYTES);
  const buffer = Buffer.alloc(readBytes);
  const fd = fs.openSync(filePath, "r");
  try {
    fs.readSync(fd, buffer, 0, readBytes, stat.size - readBytes);
  } finally {
    fs.closeSync(fd);
  }
  return buffer
    .toString("utf8")
    .split(/\r?\n/)
    .slice(-tailLines)
    .join("\n")
    .trim();
}

function readJsonlTail(filePath, tailLines) {
  const text = readTailText(filePath, tailLines);
  if (!text) {
    return [];
  }

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        return {
          event: "unparsed_log_line",
          message: line,
          parseError: `${path.basename(filePath)} tail line ${index + 1}: ${error.message}`,
        };
      }
    });
}

function normalizePath(value) {
  return String(value).replace(/\\/g, "/");
}

function normalizeList(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(normalizeList);
  }
  return [String(value)];
}

function pickFirst(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function collectReports(reportPaths) {
  return reportPaths.map((inputPath) => {
    const absolutePath = resolveExisting(inputPath, "Report path");
    if (!fs.statSync(absolutePath).isFile()) {
      throw new Error(`Report path is not a file: ${absolutePath}`);
    }
    return {
      path: normalizePath(inputPath),
      data: readJsonFile(absolutePath, "report"),
    };
  });
}

function collectLogs(logPaths, tailLines) {
  return logPaths.map((inputPath) => {
    const absolutePath = resolveExisting(inputPath, "Log path");
    if (!fs.statSync(absolutePath).isFile()) {
      throw new Error(`Log path is not a file: ${absolutePath}`);
    }
    return {
      path: normalizePath(inputPath),
      tail: readTailText(absolutePath, tailLines),
    };
  });
}

function collectSessions(sessionPaths, tailLines) {
  return sessionPaths.map((inputPath) => {
    const absolutePath = resolveExisting(inputPath, "Session path");
    const stat = fs.statSync(absolutePath);
    if (stat.isFile()) {
      return {
        path: normalizePath(inputPath),
        state: readJsonFile(absolutePath, "session"),
        events: [],
        report: null,
      };
    }
    if (!stat.isDirectory()) {
      throw new Error(`Session path is not a file or directory: ${absolutePath}`);
    }

    const statePath = path.join(absolutePath, "state.json");
    const eventsPath = path.join(absolutePath, "events.jsonl");
    const report = readFirstSessionReport(absolutePath);
    return {
      path: normalizePath(inputPath),
      state: fs.existsSync(statePath) ? readJsonFile(statePath, "session state") : {},
      events: fs.existsSync(eventsPath) ? readJsonlTail(eventsPath, tailLines) : [],
      report,
    };
  });
}

function readFirstSessionReport(sessionRoot) {
  const reportsDir = path.join(sessionRoot, "reports");
  if (!fs.existsSync(reportsDir) || !fs.statSync(reportsDir).isDirectory()) {
    return null;
  }
  const firstReport = fs
    .readdirSync(reportsDir)
    .filter((entry) => entry.toLowerCase().endsWith(".json"))
    .sort()[0];
  if (!firstReport) {
    return null;
  }
  return readJsonFile(path.join(reportsDir, firstReport), "session report");
}

function hasValueMatching(values, predicate) {
  return values.some((value) => predicate(String(value).toLowerCase()));
}

function collectEvidence(args) {
  const reports = collectReports(args.reports);
  const logs = collectLogs(args.logs, args.tailLines);
  const sessions = collectSessions(args.sessions, args.tailLines);
  return {
    reports,
    logs,
    sessions,
    changedPaths: collectChangedPaths(args.changedPaths, reports, sessions),
    events: sessions.flatMap((session) => session.events),
  };
}

function collectChangedPaths(cliChangedPaths, reports, sessions) {
  const values = [
    ...cliChangedPaths,
    ...reports.flatMap((report) => pathsFromObject(report.data)),
    ...sessions.flatMap((session) => pathsFromObject(session.state)),
    ...sessions.flatMap((session) => pathsFromObject(session.report || {})),
  ];
  return [...new Set(values.map(normalizePath))].sort();
}

function pathsFromObject(value) {
  return [
    ...normalizeList(value.changedPaths),
    ...normalizeList(value.touchedPaths),
    ...normalizeList(value.modifiedPaths),
    ...normalizeList(value.diffPaths),
    ...normalizeList(value.filesChanged),
  ];
}

function nestedValues(evidence, selectors) {
  const values = [];
  const roots = [
    ...evidence.reports.map((report) => report.data),
    ...evidence.sessions.map((session) => session.state),
    ...evidence.sessions.map((session) => session.report || {}),
    ...evidence.events,
  ];

  for (const root of roots) {
    for (const selector of selectors) {
      values.push(readSelector(root, selector));
    }
  }
  return values.filter((value) => value !== undefined && value !== null && value !== "");
}

function readSelector(root, selector) {
  return selector.split(".").reduce((current, part) => {
    if (current && Object.prototype.hasOwnProperty.call(current, part)) {
      return current[part];
    }
    return undefined;
  }, root);
}

function detectFailureClass(evidence) {
  const statuses = nestedValues(evidence, [
    "failureClass",
    "status",
    "state",
    "lifecycleStatus",
    "validation.status",
    "validation.result",
    "validationResult",
    "result",
    "event",
  ]);
  const exitCodes = nestedValues(evidence, ["exitCode", "code", "validation.exitCode"]);
  const changedPaths = evidence.changedPaths.map((entry) => entry.toLowerCase());

  if (hasValueMatching(statuses, (value) => value.includes("validation_failed") || value.includes("validation_failure") || value === "failed")) {
    return "validation_failure";
  }
  if (exitCodes.some((value) => Number(value) > 0) && hasValueMatching(statuses, (value) => value.includes("validation"))) {
    return "validation_failure";
  }
  if (hasValueMatching(statuses, (value) => value === "stuck" || value.includes("stale_activity") || value.includes("timeout"))) {
    return "stuck_session";
  }
  if (changedPaths.some((entry) => isForbiddenPath(entry))) {
    return "forbidden_boundary";
  }
  if (exitCodes.some((value) => Number(value) > 0)) {
    return "command_failure";
  }
  return "unknown_failure";
}

function isForbiddenPath(value) {
  return value === "package.json"
    || value === "package-lock.json"
    || value.startsWith("cep-panel/")
    || value.startsWith("mcp-server/")
    || value.startsWith("chatgpt-connector/")
    || value.startsWith("registry/")
    || value.startsWith("recipes/")
    || value.startsWith(".github/");
}

function detectCommand(evidence) {
  return String(pickFirst(
    ...nestedValues(evidence, [
      "command",
      "failedCommand",
      "validation.command",
      "validation.failedCommand",
      "currentCommand",
      "commandLine",
    ]),
    "(unknown)",
  ));
}

function detectStatus(evidence, failureClass) {
  const status = pickFirst(
    ...nestedValues(evidence, [
      "status",
      "state",
      "lifecycleStatus",
      "validation.status",
      "validation.result",
      "validationResult",
      "result",
      "exitCode",
    ]),
  );
  if (status !== undefined && status !== null && status !== "") {
    return String(status);
  }
  return failureClass === "unknown_failure" ? "unknown" : failureClass;
}

function collectRelevantLogTail(evidence) {
  const parts = [];
  for (const log of evidence.logs) {
    if (log.tail) {
      parts.push(`== ${log.path} ==\n${log.tail}`);
    }
  }
  const eventLines = evidence.events.map((event) => JSON.stringify(event));
  if (eventLines.length > 0) {
    parts.push(`== session events tail ==\n${eventLines.join("\n")}`);
  }
  return parts.join("\n\n");
}

function suspectedCause(failureClass, command, status, evidence) {
  const changedPathText = evidence.changedPaths.length > 0
    ? ` Changed paths were supplied: ${evidence.changedPaths.join(", ")}.`
    : "";
  if (failureClass === "validation_failure") {
    return {
      summary: `Validation failed for ${command} with status ${status}.${changedPathText} Inspect the bounded log tail and repair only within planned paths.`,
      confidence: "high",
    };
  }
  if (failureClass === "stuck_session") {
    return {
      summary: `Roadmap supervisor session appears stuck or stale with status ${status}. Stop and hand off before any retry or broader debugging.`,
      confidence: "medium",
    };
  }
  if (failureClass === "forbidden_boundary") {
    return {
      summary: "Changed paths include a forbidden boundary, so the safe action is fail-closed review instead of automatic repair.",
      confidence: "high",
    };
  }
  if (failureClass === "command_failure") {
    return {
      summary: `Command ${command} failed with status ${status}; bounded repair needs a fresh task scoped to planned paths.`,
      confidence: "medium",
    };
  }
  return {
    summary: "Failure evidence was insufficient for a precise class; keep the next task bounded and read only the explicit artifacts.",
    confidence: "low",
  };
}

function extractPlannedPaths(evidence) {
  const values = [
    ...nestedValues(evidence, ["plannedPaths", "queueItem.plannedPaths"]),
  ].flatMap(normalizeList);
  return [...new Set(values.map(normalizePath))].sort();
}

function extractValidationCommands(evidence, command) {
  const values = nestedValues(evidence, ["validationCommands", "queueItem.validationCommands"]).flatMap(normalizeList);
  if (values.length === 0 && command !== "(unknown)") {
    values.push(command);
  }
  return [...new Set(values.map(String))];
}

function buildRepairPrompt(packetDraft) {
  const plannedPaths = packetDraft.nextBoundedTask.plannedPaths.length > 0
    ? packetDraft.nextBoundedTask.plannedPaths.join(", ")
    : "the current queue item's plannedPaths";
  return [
    `Repair ${packetDraft.failureClass} for command: ${packetDraft.command}.`,
    `Use only explicit failure evidence and edit only ${plannedPaths}.`,
    `Do not auto-fix, retry commands, run live AE/CEP, install dependencies, push, create a PR, or touch CEP/live/production/package paths.`,
    `After the bounded repair, run only the listed validation commands and update the handoff with results.`,
  ].join(" ");
}

function buildNextBoundedTask(failureClass, evidence, command) {
  const validationCommands = extractValidationCommands(evidence, command);
  return {
    title: `Bounded repair for ${failureClass}`,
    goal: "Inspect the explicit failure packet and make a narrow repair only if a later writer task authorizes planned-path edits.",
    plannedPaths: extractPlannedPaths(evidence),
    changedPaths: evidence.changedPaths,
    validationCommands,
    forbiddenActions: FORBIDDEN_AUTO_ACTIONS,
    stopConditions: [
      "unplanned_path_required",
      "live_cep_ae_needed",
      "dependency_or_package_change_needed",
      "command_retry_requested",
      "context_pressure",
    ],
  };
}

function createPacket(args) {
  if (args.reports.length === 0 && args.logs.length === 0 && args.sessions.length === 0) {
    throw new Error("At least one explicit --report, --log, or --session path is required");
  }

  const evidence = collectEvidence(args);
  const failureClass = detectFailureClass(evidence);
  const command = detectCommand(evidence);
  const status = detectStatus(evidence, failureClass);
  const nextBoundedTask = buildNextBoundedTask(failureClass, evidence, command);
  const draft = {
    schema: "roadmap-failure-analyzer-packet.v1",
    generatedAt: new Date().toISOString(),
    failureClass,
    command,
    status,
    relevantLogTail: collectRelevantLogTail(evidence),
    changedPaths: evidence.changedPaths,
    suspectedCause: suspectedCause(failureClass, command, status, evidence),
    forbiddenAutoActions: FORBIDDEN_AUTO_ACTIONS,
    repairPrompt: "",
    nextBoundedTask,
    sourcePaths: {
      reports: args.reports.map(normalizePath),
      logs: args.logs.map(normalizePath),
      sessions: args.sessions.map(normalizePath),
    },
  };
  draft.repairPrompt = buildRepairPrompt(draft);
  return draft;
}

function renderMarkdown(packet) {
  const lines = [
    "# Roadmap Failure Analyzer Packet",
    "",
    `- Failure class: \`${packet.failureClass}\``,
    `- Command: \`${packet.command}\``,
    `- Status: \`${packet.status}\``,
    `- Changed paths: ${packet.changedPaths.length > 0 ? packet.changedPaths.map((entry) => `\`${entry}\``).join(", ") : "(none supplied)"}`,
    `- Suspected cause: ${packet.suspectedCause.summary}`,
    `- Confidence: \`${packet.suspectedCause.confidence}\``,
    "",
    "## Forbidden Auto-Actions",
    "",
    ...packet.forbiddenAutoActions.map((action) => `- \`${action}\``),
    "",
    "## Repair Prompt",
    "",
    packet.repairPrompt,
    "",
    "## Next Bounded Task",
    "",
    `- Title: ${packet.nextBoundedTask.title}`,
    `- Goal: ${packet.nextBoundedTask.goal}`,
    `- Planned paths: ${packet.nextBoundedTask.plannedPaths.length > 0 ? packet.nextBoundedTask.plannedPaths.map((entry) => `\`${entry}\``).join(", ") : "(none supplied)"}`,
    `- Validation commands: ${packet.nextBoundedTask.validationCommands.length > 0 ? packet.nextBoundedTask.validationCommands.map((entry) => `\`${entry}\``).join(", ") : "(none supplied)"}`,
    `- Stop conditions: ${packet.nextBoundedTask.stopConditions.map((entry) => `\`${entry}\``).join(", ")}`,
  ];
  if (packet.relevantLogTail) {
    lines.push("", "## Relevant Log Tail", "", "```", packet.relevantLogTail, "```");
  }
  return `${lines.join("\n")}\n`;
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    const packet = createPacket(args);
    if (args.format === "markdown") {
      process.stdout.write(renderMarkdown(packet));
    } else {
      process.stdout.write(`${JSON.stringify(packet, null, 2)}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${usage()}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}
