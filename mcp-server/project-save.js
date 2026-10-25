"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const TOOL_NAME = "save_current_named_project";
const CONTRACT_VERSION = "ae-agent-project-save.v1";
const OPERATION = "persist_current_named_project_in_place";
const SNAPSHOT_SCOPE = "on_disk_before_save";

function failure(code, message, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function assertObject(value, code, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw failure(code, `${label} must be an object.`);
  }
  return value;
}

function assertExactKeys(value, allowed, code, label) {
  const extra = Object.keys(value).find((key) => !allowed.includes(key));
  if (extra) throw failure(code, `${label}.${extra} is not supported.`);
}

function requiredText(value, code, label, maxLength) {
  if (typeof value !== "string" || !value || value !== value.trim() || value.length > maxLength || /[\r\n\0]/.test(value)) {
    throw failure(code, `${label} must be a non-empty, trimmed string up to ${maxLength} characters.`);
  }
  return value;
}

function hasDotSegment(filePath) {
  return filePath.replace(/\\/g, "/").split("/").some((part) => part === "." || part === "..");
}

function isUncPath(filePath) {
  return /^\\\\/.test(filePath) || /^\/\//.test(filePath);
}

function isAbsoluteLocalPath(filePath) {
  return (path.win32.isAbsolute(filePath) || path.posix.isAbsolute(filePath)) && !isUncPath(filePath);
}

function normalizedIdentity(filePath) {
  const slash = String(filePath || "").replace(/\\/g, "/").replace(/\/+$/, "");
  return /^[A-Za-z]:\//.test(slash) ? slash.toLowerCase() : slash;
}

function samePath(left, right) {
  return normalizedIdentity(left) === normalizedIdentity(right);
}

function validateExpectedProjectFile(value, code, label) {
  const filePath = requiredText(value, code, label, 4096);
  if (!isAbsoluteLocalPath(filePath)) {
    throw failure(code, `${label} must be an absolute local path; UNC and network paths are not supported.`);
  }
  if (hasDotSegment(filePath)) {
    throw failure(code, `${label} must not contain dot segments.`);
  }
  if (path.extname(filePath).toLowerCase() !== ".aep") {
    throw failure(code, `${label} must name an existing .aep file.`);
  }
  return filePath;
}

function validateHash(value, code, label) {
  const hash = requiredText(value, code, label, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) throw failure(code, `${label} must be a 64-character SHA-256 hex digest.`);
  return hash;
}

function validateCheckpointLabel(value, code) {
  const label = requiredText(value, code, "checkpointLabel", 160);
  if (/[/\\:*?"<>|]/.test(label)) {
    throw failure(code, "checkpointLabel contains a filesystem-reserved character.");
  }
  return label;
}

function createToolDefinitions() {
  return [{
    name: TOOL_NAME,
    description: "Persist the current in-memory state of one already named AE project to its exact existing .aep file after stale-file, authorization, checkpoint, and read-back guards.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        expectedProjectFile: {
          type: "string",
          description: "Exact canonical absolute path of the already saved current .aep project. The destination cannot be changed."
        },
        expectedSavedFileSha25664: {
          type: "string",
          pattern: "^[A-Fa-f0-9]{64}$",
          description: "SHA-256 of the current on-disk .aep before checkpoint and save."
        },
        checkpointLabel: {
          type: "string",
          minLength: 1,
          maxLength: 160,
          description: "Required label for the mandatory on-disk pre-save checkpoint."
        }
      },
      required: ["expectedProjectFile", "expectedSavedFileSha25664", "checkpointLabel"]
    }
  }];
}

function validateToolInput(name, args) {
  if (name !== TOOL_NAME) throw failure("INVALID_PROJECT_SAVE_TOOL", `Unsupported project-save tool: ${name || "<missing>"}.`);
  const code = "INVALID_PROJECT_SAVE_INPUT";
  assertObject(args, code, "args");
  assertExactKeys(args, ["expectedProjectFile", "expectedSavedFileSha25664", "checkpointLabel"], code, "args");
  return {
    expectedProjectFile: validateExpectedProjectFile(args.expectedProjectFile, code, "expectedProjectFile"),
    expectedSavedFileSha25664: validateHash(args.expectedSavedFileSha25664, code, "expectedSavedFileSha25664"),
    checkpointLabel: validateCheckpointLabel(args.checkpointLabel, code)
  };
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function fileIdentityFromStat(stat) {
  if (!stat || stat.dev === undefined || stat.ino === undefined) return null;
  const device = String(stat.dev);
  const inode = String(stat.ino);
  if (!device || !inode || inode === "0") return null;
  return { device, inode };
}

function sameFileIdentity(left, right) {
  return Boolean(left && right && left.device === right.device && left.inode === right.inode);
}

function isIsoTimestamp(value) {
  if (typeof value !== "string" || !value) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function unwrapAeResult(response) {
  return response && typeof response === "object" && Object.prototype.hasOwnProperty.call(response, "result")
    ? response.result
    : response;
}

function projectPathFromAe(response) {
  const result = unwrapAeResult(response);
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  return typeof result.projectFile === "string" && result.projectFile ? result.projectFile : null;
}

function jsxLiteral(value) {
  return JSON.stringify(value).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function aePathGuard(expectedProjectFile, save) {
  return `var __expected=${jsxLiteral(expectedProjectFile)};\n`
    + "function __norm(v){return String(v||\"\").replace(/\\\\/g,\"/\").toLowerCase();}\n"
    + (save
      ? "if(!app.project||!app.project.file)throw new Error(\"saved_project_required\");\nif(__norm(app.project.file.fsName)!==__norm(__expected))throw new Error(\"project_target_mismatch\");\n"
      : "if(!app.project||!app.project.file)return {projectFile:null};\n")
    + (save ? "app.project.save();\nif(!app.project.file||__norm(app.project.file.fsName)!==__norm(__expected))throw new Error(\"project_target_changed_after_save\");\n" : "")
    + `return {projectFile:String(app.project.file.fsName)${save ? ",saved:true" : ""}};`;
}

function authorizationIdentity(context) {
  const code = "PROJECT_SAVE_AUTHORIZATION_REQUIRED";
  const authorization = context && context.authorization;
  if (!authorization || typeof authorization !== "object" || Array.isArray(authorization)
      || authorization.authorized !== true || authorization.confirmed !== true) {
    throw failure(code, "A confirmed bridge execution authorization is required.");
  }
  const proposalId = requiredText(authorization.proposalId, code, "authorization.proposalId", 240);
  const runId = requiredText(authorization.runId, code, "authorization.runId", 240);
  return { proposalId, runId, key: `${proposalId}\n${runId}` };
}

function verifyDryRunReceipt(record,stepCount,contractVersion){
  if(!record||!record.dryRunCompletedAt)throw failure("project_save_dry_run_required","A successful dry run of this named-project save proposal is required.");
  const receipt=record.dryRunReceipt;
  if(!receipt||receipt.payloadHash!==record.payloadHash||receipt.contractVersion!==contractVersion||receipt.stepCount!==stepCount||!record.project||receipt.projectFile!==record.project.expectedFile)
    throw failure("project_save_dry_run_stale","Repeat the dry run of the current save proposal for the exact project.");
  return true;
}

function filesystemAdapter(custom) {
  if (!custom) {
    return {
      realpath: fs.promises.realpath.bind(fs.promises),
      stat: fs.promises.stat.bind(fs.promises),
      readFile: fs.promises.readFile.bind(fs.promises)
    };
  }
  assertObject(custom, "INVALID_PROJECT_SAVE_DEPENDENCIES", "filesystem");
  for (const method of ["realpath", "stat", "readFile"]) {
    if (typeof custom[method] !== "function") {
      throw failure("INVALID_PROJECT_SAVE_DEPENDENCIES", `filesystem.${method} must be a function.`);
    }
  }
  return custom;
}

async function readFileRecord(filesystem, filePath, missingCode, emptyCode) {
  let stat;
  let contents;
  try {
    stat = await filesystem.stat(filePath, { bigint: true });
    if (!stat || typeof stat.isFile !== "function" || !stat.isFile()) {
      throw failure(missingCode, "Project path is not a regular file.");
    }
    contents = await filesystem.readFile(filePath);
  } catch (error) {
    if (error && error.code === missingCode) throw error;
    throw failure(missingCode, "Project file could not be read.", error);
  }
  const buffer = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
  if (buffer.length === 0) throw failure(emptyCode, "Project file is empty.");
  return {
    path: filePath,
    bytes: buffer.length,
    sha256: sha256(buffer),
    modifiedTimeMs: Number.isFinite(Number(stat.mtimeMs)) ? Number(stat.mtimeMs) : null,
    observedAt: new Date().toISOString(),
    fileIdentity: fileIdentityFromStat(stat)
  };
}

async function assertCanonicalProjectPath(filesystem, expectedProjectFile, missingCode, ambiguousCode) {
  let canonical;
  try {
    canonical = await filesystem.realpath(expectedProjectFile);
  } catch (error) {
    throw failure(missingCode, "expectedProjectFile does not exist or cannot be resolved.", error);
  }
  if (!samePath(canonical, expectedProjectFile)) {
    throw failure(ambiguousCode, "expectedProjectFile must remain the canonical path, not an alias or symlink.");
  }
  return canonical;
}

function assertAeProjectPath(response, expectedProjectFile, unnamedCode, mismatchCode) {
  const observed = projectPathFromAe(response);
  if (!observed) throw failure(unnamedCode, "After Effects has no named saved project.");
  if (!samePath(observed, expectedProjectFile)) {
    throw failure(mismatchCode, "The current After Effects project does not match expectedProjectFile.");
  }
  return observed;
}

async function verifyCheckpointArtifact(filesystem, checkpointResult, expected) {
  const code = "PROJECT_SAVE_CHECKPOINT_FAILED";
  try {
    assertObject(checkpointResult, code, "checkpoint");
    const checkpointFile = validateExpectedProjectFile(checkpointResult.checkpointFile, code, "checkpoint.checkpointFile");
    if (samePath(checkpointFile, expected.path)) {
      throw failure(code, "Checkpoint must be a distinct file, not the source project path.");
    }
    if (!samePath(checkpointResult.sourceFile, expected.path)
        || checkpointResult.label !== expected.label
        || checkpointResult.snapshotScope !== SNAPSHOT_SCOPE) {
      throw failure(code, "Checkpoint metadata does not bind to the requested pre-save snapshot.");
    }
    const canonicalCheckpoint = await filesystem.realpath(checkpointFile);
    if (!samePath(canonicalCheckpoint, checkpointFile)) {
      throw failure(code, "Checkpoint path is aliased or non-canonical.");
    }
    if (samePath(canonicalCheckpoint, expected.path)) {
      throw failure(code, "Checkpoint resolves to the source project file.");
    }
    const record = await readFileRecord(filesystem, checkpointFile, code, code);
    if (sameFileIdentity(record.fileIdentity, expected.fileIdentity)) {
      throw failure(code, "Checkpoint is a hardlink or same-inode alias of the source project file.");
    }
    if (record.bytes !== expected.bytes || record.sha256 !== expected.sha256) {
      throw failure(code, "Checkpoint is not an exact copy of the pre-save on-disk project.");
    }
    if ((checkpointResult.bytes !== undefined && checkpointResult.bytes !== record.bytes)
        || (checkpointResult.sha256 !== undefined && String(checkpointResult.sha256).toLowerCase() !== record.sha256)) {
      throw failure(code, "Checkpoint receipt metadata does not match the checkpoint file.");
    }
    return {
      label: expected.label,
      checkpointFile,
      sourceFile: expected.path,
      snapshotScope: SNAPSHOT_SCOPE,
      bytes: record.bytes,
      sha256: record.sha256,
      observedAt: record.observedAt,
      fileIdentity: record.fileIdentity
    };
  } catch (error) {
    if (error && error.code === code) throw error;
    throw failure(code, "Mandatory project checkpoint failed.", error);
  }
}

function createProjectSaveExecutor(dependencies) {
  const deps = assertObject(dependencies, "INVALID_PROJECT_SAVE_DEPENDENCIES", "dependencies");
  if (typeof deps.runExtendScriptBody !== "function") {
    throw failure("INVALID_PROJECT_SAVE_DEPENDENCIES", "runExtendScriptBody must be a function.");
  }
  if (typeof deps.createCheckpoint !== "function") {
    throw failure("INVALID_PROJECT_SAVE_DEPENDENCIES", "createCheckpoint must be a function.");
  }
  const filesystem = filesystemAdapter(deps.filesystem);
  const usedAuthorizations = new Set();
  let inFlight = false;

  async function execute(name, rawArgs, context) {
    const args = validateToolInput(name, rawArgs);
    const authorization = authorizationIdentity(context);
    if (usedAuthorizations.has(authorization.key)) {
      throw failure("PROJECT_SAVE_REPLAY_BLOCKED", "This confirmed project-save authorization was already consumed.");
    }
    if (inFlight) {
      throw failure("PROJECT_SAVE_CONCURRENT_EXECUTION", "Another project save is already in progress.");
    }
    usedAuthorizations.add(authorization.key);
    inFlight = true;
    try {
      await assertCanonicalProjectPath(
        filesystem,
        args.expectedProjectFile,
        "PROJECT_SAVE_FILE_MISSING",
        "PROJECT_SAVE_AMBIGUOUS_PATH"
      );

      const fileBefore = await readFileRecord(
        filesystem,
        args.expectedProjectFile,
        "PROJECT_SAVE_FILE_MISSING",
        "PROJECT_SAVE_FILE_EMPTY"
      );
      if (fileBefore.sha256 !== args.expectedSavedFileSha25664) {
        throw failure("PROJECT_SAVE_STALE_FILE", "The on-disk project changed since expectedSavedFileSha25664 was captured.");
      }

      let aePreflight;
      try {
        aePreflight = await deps.runExtendScriptBody(aePathGuard(args.expectedProjectFile, false), {
          phase: "preflight",
          tool: TOOL_NAME,
          mutatesProject: false
        });
      } catch (error) {
        throw failure("PROJECT_SAVE_AE_PREFLIGHT_FAILED", "After Effects project preflight failed.", error);
      }
      assertAeProjectPath(
        aePreflight,
        args.expectedProjectFile,
        "PROJECT_SAVE_UNNAMED_PROJECT",
        "PROJECT_SAVE_PROJECT_MISMATCH"
      );

      let checkpointResult;
      try {
        checkpointResult = await deps.createCheckpoint({
          label: args.checkpointLabel,
          sourceFile: args.expectedProjectFile,
          sourceBytes: fileBefore.bytes,
          sourceSha25664: fileBefore.sha256,
          snapshotScope: SNAPSHOT_SCOPE
        });
      } catch (error) {
        throw failure("PROJECT_SAVE_CHECKPOINT_FAILED", "Mandatory project checkpoint failed.", error);
      }
      const checkpoint = await verifyCheckpointArtifact(filesystem, checkpointResult, {
        path: args.expectedProjectFile,
        label: args.checkpointLabel,
        bytes: fileBefore.bytes,
        sha256: fileBefore.sha256,
        fileIdentity: fileBefore.fileIdentity
      });

      await assertCanonicalProjectPath(
        filesystem,
        args.expectedProjectFile,
        "PROJECT_SAVE_FILE_CHANGED_AFTER_CHECKPOINT",
        "PROJECT_SAVE_FILE_CHANGED_AFTER_CHECKPOINT"
      );

      const preSaveRecord = await readFileRecord(
        filesystem,
        args.expectedProjectFile,
        "PROJECT_SAVE_FILE_CHANGED_AFTER_CHECKPOINT",
        "PROJECT_SAVE_FILE_CHANGED_AFTER_CHECKPOINT"
      );
      if (preSaveRecord.bytes !== fileBefore.bytes || preSaveRecord.sha256 !== fileBefore.sha256) {
        throw failure("PROJECT_SAVE_FILE_CHANGED_AFTER_CHECKPOINT", "The project file changed after checkpoint and before save.");
      }

      let aeSave;
      try {
        aeSave = await deps.runExtendScriptBody(aePathGuard(args.expectedProjectFile, true), {
          phase: "save",
          tool: TOOL_NAME,
          mutatesProject: true,
          synchronousPathRecheck: true
        });
      } catch (error) {
        throw failure("PROJECT_SAVE_AE_SAVE_FAILED", "After Effects failed to save the current named project in place.", error);
      }
      const savedPath = assertAeProjectPath(
        aeSave,
        args.expectedProjectFile,
        "PROJECT_SAVE_AE_SAVE_FAILED",
        "PROJECT_SAVE_PROJECT_MISMATCH_AFTER_SAVE"
      );
      const savedResult = unwrapAeResult(aeSave);
      if (!savedResult || savedResult.saved !== true) {
        throw failure("PROJECT_SAVE_AE_SAVE_FAILED", "After Effects did not return an explicit save receipt.");
      }

      await assertCanonicalProjectPath(
        filesystem,
        args.expectedProjectFile,
        "PROJECT_SAVE_POST_FILE_MISSING",
        "PROJECT_SAVE_POST_PATH_AMBIGUOUS"
      );

      let aeReadbackResponse;
      try {
        aeReadbackResponse = await deps.runExtendScriptBody(aePathGuard(args.expectedProjectFile, false), {
          phase: "readback",
          tool: TOOL_NAME,
          mutatesProject: false
        });
      } catch (error) {
        throw failure("PROJECT_SAVE_AE_READBACK_FAILED", "After Effects post-save path read-back failed.", error);
      }
      const readbackPath = assertAeProjectPath(
        aeReadbackResponse,
        args.expectedProjectFile,
        "PROJECT_SAVE_AE_READBACK_FAILED",
        "PROJECT_SAVE_PROJECT_MISMATCH_AFTER_SAVE"
      );

      const fileAfter = await readFileRecord(
        filesystem,
        args.expectedProjectFile,
        "PROJECT_SAVE_POST_FILE_MISSING",
        "PROJECT_SAVE_POST_FILE_EMPTY"
      );
      const receipt = {
        contractVersion: CONTRACT_VERSION,
        operation: OPERATION,
        success: true,
        expectedProjectFile: args.expectedProjectFile,
        authorization: {
          proposalId: authorization.proposalId,
          runId: authorization.runId,
          confirmed: true
        },
        fileBefore,
        fileAfter,
        checkpoint,
        aeReadBack: {
          projectFile: readbackPath,
          saveResultProjectFile: savedPath,
          matchesExpected: true,
          phase: "after_save"
        },
        inMemoryRevisionProof: "not_observed",
        reopenVerification: "pending"
      };
      verifyReceipt(receipt, args);
      return receipt;
    } finally {
      inFlight = false;
    }
  }

  return { execute };
}

function receiptRecord(value, label, code) {
  assertObject(value, code, label);
  assertExactKeys(value, ["path", "bytes", "sha256", "modifiedTimeMs", "observedAt", "fileIdentity"], code, label);
  const recordPath = validateExpectedProjectFile(value.path, code, `${label}.path`);
  if (!Number.isInteger(value.bytes) || value.bytes < 1) throw failure(code, `${label}.bytes must be a positive integer.`);
  const digest = validateHash(value.sha256, code, `${label}.sha256`);
  if (value.modifiedTimeMs !== null && (!Number.isFinite(value.modifiedTimeMs) || value.modifiedTimeMs < 0)) {
    throw failure(code, `${label}.modifiedTimeMs must be null or a non-negative finite number.`);
  }
  if (!isIsoTimestamp(value.observedAt)) {
    throw failure(code, `${label}.observedAt must be an ISO-8601 timestamp.`);
  }
  let fileIdentity = null;
  if (value.fileIdentity !== null) {
    assertObject(value.fileIdentity, code, `${label}.fileIdentity`);
    assertExactKeys(value.fileIdentity, ["device", "inode"], code, `${label}.fileIdentity`);
    fileIdentity = {
      device: requiredText(value.fileIdentity.device, code, `${label}.fileIdentity.device`, 120),
      inode: requiredText(value.fileIdentity.inode, code, `${label}.fileIdentity.inode`, 120)
    };
    if (fileIdentity.inode === "0") throw failure(code, `${label}.fileIdentity.inode must identify a file.`);
  }
  return { path: recordPath, bytes: value.bytes, sha256: digest, observedAt: value.observedAt, fileIdentity };
}

function verifyReceipt(receipt, rawArgs) {
  const code = "INVALID_PROJECT_SAVE_RECEIPT";
  let args;
  try {
    args = validateToolInput(TOOL_NAME, rawArgs);
  } catch (error) {
    throw failure(code, "Receipt verification requires valid bound tool arguments.", error);
  }
  assertObject(receipt, code, "receipt");
  assertExactKeys(receipt, [
    "contractVersion", "operation", "success", "expectedProjectFile", "authorization",
    "fileBefore", "fileAfter", "checkpoint", "aeReadBack", "inMemoryRevisionProof", "reopenVerification"
  ], code, "receipt");
  if (receipt.contractVersion !== CONTRACT_VERSION || receipt.operation !== OPERATION || receipt.success !== true) {
    throw failure(code, "Receipt contract identity or success state is invalid.");
  }
  if (!samePath(receipt.expectedProjectFile, args.expectedProjectFile)) {
    throw failure(code, "Receipt is not bound to expectedProjectFile.");
  }

  const before = receiptRecord(receipt.fileBefore, "receipt.fileBefore", code);
  const after = receiptRecord(receipt.fileAfter, "receipt.fileAfter", code);
  if (!samePath(before.path, args.expectedProjectFile) || !samePath(after.path, args.expectedProjectFile)) {
    throw failure(code, "Receipt file records target a different project path.");
  }
  if (before.sha256 !== args.expectedSavedFileSha25664) {
    throw failure(code, "Receipt pre-save hash does not match the bound expected hash.");
  }

  const checkpoint = assertObject(receipt.checkpoint, code, "receipt.checkpoint");
  assertExactKeys(checkpoint, ["label", "checkpointFile", "sourceFile", "snapshotScope", "bytes", "sha256", "observedAt", "fileIdentity"], code, "receipt.checkpoint");
  const checkpointFile = validateExpectedProjectFile(checkpoint.checkpointFile, code, "receipt.checkpoint.checkpointFile");
  if (!isIsoTimestamp(checkpoint.observedAt)) {
    throw failure(code, "receipt.checkpoint.observedAt must be an ISO-8601 timestamp.");
  }
  let checkpointIdentity = null;
  if (checkpoint.fileIdentity !== null) {
    assertObject(checkpoint.fileIdentity, code, "receipt.checkpoint.fileIdentity");
    assertExactKeys(checkpoint.fileIdentity, ["device", "inode"], code, "receipt.checkpoint.fileIdentity");
    checkpointIdentity = {
      device: requiredText(checkpoint.fileIdentity.device, code, "receipt.checkpoint.fileIdentity.device", 120),
      inode: requiredText(checkpoint.fileIdentity.inode, code, "receipt.checkpoint.fileIdentity.inode", 120)
    };
  }
  if (checkpoint.label !== args.checkpointLabel || checkpoint.snapshotScope !== SNAPSHOT_SCOPE
      || !samePath(checkpoint.sourceFile, args.expectedProjectFile)
      || checkpointFile !== checkpoint.checkpointFile
      || samePath(checkpointFile, args.expectedProjectFile)
      || checkpoint.bytes !== before.bytes
      || validateHash(checkpoint.sha256, code, "receipt.checkpoint.sha256") !== before.sha256
      || sameFileIdentity(checkpointIdentity, before.fileIdentity)) {
    throw failure(code, "Receipt checkpoint is not an exact bound pre-save disk snapshot.");
  }

  const authorization = assertObject(receipt.authorization, code, "receipt.authorization");
  assertExactKeys(authorization, ["proposalId", "runId", "confirmed"], code, "receipt.authorization");
  requiredText(authorization.proposalId, code, "receipt.authorization.proposalId", 240);
  requiredText(authorization.runId, code, "receipt.authorization.runId", 240);
  if (authorization.confirmed !== true) throw failure(code, "Receipt authorization is not confirmed.");

  const aeReadBack = assertObject(receipt.aeReadBack, code, "receipt.aeReadBack");
  assertExactKeys(aeReadBack, ["projectFile", "saveResultProjectFile", "matchesExpected", "phase"], code, "receipt.aeReadBack");
  if (!samePath(aeReadBack.projectFile, args.expectedProjectFile)
      || !samePath(aeReadBack.saveResultProjectFile, args.expectedProjectFile)
      || aeReadBack.matchesExpected !== true
      || aeReadBack.phase !== "after_save") {
    throw failure(code, "Receipt AE read-back does not prove the exact project path after save.");
  }
  if (receipt.inMemoryRevisionProof !== "not_observed" || receipt.reopenVerification !== "pending") {
    throw failure(code, "Receipt overstates in-memory revision or reopen verification evidence.");
  }
  return { valid: true, contractVersion: CONTRACT_VERSION, operation: OPERATION };
}

module.exports = {
  TOOL_NAME,
  CONTRACT_VERSION,
  OPERATION,
  SNAPSHOT_SCOPE,
  createToolDefinitions,
  validateToolInput,
  createProjectSaveExecutor,
  verifyReceipt,
  verifyDryRunReceipt
};
