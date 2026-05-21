#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Codex } from "@openai/codex-sdk";

const HELP = `
Codex SDK write-capable runner scaffold

Usage:
  node orchestrator/run-write-capable-scaffold.mjs --scope orchestrator --prompt "Implement a narrow orchestrator change"
  node orchestrator/run-write-capable-scaffold.mjs --dry-run --operation-file .codex-audit/m114-operation.json
  node orchestrator/run-write-capable-scaffold.mjs --operation-file .codex-runtime/sdk/operations/m115-docs-audit-sdk-write.json
  node orchestrator/run-write-capable-scaffold.mjs --contract-smoke

Required:
  --scope <name>             docs-audit, orchestrator, production-code, or cep-panel.
                             Required for non-dry scaffold mode.
  --prompt <text>            Requested work. Policy-scanned before any SDK thread can exist.
                             Required for non-dry scaffold mode.

Options:
  --cwd <path>               Working directory. Defaults to the current directory.
  --acknowledge-existing-change <path>
                             Explicitly acknowledge one pre-existing dirty path.
  --dry-run                  Evaluate local safety/path policy only; do not run write work.
  --operation-file <path>    Local JSON planned-operation envelope. Required with --dry-run
                             and required for guarded sdk-write cutovers.
  --planned-path <path>      Planned repo path for programmatic allowlist checks. Repeatable.
  --json                     Print a JSON scaffold envelope.
  --contract-smoke           Run local scaffold contract checks only.
  --help                     Show this help.

The default scaffold and dry-run modes remain non-live. The guarded sdk-write
operation-envelope mode remains limited to docs-audit planned outputs under
.codex-audit/** and orchestrator controlled outputs under orchestrator/**.
`;

const COMMON_AUDIT_ALLOWLIST = Object.freeze([
  ".codex-audit/**",
  ".codex/handoff.md",
]);

export const WRITE_SCOPES = Object.freeze([
  "docs-audit",
  "orchestrator",
  "production-code",
  "cep-panel",
]);

export const SCOPE_PATH_ALLOWLISTS = Object.freeze({
  "docs-audit": Object.freeze([
    ...COMMON_AUDIT_ALLOWLIST,
    "AGENTS.md",
    "README.md",
    "RELEASES.md",
    "docs/**",
    "plans/**",
    "specs/**",
    "orchestrator/README.md",
  ]),
  orchestrator: Object.freeze([
    ...COMMON_AUDIT_ALLOWLIST,
    "orchestrator/**",
    "package.json",
  ]),
  "production-code": Object.freeze([
    ...COMMON_AUDIT_ALLOWLIST,
    "chatgpt-connector/**",
    "mcp-server/**",
    "recipes/**",
    "registry/**",
    "scripts/**",
    "package.json",
  ]),
  "cep-panel": Object.freeze([
    ...COMMON_AUDIT_ALLOWLIST,
    "cep-panel/**",
  ]),
});

export const FORBIDDEN_PATH_PATTERNS = Object.freeze([
  ".git/**",
  "node_modules/**",
  "logs/**",
  "backups/**",
  "snapshots/**",
  "pro-review-bundles/**",
  "mcp-config.json",
  ".env*",
  "**/.env*",
  "*.key",
  "**/*.key",
  "*.pem",
  "**/*.pem",
  "*secret*",
  "**/*secret*",
  "*token*",
  "**/*token*",
]);

export const UNSAFE_WRITE_RUNNER_FLAGS = Object.freeze([
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
]);

export const WRITE_CAPABLE_THREAD_OPTION_CONTRACT = Object.freeze({
  approvalPolicy: "never",
  networkAccessEnabled: false,
  sandboxMode: "workspace-write",
  webSearchMode: "disabled",
});

export const OPERATION_ENVELOPE_VERSION = 1;
export const OPERATION_ENVELOPE_MODE = "dry-run";
export const SDK_WRITE_OPERATION_MODE = "sdk-write";
export const OPERATION_ENVELOPE_MODES = Object.freeze([
  OPERATION_ENVELOPE_MODE,
  SDK_WRITE_OPERATION_MODE,
]);
export const SDK_WRITE_ALLOWED_SCOPE = "docs-audit";
export const SDK_WRITE_ORCHESTRATOR_SCOPE = "orchestrator";
export const SDK_WRITE_PRODUCTION_CODE_SCOPE = "production-code";
export const SDK_WRITE_ALLOWED_SCOPES = Object.freeze([
  SDK_WRITE_ALLOWED_SCOPE,
  SDK_WRITE_ORCHESTRATOR_SCOPE,
  SDK_WRITE_PRODUCTION_CODE_SCOPE,
]);
export const SDK_WRITE_REVIEW_REQUIRED_SCOPES = Object.freeze([
  SDK_WRITE_PRODUCTION_CODE_SCOPE,
  "cep-panel",
]);
export const SDK_SCOPE_EXPANSION_REVIEW_SCHEMA = "sdk-scope-expansion-review.v1";
export const SDK_SCOPE_EXPANSION_REVIEW_DIRECTORY =
  ".codex-audit/sdk-scope-expansion-reviews";
export const SDK_SCOPE_EXPANSION_REVIEW_DECISIONS = Object.freeze([
  "proposed",
  "approved",
  "rejected",
]);
export const SDK_WRITE_LANE_READINESS_SCHEMA = "sdk-write-lane-readiness.v1";
export const SDK_WRITE_LANE_READINESS_DIRECTORY =
  ".codex-audit/sdk-write-lane-readiness";
export const SDK_WRITE_LANE_READINESS_STATE = "ready-for-approval";
export const SDK_WRITE_LANE_APPROVAL_STATE = "pending-explicit-approval";
export const SDK_WRITE_LANE_APPROVAL_DECISION_SCHEMA =
  "sdk-write-lane-approval-decision.v1";
export const SDK_WRITE_LANE_APPROVAL_DECISION_DIRECTORY =
  ".codex-audit/sdk-write-lane-approval-decisions";
export const SDK_WRITE_LANE_ENABLEMENT_SCHEMA = "sdk-write-lane-enablement.v1";
export const SDK_WRITE_LANE_ENABLEMENT_DIRECTORY =
  ".codex-audit/sdk-write-lane-enablement";
export const SDK_WRITE_LANE_ENABLEMENT_APPROVAL_STATE = "approved";
export const SDK_WRITE_PLANNED_PATH_ALLOWLIST = Object.freeze([
  ".codex-audit/**",
]);
export const SDK_WRITE_ORCHESTRATOR_PLANNED_PATH_ALLOWLIST = Object.freeze([
  "orchestrator/**",
]);
export const SDK_WRITE_ORCHESTRATOR_FIXTURE_JSON_PLANNED_PATH_ALLOWLIST = Object.freeze([
  "orchestrator/fixtures/sdk-write/**",
]);
export const SDK_WRITE_PRODUCTION_CODE_PLANNED_PATH_ALLOWLIST = Object.freeze([
  "scripts/provider-contract-smoke.js",
]);
export const SDK_WRITE_SCOPE_PLANNED_PATH_ALLOWLISTS = Object.freeze({
  [SDK_WRITE_ALLOWED_SCOPE]: SDK_WRITE_PLANNED_PATH_ALLOWLIST,
  [SDK_WRITE_ORCHESTRATOR_SCOPE]: SDK_WRITE_ORCHESTRATOR_PLANNED_PATH_ALLOWLIST,
  [SDK_WRITE_PRODUCTION_CODE_SCOPE]: SDK_WRITE_PRODUCTION_CODE_PLANNED_PATH_ALLOWLIST,
});
export const SDK_WRITE_ORCHESTRATOR_MARKDOWN_ALLOWED_EXTENSION = ".md";
export const SDK_WRITE_ORCHESTRATOR_FIXTURE_JSON_ALLOWED_EXTENSION = ".json";
export const SDK_WRITE_CONTRACT_SMOKE_PLANNED_PATHS = Object.freeze([
  ".codex-audit/115-sdk-docs-audit-sdk-thread-output.md",
  ".codex-audit/117-sdk-docs-audit-sdk-thread-output.md",
  ".codex-audit/arbitrary-safe-sdk-write-output.md",
]);
export const SDK_WRITE_ORCHESTRATOR_CONTRACT_SMOKE_PLANNED_PATHS = Object.freeze([
  "orchestrator/m123-sdk-thread-orchestrator-scope-output.md",
  "orchestrator/arbitrary-safe-sdk-write-output.md",
  "orchestrator/fixtures/sdk-write/m125-sdk-thread-fixture.json",
  "orchestrator/fixtures/sdk-write/arbitrary-safe-sdk-write-fixture.json",
]);
export const SDK_WRITE_ALLOWED_HOST_REPORT_PATHS = Object.freeze([]);
export const SDK_WRITE_PRIMARY_RUNTIME_DIRECTORY = ".codex/sdk";
export const SDK_WRITE_FALLBACK_RUNTIME_DIRECTORY = ".codex-runtime/sdk";
export const SDK_WRITE_RUNTIME_SUBDIRECTORIES = Object.freeze(["logs", "operations"]);
export const SDK_WRITE_LOG_DIRECTORY = `${SDK_WRITE_PRIMARY_RUNTIME_DIRECTORY}/logs`;
export const SDK_WRITE_OPERATION_DIRECTORY = `${SDK_WRITE_PRIMARY_RUNTIME_DIRECTORY}/operations`;
export const SDK_WRITE_FALLBACK_REPORT_DIRECTORY = ".codex-audit";
export const OPERATION_ENVELOPE_REQUIRED_FIELDS = Object.freeze([
  "version",
  "operationId",
  "scope",
  "mode",
  "prompt",
  "plannedPaths",
]);

const UNSAFE_OPERATION_ENVELOPE_FIELDS = Object.freeze([
  "approval",
  "approvalPolicy",
  "auto-commit",
  "autoCommit",
  "commit",
  "danger-full-access",
  "dangerFullAccess",
  "execute",
  "external-provider",
  "externalProvider",
  "force",
  "live",
  "mutating-live",
  "mutatingLive",
  "network",
  "networkAccessEnabled",
  "openai-cli-planner",
  "openaiCliPlanner",
  "realWriteWork",
  "sandbox",
  "sandboxMode",
  "sdkThreadCreated",
  "skip-git-repo-check",
  "skipGitRepoCheck",
  "tenant-policy-bypass",
  "tenantPolicyBypass",
  "unsafe",
  "web-search",
  "webSearch",
  "webSearchMode",
]);

const UNSAFE_SCOPE_EXPANSION_REVIEW_FIELDS = Object.freeze([
  "approval",
  "approvalPolicy",
  "auto-commit",
  "autoCommit",
  "commit",
  "danger-full-access",
  "dangerFullAccess",
  "execute",
  "external-provider",
  "externalProvider",
  "force",
  "live",
  "mutating-live",
  "mutatingLive",
  "network",
  "networkAccessEnabled",
  "openai-cli-planner",
  "openaiCliPlanner",
  "realWriteWork",
  "sandbox",
  "sandboxMode",
  "sdkThreadCreated",
  "skip-git-repo-check",
  "skipGitRepoCheck",
  "tenant-policy-bypass",
  "tenantPolicyBypass",
  "unsafe",
  "web-search",
  "webSearch",
  "webSearchMode",
]);

const VALUE_OPTIONS = new Set([
  "acknowledge-existing-change",
  "cwd",
  "operation-file",
  "planned-path",
  "prompt",
  "scope",
]);
const BOOLEAN_OPTIONS = new Set(["contract-smoke", "dry-run", "help", "json"]);

const HARD_STOP_PROMPT_PATTERNS = Object.freeze([
  {
    id: "external-provider",
    pattern: /\bexternal[- ]provider\b/i,
  },
  {
    id: "openai-cli-planner",
    pattern: /\bopenai[- ]cli[- ]planner\b/i,
  },
  {
    id: "live-or-mutating",
    pattern: /\b(mutating[- ]live|live[- ]mutation|live ae|live cep|live smoke)\b/i,
  },
  {
    id: "tenant-policy-bypass",
    pattern: /\b(tenant[- ]policy[- ]bypass|bypass tenant policy)\b/i,
  },
  {
    id: "auto-commit",
    pattern: /\b(auto[- ]commit|commit automatically|commit the changes|commit these changes)\b/i,
  },
]);

function splitInlineOption(raw) {
  const equalsIndex = raw.indexOf("=");

  if (equalsIndex === -1) {
    return { inlineValue: undefined, name: raw };
  }

  return {
    inlineValue: raw.slice(equalsIndex + 1),
    name: raw.slice(0, equalsIndex),
  };
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function splitLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitRawLines(text) {
  return text.split(/\r?\n/).filter((line) => line.trim() !== "");
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean).map(normalizeRepoPath))].sort();
}

function hashText(text) {
  return createHash("sha256").update(text).digest("hex");
}

function pathSignatureHash(value) {
  return hashText(JSON.stringify(value));
}

function runGit(args, cwd) {
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

function parseStatusPaths(statusShort) {
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

function patternToRegExp(pattern) {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wildcarded = escaped.replace(/\\\*\\\*/g, ".*").replace(/\\\*/g, "[^/]*");
  return new RegExp(`^${wildcarded}$`);
}

function matchesPathPattern(repoPath, pattern) {
  const normalizedPath = normalizeRepoPath(repoPath);
  const normalizedPattern = normalizeRepoPath(pattern);

  if (normalizedPattern.endsWith("/**")) {
    const root = normalizedPattern.slice(0, -3);
    return normalizedPath === root || normalizedPath.startsWith(`${root}/`);
  }

  if (normalizedPattern.includes("*")) {
    return patternToRegExp(normalizedPattern).test(normalizedPath);
  }

  return normalizedPath === normalizedPattern;
}

export function normalizeRepoPath(value) {
  const raw = String(value ?? "").trim().replace(/\\/g, "/");
  const withoutDot = raw.replace(/^\.\//, "");
  const normalized = path.posix.normalize(withoutDot);
  return normalized === "." ? "" : normalized;
}

export function isUnsafePathShape(repoPath) {
  const raw = String(repoPath ?? "");
  const normalized = normalizeRepoPath(raw);

  return (
    raw.includes("\0") ||
    path.isAbsolute(raw) ||
    /^[A-Za-z]:[\\/]/.test(raw) ||
    normalized === ".." ||
    normalized.startsWith("../")
  );
}

export function validateScope(scope) {
  if (!WRITE_SCOPES.includes(scope)) {
    throw new Error(`Unknown write scope: ${scope}. Expected one of: ${WRITE_SCOPES.join(", ")}.`);
  }
}

export function isForbiddenPath(repoPath) {
  if (isUnsafePathShape(repoPath)) {
    return true;
  }

  return FORBIDDEN_PATH_PATTERNS.some((pattern) => matchesPathPattern(repoPath, pattern));
}

export function isPathAllowedForScope(scope, repoPath) {
  validateScope(scope);

  if (isForbiddenPath(repoPath)) {
    return false;
  }

  return SCOPE_PATH_ALLOWLISTS[scope].some((pattern) => matchesPathPattern(repoPath, pattern));
}

export function getPathContractViolations(scope, repoPaths) {
  validateScope(scope);

  return uniqueSorted(repoPaths).flatMap((repoPath) => {
    if (isUnsafePathShape(repoPath)) {
      return [{ path: repoPath, reason: "unsafe-path-shape" }];
    }

    if (isForbiddenPath(repoPath)) {
      return [{ path: repoPath, reason: "forbidden-path" }];
    }

    if (!isPathAllowedForScope(scope, repoPath)) {
      return [{ path: repoPath, reason: "outside-scope-allowlist" }];
    }

    return [];
  });
}

export function createPlannedPathCheck(scope, plannedPaths = []) {
  validateScope(scope);

  const normalizedPlannedPaths = uniqueSorted(plannedPaths);
  const violations = getPathContractViolations(scope, normalizedPlannedPaths);
  const violationPaths = new Set(violations.map((violation) => violation.path));

  return {
    allowed: violations.length === 0,
    allowedPaths: normalizedPlannedPaths.filter((repoPath) => !violationPaths.has(repoPath)),
    plannedPaths: normalizedPlannedPaths,
    violations,
  };
}

function isOrchestratorFixtureJsonSdkWritePath(repoPath) {
  return SDK_WRITE_ORCHESTRATOR_FIXTURE_JSON_PLANNED_PATH_ALLOWLIST.some((pattern) =>
    matchesPathPattern(repoPath, pattern),
  );
}

function getOrchestratorSdkWriteViolations(repoPath) {
  const extension = path.posix.extname(repoPath).toLowerCase();
  const isFixtureJsonPath = isOrchestratorFixtureJsonSdkWritePath(repoPath);

  if (isFixtureJsonPath) {
    return extension === SDK_WRITE_ORCHESTRATOR_FIXTURE_JSON_ALLOWED_EXTENSION
      ? []
      : [
          {
            path: repoPath,
            reason: "non-json-orchestrator-fixture-sdk-write-path",
          },
        ];
  }

  if (
    SDK_WRITE_ORCHESTRATOR_PLANNED_PATH_ALLOWLIST.some((pattern) =>
      matchesPathPattern(repoPath, pattern),
    ) &&
    extension === SDK_WRITE_ORCHESTRATOR_MARKDOWN_ALLOWED_EXTENSION
  ) {
    return [];
  }

  return [
    {
      path: repoPath,
      reason:
        extension === SDK_WRITE_ORCHESTRATOR_FIXTURE_JSON_ALLOWED_EXTENSION
          ? "outside-orchestrator-fixture-json-sdk-write-allowlist"
          : "non-markdown-orchestrator-sdk-write-path",
    },
  ];
}

export function createSdkWritePlannedPathCheck(scope, plannedPaths = []) {
  if (!SDK_WRITE_ALLOWED_SCOPES.includes(scope)) {
    throw new Error(
      `sdk-write operation envelope scope rejected: ${scope}. Supported scopes: ${SDK_WRITE_ALLOWED_SCOPES.join(", ")}.`,
    );
  }

  const plannedPathCheck = createPlannedPathCheck(scope, plannedPaths);
  if (!plannedPathCheck.allowed) {
    return plannedPathCheck;
  }

  const sdkWriteAllowlist = SDK_WRITE_SCOPE_PLANNED_PATH_ALLOWLISTS[scope] || [];
  const sdkWriteViolations = plannedPathCheck.plannedPaths.flatMap((repoPath) => {
    if (scope === SDK_WRITE_ORCHESTRATOR_SCOPE) {
      return getOrchestratorSdkWriteViolations(repoPath);
    }

    const violations = [];

    if (!sdkWriteAllowlist.some((pattern) => matchesPathPattern(repoPath, pattern))) {
      violations.push({
        path: repoPath,
        reason: `outside-${scope}-sdk-write-allowlist`,
      });
    }

    return violations;
  });
  const sdkWriteViolationPaths = new Set(
    sdkWriteViolations.map((violation) => violation.path),
  );

  return {
    ...plannedPathCheck,
    allowed: sdkWriteViolations.length === 0,
    allowedPaths: plannedPathCheck.allowedPaths.filter(
      (repoPath) => !sdkWriteViolationPaths.has(repoPath),
    ),
    violations: sdkWriteViolations,
  };
}

export function validateSdkScopeExpansionReviewPacket(packet) {
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
    throw new Error("Malformed SDK scope expansion review packet. Expected a JSON object.");
  }

  for (const field of UNSAFE_SCOPE_EXPANSION_REVIEW_FIELDS) {
    if (Object.hasOwn(packet, field)) {
      throw new Error(`Unsafe SDK scope expansion review field rejected: ${field}`);
    }
  }

  if (packet.schema !== SDK_SCOPE_EXPANSION_REVIEW_SCHEMA) {
    throw new Error(
      `Unsupported SDK scope expansion review schema: ${String(
        packet.schema,
      )}. Expected ${SDK_SCOPE_EXPANSION_REVIEW_SCHEMA}.`,
    );
  }

  if (!SDK_WRITE_REVIEW_REQUIRED_SCOPES.includes(packet.scope)) {
    throw new Error(
      `SDK scope expansion review scope rejected: ${String(
        packet.scope,
      )}. Expected one of: ${SDK_WRITE_REVIEW_REQUIRED_SCOPES.join(", ")}.`,
    );
  }

  if (!SDK_SCOPE_EXPANSION_REVIEW_DECISIONS.includes(packet.decision)) {
    throw new Error(
      `Unsupported SDK scope expansion review decision: ${String(
        packet.decision,
      )}. Expected one of: ${SDK_SCOPE_EXPANSION_REVIEW_DECISIONS.join(", ")}.`,
    );
  }

  if (packet.sdkWriteEnabled !== false) {
    throw new Error("SDK scope expansion review packet must keep sdkWriteEnabled:false.");
  }

  if (typeof packet.summary !== "string" || packet.summary.trim() === "") {
    throw new Error("Missing SDK scope expansion review summary.");
  }

  if (
    !Array.isArray(packet.plannedPathAllowlist) ||
    packet.plannedPathAllowlist.length === 0 ||
    packet.plannedPathAllowlist.some((repoPath) => typeof repoPath !== "string")
  ) {
    throw new Error("Missing or invalid SDK scope expansion review plannedPathAllowlist.");
  }

  const plannedPathAllowlist = packet.plannedPathAllowlist.map(normalizeRepoPath);
  if (plannedPathAllowlist.some((repoPath) => repoPath === "")) {
    throw new Error("SDK scope expansion review plannedPathAllowlist contains an empty path.");
  }

  const plannedPathCheck = createPlannedPathCheck(packet.scope, plannedPathAllowlist);
  if (!plannedPathCheck.allowed) {
    throwScopeExpansionReviewPathCheckError(plannedPathCheck);
  }

  if (!Array.isArray(packet.validationPlan) || packet.validationPlan.length === 0) {
    throw new Error("Missing SDK scope expansion review validationPlan.");
  }

  if (packet.validationPlan.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error("SDK scope expansion review validationPlan entries must be non-empty strings.");
  }

  if (typeof packet.rollbackPlan !== "string" || packet.rollbackPlan.trim() === "") {
    throw new Error("Missing SDK scope expansion review rollbackPlan.");
  }

  return {
    decision: packet.decision,
    plannedPathAllowlist,
    plannedPathCheck,
    rollbackPlan: packet.rollbackPlan.trim(),
    schema: packet.schema,
    scope: packet.scope,
    sdkWriteEnabled: false,
    summary: packet.summary.trim(),
    validationPlan: packet.validationPlan.map((item) => item.trim()),
  };
}

export function validateSdkWriteLaneReadinessPacket(packet) {
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
    throw new Error("Malformed SDK write lane readiness packet. Expected a JSON object.");
  }

  for (const field of UNSAFE_SCOPE_EXPANSION_REVIEW_FIELDS) {
    if (Object.hasOwn(packet, field)) {
      throw new Error(`Unsafe SDK write lane readiness field rejected: ${field}`);
    }
  }

  if (packet.schema !== SDK_WRITE_LANE_READINESS_SCHEMA) {
    throw new Error(
      `Unsupported SDK write lane readiness schema: ${String(
        packet.schema,
      )}. Expected ${SDK_WRITE_LANE_READINESS_SCHEMA}.`,
    );
  }

  if (packet.readiness !== SDK_WRITE_LANE_READINESS_STATE) {
    throw new Error(
      `Unsupported SDK write lane readiness state: ${String(
        packet.readiness,
      )}. Expected ${SDK_WRITE_LANE_READINESS_STATE}.`,
    );
  }

  if (packet.approvalState !== SDK_WRITE_LANE_APPROVAL_STATE) {
    throw new Error(
      `SDK write lane readiness approvalState must be ${SDK_WRITE_LANE_APPROVAL_STATE}.`,
    );
  }

  if (!SDK_WRITE_REVIEW_REQUIRED_SCOPES.includes(packet.scope)) {
    throw new Error(
      `SDK write lane readiness scope rejected: ${String(
        packet.scope,
      )}. Expected one of: ${SDK_WRITE_REVIEW_REQUIRED_SCOPES.join(", ")}.`,
    );
  }

  if (packet.sdkWriteEnabled !== false) {
    throw new Error("SDK write lane readiness packet must keep sdkWriteEnabled:false.");
  }

  if (typeof packet.summary !== "string" || packet.summary.trim() === "") {
    throw new Error("Missing SDK write lane readiness summary.");
  }

  const sourceReviewPacket = normalizeRepoPath(packet.sourceReviewPacket);
  if (
    sourceReviewPacket === "" ||
    isUnsafePathShape(sourceReviewPacket) ||
    isForbiddenPath(sourceReviewPacket) ||
    !sourceReviewPacket.startsWith(`${SDK_SCOPE_EXPANSION_REVIEW_DIRECTORY}/`) ||
    !sourceReviewPacket.endsWith(".json")
  ) {
    throw new Error(
      `SDK write lane readiness sourceReviewPacket must point to ${SDK_SCOPE_EXPANSION_REVIEW_DIRECTORY}/*.json.`,
    );
  }

  if (
    !Array.isArray(packet.plannedPathAllowlist) ||
    packet.plannedPathAllowlist.length === 0 ||
    packet.plannedPathAllowlist.some((repoPath) => typeof repoPath !== "string")
  ) {
    throw new Error("Missing or invalid SDK write lane readiness plannedPathAllowlist.");
  }

  const plannedPathAllowlist = packet.plannedPathAllowlist.map(normalizeRepoPath);
  if (plannedPathAllowlist.some((repoPath) => repoPath === "")) {
    throw new Error("SDK write lane readiness plannedPathAllowlist contains an empty path.");
  }

  const plannedPathCheck = createPlannedPathCheck(packet.scope, plannedPathAllowlist);
  if (!plannedPathCheck.allowed) {
    throwSdkWriteLaneReadinessPathCheckError(plannedPathCheck);
  }

  if (
    typeof packet.requiredApprovalRecord !== "string" ||
    packet.requiredApprovalRecord.trim() === ""
  ) {
    throw new Error("Missing SDK write lane readiness requiredApprovalRecord.");
  }

  if (!Array.isArray(packet.preEnablementChecks) || packet.preEnablementChecks.length === 0) {
    throw new Error("Missing SDK write lane readiness preEnablementChecks.");
  }

  if (
    packet.preEnablementChecks.some((item) => typeof item !== "string" || item.trim() === "")
  ) {
    throw new Error(
      "SDK write lane readiness preEnablementChecks entries must be non-empty strings.",
    );
  }

  if (
    !Array.isArray(packet.approvalEvidenceRequired) ||
    packet.approvalEvidenceRequired.length === 0
  ) {
    throw new Error("Missing SDK write lane readiness approvalEvidenceRequired.");
  }

  if (
    packet.approvalEvidenceRequired.some(
      (item) => typeof item !== "string" || item.trim() === "",
    )
  ) {
    throw new Error(
      "SDK write lane readiness approvalEvidenceRequired entries must be non-empty strings.",
    );
  }

  if (typeof packet.rollbackPlan !== "string" || packet.rollbackPlan.trim() === "") {
    throw new Error("Missing SDK write lane readiness rollbackPlan.");
  }

  return {
    approvalEvidenceRequired: packet.approvalEvidenceRequired.map((item) => item.trim()),
    approvalState: packet.approvalState,
    plannedPathAllowlist,
    plannedPathCheck,
    preEnablementChecks: packet.preEnablementChecks.map((item) => item.trim()),
    readiness: packet.readiness,
    requiredApprovalRecord: packet.requiredApprovalRecord.trim(),
    rollbackPlan: packet.rollbackPlan.trim(),
    schema: packet.schema,
    scope: packet.scope,
    sdkWriteEnabled: false,
    sourceReviewPacket,
    summary: packet.summary.trim(),
  };
}

export function validateSdkWriteLaneApprovalDecisionPacket(packet) {
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
    throw new Error(
      "Malformed SDK write lane approval decision packet. Expected a JSON object.",
    );
  }

  for (const field of UNSAFE_SCOPE_EXPANSION_REVIEW_FIELDS) {
    if (Object.hasOwn(packet, field)) {
      throw new Error(`Unsafe SDK write lane approval decision field rejected: ${field}`);
    }
  }

  if (packet.schema !== SDK_WRITE_LANE_APPROVAL_DECISION_SCHEMA) {
    throw new Error(
      `Unsupported SDK write lane approval decision schema: ${String(
        packet.schema,
      )}. Expected ${SDK_WRITE_LANE_APPROVAL_DECISION_SCHEMA}.`,
    );
  }

  if (packet.approvalState !== SDK_WRITE_LANE_APPROVAL_STATE) {
    throw new Error(
      `SDK write lane approval decision approvalState must be ${SDK_WRITE_LANE_APPROVAL_STATE}.`,
    );
  }

  if (packet.explicitApprovalRecorded !== false) {
    throw new Error(
      "SDK write lane approval decision must keep explicitApprovalRecorded:false.",
    );
  }

  if (!SDK_WRITE_REVIEW_REQUIRED_SCOPES.includes(packet.scope)) {
    throw new Error(
      `SDK write lane approval decision scope rejected: ${String(
        packet.scope,
      )}. Expected one of: ${SDK_WRITE_REVIEW_REQUIRED_SCOPES.join(", ")}.`,
    );
  }

  if (packet.sdkWriteEnabled !== false) {
    throw new Error("SDK write lane approval decision must keep sdkWriteEnabled:false.");
  }

  if (typeof packet.summary !== "string" || packet.summary.trim() === "") {
    throw new Error("Missing SDK write lane approval decision summary.");
  }

  const sourceReadinessPacket = normalizeRepoPath(packet.sourceReadinessPacket);
  if (
    sourceReadinessPacket === "" ||
    isUnsafePathShape(sourceReadinessPacket) ||
    isForbiddenPath(sourceReadinessPacket) ||
    !sourceReadinessPacket.startsWith(`${SDK_WRITE_LANE_READINESS_DIRECTORY}/`) ||
    !sourceReadinessPacket.endsWith(".json")
  ) {
    throw new Error(
      `SDK write lane approval decision sourceReadinessPacket must point to ${SDK_WRITE_LANE_READINESS_DIRECTORY}/*.json.`,
    );
  }

  const sourceReviewPacket = normalizeRepoPath(packet.sourceReviewPacket);
  if (
    sourceReviewPacket === "" ||
    isUnsafePathShape(sourceReviewPacket) ||
    isForbiddenPath(sourceReviewPacket) ||
    !sourceReviewPacket.startsWith(`${SDK_SCOPE_EXPANSION_REVIEW_DIRECTORY}/`) ||
    !sourceReviewPacket.endsWith(".json")
  ) {
    throw new Error(
      `SDK write lane approval decision sourceReviewPacket must point to ${SDK_SCOPE_EXPANSION_REVIEW_DIRECTORY}/*.json.`,
    );
  }

  if (
    !Array.isArray(packet.plannedPathAllowlist) ||
    packet.plannedPathAllowlist.length === 0 ||
    packet.plannedPathAllowlist.some((repoPath) => typeof repoPath !== "string")
  ) {
    throw new Error("Missing or invalid SDK write lane approval decision plannedPathAllowlist.");
  }

  const plannedPathAllowlist = packet.plannedPathAllowlist.map(normalizeRepoPath);
  if (plannedPathAllowlist.some((repoPath) => repoPath === "")) {
    throw new Error(
      "SDK write lane approval decision plannedPathAllowlist contains an empty path.",
    );
  }

  const plannedPathCheck = createPlannedPathCheck(packet.scope, plannedPathAllowlist);
  if (!plannedPathCheck.allowed) {
    throwSdkWriteLaneApprovalDecisionPathCheckError(plannedPathCheck);
  }

  if (
    typeof packet.requiredApprovalRecord !== "string" ||
    packet.requiredApprovalRecord.trim() === ""
  ) {
    throw new Error("Missing SDK write lane approval decision requiredApprovalRecord.");
  }

  if (!Array.isArray(packet.decisionEvidence) || packet.decisionEvidence.length === 0) {
    throw new Error("Missing SDK write lane approval decision evidence.");
  }

  if (
    packet.decisionEvidence.some((item) => typeof item !== "string" || item.trim() === "")
  ) {
    throw new Error(
      "SDK write lane approval decision evidence entries must be non-empty strings.",
    );
  }

  if (
    typeof packet.nextAllowedAction !== "string" ||
    packet.nextAllowedAction.trim() === ""
  ) {
    throw new Error("Missing SDK write lane approval decision nextAllowedAction.");
  }

  if (typeof packet.rollbackPlan !== "string" || packet.rollbackPlan.trim() === "") {
    throw new Error("Missing SDK write lane approval decision rollbackPlan.");
  }

  return {
    approvalState: packet.approvalState,
    decisionEvidence: packet.decisionEvidence.map((item) => item.trim()),
    explicitApprovalRecorded: false,
    nextAllowedAction: packet.nextAllowedAction.trim(),
    plannedPathAllowlist,
    plannedPathCheck,
    requiredApprovalRecord: packet.requiredApprovalRecord.trim(),
    rollbackPlan: packet.rollbackPlan.trim(),
    schema: packet.schema,
    scope: packet.scope,
    sdkWriteEnabled: false,
    sourceReadinessPacket,
    sourceReviewPacket,
    summary: packet.summary.trim(),
  };
}

export function validateSdkWriteLaneEnablementPacket(packet) {
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
    throw new Error("Malformed SDK write lane enablement packet. Expected a JSON object.");
  }

  for (const field of UNSAFE_SCOPE_EXPANSION_REVIEW_FIELDS) {
    if (Object.hasOwn(packet, field)) {
      throw new Error(`Unsafe SDK write lane enablement field rejected: ${field}`);
    }
  }

  if (packet.schema !== SDK_WRITE_LANE_ENABLEMENT_SCHEMA) {
    throw new Error(
      `Unsupported SDK write lane enablement schema: ${String(
        packet.schema,
      )}. Expected ${SDK_WRITE_LANE_ENABLEMENT_SCHEMA}.`,
    );
  }

  if (packet.approvalState !== SDK_WRITE_LANE_ENABLEMENT_APPROVAL_STATE) {
    throw new Error(
      `SDK write lane enablement approvalState must be ${SDK_WRITE_LANE_ENABLEMENT_APPROVAL_STATE}.`,
    );
  }

  if (packet.explicitApprovalRecorded !== true) {
    throw new Error(
      "SDK write lane enablement must record explicitApprovalRecorded:true.",
    );
  }

  if (packet.scope !== SDK_WRITE_PRODUCTION_CODE_SCOPE) {
    throw new Error(
      `SDK write lane enablement scope rejected: ${String(
        packet.scope,
      )}. Expected ${SDK_WRITE_PRODUCTION_CODE_SCOPE}.`,
    );
  }

  if (packet.sdkWriteEnabled !== true) {
    throw new Error("SDK write lane enablement must set sdkWriteEnabled:true.");
  }

  if (typeof packet.summary !== "string" || packet.summary.trim() === "") {
    throw new Error("Missing SDK write lane enablement summary.");
  }

  const sourceApprovalDecisionPacket = normalizeRepoPath(packet.sourceApprovalDecisionPacket);
  if (
    sourceApprovalDecisionPacket === "" ||
    isUnsafePathShape(sourceApprovalDecisionPacket) ||
    isForbiddenPath(sourceApprovalDecisionPacket) ||
    !sourceApprovalDecisionPacket.startsWith(
      `${SDK_WRITE_LANE_APPROVAL_DECISION_DIRECTORY}/`,
    ) ||
    !sourceApprovalDecisionPacket.endsWith(".json")
  ) {
    throw new Error(
      `SDK write lane enablement sourceApprovalDecisionPacket must point to ${SDK_WRITE_LANE_APPROVAL_DECISION_DIRECTORY}/*.json.`,
    );
  }

  const sourceReadinessPacket = normalizeRepoPath(packet.sourceReadinessPacket);
  if (
    sourceReadinessPacket === "" ||
    isUnsafePathShape(sourceReadinessPacket) ||
    isForbiddenPath(sourceReadinessPacket) ||
    !sourceReadinessPacket.startsWith(`${SDK_WRITE_LANE_READINESS_DIRECTORY}/`) ||
    !sourceReadinessPacket.endsWith(".json")
  ) {
    throw new Error(
      `SDK write lane enablement sourceReadinessPacket must point to ${SDK_WRITE_LANE_READINESS_DIRECTORY}/*.json.`,
    );
  }

  const sourceReviewPacket = normalizeRepoPath(packet.sourceReviewPacket);
  if (
    sourceReviewPacket === "" ||
    isUnsafePathShape(sourceReviewPacket) ||
    isForbiddenPath(sourceReviewPacket) ||
    !sourceReviewPacket.startsWith(`${SDK_SCOPE_EXPANSION_REVIEW_DIRECTORY}/`) ||
    !sourceReviewPacket.endsWith(".json")
  ) {
    throw new Error(
      `SDK write lane enablement sourceReviewPacket must point to ${SDK_SCOPE_EXPANSION_REVIEW_DIRECTORY}/*.json.`,
    );
  }

  if (
    !Array.isArray(packet.plannedPathAllowlist) ||
    packet.plannedPathAllowlist.length === 0 ||
    packet.plannedPathAllowlist.some((repoPath) => typeof repoPath !== "string")
  ) {
    throw new Error("Missing or invalid SDK write lane enablement plannedPathAllowlist.");
  }

  const plannedPathAllowlist = packet.plannedPathAllowlist.map(normalizeRepoPath);
  if (plannedPathAllowlist.some((repoPath) => repoPath === "")) {
    throw new Error("SDK write lane enablement plannedPathAllowlist contains an empty path.");
  }

  if (
    plannedPathAllowlist.join(",") !==
    SDK_WRITE_PRODUCTION_CODE_PLANNED_PATH_ALLOWLIST.join(",")
  ) {
    throw new Error(
      `SDK write lane enablement plannedPathAllowlist must be exactly ${SDK_WRITE_PRODUCTION_CODE_PLANNED_PATH_ALLOWLIST.join(",")}.`,
    );
  }

  const plannedPathCheck = createSdkWritePlannedPathCheck(packet.scope, plannedPathAllowlist);
  if (!plannedPathCheck.allowed) {
    throwSdkWriteLaneEnablementPathCheckError(plannedPathCheck);
  }

  if (
    typeof packet.approvalRecord !== "string" ||
    packet.approvalRecord.trim() === ""
  ) {
    throw new Error("Missing SDK write lane enablement approvalRecord.");
  }

  if (!Array.isArray(packet.enablementChecks) || packet.enablementChecks.length === 0) {
    throw new Error("Missing SDK write lane enablement checks.");
  }

  if (
    packet.enablementChecks.some((item) => typeof item !== "string" || item.trim() === "")
  ) {
    throw new Error("SDK write lane enablement checks entries must be non-empty strings.");
  }

  if (typeof packet.rollbackPlan !== "string" || packet.rollbackPlan.trim() === "") {
    throw new Error("Missing SDK write lane enablement rollbackPlan.");
  }

  return {
    approvalRecord: packet.approvalRecord.trim(),
    approvalState: packet.approvalState,
    enablementChecks: packet.enablementChecks.map((item) => item.trim()),
    explicitApprovalRecorded: true,
    plannedPathAllowlist,
    plannedPathCheck,
    rollbackPlan: packet.rollbackPlan.trim(),
    schema: packet.schema,
    scope: packet.scope,
    sdkWriteEnabled: true,
    sourceApprovalDecisionPacket,
    sourceReadinessPacket,
    sourceReviewPacket,
    summary: packet.summary.trim(),
  };
}

function summarizePathViolations(violations) {
  return violations.map((violation) => `${violation.path} (${violation.reason})`).join(", ");
}

function throwPlannedPathCheckError(plannedPathCheck) {
  const summary = summarizePathViolations(plannedPathCheck.violations);
  const hasUnsafeShape = plannedPathCheck.violations.some(
    (violation) => violation.reason === "unsafe-path-shape",
  );
  const hasForbiddenPath = plannedPathCheck.violations.some(
    (violation) => violation.reason === "forbidden-path",
  );
  const hasOutsideScope = plannedPathCheck.violations.some(
    (violation) => violation.reason === "outside-scope-allowlist",
  );

  if (hasUnsafeShape) {
    throw new Error(`Operation envelope plannedPaths include unsafe path shapes: ${summary}`);
  }

  if (hasForbiddenPath) {
    throw new Error(`Operation envelope plannedPaths include forbidden paths: ${summary}`);
  }

  if (hasOutsideScope) {
    throw new Error(`Operation envelope plannedPaths outside scope allowlist: ${summary}`);
  }

  const hasDocsAuditSdkWriteViolation = plannedPathCheck.violations.some(
    (violation) => violation.reason === "outside-docs-audit-sdk-write-allowlist",
  );
  if (hasDocsAuditSdkWriteViolation) {
    throw new Error(`sdk-write plannedPaths outside docs-audit output allowlist: ${summary}`);
  }

  const hasOrchestratorSdkWriteViolation = plannedPathCheck.violations.some(
    (violation) =>
      violation.reason === "outside-orchestrator-sdk-write-allowlist" ||
      violation.reason === "outside-orchestrator-fixture-json-sdk-write-allowlist" ||
      violation.reason === "non-json-orchestrator-fixture-sdk-write-path" ||
      violation.reason === "non-markdown-orchestrator-sdk-write-path",
  );
  if (hasOrchestratorSdkWriteViolation) {
    throw new Error(
      `sdk-write plannedPaths outside orchestrator controlled-output allowlist: ${summary}`,
    );
  }

  const hasProductionCodeSdkWriteViolation = plannedPathCheck.violations.some(
    (violation) => violation.reason === "outside-production-code-sdk-write-allowlist",
  );
  if (hasProductionCodeSdkWriteViolation) {
    throw new Error(
      `sdk-write plannedPaths outside production-code approved allowlist: ${summary}`,
    );
  }

  throw new Error(`sdk-write plannedPaths outside output allowlist: ${summary}`);
}

function throwScopeExpansionReviewPathCheckError(plannedPathCheck) {
  const summary = summarizePathViolations(plannedPathCheck.violations);
  const hasUnsafeShape = plannedPathCheck.violations.some(
    (violation) => violation.reason === "unsafe-path-shape",
  );
  const hasForbiddenPath = plannedPathCheck.violations.some(
    (violation) => violation.reason === "forbidden-path",
  );
  const hasOutsideScope = plannedPathCheck.violations.some(
    (violation) => violation.reason === "outside-scope-allowlist",
  );

  if (hasUnsafeShape) {
    throw new Error(
      `SDK scope expansion review plannedPathAllowlist includes unsafe path shapes: ${summary}`,
    );
  }

  if (hasForbiddenPath) {
    throw new Error(
      `SDK scope expansion review plannedPathAllowlist includes forbidden paths: ${summary}`,
    );
  }

  if (hasOutsideScope) {
    throw new Error(
      `SDK scope expansion review plannedPathAllowlist outside scope allowlist: ${summary}`,
    );
  }

  throw new Error(`SDK scope expansion review plannedPathAllowlist rejected: ${summary}`);
}

function throwSdkWriteLaneReadinessPathCheckError(plannedPathCheck) {
  const summary = summarizePathViolations(plannedPathCheck.violations);
  const hasUnsafeShape = plannedPathCheck.violations.some(
    (violation) => violation.reason === "unsafe-path-shape",
  );
  const hasForbiddenPath = plannedPathCheck.violations.some(
    (violation) => violation.reason === "forbidden-path",
  );
  const hasOutsideScope = plannedPathCheck.violations.some(
    (violation) => violation.reason === "outside-scope-allowlist",
  );

  if (hasUnsafeShape) {
    throw new Error(
      `SDK write lane readiness plannedPathAllowlist includes unsafe path shapes: ${summary}`,
    );
  }

  if (hasForbiddenPath) {
    throw new Error(
      `SDK write lane readiness plannedPathAllowlist includes forbidden paths: ${summary}`,
    );
  }

  if (hasOutsideScope) {
    throw new Error(
      `SDK write lane readiness plannedPathAllowlist outside scope allowlist: ${summary}`,
    );
  }

  throw new Error(`SDK write lane readiness plannedPathAllowlist rejected: ${summary}`);
}

function throwSdkWriteLaneApprovalDecisionPathCheckError(plannedPathCheck) {
  const summary = summarizePathViolations(plannedPathCheck.violations);
  const hasUnsafeShape = plannedPathCheck.violations.some(
    (violation) => violation.reason === "unsafe-path-shape",
  );
  const hasForbiddenPath = plannedPathCheck.violations.some(
    (violation) => violation.reason === "forbidden-path",
  );
  const hasOutsideScope = plannedPathCheck.violations.some(
    (violation) => violation.reason === "outside-scope-allowlist",
  );

  if (hasUnsafeShape) {
    throw new Error(
      `SDK write lane approval decision plannedPathAllowlist includes unsafe path shapes: ${summary}`,
    );
  }

  if (hasForbiddenPath) {
    throw new Error(
      `SDK write lane approval decision plannedPathAllowlist includes forbidden paths: ${summary}`,
    );
  }

  if (hasOutsideScope) {
    throw new Error(
      `SDK write lane approval decision plannedPathAllowlist outside scope allowlist: ${summary}`,
    );
  }

  throw new Error(
    `SDK write lane approval decision plannedPathAllowlist rejected: ${summary}`,
  );
}

function throwSdkWriteLaneEnablementPathCheckError(plannedPathCheck) {
  const summary = summarizePathViolations(plannedPathCheck.violations);
  const hasUnsafeShape = plannedPathCheck.violations.some(
    (violation) => violation.reason === "unsafe-path-shape",
  );
  const hasForbiddenPath = plannedPathCheck.violations.some(
    (violation) => violation.reason === "forbidden-path",
  );
  const hasOutsideScope = plannedPathCheck.violations.some(
    (violation) => violation.reason === "outside-scope-allowlist",
  );
  const hasOutsideSdkWrite = plannedPathCheck.violations.some(
    (violation) => violation.reason === "outside-production-code-sdk-write-allowlist",
  );

  if (hasUnsafeShape) {
    throw new Error(
      `SDK write lane enablement plannedPathAllowlist includes unsafe path shapes: ${summary}`,
    );
  }

  if (hasForbiddenPath) {
    throw new Error(
      `SDK write lane enablement plannedPathAllowlist includes forbidden paths: ${summary}`,
    );
  }

  if (hasOutsideScope || hasOutsideSdkWrite) {
    throw new Error(
      `SDK write lane enablement plannedPathAllowlist outside approved allowlist: ${summary}`,
    );
  }

  throw new Error(`SDK write lane enablement plannedPathAllowlist rejected: ${summary}`);
}

function isPathInsideDirectory(candidatePath, directoryPath) {
  const relative = path.relative(directoryPath, candidatePath);
  return relative === "" || (relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

export function resolveOperationFilePath(operationFile, cwd = process.cwd()) {
  if (!operationFile) {
    throw new Error("Missing required --operation-file for write-capable dry-run mode.");
  }

  const repoRoot = path.resolve(cwd);
  const absolutePath = path.resolve(repoRoot, operationFile);

  if (!isPathInsideDirectory(absolutePath, repoRoot)) {
    throw new Error(`Operation file outside repo: ${operationFile}`);
  }

  return {
    absolutePath,
    repoPath: normalizeRepoPath(path.relative(repoRoot, absolutePath)),
    repoRoot,
  };
}

export function parseOperationEnvelopeJson(text, source = "operation file") {
  let parsed = null;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Malformed operation file JSON: ${source}. ${detail}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Malformed operation file JSON: ${source}. Expected a JSON object.`);
  }

  return validateOperationEnvelope(parsed);
}

export function validateOperationEnvelope(envelope) {
  for (const field of UNSAFE_OPERATION_ENVELOPE_FIELDS) {
    if (Object.hasOwn(envelope, field)) {
      throw new Error(`Unsafe operation envelope field rejected: ${field}`);
    }
  }

  if (envelope.version !== OPERATION_ENVELOPE_VERSION) {
    throw new Error(
      `Unsupported operation envelope version: ${String(
        envelope.version,
      )}. Expected ${OPERATION_ENVELOPE_VERSION}.`,
    );
  }

  if (typeof envelope.operationId !== "string" || envelope.operationId.trim() === "") {
    throw new Error("Missing operation envelope operationId.");
  }

  if (typeof envelope.scope !== "string" || envelope.scope.trim() === "") {
    throw new Error(`Missing operation envelope scope. Expected one of: ${WRITE_SCOPES.join(", ")}.`);
  }

  validateScope(envelope.scope);

  if (!OPERATION_ENVELOPE_MODES.includes(envelope.mode)) {
    throw new Error(
      `Unsupported operation envelope mode: ${String(
        envelope.mode,
      )}. Expected one of: ${OPERATION_ENVELOPE_MODES.join(", ")}.`,
    );
  }

  if (
    envelope.mode === SDK_WRITE_OPERATION_MODE &&
    !SDK_WRITE_ALLOWED_SCOPES.includes(envelope.scope)
  ) {
    throw new Error(
      `sdk-write operation envelope scope rejected: ${envelope.scope}. Supported scopes: ${SDK_WRITE_ALLOWED_SCOPES.join(", ")}.`,
    );
  }

  if (typeof envelope.prompt !== "string" || envelope.prompt.trim() === "") {
    throw new Error("Missing operation envelope prompt.");
  }

  if (!Array.isArray(envelope.plannedPaths) || envelope.plannedPaths.length === 0) {
    throw new Error("Missing or empty operation envelope plannedPaths.");
  }

  if (envelope.plannedPaths.some((repoPath) => typeof repoPath !== "string")) {
    throw new Error("Operation envelope plannedPaths entries must be strings.");
  }

  const plannedPaths = envelope.plannedPaths.map(normalizeRepoPath);
  if (plannedPaths.some((repoPath) => repoPath === "")) {
    throw new Error("Operation envelope plannedPaths contains an empty path.");
  }

  validatePromptPolicy(envelope.prompt);

  const plannedPathCheck =
    envelope.mode === SDK_WRITE_OPERATION_MODE
      ? createSdkWritePlannedPathCheck(envelope.scope, plannedPaths)
      : createPlannedPathCheck(envelope.scope, plannedPaths);
  if (!plannedPathCheck.allowed) {
    throwPlannedPathCheckError(plannedPathCheck);
  }

  return {
    mode: envelope.mode,
    operationId: envelope.operationId.trim(),
    plannedPathCheck,
    plannedPaths,
    prompt: envelope.prompt,
    scope: envelope.scope,
    version: envelope.version,
  };
}

export function loadOperationEnvelopeOptions(options = {}, hooks = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const resolved = resolveOperationFilePath(options.operationFile, cwd);
  const fileExists = hooks.existsSync || existsSync;
  const fileStats = hooks.statSync || statSync;
  const readFile = hooks.readFileSync || readFileSync;
  const realpath = hooks.realpathSync || realpathSync;

  if (!fileExists(resolved.absolutePath)) {
    throw new Error(`Missing operation file: ${resolved.repoPath || options.operationFile}`);
  }

  if (!fileStats(resolved.absolutePath).isFile()) {
    throw new Error(`Operation file is not a file: ${resolved.repoPath}`);
  }

  const realRepoRoot = realpath(resolved.repoRoot);
  const realOperationFile = realpath(resolved.absolutePath);
  if (!isPathInsideDirectory(realOperationFile, realRepoRoot)) {
    throw new Error(`Operation file outside repo: ${options.operationFile}`);
  }

  const operationEnvelope = parseOperationEnvelopeJson(
    readFile(resolved.absolutePath, "utf8"),
    resolved.repoPath,
  );
  if (options.dryRun && operationEnvelope.mode !== OPERATION_ENVELOPE_MODE) {
    throw new Error(
      `Operation envelope mode ${operationEnvelope.mode} cannot be combined with --dry-run.`,
    );
  }

  if (!options.dryRun && operationEnvelope.mode === OPERATION_ENVELOPE_MODE) {
    throw new Error("Operation envelope mode dry-run requires --dry-run.");
  }

  return {
    ...options,
    dryRun: operationEnvelope.mode === OPERATION_ENVELOPE_MODE,
    mode: operationEnvelope.mode,
    operationEnvelope: {
      mode: operationEnvelope.mode,
      operationId: operationEnvelope.operationId,
      sourcePath: resolved.repoPath,
      version: operationEnvelope.version,
    },
    operationFilePath: resolved.absolutePath,
    operationFileRepoPath: resolved.repoPath,
    plannedPaths: operationEnvelope.plannedPaths,
    prompt: operationEnvelope.prompt,
    sdkWrite: operationEnvelope.mode === SDK_WRITE_OPERATION_MODE,
    scope: operationEnvelope.scope,
  };
}

export function parseWriteRunnerArgs(argv) {
  const options = { acknowledgedExistingChanges: [], plannedPaths: [] };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const raw = arg.slice(2);
    const { inlineValue, name } = splitInlineOption(raw);

    if (UNSAFE_WRITE_RUNNER_FLAGS.includes(name)) {
      throw new Error(`Unsafe write-capable runner flag rejected: --${name}`);
    }

    if (BOOLEAN_OPTIONS.has(name)) {
      if (inlineValue !== undefined) {
        throw new Error(`Flag does not accept a value in write-capable scaffold mode: --${name}`);
      }
      options[toCamelCase(name)] = true;
      continue;
    }

    if (!VALUE_OPTIONS.has(name)) {
      throw new Error(`Unsupported write-capable runner flag: --${name}`);
    }

    const value = inlineValue ?? argv[index + 1];
    if (value === undefined || value === "" || value.startsWith("--")) {
      throw new Error(`Missing value for --${name}`);
    }

    if (name === "acknowledge-existing-change") {
      options.acknowledgedExistingChanges.push(normalizeRepoPath(value));
    } else if (name === "operation-file") {
      options.operationFile = value;
    } else if (name === "planned-path") {
      options.plannedPaths.push(normalizeRepoPath(value));
    } else {
      options[toCamelCase(name)] = value;
    }

    if (inlineValue === undefined) {
      index += 1;
    }
  }

  if (positional.length > 0) {
    throw new Error("Positional arguments are not supported in write-capable scaffold mode.");
  }

  validateWriteRunnerCliOptions(options);
  return options;
}

export function validateWriteRunnerCliOptions(options) {
  if (options.help || options.contractSmoke) {
    return;
  }

  if (options.dryRun && !options.operationFile) {
    throw new Error("Missing required --operation-file for write-capable dry-run mode.");
  }

  if (options.operationFile) {
    if (options.scope || options.prompt || options.plannedPaths.length > 0) {
      throw new Error(
        "Do not combine --operation-file with --scope, --prompt, or --planned-path; put those fields in the operation envelope.",
      );
    }
    return;
  }

  validateWriteRunnerOptions(options);
}

export function validateWriteRunnerOptions(options) {
  if (options.help || options.contractSmoke) {
    return;
  }

  if (!options.scope) {
    throw new Error(`Missing required --scope. Expected one of: ${WRITE_SCOPES.join(", ")}.`);
  }

  validateScope(options.scope);

  if (!options.prompt) {
    throw new Error("Missing required --prompt for write-capable scaffold mode.");
  }
}

export function validatePromptPolicy(prompt) {
  const text = String(prompt ?? "");

  for (const rule of HARD_STOP_PROMPT_PATTERNS) {
    if (rule.pattern.test(text)) {
      throw new Error(`Hard-stop policy rejected prompt request: ${rule.id}`);
    }
  }
}

export function createWriteCapableThreadOptions(options = {}) {
  return {
    ...WRITE_CAPABLE_THREAD_OPTION_CONTRACT,
    workingDirectory: path.resolve(options.cwd || process.cwd()),
  };
}

export function captureGitSnapshot(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const statusShort = runGit(["status", "--short", "--branch"], cwd);
  const diffNameOnly = splitLines(runGit(["diff", "--name-only"], cwd));
  const stagedDiffNameOnly = splitLines(runGit(["diff", "--cached", "--name-only"], cwd));
  const untrackedNameOnly = splitLines(runGit(["ls-files", "--others", "--exclude-standard"], cwd));
  const changedPaths = uniqueSorted([
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
  const paths = uniqueSorted([
    ...Object.keys(preSnapshot.pathSignatures || {}),
    ...Object.keys(postSnapshot.pathSignatures || {}),
  ]);

  return paths.filter(
    (repoPath) => preSnapshot.pathSignatures?.[repoPath] !== postSnapshot.pathSignatures?.[repoPath],
  );
}

function isDirectoryChangedPath(cwd, repoPath) {
  const normalizedPath = normalizeRepoPath(repoPath);

  if (normalizedPath.endsWith("/")) {
    return true;
  }

  if (!cwd) {
    return false;
  }

  try {
    return statSync(path.resolve(cwd, normalizedPath)).isDirectory();
  } catch {
    return false;
  }
}

function assertPathInsideRepo(repoRoot, absolutePath, repoPath) {
  if (!isPathInsideDirectory(absolutePath, repoRoot)) {
    throw new Error(`Path resolved outside repo while enumerating directory: ${repoPath}`);
  }
}

function enumerateDirectoryFileChildren(cwd, directoryRepoPath) {
  const repoRoot = path.resolve(cwd || process.cwd());
  const normalizedDirectoryPath = normalizeRepoPath(directoryRepoPath);
  const absoluteDirectoryPath = path.resolve(repoRoot, normalizedDirectoryPath);

  assertPathInsideRepo(repoRoot, absoluteDirectoryPath, normalizedDirectoryPath);

  const directoryStats = statSync(absoluteDirectoryPath);
  if (!directoryStats.isDirectory()) {
    throw new Error(`Changed path is not a directory: ${normalizedDirectoryPath}`);
  }

  const children = [];

  function visit(absoluteParentPath) {
    const entries = readdirSync(absoluteParentPath, { withFileTypes: true });

    for (const entry of entries) {
      const absoluteChildPath = path.join(absoluteParentPath, entry.name);
      const repoPath = normalizeRepoPath(path.relative(repoRoot, absoluteChildPath));

      assertPathInsideRepo(repoRoot, absoluteChildPath, repoPath);

      const realChildPath = realpathSync(absoluteChildPath);
      assertPathInsideRepo(repoRoot, realChildPath, repoPath);

      if (entry.isDirectory()) {
        visit(absoluteChildPath);
        continue;
      }

      if (entry.isFile()) {
        children.push(repoPath);
        continue;
      }

      const childStats = statSync(absoluteChildPath);
      if (childStats.isDirectory()) {
        visit(absoluteChildPath);
        continue;
      }

      if (childStats.isFile()) {
        children.push(repoPath);
        continue;
      }

      throw new Error(`Unsupported directory child type: ${repoPath}`);
    }
  }

  visit(absoluteDirectoryPath);
  return uniqueSorted(children);
}

export function evaluatePreRunGitState(snapshot, options = {}) {
  const changedPaths = uniqueSorted(snapshot.changedPaths || []);
  const acknowledged = uniqueSorted(options.acknowledgedExistingChanges || []);

  if (changedPaths.length === 0) {
    return {
      acknowledgedExistingChanges: acknowledged,
      changedPaths,
      forbiddenExisting: [],
      ok: true,
      staleAcknowledgements: [],
      status: "clean",
      unexpected: [],
    };
  }

  const unexpected =
    acknowledged.length === 0
      ? changedPaths
      : changedPaths.filter((repoPath) => !acknowledged.includes(repoPath));
  const staleAcknowledgements =
    acknowledged.length === 0
      ? []
      : acknowledged.filter((repoPath) => !changedPaths.includes(repoPath));
  const forbiddenExisting = changedPaths.filter(isForbiddenPath);

  return {
    acknowledgedExistingChanges: acknowledged,
    changedPaths,
    forbiddenExisting,
    ok:
      unexpected.length === 0 &&
      staleAcknowledgements.length === 0 &&
      forbiddenExisting.length === 0,
    staleAcknowledgements,
    status: "dirty",
    unexpected,
  };
}

export function assertPreRunGitState(snapshot, options = {}) {
  const state = evaluatePreRunGitState(snapshot, options);

  if (state.ok) {
    return;
  }

  if (state.acknowledgedExistingChanges.length === 0) {
    throw new Error(
      `Dirty unexpected git state before write-capable run: ${state.changedPaths.join(", ")}`,
    );
  }

  if (state.unexpected.length > 0) {
    throw new Error(
      `Dirty unexpected git state before write-capable run: ${state.unexpected.join(", ")}`,
    );
  }

  if (state.staleAcknowledgements.length > 0) {
    throw new Error(
      `Acknowledged paths are not dirty and may be stale: ${state.staleAcknowledgements.join(", ")}`,
    );
  }

  if (state.forbiddenExisting.length > 0) {
    throw new Error(
      `Forbidden path dirty before write-capable run: ${state.forbiddenExisting.join(", ")}`,
    );
  }
}

export function assertValidationResult(validationResult) {
  if (!validationResult || validationResult.ok !== true) {
    throw new Error("Hard-stop policy rejected failed validation result.");
  }
}

export function validatePostRunContract({ postSnapshot, preSnapshot, scope, validationResult }) {
  validateScope(scope);
  assertValidationResult(validationResult);

  const changedSincePre = collectPathsChangedSincePre(preSnapshot, postSnapshot);
  const violations = getPathContractViolations(scope, changedSincePre);

  if (violations.length > 0) {
    const forbidden = violations.filter((violation) => violation.reason === "forbidden-path");
    const summary = violations
      .map((violation) => `${violation.path} (${violation.reason})`)
      .join(", ");

    if (forbidden.length > 0) {
      throw new Error(`Forbidden path diff detected after write-capable run: ${summary}`);
    }

    throw new Error(`Path allowlist violation after write-capable run: ${summary}`);
  }

  return { changedSincePre, violations };
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function sanitizeLogId(value) {
  return String(value ?? "operation")
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function errorDiagnostic(error) {
  if (!error) {
    return null;
  }

  if (typeof error === "string") {
    return { message: error, name: "Error" };
  }

  if (error && typeof error === "object" && typeof error.message === "string") {
    const diagnostic = {
      message: error.message,
      name: typeof error.name === "string" ? error.name : "Error",
    };

    if ("code" in error) {
      diagnostic.code = String(error.code);
    }

    return diagnostic;
  }

  const diagnostic = {
    message: error instanceof Error ? error.message : String(error),
    name: error instanceof Error ? error.name : "Error",
  };

  if (error && typeof error === "object" && "code" in error) {
    diagnostic.code = String(error.code);
  }

  return diagnostic;
}

function diagnosticMessage(error) {
  return errorDiagnostic(error)?.message || null;
}

function runtimeRepoPath(...parts) {
  return normalizeRepoPath(path.posix.join(...parts.filter(Boolean)));
}

function repoPathToAbsolute(cwd, repoPath) {
  return path.join(cwd, ...normalizeRepoPath(repoPath).split("/"));
}

function createRuntimeProbeFileName(label) {
  return `.codex-runtime-probe-${process.pid}-${Date.now()}-${sanitizeLogId(label)}.tmp`;
}

function createRuntimeDirectories(runtimePath) {
  return {
    logs: runtimeRepoPath(runtimePath, "logs"),
    operations: runtimeRepoPath(runtimePath, "operations"),
  };
}

function probeSdkRuntime(cwd, runtimePath, hooks = {}) {
  const mkdir = hooks.mkdirSync || mkdirSync;
  const writeFile = hooks.writeFileSync || writeFileSync;
  const unlink = hooks.unlinkSync || unlinkSync;
  const directories = createRuntimeDirectories(runtimePath);
  const checks = [];

  for (const name of SDK_WRITE_RUNTIME_SUBDIRECTORIES) {
    const directoryPath = directories[name];
    const absoluteDirectoryPath = repoPathToAbsolute(cwd, directoryPath);
    const absoluteProbePath = path.join(absoluteDirectoryPath, createRuntimeProbeFileName(name));
    const probePath = normalizeRepoPath(path.relative(cwd, absoluteProbePath));

    try {
      mkdir(absoluteDirectoryPath, { recursive: true });
      writeFile(absoluteProbePath, "sdk runtime write probe\n", "utf8");
      unlink(absoluteProbePath);
      checks.push({
        directoryPath,
        probePath,
        probeWritten: true,
        tempFileCleaned: true,
        writable: true,
      });
    } catch (error) {
      const message = diagnosticMessage(error) || "unknown runtime probe failure";
      checks.push({
        directoryPath,
        error: message,
        errorCode: errorDiagnostic(error)?.code || null,
        probePath,
        probeWritten: false,
        tempFileCleaned: false,
        writable: false,
      });

      return {
        checks,
        reason: `${name}-runtime-unavailable: ${message}`,
        runtimePath,
        writable: false,
      };
    }
  }

  return {
    checks,
    reason: "runtime-writable",
    runtimePath,
    writable: true,
  };
}

export function resolveSdkRuntimePaths(cwd = process.cwd(), hooks = {}) {
  const primaryProbe = probeSdkRuntime(cwd, SDK_WRITE_PRIMARY_RUNTIME_DIRECTORY, hooks);
  const fallbackProbe = probeSdkRuntime(cwd, SDK_WRITE_FALLBACK_RUNTIME_DIRECTORY, hooks);
  const selectedProbe = primaryProbe.writable ? primaryProbe : fallbackProbe;
  const selectedRuntimePath = selectedProbe.runtimePath;
  const selectedDirectories = createRuntimeDirectories(selectedRuntimePath);
  const reasonSelected = primaryProbe.writable
    ? "primary-runtime-writable"
    : fallbackProbe.writable
      ? `primary-runtime-unavailable; fallback-runtime-writable: ${primaryProbe.reason}`
      : `primary-and-fallback-runtime-unavailable; diagnostic-report-only: primary=${primaryProbe.reason}; fallback=${fallbackProbe.reason}`;

  return {
    fallbackProbe,
    fallbackRuntimePath: SDK_WRITE_FALLBACK_RUNTIME_DIRECTORY,
    fallbackWritable: fallbackProbe.writable,
    primaryProbe,
    primaryRuntimePath: SDK_WRITE_PRIMARY_RUNTIME_DIRECTORY,
    primaryWritable: primaryProbe.writable,
    reasonSelected,
    selectedLogDirectory: selectedDirectories.logs,
    selectedOperationDirectory: selectedDirectories.operations,
    selectedRuntimePath,
    selectedRuntimeWritable: selectedProbe.writable,
  };
}

export function createSdkWriteFallbackReportPath(operationId) {
  return normalizeRepoPath(
    path.posix.join(
      SDK_WRITE_FALLBACK_REPORT_DIRECTORY,
      `${sanitizeLogId(operationId)}-sdk-write-failure-diagnostics.md`,
    ),
  );
}

export function createSdkWriteOperationFallbackPath(operationId, runtimePreflight = null) {
  const operationDirectory =
    runtimePreflight?.selectedOperationDirectory ||
    runtimeRepoPath(SDK_WRITE_FALLBACK_RUNTIME_DIRECTORY, "operations");
  return runtimeRepoPath(operationDirectory, `${sanitizeLogId(operationId)}-operation.json`);
}

function serialize(value) {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(
      value,
      (_key, entry) => (typeof entry === "bigint" ? entry.toString() : entry),
      2,
    );
  } catch {
    return String(value);
  }
}

function runGitDiffCheck(cwd) {
  const result = spawnSync("git", ["diff", "--check"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    throw result.error;
  }

  const output = [result.stdout ?? "", result.stderr ?? ""].filter(Boolean).join("\n").trim();
  if (result.status !== 0) {
    throw new Error(
      [
        `git diff --check failed with status ${result.status}`,
        output,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return { ok: true, output };
}

function collectTurnFileChangePaths(turn) {
  return uniqueSorted(
    (turn?.items || []).flatMap((item) => {
      if (item?.type !== "file_change" || !Array.isArray(item.changes)) {
        return [];
      }

      return item.changes.map((change) => change.path);
    }),
  );
}

export function createSdkWriteFallbackReport({
  attemptedLogPath,
  fallbackOperationPath,
  logWriteError,
  operationId,
  payload,
}) {
  const failure = payload?.failure;
  const sdkRunFailure = payload?.sdkRunFailure;
  const postRunFailure = payload?.postRunFailure;
  const originalFailure = sdkRunFailure || failure;
  const outputPath = payload?.sdkThreadOutputPath || payload?.plannedPathCheck?.plannedPaths?.[0];
  const logError = errorDiagnostic(logWriteError);
  const runtimePreflight = payload?.runtimePreflight;

  return [
    "# SDK Write Failure Diagnostic Fallback",
    "",
    "## Result",
    "diagnostic-fallback",
    "",
    "## Operation",
    `- operationId: ${operationId || "(unknown)"}`,
    `- operationFile: ${payload?.operationEnvelope?.sourcePath || "(unknown)"}`,
    `- operation runtime path if primary runtime is unavailable: ${fallbackOperationPath}`,
    `- attempted log path: ${attemptedLogPath}`,
    "",
    "## Runtime Preflight",
    `- primary runtime path: ${runtimePreflight?.primaryRuntimePath || SDK_WRITE_PRIMARY_RUNTIME_DIRECTORY}`,
    `- primary runtime writable: ${runtimePreflight ? runtimePreflight.primaryWritable : "unknown"}`,
    `- fallback runtime path: ${runtimePreflight?.fallbackRuntimePath || SDK_WRITE_FALLBACK_RUNTIME_DIRECTORY}`,
    `- fallback runtime writable: ${runtimePreflight ? runtimePreflight.fallbackWritable : "unknown"}`,
    `- selected runtime path: ${runtimePreflight?.selectedRuntimePath || "(unknown)"}`,
    `- selected runtime writable: ${runtimePreflight ? runtimePreflight.selectedRuntimeWritable : "unknown"}`,
    `- reason selected: ${runtimePreflight?.reasonSelected || "(unknown)"}`,
    "",
    "## Original Failure",
    `- message: ${diagnosticMessage(originalFailure)}`,
    `- code: ${errorDiagnostic(originalFailure)?.code || "(none)"}`,
    `- post-run failure: ${diagnosticMessage(postRunFailure) || "(none)"}`,
    "",
    "## SDK State",
    `- sdkThreadCreated: ${Boolean(payload?.sdkThreadCreated)}`,
    `- sdkThreadCompleted: ${Boolean(payload?.sdkThreadCompleted)}`,
    `- sdkThreadId: ${payload?.sdkThreadId || "(not reported)"}`,
    `- realWriteWork: ${Boolean(payload?.realWriteWork)}`,
    `- outputPath: ${outputPath || "(unknown)"}`,
    `- outputFileCreatedBySdk: ${Boolean(payload?.outputFileCreatedBySdk)}`,
    "",
    "## Log Write Failure",
    `- message: ${logError?.message || "(unknown)"}`,
    `- code: ${logError?.code || "(none)"}`,
    "",
    "## Safety",
    "- This fallback report is written after a primary SDK log write failure.",
    "- It does not create SDK threads, retry SDK writes, run provider validation, or commit changes.",
    "- The original SDK/post-run failure above remains the primary failure; the log write failure is diagnostic metadata.",
    "",
  ].join("\n");
}

export function writeSdkWriteLog(cwd, operationId, payload, hooks = {}) {
  const mkdir = hooks.mkdirSync || mkdirSync;
  const writeFile = hooks.writeFileSync || writeFileSync;
  const runtimePreflight =
    hooks.runtimePreflight ||
    (hooks.resolveSdkRuntimePaths
      ? hooks.resolveSdkRuntimePaths(cwd, hooks)
      : resolveSdkRuntimePaths(cwd, hooks));
  const logDirectory = repoPathToAbsolute(cwd, runtimePreflight.selectedLogDirectory);
  const logPath = path.join(
    logDirectory,
    `${stamp()}-${sanitizeLogId(operationId)}-sdk-write.json`,
  );
  const attemptedPath = normalizeRepoPath(path.relative(cwd, logPath));
  const payloadWithRuntime = {
    ...payload,
    runtimePreflight,
  };

  try {
    mkdir(logDirectory, { recursive: true });
    writeFile(logPath, `${serialize(payloadWithRuntime)}\n`, "utf8");
  } catch (error) {
    const fallbackReportPath = createSdkWriteFallbackReportPath(operationId);
    const fallbackOperationPath = createSdkWriteOperationFallbackPath(operationId, runtimePreflight);
    const fallbackAbsolutePath = path.join(cwd, ...fallbackReportPath.split("/"));
    const fallbackReport = createSdkWriteFallbackReport({
      attemptedLogPath: attemptedPath,
      fallbackOperationPath,
      logWriteError: error,
      operationId,
      payload: payloadWithRuntime,
    });
    let fallbackReportWriteError = null;
    let fallbackReportWritten = false;

    try {
      mkdir(path.dirname(fallbackAbsolutePath), { recursive: true });
      writeFile(fallbackAbsolutePath, `${fallbackReport}\n`, "utf8");
      fallbackReportWritten = true;
    } catch (fallbackError) {
      fallbackReportWriteError = diagnosticMessage(fallbackError);
    }

    return {
      error: diagnosticMessage(error),
      errorCode: errorDiagnostic(error)?.code || null,
      fallbackOperationPath,
      fallbackReportPath: fallbackReportWritten ? fallbackReportPath : null,
      fallbackReportWriteError,
      fallbackReportWritten,
      path: null,
      runtimePreflight,
      attemptedFallbackReportPath: fallbackReportPath,
      attemptedPath,
    };
  }

  return {
    error: null,
    errorCode: null,
    fallbackOperationPath: createSdkWriteOperationFallbackPath(operationId, runtimePreflight),
    fallbackReportPath: null,
    fallbackReportWriteError: null,
    fallbackReportWritten: false,
    path: attemptedPath,
    runtimePreflight,
    attemptedFallbackReportPath: createSdkWriteFallbackReportPath(operationId),
    attemptedPath,
  };
}

export function createSdkWriteFailureMessage(failure, logResult = {}) {
  const parts = [`SDK thread write failed: ${diagnosticMessage(failure) || "unknown error"}`];

  if (logResult.error) {
    parts.push(`SDK log write failed: ${logResult.error}`);
  }

  if (logResult.fallbackReportPath) {
    parts.push(`Fallback diagnostic report: ${logResult.fallbackReportPath}`);
  } else if (logResult.fallbackReportWriteError) {
    parts.push(`Fallback diagnostic report write failed: ${logResult.fallbackReportWriteError}`);
  }

  return parts.join(" ");
}

function assertSdkWriteOptions(options) {
  validateWriteRunnerOptions(options);
  validatePromptPolicy(options.prompt);

  if (options.mode !== SDK_WRITE_OPERATION_MODE || options.sdkWrite !== true) {
    throw new Error("sdk-write mode requires a validated sdk-write operation envelope.");
  }

  if (!SDK_WRITE_ALLOWED_SCOPES.includes(options.scope)) {
    throw new Error(
      `sdk-write is allowed only for scopes ${SDK_WRITE_ALLOWED_SCOPES.join(", ")}; received ${options.scope}.`,
    );
  }

  const plannedPathCheck = createSdkWritePlannedPathCheck(options.scope, options.plannedPaths);
  if (!plannedPathCheck.allowed) {
    const summary = summarizePathViolations(plannedPathCheck.violations);
    throw new Error(`sdk-write planned path contract failed: ${summary}`);
  }

  return plannedPathCheck;
}

export function createSdkWritePrompt(options) {
  const plannedPaths = uniqueSorted(options.plannedPaths);
  const isOrchestratorWrite = options.scope === SDK_WRITE_ORCHESTRATOR_SCOPE;
  const isProductionCodeWrite = options.scope === SDK_WRITE_PRODUCTION_CODE_SCOPE;
  const isOrchestratorFixtureJsonWrite =
    isOrchestratorWrite && plannedPaths.every(isOrchestratorFixtureJsonSdkWritePath);
  const writerRole = isOrchestratorFixtureJsonWrite
    ? "orchestrator fixture JSON writer"
    : isOrchestratorWrite
      ? "orchestrator docs-only writer"
      : isProductionCodeWrite
        ? "production-code provider contract smoke maintainer"
        : "docs-audit writer";
  const outputKind = isOrchestratorFixtureJsonWrite
    ? "JSON fixture output file"
    : isOrchestratorWrite
      ? "Markdown output file"
      : isProductionCodeWrite
        ? "existing production-code source file"
        : "Markdown output file";
  const outputTitle = isOrchestratorWrite
    ? "# SDK Orchestrator Output"
    : "# SDK Docs Audit Output";
  const safetyNote = isOrchestratorFixtureJsonWrite
    ? "Include a safetyNotes array stating that only the planned orchestrator fixture JSON output file was edited by this SDKThread turn."
    : isOrchestratorWrite
      ? "State that only the planned orchestrator Markdown output file was edited by this SDKThread turn."
      : "State that only the planned docs-audit output file was edited by this SDKThread turn.";

  if (isOrchestratorFixtureJsonWrite) {
    return [
      `You are the SDKThread ${writerRole} for this repository.`,
      "",
      "Hard boundary:",
      `- Create or update exactly the planned ${outputKind} listed below.`,
      "- Do not edit any other file.",
      "- Do not stage, commit, install packages, run validation suites, run live checks, or change source code.",
      "- Keep the output self-contained and focused on the requested artifact.",
      "- Write valid JSON only. Do not wrap it in Markdown.",
      "",
      `Operation id: ${options.operationEnvelope?.operationId || "(unknown)"}`,
      `Scope: ${options.scope}`,
      `Mode: ${options.mode}`,
      "",
      "Allowed planned output path:",
      ...plannedPaths.map((repoPath) => `- ${repoPath}`),
      "",
      "Write the JSON file with this object shape:",
      "{",
      '  "result": "created-by-sdk-thread",',
      '  "operation": {',
      '    "operationId": "<operation id>",',
      '    "scope": "<scope>",',
      '    "mode": "<mode>",',
      '    "plannedPath": "<planned path>"',
      "  },",
      '  "safetyNotes": [',
      '    "Only the planned orchestrator fixture JSON output file was edited by this SDKThread turn."',
      "  ]",
      "}",
      "",
      "Safety note requirement:",
      safetyNote,
      "",
      "User operation prompt:",
      options.prompt,
    ].join("\n");
  }

  if (isProductionCodeWrite) {
    return [
      `You are the SDKThread ${writerRole} for this repository.`,
      "",
      "Hard boundary:",
      `- Update exactly the planned ${outputKind} listed below.`,
      "- Do not edit any other file.",
      "- Do not stage, commit, install packages, run validation suites, run live checks, or change unrelated source code.",
      "- Keep the change minimal, CommonJS-compatible, and focused on the requested provider contract smoke maintenance.",
      "",
      `Operation id: ${options.operationEnvelope?.operationId || "(unknown)"}`,
      `Scope: ${options.scope}`,
      `Mode: ${options.mode}`,
      "",
      "Allowed planned source path:",
      ...plannedPaths.map((repoPath) => `- ${repoPath}`),
      "",
      "Safety note requirement:",
      "State that only the planned provider contract smoke source file was edited by this SDKThread turn.",
      "",
      "User operation prompt:",
      options.prompt,
    ].join("\n");
  }

  return [
    `You are the SDKThread ${writerRole} for this repository.`,
    "",
    "Hard boundary:",
    `- Create or update exactly the planned ${outputKind} listed below.`,
    "- Do not edit any other file.",
    "- Do not stage, commit, install packages, run validation suites, run live checks, or change source code.",
    "- Keep the output self-contained and focused on the requested artifact.",
    "",
    `Operation id: ${options.operationEnvelope?.operationId || "(unknown)"}`,
    `Scope: ${options.scope}`,
    `Mode: ${options.mode}`,
    "",
    "Allowed planned output path:",
    ...plannedPaths.map((repoPath) => `- ${repoPath}`),
    "",
    "Write the file with this structure:",
    outputTitle,
    "",
    "## Result",
    "created-by-sdk-thread",
    "",
    "## Operation",
    "State the operation id, scope, mode, and planned path.",
    "",
    "## Safety Notes",
    safetyNote,
    "",
    "User operation prompt:",
    options.prompt,
  ].join("\n");
}

export function validateSdkWriteDiffAllowlist({
  allowedImplementationReportPaths = SDK_WRITE_ALLOWED_HOST_REPORT_PATHS,
  directoryChildEnumerator,
  plannedPaths,
  postSnapshot,
  preSnapshot,
  scope = SDK_WRITE_ALLOWED_SCOPE,
  validationResult,
}) {
  assertValidationResult(validationResult);

  const normalizedPlannedPaths = uniqueSorted(plannedPaths);
  const plannedPathCheck = createSdkWritePlannedPathCheck(scope, normalizedPlannedPaths);
  if (!plannedPathCheck.allowed) {
    throw new Error(
      `sdk-write planned path contract failed: ${summarizePathViolations(
        plannedPathCheck.violations,
      )}`,
    );
  }

  const changedSincePre = collectPathsChangedSincePre(preSnapshot, postSnapshot);
  const enumerator =
    directoryChildEnumerator ||
    ((repoPath) => enumerateDirectoryFileChildren(postSnapshot?.cwd || process.cwd(), repoPath));
  const normalizedChangedFiles = [];
  const normalizedDirectoryEntries = [];

  for (const repoPath of changedSincePre) {
    if (isForbiddenPath(repoPath) || !isDirectoryChangedPath(postSnapshot?.cwd, repoPath)) {
      normalizedChangedFiles.push(repoPath);
      continue;
    }

    normalizedDirectoryEntries.push(repoPath);

    let childPaths = [];
    try {
      childPaths = uniqueSorted(enumerator(repoPath));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Unable to enumerate changed directory after sdk-write run: ${repoPath}. ${detail}`,
      );
    }

    if (childPaths.length === 0) {
      throw new Error(
        `Changed directory contains no planned sdk-write child files: ${repoPath}`,
      );
    }

    normalizedChangedFiles.push(...childPaths);
  }

  const actualChangedFiles = uniqueSorted(normalizedChangedFiles);
  const allowedPaths = uniqueSorted([
    ...normalizedPlannedPaths,
    ...allowedImplementationReportPaths,
  ]);
  const forbidden = actualChangedFiles.filter(isForbiddenPath);

  if (forbidden.length > 0) {
    throw new Error(`Forbidden path diff detected after sdk-write run: ${forbidden.join(", ")}`);
  }

  const outOfScopeFiles = actualChangedFiles.filter((repoPath) => !allowedPaths.includes(repoPath));
  if (outOfScopeFiles.length > 0) {
    const allowlistLabel =
      scope === SDK_WRITE_ALLOWED_SCOPE ? "docs-audit sdk-write" : `${scope} sdk-write`;
    throw new Error(
      `Post-run diff outside ${allowlistLabel} allowlist: ${outOfScopeFiles.join(", ")}`,
    );
  }

  const missingPlannedChanges = normalizedPlannedPaths.filter(
    (repoPath) => !actualChangedFiles.includes(repoPath),
  );
  if (missingPlannedChanges.length > 0) {
    throw new Error(
      `SDK write did not change planned output path: ${missingPlannedChanges.join(", ")}`,
    );
  }

  return {
    actualChangedFiles,
    allowedImplementationReportPaths: uniqueSorted(allowedImplementationReportPaths),
    allowedPaths,
    missingPlannedChanges,
    normalizedDirectoryEntries,
    outOfScopeFiles,
    plannedPaths: normalizedPlannedPaths,
    rawChangedSincePre: changedSincePre,
    verdict: "pass",
  };
}

export function validateSdkWritePlannedPathPrecondition({
  pathExists = () => false,
  plannedPaths = [],
  scope,
} = {}) {
  const existingPlannedPaths = plannedPaths.filter((repoPath) => pathExists(repoPath));
  const missingPlannedPaths = plannedPaths.filter((repoPath) => !pathExists(repoPath));

  if (scope === SDK_WRITE_PRODUCTION_CODE_SCOPE) {
    if (missingPlannedPaths.length > 0) {
      throw new Error(
        `Planned production-code sdk-write source path missing before SDK thread creation: ${missingPlannedPaths.join(
          ", ",
        )}`,
      );
    }

    return {
      existingPlannedPaths,
      missingPlannedPaths,
      mode: "existing-source-update",
    };
  }

  if (existingPlannedPaths.length > 0) {
    throw new Error(
      `Planned sdk-write output already exists before SDK thread creation: ${existingPlannedPaths.join(
        ", ",
      )}`,
    );
  }

  return {
    existingPlannedPaths,
    missingPlannedPaths,
    mode: "new-output-only",
  };
}

export async function runWriteCapableSdkWrite(options) {
  const preparedOptions = options.operationEnvelope
    ? options
    : loadOperationEnvelopeOptions(options);
  const plannedPathCheck = assertSdkWriteOptions(preparedOptions);
  const cwd = path.resolve(preparedOptions.cwd || process.cwd());
  const plannedPaths = plannedPathCheck.plannedPaths;
  const plannedPathPrecondition = validateSdkWritePlannedPathPrecondition({
    pathExists: (repoPath) => existsSync(path.resolve(cwd, repoPath)),
    plannedPaths,
    scope: preparedOptions.scope,
  });

  const preSnapshot = captureGitSnapshot({ cwd, label: "sdk-write-pre" });
  assertPreRunGitState(preSnapshot, {
    acknowledgedExistingChanges: preparedOptions.acknowledgedExistingChanges,
  });
  const preDiffCheck = runGitDiffCheck(cwd);
  const threadOptions = createWriteCapableThreadOptions({ cwd });
  const sdkPrompt = createSdkWritePrompt(preparedOptions);
  const codex = new Codex();
  let sdkThreadCreated = false;
  let sdkThreadCompleted = false;
  let thread = null;
  let turn = null;
  let failure = null;

  try {
    thread = codex.startThread(threadOptions);
    sdkThreadCreated = true;
    turn = await thread.run(sdkPrompt);
    sdkThreadCompleted = true;
  } catch (error) {
    failure = error instanceof Error ? error : new Error(String(error));
  }

  let postSnapshot = null;
  let postDiffCheck = null;
  let postRunFailure = null;
  let sdkReportedFileChanges = [];
  let sdkWritePostContract = null;
  const validationResult = {
    ok: sdkThreadCompleted && !failure,
    source: `${preparedOptions.scope}-sdk-write`,
  };

  try {
    postSnapshot = captureGitSnapshot({ cwd, label: "sdk-write-post" });
    postDiffCheck = runGitDiffCheck(cwd);
    sdkReportedFileChanges = collectTurnFileChangePaths(turn);

    if (!failure) {
      sdkWritePostContract = validateSdkWriteDiffAllowlist({
        plannedPaths,
        postSnapshot,
        preSnapshot,
        scope: preparedOptions.scope,
        validationResult,
      });
    }
  } catch (error) {
    postRunFailure = error instanceof Error ? error : new Error(String(error));
  }

  const outputPath = plannedPaths[0];
  const outputExistsAfter = existsSync(path.resolve(cwd, outputPath));
  const plannedFileChangedBySdk =
    Boolean(sdkWritePostContract) &&
    outputExistsAfter &&
    sdkWritePostContract.actualChangedFiles.includes(outputPath);
  const outputMissingFailure =
    !failure && !postRunFailure && !plannedFileChangedBySdk
      ? new Error(
          preparedOptions.scope === SDK_WRITE_PRODUCTION_CODE_SCOPE
            ? `SDK thread did not change planned source file: ${outputPath}`
            : `SDK thread did not create planned output file: ${outputPath}`,
        )
      : null;
  const terminalFailure = failure || postRunFailure || outputMissingFailure;
  const logResult = writeSdkWriteLog(cwd, preparedOptions.operationEnvelope?.operationId, {
    failure: terminalFailure ? errorDiagnostic(terminalFailure) : null,
    operationEnvelope: preparedOptions.operationEnvelope,
    outputFileCreatedBySdk: plannedFileChangedBySdk,
    plannedFileChangedBySdk,
    plannedPathCheck,
    plannedPathPrecondition,
    postRunFailure: postRunFailure ? errorDiagnostic(postRunFailure) : null,
    postDiffCheck,
    postSnapshot,
    preDiffCheck,
    preSnapshot,
    sdkReportedFileChanges,
    sdkRunFailure: failure ? errorDiagnostic(failure) : null,
    sdkThreadCompleted,
    sdkThreadCreated,
    sdkThreadId: thread?.id || null,
    sdkThreadOutputPath: outputPath,
    sdkWritePostContract,
    threadOptions,
    turn,
  });

  if (terminalFailure) {
    throw new Error(createSdkWriteFailureMessage(terminalFailure, logResult), {
      cause: terminalFailure,
    });
  }

  return {
    autoCommit: false,
    dryRun: false,
    fallbackOperationPath: logResult.fallbackOperationPath,
    fallbackReportPath: logResult.fallbackReportPath,
    fallbackReportWriteError: logResult.fallbackReportWriteError,
    fallbackReportWritten: logResult.fallbackReportWritten,
    logPath: logResult.path,
    logWriteError: logResult.error,
    operationEnvelope: preparedOptions.operationEnvelope,
    outputFileCreatedBySdk: plannedFileChangedBySdk,
    plannedFileChangedBySdk,
    plannedPathCheck,
    plannedPathPrecondition,
    postDiffCheck,
    postSnapshot,
    preDiffCheck,
    preSnapshot,
    realWriteWork: true,
    result: "sdk-write-completed",
    runtimePreflight: logResult.runtimePreflight,
    scope: preparedOptions.scope,
    sdkReportedFileChanges,
    sdkThreadCompleted,
    sdkThreadCreated,
    sdkThreadId: thread?.id || null,
    sdkThreadOutputPath: outputPath,
    sdkWrite: true,
    sdkWritePostContract,
    threadOptions,
    usage: turn?.usage || null,
  };
}

export function runWriteCapableDryRun(options, hooks = {}) {
  const preparedOptions = options.operationEnvelope
    ? options
    : options.operationFile
      ? loadOperationEnvelopeOptions(options, hooks)
      : options;

  validateWriteRunnerOptions(preparedOptions);
  validatePromptPolicy(preparedOptions.prompt);

  const cwd = path.resolve(preparedOptions.cwd || process.cwd());
  const captureSnapshot = hooks.captureGitSnapshot || captureGitSnapshot;
  const preSnapshot = captureSnapshot({ cwd, label: "dry-run-pre" });
  const preRunGitState = evaluatePreRunGitState(preSnapshot, {
    acknowledgedExistingChanges: preparedOptions.acknowledgedExistingChanges,
  });
  const plannedPathCheck = createPlannedPathCheck(
    preparedOptions.scope,
    preparedOptions.plannedPaths,
  );
  const threadOptions = createWriteCapableThreadOptions({ cwd });
  const wouldAllow = preRunGitState.ok && plannedPathCheck.allowed;

  return {
    autoCommit: false,
    dryRun: true,
    plannedPathCheck,
    preRunGitState,
    preSnapshot,
    realWriteWork: false,
    result: wouldAllow ? "dry-run-allowed" : "dry-run-denied",
    operationEnvelope: preparedOptions.operationEnvelope,
    scope: preparedOptions.scope,
    sdkThreadCreated: false,
    threadOptions,
    wouldAllow,
  };
}

export async function runWriteCapableScaffold(options) {
  validateWriteRunnerOptions(options);
  validatePromptPolicy(options.prompt);

  const cwd = path.resolve(options.cwd || process.cwd());
  const preSnapshot = captureGitSnapshot({ cwd, label: "pre-run" });
  assertPreRunGitState(preSnapshot, {
    acknowledgedExistingChanges: options.acknowledgedExistingChanges,
  });

  const threadOptions = createWriteCapableThreadOptions({ cwd });
  const validationResult = { ok: true, source: "m112-non-live-scaffold" };

  const postSnapshot = captureGitSnapshot({ cwd, label: "post-run" });
  const postContract = validatePostRunContract({
    postSnapshot,
    preSnapshot,
    scope: options.scope,
    validationResult,
  });

  return {
    autoCommit: false,
    postContract,
    postSnapshot,
    preSnapshot,
    result: "scaffold-only",
    scope: options.scope,
    sdkThreadCreated: false,
    threadOptions,
  };
}

function assertContract(condition, message, failures) {
  if (!condition) {
    failures.push(message);
  }
}

function assertRejects(fn, expectedMessageStart, failures, label) {
  let rejected = false;

  try {
    fn();
  } catch (error) {
    rejected =
      error instanceof Error &&
      (expectedMessageStart ? error.message.startsWith(expectedMessageStart) : true);
  }

  assertContract(rejected, label, failures);
}

export function runWriteCapableContractSmoke() {
  const failures = [];

  assertContract(
    WRITE_SCOPES.join(",") === "docs-audit,orchestrator,production-code,cep-panel",
    "write scope list changed unexpectedly",
    failures,
  );

  for (const scope of WRITE_SCOPES) {
    assertContract(
      Array.isArray(SCOPE_PATH_ALLOWLISTS[scope]) && SCOPE_PATH_ALLOWLISTS[scope].length > 0,
      `missing path allowlist for scope ${scope}`,
      failures,
    );
  }

  const parsed = parseWriteRunnerArgs([
    "--scope",
    "orchestrator",
    "--prompt",
    "Implement a narrow orchestrator scaffold contract.",
    "--acknowledge-existing-change",
    ".codex-audit/112-sdk-write-capable-runner-scaffold-spec.md",
  ]);

  assertContract(parsed.scope === "orchestrator", "write runner did not parse scope", failures);
  assertContract(parsed.prompt.includes("orchestrator"), "write runner did not parse prompt", failures);
  assertContract(
    parsed.acknowledgedExistingChanges.includes(
      ".codex-audit/112-sdk-write-capable-runner-scaffold-spec.md",
    ),
    "write runner did not parse acknowledged existing changes",
    failures,
  );

  const parsedStatusPaths = parseStatusPaths(
    "## branch\n M orchestrator/README.md\n M plans/target-app-execplan.md\n?? tratorREADME.md",
  );
  assertContract(
    parsedStatusPaths.includes("orchestrator/README.md") &&
      parsedStatusPaths.includes("plans/target-app-execplan.md") &&
      parsedStatusPaths.includes("tratorREADME.md"),
    "git status parser did not preserve unstaged path first characters",
    failures,
  );

  const validOperationEnvelope = {
    version: OPERATION_ENVELOPE_VERSION,
    operationId: "m114-contract-smoke",
    scope: "orchestrator",
    mode: OPERATION_ENVELOPE_MODE,
    prompt: "Check local operation envelope policy.",
    plannedPaths: ["orchestrator/README.md", "package.json"],
  };
  const [m115SdkWritePath, m117SdkWritePath, arbitrarySdkWritePath] =
    SDK_WRITE_CONTRACT_SMOKE_PLANNED_PATHS;
  const [
    m123OrchestratorSdkWritePath,
    arbitraryOrchestratorSdkWritePath,
    m125OrchestratorFixtureSdkWritePath,
    arbitraryOrchestratorFixtureSdkWritePath,
  ] = SDK_WRITE_ORCHESTRATOR_CONTRACT_SMOKE_PLANNED_PATHS;
  const validSdkWriteEnvelope = {
    version: OPERATION_ENVELOPE_VERSION,
    operationId: "m115-contract-smoke",
    scope: SDK_WRITE_ALLOWED_SCOPE,
    mode: SDK_WRITE_OPERATION_MODE,
    prompt: "Create the M115 docs audit SDKThread output file.",
    plannedPaths: [m115SdkWritePath],
  };
  const validOrchestratorSdkWriteEnvelope = {
    version: OPERATION_ENVELOPE_VERSION,
    operationId: "m123-contract-smoke",
    scope: SDK_WRITE_ORCHESTRATOR_SCOPE,
    mode: SDK_WRITE_OPERATION_MODE,
    prompt: "Create the M123 orchestrator Markdown SDKThread output file.",
    plannedPaths: [m123OrchestratorSdkWritePath],
  };
  const validOrchestratorFixtureSdkWriteEnvelope = {
    version: OPERATION_ENVELOPE_VERSION,
    operationId: "m125-contract-smoke",
    scope: SDK_WRITE_ORCHESTRATOR_SCOPE,
    mode: SDK_WRITE_OPERATION_MODE,
    prompt: "Create the M125 orchestrator fixture JSON SDKThread output file.",
    plannedPaths: [m125OrchestratorFixtureSdkWritePath],
  };
  const validProductionCodeSdkWriteEnvelope = {
    version: OPERATION_ENVELOPE_VERSION,
    operationId: "m136-contract-smoke",
    scope: SDK_WRITE_PRODUCTION_CODE_SCOPE,
    mode: SDK_WRITE_OPERATION_MODE,
    prompt: "Update the provider contract smoke with a narrow assertion.",
    plannedPaths: SDK_WRITE_PRODUCTION_CODE_PLANNED_PATH_ALLOWLIST,
  };
  const parsedDryRun = parseWriteRunnerArgs([
    "--dry-run",
    "--operation-file",
    ".codex-audit/m114-operation-envelope.json",
  ]);
  const parsedSdkWrite = parseWriteRunnerArgs([
    "--operation-file",
    ".codex-runtime/sdk/operations/m115-docs-audit-sdk-write.json",
  ]);

  assertContract(parsedDryRun.dryRun === true, "write runner did not parse dry-run mode", failures);
  assertContract(
    parsedDryRun.operationFile === ".codex-audit/m114-operation-envelope.json",
    "write runner did not parse dry-run operation file",
    failures,
  );
  assertContract(
    parsedSdkWrite.operationFile === ".codex-runtime/sdk/operations/m115-docs-audit-sdk-write.json" &&
      parsedSdkWrite.dryRun !== true,
    "write runner did not parse sdk-write operation file mode",
    failures,
  );

  assertRejects(
    () => parseWriteRunnerArgs(["--scope", "unknown", "--prompt", "No-op"]),
    "Unknown write scope:",
    failures,
    "write runner did not reject unknown scope",
  );

  assertRejects(
    () => parseWriteRunnerArgs(["--prompt", "No-op"]),
    "Missing required --scope.",
    failures,
    "write runner did not require explicit scope",
  );

  assertRejects(
    () => parseWriteRunnerArgs(["--dry-run"]),
    "Missing required --operation-file",
    failures,
    "dry-run mode did not require an operation file",
  );

  assertRejects(
    () =>
      parseWriteRunnerArgs([
        "--dry-run",
        "--operation-file",
        ".codex-audit/m114-operation-envelope.json",
        "--scope",
        "orchestrator",
      ]),
    "Do not combine --operation-file",
    failures,
    "dry-run operation envelope mode allowed conflicting CLI scope",
  );

  const unsafeArgCases = [
    ["--scope", "orchestrator", "--prompt", "No-op", "--sandbox", "workspace-write"],
    ["--scope", "orchestrator", "--prompt", "No-op", "--sandbox=workspace-write"],
    ["--scope", "orchestrator", "--prompt", "No-op", "--approval", "on-request"],
    ["--scope", "orchestrator", "--prompt", "No-op", "--network"],
    ["--scope", "orchestrator", "--prompt", "No-op", "--web-search", "live"],
    ["--scope", "orchestrator", "--prompt", "No-op", "--skip-git-repo-check"],
    ["--scope", "orchestrator", "--prompt", "No-op", "--external-provider"],
    ["--scope", "orchestrator", "--prompt", "No-op", "--openai-cli-planner"],
    ["--scope", "orchestrator", "--prompt", "No-op", "--mutating-live"],
    ["--scope", "orchestrator", "--prompt", "No-op", "--tenant-policy-bypass"],
    ["--scope", "orchestrator", "--prompt", "No-op", "--auto-commit"],
    ["--scope", "orchestrator", "--prompt", "No-op", "--commit"],
    ["--scope", "orchestrator", "--prompt", "No-op", "--force"],
    ["--scope", "orchestrator", "--prompt", "No-op", "--live"],
    ["--scope", "orchestrator", "--prompt", "No-op", "--execute"],
  ];

  for (const unsafeArgs of unsafeArgCases) {
    assertRejects(
      () => parseWriteRunnerArgs(unsafeArgs),
      "Unsafe write-capable runner flag rejected:",
      failures,
      `write runner did not reject unsafe args: ${unsafeArgs.join(" ")}`,
    );
  }

  for (const unsafeArgs of unsafeArgCases) {
    assertRejects(
      () => parseWriteRunnerArgs(["--dry-run", ...unsafeArgs]),
      "Unsafe write-capable runner flag rejected:",
      failures,
      `dry-run mode did not reject unsafe args: ${unsafeArgs.join(" ")}`,
    );
  }

  for (const prompt of [
    "Run external-provider validation",
    "Use the OpenAI CLI planner",
    "Run live CEP smoke",
    "Use tenant-policy bypass",
    "Auto-commit the changes",
  ]) {
    assertRejects(
      () => validatePromptPolicy(prompt),
      "Hard-stop policy rejected prompt request:",
      failures,
      `write runner did not reject forbidden prompt request: ${prompt}`,
    );
  }

  const validatedEnvelope = validateOperationEnvelope(validOperationEnvelope);
  assertContract(
    validatedEnvelope.operationId === "m114-contract-smoke" &&
      validatedEnvelope.scope === "orchestrator" &&
      validatedEnvelope.mode === OPERATION_ENVELOPE_MODE &&
      validatedEnvelope.plannedPaths.join(",") === "orchestrator/README.md,package.json",
    "operation envelope did not validate the expected schema",
    failures,
  );
  const docsAuditSdkWriteAcceptCases = [
    ["m115-contract-smoke", m115SdkWritePath],
    ["m117-contract-smoke", m117SdkWritePath],
    ["arbitrary-contract-smoke", arbitrarySdkWritePath],
  ];

  for (const [operationId, plannedPath] of docsAuditSdkWriteAcceptCases) {
    const validatedSdkWriteEnvelope = validateOperationEnvelope({
      ...validSdkWriteEnvelope,
      operationId,
      plannedPaths: [plannedPath],
    });
    assertContract(
      validatedSdkWriteEnvelope.operationId === operationId &&
        validatedSdkWriteEnvelope.scope === SDK_WRITE_ALLOWED_SCOPE &&
        validatedSdkWriteEnvelope.mode === SDK_WRITE_OPERATION_MODE &&
        validatedSdkWriteEnvelope.plannedPaths.join(",") === plannedPath,
      `sdk-write operation envelope did not accept docs-audit planned path: ${plannedPath}`,
      failures,
    );
  }

  const orchestratorSdkWriteAcceptCases = [
    ["m123-contract-smoke", m123OrchestratorSdkWritePath],
    ["orchestrator-arbitrary-contract-smoke", arbitraryOrchestratorSdkWritePath],
    ["m125-contract-smoke", m125OrchestratorFixtureSdkWritePath],
    ["orchestrator-arbitrary-fixture-contract-smoke", arbitraryOrchestratorFixtureSdkWritePath],
  ];

  for (const [operationId, plannedPath] of orchestratorSdkWriteAcceptCases) {
    const validatedSdkWriteEnvelope = validateOperationEnvelope({
      ...(plannedPath.endsWith(".json")
        ? validOrchestratorFixtureSdkWriteEnvelope
        : validOrchestratorSdkWriteEnvelope),
      operationId,
      plannedPaths: [plannedPath],
    });
    assertContract(
      validatedSdkWriteEnvelope.operationId === operationId &&
        validatedSdkWriteEnvelope.scope === SDK_WRITE_ORCHESTRATOR_SCOPE &&
        validatedSdkWriteEnvelope.mode === SDK_WRITE_OPERATION_MODE &&
        validatedSdkWriteEnvelope.plannedPaths.join(",") === plannedPath,
      `sdk-write operation envelope did not accept orchestrator planned path: ${plannedPath}`,
      failures,
    );
  }

  const docsAuditSdkWritePrompt = createSdkWritePrompt({
    ...validSdkWriteEnvelope,
    operationEnvelope: validSdkWriteEnvelope,
    sdkWrite: true,
  });
  assertContract(
    docsAuditSdkWritePrompt.includes("# SDK Docs Audit Output") &&
      docsAuditSdkWritePrompt.includes("State that only the planned docs-audit output file"),
    "docs-audit sdk-write Markdown prompt did not render its output title",
    failures,
  );

  const orchestratorMarkdownSdkWritePrompt = createSdkWritePrompt({
    ...validOrchestratorSdkWriteEnvelope,
    operationEnvelope: validOrchestratorSdkWriteEnvelope,
    sdkWrite: true,
  });
  assertContract(
    orchestratorMarkdownSdkWritePrompt.includes("# SDK Orchestrator Output") &&
      orchestratorMarkdownSdkWritePrompt.includes(
        "State that only the planned orchestrator Markdown output file",
      ),
    "orchestrator sdk-write Markdown prompt did not render its output title",
    failures,
  );

  const orchestratorFixtureSdkWritePrompt = createSdkWritePrompt({
    ...validOrchestratorFixtureSdkWriteEnvelope,
    operationEnvelope: validOrchestratorFixtureSdkWriteEnvelope,
    sdkWrite: true,
  });
  assertContract(
    orchestratorFixtureSdkWritePrompt.includes('"result": "created-by-sdk-thread"') &&
      orchestratorFixtureSdkWritePrompt.includes("Write valid JSON only"),
    "orchestrator fixture sdk-write JSON prompt did not render its JSON structure",
    failures,
  );

  const syntheticSdkError = new Error("synthetic original SDK failure preserved");
  syntheticSdkError.code = "SYNTHETIC_SDK_FAILURE";
  const syntheticPrimaryRuntimeError = new Error("Access denied to synthetic primary runtime");
  syntheticPrimaryRuntimeError.code = "EACCES";
  const runtimeProbeWrites = [];
  const runtimeProbeDeletes = [];
  const fallbackRuntimePreflight = resolveSdkRuntimePaths(process.cwd(), {
    mkdirSync: (directoryPath) => {
      const repoPath = normalizeRepoPath(path.relative(process.cwd(), directoryPath));
      if (repoPath.startsWith(SDK_WRITE_PRIMARY_RUNTIME_DIRECTORY)) {
        throw syntheticPrimaryRuntimeError;
      }
    },
    unlinkSync: (filePath) => {
      runtimeProbeDeletes.push(normalizeRepoPath(path.relative(process.cwd(), filePath)));
    },
    writeFileSync: (filePath) => {
      runtimeProbeWrites.push(normalizeRepoPath(path.relative(process.cwd(), filePath)));
    },
  });

  assertContract(
    fallbackRuntimePreflight.primaryWritable === false &&
      fallbackRuntimePreflight.fallbackWritable === true &&
      fallbackRuntimePreflight.selectedRuntimePath === SDK_WRITE_FALLBACK_RUNTIME_DIRECTORY,
    "sdk runtime preflight did not select fallback when primary runtime was unavailable",
    failures,
  );
  assertContract(
    runtimeProbeWrites.some((repoPath) =>
      repoPath.startsWith(`${SDK_WRITE_FALLBACK_RUNTIME_DIRECTORY}/logs/`),
    ) &&
      runtimeProbeWrites.some((repoPath) =>
        repoPath.startsWith(`${SDK_WRITE_FALLBACK_RUNTIME_DIRECTORY}/operations/`),
      ),
    "sdk runtime preflight did not probe fallback logs and operations directories",
    failures,
  );
  assertContract(
    runtimeProbeWrites.length > 0 &&
      runtimeProbeWrites.every((repoPath) => runtimeProbeDeletes.includes(repoPath)),
    "sdk runtime preflight did not clean fallback temp probe files",
    failures,
  );

  const syntheticLogError = new Error("EPERM: synthetic runtime write denied");
  syntheticLogError.code = "EPERM";
  const fallbackWrites = new Map();
  const diagnosticOperationId = "m116-contract-smoke";
  const diagnosticLogResult = writeSdkWriteLog(
    process.cwd(),
    diagnosticOperationId,
    {
      failure: errorDiagnostic(syntheticSdkError),
      operationEnvelope: {
        operationId: diagnosticOperationId,
        sourcePath: createSdkWriteOperationFallbackPath(
          diagnosticOperationId,
          fallbackRuntimePreflight,
        ),
      },
      outputFileCreatedBySdk: false,
      plannedPathCheck: { plannedPaths: [m115SdkWritePath] },
      realWriteWork: false,
      sdkRunFailure: errorDiagnostic(syntheticSdkError),
      sdkThreadCompleted: false,
      sdkThreadCreated: false,
      sdkThreadId: null,
      sdkThreadOutputPath: m115SdkWritePath,
    },
    {
      mkdirSync: (directoryPath) => {
        const repoPath = normalizeRepoPath(path.relative(process.cwd(), directoryPath));
        if (
          repoPath.startsWith(SDK_WRITE_PRIMARY_RUNTIME_DIRECTORY) ||
          repoPath.startsWith(SDK_WRITE_FALLBACK_RUNTIME_DIRECTORY)
        ) {
          throw syntheticLogError;
        }
      },
      unlinkSync: () => {},
      writeFileSync: (filePath, text) => {
        const repoPath = normalizeRepoPath(path.relative(process.cwd(), filePath));
        if (
          repoPath.startsWith(SDK_WRITE_PRIMARY_RUNTIME_DIRECTORY) ||
          repoPath.startsWith(SDK_WRITE_FALLBACK_RUNTIME_DIRECTORY)
        ) {
          throw syntheticLogError;
        }
        fallbackWrites.set(repoPath, text);
      },
    },
  );
  const diagnosticFallbackOperationPath = diagnosticLogResult.fallbackOperationPath;
  const diagnosticFailureMessage = createSdkWriteFailureMessage(
    syntheticSdkError,
    diagnosticLogResult,
  );

  assertContract(
    diagnosticFallbackOperationPath.startsWith(
      `${SDK_WRITE_FALLBACK_RUNTIME_DIRECTORY}/operations/`,
    ) && diagnosticFallbackOperationPath.endsWith("-operation.json"),
    "sdk-write operation fallback path was not reported under .codex-runtime/sdk/operations",
    failures,
  );
  assertContract(
    diagnosticLogResult.path === null &&
      diagnosticLogResult.errorCode === "EPERM" &&
      diagnosticLogResult.runtimePreflight?.primaryWritable === false &&
      diagnosticLogResult.runtimePreflight?.fallbackWritable === false &&
      diagnosticLogResult.runtimePreflight?.selectedRuntimePath ===
        SDK_WRITE_FALLBACK_RUNTIME_DIRECTORY &&
      diagnosticLogResult.fallbackReportWritten === true &&
      diagnosticLogResult.fallbackReportPath?.startsWith(
        `${SDK_WRITE_FALLBACK_REPORT_DIRECTORY}/`,
      ),
    "sdk-write log write failure was not converted into a non-fatal .codex-audit fallback report",
    failures,
  );
  assertContract(
    fallbackWrites
      .get(diagnosticLogResult.fallbackReportPath)
      ?.includes("synthetic original SDK failure preserved") &&
      fallbackWrites
        .get(diagnosticLogResult.fallbackReportPath)
        ?.includes("sdkThreadCreated: false") &&
      fallbackWrites.get(diagnosticLogResult.fallbackReportPath)?.includes("realWriteWork: false") &&
      fallbackWrites
        .get(diagnosticLogResult.fallbackReportPath)
        ?.includes(`selected runtime path: ${SDK_WRITE_FALLBACK_RUNTIME_DIRECTORY}`),
    "sdk-write fallback report did not preserve the original failure, runtime preflight, and local-only smoke state",
    failures,
  );
  assertContract(
    diagnosticFailureMessage.includes("synthetic original SDK failure preserved") &&
      diagnosticFailureMessage.includes("SDK log write failed: EPERM") &&
      diagnosticFailureMessage.includes("Fallback diagnostic report:"),
    "sdk-write failure console message did not preserve original error plus log fallback",
    failures,
  );

  assertRejects(
    () => resolveOperationFilePath(path.join("..", "outside-operation.json"), process.cwd()),
    "Operation file outside repo:",
    failures,
    "operation envelope did not reject file outside repo",
  );

  assertRejects(
    () =>
      loadOperationEnvelopeOptions({
        dryRun: true,
        operationFile: ".codex-audit/missing-operation-envelope.json",
      }),
    "Missing operation file:",
    failures,
    "operation envelope did not reject a missing operation file",
  );

  const sdkWriteEnvelopeOptions = loadOperationEnvelopeOptions(
    {
      operationFile: ".codex-runtime/sdk/operations/m115-docs-audit-sdk-write.json",
    },
    {
      existsSync: () => true,
      readFileSync: () => JSON.stringify(validSdkWriteEnvelope),
      realpathSync: (value) => value,
      statSync: () => ({ isFile: () => true }),
    },
  );

  assertContract(
    sdkWriteEnvelopeOptions.sdkWrite === true &&
      sdkWriteEnvelopeOptions.dryRun === false &&
      sdkWriteEnvelopeOptions.scope === SDK_WRITE_ALLOWED_SCOPE,
    "sdk-write operation envelope options did not resolve without creating a thread",
    failures,
  );

  const orchestratorSdkWriteEnvelopeOptions = loadOperationEnvelopeOptions(
    {
      operationFile:
        ".codex-runtime/sdk/operations/m123-orchestrator-docs-only-sdk-write-operation.json",
    },
    {
      existsSync: () => true,
      readFileSync: () => JSON.stringify(validOrchestratorSdkWriteEnvelope),
      realpathSync: (value) => value,
      statSync: () => ({ isFile: () => true }),
    },
  );

  assertContract(
    orchestratorSdkWriteEnvelopeOptions.sdkWrite === true &&
      orchestratorSdkWriteEnvelopeOptions.dryRun === false &&
      orchestratorSdkWriteEnvelopeOptions.scope === SDK_WRITE_ORCHESTRATOR_SCOPE,
    "orchestrator sdk-write operation envelope options did not resolve without creating a thread",
    failures,
  );

  assertRejects(
    () =>
      loadOperationEnvelopeOptions(
        {
          dryRun: true,
          operationFile: ".codex-runtime/sdk/operations/m115-docs-audit-sdk-write.json",
        },
        {
          existsSync: () => true,
          readFileSync: () => JSON.stringify(validSdkWriteEnvelope),
          realpathSync: (value) => value,
          statSync: () => ({ isFile: () => true }),
        },
      ),
    "Operation envelope mode sdk-write cannot be combined with --dry-run.",
    failures,
    "sdk-write operation envelope was allowed with dry-run CLI mode",
  );

  assertRejects(
    () =>
      loadOperationEnvelopeOptions(
        {
          operationFile: ".codex-audit/m114-operation-envelope.json",
        },
        {
          existsSync: () => true,
          readFileSync: () => JSON.stringify(validOperationEnvelope),
          realpathSync: (value) => value,
          statSync: () => ({ isFile: () => true }),
        },
      ),
    "Operation envelope mode dry-run requires --dry-run.",
    failures,
    "dry-run operation envelope was allowed without dry-run CLI mode",
  );

  assertRejects(
    () => parseOperationEnvelopeJson("{not-json", "contract-smoke"),
    "Malformed operation file JSON:",
    failures,
    "operation envelope did not reject malformed JSON",
  );

  assertRejects(
    () => validateOperationEnvelope({ ...validOperationEnvelope, version: 2 }),
    "Unsupported operation envelope version:",
    failures,
    "operation envelope did not reject unsupported version",
  );

  assertRejects(
    () => validateOperationEnvelope({ ...validOperationEnvelope, operationId: "" }),
    "Missing operation envelope operationId.",
    failures,
    "operation envelope did not reject missing operationId",
  );

  assertRejects(
    () => validateOperationEnvelope({ ...validOperationEnvelope, scope: "" }),
    "Missing operation envelope scope.",
    failures,
    "operation envelope did not reject missing scope",
  );

  assertRejects(
    () => validateOperationEnvelope({ ...validOperationEnvelope, scope: "unknown" }),
    "Unknown write scope:",
    failures,
    "operation envelope did not reject unknown scope",
  );

  assertRejects(
    () => validateOperationEnvelope({ ...validOperationEnvelope, mode: "live" }),
    "Unsupported operation envelope mode:",
    failures,
    "operation envelope did not reject non-dry-run mode",
  );

  let productionCodeProviderContractLaneAccepted = true;
  try {
    validateOperationEnvelope(validProductionCodeSdkWriteEnvelope);
  } catch {
    productionCodeProviderContractLaneAccepted = false;
  }
  assertContract(
    productionCodeProviderContractLaneAccepted,
    "sdk-write operation envelope rejected the approved production-code provider-contract lane",
    failures,
  );

  const productionCodeSdkPrompt = createSdkWritePrompt({
    ...validProductionCodeSdkWriteEnvelope,
    operationEnvelope: validProductionCodeSdkWriteEnvelope,
    sdkWrite: true,
  });
  assertContract(
    productionCodeSdkPrompt.includes("production-code provider contract smoke maintainer") &&
      productionCodeSdkPrompt.includes("Update exactly the planned existing production-code source file") &&
      productionCodeSdkPrompt.includes("scripts/provider-contract-smoke.js") &&
      !productionCodeSdkPrompt.includes("# SDK Docs Audit Output"),
    "production-code sdk-write prompt did not use source-update constraints",
    failures,
  );

  const productionPrecondition = validateSdkWritePlannedPathPrecondition({
    pathExists: (repoPath) => repoPath === "scripts/provider-contract-smoke.js",
    plannedPaths: SDK_WRITE_PRODUCTION_CODE_PLANNED_PATH_ALLOWLIST,
    scope: SDK_WRITE_PRODUCTION_CODE_SCOPE,
  });
  assertContract(
    productionPrecondition.mode === "existing-source-update" &&
      productionPrecondition.existingPlannedPaths.join(",") ===
        "scripts/provider-contract-smoke.js",
    "production-code sdk-write precondition did not require an existing source file",
    failures,
  );
  assertRejects(
    () =>
      validateSdkWritePlannedPathPrecondition({
        pathExists: () => false,
        plannedPaths: SDK_WRITE_PRODUCTION_CODE_PLANNED_PATH_ALLOWLIST,
        scope: SDK_WRITE_PRODUCTION_CODE_SCOPE,
      }),
    "Planned production-code sdk-write source path missing before SDK thread creation:",
    failures,
    "production-code sdk-write precondition accepted a missing source file",
  );
  assertRejects(
    () =>
      validateSdkWritePlannedPathPrecondition({
        pathExists: () => true,
        plannedPaths: [m115SdkWritePath],
        scope: SDK_WRITE_ALLOWED_SCOPE,
      }),
    "Planned sdk-write output already exists before SDK thread creation:",
    failures,
    "docs-audit sdk-write precondition accepted an existing output file",
  );

  const sdkWriteReviewRequiredScopeCases = [
    {
      expectedMessageStart:
        "sdk-write plannedPaths outside production-code approved allowlist:",
      label: "sdk-write operation envelope did not keep production bridge code review-required",
      plannedPaths: ["mcp-server/bridge-daemon.js"],
      scope: SDK_WRITE_PRODUCTION_CODE_SCOPE,
    },
    {
      expectedMessageStart:
        "sdk-write plannedPaths outside production-code approved allowlist:",
      label: "sdk-write operation envelope did not keep production connector code review-required",
      plannedPaths: ["chatgpt-connector/server.js"],
      scope: SDK_WRITE_PRODUCTION_CODE_SCOPE,
    },
    {
      expectedMessageStart:
        "sdk-write plannedPaths outside production-code approved allowlist:",
      label: "sdk-write operation envelope did not keep unapproved production scripts review-required",
      plannedPaths: ["scripts/smoke-test.js"],
      scope: SDK_WRITE_PRODUCTION_CODE_SCOPE,
    },
    {
      expectedMessageStart: "sdk-write operation envelope scope rejected:",
      label: "sdk-write operation envelope did not keep CEP panel code review-required",
      plannedPaths: ["cep-panel/panel.js"],
      scope: "cep-panel",
    },
  ];

  for (const reviewRequiredCase of sdkWriteReviewRequiredScopeCases) {
    assertRejects(
      () =>
        validateOperationEnvelope({
          ...validSdkWriteEnvelope,
          operationId: `m127-${reviewRequiredCase.scope}-scope-expansion-gate`,
          plannedPaths: reviewRequiredCase.plannedPaths,
          prompt: "Attempt a review-required SDK write scope expansion.",
          scope: reviewRequiredCase.scope,
        }),
      reviewRequiredCase.expectedMessageStart,
      failures,
      reviewRequiredCase.label,
    );
  }

  const validProductionScopeExpansionReview = {
    schema: SDK_SCOPE_EXPANSION_REVIEW_SCHEMA,
    decision: "proposed",
    scope: "production-code",
    sdkWriteEnabled: false,
    summary: "Review a narrow bridge-only SDK write lane without enabling it.",
    plannedPathAllowlist: ["mcp-server/bridge-daemon.js"],
    validationPlan: [
      "Run local contract smoke before any SDKThread write.",
      "Run bridge-only smoke after implementation review.",
    ],
    rollbackPlan: "Leave SDK_WRITE_ALLOWED_SCOPES unchanged unless the separate review approves.",
  };
  const validCepScopeExpansionReview = {
    ...validProductionScopeExpansionReview,
    scope: "cep-panel",
    summary: "Review a narrow CEP panel SDK write lane without enabling it.",
    plannedPathAllowlist: ["cep-panel/panel.js"],
  };

  let productionScopeExpansionReviewAccepted = true;
  try {
    validateSdkScopeExpansionReviewPacket(validProductionScopeExpansionReview);
  } catch {
    productionScopeExpansionReviewAccepted = false;
  }
  assertContract(
    productionScopeExpansionReviewAccepted,
    "SDK scope expansion review packet rejected a valid production-code proposal",
    failures,
  );

  let cepScopeExpansionReviewAccepted = true;
  try {
    validateSdkScopeExpansionReviewPacket(validCepScopeExpansionReview);
  } catch {
    cepScopeExpansionReviewAccepted = false;
  }
  assertContract(
    cepScopeExpansionReviewAccepted,
    "SDK scope expansion review packet rejected a valid CEP-panel proposal",
    failures,
  );

  const scopeExpansionReviewRejectedCases = [
    {
      expectedMessageStart: "SDK scope expansion review packet must keep sdkWriteEnabled:false.",
      label: "SDK scope expansion review packet allowed sdkWriteEnabled:true",
      patch: { sdkWriteEnabled: true },
    },
    {
      expectedMessageStart: "SDK scope expansion review scope rejected:",
      label: "SDK scope expansion review packet accepted an already-enabled scope",
      patch: { plannedPathAllowlist: ["orchestrator/proposed.md"], scope: "orchestrator" },
    },
    {
      expectedMessageStart: "SDK scope expansion review plannedPathAllowlist outside scope allowlist:",
      label: "SDK scope expansion review packet accepted a path outside its review scope",
      patch: { plannedPathAllowlist: ["cep-panel/panel.js"] },
    },
    {
      expectedMessageStart: "SDK scope expansion review plannedPathAllowlist includes forbidden paths:",
      label: "SDK scope expansion review packet accepted a forbidden path",
      patch: { plannedPathAllowlist: [".env"] },
    },
    {
      expectedMessageStart: "Missing SDK scope expansion review validationPlan.",
      label: "SDK scope expansion review packet accepted a missing validation plan",
      patch: { validationPlan: [] },
    },
    {
      expectedMessageStart: "Unsafe SDK scope expansion review field rejected:",
      label: "SDK scope expansion review packet accepted unsafe execution options",
      patch: { networkAccessEnabled: true },
    },
  ];

  for (const rejectedCase of scopeExpansionReviewRejectedCases) {
    assertRejects(
      () =>
        validateSdkScopeExpansionReviewPacket({
          ...validProductionScopeExpansionReview,
          ...rejectedCase.patch,
        }),
      rejectedCase.expectedMessageStart,
      failures,
      rejectedCase.label,
    );
  }

  const validProductionLaneReadiness = {
    schema: SDK_WRITE_LANE_READINESS_SCHEMA,
    readiness: SDK_WRITE_LANE_READINESS_STATE,
    approvalState: SDK_WRITE_LANE_APPROVAL_STATE,
    scope: "production-code",
    sdkWriteEnabled: false,
    sourceReviewPacket: `${SDK_SCOPE_EXPANSION_REVIEW_DIRECTORY}/129-production-code-smoke-harness-review.json`,
    summary: "Prepare a scripts-only production-code SDK write lane for approval review.",
    plannedPathAllowlist: ["scripts/provider-contract-smoke.js"],
    requiredApprovalRecord:
      "Record a separate explicit approval decision before enabling production-code sdk-write.",
    preEnablementChecks: [
      "Run node --check scripts/provider-contract-smoke.js.",
      "Run npm.cmd run check:rules.",
    ],
    approvalEvidenceRequired: [
      "Review the source M129 scope expansion packet.",
      "Confirm the lane remains limited to scripts/provider-contract-smoke.js.",
    ],
    rollbackPlan: "Keep SDK_WRITE_ALLOWED_SCOPES unchanged unless approval is recorded.",
  };

  let productionLaneReadinessAccepted = true;
  try {
    validateSdkWriteLaneReadinessPacket(validProductionLaneReadiness);
  } catch {
    productionLaneReadinessAccepted = false;
  }
  assertContract(
    productionLaneReadinessAccepted,
    "SDK write lane readiness packet rejected a valid production-code readiness gate",
    failures,
  );

  const laneReadinessRejectedCases = [
    {
      expectedMessageStart: "SDK write lane readiness packet must keep sdkWriteEnabled:false.",
      label: "SDK write lane readiness packet allowed sdkWriteEnabled:true",
      patch: { sdkWriteEnabled: true },
    },
    {
      expectedMessageStart:
        "SDK write lane readiness approvalState must be pending-explicit-approval.",
      label: "SDK write lane readiness packet accepted an approved state",
      patch: { approvalState: "approved" },
    },
    {
      expectedMessageStart:
        "SDK write lane readiness sourceReviewPacket must point to .codex-audit/sdk-scope-expansion-reviews/*.json.",
      label: "SDK write lane readiness packet accepted an outside source review path",
      patch: { sourceReviewPacket: ".codex-audit/not-a-review.json" },
    },
    {
      expectedMessageStart: "SDK write lane readiness plannedPathAllowlist outside scope allowlist:",
      label: "SDK write lane readiness packet accepted a path outside its review scope",
      patch: { plannedPathAllowlist: ["cep-panel/panel.js"] },
    },
    {
      expectedMessageStart: "Missing SDK write lane readiness preEnablementChecks.",
      label: "SDK write lane readiness packet accepted missing pre-enablement checks",
      patch: { preEnablementChecks: [] },
    },
    {
      expectedMessageStart: "Unsafe SDK write lane readiness field rejected:",
      label: "SDK write lane readiness packet accepted unsafe execution options",
      patch: { networkAccessEnabled: true },
    },
  ];

  for (const rejectedCase of laneReadinessRejectedCases) {
    assertRejects(
      () =>
        validateSdkWriteLaneReadinessPacket({
          ...validProductionLaneReadiness,
          ...rejectedCase.patch,
        }),
      rejectedCase.expectedMessageStart,
      failures,
      rejectedCase.label,
    );
  }

  const validProductionLaneApprovalDecision = {
    schema: SDK_WRITE_LANE_APPROVAL_DECISION_SCHEMA,
    approvalState: SDK_WRITE_LANE_APPROVAL_STATE,
    explicitApprovalRecorded: false,
    scope: "production-code",
    sdkWriteEnabled: false,
    sourceReadinessPacket: `${SDK_WRITE_LANE_READINESS_DIRECTORY}/133-production-code-smoke-harness-readiness.json`,
    sourceReviewPacket: `${SDK_SCOPE_EXPANSION_REVIEW_DIRECTORY}/129-production-code-smoke-harness-review.json`,
    summary:
      "Record that no explicit approval was provided for the production-code SDK write lane.",
    plannedPathAllowlist: ["scripts/provider-contract-smoke.js"],
    requiredApprovalRecord:
      "An explicit user approval must be recorded before enabling production-code sdk-write.",
    decisionEvidence: [
      "The continuation prompt did not explicitly approve production-code SDK writes.",
      "The readiness packet remains pending explicit approval.",
    ],
    nextAllowedAction:
      "Keep production-code absent from SDK_WRITE_ALLOWED_SCOPES until explicit approval is recorded.",
    rollbackPlan: "Keep SDK_WRITE_ALLOWED_SCOPES unchanged unless approval is recorded.",
  };

  let productionLaneApprovalDecisionAccepted = true;
  try {
    validateSdkWriteLaneApprovalDecisionPacket(validProductionLaneApprovalDecision);
  } catch {
    productionLaneApprovalDecisionAccepted = false;
  }
  assertContract(
    productionLaneApprovalDecisionAccepted,
    "SDK write lane approval decision packet rejected a valid pending production-code decision",
    failures,
  );

  const laneApprovalDecisionRejectedCases = [
    {
      expectedMessageStart:
        "SDK write lane approval decision must keep explicitApprovalRecorded:false.",
      label: "SDK write lane approval decision accepted explicitApprovalRecorded:true",
      patch: { explicitApprovalRecorded: true },
    },
    {
      expectedMessageStart:
        "SDK write lane approval decision approvalState must be pending-explicit-approval.",
      label: "SDK write lane approval decision accepted an approved state",
      patch: { approvalState: "approved" },
    },
    {
      expectedMessageStart: "SDK write lane approval decision must keep sdkWriteEnabled:false.",
      label: "SDK write lane approval decision accepted sdkWriteEnabled:true",
      patch: { sdkWriteEnabled: true },
    },
    {
      expectedMessageStart:
        "SDK write lane approval decision sourceReadinessPacket must point to .codex-audit/sdk-write-lane-readiness/*.json.",
      label: "SDK write lane approval decision accepted an outside readiness path",
      patch: { sourceReadinessPacket: ".codex-audit/not-readiness.json" },
    },
    {
      expectedMessageStart:
        "SDK write lane approval decision plannedPathAllowlist outside scope allowlist:",
      label: "SDK write lane approval decision accepted a path outside its review scope",
      patch: { plannedPathAllowlist: ["cep-panel/panel.js"] },
    },
    {
      expectedMessageStart: "Missing SDK write lane approval decision evidence.",
      label: "SDK write lane approval decision accepted missing decision evidence",
      patch: { decisionEvidence: [] },
    },
    {
      expectedMessageStart: "Unsafe SDK write lane approval decision field rejected:",
      label: "SDK write lane approval decision accepted unsafe execution options",
      patch: { externalProvider: true },
    },
  ];

  for (const rejectedCase of laneApprovalDecisionRejectedCases) {
    assertRejects(
      () =>
        validateSdkWriteLaneApprovalDecisionPacket({
          ...validProductionLaneApprovalDecision,
          ...rejectedCase.patch,
        }),
      rejectedCase.expectedMessageStart,
      failures,
      rejectedCase.label,
    );
  }

  const validProductionLaneEnablement = {
    schema: SDK_WRITE_LANE_ENABLEMENT_SCHEMA,
    approvalState: SDK_WRITE_LANE_ENABLEMENT_APPROVAL_STATE,
    explicitApprovalRecorded: true,
    scope: SDK_WRITE_PRODUCTION_CODE_SCOPE,
    sdkWriteEnabled: true,
    sourceApprovalDecisionPacket: `${SDK_WRITE_LANE_APPROVAL_DECISION_DIRECTORY}/134-production-code-smoke-harness-approval-decision.json`,
    sourceReadinessPacket: `${SDK_WRITE_LANE_READINESS_DIRECTORY}/133-production-code-smoke-harness-readiness.json`,
    sourceReviewPacket: `${SDK_SCOPE_EXPANSION_REVIEW_DIRECTORY}/129-production-code-smoke-harness-review.json`,
    summary:
      "Enable the approved production-code SDK write lane only for provider contract smoke maintenance.",
    plannedPathAllowlist: SDK_WRITE_PRODUCTION_CODE_PLANNED_PATH_ALLOWLIST,
    approvalRecord:
      "User explicitly approved enabling the M129/M133/M134 production-code SDK write lane only for scripts/provider-contract-smoke.js.",
    enablementChecks: [
      "Run node --check scripts/provider-contract-smoke.js.",
      "Run npm.cmd run codex:orchestrator:write-scaffold:contract.",
      "Run npm.cmd run check:rules.",
    ],
    rollbackPlan:
      "Remove production-code from SDK_WRITE_ALLOWED_SCOPES and remove its sdk-write allowlist if the lane must be disabled.",
  };

  let productionLaneEnablementAccepted = true;
  try {
    validateSdkWriteLaneEnablementPacket(validProductionLaneEnablement);
  } catch {
    productionLaneEnablementAccepted = false;
  }
  assertContract(
    productionLaneEnablementAccepted,
    "SDK write lane enablement packet rejected a valid approved production-code lane",
    failures,
  );

  const laneEnablementRejectedCases = [
    {
      expectedMessageStart:
        "SDK write lane enablement must record explicitApprovalRecorded:true.",
      label: "SDK write lane enablement accepted missing explicit approval",
      patch: { explicitApprovalRecorded: false },
    },
    {
      expectedMessageStart: "SDK write lane enablement approvalState must be approved.",
      label: "SDK write lane enablement accepted a pending approval state",
      patch: { approvalState: SDK_WRITE_LANE_APPROVAL_STATE },
    },
    {
      expectedMessageStart: "SDK write lane enablement must set sdkWriteEnabled:true.",
      label: "SDK write lane enablement accepted disabled sdkWriteEnabled",
      patch: { sdkWriteEnabled: false },
    },
    {
      expectedMessageStart:
        "SDK write lane enablement plannedPathAllowlist must be exactly scripts/provider-contract-smoke.js.",
      label: "SDK write lane enablement accepted a broadened scripts allowlist",
      patch: { plannedPathAllowlist: ["scripts/**"] },
    },
    {
      expectedMessageStart:
        "SDK write lane enablement plannedPathAllowlist must be exactly scripts/provider-contract-smoke.js.",
      label: "SDK write lane enablement accepted an unapproved production script",
      patch: { plannedPathAllowlist: ["scripts/smoke-test.js"] },
    },
    {
      expectedMessageStart:
        "SDK write lane enablement sourceApprovalDecisionPacket must point to .codex-audit/sdk-write-lane-approval-decisions/*.json.",
      label: "SDK write lane enablement accepted an outside approval-decision path",
      patch: { sourceApprovalDecisionPacket: ".codex-audit/not-approval-decision.json" },
    },
    {
      expectedMessageStart: "Unsafe SDK write lane enablement field rejected:",
      label: "SDK write lane enablement accepted unsafe execution options",
      patch: { networkAccessEnabled: true },
    },
  ];

  for (const rejectedCase of laneEnablementRejectedCases) {
    assertRejects(
      () =>
        validateSdkWriteLaneEnablementPacket({
          ...validProductionLaneEnablement,
          ...rejectedCase.patch,
        }),
      rejectedCase.expectedMessageStart,
      failures,
      rejectedCase.label,
    );
  }

  let arbitraryAuditPathAccepted = true;
  try {
    validateOperationEnvelope({
      ...validSdkWriteEnvelope,
      plannedPaths: [".codex-audit/not-the-m115-output.md"],
    });
  } catch {
    arbitraryAuditPathAccepted = false;
  }
  assertContract(
    arbitraryAuditPathAccepted,
    "sdk-write operation envelope rejected a safe arbitrary .codex-audit planned path",
    failures,
  );

  const sdkWriteRejectedPathCases = [
    {
      expectedMessageStart: "Operation envelope plannedPaths outside scope allowlist:",
      label: "sdk-write operation envelope did not reject src path",
      plannedPaths: ["src/index.js"],
    },
    {
      expectedMessageStart: "sdk-write plannedPaths outside docs-audit output allowlist:",
      label: "sdk-write operation envelope did not reject orchestrator path",
      plannedPaths: ["orchestrator/README.md"],
    },
    {
      expectedMessageStart: "Operation envelope plannedPaths include unsafe path shapes:",
      label: "sdk-write operation envelope did not reject unsafe outside path",
      plannedPaths: ["../outside.md"],
    },
    {
      expectedMessageStart: "Operation envelope plannedPaths include forbidden paths:",
      label: "sdk-write operation envelope did not reject root .env path",
      plannedPaths: [".env"],
    },
    {
      expectedMessageStart: "Operation envelope plannedPaths include forbidden paths:",
      label: "sdk-write operation envelope did not reject node_modules path",
      plannedPaths: ["node_modules/pkg/index.js"],
    },
    {
      expectedMessageStart: "Operation envelope plannedPaths include forbidden paths:",
      label: "sdk-write operation envelope did not reject .git path",
      plannedPaths: [".git/config"],
    },
  ];

  for (const sdkWriteRejectedPathCase of sdkWriteRejectedPathCases) {
    assertRejects(
      () =>
        validateOperationEnvelope({
          ...validSdkWriteEnvelope,
          plannedPaths: sdkWriteRejectedPathCase.plannedPaths,
        }),
      sdkWriteRejectedPathCase.expectedMessageStart,
      failures,
      sdkWriteRejectedPathCase.label,
    );
  }

  const orchestratorSdkWriteRejectedPathCases = [
    {
      expectedMessageStart: "sdk-write plannedPaths outside orchestrator controlled-output allowlist:",
      label: "orchestrator sdk-write operation envelope did not reject run-write scaffold source",
      plannedPaths: ["orchestrator/run-write-capable-scaffold.mjs"],
    },
    {
      expectedMessageStart: "sdk-write plannedPaths outside orchestrator controlled-output allowlist:",
      label: "orchestrator sdk-write operation envelope did not reject buffered acceptance source",
      plannedPaths: ["orchestrator/run-buffered-acceptance.mjs"],
    },
    {
      expectedMessageStart: "sdk-write plannedPaths outside orchestrator controlled-output allowlist:",
      label: "orchestrator sdk-write operation envelope did not reject package.json",
      plannedPaths: ["package.json"],
    },
    {
      expectedMessageStart: "Operation envelope plannedPaths outside scope allowlist:",
      label: "orchestrator sdk-write operation envelope did not reject .codex-runtime path",
      plannedPaths: [".codex-runtime/sdk/operations/out.json"],
    },
    {
      expectedMessageStart: "Operation envelope plannedPaths outside scope allowlist:",
      label: "orchestrator sdk-write operation envelope did not reject .codex runtime path",
      plannedPaths: [".codex/sdk/logs/out.json"],
    },
    {
      expectedMessageStart: "Operation envelope plannedPaths outside scope allowlist:",
      label: "orchestrator sdk-write operation envelope did not reject src path",
      plannedPaths: ["src/index.js"],
    },
    {
      expectedMessageStart: "Operation envelope plannedPaths outside scope allowlist:",
      label: "orchestrator sdk-write operation envelope did not reject scripts path",
      plannedPaths: ["scripts/smoke-test.js"],
    },
    {
      expectedMessageStart: "Operation envelope plannedPaths outside scope allowlist:",
      label: "orchestrator sdk-write operation envelope did not reject specs path",
      plannedPaths: ["specs/target-app.md"],
    },
    {
      expectedMessageStart: "Operation envelope plannedPaths outside scope allowlist:",
      label: "orchestrator sdk-write operation envelope did not reject CEP panel path",
      plannedPaths: ["cep-panel/panel.js"],
    },
    {
      expectedMessageStart: "Operation envelope plannedPaths include unsafe path shapes:",
      label: "orchestrator sdk-write operation envelope did not reject unsafe outside path",
      plannedPaths: ["../outside.md"],
    },
    {
      expectedMessageStart: "Operation envelope plannedPaths include forbidden paths:",
      label: "orchestrator sdk-write operation envelope did not reject .git path",
      plannedPaths: [".git/config"],
    },
    {
      expectedMessageStart: "Operation envelope plannedPaths include forbidden paths:",
      label: "orchestrator sdk-write operation envelope did not reject node_modules path",
      plannedPaths: ["node_modules/pkg/index.js"],
    },
    {
      expectedMessageStart: "Operation envelope plannedPaths include forbidden paths:",
      label: "orchestrator sdk-write operation envelope did not reject root .env path",
      plannedPaths: [".env"],
    },
  ];

  for (const extension of [".js", ".mjs", ".ts", ".tsx", ".cmd", ".bat", ".ps1"]) {
    orchestratorSdkWriteRejectedPathCases.push({
      expectedMessageStart: "sdk-write plannedPaths outside orchestrator controlled-output allowlist:",
      label: `orchestrator fixture sdk-write operation envelope did not reject ${extension} path`,
      plannedPaths: [`orchestrator/fixtures/sdk-write/rejected${extension}`],
    });
  }

  for (const sdkWriteRejectedPathCase of orchestratorSdkWriteRejectedPathCases) {
    assertRejects(
      () =>
        validateOperationEnvelope({
          ...validOrchestratorSdkWriteEnvelope,
          plannedPaths: sdkWriteRejectedPathCase.plannedPaths,
        }),
      sdkWriteRejectedPathCase.expectedMessageStart,
      failures,
      sdkWriteRejectedPathCase.label,
    );
  }

  assertRejects(
    () => validateOperationEnvelope({ ...validSdkWriteEnvelope, plannedPaths: [] }),
    "Missing or empty operation envelope plannedPaths.",
    failures,
    "sdk-write operation envelope did not reject empty plannedPaths",
  );

  assertRejects(
    () => validateOperationEnvelope({ ...validOperationEnvelope, prompt: "" }),
    "Missing operation envelope prompt.",
    failures,
    "operation envelope did not reject missing prompt",
  );

  assertRejects(
    () => validateOperationEnvelope({ ...validOperationEnvelope, plannedPaths: [] }),
    "Missing or empty operation envelope plannedPaths.",
    failures,
    "operation envelope did not reject empty plannedPaths",
  );

  assertRejects(
    () =>
      validateOperationEnvelope({
        ...validOperationEnvelope,
        plannedPaths: ["../outside.txt"],
      }),
    "Operation envelope plannedPaths include unsafe path shapes:",
    failures,
    "operation envelope did not reject unsafe planned path shape",
  );

  assertRejects(
    () =>
      validateOperationEnvelope({
        ...validOperationEnvelope,
        plannedPaths: ["node_modules/pkg/index.js"],
      }),
    "Operation envelope plannedPaths include forbidden paths:",
    failures,
    "operation envelope did not reject forbidden planned path",
  );

  assertRejects(
    () =>
      validateOperationEnvelope({
        ...validOperationEnvelope,
        plannedPaths: ["mcp-server/bridge-daemon.js"],
      }),
    "Operation envelope plannedPaths outside scope allowlist:",
    failures,
    "operation envelope did not reject outside-scope planned path",
  );

  assertRejects(
    () => validateOperationEnvelope({ ...validOperationEnvelope, sandboxMode: "workspace-write" }),
    "Unsafe operation envelope field rejected:",
    failures,
    "operation envelope did not reject unsafe bypass-capable fields",
  );

  assertRejects(
    () =>
      validateOperationEnvelope({
        ...validOrchestratorSdkWriteEnvelope,
        sandboxMode: "workspace-write",
      }),
    "Unsafe operation envelope field rejected:",
    failures,
    "orchestrator sdk-write operation envelope did not reject unsafe bypass-capable fields",
  );

  assertRejects(
    () =>
      parseWriteRunnerArgs([
        "--dry-run",
        "--operation-file",
        ".codex-audit/m114-operation-envelope.json",
        "--network",
      ]),
    "Unsafe write-capable runner flag rejected:",
    failures,
    "operation envelope dry-run did not reject unsafe CLI flags",
  );

  const threadOptions = createWriteCapableThreadOptions({ cwd: process.cwd() });
  assertContract(
    threadOptions.sandboxMode === "workspace-write",
    "write runner thread contract is not workspace-write",
    failures,
  );
  assertContract(
    threadOptions.approvalPolicy === "never",
    "write runner thread contract is not approval never",
    failures,
  );
  assertContract(
    threadOptions.networkAccessEnabled === false,
    "write runner thread contract did not disable network",
    failures,
  );
  assertContract(
    threadOptions.webSearchMode === "disabled",
    "write runner thread contract did not disable web search",
    failures,
  );

  const allowedPathCases = [
    ["docs-audit", ".codex-audit/112-sdk-write-capable-runner-scaffold.md"],
    ["docs-audit", "plans/target-app-execplan.md"],
    ["orchestrator", "orchestrator/run-write-capable-scaffold.mjs"],
    ["orchestrator", "package.json"],
    ["production-code", "mcp-server/bridge-daemon.js"],
    ["production-code", "chatgpt-connector/server.js"],
    ["production-code", "scripts/smoke-test.js"],
    ["cep-panel", "cep-panel/panel.js"],
  ];

  for (const [scope, repoPath] of allowedPathCases) {
    assertContract(
      isPathAllowedForScope(scope, repoPath),
      `path should be allowed for ${scope}: ${repoPath}`,
      failures,
    );
  }

  const deniedPathCases = [
    ["docs-audit", "orchestrator/codex-sdk-orchestrator.mjs"],
    ["orchestrator", "mcp-server/bridge-daemon.js"],
    ["production-code", "cep-panel/panel.js"],
    ["cep-panel", "mcp-server/bridge-daemon.js"],
    ["orchestrator", "node_modules/pkg/index.js"],
    ["orchestrator", ".git/config"],
    ["orchestrator", "logs/dev-requests/request.json"],
    ["orchestrator", ".env.local"],
    ["orchestrator", "mcp-config.json"],
  ];

  for (const [scope, repoPath] of deniedPathCases) {
    assertContract(
      !isPathAllowedForScope(scope, repoPath),
      `path should be denied for ${scope}: ${repoPath}`,
      failures,
    );
  }

  const plannedAllowed = createPlannedPathCheck("orchestrator", [
    "orchestrator/run-write-capable-scaffold.mjs",
    "package.json",
  ]);
  assertContract(
    plannedAllowed.allowed &&
      plannedAllowed.allowedPaths.length === 2 &&
      plannedAllowed.violations.length === 0,
    "dry-run planned allowlist check did not allow orchestrator paths",
    failures,
  );

  const plannedForbidden = createPlannedPathCheck("orchestrator", [
    "node_modules/pkg/index.js",
  ]);
  assertContract(
    plannedForbidden.allowed === false &&
      plannedForbidden.violations[0]?.reason === "forbidden-path",
    "dry-run planned path check did not reject forbidden path",
    failures,
  );

  const plannedOutsideScope = createPlannedPathCheck("orchestrator", [
    "mcp-server/bridge-daemon.js",
  ]);
  assertContract(
    plannedOutsideScope.allowed === false &&
      plannedOutsideScope.violations[0]?.reason === "outside-scope-allowlist",
    "dry-run planned path check did not reject outside-scope path",
    failures,
  );

  const plannedUnsafeShape = createPlannedPathCheck("orchestrator", ["../outside.txt"]);
  assertContract(
    plannedUnsafeShape.allowed === false &&
      plannedUnsafeShape.violations[0]?.reason === "unsafe-path-shape",
    "dry-run planned path check did not reject unsafe path shape",
    failures,
  );

  const syntheticCleanSnapshot = {
    changedPaths: [],
    cwd: process.cwd(),
    pathSignatures: {},
  };
  const dryRunAllowed = runWriteCapableDryRun(
    {
      dryRun: true,
      plannedPaths: ["orchestrator/README.md"],
      prompt: "Check local dry-run policy.",
      scope: "orchestrator",
    },
    { captureGitSnapshot: () => syntheticCleanSnapshot },
  );

  assertContract(
    dryRunAllowed.result === "dry-run-allowed" &&
      dryRunAllowed.wouldAllow === true &&
      dryRunAllowed.sdkThreadCreated === false &&
      dryRunAllowed.realWriteWork === false &&
      dryRunAllowed.autoCommit === false,
    "dry-run allowed result did not preserve local-only safety contract",
    failures,
  );

  const dryRunEnvelopeAllowed = runWriteCapableDryRun(
    {
      dryRun: true,
      operationFile: ".codex-audit/m114-operation-envelope.json",
    },
    {
      captureGitSnapshot: () => syntheticCleanSnapshot,
      existsSync: () => true,
      readFileSync: () => JSON.stringify(validOperationEnvelope),
      realpathSync: (value) => value,
      statSync: () => ({ isFile: () => true }),
    },
  );

  assertContract(
    dryRunEnvelopeAllowed.result === "dry-run-allowed" &&
      dryRunEnvelopeAllowed.operationEnvelope?.operationId === "m114-contract-smoke" &&
      dryRunEnvelopeAllowed.sdkThreadCreated === false &&
      dryRunEnvelopeAllowed.realWriteWork === false &&
      dryRunEnvelopeAllowed.autoCommit === false,
    "operation envelope dry-run did not preserve local-only safety report fields",
    failures,
  );

  const dryRunDenied = runWriteCapableDryRun(
    {
      dryRun: true,
      plannedPaths: ["node_modules/pkg/index.js"],
      prompt: "Check local dry-run policy.",
      scope: "orchestrator",
    },
    { captureGitSnapshot: () => syntheticCleanSnapshot },
  );

  assertContract(
    dryRunDenied.result === "dry-run-denied" &&
      dryRunDenied.wouldAllow === false &&
      dryRunDenied.plannedPathCheck.violations[0]?.reason === "forbidden-path",
    "dry-run denied result did not report forbidden planned path",
    failures,
  );

  const dryRunDirtyDenied = runWriteCapableDryRun(
    {
      dryRun: true,
      plannedPaths: ["orchestrator/README.md"],
      prompt: "Check local dry-run policy.",
      scope: "orchestrator",
    },
    {
      captureGitSnapshot: () => ({
        changedPaths: ["orchestrator/README.md"],
        cwd: process.cwd(),
        pathSignatures: {},
      }),
    },
  );

  assertContract(
    dryRunDirtyDenied.result === "dry-run-denied" &&
      dryRunDirtyDenied.preRunGitState.unexpected.includes("orchestrator/README.md"),
    "dry-run did not report unacknowledged pre-run dirty state",
    failures,
  );

  const syntheticPre = {
    pathSignatures: {
      "orchestrator/README.md": "same",
      "test": "pre-only",
    },
  };
  const syntheticPost = {
    pathSignatures: {
      "orchestrator/README.md": "changed",
      "test": "pre-only",
    },
  };
  const changedSincePre = collectPathsChangedSincePre(syntheticPre, syntheticPost);

  assertContract(
    changedSincePre.length === 1 && changedSincePre[0] === "orchestrator/README.md",
    "pre/post snapshot diff comparison did not isolate changed paths",
    failures,
  );

  const postContract = validatePostRunContract({
    postSnapshot: syntheticPost,
    preSnapshot: syntheticPre,
    scope: "orchestrator",
    validationResult: { ok: true },
  });

  assertContract(
    postContract.changedSincePre.includes("orchestrator/README.md"),
    "post-run contract did not report changed path",
    failures,
  );

  const sdkWritePostContract = validateSdkWriteDiffAllowlist({
    plannedPaths: [m115SdkWritePath],
    postSnapshot: {
      pathSignatures: {
        [m115SdkWritePath]: "created",
      },
    },
    preSnapshot: { pathSignatures: {} },
    validationResult: { ok: true },
  });

  assertContract(
    sdkWritePostContract.verdict === "pass" &&
      sdkWritePostContract.actualChangedFiles.join(",") === m115SdkWritePath,
    "sdk-write post-run allowlist did not accept the planned docs-audit output path",
    failures,
  );

  const orchestratorSdkWritePostContract = validateSdkWriteDiffAllowlist({
    plannedPaths: [m123OrchestratorSdkWritePath],
    postSnapshot: {
      pathSignatures: {
        [m123OrchestratorSdkWritePath]: "created",
      },
    },
    preSnapshot: { pathSignatures: {} },
    scope: SDK_WRITE_ORCHESTRATOR_SCOPE,
    validationResult: { ok: true },
  });

  assertContract(
    orchestratorSdkWritePostContract.verdict === "pass" &&
      orchestratorSdkWritePostContract.actualChangedFiles.join(",") ===
        m123OrchestratorSdkWritePath,
    "sdk-write post-run allowlist did not accept the planned orchestrator Markdown output path",
    failures,
  );

  const orchestratorFixtureSdkWritePostContract = validateSdkWriteDiffAllowlist({
    plannedPaths: [m125OrchestratorFixtureSdkWritePath],
    postSnapshot: {
      pathSignatures: {
        [m125OrchestratorFixtureSdkWritePath]: "created",
      },
    },
    preSnapshot: { pathSignatures: {} },
    scope: SDK_WRITE_ORCHESTRATOR_SCOPE,
    validationResult: { ok: true },
  });

  assertContract(
    orchestratorFixtureSdkWritePostContract.verdict === "pass" &&
      orchestratorFixtureSdkWritePostContract.actualChangedFiles.join(",") ===
        m125OrchestratorFixtureSdkWritePath,
    "sdk-write post-run allowlist did not accept the planned orchestrator fixture JSON output path",
    failures,
  );

  const productionCodeSdkWritePostContract = validateSdkWriteDiffAllowlist({
    plannedPaths: SDK_WRITE_PRODUCTION_CODE_PLANNED_PATH_ALLOWLIST,
    postSnapshot: {
      pathSignatures: {
        "scripts/provider-contract-smoke.js": "changed",
      },
    },
    preSnapshot: {
      pathSignatures: {
        "scripts/provider-contract-smoke.js": "before",
      },
    },
    scope: SDK_WRITE_PRODUCTION_CODE_SCOPE,
    validationResult: { ok: true },
  });

  assertContract(
    productionCodeSdkWritePostContract.verdict === "pass" &&
      productionCodeSdkWritePostContract.actualChangedFiles.join(",") ===
        "scripts/provider-contract-smoke.js",
    "sdk-write post-run allowlist did not accept the planned production-code source path",
    failures,
  );

  const fixtureParentDirectory = "orchestrator/fixtures/";
  const createDirectoryChildEnumerator = (childrenByDirectory) => (repoPath) => {
    const normalizedPath = normalizeRepoPath(repoPath);
    const withoutTrailingSlash = normalizedPath.replace(/\/+$/u, "");

    if (Object.hasOwn(childrenByDirectory, normalizedPath)) {
      return childrenByDirectory[normalizedPath];
    }

    if (Object.hasOwn(childrenByDirectory, withoutTrailingSlash)) {
      return childrenByDirectory[withoutTrailingSlash];
    }

    throw new Error(`unexpected directory enumeration request: ${repoPath}`);
  };
  const directoryParentOnlyPostContract = validateSdkWriteDiffAllowlist({
    directoryChildEnumerator: createDirectoryChildEnumerator({
      [fixtureParentDirectory]: [m125OrchestratorFixtureSdkWritePath],
    }),
    plannedPaths: [m125OrchestratorFixtureSdkWritePath],
    postSnapshot: {
      cwd: process.cwd(),
      pathSignatures: {
        [fixtureParentDirectory]: "created",
      },
    },
    preSnapshot: { pathSignatures: {} },
    scope: SDK_WRITE_ORCHESTRATOR_SCOPE,
    validationResult: { ok: true },
  });

  assertContract(
    directoryParentOnlyPostContract.verdict === "pass" &&
      directoryParentOnlyPostContract.actualChangedFiles.join(",") ===
        m125OrchestratorFixtureSdkWritePath &&
      directoryParentOnlyPostContract.normalizedDirectoryEntries.join(",") ===
        fixtureParentDirectory,
    "sdk-write post-run allowlist did not normalize a newly-created parent directory for a planned fixture child",
    failures,
  );

  const directoryParentAndChildPostContract = validateSdkWriteDiffAllowlist({
    directoryChildEnumerator: createDirectoryChildEnumerator({
      [fixtureParentDirectory]: [m125OrchestratorFixtureSdkWritePath],
    }),
    plannedPaths: [m125OrchestratorFixtureSdkWritePath],
    postSnapshot: {
      cwd: process.cwd(),
      pathSignatures: {
        [fixtureParentDirectory]: "created",
        [m125OrchestratorFixtureSdkWritePath]: "created",
      },
    },
    preSnapshot: { pathSignatures: {} },
    scope: SDK_WRITE_ORCHESTRATOR_SCOPE,
    validationResult: { ok: true },
  });

  assertContract(
    directoryParentAndChildPostContract.verdict === "pass" &&
      directoryParentAndChildPostContract.actualChangedFiles.join(",") ===
        m125OrchestratorFixtureSdkWritePath,
    "sdk-write post-run allowlist did not accept parent directory plus exactly one planned child",
    failures,
  );

  assertRejects(
    () =>
      validateSdkWriteDiffAllowlist({
        directoryChildEnumerator: createDirectoryChildEnumerator({
          [fixtureParentDirectory]: [
            m125OrchestratorFixtureSdkWritePath,
            "orchestrator/fixtures/sdk-write/unplanned.json",
          ],
        }),
        plannedPaths: [m125OrchestratorFixtureSdkWritePath],
        postSnapshot: {
          cwd: process.cwd(),
          pathSignatures: {
            [fixtureParentDirectory]: "created",
            [m125OrchestratorFixtureSdkWritePath]: "created",
          },
        },
        preSnapshot: { pathSignatures: {} },
        scope: SDK_WRITE_ORCHESTRATOR_SCOPE,
        validationResult: { ok: true },
      }),
    "Post-run diff outside orchestrator sdk-write allowlist:",
    failures,
    "sdk-write parent directory normalization did not reject an unplanned child",
  );

  assertRejects(
    () =>
      validateSdkWriteDiffAllowlist({
        directoryChildEnumerator: createDirectoryChildEnumerator({
          [fixtureParentDirectory]: [
            m125OrchestratorFixtureSdkWritePath,
            "orchestrator/fixtures/sdk-write/secret.pem",
          ],
        }),
        plannedPaths: [m125OrchestratorFixtureSdkWritePath],
        postSnapshot: {
          cwd: process.cwd(),
          pathSignatures: {
            [fixtureParentDirectory]: "created",
          },
        },
        preSnapshot: { pathSignatures: {} },
        scope: SDK_WRITE_ORCHESTRATOR_SCOPE,
        validationResult: { ok: true },
      }),
    "Forbidden path diff detected after sdk-write run:",
    failures,
    "sdk-write parent directory normalization did not reject a forbidden child",
  );

  assertRejects(
    () =>
      validateSdkWriteDiffAllowlist({
        directoryChildEnumerator: createDirectoryChildEnumerator({
          "src/": ["src/hidden.json"],
        }),
        plannedPaths: [m125OrchestratorFixtureSdkWritePath],
        postSnapshot: {
          cwd: process.cwd(),
          pathSignatures: {
            "src/": "created",
          },
        },
        preSnapshot: { pathSignatures: {} },
        scope: SDK_WRITE_ORCHESTRATOR_SCOPE,
        validationResult: { ok: true },
      }),
    "Post-run diff outside orchestrator sdk-write allowlist:",
    failures,
    "sdk-write parent directory normalization did not reject a src child",
  );

  assertRejects(
    () =>
      validateSdkWriteDiffAllowlist({
        directoryChildEnumerator: createDirectoryChildEnumerator({
          [fixtureParentDirectory]: [
            m125OrchestratorFixtureSdkWritePath,
            "orchestrator/fixtures/sdk-write/.env",
          ],
        }),
        plannedPaths: [m125OrchestratorFixtureSdkWritePath],
        postSnapshot: {
          cwd: process.cwd(),
          pathSignatures: {
            [fixtureParentDirectory]: "created",
          },
        },
        preSnapshot: { pathSignatures: {} },
        scope: SDK_WRITE_ORCHESTRATOR_SCOPE,
        validationResult: { ok: true },
      }),
    "Forbidden path diff detected after sdk-write run:",
    failures,
    "sdk-write parent directory normalization did not reject a .env child",
  );

  for (const extension of [".js", ".mjs", ".ps1", ".cmd", ".bat", ".ts", ".tsx"]) {
    assertRejects(
      () =>
        validateSdkWriteDiffAllowlist({
          directoryChildEnumerator: createDirectoryChildEnumerator({
            [fixtureParentDirectory]: [
              m125OrchestratorFixtureSdkWritePath,
              `orchestrator/fixtures/sdk-write/executable${extension}`,
            ],
          }),
          plannedPaths: [m125OrchestratorFixtureSdkWritePath],
          postSnapshot: {
            cwd: process.cwd(),
            pathSignatures: {
              [fixtureParentDirectory]: "created",
            },
          },
          preSnapshot: { pathSignatures: {} },
          scope: SDK_WRITE_ORCHESTRATOR_SCOPE,
          validationResult: { ok: true },
        }),
      "Post-run diff outside orchestrator sdk-write allowlist:",
      failures,
      `sdk-write parent directory normalization did not reject executable ${extension} child`,
    );
  }

  assertRejects(
    () =>
      validateSdkWriteDiffAllowlist({
        directoryChildEnumerator: createDirectoryChildEnumerator({
          "mcp-server/": ["mcp-server/hidden.json"],
        }),
        plannedPaths: [m125OrchestratorFixtureSdkWritePath],
        postSnapshot: {
          cwd: process.cwd(),
          pathSignatures: {
            "mcp-server/": "created",
          },
        },
        preSnapshot: { pathSignatures: {} },
        scope: SDK_WRITE_ORCHESTRATOR_SCOPE,
        validationResult: { ok: true },
      }),
    "Post-run diff outside orchestrator sdk-write allowlist:",
    failures,
    "sdk-write parent directory normalization did not reject an outside-scope parent directory",
  );

  assertRejects(
    () =>
      validateSdkWriteDiffAllowlist({
        directoryChildEnumerator: createDirectoryChildEnumerator({
          [fixtureParentDirectory]: [],
        }),
        plannedPaths: [m125OrchestratorFixtureSdkWritePath],
        postSnapshot: {
          cwd: process.cwd(),
          pathSignatures: {
            [fixtureParentDirectory]: "created",
          },
        },
        preSnapshot: { pathSignatures: {} },
        scope: SDK_WRITE_ORCHESTRATOR_SCOPE,
        validationResult: { ok: true },
      }),
    "Changed directory contains no planned sdk-write child files:",
    failures,
    "sdk-write parent directory normalization did not reject an empty changed directory",
  );

  assertRejects(
    () =>
      validateSdkWriteDiffAllowlist({
        directoryChildEnumerator: () => {
          throw new Error("synthetic enumeration failure");
        },
        plannedPaths: [m125OrchestratorFixtureSdkWritePath],
        postSnapshot: {
          cwd: process.cwd(),
          pathSignatures: {
            [fixtureParentDirectory]: "created",
          },
        },
        preSnapshot: { pathSignatures: {} },
        scope: SDK_WRITE_ORCHESTRATOR_SCOPE,
        validationResult: { ok: true },
      }),
    "Unable to enumerate changed directory after sdk-write run:",
    failures,
    "sdk-write parent directory normalization did not fail closed on enumeration failure",
  );

  assertRejects(
    () =>
      validateSdkWriteDiffAllowlist({
        plannedPaths: [m115SdkWritePath],
        postSnapshot: {
          pathSignatures: {
            [m115SdkWritePath]: "created",
            "mcp-server/bridge-daemon.js": "changed",
          },
        },
        preSnapshot: { pathSignatures: {} },
        validationResult: { ok: true },
      }),
    "Post-run diff outside docs-audit sdk-write allowlist:",
    failures,
    "sdk-write post-run allowlist did not reject out-of-scope files",
  );

  assertRejects(
    () =>
      validateSdkWriteDiffAllowlist({
        plannedPaths: [m115SdkWritePath],
        postSnapshot: {
          pathSignatures: {
            "orchestrator/README.md": "changed",
          },
        },
        preSnapshot: { pathSignatures: {} },
        validationResult: { ok: true },
      }),
    "Post-run diff outside docs-audit sdk-write allowlist:",
    failures,
    "sdk-write post-run allowlist did not reject orchestrator files",
  );

  assertRejects(
    () =>
      validateSdkWriteDiffAllowlist({
        plannedPaths: [m123OrchestratorSdkWritePath],
        postSnapshot: {
          pathSignatures: {
            "orchestrator/run-write-capable-scaffold.mjs": "changed",
          },
        },
        preSnapshot: { pathSignatures: {} },
        scope: SDK_WRITE_ORCHESTRATOR_SCOPE,
        validationResult: { ok: true },
      }),
    "Post-run diff outside orchestrator sdk-write allowlist:",
    failures,
    "sdk-write post-run allowlist did not reject orchestrator source files",
  );

  assertRejects(
    () =>
      validateSdkWriteDiffAllowlist({
        plannedPaths: [m115SdkWritePath],
        postSnapshot: { pathSignatures: {} },
        preSnapshot: { pathSignatures: {} },
        validationResult: { ok: true },
      }),
    "SDK write did not change planned output path:",
    failures,
    "sdk-write post-run allowlist did not require the planned output path",
  );

  assertRejects(
    () =>
      validatePostRunContract({
        postSnapshot: {
          pathSignatures: {
            "node_modules/pkg/index.js": "changed",
          },
        },
        preSnapshot: { pathSignatures: {} },
        scope: "orchestrator",
        validationResult: { ok: true },
      }),
    "Forbidden path diff detected after write-capable run:",
    failures,
    "post-run contract did not reject forbidden path diff",
  );

  assertRejects(
    () =>
      validatePostRunContract({
        postSnapshot: {
          pathSignatures: {
            "mcp-server/bridge-daemon.js": "changed",
          },
        },
        preSnapshot: { pathSignatures: {} },
        scope: "orchestrator",
        validationResult: { ok: true },
      }),
    "Path allowlist violation after write-capable run:",
    failures,
    "post-run contract did not reject outside-scope path diff",
  );

  assertRejects(
    () =>
      validatePostRunContract({
        postSnapshot: syntheticPost,
        preSnapshot: syntheticPre,
        scope: "orchestrator",
        validationResult: { ok: false },
      }),
    "Hard-stop policy rejected failed validation result.",
    failures,
    "post-run contract did not reject failed validation",
  );

  assertRejects(
    () =>
      assertPreRunGitState(
        { changedPaths: ["orchestrator/README.md", "test"] },
        { acknowledgedExistingChanges: ["orchestrator/README.md"] },
      ),
    "Dirty unexpected git state before write-capable run:",
    failures,
    "pre-run git state did not reject unacknowledged dirty paths",
  );

  if (failures.length > 0) {
    const message = [
      "M136 write-capable scaffold contract smoke failed:",
      ...failures.map((f) => `- ${f}`),
    ].join("\n");
    throw new Error(message);
  }

  return {
    dryRunMode: "pass",
    forbiddenPaths: FORBIDDEN_PATH_PATTERNS,
    operationEnvelopeMode: "pass",
    operationEnvelopeVersion: OPERATION_ENVELOPE_VERSION,
    result: "pass",
    sdkScopeExpansionReviewDirectory: SDK_SCOPE_EXPANSION_REVIEW_DIRECTORY,
    sdkScopeExpansionReviewPacketMode: "pass",
    sdkScopeExpansionReviewRealWriteWork: false,
    sdkScopeExpansionReviewSchema: SDK_SCOPE_EXPANSION_REVIEW_SCHEMA,
    sdkScopeExpansionReviewSdkThreadCreated: false,
    sdkWriteLaneApprovalDecisionApprovalState: SDK_WRITE_LANE_APPROVAL_STATE,
    sdkWriteLaneApprovalDecisionDirectory: SDK_WRITE_LANE_APPROVAL_DECISION_DIRECTORY,
    sdkWriteLaneApprovalDecisionExplicitApprovalRecorded: false,
    sdkWriteLaneApprovalDecisionPacketMode: "pass",
    sdkWriteLaneApprovalDecisionRealWriteWork: false,
    sdkWriteLaneApprovalDecisionSchema: SDK_WRITE_LANE_APPROVAL_DECISION_SCHEMA,
    sdkWriteLaneApprovalDecisionSdkThreadCreated: false,
    sdkWriteLaneEnablementApprovalState: SDK_WRITE_LANE_ENABLEMENT_APPROVAL_STATE,
    sdkWriteLaneEnablementDirectory: SDK_WRITE_LANE_ENABLEMENT_DIRECTORY,
    sdkWriteLaneEnablementExplicitApprovalRecorded: true,
    sdkWriteLaneEnablementPacketMode: "pass",
    sdkWriteLaneEnablementRealWriteWork: false,
    sdkWriteLaneEnablementSchema: SDK_WRITE_LANE_ENABLEMENT_SCHEMA,
    sdkWriteLaneEnablementSdkThreadCreated: false,
    sdkWriteLaneReadinessApprovalState: SDK_WRITE_LANE_APPROVAL_STATE,
    sdkWriteLaneReadinessDirectory: SDK_WRITE_LANE_READINESS_DIRECTORY,
    sdkWriteLaneReadinessPacketMode: "pass",
    sdkWriteLaneReadinessRealWriteWork: false,
    sdkWriteLaneReadinessSchema: SDK_WRITE_LANE_READINESS_SCHEMA,
    sdkWriteLaneReadinessSdkThreadCreated: false,
    sdkWriteLaneReadinessState: SDK_WRITE_LANE_READINESS_STATE,
    sdkWriteDiagnosticsMode: "pass",
    sdkWriteFallbackOperationPath: diagnosticFallbackOperationPath,
    sdkWriteFallbackReportPath: diagnosticLogResult.fallbackReportPath,
    sdkWriteDiagnosticSmokeRealWriteWork: false,
    sdkWriteDiagnosticSmokeSdkThreadCreated: false,
    sdkWriteMode: "pass",
    sdkWriteAllowedScopes: SDK_WRITE_ALLOWED_SCOPES,
    sdkWriteCepPanelEnabled: SDK_WRITE_ALLOWED_SCOPES.includes("cep-panel"),
    sdkWritePathAllowlist: SDK_WRITE_PLANNED_PATH_ALLOWLIST,
    sdkWriteProductionCodeEnabled: SDK_WRITE_ALLOWED_SCOPES.includes("production-code"),
    sdkWriteReviewRequiredScopes: SDK_WRITE_REVIEW_REQUIRED_SCOPES,
    sdkWriteScope: SDK_WRITE_ALLOWED_SCOPE,
    sdkWriteScopeExpansionGate: "pass",
    sdkWriteScopeExpansionRealWriteWork: false,
    sdkWriteScopeExpansionSdkThreadCreated: false,
    sdkWritePlannedPaths: SDK_WRITE_CONTRACT_SMOKE_PLANNED_PATHS,
    sdkWriteOrchestratorControlledOutputs: true,
    sdkWriteOrchestratorFixtureJsonOnly: true,
    sdkWriteOrchestratorFixtureJsonPathAllowlist:
      SDK_WRITE_ORCHESTRATOR_FIXTURE_JSON_PLANNED_PATH_ALLOWLIST,
    sdkWriteOrchestratorMarkdownOnly: false,
    sdkWriteParentDirectoryNormalizationMode: "pass",
    sdkWriteParentDirectoryNormalizationRealWriteWork: false,
    sdkWriteParentDirectoryNormalizationSdkThreadCreated: false,
    sdkWriteOrchestratorPathAllowlist: SDK_WRITE_ORCHESTRATOR_PLANNED_PATH_ALLOWLIST,
    sdkWriteOrchestratorPlannedPaths: SDK_WRITE_ORCHESTRATOR_CONTRACT_SMOKE_PLANNED_PATHS,
    sdkWriteProductionCodePathAllowlist: SDK_WRITE_PRODUCTION_CODE_PLANNED_PATH_ALLOWLIST,
    sdkWriteProductionCodeExistingSourceUpdate: true,
    sdkWriteRuntimeFallbackMode: "pass",
    sdkWriteRuntimeFallbackProbeCleaned: runtimeProbeWrites.every((repoPath) =>
      runtimeProbeDeletes.includes(repoPath),
    ),
    sdkWriteRuntimeFallbackWritable: fallbackRuntimePreflight.fallbackWritable,
    sdkWriteRuntimePrimaryUnavailableFallbackSelected:
      fallbackRuntimePreflight.primaryWritable === false &&
      fallbackRuntimePreflight.selectedRuntimePath === SDK_WRITE_FALLBACK_RUNTIME_DIRECTORY,
    sdkWriteRuntimeSmokeRealWriteWork: false,
    sdkWriteRuntimeSmokeSdkThreadCreated: false,
    sdkWriteSelectedRuntimePath: fallbackRuntimePreflight.selectedRuntimePath,
    scopes: WRITE_SCOPES,
    unsafeFlags: UNSAFE_WRITE_RUNNER_FLAGS,
  };
}

function printResult(result, asJson) {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`Result: ${result.result}`);
  console.log(`Scope: ${result.scope}`);
  if (result.operationEnvelope) {
    console.log(`Operation: ${result.operationEnvelope.operationId}`);
    console.log(`Operation file: ${result.operationEnvelope.sourcePath}`);
  }
  console.log(`SDK thread created: ${result.sdkThreadCreated}`);
  console.log(`Auto-commit: ${result.autoCommit}`);
  if (result.sdkWrite) {
    console.log(`SDK thread completed: ${result.sdkThreadCompleted}`);
    console.log(`Thread id: ${result.sdkThreadId || "(not reported)"}`);
    console.log(`Real write work: ${result.realWriteWork}`);
    console.log(`SDK runtime: ${result.runtimePreflight?.selectedRuntimePath || "(not reported)"}`);
    console.log(`SDK output path: ${result.sdkThreadOutputPath}`);
    console.log(`SDK output file created: ${result.outputFileCreatedBySdk}`);
    console.log(
      `Changed since pre-run: ${
        result.sdkWritePostContract.actualChangedFiles.join(", ") || "(none)"
      }`,
    );
    console.log(`SDK log: ${result.logPath || "(not written)"}`);
    if (result.logWriteError) {
      console.log(`SDK log write error: ${result.logWriteError}`);
    }
    if (result.fallbackReportPath) {
      console.log(`Fallback diagnostic report: ${result.fallbackReportPath}`);
    }
    return;
  }
  if (result.dryRun) {
    console.log(`Real write work: ${result.realWriteWork}`);
    console.log(`Would allow: ${result.wouldAllow}`);
    console.log(
      `Planned paths: ${result.plannedPathCheck.plannedPaths.join(", ") || "(none supplied)"}`,
    );
    console.log(
      `Path violations: ${
        result.plannedPathCheck.violations
          .map((violation) => `${violation.path} (${violation.reason})`)
          .join(", ") || "(none)"
      }`,
    );
    console.log(`Pre-run git state: ${result.preRunGitState.status}`);
    if (result.preRunGitState.unexpected.length > 0) {
      console.log(`Unexpected dirty paths: ${result.preRunGitState.unexpected.join(", ")}`);
    }
    return;
  }
  console.log(`Changed since pre-run: ${result.postContract.changedSincePre.join(", ") || "(none)"}`);
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseWriteRunnerArgs(argv);

  if (options.help) {
    console.log(HELP.trim());
    return;
  }

  if (options.contractSmoke) {
    const result = runWriteCapableContractSmoke();
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log("PASS M136 write-capable runner scaffold contract smoke");
    return;
  }

  const preparedOptions = options.operationFile ? loadOperationEnvelopeOptions(options) : options;
  const result = preparedOptions.dryRun
    ? runWriteCapableDryRun(preparedOptions)
    : preparedOptions.sdkWrite
      ? await runWriteCapableSdkWrite(preparedOptions)
      : await runWriteCapableScaffold(preparedOptions);
  printResult(result, Boolean(options.json));
}

function isMainModule() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
