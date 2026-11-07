(function () {
    function fault(code) { var e = new Error(code); e.coreCode = code; throw e; }
    var characterFields = ['font', 'fontSize', 'applyFill', 'fillColor', 'applyStroke', 'strokeColor', 'strokeWidth', 'tracking', 'baselineShift', 'horizontalScale', 'verticalScale', 'fauxBold', 'fauxItalic'];
    var paragraphFields = ['justification', 'leading', 'autoLeading'];
    var fieldAliases = { font: 'font', fontSize: 'font_size', applyFill: 'apply_fill', fillColor: 'fill_color', applyStroke: 'apply_stroke', strokeColor: 'stroke_color', strokeWidth: 'stroke_width', tracking: 'tracking', baselineShift: 'baseline_shift', horizontalScale: 'horizontal_scale', verticalScale: 'vertical_scale', fauxBold: 'faux_bold', fauxItalic: 'faux_italic', justification: 'justification', leading: 'leading', autoLeading: 'auto_leading' };
    var moduleReadFaults = ['project_cas', 'comp_cas', 'layer_cas', 'unsupported_animated_text', 'unsupported_style_proof', 'unsupported_style_api', 'unsupported_mixed_style', 'unsupported_justification_enum'];
    function contains(values, value) { for (var i = 0; i < values.length; i++) if (values[i] === value) return true; return false; }
    function readFault(code, coreCode) { var e = new Error('titles_read_failure'); e.coreReadCode = code; if (coreCode) e.coreCode = coreCode; throw e; }
    function readCode(code) {
        if (contains(moduleReadFaults, code) || contains(['titles_native_target', 'titles_native_document', 'titles_native_text', 'titles_native_range', 'titles_native_serialization'], code)) return true;
        for (var name in fieldAliases) if (fieldAliases.hasOwnProperty(name) && (code === 'titles_native_' + fieldAliases[name] || code === 'titles_missing_' + fieldAliases[name])) return true;
        return false;
    }
    function field(object, name) {
        var value;
        try { value = object[name]; } catch (e) { readFault('titles_native_' + fieldAliases[name]); }
        if (typeof value === 'undefined' || value === null) readFault('titles_missing_' + fieldAliases[name], 'unsupported_style_api');
        return value;
    }
    function range(doc, index) {
        try {
            if (typeof doc.characterRange !== 'function') fault('unsupported_style_proof');
            var value = doc.characterRange(index, index + 1);
            if (!value) fault('unsupported_style_proof');
            return value;
        } catch (e) { if (e && e.coreCode === 'unsupported_style_proof') throw e; readFault('titles_native_range'); }
    }
    function serialized(value) { try { return JSON.stringify(value); } catch (e) { readFault('titles_native_serialization'); } }
    function target(p) {
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
            value = field(object, names[i]);
            try {
            if (names[i] === 'justification' && typeof value === 'object') {
                if (typeof ParagraphJustification === 'undefined') fault('unsupported_justification_enum');
                var enumNames = ['LEFT_JUSTIFY', 'RIGHT_JUSTIFY', 'CENTER_JUSTIFY', 'FULL_JUSTIFY_LASTLINE_LEFT', 'FULL_JUSTIFY_LASTLINE_RIGHT', 'FULL_JUSTIFY_LASTLINE_CENTER', 'FULL_JUSTIFY_LASTLINE_FULL'];
                var enumValue = Number(value), supported = false, e;
                if (!isFinite(enumValue)) fault('unsupported_justification_enum');
                for (e = 0; e < enumNames.length; e++) if (typeof ParagraphJustification[enumNames[e]] !== 'undefined' && Number(ParagraphJustification[enumNames[e]]) === enumValue && String(ParagraphJustification[enumNames[e]]) === String(value)) supported = true;
                if (!supported) fault('unsupported_justification_enum');
                value = enumValue;
            }
            if (names[i] === 'justification' && (typeof value !== 'number' || !isFinite(value))) fault('unsupported_justification_enum');
            } catch (e) { if (e && e.coreCode === 'unsupported_justification_enum') throw e; readFault('titles_native_justification'); }
            out[names[i]] = value;
        }
        return out;
    }
    function snapshot(p) {
        var t, doc, text, i;
        try { t = target(p); } catch (e) { if (contains(moduleReadFaults, e && e.coreCode)) throw e; readFault('titles_native_target'); }
        try { doc = t.prop.value; } catch (e) { readFault('titles_native_document'); }
        try { text = doc && doc.text; } catch (e) { readFault('titles_native_text'); }
        if (!doc || typeof text !== 'string' || text.length === 0 || /[\r\n]/.test(text)) fault('unsupported_style_proof');
        // TextDocument inactive fill/stroke colors throw. CharacterRange supports
        // reading them, so keep the COMPLETE existing proof, including dormant
        // colors, with no fabricated RGB or dropped fields.
        var uniform = fields(range(doc, 0), characterFields);
        for (i = 0; i < text.length; i++) if (serialized(fields(range(doc, i), characterFields)) !== serialized(uniform)) fault('unsupported_mixed_style');
        var style = { character: uniform, paragraph: fields(doc, paragraphFields) };
        var resource = { projectId: p.projectId, compId: t.comp.id, layerId: t.layer.id };
        return { target: resource, text: text, 'protected': serialized(style), revision: serialized([resource, text, style]) };
    }
    function readSnapshot(p) {
        try { return snapshot(p); }
        catch (e) { var code = 'inspection_failed'; try { if (e && readCode(e.coreReadCode)) code = e.coreReadCode; else if (e && readCode(e.coreCode)) code = e.coreCode; } catch (ignored) {} return { readFailureVersion: 1, outcome: 'rejected', code: code }; }
    }
    function mutate(p) {
        var started = false;
        try {
            var before = snapshot(p);
            if (p.expectedRevision !== before.revision || p.expectedText !== before.text) fault('stale_target');
            if (typeof p.text !== 'string' || p.text.length === 0 || /[\r\n]/.test(p.text)) fault('unsupported_text');
            var proof = p._execution;
            if (!proof || proof.policyId !== 'current-matching-target-after-local-confirmation-v1' || proof.baselineRevision !== before.revision || proof.baselineProtected !== before['protected'] || !proof.target || proof.target.projectId !== before.target.projectId || proof.target.compId !== before.target.compId || proof.target.layerId !== before.target.layerId) fault('manual_approval_binding');
            var message = 'Изменить текст в текущей совпадающей цели?\nПодтверждение относится к текущему проекту, в том числе после повторного открытия.\nПроект: ' + p.projectId + '\ncompId: ' + p.compId + '\nlayerId: ' + p.layerId + '\nСтарый текст: ' + JSON.stringify(before.text) + '\nНовый текст: ' + JSON.stringify(p.text);
            var operator = proof.operatorConfirmation;
            if (operator) {
                if (!/^[a-f0-9]{64}$/.test(operator.digest) || typeof operator.expiresAt !== 'number' || operator.expiresAt <= new Date().getTime()) fault('operator_confirmation_expired');
            } else if (confirm(message, true, 'AE Agent Core4 — изменение текста') !== true) return { outcome: 'rejected', code: 'local_cancelled' };
            // Fresh resolution/CAS after modal boundary, then one synchronous setter
            // and separate local snapshot; no scheduling/modal/Node yield follows.
            before = snapshot(p);
            if (p.expectedRevision !== before.revision || p.expectedText !== before.text || proof.baselineProtected !== before['protected']) fault('stale_target');
            var t = target(p), doc = t.prop.value; doc.text = p.text;
            started = true; t.prop.setValue(doc);
            var after = snapshot(p);
            if (after.text !== p.text || after['protected'] !== before['protected']) fault('readback_mismatch');
            var verified = snapshot(p);
            if (verified.text !== p.text || verified['protected'] !== before['protected']) fault('local_transaction_readback');
            return { outcome: 'applied', snapshot: verified, transactionReceipt: { version: 1, policyId: proof.policyId, proposalId: proof.proposalId, planDigest: proof.planDigest, taskId: proof.taskId, taskEpoch: proof.taskEpoch, stepId: proof.stepId, checkpointRef: proof.checkpointRef, checkpointDigest: proof.checkpointDigest, baselineDigest: proof.baselineDigest, baselineRevision: proof.baselineRevision, target: verified.target, desiredText: p.text, protectedFields: verified['protected'] } };
        } catch (e) { return { outcome: started ? 'unknown' : 'rejected', code: e.coreCode || 'ae_error' }; }
    }
    return { inspect: readSnapshot, mutate: mutate, verify: readSnapshot };
}())
