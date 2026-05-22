"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const EXTENSION_ID = "com.codex.aemcpbridge";
const PROJECT_ROOT = path.resolve(__dirname, "..");
const SOURCE_DIR = path.join(PROJECT_ROOT, "cep-panel");
const CEP_CACHE_SUBDIRS = [
  "Cache",
  "Code Cache",
  "GPUCache",
  "blob_storage"
];
const TRACKED_FILES = [
  "index.html",
  "panel.js",
  "style.css",
  "CSXS/manifest.xml"
];

function defaultInstallDir() {
  const roaming = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return path.join(roaming, "Adobe", "CEP", "extensions", EXTENSION_ID);
}

function defaultCacheRoot() {
  return process.env.CEP_PANEL_CACHE_ROOT || path.join(os.tmpdir(), "cep_cache");
}

function compactHash(hash) {
  return hash ? hash.slice(0, 12) : null;
}

function resolveTracked(root, relativePath) {
  return path.join(root, ...relativePath.split("/"));
}

function fileState(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return {
      exists: stat.isFile(),
      inaccessible: false,
      error: stat.isFile() ? null : "not_a_file"
    };
  } catch (error) {
    if (error && (error.code === "EACCES" || error.code === "EPERM")) {
      return {
        exists: false,
        inaccessible: true,
        error: error.message || String(error)
      };
    }
    return {
      exists: false,
      inaccessible: false,
      error: null
    };
  }
}

function readUtf8(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (_error) {
    return "";
  }
}

function sha256(filePath) {
  const state = fileState(filePath);
  if (!state.exists) {
    return {
      hash: null,
      inaccessible: state.inaccessible,
      error: state.error
    };
  }
  try {
    const hash = crypto.createHash("sha256");
    hash.update(fs.readFileSync(filePath));
    return {
      hash: hash.digest("hex"),
      inaccessible: false,
      error: null
    };
  } catch (error) {
    return {
      hash: null,
      inaccessible: true,
      error: error.message || String(error)
    };
  }
}

function firstMatch(text, pattern) {
  const match = String(text || "").match(pattern);
  return match ? match[1] : null;
}

function panelVersion(root) {
  return firstMatch(readUtf8(resolveTracked(root, "panel.js")), /APP_VERSION\s*=\s*"([^"]+)"/);
}

function indexTitle(root) {
  return firstMatch(readUtf8(resolveTracked(root, "index.html")), /<title>\s*([^<]+?)\s*<\/title>/i);
}

function manifestInfo(root) {
  const text = readUtf8(resolveTracked(root, "CSXS/manifest.xml"));
  return {
    bundleVersion: firstMatch(text, /ExtensionBundleVersion="([^"]+)"/),
    bundleName: firstMatch(text, /ExtensionBundleName="([^"]+)"/),
    extensionVersion: firstMatch(text, /<Extension\s+Id="com\.codex\.aemcpbridge\.panel"\s+Version="([^"]+)"/),
    menu: firstMatch(text, /<Menu>\s*([^<]+?)\s*<\/Menu>/i)
  };
}

function daemonVersion() {
  return firstMatch(readUtf8(path.join(PROJECT_ROOT, "mcp-server", "bridge-daemon.js")), /SERVER_VERSION\s*=\s*"([^"]+)"/);
}

function compareFiles(sourceDir, installDir) {
  return TRACKED_FILES.map((relativePath) => {
    const sourcePath = resolveTracked(sourceDir, relativePath);
    const installedPath = resolveTracked(installDir, relativePath);
    const sourceDigest = sha256(sourcePath);
    const installedDigest = sha256(installedPath);
    const sourceHash = sourceDigest.hash;
    const installedHash = installedDigest.hash;
    let status = "same";
    if (sourceDigest.inaccessible) status = "source_inaccessible";
    else if (!sourceHash) status = "source_missing";
    else if (installedDigest.inaccessible) status = "installed_inaccessible";
    else if (!installedHash) status = "missing";
    else if (sourceHash !== installedHash) status = "different";
    return {
      path: relativePath,
      status,
      sourcePath,
      installedPath,
      sourceHash,
      installedHash,
      sourceHashShort: compactHash(sourceHash),
      installedHashShort: compactHash(installedHash),
      sourceError: sourceDigest.error || null,
      installedError: installedDigest.error || null
    };
  });
}

function copyChangedFiles(files) {
  const actions = [];
  for (const item of files) {
    if (item.status === "same") {
      actions.push({ path: item.path, action: "skipped", reason: "same" });
      continue;
    }
    if (item.status === "source_missing" || item.status === "source_inaccessible" || item.status === "installed_inaccessible") {
      actions.push({ path: item.path, action: "skipped", reason: item.status });
      continue;
    }
    fs.mkdirSync(path.dirname(item.installedPath), { recursive: true });
    fs.copyFileSync(item.sourcePath, item.installedPath);
    actions.push({ path: item.path, action: "copied", reason: item.status });
  }
  return actions;
}

function pathInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function discoverCepCacheDirs(cacheRoot) {
  try {
    return fs.readdirSync(cacheRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.indexOf(EXTENSION_ID) >= 0)
      .map((entry) => path.join(cacheRoot, entry.name));
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

function clearCepCaches(options) {
  const cacheRoot = path.resolve(options.cacheRoot || defaultCacheRoot());
  const actions = [];
  const cacheDirs = discoverCepCacheDirs(cacheRoot);
  for (const cacheDir of cacheDirs) {
    const resolvedCacheDir = path.resolve(cacheDir);
    if (!pathInside(cacheRoot, resolvedCacheDir)) {
      actions.push({ path: resolvedCacheDir, action: "skipped", reason: "outside_cache_root" });
      continue;
    }
    for (const name of CEP_CACHE_SUBDIRS) {
      const target = path.resolve(resolvedCacheDir, name);
      if (!pathInside(resolvedCacheDir, target)) {
        actions.push({ path: target, action: "skipped", reason: "outside_extension_cache" });
        continue;
      }
      if (!fs.existsSync(target)) {
        actions.push({ path: target, action: "skipped", reason: "missing" });
        continue;
      }
      try {
        fs.rmSync(target, { recursive: true, force: true });
        actions.push({ path: target, action: "cleared", reason: "cache" });
      } catch (error) {
        actions.push({ path: target, action: "error", reason: error.message || String(error) });
      }
    }
  }
  return {
    attempted: true,
    cacheRoot,
    extensionCacheDirs: cacheDirs,
    cleared: actions.filter((item) => item.action === "cleared").length,
    skipped: actions.filter((item) => item.action === "skipped").length,
    errors: actions.filter((item) => item.action === "error").length,
    preserved: [
      "Local Storage"
    ],
    actions
  };
}

function addVersionMismatch(mismatches, name, expected, actual) {
  if (!expected || !actual || expected === actual) return;
  mismatches.push({ name, expected, actual });
}

function appTitle(version) {
  return version ? `AE Agent ${version}` : null;
}

function collectVersions(sourceDir, installDir) {
  const repo = {
    daemon: daemonVersion(),
    panel: panelVersion(sourceDir),
    indexTitle: indexTitle(sourceDir),
    manifest: manifestInfo(sourceDir)
  };
  const installed = {
    panel: panelVersion(installDir),
    indexTitle: indexTitle(installDir),
    manifest: manifestInfo(installDir)
  };
  const mismatches = [];
  addVersionMismatch(mismatches, "repo daemon vs repo panel", repo.daemon, repo.panel);
  addVersionMismatch(mismatches, "repo index title vs repo panel title", appTitle(repo.panel), repo.indexTitle);
  addVersionMismatch(mismatches, "repo daemon vs repo manifest bundle", repo.daemon, repo.manifest.bundleVersion);
  addVersionMismatch(mismatches, "repo panel vs repo manifest extension", repo.panel, repo.manifest.extensionVersion);
  addVersionMismatch(mismatches, "installed panel vs repo panel", repo.panel, installed.panel);
  addVersionMismatch(mismatches, "installed title vs repo title", repo.indexTitle, installed.indexTitle);
  addVersionMismatch(mismatches, "installed manifest bundle vs repo manifest bundle", repo.manifest.bundleVersion, installed.manifest.bundleVersion);
  addVersionMismatch(mismatches, "installed manifest extension vs repo manifest extension", repo.manifest.extensionVersion, installed.manifest.extensionVersion);
  addVersionMismatch(mismatches, "installed manifest menu vs repo manifest menu", repo.manifest.menu, installed.manifest.menu);
  return { repo, installed, mismatches };
}

function buildReport(options) {
  const installDir = options.installDir || defaultInstallDir();
  const beforeFiles = compareFiles(SOURCE_DIR, installDir);
  const syncActions = options.sync ? copyChangedFiles(beforeFiles) : [];
  const shouldClearCache = options.clearCache || options.sync;
  const cache = shouldClearCache
    ? clearCepCaches(options)
    : {
      attempted: false,
      cacheRoot: path.resolve(options.cacheRoot || defaultCacheRoot()),
      extensionCacheDirs: [],
      cleared: 0,
      skipped: 0,
      errors: 0,
      preserved: [
        "Local Storage"
      ],
      actions: []
    };
  const files = options.sync ? compareFiles(SOURCE_DIR, installDir) : beforeFiles;
  const versions = collectVersions(SOURCE_DIR, installDir);
  const ok = files.every((item) => item.status === "same") && versions.mismatches.length === 0 && cache.errors === 0;
  return {
    ok,
    mode: options.sync ? "sync" : "check",
    sourceDir: SOURCE_DIR,
    installDir,
    trackedFiles: TRACKED_FILES.slice(),
    files,
    versions,
    sync: {
      copied: syncActions.filter((item) => item.action === "copied").length,
      skipped: syncActions.filter((item) => item.action === "skipped").length,
      actions: syncActions
    },
    cache
  };
}

function printHuman(report) {
  console.log("CEP sync health");
  console.log(`Source: ${report.sourceDir}`);
  console.log(`Installed: ${report.installDir}`);
  console.log(`Status: ${report.ok ? "ok" : "mismatch"}`);
  console.log("");
  console.log("Files:");
  for (const item of report.files) {
    const hashes = item.sourceHashShort || item.installedHashShort
      ? ` repo=${item.sourceHashShort || "-"} installed=${item.installedHashShort || "-"}`
      : "";
    console.log(`  ${item.status.padEnd(14)} ${item.path}${hashes}`);
  }
  console.log("");
  console.log("Versions:");
  console.log(`  repo daemon: ${report.versions.repo.daemon || "-"}`);
  console.log(`  repo panel: ${report.versions.repo.panel || "-"}`);
  console.log(`  repo manifest: ${report.versions.repo.manifest.bundleVersion || "-"} / ${report.versions.repo.manifest.menu || "-"}`);
  console.log(`  installed panel: ${report.versions.installed.panel || "-"}`);
  console.log(`  installed title: ${report.versions.installed.indexTitle || "-"}`);
  console.log(`  installed manifest: ${report.versions.installed.manifest.bundleVersion || "-"} / ${report.versions.installed.manifest.menu || "-"}`);
  if (report.versions.mismatches.length) {
    console.log("");
    console.log("Version mismatches:");
    for (const mismatch of report.versions.mismatches) {
      console.log(`  ${mismatch.name}: expected ${mismatch.expected}, got ${mismatch.actual}`);
    }
  }
  if (report.sync.actions.length) {
    console.log("");
    console.log(`Sync actions: copied ${report.sync.copied}, skipped ${report.sync.skipped}`);
    for (const action of report.sync.actions) {
      console.log(`  ${action.action.padEnd(7)} ${action.path} (${action.reason})`);
    }
  }
  if (report.cache.attempted) {
    console.log("");
    console.log(`Cache actions: cleared ${report.cache.cleared}, skipped ${report.cache.skipped}, errors ${report.cache.errors}`);
    console.log(`  root: ${report.cache.cacheRoot}`);
    console.log(`  preserved: ${report.cache.preserved.join(", ")}`);
    for (const action of report.cache.actions) {
      console.log(`  ${action.action.padEnd(7)} ${action.path} (${action.reason})`);
    }
  }
}

function printHelp() {
  console.log([
    "Usage: node scripts/cep-sync-health.js [--check] [--sync] [--json] [--install-dir <path>]",
    "",
    "--check       Exit with code 1 when tracked installed CEP files or versions mismatch.",
    "--sync        Copy only missing/different tracked CEP files, then clear this extension's CEP cache.",
    "--clear-cache Clear this extension's CEP Cache, Code Cache, GPUCache, and blob_storage while preserving Local Storage.",
    "--json        Print JSON instead of human-readable output.",
    "--install-dir Override the installed CEP extension directory.",
    "--cache-root  Override the CEP cache root; defaults to %TEMP%/cep_cache."
  ].join("\n"));
}

function parseArgs(argv) {
  const options = {
    check: false,
    sync: false,
    json: false,
    clearCache: false,
    installDir: process.env.CEP_PANEL_INSTALL_DIR || "",
    cacheRoot: process.env.CEP_PANEL_CACHE_ROOT || ""
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--check") {
      options.check = true;
    } else if (arg === "--sync") {
      options.sync = true;
    } else if (arg === "--clear-cache") {
      options.clearCache = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--install-dir") {
      index += 1;
      options.installDir = argv[index] || "";
    } else if (arg === "--cache-root") {
      index += 1;
      options.cacheRoot = argv[index] || "";
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const report = buildReport(options);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }
  if (options.check && !report.ok) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
}
