"use strict";

/**
 * @file montage-fixture.js
 * Synthetic offline fixtures for Montage Pipeline V1 validation and smoke testing (M1).
 * Pure offline adapter records for the bounded V1 contract.
 */

const { computeRequiredFrameCoverage } = require("../mcp-server/montage-coverage");
const { deepClone } = require("../mcp-server/montage-contract");
const { buildSourceUsageMap } = require("../mcp-server/placeholder-usage");

/**
 * Helper to generate valid framing observation samples matching placeholder-framing requirements.
 * Ensures all required framing times (first, mid, last anchors + interior cut boundaries) are covered.
 *
 * @param {number[]} sourceRange
 * @param {number[]} [shotBoundaries=[]]
 * @param {number} [fps=30]
 * @returns {Array<object>}
 */
function createCropSamples(sourceRange, shotBoundaries = [], fps = 30) {
  const [startSec, endSec] = sourceRange;
  const frameCount = Math.round((endSec - startSec) * fps);
  const offset0 = 0;
  const offsetMid = Math.floor((frameCount - 1) / 2);
  const offsetLast = frameCount - 1;

  const times = new Set([
    startSec + offset0 / fps,
    startSec + offsetMid / fps,
    startSec + offsetLast / fps
  ]);

  for (const cutTime of shotBoundaries) {
    if (cutTime > startSec && cutTime < endSec) {
      times.add(cutTime);
    }
  }

  const sortedTimes = Array.from(times).sort((a, b) => a - b);
  return sortedTimes.map((t, idx) => ({
    sourceTime: Number(t.toFixed(6)),
    coordinateSpace: "source_pixels",
    imageRef: `sample_ref_frame_${idx}`,
    imageSha256: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
    observation: `Visual observation at ${t}s`,
    noSignificantSubjects: true
  }));
}

/**
 * Creates a fully valid baseline multi-shot montage fixture conforming to the V1 contract.
 * Contains:
 * - Real native AE inventory (comps with layers, sources with file/metadata)
 * - Actual source usage map built via existing buildSourceUsageMap
 * - 2 scenes, each with 3 contiguous shots = 2 cuts inside the scene interval
 * - Distinct confirmed groups ("explicit_metadata" and "user_confirmed")
 * - Valid static 2D rectangular target geometries, PAR 1, stretch 100, timeRemapEnabled false
 * - Target and route layers completely matching native inventory
 * - Authoritative observations with complete inventory, usage mappings, footprint, and protection
 * - Complete frame coverage matching all mandatory anchors, cut sides, and camera events
 *
 * @param {object} [overrides={}]
 * @returns {{ manifest: object, materials: object, observations: object, budgets?: object }}
 */
function createValidMontageFixture(overrides = {}) {
  const fps = 30;

  // 1. Real native inventory conforming to placeholder-usage and AE models
  const inventory = {
    complete: true,
    comps: [
      {
        itemId: 100,
        itemIndex: 1,
        name: "Master Comp",
        duration: 12.0,
        frameRate: fps,
        width: 1920,
        height: 1080,
        pixelAspect: 1,
        layers: [
          {
            id: 10,
            index: 1,
            name: "Scene 1 Precomp Layer",
            enabled: true,
            locked: false,
            sourceItemId: 110,
            startTime: 0.0,
            inPoint: 0.0,
            outPoint: 6.0,
            stretch: 100,
            timeRemapEnabled: false
          },
          {
            id: 11,
            index: 2,
            name: "Scene 2 Precomp Layer",
            enabled: true,
            locked: false,
            sourceItemId: 120,
            startTime: 6.0,
            inPoint: 6.0,
            outPoint: 12.0,
            stretch: 100,
            timeRemapEnabled: false
          }
        ]
      },
      {
        itemId: 110,
        itemIndex: 2,
        name: "Scene 1 Comp",
        duration: 6.0,
        frameRate: fps,
        width: 1920,
        height: 1080,
        pixelAspect: 1,
        layers: [
          {
            id: 21,
            index: 1,
            name: "Placeholder Layer 1",
            enabled: true,
            locked: false,
            sourceItemId: 301,
            startTime: 0.0,
            inPoint: 0.0,
            outPoint: 6.0,
            stretch: 100,
            timeRemapEnabled: false
          }
        ]
      },
      {
        itemId: 120,
        itemIndex: 3,
        name: "Scene 2 Comp",
        duration: 6.0,
        frameRate: fps,
        width: 1920,
        height: 1080,
        pixelAspect: 1,
        layers: [
          {
            id: 22,
            index: 1,
            name: "Placeholder Layer 2",
            enabled: true,
            locked: false,
            sourceItemId: 302,
            startTime: 0.0,
            inPoint: 0.0,
            outPoint: 6.0,
            stretch: 100,
            timeRemapEnabled: false
          }
        ]
      }
    ],
    sources: [
      {
        itemId: 301,
        itemIndex: 4,
        name: "clip_a.mp4",
        type: "footage",
        file: "c:/assets/footage/clip_a.mp4",
        duration: 10.0,
        frameRate: fps,
        width: 1920,
        height: 1080,
        pixelAspect: 1,
        hasVideo: true,
        footageMissing: false,
        mediaMetadata: {
          groupId: "grp_performer_a",
          provenance: "explicit_metadata"
        }
      },
      {
        itemId: 302,
        itemIndex: 5,
        name: "clip_b.mp4",
        type: "footage",
        file: "c:/assets/footage/clip_b.mp4",
        duration: 10.0,
        frameRate: fps,
        width: 1920,
        height: 1080,
        pixelAspect: 1,
        hasVideo: true,
        footageMissing: false,
        mediaMetadata: {
          groupId: "grp_performer_b",
          provenance: "user_confirmed",
          confirmed: true
        }
      }
    ]
  };

  // 2. Build actual source usage map with authoritative groups and occurrences
  const usage = buildSourceUsageMap({
    inventory,
    roots: [{ compItemId: 100 }]
  });

  const scenes = [
    {
      sceneId: "scene_1",
      rootCompItemId: 100,
      rootCompName: "Master Comp",
      rootRange: [0, 6],
      fps,
      assignmentIds: ["assign_1"],
      visibleCutCount: 2,
      cameraEvents: [{ eventId: "cam_1", rootTime: 3.0 }]
    },
    {
      sceneId: "scene_2",
      rootCompItemId: 100,
      rootCompName: "Master Comp",
      rootRange: [6, 12],
      fps,
      assignmentIds: ["assign_2"],
      visibleCutCount: 2,
      cameraEvents: [{ eventId: "cam_2", rootTime: 9.0 }]
    }
  ];

  const assignments = [
    {
      assignmentId: "assign_1",
      sceneId: "scene_1",
      target: { compItemId: 110, layerId: 21 },
      routeLayerIds: [10],
      materialId: "mat_clip_a",
      sourceRange: [0, 6],
      rootRange: [0, 6],
      groupId: "grp_performer_a",
      crop: {
        mode: "static-cover",
        samples: createCropSamples([0, 6], [2.0, 4.0], fps),
        marginPixels: 0
      },
      shots: [
        { shotId: "shot_1_01", sourceRange: [0, 2] },
        { shotId: "shot_1_02", sourceRange: [2, 4] },
        { shotId: "shot_1_03", sourceRange: [4, 6] }
      ],
      protectedFields: []
    },
    {
      assignmentId: "assign_2",
      sceneId: "scene_2",
      target: { compItemId: 120, layerId: 22 },
      routeLayerIds: [11],
      materialId: "mat_clip_b",
      sourceRange: [0, 6],
      rootRange: [6, 12],
      groupId: "grp_performer_b",
      crop: {
        mode: "static-cover",
        samples: createCropSamples([0, 6], [2.0, 4.0], fps),
        marginPixels: 0
      },
      shots: [
        { shotId: "shot_2_01", sourceRange: [0, 2] },
        { shotId: "shot_2_02", sourceRange: [2, 4] },
        { shotId: "shot_2_03", sourceRange: [4, 6] }
      ],
      protectedFields: []
    }
  ];

  // Calculate mandatory frame coverage deterministically
  const requiredMap = computeRequiredFrameCoverage({ scenes, assignments, fps });
  const frameCoverage = Array.from(requiredMap.values()).map((req) => ({
    frameId: req.frameId,
    sceneId: req.sceneId,
    assignmentId: req.assignmentId,
    compItemId: req.compItemId,
    rootFrame: req.rootFrame,
    rootTime: req.rootTime,
    roles: Array.from(req.roles),
    reasons: Array.from(req.reasons)
  }));

  const manifest = {
    schema: "ae-agent-montage-manifest.v1",
    revision: 1,
    taskId: "task-montage-stage2-m1-02",
    observedAt: "2026-10-02T12:00:00.000Z",
    project: {
      projectFile: "c:/projects/montage_master.aep",
      projectKey: "proj-master-key-01",
      revision: 1
    },
    scenes,
    assignments,
    groups: [
      {
        groupId: "grp_performer_a",
        provenance: "explicit_metadata",
        confirmed: true
      },
      {
        groupId: "grp_performer_b",
        provenance: "user_confirmed",
        confirmed: true
      }
    ],
    groupPolicy: {
      distinctGroups: true,
      disallowSourceOverlap: true,
      balancedRepeats: []
    },
    dependencies: {
      complete: true,
      scope: {
        rootCompItemIds: [100],
        targetKeys: ["110:21", "120:22"],
        sourceItemIds: [301, 302]
      },
      edges: [
        { dependencyId: "dep_tgt_1", kind: "target", compItemId: 110, layerId: 21, sceneIds: ["scene_1"] },
        { dependencyId: "dep_tgt_2", kind: "target", compItemId: 120, layerId: 22, sceneIds: ["scene_2"] },
        { dependencyId: "dep_src_1", kind: "source", sourceItemId: 301, sceneIds: ["scene_1"] },
        { dependencyId: "dep_src_2", kind: "source", sourceItemId: 302, sceneIds: ["scene_2"] },
        { dependencyId: "dep_rte_1", kind: "route", compItemId: 100, layerId: 10, sceneIds: ["scene_1"] },
        { dependencyId: "dep_rte_2", kind: "route", compItemId: 100, layerId: 11, sceneIds: ["scene_2"] }
      ]
    },
    frameCoverage
  };

  const materials = {
    schema: "ae-agent-prepared-materials.v1",
    revision: 1,
    materials: [
      {
        materialId: "mat_clip_a",
        sourceItemId: 301,
        path: "c:/assets/footage/clip_a.mp4",
        sha256: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
        byteLength: 10485760,
        width: 1920,
        height: 1080,
        pixelAspect: 1,
        duration: 10,
        fps,
        provenance: {
          kind: "prepared_clip",
          originalMaterialId: "raw_a",
          originalSourceRange: [0, 10]
        }
      },
      {
        materialId: "mat_clip_b",
        sourceItemId: 302,
        path: "c:/assets/footage/clip_b.mp4",
        sha256: "b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1",
        byteLength: 12582912,
        width: 1920,
        height: 1080,
        pixelAspect: 1,
        duration: 10,
        fps,
        provenance: {
          kind: "prepared_clip",
          originalMaterialId: "raw_b",
          originalSourceRange: [0, 10]
        }
      }
    ]
  };

  const observations = {
    schema: "ae-agent-montage-observations.v1",
    observedAt: "2026-10-02T12:00:00.000Z",
    project: {
      projectFile: "c:/projects/montage_master.aep",
      projectKey: "proj-master-key-01",
      revision: 1
    },
    inventory,
    usage,
    targets: [
      {
        target: { compItemId: 110, layerId: 21 },
        geometry: {
          comp: { width: 1920, height: 1080, pixelAspect: 1, frameRate: fps },
          source: { width: 1920, height: 1080, pixelAspect: 1, duration: 10, frameRate: fps },
          layer: {
            threeDLayer: false,
            parentLayerId: null,
            rotation: 0,
            transformStatic: true,
            hasMasks: false,
            collapseTransformation: false,
            anchorPoint: [960, 540]
          }
        },
        transform: {
          anchorPoint: [960, 540],
          position: [960, 540],
          scale: [100, 100],
          rotation: 0,
          opacity: 100
        },
        route: [
          {
            parentCompItemId: 100,
            childCompItemId: 110,
            layerId: 10,
            layerIndex: 1,
            startTime: 0,
            inPoint: 0,
            outPoint: 6,
            stretch: 100,
            timeRemapEnabled: false
          }
        ],
        targetLayer: {
          id: 21,
          index: 1,
          name: "Placeholder Layer 1",
          sourceItemId: 301,
          locked: false,
          stretch: 100,
          timeRemapEnabled: false
        },
        footprint: {
          complete: true,
          hasTrackMatte: false,
          hasEffects: false
        },
        protection: {
          checked: true,
          ok: true
        }
      },
      {
        target: { compItemId: 120, layerId: 22 },
        geometry: {
          comp: { width: 1920, height: 1080, pixelAspect: 1, frameRate: fps },
          source: { width: 1920, height: 1080, pixelAspect: 1, duration: 10, frameRate: fps },
          layer: {
            threeDLayer: false,
            parentLayerId: null,
            rotation: 0,
            transformStatic: true,
            hasMasks: false,
            collapseTransformation: false,
            anchorPoint: [960, 540]
          }
        },
        transform: {
          anchorPoint: [960, 540],
          position: [960, 540],
          scale: [100, 100],
          rotation: 0,
          opacity: 100
        },
        route: [
          {
            parentCompItemId: 100,
            childCompItemId: 120,
            layerId: 11,
            layerIndex: 2,
            startTime: 6,
            inPoint: 6,
            outPoint: 12,
            stretch: 100,
            timeRemapEnabled: false
          }
        ],
        targetLayer: {
          id: 22,
          index: 1,
          name: "Placeholder Layer 2",
          sourceItemId: 302,
          locked: false,
          stretch: 100,
          timeRemapEnabled: false
        },
        footprint: {
          complete: true,
          hasTrackMatte: false,
          hasEffects: false
        },
        protection: {
          checked: true,
          ok: true
        }
      }
    ],
    materials: [
      {
        materialId: "mat_clip_a",
        sourceItemId: 301,
        verified: true,
        path: "c:/assets/footage/clip_a.mp4",
        sha256: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
        byteLength: 10485760,
        metadata: { width: 1920, height: 1080, pixelAspect: 1, duration: 10, fps }
      },
      {
        materialId: "mat_clip_b",
        sourceItemId: 302,
        verified: true,
        path: "c:/assets/footage/clip_b.mp4",
        sha256: "b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90a1",
        byteLength: 12582912,
        metadata: { width: 1920, height: 1080, pixelAspect: 1, duration: 10, fps }
      }
    ],
    dependencyScope: {
      complete: true,
      rootCompItemIds: [100],
      targetKeys: ["110:21", "120:22"],
      sourceItemIds: [301, 302]
    }
  };

  // Narrow trusted reads are separate from generic inventory. They must bind to it.
  for (const target of observations.targets) {
    const comp = inventory.comps.find(c => c.itemId === target.target.compItemId);
    target.targetLayer = deepClone(comp.layers.find(l => l.id === target.target.layerId));
    target.footprint.hasExpressions = false;
    target.footprint.hasTransformKeys = false;
    for (const edge of target.route) {
      const parent = inventory.comps.find(c => c.itemId === edge.parentCompItemId);
      const child = inventory.comps.find(c => c.itemId === edge.childCompItemId);
      edge.geometry = {
        comp: { width: parent.width, height: parent.height, pixelAspect: parent.pixelAspect, frameRate: parent.frameRate },
        source: { width: child.width, height: child.height, pixelAspect: child.pixelAspect, duration: child.duration, frameRate: child.frameRate },
        layer: deepClone(target.geometry.layer)
      };
      edge.footprint = deepClone(target.footprint);
    }
  }

  const fixture = {
    manifest,
    materials,
    observations
  };

  // Apply shallow or nested overrides if provided
  if (overrides.manifest) Object.assign(fixture.manifest, overrides.manifest);
  if (overrides.materials) Object.assign(fixture.materials, overrides.materials);
  if (overrides.observations) Object.assign(fixture.observations, overrides.observations);
  if (overrides.budgets) fixture.budgets = overrides.budgets;

  return fixture;
}

/**
 * Creates a fixture with an explicit balanced repeat between assignments.
 */
function createBalancedRepeatFixture() {
  const fixture = createValidMontageFixture();
  // Assign same group to both assignments
  fixture.manifest.assignments[1].groupId = "grp_performer_a";

  // Update usage group mappings
  const mapping302 = fixture.observations.usage.groupMappings.find((m) => m.mediaKey === "file:c:/assets/footage/clip_b.mp4");
  if (mapping302) {
    mapping302.groupId = "grp_performer_a";
  }

  // Declare approved balanced repeat
  fixture.manifest.groupPolicy.balancedRepeats = [
    {
      groupId: "grp_performer_a",
      assignmentIds: ["assign_1", "assign_2"]
    }
  ];
  return fixture;
}

/**
 * Creates an invalid fixture with unsupported target geometry.
 */
function createUnsupportedGeometryManifest(kind = "threeD") {
  const fixture = createValidMontageFixture();
  const tgtLayer = fixture.observations.targets[0].geometry.layer;
  if (kind === "threeD") {
    tgtLayer.threeDLayer = true;
  } else if (kind === "rotation") {
    tgtLayer.rotation = 45;
  } else if (kind === "masks") {
    tgtLayer.hasMasks = true;
  } else if (kind === "collapse") {
    tgtLayer.collapseTransformation = true;
  }
  return fixture;
}

/**
 * Creates an invalid fixture with non-square pixel aspect ratio (PAR !== 1).
 */
function createUnsupportedPARManifest() {
  const fixture = createValidMontageFixture();
  fixture.materials.materials[0].pixelAspect = 1.333;
  fixture.observations.inventory.sources[0].pixelAspect = 1.333;
  fixture.observations.targets[0].geometry.comp.pixelAspect = 1.333;
  return fixture;
}

/**
 * Creates an invalid fixture with an unsupported route (depth > 4 or stretch !== 100).
 */
function createUnsupportedRouteManifest(kind = "depth") {
  const fixture = createValidMontageFixture();
  if (kind === "depth") {
    const route = [];
    const routeLayerIds = [];
    for (let i = 1; i <= 5; i++) {
      route.push({
        parentCompItemId: 100 + i,
        childCompItemId: 101 + i,
        layerId: i,
        layerIndex: i,
        startTime: 0,
        inPoint: 0,
        outPoint: 6,
        stretch: 100,
        timeRemapEnabled: false
      });
      routeLayerIds.push(i);
    }
    fixture.observations.targets[0].route = route;
    fixture.manifest.assignments[0].routeLayerIds = routeLayerIds;
  } else if (kind === "stretch") {
    fixture.observations.targets[0].route[0].stretch = 120;
    fixture.observations.inventory.comps[0].layers[0].stretch = 120;
  }
  return fixture;
}

/**
 * Creates an invalid fixture with unconfirmed group provenance or confirmed !== true.
 */
function createUnconfirmedGroupManifest() {
  const fixture = createValidMontageFixture();
  fixture.manifest.groups[0].provenance = "unconfirmed_guess";
  return fixture;
}

/**
 * Creates an invalid fixture with a cyclic dependency.
 */
function createCycleDependencyManifest() {
  const fixture = createValidMontageFixture();
  // Actual native composition cycle, rather than a collision of arbitrary edge labels.
  fixture.observations.inventory.comps[1].layers[0].sourceItemId = 100;
  fixture.observations.targets[0].targetLayer.sourceItemId = 100;
  return fixture;
}

/**
 * Creates an invalid fixture with overlapping source ranges on the same material.
 */
function createOverlappingIntervalManifest() {
  const fixture = createValidMontageFixture();
  // Assign same material to both assignments with overlapping intervals
  fixture.manifest.assignments[1].materialId = "mat_clip_a";
  fixture.manifest.assignments[0].sourceRange = [0, 4];
  fixture.manifest.assignments[0].shots = [
    { shotId: "shot_1_01", sourceRange: [0, 2] },
    { shotId: "shot_1_02", sourceRange: [2, 4] }
  ];
  fixture.manifest.assignments[0].crop.samples = createCropSamples([0, 4], [2.0], 30);
  fixture.manifest.assignments[1].sourceRange = [2, 6];
  fixture.manifest.assignments[1].shots = [
    { shotId: "shot_2_01", sourceRange: [2, 4] },
    { shotId: "shot_2_02", sourceRange: [4, 6] }
  ];
  fixture.manifest.assignments[1].crop.samples = createCropSamples([2, 6], [4.0], 30);
  // Re-compute frame coverage
  const requiredMap = computeRequiredFrameCoverage({
    scenes: fixture.manifest.scenes,
    assignments: fixture.manifest.assignments,
    fps: 30
  });
  fixture.manifest.frameCoverage = Array.from(requiredMap.values()).map((req) => ({
    frameId: req.frameId,
    sceneId: req.sceneId,
    assignmentId: req.assignmentId,
    compItemId: req.compItemId,
    rootFrame: req.rootFrame,
    rootTime: req.rootTime,
    roles: Array.from(req.roles),
    reasons: Array.from(req.reasons)
  }));
  return fixture;
}

/**
 * Creates an invalid fixture where visibleCutCount does not match shot count - 1.
 */
function createCutCountMismatchManifest() {
  const fixture = createValidMontageFixture();
  fixture.manifest.scenes[0].visibleCutCount = 4; // Expected 2 (3 shots = 2 cuts)
  return fixture;
}

/**
 * Creates an invalid fixture with incomplete frame coverage.
 */
function createIncompleteCoverageManifest() {
  const fixture = createValidMontageFixture();
  // Drop the first required scene anchor
  fixture.manifest.frameCoverage = fixture.manifest.frameCoverage.slice(1);
  return fixture;
}

/**
 * Creates an invalid fixture with incomplete or unknown footprint.
 */
function createUnknownFootprintManifest(kind = "incomplete") {
  const fixture = createValidMontageFixture();
  if (kind === "incomplete") {
    fixture.observations.targets[0].footprint.complete = false;
  } else if (kind === "effects") {
    fixture.observations.targets[0].footprint.hasEffects = true;
  } else if (kind === "matte") {
    fixture.observations.targets[0].footprint.hasTrackMatte = true;
  }
  return fixture;
}

/**
 * Creates a fixture with reordered collections to test deterministic normalization.
 * Note: shot sequence inside assignments is strictly preserved.
 */
function createReorderedVariant(fixture) {
  const cloned = deepClone(fixture);
  cloned.manifest.scenes.reverse();
  cloned.manifest.assignments.reverse();
  cloned.manifest.groups.reverse();
  cloned.manifest.dependencies.edges.reverse();
  cloned.manifest.frameCoverage.reverse();
  cloned.materials.materials.reverse();
  return cloned;
}

/**
 * Creates a fixture with a circular swap dependency between two targets.
 * Target 1 (currently source 301) wants source 302 (currently on Target 2).
 * Target 2 (currently source 302) wants source 301 (currently on Target 1).
 * Causes unsupported_atomic_exchange cycle blocker.
 */
function createSwapCycleFixture() {
  const fixture = createValidMontageFixture();
  fixture.manifest.assignments[0].materialId = "mat_clip_b";
  fixture.manifest.assignments[0].groupId = "grp_performer_b";
  fixture.manifest.assignments[1].materialId = "mat_clip_a";
  fixture.manifest.assignments[1].groupId = "grp_performer_a";

  for (const edge of fixture.manifest.dependencies.edges) {
    if (edge.kind === "source") {
      edge.sceneIds = ["scene_1", "scene_2"];
    }
  }
  return fixture;
}

/**
 * Creates a fixture with a non-circular release order dependency.
 * Target 1 (currently source 301) wants source 302 (currently on Target 2).
 * Target 2 (currently source 302) wants new source 303.
 * Target 2 must release source 302 before Target 1 can use it.
 */
function createReleaseOrderFixture() {
  const fixture = createValidMontageFixture();
  const fps = 30;

  const source303 = {
    itemId: 303,
    itemIndex: 6,
    name: "clip_c.mp4",
    type: "footage",
    file: "c:/assets/footage/clip_c.mp4",
    duration: 10.0,
    frameRate: fps,
    width: 1920,
    height: 1080,
    pixelAspect: 1,
    hasVideo: true,
    footageMissing: false,
    mediaMetadata: {
      groupId: "grp_performer_c",
      provenance: "explicit_metadata"
    }
  };
  fixture.observations.inventory.sources.push(source303);

  const matClipC = {
    materialId: "mat_clip_c",
    sourceItemId: 303,
    path: "c:/assets/footage/clip_c.mp4",
    sha256: "c1c2c3c4c5c60718293a4b5c6d7e8f90c1c2c3c4c5c60718293a4b5c6d7e8f90",
    byteLength: 2097152,
    width: 1920,
    height: 1080,
    pixelAspect: 1,
    duration: 10.0,
    fps,
    provenance: { kind: "prepared_clip" }
  };
  fixture.materials.materials.push(matClipC);
  fixture.observations.materials.push({
    materialId: matClipC.materialId,
    sourceItemId: matClipC.sourceItemId,
    verified: true,
    path: matClipC.path,
    sha256: matClipC.sha256,
    byteLength: matClipC.byteLength,
    metadata: {
      width: 1920,
      height: 1080,
      pixelAspect: 1,
      duration: 10.0,
      fps
    }
  });

  const groupC = {
    groupId: "grp_performer_c",
    provenance: "explicit_metadata",
    confirmed: true
  };
  fixture.manifest.groups.push(groupC);

  // Target 1 gets mat_clip_b (source 302, held by Target 2)
  fixture.manifest.assignments[0].materialId = "mat_clip_b";
  fixture.manifest.assignments[0].groupId = "grp_performer_b";

  // Target 2 gets mat_clip_c (source 303, fresh)
  fixture.manifest.assignments[1].materialId = "mat_clip_c";
  fixture.manifest.assignments[1].groupId = "grp_performer_c";

  // Refresh usage map with new inventory sources
  fixture.observations.usage = buildSourceUsageMap({
    inventory: fixture.observations.inventory,
    roots: [{ compItemId: 100 }]
  });

  // Update dependencies
  fixture.manifest.dependencies.scope.sourceItemIds = [301, 302, 303];
  fixture.observations.dependencyScope.sourceItemIds = [301, 302, 303];

  fixture.manifest.dependencies.edges = [
    { dependencyId: "dep_t1", kind: "target", compItemId: 110, layerId: 21, sceneIds: ["scene_1"] },
    { dependencyId: "dep_t2", kind: "target", compItemId: 120, layerId: 22, sceneIds: ["scene_2"] },
    { dependencyId: "dep_s1", kind: "source", sourceItemId: 301, sceneIds: ["scene_1"] },
    { dependencyId: "dep_s2", kind: "source", sourceItemId: 302, sceneIds: ["scene_1", "scene_2"] },
    { dependencyId: "dep_s3", kind: "source", sourceItemId: 303, sceneIds: ["scene_2"] },
    { dependencyId: "dep_r1", kind: "route", compItemId: 100, layerId: 10, sceneIds: ["scene_1"] },
    { dependencyId: "dep_r2", kind: "route", compItemId: 100, layerId: 11, sceneIds: ["scene_2"] }
  ];

  return fixture;
}

/**
 * Creates a fixture with two assignments targeting the same layer with conflicting intents.
 */
function createConflictingTargetIntentFixture() {
  const fixture = createValidMontageFixture();
  // Duplicate assign_1 with a different sourceRange
  const assign2 = deepClone(fixture.manifest.assignments[0]);
  assign2.assignmentId = "assign_1_conflict";
  assign2.sourceRange = [2.0, 8.0];
  assign2.rootRange = [0, 6];
  assign2.shots = [
    { shotId: "shot_conflict_1", sourceRange: [2.0, 5.0] },
    { shotId: "shot_conflict_2", sourceRange: [5.0, 8.0] }
  ];
  fixture.manifest.assignments.push(assign2);
  fixture.manifest.scenes[0].assignmentIds.push("assign_1_conflict");
  return fixture;
}

module.exports = {
  createCropSamples,
  createValidMontageFixture,
  createBalancedRepeatFixture,
  createUnsupportedGeometryManifest,
  createUnsupportedPARManifest,
  createUnsupportedRouteManifest,
  createUnconfirmedGroupManifest,
  createCycleDependencyManifest,
  createOverlappingIntervalManifest,
  createCutCountMismatchManifest,
  createIncompleteCoverageManifest,
  createUnknownFootprintManifest,
  createReorderedVariant,
  createSwapCycleFixture,
  createReleaseOrderFixture,
  createConflictingTargetIntentFixture
};
