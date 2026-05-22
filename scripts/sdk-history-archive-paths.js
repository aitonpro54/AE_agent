"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ARCHIVE_MOVE_PATH =
  ".codex-audit/sdk-orchestrator-extraction/165-sdk-historical-archive-move.json";

function readJson(repo, repoPath) {
  return JSON.parse(fs.readFileSync(path.join(repo, repoPath), "utf8"));
}

function readHistoricalArchiveMove(repo) {
  const absolutePath = path.join(repo, ARCHIVE_MOVE_PATH);
  if (!fs.existsSync(absolutePath)) {
    return null;
  }
  return readJson(repo, ARCHIVE_MOVE_PATH);
}

function archivePathFor(move, repoPath) {
  if (!move) {
    return null;
  }

  const root = String(move.archiveRoot || "").replace(/\/$/, "");
  for (const set of move.movedCandidateSets || []) {
    if ((set.originalPaths || []).includes(repoPath)) {
      return path.posix.join(
        root,
        set.archiveSubdir,
        repoPath.replace(/^\./, ""),
      );
    }
  }

  return null;
}

function resolveCurrentOrArchivedPath(repo, repoPath) {
  if (fs.existsSync(path.join(repo, repoPath))) {
    return { location: "current", path: repoPath };
  }

  const move = readHistoricalArchiveMove(repo);
  const archivePath = archivePathFor(move, repoPath);
  if (archivePath && fs.existsSync(path.join(repo, archivePath))) {
    return { location: "archive", path: archivePath };
  }

  return null;
}

function assertFileExistsAtCurrentOrArchive(repo, repoPath, label) {
  const resolved = resolveCurrentOrArchivedPath(repo, repoPath);
  assert(
    resolved,
    `${label} must exist at current path or M165 archive path: ${repoPath}`,
  );
  return resolved;
}

module.exports = {
  ARCHIVE_MOVE_PATH,
  archivePathFor,
  assertFileExistsAtCurrentOrArchive,
  readHistoricalArchiveMove,
  resolveCurrentOrArchivedPath,
};
