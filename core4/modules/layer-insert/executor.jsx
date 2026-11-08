(function () {
    var policy = 'current-matching-target-after-local-confirmation-v1';
    var optionalRoots = ['ADBE Marker', 'ADBE Time Remapping', 'ADBE Audio Group', 'ADBE Layer Overrides',
        'ADBE Layer Styles', 'ADBE Blend Options Group', 'ADBE Material Options Group', 'ADBE Plane Options Group',
        'ADBE Extrsn Options Group'];
    function fault(code) { var error = new Error(code); error.coreCode = code; throw error; }
    function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
    function byId(a, b) { return a.compId - b.compId || a.layerId - b.layerId; }
    function vector(transform, matchName) {
        var property = transform.property(matchName);
        return property && property.expressionEnabled !== true ? property.value : [];
    }
    function describeLayer(layer) {
        var av = layer instanceof AVLayer;
        var matte = av && layer.trackMatteLayer;
        if (av && (typeof layer.hasTrackMatte !== 'boolean' || layer.hasTrackMatte !== !!matte)) fault('layer_insert_matte_unobserved');
        var transform = layer.property('ADBE Transform Group');
        if (!transform) fault('layer_insert_transform_unobserved');
        return { id: layer.id, sourceId: av && layer.source ? layer.source.id : 0, name: layer.name,
            parentId: layer.parent ? layer.parent.id : 0, matteId: matte ? matte.id : 0,
            matteType: av ? Number(layer.trackMatteType) : 0, enabled: layer.enabled, solo: layer.solo,
            start: layer.startTime, inPoint: layer.inPoint, outPoint: layer.outPoint, stretch: layer.stretch,
            position: vector(transform, 'ADBE Position'), scale: vector(transform, 'ADBE Scale') };
    }
    function inspectProperties(group, budget, depth) {
        if (!group || ++budget.properties > 100000 || depth > 32) fault('inspection_result_budget');
        if (group.propertyType === PropertyType.PROPERTY) {
            if (group.canSetExpression && typeof group.expressionEnabled !== 'boolean') fault('inspection_failed');
            if (group.expressionEnabled === true) budget.unsafe = true;
            if (group.propertyValueType === PropertyValueType.LAYER_INDEX &&
                (group.numKeys !== 0 || group.value !== 0)) budget.unsafe = true;
            return;
        }
        if (typeof group.numProperties !== 'number') fault('inspection_failed');
        for (var i = 1; i <= group.numProperties; i++) inspectProperties(group.property(i), budget, depth + 1);
    }
    function inspectLayer(layer, budget) {
        var kind = layer.matchName, roots = ['ADBE Transform Group'];
        if (kind === 'ADBE Text Layer') roots.push('ADBE Text Properties');
        else if (kind === 'ADBE Vector Layer') roots.push('ADBE Root Vectors Group');
        else if (kind === 'ADBE Camera Layer') roots.push('ADBE Camera Options Group');
        else if (kind === 'ADBE Light Layer') roots.push('ADBE Light Options Group');
        else if (kind !== 'ADBE AV Layer') fault('layer_insert_layer_unobserved');
        if (layer instanceof AVLayer) {
            if (layer.hasAudio === true) roots.push('ADBE Audio Group');
            if (layer.timeRemapEnabled === true) roots.push('ADBE Time Remapping');
            if (layer.threeDLayer === true) roots.push('ADBE Material Options Group');
        }
        inspectProperties(layer, budget, 0);
        for (var i = 0; i < roots.length; i++) inspectProperties(layer.property(roots[i]), budget, 1);
        for (var j = 0; j < optionalRoots.length; j++) {
            var group = layer.property(optionalRoots[j]);
            if (group) inspectProperties(group, budget, 1);
        }
    }
    function sourceInfo(source) {
        if (!source || source.useProxy) fault('layer_insert_source_unavailable');
        if (source instanceof CompItem) return { kind: 'comp', name: source.name, duration: source.duration, file: '' };
        if (!(source instanceof FootageItem) || !source.mainSource || !source.file ||
            !source.file.exists || source.footageMissing || (source.hasVideo !== true && source.hasAudio !== true)) fault('layer_insert_source_unavailable');
        return { kind: source.mainSource.isStill === true ? 'still' : 'av', name: source.name,
            duration: source.duration, file: String(source.file.fsName) };
    }
    function capture(p) {
        var project = app.project;
        if (!project || !project.file || !project.file.exists || String(project.file.fsName) !== p.projectId) fault('layer_insert_project_changed');
        if (project.numItems > 512) fault('inspection_result_budget');
        var comp = project.itemByID(p.compId), source = project.itemByID(p.itemId);
        if (!(comp instanceof CompItem) || comp === source) fault('layer_insert_composition');
        var media = sourceInfo(source);
        var stack = [], anchor = null, incoming = {}, budget = { properties: 0, unsafe: false }, layerCount = 0;
        for (var i = 1; i <= project.numItems; i++) {
            var item = project.item(i);
            if (!(item instanceof CompItem)) continue;
            layerCount += item.numLayers;
            if (layerCount > 2048) fault('inspection_result_budget');
            for (var j = 1; j <= item.numLayers; j++) {
                var layer = item.layer(j);
                inspectLayer(layer, budget);
                if (item.id === comp.id) {
                    stack.push(describeLayer(layer));
                    if (layer.id === p.layerId) anchor = layer;
                }
                if (layer instanceof AVLayer && layer.source instanceof CompItem) {
                    var sourceId = layer.source.id;
                    if (!incoming[sourceId]) incoming[sourceId] = [];
                    incoming[sourceId].push({ compId: item.id, layerId: layer.id, sourceId: sourceId });
                }
            }
        }
        if (!anchor) fault('layer_insert_anchor_unavailable');
        var uses = [], ancestors = {}, queue = [comp.id];
        ancestors[comp.id] = true;
        for (var next = 0; next < queue.length; next++) {
            var edges = incoming[queue[next]] || [];
            for (var k = 0; k < edges.length; k++) {
                var edge = edges[k];
                uses.push(edge);
                if (!ancestors[edge.compId]) { ancestors[edge.compId] = true; queue.push(edge.compId); }
            }
        }
        if (ancestors[p.itemId]) fault('layer_insert_source_cycle');
        uses.sort(byId);
        var target = { sessionId: p.sessionId, projectId: p.projectId, compId: p.compId,
            layerId: p.layerId, itemId: p.itemId };
        var revision = JSON.stringify([target, comp.name, stack, uses, media, comp.frameDuration, comp.duration, budget.unsafe]);
        if (stack.length > 96 || uses.length > 256 || revision.length > 32768) fault('inspection_result_budget');
        return { comp: comp, anchor: anchor, source: source, snapshot: { target: target, revision: revision,
            'protected': p.projectId, stack: stack, uses: uses, source: media, hasExpressions: budget.unsafe,
            frameDuration: comp.frameDuration, duration: comp.duration } };
    }
    function inspect(p) {
        try { return capture(p).snapshot; }
        catch (error) { return { readFailureVersion: 1, outcome: 'rejected',
            code: error.coreCode === 'inspection_result_budget' ? error.coreCode : 'inspection_failed' }; }
    }
    function validate(p, state) {
        var before = state.snapshot, frame = before.frameDuration;
        if (before.revision !== p.expectedRevision) fault('stale_target');
        if (before.hasExpressions) fault('layer_insert_expression_scope');
        if (before.stack.length >= 96 || before.revision.length > 31700) fault('inspection_result_budget');
        var index = state.anchor.index - (p.placement === 'above' ? 1 : 0);
        var upper = before.stack[index - 1], lower = before.stack[index];
        if (upper && lower && (upper.matteId === lower.id || lower.matteId === upper.id)) fault('layer_insert_matte_pair');
        if (p.inFrame >= p.outFrame || p.startFrame > p.inFrame || Math.abs(p.startFrame * frame) > 10800 ||
            p.outFrame * frame > before.duration + 0.00002 ||
            (before.source.kind !== 'still' && (p.outFrame - p.startFrame) * frame > before.source.duration + 0.00002)) fault('layer_insert_frame_range');
    }
    function mutate(p) {
        var started = false;
        try {
            var current = capture(p), before = current.snapshot, proof = p._execution;
            validate(p, current);
            if (!proof || proof.policyId !== policy || proof.baselineRevision !== before.revision ||
                proof.baselineProtected !== before['protected'] || !proof.target ||
                proof.target.projectId !== p.projectId || proof.target.sessionId !== p.sessionId ||
                proof.target.compId !== p.compId || proof.target.layerId !== p.layerId ||
                proof.target.itemId !== p.itemId) fault('manual_approval_binding');
            var usages = [];
            for (var i = 0; i < before.uses.length; i++) {
                var edge = before.uses[i];
                usages.push(edge.compId + '/' + edge.layerId + ' → ' + edge.sourceId);
            }
            var message = 'Вставить слой в существующую композицию?\nПроект: ' + p.projectId +
                '\nКомпозиция: #' + p.compId + ' ' + current.comp.name +
                '\nИсточник: #' + p.itemId + ' ' + before.source.name +
                '\nСлой: ' + p.name + '\nПозиция: ' + (p.placement === 'above' ? 'над' : 'под') +
                ' #' + p.layerId + ' ' + current.anchor.name +
                '\nКадры: [' + p.inFrame + ', ' + p.outFrame + '), старт источника: ' + p.startFrame +
                '\nВхождения comp/layer → source: ' + (usages.length ? usages.join(', ') : 'нет');
            if (p.position) message += '\nПозиция XY: ' + p.position.join(', ');
            if (p.scale) message += '\nМасштаб XY: ' + p.scale.join(', ');
            if (confirm(message, true, 'AE Agent Core — вставка футажа') !== true) fault('local_cancelled');
            current = capture(p);
            validate(p, current);
            var frame = before.frameDuration;
            app.beginUndoGroup('AE Agent Core — вставка футажа');
            try {
                started = true;
                var layer = current.comp.layers.add(current.source);
                layer.name = p.name;
                layer.enabled = true;
                layer.startTime = p.startFrame * frame;
                layer.inPoint = p.inFrame * frame;
                layer.outPoint = p.outFrame * frame;
                var transform = layer.property('ADBE Transform Group');
                if (p.position) transform.property('ADBE Position').setValue(p.position);
                if (p.scale) transform.property('ADBE Scale').setValue(p.scale);
                if (p.placement === 'above') layer.moveBefore(current.anchor);
                else layer.moveAfter(current.anchor);
            } finally { app.endUndoGroup(); }
            var after = capture(p).snapshot;
            if (after.revision !== capture(p).snapshot.revision) fault('local_transaction_readback');
            return { outcome: 'applied', snapshot: after, transactionReceipt: { version: 2, policyId: policy,
                proposalId: proof.proposalId, planDigest: proof.planDigest, taskId: proof.taskId,
                taskEpoch: proof.taskEpoch, stepId: proof.stepId, checkpointRef: proof.checkpointRef,
                checkpointDigest: proof.checkpointDigest, baselineDigest: proof.baselineDigest,
                baselineRevision: proof.baselineRevision, target: after.target, resultRevision: after.revision,
                protectedFields: after['protected'] } };
        } catch (error) { return { outcome: started ? 'unknown' : 'rejected', code: error.coreCode || 'ae_error' }; }
    }
    return { inspect: inspect, mutate: mutate, verify: inspect };
}())
