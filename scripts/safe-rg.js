"use strict";

const { spawn } = require("child_process");
const path = require("path");

const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024;
const SAFE_EXCLUDE_GLOBS = [
  "!plans/archive/**",
  "!.codex/sdk/logs/**",
  "!.codex-runtime/**",
  "!logs/**",
  "!node_modules/**"
];

const FORBIDDEN_ROOTS = [
  ".codex",
  ".codex/sdk",
  ".codex/sdk/logs",
  ".codex-runtime",
  "plans/archive",
  "logs",
  "node_modules"
];

const ALLOWED_EXACT_PATHS = new Set([".codex/handoff.md"]);

function usage() {
  return [
    "Usage: node scripts/safe-rg.js <rg args>",
    "",
    "Safe wrapper around ripgrep for repository searches.",
    "It rejects broad generated/archive roots, applies deny globs, and caps output.",
    "",
    "Use exact compact files such as .codex/handoff.md, or purpose-built status scripts",
    "for generated runtime evidence."
  ].join("\n");
}

function maxOutputBytes() {
  const raw = process.env.SAFE_RG_MAX_OUTPUT_BYTES || String(DEFAULT_MAX_OUTPUT_BYTES);
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_OUTPUT_BYTES;
}

function normalizePathLike(value) {
  let candidate = String(value || "");
  if (candidate.startsWith("!")) {
    candidate = candidate.slice(1);
  }
  if (path.isAbsolute(candidate)) {
    candidate = path.relative(process.cwd(), candidate);
  }
  return candidate
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/+$/g, "");
}

function isForbiddenPathArg(arg) {
  if (!arg || arg === "-") return null;
  if (arg === "--help" || arg === "-h") return null;
  if (arg.startsWith("-")) return null;

  const normalized = normalizePathLike(arg);
  if (!normalized) return null;
  if (ALLOWED_EXACT_PATHS.has(normalized)) return null;

  for (const root of FORBIDDEN_ROOTS) {
    if (normalized === root || normalized.startsWith(`${root}/`)) {
      return root;
    }
  }
  return null;
}

function validateArgs(args) {
  for (const arg of args) {
    const forbiddenRoot = isForbiddenPathArg(arg);
    if (forbiddenRoot) {
      throw new Error(
        `safe-rg-forbidden-path: ${arg} matches ${forbiddenRoot}; use a compact status script or an exact allowed file`
      );
    }
  }
}

function guardedArgs(args) {
  const denyGlobs = SAFE_EXCLUDE_GLOBS.flatMap((glob) => ["--glob", glob]);
  return [...args, ...denyGlobs];
}

function run() {
  const args = process.argv.slice(2);
  if (args.includes("--safe-rg-help")) {
    process.stdout.write(`${usage()}\n`);
    return Promise.resolve(0);
  }

  validateArgs(args);

  const limit = maxOutputBytes();
  const child = spawn("rg", guardedArgs(args), {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    windowsHide: true
  });

  let totalBytes = 0;
  let limitExceeded = false;

  function forward(stream, chunk) {
    if (limitExceeded) return;
    const remaining = Math.max(0, limit - totalBytes);
    if (remaining > 0) {
      stream.write(chunk.subarray(0, remaining));
    }
    totalBytes += chunk.length;
    if (totalBytes > limit) {
      limitExceeded = true;
      child.kill();
    }
  }

  child.stdout.on("data", (chunk) => forward(process.stdout, chunk));
  child.stderr.on("data", (chunk) => forward(process.stderr, chunk));

  return new Promise((resolve) => {
    child.on("error", (error) => {
      process.stderr.write(`safe-rg-spawn-failed: ${error.message}\n`);
      resolve(2);
    });

    child.on("close", (code, signal) => {
      if (limitExceeded) {
        process.stderr.write(
          `\nsafe-rg-output-limit-exceeded: capped at ${limit} bytes; narrow the path, pattern, or use a compact report\n`
        );
        resolve(2);
        return;
      }
      if (signal) {
        process.stderr.write(`safe-rg-ripgrep-stopped: ${signal}\n`);
        resolve(2);
        return;
      }
      resolve(code ?? 2);
    });
  });
}

run()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  });
