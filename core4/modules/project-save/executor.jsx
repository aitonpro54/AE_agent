(function () {
    var policy = 'current-matching-target-after-local-confirmation-v1';

    function fault(code) { var error = new Error(code); error.coreCode = code; throw error; }
    function current(p) {
        var project = app.project;
        if (!project || !project.file || String(project.file.fsName) !== p.projectId || !/\.aep$/i.test(p.projectId)) fault('save_project_changed');
        return project;
    }
    function snapshot(p) {
        var project = current(p), file = project.file, revision = project.revision;
        if (typeof revision !== 'number' || !isFinite(revision) || Math.floor(revision) !== revision || revision < 0) fault('save_revision_unavailable');
        if (typeof project.dirty !== 'boolean') fault('save_dirty_unavailable');
        if (!file.exists || file.alias || file.length < 1 || !file.modified) fault('save_file_unavailable');
        var stamp = { bytes: file.length, modifiedMs: file.modified.getTime() }, dirty = project.dirty;
        return { target: { sessionId: p.sessionId, projectId: p.projectId },
            revision: JSON.stringify([revision, dirty, stamp.bytes, stamp.modifiedMs]), 'protected': p.projectId,
            dirty: dirty, fileStamp: stamp };
    }
    function read(p) {
        try { return snapshot(p); }
        catch (error) { return { readFailureVersion: 1, outcome: 'rejected', code: error.coreCode || 'inspection_failed' }; }
    }
    function key(path) { return String(path).replace(/\\/g, '/'); }
    function checkBytes(original, checkpoint, bytes) {
        var originalOpen = false, checkpointOpen = false;
        try {
            if (!checkpoint.exists || checkpoint.alias || checkpoint.length !== bytes || original.length !== bytes) fault('save_checkpoint_changed');
            original.encoding = checkpoint.encoding = 'BINARY';
            originalOpen = original.open('r'); checkpointOpen = checkpoint.open('r');
            if (!originalOpen || !checkpointOpen || !original.seek(0, 0) || !checkpoint.seek(0, 0)) fault('save_checkpoint_unreadable');
            for (var offset = 0; offset < bytes; offset += 65536) {
                var count = Math.min(65536, bytes - offset), chunk = original.read(count);
                if (chunk.length !== count || chunk !== checkpoint.read(count) || original.error || checkpoint.error) fault('save_checkpoint_changed');
            }
        } finally {
            try { if (originalOpen) original.close(); }
            finally { if (checkpointOpen) checkpoint.close(); }
        }
    }
    function apply(p, confirmAction) {
        var started = false, preMutationError = 'save_native_baseline_error';
        try {
            var before = snapshot(p), proof = p._execution;
            if (before.revision !== p.expectedRevision) fault('stale_target');
            if (!proof || proof.policyId !== policy || proof.baselineRevision !== before.revision ||
                proof.baselineProtected !== before['protected'] || !proof.target || proof.target.sessionId !== p.sessionId ||
                proof.target.projectId !== p.projectId || !/^checkpoint-[0-9a-f-]{36}$/.test(proof.checkpointRef)) fault('manual_approval_binding');
            preMutationError = 'save_native_file_setup_error';
            var file = key(p.checkpointRoot) + '/' + proof.checkpointRef + '.aep', checkpoint = new File(file);
            if (key(checkpoint.fsName) !== file || !checkpoint.exists) fault('save_checkpoint_unavailable');
            var message = 'Сохранить текущий проект After Effects?\nПроект: ' + p.projectId +
                '\nРезервная копия версии с диска: ' + checkpoint.fsName;
            preMutationError = 'save_native_confirmation_error';
            if ((confirmAction || confirm)(message, true, 'AE Agent Core — сохранение проекта') !== true) fault('local_cancelled');
            preMutationError = 'save_native_checkpoint_error';
            var project = current(p);
            checkBytes(project.file, checkpoint, before.fileStamp.bytes);
            preMutationError = 'save_native_recheck_error';
            if (JSON.stringify(snapshot(p)) !== JSON.stringify(before)) fault('stale_target');
            preMutationError = 'save_native_confirmation_error';
            if (confirmAction && confirmAction(message, true, 'AE Agent Core — сохранение проекта') !== true)
                fault('operator_confirmation_expired');
            started = true;
            if (project.save() !== true) fault('save_ae_failed');
            var after = snapshot(p);
            if (after.dirty) fault('save_ae_still_dirty');
            return { outcome: 'applied', snapshot: after, transactionReceipt: { version: 2, policyId: policy,
                proposalId: proof.proposalId, planDigest: proof.planDigest, taskId: proof.taskId, taskEpoch: proof.taskEpoch,
                stepId: proof.stepId, checkpointRef: proof.checkpointRef, checkpointDigest: proof.checkpointDigest,
                baselineDigest: proof.baselineDigest, baselineRevision: proof.baselineRevision, target: after.target,
                resultRevision: after.revision, protectedFields: after['protected'] } };
        } catch (error) {
            return { outcome: started ? 'unknown' : 'rejected',
                code: error && error.coreCode || (started ? 'ae_error' : preMutationError) };
        }
    }
    return { inspect: read, verify: read, mutate: apply };
}())
