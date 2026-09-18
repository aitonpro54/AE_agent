"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const {
  CONTRACT_VERSION,
  TOOL_NAME,
  createToolDefinitions,
  validateToolInput,
  createProjectSaveExecutor,
  verifyReceipt
} = require("../mcp-server/project-save");

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function expectCode(error, code) {
  return Boolean(error && error.code === code);
}

function createFixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ae-agent-project-save-"));
  const projectFile = path.join(root, "synthetic-save-contract.aep");
  const before = Buffer.from("synthetic-aep-before\n", "utf8");
  fs.writeFileSync(projectFile, before);
  const checkpointFile = path.join(root, "checkpoint-copy.aep");
  const calls = { ae: [], checkpoint: [] };
  const state = {
    currentProjectFile: projectFile,
    after: Buffer.from("synthetic-aep-after\n", "utf8")
  };

  const runExtendScriptBody = async (body, metadata) => {
    const phase = metadata && metadata.phase;
    calls.ae.push({ phase, body });
    if (phase === "preflight") {
      if (options.preflightFailure) throw new Error("synthetic preflight failure");
      return { result: { projectFile: state.currentProjectFile } };
    }
    if (phase === "save") {
      if (options.saveFailure) throw new Error("synthetic save failure");
      if (options.emptyAfterSave) fs.writeFileSync(projectFile, Buffer.alloc(0));
      else if (!options.noopSave) fs.writeFileSync(projectFile, state.after);
      return { result: { projectFile: state.currentProjectFile, saved: true } };
    }
    if (phase === "readback") {
      if (options.readbackFailure) throw new Error("synthetic readback failure");
      return { result: { projectFile: state.currentProjectFile } };
    }
    throw new Error(`unexpected AE phase ${phase}`);
  };

  const createCheckpoint = async (request) => {
    calls.checkpoint.push(request);
    if (options.checkpointFailure) throw new Error("synthetic checkpoint failure");
    const target = options.checkpointSamePath ? request.sourceFile : checkpointFile;
    if (options.checkpointHardlink) fs.linkSync(request.sourceFile, target);
    else if (!options.checkpointSamePath) fs.copyFileSync(request.sourceFile, target);
    if (options.mutateSourceAfterCheckpoint) {
      fs.writeFileSync(projectFile, Buffer.from("synthetic external disk change\n", "utf8"));
    }
    const checkpoint = fs.readFileSync(target);
    return {
      checkpointFile: target,
      sourceFile: request.sourceFile,
      label: request.label,
      snapshotScope: request.snapshotScope,
      bytes: checkpoint.length,
      sha256: sha256(checkpoint)
    };
  };

  const executor = createProjectSaveExecutor({ runExtendScriptBody, createCheckpoint });
  const args = {
    expectedProjectFile: projectFile,
    expectedSavedFileSha25664: sha256(before),
    checkpointLabel: "synthetic-before-in-place-save"
  };
  const context = {
    authorization: {
      authorized: true,
      confirmed: true,
      proposalId: "proposal-synthetic-save",
      runId: `run-${Math.random().toString(16).slice(2)}`
    }
  };
  return { root, projectFile, checkpointFile, calls, state, executor, args, context };
}

function removeFixture(fixture) {
  const resolvedRoot = fs.realpathSync(fixture.root);
  const expectedPrefix = path.join(os.tmpdir(), "ae-agent-project-save-");
  assert(resolvedRoot.startsWith(expectedPrefix), "fixture cleanup must stay inside its synthetic temp root");
  for (const file of [fixture.projectFile, fixture.checkpointFile]) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  fs.rmdirSync(resolvedRoot);
}

async function expectRejected(action, code) {
  await assert.rejects(action, (error) => expectCode(error, code), `expected ${code}`);
}

async function failBeforeWrite(setup, expectedCode) {
  const fixture = createFixture();
  try {
    await setup(fixture);
    await expectRejected(
      () => fixture.executor.execute(TOOL_NAME, fixture.args, fixture.context),
      expectedCode
    );
    assert.strictEqual(fixture.calls.checkpoint.length, 0, `${expectedCode}: checkpoint must not run`);
    assert.strictEqual(fixture.calls.ae.filter((entry) => entry.phase === "save").length, 0, `${expectedCode}: save must not run`);
  } finally {
    removeFixture(fixture);
  }
}

async function main() {
  const {verifyDryRunReceipt}=require("../mcp-server/project-save");
  const proof={dryRunCompletedAt:"2026-09-18T00:00:00Z",payloadHash:"current-hash",project:{expectedFile:"C:\\synthetic\\project.aep"},dryRunReceipt:{payloadHash:"current-hash",contractVersion:"fixture-v1",stepCount:2,projectFile:"C:\\synthetic\\project.aep"}};
  assert(verifyDryRunReceipt(proof,2,"fixture-v1"));
  assert.throws(()=>verifyDryRunReceipt({...proof,dryRunCompletedAt:null},2,"fixture-v1"),error=>error.code==="project_save_dry_run_required");
  for(const change of [{payloadHash:"stale"},{contractVersion:"old"},{stepCount:3},{projectFile:"other.aep"}])assert.throws(()=>verifyDryRunReceipt({...proof,dryRunReceipt:{...proof.dryRunReceipt,...change}},2,"fixture-v1"),error=>error.code==="project_save_dry_run_stale");
  assert.strictEqual(TOOL_NAME, "save_current_named_project");
  assert.strictEqual(CONTRACT_VERSION, "ae-agent-project-save.v1");
  const definitions = createToolDefinitions();
  assert.strictEqual(definitions.length, 1);
  assert.strictEqual(definitions[0].name, TOOL_NAME);
  assert.strictEqual(definitions[0].inputSchema.additionalProperties, false);
  assert.deepStrictEqual(definitions[0].inputSchema.required, [
    "expectedProjectFile",
    "expectedSavedFileSha25664",
    "checkpointLabel"
  ]);
  for (const forbidden of ["destination", "idempotencyKey", "verifyAfter", "autoCheckpoint"]) {
    assert.strictEqual(definitions[0].inputSchema.properties[forbidden], undefined);
  }

  const validationFixture = createFixture();
  try {
    assert.deepStrictEqual(validateToolInput(TOOL_NAME, validationFixture.args), validationFixture.args);
    assert.throws(
      () => validateToolInput(TOOL_NAME, { ...validationFixture.args, destination: validationFixture.projectFile }),
      (error) => expectCode(error, "INVALID_PROJECT_SAVE_INPUT")
    );
    assert.throws(
      () => validateToolInput(TOOL_NAME, { ...validationFixture.args, verifyAfter: false }),
      (error) => expectCode(error, "INVALID_PROJECT_SAVE_INPUT")
    );
    assert.throws(
      () => validateToolInput(TOOL_NAME, { ...validationFixture.args, idempotencyKey: "bypass" }),
      (error) => expectCode(error, "INVALID_PROJECT_SAVE_INPUT")
    );
    assert.throws(
      () => validateToolInput(TOOL_NAME, { ...validationFixture.args, expectedProjectFile: "relative.aep" }),
      (error) => expectCode(error, "INVALID_PROJECT_SAVE_INPUT")
    );
    assert.throws(
      () => validateToolInput(TOOL_NAME, { ...validationFixture.args, expectedProjectFile: "\\\\server\\share\\project.aep" }),
      (error) => expectCode(error, "INVALID_PROJECT_SAVE_INPUT")
    );
    const dotted = `${path.dirname(validationFixture.projectFile)}${path.sep}.${path.sep}${path.basename(validationFixture.projectFile)}`;
    assert.throws(
      () => validateToolInput(TOOL_NAME, { ...validationFixture.args, expectedProjectFile: dotted }),
      (error) => expectCode(error, "INVALID_PROJECT_SAVE_INPUT")
    );
  } finally {
    removeFixture(validationFixture);
  }

  await failBeforeWrite(async (fixture) => {
    fixture.context = {};
  }, "PROJECT_SAVE_AUTHORIZATION_REQUIRED");

  await failBeforeWrite(async (fixture) => {
    fixture.state.currentProjectFile = null;
  }, "PROJECT_SAVE_UNNAMED_PROJECT");

  await failBeforeWrite(async (fixture) => {
    fixture.state.currentProjectFile = path.join(fixture.root, "different.aep");
  }, "PROJECT_SAVE_PROJECT_MISMATCH");

  await failBeforeWrite(async (fixture) => {
    fs.rmSync(fixture.projectFile);
  }, "PROJECT_SAVE_FILE_MISSING");

  await failBeforeWrite(async (fixture) => {
    fixture.args.expectedSavedFileSha25664 = "0".repeat(64);
  }, "PROJECT_SAVE_STALE_FILE");

  await failBeforeWrite(async (fixture) => {
    const realpath = fs.realpathSync(fixture.projectFile);
    fixture.executor = createProjectSaveExecutor({
      runExtendScriptBody: async () => { throw new Error("AE must not run for ambiguous aliases"); },
      createCheckpoint: async () => { throw new Error("checkpoint must not run for ambiguous aliases"); },
      filesystem: {
        realpath: async () => `${realpath}.canonical-alias`,
        stat: fs.promises.stat,
        readFile: fs.promises.readFile
      }
    });
  }, "PROJECT_SAVE_AMBIGUOUS_PATH");

  {
    const fixture = createFixture({ checkpointSamePath: true });
    try {
      await expectRejected(
        () => fixture.executor.execute(TOOL_NAME, fixture.args, fixture.context),
        "PROJECT_SAVE_CHECKPOINT_FAILED"
      );
      assert.strictEqual(fixture.calls.ae.filter((entry) => entry.phase === "save").length, 0);
    } finally {
      removeFixture(fixture);
    }
  }

  {
    const fixture = createFixture({ checkpointHardlink: true });
    try {
      await expectRejected(
        () => fixture.executor.execute(TOOL_NAME, fixture.args, fixture.context),
        "PROJECT_SAVE_CHECKPOINT_FAILED"
      );
      assert.strictEqual(fixture.calls.ae.filter((entry) => entry.phase === "save").length, 0);
    } finally {
      removeFixture(fixture);
    }
  }

  {
    const fixture = createFixture({ checkpointFailure: true });
    try {
      await expectRejected(
        () => fixture.executor.execute(TOOL_NAME, fixture.args, fixture.context),
        "PROJECT_SAVE_CHECKPOINT_FAILED"
      );
      assert.strictEqual(fixture.calls.checkpoint.length, 1);
      assert.strictEqual(fixture.calls.ae.filter((entry) => entry.phase === "save").length, 0);
    } finally {
      removeFixture(fixture);
    }
  }

  {
    const fixture = createFixture({ mutateSourceAfterCheckpoint: true });
    try {
      await expectRejected(
        () => fixture.executor.execute(TOOL_NAME, fixture.args, fixture.context),
        "PROJECT_SAVE_FILE_CHANGED_AFTER_CHECKPOINT"
      );
      assert.strictEqual(fixture.calls.ae.filter((entry) => entry.phase === "save").length, 0);
    } finally {
      removeFixture(fixture);
    }
  }

  {
    const fixture = createFixture({ saveFailure: true });
    try {
      await expectRejected(
        () => fixture.executor.execute(TOOL_NAME, fixture.args, fixture.context),
        "PROJECT_SAVE_AE_SAVE_FAILED"
      );
      assert.strictEqual(fixture.calls.checkpoint.length, 1);
      assert.strictEqual(fixture.calls.ae.filter((entry) => entry.phase === "save").length, 1);
      assert.strictEqual(fixture.calls.ae.filter((entry) => entry.phase === "readback").length, 0);
    } finally {
      removeFixture(fixture);
    }
  }

  {
    const fixture = createFixture({ emptyAfterSave: true });
    try {
      await expectRejected(
        () => fixture.executor.execute(TOOL_NAME, fixture.args, fixture.context),
        "PROJECT_SAVE_POST_FILE_EMPTY"
      );
      assert.strictEqual(fixture.calls.ae.filter((entry) => entry.phase === "readback").length, 1);
    } finally {
      removeFixture(fixture);
    }
  }

  {
    const fixture = createFixture();
    try {
      const receipt = await fixture.executor.execute(TOOL_NAME, fixture.args, fixture.context);
      assert.notStrictEqual(receipt.fileBefore.sha256, receipt.fileAfter.sha256);
      assert.match(receipt.fileBefore.observedAt, /^\d{4}-\d{2}-\d{2}T/);
      assert.match(receipt.fileAfter.observedAt, /^\d{4}-\d{2}-\d{2}T/);
      assert.match(receipt.checkpoint.observedAt, /^\d{4}-\d{2}-\d{2}T/);
      assert.strictEqual(verifyReceipt(receipt, fixture.args).valid, true);
      const phases = fixture.calls.ae.map((entry) => entry.phase);
      assert.deepStrictEqual(phases, ["preflight", "save", "readback"]);
      const saveBody = fixture.calls.ae.find((entry) => entry.phase === "save").body;
      assert(saveBody.indexOf("project_target_mismatch") >= 0);
      assert(saveBody.indexOf("project_target_mismatch") < saveBody.indexOf("app.project.save()"));
      assert(saveBody.indexOf("project_target_changed_after_save") > saveBody.indexOf("app.project.save()"));
    } finally {
      removeFixture(fixture);
    }
  }

  {
    const fixture = createFixture({ noopSave: true });
    try {
      const receipt = await fixture.executor.execute(TOOL_NAME, fixture.args, fixture.context);
      assert.strictEqual(receipt.contractVersion, CONTRACT_VERSION);
      assert.strictEqual(receipt.operation, "persist_current_named_project_in_place");
      assert.strictEqual(receipt.fileBefore.sha256, receipt.fileAfter.sha256, "no-op disk hash is allowed");
      assert.strictEqual(receipt.checkpoint.snapshotScope, "on_disk_before_save");
      assert.strictEqual(receipt.checkpoint.sha256, receipt.fileBefore.sha256);
      assert.strictEqual(receipt.aeReadBack.matchesExpected, true);
      assert.strictEqual(receipt.inMemoryRevisionProof, "not_observed");
      assert.strictEqual(receipt.reopenVerification, "pending");
      assert.strictEqual(verifyReceipt(receipt, fixture.args).valid, true);

      await expectRejected(
        () => fixture.executor.execute(TOOL_NAME, fixture.args, fixture.context),
        "PROJECT_SAVE_REPLAY_BLOCKED"
      );

      for (const broken of [
        { ...receipt, fileAfter: null },
        { ...receipt, reopenVerification: "passed" },
        { ...receipt, fileBefore: { ...receipt.fileBefore, sha256: "f".repeat(64) } },
        { ...receipt, fileAfter: { ...receipt.fileAfter, observedAt: "not-a-timestamp" } },
        { ...receipt, aeReadBack: { ...receipt.aeReadBack, matchesExpected: false } },
        { ...receipt, checkpoint: { ...receipt.checkpoint, checkpointFile: receipt.fileBefore.path } },
        {
          ...receipt,
          checkpoint: {
            ...receipt.checkpoint,
            fileIdentity: receipt.fileBefore.fileIdentity
          }
        }
      ]) {
        assert.throws(
          () => verifyReceipt(broken, fixture.args),
          (error) => expectCode(error, "INVALID_PROJECT_SAVE_RECEIPT")
        );
      }
    } finally {
      removeFixture(fixture);
    }
  }

  {
    const fixture = createFixture();
    let saveCalls = 0;
    const app = {
      project: {
        file: { fsName: fixture.projectFile },
        save() { saveCalls += 1; }
      }
    };
    const runExtendScriptBody = async (body) => ({
      result: vm.runInNewContext(`(function(){${body}})()`, { app })
    });
    const createCheckpoint = async (request) => {
      fs.copyFileSync(request.sourceFile, fixture.checkpointFile);
      app.project.file = { fsName: path.join(fixture.root, "switched-after-checkpoint.aep") };
      const bytes = fs.readFileSync(fixture.checkpointFile);
      return {
        checkpointFile: fixture.checkpointFile,
        sourceFile: request.sourceFile,
        label: request.label,
        snapshotScope: request.snapshotScope,
        bytes: bytes.length,
        sha256: sha256(bytes)
      };
    };
    fixture.executor = createProjectSaveExecutor({ runExtendScriptBody, createCheckpoint });
    try {
      await expectRejected(
        () => fixture.executor.execute(TOOL_NAME, fixture.args, fixture.context),
        "PROJECT_SAVE_AE_SAVE_FAILED"
      );
      assert.strictEqual(saveCalls, 0, "actual generated JSX guard must fail before app.project.save()");
    } finally {
      removeFixture(fixture);
    }
  }

  {
    const fixture = createFixture();
    try {
      const first = fixture.executor.execute(TOOL_NAME, fixture.args, fixture.context);
      const secondContext = {
        authorization: { ...fixture.context.authorization, runId: "run-concurrent-second" }
      };
      await expectRejected(
        () => fixture.executor.execute(TOOL_NAME, fixture.args, secondContext),
        "PROJECT_SAVE_CONCURRENT_EXECUTION"
      );
      await first;
    } finally {
      removeFixture(fixture);
    }
  }

  console.log(JSON.stringify({
    ok: true,
    tool: TOOL_NAME,
    contractVersion: CONTRACT_VERSION,
    aeCommands: 0,
    coverage: [
      "exact-existing-named-project",
      "stale-hash-and-alias-fail-before-write",
      "mandatory-disk-checkpoint",
      "distinct-checkpoint-path-and-inode",
      "synchronous-path-recheck-and-save",
      "generated-jsx-vm-fail-before-save",
      "separate-ae-readback-and-node-hash",
      "no-op-save-receipt",
      "concurrency-and-replay"
    ]
  }, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
