(function () {
    function fault(code) { var e = new Error(code); e.coreCode = code; throw e; }
    var characterFields = ['font', 'fontSize', 'applyFill', 'fillColor', 'applyStroke', 'strokeColor', 'strokeWidth', 'tracking', 'baselineShift', 'horizontalScale', 'verticalScale', 'fauxBold', 'fauxItalic'];
    var paragraphFields = ['justification', 'leading', 'autoLeading'];
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
            value = object[names[i]];
            if (typeof value === 'undefined' || value === null) fault('unsupported_style_api');
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
        var resource = { projectId: p.projectId, compId: t.comp.id, layerId: t.layer.id };
        return { target: resource, text: doc.text, 'protected': JSON.stringify(style), revision: JSON.stringify([resource, doc.text, style]) };
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
            if (confirm(message, true, 'AE Agent Core4 — изменение текста') !== true) return { outcome: 'rejected', code: 'local_cancelled' };
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
    return { inspect: snapshot, mutate: mutate, verify: snapshot };
}())
