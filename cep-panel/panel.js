"use strict";

(function () {
  var APP_NAME = "Codex AE MCP Bridge";
  var APP_VERSION = "0.25.0";

  var cs = new CSInterface();
  var titleEl = document.getElementById("appTitle");
  var versionEl = document.getElementById("appVersion");
  var statusEl = document.getElementById("status");
  var badgeEl = document.getElementById("badge");
  var logEl = document.getElementById("log");
  var urlEl = document.getElementById("bridgeUrl");
  var tokenEl = document.getElementById("bridgeToken");
  var connectButton = document.getElementById("connectButton");
  var disconnectButton = document.getElementById("disconnectButton");
  var reloadButton = document.getElementById("reloadButton");
  var agentSelect = document.getElementById("agentSelect");
  var agentModelEl = document.getElementById("agentModel");
  var agentModelListEl = document.getElementById("agentModelList");
  var agentApiKeyRowEl = document.getElementById("agentApiKeyRow");
  var agentApiKeyEl = document.getElementById("agentApiKey");
  var agentStatusEl = document.getElementById("agentStatus");
  var refreshAgentsButton = document.getElementById("refreshAgentsButton");
  var saveAgentKeyButton = document.getElementById("saveAgentKeyButton");
  var chatTranscriptEl = document.getElementById("chatTranscript");
  var chatPromptEl = document.getElementById("chatPrompt");
  var sendChatButton = document.getElementById("sendChatButton");
  var dryRunPlanButton = document.getElementById("dryRunPlanButton");
  var runPlanButton = document.getElementById("runPlanButton");
  var clearChatButton = document.getElementById("clearChatButton");
  var chatModeEl = document.getElementById("chatMode");

  var running = false;
  var pollTimer = null;
  var pollInFlight = false;
  var agents = [];
  var chatMessages = [];
  var chatInFlight = false;
  var keySaveInFlight = false;
  var lastPlanResult = null;

  function setAppTitle(version) {
    var normalizedVersion = version || APP_VERSION;
    var title = APP_NAME + " v" + normalizedVersion.replace(/^v/i, "");
    document.title = title;
    titleEl.textContent = APP_NAME;
    versionEl.textContent = "v" + normalizedVersion.replace(/^v/i, "");
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
        var errorMessage = "HTTP " + xhr.status + ": " + xhr.responseText;
        try {
          var errorBody = xhr.responseText ? JSON.parse(xhr.responseText) : null;
          if (errorBody) {
            errorMessage = errorBody.error || (errorBody.run && errorBody.run.error) || errorMessage;
          }
        } catch (_parseError) {}
        finish(new Error(errorMessage));
        return;
      }
      try {
        finish(null, xhr.responseText ? JSON.parse(xhr.responseText) : {});
      } catch (error) {
        finish(error);
      }
    };
    xhr.onerror = function () {
      finish(new Error("Network error"));
    };
    xhr.ontimeout = function () {
      finish(new Error("Network timeout"));
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

  function findAgent(id) {
    for (var i = 0; i < agents.length; i++) {
      if (agents[i].id === id) return agents[i];
    }
    return null;
  }

  function clearElement(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
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

  function updateModelList(agent) {
    clearElement(agentModelListEl);
    if (!agent) return;

    var seen = {};
    var modelItems = [];
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
      addOption(agentModelListEl, id, modelItems[k].name || id);
    }
  }

  function updateSelectedAgent() {
    var agent = findAgent(agentSelect.value);
    updateModelList(agent);
    if (!agent) {
      agentModelEl.value = "";
      agentApiKeyRowEl.style.display = "none";
      saveAgentKeyButton.style.display = "none";
      agentApiKeyEl.value = "";
      setAgentStatus("No agent");
      updateChatAvailability();
      return;
    }

    var savedModel = localStorage.getItem("codexAeAgentModel:" + agent.id) || "";
    agentModelEl.value = savedModel || agent.model || "";
    localStorage.setItem("codexAeAgentId", agent.id);
    agentApiKeyEl.value = "";

    if (agent.requiresApiKey) {
      agentApiKeyRowEl.style.display = "";
      saveAgentKeyButton.style.display = "";
      agentApiKeyEl.placeholder = agent.configured ? "Saved locally; paste a new key to replace" : "Paste " + (agent.apiKeyEnv || "API key");
    } else {
      agentApiKeyRowEl.style.display = "none";
      saveAgentKeyButton.style.display = "none";
      agentApiKeyEl.placeholder = "";
    }

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
    updateChatAvailability();
    updateKeyAvailability();
  }

  function loadAgents() {
    setAgentStatus("Loading...");
    request("GET", "/agents?includeModels=1", null, function (error, response) {
      if (error) {
        agents = [];
        clearElement(agentSelect);
        setAgentStatus(error.message);
        updateChatAvailability();
        return;
      }

      agents = response && response.agents ? response.agents : [];
      clearElement(agentSelect);
      if (!agents.length) {
        addOption(agentSelect, "", "No agents");
        updateSelectedAgent();
        return;
      }

      for (var i = 0; i < agents.length; i++) {
        addOption(agentSelect, agents[i].id, optionLabel(agents[i]));
      }

      var savedAgentId = localStorage.getItem("codexAeAgentId") || "";
      if (!findAgent(savedAgentId)) savedAgentId = response.defaultAgentId || agents[0].id;
      if (!findAgent(savedAgentId)) savedAgentId = agents[0].id;
      agentSelect.value = savedAgentId;
      updateSelectedAgent();
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
    textEl.textContent = text || "";
    messageEl.appendChild(textEl);

    chatTranscriptEl.appendChild(messageEl);
    chatTranscriptEl.scrollTop = chatTranscriptEl.scrollHeight;
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
    if (!agentModelEl.value.replace(/^\s+|\s+$/g, "")) return false;
    return true;
  }

  function readinessError(agent) {
    if (!agent) return "Select an agent first.";
    if (!agent.configured) return agent.apiKeyEnv ? "Set " + agent.apiKeyEnv + " first." : "Agent needs setup.";
    if (agent.error) return agent.error;
    if (agent.reachable === false) return "Agent is offline.";
    if (agent.modelAvailable === false) return "Selected model is unavailable.";
    if (!agentModelEl.value.replace(/^\s+|\s+$/g, "")) return "Choose a model first.";
    return "Agent is not ready yet.";
  }

  function updateChatAvailability() {
    sendChatButton.disabled = chatInFlight || !selectedAgentReady();
    dryRunPlanButton.disabled = chatInFlight || !lastPlanResult || !lastPlanResult.plan;
    runPlanButton.disabled = chatInFlight || !lastPlanResult || !lastPlanResult.plan || !lastPlanResult.planValidation || !lastPlanResult.planValidation.ok;
  }

  function updateKeyAvailability() {
    var agent = findAgent(agentSelect.value);
    var key = agentApiKeyEl.value.replace(/^\s+|\s+$/g, "");
    saveAgentKeyButton.disabled = chatInFlight || keySaveInFlight || !agent || !agent.requiresApiKey || !key;
  }

  function rememberModel() {
    if (!agentSelect.value) return;
    localStorage.setItem("codexAeAgentModel:" + agentSelect.value, agentModelEl.value);
  }

  function saveAgentKey() {
    if (keySaveInFlight) return;
    var agent = findAgent(agentSelect.value);
    if (!agent || !agent.requiresApiKey) return;
    var apiKey = agentApiKeyEl.value.replace(/^\s+|\s+$/g, "");
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
    var prompt = chatPromptEl.value.replace(/^\s+|\s+$/g, "");
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
    } else {
      lastPlanResult = null;
      updateChatAvailability();
    }

    setChatBusy(true);
    var path = mode === "plan" ? "/agents/plan" : "/agents/chat";
    var body = mode === "plan" ? {
      agentId: agentId,
      model: agentModelEl.value,
      prompt: prompt,
      timeoutMs: 120000
    } : {
      agentId: agentId,
      model: agentModelEl.value,
      messages: chatMessages,
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
      }
      if (result.requestId) {
        log("Agent " + mode + " " + result.requestId + " finished in " + (result.durationMs || 0) + "ms with " + (result.model || agentModelEl.value));
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
        setStatus("Waiting for server...", false);
        log(error.message);
        pollTimer = setTimeout(poll, 1500);
        return;
      }

      setStatus("Connected", true);

      if (response && response.command) {
        executeCommand(response.command);
      }

      pollTimer = setTimeout(poll, 50);
    });
  }

  function connect() {
    running = true;
    localStorage.setItem("codexAeBridgeUrl", urlEl.value);
    localStorage.setItem("codexAeBridgeToken", tokenEl.value);
    localStorage.setItem("codexAeBridgeAutoConnect", "1");
    setStatus("Connecting...", false);
    refreshAppTitle();
    loadAgents();
    log("Connecting to " + getBaseUrl());
    poll();
  }

  function disconnect() {
    running = false;
    pollInFlight = false;
    if (pollTimer) clearTimeout(pollTimer);
    localStorage.setItem("codexAeBridgeAutoConnect", "0");
    setStatus("Disconnected", false);
    log("Disconnected");
  }

  function reloadApp() {
    running = false;
    pollInFlight = false;
    if (pollTimer) clearTimeout(pollTimer);
    log("Reloading app");
    window.location.reload();
  }

  connectButton.addEventListener("click", connect);
  disconnectButton.addEventListener("click", disconnect);
  reloadButton.addEventListener("click", reloadApp);
  refreshAgentsButton.addEventListener("click", loadAgents);
  agentSelect.addEventListener("change", updateSelectedAgent);
  agentModelEl.addEventListener("change", function () {
    rememberModel();
    updateChatAvailability();
  });
  agentApiKeyEl.addEventListener("input", updateKeyAvailability);
  saveAgentKeyButton.addEventListener("click", saveAgentKey);
  sendChatButton.addEventListener("click", sendChat);
  dryRunPlanButton.addEventListener("click", function () {
    runLastPlan(true);
  });
  runPlanButton.addEventListener("click", function () {
    runLastPlan(false);
  });
  clearChatButton.addEventListener("click", function () {
    chatMessages = [];
    lastPlanResult = null;
    clearElement(chatTranscriptEl);
    updateChatAvailability();
  });
  chatPromptEl.addEventListener("keydown", function (event) {
    if (event.keyCode === 13 && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      sendChat();
    }
  });

  setAppTitle(APP_VERSION);
  urlEl.value = localStorage.getItem("codexAeBridgeUrl") || urlEl.value;
  tokenEl.value = localStorage.getItem("codexAeBridgeToken") || "";
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
