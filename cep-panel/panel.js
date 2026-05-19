"use strict";

(function () {
  var APP_NAME = "AE Agent";
  var APP_VERSION = "1.0.11";
  var CHAT_MODE_CHAT = "chat";
  var CHAT_MODE_AGENT = "plan";
  var CHAT_MODE_HARDCORE = "hardcore";
  var FIVE_HOUR_LIMIT_MS = 5 * 60 * 60 * 1000;
  var CONTEXT_WINDOW_TOKENS = 258000;
  var RECOVER_PLAN_TEXT = "Подхватить последний план из чата";
  var DRY_RUN_PLAN_TEXT = "Dry run / Проверить";
  var RUN_PLAN_TEXT = "Выполнить план";
  var RUNNING_PLAN_TEXT = "Выполняю...";
  var DRY_RUN_PLAN_TITLE = "Dry run: проверить план без изменений в проекте After Effects.";
  var RUN_PLAN_TITLE = "Выполнить план через защищенный runner AE Agent.";
  var M100_PROTOCOL_VERSION = "m100.v1";
  var M100_BACKEND_SOURCE = "ae-agent-bridge";
  var M100_RISK_POLICY_VERSION = "m100-risk-v1";
  var M100_RISK_LEVELS = {
    read_only: true,
    mutating: true,
    destructive: true,
    raw_jsx: true
  };

  var cs = new CSInterface();
  var appShellEl = document.getElementById("appShell");
  var titleEl = document.getElementById("appTitle");
  var versionEl = document.getElementById("appVersion");
  var statusEl = document.getElementById("status");
  var badgeEl = document.getElementById("badge");
  var logEl = document.getElementById("log");
  var urlEl = document.getElementById("bridgeUrl");
  var tokenEl = document.getElementById("bridgeToken");
  var bridgeHelpEl = document.getElementById("bridgeHelp");
  var connectButton = document.getElementById("connectButton");
  var disconnectButton = document.getElementById("disconnectButton");
  var diagnosticsButton = document.getElementById("diagnosticsButton");
  var reloadButton = document.getElementById("reloadButton");
  var collapseSidebarButton = document.getElementById("collapseSidebarButton");
  var connectorStatusButton = document.getElementById("connectorStatusButton");
  var connectorEmergencyDisableButton = document.getElementById("connectorEmergencyDisableButton");
  var connectorStatusListEl = document.getElementById("connectorStatusList");
  var providerTabEls = document.querySelectorAll(".provider-tab");
  var authModeTabsEl = document.getElementById("authModeTabs");
  var authModeButtonEls = document.querySelectorAll("#authModeTabs button");
  var agentSetupCardEl = document.getElementById("agentSetupCard");
  var agentSetupTitleEl = document.getElementById("agentSetupTitle");
  var agentSetupTextEl = document.getElementById("agentSetupText");
  var agentSetupActionButton = document.getElementById("agentSetupActionButton");
  var localServiceCardEl = document.getElementById("localServiceCard");
  var detectLocalButton = document.getElementById("detectLocalButton");
  var localStatusEl = document.getElementById("localStatus");
  var agentSelect = document.getElementById("agentSelect");
  var agentModelEl = document.getElementById("agentModel");
  var agentModelListEl = document.getElementById("agentModelList");
  var agentDetailsEl = document.getElementById("agentDetails");
  var agentApiKeyRowEl = document.getElementById("agentApiKeyRow");
  var agentApiKeyEl = document.getElementById("agentApiKey");
  var freeModelsRowEl = document.getElementById("freeModelsRow");
  var freeModelsOnlyEl = document.getElementById("freeModelsOnly");
  var agentStatusEl = document.getElementById("agentStatus");
  var refreshAgentsButton = document.getElementById("refreshAgentsButton");
  var checkAgentButton = document.getElementById("checkAgentButton");
  var saveAgentKeyButton = document.getElementById("saveAgentKeyButton");
  var providerSelfTestButton = document.getElementById("providerSelfTestButton");
  var providerSelfTestListEl = document.getElementById("providerSelfTestList");
  var chatTranscriptEl = document.getElementById("chatTranscript");
  var chatPromptEl = document.getElementById("chatPrompt");
  var sendChatButton = document.getElementById("sendChatButton");
  var planRunStatusEl = document.getElementById("planRunStatus");
  var recoverLastPlanButton = document.getElementById("recoverLastPlanButton");
  var dryRunPlanButton = document.getElementById("dryRunPlanButton");
  var runPlanButton = document.getElementById("runPlanButton");
  var prepareDevRequestButton = document.getElementById("prepareDevRequestButton");
  var chatHistorySelect = document.getElementById("chatHistorySelect");
  var newChatButton = document.getElementById("newChatButton");
  var clearChatButton = document.getElementById("clearChatButton");
  var chatModeEl = document.getElementById("chatMode");
  var chatModeButtonEls = document.querySelectorAll("#chatModeTabs button");
  var promptOptimizationEl = document.getElementById("promptOptimization");
  var workflowPresetSelect = document.getElementById("workflowPresetSelect");
  var applyWorkflowPresetButton = document.getElementById("applyWorkflowPresetButton");

  var running = false;
  var pollTimer = null;
  var pollInFlight = false;
  var activeEvalScriptCommandId = "";
  var agents = [];
  var chatSessions = [];
  var activeChatSessionId = "";
  var chatMessages = [];
  var transcriptHistory = [];
  var transcriptRestoring = false;
  var chatInFlight = false;
  var chatWorkingEl = null;
  var keySaveInFlight = false;
  var setupActionInFlight = false;
  var readinessInFlight = false;
  var providerSelfTestInFlight = false;
  var devRequestInFlight = false;
  var providerSelfTestResults = {};
  var connectorStatusInFlight = false;
  var connectorStatus = null;
  var renderedAgentId = "";
  var agentsLoadSeq = 0;
  var agentsLoadInFlight = false;
  var agentDataVersion = 0;
  var lastPlanResult = null;
  var lastPlanRunResult = null;
  var lastAcceptedDryRun = null;
  var planRunInFlightMode = "";
  var inlinePlanActionRows = [];
  var operationUsageReports = [];
  var usageWindowStartedAt = Number(localStorage.getItem("codexAeUsageWindowStartedAt") || "0") || 0;
  var lastPollErrorMessage = "";
  var panelConnectionId = loadPanelConnectionId();
  var panelConnectionGeneration = 0;
  var setupStatusTimer = null;
  var setupStatusUntil = 0;
  var BRIDGE_OFFLINE_MESSAGE = "Bridge offline. Start the local bridge from Codex, then click Connect.";
  var CONNECTOR_BASE_URL = "http://127.0.0.1:8787";
  var PROVIDER_SELF_TESTS = [
    { key: "openai-api", label: "OpenAI API", agentId: "openai-api" },
    { key: "openai-cli", label: "OpenAI CLI", agentId: "openai-cli" },
    { key: "gemini-api", label: "Gemini", agentId: "gemini-api" },
    { key: "claude-api", label: "Claude", agentId: "claude-api" },
    { key: "openrouter", label: "OpenRouter", agentId: "openrouter" },
    { key: "ollama-local", label: "Local/Ollama", agentId: "ollama-local" }
  ];
  var WORKFLOW_PRESETS = [
    {
      id: "selected-layer-timing",
      label: "Selected layers: timing",
      prompt: "Create a safe Agent plan for the active composition that reads the selected layers, aligns them to the current time indicator, sets a clean in/out time range, staggers multiple selected layers with a small overlap, and verifies the final selected-layer timing. Prefer typed AE Agent tools such as get_active_comp, get_selected_layers, align_layers_to_time, set_layer_time_range, and stagger_layers. Do not use raw ExtendScript unless no typed tool fits."
    },
    {
      id: "precompose-rename",
      label: "Precompose and rename",
      prompt: "Create a safe Agent plan that reads the active composition and selected layers, precomposes the selected layers into a clearly named precomp, renames the resulting layer and related project items with a consistent prefix, and verifies the new precomp/source relationship. Prefer typed AE Agent tools such as get_active_comp, get_selected_layers, precompose_layers, rename_layers, rename_project_items, and get_comp_details. Ask one clarifying question if the new name is not obvious."
    },
    {
      id: "text-shape-layout",
      label: "Text and shape layout",
      prompt: "Create a safe Agent plan for the active composition that updates or creates a text layer, adds a simple rectangle or ellipse shape layer behind it, fits or positions the selected visual layer cleanly inside the comp, and verifies the created or changed layers. Prefer typed AE Agent tools such as get_active_comp, get_selected_layers, update_text_layer, create_shape_layer, fit_layer_to_comp, and get_comp_details. Do not use raw ExtendScript unless no typed tool fits."
    },
    {
      id: "basic-animation",
      label: "Basic animation",
      prompt: "Create a safe Agent plan for the active composition that reads the selected layers, adds simple transform keyframes for a short entrance animation, applies temporal easing, and verifies the animated properties. Prefer typed AE Agent tools such as get_active_comp, get_selected_layers, set_property_keyframes, apply_keyframe_ease, set_expression, clear_expression, and get_comp_details. Keep the animation modest and ask a clarifying question if direction, timing, or property choices are unclear."
    },
    {
      id: "replace-source",
      label: "Replace source",
      prompt: "Create a safe Agent plan that reads the active composition and selected layers, finds the intended replacement footage or precomp item by name, replaces the selected layer source while preserving transforms, and verifies the replacement. Prefer typed AE Agent tools such as get_active_comp, get_selected_layers, find_project_items, replace_layer_source, and get_comp_details. Ask one clarifying question if the replacement item name is ambiguous."
    }
  ];

  function setAppTitle(version) {
    var normalizedVersion = version || APP_VERSION;
    var title = APP_NAME + " " + normalizedVersion.replace(/^v/i, "");
    document.title = title;
    try {
      if (window.__adobe_cep__ && typeof window.__adobe_cep__.invokeSync === "function") {
        window.__adobe_cep__.invokeSync("setWindowTitle", title);
      }
    } catch (_titleError) {}
    if (titleEl) titleEl.textContent = APP_NAME;
    if (versionEl) versionEl.textContent = normalizedVersion.replace(/^v/i, "");
  }

  function log(message) {
    var at = new Date().toLocaleTimeString();
    logEl.textContent = "[" + at + "] " + message + "\n" + logEl.textContent;
  }

  function setStatus(text, online) {
    statusEl.textContent = text;
    badgeEl.textContent = online ? "online" : "offline";
    badgeEl.className = online ? "online" : "";
  }

  function setBridgeHelp(text, tone) {
    if (!bridgeHelpEl) return;
    bridgeHelpEl.textContent = text || "";
    bridgeHelpEl.className = "bridge-help" + (tone ? " " + tone : "");
  }

  function makeBridgeOfflineError(message) {
    var diagnostic = {
      phase: "bridge_offline",
      code: "bridge_offline",
      message: message || BRIDGE_OFFLINE_MESSAGE
    };
    var error = new Error(formatM100DiagnosticBody({ diagnostic: diagnostic }, diagnostic.message));
    error.status = 0;
    error.bridgeOffline = true;
    error.diagnostic = diagnostic;
    return error;
  }

  function isBridgeOfflineError(error) {
    if (!error) return false;
    if (error.bridgeOffline || error.status === 0) return true;
    return /^(HTTP 0|Network error|Network timeout)/i.test(error.message || "");
  }

  function friendlyErrorMessage(error) {
    if (isBridgeOfflineError(error)) return BRIDGE_OFFLINE_MESSAGE;
    return error && error.message ? error.message : "Unknown error";
  }

  function setBridgeOffline(error) {
    var message = friendlyErrorMessage(error);
    setStatus("Bridge offline", false);
    setBridgeHelp(message, "warning");
    return message;
  }

  function setBridgeConnected() {
    setStatus("Connected", true);
    setBridgeHelp("Bridge connected.", "online");
  }

  function getBaseUrl() {
    return urlEl.value.replace(/\/+$/, "");
  }

  function getToken() {
    return tokenEl.value;
  }

  function makePanelConnectionId() {
    return "panel-" + String(Date.now()) + "-" + String(Math.random()).slice(2);
  }

  function loadPanelConnectionId() {
    var existing = localStorage.getItem("codexAePanelConnectionId") || "";
    if (existing) return existing;
    var created = makePanelConnectionId();
    localStorage.setItem("codexAePanelConnectionId", created);
    return created;
  }

  function bridgeNextPath() {
    return "/bridge/next?panelConnectionId=" + encodeURIComponent(panelConnectionId)
      + "&panelGeneration=" + encodeURIComponent(String(panelConnectionGeneration || 0));
  }

  function appendToken(path) {
    var separator = path.indexOf("?") === -1 ? "?" : "&";
    return path + separator + "token=" + encodeURIComponent(getToken());
  }

  function compactPanelDiagnosticText(value, limit) {
    var text = String(value || "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "");
    var max = Math.max(1, Number(limit || 1000));
    return text.length > max ? text.slice(0, max - 1) + "..." : text;
  }

  function diagnosticFromBody(body) {
    if (!body || typeof body !== "object") return null;
    if (body.diagnostic && typeof body.diagnostic === "object") return body.diagnostic;
    if (body.run && body.run.diagnostic && typeof body.run.diagnostic === "object") return body.run.diagnostic;
    if (body.m100Message && body.m100Message.error && typeof body.m100Message.error === "object") {
      return body.m100Message.error;
    }
    if (body.run && body.run.m100Message && body.run.m100Message.error && typeof body.run.m100Message.error === "object") {
      return body.run.m100Message.error;
    }
    return null;
  }

  function formatM100DiagnosticBody(body, fallback) {
    var diagnostic = diagnosticFromBody(body);
    if (!diagnostic) return fallback;
    var envelope = body && body.m100Message ? body.m100Message : (body && body.run && body.run.m100Message ? body.run.m100Message : null);
    var phase = compactPanelDiagnosticText(diagnostic.phase || body.phase || "unknown", 80);
    var code = compactPanelDiagnosticText(diagnostic.code || body.code || "", 120);
    var message = compactPanelDiagnosticText(diagnostic.message || body.error || fallback || "Request failed.", 1000);
    var lines = [];
    lines.push("Failure phase: " + phase + (code ? " / " + code : ""));
    if (diagnostic.requestId || body.requestId || envelope && envelope.requestId) lines.push("Request: " + compactPanelDiagnosticText(diagnostic.requestId || body.requestId || envelope.requestId, 120));
    if (diagnostic.actionId || body.actionId || envelope && envelope.actionId) lines.push("Action: " + compactPanelDiagnosticText(diagnostic.actionId || body.actionId || envelope.actionId, 120));
    if (diagnostic.executionId || body.executionId || envelope && envelope.executionId) lines.push("Execution: " + compactPanelDiagnosticText(diagnostic.executionId || body.executionId || envelope.executionId, 120));
    if (diagnostic.commandId || body.commandId) lines.push("Command: " + compactPanelDiagnosticText(diagnostic.commandId || body.commandId, 120));
    lines.push("Detail: " + message);
    if (diagnostic.rawPreview) lines.push("Preview: " + compactPanelDiagnosticText(diagnostic.rawPreview, 500));
    if (diagnostic.logRef) lines.push("Log: " + compactPanelDiagnosticText(diagnostic.logRef, 240));
    return lines.join("\n");
  }

  function request(method, path, body, onDone) {
    var completed = false;
    var xhr = new XMLHttpRequest();
    xhr.open(method, getBaseUrl() + appendToken(path), true);
    xhr.timeout = path.indexOf("/agents/chat") === 0 || path.indexOf("/agents/plan") === 0 || path.indexOf("/agents/hardcore") === 0 ? 120000 : 10000;
    if (body !== null && body !== undefined) {
      xhr.setRequestHeader("content-type", "text/plain;charset=utf-8");
    }
    function finish(error, response) {
      if (completed) return;
      completed = true;
      onDone(error, response);
    }
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status < 200 || xhr.status >= 300) {
        var errorMessage = xhr.status === 0 ? BRIDGE_OFFLINE_MESSAGE : "HTTP " + xhr.status + ": " + xhr.responseText;
        var errorBody = null;
        try {
          errorBody = xhr.responseText ? JSON.parse(xhr.responseText) : null;
          if (errorBody) {
            errorMessage = formatM100DiagnosticBody(errorBody, errorBody.error || (errorBody.run && errorBody.run.error) || errorMessage);
          }
        } catch (_parseError) {}
        if (xhr.status === 0 && !errorBody) {
          errorBody = {
            diagnostic: {
              phase: "bridge_offline",
              code: "bridge_offline",
              message: BRIDGE_OFFLINE_MESSAGE
            }
          };
          errorMessage = formatM100DiagnosticBody(errorBody, BRIDGE_OFFLINE_MESSAGE);
        }
        var requestError = new Error(errorMessage);
        requestError.status = xhr.status;
        requestError.body = errorBody;
        requestError.diagnostic = diagnosticFromBody(errorBody);
        if (xhr.status === 0) requestError.bridgeOffline = true;
        finish(requestError);
        return;
      }
      try {
        finish(null, xhr.responseText ? JSON.parse(xhr.responseText) : {});
      } catch (error) {
        finish(error);
      }
    };
    xhr.onerror = function () {
      finish(makeBridgeOfflineError());
    };
    xhr.ontimeout = function () {
      finish(makeBridgeOfflineError());
    };
    xhr.send(body !== null && body !== undefined ? JSON.stringify(body) : null);
  }

  function refreshAppTitle() {
    request("GET", "/health", null, function (error, response) {
      if (error || !response || !response.version) return;
      setAppTitle(response.version);
    });
  }

  function setAgentStatus(text) {
    agentStatusEl.textContent = text;
  }

  function trimText(value) {
    return String(value || "").replace(/^\s+|\s+$/g, "");
  }

  function selectedModel() {
    return trimText(agentModelEl.value);
  }

  function findAgent(id) {
    for (var i = 0; i < agents.length; i++) {
      if (agents[i].id === id) return agents[i];
    }
    return null;
  }

  function clearElement(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function forEachNode(nodes, callback) {
    for (var i = 0; i < nodes.length; i++) callback(nodes[i], i);
  }

  function toggleClass(el, className, enabled) {
    if (!el) return;
    if (el.classList) {
      if (enabled) el.classList.add(className);
      else el.classList.remove(className);
      return;
    }
    var current = " " + el.className + " ";
    var token = " " + className + " ";
    var hasClass = current.indexOf(token) >= 0;
    if (enabled && !hasClass) {
      el.className = (el.className + " " + className).replace(/^\s+|\s+$/g, "");
    } else if (!enabled && hasClass) {
      el.className = current.replace(token, " ").replace(/^\s+|\s+$/g, "");
    }
  }

  function getData(el, name) {
    if (!el) return "";
    if (el.getAttribute) return el.getAttribute("data-" + name) || "";
    return "";
  }

  function getConnectorBaseUrl() {
    return (localStorage.getItem("codexAeChatGptConnectorUrl") || CONNECTOR_BASE_URL).replace(/\/+$/, "");
  }

  function connectorRequest(method, path, body, onDone) {
    var completed = false;
    var xhr = new XMLHttpRequest();
    xhr.open(method, getConnectorBaseUrl() + path, true);
    xhr.timeout = 3000;
    if (body !== null && body !== undefined) {
      xhr.setRequestHeader("content-type", "text/plain;charset=utf-8");
    }
    function finish(error, response) {
      if (completed) return;
      completed = true;
      onDone(error, response);
    }
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status < 200 || xhr.status >= 300) {
        finish(new Error(xhr.status === 0 ? "Connector offline" : "HTTP " + xhr.status));
        return;
      }
      try {
        finish(null, xhr.responseText ? JSON.parse(xhr.responseText) : {});
      } catch (error) {
        finish(error);
      }
    };
    xhr.onerror = function () {
      finish(new Error("Connector offline"));
    };
    xhr.ontimeout = function () {
      finish(new Error("Connector offline"));
    };
    xhr.send(body !== null && body !== undefined ? JSON.stringify(body) : null);
  }

  function connectorToolSummary(status) {
    var connector = status && status.connector ? status.connector : {};
    var tools = connector.exposedToolsSnapshot || [];
    var localTools = [];
    for (var i = 0; i < tools.length; i++) {
      if (!tools[i].bridgeProxy) localTools.push(tools[i].name);
    }
    if (!localTools.length && connector.candidateTools) localTools = connector.candidateTools;
    var shown = localTools.slice(0, 4).join(", ");
    return shown + (tools.length ? " (" + tools.length + " total)" : "");
  }

  function connectorLastCallSummary(status) {
    var call = status && status.connector ? status.connector.lastToolCall : null;
    if (!call) return "None";
    return call.name + " " + (call.ok ? "ok" : "failed");
  }

  function setConnectorRows(rows) {
    if (!connectorStatusListEl) return;
    clearElement(connectorStatusListEl);
    for (var i = 0; i < rows.length; i++) {
      var row = document.createElement("div");
      row.className = "connector-status-row" + (rows[i].tone ? " " + rows[i].tone : "");
      row.setAttribute("data-connector-status", rows[i].key);
      var label = document.createElement("span");
      label.className = "connector-status-label";
      label.textContent = rows[i].label;
      var value = document.createElement("span");
      value.className = "connector-status-value";
      value.textContent = rows[i].value;
      row.appendChild(label);
      row.appendChild(value);
      connectorStatusListEl.appendChild(row);
    }
  }

  function renderConnectorStatus() {
    var status = connectorStatus;
    if (!status) {
      setConnectorRows([
        { key: "state", label: "State", value: "Not checked", tone: "" },
        { key: "endpoint", label: "Endpoint", value: getConnectorBaseUrl(), tone: "" },
        { key: "writes", label: "Writes", value: "Unknown", tone: "" }
      ]);
      if (connectorEmergencyDisableButton) connectorEmergencyDisableButton.disabled = true;
      return;
    }
    var connector = status.connector || {};
    var online = connector.connected !== false;
    var tunnel = connector.publicUrlConfigured ? "Tunnel " + (connector.publicUrlOrigin || "configured") : "Local only";
    var writes = connector.emergencyDisabled ? "Emergency disabled" : (connector.writeActionsEnabled ? "Enabled" : "Disabled");
    setConnectorRows([
      { key: "state", label: "State", value: online ? "Connected" : "Offline", tone: online ? "ready" : "error" },
      { key: "endpoint", label: "Endpoint", value: tunnel, tone: connector.publicUrlConfigured ? "warning" : "" },
      { key: "tools", label: "Tools", value: connectorToolSummary(status), tone: "" },
      { key: "last", label: "Last call", value: connectorLastCallSummary(status), tone: "" },
      { key: "writes", label: "Writes", value: writes, tone: connector.writeActionsEnabled ? "warning" : "" },
      { key: "emergency", label: "Emergency", value: connector.emergencyDisabled ? "Active" : "Ready", tone: connector.emergencyDisabled ? "error" : "" }
    ]);
    if (connectorEmergencyDisableButton) connectorEmergencyDisableButton.disabled = connectorStatusInFlight || !online || connector.emergencyDisabled;
  }

  function refreshConnectorStatus() {
    if (connectorStatusInFlight) return;
    connectorStatusInFlight = true;
    if (connectorStatusButton) connectorStatusButton.textContent = "Checking...";
    if (connectorEmergencyDisableButton) connectorEmergencyDisableButton.disabled = true;
    connectorRequest("GET", "/status?checkBridge=0", null, function (error, response) {
      connectorStatusInFlight = false;
      if (connectorStatusButton) connectorStatusButton.textContent = "Refresh";
      if (error) {
        connectorStatus = {
          connector: {
            connected: false,
            publicUrlConfigured: false,
            exposedToolsSnapshot: [],
            lastToolCall: null,
            writeActionsEnabled: false,
            emergencyDisabled: false
          }
        };
        renderConnectorStatus();
        return;
      }
      connectorStatus = response && response.status ? response.status : null;
      renderConnectorStatus();
    });
  }

  function emergencyDisableConnector() {
    if (connectorStatusInFlight) return;
    connectorStatusInFlight = true;
    connectorEmergencyDisableButton.disabled = true;
    connectorEmergencyDisableButton.textContent = "Disabling...";
    connectorRequest("POST", "/emergency-disable", {}, function (error, response) {
      connectorStatusInFlight = false;
      connectorEmergencyDisableButton.textContent = "Disable writes";
      if (error) {
        log("Could not disable connector writes: " + error.message);
        renderConnectorStatus();
        return;
      }
      connectorStatus = response && response.status ? response.status : connectorStatus;
      renderConnectorStatus();
    });
  }

  function optionLabel(agent) {
    var label = agent.label || agent.id;
    if (!agent.configured) return label + " (needs setup)";
    if (agent.reachable === false) return label + " (offline)";
    return label;
  }

  function addOption(parent, value, text) {
    var option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    parent.appendChild(option);
  }

  function addAgentDetail(label, value) {
    var item = document.createElement("span");
    item.textContent = label + ": " + (value || "-");
    agentDetailsEl.appendChild(item);
  }

  function compactUrl(value) {
    var text = String(value || "");
    return text.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  }

  function modelSourceLabel(value) {
    if (value === "remote_list") return "remote list";
    if (value === "openrouter_router") return "OpenRouter router";
    if (value === "empty_remote_list") return "empty remote list";
    if (value === "not_checked") return "not checked";
    if (value === "static_list") return "configured list";
    return value || "configured list";
  }

  function readinessLabel(agent) {
    if (!agent) return "not loaded";
    if (!agent.configured) return agent.requiresApiKey ? "needs API key" : "needs setup";
    if (agent.canChat === false && agent.status) return agent.status;
    if (agent.reachable === false) return "offline";
    if (agent.modelAvailable === false) return "model unavailable";
    if (agent.canChat === true) return "ready";
    return agent.status || "not checked";
  }

  function agentGroup(agent) {
    if (!agent) return "";
    if (agent.providerGroup) return agent.providerGroup;
    if (agent.provider === "ollama" || agent.provider === "ollama-cloud") return "local";
    return agent.provider || "";
  }

  function openAiAuthMode() {
    var saved = localStorage.getItem("codexAeOpenAiAuthMode") || "cli";
    return saved === "api" ? "api" : "cli";
  }

  function isPlaceholderProviderGroup(group) {
    return group === "gemini" || group === "claude";
  }

  function providerLabelForGroup(group) {
    if (group === "gemini") return "Gemini";
    if (group === "claude") return "Claude";
    if (group === "openrouter") return "OpenRouter";
    if (group === "local") return "Local";
    return "OpenAI";
  }

  function placeholderAgentForGroup(group) {
    return {
      id: group + "-placeholder",
      label: providerLabelForGroup(group),
      provider: group,
      providerGroup: group,
      authMode: "setup",
      transport: "setup",
      configured: false,
      requiresApiKey: false,
      canChat: false,
      placeholder: true,
      modelSource: "not_checked",
      status: "unavailable",
      notes: providerLabelForGroup(group) + " provider is not available from this bridge session."
    };
  }

  function visibleAgent(agent) {
    var group = agentGroup(agent);
    return group === "openai" || group === "local" || group === "gemini" || group === "claude" || group === "openrouter";
  }

  function findAgentByGroup(group) {
    if (group === "openai") {
      var mode = openAiAuthMode();
      return findAgent(mode === "api" ? "openai-api" : "openai-cli") || findAgent("openai-cli") || findAgent("openai-api");
    }
    if (group === "gemini") return findAgent("gemini-api");
    if (group === "claude") return findAgent("claude-api");
    if (group === "openrouter") return findAgent("openrouter");
    if (group === "local") return findAgent("ollama-local");
    return null;
  }

  function selfTestSpecForAgentId(agentId) {
    for (var i = 0; i < PROVIDER_SELF_TESTS.length; i++) {
      if (PROVIDER_SELF_TESTS[i].agentId === agentId) return PROVIDER_SELF_TESTS[i];
    }
    return null;
  }

  function firstModelId(items) {
    if (!items || !items.length) return "";
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var id = typeof item === "string" ? item : item && (item.id || item.name);
      if (id) return id;
    }
    return "";
  }

  function selfTestModel(agent) {
    if (!agent) return "";
    return localStorage.getItem("codexAeAgentModel:" + agent.id) ||
      agent.model ||
      firstModelId(agent.modelOptions) ||
      firstModelId(agent.models) ||
      "";
  }

  function shortDetail(value, maxLength) {
    var text = trimText(value);
    var limit = maxLength || 180;
    if (text.length <= limit) return text;
    return text.slice(0, Math.max(0, limit - 1)) + "...";
  }

  function commandStatusSummary(check, okLabel, failLabel) {
    if (!check) return "";
    var ok = check.status === 0;
    var label = ok ? okLabel : failLabel;
    var output = shortDetail(check.output || check.errorMessage || check.errorCode || "", 80);
    return label + (output ? " (" + output + ")" : "");
  }

  function codexSelfTestDetail(status) {
    if (!status) return "";
    var parts = [];
    if (status.installed === false) {
      parts.push("Codex CLI not found");
    } else if (status.loggedIn) {
      parts.push("ChatGPT signed in");
    } else {
      parts.push("ChatGPT sign-in needed");
    }
    if (status.version) parts.push(status.version);
    var versionCheck = commandStatusSummary(status.versionCheck, "version ok", "version check failed");
    var loginCheck = commandStatusSummary(status.loginStatusCheck, "login ok", "login status failed");
    if (versionCheck) parts.push(versionCheck);
    if (loginCheck) parts.push(loginCheck);
    if (status.error) parts.push(shortDetail(status.error, 80));
    return parts.join(" - ");
  }

  function selfTestToneForReadiness(readiness) {
    if (!readiness) return "";
    if (readiness.canChat === true) return "ready";
    if (readiness.configured === false || readiness.status === "missing_auth" || readiness.status === "model_unavailable") return "warning";
    return "error";
  }

  function selfTestStatusForReadiness(readiness) {
    if (!readiness) return "Not checked";
    if (readiness.canChat === true) return "Ready";
    if (readiness.configured === false || readiness.status === "missing_auth") return "Setup";
    if (readiness.status === "model_unavailable") return "Model missing";
    if (readiness.reachable === false) return "Offline";
    return readiness.status || "Blocked";
  }

  function selfTestDetailFromReadiness(agent, readiness) {
    if (!readiness) return "";
    var responseAgent = readiness.agent || agent || {};
    var providerError = readiness.providerError || responseAgent.providerError || null;
    var detail = "";
    if (readiness.canChat === true) {
      detail = "Model " + (readiness.model || selfTestModel(agent) || "-") + " ready";
      if (typeof readiness.modelCount === "number") {
        detail += " - " + readiness.modelCount + " models";
      }
      if (readiness.modelSource) {
        detail += " / " + modelSourceLabel(readiness.modelSource);
      }
    } else if (providerError && providerError.code === "missing_auth" && responseAgent.apiKeyEnv) {
      detail = "Needs " + responseAgent.apiKeyEnv + "; key value is hidden.";
    } else if (readiness.error) {
      detail = readiness.error;
    } else if (providerError && providerError.message) {
      detail = providerError.message;
    } else {
      detail = readiness.status || "Provider is not ready.";
    }

    if (responseAgent.id === "openai-cli") {
      var cliDetail = codexSelfTestDetail(responseAgent.codexStatus);
      if (cliDetail) detail = detail ? detail + " - " + cliDetail : cliDetail;
    }
    return shortDetail(detail, 220);
  }

  function selfTestResultFromReadiness(spec, agent, readiness) {
    return {
      key: spec.key,
      label: spec.label,
      status: selfTestStatusForReadiness(readiness),
      tone: selfTestToneForReadiness(readiness),
      detail: selfTestDetailFromReadiness(agent, readiness)
    };
  }

  function baselineSelfTestResult(spec) {
    var agent = findAgent(spec.agentId);
    if (!agent) {
      return {
        key: spec.key,
        label: spec.label,
        status: "Missing",
        tone: "warning",
        detail: "Provider contract is not available from this bridge session."
      };
    }
    if (!agent.configured) {
      return {
        key: spec.key,
        label: spec.label,
        status: "Setup",
        tone: "warning",
        detail: agent.requiresApiKey ? "Needs " + (agent.apiKeyEnv || "API key") + "; key value is hidden." : setupTextForAgent(agent)
      };
    }
    if (agent.canChat === true) {
      return {
        key: spec.key,
        label: spec.label,
        status: "Ready",
        tone: "ready",
        detail: "Last check passed for " + (selfTestModel(agent) || agent.model || "selected model") + "."
      };
    }
    if (agent.canChat === false) {
      return {
        key: spec.key,
        label: spec.label,
        status: readinessLabel(agent),
        tone: agent.reachable === false ? "error" : "warning",
        detail: shortDetail(agent.error || setupTextForAgent(agent) || "Provider is not ready.", 220)
      };
    }
    return {
      key: spec.key,
      label: spec.label,
      status: "Not checked",
      tone: "",
      detail: "Checks setup and model availability for " + (selfTestModel(agent) || "the default model") + "."
    };
  }

  function renderProviderSelfTest() {
    if (!providerSelfTestListEl) return;
    clearElement(providerSelfTestListEl);
    for (var i = 0; i < PROVIDER_SELF_TESTS.length; i++) {
      var spec = PROVIDER_SELF_TESTS[i];
      var result = providerSelfTestResults[spec.key] || baselineSelfTestResult(spec);
      var row = document.createElement("div");
      row.className = "self-test-row" + (result.tone ? " " + result.tone : "");
      row.setAttribute("data-self-test", spec.key);

      var label = document.createElement("span");
      label.className = "self-test-label";
      label.textContent = spec.label;
      row.appendChild(label);

      var state = document.createElement("span");
      state.className = "self-test-state";
      state.textContent = result.status || "Not checked";
      row.appendChild(state);

      var detail = document.createElement("span");
      detail.className = "self-test-detail";
      detail.textContent = result.detail || "";
      row.appendChild(detail);

      providerSelfTestListEl.appendChild(row);
    }
    updateProviderSelfTestButton();
  }

  function setProviderSelfTestResult(agentId, result) {
    var spec = selfTestSpecForAgentId(agentId);
    if (!spec) return;
    providerSelfTestResults[spec.key] = result;
    renderProviderSelfTest();
  }

  function providerReadinessPath(agent, model) {
    return "/agents/readiness?agentId=" + encodeURIComponent(agent.id) +
      "&model=" + encodeURIComponent(model) +
      "&checkModels=1&freeOnly=" + (freeModelsOnlyEl.checked ? "1" : "0");
  }

  function runProviderSelfTestAt(index) {
    if (index >= PROVIDER_SELF_TESTS.length) {
      providerSelfTestInFlight = false;
      setAgentStatus("Provider self-test complete");
      updateProviderSelfTestButton();
      updateChatAvailability();
      updateKeyAvailability();
      return;
    }

    var spec = PROVIDER_SELF_TESTS[index];
    var agent = findAgent(spec.agentId);
    if (!agent) {
      providerSelfTestResults[spec.key] = baselineSelfTestResult(spec);
      renderProviderSelfTest();
      runProviderSelfTestAt(index + 1);
      return;
    }

    var model = selfTestModel(agent);
    if (!model) {
      providerSelfTestResults[spec.key] = {
        key: spec.key,
        label: spec.label,
        status: "No model",
        tone: "warning",
        detail: "Choose or configure a model before testing this provider."
      };
      renderProviderSelfTest();
      runProviderSelfTestAt(index + 1);
      return;
    }

    providerSelfTestResults[spec.key] = {
      key: spec.key,
      label: spec.label,
      status: "Checking",
      tone: "",
      detail: "Testing " + model + "..."
    };
    renderProviderSelfTest();
    request("GET", providerReadinessPath(agent, model), null, function (error, response) {
      if (error) {
        providerSelfTestResults[spec.key] = {
          key: spec.key,
          label: spec.label,
          status: isBridgeOfflineError(error) ? "Bridge offline" : "Error",
          tone: "error",
          detail: friendlyErrorMessage(error)
        };
      } else {
        var readiness = response && response.readiness ? response.readiness : null;
        mergeReadiness(agent, readiness);
        providerSelfTestResults[spec.key] = selfTestResultFromReadiness(spec, agent, readiness);
        if (agent.id === agentSelect.value) {
          updateModelList(agent);
          setAgentDetails(agent);
          updateProviderUi(agent);
        }
      }
      renderProviderSelfTest();
      runProviderSelfTestAt(index + 1);
    });
  }

  function runProviderSelfTest() {
    if (providerSelfTestInFlight || readinessInFlight || chatInFlight) return;
    providerSelfTestInFlight = true;
    providerSelfTestResults = {};
    setAgentStatus("Testing providers...");
    updateProviderSelfTestButton();
    renderProviderSelfTest();
    runProviderSelfTestAt(0);
  }

  function updateProviderSelfTestButton() {
    if (!providerSelfTestButton) return;
    providerSelfTestButton.textContent = providerSelfTestInFlight ? "Testing..." : "Test";
    providerSelfTestButton.disabled = chatInFlight || readinessInFlight || providerSelfTestInFlight || !agents.length;
  }

  function selectAgent(agentId) {
    if (!findAgent(agentId)) return;
    agentSelect.value = agentId;
    localStorage.setItem("codexAeAgentId", agentId);
    updateSelectedAgent();
  }

  function selectProviderGroup(group) {
    var agent = findAgentByGroup(group);
    if (!agent && isPlaceholderProviderGroup(group)) {
      localStorage.setItem("codexAeProviderGroup", group);
      agentSelect.value = "";
      renderProviderPlaceholder(group);
      return;
    }
    if (!agent) {
      setAgentStatus(group === "local" ? "Ollama provider not available" : "Provider not configured");
      return;
    }
    localStorage.setItem("codexAeProviderGroup", group);
    selectAgent(agent.id);
  }

  function renderProviderPlaceholder(group) {
    var agent = placeholderAgentForGroup(group);
    renderedAgentId = "";
    clearElement(agentModelEl);
    clearElement(agentModelListEl);
    agentApiKeyRowEl.style.display = "none";
    agentApiKeyEl.value = "";
    freeModelsRowEl.style.display = "none";
    setAgentDetails(agent);
    updateProviderUi(agent);
    setAgentStatus(providerLabelForGroup(group) + " provider unavailable");
    renderProviderSelfTest();
    updateChatAvailability();
    updateKeyAvailability();
  }

  function setupTitleForAgent(agent) {
    if (!agent) return "ChatGPT via Codex CLI";
    if (agent.placeholder) return agent.label + " setup";
    if (agent.id === "openai-cli") return "ChatGPT via Codex CLI";
    if (agent.id === "openai-api") return "OpenAI API key";
    if (agent.id === "gemini-api") return "Gemini API key";
    if (agent.id === "claude-api") return "Claude API key";
    if (agent.id === "openrouter") return "OpenRouter API key";
    if (agentGroup(agent) === "local") return "Local Ollama";
    return agent.label || "Provider setup";
  }

  function setupTextForAgent(agent) {
    if (!agent) return "Connect the bridge to load provider readiness. CLI mode uses codex login and does not use an OpenAI API key.";
    if (agent.placeholder) return agent.label + " is visible in the panel, but this bridge session did not expose its provider contract.";
    if (agent.id === "openai-cli") {
      if (agent.codexStatus && agent.codexStatus.loggedIn) return "Codex CLI is signed in with ChatGPT. API keys are not used in this mode.";
      if (agent.codexStatus && !agent.codexStatus.installed) return "Codex CLI was not found. Install Codex, then run codex login.";
      return "Sign in with ChatGPT through Codex CLI, then use CLI models here. No OpenAI API key is used.";
    }
    if (agent.id === "openai-api") return "Uses OpenAI API billing. Paste an API key to enable API models.";
    if (agent.id === "gemini-api") return "Uses Google Gemini API billing. Paste an API key to enable Gemini models.";
    if (agent.id === "claude-api") return "Uses Anthropic API billing. Paste an API key to enable Claude models.";
    if (agent.id === "openrouter") return "Uses OpenRouter API billing. Paste an API key to enable OpenRouter models, including :free variants and the openrouter/free router.";
    if (agentGroup(agent) === "local") return "Runs with Ollama on port 11434. No API key needed.";
    return agent.notes || "";
  }

  function updateSetupActionAvailability(agent) {
    if (!agentSetupActionButton) return;
    var show = agent && agent.id === "openai-cli";
    agentSetupActionButton.style.display = show ? "" : "none";
    if (!show) {
      agentSetupActionButton.disabled = true;
      return;
    }

    var status = agent.codexStatus || {};
    if (status.loggedIn) {
      agentSetupActionButton.textContent = "Signed in";
      agentSetupActionButton.disabled = true;
    } else if (status.installed === false) {
      agentSetupActionButton.textContent = setupActionInFlight ? "Checking CLI..." : "Retry CLI check";
      agentSetupActionButton.disabled = setupActionInFlight || chatInFlight || readinessInFlight;
    } else {
      agentSetupActionButton.textContent = setupActionInFlight ? "Opening sign-in..." : "Sign in with ChatGPT";
      agentSetupActionButton.disabled = setupActionInFlight || chatInFlight || readinessInFlight;
    }
  }

  function stopSetupStatusPolling() {
    if (setupStatusTimer) clearTimeout(setupStatusTimer);
    setupStatusTimer = null;
    setupStatusUntil = 0;
  }

  function pollSetupStatus() {
    if (!setupStatusUntil) return;
    if (Date.now() > setupStatusUntil) {
      stopSetupStatusPolling();
      if (agentSelect.value === "openai-cli") {
        setAgentStatus("Finish ChatGPT sign-in, then check model");
      }
      return;
    }

    loadAgents({
      quiet: true,
      afterLoad: function (_agent, error) {
        if (error) {
          if (isBridgeOfflineError(error)) stopSetupStatusPolling();
          else setupStatusTimer = setTimeout(pollSetupStatus, 5000);
          return;
        }
        var cliAgent = findAgent("openai-cli");
        var signedIn = cliAgent && cliAgent.codexStatus && cliAgent.codexStatus.loggedIn;
        if (signedIn) {
          stopSetupStatusPolling();
          if (agentSelect.value === "openai-cli") setAgentStatus("ChatGPT sign-in complete");
          return;
        }
        if (agentSelect.value === "openai-cli") setAgentStatus("Waiting for ChatGPT sign-in...");
        setupStatusTimer = setTimeout(pollSetupStatus, 5000);
      }
    });
  }

  function startSetupStatusPolling() {
    stopSetupStatusPolling();
    setupStatusUntil = Date.now() + 120000;
    if (agentSelect.value === "openai-cli") setAgentStatus("Waiting for ChatGPT sign-in...");
    setupStatusTimer = setTimeout(pollSetupStatus, 2500);
  }

  function updateProviderUi(agent) {
    var group = agentGroup(agent) || localStorage.getItem("codexAeProviderGroup") || "openai";
    var authMode = agent && agent.authMode ? agent.authMode : openAiAuthMode();
    forEachNode(providerTabEls, function (button) {
      toggleClass(button, "active", getData(button, "provider-group") === group);
    });
    forEachNode(authModeButtonEls, function (button) {
      toggleClass(button, "active", getData(button, "auth-mode") === authMode);
    });
    authModeTabsEl.style.display = group === "openai" ? "" : "none";
    localServiceCardEl.style.display = group === "local" ? "grid" : "none";
    agentSetupCardEl.style.display = group === "local" ? "none" : "";
    agentSetupTitleEl.textContent = setupTitleForAgent(agent);
    agentSetupTextEl.textContent = setupTextForAgent(agent);
    updateSetupActionAvailability(agent);
    if (group === "local") {
      if (agent && agent.canChat) localStatusEl.textContent = "Connected to Ollama - " + (agent.modelCount || 0) + " models available";
      else if (agent && agent.reachable === false) localStatusEl.textContent = agent.error || "Ollama is offline";
      else localStatusEl.textContent = "Not checked";
    }
  }

  function setAgentDetails(agent) {
    clearElement(agentDetailsEl);
    if (!agent) {
      addAgentDetail("Provider", "-");
      addAgentDetail("Model", "-");
      addAgentDetail("Models", "-");
      addAgentDetail("Status", "not loaded");
      return;
    }

    if (agent.placeholder) {
      addAgentDetail("Provider", agent.label || agent.id);
      addAgentDetail("Mode", "setup");
      addAgentDetail("Endpoint", "not connected");
      addAgentDetail("Model", "-");
      addAgentDetail("Models", "-");
      addAgentDetail("Status", "unavailable");
      addAgentDetail("Setup", "not implemented");
      if (agent.notes) addAgentDetail("Notes", agent.notes);
      return;
    }

    var modelCount = typeof agent.modelCount === "number" ? String(agent.modelCount) : "-";
    if (agent.remoteModels && agent.remoteModels.length && modelCount === "-") {
      modelCount = String(agent.remoteModels.length);
    }

    addAgentDetail("Provider", agent.label || agent.id);
    addAgentDetail("Mode", agent.authMode || agent.transport || "-");
    addAgentDetail("Endpoint", agent.transport === "codex-cli" ? "codex exec" : compactUrl(agent.baseUrl));
    addAgentDetail("Model", selectedModel() || agent.model || "-");
    addAgentDetail("Models", modelCount + " / " + modelSourceLabel(agent.modelSource));
    addAgentDetail("Status", readinessLabel(agent));
    addAgentDetail("Setup", agent.requiresApiKey ? (agent.configured ? "key saved" : "key required") : "local");
    if (agent.notes) addAgentDetail("Notes", agent.notes);
    if (agent.error) addAgentDetail("Last error", agent.error);
  }

  function updateModelList(agent) {
    clearElement(agentModelEl);
    clearElement(agentModelListEl);
    if (!agent) return;

    var seen = {};
    var modelItems = [];
    if (agent.modelOptions) {
      for (var optionIndex = 0; optionIndex < agent.modelOptions.length; optionIndex++) {
        modelItems.push(agent.modelOptions[optionIndex]);
      }
    }
    if (agent.model) modelItems.push({ id: agent.model, name: agent.model });
    if (agent.models) {
      for (var i = 0; i < agent.models.length; i++) {
        modelItems.push({ id: agent.models[i], name: agent.models[i] });
      }
    }
    if (agent.remoteModels) {
      for (var j = 0; j < agent.remoteModels.length; j++) {
        modelItems.push(agent.remoteModels[j]);
      }
    }

    for (var k = 0; k < modelItems.length; k++) {
      var id = modelItems[k].id || modelItems[k].name;
      if (!id || seen[id]) continue;
      seen[id] = true;
      addOption(agentModelEl, id, modelOptionLabel(agent, modelItems[k]));
      addOption(agentModelListEl, id, modelItems[k].name || id);
    }
  }

  function modelOptionExists(value) {
    for (var i = 0; i < agentModelEl.options.length; i++) {
      if (agentModelEl.options[i].value === value) return true;
    }
    return false;
  }

  function chooseModelValue(value) {
    var target = trimText(value);
    if (target && modelOptionExists(target)) return target;
    if (target) {
      var lower = target.toLowerCase();
      for (var i = 0; i < agentModelEl.options.length; i++) {
        if (agentModelEl.options[i].text.toLowerCase() === lower) return agentModelEl.options[i].value;
      }
    }
    return agentModelEl.options.length ? agentModelEl.options[0].value : target;
  }

  function modelOptionLabel(agent, modelItem) {
    var id = modelItem.id || modelItem.name;
    var label = modelItem.name || id;
    if (!agent || agent.configured) return label;
    if (agent.id === "openai-api" || agent.requiresApiKey) return label + " (No API key)";
    if (agent.id === "openai-cli") return label + " (Run codex login)";
    return label;
  }

  function updateSelectedAgent() {
    var agent = findAgent(agentSelect.value);
    if (agent && agent.id === "openai-cli" && agent.codexStatus && agent.codexStatus.loggedIn) {
      stopSetupStatusPolling();
    }
    updateModelList(agent);
    setAgentDetails(agent);
    updateProviderUi(agent);
    if (!agent) {
      renderedAgentId = "";
      agentModelEl.value = "";
      agentApiKeyRowEl.style.display = "none";
      freeModelsRowEl.style.display = "none";
      saveAgentKeyButton.style.display = "none";
      agentApiKeyEl.value = "";
      setAgentStatus("No agent");
      updateChatAvailability();
      updateKeyAvailability();
      return;
    }

    var savedModel = localStorage.getItem("codexAeAgentModel:" + agent.id) || "";
    agentModelEl.value = chooseModelValue(savedModel || agent.model || "");
    localStorage.setItem("codexAeAgentId", agent.id);
    localStorage.setItem("codexAeProviderGroup", agentGroup(agent) || "");
    if (renderedAgentId !== agent.id) agentApiKeyEl.value = "";
    renderedAgentId = agent.id;

    if (agent.requiresApiKey && agent.canSaveKey !== false) {
      agentApiKeyRowEl.style.display = "grid";
      agentApiKeyEl.placeholder = agent.configured ? "Saved locally; paste a new key to replace" : "Paste " + (agent.apiKeyEnv || "API key");
    } else {
      agentApiKeyRowEl.style.display = "none";
      agentApiKeyEl.placeholder = "";
    }
    freeModelsRowEl.style.display = agent.provider === "openrouter" ? "flex" : "none";

    if (!agent.configured) {
      setAgentStatus(agent.apiKeyEnv ? "Paste and save " + agent.apiKeyEnv : "Needs setup");
    } else if (agent.canChat === false) {
      setAgentStatus(agent.error || agent.status || "Not ready");
    } else if (agent.reachable === false) {
      setAgentStatus(agent.error || "Offline");
    } else if (agent.modelAvailable === false) {
      setAgentStatus("Model unavailable");
    } else if (agent.modelCount) {
      setAgentStatus(agent.modelCount + " models");
    } else {
      setAgentStatus("Ready");
    }
    setAgentDetails(agent);
    updateChatAvailability();
    updateKeyAvailability();
  }

  function loadAgents(options) {
    options = options || {};
    if (agentsLoadInFlight && options.quiet) return;
    agentsLoadInFlight = true;
    if (!options.quiet) setAgentStatus("Loading...");
    var freeOnly = freeModelsOnlyEl.checked ? "1" : "0";
    var loadSeq = ++agentsLoadSeq;
    var loadBaseUrl = getBaseUrl();
    var loadDataVersion = agentDataVersion;
    request("GET", "/agents?includeModels=1&freeOnly=" + freeOnly, null, function (error, response) {
      if (loadSeq !== agentsLoadSeq || loadBaseUrl !== getBaseUrl() || loadDataVersion !== agentDataVersion) {
        if (loadSeq === agentsLoadSeq) agentsLoadInFlight = false;
        return;
      }
      agentsLoadInFlight = false;
      if (error) {
        agents = [];
        providerSelfTestResults = {};
        clearElement(agentSelect);
        setAgentDetails(null);
        setAgentStatus(friendlyErrorMessage(error));
        renderProviderSelfTest();
        if (isBridgeOfflineError(error)) setBridgeOffline(error);
        updateChatAvailability();
        updateKeyAvailability();
        if (options.afterLoad) options.afterLoad(null, error);
        return;
      }

      agents = response && response.agents ? response.agents : [];
      clearElement(agentSelect);
      if (!agents.length) {
        addOption(agentSelect, "", "No agents");
        updateSelectedAgent();
        renderProviderSelfTest();
        if (options.afterLoad) options.afterLoad(null, null);
        return;
      }

      for (var i = 0; i < agents.length; i++) {
        addOption(agentSelect, agents[i].id, optionLabel(agents[i]));
      }

      var savedAgentId = localStorage.getItem("codexAeAgentId") || "";
      var savedAgent = findAgent(savedAgentId);
      if (!savedAgent || !visibleAgent(savedAgent)) {
        var savedGroup = localStorage.getItem("codexAeProviderGroup") || "openai";
        if (isPlaceholderProviderGroup(savedGroup)) {
          renderProviderPlaceholder(savedGroup);
          if (options.afterLoad) options.afterLoad(null, null);
          return;
        }
        var preferredAgent = findAgentByGroup(savedGroup) || findAgentByGroup("openai") || findAgentByGroup("local");
        savedAgentId = preferredAgent ? preferredAgent.id : response.defaultAgentId || agents[0].id;
      }
      if (!findAgent(savedAgentId)) savedAgentId = agents[0].id;
      agentSelect.value = savedAgentId;
      updateSelectedAgent();
      renderProviderSelfTest();
      if (options.afterLoad) options.afterLoad(findAgent(agentSelect.value), null);
    });
  }

  function mergeReadiness(agent, readiness) {
    if (!agent || !readiness) return;
    agent.reachable = readiness.reachable;
    agent.modelAvailable = readiness.modelAvailable;
    agent.canChat = readiness.canChat;
    agent.status = readiness.status;
    agent.error = readiness.error || null;
    agent.modelSource = readiness.modelSource || agent.modelSource;
    agent.modelCount = typeof readiness.modelCount === "number" ? readiness.modelCount : agent.modelCount;
    if (readiness.remoteModels) agent.remoteModels = readiness.remoteModels;
    if (readiness.agent && readiness.agent.codexStatus) agent.codexStatus = readiness.agent.codexStatus;
    agent.checkedAt = readiness.checkedAt || null;
  }

  function applySavedAgentReadiness(readiness) {
    if (!readiness || !readiness.agent || !readiness.agent.id) return null;
    var updatedAgent = readiness.agent;
    var agent = findAgent(updatedAgent.id);
    if (!agent) {
      agents.push(updatedAgent);
      addOption(agentSelect, updatedAgent.id, optionLabel(updatedAgent));
      agent = updatedAgent;
    } else {
      for (var key in updatedAgent) {
        if (Object.prototype.hasOwnProperty.call(updatedAgent, key)) {
          agent[key] = updatedAgent[key];
        }
      }
    }
    mergeReadiness(agent, readiness);
    for (var optionIndex = 0; optionIndex < agentSelect.options.length; optionIndex++) {
      if (agentSelect.options[optionIndex].value === agent.id) {
        agentSelect.options[optionIndex].textContent = optionLabel(agent);
      }
    }
    var selfTestSpec = selfTestSpecForAgentId(agent.id) || { key: agent.id, label: agent.label || agent.id };
    setProviderSelfTestResult(agent.id, selfTestResultFromReadiness(selfTestSpec, agent, readiness));
    return agent;
  }

  function checkSelectedAgent() {
    if (readinessInFlight || providerSelfTestInFlight) return;
    var agent = findAgent(agentSelect.value);
    if (!agent) {
      setAgentStatus("Select an agent first");
      return;
    }
    var model = selectedModel();
    if (!model) {
      setAgentStatus("Choose a model first");
      updateChatAvailability();
      return;
    }

    readinessInFlight = true;
    checkAgentButton.disabled = true;
    setAgentStatus("Checking model...");
    request("GET", "/agents/readiness?agentId=" + encodeURIComponent(agent.id) + "&model=" + encodeURIComponent(model) + "&checkModels=1&freeOnly=" + (freeModelsOnlyEl.checked ? "1" : "0"), null, function (error, response) {
      readinessInFlight = false;
      if (error) {
        agent.error = error.message;
        agent.canChat = false;
        agent.reachable = false;
        setAgentStatus(error.message);
        setAgentDetails(agent);
        updateProviderUi(agent);
        updateChatAvailability();
        updateKeyAvailability();
        return;
      }

      var readiness = response && response.readiness ? response.readiness : null;
      mergeReadiness(agent, readiness);
      setProviderSelfTestResult(agent.id, selfTestResultFromReadiness(selfTestSpecForAgentId(agent.id) || { key: agent.id, label: agent.label || agent.id }, agent, readiness));
      updateModelList(agent);
      setAgentDetails(agent);
      updateProviderUi(agent);
      if (agent.canChat) {
        setAgentStatus("Ready");
      } else {
        setAgentStatus(agent.error || readinessLabel(agent));
      }
      updateChatAvailability();
      updateKeyAvailability();
    });
  }

  function scrollChatTranscriptToBottom(targetEl) {
    if (!chatTranscriptEl) return;

    function scrollNow() {
      chatTranscriptEl.scrollTop = chatTranscriptEl.scrollHeight;
      if (targetEl && targetEl.scrollIntoView) {
        try {
          targetEl.scrollIntoView(false);
        } catch (_scrollError) {}
      }
    }

    scrollNow();
    setTimeout(scrollNow, 0);
    setTimeout(scrollNow, 80);
  }

  function isPlainObject(value) {
    return !!(value && typeof value === "object" && !(value && typeof value.push === "function"));
  }

  function m100HashLooksValid(value) {
    return /^sha256:[a-f0-9]{64}$/.test(String(value || ""));
  }

  function m100ConfirmationTokenLooksValid(value) {
    return /^confirm_[a-f0-9]{48}$/.test(String(value || ""));
  }

  function m100ConfirmationSessionId() {
    return panelConnectionId + ":" + activeChatSessionId;
  }

  function normalizeM100ActionProposal(value) {
    if (!isPlainObject(value)) return null;
    if (value.protocolVersion !== M100_PROTOCOL_VERSION) return null;
    if (value.messageType !== "action_proposal") return null;
    if (value.status !== "awaiting_confirmation") return null;
    if (value.serverCreated !== true || value.createdBy !== M100_BACKEND_SOURCE) return null;
    if (!value.requestId || !value.actionId) return null;
    if (!isPlainObject(value.risk) || !M100_RISK_LEVELS[value.risk.level] || value.risk.requiresConfirmation !== true) return null;
    if (!isPlainObject(value.action)) return null;
    if (value.action.kind !== "ae_tool" && value.action.kind !== "ae_jsx") return null;
    if (!value.action.payloadRef || !m100HashLooksValid(value.action.payloadHash) || !m100HashLooksValid(value.action.previewHash)) return null;
    if (!isPlainObject(value.confirmation)) return null;
    if (value.confirmation.required !== true || value.confirmation.state !== "pending") return null;
    if (value.confirmation.riskPolicyVersion !== M100_RISK_POLICY_VERSION) return null;
    if (!m100ConfirmationTokenLooksValid(value.confirmation.confirmationToken)) return null;
    if (!value.confirmation.surface) return null;
    if (!value.confirmation.proposalExpiresAt || isNaN(Date.parse(value.confirmation.proposalExpiresAt))) return null;
    return value;
  }

  function m100ActionProposalForResult(result) {
    var proposal = normalizeM100ActionProposal(result && result.m100ActionProposal);
    if (!proposal) proposal = normalizeM100ActionProposal(result);
    if (!proposal) return null;
    if (result && result.requestId && String(result.requestId) !== String(proposal.requestId)) return null;
    return proposal;
  }

  function hasRunnableM100ActionProposal(result) {
    return !!(result && result.plan && m100ActionProposalForResult(result));
  }

  function appendChatMessage(role, text, options) {
    var messageEl = document.createElement("div");
    messageEl.className = "chat-message " + role;

    var roleEl = document.createElement("span");
    roleEl.className = "chat-role";
    roleEl.textContent = role;
    messageEl.appendChild(roleEl);

    var textEl = document.createElement("span");
    renderChatText(textEl, role, text || "");
    if (options && options.actionProposal) appendInlineActionProposalActions(textEl, options.actionProposal);
    messageEl.appendChild(textEl);

    chatTranscriptEl.appendChild(messageEl);
    scrollChatTranscriptToBottom(messageEl);
    recordTranscriptMessage(role, text, options);
  }

  function ensureUsageWindowStartedAt() {
    var now = Date.now();
    if (!usageWindowStartedAt || now - usageWindowStartedAt < 0 || now - usageWindowStartedAt > FIVE_HOUR_LIMIT_MS) {
      usageWindowStartedAt = now;
      localStorage.setItem("codexAeUsageWindowStartedAt", String(usageWindowStartedAt));
    }
    return usageWindowStartedAt;
  }

  function estimateTokensFromText(value) {
    var text = String(value || "");
    return Math.max(0, Math.ceil(text.length / 4));
  }

  function compactNumber(value) {
    var number = Math.max(0, Math.round(Number(value || 0)));
    return String(number).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }

  function formatPercent(value) {
    var number = Math.max(0, Number(value || 0));
    if (number >= 10) return number.toFixed(1) + "%";
    return number.toFixed(2) + "%";
  }

  function formatDuration(ms) {
    var totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    var hours = Math.floor(totalSeconds / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;
    if (hours > 0) return hours + "h " + minutes + "m";
    if (minutes > 0) return minutes + "m " + seconds + "s";
    return seconds + "s";
  }

  function usageTokensFromObject(value, depth) {
    if (!value || typeof value !== "object" || depth > 5) return 0;
    var total = 0;
    if (value.usage && typeof value.usage === "object") {
      var usage = value.usage;
      total += Number(usage.total_tokens || usage.totalTokens || usage.tokens || 0);
      if (!total) {
        total += Number(usage.prompt_tokens || usage.input_tokens || usage.inputTokens || 0);
        total += Number(usage.completion_tokens || usage.output_tokens || usage.outputTokens || 0);
      }
    }
    if (value.finalPlanResult) total += usageTokensFromObject(value.finalPlanResult, depth + 1);
    if (value.finalRun) total += usageTokensFromObject(value.finalRun, depth + 1);
    if (value.finalAttempt) total += usageTokensFromObject(value.finalAttempt, depth + 1);
    if (value.planResult) total += usageTokensFromObject(value.planResult, depth + 1);
    if (value.run) total += usageTokensFromObject(value.run, depth + 1);
    if (value.dryRun) total += usageTokensFromObject(value.dryRun, depth + 1);
    if (value.attempts && typeof value.attempts.push === "function") {
      for (var i = 0; i < value.attempts.length && i < 5; i++) {
        total += usageTokensFromObject(value.attempts[i], depth + 1);
      }
    }
    return total;
  }

  function estimateCurrentContextTokens(extra) {
    var total = 0;
    for (var i = 0; i < transcriptHistory.length; i++) {
      var item = transcriptHistory[i] || {};
      total += estimateTokensFromText(item.role) + estimateTokensFromText(item.text);
      if (item.planResult) {
        try {
          total += estimateTokensFromText(JSON.stringify(item.planResult));
        } catch (_error) {}
      }
    }
    for (var j = 0; j < chatMessages.length; j++) {
      total += estimateTokensFromText(chatMessages[j] && chatMessages[j].content);
    }
    try {
      if (lastPlanResult) total += estimateTokensFromText(JSON.stringify(lastPlanResult));
      if (lastPlanRunResult) total += estimateTokensFromText(JSON.stringify(lastPlanRunResult));
      if (extra) total += estimateTokensFromText(JSON.stringify(extra));
    } catch (_jsonError) {}
    return total;
  }

  function buildOperationUsageReport(label, result) {
    var startedAt = ensureUsageWindowStartedAt();
    var elapsedMs = Date.now() - startedAt;
    var windowPercent = Math.min(999, (elapsedMs / FIVE_HOUR_LIMIT_MS) * 100);
    var contextTokens = estimateCurrentContextTokens(result);
    var contextPercent = (contextTokens / CONTEXT_WINDOW_TOKENS) * 100;
    var providerTokens = usageTokensFromObject(result, 0);
    var lines = [
      "Resource report: " + (label || "operation"),
      "5h task window: " + formatPercent(windowPercent) + " used (" + formatDuration(elapsedMs) + " / 5h, local timer).",
      "Context window: about " + compactNumber(contextTokens) + " / " + compactNumber(CONTEXT_WINDOW_TOKENS) + " tokens (" + formatPercent(contextPercent) + ", panel estimate)."
    ];
    if (providerTokens > 0) {
      lines.push("Provider usage returned: " + compactNumber(providerTokens) + " tokens.");
    } else {
      lines.push("Provider usage returned: not available for this operation.");
    }
    return lines.join("\n");
  }

  function appendOperationUsageReport(label, result) {
    var text = buildOperationUsageReport(label, result || null);
    operationUsageReports.push({
      label: label || "operation",
      text: text,
      createdAt: new Date().toISOString()
    });
    if (operationUsageReports.length > 20) operationUsageReports = operationUsageReports.slice(operationUsageReports.length - 20);
    window.__aeAgentUsageReports = operationUsageReports;
    appendChatMessage("assistant", text);
  }

  function appendInlineActionProposalActions(parent, actionProposal) {
    var proposal = normalizeM100ActionProposal(actionProposal);
    if (!parent || !proposal) return;

    var row = document.createElement("div");
    row.className = "inline-plan-actions";

    var status = document.createElement("span");
    status.className = "inline-plan-action-status";
    status.textContent = "Action ready";
    row.appendChild(status);

    var dryRunButton = document.createElement("button");
    dryRunButton.className = "inline-dry-run-button";
    dryRunButton.textContent = DRY_RUN_PLAN_TEXT;
    dryRunButton.title = DRY_RUN_PLAN_TITLE;
    row.appendChild(dryRunButton);

    var runButton = document.createElement("button");
    runButton.className = "inline-run-plan-button";
    runButton.textContent = RUN_PLAN_TEXT;
    runButton.title = RUN_PLAN_TITLE;
    row.appendChild(runButton);

    var entry = {
      actionProposal: proposal,
      row: row,
      status: status,
      dryRunButton: dryRunButton,
      runButton: runButton
    };

    dryRunButton.addEventListener("click", function () {
      if (!dryRunButton.disabled) runLastPlan(true);
    });
    runButton.addEventListener("click", function () {
      if (!runButton.disabled) runLastPlan(false);
    });

    inlinePlanActionRows.push(entry);
    parent.appendChild(row);
    updateInlinePlanActionRows();
  }

  function removeChatWorkingIndicator() {
    if (chatWorkingEl && chatWorkingEl.parentNode) {
      chatWorkingEl.parentNode.removeChild(chatWorkingEl);
    }
    chatWorkingEl = null;
  }

  function showChatWorkingIndicator(label) {
    removeChatWorkingIndicator();

    var messageEl = document.createElement("div");
    messageEl.className = "chat-message assistant chat-working";

    var roleEl = document.createElement("span");
    roleEl.className = "chat-role";
    roleEl.textContent = "assistant";
    messageEl.appendChild(roleEl);

    var bubbleEl = document.createElement("span");
    bubbleEl.className = "typing-indicator";
    bubbleEl.setAttribute("aria-label", label || "Working");

    var textEl = document.createElement("span");
    textEl.className = "typing-text";
    textEl.textContent = label || "Working";
    bubbleEl.appendChild(textEl);

    var dotsEl = document.createElement("span");
    dotsEl.className = "typing-dots";
    dotsEl.setAttribute("aria-hidden", "true");
    for (var i = 0; i < 3; i++) {
      dotsEl.appendChild(document.createElement("i"));
    }
    bubbleEl.appendChild(dotsEl);

    messageEl.appendChild(bubbleEl);
    chatTranscriptEl.appendChild(messageEl);
    scrollChatTranscriptToBottom(messageEl);
    chatWorkingEl = messageEl;
  }

  function statusClassForStep(text) {
    var value = String(text || "").toLowerCase();
    if (value.indexOf("failed") >= 0 || value.indexOf("blocked") >= 0 || value.indexOf("needs review") >= 0 || value.indexOf("error") >= 0) return "failed";
    if (value.indexOf("completed") >= 0 || value.indexOf("verification: ok") >= 0) return "completed";
    if (value.indexOf("ready") >= 0 || value.indexOf("ok") >= 0) return "ready";
    return "pending";
  }

  function planLineClass(text) {
    var value = String(text || "").replace(/^\s+/, "");
    var lower = value.toLowerCase();
    var className = "plan-line";
    if (/^(plan review|validation|summary|risk|confidence|verdict|run guidance|run readiness|mode|mutations|plan):/i.test(value)) {
      className += " plan-heading";
    }
    if (/^(confidence|verdict|run guidance):/i.test(value)) {
      className += " plan-confidence";
    }
    if (/^(affected targets|target):/i.test(value)) {
      className += " plan-targets";
    }
    if (/^(checkpoint expectation|checkpoint|checkpoint\/edit session|safety|edit session|restore):/i.test(value)) {
      className += " plan-safety";
    }
    if (/^(warnings?|warning|- warning|error|recovery|save project first)/i.test(value) || lower.indexOf("needs review") >= 0 || lower.indexOf("blocked") >= 0) {
      className += " plan-warning";
    }
    return className;
  }

  function renderPlainText(parent, text) {
    parent.textContent = text || "";
  }

  function renderPlanText(parent, text) {
    var lines = String(text || "").split(/\r?\n/);
    var container = document.createElement("div");
    container.className = "plan-result";
    var currentStep = null;
    var foundStep = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var stepMatch = /^(\d+)\.\s+(.+)$/.exec(line);
      if (stepMatch) {
        foundStep = true;
        currentStep = document.createElement("div");
        currentStep.className = "plan-step " + statusClassForStep(line);

        var title = document.createElement("strong");
        title.textContent = stepMatch[1] + ". " + stepMatch[2];
        currentStep.appendChild(title);
        container.appendChild(currentStep);
        continue;
      }

      if (!line || line === "Steps:") continue;

      var detail = document.createElement("span");
      detail.textContent = line.replace(/^\s+/, "");
      detail.className = planLineClass(line);
      if (currentStep && /^\s+/.test(line)) {
        currentStep.appendChild(detail);
      } else {
        container.appendChild(detail);
        currentStep = null;
      }
    }

    if (!foundStep) {
      renderPlainText(parent, text);
      return;
    }
    parent.appendChild(container);
  }

  function renderChatText(parent, role, text) {
    if (role === "assistant" && /(^|\n)(Steps:|\d+\.\s+)/.test(String(text || ""))) {
      renderPlanText(parent, text);
      return;
    }
    renderPlainText(parent, text);
  }

  function compactTranscriptText(text) {
    var value = String(text || "");
    if (value.length > 12000) return value.slice(value.length - 12000);
    return value;
  }

  function safeJsonArray(value) {
    if (!value) return [];
    try {
      var parsed = JSON.parse(value);
      if (parsed && typeof parsed.push === "function") return parsed;
    } catch (_error) {}
    return [];
  }

  function normalizeTranscriptItems(items, limit) {
    var source = items && typeof items.push === "function" ? items : [];
    var output = [];
    for (var i = 0; i < source.length; i++) {
      var item = source[i] || {};
      var role = item.role === "user" || item.role === "assistant" || item.role === "error" ? item.role : "assistant";
      var normalized = {
        role: role,
        text: compactTranscriptText(item.text)
      };
      output.push(normalized);
    }
    if (limit && output.length > limit) return output.slice(output.length - limit);
    return output;
  }

  function normalizeChatMessages(items, limit) {
    var source = items && typeof items.push === "function" ? items : [];
    var output = [];
    for (var i = 0; i < source.length; i++) {
      var item = source[i] || {};
      if (!item.role || item.content === undefined) continue;
      output.push({
        role: String(item.role || "assistant"),
        content: compactTranscriptText(item.content)
      });
    }
    if (limit && output.length > limit) return output.slice(output.length - limit);
    return output;
  }

  function createChatSession(title) {
    var now = new Date().toISOString();
    return {
      id: "chat-" + Date.now() + "-" + Math.floor(Math.random() * 100000),
      title: title || "New chat",
      updatedAt: now,
      transcript: [],
      chatMessages: []
    };
  }

  function normalizeChatSession(item, index) {
    var session = item || {};
    return {
      id: String(session.id || ("chat-restored-" + index + "-" + Date.now())),
      title: String(session.title || "New chat").slice(0, 80),
      updatedAt: session.updatedAt || new Date().toISOString(),
      transcript: normalizeTranscriptItems(session.transcript, 80),
      chatMessages: normalizeChatMessages(session.chatMessages, 16)
    };
  }

  function activeChatSession() {
    for (var i = 0; i < chatSessions.length; i++) {
      if (chatSessions[i].id === activeChatSessionId) return chatSessions[i];
    }
    if (!chatSessions.length) {
      var created = createChatSession("Current conversation");
      chatSessions.push(created);
      activeChatSessionId = created.id;
      return created;
    }
    activeChatSessionId = chatSessions[0].id;
    return chatSessions[0];
  }

  function chatSessionTitle(session) {
    var items = session && session.transcript ? session.transcript : [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].role === "user" && trimText(items[i].text)) {
        var text = trimText(items[i].text).replace(/\s+/g, " ");
        return text.length > 48 ? text.slice(0, 45) + "..." : text;
      }
    }
    return session && session.title ? session.title : "New chat";
  }

  function renderChatHistorySelect() {
    clearElement(chatHistorySelect);
    if (!chatSessions.length) chatSessions.push(createChatSession("Current conversation"));
    for (var i = 0; i < chatSessions.length; i++) {
      addOption(chatHistorySelect, chatSessions[i].id, chatSessionTitle(chatSessions[i]));
    }
    chatHistorySelect.value = activeChatSessionId || chatSessions[0].id;
  }

  function trimStoredChatSessions() {
    var kept = [];
    for (var i = 0; i < chatSessions.length; i++) {
      var session = chatSessions[i];
      var isActive = session.id === activeChatSessionId;
      var hasContent = session.transcript.length || session.chatMessages.length;
      if (isActive || hasContent) kept.push(session);
      if (kept.length >= 12) break;
    }
    chatSessions = kept.length ? kept : [createChatSession("Current conversation")];
    if (!activeChatSession()) activeChatSessionId = chatSessions[0].id;
  }

  function saveCurrentChatSession() {
    var session = activeChatSession();
    session.transcript = normalizeTranscriptItems(transcriptHistory, 80);
    session.chatMessages = normalizeChatMessages(chatMessages, 16);
    session.title = chatSessionTitle(session);
    session.updatedAt = new Date().toISOString();

    for (var i = 0; i < chatSessions.length; i++) {
      if (chatSessions[i].id === session.id && i > 0 && session.transcript.length) {
        chatSessions.splice(i, 1);
        chatSessions.unshift(session);
        break;
      }
    }

    trimStoredChatSessions();
    try {
      localStorage.setItem("codexAeChatSessions", JSON.stringify(chatSessions));
      localStorage.setItem("codexAeActiveChatSessionId", activeChatSessionId);
    } catch (_error) {}
    renderChatHistorySelect();
  }

  function saveTranscriptHistory() {
    try {
      localStorage.setItem("codexAeChatTranscript", JSON.stringify(transcriptHistory.slice(-80)));
    } catch (_error) {}
    saveCurrentChatSession();
  }

  function recordTranscriptMessage(role, text, options) {
    if (transcriptRestoring) return;
    var item = {
      role: role || "assistant",
      text: compactTranscriptText(text)
    };
    transcriptHistory.push(item);
    if (transcriptHistory.length > 80) {
      transcriptHistory = transcriptHistory.slice(transcriptHistory.length - 80);
    }
    saveTranscriptHistory();
  }

  function renderTranscriptHistory(recoveredPlanIndex, recoveredPlanResult) {
    inlinePlanActionRows = [];
    clearElement(chatTranscriptEl);

    transcriptRestoring = true;
    for (var i = 0; i < transcriptHistory.length; i++) {
      appendChatMessage(transcriptHistory[i].role, transcriptHistory[i].text, null);
    }
    transcriptRestoring = false;
  }

  function applyChatSession(session) {
    var selected = session || activeChatSession();
    activeChatSessionId = selected.id;
    chatMessages = normalizeChatMessages(selected.chatMessages, 16);
    transcriptHistory = normalizeTranscriptItems(selected.transcript, 80);
    lastPlanResult = null;
    rememberPlanRun(null);
    renderTranscriptHistory(-1, null);
    try {
      localStorage.setItem("codexAeActiveChatSessionId", activeChatSessionId);
      localStorage.setItem("codexAeChatTranscript", JSON.stringify(transcriptHistory.slice(-80)));
    } catch (_error) {}
    renderChatHistorySelect();
    updateChatAvailability();
  }

  function restoreTranscriptHistory() {
    var stored = safeJsonArray(localStorage.getItem("codexAeChatSessions"));
    chatSessions = [];
    for (var i = 0; i < stored.length; i++) {
      chatSessions.push(normalizeChatSession(stored[i], i));
    }

    if (!chatSessions.length) {
      var legacy = normalizeTranscriptItems(safeJsonArray(localStorage.getItem("codexAeChatTranscript")), 80);
      var session = createChatSession(legacy.length ? "Current conversation" : "New chat");
      session.transcript = legacy;
      chatSessions.push(session);
    }

    activeChatSessionId = localStorage.getItem("codexAeActiveChatSessionId") || chatSessions[0].id;
    applyChatSession(activeChatSession());
    saveCurrentChatSession();
  }

  function startNewChat() {
    if (!transcriptHistory.length && !chatMessages.length) {
      applyChatSession(activeChatSession());
      return;
    }
    var session = createChatSession("New chat");
    chatSessions.unshift(session);
    activeChatSessionId = session.id;
    applyChatSession(session);
    saveCurrentChatSession();
  }

  function selectChatSession() {
    var selectedId = chatHistorySelect.value;
    if (!selectedId || selectedId === activeChatSessionId) return;
    for (var i = 0; i < chatSessions.length; i++) {
      if (chatSessions[i].id === selectedId) {
        applyChatSession(chatSessions[i]);
        return;
      }
    }
  }

  function clearActiveChat() {
    chatMessages = [];
    transcriptHistory = [];
    lastPlanResult = null;
    rememberPlanRun(null);
    removeChatWorkingIndicator();
    clearElement(chatTranscriptEl);
    saveTranscriptHistory();
    updateChatAvailability();
  }

  function setChatBusy(busy, label) {
    chatInFlight = busy;
    refreshAgentsButton.disabled = busy;
    if (busy) showChatWorkingIndicator(label);
    else removeChatWorkingIndicator();
    updateChatAvailability();
    updateKeyAvailability();
  }

  function selectedAgentReady() {
    var agent = findAgent(agentSelect.value);
    if (!agent) return false;
    if (!agent.configured) return false;
    if (agent.canChat === false) return false;
    if (agent.reachable === false) return false;
    if (agent.modelAvailable === false) return false;
    if (!selectedModel()) return false;
    return true;
  }

  function readinessError(agent) {
    if (!agent) return "Select an agent first.";
    if (!agent.configured) return agent.apiKeyEnv ? "Set " + agent.apiKeyEnv + " first." : "Agent needs setup.";
    if (agent.error) return agent.error;
    if (agent.reachable === false) return "Agent is offline.";
    if (agent.modelAvailable === false) return "Selected model is unavailable.";
    if (!selectedModel()) return "Choose a model first.";
    return "Agent is not ready yet.";
  }

  function setPlanRunStatus(text, tone) {
    if (!planRunStatusEl) return;
    planRunStatusEl.textContent = text || "";
    planRunStatusEl.className = "plan-run-status" + (tone ? " " + tone : "");
  }

  function updateInlinePlanActionRows() {
    for (var i = inlinePlanActionRows.length - 1; i >= 0; i--) {
      var entry = inlinePlanActionRows[i];
      if (!entry || !entry.row || !entry.row.parentNode) {
        inlinePlanActionRows.splice(i, 1);
        continue;
      }

      var activeProposal = m100ActionProposalForResult(lastPlanResult);
      var isCurrentPlan = !!(lastPlanResult && activeProposal && entry.actionProposal && entry.actionProposal.actionId === activeProposal.actionId);
      var validation = isCurrentPlan && lastPlanResult ? lastPlanResult.planValidation || null : null;
      var mutatingCount = validation ? Number(validation.mutatingCount || 0) : 0;
      var validationOk = !!(validation && validation.ok);
      var classification = planClassification(validation);
      var rawGateReady = rawExtendscriptDryRunGateReady(validation);
      var blocksRun = classificationBlocksRun(validation) && !rawGateReady;
      var dryDisabled = chatInFlight || !isCurrentPlan;
      var runDisabled = chatInFlight || !isCurrentPlan || !validation || !validationOk || blocksRun;

      entry.dryRunButton.textContent = chatInFlight && planRunInFlightMode === "dry-run" && isCurrentPlan ? "Dry run..." : DRY_RUN_PLAN_TEXT;
      entry.dryRunButton.title = DRY_RUN_PLAN_TITLE;
      entry.runButton.textContent = chatInFlight && planRunInFlightMode === "run" && isCurrentPlan ? RUNNING_PLAN_TEXT : RUN_PLAN_TEXT;
      entry.runButton.title = rawGateReady
        ? "Dry run passed; execute through the explicit raw ExtendScript gate and protected runner."
        : RUN_PLAN_TITLE;
      entry.dryRunButton.disabled = dryDisabled;
      entry.runButton.disabled = runDisabled;

      if (!isCurrentPlan) {
        entry.status.textContent = "Replaced by a newer plan";
        entry.row.className = "inline-plan-actions blocked";
      } else if (chatInFlight) {
        entry.status.textContent = "Working...";
        entry.row.className = "inline-plan-actions";
      } else if (!validation) {
        entry.status.textContent = "Plan needs review";
        entry.row.className = "inline-plan-actions blocked";
      } else {
        entry.status.textContent = classificationStatusText(classification, validationOk, mutatingCount, rawGateReady);
        entry.row.className = "inline-plan-actions " + classificationTone(classification, validationOk, mutatingCount);
      }
    }
  }

  function planClassification(validation) {
    return validation && validation.classification && typeof validation.classification === "object"
      ? validation.classification
      : null;
  }

  function classificationBlocksRun(validation) {
    var classification = planClassification(validation);
    return !!(classification && classification.blocksRun === true && rawExtendscriptStepCount(validation) > 0);
  }

  function planKeyFor(plan) {
    try {
      return JSON.stringify(plan || {});
    } catch (_error) {
      return "";
    }
  }

  function currentPlanKey() {
    return lastPlanResult && lastPlanResult.plan ? planKeyFor(lastPlanResult.plan) : "";
  }

  function rawExtendscriptStepCount(validation) {
    var classification = planClassification(validation);
    var classifiedCount = classification ? Number(classification.rawExtendscriptStepCount || 0) : 0;
    if (classifiedCount > 0) return classifiedCount;
    var steps = validation && validation.steps && typeof validation.steps.push === "function" ? validation.steps : [];
    var count = 0;
    for (var i = 0; i < steps.length; i++) {
      var tool = steps[i] && steps[i].tool ? String(steps[i].tool) : "";
      if (tool === "run_extendscript" || tool === "run_extendscript_file") count++;
    }
    return count;
  }

  function rawExtendscriptDryRunGateReady(validation) {
    if (!lastAcceptedDryRun || !lastAcceptedDryRun.ok || !lastAcceptedDryRun.runId) return false;
    if (!classificationBlocksRun(validation) || rawExtendscriptStepCount(validation) <= 0) return false;
    var planKey = currentPlanKey();
    if (!planKey || lastAcceptedDryRun.planKey !== planKey) return false;
    if (lastPlanResult && lastPlanResult.requestId && lastAcceptedDryRun.requestId && lastAcceptedDryRun.requestId !== lastPlanResult.requestId) return false;
    return true;
  }

  function planRunBlocksNormalRun(validation) {
    return classificationBlocksRun(validation) && !rawExtendscriptDryRunGateReady(validation);
  }

  function semanticNeedsReview(run) {
    return !!(run && run.semanticVerification && run.semanticVerification.status === "needs_review");
  }

  function devRequestEligibility(validation, run) {
    if (!validation) return { ok: false, reason: "" };
    var classification = planClassification(validation);
    if (classification && classification.category === "unsupported") {
      return { ok: true, reason: "The current Agent plan references unsupported or unavailable tools." };
    }
    if (rawExtendscriptStepCount(validation) > 0) {
      return { ok: true, reason: "The current Agent plan needs raw ExtendScript; promote the workaround into a typed tool if it works." };
    }
    if (run && run.ok === false) {
      return { ok: true, reason: "The latest Agent run needs review and may require a typed bridge or panel fix." };
    }
    if (semanticNeedsReview(run)) {
      return { ok: true, reason: "The latest Agent run completed but outcome verification needs review." };
    }
    return { ok: false, reason: "" };
  }

  function lastUserPromptText() {
    for (var i = transcriptHistory.length - 1; i >= 0; i--) {
      var item = transcriptHistory[i] || {};
      if (item.role === "user" && trimText(item.text)) return trimText(item.text);
    }
    return "";
  }

  function devRequestTargetFiles(validation) {
    var files = ["mcp-server/bridge-daemon.js", "scripts/smoke-test.js"];
    if (validation && rawExtendscriptStepCount(validation) > 0) files.push("scripts/solution-candidate-report.js");
    files.push("cep-panel/panel.js");
    return files;
  }

  function updateDevRequestButton(hasPlan, validation) {
    if (!prepareDevRequestButton) return;
    var eligibility = devRequestEligibility(validation, lastPlanRunResult);
    prepareDevRequestButton.style.display = hasPlan && eligibility.ok ? "inline-block" : "none";
    prepareDevRequestButton.disabled = chatInFlight || devRequestInFlight || !hasPlan || !eligibility.ok;
    prepareDevRequestButton.textContent = devRequestInFlight ? "Preparing request..." : "Prepare typed tool request";
    prepareDevRequestButton.title = eligibility.ok
      ? eligibility.reason
      : "Available only when the current Agent result shows a typed-tool gap.";
  }

  function classificationStatusText(classification, validationOk, mutatingCount, rawGateReady) {
    if (!classification) {
      if (!validationOk) return "Review issues before running";
      return mutatingCount > 0 ? "Dry run first; Run uses protection" : "Read-only plan ready";
    }
    if (classification.blocksRun && Number(classification.rawExtendscriptStepCount || 0) > 0) {
      if (rawGateReady) return "Dry run accepted; Run unlocked";
      return classification.allowsDryRun === false ? "Plan blocked" : "Dry run available; Run blocked";
    }
    if (classification.category === "safe typed-tool") return "Safe typed-tool ready";
    if (classification.category === "risky") return "Risky plan; dry run first";
    if (classification.category === "needs clarification") return "Runnable with review";
    if (classification.category === "unsupported") return "Unsupported plan";
    return classification.label || "Plan classified";
  }

  function classificationTone(classification, validationOk, mutatingCount) {
    if (!validationOk) return "blocked";
    if (classification && classification.category === "needs clarification") return "mutating";
    if (classification && classification.tone) return classification.tone;
    return mutatingCount > 0 ? "mutating" : "read-only";
  }

  function updatePlanRunControls(hasPlan, validation) {
    var mutatingCount = validation ? Number(validation.mutatingCount || 0) : 0;
    var validationOk = !!(validation && validation.ok);
    var classification = planClassification(validation);
    var rawGateReady = rawExtendscriptDryRunGateReady(validation);
    var blocksRun = classificationBlocksRun(validation) && !rawGateReady;
    if (dryRunPlanButton) {
      dryRunPlanButton.textContent = chatInFlight && planRunInFlightMode === "dry-run" ? "Dry run..." : DRY_RUN_PLAN_TEXT;
      dryRunPlanButton.title = hasPlan ? "Dry run: check this backend-created action proposal without changing the AE project." : "Create a fresh Agent proposal first.";
    }
    if (runPlanButton) {
      runPlanButton.textContent = chatInFlight && planRunInFlightMode === "run" ? RUNNING_PLAN_TEXT : RUN_PLAN_TEXT;
      if (!hasPlan) {
        runPlanButton.title = "Create and validate a backend-owned Agent proposal first.";
      } else if (rawGateReady) {
        runPlanButton.title = "Dry run passed; execute through the explicit raw ExtendScript gate and protected runner.";
      } else if (blocksRun) {
        runPlanButton.title = classification && classification.runRecommendation ? classification.runRecommendation : "Resolve plan classification before running.";
      } else if (!validationOk) {
        runPlanButton.title = "Resolve plan review issues before running.";
      } else if (classification && classification.category === "needs clarification") {
        runPlanButton.title = classification.runRecommendation || "Runnable with review; non-tool steps will be skipped or require replanning.";
      } else if (mutatingCount > 0) {
        runPlanButton.title = "Run with the existing protected edit-session safety gate.";
      } else {
        runPlanButton.title = "Run this read-only plan without changing the AE project.";
      }
    }

    if (chatInFlight) {
      if (planRunInFlightMode === "dry-run") {
        setPlanRunStatus("Dry run is running...", "");
      } else if (planRunInFlightMode === "run") {
        setPlanRunStatus("Run is executing...", "");
      } else {
        setPlanRunStatus("Working...", "");
      }
    } else if (!hasPlan) {
      setPlanRunStatus("No action proposal ready", "");
    } else if (!validation) {
      setPlanRunStatus("Plan needs review", "blocked");
    } else {
      setPlanRunStatus(classificationStatusText(classification, validationOk, mutatingCount, rawGateReady), classificationTone(classification, validationOk, mutatingCount));
    }
  }

  function looksLikePlanText(text) {
    var value = String(text || "");
    if (!trimText(value)) return false;
    if (/(^|\n)\s*\d+\.\s+\S/.test(value)) return true;
    if (/(^|\n)\s*(Plan review|Steps:|План|Обнов[^\n]*план|План выполнения)/i.test(value)) return true;
    return false;
  }

  function findLastPlanLikeTranscriptText() {
    for (var i = transcriptHistory.length - 1; i >= 0; i--) {
      var item = transcriptHistory[i] || {};
      if (item.role !== "assistant") continue;
      if (looksLikePlanText(item.text)) return compactTranscriptText(item.text);
    }
    return "";
  }

  function buildPlanRecoveryPrompt(sourceText) {
    return [
      "Подхвати последний план из чата и преврати его в валидный структурированный AE Agent plan.",
      "Используй только реальные typed AE Agent tools, сохрани смысл исходных шагов и добавь безопасные read-back проверки. Не выполняй план: только подготовь структурированный план для validation/dry-run/run controls.",
      "Последний план из чата:",
      sourceText
    ].join("\n\n");
  }

  function updateRecoverLastPlanButton(hasPlan) {
    if (!recoverLastPlanButton) return;
    recoverLastPlanButton.textContent = RECOVER_PLAN_TEXT;
    recoverLastPlanButton.disabled = chatInFlight || hasPlan || !transcriptHistory.length;
    if (chatInFlight) {
      recoverLastPlanButton.title = "Wait for the current Agent request to finish.";
    } else if (hasPlan) {
      recoverLastPlanButton.title = "A plan is already active.";
    } else if (findLastPlanLikeTranscriptText()) {
      recoverLastPlanButton.title = "Ask Agent mode to convert the latest plan-like chat message into a validated plan.";
    } else if (transcriptHistory.length) {
      recoverLastPlanButton.title = "This chat has no saved structured Agent plan. Create a plan in Agent mode first.";
    } else {
      recoverLastPlanButton.title = "No chat history to scan yet.";
    }
  }

  function updateChatAvailability() {
    sendChatButton.disabled = chatInFlight || !selectedAgentReady();
    var hardcoreMode = chatModeEl.value === CHAT_MODE_HARDCORE;
    var hasPlan = !!(lastPlanResult && lastPlanResult.plan);
    var hasActionProposal = hasRunnableM100ActionProposal(lastPlanResult);
    var validation = hasPlan && lastPlanResult ? lastPlanResult.planValidation || null : null;
    if (hardcoreMode) {
      if (recoverLastPlanButton) recoverLastPlanButton.style.display = "";
      if (dryRunPlanButton) dryRunPlanButton.style.display = "";
      if (runPlanButton) runPlanButton.style.display = "";
      updateRecoverLastPlanButton(hasPlan);
      if (dryRunPlanButton) dryRunPlanButton.disabled = chatInFlight || !hasActionProposal;
      if (runPlanButton) runPlanButton.disabled = chatInFlight || !hasActionProposal || !validation || !validation.ok || planRunBlocksNormalRun(validation);
      updateDevRequestButton(hasPlan, validation);
      updatePlanRunControls(hasActionProposal, validation);
      if (chatInFlight && !planRunInFlightMode) {
        setPlanRunStatus("Hardcore owner is running...", "");
      } else if (!chatInFlight && !hasPlan) {
        setPlanRunStatus("Hardcore owner: send once; no plan ready", "mutating");
      }
    } else {
      if (recoverLastPlanButton) recoverLastPlanButton.style.display = "";
      if (dryRunPlanButton) dryRunPlanButton.style.display = "";
      if (runPlanButton) runPlanButton.style.display = "";
      updateRecoverLastPlanButton(hasPlan);
      dryRunPlanButton.disabled = chatInFlight || !hasActionProposal;
      runPlanButton.disabled = chatInFlight || !hasActionProposal || !validation || !validation.ok || planRunBlocksNormalRun(validation);
      updateDevRequestButton(hasPlan, validation);
      updatePlanRunControls(hasActionProposal, validation);
    }
    updateInlinePlanActionRows();
    if (applyWorkflowPresetButton && workflowPresetSelect) {
      applyWorkflowPresetButton.disabled = chatInFlight || !workflowPresetSelect.value;
    }
    updateProviderSelfTestButton();
  }

  function updateKeyAvailability() {
    var agent = findAgent(agentSelect.value);
    var key = trimText(agentApiKeyEl.value);
    saveAgentKeyButton.disabled = chatInFlight || keySaveInFlight || !agent || !agent.requiresApiKey || !key;
    checkAgentButton.disabled = chatInFlight || readinessInFlight || providerSelfTestInFlight || !agent || !selectedModel();
    updateSetupActionAvailability(agent);
    updateProviderSelfTestButton();
  }

  function rememberModel() {
    if (!agentSelect.value) return;
    localStorage.setItem("codexAeAgentModel:" + agentSelect.value, agentModelEl.value);
  }

  function onAgentModelChanged() {
    rememberModel();
    setAgentDetails(findAgent(agentSelect.value));
    updateChatAvailability();
    updateKeyAvailability();
  }

  function onFreeModelsOnlyChanged() {
    localStorage.setItem("codexAeFreeModelsOnly", freeModelsOnlyEl.checked ? "1" : "0");
    loadAgents();
  }

  function setChatMode(mode) {
    if (mode === CHAT_MODE_HARDCORE) {
      chatModeEl.value = CHAT_MODE_HARDCORE;
    } else {
      chatModeEl.value = mode === CHAT_MODE_CHAT ? CHAT_MODE_CHAT : CHAT_MODE_AGENT;
    }
    localStorage.setItem("codexAeChatMode", chatModeEl.value);
    forEachNode(chatModeButtonEls, function (button) {
      toggleClass(button, "active", getData(button, "chat-mode") === chatModeEl.value);
    });
    updateChatAvailability();
  }

  function isAgentChatMode(mode) {
    return mode === CHAT_MODE_AGENT || mode === CHAT_MODE_HARDCORE;
  }

  function findWorkflowPreset(id) {
    for (var i = 0; i < WORKFLOW_PRESETS.length; i++) {
      if (WORKFLOW_PRESETS[i].id === id) return WORKFLOW_PRESETS[i];
    }
    return null;
  }

  function populateWorkflowPresets() {
    if (!workflowPresetSelect) return;
    clearElement(workflowPresetSelect);
    addOption(workflowPresetSelect, "", "Workflow preset...");
    for (var i = 0; i < WORKFLOW_PRESETS.length; i++) {
      addOption(workflowPresetSelect, WORKFLOW_PRESETS[i].id, WORKFLOW_PRESETS[i].label);
    }
  }

  function dispatchControlChange(el) {
    if (!el || !el.dispatchEvent) return;
    try {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } catch (_error) {}
  }

  function applyWorkflowPreset() {
    var preset = findWorkflowPreset(workflowPresetSelect ? workflowPresetSelect.value : "");
    if (!preset) {
      updateChatAvailability();
      return;
    }

    setChatMode("plan");
    if (promptOptimizationEl && !promptOptimizationEl.checked) {
      promptOptimizationEl.checked = true;
      onPromptOptimizationChanged();
    }

    chatPromptEl.value = preset.prompt;
    dispatchControlChange(chatPromptEl);
    workflowPresetSelect.value = "";
    lastPlanResult = null;
    rememberPlanRun(null);
    updateChatAvailability();
    log("Inserted workflow preset: " + preset.label);
    try {
      chatPromptEl.focus();
    } catch (_focusError) {}
  }

  function recoverLastPlanFromChat() {
    if (chatInFlight || (lastPlanResult && lastPlanResult.plan)) return;
    var sourceText = findLastPlanLikeTranscriptText();
    if (!sourceText) {
      updateChatAvailability();
      setPlanRunStatus("No saved Agent plan in chat", "blocked");
      log("No structured Agent plan found in current chat history");
      return;
    }

    var agentId = agentSelect.value;
    var agent = findAgent(agentId);
    if (!agent || !selectedAgentReady()) {
      var readyError = readinessError(agent);
      updateChatAvailability();
      setPlanRunStatus(readyError, "blocked");
      setAgentStatus(readyError);
      return;
    }

    rememberPlanRun(null);
    setChatBusy(true, "Planning");
    request("POST", "/agents/plan", {
      agentId: agentId,
      model: selectedModel(),
      prompt: buildPlanRecoveryPrompt(sourceText),
      promptOptimization: promptOptimizationEl && promptOptimizationEl.checked,
      timeoutMs: 120000
    }, function (error, response) {
      setChatBusy(false);
      if (error) {
        appendChatMessage("error", error.message);
        log("Plan recovery failed: " + error.message);
        return;
      }
      var result = response && response.result ? response.result : {};
      var text = formatPlanResult(result);
      lastPlanResult = result && result.plan ? result : null;
      appendChatMessage("assistant", text, hasRunnableM100ActionProposal(lastPlanResult) ? { actionProposal: m100ActionProposalForResult(lastPlanResult) } : null);
      if (result.requestId) {
        log("Recovered chat plan through Agent planner " + result.requestId);
      } else {
        log("Recovered chat plan through Agent planner");
      }
      updateChatAvailability();
    });
  }

  function updatePromptOptimizationLabel() {
    var label = promptOptimizationEl && promptOptimizationEl.parentNode ? promptOptimizationEl.parentNode.getElementsByTagName("em")[0] : null;
    if (label) label.textContent = promptOptimizationEl.checked ? "On" : "Off";
  }

  function onPromptOptimizationChanged() {
    localStorage.setItem("codexAePromptOptimization", promptOptimizationEl.checked ? "1" : "0");
    updatePromptOptimizationLabel();
  }

  function setSidebarCollapsed(collapsed) {
    toggleClass(appShellEl, "sidebar-collapsed", collapsed);
    localStorage.setItem("codexAeSidebarCollapsed", collapsed ? "1" : "0");
    collapseSidebarButton.textContent = collapsed ? ">" : "<";
    collapseSidebarButton.title = collapsed ? "Show provider panel" : "Collapse provider panel";
    collapseSidebarButton.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }

  function toggleSidebarCollapsed() {
    var collapsed = !appShellEl.classList || !appShellEl.classList.contains("sidebar-collapsed");
    setSidebarCollapsed(collapsed);
  }

  function setDiagnosticsOpen(open) {
    toggleClass(appShellEl, "diagnostics-open", open);
    localStorage.setItem("codexAeDiagnosticsOpen", open ? "1" : "0");
    diagnosticsButton.textContent = open ? "Hide log" : "Log";
    diagnosticsButton.title = open ? "Hide activity log" : "Show activity log";
    diagnosticsButton.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function toggleDiagnostics() {
    var open = !appShellEl.classList || !appShellEl.classList.contains("diagnostics-open");
    setDiagnosticsOpen(open);
  }

  function saveAgentKey() {
    if (keySaveInFlight) return;
    var agent = findAgent(agentSelect.value);
    if (!agent || !agent.requiresApiKey) return;
    var apiKey = trimText(agentApiKeyEl.value);
    if (!apiKey) {
      setAgentStatus("Paste API key first");
      updateKeyAvailability();
      return;
    }

    keySaveInFlight = true;
    saveAgentKeyButton.disabled = true;
    setAgentStatus("Saving key...");
    request("POST", "/agents/key", {
      agentId: agent.id,
      apiKey: apiKey
    }, function (error, response) {
      keySaveInFlight = false;
      agentApiKeyEl.value = "";
      if (error) {
        setAgentStatus(error.message);
        log("Could not save API key: " + error.message);
        updateKeyAvailability();
        return;
      }
      setAgentStatus("API key saved");
      log("Saved API key for " + (agent.label || agent.id));
      agentDataVersion += 1;
      var savedAgent = applySavedAgentReadiness(response && response.readiness);
      if (savedAgent) {
        agentSelect.value = savedAgent.id;
        localStorage.setItem("codexAeAgentId", savedAgent.id);
        updateSelectedAgent();
      }
      updateKeyAvailability();
    });
  }

  function startAgentSetup() {
    if (setupActionInFlight) return;
    var agent = findAgent(agentSelect.value);
    if (!agent || agent.id !== "openai-cli") return;

    setupActionInFlight = true;
    var missingCodex = agent.codexStatus && agent.codexStatus.installed === false;
    setAgentStatus(missingCodex ? "Checking Codex CLI..." : "Opening ChatGPT sign-in...");
    updateSetupActionAvailability(agent);
    request("POST", "/agents/setup", {
      agentId: agent.id,
      action: agent.setupAction || "codex_login"
    }, function (error, response) {
      setupActionInFlight = false;
      if (error) {
        agent.error = error.message;
        setAgentStatus(error.message);
        setAgentDetails(agent);
        updateProviderUi(agent);
        updateKeyAvailability();
        return;
      }

      var setup = response && response.setup ? response.setup : {};
      if (setup.agent && setup.agent.codexStatus) agent.codexStatus = setup.agent.codexStatus;
      setAgentStatus(setup.launched ? "Waiting for ChatGPT sign-in..." : "Sign-in ready");
      agentSetupTextEl.textContent = setup.launched ? "Finish ChatGPT sign-in; the panel will refresh this status automatically." : (setup.message || "Sign-in setup is ready.");
      setAgentDetails(agent);
      updateProviderUi(agent);
      updateKeyAvailability();
      if (setup.launched) {
        startSetupStatusPolling();
      } else {
        setTimeout(loadAgents, 2500);
      }
    });
  }

  function countLabel(count, singular, plural) {
    var value = Number(count || 0);
    return value + " " + (value === 1 ? singular : plural);
  }

  function reviewStepsForResult(result) {
    if (result && result.planValidation && result.planValidation.steps && typeof result.planValidation.steps.push === "function") {
      return result.planValidation.steps;
    }
    if (result && result.plan && result.plan.steps && typeof result.plan.steps.push === "function") {
      return result.plan.steps;
    }
    return [];
  }

  function fallbackTargetSummary(step) {
    var args = step && step.args && typeof step.args === "object" ? step.args : {};
    if (step && step.tool === "create_test_comp" && args.name) return "new comp " + args.name;
    if (args.compName) return "comp " + args.compName;
    if (args.itemName) return "item " + args.itemName;
    if (args.name) return "item " + args.name;
    if (args.layerIndices && typeof args.layerIndices.push === "function" && args.layerIndices.length) {
      return "layers " + args.layerIndices.join(",");
    }
    if (args.layerIndex !== undefined && args.layerIndex !== null && args.layerIndex !== "") {
      return "layer " + args.layerIndex;
    }
    return "";
  }

  function collectTargetSummaries(steps) {
    var source = steps && typeof steps.push === "function" ? steps : [];
    var seen = {};
    var targets = [];
    for (var i = 0; i < source.length; i++) {
      var summary = trimText(source[i] && source[i].targetSummary ? source[i].targetSummary : fallbackTargetSummary(source[i]));
      if (!summary || seen[summary]) continue;
      seen[summary] = true;
      targets.push(summary);
    }
    if (!targets.length) return "none reported";
    if (targets.length > 4) {
      return targets.slice(0, 4).join("; ") + "; +" + (targets.length - 4) + " more";
    }
    return targets.join("; ");
  }

  function checkpointExpectationText(plan, validation, mutatingCount) {
    if (!mutatingCount) return "Checkpoint expectation: not needed for read-only plan.";
    if ((plan && plan.requiresCheckpoint === true) || (validation && validation.requiresCheckpoint === true)) {
      return "Checkpoint expectation: required before project changes; protected edit session will be prepared at run time.";
    }
    return "Checkpoint expectation: protected edit session will be prepared if Run plan changes the project.";
  }

  function runReadinessText(validation, mutatingCount) {
    if (!validation) return "Run readiness: waiting for plan validation.";
    if (!validation.ok) return "Run readiness: blocked until review issues are fixed.";
    if (mutatingCount > 0) return "Run readiness: Dry run checks without changes; Run plan uses project-change protection.";
    return "Run readiness: Dry run checks the plan; Run plan stays read-only.";
  }

  function readableSafetyLabel(safety) {
    var value = safety && (safety.protection || safety.status) ? String(safety.protection || safety.status) : "checked";
    if (value === "auto_edit_session") return "protected edit session";
    if (value === "planned_checkpoint_step") return "planned checkpoint step";
    if (value === "planned_edit_session_step") return "planned edit session step";
    if (value === "blocked_save_project_first") return "save project first";
    if (value === "blocked_edit_session_failed") return "edit session failed";
    if (value === "blocked_raw_extendscript_gate") return "raw ExtendScript gate blocked";
    return value.replace(/_/g, " ");
  }

  function checkpointFileForRun(run) {
    if (!run) return "";
    if (run.checkpoint && run.checkpoint.checkpointFile) return run.checkpoint.checkpointFile;
    if (run.editSession && run.editSession.checkpoint && run.editSession.checkpoint.checkpointFile) {
      return run.editSession.checkpoint.checkpointFile;
    }
    var steps = run.steps && typeof run.steps.push === "function" ? run.steps : [];
    for (var i = 0; i < steps.length; i++) {
      var result = steps[i] && steps[i].result ? steps[i].result : null;
      if (result && result.checkpoint && result.checkpoint.checkpointFile) return result.checkpoint.checkpointFile;
      if (result && result.mutation && result.mutation.checkpoint && result.mutation.checkpoint.checkpointFile) {
        return result.mutation.checkpoint.checkpointFile;
      }
    }
    return "";
  }

  function stepUndoHintForRun(run) {
    var steps = run && run.steps && typeof run.steps.push === "function" ? run.steps : [];
    for (var i = 0; i < steps.length; i++) {
      var result = steps[i] && steps[i].result ? steps[i].result : null;
      if (result && result.mutation && result.mutation.undoHint) return result.mutation.undoHint;
    }
    return "";
  }

  function checkpointEditSessionStatusText(run, mutatingCount) {
    if (!run) return "";
    if (run.dryRun) {
      if (mutatingCount > 0) return "Checkpoint/edit session: dry-run only; no checkpoint was created. Run plan will prepare protection.";
      return "Checkpoint/edit session: not needed for read-only dry run.";
    }
    if (run.safety && run.safety.saveProjectFirst) {
      return "Checkpoint/edit session: blocked before checkpoint; save the AE project first.";
    }
    if (run.safety && run.safety.status === "blocked_missing_edit_session") {
      return "Checkpoint/edit session: blocked before any project change.";
    }
    if (run.safety && run.safety.status === "blocked_edit_session_failed") {
      return "Checkpoint/edit session: protection could not be prepared.";
    }
    if (run.editSession) {
      return "Checkpoint/edit session: protected by " + (run.editSession.label || run.editSession.id || "edit session") + ".";
    }
    if (checkpointFileForRun(run)) {
      return "Checkpoint/edit session: checkpoint available.";
    }
    if (mutatingCount > 0) {
      return "Checkpoint/edit session: no checkpoint metadata returned; review before retrying.";
    }
    return "Checkpoint/edit session: not needed for read-only run.";
  }

  function recoveryHintForRun(run, mutatingCount) {
    if (!run || run.ok) return "";
    if (run.recoveryHint) return run.recoveryHint;
    if (run.safety && run.safety.saveProjectFirst) {
      return "No project change was started. Save the AE project so a checkpoint can be created, then retry the protected run.";
    }
    if (run.safety && run.safety.status === "blocked_missing_edit_session") {
      return "No project change was started. Retry through the protected Run plan action, or create a checkpoint/edit session before running mutating steps.";
    }
    if (run.safety && run.safety.status === "blocked_edit_session_failed") {
      return "No project change was started because edit-session protection could not be prepared. Review the safety error, then retry after the project can be checkpointed.";
    }
    var checkpointFile = checkpointFileForRun(run);
    if (checkpointFile) {
      return "A checkpoint is available at " + checkpointFile + ". Review the AE project, then restore manually from that checkpoint only if needed.";
    }
    var undoHint = stepUndoHintForRun(run);
    if (undoHint) return undoHint;
    if (mutatingCount <= 0) return "No project changes were requested. Review the failed read-only step, adjust the plan, and retry.";
    return "Review the failed step before retrying. If any AE change occurred, use the checkpoint or After Effects Undo path listed in the step details.";
  }

  function formatPlanResult(result) {
    if (!result.planParseOk || !result.plan) {
      if (diagnosticFromBody(result)) {
        return formatM100DiagnosticBody(result, result.planParseError || "The agent returned a plan I could not parse.");
      }
      return result.text || result.planParseError || "The agent returned a plan I could not parse.";
    }

    var plan = result.plan;
    var validation = result.planValidation || null;
    var classification = result.planClassification || (validation ? validation.classification : null);
    var actionProposal = m100ActionProposalForResult(result);
    var steps = reviewStepsForResult(result);
    var stepCount = validation ? Number(validation.stepCount || 0) : (steps ? steps.length : 0);
    var mutatingCount = validation ? Number(validation.mutatingCount || 0) : 0;
    var lines = [];
    if (validation) lines.push("Plan review: " + (validation.ok ? "ready" : "needs review"));
    if (actionProposal) {
      lines.push("Action: " + actionProposal.actionId + " / " + actionProposal.risk.level);
      lines.push("Payload: " + actionProposal.action.payloadRef);
      lines.push("Expires: " + actionProposal.confirmation.proposalExpiresAt);
    }
    if (result.agentMode === "hardcore") lines.push("Mode: Agent Hardcore");
    if (classification) {
      lines.push("Confidence: " + (classification.verdict || ((classification.label || classification.category || "Plan") + " / " + (classification.confidence || "unknown"))));
      if (classification.runRecommendation) lines.push("Run guidance: " + classification.runRecommendation);
    }
    if (plan.summary) lines.push("Summary: " + plan.summary);
    if (result.planRepaired) lines.push("JSON repair: applied");
    if (plan.risk) lines.push("Risk: " + plan.risk);
    if (validation) {
      lines.push("Validation: " + (validation.ok ? "ok" : "needs review") + ", " + countLabel(stepCount, "step", "steps") + ", " + mutatingCount + " mutating");
      lines.push("Affected targets: " + collectTargetSummaries(steps));
      lines.push("Mutations: " + (mutatingCount > 0 ? countLabel(mutatingCount, "mutating step", "mutating steps") + "; Run plan will use the protected project-change gate." : "0 mutating steps; this plan is read-only."));
      lines.push(checkpointExpectationText(plan, validation, mutatingCount));
      lines.push(runReadinessText(validation, mutatingCount));
      if (validation.warnings && validation.warnings.length) {
        lines.push("Warnings:");
        for (var warningIndex = 0; warningIndex < validation.warnings.length; warningIndex++) {
          lines.push("- " + validation.warnings[warningIndex]);
        }
      }
    } else if (plan.requiresCheckpoint !== undefined) {
      lines.push("Checkpoint expectation: " + (plan.requiresCheckpoint ? "requested by plan" : "not requested by plan"));
    }
    if (plan.clarifyingQuestion) lines.push("Question: " + plan.clarifyingQuestion);
    if (steps && steps.length) {
      lines.push("Steps:");
      for (var i = 0; i < steps.length; i++) {
        var step = steps[i] || {};
        var tool = step.tool ? " [" + step.tool + "]" : "";
        lines.push((i + 1) + ". " + (step.title || step.intent || "Step") + tool);
        if (step.intent) lines.push("   " + step.intent);
        if (step.targetSummary) lines.push("   target: " + step.targetSummary);
        if (step.mutatesProject) lines.push("   mutates project; safe args prepared");
        if (step.warnings && step.warnings.length) lines.push("   warning: " + step.warnings.join("; "));
      }
    }
    return lines.join("\n");
  }

  function rememberPlanRun(run) {
    lastPlanRunResult = run || null;
    window.__aeAgentLastPlanRunResult = lastPlanRunResult;
    lastAcceptedDryRun = null;
    if (run && run.dryRun && run.ok && rawExtendscriptStepCount((lastPlanResult && lastPlanResult.planValidation) || run.validation || null) > 0) {
      lastAcceptedDryRun = {
        ok: true,
        runId: String(run.id || ""),
        requestId: lastPlanResult && lastPlanResult.requestId ? String(lastPlanResult.requestId) : "",
        planKey: currentPlanKey(),
        acceptedAt: new Date().toISOString()
      };
      if (!lastAcceptedDryRun.runId || !lastAcceptedDryRun.planKey) lastAcceptedDryRun = null;
    }
    window.__aeAgentLastAcceptedDryRun = lastAcceptedDryRun;
  }

  function showPlanRunFinishedStatus(dryRun, run, failed) {
    var label = dryRun ? "Dry run" : "Run";
    var ok = run && run.ok && !failed;
    var validation = lastPlanResult && lastPlanResult.planValidation ? lastPlanResult.planValidation : null;
    var mutatingCount = validation ? Number(validation.mutatingCount || 0) : 0;
    var tone = ok ? (mutatingCount > 0 ? "mutating" : "read-only") : "blocked";
    var doneText = ok && dryRun && rawExtendscriptDryRunGateReady(validation)
      ? " complete; Run unlocked"
      : " complete; result added below";
    setPlanRunStatus(label + (ok ? doneText : " needs review; see result below"), tone);
  }

  function formatSemanticVerification(semantic) {
    if (!semantic || semantic.status === "not_applicable" || semantic.status === "not_run") return "";
    var label = semantic.status === "passed" ? "passed" : "needs review";
    var parts = ["Outcome verification: " + label];
    if (semantic.summary) parts[0] += " - " + semantic.summary;
    var checkText = "Verification checks: " + Number(semantic.passedChecks || 0) + " passed";
    if (Number(semantic.failedChecks || 0) > 0) checkText += ", " + Number(semantic.failedChecks || 0) + " need review";
    checkText += "; read-back summaries: " + Number(semantic.readBackCount || 0);
    parts.push(checkText);
    if (semantic.warnings && semantic.warnings.length) {
      parts.push("Verification warning: " + semantic.warnings.slice(0, 2).join("; "));
    }
    return parts.join("\n");
  }

  function formatPlanRun(run) {
    if (!run) return "No run result.";
    var lines = [];
    var runValidation = run.validation || null;
    var runSteps = run.steps && typeof run.steps.push === "function" ? run.steps : [];
    var runMutatingCount = runValidation ? Number(runValidation.mutatingCount || 0) : 0;
    lines.push((run.dryRun ? "Dry run" : "Run") + ": " + (run.ok ? "ok" : "needs review"));
    if (!run.ok && diagnosticFromBody({ run: run })) {
      lines.push(formatM100DiagnosticBody({ run: run }, run.error || "Run failed."));
    }
    if (run.dryRun) {
      lines.push("Mode: preview only; project was not changed.");
    } else if (runValidation && runValidation.ok === false) {
      lines.push("Mode: blocked before execution.");
    } else if (runMutatingCount > 0) {
      lines.push("Mode: protected project-change run.");
    } else {
      lines.push("Mode: read-only execution.");
    }
    if (run.error && !diagnosticFromBody({ run: run })) lines.push("Error: " + run.error);
    if (runValidation) {
      lines.push("Plan: " + countLabel(runValidation.stepCount || 0, "step", "steps") + ", " + runMutatingCount + " mutating");
    }
    if (runSteps.length) lines.push("Affected targets: " + collectTargetSummaries(runSteps));
    var checkpointStatus = checkpointEditSessionStatusText(run, runMutatingCount);
    if (checkpointStatus) lines.push(checkpointStatus);
    if (run.safety) {
      lines.push("Safety: " + readableSafetyLabel(run.safety));
      if (run.safety.rawExtendscriptGate && run.safety.rawExtendscriptGate.status === "approved") {
        lines.push("Raw ExtendScript gate: approved by dry run " + (run.safety.rawExtendscriptGate.dryRunId || "ok") + ".");
      }
      if (run.safety.saveProjectFirst) lines.push("Save project first before mutating run.");
    }
    var printedCheckpoint = "";
    if (run.editSession) {
      lines.push("Edit session: " + (run.editSession.label || run.editSession.id || "started"));
      if (run.editSession.checkpoint && run.editSession.checkpoint.checkpointFile) {
        printedCheckpoint = run.editSession.checkpoint.checkpointFile;
        lines.push("Checkpoint: " + printedCheckpoint);
      }
    }
    if (run.checkpoint && run.checkpoint.checkpointFile && run.checkpoint.checkpointFile !== printedCheckpoint) {
      lines.push("Checkpoint: " + run.checkpoint.checkpointFile);
    }
    if (run.editSessionFinished) {
      lines.push("Edit session finished: " + (run.editSessionFinished.outcome || "completed"));
    }
    if (run.warnings && run.warnings.length) {
      lines.push("Warnings: " + run.warnings.join("; "));
    }
    var recoveryHint = recoveryHintForRun(run, runMutatingCount);
    if (recoveryHint) lines.push("Recovery: " + recoveryHint);
    var semanticText = !run.dryRun ? formatSemanticVerification(run.semanticVerification) : "";
    if (semanticText) lines.push(semanticText);
    if (runSteps.length) {
      lines.push("Steps:");
      for (var i = 0; i < runSteps.length; i++) {
        var step = runSteps[i] || {};
        lines.push((i + 1) + ". " + (step.title || step.tool || "Step") + " - " + step.status);
        if (step.targetSummary) lines.push("   target: " + step.targetSummary);
        if (step.reason) lines.push("   " + step.reason);
        if (step.error) lines.push("   " + step.error);
        if (step.result) {
          if (step.result.name) lines.push("   result: " + step.result.name);
          if (typeof step.result.removedCount === "number") lines.push("   removed: " + step.result.removedCount);
          if (step.result.verification) {
            var verification = step.result.verification;
            lines.push("   verification: " + (verification.ok ? "ok" : "needs review"));
            if (verification.comp && verification.comp.name) lines.push("   verified comp: " + verification.comp.name);
            if (verification.warnings && verification.warnings.length) {
              lines.push("   verification warning: " + verification.warnings.join("; "));
            }
          }
          if (step.result.mutation && step.result.mutation.undoHint) {
            lines.push("   restore: " + step.result.mutation.undoHint);
          }
        }
      }
    }
    return lines.join("\n");
  }

  function formatHardcoreSession(session) {
    if (!session) return "Agent Hardcore: no session result.";
    var lines = [];
    var attempts = session.attempts && typeof session.attempts.push === "function" ? session.attempts : [];
    var finalRun = session.finalRun || (session.finalAttempt && session.finalAttempt.run) || null;
    lines.push("Agent Hardcore: " + (session.ok ? "verified" : "needs review"));
    lines.push("Attempts: " + attempts.length + " / " + (session.maxAttempts || attempts.length || 1));
    if (session.finalPlanResult && session.finalPlanResult.plan && session.finalPlanResult.plan.summary) {
      lines.push("Final plan: " + session.finalPlanResult.plan.summary);
    }
    if (finalRun) {
      lines.push((finalRun.dryRun ? "Dry run" : "Protected run") + ": " + (finalRun.ok ? "ok" : "needs review"));
      if (!finalRun.ok && diagnosticFromBody({ run: finalRun })) {
        lines.push(formatM100DiagnosticBody({ run: finalRun }, finalRun.error || "Protected run failed."));
      } else if (finalRun.error) {
        lines.push("Error: " + finalRun.error);
      }
      if (finalRun.recoveryHint) lines.push("Recovery: " + finalRun.recoveryHint);
      var semanticText = formatSemanticVerification(finalRun.semanticVerification);
      if (semanticText) lines.push(semanticText);
      if (finalRun.checkpoint && finalRun.checkpoint.checkpointFile) lines.push("Checkpoint: " + finalRun.checkpoint.checkpointFile);
      if (finalRun.editSession && finalRun.editSession.checkpoint && finalRun.editSession.checkpoint.checkpointFile) {
        lines.push("Checkpoint: " + finalRun.editSession.checkpoint.checkpointFile);
      }
    }
    if (session.projectOwner) lines.push("Owner mode: enabled; reasoning effort xhigh.");
    if (session.typedToolFailures && session.typedToolFailures.length) {
      lines.push("TypedTool failures:");
      for (var failureIndex = 0; failureIndex < session.typedToolFailures.length; failureIndex++) {
        var failure = session.typedToolFailures[failureIndex] || {};
        var bundle = failure.bundle || {};
        lines.push("- " + (failure.tool || "typed tool") + ": marked not working.");
        if (failure.reason) lines.push("   reason: " + failure.reason);
        if (bundle.startPromptFile) lines.push("   Codex App prompt file: " + bundle.startPromptFile);
        if (bundle.startPrompt) {
          lines.push("   Codex App prompt:");
          lines.push(String(bundle.startPrompt).slice(0, 1400));
        }
      }
    }
    if (session.rawFallbackUsed) {
      lines.push("Fallback: raw ExtendScript was used after a matching dry-run gate.");
    }
    if (session.artifacts) {
      if (session.artifacts.sessionArtifact && session.artifacts.sessionArtifact.sessionFile) {
        lines.push("Session evidence: " + session.artifacts.sessionArtifact.sessionFile);
      }
      if (session.artifacts.candidate && session.artifacts.candidate.path) {
        lines.push("Candidate: " + session.artifacts.candidate.path);
      }
      if (session.artifacts.solutionPromotion) {
        if (session.artifacts.solutionPromotion.solutionId) lines.push("Solution memory: " + session.artifacts.solutionPromotion.solutionId);
        if (session.artifacts.solutionPromotion.reason) lines.push("Solution memory: " + session.artifacts.solutionPromotion.reason);
        if (session.artifacts.solutionPromotion.error) lines.push("Solution memory warning: " + session.artifacts.solutionPromotion.error);
      }
      if (session.artifacts.projectMemory && session.artifacts.projectMemory.error) {
        lines.push("Project memory warning: " + session.artifacts.projectMemory.error);
      }
      if (session.artifacts.errors && session.artifacts.errors.length) {
        lines.push("Artifact warnings: " + session.artifacts.errors.slice(0, 3).join("; "));
      }
    }
    if (attempts.length) {
      lines.push("Attempt log:");
      for (var i = 0; i < attempts.length; i++) {
        var attempt = attempts[i] || {};
        lines.push((i + 1) + ". " + (attempt.status || "unknown"));
        if (attempt.blocker) lines.push("   " + attempt.blocker);
        if (attempt.planResult && attempt.planResult.planValidation) {
          lines.push("   validation: " + (attempt.planResult.planValidation.ok ? "ok" : "needs review"));
        }
        if (attempt.run && attempt.run.semanticVerification && attempt.run.semanticVerification.summary) {
          lines.push("   verification: " + attempt.run.semanticVerification.summary);
        }
      }
    }
    return lines.join("\n");
  }

  function formatDevRequestResult(response) {
    var bundle = response && response.bundle ? response.bundle : {};
    var codexApp = response && response.codexApp ? response.codexApp : {};
    var lines = ["Typed tool request prepared."];
    if (bundle.directory) lines.push("Bundle: " + bundle.directory);
    if (bundle.requestFile) lines.push("Request: " + bundle.requestFile);
    if (bundle.startPromptFile) lines.push("Start prompt: " + bundle.startPromptFile);
    if (bundle.startPrompt) {
      lines.push("Codex App prompt:");
      lines.push(bundle.startPrompt);
    }
    if (bundle.candidateFile) lines.push("Candidate: " + bundle.candidateFile);
    if (codexApp.launched) {
      lines.push("Codex App: project launch requested; new chats are manual in v1.");
      lines.push("Next: open a new Codex App chat in this project and paste the start prompt.");
    } else if (codexApp.error) {
      lines.push("Codex App: " + codexApp.error);
    } else {
      lines.push("Codex App: no new chat was created automatically.");
      lines.push("Next: open Codex App for this project and start a dev chat from the start prompt.");
    }
    return lines.join("\n");
  }

  function prepareDevRequest() {
    if (chatInFlight || devRequestInFlight || !lastPlanResult || !lastPlanResult.plan) return;
    var validation = lastPlanResult.planValidation || null;
    var eligibility = devRequestEligibility(validation, lastPlanRunResult);
    if (!eligibility.ok) return;

    var goal = lastUserPromptText() || (lastPlanResult.plan && lastPlanResult.plan.summary) || "AE Agent typed tool request";
    var body = {
      source: "cep-panel",
      title: goal,
      goal: goal,
      reason: eligibility.reason,
      desiredTool: "Convert this AE workflow into a narrow typed AE Agent bridge or panel capability so future Agent runs do not need raw ExtendScript, unsupported tools, or long manual dev work inside the AE chat.",
      acceptanceCriteria: [
        "The workflow can be planned and run through validated AE Agent tools.",
        "Normal execution keeps dry-run, protected run, idempotency, checkpoint/edit-session, and read-back verification gates.",
        "The dev chat stays targeted to the generated bundle and listed files."
      ],
      targetFiles: devRequestTargetFiles(validation),
      planResult: lastPlanResult,
      runResult: lastPlanRunResult,
      openCodexApp: false
    };

    devRequestInFlight = true;
    updateChatAvailability();
    setChatBusy(true, "Preparing dev request");
    request("POST", "/agents/dev-request", body, function (error, response) {
      devRequestInFlight = false;
      setChatBusy(false);
      updateChatAvailability();
      if (error) {
        appendChatMessage("error", error.message);
        log("Dev request failed: " + error.message);
        return;
      }
      appendChatMessage("assistant", formatDevRequestResult(response || {}));
      appendOperationUsageReport("dev request handoff", response || {});
      log("Dev request prepared");
    });
  }

  function runLastPlan(dryRun) {
    var proposal = m100ActionProposalForResult(lastPlanResult);
    if (chatInFlight || !lastPlanResult || !lastPlanResult.plan || !proposal) {
      setPlanRunStatus("No backend action proposal ready", "blocked");
      return;
    }
    var validation = lastPlanResult.planValidation || {};
    var mutatingCount = Number(validation.mutatingCount || 0);
    var allowMutations = !dryRun && mutatingCount > 0;
    var autoEditSession = allowMutations;
    var allowRawExtendscript = !dryRun && rawExtendscriptDryRunGateReady(validation);
    var body = {
      actionId: proposal.actionId,
      payloadRef: proposal.action.payloadRef,
      payloadHash: proposal.action.payloadHash,
      previewHash: proposal.action.previewHash,
      riskLevel: proposal.risk.level,
      riskPolicyVersion: proposal.confirmation.riskPolicyVersion,
      requestId: proposal.requestId,
      dryRun: dryRun,
      confirm: !dryRun,
      allowMutations: allowMutations,
      autoEditSession: autoEditSession,
      timeoutMs: 120000
    };
    if (!dryRun) {
      body.confirmationToken = proposal.confirmation.confirmationToken;
      body.confirmedBySurface = proposal.confirmation.surface || "cep-panel";
      body.confirmedBySession = proposal.confirmation.sessionId || m100ConfirmationSessionId();
    }
    if (allowRawExtendscript) {
      body.allowRawExtendscript = true;
      body.rawExtendscriptDryRunId = lastAcceptedDryRun.runId;
    }

    planRunInFlightMode = dryRun ? "dry-run" : "run";
    rememberPlanRun(null);
    setChatBusy(true, dryRun ? "Dry run" : "Running");
    request("POST", "/agents/plan/run", body, function (error, response) {
      planRunInFlightMode = "";
      setChatBusy(false);
      if (error) {
        var errorRun = error.body && error.body.run ? error.body.run : null;
        if (errorRun) {
          rememberPlanRun(errorRun);
          updateChatAvailability();
          appendChatMessage("assistant", formatPlanRun(errorRun));
          showPlanRunFinishedStatus(dryRun, errorRun, true);
          appendOperationUsageReport(dryRun ? "dry run" : "run plan", errorRun);
          log("Plan run " + (errorRun.id || "") + " needs review");
          return;
        }
        appendChatMessage("error", error.message);
        showPlanRunFinishedStatus(dryRun, null, true);
        appendOperationUsageReport(dryRun ? "dry run" : "run plan", error.body || error);
        log("Plan run failed: " + error.message);
        return;
      }
      var run = response && response.run ? response.run : null;
      rememberPlanRun(run);
      updateChatAvailability();
      appendChatMessage("assistant", formatPlanRun(run));
      showPlanRunFinishedStatus(dryRun, run, false);
      appendOperationUsageReport(dryRun ? "dry run" : "run plan", run);
      if (run && run.id) log("Plan run " + run.id + " finished");
    });
  }

  function sendChat() {
    if (chatInFlight) return;
    var prompt = trimText(chatPromptEl.value);
    if (!prompt) return;

    var agentId = agentSelect.value;
    var agent = findAgent(agentId);
    if (!agent) {
      appendChatMessage("error", "Select an agent first.");
      return;
    }
    if (!selectedAgentReady()) {
      var readyError = readinessError(agent);
      appendChatMessage("error", readyError);
      setAgentStatus(readyError);
      loadAgents();
      return;
    }

    rememberModel();
    var mode = chatModeEl.value || CHAT_MODE_CHAT;
    var agentPlanMode = isAgentChatMode(mode);
    var hardcoreMode = mode === CHAT_MODE_HARDCORE;
    chatPromptEl.value = "";
    appendChatMessage("user", prompt);
    if (!agentPlanMode) {
      chatMessages.push({ role: "user", content: prompt });
      if (chatMessages.length > 16) chatMessages = chatMessages.slice(chatMessages.length - 16);
      saveCurrentChatSession();
    } else {
      lastPlanResult = null;
      rememberPlanRun(null);
      updateChatAvailability();
    }

    setChatBusy(true, agentPlanMode ? (hardcoreMode ? "Hardcore autopilot" : "Planning") : "Thinking");
    var path = hardcoreMode ? "/agents/hardcore/run" : (agentPlanMode ? "/agents/plan" : "/agents/chat");
    var optimizePrompt = promptOptimizationEl && promptOptimizationEl.checked;
    var body = hardcoreMode ? {
      agentId: agentId,
      model: selectedModel(),
      prompt: prompt,
      promptOptimization: optimizePrompt,
      hardcore: true,
      agentMode: "hardcore",
      projectOwner: true,
      reasoning_effort: "xhigh",
      maxAttempts: 5,
      allowMutations: true,
      autoEditSession: true,
      allowRawFallback: true,
      autoPromoteKnowledge: true,
      timeoutMs: 120000
    } : agentPlanMode ? {
      agentId: agentId,
      model: selectedModel(),
      prompt: prompt,
      promptOptimization: optimizePrompt,
      hardcore: hardcoreMode,
      agentMode: hardcoreMode ? "hardcore" : "agent",
      m100ConfirmationSurface: "cep-panel",
      m100ConfirmationSessionId: m100ConfirmationSessionId(),
      timeoutMs: 120000
    } : {
      agentId: agentId,
      model: selectedModel(),
      messages: chatMessages,
      promptOptimization: optimizePrompt,
      timeoutMs: 120000
    };
    if (agentPlanMode) {
      body.m100ConfirmationSurface = "cep-panel";
      body.m100ConfirmationSessionId = m100ConfirmationSessionId();
    }

    request("POST", path, body, function (error, response) {
      setChatBusy(false);
      if (error) {
        appendChatMessage("error", error.message);
        log("Agent " + mode + " failed: " + error.message);
        return;
      }

      var result = hardcoreMode ? (response && response.session ? response.session : {}) : (response && response.result ? response.result : {});
      var text = hardcoreMode ? formatHardcoreSession(result) : (agentPlanMode ? formatPlanResult(result) : result.text || "");
      if (hardcoreMode) {
        lastPlanResult = result.finalPlanResult || null;
        rememberPlanRun(result.finalRun || null);
      } else {
        lastPlanResult = agentPlanMode ? result : lastPlanResult;
      }
      var actionProposal = agentPlanMode ? m100ActionProposalForResult(hardcoreMode ? lastPlanResult : result) : null;
      appendChatMessage("assistant", text, actionProposal ? { actionProposal: actionProposal } : null);
      appendOperationUsageReport(hardcoreMode ? "hardcore owner session" : (agentPlanMode ? "agent plan" : "chat"), result);
      if (!agentPlanMode) {
        chatMessages.push({ role: "assistant", content: text });
        if (chatMessages.length > 16) chatMessages = chatMessages.slice(chatMessages.length - 16);
        saveCurrentChatSession();
      }
      if (hardcoreMode && result.sessionId) {
        log("Agent hardcore session " + result.sessionId + " finished with " + (result.status || "unknown"));
      } else if (result.requestId) {
        log("Agent " + mode + " " + result.requestId + " finished in " + (result.durationMs || 0) + "ms with " + (result.model || selectedModel()));
      }
      updateChatAvailability();
    });
  }

  function clearActiveEvalScriptCommand(id) {
    if (!id || activeEvalScriptCommandId === id) {
      activeEvalScriptCommandId = "";
    }
  }

  function postResult(id, ok, result, error, onDone) {
    request("POST", "/bridge/result", {
      id: id,
      ok: ok,
      result: result,
      error: error
    }, function (postError) {
      if (postError) {
        log("Could not post result: " + postError.message);
      }
      if (onDone) onDone(!postError);
    });
  }

  function commandLeaseOwner(command) {
    var owner = command && command.leaseOwner ? command.leaseOwner : {};
    return {
      panelConnectionId: owner.panelConnectionId || panelConnectionId,
      panelGeneration: owner.panelGeneration || String(panelConnectionGeneration || 0)
    };
  }

  function markCommandSubmitted(command, onDone) {
    var owner = commandLeaseOwner(command);
    request("POST", "/bridge/submitted", {
      id: command.id,
      panelConnectionId: owner.panelConnectionId,
      panelGeneration: owner.panelGeneration
    }, function (error) {
      if (error) {
        log("Could not mark command submitted: " + error.message);
        onDone(false);
        return;
      }
      onDone(true);
    });
  }

  function executeCommand(command) {
    if (activeEvalScriptCommandId) {
      log("Skipping command " + command.id + " while command " + activeEvalScriptCommandId + " is still active");
      return;
    }
    activeEvalScriptCommandId = command.id;
    log("Executing command " + command.id);
    markCommandSubmitted(command, function (submitted) {
      if (!submitted) {
        clearActiveEvalScriptCommand(command.id);
        return;
      }
      cs.evalScript(command.script, function (result) {
        if (typeof result === "string" && result.indexOf("EvalScript error.") === 0) {
          postResult(command.id, false, null, result, function () {
            clearActiveEvalScriptCommand(command.id);
          });
          return;
        }
        postResult(command.id, true, result, null, function () {
          clearActiveEvalScriptCommand(command.id);
        });
      });
    });
  }

  function poll() {
    if (!running) return;
    if (pollInFlight) return;
    if (activeEvalScriptCommandId) {
      pollTimer = setTimeout(poll, 50);
      return;
    }
    pollInFlight = true;
    request("GET", bridgeNextPath(), null, function (error, response) {
      pollInFlight = false;
      if (!running) return;

      if (error) {
        var message = setBridgeOffline(error);
        if (message !== lastPollErrorMessage) {
          log(message);
          lastPollErrorMessage = message;
        }
        pollTimer = setTimeout(poll, 1500);
        return;
      }

      var shouldRefreshAgents = !!lastPollErrorMessage || (badgeEl && badgeEl.textContent !== "online") || !agents.length;
      lastPollErrorMessage = "";
      setBridgeConnected();
      if (shouldRefreshAgents) {
        loadAgents({ quiet: true });
      }

      if (response && response.command) {
        executeCommand(response.command);
      }

      pollTimer = setTimeout(poll, 50);
    });
  }

  function connect() {
    running = true;
    panelConnectionGeneration = Date.now();
    activeEvalScriptCommandId = "";
    lastPollErrorMessage = "";
    localStorage.setItem("codexAeBridgeUrl", urlEl.value);
    localStorage.setItem("codexAeBridgeToken", tokenEl.value);
    localStorage.setItem("codexAeBridgeAutoConnect", "1");
    setStatus("Connecting...", false);
    setBridgeHelp("Connecting to the local bridge...", "");
    refreshAppTitle();
    loadAgents();
    log("Connecting to " + getBaseUrl());
    poll();
  }

  function disconnect() {
    running = false;
    pollInFlight = false;
    activeEvalScriptCommandId = "";
    lastPollErrorMessage = "";
    stopSetupStatusPolling();
    if (pollTimer) clearTimeout(pollTimer);
    localStorage.setItem("codexAeBridgeAutoConnect", "0");
    setStatus("Disconnected", false);
    setBridgeHelp("Disconnected. Click Connect when the bridge is running.", "");
    log("Disconnected");
  }

  function reloadNonce() {
    return String(Date.now()) + "-" + String(Math.random()).slice(2);
  }

  function reloadTargetUrl() {
    var href = String(window.location.href || "");
    var baseUrl = href.split("#")[0].split("?")[0];
    if (!baseUrl) return "index.html";
    if (!/index\.html$/i.test(baseUrl)) {
      baseUrl = baseUrl.replace(/\/?$/, "/index.html");
    }
    var nonce = reloadNonce();
    return baseUrl +
      "?v=" + encodeURIComponent(APP_VERSION) +
      "&assets=" + encodeURIComponent(nonce) +
      "&reload=" + encodeURIComponent(nonce);
  }

  function reloadApp() {
    running = false;
    pollInFlight = false;
    activeEvalScriptCommandId = "";
    stopSetupStatusPolling();
    if (pollTimer) clearTimeout(pollTimer);
    if (reloadButton) {
      reloadButton.disabled = true;
      reloadButton.textContent = "Reloading...";
    }
    var targetUrl = reloadTargetUrl();
    log("Reloading app from " + targetUrl);
    try {
      window.location.replace(targetUrl);
    } catch (_replaceError) {
      window.location.href = targetUrl;
    }
  }

  connectButton.addEventListener("click", connect);
  disconnectButton.addEventListener("click", disconnect);
  diagnosticsButton.addEventListener("click", toggleDiagnostics);
  reloadButton.addEventListener("click", reloadApp);
  collapseSidebarButton.addEventListener("click", toggleSidebarCollapsed);
  if (connectorStatusButton) connectorStatusButton.addEventListener("click", refreshConnectorStatus);
  if (connectorEmergencyDisableButton) connectorEmergencyDisableButton.addEventListener("click", emergencyDisableConnector);
  forEachNode(providerTabEls, function (button) {
    button.addEventListener("click", function () {
      selectProviderGroup(getData(button, "provider-group"));
    });
  });
  forEachNode(authModeButtonEls, function (button) {
    button.addEventListener("click", function () {
      var mode = getData(button, "auth-mode") === "api" ? "api" : "cli";
      localStorage.setItem("codexAeOpenAiAuthMode", mode);
      selectProviderGroup("openai");
    });
  });
  detectLocalButton.addEventListener("click", function () {
    selectProviderGroup("local");
    loadAgents();
  });
  refreshAgentsButton.addEventListener("click", loadAgents);
  agentSelect.addEventListener("change", updateSelectedAgent);
  agentModelEl.addEventListener("input", onAgentModelChanged);
  agentModelEl.addEventListener("change", onAgentModelChanged);
  freeModelsOnlyEl.addEventListener("change", onFreeModelsOnlyChanged);
  agentApiKeyEl.addEventListener("input", updateKeyAvailability);
  checkAgentButton.addEventListener("click", checkSelectedAgent);
  providerSelfTestButton.addEventListener("click", runProviderSelfTest);
  saveAgentKeyButton.addEventListener("click", saveAgentKey);
  agentSetupActionButton.addEventListener("click", startAgentSetup);
  sendChatButton.addEventListener("click", sendChat);
  forEachNode(chatModeButtonEls, function (button) {
    button.addEventListener("click", function () {
      setChatMode(getData(button, "chat-mode"));
    });
  });
  if (workflowPresetSelect) {
    workflowPresetSelect.addEventListener("change", updateChatAvailability);
  }
  if (applyWorkflowPresetButton) {
    applyWorkflowPresetButton.addEventListener("click", applyWorkflowPreset);
  }
  promptOptimizationEl.addEventListener("change", onPromptOptimizationChanged);
  if (recoverLastPlanButton) recoverLastPlanButton.addEventListener("click", recoverLastPlanFromChat);
  dryRunPlanButton.addEventListener("click", function () {
    runLastPlan(true);
  });
  runPlanButton.addEventListener("click", function () {
    runLastPlan(false);
  });
  if (prepareDevRequestButton) prepareDevRequestButton.addEventListener("click", prepareDevRequest);
  newChatButton.addEventListener("click", startNewChat);
  clearChatButton.addEventListener("click", clearActiveChat);
  chatHistorySelect.addEventListener("change", selectChatSession);
  chatPromptEl.addEventListener("keydown", function (event) {
    if (event.keyCode === 13 && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      sendChat();
    }
  });

  setAppTitle(APP_VERSION);
  urlEl.value = localStorage.getItem("codexAeBridgeUrl") || urlEl.value;
  tokenEl.value = localStorage.getItem("codexAeBridgeToken") || "";
  freeModelsOnlyEl.checked = localStorage.getItem("codexAeFreeModelsOnly") === "1";
  promptOptimizationEl.checked = localStorage.getItem("codexAePromptOptimization") === "1";
  populateWorkflowPresets();
  updatePromptOptimizationLabel();
  setChatMode(localStorage.getItem("codexAeChatMode") || "plan");
  setSidebarCollapsed(localStorage.getItem("codexAeSidebarCollapsed") === "1");
  setDiagnosticsOpen(localStorage.getItem("codexAeDiagnosticsOpen") === "1");
  setAgentDetails(null);
  updateProviderUi(null);
  renderProviderSelfTest();
  renderConnectorStatus();
  setTimeout(refreshConnectorStatus, 300);
  restoreTranscriptHistory();
  setStatus("Disconnected", false);
  updateChatAvailability();
  updateKeyAvailability();
  if (tokenEl.value) {
    setTimeout(loadAgents, 250);
  }
  if (tokenEl.value && localStorage.getItem("codexAeBridgeAutoConnect") !== "0") {
    setTimeout(connect, 250);
  }
})();
