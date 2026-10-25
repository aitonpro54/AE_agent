"use strict";
// Typed schema construction only; grants and executor brands stay in runtime.
function createToolCatalog({MUTATION_CHECKPOINT_SCHEMA_PROPERTIES,ameEnqueueSequence,ameFixtureRunner,ameJobSource,ameOpenComp,amePresets,ameQueueControl,ameRunning,ameSavedSourceAdmission,ameSourceProbe,ameTitleJobs,ameTransport,buildCompVisualReviewPlanTool,compVisualReviewManifest,montageTools,nativeRenderVariant,panelBootstrap,panelControl,placeholderPlanBuilder,placeholderReadBack,placeholderReviewTools,projectLifecycleContract,projectLifecyclePlan,projectLifecycleState,projectSave,slideshowTools,titleExport,titleVerification}){
const tools = [
panelBootstrap.tool,
panelBootstrap.recoveryTool,
...panelControl.panelControlTools,
...require("./core-plan-catalog").planTools,
...placeholderReviewTools.tools,
...montageTools.montageTools,
buildCompVisualReviewPlanTool,
compVisualReviewManifest.getCompVisualReviewManifestTool,
projectLifecycleState.getProjectLifecycleStateTool,
{
    name: "get_placeholder_protection",
    description: "Read authoritative accepted placeholder snapshots, confirmed group mappings, constraints and fresh drift diagnostics for the current saved project. Cannot accept/release or override protection.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
{
    name: "get_placeholder_usage",
    description: "Read a fresh bounded video source-interval map for explicit comp IDs. Resolves nested timing and confirmed groups from server Project Intent state; incomplete/unsupported evidence never passes.",
    inputSchema: { type: "object", properties: { roots: { type: "array", minItems: 1, maxItems: 32,
      items: { type: "object", properties: { compItemId: { type: "integer", minimum: 1 }, range: { type: "array", minItems: 2, maxItems: 2, items: { type: "number" } } }, required: ["compItemId"] } } }, required: ["roots"] }
  },
{
    name: "check_placeholder_assignments",
    description: "Check proposed video source intervals/groups against a fresh server inventory and authoritative confirmed group mappings. Client usage/group claims are not authority; no AE mutation.",
    inputSchema: { type: "object", properties: {
      assignments: { type: "array", minItems: 1, maxItems: 32, items: { type: "object", properties: {
        target: { type: "object", properties: { compItemId: { type: "integer", minimum: 1 }, layerId: { type: "integer", minimum: 1 } }, required: ["compItemId", "layerId"] },
        sourceItemId: { type: "integer", minimum: 1 }, sourceRange: { type: "array", minItems: 2, maxItems: 2, items: { type: "number" } }
      }, required: ["target", "sourceItemId", "sourceRange"] } },
      constraints: { type: "object", properties: { distinctGroups: { type: "boolean" }, disallowSourceOverlap: { type: "boolean" } } }
    }, required: ["assignments"] }
  },
{
    name: "build_placeholder_plan",
    description: "Build a local preview plan for one reviewed slideshow placeholder from exact comp, layer, source and root/source timing evidence. No AE call or model inference. Re-inspect before proposal, then use normal dry-run and confirmation gates.",
    inputSchema: placeholderPlanBuilder.inputSchema
  },
{
    name: "verify_placeholder_read_back",
    description: "Compare the expected placeholder comp/layer/source/timing with a fresh independent get_layer_details result. Local only; no AE call or provider inference.",
    inputSchema: placeholderReadBack.inputSchema
  },
{
    name: "find_missing_footage_candidates",
    description: "Search within explicit roots for missing-footage replacements by original filename, extension and filesystem size. Media fields remain unknown unless optional bounded ffprobe reading is requested. Incomplete search cannot establish uniqueness.",
    inputSchema: {
      type: "object",
      properties: {
        searchRoots: {
          type: "array",
          items: { type: "string" },
          description: "Explicit local directory paths to search. Traversal is strictly bounded to these roots."
        },
        missingItems: {
          type: "array",
          items: {
            type: "object",
            properties: {
              itemId: { type: "number", description: "Persistent project item ID." },
              itemIndex: { type: "number", description: "Optional current project item index." },
              name: { type: "string", description: "Missing footage item name." },
              originalPath: { type: "string", description: "Original file path; basename overrides a renamed item name." },
              footageMissing: { type: "boolean", description: "Fresh inspected missing state, required by recovery builder." },
              expectedSize: { type: "number", description: "Known original file size in bytes, when independently available." },
              expectedMetadata: { type: "object", properties: {
                width: { type: "number" }, height: { type: "number" }, duration: { type: "number" }, frameRate: { type: "number" }
              }, description: "Known media fields from inspection; compared only with actually probed fields." }
            },
            required: ["itemId", "name"]
          },
          description: "List of missing footage items to find candidates for."
        },
        maxDepth: {
          type: "number",
          description: "Maximum directory traversal depth. Defaults to 5, maximum 10."
        },
        maxFiles: {
          type: "number",
          description: "Maximum collected files. Defaults to 2000, maximum 10000; traversal also has separate entry/directory budgets."
        },
        maxEntries: { type: "number", description: "All visited directory entries, including filtered files. Default 20000, maximum 50000." },
        maxDirectories: { type: "number", description: "Visited directories. Default 2000, maximum 10000." },
        probeMedia: { type: "boolean", description: "Explicitly read candidate media with existing ffprobe; default false, no installation." },
        maxProbeFiles: { type: "number", description: "Maximum candidate probes. Default 10, maximum 25, aggregate budget 10 seconds." },
        probeTimeoutMs: { type: "number", description: "Per-file probe timeout. Default 2000ms, maximum 5000ms; output limited to 256KiB." },
        allowedExtensions: {
          type: "array",
          items: { type: "string" },
          description: "Optional list of file extensions to include (e.g. ['.mp4', '.mov', '.png'])."
        }
      },
      required: ["searchRoots", "missingItems"]
    }
  },
{
    name: "build_source_recovery_plan",
    description: "Build a typed recovery plan from fresh missing-item identity/path, the current candidate list and an explicit confirmed selected path. Retains expectedReadBack and addresses independent readback by persistent itemIds.",
    inputSchema: {
      type: "object",
      properties: {
        requests: {
          type: "array",
          items: {
            type: "object",
            properties: {
              itemId: { type: "number", description: "Persistent project item ID." },
              itemIndex: { type: "number", description: "Optional project item index hint." },
              itemName: { type: "string", description: "Item name." },
              currentFilePath: { type: "string", description: "Expected current/previous file path (stale guard)." },
              targetFilePath: { type: "string", description: "Target replacement file path on disk." },
              footageMissing: { type: "boolean", description: "Inspected state must be true before recovery." },
              candidates: { type: "array", minItems: 1, items: { type: "object", properties: {
                filePath: { type: "string" }
              }, required: ["filePath"] }, description: "Candidate list returned by the current search for this item." },
              isAmbiguous: { type: "boolean", description: "Whether multiple candidates existed." },
              candidateSelectionConfirmed: { type: "boolean", description: "Must be true for the explicit selected path, including a single candidate." }
            },
            required: ["itemId", "itemName", "currentFilePath", "footageMissing", "candidates", "targetFilePath", "candidateSelectionConfirmed"]
          },
          description: "Array of relink requests."
        }
      },
      required: ["requests"]
    }
  },
{
    name: "relink_footage_source",
    description: "Relink a footage item to a replacement media file on disk by persistent itemId with stale identity and file guards under an undo group.",
    inputSchema: {
      type: "object",
      properties: {
        itemId: {
          type: "number",
          description: "Persistent project item ID of the footage item to relink."
        },
        itemIndex: {
          type: "number",
          description: "Optional 1-based project item index hint."
        },
        expectedName: {
          type: "string",
          description: "Required fresh inspected footage item name guard."
        },
        expectedPreviousFilePath: {
          type: "string",
          description: "Required fresh inspected previous file path guard. Missing/unavailable current file path fails closed."
        },
        filePath: {
          type: "string",
          description: "Absolute path to the replacement media file on disk."
        }
      },
      required: ["itemId", "expectedName", "expectedPreviousFilePath", "filePath"]
    }
  },
{
    name: "verify_source_recovery_read_back",
    description: "Compare expected footage item state (itemId, file, footageMissing: false) against fresh independent project read-back. Verifies by persistent itemId to tolerate project item index shifts.",
    inputSchema: {
      type: "object",
      properties: {
        expected: {
          type: "array",
          description: "Expected read-back items from build_source_recovery_plan."
        },
        observed: {
          type: ["object", "array"],
          description: "Fresh independent find_project_items or get_project_snapshot result."
        }
      },
      required: ["expected", "observed"]
    }
  },
{
    name: "get_bridge_status",
    description: "Return MCP bridge diagnostics, panel connection status, log path, backup path, and recent events.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
{
    name: "wait_for_bridge_state",
    description: "Passively wait up to waitMs for bridge panel connectivity or idle state using stored local status without contacting After Effects or mutating project state.",
    inputSchema: {
      type: "object",
      properties: {
        waitMs: {
          type: "integer",
          minimum: 0,
          maximum: 30000,
          description: "Maximum milliseconds to wait. Defaults to 1000, maximum 30000."
        },
        targetState: {
          type: "string",
          enum: ["connected", "idle", "connected_and_idle", "any"],
          description: "Desired bridge condition to observe. Defaults to connected."
        }
      }
    }
  },
{
    name: "wait_for_plan_state",
    description: "Passively wait up to waitMs for proposal state transitions using immutable proposal pins (actionId, instanceId, revision). Returns a compact observer status and lastRun summary without execution authority.",
    inputSchema: {
      type: "object",
      properties: {
        actionId: {
          type: "string",
          description: "Exact actionId of the current proposal pin."
        },
        instanceId: {
          type: "string",
          description: "Exact bridge instanceId where the proposal was created."
        },
        revision: {
          type: "integer",
          description: "Exact proposal revision number."
        },
        waitMs: {
          type: "integer",
          minimum: 0,
          maximum: 30000,
          description: "Maximum milliseconds to wait. Defaults to 1000, maximum 30000."
        },
        stateToken: {
          type: "string",
          description: "Optional previously observed stateToken; waits until state transitions away from this token or reaches a terminal state."
        },
        targetStates: {
          type: "array",
          items: { type: "string" },
          description: "Optional target states to wait for (e.g. ['completed', 'failed', 'dry_run_passed'])."
        }
      },
      required: ["actionId", "instanceId", "revision"]
    }
  },
{
    name: "get_command_log",
    description: "Return recent JSONL bridge events from the local command log.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of recent events to return. Defaults to 50, maximum 200."
        }
      }
    }
  },
{
    name: "validate_ai_agent_plan",
    description: "Validate a structured AE MCP plan without executing it. Checks tool names, required args, mutation safety fields, and checkpoint need.",
    inputSchema: {
      type: "object",
      properties: {
        plan: {
          type: "object",
          description: "Plan object returned by plan_with_ai_agent."
        },
        requestId: {
          type: "string",
          description: "Optional stable id used to generate idempotency key templates."
        }
      },
      required: ["plan"]
    }
  },
{
    name: "run_ai_agent_plan",
    description: "Dry-run a current server proposal, then execute typed mutations while the user-enabled CEP Autonomous Codex session is active. Enforces project binding, fresh dry-run, checkpoint, idempotency, expiry, lease and read-back. Raw JSX and destructive plans retain manual CEP confirmation. Inspect repairDirective on failure; never replay unknown outcomes.",
    inputSchema: {
      type: "object",
      properties: {
        plan: {
          type: "object",
          description: "Legacy dry-run/read-only plan object. Proposal-backed real runs resolve the executable plan from actionId/payloadRef instead of this body."
        },
        actionId: {
          type: "string",
          description: "Backend-created M100 action proposal id."
        },
        payloadRef: {
          type: "string",
          description: "Server-side M100 payload reference from the action proposal."
        },
        payloadHash: {
          type: "string",
          description: "Canonical payload hash from the action proposal."
        },
        previewHash: {
          type: "string",
          description: "Canonical preview hash from the action proposal."
        },
        riskLevel: {
          type: "string",
          description: "Risk level from the action proposal."
        },
        riskPolicyVersion: {
          type: "string",
          description: "Risk policy version from the action proposal."
        },
        confirmationToken: {
          type: "string",
          description: "Single-use server-issued confirmation token from the action proposal, required for real proposal-backed runs."
        },
        confirmedBySurface: {
          type: "string",
          description: "Surface echo for the proposal confirmation, such as cep-panel."
        },
        confirmedBySession: {
          type: "string",
          description: "Session echo for the proposal confirmation when present."
        },
        requestId: {
          type: "string",
          description: "Optional stable id used to generate idempotency keys."
        },
        dryRun: {
          type: "boolean",
          description: "When true, validate and show ready steps without executing. Defaults to true."
        },
        confirm: {
          type: "boolean",
          description: "Required true for real execution."
        },
        allowMutations: {
          type: "boolean",
          description: "Required true to execute project-changing steps."
        },
        autoEditSession: {
          type: "boolean",
          description: "When true, mutating runs without an existing edit session or checkpoint step start and finish a protected edit session automatically."
        },
        allowWithoutCheckpoint: {
          type: "boolean",
          description: "Legacy compatibility flag. It does not bypass auto edit-session safety for mutating runs."
        },
        allowRawExtendscript: {
          type: "boolean",
          description: "Allow run_extendscript or run_extendscript_file steps. Defaults to false."
        },
        rawExtendscriptDryRunId: {
          type: "string",
          description: "Successful dry-run id for the same current plan, required when allowing raw ExtendScript execution."
        },
        maxSteps: {
          type: "number",
          description: "Maximum steps to consider. Defaults to 20."
        },
        responseView: {
          type: "string",
          enum: ["summary", "full"],
          description: "Optional response representation. Defaults to 'full' for exact backward compatibility. Set to 'summary' for compact, bounded projection preserving execution/mutation/verification/acceptance outcome, counters, step statuses, repair directives, and evidence references without raw property trees or command histories."
        }
      },
      required: []
    }
  },
{
    name: "get_plan_run_evidence",
    description: "Read-only addressable retrieval of recorded plan run evidence or step evidence artifact from the evidence store. Validates run UUID, step index, containment, integrity hashes, and bindings without calling After Effects.",
    inputSchema: {
      type: "object",
      properties: {
        runId: {
          type: "string",
          description: "Server plan run UUID."
        },
        stepIndex: {
          type: "integer", minimum: 1,
          description: "Optional 1-based step index to retrieve step evidence artifact. When omitted, returns the canonical full plan run document."
        },
        offset: {
          type: "integer", minimum: 0,
          description: "Character offset into the text document for paging. Defaults to 0."
        },
        limitChars: {
          type: "integer", minimum: 1, maximum: 12000,
          description: "Maximum characters to return in the text page. Defaults to 6000, maximum 12000."
        }
      },
      required: ["runId"]
    }
  },
{
    name: "start_edit_session",
    description: "Start one active safe edit session with an automatic project checkpoint before later mutations.",
    inputSchema: {
      type: "object",
      properties: {
        label: {
          type: "string",
          description: "Optional human-readable session label."
        },
        notes: {
          type: "string",
          description: "Optional session notes describing the intended edit."
        }
      }
    }
  },
{
    name: "get_edit_session_status",
    description: "Return the active edit session, checkpoint, and recent recorded mutation operations.",
    inputSchema: {
      type: "object",
      properties: {
        operationLimit: {
          type: "number",
          description: "Maximum number of recent operations to include. Defaults to 100."
        }
      }
    }
  },
{
    name: "finish_edit_session",
    description: "Finish the active edit session without restoring or deleting its checkpoint.",
    inputSchema: {
      type: "object",
      properties: {
        outcome: {
          type: "string",
          description: "Optional session outcome label. Defaults to completed."
        },
        summary: {
          type: "string",
          description: "Optional human-readable summary of the completed session."
        }
      }
    }
  },
{
    name: "list_edit_sessions",
    description: "List recent edit sessions recorded in the local edit session log.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of sessions to return. Defaults to 50."
        }
      }
    }
  },
{
    name: "backup_project_file",
    description: "Copy the currently saved After Effects project file into the bridge backups folder without modifying the open project.",
    inputSchema: {
      type: "object",
      properties: {
        label: {
          type: "string",
          description: "Optional human-readable label to include in the backup filename."
        }
      }
    }
  },
{
    name: "checkpoint_project",
    description: "Create a named checkpoint copy of the currently saved After Effects project in the bridge backups folder.",
    inputSchema: {
      type: "object",
      properties: {
        label: {
          type: "string",
          description: "Optional human-readable checkpoint label to include in the filename."
        }
      }
    }
  },
{
    name: "list_project_checkpoints",
    description: "List project checkpoint .aep files in the bridge backups folder.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of checkpoints to return. Defaults to 100, maximum 500."
        }
      }
    }
  },
{
    name: "get_project_checkpoint_details",
    description: "Return validated metadata for one project checkpoint file in the bridge backups folder.",
    inputSchema: {
      type: "object",
      properties: {
        checkpointFile: {
          type: "string",
          description: "Checkpoint filename or absolute path inside the bridge backups folder."
        }
      },
      required: ["checkpointFile"]
    }
  },
{
    name: "delete_project_checkpoint",
    description: "Delete one project checkpoint file from the bridge backups folder. Requires confirm=true.",
    inputSchema: {
      type: "object",
      properties: {
        checkpointFile: {
          type: "string",
          description: "Checkpoint filename or absolute path inside the bridge backups folder."
        },
        confirm: {
          type: "boolean",
          description: "Must be true to delete the checkpoint file."
        }
      },
      required: ["checkpointFile", "confirm"]
    }
  },
{
    name: "restore_project_checkpoint",
    description: "Safely prepare restore instructions for a checkpoint. Requires confirm=true and does not overwrite the open project.",
    inputSchema: {
      type: "object",
      properties: {
        checkpointFile: {
          type: "string",
          description: "Checkpoint filename or absolute path inside the bridge backups folder."
        },
        confirm: {
          type: "boolean",
          description: "Must be true to acknowledge restore intent."
        }
      },
      required: ["checkpointFile", "confirm"]
    }
  },
{
    name: "ping_ae",
    description: "Check whether the After Effects CEP panel is connected and can execute ExtendScript.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
{
    name: "run_extendscript",
    description: "Run an ExtendScript function body in After Effects and return its JSON-serializable result.",
    inputSchema: {
      type: "object",
      properties: {
        script: {
          type: "string",
          description: "ExtendScript function body. Use return to send data back."
        },
        timeoutMs: {
          type: "number",
          description: "Optional timeout in milliseconds."
        }
      },
      required: ["script"]
    }
  },
{
    name: "run_extendscript_file",
    description: "Read a local ExtendScript file from disk, run it in After Effects, and return its JSON-serializable result.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Absolute path, or a path relative to the bridge project. Defaults to files inside the bridge project."
        },
        timeoutMs: {
          type: "number",
          description: "Optional timeout in milliseconds."
        }
      },
      required: ["filePath"]
    }
  },
{
    name: "get_project_info",
    description: "Return basic After Effects project information.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
{
    name: "set_project_frames_count_type",
    description: "Set the AE Project frame numbering mode to start at frame 0 or frame 1, with explicit read-back.",
    inputSchema: {
      type: "object",
      properties: {
        framesCountType: {
          type: "string",
          enum: ["FC_START_0", "FC_START_1", "startAtZero", "startAtOne"],
          description: "Requested final Project.framesCountType. Use FC_START_0 for frame numbering that starts at 0 or FC_START_1 for frame numbering that starts at 1."
        },
        expectedCurrentFramesCountType: {
          type: "string",
          enum: ["FC_START_0", "FC_START_1", "startAtZero", "startAtOne"],
          description: "Optional guard from get_project_info. The tool fails closed if the current frame numbering mode differs."
        }
      },
      required: ["framesCountType"]
    }
  },
{
    name: "get_project_snapshot",
    description: "Return a compact snapshot of project items for script development and navigation.",
    inputSchema: {
      type: "object",
      properties: {
        maxItems: {
          type: "number",
          description: "Maximum number of project items to return. Defaults to 500, maximum 2000."
        },
        includeComps: {
          type: "boolean",
          description: "Whether to include compositions. Defaults to true."
        },
        includeFootage: {
          type: "boolean",
          description: "Whether to include footage items. Defaults to true."
        },
        includeFolders: {
          type: "boolean",
          description: "Whether to include folders. Defaults to true."
        }
      }
    }
  },
{
    name: "find_project_items",
    description: "Find project items by name/type or explicit persistent itemIds. Footage references include actual missing state, full file path and compact media fields.",
    inputSchema: {
      type: "object",
      properties: {
        itemIds: { type: "array", minItems: 1, maxItems: 250, items: { type: "integer", minimum: 1 },
          description: "Optional bounded persistent IDs; filter before limit, independent of current item indices." },
        query: {
          type: "string",
          description: "Name substring or exact name to search for. Empty query returns the first results."
        },
        type: {
          type: "string",
          enum: ["comp", "footage", "folder"],
          description: "Optional project item type filter."
        },
        exactName: {
          type: "boolean",
          description: "Whether query must match the full item name. Defaults to false."
        },
        caseSensitive: {
          type: "boolean",
          description: "Whether name matching is case-sensitive. Defaults to false."
        },
        limit: {
          type: "number",
          description: "Maximum number of items to return. Defaults to 25."
        }
      }
    }
  },
{
    name: "list_project_folder_items",
    description: "List direct or recursive contents of a project folder. Defaults to the project root when no folder is provided.",
    inputSchema: {
      type: "object",
      properties: {
        folderItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the folder to list."
        },
        folderName: {
          type: "string",
          description: "Optional exact folder name to list when folderItemIndex is not provided."
        },
        recursive: {
          type: "boolean",
          description: "Whether to include nested folder contents. Defaults to false."
        },
        type: {
          type: "string",
          enum: ["comp", "footage", "folder"],
          description: "Optional project item type filter."
        },
        limit: {
          type: "number",
          description: "Maximum number of items to return. Defaults to 200, maximum 2000."
        }
      }
    }
  },
{
    name: "set_project_item_metadata",
    description: "Update only the AE label index on explicit project item indices with optional expected item-name guards and required read-back.",
    inputSchema: {
      type: "object",
      properties: {
        itemIndices: {
          type: ["number", "array"],
          description: "Explicit 1-based project item index or indexes from current project-item evidence."
        },
        expectedItemNames: {
          type: "array",
          items: { type: "string" },
          description: "Optional item-name guards matching itemIndices order."
        },
        label: {
          type: "number",
          description: "AE project item label index to set. Must be an integer from 0 through 16."
        },
        ...MUTATION_CHECKPOINT_SCHEMA_PROPERTIES
      },
      required: ["itemIndices", "label"]
    }
  },
{
    name: "create_comp",
    description: "Create a production composition with explicit dimensions, duration, frame rate, and optional project folder placement.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Composition name to create."
        },
        width: {
          type: "number",
          description: "Composition width in pixels. Defaults to 1920."
        },
        height: {
          type: "number",
          description: "Composition height in pixels. Defaults to 1080."
        },
        pixelAspect: {
          type: "number",
          description: "Pixel aspect ratio. Defaults to 1."
        },
        duration: {
          type: "number",
          description: "Composition duration in seconds. Defaults to 5."
        },
        frameRate: {
          type: "number",
          description: "Composition frame rate. Defaults to 30."
        },
        bgColor: {
          type: "array",
          items: { type: "number" },
          description: "Optional RGB background color with values from 0 to 1. Defaults to black."
        },
        parentFolderItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the destination folder."
        },
        parentFolderName: {
          type: "string",
          description: "Optional exact folder name for the destination folder when parentFolderItemIndex is not provided."
        },
        allowDuplicateName: {
          type: "boolean",
          description: "Whether to allow creating a comp when another comp already has the same name. Defaults to false."
        },
        openInViewer: {
          type: "boolean",
          description: "Whether to open the new composition in the viewer. Defaults to true."
        },
        comment: {
          type: "string",
          description: "Optional project item comment to store on the created composition."
        }
      },
      required: ["name"]
    }
  },
{
    name: "create_project_folder",
    description: "Create a project folder, optionally inside another project folder.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Folder name to create."
        },
        parentFolderItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the parent folder."
        },
        parentFolderName: {
          type: "string",
          description: "Optional exact parent folder name when parentFolderItemIndex is not provided."
        },
        allowExisting: {
          type: "boolean",
          description: "Whether to return an existing same-name child folder instead of failing. Defaults to true."
        }
      },
      required: ["name"]
    }
  },
{
    name: "move_project_items_to_folder",
    description: "Move explicit project items into an existing project folder or the project root.",
    inputSchema: {
      type: "object",
      properties: {
        itemIndices: {
          type: ["number", "array"],
          description: "1-based project item index or indexes to move."
        },
        targetFolderItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target folder."
        },
        targetFolderName: {
          type: "string",
          description: "Optional exact target folder name when targetFolderItemIndex is not provided."
        },
        targetRoot: {
          type: "boolean",
          description: "Move items to the project root when no target folder is provided. Defaults to false."
        },
        includeFolders: {
          type: "boolean",
          description: "Whether itemIndices may include folder items. Defaults to false."
        }
      },
      required: ["itemIndices"]
    }
  },
{
    name: "list_comps",
    description: "List compositions in the current After Effects project.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
{
    name: "list_layers",
    description: "List layers for a composition by 1-based project item index.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "1-based project item index for the composition."
        }
      },
      required: ["compItemIndex"]
    }
  },
{
    name: "get_comp_details",
    description: "Return detailed information for a composition, optionally including its layers.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        includeLayers: {
          type: "boolean",
          description: "Whether to include layer summaries. Defaults to true."
        },
        layerLimit: {
          type: "number",
          description: "Maximum number of layers to include. Defaults to 200, maximum 1000."
        },
        includeMarkers: {
          type: "boolean",
          description: "Whether to include composition marker read-back from comp.markerProperty. Defaults to false."
        },
        includeDynamicLinkGUID: {
          type: "boolean",
          default: false,
          description: "Opt-in native Dynamic Link GUID read. Requires explicit compItemId and a saved project with native revision; returns exact GUID and same-read project evidence, or capability_unavailable. Before AME use, require fresh evidence for the saved AEP and exactly one matching getDLItemList GUID. Defaults to false."
        },
        markerLimit: {
          type: "number",
          description: "Maximum number of composition markers to include. Defaults to 50, maximum 1000."
        }
      }
    }
  },
{
    name: "get_layer_details",
    description: "Return detailed information for one layer, including source, transform, text, effects, masks, and optional property tree. responseView=placeholder returns only target identity, source and timing fields for placeholder preflight/read-back.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "1-based layer index in the target composition."
        },
        responseView: {
          type: "string",
          enum: ["full", "placeholder"],
          description: "Optional response projection. Defaults to full. placeholder omits transform/effects/masks/property tree without changing internal AE read-back."
        },
        includeProperties: {
          type: "boolean",
          description: "Whether to include a property tree. Defaults to false."
        },
        propertyDepth: {
          type: "number",
          description: "Property tree depth. Defaults to 1, maximum 5."
        },
        propertyLimit: {
          type: "number",
          description: "Maximum property nodes to include. Defaults to 120, maximum 1000."
        },
        includeValues: {
          type: "boolean",
          description: "Whether to include compact value previews for properties. Defaults to false."
        },
        includeExpressions: {
          type: "boolean",
          description: "Whether to include expression text where available. Defaults to true."
        }
      },
      required: ["layerIndex"]
    }
  },
{
    name: "get_layer_essential_properties",
    description: "Read Essential Properties exposed on one explicit precomp layer, including property identity, source evidence, values, and expression state.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "1-based layer index in the target composition."
        },
        includeValues: {
          type: "boolean",
          description: "Whether to include compact value previews. Defaults to true."
        },
        includeExpressions: {
          type: "boolean",
          description: "Whether to include expression text and expression state. Defaults to true."
        },
        propertyLimit: {
          type: "number",
          description: "Maximum Essential Properties to return. Defaults to 80, maximum 200."
        }
      },
      required: ["layerIndex"]
    }
  },
{
    name: "get_essential_graphics_controllers",
    description: "Read the Essential Graphics / Motion Graphics Template controller list for one explicit composition.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        }
      }
    }
  },
{
    name: "get_path_geometry",
    description: "Read one explicit Shape or Mask path geometry from one layer, including vertices, inTangents, outTangents, closed state, and optional keyframes.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndex: { type: "number", description: "Required 1-based layer index in the target composition." },
        targetKind: { type: "string", enum: ["shape", "mask"], description: "Path target kind. Shape requires propertyPath; mask requires maskIndex." },
        propertyPath: { type: ["array", "string"], description: "Required for targetKind=shape. Exact property path to an ADBE Vector Shape path property.", items: {} },
        maskIndex: { type: "number", description: "Required for targetKind=mask. 1-based mask index in the layer mask group." },
        expectedLayerName: { type: "string", description: "Optional exact layer name guard." },
        expectedMaskName: { type: "string", description: "Optional exact mask name guard for targetKind=mask." },
        includeKeyframes: { type: "boolean", description: "Whether to include up to keyframeLimit Shape keyframes. Defaults to true." },
        keyframeLimit: { type: "number", description: "Maximum keyframes to include. Defaults to 80, maximum 80." }
      },
      required: ["layerIndex", "targetKind"]
    }
  },
{
    name: "export_path_points",
    description: "Write rounded path vertices from explicit get_path_geometry evidence to a generated local text export under logs/generated-exports. This tool never writes Desktop or arbitrary user paths.",
    inputSchema: {
      type: "object",
      properties: {
        vertices: {
          type: "array",
          description: "Vertices from current get_path_geometry evidence as [x, y] points. Required unless geometry is provided.",
          items: { type: "array", items: { type: "number" } }
        },
        geometry: {
          type: "object",
          description: "Optional get_path_geometry geometry object with vertices, inTangents, outTangents, and closed. Used only for geometry.vertices."
        },
        outputFileName: {
          type: "string",
          description: "Optional generated .txt filename. Must be a simple filename, not a path. Defaults to points.txt."
        },
        decimalPlaces: {
          type: "number",
          description: "Coordinate rounding precision from 0 through 4. Defaults to 2."
        },
        rotateFirstPointToEnd: {
          type: "boolean",
          description: "Whether to move the first point to the end after rounding. Defaults to true."
        },
        variableName: {
          type: "string",
          description: "JavaScript variable name for the text payload. Defaults to points."
        },
        deleteAfterReadBack: {
          type: "boolean",
          description: "When true, write and read/hash the generated file, then delete it for generated proof cleanup. Defaults to false."
        }
      }
    }
  },
{
    name: "export_text_to_file",
    description: "Write reviewed selected-layer Source Text evidence to a generated local text export under logs/generated-exports. This tool never writes Desktop or arbitrary user paths.",
    inputSchema: {
      type: "object",
      properties: {
        layers: {
          type: "array",
          description: "Ordered selected-layer evidence from current get_selected_layers plus get_layer_details. Text layers must include Source Text evidence; non-text layers are exported as [Not a text layer].",
          items: { type: "object" }
        },
        layerEvidence: {
          type: "array",
          description: "Alias for layers when passing get_layer_details result objects.",
          items: { type: "object" }
        },
        expectedLayerCount: {
          type: "number",
          description: "Optional guard for selected layer count."
        },
        outputFileName: {
          type: "string",
          description: "Optional generated .txt filename. Must be a simple filename, not a path. Defaults to export.txt."
        },
        allowOverwrite: {
          type: "boolean",
          description: "When true, allows replacing an existing generated .txt with the same simple filename. Defaults to false."
        },
        deleteAfterReadBack: {
          type: "boolean",
          description: "When true, write and read/hash the generated file, then delete it for generated proof cleanup. Defaults to false."
        }
      }
    }
  },
{
    name: "save_comp_frame_png",
    description: "Save one frame from an explicit generated composition to a generated PNG under logs/generated-exports, then return byte/hash read-back and resolutionFactor restoration evidence. This tool never writes Desktop or arbitrary user paths.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp when compName is not provided."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        expectedCompItemId: {
          type: "integer",
          minimum: 1,
          description: "Optional guard; fails if the resolved composition itemId differs before any filesystem side effects."
        },
        expectedCompName: {
          type: "string",
          description: "Optional guard; fails if the resolved composition name differs."
        },
        time: {
          type: "number",
          description: "Composition time in seconds to save. Defaults to the current comp time."
        },
        outputFileName: {
          type: "string",
          description: "Simple generated .png filename only, not a path. The file is written under logs/generated-exports or AE_AGENT_GENERATED_EXPORT_DIR."
        },
        resolutionFactor: {
          type: "array",
          description: "Optional [x, y] resolution factor to apply only for the save, then restore. Defaults to [1, 1].",
          items: { type: "number" },
          minItems: 2,
          maxItems: 2
        },
        allowOverwrite: {
          type: "boolean",
          description: "When true, allows replacing an existing generated .png with the same simple filename. Defaults to false."
        },
        deleteAfterReadBack: {
          type: "boolean",
          description: "When true, save, read/hash, then delete the generated PNG for proof cleanup. Defaults to false."
        }
      }
    }
  },
{
    name: "list_effect_presets",
    description: "Return curated After Effects effect matchName presets and automation hints.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Optional case-insensitive search across name, matchName, category, description, and notes."
        },
        category: {
          type: "string",
          description: "Optional category filter such as color, blur, stylize, distort, or perspective."
        },
        includePropertyHints: {
          type: "boolean",
          description: "Whether to include curated property hints when known. Defaults to true."
        },
        limit: {
          type: "number",
          description: "Maximum number of presets to return. Defaults to 50, maximum 100."
        }
      }
    }
  },
{
    name: "list_effects",
    description: "Return effects applied to a layer, optionally including first-level effect properties.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "1-based layer index in the target composition."
        },
        includeProperties: {
          type: "boolean",
          description: "Whether to include first-level effect properties. Defaults to false."
        },
        includeValues: {
          type: "boolean",
          description: "Whether to include compact value previews for properties. Defaults to false."
        },
        includeExpressions: {
          type: "boolean",
          description: "Whether to include expression text where available. Defaults to true."
        }
      },
      required: ["layerIndex"]
    }
  },
{
    name: "get_effect_details",
    description: "Return detailed information for one layer effect, including optional property tree.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "1-based layer index in the target composition."
        },
        effectIndex: {
          type: "number",
          description: "Optional 1-based effect index in the layer effects group."
        },
        effectName: {
          type: "string",
          description: "Optional exact effect instance name."
        },
        effectMatchName: {
          type: "string",
          description: "Optional effect matchName, such as ADBE Fill."
        },
        includeProperties: {
          type: "boolean",
          description: "Whether to include a property tree. Defaults to true."
        },
        propertyDepth: {
          type: "number",
          description: "Property tree depth below each effect property. Defaults to 1, maximum 5."
        },
        propertyLimit: {
          type: "number",
          description: "Maximum property nodes to include. Defaults to 120, maximum 1000."
        },
        includeValues: {
          type: "boolean",
          description: "Whether to include compact value previews for properties. Defaults to true."
        },
        includeExpressions: {
          type: "boolean",
          description: "Whether to include expression text where available. Defaults to true."
        }
      },
      required: ["layerIndex"]
    }
  },
{
    name: "get_active_comp",
    description: "Return details about the active After Effects composition and its selected layers.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
{
    name: "get_selected_layers",
    description: "Return selected layers in the active composition.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
{
    name: "set_layer_selection",
    description: "Set the selected layers in a target composition by explicit layer indexes, with optional layer-name verification.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndices: {
          type: "array",
          items: { type: "number" },
          description: "Explicit non-empty list of 1-based layer indexes to select."
        },
        expectedLayerNames: {
          type: "array",
          items: { type: "string" },
          description: "Optional names expected at the same positions as layerIndices. The tool fails closed on mismatch."
        },
        makeActive: {
          type: "boolean",
          description: "Whether to open the target comp in the viewer before setting selection. Defaults to true."
        }
      },
      required: ["layerIndices"]
    }
  },
{
    name: "get_selected_properties",
    description: "Return selected properties in the active composition, including layer context when available.",
    inputSchema: {
      type: "object",
      properties: {
        includeValues: {
          type: "boolean",
          description: "Whether to include compact value previews. Defaults to true."
        },
        includeExpressions: {
          type: "boolean",
          description: "Whether to include expression text where available. Defaults to true."
        }
      }
    }
  },
{
    name: "find_comps",
    description: "Find compositions by case-insensitive name substring.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Case-insensitive substring to search for. Empty query returns the first results."
        },
        limit: {
          type: "number",
          description: "Maximum number of compositions to return. Defaults to 25."
        }
      }
    }
  },
{
    name: "create_text_layer",
    description: "Create a text layer in the active comp or a comp by project item index.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        text: {
          type: "string",
          description: "Text content to create."
        },
        name: {
          type: "string",
          description: "Optional layer name."
        },
        position: {
          type: "array",
          items: { type: "number" },
          description: "Optional [x, y] or [x, y, z] position. Defaults to comp center."
        },
        fontSize: {
          type: "number",
          description: "Optional text font size."
        },
        fillColor: {
          type: "array",
          items: { type: "number" },
          description: "Optional RGB fill color with values from 0 to 1."
        },
        justification: {
          type: "string",
          enum: ["left", "center", "right"],
          description: "Optional paragraph justification for the created TextDocument."
        },
        startTime: {
          type: "number",
          description: "Optional layer start time in seconds."
        },
        duration: {
          type: "number",
          description: "Optional layer duration in seconds."
        }
      },
      required: ["text"]
    }
  },
{
    name: "create_shapes_from_text",
    description: "Convert one explicit text layer into an AE-generated shape outline layer through the native Create Shapes from Text command, with name/text guards and shape-layer read-back. Fails closed if the AE menu command is unavailable.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Required when compName is not provided. 1-based project item index for the explicit target composition."
        },
        compName: {
          type: "string",
          description: "Required when compItemIndex is not provided. Exact composition name for the explicit target composition."
        },
        layerIndex: {
          type: "number",
          description: "Required 1-based source text layer index."
        },
        expectedLayerName: {
          type: "string",
          description: "Optional exact name guard for layerIndex."
        },
        expectedSourceText: {
          type: "string",
          description: "Optional exact Source Text guard for the source text layer."
        },
        shapeLayerName: {
          type: "string",
          description: "Optional name to apply to the generated shape layer after conversion."
        },
        lockCreatedShapeLayer: {
          type: "boolean",
          description: "Whether to lock the generated shape layer after conversion. Defaults to false."
        },
        makeActive: {
          type: "boolean",
          description: "Whether to open the target comp in the viewer before running the native command. Defaults to true."
        }
      },
      required: ["layerIndex"]
    }
  },
{
    name: "import_footage",
    description: "Import a local file as footage into the current After Effects project.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Absolute path, or a path relative to the bridge project, for the footage file to import."
        },
        name: {
          type: "string",
          description: "Optional project item name to apply after import."
        },
        sequence: {
          type: "boolean",
          description: "Whether to import the file as an image sequence. Defaults to false."
        }
      },
      required: ["filePath"]
    }
  },
{
    name: "create_solid_layer",
    description: "Create a solid layer in the active comp or a comp by project item index.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        name: {
          type: "string",
          description: "Optional layer and solid source name. Defaults to Codex Solid."
        },
        color: {
          type: "array",
          items: { type: "number" },
          description: "Optional RGB color with values from 0 to 1. Defaults to black."
        },
        width: {
          type: "number",
          description: "Optional solid width in pixels. Defaults to comp width."
        },
        height: {
          type: "number",
          description: "Optional solid height in pixels. Defaults to comp height."
        },
        pixelAspect: {
          type: "number",
          description: "Optional pixel aspect ratio. Defaults to comp pixel aspect."
        },
        startTime: {
          type: "number",
          description: "Optional layer start time in seconds."
        },
        duration: {
          type: "number",
          description: "Optional layer duration in seconds. Defaults to the composition duration."
        },
        insertBeforeLayerIndex: {
          type: "number",
          description: "Optional explicit 1-based layer index to place the new solid layer immediately above. Only the newly created layer is moved."
        },
        expectedBeforeLayerName: {
          type: "string",
          description: "Optional exact name guard for insertBeforeLayerIndex."
        }
      }
    }
  },
{
    name: "create_null_layer",
    description: "Create a null layer in the active comp or a comp by project item index.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        name: {
          type: "string",
          description: "Optional layer name. Defaults to Codex Null."
        },
        startTime: {
          type: "number",
          description: "Optional layer start time in seconds."
        },
        duration: {
          type: "number",
          description: "Optional layer duration in seconds. Defaults to the composition duration."
        }
      }
    }
  },
{
    name: "create_adjustment_layer",
    description: "Create an adjustment layer in the active comp or a comp by project item index.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        name: {
          type: "string",
          description: "Optional layer and solid source name. Defaults to Codex Adjustment."
        },
        color: {
          type: "array",
          items: { type: "number" },
          description: "Optional RGB solid source color with values from 0 to 1. Defaults to white."
        },
        width: {
          type: "number",
          description: "Optional solid width in pixels. Defaults to comp width."
        },
        height: {
          type: "number",
          description: "Optional solid height in pixels. Defaults to comp height."
        },
        pixelAspect: {
          type: "number",
          description: "Optional pixel aspect ratio. Defaults to comp pixel aspect."
        },
        startTime: {
          type: "number",
          description: "Optional layer start time in seconds."
        },
        duration: {
          type: "number",
          description: "Optional layer duration in seconds. Defaults to the composition duration."
        }
      }
    }
  },
{
    name: "create_camera_layer",
    description: "Create a camera layer in the active comp or a comp by project item index.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        name: {
          type: "string",
          description: "Optional camera layer name. Defaults to Codex Camera."
        },
        pointOfInterest: {
          type: "array",
          items: { type: "number" },
          description: "Optional [x, y] or [x, y, z] point of interest. Defaults to comp center."
        },
        position: {
          type: "array",
          items: { type: "number" },
          description: "Optional [x, y, z] camera position. Defaults to After Effects camera placement."
        },
        zoom: {
          type: "number",
          description: "Optional camera zoom in pixels. Must be greater than 0."
        },
        startTime: {
          type: "number",
          description: "Optional layer start time in seconds."
        },
        duration: {
          type: "number",
          description: "Optional layer duration in seconds. Defaults to the composition duration."
        }
      }
    }
  },
{
    name: "create_camera_with_controller",
    description: "Create a camera and a 3D null controller, parent the camera to the controller, separate controller Position dimensions, and return read-back evidence.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        cameraName: {
          type: "string",
          description: "Optional camera layer name. Defaults to Camera 1."
        },
        controllerName: {
          type: "string",
          description: "Optional controller null name. Defaults to Camera Controller."
        },
        pointOfInterest: {
          type: "array",
          items: { type: "number" },
          description: "Optional [x, y] or [x, y, z] point of interest. Defaults to comp center."
        },
        cameraPosition: {
          type: "array",
          items: { type: "number" },
          description: "Optional [x, y, z] camera position. Defaults to [0, 0, (comp.width / 0.72) * -1]."
        },
        zoom: {
          type: "number",
          description: "Optional camera zoom in pixels. Must be greater than 0."
        },
        startTime: {
          type: "number",
          description: "Optional layer start time in seconds for both created layers."
        },
        duration: {
          type: "number",
          description: "Optional layer duration in seconds for both created layers. Defaults to the composition duration."
        },
        separateControllerPositionDimensions: {
          type: "boolean",
          description: "Whether to separate the controller Position dimensions. Defaults to true."
        }
      }
    }
  },
{
    name: "toggle_onion_skinning",
    description: "Enable, disable, or toggle generated onion skinning on one composition using an adjustment layer with CC Wide Time.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        mode: {
          type: "string",
          description: "enable, disable, or toggle. Defaults to toggle."
        },
        layerName: {
          type: "string",
          description: "Optional generated onion skin adjustment layer name. Defaults to Onion Skin."
        },
        effectName: {
          type: "string",
          description: "Optional CC Wide Time effect instance name. Defaults to Onion Skin."
        }
      }
    }
  },
{
    name: "add_project_item_to_comp",
    description: "Add an existing footage or composition project item as a layer in a target composition.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        itemIndex: {
          type: "number",
          description: "1-based project item index for the footage or composition to add."
        },
        itemName: {
          type: "string",
          description: "Optional exact project item name to add when itemIndex is not provided."
        },
        itemType: {
          type: "string",
          enum: ["comp", "footage"],
          description: "Optional item type filter when resolving itemName."
        },
        name: {
          type: "string",
          description: "Optional layer name."
        },
        position: {
          type: "array",
          items: { type: "number" },
          description: "Optional [x, y] or [x, y, z] layer position."
        },
        scale: {
          type: "array",
          items: { type: "number" },
          description: "Optional [x, y] or [x, y, z] layer scale percentages."
        },
        startTime: {
          type: "number",
          description: "Optional layer start time in seconds."
        },
        duration: {
          type: "number",
          description: "Optional layer duration in seconds."
        }
      }
    }
  },
{
    name: "duplicate_layer",
    description: "Duplicate one explicit layer in the active comp or a comp by project item index/name. This bounded slice does not delete layers or rely on current selection.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "Required 1-based source layer index in the target composition."
        },
        sourceName: {
          type: "string",
          description: "Optional exact expected source layer name at the current 1-based layerIndex. AE inserts newly created and duplicated layers at the top of the stack, so inspect current stack order before setting this."
        },
        name: {
          type: "string",
          description: "Optional name for the duplicated layer. Defaults to After Effects duplicate naming."
        }
      },
      required: ["layerIndex"]
    }
  },
{
    name: "duplicate_layers",
    description: "Duplicate a bounded explicit list of source layers in the active comp or a comp by project item index/name. This runtime slice requires concrete layerIndices, rejects selection-only targeting, and does not delete layers or deep-duplicate/relink sources.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndices: {
          type: "array",
          items: { type: "number" },
          description: "Required non-empty explicit 1-based source layer indexes in the target composition. Duplicate, non-positive, out-of-range, and selection-only targets are rejected."
        },
        sourceNames: {
          type: "array",
          items: { type: "string" },
          description: "Optional expected source layer names, one per layerIndices entry in current AE stack order. AE inserts newly created and duplicated layers at the top of the stack, so layerIndices [1,2] after creating A then B usually maps to [B,A]."
        },
        nameSuffix: {
          type: "string",
          description: "Optional suffix applied to each duplicate name after duplication. Defaults to After Effects duplicate naming when omitted."
        }
      },
      required: ["layerIndices"]
    }
  },
{
    name: "delete_layer",
    description: "Delete exactly one explicit layer from one explicit composition. This destructive M100 tool requires layerIndex and expectedLayerName, rejects bulk or selection-based deletion, rejects locked/out-of-range targets, and returns before/after read-back.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Required when compName is omitted. 1-based project item index for the target composition."
        },
        compName: {
          type: "string",
          description: "Required when compItemIndex is omitted. Exact target composition name."
        },
        layerIndex: {
          type: "number",
          description: "Required 1-based layer index in the target composition."
        },
        expectedLayerName: {
          type: "string",
          description: "Required exact layer name expected at layerIndex before deletion."
        }
      },
      required: ["layerIndex", "expectedLayerName"]
    }
  },
{
    name: "duplicate_comp",
    description: "Duplicate an After Effects composition and optionally open it in the viewer.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to duplicate when compItemIndex is not provided."
        },
        name: {
          type: "string",
          description: "Optional name for the duplicated composition."
        },
        openInViewer: {
          type: "boolean",
          description: "Whether to open the duplicated comp in the viewer. Defaults to true."
        }
      }
    }
  },
{
    name: "deep_duplicate_precomp_sources",
    description: "Deep-duplicate the source comp of one selected or specified precomp layer, duplicate nested comp and footage project items, relink the copied comp to copied sources, and replace the layer with the copied precomp.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the parent composition that contains the precomp layer. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact parent composition name when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "Optional 1-based precomp layer index. Defaults to the single selected layer in the parent composition."
        },
        sourceCompItemIndex: {
          type: "number",
          description: "Optional expected 1-based project item index of the selected layer's source precomp. Used as a safety check before mutation."
        },
        sourceCompName: {
          type: "string",
          description: "Optional expected source precomp name when sourceCompItemIndex is omitted. Used as a safety check before mutation."
        },
        nameSuffix: {
          type: "string",
          description: "Suffix added to every duplicated project item name. Defaults to ' copy'."
        },
        fixExpressions: {
          type: "boolean",
          description: "Whether After Effects should adjust expressions while replacing sources. Defaults to false."
        },
        openInViewer: {
          type: "boolean",
          description: "Whether to open the duplicated precomp after creation. Defaults to false."
        },
        unavailableFootagePolicy: {
          type: "string",
          enum: ["reuse", "fail"],
          description: "How to handle generated, placeholder, missing, or otherwise unreimportable footage sources. 'reuse' keeps the copied comp linked to the original item with a warning; 'fail' blocks the run. Defaults to reuse."
        }
      }
    }
  },
{
    name: "add_effect",
    description: "Add an effect to a layer by effect matchName or display name.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "1-based layer index in the target composition."
        },
        effect: {
          type: "string",
          description: "Effect matchName or display name accepted by After Effects, such as ADBE Fill."
        },
        name: {
          type: "string",
          description: "Optional effect instance name after adding it."
        }
      },
      required: ["layerIndex", "effect"]
    }
  },
{
    name: "set_effect_property",
    description: "Set a property on an existing layer effect.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "1-based layer index in the target composition."
        },
        effectIndex: {
          type: "number",
          description: "Optional 1-based effect index in the layer effects group."
        },
        effectName: {
          type: "string",
          description: "Optional exact effect instance name."
        },
        effectMatchName: {
          type: "string",
          description: "Optional effect matchName, such as ADBE Fill."
        },
        propertyPath: {
          type: "array",
          description: "Optional property path relative to the effect. Segments can be names, indexes, or objects with matchName/name/propertyIndex.",
          items: {}
        },
        propertyIndex: {
          type: "number",
          description: "Optional 1-based property index within the effect."
        },
        propertyName: {
          type: "string",
          description: "Optional exact effect property name."
        },
        propertyMatchName: {
          type: "string",
          description: "Optional effect property matchName."
        },
        value: {
          description: "JSON-serializable value to set."
        },
        time: {
          type: "number",
          description: "Optional time in seconds for setValueAtTime."
        },
        setAtTime: {
          type: "boolean",
          description: "Whether to set a keyframed value at time. Defaults to true when time is provided."
        }
      },
      required: ["layerIndex", "value"]
    }
  },
{
    name: "set_effect_enabled",
    description: "Enable or disable one explicit layer effect instance after current get_effect_details or list_effects evidence.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "1-based layer index in the target composition."
        },
        effectIndex: {
          type: "number",
          description: "Optional 1-based effect index in the layer effects group."
        },
        effectName: {
          type: "string",
          description: "Optional exact effect instance name."
        },
        effectMatchName: {
          type: "string",
          description: "Optional effect matchName, such as ADBE Turbulent Displace."
        },
        enabled: {
          type: "boolean",
          description: "Requested final enabled state for the resolved effect instance."
        },
        expectedCurrentEnabled: {
          type: "boolean",
          description: "Optional guard from current read-back. The tool fails closed if the resolved effect has a different enabled state."
        }
      },
      required: ["layerIndex", "enabled"]
    }
  },
{
    name: "set_puppet_pin_type",
    description: "Set one explicit ADBE FreePin3 puppet pin type property to Position or Advanced after get_effect_details evidence.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "1-based layer index in the target composition."
        },
        effectIndex: {
          type: "number",
          description: "Optional 1-based effect index in the layer effects group."
        },
        effectName: {
          type: "string",
          description: "Optional exact Puppet effect instance name."
        },
        effectMatchName: {
          type: "string",
          description: "Optional effect matchName. If provided it must be ADBE FreePin3."
        },
        pinTypePropertyPath: {
          type: "array",
          description: "Property path from current get_effect_details evidence to the ADBE FreePin3 PosPin Type property. It may be layer-relative or effect-relative and must include or resolve under an ADBE FreePin3 PosPin Atom ancestor.",
          items: {}
        },
        expectedPinName: {
          type: "string",
          description: "Optional Puppet pin atom display name expected from get_effect_details evidence, such as Puppet Pin 1."
        },
        expectedCurrentPinType: {
          description: "Optional current pin type expected before mutation. Accepts 1/position or 4/advanced."
        },
        pinType: {
          description: "Requested pin type: 1 or position, or 4 or advanced."
        }
      },
      required: ["layerIndex", "pinTypePropertyPath", "pinType"]
    }
  },
{
    name: "add_property_to_essential_graphics",
    description: "Add one explicit layer property to a composition's Essential Graphics controller list with reviewed naming and controller read-back.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Required when compName is omitted. 1-based project item index for the composition whose Essential Graphics panel is updated."
        },
        compName: {
          type: "string",
          description: "Required when compItemIndex is omitted. Exact generated or explicitly reviewed target composition name."
        },
        layerIndex: {
          type: "number",
          description: "1-based layer index containing the property to add."
        },
        expectedLayerName: {
          type: "string",
          description: "Optional exact layer-name guard from current typed evidence."
        },
        propertyPath: {
          type: ["array", "string"],
          description: "Exact property path from current get_layer_details/get_selected_properties evidence. String values may be JSON-encoded arrays.",
          items: {}
        },
        expectedPropertyName: {
          type: "string",
          description: "Optional display-name guard for the resolved property."
        },
        expectedPropertyMatchName: {
          type: "string",
          description: "Optional matchName guard for the resolved property."
        },
        controllerName: {
          type: "string",
          description: "Reviewed Essential Graphics controller name to create. 1-80 characters."
        },
        expectedControllerCountBefore: {
          type: "number",
          description: "Optional controller-count guard from get_essential_graphics_controllers evidence."
        },
        ...MUTATION_CHECKPOINT_SCHEMA_PROPERTIES
      },
      required: ["layerIndex", "propertyPath", "controllerName"]
    }
  },
{
    name: "set_property_value",
    description: "Set an arbitrary layer property by property path or matchName path.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: ["number", "array"],
          description: "1-based layer index in the target composition, or an array of 1-based layer indexes for the same property/value."
        },
        propertyPath: {
          type: ["array", "string"],
          description: "Property path from the layer. Segments can be names, numeric indexes, or objects with matchName/name/propertyIndex. Also accepts whitelisted layer attributes: threeDLayer, collapseTransformation, or motionBlur.",
          items: {}
        },
        value: {
          description: "JSON-serializable value to set. For TextDocument properties, pass an object with fields such as text, fontSize, fillColor, applyFill."
        },
        time: {
          type: "number",
          description: "Optional time in seconds for setValueAtTime."
        },
        setAtTime: {
          type: "boolean",
          description: "Whether to set a keyframed value at time. Defaults to true when time is provided."
        }
      },
      required: ["layerIndex", "propertyPath", "value"]
    }
  },
{
    name: "set_layer_metadata",
    description: "Update only comment, label, locked, enabled, guideLayer, motionBlur, and audioEnabled on explicit layer indices in one explicit composition, with optional composition/layer identity guards and required read-back.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Required when compName is omitted. 1-based project item index for the explicit target composition."
        },
        compName: {
          type: "string",
          description: "Required when compItemIndex is omitted. Exact generated target composition name."
        },
        expectedCompName: {
          type: "string",
          description: "Optional exact composition-name guard, especially when compItemIndex is used. A mismatch fails before mutation."
        },
        layerIndices: {
          type: "array",
          items: { type: "number" },
          description: "Required explicit 1-based layer indices. Selection-based or all-layer discovery must happen in earlier read-only steps."
        },
        expectedLayerNames: {
          type: "array",
          items: { type: "string" },
          description: "Optional expected layer names in the same order as layerIndices; when provided, mismatches fail closed before mutation."
        },
        comment: {
          type: "string",
          description: "Optional layer comment to set. Maximum 500 characters."
        },
        label: {
          type: "number",
          description: "Optional AE label index to set. Must be an integer from 0 through 16."
        },
        locked: {
          type: "boolean",
          description: "Optional locked state to set."
        },
        enabled: {
          type: "boolean",
          description: "Optional layer visibility/enabled state to set."
        },
        guideLayer: {
          type: "boolean",
          description: "Optional AE guide-layer state to set on explicit generated or reviewed layers."
        },
        motionBlur: {
          type: "boolean",
          description: "Optional per-layer motion blur switch. Must be a JSON boolean."
        },
        audioEnabled: {
          type: "boolean",
          description: "Optional per-layer audio switch, independent from the layer visibility enabled switch. Must be a JSON boolean."
        }
      },
      required: ["layerIndices"]
    }
  },
{
    name: "set_layer_parent",
    description: "Parent one explicit layer to another explicit layer in the same composition, with optional child/parent name guards.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "1-based child layer index to parent."
        },
        parentLayerIndex: {
          type: "number",
          description: "1-based parent layer index in the same composition."
        },
        expectedLayerName: {
          type: "string",
          description: "Optional exact child layer name guard. The tool fails closed on mismatch."
        },
        expectedParentName: {
          type: "string",
          description: "Optional exact parent layer name guard. The tool fails closed on mismatch."
        }
      },
      required: ["layerIndex", "parentLayerIndex"]
    }
  },
{
    name: "set_layer_track_matte",
    description: "Set one explicit generated layer's track matte to one explicit matte layer in the same composition, with optional name guards and required read-back.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact generated composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "1-based fill layer index that will receive the track matte."
        },
        matteLayerIndex: {
          type: "number",
          description: "1-based matte layer index in the same composition."
        },
        trackMatteType: {
          type: "string",
          enum: ["alpha", "alpha_inverted", "luma", "luma_inverted"],
          description: "Reviewed track matte type to apply."
        },
        expectedLayerName: {
          type: "string",
          description: "Optional exact fill layer name guard. The tool fails closed on mismatch."
        },
        expectedMatteLayerName: {
          type: "string",
          description: "Optional exact matte layer name guard. The tool fails closed on mismatch."
        }
      },
      required: ["layerIndex", "matteLayerIndex", "trackMatteType"]
    }
  },
{
    name: "set_layer_blending_mode",
    description: "Set only the reviewed normal or difference blending mode on explicit layer indices in one explicit composition, with optional expected layer-name and current-mode guards plus required read-back.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Required when compName is omitted. 1-based project item index for the explicit target composition."
        },
        compName: {
          type: "string",
          description: "Required when compItemIndex is omitted. Exact generated target composition name."
        },
        layerIndices: {
          type: "array",
          items: { type: "number" },
          description: "Required explicit 1-based layer indices. Selection-based discovery must happen in earlier read-only steps."
        },
        expectedLayerNames: {
          type: "array",
          items: { type: "string" },
          description: "Optional expected layer names in the same order as layerIndices; mismatches fail closed before mutation."
        },
        expectedCurrentBlendingModes: {
          type: "array",
          items: { type: "string", enum: ["normal", "difference"] },
          description: "Optional expected current blending modes in the same order as layerIndices; mismatches fail closed before mutation."
        },
        blendingMode: {
          type: "string",
          enum: ["normal", "difference"],
          description: "Reviewed target blending mode. Only normal and difference are supported by this generated-only contract."
        }
      },
      required: ["layerIndices", "blendingMode"]
    }
  },
{
    name: "align_layers_to_time",
    description: "Move selected or specified layers so their in-points or start times align to a target time. Defaults to selected layers and the active comp current time indicator.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndices: {
          type: ["number", "array"],
          description: "Optional 1-based layer index or layer indexes. Defaults to selected layers in the target composition."
        },
        targetTime: {
          type: "number",
          description: "Optional target time in seconds. Defaults to the composition current time indicator."
        },
        align: {
          type: "string",
          enum: ["inPoint", "startTime"],
          description: "Whether to align each layer's visible inPoint or raw startTime. Defaults to inPoint, matching the AE '[' shortcut behavior."
        }
      }
    }
  },
{
    name: "set_comp_current_time",
    description: "Set the current time indicator for one explicit composition, with bounded seconds or reviewed frame-derived target and read-back verification.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Required when compName is omitted. 1-based project item index for the target composition."
        },
        compName: {
          type: "string",
          description: "Required when compItemIndex is omitted. Exact target composition name."
        },
        time: {
          type: "number",
          description: "Target current time in seconds. Provide exactly one of time or frame."
        },
        frame: {
          type: "number",
          description: "Zero-based integer frame to convert to seconds. Provide exactly one of time or frame."
        },
        frameRate: {
          type: "number",
          description: "Optional positive frame rate for frame conversion. Defaults to the target comp frameRate."
        },
        expectedCurrentTime: {
          type: "number",
          description: "Optional guard for the current comp time before mutation; mismatches fail closed."
        },
        clampToDuration: {
          type: "boolean",
          description: "Whether to clamp out-of-range time to [0, duration]. Defaults to false, which fails closed."
        },
        openInViewer: {
          type: "boolean",
          description: "Whether to open the target comp in the viewer before setting time. Defaults to false."
        }
      }
    }
  },
{
    name: "set_comp_work_area",
    description: "Set the work-area start and duration for the active or specified composition.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        start: {
          type: "number",
          description: "Work-area start time in seconds. Defaults to the current comp time."
        },
        duration: {
          type: "number",
          description: "Work-area duration in seconds."
        }
      },
      required: ["duration"]
    }
  },
{
    name: "set_comp_properties",
    description: "Update a narrow approved set of properties on one explicit composition: width, height, pixelAspect, duration, frameRate, bgColor, displayStartTime, native displayStartFrame, preserveNestedFrameRate, and motionBlur only.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Required when compName is omitted. 1-based project item index for the target composition."
        },
        compName: {
          type: "string",
          description: "Required when compItemIndex is omitted. Exact target composition name."
        },
        expectedCompName: {
          type: "string",
          description: "Optional exact composition-name guard, especially when compItemIndex is used. A mismatch fails before mutation."
        },
        width: { type: "number", description: "Optional composition width in pixels. Must be a positive integer." },
        height: { type: "number", description: "Optional composition height in pixels. Must be a positive integer." },
        pixelAspect: { type: "number", description: "Optional pixel aspect ratio. Must be greater than 0." },
        duration: { type: "number", description: "Optional composition duration in seconds. Must be greater than 0." },
        frameRate: { type: "number", description: "Optional frame rate in frames per second. Must be greater than 0." },
        bgColor: {
          type: "array",
          items: { type: "number" },
          description: "Optional RGB background color as three numbers from 0 to 1."
        },
        displayStartTime: { type: "number", description: "Optional display start time in seconds." },
        displayStartFrame: { type: "number", description: "Optional native integer display start frame. Requires AE support for CompItem.displayStartFrame." },
        preserveNestedFrameRate: { type: "boolean", description: "Optional Preserve frame rate when nested or in render queue setting." },
        motionBlur: { type: "boolean", description: "Optional composition motion blur switch. Must be a JSON boolean." }
      }
    }
  },
{
    name: "refresh_comp_panel",
    description: "Force a Composition panel refresh for one explicit composition by temporarily toggling comp.motionBlur and restoring the original value with read-back evidence.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Required when compName is omitted. 1-based project item index for the explicit target composition."
        },
        compName: {
          type: "string",
          description: "Required when compItemIndex is omitted. Exact target composition name."
        },
        expectedMotionBlur: {
          type: "boolean",
          description: "Optional guard from prior get_comp_details evidence. The tool fails closed if the current comp.motionBlur state differs."
        }
      }
    }
  },
{
    name: "set_layer_time_range",
    description: "Set start, in-point, out-point, or duration for selected or specified layers.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndices: { type: ["number", "array"], description: "Optional layer index or indexes. Defaults to selected layers." },
        expectedCompItemId: { type: "integer", description: "Optional AE composition item ID guard from fresh inspection." },
        expectedLayerId: { type: "integer", description: "Optional single-layer ID guard; requires exactly one target layer." },
        expectedSourceItemId: { type: "integer", description: "Optional current layer source item ID guard." },
        startTime: { type: "number", description: "Optional layer start time in seconds." },
        inPoint: { type: "number", description: "Optional layer in-point in seconds." },
        outPoint: { type: "number", description: "Optional layer out-point in seconds." },
        duration: { type: "number", description: "Optional visible duration in seconds, applied from the final in-point." }
      }
    }
  },
{
    name: "stagger_layers",
    description: "Sequence selected or specified layers by preserving each layer duration and applying a gap or overlap.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndices: { type: ["number", "array"], description: "Optional layer index or indexes. Defaults to selected layers." },
        startTime: { type: "number", description: "Optional sequence start time. Defaults to comp current time." },
        gap: { type: "number", description: "Seconds between layer out-point and next layer in-point. Defaults to 0." },
        overlap: { type: "number", description: "Seconds each next layer overlaps the previous layer. Defaults to 0." },
        order: { type: "string", enum: ["selection", "indexAsc", "indexDesc"], description: "Layer sequencing order. Defaults to selection/request order." }
      }
    }
  },
{
    name: "split_layers_at_time",
    description: "Split selected or specified layers at the current time indicator or a target time.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndices: { type: ["number", "array"], description: "Optional layer index or indexes. Defaults to selected layers." },
        time: { type: "number", description: "Optional split time in seconds. Defaults to comp current time." }
      }
    }
  },
{
    name: "precompose_layers",
    description: "Precompose explicit layers into a new composition.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndices: { type: "array", items: { type: "number" }, description: "Explicit 1-based layer indexes to precompose." },
        newCompName: { type: "string", description: "Name for the new precomposition." },
        moveAllAttributes: { type: "boolean", description: "Whether to move all attributes into the new comp. Defaults to true." },
        openInViewer: { type: "boolean", description: "Whether to open the new comp after creation. Defaults to true." }
      },
      required: ["layerIndices", "newCompName"]
    }
  },
{
    name: "replace_layer_source",
    description: "Replace selected or specified layer sources with an existing footage or composition item while preserving layer transforms.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndices: { type: ["number", "array"], description: "Optional layer index or indexes. Defaults to selected layers." },
        sourceItemIndex: { type: "number", description: "1-based project item index for the replacement source." },
        sourceItemName: { type: "string", description: "Exact replacement source item name when sourceItemIndex is omitted." },
        sourceItemType: { type: "string", enum: ["comp", "footage"], description: "Optional source type filter." },
        expectedCompItemId: { type: "integer", description: "Optional AE composition item ID guard from fresh inspection." },
        expectedLayerId: { type: "integer", description: "Optional single-layer ID guard; requires exactly one target layer." },
        expectedPreviousSourceItemId: { type: "integer", description: "Optional current layer source item ID guard." },
        expectedSourceItemId: { type: "integer", description: "Optional replacement source item ID guard." },
        fixExpressions: { type: "boolean", description: "Whether After Effects should adjust expressions. Defaults to true." }
      }
    }
  },
{
    name: "rename_layers",
    description: "Rename selected or specified layers with exact, prefix, suffix, or find-replace modes.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndices: { type: ["number", "array"], description: "Optional layer index or indexes. Defaults to selected layers." },
        expectedLayerNames: {
          type: "array",
          items: { type: "string" },
          description: "Optional expected source layer names, one per layerIndices entry. When provided, mismatches fail closed before mutation."
        },
        mode: { type: "string", enum: ["exact", "prefix", "suffix", "findReplace"], description: "Rename mode. Defaults to exact when name is provided." },
        name: { type: "string", description: "Exact base name. For multiple layers, {index} or {n} templates are supported; otherwise a number is appended." },
        allowEmptyName: { type: "boolean", description: "Explicitly allow mode:\"exact\" with name:\"\" for one reviewed layer reset. Defaults to false." },
        prefix: { type: "string", description: "Prefix to add in prefix mode." },
        suffix: { type: "string", description: "Suffix to add in suffix mode." },
        find: { type: "string", description: "Text to find in findReplace mode." },
        replace: { type: "string", description: "Replacement text for findReplace mode." },
        caseSensitive: { type: "boolean", description: "Whether findReplace matching is case-sensitive. Defaults to true." }
      }
    }
  },
{
    name: "rename_project_items",
    description: "Rename project items by explicit indexes or a scoped search with exact, prefix, suffix, or find-replace modes.",
    inputSchema: {
      type: "object",
      properties: {
        itemIndices: { type: ["number", "array"], description: "Optional project item index or indexes." },
        query: { type: "string", description: "Optional name query used when itemIndices is omitted." },
        type: { type: "string", enum: ["comp", "footage", "folder"], description: "Optional project item type filter." },
        exactName: { type: "boolean", description: "Whether query must match the full name. Defaults to false." },
        caseSensitive: { type: "boolean", description: "Whether query/find matching is case-sensitive. Defaults to false for query and true for findReplace." },
        limit: { type: "number", description: "Maximum project items to rename. Defaults to 25, maximum 100." },
        mode: { type: "string", enum: ["exact", "prefix", "suffix", "findReplace"], description: "Rename mode." },
        name: { type: "string", description: "Exact base name. For multiple items, {index} or {n} templates are supported; otherwise a number is appended." },
        prefix: { type: "string", description: "Prefix to add in prefix mode." },
        suffix: { type: "string", description: "Suffix to add in suffix mode." },
        find: { type: "string", description: "Text to find in findReplace mode." },
        replace: { type: "string", description: "Replacement text for findReplace mode." }
      }
    }
  },
{
    name: "update_text_layer",
    description: "Update a text layer's Source Text and common TextDocument fields.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndex: { type: "number", description: "1-based text layer index." },
        text: { type: "string", description: "Optional new text content." },
        font: { type: "string", description: "Optional font name." },
        fontSize: { type: "number", description: "Optional font size." },
        fillColor: { type: "array", items: { type: "number" }, description: "Optional RGB fill color with values from 0 to 1." },
        applyFill: { type: "boolean", description: "Whether fill is enabled." },
        strokeColor: { type: "array", items: { type: "number" }, description: "Optional RGB stroke color with values from 0 to 1." },
        applyStroke: { type: "boolean", description: "Whether stroke is enabled." },
        strokeWidth: { type: "number", description: "Optional stroke width." },
        tracking: { type: "number", description: "Optional tracking value." },
        leading: { type: "number", description: "Optional leading value." },
        justification: { type: "string", enum: ["left", "center", "right"], description: "Optional paragraph justification." }
      },
      required: ["layerIndex"]
    }
  },
{
    name: "create_shape_layer",
    description: "Create a rectangle, ellipse, polygon, or star shape layer with fill, stroke, bounded geometry, position, and timing.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        shape: { type: "string", enum: ["rectangle", "ellipse", "polygon", "star"], description: "Shape type. Defaults to rectangle." },
        name: { type: "string", description: "Optional layer name." },
        size: { type: "array", items: { type: "number" }, description: "Rectangle/ellipse size [width, height]. Defaults to half comp size. Not used for polygon/star." },
        points: { type: "number", description: "Polygon/star point count as an integer from 3 to 64. Defaults to 5 for polygon/star." },
        outerRadius: { type: "number", description: "Polygon/star outer radius in pixels. Defaults to 100." },
        innerRadius: { type: "number", description: "Star inner radius in pixels, greater than 0 and less than outerRadius. Defaults to 50. Not used for polygon." },
        starType: { type: "string", enum: ["polygon", "star"], description: "Optional AE Polystar type guard. Must match shape when provided." },
        position: { type: "array", items: { type: "number" }, description: "Layer position [x, y] or [x, y, z]. Defaults to comp center." },
        fillColor: { type: "array", items: { type: "number" }, description: "Optional RGB fill color with values from 0 to 1." },
        strokeColor: { type: "array", items: { type: "number" }, description: "Optional RGB stroke color with values from 0 to 1." },
        strokeWidth: { type: "number", description: "Optional stroke width. Defaults to 0." },
        startTime: { type: "number", description: "Optional layer start time in seconds." },
        duration: { type: "number", description: "Optional layer duration in seconds." }
      }
    }
  },
{
    name: "create_layer_connection_line",
    description: "Create one generated locked shape layer containing an open stroked path expression that connects two explicit layer anchor points.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Required when compName is not provided. 1-based project item index for the explicit target composition." },
        compName: { type: "string", description: "Required when compItemIndex is not provided. Exact composition name for the explicit target composition." },
        fromLayerIndex: { type: "number", description: "Required 1-based source layer index for the first anchor endpoint." },
        toLayerIndex: { type: "number", description: "Required 1-based source layer index for the second anchor endpoint." },
        expectedFromLayerName: { type: "string", description: "Optional exact name guard for fromLayerIndex." },
        expectedToLayerName: { type: "string", description: "Optional exact name guard for toLayerIndex." },
        name: { type: "string", description: "Optional generated connector layer name. Defaults to Codex Connection Line." },
        pathGroupName: { type: "string", description: "Optional shape group name for the connector path. Defaults to Connector." },
        strokeColor: { type: "array", items: { type: "number" }, description: "Optional RGB stroke color with values from 0 to 1. Defaults to white." },
        strokeWidth: { type: "number", description: "Optional connector stroke width. Defaults to 4." },
        startTime: { type: "number", description: "Optional layer start time in seconds." },
        duration: { type: "number", description: "Optional layer duration in seconds." },
        lockLayer: { type: "boolean", description: "Whether to lock the generated connector layer after expression setup. Defaults to true." }
      },
      required: ["fromLayerIndex", "toLayerIndex"]
    }
  },
{
    name: "create_layer_mask",
    description: "Create one bounded additive polygon mask on an existing layer. This first mask slice does not delete masks, invert masks, or edit arbitrary existing mask paths.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndex: { type: "number", description: "1-based layer index in the target composition." },
        name: { type: "string", description: "Optional mask name. Defaults to Codex Mask." },
        vertices: {
          type: "array",
          description: "Polygon vertices as an array of [x, y] layer-space points. Supports 3 to 50 points.",
          items: { type: "array", items: { type: "number" } }
        },
        maskMode: { type: "string", enum: ["add"], description: "Mask mode. M191 supports only add." },
        opacity: { type: "number", description: "Optional mask opacity from 0 to 100." },
        feather: { type: "array", items: { type: "number" }, description: "Optional [x, y] mask feather values, 0 or greater." },
        expansion: { type: "number", description: "Optional mask expansion in pixels." }
      },
      required: ["layerIndex", "vertices"]
    }
  },
{
    name: "set_layer_mask",
    description: "Create or update one bounded layer mask on one explicit layer in one explicit composition. Provide compItemIndex or compName; update mode requires one explicit maskIndex and this tool never deletes masks, runs roto, or edits arbitrary mask property trees.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Required when compName is not provided. 1-based project item index for the explicit target composition; set_layer_mask does not default to the active comp." },
        compName: { type: "string", description: "Required when compItemIndex is not provided. Exact composition name for the explicit target composition; set_layer_mask does not default to the active comp." },
        layerIndex: { type: "number", description: "Required 1-based layer index in the target composition." },
        operation: { type: "string", enum: ["create", "update"], description: "Required operation. Create adds one mask; update changes one existing mask by maskIndex." },
        maskIndex: { type: "number", description: "Required for update. 1-based mask index in the layer mask group." },
        expectedMaskName: { type: "string", description: "Optional exact mask name guard for update mode." },
        name: { type: "string", description: "Optional mask name for create mode. Update mode does not rename masks." },
        vertices: {
          type: "array",
          description: "Optional polygon vertices as an array of [x, y] layer-space points. Create mode requires 3 to 50 points; update mode may omit vertices when changing other bounded fields.",
          items: { type: "array", items: { type: "number" } }
        },
        maskMode: { type: "string", enum: ["add", "subtract", "intersect", "lighten", "darken", "difference", "none"], description: "Optional bounded mask mode." },
        inverted: { type: "boolean", description: "Optional mask inverted flag." },
        opacity: { type: "number", description: "Optional mask opacity from 0 to 100." },
        feather: { type: "array", items: { type: "number" }, description: "Optional [x, y] mask feather values, 0 or greater." },
        expansion: { type: "number", description: "Optional mask expansion in pixels." }
      },
      required: ["layerIndex", "operation"]
    }
  },
{
    name: "set_path_geometry",
    description: "Set one explicit Shape or Mask path geometry on one layer using reviewed vertices, inTangents, outTangents, closed state, or a bounded keyframe list, then return immediate read-back.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Required when compName is not provided. 1-based project item index for the explicit target composition." },
        compName: { type: "string", description: "Required when compItemIndex is not provided. Exact composition name for the explicit target composition." },
        layerIndex: { type: "number", description: "Required 1-based layer index in the target composition." },
        targetKind: { type: "string", enum: ["shape", "mask"], description: "Path target kind. Shape requires propertyPath; mask requires maskIndex." },
        propertyPath: { type: ["array", "string"], description: "Required for targetKind=shape. Exact property path to an ADBE Vector Shape path property.", items: {} },
        maskIndex: { type: "number", description: "Required for targetKind=mask. 1-based mask index in the layer mask group." },
        expectedLayerName: { type: "string", description: "Optional exact layer name guard." },
        expectedMaskName: { type: "string", description: "Optional exact mask name guard for targetKind=mask." },
        geometry: { type: "object", description: "Optional geometry object with vertices, inTangents, outTangents, and closed. Required unless keyframes are provided." },
        vertices: { type: "array", description: "Top-level vertices alternative to geometry.vertices.", items: { type: "array", items: { type: "number" } } },
        inTangents: { type: "array", description: "Top-level inTangents alternative to geometry.inTangents.", items: { type: "array", items: { type: "number" } } },
        outTangents: { type: "array", description: "Top-level outTangents alternative to geometry.outTangents.", items: { type: "array", items: { type: "number" } } },
        closed: { type: "boolean", description: "Top-level closed state alternative to geometry.closed." },
        keyframes: { type: "array", description: "Optional bounded Shape keyframes; each item needs time plus vertices, inTangents, outTangents, and closed, or a geometry object.", items: { type: "object" } },
        clearExisting: { type: "boolean", description: "When keyframes are provided, remove existing keys before writing the reviewed sequence. Defaults to false." }
      },
      required: ["layerIndex", "targetKind"]
    }
  },
{
    name: "fit_layer_to_comp",
    description: "Scale selected or specified layers to contain, cover, or stretch to the comp frame.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndices: { type: ["number", "array"], description: "Optional layer index or indexes. Defaults to selected layers." },
        mode: { type: "string", enum: ["contain", "cover", "stretch"], description: "Fit mode. Defaults to contain." },
        alignX: { type: "string", enum: ["left", "center", "right"], description: "Horizontal alignment. Defaults to center." },
        alignY: { type: "string", enum: ["top", "center", "bottom"], description: "Vertical alignment. Defaults to center." }
      }
    }
  },
{
    name: "set_property_keyframes",
    description: "Set explicit keyframes on a layer property by property path.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndex: { type: "number", description: "1-based layer index in the target composition." },
        propertyPath: { type: ["array", "string"], description: "Property path from the layer.", items: {} },
        keyframes: { type: "array", description: "Array of keyframes with time and value fields.", items: { type: "object" } },
        clearExisting: { type: "boolean", description: "Whether to remove existing keys first. Defaults to false." }
      },
      required: ["layerIndex", "propertyPath", "keyframes"]
    }
  },
{
    name: "fill_in_keyframes",
    description: "Sample a property's evaluated expression/value over a bounded time range, set linear keyframes, remove redundant identical triples, and optionally clear the expression.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndex: { type: "number", description: "1-based layer index in the target composition." },
        propertyPath: { type: ["array", "string"], description: "Property path from the layer.", items: {} },
        startTime: { type: "number", description: "Optional start time in seconds. Defaults to the first keyframe time, workAreaStart, or 0." },
        endTime: { type: "number", description: "Optional end time in seconds. Defaults to the last keyframe time, workArea end, or comp duration." },
        sampleEveryFrames: { type: "number", description: "Positive frame step for sampling. Defaults to 1." },
        removeRedundant: { type: "boolean", description: "Whether to remove interior keyframes whose previous/current/next values are identical. Defaults to true." },
        clearExpression: { type: "boolean", description: "Whether to clear the expression after baking keyframes. Defaults to true." }
      },
      required: ["layerIndex", "propertyPath"]
    }
  },
{
    name: "keyframe_current_value_from_expression",
    description: "Evaluate the current post-expression property value at a time and write it as a keyframe on the same property.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndex: { type: "number", description: "1-based layer index in the target composition." },
        propertyPath: { type: ["array", "string"], description: "Property path from the layer.", items: {} },
        time: { type: "number", description: "Optional time in seconds. Defaults to the composition current time." },
        requireExpression: { type: "boolean", description: "Whether to require a non-empty expression before keyframing. Defaults to true." }
      },
      required: ["layerIndex", "propertyPath"]
    }
  },
{
    name: "apply_keyframe_ease",
    description: "Apply temporal ease and optional interpolation to selected or explicit keyframes on a layer property.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndex: { type: "number", description: "1-based layer index in the target composition." },
        propertyPath: { type: ["array", "string"], description: "Property path from the layer.", items: {} },
        keyIndices: { type: ["integer", "array"], minimum: 1, items: { type: "integer", minimum: 1 }, minItems: 1, description: "Optional positive 1-based keyframe index or integer indexes. Defaults to selected keys." },
        easeIn: { type: "object", description: "Ease-in object with speed and influence. Defaults to speed 0, influence 33." },
        easeOut: { type: "object", description: "Ease-out object with speed and influence. Defaults to speed 0, influence 33." },
        interpolation: { type: "string", enum: ["bezier", "linear", "hold"], description: "Optional interpolation type." }
      },
      required: ["layerIndex", "propertyPath"]
    }
  },
{
    name: "set_spatial_in_tangent",
    description: "Set the spatial in tangent for a spatial keyframe from the previous keyframe delta, preserving the existing out tangent.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndex: { type: "number", description: "1-based layer index in the target composition." },
        propertyPath: { type: ["array", "string"], description: "Spatial property path from the layer. Defaults to Transform Position.", items: {} },
        keyIndex: { type: "number", description: "1-based keyframe index. Defaults to the first selected key." },
        factor: { type: "number", description: "Multiplier for previous-current delta. Defaults to 0.5." }
      },
      required: ["layerIndex"]
    }
  },
{
    name: "set_expression",
    description: "Set an expression on any expression-capable layer property.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndex: { type: "number", description: "1-based layer index in the target composition." },
        propertyPath: { type: ["array", "string"], description: "Property path from the layer.", items: {} },
        expression: { type: "string", description: "After Effects expression source." },
        enabled: { type: "boolean", description: "Whether the expression should be enabled. Defaults to true." }
      },
      required: ["layerIndex", "propertyPath", "expression"]
    }
  },
{
    name: "separate_shape_size_dimensions",
    description: "Add X Size and Y Size slider controls to a shape layer and drive a rectangle/ellipse Size property with an expression.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndex: { type: "number", description: "1-based shape layer index in the target composition." },
        propertyPath: { type: ["array", "string"], description: "Rectangle or ellipse Size property path from the layer.", items: {} },
        xSliderName: { type: "string", description: "Optional X slider effect name. Defaults to X Size." },
        ySliderName: { type: "string", description: "Optional Y slider effect name. Defaults to Y Size." }
      },
      required: ["layerIndex", "propertyPath"]
    }
  },
{
    name: "clear_expression",
    description: "Clear an expression from any expression-capable layer property.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndex: { type: "number", description: "1-based layer index in the target composition." },
        propertyPath: { type: ["array", "string"], description: "Property path from the layer.", items: {} }
      },
      required: ["layerIndex", "propertyPath"]
    }
  },
{
    name: "add_comp_to_render_queue",
    description: "Add the active or specified composition to the After Effects render queue without starting a render. outputPath must stay under logs/generated-renders or AE_AGENT_GENERATED_RENDER_OUTPUT_DIR.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        renderSettingsTemplate: { type: "string", description: "Optional render settings template name." },
        outputModuleTemplate: { type: "string", description: "Optional output module template name." },
        outputPath: { type: "string", description: "Optional generated render output filename or logs/generated-renders path. Absolute paths, Desktop/user paths, and nested folders are rejected." }
      }
    }
  },
{
    name: "set_render_queue_output",
    description: "Set output path and templates for an existing render queue item without starting a render. outputPath must stay under logs/generated-renders or AE_AGENT_GENERATED_RENDER_OUTPUT_DIR.",
    inputSchema: {
      type: "object",
      properties: {
        renderQueueItemIndex: { type: "number", description: "1-based render queue item index." },
        renderSettingsTemplate: { type: "string", description: "Optional render settings template name." },
        outputModuleTemplate: { type: "string", description: "Optional output module template name." },
        outputPath: { type: "string", description: "Optional generated render output filename or logs/generated-renders path. Absolute paths, Desktop/user paths, and nested folders are rejected." }
      },
      required: ["renderQueueItemIndex"]
    }
  },
{
    name: "get_render_queue_status",
    description: "Return compact status for After Effects render queue items.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Maximum render queue items to return. Defaults to 50." }
      }
    }
  },
{
    name: "set_layer_transform",
    description: "Set common transform values on a layer: position, scale, rotation, opacity, or anchor point.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "1-based layer index in the target composition."
        },
        position: {
          type: "array",
          items: { type: "number" },
          description: "Optional [x, y] or [x, y, z] position."
        },
        scale: {
          type: "array",
          items: { type: "number" },
          description: "Optional [x, y] or [x, y, z] scale percentages."
        },
        rotation: {
          type: "number",
          description: "Optional Z rotation in degrees."
        },
        opacity: {
          type: "number",
          description: "Optional opacity percentage from 0 to 100."
        },
        anchorPoint: {
          type: "array",
          items: { type: "number" },
          description: "Optional [x, y] or [x, y, z] anchor point."
        }
      },
      required: ["layerIndex"]
    }
  },
{
    name: "apply_transform_expression",
    description: "Apply an expression to a common transform property on a layer.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "1-based layer index in the target composition."
        },
        property: {
          type: "string",
          enum: ["position", "scale", "rotation", "opacity", "anchorPoint"],
          description: "Transform property to receive the expression."
        },
        expression: {
          type: "string",
          description: "After Effects expression source."
        },
        enabled: {
          type: "boolean",
          description: "Whether the expression should be enabled. Defaults to true."
        }
      },
      required: ["layerIndex", "property", "expression"]
    }
  },
{
    name: "add_comp_marker",
    description: "Add one composition marker to an explicit composition and return comp.markerProperty read-back.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Provide compItemIndex or compName; this tool does not default to the active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided. Provide compName or compItemIndex; this tool does not default to the active comp."
        },
        time: {
          type: "number",
          description: "Marker time in seconds. Must be explicit and within the target composition duration."
        },
        comment: {
          type: "string",
          description: "Marker comment. Use an explicit empty string only when blank marker semantics are intended."
        },
        duration: {
          type: "number",
          description: "Optional non-negative marker duration in seconds."
        },
        expectedMarkerCountBefore: {
          type: "number",
          description: "Optional marker-count guard from prior get_comp_details includeMarkers evidence."
        },
        ...MUTATION_CHECKPOINT_SCHEMA_PROPERTIES
      },
      required: ["time", "comment"]
    }
  },
{
    name: "add_layer_marker",
    description: "Add a marker to a layer at a given time.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "1-based layer index in the target composition."
        },
        time: {
          type: "number",
          description: "Marker time in seconds. Defaults to the composition current time."
        },
        comment: {
          type: "string",
          description: "Marker comment."
        },
        duration: {
          type: "number",
          description: "Optional marker duration in seconds."
        }
      },
      required: ["layerIndex", "comment"]
    }
  },
{
    name: "update_layer_marker",
    description: "Update one existing layer marker by explicit marker index or strict target time.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "1-based layer index in the target composition."
        },
        markerIndex: {
          type: "number",
          description: "Optional 1-based marker key index to update. Use this when multiple markers share the same time."
        },
        targetTime: {
          type: "number",
          description: "Optional existing marker time in seconds. Required when markerIndex is omitted."
        },
        targetComment: {
          type: "string",
          description: "Optional existing marker comment guard."
        },
        comment: {
          type: "string",
          description: "Optional replacement marker comment."
        },
        time: {
          type: "number",
          description: "Optional replacement marker time in seconds."
        },
        duration: {
          type: "number",
          description: "Optional replacement marker duration in seconds."
        }
      },
      required: ["layerIndex"]
    }
  },
{
    name: "delete_layer_marker",
    description: "Delete one existing layer marker by explicit marker index or strict target time.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "1-based layer index in the target composition."
        },
        markerIndex: {
          type: "number",
          description: "Optional 1-based marker key index to delete. Use this when multiple markers share the same time."
        },
        targetTime: {
          type: "number",
          description: "Optional existing marker time in seconds. Required when markerIndex is omitted."
        },
        targetComment: {
          type: "string",
          description: "Optional existing marker comment guard."
        }
      },
      required: ["layerIndex"]
    }
  },
{
    name: "create_test_comp",
    description: "Create a temporary test composition for script development and open it in the viewer.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Optional comp name. Defaults to Codex Test Comp plus a timestamp."
        },
        width: {
          type: "number",
          description: "Composition width. Defaults to 1920."
        },
        height: {
          type: "number",
          description: "Composition height. Defaults to 1080."
        },
        duration: {
          type: "number",
          description: "Composition duration in seconds. Defaults to 5."
        },
        frameRate: {
          type: "number",
          description: "Composition frame rate. Defaults to 30."
        },
        openInViewer: {
          type: "boolean",
          description: "Whether to open the comp in the viewer. Defaults to true."
        }
      }
    }
  },
{
    name: "cleanup_test_items",
    description: "Remove project items whose names start with a test prefix. Requires confirm=true.",
    inputSchema: {
      type: "object",
      properties: {
        namePrefix: {
          type: "string",
          description: "Only project items with names starting with this prefix are removed. Defaults to Codex Test."
        },
        maxItems: {
          type: "number",
          description: "Maximum number of items to remove. Defaults to 25."
        },
        confirm: {
          type: "boolean",
          description: "Must be true to remove items."
        }
      },
      required: ["confirm"]
    }
  },
{
    name: "build_slideshow_plan",
    description: "Validate a strict data-only slideshow manifest and fresh source inventory, then build local typed stages of at most 50 steps. This tool does not contact After Effects or mutate a project.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        manifest: { type: "object", description: "Strict ae-agent-slideshow.v2 or codx-133-build.v2 data manifest; v1, unknown and code-like fields are rejected." },
        articles: { type: "object", description: "Strict newspaper article source object." },
        inventory: { type: "object", description: "Fresh exact Final Comp and Scene composition fingerprints." }
      },
      required: ["manifest", "articles", "inventory"]
    }
  },
...slideshowTools.createToolDefinitions(MUTATION_CHECKPOINT_SCHEMA_PROPERTIES),
...projectSave.createToolDefinitions(),
...nativeRenderVariant.createToolDefinitions(),
titleExport.toolDefinition(),
...ameJobSource.toolDefinitions(),
...ameOpenComp.toolDefinitions(),
titleExport.recoveryToolDefinition(),
...titleVerification.toolDefinitions(),
ameTransport.tool,
amePresets.listAmePresetsTool,
ameRunning.tool,
...ameQueueControl.tools,
...ameEnqueueSequence.tools,
ameSavedSourceAdmission.tool,
ameSourceProbe.tool,
ameFixtureRunner.tool,
ameFixtureRunner.inspectTool,
ameFixtureRunner.inspectAttemptTool,
...ameTitleJobs.tools,
...projectLifecycleContract.toolDefinitions,
projectLifecyclePlan.tool,
projectLifecyclePlan.recoveryTool
];
return tools;
}
module.exports=Object.freeze({createToolCatalog});
