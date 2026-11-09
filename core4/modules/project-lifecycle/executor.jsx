(function () {
    var policy = 'current-matching-target-after-local-confirmation-v1';
    var maxInventoryUnits = 40000;
    function fault(code) { var error = new Error(code); error.coreCode = code; throw error; }
    function key(file) { return String(file).replace(/\\/g, '/').toLowerCase(); }
    function matches(file, expected) { return file && key(file.fsName) === key(expected); }
    function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
    function inventory(project) {
        var rows = [], ids = {}, count = project.numItems, length = 2;
        if (typeof count !== 'number' || count < 0 || count % 1 !== 0) fault('lifecycle_native_state');
        if (count > 2048) fault('inspection_result_budget');
        for (var i = 1; i <= count; i++) {
            var item = project.item(i), id = item && item.id;
            if (typeof id !== 'number' || id < 1 || id > 2147483647 || id % 1 !== 0 ||
                ids[id] || typeof item.name !== 'string') fault('lifecycle_native_state');
            ids[id] = true;
            var row = [id, item.name, item instanceof CompItem ? item.numLayers : 0];
            length += JSON.stringify(row).length + (i > 1 ? 1 : 0);
            if (length > maxInventoryUnits) fault('inspection_result_budget');
            rows.push(row);
        }
        if (project.numItems !== count) fault('lifecycle_native_state');
        return JSON.stringify(rows);
    }
    function snapshot(p, expected) {
        var project = app.project;
        if (!project || !matches(project.file, expected)) fault('lifecycle_project_changed');
        var file = project.file, revision = project.revision, dirty = project.dirty;
        if (!file.exists || file.alias || !file.modified || file.length < 1 || typeof dirty !== 'boolean' ||
            typeof revision !== 'number' || !isFinite(revision) || Math.floor(revision) !== revision || revision < 0) fault('lifecycle_native_state');
        var stamp = { bytes: file.length, modifiedMs: file.modified.getTime() };
        var result = { target: { sessionId: p.sessionId, projectId: p.projectId }, currentProject: String(file.fsName),
            revision: JSON.stringify([revision, dirty, stamp.bytes, stamp.modifiedMs]), 'protected': p.projectId,
            dirty: dirty, fileStamp: stamp, inventory: inventory(project) };
        if (project.revision !== revision || project.dirty !== dirty) fault('lifecycle_native_state');
        // Bound the outer JSON, including the second escape of inventory names.
        if (JSON.stringify(result).length > maxInventoryUnits) fault('inspection_result_budget');
        return result;
    }
    function read(p) {
        try { return snapshot(p, p.projectId); }
        catch (error) { return { readFailureVersion: 1, outcome: 'rejected', code: error.coreCode || 'inspection_failed' }; }
    }
    function checkBytes(file, checkpoint, bytes) {
        if (!checkpoint.exists || checkpoint.alias || checkpoint.length !== bytes || file.length !== bytes) fault('lifecycle_disk_changed');
        var sourceOpen = false, checkpointOpen = false;
        try {
            file.encoding = checkpoint.encoding = 'BINARY';
            sourceOpen = file.open('r'); checkpointOpen = checkpoint.open('r');
            if (!sourceOpen || !checkpointOpen || !file.seek(0, 0) || !checkpoint.seek(0, 0)) fault('lifecycle_disk_unreadable');
            for (var offset = 0; offset < bytes; offset += 65536) {
                var count = Math.min(65536, bytes - offset), chunk = file.read(count);
                if (chunk.length !== count || chunk !== checkpoint.read(count) || file.error || checkpoint.error) fault('lifecycle_disk_changed');
            }
        } finally {
            try { if (sourceOpen) file.close(); }
            finally { if (checkpointOpen) checkpoint.close(); }
        }
    }
    function openOutcome(p) {
        var location = 'unobserved', dirty = 'unobserved';
        try {
            var project = app.project;
            if (project) {
                var file = project.file;
                if (!file) location = 'unsaved';
                else if (matches(file, p.destination)) location = 'destination';
                else if (matches(file, p.projectId)) location = 'source';
                else location = 'other';
                var value = project.dirty;
                if (typeof value === 'boolean') dirty = value ? 'dirty' : 'clean';
            }
        } catch (_) { /* Preserve whichever facts could be read. */ }
        return 'lifecycle_open_' + location + '_' + dirty;
    }
    function apply(p, confirmAction) {
        var started = false, preMutationError = 'lifecycle_native_baseline_error';
        try {
            var before = snapshot(p, p.projectId), proof = p._execution;
            if (before.revision !== p.expectedRevision || app.project.renderQueue.rendering !== false) fault('stale_target');
            if (!proof || proof.policyId !== policy || proof.baselineRevision !== before.revision || proof.baselineProtected !== before['protected'] ||
                !proof.target || proof.target.projectId !== p.projectId || proof.target.sessionId !== p.sessionId ||
                !/^checkpoint-[0-9a-f-]{36}$/.test(proof.checkpointRef) ||
                (p.action !== 'save-as' && p.action !== 'create' && p.action !== 'open')) fault('manual_approval_binding');
            var creating = p.action === 'create', opening = p.action === 'open';
            if ((creating || opening) && before.dirty) fault('lifecycle_clean_source_required');
            preMutationError = 'lifecycle_native_file_setup_error';
            var destination = new File(p.destination), checkpoint = new File(p.checkpointRoot + '/' + proof.checkpointRef + '.aep');
            if (!matches(destination, p.destination) || destination.exists !== opening || !destination.parent.exists || !checkpoint.exists) fault('lifecycle_destination_unavailable');
            var caption = 'Сохранить как';
            if (creating) caption = 'Создать пустой AEP';
            if (opening) caption = 'Открыть существующий AEP';
            var message = caption + ' и переключиться на него?\nТекущий проект: ' + p.projectId +
                '\nНовый проект: ' + p.destination + '\nКопия прежней версии: ' + checkpoint.fsName;
            preMutationError = 'lifecycle_native_confirmation_error';
            var accepted = confirmAction ? confirmAction(message, true, 'AE Agent Core — ' + caption) :
                confirm(message, true, 'AE Agent Core — ' + caption);
            if (accepted !== true) fault('local_cancelled');
            preMutationError = 'lifecycle_native_source_checkpoint_error';
            checkBytes(app.project.file, checkpoint, before.fileStamp.bytes);
            if (opening) {
                preMutationError = 'lifecycle_native_destination_checkpoint_error';
                var targetCopy = new File(p.checkpointRoot + '/' + proof.checkpointRef + '.open.aep');
                if (!destination.exists || destination.alias) fault('lifecycle_destination_unavailable');
                checkBytes(destination, targetCopy, targetCopy.length);
            }
            preMutationError = 'lifecycle_native_recheck_error';
            if (!same(snapshot(p, p.projectId), before) || app.project.renderQueue.rendering !== false ||
                destination.exists !== opening || !destination.parent.exists || !opening && destination.parent.getFiles().length !== 0) fault('stale_target');
            preMutationError = 'lifecycle_native_confirmation_error';
            if (confirmAction && confirmAction(message, true, 'AE Agent Core — ' + caption) !== true) fault('operator_confirmation_expired');
            started = true;
            if (creating) {
                app.newProject();
                if (!app.project || app.project.file || app.project.numItems !== 0) fault('lifecycle_create_not_empty');
            }
            if (opening) app.open(destination);
            else if (app.project.save(destination) !== true) fault('lifecycle_ae_save');
            var after = snapshot(p, p.destination);
            if (after.dirty || !opening && after.inventory !== (creating ? '[]' : before.inventory)) fault('lifecycle_native_readback');
            return { outcome: 'applied', snapshot: after, transactionReceipt: { version: 2, policyId: policy,
                proposalId: proof.proposalId, planDigest: proof.planDigest, taskId: proof.taskId, taskEpoch: proof.taskEpoch,
                stepId: proof.stepId, checkpointRef: proof.checkpointRef, checkpointDigest: proof.checkpointDigest,
                baselineDigest: proof.baselineDigest, baselineRevision: proof.baselineRevision, target: after.target,
                resultRevision: after.revision, protectedFields: after['protected'] } };
        } catch (error) { return { outcome: started ? 'unknown' : 'rejected',
            code: started && p.action === 'open' ? openOutcome(p) :
                error && error.coreCode || (started ? 'ae_error' : preMutationError) }; }
    }
    return { inspect: read, verify: read, mutate: apply };
}())
