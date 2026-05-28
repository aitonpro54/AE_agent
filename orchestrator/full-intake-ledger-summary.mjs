#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_LEDGER_PATH =
  ".codex-runtime/sdk/generic-repo-importer/kyletmartinez-after-effects-scripts-intake/queue-ledger.json";
const SCHEMA = "generic-repo-full-intake.ledger-summary.v1";
const DEFAULT_ID_LIMIT = 16;
const DEFAULT_FAMILY_LIMIT = 16;
const DEFAULT_REASON_LIMIT = 16;
const REASON_TEXT_LIMIT = 240;

function usage() {
  return [
    "Usage: node orchestrator/full-intake-ledger-summary.mjs [options]",
    "",
    "Options:",
    "  --ledger <path>          Durable generic repository importer ledger.",
    `                           Defaults to ${DEFAULT_LEDGER_PATH}`,
    "  --target-repo <path>     Repository root for relative paths. Defaults to current directory.",
    "  --id-limit <n>           Max ids per compact group. Defaults to 16.",
    "  --family-limit <n>       Max family rows. Defaults to 16.",
    "  --reason-limit <n>       Max failed reason rows. Defaults to 16.",
    "  --compact-json           Print compact JSON.",
    "  --json                   Alias for --compact-json.",
    "  --compact                Print compact human-readable lines.",
    "  --help                   Show this help.",
  ].join("\n");
}

function parsePositiveInt(value, label) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label}-must-be-positive-integer`);
  }
  return parsed;
}

function parseArgs(argv) {
  const options = {
    familyLimit: DEFAULT_FAMILY_LIMIT,
    idLimit: DEFAULT_ID_LIMIT,
    ledger: DEFAULT_LEDGER_PATH,
    output: "compact",
    reasonLimit: DEFAULT_REASON_LIMIT,
    targetRepo: process.cwd(),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help") {
      options.help = true;
    } else if (arg === "--compact") {
      options.output = "compact";
    } else if (arg === "--compact-json" || arg === "--json") {
      options.output = "json";
    } else if (arg === "--ledger") {
      options.ledger = argv[++index];
    } else if (arg === "--target-repo") {
      options.targetRepo = argv[++index];
    } else if (arg === "--id-limit") {
      options.idLimit = parsePositiveInt(argv[++index], "id-limit");
    } else if (arg === "--family-limit") {
      options.familyLimit = parsePositiveInt(argv[++index], "family-limit");
    } else if (arg === "--reason-limit") {
      options.reasonLimit = parsePositiveInt(argv[++index], "reason-limit");
    } else {
      throw new Error(`unknown-option:${arg}`);
    }
  }
  return options;
}

function normalizeRepoPath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function relativeTo(base, value) {
  const relative = path.relative(path.resolve(base), path.resolve(value));
  return normalizeRepoPath(relative || ".");
}

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label}-json-read-failed:${error.message}`);
  }
}

function countBy(values) {
  const counts = {};
  for (const value of values) {
    const key = String(value || "unknown");
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function uniqueBounded(values, limit) {
  const seen = new Set();
  const all = [];
  for (const value of Array.isArray(values) ? values : []) {
    const text = String(value || "").trim();
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    all.push(text);
  }
  return {
    count: all.length,
    ids: all.slice(0, limit),
    omitted: Math.max(0, all.length - limit),
  };
}

function familyFromEntry(entry) {
  const idParts = String(entry?.id || "").split("-").filter(Boolean);
  if (idParts.length >= 2 && idParts[0] === "tool") {
    return `${idParts[0]}-${idParts[1]}`;
  }
  const firstSourceSegment = String(entry?.sourcePath || "").split(/[\\/]/).filter(Boolean)[0];
  if (firstSourceSegment) {
    return `tool-${firstSourceSegment.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
  }
  return "unknown-family";
}

function isQueuedLiveLaneNeeded(entry) {
  return entry?.status === "queued" && entry?.classification === "live_lane_needed";
}

function isFailed(entry) {
  const status = String(entry?.status || entry?.failClosed?.status || "");
  return status === "failed_import" || status.startsWith("failed_");
}

function isTerminal(entry) {
  const status = String(entry?.status || "");
  return Boolean(status && status !== "queued");
}

function reasonFor(entry) {
  const reason =
    entry?.failClosed?.reason ||
    entry?.resolution?.reason ||
    entry?.reason ||
    entry?.shortReason ||
    "unknown";
  const text = String(reason).replace(/\s+/g, " ").trim();
  return text.length > REASON_TEXT_LIMIT ? `${text.slice(0, REASON_TEXT_LIMIT - 3)}...` : text;
}

function summarizeLedger(options) {
  const targetRepo = path.resolve(options.targetRepo || process.cwd());
  const ledgerPath = path.resolve(targetRepo, options.ledger);
  if (!existsSync(ledgerPath)) {
    throw new Error(`ledger-not-found:${ledgerPath}`);
  }
  const ledger = readJson(ledgerPath, "queue-ledger");
  const entries = Array.isArray(ledger.entries) ? ledger.entries : [];
  const families = new Map();
  const queuedLiveLaneNeededEntries = [];
  const failedEntries = [];
  const terminalEntries = [];

  for (const entry of entries) {
    const family = familyFromEntry(entry);
    const current = families.get(family) || {
      family,
      failedIds: [],
      queuedLiveLaneNeededIds: [],
      terminal: 0,
      total: 0,
    };
    current.total += 1;
    if (isQueuedLiveLaneNeeded(entry)) {
      current.queuedLiveLaneNeededIds.push(entry.id);
      queuedLiveLaneNeededEntries.push(entry);
    }
    if (isFailed(entry)) {
      current.failedIds.push(entry.id);
      failedEntries.push(entry);
    }
    if (isTerminal(entry)) {
      current.terminal += 1;
      terminalEntries.push(entry);
    }
    families.set(family, current);
  }

  const familyCounts = Array.from(families.values())
    .sort((left, right) => left.family.localeCompare(right.family))
    .slice(0, options.familyLimit)
    .map((family) => ({
      family: family.family,
      total: family.total,
      terminal: family.terminal,
      queuedLiveLaneNeeded: uniqueBounded(family.queuedLiveLaneNeededIds, options.idLimit),
      failedCandidateIds: uniqueBounded(family.failedIds, options.idLimit),
    }));

  return {
    schema: SCHEMA,
    ok: true,
    generatedAt: new Date().toISOString(),
    ledgerPath: relativeTo(targetRepo, ledgerPath),
    compactBudget: {
      familyLimit: options.familyLimit,
      idLimit: options.idLimit,
      reasonLimit: options.reasonLimit,
      rule: "read durable ledger only and print compact counts, ids, and short failure reasons",
    },
    counts: {
      entries: entries.length,
      byStatus: countBy(entries.map((entry) => entry.status || "unknown")),
      byClassification: countBy(entries.map((entry) => entry.classification || "unknown")),
      familyCount: families.size,
    },
    terminalCounts: {
      total: terminalEntries.length,
      byStatus: countBy(terminalEntries.map((entry) => entry.status || "unknown")),
    },
    familyCounts,
    familyCountOmitted: Math.max(0, families.size - options.familyLimit),
    queuedLiveLaneNeeded: {
      count: queuedLiveLaneNeededEntries.length,
      candidateIds: uniqueBounded(queuedLiveLaneNeededEntries.map((entry) => entry.id), options.idLimit),
      byFamily: familyCounts
        .filter((family) => family.queuedLiveLaneNeeded.count > 0)
        .map((family) => ({
          family: family.family,
          count: family.queuedLiveLaneNeeded.count,
          ids: family.queuedLiveLaneNeeded.ids,
          omitted: family.queuedLiveLaneNeeded.omitted,
        })),
    },
    failed: {
      count: failedEntries.length,
      items: failedEntries.slice(0, options.reasonLimit).map((entry) => ({
        id: entry.id || null,
        status: entry.status || entry.failClosed?.status || null,
        reason: reasonFor(entry),
      })),
      omitted: Math.max(0, failedEntries.length - options.reasonLimit),
    },
    nextAction:
      queuedLiveLaneNeededEntries.length > 0
        ? "add/prove the next narrow lane family, then run full-intake with --compact-json"
        : "use compact status before any next supervisor run",
  };
}

function formatCompact(summary) {
  const lines = [];
  const byStatus = Object.entries(summary.counts.byStatus)
    .map(([status, count]) => `${status}:${count}`)
    .join(", ");
  lines.push(`Full-intake ledger summary: ${summary.ledgerPath}`);
  lines.push(`Counts: entries=${summary.counts.entries}${byStatus ? `, ${byStatus}` : ""}`);
  lines.push(`Terminal: total=${summary.terminalCounts.total}`);
  lines.push(`Queued live_lane_needed: ${summary.queuedLiveLaneNeeded.count}`);
  for (const family of summary.queuedLiveLaneNeeded.byFamily) {
    const suffix = family.omitted > 0 ? ` (+${family.omitted} more)` : "";
    lines.push(`  ${family.family}: ${family.count} [${family.ids.join(", ") || "none"}]${suffix}`);
  }
  lines.push(`Failed: ${summary.failed.count}`);
  for (const item of summary.failed.items) {
    lines.push(`  ${item.id}: ${item.reason}`);
  }
  if (summary.failed.omitted > 0) {
    lines.push(`  ... ${summary.failed.omitted} more failed entries omitted`);
  }
  lines.push(`Next: ${summary.nextAction}`);
  return `${lines.join("\n")}\n`;
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return;
    }
    const summary = summarizeLedger(options);
    if (options.output === "json") {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      process.stdout.write(formatCompact(summary));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

main();
