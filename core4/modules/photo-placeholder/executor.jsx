(function () {
    // Reviewed fixed entry points. All identity checks use actual AE APIs.
    function fault(code) { var e = new Error(code); e.coreCode = code; throw e; }
    function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
    function target(p, current) {
        if (!current && (typeof AE_CORE_SESSION_ID !== 'string' || p.sessionId !== AE_CORE_SESSION_ID)) fault('session_cas');
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
    function sourceInfo(source) {
        return { name: source.name, file: source instanceof FootageItem && source.file ? String(source.file.fsName) : '',
            width: source.width, height: source.height, pixelAspect: source.pixelAspect };
    }
    function protectNeighbors(t, state) {
        var comp = t.comp, layers = [];
        if (comp.numLayers > 64) fault('inspection_result_budget');
        for (var i = 1; i <= comp.numLayers; i++) {
            var layer = comp.layer(i);
            layers.push([layer.id, layer.id === t.layer.id ? null : layer.name,
                layer.id !== t.layer.id && layer.source ? layer.source.id : null, layer.enabled,
                layer.locked, layer.inPoint, layer.outPoint]);
        }
        state.comp = [comp.name, comp.width, comp.height, comp.pixelAspect, comp.duration, comp.frameDuration];
        state.layers = layers;
    }
    function snapshot(p, current) {
        var t = target(p, current), l = t.layer, group = l.property('ADBE Transform Group');
        if (!group) fault('unsupported_transform');
        var state = {
            startTime: l.startTime, inPoint: l.inPoint, outPoint: l.outPoint, stretch: l.stretch,
            enabled: l.enabled, threeDLayer: l.threeDLayer,
            anchor: vector(group.property('ADBE Anchor Point')), position: vector(group.property('ADBE Position')),
            scale: vector(group.property('ADBE Scale')), rotation: vector(group.property('ADBE Rotate Z')),
            opacity: vector(group.property('ADBE Opacity'))
        };
        if (l.threeDLayer) fault('unsupported_3d');
        if (current) protectNeighbors(t, state);
        var resource = { sessionId: p.sessionId, projectId: p.projectId, compId: t.comp.id, layerId: l.id };
        var result = { target: resource, sourceId: l.source.id, 'protected': JSON.stringify(state) };
        var revision = [resource, l.source.id, state];
        if (current) {
            result.source = sourceInfo(l.source);
            revision.push(result.source);
        }
        result.revision = JSON.stringify(revision);
        if (current && (result.revision.length > 8192 || result['protected'].length > 8192)) fault('inspection_result_budget');
        return result;
    }
    function importedStill(p) {
        var source = null;
        for (var i = 1; i <= app.project.numItems; i++) if (app.project.item(i).id === p.newSourceId) source = app.project.item(i);
        if (!(source instanceof FootageItem) || !source.mainSource || source.mainSource.isStill !== true) fault('new_source_must_be_imported_still');
        return source;
    }
    function requireBaseline(p, before) {
        if (before.revision !== p.expectedRevision || before.sourceId !== p.expectedOldSourceId) fault('stale_target');
    }
    function requireCurrentSource(source, before) {
        if (!source.file || !source.file.exists || source.footageMissing || source.hasVideo !== true) fault('new_source_must_be_imported_still');
        if (source.width !== before.source.width || source.height !== before.source.height || source.pixelAspect !== before.source.pixelAspect) fault('source_geometry_changed');
        return sourceInfo(source);
    }
    function readCurrent(p) {
        try { return snapshot(p, true); }
        catch (e) {
            return { readFailureVersion: 1, outcome: 'rejected', code: e.coreCode === 'inspection_result_budget' ? e.coreCode : 'inspection_failed' };
        }
    }
    function mutate(p, current) {
        var started = false;
        try {
            var before = snapshot(p, current);
            requireBaseline(p, before);
            var source = importedStill(p), proof, desired;
            if (current) {
                if (p.newSourceId === before.sourceId) fault('source_already_selected');
                desired = requireCurrentSource(source, before);
                proof = p._execution;
                if (!proof || proof.policyId !== 'current-matching-target-after-local-confirmation-v1' ||
                    proof.baselineRevision !== before.revision || proof.baselineProtected !== before['protected'] ||
                    !proof.target || proof.target.sessionId !== p.sessionId || proof.target.projectId !== p.projectId ||
                    proof.target.compId !== p.compId || proof.target.layerId !== p.layerId) fault('manual_approval_binding');
                var message = 'Заменить источник слоя в текущем проекте?\nПроект: ' + p.projectId +
                    '\ncompId: ' + p.compId + ' / layerId: ' + p.layerId +
                    '\nСтарый источник #' + before.sourceId + ': ' + JSON.stringify(before.source.file || before.source.name) +
                    '\nНовый источник #' + p.newSourceId + ': ' + JSON.stringify(desired.file);
                if (confirm(message, true, 'AE Agent Core4 — замена источника фото') !== true) return { outcome: 'rejected', code: 'local_cancelled' };
                before = snapshot(p, true);
                requireBaseline(p, before);
                source = importedStill(p);
                if (!same(desired, requireCurrentSource(source, before))) fault('stale_new_source');
            }
            var l = target(p, current).layer;
            started = true; l.replaceSource(source, false);
            var after = snapshot(p, current);
            if (after.sourceId !== p.newSourceId || !same(after['protected'], before['protected'])) fault('readback_mismatch');
            if (current) {
                var verified = snapshot(p, true);
                if (!same(verified, after) || !same(verified.source, desired)) fault('local_transaction_readback');
                return { outcome: 'applied', snapshot: verified, transactionReceipt: { version: 2, policyId: proof.policyId,
                    proposalId: proof.proposalId, planDigest: proof.planDigest, taskId: proof.taskId, taskEpoch: proof.taskEpoch,
                    stepId: proof.stepId, checkpointRef: proof.checkpointRef, checkpointDigest: proof.checkpointDigest,
                    baselineDigest: proof.baselineDigest, baselineRevision: proof.baselineRevision, target: verified.target,
                    resultRevision: verified.revision, protectedFields: verified['protected'] } };
            }
            return { outcome: 'applied', snapshot: after };
        } catch (e) { return { outcome: started ? 'unknown' : 'rejected', code: e.coreCode || 'ae_error' }; }
    }
    function readLegacy(p) { return snapshot(p, false); }
    return { inspect: readLegacy, mutate: function (p) { return mutate(p, false); }, verify: readLegacy,
        inspectCurrent: readCurrent, mutateCurrent: function (p) { return mutate(p, true); }, verifyCurrent: readCurrent };
}())
