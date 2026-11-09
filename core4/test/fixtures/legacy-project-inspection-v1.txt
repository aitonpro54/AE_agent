(function () {
  function inspect(input) {
    if (!input || typeof input !== 'object') throw new Error('invalid_inspection');
    var key;
    for (key in input) if (Object.prototype.hasOwnProperty.call(input, key) && key !== 'compId') throw new Error('invalid_inspection');
    if (input.compId !== undefined && (typeof input.compId !== 'number' || input.compId < 1 || input.compId % 1)) throw new Error('invalid_comp_id');
    var p = app.project, comps = [], selected = null, i, j, c, l, layers = [], shortened = false;
    function display(value) { var text = String(value); if (text.length > 256) { shortened = true; return text.slice(0, 256); } return text; }
    if (!p) throw new Error('project_unavailable');
    for (i = 1; i <= Math.min(p.numItems, 500); i++) {
      c = p.item(i);
      if (c instanceof CompItem) {
        if (comps.length < 50) comps.push({ compId: c.id, name: display(c.name), numLayers: c.numLayers, duration: c.duration });
        if (c.id === input.compId) selected = c;
      }
    }
    if (input.compId !== undefined && !selected) throw new Error('comp_not_found');
    if (selected) for (j = 1; j <= Math.min(selected.numLayers, 100); j++) {
      l = selected.layer(j); layers.push({ layerId: l.id, index: j, name: display(l.name), textLayer: !!l.property('ADBE Text Properties') });
    }
    var result = { observationVersion: 1, target: { projectId: p.file ? p.file.fsName : null, compId: selected ? selected.id : null },
      project: { name: p.file ? display(p.file.name) : 'Несохранённый проект', numItems: p.numItems, saved: !!p.file },
      compositions: comps, layers: layers, truncated: shortened || p.numItems > 50 || !!(selected && selected.numLayers > 100), aeVersion: app.version };
    while (JSON.stringify(result).length > 40000 && (layers.length || comps.length)) { result.truncated = true; if (layers.length) layers.pop(); else comps.pop(); }
    if (JSON.stringify(result).length > 40000) return { readFailureVersion: 1, outcome: 'rejected', code: 'inspection_result_budget' };
    return result;
  }
  return { inspect: inspect };
}())
