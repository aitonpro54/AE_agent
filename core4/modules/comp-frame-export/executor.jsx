(function () {
    var POLICY = 'current-matching-target-after-local-confirmation-v1';
    function fault(code) { var e = new Error(code); e.coreCode = code; throw e; }

    function composition(p) {
        var project = app.project;
        if (!project || !project.file || String(project.file.fsName) !== p.projectId) fault('frame_export_project');
        var comp = project.itemByID(p.compId);
        if (!(comp instanceof CompItem) || comp.id !== p.compId) fault('frame_export_composition');
        return comp;
    }

    function snapshot(p, comp) {
        var project = app.project, revision = project.revision, factor = comp.resolutionFactor;
        if (typeof revision !== 'number' || !isFinite(revision) || revision < 0 || Math.floor(revision) !== revision ||
            typeof project.dirty !== 'boolean' || !factor || factor.length !== 2) fault('frame_export_native_state');
        var target = { projectId: p.projectId, compId: p.compId };
        var state = JSON.stringify([comp.name, comp.width, comp.height, comp.duration, comp.frameDuration,
            comp.time, comp.displayStartTime, comp.numLayers, project.dirty, factor[0], factor[1]]);
        return { target: target, revision: JSON.stringify([target, revision, state]), 'protected': state,
            width: comp.width, height: comp.height, duration: comp.duration, frameDuration: comp.frameDuration,
            fullResolution: factor[0] === 1 && factor[1] === 1 };
    }

    function inspect(p) { return snapshot(p, composition(p)); }

    function completedPng(path) {
        for (var attempt = 0; attempt < 50; attempt++) {
            var file = new File(path), size = file.exists ? file.length : 0;
            if (file.alias || size > 67108864) fault('frame_export_readback');
            if (size >= 45) {
                file.encoding = 'BINARY';
                if (file.open('r')) {
                    var end = '';
                    try { if (file.seek(size - 12, 0)) end = file.read(12); }
                    finally { file.close(); }
                    if (end.length === 12 && end.substr(0, 8) === '\x00\x00\x00\x00IEND' && file.length === size) return size;
                }
            }
            $.sleep(100);
        }
        fault('frame_export_output_incomplete');
    }

    function mutate(p, confirmAction) {
        var started = false;
        try {
            var comp = composition(p), before = snapshot(p, comp), proof = p._execution;
            if (!proof || proof.policyId !== POLICY || before.revision !== p.expectedRevision ||
                proof.baselineRevision !== before.revision || proof.baselineProtected !== before['protected'] ||
                !proof.target || proof.target.projectId !== p.projectId || proof.target.compId !== p.compId) fault('frame_export_binding');
            if (!before.fullResolution || before.width > 4096 || before.height > 4096) fault('frame_export_resolution');
            var time = p.frame * before.frameDuration;
            if (p.frame < 0 || Math.floor(p.frame) !== p.frame || !(time >= 0 && time < before.duration)) fault('frame_export_range');
            if (typeof comp.saveFrameToPng !== 'function') fault('frame_export_unavailable');
            if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,90}\.png$/.test(p.fileName) ||
                /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])\./i.test(p.fileName)) fault('frame_export_filename');
            var folder = new Folder(app.project.file.parent.fsName + '/frames-output');
            if (!folder.exists || folder.alias) fault('frame_export_directory');
            var file = new File(folder.fsName + '/' + p.fileName);
            if (file.exists || file.alias) fault('frame_export_exists');
            if (!confirmAction || confirmAction() !== true) fault('operator_confirmation_required');
            if (snapshot(p, composition(p)).revision !== before.revision || file.exists || file.alias) fault('frame_export_stale');
            started = true;
            comp.saveFrameToPng(time, file);
            var bytes = completedPng(file.fsName);
            var after = inspect(p);
            if (after['protected'] !== before['protected']) fault('frame_export_state_changed');
            after.output = { file: String(file.fsName), frame: p.frame, bytes: bytes };
            return { outcome: 'applied', snapshot: after, transactionReceipt: { version: 2, policyId: POLICY,
                proposalId: proof.proposalId, planDigest: proof.planDigest, taskId: proof.taskId, taskEpoch: proof.taskEpoch,
                stepId: proof.stepId, checkpointRef: proof.checkpointRef, checkpointDigest: proof.checkpointDigest,
                baselineDigest: proof.baselineDigest, baselineRevision: proof.baselineRevision, target: after.target,
                resultRevision: after.revision, protectedFields: after['protected'] } };
        } catch (e) {
            return { outcome: started ? 'unknown' : 'rejected', code: e.coreCode || 'frame_export_ae_error' };
        }
    }
    return { inspect: inspect, verify: inspect, mutate: mutate };
}())
