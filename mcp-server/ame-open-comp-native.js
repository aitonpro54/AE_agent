"use strict";
// Fixed ES3 programs for one open comp. No project file IO or render queue API.
const SLOT = "__aeAgentAMEOpenCompV1";
const literal = value => JSON.stringify(value).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

function observe(a) {
  function bad(code) { throw Error(code); }
  var numericIdentity = [];
  function binaryIdentity(value,path) {
    function unavailable(stage) { bad('ame_open_numeric_identity_unavailable:{"path":' + diagnosticQuote(path,62) + ',"rawString":' + diagnosticQuote(String(value),34) + ',"stage":' + diagnosticQuote(stage,42) + '}'); }
    function token(integer) { var text = String(integer); if (!/^-?(0|[1-9][0-9]*)$/.test(text) || Number(text) !== integer) unavailable("integer_token"); return text; }
    var absolute = Math.abs(value), exponent = Math.floor(Math.log(absolute)/Math.LN2), unit, normalized, correction = 0, fraction, hi, lo, sign = value < 0 ? -1 : 1;
    if (typeof exponent !== "number" || !isFinite(exponent)) unavailable("exponent");
    if (exponent < -1074) exponent = -1074;
    if (exponent > 1023) exponent = 1023;
    unit = Math.pow(2,exponent);
    if (!isFinite(unit) || unit <= 0) unavailable("unit");
    normalized = absolute/unit;
    while (normalized < 1 || normalized >= 2) {
      if (++correction > 4) unavailable("correction_bound");
      if (normalized < 1) { exponent--; unit = unit/2; } else { exponent++; unit = unit*2; }
      if (exponent < -1074 || exponent > 1023 || !isFinite(unit) || unit <= 0) unavailable("correction_unit");
      normalized = absolute/unit;
    }
    if (!isFinite(normalized) || normalized < 1 || normalized >= 2) unavailable("normalized");
    fraction = (normalized-1)*4503599627370496;
    if (!isFinite(fraction) || fraction < 0 || fraction >= 4503599627370496 || Math.floor(fraction) !== fraction) unavailable("fraction_integer");
    hi = Math.floor(fraction/67108864); lo = fraction-hi*67108864;
    if (hi < 0 || hi >= 67108864 || lo < 0 || lo >= 67108864 || Math.floor(hi) !== hi || Math.floor(lo) !== lo) unavailable("chunk_integer");
    var signText = token(sign), exponentText = token(exponent), hiText = token(hi), loText = token(lo), encodedUnit = Math.pow(2,Number(exponentText));
    if (!isFinite(encodedUnit) || encodedUnit <= 0 || encodedUnit !== unit) unavailable("encoded_unit");
    if (Number(signText)*(1+(Number(hiText)*67108864+Number(loText))/4503599627370496)*encodedUnit !== value) unavailable("reconstruction");
    return "b1:" + signText + ":" + exponentText + ":" + hiText + ":" + loText;
  }
  function num(value,path) {
    if (typeof value !== "number" || !isFinite(value)) bad("ame_open_number_unavailable");
    if (value === 0 && 1/value === -Infinity) bad("ame_open_number_negative_zero");
    // Display transport and native decimal precision can lose digits. Retain
    // binary identity with exact native arithmetic reconstruction instead.
    var integer = Math.floor(value) === value, exact = null;
    if (!integer) {
      if (typeof path !== "string" || !path || path.length > 160 || numericIdentity.length >= 6000) bad("ame_open_numeric_identity_bound");
      exact = binaryIdentity(value,path);
      if (exact.length > 32) bad("ame_open_numeric_identity_bound");
    }
    // Use the SAME native conversion as the wire wrapper, never epsilon.
    var wire = String(value), canonical = Number(wire);
    if (!isFinite(canonical) || String(canonical) !== wire) bad("ame_open_number_transport_not_fixed");
    if (integer) { if (canonical !== value) bad("ame_open_integer_transport_changed"); return value; }
    numericIdentity.push({path:path,exact:exact}); return canonical;
  }
  function bool(value) { if (typeof value !== "boolean") bad("ame_open_boolean_unavailable"); return value; }
  function optional(value) { return value === undefined ? null : bool(value); }
  function norm(value) { return String(value || "").replace(/\\/g, "/").toLowerCase(); }
  if (!app.project || !app.project.file || typeof app.project.dirty !== "boolean" || app.project.renderQueue.rendering) bad("ame_open_project_unavailable_or_rendering");
  if (typeof BridgeTalk === "undefined" || String(BridgeTalk.appName).toLowerCase() !== "aftereffects") bad("ame_open_aftereffects_host_required");
  var target = null, i, j, graph = [], seen = {}, layerCount = 0, propertyCount = 0, expressionCount = 0, risks = [], propertySeen = {}, namedRootCount = 0;
  var compSeen = {}, layerSeen = {}, compCount = 0, expressionProofs = {}, expressionInventory = [], diagnosticSeen = {}, diagnosticBytes = 0, namedComps = {}, references = [], referenceSeen = {};
  var debugStage = "observe", debugComp = null, debugLayer = null, debugKey = "", debugMatch = "";
  function debug(stage,compId,layerId,key,match) {
    debugStage = stage;
    if (compId !== undefined) debugComp = compId;
    if (layerId !== undefined) debugLayer = layerId;
    if (key !== undefined) debugKey = key;
    if (match !== undefined) debugMatch = match;
  }
  function diagnosticQuote(value,limit) {
    // Bounded data-only JSON string encoder; native AE has no JSON polyfill.
    var result = '"', text = String(value || ""), k, c, fragment, hex;
    for (k = 0; k < text.length; k++) {
      c = text.charAt(k); fragment = c;
      if (c === '"' || c === "\\") fragment = "\\" + c;
      else if (c.charCodeAt(0) < 32 || c.charCodeAt(0) > 126) { hex = c.charCodeAt(0).toString(16); while (hex.length < 4) hex = "0" + hex; fragment = "\\u" + hex; }
      if (result.length + fragment.length + 1 > limit) break;
      result += fragment;
    }
    return result + '"';
  }
  function diagnosticNumber(value) { if (typeof value === "number" && isFinite(value) && value >= 0 && value <= 2147483647 && Math.floor(value) === value) return String(value); return "null"; }
  function inspectionError(error) {
    // nativeLine is captured BEFORE this new Error/rethrow. The wire wrapper's
    // outer line, if present, belongs to the diagnostic rethrow, not the cause.
    var originalLine = error && error.line, message = error && error.message;
    var detail = '{"stage":' + diagnosticQuote(debugStage,34) + ',"comp":' + diagnosticNumber(debugComp) + ',"layer":' + diagnosticNumber(debugLayer) + ',"key":' + diagnosticQuote(String(debugKey || "").slice(-40),42) + ',"match":' + diagnosticQuote(debugMatch,26) + ',"nativeLine":' + diagnosticNumber(originalLine) + ',"lineOrigin":"caught_error","message":' + diagnosticQuote(message || error,74) + '}';
    // Prefix + every encoded field + Error.toString prefix remain below 400.
    return Error("ame_open_expression_inspection_incomplete:" + detail);
  }
  for (i = 1; i <= app.project.numItems; i++) if (app.project.item(i).id === a.compItemId) {
    if (target) bad("ame_open_comp_ambiguous"); target = app.project.item(i);
  }
  if (!(target instanceof CompItem)) bad("ame_open_comp_missing");
  // A deliberately small provable subset. Arbitrary expressions (including
  // computed comp()/CSV/sourceText references) are uncertain and block rename.
  function nameIndependent(text) {
    if (!/^[\s\d.eE+*\/%(),;\[\]?:<>=!&|^~_a-zA-Z-]+$/.test(text)) return false;
    var words = text.match(/[A-Za-z_][A-Za-z_0-9]*/g) || [], allowed = {value:1,time:1,index:1,Math:1,PI:1,E:1,abs:1,acos:1,asin:1,atan:1,atan2:1,ceil:1,cos:1,exp:1,floor:1,log:1,max:1,min:1,pow:1,random:1,round:1,sin:1,sqrt:1,tan:1,wiggle:1,linear:1,ease:1,easeIn:1,easeOut:1,clamp:1,length:1,normalize:1,seedRandom:1,"true":1,"false":1};
    for (var n = 0; n < words.length; n++) if (!allowed[words[n]]) return false;
    // Dot access is admitted only for named Math members and numeric literals.
    return !/(?:\b(?:value|time|index|wiggle|linear|ease|easeIn|easeOut|clamp|length|normalize|seedRandom))\s*\./.test(text);
  }
  function expressionSyntax(text) {
    // Data-only lexer. Deliberately no evaluation, comments, computed access,
    // concatenation, arbitrary assignment, calls or executable string decoder.
    var tokens = [], pos = 0, c, quote, value, escape, digits, match, number, cursor = 0;
    debugStage = "expression_tokenize";
    while (pos < text.length) {
      c = text.charAt(pos);
      if (/\s/.test(c)) { pos++; continue; }
      if (tokens.length >= 128) return null;
      if (c === '"' || c === "'") {
        quote = c; value = ""; pos++;
        while (pos < text.length && text.charAt(pos) !== quote) {
          c = text.charAt(pos++);
          if (c === "\\") {
            if (pos >= text.length) return null; escape = text.charAt(pos++);
            if (escape === "u" || escape === "x") {
              digits = escape === "u" ? 4 : 2; match = text.substr(pos,digits);
              if (match.length !== digits || !/^[a-fA-F0-9]+$/.test(match)) return null;
              value += String.fromCharCode(parseInt(match,16)); pos += digits;
            } else if (escape === "\\" || escape === '"' || escape === "'") value += escape;
            else return null;
          } else { if (/[\x00-\x1f\u2028\u2029]/.test(c)) return null; value += c; }
          if (value.length > 1024) return null;
        }
        if (pos >= text.length || text.charAt(pos++) !== quote || /[\x00-\x1f\x7f]/.test(value)) return null;
        tokens.push({kind:"string",value:value}); continue;
      }
      match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(pos));
      if (match) { tokens.push({kind:"word",value:match[0]}); pos += match[0].length; continue; }
      match = /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/.exec(text.slice(pos));
      if (match) { number = Number(match[0]); if (!isFinite(number)) return null; tokens.push({kind:"number",value:number}); pos += match[0].length; continue; }
      if (/[.(),=;]/.test(c)) { tokens.push({kind:c,value:c}); pos++; continue; }
      return null;
    }
    function take(kind,value) {
      debugStage = "parse_take_array_" + typeof tokens;
      if (typeof tokens !== "object") bad("ame_open_parser_internal_state:tokens_type");
      if (tokens === null) bad("ame_open_parser_internal_state:tokens_null");
      if (Object.prototype.toString.call(tokens) !== "[object Array]") bad("ame_open_parser_internal_state:tokens_array");
      var count = tokens.length;
      debugStage = "parse_take_length_" + typeof count;
      if (typeof count !== "number") bad("ame_open_parser_internal_state:count_type");
      if (!isFinite(count)) bad("ame_open_parser_internal_state:count_finite");
      if (count < 0) bad("ame_open_parser_internal_state:count_negative");
      if (count > 128) bad("ame_open_parser_internal_state:count_bound");
      if (Math.floor(count) !== count) bad("ame_open_parser_internal_state:count_integer");
      debugStage = "parse_cursor_" + typeof cursor + "_n" + count;
      if (typeof cursor !== "number") bad("ame_open_parser_internal_state:cursor_type");
      if (!isFinite(cursor)) bad("ame_open_parser_internal_state:cursor_finite");
      if (cursor < 0) bad("ame_open_parser_internal_state:cursor_negative");
      if (Math.floor(cursor) !== cursor) bad("ame_open_parser_internal_state:cursor_integer");
      debugStage = "parse_take_c" + cursor + "_n" + count;
      if (cursor > count) bad("ame_open_parser_internal_state:cursor_bound");
      if (cursor === count) return null;
      var token = tokens[cursor], tokenType = typeof token;
      debugStage = "take_c" + cursor + "_n" + count + "_t" + tokenType;
      if (tokenType !== "object") return null;
      if (token === null) return null;
      var tokenKind = token.kind;
      if (typeof tokenKind !== "string") return null;
      if (tokenKind !== kind) return null;
      if (typeof value !== "undefined") {
        var tokenValue = token.value;
        if (tokenValue !== value) return null;
      }
      cursor = cursor + 1;
      return token;
    }
    function finish() { take(";"); return cursor === tokens.length; }
    function stringCall() {
      if (take("(") === null) return null;
      var token = take("string");
      if (typeof token !== "object") return null;
      if (token === null) return null;
      var stringValue = token.value;
      if (typeof stringValue !== "string") return null;
      if (stringValue.length === 0) return null;
      if (take(")") === null) return null;
      return stringValue;
    }
    if (take("word","loopOutDuration") !== null) {
      if (take("(") === null) return null;
      if (take(")") !== null) { if (!finish()) return null; return {kind:"literal_loop_out_duration",mode:"cycle",duration:0}; }
      if (take("word","type") !== null) { if (take("=") === null) return null; }
      var mode = take("string"), duration = 0, hasDuration = false;
      if (typeof mode !== "object") return null;
      if (mode === null) return null;
      var modeValue = mode.value;
      if (typeof modeValue !== "string") return null;
      if (!/^(cycle|pingpong|offset|continue)$/.test(modeValue)) return null;
      if (take(",") !== null) {
        if (take("word","duration") !== null) { if (take("=") === null) return null; }
        var seconds = take("number");
        if (typeof seconds !== "object") return null;
        if (seconds === null) return null;
        var secondsValue = seconds.value;
        if (typeof secondsValue !== "number") return null;
        if (secondsValue < 0) return null;
        duration = secondsValue; hasDuration = true;
      }
      if (take(")") === null) return null;
      if (!finish()) return null;
      if (modeValue === "continue") { if (hasDuration) return null; }
      return {kind:"literal_loop_out_duration",mode:modeValue,duration:duration};
    }
    cursor = 0;
    if (take("word","comp") === null) return null;
    var compName = stringCall(); if (compName === null) return null;
    if (take(".") === null) return null;
    if (take("word","layer") === null) return null;
    var layerName = stringCall(); if (layerName === null) return null;
    if (take(".") === null) return null;
    if (take("word","effect") === null) return null;
    var effectName = stringCall(); if (effectName === null) return null;
    var propertyName = stringCall(); if (propertyName === null) return null;
    if (!finish()) return null;
    return {kind:"literal_comp_effect_chain",compName:compName,layerName:layerName,effectName:effectName,propertyName:propertyName};
  }
  function recordComp(comp) {
    var key = String(num(comp.id));
    if (!Object.prototype.hasOwnProperty.call(compSeen,key)) { if (++compCount > 100) bad("ame_open_comp_graph_bound"); compSeen[key] = true; }
  }
  function recordLayer(compId,layer,index) {
    var key = compId + "/" + num(layer.id);
    if (Object.prototype.hasOwnProperty.call(layerSeen,key)) { if (layerSeen[key] !== index) bad("ame_open_expression_layer_identity_changed"); return; }
    if (++layerCount > 1000) bad("ame_open_layer_bound"); layerSeen[key] = index;
  }
  function groupCount(group) {
    var count = group.numProperties;
    if (typeof count !== "number" || !isFinite(count) || count < 0 || Math.floor(count) !== count || count > 20000 || typeof group.property !== "function") bad("ame_open_expression_group_count_unavailable");
    return count;
  }
  function propertyIdentity(p,parentPath) {
    if (!p || typeof PropertyType === "undefined") bad("ame_open_expression_property_unavailable");
    var index = p.propertyIndex, match = p.matchName, key = parentPath + "/" + index;
    debugKey = key; debugMatch = match;
    if (typeof index !== "number" || !isFinite(index) || index < 1 || Math.floor(index) !== index || typeof match !== "string" || !match || match.length > 1024) bad("ame_open_expression_property_identity_unavailable");
    if (Object.prototype.hasOwnProperty.call(propertySeen,key)) {
      if (propertySeen[key].match !== match) bad("ame_open_expression_property_identity_changed"); return key;
    }
    if (++propertyCount > 20000) bad("ame_open_expression_property_bound");
    propertySeen[key] = {match:match,scanned:false}; return key;
  }
  function diagnostic(text,proof,compId,layerId,key,match) {
    debug("diagnostic_record",compId,layerId,key,match);
    var refs = proof.reference ? proof.reference.key + ":" + proof.reference.compName + ":" + proof.reference.layerName + ":" + proof.reference.effectName + ":" + proof.reference.propertyName : "";
    var dedup = "expression:" + text + "\nkind:" + proof.kind + "\nreason:" + (proof.reason || "") + "\nreference:" + refs, row;
    if (Object.prototype.hasOwnProperty.call(diagnosticSeen,dedup)) row = expressionInventory[diagnosticSeen[dedup]];
    else {
      if (expressionInventory.length >= 256 || diagnosticBytes + text.length > 262144) bad("ame_open_expression_diagnostics_bound");
      diagnosticBytes += text.length;
      row = {inventoryIndex:expressionInventory.length,kind:proof.kind,proven:proof.proven,reason:proof.reason || null,text:text,textTruncated:false,excerpt:text.slice(0,240),occurrences:0,targets:[],targetsAreSamples:true,targetsTruncated:false,reference:proof.reference || null};
      diagnosticSeen[dedup] = expressionInventory.length; expressionInventory.push(row); if (!proof.proven) risks.push(row);
    }
    row.occurrences++; if (row.targets.length < 8) row.targets.push({compItemId:compId,layerId:layerId,property:match,key:key});
    row.targetsTruncated = row.occurrences > row.targets.length;
  }
  function uniqueNamedChild(group,name,parentPath) {
    if (group.propertyType !== PropertyType.NAMED_GROUP && group.propertyType !== PropertyType.INDEXED_GROUP) return {error:"unsupported_literal_reference_group"};
    var count = groupCount(group), found = null, k, p;
    for (k = 1; k <= count; k++) {
      debugKey = parentPath;
      p = group.property(k); propertyIdentity(p,parentPath);
      if (String(p.name || "") === name || p.matchName === name) { if (found) return {error:"ambiguous_literal_property"}; found = p; }
    }
    return found ? {property:found,key:propertyIdentity(found,parentPath)} : {error:"missing_literal_property"};
  }
  function referencedLayerSupported(layer) {
    var kind = String(layer.matchName || "");
    if (typeof ThreeDModelLayer !== "undefined" && layer instanceof ThreeDModelLayer || typeof ParametricMeshLayer !== "undefined" && layer instanceof ParametricMeshLayer) return false;
    if (kind === "ADBE AV Layer" && typeof AVLayer !== "undefined" && layer instanceof AVLayer) return true;
    if (kind === "ADBE Text Layer" && typeof TextLayer !== "undefined" && layer instanceof TextLayer) return true;
    if (kind === "ADBE Vector Layer" && typeof ShapeLayer !== "undefined" && layer instanceof ShapeLayer) return true;
    if (kind === "ADBE Camera Layer" && typeof CameraLayer !== "undefined" && layer instanceof CameraLayer) return true;
    if (kind === "ADBE Light Layer" && typeof LightLayer !== "undefined" && layer instanceof LightLayer) return true;
    return false;
  }
  function resolveReference(syntax) {
    debug("reference_comp_lookup");
    var cacheKey = "comp:" + syntax.compName, comp = null, layer = null, k, item, count, root, rootKey, effect, leaf, layerIndex = null;
    if (syntax.compName === String(target.name)) return {error:"root_comp_name_dependency"};
    if (Object.prototype.hasOwnProperty.call(namedComps,cacheKey)) comp = namedComps[cacheKey];
    else {
      count = app.project.numItems; if (typeof count !== "number" || !isFinite(count) || count < 1 || Math.floor(count) !== count || count > 20000) bad("ame_open_expression_comp_lookup_bound");
      for (k = 1; k <= count; k++) { item = app.project.item(k); if (item instanceof CompItem && String(item.name) === syntax.compName) { if (comp) return {error:"ambiguous_literal_comp"}; comp = item; } }
      if (!comp) return {error:"missing_literal_comp"}; namedComps[cacheKey] = comp;
    }
    if (comp.id === target.id) return {error:"root_comp_name_dependency"}; recordComp(comp);
    debug("reference_layer_lookup",comp.id,null,"","");
    count = comp.numLayers; if (typeof count !== "number" || !isFinite(count) || count < 0 || Math.floor(count) !== count || count > 1000) bad("ame_open_layer_bound");
    for (k = 1; k <= count; k++) { item = comp.layer(k); if (String(item.name) === syntax.layerName) { if (layer) return {error:"ambiguous_literal_layer"}; layer = item; layerIndex = k; } }
    if (!layer) return {error:"missing_literal_layer"};
    debug("reference_effect_group",comp.id,layer.id,"","");
    if (!referencedLayerSupported(layer)) return {error:"unsupported_literal_reference_layer"}; recordLayer(comp.id,layer,layerIndex);
    if (layer.source && layer.source.id === target.id && layer.isNameSet !== true) return {error:"root_derived_literal_layer_name"};
    root = layer.property("ADBE Effect Parade"); if (!root || root.matchName !== "ADBE Effect Parade") return {error:"missing_literal_effect_group"};
    rootKey = propertyIdentity(root,comp.id+"/"+layer.id); debug("reference_effect_lookup",comp.id,layer.id,rootKey,root.matchName); effect = uniqueNamedChild(root,syntax.effectName,rootKey);
    if (effect.error) return {error:effect.error}; debug("reference_property_lookup",comp.id,layer.id,effect.key,effect.property.matchName); leaf = uniqueNamedChild(effect.property,syntax.propertyName,effect.key);
    if (leaf.error) return {error:leaf.error};
    if (leaf.property.propertyType !== PropertyType.PROPERTY) return {error:"literal_reference_leaf_required"};
    return {property:leaf.property,key:leaf.key,compId:comp.id,layerId:layer.id,reference:{key:leaf.key,compItemId:comp.id,compName:syntax.compName,layerId:layer.id,layerName:syntax.layerName,sourceItemId:layer.source?num(layer.source.id):null,layerNameIsSet:optional(layer.isNameSet),effectName:syntax.effectName,effectIndex:effect.property.propertyIndex,effectMatchName:effect.property.matchName,propertyName:syntax.propertyName,propertyIndex:leaf.property.propertyIndex,propertyMatchName:leaf.property.matchName}};
  }
  function analyzeLeaf(p,compId,layerId,key,dependencyDepth) {
    debug("leaf_cache",compId,layerId,key,"");
    if (Object.prototype.hasOwnProperty.call(expressionProofs,key)) {
      if (expressionProofs[key].pending) return {proven:false,kind:"literal_comp_effect_chain",reason:"expression_dependency_cycle"};
      return expressionProofs[key];
    }
    if (p.propertyType !== PropertyType.PROPERTY || typeof p.canSetExpression !== "boolean") bad("ame_open_expression_capability_unavailable");
    debug("leaf_expression_read",compId,layerId,key,p.matchName);
    var text = "", syntax, resolved, dependency, proof = {proven:true,kind:"static_property"};
    if (p.canSetExpression) text = p.expression;
    if (typeof text !== "string" || text.length > 20000) bad("ame_open_expression_text_unavailable_or_bound");
    if (!text.replace(/\s/g,"")) { expressionProofs[key] = proof; return proof; }
    expressionCount++; expressionProofs[key] = {pending:true};
    debugStage = "expression_parse";
    syntax = expressionSyntax(text);
    if (nameIndependent(text)) proof = {proven:true,kind:"name_independent_math_subset"};
    else if (syntax && syntax.kind === "literal_loop_out_duration") proof = {proven:true,kind:syntax.kind};
    else if (syntax && syntax.kind === "literal_comp_effect_chain") {
      proof = {proven:false,kind:syntax.kind,reason:"expression_dependency_depth_bound"};
      if (dependencyDepth < 16) {
        resolved = resolveReference(syntax);
        if (resolved.error) proof.reason = resolved.error;
        else {
          dependency = analyzeLeaf(resolved.property,resolved.compId,resolved.layerId,resolved.key,dependencyDepth + 1);
          debug("reference_proof_record",compId,layerId,key,p.matchName);
          proof = {proven:dependency.proven,kind:syntax.kind,reason:dependency.proven ? null : dependency.reason || "uncertain_referenced_expression",reference:resolved.reference};
          if (!Object.prototype.hasOwnProperty.call(referenceSeen,resolved.key)) { referenceSeen[resolved.key] = true; references.push({target:resolved.reference,dependencyKind:dependency.kind,proven:dependency.proven,reason:dependency.reason || null}); }
        }
      }
    } else proof = {proven:false,kind:"unsupported_expression",reason:"uncertain_name_dependency"};
    expressionProofs[key] = proof; diagnostic(text,proof,compId,layerId,key,p.matchName); return proof;
  }
  function scanProperty(p, compId, layerId, parentPath, depth) {
    debug("property_identity",compId,layerId,parentPath,"");
    if (depth > 32) bad("ame_open_expression_depth_bound");
    var key = propertyIdentity(p,parentPath), count, k;
    debugStage = "property_scan";
    if (propertySeen[key].scanned) return; propertySeen[key].scanned = true;
    if (p.propertyType === PropertyType.PROPERTY) { analyzeLeaf(p,compId,layerId,key,0); return; }
    if (p.propertyType !== PropertyType.NAMED_GROUP && p.propertyType !== PropertyType.INDEXED_GROUP) bad("ame_open_expression_property_type_unsupported");
    debugStage = "property_group_count"; count = groupCount(p);
    for (k = 1; k <= count; k++) { debug("indexed_property_lookup",compId,layerId,key,propertySeen[key].match); scanProperty(p.property(k),compId,layerId,key,depth + 1); }
  }
  function scanLayer(layer, compId) {
    // Layer.numProperties covers indexed mask/effect/tracker groups only.
    // Explicit named roots follow the AE match-name guide. A required missing
    // root, unknown layer kind, inaccessible group or malformed count fails closed.
    var kind = String(layer.matchName || ""), av = false, required = ["ADBE Transform Group"], optionalRoots = ["ADBE Marker"], k, p, count, path = compId + "/" + layer.id;
    if (typeof ThreeDModelLayer !== "undefined" && layer instanceof ThreeDModelLayer || typeof ParametricMeshLayer !== "undefined" && layer instanceof ParametricMeshLayer) bad("ame_open_expression_layer_kind_unsupported");
    if (kind === "ADBE AV Layer" && typeof AVLayer !== "undefined" && layer instanceof AVLayer) av = true;
    else if (kind === "ADBE Text Layer" && typeof TextLayer !== "undefined" && layer instanceof TextLayer) { av = true; required.push("ADBE Text Properties"); }
    else if (kind === "ADBE Vector Layer" && typeof ShapeLayer !== "undefined" && layer instanceof ShapeLayer) { av = true; required.push("ADBE Root Vectors Group"); }
    else if (kind === "ADBE Camera Layer" && typeof CameraLayer !== "undefined" && layer instanceof CameraLayer) required.push("ADBE Camera Options Group");
    else if (kind === "ADBE Light Layer" && typeof LightLayer !== "undefined" && layer instanceof LightLayer) required.push("ADBE Light Options Group");
    else bad("ame_open_expression_layer_kind_unsupported");
    if (av) {
      optionalRoots = optionalRoots.concat(["ADBE Time Remapping","ADBE Audio Group","ADBE Layer Overrides","ADBE Layer Styles","ADBE Blend Options Group","ADBE Material Options Group","ADBE Plane Options Group","ADBE Extrsn Options Group"]);
      if (layer.hasAudio === true) required.push("ADBE Audio Group");
      if (layer.timeRemapEnabled === true) required.push("ADBE Time Remapping");
      if (layer.threeDLayer === true) required.push("ADBE Material Options Group");
    }
    try {
      debug("layer_group_count",compId,layer.id,path,kind);
      count = groupCount(layer);
      for (k = 1; k <= count; k++) { debug("layer_index_lookup",compId,layer.id,path,kind); scanProperty(layer.property(k),compId,layer.id,path,1); }
      for (k = 0; k < required.length; k++) { debug("required_root_lookup",compId,layer.id,path,required[k]); p = layer.property(required[k]); if (!p) bad("ame_open_expression_required_root_unavailable:" + required[k]); if (p.matchName !== required[k]) bad("ame_open_expression_named_root_identity_changed"); scanProperty(p,compId,layer.id,path,1); namedRootCount++; }
      for (k = 0; k < optionalRoots.length; k++) { debug("optional_root_lookup",compId,layer.id,path,optionalRoots[k]); p = layer.property(optionalRoots[k]); if (p !== null) { if (!p || p.matchName !== optionalRoots[k]) bad("ame_open_expression_optional_root_unavailable"); scanProperty(p,compId,layer.id,path,1); namedRootCount++; } }
    } catch (error) { throw inspectionError(error); }
  }
  function walk(comp, stack) {
    var key = String(comp.id), rows = [], next = [], k, layer, source, n;
    for (n = 0; n < stack.length; n++) if (stack[n] === comp.id) bad("ame_open_comp_cycle");
    if (seen[key]) return; seen[key] = true;
    recordComp(comp);
    var compPath = "comp/" + num(comp.id);
    var node = {id:num(comp.id),name:String(comp.name),width:num(comp.width,compPath+"/width"),height:num(comp.height,compPath+"/height"),pixelAspect:num(comp.pixelAspect,compPath+"/pixelAspect"),duration:num(comp.duration,compPath+"/duration"),frameDuration:num(comp.frameDuration,compPath+"/frameDuration"),displayStartTime:num(comp.displayStartTime,compPath+"/displayStartTime"),workAreaStart:num(comp.workAreaStart,compPath+"/workAreaStart"),workAreaDuration:num(comp.workAreaDuration,compPath+"/workAreaDuration"),layers:rows}; graph.push(node);
    if (node.workAreaStart < 0 || node.workAreaDuration <= 0 || node.workAreaStart + node.workAreaDuration > node.duration + 0.0000001) bad("ame_open_work_area_invalid");
    for (k = 1; k <= comp.numLayers; k++) {
      layer = comp.layer(k); source = layer.source;
      recordLayer(comp.id,layer,k);
      var layerPath = compPath + "/layer/" + num(layer.id);
      rows.push({id:num(layer.id),index:k,name:String(layer.name),enabled:bool(layer.enabled),solo:bool(layer.solo),locked:bool(layer.locked),audioEnabled:optional(layer.audioEnabled),hasAudio:optional(layer.hasAudio),guideLayer:optional(layer.guideLayer),startTime:num(layer.startTime,layerPath+"/startTime"),inPoint:num(layer.inPoint,layerPath+"/inPoint"),outPoint:num(layer.outPoint,layerPath+"/outPoint"),stretch:num(layer.stretch,layerPath+"/stretch"),sourceItemId:source?num(source.id):null,parentId:layer.parent?num(layer.parent.id):null});
      scanLayer(layer, comp.id);
      if (source instanceof CompItem) next.push(source);
    }
    for (k = 0; k < next.length; k++) walk(next[k], stack.concat([comp.id]));
  }
  walk(target, []);
  var version = String(app.version || ""), build = String(app.buildNumber || ""), locale = String(app.isoLanguage || ""), labels = {en_US:"Add to Adobe Media Encoder Queue...",ru_RU:"Добавить в очередь Adobe Media Encoder..."};
  var label = labels[locale] || null, commandId = 0;
  if (label && typeof app.findMenuCommandId === "function" && typeof app.executeCommand === "function") commandId = app.findMenuCommandId(label);
  var menu = {version:version,buildNumber:build,locale:locale,label:label,commandId:commandId,available:!!label && version.length > 0 && version.length <= 128 && !/[\x00-\x1f]/.test(version) && /^[0-9]+$/.test(build) && typeof commandId === "number" && isFinite(commandId) && commandId > 0 && Math.floor(commandId) === commandId};
  var dependencyStatus = "no_expressions"; if (expressionCount) dependencyStatus = "proven_name_independent_subset"; if (risks.length) dependencyStatus = "blocked";
  return {schema:"ae-agent-ame-open-comp-observation.v1",application:"aftereffects",snapshot:{projectFile:String(app.project.file.fsName),revision:num(app.project.revision),compItemId:a.compItemId,graph:graph},dirty:app.project.dirty,
    nameDependencies:{status:dependencyStatus,complete:true,coverage:"explicit_named_layer_roots_and_literal_expression_closure_v2",expressionCount:expressionCount,uniqueExpressionCount:expressionInventory.length,inventoryComplete:true,inventoryTruncated:false,inventory:expressionInventory,references:references,compCount:compCount,layerCount:layerCount,propertyCount:propertyCount,namedRootCount:namedRootCount,risks:risks},menu:menu,
    numericIdentity:numericIdentity,range:{startSeconds:num(target.workAreaStart,"range/startSeconds"),endSeconds:num(target.workAreaStart+target.workAreaDuration,"range/endSeconds")}};
}

function execute(p) {
  function equal(a, b) { return openEqual(a,b); }
  function bad(code) { throw Error(code); }
  var slots = $.global.__aeAgentAMEOpenCompV1;
  if (!slots) { slots = {}; $.global.__aeAgentAMEOpenCompV1 = slots; }
  if (Object.prototype.hasOwnProperty.call(slots,p.intentId)) bad("ame_open_native_no_replay");
  var count = 0, key, i, j, comp = null, layers = [], before = null;
  for (key in slots) if (Object.prototype.hasOwnProperty.call(slots,key)) count++;
  if (count >= 512) bad("ame_open_native_slot_bound");
  // Latch exists before the first setter, and menu latch before executeCommand.
  var slot = {schema:p.schema,intentId:p.intentId,binding:p.binding,runId:p.runId,phase:"started",dispatchAttempted:false,dispatchReturned:false,restoreAttempted:false,restored:false,applied:[],lastObserved:null,error:null}; slots[p.intentId] = slot;
  try {
    if (new Date().getTime() >= p.deadline) bad("ame_open_deadline");
    before = openObserve(p.selector);
    if (!equal(before,p.before) || before.nameDependencies.status === "blocked" || before.menu.available !== true || !equal(before.menu,p.menu)) bad("ame_open_native_baseline_or_menu_changed");
    for (i = 1; i <= app.project.numItems; i++) { var item = app.project.item(i); if (String(item.name) === p.marker) bad("ame_open_marker_collision"); if (item.id === p.selector.compItemId) comp = item; }
    if (!(comp instanceof CompItem)) bad("ame_open_comp_missing");
    for (i = 0; i < p.patch.length; i++) {
      for (j = 1; j <= comp.numLayers; j++) if (comp.layer(j).id === p.patch[i].layerId) layers[i] = comp.layer(j);
      if (!layers[i] || layers[i].locked || layers[i].enabled !== p.patch[i].before) bad("ame_open_layer_baseline_changed");
    }
    if (new Date().getTime() >= p.deadline) bad("ame_open_deadline");
    slot.phase = "applying";
    comp.name = p.marker;
    if (String(comp.name) !== p.marker) bad("ame_open_marker_set_failed");
    slot.applied.push({kind:"name",before:p.beforeName,after:p.marker});
    for (i = 0; i < p.patch.length; i++) {
      if (p.patch[i].before === p.patch[i].after) continue;
      layers[i].enabled = p.patch[i].after;
      if (layers[i].enabled !== p.patch[i].after) bad("ame_open_flag_set_failed");
      slot.applied.push({kind:"enabled",layerId:p.patch[i].layerId,before:p.patch[i].before,after:p.patch[i].after});
    }
    slot.lastObserved = openObserve(p.selector);
    var current = slot.lastObserved.snapshot, actualRevision = current.revision; current.revision = p.wanted.revision;
    var preserved = equal(current,p.wanted); current.revision = actualRevision;
    if (!preserved || !equal(slot.lastObserved.numericIdentity,p.before.numericIdentity)) bad("ame_open_patch_preservation_changed");
    if (slot.lastObserved.nameDependencies.status === "blocked" || !equal(slot.lastObserved.nameDependencies,p.before.nameDependencies)) bad("ame_open_expression_proof_changed_after_marker");
    // Inspect the command binding again immediately before a single menu call.
    if (!equal(slot.lastObserved.menu,p.menu) || new Date().getTime() >= p.deadline) bad("ame_open_menu_or_deadline_changed");
    var viewer = comp.openInViewer();
    if (!viewer || typeof viewer.setActive !== "function" || viewer.setActive() === false || app.project.activeItem !== comp) bad("ame_open_viewer_not_active");
    if (new Date().getTime() >= p.deadline) bad("ame_open_deadline");
    slot.phase = "dispatch_latched"; slot.dispatchAttempted = true;
    app.executeCommand(p.menu.commandId);
    slot.dispatchReturned = true; slot.phase = "native_dispatched";
    slot.lastObserved = openObserve(p.selector);
    return slot;
  } catch (error) { slot.phase = "unknown"; slot.error = String(error.message || error); try { slot.lastObserved = openObserve(p.selector); } catch (_) {} return slot; }
}

function restore(p) {
  function bad(code) { throw Error(code); }
  var slots = $.global.__aeAgentAMEOpenCompV1, slot = slots && slots[p.intentId], i, j, comp = null, layers = [], current;
  if (!slot || slot.binding !== p.binding || slot.runId !== p.originalRunId || slot.restoreAttempted || slot.restored) bad("ame_open_exact_restore_slot_required");
  if (new Date().getTime() >= p.deadline) bad("ame_open_deadline");
  current = openObserve(p.selector);
  if (!openEqual(current,p.expectedCurrent)) bad("ame_open_restore_manual_drift");
  for (i = 1; i <= app.project.numItems; i++) if (app.project.item(i).id === p.selector.compItemId) comp = app.project.item(i);
  if (!(comp instanceof CompItem) || String(comp.name) !== p.marker) bad("ame_open_restore_owned_marker_required");
  for (i = 0; i < slot.applied.length; i++) if (slot.applied[i].kind === "enabled") {
    for (j = 1; j <= comp.numLayers; j++) if (comp.layer(j).id === slot.applied[i].layerId) layers[i] = comp.layer(j);
    if (!layers[i] || layers[i].locked || layers[i].enabled !== slot.applied[i].after) bad("ame_open_restore_flag_drift");
  }
  slot.restoreAttempted = true; slot.phase = "restore_latched";
  try {
    if (!slot.dispatchReturned) for (i = slot.applied.length - 1; i >= 0; i--) if (slot.applied[i].kind === "enabled") layers[i].enabled = slot.applied[i].before;
    comp.name = p.beforeName;
    slot.lastObserved = openObserve(p.selector);
    var snapshot = slot.lastObserved.snapshot, actualRevision = snapshot.revision; snapshot.revision = p.restoredSnapshot.revision;
    var preserved = openEqual(snapshot,p.restoredSnapshot); snapshot.revision = actualRevision;
    if (!preserved || !openEqual(slot.lastObserved.numericIdentity,p.expectedCurrent.numericIdentity)) bad("ame_open_restore_preservation_changed");
    // Never reset dirty, revision, viewer, work area, or any other user state.
    slot.restored = true; slot.restoreScope = slot.dispatchReturned ? "name_only" : "proven_partial_property_rollback"; slot.phase = "restored"; return slot;
  } catch (error) { slot.phase = "unknown"; slot.error = String(error.message || error); try { slot.lastObserved = openObserve(p.selector); } catch (_) {} return slot; }
}
function equal(a,b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== typeof b || typeof a !== "object") return false;
  var ka = [], kb = [], k, i;
  for (k in a) if (Object.prototype.hasOwnProperty.call(a,k)) ka.push(k);
  for (k in b) if (Object.prototype.hasOwnProperty.call(b,k)) kb.push(k);
  ka.sort(); kb.sort(); if (ka.length !== kb.length) return false;
  for (i = 0; i < ka.length; i++) if (ka[i] !== kb[i] || !equal(a[ka[i]],b[kb[i]])) return false;
  return true;
}
const prelude = `var openObserve=${observe.toString()};var openEqual=${equal.toString()};`;
const observeScript = args => `${prelude}return openObserve(${literal(args)});`;
const dispatchScript = program => `${prelude}var openExecute=${execute.toString()};return openExecute(${literal(program)});`;
const restoreScript = program => `${prelude}var openRestore=${restore.toString()};return openRestore(${literal(program)});`;
const lookupScript = intentId => `var s=$.global.${SLOT};return s&&Object.prototype.hasOwnProperty.call(s,${literal(intentId)})?s[${literal(intentId)}]:null;`;
const identityScript = () => 'if(typeof BridgeTalk==="undefined"||String(BridgeTalk.appName).toLowerCase()!=="aftereffects")throw Error("ame_open_aftereffects_host_required");return {projectFile:app.project&&app.project.file?String(app.project.file.fsName):null};';
module.exports = {SLOT,observe,execute,restore,equal,observeScript,dispatchScript,restoreScript,lookupScript,identityScript};
