"use strict";

// Actual pure modules, synthetic adapter facts; no AE/provider/filesystem media access.
const assert = require("node:assert/strict");
const { validateMontageManifest, normalizeBudgets, DEFAULT_HARD_CEILINGS } = require("../mcp-server/montage-manifest");
const { inspectPayloadSafety, deepClone } = require("../mcp-server/montage-contract");
const { computeRequiredFrameCoverage } = require("../mcp-server/montage-coverage");
const { buildSourceUsageMap } = require("../mcp-server/placeholder-usage");
const { createValidMontageFixture, createCropSamples, createReorderedVariant, createCycleDependencyManifest } = require("./montage-fixture");
let passed = 0;
function test(name, action) {
  try { action(); passed++; }
  catch (error) { console.error(`FAIL ${name}: ${error.message}`); throw error; }
}
function ready(fixture) {
  const result = validateMontageManifest(fixture);
  assert.equal(result.ok, true, JSON.stringify(result.blockers));
  assert.equal(result.readiness, "ready");
  return result;
}
function blocked(fixture, expected) {
  let result;
  assert.doesNotThrow(() => { result = validateMontageManifest(fixture); });
  assert.equal(result.ok, false, "Unknown or malformed facts must never pass");
  assert.equal(result.readiness, "blocked");
  assert.equal(result.normalized, undefined);
  assert.ok(result.blockers.every(b => typeof b.code === "string" && typeof b.path === "string"));
  if (expected) assert.ok(result.blockers.some(b => b.code === expected), JSON.stringify(result.blockers));
  return result;
}
function refresh(fixture) {
  fixture.observations.usage = buildSourceUsageMap({ inventory: fixture.observations.inventory,
    roots: [...new Set(fixture.manifest.scenes.map(s => s.rootCompItemId))].map(compItemId => ({ compItemId })) });
  fixture.manifest.frameCoverage = [...computeRequiredFrameCoverage({ scenes: fixture.manifest.scenes,
    assignments: fixture.manifest.assignments, fps: fixture.manifest.scenes[0].fps }).values()];
  return fixture;
}
function mutate(name, change, code) {
  test(name, () => { const fixture = createValidMontageFixture(); change(fixture); blocked(fixture, code); });
}

test("baseline full native contracts + three shots / two cuts", () => {
  const fixture = createValidMontageFixture(), before = JSON.stringify(fixture), result = ready(fixture);
  assert.equal(JSON.stringify(fixture), before, "pure validator must preserve input");
  assert.equal(result.normalized.assignments[0].shots.length, 3);
  assert.equal(result.normalized.scenes[0].visibleCutCount, 2);
  assert.equal(result.normalized.frameCoverage.filter(f => f.roles.includes("cut_before")).length, 4);
  assert.equal(result.normalized.frameCoverage.filter(f => f.roles.includes("cut_after")).length, 4);
  const last = result.normalized.frameCoverage.find(f => f.sceneId === "scene_1" && f.reasons.includes("scene_end"));
  assert.equal(last.rootFrame, 179, "half-open endpoint must be inside interval");
});
test("four shots / three cuts with the existing builder", () => {
  const fixture = createValidMontageFixture(), assignment = fixture.manifest.assignments[0];
  assignment.shots = [0, 1.5, 3, 4.5].map((start, i) => ({ shotId: `new_shot_${i}`, sourceRange: [start, start + 1.5] }));
  assignment.crop.samples = createCropSamples([0, 6], [1.5, 3, 4.5], 30);
  fixture.manifest.scenes[0].visibleCutCount = 3;
  ready(refresh(fixture));
});
test("deterministic set collections, stable frame IDs, ordered shots", () => {
  const fixture = createValidMontageFixture(), first = ready(fixture), reordered = createReorderedVariant(fixture);
  reordered.observations.inventory.comps.reverse();
  reordered.observations.inventory.sources.reverse();
  reordered.observations.targets.reverse();
  reordered.observations.materials.reverse();
  for (const field of ["entries", "occurrences", "sources", "groupMappings"]) reordered.observations.usage[field].reverse();
  reordered.manifest.dependencies.scope.sourceItemIds.reverse();
  assert.deepEqual(first.normalized, ready(reordered).normalized);
  const shotOrder = first.normalized.assignments[0].shots.map(s => s.shotId);
  assert.deepEqual(shotOrder, fixture.manifest.assignments[0].shots.map(s => s.shotId));
});
test("coherent presentation index drift keeps stable target IDs", () => {
  const fixture = createValidMontageFixture();
  fixture.observations.inventory.comps[1].layers[0].index = 99;
  fixture.observations.targets[0].targetLayer.index = 99;
  fixture.observations.inventory.comps[1].itemIndex = 80;
  ready(fixture);
});
test("recorded timestamps are provenance, not freshness assertions", () => {
  const fixture = createValidMontageFixture();
  fixture.manifest.observedAt = "2020-01-01T00:00:00Z";
  fixture.observations.observedAt = "2020-01-02T00:00:00Z";
  const result = ready(fixture);
  assert.equal(result.normalized.observedAt, "2020-01-01T00:00:00Z");
  assert.equal(result.fresh, undefined);
});
test("two uses of one root frame retain every assignment + shot reason", () => {
  const fixture = createValidMontageFixture();
  fixture.manifest.scenes.pop();
  const scene = fixture.manifest.scenes[0], assignment = fixture.manifest.assignments[1];
  scene.assignmentIds.push(assignment.assignmentId); scene.visibleCutCount = 4;
  assignment.sceneId = scene.sceneId; assignment.rootRange = [0, 6];
  const layer = fixture.observations.inventory.comps[0].layers[1], edge = fixture.observations.targets[1].route[0];
  layer.startTime = layer.inPoint = edge.startTime = edge.inPoint = 0;
  layer.outPoint = edge.outPoint = 6;
  fixture.manifest.dependencies.edges.forEach(e => { e.sceneIds = [scene.sceneId]; });
  const result = ready(refresh(fixture));
  assert.equal(result.normalized.frameCoverage.filter(f => f.rootFrame === 0).length, 2);
  const frame89 = result.normalized.frameCoverage.filter(f => f.rootFrame === 89);
  assert.deepEqual(frame89.map(f => f.assignmentId), ["assign_1", "assign_2"]);
  assert.ok(frame89[0].reasons.includes("shot_interior_shot_1_02"));
  assert.ok(frame89[1].reasons.includes("shot_interior_shot_2_02"));
  fixture.manifest.frameCoverage = fixture.manifest.frameCoverage.filter(f => f.assignmentId !== "assign_2");
  blocked(fixture, "missing_required_coverage_frame");
});

// Original acceptance regressions plus authoritative native bindings.
mutate("missing group mappings", f => { delete f.observations.usage.groupMappings; }, "missing_usage_group_mappings");
mutate("missing full material SHA", f => { delete f.observations.materials[0].sha256; }, "invalid_material_sha256");
mutate("empty dependency edges", f => { f.manifest.dependencies.edges = []; }, "missing_dependency_edge");
mutate("wrong route IDs", f => { f.manifest.assignments[0].routeLayerIds = [999]; }, "route_mismatch");
mutate("missing crop samples", f => { delete f.manifest.assignments[0].crop.samples; }, "missing_crop_samples");
mutate("empty native sources cannot skip builder", f => { f.observations.inventory.sources = []; }, "source_not_in_inventory");
mutate("empty native comps cannot skip builder", f => { f.observations.inventory.comps = []; }, "invalid_root_comp_item_id");
mutate("absent imported source", f => { f.observations.inventory.sources.pop(); }, "source_not_in_inventory");
mutate("native source fps mismatch", f => { f.observations.inventory.sources[0].frameRate = 24; }, "native_material_mismatch");
mutate("native source path mismatch", f => { f.observations.inventory.sources[0].file = "c:/other.mp4"; }, "native_material_mismatch");
mutate("native root route source disagrees with edge", f => { f.observations.inventory.comps[0].layers[0].sourceItemId = 120; }, "route_inventory_mismatch");
mutate("arbitrary protected source field", f => { f.manifest.assignments[0].protectedFields = ["source"]; }, "protected_target_fields");

for (const field of ["type", "hasVideo", "footageMissing", "file", "frameRate", "duration", "width", "height", "pixelAspect", "itemIndex", "name"]) {
  mutate(`unknown native source ${field}`, f => { delete f.observations.inventory.sources[0][field]; });
}
for (const [field, value] of [["type", "comp"], ["hasVideo", false], ["footageMissing", true], ["pixelAspect", 1.2], ["duration", 4]]) {
  mutate(`unsupported native source ${field}`, f => { f.observations.inventory.sources[0][field] = value; });
}
for (const field of ["width", "height", "pixelAspect", "duration", "fps"]) {
  mutate(`observed material metadata ${field} absent`, f => { delete f.observations.materials[0].metadata[field]; }, "material_metadata_mismatch");
  mutate(`observed material metadata ${field} mismatch`, f => { f.observations.materials[0].metadata[field] += 1; }, "material_metadata_mismatch");
}
for (const field of ["id", "index", "name", "sourceItemId", "enabled", "locked", "startTime", "inPoint", "outPoint", "stretch", "timeRemapEnabled"]) {
  mutate(`target/native ${field} binding`, f => { delete f.observations.targets[0].targetLayer[field]; }, "target_inventory_mismatch");
}
for (const field of ["parentCompItemId", "childCompItemId", "layerId", "layerIndex", "startTime", "inPoint", "outPoint", "stretch", "timeRemapEnabled"]) {
  mutate(`route/native ${field} binding`, f => { delete f.observations.targets[0].route[0][field]; });
}
mutate("native index unknown is never defaulted", f => { delete f.observations.inventory.comps[0].itemIndex; }, "invalid_native_identity");
mutate("observed geometry source disagrees with native material", f => { f.observations.targets[0].geometry.source.width = 1280; }, "geometry_inventory_mismatch");
mutate("observed geometry comp disagrees with native comp", f => { f.observations.targets[0].geometry.comp.height = 720; }, "geometry_inventory_mismatch");
mutate("unbound transform anchor", f => { f.observations.targets[0].transform.anchorPoint = [0, 0]; }, "unknown_target_transform");
mutate("manual protection failed", f => { f.observations.targets[0].protection.ok = false; }, "target_protection_violation");
mutate("manual protection unknown", f => { delete f.observations.targets[0].protection.checked; }, "target_protection_violation");
for (const route of [false, true]) for (const field of ["hasTrackMatte", "hasEffects", "hasExpressions", "hasTransformKeys", "complete"]) {
  mutate(`${route ? "route" : "target"} footprint ${field} unknown`, f => {
    const fact = route ? f.observations.targets[0].route[0] : f.observations.targets[0]; delete fact.footprint[field];
  });
  mutate(`${route ? "route" : "target"} footprint ${field} unsupported`, f => {
    const fact = route ? f.observations.targets[0].route[0] : f.observations.targets[0]; fact.footprint[field] = field === "complete" ? false : true;
  });
}
for (const route of [false, true]) for (const [field, value] of [["threeDLayer", true], ["parentLayerId", 99], ["rotation", 10], ["transformStatic", false], ["hasMasks", true], ["collapseTransformation", true]]) {
  mutate(`${route ? "route" : "target"} geometry ${field} unsupported`, f => {
    const fact = route ? f.observations.targets[0].route[0] : f.observations.targets[0]; fact.geometry.layer[field] = value;
  });
  mutate(`${route ? "route" : "target"} geometry ${field} unknown`, f => {
    const fact = route ? f.observations.targets[0].route[0] : f.observations.targets[0]; delete fact.geometry.layer[field];
  });
}
for (const kind of ["comps", "sources", "targets", "materials"]) mutate(`duplicate native/observed ${kind} ID`, f => {
  const array = ["comps", "sources"].includes(kind) ? f.observations.inventory[kind] : f.observations[kind];
  array.push(deepClone(array[0]));
});
mutate("comp/source ID collision", f => { f.observations.inventory.sources[0].itemId = 100; }, "duplicate_native_identity");
mutate("duplicate native layer ID", f => { f.observations.inventory.comps[0].layers.push(deepClone(f.observations.inventory.comps[0].layers[0])); }, "invalid_or_duplicate_native_layer");
test("actual native composition cycle", () => blocked(createCycleDependencyManifest(), "incomplete_native_usage"));
mutate("fabricated usage entries removed", f => { f.observations.usage.entries = []; }, "usage_inventory_mismatch");
mutate("fabricated usage occurrences removed", f => { f.observations.usage.occurrences = []; }, "usage_inventory_mismatch");
mutate("fabricated usage source media key", f => { f.observations.usage.sources[0].mediaKey = "file:c:/other.mp4"; }, "usage_inventory_mismatch");
mutate("wrong usage root scope", f => { f.observations.usage.scope.roots = [{ compItemId: 110 }]; }, "usage_scope_mismatch");
mutate("unconfirmed provenance", f => { f.manifest.groups[0].provenance = "filename_guess"; }, "unconfirmed_group_provenance");
mutate("native group contradicts declared mapping", f => { f.observations.inventory.sources[0].mediaMetadata.groupId = "different_group"; }, "incomplete_native_usage");
mutate("balanced repeats never disable policy", f => { f.manifest.groupPolicy.balancedRepeats = [{ groupId: "grp_performer_a", assignmentIds: ["assign_1", "assign_2"] }]; }, "unsupported_balanced_repeat");
mutate("client distinctGroups waiver", f => { f.manifest.groupPolicy.distinctGroups = false; }, "unsupported_group_policy");
mutate("client overlap waiver", f => { f.manifest.groupPolicy.disallowSourceOverlap = false; }, "unsupported_group_policy");
mutate("same target intents cannot bypass shared-write gate", f => { f.manifest.assignments[1].target = deepClone(f.manifest.assignments[0].target); }, "unsupported_shared_target");
mutate("coherent native aliases preserve overlap blocking", f => {
  const source = f.observations.inventory.sources[1];
  source.file = f.observations.inventory.sources[0].file;
  source.mediaMetadata = deepClone(f.observations.inventory.sources[0].mediaMetadata);
  for (const key of ["path", "sha256", "byteLength"]) {
    f.materials.materials[1][key] = f.materials.materials[0][key];
    f.observations.materials[1][key] = f.observations.materials[0][key];
  }
  f.manifest.assignments[1].groupId = f.manifest.assignments[0].groupId;
  refresh(f);
}, "source_interval_overlap");
mutate("same native path cannot claim different SHA/bytes", f => {
  f.observations.inventory.sources[1].file = f.observations.inventory.sources[0].file;
  f.materials.materials[1].path = f.materials.materials[0].path;
  f.observations.materials[1].path = f.observations.materials[0].path;
}, "alias_material_mismatch");

for (const field of ["rootCompItemIds", "targetKeys", "sourceItemIds"]) {
  mutate(`manifest dependency ${field} incomplete`, f => { f.manifest.dependencies.scope[field] = []; }, "dependency_scope_mismatch");
  mutate(`native dependency ${field} incomplete`, f => { f.observations.dependencyScope[field] = []; }, "dependency_scope_mismatch");
}
mutate("native dependency scope flag unknown", f => { delete f.observations.dependencyScope.complete; }, "dependency_scope_mismatch");
mutate("missing route dependency", f => { f.manifest.dependencies.edges = f.manifest.dependencies.edges.filter(e => e.kind !== "route"); }, "missing_dependency_edge");
mutate("edge scene use binding mismatch", f => { f.manifest.dependencies.edges[0].sceneIds = ["scene_2"]; }, "unbound_dependency_edge");
mutate("dependency ID duplicate", f => { f.manifest.dependencies.edges[1].dependencyId = f.manifest.dependencies.edges[0].dependencyId; }, "invalid_dependency_edge");
mutate("dependency fractional source ID", f => { f.manifest.dependencies.edges[2].sourceItemId = 301.5; }, "invalid_dependency_identity");
mutate("cut count is not shot count", f => { f.manifest.scenes[0].visibleCutCount = 3; }, "cut_count_mismatch");
mutate("noncontiguous shots", f => { f.manifest.assignments[0].shots[1].sourceRange[0] = 2.5; }, "non_contiguous_shots");
mutate("shot order cannot be normalized into validity", f => { f.manifest.assignments[0].shots.reverse(); }, "non_contiguous_shots");
mutate("off-frame boundary", f => { f.manifest.assignments[0].shots[0].sourceRange[1] += 0.001; }, "invalid_frame_range");
mutate("missing crop boundary observation", f => { f.manifest.assignments[0].crop.samples = f.manifest.assignments[0].crop.samples.filter(s => s.sourceTime !== 2); }, "placeholder_plan_failed");
mutate("source sample outside interval", f => { f.manifest.assignments[0].crop.samples[0].sourceTime = 10; }, "invalid_crop_sample");
mutate("coverage missing mandatory frame", f => { f.manifest.frameCoverage.shift(); }, "missing_required_coverage_frame");
mutate("coverage missing per-shot reason", f => { const frame = f.manifest.frameCoverage.find(frame => frame.reasons.some(r => r.startsWith("shot_interior"))); frame.reasons = ["crop_sample"]; }, "missing_coverage_reason");
mutate("coverage target spoof", f => { f.manifest.frameCoverage[0].compItemId = 120; }, "unbound_frame_coverage");
mutate("duplicate frame ID with different identity", f => { f.manifest.frameCoverage[1].frameId = f.manifest.frameCoverage[0].frameId; }, "duplicate_frame_id");
mutate("coverage endpoint outside half-open range", f => { const frame = f.manifest.frameCoverage[0]; frame.rootTime = 6; frame.rootFrame = 180; }, "unbound_frame_coverage");
mutate("ambiguous duplicate same frame", f => { const frame = deepClone(f.manifest.frameCoverage[0]); frame.frameId = "another_frame_id"; f.manifest.frameCoverage.push(frame); }, "ambiguous_frame_identity");

// Pre-traversal ceilings and byte-exact boundaries. Every configurable ceiling is tested.
for (const [key, ceiling] of Object.entries(DEFAULT_HARD_CEILINGS)) test(`budget ${key} hard boundary/+1`, () => {
  assert.equal(normalizeBudgets({ [key]: ceiling }).blockers.length, 0);
  assert.ok(normalizeBudgets({ [key]: ceiling + 1 }).blockers.some(b => b.code === "budget_exceeds_hard_ceiling"));
});
const baseline = createValidMontageFixture();
const minima = { scenes: 2, assignments: 2, materials: 2, groups: 2, routeDepth: 1, shotsPerAssignment: 3,
  frameCoverage: baseline.manifest.frameCoverage.length, dependencyEdges: 6, graphNodes: 9, maxSteps: 4,
  materialReadRequests: 2, materialFileBytes: 12582912, materialTotalBytes: 23068672,
  manifestBytes: Buffer.byteLength(JSON.stringify(baseline.manifest)), materialsBytes: Buffer.byteLength(JSON.stringify(baseline.materials)),
  snapshotBytes: Buffer.byteLength(JSON.stringify(baseline.observations)) };
for (const [key, minimum] of Object.entries(minima)) test(`effective ${key} at boundary/one over`, () => {
  const fixture = createValidMontageFixture(); fixture.budgets = { [key]: minimum }; ready(fixture);
  fixture.budgets[key]--; blocked(fixture);
});
test("UTF-8 payload accounting equals JSON bytes incl escapes", () => {
  const payload = { русское: ["🌷", "\\\"\n", false, 0, null] };
  const bytes = Buffer.byteLength(JSON.stringify(payload));
  assert.equal(inspectPayloadSafety(payload, bytes).totalBytes, bytes);
  assert.equal(inspectPayloadSafety(payload, bytes).exceeded, false);
  assert.equal(inspectPayloadSafety(payload, bytes - 1).exceeded, true);
});
mutate("JSON cycle safely rejected before helpers", f => { f.manifest.self = f.manifest; }, "unsafe_input_payload");
mutate("deep JSON safely rejected before helpers", f => { let node = f.manifest; for (let i = 0; i < 40; i++) node = node.deep = {}; }, "unsafe_input_payload");
test("accessors do not execute during validation", () => {
  let calls = 0; const fixture = createValidMontageFixture();
  Object.defineProperty(fixture.manifest, "evil", { enumerable: true, get() { calls++; throw new Error("unexpected"); } });
  blocked(fixture, "unsafe_input_payload"); assert.equal(calls, 0);
});
test("non-enumerable mandatory accessor cannot bypass preflight", () => {
  let calls = 0; const fixture = createValidMontageFixture();
  Object.defineProperty(fixture.observations.inventory.sources[0], "frameRate", { enumerable: false,
    get() { calls++; throw new Error("unexpected"); } });
  blocked(fixture, "unsafe_input_payload"); assert.equal(calls, 0);
});
for (const value of [null, 42, "manifest", [], undefined]) test(`malformed envelope ${typeof value}`, () => blocked(value));
for (const field of ["schema", "revision", "observedAt", "project", "scenes", "assignments", "groups", "dependencies", "frameCoverage"]) {
  mutate(`manifest mandatory ${field}`, f => { delete f.manifest[field]; });
}
for (const field of ["entries", "occurrences", "sources", "groupMappings", "scope"]) mutate(`malformed usage ${field}`, f => { f.observations.usage[field] = 42; });
mutate("unknown manifest key", f => { f.manifest.executeAll = true; }, "unknown_manifest_field");
mutate("unknown shot key", f => { f.manifest.assignments[0].shots[0].artisticScore = 10; }, "unknown_shot_field");
mutate("unknown material provenance key", f => { f.materials.materials[0].provenance.untrusted = true; }, "unknown_material_field");
mutate("unknown source metadata key", f => { f.observations.materials[0].metadata.untrusted = true; }, "unknown_observation_field");
for (const [collection, identity] of [["scenes", "sceneId"], ["assignments", "assignmentId"], ["groups", "groupId"]]) {
  mutate(`duplicate ${identity}`, f => { f.manifest[collection][1][identity] = f.manifest[collection][0][identity]; });
  mutate(`unsafe ${identity}`, f => { f.manifest[collection][0][identity] = "../unsafe"; });
}
mutate("global duplicate shot ID", f => { f.manifest.assignments[1].shots[0].shotId = "shot_1_01"; }, "duplicate_shot_id");
mutate("prepared duplicate material ID", f => { f.materials.materials[1].materialId = f.materials.materials[0].materialId; });
mutate("project revision mismatch", f => { f.observations.project.revision++; }, "project_mismatch");
mutate("non-video prepared provenance", f => { f.materials.materials[0].provenance.kind = "unreviewed_original"; }, "invalid_material_provenance");

console.log(`Montage manifest: ${passed} actual-module offline cases passed.`);
