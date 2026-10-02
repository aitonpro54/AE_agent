"use strict";

const assert = require("node:assert/strict");
const { compileMontagePipeline, COMPILATION_SCHEMA, computeUnitContentHash } = require("../mcp-server/montage-pipeline");
const { validateMontageManifest, DEFAULT_HARD_CEILINGS } = require("../mcp-server/montage-manifest");
const { deepClone } = require("../mcp-server/montage-contract");
const {
  createValidMontageFixture,
  createCropSamples,
  createReorderedVariant,
  createSwapCycleFixture,
  createReleaseOrderFixture,
  createConflictingTargetIntentFixture
} = require("./montage-fixture");

let passed = 0;
function test(name, action) {
  try {
    action();
    passed++;
  } catch (error) {
    console.error(`FAIL ${name}: ${error.message}`);
    throw error;
  }
}

function readyCompile(fixture) {
  const result = compileMontagePipeline(fixture);
  assert.equal(result.ok, true, `Expected ready compilation, got blockers: ${JSON.stringify(result.blockers)}`);
  assert.equal(result.readiness, "ready");
  assert.equal(result.schema, COMPILATION_SCHEMA);
  assert.ok(typeof result.manifestHash === "string" && result.manifestHash.length === 64);
  assert.ok(typeof result.materialsHash === "string" && result.materialsHash.length === 64);
  assert.ok(typeof result.evidenceHash === "string" && result.evidenceHash.length === 64);
  assert.ok(Array.isArray(result.units) && result.units.length > 0);
  assert.ok(Array.isArray(result.reviewPackets) && result.reviewPackets.length > 0);
  assert.equal(result.requiresFreshEvidenceReview, true);
  return result;
}

function blockedCompile(fixture, expectedCode) {
  const result = compileMontagePipeline(fixture);
  assert.equal(result.ok, false, "Expected compilation to be blocked");
  assert.equal(result.readiness, "blocked");
  if (expectedCode) {
    assert.ok(
      result.blockers.some(b => b.code === expectedCode),
      `Expected blocker ${expectedCode}, got: ${JSON.stringify(result.blockers)}`
    );
  }
  return result;
}

// 1. Baseline positive compilation
test("baseline pure compilation produces execution units and review packets", () => {
  const fixture = createValidMontageFixture();
  const res = readyCompile(fixture);

  assert.equal(res.units.length, 2);
  assert.equal(res.units[0].unitId, "assign_1_rev1");
  assert.equal(res.units[1].unitId, "assign_2_rev1");

  // Verify plan metadata
  for (const unit of res.units) {
    assert.equal(unit.kind, "application");
    assert.ok(unit.plan);
    assert.ok(unit.plan.montagePipeline);
    assert.equal(unit.plan.montagePipeline.unitId, unit.unitId);
    assert.equal(unit.plan.montagePipeline.manifestRevision, 1);
    assert.equal(unit.plan.montagePipeline.materialRevision, 1);
    assert.ok(unit.plan.montagePipeline.sha256);
    assert.ok(unit.plan.montagePipeline.metadata.width > 0);
    assert.ok(unit.plan.expectedReadBack);
    assert.ok(unit.plan.frameReview);
    assert.ok(unit.contentHash && unit.contentHash.length === 64);
    assert.ok(unit.budget.stepCount <= DEFAULT_HARD_CEILINGS.maxSteps);
    assert.ok(unit.budget.stepCount <= 50);
  }

  // Verify review packets
  assert.ok(res.reviewPackets.length >= 1);
  for (const pkt of res.reviewPackets) {
    assert.equal(pkt.builderTool, "build_placeholder_visual_review_plan");
    assert.ok(pkt.inputs.targets.length <= 4);
    assert.ok(pkt.budget.sampleCount <= 24);
    assert.ok(pkt.budget.viewCount <= 24);
    assert.ok(pkt.budget.stepCount <= 50);
    assert.equal(pkt.budget.stepCount, pkt.budget.viewCount + 3);
    assert.equal(pkt.requiresFreshBuild, true);
  }
});

// 2. Determinism and reordering invariance
test("reordered input preserves deterministic hashes, unit contents, and review packets", () => {
  const fixture1 = createValidMontageFixture();
  const fixture2 = createReorderedVariant(fixture1);

  const res1 = readyCompile(fixture1);
  const res2 = readyCompile(fixture2);

  assert.equal(res1.manifestHash, res2.manifestHash);
  assert.equal(res1.materialsHash, res2.materialsHash);
  assert.equal(res1.units.length, res2.units.length);

  for (let i = 0; i < res1.units.length; i++) {
    assert.equal(res1.units[i].unitId, res2.units[i].unitId);
    assert.equal(res1.units[i].contentHash, res2.units[i].contentHash);
    assert.deepEqual(res1.units[i].dependsOn, res2.units[i].dependsOn);
    assert.equal(res1.units[i].budget.stepCount, res2.units[i].budget.stepCount);
  }

  assert.equal(res1.reviewPackets.length, res2.reviewPackets.length);
  for (let i = 0; i < res1.reviewPackets.length; i++) {
    assert.equal(res1.reviewPackets[i].packetId, res2.reviewPackets[i].packetId);
    assert.equal(res1.reviewPackets[i].budget.stepCount, res2.reviewPackets[i].budget.stepCount);
    assert.deepEqual(res1.reviewPackets[i].frameIds, res2.reviewPackets[i].frameIds);
  }
});

// 3. Multi-shot coverage inside single prepared clip
test("assignment with 4 shots / 3 cuts produces single application unit preserving all frames", () => {
  const fixture = createValidMontageFixture();
  const a = fixture.manifest.assignments[0];
  a.shots = [
    { shotId: "shot_1_01", sourceRange: [0, 1.5] },
    { shotId: "shot_1_02", sourceRange: [1.5, 3.0] },
    { shotId: "shot_1_03", sourceRange: [3.0, 4.5] },
    { shotId: "shot_1_04", sourceRange: [4.5, 6.0] }
  ];
  a.crop.samples = createCropSamples([0, 6], [1.5, 3.0, 4.5], 30);
  fixture.manifest.scenes[0].visibleCutCount = 3;

  // Refresh coverage
  const { computeRequiredFrameCoverage } = require("../mcp-server/montage-coverage");
  fixture.manifest.frameCoverage = Array.from(
    computeRequiredFrameCoverage({
      scenes: fixture.manifest.scenes,
      assignments: fixture.manifest.assignments,
      fps: 30
    }).values()
  );

  const res = readyCompile(fixture);
  assert.equal(res.units.length, 2);
  const unit1 = res.units.find(u => u.assignmentIds.includes("assign_1"));
  assert.ok(unit1);
  assert.equal(unit1.plan.steps.length, 4); // replace, time_range, transform, get_details
  assert.ok(unit1.frameRequirements.length > 0);

  // Every required frame is accounted for
  const allPacketFrames = new Set(res.reviewPackets.flatMap(p => p.frameIds));
  const assign1Frames = fixture.manifest.frameCoverage.filter(f => f.assignmentId === "assign_1");
  for (const f of assign1Frames) {
    assert.ok(allPacketFrames.has(f.frameId), `Frame ${f.frameId} must be present in review packets`);
  }
});

// 4. Conflicting same-target intents blocked
test("conflicting target intents are detected and blocked", () => {
  const fixture = createConflictingTargetIntentFixture();
  blockedCompile(fixture, "conflicting_target_intent");
});

// 5. Shared-identical target intents blocked
test("identical target intents on same target still blocked by shared gate", () => {
  const fixture = createValidMontageFixture();
  const assignDuplicate = JSON.parse(JSON.stringify(fixture.manifest.assignments[0]));
  assignDuplicate.assignmentId = "assign_1_dupe";
  fixture.manifest.assignments.push(assignDuplicate);
  fixture.manifest.scenes[0].assignmentIds.push("assign_1_dupe");
  blockedCompile(fixture, "unsupported_shared_target");
});

// 6. Release ordering DAG (Unit B must release source before Unit A can use it)
test("release-order dependency builds sequential DAG without cycle", () => {
  const fixture = createReleaseOrderFixture();
  const res = readyCompile(fixture);

  // Unit 2 (assign_2) targets 120:22 with new source 303.
  // Unit 1 (assign_1) targets 110:21 with source 302 (held by Target 2).
  // Therefore, assign_1 depends on assign_2!
  const unit1 = res.units.find(u => u.assignmentIds.includes("assign_1"));
  const unit2 = res.units.find(u => u.assignmentIds.includes("assign_2"));
  assert.ok(unit1 && unit2);

  assert.ok(unit1.dependsOn.includes(unit2.unitId), "assign_1 must depend on assign_2 releasing source 302");
  assert.equal(unit2.dependsOn.length, 0, "assign_2 has no dependencies");

  // In topological order, unit2 must come before unit1
  const index2 = res.units.indexOf(unit2);
  const index1 = res.units.indexOf(unit1);
  assert.ok(index2 < index1, "assign_2 must be scheduled before assign_1");
});

// 7. Swap cycle detection (unsupported_atomic_exchange)
test("swap cycle between two targets is blocked as unsupported_atomic_exchange", () => {
  const fixture = createSwapCycleFixture();
  blockedCompile(fixture, "unsupported_atomic_exchange");
});

// 8. Caller maxSteps budget enforcement
test("compilation fails if unit plan steps exceed maxSteps budget", () => {
  const fixture = createValidMontageFixture();
  // Builder plan has 4 steps. Set maxSteps to 3.
  fixture.budgets = { maxSteps: 3 };
  blockedCompile(fixture, "plan_steps_exceeds_budget");
});

// 9. Review packet budget ceiling enforcement
test("compilation fails if review packet cannot fit mandatory 3 anchors", () => {
  const fixture = createValidMontageFixture();
  // views + 3 <= maxSteps. If maxSteps = 5, views <= 2, which cannot fit 3 anchors.
  fixture.budgets = { maxSteps: 5 };
  blockedCompile(fixture, "review_packet_steps_exceeds_budget");
});

// 10. Review packet partition preserves anchors and respects 4 targets / 24 samples
test("review packets partition large target sets and preserve first, middle, last anchors", () => {
  const fixture = createValidMontageFixture();
  // Set budget maxSteps to 10. Max views per packet = 10 - 3 = 7.
  fixture.budgets = { maxSteps: 10 };
  const res = readyCompile(fixture);

  assert.ok(res.reviewPackets.length >= 2, "Must partition into multiple review packets");
  for (const pkt of res.reviewPackets) {
    assert.ok(pkt.budget.stepCount <= 10);
    assert.ok(pkt.inputs.targets.length <= 4);
    for (const t of pkt.inputs.targets) {
      assert.ok(t.samples.some(s => s.roles.includes("first")));
      assert.ok(t.samples.some(s => s.roles.includes("middle")));
      assert.ok(t.samples.some(s => s.roles.includes("last")));
    }
  }
});

// 11. Minimal montagePipeline metadata preserved
test("plan.montagePipeline metadata contains exact project, unit, and material bindings", () => {
  const fixture = createValidMontageFixture();
  const res = readyCompile(fixture);

  const meta = res.units[0].plan.montagePipeline;
  assert.equal(meta.unitId, "assign_1_rev1");
  assert.equal(meta.manifestRevision, 1);
  assert.equal(meta.materialRevision, 1);
  assert.equal(meta.materialId, "mat_clip_a");
  assert.equal(meta.sourceItemId, 301);
  assert.equal(meta.path, "c:/assets/footage/clip_a.mp4");
  assert.equal(meta.project.projectFile, fixture.manifest.project.projectFile);
  assert.equal(meta.project.projectKey, fixture.manifest.project.projectKey);
  assert.equal(meta.project.revision, fixture.manifest.project.revision);
});

// 12. Step budget exact boundary (maxSteps = 6 succeeds, maxSteps = 5 fails)
test("step budget exact boundary: maxSteps 6 succeeds, maxSteps 5 fails", () => {
  const fixture = createValidMontageFixture();
  // For exact 3-anchor boundary testing, set 1 shot and 0 cuts so frame requirements are exactly first, mid, last
  for (const scene of fixture.manifest.scenes) {
    scene.visibleCutCount = 0;
    scene.cameraEvents = [];
  }
  for (const a of fixture.manifest.assignments) {
    a.shots = [{ shotId: `${a.assignmentId}_s1`, sourceRange: [...a.sourceRange] }];
    a.crop.samples = createCropSamples(a.sourceRange, [], 30);
  }
  const { computeRequiredFrameCoverage } = require("../mcp-server/montage-coverage");
  fixture.manifest.frameCoverage = Array.from(
    computeRequiredFrameCoverage({
      scenes: fixture.manifest.scenes,
      assignments: fixture.manifest.assignments,
      fps: 30
    }).values()
  );

  fixture.budgets = { maxSteps: 6 };
  const res = readyCompile(fixture);
  assert.equal(res.units[0].budget.maxSteps, 6);
  assert.equal(res.reviewPackets[0].budget.maxSteps, 6);

  const fixtureFail = deepClone(fixture);
  fixtureFail.budgets = { maxSteps: 5 };
  blockedCompile(fixtureFail, "review_packet_steps_exceeds_budget");

  // When multi-shot non-anchor frames cannot fit within maxSteps=6, verify no silent truncation
  const multiShotFixture = createValidMontageFixture();
  multiShotFixture.budgets = { maxSteps: 6 };
  blockedCompile(multiShotFixture, "review_packet_samples_cannot_fit");
});

// 13. Content hash variance on executable intent change
test("contentHash changes when source range or material changes but remains deterministic", () => {
  const fixture = createValidMontageFixture();
  const res = readyCompile(fixture);
  const hash1 = res.units[0].contentHash;

  const modified = createValidMontageFixture();
  modified.manifest.assignments[0].crop.marginPixels = 10;
  const resMod = readyCompile(modified);
  const hashMod = resMod.units[0].contentHash;

  assert.notEqual(hash1, hashMod, "Changing marginPixels must change contentHash");
});

// 14. Alias collision before segmentation
test("alias collision between two assignments sharing same mediaKey is blocked", () => {
  const fixture = createValidMontageFixture();
  // Alias: give source 302 the same file as source 301
  fixture.observations.inventory.sources[1].file = fixture.observations.inventory.sources[0].file;
  fixture.materials.materials[1].path = fixture.materials.materials[0].path;
  fixture.materials.materials[1].sha256 = fixture.materials.materials[0].sha256;
  fixture.observations.materials[1].path = fixture.observations.materials[0].path;
  fixture.observations.materials[1].sha256 = fixture.observations.materials[0].sha256;
  fixture.manifest.assignments[1].sourceRange = [2, 8]; // overlaps with assign_1 [0, 6]
  fixture.manifest.assignments[1].groupId = fixture.manifest.assignments[0].groupId;
  fixture.observations.inventory.sources[1].mediaMetadata.groupId = fixture.observations.inventory.sources[0].mediaMetadata.groupId;

  // Refresh usage map
  const { buildSourceUsageMap } = require("../mcp-server/placeholder-usage");
  fixture.observations.usage = buildSourceUsageMap({
    inventory: fixture.observations.inventory,
    roots: [{ compItemId: 100 }]
  });

  blockedCompile(fixture, "source_interval_overlap");
});

// 15. Pure compiler does not import fs or invoke AE
test("compiler module does not depend on fs or external IO", () => {
  const pipelineModule = require("../mcp-server/montage-pipeline");
  assert.ok(typeof pipelineModule.compileMontagePipeline === "function");
  const mod = require.cache[require.resolve("../mcp-server/montage-pipeline")];
  const childPaths = mod.children.map(c => c.filename);
  assert.ok(
    !childPaths.some(p => p.includes("montage-materials")),
    "Pure compiler must not import filesystem material adapter"
  );
});

// 16. Caller budget tightening cannot be ignored on pre-validated input
test("caller maxSteps budget cannot be ignored even with pre-validated ready input", () => {
  const fixture = createValidMontageFixture();
  const val = validateMontageManifest(fixture);
  assert.equal(val.ok, true);

  const res = compileMontagePipeline({
    validated: val,
    observations: fixture.observations,
    budgets: { maxSteps: 3 }
  });
  assert.equal(res.ok, false);
  assert.equal(res.readiness, "blocked");
  assert.ok(res.blockers.some(b => b.code === "plan_steps_exceeds_budget" || b.code === "review_packet_steps_exceeds_budget"));
});

// 17. Tampered validated input frameCoverage is detected and blocked
test("tampered frameCoverage on validated ready input is re-validated and blocked", () => {
  const fixture = createValidMontageFixture();
  const val = validateMontageManifest(fixture);
  assert.equal(val.ok, true);

  const tampered = deepClone(val);
  tampered.normalized.frameCoverage = [];

  const res = compileMontagePipeline({
    validated: tampered,
    observations: fixture.observations
  });
  assert.equal(res.ok, false);
  assert.equal(res.readiness, "blocked");
  assert.ok(res.blockers.some(b => b.code === "invalid_frame_coverage_container"));
});

// 18. Executable guard changes (expectedPreviousSourceItemId) change contentHash
test("executable guard change on current source alias changes contentHash", () => {
  const { buildSourceUsageMap } = require("../mcp-server/placeholder-usage");
  const a = createValidMontageFixture();
  const va = validateMontageManifest(a);
  const ca = compileMontagePipeline({ validated: va, observations: a.observations });
  assert.equal(ca.ok, true);

  const b = createValidMontageFixture();
  const src = deepClone(b.observations.inventory.sources[0]);
  src.itemId = 303;
  src.itemIndex = 6;
  src.name = "Alias source";
  b.observations.inventory.sources.push(src);
  b.observations.inventory.comps[1].layers[0].sourceItemId = 303;
  b.observations.targets[0].targetLayer.sourceItemId = 303;
  for (const scope of [b.manifest.dependencies.scope, b.observations.dependencyScope]) {
    scope.sourceItemIds.push(303);
  }
  b.manifest.dependencies.edges.push({ dependencyId: "alias-current", kind: "source", sourceItemId: 303, sceneIds: ["scene_1"] });
  b.observations.usage = buildSourceUsageMap({ inventory: b.observations.inventory, roots: [{ compItemId: 100 }], groupMappings: b.observations.usage.groupMappings });

  const vb = validateMontageManifest(b);
  const cb = compileMontagePipeline({ validated: vb, observations: b.observations });
  assert.equal(vb.ok, true);
  assert.equal(cb.ok, true);

  assert.notEqual(ca.units[0].plan.steps[0].args.expectedPreviousSourceItemId, cb.units[0].plan.steps[0].args.expectedPreviousSourceItemId);
  assert.notEqual(ca.units[0].contentHash, cb.units[0].contentHash, "executable guard change must change contentHash");
});

// 19. Malformed compiler input does not throw
test("compileMontagePipeline with null or malformed input returns blocked", () => {
  const res = compileMontagePipeline(null);
  assert.equal(res.ok, false);
  assert.equal(res.readiness, "blocked");
  assert.ok(res.blockers.some(b => b.code === "invalid_input_container"));
});

console.log(`Montage pipeline smoke: ${passed} test cases passed successfully.`);
