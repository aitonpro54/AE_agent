(function () {
    var policy = 'current-matching-target-after-local-confirmation-v1';
    var maxProjectLayers = 2048, maxProperties = 100000, maxRevision = 9007199254740991;
    var ownerTag = /^\[AECore4 overlay v1:(\d+):(\d+)\]$/;
    var transformNames = ['ADBE Anchor Point', 'ADBE Position', 'ADBE Scale', 'ADBE Rotate Z', 'ADBE Opacity'];
    var supportedEffects = ['ADBE Gaussian Blur 2', 'ADBE Fill'];
    var extraRoots = ['ADBE Marker', 'ADBE Time Remapping', 'ADBE Audio Group', 'ADBE Layer Overrides',
        'ADBE Layer Styles', 'ADBE Blend Options Group', 'ADBE Material Options Group', 'ADBE Plane Options Group',
        'ADBE Extrsn Options Group'];
    function fault(code) { var e = new Error(code); e.coreCode = code; throw e; }
    function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
    function number(value) {
        if (typeof value !== 'number' || !isFinite(value)) fault('layer_overlay_unobserved');
        return value;
    }
    function bool(value) {
        if (typeof value !== 'boolean') fault('layer_overlay_unobserved');
        return value;
    }
    function text(value) {
        if (typeof value !== 'string' || value.length > 512) fault('inspection_result_budget');
        return value;
    }
    function listed(names, key) {
        for (var i = 0; i < names.length; i++) if (names[i] === key) return true;
        return false;
    }
    function overlayMark(comment) {
        var lines = text(comment).split(/\r\n|[\r\n]/), found = null;
        for (var i = 0; i < lines.length; i++) {
            var mark = ownerTag.exec(lines[i]);
            if (!mark) continue;
            if (found) fault('layer_overlay_ownership_ambiguous');
            found = mark;
        }
        return found;
    }
    function isArray(value) { return Object.prototype.toString.call(value) === '[object Array]'; }
    function vector(value) {
        if (!isArray(value) || value.length > 128) fault('layer_overlay_property_value');
        var values = [];
        for (var i = 0; i < value.length; i++) values.push(isArray(value[i]) ? vector(value[i]) : number(value[i]));
        return values;
    }
    function plainValue(property, value) {
        if (property.propertyValueType === PropertyValueType.SHAPE) {
            var feathers = ['featherSegLocs', 'featherRelSegLocs', 'featherRadii', 'featherInterps',
                'featherTensions', 'featherTypes', 'featherRelCornerAngles'];
            for (var i = 0; i < feathers.length; i++) {
                var feather = value[feathers[i]];
                if (feather !== null && (!isArray(feather) || feather.length)) fault('layer_overlay_variable_feather');
            }
            return [bool(value.closed), vector(value.vertices), vector(value.inTangents), vector(value.outTangents)];
        }
        if (property.propertyValueType === PropertyValueType.OneD) return number(value);
        if (property.propertyValueType === PropertyValueType.TwoD || property.propertyValueType === PropertyValueType.TwoD_SPATIAL ||
            property.propertyValueType === PropertyValueType.COLOR) return vector(value);
        fault('layer_overlay_property_value');
    }
    function ease(entries) {
        if (!isArray(entries) || entries.length > 3) fault('layer_overlay_key_ease');
        var result = [];
        for (var i = 0; i < entries.length; i++) result.push([number(entries[i].speed), number(entries[i].influence)]);
        return result;
    }
    function propertyState(property, keysAllowed) {
        if (!property || property.propertyType !== PropertyType.PROPERTY || property.expressionEnabled === true ||
            property.canSetExpression && (typeof property.expressionEnabled !== 'boolean' || property.expression) ||
            property.isSeparationLeader && property.dimensionsSeparated || property.isSeparationFollower) fault('layer_overlay_property');
        var count = number(property.numKeys);
        if (!count) return [property.matchName, plainValue(property, property.value)];
        if (!keysAllowed || count > 24) fault('layer_overlay_key_profile');
        var spatial = property.propertyValueType === PropertyValueType.TwoD_SPATIAL, keys = [];
        for (var i = 1; i <= count; i++) {
            var key = [number(property.keyTime(i)), plainValue(property, property.keyValue(i)),
                number(Number(property.keyInInterpolationType(i))), number(Number(property.keyOutInterpolationType(i))),
                ease(property.keyInTemporalEase(i)), ease(property.keyOutTemporalEase(i)),
                bool(property.keyTemporalContinuous(i)), bool(property.keyTemporalAutoBezier(i))];
            if (spatial) key.push(vector(property.keyInSpatialTangent(i)), vector(property.keyOutSpatialTangent(i)),
                bool(property.keySpatialContinuous(i)), bool(property.keySpatialAutoBezier(i)), bool(property.keyRoving(i)));
            keys.push(key);
        }
        return [property.matchName, keys];
    }
    function groups(layer, matchName, masks) {
        var group = layer.property(matchName), output = [];
        if (!group || number(group.numProperties) > 8) fault('layer_overlay_group');
        for (var i = 1; i <= group.numProperties; i++) {
            var member = group.property(i), children = [], count = number(member.numProperties);
            if (count > 20 || (masks ? member.matchName !== 'ADBE Mask Atom' : !listed(supportedEffects, member.matchName))) fault('layer_overlay_group_profile');
            for (var j = 1; j <= count; j++) children.push(propertyState(member.property(j), false));
            output.push([member.matchName, text(member.name), bool(member.enabled), masks ?
                [number(Number(member.maskMode)), bool(member.inverted), bool(member.rotoBezier),
                    number(Number(member.maskMotionBlur)), number(Number(member.maskFeatherFalloff)), bool(member.locked)] : [], children]);
        }
        return output;
    }
    function layerSummary(layer) {
        var av = layer instanceof AVLayer, matte = av ? layer.trackMatteLayer : null;
        if (av && (bool(layer.hasTrackMatte) !== !!matte || matte && typeof layer.setTrackMatte !== 'function')) fault('layer_overlay_matte_unobserved');
        return { id: number(layer.id), sourceId: av && layer.source ? number(layer.source.id) : 0,
            stamp: JSON.stringify([text(layer.name), text(layer.comment), bool(layer.enabled), bool(layer.solo),
                bool(layer.locked), bool(layer.shy), number(layer.label), number(layer.startTime), number(layer.inPoint),
                number(layer.outPoint), number(layer.stretch), layer.parent ? number(layer.parent.id) : 0,
                matte ? number(matte.id) : 0, av ? number(Number(layer.trackMatteType)) : 0,
                av ? bool(layer.isTrackMatte) : false]) };
    }
    function signature(layer, summary) {
        if (!(layer instanceof AVLayer) || layer.matchName !== 'ADBE AV Layer' || layer.locked !== false ||
            layer.threeDLayer !== false || layer.nullLayer !== false || layer.adjustmentLayer !== false ||
            layer.timeRemapEnabled !== false || layer.isTrackMatte !== false || layer.hasAudio !== false ||
            layer.solo !== false || layer.collapseTransformation !== false ||
            layer.trackMatteLayer && layer.trackMatteLayer.enabled !== false) fault('layer_overlay_layer_profile');
        var styles = layer.property('ADBE Layer Styles'), marker = layer.property('ADBE Marker');
        if (styles && number(styles.numProperties) || marker && number(marker.numKeys)) fault('layer_overlay_layer_profile');
        var transforms = layer.property('ADBE Transform Group'), values = [];
        if (!transforms) fault('layer_overlay_property');
        for (var i = 0; i < transformNames.length; i++) values.push(propertyState(transforms.property(transformNames[i]), true));
        return JSON.stringify([JSON.parse(summary.stamp).slice(2), bool(layer.motionBlur), bool(layer.guideLayer),
            bool(layer.effectsActive), bool(layer.frameBlending), bool(layer.preserveTransparency),
            number(Number(layer.blendingMode)), number(Number(layer.quality)), number(Number(layer.samplingQuality)),
            number(Number(layer.autoOrient)), values, groups(layer, 'ADBE Mask Parade', true), groups(layer, 'ADBE Effect Parade', false)]);
    }
    // The same project-wide scan as layer-insert guards references across unrelated
    // compositions. Only a literal number or pre-expression value is admitted.
    function scan(group, budget, depth) {
        if (!group || ++budget.properties > maxProperties || depth > 32) fault('inspection_result_budget');
        if (group.propertyType === PropertyType.PROPERTY) {
            if (group.canSetExpression && typeof group.expressionEnabled !== 'boolean') fault('layer_overlay_dependency_unobserved');
            if (group.expressionEnabled === true &&
                (typeof group.expression !== 'string' || !/^\s*(?:value|[+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*;?\s*$/.test(group.expression))) fault('layer_overlay_expression_scope');
            if (group.propertyValueType === PropertyValueType.LAYER_INDEX &&
                (group.numKeys !== 0 || group.value !== 0)) fault('layer_overlay_index_reference');
            if (group.propertyValueType === PropertyValueType.CUSTOM_VALUE) fault('layer_overlay_dependency_unobserved');
            return;
        }
        if (typeof group.numProperties !== 'number') fault('layer_overlay_dependency_unobserved');
        for (var i = 1; i <= group.numProperties; i++) scan(group.property(i), budget, depth + 1);
    }
    function scanLayer(layer, budget) {
        var root = ['ADBE Transform Group'], kind = layer.matchName;
        if (kind === 'ADBE Text Layer') root.push('ADBE Text Properties');
        else if (kind === 'ADBE Vector Layer') root.push('ADBE Root Vectors Group');
        else if (kind === 'ADBE Camera Layer') root.push('ADBE Camera Options Group');
        else if (kind === 'ADBE Light Layer') root.push('ADBE Light Options Group');
        else if (kind !== 'ADBE AV Layer') fault('layer_overlay_dependency_unobserved');
        scan(layer, budget, 0);
        for (var i = 0; i < root.length; i++) scan(layer.property(root[i]), budget, 1);
        for (var j = 0; j < extraRoots.length; j++) {
            var property = layer.property(extraRoots[j]);
            if (property) scan(property, budget, 1);
        }
    }
    function sourceInfo(item) {
        if (!(item instanceof FootageItem) || item.useProxy !== false || item.footageMissing !== false ||
            item.hasVideo !== true || item.hasAudio !== false || !item.mainSource || item.mainSource.isStill !== true ||
            !item.file || !item.file.exists || item.file.alias || !item.file.modified) fault('layer_overlay_still_profile');
        var source = item.mainSource, alpha = bool(source.hasAlpha), mode = alpha ? number(Number(source.alphaMode)) : 0;
        var interpretation = alpha ? [mode, bool(source.invertAlpha),
            source.alphaMode === AlphaMode.PREMULTIPLIED ? vector(source.premulColor) : []] : [];
        var bytes = number(item.file.length);
        if (bytes < 1 || bytes > 1073741824) fault('layer_overlay_still_profile');
        return { file: text(String(item.file.fsName)), bytes: bytes, modifiedMs: number(item.file.modified.getTime()),
            width: number(item.width), height: number(item.height), pixelAspect: number(item.pixelAspect),
            alpha: JSON.stringify([alpha, interpretation]) };
    }
    function captures(p) {
        var project = app.project;
        if (!project || !project.file || !project.file.exists || String(project.file.fsName) !== p.projectId) fault('layer_overlay_project_changed');
        var projectRevision = number(project.revision);
        if (projectRevision < 0 || projectRevision > maxRevision || projectRevision % 1 !== 0) fault('layer_overlay_project_changed');
        if (project.numItems > 2048) fault('inspection_result_budget');
        var comp = project.itemByID(p.compId), source = project.itemByID(p.itemId);
        if (!(comp instanceof CompItem) || comp.numLayers > 64 || p.originalSourceId === p.itemId) fault('layer_overlay_target');
        var stack = [], layers = [], original = null, originalIndex = -1, originalProperties = 0;
        var incoming = {}, count = 0, budget = { properties: 0 };
        for (var i = 1; i <= project.numItems; i++) {
            var item = project.item(i);
            if (!(item instanceof CompItem)) continue;
            count += item.numLayers;
            if (count > maxProjectLayers) fault('inspection_result_budget');
            for (var j = 1; j <= item.numLayers; j++) {
                var layer = item.layer(j);
                var beforeScan = budget.properties;
                scanLayer(layer, budget);
                if (item.id === comp.id) {
                    var summary = layerSummary(layer);
                    if (layer.id === p.layerId) {
                        original = layer; originalIndex = stack.length;
                        originalProperties = budget.properties - beforeScan;
                    }
                    stack.push(summary);
                    layers.push(layer);
                }
                if (layer instanceof AVLayer && layer.source instanceof CompItem) {
                    var parentSource = layer.source.id;
                    if (!incoming[parentSource]) incoming[parentSource] = [];
                    incoming[parentSource].push({ compId: item.id, layerId: layer.id, sourceId: parentSource });
                }
            }
        }
        if (!original || !original.source || original.source.id !== p.originalSourceId || overlayMark(original.comment)) fault('layer_overlay_original_changed');
        var oldMedia = sourceInfo(original.source), media = sourceInfo(source);
        if (oldMedia.width !== media.width || oldMedia.height !== media.height || oldMedia.pixelAspect !== media.pixelAspect) fault('layer_overlay_source_geometry');
        var inherited = signature(original, stack[originalIndex]), overlay = { id: 0, sourceId: 0, state: 'none', signature: '' };
        for (var n = 0; n < stack.length; n++) {
            if (n === originalIndex) continue;
            var mark = overlayMark(layers[n].comment), candidate = stack[n];
            if (mark && Number(mark[1]) === original.id) {
                if (overlay.state !== 'none') fault('layer_overlay_ownership_ambiguous');
                var overlaySignature = signature(layers[n], candidate);
                var applied = n === originalIndex - 1 && Number(mark[2]) === p.itemId && candidate.sourceId === p.itemId &&
                    overlaySignature === inherited && layers[n].name === original.name &&
                    layers[n].comment === taggedComment(original, p);
                overlay = { id: candidate.id, sourceId: candidate.sourceId, state: applied ? 'applied' : 'partial', signature: overlaySignature };
            } else if (!mark && (candidate.sourceId === p.originalSourceId || candidate.sourceId === p.itemId) &&
                (n === originalIndex - 1 || signature(layers[n], candidate) === inherited)) {
                if (overlay.state !== 'none') fault('layer_overlay_ownership_ambiguous');
                overlay = { id: candidate.id, sourceId: candidate.sourceId, state: 'suspect', signature: '' };
            }
        }
        var uses = [], seen = {}, queue = [comp.id];
        seen[comp.id] = true;
        for (var q = 0; q < queue.length; q++) {
            var edges = incoming[queue[q]] || [];
            for (var k = 0; k < edges.length; k++) {
                var edge = edges[k];
                uses.push(edge);
                if (!seen[edge.compId]) { seen[edge.compId] = true; queue.push(edge.compId); }
            }
        }
        uses.sort(function (a, b) { return a.compId - b.compId || a.layerId - b.layerId; });
        var target = { sessionId: p.sessionId, projectId: p.projectId, compId: comp.id,
            layerId: original.id, originalSourceId: original.source.id, itemId: source.id };
        var protectedFields = JSON.stringify([target, [text(comp.name), number(comp.width), number(comp.height), number(comp.pixelAspect),
            number(comp.duration), number(comp.frameDuration), number(comp.displayStartTime)], stack[originalIndex], inherited, oldMedia, media, uses]);
        if (project.revision !== projectRevision) fault('layer_overlay_project_changed');
        var result = resultSnapshot(target, protectedFields, stack, uses, media, inherited, overlay, projectRevision);
        return { comp: comp, original: original, source: source, snapshot: result,
            layersAfter: count + 1, propertiesAfter: budget.properties + originalProperties };
    }
    function resultSnapshot(target, protectedFields, stack, uses, media, inherited, overlay, projectRevision) {
        var revision = JSON.stringify([projectRevision, protectedFields, stack, overlay]);
        var result = { target: target, revision: revision, 'protected': protectedFields, stack: stack,
            uses: uses, source: media, signature: inherited, overlay: overlay };
        // Bound escaped snapshot and repeated receipt / frame strings before dispatch.
        if (uses.length > 128 || protectedFields.length > 10000 || revision.length > 15000 ||
            JSON.stringify(result).length > 28000) fault('inspection_result_budget');
        return result;
    }
    function taggedComment(layer, p) {
        return layer.comment + '\n[AECore4 overlay v1:' + p.layerId + ':' + p.itemId + ']';
    }
    function inspect(p) {
        try { return captures(p).snapshot; }
        catch (e) { return { readFailureVersion: 1, outcome: 'rejected',
            code: e.coreCode === 'inspection_result_budget' ? e.coreCode : 'inspection_failed' }; }
    }
    function baseline(p, state) {
        var before = state.snapshot, proof = p._execution;
        if (before.overlay.state !== 'none') fault('layer_overlay_existing_or_partial');
        if (state.comp.numLayers >= 64 || state.layersAfter > maxProjectLayers ||
            state.propertiesAfter > maxProperties || taggedComment(state.original, p).length > 512) fault('inspection_result_budget');
        if (before.revision !== p.expectedRevision || before.source.file !== p.file) fault('stale_target');
        if (!proof || proof.policyId !== policy || proof.baselineRevision !== before.revision ||
            proof.baselineProtected !== before['protected'] || !sameTarget(proof.target, before.target)) fault('manual_approval_binding');
        var stack = before.stack.slice(), position = state.original.index - 1, copyId = 2147483647;
        var stamp = JSON.parse(stack[position].stamp);
        stamp[1] = taggedComment(state.original, p);
        stack.splice(position, 0, { id: copyId, sourceId: p.itemId, stamp: JSON.stringify(stamp) });
        resultSnapshot(before.target, before['protected'], stack, before.uses, before.source, before.signature,
            { id: copyId, sourceId: p.itemId, state: 'applied', signature: before.signature }, maxRevision);
    }
    function sameTarget(a, b) {
        return a && a.sessionId === b.sessionId && a.projectId === b.projectId && a.compId === b.compId &&
            a.layerId === b.layerId && a.originalSourceId === b.originalSourceId && a.itemId === b.itemId;
    }
    function mutate(p, confirmAction) {
        var started = false;
        try {
            var current = captures(p), before = current.snapshot, proof = p._execution;
            baseline(p, current);
            var uses = [];
            for (var i = 0; i < before.uses.length; i++) uses.push(before.uses[i].compId + '/' + before.uses[i].layerId);
            var message = 'Создать копию слоя над оригиналом и заменить источник копии?\nПроект: ' + p.projectId +
                '\nКомпозиция: #' + p.compId + ' / слой: #' + p.layerId + '\nИсточник: #' + p.originalSourceId +
                ' → #' + p.itemId + ' ' + p.file + '\nИспользования композиции: ' + (uses.length ? uses.join(', ') : 'нет');
            if ((confirmAction || confirm)(message, true, 'AE Agent Core — фото поверх исходного слоя') !== true) fault('local_cancelled');
            current = captures(p);
            baseline(p, current);
            var origin = current.original, copy, copyId, position = origin.index;
            app.beginUndoGroup('AE Agent Core — фото поверх исходного слоя');
            try {
                if (confirmAction && confirmAction(message, true, 'AE Agent Core — фото поверх исходного слоя') !== true)
                    fault('operator_confirmation_expired');
                started = true;
                copy = origin.duplicate();
                if (!copy || !copy.containingComp || copy.containingComp.id !== current.comp.id) fault('layer_overlay_duplicate_unobserved');
                copyId = number(copy.id);
                if (copyId < 1 || copyId % 1 !== 0) fault('layer_overlay_duplicate_unobserved');
                for (var n = 0; n < before.stack.length; n++) {
                    if (before.stack[n].id === copyId) fault('layer_overlay_duplicate_unobserved');
                }
                if (current.comp.numLayers !== before.stack.length + 1 || copy.index !== position || origin.index !== position + 1 ||
                    current.comp.layer(position).id !== copyId || current.comp.layer(position + 1).id !== p.layerId)
                    fault('layer_overlay_duplicate_position');
                var comment = taggedComment(origin, p);
                copy.comment = comment;
                if (copy.comment !== comment) fault('layer_overlay_marker_write');
                copy.replaceSource(current.source, false);
                var matte = origin.trackMatteLayer, copiedMatte = copy.trackMatteLayer;
                if (matte && (!copiedMatte || copiedMatte.id !== matte.id || copy.trackMatteType !== origin.trackMatteType))
                    copy.setTrackMatte(matte, origin.trackMatteType);
                copy.name = origin.name;
            } finally { app.endUndoGroup(); }
            var after = captures(p).snapshot, previous = [];
            for (var j = 0; j < after.stack.length; j++) if (after.stack[j].id !== copyId) previous.push(after.stack[j]);
            if (after.stack.length !== before.stack.length + 1 || after.overlay.id !== copyId || after.overlay.state !== 'applied' ||
                after['protected'] !== before['protected'] || !same(previous, before.stack) ||
                after.revision !== captures(p).snapshot.revision) fault('layer_overlay_readback');
            return { outcome: 'applied', snapshot: after, transactionReceipt: { version: 2, policyId: policy,
                proposalId: proof.proposalId, planDigest: proof.planDigest, taskId: proof.taskId, taskEpoch: proof.taskEpoch,
                stepId: proof.stepId, checkpointRef: proof.checkpointRef, checkpointDigest: proof.checkpointDigest,
                baselineDigest: proof.baselineDigest, baselineRevision: proof.baselineRevision, target: after.target,
                resultRevision: after.revision, protectedFields: after['protected'] } };
        } catch (e) { return { outcome: started ? 'unknown' : 'rejected', code: e.coreCode || 'layer_overlay_ae_error' }; }
    }
    return { inspect: inspect, mutate: mutate, verify: inspect };
}())
