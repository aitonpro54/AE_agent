(function (reviewedTitles) {
    // OFFLINE EXPERIMENT. The private fixture composes this reviewed factory with
    // the reviewed titles executor. No runtime source/function dependency ingress.
    // Session checking below is synthetic compatibility, NOT incarnation proof.
    function fault(code) { var e = new Error(code); e.coreCode = code; throw e; }
    function canonical(value) {
        if (!value || typeof value !== 'object') return JSON.stringify(value);
        var keys = [], out = [], k, i;
        if (value instanceof Array) {
            for (i = 0; i < value.length; i++) out.push(canonical(value[i]));
            return '[' + out.join(',') + ']';
        }
        for (k in value) if (Object.prototype.hasOwnProperty.call(value, k)) keys.push(k);
        keys.sort();
        for (i = 0; i < keys.length; i++) out.push(JSON.stringify(keys[i]) + ':' + canonical(value[keys[i]]));
        return '{' + out.join(',') + '}';
    }
    function exact(value, keys) {
        if (!value || typeof value !== 'object' || value instanceof Array) fault('manual_payload');
        var k, count = 0, i, found;
        for (k in value) if (Object.prototype.hasOwnProperty.call(value, k)) {
            found = false;
            for (i = 0; i < keys.length; i++) if (keys[i] === k) found = true;
            if (!found) fault('manual_payload');
            count++;
        }
        if (count !== keys.length) fault('manual_payload');
    }
    function parameters(p) {
        exact(p, ['policy', 'proposalId', 'planId', 'planDigest', 'taskId', 'stepId', 'effect', 'target', 'baseline', 'pins', 'text']);
        if (p.policy !== 'current-matching-target-after-local-confirmation' || p.effect !== 'replace-source-text') fault('manual_policy');
        exact(p.target, ['sessionId', 'projectId', 'compId', 'layerId']);
        exact(p.baseline, ['target', 'text', 'protected', 'revision']);
        exact(p.pins, ['titlesExecutorHash', 'transactionSourceHash', 'executorHash']);
        if (canonical(p.target) !== canonical(p.baseline.target)) fault('manual_baseline');
        if (typeof p.text !== 'string' || p.text.length === 0 || /[\r\n]/.test(p.text)) fault('unsupported_text');
        return { sessionId: p.target.sessionId, projectId: p.target.projectId, compId: p.target.compId, layerId: p.target.layerId,
            expectedText: p.baseline.text, expectedRevision: p.baseline.revision, text: p.text };
    }
    function mutate(p) {
        var mayHaveMutated = false;
        try {
            var args = parameters(p), before = reviewedTitles.inspect(args);
            if (canonical(before) !== canonical(p.baseline)) fault('stale_target');
            var message = 'Изменить текст в текущем проекте?\n' +
                'Подтверждение относится к текущей совпадающей цели, в том числе после повторного открытия проекта.\n' +
                'Путь проекта: ' + JSON.stringify(p.target.projectId) + '\n' +
                'compId: ' + p.target.compId + '\nlayerId: ' + p.target.layerId + '\n' +
                'Старый текст: ' + JSON.stringify(p.baseline.text) + '\nНовый текст: ' + JSON.stringify(p.text);
            // Modal confirmation MAY yield to host events. Never retain before's
            // target objects as authority across this boundary.
            if (confirm(message, true, 'Изменение текста') !== true) return { outcome: 'rejected', code: 'local_cancelled' };
            // Narrow synchronous no-yield segment: fresh target resolution, full
            // text/revision/style/effect checks, sole setter, separate local readback
            // are implemented by this pinned dependency. No modal/update/scheduleTask
            // or Node roundtrip occurs here. Actual AE no-reentry remains unproven.
            mayHaveMutated = true;
            var result = reviewedTitles.mutate(args);
            if (result.outcome !== 'applied') return result;
            // A separate local snapshot after mutate's own readback. This is NOT
            // the Broker's independent verification or an incarnation proof.
            var verified = reviewedTitles.verify(args);
            if (verified.text !== p.text || verified.protected !== p.baseline.protected ||
                canonical(verified.target) !== canonical(p.target)) fault('manual_readback_mismatch');
            return { outcome: 'applied', snapshot: verified };
        } catch (e) { return { outcome: mayHaveMutated ? 'unknown' : 'rejected', code: e.coreCode || 'manual_error' }; }
    }
    return { inspect: reviewedTitles.inspect, mutate: mutate, verify: reviewedTitles.verify };
})
