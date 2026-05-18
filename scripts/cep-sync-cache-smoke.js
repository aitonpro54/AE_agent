"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const syncScript = path.join(__dirname, "cep-sync-health.js");
const extensionId = "com.codex.aemcpbridge";
const cacheSubdirs = [
  "Cache",
  "Code Cache",
  "GPUCache",
  "blob_storage"
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function writeFile(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
}

function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ae-cep-sync-cache-"));
  const installDir = path.join(tempRoot, "extensions", extensionId);
  const cacheRoot = path.join(tempRoot, "cep_cache");
  const extensionCache = path.join(cacheRoot, "AEFT_26.2_" + extensionId + ".panel");
  const localStorageFile = path.join(extensionCache, "Local Storage", "leveldb", "preserve.txt");

  try {
    for (const name of cacheSubdirs) {
      writeFile(path.join(extensionCache, name, "stale.bin"), "stale");
    }
    writeFile(localStorageFile, "keep");

    const result = spawnSync(process.execPath, [
      syncScript,
      "--sync",
      "--check",
      "--json",
      "--install-dir",
      installDir,
      "--cache-root",
      cacheRoot
    ], {
      cwd: repoRoot,
      encoding: "utf8"
    });

    assert(result.status === 0, result.stderr || result.stdout || "cep-sync-health failed");
    const report = JSON.parse(result.stdout);
    assert(report.ok === true, "sync report was not ok");
    assert(report.sync.copied >= 4, "expected tracked panel files to be copied");
    assert(report.cache && report.cache.attempted === true, "expected cache clear to run");
    assert(report.cache.cleared === cacheSubdirs.length, "expected all stale cache subdirs to be cleared");
    for (const name of cacheSubdirs) {
      assert(!fs.existsSync(path.join(extensionCache, name)), "cache subdir was not removed: " + name);
    }
    assert(fs.existsSync(localStorageFile), "Local Storage should be preserved");

    console.log(JSON.stringify({
      ok: true,
      copied: report.sync.copied,
      cacheCleared: report.cache.cleared,
      preservedLocalStorage: true
    }, null, 2));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
}
