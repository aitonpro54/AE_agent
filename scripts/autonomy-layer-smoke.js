"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const runner = path.join(repoRoot, "scripts", "autonomy.mjs");

function writeFile(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function createFixture(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `ae-autonomy-${name}-`));
  writeFile(path.join(root, "package.json"), `${JSON.stringify({ name: `fixture-${name}`, private: true }, null, 2)}\n`);
  writeFile(
    path.join(root, "scripts", "tool.js"),
    [
      "\"use strict\";",
      "",
      "function main() {",
      "  console.log(\"fixture tool\");",
      "}",
      "",
      "if (require.main === module) {",
      "  main();",
      "}",
      "",
    ].join("\n"),
  );
  writeFile(path.join(root, "node_modules", "ignored.js"), "console.log('ignored');\n");
  writeFile(path.join(root, ".env"), "OPENAI_API_KEY=fixture-redacted-value\n");
  return root;
}

function run(root, args, extra = {}) {
  const result = spawnSync(process.execPath, [runner, ...args, "--repo", root, "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    ...extra,
  });
  if (result.status !== 0) {
    throw new Error(`command failed: ${args.join(" ")}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

function assertInventoryIgnoreRules(root) {
  run(root, ["init"]);
  const inventory = run(root, ["inventory"]);
  const ids = inventory.candidates.map((candidate) => candidate.id);
  assert(ids.includes("scripts/tool.js"), "fixture tool should be inventoried");
  assert(!ids.some((id) => id.includes("node_modules")), "node_modules must be ignored");
  assert(!ids.some((id) => id.includes(".env")), "secret files must be ignored");
}

function assertRunOnceUpdatesStateAndHandoff(root) {
  const result = run(root, ["run-once", "--batch-size", "1"]);
  assert.strictEqual(result.schema, "codex-autonomy.run-once.v1");
  const state = readJson(path.join(root, ".codex-autonomy", "state.json"));
  assert.strictEqual(state.schema_version, "1");
  assert(state.script_inventory.accepted.includes("scripts/tool.js"), "tool should be accepted after generated lane revalidation");
  assert.strictEqual(state.status, "done");
  assert(fs.existsSync(path.join(root, ".codex-autonomy", "exact_next_prompt.md")), "exact prompt must exist");
  assert(fs.existsSync(path.join(root, ".codex-autonomy", "handoff.md")), "handoff must exist");
  assert(fs.readFileSync(path.join(root, ".codex-autonomy", "handoff.md"), "utf8").includes("Exact next prompt"));
  assert(fs.existsSync(path.join(root, ".codex-autonomy", "reports", "summary.md")), "summary report must exist");
}

function assertSuperviseDryRunDoesNotRunCodex(root) {
  const result = run(root, ["supervise", "--dry-run"]);
  assert.strictEqual(result.schema, "codex-autonomy.supervise-dry-run.v1");
  assert.strictEqual(result.will_execute, false);
  assert.match(result.command, /codex exec --sandbox workspace-write -/);
  assert(result.prompt_preview.includes(".codex-autonomy/state.json"));
}

function assertTerminalStatusesStopLoop(root) {
  const statePath = path.join(root, ".codex-autonomy", "state.json");
  for (const status of ["done", "blocked", "needs_human"]) {
    const state = readJson(statePath);
    state.status = status;
    fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    const result = run(root, ["supervise"]);
    assert.strictEqual(result.schema, "codex-autonomy.supervise.v1");
    assert.strictEqual(result.stopped, true);
    assert.strictEqual(result.reason, `state-status-${status}`);
  }
}

function assertBlockedExternalRiskUsesExplicitSafeLane() {
  const root = createFixture("external-risk");
  writeFile(
    path.join(root, "scripts", "live-risk.js"),
    [
      "\"use strict\";",
      "",
      "const endpoint = \"http://127.0.0.1:1/health\";",
      "const token = process.env.AE_AGENT_API_KEY;",
      "",
      "function main() {",
      "  return { endpoint, hasToken: Boolean(token) };",
      "}",
      "",
      "module.exports = { main };",
      "",
    ].join("\n"),
  );

  run(root, ["init"]);
  run(root, ["rank"]);
  run(root, ["run-once", "--batch-size", "5"]);

  const statePath = path.join(root, ".codex-autonomy", "state.json");
  let state = readJson(statePath);
  assert(state.script_inventory.blocked.includes("scripts/live-risk.js"), "external risk candidate should block without explicit safe lane");

  const lanePath = path.join(root, ".codex-autonomy", "lanes", "scripts-live-risk.json");
  const lane = readJson(lanePath);
  lane.type = "explicit-safe-validation-lane";
  lane.description = "Read-only fixture lane for external-risk static revalidation.";
  lane.external_risk_coverage = {
    approved: true,
    strategy: "read-only-fixture",
    evidence: [
      "candidate behavior is not executed",
      "lane performs syntax-only validation",
      "no network or credential access is required"
    ]
  };
  fs.writeFileSync(lanePath, `${JSON.stringify(lane, null, 2)}\n`, "utf8");

  const result = run(root, ["revalidate", "--include-blocked", "--batch-size", "1"]);
  assert.strictEqual(result.schema, "codex-autonomy.revalidate.v1");
  assert.strictEqual(result.results[0].status, "accepted");

  run(root, ["handoff"]);
  state = readJson(statePath);
  assert(state.script_inventory.accepted.includes("scripts/live-risk.js"), "explicit safe lane should accept external risk candidate");
  assert(!state.script_inventory.blocked.includes("scripts/live-risk.js"), "external risk candidate should leave blocked");
  assert.strictEqual(state.status, "done");
}

function main() {
  const root = createFixture("layer");
  assertInventoryIgnoreRules(root);
  run(root, ["rank"]);
  assertRunOnceUpdatesStateAndHandoff(root);
  assertSuperviseDryRunDoesNotRunCodex(root);
  assertTerminalStatusesStopLoop(root);
  assertBlockedExternalRiskUsesExplicitSafeLane();
  console.log("Autonomy layer smoke: pass");
}

main();
