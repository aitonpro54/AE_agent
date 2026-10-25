"use strict";

const crypto = require("node:crypto");
const TOOL_NAME = "inspect_ame_transport";
const SCHEMA = "ae-agent-ame-transport.v1";
const RESPONSE_SCHEMA = "ae-agent-ame-read-response.v1";
const SLOT_NAME = "aeAgentAMETransportDiagnosticV1";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function fail(code) { const e = new Error(code); e.code = code; throw e; }
function validateInput(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).some(k => !["targetSpecifier", "expectedSessionNonce", "timeoutMs", "reconcileRequestNonce", "afterReadUnknownNonce"].includes(k))) fail("ame_transport_invalid_input");
  if (typeof raw.targetSpecifier !== "string" || !/^ame-[0-9]{1,3}\.[0-9]{1,3}$/.test(raw.targetSpecifier)) fail("ame_transport_exact_target_required");
  if (raw.expectedSessionNonce !== undefined && (typeof raw.expectedSessionNonce !== "string" || !/^[A-Za-z0-9._-]{1,128}$/.test(raw.expectedSessionNonce))) fail("ame_transport_invalid_session_nonce");
  if (raw.reconcileRequestNonce !== undefined && (typeof raw.reconcileRequestNonce!=="string"||!UUID.test(raw.reconcileRequestNonce))) fail("ame_transport_invalid_request_nonce");
  if(raw.afterReadUnknownNonce!==undefined&&(raw.reconcileRequestNonce!==undefined||typeof raw.afterReadUnknownNonce!=="string"||!UUID.test(raw.afterReadUnknownNonce)))fail("ame_transport_invalid_read_retirement");
  const timeoutMs = raw.timeoutMs === undefined ? 5000 : raw.timeoutMs;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 10000) fail("ame_transport_invalid_timeout");
  return { targetSpecifier: raw.targetSpecifier, expectedSessionNonce: raw.expectedSessionNonce || null, timeoutMs, reconcileRequestNonce: raw.reconcileRequestNonce || null,...(raw.afterReadUnknownNonce?{afterReadUnknownNonce:raw.afterReadUnknownNonce}:{}) };
}
const literal = value => JSON.stringify(value).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

// Only fixed reads in AME. No listener, global assignment, queue item getter,
// encoder creation, preset load, runBatch, file I/O or caller-provided source.
function nativeAmeRead(requestNonce) {
  function scalar(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return isFinite(value) ? value : null;
    if (typeof value === "string") return value.substring(0, 4096);
    return null;
  }
  function names(object, kind) {
    var result = [], entries, i, name;
    try {
      entries = object && object.reflect ? object.reflect[kind] : null;
      if (!entries || typeof entries.length !== "number") return { names: result, available: false, count: null, truncated: false };
      for (i = 0; i < entries.length && i < 128; i++) {
        name = entries[i] && entries[i].name;
        if (typeof name === "string") result.push(name.substring(0, 160));
      }
      return { names: result, available: true, count: entries.length, truncated: entries.length > 128 };
    } catch (ignored) {}
    return { names: result, available: false, count: null, truncated: false };
  }
  function describe(object) {
    var methods = names(object, "methods"), properties = names(object, "properties");
    return { available: !!object, methods: methods.names, properties: properties.names, methodMetadata: { available: methods.available, count: methods.count, truncated: methods.truncated },
      propertyMetadata: { available: properties.available, count: properties.count, truncated: properties.truncated } };
  }
  function quote(text) {
    var result = '"', i, code, hex;
    text = String(text);
    for (i = 0; i < text.length; i++) {
      code = text.charCodeAt(i);
      if (code === 34 || code === 92) result += "\\" + text.charAt(i);
      else if (code < 32 || code === 8232 || code === 8233) { hex = code.toString(16); while (hex.length < 4) hex = "0" + hex; result += "\\u" + hex; }
      else result += text.charAt(i);
    }
    return result + '"';
  }
  function stringify(value) {
    var i, key, out = [];
    if (value === null || value === undefined) return "null";
    if (typeof value === "string") return quote(value);
    if (typeof value === "number") return isFinite(value) ? String(value) : "null";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (Object.prototype.toString.call(value) === "[object Array]") { for (i = 0; i < value.length; i++) out.push(stringify(value[i])); return "[" + out.join(",") + "]"; }
    for (key in value) if (Object.prototype.hasOwnProperty.call(value, key)) out.push(quote(key) + ":" + stringify(value[key]));
    return "{" + out.join(",") + "}";
  }
  var result = { schema: "ae-agent-ame-read-response.v1", requestNonce: requestNonce, observedAt: new Date().getTime(), appSpecifier: null, sessionNonce: null, buildNumber: null,
    app: describe(app), exporter: null, frontend: null, encoderHost: null, batchEncoder: null, reads: {}, errors: [] };
  try { result.appSpecifier = scalar(BridgeTalk.appSpecifier); } catch (e1) { result.errors.push("app_specifier_read_failed"); }
  try { result.sessionNonce = scalar($.global.aeAgentAMEProbeSessionNonce); } catch (e2) { result.errors.push("session_nonce_read_failed"); }
  try { result.buildNumber = scalar(app.buildNumber); } catch (e3) { result.errors.push("build_number_read_failed"); }
  var frontend = null, host = null, batch = null, formats, i;
  try { if (typeof app.getFrontend === "function") frontend = app.getFrontend(); result.frontend = describe(frontend); } catch (e4) { result.errors.push("frontend_read_failed"); }
  try { if (typeof app.getEncoderHost === "function") host = app.getEncoderHost(); result.encoderHost = describe(host); } catch (e5) { result.errors.push("encoder_host_read_failed"); }
  try { if (typeof app.getBatchEncoder === "function") batch = app.getBatchEncoder(); result.batchEncoder = describe(batch); } catch (e6) { result.errors.push("batch_encoder_read_failed"); }
  try { if (typeof app.getExporter === "function") result.exporter = describe(app.getExporter()); } catch (e7) { result.errors.push("exporter_read_failed"); }
  try { if (host && typeof host.isBatchRunning === "function") result.reads.isBatchRunning = scalar(host.isBatchRunning()); } catch (e8) { result.errors.push("batch_running_read_failed"); }
  try { if (host && typeof host.getBatchEncoderStatus === "function") result.reads.batchEncoderStatus = scalar(host.getBatchEncoderStatus()); } catch (e9) { result.errors.push("batch_status_read_failed"); }
  try {
    if (host && typeof host.getFormatList === "function") {
      formats = host.getFormatList(); result.reads.formats = [];
      if (formats && typeof formats.length === "number") for (i = 0; i < formats.length && i < 128; i++) result.reads.formats.push(scalar(formats[i]));
    }
  } catch (e10) { result.errors.push("format_list_read_failed"); }
  return stringify(result);
}

// ES3 sender. The sole sender slot retains the BridgeTalk object for callbacks.
// Unknown requests block another send; reconciliation pumps the same request.
function nativeInspect(a, requestNonce, messageBody, previousBody) {
  function snapshot() {
    var project = app.project, result = { projectFile: null, projectDirtyType: "undefined", projectDirty: null, save: false, saveCopy: false, saveAsCopy: false, methods: [] }, entries, i, name;
    if (!project) return result;
    try { result.projectFile = project.file ? String(project.file.fsName) : null; } catch (ignored1) {}
    try { result.projectDirtyType = typeof project.dirty; if (result.projectDirtyType === "boolean") result.projectDirty = project.dirty; } catch (ignored2) {}
    try { result.save = typeof project.save === "function"; result.saveCopy = typeof project.saveCopy === "function"; result.saveAsCopy = typeof project.saveAsCopy === "function"; } catch (ignored3) {}
    try { entries = project.reflect.methods; for (i = 0; entries && i < entries.length && i < 128; i++) { name = entries[i].name; if (typeof name === "string" && /^(save|copy)/i.test(name)) result.methods.push(name.substring(0, 160)); } } catch (ignored4) {}
    return result;
  }
  var snapshotCapabilities = snapshot(), startedAt = new Date().getTime(), slot, state = $.global.aeAgentAMETransportDiagnosticV1;
  function response(code, current, historical) {
    return { schema: "ae-agent-ame-transport-native.v1", code: code, requestNonce: current ? current.requestNonce : requestNonce, targetSpecifier: current ? current.targetSpecifier : a.targetSpecifier,
      expectedSessionNonce: current ? current.expectedSessionNonce : a.expectedSessionNonce, observedAt: new Date().getTime(), sent: current ? current.sent : false,
      callback: current ? current.callback : null, responseBody: current ? current.body : null, error: current ? current.error : null, lateResponse: current ? current.lateResponse : false,
      snapshotCapabilities: snapshotCapabilities, automaticRetryAllowed: false,historical:historical===true };
  }
  function pump(current, budgetMs) {
    var deadline = new Date().getTime() + budgetMs;
    while ((!current.callback || current.callback === "timeout") && new Date().getTime() < deadline) {
      if (typeof BridgeTalk.pump !== "function" || typeof $.sleep !== "function") break;
      BridgeTalk.pump(); if (!current.callback || current.callback === "timeout") $.sleep(20);
    }
    if (!current.callback) current.expired = true;
  }
  if (typeof BridgeTalk !== "function" || typeof BridgeTalk.isRunning !== "function") return response("bridgetalk_unavailable", null);
  function own(v,key){return Object.prototype.hasOwnProperty.call(v,key);}
  var history=state&&own(state,"history")?state.history:[],i,old=null,found=0,seen={};
  if(Object.prototype.toString.call(history)!=="[object Array]"||history.length>64)return response("read_history_changed_or_bound",null);
  for(i=0;i<history.length;i++){if(!history[i]||typeof history[i]!=="object"||!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(history[i].requestNonce||""))return response("read_history_changed_or_bound",null);if(own(seen,history[i].requestNonce)||state.pending&&state.pending.requestNonce===history[i].requestNonce)return response("read_history_collision",null);seen[history[i].requestNonce]=true;if(history[i].requestNonce===(a.afterReadUnknownNonce||a.reconcileRequestNonce)){old=history[i];found++;}}
  if(found>1)return response("read_history_collision",null);
  function exactReader(s){
    if(!s||s.targetSpecifier!==a.targetSpecifier||s.expectedSessionNonce!==a.expectedSessionNonce||!s.message||s.message.target!==a.targetSpecifier||typeof s.message.body!=="string"||typeof previousBody!=="string")return false;
    // Line terminators may differ after a normal source checkout. No other
    // historical reader bytes, source or operation are interchangeable.
    return s.message.body.replace(/\r\n/g,"\n")===previousBody.replace(/\r\n/g,"\n");
  }
  if(a.afterReadUnknownNonce){
    slot=state&&state.pending;
    if(old)return response(exactReader(old)?"read_unknown_already_archived":"read_unknown_binding_mismatch",old,true);
    if(!slot||slot.requestNonce!==a.afterReadUnknownNonce||!exactReader(slot))return response("read_unknown_binding_mismatch",slot);
    var seconds=slot.message.timeout,budget=seconds*1000,deadline=slot.startedAt+budget;
    if(typeof seconds!=="number"||!isFinite(seconds)||seconds<1||seconds>10||Math.floor(seconds)!==seconds||typeof slot.startedAt!=="number"||!isFinite(slot.startedAt)||slot.startedAt<=0||own(slot,"deadlineAt")&&slot.deadlineAt!==deadline||own(slot,"budgetMs")&&slot.budgetMs!==budget)return response("read_unknown_budget_changed",slot);
    if(slot.callback!==null&&slot.callback!=="timeout"||slot.body!==null||new Date().getTime()<deadline)return response("read_unknown_not_expired_or_terminal",slot);
    if(history.length>=64)return response("read_history_bound",slot);
    // No pump, constructor or send. Retain the same object and callback closure.
    if(state.pending!==slot)return response("read_unknown_slot_changed",slot);
    history.push(slot);state.history=history;state.pending=null;return response("read_unknown_archived",slot,true);
  }
  if(a.reconcileRequestNonce&&old){if(!exactReader(old))return response("reconciliation_target_mismatch",old,true);return response(old.callback||"unknown",old,true);}
  if (state && state.pending) {
    slot = state.pending;
    if (a.reconcileRequestNonce) {
      if (slot.requestNonce !== a.reconcileRequestNonce || slot.targetSpecifier !== a.targetSpecifier || slot.expectedSessionNonce !== a.expectedSessionNonce) return response("reconciliation_target_mismatch", slot);
      pump(slot, a.timeoutMs);
      return response(slot.callback || "unknown", slot);
    }
    if (!slot.callback || slot.callback === "timeout") return response("previous_request_unresolved", slot);
  } else if (a.reconcileRequestNonce) return response("reconciliation_request_missing", null);
  try { if (!BridgeTalk.isRunning(a.targetSpecifier)) return response("target_not_running", null); } catch (preflightError) { return response("target_running_unknown", null); }
  var message = new BridgeTalk();
  slot = { requestNonce: requestNonce, targetSpecifier: a.targetSpecifier, expectedSessionNonce: a.expectedSessionNonce, startedAt: startedAt,budgetMs:Math.ceil(a.timeoutMs/1000)*1000,deadlineAt:startedAt+Math.ceil(a.timeoutMs/1000)*1000, sent: null, callback: null, body: null, error: null, expired: false, lateResponse: false, message: message };
  if (!state) { state = { pending: null }; $.global.aeAgentAMETransportDiagnosticV1 = state; }
  state.pending = slot;
  message.target = a.targetSpecifier; message.body = messageBody; message.timeout = Math.ceil(a.timeoutMs / 1000);
  message.onResult = function (reply) { slot.lateResponse = slot.expired || slot.callback === "timeout"; slot.body = String(reply.body || "").substring(0, 65537); slot.callback = "result"; };
  message.onError = function (reply) { slot.error = String(reply.body || "BridgeTalk error").substring(0, 2000); slot.callback = "error"; };
  message.onTimeout = function () { slot.expired = true; slot.callback = "timeout"; };
  try { slot.sent = message.send(Math.ceil(a.timeoutMs / 1000)); } catch (sendError) { slot.error = String(sendError).substring(0, 2000); slot.expired = true; return response("send_unknown", slot); }
  if (!slot.callback) pump(slot, 250);
  return response(slot.callback || "unknown", slot);
}
function ameMessage(requestNonce) { return "(" + nativeAmeRead.toString() + ")(" + literal(requestNonce) + ");"; }
function inspectScript(a, requestNonce) { const previous=a.afterReadUnknownNonce||a.reconcileRequestNonce;return "return (" + nativeInspect.toString() + ")(" + literal(a) + "," + literal(requestNonce) + "," + literal(ameMessage(requestNonce)) + ","+literal(previous?ameMessage(previous):null)+");"; }
function normalizeResult(native, requestNonce, a, now = Date.now()) {
  const result = { schema: SCHEMA, ok: false, transport: "ae_bridgetalk", code: native && native.code || "native_response_invalid", requestNonce,
    targetSpecifier: a.targetSpecifier, observedAt: new Date(now).toISOString(), deliveryVerified: false, sessionMatched: null, warmSessionVerified: false,
    adapterReady: false, automaticRetryAllowed: false, queueMutationPerformed: false, snapshotCapabilities: native && native.snapshotCapabilities || null };
  if (!native || native.schema !== "ae-agent-ame-transport-native.v1" || typeof native.requestNonce !== "string") return result;
  result.requestNonce = native.requestNonce;
  result.native = { callback: native.callback, sent: native.sent, observedAt: native.observedAt, lateResponse: native.lateResponse, error: native.error };
  if(native.historical===true){result.historical=true;result.currentObservation=false;}
  if(a.afterReadUnknownNonce){if(native.code==="read_unknown_archived"&&native.historical===true&&native.requestNonce===a.afterReadUnknownNonce&&native.targetSpecifier===a.targetSpecifier&&native.expectedSessionNonce===a.expectedSessionNonce&&[null,"timeout"].includes(native.callback)&&native.responseBody===null){result.code="read_transport_unknown_archived";result.transportUnknown=true;result.nextReadAllowed=true;result.executionAuthority=false;result.nextReadArgs={targetSpecifier:a.targetSpecifier,...(a.expectedSessionNonce?{expectedSessionNonce:a.expectedSessionNonce}:{}),timeoutMs:a.timeoutMs};}return result;}
  if (native.code !== "result") return result;
  let response;
  try { if (typeof native.responseBody !== "string" || native.responseBody.length > 65536) throw Error(); response = JSON.parse(native.responseBody); if (!response || typeof response !== "object" || Array.isArray(response)) throw Error(); } catch (_) { result.code = "ame_response_invalid_json"; return result; }
  const expectedRequest = a.reconcileRequestNonce || requestNonce;
  if (native.requestNonce !== expectedRequest || response.schema !== RESPONSE_SCHEMA || response.requestNonce !== expectedRequest) { result.code = "request_nonce_mismatch"; return result; }
  if (native.targetSpecifier !== a.targetSpecifier || response.appSpecifier !== a.targetSpecifier) { result.code = "target_specifier_mismatch"; return result; }
  if (!Number.isFinite(response.observedAt) || response.observedAt <= 0 || response.observedAt > now + 60000) { result.code = "ame_observation_invalid"; return result; }
  if(native.historical===true){result.code="historical_response_correlated";result.retainedAme=response;return result;}
  result.deliveryVerified = true;
  result.sessionMatched = a.expectedSessionNonce === null ? null : response.sessionNonce === a.expectedSessionNonce;
  result.warmSessionVerified = result.sessionMatched === true;
  result.ame = response;
  result.ok = a.expectedSessionNonce === null || result.sessionMatched;
  result.code = result.ok ? "response_correlated" : "target_session_changed";
  return result;
}
async function execute(raw, runExtendScriptBody) {
  const a = validateInput(raw), requestNonce = crypto.randomUUID();
  try {
    const response = await runExtendScriptBody(inspectScript(a, requestNonce), 30000);
    return normalizeResult(response && response.result, requestNonce, a);
  } catch (error) {
    return { schema: SCHEMA, ok: false, transport: "ae_bridgetalk", code: "ae_delivery_unknown", requestNonce, targetSpecifier: a.targetSpecifier,
      observedAt: new Date().toISOString(), deliveryVerified: false, warmSessionVerified: false, adapterReady: false, automaticRetryAllowed: false,
      error: String(error.message || error).substring(0, 2000) };
  }
}
const tool = {
  name: TOOL_NAME,
  description: "Read one exact already-running AME via a fixed BridgeTalk diagnostic. Correlates fresh request and optional existing session nonce; reads bounded API metadata and batch state only. Does not submit, create queue items, launch explicitly, save or claim adapter readiness. Unknown sends are never replayed; reconcile the exact request nonce. Optional afterReadUnknownNonce archives only the exact expired unknown fixed read without send/pump and returns nextReadArgs for a separate new read. Archived responses never prove current readiness.",
  inputSchema: { type: "object", additionalProperties: false, properties: {
    targetSpecifier: { type: "string", pattern: "^ame-[0-9]{1,3}\\.[0-9]{1,3}$" },
    expectedSessionNonce: { type: "string", pattern: "^[A-Za-z0-9._-]{1,128}$" },
    timeoutMs: { type: "integer", minimum: 1000, maximum: 10000, default: 5000 },
    reconcileRequestNonce: { type: "string", pattern: UUID.source, description: "Exact unresolved or archived nonce; reads its retained callback without sending another message. Archived responses never prove fresh readiness." },
    afterReadUnknownNonce:{type:"string",pattern:UUID.source,description:"Exclusive with reconciliation. Archive only this exact still-unknown fixed read after its original budget, preserving its message/callback in bounded history. Sends nothing; returns nextReadArgs for a separate new read."}
  }, required: ["targetSpecifier"] },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
};
module.exports = { TOOL_NAME, SCHEMA, SLOT_NAME, tool, validateInput, ameMessage, inspectScript, normalizeResult, execute };
