"use strict";

(function () {
  var APP_NAME = "AE Agent";
  var APP_VERSION = "1.0.0";

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
  var dryRunPlanButton = document.getElementById("dryRunPlanButton");
  var runPlanButton = document.getElementById("runPlanButton");
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
  var providerSelfTestResults = {};
  var renderedAgentId = "";
  var agentsLoadSeq = 0;
  var agentsLoadInFlight = false;
  var agentDataVersion = 0;
  var lastPlanResult = null;
  var lastPollErrorMessage = "";
  var setupStatusTimer = null;
  var setupStatusUntil = 0;
  var BRIDGE_OFFLINE_MESSAGE = "Bridge offline. Start the local bridge from Codex, then click Connect.";
  var PROVIDER_SELF_TESTS = [
    { key: "openai-api", label: "OpenAI API", agentId: "openai-api" },
    { key: "openai-cli", label: "OpenAI CLI", agentId: "openai-cli" },
    { key: "gemini-api", label: "Gemini", agentId: "gemini-api" },
    { key: "claude-api", label: "Claude", agentId: "claude-api" },
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
    var error = new Error(message || BRIDGE_OFFLINE_MESSAGE);
    error.status = 0;
    error.bridgeOffline = true;
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

  function appendToken(path) {
    var separator = path.indexOf("?") === -1 ? "?" : "&";
    return path + separator + "token=" + encodeURIComponent(getToken());
  }

  function request(method, path, body, onDone) {
    var completed = false;
    var xhr = new XMLHttpRequest();
    xhr.open(method, getBaseUrl() + appendToken(path), true);
    xhr.timeout = path.indexOf("/agents/chat") === 0 || path.indexOf("/agents/plan") === 0 ? 120000 : 10000;
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
            errorMessage = errorBody.error || (errorBody.run && errorBody.run.error) || errorMessage;
          }
        } catch (_parseError) {}
        var requestError = new Error(errorMessage);
        requestError.status = xhr.status;
        requestError.body = errorBody;
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
    return group === "openai" || group === "local" || group === "gemini" || group === "claude";
  }

  function findAgentByGroup(group) {
    if (group === "openai") {
      var mode = openAiAuthMode();
      return findAgent(mode === "api" ? "openai-api" : "openai-cli") || findAgent("openai-cli") || findAgent("openai-api");
    }
    if (group === "gemini") return findAgent("gemini-api");
    if (group === "claude") return findAgent("claude-api");
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
      agentSetupActionButton.textContent = "Install Codex CLI";
      agentSetupActionButton.disabled = true;
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

  function appendChatMessage(role, text) {
    var messageEl = document.createElement("div");
    messageEl.className = "chat-message " + role;

    var roleEl = document.createElement("span");
    roleEl.className = "chat-role";
    roleEl.textContent = role;
    messageEl.appendChild(roleEl);

    var textEl = document.createElement("span");
    renderChatText(textEl, role, text || "");
    messageEl.appendChild(textEl);

    chatTranscriptEl.appendChild(messageEl);
    chatTranscriptEl.scrollTop = chatTranscriptEl.scrollHeight;
    recordTranscriptMessage(role, text);
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
    chatTranscriptEl.scrollTop = chatTranscriptEl.scrollHeight;
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
    if (/^(plan review|validation|summary|risk|run readiness|mode|mutations|plan):/i.test(value)) {
      className += " plan-heading";
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
      output.push({
        role: role,
        text: compactTranscriptText(item.text)
      });
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

  function recordTranscriptMessage(role, text) {
    if (transcriptRestoring) return;
    transcriptHistory.push({
      role: role || "assistant",
      text: compactTranscriptText(text)
    });
    if (transcriptHistory.length > 80) {
      transcriptHistory = transcriptHistory.slice(transcriptHistory.length - 80);
    }
    saveTranscriptHistory();
  }

  function applyChatSession(session) {
    var selected = session || activeChatSession();
    activeChatSessionId = selected.id;
    chatMessages = normalizeChatMessages(selected.chatMessages, 16);
    transcriptHistory = normalizeTranscriptItems(selected.transcript, 80);
    lastPlanResult = null;
    clearElement(chatTranscriptEl);

    transcriptRestoring = true;
    for (var i = 0; i < transcriptHistory.length; i++) {
      appendChatMessage(transcriptHistory[i].role, transcriptHistory[i].text);
    }
    transcriptRestoring = false;
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

  function updatePlanRunControls(hasPlan, validation) {
    var mutatingCount = validation ? Number(validation.mutatingCount || 0) : 0;
    var validationOk = !!(validation && validation.ok);
    if (dryRunPlanButton) {
      dryRunPlanButton.title = hasPlan ? "Check this plan without changing the AE project." : "Create an Agent plan first.";
    }
    if (runPlanButton) {
      runPlanButton.textContent = "Run plan";
      if (!hasPlan) {
        runPlanButton.title = "Create and validate an Agent plan first.";
      } else if (!validationOk) {
        runPlanButton.title = "Resolve plan review issues before running.";
      } else if (mutatingCount > 0) {
        runPlanButton.title = "Run with the existing protected edit-session safety gate.";
      } else {
        runPlanButton.title = "Run this read-only plan without changing the AE project.";
      }
    }

    if (chatInFlight) {
      setPlanRunStatus("Working...", "");
    } else if (!hasPlan) {
      setPlanRunStatus("No plan ready", "");
    } else if (!validation) {
      setPlanRunStatus("Plan needs review", "blocked");
    } else if (!validationOk) {
      setPlanRunStatus("Review issues before running", "blocked");
    } else if (mutatingCount > 0) {
      setPlanRunStatus("Dry run first; Run uses protection", "mutating");
    } else {
      setPlanRunStatus("Read-only plan ready", "read-only");
    }
  }

  function updateChatAvailability() {
    sendChatButton.disabled = chatInFlight || !selectedAgentReady();
    var hasPlan = !!(lastPlanResult && lastPlanResult.plan);
    var validation = hasPlan && lastPlanResult ? lastPlanResult.planValidation || null : null;
    dryRunPlanButton.disabled = chatInFlight || !hasPlan;
    runPlanButton.disabled = chatInFlight || !hasPlan || !validation || !validation.ok;
    updatePlanRunControls(hasPlan, validation);
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
    chatModeEl.value = mode === "chat" ? "chat" : "plan";
    localStorage.setItem("codexAeChatMode", chatModeEl.value);
    forEachNode(chatModeButtonEls, function (button) {
      toggleClass(button, "active", getData(button, "chat-mode") === chatModeEl.value);
    });
    updateChatAvailability();
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
    updateChatAvailability();
    log("Inserted workflow preset: " + preset.label);
    try {
      chatPromptEl.focus();
    } catch (_focusError) {}
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
    setAgentStatus("Opening ChatGPT sign-in...");
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
      return result.text || result.planParseError || "The agent returned a plan I could not parse.";
    }

    var plan = result.plan;
    var validation = result.planValidation || null;
    var steps = reviewStepsForResult(result);
    var stepCount = validation ? Number(validation.stepCount || 0) : (steps ? steps.length : 0);
    var mutatingCount = validation ? Number(validation.mutatingCount || 0) : 0;
    var lines = [];
    if (validation) lines.push("Plan review: " + (validation.ok ? "ready" : "needs review"));
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

  function formatPlanRun(run) {
    if (!run) return "No run result.";
    var lines = [];
    var runValidation = run.validation || null;
    var runSteps = run.steps && typeof run.steps.push === "function" ? run.steps : [];
    var runMutatingCount = runValidation ? Number(runValidation.mutatingCount || 0) : 0;
    lines.push((run.dryRun ? "Dry run" : "Run") + ": " + (run.ok ? "ok" : "needs review"));
    if (run.dryRun) {
      lines.push("Mode: preview only; project was not changed.");
    } else if (runMutatingCount > 0) {
      lines.push("Mode: protected project-change run.");
    } else {
      lines.push("Mode: read-only execution.");
    }
    if (run.error) lines.push("Error: " + run.error);
    if (runValidation) {
      lines.push("Plan: " + countLabel(runValidation.stepCount || 0, "step", "steps") + ", " + runMutatingCount + " mutating");
    }
    if (runSteps.length) lines.push("Affected targets: " + collectTargetSummaries(runSteps));
    var checkpointStatus = checkpointEditSessionStatusText(run, runMutatingCount);
    if (checkpointStatus) lines.push(checkpointStatus);
    if (run.safety) {
      lines.push("Safety: " + readableSafetyLabel(run.safety));
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

  function runLastPlan(dryRun) {
    if (chatInFlight || !lastPlanResult || !lastPlanResult.plan) return;
    var validation = lastPlanResult.planValidation || {};
    var mutatingCount = Number(validation.mutatingCount || 0);
    var allowMutations = !dryRun && mutatingCount > 0;
    var autoEditSession = allowMutations;

    setChatBusy(true, dryRun ? "Checking" : "Running");
    request("POST", "/agents/plan/run", {
      plan: lastPlanResult.plan,
      requestId: lastPlanResult.requestId,
      dryRun: dryRun,
      confirm: !dryRun,
      allowMutations: allowMutations,
      autoEditSession: autoEditSession,
      timeoutMs: 120000
    }, function (error, response) {
      setChatBusy(false);
      if (error) {
        var errorRun = error.body && error.body.run ? error.body.run : null;
        if (errorRun) {
          appendChatMessage("assistant", formatPlanRun(errorRun));
          log("Plan run " + (errorRun.id || "") + " needs review");
          return;
        }
        appendChatMessage("error", error.message);
        log("Plan run failed: " + error.message);
        return;
      }
      var run = response && response.run ? response.run : null;
      appendChatMessage("assistant", formatPlanRun(run));
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
    var mode = chatModeEl.value || "chat";
    chatPromptEl.value = "";
    appendChatMessage("user", prompt);
    if (mode === "chat") {
      chatMessages.push({ role: "user", content: prompt });
      if (chatMessages.length > 16) chatMessages = chatMessages.slice(chatMessages.length - 16);
      saveCurrentChatSession();
    } else {
      lastPlanResult = null;
      updateChatAvailability();
    }

    setChatBusy(true, mode === "plan" ? "Planning" : "Thinking");
    var path = mode === "plan" ? "/agents/plan" : "/agents/chat";
    var optimizePrompt = promptOptimizationEl && promptOptimizationEl.checked;
    var body = mode === "plan" ? {
      agentId: agentId,
      model: selectedModel(),
      prompt: prompt,
      promptOptimization: optimizePrompt,
      timeoutMs: 120000
    } : {
      agentId: agentId,
      model: selectedModel(),
      messages: chatMessages,
      promptOptimization: optimizePrompt,
      timeoutMs: 120000
    };

    request("POST", path, body, function (error, response) {
      setChatBusy(false);
      if (error) {
        appendChatMessage("error", error.message);
        log("Agent " + mode + " failed: " + error.message);
        return;
      }

      var result = response && response.result ? response.result : {};
      var text = mode === "plan" ? formatPlanResult(result) : result.text || "";
      lastPlanResult = mode === "plan" ? result : lastPlanResult;
      appendChatMessage("assistant", text);
      if (mode === "chat") {
        chatMessages.push({ role: "assistant", content: text });
        if (chatMessages.length > 16) chatMessages = chatMessages.slice(chatMessages.length - 16);
        saveCurrentChatSession();
      }
      if (result.requestId) {
        log("Agent " + mode + " " + result.requestId + " finished in " + (result.durationMs || 0) + "ms with " + (result.model || selectedModel()));
      }
      updateChatAvailability();
    });
  }

  function postResult(id, ok, result, error) {
    request("POST", "/bridge/result", {
      id: id,
      ok: ok,
      result: result,
      error: error
    }, function (postError) {
      if (postError) {
        log("Could not post result: " + postError.message);
      }
    });
  }

  function executeCommand(command) {
    log("Executing command " + command.id);
    cs.evalScript(command.script, function (result) {
      if (typeof result === "string" && result.indexOf("EvalScript error.") === 0) {
        postResult(command.id, false, null, result);
        return;
      }
      postResult(command.id, true, result, null);
    });
  }

  function poll() {
    if (!running) return;
    if (pollInFlight) return;
    pollInFlight = true;
    request("GET", "/bridge/next", null, function (error, response) {
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
    lastPollErrorMessage = "";
    stopSetupStatusPolling();
    if (pollTimer) clearTimeout(pollTimer);
    localStorage.setItem("codexAeBridgeAutoConnect", "0");
    setStatus("Disconnected", false);
    setBridgeHelp("Disconnected. Click Connect when the bridge is running.", "");
    log("Disconnected");
  }

  function reloadApp() {
    running = false;
    pollInFlight = false;
    stopSetupStatusPolling();
    if (pollTimer) clearTimeout(pollTimer);
    log("Reloading app");
    window.location.reload();
  }

  connectButton.addEventListener("click", connect);
  disconnectButton.addEventListener("click", disconnect);
  diagnosticsButton.addEventListener("click", toggleDiagnostics);
  reloadButton.addEventListener("click", reloadApp);
  collapseSidebarButton.addEventListener("click", toggleSidebarCollapsed);
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
  dryRunPlanButton.addEventListener("click", function () {
    runLastPlan(true);
  });
  runPlanButton.addEventListener("click", function () {
    runLastPlan(false);
  });
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
