(function () {
    var policy = 'current-matching-target-after-local-confirmation-v1';
    var maxProjectLayers = 2048, maxProperties = 100000, maxRevision = 9007199254740991;
    var maxCopyLayers = 3200, maxCopyProperties = 900000;
    var ownerTag = /^\[AECore4 overlay v1:(\d+):(\d+)\]$/;
    var transformNames = ['ADBE Anchor Point', 'ADBE Position', 'ADBE Scale', 'ADBE Rotate Z', 'ADBE Opacity'];
    var supportedEffects = ['ADBE Gaussian Blur 2', 'ADBE Fill'];
    var extraRoots = ['ADBE Marker', 'ADBE Time Remapping', 'ADBE Audio Group', 'ADBE Layer Overrides',
        'ADBE Layer Styles', 'ADBE Blend Options Group', 'ADBE Material Options Group', 'ADBE Plane Options Group',
        'ADBE Extrsn Options Group'];
    function fault(code) { var e = new Error(code); e.coreCode = code; throw e; }
    function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
    function number(value) {
        if (typeof value !== 'number' || !isFinite(value)) fault('layer_overlay_unobserved');
        return value;
    }
    function bool(value) {
        if (typeof value !== 'boolean') fault('layer_overlay_unobserved');
        return value;
    }
    function text(value) {
        if (typeof value !== 'string' || value.length > 512) fault('inspection_result_budget');
        return value;
    }
    function listed(names, key) {
        for (var i = 0; i < names.length; i++) if (names[i] === key) return true;
        return false;
    }
    function overlayMark(comment) {
        var lines = text(comment).split(/\r\n|[\r\n]/), found = null;
        for (var i = 0; i < lines.length; i++) {
            var mark = ownerTag.exec(lines[i]);
            if (!mark) continue;
            if (found) fault('layer_overlay_ownership_ambiguous');
            found = mark;
        }
        return found;
    }
    function isArray(value) { return Object.prototype.toString.call(value) === '[object Array]'; }
    function vector(value) {
        if (!isArray(value) || value.length > 128) fault('layer_overlay_property_value');
        var values = [];
        for (var i = 0; i < value.length; i++) values.push(isArray(value[i]) ? vector(value[i]) : number(value[i]));
        return values;
    }
    function plainValue(property, value, transform) {
        if (property.propertyValueType === PropertyValueType.SHAPE) {
            var feathers = ['featherSegLocs', 'featherRelSegLocs', 'featherRadii', 'featherInterps',
                'featherTensions', 'featherTypes', 'featherRelCornerAngles'];
            for (var i = 0; i < feathers.length; i++) {
                var feather = value[feathers[i]];
                if (feather !== null && (!isArray(feather) || feather.length)) fault('layer_overlay_variable_feather');
            }
            return [bool(value.closed), vector(value.vertices), vector(value.inTangents), vector(value.outTangents)];
        }
        if (property.propertyValueType === PropertyValueType.OneD) return number(value);
        var type = property.propertyValueType;
        // AE exposes three components for some transforms on a 2D layer.
        if (type === PropertyValueType.TwoD || type === PropertyValueType.TwoD_SPATIAL || type === PropertyValueType.COLOR ||
            transform && (type === PropertyValueType.ThreeD || type === PropertyValueType.ThreeD_SPATIAL)) return vector(value);
        fault('layer_overlay_property_value');
    }
    function ease(entries) {
        if (!isArray(entries) || entries.length > 3) fault('layer_overlay_key_ease');
        var result = [];
        for (var i = 0; i < entries.length; i++) result.push([number(entries[i].speed), number(entries[i].influence)]);
        return result;
    }
    function propertyState(property, transform, maskAtom) {
        if (!property || property.propertyType !== PropertyType.PROPERTY || property.expressionEnabled === true ||
            property.canSetExpression && (typeof property.expressionEnabled !== 'boolean' || property.expression) ||
            property.isSeparationLeader && property.dimensionsSeparated || property.isSeparationFollower) fault('layer_overlay_property');
        var count = number(property.numKeys);
        if (maskAtom && property.matchName === 'ADBE Mask Feather') {
            if (count !== 0) fault('layer_overlay_key_profile');
            var type = property.propertyValueType;
            // Normalize native enum wrappers only for this static mask property.
            if (type === null || typeof type !== 'number' && typeof type !== 'object' ||
                Number(type) !== Number(PropertyValueType.TwoD)) fault('layer_overlay_property_value');
            var feather = property.value;
            if (!isArray(feather) || feather.length !== 2) fault('layer_overlay_property_value');
            return [property.matchName, [number(feather[0]), number(feather[1])]];
        }
        if (!count) return [property.matchName, plainValue(property, property.value, transform)];
        if (!transform || count > 24) fault('layer_overlay_key_profile');
        var spatial = property.propertyValueType === PropertyValueType.TwoD_SPATIAL || property.propertyValueType === PropertyValueType.ThreeD_SPATIAL, keys = [];
        for (var i = 1; i <= count; i++) {
            var key = [number(property.keyTime(i)), plainValue(property, property.keyValue(i), transform),
                number(Number(property.keyInInterpolationType(i))), number(Number(property.keyOutInterpolationType(i))),
                ease(property.keyInTemporalEase(i)), ease(property.keyOutTemporalEase(i)),
                bool(property.keyTemporalContinuous(i)), bool(property.keyTemporalAutoBezier(i))];
            if (spatial) key.push(vector(property.keyInSpatialTangent(i)), vector(property.keyOutSpatialTangent(i)),
                bool(property.keySpatialContinuous(i)), bool(property.keySpatialAutoBezier(i)), bool(property.keyRoving(i)));
            keys.push(key);
        }
        return [property.matchName, keys];
    }
    function groups(layer, matchName, masks) {
        var group = layer.property(matchName), output = [];
        if (!group || number(group.numProperties) > 8) fault('layer_overlay_group');
        for (var i = 1; i <= group.numProperties; i++) {
            var member = group.property(i), children = [], count = number(member.numProperties);
            if (count > 20 || (masks ? member.matchName !== 'ADBE Mask Atom' : !listed(supportedEffects, member.matchName))) fault('layer_overlay_group_profile');
            for (var j = 1; j <= count; j++) children.push(propertyState(member.property(j), false, masks));
            output.push([member.matchName, text(member.name), bool(member.enabled), masks ?
                [number(Number(member.maskMode)), bool(member.inverted), bool(member.rotoBezier),
                    number(Number(member.maskMotionBlur)), number(Number(member.maskFeatherFalloff)), bool(member.locked)] : [], children]);
        }
        return output;
    }
    function layerSummary(layer) {
        var av = layer instanceof AVLayer, matte = av ? layer.trackMatteLayer : null;
        if (av && (bool(layer.hasTrackMatte) !== !!matte || matte && typeof layer.setTrackMatte !== 'function')) fault('layer_overlay_matte_unobserved');
        return { id: number(layer.id), sourceId: av && layer.source ? number(layer.source.id) : 0,
            stamp: JSON.stringify([text(layer.name), text(layer.comment), bool(layer.enabled), bool(layer.solo),
                bool(layer.locked), bool(layer.shy), number(layer.label), number(layer.startTime), number(layer.inPoint),
                number(layer.outPoint), number(layer.stretch), layer.parent ? number(layer.parent.id) : 0,
                matte ? number(matte.id) : 0, av ? number(Number(layer.trackMatteType)) : 0,
                av ? bool(layer.isTrackMatte) : false]) };
    }
    function signature(layer, summary) {
        if (!(layer instanceof AVLayer) || layer.matchName !== 'ADBE AV Layer' || layer.locked !== false ||
            layer.threeDLayer !== false || layer.nullLayer !== false || layer.adjustmentLayer !== false ||
            layer.timeRemapEnabled !== false || layer.isTrackMatte !== false || layer.hasAudio !== false ||
            layer.solo !== false || layer.collapseTransformation !== false ||
            layer.trackMatteLayer && layer.trackMatteLayer.enabled !== false) fault('layer_overlay_layer_profile');
        var styles = layer.property('ADBE Layer Styles'), marker = layer.property('ADBE Marker');
        if (styles && number(styles.numProperties) || marker && number(marker.numKeys)) fault('layer_overlay_layer_profile');
        var transforms = layer.property('ADBE Transform Group'), values = [];
        if (!transforms) fault('layer_overlay_property');
        for (var i = 0; i < transformNames.length; i++) values.push(propertyState(transforms.property(transformNames[i]), true));
        return JSON.stringify([JSON.parse(summary.stamp).slice(2), bool(layer.motionBlur), bool(layer.guideLayer),
            bool(layer.effectsActive), bool(layer.frameBlending), bool(layer.preserveTransparency),
            number(Number(layer.blendingMode)), number(Number(layer.quality)), number(Number(layer.samplingQuality)),
            number(Number(layer.autoOrient)), values, groups(layer, 'ADBE Mask Parade', true), groups(layer, 'ADBE Effect Parade', false)]);
    }
    // The same project-wide scan as layer-insert guards references across unrelated
    // compositions. Only a literal number or pre-expression value is admitted.
    function scan(group, budget, depth, location) {
        if (!group || ++budget.properties > maxProperties || depth > 32) fault('inspection_result_budget');
        if (group.propertyType === PropertyType.PROPERTY) {
            if (group.canSetExpression && typeof group.expressionEnabled !== 'boolean') fault('layer_overlay_dependency_unobserved');
            if (group.expressionEnabled === true) {
                var expression = group.expression, readable = typeof expression === 'string';
                if (!readable || !/^\s*(?:value|[+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*;?\s*$/.test(expression)) {
                    if (location) {
                        location.cause = readable ? 'unsupported_expression' : 'expression_unavailable';
                        location.expressionUnits = readable ? Math.min(expression.length, 2147483647) : 0;
                    }
                    fault('layer_overlay_expression_scope');
                }
            }
            if (group.propertyValueType === PropertyValueType.LAYER_INDEX &&
                (group.numKeys !== 0 || group.value !== 0)) fault('layer_overlay_index_reference');
            if (group.propertyValueType === PropertyValueType.CUSTOM_VALUE) fault('layer_overlay_dependency_unobserved');
            return;
        }
        if (typeof group.numProperties !== 'number') fault('layer_overlay_dependency_unobserved');
        for (var i = 1; i <= group.numProperties; i++) {
            if (location) location.propertyIndices.push(i);
            scan(group.property(i), budget, depth + 1, location);
            if (location) location.propertyIndices.pop();
        }
    }
    function scanLayer(layer, budget, location) {
        var root = ['ADBE Transform Group'], kind = layer.matchName;
        if (kind === 'ADBE Text Layer') root.push('ADBE Text Properties');
        else if (kind === 'ADBE Vector Layer') root.push('ADBE Root Vectors Group');
        else if (kind === 'ADBE Camera Layer') root.push('ADBE Camera Options Group');
        else if (kind === 'ADBE Light Layer') root.push('ADBE Light Options Group');
        else if (kind !== 'ADBE AV Layer') fault('layer_overlay_dependency_unobserved');
        if (location) location.root = 'layer';
        scan(layer, budget, 0, location);
        for (var i = 0; i < root.length; i++) {
            if (location) location.root = root[i];
            scan(layer.property(root[i]), budget, 1, location);
        }
        for (var j = 0; j < extraRoots.length; j++) {
            var property = layer.property(extraRoots[j]);
            if (property) {
                if (location) location.root = extraRoots[j];
                scan(property, budget, 1, location);
            }
        }
    }
    // This deliberately small expression vocabulary has no computed members,
    // dynamic comp/layer receivers, aliases to a comp, or executable source.
    var expressionNames = ('if else var value time inPoint outPoint numKeys textIndex ' +
        'marker key valueAtTime posterizeTime wiggle effect Math degreesToRadians transform index').split(' ');
    var expressionLocals = (
        'cut inDuration outDuration inKeyframes outKeyframes inStretch outStretch inAnimation outAnimation ' +
        'm aIn mOut aOut mid p a r h v x y txt delay freq amp decay Speed myDelay t s').split(' ');
    var expressionMembers = ('marker key time width height frameDuration effect compositingOption effectOpacity ' +
        'valueAtTime max cos sin exp PI transform position text sourceText getStyleAt setText anchorPoint scale rotation').split(' ');
    function expressionTokens(source) {
        if (typeof source !== 'string' || !source.length || source.length > 4096) return null;
        var parts = /(?:\s+|\/\/[^\r\n\u2028\u2029]*|\/\*[\s\S]*?\*\/|"[^"\\\r\n\u2028\u2029]*"|'[^'\\\r\n\u2028\u2029]*'|[A-Za-z_][A-Za-z_0-9]*|(?:\d+(?:\.\d+)?|\.\d+)|===|!==|==|!=|>=|<=|[+*\/%=<>.,;:{}()[\]?\-])/g;
        var out = [], at = 0, token;
        while ((token = parts.exec(source)) !== null) {
            if (token.index !== at || out.length > 512) return null;
            at = parts.lastIndex;
            if (!/^\s|^\/\/|^\/\*/.test(token[0])) out.push(token[0]);
        }
        return at === source.length && out.length ? out : null;
    }
    function staticString(token) { return typeof token === 'string' && /^['"]/.test(token); }
    function layerLookup(tokens, offset) {
        return tokens[offset] === 'layer' && tokens[offset + 1] === '(' &&
            (staticString(tokens[offset + 2]) || /^\d+$/.test(tokens[offset + 2] || '')) &&
            tokens[offset + 3] === ')';
    }
    function expressionAllowed(source, local, compName) {
        var tokens = expressionTokens(source);
        if (!tokens) return false;
        for (var i = 0; i < tokens.length; i++) {
            var token = tokens[i], next = tokens[i + 1], prev = tokens[i - 1] || '';
            if (token === 'comp') {
                if (prev === '.' || next !== '(' || !staticString(tokens[i + 2]) || tokens[i + 3] !== ')' ||
                    tokens[i + 4] !== '.' || !layerLookup(tokens, i + 5) ||
                    tokens[i + 2].slice(1, -1).toLowerCase() === compName.toLowerCase()) return false;
                i += 8;
            } else if (token === 'thisComp') {
                if (prev === '.' || next !== '.') return false;
                if (tokens[i + 2] === 'layer') {
                    if (local || !layerLookup(tokens, i + 2)) return false;
                    i += 5;
                } else if (!listed(['marker', 'width', 'height', 'frameDuration'], tokens[i + 2])) return false;
            } else if (token === '.') {
                if (!listed(expressionMembers, next) || tokens[i + 2] === '=') return false;
                i++;
            } else if (token === '[') {
                if (i && !listed(['(', '{', ';', '=', '+', '-', '*', '/', ',', ':', '?'], prev)) return false;
            } else if (/^[A-Za-z_]/.test(token)) {
                var localName = listed(expressionLocals, token);
                if (!localName && (next === '=' || !listed(expressionNames, token)) ||
                    local && (token === 'index' || token === 'wiggle')) return false;
            }
        }
        return true;
    }
    function wholeCopyScan(group, context, address, depth, parent, grandparent) {
        var budget = context.budget;
        if (!group || ++budget.properties > maxCopyProperties || depth > 32 ||
            budget.properties % 128 === 0 && new Date().getTime() > budget.deadline) fault('inspection_result_budget');
        if (group.propertyType === PropertyType.PROPERTY) {
            var enabled = bool(group.expressionEnabled), can = bool(group.canSetExpression), type = number(Number(group.propertyValueType));
            var expression = can || enabled ? group.expression : '';
            if (typeof expression !== 'string' || enabled && !expression.length || expression.length > 4096)
                fault('layer_overlay_dependency_unobserved');
            if (enabled) {
                var key = (context.local ? 'local:' : 'outside:') + expression;
                if (!budget.expressions[key]) {
                    if (++budget.expressionCount > 4096 || !expressionAllowed(expression, context.local, budget.compName))
                        fault('layer_overlay_expression_scope');
                    budget.expressions[key] = true;
                }
            }
            if (expression.length) {
                var error = group.expressionError;
                if (typeof error !== 'string' || error.length > 4096) fault('layer_overlay_dependency_unobserved');
                noteDependency(context, address, ['expression', group.matchName, enabled, can, expression, error]);
            }
            if (type === Number(PropertyValueType.CUSTOM_VALUE) || type === Number(PropertyValueType.LAYER_INDEX)) {
                var count = integer(group.numKeys, 0, 10000);
                if (type === Number(PropertyValueType.CUSTOM_VALUE)) {
                    // The only opaque effect admitted in a changed stack is a
                    // static native Curves table. It has no layer-valued input.
                    if (context.local && (grandparent !== 'ADBE Effect Parade' || parent !== 'ADBE CurvesCustom' ||
                        group.matchName !== 'ADBE CurvesCustom-0001' || count !== 0 || expression.length))
                        fault('layer_overlay_dependency_unobserved');
                    noteDependency(context, address, ['custom', group.matchName, parent, grandparent, count]);
                } else {
                    if (context.local && (count !== 0 || expression.length)) fault('layer_overlay_index_reference');
                    var keys = [];
                    for (var i = 1; i <= count; i++) {
                        if (i % 128 === 0 && new Date().getTime() > budget.deadline) fault('inspection_result_budget');
                        keys.push([number(group.keyTime(i)), indexIdentity(context, group.keyValue(i))]);
                    }
                    var index = count || enabled ? group.valueAtTime(0, true) : group.value;
                    var resolved = indexIdentity(context, index);
                    if (context.local && index > 0) {
                        if (context.layerId === context.retiredId || context.layerId === context.originalId ||
                            resolved[0] === context.retiredId || resolved[0] === context.insertedId)
                            fault('layer_overlay_index_reference');
                        context.indices.push([context.layerId, address, group.matchName, parent, grandparent, resolved]);
                    }
                    noteDependency(context, address, ['index', group.matchName, parent, grandparent, enabled, resolved, keys]);
                }
            }
            return;
        }
        var size = integer(group.numProperties, 0, 100000);
        for (var j = 1; j <= size; j++)
            wholeCopyScan(group.property(j), context, address.concat(j), depth + 1, group.matchName, parent);
    }
    function noteDependency(context, address, value) {
        if (!context.rows) return;
        var row = JSON.stringify([context.comp.id, context.layerId, address, value]);
        context.budget.units += row.length;
        if (context.budget.units > 2621440) fault('inspection_result_budget');
        context.rows.push(row);
    }
    function indexIdentity(context, value) {
        var index = integer(value, -2147483648, 2147483647);
        var resolved = index >= 1 && index <= context.comp.numLayers ? integer(context.comp.layer(index).id, 1, 2147483647) : 0;
        if (context.local && index !== 0 && !resolved) fault('layer_overlay_index_reference');
        return [resolved, resolved ? 0 : index];
    }
    function integer(value, min, max) {
        if (number(value) % 1 !== 0 || value < min || value > max) fault('layer_overlay_dependency_unobserved');
        return value;
    }
    function wholeCopyLayer(layer, context) {
        var roots = ['ADBE Transform Group'], kind = layer.matchName, seen = {};
        if (kind === 'ADBE Text Layer') roots.push('ADBE Text Properties');
        else if (kind === 'ADBE Vector Layer') roots.push('ADBE Root Vectors Group');
        else if (kind === 'ADBE Camera Layer') roots.push('ADBE Camera Options Group');
        else if (kind === 'ADBE Light Layer') roots.push('ADBE Light Options Group');
        else if (kind !== 'ADBE AV Layer') fault('layer_overlay_dependency_unobserved');
        var count = integer(layer.numProperties, 0, 100000);
        if (++context.budget.properties > maxCopyProperties) fault('inspection_result_budget');
        for (var i = 1; i <= count; i++) {
            var child = layer.property(i);
            if (!child) fault('layer_overlay_dependency_unobserved');
            seen['$' + text(child.matchName)] = true;
            wholeCopyScan(child, context, ['layer', i], 1, kind, '');
        }
        var optional = roots.length;
        roots = roots.concat(extraRoots);
        for (var j = 0; j < roots.length; j++) {
            if (seen['$' + roots[j]]) continue;
            var root = layer.property(roots[j]);
            if (root) wholeCopyScan(root, context, [roots[j]], 1, kind, '');
            else if (j < optional) fault('layer_overlay_dependency_unobserved');
        }
    }
    function sourceInfo(item) {
        if (!(item instanceof FootageItem) || item.useProxy !== false || item.footageMissing !== false ||
            item.hasVideo !== true || item.hasAudio !== false || !item.mainSource || item.mainSource.isStill !== true ||
            !item.file || !item.file.exists || item.file.alias || !item.file.modified) fault('layer_overlay_still_profile');
        var source = item.mainSource, alpha = bool(source.hasAlpha), mode = alpha ? number(Number(source.alphaMode)) : 0;
        var interpretation = alpha ? [mode, bool(source.invertAlpha),
            source.alphaMode === AlphaMode.PREMULTIPLIED ? vector(source.premulColor) : []] : [];
        var bytes = number(item.file.length);
        if (bytes < 1 || bytes > 1073741824) fault('layer_overlay_still_profile');
        return { file: text(String(item.file.fsName)), bytes: bytes, modifiedMs: number(item.file.modified.getTime()),
            width: number(item.width), height: number(item.height), pixelAspect: number(item.pixelAspect),
            alpha: JSON.stringify([alpha, interpretation]) };
    }
    function copyTopology(layer, position, enabled) {
        var av = layer instanceof AVLayer, matte = av ? layer.trackMatteLayer : null;
        if (layer.index !== position) fault('layer_overlay_dependency_unobserved');
        return JSON.stringify([integer(layer.id, 1, 2147483647), text(layer.name), text(layer.matchName), enabled,
            av && layer.source ? integer(layer.source.id, 1, 2147483647) : 0,
            layer.parent ? integer(layer.parent.id, 1, 2147483647) : 0,
            matte ? integer(matte.id, 1, 2147483647) : 0,
            av ? number(Number(layer.trackMatteType)) : 0]);
    }
    function sameCensus(before, after) {
        for (var i = 0; i < before.length; i++) {
            if (before[i].length !== after[i].length) return false;
            for (var j = 0; j < before[i].length; j++) if (before[i][j] !== after[i][j]) return false;
        }
        return true;
    }
    function replacementSlot(p, stack, layers, originalIndex, inherited, overlay) {
        var replace = p.replacement, complete = overlay.state === 'applied';
        var position = originalIndex - (complete ? 2 : 1), row = stack[position], retired = layers[position];
        if (!row || row.id !== replace.retiredLayerId || row.sourceId !== p.itemId ||
            retired.enabled !== !complete || retired.locked !== false || overlayMark(retired.comment))
            fault('layer_overlay_existing_or_partial');
        var retiredSignature = JSON.parse(signature(retired, row));
        retiredSignature[0][0] = true;
        if (!same(retiredSignature, JSON.parse(inherited))) fault('layer_overlay_existing_or_partial');
        for (var i = 0; i < stack.length; i++) {
            if (layers[i].name === replace.name && stack[i].id !== overlay.id) fault('layer_overlay_existing_or_partial');
        }
        var sibling = null;
        if (replace.sharedOriginalLayerId !== undefined) {
            for (var j = 0; j < stack.length; j++) {
                if (stack[j].id !== replace.sharedOriginalLayerId) continue;
                if (stack[j].sourceId !== p.originalSourceId || overlayMark(layers[j].comment))
                    fault('layer_overlay_existing_or_partial');
                sibling = [stack[j], signature(layers[j], stack[j])];
            }
            if (!sibling || sibling[1] === inherited) fault('layer_overlay_existing_or_partial');
        }
        return { retired: retired, sibling: sibling };
    }
    function captures(p, location, comparison) {
        var project = app.project;
        if (!project || !project.file || !project.file.exists || String(project.file.fsName) !== p.projectId) fault('layer_overlay_project_changed');
        var projectRevision = number(project.revision);
        if (projectRevision < 0 || projectRevision > maxRevision || projectRevision % 1 !== 0) fault('layer_overlay_project_changed');
        if (location) location.projectRevision = projectRevision;
        if (project.numItems > 2048) fault('inspection_result_budget');
        var prospective = p.itemId === undefined;
        var comp = project.itemByID(p.compId), source = project.itemByID(prospective ? p.originalSourceId : p.itemId);
        if (!(comp instanceof CompItem) || comp.numLayers > 64 || p.originalSourceId === p.itemId) fault('layer_overlay_target');
        var replace = p.replacement, itemCount = project.numItems, census = comparison ? [[], [], []] : null;
        if (replace && (prospective || project.file.alias !== false || itemCount !== replace.itemCount))
            fault('layer_overlay_copy_binding');
        var stack = [], layers = [], original = null, originalIndex = -1, originalProperties = 0;
        var incoming = {}, count = 0, budget = { properties: 0 };
        var indices = [], insertedId = 0, seenItems = {}, seenLayers = {};
        if (replace) {
            budget.deadline = new Date().getTime() + 40000;
            budget.compName = text(comp.name);
            budget.expressions = {};
            budget.expressionCount = 0;
            budget.units = 0;
            for (var n = 1; n <= comp.numLayers; n++) {
                var possible = comp.layer(n), tag = overlayMark(possible.comment);
                if (tag && Number(tag[1]) === p.layerId) {
                    if (insertedId) fault('layer_overlay_ownership_ambiguous');
                    insertedId = integer(possible.id, 1, 2147483647);
                }
            }
            if (comparison && insertedId !== comparison.copyId) fault('layer_overlay_existing_or_partial');
        }
        for (var i = 1; i <= itemCount; i++) {
            var item = project.item(i);
            if (replace) {
                if (!item || new Date().getTime() > budget.deadline) fault('inspection_result_budget');
                var itemIdentity = integer(item.id, 1, 2147483647);
                if (seenItems[itemIdentity]) fault('layer_overlay_dependency_unobserved');
                seenItems[itemIdentity] = true;
                if (census) census[0].push(JSON.stringify([itemIdentity, text(item.name), item instanceof CompItem]));
            }
            if (!(item instanceof CompItem)) continue;
            var numLayers = replace ? integer(item.numLayers, 0, maxCopyLayers) : item.numLayers;
            count += numLayers;
            if (count > (replace ? maxCopyLayers : maxProjectLayers)) fault('inspection_result_budget');
            if (census) census[1].push('comp:' + item.id);
            for (var j = 1; j <= numLayers; j++) {
                var layer = item.layer(j);
                var beforeScan = budget.properties;
                if (location) { location.comp = item; location.layer = layer; }
                if (replace) {
                    if (!layer) fault('layer_overlay_dependency_unobserved');
                    var identity = integer(layer.id, 1, 2147483647);
                    if (seenLayers[identity] || layer.index !== j) fault('layer_overlay_dependency_unobserved');
                    seenLayers[identity] = true;
                    var local = item.id === comp.id, fresh = comparison && identity === comparison.copyId;
                    if (local && (layer.parent && layer.parent.id === replace.retiredLayerId ||
                        layer instanceof AVLayer && layer.trackMatteLayer && layer.trackMatteLayer.id === replace.retiredLayerId))
                        fault('layer_overlay_dependency_unobserved');
                    if (census && !fresh) census[1].push(copyTopology(layer, j,
                        local && comparison.copyId && identity === replace.retiredLayerId ? true : bool(layer.enabled)));
                    wholeCopyLayer(layer, { budget: budget, comp: item, layerId: identity, local: local,
                        retiredId: replace.retiredLayerId, originalId: p.layerId, insertedId: insertedId,
                        rows: census && !fresh ? census[2] : null, indices: indices });
                } else scanLayer(layer, budget, location);
                if (item.id === comp.id) {
                    var summary = layerSummary(layer);
                    if (layer.id === p.layerId) {
                        original = layer; originalIndex = stack.length;
                        originalProperties = budget.properties - beforeScan;
                    }
                    stack.push(summary);
                    layers.push(layer);
                }
                if (layer instanceof AVLayer && layer.source instanceof CompItem) {
                    var parentSource = layer.source.id;
                    if (!incoming[parentSource]) incoming[parentSource] = [];
                    incoming[parentSource].push({ compId: item.id, layerId: layer.id, sourceId: parentSource });
                }
            }
        }
        if (!original || !original.source || original.source.id !== p.originalSourceId || overlayMark(original.comment)) fault('layer_overlay_original_changed');
        var oldMedia = sourceInfo(original.source), media = sourceInfo(source);
        if (oldMedia.width !== media.width || oldMedia.height !== media.height || oldMedia.pixelAspect !== media.pixelAspect) fault('layer_overlay_source_geometry');
        var inherited = signature(original, stack[originalIndex]), overlay = { id: 0, sourceId: 0, state: 'none', signature: '' };
        for (var n = 0; n < stack.length; n++) {
            if (n === originalIndex) continue;
            var mark = overlayMark(layers[n].comment), candidate = stack[n];
            if (mark && Number(mark[1]) === original.id) {
                if (overlay.state !== 'none') fault('layer_overlay_ownership_ambiguous');
                var overlaySignature = signature(layers[n], candidate);
                var applied = n === originalIndex - 1 && Number(mark[2]) === p.itemId && candidate.sourceId === p.itemId &&
                    overlaySignature === inherited && layers[n].name === (replace ? replace.name : original.name) &&
                    layers[n].comment === taggedComment(original, p.layerId, p.itemId);
                overlay = { id: candidate.id, sourceId: candidate.sourceId, state: applied ? 'applied' : 'partial', signature: overlaySignature };
            } else if (!mark && (!replace || candidate.id !== replace.retiredLayerId && candidate.id !== replace.sharedOriginalLayerId) &&
                (candidate.sourceId === p.originalSourceId || candidate.sourceId === p.itemId) &&
                (replace && candidate.sourceId === p.originalSourceId || n === originalIndex - 1 ||
                    signature(layers[n], candidate) === inherited)) {
                if (overlay.state !== 'none') fault('layer_overlay_ownership_ambiguous');
                overlay = { id: candidate.id, sourceId: candidate.sourceId, state: 'suspect', signature: '' };
            }
        }
        var replacement = null;
        if (replace) {
            if (original.enabled !== true || overlay.state === 'partial' || overlay.state === 'suspect' ||
                count !== replace.layerCount + (overlay.state === 'applied' ? 1 : 0))
                fault('layer_overlay_existing_or_partial');
            replacement = replacementSlot(p, stack, layers, originalIndex, inherited, overlay);
        }
        var uses = [], seen = {}, queue = [comp.id];
        seen[comp.id] = true;
        for (var q = 0; q < queue.length; q++) {
            var edges = incoming[queue[q]] || [];
            for (var k = 0; k < edges.length; k++) {
                var edge = edges[k];
                uses.push(edge);
                if (!seen[edge.compId]) { seen[edge.compId] = true; queue.push(edge.compId); }
            }
        }
        uses.sort(function (a, b) { return a.compId - b.compId || a.layerId - b.layerId; });
        var target = { sessionId: p.sessionId, projectId: p.projectId, compId: comp.id,
            layerId: original.id, originalSourceId: original.source.id };
        if (!prospective) target.itemId = source.id;
        var fields = [target, [text(comp.name), number(comp.width), number(comp.height), number(comp.pixelAspect),
            number(comp.duration), number(comp.frameDuration), number(comp.displayStartTime)], stack[originalIndex], inherited, oldMedia, media, uses];
        if (replace) {
            target.replacement = replace;
            fields.push([replacement.sibling, indices]);
        }
        var protectedFields = JSON.stringify(fields);
        if (project.revision !== projectRevision || project.numItems !== itemCount ||
            replace && new Date().getTime() > budget.deadline) fault('layer_overlay_project_changed');
        var result = resultSnapshot(target, protectedFields, stack, uses, media, inherited, overlay, projectRevision);
        return { comp: comp, original: original, source: source, snapshot: result, census: census,
            projectRevision: projectRevision, itemCount: itemCount, retired: replacement ? replacement.retired : null,
            layersAfter: count + 1, propertiesAfter: budget.properties + originalProperties };
    }
    function resultSnapshot(target, protectedFields, stack, uses, media, inherited, overlay, projectRevision) {
        var revision = JSON.stringify([projectRevision, protectedFields, stack, overlay]);
        var result = { target: target, revision: revision, 'protected': protectedFields, stack: stack,
            uses: uses, source: media, signature: inherited, overlay: overlay };
        // Bound escaped snapshot and repeated receipt / frame strings before dispatch.
        if (uses.length > 128 || protectedFields.length > 10000 || revision.length > 15000 ||
            JSON.stringify(result).length > 28000) fault('inspection_result_budget');
        return result;
    }
    function taggedComment(layer, layerId, itemId) {
        return layer.comment + '\n[AECore4 overlay v1:' + layerId + ':' + itemId + ']';
    }
    function expressionDiagnostic(p, location) {
        try {
            var compId = location.comp.id, layerId = location.layer.id, project = app.project;
            if (typeof compId !== 'number' || compId < 1 || compId > 2147483647 || compId % 1 !== 0 ||
                typeof layerId !== 'number' || layerId < 1 || layerId > 2147483647 || layerId % 1 !== 0 ||
                !project || !project.file || String(project.file.fsName) !== p.projectId ||
                project.revision !== location.projectRevision) return null;
            return { version: 1, projectRevision: location.projectRevision, compId: compId, layerId: layerId,
                root: location.root, propertyIndices: location.propertyIndices, cause: location.cause,
                expressionUnits: location.expressionUnits };
        } catch (_) { return null; }
    }
    function read(p, collectDiagnostic) {
        var location = collectDiagnostic && p.itemId === undefined ? { propertyIndices: [] } : null;
        try {
            var state = captures(p, location);
            if (p.itemId === undefined) checkOverlayCapacity(state, 2147483647);
            return state.snapshot;
        }
        catch (e) {
            var copyCode = p.replacement && p.itemId !== undefined &&
                listed(['layer_overlay_copy_binding', 'layer_overlay_dependency_unobserved', 'layer_overlay_index_reference',
                    'layer_overlay_project_changed', 'layer_overlay_expression_scope', 'layer_overlay_existing_or_partial'], e.coreCode);
            var result = { readFailureVersion: 1, outcome: 'rejected',
                code: copyCode || e.coreCode === 'inspection_result_budget' || p.itemId === undefined &&
                    listed(['layer_overlay_layer_profile', 'layer_overlay_expression_scope', 'layer_overlay_existing_or_partial'], e.coreCode)
                    ? e.coreCode : 'inspection_failed' };
            if (location && result.code === 'layer_overlay_expression_scope') {
                var diagnostic = expressionDiagnostic(p, location);
                if (diagnostic) result.diagnostic = diagnostic;
            }
            return result;
        }
    }
    function checkOverlayCapacity(state, itemId) {
        var before = state.snapshot;
        if (before.overlay.state !== 'none') fault('layer_overlay_existing_or_partial');
        var replace = before.target.replacement;
        var comment = taggedComment(state.original, before.target.layerId, itemId);
        if (state.comp.numLayers >= 64 || state.layersAfter > (replace ? maxCopyLayers : maxProjectLayers) ||
            state.propertiesAfter > (replace ? maxCopyProperties : maxProperties) || comment.length > 512) fault('inspection_result_budget');
        var stack = before.stack.slice(), position = state.original.index - 1, copyId = 2147483647;
        var stamp = JSON.parse(stack[position].stamp);
        stamp[1] = comment;
        if (replace) {
            stamp[0] = replace.name;
            var old = stack[position - 1], retiredStamp = JSON.parse(old.stamp);
            retiredStamp[2] = false;
            stack[position - 1] = { id: old.id, sourceId: old.sourceId, stamp: JSON.stringify(retiredStamp) };
        }
        stack.splice(position, 0, { id: copyId, sourceId: itemId, stamp: JSON.stringify(stamp) });
        var target = before.target, protectedFields = before['protected'], source = before.source;
        if (target.itemId === undefined) {
            var projected = JSON.parse(protectedFields);
            target = projected[0];
            target.itemId = itemId;
            // Project the largest escaped pathname and numeric/alpha fields
            // admitted by the replacement contract, including nested JSON.
            source = { file: new Array(513).join(String.fromCharCode(0x2028)),
                bytes: 1073741824, modifiedMs: maxRevision, width: source.width, height: source.height,
                pixelAspect: source.pixelAspect, alpha: new Array(513).join('0') };
            projected[5] = source;
            protectedFields = JSON.stringify(projected);
        }
        resultSnapshot(target, protectedFields, stack, before.uses, source, before.signature,
            { id: copyId, sourceId: itemId, state: 'applied', signature: before.signature }, maxRevision);
    }
    function baseline(p, state) {
        var before = state.snapshot, proof = p._execution;
        checkOverlayCapacity(state, p.itemId);
        if (before.revision !== p.expectedRevision || before.source.file !== p.file) fault('stale_target');
        if (!proof || proof.policyId !== policy || proof.baselineRevision !== before.revision ||
            proof.baselineProtected !== before['protected'] || !sameTarget(proof.target, before.target)) fault('manual_approval_binding');
    }
    function sameTarget(a, b) {
        return a && a.sessionId === b.sessionId && a.projectId === b.projectId && a.compId === b.compId &&
            a.layerId === b.layerId && a.originalSourceId === b.originalSourceId && a.itemId === b.itemId &&
            (!a.replacement && !b.replacement || a.replacement && b.replacement && same(a.replacement, b.replacement));
    }
    function assertCopyRevision(p, current) {
        var project = app.project, comp = project && project.itemByID(p.compId);
        if (!project || !project.file || !project.file.exists || project.file.alias !== false ||
            String(project.file.fsName) !== p.projectId || project.revision !== current.projectRevision ||
            project.numItems !== current.itemCount || !(comp instanceof CompItem) ||
            comp.numLayers !== current.snapshot.stack.length) fault('stale_target');
        var layers = [], originalIndex = current.original.index - 1;
        for (var i = 0; i < current.snapshot.stack.length; i++) {
            layers.push(comp.layer(i + 1));
            if (!same(layerSummary(layers[i]), current.snapshot.stack[i])) fault('stale_target');
        }
        var original = layers[originalIndex];
        var slot = replacementSlot(p, current.snapshot.stack, layers, originalIndex, current.snapshot.signature, current.snapshot.overlay);
        var sibling = JSON.parse(current.snapshot['protected'])[7][0];
        if (original.id !== p.layerId || !same(slot.sibling, sibling) ||
            signature(original, layerSummary(original)) !== current.snapshot.signature ||
            !same(sourceInfo(project.itemByID(p.itemId)), current.snapshot.source) ||
            project.revision !== current.projectRevision) fault('stale_target');
        current.comp = comp;
        current.original = original;
        current.retired = slot.retired;
        current.source = project.itemByID(p.itemId);
    }
    function mutate(p, confirmAction) {
        var started = false;
        try {
            if (p.itemId === undefined) fault('layer_overlay_preflight_only');
            var replace = p.replacement, current = captures(p, null, replace ? { copyId: 0 } : null);
            var before = current.snapshot, proof = p._execution;
            baseline(p, current);
            var uses = [];
            for (var i = 0; i < before.uses.length; i++) uses.push(before.uses[i].compId + '/' + before.uses[i].layerId);
            var message = 'Создать копию слоя над оригиналом и заменить источник копии?\nПроект: ' + p.projectId +
                '\nКомпозиция: #' + p.compId + ' / слой: #' + p.layerId + '\nИсточник: #' + p.originalSourceId +
                ' → #' + p.itemId + ' ' + p.file + '\nИспользования композиции: ' + (uses.length ? uses.join(', ') : 'нет');
            if (replace) message += '\nВключить новую накладку «' + replace.name + '» и выключить прежний слой #' +
                replace.retiredLayerId + ' «' + current.retired.name + '» в рабочей копии.\nЗащищённый оригинал AEP: ' +
                replace.referenceProject + (replace.sharedOriginalLayerId ? '\nСоседний исходный слой: #' + replace.sharedOriginalLayerId : '');
            if ((confirmAction || confirm)(message, true, 'AE Agent Core — фото поверх исходного слоя') !== true) fault('local_cancelled');
            if (!replace) {
                current = captures(p);
                baseline(p, current);
            }
            var origin = current.original, copy, copyId, position = origin.index;
            app.beginUndoGroup('AE Agent Core — фото поверх исходного слоя');
            try {
                if (confirmAction && confirmAction(message, true, 'AE Agent Core — фото поверх исходного слоя') !== true)
                    fault('operator_confirmation_expired');
                if (replace) {
                    assertCopyRevision(p, current);
                    origin = current.original;
                }
                started = true;
                copy = origin.duplicate();
                if (!copy || !copy.containingComp || copy.containingComp.id !== current.comp.id) fault('layer_overlay_duplicate_unobserved');
                copyId = number(copy.id);
                if (copyId < 1 || copyId % 1 !== 0) fault('layer_overlay_duplicate_unobserved');
                for (var n = 0; n < before.stack.length; n++) {
                    if (before.stack[n].id === copyId) fault('layer_overlay_duplicate_unobserved');
                }
                if (current.comp.numLayers !== before.stack.length + 1 || copy.index !== position || origin.index !== position + 1 ||
                    current.comp.layer(position).id !== copyId || current.comp.layer(position + 1).id !== p.layerId)
                    fault('layer_overlay_duplicate_position');
                var comment = taggedComment(origin, p.layerId, p.itemId);
                copy.comment = comment;
                if (copy.comment !== comment) fault('layer_overlay_marker_write');
                copy.replaceSource(current.source, false);
                var matte = origin.trackMatteLayer, copiedMatte = copy.trackMatteLayer;
                if (matte && (!copiedMatte || copiedMatte.id !== matte.id || copy.trackMatteType !== origin.trackMatteType))
                    copy.setTrackMatte(matte, origin.trackMatteType);
                copy.name = replace ? replace.name : origin.name;
                if (replace) {
                    if (copy.enabled !== true || current.retired.enabled !== true) fault('layer_overlay_readback');
                    current.retired.enabled = false;
                    if (current.retired.enabled !== false) fault('layer_overlay_readback');
                }
            } finally { app.endUndoGroup(); }
            var result = captures(p, null, replace ? { copyId: copyId } : null);
            var after = result.snapshot, previous = [];
            for (var j = 0; j < after.stack.length; j++) {
                var old = after.stack[j];
                if (old.id === copyId) continue;
                if (replace && old.id === replace.retiredLayerId) {
                    var stamp = JSON.parse(old.stamp);
                    if (stamp[2] !== false) fault('layer_overlay_readback');
                    stamp[2] = true;
                    old = { id: old.id, sourceId: old.sourceId, stamp: JSON.stringify(stamp) };
                }
                previous.push(old);
            }
            if (after.stack.length !== before.stack.length + 1 || after.overlay.id !== copyId || after.overlay.state !== 'applied' ||
                after['protected'] !== before['protected'] || !same(previous, before.stack) ||
                (replace ? !sameCensus(current.census, result.census) || result.projectRevision <= current.projectRevision :
                    after.revision !== captures(p).snapshot.revision)) fault('layer_overlay_readback');
            return { outcome: 'applied', snapshot: after, transactionReceipt: { version: 2, policyId: policy,
                proposalId: proof.proposalId, planDigest: proof.planDigest, taskId: proof.taskId, taskEpoch: proof.taskEpoch,
                stepId: proof.stepId, checkpointRef: proof.checkpointRef, checkpointDigest: proof.checkpointDigest,
                baselineDigest: proof.baselineDigest, baselineRevision: proof.baselineRevision, target: after.target,
                resultRevision: after.revision, protectedFields: after['protected'] } };
        } catch (e) { return { outcome: started ? 'unknown' : 'rejected', code: e.coreCode || 'layer_overlay_ae_error' }; }
    }
    return { inspect: function (p) { return read(p, true); }, mutate: mutate,
        verify: function (p) { return read(p, false); } };
}())
