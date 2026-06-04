import {
  mkdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  createSdkWriteFallbackReport,
  diagnosticMessage,
  errorDiagnostic,
} from "./failure-diagnostics.mjs";
import { normalizeRepoPath as defaultNormalizeRepoPath } from "./path-policy.mjs";

function requireRuntimeStorePolicy(policy = {}) {
  const requiredKeys = [
    "primaryRuntimeDirectory",
    "fallbackRuntimeDirectory",
    "runtimeSubdirectories",
    "fallbackReportDirectory",
  ];
  const missing = requiredKeys.filter((key) => policy[key] === undefined);

  if (missing.length > 0) {
    throw new Error(`Missing SDK runtime store policy fields: ${missing.join(", ")}`);
  }

  if (!Array.isArray(policy.runtimeSubdirectories) || policy.runtimeSubdirectories.length === 0) {
    throw new Error("Missing SDK runtime store policy fields: runtimeSubdirectories");
  }

  return {
    ...policy,
    fallbackReportDirectory: String(policy.fallbackReportDirectory),
    fallbackRuntimeDirectory: String(policy.fallbackRuntimeDirectory),
    normalizeRepoPath: policy.normalizeRepoPath || defaultNormalizeRepoPath,
    primaryRuntimeDirectory: String(policy.primaryRuntimeDirectory),
    runtimeSubdirectories: Object.freeze([...policy.runtimeSubdirectories]),
  };
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function sanitizeLogId(value) {
  return String(value ?? "operation")
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function runtimeRepoPath(contract, ...parts) {
  return contract.normalizeRepoPath(path.posix.join(...parts.filter(Boolean)));
}

function repoPathToAbsolute(contract, cwd, repoPath) {
  return path.join(cwd, ...contract.normalizeRepoPath(repoPath).split("/"));
}

function createRuntimeProbeFileName(label) {
  return `.codex-runtime-probe-${process.pid}-${Date.now()}-${sanitizeLogId(label)}.tmp`;
}

function createRuntimeDirectories(contract, runtimePath) {
  return {
    logs: runtimeRepoPath(contract, runtimePath, "logs"),
    operations: runtimeRepoPath(contract, runtimePath, "operations"),
  };
}

function probeSdkRuntime(cwd, contract, runtimePath, hooks = {}) {
  const mkdir = hooks.mkdirSync || mkdirSync;
  const writeFile = hooks.writeFileSync || writeFileSync;
  const unlink = hooks.unlinkSync || unlinkSync;
  const directories = createRuntimeDirectories(contract, runtimePath);
  const checks = [];

  for (const name of contract.runtimeSubdirectories) {
    const directoryPath = directories[name];
    const absoluteDirectoryPath = repoPathToAbsolute(contract, cwd, directoryPath);
    const absoluteProbePath = path.join(absoluteDirectoryPath, createRuntimeProbeFileName(name));
    const probePath = contract.normalizeRepoPath(path.relative(cwd, absoluteProbePath));

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

export function resolveSdkRuntimePaths(cwd = process.cwd(), policy = {}, hooks = {}) {
  const contract = requireRuntimeStorePolicy(policy);
  const primaryProbe = probeSdkRuntime(cwd, contract, contract.primaryRuntimeDirectory, hooks);
  const fallbackProbe = probeSdkRuntime(cwd, contract, contract.fallbackRuntimeDirectory, hooks);
  const selectedProbe = primaryProbe.writable ? primaryProbe : fallbackProbe;
  const selectedRuntimePath = selectedProbe.runtimePath;
  const selectedDirectories = createRuntimeDirectories(contract, selectedRuntimePath);
  const reasonSelected = primaryProbe.writable
    ? "primary-runtime-writable"
    : fallbackProbe.writable
      ? `primary-runtime-unavailable; fallback-runtime-writable: ${primaryProbe.reason}`
      : `primary-and-fallback-runtime-unavailable; diagnostic-report-only: primary=${primaryProbe.reason}; fallback=${fallbackProbe.reason}`;

  return {
    fallbackProbe,
    fallbackRuntimePath: contract.fallbackRuntimeDirectory,
    fallbackWritable: fallbackProbe.writable,
    primaryProbe,
    primaryRuntimePath: contract.primaryRuntimeDirectory,
    primaryWritable: primaryProbe.writable,
    reasonSelected,
    selectedLogDirectory: selectedDirectories.logs,
    selectedOperationDirectory: selectedDirectories.operations,
    selectedRuntimePath,
    selectedRuntimeWritable: selectedProbe.writable,
  };
}

export function createSdkWriteFallbackReportPath(operationId, policy = {}) {
  const contract = requireRuntimeStorePolicy(policy);
  return contract.normalizeRepoPath(
    path.posix.join(
      contract.fallbackReportDirectory,
      `${sanitizeLogId(operationId)}-sdk-write-failure-diagnostics.md`,
    ),
  );
}

export function createSdkWriteOperationFallbackPath(
  operationId,
  runtimePreflight = null,
  policy = {},
) {
  const contract = requireRuntimeStorePolicy(policy);
  const operationDirectory =
    runtimePreflight?.selectedOperationDirectory ||
    runtimeRepoPath(contract, contract.fallbackRuntimeDirectory, "operations");
  return runtimeRepoPath(contract, operationDirectory, `${sanitizeLogId(operationId)}-operation.json`);
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

export function writeSdkWriteLog(cwd, operationId, payload, policy = {}, hooks = {}) {
  const contract = requireRuntimeStorePolicy(policy);
  const mkdir = hooks.mkdirSync || mkdirSync;
  const writeFile = hooks.writeFileSync || writeFileSync;
  const runtimePreflight =
    hooks.runtimePreflight ||
    (hooks.resolveSdkRuntimePaths
      ? hooks.resolveSdkRuntimePaths(cwd, hooks)
      : resolveSdkRuntimePaths(cwd, contract, hooks));
  const logDirectory = repoPathToAbsolute(contract, cwd, runtimePreflight.selectedLogDirectory);
  const logPath = path.join(
    logDirectory,
    `${stamp()}-${sanitizeLogId(operationId)}-sdk-write.json`,
  );
  const attemptedPath = contract.normalizeRepoPath(path.relative(cwd, logPath));
  const payloadWithRuntime = {
    ...payload,
    runtimePreflight,
  };

  try {
    mkdir(logDirectory, { recursive: true });
    writeFile(logPath, `${serialize(payloadWithRuntime)}\n`, "utf8");
  } catch (error) {
    const fallbackReportPath = createSdkWriteFallbackReportPath(operationId, contract);
    const fallbackOperationPath = createSdkWriteOperationFallbackPath(
      operationId,
      runtimePreflight,
      contract,
    );
    const fallbackAbsolutePath = path.join(cwd, ...fallbackReportPath.split("/"));
    const fallbackReport = createSdkWriteFallbackReport(
      {
        attemptedLogPath: attemptedPath,
        fallbackOperationPath,
        logWriteError: error,
        operationId,
        payload: payloadWithRuntime,
      },
      contract,
    );
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
    fallbackOperationPath: createSdkWriteOperationFallbackPath(operationId, runtimePreflight, contract),
    fallbackReportPath: null,
    fallbackReportWriteError: null,
    fallbackReportWritten: false,
    path: attemptedPath,
    runtimePreflight,
    attemptedFallbackReportPath: createSdkWriteFallbackReportPath(operationId, contract),
    attemptedPath,
  };
}

export function createSdkRuntimeStoreHelpers(policy = {}) {
  const contract = requireRuntimeStorePolicy(policy);

  return Object.freeze({
    createSdkWriteFallbackReportPath(operationId) {
      return createSdkWriteFallbackReportPath(operationId, contract);
    },
    createSdkWriteOperationFallbackPath(operationId, runtimePreflight = null) {
      return createSdkWriteOperationFallbackPath(operationId, runtimePreflight, contract);
    },
    resolveSdkRuntimePaths(cwd = process.cwd(), hooks = {}) {
      return resolveSdkRuntimePaths(cwd, contract, hooks);
    },
    writeSdkWriteLog(cwd, operationId, payload, hooks = {}) {
      return writeSdkWriteLog(cwd, operationId, payload, contract, hooks);
    },
  });
}
