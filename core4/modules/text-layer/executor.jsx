(function () {
    var POLICY = 'current-matching-target-after-local-confirmation-v1';
    var OWNER = 'AE_CORE4_TEXT_V1:';
    var COMP = 'AE_CORE4_TEXT_WORKSPACE_V1';

    function fault(code) { var error = new Error(code); error.coreCode = code; throw error; }
    function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
    function finite(value) { return typeof value === 'number' && isFinite(value) && Math.abs(value) <= 100000; }
    function vector(value, count, z) {
        if (!value || (value.length !== count && !(value.length === count + 1 && value[count] === z))) fault('text_layer_vector');
        var result = [], i;
        for (i = 0; i < count; i++) {
            if (!finite(value[i])) fault('text_layer_vector');
            result.push(value[i]);
        }
        return result;
    }
    function fixed(prop) {
        if (!prop || prop.numKeys !== 0 || prop.isTimeVarying !== false || prop.expressionEnabled || prop.expression) fault('text_layer_animated');
        return prop;
    }
    function empty(group) { return group && group.numProperties === 0; }
    function writeXY(prop, value, z) {
        prop.setValue(prop.value.length === 3 ? [value[0], value[1], z] : value);
    }
    function composition(p) {
        var project = app.project, item, i;
        if (!project || !project.file || String(project.file.fsName) !== p.projectId) fault('project_cas');
        for (i = 1; i <= project.numItems; i++) {
            item = project.item(i);
            if (item.id === p.compId) break;
        }
        if (!(item instanceof CompItem) || item.id !== p.compId || item.comment !== COMP) fault('text_layer_workspace');
        if (item.numLayers > 60 || item.pixelAspect !== 1 || item.displayStartTime !== 0 || !finite(item.time)) fault('text_layer_workspace_geometry');
        return item;
    }
    function properties(comp, layer) {
        var text = layer.property('ADBE Text Properties'), transform = layer.property('ADBE Transform Group');
        var styles = layer.property('ADBE Layer Styles');
        if (!text || !transform || layer.locked !== false || layer.parent !== null ||
            layer.threeDLayer !== false || layer.threeDPerChar !== false || layer.hasTrackMatte !== false ||
            layer.isTrackMatte !== false || layer.guideLayer !== false || layer.adjustmentLayer !== false ||
            layer.solo !== false || layer.motionBlur !== false || layer.startTime !== 0 || layer.stretch !== 100 ||
            comp.time < layer.inPoint || comp.time >= layer.outPoint ||
            !empty(layer.property('ADBE Effect Parade')) || !empty(layer.property('ADBE Mask Parade')) ||
            !empty(text.property('ADBE Text Animators')) ||
            (styles && (styles.isModified !== false || styles.enabled !== false))) fault('text_layer_geometry');
        var position = fixed(transform.property('ADBE Position'));
        if (position.dimensionsSeparated !== false || fixed(transform.property('ADBE Rotate Z')).value !== 0 ||
            fixed(transform.property('ADBE Opacity')).value !== 100) fault('text_layer_geometry');
        return { source: fixed(text.property('ADBE Text Document')), position: position,
            anchor: fixed(transform.property('ADBE Anchor Point')), scale: fixed(transform.property('ADBE Scale')) };
    }
    function justification(value) {
        var values = { left: ParagraphJustification.LEFT_JUSTIFY, center: ParagraphJustification.CENTER_JUSTIFY,
            right: ParagraphJustification.RIGHT_JUSTIFY };
        if (typeof value === 'string') return values[value];
        for (var key in values) if (Number(value) === Number(values[key])) return key;
        fault('text_layer_justification');
    }
    function style(range) {
        var font = range.fontObject;
        if (!font || typeof font.isSubstitute !== 'boolean' || !font.postScriptName ||
            !finite(range.fontSize) || !finite(range.tracking)) fault('text_layer_style_unavailable');
        if (typeof range.applyFill !== 'boolean' || typeof range.applyStroke !== 'boolean') fault('text_layer_style_unavailable');
        var result = { font: String(font.postScriptName), substitute: font.isSubstitute, fontSize: range.fontSize, tracking: range.tracking };
        if (range.applyFill) {
            try { result.fill = vector(range.fillColor, 3); }
            catch (e) { fault('text_layer_fill_unavailable'); }
        }
        if (range.applyStroke) {
            try {
                if (!finite(range.strokeWidth) || range.strokeWidth <= 0) fault('text_layer_stroke_unavailable');
                result.stroke = { color: vector(range.strokeColor, 3), width: range.strokeWidth };
            } catch (e) { fault('text_layer_stroke_unavailable'); }
        }
        return result;
    }
    function ranges(doc, text) {
        var result = [], previous, current, i;
        for (i = 0; i < text.length; i++) {
            if (text.charAt(i) === '\n') continue;
            current = style(doc.characterRange(i, i + 1));
            if (previous && same(previous, current)) result[result.length - 1].end = i + 1;
            else {
                if (result.length >= 24) fault('text_layer_style_budget');
                result.push({ start: i, end: i + 1, font: current.font, substitute: current.substitute,
                    fontSize: current.fontSize, tracking: current.tracking });
                if (current.fill) result[result.length - 1].fill = current.fill;
                if (current.stroke) result[result.length - 1].stroke = current.stroke;
            }
            previous = current;
        }
        return result;
    }
    function readLayer(comp, layer, slot) {
        var result = { slot: slot, layerId: layer.id, name: layer.name, enabled: layer.enabled };
        try {
            var props = properties(comp, layer), doc = props.source.value;
            var text = String(doc.text).replace(/\r/g, '\n');
            if (doc.pointText !== true || Number(doc.lineOrientation) !== Number(LineOrientation.HORIZONTAL) ||
                typeof doc.characterRange !== 'function' || !text.length || text.length > 600 ||
                /[\x00-\x09\x0b-\x1f\x7f-\x9f\ud800-\udfff]/.test(text)) fault('text_layer_document');
            var measured = layer.sourceRectAtTime(comp.time, false);
            var bounds = { left: measured.left, top: measured.top, width: measured.width, height: measured.height };
            if (!finite(bounds.left) || !finite(bounds.top) || !finite(bounds.width) ||
                !finite(bounds.height) || bounds.width < 1 || bounds.height < 1) fault('text_layer_bounds');
            var scale = vector(props.scale.value, 2, 100);
            if (scale[0] !== scale[1] || scale[0] < 5 || scale[0] > 10000) fault('text_layer_scale');
            var leading = doc.autoLeading ? 0 : doc.leading;
            if (!finite(leading)) fault('text_layer_leading');
            var observed = ranges(doc, text);
            var aligned = justification(doc.justification);
            var position = vector(props.position.value, 2, 0), anchor = vector(props.anchor.value, 2, 0);
            result.text = text;
            result.leading = leading;
            result.justification = aligned;
            result.ranges = observed;
            result.position = position;
            result.anchor = anchor;
            result.scale = scale[0] / 100;
            result.bounds = bounds;
        } catch (e) { result.issue = e.coreCode || 'text_layer_style_unavailable'; }
        return result;
    }
    function inspect(p) {
        var comp = composition(p), layers = [], untouched = [], guides = [], layer, slot, guide, i;
        if (!comp.guides || comp.guides.length > 32) fault('text_layer_guides');
        for (i = 0; i < comp.guides.length; i++) {
            guide = comp.guides[i];
            if ((guide.orientationType !== 0 && guide.orientationType !== 1) || !finite(guide.position)) fault('text_layer_guides');
            guides.push({ axis: guide.orientationType === 1 ? 'x' : 'y', position: guide.position });
        }
        for (i = 1; i <= comp.numLayers; i++) {
            layer = comp.layer(i);
            slot = String(layer.comment).indexOf(OWNER) === 0 ? String(layer.comment).slice(OWNER.length) : null;
            if (slot === null) untouched.push([layer.id, layer.name, layer.enabled, layer.locked, layer.solo]);
            else {
                if (!/^[a-z][a-z0-9-]{0,39}$/.test(slot) || layer.name.length > 100 || layers.length >= 10) fault('text_layer_inventory');
                for (var n = 0; n < layers.length; n++) if (layers[n].slot === slot) fault('text_layer_inventory');
                layers.push(readLayer(comp, layer, slot));
            }
        }
        var target = { projectId: p.projectId, compId: comp.id }, size = [comp.width, comp.height];
        var protectedFields = JSON.stringify([comp.name, comp.comment, size, comp.time, comp.duration, comp.frameDuration, guides, untouched]);
        var revision = JSON.stringify([target, protectedFields, layers]);
        if (revision.length > 30000 || protectedFields.length > 6000) fault('text_layer_inventory_budget');
        return { target: target, revision: revision, 'protected': protectedFields, size: size, guides: guides, layers: layers };
    }
    function font(name) {
        var available = app.fonts.getFontsByPostScriptName(name), result = null;
        for (var i = 0; i < available.length; i++) {
            if (available[i].isSubstitute !== false || available[i].postScriptName !== name) continue;
            if (result) fault('text_layer_font_ambiguous');
            result = available[i];
        }
        return result;
    }
    function prepare(p, before) {
        var proof = p._execution, current, desired, fonts = [], range, i;
        if (!proof || proof.policyId !== POLICY || before.revision !== p.expectedRevision ||
            proof.baselineRevision !== before.revision || proof.baselineProtected !== before['protected'] ||
            !proof.target || proof.target.projectId !== before.target.projectId || proof.target.compId !== before.target.compId) fault('text_layer_binding');
        for (i = 0; i < before.layers.length; i++) if (before.layers[i].slot === p.slot) current = before.layers[i];
        if (p.layerId === undefined ? current || before.layers.length >= 10 :
            !current || current.layerId !== p.layerId || current.name !== p.name || current.issue) fault('text_layer_target');
        for (i = 0; i < p.ranges.length; i++) {
            range = p.ranges[i];
            desired = font(range.font) || (range.fallbackFont && font(range.fallbackFont));
            if (!desired) fault('text_layer_font_missing');
            fonts.push(desired);
        }
        return fonts;
    }
    function document(p, fonts, doc) {
        // AE exposes character ranges and formatting only after a layer owns the document.
        doc.resetCharStyle();
        doc.resetParagraphStyle();
        doc.text = p.text.replace(/\n/g, '\r');
        doc.justification = justification(p.justification);
        for (var i = 0; i < p.ranges.length; i++) {
            var source = p.ranges[i], target = doc.characterRange(source.start, source.end);
            target.fontObject = fonts[i];
            target.fontSize = source.fontSize;
            target.tracking = source.tracking;
            target.applyFill = !!source.fill;
            if (source.fill) target.fillColor = source.fill;
            target.applyStroke = !!source.stroke;
            if (source.stroke) {
                target.strokeWidth = source.stroke.width;
                target.strokeColor = source.stroke.color;
            }
        }
        doc.autoLeading = false;
        doc.leading = p.leading;
        return doc;
    }
    function center(p, props, layer) {
        var frame = p.frame, b = layer.bounds, a = layer.anchor, stroke = 0, i;
        for (i = 0; i < layer.ranges.length; i++) if (layer.ranges[i].stroke) stroke = Math.max(stroke, layer.ranges[i].stroke.width);
        var scale = Math.min(1, frame.width / (b.width + 2 * stroke), frame.height / (b.height + 2 * stroke));
        if (!finite(scale) || scale < p.minimumScale) fault('text_layer_frame_fit');
        writeXY(props.scale, [scale * 100, scale * 100], 100);
        writeXY(props.position, [frame.left + frame.width / 2 - (b.left + b.width / 2 - a[0]) * scale,
            frame.top + frame.height / 2 - (b.top + b.height / 2 - a[1]) * scale], 0);
    }
    function write(p, comp, fonts) {
        var layer, props, original, position, scale, i, created = false;
        try {
            if (p.layerId === undefined) {
                layer = comp.layers.addText(p.text.replace(/\n/g, '\r'));
                created = true;
                layer.name = p.name;
                layer.comment = OWNER + p.slot;
                layer.startTime = 0;
                layer.inPoint = 0;
                layer.outPoint = comp.duration;
            } else {
                for (i = 1; i <= comp.numLayers; i++) if (comp.layer(i).id === p.layerId) { layer = comp.layer(i); break; }
                props = properties(comp, layer);
                original = props.source.value;
                position = props.position.value;
                scale = props.scale.value;
            }
            props = properties(comp, layer);
            props.source.setValue(document(p, fonts, props.source.value));
            if (p.placement) {
                var measured = readLayer(comp, layer, p.slot);
                if (measured.issue) fault(measured.issue);
                center(p.placement, props, measured);
            }
            var after = inspect(p), updated = null;
            for (i = 0; i < after.layers.length; i++) if (after.layers[i].layerId === layer.id) updated = after.layers[i];
            if (!updated || updated.issue || updated.text !== p.text || after['protected'] !== p._execution.baselineProtected) fault('text_layer_readback');
            return after;
        } catch (e) {
            if (created) layer.remove();
            else if (original) {
                props.source.setValue(original);
                props.position.setValue(position);
                props.scale.setValue(scale);
            }
            throw e;
        }
    }
    function mutate(p) {
        var started = false;
        try {
            var before = inspect(p), fonts = prepare(p, before);
            var operation = p.layerId === undefined ? 'Создать текстовый слой' : 'Заменить текст и оформление слоя ' + p.layerId;
            var description = operation + ' «' + p.name + '»?\n' + p.text + '\ncompId: ' + p.compId +
                '\n' + p.projectId + '\nВыравнивание: ' + p.justification + ', интерлиньяж: ' + p.leading +
                '\nДиапазоны: ' + JSON.stringify(p.ranges) + (p.placement ? '\nРамка: ' + JSON.stringify(p.placement) : '');
            if (confirm(description, true, 'AE Agent Core4 — текстовый слой') !== true) return { outcome: 'rejected', code: 'local_cancelled' };
            before = inspect(p);
            fonts = prepare(p, before);
            var after, proof = p._execution;
            app.beginUndoGroup('AE Agent Core4 Text Layer');
            try {
                started = true;
                after = write(p, composition(p), fonts);
            } finally { app.endUndoGroup(); }
            return { outcome: 'applied', snapshot: after, transactionReceipt: { version: 2, policyId: POLICY,
                proposalId: proof.proposalId, planDigest: proof.planDigest, taskId: proof.taskId, taskEpoch: proof.taskEpoch,
                stepId: proof.stepId, checkpointRef: proof.checkpointRef, checkpointDigest: proof.checkpointDigest,
                baselineDigest: proof.baselineDigest, baselineRevision: proof.baselineRevision, target: after.target,
                resultRevision: after.revision, protectedFields: after['protected'] } };
        } catch (e) { return { outcome: started ? 'unknown' : 'rejected', code: e.coreCode || 'text_layer_ae_error' }; }
    }
    return { inspect: inspect, mutate: mutate, verify: inspect };
}())
