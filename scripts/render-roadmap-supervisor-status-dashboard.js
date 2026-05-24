"use strict";

const fs = require("fs");
const path = require("path");

function usage() {
  return [
    "Usage: node scripts/render-roadmap-supervisor-status-dashboard.js --session-root <path> [--output <path>]",
    "",
    "Reads state.json, events.jsonl, and immediate reports/*.json artifacts from a supplied roadmap supervisor session root or fixture root.",
    "Prints static Markdown to stdout by default. Writes Markdown only when --output is supplied.",
  ].join("\n");
}

function parseArgs(argv) {
  const args = {
    sessionRoot: null,
    output: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--session-root") {
      index += 1;
      args.sessionRoot = argv[index] || null;
    } else if (arg === "--output") {
      index += 1;
      args.output = argv[index] || null;
    } else if (!args.sessionRoot && !arg.startsWith("--")) {
      args.sessionRoot = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Failed to parse JSON ${filePath}: ${error.message}`);
  }
}

function readEvents(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Failed to parse JSONL ${filePath}:${index + 1}: ${error.message}`);
      }
    });
}

function discoverReport(sessionRoot, state) {
  const stateReportPath = pickFirst(state.reportPath, state.report && state.report.path);
  if (stateReportPath) {
    const absolute = path.isAbsolute(stateReportPath)
      ? stateReportPath
      : path.join(sessionRoot, stateReportPath);
    return {
      displayPath: normalizePath(stateReportPath),
      data: readJson(absolute, null),
    };
  }

  const reportsDir = path.join(sessionRoot, "reports");
  if (!fs.existsSync(reportsDir) || !fs.statSync(reportsDir).isDirectory()) {
    return {
      displayPath: "(none)",
      data: null,
    };
  }

  const candidates = fs
    .readdirSync(reportsDir)
    .filter((entry) => entry.toLowerCase().endsWith(".json"))
    .sort();
  if (candidates.length === 0) {
    return {
      displayPath: "(none)",
      data: null,
    };
  }

  const relativePath = path.join("reports", candidates[0]);
  return {
    displayPath: normalizePath(relativePath),
    data: readJson(path.join(sessionRoot, relativePath), null),
  };
}

function discoverSessionRoots(inputRoot) {
  const absoluteRoot = path.resolve(process.cwd(), inputRoot);
  if (!fs.existsSync(absoluteRoot)) {
    throw new Error(`Session root does not exist: ${absoluteRoot}`);
  }
  if (!fs.statSync(absoluteRoot).isDirectory()) {
    throw new Error(`Session root is not a directory: ${absoluteRoot}`);
  }

  if (fs.existsSync(path.join(absoluteRoot, "state.json"))) {
    return [absoluteRoot];
  }

  return fs
    .readdirSync(absoluteRoot)
    .map((entry) => path.join(absoluteRoot, entry))
    .filter((entryPath) => {
      return fs.statSync(entryPath).isDirectory() && fs.existsSync(path.join(entryPath, "state.json"));
    })
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

function pickFirst(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function normalizeList(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry));
  }
  return [String(value)];
}

function normalizePath(value) {
  return String(value).replace(/\\/g, "/");
}

function latestEvent(events) {
  const datedEvents = events.filter((event) => event && event.ts);
  if (datedEvents.length === 0) {
    return events[events.length - 1] || null;
  }
  return [...datedEvents].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))[0];
}

function validationFrom(state, report, events) {
  return pickFirst(
    state.validationResult,
    state.validation && state.validation.result,
    state.validation && state.validation.status,
    report && report.validationResult,
    report && report.validation && report.validation.result,
    report && report.validation && report.validation.status,
    latestValidationEvent(events),
    "unknown",
  );
}

function latestValidationEvent(events) {
  const event = [...events]
    .reverse()
    .find((entry) => entry.event === "validation_passed" || entry.event === "validation_failed");
  if (!event) {
    return null;
  }
  if (event.event === "validation_passed") {
    return "passed";
  }
  if (event.event === "validation_failed") {
    return "failed";
  }
  return null;
}

function defaultNextAction(status) {
  if (status === "done") {
    return "Continue to the next queue item.";
  }
  if (status === "stuck" || status === "errored" || status === "escalated") {
    return "Stop and hand off with blockers before retrying.";
  }
  if (status === "needs_input") {
    return "Ask for the required user or supervisor input.";
  }
  return "Continue bounded validation or planned-path work.";
}

function summarizeSession(sessionRoot) {
  const statePath = path.join(sessionRoot, "state.json");
  const state = readJson(statePath, {});
  const events = readEvents(path.join(sessionRoot, "events.jsonl"));
  const report = discoverReport(sessionRoot, state);
  const latest = latestEvent(events);
  const status = String(pickFirst(state.lifecycleStatus, state.lifecycle, state.state, state.status, "unknown"));
  const reportData = report.data || {};

  return {
    sessionId: String(pickFirst(state.sessionId, path.basename(sessionRoot))),
    queueItem: String(pickFirst(state.queueItemId, state.taskId, state.itemId, state.queueItem && state.queueItem.id, "unknown")),
    role: String(pickFirst(state.role, state.sessionRole, "unknown")),
    lifecycleStatus: status,
    lastActivity: formatLastActivity(latest, state),
    validationResult: String(validationFrom(state, reportData, events)),
    blockers: normalizeList(pickFirst(state.blockers, reportData.blockers)),
    changedPaths: normalizeList(pickFirst(state.changedPaths, reportData.changedPaths)).map(normalizePath),
    handoffPath: normalizePath(pickFirst(state.handoffPath, state.handoff && state.handoff.path, reportData.handoffPath, "(none)")),
    reportPath: report.displayPath,
    nextAction: String(pickFirst(state.nextAction, latest && latest.nextAction, reportData.nextAction, defaultNextAction(status))),
  };
}

function formatLastActivity(event, state) {
  if (event) {
    const parts = [
      pickFirst(event.ts, "(no timestamp)"),
      pickFirst(event.event, "event"),
    ];
    const message = pickFirst(event.message, event.command, event.nextAction);
    if (message) {
      parts.push(message);
    }
    return parts.join(" - ");
  }
  return pickFirst(state.updatedAt, state.startedAt, "(none)");
}

function renderList(values) {
  if (!values || values.length === 0) {
    return "(none)";
  }
  return values.map((value) => `\`${escapeMarkdown(value)}\``).join(", ");
}

function escapeMarkdown(value) {
  return String(value).replace(/`/g, "\\`");
}

function renderDashboard(sessions, inputRoot) {
  const lines = [
    "# Roadmap Supervisor Status Dashboard",
    "",
    `Source root: \`${escapeMarkdown(normalizePath(path.resolve(process.cwd(), inputRoot)))}\``,
    `Session count: ${sessions.length}`,
    "",
  ];

  if (sessions.length === 0) {
    lines.push("No sessions found.");
    return `${lines.join("\n")}\n`;
  }

  for (const session of sessions) {
    lines.push(`## ${session.sessionId}`);
    lines.push("");
    lines.push(`- Queue item: \`${escapeMarkdown(session.queueItem)}\``);
    lines.push(`- Role: \`${escapeMarkdown(session.role)}\``);
    lines.push(`- Lifecycle status: \`${escapeMarkdown(session.lifecycleStatus)}\``);
    lines.push(`- Last activity: ${escapeMarkdown(session.lastActivity)}`);
    lines.push(`- Validation result: \`${escapeMarkdown(session.validationResult)}\``);
    lines.push(`- Blockers: ${renderList(session.blockers)}`);
    lines.push(`- Changed paths: ${renderList(session.changedPaths)}`);
    lines.push(`- Handoff path: \`${escapeMarkdown(session.handoffPath)}\``);
    lines.push(`- Report path: \`${escapeMarkdown(session.reportPath)}\``);
    lines.push(`- Next action: ${escapeMarkdown(session.nextAction)}`);
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function renderFromRoot(sessionRoot) {
  const roots = discoverSessionRoots(sessionRoot);
  const sessions = roots.map(summarizeSession).sort((a, b) => a.sessionId.localeCompare(b.sessionId));
  return renderDashboard(sessions, sessionRoot);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (!args.sessionRoot) {
    throw new Error(`Missing required --session-root.\n${usage()}`);
  }

  const markdown = renderFromRoot(args.sessionRoot);
  if (args.output) {
    const outputPath = path.resolve(process.cwd(), args.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, markdown, "utf8");
  } else {
    process.stdout.write(markdown);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  parseArgs,
  discoverSessionRoots,
  summarizeSession,
  renderDashboard,
  renderFromRoot,
};
