(function () {
    // Reviewed fixed entry points. All identity checks use actual AE APIs.
    function fault(code) { var e = new Error(code); e.coreCode = code; throw e; }
    function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
    function target(p) {
        if (typeof AE_CORE_SESSION_ID !== 'string' || p.sessionId !== AE_CORE_SESSION_ID) fault('session_cas');
        if (!app.project || !app.project.file || String(app.project.file.fsName) !== p.projectId) fault('project_cas');
        var comp = null, layer = null, i;
        for (i = 1; i <= app.project.numItems; i++) if (app.project.item(i).id === p.compId) comp = app.project.item(i);
        if (!(comp instanceof CompItem)) fault('comp_cas');
        for (i = 1; i <= comp.numLayers; i++) if (comp.layer(i).id === p.layerId) layer = comp.layer(i);
        if (!layer || !layer.source || layer.locked || layer.timeRemapEnabled) fault('unsupported_layer');
        return { comp: comp, layer: layer };
    }
    function vector(prop) {
        if (!prop || prop.numKeys !== 0 || prop.isTimeVarying || prop.expressionEnabled || prop.expression) fault('unsupported_transform');
        return prop.value;
    }
    function snapshot(p) {
        var t = target(p), l = t.layer, group = l.property('ADBE Transform Group');
        if (!group) fault('unsupported_transform');
        var state = {
            startTime: l.startTime, inPoint: l.inPoint, outPoint: l.outPoint, stretch: l.stretch,
            enabled: l.enabled, threeDLayer: l.threeDLayer,
            anchor: vector(group.property('ADBE Anchor Point')), position: vector(group.property('ADBE Position')),
            scale: vector(group.property('ADBE Scale')), rotation: vector(group.property('ADBE Rotate Z')),
            opacity: vector(group.property('ADBE Opacity'))
        };
        if (l.threeDLayer) fault('unsupported_3d');
        var resource = { sessionId: p.sessionId, projectId: p.projectId, compId: t.comp.id, layerId: l.id };
        var protectedState = JSON.stringify(state);
        return { target: resource, sourceId: l.source.id, protected: protectedState, revision: JSON.stringify([resource, l.source.id, state]) };
    }
    function mutate(p) {
        var started = false;
        try {
            var before = snapshot(p);
            if (before.revision !== p.expectedRevision || before.sourceId !== p.expectedOldSourceId) fault('stale_target');
            var source = null;
            for (var i = 1; i <= app.project.numItems; i++) if (app.project.item(i).id === p.newSourceId) source = app.project.item(i);
            if (!(source instanceof FootageItem) || !source.mainSource || source.mainSource.isStill !== true) fault('new_source_must_be_imported_still');
            var l = target(p).layer;
            started = true; l.replaceSource(source, false);
            var after = snapshot(p);
            if (after.sourceId !== p.newSourceId || !same(after.protected, before.protected)) fault('readback_mismatch');
            return { outcome: 'applied', snapshot: after };
        } catch (e) { return { outcome: started ? 'unknown' : 'rejected', code: e.coreCode || 'ae_error' }; }
    }
    return { inspect: snapshot, mutate: mutate, verify: snapshot };
}())
