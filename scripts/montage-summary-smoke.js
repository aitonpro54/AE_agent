"use strict";
const assert = require("node:assert/strict");
const {affectedMontageScenes, summarizeMontagePipeline, SUMMARY_SCHEMA} = require("../mcp-server/montage-pipeline-summary");
const {compileMontagePipeline} = require("../mcp-server/montage-pipeline");
const {deepClone} = require("../mcp-server/montage-contract");
const {sha256, projectId, bindPostRunObservation, freshObservation, observationHash, technicalFacts, recordBinding} = require("../mcp-server/montage-run-bindings");
const {reconcilePlanRun} = require("../mcp-server/plan-run-reconciliation");
const {createValidMontageFixture, createPlanRunRecordFixture, createMontageReadBackFixture, bindMontageReadFixture} = require("./montage-fixture");
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (error) { console.error("FAIL " + name + ": " + error.message); throw error; }
}
function baseline(single = true) {
  const fixture = createValidMontageFixture(), compilation = compileMontagePipeline(fixture);
  assert.equal(compilation.ok, true, "synthetic baseline must compile");
  if (single) { compilation.units = [compilation.units[0]]; compilation.reviewPackets = []; }
  const records = compilation.units.map((unit, i) => createPlanRunRecordFixture({unit,
    runId: i === 0 ? "11111111-1111-4111-8111-111111111111" : "22222222-2222-4222-8222-222222222222"}));
  return {fixture, compilation, runEvidence: records, readBack: createMontageReadBackFixture({compilation, records})};
}
function rebind(state, collection, index = 0) {
  const observation = state.readBack[collection][index], unit = state.compilation.units[index] || state.compilation.units[0];
  const record = state.runEvidence.find(r => r.plan.montagePipeline.unitId === unit.unitId);
  state.readBack[collection][index] = bindMontageReadFixture({record, unit, observation});
}
function summary(state) { return summarizeMontagePipeline({compilation: state.compilation, runEvidence: state.runEvidence, readBack: state.readBack,
  ...(state.reconciliation ? {reconciliation: state.reconciliation} : {}), ...(state.visualReview ? {visualReview: state.visualReview} : {})}); }
function insufficient(state) { const result = summary(state); assert.equal(result.ok, false); assert.equal(result.technicalVerification.status, "insufficient"); return result; }
function affected(fixture, changes) { return affectedMontageScenes({...fixture, changes}); }

test("full execution and independent technical reads pass without artistic acceptance", () => {
  const s = baseline(false), result = summary(s);
  assert.equal(result.schema, SUMMARY_SCHEMA);
  assert.equal(result.ok, true);
  assert.equal(result.execution.status, "completed");
  assert.equal(result.mutation.status, "applied");
  assert.equal(result.technicalVerification.status, "passed");
  assert.equal(result.visualAcceptance.artisticAccepted, false);
  assert.equal(result.nextAction, "review_frames");
  assert.ok(result.units.every(u => u.status === "completed" && !u.replayAllowed && !u.remainingSteps.length));
  assert.ok(result.reviewPackets.every(p => p.canBuild));
});
test("compiler retains full material route and target footprint bindings", () => {
  const s = baseline(), binding = s.compilation.units[0].verificationBindings;
  assert.ok(binding.material.path && binding.material.byteLength && binding.material.sha256);
  assert.ok(binding.route[0].geometry && binding.route[0].footprint && binding.route[0].transform);
  assert.equal(binding.target.footprint.complete, true);
});
for (const collection of ["projects", "targets", "materials", "routes"]) {
  test("missing " + collection + " is insufficient", () => { const s = baseline(); delete s.readBack[collection]; insufficient(s); });
  test("old " + collection + " receipt is insufficient", () => {
    const s = baseline(); s.readBack[collection][0].evidence.observedAt = "2026-10-02T12:00:01.000Z"; insufficient(s);
  });
  test("unbound " + collection + " receipt is insufficient", () => {
    const s = baseline(); s.readBack[collection][0].evidence.runId = "33333333-3333-4333-8333-333333333333"; insufficient(s);
  });
  test("duplicate " + collection + " observation is insufficient", () => {
    const s = baseline(); s.readBack[collection].push(deepClone(s.readBack[collection][0])); insufficient(s);
  });
}
test("timestamp and hash without after-run provenance do not establish freshness", () => {
  const s = baseline(); delete s.readBack.materials[0].evidence.phase; insufficient(s);
});
test("receipt cannot hide changed observation payload", () => {
  const s = baseline(); s.readBack.materials[0].byteLength++; insufficient(s);
});
for (const field of ["path", "sha256", "byteLength", "metadata", "verified"]) {
  test("material missing " + field + " is insufficient", () => {
    const s = baseline(); delete s.readBack.materials[0][field]; rebind(s, "materials"); insufficient(s);
  });
}
for (const field of ["path", "sha256", "byteLength", "metadata"]) {
  test("fresh material " + field + " drift fails", () => {
    const s = baseline(), m = s.readBack.materials[0];
    if (field === "path") m.path = "c:/assets/footage/other.mp4";
    if (field === "sha256") m.sha256 = "f".repeat(64);
    if (field === "byteLength") m.byteLength++;
    if (field === "metadata") m.metadata.duration++;
    rebind(s, "materials");
    assert.equal(summary(s).technicalVerification.status, "failed");
  });
}
for (const field of ["geometry", "footprint", "transform", "inPoint"]) {
  test("missing route " + field + " is insufficient", () => {
    const s = baseline(); delete s.readBack.routes[0].edges[0][field]; rebind(s, "routes"); insufficient(s);
  });
}
for (const field of ["inPoint", "footprint", "transform"]) {
  test("fresh route " + field + " drift fails", () => {
    const s = baseline(), e = s.readBack.routes[0].edges[0];
    if (field === "inPoint") e.inPoint++;
    if (field === "footprint") e.footprint.hasEffects = true;
    if (field === "transform") e.transform.position[0]++;
    rebind(s, "routes");
    assert.equal(summary(s).technicalVerification.status, "failed");
  });
}
test("unobserved expected route transform cannot establish technical pass", () => {
  const s = baseline(); delete s.compilation.units[0].verificationBindings.route[0].transform;
  delete s.readBack.routes[0].edges[0].transform; rebind(s, "routes"); insufficient(s);
});
test("target stable IDs allow presentation index drift", () => {
  const s = baseline(); s.readBack.targets[0].comp.itemIndex = 9; s.readBack.targets[0].layer.index = 5;
  rebind(s, "targets"); assert.equal(summary(s).ok, true);
});
test("target manual transform drift fails", () => {
  const s = baseline(); s.readBack.targets[0].transform.position[0] += 300; rebind(s, "targets");
  assert.equal(summary(s).technicalVerification.status, "failed");
});
test("target source identity drift fails", () => {
  const s = baseline(); s.readBack.targets[0].layer.source.itemId = 999; rebind(s, "targets");
  assert.equal(summary(s).technicalVerification.status, "failed");
});
test("missing target footprint is insufficient", () => {
  const s = baseline(); delete s.readBack.targets[0].footprint; rebind(s, "targets"); insufficient(s);
});
test("fresh project drift fails", () => {
  const s = baseline(); s.readBack.projects[0].file = "c:/projects/other.aep"; rebind(s, "projects");
  const r = summary(s); assert.equal(r.ok, false); assert.ok(r.blockers.some(b => b.code === "project_drift_detected"));
});
for (const key of ["actionId", "proposalRevision", "projectId", "planSha256", "schema"]) {
  test("missing native provenance " + key + " fails closed", () => {
    const s = baseline(); delete s.runEvidence[0].run.provenance[key]; assert.equal(summary(s).ok, false);
  });
}
test("native unobserved revision remains null with its reason", () => {
  const s = baseline(); assert.equal(s.runEvidence[0].run.provenance.projectRevision, null); assert.equal(summary(s).ok, true);
  delete s.runEvidence[0].run.provenance.projectRevisionReason; assert.equal(summary(s).ok, false);
});
test("self-hashed foreign plan with changed guarded args is rejected", () => {
  const s = baseline(), r = s.runEvidence[0]; r.plan.steps[0].args.expectedLayerId = 999;
  r.run.provenance.planSha256 = sha256(r.plan);
  assert.ok(summary(s).blockers.some(b => b.code === "plan_binding_mismatch"));
});
test("wrong provenance plan hash is rejected", () => {
  const s = baseline(); s.runEvidence[0].run.provenance.planSha256 = "b".repeat(64);
  assert.ok(summary(s).blockers.some(b => b.code === "plan_hash_mismatch"));
});
test("executed args are bound exactly", () => {
  const s = baseline(); s.runEvidence[0].run.steps[0].args.expectedLayerId = 999;
  assert.ok(summary(s).blockers.some(b => b.code === "executed_args_binding_mismatch"));
});
test("wrong material revision and wrong project record are rejected", () => {
  const s = baseline(); s.runEvidence[0].plan.montagePipeline.materialRevision++;
  assert.ok(summary(s).blockers.some(b => b.code === "material_revision_mismatch"));
  const t = baseline(); t.runEvidence[0].project.file = "c:/projects/other.aep";
  assert.ok(summary(t).blockers.some(b => b.code === "project_binding_mismatch"));
});
test("strict UUID and inner run ID are required", () => {
  for (const mutate of [r => delete r.runId, r => r.runId = "current", r => delete r.run.id]) {
    const s = baseline(); mutate(s.runEvidence[0]); assert.equal(summary(s).ok, false);
  }
});
test("duplicate run IDs invalidate both units", () => {
  const s = baseline(false); s.runEvidence[1].runId = s.runEvidence[0].runId; s.runEvidence[1].run.id = s.runEvidence[0].runId;
  const r = summary(s); assert.equal(r.ok, false); assert.ok(r.units.every(u => u.status === "failed"));
});
test("duplicate unit records and duplicate executed indices fail closed", () => {
  const s = baseline(); s.runEvidence.push(deepClone(s.runEvidence[0])); assert.equal(summary(s).ok, false);
  const t = baseline(); t.runEvidence[0].run.steps.push(deepClone(t.runEvidence[0].run.steps[0])); assert.equal(summary(t).ok, false);
});
test("unknown unit records cannot authorize a valid unit", () => {
  const s = baseline(); s.runEvidence[0].plan.montagePipeline.unitId = "other_unit";
  assert.equal(summary(s).ok, false); assert.equal(summary(s).units[0].eligibleForProposal, false);
});
test("missing run record is unresolved rather than never run ready", () => {
  const s = baseline(); s.runEvidence = [];
  const r = summary(s); assert.equal(r.ok, false); assert.equal(r.units[0].mutationStatus, "unknown");
  assert.equal(r.units[0].eligibleForProposal, false); assert.deepEqual(r.units[0].remainingSteps, []);
});
test("missing executed step remains unresolved even when desired state is observed", () => {
  const s = baseline(); s.runEvidence[0].run.steps.splice(1, 1);
  const u = summary(s).units[0]; assert.ok(u.unresolvedSteps.includes(2)); assert.ok(!u.remainingSteps.includes(2));
});
test("native applied receipt preserved and explicit undelivered work is descriptive remaining", () => {
  const s = baseline(), unit = s.compilation.units[0];
  s.runEvidence = [createPlanRunRecordFixture({unit, status: "failed", stepOverrides: [
    {status: "completed"}, {status: "failed", error: "timeout", mutationResult: null},
    {status: "not_started", neverSubmitted: true}, {status: "not_started", neverSubmitted: true}
  ]})];
  s.readBack = {};
  const r = summary(s), u = r.units[0];
  assert.equal(r.execution.status, "failed"); assert.equal(u.steps[0].mutationStatus, "applied");
  assert.ok(!u.remainingSteps.includes(1)); assert.ok(!u.remainingSteps.includes(2)); assert.ok(u.unresolvedSteps.includes(2));
  assert.ok(u.remainingSteps.includes(3)); assert.equal(u.replayAllowed, false); assert.equal(u.rebuildRequired, true);
});
test("cancelled label after delivery does not prove not applied", () => {
  const s = baseline(), step = s.runEvidence[0].run.steps[1];
  step.status = "failed"; step.mutationResult = null; step.commands = [{role: "mutation", state: "cancelled", submittedAt: "2026-10-02T12:00:01.000Z"}];
  s.readBack = {}; const u = summary(s).units[0]; assert.ok(u.unresolvedSteps.includes(2)); assert.ok(!u.remainingSteps.includes(2));
});
test("pre-mutation rejection proves not applied", () => {
  const s = baseline(), step = s.runEvidence[0].run.steps[1];
  step.status = "failed"; step.mutationResult = null; step.preMutationRejected = true; s.readBack = {};
  assert.ok(summary(s).units[0].remainingSteps.includes(2));
});
test("dry run never establishes application", () => {
  const s = baseline(); s.runEvidence[0].run.dryRun = true;
  const r = summary(s); assert.equal(r.ok, false); assert.equal(r.execution.status, "not_started"); assert.notEqual(r.mutation.status, "applied");
});
test("fake reconciliation rows never replace fresh independent reads", () => {
  const s = baseline(); s.readBack = {};
  s.reconciliation = {schema: "ae-agent-plan-reconciliation.v1", runId: s.runEvidence[0].runId, sameProject: true, status: "reconciled", steps: [{index: 1, mutationStatus: "applied", verificationStatus: "passed"}], replayAllowed: false};
  const r = summary(s); assert.equal(r.ok, false);
  assert.ok(r.blockers.some(b => b.code === "supplied_reconciliation_conflicts_with_fresh_reads"));
});
test("dependent units blocked but independently checked unexecuted unit may be proposed", () => {
  const s = baseline(false), [a, b] = s.compilation.units;
  b.dependsOn = [a.unitId];
  const independent = deepClone(b); independent.dependsOn = []; independent.unitId = "independent_rev1";
  independent.plan.montagePipeline.unitId = independent.unitId;
  s.compilation.units.push(independent); s.runEvidence = [s.runEvidence[0]]; s.readBack = {};
  const r = summary(s); assert.equal(r.units[1].status, "blocked"); assert.equal(r.units[2].eligibleForProposal, false);
  // Real readiness requires a freshly recompiled baseline and a server ledger proof.
  const t = baseline(false); t.fixture.observations.observedAt = "2026-10-02T12:00:03.000Z";
  t.compilation = compileMontagePipeline(t.fixture);
  t.runEvidence = [createPlanRunRecordFixture({unit: t.compilation.units[0]})];
  t.readBack = createMontageReadBackFixture({compilation: t.compilation, records: t.runEvidence}); t.readBack.baseline = t.fixture;
  const u = t.compilation.units[1];
  t.readBack.unexecutedUnits = [{schema: "ae-agent-montage-never-proposed.v1", unitId: u.unitId, contentHash: u.contentHash,
    planSha256: sha256(u.plan), projectId: projectId(t.compilation.project.projectFile), manifestHash: t.compilation.manifestHash,
    materialsHash: t.compilation.materialsHash, evidenceHash: t.compilation.evidenceHash,
    observedAt: t.fixture.observations.observedAt, phase: "current_baseline", serverConfirmedNeverProposed: true}];
  assert.equal(summary(t).units[1].eligibleForProposal, true);
});
for (const frames of [[], [null], "fake"]) {
  test("malformed or empty visual declarations never accepted " + typeof frames, () => {
    const s = baseline(); s.visualReview = {status: "accepted_sampled_frames", artisticAccepted: true, frames};
    assert.equal(summary(s).visualAcceptance.artisticAccepted, false);
  });
}
test("all required fake PNG declarations still cannot establish artistic acceptance", () => {
  const s = baseline(); s.visualReview = {status: "accepted_sampled_frames", artisticAccepted: true,
    frames: s.compilation.units.flatMap(u => u.frameRequirements.map(f => ({frameId: f.frameId, decision: "safe", sha256: "f".repeat(64), stateHash: u.contentHash})))};
  const r = summary(s); assert.equal(r.ok, true); assert.equal(r.visualAcceptance.artisticAccepted, false);
  assert.equal(r.visualAcceptance.status, "not_established");
});
test("stale PNG is rejected without changing execution history", () => {
  const s = baseline(); s.visualReview = {frames: [{frameId: s.compilation.units[0].frameRequirements[0].frameId, stateHash: "f".repeat(64)}]};
  const r = summary(s); assert.equal(r.visualAcceptance.status, "pending"); assert.equal(r.visualAcceptance.artisticAccepted, false);
  assert.equal(r.execution.status, "completed");
});
test("target change scopes exact scenes and frames", () => {
  const f = createValidMontageFixture(), r = affected(f, [{kind: "target", compItemId: 110, layerId: 21}]);
  assert.equal(r.ok, true); assert.deepEqual(r.affectedScenes, ["scene_1"]); assert.ok(r.affectedFrameIds.length > 0);
});
test("route and material changes propagate to using scenes", () => {
  const f = createValidMontageFixture();
  assert.deepEqual(affected(f, [{kind: "route", compItemId: 100, layerId: 11}]).affectedScenes, ["scene_2"]);
  assert.deepEqual(affected(f, [{kind: "material", materialId: "mat_clip_a"}]).affectedScenes, ["scene_1"]);
});
for (const mutate of [f => f.manifest.dependencies.edges = [],
  f => f.manifest.dependencies.edges.splice(0, 1),
  f => f.manifest.dependencies.edges[0].compItemId = 999,
  f => f.manifest.dependencies.edges[0].sceneIds = ["scene_2"],
  f => f.manifest.dependencies.scope.sourceItemIds = [],
  f => delete f.observations.targets[0].route[0].transform]) {
  test("incomplete or unknown graph forces all baseline scenes", () => {
    const f = createValidMontageFixture(); mutate(f); const r = affected(f, [{kind: "source", sourceItemId: 301}]);
    assert.equal(r.ok, false); assert.equal(r.baselineRequired, true); assert.deepEqual(r.affectedScenes, ["scene_1", "scene_2"]);
    assert.equal(r.affectedFrameIds.length, f.manifest.frameCoverage.length);
  });
}
for (const change of [{kind: "project"}, {kind: "manual"}, {kind: "matte", compItemId: 999, layerId: 999},
  {kind: "route", compItemId: 999, layerId: 999}, {kind: "source", sourceItemId: 999}, {kind: "unknown"},
  {kind: "index_drift", compItemId: 110, layerId: 21}, {kind: "index_drift", compItemId: 110, layerId: 21, contentChanged: true}]) {
  test("unbound change requires baseline " + change.kind, () => {
    const r = affected(createValidMontageFixture(), [change]); assert.equal(r.baselineRequired, true); assert.equal(r.affectedScenes.length, 2);
  });
}
test("index-only exemption requires actual identical stable state and current observation", () => {
  const f = createValidMontageFixture(), after = deepClone(f.observations.targets[0]), before = deepClone(after);
  before.targetLayer.index = 5;
  const change = {kind: "index_drift", compItemId: 110, layerId: 21, before, after};
  assert.equal(affected(f, [change]).baselineRequired, false);
  change.after.transform.scale[0] = 75; assert.equal(affected(f, [change]).baselineRequired, true);
});
test("no native graph facts requires all baseline", () => {
  const f = createValidMontageFixture();
  assert.equal(affectedMontageScenes({manifest: f.manifest, changes: []}).baselineRequired, true);
});
test("malformed null, cycles, accessors, sparse, deep and oversized payloads never throw", () => {
  const cyclic = {}; cyclic.self = cyclic;
  const accessor = {}; Object.defineProperty(accessor, "manifest", {enumerable: true, get() { throw new Error("getter invoked"); }});
  const sparse = {changes: new Array(4)};
  let deep = {}; for (let i = 0; i < 30; i++) deep = {child: deep};
  for (const value of [null, [], {}, cyclic, accessor, sparse, deep, {raw: "x".repeat(4194305)}]) {
    assert.doesNotThrow(() => summarizeMontagePipeline(value)); assert.equal(summarizeMontagePipeline(value).ok, false);
    assert.doesNotThrow(() => affectedMontageScenes(value)); assert.equal(affectedMontageScenes(value).ok, false);
  }
});
test("record unit step frame and graph arrays are bounded before semantic walk", () => {
  for (const mutate of [s => s.runEvidence = new Array(33).fill(s.runEvidence[0]),
    s => s.compilation.units = new Array(33).fill(s.compilation.units[0]),
    s => s.runEvidence[0].run.steps = new Array(51).fill(s.runEvidence[0].run.steps[0]),
    s => s.visualReview = {frames: new Array(769).fill({frameId: "f"})}]) {
    const s = baseline(); mutate(s); assert.equal(summary(s).status, "blocked");
  }
});
test("unit dependency cycles duplicates and missing dependencies fail closed", () => {
  for (const mutate of [c => c.units[0].dependsOn = ["missing"],
    c => c.units[0].dependsOn = [c.units[0].unitId], c => c.units.push(deepClone(c.units[0]))]) {
    const s = baseline(); mutate(s.compilation); assert.equal(summary(s).status, "blocked");
  }
});
test("malformed record command containers fail closed without exception", () => {
  const s = baseline(); s.runEvidence[0].run.steps[0].commands = {};
  assert.doesNotThrow(() => summary(s)); assert.equal(summary(s).ok, false);
});
test("server receipt constructor binds current actual facts and rejects old reads", () => {
  const s = baseline(), unit = s.compilation.units[0], record = s.runEvidence[0], project = s.compilation.project;
  const {evidence, ...observation} = s.readBack.targets[0];
  const args = {record, unit, project, observation, readId: "88888888-8888-4888-8888-888888888888", observedAt: "2026-10-02T12:00:03.000Z"};
  const result = bindPostRunObservation(args);
  assert.equal(result.ok, true); assert.equal(freshObservation(result.observation, record, unit, project), true);
  assert.equal(result.observation.evidence.stateSha256, observationHash(observation));
  args.observedAt = "2026-10-02T12:00:01.000Z"; assert.equal(bindPostRunObservation(args).ok, false);
  assert.equal(bindPostRunObservation(null).ok, false); assert.equal(observationHash(null), null);
});
test("standard reconciliation plus additive M4 montageReadBack metadata is compatible", () => {
  const s = baseline(), record = s.runEvidence[0], unit = s.compilation.units[0], project = s.compilation.project;
  const facts = technicalFacts({readBack: s.readBack, record, unit, project});
  s.reconciliation = {...reconcilePlanRun({record, project: {file: project.projectFile}, freshReadSteps: facts.reads}), montageReadBack: s.readBack};
  assert.equal(summary(s).ok, true);
  s.reconciliation.steps[0].mutationStatus = "not_applied"; assert.equal(summary(s).ok, false);
});
test("missing route geometry fields or footprint flags stays insufficient", () => {
  for (const mutate of [e => delete e.geometry.comp.width, e => delete e.footprint.hasEffects]) {
    const s = baseline(); mutate(s.readBack.routes[0].edges[0]); rebind(s, "routes"); insufficient(s);
  }
});
test("unknown property effect matte parent manual footprint forces baseline even for known target", () => {
  for (const kind of ["property", "effect", "matte", "parent", "manual"]) {
    assert.equal(affected(createValidMontageFixture(), [{kind, compItemId: 110, layerId: 21}]).baselineRequired, true);
  }
});
test("direct binding and read exports reject malformed project unit and observations without throw", () => {
  const s = baseline(), record = s.runEvidence[0], unit = s.compilation.units[0], project = s.compilation.project;
  for (const p of [null, {}, {projectFile: ""}]) {
    assert.doesNotThrow(() => recordBinding(record, unit, p)); assert.ok(recordBinding(record, unit, p));
    assert.equal(bindPostRunObservation({record, unit, project: p, observation: {file: "x"}, readId: "88888888-8888-4888-8888-888888888888", observedAt: "2026-10-02T12:00:03.000Z"}).ok, false);
  }
  assert.ok(recordBinding(record, null, project)); assert.ok(recordBinding(record, {plan: {}}, project));
  assert.equal(freshObservation(null, null, null, null), false);
  assert.equal(technicalFacts(null).target, null);
});
console.log("Montage summary smoke: " + passed + " offline cases passed.");
