import path from "node:path";

export function normalizeRepoPath(value) {
  const raw = String(value ?? "").trim().replace(/\\/g, "/");
  const withoutDot = raw.replace(/^\.\//, "");
  const normalized = path.posix.normalize(withoutDot);
  return normalized === "." ? "" : normalized;
}

export function isUnsafeRepoPathShape(repoPath) {
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

export function uniqueSortedRepoPaths(values) {
  return [...new Set(values.filter(Boolean).map(normalizeRepoPath))].sort();
}

export function patternToRegExp(pattern) {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wildcarded = escaped.replace(/\\\*\\\*/g, ".*").replace(/\\\*/g, "[^/]*");
  return new RegExp(`^${wildcarded}$`);
}

export function matchesRepoPathPattern(repoPath, pattern) {
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

export function createPathPolicy({
  forbiddenPathPatterns,
  scopePathAllowlists,
  scopes,
}) {
  const scopeList = Object.freeze([...(scopes || [])]);
  const scopeAllowlists = Object.freeze({ ...(scopePathAllowlists || {}) });
  const forbiddenPatterns = Object.freeze([...(forbiddenPathPatterns || [])]);

  function validateScope(scope) {
    if (!scopeList.includes(scope)) {
      throw new Error(`Unknown write scope: ${scope}. Expected one of: ${scopeList.join(", ")}.`);
    }
  }

  function isForbiddenPath(repoPath) {
    if (isUnsafeRepoPathShape(repoPath)) {
      return true;
    }

    return forbiddenPatterns.some((pattern) => matchesRepoPathPattern(repoPath, pattern));
  }

  function isPathAllowedForScope(scope, repoPath) {
    validateScope(scope);

    if (isForbiddenPath(repoPath)) {
      return false;
    }

    return (scopeAllowlists[scope] || []).some((pattern) =>
      matchesRepoPathPattern(repoPath, pattern),
    );
  }

  function getPathContractViolations(scope, repoPaths) {
    validateScope(scope);

    return uniqueSortedRepoPaths(repoPaths).flatMap((repoPath) => {
      if (isUnsafeRepoPathShape(repoPath)) {
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

  function createPlannedPathCheck(scope, plannedPaths = []) {
    validateScope(scope);

    const normalizedPlannedPaths = uniqueSortedRepoPaths(plannedPaths);
    const violations = getPathContractViolations(scope, normalizedPlannedPaths);
    const violationPaths = new Set(violations.map((violation) => violation.path));

    return {
      allowed: violations.length === 0,
      allowedPaths: normalizedPlannedPaths.filter((repoPath) => !violationPaths.has(repoPath)),
      plannedPaths: normalizedPlannedPaths,
      violations,
    };
  }

  return Object.freeze({
    createPlannedPathCheck,
    getPathContractViolations,
    isForbiddenPath,
    isPathAllowedForScope,
    validateScope,
  });
}
