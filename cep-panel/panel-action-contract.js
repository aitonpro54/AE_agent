"use strict";

(function (root, factory) {
  if (typeof window === "undefined" && typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.AEAgentPanelContract = factory();
  }
})(typeof window !== "undefined" ? window : typeof self !== "undefined" ? self : this, function () {
  var PROTOCOL_VERSION = "ae-agent.panel-actions.v1";
  var UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  var ACTION_CATALOG = [
{
      name: "bridge.configure",
      effect: "local_persistence",
      confirmationRequired: false,
      description: "Configure local loopback bridge URL and write-only panel token.",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          url: { type: "string", format: "loopback_http" },
          panelToken: { type: "string", writeOnly: true }
        }
      },
      writeOnly: ["panelToken"],
      affectedInputs: ["bridgeUrl", "bridgeToken"],
      outputFields: ["configured", "url"]
    },
{
      name: "bridge.connect",
      effect: "panel_lifecycle",
      confirmationRequired: false,
      description: "Connect to local bridge and begin command polling.",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {}
      },
      affectedInputs: ["connectButton", "status", "badge"],
      outputFields: ["connected", "baseUrl"]
    },
{
      name: "bridge.disconnect",
      effect: "panel_lifecycle",
      confirmationRequired: false,
      description: "Disconnect from bridge and halt polling.",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {}
      },
      affectedInputs: ["disconnectButton", "status", "badge"],
      outputFields: ["disconnected"]
    },
{
      name: "panel.reload",
      effect: "panel_lifecycle",
      confirmationRequired: false,
      description: "Reload panel CEP frame with fresh assets nonce.",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {}
      },
      affectedInputs: ["reloadButton"],
      outputFields: ["targetUrl", "reloading"]
    },
{
      name: "autonomy.refresh",
      effect: "bridge_read",
      confirmationRequired: false,
      description: "Read latest autonomous session state from bridge.",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {}
      },
      affectedInputs: ["autonomousSessionButton", "autonomousSessionStatus"],
      outputFields: ["session"]
    },
{
      name: "autonomy.set",
      effect: "project_intent_write",
      confirmationRequired: false,
      description: "Enable or disable Codex autonomous session on the bridge.",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["enabled"],
        properties: {
          enabled: { type: "boolean" }
        }
      },
      affectedInputs: ["autonomousSessionButton", "autonomousSessionStatus"],
      outputFields: ["session"]
    },
{
      name: "placeholder.refresh",
      effect: "bridge_read",
      confirmationRequired: false,
      description: "Refresh placeholder protection status and constraints.",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {}
      },
      affectedInputs: ["refreshPlaceholderProtectionButton", "placeholderProtectionStatus"],
      outputFields: ["protection"]
    },
{
      name: "placeholder.accept",
      effect: "project_intent_write",
      confirmationRequired: false,
      description: "Accept selected After Effects placeholder layer for protection.",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          useSelectedProperties: { type: "boolean" }
        }
      },
      affectedInputs: ["acceptPlaceholderButton", "placeholderSelectedProperties"],
      outputFields: ["acceptedCount"]
    },
{
      name: "placeholder.release",
      effect: "project_intent_write",
      confirmationRequired: true,
      description: "Release protection for the currently selected placeholder layer.",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["confirm"],
        properties: {
          confirm: { type: "boolean" }
        }
      },
      affectedInputs: ["releasePlaceholderButton", "placeholderProtectionStatus"],
      outputFields: ["released"]
    },
{
      name: "placeholder.mapGroup",
      effect: "project_intent_write",
      confirmationRequired: false,
      description: "Map source group or performer identifier to selected placeholder.",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["groupId"],
        properties: {
          groupId: { type: "string", minLength: 1 }
        }
      },
      affectedInputs: ["mapPlaceholderGroupButton", "placeholderGroupId"],
      outputFields: ["groupMappings"]
    },
{
      name: "placeholder.constraints.set",
      effect: "project_intent_write",
      confirmationRequired: false,
      description: "Apply distinct group and source overlap constraints to selected placeholders.",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["distinctGroups", "disallowSourceOverlap"],
        properties: {
          distinctGroups: { type: "boolean" },
          disallowSourceOverlap: { type: "boolean" }
        }
      },
      affectedInputs: ["applyPlaceholderConstraintsButton", "placeholderDistinctGroups", "placeholderDisallowOverlap"],
      outputFields: ["constraints"]
    },
{
      name: "plan.current",
      effect: "bridge_read",
      confirmationRequired: false,
      description: "Get canonical current bridge plan and verified pins snapshot.",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          fresh: { type: "boolean" },
          expectedActionId: { type: "string" }
        }
      },
      affectedInputs: ["currentBridgePlan"],
      outputFields: ["current", "pins"]
    },
{
      name: "plan.prepare",
      effect: "bridge_read",
      confirmationRequired: false,
      description: "Adopt tokenless proposal and execute dry-run, returning new pins with executed:false.",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          actionId: { type: "string" },
          revision: { type: "integer", minimum: 1 },
          instanceId: { type: "string" }
        }
      },
      affectedInputs: ["dryRunPlanButton", "currentBridgePlan", "planRunStatus"],
      outputFields: ["adoptedPins", "acceptedDryRunId", "executed", "dryRun"]
    },
{
      name: "plan.dryRun",
      effect: "bridge_read",
      confirmationRequired: false,
      description: "Execute dry-run check of current plan without changing the After Effects project.",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          actionId: { type: "string" },
          pins: { type: "object" }
        }
      },
      affectedInputs: ["dryRunPlanButton", "planRunStatus"],
      outputFields: ["run", "executed"]
    },
{
      name: "plan.run",
      effect: "protected_plan_run",
      confirmationRequired: true,
      description: "Execute current pinned plan through protected AE Agent runner with confirm:true.",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["confirm"],
        properties: {
          actionId: { type: "string" },
          pins: { type: "object" },
          confirm: { type: "boolean" }
        }
      },
      affectedInputs: ["runPlanButton", "planRunStatus"],
      outputFields: ["run", "runId", "executed"]
    },
{
      name: "plan.reconcile",
      effect: "bridge_read",
      confirmationRequired: false,
      description: "Reconcile actual post-run project state without re-running mutations.",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          runId: { type: "string" }
        }
      },
      affectedInputs: ["reconcilePlanRunButton"],
      outputFields: ["reconciliation", "admissionGuardReleased", "terminalEvidenceRequired"]
    }
];


  var PIN_PROPERTIES = {
    instanceId: {type:'string',minLength:1}, revision: {type:'integer',minimum:1},
    actionId: {type:'string',minLength:1}, requestId: {type:'string',minLength:1},
    actionKind: {type:'string',enum:['ae_tool','ae_jsx']}, payloadRef: {type:'string',minLength:1},
    payloadHash: {type:'string',pattern:'^sha256:[a-f0-9]{64}$'}, previewHash: {type:'string',pattern:'^sha256:[a-f0-9]{64}$'},
    projectFile: {type:'string'}, expiresAt: {type:'string',format:'date-time'},
    riskLevel: {type:'string',enum:['read_only','mutating','destructive','raw_jsx']},
    riskPolicyVersion: {type:'string',enum:['m100-risk-v1']}, surface: {type:'string',minLength:1}, sessionId: {type:'string'}
  };
  var PIN_SCHEMA = {type:'object',additionalProperties:false,required:Object.keys(PIN_PROPERTIES),properties:PIN_PROPERTIES};
  var ACTION_INDEX = Object.create(null);
  // Read-only provenance of the previous product catalog. These names have no
  // schema/handler and never participate in validateEnvelope or active catalog.
  var HISTORICAL_ACTION_NAMES = ["ui.diagnostics.set","ui.sidebar.set","connector.refresh","connector.emergencyDisable","usage.refresh",
    "provider.group.set","provider.authMode.set","provider.agent.set","provider.model.set","provider.freeOnly.set","provider.refresh","provider.detectLocal","provider.check","provider.selfTest","provider.key.save","provider.setup",
    "chat.mode.set","chat.optimization.set","chat.prompt.set","workflow.preset.set","workflow.insert","chat.sessions.list","chat.session.select","chat.new","chat.clear","chat.transcript.get","chat.send","agent.plan","agent.hardcore","plan.recover","plan.devRequest","logs.get"];
  function storedActionDefinition(name) {
    if(ACTION_INDEX[name])return ACTION_INDEX[name];
    return HISTORICAL_ACTION_NAMES.indexOf(name)>=0 ? {name:name,historical:true} : null;
  }
  ACTION_CATALOG.forEach(function(def) {
    if (/^plan\.(prepare|dryRun|run)$/.test(def.name)) {
      def.schema = {type:'object',additionalProperties:false,required:['pins'],properties:{pins:PIN_SCHEMA}};
      if (def.name === 'plan.run') { def.schema.required.push('confirm'); def.schema.properties.confirm = {type:'boolean',enum:[true]}; }
      if (def.name === 'plan.prepare') def.effect = 'project_intent_write';
    }

    if (def.name === 'plan.reconcile') def.schema.required = ['runId'];

    if (def.name === 'placeholder.accept') def.schema.required = ['useSelectedProperties'];
    ACTION_INDEX[def.name] = def;
  });

  function plain(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var proto = Object.getPrototypeOf(value);
    return proto === null || proto === Object.prototype;
  }
  function validateLoopbackUrl(value) {
    // No path/query/fragment/credentials. The panel only appends fixed server routes.
    if (typeof value !== 'string') return false;
    var match = /^http:\/\/(127\.0\.0\.1|localhost)(?::([1-9][0-9]{0,4}))?\/?$/.exec(value);
    return !!match && (!match[2] || Number(match[2]) <= 65535);
  }
  function fail(code, message) { return {ok:false,code:code,error:message}; }
  function validateValue(value, schema, path, depth) {
    if (depth > 10) return fail('schema_depth','Object nesting exceeds contract.');
    if (schema.type === 'object') {
      if (!plain(value)) return fail('type_mismatch',path+' must be a plain object.');
      var props=schema.properties || {}, keys=Object.getOwnPropertyNames(value), required=schema.required || [];
      for (var r=0;r<required.length;r++) if (!Object.prototype.hasOwnProperty.call(value,required[r])) return fail('missing_required_argument',path+'.'+required[r]+' is required.');
      for (var k=0;k<keys.length;k++) {
        var key=keys[k];
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') return fail('forbidden_property_name','Prototype properties are forbidden.');
        if (!Object.prototype.hasOwnProperty.call(props,key)) return fail('unexpected_argument',path+'.'+key+' is not permitted.');
        var descriptor=Object.getOwnPropertyDescriptor(value,key);
        if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor,'value')) return fail('invalid_object','Accessor properties are forbidden.');
        var result=validateValue(descriptor.value,props[key],path+'.'+key,depth+1);
        if (!result.ok) return result;
      }
    } else if (schema.type === 'string') {
      if (typeof value !== 'string') return fail('type_mismatch',path+' must be a string.');
      if (value.length > (schema.maxLength || 100000)) return fail('out_of_range',path+' is too long.');
      if (schema.minLength && value.trim().length < schema.minLength) return fail('invalid_string_length',path+' is empty.');
      if (schema.format === 'loopback_http' && !validateLoopbackUrl(value)) return fail('invalid_loopback_url','Only a fixed loopback HTTP origin is permitted.');
      if (schema.format === 'uuid' && !UUID_REGEX.test(value)) return fail('invalid_request_id','requestId must be a UUID.');
      if (schema.format === 'date-time' && (!/^\d{4}-\d\d-\d\dT/.test(value) || isNaN(Date.parse(value)))) return fail('invalid_date',path+' is invalid.');
      if (schema.pattern && !(new RegExp(schema.pattern)).test(value)) return fail('invalid_pattern',path+' has an invalid format.');
    } else if (schema.type === 'boolean') {
      if (typeof value !== 'boolean') return fail('type_mismatch',path+' must be a boolean.');
    } else if (schema.type === 'integer') {
      if (typeof value !== 'number' || !isFinite(value) || Math.floor(value) !== value) return fail('type_mismatch',path+' must be an integer.');
      if (schema.minimum !== undefined && value < schema.minimum || schema.maximum !== undefined && value > schema.maximum) return fail('out_of_range',path+' is outside its bounds.');
    }
    if (schema.enum && schema.enum.indexOf(value) < 0) return fail('invalid_enum_value',path+' has an unsupported value.');
    return {ok:true};
  }
  function validateActionArgs(def, args) {
    var result=validateValue(args,def.schema,'args',0);
    if (!result.ok) return result;
    if (def.confirmationRequired && args.confirm !== true) return fail('confirmation_required','Explicit confirm:true is required.');
    return {ok:true,args:args};
  }
  function validateEnvelope(value) {
    var outer={type:'object',additionalProperties:false,required:['protocolVersion','requestId','action','args'],properties:{
      protocolVersion:{type:'string',enum:[PROTOCOL_VERSION]}, requestId:{type:'string',format:'uuid'}, action:{type:'string'},
      args:{type:'object',properties:{}}, expectedState:{type:'object',additionalProperties:false,properties:{
        panelInstanceId:{type:'string',minLength:1}, panelLifecycleEpoch:{type:'integer',minimum:0}, panelGeneration:{type:'string',minLength:1}
      }}
    }};
    if (!plain(value)) return fail('invalid_envelope','Envelope must be a plain object.');
    var actionDescriptor=Object.getOwnPropertyDescriptor(value,'action');
    if (!actionDescriptor || !Object.prototype.hasOwnProperty.call(actionDescriptor,'value')) return fail('invalid_action_name','Action must be a data property.');
    if(typeof actionDescriptor.value !== 'string') return fail('invalid_action_name','Action must be a string.');
    var def=ACTION_INDEX[actionDescriptor.value];
    if (!def) return fail('unknown_action','Action is absent from the fixed catalog.');
    outer.properties.args=def.schema;
    var result=validateValue(value,outer,'envelope',0);
    if (!result.ok) return result;
    result=validateActionArgs(def,value.args);
    return result.ok ? {ok:true,actionDef:def,envelope:value} : result;
  }

  // Also scrub secret values embedded in diagnostics, transcript/log text and nested errors.
  var knownSecrets=[];
  function rememberSecret(value) {
    if (typeof value === 'string' && value.length && knownSecrets.indexOf(value) < 0) knownSecrets.push(value);
  }
  function safeText(value) {
    var text=String(value);
    knownSecrets.forEach(function(secret) { text=text.split(secret).join('[REDACTED]'); });
    return text.replace(/confirm_[a-f0-9]{48}/gi,'[REDACTED]')
      .replace(/\bsk-[A-Za-z0-9_-]{8,}/g,'[REDACTED]')
      .replace(/(Bearer\s+)[^\s"',;]+/gi,'$1[REDACTED]')
      .replace(/((?:api[_-]?key|panel[_-]?token|bridge[_-]?token|authorization|password|secret)\s*[=:]\s*)[^\s,;]+/gi,'$1[REDACTED]');
  }
  function deepSanitize(value,depth,seen) {
    if (depth > 10) return '[DEPTH_LIMIT]';
    if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'string') return safeText(value);
    if (typeof value !== 'object') return undefined;
    if (seen.indexOf(value) >= 0) return '[CYCLE]';
    seen=seen.concat([value]);
    if (Array.isArray(value)) return value.slice(0,200).map(function(item) {return deepSanitize(item,depth+1,seen);});
    var out={};
    Object.keys(value).slice(0,100).forEach(function(key) {
      if (/^(?:panelToken|bridgeToken|agentApiKey|apiKey|confirmationToken|confirmationTokenHash|token|accessToken|refreshToken|idToken|authToken|password|secret|clientSecret|secretKey|authorization|credentials?|auth|authentication|privateAuth|rawPreview|jsx|script|extendscript|planResult)$/i.test(key)) {
        // Catalog write-only schema descriptors contain metadata, never a credential value.
        var descriptorValue=value[key];
        if(descriptorValue && descriptorValue.type === "string" && descriptorValue.writeOnly === true &&
           Object.keys(descriptorValue).every(function(name) {return /^(type|format|writeOnly|minLength|maxLength)$/.test(name);})) {
          out[key]=deepSanitize(descriptorValue,depth+1,seen);
        }
        return;
      }
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') return;
      var descriptor=Object.getOwnPropertyDescriptor(value,key);
      if (descriptor && Object.prototype.hasOwnProperty.call(descriptor,'value')) out[key]=deepSanitize(descriptor.value,depth+1,seen);
    });
    return out;
  }
  function redactState(value) {return deepSanitize(value,0,[]);}
  function sanitizeReceipt(receipt) {
    if (!receipt) return null;
    var sanitized=redactState(receipt);
    delete sanitized.args; delete sanitized.signature;
    sanitized.replayAllowed=false;
    return sanitized;
  }
  function freezeDeep(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function(key) {freezeDeep(value[key]);});
    return Object.freeze(value);
  }
  freezeDeep(ACTION_CATALOG); freezeDeep(PIN_SCHEMA);
  return Object.freeze({
    JOURNAL_NAMESPACE:"ae-agent-core.v1", LEGACY_RESERVED_REQUEST_IDS:Object.freeze(["b7f2a79a-63ac-416f-81a4-a982280f3766"]),
    PROTOCOL_VERSION:PROTOCOL_VERSION, UUID_REGEX:UUID_REGEX, ACTION_CATALOG:ACTION_CATALOG, PIN_SCHEMA:PIN_SCHEMA,
    getActionDefinition:function(name) {return ACTION_INDEX[name] || null;}, validateEnvelope:validateEnvelope,
    getStoredActionDefinition:storedActionDefinition,
    STORED_ACTION_NAMES:Object.freeze(ACTION_CATALOG.map(function(row){return row.name;}).concat(HISTORICAL_ACTION_NAMES)),
    validateActionArgs:validateActionArgs, validateLoopbackUrl:validateLoopbackUrl,
    sanitizeReceipt:sanitizeReceipt, redactState:redactState, rememberSecret:rememberSecret
  });
});
