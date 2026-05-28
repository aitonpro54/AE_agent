import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export const DEFAULT_PROOF_ENVELOPE_MAX_BYTES = 32 * 1024;
export const DEFAULT_PARENT_OUTPUT_MAX_BYTES = 32 * 1024;
export const DEFAULT_COMPACT_LIST_LIMIT = 10;

export function normalizeRepoPath(value) {
  return String(value || "").replace(/\\/g, "/");
}

export function sha256Text(value) {
  return createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

export function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

export function sha256Json(value) {
  return sha256Text(stableStringify(value));
}

export function sha256FileIfExists(filePath) {
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    return null;
  }
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export function artifactRef(targetRepo, filePath) {
  if (!filePath) {
    return null;
  }
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(targetRepo, filePath);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    return {
      bytes: null,
      path: normalizeRepoPath(path.relative(targetRepo, absolute)) || normalizeRepoPath(absolute),
      sha256: null,
    };
  }
  const stats = statSync(absolute);
  return {
    bytes: stats.size,
    path: normalizeRepoPath(path.relative(targetRepo, absolute)) || normalizeRepoPath(absolute),
    sha256: sha256FileIfExists(absolute),
  };
}

export function writeJsonArtifact(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return filePath;
}

export function writeBoundedJsonArtifact(filePath, value, maxBytes, label) {
  writeJsonArtifact(filePath, value);
  const size = statSync(filePath).size;
  if (size > maxBytes) {
    throw new Error(`${label || "json-artifact"}-too-large:${size}>${maxBytes}`);
  }
  return {
    bytes: size,
    path: filePath,
    sha256: sha256FileIfExists(filePath),
  };
}

export function compactList(values, limit = DEFAULT_COMPACT_LIST_LIMIT) {
  const unique = Array.from(new Set((values || []).map((entry) => String(entry || "")).filter(Boolean)));
  return {
    count: unique.length,
    ids: unique.slice(0, limit),
    truncated: unique.length > limit,
  };
}

export function compactBlockers(blockers, limit = DEFAULT_COMPACT_LIST_LIMIT) {
  const entries = Array.isArray(blockers) ? blockers : [];
  return {
    count: entries.length,
    entries: entries.slice(0, limit).map((entry) => ({
      code: entry?.code || "unknown",
      message: String(entry?.message || entry?.reason || entry?.code || "").slice(0, 512),
    })),
    truncated: entries.length > limit,
  };
}

export function assertRequiredProofHashes(envelope, requiredHashFields, label) {
  const missing = requiredHashFields.filter((field) => {
    const value = envelope[field];
    return typeof value !== "string" || value.length === 0;
  });
  envelope.missingRequiredHashes = missing;
  envelope.contractComplete = missing.length === 0;
  if (missing.length > 0) {
    throw new Error(`${label || "proof-envelope"}-missing-required-hashes:${missing.join(",")}`);
  }
  return envelope;
}

export function assertNoForbiddenParentKeys(value, label) {
  const text = JSON.stringify(value);
  for (const forbidden of [
    '"items"',
    '"runList"',
    '"tickets"',
    '"prompt"',
    '"stdout"',
    '"stderr"',
    '"transcript"',
    '"runtimeState"',
  ]) {
    if (text.includes(forbidden)) {
      throw new Error(`${label || "parent-output"}-forbidden-key:${forbidden}`);
    }
  }
}

export function boundedParentOutput(value, label, maxBytes = DEFAULT_PARENT_OUTPUT_MAX_BYTES) {
  assertNoForbiddenParentKeys(value, label);
  const text = `${JSON.stringify(value, null, 2)}\n`;
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > maxBytes) {
    throw new Error(`${label || "parent-output"}-too-large:${bytes}>${maxBytes}`);
  }
  return text;
}

