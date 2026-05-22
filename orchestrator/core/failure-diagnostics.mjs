export function errorDiagnostic(error) {
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

export function diagnosticMessage(error) {
  return errorDiagnostic(error)?.message || null;
}

function requireFailureDiagnosticsPolicy(policy = {}) {
  const requiredKeys = ["primaryRuntimeDirectory", "fallbackRuntimeDirectory"];
  const missing = requiredKeys.filter((key) => policy[key] === undefined);

  if (missing.length > 0) {
    throw new Error(`Missing SDK failure diagnostics policy fields: ${missing.join(", ")}`);
  }

  return {
    ...policy,
    fallbackRuntimeDirectory: String(policy.fallbackRuntimeDirectory),
    primaryRuntimeDirectory: String(policy.primaryRuntimeDirectory),
  };
}

export function createSdkWriteFallbackReport(
  {
    attemptedLogPath,
    fallbackOperationPath,
    logWriteError,
    operationId,
    payload,
  },
  policy = {},
) {
  const contract = requireFailureDiagnosticsPolicy(policy);
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
    `- primary runtime path: ${runtimePreflight?.primaryRuntimePath || contract.primaryRuntimeDirectory}`,
    `- primary runtime writable: ${runtimePreflight ? runtimePreflight.primaryWritable : "unknown"}`,
    `- fallback runtime path: ${runtimePreflight?.fallbackRuntimePath || contract.fallbackRuntimeDirectory}`,
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
