(function () {
    var POLICY = 'current-matching-target-after-local-confirmation-v1';
    var characterFields = ['font', 'fontSize', 'applyFill', 'fillColor', 'applyStroke', 'strokeWidth', 'strokeOverFill', 'tracking', 'baselineShift', 'horizontalScale', 'verticalScale', 'fauxBold', 'fauxItalic', 'tsume', 'autoKernType', 'fontCapsOption', 'fontBaselineOption', 'digitSet', 'ligature', 'noBreak', 'autoLeading'];
    var paragraphFields = ['justification', 'direction', 'composerEngine', 'everyLineComposer', 'spaceBefore', 'spaceAfter', 'startIndent', 'endIndent', 'firstLineIndent', 'leadingType'];

    function fault(code) { var e = new Error(code); e.coreCode = code; throw e; }
    function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
    function finite(value) { return typeof value === 'number' && isFinite(value) && Math.abs(value) <= 1000000; }
    function vector(value, size) {
        if (!value || value.length !== size) fault('layout_geometry');
        var result = [], i;
        for (i = 0; i < size; i++) { if (!finite(value[i])) fault('layout_geometry'); result.push(value[i]); }
        return result;
    }
    function xy(value, defaultZ) {
        if (value && value.length === 3 && value[2] === defaultZ) return vector([value[0], value[1]], 2);
        return vector(value, 2);
    }
    function setXY(prop, value, defaultZ) {
        prop.setValue(prop.value.length === 3 ? [value[0], value[1], defaultZ] : value);
    }
    function staticProperty(prop) {
        if (!prop || prop.numKeys !== 0 || prop.isTimeVarying !== false || prop.expressionEnabled || prop.expression) fault('layout_animated');
        return prop;
    }
    function empty(group) { return group && group.numProperties === 0; }

    function target(p) {
        var project = app.project, comp, layer, i;
        if (!project || !project.file || String(project.file.fsName) !== p.projectId) fault('project_cas');
        for (i = 1; i <= project.numItems; i++) if (project.item(i).id === p.compId) { comp = project.item(i); break; }
        if (!(comp instanceof CompItem)) fault('comp_cas');
        for (i = 1; i <= comp.numLayers; i++) if (comp.layer(i).id === p.layerId) { layer = comp.layer(i); break; }
        if (!layer || layer.locked !== false) fault('layer_cas');
        var role;
        if (layer.comment === 'AE_CORE4_TITLES_MEASURE_V1' && layer.enabled === false) role = 'measure';
        else if (layer.comment === 'AE_CORE4_TITLES_LAYOUT_V1' && layer.enabled === true) role = 'apply';
        else fault('layout_layer_role');
        var text = layer.property('ADBE Text Properties'), layerStyles = layer.property('ADBE Layer Styles');
        if (!text || layer.parent !== null || layer.threeDLayer !== false || layer.threeDPerChar !== false ||
            layer.hasTrackMatte !== false || layer.isTrackMatte !== false || layer.adjustmentLayer !== false ||
            layer.guideLayer !== false || layer.motionBlur !== false || layer.solo !== false ||
            layer.startTime !== 0 || layer.stretch !== 100 || comp.pixelAspect !== 1 ||
            !finite(comp.time) || !finite(layer.inPoint) || !finite(layer.outPoint) ||
            comp.time < layer.inPoint || comp.time >= layer.outPoint ||
            !empty(layer.property('ADBE Effect Parade')) || !empty(layer.property('ADBE Mask Parade')) ||
            !empty(text.property('ADBE Text Animators')) || (layerStyles && layerStyles.isModified !== false)) fault('layout_geometry');
        var transform = layer.property('ADBE Transform Group');
        if (!transform) fault('layout_geometry');
        var anchor = staticProperty(transform.property('ADBE Anchor Point'));
        var position = staticProperty(transform.property('ADBE Position'));
        var scale = staticProperty(transform.property('ADBE Scale'));
        if (position.dimensionsSeparated !== false || staticProperty(transform.property('ADBE Rotate Z')).value !== 0 ||
            staticProperty(transform.property('ADBE Opacity')).value !== 100) fault('layout_geometry');
        return { comp: comp, layer: layer, role: role, text: staticProperty(text.property('ADBE Text Document')),
            anchor: anchor, position: position, scale: scale };
    }

    function fields(object, names) {
        var result = {}, key, value, i;
        for (i = 0; i < names.length; i++) {
            key = names[i]; value = object[key];
            if (key === 'fillColor' || key === 'strokeColor') value = vector(value, 3);
            else if (value && typeof value === 'object') {
                var enumValue = Number(value), label = String(value);
                if (!finite(enumValue) || !/^[A-Za-z]+\.[A-Z0-9_]+$/.test(label)) fault('layout_style');
                value = label;
            } else if (typeof value !== 'string' && typeof value !== 'boolean' && !finite(value)) fault('layout_style_' + key);
            result[key] = value;
        }
        return result;
    }
    function characterStyle(range) {
        var result = fields(range, characterFields);
        if (result.applyFill !== true || result.applyStroke !== false) fault('layout_style');
        // A dormant color is not always observable. Preserve its observed status;
        // this fill-only profile never enables stroke or writes color fields.
        var strokeColor = range.strokeColor;
        result.strokeColor = typeof strokeColor === 'undefined' ? null : vector(strokeColor, 3);
        if (!result.autoLeading) result.leading = fields(range, ['leading']).leading;
        // The range exposes manual kerning only when auto kerning is disabled.
        if (typeof AutoKernType === 'undefined') fault('layout_style');
        if (Number(range.autoKernType) === Number(AutoKernType.NO_AUTO_KERN)) result.kerning = fields(range, ['kerning']).kerning;
        else if (Number(range.autoKernType) !== Number(AutoKernType.METRIC_KERN) && Number(range.autoKernType) !== Number(AutoKernType.OPTICAL_KERN)) fault('layout_style');
        return result;
    }
    function validText(value) {
        if (typeof value !== 'string' || !value.length || value.length > 1024 || /[\x00-\x09\x0B-\x1F\x7F-\x9F\u2028\u2029\uD800-\uDFFF]/.test(value)) fault('layout_text');
        var lines = value.split('\n'), i;
        if (lines.length > 5) fault('layout_text');
        for (i = 0; i < lines.length; i++) if (!/\S/.test(lines[i])) fault('layout_text');
        return lines.length;
    }
    function snapshot(p, t) {
        var doc = t.text.value;
        if (!doc || doc.pointText !== true || typeof LineOrientation === 'undefined' ||
            Number(doc.lineOrientation) !== Number(LineOrientation.HORIZONTAL) || typeof doc.characterRange !== 'function') fault('layout_style');
        if (typeof doc.text !== 'string' || /\r\n/.test(doc.text)) fault('layout_text');
        var text = doc.text.replace(/\r/g, '\n'), lineCount = validText(text);
        if (doc.paragraphCount !== lineCount) fault('layout_style');
        var font = doc.fontObject;
        if (!font || font.isSubstitute !== false || font.hasDesignAxes !== false || !finite(font.fontID) || font.fontID < 1 || typeof font.postScriptName !== 'string' || !font.postScriptName) fault('layout_font');
        var characters = characterStyle(doc.characterRange(0, -1));
        if (characters.font !== font.postScriptName) fault('layout_style');
        // These paragraph attributes aggregate across all paragraphs. Undefined
        // (including a mixed value) fails through fields().
        var paragraphs = fields(doc, paragraphFields);
        var rawScale = t.scale.value, rawAnchor = t.anchor.value, rawPosition = t.position.value;
        var scale = xy(rawScale, 100), anchor = xy(rawAnchor, 0), position = xy(rawPosition, 0);
        if (scale[0] <= 0 || scale[0] !== scale[1]) fault('layout_geometry');
        var rect = t.layer.sourceRectAtTime(t.comp.time, false);
        var bounds = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
        if (!finite(bounds.left) || !finite(bounds.top) || !finite(bounds.width) || !finite(bounds.height) ||
            bounds.width < 1 || bounds.height < 1) fault('layout_bounds');
        var baselines = vector(doc.baselineLocs, lineCount * 4);
        var style = JSON.stringify([font.fontID, characters, paragraphs]);
        var resource = { projectId: p.projectId, compId: t.comp.id, layerId: t.layer.id };
        var comp = vector([t.comp.width, t.comp.height], 2);
        var protectedFields = JSON.stringify([style, anchor, t.role, t.comp.time, comp, t.layer.inPoint, t.layer.outPoint,
            rawScale.length, rawAnchor.length, rawPosition.length]);
        return { target: resource, revision: JSON.stringify([resource, text, protectedFields, scale, position, bounds, baselines]),
            text: text, 'protected': protectedFields, role: t.role, time: t.comp.time, style: style,
            anchor: anchor, scale: scale, position: position, bounds: bounds, baselines: baselines, comp: comp };
    }
    function inspect(p) { return snapshot(p, target(p)); }

    function preflight(p, before) {
        var proof = p._execution;
        if (p.mode !== before.role || p.expectedRevision !== before.revision || !proof ||
            proof.policyId !== POLICY || proof.baselineRevision !== before.revision || proof.baselineProtected !== before['protected'] ||
            !proof.target || proof.target.projectId !== before.target.projectId || proof.target.compId !== before.target.compId ||
            proof.target.layerId !== before.target.layerId) fault('layout_binding');
        var frame = p.frame;
        if (!frame || !finite(frame.left) || !finite(frame.top) || !finite(frame.width) || !finite(frame.height) ||
            frame.left < 0 || frame.top < 0 || frame.width < 1 || frame.height < 1 ||
            frame.left + frame.width > before.comp[0] || frame.top + frame.height > before.comp[1]) fault('layout_frame');
        var i;
        if (p.mode === 'measure') {
            if (!p.candidates || !p.candidates.length || p.candidates.length > 19) fault('layout_candidates');
            for (i = 0; i < p.candidates.length; i++) validText(p.candidates[i].text);
        } else {
            validText(p.text);
            vector(p.position, 2);
            if (!finite(p.scale) || p.scale < 0.01 || p.scale > 10) fault('layout_geometry');
        }
    }
    function writeText(t, text) {
        var doc = t.text.value;
        doc.text = text.replace(/\n/g, '\r');
        t.text.setValue(doc);
    }
    function measure(p, t, before) {
        var original = t.text.value, samples = [], candidate, trial, i;
        try {
            for (i = 0; i < p.candidates.length; i++) {
                candidate = p.candidates[i];
                writeText(t, candidate.text);
                trial = inspect(p);
                if (trial.text !== candidate.text || trial['protected'] !== before['protected'] ||
                    !same(trial.scale, before.scale) || !same(trial.position, before.position)) fault('layout_measure_readback');
                samples.push({ id: candidate.id, bounds: trial.bounds, baselines: trial.baselines });
            }
        } finally { t.text.setValue(original); }
        var after = inspect(p);
        if (after.revision !== before.revision) fault('layout_restore_readback');
        after.samples = samples;
        after.layoutId = p.layoutId;
        return after;
    }
    function apply(p, t, before) {
        writeText(t, p.text);
        var trial = inspect(p), frame = p.frame, padding = p.fit.padding, scale = p.scale;
        var left = p.position[0] + (trial.bounds.left - trial.anchor[0]) * scale;
        var top = p.position[1] + (trial.bounds.top - trial.anchor[1]) * scale;
        if (trial.text !== p.text || trial['protected'] !== before['protected'] ||
            left < frame.left + padding - 0.02 || top < frame.top + padding - 0.02 ||
            left + trial.bounds.width * scale > frame.left + frame.width - padding + 0.02 ||
            top + trial.bounds.height * scale > frame.top + frame.height - padding + 0.02) fault('layout_apply_frame');
        setXY(t.scale, [p.scale * 100, p.scale * 100], 100);
        setXY(t.position, p.position, 0);
        var after = inspect(p);
        if (after.text !== p.text || after['protected'] !== before['protected']) fault('layout_apply_readback');
        return after;
    }
    function mutate(p) {
        var started = false;
        try {
            var before = inspect(p);
            preflight(p, before);
            var description = p.mode === 'measure' ? 'Измерить ' + p.candidates.length + ' вариантов на скрытом слое и восстановить исходник?' : 'Применить вёрстку к видимому слою?\nТекст: ' + JSON.stringify(p.text) + '\nМасштаб: ' + (100 * p.scale) + '%\nПоложение: ' + JSON.stringify(p.position);
            if (confirm(description + '\nПроект: ' + p.projectId + '\ncompId: ' + p.compId + '\nlayerId: ' + p.layerId, true, 'AE Agent Core4 — вёрстка титра') !== true) return { outcome: 'rejected', code: 'local_cancelled' };
            before = inspect(p);
            preflight(p, before);
            var t = target(p), after;
            app.beginUndoGroup('AE Agent Core4 Titles Layout');
            try {
                started = true;
                after = p.mode === 'measure' ? measure(p, t, before) : apply(p, t, before);
            } finally { app.endUndoGroup(); }
            var proof = p._execution;
            return { outcome: 'applied', snapshot: after, transactionReceipt: { version: 1, policyId: POLICY,
                proposalId: proof.proposalId, planDigest: proof.planDigest, taskId: proof.taskId, taskEpoch: proof.taskEpoch,
                stepId: proof.stepId, checkpointRef: proof.checkpointRef, checkpointDigest: proof.checkpointDigest,
                baselineDigest: proof.baselineDigest, baselineRevision: proof.baselineRevision, target: after.target,
                desiredText: after.text, protectedFields: after['protected'] } };
        } catch (e) { return { outcome: started ? 'unknown' : 'rejected', code: e.coreCode || 'ae_error' }; }
    }
    return { inspect: inspect, mutate: mutate, verify: inspect };
}())
