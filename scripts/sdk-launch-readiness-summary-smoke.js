"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const repo = path.resolve(__dirname, "..");
const SUMMARY_PATH = path.join(
  repo,
  ".codex-audit",
  "sdk-launch-readiness",
  "144-sdk-launch-readiness-summary.json",
);
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

function checkIds(report) {
  assert(Array.isArray(report.checks), "Governance report checks must be an array.");
  return report.checks.map((check) => check.id);
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

  for (const check of report.checks) {
    assert.strictEqual(check.ok, true, `Governance report check failed: ${check.id}`);
    assert.deepStrictEqual(
      check.actual,
      check.expected,
      `Governance report check drifted: ${check.id}`,
    );
  }
}

function buildExpectedSummary(report) {
  return {
    schema: "sdk-launch-readiness-summary.v1",
    sourceGovernanceReportSchema: report.schema,
    sourceCommand: "npm.cmd run codex:orchestrator:governance-report",
    sourcePacketPaths: {
      launchGovernance: report.launchGovernancePacketPath,
      productionLaneEnablement: report.productionLaneEnablementPacketPath,
    },
    sourceMilestones: report.sourceMilestones,
    verdict: {
      overall: "local-gated-production-candidate",
      productionReady: false,
      narrowProductionCodeLane: "ready-local-gated",
      generalSdkWorkflow: "not-production-ready",
      reason:
        "Governance, drift detection, report command and parser smoke are locally validated for the exact two-file provider smoke production-code lane, but new SDKThread/network work after the bounded M152 proof, production-code writes outside that lane, CEP-panel writes and live/external validation still require explicit approval.",
    },
    ready: [
      {
        id: "governance-report-json-surface",
        status: "ready",
        evidence: [
          `schema:${report.schema}`,
          `launchGovernanceState:${report.launchGovernanceState}`,
          `driftDetected:${String(report.driftDetected)}`,
        ],
      },
      {
        id: "local-governance-contract",
        status: "ready",
        evidence: [
          "all governance report checks are ok",
          "actual equals expected for every governance report check",
        ],
      },
    ],
    localGated: [
      {
        id: "production-code-sdk-write-lane",
        status: "local-gated",
        scope: report.productionCodePlannedPathAllowlist.join(", "),
        evidence: [
          "allowedSdkWriteScopes includes production-code",
          `productionCodePlannedPathAllowlist is exactly ${report.productionCodePlannedPathAllowlist.join(
            ", ",
          )}`,
        ],
      },
      {
        id: "docs-audit-and-orchestrator-sdk-write-lanes",
        status: "local-gated",
        scope: "docs-audit, orchestrator",
        evidence: [
          "allowedSdkWriteScopes includes docs-audit",
          "allowedSdkWriteScopes includes orchestrator",
        ],
      },
    ],
    requiresApproval: [
      {
        id: "new-sdkthread-or-network-work",
        status: "requires-approval",
        evidence: ["no-new-sdkthread-or-network-approval"],
      },
      {
        id: "broader-production-code-sdk-writes",
        status: "requires-approval",
        evidence: ["no-broad-production-code-approval", "production-code-governance-allowlist"],
      },
      {
        id: "cep-panel-sdk-writes",
        status: "requires-approval",
        evidence: ["cep-panel-disabled"],
      },
      {
        id: "external-provider-or-openai-cli-planner-validation",
        status: "requires-approval",
        evidence: ["outside local governance-report scope"],
      },
      {
        id: "live-cep-ae-or-mutating-live-validation",
        status: "requires-approval",
        evidence: ["outside local governance-report scope"],
      },
      {
        id: "package-install-or-dependency-changes",
        status: "requires-approval",
        evidence: ["outside local governance-report scope"],
      },
    ],
    notValidated: [
      {
        id: "general-sdk-autopilot-repo-edits",
        status: "not-validated",
        reason:
          "Only narrow local-gated lanes are covered; arbitrary repo edits are not part of the approved SDK write contract.",
      },
      {
        id: "cep-panel-sdk-write-lane",
        status: "not-validated",
        reason: "CEP-panel SDK writes remain disabled/review-required.",
      },
      {
        id: "sdk-network-stream-stability",
        status: "not-validated",
        reason:
          "The launch summary does not make general SDK stream stability claims beyond the bounded M152 proof.",
      },
    ],
  };
}

function assertSummaryUsesReport(summary, report) {
  const requiredApprovalEvidence = summary.requiresApproval.flatMap((item) => item.evidence || []);

  assert.strictEqual(summary.schema, "sdk-launch-readiness-summary.v1");
  assert.strictEqual(summary.sourceGovernanceReportSchema, report.schema);
  assert.strictEqual(summary.verdict.productionReady, false);
  assert.strictEqual(summary.verdict.overall, "local-gated-production-candidate");
  assert.strictEqual(summary.verdict.narrowProductionCodeLane, "ready-local-gated");
  assert.strictEqual(summary.verdict.generalSdkWorkflow, "not-production-ready");
  assert.deepStrictEqual(summary.sourceMilestones, report.sourceMilestones);
  assert.deepStrictEqual(summary.sourcePacketPaths, {
    launchGovernance: report.launchGovernancePacketPath,
    productionLaneEnablement: report.productionLaneEnablementPacketPath,
  });
  assert(requiredApprovalEvidence.includes("no-new-sdkthread-or-network-approval"));
  assert(requiredApprovalEvidence.includes("no-broad-production-code-approval"));
  assert(requiredApprovalEvidence.includes("cep-panel-disabled"));
}

function main() {
  const report = runGovernanceReportCommand();
  assertGovernanceReport(report);

  const actualSummary = JSON.parse(fs.readFileSync(SUMMARY_PATH, "utf8"));
  const expectedSummary = buildExpectedSummary(report);

  assertSummaryUsesReport(actualSummary, report);
  assert.deepStrictEqual(actualSummary, expectedSummary);
  console.log("SDK launch readiness summary smoke: pass");
}

if (require.main === module) {
  main();
}
