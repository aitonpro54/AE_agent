(function () {
    var POLICY = 'current-matching-target-after-local-confirmation-v1';
    var TAG = 'AE_CORE4_RENDER_V2:';
    var COMPOSITION_WORKSPACE = 'AE_CORE4_COMP_WORKSPACE_V1';
    function fault(code) { var error = new Error(code); error.coreCode = code; throw error; }
    function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
    function contains(list, value) {
        for (var i = 0; i < list.length; i++) if (list[i] === value) return true;
        return false;
    }
    function compFor(p) {
        var project = app.project;
        if (!project || !project.file || String(project.file.fsName) !== p.projectId) fault('project_cas');
        var comp = project.itemByID(p.compId);
        if (!(comp instanceof CompItem) || (comp.comment !== 'AE_CORE4_TEXT_WORKSPACE_V1' && comp.comment !== COMPOSITION_WORKSPACE) ||
            comp.displayStartTime !== 0 || comp.numLayers > 60 || comp.numLayers < 1) fault('comp_render_workspace');
        return comp;
    }
    function output(name) {
        var dir = new Folder(app.project.file.parent.fsName + '/titles-output');
        if (!dir.exists || dir.alias || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,90}\.mp4$/.test(name) ||
            /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])\./i.test(name)) fault('comp_render_output_directory');
        var file = new File(dir.fsName + '/' + name);
        if (file.alias) fault('comp_render_output_alias');
        return file;
    }
    function identity(p) {
        return [p.compId, p.fileName, p.activeLayerId, p.controlledLayerIds, p.startFrame, p.frameCount, p.renderTemplate, p.outputTemplate];
    }
    function timeline(comp, includeLeaves) {
        var result = [];
        if (comp.numLayers > 60) fault('comp_render_timeline_profile');
        for (var i = 1; i <= comp.numLayers; i++) {
            var layer = comp.layer(i), transform = layer.property('ADBE Transform Group');
            var opacity = transform && transform.property('ADBE Opacity'), keys = [];
            if (!opacity || opacity.expressionEnabled || opacity.expression || opacity.numKeys > 16) fault('comp_render_timeline_profile');
            for (var k = 1; k <= opacity.numKeys; k++) {
                keys.push([opacity.keyTime(k), opacity.keyValue(k),
                    opacity.keyInInterpolationType(k) === KeyframeInterpolationType.LINEAR,
                    opacity.keyOutInterpolationType(k) === KeyframeInterpolationType.LINEAR]);
            }
            var entry = { name: layer.name, sourceId: layer.source ? layer.source.id : null,
                startTime: layer.startTime, inPoint: layer.inPoint, outPoint: layer.outPoint,
                stretch: layer.stretch, enabled: layer.enabled, opacity: keys.length ? null : opacity.value, keys: keys };
            if (includeLeaves && layer.source instanceof CompItem) entry.leaf = timeline(layer.source, false);
            result.push(entry);
        }
        return result;
    }
    function settings(item, om) {
        return JSON.stringify([item.getSettings(GetSettingsFormat.STRING_SETTABLE), om.getSettings(GetSettingsFormat.STRING_SETTABLE)]);
    }
    function matchesSettings(item, om, tag) {
        var actual = settings(item, om);
        if (actual === tag[8]) return true;
        if (item.status !== RQItemStatus.DONE) return false;
        var current = JSON.parse(actual), expected = JSON.parse(tag[8]);
        var from = expected[1]['Output File Info'], to = current[1]['Output File Info'];
        var placeholder = tag[1].slice(0, -4) + '.[fileExtension]';
        if (!from || !to || from['File Template'] !== placeholder || to['File Template'] !== tag[1]) return false;
        to['File Template'] = placeholder;
        return same(current, expected);
    }
    function jobOf(item, tag, comp, busy) {
        var copy = item.comp, file = output(tag[1]), om = item.outputModule(1);
        var start = tag[4], count = tag[5], frame = comp.frameDuration;
        if (!om || item.numOutputModules !== 1 || !om.file || om.file.fsName !== file.fsName ||
            om.postRenderAction !== PostRenderAction.NONE || om.getSettings(GetSettingsFormat.STRING).Format !== 'H.264' ||
            Math.abs(item.timeSpanStart - start * frame) > 0.00001 || Math.abs(item.timeSpanDuration - count * frame) > 0.00001 ||
            copy.numLayers !== comp.numLayers || copy.frameDuration !== frame || copy.width !== comp.width || copy.height !== comp.height ||
            copy.usedIn.length !== 0 || !matchesSettings(item, om, tag)) fault('comp_render_job_binding');
        for (var i = 1; i <= comp.numLayers; i++) {
            var original = comp.layer(i), staged = copy.layer(i);
            var enabled = contains(tag[3], original.id) ? original.id === tag[2] : original.enabled;
            if (staged.name !== original.name || staged.enabled !== enabled ||
                (staged.source && staged.source.id) !== (original.source && original.source.id)) fault('comp_render_job_visibility');
        }
        if (comp.comment === COMPOSITION_WORKSPACE &&
            (!same(timeline(copy, true), timeline(comp, true)) || tag[9] !== JSON.stringify(timeline(comp, true)))) fault('comp_render_job_timeline');
        var status = 'INCOMPLETE';
        if (item.status === RQItemStatus.DONE) status = 'DONE';
        if (item.status === RQItemStatus.QUEUED) status = 'QUEUED';
        return { jobCompId: copy.id, file: String(file.fsName), bytes: file.exists ? file.length : 0,
            fileName: tag[1], activeLayerId: tag[2], controlledLayerIds: tag[3], startFrame: start, frameCount: count,
            renderTemplate: tag[6], outputTemplate: tag[7], status: status, rendering: busy };
    }
    function observe(p) {
        var comp = compFor(p), q = app.project.renderQueue, queue = [], list = [], i, item, layer, owned, job;
        if (q.numItems > 64) fault('comp_render_queue_budget');
        var idle = !q.rendering;
        for (i = 1; i <= q.numItems; i++) {
            item = q.item(i);
            if (item.render) idle = false;
            var comment = String(item.comp.comment);
            if (comment.indexOf(TAG) === 0) {
                var tag = JSON.parse(comment.slice(TAG.length));
                if (tag instanceof Array && (tag.length === 9 || tag.length === 10) && tag[0] === comp.id) {
                    if (owned) fault('comp_render_job_ambiguous');
                    owned = item;
                    job = jobOf(item, tag, comp, q.rendering);
                    continue;
                }
            }
            queue.push([item.comp.id, item.render, Number(item.status)]);
        }
        for (i = 1; i <= comp.numLayers; i++) {
            layer = comp.layer(i);
            list.push({ layerId: layer.id, enabled: layer.enabled, controllable: !!layer.property('ADBE Text Properties') &&
                !layer.locked && !layer.solo && !layer.isTrackMatte && !layer.guideLayer && !layer.adjustmentLayer });
        }
        var target = { projectId: p.projectId, compId: p.compId };
        var state = [comp.name, comp.comment, comp.width, comp.height, comp.duration, comp.frameDuration, comp.time, queue];
        if (comp.comment === COMPOSITION_WORKSPACE) state.push(timeline(comp, true));
        var preserved = JSON.stringify(state);
        var snapshot = { target: target, revision: JSON.stringify([target, preserved, list, idle, job || null]), 'protected': preserved,
            duration: comp.duration, frameDuration: comp.frameDuration, queueIdle: idle, layers: list };
        if (comp.comment === COMPOSITION_WORKSPACE && (preserved.length > 20000 || snapshot.revision.length > 24000)) fault('comp_render_snapshot_budget');
        if (job) snapshot.job = job;
        return { snapshot: snapshot, owned: owned };
    }
    function inspect(p) { return observe(p).snapshot; }
    function dependencyGraph(root, p) {
        var visited = [], count = 0;
        function visit(comp) {
            if (contains(visited, comp.id)) return;
            if (visited.length >= 64) fault('comp_render_graph_budget');
            visited.push(comp.id);
            for (var i = 1; i <= comp.numLayers; i++) {
                if (++count > 360) fault('comp_render_graph_budget');
                var layer = comp.layer(i);
                if (layer.solo) fault('comp_render_solo');
                var enabled = comp.id === root.id && contains(p.controlledLayerIds, layer.id) ? layer.id === p.activeLayerId : layer.enabled;
                if (!enabled || layer.guideLayer) continue;
                readSource(layer.source);
                if (layer.hasTrackMatte) {
                    var matte = layer.trackMatteLayer;
                    if (!matte || matte.hasTrackMatte || matte.guideLayer) fault('comp_render_matte');
                    readSource(matte.source);
                }
            }
        }
        function readSource(source) {
            if (!source) return;
            if (source.useProxy) fault('comp_render_proxy');
            if (source instanceof CompItem) visit(source);
            else if (source instanceof FootageItem && source.footageMissing) fault('comp_render_missing_footage');
        }
        visit(root);
    }
    function preflight(p, observation) {
        var before = observation.snapshot, proof = p._execution;
        if (!proof || proof.policyId !== POLICY || before.revision !== p.expectedRevision ||
            proof.baselineRevision !== before.revision || proof.baselineProtected !== before['protected'] ||
            !proof.target || proof.target.projectId !== p.projectId || proof.target.compId !== p.compId) fault('comp_render_binding');
        var comp = compFor(p), file = output(p.fileName);
        var wholeComposition = comp.comment === COMPOSITION_WORKSPACE;
        if (wholeComposition !== (p.controlledLayerIds.length === 0 && p.activeLayerId === 0)) fault('comp_render_targets');
        if (p.mode !== 'stage') {
            var job = before.job;
            if (!job || job.jobCompId !== p.jobCompId || !same(JSON.parse(observation.owned.comp.comment.slice(TAG.length)).slice(0, 8), identity(p)) ||
                job.rendering || (p.mode === 'finalize' ? job.status !== 'DONE' || job.bytes < 1 : p.mode !== 'discard' || job.status === 'DONE')) fault('comp_render_job');
            return { comp: comp, file: file };
        }
        if (!before.queueIdle || before.job || p.jobCompId !== undefined) fault('comp_render_queue_busy');
        if (file.exists) fault('comp_render_output_exists');
        if ((p.startFrame + p.frameCount) * before.frameDuration > before.duration + 0.00001 ||
            p.frameCount * before.frameDuration > 12) fault('comp_render_frame_range');
        var controlled = [];
        for (var i = 0; i < before.layers.length; i++) if (contains(p.controlledLayerIds, before.layers[i].layerId)) {
            if (!before.layers[i].controllable) fault('comp_render_targets');
            controlled.push(i + 1);
        }
        if (controlled.length !== p.controlledLayerIds.length || (!wholeComposition && !contains(p.controlledLayerIds, p.activeLayerId))) fault('comp_render_targets');
        dependencyGraph(comp, p);
        return { comp: comp, controlled: controlled, file: file };
    }
    function stage(p, context, owned) {
        var comp = context.comp, copy = comp.duplicate();
        owned.copy = copy;
        copy.name = 'Core4 Render ' + p.compId + ' - ' + p.fileName;
        for (var i = 0; i < context.controlled.length; i++) {
            var index = context.controlled[i];
            copy.layer(index).enabled = comp.layer(index).id === p.activeLayerId;
        }
        var item = app.project.renderQueue.items.add(copy);
        owned.item = item;
        var om = item.outputModule(1);
        if (!contains(item.templates, p.renderTemplate) || !contains(om.templates, p.outputTemplate)) fault('comp_render_template_unavailable');
        item.applyTemplate(p.renderTemplate);
        om.applyTemplate(p.outputTemplate);
        om = item.outputModule(1);
        om.postRenderAction = PostRenderAction.NONE;
        om.file = context.file;
        item.timeSpanStart = p.startFrame * comp.frameDuration;
        item.timeSpanDuration = p.frameCount * comp.frameDuration;
        item.render = true;
        var nativeSettings = settings(item, item.outputModule(1));
        if (nativeSettings.length > 8192) fault('comp_render_settings_budget');
        var binding = identity(p).concat([nativeSettings]);
        if (comp.comment === COMPOSITION_WORKSPACE) binding.push(JSON.stringify(timeline(comp, true)));
        copy.comment = TAG + JSON.stringify(binding);
    }
    function removeCopy(copy) {
        var project = app.project, previousCount = project.numItems;
        copy.remove();
        // AE throws Item Not Found from itemByID after successful removal.
        if (project.numItems !== previousCount - 1) fault('comp_render_restore');
    }
    function mutate(p) {
        var before, context, observation, owned = {}, started = false;
        try {
            observation = observe(p);
            before = observation.snapshot;
            context = preflight(p, observation);
            var action = 'Снять незавершённое задание и удалить его копию';
            if (p.mode === 'stage') action = 'Подготовить единственное задание в очереди AE';
            if (p.mode === 'finalize') action = 'Подтвердить DONE и удалить временное задание и копию';
            var scope = p.activeLayerId === 0 ? 'Вся композиция' : 'Слой ' + p.activeLayerId;
            if (confirm(action + '\n' + scope + ', compId ' + p.compId + '\n' + p.projectId +
                '\nКадры: ' + p.startFrame + ' + ' + p.frameCount + '\n' + p.renderTemplate + ' / ' + p.outputTemplate +
                '\n' + context.file.fsName, true, 'AE Agent Core4 — очередь AE') !== true) return { outcome: 'rejected', code: 'local_cancelled' };
            observation = observe(p);
            before = observation.snapshot;
            context = preflight(p, observation);
            var after;
            try {
                if (p.mode === 'stage') {
                    started = true;
                    stage(p, context, owned);
                } else {
                    var copy = observation.owned.comp;
                    started = true;
                    observation.owned.remove();
                    removeCopy(copy);
                }
                after = inspect(p);
                if (after['protected'] !== before['protected'] || !same(after.layers, before.layers) ||
                    (p.mode === 'stage' ? !after.job || after.job.status !== 'QUEUED' || after.job.bytes !== 0 : !!after.job)) fault('comp_render_restore');
            } catch (e) {
                if (owned.item) owned.item.remove();
                if (owned.copy) {
                    removeCopy(owned.copy);
                    started = false;
                }
                throw e;
            }
            if (p.mode === 'finalize') after.render = { jobCompId: before.job.jobCompId, file: before.job.file, bytes: before.job.bytes,
                status: 'DONE', format: 'H.264', renderTemplate: p.renderTemplate, outputTemplate: p.outputTemplate, startFrame: p.startFrame, frameCount: p.frameCount };
            var proof = p._execution;
            return { outcome: 'applied', snapshot: after, transactionReceipt: { version: 2, policyId: POLICY,
                proposalId: proof.proposalId, planDigest: proof.planDigest, taskId: proof.taskId, taskEpoch: proof.taskEpoch,
                stepId: proof.stepId, checkpointRef: proof.checkpointRef, checkpointDigest: proof.checkpointDigest,
                baselineDigest: proof.baselineDigest, baselineRevision: proof.baselineRevision, target: after.target,
                resultRevision: after.revision, protectedFields: after['protected'] } };
        } catch (e) {
            var restored = false;
            if (before && !started) {
                try { restored = same(inspect(p), before); } catch (ignored) {}
            }
            return { outcome: started || before && !restored ? 'unknown' : 'rejected', code: e.coreCode || 'comp_render_ae_error' };
        }
    }
    return { inspect: inspect, mutate: mutate, verify: inspect };
}())
