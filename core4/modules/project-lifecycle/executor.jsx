(function () {
    var policy = 'current-matching-target-after-local-confirmation-v1';
    function fault(code) { var error = new Error(code); error.coreCode = code; throw error; }
    function key(file) { return String(file).replace(/\\/g, '/').toLowerCase(); }
    function matches(file, expected) { return file && key(file.fsName) === key(expected); }
    function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
    function inventory(project) {
        var rows = [], count = project.numItems;
        if (count > 256) fault('inspection_result_budget');
        for (var i = 1; i <= count; i++) {
            var item = project.item(i);
            rows.push([item.id, item.name, item instanceof CompItem ? item.numLayers : 0]);
        }
        var result = JSON.stringify(rows);
        if (result.length > 24576) fault('inspection_result_budget');
        return result;
    }
    function snapshot(p, expected) {
        var project = app.project;
        if (!project || !matches(project.file, expected)) fault('lifecycle_project_changed');
        var file = project.file, revision = project.revision, dirty = project.dirty;
        if (!file.exists || file.alias || !file.modified || file.length < 1 || typeof dirty !== 'boolean' ||
            typeof revision !== 'number' || !isFinite(revision) || Math.floor(revision) !== revision || revision < 0) fault('lifecycle_native_state');
        var stamp = { bytes: file.length, modifiedMs: file.modified.getTime() };
        return { target: { sessionId: p.sessionId, projectId: p.projectId }, currentProject: String(file.fsName),
            revision: JSON.stringify([revision, dirty, stamp.bytes, stamp.modifiedMs]), 'protected': p.projectId,
            dirty: dirty, fileStamp: stamp, inventory: inventory(project) };
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
    function apply(p) {
        var started = false;
        try {
            var before = snapshot(p, p.projectId), proof = p._execution;
            if (before.revision !== p.expectedRevision || app.project.renderQueue.rendering !== false) fault('stale_target');
            if (!proof || proof.policyId !== policy || proof.baselineRevision !== before.revision || proof.baselineProtected !== before['protected'] ||
                !proof.target || proof.target.projectId !== p.projectId || proof.target.sessionId !== p.sessionId ||
                !/^checkpoint-[0-9a-f-]{36}$/.test(proof.checkpointRef) ||
                (p.action !== 'save-as' && p.action !== 'create')) fault('manual_approval_binding');
            var creating = p.action === 'create';
            if (creating && before.dirty) fault('lifecycle_clean_source_required');
            var destination = new File(p.destination), checkpoint = new File(p.checkpointRoot + '/' + proof.checkpointRef + '.aep');
            if (!matches(destination, p.destination) || destination.exists || !destination.parent.exists || !checkpoint.exists) fault('lifecycle_destination_unavailable');
            var caption = creating ? 'Создать пустой AEP' : 'Сохранить как';
            var message = caption + ' и переключиться на него?\nТекущий проект: ' + p.projectId +
                '\nНовый проект: ' + p.destination + '\nКопия прежней версии: ' + checkpoint.fsName;
            if (confirm(message, true, 'AE Agent Core — ' + caption) !== true) fault('local_cancelled');
            checkBytes(app.project.file, checkpoint, before.fileStamp.bytes);
            if (!same(snapshot(p, p.projectId), before) || app.project.renderQueue.rendering !== false || destination.exists ||
                !destination.parent.exists || destination.parent.getFiles().length !== 0) fault('stale_target');
            started = true;
            if (creating) {
                app.newProject();
                if (!app.project || app.project.file || app.project.numItems !== 0) fault('lifecycle_create_not_empty');
            }
            if (app.project.save(destination) !== true) fault('lifecycle_ae_save');
            var after = snapshot(p, p.destination);
            if (after.dirty || after.inventory !== (creating ? '[]' : before.inventory)) fault('lifecycle_native_readback');
            return { outcome: 'applied', snapshot: after, transactionReceipt: { version: 2, policyId: policy,
                proposalId: proof.proposalId, planDigest: proof.planDigest, taskId: proof.taskId, taskEpoch: proof.taskEpoch,
                stepId: proof.stepId, checkpointRef: proof.checkpointRef, checkpointDigest: proof.checkpointDigest,
                baselineDigest: proof.baselineDigest, baselineRevision: proof.baselineRevision, target: after.target,
                resultRevision: after.revision, protectedFields: after['protected'] } };
        } catch (error) { return { outcome: started ? 'unknown' : 'rejected', code: error.coreCode || 'ae_error' }; }
    }
    return { inspect: read, verify: read, mutate: apply };
}())
