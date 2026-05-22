function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return Object.freeze(value);
}

const DOCS_AUDIT_SCOPE = "docs-audit";
const ORCHESTRATOR_SCOPE = "orchestrator";
const PRODUCTION_CODE_SCOPE = "production-code";
const CEP_PANEL_SCOPE = "cep-panel";

const COMMON_AUDIT_ALLOWLIST = [
  ".codex-audit/**",
  ".codex/handoff.md",
];

const PRODUCTION_CODE_PLANNED_PATH_ALLOWLIST = [
  "scripts/provider-api-smoke.js",
  "scripts/provider-contract-smoke.js",
];

export const AE_AGENT_SDK_ADAPTER_CONFIG = deepFreeze({
  schema: "codex-sdk-orchestrator-adapter-policy.v1",
  adapter: "ae-agent",
  status: "active-runtime-config",
  description:
    "AE Agent project policy consumed by the local Codex SDK orchestrator wrapper.",
  scopes: [
    DOCS_AUDIT_SCOPE,
    ORCHESTRATOR_SCOPE,
    PRODUCTION_CODE_SCOPE,
    CEP_PANEL_SCOPE,
  ],
  scopePathAllowlists: {
    [DOCS_AUDIT_SCOPE]: [
      ...COMMON_AUDIT_ALLOWLIST,
      "AGENTS.md",
      "README.md",
      "RELEASES.md",
      "docs/**",
      "plans/**",
      "specs/**",
      "orchestrator/README.md",
    ],
    [ORCHESTRATOR_SCOPE]: [
      ...COMMON_AUDIT_ALLOWLIST,
      "orchestrator/**",
      "package.json",
    ],
    [PRODUCTION_CODE_SCOPE]: [
      ...COMMON_AUDIT_ALLOWLIST,
      "chatgpt-connector/**",
      "mcp-server/**",
      "recipes/**",
      "registry/**",
      "scripts/**",
      "package.json",
    ],
    [CEP_PANEL_SCOPE]: [
      ...COMMON_AUDIT_ALLOWLIST,
      "cep-panel/**",
    ],
  },
  forbiddenPathPatterns: [
    ".git/**",
    "node_modules/**",
    "logs/**",
    "backups/**",
    "snapshots/**",
    "pro-review-bundles/**",
    "mcp-config.json",
    "package-lock.json",
    "**/package-lock.json",
    ".env*",
    "**/.env*",
    "*.key",
    "**/*.key",
    "*.pem",
    "**/*.pem",
    "*credential*",
    "**/*credential*",
    "*secret*",
    "**/*secret*",
    "*token*",
    "**/*token*",
  ],
  unsafeWriteRunnerFlags: [
    "approval",
    "auto-commit",
    "commit",
    "danger-full-access",
    "execute",
    "external-provider",
    "force",
    "live",
    "mutating-live",
    "network",
    "openai-cli-planner",
    "sandbox",
    "skip-git-repo-check",
    "tenant-policy-bypass",
    "unsafe",
    "web-search",
  ],
  threadOptionContracts: {
    writeCapable: {
      approvalPolicy: "never",
      networkAccessEnabled: false,
      sandboxMode: "workspace-write",
      webSearchMode: "disabled",
    },
  },
  operationEnvelope: {
    version: 1,
    dryRunMode: "dry-run",
    sdkWriteMode: "sdk-write",
    requiredFields: [
      "version",
      "operationId",
      "scope",
      "mode",
      "prompt",
      "plannedPaths",
    ],
  },
  sdkWrite: {
    docsAuditScope: DOCS_AUDIT_SCOPE,
    orchestratorScope: ORCHESTRATOR_SCOPE,
    productionCodeScope: PRODUCTION_CODE_SCOPE,
    enabledScopes: [
      DOCS_AUDIT_SCOPE,
      ORCHESTRATOR_SCOPE,
      PRODUCTION_CODE_SCOPE,
    ],
    reviewRequiredScopes: [
      PRODUCTION_CODE_SCOPE,
      CEP_PANEL_SCOPE,
    ],
    cepPanelSdkWritesEnabled: false,
    plannedPathAllowlists: {
      [DOCS_AUDIT_SCOPE]: [".codex-audit/**"],
      [ORCHESTRATOR_SCOPE]: ["orchestrator/**"],
      [PRODUCTION_CODE_SCOPE]: PRODUCTION_CODE_PLANNED_PATH_ALLOWLIST,
      [CEP_PANEL_SCOPE]: [],
    },
    enabledScopePlannedPathAllowlists: {
      [DOCS_AUDIT_SCOPE]: [".codex-audit/**"],
      [ORCHESTRATOR_SCOPE]: ["orchestrator/**"],
      [PRODUCTION_CODE_SCOPE]: PRODUCTION_CODE_PLANNED_PATH_ALLOWLIST,
    },
    orchestratorFixtureJsonPlannedPathAllowlist: [
      "orchestrator/fixtures/sdk-write/**",
    ],
    productionCodeLegacySingleFilePlannedPathAllowlist: [
      "scripts/provider-contract-smoke.js",
    ],
    orchestratorMarkdownAllowedExtension: ".md",
    orchestratorFixtureJsonAllowedExtension: ".json",
    contractSmokePlannedPaths: [
      ".codex-audit/115-sdk-docs-audit-sdk-thread-output.md",
      ".codex-audit/117-sdk-docs-audit-sdk-thread-output.md",
      ".codex-audit/arbitrary-safe-sdk-write-output.md",
    ],
    orchestratorContractSmokePlannedPaths: [
      "orchestrator/m123-sdk-thread-orchestrator-scope-output.md",
      "orchestrator/arbitrary-safe-sdk-write-output.md",
      "orchestrator/fixtures/sdk-write/m125-sdk-thread-fixture.json",
      "orchestrator/fixtures/sdk-write/arbitrary-safe-sdk-write-fixture.json",
    ],
    orchestratorMultiFileContractPlannedPaths: [
      "orchestrator/fixtures/sdk-write/m148-multi-file-alpha.json",
      "orchestrator/fixtures/sdk-write/m148-multi-file-beta.json",
    ],
    allowedHostReportPaths: [],
  },
  evidence: {
    scopeExpansionReviewSchema: "sdk-scope-expansion-review.v1",
    scopeExpansionReviewDirectory: ".codex-audit/sdk-scope-expansion-reviews",
    scopeExpansionReviewDecisions: [
      "proposed",
      "approved",
      "rejected",
    ],
    writeLaneReadinessSchema: "sdk-write-lane-readiness.v1",
    writeLaneReadinessDirectory: ".codex-audit/sdk-write-lane-readiness",
    writeLaneReadinessState: "ready-for-approval",
    writeLaneApprovalState: "pending-explicit-approval",
    writeLaneApprovalDecisionSchema: "sdk-write-lane-approval-decision.v1",
    writeLaneApprovalDecisionDirectory:
      ".codex-audit/sdk-write-lane-approval-decisions",
    writeLaneEnablementSchema: "sdk-write-lane-enablement.v1",
    writeLaneEnablementDirectory: ".codex-audit/sdk-write-lane-enablement",
    writeLaneEnablementApprovalState: "approved",
    launchGovernanceSchema: "sdk-launch-governance.v1",
    launchGovernanceDirectory: ".codex-audit/sdk-launch-governance",
    launchGovernanceState: "local-gated",
    launchGovernanceDriftReportSchema:
      "sdk-launch-governance-drift-report.v1",
    multiFilePlannedOperationContractSchema:
      "sdk-multi-file-planned-operation-contract.v1",
    multiFilePlannedOperationDirectory:
      ".codex-audit/sdk-multi-file-planned-operation",
    currentGovernancePacket:
      ".codex-audit/sdk-launch-governance/152-sdk-production-code-provider-smokes-governance.json",
    currentEnablementPacket:
      ".codex-audit/sdk-write-lane-enablement/152-production-code-provider-smokes-enable.json",
    currentConveyorPackets: [
      ".codex-audit/sdk-milestone-conveyor/154-sdk-milestone-conveyor-spec.json",
      ".codex-audit/sdk-milestone-conveyor/155-sdk-milestone-conveyor-local-dry-run.json",
      ".codex-audit/sdk-milestone-conveyor/156-sdk-conveyor-sdkthread-proof.json",
      ".codex-audit/sdk-milestone-conveyor/157-sdk-conveyor-commit-handoff-loop-gate.json",
    ],
  },
  runtime: {
    primaryRuntimeDirectory: ".codex/sdk",
    fallbackRuntimeDirectory: ".codex-runtime/sdk",
    runtimeSubdirectories: ["logs", "operations"],
    fallbackReportDirectory: ".codex-audit",
  },
  blockedWithoutFreshApproval: [
    "SDKThread/network proof",
    "CEP-panel SDK write",
    "edit cep-panel/panel.js through SDK",
    "live CEP/After Effects validation",
    "external-provider/OpenAI CLI planner validation",
    "mutating-live validation",
    "package install",
    "dependency change",
    "push",
  ],
});

export function createAeAgentSdkAdapterSnapshot() {
  return JSON.parse(JSON.stringify(AE_AGENT_SDK_ADAPTER_CONFIG));
}
