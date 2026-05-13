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
  var chatTranscriptEl = document.getElementById("chatTranscript");
  var chatPromptEl = document.getElementById("chatPrompt");
  var sendChatButton = document.getElementById("sendChatButton");
  var dryRunPlanButton = document.getElementById("dryRunPlanButton");
  var runPlanButton = document.getElementById("runPlanButton");
  var chatHistorySelect = document.getElementById("chatHistorySelect");
  var newChatButton = document.getElementById("newChatButton");
  var clearChatButton = document.getElementById("clearChatButton");
  var chatModeEl = document.getElementById("chatMode");
  var chatModeButtonEls = document.querySelectorAll("#chatModeTabs button");
  var promptOptimizationEl = document.getElementById("promptOptimization");

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
  var keySaveInFlight = false;
  var setupActionInFlight = false;
  var readinessInFlight = false;
  var lastPlanResult = null;
  var lastPollErrorMessage = "";
  var setupStatusTimer = null;
  var setupStatusUntil = 0;
  var BRIDGE_OFFLINE_MESSAGE = "Bridge offline. Start the local bridge from Codex, then click Connect.";

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
    clearElement(agentModelEl);
    clearElement(agentModelListEl);
    agentApiKeyRowEl.style.display = "none";
    agentApiKeyEl.value = "";
    freeModelsRowEl.style.display = "none";
    setAgentDetails(agent);
    updateProviderUi(agent);
    setAgentStatus(providerLabelForGroup(group) + " provider unavailable");
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
    agentApiKeyEl.value = "";

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
    if (!options.quiet) setAgentStatus("Loading...");
    var freeOnly = freeModelsOnlyEl.checked ? "1" : "0";
    request("GET", "/agents?includeModels=1&freeOnly=" + freeOnly, null, function (error, response) {
      if (error) {
        agents = [];
        clearElement(agentSelect);
        setAgentDetails(null);
        setAgentStatus(friendlyErrorMessage(error));
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

  function checkSelectedAgent() {
    if (readinessInFlight) return;
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

  function statusClassForStep(text) {
    var value = String(text || "").toLowerCase();
    if (value.indexOf("failed") >= 0 || value.indexOf("blocked") >= 0 || value.indexOf("needs review") >= 0 || value.indexOf("error") >= 0) return "failed";
    if (value.indexOf("completed") >= 0 || value.indexOf("verification: ok") >= 0) return "completed";
    if (value.indexOf("ready") >= 0 || value.indexOf("ok") >= 0) return "ready";
    return "pending";
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
      if (currentStep && /^\s+/.test(line)) {
        currentStep.appendChild(detail);
      } else {
        detail.className = "plan-line";
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
    clearElement(chatTranscriptEl);
    saveTranscriptHistory();
    updateChatAvailability();
  }

  function setChatBusy(busy) {
    chatInFlight = busy;
    refreshAgentsButton.disabled = busy;
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

  function updateChatAvailability() {
    sendChatButton.disabled = chatInFlight || !selectedAgentReady();
    dryRunPlanButton.disabled = chatInFlight || !lastPlanResult || !lastPlanResult.plan;
    runPlanButton.disabled = chatInFlight || !lastPlanResult || !lastPlanResult.plan || !lastPlanResult.planValidation || !lastPlanResult.planValidation.ok;
  }

  function updateKeyAvailability() {
    var agent = findAgent(agentSelect.value);
    var key = trimText(agentApiKeyEl.value);
    saveAgentKeyButton.disabled = chatInFlight || keySaveInFlight || !agent || !agent.requiresApiKey || !key;
    checkAgentButton.disabled = chatInFlight || readinessInFlight || !agent || !selectedModel();
    updateSetupActionAvailability(agent);
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
    }, function (error) {
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
      loadAgents();
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

  function formatPlanResult(result) {
    if (!result.planParseOk || !result.plan) {
      return result.text || result.planParseError || "The agent returned a plan I could not parse.";
    }

    var plan = result.plan;
    var lines = [];
    if (plan.summary) lines.push("Summary: " + plan.summary);
    if (result.planRepaired) lines.push("JSON repair: applied");
    if (plan.risk) lines.push("Risk: " + plan.risk);
    if (plan.requiresCheckpoint !== undefined) lines.push("Checkpoint: " + (plan.requiresCheckpoint ? "yes" : "no"));
    if (result.planValidation) {
      var validation = result.planValidation;
      lines.push("Validation: " + (validation.ok ? "ok" : "needs review") + ", " + validation.stepCount + " step(s), " + validation.mutatingCount + " mutating");
      if (validation.warnings && validation.warnings.length) {
        lines.push("Warnings:");
        for (var warningIndex = 0; warningIndex < validation.warnings.length; warningIndex++) {
          lines.push("- " + validation.warnings[warningIndex]);
        }
      }
    }
    if (plan.clarifyingQuestion) lines.push("Question: " + plan.clarifyingQuestion);
    if (plan.steps && plan.steps.length) {
      lines.push("Steps:");
      for (var i = 0; i < plan.steps.length; i++) {
        var step = plan.steps[i] || {};
        if (result.planValidation && result.planValidation.steps && result.planValidation.steps[i]) {
          step = result.planValidation.steps[i];
        }
        var tool = step.tool ? " [" + step.tool + "]" : "";
        lines.push((i + 1) + ". " + (step.title || step.intent || "Step") + tool);
        if (step.intent) lines.push("   " + step.intent);
        if (step.mutatesProject) lines.push("   mutates project; safe args prepared");
        if (step.warnings && step.warnings.length) lines.push("   warning: " + step.warnings.join("; "));
      }
    }
    return lines.join("\n");
  }

  function formatPlanRun(run) {
    if (!run) return "No run result.";
    var lines = [];
    lines.push((run.dryRun ? "Dry run" : "Run") + ": " + (run.ok ? "ok" : "needs review"));
    if (run.error) lines.push("Error: " + run.error);
    if (run.validation) {
      lines.push("Steps: " + run.validation.stepCount + ", mutating: " + run.validation.mutatingCount);
    }
    if (run.safety) {
      lines.push("Safety: " + (run.safety.protection || run.safety.status || "checked"));
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
    if (run.steps && run.steps.length) {
      for (var i = 0; i < run.steps.length; i++) {
        var step = run.steps[i] || {};
        lines.push((i + 1) + ". " + (step.title || step.tool || "Step") + " - " + step.status);
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
    if (!dryRun) {
      var message = mutatingCount
        ? "Run this validated plan, create a checkpoint/edit session, and allow project changes?"
        : "Run this validated plan?";
      if (!window.confirm(message)) return;
    }

    setChatBusy(true);
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

    setChatBusy(true);
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

      lastPollErrorMessage = "";
      setBridgeConnected();

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
  saveAgentKeyButton.addEventListener("click", saveAgentKey);
  agentSetupActionButton.addEventListener("click", startAgentSetup);
  sendChatButton.addEventListener("click", sendChat);
  forEachNode(chatModeButtonEls, function (button) {
    button.addEventListener("click", function () {
      setChatMode(getData(button, "chat-mode"));
    });
  });
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
  updatePromptOptimizationLabel();
  setChatMode(localStorage.getItem("codexAeChatMode") || "plan");
  setSidebarCollapsed(localStorage.getItem("codexAeSidebarCollapsed") === "1");
  setDiagnosticsOpen(localStorage.getItem("codexAeDiagnosticsOpen") === "1");
  setAgentDetails(null);
  updateProviderUi(null);
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
