import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const repo = process.cwd();

const DEFAULT_MILESTONE_PATH = path.join(
  ".codex",
  "milestones",
  "m107-sdk-orchestrator-acceptance-smoke.md",
);

const DEFAULT_REPORT_PATH = path.join(
  ".codex-audit",
  "107-sdk-orchestrator-acceptance-smoke.md",
);

const BUFFERED_ACCEPTANCE_THREAD_OPTIONS = Object.freeze({
  approvalPolicy: "never",
  networkAccessEnabled: false,
  sandboxMode: "read-only",
  webSearchMode: "disabled",
  workingDirectory: repo,
});

const REJECTED_BUFFERED_FLAGS = Object.freeze([
  "approval",
  "external-provider",
  "mutating-live",
  "network",
  "openai-cli-planner",
  "sandbox",
  "skip-git-repo-check",
  "tenant-policy-bypass",
  "web-search",
]);

const SUPPORTED_BUFFERED_FLAGS = new Set(["contract-smoke", "governance-report", "help"]);

function getOptionName(arg) {
  return arg.slice(2).split("=", 1)[0];
}

export function parseBufferedAcceptanceArgs(argv) {
  const options = {};
  const positional = [];

  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const name = getOptionName(arg);

    if (REJECTED_BUFFERED_FLAGS.includes(name)) {
      throw new Error(`Unsafe buffered acceptance flag rejected: --${name}`);
    }

    if (!SUPPORTED_BUFFERED_FLAGS.has(name)) {
      throw new Error(`Unsupported buffered acceptance flag: --${name}`);
    }

    if (arg.includes("=")) {
      throw new Error(`Flag does not accept a value in buffered acceptance mode: --${name}`);
    }

    options[name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = true;
  }

  if (positional.length > 2) {
    throw new Error("Buffered acceptance accepts at most milestone and report paths.");
  }

  return {
    contractSmoke: Boolean(options.contractSmoke),
    governanceReport: Boolean(options.governanceReport),
    help: Boolean(options.help),
    milestonePath: positional[0] ?? DEFAULT_MILESTONE_PATH,
    reportPath: positional[1] ?? DEFAULT_REPORT_PATH,
  };
}

function printHelp() {
  console.log(
    [
      "Buffered Codex SDK acceptance wrapper",
      "",
      "Usage:",
      "  node orchestrator/run-buffered-acceptance.mjs [milestone.md] [report.md]",
      "  node orchestrator/run-buffered-acceptance.mjs --contract-smoke",
      "  node orchestrator/run-buffered-acceptance.mjs --governance-report",
      "",
      "Buffered acceptance mode always forces:",
      '  sandboxMode: "read-only"',
      '  approvalPolicy: "never"',
      "  networkAccessEnabled: false",
      '  webSearchMode: "disabled"',
      "",
      "Unsafe override flags are rejected before any SDK thread is created.",
    ].join("\n"),
  );
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function serialize(value) {
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(
      value,
      (_key, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    );
  } catch {
    return String(value);
  }
}

function sh(command, timeoutMs = 120000) {
  try {
    return execSync(command, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs,
      maxBuffer: 20 * 1024 * 1024,
    }).trim();
  } catch (err) {
    return [
      `COMMAND FAILED: ${command}`,
      err?.stdout ?? "",
      err?.stderr ?? "",
      String(err),
    ].join("\n");
  }
}

function readIfExists(filePath, maxChars = 60000) {
  if (!fs.existsSync(filePath)) {
    return `(missing: ${filePath})`;
  }

  const text = fs.readFileSync(filePath, "utf8");

  if (text.length <= maxChars) {
    return text;
  }

  return [
    text.slice(0, maxChars),
    "",
    `--- TRUNCATED ${filePath}: ${text.length - maxChars} chars omitted ---`,
  ].join("\n");
}

function assertContract(condition, message, failures) {
  if (!condition) {
    failures.push(message);
  }
}

function runNode(args, timeoutMs = 30000) {
  return spawnSync(process.execPath, args, {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: timeoutMs,
  });
}

function collectSdkScopeExpansionReviewPackets(directory, validatePacket) {
  const absoluteDirectory = path.join(repo, directory);
  const failures = [];
  const packets = [];

  if (!fs.existsSync(absoluteDirectory)) {
    return {
      failures: [`missing SDK scope expansion review packet directory: ${directory}`],
      packets,
    };
  }

  for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const absolutePath = path.join(absoluteDirectory, entry.name);
    const repoPath = path.posix.join(directory, entry.name);

    try {
      const packet = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
      const validated = validatePacket(packet);
      packets.push({
        decision: validated.decision,
        path: repoPath,
        plannedPathAllowlist: validated.plannedPathAllowlist,
        scope: validated.scope,
        sdkWriteEnabled: validated.sdkWriteEnabled,
      });
    } catch (error) {
      failures.push(`${repoPath}: ${error.message}`);
    }
  }

  return {
    failures,
    packets: packets.sort((left, right) => left.path.localeCompare(right.path)),
  };
}

function collectSdkWriteLaneReadinessPackets(directory, validatePacket) {
  const absoluteDirectory = path.join(repo, directory);
  const failures = [];
  const packets = [];

  if (!fs.existsSync(absoluteDirectory)) {
    return {
      failures: [`missing SDK write lane readiness packet directory: ${directory}`],
      packets,
    };
  }

  for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const absolutePath = path.join(absoluteDirectory, entry.name);
    const repoPath = path.posix.join(directory, entry.name);

    try {
      const packet = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
      const validated = validatePacket(packet);
      packets.push({
        approvalState: validated.approvalState,
        path: repoPath,
        plannedPathAllowlist: validated.plannedPathAllowlist,
        readiness: validated.readiness,
        scope: validated.scope,
        sdkWriteEnabled: validated.sdkWriteEnabled,
        sourceReviewPacket: validated.sourceReviewPacket,
      });
    } catch (error) {
      failures.push(`${repoPath}: ${error.message}`);
    }
  }

  return {
    failures,
    packets: packets.sort((left, right) => left.path.localeCompare(right.path)),
  };
}

function collectSdkWriteLaneApprovalDecisionPackets(directory, validatePacket) {
  const absoluteDirectory = path.join(repo, directory);
  const failures = [];
  const packets = [];

  if (!fs.existsSync(absoluteDirectory)) {
    return {
      failures: [`missing SDK write lane approval decision packet directory: ${directory}`],
      packets,
    };
  }

  for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const absolutePath = path.join(absoluteDirectory, entry.name);
    const repoPath = path.posix.join(directory, entry.name);

    try {
      const packet = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
      const validated = validatePacket(packet);
      packets.push({
        approvalState: validated.approvalState,
        explicitApprovalRecorded: validated.explicitApprovalRecorded,
        path: repoPath,
        plannedPathAllowlist: validated.plannedPathAllowlist,
        rawPacket: packet,
        scope: validated.scope,
        sdkWriteEnabled: validated.sdkWriteEnabled,
        sourceReadinessPacket: validated.sourceReadinessPacket,
        sourceReviewPacket: validated.sourceReviewPacket,
      });
    } catch (error) {
      failures.push(`${repoPath}: ${error.message}`);
    }
  }

  return {
    failures,
    packets: packets.sort((left, right) => left.path.localeCompare(right.path)),
  };
}

function collectSdkWriteLaneEnablementPackets(directory, validatePacket) {
  const absoluteDirectory = path.join(repo, directory);
  const failures = [];
  const packets = [];

  if (!fs.existsSync(absoluteDirectory)) {
    return {
      failures: [`missing SDK write lane enablement packet directory: ${directory}`],
      packets,
    };
  }

  for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const absolutePath = path.join(absoluteDirectory, entry.name);
    const repoPath = path.posix.join(directory, entry.name);

    try {
      const packet = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
      const validated = validatePacket(packet);
      packets.push({
        approvalState: validated.approvalState,
        explicitApprovalRecorded: validated.explicitApprovalRecorded,
        path: repoPath,
        plannedPathAllowlist: validated.plannedPathAllowlist,
        rawPacket: packet,
        scope: validated.scope,
        sdkWriteEnabled: validated.sdkWriteEnabled,
        sourceApprovalDecisionPacket: validated.sourceApprovalDecisionPacket,
        sourceReadinessPacket: validated.sourceReadinessPacket,
        sourceReviewPacket: validated.sourceReviewPacket,
      });
    } catch (error) {
      failures.push(`${repoPath}: ${error.message}`);
    }
  }

  return {
    failures,
    packets: packets.sort((left, right) => left.path.localeCompare(right.path)),
  };
}

function collectSdkLaunchGovernancePackets(directory, validatePacket) {
  const absoluteDirectory = path.join(repo, directory);
  const failures = [];
  const packets = [];

  if (!fs.existsSync(absoluteDirectory)) {
    return {
      failures: [`missing SDK launch governance packet directory: ${directory}`],
      packets,
    };
  }

  for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const absolutePath = path.join(absoluteDirectory, entry.name);
    const repoPath = path.posix.join(directory, entry.name);

    try {
      const packet = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
      const validated = validatePacket(packet);
      packets.push({
        allowedSdkWriteScopes: validated.allowedSdkWriteScopes,
        broadProductionCodeWritesApproved: validated.broadProductionCodeWritesApproved,
        cepPanelSdkWriteEnabled: validated.cepPanelSdkWriteEnabled,
        externalNetworkRetryApproved: validated.externalNetworkRetryApproved,
        newSdkThreadRunApproved: validated.newSdkThreadRunApproved,
        path: repoPath,
        productionCodePlannedPathAllowlist: validated.productionCodePlannedPathAllowlist,
        rawPacket: packet,
        reviewRequiredScopes: validated.reviewRequiredScopes,
        sourceMilestones: validated.sourceMilestones,
        state: validated.state,
      });
    } catch (error) {
      failures.push(`${repoPath}: ${error.message}`);
    }
  }

  return {
    failures,
    packets: packets.sort((left, right) => left.path.localeCompare(right.path)),
  };
}

async function buildCommittedSdkLaunchGovernanceReport() {
  const {
    SDK_LAUNCH_GOVERNANCE_DIRECTORY,
    SDK_WRITE_LANE_ENABLEMENT_DIRECTORY,
    buildSdkLaunchGovernanceDriftReport,
  } = await import("./run-write-capable-scaffold.mjs");
  const launchGovernancePacketPath = path.posix.join(
    SDK_LAUNCH_GOVERNANCE_DIRECTORY,
    "152-sdk-production-code-provider-smokes-governance.json",
  );
  const productionLaneEnablementPacketPath = path.posix.join(
    SDK_WRITE_LANE_ENABLEMENT_DIRECTORY,
    "152-production-code-provider-smokes-enable.json",
  );
  const launchGovernancePacket = JSON.parse(
    fs.readFileSync(path.join(repo, launchGovernancePacketPath), "utf8"),
  );
  const productionLaneEnablementPacket = JSON.parse(
    fs.readFileSync(path.join(repo, productionLaneEnablementPacketPath), "utf8"),
  );
  const report = buildSdkLaunchGovernanceDriftReport({
    launchGovernancePacket,
    productionLaneEnablementPacket,
  });

  return {
    ...report,
    launchGovernancePacketPath,
    productionLaneEnablementPacketPath,
  };
}

async function runContractSmoke() {
  const failures = [];
  const helpResult = runNode([path.join("orchestrator", "codex-sdk-orchestrator.mjs"), "--help"]);
  const helpOutput = `${helpResult.stdout ?? ""}\n${helpResult.stderr ?? ""}`;

  assertContract(helpResult.status === 0, "codex orchestrator help command failed", failures);
  assertContract(helpOutput.includes("Codex SDK orchestrator"), "help output missing title", failures);
  assertContract(helpOutput.includes("--sandbox <mode>"), "help output missing sandbox option", failures);
  assertContract(helpOutput.includes("--web-search <mode>"), "help output missing web-search option", failures);

  const { CLI_VALUE_CHOICES, createThreadOptions, parseArgs } = await import(
    "./codex-sdk-orchestrator.mjs"
  );
  const {
    FORBIDDEN_PATH_PATTERNS,
    SDK_MULTI_FILE_PLANNED_OPERATION_CONTRACT_SCHEMA,
    SDK_MULTI_FILE_PLANNED_OPERATION_DIRECTORY,
    SDK_LAUNCH_GOVERNANCE_DIRECTORY,
    SDK_LAUNCH_GOVERNANCE_DRIFT_REPORT_SCHEMA,
    SDK_LAUNCH_GOVERNANCE_SCHEMA,
    SDK_LAUNCH_GOVERNANCE_STATE,
    SDK_SCOPE_EXPANSION_REVIEW_DIRECTORY,
    SDK_SCOPE_EXPANSION_REVIEW_SCHEMA,
    SDK_WRITE_LANE_APPROVAL_DECISION_DIRECTORY,
    SDK_WRITE_LANE_APPROVAL_DECISION_SCHEMA,
    SDK_WRITE_LANE_APPROVAL_STATE,
    SDK_WRITE_LANE_ENABLEMENT_APPROVAL_STATE,
    SDK_WRITE_LANE_ENABLEMENT_DIRECTORY,
    SDK_WRITE_LANE_ENABLEMENT_SCHEMA,
    SDK_WRITE_LANE_READINESS_DIRECTORY,
    SDK_WRITE_LANE_READINESS_SCHEMA,
    SDK_WRITE_LANE_READINESS_STATE,
    SDK_WRITE_ALLOWED_SCOPES,
    SDK_WRITE_ORCHESTRATOR_FIXTURE_JSON_PLANNED_PATH_ALLOWLIST,
    SDK_WRITE_ORCHESTRATOR_MULTI_FILE_CONTRACT_PLANNED_PATHS,
    SDK_WRITE_ORCHESTRATOR_PLANNED_PATH_ALLOWLIST,
    SDK_WRITE_PLANNED_PATH_ALLOWLIST,
    SDK_WRITE_PRODUCTION_CODE_LEGACY_SINGLE_FILE_PLANNED_PATH_ALLOWLIST,
    SDK_WRITE_PRODUCTION_CODE_PLANNED_PATH_ALLOWLIST,
    SDK_WRITE_PRODUCTION_CODE_SCOPE,
    SDK_WRITE_REVIEW_REQUIRED_SCOPES,
    SCOPE_PATH_ALLOWLISTS,
    UNSAFE_WRITE_RUNNER_FLAGS,
    WRITE_SCOPES,
    buildSdkLaunchGovernanceDriftReport,
    runWriteCapableContractSmoke,
    validateSdkScopeExpansionReviewPacket,
    validateSdkLaunchGovernancePacket,
    validateSdkWriteLaneApprovalDecisionPacket,
    validateSdkWriteLaneEnablementPacket,
    validateSdkWriteLaneReadinessPacket,
  } = await import("./run-write-capable-scaffold.mjs");
  const safeDefaults = createThreadOptions({});

  assertContract(
    safeDefaults.approvalPolicy === "never",
    "orchestrator default approvalPolicy is not never",
    failures,
  );
  assertContract(
    safeDefaults.networkAccessEnabled === false,
    "orchestrator default networkAccessEnabled is not false",
    failures,
  );
  assertContract(
    safeDefaults.sandboxMode === "read-only",
    "orchestrator default sandboxMode is not read-only",
    failures,
  );
  assertContract(
    safeDefaults.webSearchMode === "disabled",
    "orchestrator default webSearchMode is not disabled",
    failures,
  );
  assertContract(
    CLI_VALUE_CHOICES.sandbox.includes("read-only") &&
      CLI_VALUE_CHOICES.sandbox.includes("workspace-write") &&
      CLI_VALUE_CHOICES.sandbox.includes("danger-full-access"),
    "orchestrator sandbox value choices are incomplete",
    failures,
  );
  assertContract(
    CLI_VALUE_CHOICES.approval.includes("never") &&
      CLI_VALUE_CHOICES.approval.includes("on-request") &&
      CLI_VALUE_CHOICES.approval.includes("on-failure") &&
      CLI_VALUE_CHOICES.approval.includes("untrusted"),
    "orchestrator approval value choices are incomplete",
    failures,
  );
  assertContract(
    CLI_VALUE_CHOICES.webSearch.includes("disabled") &&
      CLI_VALUE_CHOICES.webSearch.includes("cached") &&
      CLI_VALUE_CHOICES.webSearch.includes("live"),
    "orchestrator web-search value choices are incomplete",
    failures,
  );

  const validCliValueCases = [
    ["--prompt", "contract smoke", "--sandbox", "workspace-write"],
    ["--prompt", "contract smoke", "--sandbox=danger-full-access"],
    ["--prompt", "contract smoke", "--approval", "on-failure"],
    ["--prompt", "contract smoke", "--approval=on-request"],
    ["--prompt", "contract smoke", "--web-search", "cached"],
    ["--prompt", "contract smoke", "--web-search=live"],
  ];

  for (const validArgs of validCliValueCases) {
    let accepted = true;
    try {
      parseArgs(validArgs);
    } catch {
      accepted = false;
    }

    assertContract(
      accepted,
      `general CLI rejected valid value args during local parse: ${validArgs.join(" ")}`,
      failures,
    );
  }

  const deterministicBooleanCases = [
    { args: ["--prompt", "contract smoke", "--network"], key: "network", value: true },
    { args: ["--prompt", "contract smoke", "--network=false"], key: "network", value: false },
    {
      args: ["--prompt", "contract smoke", "--skip-git-repo-check"],
      key: "skipGitRepoCheck",
      value: true,
    },
    {
      args: ["--prompt", "contract smoke", "--skip-git-repo-check=false"],
      key: "skipGitRepoCheck",
      value: false,
    },
  ];

  for (const booleanCase of deterministicBooleanCases) {
    const parsed = parseArgs(booleanCase.args);
    assertContract(
      parsed[booleanCase.key] === booleanCase.value,
      `general CLI boolean parse mismatch for ${booleanCase.args.join(" ")}`,
      failures,
    );
  }

  const invalidCliValueCases = [
    ["--prompt", "contract smoke", "--sandbox", "writable"],
    ["--prompt", "contract smoke", "--sandbox="],
    ["--prompt", "contract smoke", "--approval", "always"],
    ["--prompt", "contract smoke", "--approval="],
    ["--prompt", "contract smoke", "--web-search", "enabled"],
    ["--prompt", "contract smoke", "--web-search="],
    ["--prompt", "contract smoke", "--network=enabled"],
    ["--prompt", "contract smoke", "--skip-git-repo-check=yes"],
  ];

  for (const invalidArgs of invalidCliValueCases) {
    let rejected = false;
    try {
      parseArgs(invalidArgs);
    } catch (error) {
      rejected =
        error instanceof Error &&
        (error.message.startsWith("Invalid value for --") ||
          error.message.startsWith("Missing value for --"));
    }

    assertContract(
      rejected,
      `general CLI did not reject invalid value args during local parse: ${invalidArgs.join(" ")}`,
      failures,
    );
  }

  const unsafeArgCases = [
    ["--sandbox", "danger-full-access"],
    ["--sandbox=danger-full-access"],
    ["--approval", "on-request"],
    ["--approval=on-request"],
    ["--network"],
    ["--web-search", "live"],
    ["--web-search=live"],
    ["--skip-git-repo-check"],
    ["--external-provider"],
    ["--openai-cli-planner"],
    ["--mutating-live"],
    ["--tenant-policy-bypass"],
  ];

  for (const unsafeArgs of unsafeArgCases) {
    let rejected = false;
    try {
      parseBufferedAcceptanceArgs(unsafeArgs);
    } catch (error) {
      rejected =
        error instanceof Error &&
        error.message.startsWith("Unsafe buffered acceptance flag rejected:");
    }

    assertContract(
      rejected,
      `buffered acceptance did not reject unsafe args: ${unsafeArgs.join(" ")}`,
      failures,
    );
  }

  assertContract(
    BUFFERED_ACCEPTANCE_THREAD_OPTIONS.approvalPolicy === "never",
    "buffered acceptance approvalPolicy is not forced to never",
    failures,
  );
  assertContract(
    BUFFERED_ACCEPTANCE_THREAD_OPTIONS.networkAccessEnabled === false,
    "buffered acceptance network access is not forced off",
    failures,
  );
  assertContract(
    BUFFERED_ACCEPTANCE_THREAD_OPTIONS.sandboxMode === "read-only",
    "buffered acceptance sandbox is not forced to read-only",
    failures,
  );
  assertContract(
    BUFFERED_ACCEPTANCE_THREAD_OPTIONS.webSearchMode === "disabled",
    "buffered acceptance web search is not forced disabled",
    failures,
  );

  let writeScaffoldSmoke = null;
  try {
    writeScaffoldSmoke = runWriteCapableContractSmoke();
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  assertContract(
    writeScaffoldSmoke?.result === "pass",
    "M112 write-capable scaffold contract smoke did not pass",
    failures,
  );
  assertContract(
    writeScaffoldSmoke?.dryRunMode === "pass",
    "M113 write-capable local dry-run contract smoke did not pass",
    failures,
  );
  assertContract(
    writeScaffoldSmoke?.operationEnvelopeMode === "pass" &&
      writeScaffoldSmoke?.operationEnvelopeVersion === 1,
    "M114 write-capable operation envelope contract smoke did not pass",
    failures,
  );
  assertContract(
    writeScaffoldSmoke?.sdkWriteMode === "pass" &&
      writeScaffoldSmoke?.sdkWriteScope === "docs-audit" &&
      writeScaffoldSmoke?.sdkWriteAllowedScopes?.join(",") ===
        "docs-audit,orchestrator,production-code" &&
      writeScaffoldSmoke?.sdkWritePathAllowlist?.includes(".codex-audit/**") &&
      writeScaffoldSmoke?.sdkWritePlannedPaths?.includes(
        ".codex-audit/115-sdk-docs-audit-sdk-thread-output.md",
      ) &&
      writeScaffoldSmoke?.sdkWritePlannedPaths?.includes(
        ".codex-audit/117-sdk-docs-audit-sdk-thread-output.md",
      ) &&
      writeScaffoldSmoke?.sdkWritePlannedPaths?.includes(
        ".codex-audit/arbitrary-safe-sdk-write-output.md",
      ),
    "M117R write-capable docs-audit sdk-write contract smoke did not pass",
    failures,
  );
  assertContract(
    writeScaffoldSmoke?.sdkWriteOrchestratorControlledOutputs === true &&
      writeScaffoldSmoke?.sdkWriteOrchestratorPathAllowlist?.join(",") === "orchestrator/**" &&
      writeScaffoldSmoke?.sdkWriteOrchestratorPlannedPaths?.includes(
        "orchestrator/m123-sdk-thread-orchestrator-scope-output.md",
      ) &&
      writeScaffoldSmoke?.sdkWriteOrchestratorPlannedPaths?.includes(
        "orchestrator/arbitrary-safe-sdk-write-output.md",
      ) &&
      writeScaffoldSmoke?.sdkWriteOrchestratorFixtureJsonOnly === true &&
      writeScaffoldSmoke?.sdkWriteOrchestratorFixtureJsonPathAllowlist?.join(",") ===
        "orchestrator/fixtures/sdk-write/**" &&
      writeScaffoldSmoke?.sdkWriteOrchestratorPlannedPaths?.includes(
        "orchestrator/fixtures/sdk-write/m125-sdk-thread-fixture.json",
      ) &&
      writeScaffoldSmoke?.sdkWriteOrchestratorPlannedPaths?.includes(
        "orchestrator/fixtures/sdk-write/arbitrary-safe-sdk-write-fixture.json",
      ),
    "M125 write-capable orchestrator controlled-output sdk-write contract smoke did not pass",
    failures,
  );
  assertContract(
    writeScaffoldSmoke?.sdkWriteDiagnosticsMode === "pass" &&
      writeScaffoldSmoke?.sdkWriteFallbackReportPath?.startsWith(".codex-audit/") &&
      writeScaffoldSmoke?.sdkWriteFallbackOperationPath?.startsWith(
        ".codex-runtime/sdk/operations/",
      ) &&
      writeScaffoldSmoke?.sdkWriteDiagnosticSmokeSdkThreadCreated === false &&
      writeScaffoldSmoke?.sdkWriteDiagnosticSmokeRealWriteWork === false,
    "M116 sdk-write diagnostic logging fallback contract smoke did not pass",
    failures,
  );
  assertContract(
    writeScaffoldSmoke?.sdkWriteRuntimeFallbackMode === "pass" &&
      writeScaffoldSmoke?.sdkWriteRuntimePrimaryUnavailableFallbackSelected === true &&
      writeScaffoldSmoke?.sdkWriteRuntimeFallbackWritable === true &&
      writeScaffoldSmoke?.sdkWriteRuntimeFallbackProbeCleaned === true &&
      writeScaffoldSmoke?.sdkWriteRuntimeSmokeSdkThreadCreated === false &&
      writeScaffoldSmoke?.sdkWriteRuntimeSmokeRealWriteWork === false,
    "M120 sdk runtime fallback contract smoke did not pass",
    failures,
  );
  assertContract(
    writeScaffoldSmoke?.sdkWriteParentDirectoryNormalizationMode === "pass" &&
      writeScaffoldSmoke?.sdkWriteParentDirectoryNormalizationSdkThreadCreated === false &&
      writeScaffoldSmoke?.sdkWriteParentDirectoryNormalizationRealWriteWork === false,
    "M125 sdk-write parent directory normalization contract smoke did not pass",
    failures,
  );
  assertContract(
    writeScaffoldSmoke?.sdkWriteScopeExpansionGate === "pass" &&
      writeScaffoldSmoke?.sdkWriteProductionCodeEnabled === true &&
      writeScaffoldSmoke?.sdkWriteCepPanelEnabled === false &&
      writeScaffoldSmoke?.sdkWriteProductionCodePathAllowlist?.join(",") ===
        SDK_WRITE_PRODUCTION_CODE_PLANNED_PATH_ALLOWLIST.join(",") &&
      writeScaffoldSmoke?.sdkWriteProductionCodeExistingSourceUpdate === true &&
      writeScaffoldSmoke?.sdkWriteReviewRequiredScopes?.join(",") ===
        SDK_WRITE_REVIEW_REQUIRED_SCOPES.join(",") &&
      writeScaffoldSmoke?.sdkWriteScopeExpansionSdkThreadCreated === false &&
      writeScaffoldSmoke?.sdkWriteScopeExpansionRealWriteWork === false,
    "M135 sdk-write scope expansion gate did not keep production-code narrow and CEP-panel disabled",
    failures,
  );
  assertContract(
    writeScaffoldSmoke?.sdkScopeExpansionReviewPacketMode === "pass" &&
      writeScaffoldSmoke?.sdkScopeExpansionReviewSchema === SDK_SCOPE_EXPANSION_REVIEW_SCHEMA &&
      writeScaffoldSmoke?.sdkScopeExpansionReviewDirectory === SDK_SCOPE_EXPANSION_REVIEW_DIRECTORY &&
      writeScaffoldSmoke?.sdkScopeExpansionReviewSdkThreadCreated === false &&
      writeScaffoldSmoke?.sdkScopeExpansionReviewRealWriteWork === false,
    "M128 SDK scope expansion review packet contract smoke did not pass",
    failures,
  );
  assertContract(
    writeScaffoldSmoke?.sdkWriteLaneReadinessPacketMode === "pass" &&
      writeScaffoldSmoke?.sdkWriteLaneReadinessSchema === SDK_WRITE_LANE_READINESS_SCHEMA &&
      writeScaffoldSmoke?.sdkWriteLaneReadinessDirectory === SDK_WRITE_LANE_READINESS_DIRECTORY &&
      writeScaffoldSmoke?.sdkWriteLaneReadinessState === SDK_WRITE_LANE_READINESS_STATE &&
      writeScaffoldSmoke?.sdkWriteLaneReadinessApprovalState === SDK_WRITE_LANE_APPROVAL_STATE &&
      writeScaffoldSmoke?.sdkWriteLaneReadinessSdkThreadCreated === false &&
      writeScaffoldSmoke?.sdkWriteLaneReadinessRealWriteWork === false,
    "M133 SDK write lane readiness packet contract smoke did not pass",
    failures,
  );
  assertContract(
    writeScaffoldSmoke?.sdkWriteLaneApprovalDecisionPacketMode === "pass" &&
      writeScaffoldSmoke?.sdkWriteLaneApprovalDecisionSchema ===
        SDK_WRITE_LANE_APPROVAL_DECISION_SCHEMA &&
      writeScaffoldSmoke?.sdkWriteLaneApprovalDecisionDirectory ===
        SDK_WRITE_LANE_APPROVAL_DECISION_DIRECTORY &&
      writeScaffoldSmoke?.sdkWriteLaneApprovalDecisionApprovalState ===
        SDK_WRITE_LANE_APPROVAL_STATE &&
      writeScaffoldSmoke?.sdkWriteLaneApprovalDecisionExplicitApprovalRecorded === false &&
      writeScaffoldSmoke?.sdkWriteLaneApprovalDecisionSdkThreadCreated === false &&
      writeScaffoldSmoke?.sdkWriteLaneApprovalDecisionRealWriteWork === false,
    "M134 SDK write lane approval decision packet contract smoke did not pass",
    failures,
  );
  assertContract(
    writeScaffoldSmoke?.sdkWriteLaneEnablementPacketMode === "pass" &&
      writeScaffoldSmoke?.sdkWriteLaneEnablementSchema === SDK_WRITE_LANE_ENABLEMENT_SCHEMA &&
      writeScaffoldSmoke?.sdkWriteLaneEnablementDirectory ===
        SDK_WRITE_LANE_ENABLEMENT_DIRECTORY &&
      writeScaffoldSmoke?.sdkWriteLaneEnablementApprovalState ===
        SDK_WRITE_LANE_ENABLEMENT_APPROVAL_STATE &&
      writeScaffoldSmoke?.sdkWriteLaneEnablementExplicitApprovalRecorded === true &&
      writeScaffoldSmoke?.sdkWriteLaneEnablementSdkThreadCreated === false &&
      writeScaffoldSmoke?.sdkWriteLaneEnablementRealWriteWork === false,
    "M135 SDK write lane enablement packet contract smoke did not pass",
    failures,
  );
  assertContract(
    writeScaffoldSmoke?.sdkLaunchGovernancePacketMode === "pass" &&
      writeScaffoldSmoke?.sdkLaunchGovernanceSchema === SDK_LAUNCH_GOVERNANCE_SCHEMA &&
      writeScaffoldSmoke?.sdkLaunchGovernanceDirectory === SDK_LAUNCH_GOVERNANCE_DIRECTORY &&
      writeScaffoldSmoke?.sdkLaunchGovernanceState === SDK_LAUNCH_GOVERNANCE_STATE &&
      writeScaffoldSmoke?.sdkLaunchGovernanceSdkThreadCreated === false &&
      writeScaffoldSmoke?.sdkLaunchGovernanceRealWriteWork === false,
    "M140 SDK launch governance packet contract smoke did not pass",
    failures,
  );
  assertContract(
    writeScaffoldSmoke?.sdkLaunchGovernanceDriftReportMode === "pass" &&
      writeScaffoldSmoke?.sdkLaunchGovernanceDriftReportSchema ===
        SDK_LAUNCH_GOVERNANCE_DRIFT_REPORT_SCHEMA &&
      writeScaffoldSmoke?.sdkLaunchGovernanceDriftDetected === false,
    "M141 SDK launch governance drift report contract smoke did not pass",
    failures,
  );
  assertContract(
    parseBufferedAcceptanceArgs(["--governance-report"]).governanceReport === true,
    "M142 governance-report flag is not accepted by buffered acceptance parser",
    failures,
  );
  const governanceReportParserSmoke = runNode([
    path.join("scripts", "sdk-governance-report-smoke.js"),
  ]);
  const governanceReportParserOutput = `${governanceReportParserSmoke.stdout ?? ""}\n${
    governanceReportParserSmoke.stderr ?? ""
  }`;
  assertContract(
    governanceReportParserSmoke.status === 0 &&
      governanceReportParserOutput.includes("SDK governance report parser smoke: pass"),
    `M143 SDK governance report parser smoke failed: ${governanceReportParserOutput.trim()}`,
    failures,
  );
  const productionCodeBroaderSmoke = runNode([
    path.join("scripts", "sdk-production-code-broader-readiness-smoke.js"),
  ]);
  const productionCodeBroaderOutput = `${productionCodeBroaderSmoke.stdout ?? ""}\n${
    productionCodeBroaderSmoke.stderr ?? ""
  }`;
  assertContract(
    productionCodeBroaderSmoke.status === 0 &&
      productionCodeBroaderOutput.includes("SDK production-code broader readiness smoke: pass"),
    `M152 SDK production-code broader readiness smoke failed: ${productionCodeBroaderOutput.trim()}`,
    failures,
  );
  const nextLaneSmoke = runNode([
    path.join("scripts", "sdk-next-lane-selection-smoke.js"),
  ]);
  const nextLaneOutput = `${nextLaneSmoke.stdout ?? ""}\n${nextLaneSmoke.stderr ?? ""}`;
  assertContract(
    nextLaneSmoke.status === 0 && nextLaneOutput.includes("SDK next-lane selection smoke: pass"),
    `M153 SDK next-lane selection smoke failed: ${nextLaneOutput.trim()}`,
    failures,
  );
  const milestoneConveyorSpecSmoke = runNode([
    path.join("scripts", "sdk-milestone-conveyor-spec-smoke.js"),
  ]);
  const milestoneConveyorSpecOutput = `${milestoneConveyorSpecSmoke.stdout ?? ""}\n${
    milestoneConveyorSpecSmoke.stderr ?? ""
  }`;
  assertContract(
    milestoneConveyorSpecSmoke.status === 0 &&
      milestoneConveyorSpecOutput.includes("SDK milestone conveyor spec smoke: pass"),
    `M154 SDK milestone conveyor spec smoke failed: ${milestoneConveyorSpecOutput.trim()}`,
    failures,
  );
  const milestoneConveyorDryRunSmoke = runNode([
    path.join("scripts", "sdk-milestone-conveyor-local-dry-run-smoke.js"),
  ]);
  const milestoneConveyorDryRunOutput = `${milestoneConveyorDryRunSmoke.stdout ?? ""}\n${
    milestoneConveyorDryRunSmoke.stderr ?? ""
  }`;
  assertContract(
    milestoneConveyorDryRunSmoke.status === 0 &&
      milestoneConveyorDryRunOutput.includes(
        "SDK milestone conveyor local dry-run smoke: pass",
      ),
    `M155 SDK milestone conveyor local dry-run smoke failed: ${milestoneConveyorDryRunOutput.trim()}`,
    failures,
  );
  const milestoneConveyorSdkThreadProofSmoke = runNode([
    path.join("scripts", "sdk-milestone-conveyor-sdkthread-proof-smoke.js"),
  ]);
  const milestoneConveyorSdkThreadProofOutput = `${
    milestoneConveyorSdkThreadProofSmoke.stdout ?? ""
  }\n${milestoneConveyorSdkThreadProofSmoke.stderr ?? ""}`;
  assertContract(
    milestoneConveyorSdkThreadProofSmoke.status === 0 &&
      milestoneConveyorSdkThreadProofOutput.includes(
        "SDK milestone conveyor SDKThread proof smoke: pass",
      ),
    `M156 SDK milestone conveyor SDKThread proof smoke failed: ${milestoneConveyorSdkThreadProofOutput.trim()}`,
    failures,
  );
  const milestoneConveyorLoopGateSmoke = runNode([
    path.join("scripts", "sdk-milestone-conveyor-loop-gate-smoke.js"),
  ]);
  const milestoneConveyorLoopGateOutput = `${milestoneConveyorLoopGateSmoke.stdout ?? ""}\n${
    milestoneConveyorLoopGateSmoke.stderr ?? ""
  }`;
  assertContract(
    milestoneConveyorLoopGateSmoke.status === 0 &&
      milestoneConveyorLoopGateOutput.includes(
        "SDK milestone conveyor loop gate smoke: pass",
      ),
    `M157 SDK milestone conveyor loop gate smoke failed: ${milestoneConveyorLoopGateOutput.trim()}`,
    failures,
  );
  const extractionCleanupSmoke = runNode([
    path.join("scripts", "sdk-orchestrator-extraction-cleanup-smoke.js"),
  ]);
  const extractionCleanupOutput = `${extractionCleanupSmoke.stdout ?? ""}\n${
    extractionCleanupSmoke.stderr ?? ""
  }`;
  assertContract(
    extractionCleanupSmoke.status === 0 &&
      extractionCleanupOutput.includes("SDK orchestrator extraction cleanup smoke: pass"),
    `M158 SDK orchestrator extraction cleanup smoke failed: ${extractionCleanupOutput.trim()}`,
    failures,
  );
  const inventoryFreezeSmoke = runNode([
    path.join("scripts", "sdk-orchestrator-inventory-freeze-smoke.js"),
  ]);
  const inventoryFreezeOutput = `${inventoryFreezeSmoke.stdout ?? ""}\n${
    inventoryFreezeSmoke.stderr ?? ""
  }`;
  assertContract(
    inventoryFreezeSmoke.status === 0 &&
      inventoryFreezeOutput.includes("SDK orchestrator inventory freeze smoke: pass"),
    `M159 SDK orchestrator inventory freeze smoke failed: ${inventoryFreezeOutput.trim()}`,
    failures,
  );
  const reusableCoreSmoke = runNode([
    path.join("scripts", "sdk-reusable-core-extraction-smoke.js"),
  ]);
  const reusableCoreOutput = `${reusableCoreSmoke.stdout ?? ""}\n${
    reusableCoreSmoke.stderr ?? ""
  }`;
  assertContract(
    reusableCoreSmoke.status === 0 &&
      reusableCoreOutput.includes("SDK reusable core extraction smoke: pass"),
    `M160 SDK reusable core extraction smoke failed: ${reusableCoreOutput.trim()}`,
    failures,
  );
  const adapterConfigSmoke = runNode([
    path.join("scripts", "sdk-ae-agent-adapter-config-smoke.js"),
  ]);
  const adapterConfigOutput = `${adapterConfigSmoke.stdout ?? ""}\n${
    adapterConfigSmoke.stderr ?? ""
  }`;
  assertContract(
    adapterConfigSmoke.status === 0 &&
      adapterConfigOutput.includes("SDK AE Agent adapter config smoke: pass"),
    `M161 SDK AE Agent adapter config smoke failed: ${adapterConfigOutput.trim()}`,
    failures,
  );
  const historicalEvidenceSmoke = runNode([
    path.join("scripts", "sdk-historical-evidence-index-smoke.js"),
  ]);
  const historicalEvidenceOutput = `${historicalEvidenceSmoke.stdout ?? ""}\n${
    historicalEvidenceSmoke.stderr ?? ""
  }`;
  assertContract(
    historicalEvidenceSmoke.status === 0 &&
      historicalEvidenceOutput.includes("SDK historical evidence index smoke: pass"),
    `M162 SDK historical evidence index smoke failed: ${historicalEvidenceOutput.trim()}`,
    failures,
  );
  const historicalSmokeMigrationSmoke = runNode([
    path.join("scripts", "sdk-historical-smoke-migration-smoke.js"),
  ]);
  const historicalSmokeMigrationOutput = `${historicalSmokeMigrationSmoke.stdout ?? ""}\n${
    historicalSmokeMigrationSmoke.stderr ?? ""
  }`;
  assertContract(
    historicalSmokeMigrationSmoke.status === 0 &&
      historicalSmokeMigrationOutput.includes("SDK historical smoke migration smoke: pass"),
    `M163 SDK historical smoke migration smoke failed: ${historicalSmokeMigrationOutput.trim()}`,
    failures,
  );
  const historicalArchiveReviewSmoke = runNode([
    path.join("scripts", "sdk-historical-archive-review-smoke.js"),
  ]);
  const historicalArchiveReviewOutput = `${historicalArchiveReviewSmoke.stdout ?? ""}\n${
    historicalArchiveReviewSmoke.stderr ?? ""
  }`;
  assertContract(
    historicalArchiveReviewSmoke.status === 0 &&
      historicalArchiveReviewOutput.includes("SDK historical archive review smoke: pass"),
    `M164 SDK historical archive review smoke failed: ${historicalArchiveReviewOutput.trim()}`,
    failures,
  );
  const historicalArchiveMoveSmoke = runNode([
    path.join("scripts", "sdk-historical-archive-move-smoke.js"),
  ]);
  const historicalArchiveMoveOutput = `${historicalArchiveMoveSmoke.stdout ?? ""}\n${
    historicalArchiveMoveSmoke.stderr ?? ""
  }`;
  assertContract(
    historicalArchiveMoveSmoke.status === 0 &&
      historicalArchiveMoveOutput.includes("SDK historical archive move smoke: pass"),
    `M165 SDK historical archive move smoke failed: ${historicalArchiveMoveOutput.trim()}`,
    failures,
  );
  const runnerSplitReviewSmoke = runNode([
    path.join("scripts", "sdk-runner-split-review-smoke.js"),
  ]);
  const runnerSplitReviewOutput = `${runnerSplitReviewSmoke.stdout ?? ""}\n${
    runnerSplitReviewSmoke.stderr ?? ""
  }`;
  assertContract(
    runnerSplitReviewSmoke.status === 0 &&
      runnerSplitReviewOutput.includes("SDK runner split review smoke: pass"),
    `M166 SDK runner split review smoke failed: ${runnerSplitReviewOutput.trim()}`,
    failures,
  );
  const operationEnvelopeCoreExtractionSmoke = runNode([
    path.join("scripts", "sdk-operation-envelope-core-extraction-smoke.js"),
  ]);
  const operationEnvelopeCoreExtractionOutput = `${
    operationEnvelopeCoreExtractionSmoke.stdout ?? ""
  }\n${operationEnvelopeCoreExtractionSmoke.stderr ?? ""}`;
  assertContract(
    operationEnvelopeCoreExtractionSmoke.status === 0 &&
      operationEnvelopeCoreExtractionOutput.includes(
        "SDK operation envelope core extraction smoke: pass",
      ),
    `M167 SDK operation envelope core extraction smoke failed: ${operationEnvelopeCoreExtractionOutput.trim()}`,
    failures,
  );
  const runtimeDiagnosticsExtractionSmoke = runNode([
    path.join("scripts", "sdk-runtime-diagnostics-extraction-smoke.js"),
  ]);
  const runtimeDiagnosticsExtractionOutput = `${
    runtimeDiagnosticsExtractionSmoke.stdout ?? ""
  }\n${runtimeDiagnosticsExtractionSmoke.stderr ?? ""}`;
  assertContract(
    runtimeDiagnosticsExtractionSmoke.status === 0 &&
      runtimeDiagnosticsExtractionOutput.includes(
        "SDK runtime diagnostics extraction smoke: pass",
      ),
    `M168 SDK runtime diagnostics extraction smoke failed: ${runtimeDiagnosticsExtractionOutput.trim()}`,
    failures,
  );
  const postRunContractExtractionSmoke = runNode([
    path.join("scripts", "sdk-post-run-contract-extraction-smoke.js"),
  ]);
  const postRunContractExtractionOutput = `${
    postRunContractExtractionSmoke.stdout ?? ""
  }\n${postRunContractExtractionSmoke.stderr ?? ""}`;
  assertContract(
    postRunContractExtractionSmoke.status === 0 &&
      postRunContractExtractionOutput.includes(
        "SDK post-run contract extraction smoke: pass",
      ),
    `M169 SDK post-run contract extraction smoke failed: ${postRunContractExtractionOutput.trim()}`,
    failures,
  );
  const bufferedAcceptanceSplitReviewSmoke = runNode([
    path.join("scripts", "sdk-buffered-acceptance-split-review-smoke.js"),
  ]);
  const bufferedAcceptanceSplitReviewOutput = `${
    bufferedAcceptanceSplitReviewSmoke.stdout ?? ""
  }\n${bufferedAcceptanceSplitReviewSmoke.stderr ?? ""}`;
  assertContract(
    bufferedAcceptanceSplitReviewSmoke.status === 0 &&
      bufferedAcceptanceSplitReviewOutput.includes(
        "SDK buffered acceptance split review smoke: pass",
      ),
    `M170 SDK buffered acceptance split review smoke failed: ${bufferedAcceptanceSplitReviewOutput.trim()}`,
    failures,
  );

  const reviewPacketFiles = collectSdkScopeExpansionReviewPackets(
    SDK_SCOPE_EXPANSION_REVIEW_DIRECTORY,
    validateSdkScopeExpansionReviewPacket,
  );
  for (const failure of reviewPacketFiles.failures) {
    assertContract(false, `M129 SDK scope expansion review packet file failed: ${failure}`, failures);
  }
  const legacyProductionReviewPacketPath =
    `${SDK_SCOPE_EXPANSION_REVIEW_DIRECTORY}/129-production-code-smoke-harness-review.json`;
  const firstReviewPacket = reviewPacketFiles.packets.find(
    (packet) => packet.path === legacyProductionReviewPacketPath,
  );
  assertContract(
    !firstReviewPacket ||
      (firstReviewPacket.decision === "proposed" &&
      firstReviewPacket?.scope === "production-code" &&
      firstReviewPacket?.sdkWriteEnabled === false &&
      firstReviewPacket?.plannedPathAllowlist?.includes("scripts/provider-contract-smoke.js")),
    "M129 first SDK scope expansion review packet was invalid when present",
    failures,
  );
  const secondReviewPacket = reviewPacketFiles.packets.find(
    (packet) =>
      packet.path ===
      `${SDK_SCOPE_EXPANSION_REVIEW_DIRECTORY}/132-cep-panel-composer-review.json`,
  );
  assertContract(
    secondReviewPacket?.decision === "proposed" &&
      secondReviewPacket?.scope === "cep-panel" &&
      secondReviewPacket?.sdkWriteEnabled === false &&
      secondReviewPacket?.plannedPathAllowlist?.includes("cep-panel/panel.js"),
    "M132 CEP-panel SDK scope expansion review packet was not validated",
    failures,
  );
  const m152ReviewPacket = reviewPacketFiles.packets.find(
    (packet) =>
      packet.path ===
      `${SDK_SCOPE_EXPANSION_REVIEW_DIRECTORY}/152-production-code-provider-smokes-review.json`,
  );
  assertContract(
    m152ReviewPacket?.decision === "approved" &&
      m152ReviewPacket?.scope === "production-code" &&
      m152ReviewPacket?.sdkWriteEnabled === false &&
      m152ReviewPacket?.plannedPathAllowlist?.join(",") ===
        SDK_WRITE_PRODUCTION_CODE_PLANNED_PATH_ALLOWLIST.join(","),
    "M152 production-code provider smokes review packet was not validated",
    failures,
  );

  const readinessPacketFiles = collectSdkWriteLaneReadinessPackets(
    SDK_WRITE_LANE_READINESS_DIRECTORY,
    validateSdkWriteLaneReadinessPacket,
  );
  for (const failure of readinessPacketFiles.failures) {
    assertContract(false, `M133 SDK write lane readiness packet file failed: ${failure}`, failures);
  }
  const productionLaneReadiness = readinessPacketFiles.packets.find(
    (packet) =>
      packet.path ===
      `${SDK_WRITE_LANE_READINESS_DIRECTORY}/133-production-code-smoke-harness-readiness.json`,
  );
  assertContract(
    !productionLaneReadiness ||
      (productionLaneReadiness.readiness === SDK_WRITE_LANE_READINESS_STATE &&
      productionLaneReadiness?.approvalState === SDK_WRITE_LANE_APPROVAL_STATE &&
      productionLaneReadiness?.scope === "production-code" &&
      productionLaneReadiness?.sdkWriteEnabled === false &&
      productionLaneReadiness?.sourceReviewPacket === legacyProductionReviewPacketPath &&
      productionLaneReadiness?.plannedPathAllowlist?.join(",") ===
        SDK_WRITE_PRODUCTION_CODE_LEGACY_SINGLE_FILE_PLANNED_PATH_ALLOWLIST.join(",") &&
      productionLaneReadiness?.plannedPathAllowlist?.includes("scripts/provider-contract-smoke.js")),
    "M133 production-code SDK write lane readiness gate was invalid when present",
    failures,
  );
  const m152ProductionLaneReadiness = readinessPacketFiles.packets.find(
    (packet) =>
      packet.path ===
      `${SDK_WRITE_LANE_READINESS_DIRECTORY}/152-production-code-provider-smokes-readiness.json`,
  );
  assertContract(
    m152ProductionLaneReadiness?.readiness === SDK_WRITE_LANE_READINESS_STATE &&
      m152ProductionLaneReadiness?.approvalState === SDK_WRITE_LANE_APPROVAL_STATE &&
      m152ProductionLaneReadiness?.scope === "production-code" &&
      m152ProductionLaneReadiness?.sdkWriteEnabled === false &&
      m152ProductionLaneReadiness?.sourceReviewPacket === m152ReviewPacket?.path &&
      m152ProductionLaneReadiness?.plannedPathAllowlist?.join(",") ===
        SDK_WRITE_PRODUCTION_CODE_PLANNED_PATH_ALLOWLIST.join(","),
    "M152 production-code SDK write lane readiness gate was not validated against its review packet",
    failures,
  );
  const approvalDecisionPacketFiles = collectSdkWriteLaneApprovalDecisionPackets(
    SDK_WRITE_LANE_APPROVAL_DECISION_DIRECTORY,
    validateSdkWriteLaneApprovalDecisionPacket,
  );
  for (const failure of approvalDecisionPacketFiles.failures) {
    assertContract(
      false,
      `M134 SDK write lane approval decision packet file failed: ${failure}`,
      failures,
    );
  }
  const productionLaneApprovalDecision = approvalDecisionPacketFiles.packets.find(
    (packet) =>
      packet.path ===
      `${SDK_WRITE_LANE_APPROVAL_DECISION_DIRECTORY}/134-production-code-smoke-harness-approval-decision.json`,
  );
  assertContract(
    !productionLaneApprovalDecision ||
      (productionLaneApprovalDecision.approvalState === SDK_WRITE_LANE_APPROVAL_STATE &&
      productionLaneApprovalDecision?.explicitApprovalRecorded === false &&
      productionLaneApprovalDecision?.scope === "production-code" &&
      productionLaneApprovalDecision?.sdkWriteEnabled === false &&
      productionLaneApprovalDecision?.sourceReadinessPacket ===
        `${SDK_WRITE_LANE_READINESS_DIRECTORY}/133-production-code-smoke-harness-readiness.json` &&
      productionLaneApprovalDecision?.sourceReviewPacket === legacyProductionReviewPacketPath &&
      productionLaneApprovalDecision?.plannedPathAllowlist?.join(",") ===
        SDK_WRITE_PRODUCTION_CODE_LEGACY_SINGLE_FILE_PLANNED_PATH_ALLOWLIST.join(",") &&
      productionLaneApprovalDecision?.plannedPathAllowlist?.includes(
        "scripts/provider-contract-smoke.js",
      )),
    "M134 production-code SDK write lane approval decision was invalid when present",
    failures,
  );
  const m152ProductionLaneApprovalDecision = approvalDecisionPacketFiles.packets.find(
    (packet) =>
      packet.path ===
      `${SDK_WRITE_LANE_APPROVAL_DECISION_DIRECTORY}/152-production-code-provider-smokes-approval-decision.json`,
  );
  assertContract(
    m152ProductionLaneApprovalDecision?.approvalState ===
      SDK_WRITE_LANE_ENABLEMENT_APPROVAL_STATE &&
      m152ProductionLaneApprovalDecision?.explicitApprovalRecorded === true &&
      m152ProductionLaneApprovalDecision?.scope === "production-code" &&
      m152ProductionLaneApprovalDecision?.sdkWriteEnabled === false &&
      m152ProductionLaneApprovalDecision?.sourceReadinessPacket ===
        m152ProductionLaneReadiness?.path &&
      m152ProductionLaneApprovalDecision?.sourceReviewPacket === m152ReviewPacket?.path &&
      m152ProductionLaneApprovalDecision?.plannedPathAllowlist?.join(",") ===
        SDK_WRITE_PRODUCTION_CODE_PLANNED_PATH_ALLOWLIST.join(","),
    "M152 production-code SDK write lane approval decision did not record the explicit approval",
    failures,
  );
  const enablementPacketFiles = collectSdkWriteLaneEnablementPackets(
    SDK_WRITE_LANE_ENABLEMENT_DIRECTORY,
    validateSdkWriteLaneEnablementPacket,
  );
  for (const failure of enablementPacketFiles.failures) {
    assertContract(false, `M135 SDK write lane enablement packet file failed: ${failure}`, failures);
  }
  const productionLaneEnablement = enablementPacketFiles.packets.find(
    (packet) =>
      packet.path ===
      `${SDK_WRITE_LANE_ENABLEMENT_DIRECTORY}/135-production-code-smoke-harness-enable.json`,
  );
  assertContract(
    !productionLaneEnablement ||
      (productionLaneEnablement.approvalState === SDK_WRITE_LANE_ENABLEMENT_APPROVAL_STATE &&
      productionLaneEnablement?.explicitApprovalRecorded === true &&
      productionLaneEnablement?.scope === SDK_WRITE_PRODUCTION_CODE_SCOPE &&
      productionLaneEnablement?.sdkWriteEnabled === true &&
      productionLaneEnablement?.sourceApprovalDecisionPacket ===
        `${SDK_WRITE_LANE_APPROVAL_DECISION_DIRECTORY}/134-production-code-smoke-harness-approval-decision.json` &&
      productionLaneEnablement?.sourceReadinessPacket ===
        `${SDK_WRITE_LANE_READINESS_DIRECTORY}/133-production-code-smoke-harness-readiness.json` &&
      productionLaneEnablement?.sourceReviewPacket === legacyProductionReviewPacketPath &&
      productionLaneEnablement?.plannedPathAllowlist?.join(",") ===
        SDK_WRITE_PRODUCTION_CODE_LEGACY_SINGLE_FILE_PLANNED_PATH_ALLOWLIST.join(",") &&
      productionLaneEnablement?.plannedPathAllowlist?.join(",") ===
        SDK_WRITE_PRODUCTION_CODE_LEGACY_SINGLE_FILE_PLANNED_PATH_ALLOWLIST.join(",")),
    "M135 production-code SDK write lane enablement was invalid when present",
    failures,
  );
  const m152ProductionLaneEnablement = enablementPacketFiles.packets.find(
    (packet) =>
      packet.path ===
      `${SDK_WRITE_LANE_ENABLEMENT_DIRECTORY}/152-production-code-provider-smokes-enable.json`,
  );
  assertContract(
    m152ProductionLaneEnablement?.approvalState === SDK_WRITE_LANE_ENABLEMENT_APPROVAL_STATE &&
      m152ProductionLaneEnablement?.explicitApprovalRecorded === true &&
      m152ProductionLaneEnablement?.scope === SDK_WRITE_PRODUCTION_CODE_SCOPE &&
      m152ProductionLaneEnablement?.sdkWriteEnabled === true &&
      m152ProductionLaneEnablement?.sourceApprovalDecisionPacket ===
        m152ProductionLaneApprovalDecision?.path &&
      m152ProductionLaneEnablement?.sourceReadinessPacket ===
        m152ProductionLaneReadiness?.path &&
      m152ProductionLaneEnablement?.sourceReviewPacket === m152ReviewPacket?.path &&
      m152ProductionLaneEnablement?.plannedPathAllowlist?.join(",") ===
        SDK_WRITE_PRODUCTION_CODE_PLANNED_PATH_ALLOWLIST.join(","),
    "M152 production-code SDK write lane enablement did not become the current two-file lane",
    failures,
  );

  const launchGovernancePacketFiles = collectSdkLaunchGovernancePackets(
    SDK_LAUNCH_GOVERNANCE_DIRECTORY,
    validateSdkLaunchGovernancePacket,
  );
  for (const failure of launchGovernancePacketFiles.failures) {
    assertContract(false, `M140 SDK launch governance packet file failed: ${failure}`, failures);
  }
  const sdkLaunchGovernance = launchGovernancePacketFiles.packets.find(
    (packet) => packet.path === `${SDK_LAUNCH_GOVERNANCE_DIRECTORY}/140-sdk-launch-governance.json`,
  );
  assertContract(
    !sdkLaunchGovernance ||
      (sdkLaunchGovernance.state === SDK_LAUNCH_GOVERNANCE_STATE &&
      sdkLaunchGovernance?.allowedSdkWriteScopes?.join(",") ===
        SDK_WRITE_ALLOWED_SCOPES.join(",") &&
      sdkLaunchGovernance?.reviewRequiredScopes?.join(",") ===
        SDK_WRITE_REVIEW_REQUIRED_SCOPES.join(",") &&
      sdkLaunchGovernance?.productionCodePlannedPathAllowlist?.join(",") ===
        SDK_WRITE_PRODUCTION_CODE_LEGACY_SINGLE_FILE_PLANNED_PATH_ALLOWLIST.join(",") &&
      sdkLaunchGovernance?.sourceMilestones?.includes("M138") &&
      sdkLaunchGovernance?.sourceMilestones?.includes("M139") &&
      sdkLaunchGovernance?.newSdkThreadRunApproved === false &&
      sdkLaunchGovernance?.externalNetworkRetryApproved === false &&
      sdkLaunchGovernance?.broadProductionCodeWritesApproved === false &&
      sdkLaunchGovernance?.cepPanelSdkWriteEnabled === false),
    "M140 SDK launch governance was invalid when present",
    failures,
  );
  const m152SdkLaunchGovernance = launchGovernancePacketFiles.packets.find(
    (packet) =>
      packet.path ===
      `${SDK_LAUNCH_GOVERNANCE_DIRECTORY}/152-sdk-production-code-provider-smokes-governance.json`,
  );
  assertContract(
    m152SdkLaunchGovernance?.state === SDK_LAUNCH_GOVERNANCE_STATE &&
      m152SdkLaunchGovernance?.allowedSdkWriteScopes?.join(",") ===
        SDK_WRITE_ALLOWED_SCOPES.join(",") &&
      m152SdkLaunchGovernance?.reviewRequiredScopes?.join(",") ===
        SDK_WRITE_REVIEW_REQUIRED_SCOPES.join(",") &&
      m152SdkLaunchGovernance?.productionCodePlannedPathAllowlist?.join(",") ===
        SDK_WRITE_PRODUCTION_CODE_PLANNED_PATH_ALLOWLIST.join(",") &&
      m152SdkLaunchGovernance?.sourceMilestones?.includes("M152") &&
      m152SdkLaunchGovernance?.newSdkThreadRunApproved === false &&
      m152SdkLaunchGovernance?.externalNetworkRetryApproved === false &&
      m152SdkLaunchGovernance?.broadProductionCodeWritesApproved === false &&
      m152SdkLaunchGovernance?.cepPanelSdkWriteEnabled === false,
    "M152 SDK launch governance did not keep the current two-file production-code lane local-gated",
    failures,
  );

  let launchGovernanceDriftReport = null;
  if (m152SdkLaunchGovernance?.rawPacket && m152ProductionLaneEnablement?.rawPacket) {
    try {
      launchGovernanceDriftReport = buildSdkLaunchGovernanceDriftReport({
        launchGovernancePacket: m152SdkLaunchGovernance.rawPacket,
        productionLaneEnablementPacket: m152ProductionLaneEnablement.rawPacket,
      });
    } catch (error) {
      failures.push(`M141 SDK launch governance drift report failed: ${error.message}`);
    }
  }
  assertContract(
    launchGovernanceDriftReport?.schema === SDK_LAUNCH_GOVERNANCE_DRIFT_REPORT_SCHEMA &&
      launchGovernanceDriftReport?.launchGovernanceState === SDK_LAUNCH_GOVERNANCE_STATE &&
      launchGovernanceDriftReport?.driftDetected === false &&
      launchGovernanceDriftReport?.checks?.every((check) => check.ok),
    "M141 SDK launch governance drift report detected committed governance drift",
    failures,
  );
  let onDemandLaunchGovernanceReport = null;
  try {
    onDemandLaunchGovernanceReport = await buildCommittedSdkLaunchGovernanceReport();
  } catch (error) {
    failures.push(`M142 SDK launch governance report command failed: ${error.message}`);
  }
  assertContract(
    onDemandLaunchGovernanceReport?.schema === SDK_LAUNCH_GOVERNANCE_DRIFT_REPORT_SCHEMA &&
      onDemandLaunchGovernanceReport?.launchGovernanceState ===
        SDK_LAUNCH_GOVERNANCE_STATE &&
      onDemandLaunchGovernanceReport?.driftDetected === false &&
      onDemandLaunchGovernanceReport?.launchGovernancePacketPath ===
        `${SDK_LAUNCH_GOVERNANCE_DIRECTORY}/152-sdk-production-code-provider-smokes-governance.json` &&
      onDemandLaunchGovernanceReport?.productionLaneEnablementPacketPath ===
        `${SDK_WRITE_LANE_ENABLEMENT_DIRECTORY}/152-production-code-provider-smokes-enable.json`,
    "M142 SDK launch governance report command did not return the committed local-gated report",
    failures,
  );
  assertContract(
    WRITE_SCOPES.join(",") === "docs-audit,orchestrator,production-code,cep-panel",
    "M112 write-capable scopes are not the expected explicit set",
    failures,
  );
  assertContract(
    UNSAFE_WRITE_RUNNER_FLAGS.includes("external-provider") &&
      UNSAFE_WRITE_RUNNER_FLAGS.includes("openai-cli-planner") &&
      UNSAFE_WRITE_RUNNER_FLAGS.includes("mutating-live") &&
      UNSAFE_WRITE_RUNNER_FLAGS.includes("tenant-policy-bypass") &&
      UNSAFE_WRITE_RUNNER_FLAGS.includes("sandbox") &&
      UNSAFE_WRITE_RUNNER_FLAGS.includes("approval") &&
      UNSAFE_WRITE_RUNNER_FLAGS.includes("network") &&
      UNSAFE_WRITE_RUNNER_FLAGS.includes("web-search"),
    "M112 write-capable scaffold does not reject the required unsafe flags",
    failures,
  );
  assertContract(
    SCOPE_PATH_ALLOWLISTS.orchestrator.includes("orchestrator/**") &&
      SCOPE_PATH_ALLOWLISTS["docs-audit"].includes(".codex-audit/**") &&
      SCOPE_PATH_ALLOWLISTS["production-code"].includes("mcp-server/**") &&
      SCOPE_PATH_ALLOWLISTS["cep-panel"].includes("cep-panel/**"),
    "M112 write-capable scaffold path allowlists are incomplete",
    failures,
  );
  assertContract(
    SDK_WRITE_PLANNED_PATH_ALLOWLIST.join(",") === ".codex-audit/**",
    "M117R docs-audit sdk-write planned path allowlist is not restricted to .codex-audit/**",
    failures,
  );
  assertContract(
    SDK_WRITE_ALLOWED_SCOPES.join(",") === "docs-audit,orchestrator,production-code" &&
      SDK_WRITE_ORCHESTRATOR_PLANNED_PATH_ALLOWLIST.join(",") === "orchestrator/**" &&
    SDK_WRITE_ORCHESTRATOR_FIXTURE_JSON_PLANNED_PATH_ALLOWLIST.join(",") ===
        "orchestrator/fixtures/sdk-write/**" &&
      SDK_WRITE_PRODUCTION_CODE_LEGACY_SINGLE_FILE_PLANNED_PATH_ALLOWLIST.join(",") ===
        "scripts/provider-contract-smoke.js" &&
      SDK_WRITE_PRODUCTION_CODE_PLANNED_PATH_ALLOWLIST.join(",") ===
        "scripts/provider-api-smoke.js,scripts/provider-contract-smoke.js",
    "M135 sdk-write scope allowlists are not restricted to controlled outputs",
    failures,
  );
  assertContract(
    SDK_WRITE_ORCHESTRATOR_MULTI_FILE_CONTRACT_PLANNED_PATHS.length === 2 &&
      SDK_WRITE_ORCHESTRATOR_MULTI_FILE_CONTRACT_PLANNED_PATHS.every((repoPath) =>
        repoPath.startsWith("orchestrator/fixtures/sdk-write/m148-multi-file-"),
      ),
    "M148 multi-file planned path contract constants are not the expected orchestrator fixture paths",
    failures,
  );
  assertContract(
    FORBIDDEN_PATH_PATTERNS.includes("node_modules/**") &&
      FORBIDDEN_PATH_PATTERNS.includes(".git/**") &&
      FORBIDDEN_PATH_PATTERNS.includes("mcp-config.json") &&
      FORBIDDEN_PATH_PATTERNS.includes("**/*.pem") &&
      FORBIDDEN_PATH_PATTERNS.includes("**/*credential*") &&
      FORBIDDEN_PATH_PATTERNS.includes("package-lock.json"),
    "M112 write-capable scaffold forbidden paths are incomplete",
    failures,
  );

  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  assertContract(
    packageJson.scripts?.["codex:orchestrator"] ===
      "node orchestrator/codex-sdk-orchestrator.mjs",
    "package.json codex:orchestrator script is not the expected local runner",
    failures,
  );
  assertContract(
    packageJson.scripts?.["codex:orchestrator:help"] ===
      "node orchestrator/codex-sdk-orchestrator.mjs --help",
    "package.json codex:orchestrator:help script is not the expected help runner",
    failures,
  );
  assertContract(
    packageJson.scripts?.["check:rules"] ===
      "node orchestrator/run-buffered-acceptance.mjs --contract-smoke",
    "package.json check:rules script is not wired to the local contract smoke",
    failures,
  );
  assertContract(
    packageJson.scripts?.["codex:orchestrator:governance-report"] ===
      "node orchestrator/run-buffered-acceptance.mjs --governance-report",
    "package.json codex:orchestrator:governance-report script is not wired to the local governance report",
    failures,
  );
  assertContract(
    packageJson.scripts?.["codex:orchestrator:governance-report:smoke"] ===
      "node scripts/sdk-governance-report-smoke.js",
    "package.json codex:orchestrator:governance-report:smoke script is not wired to the local report parser smoke",
    failures,
  );
  assertContract(
    packageJson.scripts?.["codex:orchestrator:production-code-broader:smoke"] ===
      "node scripts/sdk-production-code-broader-readiness-smoke.js",
    "package.json codex:orchestrator:production-code-broader:smoke script is not wired to the M152 production-code broader readiness smoke",
    failures,
  );
  assertContract(
    packageJson.scripts?.["codex:orchestrator:next-lane:smoke"] ===
      "node scripts/sdk-next-lane-selection-smoke.js",
    "package.json codex:orchestrator:next-lane:smoke script is not wired to the M153 next-lane selection smoke",
    failures,
  );
  assertContract(
    packageJson.scripts?.["codex:orchestrator:milestone-conveyor-spec:smoke"] ===
      "node scripts/sdk-milestone-conveyor-spec-smoke.js",
    "package.json codex:orchestrator:milestone-conveyor-spec:smoke script is not wired to the M154 milestone conveyor spec smoke",
    failures,
  );
  assertContract(
    packageJson.scripts?.["codex:orchestrator:milestone-conveyor-dry-run:smoke"] ===
      "node scripts/sdk-milestone-conveyor-local-dry-run-smoke.js",
    "package.json codex:orchestrator:milestone-conveyor-dry-run:smoke script is not wired to the M155 milestone conveyor local dry-run smoke",
    failures,
  );
  assertContract(
    packageJson.scripts?.["codex:orchestrator:milestone-conveyor-sdkthread-proof:smoke"] ===
      "node scripts/sdk-milestone-conveyor-sdkthread-proof-smoke.js",
    "package.json codex:orchestrator:milestone-conveyor-sdkthread-proof:smoke script is not wired to the M156 milestone conveyor SDKThread proof smoke",
    failures,
  );
  assertContract(
    packageJson.scripts?.["codex:orchestrator:milestone-conveyor-loop-gate:smoke"] ===
      "node scripts/sdk-milestone-conveyor-loop-gate-smoke.js",
    "package.json codex:orchestrator:milestone-conveyor-loop-gate:smoke script is not wired to the M157 milestone conveyor loop gate smoke",
    failures,
  );
  assertContract(
    packageJson.scripts?.["codex:orchestrator:extraction-cleanup:smoke"] ===
      "node scripts/sdk-orchestrator-extraction-cleanup-smoke.js",
    "package.json codex:orchestrator:extraction-cleanup:smoke script is not wired to the M158 extraction cleanup smoke",
    failures,
  );
  assertContract(
    packageJson.scripts?.["codex:orchestrator:inventory-freeze:smoke"] ===
      "node scripts/sdk-orchestrator-inventory-freeze-smoke.js",
    "package.json codex:orchestrator:inventory-freeze:smoke script is not wired to the M159 inventory freeze smoke",
    failures,
  );
  assertContract(
    packageJson.scripts?.["codex:orchestrator:reusable-core:smoke"] ===
      "node scripts/sdk-reusable-core-extraction-smoke.js",
    "package.json codex:orchestrator:reusable-core:smoke script is not wired to the M160 reusable core extraction smoke",
    failures,
  );
  assertContract(
    packageJson.scripts?.["codex:orchestrator:historical-evidence:smoke"] ===
      "node scripts/sdk-historical-evidence-index-smoke.js",
    "package.json codex:orchestrator:historical-evidence:smoke script is not wired to the M162 historical evidence index smoke",
    failures,
  );
  assertContract(
    packageJson.scripts?.["codex:orchestrator:historical-smoke-migration:smoke"] ===
      "node scripts/sdk-historical-smoke-migration-smoke.js",
    "package.json codex:orchestrator:historical-smoke-migration:smoke script is not wired to the M163 historical smoke migration smoke",
    failures,
  );
  assertContract(
    packageJson.scripts?.["codex:orchestrator:historical-archive-review:smoke"] ===
      "node scripts/sdk-historical-archive-review-smoke.js",
    "package.json codex:orchestrator:historical-archive-review:smoke script is not wired to the M164 historical archive review smoke",
    failures,
  );
  assertContract(
    packageJson.scripts?.["codex:orchestrator:historical-archive-move:smoke"] ===
      "node scripts/sdk-historical-archive-move-smoke.js",
    "package.json codex:orchestrator:historical-archive-move:smoke script is not wired to the M165 historical archive move smoke",
    failures,
  );
  assertContract(
    packageJson.scripts?.["codex:orchestrator:runner-split-review:smoke"] ===
      "node scripts/sdk-runner-split-review-smoke.js",
    "package.json codex:orchestrator:runner-split-review:smoke script is not wired to the M166 runner split review smoke",
    failures,
  );
  assertContract(
    packageJson.scripts?.["codex:orchestrator:operation-envelope-core:smoke"] ===
      "node scripts/sdk-operation-envelope-core-extraction-smoke.js",
    "package.json codex:orchestrator:operation-envelope-core:smoke script is not wired to the M167 operation envelope core extraction smoke",
    failures,
  );
  assertContract(
    packageJson.scripts?.["codex:orchestrator:runtime-diagnostics:smoke"] ===
      "node scripts/sdk-runtime-diagnostics-extraction-smoke.js",
    "package.json codex:orchestrator:runtime-diagnostics:smoke script is not wired to the M168 runtime diagnostics extraction smoke",
    failures,
  );
  assertContract(
    packageJson.scripts?.["codex:orchestrator:post-run-contract:smoke"] ===
      "node scripts/sdk-post-run-contract-extraction-smoke.js",
    "package.json codex:orchestrator:post-run-contract:smoke script is not wired to the M169 post-run contract extraction smoke",
    failures,
  );
  assertContract(
    packageJson.scripts?.["codex:orchestrator:buffered-acceptance-split-review:smoke"] ===
      "node scripts/sdk-buffered-acceptance-split-review-smoke.js",
    "package.json codex:orchestrator:buffered-acceptance-split-review:smoke script is not wired to the M170 buffered acceptance split review smoke",
    failures,
  );
  assertContract(
    packageJson.scripts?.["codex:orchestrator:write-scaffold"] ===
      "node orchestrator/run-write-capable-scaffold.mjs",
    "package.json codex:orchestrator:write-scaffold script is not wired to the M112 runner",
    failures,
  );
  assertContract(
    packageJson.scripts?.["codex:orchestrator:write-scaffold:contract"] ===
      "node orchestrator/run-write-capable-scaffold.mjs --contract-smoke",
    "package.json codex:orchestrator:write-scaffold:contract script is not wired to the local M112 contract smoke",
    failures,
  );

  const readme = readIfExists(path.join("orchestrator", "README.md"), 40000);
  assertContract(
    readme.includes("npm.cmd run codex:orchestrator:help"),
    "README does not document codex:orchestrator:help",
    failures,
  );
  assertContract(
    readme.includes("npm.cmd run check:rules"),
    "README does not document check:rules",
    failures,
  );
  assertContract(
    readme.includes("npm.cmd run codex:orchestrator:governance-report"),
    "README does not document codex:orchestrator:governance-report",
    failures,
  );
  assertContract(
    readme.includes("npm.cmd run codex:orchestrator:governance-report:smoke"),
    "README does not document codex:orchestrator:governance-report:smoke",
    failures,
  );
  assertContract(
    readme.includes("npm.cmd run codex:orchestrator:production-code-broader:smoke") &&
      readme.includes("152-sdk-production-code-provider-smokes-ready.json") &&
      readme.includes("sdk-production-code-broader-readiness.v1") &&
      readme.includes("scripts/provider-api-smoke.js"),
    "README does not document the M152 production-code broader readiness smoke",
    failures,
  );
  assertContract(
    readme.includes("npm.cmd run codex:orchestrator:next-lane:smoke") &&
      readme.includes("153-sdk-next-lane-selection.json") &&
      readme.includes("sdk-next-lane-selection.v1") &&
      readme.includes("cep-panel-composer-local-preflight"),
    "README does not document the M153 SDK next-lane selection smoke",
    failures,
  );
  assertContract(
    readme.includes("npm.cmd run codex:orchestrator:milestone-conveyor-spec:smoke") &&
      readme.includes("154-sdk-milestone-conveyor-spec.json") &&
      readme.includes("sdk-milestone-conveyor-spec.v1") &&
      readme.includes("no-push-by-default"),
    "README does not document the M154 SDK milestone conveyor spec smoke",
    failures,
  );
  assertContract(
    readme.includes("npm.cmd run codex:orchestrator:milestone-conveyor-dry-run:smoke") &&
      readme.includes("155-sdk-milestone-conveyor-local-dry-run.json") &&
      readme.includes("sdk-milestone-conveyor-local-dry-run-proof.v1") &&
      readme.includes("no-explicit-approval"),
    "README does not document the M155 SDK milestone conveyor local dry-run smoke",
    failures,
  );
  assertContract(
    readme.includes("npm.cmd run codex:orchestrator:milestone-conveyor-sdkthread-proof:smoke") &&
      readme.includes("156-sdk-conveyor-sdkthread-proof.json") &&
      readme.includes("sdk-milestone-conveyor-sdkthread-proof.v1") &&
      readme.includes("019e4dcd-dd6f-7651-8882-b0c014894633"),
    "README does not document the M156 SDK milestone conveyor SDKThread proof smoke",
    failures,
  );
  assertContract(
    readme.includes("npm.cmd run codex:orchestrator:milestone-conveyor-loop-gate:smoke") &&
      readme.includes("157-sdk-conveyor-commit-handoff-loop-gate.json") &&
      readme.includes("sdk-conveyor-commit-handoff-loop-gate.v1") &&
      readme.includes("one reviewable commit") &&
      readme.includes("context-pressure"),
    "README does not document the M157 SDK milestone conveyor loop gate smoke",
    failures,
  );
  assertContract(
    readme.includes("npm.cmd run codex:orchestrator:extraction-cleanup:smoke") &&
      readme.includes("158-sdk-orchestrator-extraction-cleanup-plan.json") &&
      readme.includes("sdk-orchestrator-extraction-cleanup-plan.v1") &&
      readme.includes("recommended standalone tool structure") &&
      readme.includes("safe AE Agent cleanup plan"),
    "README does not document the M158 SDK orchestrator extraction cleanup smoke",
    failures,
  );
  assertContract(
    readme.includes("npm.cmd run codex:orchestrator:inventory-freeze:smoke") &&
      readme.includes("159-sdk-orchestrator-inventory-freeze.json") &&
      readme.includes("sdk-orchestrator-inventory-freeze.v1") &&
      readme.includes("Freeze current inventory") &&
      readme.includes("Extract reusable core without behavior change"),
    "README does not document the M159 SDK orchestrator inventory freeze smoke",
    failures,
  );
  assertContract(
    readme.includes("npm.cmd run codex:orchestrator:reusable-core:smoke") &&
      readme.includes("160-sdk-reusable-core-extraction.json") &&
      readme.includes("sdk-reusable-core-extraction.v1") &&
      readme.includes("orchestrator/core/path-policy.mjs") &&
      readme.includes("orchestrator/adapters/ae-agent-policy.example.json"),
    "README does not document the M160 SDK reusable core extraction smoke",
    failures,
  );
  assertContract(
    readme.includes("npm.cmd run codex:orchestrator:adapter-config:smoke") &&
      readme.includes("161-ae-agent-adapter-config.json") &&
      readme.includes("sdk-ae-agent-adapter-config.v1") &&
      readme.includes("orchestrator/adapters/ae-agent-sdk-policy.mjs") &&
      readme.includes("CEP-panel SDK writes remain disabled"),
    "README does not document the M161 AE Agent adapter config smoke",
    failures,
  );
  assertContract(
    readme.includes("npm.cmd run codex:orchestrator:historical-evidence:smoke") &&
      readme.includes("162-sdk-historical-evidence-index.json") &&
      readme.includes("sdk-historical-evidence-index.v1") &&
      readme.includes("current evidence remains directly checked") &&
      readme.includes("no archive move"),
    "README does not document the M162 historical evidence index smoke",
    failures,
  );
  assertContract(
    readme.includes("npm.cmd run codex:orchestrator:historical-smoke-migration:smoke") &&
      readme.includes("163-sdk-historical-smoke-migration.json") &&
      readme.includes("sdk-historical-smoke-migration.v1") &&
      readme.includes("M163 migrates superseded historical smoke coverage") &&
      readme.includes("archive move remains blocked"),
    "README does not document the M163 historical smoke migration smoke",
    failures,
  );
  assertContract(
    readme.includes("npm.cmd run codex:orchestrator:historical-archive-review:smoke") &&
      readme.includes("164-sdk-historical-archive-review.json") &&
      readme.includes("sdk-historical-archive-review.v1") &&
      readme.includes("M164 reviews historical archive move candidates") &&
      readme.includes("archive move remains blocked"),
    "README does not document the M164 historical archive review smoke",
    failures,
  );
  assertContract(
    readme.includes("npm.cmd run codex:orchestrator:historical-archive-move:smoke") &&
      readme.includes("165-sdk-historical-archive-move.json") &&
      readme.includes("sdk-historical-archive-move.v1") &&
      readme.includes("M165 moves the M164-reviewed historical archive candidates") &&
      readme.includes("delete and squash remain blocked"),
    "README does not document the M165 historical archive move smoke",
    failures,
  );
  assertContract(
    readme.includes("npm.cmd run codex:orchestrator:runner-split-review:smoke") &&
      readme.includes("166-sdk-runner-split-review.json") &&
      readme.includes("sdk-runner-split-review.v1") &&
      readme.includes("M166 reviews the remaining AE Agent-specific runner split candidates") &&
      readme.includes("no behavior-changing extraction"),
    "README does not document the M166 runner split review smoke",
    failures,
  );
  assertContract(
    readme.includes("npm.cmd run codex:orchestrator:operation-envelope-core:smoke") &&
      readme.includes("167-sdk-operation-envelope-core-extraction.json") &&
      readme.includes("sdk-operation-envelope-core-extraction.v1") &&
      readme.includes("M167 extracts the operation-envelope helpers") &&
      readme.includes("orchestrator/core/operation-envelope.mjs"),
    "README does not document the M167 operation envelope core extraction smoke",
    failures,
  );
  assertContract(
    readme.includes("npm.cmd run codex:orchestrator:runtime-diagnostics:smoke") &&
      readme.includes("168-sdk-runtime-diagnostics-review-or-extraction.json") &&
      readme.includes("sdk-runtime-diagnostics-review-or-extraction.v1") &&
      readme.includes("M168 extracts SDK runtime-store and failure-diagnostics helpers") &&
      readme.includes("orchestrator/core/runtime-store.mjs") &&
      readme.includes("orchestrator/core/failure-diagnostics.mjs"),
    "README does not document the M168 runtime diagnostics extraction smoke",
    failures,
  );
  assertContract(
    readme.includes("npm.cmd run codex:orchestrator:post-run-contract:smoke") &&
      readme.includes("169-sdk-post-run-contract-review-or-extraction.json") &&
      readme.includes("sdk-post-run-contract-review-or-extraction.v1") &&
      readme.includes("M169 extracts SDK post-run contract helpers") &&
      readme.includes("orchestrator/core/post-run-contract.mjs"),
    "README does not document the M169 post-run contract extraction smoke",
    failures,
  );
  assertContract(
    readme.includes("npm.cmd run codex:orchestrator:buffered-acceptance-split-review:smoke") &&
      readme.includes("170-sdk-buffered-acceptance-split-review.json") &&
      readme.includes("sdk-buffered-acceptance-split-review.v1") &&
      readme.includes("M170 reviews buffered acceptance split boundaries") &&
      readme.includes("project-local"),
    "README does not document the M170 buffered acceptance split review smoke",
    failures,
  );
  assertContract(
    readme.includes('sandboxMode: "read-only"') &&
      readme.includes('approvalPolicy: "never"') &&
      readme.includes("networkAccessEnabled: false") &&
      readme.includes('webSearchMode: "disabled"'),
    "README does not document all safe defaults",
    failures,
  );
  assertContract(
    readme.includes("--sandbox danger-full-access") &&
      readme.includes("--approval on-request") &&
      readme.includes("--network") &&
      readme.includes("--web-search live"),
    "README does not document the unsafe buffered-mode rejections",
    failures,
  );
  assertContract(
    readme.includes("General CLI value validation") &&
      readme.includes("Invalid values are rejected before any SDK thread is created") &&
      readme.includes("`--network=enabled`") &&
      readme.includes("`--skip-git-repo-check=yes`"),
    "README does not document general CLI value validation",
    failures,
  );
  assertContract(
    readme.includes("Write-capable runner scaffold") &&
      readme.includes("--dry-run") &&
      readme.includes("--operation-file") &&
      readme.includes("planned-operation envelope") &&
      readme.includes('mode:"sdk-write"') &&
      readme.includes(".codex-audit/**") &&
      readme.includes("orchestrator/m123-sdk-thread-orchestrator-scope-output.md") &&
      readme.includes("docs-only Markdown planned paths under `orchestrator/**`") &&
      readme.includes("orchestrator/fixtures/sdk-write/**") &&
      readme.includes("orchestrator/fixtures/sdk-write/m125-sdk-thread-fixture.json") &&
      readme.includes("non-executable JSON fixtures") &&
      readme.includes("package.json` as a planned SDK output") &&
      readme.includes("src/**") &&
      readme.includes("scripts/**") &&
      readme.includes("specs/**") &&
      readme.includes("cep-panel/**") &&
      readme.includes(".codex-audit/<operation>-sdk-write-failure-diagnostics.md") &&
      readme.includes(".codex-runtime/sdk/operations/<operation>-operation.json") &&
      readme.includes(".codex-runtime/sdk") &&
      readme.includes("SDK scope expansion acceptance gate") &&
      readme.includes("production-code` and `cep-panel` remain review-required") &&
      readme.includes("SDK scope expansion review packet gate") &&
      readme.includes("sdk-scope-expansion-review.v1") &&
      readme.includes(".codex-audit/sdk-scope-expansion-reviews") &&
      readme.includes(SDK_WRITE_LANE_READINESS_SCHEMA) &&
      readme.includes(".codex-audit/sdk-write-lane-readiness") &&
      readme.includes(SDK_WRITE_LANE_APPROVAL_DECISION_SCHEMA) &&
      readme.includes(".codex-audit/sdk-write-lane-approval-decisions") &&
      readme.includes(SDK_WRITE_LANE_ENABLEMENT_SCHEMA) &&
      readme.includes(".codex-audit/sdk-write-lane-enablement") &&
      readme.includes(SDK_LAUNCH_GOVERNANCE_SCHEMA) &&
      readme.includes(SDK_LAUNCH_GOVERNANCE_DIRECTORY) &&
      readme.includes('state:"local-gated"') &&
      readme.includes(SDK_LAUNCH_GOVERNANCE_DRIFT_REPORT_SCHEMA) &&
      readme.includes("docs-audit") &&
      readme.includes("production-code") &&
      readme.includes("cep-panel") &&
      readme.includes("forbidden paths"),
    "README does not document the M114 write-capable runner operation envelope scaffold",
    failures,
  );

  if (failures.length > 0) {
    console.error("M114 contract smoke failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("PASS M136 SDK orchestrator contract smoke");
  console.log("Invalid general CLI values rejected before SDK thread creation");
  console.log("Write-capable scopes:");
  for (const scope of WRITE_SCOPES) {
    console.log(`- ${scope}`);
  }
  console.log("Unsafe flags rejected:");
  for (const flag of REJECTED_BUFFERED_FLAGS) {
    console.log(`- --${flag}`);
  }
  console.log("Write-capable unsafe flags rejected:");
  for (const flag of UNSAFE_WRITE_RUNNER_FLAGS) {
    console.log(`- --${flag}`);
  }
  console.log("Write-capable local dry-run mode: pass");
  console.log("Write-capable operation envelope mode: pass");
  console.log("Write-capable docs-audit sdk-write mode: pass");
  console.log("Write-capable orchestrator controlled-output sdk-write mode: pass");
  console.log("Write-capable orchestrator fixture JSON sdk-write mode: pass");
  console.log("Write-capable sdk-write parent directory normalization mode: pass");
  console.log("Write-capable sdk-write scope expansion gate: pass");
  console.log("SDK scope expansion review packet gate: pass");
  console.log("SDK scope expansion review packet files: pass");
  console.log("SDK write lane readiness packet gate: pass");
  console.log("SDK write lane readiness packet files: pass");
  console.log("SDK write lane approval decision packet gate: pass");
  console.log("SDK write lane approval decision packet files: pass");
  console.log("SDK write lane enablement packet gate: pass");
  console.log("SDK write lane enablement packet files: pass");
  console.log("SDK launch governance packet gate: pass");
  console.log("SDK launch governance packet files: pass");
  console.log("SDK launch governance drift report: pass");
  console.log("SDK launch governance report command: pass");
  console.log("SDK governance report parser smoke: pass");
  console.log("SDK multi-file planned operation constants: pass");
  console.log("Write-capable sdk-write diagnostic logging mode: pass");
  console.log("Write-capable sdk runtime fallback mode: pass");
  console.log("SDK reusable core extraction smoke: pass");
  console.log("SDK AE Agent adapter config smoke: pass");
  console.log("SDK historical smoke migration smoke: pass");
  console.log("SDK historical archive move smoke: pass");
  console.log("SDK runner split review smoke: pass");
  console.log("SDK buffered acceptance split review smoke: pass");
}

async function printGovernanceReport() {
  const report = await buildCommittedSdkLaunchGovernanceReport();
  console.log(JSON.stringify(report, null, 2));
}

async function runBufferedAcceptance({ milestonePath, reportPath }) {
  fs.mkdirSync(path.join(".codex", "sdk", "logs"), { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });

  if (!fs.existsSync(milestonePath)) {
    console.error(`Milestone file not found: ${milestonePath}`);
    process.exit(1);
  }

  const checks = {
    repo,
    statusBefore: sh("git status --short --branch"),
    log: sh("git log --oneline -8"),
    nodeCheck: sh("node --check orchestrator\\codex-sdk-orchestrator.mjs"),
    rulesCheck: sh("npm.cmd run check:rules"),
    diffCheck: sh("git diff --check"),
    diffNameOnlyBefore: sh("git diff --name-only"),
  };

  const prompt = `
You are running a buffered Codex SDK acceptance review.

IMPORTANT EXECUTION MODE:
- Analyze only.
- Do not edit files.
- Do not commit.
- Do not run external-provider validation.
- Do not run OpenAI CLI planner validation.
- Do not run mutating-live.
- Do not modify production code.
- Do not modify CEP panel code.
- Do not bypass tenant policy.
- Do not run broad npm/cache/network diagnostics.
- The host wrapper will write your final response to the acceptance report file.

Repository:
${repo}

Milestone file:
${milestonePath}

Acceptance report output path:
${reportPath}

SDK thread options forced by host wrapper:
${JSON.stringify(BUFFERED_ACCEPTANCE_THREAD_OPTIONS, null, 2)}

Pre-run checks:
${JSON.stringify(checks, null, 2)}

Milestone:
--- BEGIN MILESTONE ---
${readIfExists(milestonePath, 30000)}
--- END MILESTONE ---

Current handoff:
--- BEGIN HANDOFF ---
${readIfExists(".codex/handoff.md", 40000)}
--- END HANDOFF ---

Orchestrator README:
--- BEGIN README ---
${readIfExists("orchestrator/README.md", 40000)}
--- END README ---

Orchestrator source:
--- BEGIN ORCHESTRATOR SOURCE ---
${readIfExists("orchestrator/codex-sdk-orchestrator.mjs", 60000)}
--- END ORCHESTRATOR SOURCE ---

package.json:
--- BEGIN PACKAGE ---
${readIfExists("package.json", 20000)}
--- END PACKAGE ---

Write the final acceptance report in this exact structure:

# M107 SDK Orchestrator Acceptance Smoke

## Result
pass | partial | fail

## What was checked

## Pre-run validation

## Orchestrator readiness

## Risks

## Blocked items

## Next safe milestone

## Commands allowed next

## Commands forbidden

## Notes
`;

  const { Codex } = await import("@openai/codex-sdk");
  const codex = new Codex();

  const maybeThread = codex.startThread(BUFFERED_ACCEPTANCE_THREAD_OPTIONS);

  const thread =
    maybeThread && typeof maybeThread.then === "function" ? await maybeThread : maybeThread;

  const turn = await thread.run(prompt);

  const finalResponse =
    turn?.finalResponse ??
    turn?.final_response ??
    (typeof turn === "string" ? turn : serialize(turn));

  fs.writeFileSync(reportPath, finalResponse, "utf8");

  const id = `${stamp()}-m107-buffered-acceptance`;

  fs.writeFileSync(`.codex/sdk/logs/${id}-turn.json`, serialize(turn), "utf8");
  fs.writeFileSync(`.codex/sdk/logs/${id}-checks.json`, serialize(checks), "utf8");
  fs.writeFileSync(
    `.codex/sdk/logs/${id}-status-after.txt`,
    sh("git status --short --branch"),
    "utf8",
  );
  fs.writeFileSync(`.codex/sdk/logs/${id}-diff-check.txt`, sh("git diff --check"), "utf8");
  fs.writeFileSync(
    `.codex/sdk/logs/${id}-diff-name-only.txt`,
    sh("git diff --name-only"),
    "utf8",
  );

  console.log(`Buffered acceptance report written: ${reportPath}`);
  console.log(`SDK log prefix: .codex/sdk/logs/${id}`);
  console.log("");
  console.log("Review now:");
  console.log("  git status --short --branch");
  console.log("  git diff --check");
  console.log("  git diff --name-only");
  console.log("  git diff");
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseBufferedAcceptanceArgs(argv);

  if (options.help) {
    printHelp();
    return;
  }

  if (options.contractSmoke) {
    await runContractSmoke();
    return;
  }

  if (options.governanceReport) {
    await printGovernanceReport();
    return;
  }

  await runBufferedAcceptance(options);
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
