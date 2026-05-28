#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_RUN_ROOT_RELATIVE = ".codex-runtime/sdk/generic-repo-full-intake";
const DEFAULT_MAX_BYTES = 8192;

function usage() {
  return [
    "Usage: node orchestrator/full-intake-diagnose.mjs --candidate <id> --phase <phase> [options]",
    "",
    "Options:",
    "  --run-id <id>          Run id. Defaults to latest run root when omitted.",
    "  --target-repo <path>   Repository root. Defaults to current directory.",
    "  --run-root <path>      Explicit full-intake run root.",
    "  --max-bytes <n>        Maximum excerpt bytes. Default 8192.",
    "  --compact-json         Print bounded JSON.",
    "  --help                 Show this help.",
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    maxBytes: DEFAULT_MAX_BYTES,
    output: "compact-json",
    targetRepo: process.cwd(),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--candidate") options.candidate = argv[++index];
    else if (arg === "--phase") options.phase = argv[++index];
    else if (arg === "--run-id") options.runId = argv[++index];
    else if (arg === "--target-repo") options.targetRepo = argv[++index];
    else if (arg === "--run-root") options.runRoot = argv[++index];
    else if (arg === "--max-bytes") options.maxBytes = parseBoundedInt(argv[++index], "max-bytes", 256, 32 * 1024);
    else if (arg === "--compact-json") options.output = "compact-json";
    else throw new Error(`unknown-argument: ${arg}`);
  }
  if (!options.help && (!options.candidate || !options.phase)) {
    throw new Error("missing-candidate-or-phase");
  }
  return options;
}

function parseBoundedInt(value, label, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`invalid-${label}:${value}`);
  }
  return parsed;
}

function normalize(value) {
  return String(value || "").replace(/\\/g, "/");
}

function safeId(value) {
  return (
    String(value || "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 96) || "candidate"
  );
}

function latestRunRoot(targetRepo) {
  const parent = path.join(targetRepo, DEFAULT_RUN_ROOT_RELATIVE);
  if (!existsSync(parent)) {
    throw new Error(`full-intake-runs-missing:${normalize(parent)}`);
  }
  const entries = readdirSync(parent)
    .map((entry) => path.join(parent, entry))
    .filter((entry) => statSync(entry).isDirectory())
    .map((entry) => ({ path: entry, mtimeMs: statSync(entry).mtimeMs }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  if (entries.length === 0) {
    throw new Error(`full-intake-runs-empty:${normalize(parent)}`);
  }
  return entries[0].path;
}

function resolveRunRoot(options) {
  const targetRepo = path.resolve(options.targetRepo);
  if (options.runRoot) {
    return path.isAbsolute(options.runRoot) ? options.runRoot : path.resolve(targetRepo, options.runRoot);
  }
  if (options.runId) {
    return path.resolve(targetRepo, DEFAULT_RUN_ROOT_RELATIVE, options.runId);
  }
  return latestRunRoot(targetRepo);
}

function candidateFiles(runRoot, candidateId, phase) {
  const candidateRoot = path.join(runRoot, "candidates", safeId(candidateId));
  const candidates = [];
  const phaseText = String(phase || "").toLowerCase();
  if (phaseText.includes("live")) {
    candidates.push(path.join(candidateRoot, "live-lane", "live-lane-report.json"));
  }
  if (phaseText.includes("import") || phaseText.includes("merge") || phaseText.includes("validation")) {
    candidates.push(path.join(candidateRoot, "import", "single-candidate-ledger.json"));
  }
  if (phaseText.includes("recovery") || phaseText.includes("timeout")) {
    candidates.push(path.join(candidateRoot, "import-recovery", "child-timeout-recovery-report.json"));
    candidates.push(path.join(candidateRoot, "import-recovery", "recovery-validation-report.json"));
  }
  candidates.push(path.join(runRoot, "proof-envelope.json"));
  candidates.push(path.join(runRoot, "resume-card.json"));
  candidates.push(path.join(runRoot, "events.jsonl"));
  return candidates.filter((entry, index, all) => all.indexOf(entry) === index);
}

function boundedRead(filePath, maxBytes) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return null;
  }
  const raw = readFileSync(filePath);
  const slice = raw.subarray(0, Math.min(raw.length, maxBytes));
  return {
    path: normalize(path.relative(process.cwd(), filePath)) || normalize(filePath),
    sizeBytes: raw.length,
    excerptBytes: slice.length,
    truncated: raw.length > slice.length,
    excerpt: slice.toString("utf8"),
  };
}

function diagnose(options) {
  const runRoot = resolveRunRoot(options);
  const excerpts = [];
  let remaining = options.maxBytes;
  for (const filePath of candidateFiles(runRoot, options.candidate, options.phase)) {
    if (remaining <= 0) break;
    const entry = boundedRead(filePath, remaining);
    if (!entry) continue;
    excerpts.push(entry);
    remaining -= entry.excerptBytes;
  }
  return {
    schema: "generic-repo-full-intake.diagnose-compact.v1",
    candidateId: options.candidate,
    phase: options.phase,
    runRoot: normalize(path.relative(process.cwd(), runRoot)) || normalize(runRoot),
    maxBytes: options.maxBytes,
    excerptCount: excerpts.length,
    excerpts,
  };
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    const output = diagnose(options);
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

main();
