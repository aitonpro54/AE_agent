#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_RUN_ROOT_RELATIVE = ".codex-runtime/sdk/generic-repo-full-intake";
const PROOF_SCHEMA = "generic-repo-full-intake.proof-envelope.v1";
const PARALLEL_PROOF_SCHEMA = "generic-repo-full-intake.parallel-candidate-proof.v1";
const MAX_PROOF_BYTES = 32 * 1024;
const MAX_RUN_REPORT_BYTES = 64 * 1024;

function usage() {
  return [
    "Usage: node orchestrator/full-intake-proof.mjs --run-id <id> [options]",
    "",
    "Options:",
    "  --target-repo <path>    Repository root. Defaults to current directory.",
    "  --run-root <path>       Explicit full-intake run root.",
    "  --candidate <id>        Require candidate id match when present.",
    "  --compact-json          Print bounded proof summary.",
    "  --help                  Show this help.",
  ].join("\n");
}

function parseArgs(argv) {
  const options = { output: "text", targetRepo: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--run-id") options.runId = argv[++index];
    else if (arg === "--target-repo") options.targetRepo = argv[++index];
    else if (arg === "--run-root") options.runRoot = argv[++index];
    else if (arg === "--candidate") options.candidate = argv[++index];
    else if (arg === "--compact-json") options.output = "compact-json";
    else throw new Error(`unknown-argument: ${arg}`);
  }
  if (!options.help && !options.runId && !options.runRoot) {
    throw new Error("missing-run-id-or-run-root");
  }
  return options;
}

function normalize(value) {
  return String(value || "").replace(/\\/g, "/");
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function resolveRunRoot(options) {
  const targetRepo = path.resolve(options.targetRepo);
  if (options.runRoot) {
    return path.isAbsolute(options.runRoot) ? options.runRoot : path.resolve(targetRepo, options.runRoot);
  }
  return path.resolve(targetRepo, DEFAULT_RUN_ROOT_RELATIVE, options.runId);
}

function proofPathCandidates(runRoot) {
  return [
    path.join(runRoot, "proof-envelope.json"),
    path.join(runRoot, "parallel-candidates", "parallel-proof-envelope.json"),
  ];
}

function readCompactRunReport(runRoot) {
  const reportPath = path.join(runRoot, "run-report.json");
  if (!existsSync(reportPath) || !statSync(reportPath).isFile()) return null;
  const size = statSync(reportPath).size;
  if (size > MAX_RUN_REPORT_BYTES) return null;
  try {
    return JSON.parse(readFileSync(reportPath, "utf8"));
  } catch {
    return null;
  }
}

function readProof(options) {
  const runRoot = resolveRunRoot(options);
  const candidates = proofPathCandidates(runRoot);
  const proofPath = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  if (!proofPath) {
    throw new Error(`proof-envelope-missing:${candidates.map((candidate) => normalize(candidate)).join(",")}`);
  }
  const size = statSync(proofPath).size;
  if (size > MAX_PROOF_BYTES) {
    throw new Error(`proof-envelope-too-large:${size}>${MAX_PROOF_BYTES}`);
  }
  const proof = JSON.parse(readFileSync(proofPath, "utf8"));
  if (proof.schema !== PROOF_SCHEMA && proof.schema !== PARALLEL_PROOF_SCHEMA) {
    throw new Error(`proof-envelope-schema-mismatch:${proof.schema || "missing"}`);
  }
  if (options.runId && proof.runId !== options.runId) {
    throw new Error(`proof-envelope-run-mismatch:${proof.runId || "missing"}`);
  }
  if (options.candidate && proof.candidateId !== options.candidate) {
    throw new Error(`proof-envelope-candidate-mismatch:${proof.candidateId || "missing"}`);
  }
  return { proof, proofPath, runReport: readCompactRunReport(runRoot), runRoot, size };
}

function reportContractComplete({ proofPath, runReport }) {
  if (!runReport || typeof runReport.proofEnvelopeContractComplete !== "boolean") return null;
  const reportedPath = normalize(runReport.proofEnvelopePath);
  if (!reportedPath) return runReport.proofEnvelopeContractComplete;
  const normalizedProofPath = normalize(proofPath);
  return reportedPath === normalize(path.relative(process.cwd(), proofPath))
    || reportedPath === normalizedProofPath
    || normalizedProofPath.endsWith(`/${reportedPath}`)
    ? runReport.proofEnvelopeContractComplete
    : null;
}

function compactProof({ proof, proofPath, runReport, runRoot, size }) {
  const runReportContractComplete = reportContractComplete({ proofPath, runReport });
  const contractComplete = typeof proof.contractComplete === "boolean"
    ? proof.contractComplete
    : runReportContractComplete === true;
  const parallel = proof.schema === PARALLEL_PROOF_SCHEMA
    ? {
        mode: proof.mode || null,
        planPath: proof.planPath || null,
        proposalPathCount: Array.isArray(proof.proposalPaths) ? proof.proposalPaths.length : 0,
        reducerStatus: proof.reducerStatus || null,
        evidence: proof.evidence && typeof proof.evidence === "object"
          ? {
              centralWriterOnly: proof.evidence.centralWriterOnly === true,
              childWorktreesDetached: proof.evidence.childWorktreesDetached === true,
              noUnplannedPathsAccepted: proof.evidence.noUnplannedPathsAccepted === true,
              proposalsAcceptedSerially: proof.evidence.proposalsAcceptedSerially === true,
              proposalsRejectedSerially: proof.evidence.proposalsRejectedSerially === true,
              worktreesRunOwned: proof.evidence.worktreesRunOwned === true,
            }
          : null,
      }
    : null;
  return {
    schema: "generic-repo-full-intake.proof-compact.v1",
    runId: proof.runId || null,
    candidateId: proof.candidateId || null,
    phase: proof.phase || null,
    status: proof.status || null,
    mode: proof.mode || null,
    contractComplete,
    proofEnvelopePath: normalize(path.relative(process.cwd(), proofPath)) || normalize(proofPath),
    proofEnvelopeSha256: sha256File(proofPath),
    sizeBytes: size,
    runRoot: normalize(path.relative(process.cwd(), runRoot)) || normalize(runRoot),
    proofSchema: proof.schema || null,
    hashesPresent: {
      queueSha256: Boolean(proof.queueSha256),
      ledgerSha256Before: Boolean(proof.ledgerSha256Before),
      ledgerSha256After: Boolean(proof.ledgerSha256After),
      manifestSha256: Boolean(proof.manifestSha256),
      runtimeStateSha256: Boolean(proof.runtimeStateSha256),
      changedPathsSha256: Boolean(proof.changedPathsSha256),
    },
    changedPathCount: Array.isArray(proof.changedPaths) ? proof.changedPaths.length : 0,
    unplannedPathCount: Array.isArray(proof.unplannedPaths) ? proof.unplannedPaths.length : 0,
    validationCommandCount: Array.isArray(proof.validationCommandsRun) ? proof.validationCommandsRun.length : 0,
    parallel,
    nextCommand: proof.nextCommand || null,
  };
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    const result = readProof(options);
    if (options.output === "compact-json") {
      process.stdout.write(`${JSON.stringify(compactProof(result), null, 2)}\n`);
      return;
    }
    const summary = compactProof(result);
    process.stdout.write(`Proof: ${summary.runId} ${summary.candidateId || "none"} ${summary.status}\n`);
    process.stdout.write(`Envelope: ${summary.proofEnvelopePath}\n`);
    process.stdout.write(`Contract complete: ${summary.contractComplete}\n`);
    process.stdout.write(`Next: ${summary.nextCommand || "none"}\n`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

main();
