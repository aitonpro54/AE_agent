"use strict";

const isId = (value) => Number.isSafeInteger(value) && value > 0;
const isTime = (value) => typeof value === "number" && Number.isFinite(value);
// Interval boundaries must retain their precision: even a sub-microsecond
// overlap is real. Formatting must never change the occupancy calculation.
const exactTime = (t) => t;

const MAX_SAFE_NODES = 20000;
const MAX_SAFE_DEPTH = 50;
const VERIFIED_NON_VIDEO_KINDS = new Set(["text", "shape", "camera", "light", "adjustment"]);
const VERIFIED_NON_VIDEO_SOURCE_TYPES = new Set(["solid", "still", "audio"]);
const ALLOWED_PROVENANCES = new Set(["explicit_metadata", "user_confirmed"]);

/**
 * Unified parser for explicit native paths, file URIs, and canonical media keys.
 * Handles Windows drive, file URI schemes (including file:/// and file://server/share),
 * UNC paths, dot segments (., ..), and slash collapse.
 * Absolute explicit paths only.
 * Windows drive and UNC paths are case-insensitive (normalized to lowercase).
 * POSIX absolute paths are case-sensitive.
 * Lexical path resolution only (symlink aliases and physical inode unknown without realpath).
 *
 * Emits canonical keys: "file:<canonical_path>" or "file:unc://server/share/path".
 * Preserves percent bytes in raw native paths and canonical keys (URI-decodes only actual URIs).
 *
 * @param {string} input
 * @param {boolean} [returnKey=false] If true returns the canonical media key, else the normalized path
 * @returns {string|null} Normalized lexical path/key or null if invalid/relative
 */
function parseAndNormalizePath(input, returnKey = false) {
  if (typeof input !== "string") return null;
  let p = input.trim();
  if (!p) return null;

  let isWindows = false;
  let isUNC = false;
  let isURI = false;
  let prefix = "";
  let remainder = "";

  // 1. Canonical keys detection (idempotent, preserve percent bytes)
  if (/^file:[a-zA-Z]:[\\\/]/i.test(p)) {
    // Windows canonical key: file:c:/...
    isWindows = true;
    isURI = false;
    p = p.slice(5);
    prefix = p.slice(0, 2);
    remainder = p.slice(2);
  } else if (/^file:\/(?![a-zA-Z]:[\\\/])[^\/]/i.test(p)) {
    // POSIX canonical key: file:/posix/...
    isWindows = false;
    isURI = false;
    p = p.slice(5);
    prefix = "";
    remainder = p;
  } else if (/^file:unc:\/\/([^\/\\]+)[\/\\]([^\/\\]+)(.*)$/i.test(p)) {
    // Canonical UNC key has a distinct marker; file://... is always a raw URI.
    isUNC = true;
    isWindows = true;
    isURI = false;
    const m = p.match(/^file:unc:\/\/([^\/\\]+)[\/\\]([^\/\\]+)(.*)$/i);
    prefix = "//" + m[1] + "/" + m[2];
    remainder = m[3] || "";
  }
  // 2. File URIs detection (URI-decode encoded bytes like %20)
  else if (/^file:\/\/\/(localhost\/)?([a-zA-Z]:[\\\/].*)$/i.test(p)) {
    isWindows = true;
    isURI = true;
    const m = p.match(/^file:\/\/\/(localhost\/)?([a-zA-Z]:[\\\/].*)$/i);
    p = m[2];
    prefix = p.slice(0, 2);
    remainder = p.slice(2);
  } else if (/^file:\/\/localhost\/([a-zA-Z]:[\\\/].*)$/i.test(p)) {
    isWindows = true;
    isURI = true;
    const m = p.match(/^file:\/\/localhost\/([a-zA-Z]:[\\\/].*)$/i);
    p = m[1];
    prefix = p.slice(0, 2);
    remainder = p.slice(2);
  } else if (/^file:\/([a-zA-Z]:[\\\/].*)$/i.test(p)) {
    isWindows = true;
    isURI = true;
    const m = p.match(/^file:\/([a-zA-Z]:[\\\/].*)$/i);
    p = m[1];
    prefix = p.slice(0, 2);
    remainder = p.slice(2);
  } else if (/^file:\/\/\/(localhost\/)?([^\/\\\/].*)$/i.test(p)) {
    isWindows = false;
    isURI = true;
    const m = p.match(/^file:\/\/\/(localhost\/)?([^\/\\\/].*)$/i);
    prefix = "";
    remainder = "/" + m[2];
  } else if (/^file:\/\/localhost\/(.*)$/i.test(p)) {
    isWindows = false;
    isURI = true;
    const m = p.match(/^file:\/\/localhost\/(.*)$/i);
    prefix = "";
    remainder = "/" + m[1].replace(/^\/+/, "");
  } else if (/^file:\/\/([^\/\\]+)[\/\\]([^\/\\]+)(.*)$/i.test(p)) {
    // Raw UNC file URI: decode once, including escaped share-name characters.
    isUNC = true;
    isWindows = true;
    isURI = true;
    const m = p.match(/^file:\/\/([^\/\\]+)[\/\\]([^\/\\]+)(.*)$/i);
    prefix = "//" + m[1] + "/" + m[2];
    remainder = m[3] || "";
  }
  // 3. Raw native paths detection (no URI-decode, preserve percent bytes)
  else if (/^[\\\/]{2}([^\/\\\/]+)[\/\\\/]([^\/\\\/]+)(.*)$/.test(p)) {
    isUNC = true;
    isWindows = true;
    isURI = false;
    const m = p.match(/^[\\\/]{2}([^\/\\\/]+)[\/\\\/]([^\/\\\/]+)(.*)$/);
    prefix = "//" + m[1] + "/" + m[2];
    remainder = m[3] || "";
  } else if (/^[a-zA-Z]:([\\\/]|$)/.test(p)) {
    isWindows = true;
    isURI = false;
    prefix = p.slice(0, 2);
    remainder = p.slice(2);
  } else if (/^\/[^\\\/]/.test(p)) {
    isWindows = false;
    isURI = false;
    prefix = "";
    remainder = p;
  } else {
    // Relative path or unrecognized scheme
    return null;
  }

  // URI-decode only when input was an actual file URI
  if (isURI) {
    try {
      if (prefix.includes("%")) prefix = decodeURIComponent(prefix);
      if (remainder.includes("%")) remainder = decodeURIComponent(remainder);
    } catch (_) {
      return null;
    }
  }

  remainder = remainder.replace(/\\/g, "/");
  if (remainder.startsWith("/")) {
    remainder = remainder.slice(1);
  }

  const segments = remainder.split("/");
  const resolved = [];
  for (const seg of segments) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      if (resolved.length > 0) {
        resolved.pop();
      }
    } else {
      resolved.push(seg);
    }
  }

  let normalized = "";
  if (isUNC) {
    normalized = prefix.toLowerCase() + (resolved.length > 0 ? "/" + resolved.join("/").toLowerCase() : "");
  } else if (isWindows) {
    normalized = prefix.toLowerCase() + "/" + resolved.join("/").toLowerCase();
    if (normalized.length > 3 && normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
  } else {
    normalized = "/" + resolved.join("/");
    if (normalized.length > 1 && normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
  }

  if (!normalized) return null;
  return returnKey ? `file:${isUNC ? "unc:" : ""}${normalized}` : normalized;
}

/**
 * Normalizes a raw file path into a canonical cross-platform lexical representation.
 *
 * @param {string} rawPath
 * @returns {string|null} Normalized lexical path or null if invalid/relative
 */
function normalizeFilePath(rawPath) {
  return parseAndNormalizePath(rawPath, false);
}

/**
 * Normalizes an arbitrary mediaKey, file URI, or file path into a canonical key: "file:<canonical_path>".
 * Returns "unknown" if invalid or missing.
 *
 * @param {string} key
 * @returns {string} Canonical mediaKey or "unknown"
 */
function normalizeMediaKey(key) {
  const normKey = parseAndNormalizePath(key, true);
  return normKey || "unknown";
}

/**
 * Generates a stable canonical mediaKey for a source item based on its explicit file path.
 * Merges repeated imports of the same underlying file.
 * Returns "unknown" for non-footage or footage without a valid file path.
 *
 * @param {object} source Source item from inventory.sources
 * @returns {string} Canonical mediaKey or "unknown"
 */
function mediaKeyForSource(source) {
  if (!source || typeof source !== "object") return "unknown";
  if (source.type !== "footage") return "unknown";
  const filePath = typeof source.file === "string"
    ? source.file
    : (source.file && (source.file.fsPath || source.file.path));
  if (typeof filePath !== "string" || !filePath.trim()) return "unknown";
  return normalizeMediaKey(filePath);
}

/**
 * Indexes confirmed group mappings and detects conflicts.
 * Rejects filename-inferred groups or unconfirmed mappings.
 *
 * Supports options object or legacy positional arguments:
 * ({ groupMappings, sources, existingMappings }) or (groupMappings, sources)
 */
function indexGroupMappings(groupMappingsOrOpts, sourcesParam) {
  let groupMappings = null;
  let sources = null;
  let existingMappings = null;

  if (groupMappingsOrOpts && typeof groupMappingsOrOpts === "object" && !Array.isArray(groupMappingsOrOpts)) {
    groupMappings = groupMappingsOrOpts.groupMappings;
    sources = groupMappingsOrOpts.sources;
    existingMappings = groupMappingsOrOpts.existingMappings;
  } else {
    groupMappings = groupMappingsOrOpts;
    sources = sourcesParam;
  }

  const map = new Map(); // mediaKey -> { groupId, provenance, confirmed }
  const conflictingKeys = new Set();

  function register(mediaKey, groupId, provenance, confirmed, isSuppliedMapping = false) {
    if (!mediaKey || mediaKey === "unknown") return;
    if (groupId == null) return;
    const cleanGroupId = String(groupId).trim();
    if (!cleanGroupId) return;
    if (!ALLOWED_PROVENANCES.has(provenance)) return;

    if (isSuppliedMapping) {
      // Supplied groupMappings strictly require confirmed === true
      if (confirmed !== true) return;
    } else {
      // Source mediaMetadata from inventory:
      // user_confirmed strictly requires confirmed === true
      // explicit_metadata is trusted metadata unless confirmed === false
      if (provenance === "user_confirmed") {
        if (confirmed !== true) return;
      } else if (provenance === "explicit_metadata") {
        if (confirmed === false) return;
      }
    }

    if (map.has(mediaKey)) {
      const existing = map.get(mediaKey);
      if (existing.groupId !== cleanGroupId) {
        conflictingKeys.add(mediaKey);
      }
    } else {
      map.set(mediaKey, { groupId: cleanGroupId, provenance, confirmed: true });
    }
  }

  // 1. Existing verified mappings (from usage.groupMappings if validating assignments)
  if (Array.isArray(existingMappings)) {
    for (const m of existingMappings) {
      if (!m || typeof m !== "object") continue;
      const key = normalizeMediaKey(m.mediaKey);
      register(key, m.groupId, m.provenance, m.confirmed === true, true);
    }
  }

  // 2. Sources in inventory
  if (Array.isArray(sources)) {
    for (const src of sources) {
      if (src && src.mediaMetadata && src.mediaMetadata.groupId) {
        const key = mediaKeyForSource(src);
        register(
          key,
          src.mediaMetadata.groupId,
          src.mediaMetadata.provenance,
          src.mediaMetadata.confirmed,
          false
        );
      }
    }
  }

  // 3. Supplied groupMappings
  if (Array.isArray(groupMappings)) {
    for (const mapping of groupMappings) {
      if (!mapping || typeof mapping !== "object") continue;
      const key = normalizeMediaKey(mapping.mediaKey);
      register(
        key,
        mapping.groupId,
        mapping.provenance,
        mapping.confirmed === true,
        true
      );
    }
  }

  for (const conflictKey of conflictingKeys) {
    map.delete(conflictKey);
  }

  return { map, conflictingKeys };
}

/**
 * Recursively traverses composition hierarchy to build a source usage map.
 * Tracks source intervals, structural occurrences before duration clipping,
 * nested precomp routes, and confirmed groups.
 *
 * @param {object} params
 * @param {object} params.inventory Complete AE inventory { complete: true, comps: [], sources: [] }
 * @param {Array<{compItemId: number, range?: [number, number]}>} params.roots Root compositions to inspect
 * @param {Array<object>} [params.groupMappings] Confirmed group mappings
 * @param {number} [params.maxNodes=5000] Safeguard against runaway graph expansion (counts comps + layers)
 * @param {number} [params.maxDepth=10] Maximum composition nesting depth
 * @returns {object} usage: { ok, complete, entries, occurrences, sources, groupMappings, unsupported, scope, reason? }
 */
function buildSourceUsageMap({
  inventory,
  roots,
  groupMappings,
  maxNodes = 5000,
  maxDepth = 10
} = {}) {
  const scope = {
    roots: Array.isArray(roots) ? roots : [],
    rootCompItemIds: Array.isArray(roots) ? roots.map((r) => r && r.compItemId).filter(isId) : []
  };

  if (!Number.isSafeInteger(maxNodes) || maxNodes <= 0 || maxNodes > MAX_SAFE_NODES) {
    return {
      ok: false,
      complete: false,
      entries: [],
      occurrences: [],
      sources: [],
      unsupported: [{ reason: "invalid_bounds", param: "maxNodes", value: maxNodes }],
      scope,
      reason: "invalid_bounds"
    };
  }

  if (!Number.isSafeInteger(maxDepth) || maxDepth <= 0 || maxDepth > MAX_SAFE_DEPTH) {
    return {
      ok: false,
      complete: false,
      entries: [],
      occurrences: [],
      sources: [],
      unsupported: [{ reason: "invalid_bounds", param: "maxDepth", value: maxDepth }],
      scope,
      reason: "invalid_bounds"
    };
  }

  if (!inventory || inventory.complete !== true || !Array.isArray(inventory.comps) || !Array.isArray(inventory.sources)) {
    return {
      ok: false,
      complete: false,
      entries: [],
      occurrences: [],
      sources: [],
      unsupported: [{ reason: "inventory_not_complete" }],
      scope,
      reason: "inventory_not_complete"
    };
  }

  if (inventory.comps.length > maxNodes || inventory.sources.length > maxNodes) {
    return {
      ok: false,
      complete: false,
      entries: [],
      occurrences: [],
      sources: [],
      unsupported: [{ reason: "inventory_bounds_exceeded", maxNodes }],
      scope,
      reason: "inventory_bounds_exceeded"
    };
  }

  // Validate item ID collision across comps and sources
  const allItemIds = new Set();
  const compsById = new Map();
  for (const comp of inventory.comps) {
    if (!comp || !isId(comp.itemId) || !isTime(comp.duration) || comp.duration <= 0
      || !isTime(comp.frameRate) || comp.frameRate <= 0 || !Array.isArray(comp.layers)) {
      return {
        ok: false,
        complete: false,
        entries: [],
        occurrences: [],
        sources: [],
        unsupported: [{ reason: "invalid_comp_inventory", compItemId: comp && comp.itemId }],
        scope,
        reason: "invalid_comp_inventory"
      };
    }
    if (allItemIds.has(comp.itemId)) {
      return {
        ok: false,
        complete: false,
        entries: [],
        occurrences: [],
        sources: [],
        unsupported: [{ reason: "duplicate_item_id", itemId: comp.itemId }],
        scope,
        reason: "duplicate_item_id"
      };
    }
    allItemIds.add(comp.itemId);

    // Validate unique layer IDs within comp
    const layerIds = new Set();
    for (const layer of comp.layers) {
      if (!layer || typeof layer !== "object" || !isId(layer.id)) {
        return {
          ok: false,
          complete: false,
          entries: [],
          occurrences: [],
          sources: [],
          unsupported: [{ reason: "invalid_layer_id", compItemId: comp.itemId }],
          scope,
          reason: "invalid_layer_id"
        };
      }
      if (layerIds.has(layer.id)) {
        return {
          ok: false,
          complete: false,
          entries: [],
          occurrences: [],
          sources: [],
          unsupported: [{ reason: "duplicate_layer_id", compItemId: comp.itemId, layerId: layer.id }],
          scope,
          reason: "duplicate_layer_id"
        };
      }
      layerIds.add(layer.id);
    }

    compsById.set(comp.itemId, comp);
  }

  const sourcesById = new Map();
  const usageSources = [];
  for (const src of inventory.sources) {
    if (!src || !isId(src.itemId) || typeof src.type !== "string") {
      return {
        ok: false,
        complete: false,
        entries: [],
        occurrences: [],
        sources: [],
        unsupported: [{ reason: "invalid_source_inventory", sourceItemId: src && src.itemId }],
        scope,
        reason: "invalid_source_inventory"
      };
    }
    if (allItemIds.has(src.itemId)) {
      return {
        ok: false,
        complete: false,
        entries: [],
        occurrences: [],
        sources: [],
        unsupported: [{ reason: "duplicate_item_id", itemId: src.itemId }],
        scope,
        reason: "duplicate_item_id"
      };
    }
    allItemIds.add(src.itemId);
    sourcesById.set(src.itemId, src);
    usageSources.push({
      sourceItemId: src.itemId,
      mediaKey: mediaKeyForSource(src),
      duration: isTime(src.duration) ? src.duration : null,
      type: src.type
    });
  }

  if (!Array.isArray(roots) || roots.length === 0) {
    return {
      ok: false,
      complete: false,
      entries: [],
      occurrences: [],
      sources: [],
      unsupported: [{ reason: "no_roots_specified" }],
      scope,
      reason: "no_roots_specified"
    };
  }

  if (roots.length > 100) {
    return {
      ok: false,
      complete: false,
      entries: [],
      occurrences: [],
      sources: [],
      unsupported: [{ reason: "too_many_roots", count: roots.length }],
      scope,
      reason: "too_many_roots"
    };
  }

  for (const root of roots) {
    if (!root || !isId(root.compItemId) || !compsById.has(root.compItemId)) {
      return {
        ok: false,
        complete: false,
        entries: [],
        occurrences: [],
        sources: [],
        unsupported: [{ reason: "root_comp_not_found", compItemId: root && root.compItemId }],
        scope,
        reason: "root_comp_not_found"
      };
    }
    const comp = compsById.get(root.compItemId);
    if (root.range !== undefined) {
      if (!Array.isArray(root.range) || root.range.length !== 2 || !root.range.every(isTime)
        || root.range[0] >= root.range[1]) {
        return {
          ok: false,
          complete: false,
          entries: [],
          occurrences: [],
          sources: [],
          unsupported: [{ reason: "invalid_root_range", root }],
          scope,
          reason: "invalid_root_range"
        };
      }
      if (root.range[1] <= 0 || root.range[0] >= comp.duration) {
        return {
          ok: false,
          complete: false,
          entries: [],
          occurrences: [],
          sources: [],
          unsupported: [{ reason: "root_range_out_of_bounds", root, compDuration: comp.duration }],
          scope,
          reason: "root_range_out_of_bounds"
        };
      }
    }
  }

  const { map: groupMap, conflictingKeys } = indexGroupMappings({
    groupMappings,
    sources: inventory.sources
  });

  const entries = [];
  const occurrences = [];
  const unsupported = [];
  let nodeCount = 0;
  let hasIncompleteError = false;
  let stopped = false;

  function recordUnsupported(item) {
    unsupported.push(item);
    hasIncompleteError = true;
  }

  if (conflictingKeys.size > 0) {
    recordUnsupported({
      reason: "conflicting_group_mappings",
      conflictingKeys: Array.from(conflictingKeys)
    });
  }

  function traverse(rootCompItemId, rootRange, currentCompId, currentCompRange, routeLayerIds, visitedCompBranch) {
    if (stopped) return;

    nodeCount++;
    if (nodeCount > maxNodes) {
      recordUnsupported({ reason: "max_nodes_exceeded", maxNodes });
      stopped = true;
      return;
    }

    if (visitedCompBranch.length > maxDepth) {
      recordUnsupported({ reason: "max_depth_exceeded", compItemId: currentCompId, depth: visitedCompBranch.length });
      return;
    }

    if (visitedCompBranch.includes(currentCompId)) {
      recordUnsupported({ reason: "cycle_detected", compItemId: currentCompId, path: [...visitedCompBranch, currentCompId] });
      return;
    }

    const comp = compsById.get(currentCompId);
    if (!comp) {
      recordUnsupported({ reason: "missing_comp", compItemId: currentCompId });
      return;
    }

    const currentBranch = [...visitedCompBranch, currentCompId];

    for (const layer of comp.layers) {
      if (stopped) return;

      nodeCount++;
      if (nodeCount > maxNodes) {
        recordUnsupported({ reason: "max_nodes_exceeded", maxNodes });
        stopped = true;
        return;
      }

      if (entries.length >= maxNodes) {
        recordUnsupported({ reason: "max_entries_exceeded", maxNodes });
        stopped = true;
        return;
      }

      if (!layer || typeof layer !== "object") {
        recordUnsupported({ compItemId: currentCompId, reason: "invalid_layer_object" });
        continue;
      }

      if (!isId(layer.id) || !isId(layer.index)) {
        recordUnsupported({ compItemId: currentCompId, layerId: layer.id, reason: "missing_or_invalid_id" });
        continue;
      }

      // Layer enabled state: must be explicitly boolean, do not substitute
      if (typeof layer.enabled !== "boolean") {
        recordUnsupported({ compItemId: currentCompId, layerId: layer.id, reason: "unknown_layer_enabled" });
        continue;
      }
      if (layer.enabled === false) {
        continue;
      }

      // Stretch: must be explicitly number, do not substitute 100
      if (typeof layer.stretch !== "number" || !Number.isFinite(layer.stretch)) {
        recordUnsupported({ compItemId: currentCompId, layerId: layer.id, reason: "unknown_layer_stretch" });
        continue;
      }
      if (layer.stretch !== 100) {
        recordUnsupported({ compItemId: currentCompId, layerId: layer.id, reason: "unsupported_stretch", stretch: layer.stretch });
        continue;
      }

      // timeRemapEnabled: must be explicitly boolean, do not substitute false
      if (typeof layer.timeRemapEnabled !== "boolean") {
        recordUnsupported({ compItemId: currentCompId, layerId: layer.id, reason: "unknown_time_remap" });
        continue;
      }
      if (layer.timeRemapEnabled !== false) {
        recordUnsupported({ compItemId: currentCompId, layerId: layer.id, reason: "unsupported_time_remap" });
        continue;
      }

      if (!isTime(layer.startTime) || !isTime(layer.inPoint) || !isTime(layer.outPoint) || layer.inPoint >= layer.outPoint) {
        recordUnsupported({ compItemId: currentCompId, layerId: layer.id, reason: "invalid_layer_timing" });
        continue;
      }

      const cStart = currentCompRange[0];
      const cEnd = currentCompRange[1];

      const intersectStart = Math.max(cStart, layer.inPoint);
      const intersectEnd = Math.min(cEnd, layer.outPoint);

      if (intersectStart >= intersectEnd) {
        continue;
      }

      const dtStart = intersectStart - cStart;
      const dtEnd = intersectEnd - cStart;
      const layerRootRange = [exactTime(rootRange[0] + dtStart), exactTime(rootRange[0] + dtEnd)];

      const localStart = exactTime(intersectStart - layer.startTime);
      const localEnd = exactTime(intersectEnd - layer.startTime);

      // Collect structural occurrence BEFORE source-duration clipping
      occurrences.push({
        target: {
          compItemId: currentCompId,
          layerId: layer.id
        },
        rootCompItemId,
        routeLayerIds: [...routeLayerIds],
        rootRange: [layerRootRange[0], layerRootRange[1]]
      });

      if (layer.sourceItemId == null) {
        // Check if verified non-video layer (text, shape, camera, light, adjustment)
        if (typeof layer.kind === "string" && VERIFIED_NON_VIDEO_KINDS.has(layer.kind.toLowerCase())) {
          continue; // Cleanly ignored
        }
        // Unknown source missing
        recordUnsupported({ compItemId: currentCompId, layerId: layer.id, reason: "unknown_missing_source" });
        continue;
      }

      if (compsById.has(layer.sourceItemId)) {
        const childComp = compsById.get(layer.sourceItemId);
        // Clip local child range against [0, childComp.duration)
        const clippedChildStart = Math.max(0, localStart);
        const clippedChildEnd = Math.min(childComp.duration, localEnd);

        if (clippedChildStart < clippedChildEnd) {
          const shiftStart = clippedChildStart - localStart;
          const shiftEnd = localEnd - clippedChildEnd;
          const childRootRange = [
            exactTime(layerRootRange[0] + shiftStart),
            exactTime(layerRootRange[1] - shiftEnd)
          ];
          traverse(
            rootCompItemId,
            childRootRange,
            childComp.itemId,
            [clippedChildStart, clippedChildEnd],
            [...routeLayerIds, layer.id],
            currentBranch
          );
        }
      } else if (sourcesById.has(layer.sourceItemId)) {
        const source = sourcesById.get(layer.sourceItemId);
        if (VERIFIED_NON_VIDEO_SOURCE_TYPES.has(source.type)) {
          continue; // Cleanly ignored
        }

        if (source.type === "footage") {
          const filePath = typeof source.file === "string"
            ? source.file
            : (source.file && (source.file.fsPath || source.file.path));
          const normFile = normalizeFilePath(filePath);
          const validDuration = isTime(source.duration) && source.duration > 0;

          if (!normFile || !validDuration) {
            recordUnsupported({
              compItemId: currentCompId,
              layerId: layer.id,
              sourceItemId: source.itemId,
              reason: "missing_footage_file_or_duration",
              hasFile: !!normFile,
              hasDuration: !!validDuration
            });
            continue;
          }

          const footageStart = Math.max(0, localStart);
          const footageEnd = Math.min(source.duration, localEnd);

          if (footageStart >= footageEnd) {
            continue;
          }

          const shiftStart = footageStart - localStart;
          const shiftEnd = localEnd - footageEnd;
          const clippedRoot = [
            exactTime(layerRootRange[0] + shiftStart),
            exactTime(layerRootRange[1] - shiftEnd)
          ];

          const mediaKey = mediaKeyForSource(source);
          let groupId = null;
          if (groupMap.has(mediaKey)) {
            groupId = groupMap.get(mediaKey).groupId;
          }

          entries.push({
            mediaKey,
            sourceItemId: source.itemId,
            sourceRange: [exactTime(footageStart), exactTime(footageEnd)],
            rootCompItemId,
            rootRange: [exactTime(clippedRoot[0]), exactTime(clippedRoot[1])],
            routeLayerIds: [...routeLayerIds],
            target: {
              compItemId: currentCompId,
              layerId: layer.id
            },
            groupId
          });
        } else if (source.type === "comp" && compsById.has(source.itemId)) {
          const childComp = compsById.get(source.itemId);
          const clippedChildStart = Math.max(0, localStart);
          const clippedChildEnd = Math.min(childComp.duration, localEnd);

          if (clippedChildStart < clippedChildEnd) {
            const shiftStart = clippedChildStart - localStart;
            const shiftEnd = localEnd - clippedChildEnd;
            const childRootRange = [
              exactTime(layerRootRange[0] + shiftStart),
              exactTime(layerRootRange[1] - shiftEnd)
            ];
            traverse(
              rootCompItemId,
              childRootRange,
              childComp.itemId,
              [clippedChildStart, clippedChildEnd],
              [...routeLayerIds, layer.id],
              currentBranch
            );
          }
        } else {
          recordUnsupported({
            compItemId: currentCompId,
            layerId: layer.id,
            sourceItemId: source.itemId,
            reason: "unsupported_source_type",
            sourceType: source.type
          });
        }
      } else {
        recordUnsupported({
          compItemId: currentCompId,
          layerId: layer.id,
          sourceItemId: layer.sourceItemId,
          reason: "missing_source_item"
        });
      }
    }
  }

  for (const root of roots) {
    if (stopped) break;
    const comp = compsById.get(root.compItemId);
    const rootRange = root.range
      ? [Math.max(0, root.range[0]), Math.min(comp.duration, root.range[1])]
      : [0, comp.duration];
    traverse(root.compItemId, rootRange, root.compItemId, rootRange, [], []);
  }

  const complete = !hasIncompleteError && unsupported.length === 0;
  const ok = complete;

  // Persist unambiguous metadata-resolved mappings in usage.groupMappings
  const persistentGroupMappings = [];
  for (const [key, val] of groupMap.entries()) {
    persistentGroupMappings.push({
      mediaKey: key,
      groupId: val.groupId,
      provenance: val.provenance,
      confirmed: true
    });
  }

  return {
    ok,
    complete,
    entries,
    occurrences,
    sources: usageSources,
    groupMappings: persistentGroupMappings,
    unsupported,
    scope,
    ...(ok ? {} : { reason: unsupported[0]?.reason || "unsupported_features" })
  };
}

/**
 * Validates proposed placeholder assignments against source intervals,
 * group uniqueness, existing project usages, authoritative source inventory,
 * and structural occurrences.
 *
 * @param {object} params
 * @param {object} params.usage Output of buildSourceUsageMap
 * @param {Array<object>} params.assignments Proposed replacements [{ target: { compItemId, layerId }, sourceItemId, mediaKey?, sourceRange: [a, b], groupId? }]
 * @param {object} params.constraints { distinctGroups: boolean, disallowSourceOverlap: boolean, selectedTargets: Array<{compItemId, layerId}>, groupMappings?: Array<object> }
 * @returns {object} { ok, valid, conflicts, unknownGroups, unsupported, summary }
 */
function checkPlaceholderAssignments({
  usage,
  assignments,
  constraints = {}
} = {}) {
  const conflicts = [];
  const unknownGroups = [];
  const unsupported = [];

  if (!usage || usage.complete !== true || usage.ok !== true
      || !Array.isArray(usage.entries)
      || !Array.isArray(usage.sources)
      || !Array.isArray(usage.occurrences)) {
    return {
      ok: false,
      valid: false,
      reason: "incomplete_usage_map",
      conflicts,
      unknownGroups,
      unsupported,
      summary: "Cannot check assignments against incomplete or invalid usage map (requires complete ok map with entries, sources, and occurrences)."
    };
  }

  // Validate authoritative source index in usage.sources
  const sourcesById = new Map();
  for (let i = 0; i < usage.sources.length; i++) {
    const s = usage.sources[i];
    if (!s || typeof s !== "object" || !isId(s.sourceItemId) || typeof s.type !== "string") {
      return {
        ok: false,
        valid: false,
        reason: "invalid_usage_sources",
        conflicts,
        unknownGroups,
        unsupported,
        summary: `Usage sources index entry at index ${i} has invalid structure or ID.`
      };
    }
    if (sourcesById.has(s.sourceItemId)) {
      return {
        ok: false,
        valid: false,
        reason: "duplicate_source_index_id",
        conflicts,
        unknownGroups,
        unsupported,
        summary: `Authoritative source index contains duplicate sourceItemId: ${s.sourceItemId}.`
      };
    }
    sourcesById.set(s.sourceItemId, s);
  }

  // Validate occurrences structure in usage.occurrences
  for (let i = 0; i < usage.occurrences.length; i++) {
    const o = usage.occurrences[i];
    if (!o || typeof o !== "object" || !o.target || !isId(o.target.compItemId) || !isId(o.target.layerId)
        || !isId(o.rootCompItemId) || !Array.isArray(o.routeLayerIds)) {
      return {
        ok: false,
        valid: false,
        reason: "invalid_usage_occurrences",
        conflicts,
        unknownGroups,
        unsupported,
        summary: `Usage occurrences entry at index ${i} has invalid structure or target.`
      };
    }
  }

  // Validate usage.entries structure, IDs, and timing
  for (let i = 0; i < usage.entries.length; i++) {
    const e = usage.entries[i];
    if (!e || typeof e !== "object" || !isId(e.sourceItemId) || !e.target || !isId(e.target.compItemId)
      || !isId(e.target.layerId) || !Array.isArray(e.sourceRange) || e.sourceRange.length !== 2
      || !e.sourceRange.every(isTime) || e.sourceRange[0] < 0 || e.sourceRange[0] >= e.sourceRange[1]
      || !Array.isArray(e.rootRange) || e.rootRange.length !== 2 || !e.rootRange.every(isTime)
      || e.rootRange[0] >= e.rootRange[1]) {
      return {
        ok: false,
        valid: false,
        reason: "invalid_usage_entries",
        conflicts,
        unknownGroups,
        unsupported,
        summary: `Usage entry at index ${i} has invalid structure, IDs, or timing.`
      };
    }
  }

  if (!Array.isArray(assignments) || assignments.length === 0) {
    return {
      ok: false,
      valid: false,
      reason: "invalid_assignments",
      conflicts,
      unknownGroups,
      unsupported,
      summary: "Assignments must be a non-empty array."
    };
  }

  const distinctGroups = constraints.distinctGroups !== false;
  const disallowSourceOverlap = constraints.disallowSourceOverlap !== false;

  // Merge groupMappings: usage.groupMappings + constraints.groupMappings (detecting conflicts without silent overwrite)
  const { map: groupMap, conflictingKeys } = indexGroupMappings({
    existingMappings: usage.groupMappings,
    groupMappings: constraints.groupMappings
  });

  if (conflictingKeys.size > 0) {
    conflicts.push({
      type: "conflicting_group_mappings",
      conflictingKeys: Array.from(conflictingKeys),
      reason: "Conflicting group mappings detected."
    });
  }

  const normalizedAssignments = [];
  const targetKeysSeen = new Map();

  for (let i = 0; i < assignments.length; i++) {
    const assign = assignments[i];
    if (!assign || typeof assign !== "object" || !assign.target || !isId(assign.target.compItemId)
      || !isId(assign.target.layerId) || !isId(assign.sourceItemId) || !Array.isArray(assign.sourceRange)
      || assign.sourceRange.length !== 2 || !assign.sourceRange.every(isTime)
      || assign.sourceRange[0] < 0 || assign.sourceRange[0] >= assign.sourceRange[1]) {
      return {
        ok: false,
        valid: false,
        reason: "invalid_assignment_shape",
        conflicts,
        unknownGroups,
        unsupported,
        summary: `Assignment at index ${i} has invalid target, sourceItemId, or sourceRange.`
      };
    }

    const targetKey = `${assign.target.compItemId}:${assign.target.layerId}`;
    if (targetKeysSeen.has(targetKey)) {
      conflicts.push({
        type: "duplicate_target",
        target: assign.target,
        firstIndex: targetKeysSeen.get(targetKey),
        secondIndex: i
      });
    } else {
      targetKeysSeen.set(targetKey, i);
    }

    // Authoritative source index check & duration clamp
    let effectiveMediaKey = "unknown";
    if (!sourcesById.has(assign.sourceItemId)) {
      conflicts.push({
        type: "unknown_source_item",
        target: assign.target,
        sourceItemId: assign.sourceItemId,
        assignmentIndex: i,
        reason: `Assignment references sourceItemId ${assign.sourceItemId} not found in authoritative source index.`
      });
      effectiveMediaKey = normalizeMediaKey(assign.mediaKey);
    } else {
      const sourceRecord = sourcesById.get(assign.sourceItemId);
      effectiveMediaKey = sourceRecord.mediaKey || "unknown";

      if (assign.mediaKey !== undefined && assign.mediaKey !== null) {
        const assignNormKey = normalizeMediaKey(assign.mediaKey);
        if (assignNormKey !== "unknown" && assignNormKey !== effectiveMediaKey) {
          conflicts.push({
            type: "source_media_mismatch",
            target: assign.target,
            sourceItemId: assign.sourceItemId,
            claimedMediaKey: assignNormKey,
            authoritativeMediaKey: effectiveMediaKey,
            assignmentIndex: i,
            reason: "Assignment claimed mediaKey does not match authoritative source index."
          });
        }
      }

      if (isTime(sourceRecord.duration) && sourceRecord.duration > 0) {
        if (assign.sourceRange[1] > sourceRecord.duration) {
          conflicts.push({
            type: "source_range_exceeds_duration",
            target: assign.target,
            sourceItemId: assign.sourceItemId,
            sourceRange: assign.sourceRange,
            sourceDuration: sourceRecord.duration,
            assignmentIndex: i,
            reason: `Assignment source range end ${assign.sourceRange[1]} exceeds source duration ${sourceRecord.duration}.`
          });
        }
      } else if (sourceRecord.type === "footage") {
        conflicts.push({
          type: "invalid_source_duration",
          target: assign.target,
          sourceItemId: assign.sourceItemId,
          assignmentIndex: i,
          reason: "Authoritative source has invalid or missing duration."
        });
      }
    }

    // If disallowSourceOverlap is active, unknown mediaKey cannot be verified for alias imports
    if (disallowSourceOverlap && effectiveMediaKey === "unknown") {
      conflicts.push({
        type: "unknown_media_key",
        target: assign.target,
        sourceItemId: assign.sourceItemId,
        assignmentIndex: i,
        reason: "Cannot verify alias imports without explicit file path when disallowSourceOverlap is true."
      });
    }

    // Structural occurrences verification (phantom target & shared placeholder check)
    const targetOccurrences = usage.occurrences.filter(
      (o) => o.target.compItemId === assign.target.compItemId && o.target.layerId === assign.target.layerId
    );

    if (targetOccurrences.length === 0) {
      conflicts.push({
        type: "target_not_found",
        target: assign.target,
        assignmentIndex: i,
        reason: `Target [${targetKey}] not found in reachable composition occurrences.`
      });
    } else if (targetOccurrences.length > 1) {
      unsupported.push({
        type: "unsupported_shared_placeholder",
        target: assign.target,
        occurrenceCount: targetOccurrences.length,
        routes: targetOccurrences.map((o) => o.routeLayerIds),
        reason: "Shared precomp layer instantiated across multiple occurrences without explicit occurrence mapping."
      });
    }

    let confirmedGroupId = null;
    if (effectiveMediaKey !== "unknown" && groupMap.has(effectiveMediaKey)) {
      confirmedGroupId = groupMap.get(effectiveMediaKey).groupId;
    }

    if (!confirmedGroupId) {
      unknownGroups.push({
        assignmentIndex: i,
        target: assign.target,
        sourceItemId: assign.sourceItemId,
        mediaKey: effectiveMediaKey,
        claimedGroupId: assign.groupId || null,
        reason: "unconfirmed_group"
      });
    }

    normalizedAssignments.push({
      ...assign,
      index: i,
      mediaKey: effectiveMediaKey,
      resolvedGroupId: confirmedGroupId,
      targetKey
    });
  }

  // Validate selectedTargets constraint
  const assignmentTargetKeys = new Set(normalizedAssignments.map((a) => a.targetKey));
  const replacedTargetKeys = new Set();

  if (constraints.selectedTargets !== undefined) {
    if (!Array.isArray(constraints.selectedTargets)) {
      return {
        ok: false,
        valid: false,
        reason: "invalid_selected_targets",
        conflicts,
        unknownGroups,
        unsupported,
        summary: "constraints.selectedTargets must be an array."
      };
    }

    for (const st of constraints.selectedTargets) {
      if (!st || !isId(st.compItemId) || !isId(st.layerId)) {
        return {
          ok: false,
          valid: false,
          reason: "invalid_selected_targets",
          conflicts,
          unknownGroups,
          unsupported,
          summary: "Invalid target in selectedTargets."
        };
      }
      const stKey = `${st.compItemId}:${st.layerId}`;
      if (!assignmentTargetKeys.has(stKey)) {
        return {
          ok: false,
          valid: false,
          reason: "unassigned_selected_target",
          conflicts: [{
            type: "unassigned_selected_target",
            target: st,
            reason: "selectedTargets contains target without matching assignment."
          }],
          unknownGroups,
          unsupported,
          summary: `selectedTargets contains target [${stKey}] without matching assignment.`
        };
      }
      replacedTargetKeys.add(stKey);
    }
  } else {
    for (const assign of normalizedAssignments) {
      replacedTargetKeys.add(assign.targetKey);
    }
  }

  // Distinct groups check
  if (distinctGroups) {
    const groupsSeen = new Map();
    for (const assign of normalizedAssignments) {
      if (assign.resolvedGroupId) {
        if (groupsSeen.has(assign.resolvedGroupId)) {
          groupsSeen.get(assign.resolvedGroupId).push(assign.index);
        } else {
          groupsSeen.set(assign.resolvedGroupId, [assign.index]);
        }
      }
    }

    for (const [groupId, indices] of groupsSeen.entries()) {
      if (indices.length > 1) {
        conflicts.push({
          type: "duplicate_group",
          groupId,
          assignmentIndices: indices,
          targets: indices.map((idx) => normalizedAssignments[idx].target)
        });
      }
    }
  }

  // Interval overlap checks
  if (disallowSourceOverlap) {
    // 1. Intrabatch
    for (let i = 0; i < normalizedAssignments.length; i++) {
      for (let j = i + 1; j < normalizedAssignments.length; j++) {
        const a = normalizedAssignments[i];
        const b = normalizedAssignments[j];

        const sameMedia = (a.mediaKey !== "unknown" && a.mediaKey === b.mediaKey)
          || a.sourceItemId === b.sourceItemId;

        if (sameMedia) {
          const overlapStart = Math.max(a.sourceRange[0], b.sourceRange[0]);
          const overlapEnd = Math.min(a.sourceRange[1], b.sourceRange[1]);

          // Strict half-open interval overlap check without rounding
          if (overlapStart < overlapEnd) {
            conflicts.push({
              type: "source_interval_overlap",
              kind: "intrabatch",
              mediaKey: a.mediaKey,
              sourceItemId: a.sourceItemId,
              assignmentA: a.target,
              assignmentB: b.target,
              rangeA: a.sourceRange,
              rangeB: b.sourceRange,
              overlap: [overlapStart, overlapEnd]
            });
          }
        }
      }
    }

    // 2. Existing usages
    const remainingExistingEntries = usage.entries.filter(
      (entry) => !replacedTargetKeys.has(`${entry.target.compItemId}:${entry.target.layerId}`)
    );

    for (const existing of remainingExistingEntries) {
      if (existing.mediaKey === "unknown") {
        conflicts.push({
          type: "unknown_existing_media_key",
          target: existing.target,
          sourceItemId: existing.sourceItemId,
          reason: "Existing project usage has unknown mediaKey; cannot verify alias imports."
        });
      }
    }

    for (const assign of normalizedAssignments) {
      for (const existing of remainingExistingEntries) {
        const sameMedia = (assign.mediaKey !== "unknown" && assign.mediaKey === existing.mediaKey)
          || assign.sourceItemId === existing.sourceItemId;

        if (sameMedia) {
          const overlapStart = Math.max(assign.sourceRange[0], existing.sourceRange[0]);
          const overlapEnd = Math.min(assign.sourceRange[1], existing.sourceRange[1]);

          if (overlapStart < overlapEnd) {
            conflicts.push({
              type: "source_interval_overlap",
              kind: "existing_usage",
              mediaKey: assign.mediaKey,
              sourceItemId: assign.sourceItemId,
              target: assign.target,
              existingTarget: existing.target,
              assignmentRange: assign.sourceRange,
              existingRange: existing.sourceRange,
              overlap: [overlapStart, overlapEnd]
            });
          }
        }
      }
    }
  }

  const hasConflicts = conflicts.length > 0;
  const hasUnknownGroups = distinctGroups && unknownGroups.length > 0;
  const hasUnsupported = unsupported.length > 0;

  const ok = !hasConflicts && !hasUnknownGroups && !hasUnsupported;
  const valid = ok;

  let summary = "Placeholder assignments verified successfully.";
  if (!ok) {
    const issues = [];
    if (hasConflicts) issues.push(`${conflicts.length} conflict(s)`);
    if (hasUnknownGroups) issues.push(`${unknownGroups.length} unconfirmed group(s)`);
    if (hasUnsupported) issues.push(`${unsupported.length} unsupported placeholder(s)`);
    summary = `Verification failed: ${issues.join(", ")}.`;
  }

  return {
    ok,
    valid,
    conflicts,
    unknownGroups,
    unsupported,
    summary
  };
}

module.exports = {
  buildSourceUsageMap,
  checkPlaceholderAssignments,
  mediaKeyForSource
};
