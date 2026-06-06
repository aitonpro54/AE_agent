#!/usr/bin/env node
"use strict";

const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DEFAULT_RUNTIME_ROOT = ".codex-runtime";
const DEFAULT_RUN_ID = "full-intake-kyletmartinez";

function usage() {
  return `Usage: node scripts/full-intake-runtime-cleanup.js [options]

Safely clean Full Intaker runtime leftovers. Dry-run is the default.

Options:
  --apply                         perform cleanup (default: report only)
  --run-id <id>                   run id to target (default: ${DEFAULT_RUN_ID})
  --runtime-root <path>           runtime root (default: ${DEFAULT_RUNTIME_ROOT})
  --prune-importer-batches        remove queue-full-intake-<run-id>-*-import dirs after worktrees are removed
  --prune-cli-autoloop            remove old .codex-runtime/cli-autoloop last-message files
  --keep-last-messages <n>        keep newest last-message files when pruning cli-autoloop (default: 3)
  --prune-full-intake-temp        remove small resumable temp dirs: parallel-candidates and queue-supervisor
  --require-clean                 fail if tracked/untracked git status is not clean
  --json                          print machine-readable JSON
  --help                          show this help

Recommended final cleanup:
  node scripts/full-intake-runtime-cleanup.js --apply --prune-importer-batches --prune-cli-autoloop

Evidence kept by default:
  - triage queue ledger and source checkout
  - proof-envelope.json, state.json, run-report.json, resume-card.json, events.jsonl
  - resolution-tickets, candidates, self-improvement live-lane reports
  - .codex/handoff.md and .codex/active-thread.json
`;
}

function parseArgs(argv) {
  const options = {
    apply: false,
    runId: DEFAULT_RUN_ID,
    runtimeRoot: DEFAULT_RUNTIME_ROOT,
    pruneImporterBatches: false,
    pruneCliAutoloop: false,
    keepLastMessages: 3,
    pruneFullIntakeTemp: false,
    requireClean: false,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") options.apply = true;
    else if (arg === "--prune-importer-batches") options.pruneImporterBatches = true;
    else if (arg === "--prune-cli-autoloop") options.pruneCliAutoloop = true;
    else if (arg === "--prune-full-intake-temp") options.pruneFullIntakeTemp = true;
    else if (arg === "--require-clean") options.requireClean = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--run-id") options.runId = readValue(argv, ++index, arg);
    else if (arg === "--runtime-root") options.runtimeRoot = readValue(argv, ++index, arg);
    else if (arg === "--keep-last-messages") {
      const value = Number.parseInt(readValue(argv, ++index, arg), 10);
      if (!Number.isFinite(value) || value < 0) {
        throw new Error("--keep-last-messages must be a non-negative integer");
      }
      options.keepLastMessages = value;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function readValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function runGit(repoRoot, args, options = {}) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.stdio || ["ignore", "pipe", "pipe"],
  });
}

function tryGit(repoRoot, args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function repoRootFromGit() {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function normalizeForCompare(value) {
  return path.resolve(value).toLowerCase();
}

function isInside(child, parent) {
  const childResolved = normalizeForCompare(child);
  const parentResolved = normalizeForCompare(parent);
  return childResolved === parentResolved || childResolved.startsWith(`${parentResolved}${path.sep}`);
}

function assertInside(child, parent, label) {
  if (!isInside(child, parent)) {
    throw new Error(`${label} is outside expected root: ${child}`);
  }
}

function pathExists(targetPath) {
  try {
    fs.accessSync(targetPath);
    return true;
  } catch {
    return false;
  }
}

function dirSize(targetPath) {
  const summary = { bytes: 0, files: 0 };
  if (!pathExists(targetPath)) return summary;
  const stack = [targetPath];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      try {
        if (entry.isDirectory()) {
          stack.push(fullPath);
        } else if (entry.isFile()) {
          const stat = fs.statSync(fullPath);
          summary.bytes += stat.size;
          summary.files += 1;
        }
      } catch {
        // Ignore disappearing files during cleanup reporting.
      }
    }
  }
  return summary;
}

function bytesToMb(bytes) {
  return Math.round((bytes / 1024 / 1024) * 100) / 100;
}

function parseWorktrees(output) {
  const blocks = output.split(/\r?\n\r?\n/).map((block) => block.trim()).filter(Boolean);
  return blocks.map((block) => {
    const record = {};
    for (const line of block.split(/\r?\n/)) {
      const space = line.indexOf(" ");
      if (space === -1) {
        record[line] = true;
      } else {
        record[line.slice(0, space)] = line.slice(space + 1);
      }
    }
    return record;
  });
}

function listRuntimeWorktrees(repoRoot, runtimeRoot) {
  const worktrees = parseWorktrees(runGit(repoRoot, ["worktree", "list", "--porcelain"]));
  return worktrees
    .filter((entry) => entry.worktree)
    .filter((entry) => isInside(entry.worktree, runtimeRoot))
    .filter((entry) => path.basename(path.dirname(entry.worktree)).toLowerCase() === "worktrees")
    .map((entry) => ({
      path: path.resolve(entry.worktree),
      head: entry.HEAD || null,
      branch: entry.branch || null,
      detached: !entry.branch,
      size: dirSize(entry.worktree),
    }));
}

function listImporterBatchDirs(runtimeRoot, runId) {
  const importerRoot = path.join(runtimeRoot, "sdk", "generic-repo-importer");
  if (!pathExists(importerRoot)) return [];
  const prefix = `queue-${runId}-`;
  return fs.readdirSync(importerRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => entry.name.startsWith(prefix) && entry.name.endsWith("-import"))
    .map((entry) => {
      const fullPath = path.join(importerRoot, entry.name);
      return {
        path: fullPath,
        name: entry.name,
        size: dirSize(fullPath),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function uniqueActionTotals(actions) {
  const sorted = [...actions].sort((a, b) => a.path.length - b.path.length);
  const roots = [];
  const totals = { bytes: 0, files: 0 };
  for (const action of sorted) {
    const covered = roots.some((root) => isInside(action.path, root.path));
    if (covered) continue;
    roots.push(action);
    totals.bytes += action.bytes;
    totals.files += action.files;
  }
  return totals;
}

function listCliAutoloopFiles(runtimeRoot, keepLastMessages) {
  const cliRoot = path.join(runtimeRoot, "cli-autoloop");
  if (!pathExists(cliRoot)) return [];
  return fs.readdirSync(cliRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .filter((entry) => /^last-message.*\.txt$/i.test(entry.name))
    .map((entry) => {
      const fullPath = path.join(cliRoot, entry.name);
      const stat = fs.statSync(fullPath);
      return {
        path: fullPath,
        name: entry.name,
        mtimeMs: stat.mtimeMs,
        size: { bytes: stat.size, files: 1 },
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(keepLastMessages);
}

function listFullIntakeTempDirs(runtimeRoot, runId) {
  const runRoot = path.join(runtimeRoot, "sdk", "generic-repo-full-intake", runId);
  const names = ["parallel-candidates", "queue-supervisor"];
  return names
    .map((name) => path.join(runRoot, name))
    .filter(pathExists)
    .map((targetPath) => ({
      path: targetPath,
      name: path.basename(targetPath),
      size: dirSize(targetPath),
    }));
}

function removeDir(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function clean(options) {
  const repoRoot = repoRootFromGit();
  const runtimeRoot = path.resolve(repoRoot, options.runtimeRoot);
  assertInside(runtimeRoot, repoRoot, "runtime root");

  const gitStatus = runGit(repoRoot, ["status", "--short", "--untracked-files=all"]);
  if (options.requireClean && gitStatus.trim()) {
    throw new Error(`git status is not clean:\n${gitStatus}`);
  }

  const runtimeBefore = dirSize(runtimeRoot);
  const runtimeWorktrees = listRuntimeWorktrees(repoRoot, runtimeRoot);
  const importerBatchDirs = listImporterBatchDirs(runtimeRoot, options.runId);
  const cliAutoloopFiles = options.pruneCliAutoloop
    ? listCliAutoloopFiles(runtimeRoot, options.keepLastMessages)
    : [];
  const fullIntakeTempDirs = options.pruneFullIntakeTemp
    ? listFullIntakeTempDirs(runtimeRoot, options.runId)
    : [];

  for (const worktree of runtimeWorktrees) {
    assertInside(worktree.path, runtimeRoot, "runtime worktree");
  }
  for (const batch of importerBatchDirs) {
    assertInside(batch.path, runtimeRoot, "importer batch");
  }
  for (const file of cliAutoloopFiles) {
    assertInside(file.path, runtimeRoot, "cli autoloop file");
  }
  for (const tempDir of fullIntakeTempDirs) {
    assertInside(tempDir.path, runtimeRoot, "full intake temp dir");
  }

  const actions = [];
  for (const worktree of runtimeWorktrees) {
    actions.push({
      type: "git-worktree-remove",
      path: worktree.path,
      bytes: worktree.size.bytes,
      files: worktree.size.files,
    });
  }

  if (options.pruneImporterBatches) {
    for (const batch of importerBatchDirs) {
      actions.push({
        type: "remove-importer-batch-dir",
        path: batch.path,
        bytes: batch.size.bytes,
        files: batch.size.files,
      });
    }
  }

  for (const file of cliAutoloopFiles) {
    actions.push({
      type: "remove-cli-autoloop-file",
      path: file.path,
      bytes: file.size.bytes,
      files: file.size.files,
    });
  }

  for (const tempDir of fullIntakeTempDirs) {
    actions.push({
      type: "remove-full-intake-temp-dir",
      path: tempDir.path,
      bytes: tempDir.size.bytes,
      files: tempDir.size.files,
    });
  }

  const results = [];
  if (options.apply) {
    for (const worktree of runtimeWorktrees) {
      const result = tryGit(repoRoot, ["worktree", "remove", "--force", worktree.path]);
      results.push({
        type: "git-worktree-remove",
        path: worktree.path,
        ok: result.ok,
        status: result.status,
        stderr: result.stderr.trim(),
      });
      if (!result.ok) {
        throw new Error(`git worktree remove failed for ${worktree.path}: ${result.stderr.trim()}`);
      }
    }
    if (runtimeWorktrees.length > 0) {
      const result = tryGit(repoRoot, ["worktree", "prune"]);
      results.push({
        type: "git-worktree-prune",
        ok: result.ok,
        status: result.status,
        stderr: result.stderr.trim(),
      });
      if (!result.ok) {
        throw new Error(`git worktree prune failed: ${result.stderr.trim()}`);
      }
    }

    if (options.pruneImporterBatches) {
      const remainingWorktrees = listRuntimeWorktrees(repoRoot, runtimeRoot);
      for (const batch of importerBatchDirs) {
        const hasRegisteredWorktree = remainingWorktrees.some((worktree) => isInside(worktree.path, batch.path));
        if (hasRegisteredWorktree) {
          results.push({
            type: "remove-importer-batch-dir",
            path: batch.path,
            ok: false,
            skipped: true,
            reason: "registered worktree still exists under batch dir",
          });
          continue;
        }
        removeDir(batch.path);
        results.push({
          type: "remove-importer-batch-dir",
          path: batch.path,
          ok: true,
        });
      }
    }

    for (const file of cliAutoloopFiles) {
      fs.rmSync(file.path, { force: true });
      results.push({
        type: "remove-cli-autoloop-file",
        path: file.path,
        ok: true,
      });
    }

    for (const tempDir of fullIntakeTempDirs) {
      removeDir(tempDir.path);
      results.push({
        type: "remove-full-intake-temp-dir",
        path: tempDir.path,
        ok: true,
      });
    }
  }

  const runtimeAfter = options.apply ? dirSize(runtimeRoot) : runtimeBefore;
  const reclaimable = uniqueActionTotals(actions);
  const summary = {
    schema: "ae-agent.full-intake-runtime-cleanup.v1",
    mode: options.apply ? "apply" : "dry-run",
    repoRoot,
    runId: options.runId,
    runtimeRoot,
    gitStatusClean: gitStatus.trim().length === 0,
    runtimeBefore: {
      bytes: runtimeBefore.bytes,
      mb: bytesToMb(runtimeBefore.bytes),
      files: runtimeBefore.files,
    },
    runtimeAfter: {
      bytes: runtimeAfter.bytes,
      mb: bytesToMb(runtimeAfter.bytes),
      files: runtimeAfter.files,
    },
    reclaimable: {
      bytes: reclaimable.bytes,
      mb: bytesToMb(reclaimable.bytes),
      files: reclaimable.files,
    },
    detected: {
      runtimeWorktrees: runtimeWorktrees.length,
      importerBatchDirs: importerBatchDirs.length,
      cliAutoloopFilesToPrune: cliAutoloopFiles.length,
      fullIntakeTempDirsToPrune: fullIntakeTempDirs.length,
    },
    actions,
    results,
    preservedByDefault: [
      "triage ledger and source checkout",
      "proof-envelope.json, state.json, run-report.json, resume-card.json, events.jsonl",
      "resolution-tickets, candidates, self-improvement reports",
      ".codex/handoff.md and .codex/active-thread.json",
    ],
  };
  return summary;
}

function printHuman(summary) {
  console.log(`Full Intaker runtime cleanup (${summary.mode})`);
  console.log(`Repo: ${summary.repoRoot}`);
  console.log(`Run id: ${summary.runId}`);
  console.log(`Runtime: ${summary.runtimeRoot}`);
  console.log(`Runtime size: ${summary.runtimeBefore.mb} MB (${summary.runtimeBefore.files} files)`);
  console.log(`Reclaimable selected: ${summary.reclaimable.mb} MB (${summary.reclaimable.files} files)`);
  console.log(`Git status clean: ${summary.gitStatusClean ? "yes" : "no"}`);
  console.log("");
  console.log("Detected:");
  console.log(`- runtime worktrees: ${summary.detected.runtimeWorktrees}`);
  console.log(`- importer batch dirs: ${summary.detected.importerBatchDirs}`);
  console.log(`- cli-autoloop files selected: ${summary.detected.cliAutoloopFilesToPrune}`);
  console.log(`- full-intake temp dirs selected: ${summary.detected.fullIntakeTempDirsToPrune}`);
  console.log("");
  if (summary.actions.length === 0) {
    console.log("No cleanup actions selected.");
  } else {
    console.log("Actions:");
    for (const action of summary.actions) {
      console.log(`- ${action.type}: ${bytesToMb(action.bytes)} MB, ${action.files} files`);
      console.log(`  ${path.relative(summary.repoRoot, action.path)}`);
    }
  }
  if (summary.mode === "dry-run") {
    console.log("");
    console.log("Dry-run only. Add --apply to perform selected cleanup.");
  } else {
    console.log("");
    console.log(`Runtime after cleanup: ${summary.runtimeAfter.mb} MB (${summary.runtimeAfter.files} files)`);
  }
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return;
    }
    const summary = clean(options);
    if (options.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      printHuman(summary);
    }
  } catch (error) {
    if (options && options.json) {
      console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
    } else {
      console.error(`Full Intaker runtime cleanup failed: ${error.message}`);
    }
    process.exitCode = 1;
  }
}

main();
