"use strict";

const assert = require("node:assert/strict");
const timingHelper = require("../mcp-server/placeholder-timing");
const { buildPlaceholderPlan } = require("../mcp-server/placeholder-plan-builder");
const { buildSourceUsageMap,checkPlaceholderAssignments } = require("../mcp-server/placeholder-usage");
const {validateMontageManifest}=require("../mcp-server/montage-manifest");
const {compileMontagePipeline}=require("../mcp-server/montage-pipeline");
const {computeRequiredFrameCoverage}=require("../mcp-server/montage-coverage");
const {verifyPlaceholderReadBack}=require("../mcp-server/placeholder-readback");
const {createValidMontageFixture,createCropSamples}=require("./montage-fixture");
const {deepClone}=require("../mcp-server/montage-contract");
const { validateSnapshot, compareSnapshot, snapshotFromEvidence } = require("../mcp-server/placeholder-protection");
const { proposePlaceholderCover } = require("../mcp-server/placeholder-framing");
const { assertUnitChain } = require("../mcp-server/montage-plan-guard");
const {
  validateRootCaptureBinding,
  CAPTURE_BINDING_BLOCKER,
  ROOT_FRESHNESS_BLOCKED
} = require("../mcp-server/montage-root-png");

let totalTests = 0;
let passedTests = 0;

function run(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`[PASS] ${name}`);
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log("=== Running montage-affine-smoke.js ===");

// 1. Pure timing domain and math checks
run("placeholder-timing: domain validation and scaling factors", () => {
  for (const s of [25, 50, 100, 125, 200, 300, 400]) {
    assert.equal(timingHelper.isValidStretch(s), true, `Stretch ${s} should be valid`);
  }
  for (const s of [24, 24.9, 401, 0, -50, -100, NaN, null, undefined, "100", Infinity]) {
    assert.equal(timingHelper.isValidStretch(s), false, `Stretch ${s} should be invalid`);
  }

  assert.equal(timingHelper.stretchFactor(200), 2.0);
  assert.equal(timingHelper.stretchFactor(50), 0.5);
  assert.equal(timingHelper.stretchFactor(100), 1.0);
  assert.equal(timingHelper.stretchFactor(125), 1.25);
});

run("placeholder-timing: target and source time mapping", () => {
  // k = 2.0 (stretch 200), startTime = 1.0, targetTime = 3.0 -> sourceTime = 1.0
  assert.equal(timingHelper.sourceAtTarget(1.0, 3.0, 200), 1.0);
  assert.equal(timingHelper.targetAtSource(1.0, 1.0, 200), 3.0);

  // k = 0.5 (stretch 50), startTime = 1.0, targetTime = 2.0 -> sourceTime = 2.0
  assert.equal(timingHelper.sourceAtTarget(1.0, 2.0, 50), 2.0);
  assert.equal(timingHelper.targetAtSource(1.0, 2.0, 50), 2.0);
});

run("placeholder-timing: desired startTime and root mapping", () => {
  // localIn = 1.0, sourceIn = 0.5, stretch 200 (k = 2.0) -> desired startTime = 0.0
  assert.equal(timingHelper.desiredStartTime(1.0, 0.5, 200), 0.0);

  // root mapping: rootIn = 0.0, sourceIn = 0.0, stretch 200
  assert.equal(timingHelper.rootAtSource(0.0, 0.0, 1.5, 200), 3.0);
  assert.equal(timingHelper.sourceAtRoot(0.0, 0.0, 3.0, 200), 1.5);
});

run("placeholder-timing: requiredMappedSamples generates fractional source times on root anchors", () => {
  const samples = timingHelper.requiredMappedSamples([0.0, 6.0], 0.0, 200, 30);

  assert.equal(samples.length, 3);
  const first = samples.find(s => s.roles.includes("first"));
  const last = samples.find(s => s.roles.includes("last"));
  assert.ok(first);
  assert.ok(last);

  assert.equal(first.rootTime, 0.0);
  assert.equal(first.sourceTime, 0.0);

  // At stretch 200, root frame 179 at 30fps is rootTime = 179/30 = 5.966667
  // Mapped sourceTime = 5.966667 / 2 = 2.983333 (legal fractional mapped sample)
  assert.equal(Math.abs(last.rootTime - (179 / 30)) < 1e-4, true);
  assert.equal(Math.abs(last.sourceTime - (179 / 60)) < 1e-4, true);
});

run("placeholder-timing: isCutRootAligned detects off-grid cuts", () => {
  // cut at sourceTime = 1.0 -> rootTime = 2.0s -> frame 60 (aligned)
  assert.equal(timingHelper.isCutRootAligned(0.0, 0.0, 1.0, 200, 30), true);

  // cut at sourceTime = 0.01s -> rootTime = 0.02s -> frame 0.6 (off grid)
  assert.equal(timingHelper.isCutRootAligned(0.0, 0.0, 0.01, 200, 30), false);
});

// 2. Plan builder with affine stretch
run("placeholder-plan-builder: supports target stretch 200 and preserves stretch", () => {
  const planInput = {
    rootComp: { itemId: 10, itemIndex: 1, name: "Master", duration: 12, frameRate: 30 },
    targetComp: { itemId: 20, itemIndex: 2, name: "Scene1", duration: 12, frameRate: 30 },
    route: [{ parentCompItemId: 10, childCompItemId: 20, layerId: 100, layerIndex: 1, startTime: 0, inPoint: 0, outPoint: 6, stretch: 100, timeRemapEnabled: false }],
    targetLayer: { id: 200, index: 1, name: "TargetLayer", sourceItemId: 50, locked: false, startTime: 0, inPoint: 0, outPoint: 6, stretch: 200, timeRemapEnabled: false },
    sourceItem: { itemId: 300, itemIndex: 5, name: "NewClip.mp4", type: "footage", duration: 10, frameRate: 30 },
    rootRange: [0, 6],
    sourceRange: [0, 3] // k = 2.0, 3.0s * 2.0 = 6.0s
  };

  const built = buildPlaceholderPlan(planInput);
  assert.equal(built.ok, true, built.error || built.code);
  assert.ok(built.plan);
  assert.equal(built.expectedReadBack.stretch, 200);

  const timeStep = built.plan.steps.find(s => s.tool === "set_layer_time_range");
  assert.ok(timeStep);
  assert.equal(timeStep.args.outPoint - timeStep.args.inPoint, 6.0);
  assert.equal(timeStep.args.startTime, 0.0);
});

run("placeholder-plan-builder: rejects out of domain stretch or off-grid affine start", () => {
  const baseInput = {
    rootComp: { itemId: 10, itemIndex: 1, name: "Master", duration: 12, frameRate: 30 },
    targetComp: { itemId: 20, itemIndex: 2, name: "Scene1", duration: 12, frameRate: 30 },
    route: [{ parentCompItemId: 10, childCompItemId: 20, layerId: 100, layerIndex: 1, startTime: 0, inPoint: 0, outPoint: 6, stretch: 100, timeRemapEnabled: false }],
    targetLayer: { id: 200, index: 1, name: "TargetLayer", sourceItemId: 50, locked: false, startTime: 0, inPoint: 0, outPoint: 6, stretch: 200, timeRemapEnabled: false },
    sourceItem: { itemId: 300, itemIndex: 5, name: "NewClip.mp4", type: "footage", duration: 10, frameRate: 30 },
    rootRange: [0, 6],
    sourceRange: [0, 3]
  };

  // Stretch 500 (out of domain)
  const outDomain = buildPlaceholderPlan({
    ...baseInput,
    targetLayer: { ...baseInput.targetLayer, stretch: 500 }
  });
  assert.equal(outDomain.ok, false);
  assert.equal(outDomain.code, "unsupported_target_layer");

  // Route comp with stretch !== 100
  const routeStretch = buildPlaceholderPlan({
    ...baseInput,
    route: [{ ...baseInput.route[0], stretch: 120 }]
  });
  assert.equal(routeStretch.ok, false);
  assert.equal(routeStretch.code, "unsupported_or_stale_route");
});

// 3. Usage map with affine stretch
run("placeholder-usage: scales root and source intervals by stretch factor k", () => {
  const inventory = {
    complete: true,
    comps: [
      {
        itemId: 10,
        name: "Root",
        duration: 10.0,
        frameRate: 30,
        layers: [
          {
            id: 1,
            index: 1,
            name: "StretchedFootage",
            enabled: true,
            sourceItemId: 30,
            startTime: 0.0,
            inPoint: 0.0,
            outPoint: 6.0,
            stretch: 200,
            timeRemapEnabled: false
          }
        ]
      }
    ],
    sources: [
      { itemId: 30, type: "footage", file: "C:/Media/clip.mp4", duration: 10.0, width: 1920, height: 1080, frameRate: 30 }
    ]
  };

  const usage = buildSourceUsageMap({ inventory, roots: [{ compItemId: 10 }] });
  assert.equal(usage.ok, true);
  assert.equal(usage.entries.length, 1);
  const entry = usage.entries[0];

  assert.deepEqual(entry.sourceRange, [0.0, 3.0]);
  assert.deepEqual(entry.rootRange, [0.0, 6.0]);
});

run("placeholder-usage: precomp with stretch !== 100 is rejected", () => {
  const inventory = {
    complete: true,
    comps: [
      {
        itemId: 10,
        name: "Root",
        duration: 10.0,
        frameRate: 30,
        layers: [
          { id: 1, index: 1, name: "StretchedPrecomp", enabled: true, sourceItemId: 20, startTime: 0, inPoint: 0, outPoint: 5, stretch: 200, timeRemapEnabled: false }
        ]
      },
      {
        itemId: 20,
        name: "ChildComp",
        duration: 10.0,
        frameRate: 30,
        layers: [
          { id: 2, index: 1, name: "Footage", enabled: true, sourceItemId: 30, startTime: 0, inPoint: 0, outPoint: 5, stretch: 100, timeRemapEnabled: false }
        ]
      }
    ],
    sources: [
      { itemId: 30, type: "footage", file: "C:/Media/clip.mp4", duration: 10.0, width: 1920, height: 1080, frameRate: 30 }
    ]
  };

  const usage = buildSourceUsageMap({ inventory, roots: [{ compItemId: 10 }] });
  assert.equal(usage.ok, false);
  assert.ok(usage.unsupported.some(u => u.reason === "unsupported_stretch"));
});

// 4. Protection and drift
run("placeholder-protection: accepts valid stretch in target snapshot but rejects in dependencies", () => {
  const inventory = {
    complete: true,
    comps: [
      { itemId: 10, name: "RootComp", layers: [{ id: 1, stretch: 200, sourceItemId: 30, startTime: 0, inPoint: 0, outPoint: 6, timeRemapEnabled: false, enabled: true }] }
    ],
    sources: [
      { itemId: 30, file: "C:/Media/clip.mp4", duration: 10, footageMissing: false }
    ]
  };
  const evidence = {
    comp: { itemId: 10 },
    layer: { id: 1, source: { itemId: 30, file: "C:/Media/clip.mp4", footageMissing: false }, startTime: 0, inPoint: 0, outPoint: 6, stretch: 200, timeRemapEnabled: false, enabled: true },
    transform: { anchorPoint: [960, 540], position: [960, 540], scale: [100, 100], rotation: 0, opacity: 100 },
    properties: [],
    unsupported: []
  };

  const snapshot = snapshotFromEvidence(evidence, inventory);
  assert.equal(snapshot.timing.stretch, 200);
  assert.doesNotThrow(() => validateSnapshot(snapshot));

  // Out of domain stretch 500
  const invalidStretch = { ...snapshot, timing: { ...snapshot.timing, stretch: 500 } };
  assert.throws(() => validateSnapshot(invalidStretch), /unsupported_accepted_timing/);

  // Dependency edge with stretch !== 100
  const invalidDep = {
    ...snapshot,
    dependencies: [
      { compItemId: 10, layerId: 5, sourceItemId: 30, startTime: 0, inPoint: 0, outPoint: 6, stretch: 200, timeRemapEnabled: false, enabled: true }
    ]
  };
  assert.throws(() => validateSnapshot(invalidDep), /invalid_accepted_dependency/);
});

run("placeholder-protection: compareSnapshot detects stretch drift", () => {
  const inventory = {
    complete: true,
    comps: [
      { itemId: 10, name: "RootComp", layers: [{ id: 1, stretch: 200, sourceItemId: 30, startTime: 0, inPoint: 0, outPoint: 6, timeRemapEnabled: false, enabled: true }] }
    ],
    sources: [
      { itemId: 30, file: "C:/Media/clip.mp4", duration: 10, footageMissing: false }
    ]
  };
  const evidence = {
    comp: { itemId: 10 },
    layer: { id: 1, source: { itemId: 30, file: "C:/Media/clip.mp4", footageMissing: false }, startTime: 0, inPoint: 0, outPoint: 6, stretch: 200, timeRemapEnabled: false, enabled: true },
    transform: { anchorPoint: [960, 540], position: [960, 540], scale: [100, 100], rotation: 0, opacity: 100 },
    properties: [],
    unsupported: []
  };

  const snapshot = snapshotFromEvidence(evidence, inventory);
  const matchResult = compareSnapshot(snapshot, evidence, inventory);
  assert.equal(matchResult.ok, true);

  // Drifted stretch (e.g. changed to 100)
  const driftedEvidence = {
    ...evidence,
    layer: { ...evidence.layer, stretch: 100 }
  };
  const driftResult = compareSnapshot(snapshot, driftedEvidence, inventory);
  assert.equal(driftResult.ok, false);
  assert.equal(driftResult.code, "accepted_placeholder_drift");
  assert.ok(driftResult.changes.includes("timing.stretch"));
});

// 5. Framing and cover proposal
run("placeholder-framing: proposePlaceholderCover derives mapped root anchors for stretch 200", () => {
  const mappedTimes = [0.0, 89/60, 179/60];
  const samples = mappedTimes.map((t, idx) => ({
    sourceTime: t,
    coordinateSpace: "source_pixels",
    imageRef: `ref_${idx}`,
    imageSha256: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
    observation: "clean",
    noSignificantSubjects: true
  }));

  const result = proposePlaceholderCover({
    target: { compItemId: 10, layerId: 1, sourceItemId: 30 },
    sourceRange: [0.0, 3.0],
    samples,
    geometry: {
      comp: { width: 1920, height: 1080, pixelAspect: 1, frameRate: 30 },
      source: { width: 1920, height: 1080, pixelAspect: 1, duration: 10, frameRate: 30 },
      layer: {
        anchorPoint: [960, 540],
        position: [960, 540],
        scale: [100, 100],
        rotation: 0,
        threeDLayer: false,
        parentLayerId: null,
        collapseTransformation: false,
        hasMasks: false,
        transformStatic: true
      }
    },
    timing: {
      stretch: 200,
      sourceRange: [0.0, 3.0],
      rootRange: [0.0, 6.0],
      localRange:[0,6],targetStartTime:0,rootFps:30
    }
  });

  assert.equal(result.status, "proposed");
  assert.equal(result.eligible, true);
  assert.ok(result.proposal);
  assert.deepEqual(result.proposal.scale, [100, 100]);

  // Off-grid interior cut boundary is rejected
  const offGridCut = proposePlaceholderCover({
    target: { compItemId: 10, layerId: 1, sourceItemId: 30 },
    sourceRange: [0.0, 3.0],
    shotBoundaries: [0.01], // 0.01s * 2.0 = 0.02s (frame 0.6 off root grid)
    samples,
    geometry: {
      comp: { width: 1920, height: 1080, pixelAspect: 1, frameRate: 30 },
      source: { width: 1920, height: 1080, pixelAspect: 1, duration: 10, frameRate: 30 },
      layer: {
        anchorPoint: [960, 540],
        position: [960, 540],
        scale: [100, 100],
        rotation: 0,
        threeDLayer: false,
        parentLayerId: null,
        collapseTransformation: false,
        hasMasks: false,
        transformStatic: true
      }
    },
    timing: {
      stretch: 200,
      sourceRange: [0.0, 3.0],
      rootRange: [0.0, 6.0],
      localRange:[0,6],targetStartTime:0,rootFps:30
    }
  });
  assert.equal(offGridCut.status, "ineligible");
  assert.ok(offGridCut.reasons.includes("unsupported_affine_cut_grid"));
});

// 6. Unit chain assertion in montage plan guard
run("montage-plan-guard: assertUnitChain verifies preserved stretch 200", () => {
  const plan = {
    expectedReadBack: {
      compItemId: 10,
      layerId: 1,
      sourceItemId: 30,
      sourceName: "clip_a.mp4",
      sourceFile: "C:/Media/clip_a.mp4",
      layerName: "Placeholder 1",
      startTime: 0,
      inPoint: 0,
      outPoint: 6,
      stretch: 200,
      rootRange: [0, 6],
      sourceRange: [0, 3]
    },
    steps: [
      { tool: "replace_layer_source", args: { expectedCompItemId: 10, expectedLayerId: 1, expectedPreviousSourceItemId: 50, expectedSourceItemId: 30, sourceItemName: "clip_a.mp4", sourceItemType: "footage" } },
      { tool: "set_layer_time_range", args: { expectedCompItemId: 10, expectedLayerId: 1, startTime: 0, inPoint: 0, outPoint: 6, expectedSourceItemId: 30 } },
      { tool: "get_layer_details", args: { compItemId: 10, layerId: 1, responseView: "placeholder" } }
    ]
  };

  const mp = {
    sourceItemId: 30,
    path: "C:/Media/clip_a.mp4",
    intent: {
      assignment: { target: { compItemId: 10, layerId: 1 }, sourceRange: [0, 3] },
      rootRange: [0, 6]
    },
    verificationBindings: {
      target: {
        compItemId: 10,
        layerId: 1,
        layer: { name: "Placeholder 1", sourceItemId: 50, stretch: 200, startTime: 0, inPoint: 0, outPoint: 6, timeRemapEnabled: false }
      },
      materialSource: { name: "clip_a.mp4" },
      route: [{ stretch: 100, startTime: 0, inPoint: 0, outPoint: 6, timeRemapEnabled: false }]
    }
  };

  assert.doesNotThrow(() => {
    assertUnitChain(plan, mp);
  });

  // Mismatched expectedReadBack stretch
  const badPlan = {
    ...plan,
    expectedReadBack: { ...plan.expectedReadBack, stretch: 100 }
  };
  assert.throws(() => {
    assertUnitChain(badPlan, mp);
  }, /montage_unit_chain_invalid/);
});

// 7. Root frame binding and freshness blocked
run("montage-root-png: declarations cannot create a missing canonical native capture binding", () => {
  for(const declaration of [undefined,{}, {completeRootRenderState:true}, {owner:"caller",preStateSha256:"a".repeat(64),postStateSha256:"a".repeat(64),observedBefore:new Date().toISOString(),observedAfter:new Date().toISOString()}]) {
    assert.deepEqual(validateRootCaptureBinding(declaration),{ok:false,reason:CAPTURE_BINDING_BLOCKER});
  }
  assert.equal(require("../mcp-server/montage-root-png").computeScopedStateHash,undefined);
  assert.equal(require("../mcp-server/montage-root-png").createRootCaptureBinding,undefined);
});

function affineFixture(stretch) {
  const f=createValidMontageFixture(),a=f.manifest.assignments[0],o=f.observations.targets[0],k=stretch/100;
  f.observations.inventory.comps[1].layers[0].stretch=stretch;o.targetLayer.stretch=stretch;
  f.materials.materials[0].duration=f.observations.inventory.sources[0].duration=o.geometry.source.duration=f.observations.materials[0].metadata.duration=20;
  a.sourceRange=[0,6/k];a.shots.forEach((shot,i)=>{shot.sourceRange=[i*2/k,(i+1)*2/k];});
  a.crop.samples=createCropSamples(a.sourceRange,[2/k,4/k],30,{stretch,rootRange:a.rootRange});
  f.observations.usage=buildSourceUsageMap({inventory:f.observations.inventory,roots:[{compItemId:100}]});
  f.manifest.frameCoverage=[...computeRequiredFrameCoverage({scenes:f.manifest.scenes,assignments:f.manifest.assignments,fps:30,
    timingByAssignment:new Map([["assign_1",{stretch}],["assign_2",{stretch:100}]])}).values()].map(r=>({...r,roles:[...r.roles],reasons:[...r.reasons]}));
  return f;
}
for(const stretch of [50,100,125,200])run(`actual manifest/compiler/coverage/framing/root packets at ${stretch}`,()=>{
  const f=affineFixture(stretch),valid=validateMontageManifest(f);assert.equal(valid.ok,true,JSON.stringify(valid.blockers));
  const c=compileMontagePipeline(f);assert.equal(c.ok,true,JSON.stringify(c.blockers));const u=c.units.find(u=>u.assignmentIds.includes("assign_1"));
  assert.equal(u.expectedReadBack.stretch,stretch);assert.equal(u.expectedReadBack.outPoint-u.expectedReadBack.inPoint,6);
  const last=u.plan.frameReview.at(-1);assert(Math.abs(last.sourceTime-179/30/(stretch/100))<1e-12);
  const requested=c.rootPngPackets.flatMap(p=>p.frameIds);assert(f.manifest.frameCoverage.every(frame=>requested.includes(frame.frameId)));
  assert(c.rootPngPackets.every(p=>p.inputs.targets.every(t=>t.viewKinds.length===1 && t.viewKinds[0]==="root_comp") && p.frames.length<=24 && p.artisticAccepted===false && p.reuseAllowed===false));
});
for(const [name,mutate] of [
  ["missing stretch",f=>{delete f.observations.targets[0].targetLayer.stretch;delete f.observations.inventory.comps[1].layers[0].stretch;}],
  ["off root grid",f=>{f.manifest.assignments[0].rootRange[0]=0.01;}],
  ["off source grid",f=>{f.manifest.assignments[0].sourceRange[0]=0.01;}],
  ["cut mapped off root grid",f=>{f.manifest.assignments[0].shots[0].sourceRange[1]=1/30;f.manifest.assignments[0].shots[1].sourceRange[0]=1/30;}],
  ["unknown remap",f=>{delete f.observations.targets[0].targetLayer.timeRemapEnabled;delete f.observations.inventory.comps[1].layers[0].timeRemapEnabled;}],
  ["missing metadata",f=>{delete f.observations.inventory.sources[0].duration;}],
  ["unbound affine usage",f=>{const l=deepClone(f.observations.inventory.comps[1].layers[0]);l.id=999;l.index=2;f.observations.inventory.comps[1].layers.push(l);}],
  ["shared precomp occurrence",f=>{const l=deepClone(f.observations.inventory.comps[0].layers[0]);l.id=999;l.index=3;f.observations.inventory.comps[0].layers.push(l);}]
])run(`actual affine manifest rejects ${name}`,()=>{const f=affineFixture(125);mutate(f);f.observations.usage=buildSourceUsageMap({inventory:f.observations.inventory,roots:[{compItemId:100}]});assert.equal(validateMontageManifest(f).ok,false);});
run("strict cut and start grids do not accept quarter-frame drift",()=>{
  assert.equal(timingHelper.isCutRootAligned(0,0,1/30,125,30),false);
  assert.equal(timingHelper.isGridAligned(0.001,30),false);assert.equal(timingHelper.isGridAligned(0.001,30,0.25),false);
  const f=affineFixture(125);f.manifest.assignments[0].sourceRange=[1/30,4.8+1/30];
  assert.equal(validateMontageManifest(f).ok,false);
});
run("affine native timing participates in unit content hash",()=>{
  const a=compileMontagePipeline(affineFixture(100)),b=compileMontagePipeline(affineFixture(200));assert(a.ok && b.ok);
  assert.notEqual(a.units[0].contentHash,b.units[0].contentHash);
});
run("mapped last frame cannot be replaced with adjacent root frame at stretch400",()=>{
  const f=affineFixture(400),a=f.manifest.assignments[0],sample=a.crop.samples.find(s=>Math.abs(s.sourceTime-179/120)<1e-12);assert(sample);
  sample.sourceTime-=1/120;assert.equal(validateMontageManifest(f).ok,false);
});
run("affine source clipping maps back to root and retains off-media structural occurrence",()=>{
  const inventory={complete:true,comps:[{itemId:10,duration:12,frameRate:30,layers:[{id:1,index:1,enabled:true,sourceItemId:30,startTime:-2,inPoint:0,outPoint:8,stretch:200,timeRemapEnabled:false}]}],sources:[{itemId:30,type:"footage",file:"C:/clip.mp4",duration:3}]};
  let u=buildSourceUsageMap({inventory,roots:[{compItemId:10}]});assert(u.ok);assert.deepEqual(u.entries[0].sourceRange,[1,3]);assert.deepEqual(u.entries[0].rootRange,[0,4]);
  inventory.comps[0].layers[0].startTime=-20;u=buildSourceUsageMap({inventory,roots:[{compItemId:10}]});assert(u.ok);assert.equal(u.entries.length,0);assert.equal(u.occurrences.length,1);
});
run("affine alias collision compares source seconds",()=>{
  const inventory={complete:true,comps:[{itemId:10,duration:10,frameRate:30,layers:[{id:1,index:1,enabled:true,sourceItemId:30,startTime:0,inPoint:0,outPoint:6,stretch:200,timeRemapEnabled:false},{id:2,index:2,enabled:true,sourceItemId:31,startTime:0,inPoint:6,outPoint:10,stretch:100,timeRemapEnabled:false}]}],sources:[{itemId:30,type:"footage",file:"C:/clip.mp4",duration:20},{itemId:31,type:"footage",file:"file:///C:/clip.mp4",duration:20}]};
  const usage=buildSourceUsageMap({inventory,roots:[{compItemId:10}]});assert(usage.ok);
  const checked=checkPlaceholderAssignments({usage,assignments:[{target:{compItemId:10,layerId:2},sourceItemId:31,sourceRange:[2,4]}],constraints:{disallowSourceOverlap:true,distinctGroups:false}});
  assert.equal(checked.ok,false);assert(checked.conflicts.some(c=>c.type==="source_interval_overlap" && c.overlap[0]===2 && c.overlap[1]===3));
});
run("invalid explicit expected stretch cannot pass matching actual readback",()=>{
  const e={compItemIndex:1,compItemId:1,compName:"Root",layerIndex:1,layerId:2,layerName:"Target",sourceItemId:3,sourceName:"Clip",startTime:0,inPoint:0,outPoint:6,frameRate:30,stretch:-100};
  const actual={comp:{itemIndex:1,itemId:1,name:"Root",frameRate:30},layer:{index:1,id:2,name:"Target",startTime:0,inPoint:0,outPoint:6,stretch:-100,timeRemapEnabled:false,source:{itemId:3,name:"Clip"}}};
  assert.equal(verifyPlaceholderReadBack(e,actual).reason,"invalid_expected_evidence");
  e.stretch=200;actual.layer.stretch=200;assert.equal(verifyPlaceholderReadBack(e,actual).ok,true);
  delete e.stretch;actual.layer.stretch=100;assert.equal(verifyPlaceholderReadBack(e,actual).ok,true);
});
for(const field of ["stretch","rootRange","localRange","sourceRange","rootFps","targetStartTime"])run(`framing rejects partial timing context without ${field}`,()=>{
  const f=affineFixture(200),a=f.manifest.assignments[0],o=f.observations.targets[0];
  const timing={stretch:200,rootRange:[0,6],localRange:[0,6],sourceRange:[0,3],rootFps:30,targetStartTime:0};delete timing[field];
  const result=proposePlaceholderCover({target:{...a.target,sourceItemId:301},sourceRange:a.sourceRange,samples:a.crop.samples,geometry:o.geometry,timing});
  assert.equal(result.status,"ineligible");assert(result.reasons.includes("incomplete_or_inconsistent_timing_context"));
});

console.log(`\nmontage-affine-smoke.js: ${passedTests}/${totalTests} tests passed.\n`);
assert.equal(passedTests, totalTests);
