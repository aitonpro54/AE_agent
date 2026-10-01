"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const MEDIA_FIELDS = ["width", "height", "duration", "frameRate"];
const COMMON_MEDIA_EXTENSIONS = new Set([
  ".mp4", ".mov", ".avi", ".mkv", ".m4v", ".webm", ".png", ".jpg", ".jpeg",
  ".tif", ".tiff", ".psd", ".ai", ".wav", ".mp3", ".aac", ".aif", ".aiff"
]);

function normalizePath(value) {
  return typeof value === "string" ? value.replace(/\\/g, "/").toLowerCase() : "";
}
function pathsEqual(a, b) { return Boolean(normalizePath(a) && normalizePath(a) === normalizePath(b)); }
function absoluteFilePath(value) {
  return typeof value === "string" && (path.win32.isAbsolute(value) || path.posix.isAbsolute(value));
}
function canonicalKey(value) { return process.platform === "win32" ? value.toLowerCase() : value; }
function isPathInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === "" || (rel !== ".." && !rel.startsWith(".." + path.sep) && !path.isAbsolute(rel));
}
function fileBase(value) { return path.posix.basename(String(value || "").replace(/\\/g, "/")); }
function sanitizeBaseName(value) { return String(value || "").toLowerCase().replace(/[._\- ]+/g, " ").trim(); }
function bounded(value, fallback, maximum) {
  return Number.isFinite(value) && value >= 1 ? Math.min(maximum, Math.floor(value)) : fallback;
}
function knownNumber(value) { return typeof value === "number" && Number.isFinite(value) && value >= 0; }
function unknownMetadata(size) {
  return { size, width: "unknown", height: "unknown", duration: "unknown", frameRate: "unknown", source: "filesystem-size-only" };
}

/** Stream directory entries; all work counts, including filtered files and directories. */
function scanRoots(searchRoots, options = {}) {
  const maxDepth = bounded(options.maxDepth, 5, 10);
  const maxFiles = bounded(options.maxFiles, 2000, 10000);
  const maxEntries = bounded(options.maxEntries, 20000, 50000);
  const maxDirectories = bounded(options.maxDirectories, 2000, 10000);
  const extensions = Array.isArray(options.allowedExtensions)
    ? new Set(options.allowedExtensions.map(e => String(e).toLowerCase()).map(e => e.startsWith(".") ? e : "." + e)) : null;
  const rootErrors = [];
  const uniqueRoots = new Map();
  for (const root of searchRoots) {
    try {
      if (typeof root !== "string" || !root.trim()) throw new Error("Корень должен быть непустым путём.");
      const real = fs.realpathSync(path.resolve(root));
      if (!fs.statSync(real).isDirectory()) throw new Error("Корень не является каталогом.");
      uniqueRoots.set(canonicalKey(real), real);
    } catch (error) { rootErrors.push({ root, error: error.message }); }
  }
  const sortedRoots = [...uniqueRoots.values()].sort((a, b) => a.length - b.length);
  const validRoots = sortedRoots.filter((root, i) => !sortedRoots.slice(0, i).some(parent => isPathInside(root, parent)));
  const files = [];
  const visitedDirs = new Set();
  const seenFiles = new Set();
  const traversalErrors = [];
  let scannedEntriesCount = 0;
  let truncated = false;
  let incomplete = rootErrors.length > 0;
  let exhausted = false;
  function stop() { truncated = true; incomplete = true; exhausted = true; }
  function failure(location, error) { incomplete = true; traversalErrors.push({ path: location, error: error.message || String(error) }); }
  function walk(dir, depth, root) {
    if (exhausted) return;
    let canonicalDir;
    try {
      canonicalDir = fs.realpathSync(dir);
      if (!isPathInside(canonicalDir, root)) throw new Error("Канонический путь выходит за searchRoot.");
    } catch (error) { failure(dir, error); return; }
    const key = canonicalKey(canonicalDir);
    if (visitedDirs.has(key)) return;
    if (visitedDirs.size >= maxDirectories) { stop(); return; }
    visitedDirs.add(key);
    let handle;
    try {
      handle = fs.opendirSync(canonicalDir);
      let entry;
      while (!exhausted && (entry = handle.readSync()) !== null) {
        if (scannedEntriesCount >= maxEntries) { stop(); break; }
        scannedEntriesCount++;
        const full = path.join(canonicalDir, entry.name);
        try {
          // Do not follow links/junctions, even when their lexical name is inside a root.
          const linkStat = fs.lstatSync(full);
          if (linkStat.isSymbolicLink()) { failure(full, "Ссылка/reparse point пропущена."); continue; }
          const real = fs.realpathSync(full);
          if (!isPathInside(real, root)) throw new Error("Канонический дочерний путь выходит за searchRoot.");
          const stat = fs.statSync(real);
          if (stat.isDirectory()) {
            if (depth >= maxDepth) { incomplete = true; } else { walk(real, depth + 1, root); }
          } else if (stat.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (extensions && !extensions.has(ext)) continue;
            const fileKey = canonicalKey(real);
            if (seenFiles.has(fileKey)) continue;
            if (files.length >= maxFiles) { stop(); break; }
            seenFiles.add(fileKey);
            const baseName = path.basename(entry.name, path.extname(entry.name));
            files.push({ filePath: real, fileName: entry.name, baseName, sanitizedBaseName: sanitizeBaseName(baseName),
              ext, size: stat.size, mtime: stat.mtimeMs, metadata: unknownMetadata(stat.size) });
          }
        } catch (error) { failure(full, error); }
      }
    } catch (error) { failure(canonicalDir, error); }
    finally { if (handle) { try { handle.closeSync(); } catch (error) { failure(canonicalDir, error); } } }
  }
  for (const root of validRoots) { if (exhausted) break; walk(root, 1, root); }
  return { files, scannedFilesCount: files.length, visitedDirsCount: visitedDirs.size, scannedEntriesCount,
    truncated, incomplete, validRoots, rootErrors, traversalErrors };
}

/** Optional existing ffprobe only: bounded count, per-file time, aggregate time, and output. */
function probeCandidate(candidate, timeoutMs) {
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries",
    "stream=codec_type,width,height,duration,avg_frame_rate:format=duration", "-of", "json", candidate.filePath],
  { encoding: "utf8", timeout: timeoutMs, maxBuffer: 256 * 1024, windowsHide: true });
  if (probe.error || probe.status !== 0) {
    candidate.probe = { status: "unavailable", reason: probe.error ? probe.error.code || "probe_error" : "invalid_or_unsupported_media" };
    return;
  }
  try {
    const data = JSON.parse(probe.stdout);
    const video = (data.streams || []).find(stream => stream.codec_type === "video") || {};
    const metadata = unknownMetadata(candidate.size);
    for (const key of ["width", "height"]) if (knownNumber(video[key])) metadata[key] = video[key];
    const duration = Number((data.format || {}).duration || video.duration);
    if (knownNumber(duration)) metadata.duration = duration;
    const fraction = String(video.avg_frame_rate || "").split("/").map(Number);
    const rate = fraction.length === 2 && fraction[1] > 0 ? fraction[0] / fraction[1] : NaN;
    if (Number.isFinite(rate) && rate > 0) metadata.frameRate = rate;
    metadata.source = "ffprobe";
    candidate.metadata = metadata;
    candidate.probe = { status: "read" };
  } catch (_error) { candidate.probe = { status: "unavailable", reason: "invalid_probe_json" }; }
}

function scoreCandidate(candidate, target) {
  // AE item names can be manually renamed; the old file basename is authoritative for search.
  const primaryName = fileBase(target.originalPath || target.name);
  const ext = path.extname(primaryName).toLowerCase();
  const base = path.basename(primaryName, path.extname(primaryName));
  const sanitized = sanitizeBaseName(base);
  let nameScore = 0;
  const reasons = [];
  if (candidate.fileName.toLowerCase() === primaryName.toLowerCase()) { nameScore = 100; reasons.push("exact_filename"); }
  else if (candidate.baseName.toLowerCase() === base.toLowerCase()) {
    nameScore = 80; reasons.push("exact_basename");
    if (COMMON_MEDIA_EXTENSIONS.has(candidate.ext) && COMMON_MEDIA_EXTENSIONS.has(ext)) { nameScore += 5; reasons.push("media_extension"); }
  } else if (sanitized && candidate.sanitizedBaseName === sanitized) { nameScore = 65; reasons.push("sanitized_basename"); }
  let score = nameScore;
  const expectedMetadata = { ...(target.expectedMetadata || {}) };
  for (const field of MEDIA_FIELDS) if (knownNumber(target[field])) expectedMetadata[field] = target[field];
  const expectedSize = target.expectedSize !== undefined ? target.expectedSize : expectedMetadata.size;
  if (knownNumber(expectedSize)) {
    const same = candidate.size === expectedSize;
    score += same ? 20 : -15;
    reasons.push(same ? "exact_size_match" : "size_mismatch");
  }
  const comparisons = {};
  for (const field of MEDIA_FIELDS) {
    const actual = candidate.metadata[field];
    const expected = expectedMetadata[field];
    if (!knownNumber(expected) || !knownNumber(actual)) {
      comparisons[field] = { expected: knownNumber(expected) ? expected : "unknown", observed: actual, status: "unknown" };
    } else {
      const tolerance = field === "duration" || field === "frameRate" ? 0.01 : 0;
      const matches = Math.abs(expected - actual) <= tolerance;
      comparisons[field] = { expected, observed: actual, status: matches ? "matched" : "mismatch" };
      score += matches ? 10 : -10;
      reasons.push(field + (matches ? "_match" : "_mismatch"));
    }
  }
  // Media mismatches are review evidence; never hide a same-name alternative by score.
  return { score, nameScore, reasons, comparisons };
}

function findMissingFootageCandidates(input = {}) {
  if (!Array.isArray(input.searchRoots) || !input.searchRoots.length) throw new Error("searchRoots must be a non-empty array.");
  if (!Array.isArray(input.missingItems) || !input.missingItems.length || input.missingItems.length > 250) throw new Error("missingItems must contain 1..250 items.");
  const ids = new Set();
  for (const item of input.missingItems) {
    if (!item || !Number.isSafeInteger(item.itemId) || item.itemId <= 0 || ids.has(item.itemId)) throw new Error("missingItems require unique positive itemId values.");
    ids.add(item.itemId);
  }
  const scan = scanRoots(input.searchRoots, input);
  const targets = input.missingItems.map(item => ({ ...item, originalPath: item.originalPath || item.file || "" }));
  const candidateFiles = scan.files.filter(candidate => targets.some(target => scoreCandidate(candidate, target).nameScore >= 60));
  let probedFilesCount = 0;
  if (input.probeMedia === true) {
    const count = bounded(input.maxProbeFiles, 10, 25);
    const perFile = bounded(input.probeTimeoutMs, 2000, 5000);
    const deadline = Date.now() + 10000;
    for (const candidate of candidateFiles) {
      const remaining = deadline - Date.now();
      if (probedFilesCount >= count || remaining <= 0) break;
      probeCandidate(candidate, Math.min(perFile, remaining));
      probedFilesCount++;
    }
  }
  const results = targets.map(item => {
    const candidates = candidateFiles.map(candidate => {
      const score = scoreCandidate(candidate, item);
      return { filePath: candidate.filePath, fileName: candidate.fileName, size: candidate.size, ext: candidate.ext,
        metadata: candidate.metadata, probe: candidate.probe || { status: "not_read" }, ...score };
    }).filter(candidate => candidate.nameScore >= 60).sort((a, b) => b.score - a.score || a.filePath.localeCompare(b.filePath));
    const ambiguous = candidates.length > 1 || (candidates.length === 1 && scan.incomplete);
    return { itemId: item.itemId, itemIndex: item.itemIndex || null, name: item.name || "", originalPath: item.originalPath,
      footageMissing: item.footageMissing, status: candidates.length ? (ambiguous ? "ambiguous" : "matched") : "unmatched",
      isAmbiguous: ambiguous, selectedCandidate: candidates.length === 1 && !ambiguous ? candidates[0] : null,
      candidateCount: candidates.length, candidates, searchIncomplete: scan.incomplete,
      searchIncompleteNotice: scan.incomplete ? "Поиск не завершён; единственность кандидата не установлена." : null };
  });
  const { files: _files, ...summary } = scan;
  return { ok: true, ...summary, probedFilesCount, results };
}

function buildSourceRecoveryPlan(input = {}) {
  const requests = input.requests;
  const reject = (code, error) => ({ ok: false, code, error, plan: null });
  if (!Array.isArray(requests) || !requests.length || requests.length > 250) return reject("EMPTY_REQUESTS", "requests must contain 1..250 items.");
  const steps = [];
  const expectedReadBack = [];
  const seenIds = new Set();
  for (const req of requests) {
    if (!req || !Number.isSafeInteger(req.itemId) || req.itemId <= 0) return reject("INVALID_ITEM_ID", "itemId must be a positive integer.");
    if (seenIds.has(req.itemId)) return reject("DUPLICATE_TARGET_ITEM", "Duplicate recovery itemId.");
    seenIds.add(req.itemId);
    const itemName = req.expectedName || req.itemName || req.name;
    const previous = req.expectedPreviousFilePath || req.currentFilePath || req.originalPath || req.file;
    if (typeof itemName !== "string" || !itemName.trim()) return reject("MISSING_ITEM_NAME", "Inspected item name is required.");
    if (typeof previous !== "string" || !previous.trim()) return reject("MISSING_PREVIOUS_FILE_PATH", "Inspected previous path is required.");
    if (req.footageMissing !== true) return reject("EXPECTED_MISSING_STATE_REQUIRED", "Fresh inspected footageMissing must be true.");
    if (!Array.isArray(req.candidates) || !req.candidates.length) return reject("CANDIDATES_REQUIRED", "Current search candidate list is required.");
    if (typeof req.targetFilePath !== "string" || !req.targetFilePath.trim()) return reject("MISSING_TARGET_FILE", "Explicit targetFilePath selection is required.");
    // Mandatory even for one candidate: omitted isAmbiguous cannot bypass an explicit choice.
    if (req.candidateSelectionConfirmed !== true) return reject("UNCONFIRMED_CANDIDATE_SELECTION", "Explicit candidateSelectionConfirmed is required.");
    let target;
    try {
      target = fs.realpathSync(path.resolve(req.targetFilePath));
      if (!fs.statSync(target).isFile()) return reject("TARGET_IS_NOT_FILE", "Replacement must be a file.");
    } catch (error) { return reject("TARGET_FILE_NOT_FOUND", error.message); }
    const member = req.candidates.some(candidate => {
      if (!candidate || typeof candidate.filePath !== "string") return false;
      try { return pathsEqual(fs.realpathSync(candidate.filePath), target); } catch (_error) { return false; }
    });
    if (!member) return reject("TARGET_NOT_IN_CANDIDATES", "Selected path must be in the current candidate list.");
    steps.push({ tool: "relink_footage_source", args: { itemId: req.itemId,
      ...(Number.isSafeInteger(req.itemIndex) && req.itemIndex > 0 ? { itemIndex: req.itemIndex } : {}),
      expectedName: itemName, expectedPreviousFilePath: previous, filePath: target } });
    expectedReadBack.push({ itemId: req.itemId, name: itemName, file: target, footageMissing: false });
  }
  steps.push({ tool: "find_project_items", args: { type: "footage", itemIds: [...seenIds], limit: requests.length } });
  const plan = { summary: `Восстановить отсутствующие исходники: ${requests.length}.`, risk: "medium",
    mutatesProject: true, requiresCheckpoint: true, steps, expectedReadBack };
  return { ok: true, plan, expectedReadBack };
}

function verifySourceRecoveryReadBack(expected, observed) {
  const expectedItems = Array.isArray(expected) ? expected : expected && expected.expectedReadBack;
  const invalid = reason => ({ ok: false, status: "needs_review", reason, checks: [] });
  if (!Array.isArray(expectedItems) || !expectedItems.length) return invalid("invalid_expected_evidence");
  const ids = new Set();
  for (const item of expectedItems) {
    if (!item || !Number.isSafeInteger(item.itemId) || item.itemId <= 0 || ids.has(item.itemId) ||
      !absoluteFilePath(item.file || item.filePath) || item.footageMissing !== false) return invalid("invalid_expected_evidence");
    ids.add(item.itemId);
  }
  const rows = Array.isArray(observed) ? observed : observed && (observed.matches || observed.items || (observed.snapshot && observed.snapshot.items));
  if (!Array.isArray(rows)) return invalid("missing_independent_read_back");
  const checks = [];
  for (const item of expectedItems) {
    const matches = rows.filter(row => row && row.itemId === item.itemId);
    checks.push({ field: `itemId:${item.itemId}:item_found`, passed: matches.length === 1,
      expected: "one persistent itemId", observed: matches.length });
    if (matches.length !== 1) continue;
    const row = matches[0];
    checks.push({ field: `itemId:${item.itemId}:footageMissing`, passed: row.footageMissing === false,
      expected: false, observed: row.footageMissing === undefined ? "unknown" : row.footageMissing });
    checks.push({ field: `itemId:${item.itemId}:file`, passed: pathsEqual(row.file, item.file || item.filePath),
      expected: item.file || item.filePath, observed: row.file });
    if (item.name) checks.push({ field: `itemId:${item.itemId}:name`, passed: row.name === item.name, expected: item.name, observed: row.name });
  }
  const ok = checks.every(check => check.passed);
  return { ok, status: ok ? "passed" : "needs_review", checks };
}

module.exports = { findMissingFootageCandidates, buildSourceRecoveryPlan, verifySourceRecoveryReadBack,
  scanRoots, scoreCandidate, normalizePath, pathsEqual };
