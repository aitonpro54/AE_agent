"use strict";

const crypto = require("node:crypto");
const {
  MANIFEST_SCHEMA,
  MATERIALS_SCHEMA,
  OBSERVATIONS_SCHEMA,
  DEFAULT_HARD_CEILINGS,
  EPSILON,
  isRecord,
  isPositiveInteger,
  isNonNegativeInteger,
  isFiniteNumber,
  isSafeId,
  deepClone,
  sortedSet,
  stableJson,
  normalizeBudgets,
  inspectPayloadSafety,
  addBlocker
} = require("./montage-contract");
const { validateMontageManifest } = require("./montage-manifest");
const { validateObservations, bindTargetObservation, keyOf } = require("./montage-observations");
const { buildPlaceholderPlan } = require("./placeholder-plan-builder");
const { checkPlaceholderAssignments, mediaKeyForSource } = require("./placeholder-usage");
const { resolveReviewTargets } = require("./placeholder-review-service");
const { buildCanonicalCaptureRequirements } = require("./montage-capture-requirements");

const COMPILATION_SCHEMA = "ae-agent-montage-compilation.v1";
const close = (a, b) => isFiniteNumber(a) && isFiniteNumber(b) && Math.abs(a - b) <= EPSILON;
const sha256 = value => crypto.createHash("sha256").update(typeof value === "string" ? value : stableJson(value)).digest("hex");

/**
 * Computes deterministic executable content hash for a unit.
 * Depends strictly on unitId, assignmentId, target, executable plan steps & args, expectedReadBack,
 * material revision & full SHA, ranges, route timing & transform facts, crop subjects, and geometry.
 */
function computeUnitContentHash({
  unitId,
  assignment,
  material,
  rootRange,
  crop,
  geometry,
  plan,
  project,
  manifestRevision,
  materialRevision,
  route
}) {
  const content = {
    unitId: unitId || (assignment ? `${assignment.assignmentId}_rev${manifestRevision || 1}` : undefined),
    assignmentId: assignment?.assignmentId,
    target: assignment?.target ? { compItemId: assignment.target.compItemId, layerId: assignment.target.layerId } : undefined,
    sourceRange: assignment?.sourceRange,
    rootRange,
    routeLayerIds: assignment?.routeLayerIds,
    material: material ? {
      materialId: material.materialId,
      sourceItemId: material.sourceItemId,
      revision: materialRevision,
      sha256: material.sha256,
      byteLength: material.byteLength,
      metadata: material.metadata ? {
        width: material.metadata.width,
        height: material.metadata.height,
        pixelAspect: material.metadata.pixelAspect,
        duration: material.metadata.duration,
        fps: material.metadata.fps
      } : {
        width: material.width,
        height: material.height,
        pixelAspect: material.pixelAspect,
        duration: material.duration,
        fps: material.fps
      }
    } : undefined,
    project: project ? {
      projectFile: project.projectFile,
      projectKey: project.projectKey,
      revision: project.revision
    } : undefined,
    crop: crop ? {
      mode: crop.mode,
      marginPixels: crop.marginPixels,
      samples: (crop.samples || []).map(s => ({
        sourceTime: s.sourceTime,
        coordinateSpace: s.coordinateSpace,
        imageSha256: s.imageSha256,
        noSignificantSubjects: s.noSignificantSubjects === true,
        subjects: Array.isArray(s.subjects) ? s.subjects.map(sub => ({
          kind: sub.kind,
          coordinateSpace: sub.coordinateSpace,
          box: sub.box
        })) : []
      }))
    } : undefined,
    route: Array.isArray(route) ? route.map(r => ({
      edgeId: r.edgeId,
      parentCompItemId: r.parentCompItemId,
      layerId: r.layerId,
      childCompItemId: r.childCompItemId,
      transform: r.transform,
      timing: r.timing
    })) : undefined,
    geometry: geometry ? {
      comp: geometry.comp,
      source: geometry.source,
      layer: {
        anchorPoint: geometry.layer?.anchorPoint,
        position: geometry.layer?.position,
        scale: geometry.layer?.scale,
        rotation: geometry.layer?.rotation
      }
    } : undefined,
    executablePlan: plan ? {
      steps: plan.steps.map(s => ({
        tool: s.tool,
        description: s.description,
        args: s.args
      })),
      expectedReadBack: plan.expectedReadBack,
      placeholderFraming: plan.placeholderFraming,
      placeholderAssignments: plan.placeholderAssignments,
      placeholderConstraints: plan.placeholderConstraints,
      ...(plan.montagePipeline ? {montagePipeline: Object.fromEntries(Object.entries(plan.montagePipeline).filter(([key]) => key !== "unitContentHash"))} : {})
    } : undefined
  };
  return sha256(content);
}

/**
 * Builds release-order DAG and checks for cycles (atomic exchange).
 * If unit A needs a source range currently held by another target that is being replaced by unit B,
 * then B must release that range before A can apply (edge B -> A, so A depends on B).
 */
function buildReleaseOrderDag({ assignments, materials, facts, revision, blockers }) {
  const unitDependencies = new Map();
  const assignmentByTargetKey = new Map();
  const unitIdByAssignmentId = new Map();

  for (const a of assignments) {
    const targetKey = keyOf(a.target);
    assignmentByTargetKey.set(targetKey, a);
    unitIdByAssignmentId.set(a.assignmentId, `${a.assignmentId}_rev${revision}`);
  }

  for (const a of assignments) {
    const unitIdA = unitIdByAssignmentId.get(a.assignmentId);
    if (!unitDependencies.has(unitIdA)) unitDependencies.set(unitIdA, new Set());

    const materialA = materials.get(a.materialId);
    const sourceA = facts.sources.get(materialA?.sourceItemId);
    const mediaKeyA = mediaKeyForSource(sourceA);
    const rangeA = a.sourceRange;
    const targetKeyA = keyOf(a.target);

    for (const entry of facts.usage.entries) {
      const entryTargetKey = keyOf(entry.target);
      if (entryTargetKey === targetKeyA) continue;

      const sameMedia = (entry.mediaKey !== "unknown" && entry.mediaKey === mediaKeyA) ||
        entry.sourceItemId === materialA?.sourceItemId;

      if (sameMedia) {
        const overlapStart = Math.max(rangeA[0], entry.sourceRange[0]);
        const overlapEnd = Math.min(rangeA[1], entry.sourceRange[1]);
        if (overlapStart < overlapEnd) {
          if (assignmentByTargetKey.has(entryTargetKey)) {
            const b = assignmentByTargetKey.get(entryTargetKey);
            const unitIdB = unitIdByAssignmentId.get(b.assignmentId);
            if (unitIdA !== unitIdB) {
              unitDependencies.get(unitIdA).add(unitIdB);
            }
          }
        }
      }
    }
  }

  // Detect cycles via DFS
  const cycles = [];
  const visited = new Set();
  const visiting = new Set();
  const path = [];

  function dfs(node) {
    visiting.add(node);
    path.push(node);

    const deps = unitDependencies.get(node) || new Set();
    for (const dep of deps) {
      if (visiting.has(dep)) {
        const cycleStartIndex = path.indexOf(dep);
        cycles.push(path.slice(cycleStartIndex));
      } else if (!visited.has(dep)) {
        dfs(dep);
      }
    }

    path.pop();
    visiting.delete(node);
    visited.add(node);
  }

  for (const node of unitDependencies.keys()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  if (cycles.length > 0) {
    addBlocker(blockers, "unsupported_atomic_exchange", "manifest.assignments", {
      cycles: cycles.map(c => [...c, c[0]])
    });
    return { unitDependencies, topologicalOrder: [], hasCycle: true };
  }

  // Kahn's algorithm for deterministic topological order
  const inDegree = new Map();
  const reverseAdj = new Map();

  for (const [node, deps] of unitDependencies.entries()) {
    inDegree.set(node, deps.size);
    for (const dep of deps) {
      if (!reverseAdj.has(dep)) reverseAdj.set(dep, []);
      reverseAdj.get(dep).push(node);
    }
  }

  const readyQueue = [];
  for (const [node, deg] of inDegree.entries()) {
    if (deg === 0) readyQueue.push(node);
  }
  readyQueue.sort();

  const topologicalOrder = [];
  while (readyQueue.length > 0) {
    const current = readyQueue.shift();
    topologicalOrder.push(current);

    const dependents = reverseAdj.get(current) || [];
    dependents.sort();
    for (const depNode of dependents) {
      const newDeg = inDegree.get(depNode) - 1;
      inDegree.set(depNode, newDeg);
      if (newDeg === 0) {
        readyQueue.push(depNode);
        readyQueue.sort();
      }
    }
  }

  return { unitDependencies, topologicalOrder, hasCycle: false };
}

/**
 * Sequentially simulates applying each unit in topological order to verify
 * no sequential collision against intermediate usage states.
 */
function simulateSequentialUsage({ orderedUnits, facts, blockers }) {
  const simUsage = deepClone(facts.usage);

  for (const unit of orderedUnits) {
    const a = unit.assignment;
    const material = unit.material;
    const source = facts.sources.get(material.sourceItemId);
    const mediaKey = mediaKeyForSource(source);

    const preparedAssign = {
      target: a.target,
      sourceItemId: material.sourceItemId,
      mediaKey,
      sourceRange: a.sourceRange,
      groupId: a.groupId
    };

    const checked = checkPlaceholderAssignments({
      usage: simUsage,
      assignments: [preparedAssign],
      constraints: {
        distinctGroups: true,
        disallowSourceOverlap: true,
        selectedTargets: [a.target]
      }
    });

    if (!checked.ok || !checked.valid) {
      addBlocker(blockers, "sequential_simulation_failed", `manifest.assignments.${a.assignmentId}`, {
        unitId: unit.unitId,
        reason: checked.reason,
        conflicts: checked.conflicts
      });
      return false;
    }

    const targetKey = keyOf(a.target);
    simUsage.entries = simUsage.entries.filter(e => keyOf(e.target) !== targetKey);
    simUsage.entries.push({
      target: { compItemId: a.target.compItemId, layerId: a.target.layerId },
      sourceItemId: material.sourceItemId,
      mediaKey,
      sourceRange: [...a.sourceRange],
      rootRange: [...unit.rootRange],
      rootCompItemId: unit.scene.rootCompItemId
    });

    for (const occ of simUsage.occurrences) {
      if (keyOf(occ.target) === targetKey) {
        occ.sourceItemId = material.sourceItemId;
      }
    }
  }

  return true;
}

/**
 * Builds review packets and partitions targets/samples deterministically.
 * Tests compatibility using resolveReviewTargets on predicted post-mutation inventory.
 */
function buildReviewPackets({ units, scenes, manifest, observations, budgets, blockers }) {
  const maxTargetsPerPacket = 4;
  const maxViewsPerPacket = 24;
  const maxStepsBudget = Math.min(50, budgets.maxSteps);
  const allowedViews = Math.min(maxViewsPerPacket, maxStepsBudget - 3);
  const allowedSamplesPerPacket = allowedViews;

  if (allowedSamplesPerPacket < 3) {
    addBlocker(blockers, "review_packet_steps_exceeds_budget", "budgets.maxSteps", {
      maxSteps: budgets.maxSteps,
      requiredMinSteps: 6
    });
    return [];
  }

  const predictedInventory = deepClone(observations.inventory);
  for (const unit of units) {
    const step0 = unit.plan.steps.find(s => s.tool === "replace_layer_source");
    const step1 = unit.plan.steps.find(s => s.tool === "set_layer_time_range");
    const comp = predictedInventory.comps.find(c => c.itemId === step0.args.expectedCompItemId);
    if (comp) {
      const layer = comp.layers.find(l => l.id === step0.args.expectedLayerId);
      if (layer) {
        layer.sourceItemId = step0.args.expectedSourceItemId;
        layer.startTime = step1.args.startTime;
        layer.inPoint = step1.args.inPoint;
        layer.outPoint = step1.args.outPoint;
      }
    }
  }

  const targetReviewRequests = [];
  for (const unit of units) {
    const a = unit.assignment;
    const scene = scenes.get(a.sceneId);
    const rootRange = unit.rootRange;
    const sourceRange = a.sourceRange;
    const frameRate = scene.fps;
    const frameCount = Math.round((rootRange[1] - rootRange[0]) * frameRate);
    const timingStep = unit.plan.steps[1].args;
    const inPoint = timingStep.inPoint !== undefined ? timingStep.inPoint : unit.expectedReadBack.inPoint;
    const stretch = unit.verificationBindings?.target?.layer?.stretch !== undefined
      ? unit.verificationBindings.target.layer.stretch
      : (unit.expectedReadBack?.stretch !== undefined ? unit.expectedReadBack.stretch : 100);
    const k = stretch / 100;

    const offsetFirst = 0;
    const offsetMid = Math.floor((frameCount - 1) / 2);
    const offsetLast = frameCount - 1;

    const timeFirst = rootRange[0] + offsetFirst / frameRate;
    const timeMid = rootRange[0] + offsetMid / frameRate;
    const timeLast = rootRange[0] + offsetLast / frameRate;

    const framesForAssign = manifest.frameCoverage.filter(f => f.assignmentId === a.assignmentId);
    const samplesByTime = new Map();

    function addSample(rootTime, role, frameId, isAnchor = false) {
      const key = String(Math.round(rootTime*frameRate));
      const targetTime = inPoint + (rootTime - rootRange[0]);
      const sourceTime = sourceRange[0] + (rootTime - rootRange[0]) / k;
      if (!samplesByTime.has(key)) {
        samplesByTime.set(key, {
          rootTime,
          targetTime,
          sourceTime,
          roles: new Set(),
          frameIds: new Set(),
          isAnchor
        });
      }
      const record = samplesByTime.get(key);
      record.roles.add(role);
      if (frameId) record.frameIds.add(frameId);
      if (isAnchor) record.isAnchor = true;
    }

    const frameFirst = framesForAssign.find(f => Math.abs(f.rootTime - timeFirst) < EPSILON);
    const frameMid = framesForAssign.find(f => Math.abs(f.rootTime - timeMid) < EPSILON);
    const frameLast = framesForAssign.find(f => Math.abs(f.rootTime - timeLast) < EPSILON);

    addSample(timeFirst, "first", frameFirst?.frameId, true);
    addSample(timeMid, "middle", frameMid?.frameId, true);
    addSample(timeLast, "last", frameLast?.frameId, true);

    for (const f of framesForAssign) {
      const allowedRole = f.roles.includes("first") ? "first" :
        f.roles.includes("middle") ? "middle" :
        f.roles.includes("last") ? "last" : "shot";
      addSample(f.rootTime, allowedRole, f.frameId, false);
    }

    const allSamples = Array.from(samplesByTime.values()).sort((a, b) => a.rootTime - b.rootTime);
    const anchorSamples = allSamples.filter(s => s.isAnchor);
    const nonAnchorSamples = allSamples.filter(s => !s.isAnchor);

    targetReviewRequests.push({
      unitId: unit.unitId,
      assignmentId: a.assignmentId,
      target: { compItemId: a.target.compItemId, layerId: a.target.layerId },
      targetKey: keyOf(a.target),
      rootCompItemId: scene.rootCompItemId,
      routeLayerIds: a.routeLayerIds,
      anchorSamples,
      nonAnchorSamples
    });
  }

  const targetSlices = [];
  for (const tr of targetReviewRequests) {
    const nonAnchors = [...tr.nonAnchorSamples];
    const maxNonAnchorsPerSlice = allowedSamplesPerPacket - tr.anchorSamples.length;

    if (nonAnchors.length > 0 && maxNonAnchorsPerSlice <= 0) {
      addBlocker(blockers, "review_packet_samples_cannot_fit", "budgets.maxSteps", {
        unitId: tr.unitId,
        targetKey: tr.targetKey,
        anchorCount: tr.anchorSamples.length,
        allowedSamplesPerPacket
      });
      return [];
    }

    if (nonAnchors.length === 0) {
      targetSlices.push({
        unitId: tr.unitId,
        assignmentId: tr.assignmentId,
        target: tr.target,
        targetKey: tr.targetKey,
        rootCompItemId: tr.rootCompItemId,
        routeLayerIds: tr.routeLayerIds,
        samples: tr.anchorSamples,
        isPartitionRepeat: false
      });
    } else {
      let sliceIndex = 0;
      while (nonAnchors.length > 0) {
        const sliceNonAnchors = nonAnchors.splice(0, maxNonAnchorsPerSlice);
        const combined = [...tr.anchorSamples, ...sliceNonAnchors].sort((a, b) => a.rootTime - b.rootTime);
        targetSlices.push({
          unitId: tr.unitId,
          assignmentId: tr.assignmentId,
          target: tr.target,
          targetKey: tr.targetKey,
          rootCompItemId: tr.rootCompItemId,
          routeLayerIds: tr.routeLayerIds,
          samples: combined,
          isPartitionRepeat: sliceIndex > 0
        });
        sliceIndex++;
      }
    }
  }

  const packets = [];
  for (const slice of targetSlices) {
    let placed = false;
    for (const pkt of packets) {
      if (pkt.targets.length < maxTargetsPerPacket &&
          pkt.sampleCount + slice.samples.length <= allowedSamplesPerPacket &&
          !pkt.targetKeys.has(slice.targetKey)) {
        pkt.targets.push(slice);
        pkt.targetKeys.add(slice.targetKey);
        pkt.sampleCount += slice.samples.length;
        placed = true;
        break;
      }
    }
    if (!placed) {
      packets.push({
        targets: [slice],
        targetKeys: new Set([slice.targetKey]),
        sampleCount: slice.samples.length
      });
    }
  }

  const reviewPackets = [];
  for (let i = 0; i < packets.length; i++) {
    const pkt = packets[i];
    const packetId = `review_packet_${i + 1}`;
    const packetUnitIds = new Set();
    const packetFrameIds = new Set();
    const reviewTargetsInput = [];

    for (const tr of pkt.targets) {
      packetUnitIds.add(tr.unitId);
      const reqSamples = tr.samples.map(s => {
        for (const fid of s.frameIds) packetFrameIds.add(fid);
        return {
          rootTime: s.rootTime,
          targetTime: s.targetTime,
          sourceTime: s.sourceTime,
          roles: Array.from(s.roles)
        };
      });

      reviewTargetsInput.push({
        target: tr.target,
        rootCompItemId: tr.rootCompItemId,
        routeLayerIds: tr.routeLayerIds,
        viewKinds: ["root_comp"],
        samples: reqSamples
      });
    }

    try {
      resolveReviewTargets({ targets: reviewTargetsInput }, predictedInventory);
    } catch (err) {
      addBlocker(blockers, "review_packet_incompatible", `reviewPackets[${i}]`, {
        error: err.code || err.message,
        packetId
      });
    }

    const totalViews = pkt.sampleCount;
    const totalSteps = totalViews + 3;

    reviewPackets.push({
      packetId,
      builderTool: "build_placeholder_visual_review_plan",
      inputs: {
        targets: reviewTargetsInput
      },
      dependsOn: Array.from(packetUnitIds).sort(),
      frameIds: Array.from(packetFrameIds).sort(),
      requiresFreshBuild: true,
      budget: {
        targetCount: reviewTargetsInput.length,
        sampleCount: pkt.sampleCount,
        viewCount: totalViews,
        stepCount: totalSteps,
        maxSteps: budgets.maxSteps
      }
    });
  }

  return reviewPackets;
}

/**
 * Pure compiler: transforms validated manifest and observations into deterministic
 * execution units and review packets without calling AE, fs, network, or models.
 */
function compileMontagePipeline(input = {}) {
  const blockers = [];
  let budgets = DEFAULT_HARD_CEILINGS;

  const blockedResponse = () => ({
    ok: false,
    readiness: "blocked",
    schema: COMPILATION_SCHEMA,
    manifestHash: null,
    materialsHash: null,
    evidenceHash: null,
    project: null,
    requiresFreshEvidenceReview: true,
    units: [],
    reviewPackets: [],
    affectedScenes: [],
    blockers,
    budgets
  });

  try {
    if (!isRecord(input)) {
      addBlocker(blockers, "invalid_input_container", "input");
      return blockedResponse();
    }

    // Caller budgets normalization
    let callerBudgets = null;
    if (input.budgets !== undefined) {
      const norm = normalizeBudgets(input.budgets);
      if (norm.blockers.length > 0) {
        for (const b of norm.blockers) blockers.push(b);
        return blockedResponse();
      }
      callerBudgets = norm.budgets;
    }

    // Preserve any existing failed blockers from validated input
    if (input.validated !== undefined) {
      if (!isRecord(input.validated)) {
        addBlocker(blockers, "invalid_validated_container", "validated");
        return blockedResponse();
      }
      if (Array.isArray(input.validated.blockers) && input.validated.blockers.length > 0) {
        for (const b of input.validated.blockers) blockers.push(b);
      }
      if (input.validated.ok === false || input.validated.readiness === "blocked") {
        budgets = input.validated.budgets || DEFAULT_HARD_CEILINGS;
        return blockedResponse();
      }
    }

    // Compute effective budgets: min of validated.budgets and callerBudgets
    let effectiveBudgets = DEFAULT_HARD_CEILINGS;
    if (input.validated && isRecord(input.validated.budgets)) {
      effectiveBudgets = { ...input.validated.budgets };
    }
    if (callerBudgets) {
      const combined = { ...effectiveBudgets };
      for (const [k, v] of Object.entries(callerBudgets)) {
        if (combined[k] === undefined || v < combined[k]) {
          combined[k] = v;
        }
      }
      effectiveBudgets = Object.freeze(combined);
    }
    budgets = effectiveBudgets;

    // Reconstruct strict manifest and catalog to revalidate against observations and effective budgets
    let manifestToValidate;
    let materialsToValidate;
    const observationsToValidate = input.observations;

    if (input.validated && isRecord(input.validated.normalized)) {
      const reconstructedManifest = deepClone(input.validated.normalized);
      delete reconstructedManifest.materials;
      manifestToValidate = reconstructedManifest;

      if (isRecord(input.validated.preparedMaterials)) {
        materialsToValidate = deepClone(input.validated.preparedMaterials);
      } else if (Array.isArray(input.validated.normalized.materials)) {
        materialsToValidate = {
          schema: MATERIALS_SCHEMA,
          revision: 1,
          materials: deepClone(input.validated.normalized.materials)
        };
      } else if (isRecord(input.materials)) {
        materialsToValidate = deepClone(input.materials);
      }
    } else {
      manifestToValidate = input.manifest;
      materialsToValidate = input.materials;
    }

    const validationResult = validateMontageManifest({
      manifest: manifestToValidate,
      materials: materialsToValidate,
      observations: observationsToValidate,
      budgets: effectiveBudgets
    });

    if (!validationResult.ok || validationResult.readiness !== "ready") {
      for (const b of validationResult.blockers || []) {
        blockers.push(b);
        if (b.code === "unsupported_shared_target" && b.details?.identicalIntent === false) {
          addBlocker(blockers, "conflicting_target_intent", b.path, b.details);
        }
      }
      budgets = validationResult.budgets || effectiveBudgets;
      return blockedResponse();
    }

    budgets = validationResult.budgets;
    const manifest = validationResult.normalized;
    const catalog = validationResult.preparedMaterials;
    const observations = observationsToValidate;

    if (!isRecord(observations)) {
      addBlocker(blockers, "missing_observations", "observations");
      return blockedResponse();
    }

    const materialsMap = new Map();
    for (const m of catalog.materials) materialsMap.set(m.materialId, m);

    const facts = validateObservations({ observations, manifest, materials: materialsMap, budgets, blockers });
    if (blockers.length > 0) return blockedResponse();

    const scenesMap = new Map();
    for (const s of manifest.scenes) scenesMap.set(s.sceneId, s);

    // Check for duplicate target intents across assignments
    const targetsSeen = new Map();
    for (const a of manifest.assignments) {
      const targetKey = keyOf(a.target);
      const scene = scenesMap.get(a.sceneId);
      const rootRange = a.rootRange === undefined ? scene?.rootRange : a.rootRange;
      const currentIntent = { materialId: a.materialId, sourceRange: a.sourceRange, rootRange, crop: a.crop };

      if (targetsSeen.has(targetKey)) {
        const firstIntent = targetsSeen.get(targetKey);
        const identical = stableJson(firstIntent) === stableJson(currentIntent);
        if (!identical) {
          addBlocker(blockers, "conflicting_target_intent", `manifest.assignments.${a.assignmentId}.target`, { target: a.target });
        } else {
          addBlocker(blockers, "unsupported_shared_target", `manifest.assignments.${a.assignmentId}.target`, { identicalIntent: true });
        }
      } else {
        targetsSeen.set(targetKey, currentIntent);
      }
    }

    // Global bounded assignments check
    const preparedAll = [];
    for (const a of manifest.assignments) {
      const material = materialsMap.get(a.materialId);
      const source = facts.sources.get(material?.sourceItemId);
      const mediaKey = mediaKeyForSource(source);
      preparedAll.push({
        target: a.target,
        sourceItemId: material?.sourceItemId,
        mediaKey,
        sourceRange: a.sourceRange,
        groupId: a.groupId
      });
    }

    const checkedAll = checkPlaceholderAssignments({
      usage: facts.usage,
      assignments: preparedAll,
      constraints: {
        distinctGroups: true,
        disallowSourceOverlap: true,
        selectedTargets: preparedAll.map(a => a.target)
      }
    });

    if (!checkedAll.ok || !checkedAll.valid) {
      for (const conflict of [...(checkedAll.conflicts || []), ...(checkedAll.unsupported || []), ...(checkedAll.unknownGroups || [])]) {
        addBlocker(blockers, conflict.type || "placeholder_usage_conflict", "manifest.assignments", conflict);
      }
      if (!checkedAll.conflicts?.length && !checkedAll.unsupported?.length && !checkedAll.unknownGroups?.length) {
        addBlocker(blockers, "placeholder_usage_failed", "manifest.assignments", { reason: checkedAll.reason });
      }
    }

    if (blockers.length > 0) return blockedResponse();

    // Release-order DAG & Cycle detection
    const { unitDependencies, topologicalOrder, hasCycle } = buildReleaseOrderDag({
      assignments: manifest.assignments,
      materials: materialsMap,
      facts,
      revision: manifest.revision,
      blockers
    });

    if (hasCycle || blockers.length > 0) return blockedResponse();

    // Construct units
    const unitMap = new Map();
    for (const a of manifest.assignments) {
      const scene = scenesMap.get(a.sceneId);
      const material = materialsMap.get(a.materialId);
      const rootRange = a.rootRange === undefined ? scene.rootRange : a.rootRange;
      const unitId = `${a.assignmentId}_rev${manifest.revision}`;

      const bound = bindTargetObservation({
        assignment: a,
        scene,
        material,
        facts,
        blockers,
        path: `manifest.assignments.${a.assignmentId}`,
        fps: scene.fps
      });

      if (!bound) continue;

      const boundaries = [];
      let prevEnd = a.sourceRange[0];
      for (let i = 0; i < a.shots.length - 1; i++) {
        prevEnd = a.shots[i].sourceRange[1];
        boundaries.push(prevEnd);
      }

      const planResult = buildPlaceholderPlan({
        rootComp: bound.root,
        targetComp: bound.comp,
        targetLayer: bound.layer,
        sourceItem: bound.source,
        route: bound.observed.route,
        rootRange,
        sourceRange: a.sourceRange,
        framing: {
          geometry: bound.observed.geometry,
          samples: a.crop.samples,
          shotBoundaries: boundaries,
          marginPixels: a.crop.marginPixels
        },
        constraints: {
          distinctGroups: true,
          disallowSourceOverlap: true,
          selectedTargets: [a.target]
        }
      });

      if (!planResult.ok) {
        addBlocker(blockers, "placeholder_plan_failed", `manifest.assignments.${a.assignmentId}`, { code: planResult.code }, { assignmentId: a.assignmentId });
        continue;
      }

      const plan = planResult.plan;
      // The ordinary proposal captures this exact saved-project binding. Include
      // it in preview plans so canonical run records retain exact plan identity.
      plan.targetProject = {file:manifest.project.projectFile};
      if (plan.expectedReadBack.transform) plan.expectedReadBack.transform.opacity = bound.observed.transform.opacity;
      if (plan.steps.length > budgets.maxSteps || plan.steps.length > 50) {
        addBlocker(blockers, "plan_steps_exceeds_budget", `manifest.assignments.${a.assignmentId}`);
        continue;
      }

      const verificationBindings = {
        affineScope: observations.targets.filter(t=>t.targetLayer?.stretch!==100).map(t=>({target:deepClone(t.target),targetLayer:deepClone(t.targetLayer),
          geometry:deepClone(t.geometry),transform:deepClone(t.transform),footprint:deepClone(t.footprint),route:deepClone(t.route),
          plannedSourceItemId:materialsMap.get(manifest.assignments.find(x=>keyOf(x.target)===keyOf(t.target))?.materialId)?.sourceItemId})),
        material: {
          materialId: a.materialId,
          sourceItemId: material.sourceItemId,
          path: material.path,
          sha256: material.sha256,
          byteLength: material.byteLength,
          provenance: material.provenance,
          metadata: {
            width: material.width,
            height: material.height,
            pixelAspect: material.pixelAspect,
            duration: material.duration,
            fps: material.fps
          }
        },
        target: {
          compItemId: a.target.compItemId,
          layerId: a.target.layerId,
          footprint: deepClone(bound.observed.footprint),
          layer: deepClone(bound.observed.targetLayer),
          geometry: deepClone(bound.observed.geometry),
          transform: deepClone(bound.observed.transform)
        },
        materialSource: {itemId:bound.source.itemId,name:bound.source.name,file:bound.source.file,
          footageMissing:bound.source.footageMissing,width:bound.source.width,height:bound.source.height,
          pixelAspect:bound.source.pixelAspect,duration:bound.source.duration,frameRate:bound.source.frameRate},
        route: deepClone(bound.observed.route || []),
        geometry: deepClone(bound.observed.geometry || null),
        project: {
          projectFile: manifest.project.projectFile,
          projectKey: manifest.project.projectKey,
          revision: manifest.project.revision
        }
      };

      plan.montagePipeline = {
        unitId,
        intent: {assignment:deepClone(a),rootRange:deepClone(rootRange),rootCompItemId:bound.root.itemId},
        manifestRevision: manifest.revision,
        materialRevision: catalog.revision,
        materialId: a.materialId,
        sourceItemId: material.sourceItemId,
        path: material.path,
        sha256: material.sha256,
        byteLength: material.byteLength,
        provenance: material.provenance,
        route: deepClone(bound.observed.route || []),
        metadata: {
          width: material.width,
          height: material.height,
          pixelAspect: material.pixelAspect,
          duration: material.duration,
          fps: material.fps
        },
        budget: {
          stepCount: plan.steps.length,
          maxSteps: budgets.maxSteps
        },
        project: {
          projectFile: manifest.project.projectFile,
          projectKey: manifest.project.projectKey,
          revision: manifest.project.revision
        },
        verificationBindings
      };
      if (bound.observed.protection.policyHash) plan.montagePipeline.policyHash = bound.observed.protection.policyHash;
      plan.montagePipeline.readBudgets = deepClone(budgets);

      // Coverage and its exact mapping are executable intent. Persist them before
      // unit hashing so a stored application record is the capture authority.
      const frameRequirements = manifest.frameCoverage.filter(f => f.assignmentId === a.assignmentId);
      const capture = buildCanonicalCaptureRequirements({unitId,assignment:a,scene,frames:frameRequirements,
        expectedReadBack:plan.expectedReadBack,route:bound.observed.route || [],project:manifest.project,
        manifestRevision:manifest.revision,materialRevision:catalog.revision,manifestHash:sha256(manifest),materialsHash:sha256(catalog),
        policyHash:plan.montagePipeline.policyHash,material:verificationBindings.material});
      if(!capture.ok) {
        addBlocker(blockers,capture.reason,`manifest.assignments.${a.assignmentId}`,undefined,{assignmentId:a.assignmentId});
        continue;
      }
      plan.montagePipeline.captureRequirements=capture.requirements;

      const contentHash = computeUnitContentHash({
        unitId,
        assignment: a,
        material,
        rootRange,
        crop: a.crop,
        geometry: bound.observed.geometry,
        plan,
        project: manifest.project,
        manifestRevision: manifest.revision,
        materialRevision: catalog.revision,
        route: bound.observed.route
      });
      plan.montagePipeline.unitContentHash = contentHash;

      const unit = {
        unitId,
        assignmentIds: [a.assignmentId],
        kind: "application",
        dependsOn: Array.from(unitDependencies.get(unitId) || []).sort(),
        plan,
        contentHash,
        expectedReadBack: plan.expectedReadBack,
        frameRequirements,
        budget: {
          stepCount: plan.steps.length,
          maxSteps: budgets.maxSteps
        },
        assignment: a,
        material,
        scene,
        rootRange,
        verificationBindings
      };

      unitMap.set(unitId, unit);
    }

    if (blockers.length > 0) return blockedResponse();

    // Order units topologically
    const orderedUnits = topologicalOrder.map(uid => unitMap.get(uid)).filter(Boolean);

    // Current-usage simulation
    const simOk = simulateSequentialUsage({ orderedUnits, facts, blockers });
    if (!simOk || blockers.length > 0) return blockedResponse();

    // Review packets
    const reviewPackets = buildReviewPackets({
      units: orderedUnits,
      scenes: scenesMap,
      manifest,
      observations,
      budgets,
      blockers
    });

    if (blockers.length > 0) return blockedResponse();

    // Strip internal working fields from output units
    const cleanUnits = orderedUnits.map(u => ({
      unitId: u.unitId,
      assignmentIds: u.assignmentIds,
      kind: u.kind,
      dependsOn: u.dependsOn,
      plan: u.plan,
      contentHash: u.contentHash,
      expectedReadBack: u.expectedReadBack,
      frameRequirements: u.frameRequirements,
      budget: u.budget,
      verificationBindings: u.verificationBindings
    }));

    const affectedScenes = [...new Set(manifest.assignments.map(a => a.sceneId))].sort();

    const manifestHash = sha256(manifest);
    const materialsHash = sha256(catalog);
    const evidenceHash = sha256(observations);
    const rootPackets=require("./montage-root-png").buildPerUseRootPackets({reviewPackets,units:cleanUnits,manifest,budgets});
    if(!rootPackets.ok){blockers.push(...rootPackets.blockers);return blockedResponse();}

    return {
      ok: true,
      readiness: "ready",
      schema: COMPILATION_SCHEMA,
      manifestHash,
      materialsHash,
      evidenceHash,
      project: deepClone(manifest.project),
      requiresFreshEvidenceReview: true,
      units: cleanUnits,
      reviewPackets,
      rootPngPackets:rootPackets.packets,
      affectedScenes,
      blockers: [],
      budgets
    };
  } catch (error) {
    addBlocker(blockers, "malformed_compilation_error", "compiler", { message: error.message });
    return blockedResponse();
  }
}

module.exports = {
  COMPILATION_SCHEMA,
  compileMontagePipeline,
  computeUnitContentHash,
  buildReleaseOrderDag,
  simulateSequentialUsage,
  buildReviewPackets
};
