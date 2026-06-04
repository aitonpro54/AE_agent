import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  normalizeRepoPath,
  uniqueSortedRepoPaths,
} from "./path-policy.mjs";

export function splitLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function splitRawLines(text) {
  return text.split(/\r?\n/).filter((line) => line.trim() !== "");
}

export function hashText(text) {
  return createHash("sha256").update(text).digest("hex");
}

function pathSignatureHash(value) {
  return hashText(JSON.stringify(value));
}

export function runGit(args, cwd) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      [
        `git ${args.join(" ")} failed with status ${result.status}`,
        result.stdout ?? "",
        result.stderr ?? "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return (result.stdout ?? "").trimEnd();
}

function readFileHashIfPresent(cwd, repoPath) {
  const absolutePath = path.resolve(cwd, repoPath);

  if (!existsSync(absolutePath)) {
    return null;
  }

  const stats = statSync(absolutePath);
  if (!stats.isFile()) {
    return `non-file:${stats.isDirectory() ? "directory" : "other"}`;
  }

  return createHash("sha256").update(readFileSync(absolutePath)).digest("hex");
}

function createPathSignature(cwd, repoPath) {
  return pathSignatureHash({
    fileHash: readFileHashIfPresent(cwd, repoPath),
    stagedDiffHash: hashText(runGit(["diff", "--cached", "--", repoPath], cwd)),
    worktreeDiffHash: hashText(runGit(["diff", "--", repoPath], cwd)),
  });
}

export function parseStatusPaths(statusShort) {
  const paths = [];

  for (const line of splitRawLines(statusShort)) {
    if (line.startsWith("## ")) {
      continue;
    }

    const rawPath = line.slice(3).trim();
    if (!rawPath) {
      continue;
    }

    if (rawPath.includes(" -> ")) {
      paths.push(...rawPath.split(" -> "));
      continue;
    }

    paths.push(rawPath);
  }

  return paths;
}

export function captureGitSnapshot(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const statusShort = runGit(["status", "--short", "--branch"], cwd);
  const diffNameOnly = splitLines(runGit(["diff", "--name-only"], cwd));
  const stagedDiffNameOnly = splitLines(runGit(["diff", "--cached", "--name-only"], cwd));
  const untrackedNameOnly = splitLines(runGit(["ls-files", "--others", "--exclude-standard"], cwd));
  const changedPaths = uniqueSortedRepoPaths([
    ...parseStatusPaths(statusShort),
    ...diffNameOnly,
    ...stagedDiffNameOnly,
    ...untrackedNameOnly,
  ]);
  const pathSignatures = Object.fromEntries(
    changedPaths.map((repoPath) => [repoPath, createPathSignature(cwd, repoPath)]),
  );

  return {
    capturedAt: new Date().toISOString(),
    changedPaths,
    cwd,
    diffNameOnly,
    label: options.label || "git-snapshot",
    pathSignatures,
    stagedDiffNameOnly,
    statusShort,
    untrackedNameOnly,
  };
}

export function collectPathsChangedSincePre(preSnapshot, postSnapshot) {
  const paths = uniqueSortedRepoPaths([
    ...Object.keys(preSnapshot.pathSignatures || {}),
    ...Object.keys(postSnapshot.pathSignatures || {}),
  ]);

  return paths.filter(
    (repoPath) => preSnapshot.pathSignatures?.[repoPath] !== postSnapshot.pathSignatures?.[repoPath],
  );
}
