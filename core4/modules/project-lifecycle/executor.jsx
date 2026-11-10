(function () {
    var policy = 'current-matching-target-after-local-confirmation-v1';
    var maxInventoryUnits = 40000;
    var renderTemplate = 'Best Settings', outputTemplate = 'H.264 - Match Render Settings - 15 Mbps';
    var scratchName = 'core4-r1-scratch.mp4';
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
    function integer(n, min, max) { return typeof n === 'number' && n >= min && n <= max && n % 1 === 0; }
    function contains(values, value) {
        for (var i = 0; i < values.length; i++) if (values[i] === value) return true;
        return false;
    }
    function queueStatus(status) {
        if (status === RQItemStatus.QUEUED) return 'Queued';
        if (status === RQItemStatus.UNQUEUED) return 'Unqueued';
        if (status === RQItemStatus.NEEDS_OUTPUT) return 'Needs Output';
        if (status === RQItemStatus.USER_STOPPED) return 'User Stopped';
        if (status === RQItemStatus.ERR_STOPPED) return 'Error Stopped';
        if (status === RQItemStatus.DONE) return 'Done';
        fault('lifecycle_render_queue_busy');
    }
    function queueState(project, maxRows) {
        var q = project.renderQueue, count = q.numItems, rows = [];
        if (q.rendering !== false) fault('lifecycle_render_queue_busy');
        if (!integer(count, 0, maxRows)) fault('lifecycle_render_queue_budget');
        for (var i = 1; i <= count; i++) {
            var item = q.item(i), comp = item.comp, status = queueStatus(item.status);
            if (!(comp instanceof CompItem) || typeof comp.name !== 'string' || !comp.name ||
                comp.name.length > 128 || typeof item.render !== 'boolean') fault('lifecycle_render_queue_state');
            rows.push({ index: i, name: comp.name, compId: comp.id, status: status, render: item.render });
        }
        return rows;
    }
    function mediaState(project) {
        // Expressions may reference footage outside the explicit layer source graph.
        // Inspect all project footage, including unused items and inactive proxies.
        var files = [], references = [], seen = {}, bytes = 0;
        for (var i = 1; i <= project.numItems; i++) {
            var item = project.item(i);
            if (!(item instanceof CompItem) && !(item instanceof FootageItem)) continue;
            if (item.useProxy !== false || item.proxySource) fault('lifecycle_render_proxy');
            if (!(item instanceof FootageItem)) continue;
            if (item.footageMissing !== false) fault('lifecycle_render_missing_media');
            if (item.mainSource instanceof SolidSource) continue;
            var file = item.file, source = item.mainSource;
            if (!(source instanceof FileSource) || !file || !file.exists || file.alias || !matches(source.file, file.fsName))
                fault('lifecycle_render_media_kind');
            var fileKey = key(file.fsName);
            if (!/^[a-z]:/.test(fileKey) || fileKey.charAt(2) !== '/') fault('lifecycle_render_media_kind');
            var still = source.isStill;
            if (still === true ? !/\.(?:png|jpe?g|tiff?|bmp)$/i.test(file.fsName) :
                still !== false || !/\.(?:mp4|mov|wav|aiff?|mp3|m4a)$/i.test(file.fsName)) fault('lifecycle_render_media_kind');
            references.push([item.id, fileKey]);
            if (seen[fileKey]) continue;
            var length = file.length, modified = file.modified;
            if (files.length >= 128 || !integer(length, 1, 1073741824) || (bytes += length) > 1073741824 ||
                !modified || !integer(modified.getTime(), 0, 9007199254740991)) fault('lifecycle_render_media_budget');
            seen[fileKey] = true;
            files.push({ path: String(file.fsName), bytes: length, modifiedMs: modified.getTime() });
        }
        return { files: files, references: references };
    }
    function renderContext(p, destination) {
        var project = app.project, requested = p.render;
        var comp = requested && project.itemByID(requested.compId);
        if (!(comp instanceof CompItem) || comp.id !== requested.compId || typeof comp.name !== 'string' ||
            !comp.name || comp.name.length > 128 || /[\x00-\x1f]/.test(comp.name) || comp.hasAudio !== requested.audio ||
            !integer(comp.width, 1, 30000) || !integer(comp.height, 1, 30000)) fault('lifecycle_render_target');
        var rate = /^([1-9]\d{0,6})\/([1-9]\d{0,6})$/.exec(requested.fps);
        var duration = comp.duration, frame = comp.frameDuration, count = Math.round(duration / frame);
        var start = comp.displayStartFrame;
        // AE can store decimal 29.97 while the MP4 encoder emits 30000/1001.
        if (!rate || typeof frame !== 'number' || frame <= 0 || Math.abs(frame / (Number(rate[2]) / Number(rate[1])) - 1) > 0.000002 ||
            !integer(count, 1, 2147483647) || Math.abs(duration / frame - count) > 0.0001 ||
            !integer(start, 0, 2147483647) || start + count - 1 > 2147483647) fault('lifecycle_render_timeline');
        var target = { compId: comp.id, compName: comp.name, frames: count, width: comp.width, height: comp.height,
            fps: requested.fps, audio: requested.audio, timeline: { startFrame: start, frameCount: count } };
        if (requested.startFrame !== undefined || requested.endFrameExclusive !== undefined) {
            if (!integer(requested.startFrame, 0, count - 1) || !integer(requested.endFrameExclusive, requested.startFrame + 1, count)) fault('lifecycle_render_range');
            target.frames = requested.endFrameExclusive - requested.startFrame;
            target.range = { startFrame: start + requested.startFrame, endFrameExclusive: start + requested.endFrameExclusive };
        }
        var output = new File(requested.output), scratch = new File(destination.parent.fsName + '/' + scratchName);
        if (!matches(output, requested.output) || !output.parent.exists || output.parent.alias || output.exists || output.alias ||
            scratch.exists || scratch.alias || matches(scratch, requested.output)) fault('lifecycle_render_output');
        return { comp: comp, duration: duration, target: target, media: mediaState(project), output: output, scratch: scratch };
    }
    function audioMode(om) {
        var settings = om.getSettings(GetSettingsFormat.STRING);
        var value = settings['Output Audio'];
        if (value === undefined) value = settings['Audio Output'];
        value = String(value).toLowerCase().replace(/^(?:audio output|output audio) /, '');
        return value === 'on (if comp has audio)' ? 'auto' : value;
    }
    function readStaged(p, destination, original, previousQueue) {
        var project = app.project;
        if (!matches(project.file, p.destination)) fault('lifecycle_project_changed');
        var current = renderContext(p, destination), rows = queueState(project, 64);
        if (!same(current.target, original.target) || !same(current.media, original.media) ||
            rows.length !== previousQueue.length + 1) fault('lifecycle_render_readback');
        var witness = [];
        for (var i = 0; i < previousQueue.length; i++) {
            var row = rows[i], previous = previousQueue[i];
            if (row.render || row.status === 'Queued' || row.name !== previous.name || row.compId !== previous.compId ||
                !previous.render && previous.status !== 'Queued' && row.status !== previous.status) fault('lifecycle_render_queue_state');
            witness.push({ index: row.index, name: row.name, status: row.status });
        }
        var selected = rows[rows.length - 1], item = project.renderQueue.item(selected.index), om = item.outputModule(1);
        var mode = audioMode(om);
        if (!selected.render || selected.status !== 'Queued' || selected.compId !== current.target.compId ||
            item.numOutputModules !== 1 || !matches(om.file, current.scratch.fsName) ||
            om.postRenderAction !== PostRenderAction.NONE || om.getSettings(GetSettingsFormat.STRING).Format !== 'H.264' ||
            (mode !== 'auto' && mode !== (current.target.audio ? 'on' : 'off')) ||
            !isFinite(item.timeSpanStart) || !isFinite(item.timeSpanDuration) ||
            Math.abs(item.timeSpanStart) > 0.000001 || Math.abs(item.timeSpanDuration - current.duration) > 0.000001) fault('lifecycle_render_readback');
        current.target.queueIndex = selected.index;
        witness.push({ index: selected.index, name: selected.name, status: selected.status, compId: selected.compId, format: 'H.264',
            frames: current.target.timeline.frameCount, startFrame: current.target.timeline.startFrame });
        return { target: current.target, queue: witness, media: current.media.files, output: p.render.output, scratchOutput: String(current.scratch.fsName) };
    }
    function stageQueue(p, destination, before, original, previousQueue) {
        var copy = snapshot(p, p.destination), project = app.project;
        var current = renderContext(p, destination);
        if (copy.dirty || copy.inventory !== before.inventory || !same(current.target, original.target) ||
            !same(current.media, original.media) || !same(queueState(project, 63), previousQueue)) fault('lifecycle_render_copy_binding');
        app.beginUndoGroup('AE Agent Core: очередь в копии AEP');
        try {
            var q = project.renderQueue, item = q.items.add(current.comp), om = item.outputModule(1);
            if (!contains(item.templates, renderTemplate) || !contains(om.templates, outputTemplate)) fault('lifecycle_render_template');
            item.applyTemplate(renderTemplate);
            om.applyTemplate(outputTemplate);
            om = item.outputModule(1);
            var mode = audioMode(om);
            if (mode !== 'auto' && mode !== (current.target.audio ? 'on' : 'off')) fault('lifecycle_render_audio');
            om.postRenderAction = PostRenderAction.NONE;
            om.file = current.scratch;
            item.timeSpanStart = 0;
            item.timeSpanDuration = current.duration;
            for (var i = 0; i < previousQueue.length; i++) {
                if (previousQueue[i].render || previousQueue[i].status === 'Queued') q.item(i + 1).render = false;
            }
            item.render = true;
            readStaged(p, destination, original, previousQueue);
        } finally { app.endUndoGroup(); }
        if (!matches(project.file, p.destination) || project.save() !== true) fault('lifecycle_ae_save');
        return readStaged(p, destination, original, previousQueue);
    }
    function apply(p, confirmAction) {
        var started = false, preMutationError = 'lifecycle_native_baseline_error';
        try {
            var before = snapshot(p, p.projectId), proof = p._execution;
            if (before.revision !== p.expectedRevision || app.project.renderQueue.rendering !== false) fault('stale_target');
            if (!proof || proof.policyId !== policy || proof.baselineRevision !== before.revision || proof.baselineProtected !== before['protected'] ||
                !proof.target || proof.target.projectId !== p.projectId || proof.target.sessionId !== p.sessionId ||
                !/^checkpoint-[0-9a-f-]{36}$/.test(proof.checkpointRef) ||
                (p.action !== 'save-as' && p.action !== 'create' && p.action !== 'open' && p.action !== 'stage-render-copy')) fault('manual_approval_binding');
            var creating = p.action === 'create', opening = p.action === 'open', staging = p.action === 'stage-render-copy';
            if (p.allowDirtyDestination !== undefined && (!opening || typeof p.allowDirtyDestination !== 'boolean')) fault('lifecycle_dirty_destination_policy');
            var allowDirtyDestination = opening && p.allowDirtyDestination === true;
            if ((creating || opening || staging) && before.dirty) fault('lifecycle_clean_source_required');
            preMutationError = 'lifecycle_native_file_setup_error';
            var destination = new File(p.destination), checkpoint = new File(p.checkpointRoot + '/' + proof.checkpointRef + '.aep');
            if (!matches(destination, p.destination) || destination.exists !== opening || !destination.parent.exists || !checkpoint.exists) fault('lifecycle_destination_unavailable');
            var caption = 'Сохранить как';
            if (creating) caption = 'Создать пустой AEP';
            if (opening) caption = 'Открыть существующий AEP';
            var render, previousQueue;
            if (staging) {
                preMutationError = 'lifecycle_render_preflight';
                if (destination.alias || destination.parent.alias || destination.parent.getFiles().length !== 0) fault('lifecycle_destination_unavailable');
                render = renderContext(p, destination);
                previousQueue = queueState(app.project, 63);
                if (JSON.stringify(before).length + JSON.stringify(render.media.files).length + JSON.stringify(previousQueue).length +
                    JSON.stringify([p.destination, render.scratch.fsName, p.render.output, render.target]).length + 1600 > maxInventoryUnits)
                    fault('inspection_result_budget');
                caption = 'Сохранить копию AEP и подготовить очередь';
            }
            var message = caption + ' и переключиться на него?\nТекущий проект: ' + p.projectId +
                '\nНовый проект: ' + p.destination + '\nКопия прежней версии: ' + checkpoint.fsName;
            if (allowDirtyDestination) message += '\nДопускается, что после загрузки AE отметит открытый проект как изменённый. Открытие выполняется без сохранения.';
            if (staging) {
                var target = render.target, timeline = target.timeline;
                var first = target.range ? target.range.startFrame : timeline.startFrame;
                message += '\nКомпозиция: ' + target.compName + ', compId ' + target.compId +
                    '\nКадры: [' + first + ', ' + (first + target.frames) + '), ' + target.fps + ' fps, ' +
                    (target.audio ? 'со звуком' : 'без звука') + '\n' + renderTemplate + ' / ' + outputTemplate +
                    '\nВременный MP4: ' + render.scratch.fsName + '\nИтоговый MP4: ' + p.render.output;
            }
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
            if (staging) {
                var fresh = renderContext(p, destination);
                if (destination.alias || destination.parent.alias || !same(fresh.target, render.target) ||
                    !same(fresh.media, render.media) || !same(queueState(app.project, 63), previousQueue)) fault('stale_target');
            }
            preMutationError = 'lifecycle_native_confirmation_error';
            if (confirmAction && confirmAction(message, true, 'AE Agent Core — ' + caption) !== true) fault('operator_confirmation_expired');
            started = true;
            if (creating) {
                app.newProject();
                if (!app.project || app.project.file || app.project.numItems !== 0) fault('lifecycle_create_not_empty');
            }
            if (opening) {
                var opened = app.open(destination);
                if (opened === null || opened === undefined) fault('lifecycle_ae_open');
            } else if (app.project.save(destination) !== true) fault('lifecycle_ae_save');
            var renderJob = staging ? stageQueue(p, destination, before, render, previousQueue) : null;
            var after = snapshot(p, p.destination);
            if (after.dirty !== false && !allowDirtyDestination) fault('lifecycle_native_readback');
            if (!opening && after.inventory !== (creating ? '[]' : before.inventory)) fault('lifecycle_native_readback');
            if (staging) {
                after.renderJob = renderJob;
                if (JSON.stringify(after).length > maxInventoryUnits) fault('inspection_result_budget');
            }
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
