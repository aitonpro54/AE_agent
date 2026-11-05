(function () {
    var POLICY = 'current-matching-target-after-local-confirmation-v1';
    var TAG = 'AE_CORE4_VARIANT_V1:';
    function fault(code) { var error = new Error(code); error.coreCode = code; throw error; }
    function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
    function compFor(p) {
        var project = app.project, comp;
        if (!project || !project.file || String(project.file.fsName) !== p.projectId) fault('project_cas');
        comp = project.itemByID(p.compId);
        if (!(comp instanceof CompItem) || comp.comment !== 'AE_CORE4_TEXT_WORKSPACE_V1' || comp.numLayers > 60 ||
            comp.pixelAspect !== 1) fault('text_variant_workspace');
        return comp;
    }
    function markerData(value) {
        return JSON.stringify([value.comment, value.chapter, value.url, value.frameTarget, value.cuePointName,
            value.duration, value.label, value.eventCuePoint, value.protectedRegion, value.getParameters()]);
    }
    function markerAt(prop, index) {
        var value = prop.keyValue(index);
        return { time: prop.keyTime(index), comment: String(value.comment), data: markerData(value) };
    }
    function names(group, modifiedOnly) {
        var list = [], i, prop;
        if (!group) return list;
        for (i = 1; i <= group.numProperties; i++) {
            prop = group.property(i);
            if (!modifiedOnly || prop.isModified === true) list.push(String(prop.matchName));
        }
        if (list.length > 24) fault('text_variant_property_budget');
        return list;
    }
    function xy(prop, z) {
        if (!prop || prop.numKeys !== 0 || prop.isTimeVarying || prop.expressionEnabled || prop.expression) return null;
        var v = prop.value;
        if ((v.length !== 2 && !(v.length === 3 && v[2] === z)) || !isFinite(v[0]) || !isFinite(v[1])) return null;
        return [v[0], v[1]];
    }
    function xyNames(layer) {
        var group = layer.property('ADBE Transform Group');
        return { anchor: group.property('ADBE Anchor Point'), position: group.property('ADBE Position'), scale: group.property('ADBE Scale') };
    }
    function read(layer, properties) {
        var source = properties.property('ADBE Text Document'), markers = layer.property('ADBE Marker');
        var result = { layerId: layer.id, name: layer.name, tag: String(layer.comment), enabled: layer.enabled,
            eligible: !layer.locked && !layer.solo && !layer.isTrackMatte && !layer.guideLayer && !layer.adjustmentLayer,
            effects: names(layer.property('ADBE Effect Parade'), false), animators: names(properties.property('ADBE Text Animators'), false),
            styles: names(layer.property('ADBE Layer Styles'), true), markers: [] };
        if (result.name.length > 256 || result.tag.length > 160 || markers.numKeys > 32) fault('text_variant_inventory');
        for (var i = 1; i <= markers.numKeys; i++) result.markers.push(markerAt(markers, i));
        if (layer.hasTrackMatte) {
            if (!layer.trackMatteLayer) fault('text_variant_matte');
            result.matteLayerId = layer.trackMatteLayer.id;
        }
        if (source && source.numKeys === 0 && !source.isTimeVarying && !source.expressionEnabled && !source.expression) {
            var doc = source.value, text = String(doc.text).replace(/\r/g, '\n');
            if (doc.pointText === true && text && text.length <= 600) result.text = text;
        }
        if (!layer.threeDLayer && !layer.parent) {
            var t = xyNames(layer), anchor = xy(t.anchor, 0), position = xy(t.position, 0), scale = xy(t.scale, 100);
            if (anchor && position && scale && t.position.dimensionsSeparated === false) result.transform = { anchor: anchor, position: position, scale: scale };
        }
        return result;
    }
    function inspect(p) {
        var comp = compFor(p), layers = [], outside = [], layer, properties, i;
        for (i = 1; i <= comp.numLayers; i++) {
            layer = comp.layer(i);
            properties = layer.property('ADBE Text Properties');
            if (properties) layers.push(read(layer, properties));
            else outside.push([layer.id, layer.name, layer.enabled, layer.locked, layer.solo]);
        }
        var target = { projectId: p.projectId, compId: comp.id };
        var preserved = JSON.stringify([comp.name, comp.comment, comp.width, comp.height, comp.duration, comp.time, outside]);
        var revision = JSON.stringify([target, preserved, layers]);
        if (layers.length > 30 || preserved.length > 10000 || revision.length > 35000) fault('text_variant_inventory');
        return { target: target, revision: revision, 'protected': preserved, layers: layers };
    }
    function byId(layers, id) {
        for (var i = 0; i < layers.length; i++) if (layers[i].layerId === id) return layers[i];
        fault('text_variant_targets');
    }
    function nativeLayer(comp, id) {
        for (var i = 1; i <= comp.numLayers; i++) if (comp.layer(i).id === id) return comp.layer(i);
        fault('text_variant_targets');
    }
    function preflight(p, before) {
        var proof = p._execution, i, target = before.target, desired = p.derive, state = {};
        if (!proof || proof.policyId !== POLICY || before.revision !== p.expectedRevision ||
            proof.baselineRevision !== before.revision || proof.baselineProtected !== before['protected'] ||
            !proof.target || proof.target.projectId !== target.projectId || proof.target.compId !== target.compId) fault('text_variant_binding');
        for (i = 0; i < p.controlledLayerIds.length; i++) {
            var item = byId(before.layers, p.controlledLayerIds[i]);
            if (!item.eligible) fault('text_variant_targets');
        }
        if (!desired) return state;
        var original = byId(before.layers, desired.templateLayerId), layout = byId(before.layers, desired.layoutLayerId);
        state.layout = layout;
        if (!original.text || !layout.text || !original.transform || !layout.transform ||
            layout.tag.indexOf('AE_CORE4_TEXT_V1:') !== 0 || original.layerId === layout.layerId) fault('text_variant_derive');
        if (desired.markerSourceLayerId === undefined) return state;
        var markers = byId(before.layers, desired.markerSourceLayerId).markers;
        for (i = 0; i < markers.length; i++) {
            if (markers[i].comment !== 'IN') continue;
            if (state.marker) fault('text_variant_in_marker');
            state.marker = markers[i];
            state.markerIndex = i + 1;
        }
        if (!state.marker) fault('text_variant_in_marker');
        for (i = 0; i < original.markers.length; i++) {
            var current = original.markers[i];
            if (current.comment !== 'IN' && Math.abs(current.time - state.marker.time) > 0.00001) continue;
            if (!same(current, state.marker)) fault('text_variant_marker_collision');
            state.markerIndex = null;
        }
        return state;
    }
    function cloneFor(p, comp, state, owned) {
        var desired = p.derive, original = nativeLayer(comp, desired.templateLayerId);
        var output = original.duplicate();
        owned.layer = output;
        output.name = desired.name;
        output.comment = TAG + desired.slot;
        var layout = nativeLayer(comp, desired.layoutLayerId);
        var nativeDocument = layout.property('ADBE Text Properties').property('ADBE Text Document').value;
        output.property('ADBE Text Properties').property('ADBE Text Document').setValue(nativeDocument);
        var from = xyNames(layout), to = xyNames(output);
        to.anchor.setValue(from.anchor.value);
        to.position.setValue(from.position.value);
        to.scale.setValue(from.scale.value);
        if (state.markerIndex) {
            var fromMarkers = nativeLayer(comp, desired.markerSourceLayerId).property('ADBE Marker');
            output.property('ADBE Marker').setValueAtTime(state.marker.time, fromMarkers.keyValue(state.markerIndex));
        }
        return output;
    }
    function write(p, before, state) {
        var comp = compFor(p), owned = {}, previous = [], after, i, layer;
        try {
            var selected = p.derive ? cloneFor(p, comp, state, owned) : nativeLayer(comp, p.activeLayerId);
            for (i = 0; i < p.controlledLayerIds.length; i++) {
                layer = nativeLayer(comp, p.controlledLayerIds[i]);
                previous.push({ layer: layer, enabled: layer.enabled });
                layer.enabled = layer.id === selected.id;
            }
            selected.enabled = true;
            after = inspect(p);
            if (!byId(after.layers, selected.id).enabled || after['protected'] !== before['protected']) fault('text_variant_readback');
            return after;
        } catch (e) {
            for (i = 0; i < previous.length; i++) previous[i].layer.enabled = previous[i].enabled;
            if (owned.layer) owned.layer.remove();
            throw e;
        }
    }
    function mutate(p) {
        var started = false;
        try {
            var before = inspect(p), state = preflight(p, before), after, proof = p._execution;
            var detail = p.derive ? 'Создать «' + p.derive.name + '» из слоя ' + p.derive.templateLayerId + ', текст из слоя ' + p.derive.layoutLayerId +
                (p.derive.markerSourceLayerId ? ', маркер IN из слоя ' + p.derive.markerSourceLayerId : '') : 'Показать слой ' + p.activeLayerId;
            if (confirm(detail + '?\nПроект: ' + p.projectId + '\ncompId: ' + p.compId +
                '\nУправляемая видимость слоёв: ' + p.controlledLayerIds.join(', '), true, 'AE Agent Core4 — вариант текста') !== true) {
                return { outcome: 'rejected', code: 'local_cancelled' };
            }
            before = inspect(p);
            state = preflight(p, before);
            app.beginUndoGroup('AE Agent Core4 Text Variant');
            try { started = true; after = write(p, before, state); }
            finally { app.endUndoGroup(); }
            return { outcome: 'applied', snapshot: after, transactionReceipt: { version: 2, policyId: POLICY,
                proposalId: proof.proposalId, planDigest: proof.planDigest, taskId: proof.taskId, taskEpoch: proof.taskEpoch,
                stepId: proof.stepId, checkpointRef: proof.checkpointRef, checkpointDigest: proof.checkpointDigest,
                baselineDigest: proof.baselineDigest, baselineRevision: proof.baselineRevision, target: after.target,
                resultRevision: after.revision, protectedFields: after['protected'] } };
        } catch (e) { return { outcome: started ? 'unknown' : 'rejected', code: e.coreCode || 'text_variant_ae_error' }; }
    }
    return { inspect: inspect, mutate: mutate, verify: inspect };
}())
