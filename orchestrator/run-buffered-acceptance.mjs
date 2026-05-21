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

const SUPPORTED_BUFFERED_FLAGS = new Set(["contract-smoke", "help"]);

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
    SDK_SCOPE_EXPANSION_REVIEW_DIRECTORY,
    SDK_SCOPE_EXPANSION_REVIEW_SCHEMA,
    SDK_WRITE_ALLOWED_SCOPES,
    SDK_WRITE_ORCHESTRATOR_FIXTURE_JSON_PLANNED_PATH_ALLOWLIST,
    SDK_WRITE_ORCHESTRATOR_PLANNED_PATH_ALLOWLIST,
    SDK_WRITE_PLANNED_PATH_ALLOWLIST,
    SDK_WRITE_REVIEW_REQUIRED_SCOPES,
    SCOPE_PATH_ALLOWLISTS,
    UNSAFE_WRITE_RUNNER_FLAGS,
    WRITE_SCOPES,
    runWriteCapableContractSmoke,
    validateSdkScopeExpansionReviewPacket,
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
      writeScaffoldSmoke?.sdkWriteAllowedScopes?.join(",") === "docs-audit,orchestrator" &&
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
      writeScaffoldSmoke?.sdkWriteProductionCodeEnabled === false &&
      writeScaffoldSmoke?.sdkWriteCepPanelEnabled === false &&
      writeScaffoldSmoke?.sdkWriteReviewRequiredScopes?.join(",") ===
        SDK_WRITE_REVIEW_REQUIRED_SCOPES.join(",") &&
      writeScaffoldSmoke?.sdkWriteScopeExpansionSdkThreadCreated === false &&
      writeScaffoldSmoke?.sdkWriteScopeExpansionRealWriteWork === false,
    "M127 sdk-write scope expansion gate did not keep production-code and cep-panel review-required",
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

  const reviewPacketFiles = collectSdkScopeExpansionReviewPackets(
    SDK_SCOPE_EXPANSION_REVIEW_DIRECTORY,
    validateSdkScopeExpansionReviewPacket,
  );
  for (const failure of reviewPacketFiles.failures) {
    assertContract(false, `M129 SDK scope expansion review packet file failed: ${failure}`, failures);
  }
  const firstReviewPacket = reviewPacketFiles.packets.find(
    (packet) =>
      packet.path ===
      `${SDK_SCOPE_EXPANSION_REVIEW_DIRECTORY}/129-production-code-smoke-harness-review.json`,
  );
  assertContract(
    firstReviewPacket?.decision === "proposed" &&
      firstReviewPacket?.scope === "production-code" &&
      firstReviewPacket?.sdkWriteEnabled === false &&
      firstReviewPacket?.plannedPathAllowlist?.includes("scripts/provider-contract-smoke.js"),
    "M129 first SDK scope expansion review packet was not validated",
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
    SDK_WRITE_ALLOWED_SCOPES.join(",") === "docs-audit,orchestrator" &&
      SDK_WRITE_ORCHESTRATOR_PLANNED_PATH_ALLOWLIST.join(",") === "orchestrator/**" &&
      SDK_WRITE_ORCHESTRATOR_FIXTURE_JSON_PLANNED_PATH_ALLOWLIST.join(",") ===
        "orchestrator/fixtures/sdk-write/**",
    "M125 orchestrator sdk-write scope allowlist is not restricted to orchestrator controlled outputs",
    failures,
  );
  assertContract(
    FORBIDDEN_PATH_PATTERNS.includes("node_modules/**") &&
      FORBIDDEN_PATH_PATTERNS.includes(".git/**") &&
      FORBIDDEN_PATH_PATTERNS.includes("mcp-config.json") &&
      FORBIDDEN_PATH_PATTERNS.includes("**/*.pem"),
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

  console.log("PASS M132 SDK orchestrator contract smoke");
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
  console.log("Write-capable sdk-write diagnostic logging mode: pass");
  console.log("Write-capable sdk runtime fallback mode: pass");
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
