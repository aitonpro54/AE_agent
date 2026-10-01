/**
 * @file placeholder-framing-smoke.js
 * Offline contract smoke tests for placeholder framing helper.
 * Tests realistic cases and boundary conditions conforming to stage3-framing-fix.md.
 * Pure CommonJS, no external dependencies, no After Effects runtime.
 */

'use strict';

const {
  proposePlaceholderCover,
  verifyPlaceholderCoverage,
  proposeAlternativeSourceIntervals,
} = require('../mcp-server/placeholder-framing.js');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedTests++;
  console.log(`  [PASS] ${message}`);
}

function runTest(name, fn) {
  console.log(`\n--- Test: ${name} ---`);
  try {
    fn();
  } catch (err) {
    console.error(`Test '${name}' threw an error:`, err);
    process.exitCode = 1;
  }
}

function makeSample(sourceTime, subjects = [], noSignificantSubjects = true) {
  return {
    sourceTime,
    coordinateSpace: 'source_pixels',
    subjects,
    noSignificantSubjects,
    observation: `Observation for frame at ${sourceTime}`,
    imageRef: `synthetic-frame-${sourceTime}`,
    imageSha256: 'a'.repeat(64),
  };
}

// 1. Landscape source -> Portrait comp
runTest('1. landscape -> portrait cover', () => {
  const geometry = {
    comp: { width: 1080, height: 1920, pixelAspect: 1 },
    source: { width: 1920, height: 1080, pixelAspect: 1, duration: 60, frameRate: 30 },
    layer: {
      threeDLayer: false,
      parentLayerId: null,
      rotation: 0,
      anchorPoint: [960, 540],
      transformStatic: true,
      hasMasks: false,
      collapseTransformation: false,
    },
  };

  const sourceRange = [0, 5];
  const fps = 30;
  const frameCount = Math.round(5 * fps);
  const midSec = Math.floor((frameCount - 1) / 2) / fps;
  const lastSec = (frameCount - 1) / fps;

  const samples = [
    makeSample(0),
    makeSample(midSec),
    makeSample(lastSec),
  ];

  const result = proposePlaceholderCover({ geometry, samples, sourceRange });
  assert(result.eligible === true, 'geometry is eligible');
  assert(result.status === 'proposed', 'status is proposed');
  assert(result.proposal !== null, 'proposal generated');

  const expectedScale = (1920 / 1080) * 100;
  assert(Math.abs(result.proposal.scale[0] - expectedScale) < 1e-4, 'scale is uniform height cover');
  assert(Math.abs(result.proposal.scale[1] - expectedScale) < 1e-4, 'scale y matches scale x');

  const verification = verifyPlaceholderCoverage({ geometry, transform: result.proposal });
  assert(verification.covered === true, 'verifyPlaceholderCoverage confirms complete cover');
  assert(verification.holes.left === false && verification.holes.right === false, 'no horizontal holes');
  assert(verification.holes.top === false && verification.holes.bottom === false, 'no vertical holes');
  assert(verification.artisticReviewPending === true, 'artistic review marked pending');
});

// 2. Portrait source -> Landscape comp
runTest('2. portrait -> landscape cover', () => {
  const geometry = {
    comp: { width: 1920, height: 1080, pixelAspect: 1 },
    source: { width: 1080, height: 1920, pixelAspect: 1, duration: 60, frameRate: 30 },
    layer: {
      threeDLayer: false,
      parentLayerId: null,
      rotation: 0,
      anchorPoint: [540, 960],
      transformStatic: true,
      hasMasks: false,
      collapseTransformation: false,
    },
  };

  const sourceRange = [10, 15];
  const frameCount = 150;
  const samples = [
    makeSample(10),
    makeSample(10 + Math.floor((frameCount - 1) / 2) / 30),
    makeSample(10 + (frameCount - 1) / 30),
  ];

  const result = proposePlaceholderCover({ geometry, samples, sourceRange });
  assert(result.status === 'proposed', 'status proposed for portrait to landscape');

  const verification = verifyPlaceholderCoverage({ geometry, transform: result.proposal });
  assert(verification.covered === true, 'portrait to landscape covered');
});

// 3. Same aspect ratio
runTest('3. same aspect ratio', () => {
  const geometry = {
    comp: { width: 1920, height: 1080, pixelAspect: 1 },
    source: { width: 1280, height: 720, pixelAspect: 1, duration: 30, frameRate: 30 },
    layer: {
      threeDLayer: false,
      parentLayerId: null,
      rotation: 0,
      anchorPoint: [640, 360],
      transformStatic: true,
      hasMasks: false,
      collapseTransformation: false,
    },
  };

  const sourceRange = [0, 4];
  const frameCount = 120;
  const samples = [
    makeSample(0),
    makeSample(Math.floor((frameCount - 1) / 2) / 30),
    makeSample((frameCount - 1) / 30),
  ];

  const result = proposePlaceholderCover({ geometry, samples, sourceRange });
  assert(Math.abs(result.proposal.scale[0] - 150) < 1e-4, 'scale is exactly 150%');
  assert(result.coverageBounds.minX === result.coverageBounds.maxX, 'horizontal bounds zero slack');
  assert(result.coverageBounds.minY === result.coverageBounds.maxY, 'vertical bounds zero slack');

  const verification = verifyPlaceholderCoverage({ geometry, transform: result.proposal });
  assert(verification.covered === true, 'same aspect covered');
});

// 4. Noncentral anchor point
runTest('4. noncentral anchor point calculation', () => {
  const geometry = {
    comp: { width: 1000, height: 1000, pixelAspect: 1 },
    source: { width: 2000, height: 1000, pixelAspect: 1, duration: 20, frameRate: 30 },
    layer: {
      threeDLayer: false,
      parentLayerId: null,
      rotation: 0,
      anchorPoint: [100, 200], // noncentral
      transformStatic: true,
      hasMasks: false,
      collapseTransformation: false,
    },
  };

  const sourceRange = [0, 2];
  const frameCount = 60;
  const samples = [
    makeSample(0),
    makeSample(Math.floor((frameCount - 1) / 2) / 30),
    makeSample((frameCount - 1) / 30),
  ];

  const result = proposePlaceholderCover({ geometry, samples, sourceRange });
  assert(result.status === 'proposed', 'proposed for noncentral anchor');
  assert(Math.abs(result.proposal.position[0] - (-400)) < 1e-4, 'ideal posX correctly computed for noncentral anchor');
  assert(Math.abs(result.proposal.position[1] - 200) < 1e-4, 'ideal posY correctly computed for noncentral anchor');

  const verification = verifyPlaceholderCoverage({ geometry, transform: result.proposal });
  assert(verification.covered === true, 'noncentral anchor covers comp');
});

// 5. One-side hole detection
runTest('5. one-side hole verification', () => {
  const geometry = {
    comp: { width: 1000, height: 1000, pixelAspect: 1 },
    source: { width: 2000, height: 1000, pixelAspect: 1, duration: 20, frameRate: 30 },
    layer: {
      threeDLayer: false,
      parentLayerId: null,
      rotation: 0,
      anchorPoint: [100, 200],
      transformStatic: true,
      hasMasks: false,
      collapseTransformation: false,
    },
  };

  // Shift position 50px too far left -> creates hole on right edge
  const badTransform = {
    scale: [100, 100],
    position: [-950, 200],
    anchorPoint: [100, 200],
    rotation: 0,
  };

  const verification = verifyPlaceholderCoverage({ geometry, transform: badTransform });
  assert(verification.covered === false, 'not covered due to hole');
  assert(verification.holes.right === true, 'right edge hole detected');
  assert(verification.holes.left === false, 'left edge has no hole');
  assert(verification.reasons.length > 0, 'reasons explain right hole');
});

// 6. Unequal scale and invalid scale rejection
runTest('6. unequal and invalid scale rejection', () => {
  const geometry = {
    comp: { width: 1920, height: 1080, pixelAspect: 1 },
    source: { width: 1920, height: 1080, pixelAspect: 1, duration: 10, frameRate: 30 },
    layer: {
      threeDLayer: false,
      parentLayerId: null,
      rotation: 0,
      anchorPoint: [960, 540],
      transformStatic: true,
      hasMasks: false,
      collapseTransformation: false,
    },
  };

  const nonUniformTransform = {
    scale: [100, 110], // unequal
    position: [960, 540],
    anchorPoint: [960, 540],
    rotation: 0,
  };

  const verification = verifyPlaceholderCoverage({ geometry, transform: nonUniformTransform });
  assert(verification.eligible === false, 'rejected non-uniform scale');
  assert(verification.status === 'insufficient', 'status is insufficient');
  assert(verification.reasons.some(r => r.includes('uniform')), 'reason mentions non-uniform scale');

  // Boundary scale tests
  for (const badScale of [[], [100], [NaN, NaN], [Infinity, Infinity]]) {
    const res = verifyPlaceholderCoverage({
      geometry,
      transform: { scale: badScale, position: [960, 540], anchorPoint: [960, 540], rotation: 0 },
    });
    assert(res.covered === false, `bad scale ${JSON.stringify(badScale)} not covered`);
  }
});

// 7. Unsupported flags & unknown fields rejection
runTest('7. unsupported flags & unknown fields', () => {
  const baseGeometry = {
    comp: { width: 1920, height: 1080, pixelAspect: 1 },
    source: { width: 1920, height: 1080, pixelAspect: 1, duration: 10, frameRate: 30 },
    layer: {
      threeDLayer: false,
      parentLayerId: null,
      rotation: 0,
      anchorPoint: [960, 540],
      transformStatic: true,
      hasMasks: false,
      collapseTransformation: false,
    },
  };

  const testCases = [
    { key: 'threeDLayer', value: true, desc: '3D layer' },
    { key: 'parentLayerId', value: 12, desc: 'parent layer' },
    { key: 'rotation', value: 45, desc: 'non-zero rotation' },
    { key: 'transformStatic', value: false, desc: 'animated transform' },
    { key: 'hasMasks', value: true, desc: 'layer masks' },
    { key: 'collapseTransformation', value: true, desc: 'collapse transformation' },
  ];

  for (const tc of testCases) {
    const geo = JSON.parse(JSON.stringify(baseGeometry));
    geo.layer[tc.key] = tc.value;
    const res = proposePlaceholderCover({ geometry: geo, sourceRange: [0, 2] });
    assert(res.eligible === false, `propose rejected ${tc.desc}`);
    assert(res.status === 'ineligible', `status ineligible for ${tc.desc}`);

    const ver = verifyPlaceholderCoverage({
      geometry: geo,
      transform: { scale: [100, 100], position: [960, 540], anchorPoint: [960, 540], rotation: 0 },
    });
    assert(ver.eligible === false, `verify rejected ${tc.desc}`);
  }

  // Missing unknown field test
  const incompleteGeo = JSON.parse(JSON.stringify(baseGeometry));
  delete incompleteGeo.layer.transformStatic;
  const incRes = proposePlaceholderCover({ geometry: incompleteGeo, sourceRange: [0, 2] });
  assert(incRes.eligible === false, 'rejected missing transformStatic without default fallback');
});

// 8. Multiple people and shot boxes inconsistent (impossible crop)
runTest('8. multiple people and shot boxes inconsistent -> impossible crop', () => {
  const geometry = {
    comp: { width: 1000, height: 1000, pixelAspect: 1 },
    source: { width: 3000, height: 1000, pixelAspect: 1, duration: 30, frameRate: 30 },
    layer: {
      threeDLayer: false,
      parentLayerId: null,
      rotation: 0,
      anchorPoint: [1500, 500],
      transformStatic: true,
      hasMasks: false,
      collapseTransformation: false,
    },
  };

  const sourceRange = [0, 2];
  const frameCount = 60;
  const samples = [
    makeSample(0, [{ coordinateSpace: 'source_pixels', box: [50, 200, 450, 800], kind: 'person' }], false),
    makeSample(Math.floor((frameCount - 1) / 2) / 30, [], true),
    makeSample((frameCount - 1) / 30, [{ coordinateSpace: 'source_pixels', box: [2550, 200, 2950, 800], kind: 'person' }], false),
  ];

  const target = { compItemId: 10, layerId: 11, sourceItemId: 100 };
  const mediaKey = 'file:c:/synthetic/video_x.mp4';
  const usage = {
    ok: true,
    complete: true,
    sources: [
      { sourceItemId: 100, mediaKey, duration: 30, type: 'footage' },
    ],
    occurrences: [
      { target, rootCompItemId: 10, routeLayerIds: [], rootRange: [0, 5] },
    ],
    entries: [
      { target, sourceItemId: 100, mediaKey, sourceRange: [0, 5], rootRange: [0, 5], rootCompItemId: 10, routeLayerIds: [] },
    ],
  };

  const result = proposePlaceholderCover({
    geometry,
    samples,
    sourceRange,
    marginPixels: 50,
    target,
    usage,
  });

  assert(result.status === 'crop_impossible_for_samples', 'crop detected as impossible for conflicting subjects');
  assert(result.conflict.emptyIntersection === true, 'intersection is empty');
  assert(result.proposal === null, 'no fake proposal generated');
  assert(result.alternatives !== null, 'alternative free intervals proposed');
  assert(result.alternatives.candidates.length > 0, 'free candidates returned for same source');
});

// 9. Proposed offset all samples coverage
runTest('9. proposed offset all samples coverage', () => {
  const geometry = {
    comp: { width: 1000, height: 1000, pixelAspect: 1 },
    source: { width: 2000, height: 1000, pixelAspect: 1, duration: 30, frameRate: 30 },
    layer: {
      threeDLayer: false,
      parentLayerId: null,
      rotation: 0,
      anchorPoint: [1000, 500],
      transformStatic: true,
      hasMasks: false,
      collapseTransformation: false,
    },
  };

  const sourceRange = [0, 2];
  const frameCount = 60;
  const samples = [
    makeSample(0, [{ coordinateSpace: 'source_pixels', box: [200, 300, 600, 800], kind: 'face' }], false),
    makeSample(Math.floor((frameCount - 1) / 2) / 30, [{ coordinateSpace: 'source_pixels', box: [250, 300, 650, 800], kind: 'face' }], false),
    makeSample((frameCount - 1) / 30, [{ coordinateSpace: 'source_pixels', box: [300, 300, 700, 800], kind: 'face' }], false),
  ];

  const result = proposePlaceholderCover({
    geometry,
    samples,
    sourceRange,
    marginPixels: 50,
  });

  assert(result.status === 'proposed', 'offset position proposed');
  assert(result.proposal.position[0] >= 850, 'position shifted to encompass subject within margin');

  const verification = verifyPlaceholderCoverage({ geometry, transform: result.proposal });
  assert(verification.covered === true, 'offset proposal completely covers comp');
});

// 10. Missing samples detection
runTest('10. missing samples detection', () => {
  const geometry = {
    comp: { width: 1920, height: 1080, pixelAspect: 1 },
    source: { width: 1920, height: 1080, pixelAspect: 1, duration: 30, frameRate: 30 },
    layer: {
      threeDLayer: false,
      parentLayerId: null,
      rotation: 0,
      anchorPoint: [960, 540],
      transformStatic: true,
      hasMasks: false,
      collapseTransformation: false,
    },
  };

  // Provide only 1 sample at t=0; missing mid and last
  const samples = [
    makeSample(0),
  ];

  const result = proposePlaceholderCover({
    geometry,
    samples,
    sourceRange: [0, 4],
  });

  assert(result.status === 'needs_sampling', 'status is needs_sampling');
  assert(result.needsSampling === true, 'needsSampling flag is true');
  assert(result.missingSampleTimes.length === 2, 'two missing sample times identified');
  assert(result.artisticReviewPending === true, 'artistic review still pending');
});

// 11. Alternative used duplicate imports & no overlaps
runTest('11. alternative used duplicate imports unification & no overlaps', () => {
  const targetA = { compItemId: 10, layerId: 11 };
  const targetB = { compItemId: 10, layerId: 12 };
  const targetC = { compItemId: 10, layerId: 13 };
  const mediaKey = 'file:c:/synthetic/concert_vid.mp4';
  const usage = {
    ok: true,
    complete: true,
    sources: [
      { sourceItemId: 101, mediaKey, duration: 70, type: 'footage' },
      { sourceItemId: 102, mediaKey, duration: 70, type: 'footage' }, // duplicate import of same mediaKey
    ],
    occurrences: [
      { target: targetA, rootCompItemId: 10, routeLayerIds: [], rootRange: [0, 10] },
      { target: targetB, rootCompItemId: 10, routeLayerIds: [], rootRange: [20, 30] },
      { target: targetC, rootCompItemId: 10, routeLayerIds: [], rootRange: [40, 50] },
    ],
    entries: [
      { target: targetA, sourceItemId: 101, mediaKey, sourceRange: [0, 10], rootRange: [0, 10], rootCompItemId: 10, routeLayerIds: [] },
      { target: targetB, sourceItemId: 102, mediaKey, sourceRange: [20, 30], rootRange: [20, 30], rootCompItemId: 10, routeLayerIds: [] },
      { target: targetC, sourceItemId: 101, mediaKey, sourceRange: [40, 50], rootRange: [40, 50], rootCompItemId: 10, routeLayerIds: [] },
    ],
  };

  const result = proposeAlternativeSourceIntervals({
    usage,
    target: targetC, // unique occurrence
    mediaKey,
    sourceItemId: 101,
    sourceDuration: 70,
    duration: 8,
    excludeRange: [40, 50],
    frameRate: 30,
    maxCandidates: 12,
  });

  assert(result.status === 'candidates_found', 'candidates found');
  assert(result.candidates.length > 0, 'has candidates');

  // Verify none of the candidates overlap with [0, 10], [20, 30], or [40, 50]
  for (const cand of result.candidates) {
    const [s, e] = cand.sourceRange;
    const overlapWithA = s < 10 && e > 0;
    const overlapWithB = s < 30 && e > 20;
    const overlapWithC = s < 50 && e > 40;
    assert(!overlapWithA && !overlapWithB && !overlapWithC, `candidate [${s}, ${e}] has no overlap with used segments`);
    assert(cand.sampleTimes.length === 3, 'candidate contains 3 review sample times');
    assert(cand.needsVisualSampling === true, 'candidate flags needsVisualSampling');
  }
});

// 12. Incomplete usage & shared target handling
runTest('12. incomplete usage & shared target handling', () => {
  const target = { compItemId: 10, layerId: 11 };
  // Case A: incomplete usage
  const incompleteUsage = {
    ok: true,
    complete: false,
    sources: [{ sourceItemId: 100, mediaKey: 'file:c:/synthetic/x.mp4', duration: 60, type: 'footage' }],
    occurrences: [{ target, rootCompItemId: 10, routeLayerIds: [], rootRange: [0, 5] }],
    entries: [],
  };

  const resA = proposeAlternativeSourceIntervals({
    usage: incompleteUsage,
    target,
    mediaKey: 'file:c:/synthetic/x.mp4',
    sourceDuration: 60,
    duration: 5,
    frameRate: 30,
  });
  assert(resA.status === 'unknown', 'incomplete usage returns unknown status');
  assert(resA.candidates.length === 0, 'no candidates for incomplete usage');

  // Case B: multiple structural occurrences of target
  const sharedUsage = {
    ok: true,
    complete: true,
    sources: [{ sourceItemId: 100, mediaKey: 'file:c:/synthetic/y.mp4', duration: 60, type: 'footage' }],
    occurrences: [
      { target, rootCompItemId: 10, routeLayerIds: [], rootRange: [0, 5] },
      { target, rootCompItemId: 20, routeLayerIds: [31], rootRange: [0, 5] },
    ],
    entries: [
      { target, sourceItemId: 100, mediaKey: 'file:c:/synthetic/y.mp4', sourceRange: [0, 5], rootRange: [0, 5], rootCompItemId: 10, routeLayerIds: [] },
    ],
  };

  const resB = proposeAlternativeSourceIntervals({
    usage: sharedUsage,
    target,
    mediaKey: 'file:c:/synthetic/y.mp4',
    sourceDuration: 60,
    duration: 4,
    frameRate: 30,
  });
  assert(resB.status === 'unsupported', 'shared target returns unsupported status');
  assert(resB.candidates.length === 0, 'no candidates for shared target');
});

// 13. Bounds duration & adjacency handling
runTest('13. bounds duration & adjacency', () => {
  const target1 = { compItemId: 10, layerId: 11 };
  const target2 = { compItemId: 10, layerId: 12 };
  const targetNew = { compItemId: 10, layerId: 13 };
  const mediaKey = 'file:c:/synthetic/adj.mp4';
  const usage = {
    ok: true,
    complete: true,
    sources: [
      { sourceItemId: 101, mediaKey, duration: 60, type: 'footage' },
    ],
    occurrences: [
      { target: target1, rootCompItemId: 10, routeLayerIds: [], rootRange: [0, 15] },
      { target: target2, rootCompItemId: 10, routeLayerIds: [], rootRange: [15, 30] },
      { target: targetNew, rootCompItemId: 10, routeLayerIds: [], rootRange: [30, 40] },
    ],
    entries: [
      { target: target1, sourceItemId: 101, mediaKey, sourceRange: [0, 15], rootRange: [0, 15], rootCompItemId: 10, routeLayerIds: [] },
      { target: target2, sourceItemId: 101, mediaKey, sourceRange: [15, 30], rootRange: [15, 30], rootCompItemId: 10, routeLayerIds: [] },
    ],
  };

  const result = proposeAlternativeSourceIntervals({
    usage,
    target: targetNew,
    mediaKey,
    sourceItemId: 101,
    sourceDuration: 60,
    duration: 10,
    frameRate: 30,
    maxCandidates: 12,
  });

  assert(result.status === 'candidates_found', 'candidates found in remaining free space');
  assert(result.candidates.length === 3, 'exactly 3 candidates fit in [30, 60] (30-40, 40-50, 50-60)');
  assert(result.candidates[0].sourceRange[0] === 30, 'first candidate starts at 30, adjacent boundary merged cleanly');
  assert(result.candidates[2].sourceRange[1] === 60, 'last candidate ends at source duration limit');
});

console.log(`\n================================`);
console.log(`Smoke test suite finished: ${passedTests}/${totalTests} assertions passed.`);
if (process.exitCode) {
  console.error('Smoke tests failed!');
} else {
  console.log('All smoke tests PASSED successfully.');
}
