(function () {
    var policy = 'current-matching-target-after-local-confirmation-v1';
    var maxItems = 2048, maxSnapshotBytes = 96 * 1024, addedItemAllowance = 8192;
    function fault(code) { var error = new Error(code); error.coreCode = code; throw error; }
    function fileKey(file) { return String(file).replace(/\\/g, '/').toLowerCase(); }
    function mediaKind(item) {
        if (!(item instanceof FootageItem) || !item.file || item.footageMissing || !item.mainSource ||
            (item.hasVideo !== true && item.hasAudio !== true)) return 'other';
        return item.mainSource.isStill === true ? 'still' : 'av';
    }
    function utf8Bytes(text) {
        var bytes = 0;
        for (var i = 0; i < text.length; i++) {
            var c = text.charCodeAt(i), next = text.charCodeAt(i + 1);
            if (c >= 55296 && c <= 56319 && next >= 56320 && next <= 57343) { bytes += 4; i++; }
            else bytes += c < 128 ? 1 : c < 2048 ? 2 : 3;
        }
        return bytes;
    }
    function capture(p) {
        var project = app.project;
        if (!project || !project.file || !project.file.exists || String(project.file.fsName) !== p.projectId) fault('media_project_changed');
        var preflight = p.file === undefined, file;
        if (!preflight) {
            file = new File(p.file);
            if (!file.exists || file.alias || fileKey(file.fsName) !== fileKey(p.file) ||
                !file.modified || file.length < 1 || file.length > 1073741824) fault('media_import_file_unavailable');
        }
        var count = project.numItems, projectRevision = project.revision;
        if (typeof count !== 'number' || count < 0 || count % 1 !== 0 ||
            typeof projectRevision !== 'number' || !isFinite(projectRevision) || projectRevision < 0 ||
            projectRevision % 1 !== 0 || projectRevision > 9007199254740991) fault('media_project_changed');
        if (count > maxItems) fault('inspection_result_budget');
        var items = [], ids = {}, inventoryBytes = 2;
        for (var i = 1; i <= count; i++) {
            var item = project.item(i), id = item && item.id;
            if (typeof id !== 'number' || id < 1 || id > 2147483647 || id % 1 !== 0 ||
                ids[id] || typeof item.name !== 'string') fault('media_project_changed');
            ids[id] = true;
            var itemFile = item instanceof FootageItem && item.file ? String(item.file.fsName) : '';
            if (item.name.length > 512 || itemFile.length > 512) fault('inspection_result_budget');
            var row = { id: id, name: item.name, file: itemFile, kind: mediaKind(item) };
            inventoryBytes += utf8Bytes(JSON.stringify(row)) + (i > 1 ? 1 : 0);
            if (inventoryBytes > maxSnapshotBytes) fault('inspection_result_budget');
            items.push(row);
        }
        if (project.revision !== projectRevision || project.numItems !== count) fault('media_project_changed');
        items.sort(function (a, b) { return a.id - b.id; });
        var target = { sessionId: p.sessionId, projectId: p.projectId };
        var stamp = [projectRevision, count];
        var snapshot = { target: target, 'protected': p.projectId, items: items };
        if (!preflight) {
            target.file = p.file;
            snapshot.bytes = file.length;
            snapshot.modifiedMs = file.modified.getTime();
            stamp.push(snapshot.bytes, snapshot.modifiedMs);
        }
        snapshot.revision = JSON.stringify([target, stamp]);
        if (utf8Bytes(JSON.stringify(snapshot)) > maxSnapshotBytes) fault('inspection_result_budget');
        return { project: project, file: file, snapshot: snapshot };
    }
    function inspect(p) {
        try {
            var before = capture(p).snapshot;
            if (p.file === undefined) requireSpace(before, 8192);
            return before;
        }
        catch (error) { return { readFailureVersion: 1, outcome: 'rejected',
            code: error.coreCode === 'inspection_result_budget' ? error.coreCode : 'inspection_failed' }; }
    }
    function requireSpace(before, extra) {
        var bytes = utf8Bytes(JSON.stringify(before)) + extra;
        // The intent keeps the same compact inventory in both input and physicalInput.
        var baselineBytes = utf8Bytes(JSON.stringify(JSON.stringify(compactInventory(before.items))));
        if (before.items.length >= maxItems || bytes > maxSnapshotBytes - addedItemAllowance ||
            bytes + 2 * baselineBytes > 224 * 1024) fault('inspection_result_budget');
    }
    function compactInventory(items) {
        var rows = [];
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            rows.push([item.id, item.name, item.file, item.kind]);
        }
        return rows;
    }
    function validate(p, before) {
        if (before.revision !== p.expectedRevision ||
            JSON.stringify(compactInventory(before.items)) !== JSON.stringify(JSON.parse(p.expectedInventory))) fault('stale_target');
        for (var i = 0; i < before.items.length; i++) {
            if (fileKey(before.items[i].file) === fileKey(p.file)) fault('media_already_imported');
        }
        requireSpace(before, 0);
    }
    function mutate(p, confirmAction) {
        var started = false;
        try {
            if (p.file === undefined) fault('media_import_preflight_only');
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
            if (JSON.stringify(current.snapshot) !== JSON.stringify(before)) fault('stale_target');
            var options = new ImportOptions(current.file);
            if (!options.canImportAs(ImportAsType.FOOTAGE)) fault('media_import_file_unavailable');
            options.importAs = ImportAsType.FOOTAGE;
            options.sequence = false;
            app.beginUndoGroup('AE Agent Core — импорт футажа');
            try {
                if (confirmAction && confirmAction(message, true, 'AE Agent Core — импорт футажа') !== true)
                    fault('operator_confirmation_expired');
                started = true;
                var item = current.project.importFile(options);
                if (mediaKind(item) === 'other' || fileKey(item.file.fsName) !== fileKey(p.file)) fault('media_import_readback');
            } finally { app.endUndoGroup(); }
            var after = capture(p).snapshot;
            if (JSON.stringify(after) !== JSON.stringify(capture(p).snapshot)) fault('local_transaction_readback');
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
