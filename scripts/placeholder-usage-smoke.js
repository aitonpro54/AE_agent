"use strict";

const assert = require("assert");
const {
  buildSourceUsageMap,
  checkPlaceholderAssignments,
  mediaKeyForSource
} = require("../mcp-server/placeholder-usage.js");

let testCount = 0;
let passedCount = 0;

function runTest(name, fn) {
  testCount++;
  try {
    fn();
    passedCount++;
    console.log(`[PASS] ${name}`);
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

/**
 * Helper to build valid test usage object with authoritative sources and occurrences
 * for tests that inspect checker logic on handmade usage fixtures.
 */
function makeTestUsage({
  entries = [],
  sources = [],
  occurrences = [],
  groupMappings = [],
  ok = true,
  complete = true
} = {}) {
  const occMap = new Map();
  const occurrenceKey = (o) => JSON.stringify([o.target.compItemId, o.target.layerId,
    o.rootCompItemId, o.routeLayerIds, o.rootRange]);
  for (const o of occurrences) {
    if (o && o.target) {
      occMap.set(occurrenceKey(o), o);
    }
  }
  for (const e of entries) {
    if (e && e.target) {
      const occurrence = {
        target: { compItemId: e.target.compItemId, layerId: e.target.layerId },
        rootCompItemId: e.rootCompItemId || 10,
        routeLayerIds: e.routeLayerIds ? [...e.routeLayerIds] : [],
        rootRange: e.rootRange ? [...e.rootRange] : [0, 10]
      };
      const key = occurrenceKey(occurrence);
      if (!occMap.has(key)) {
        occMap.set(key, occurrence);
      }
    }
  }
  return {
    ok,
    complete,
    entries,
    sources,
    occurrences: Array.from(occMap.values()),
    groupMappings
  };
}

console.log("Running placeholder-usage smoke tests...\n");

// 1. mediaKeyForSource canonicalization and repeated imports (including file:/// URI fix)
runTest("mediaKeyForSource normalizes cross-platform paths and merges duplicate imports", () => {
  const srcA = { itemId: 1, type: "footage", file: "C:\\Projects\\Media\\Clip_01.mp4" };
  const srcB = { itemId: 2, type: "footage", file: "c:/projects/media/clip_01.mp4" };
  const srcC = { itemId: 3, type: "footage", file: "file:///C:/projects/media/clip_01.mp4" };
  const srcNoFile = { itemId: 4, type: "footage" };
  const srcComp = { itemId: 5, type: "comp" };

  const keyA = mediaKeyForSource(srcA);
  const keyB = mediaKeyForSource(srcB);
  const keyC = mediaKeyForSource(srcC);

  assert.strictEqual(keyA, "file:c:/projects/media/clip_01.mp4");
  assert.strictEqual(keyA, keyB, "Different path notations must yield identical canonical mediaKey");
  assert.strictEqual(keyA, keyC, "URI format must yield identical canonical mediaKey");
  assert.strictEqual(mediaKeyForSource(srcNoFile), "unknown");
  assert.strictEqual(mediaKeyForSource(srcComp), "unknown");
});

// 2. nested start & clipping
runTest("buildSourceUsageMap calculates nested timing, layer clipping, and source ranges", () => {
  const inventory = {
    complete: true,
    comps: [
      {
        itemId: 10,
        name: "RootComp",
        duration: 10.0,
        frameRate: 30,
        layers: [
          {
            id: 101,
            index: 1,
            name: "Precomp Layer",
            enabled: true,
            sourceItemId: 20,
            startTime: 2.0,
            inPoint: 3.0,
            outPoint: 8.0,
            stretch: 100,
            timeRemapEnabled: false
          }
        ]
      },
      {
        itemId: 20,
        name: "Precomp A",
        duration: 10.0,
        frameRate: 30,
        layers: [
          {
            id: 201,
            index: 1,
            name: "Footage Layer",
            enabled: true,
            sourceItemId: 30,
            startTime: -1.0,
            inPoint: 2.0,
            outPoint: 5.0,
            stretch: 100,
            timeRemapEnabled: false
          }
        ]
      }
    ],
    sources: [
      {
        itemId: 30,
        type: "footage",
        file: "C:/Media/perf1.mp4",
        duration: 10.0,
        width: 1920,
        height: 1080,
        frameRate: 30,
        mediaMetadata: { groupId: "Band Alpha", provenance: "explicit_metadata" }
      }
    ]
  };

  const usage = buildSourceUsageMap({
    inventory,
    roots: [{ compItemId: 10 }]
  });

  assert.strictEqual(usage.ok, true);
  assert.strictEqual(usage.complete, true);
  assert.strictEqual(usage.entries.length, 1);
  assert.strictEqual(usage.sources.length, 1);
  assert.strictEqual(usage.sources[0].sourceItemId, 30);
  assert.strictEqual(usage.sources[0].mediaKey, "file:c:/media/perf1.mp4");
  assert.strictEqual(usage.occurrences.length, 2);

  const entry = usage.entries[0];
  assert.strictEqual(entry.sourceItemId, 30);
  assert.deepStrictEqual(entry.sourceRange, [3.0, 6.0]);
  assert.deepStrictEqual(entry.rootRange, [4.0, 7.0]);
  assert.deepStrictEqual(entry.routeLayerIds, [101]);
  assert.deepStrictEqual(entry.target, { compItemId: 20, layerId: 201 });
  assert.strictEqual(entry.groupId, "Band Alpha");
});

// 3. footage duration clipping
runTest("buildSourceUsageMap clips intervals when footage duration is shorter than layer window", () => {
  const inventory = {
    complete: true,
    comps: [
      {
        itemId: 10,
        duration: 10.0,
        frameRate: 30,
        layers: [
          {
            id: 101,
            index: 1,
            name: "Footage Layer",
            enabled: true,
            sourceItemId: 30,
            startTime: 0.0,
            inPoint: 1.0,
            outPoint: 7.0,
            stretch: 100,
            timeRemapEnabled: false
          }
        ]
      }
    ],
    sources: [
      {
        itemId: 30,
        type: "footage",
        file: "C:/Media/short.mp4",
        duration: 4.0,
        width: 1920,
        height: 1080,
        frameRate: 30
      }
    ]
  };

  const usage = buildSourceUsageMap({
    inventory,
    roots: [{ compItemId: 10 }]
  });

  assert.strictEqual(usage.ok, true);
  assert.strictEqual(usage.entries.length, 1);
  const entry = usage.entries[0];
  assert.deepStrictEqual(entry.sourceRange, [1.0, 4.0]);
  assert.deepStrictEqual(entry.rootRange, [1.0, 4.0]);
});

// 4. repeated precomp occurrences
runTest("buildSourceUsageMap tracks multiple occurrences of the same precomp with distinct routes and rootRanges", () => {
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
            id: 101,
            index: 1,
            name: "Precomp Occur 1",
            enabled: true,
            sourceItemId: 20,
            startTime: 0.0,
            inPoint: 0.0,
            outPoint: 4.0,
            stretch: 100,
            timeRemapEnabled: false
          },
          {
            id: 102,
            index: 2,
            name: "Precomp Occur 2",
            enabled: true,
            sourceItemId: 20,
            startTime: 5.0,
            inPoint: 5.0,
            outPoint: 9.0,
            stretch: 100,
            timeRemapEnabled: false
          }
        ]
      },
      {
        itemId: 20,
        name: "Precomp A",
        duration: 5.0,
        frameRate: 30,
        layers: [
          {
            id: 201,
            index: 1,
            name: "Footage Child",
            enabled: true,
            sourceItemId: 30,
            startTime: 0.0,
            inPoint: 0.0,
            outPoint: 4.0,
            stretch: 100,
            timeRemapEnabled: false
          }
        ]
      }
    ],
    sources: [
      {
        itemId: 30,
        type: "footage",
        file: "C:/Media/clip.mp4",
        duration: 10.0,
        width: 1920,
        height: 1080,
        frameRate: 30
      }
    ]
  };

  const usage = buildSourceUsageMap({
    inventory,
    roots: [{ compItemId: 10 }]
  });

  assert.strictEqual(usage.ok, true);
  assert.strictEqual(usage.entries.length, 2);

  const occ1 = usage.entries.find((e) => e.routeLayerIds[0] === 101);
  const occ2 = usage.entries.find((e) => e.routeLayerIds[0] === 102);

  assert.ok(occ1 && occ2, "Both precomp occurrences must be tracked");
  assert.deepStrictEqual(occ1.rootRange, [0.0, 4.0]);
  assert.deepStrictEqual(occ2.rootRange, [5.0, 9.0]);
  assert.deepStrictEqual(occ1.target, { compItemId: 20, layerId: 201 });
  assert.deepStrictEqual(occ2.target, { compItemId: 20, layerId: 201 });

  // Occurrence tracking
  const childOccurrences = usage.occurrences.filter((o) => o.target.compItemId === 20 && o.target.layerId === 201);
  assert.strictEqual(childOccurrences.length, 2);
});

// 5. disabled layer is skipped
runTest("buildSourceUsageMap ignores disabled layers", () => {
  const inventory = {
    complete: true,
    comps: [
      {
        itemId: 10,
        duration: 10.0,
        frameRate: 30,
        layers: [
          {
            id: 101,
            index: 1,
            name: "Disabled Layer",
            enabled: false,
            sourceItemId: 30,
            startTime: 0.0,
            inPoint: 0.0,
            outPoint: 5.0,
            stretch: 50,
            timeRemapEnabled: true
          }
        ]
      }
    ],
    sources: [
      { itemId: 30, type: "footage", file: "C:/Media/clip.mp4", duration: 10.0, width: 1920, height: 1080, frameRate: 30 }
    ]
  };

  const usage = buildSourceUsageMap({
    inventory,
    roots: [{ compItemId: 10 }]
  });

  assert.strictEqual(usage.ok, true);
  assert.strictEqual(usage.entries.length, 0);
  assert.strictEqual(usage.occurrences.length, 0);
  assert.strictEqual(usage.unsupported.length, 0);
});

// 6. cycles and unsupported stretch/remap
runTest("buildSourceUsageMap detects cycles, incomplete inventory, and unsupported properties", () => {
  const cycleInventory = {
    complete: true,
    comps: [
      {
        itemId: 10,
        duration: 10.0,
        frameRate: 30,
        layers: [
          { id: 101, index: 1, name: "To 20", enabled: true, sourceItemId: 20, startTime: 0, inPoint: 0, outPoint: 5, stretch: 100, timeRemapEnabled: false }
        ]
      },
      {
        itemId: 20,
        duration: 10.0,
        frameRate: 30,
        layers: [
          { id: 201, index: 1, name: "To 10", enabled: true, sourceItemId: 10, startTime: 0, inPoint: 0, outPoint: 5, stretch: 100, timeRemapEnabled: false }
        ]
      }
    ],
    sources: []
  };

  const cycleUsage = buildSourceUsageMap({ inventory: cycleInventory, roots: [{ compItemId: 10 }] });
  assert.strictEqual(cycleUsage.ok, false);
  assert.strictEqual(cycleUsage.complete, false);
  assert.ok(cycleUsage.unsupported.some((u) => u.reason === "cycle_detected"));

  const stretchInventory = {
    complete: true,
    comps: [
      {
        itemId: 10,
        duration: 10.0,
        frameRate: 30,
        layers: [
          { id: 101, index: 1, name: "Stretched", enabled: true, sourceItemId: 30, startTime: 0, inPoint: 0, outPoint: 5, stretch: 500, timeRemapEnabled: false }
        ]
      }
    ],
    sources: [
      { itemId: 30, type: "footage", file: "C:/Media/clip.mp4", duration: 10.0, width: 1920, height: 1080, frameRate: 30 }
    ]
  };
  const stretchUsage = buildSourceUsageMap({ inventory: stretchInventory, roots: [{ compItemId: 10 }] });
  assert.strictEqual(stretchUsage.ok, false);
  assert.strictEqual(stretchUsage.complete, false);
  assert.ok(stretchUsage.unsupported.some((u) => u.reason === "unsupported_stretch"));

  // Positive: stretch 120 is supported within observed 25..400%
  const validStretchInventory = {
    complete: true,
    comps: [
      {
        itemId: 10,
        duration: 10.0,
        frameRate: 30,
        layers: [
          { id: 101, index: 1, name: "Stretched120", enabled: true, sourceItemId: 30, startTime: 0, inPoint: 0, outPoint: 6, stretch: 120, timeRemapEnabled: false }
        ]
      }
    ],
    sources: [
      { itemId: 30, type: "footage", file: "C:/Media/clip.mp4", duration: 10.0, width: 1920, height: 1080, frameRate: 30 }
    ]
  };
  const validStretchUsage = buildSourceUsageMap({ inventory: validStretchInventory, roots: [{ compItemId: 10 }] });
  assert.strictEqual(validStretchUsage.ok, true);
  assert.strictEqual(validStretchUsage.entries.length, 1);

  const incompleteUsage = buildSourceUsageMap({ inventory: { complete: false }, roots: [{ compItemId: 10 }] });
  assert.strictEqual(incompleteUsage.ok, false);
  assert.strictEqual(incompleteUsage.complete, false);
  assert.strictEqual(incompleteUsage.reason, "inventory_not_complete");
});

// 7. checkPlaceholderAssignments: half-open interval overlap and adjacency
runTest("checkPlaceholderAssignments treats adjacent intervals as valid, but detects real overlap", () => {
  const usage = makeTestUsage({
    entries: [],
    sources: [{ sourceItemId: 30, mediaKey: "file:c:/media/clip.mp4", duration: 10, type: "footage" }],
    occurrences: [
      { target: { compItemId: 10, layerId: 1 }, rootCompItemId: 10, routeLayerIds: [] },
      { target: { compItemId: 10, layerId: 2 }, rootCompItemId: 10, routeLayerIds: [] }
    ]
  });

  const adjacentAssignments = [
    { target: { compItemId: 10, layerId: 1 }, sourceItemId: 30, mediaKey: "file:c:/media/clip.mp4", sourceRange: [0.0, 5.0], groupId: "G1" },
    { target: { compItemId: 10, layerId: 2 }, sourceItemId: 30, mediaKey: "file:c:/media/clip.mp4", sourceRange: [5.0, 8.0], groupId: "G2" }
  ];

  const checkAdj = checkPlaceholderAssignments({
    usage,
    assignments: adjacentAssignments,
    constraints: {
      distinctGroups: false,
      disallowSourceOverlap: true
    }
  });

  assert.strictEqual(checkAdj.ok, true, "Adjacent intervals [0, 5) and [5, 8) must not overlap");
  assert.strictEqual(checkAdj.conflicts.length, 0);

  const overlappingAssignments = [
    { target: { compItemId: 10, layerId: 1 }, sourceItemId: 30, mediaKey: "file:c:/media/clip.mp4", sourceRange: [0.0, 5.001] },
    { target: { compItemId: 10, layerId: 2 }, sourceItemId: 30, mediaKey: "file:c:/media/clip.mp4", sourceRange: [5.0, 8.0] }
  ];

  const checkOverlap = checkPlaceholderAssignments({
    usage,
    assignments: overlappingAssignments,
    constraints: {
      distinctGroups: false,
      disallowSourceOverlap: true
    }
  });

  assert.strictEqual(checkOverlap.ok, false, "Overlapping intervals must be rejected");
  assert.strictEqual(checkOverlap.conflicts.length, 1);
  assert.strictEqual(checkOverlap.conflicts[0].type, "source_interval_overlap");
  assert.strictEqual(checkOverlap.conflicts[0].kind, "intrabatch");
});

// 8. duplicate media imports collision detection
runTest("checkPlaceholderAssignments detects overlap across duplicate imports of same file", () => {
  const usage = makeTestUsage({
    entries: [],
    sources: [
      { sourceItemId: 30, mediaKey: "file:c:/media/clip1.mp4", duration: 10, type: "footage" },
      { sourceItemId: 40, mediaKey: "file:c:/media/clip1.mp4", duration: 10, type: "footage" }
    ],
    occurrences: [
      { target: { compItemId: 10, layerId: 1 }, rootCompItemId: 10, routeLayerIds: [] },
      { target: { compItemId: 10, layerId: 2 }, rootCompItemId: 10, routeLayerIds: [] }
    ]
  });

  const assignments = [
    { target: { compItemId: 10, layerId: 1 }, sourceItemId: 30, mediaKey: "file:c:/media/clip1.mp4", sourceRange: [0.0, 4.0] },
    { target: { compItemId: 10, layerId: 2 }, sourceItemId: 40, mediaKey: "C:\\media\\clip1.mp4", sourceRange: [3.0, 7.0] }
  ];

  const check = checkPlaceholderAssignments({
    usage,
    assignments,
    constraints: {
      distinctGroups: false,
      disallowSourceOverlap: true
    }
  });

  assert.strictEqual(check.ok, false);
  assert.strictEqual(check.conflicts.length, 1);
  assert.strictEqual(check.conflicts[0].type, "source_interval_overlap");
  assert.deepStrictEqual(check.conflicts[0].overlap, [3.0, 4.0]);
});

// 9. existing usage collision vs selectedTargets exclusion
runTest("checkPlaceholderAssignments excludes selectedTargets from existing usages but flags collision with other existing layers", () => {
  const usage = makeTestUsage({
    entries: [
      {
        mediaKey: "file:c:/media/clip1.mp4",
        sourceItemId: 30,
        sourceRange: [0.0, 5.0],
        rootRange: [0.0, 5.0],
        target: { compItemId: 10, layerId: 1 }
      },
      {
        mediaKey: "file:c:/media/clip2.mp4",
        sourceItemId: 50,
        sourceRange: [10.0, 15.0],
        rootRange: [10.0, 15.0],
        target: { compItemId: 10, layerId: 99 }
      }
    ],
    sources: [
      { sourceItemId: 30, mediaKey: "file:c:/media/clip1.mp4", duration: 10, type: "footage" },
      { sourceItemId: 50, mediaKey: "file:c:/media/clip2.mp4", duration: 20, type: "footage" }
    ],
    occurrences: [
      { target: { compItemId: 10, layerId: 1 }, rootCompItemId: 10, routeLayerIds: [] },
      { target: { compItemId: 10, layerId: 99 }, rootCompItemId: 10, routeLayerIds: [] }
    ]
  });

  const assignments = [
    {
      target: { compItemId: 10, layerId: 1 },
      sourceItemId: 50,
      mediaKey: "file:c:/media/clip2.mp4",
      sourceRange: [12.0, 16.0]
    }
  ];

  const check = checkPlaceholderAssignments({
    usage,
    assignments,
    constraints: {
      distinctGroups: false,
      disallowSourceOverlap: true,
      selectedTargets: [{ compItemId: 10, layerId: 1 }]
    }
  });

  assert.strictEqual(check.ok, false);
  assert.strictEqual(check.conflicts.length, 1);
  assert.strictEqual(check.conflicts[0].kind, "existing_usage");
  assert.deepStrictEqual(check.conflicts[0].existingTarget, { compItemId: 10, layerId: 99 });
  assert.deepStrictEqual(check.conflicts[0].overlap, [12.0, 15.0]);
});

// 10. group provenance, unconfirmed groups, and duplicate groups
runTest("checkPlaceholderAssignments enforces verified group provenance and distinct groups", () => {
  const usage = makeTestUsage({
    entries: [],
    sources: [
      { sourceItemId: 1, mediaKey: "file:c:/media/clip_a.mp4", duration: 10, type: "footage" },
      { sourceItemId: 2, mediaKey: "file:c:/media/clip_b.mp4", duration: 10, type: "footage" },
      { sourceItemId: 3, mediaKey: "file:c:/media/clip_a_alt.mp4", duration: 20, type: "footage" },
      { sourceItemId: 4, mediaKey: "file:c:/media/clip_c.mp4", duration: 10, type: "footage" }
    ],
    occurrences: [
      { target: { compItemId: 10, layerId: 1 }, rootCompItemId: 10, routeLayerIds: [] },
      { target: { compItemId: 10, layerId: 2 }, rootCompItemId: 10, routeLayerIds: [] }
    ]
  });

  const confirmedMappings = [
    { mediaKey: "file:c:/media/clip_a.mp4", groupId: "Group 1", provenance: "explicit_metadata", confirmed: true },
    { mediaKey: "file:c:/media/clip_b.mp4", groupId: "Group 2", provenance: "user_confirmed", confirmed: true },
    { mediaKey: "file:c:/media/clip_c.mp4", groupId: "Group Inferred", provenance: "filename_inferred", confirmed: true }
  ];

  const validDistinct = [
    { target: { compItemId: 10, layerId: 1 }, sourceItemId: 1, mediaKey: "file:c:/media/clip_a.mp4", sourceRange: [0, 4] },
    { target: { compItemId: 10, layerId: 2 }, sourceItemId: 2, mediaKey: "file:c:/media/clip_b.mp4", sourceRange: [0, 4] }
  ];
  const resValid = checkPlaceholderAssignments({
    usage,
    assignments: validDistinct,
    constraints: { distinctGroups: true, groupMappings: confirmedMappings }
  });
  assert.strictEqual(resValid.ok, true);
  assert.strictEqual(resValid.unknownGroups.length, 0);

  const duplicateGroup = [
    { target: { compItemId: 10, layerId: 1 }, sourceItemId: 1, mediaKey: "file:c:/media/clip_a.mp4", sourceRange: [0, 4] },
    { target: { compItemId: 10, layerId: 2 }, sourceItemId: 3, mediaKey: "file:c:/media/clip_a_alt.mp4", sourceRange: [10, 14] }
  ];
  const mappingsWithDuplicate = [
    ...confirmedMappings,
    { mediaKey: "file:c:/media/clip_a_alt.mp4", groupId: "Group 1", provenance: "user_confirmed", confirmed: true }
  ];
  const resDup = checkPlaceholderAssignments({
    usage,
    assignments: duplicateGroup,
    constraints: { distinctGroups: true, groupMappings: mappingsWithDuplicate }
  });
  assert.strictEqual(resDup.ok, false);
  assert.ok(resDup.conflicts.some((c) => c.type === "duplicate_group" && c.groupId === "Group 1"));

  const unconfirmedGroup = [
    { target: { compItemId: 10, layerId: 1 }, sourceItemId: 4, mediaKey: "file:c:/media/clip_c.mp4", sourceRange: [0, 4], groupId: "ClaimedGroup" }
  ];
  const resUnconf = checkPlaceholderAssignments({
    usage,
    assignments: unconfirmedGroup,
    constraints: { distinctGroups: true, groupMappings: confirmedMappings }
  });
  assert.strictEqual(resUnconf.ok, false);
  assert.strictEqual(resUnconf.unknownGroups.length, 1);
  assert.strictEqual(resUnconf.unknownGroups[0].reason, "unconfirmed_group");
});

// 11. shared selected target with multiple occurrences
runTest("checkPlaceholderAssignments flags unsupported_shared_placeholder when target is shared across precomp occurrences", () => {
  const usage = makeTestUsage({
    entries: [
      {
        mediaKey: "file:c:/media/clip1.mp4",
        sourceItemId: 30,
        sourceRange: [0.0, 5.0],
        rootCompItemId: 10,
        rootRange: [0.0, 5.0],
        routeLayerIds: [101],
        target: { compItemId: 20, layerId: 201 }
      },
      {
        mediaKey: "file:c:/media/clip1.mp4",
        sourceItemId: 30,
        sourceRange: [0.0, 5.0],
        rootCompItemId: 10,
        rootRange: [10.0, 15.0],
        routeLayerIds: [102],
        target: { compItemId: 20, layerId: 201 }
      }
    ],
    sources: [
      { sourceItemId: 30, mediaKey: "file:c:/media/clip1.mp4", duration: 10, type: "footage" },
      { sourceItemId: 40, mediaKey: "file:c:/media/new.mp4", duration: 10, type: "footage" }
    ],
    occurrences: [
      { target: { compItemId: 20, layerId: 201 }, rootCompItemId: 10, routeLayerIds: [101], rootRange: [0.0, 5.0] },
      { target: { compItemId: 20, layerId: 201 }, rootCompItemId: 10, routeLayerIds: [102], rootRange: [10.0, 15.0] }
    ]
  });

  const assignments = [
    {
      target: { compItemId: 20, layerId: 201 },
      sourceItemId: 40,
      mediaKey: "file:c:/media/new.mp4",
      sourceRange: [0.0, 5.0]
    }
  ];

  const check = checkPlaceholderAssignments({
    usage,
    assignments,
    constraints: { distinctGroups: false }
  });

  assert.strictEqual(check.ok, false);
  assert.strictEqual(check.unsupported.length, 1);
  assert.strictEqual(check.unsupported[0].type, "unsupported_shared_placeholder");
  assert.strictEqual(check.unsupported[0].occurrenceCount, 2);
});

// 12. UNC, dot segments, localhost URI, and relative paths rejected
runTest("mediaKeyForSource handles UNC, dot segments, localhost URI, and rejects relative paths", () => {
  const srcUNC1 = { itemId: 1, type: "footage", file: "\\\\Server\\Share\\Folder\\Clip.mp4" };
  const srcUNC2 = { itemId: 2, type: "footage", file: "file://server/share/folder/clip.mp4" };
  assert.strictEqual(mediaKeyForSource(srcUNC1), "file:unc://server/share/folder/clip.mp4");
  assert.strictEqual(mediaKeyForSource(srcUNC2), "file:unc://server/share/folder/clip.mp4");

  const srcDot = { itemId: 3, type: "footage", file: "C:/Projects/foo/../media/./clip.mp4" };
  assert.strictEqual(mediaKeyForSource(srcDot), "file:c:/projects/media/clip.mp4");

  const srcLocalhost = { itemId: 4, type: "footage", file: "file://localhost/C:/projects/media/clip.mp4" };
  assert.strictEqual(mediaKeyForSource(srcLocalhost), "file:c:/projects/media/clip.mp4");

  const srcRelative = { itemId: 5, type: "footage", file: "media/clip.mp4" };
  assert.strictEqual(mediaKeyForSource(srcRelative), "unknown");
});

// 13. Unknown stretch/timeRemap/enabled are not defaulted to 100/false
runTest("buildSourceUsageMap rejects unknown stretch, timeRemapEnabled, enabled, and unknown sourceless layers", () => {
  const invNoStretch = {
    complete: true,
    comps: [{
      itemId: 10, duration: 10, frameRate: 30,
      layers: [{ id: 1, index: 1, enabled: true, timeRemapEnabled: false, startTime: 0, inPoint: 0, outPoint: 5, sourceItemId: 30 }]
    }],
    sources: [{ itemId: 30, type: "footage", file: "C:/Media/clip.mp4", duration: 10 }]
  };
  const resNoStretch = buildSourceUsageMap({ inventory: invNoStretch, roots: [{ compItemId: 10 }] });
  assert.strictEqual(resNoStretch.ok, false);
  assert.ok(resNoStretch.unsupported.some((u) => u.reason === "unknown_layer_stretch"));

  const invNoEnabled = {
    complete: true,
    comps: [{
      itemId: 10, duration: 10, frameRate: 30,
      layers: [{ id: 1, index: 1, stretch: 100, timeRemapEnabled: false, startTime: 0, inPoint: 0, outPoint: 5, sourceItemId: 30 }]
    }],
    sources: [{ itemId: 30, type: "footage", file: "C:/Media/clip.mp4", duration: 10 }]
  };
  const resNoEnabled = buildSourceUsageMap({ inventory: invNoEnabled, roots: [{ compItemId: 10 }] });
  assert.strictEqual(resNoEnabled.ok, false);
  assert.ok(resNoEnabled.unsupported.some((u) => u.reason === "unknown_layer_enabled"));

  const invUnknownSourceless = {
    complete: true,
    comps: [{
      itemId: 10, duration: 10, frameRate: 30,
      layers: [{ id: 1, index: 1, enabled: true, stretch: 100, timeRemapEnabled: false, startTime: 0, inPoint: 0, outPoint: 5, sourceItemId: null, kind: "future_unknown_kind" }]
    }],
    sources: []
  };
  const resUnknownSourceless = buildSourceUsageMap({ inventory: invUnknownSourceless, roots: [{ compItemId: 10 }] });
  assert.strictEqual(resUnknownSourceless.ok, false);
  assert.ok(resUnknownSourceless.unsupported.some((u) => u.reason === "unknown_missing_source"));
});

// 14. Missing footage file or duration makes map incomplete
runTest("buildSourceUsageMap marks map incomplete when footage is missing file or duration", () => {
  const invMissingFile = {
    complete: true,
    comps: [{
      itemId: 10, duration: 10, frameRate: 30,
      layers: [{ id: 1, index: 1, enabled: true, stretch: 100, timeRemapEnabled: false, startTime: 0, inPoint: 0, outPoint: 5, sourceItemId: 30 }]
    }],
    sources: [{ itemId: 30, type: "footage", duration: 10 }]
  };
  const resMissingFile = buildSourceUsageMap({ inventory: invMissingFile, roots: [{ compItemId: 10 }] });
  assert.strictEqual(resMissingFile.ok, false);
  assert.ok(resMissingFile.unsupported.some((u) => u.reason === "missing_footage_file_or_duration"));

  const invMissingDur = {
    complete: true,
    comps: [{
      itemId: 10, duration: 10, frameRate: 30,
      layers: [{ id: 1, index: 1, enabled: true, stretch: 100, timeRemapEnabled: false, startTime: 0, inPoint: 0, outPoint: 5, sourceItemId: 30 }]
    }],
    sources: [{ itemId: 30, type: "footage", file: "C:/Media/clip.mp4" }]
  };
  const resMissingDur = buildSourceUsageMap({ inventory: invMissingDur, roots: [{ compItemId: 10 }] });
  assert.strictEqual(resMissingDur.ok, false);
  assert.ok(resMissingDur.unsupported.some((u) => u.reason === "missing_footage_file_or_duration"));
});

// 15. Duplicate layer IDs and comp/source item ID collisions
runTest("buildSourceUsageMap detects duplicate layer IDs and comp/source item ID collisions", () => {
  const invDupLayer = {
    complete: true,
    comps: [{
      itemId: 10, duration: 10, frameRate: 30,
      layers: [
        { id: 1, index: 1, enabled: true, stretch: 100, timeRemapEnabled: false, startTime: 0, inPoint: 0, outPoint: 5, kind: "shape" },
        { id: 1, index: 2, enabled: true, stretch: 100, timeRemapEnabled: false, startTime: 0, inPoint: 0, outPoint: 5, kind: "text" }
      ]
    }],
    sources: []
  };
  const resDupLayer = buildSourceUsageMap({ inventory: invDupLayer, roots: [{ compItemId: 10 }] });
  assert.strictEqual(resDupLayer.ok, false);
  assert.strictEqual(resDupLayer.reason, "duplicate_layer_id");

  const invItemIdCol = {
    complete: true,
    comps: [{ itemId: 10, duration: 10, frameRate: 30, layers: [] }],
    sources: [{ itemId: 10, type: "footage", file: "C:/Media/clip.mp4", duration: 10 }]
  };
  const resCol = buildSourceUsageMap({ inventory: invItemIdCol, roots: [{ compItemId: 10 }] });
  assert.strictEqual(resCol.ok, false);
  assert.strictEqual(resCol.reason, "duplicate_item_id");
});

// 16. Root range clipping and rejection
runTest("buildSourceUsageMap clips root.range to comp duration or rejects out of bounds range", () => {
  const inventory = {
    complete: true,
    comps: [{
      itemId: 10, duration: 10, frameRate: 30,
      layers: [{ id: 1, index: 1, enabled: true, stretch: 100, timeRemapEnabled: false, startTime: 0, inPoint: 0, outPoint: 10, sourceItemId: 30 }]
    }],
    sources: [{ itemId: 30, type: "footage", file: "C:/Media/clip.mp4", duration: 20 }]
  };

  const resClipped = buildSourceUsageMap({ inventory, roots: [{ compItemId: 10, range: [-2, 12] }] });
  assert.strictEqual(resClipped.ok, true);
  assert.deepStrictEqual(resClipped.entries[0].rootRange, [0, 10]);

  const resOutOfBounds = buildSourceUsageMap({ inventory, roots: [{ compItemId: 10, range: [10, 15] }] });
  assert.strictEqual(resOutOfBounds.ok, false);
  assert.strictEqual(resOutOfBounds.reason, "root_range_out_of_bounds");
});

// 17. Nested precomp local clipping with root mapping
runTest("buildSourceUsageMap clips nested precomp local time against child comp duration with exact root mapping", () => {
  const inventory = {
    complete: true,
    comps: [
      {
        itemId: 10, duration: 10, frameRate: 30,
        layers: [
          { id: 101, index: 1, enabled: true, stretch: 100, timeRemapEnabled: false, startTime: 0, inPoint: 0, outPoint: 8, sourceItemId: 20 }
        ]
      },
      {
        itemId: 20, duration: 5.0, frameRate: 30,
        layers: [
          { id: 201, index: 1, enabled: true, stretch: 100, timeRemapEnabled: false, startTime: 0, inPoint: 0, outPoint: 5, sourceItemId: 30 }
        ]
      }
    ],
    sources: [
      { itemId: 30, type: "footage", file: "C:/Media/clip.mp4", duration: 10 }
    ]
  };

  const usage = buildSourceUsageMap({ inventory, roots: [{ compItemId: 10 }] });
  assert.strictEqual(usage.ok, true);
  assert.strictEqual(usage.entries.length, 1);
  assert.deepStrictEqual(usage.entries[0].rootRange, [0, 5]);
  assert.deepStrictEqual(usage.entries[0].sourceRange, [0, 5]);
});

// 18. Hard bounded graph
runTest("buildSourceUsageMap enforces hard bounds and node budget on large comp layers", () => {
  const resBadNodes = buildSourceUsageMap({ inventory: { complete: true, comps: [], sources: [] }, roots: [{ compItemId: 1 }], maxNodes: -5 });
  assert.strictEqual(resBadNodes.ok, false);
  assert.strictEqual(resBadNodes.reason, "invalid_bounds");

  const manyLayers = [];
  for (let i = 1; i <= 50; i++) {
    manyLayers.push({ id: i, index: i, enabled: true, stretch: 100, timeRemapEnabled: false, startTime: 0, inPoint: 0, outPoint: 5, kind: "shape" });
  }
  const bigInv = {
    complete: true,
    comps: [{ itemId: 10, duration: 10, frameRate: 30, layers: manyLayers }],
    sources: []
  };
  const resBudget = buildSourceUsageMap({ inventory: bigInv, roots: [{ compItemId: 10 }], maxNodes: 20 });
  assert.strictEqual(resBudget.ok, false);
  assert.ok(resBudget.unsupported.some((u) => u.reason === "max_nodes_exceeded"));
});

// 19. checkPlaceholderAssignments: validation of empty assignments and source ranges
runTest("checkPlaceholderAssignments rejects empty assignments, negative starts, and zero/negative lengths", () => {
  const usage = makeTestUsage({
    entries: [],
    sources: [{ sourceItemId: 30, mediaKey: "file:c:/media/clip.mp4", duration: 10, type: "footage" }],
    occurrences: [{ target: { compItemId: 10, layerId: 1 }, rootCompItemId: 10, routeLayerIds: [] }]
  });

  const resEmpty = checkPlaceholderAssignments({ usage, assignments: [] });
  assert.strictEqual(resEmpty.ok, false);
  assert.strictEqual(resEmpty.reason, "invalid_assignments");

  const resNeg = checkPlaceholderAssignments({
    usage,
    assignments: [{ target: { compItemId: 10, layerId: 1 }, sourceItemId: 30, mediaKey: "file:c:/media/clip.mp4", sourceRange: [-1, 5] }]
  });
  assert.strictEqual(resNeg.ok, false);
  assert.strictEqual(resNeg.reason, "invalid_assignment_shape");

  const resZeroLen = checkPlaceholderAssignments({
    usage,
    assignments: [{ target: { compItemId: 10, layerId: 1 }, sourceItemId: 30, mediaKey: "file:c:/media/clip.mp4", sourceRange: [5, 5] }]
  });
  assert.strictEqual(resZeroLen.ok, false);
  assert.strictEqual(resZeroLen.reason, "invalid_assignment_shape");
});

// 20. Unknown mediaKey rejected when disallowSourceOverlap=true
runTest("checkPlaceholderAssignments rejects unknown mediaKey when disallowSourceOverlap is true", () => {
  const usage = makeTestUsage({
    entries: [],
    sources: [{ sourceItemId: 30, mediaKey: "unknown", duration: 10, type: "footage" }],
    occurrences: [{ target: { compItemId: 10, layerId: 1 }, rootCompItemId: 10, routeLayerIds: [] }]
  });

  const assignments = [
    { target: { compItemId: 10, layerId: 1 }, sourceItemId: 30, mediaKey: "unknown", sourceRange: [0, 5] }
  ];

  const res = checkPlaceholderAssignments({
    usage,
    assignments,
    constraints: { distinctGroups: false, disallowSourceOverlap: true }
  });

  assert.strictEqual(res.ok, false);
  assert.ok(res.conflicts.some((c) => c.type === "unknown_media_key"));
});

// 21. Incomplete usage map fails even with flags false
runTest("checkPlaceholderAssignments fails when usage map is incomplete even if constraint flags are false", () => {
  const badUsage = { ok: false, complete: false, entries: [], sources: [], occurrences: [] };
  const assignments = [
    { target: { compItemId: 10, layerId: 1 }, sourceItemId: 30, mediaKey: "file:c:/media/clip.mp4", sourceRange: [0, 5] }
  ];

  const res = checkPlaceholderAssignments({
    usage: badUsage,
    assignments,
    constraints: { distinctGroups: false, disallowSourceOverlap: false }
  });

  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, "incomplete_usage_map");

  // Missing sources index fails with incomplete_usage_map
  const usageNoSources = { ok: true, complete: true, entries: [], occurrences: [] };
  const resNoSources = checkPlaceholderAssignments({ usage: usageNoSources, assignments });
  assert.strictEqual(resNoSources.ok, false);
  assert.strictEqual(resNoSources.reason, "incomplete_usage_map");

  // Missing occurrences index fails with incomplete_usage_map
  const usageNoOcc = { ok: true, complete: true, entries: [], sources: [] };
  const resNoOcc = checkPlaceholderAssignments({ usage: usageNoOcc, assignments });
  assert.strictEqual(resNoOcc.ok, false);
  assert.strictEqual(resNoOcc.reason, "incomplete_usage_map");
});

// 22. selectedTargets containing target without assignment rejected
runTest("checkPlaceholderAssignments rejects selectedTargets containing target without assignment", () => {
  const usage = makeTestUsage({
    entries: [
      { mediaKey: "file:c:/media/clip1.mp4", sourceItemId: 30, sourceRange: [0, 5], target: { compItemId: 10, layerId: 1 }, rootRange: [0, 5] },
      { mediaKey: "file:c:/media/clip1.mp4", sourceItemId: 30, sourceRange: [10, 15], target: { compItemId: 10, layerId: 2 }, rootRange: [10, 15] }
    ],
    sources: [{ sourceItemId: 30, mediaKey: "file:c:/media/clip1.mp4", duration: 20, type: "footage" }],
    occurrences: [
      { target: { compItemId: 10, layerId: 1 }, rootCompItemId: 10, routeLayerIds: [] },
      { target: { compItemId: 10, layerId: 2 }, rootCompItemId: 10, routeLayerIds: [] }
    ]
  });

  const assignments = [
    { target: { compItemId: 10, layerId: 1 }, sourceItemId: 30, mediaKey: "file:c:/media/clip1.mp4", sourceRange: [2, 7] }
  ];

  const resUnassigned = checkPlaceholderAssignments({
    usage,
    assignments,
    constraints: {
      distinctGroups: false,
      disallowSourceOverlap: true,
      selectedTargets: [
        { compItemId: 10, layerId: 1 },
        { compItemId: 10, layerId: 2 }
      ]
    }
  });

  assert.strictEqual(resUnassigned.ok, false);
  assert.strictEqual(resUnassigned.reason, "unassigned_selected_target");
});

// 23. Persisted usage.groupMappings and conflicting mappings detection
runTest("buildSourceUsageMap persists groupMappings and checkPlaceholderAssignments uses them when constraints absent", () => {
  const inventory = {
    complete: true,
    comps: [{
      itemId: 10, duration: 10, frameRate: 30,
      layers: [{ id: 1, index: 1, enabled: true, stretch: 100, timeRemapEnabled: false, startTime: 0, inPoint: 0, outPoint: 5, sourceItemId: 30 }]
    }],
    sources: [
      {
        itemId: 30, type: "footage", file: "C:/Media/clip.mp4", duration: 10,
        mediaMetadata: { groupId: "Auto Band", provenance: "explicit_metadata", confirmed: true }
      }
    ]
  };

  const usage = buildSourceUsageMap({ inventory, roots: [{ compItemId: 10 }] });
  assert.strictEqual(usage.ok, true);
  assert.ok(Array.isArray(usage.groupMappings));
  assert.strictEqual(usage.groupMappings.length, 1);
  assert.strictEqual(usage.groupMappings[0].groupId, "Auto Band");

  const assignments = [
    { target: { compItemId: 10, layerId: 1 }, sourceItemId: 30, mediaKey: "file:c:/media/clip.mp4", sourceRange: [0, 4] }
  ];
  const res = checkPlaceholderAssignments({
    usage,
    assignments,
    constraints: { distinctGroups: true }
  });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.unknownGroups.length, 0);

  const invConflict = {
    complete: true,
    comps: [{ itemId: 10, duration: 10, frameRate: 30, layers: [] }],
    sources: [
      {
        itemId: 30, type: "footage", file: "C:/Media/clip.mp4", duration: 10,
        mediaMetadata: { groupId: "Band 1", provenance: "explicit_metadata", confirmed: true }
      }
    ]
  };
  const conflictingProvided = [
    { mediaKey: "file:c:/media/clip.mp4", groupId: "Band 2", provenance: "explicit_metadata", confirmed: true }
  ];
  const resConflict = buildSourceUsageMap({ inventory: invConflict, roots: [{ compItemId: 10 }], groupMappings: conflictingProvided });
  assert.strictEqual(resConflict.ok, false);
  assert.ok(resConflict.unsupported.some((u) => u.reason === "conflicting_group_mappings"));
});

// 24. Real tiny overlap detection without rounding
runTest("checkPlaceholderAssignments detects tiny real overlaps without rounding away differences", () => {
  const usage = makeTestUsage({
    entries: [],
    sources: [{ sourceItemId: 30, mediaKey: "file:c:/media/clip.mp4", duration: 20, type: "footage" }],
    occurrences: [
      { target: { compItemId: 10, layerId: 1 }, rootCompItemId: 10, routeLayerIds: [] },
      { target: { compItemId: 10, layerId: 2 }, rootCompItemId: 10, routeLayerIds: [] }
    ]
  });

  const tinyOverlapAssignments = [
    { target: { compItemId: 10, layerId: 1 }, sourceItemId: 30, mediaKey: "file:c:/media/clip.mp4", sourceRange: [0.0, 5.0000001] },
    { target: { compItemId: 10, layerId: 2 }, sourceItemId: 30, mediaKey: "file:c:/media/clip.mp4", sourceRange: [5.0, 10.0] }
  ];

  const res = checkPlaceholderAssignments({
    usage,
    assignments: tinyOverlapAssignments,
    constraints: { distinctGroups: false, disallowSourceOverlap: true }
  });

  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.conflicts.length, 1);
  assert.strictEqual(res.conflicts[0].type, "source_interval_overlap");
});

runTest("actual usage-map traversal preserves tiny overlaps for assignment checks", () => {
  const inventory = {
    complete: true,
    comps: [{
      itemId: 10, duration: 10, frameRate: 30,
      layers: [
        {
          id: 1, index: 1, enabled: true, sourceItemId: 30,
          startTime: 0, inPoint: 0, outPoint: 5.0000001,
          stretch: 100, timeRemapEnabled: false
        },
        {
          id: 2, index: 2, enabled: true, sourceItemId: 30,
          startTime: 0, inPoint: 0, outPoint: 10,
          stretch: 100, timeRemapEnabled: false
        }
      ]
    }],
    sources: [{ itemId: 30, type: "footage", file: "C:/Media/clip.mp4", duration: 10 }]
  };
  const usage = buildSourceUsageMap({ inventory, roots: [{ compItemId: 10 }] });
  assert.strictEqual(usage.ok, true);
  assert.strictEqual(usage.entries[0].sourceRange[1], 5.0000001);
  const result = checkPlaceholderAssignments({
    usage,
    assignments: [{
      target: { compItemId: 10, layerId: 2 },
      sourceItemId: 30,
      mediaKey: "file:c:/media/clip.mp4",
      sourceRange: [5, 8]
    }],
    constraints: { distinctGroups: false, disallowSourceOverlap: true }
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.conflicts.some((conflict) => conflict.kind === "existing_usage"));
});

// 26. Production buildSourceUsageMap THEN checkPlaceholderAssignments pipeline
runTest("production buildSourceUsageMap then checkPlaceholderAssignments full pipeline", () => {
  const inventory = {
    complete: true,
    comps: [
      {
        itemId: 10,
        name: "Main",
        duration: 20,
        frameRate: 30,
        layers: [
          { id: 1, index: 1, enabled: true, sourceItemId: 30, startTime: 0, inPoint: 0, outPoint: 5, stretch: 100, timeRemapEnabled: false },
          { id: 2, index: 2, enabled: true, sourceItemId: 40, startTime: 5, inPoint: 5, outPoint: 10, stretch: 100, timeRemapEnabled: false }
        ]
      }
    ],
    sources: [
      { itemId: 30, type: "footage", file: "C:/Media/clip_a.mp4", duration: 15, mediaMetadata: { groupId: "Band 1", provenance: "explicit_metadata" } },
      { itemId: 40, type: "footage", file: "C:/Media/clip_b.mp4", duration: 15, mediaMetadata: { groupId: "Band 2", provenance: "explicit_metadata" } },
      { itemId: 50, type: "footage", file: "C:/Media/clip_c.mp4", duration: 15, mediaMetadata: { groupId: "Band 3", provenance: "explicit_metadata" } }
    ]
  };

  const usage = buildSourceUsageMap({ inventory, roots: [{ compItemId: 10 }] });
  assert.strictEqual(usage.ok, true);
  assert.strictEqual(usage.sources.length, 3);
  assert.strictEqual(usage.occurrences.length, 2);

  // Valid assignment replacing layer 1 with free range on clip_a
  const resValid = checkPlaceholderAssignments({
    usage,
    assignments: [
      { target: { compItemId: 10, layerId: 1 }, sourceItemId: 50, sourceRange: [0, 4] }
    ],
    constraints: { distinctGroups: true, disallowSourceOverlap: true }
  });
  assert.strictEqual(resValid.ok, true);
  assert.strictEqual(resValid.conflicts.length, 0);

  // Conflicting assignment with duplicate group
  const resDupGroup = checkPlaceholderAssignments({
    usage,
    assignments: [
      { target: { compItemId: 10, layerId: 1 }, sourceItemId: 30, sourceRange: [6, 10] },
      { target: { compItemId: 10, layerId: 2 }, sourceItemId: 30, sourceRange: [11, 14] }
    ],
    constraints: { distinctGroups: true, disallowSourceOverlap: true }
  });
  assert.strictEqual(resDupGroup.ok, false);
  assert.ok(resDupGroup.conflicts.some((c) => c.type === "duplicate_group"));
});

// 27. Aliases URI percent handling: literal %2520 vs URI-encoded %20
runTest("aliases URI and percent encoding: literal percent bytes preserved, URIs decoded", () => {
  const srcPercentLiteral = { itemId: 1, type: "footage", file: "C:/Media/a%2520b.mp4" };
  const keyPercentLiteral = mediaKeyForSource(srcPercentLiteral);
  assert.strictEqual(keyPercentLiteral, "file:c:/media/a%2520b.mp4");

  const srcNativeSpacePercent = { itemId: 2, type: "footage", file: "C:/Media/a%20b.mp4" };
  const keyNativeSpacePercent = mediaKeyForSource(srcNativeSpacePercent);
  assert.strictEqual(keyNativeSpacePercent, "file:c:/media/a%20b.mp4");
  assert.notStrictEqual(keyPercentLiteral, keyNativeSpacePercent, "Literal %2520 must NOT collapse into %20");

  const srcURIDecoded = { itemId: 3, type: "footage", file: "file:///C:/Media/a%20b.mp4" };
  const keyURIDecoded = mediaKeyForSource(srcURIDecoded);
  assert.strictEqual(keyURIDecoded, "file:c:/media/a b.mp4");

  // Assignment using URI format matches native path in inventory
  const inventory = {
    complete: true,
    comps: [{ itemId: 10, duration: 10, frameRate: 30, layers: [
      { id: 1, index: 1, enabled: true, sourceItemId: 30, startTime: 0, inPoint: 0, outPoint: 5, stretch: 100, timeRemapEnabled: false },
      { id: 2, index: 2, enabled: true, sourceItemId: 31, startTime: 0, inPoint: 0, outPoint: 5, stretch: 100, timeRemapEnabled: false }
    ]}],
    sources: [
      { itemId: 30, type: "footage", file: "C:/Media/clip.mp4", duration: 10 },
      { itemId: 31, type: "footage", file: "file:///C:/Media/clip.mp4", duration: 10 }
    ]
  };
  const usage = buildSourceUsageMap({ inventory, roots: [{ compItemId: 10 }] });
  assert.strictEqual(usage.ok, true);
  assert.strictEqual(usage.sources[0].mediaKey, usage.sources[1].mediaKey, "Different imports of same file must share canonical key");

  const overlapCheck = checkPlaceholderAssignments({
    usage,
    assignments: [
      { target: { compItemId: 10, layerId: 1 }, sourceItemId: 30, sourceRange: [0, 4] },
      { target: { compItemId: 10, layerId: 2 }, sourceItemId: 31, mediaKey: "file:///C:/Media/clip.mp4", sourceRange: [2, 6] }
    ],
    constraints: { distinctGroups: false, disallowSourceOverlap: true }
  });
  assert.strictEqual(overlapCheck.ok, false);
  assert.ok(overlapCheck.conflicts.some((c) => c.type === "source_interval_overlap"));
});

// 28. Group provenance: user_confirmed requires confirmed === true, explicit_metadata trusted
runTest("group provenance: user_confirmed requires confirmed === true, explicit_metadata is trusted", () => {
  const invOmittedConfirmed = {
    complete: true,
    comps: [{ itemId: 10, duration: 10, frameRate: 30, layers: [{ id: 1, index: 1, enabled: true, sourceItemId: 30, startTime: 0, inPoint: 0, outPoint: 5, stretch: 100, timeRemapEnabled: false }] }],
    sources: [
      {
        itemId: 30, type: "footage", file: "C:/Media/clip.mp4", duration: 10,
        mediaMetadata: { groupId: "Band User", provenance: "user_confirmed" } // confirmed omitted!
      }
    ]
  };

  const usageOmitted = buildSourceUsageMap({ inventory: invOmittedConfirmed, roots: [{ compItemId: 10 }] });
  assert.strictEqual(usageOmitted.ok, true);
  assert.strictEqual(usageOmitted.groupMappings.length, 0, "Unconfirmed user_confirmed mapping must be ignored");

  const checkOmitted = checkPlaceholderAssignments({
    usage: usageOmitted,
    assignments: [{ target: { compItemId: 10, layerId: 1 }, sourceItemId: 30, sourceRange: [0, 4] }],
    constraints: { distinctGroups: true }
  });
  assert.strictEqual(checkOmitted.ok, false);
  assert.strictEqual(checkOmitted.unknownGroups.length, 1);

  // Now with confirmed === true
  const invConfirmed = {
    complete: true,
    comps: [{ itemId: 10, duration: 10, frameRate: 30, layers: [{ id: 1, index: 1, enabled: true, sourceItemId: 30, startTime: 0, inPoint: 0, outPoint: 5, stretch: 100, timeRemapEnabled: false }] }],
    sources: [
      {
        itemId: 30, type: "footage", file: "C:/Media/clip.mp4", duration: 10,
        mediaMetadata: { groupId: "Band User", provenance: "user_confirmed", confirmed: true }
      }
    ]
  };
  const usageConfirmed = buildSourceUsageMap({ inventory: invConfirmed, roots: [{ compItemId: 10 }] });
  assert.strictEqual(usageConfirmed.groupMappings.length, 1);

  const checkConfirmed = checkPlaceholderAssignments({
    usage: usageConfirmed,
    assignments: [{ target: { compItemId: 10, layerId: 1 }, sourceItemId: 30, sourceRange: [0, 4] }],
    constraints: { distinctGroups: true }
  });
  assert.strictEqual(checkConfirmed.ok, true);

  // Supplied groupMappings with confirmed: false or omitted is rejected
  const resUnconfSupplied = checkPlaceholderAssignments({
    usage: usageOmitted,
    assignments: [{ target: { compItemId: 10, layerId: 1 }, sourceItemId: 30, sourceRange: [0, 4] }],
    constraints: {
      distinctGroups: true,
      groupMappings: [{ mediaKey: "file:c:/media/clip.mp4", groupId: "Supplied", provenance: "user_confirmed" }] // confirmed omitted
    }
  });
  assert.strictEqual(resUnconfSupplied.ok, false);
  assert.strictEqual(resUnconfSupplied.unknownGroups.length, 1);
});

// 29. Authoritative source index: detects spoofed mediaKey, unknown source, and duration overrun
runTest("authoritative source index prevents sourceID and mediaKey spoofing and duration overruns", () => {
  const inventory = {
    complete: true,
    comps: [{ itemId: 10, duration: 10, frameRate: 30, layers: [{ id: 1, index: 1, enabled: true, sourceItemId: 30, startTime: 0, inPoint: 0, outPoint: 5, stretch: 100, timeRemapEnabled: false }] }],
    sources: [{ itemId: 30, type: "footage", file: "C:/Media/clip.mp4", duration: 10 }]
  };
  const usage = buildSourceUsageMap({ inventory, roots: [{ compItemId: 10 }] });

  // 1. Spoofed mediaKey
  const resSpoofed = checkPlaceholderAssignments({
    usage,
    assignments: [{
      target: { compItemId: 10, layerId: 1 },
      sourceItemId: 30,
      mediaKey: "file:c:/media/different_spoofed.mp4",
      sourceRange: [0, 4]
    }]
  });
  assert.strictEqual(resSpoofed.ok, false);
  assert.ok(resSpoofed.conflicts.some((c) => c.type === "source_media_mismatch"));

  // 2. Unknown source item ID
  const resUnknownSource = checkPlaceholderAssignments({
    usage,
    assignments: [{
      target: { compItemId: 10, layerId: 1 },
      sourceItemId: 999,
      sourceRange: [0, 4]
    }]
  });
  assert.strictEqual(resUnknownSource.ok, false);
  assert.ok(resUnknownSource.conflicts.some((c) => c.type === "unknown_source_item"));

  // 3. Duration overrun
  const resOverrun = checkPlaceholderAssignments({
    usage,
    assignments: [{
      target: { compItemId: 10, layerId: 1 },
      sourceItemId: 30,
      sourceRange: [0, 15] // duration is 10
    }]
  });
  assert.strictEqual(resOverrun.ok, false);
  assert.ok(resOverrun.conflicts.some((c) => c.type === "source_range_exceeds_duration"));
});

// 30. Offmedia shared layer detected via usage.occurrences
runTest("offmedia shared layer in precomp detected as unsupported_shared_placeholder", () => {
  const inventory = {
    complete: true,
    comps: [
      {
        itemId: 10,
        name: "Root",
        duration: 10,
        frameRate: 30,
        layers: [
          { id: 101, index: 1, enabled: true, sourceItemId: 20, startTime: 0, inPoint: 0, outPoint: 4, stretch: 100, timeRemapEnabled: false },
          { id: 102, index: 2, enabled: true, sourceItemId: 20, startTime: 5, inPoint: 5, outPoint: 9, stretch: 100, timeRemapEnabled: false }
        ]
      },
      {
        itemId: 20,
        name: "Precomp A",
        duration: 10,
        frameRate: 30,
        layers: [
          {
            id: 201, index: 1, enabled: true, sourceItemId: 30,
            startTime: -20, inPoint: 0, outPoint: 5, // local time [20, 25), footage duration is 10 -> OFFMEDIA
            stretch: 100, timeRemapEnabled: false
          }
        ]
      }
    ],
    sources: [
      { itemId: 30, type: "footage", file: "C:/Media/clip.mp4", duration: 10 }
    ]
  };

  const usage = buildSourceUsageMap({ inventory, roots: [{ compItemId: 10 }] });
  assert.strictEqual(usage.ok, true);
  assert.strictEqual(usage.entries.length, 0, "Offmedia layer must produce 0 entries in source usage map");
  assert.strictEqual(usage.occurrences.filter((o) => o.target.compItemId === 20 && o.target.layerId === 201).length, 2, "Reachable layer must be recorded in occurrences twice");

  const res = checkPlaceholderAssignments({
    usage,
    assignments: [
      { target: { compItemId: 20, layerId: 201 }, sourceItemId: 30, sourceRange: [0, 4] }
    ]
  });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.unsupported.length, 1);
  assert.strictEqual(res.unsupported[0].type, "unsupported_shared_placeholder");
  assert.strictEqual(res.unsupported[0].occurrenceCount, 2);
});

// 31. Phantom target not found in occurrences is rejected
runTest("phantom target not in reachable comp occurrences is rejected", () => {
  const inventory = {
    complete: true,
    comps: [{ itemId: 10, duration: 10, frameRate: 30, layers: [{ id: 1, index: 1, enabled: true, sourceItemId: 30, startTime: 0, inPoint: 0, outPoint: 5, stretch: 100, timeRemapEnabled: false }] }],
    sources: [{ itemId: 30, type: "footage", file: "C:/Media/clip.mp4", duration: 10 }]
  };
  const usage = buildSourceUsageMap({ inventory, roots: [{ compItemId: 10 }] });

  const resPhantom = checkPlaceholderAssignments({
    usage,
    assignments: [{
      target: { compItemId: 999, layerId: 999 },
      sourceItemId: 30,
      sourceRange: [0, 4]
    }]
  });
  assert.strictEqual(resPhantom.ok, false);
  assert.ok(resPhantom.conflicts.some((c) => c.type === "target_not_found"));
});

// 32. Conflicting group mappings between usage and constraints fail without silent overwrite
runTest("conflicting group mappings between usage and constraints fail without silent overwrite", () => {
  const inventory = {
    complete: true,
    comps: [{ itemId: 10, duration: 10, frameRate: 30, layers: [{ id: 1, index: 1, enabled: true, sourceItemId: 30, startTime: 0, inPoint: 0, outPoint: 5, stretch: 100, timeRemapEnabled: false }] }],
    sources: [
      {
        itemId: 30, type: "footage", file: "C:/Media/clip.mp4", duration: 10,
        mediaMetadata: { groupId: "Band Alpha", provenance: "explicit_metadata", confirmed: true }
      }
    ]
  };
  const usage = buildSourceUsageMap({ inventory, roots: [{ compItemId: 10 }] });
  assert.strictEqual(usage.groupMappings[0].groupId, "Band Alpha");

  const resConflict = checkPlaceholderAssignments({
    usage,
    assignments: [{ target: { compItemId: 10, layerId: 1 }, sourceItemId: 30, sourceRange: [0, 4] }],
    constraints: {
      distinctGroups: true,
      groupMappings: [{ mediaKey: "file:c:/media/clip.mp4", groupId: "Band Beta", provenance: "user_confirmed", confirmed: true }]
    }
  });

  assert.strictEqual(resConflict.ok, false);
  assert.ok(resConflict.conflicts.some((c) => c.type === "conflicting_group_mappings"));
});

// Real usage-map fixtures: source 30 remains in use, source 31 is proposed for
// another reachable target, whose current source 32 will be replaced.
function buildAliasUsage(nativeFile, uriFile, groupMappings = []) {
  return buildSourceUsageMap({
    inventory: {
      complete: true,
      comps: [{ itemId: 10, duration: 10, frameRate: 30, layers: [
        { id: 1, index: 1, enabled: true, sourceItemId: 30, startTime: 0, inPoint: 0, outPoint: 5, stretch: 100, timeRemapEnabled: false },
        { id: 2, index: 2, enabled: true, sourceItemId: 32, startTime: 0, inPoint: 0, outPoint: 5, stretch: 100, timeRemapEnabled: false }
      ]}],
      sources: [
        { itemId: 30, type: "footage", file: nativeFile, duration: 10 },
        { itemId: 31, type: "footage", file: uriFile, duration: 10 },
        { itemId: 32, type: "footage", file: "C:/Media/unrelated.mp4", duration: 10 }
      ]
    },
    roots: [{ compItemId: 10 }],
    groupMappings
  });
}

// 33. Encoded UNC URIs must collide with existing native-file usage.
runTest("UNC URI aliases with encoded spaces reject overlap with actual existing usage", () => {
  for (const [nativeFile, uriFile, expectedKey] of [
    ["\\\\Server\\Share\\a b.mp4", "file://server/share/a%20b.mp4", "file:unc://server/share/a b.mp4"],
    ["\\\\Server\\Share Name\\a b.mp4", "file://server/share%20name/a%20b.mp4", "file:unc://server/share name/a b.mp4"]
  ]) {
    const usage = buildAliasUsage(nativeFile, uriFile);
    assert.strictEqual(usage.ok, true);
    assert.strictEqual(usage.sources[0].mediaKey, expectedKey);
    assert.strictEqual(usage.sources[1].mediaKey, expectedKey);
    assert.strictEqual(usage.entries[0].mediaKey, expectedKey, "Entries must use the same canonical key as the source index");
    const result = checkPlaceholderAssignments({
      usage,
      assignments: [{ target: { compItemId: 10, layerId: 2 }, sourceItemId: 31, mediaKey: uriFile, sourceRange: [0, 5] }],
      constraints: { distinctGroups: false, disallowSourceOverlap: true }
    });
    assert.strictEqual(result.ok, false);
    assert.ok(result.conflicts.some((c) => c.type === "source_interval_overlap" && c.kind === "existing_usage"));
    assert.ok(!result.conflicts.some((c) => c.type === "source_media_mismatch"));
  }
});

// 34. A URI decodes once; canonical keys stay literal throughout mapping/checking.
runTest("encoded percent URI aliases preserve canonical keys through actual map and checker", () => {
  for (const [nativeFile, uriFile, expectedKey] of [
    ["\\\\Server\\Share\\a%20b.mp4", "file://server/share/a%2520b.mp4", "file:unc://server/share/a%20b.mp4"],
    ["\\\\Server\\Share\\a%2520b.mp4", "file://server/share/a%252520b.mp4", "file:unc://server/share/a%2520b.mp4"],
    ["C:/Media/a%20b.mp4", "file:///C:/Media/a%2520b.mp4", "file:c:/media/a%20b.mp4"],
    ["C:/Media/a%2520b.mp4", "file:/C:/Media/a%252520b.mp4", "file:c:/media/a%2520b.mp4"],
    ["/Media/a%20b.mp4", "file:///Media/a%2520b.mp4", "file:/Media/a%20b.mp4"]
  ]) {
    const mapping = { mediaKey: uriFile, groupId: "Band Alias", provenance: "user_confirmed", confirmed: true };
    const usage = buildAliasUsage(nativeFile, uriFile, [mapping]);
    assert.strictEqual(usage.ok, true);
    assert.strictEqual(usage.sources[0].mediaKey, expectedKey);
    assert.strictEqual(usage.sources[1].mediaKey, expectedKey);
    assert.strictEqual(usage.entries[0].mediaKey, expectedKey);
    assert.strictEqual(usage.entries[0].groupId, "Band Alias");
    assert.strictEqual(usage.groupMappings[0].mediaKey, expectedKey);
    for (const claimedKey of [uriFile, expectedKey]) {
      const result = checkPlaceholderAssignments({
        usage,
        assignments: [{ target: { compItemId: 10, layerId: 2 }, sourceItemId: 31, mediaKey: claimedKey, sourceRange: [5, 10] }],
        constraints: { distinctGroups: true, disallowSourceOverlap: true, groupMappings: [{ ...mapping, mediaKey: expectedKey }] }
      });
      assert.strictEqual(result.ok, true, JSON.stringify(result));
      const overlapping = checkPlaceholderAssignments({
        usage,
        assignments: [{ target: { compItemId: 10, layerId: 2 }, sourceItemId: 31, mediaKey: claimedKey, sourceRange: [0, 5] }],
        constraints: { distinctGroups: true, disallowSourceOverlap: true }
      });
      assert.strictEqual(overlapping.ok, false);
      assert.ok(overlapping.conflicts.some((c) => c.type === "source_interval_overlap" && c.kind === "existing_usage"));
      assert.ok(!overlapping.conflicts.some((c) => c.type === "source_media_mismatch"));
    }
  }
});

// 35. Literal percent characters do not identify a filename containing a space.
runTest("native percent filenames stay distinct from URI spaces in actual overlap checks", () => {
  for (const [nativeFile, uriFile] of [
    ["\\\\Server\\Share\\a%20b.mp4", "file://server/share/a%20b.mp4"],
    ["\\\\Server\\Share\\a%2520b.mp4", "file://server/share/a%2520b.mp4"],
    ["C:/Media/a%20b.mp4", "file:///C:/Media/a%20b.mp4"],
    ["/Media/a%20b.mp4", "file:///Media/a%20b.mp4"]
  ]) {
    const usage = buildAliasUsage(nativeFile, uriFile);
    assert.strictEqual(usage.ok, true);
    assert.notStrictEqual(usage.sources[0].mediaKey, usage.sources[1].mediaKey);
    const result = checkPlaceholderAssignments({
      usage,
      assignments: [{ target: { compItemId: 10, layerId: 2 }, sourceItemId: 31, mediaKey: uriFile, sourceRange: [0, 5] }],
      constraints: { distinctGroups: false, disallowSourceOverlap: true }
    });
    assert.strictEqual(result.ok, true, JSON.stringify(result));
    assert.strictEqual(result.conflicts.length, 0);
  }
});

// 36. Emitted keys are unambiguous and remain stable under repeated parsing.
runTest("canonical UNC drive and POSIX keys are idempotent without decoding literal percent bytes", () => {
  for (const [input, expectedKey] of [
    ["\\\\SERVER\\Share\\folder\\..\\a%20b.mp4", "file:unc://server/share/a%20b.mp4"],
    ["file://server/share/a%2520b.mp4", "file:unc://server/share/a%20b.mp4"],
    ["file://server/share/a%252520b.mp4", "file:unc://server/share/a%2520b.mp4"],
    ["file:unc://SERVER/Share/a%20b.mp4", "file:unc://server/share/a%20b.mp4"],
    ["C:/Media/a%20b.mp4", "file:c:/media/a%20b.mp4"],
    ["file://localhost/C:/Media/a%2520b.mp4", "file:c:/media/a%20b.mp4"],
    ["/Media/a%20b.mp4", "file:/Media/a%20b.mp4"],
    ["file:///Media/a%2520b.mp4", "file:/Media/a%20b.mp4"],
    ["\\\\server\\share\\a%broken.mp4", "file:unc://server/share/a%broken.mp4"]
  ]) {
    let key = mediaKeyForSource({ type: "footage", file: input });
    assert.strictEqual(key, expectedKey);
    for (let pass = 0; pass < 3; pass++) {
      key = mediaKeyForSource({ type: "footage", file: key });
      assert.strictEqual(key, expectedKey);
    }
  }
  assert.strictEqual(mediaKeyForSource({ type: "footage", file: "file://server/share/a%broken.mp4" }), "unknown");
});

console.log(`\nPlaceholder-usage smoke summary: ${passedCount}/${testCount} tests passed.`);
if (passedCount !== testCount) {
  process.exitCode = 1;
}
