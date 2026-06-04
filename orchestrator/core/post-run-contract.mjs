import {
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  normalizeRepoPath as defaultNormalizeRepoPath,
  uniqueSortedRepoPaths,
} from "./path-policy.mjs";

function isPathInsideDirectory(candidatePath, directoryPath) {
  const relative = path.relative(directoryPath, candidatePath);
  return relative === "" || (relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function requireFunction(policy, key) {
  if (typeof policy[key] !== "function") {
    throw new Error(`Missing post-run contract core policy fields: ${key}`);
  }
}

function requirePostRunContractPolicy(policy = {}) {
  const requiredFunctions = [
    "collectPathsChangedSincePre",
    "createSdkWritePlannedPathCheck",
    "getPathContractViolations",
    "isForbiddenPath",
    "validateScope",
  ];

  for (const key of requiredFunctions) {
    requireFunction(policy, key);
  }

  const requiredValues = [
    "docsAuditScope",
    "productionCodeScope",
  ];
  const missingValues = requiredValues.filter((key) => policy[key] === undefined);
  if (missingValues.length > 0) {
    throw new Error(`Missing post-run contract core policy fields: ${missingValues.join(", ")}`);
  }

  return {
    ...policy,
    allowedImplementationReportPaths: Object.freeze([
      ...(policy.allowedImplementationReportPaths || []),
    ]),
    normalizeRepoPath: policy.normalizeRepoPath || defaultNormalizeRepoPath,
  };
}

function uniqueSorted(values, normalizeRepoPath = defaultNormalizeRepoPath) {
  return uniqueSortedRepoPaths(values).map(normalizeRepoPath);
}

function summarizePathViolations(violations) {
  return violations.map((violation) => `${violation.path} (${violation.reason})`).join(", ");
}

export function evaluatePreRunGitState(snapshot, options = {}, policy = {}) {
  requireFunction(policy, "isForbiddenPath");

  const normalizeRepoPath = policy.normalizeRepoPath || defaultNormalizeRepoPath;
  const changedPaths = uniqueSorted(snapshot.changedPaths || [], normalizeRepoPath);
  const acknowledged = uniqueSorted(options.acknowledgedExistingChanges || [], normalizeRepoPath);

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
  const forbiddenExisting = changedPaths.filter(policy.isForbiddenPath);

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

export function assertPreRunGitState(snapshot, options = {}, policy = {}) {
  const state = evaluatePreRunGitState(snapshot, options, policy);

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

export function validatePostRunContract(
  { postSnapshot, preSnapshot, scope, validationResult } = {},
  policy = {},
) {
  const contract = requirePostRunContractPolicy(policy);

  contract.validateScope(scope);
  assertValidationResult(validationResult);

  const changedSincePre = contract.collectPathsChangedSincePre(preSnapshot, postSnapshot);
  const violations = contract.getPathContractViolations(scope, changedSincePre);

  if (violations.length > 0) {
    const forbidden = violations.filter((violation) => violation.reason === "forbidden-path");
    const summary = summarizePathViolations(violations);

    if (forbidden.length > 0) {
      throw new Error(`Forbidden path diff detected after write-capable run: ${summary}`);
    }

    throw new Error(`Path allowlist violation after write-capable run: ${summary}`);
  }

  return { changedSincePre, violations };
}

function isDirectoryChangedPath(cwd, repoPath, normalizeRepoPath) {
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

export function enumerateDirectoryFileChildren(cwd, directoryRepoPath, policy = {}) {
  const normalizeRepoPath = policy.normalizeRepoPath || defaultNormalizeRepoPath;
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
  return uniqueSorted(children, normalizeRepoPath);
}

export function validateSdkWriteDiffAllowlist(
  {
    allowedImplementationReportPaths,
    directoryChildEnumerator,
    plannedPaths,
    postSnapshot,
    preSnapshot,
    scope,
    validationResult,
  } = {},
  policy = {},
) {
  const contract = requirePostRunContractPolicy(policy);

  assertValidationResult(validationResult);

  const normalizeRepoPath = contract.normalizeRepoPath;
  const normalizedPlannedPaths = uniqueSorted(plannedPaths || [], normalizeRepoPath);
  const plannedPathCheck = contract.createSdkWritePlannedPathCheck(scope, normalizedPlannedPaths);
  if (!plannedPathCheck.allowed) {
    throw new Error(
      `sdk-write planned path contract failed: ${summarizePathViolations(
        plannedPathCheck.violations,
      )}`,
    );
  }

  const changedSincePre = contract.collectPathsChangedSincePre(preSnapshot, postSnapshot);
  const enumerator =
    directoryChildEnumerator ||
    ((repoPath) =>
      enumerateDirectoryFileChildren(postSnapshot?.cwd || process.cwd(), repoPath, contract));
  const normalizedChangedFiles = [];
  const normalizedDirectoryEntries = [];

  for (const repoPath of changedSincePre) {
    if (
      contract.isForbiddenPath(repoPath) ||
      !isDirectoryChangedPath(postSnapshot?.cwd, repoPath, normalizeRepoPath)
    ) {
      normalizedChangedFiles.push(repoPath);
      continue;
    }

    normalizedDirectoryEntries.push(repoPath);

    let childPaths = [];
    try {
      childPaths = uniqueSorted(enumerator(repoPath), normalizeRepoPath);
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

  const actualChangedFiles = uniqueSorted(normalizedChangedFiles, normalizeRepoPath);
  const implementationReportPaths =
    allowedImplementationReportPaths ?? contract.allowedImplementationReportPaths;
  const allowedPaths = uniqueSorted(
    [
      ...normalizedPlannedPaths,
      ...implementationReportPaths,
    ],
    normalizeRepoPath,
  );
  const forbidden = actualChangedFiles.filter(contract.isForbiddenPath);

  if (forbidden.length > 0) {
    throw new Error(`Forbidden path diff detected after sdk-write run: ${forbidden.join(", ")}`);
  }

  const outOfScopeFiles = actualChangedFiles.filter((repoPath) => !allowedPaths.includes(repoPath));
  if (outOfScopeFiles.length > 0) {
    const allowlistLabel =
      scope === contract.docsAuditScope ? "docs-audit sdk-write" : `${scope} sdk-write`;
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
    allowedImplementationReportPaths: uniqueSorted(implementationReportPaths, normalizeRepoPath),
    allowedPaths,
    missingPlannedChanges,
    normalizedDirectoryEntries,
    outOfScopeFiles,
    plannedPaths: normalizedPlannedPaths,
    rawChangedSincePre: changedSincePre,
    verdict: "pass",
  };
}

export function validateSdkWritePlannedPathPrecondition(
  {
    pathExists = () => false,
    plannedPaths = [],
    scope,
  } = {},
  policy = {},
) {
  const contract = requirePostRunContractPolicy(policy);
  const normalizedPlannedPaths = uniqueSorted(plannedPaths, contract.normalizeRepoPath);
  const existingPlannedPaths = normalizedPlannedPaths.filter((repoPath) => pathExists(repoPath));
  const missingPlannedPaths = normalizedPlannedPaths.filter((repoPath) => !pathExists(repoPath));

  if (scope === contract.productionCodeScope) {
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

export function createPostRunContractHelpers(policy = {}) {
  const contract = requirePostRunContractPolicy(policy);

  return Object.freeze({
    assertPreRunGitState(snapshot, options = {}) {
      return assertPreRunGitState(snapshot, options, contract);
    },
    assertValidationResult,
    enumerateDirectoryFileChildren(cwd, directoryRepoPath) {
      return enumerateDirectoryFileChildren(cwd, directoryRepoPath, contract);
    },
    evaluatePreRunGitState(snapshot, options = {}) {
      return evaluatePreRunGitState(snapshot, options, contract);
    },
    validatePostRunContract(options = {}) {
      return validatePostRunContract(options, contract);
    },
    validateSdkWriteDiffAllowlist(options = {}) {
      return validateSdkWriteDiffAllowlist(options, contract);
    },
    validateSdkWritePlannedPathPrecondition(options = {}) {
      return validateSdkWritePlannedPathPrecondition(options, contract);
    },
  });
}
