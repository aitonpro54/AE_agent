"use strict";

const assert = require("assert");
const path = require("path");
const { spawnSync } = require("child_process");

const repo = path.resolve(__dirname, "..");

const EXPECTED_CHECK_IDS = [
  "allowed-sdk-write-scopes",
  "review-required-scopes",
  "production-code-governance-allowlist",
  "production-code-enable-governance-match",
  "cep-panel-disabled",
  "no-new-sdkthread-or-network-approval",
  "no-broad-production-code-approval",
];
const EXPECTED_PRODUCTION_CODE_ALLOWLIST = [
  "scripts/provider-api-smoke.js",
  "scripts/provider-contract-smoke.js",
];

function extractJsonObject(output) {
  const text = String(output || "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  assert(start >= 0 && end > start, "Governance report command did not print a JSON object.");

  return JSON.parse(text.slice(start, end + 1));
}

function formatProcessResult(result) {
  return [
    `status: ${result.status}`,
    `stdout: ${String(result.stdout || "").trim()}`,
    `stderr: ${String(result.stderr || "").trim()}`,
  ].join("\n");
}

function runGovernanceReportCommand() {
  const result =
    process.platform === "win32"
      ? spawnSync(
          process.env.ComSpec || "cmd.exe",
          ["/d", "/s", "/c", "npm.cmd run --silent codex:orchestrator:governance-report"],
          {
            cwd: repo,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            timeout: 30000,
          },
        )
      : spawnSync("npm", ["run", "--silent", "codex:orchestrator:governance-report"], {
          cwd: repo,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 30000,
        });

  if (result.error) {
    throw result.error;
  }

  assert.strictEqual(
    result.status,
    0,
    `Governance report command failed.\n${formatProcessResult(result)}`,
  );

  return extractJsonObject(result.stdout);
}

function assertGovernanceReport(report) {
  assert.strictEqual(report.schema, "sdk-launch-governance-drift-report.v1");
  assert.strictEqual(report.launchGovernanceState, "local-gated");
  assert.strictEqual(report.driftDetected, false);
  assert.deepStrictEqual(report.allowedSdkWriteScopes, [
    "docs-audit",
    "orchestrator",
    "production-code",
  ]);
  assert.deepStrictEqual(report.reviewRequiredScopes, ["production-code", "cep-panel"]);
  assert.deepStrictEqual(report.productionCodePlannedPathAllowlist, EXPECTED_PRODUCTION_CODE_ALLOWLIST);
  assert.deepStrictEqual(report.sourceMilestones, ["M138", "M139", "M152"]);
  assert.strictEqual(
    report.launchGovernancePacketPath,
    ".codex-audit/sdk-launch-governance/152-sdk-production-code-provider-smokes-governance.json",
  );
  assert.strictEqual(
    report.productionLaneEnablementPacketPath,
    ".codex-audit/sdk-write-lane-enablement/152-production-code-provider-smokes-enable.json",
  );

  assert(Array.isArray(report.checks), "Governance report checks must be an array.");
  assert.deepStrictEqual(
    report.checks.map((check) => check.id),
    EXPECTED_CHECK_IDS,
  );

  for (const check of report.checks) {
    assert.strictEqual(check.ok, true, `Governance report check failed: ${check.id}`);
    assert.deepStrictEqual(
      check.actual,
      check.expected,
      `Governance report check drifted: ${check.id}`,
    );
  }
}

function main() {
  const report = runGovernanceReportCommand();
  assertGovernanceReport(report);
  console.log("SDK governance report parser smoke: pass");
}

if (require.main === module) {
  main();
}
