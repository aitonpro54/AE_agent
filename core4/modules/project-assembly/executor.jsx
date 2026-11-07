(function () {
    var policy = 'current-matching-target-after-local-confirmation-v1';
    var marker = 'AE Core: project assembly v1';

    function fault(code) { var error = new Error(code); error.coreCode = code; throw error; }
    function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
    function fileKey(file) { return String(file).replace(/\\/g, '/').toLowerCase(); }
    function project(p) {
        var value = app.project;
        if (!value || !value.file || !value.file.exists || String(value.file.fsName) !== p.projectId) fault('assembly_project_changed');
        return value;
    }
    function still(item) {
        return item instanceof FootageItem && item.mainSource && item.mainSource.isStill === true &&
            item.hasVideo === true && item.file && item.file.exists && !item.footageMissing;
    }
    function readComposition(comp) {
        var layers = [];
        if (comp.numLayers > 12) fault('inspection_result_budget');
        for (var i = 1; i <= comp.numLayers; i++) {
            var layer = comp.layer(i);
            if (!layer.source) fault('inspection_failed');
            layers.push({ id: layer.id, sourceId: layer.source.id, name: layer.name, enabled: layer.enabled,
                startTime: layer.startTime, inPoint: layer.inPoint, outPoint: layer.outPoint });
        }
        return { id: comp.id, width: comp.width, height: comp.height, pixelAspect: comp.pixelAspect, frameDuration: comp.frameDuration,
            duration: comp.duration, layers: layers };
    }
    function byId(a, b) { return a.id - b.id; }
    function snapshot(p) {
        var current = project(p), items = [], assemblies = [];
        if (current.numItems > 128) fault('inspection_result_budget');
        for (var i = 1; i <= current.numItems; i++) {
            var item = current.item(i), comp = item instanceof CompItem;
            var kind = 'other';
            if (comp) kind = 'comp';
            else if (still(item)) kind = 'still';
            var info = { id: item.id, name: item.name, parentId: item.parentFolder.id,
                kind: kind };
            if (item instanceof FootageItem && item.file) info.file = String(item.file.fsName);
            if (comp) {
                info.duration = item.duration;
                if (item.comment === marker) assemblies.push(readComposition(item));
            }
            items.push(info);
        }
        items.sort(byId);
        assemblies.sort(byId);
        var target = { sessionId: p.sessionId, projectId: p.projectId };
        var revision = JSON.stringify([target, items, assemblies]);
        if (revision.length > 32768 || assemblies.length > 16) fault('inspection_result_budget');
        return { target: target, revision: revision, 'protected': p.projectId, items: items, assemblies: assemblies };
    }
    function read(p) {
        try { return snapshot(p); }
        catch (error) {
            return { readFailureVersion: 1, outcome: 'rejected',
                code: error.coreCode === 'inspection_result_budget' ? error.coreCode : 'inspection_failed' };
        }
    }
    function importFile(path) {
        var file = new File(path);
        if (!file.exists || file.alias || fileKey(file.fsName) !== fileKey(path) || !file.modified || file.length < 1) fault('assembly_import_unavailable');
        var options = new ImportOptions(file);
        if (!options.canImportAs(ImportAsType.FOOTAGE)) fault('assembly_import_unavailable');
        options.importAs = ImportAsType.FOOTAGE;
        options.sequence = false;
        return { options: options, stamp: [fileKey(file.fsName), file.length, file.modified.getTime()] };
    }
    function sources(p, before, current) {
        var seen = {}, result = [], imports = 0;
        for (var i = 0; i < before.items.length; i++) {
            var item = before.items[i];
            if (item.name.toLowerCase() === p.name.toLowerCase()) fault('assembly_name_exists');
            if (item.file) seen[fileKey(item.file)] = true;
        }
        for (var index = 0; index < p.layers.length; index++) {
            var layer = p.layers[index];
            if (layer.file !== undefined) {
                var key = fileKey(layer.file);
                if (seen[key]) fault('assembly_source_already_imported');
                seen[key] = true;
                result.push(importFile(layer.file));
                imports++;
                continue;
            }
            var source = null;
            for (var j = 1; j <= current.numItems; j++) {
                var candidate = current.item(j);
                if (candidate.id === layer.sourceId) { source = candidate; break; }
            }
            if (!(source instanceof CompItem) && !still(source)) fault('assembly_source_unavailable');
            result.push({ item: source, stamp: [source.id, source.name] });
        }
        if (before.items.length + imports + 1 > 128 || before.assemblies.length >= 16 ||
            before.revision.length + 2 * JSON.stringify([p.name, p.layers]).length + 512 * (p.layers.length + 1) > 32768) fault('inspection_result_budget');
        return result;
    }
    function apply(p) {
        var started = false;
        try {
            var before = snapshot(p), proof = p._execution;
            if (before.revision !== p.expectedRevision) fault('stale_target');
            if (!proof || proof.policyId !== policy || proof.baselineRevision !== before.revision ||
                proof.baselineProtected !== before['protected'] || !proof.target ||
                proof.target.sessionId !== p.sessionId || proof.target.projectId !== p.projectId) fault('manual_approval_binding');
            var current = project(p), prepared = sources(p, before, current), details = [];
            for (var i = 0; i < p.layers.length; i++) {
                var spec = p.layers[i];
                var sourceLabel = spec.file !== undefined ? spec.file : '#' + spec.sourceId + ' ' + prepared[i].item.name;
                details.push(JSON.stringify(spec.name) + ': ' + JSON.stringify(sourceLabel) + ' [' + spec.inFrame + ', ' + spec.outFrame + ')');
            }
            var message = 'Создать композицию в рабочем проекте?\nПроект: ' + p.projectId +
                '\nКомпозиция: ' + JSON.stringify(p.name) + ' · ' + p.width + '×' + p.height +
                ' · ' + p.fps + ' fps · ' + p.durationFrames + ' кадров\n' + details.join('\n');
            if (confirm(message, true, 'AE Agent Core — сборка композиции') !== true) fault('local_cancelled');
            if (snapshot(p).revision !== before.revision) fault('stale_target');
            current = project(p);
            var checked = sources(p, before, current);
            for (var j = 0; j < checked.length; j++) {
                if (!same(checked[j].stamp, prepared[j].stamp)) fault('assembly_source_changed');
            }
            app.beginUndoGroup('AE Agent Core — сборка композиции');
            try {
                started = true;
                var comp = current.items.addComp(p.name, p.width, p.height, 1, p.durationFrames / p.fps, p.fps);
                var frame = comp.frameDuration;
                if (!(frame > 0) || Math.abs(1 / frame - p.fps) > p.fps * 0.000005) fault('assembly_frame_rate_readback');
                comp.duration = p.durationFrames * frame;
                comp.comment = marker;
                // AE inserts at the top. Iterate backwards to preserve the approved order.
                for (var index = p.layers.length - 1; index >= 0; index--) {
                    var desired = p.layers[index], media = checked[index];
                    var item = media.item || current.importFile(media.options);
                    if (!media.item && (!still(item) || fileKey(item.file.fsName) !== fileKey(desired.file))) fault('assembly_import_readback');
                    var layer = comp.layers.add(item);
                    layer.name = desired.name;
                    layer.startTime = desired.inFrame * frame;
                    layer.inPoint = desired.inFrame * frame;
                    // AE can shift outPoint when inPoint changes. Set the end last.
                    layer.outPoint = desired.outFrame * frame;
                }
            } finally { app.endUndoGroup(); }
            var after = snapshot(p);
            if (!same(after, snapshot(p))) fault('local_transaction_readback');
            return { outcome: 'applied', snapshot: after, transactionReceipt: { version: 2, policyId: policy,
                proposalId: proof.proposalId, planDigest: proof.planDigest, taskId: proof.taskId,
                taskEpoch: proof.taskEpoch, stepId: proof.stepId, checkpointRef: proof.checkpointRef,
                checkpointDigest: proof.checkpointDigest, baselineDigest: proof.baselineDigest,
                baselineRevision: proof.baselineRevision, target: after.target, resultRevision: after.revision,
                protectedFields: after['protected'] } };
        } catch (error) {
            return { outcome: started ? 'unknown' : 'rejected', code: error.coreCode || 'ae_error' };
        }
    }
    return { inspect: read, mutate: apply, verify: read };
}())
