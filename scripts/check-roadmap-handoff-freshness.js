"use strict";

const fs = require("fs");
const path = require("path");

function usage() {
  return [
    "Usage: node scripts/check-roadmap-handoff-freshness.js --report <path> --state <path> --handoff <path> [--format json|markdown]",
    "",
    "Reads explicit roadmap report, state, and handoff paths.",
    "Rejects stale or incomplete handoffs without editing them.",
  ].join("\n");
}

function parseArgs(argv) {
  const args = {
    report: null,
    state: null,
    handoff: null,
    format: "json",
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--report") {
      index += 1;
      args.report = requireValue(argv[index], arg);
    } else if (arg === "--state") {
      index += 1;
      args.state = requireValue(argv[index], arg);
    } else if (arg === "--handoff") {
      index += 1;
      args.handoff = requireValue(argv[index], arg);
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

  if (!args.help) {
    for (const key of ["report", "state", "handoff"]) {
      if (!args[key]) {
        throw new Error(`--${key} is required`);
      }
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

function readText(inputPath, label) {
  return fs.readFileSync(resolveExisting(inputPath, label), "utf8");
}

function normalizePath(value) {
  return String(value).replace(/\\/g, "/");
}

function flattenValues(value) {
  if (value === undefined || value === null || value === "") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(flattenValues);
  }
  return [String(value)];
}

function readSelector(root, selector) {
  return selector.split(".").reduce((current, part) => {
    if (current && Object.prototype.hasOwnProperty.call(current, part)) {
      return current[part];
    }
    return undefined;
  }, root);
}

function nestedValues(roots, selectors) {
  const values = [];
  for (const root of roots) {
    for (const selector of selectors) {
      values.push(...flattenValues(readSelector(root, selector)));
    }
  }
  return values.filter(Boolean);
}

function firstValue(values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function collectExpected(report, state) {
  const roots = [report, state];
  const queueItemIds = uniqueValues(nestedValues(roots, [
    "queueItemId",
    "itemId",
    "queueItem.id",
    "report.queueItemId",
  ]));
  const labels = uniqueValues(nestedValues(roots, [
    "label",
    "queueLabel",
    "queueItem.label",
  ]));
  const commit = firstValue(nestedValues(roots, [
    "completedBy.commit",
    "commit",
    "commitId",
    "result.commit",
    "validation.commit",
  ]));
  const validationStatus = firstValue(nestedValues(roots, [
    "validation.status",
    "validation.result",
    "validationResult",
    "status",
  ]));
  const sourceUpdatedAt = latestTimestamp(nestedValues(roots, [
    "handoff.updatedAt",
    "completedAt",
    "updatedAt",
    "finishedAt",
    "validation.completedAt",
  ]));

  return {
    queueItemIds,
    labels,
    commit: commit ? String(commit) : "",
    validationStatus: validationStatus ? String(validationStatus) : "",
    sourceUpdatedAt,
  };
}

function latestTimestamp(values) {
  let latest = null;
  for (const value of values) {
    const timestamp = Date.parse(value);
    if (!Number.isNaN(timestamp) && (latest === null || timestamp > latest)) {
      latest = timestamp;
    }
  }
  return latest;
}

function extractHandoffTimestamp(handoffText) {
  const patterns = [
    /^Handoff timestamp:\s*(.+)$/im,
    /^Timestamp:\s*(.+)$/im,
    /^Дата handoff:\s*(.+)$/im,
  ];
  for (const pattern of patterns) {
    const match = handoffText.match(pattern);
    if (match) {
      const timestamp = Date.parse(match[1].trim());
      if (!Number.isNaN(timestamp)) {
        return timestamp;
      }
    }
  }
  return null;
}

function hasExactNextPrompt(handoffText) {
  const headingPattern = /^##\s+(Exact Next Prompt|Точный следующий prompt|Точный следующий промпт)\s*$/gim;
  const match = headingPattern.exec(handoffText);
  if (!match) {
    return false;
  }
  const sectionStart = match.index + match[0].length;
  const remaining = handoffText.slice(sectionStart);
  const nextHeading = remaining.search(/^##\s+/m);
  const section = nextHeading === -1 ? remaining : remaining.slice(0, nextHeading);
  return section.trim().length > 0;
}

function isPassedValidation(status) {
  if (!status) {
    return true;
  }
  const normalized = status.toLowerCase();
  return normalized === "passed" || normalized === "pass" || normalized === "completed" || normalized === "ok";
}

function checkFreshness(args) {
  const report = readJson(args.report, "Report path");
  const state = readJson(args.state, "State path");
  const handoffText = readText(args.handoff, "Handoff path");
  const expected = collectExpected(report, state);
  const reasons = [];

  if (expected.queueItemIds.length > 1) {
    reasons.push("queue_item_mismatch");
  }
  if (!expected.commit) {
    reasons.push("missing_commit");
  } else if (!handoffText.includes(expected.commit)) {
    reasons.push("missing_commit");
  }
  if (!hasExactNextPrompt(handoffText)) {
    reasons.push("missing_next_prompt");
  }
  if (!isPassedValidation(expected.validationStatus)) {
    reasons.push("validation_not_passed");
  }

  const handoffUpdatedAt = extractHandoffTimestamp(handoffText);
  if (handoffUpdatedAt === null) {
    reasons.push("missing_handoff_timestamp");
  } else if (expected.sourceUpdatedAt !== null && handoffUpdatedAt < expected.sourceUpdatedAt) {
    reasons.push("stale_handoff");
  }

  const ok = reasons.length === 0;
  return {
    schema: "roadmap-handoff-freshness-result.v1",
    ok,
    status: ok ? "fresh" : "stale",
    reasons,
    expected: {
      queueItemId: expected.queueItemIds[0] || "",
      label: expected.labels[0] || "",
      commit: expected.commit,
      validationStatus: expected.validationStatus,
      sourceUpdatedAt: expected.sourceUpdatedAt === null ? null : new Date(expected.sourceUpdatedAt).toISOString(),
      handoffUpdatedAt: handoffUpdatedAt === null ? null : new Date(handoffUpdatedAt).toISOString(),
      nextPromptPresent: hasExactNextPrompt(handoffText),
    },
    sourcePaths: {
      report: normalizePath(args.report),
      state: normalizePath(args.state),
      handoff: normalizePath(args.handoff),
    },
  };
}

function renderMarkdown(result) {
  return [
    "# Roadmap Handoff Freshness",
    "",
    `- Status: \`${result.status}\``,
    `- Queue item: \`${result.expected.queueItemId || "(unknown)"}\``,
    `- Label: \`${result.expected.label || "(unknown)"}\``,
    `- Commit: \`${result.expected.commit || "(missing)"}\``,
    `- Source updated at: \`${result.expected.sourceUpdatedAt || "(unknown)"}\``,
    `- Handoff updated at: \`${result.expected.handoffUpdatedAt || "(missing)"}\``,
    `- Next prompt present: \`${result.expected.nextPromptPresent}\``,
    `- Reasons: ${result.reasons.length > 0 ? result.reasons.map((reason) => `\`${reason}\``).join(", ") : "(none)"}`,
    "",
  ].join("\n");
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    const result = checkFreshness(args);
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
