"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  MEMORY_SCHEMA,
  MEMORY_ENTRY_SCHEMA,
  PLANNER_USE,
  MAX_PROMPT_SECTION_CHARS,
  validateMemoryRegistry,
  retrieveProjectIntentMemory,
  formatProjectIntentMemoryForPrompt,
  updateProjectIntentMemory,
  PROJECT_STATE_SCHEMA,
  MAX_PACKED_STATE_BYTES,
  MAX_STATE_LOGICAL_BYTES,
  serializeProjectStateStore,
  atomicProjectStateWrite,
  loadProjectStateStore,
  validateProjectStateStore,
  canonicalSavedProject,
  projectStateKey,
  transformReviewStore
} = require("../mcp-server/project-intent-memory");

const REPO_ROOT = path.resolve(__dirname, "..");
const TRACKED_MEMORY_PATH = path.join(REPO_ROOT, "registry", "project-intent-memory.json");

function entry(overrides = {}) {
  return Object.assign({
    schema: MEMORY_ENTRY_SCHEMA,
    id: "fixture-generated-prefixes",
    status: "active",
    category: "generated-prefix",
    title: "Fixture Generated Prefixes",
    summary: "Use Codex QA prefixes for temporary generated validation assets and clean up only matching generated names.",
    tags: ["generated-assets", "cleanup", "temporary", "qa"],
    appliesWhen: [
      "The user asks to create a temporary validation comp or layer.",
      "Cleanup must target generated items without touching user assets."
    ],
    priority: 8,
    confidence: "high",
    source: {
      kind: "smoke",
      date: "2026-05-15",
      reviewed: true
    },
    notes: ["Generated cleanup must stay prefix-scoped."]
  }, overrides);
}

function registry(entries) {
  return {
    schema: MEMORY_SCHEMA,
    entrySchema: MEMORY_ENTRY_SCHEMA,
    updatedAt: "2026-05-15",
    policy: {
      plannerUse: PLANNER_USE,
      maxPromptChars: MAX_PROMPT_SECTION_CHARS,
      maxRetrievedEntries: 4,
      storageRule: "Local reviewed project intent only; no secrets, raw transcripts, public/tunnel URLs, full project scans, or user absolute paths."
    },
    entries
  };
}

function ids(retrieval) {
  return retrieval.entries.map((item) => item.id);
}

function writeMemory(tempDir, memory) {
  const memoryPath = path.join(tempDir, "project-intent-memory.json");
  fs.writeFileSync(memoryPath, `${JSON.stringify(memory, null, 2)}\n`, "utf8");
  return memoryPath;
}

function assertRejected(update, pattern, label) {
  assert.strictEqual(update.ok, false, `${label} should be rejected.`);
  assert(pattern.test(update.error), `${label} should mention ${pattern}; got ${update.error}`);
}

function run() {
  const tracked = JSON.parse(fs.readFileSync(TRACKED_MEMORY_PATH, "utf8"));
  const trackedValidation = validateMemoryRegistry(tracked);
  assert.strictEqual(trackedValidation.ok, true);
  assert(trackedValidation.activeCount >= 2, "tracked memory should include reviewed active entries.");

  const relevant = entry();
  const protectedAssets = entry({
    id: "fixture-protect-user-assets",
    category: "protected-assets",
    title: "Fixture Protect User Assets",
    summary: "Inspect selected user assets before broad rename, replace, delete, or retime operations.",
    tags: ["safety", "protected-assets", "selection", "readback"],
    appliesWhen: ["The user asks for broad edits to existing project assets."],
    priority: 10,
    confidence: "high"
  });
  const disabled = entry({
    id: "fixture-disabled-memory",
    status: "disabled",
    title: "Disabled Memory",
    tags: ["generated-assets"]
  });
  const irrelevant = entry({
    id: "fixture-render-queue-memory",
    category: "workflow-hint",
    title: "Fixture Render Queue Memory",
    summary: "Inspect render queue status before reporting queued items.",
    tags: ["render", "queue"],
    appliesWhen: ["The user asks for render queue status."],
    priority: 3,
    confidence: "medium"
  });

  const retrieval = retrieveProjectIntentMemory("Create a temporary QA title comp and clean up generated assets only.", {
    memory: registry([relevant, protectedAssets, disabled, irrelevant]),
    topN: 3
  });
  assert.strictEqual(retrieval.ok, true);
  assert(ids(retrieval).includes("fixture-generated-prefixes"), "relevant generated-prefix memory should surface.");
  assert(!ids(retrieval).includes("fixture-disabled-memory"), "disabled memory must not surface.");
  assert(!ids(retrieval).includes("fixture-render-queue-memory"), "irrelevant memory should be omitted.");
  assert.strictEqual(retrieval.omitted.disabled, 1);
  assert(formatProjectIntentMemoryForPrompt(retrieval).indexOf("Project intent memory hints") >= 0);
  assert(formatProjectIntentMemoryForPrompt(retrieval).length <= MAX_PROMPT_SECTION_CHARS);

  const protectedRetrieval = retrieveProjectIntentMemory("Rename existing selected project items using a safe naming convention.", {
    memory: registry([relevant, protectedAssets]),
    topN: 2
  });
  assert(ids(protectedRetrieval).includes("fixture-protect-user-assets"), "protected asset memory should surface for broad rename prompts.");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ae-project-intent-memory-"));
  try {
    const memoryPath = writeMemory(tempDir, registry([relevant]));
    const safeUpdate = updateProjectIntentMemory({
      confirm: true,
      dryRun: true,
      entry: entry({
        id: "fixture-naming-memory",
        category: "naming-convention",
        title: "Fixture Naming Memory",
        summary: "Use exact prefix or suffix rules for batch renaming and read current names first.",
        tags: ["naming", "rename", "batch"],
        appliesWhen: ["The user requests broad layer or project-item naming changes."],
        priority: 7,
        confidence: "medium"
      })
    }, { memoryPath });
    assert.strictEqual(safeUpdate.ok, true);
    assert.strictEqual(safeUpdate.dryRun, true);
    assert.strictEqual(safeUpdate.registry.entryCount, 2);

    const persistedUpdate = updateProjectIntentMemory({
      confirm: true,
      entry: entry({
        id: "fixture-main-comps",
        category: "main-comps",
        title: "Fixture Main Comps",
        summary: "Prefer active comp inspection before choosing a main composition target.",
        tags: ["active-comp", "main-comp", "inspection"],
        appliesWhen: ["The user asks to change the main composition but does not name it."],
        priority: 6,
        confidence: "medium"
      })
    }, { memoryPath });
    assert.strictEqual(persistedUpdate.ok, true);
    const persisted = JSON.parse(fs.readFileSync(memoryPath, "utf8"));
    assert(persisted.entries.some((item) => item.id === "fixture-main-comps"));

    const disabledUpdate = updateProjectIntentMemory({
      confirm: true,
      action: "disable",
      id: "fixture-main-comps"
    }, { memoryPath });
    assert.strictEqual(disabledUpdate.ok, true);
    const disabledMemory = JSON.parse(fs.readFileSync(memoryPath, "utf8"));
    assert.strictEqual(disabledMemory.entries.find((item) => item.id === "fixture-main-comps").status, "disabled");

    assertRejected(updateProjectIntentMemory({
      confirm: true,
      dryRun: true,
      entry: entry({
        id: "fixture-secret-memory",
        summary: "Use OPENAI_API_KEY=sk-proj-12345678901234567890 for this project."
      })
    }, { memoryPath }), /unsafe memory text|provider-secret/i, "secret memory");

    assertRejected(updateProjectIntentMemory({
      confirm: true,
      dryRun: true,
      entry: entry({
        id: "fixture-path-memory",
        summary: "Main project lives at C:\\Users\\Ant\\Documents\\secret-project\\shot.aep."
      })
    }, { memoryPath }), /unsafe memory text|absolute-path/i, "absolute path memory");

    assertRejected(updateProjectIntentMemory({
      confirm: true,
      dryRun: true,
      entry: entry({
        id: "fixture-tunnel-memory",
        summary: "Connector tunnel is https://example.trycloudflare.com for this session."
      })
    }, { memoryPath }), /unsafe memory text|public-or-tunnel-url/i, "tunnel URL memory");

    assertRejected(updateProjectIntentMemory({
      confirm: true,
      dryRun: true,
      entry: entry({
        id: "fixture-transcript-memory",
        summary: "User: rename every comp. Assistant: done."
      })
    }, { memoryPath }), /unsafe memory text|raw-transcript/i, "raw transcript memory");

    const fullScanText = `Project dump {"projectItems":[${new Array(80).fill("{\"name\":\"Comp\",\"type\":\"comp\"}").join(",")}]}`;
    assertRejected(updateProjectIntentMemory({
      confirm: true,
      dryRun: true,
      entry: entry({
        id: "fixture-project-scan-memory",
        summary: fullScanText
      })
    }, { memoryPath }), /too long|project-scan-dump|unsafe memory text/i, "project scan memory");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  testProjectStateStorage();

  console.log(JSON.stringify({
    ok: true,
    trackedEntries: trackedValidation.entryCount,
    surfaced: ids(retrieval),
    protectedSurface: ids(protectedRetrieval),
    promptChars: formatProjectIntentMemoryForPrompt(retrieval).length
  }, null, 2));
}

function testProjectStateStorage() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ae-project-state-storage-"));
  try {
    const statePath = path.join(tempDir, "project-intent-state.json");

    function makeProjectState(projectFile, mappingCount = 450, valueLen = 0) {
      const normFile = canonicalSavedProject(projectFile);
      const key = projectStateKey(normFile);
      const groupMappings = [];
      for (let m = 0; m < mappingCount; m++) {
        const extra = valueLen > 0 ? "_" + "x".repeat(valueLen) : "";
        groupMappings.push({
          mediaKey: `media_${key.slice(0, 8)}_${m}${extra}`,
          groupId: `group_${m % 5}`,
          provenance: "user_confirmed",
          confirmed: true
        });
      }
      return {
        projectFile: normFile,
        projectKey: key,
        revision: 0,
        acceptedPlaceholders: [],
        groupMappings,
        constraints: null,
        reviewArtifacts: {},
        sourceLoadEpochs: {}
      };
    }

    // 1. Compact format & trailing newline check
    const baseState = makeProjectState("C:/Projects/small.aep", 2);
    const smallStore = {
      schema: PROJECT_STATE_SCHEMA,
      projectState: { [baseState.projectKey]: baseState }
    };
    validateProjectStateStore(smallStore);
    const compactOutput = serializeProjectStateStore(smallStore);
    assert(compactOutput.endsWith("\n"), "Serialized store must end with newline");
    assert(!compactOutput.includes("\n  "), "Serialized store must be compact without pretty indentations");
    assert.deepStrictEqual(JSON.parse(compactOutput), smallStore, "Compact store parses back to original");

    // 2. Legacy pretty JSON readability via loadProjectStateStore
    const legacyPath = path.join(tempDir, "legacy-state.json");
    const legacyPretty = JSON.stringify(transformReviewStore(smallStore, true), null, 2) + "\n";
    fs.writeFileSync(legacyPath, legacyPretty, "utf8");
    const loadedLegacy = loadProjectStateStore({ statePath: legacyPath, enabled: false, skipLifecycleReadGuard: true });
    assertJsonEqual(loadedLegacy, smallStore, "loadProjectStateStore must read legacy pretty JSON without loss");

    // 3. Meaningful regression: state that exceeds 2MiB in pretty JSON, but fits in compact JSON
    const largeStore = {
      schema: PROJECT_STATE_SCHEMA,
      projectState: {}
    };
    for (let i = 0; i < 35; i++) {
      const pState = makeProjectState(`C:/Projects/large_${i}.aep`, 450);
      largeStore.projectState[pState.projectKey] = pState;
    }
    validateProjectStateStore(largeStore);

    const prettySize = Buffer.byteLength(JSON.stringify(transformReviewStore(largeStore, true), null, 2) + "\n", "utf8");
    const compactSize = Buffer.byteLength(serializeProjectStateStore(largeStore), "utf8");
    assert(prettySize > MAX_PACKED_STATE_BYTES, `Pretty size (${prettySize}) must exceed 2MiB limit (${MAX_PACKED_STATE_BYTES})`);
    assert(compactSize <= MAX_PACKED_STATE_BYTES, `Compact size (${compactSize}) must fit within 2MiB limit (${MAX_PACKED_STATE_BYTES})`);

    // Atomic writer accepts compact state that would fail as pretty
    atomicProjectStateWrite(largeStore, { statePath, enabled: false, skipLifecycleReadGuard: true });
    assert(fs.existsSync(statePath), "atomicProjectStateWrite must produce state file");

    // Byte-for-byte consistency between serializeProjectStateStore and atomic write output
    const writtenBytes = fs.readFileSync(statePath, "utf8");
    assert.strictEqual(writtenBytes, serializeProjectStateStore(largeStore), "Written disk store must match serializeProjectStateStore byte-for-byte");

    // Read back and verify roundtrip data integrity
    const readBack = loadProjectStateStore({ statePath, enabled: false, skipLifecycleReadGuard: true });
    assert.strictEqual(Object.keys(readBack.projectState).length, 35);
    assertJsonEqual(readBack, largeStore, "Read-back store must equal original large store");

    // 4. True packed overflow (> 2MiB even in compact) is rejected
    const packedOverflowStore = {
      schema: PROJECT_STATE_SCHEMA,
      projectState: {}
    };
    for (let i = 0; i < 40; i++) {
      const pState = makeProjectState(`C:/Projects/overflow_${i}.aep`, 450, 160);
      packedOverflowStore.projectState[pState.projectKey] = pState;
    }
    validateProjectStateStore(packedOverflowStore);
    assert(Buffer.byteLength(serializeProjectStateStore(packedOverflowStore), "utf8") > MAX_PACKED_STATE_BYTES);
    assert.throws(
      () => atomicProjectStateWrite(packedOverflowStore, { statePath: path.join(tempDir, "overflow.json"), enabled: false, skipLifecycleReadGuard: true }),
      /project_state_size_limit/
    );

    // 5. Logical overflow (> 32MiB) is rejected
    const logicalOverflowStore = {
      schema: PROJECT_STATE_SCHEMA,
      projectState: {}
    };
    for (let i = 0; i < 20; i++) {
      const pState = makeProjectState(`C:/Projects/logical_${i}.aep`, 450, 3800);
      logicalOverflowStore.projectState[pState.projectKey] = pState;
    }
    validateProjectStateStore(logicalOverflowStore);
    assert(Buffer.byteLength(JSON.stringify(logicalOverflowStore), "utf8") > MAX_STATE_LOGICAL_BYTES);
    assert.throws(
      () => atomicProjectStateWrite(logicalOverflowStore, { statePath: path.join(tempDir, "logical-overflow.json"), enabled: false, skipLifecycleReadGuard: true }),
      /project_state_logical_size_limit/
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function assertJsonEqual(actual, expected, message) {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)), message);
}

run();
