"use strict";

const path = require("path");

const GENERATED_SAFETY_CONTRACT_VERSION = "generated-safety-contracts-v1";

const GENERATED_EXPORT_ROOT_ID = "generated-exports";
const GENERATED_RENDER_OUTPUT_ROOT_ID = "generated-renders";

const DEFAULT_GENERATED_EXPORT_ROOT = path.join("logs", "generated-exports");
const DEFAULT_GENERATED_RENDER_OUTPUT_ROOT = path.join("logs", "generated-renders");

const GENERATED_FILE_OUTPUT_TOOL_CONTRACTS = Object.freeze({
  export_path_points: Object.freeze({
    id: "generated-file-output:export-path-points",
    kind: "generated-file-output",
    rootId: GENERATED_EXPORT_ROOT_ID,
    filenameField: "outputFileName",
    defaultFilename: "points.txt",
    allowedExtensions: Object.freeze([".txt"]),
    requiresHashReadBack: true,
    requiresPostReadBack: true
  }),
  export_text_to_file: Object.freeze({
    id: "generated-file-output:export-text-to-file",
    kind: "generated-file-output",
    rootId: GENERATED_EXPORT_ROOT_ID,
    filenameField: "outputFileName",
    defaultFilename: "export.txt",
    allowedExtensions: Object.freeze([".txt"]),
    requiresHashReadBack: true,
    requiresPostReadBack: true
  }),
  save_comp_frame_png: Object.freeze({
    id: "generated-file-output:save-comp-frame-png",
    kind: "generated-file-output",
    rootId: GENERATED_EXPORT_ROOT_ID,
    filenameField: "outputFileName",
    defaultFilename: "frame.png",
    allowedExtensions: Object.freeze([".png"]),
    requiresHashReadBack: true,
    requiresPostReadBack: true,
    requiresResolutionRestore: true
  })
});

const GENERATED_RENDER_OUTPUT_TOOL_CONTRACTS = Object.freeze({
  add_comp_to_render_queue: Object.freeze({
    id: "generated-render-output:add-comp-to-render-queue",
    kind: "generated-render-output",
    rootId: GENERATED_RENDER_OUTPUT_ROOT_ID,
    pathField: "outputPath",
    allowedExtensions: Object.freeze([".mov", ".mp4", ".avi", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".exr"]),
    writesFile: false,
    requiresRenderQueueReadBack: true
  }),
  set_render_queue_output: Object.freeze({
    id: "generated-render-output:set-render-queue-output",
    kind: "generated-render-output",
    rootId: GENERATED_RENDER_OUTPUT_ROOT_ID,
    pathField: "outputPath",
    allowedExtensions: Object.freeze([".mov", ".mp4", ".avi", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".exr"]),
    writesFile: false,
    requiresRenderQueueReadBack: true
  })
});

const GENERATED_CLEANUP_DELETE_TOOL_CONTRACTS = Object.freeze({
  cleanup_test_items: Object.freeze({
    id: "generated-cleanup-delete:cleanup-test-items",
    kind: "generated-cleanup-delete",
    target: "project-items",
    prefixField: "namePrefix",
    confirmField: "confirm",
    maxItemsField: "maxItems",
    requiresGeneratedPrefix: true,
    requiresExplicitLimit: true,
    requiresPostReadBack: true
  })
});

const TERMINAL_SAFETY_CANDIDATE_TAXONOMY = Object.freeze({
  fileIo: Object.freeze({
    "tool-compositions-save-frame-as-png": Object.freeze({
      blockerClass: "FOUT-PNG-SINGLE",
      contractPrimitive: "GeneratedArtifactRootPolicy",
      currentNarrowTool: "save_comp_frame_png",
      unblockCondition: "single generated comp, simple .png filename, generated export root, byte/hash/read-back, resolutionFactor restore"
    }),
    "tool-layers-convert-srt-to-text-layers": Object.freeze({
      blockerClass: "FIN-SRT-CONTENT",
      contractPrimitive: "ReviewedFileInputPolicy",
      unblockCondition: "generated or explicitly approved .srt file, parser limits, explicit text-layer timing read-back"
    }),
    "tool-layers-create-text-layers-from-file": Object.freeze({
      blockerClass: "FIN-TEXT-CONTENT",
      contractPrimitive: "ReviewedFileInputPolicy",
      unblockCondition: "generated or explicitly approved .txt input, size/content limits, explicit created text-layer read-back"
    }),
    "tool-project-export-text-to-file": Object.freeze({
      blockerClass: "FOUT-TEXT",
      contractPrimitive: "GeneratedArtifactRootPolicy",
      currentNarrowTool: "export_text_to_file",
      unblockCondition: "explicit generated text-layer binding, simple .txt output, byte/hash/content read-back"
    }),
    "tool-project-manually-render-png-sequence": Object.freeze({
      blockerClass: "FOUT-PNG-SEQUENCE",
      contractPrimitive: "GeneratedArtifactManifestPolicy",
      unblockCondition: "bounded generated comp frame iteration, manifest, per-file hash/read-back, time restore and cleanup evidence"
    }),
    "tool-project-reveal-project-file": Object.freeze({
      blockerClass: "HOST-REVEAL",
      contractPrimitive: "HostRevealPolicy",
      unblockCondition: "dry-run path report by default; OS reveal only after explicit approval for saved/generated project evidence"
    }),
    "tool-project-set-proxies-from-folder": Object.freeze({
      blockerClass: "PROXY-SET-FOLDER",
      contractPrimitive: "ProxyStatePolicy",
      unblockCondition: "sandboxed generated proxy files, exact target item evidence, proxy before/after read-back and rollback notes"
    }),
    "tool-properties-export-path-points": Object.freeze({
      blockerClass: "FOUT-TXT-GEOMETRY",
      contractPrimitive: "GeneratedArtifactRootPolicy",
      currentNarrowTool: "export_path_points",
      unblockCondition: "explicit path geometry evidence, simple .txt filename, generated export root, content/hash/read-back"
    })
  }),
  cleanupDelete: Object.freeze({
    "tool-project-clean-render-queue": Object.freeze({
      blockerClass: "RQ-DELETE",
      contractPrimitive: "RenderQueueMutationPolicy",
      unblockCondition: "exact generated render queue item evidence, dry-run delete plan, protected run, post-cleanup queue read-back"
    }),
    "tool-project-clean-selected-folder": Object.freeze({
      blockerClass: "PROJECT-FOLDER-DELETE",
      contractPrimitive: "ProjectItemDeletePolicy",
      unblockCondition: "enumerated generated folder/items, reference/usedIn evidence, checkpoint, post-delete project snapshot"
    }),
    "tool-project-clean-up-overlord-folder": Object.freeze({
      blockerClass: "FS-SANDBOX-CLEANUP",
      contractPrimitive: "GeneratedFilesystemCleanupPolicy",
      unblockCondition: "generated sandbox only; no real Overlord folder assumptions without separate approval"
    }),
    "tool-project-remove-all-proxies": Object.freeze({
      blockerClass: "PROXY-CLEAR",
      contractPrimitive: "ProxyStatePolicy",
      unblockCondition: "explicit generated proxy targets, reversible before/after proxy state read-back"
    }),
    "tool-project-reset-imported-item-names": Object.freeze({
      blockerClass: "IMPORT-FOOTAGE-RENAME",
      contractPrimitive: "GeneratedFootageFixturePolicy",
      currentNarrowTool: "rename_project_items",
      unblockCondition: "generated footage fixture, file basename evidence, exact footage item rename, post-rename read-back"
    })
  })
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPathInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizeDisplayPath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function safeFilenamePattern(maxLength) {
  return new RegExp(`^[A-Za-z0-9][A-Za-z0-9_.-]{0,${Math.max(0, maxLength - 1)}}$`);
}

function assertSimpleGeneratedFilename(value, options = {}) {
  const defaultFilename = options.defaultFilename || "";
  const label = options.label || "filename";
  const maxLength = Math.max(1, Math.min(128, Number(options.maxLength || 96)));
  const allowedExtensions = Array.isArray(options.allowedExtensions)
    ? options.allowedExtensions.map((ext) => String(ext || "").toLowerCase()).filter(Boolean)
    : [];
  const requested = String(value || defaultFilename || "").trim();

  if (!requested) throw new Error(`${label} is required.`);
  if (requested.includes("\0")) throw new Error(`${label} must not contain NUL bytes.`);
  if (path.isAbsolute(requested) || /^[A-Za-z]:/.test(requested) || /[/\\]/.test(requested)) {
    throw new Error(`${label} must be a simple generated filename, not a path.`);
  }
  if (requested !== path.basename(requested)) {
    throw new Error(`${label} must be a basename only.`);
  }
  if (!safeFilenamePattern(maxLength).test(requested)) {
    throw new Error(`${label} must be 1-${maxLength} safe characters using letters, numbers, dot, dash, or underscore.`);
  }

  const ext = path.extname(requested).toLowerCase();
  if (allowedExtensions.length && !allowedExtensions.includes(ext)) {
    throw new Error(`${label} extension must be one of ${allowedExtensions.join(", ")}.`);
  }

  return requested;
}

function resolveGeneratedFile(options = {}) {
  const root = path.resolve(options.root || ".");
  const outputFileName = assertSimpleGeneratedFilename(options.requestedName, {
    defaultFilename: options.defaultFilename,
    allowedExtensions: options.allowedExtensions,
    maxLength: options.maxLength || 96,
    label: options.label || "outputFileName"
  });
  const resolvedPath = path.resolve(root, outputFileName);
  if (!isPathInside(root, resolvedPath)) {
    throw new Error(`${options.label || "outputFileName"} must resolve inside the generated root.`);
  }
  return {
    outputFileName,
    resolvedPath,
    root,
    extension: path.extname(outputFileName).toLowerCase()
  };
}

function contractForGeneratedFileTool(toolName) {
  return GENERATED_FILE_OUTPUT_TOOL_CONTRACTS[toolName] || null;
}

function contractForGeneratedRenderOutputTool(toolName) {
  return GENERATED_RENDER_OUTPUT_TOOL_CONTRACTS[toolName] || null;
}

function contractForGeneratedCleanupDeleteTool(toolName) {
  return GENERATED_CLEANUP_DELETE_TOOL_CONTRACTS[toolName] || null;
}

function resolveGeneratedRenderOutputPath(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || ".");
  const generatedRenderOutputDir = path.resolve(options.generatedRenderOutputDir || path.join(projectRoot, DEFAULT_GENERATED_RENDER_OUTPUT_ROOT));
  const requestedPath = String(options.requestedPath || "").trim();
  if (!requestedPath) throw new Error("outputPath is required.");
  if (requestedPath.includes("\0")) throw new Error("outputPath must not contain NUL bytes.");
  if (path.isAbsolute(requestedPath) || /^[A-Za-z]:/.test(requestedPath)) {
    throw new Error("outputPath must be a generated render filename or a path under logs/generated-renders.");
  }

  const normalizedRequested = normalizeDisplayPath(requestedPath);
  const generatedRootRelative = normalizeDisplayPath(path.relative(projectRoot, generatedRenderOutputDir));
  let outputFileName = normalizedRequested;
  if (normalizedRequested.includes("/")) {
    const rootPrefix = `${generatedRootRelative}/`;
    if (!normalizedRequested.startsWith(rootPrefix)) {
      throw new Error("outputPath must stay under logs/generated-renders.");
    }
    outputFileName = normalizedRequested.slice(rootPrefix.length);
  }
  if (outputFileName.includes("/")) {
    throw new Error("outputPath must target one generated render output file, not a nested path.");
  }

  return resolveGeneratedFile({
    root: generatedRenderOutputDir,
    requestedName: outputFileName,
    allowedExtensions: GENERATED_RENDER_OUTPUT_TOOL_CONTRACTS.add_comp_to_render_queue.allowedExtensions,
    label: "outputPath"
  });
}

function contractsForPlanStep(toolName, args = {}) {
  const contracts = [];
  const fileContract = contractForGeneratedFileTool(toolName);
  if (fileContract) {
    contracts.push({
      version: GENERATED_SAFETY_CONTRACT_VERSION,
      id: fileContract.id,
      kind: fileContract.kind,
      rootId: fileContract.rootId,
      filenameField: fileContract.filenameField,
      allowedExtensions: fileContract.allowedExtensions.slice(),
      requiresHashReadBack: fileContract.requiresHashReadBack === true,
      requiresPostReadBack: fileContract.requiresPostReadBack === true
    });
  }

  const renderContract = contractForGeneratedRenderOutputTool(toolName);
  if (renderContract && isPlainObject(args) && args.outputPath) {
    contracts.push({
      version: GENERATED_SAFETY_CONTRACT_VERSION,
      id: renderContract.id,
      kind: renderContract.kind,
      rootId: renderContract.rootId,
      pathField: renderContract.pathField,
      allowedExtensions: renderContract.allowedExtensions.slice(),
      writesFile: false,
      requiresRenderQueueReadBack: true
    });
  }

  const cleanupContract = contractForGeneratedCleanupDeleteTool(toolName);
  if (cleanupContract) {
    contracts.push({
      version: GENERATED_SAFETY_CONTRACT_VERSION,
      id: cleanupContract.id,
      kind: cleanupContract.kind,
      target: cleanupContract.target,
      prefixField: cleanupContract.prefixField,
      requiresGeneratedPrefix: true,
      requiresExplicitLimit: true,
      requiresPostReadBack: true
    });
  }

  return contracts;
}

function validateGeneratedSafetyStep(toolName, args = {}, options = {}) {
  const issues = [];
  const fileContract = contractForGeneratedFileTool(toolName);
  if (fileContract) {
    try {
      assertSimpleGeneratedFilename(args[fileContract.filenameField], {
        defaultFilename: fileContract.defaultFilename,
        allowedExtensions: fileContract.allowedExtensions,
        label: fileContract.filenameField
      });
    } catch (error) {
      issues.push(error.message);
    }
  }

  const renderContract = contractForGeneratedRenderOutputTool(toolName);
  if (renderContract && args && args[renderContract.pathField]) {
    const projectRoot = path.resolve(options.projectRoot || process.cwd());
    const generatedRenderOutputDir = path.resolve(options.generatedRenderOutputDir || path.join(projectRoot, DEFAULT_GENERATED_RENDER_OUTPUT_ROOT));
    try {
      resolveGeneratedRenderOutputPath({
        projectRoot,
        generatedRenderOutputDir,
        requestedPath: args[renderContract.pathField]
      });
    } catch (error) {
      issues.push(error.message);
    }
  }

  const cleanupContract = contractForGeneratedCleanupDeleteTool(toolName);
  if (cleanupContract) {
    const prefix = String(args && args[cleanupContract.prefixField] || "Codex Test").trim();
    if (prefix.length < 3) issues.push(`${cleanupContract.prefixField} must be at least 3 characters.`);
    if (!/^Codex(?:\s|[-_])|^AE Agent(?:\s|[-_])|^Generated(?:\s|[-_])/i.test(prefix)) {
      issues.push(`${cleanupContract.prefixField} must use a reviewed generated prefix such as Codex, AE Agent, or Generated.`);
    }
    if (args && args[cleanupContract.confirmField] !== true) {
      issues.push(`${cleanupContract.confirmField}:true is required for generated cleanup/delete.`);
    }
  }

  return issues;
}

function summarizeGeneratedSafetyContracts(steps) {
  const summary = {
    total: 0,
    generatedFileIoCount: 0,
    generatedRenderOutputCount: 0,
    generatedCleanupDeleteCount: 0,
    contractIds: []
  };
  for (const step of Array.isArray(steps) ? steps : []) {
    for (const contract of Array.isArray(step && step.safetyContracts) ? step.safetyContracts : []) {
      summary.total += 1;
      if (contract.kind === "generated-file-output") summary.generatedFileIoCount += 1;
      if (contract.kind === "generated-render-output") summary.generatedRenderOutputCount += 1;
      if (contract.kind === "generated-cleanup-delete") summary.generatedCleanupDeleteCount += 1;
      if (contract.id && !summary.contractIds.includes(contract.id)) summary.contractIds.push(contract.id);
    }
  }
  return summary;
}

function generatedFileEvidenceIssues(toolName, file) {
  const contract = contractForGeneratedFileTool(toolName);
  if (!contract) return [];
  const issues = [];
  const payload = isPlainObject(file) ? file : {};
  try {
    assertSimpleGeneratedFilename(payload.outputFileName, {
      defaultFilename: contract.defaultFilename,
      allowedExtensions: contract.allowedExtensions,
      label: "file.outputFileName"
    });
  } catch (error) {
    issues.push(error.message);
  }
  if (payload.outputPath && payload.outputFileName && path.basename(String(payload.outputPath)) !== payload.outputFileName) {
    issues.push("file.outputPath basename must match file.outputFileName.");
  }
  if (typeof payload.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(payload.sha256)) {
    issues.push("file.sha256 must be a 64-character hex digest.");
  }
  if (!(Number(payload.byteLength || 0) > 0)) {
    issues.push("file.byteLength must be greater than zero.");
  }
  if (payload.deletedAfterReadBack === true && payload.existsAfter !== false) {
    issues.push("deleteAfterReadBack evidence must prove existsAfter:false.");
  }
  return issues;
}

module.exports = {
  GENERATED_SAFETY_CONTRACT_VERSION,
  GENERATED_EXPORT_ROOT_ID,
  GENERATED_RENDER_OUTPUT_ROOT_ID,
  DEFAULT_GENERATED_EXPORT_ROOT,
  DEFAULT_GENERATED_RENDER_OUTPUT_ROOT,
  GENERATED_FILE_OUTPUT_TOOL_CONTRACTS,
  GENERATED_RENDER_OUTPUT_TOOL_CONTRACTS,
  GENERATED_CLEANUP_DELETE_TOOL_CONTRACTS,
  TERMINAL_SAFETY_CANDIDATE_TAXONOMY,
  assertSimpleGeneratedFilename,
  contractsForPlanStep,
  generatedFileEvidenceIssues,
  isPathInside,
  resolveGeneratedFile,
  resolveGeneratedRenderOutputPath,
  summarizeGeneratedSafetyContracts,
  validateGeneratedSafetyStep
};
