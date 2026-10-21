"use strict";

// Actual isolated daemon processes and loopback HTTP only; no live AE/CEP/CDP.
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const crypto = require("crypto");
const Module = require("module");
const { execFileSync } = require("child_process");
const { PROJECT_ROOT, startDaemon, expectDaemonStartRejected, pollPanel,
  createRuntimeDirectory, safeRemoveRuntime, reserveLoopbackPort, request, isolatedEnvironment } = require("./network-test-fixture");

const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const options = { automationToken: "fixture-isolation-auto", panelToken: "fixture-isolation-panel" };
const authorityRoot = root => path.join(root, ".codex-runtime", "owned-runtime-maintenance");
const NODE_KEYS = /^NODE_(OPTIONS|PATH|V8_COVERAGE|COMPILE_CACHE|REDIRECT_WARNINGS)$/i;
async function withNodeEnvironment(values, action) {
  const previous = Object.entries(process.env).filter(([key]) => NODE_KEYS.test(key));
  try {
    for (const key of Object.keys(process.env)) if (NODE_KEYS.test(key)) delete process.env[key];
    Object.assign(process.env, values);
    return await action();
  } finally {
    for (const key of Object.keys(process.env)) if (NODE_KEYS.test(key)) delete process.env[key];
    for (const [key, value] of previous) process.env[key] = value;
  }
}
function independentFixtureModule() {
  const filename = require.resolve("./network-test-fixture");
  const other = new Module(filename, module);
  other.filename = filename;
  other.paths = Module._nodeModulePaths(path.dirname(filename));
  other._compile(fs.readFileSync(filename, "utf8"), filename);
  return other.exports;
}
function snapshot(root) {
  const rows = [];
  function walk(target, name) {
    if (!fs.existsSync(target)) return;
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) rows.push([name, "alias", fs.readlinkSync(target)]);
    else if (stat.isDirectory()) {
      rows.push([name, "directory"]);
      for (const child of fs.readdirSync(target).sort()) walk(path.join(target, child), `${name}/${child}`);
    } else rows.push([name, stat.size, hash(fs.readFileSync(target))]);
  }
  walk(root, ".");
  return rows;
}
function assertCleanLaunch(runtimeDir, launchRoot) {
  assert.equal(path.dirname(launchRoot), runtimeDir);
  assert.deepEqual(fs.readdirSync(launchRoot).sort(), ["cep-panel", "mcp-server", "orchestrator", "recipes", "registry", "scripts"]);
  assert.deepEqual(fs.readdirSync(path.join(launchRoot, "orchestrator")), ["bounded-process-result.cjs"]);
  for (const name of [".git", ".env", ".codex", ".codex-runtime", "logs", "settings", "state", "config", "node_modules"]) {
    assert.equal(fs.existsSync(path.join(launchRoot, name)), false, `must not copy ${name}`);
  }
  for (const name of ["mcp-server/bridge-daemon.js", "mcp-server/owned-runtime-authority.js", "registry/solutions.json", "cep-panel/index.html"]) {
    const source = path.join(PROJECT_ROOT, name), copied = path.join(launchRoot, name);
    assert.notEqual(fs.realpathSync(source), fs.realpathSync(copied));
    assert.equal(fs.lstatSync(copied).nlink, 1);
    assert.equal(fs.lstatSync(copied).isSymbolicLink(), false);
    assert.deepEqual(fs.readFileSync(copied), fs.readFileSync(source), "copy current disk bytes");
  }
}

async function main() {
  const before = snapshot(authorityRoot(PROJECT_ROOT));
  let first, second, retainedRoot;
  let checks = 0;
  const artifacts = [];
  try {
    const envRoot = createRuntimeDirectory();
    artifacts.push(envRoot);
    const inherited = process.env.AE_OWNED_RUNTIME_GENERATION;
    let env;
    try {
      process.env.AE_OWNED_RUNTIME_GENERATION = "inherited-selector-must-be-cleared";
      env = isolatedEnvironment(envRoot, { ...options, port: 12345 });
    } finally {
      if (inherited === undefined) delete process.env.AE_OWNED_RUNTIME_GENERATION;
      else process.env.AE_OWNED_RUNTIME_GENERATION = inherited;
    }
    // Existing sanitizer must discard all inherited owned-runtime selectors.
    assert(!Object.keys(env).some(key => /^AE_OWNED_RUNTIME_|^AE_AGENT_LOCAL_SESSION_|^AE_AGENT_TRUSTED_READ_/i.test(key)));
    checks++;
    const preload = path.join(envRoot, "external-preload.cjs"), preloadMarker = path.join(envRoot, "preload-executed.txt");
    const moduleRoot = path.join(envRoot, "external-modules"), moduleMarker = path.join(envRoot, "external-module-executed.txt");
    const coverage = path.join(envRoot, "external-coverage"), cache = path.join(envRoot, "external-compile-cache");
    const warnings = path.join(envRoot, "external-warnings.txt");
    fs.mkdirSync(moduleRoot);
    fs.writeFileSync(preload, `require('fs').writeFileSync(${JSON.stringify(preloadMarker)},'unexpected preload');`);
    fs.writeFileSync(path.join(moduleRoot, "fixture-external-only-module.js"), `require('fs').writeFileSync(${JSON.stringify(moduleMarker)},'unexpected module');`);
    await withNodeEnvironment({
      NODE_OPTIONS: `--require "${preload}"`, NODE_PATH: moduleRoot,
      NODE_V8_COVERAGE: coverage, NODE_COMPILE_CACHE: cache, NODE_REDIRECT_WARNINGS: warnings
    }, async () => {
      env = isolatedEnvironment(envRoot, { ...options, port: 12345 });
      assert.deepEqual(Object.keys(env).filter(key => NODE_KEYS.test(key)), ["NODE_V8_COVERAGE"]);
      assert.equal(env.NODE_V8_COVERAGE, "");
      const probe = execFileSync(process.execPath, ["-e", "process.emitWarning('isolated environment probe');try{require('fixture-external-only-module');process.exitCode=1;}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}"],
        { cwd: envRoot, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      assert.equal(String(probe), "");
      first = await startDaemon({ ...options, setupRuntime: assertCleanLaunch });
      for (const marker of [preloadMarker, moduleMarker, coverage, cache, warnings]) assert.equal(fs.existsSync(marker), false, "Node preload/path/write redirects must not escape into external paths");
    });
    checks++;
    await withNodeEnvironment({ node_options: `--require "${preload}"`, NoDe_PaTh: moduleRoot,
      node_v8_coverage: coverage, Node_Compile_Cache: cache, nOdE_ReDiReCt_WaRnInGs: warnings }, async () => {
      const sanitized = isolatedEnvironment(envRoot, { ...options, port: 12345 });
      assert.deepEqual(Object.keys(sanitized).filter(key => NODE_KEYS.test(key)), ["NODE_V8_COVERAGE"]);
      assert.equal(sanitized.NODE_V8_COVERAGE, "");
    });
    checks++;
    const otherFixture = independentFixtureModule();
    assert.throws(() => otherFixture.safeRemoveRuntime(first.runtimeDir), { code: "fixture_runtime_not_owned" });
    assert.throws(() => safeRemoveRuntime(first.runtimeDir), { code: "fixture_runtime_active" });
    assert.equal((await first.request()).status, 200, "foreign owner must not remove a running fixture");
    const helper = createRuntimeDirectory();
    fs.writeFileSync(path.join(helper, "owned-marker.txt"), "preserve me");
    try {
      assert.throws(() => otherFixture.safeRemoveRuntime(helper), { code: "fixture_runtime_not_owned" });
      assert.equal(fs.readFileSync(path.join(helper, "owned-marker.txt"), "utf8"), "preserve me");
      await assert.rejects(startDaemon({ ...options, runtimeDir: helper }), { code: "fixture_runtime_not_daemon" });
    } finally { safeRemoveRuntime(helper); }
    assert.equal(fs.existsSync(helper), false, "own helper cleanup must work");
    checks++;
    const health = await first.request();
    assert.equal(health.body.ok, true);
    assert.notEqual(first.port, 3456);
    assert.notEqual(first.launchRoot, PROJECT_ROOT);
    assert.equal(fs.existsSync(authorityRoot(first.launchRoot)), false);
    assert.deepEqual(first.child.spawnargs, [process.execPath, path.join(first.launchRoot, "mcp-server", "bridge-daemon.js")]);
    checks++;
    second = await startDaemon({ automationToken: "fixture-isolation-second-auto", panelToken: "fixture-isolation-second-panel", setupRuntime: assertCleanLaunch });
    assert.notEqual(first.port, second.port);
    assert.notEqual(first.runtimeDir, second.runtimeDir);
    assert.notEqual(first.launchRoot, second.launchRoot);
    assert.equal((await second.request({ path: "/tools", token: first.automationToken })).status, 401);
    assert.equal((await first.request({ path: "/tools", token: second.automationToken })).status, 401);
    await pollPanel(first);
    assert.equal((await first.request({ path: "/autonomy/session", token: first.panelToken })).body.session.active, true);
    assert.equal((await second.request({ path: "/autonomy/session", token: second.panelToken })).body.session.active, false);
    checks++;
    await assert.rejects(startDaemon({ ...options, runtimeDir: first.runtimeDir }), { code: "fixture_runtime_active" });
    checks++;
    retainedRoot = first.runtimeDir;
    const oldFixture = first, launchRoot = first.launchRoot;
    await first.stop(false);
    assert.throws(() => otherFixture.safeRemoveRuntime(retainedRoot), { code: "fixture_runtime_not_owned" });
    assert.equal(fs.existsSync(retainedRoot), true, "foreign owner must not remove stopped retained state");
    checks++;
    first = await startDaemon({ ...options, runtimeDir: retainedRoot });
    assert.equal(first.launchRoot, launchRoot);
    assert.equal((await first.request({ path: "/autonomy/session", token: first.panelToken })).body.session.desiredEnabled, true);
    assert.equal((await first.request({ path: "/autonomy/session", token: first.panelToken })).body.session.connectionReady, false);
    await assert.rejects(oldFixture.stop(), { code: "fixture_runtime_owner_changed" });
    checks++;
    await first.stop(false);
    await assert.rejects(startDaemon({ ...options, runtimeDir: retainedRoot, setupRuntime() { throw Error("expected_restart_failure"); } }), /expected_restart_failure/);
    assert.equal(fs.existsSync(retainedRoot), true, "failed restart must preserve prior state");
    await first.stop(false); // prior stopped owner still controls its retained root
    checks++;
    await assert.rejects(startDaemon({ ...options, runtimeDir: retainedRoot + path.sep + "." }), { code: "fixture_runtime_path_refused" });
    checks++;
    const daemonFile = path.join(first.launchRoot, "mcp-server", "bridge-daemon.js"), bytes = fs.readFileSync(daemonFile);
    fs.appendFileSync(daemonFile, "\n// unexpected source drift\n");
    try { await assert.rejects(startDaemon({ ...options, runtimeDir: retainedRoot }), { code: "fixture_launch_source_changed" }); }
    finally { fs.writeFileSync(daemonFile, bytes); }
    checks++;
    fs.unlinkSync(daemonFile);
    try { await assert.rejects(startDaemon({ ...options, runtimeDir: retainedRoot }), { code: "ENOENT" }); }
    finally { fs.writeFileSync(daemonFile, bytes); }
    checks++;
    const hardlink = path.join(first.launchRoot, "daemon-hardlink.js");
    fs.linkSync(daemonFile, hardlink);
    try { await assert.rejects(startDaemon({ ...options, runtimeDir: retainedRoot }), { code: "fixture_nonregular_path_refused" }); }
    finally { fs.unlinkSync(hardlink); }
    checks++;
    const alias = fs.mkdtempSync(path.join(os.tmpdir(), "ae-agent-network-boundary-alias-"));
    fs.rmdirSync(alias);
    fs.symlinkSync(retainedRoot, alias, process.platform === "win32" ? "junction" : "dir");
    try {
      await assert.rejects(startDaemon({ ...options, runtimeDir: alias }), { code: "fixture_path_alias_refused" });
      assert.throws(() => safeRemoveRuntime(alias), { code: "fixture_runtime_not_owned" });
      assert.equal(fs.existsSync(daemonFile), true);
    } finally { fs.unlinkSync(alias); }
    checks++;
    const sourceAlias = path.join(first.launchRoot, "source-alias");
    fs.symlinkSync(path.join(second.launchRoot, "mcp-server"), sourceAlias, process.platform === "win32" ? "junction" : "dir");
    try { await assert.rejects(startDaemon({ ...options, runtimeDir: retainedRoot }), { code: "fixture_path_alias_refused" }); }
    finally { fs.unlinkSync(sourceAlias); }
    checks++;
    const foreign = otherFixture.createRuntimeDirectory();
    try {
      assert.throws(() => safeRemoveRuntime(foreign), { code: "fixture_runtime_not_owned" });
      await assert.rejects(startDaemon({ ...options, runtimeDir: foreign }), { code: "fixture_runtime_not_owned" });
      assert.equal(fs.existsSync(foreign), true);
    } finally { otherFixture.safeRemoveRuntime(foreign); }
    assert.equal(fs.existsSync(foreign), false, "independent module can clean its own helper");
    await assert.rejects(startDaemon({ ...options, runtimeDir: PROJECT_ROOT }), { code: "fixture_runtime_path_refused" });
    await assert.rejects(startDaemon({ ...options, port: 3456 }), { code: "fixture_port_refused" });
    checks++;
    let rejectedRuntime;
    const sentinel = await expectDaemonStartRejected({ ...options, setupRuntime(runtimeDir, launchRoot) {
      assertCleanLaunch(runtimeDir, launchRoot);
      rejectedRuntime = runtimeDir;
      fs.mkdirSync(authorityRoot(launchRoot), { recursive: true });
      fs.writeFileSync(path.join(authorityRoot(launchRoot), "current-daemon.json"), '{"managedSentinel":true}\n');
    } });
    assert.notEqual(sentinel.exitCode, 0);
    assert.match(sentinel.stderr, /owned_supervisor_unreserved_startup_refused/);
    assert.equal(fs.existsSync(rejectedRuntime), false);
    checks++;
    let failedRuntime;
    const failedPort = await reserveLoopbackPort();
    await assert.rejects(startDaemon({ ...options, port: failedPort, setupRuntime(runtimeDir, launchRoot) {
      failedRuntime = runtimeDir;
      fs.mkdirSync(authorityRoot(launchRoot), { recursive: true });
      fs.mkdirSync(path.join(authorityRoot(launchRoot), "daemon-launch-keys"));
    } }), /owned_supervisor_unreserved_startup_refused/);
    assert.equal(fs.existsSync(failedRuntime), false, "startup failure must remove new fixture");
    await assert.rejects(request({ port: failedPort }, { timeoutMs: 100 }), { code: "ECONNREFUSED" });
    checks++;
    let setupFailureRoot;
    await assert.rejects(startDaemon({ ...options, setupRuntime(runtimeDir) { setupFailureRoot = runtimeDir; throw Error("expected_setup_failure"); } }), /expected_setup_failure/);
    assert.equal(fs.existsSync(setupFailureRoot), false);
    checks++;
    // Deterministic filesystem observation fault: no working source is edited.
    // The second read reports changed disk bytes during the final snapshot pass.
    const originalRead = fs.readFileSync, originalWrite = fs.writeFileSync;
    const sourceFile = path.join(PROJECT_ROOT, "mcp-server", "bridge-daemon.js");
    let sourceReads = 0, driftRuntime;
    fs.readFileSync = (file, ...args) => {
      const value = originalRead(file, ...args);
      if (file === sourceFile && ++sourceReads === 2) return Buffer.concat([value, Buffer.from("\n// simulated concurrent change\n")]);
      return value;
    };
    fs.writeFileSync = (file, ...args) => {
      if (typeof file === "string" && file !== sourceFile && file.endsWith(path.join("launch", "mcp-server", "bridge-daemon.js"))) {
        driftRuntime = path.resolve(file, "..", "..", "..");
      }
      return originalWrite(file, ...args);
    };
    try { await assert.rejects(startDaemon(options), { code: "fixture_source_changed_during_snapshot" }); }
    finally { fs.readFileSync = originalRead; fs.writeFileSync = originalWrite; }
    assert(driftRuntime);
    assert.equal(fs.existsSync(driftRuntime), false);
    checks++;
    // An occupied random port returning plausible health must never be mistaken
    // for this child, even before the child reports its bind failure.
    const server = http.createServer((_req, res) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ ok: true, port: server.address().port })); });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    let occupiedRuntime;
    try {
      await assert.rejects(startDaemon({ ...options, port: server.address().port, setupRuntime(runtimeDir) { occupiedRuntime = runtimeDir; } }), /EADDRINUSE/);
      assert.equal(fs.existsSync(occupiedRuntime), false);
    } finally { await new Promise(resolve => server.close(resolve)); }
    checks++;
    // A timeout also kills and waits for its child before removing the root.
    let timeoutRoot;
    const timeoutPort = await reserveLoopbackPort();
    await assert.rejects(startDaemon({ ...options, port: timeoutPort, readyTimeoutMs: 1, setupRuntime(runtimeDir) { timeoutRoot = runtimeDir; } }));
    assert.equal(fs.existsSync(timeoutRoot), false);
    await assert.rejects(request({ port: timeoutPort }, { timeoutMs: 100 }), { code: "ECONNREFUSED" });
    checks++;
    first = await startDaemon({ ...options, runtimeDir: retainedRoot });
    assert.equal((await first.request()).status, 200, "rejected reuse attempts must preserve owned state");
    checks++;
  } finally {
    if (first) await first.stop();
    if (second) await second.stop();
    for (const directory of artifacts) safeRemoveRuntime(directory);
    assert.deepEqual(snapshot(authorityRoot(PROJECT_ROOT)), before, "working authority tree bytes must remain unchanged");
  }
  console.log(JSON.stringify({ ok: true, checks, actualDaemon: true, isolatedLoopback: true, liveAE: false,
    workingAuthorityUnchanged: true, authoritySnapshotSha256: hash(JSON.stringify(before)) }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
