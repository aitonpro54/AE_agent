"use strict";

// This ES3 program is embedded in each exported function's own source. It has no
// Node/bridge authority and never opens/saves a project. The restore caller must
// first reopen its native-owned original source and verify physical pins/hash
// and the complete source graph. A filename equality below is only a selector.
// Static copies of the same ES3 program preserve independent .toString()
// embedding. No runtime Function/eval factory runs during module import.
// Keep the three literal programs identical when changing this contract.
function captureUiBaseline(){return (function uiBaselineProgram(operation, original, expectedSourceFile) {
  function bad(code) { throw Error("owned_ui_" + code); }
  function integer(value, minimum, maximum) {
    if (typeof value !== "number" || !isFinite(value) || (value === 0 && 1 / value === -Infinity) || value < minimum || value > maximum || Math.floor(value) !== value) bad("integer_invalid");
    return value;
  }
  function text(value) { if (typeof value !== "string" || value.indexOf("\x00") !== -1) bad("text_invalid"); return value; }
  function file(value) { text(value); if (!value.length || value.length > 32760) bad("project_file_invalid"); return value; }
  function keys(value, expected) {
    if (!value || typeof value !== "object" || Object.prototype.toString.call(value) === "[object Array]") bad("schema_invalid");
    var count = 0, key, i;
    for (key in value) if (Object.prototype.hasOwnProperty.call(value, key)) {
      count++; var found = false;
      for (i = 0; i < expected.length; i++) if (key === expected[i]) found = true;
      if (!found) bad("schema_invalid");
    }
    if (count !== expected.length) bad("schema_invalid");
    for (i = 0; i < expected.length; i++) if (!Object.prototype.hasOwnProperty.call(value, expected[i])) bad("schema_invalid");
  }
  function array(value, maximum) {
    if (Object.prototype.toString.call(value) !== "[object Array]") bad("array_invalid");
    integer(value.length, 0, maximum); return value;
  }
  function timeNumber(value) {
    if (typeof value !== "number" || !isFinite(value) || (value === 0 && 1 / value === -Infinity)) bad("time_invalid");
    return value.toPrecision(17);
  }
  function timeString(value) {
    text(value); if (!value.length || value.length > 32 || timeNumber(Number(value)) !== value) bad("time_invalid");
    return Number(value);
  }
  function itemKind(item) {
    if (item instanceof CompItem) return "comp";
    if (typeof FootageItem !== "undefined" && item instanceof FootageItem) return "footage";
    if (typeof FolderItem !== "undefined" && item instanceof FolderItem) return "folder";
    bad("item_kind_unavailable");
  }
  function layerKind(layer) {
    if (typeof TextLayer !== "undefined" && layer instanceof TextLayer) return "text";
    if (typeof ShapeLayer !== "undefined" && layer instanceof ShapeLayer) return "shape";
    if (typeof CameraLayer !== "undefined" && layer instanceof CameraLayer) return "camera";
    if (typeof LightLayer !== "undefined" && layer instanceof LightLayer) return "light";
    if (typeof AVLayer !== "undefined" && layer instanceof AVLayer) return "av";
    bad("layer_kind_unavailable");
  }
  function validate(value) {
    keys(value, ["schema", "projectFile", "dirty", "activeItem", "viewerKind", "projectSelectionIds", "items", "comps"]);
    if (value.schema !== "ae-agent.owned-native-ui-baseline.v1" || value.dirty !== false) bad("baseline_invalid");
    file(value.projectFile); array(value.items, 1000); array(value.comps, 1000); array(value.projectSelectionIds, 1000);
    var items = {}, comps = {}, layers = {}, selections = {}, compCount = 0, total = 0, i, j, row, layer, id, selected;
    for (i = 0; i < value.items.length; i++) {
      row = value.items[i]; keys(row, ["index", "id", "name", "kind"]); id = integer(row.id, 1, 9007199254740991); text(row.name);
      if (row.index !== i + 1 || items["i" + id] || (row.kind !== "comp" && row.kind !== "footage" && row.kind !== "folder")) bad("item_census_invalid");
      items["i" + id] = row; if (row.kind === "comp") compCount++;
    }
    if (value.comps.length !== compCount) bad("comp_census_invalid");
    var previousIndex = 0;
    for (i = 0; i < value.comps.length; i++) {
      row = value.comps[i]; keys(row, ["index", "id", "name", "time", "numLayers", "layers", "selectedLayerIds"]);
      id = integer(row.id, 1, 9007199254740991); integer(row.index, 1, value.items.length); text(row.name); timeString(row.time);
      var item = items["i" + id];
      if (!item || item.kind !== "comp" || item.index !== row.index || item.name !== row.name || comps["i" + id] || row.index <= previousIndex) bad("comp_census_invalid");
      previousIndex = row.index; comps["i" + id] = row;
      integer(row.numLayers, 0, 1000); array(row.layers, 1000); array(row.selectedLayerIds, 1000);
      if (row.layers.length !== row.numLayers || total > 1000 - row.numLayers) bad("layer_census_bound"); total += row.numLayers;
      var local = {}; selected = {};
      for (j = 0; j < row.layers.length; j++) {
        layer = row.layers[j]; keys(layer, ["index", "id", "name", "kind", "selected"]); id = integer(layer.id, 1, 9007199254740991); text(layer.name);
        if (layer.index !== j + 1 || layers["l" + id] || typeof layer.selected !== "boolean" ||
            (layer.kind !== "text" && layer.kind !== "shape" && layer.kind !== "camera" && layer.kind !== "light" && layer.kind !== "av")) bad("layer_census_invalid");
        layers["l" + id] = layer; local["l" + id] = layer;
      }
      for (j = 0; j < row.selectedLayerIds.length; j++) {
        id = integer(row.selectedLayerIds[j], 1, 9007199254740991);
        if (!local["l" + id] || !local["l" + id].selected || selected["l" + id]) bad("selected_layers_invalid"); selected["l" + id] = true;
      }
      for (j = 0; j < row.layers.length; j++) if (row.layers[j].selected !== !!selected["l" + row.layers[j].id]) bad("selected_layers_invalid");
    }
    for (i = 0; i < value.projectSelectionIds.length; i++) {
      id = integer(value.projectSelectionIds[i], 1, 9007199254740991);
      if (!items["i" + id] || selections["i" + id]) bad("project_selection_invalid"); selections["i" + id] = true;
    }
    if (value.activeItem !== null) {
      keys(value.activeItem, ["kind", "id", "openInViewerAvailable", "viewerSetActiveAvailable"]); id = integer(value.activeItem.id, 1, 9007199254740991);
      if (typeof value.activeItem.openInViewerAvailable !== "boolean" || typeof value.activeItem.viewerSetActiveAvailable !== "boolean") bad("active_item_invalid");
      if (!items["i" + id] || items["i" + id].kind !== value.activeItem.kind) bad("active_item_invalid");
    }
    if (value.viewerKind !== "none" && value.viewerKind !== "composition" && value.viewerKind !== "footage" && value.viewerKind !== "layer") bad("viewer_invalid");
    return {items: items, comps: comps, selections: selections};
  }
  function supported(value) {
    return value.activeItem !== null && value.activeItem.openInViewerAvailable === true && value.activeItem.viewerSetActiveAvailable === true &&
      ((value.activeItem.kind === "comp" && value.viewerKind === "composition") ||
      (value.activeItem.kind === "footage" && value.viewerKind === "footage"));
  }
  function capture() {
    var project = app.project, items = [], comps = [], selection = [], actualItems = {}, actualLayers = {}, total = 0, i, j, item, layer, row;
    if (!project || !project.file || project.dirty !== false) bad("project_not_clean");
    file(project.file.fsName); integer(project.numItems, 0, 1000);
    for (i = 1; i <= project.numItems; i++) {
      item = project.item(i); if (!item) bad("item_unavailable"); integer(item.id, 1, 9007199254740991); text(item.name);
      if (actualItems["i" + item.id] || typeof item.selected !== "boolean") bad("item_census_invalid"); actualItems["i" + item.id] = item;
      items.push({index: i, id: item.id, name: item.name, kind: itemKind(item)});
      if (item instanceof CompItem) {
        integer(item.numLayers, 0, 1000); if (total > 1000 - item.numLayers) bad("layer_census_bound"); total += item.numLayers;
        row = {index: i, id: item.id, name: item.name, time: timeNumber(item.time), numLayers: item.numLayers, layers: [], selectedLayerIds: []};
        for (j = 1; j <= item.numLayers; j++) {
          layer = item.layer(j); if (!layer) bad("layer_unavailable"); integer(layer.id, 1, 9007199254740991); text(layer.name);
          if (layer.index !== j || actualLayers["l" + layer.id] || typeof layer.selected !== "boolean") bad("layer_census_invalid"); actualLayers["l" + layer.id] = layer;
          row.layers.push({index: j, id: layer.id, name: layer.name, kind: layerKind(layer), selected: layer.selected});
        }
        var selected = item.selectedLayers; if (!selected) bad("selected_layers_unavailable"); integer(selected.length, 0, item.numLayers);
        for (j = 0; j < selected.length; j++) {
          layer = selected[j]; if (!layer || actualLayers["l" + layer.id] !== layer) bad("selected_layers_invalid"); row.selectedLayerIds.push(layer.id);
        }
        comps.push(row);
      }
    }
    var selectedItems = project.selection; if (!selectedItems) bad("project_selection_unavailable"); integer(selectedItems.length, 0, items.length);
    for (i = 0; i < selectedItems.length; i++) {
      item = selectedItems[i]; if (!item || actualItems["i" + item.id] !== item || item.selected !== true) bad("project_selection_invalid"); selection.push(item.id);
    }
    var active = project.activeItem, activeRow = null, viewer = "none";
    if (active !== null) {
      if (!active || actualItems["i" + active.id] !== active) bad("active_item_invalid");
      activeRow = {kind: itemKind(active), id: active.id, openInViewerAvailable: typeof active.openInViewer === "function",
        viewerSetActiveAvailable: !!app.activeViewer && typeof app.activeViewer.setActive === "function"};
    }
    if (app.activeViewer !== null) {
      if (!app.activeViewer || typeof ViewerType === "undefined") bad("viewer_unavailable");
      var type = app.activeViewer.type;
      if (type === ViewerType.VIEWER_COMPOSITION) viewer = "composition";
      else if (type === ViewerType.VIEWER_FOOTAGE) viewer = "footage";
      else if (type === ViewerType.VIEWER_LAYER) viewer = "layer";
      else bad("viewer_unavailable");
    }
    var value = {schema: "ae-agent.owned-native-ui-baseline.v1", projectFile: project.file.fsName, dirty: false, activeItem: activeRow,
      viewerKind: viewer, projectSelectionIds: selection, items: items, comps: comps};
    var census = validate(value);
    for (i = 0; i < items.length; i++) if (actualItems["i" + items[i].id].selected !== !!census.selections["i" + items[i].id]) bad("project_selection_invalid");
    return value;
  }
  if (operation === "capture") return capture();
  var originalCensus = validate(original);
  if (operation === "supported") return supported(original);
  if (operation !== "restore") bad("operation_invalid");
  file(expectedSourceFile);
  if (expectedSourceFile !== original.projectFile) bad("source_selector_mismatch");
  if (!supported(original)) bad("restore_operand_unsupported");
  var before = capture(), itemMap = [], layerMap = [], mappedItems = {}, mappedLayers = {}, i, j, from, to;
  if (before.projectFile !== expectedSourceFile) bad("source_selector_mismatch");
  if (before.items.length !== original.items.length || before.comps.length !== original.comps.length) bad("restore_census_mismatch");
  // Complete index/type/name census, including every comp's every layer, before
  // any write. Duplicate names are allowed; names alone never select a target.
  for (i = 0; i < original.items.length; i++) {
    from = original.items[i]; to = before.items[i];
    if (from.index !== to.index || from.kind !== to.kind || from.name !== to.name) bad("restore_census_mismatch");
    mappedItems["i" + from.id] = to.id; itemMap.push({originalId: from.id, reopenedId: to.id});
  }
  for (i = 0; i < original.comps.length; i++) {
    from = original.comps[i]; to = before.comps[i];
    if (from.index !== to.index || mappedItems["i" + from.id] !== to.id || from.name !== to.name || from.numLayers !== to.numLayers) bad("restore_census_mismatch");
    for (j = 0; j < from.layers.length; j++) {
      var oldLayer = from.layers[j], newLayer = to.layers[j];
      if (oldLayer.index !== newLayer.index || oldLayer.kind !== newLayer.kind || oldLayer.name !== newLayer.name) bad("restore_census_mismatch");
      mappedLayers["l" + oldLayer.id] = newLayer.id;
      layerMap.push({originalCompId: from.id, reopenedCompId: to.id, originalId: oldLayer.id, reopenedId: newLayer.id});
    }
  }
  // openInViewer has no universal tabs/layout contract. Only the original
  // supported active CompItem/FootageItem and active viewer kind are restored.
  var activeIndex = originalCensus.items["i" + original.activeItem.id].index;
  var activeItem = app.project.item(activeIndex);
  if (typeof activeItem.openInViewer !== "function") bad("viewer_action_unavailable");
  for (i = 0; i < original.items.length; i++) app.project.item(i + 1).selected = !!originalCensus.selections["i" + original.items[i].id];
  for (i = 0; i < original.comps.length; i++) {
    from = original.comps[i]; var comp = app.project.item(from.index);
    comp.time = timeString(from.time);
    for (j = 0; j < from.layers.length; j++) comp.layer(j + 1).selected = from.layers[j].selected;
  }
  var opened = activeItem.openInViewer();
  if (!opened || typeof opened.setActive !== "function" || opened.setActive() !== true) bad("viewer_activation_failed");
  var after = capture(); validate(after);
  if (after.projectFile !== original.projectFile || after.dirty !== false || !after.activeItem ||
      after.activeItem.kind !== original.activeItem.kind || after.activeItem.id !== mappedItems["i" + original.activeItem.id] ||
      after.activeItem.openInViewerAvailable !== original.activeItem.openInViewerAvailable || after.activeItem.viewerSetActiveAvailable !== original.activeItem.viewerSetActiveAvailable ||
      after.viewerKind !== original.viewerKind ||
      after.items.length !== original.items.length || after.comps.length !== original.comps.length) bad("restore_readback_mismatch");
  var selectedAfter = {}, expectedSelected = {};
  for (i = 0; i < after.projectSelectionIds.length; i++) selectedAfter["i" + after.projectSelectionIds[i]] = true;
  for (i = 0; i < original.projectSelectionIds.length; i++) expectedSelected["i" + mappedItems["i" + original.projectSelectionIds[i]]] = true;
  for (i = 0; i < original.items.length; i++) {
    from = original.items[i]; to = after.items[i];
    if (to.index !== from.index || to.id !== mappedItems["i" + from.id] || to.name !== from.name || to.kind !== from.kind ||
        !!selectedAfter["i" + to.id] !== !!expectedSelected["i" + to.id]) bad("restore_readback_mismatch");
  }
  for (i = 0; i < original.comps.length; i++) {
    from = original.comps[i]; to = after.comps[i];
    if (to.index !== from.index || to.id !== mappedItems["i" + from.id] || to.name !== from.name || to.time !== from.time || to.numLayers !== from.numLayers) bad("restore_readback_mismatch");
    for (j = 0; j < from.layers.length; j++) {
      var oldRow = from.layers[j], newRow = to.layers[j];
      if (!newRow || newRow.index !== oldRow.index || newRow.id !== mappedLayers["l" + oldRow.id] || newRow.name !== oldRow.name || newRow.kind !== oldRow.kind || newRow.selected !== oldRow.selected) bad("restore_readback_mismatch");
    }
    // validate(after) already proves selectedLayerIds exactly equals selected
    // flags. Equality is of sets, independent of AE's selection array order.
  }
  return {before: before, after: after, projectItemIdMap: itemMap, layerIdMap: layerMap};
})("capture");}

function supportedOperand(original){return (function uiBaselineProgram(operation, original, expectedSourceFile) {
  function bad(code) { throw Error("owned_ui_" + code); }
  function integer(value, minimum, maximum) {
    if (typeof value !== "number" || !isFinite(value) || (value === 0 && 1 / value === -Infinity) || value < minimum || value > maximum || Math.floor(value) !== value) bad("integer_invalid");
    return value;
  }
  function text(value) { if (typeof value !== "string" || value.indexOf("\x00") !== -1) bad("text_invalid"); return value; }
  function file(value) { text(value); if (!value.length || value.length > 32760) bad("project_file_invalid"); return value; }
  function keys(value, expected) {
    if (!value || typeof value !== "object" || Object.prototype.toString.call(value) === "[object Array]") bad("schema_invalid");
    var count = 0, key, i;
    for (key in value) if (Object.prototype.hasOwnProperty.call(value, key)) {
      count++; var found = false;
      for (i = 0; i < expected.length; i++) if (key === expected[i]) found = true;
      if (!found) bad("schema_invalid");
    }
    if (count !== expected.length) bad("schema_invalid");
    for (i = 0; i < expected.length; i++) if (!Object.prototype.hasOwnProperty.call(value, expected[i])) bad("schema_invalid");
  }
  function array(value, maximum) {
    if (Object.prototype.toString.call(value) !== "[object Array]") bad("array_invalid");
    integer(value.length, 0, maximum); return value;
  }
  function timeNumber(value) {
    if (typeof value !== "number" || !isFinite(value) || (value === 0 && 1 / value === -Infinity)) bad("time_invalid");
    return value.toPrecision(17);
  }
  function timeString(value) {
    text(value); if (!value.length || value.length > 32 || timeNumber(Number(value)) !== value) bad("time_invalid");
    return Number(value);
  }
  function itemKind(item) {
    if (item instanceof CompItem) return "comp";
    if (typeof FootageItem !== "undefined" && item instanceof FootageItem) return "footage";
    if (typeof FolderItem !== "undefined" && item instanceof FolderItem) return "folder";
    bad("item_kind_unavailable");
  }
  function layerKind(layer) {
    if (typeof TextLayer !== "undefined" && layer instanceof TextLayer) return "text";
    if (typeof ShapeLayer !== "undefined" && layer instanceof ShapeLayer) return "shape";
    if (typeof CameraLayer !== "undefined" && layer instanceof CameraLayer) return "camera";
    if (typeof LightLayer !== "undefined" && layer instanceof LightLayer) return "light";
    if (typeof AVLayer !== "undefined" && layer instanceof AVLayer) return "av";
    bad("layer_kind_unavailable");
  }
  function validate(value) {
    keys(value, ["schema", "projectFile", "dirty", "activeItem", "viewerKind", "projectSelectionIds", "items", "comps"]);
    if (value.schema !== "ae-agent.owned-native-ui-baseline.v1" || value.dirty !== false) bad("baseline_invalid");
    file(value.projectFile); array(value.items, 1000); array(value.comps, 1000); array(value.projectSelectionIds, 1000);
    var items = {}, comps = {}, layers = {}, selections = {}, compCount = 0, total = 0, i, j, row, layer, id, selected;
    for (i = 0; i < value.items.length; i++) {
      row = value.items[i]; keys(row, ["index", "id", "name", "kind"]); id = integer(row.id, 1, 9007199254740991); text(row.name);
      if (row.index !== i + 1 || items["i" + id] || (row.kind !== "comp" && row.kind !== "footage" && row.kind !== "folder")) bad("item_census_invalid");
      items["i" + id] = row; if (row.kind === "comp") compCount++;
    }
    if (value.comps.length !== compCount) bad("comp_census_invalid");
    var previousIndex = 0;
    for (i = 0; i < value.comps.length; i++) {
      row = value.comps[i]; keys(row, ["index", "id", "name", "time", "numLayers", "layers", "selectedLayerIds"]);
      id = integer(row.id, 1, 9007199254740991); integer(row.index, 1, value.items.length); text(row.name); timeString(row.time);
      var item = items["i" + id];
      if (!item || item.kind !== "comp" || item.index !== row.index || item.name !== row.name || comps["i" + id] || row.index <= previousIndex) bad("comp_census_invalid");
      previousIndex = row.index; comps["i" + id] = row;
      integer(row.numLayers, 0, 1000); array(row.layers, 1000); array(row.selectedLayerIds, 1000);
      if (row.layers.length !== row.numLayers || total > 1000 - row.numLayers) bad("layer_census_bound"); total += row.numLayers;
      var local = {}; selected = {};
      for (j = 0; j < row.layers.length; j++) {
        layer = row.layers[j]; keys(layer, ["index", "id", "name", "kind", "selected"]); id = integer(layer.id, 1, 9007199254740991); text(layer.name);
        if (layer.index !== j + 1 || layers["l" + id] || typeof layer.selected !== "boolean" ||
            (layer.kind !== "text" && layer.kind !== "shape" && layer.kind !== "camera" && layer.kind !== "light" && layer.kind !== "av")) bad("layer_census_invalid");
        layers["l" + id] = layer; local["l" + id] = layer;
      }
      for (j = 0; j < row.selectedLayerIds.length; j++) {
        id = integer(row.selectedLayerIds[j], 1, 9007199254740991);
        if (!local["l" + id] || !local["l" + id].selected || selected["l" + id]) bad("selected_layers_invalid"); selected["l" + id] = true;
      }
      for (j = 0; j < row.layers.length; j++) if (row.layers[j].selected !== !!selected["l" + row.layers[j].id]) bad("selected_layers_invalid");
    }
    for (i = 0; i < value.projectSelectionIds.length; i++) {
      id = integer(value.projectSelectionIds[i], 1, 9007199254740991);
      if (!items["i" + id] || selections["i" + id]) bad("project_selection_invalid"); selections["i" + id] = true;
    }
    if (value.activeItem !== null) {
      keys(value.activeItem, ["kind", "id", "openInViewerAvailable", "viewerSetActiveAvailable"]); id = integer(value.activeItem.id, 1, 9007199254740991);
      if (typeof value.activeItem.openInViewerAvailable !== "boolean" || typeof value.activeItem.viewerSetActiveAvailable !== "boolean") bad("active_item_invalid");
      if (!items["i" + id] || items["i" + id].kind !== value.activeItem.kind) bad("active_item_invalid");
    }
    if (value.viewerKind !== "none" && value.viewerKind !== "composition" && value.viewerKind !== "footage" && value.viewerKind !== "layer") bad("viewer_invalid");
    return {items: items, comps: comps, selections: selections};
  }
  function supported(value) {
    return value.activeItem !== null && value.activeItem.openInViewerAvailable === true && value.activeItem.viewerSetActiveAvailable === true &&
      ((value.activeItem.kind === "comp" && value.viewerKind === "composition") ||
      (value.activeItem.kind === "footage" && value.viewerKind === "footage"));
  }
  function capture() {
    var project = app.project, items = [], comps = [], selection = [], actualItems = {}, actualLayers = {}, total = 0, i, j, item, layer, row;
    if (!project || !project.file || project.dirty !== false) bad("project_not_clean");
    file(project.file.fsName); integer(project.numItems, 0, 1000);
    for (i = 1; i <= project.numItems; i++) {
      item = project.item(i); if (!item) bad("item_unavailable"); integer(item.id, 1, 9007199254740991); text(item.name);
      if (actualItems["i" + item.id] || typeof item.selected !== "boolean") bad("item_census_invalid"); actualItems["i" + item.id] = item;
      items.push({index: i, id: item.id, name: item.name, kind: itemKind(item)});
      if (item instanceof CompItem) {
        integer(item.numLayers, 0, 1000); if (total > 1000 - item.numLayers) bad("layer_census_bound"); total += item.numLayers;
        row = {index: i, id: item.id, name: item.name, time: timeNumber(item.time), numLayers: item.numLayers, layers: [], selectedLayerIds: []};
        for (j = 1; j <= item.numLayers; j++) {
          layer = item.layer(j); if (!layer) bad("layer_unavailable"); integer(layer.id, 1, 9007199254740991); text(layer.name);
          if (layer.index !== j || actualLayers["l" + layer.id] || typeof layer.selected !== "boolean") bad("layer_census_invalid"); actualLayers["l" + layer.id] = layer;
          row.layers.push({index: j, id: layer.id, name: layer.name, kind: layerKind(layer), selected: layer.selected});
        }
        var selected = item.selectedLayers; if (!selected) bad("selected_layers_unavailable"); integer(selected.length, 0, item.numLayers);
        for (j = 0; j < selected.length; j++) {
          layer = selected[j]; if (!layer || actualLayers["l" + layer.id] !== layer) bad("selected_layers_invalid"); row.selectedLayerIds.push(layer.id);
        }
        comps.push(row);
      }
    }
    var selectedItems = project.selection; if (!selectedItems) bad("project_selection_unavailable"); integer(selectedItems.length, 0, items.length);
    for (i = 0; i < selectedItems.length; i++) {
      item = selectedItems[i]; if (!item || actualItems["i" + item.id] !== item || item.selected !== true) bad("project_selection_invalid"); selection.push(item.id);
    }
    var active = project.activeItem, activeRow = null, viewer = "none";
    if (active !== null) {
      if (!active || actualItems["i" + active.id] !== active) bad("active_item_invalid");
      activeRow = {kind: itemKind(active), id: active.id, openInViewerAvailable: typeof active.openInViewer === "function",
        viewerSetActiveAvailable: !!app.activeViewer && typeof app.activeViewer.setActive === "function"};
    }
    if (app.activeViewer !== null) {
      if (!app.activeViewer || typeof ViewerType === "undefined") bad("viewer_unavailable");
      var type = app.activeViewer.type;
      if (type === ViewerType.VIEWER_COMPOSITION) viewer = "composition";
      else if (type === ViewerType.VIEWER_FOOTAGE) viewer = "footage";
      else if (type === ViewerType.VIEWER_LAYER) viewer = "layer";
      else bad("viewer_unavailable");
    }
    var value = {schema: "ae-agent.owned-native-ui-baseline.v1", projectFile: project.file.fsName, dirty: false, activeItem: activeRow,
      viewerKind: viewer, projectSelectionIds: selection, items: items, comps: comps};
    var census = validate(value);
    for (i = 0; i < items.length; i++) if (actualItems["i" + items[i].id].selected !== !!census.selections["i" + items[i].id]) bad("project_selection_invalid");
    return value;
  }
  if (operation === "capture") return capture();
  var originalCensus = validate(original);
  if (operation === "supported") return supported(original);
  if (operation !== "restore") bad("operation_invalid");
  file(expectedSourceFile);
  if (expectedSourceFile !== original.projectFile) bad("source_selector_mismatch");
  if (!supported(original)) bad("restore_operand_unsupported");
  var before = capture(), itemMap = [], layerMap = [], mappedItems = {}, mappedLayers = {}, i, j, from, to;
  if (before.projectFile !== expectedSourceFile) bad("source_selector_mismatch");
  if (before.items.length !== original.items.length || before.comps.length !== original.comps.length) bad("restore_census_mismatch");
  // Complete index/type/name census, including every comp's every layer, before
  // any write. Duplicate names are allowed; names alone never select a target.
  for (i = 0; i < original.items.length; i++) {
    from = original.items[i]; to = before.items[i];
    if (from.index !== to.index || from.kind !== to.kind || from.name !== to.name) bad("restore_census_mismatch");
    mappedItems["i" + from.id] = to.id; itemMap.push({originalId: from.id, reopenedId: to.id});
  }
  for (i = 0; i < original.comps.length; i++) {
    from = original.comps[i]; to = before.comps[i];
    if (from.index !== to.index || mappedItems["i" + from.id] !== to.id || from.name !== to.name || from.numLayers !== to.numLayers) bad("restore_census_mismatch");
    for (j = 0; j < from.layers.length; j++) {
      var oldLayer = from.layers[j], newLayer = to.layers[j];
      if (oldLayer.index !== newLayer.index || oldLayer.kind !== newLayer.kind || oldLayer.name !== newLayer.name) bad("restore_census_mismatch");
      mappedLayers["l" + oldLayer.id] = newLayer.id;
      layerMap.push({originalCompId: from.id, reopenedCompId: to.id, originalId: oldLayer.id, reopenedId: newLayer.id});
    }
  }
  // openInViewer has no universal tabs/layout contract. Only the original
  // supported active CompItem/FootageItem and active viewer kind are restored.
  var activeIndex = originalCensus.items["i" + original.activeItem.id].index;
  var activeItem = app.project.item(activeIndex);
  if (typeof activeItem.openInViewer !== "function") bad("viewer_action_unavailable");
  for (i = 0; i < original.items.length; i++) app.project.item(i + 1).selected = !!originalCensus.selections["i" + original.items[i].id];
  for (i = 0; i < original.comps.length; i++) {
    from = original.comps[i]; var comp = app.project.item(from.index);
    comp.time = timeString(from.time);
    for (j = 0; j < from.layers.length; j++) comp.layer(j + 1).selected = from.layers[j].selected;
  }
  var opened = activeItem.openInViewer();
  if (!opened || typeof opened.setActive !== "function" || opened.setActive() !== true) bad("viewer_activation_failed");
  var after = capture(); validate(after);
  if (after.projectFile !== original.projectFile || after.dirty !== false || !after.activeItem ||
      after.activeItem.kind !== original.activeItem.kind || after.activeItem.id !== mappedItems["i" + original.activeItem.id] ||
      after.activeItem.openInViewerAvailable !== original.activeItem.openInViewerAvailable || after.activeItem.viewerSetActiveAvailable !== original.activeItem.viewerSetActiveAvailable ||
      after.viewerKind !== original.viewerKind ||
      after.items.length !== original.items.length || after.comps.length !== original.comps.length) bad("restore_readback_mismatch");
  var selectedAfter = {}, expectedSelected = {};
  for (i = 0; i < after.projectSelectionIds.length; i++) selectedAfter["i" + after.projectSelectionIds[i]] = true;
  for (i = 0; i < original.projectSelectionIds.length; i++) expectedSelected["i" + mappedItems["i" + original.projectSelectionIds[i]]] = true;
  for (i = 0; i < original.items.length; i++) {
    from = original.items[i]; to = after.items[i];
    if (to.index !== from.index || to.id !== mappedItems["i" + from.id] || to.name !== from.name || to.kind !== from.kind ||
        !!selectedAfter["i" + to.id] !== !!expectedSelected["i" + to.id]) bad("restore_readback_mismatch");
  }
  for (i = 0; i < original.comps.length; i++) {
    from = original.comps[i]; to = after.comps[i];
    if (to.index !== from.index || to.id !== mappedItems["i" + from.id] || to.name !== from.name || to.time !== from.time || to.numLayers !== from.numLayers) bad("restore_readback_mismatch");
    for (j = 0; j < from.layers.length; j++) {
      var oldRow = from.layers[j], newRow = to.layers[j];
      if (!newRow || newRow.index !== oldRow.index || newRow.id !== mappedLayers["l" + oldRow.id] || newRow.name !== oldRow.name || newRow.kind !== oldRow.kind || newRow.selected !== oldRow.selected) bad("restore_readback_mismatch");
    }
    // validate(after) already proves selectedLayerIds exactly equals selected
    // flags. Equality is of sets, independent of AE's selection array order.
  }
  return {before: before, after: after, projectItemIdMap: itemMap, layerIdMap: layerMap};
})("supported",original);}

function restoreUiBaseline(original,expectedSourceFile){return (function uiBaselineProgram(operation, original, expectedSourceFile) {
  function bad(code) { throw Error("owned_ui_" + code); }
  function integer(value, minimum, maximum) {
    if (typeof value !== "number" || !isFinite(value) || (value === 0 && 1 / value === -Infinity) || value < minimum || value > maximum || Math.floor(value) !== value) bad("integer_invalid");
    return value;
  }
  function text(value) { if (typeof value !== "string" || value.indexOf("\x00") !== -1) bad("text_invalid"); return value; }
  function file(value) { text(value); if (!value.length || value.length > 32760) bad("project_file_invalid"); return value; }
  function keys(value, expected) {
    if (!value || typeof value !== "object" || Object.prototype.toString.call(value) === "[object Array]") bad("schema_invalid");
    var count = 0, key, i;
    for (key in value) if (Object.prototype.hasOwnProperty.call(value, key)) {
      count++; var found = false;
      for (i = 0; i < expected.length; i++) if (key === expected[i]) found = true;
      if (!found) bad("schema_invalid");
    }
    if (count !== expected.length) bad("schema_invalid");
    for (i = 0; i < expected.length; i++) if (!Object.prototype.hasOwnProperty.call(value, expected[i])) bad("schema_invalid");
  }
  function array(value, maximum) {
    if (Object.prototype.toString.call(value) !== "[object Array]") bad("array_invalid");
    integer(value.length, 0, maximum); return value;
  }
  function timeNumber(value) {
    if (typeof value !== "number" || !isFinite(value) || (value === 0 && 1 / value === -Infinity)) bad("time_invalid");
    return value.toPrecision(17);
  }
  function timeString(value) {
    text(value); if (!value.length || value.length > 32 || timeNumber(Number(value)) !== value) bad("time_invalid");
    return Number(value);
  }
  function itemKind(item) {
    if (item instanceof CompItem) return "comp";
    if (typeof FootageItem !== "undefined" && item instanceof FootageItem) return "footage";
    if (typeof FolderItem !== "undefined" && item instanceof FolderItem) return "folder";
    bad("item_kind_unavailable");
  }
  function layerKind(layer) {
    if (typeof TextLayer !== "undefined" && layer instanceof TextLayer) return "text";
    if (typeof ShapeLayer !== "undefined" && layer instanceof ShapeLayer) return "shape";
    if (typeof CameraLayer !== "undefined" && layer instanceof CameraLayer) return "camera";
    if (typeof LightLayer !== "undefined" && layer instanceof LightLayer) return "light";
    if (typeof AVLayer !== "undefined" && layer instanceof AVLayer) return "av";
    bad("layer_kind_unavailable");
  }
  function validate(value) {
    keys(value, ["schema", "projectFile", "dirty", "activeItem", "viewerKind", "projectSelectionIds", "items", "comps"]);
    if (value.schema !== "ae-agent.owned-native-ui-baseline.v1" || value.dirty !== false) bad("baseline_invalid");
    file(value.projectFile); array(value.items, 1000); array(value.comps, 1000); array(value.projectSelectionIds, 1000);
    var items = {}, comps = {}, layers = {}, selections = {}, compCount = 0, total = 0, i, j, row, layer, id, selected;
    for (i = 0; i < value.items.length; i++) {
      row = value.items[i]; keys(row, ["index", "id", "name", "kind"]); id = integer(row.id, 1, 9007199254740991); text(row.name);
      if (row.index !== i + 1 || items["i" + id] || (row.kind !== "comp" && row.kind !== "footage" && row.kind !== "folder")) bad("item_census_invalid");
      items["i" + id] = row; if (row.kind === "comp") compCount++;
    }
    if (value.comps.length !== compCount) bad("comp_census_invalid");
    var previousIndex = 0;
    for (i = 0; i < value.comps.length; i++) {
      row = value.comps[i]; keys(row, ["index", "id", "name", "time", "numLayers", "layers", "selectedLayerIds"]);
      id = integer(row.id, 1, 9007199254740991); integer(row.index, 1, value.items.length); text(row.name); timeString(row.time);
      var item = items["i" + id];
      if (!item || item.kind !== "comp" || item.index !== row.index || item.name !== row.name || comps["i" + id] || row.index <= previousIndex) bad("comp_census_invalid");
      previousIndex = row.index; comps["i" + id] = row;
      integer(row.numLayers, 0, 1000); array(row.layers, 1000); array(row.selectedLayerIds, 1000);
      if (row.layers.length !== row.numLayers || total > 1000 - row.numLayers) bad("layer_census_bound"); total += row.numLayers;
      var local = {}; selected = {};
      for (j = 0; j < row.layers.length; j++) {
        layer = row.layers[j]; keys(layer, ["index", "id", "name", "kind", "selected"]); id = integer(layer.id, 1, 9007199254740991); text(layer.name);
        if (layer.index !== j + 1 || layers["l" + id] || typeof layer.selected !== "boolean" ||
            (layer.kind !== "text" && layer.kind !== "shape" && layer.kind !== "camera" && layer.kind !== "light" && layer.kind !== "av")) bad("layer_census_invalid");
        layers["l" + id] = layer; local["l" + id] = layer;
      }
      for (j = 0; j < row.selectedLayerIds.length; j++) {
        id = integer(row.selectedLayerIds[j], 1, 9007199254740991);
        if (!local["l" + id] || !local["l" + id].selected || selected["l" + id]) bad("selected_layers_invalid"); selected["l" + id] = true;
      }
      for (j = 0; j < row.layers.length; j++) if (row.layers[j].selected !== !!selected["l" + row.layers[j].id]) bad("selected_layers_invalid");
    }
    for (i = 0; i < value.projectSelectionIds.length; i++) {
      id = integer(value.projectSelectionIds[i], 1, 9007199254740991);
      if (!items["i" + id] || selections["i" + id]) bad("project_selection_invalid"); selections["i" + id] = true;
    }
    if (value.activeItem !== null) {
      keys(value.activeItem, ["kind", "id", "openInViewerAvailable", "viewerSetActiveAvailable"]); id = integer(value.activeItem.id, 1, 9007199254740991);
      if (typeof value.activeItem.openInViewerAvailable !== "boolean" || typeof value.activeItem.viewerSetActiveAvailable !== "boolean") bad("active_item_invalid");
      if (!items["i" + id] || items["i" + id].kind !== value.activeItem.kind) bad("active_item_invalid");
    }
    if (value.viewerKind !== "none" && value.viewerKind !== "composition" && value.viewerKind !== "footage" && value.viewerKind !== "layer") bad("viewer_invalid");
    return {items: items, comps: comps, selections: selections};
  }
  function supported(value) {
    return value.activeItem !== null && value.activeItem.openInViewerAvailable === true && value.activeItem.viewerSetActiveAvailable === true &&
      ((value.activeItem.kind === "comp" && value.viewerKind === "composition") ||
      (value.activeItem.kind === "footage" && value.viewerKind === "footage"));
  }
  function capture() {
    var project = app.project, items = [], comps = [], selection = [], actualItems = {}, actualLayers = {}, total = 0, i, j, item, layer, row;
    if (!project || !project.file || project.dirty !== false) bad("project_not_clean");
    file(project.file.fsName); integer(project.numItems, 0, 1000);
    for (i = 1; i <= project.numItems; i++) {
      item = project.item(i); if (!item) bad("item_unavailable"); integer(item.id, 1, 9007199254740991); text(item.name);
      if (actualItems["i" + item.id] || typeof item.selected !== "boolean") bad("item_census_invalid"); actualItems["i" + item.id] = item;
      items.push({index: i, id: item.id, name: item.name, kind: itemKind(item)});
      if (item instanceof CompItem) {
        integer(item.numLayers, 0, 1000); if (total > 1000 - item.numLayers) bad("layer_census_bound"); total += item.numLayers;
        row = {index: i, id: item.id, name: item.name, time: timeNumber(item.time), numLayers: item.numLayers, layers: [], selectedLayerIds: []};
        for (j = 1; j <= item.numLayers; j++) {
          layer = item.layer(j); if (!layer) bad("layer_unavailable"); integer(layer.id, 1, 9007199254740991); text(layer.name);
          if (layer.index !== j || actualLayers["l" + layer.id] || typeof layer.selected !== "boolean") bad("layer_census_invalid"); actualLayers["l" + layer.id] = layer;
          row.layers.push({index: j, id: layer.id, name: layer.name, kind: layerKind(layer), selected: layer.selected});
        }
        var selected = item.selectedLayers; if (!selected) bad("selected_layers_unavailable"); integer(selected.length, 0, item.numLayers);
        for (j = 0; j < selected.length; j++) {
          layer = selected[j]; if (!layer || actualLayers["l" + layer.id] !== layer) bad("selected_layers_invalid"); row.selectedLayerIds.push(layer.id);
        }
        comps.push(row);
      }
    }
    var selectedItems = project.selection; if (!selectedItems) bad("project_selection_unavailable"); integer(selectedItems.length, 0, items.length);
    for (i = 0; i < selectedItems.length; i++) {
      item = selectedItems[i]; if (!item || actualItems["i" + item.id] !== item || item.selected !== true) bad("project_selection_invalid"); selection.push(item.id);
    }
    var active = project.activeItem, activeRow = null, viewer = "none";
    if (active !== null) {
      if (!active || actualItems["i" + active.id] !== active) bad("active_item_invalid");
      activeRow = {kind: itemKind(active), id: active.id, openInViewerAvailable: typeof active.openInViewer === "function",
        viewerSetActiveAvailable: !!app.activeViewer && typeof app.activeViewer.setActive === "function"};
    }
    if (app.activeViewer !== null) {
      if (!app.activeViewer || typeof ViewerType === "undefined") bad("viewer_unavailable");
      var type = app.activeViewer.type;
      if (type === ViewerType.VIEWER_COMPOSITION) viewer = "composition";
      else if (type === ViewerType.VIEWER_FOOTAGE) viewer = "footage";
      else if (type === ViewerType.VIEWER_LAYER) viewer = "layer";
      else bad("viewer_unavailable");
    }
    var value = {schema: "ae-agent.owned-native-ui-baseline.v1", projectFile: project.file.fsName, dirty: false, activeItem: activeRow,
      viewerKind: viewer, projectSelectionIds: selection, items: items, comps: comps};
    var census = validate(value);
    for (i = 0; i < items.length; i++) if (actualItems["i" + items[i].id].selected !== !!census.selections["i" + items[i].id]) bad("project_selection_invalid");
    return value;
  }
  if (operation === "capture") return capture();
  var originalCensus = validate(original);
  if (operation === "supported") return supported(original);
  if (operation !== "restore") bad("operation_invalid");
  file(expectedSourceFile);
  if (expectedSourceFile !== original.projectFile) bad("source_selector_mismatch");
  if (!supported(original)) bad("restore_operand_unsupported");
  var before = capture(), itemMap = [], layerMap = [], mappedItems = {}, mappedLayers = {}, i, j, from, to;
  if (before.projectFile !== expectedSourceFile) bad("source_selector_mismatch");
  if (before.items.length !== original.items.length || before.comps.length !== original.comps.length) bad("restore_census_mismatch");
  // Complete index/type/name census, including every comp's every layer, before
  // any write. Duplicate names are allowed; names alone never select a target.
  for (i = 0; i < original.items.length; i++) {
    from = original.items[i]; to = before.items[i];
    if (from.index !== to.index || from.kind !== to.kind || from.name !== to.name) bad("restore_census_mismatch");
    mappedItems["i" + from.id] = to.id; itemMap.push({originalId: from.id, reopenedId: to.id});
  }
  for (i = 0; i < original.comps.length; i++) {
    from = original.comps[i]; to = before.comps[i];
    if (from.index !== to.index || mappedItems["i" + from.id] !== to.id || from.name !== to.name || from.numLayers !== to.numLayers) bad("restore_census_mismatch");
    for (j = 0; j < from.layers.length; j++) {
      var oldLayer = from.layers[j], newLayer = to.layers[j];
      if (oldLayer.index !== newLayer.index || oldLayer.kind !== newLayer.kind || oldLayer.name !== newLayer.name) bad("restore_census_mismatch");
      mappedLayers["l" + oldLayer.id] = newLayer.id;
      layerMap.push({originalCompId: from.id, reopenedCompId: to.id, originalId: oldLayer.id, reopenedId: newLayer.id});
    }
  }
  // openInViewer has no universal tabs/layout contract. Only the original
  // supported active CompItem/FootageItem and active viewer kind are restored.
  var activeIndex = originalCensus.items["i" + original.activeItem.id].index;
  var activeItem = app.project.item(activeIndex);
  if (typeof activeItem.openInViewer !== "function") bad("viewer_action_unavailable");
  for (i = 0; i < original.items.length; i++) app.project.item(i + 1).selected = !!originalCensus.selections["i" + original.items[i].id];
  for (i = 0; i < original.comps.length; i++) {
    from = original.comps[i]; var comp = app.project.item(from.index);
    comp.time = timeString(from.time);
    for (j = 0; j < from.layers.length; j++) comp.layer(j + 1).selected = from.layers[j].selected;
  }
  var opened = activeItem.openInViewer();
  if (!opened || typeof opened.setActive !== "function" || opened.setActive() !== true) bad("viewer_activation_failed");
  var after = capture(); validate(after);
  if (after.projectFile !== original.projectFile || after.dirty !== false || !after.activeItem ||
      after.activeItem.kind !== original.activeItem.kind || after.activeItem.id !== mappedItems["i" + original.activeItem.id] ||
      after.activeItem.openInViewerAvailable !== original.activeItem.openInViewerAvailable || after.activeItem.viewerSetActiveAvailable !== original.activeItem.viewerSetActiveAvailable ||
      after.viewerKind !== original.viewerKind ||
      after.items.length !== original.items.length || after.comps.length !== original.comps.length) bad("restore_readback_mismatch");
  var selectedAfter = {}, expectedSelected = {};
  for (i = 0; i < after.projectSelectionIds.length; i++) selectedAfter["i" + after.projectSelectionIds[i]] = true;
  for (i = 0; i < original.projectSelectionIds.length; i++) expectedSelected["i" + mappedItems["i" + original.projectSelectionIds[i]]] = true;
  for (i = 0; i < original.items.length; i++) {
    from = original.items[i]; to = after.items[i];
    if (to.index !== from.index || to.id !== mappedItems["i" + from.id] || to.name !== from.name || to.kind !== from.kind ||
        !!selectedAfter["i" + to.id] !== !!expectedSelected["i" + to.id]) bad("restore_readback_mismatch");
  }
  for (i = 0; i < original.comps.length; i++) {
    from = original.comps[i]; to = after.comps[i];
    if (to.index !== from.index || to.id !== mappedItems["i" + from.id] || to.name !== from.name || to.time !== from.time || to.numLayers !== from.numLayers) bad("restore_readback_mismatch");
    for (j = 0; j < from.layers.length; j++) {
      var oldRow = from.layers[j], newRow = to.layers[j];
      if (!newRow || newRow.index !== oldRow.index || newRow.id !== mappedLayers["l" + oldRow.id] || newRow.name !== oldRow.name || newRow.kind !== oldRow.kind || newRow.selected !== oldRow.selected) bad("restore_readback_mismatch");
    }
    // validate(after) already proves selectedLayerIds exactly equals selected
    // flags. Equality is of sets, independent of AE's selection array order.
  }
  return {before: before, after: after, projectItemIdMap: itemMap, layerIdMap: layerMap};
})("restore",original,expectedSourceFile);}

module.exports = {captureUiBaseline, supportedOperand, restoreUiBaseline};
