(function () {
    var policy = 'current-matching-target-after-local-confirmation-v1';
    function fault(code) { var error = new Error(code); error.coreCode = code; throw error; }
    function fileKey(file) { return String(file).replace(/\\/g, '/').toLowerCase(); }
    function mediaKind(item) {
        if (!(item instanceof FootageItem) || !item.file || item.footageMissing || !item.mainSource ||
            (item.hasVideo !== true && item.hasAudio !== true)) return 'other';
        return item.mainSource.isStill === true ? 'still' : 'av';
    }
    function capture(p) {
        var project = app.project;
        if (!project || !project.file || !project.file.exists || String(project.file.fsName) !== p.projectId) fault('media_project_changed');
        var file = new File(p.file);
        if (!file.exists || file.alias || fileKey(file.fsName) !== fileKey(p.file) ||
            !file.modified || file.length < 1 || file.length > 1073741824) fault('media_import_file_unavailable');
        if (project.numItems > 512) fault('inspection_result_budget');
        var items = [];
        for (var i = 1; i <= project.numItems; i++) {
            var item = project.item(i);
            items.push({ id: item.id, name: item.name,
                file: item instanceof FootageItem && item.file ? String(item.file.fsName) : '', kind: mediaKind(item) });
        }
        items.sort(function (a, b) { return a.id - b.id; });
        var target = { sessionId: p.sessionId, projectId: p.projectId, file: p.file };
        var modifiedMs = file.modified.getTime();
        var revision = JSON.stringify([target, items, file.length, modifiedMs]);
        if (revision.length > 32768) fault('inspection_result_budget');
        return { project: project, file: file, snapshot: { target: target, revision: revision,
            'protected': p.projectId, items: items, bytes: file.length, modifiedMs: modifiedMs } };
    }
    function inspect(p) {
        try { return capture(p).snapshot; }
        catch (error) { return { readFailureVersion: 1, outcome: 'rejected',
            code: error.coreCode === 'inspection_result_budget' ? error.coreCode : 'inspection_failed' }; }
    }
    function validate(p, before) {
        if (before.revision !== p.expectedRevision) fault('stale_target');
        for (var i = 0; i < before.items.length; i++) {
            if (fileKey(before.items[i].file) === fileKey(p.file)) fault('media_already_imported');
        }
        if (before.items.length >= 512 || before.revision.length > 31700) fault('inspection_result_budget');
    }
    function mutate(p, confirmAction) {
        var started = false;
        try {
            var current = capture(p), before = current.snapshot, proof = p._execution;
            validate(p, before);
            if (!proof || proof.policyId !== policy || proof.baselineRevision !== before.revision ||
                proof.baselineProtected !== before['protected'] || !proof.target ||
                proof.target.projectId !== p.projectId || proof.target.sessionId !== p.sessionId ||
                proof.target.file !== p.file) fault('manual_approval_binding');
            var message = 'Импортировать один файл как футаж?\nПроект: ' + p.projectId +
                '\nФайл: ' + p.file + '\nSHA-256: ' + p.sha256;
            if ((confirmAction || confirm)(message, true, 'AE Agent Core — импорт футажа') !== true) fault('local_cancelled');
            current = capture(p);
            validate(p, current.snapshot);
            var options = new ImportOptions(current.file);
            if (!options.canImportAs(ImportAsType.FOOTAGE)) fault('media_import_file_unavailable');
            options.importAs = ImportAsType.FOOTAGE;
            options.sequence = false;
            app.beginUndoGroup('AE Agent Core — импорт футажа');
            try {
                started = true;
                var item = current.project.importFile(options);
                if (mediaKind(item) === 'other' || fileKey(item.file.fsName) !== fileKey(p.file)) fault('media_import_readback');
            } finally { app.endUndoGroup(); }
            var after = capture(p).snapshot;
            if (after.revision !== capture(p).snapshot.revision) fault('local_transaction_readback');
            after.createdItemId = item.id;
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
