(function () {
    var POLICY = 'current-matching-target-after-local-confirmation-v1';
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
        if (!(comp instanceof CompItem) || comp.comment !== 'AE_CORE4_TEXT_WORKSPACE_V1' ||
            comp.displayStartTime !== 0 || comp.numLayers > 60 || comp.numLayers < 1) fault('comp_render_workspace');
        return comp;
    }
    function inspect(p) {
        var comp = compFor(p), q = app.project.renderQueue, queue = [], list = [], i, item, layer;
        if (q.numItems > 64) fault('comp_render_queue_budget');
        var idle = !q.rendering;
        for (i = 1; i <= q.numItems; i++) {
            item = q.item(i);
            queue.push([item.comp.id, item.render, Number(item.status)]);
            if (item.render) idle = false;
        }
        for (i = 1; i <= comp.numLayers; i++) {
            layer = comp.layer(i);
            list.push({ layerId: layer.id, enabled: layer.enabled, controllable: !!layer.property('ADBE Text Properties') &&
                !layer.locked && !layer.solo && !layer.isTrackMatte && !layer.guideLayer && !layer.adjustmentLayer });
        }
        var target = { projectId: p.projectId, compId: p.compId };
        var preserved = JSON.stringify([comp.name, comp.comment, comp.width, comp.height, comp.duration, comp.frameDuration, comp.time, queue]);
        return { target: target, revision: JSON.stringify([target, preserved, list]), 'protected': preserved, duration: comp.duration,
            frameDuration: comp.frameDuration, queueIdle: idle, layers: list };
    }
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
    function output(p) {
        var dir = new Folder(app.project.file.parent.fsName + '/titles-output');
        if (!dir.exists || dir.alias || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,90}\.mp4$/.test(p.fileName)) fault('comp_render_output_directory');
        var file = new File(dir.fsName + '/' + p.fileName);
        if (file.exists || file.alias) fault('comp_render_output_exists');
        return file;
    }
    function preflight(p, before) {
        var proof = p._execution;
        if (!proof || proof.policyId !== POLICY || before.revision !== p.expectedRevision ||
            proof.baselineRevision !== before.revision || proof.baselineProtected !== before['protected'] ||
            !proof.target || proof.target.projectId !== p.projectId || proof.target.compId !== p.compId) fault('comp_render_binding');
        if (!before.queueIdle) fault('comp_render_queue_busy');
        if ((p.startFrame + p.frameCount) * before.frameDuration > before.duration + 0.00001 ||
            p.frameCount * before.frameDuration > 8) fault('comp_render_frame_range');
        var comp = compFor(p), controlled = [], i;
        for (i = 0; i < before.layers.length; i++) if (contains(p.controlledLayerIds, before.layers[i].layerId)) {
            if (!before.layers[i].controllable) fault('comp_render_targets');
            controlled.push(comp.layer(i + 1));
        }
        if (controlled.length !== p.controlledLayerIds.length || !contains(p.controlledLayerIds, p.activeLayerId)) fault('comp_render_targets');
        dependencyGraph(comp, p);
        return { comp: comp, controlled: controlled, file: output(p) };
    }
    function render(p, context, progress) {
        var comp = context.comp, queue = app.project.renderQueue, controlled = context.controlled;
        var item, flags = [], time = comp.time, i;
        try {
            item = queue.items.add(comp);
            var om = item.outputModule(1);
            if (!contains(item.templates, p.renderTemplate) || !contains(om.templates, p.outputTemplate)) fault('comp_render_template_unavailable');
            item.applyTemplate(p.renderTemplate);
            om.applyTemplate(p.outputTemplate);
            om = item.outputModule(1);
            if (om.getSettings(GetSettingsFormat.STRING).Format !== 'H.264') fault('comp_render_format');
            om.postRenderAction = PostRenderAction.NONE;
            om.file = context.file;
            if (om.file.fsName !== context.file.fsName || om.postRenderAction !== PostRenderAction.NONE) fault('comp_render_output_binding');
            item.timeSpanStart = p.startFrame * comp.frameDuration;
            item.timeSpanDuration = p.frameCount * comp.frameDuration;
            if (Math.abs(item.timeSpanStart - p.startFrame * comp.frameDuration) > 0.00001 ||
                Math.abs(item.timeSpanDuration - p.frameCount * comp.frameDuration) > 0.00001) fault('comp_render_frame_range');
            for (i = 0; i < controlled.length; i++) {
                flags.push(controlled[i].enabled);
                controlled[i].enabled = controlled[i].id === p.activeLayerId;
            }
            item.render = true;
            progress.dispatched = true;
            queue.render();
            var rendered = new File(context.file.fsName);
            if (item.status !== RQItemStatus.DONE || !rendered.exists || rendered.length < 1) fault('comp_render_terminal');
            return { file: String(rendered.fsName), bytes: rendered.length, status: 'DONE', renderTemplate: p.renderTemplate,
                outputTemplate: p.outputTemplate, format: 'H.264', startFrame: p.startFrame, frameCount: p.frameCount };
        } finally {
            for (i = 0; i < flags.length; i++) controlled[i].enabled = flags[i];
            if (comp.time !== time) comp.time = time;
            if (item) item.remove();
        }
    }
    function mutate(p) {
        var before, progress = { dispatched: false }, context;
        try {
            before = inspect(p);
            context = preflight(p, before);
            if (confirm('Рендер AE: слой ' + p.activeLayerId + ', compId ' + p.compId + '\n' + p.projectId +
                '\nКадры: ' + p.startFrame + ' + ' + p.frameCount + '\n' + p.renderTemplate + ' / ' + p.outputTemplate +
                '\n' + context.file.fsName + '\nВосстановить исходную видимость после рендера.', true, 'AE Agent Core4 — рендер AE') !== true) {
                return { outcome: 'rejected', code: 'local_cancelled' };
            }
            before = inspect(p);
            context = preflight(p, before);
            var completed = render(p, context, progress), after = inspect(p), proof = p._execution;
            if (!same(after, before)) fault('comp_render_restore');
            after.render = completed;
            return { outcome: 'applied', snapshot: after, transactionReceipt: { version: 2, policyId: POLICY,
                proposalId: proof.proposalId, planDigest: proof.planDigest, taskId: proof.taskId, taskEpoch: proof.taskEpoch,
                stepId: proof.stepId, checkpointRef: proof.checkpointRef, checkpointDigest: proof.checkpointDigest,
                baselineDigest: proof.baselineDigest, baselineRevision: proof.baselineRevision, target: after.target,
                resultRevision: after.revision, protectedFields: after['protected'] } };
        } catch (e) {
            var restored = false;
            if (before && !progress.dispatched) {
                try { restored = same(inspect(p), before); } catch (ignored) {}
            }
            return { outcome: progress.dispatched || before && !restored ? 'unknown' : 'rejected', code: e.coreCode || 'comp_render_ae_error' };
        }
    }
    return { inspect: inspect, mutate: mutate, verify: inspect };
}())
