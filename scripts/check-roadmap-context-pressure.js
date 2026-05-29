"use strict";

const fs = require("fs");
const path = require("path");

const THRESHOLDS = {
  prepare_handoff: {
    tokens: 180000,
    percent: 60,
    reason: "context_prepare_handoff_threshold",
    nextRequiredAction: "prepare_handoff_soon",
    stop: false,
  },
  no_new_work: {
    tokens: 200000,
    percent: 66,
    reason: "context_no_new_work_threshold",
    nextRequiredAction: "stop_before_new_work_and_prepare_handoff",
    stop: true,
  },
  mandatory_handoff: {
    tokens: 215000,
    percent: 72,
    reason: "context_mandatory_handoff_threshold",
    nextRequiredAction: "stop_implementation_update_handoff",
    stop: true,
  },
  hard_ceiling: {
    tokens: 225000,
    percent: 76,
    reason: "context_hard_ceiling_threshold",
    nextRequiredAction: "only_handoff_text_allowed",
    stop: true,
  },
  absolute_ceiling: {
    tokens: 230000,
    percent: 78,
    reason: "context_absolute_ceiling_threshold",
    nextRequiredAction: "only_handoff_text_allowed",
    stop: true,
  },
};

const LEVEL_ORDER = [
  "below_threshold",
  "prepare_handoff",
  "no_new_work",
  "mandatory_handoff",
  "hard_ceiling",
  "absolute_ceiling",
];

function usage() {
  return [
    "Usage: node scripts/check-roadmap-context-pressure.js [--state <path>] [--metrics <path>] [--format json|markdown]",
    "",
    "Reads explicit roadmap state or context metrics fixture paths.",
    "Reports context-pressure stop reasons and the next required action without editing files.",
  ].join("\n");
}

function requireValue(value, flag) {
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parseArgs(argv) {
  const args = {
    state: null,
    metrics: null,
    format: "json",
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--state") {
      index += 1;
      args.state = requireValue(argv[index], arg);
    } else if (arg === "--metrics") {
      index += 1;
      args.metrics = requireValue(argv[index], arg);
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

  if (!args.help && !args.state && !args.metrics) {
    throw new Error("--state or --metrics is required");
  }

  return args;
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

function readSelector(root, selector) {
  return selector.split(".").reduce((current, part) => {
    if (current && Object.prototype.hasOwnProperty.call(current, part)) {
      return current[part];
    }
    return undefined;
  }, root);
}

function flattenValues(value) {
  if (value === undefined || value === null || value === "") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(flattenValues);
  }
  return [value];
}

function valuesForSelectors(roots, selectors) {
  const values = [];
  for (const root of roots) {
    for (const selector of selectors) {
      values.push(...flattenValues(readSelector(root, selector)));
    }
  }
  return values;
}

function toNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/%$/, "");
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function maxNumber(values) {
  let max = null;
  for (const value of values) {
    const numberValue = toNumber(value);
    if (numberValue !== null && (max === null || numberValue > max)) {
      max = numberValue;
    }
  }
  return max;
}

function normalizePercent(value) {
  if (value === null) {
    return null;
  }
  if (value >= 0 && value <= 1) {
    return value * 100;
  }
  return value;
}

function collectMetrics(args) {
  const documents = [];
  const sourcePaths = {};
  if (args.state) {
    sourcePaths.state = normalizePath(args.state);
    documents.push(readJson(args.state, "State path"));
  }
  if (args.metrics) {
    sourcePaths.metrics = normalizePath(args.metrics);
    documents.push(readJson(args.metrics, "Metrics path"));
  }

  const tokenCount = maxNumber(valuesForSelectors(documents, [
    "tokenCount",
    "tokens",
    "estimatedTokens",
    "contextTokens",
    "context.tokenCount",
    "context.tokens",
    "context.estimatedTokens",
    "metrics.tokenCount",
    "metrics.contextTokens",
    "usage.contextTokens",
    "usage.estimatedTokens",
  ]));

  const contextPercent = normalizePercent(maxNumber(valuesForSelectors(documents, [
    "contextPercent",
    "percent",
    "percentage",
    "context.percent",
    "context.contextPercent",
    "metrics.contextPercent",
    "usage.contextPercent",
    "ui.contextPercent",
    "ui.reportedPercent",
  ])));

  const modes = valuesForSelectors(documents, [
    "mode",
    "context.mode",
    "contextPressure.mode",
    "handoff.mode",
    "ui.contextMode",
  ]).map((value) => String(value).toLowerCase());

  const mandatoryFlags = valuesForSelectors(documents, [
    "mandatoryHandoff",
    "context.mandatoryHandoff",
    "contextPressure.mandatoryHandoff",
  ]);
  const hardFlags = valuesForSelectors(documents, [
    "hardCeiling",
    "context.hardCeiling",
    "contextPressure.hardCeiling",
  ]);
  const absoluteFlags = valuesForSelectors(documents, [
    "absoluteCeiling",
    "context.absoluteCeiling",
    "contextPressure.absoluteCeiling",
  ]);

  return {
    tokenCount,
    contextPercent,
    modes,
    explicitMandatoryHandoff: mandatoryFlags.some(isTruthy),
    explicitHardCeiling: hardFlags.some(isTruthy),
    explicitAbsoluteCeiling: absoluteFlags.some(isTruthy),
    sourcePaths,
  };
}

function isTruthy(value) {
  if (value === true) {
    return true;
  }
  if (typeof value === "string") {
    return ["true", "yes", "1"].includes(value.trim().toLowerCase());
  }
  return value === 1;
}

function highestLevelFromMetrics(metrics) {
  let highest = "below_threshold";
  for (const level of LEVEL_ORDER.slice(1)) {
    const threshold = THRESHOLDS[level];
    if (
      (metrics.tokenCount !== null && metrics.tokenCount >= threshold.tokens) ||
      (metrics.contextPercent !== null && metrics.contextPercent >= threshold.percent)
    ) {
      highest = level;
    }
  }

  if (metrics.modes.includes("absolute_ceiling") || metrics.modes.includes("absolute-ceiling") || metrics.explicitAbsoluteCeiling) {
    highest = "absolute_ceiling";
  } else if (metrics.modes.includes("hard_ceiling") || metrics.modes.includes("hard-ceiling") || metrics.explicitHardCeiling) {
    highest = "hard_ceiling";
  } else if (
    metrics.modes.includes("mandatory_handoff") ||
    metrics.modes.includes("mandatory-handoff") ||
    metrics.modes.includes("context_pressure") ||
    metrics.modes.includes("context-pressure") ||
    metrics.explicitMandatoryHandoff
  ) {
    highest = maxLevel(highest, "mandatory_handoff");
  }

  return highest;
}

function maxLevel(left, right) {
  return LEVEL_ORDER.indexOf(left) >= LEVEL_ORDER.indexOf(right) ? left : right;
}

function evaluateContextPressure(args) {
  const metrics = collectMetrics(args);
  const level = highestLevelFromMetrics(metrics);
  const threshold = THRESHOLDS[level];
  const stopReasons = [];
  const warningReasons = [];

  if (threshold) {
    if (threshold.stop) {
      stopReasons.push(threshold.reason);
    } else {
      warningReasons.push(threshold.reason);
    }
  }

  if (metrics.modes.includes("mandatory_handoff") || metrics.modes.includes("mandatory-handoff") || metrics.explicitMandatoryHandoff) {
    if (!stopReasons.includes("explicit_mandatory_handoff_state")) {
      stopReasons.push("explicit_mandatory_handoff_state");
    }
  }
  if (metrics.modes.includes("hard_ceiling") || metrics.modes.includes("hard-ceiling") || metrics.explicitHardCeiling || metrics.explicitAbsoluteCeiling) {
    if (!stopReasons.includes("explicit_hard_ceiling_state")) {
      stopReasons.push("explicit_hard_ceiling_state");
    }
  }

  const stop = stopReasons.length > 0;
  return {
    schema: "roadmap-context-pressure-result.v1",
    ok: !stop,
    level,
    stop,
    implementationAllowed: !stop,
    stopReasons,
    warningReasons,
    nextRequiredAction: threshold ? threshold.nextRequiredAction : "continue_current_bounded_item",
    observed: {
      tokenCount: metrics.tokenCount,
      contextPercent: metrics.contextPercent,
      modes: metrics.modes,
    },
    thresholds: THRESHOLDS,
    sourcePaths: metrics.sourcePaths,
  };
}

function renderMarkdown(result) {
  return [
    "# Roadmap Context Pressure",
    "",
    `- Level: \`${result.level}\``,
    `- OK: \`${result.ok}\``,
    `- Implementation allowed: \`${result.implementationAllowed}\``,
    `- Token count: \`${result.observed.tokenCount === null ? "(unknown)" : result.observed.tokenCount}\``,
    `- Context percent: \`${result.observed.contextPercent === null ? "(unknown)" : result.observed.contextPercent}\``,
    `- Stop reasons: ${result.stopReasons.length > 0 ? result.stopReasons.map((reason) => `\`${reason}\``).join(", ") : "(none)"}`,
    `- Warning reasons: ${result.warningReasons.length > 0 ? result.warningReasons.map((reason) => `\`${reason}\``).join(", ") : "(none)"}`,
    `- Next required action: \`${result.nextRequiredAction}\``,
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
    const result = evaluateContextPressure(args);
    if (args.format === "markdown") {
      process.stdout.write(renderMarkdown(result));
    } else {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
    if (result.stop) {
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
