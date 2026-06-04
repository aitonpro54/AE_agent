import {
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { normalizeRepoPath as defaultNormalizeRepoPath } from "./path-policy.mjs";

export function isPathInsideDirectory(candidatePath, directoryPath) {
  const relative = path.relative(directoryPath, candidatePath);
  return relative === "" || (relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function requireOperationEnvelopePolicy(policy = {}) {
  const requiredKeys = [
    "createPlannedPathCheck",
    "createSdkWritePlannedPathCheck",
    "dryRunMode",
    "modes",
    "requiredFields",
    "sdkWriteAllowedScopes",
    "sdkWriteMode",
    "scopes",
    "unsafeFields",
    "validatePromptPolicy",
    "validateScope",
    "version",
  ];
  const missing = requiredKeys.filter((key) => policy[key] === undefined);

  if (missing.length > 0) {
    throw new Error(`Missing operation envelope core policy fields: ${missing.join(", ")}`);
  }

  if (typeof policy.throwPlannedPathCheckError !== "function") {
    throw new Error("Missing operation envelope core policy fields: throwPlannedPathCheckError");
  }

  return {
    ...policy,
    modes: Object.freeze([...(policy.modes || [])]),
    normalizeRepoPath: policy.normalizeRepoPath || defaultNormalizeRepoPath,
    requiredFields: Object.freeze([...(policy.requiredFields || [])]),
    sdkWriteAllowedScopes: Object.freeze([...(policy.sdkWriteAllowedScopes || [])]),
    unsafeFields: Object.freeze([...(policy.unsafeFields || [])]),
  };
}

export function resolveOperationFilePath(operationFile, cwd = process.cwd(), policy = {}) {
  if (!operationFile) {
    throw new Error("Missing required --operation-file for write-capable dry-run mode.");
  }

  const normalizeRepoPath = policy.normalizeRepoPath || defaultNormalizeRepoPath;
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

export function parseOperationEnvelopeJson(text, source = "operation file", policy = {}) {
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

  return validateOperationEnvelope(parsed, policy);
}

export function validateOperationEnvelope(envelope, policy = {}) {
  const contract = requireOperationEnvelopePolicy(policy);

  for (const field of contract.unsafeFields) {
    if (Object.hasOwn(envelope, field)) {
      throw new Error(`Unsafe operation envelope field rejected: ${field}`);
    }
  }

  if (envelope.version !== contract.version) {
    throw new Error(
      `Unsupported operation envelope version: ${String(
        envelope.version,
      )}. Expected ${contract.version}.`,
    );
  }

  if (typeof envelope.operationId !== "string" || envelope.operationId.trim() === "") {
    throw new Error("Missing operation envelope operationId.");
  }

  if (typeof envelope.scope !== "string" || envelope.scope.trim() === "") {
    throw new Error(
      `Missing operation envelope scope. Expected one of: ${contract.scopes.join(", ")}.`,
    );
  }

  contract.validateScope(envelope.scope);

  if (!contract.modes.includes(envelope.mode)) {
    throw new Error(
      `Unsupported operation envelope mode: ${String(
        envelope.mode,
      )}. Expected one of: ${contract.modes.join(", ")}.`,
    );
  }

  if (
    envelope.mode === contract.sdkWriteMode &&
    !contract.sdkWriteAllowedScopes.includes(envelope.scope)
  ) {
    throw new Error(
      `sdk-write operation envelope scope rejected: ${envelope.scope}. Supported scopes: ${contract.sdkWriteAllowedScopes.join(", ")}.`,
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

  const plannedPaths = envelope.plannedPaths.map(contract.normalizeRepoPath);
  if (plannedPaths.some((repoPath) => repoPath === "")) {
    throw new Error("Operation envelope plannedPaths contains an empty path.");
  }

  contract.validatePromptPolicy(envelope.prompt);

  const plannedPathCheck =
    envelope.mode === contract.sdkWriteMode
      ? contract.createSdkWritePlannedPathCheck(envelope.scope, plannedPaths)
      : contract.createPlannedPathCheck(envelope.scope, plannedPaths);
  if (!plannedPathCheck.allowed) {
    contract.throwPlannedPathCheckError(plannedPathCheck);
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

export function loadOperationEnvelopeOptions(options = {}, policy = {}, hooks = {}) {
  const contract = requireOperationEnvelopePolicy(policy);
  const cwd = path.resolve(options.cwd || process.cwd());
  const resolved = resolveOperationFilePath(options.operationFile, cwd, contract);
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
    contract,
  );
  if (options.dryRun && operationEnvelope.mode !== contract.dryRunMode) {
    throw new Error(
      `Operation envelope mode ${operationEnvelope.mode} cannot be combined with --dry-run.`,
    );
  }

  if (!options.dryRun && operationEnvelope.mode === contract.dryRunMode) {
    throw new Error("Operation envelope mode dry-run requires --dry-run.");
  }

  return {
    ...options,
    dryRun: operationEnvelope.mode === contract.dryRunMode,
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
    sdkWrite: operationEnvelope.mode === contract.sdkWriteMode,
    scope: operationEnvelope.scope,
  };
}

export function createOperationEnvelopeHelpers(policy = {}) {
  const contract = requireOperationEnvelopePolicy(policy);

  return Object.freeze({
    loadOperationEnvelopeOptions(options = {}, hooks = {}) {
      return loadOperationEnvelopeOptions(options, contract, hooks);
    },
    parseOperationEnvelopeJson(text, source = "operation file") {
      return parseOperationEnvelopeJson(text, source, contract);
    },
    resolveOperationFilePath(operationFile, cwd = process.cwd()) {
      return resolveOperationFilePath(operationFile, cwd, contract);
    },
    validateOperationEnvelope(envelope) {
      return validateOperationEnvelope(envelope, contract);
    },
  });
}
