(function () {
  var pageState = null, generation = 0, registryId = new Date().getTime() + '-' + Math.random().toString(36).slice(2);
  function uint(value, min) {
    return typeof value === 'number' && value >= min && value <= 9007199254740991 && value % 1 === 0;
  }
  function read(object, key) {
    try { return object[key]; } catch (_) { return null; }
  }
  function finite(value) { return typeof value === 'number' && isFinite(value) ? value : null; }
  function inspect(input) {
    if (!input || Object.prototype.toString.call(input) !== '[object Object]') throw new Error('invalid_inspection');
    var key;
    for (key in input) if (Object.prototype.hasOwnProperty.call(input, key) && key !== 'compId' && key !== 'cursor') throw new Error('invalid_inspection');
    if (input.compId !== undefined && !uint(input.compId, 1)) throw new Error('invalid_comp_id');
    if (input.cursor !== undefined && (typeof input.cursor !== 'string' || !input.cursor.length || input.cursor.length > 96)) throw new Error('invalid_inspection_cursor');

    var p = app.project;
    if (!p) throw new Error('project_unavailable');
    var file = p.file, projectId = file ? file.fsName : null, total = p.numItems, revision = read(p, 'revision'), dirty = read(p, 'dirty');
    if (!uint(total, 0)) throw new Error('project_items_unavailable');
    if (!uint(revision, 0)) revision = null;
    if (!pageState || pageState.project !== p || pageState.projectId !== projectId || pageState.total !== total || pageState.revision !== revision) {
      pageState = { project: p, projectId: projectId, total: total, revision: revision, token: registryId + '-' + (++generation) + ':', cursors: [] };
    }
    var start = 1, inventoryStatus = 'complete';
    if (input.cursor !== undefined) {
      start = Number(input.cursor.slice(pageState.token.length));
      var known = false;
      for (var k = 0; k < pageState.cursors.length; k++) if (pageState.cursors[k] === input.cursor) known = true;
      if (!known || revision === null || !uint(start, 2) || start > total || input.cursor !== pageState.token + start) {
        start = null; inventoryStatus = 'cursor_stale';
      }
    }

    var comps = [], compIndices = [], layers = [], shortened = false, selected = null, i, c, l;
    function display(value) { var text = String(value); if (text.length > 256) { shortened = true; return text.slice(0, 256); } return text; }
    var requested = input.compId !== undefined, lookupStatus = requested ? 'scan_incomplete' : 'not_requested', lookupMethod = 'none';
    if (requested && start !== null) {
      try {
        c = p.itemByID(input.compId);
        if (c && c.id === input.compId) {
          lookupMethod = 'item_by_id';
          if (c instanceof CompItem) { selected = c; lookupStatus = 'found'; }
          else lookupStatus = 'not_found';
        }
      } catch (_) { /* A native miss can throw. Only complete coverage can prove absence. */ }
    }
    var through = start === null ? null : start - 1, scanned = 0;
    function itemAt(index) {
      var item = p.item(index);
      if (!item || !uint(item.id, 1)) throw new Error('project_item_unavailable');
      return item;
    }
    if (start !== null) for (i = start; i <= total && scanned < 500 && comps.length < 50; i++) {
      try {
        c = itemAt(i);
        if (c instanceof CompItem) {
          if (lookupStatus === 'scan_incomplete' && c.id === input.compId) {
            selected = c; lookupStatus = 'found'; lookupMethod = 'page_scan';
          }
          comps.push({ compId: c.id, name: display(c.name), numLayers: c.numLayers, duration: c.duration });
          compIndices.push(i);
        }
        through = i; scanned++;
      } catch (_) { inventoryStatus = 'scan_incomplete'; break; }
    }
    // Preserve the bounded ID scan when the native lookup is unavailable and
    // the composition display limit ended this inventory page before item 500.
    if (start !== null && inventoryStatus === 'complete') for (; lookupStatus === 'scan_incomplete' && i <= total && scanned < 500; i++) {
      try { c = itemAt(i); } catch (_) { break; }
      scanned++;
      if (c.id === input.compId && c instanceof CompItem) {
        selected = c; lookupStatus = 'found'; lookupMethod = 'page_scan';
      }
    }
    if (lookupStatus === 'scan_incomplete' && start === 1 && scanned === total) {
      lookupStatus = 'not_found'; lookupMethod = 'page_scan';
    }
    var numLayers = selected ? selected.numLayers : 0;
    for (i = 1; i <= Math.min(numLayers, 100); i++) {
      l = selected.layer(i); layers.push({ layerId: l.id, index: i, name: display(l.name), textLayer: !!l.property('ADBE Text Properties') });
    }

    var active = read(p, 'activeItem'), activeId = active instanceof CompItem ? read(active, 'id') : null;
    var activeComp = uint(activeId, 1) ? { compId: activeId, time: finite(read(active, 'time')),
      workAreaStart: finite(read(active, 'workAreaStart')), workAreaDuration: finite(read(active, 'workAreaDuration')) } : null;
    var coverage = { lookup: { compId: requested ? input.compId : null, status: lookupStatus, method: lookupMethod },
      inventory: { status: inventoryStatus, startItemIndex: start, throughItemIndex: through, itemsScanned: scanned, nextCursor: null },
      layers: { total: numLayers, returned: layers.length }, displayNamesShortened: false };
    var result = { observationVersion: 1, target: { projectId: projectId, compId: selected ? selected.id : null },
      project: { name: file ? display(file.name) : 'Несохранённый проект', numItems: total, saved: !!file },
      compositions: comps, layers: layers, truncated: false, aeVersion: app.version,
      dirty: typeof dirty === 'boolean' ? dirty : null, projectRevision: revision, activeComp: activeComp, coverage: coverage };
    coverage.displayNamesShortened = shortened;
    function updateCoverage() {
      var status = inventoryStatus;
      if (status === 'complete' && through < total) status = revision === null ? 'revision_unavailable' : 'more';
      coverage.inventory.status = status;
      coverage.inventory.throughItemIndex = through;
      coverage.inventory.nextCursor = status === 'more' ? pageState.token + (through + 1) : null;
      coverage.layers.returned = layers.length;
      result.truncated = shortened || status !== 'complete' || layers.length < numLayers;
    }
    updateCoverage();
    while (JSON.stringify(result).length > 40000 && (layers.length || comps.length)) {
      if (layers.length) layers.pop();
      else { comps.pop(); through = compIndices.pop() - 1; }
      updateCoverage();
    }
    if (JSON.stringify(result).length > 40000) return { readFailureVersion: 1, outcome: 'rejected', code: 'inspection_result_budget' };
    if (coverage.inventory.nextCursor !== null) {
      pageState.cursors.push(coverage.inventory.nextCursor);
      if (pageState.cursors.length > 16) pageState.cursors.shift();
    }
    return result;
  }
  return { inspect: inspect };
}())
