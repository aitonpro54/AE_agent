(function () {
    function fault(code) { var e = new Error(code); e.coreCode = code; throw e; }
    var characterFields = ['font', 'fontSize', 'applyFill', 'fillColor', 'applyStroke', 'strokeColor', 'strokeWidth', 'tracking', 'baselineShift', 'horizontalScale', 'verticalScale', 'fauxBold', 'fauxItalic'];
    var paragraphFields = ['justification', 'leading', 'autoLeading'];
    function target(p) {
        if (typeof AE_CORE_SESSION_ID !== 'string' || p.sessionId !== AE_CORE_SESSION_ID) fault('session_cas');
        if (!app.project || !app.project.file || String(app.project.file.fsName) !== p.projectId) fault('project_cas');
        var comp = null, layer = null, i;
        for (i = 1; i <= app.project.numItems; i++) if (app.project.item(i).id === p.compId) comp = app.project.item(i);
        if (!(comp instanceof CompItem)) fault('comp_cas');
        for (i = 1; i <= comp.numLayers; i++) if (comp.layer(i).id === p.layerId) layer = comp.layer(i);
        if (!layer || layer.locked) fault('layer_cas');
        var group = layer.property('ADBE Text Properties'), prop = group && group.property('ADBE Text Document');
        if (!prop || prop.numKeys !== 0 || prop.isTimeVarying || prop.expressionEnabled || prop.expression) fault('unsupported_animated_text');
        return { comp: comp, layer: layer, prop: prop };
    }
    function fields(object, names) {
        var out = {}, i, value;
        for (i = 0; i < names.length; i++) {
            value = object[names[i]];
            if (typeof value === 'undefined' || value === null) fault('unsupported_style_api');
            out[names[i]] = value;
        }
        return out;
    }
    function snapshot(p) {
        var t = target(p), doc = t.prop.value;
        if (!doc || typeof doc.text !== 'string' || doc.text.length === 0 || /[\r\n]/.test(doc.text) || typeof doc.characterRange !== 'function') fault('unsupported_style_proof');
        var uniform = fields(doc, characterFields), i;
        // One preview TextDocument is insufficient: inspect every character range.
        for (i = 0; i < doc.text.length; i++) if (JSON.stringify(fields(doc.characterRange(i, i + 1), characterFields)) !== JSON.stringify(uniform)) fault('unsupported_mixed_style');
        var style = { character: uniform, paragraph: fields(doc, paragraphFields) };
        var resource = { sessionId: p.sessionId, projectId: p.projectId, compId: t.comp.id, layerId: t.layer.id };
        return { target: resource, text: doc.text, protected: JSON.stringify(style), revision: JSON.stringify([resource, doc.text, style]) };
    }
    function mutate(p) {
        var started = false;
        try {
            var before = snapshot(p);
            if (p.expectedRevision !== before.revision || p.expectedText !== before.text) fault('stale_target');
            if (typeof p.text !== 'string' || p.text.length === 0 || /[\r\n]/.test(p.text)) fault('unsupported_text');
            var t = target(p), doc = t.prop.value; doc.text = p.text;
            started = true; t.prop.setValue(doc);
            var after = snapshot(p);
            if (after.text !== p.text || after.protected !== before.protected) fault('readback_mismatch');
            return { outcome: 'applied', snapshot: after };
        } catch (e) { return { outcome: started ? 'unknown' : 'rejected', code: e.coreCode || 'ae_error' }; }
    }
    return { inspect: snapshot, mutate: mutate, verify: snapshot };
}())
