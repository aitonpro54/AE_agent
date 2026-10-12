"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path"), crypto = require("node:crypto");
const grant = require("../mcp-server/ame-manual-queue-grant"), { sha256Payload } = require("../mcp-server/m100-protocol");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ae-ame-manual-queue-")), copy = value => JSON.parse(JSON.stringify(value));
let groups = 0;
const id = () => crypto.randomUUID(), sha = "a".repeat(64);
function fixture() {
  let clock = Date.now(); const stateDir = path.join(root, id()), batchId = id(), runId = id(), dryRunId = id(), brands = new WeakSet();
  const processInfo = { pid: 77, startedAt: new Date(clock - 10000).toISOString(), path: "C:\\Program Files\\Adobe\\Adobe Media Encoder.exe" };
  const preset = { path: path.join(root, "exact.epr"), sha25664: sha, id: "amep_" + "b".repeat(40) };
  const manifest = { schema: grant.MANIFEST_SCHEMA, targetSpecifier: "ame-26.0", batchId, process: processInfo, processBinding: sha, nativeSessionNonce: null,
    retainedWrapperSessionNonce: id(), presetIdentity: sha, jobs: [1, 2].map(n => { const jobId = id(); return { jobId, handleKey: jobId, enqueueRequestNonce: id(), operationBinding: sha,
      source: { path: path.join(root, "variant-" + n + ".aep"), sha25664: sha, guid: "GUID-" + n }, preset: { ...preset }, outputPath: path.join(root, "title-" + n + ".mov"), range: { startSeconds: 0, endSeconds: 2 } }; }) };
  const args = { targetSpecifier: manifest.targetSpecifier, expectedProcess: { pid: processInfo.pid, startedAt: processInfo.startedAt }, batchId, manualQueueManifestSha25664: grant.manifestHash(manifest) };
  const payload = { plan: { steps: [{ tool: "start_ame_title_batch", args }] } };
  const record = { actionId: "act_" + id(), revision: 2, payload, payloadHash: sha256Payload(payload), previewHash: sha, riskLevel: "mutating", executionState: "executing", executionId: runId,
    confirmationSurface: "cep-panel", confirmedBySurface: "cep-panel", confirmedBySession: "private-panel-session", confirmedAt: new Date(clock).toISOString(),
    dryRunCompletedAt: new Date(clock - 1000).toISOString(), proposalExpiresAt: new Date(clock + 600000).toISOString(), project: { expectedFile: path.join(root, "source.aep") } };
  record.dryRunReceipt = { runId: dryRunId, payloadHash: record.payloadHash, previewHash: record.previewHash, stepCount: 1, projectFile: record.project.expectedFile };
  const context = { record, args, runId, stepCount: 1, autonomous: false, confirm: true, allowWithoutCheckpoint: false, checkpoint: { sourceFile: record.project.expectedFile, checkpointFile: path.join(root, "checkpoint.aep") } };
  brands.add(context);
  let panelValid = true;
  const deps = { stateDir, now: () => clock, assertPanelIdentity: () => panelValid, assertManualIngress: ctx => assert(brands.has(ctx), "private ingress required"), assertServerContext: ctx => { assert.equal(ctx.record, record); assert.equal(ctx.record.executionState, "executing"); } };
  const issuer = grant.createManualQueueGrant(deps), meta = { route: grant.ROUTE, authRole: "panel", panelIdentityValid: true, trustedGesture: true, declaration: grant.DECLARATION,
    manifestHash: grant.manifestHash(manifest), acceptedDryRunId: dryRunId, panelConnectionId: "panel-77", panelGeneration: "3" };
  const start = () => ({ schema: grant.RESERVATION_SCHEMA, batchId, requestNonce: id(), operationBinding: sha, reservedAt: new Date(clock).toISOString(), transportResolved: false, state: "unknown_outcome" });
  return { issuer, deps, meta, manifest, context, start, stateDir, batchId, advance: ms => { clock += ms; }, disconnect: () => { panelValid = false; } };
}
async function check(name, fn) { await fn(); groups++; }
(async () => {
  await check("non-panel, admin, generic/manual action ingress, echo and false gestures reject", async () => {
    for (const override of [{ authRole: "automation" }, { authRole: "admin" }, { route: "/agents/plan/run" }, { route: "/dev/agents/plan/run" }, { panelIdentityValid: false }, { trustedGesture: false }, { declaration: "yes" }]) {
      const f = fixture(); await assert.rejects(f.issuer.runAuthenticated({ ...f.meta, ...override }, () => f.issuer.authorize(f.context, f.manifest)));
    }
    const f = fixture(); assert.throws(() => f.issuer.authorize(f.context, f.manifest));
    await f.issuer.runAuthenticated(f.meta, () => assert.throws(() => f.issuer.assertCapability({ declaration: grant.DECLARATION }, f.context, f.manifest)));
  });
  await check("asynchronous assertion callbacks cannot count as an accepted gate", async () => {
    for (const key of ["assertManualIngress", "assertServerContext", "assertPanelIdentity"]) {
      const f = fixture(), issuer = grant.createManualQueueGrant({ ...f.deps, [key]: async () => true });
      await issuer.runAuthenticated(f.meta, () => assert.throws(() => issuer.authorize(f.context, f.manifest), /synchronous_assertion_required/));
      assert.equal(issuer.readReservation(f.batchId), null);
    }
  });
  await check("positive private manual capability produces durable honest receipt once", async () => {
    const f = fixture();
    await f.issuer.runAuthenticated(f.meta, async () => {
      const cap = f.issuer.authorize(f.context, f.manifest), start = f.start();
      const saved = f.issuer.consume(cap, f.context, f.manifest, start);
      assert.equal(saved.manualQueueReceipt.proofSource, "authenticated_cep_user_declaration"); assert.equal(saved.manualQueueReceipt.physicalHumanVerified, false); assert.equal(saved.manualQueueReceipt.nativeQueueCompositionVerified, false);
      assert.equal(saved.manualQueueReceipt.manifest.nativeSessionNonce, null); assert.equal(saved.manualQueueReceipt.dryRunReceipt.runId, f.meta.acceptedDryRunId);
      assert.deepEqual(f.issuer.readReservation(f.batchId), saved); assert.throws(() => f.issuer.consume(cap, f.context, f.manifest, start));
      const cap2 = f.issuer.authorize(f.context, f.manifest); assert.throws(() => f.issuer.consume(cap2, f.context, f.manifest, f.start()), /already_reserved/);
    });
    const restarted = grant.createManualQueueGrant(f.deps); assert(restarted.readReservation(f.batchId)); assert.throws(() => restarted.authorize(f.context, f.manifest));
  });
  await check("context proposals, dryrun, session, payload, checkpoint and manifest drift reject", async () => {
    const mutations = [f => { f.context.autonomous = true; }, f => { f.context.confirm = false; }, f => { f.context.stepCount = 2; }, f => { f.context.allowWithoutCheckpoint = true; },
      f => { f.context.record.revision++; }, f => { f.context.record.payloadHash = "c".repeat(64); }, f => { f.context.record.previewHash = "c".repeat(64); }, f => { f.context.record.confirmedBySession = "foreign"; },
      f => { f.context.record.dryRunReceipt.runId = id(); }, f => { f.context.checkpoint.sourceFile = path.join(root, "foreign.aep"); }, f => f.disconnect(),
      f => { f.manifest.nativeSessionNonce = "foreign"; }, f => { f.manifest.process.pid++; }, f => { f.manifest.process.startedAt = new Date().toISOString(); },
      f => { f.manifest.retainedWrapperSessionNonce = id(); }, f => { f.manifest.jobs[0].source.guid = "foreign"; }, f => { f.manifest.jobs[0].source.sha25664 = "c".repeat(64); },
      f => { f.manifest.jobs[0].preset.path = path.join(root, "other.epr"); }, f => { f.manifest.jobs[0].outputPath = path.join(root, "foreign.mov"); }, f => { f.manifest.jobs[0].range.endSeconds++; }];
    for (const mutate of mutations) { const f = fixture(); await f.issuer.runAuthenticated(f.meta, () => { const cap = f.issuer.authorize(f.context, f.manifest); mutate(f); assert.throws(() => f.issuer.consume(cap, f.context, f.manifest, f.start())); }); assert.equal(f.issuer.readReservation(f.batchId), null); }
  });
  await check("expiry, frame lifetime and server restart never retain a capability", async () => {
    const f = fixture(); let cap;
    await f.issuer.runAuthenticated(f.meta, () => { cap = f.issuer.authorize(f.context, f.manifest); f.advance(120000); assert.throws(() => f.issuer.consume(cap, f.context, f.manifest, f.start())); });
    assert.throws(() => f.issuer.assertCapability(cap, f.context, f.manifest));
    const restarted = grant.createManualQueueGrant(f.deps); await restarted.runAuthenticated(f.meta, () => assert.throws(() => restarted.assertCapability(cap, f.context, f.manifest)));
  });
  await check("manifest is canonical and exact two distinct retained wrapper handles only", () => {
    const f = fixture(), shuffled = Object.fromEntries(Object.entries(f.manifest).reverse()); assert.equal(grant.manifestHash(shuffled), grant.manifestHash(f.manifest));
    for (const mutate of [m => { m.jobs.pop(); }, m => { m.jobs.push(copy(m.jobs[0])); }, m => { m.jobs[1].jobId = m.jobs[0].jobId; m.jobs[1].handleKey = m.jobs[0].jobId; },
      m => { m.jobs[1].outputPath = m.jobs[0].outputPath; }, m => { m.retainedWrapperSessionNonce = null; }, m => { m.verifiedSessionNonce = "invented"; }]) { const changed = copy(f.manifest); mutate(changed); assert.throws(() => grant.manifestHash(changed)); }
  });
  await check("manifest uses server ledger plus fresh queued idle retained-wrapper observations", () => {
    const f = fixture(), observedAt = Date.now(), batch = { batchId: f.batchId, start: null, processBinding: f.manifest.processBinding, presetIdentity: f.manifest.presetIdentity,
      jobs: f.manifest.jobs.map(job => ({ jobId: job.jobId, handleKey: job.handleKey, requestNonce: job.enqueueRequestNonce, operationBinding: job.operationBinding, sourcePath: job.source.path,
        sourcePin: { sha256: job.source.sha25664 }, presetPath: job.preset.path, presetPin: { sha256: job.preset.sha25664 }, outputPath: job.outputPath,
        args: { sourceGuid: job.source.guid, presetId: job.preset.id, range: job.range }, readyForStart: true, nativeAssociationVerified: true,
        nativeObservation: { code: "job_observed", batchRunning: false, requestNonce: id(), observedAt, sessionNonce: null,
          job: { status: "queued", nativeAssociationVerified: true, handleKey: job.handleKey, enqueueRequestNonce: job.enqueueRequestNonce, retainedWrapperSessionNonce: f.manifest.retainedWrapperSessionNonce } } })) };
    assert.deepEqual(grant.buildManifest(batch, f.manifest.process, f.context.args, observedAt), f.manifest);
    for (const mutate of [b => { b.jobs.pop(); }, b => { b.start = {}; }, b => { b.jobs[0].nativeObservation.batchRunning = true; },
      b => { b.jobs[0].nativeObservation.observedAt = 1; }, b => { b.jobs[0].nativeObservation.requestNonce = b.jobs[0].requestNonce; }, b => { b.jobs[0].nativeObservation.job.status = "running"; },
      b => { b.jobs[0].nativeObservation.job.retainedWrapperSessionNonce = null; }, b => { b.jobs[1].nativeObservation.sessionNonce = "foreign"; }]) { const changed = copy(batch); mutate(changed); assert.throws(() => grant.buildManifest(changed, f.manifest.process, f.context.args, observedAt)); }
  });
  await check("corrupt/partial exclusive marker persists no replay", () => {
    const f = fixture(), file = path.join(f.stateDir, "starts", f.batchId + ".json"); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, "{");
    assert.throws(() => f.issuer.readReservation(f.batchId), /corrupt_no_replay/); assert.throws(() => grant.writeReservation(f.stateDir, f.start()), /already_reserved/);
  });
  await check("independent two-wrapper START evidence proves dispatch only and rejects echoes/drift", async () => {
    const f = fixture(); let reserved;
    await f.issuer.runAuthenticated(f.meta, () => {
      const cap = f.issuer.authorize(f.context, f.manifest), start = f.start();
      start.operationBinding = crypto.createHash("sha256").update(JSON.stringify({ operation: "start", batchId: f.batchId, jobs: f.manifest.jobs.map(j => j.jobId), manifestHash: f.meta.manifestHash })).digest("hex");
      reserved = f.issuer.consume(cap, f.context, f.manifest, start);
    });
    const nativeStart = { requestNonce: reserved.requestNonce, invoked: true, accepted: true }, time = Date.parse(reserved.reservedAt);
    const payload = { schema: "ae-agent-ame-title-jobs.v1", ok: true, code: "batch_start_accepted", requestNonce: reserved.requestNonce, nativeQueueCompositionVerified: false, dispatchAcceptanceVerified: true, completionVerified: false, mediaVerified: false,
      native: { start: nativeStart, operationBinding: reserved.operationBinding, observedAt: time } };
    const run = { id: f.context.runId, startedAt: new Date(time).toISOString(), finishedAt: new Date(time + 1000).toISOString(),
      provenance: { actionId: f.context.record.actionId, proposalRevision: f.context.record.revision, payloadHash: f.context.record.payloadHash },
      m100Action: { previewHash: f.context.record.previewHash, confirmedBySession: f.context.record.confirmedBySession, confirmedBySurface: "cep-panel", confirmedAt: f.context.record.confirmedAt } };
    const reads = f.manifest.jobs.map((job, i) => {
      const nonce = id(), observedAt = new Date(time + i + 1).toISOString(), native = { schema: "ae-agent-ame-title-native.v1", code: "job_observed", appSpecifier: f.manifest.targetSpecifier,
        sessionNonce: null, start: nativeStart, requestNonce: nonce, operationBinding: crypto.createHash("sha256").update(JSON.stringify({ operation: "status", jobId: job.jobId })).digest("hex"), observedAt: time + i + 1,
        job: { nativeJobId: null, handleKey: job.handleKey, nativeAssociationVerified: true, retainedWrapperSessionNonce: f.manifest.retainedWrapperSessionNonce, enqueueRequestNonce: job.enqueueRequestNonce,
          processBinding: f.manifest.processBinding, presetIdentity: f.manifest.presetIdentity, sourcePath: job.source.path, sourceGuid: job.source.guid, outputPath: job.outputPath, range: job.range, outputFiles: [job.outputPath] } };
      return { args: { targetSpecifier: f.manifest.targetSpecifier, expectedProcess: { pid: f.manifest.process.pid, startedAt: f.manifest.process.startedAt }, batchId: f.batchId, jobId: job.jobId }, observedAt,
        result: { schema: "ae-agent-ame-title-jobs.v1", ok: true, code: "job_observed", nativeAssociationVerified: true, nativeQueueCompositionVerified: false, batchId: f.batchId, jobId: job.jobId,
          handleKey: job.handleKey, nativeJobId: null, startReservation: copy(reserved), process: f.manifest.process, native, requestNonce: nonce, observedAt } };
    });
    const args = { ...f.context.args, manualQueueMode: "cep_user_declaration" };
    assert.equal(grant.verifyStartEvidence(args, payload, run, reads), true);
    for (const mutate of [r => { r[0].result.startReservation = null; }, r => { r.pop(); }, r => { r[1] = copy(r[0]); },
      r => { r[0].result.native.requestNonce = payload.requestNonce; }, r => { r[0].result.native.sessionNonce = "invented"; },
      r => { r[0].result.native.job.retainedWrapperSessionNonce = id(); }, r => { r[0].result.startReservation.manualQueueReceipt.runId = id(); },
      r => { r[0].result.native.start.accepted = null; }, r => { r[0].result.native.observedAt = 1; }]) { const changed = copy(reads); mutate(changed); assert.equal(grant.verifyStartEvidence(args, payload, run, changed), false); }
    assert.equal(grant.verifyStartEvidence(args, { ...payload, code: "batch_start_unknown", ok: false }, run, reads), false);
    assert.equal(grant.verifyStartEvidence(args, { ...payload, nativeQueueCompositionVerified: true }, run, reads), false);
  });
  console.log(JSON.stringify({ status: "passed", groups, proof: "offline private grant/immutable marker checks; zero live AE/AME/GUI" }));
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(() => { assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir())); assert(path.basename(root).startsWith("ae-ame-manual-queue-")); fs.rmSync(root, { recursive: true, force: true }); });
