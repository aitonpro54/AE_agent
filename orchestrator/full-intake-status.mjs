#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";

const SCHEMA = "generic-repo-full-intake.compact-status.v1";
const DEFAULT_RUN_ROOT_RELATIVE = ".codex-runtime/sdk/generic-repo-full-intake";
const DEFAULT_EVENT_LIMIT = 20;
const DEFAULT_BATCH_LIMIT = 3;
const TERMINAL_EVENT_NAMES = new Set([
  "candidate_blocked_live_lane",
  "candidate_blocked_policy",
  "candidate_completed",
  "candidate_import_failed",
  "candidate_live_rerun_failed",
  "candidate_skipped_unsafe",
]);
const TERMINAL_ITEM_STATUSES = new Set([
  "blocked_live_lane_synthesis_ambiguous",
  "blocked_live_lane_synthesis_incomplete",
  "blocked_live_lane_synthesis_unsafe",
  "blocked_live_lane_template_missing",
  "blocked_live_lane_validation_failed",
  "blocked_live_preflight_failed",
  "blocked_live_proof_failed",
  "blocked_policy",
  "completed",
  "failed_import",
  "failed_live_rerun",
  "skipped_unsafe_candidate",
]);

function usage() {
  return [
    "Usage: node orchestrator/full-intake-status.mjs --run-id <id> [options]",
    "",
    "Options:",
    "  --target-repo <path>    Repository root. Defaults to current directory.",
    "  --run-root <path>       Explicit full-intake run root.",
    "  --event-limit <n>       Tail event count. Defaults to 20.",
    "  --batch-limit <n>       Latest batch report count. Defaults to 3.",
    "  --json                  Print compact JSON.",
    "  --compact               Print compact human-readable lines.",
    "  --write-status          Write compact-status.json under the run root.",
    "  --no-processes          Skip active process inspection.",
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    batchLimit: DEFAULT_BATCH_LIMIT,
    eventLimit: DEFAULT_EVENT_LIMIT,
    includeProcesses: true,
    output: "compact",
    targetRepo: process.cwd(),
    writeStatus: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--run-id") {
      options.runId = argv[++index];
    } else if (arg === "--target-repo") {
      options.targetRepo = argv[++index];
    } else if (arg === "--run-root") {
      options.runRoot = argv[++index];
    } else if (arg === "--event-limit") {
      options.eventLimit = parsePositiveInt(argv[++index], "event-limit");
    } else if (arg === "--batch-limit") {
      options.batchLimit = parsePositiveInt(argv[++index], "batch-limit");
    } else if (arg === "--json") {
      options.output = "json";
    } else if (arg === "--compact") {
      options.output = "compact";
    } else if (arg === "--write-status") {
      options.writeStatus = true;
    } else if (arg === "--no-processes") {
      options.includeProcesses = false;
    } else {
      throw new Error(`unknown-argument: ${arg}`);
    }
  }
  if (!options.help && !options.runId && !options.runRoot) {
    throw new Error("missing-run-id-or-run-root");
  }
  return options;
}

function parsePositiveInt(value, label) {
  const number = Number.parseInt(value, 10);
  if (!Number.isInteger(number) || number < 1 || number > 200) {
    throw new Error(`invalid-${label}: ${value}`);
  }
  return number;
}

function normalizeSlashes(value) {
  return String(value || "").replace(/\\/g, "/");
}

function relativeTo(root, filePath) {
  if (!filePath) {
    return null;
  }
  const relative = path.relative(root, filePath);
  return normalizeSlashes(relative || filePath);
}

function resolveRunRoot(options) {
  const targetRepo = path.resolve(options.targetRepo);
  if (options.runRoot) {
    return path.resolve(targetRepo, options.runRoot);
  }
  return path.join(targetRepo, DEFAULT_RUN_ROOT_RELATIVE, options.runId);
}

function readJsonSafe(filePath, errors, label) {
  if (!existsSync(filePath)) {
    errors.push({ label, path: filePath, reason: "missing" });
    return null;
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    errors.push({ label, path: filePath, reason: error.message });
    return null;
  }
}

function readEventTail(filePath, limit, errors) {
  if (!existsSync(filePath)) {
    errors.push({ label: "events", path: filePath, reason: "missing" });
    return [];
  }
  const lines = readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-limit);
  return lines.map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return { event: "unparsed_event_line", raw: line.slice(0, 240) };
    }
  });
}

function listLatestBatchReports(runRoot, targetRepo, limit, errors) {
  const queueRoot = path.join(runRoot, "queue-supervisor");
  if (!existsSync(queueRoot)) {
    return [];
  }
  let entries = [];
  try {
    entries = readdirSync(queueRoot, { withFileTypes: true });
  } catch (error) {
    errors.push({ label: "queue-supervisor", path: queueRoot, reason: error.message });
    return [];
  }
  const reports = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const reportPath = path.join(queueRoot, entry.name, "batch-report.json");
    if (!existsSync(reportPath)) {
      continue;
    }
    try {
      const stats = statSync(reportPath);
      reports.push({ path: reportPath, mtimeMs: stats.mtimeMs });
    } catch (error) {
      errors.push({ label: "batch-report", path: reportPath, reason: error.message });
    }
  }
  return reports
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .slice(0, limit)
    .map((item) => summarizeBatchReport(item.path, targetRepo, errors))
    .filter(Boolean);
}

function summarizeBatchReport(reportPath, targetRepo, errors) {
  const report = readJsonSafe(reportPath, errors, "batch-report");
  if (!report) {
    return null;
  }
  const item = Array.isArray(report.items) ? report.items[0] : null;
  const failure = isFailureStatus(report.status) || isFailureStatus(item?.status) || report.ok === false;
  return {
    path: relativeTo(targetRepo, reportPath),
    ok: report.ok === true,
    status: report.status || null,
    runId: report.runId || null,
    selectedCandidateIds: arrayPreview(report.selectedCandidateIds),
    importedCandidateCount: numberOrNull(report.importedCandidateCount),
    blockedCandidateCount: numberOrNull(report.blockedCandidateCount),
    nextCandidateId: report.nextCandidate?.id || null,
    importerRunId: report.importer?.runId || item?.importerRunId || null,
    importerError: report.importer?.error || (failure ? item?.reason || null : null),
    note: failure ? null : item?.reason || null,
    firstItem: item
      ? {
          candidateId: item.candidateId || null,
          status: item.status || null,
          reason: item.reason || null,
        }
      : null,
  };
}

function isFailureStatus(status) {
  return typeof status === "string" && (
    status.includes("failed") ||
    status.includes("failure") ||
    status.includes("blocked") ||
    status.includes("timeout")
  );
}

function arrayPreview(value, limit = 5) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.slice(0, limit);
}

function numberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function compactItem(item) {
  if (!item) {
    return null;
  }
  return {
    candidateId: item.candidateId || null,
    sourcePath: item.sourcePath || null,
    status: item.status || null,
    reason: item.reason || null,
    liveLaneStatus: item.liveLaneStatus || null,
    liveRerunStatus: item.liveRerunStatus || null,
    batchRunId: item.batchRunId || null,
    batchReport: item.batchReport || null,
    commitId: item.commitId || null,
    startedAt: item.startedAt || null,
    completedAt: item.completedAt || null,
  };
}

function itemTimestamp(item) {
  const value = item?.completedAt || item?.startedAt || "";
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function latestItemByTimestamp(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }
  return items.reduce((latest, item) => {
    if (!latest) {
      return item;
    }
    return itemTimestamp(item) >= itemTimestamp(latest) ? item : latest;
  }, null);
}

function isTerminalRunStatus(status) {
  return typeof status === "string" && (status === "completed" || status === "completed_no_candidates" || status.startsWith("stopped_"));
}

function inferCurrentCandidate(state, events) {
  const terminalByCandidate = new Map();
  events.forEach((event, index) => {
    if (event?.candidateId && TERMINAL_EVENT_NAMES.has(event.event)) {
      terminalByCandidate.set(event.candidateId, index);
    }
  });
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.event === "candidate_started" && event.candidateId) {
      const terminalIndex = terminalByCandidate.get(event.candidateId);
      if (!Number.isInteger(terminalIndex) || terminalIndex < index) {
        return {
          candidateId: event.candidateId,
          source: "events.jsonl",
          status: "started",
          at: event.at || null,
        };
      }
    }
  }
  const items = Array.isArray(state?.items) ? state.items : [];
  const lastItem = items.length > 0 ? items[items.length - 1] : null;
  if (lastItem && !TERMINAL_ITEM_STATUSES.has(lastItem.status)) {
    return {
      candidateId: lastItem.candidateId || null,
      source: "state.items",
      status: lastItem.status || null,
      at: lastItem.startedAt || lastItem.completedAt || null,
    };
  }
  return null;
}

function summarizeCounts(state) {
  const items = Array.isArray(state?.items) ? state.items : [];
  return {
    items: items.length,
    completed: Array.isArray(state?.completedCandidateIds) ? state.completedCandidateIds.length : 0,
    blocked: Array.isArray(state?.blockedCandidateIds) ? state.blockedCandidateIds.length : 0,
    skipped: Array.isArray(state?.skippedCandidateIds) ? state.skippedCandidateIds.length : 0,
    commits: Array.isArray(state?.commitIds) ? state.commitIds.length : 0,
  };
}

function powershellSingleQuoted(value) {
  return String(value || "").replace(/'/g, "''");
}

function summarizeProcesses({ runId, targetRepo }) {
  if (process.platform !== "win32") {
    return { checked: false, reason: "process-inspection-windows-only", count: 0, items: [] };
  }
  const runNeedle = powershellSingleQuoted(runId);
  const repoNeedle = powershellSingleQuoted(targetRepo);
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$run = '${runNeedle}'`,
    `$repo = '${repoNeedle}'`,
    "$items = Get-CimInstance Win32_Process | Where-Object {",
    "  $_.CommandLine -and (",
    "    $_.CommandLine -like '*run-generic-repo-full-intake.mjs*' -or",
    "    $_.CommandLine -like \"*$run*\" -or",
    "    ($repo -and $_.CommandLine -like \"*$repo*\" -and $_.CommandLine -like '*codex exec*')",
    "  ) -and $_.CommandLine -notlike '*full-intake-status.mjs*'",
    "} | Select-Object -First 20 ProcessId,Name,CreationDate,CommandLine",
    "$items | ConvertTo-Json -Compress",
  ].join("\n");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", script], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 8000,
  });
  if (result.status !== 0) {
    return {
      checked: false,
      reason: (result.stderr || result.stdout || "process-inspection-failed").trim().slice(0, 500),
      count: 0,
      items: [],
    };
  }
  const raw = result.stdout.trim();
  if (!raw) {
    return { checked: true, count: 0, items: [] };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { checked: false, reason: error.message, count: 0, items: [] };
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const items = list.map((item) => ({
    pid: item.ProcessId || null,
    name: item.Name || null,
    createdAt: item.CreationDate || null,
    kind: classifyProcess(item.CommandLine),
    command: compactCommand(item.CommandLine),
  }));
  return { checked: true, count: items.length, items };
}

function classifyProcess(commandLine) {
  const line = String(commandLine || "");
  if (line.includes("run-generic-repo-full-intake.mjs")) {
    return "full-intake-supervisor";
  }
  if (line.includes("codex exec")) {
    return "codex-child-run";
  }
  if (line.includes("mcp-adapter.js")) {
    return "mcp-adapter";
  }
  return "related-process";
}

function compactCommand(commandLine) {
  const line = String(commandLine || "").replace(/\s+/g, " ").trim();
  if (line.length <= 240) {
    return line;
  }
  return `${line.slice(0, 120)} ... ${line.slice(-100)}`;
}

function inferNextAction({ activeProcesses, currentCandidate, latestBatchReports, state }) {
  const stateStatus = state?.status || "unknown";
  if (activeProcesses?.count > 0 && isTerminalRunStatus(stateStatus)) {
    return "state is terminal but matching processes are still visible; wait for process exit or inspect stale/orphaned runner before merging";
  }
  if (activeProcesses?.count > 0 && currentCandidate) {
    return "monitor active supervisor/child through this compact status command; avoid reading full reports in chat";
  }
  if (stateStatus === "running") {
    return "no matching process found; check for stale run before resuming or starting another supervisor";
  }
  if (stateStatus && stateStatus.startsWith("stopped_after_failed_import")) {
    return "inspect only the latest batch report path if recovery is needed; do not read single-candidate ledger into chat";
  }
  if (stateStatus === "completed_no_candidates" || stateStatus === "completed") {
    return "no immediate run action; merge/commit evidence can be reviewed from compact paths";
  }
  if (latestBatchReports[0]?.importerError) {
    return "resolve latest importer error from compact batch summary first";
  }
  return "continue with the next bounded supervisor action from the durable ledger";
}

function buildStatus(options) {
  const targetRepo = path.resolve(options.targetRepo);
  const runRoot = resolveRunRoot({ ...options, targetRepo });
  const errors = [];
  const statePath = path.join(runRoot, "state.json");
  const eventsPath = path.join(runRoot, "events.jsonl");
  const runReportPath = path.join(runRoot, "run-report.json");
  const state = readJsonSafe(statePath, errors, "state");
  const events = readEventTail(eventsPath, options.eventLimit, errors);
  const latestBatchReports = listLatestBatchReports(runRoot, targetRepo, options.batchLimit, errors);
  const runReportExists = existsSync(runReportPath);
  const activeProcesses = options.includeProcesses
    ? summarizeProcesses({ runId: options.runId || state?.runId || path.basename(runRoot), targetRepo })
    : { checked: false, reason: "skipped", count: 0, items: [] };
  const currentCandidate = inferCurrentCandidate(state, events);
  const items = Array.isArray(state?.items) ? state.items : [];
  const lastItem = compactItem(latestItemByTimestamp(items));
  const lastCommitId = Array.isArray(state?.commitIds) && state.commitIds.length > 0
    ? state.commitIds[state.commitIds.length - 1]
    : lastItem?.commitId || null;
  const status = {
    schema: SCHEMA,
    ok: errors.length === 0 || Boolean(state),
    generatedAt: new Date().toISOString(),
    runId: options.runId || state?.runId || path.basename(runRoot),
    targetRepo,
    runRoot: relativeTo(targetRepo, runRoot),
    status: state?.status || "unknown",
    updatedAt: state?.updatedAt || null,
    compactBudget: {
      eventLimit: options.eventLimit,
      batchLimit: options.batchLimit,
      rule: "parent chat should read this summary instead of full state, ledger, child stdout, or batch JSON unless diagnosing a named blocker",
    },
    counts: summarizeCounts(state),
    currentCandidate,
    lastItem,
    lastCommitId,
    recentEvents: events.map((event) => ({
      at: event.at || null,
      event: event.event || null,
      candidateId: event.candidateId || null,
      status: event.status || null,
      reason: event.reason || null,
      commitId: event.commitId || null,
    })),
    latestBatchReports,
    activeProcesses,
    evidencePaths: {
      state: relativeTo(targetRepo, statePath),
      events: relativeTo(targetRepo, eventsPath),
      runReport: runReportExists ? relativeTo(targetRepo, runReportPath) : null,
    },
    errors: errors.map((error) => ({ ...error, path: relativeTo(targetRepo, error.path) })),
  };
  status.nextAction = inferNextAction({ activeProcesses, currentCandidate, latestBatchReports, state });
  status.warnings = [];
  if (activeProcesses.count > 0 && isTerminalRunStatus(status.status)) {
    status.warnings.push("terminal-state-with-active-processes");
  }
  return { status, targetRepo, runRoot };
}

function formatCompact(status) {
  const lines = [];
  lines.push(`Full-intake compact status: ${status.runId}`);
  lines.push(`Status: ${status.status}${status.updatedAt ? `, updated ${status.updatedAt}` : ""}`);
  lines.push(
    `Counts: items=${status.counts.items}, completed=${status.counts.completed}, blocked=${status.counts.blocked}, skipped=${status.counts.skipped}, commits=${status.counts.commits}`,
  );
  if (status.currentCandidate) {
    lines.push(
      `Current: ${status.currentCandidate.candidateId} (${status.currentCandidate.status}, from ${status.currentCandidate.source})`,
    );
  } else if (status.lastItem) {
    lines.push(`Last item: ${status.lastItem.candidateId} -> ${status.lastItem.status}`);
  } else {
    lines.push("Current: none detected");
  }
  if (status.lastItem?.reason) {
    lines.push(`Last reason: ${status.lastItem.reason}`);
  }
  if (status.lastCommitId) {
    lines.push(`Last commit: ${status.lastCommitId}`);
  }
  const latestBatch = status.latestBatchReports[0];
  if (latestBatch) {
    lines.push(`Latest batch: ${latestBatch.runId || latestBatch.path} -> ${latestBatch.status}`);
    if (latestBatch.importerError) {
      lines.push(`Batch error: ${latestBatch.importerError}`);
    } else if (latestBatch.note) {
      lines.push(`Batch note: ${latestBatch.note}`);
    }
  }
  if (status.activeProcesses.checked) {
    lines.push(`Processes: ${status.activeProcesses.count} related`);
    status.activeProcesses.items.slice(0, 5).forEach((item) => {
      lines.push(`- ${item.kind} pid=${item.pid} ${item.name || ""}`.trim());
    });
  } else {
    lines.push(`Processes: not checked (${status.activeProcesses.reason || "disabled"})`);
  }
  const lastEvent = status.recentEvents[status.recentEvents.length - 1];
  if (lastEvent) {
    lines.push(`Last event: ${lastEvent.event}${lastEvent.candidateId ? ` ${lastEvent.candidateId}` : ""}`);
  }
  if (status.warnings.length > 0) {
    lines.push(`Warnings: ${status.warnings.join(", ")}`);
  }
  lines.push(`Next: ${status.nextAction}`);
  lines.push(`Evidence: ${status.evidencePaths.state}`);
  if (latestBatch?.path) {
    lines.push(`Latest batch path: ${latestBatch.path}`);
  }
  return `${lines.join("\n")}\n`;
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exit(2);
  }
  if (options.help) {
    console.log(usage());
    return;
  }
  const { status, runRoot } = buildStatus(options);
  if (options.writeStatus) {
    mkdirSync(runRoot, { recursive: true });
    const statusPath = path.join(runRoot, "compact-status.json");
    writeFileSync(statusPath, `${JSON.stringify(status, null, 2)}\n`, "utf8");
    status.evidencePaths.compactStatus = relativeTo(path.resolve(options.targetRepo), statusPath);
  }
  if (options.output === "json") {
    console.log(JSON.stringify(status, null, 2));
  } else {
    process.stdout.write(formatCompact(status));
  }
}

main();
