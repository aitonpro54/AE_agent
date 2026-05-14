"use strict";

const http = require("http");

const DEFAULT_PORT = Number(process.env.CEP_PANEL_CDP_PORT || 8870);
const EXTENSION_ID = process.env.CEP_PANEL_EXTENSION_ID || "com.codex.aemcpbridge";
const BRIDGE_URL = process.env.CEP_PANEL_BRIDGE_URL || "http://127.0.0.1:3456";
const BRIDGE_TOKEN = process.env.CEP_PANEL_BRIDGE_TOKEN || "codex-ae-local";
const AGENT_ID = process.env.CEP_PANEL_AGENT_ID || "ollama-local";
const MODEL = process.env.CEP_PANEL_MODEL || "gemma4:latest";
const OPENAI_API_AGENT_ID = process.env.CEP_PANEL_OPENAI_API_AGENT_ID || "openai-api";
const OPENAI_API_MODEL = process.env.CEP_PANEL_OPENAI_API_MODEL || "gpt-5.5";
const OPENAI_CLI_AGENT_ID = process.env.CEP_PANEL_OPENAI_CLI_AGENT_ID || "openai-cli";
const OPENAI_CLI_MODEL = process.env.CEP_PANEL_OPENAI_CLI_MODEL || "gpt-5.5";
const OPENAI_CLI_PROMPT = process.env.CEP_PANEL_OPENAI_CLI_PROMPT || "Reply with exactly: AE Agent CLI OK";
const WAIT_MS = Number(process.env.CEP_PANEL_WAIT_MS || 90000);
const OPENAI_CLI_WAIT_MS = Number(process.env.CEP_PANEL_OPENAI_CLI_WAIT_MS || 150000);
const PROMPT = process.env.CEP_PANEL_PROMPT ||
  "\u0421\u043e\u0441\u0442\u0430\u0432\u044c \u0431\u0435\u0437\u043e\u043f\u0430\u0441\u043d\u044b\u0439 \u043f\u043b\u0430\u043d \u0431\u0435\u0437 \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f \u043f\u0440\u043e\u0435\u043a\u0442\u0430: \u043f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c \u0441\u043e\u0441\u0442\u043e\u044f\u043d\u0438\u0435 \u043c\u043e\u0441\u0442\u0430 After Effects.";
const MUTATING_PREFIX = "Codex Test Safe Run";

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}

function postBridge(path, payload) {
  return new Promise((resolve, reject) => {
    const target = new URL(path, BRIDGE_URL);
    if (target.protocol !== "http:") {
      reject(new Error(`Unsupported bridge protocol: ${target.protocol}`));
      return;
    }

    const body = JSON.stringify(payload || {});
    const req = http.request({
      hostname: target.hostname,
      port: target.port || 80,
      path: `${target.pathname}${target.search}`,
      method: "POST",
      headers: {
        "x-ae-bridge-token": BRIDGE_TOKEN,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    }, (res) => {
      let responseBody = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        responseBody += chunk;
      });
      res.on("end", () => {
        let parsed = null;
        try {
          parsed = responseBody ? JSON.parse(responseBody) : null;
        } catch (error) {
          reject(error);
          return;
        }
        resolve({ status: res.statusCode, body: parsed });
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function connectToPanel() {
  const pages = await getJson(`http://127.0.0.1:${DEFAULT_PORT}/json/list`);
  const page = pages.find((item) => item.url && item.url.indexOf(EXTENSION_ID) >= 0) || pages[0];
  if (!page || !page.webSocketDebuggerUrl) {
    throw new Error(`Could not find AE Agent panel DevTools page on port ${DEFAULT_PORT}.`);
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  };

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  function send(method, params) {
    return new Promise((resolve) => {
      const callId = ++id;
      pending.set(callId, resolve);
      ws.send(JSON.stringify({ id: callId, method, params: params || {} }));
    });
  }

  await send("Runtime.enable");
  return { page, ws, send };
}

async function evaluate(send, expression) {
  const response = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (response.error) throw new Error(response.error.message || JSON.stringify(response.error));
  if (response.result && response.result.exceptionDetails) {
    throw new Error(response.result.exceptionDetails.text || "Runtime.evaluate failed.");
  }
  return response.result && response.result.result ? response.result.result.value : null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reloadActivePage(send) {
  await send("Page.enable");
  await send("Page.reload", { ignoreCache: true });
  await delay(3000);
}

function stateExpression() {
  return `(() => ({
    title: document.title,
    windowBarExists: !!document.querySelector(".window-bar"),
    windowBarText: document.querySelector(".window-bar") ? document.querySelector(".window-bar").innerText : "",
    appTitleExists: !!document.getElementById("appTitle"),
    appTitle: document.getElementById("appTitle") ? document.getElementById("appTitle").textContent : "",
    appVersionExists: !!document.getElementById("appVersion"),
    appVersion: document.getElementById("appVersion") ? document.getElementById("appVersion").textContent : "",
    status: document.getElementById("status") ? document.getElementById("status").textContent : "",
    badge: document.getElementById("badge") ? document.getElementById("badge").textContent : "",
    bridgeHelp: document.getElementById("bridgeHelp") ? document.getElementById("bridgeHelp").textContent : "",
    bridgeHelpClass: document.getElementById("bridgeHelp") ? document.getElementById("bridgeHelp").className : "",
    activeProviderGroup: (() => {
      const active = document.querySelector("#providerTabs .provider-tab.active");
      return active ? active.getAttribute("data-provider-group") || "" : "";
    })(),
    sidebarCollapsed: document.getElementById("appShell") ? document.getElementById("appShell").className.indexOf("sidebar-collapsed") >= 0 : null,
    collapseButtonText: document.getElementById("collapseSidebarButton") ? document.getElementById("collapseSidebarButton").textContent : "",
    collapseButtonTitle: document.getElementById("collapseSidebarButton") ? document.getElementById("collapseSidebarButton").title : "",
    collapseButtonExpanded: document.getElementById("collapseSidebarButton") ? document.getElementById("collapseSidebarButton").getAttribute("aria-expanded") : null,
    diagnosticsOpen: document.getElementById("appShell") ? document.getElementById("appShell").className.indexOf("diagnostics-open") >= 0 : null,
    diagnosticsDisplay: document.querySelector(".activity-pane") ? window.getComputedStyle(document.querySelector(".activity-pane")).display : "",
    diagnosticsButtonText: document.getElementById("diagnosticsButton") ? document.getElementById("diagnosticsButton").textContent : "",
    diagnosticsButtonTitle: document.getElementById("diagnosticsButton") ? document.getElementById("diagnosticsButton").title : "",
    diagnosticsButtonExpanded: document.getElementById("diagnosticsButton") ? document.getElementById("diagnosticsButton").getAttribute("aria-expanded") : null,
    agentStatus: document.getElementById("agentStatus") ? document.getElementById("agentStatus").textContent : "",
    agentValue: document.getElementById("agentSelect") ? document.getElementById("agentSelect").value : "",
    agentOptions: Array.from(document.querySelectorAll("#agentSelect option")).map((option) => ({ value: option.value, text: option.textContent })),
    agentDetails: document.getElementById("agentDetails") ? document.getElementById("agentDetails").innerText : "",
    model: document.getElementById("agentModel") ? document.getElementById("agentModel").value : "",
    modelOptions: Array.from(document.querySelectorAll("#agentModel option")).map((option) => ({ value: option.value, text: option.textContent })),
    setupTitle: document.getElementById("agentSetupTitle") ? document.getElementById("agentSetupTitle").textContent : "",
    setupText: document.getElementById("agentSetupText") ? document.getElementById("agentSetupText").textContent : "",
    setupActionText: document.getElementById("agentSetupActionButton") ? document.getElementById("agentSetupActionButton").textContent : "",
    setupActionDisabled: document.getElementById("agentSetupActionButton") ? document.getElementById("agentSetupActionButton").disabled : null,
    setupActionVisible: document.getElementById("agentSetupActionButton") ? document.getElementById("agentSetupActionButton").style.display !== "none" : null,
    authModeVisible: document.getElementById("authModeTabs") ? document.getElementById("authModeTabs").style.display !== "none" : null,
    apiKeyVisible: document.getElementById("agentApiKeyRow") ? document.getElementById("agentApiKeyRow").style.display !== "none" : null,
    apiKeyPlaceholder: document.getElementById("agentApiKey") ? document.getElementById("agentApiKey").placeholder : "",
    apiKeyValue: document.getElementById("agentApiKey") ? document.getElementById("agentApiKey").value : "",
    saveKeyDisabled: document.getElementById("saveAgentKeyButton") ? document.getElementById("saveAgentKeyButton").disabled : null,
    saveKeyText: document.getElementById("saveAgentKeyButton") ? document.getElementById("saveAgentKeyButton").textContent : "",
    localServiceVisible: document.getElementById("localServiceCard") ? document.getElementById("localServiceCard").style.display !== "none" : null,
    freeModelsVisible: document.getElementById("freeModelsRow") ? document.getElementById("freeModelsRow").style.display !== "none" : null,
    freeModelsChecked: document.getElementById("freeModelsOnly") ? document.getElementById("freeModelsOnly").checked : null,
    mode: document.getElementById("chatMode") ? document.getElementById("chatMode").value : "",
    promptOptimizationChecked: document.getElementById("promptOptimization") ? document.getElementById("promptOptimization").checked : null,
    promptOptimizationLabel: document.querySelector(".prompt-toggle em") ? document.querySelector(".prompt-toggle em").textContent : "",
    workflowPresetValue: document.getElementById("workflowPresetSelect") ? document.getElementById("workflowPresetSelect").value : "",
    workflowPresetOptions: Array.from(document.querySelectorAll("#workflowPresetSelect option")).map((option) => ({ value: option.value, text: option.textContent })),
    workflowInsertDisabled: document.getElementById("applyWorkflowPresetButton") ? document.getElementById("applyWorkflowPresetButton").disabled : null,
    checkDisabled: document.getElementById("checkAgentButton") ? document.getElementById("checkAgentButton").disabled : null,
    promptValue: document.getElementById("chatPrompt") ? document.getElementById("chatPrompt").value : "",
    sendButtonText: document.getElementById("sendChatButton") ? document.getElementById("sendChatButton").textContent : "",
    sendButtonTitle: document.getElementById("sendChatButton") ? document.getElementById("sendChatButton").title : "",
    sendDisabled: document.getElementById("sendChatButton") ? document.getElementById("sendChatButton").disabled : null,
    planRunStatus: document.getElementById("planRunStatus") ? document.getElementById("planRunStatus").textContent : "",
    planRunStatusClass: document.getElementById("planRunStatus") ? document.getElementById("planRunStatus").className : "",
    dryRunTitle: document.getElementById("dryRunPlanButton") ? document.getElementById("dryRunPlanButton").title : "",
    runTitle: document.getElementById("runPlanButton") ? document.getElementById("runPlanButton").title : "",
    dryRunDisabled: document.getElementById("dryRunPlanButton") ? document.getElementById("dryRunPlanButton").disabled : null,
    runDisabled: document.getElementById("runPlanButton") ? document.getElementById("runPlanButton").disabled : null,
    chatHistoryValue: document.getElementById("chatHistorySelect") ? document.getElementById("chatHistorySelect").value : "",
    chatHistoryOptions: Array.from(document.querySelectorAll("#chatHistorySelect option")).map((option) => ({ value: option.value, text: option.textContent })),
    workingExists: !!document.querySelector(".chat-message.chat-working"),
    workingText: document.querySelector(".chat-message.chat-working .typing-indicator") ? document.querySelector(".chat-message.chat-working .typing-indicator").textContent : "",
    workingDots: document.querySelectorAll(".chat-message.chat-working .typing-dots i").length,
    transcript: document.getElementById("chatTranscript") ? document.getElementById("chatTranscript").innerText.slice(0, 16000) : "",
    log: document.getElementById("log") ? document.getElementById("log").innerText.slice(0, 4000) : "",
    confirmMessages: window.__codexPanelConfirmMessages || []
  }))()`;
}

async function waitFor(send, label, predicate, timeoutMs) {
  const startedAt = Date.now();
  let state = null;
  while (Date.now() - startedAt < timeoutMs) {
    state = await evaluate(send, stateExpression());
    if (predicate(state)) return state;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const error = new Error(`Timed out waiting for ${label}.`);
  error.state = state;
  throw error;
}

function setupExpression() {
  return `(() => {
    function setValue(el, value) {
      if (!el) return;
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    setValue(document.getElementById("bridgeUrl"), ${JSON.stringify(BRIDGE_URL)});
    setValue(document.getElementById("bridgeToken"), ${JSON.stringify(BRIDGE_TOKEN)});
    localStorage.setItem("codexAeBridgeUrl", ${JSON.stringify(BRIDGE_URL)});
    localStorage.setItem("codexAeBridgeToken", ${JSON.stringify(BRIDGE_TOKEN)});
    localStorage.setItem("codexAeBridgeAutoConnect", "1");
    window.__codexPanelConfirmMessages = [];

    const clearButton = document.getElementById("clearChatButton");
    if (clearButton) clearButton.click();
    const connectButton = document.getElementById("connectButton");
    if (connectButton) connectButton.click();
    return true;
  })()`;
}

function selectAgentExpression(prompt) {
  const promptText = prompt || PROMPT;
  return `(() => {
    function setValue(el, value) {
      if (!el) return;
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    setValue(document.getElementById("agentSelect"), ${JSON.stringify(AGENT_ID)});
    setValue(document.getElementById("agentModel"), ${JSON.stringify(MODEL)});
    setValue(document.getElementById("chatMode"), "plan");
    setValue(document.getElementById("chatPrompt"), ${JSON.stringify(promptText)});
    return ${stateExpression()};
  })()`;
}

function selectOpenAiCliExpression() {
  return `(() => {
    function setValue(el, value) {
      if (!el) return;
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    localStorage.setItem("codexAeProviderGroup", "openai");
    localStorage.setItem("codexAeOpenAiAuthMode", "cli");
    localStorage.setItem("codexAeChatMode", "chat");
    localStorage.setItem("codexAeAgentModel:${OPENAI_CLI_AGENT_ID}", ${JSON.stringify(OPENAI_CLI_MODEL)});

    const providerButton = document.querySelector("#providerTabs [data-provider-group='openai']");
    if (providerButton) providerButton.click();
    const authButton = document.querySelector("#authModeTabs [data-auth-mode='cli']");
    if (authButton) authButton.click();
    const chatButton = document.querySelector("#chatModeTabs [data-chat-mode='chat']");
    if (chatButton) chatButton.click();

    setValue(document.getElementById("agentSelect"), ${JSON.stringify(OPENAI_CLI_AGENT_ID)});
    setValue(document.getElementById("agentModel"), ${JSON.stringify(OPENAI_CLI_MODEL)});
    setValue(document.getElementById("chatMode"), "chat");
    setValue(document.getElementById("chatPrompt"), ${JSON.stringify(OPENAI_CLI_PROMPT)});
    return ${stateExpression()};
  })()`;
}

function selectOpenAiApiExpression() {
  return `(() => {
    function setValue(el, value) {
      if (!el) return;
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    localStorage.setItem("codexAeProviderGroup", "openai");
    localStorage.setItem("codexAeOpenAiAuthMode", "api");
    localStorage.setItem("codexAeAgentModel:${OPENAI_API_AGENT_ID}", ${JSON.stringify(OPENAI_API_MODEL)});

    const providerButton = document.querySelector("#providerTabs [data-provider-group='openai']");
    if (providerButton) providerButton.click();
    const authButton = document.querySelector("#authModeTabs [data-auth-mode='api']");
    if (authButton) authButton.click();

    setValue(document.getElementById("agentSelect"), ${JSON.stringify(OPENAI_API_AGENT_ID)});
    setValue(document.getElementById("agentModel"), ${JSON.stringify(OPENAI_API_MODEL)});
    setValue(document.getElementById("chatMode"), "chat");
    setValue(document.getElementById("chatPrompt"), "OpenAI API setup smoke");
    return ${stateExpression()};
  })()`;
}

function providerStorageExpression() {
  return `(() => ({
    providerGroup: localStorage.getItem("codexAeProviderGroup"),
    authMode: localStorage.getItem("codexAeOpenAiAuthMode"),
    agentId: localStorage.getItem("codexAeAgentId")
  }))()`;
}

function writeProviderStorageExpression(values) {
  const storage = values || {};
  return `(() => {
    const values = ${JSON.stringify(storage)};
    function write(key, value) {
      if (value === null || value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
    write("codexAeProviderGroup", values.providerGroup);
    write("codexAeOpenAiAuthMode", values.authMode);
    write("codexAeAgentId", values.agentId);
    return true;
  })()`;
}

function sidebarStorageExpression() {
  return `(() => ({
    collapsed: localStorage.getItem("codexAeSidebarCollapsed")
  }))()`;
}

function writeSidebarStorageExpression(values) {
  const storage = values || {};
  return `(() => {
    const value = ${JSON.stringify(storage.collapsed)};
    if (value === null || value === undefined) localStorage.removeItem("codexAeSidebarCollapsed");
    else localStorage.setItem("codexAeSidebarCollapsed", value);
    return true;
  })()`;
}

function diagnosticsStorageExpression() {
  return `(() => ({
    open: localStorage.getItem("codexAeDiagnosticsOpen")
  }))()`;
}

function writeDiagnosticsStorageExpression(values) {
  const storage = values || {};
  return `(() => {
    const value = ${JSON.stringify(storage.open)};
    if (value === null || value === undefined) localStorage.removeItem("codexAeDiagnosticsOpen");
    else localStorage.setItem("codexAeDiagnosticsOpen", value);
    return true;
  })()`;
}

function selectProviderGroupExpression(group) {
  return `(() => {
    const providerButton = document.querySelector("#providerTabs [data-provider-group='" + ${JSON.stringify(group)} + "']");
    if (!providerButton) return { ok: false, error: "missing provider button" };
    providerButton.click();
    return { ok: true, state: ${stateExpression()} };
  })()`;
}

function clickExpression(id) {
  return `(() => {
    const el = document.getElementById(${JSON.stringify(id)});
    if (!el) return { ok: false, error: "missing" };
    const before = { disabled: !!el.disabled, text: el.textContent };
    if (!el.disabled) el.click();
    return { ok: !before.disabled, before, state: ${stateExpression()} };
  })()`;
}

function selectWorkflowPresetExpression(value) {
  return `(() => {
    const select = document.getElementById("workflowPresetSelect");
    if (!select) return { ok: false, error: "missing workflow preset select" };
    select.value = ${JSON.stringify(value)};
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true, state: ${stateExpression()} };
  })()`;
}

function fillApiKeyExpression(value) {
  return `(() => {
    const el = document.getElementById("agentApiKey");
    if (!el) return { ok: false, error: "missing api key input" };
    el.value = ${JSON.stringify(value)};
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true, state: ${stateExpression()} };
  })()`;
}

function installConfirmExpression() {
  return `(() => {
    window.__codexPanelConfirmMessages = [];
    window.confirm = function (message) {
      window.__codexPanelConfirmMessages.push(String(message || ""));
      throw new Error("Unexpected confirm: " + String(message || ""));
    };
    return true;
  })()`;
}

function historyStorageExpression() {
  return `(() => ({
    sessions: localStorage.getItem("codexAeChatSessions"),
    active: localStorage.getItem("codexAeActiveChatSessionId"),
    transcript: localStorage.getItem("codexAeChatTranscript")
  }))()`;
}

function writeHistoryStorageExpression(values) {
  const storage = values || {};
  return `(() => {
    const values = ${JSON.stringify(storage)};
    function write(key, value) {
      if (value === null || value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
    write("codexAeChatSessions", values.sessions);
    write("codexAeActiveChatSessionId", values.active);
    write("codexAeChatTranscript", values.transcript);
    return true;
  })()`;
}

function composerStateExpression() {
  return `(() => ({
    mode: localStorage.getItem("codexAeChatMode"),
    promptOptimization: localStorage.getItem("codexAePromptOptimization"),
    prompt: document.getElementById("chatPrompt") ? document.getElementById("chatPrompt").value : ""
  }))()`;
}

function writeComposerStateExpression(values) {
  const storage = values || {};
  return `(() => {
    const values = ${JSON.stringify(storage)};
    function write(key, value) {
      if (value === null || value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
    write("codexAeChatMode", values.mode);
    write("codexAePromptOptimization", values.promptOptimization);
    const prompt = document.getElementById("chatPrompt");
    if (prompt) {
      prompt.value = values.prompt || "";
      prompt.dispatchEvent(new Event("input", { bubbles: true }));
      prompt.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return true;
  })()`;
}

function bridgeStorageExpression() {
  return `(() => ({
    url: localStorage.getItem("codexAeBridgeUrl"),
    token: localStorage.getItem("codexAeBridgeToken"),
    autoConnect: localStorage.getItem("codexAeBridgeAutoConnect")
  }))()`;
}

function writeBridgeStorageExpression(values) {
  const storage = values || {};
  return `(() => {
    const values = ${JSON.stringify(storage)};
    function write(key, value) {
      if (value === null || value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
    write("codexAeBridgeUrl", values.url);
    write("codexAeBridgeToken", values.token);
    write("codexAeBridgeAutoConnect", values.autoConnect);
    return true;
  })()`;
}

function offlineBridgeStorage() {
  return {
    url: process.env.CEP_PANEL_OFFLINE_URL || "http://127.0.0.1:59999",
    token: "offline-smoke-token",
    autoConnect: "1"
  };
}

function historyFixtureStorage() {
  const sessions = [
    {
      id: "history-smoke-one",
      title: "First saved prompt",
      updatedAt: new Date().toISOString(),
      transcript: [
        { role: "user", text: "First saved prompt" },
        { role: "assistant", text: "First saved answer" }
      ],
      chatMessages: [
        { role: "user", content: "First saved prompt" },
        { role: "assistant", content: "First saved answer" }
      ]
    },
    {
      id: "history-smoke-two",
      title: "Second saved prompt",
      updatedAt: new Date().toISOString(),
      transcript: [
        { role: "user", text: "Second saved prompt" },
        { role: "assistant", text: "Second saved answer" }
      ],
      chatMessages: [
        { role: "user", content: "Second saved prompt" },
        { role: "assistant", content: "Second saved answer" }
      ]
    }
  ];
  return {
    sessions: JSON.stringify(sessions),
    active: "history-smoke-one",
    transcript: JSON.stringify(sessions[0].transcript)
  };
}

function selectHistoryExpression(value) {
  return `(() => {
    const select = document.getElementById("chatHistorySelect");
    if (!select) return { ok: false, error: "missing chatHistorySelect" };
    select.value = ${JSON.stringify(value)};
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true, state: ${stateExpression()} };
  })()`;
}

async function inspect() {
  const { page, ws, send } = await connectToPanel();
  try {
    const state = await evaluate(send, stateExpression());
    console.log(JSON.stringify({ page: { title: page.title, url: page.url }, state }, null, 2));
  } finally {
    ws.close();
  }
}

async function reloadPanel() {
  const { page, ws, send } = await connectToPanel();
  try {
    await send("Page.enable");
    await send("Page.reload", { ignoreCache: true });
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const state = await evaluate(send, stateExpression());
    console.log(JSON.stringify({ page: { title: page.title, url: page.url }, state }, null, 2));
  } finally {
    ws.close();
  }
}

async function smoke() {
  const { page, ws, send } = await connectToPanel();
  try {
    await reloadActivePage(send);
    await evaluate(send, setupExpression());
    await waitFor(send, "panel online", (state) => state.badge === "online", 15000);
    await waitFor(send, "agent list", (state) => state.agentOptions.some((option) => option.value === AGENT_ID), 20000);
    await evaluate(send, selectAgentExpression(PROMPT));
    await waitFor(send, "selected agent ready", (state) => (
      state.agentValue === AGENT_ID &&
      state.model === MODEL &&
      state.mode === "plan" &&
      state.sendDisabled === false &&
      state.agentDetails.indexOf("Provider:") >= 0
    ), 20000);

    const checked = await evaluate(send, clickExpression("checkAgentButton"));
    if (!checked || !checked.ok) throw new Error("Check model button was not clickable.");
    await waitFor(send, "checked agent ready", (state) => (
      state.agentValue === AGENT_ID &&
      state.model === MODEL &&
      state.sendDisabled === false &&
      state.checkDisabled === false
    ), 30000);

    const sent = await evaluate(send, clickExpression("sendChatButton"));
    if (!sent || !sent.ok) throw new Error("Send button was not clickable.");
    await waitFor(send, "planning indicator", (state) => (
      state.workingExists === true &&
      state.workingText.indexOf("Planning") >= 0 &&
      state.workingDots === 3
    ), 5000);

    const planned = await waitFor(send, "AE Plan result", (state) => (
      state.sendDisabled === false &&
      state.transcript.indexOf("Plan review: ready") >= 0 &&
      state.transcript.indexOf("Validation: ok") >= 0 &&
      state.transcript.indexOf("0 mutating") >= 0 &&
      state.transcript.indexOf("Affected targets:") >= 0 &&
      state.transcript.indexOf("Run readiness:") >= 0 &&
      state.planRunStatus === "Read-only plan ready" &&
      state.planRunStatusClass.indexOf("read-only") >= 0 &&
      state.runTitle.indexOf("read-only") >= 0 &&
      state.dryRunDisabled === false &&
      state.runDisabled === false
    ), WAIT_MS);

    const dryRunClicked = await evaluate(send, clickExpression("dryRunPlanButton"));
    if (!dryRunClicked || !dryRunClicked.ok) throw new Error("Dry run button was not clickable.");
    const dryRun = await waitFor(send, "dry run result", (state) => (
      state.sendDisabled === false &&
      state.transcript.indexOf("Dry run: ok") >= 0 &&
      state.transcript.indexOf("Mode: preview only; project was not changed.") >= 0 &&
      state.transcript.indexOf("Checkpoint/edit session: not needed for read-only dry run.") >= 0
    ), 30000);

    await evaluate(send, installConfirmExpression());
    const runClicked = await evaluate(send, clickExpression("runPlanButton"));
    if (!runClicked || !runClicked.ok) throw new Error("Run plan button was not clickable.");
    const run = await waitFor(send, "run result", (state) => (
      state.sendDisabled === false &&
      state.transcript.indexOf("Run: ok") >= 0 &&
      state.transcript.indexOf("Checkpoint/edit session: not needed for read-only run.") >= 0 &&
      state.transcript.indexOf("verification") < 0
    ), 60000).catch(async () => {
      return waitFor(send, "run result with verification text", (state) => (
        state.sendDisabled === false &&
        state.transcript.indexOf("Run: ok") >= 0 &&
        state.transcript.indexOf("Checkpoint/edit session: not needed for read-only run.") >= 0
      ), 5000);
    });

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      planned: {
        agent: planned.agentValue,
        model: planned.model,
        agentDetails: planned.agentDetails,
        transcriptTail: planned.transcript.slice(-3000)
      },
      dryRun: {
        transcriptTail: dryRun.transcript.slice(-3000)
      },
      run: {
        transcriptTail: run.transcript.slice(-3000),
        logTail: run.log.slice(-1200)
      }
    }, null, 2));
  } finally {
    ws.close();
  }
}

async function planReviewSmoke() {
  const { page, ws, send } = await connectToPanel();
  try {
    await reloadActivePage(send);
    await evaluate(send, setupExpression());
    await waitFor(send, "panel online", (state) => state.badge === "online", 15000);
    await waitFor(send, "agent list", (state) => state.agentOptions.some((option) => option.value === AGENT_ID), 20000);
    await evaluate(send, selectAgentExpression(PROMPT));
    await waitFor(send, "selected agent ready", (state) => (
      state.agentValue === AGENT_ID &&
      state.model === MODEL &&
      state.mode === "plan" &&
      state.sendDisabled === false
    ), 20000);

    const sent = await evaluate(send, clickExpression("sendChatButton"));
    if (!sent || !sent.ok) throw new Error("Send button was not clickable.");

    const planned = await waitFor(send, "improved plan review text", (state) => (
      state.sendDisabled === false &&
      state.transcript.indexOf("Plan review: ready") >= 0 &&
      state.transcript.indexOf("Validation: ok") >= 0 &&
      state.transcript.indexOf("Affected targets:") >= 0 &&
      state.transcript.indexOf("Mutations:") >= 0 &&
      state.transcript.indexOf("Checkpoint expectation:") >= 0 &&
      state.transcript.indexOf("Run readiness:") >= 0 &&
      state.planRunStatus === "Read-only plan ready" &&
      state.planRunStatusClass.indexOf("read-only") >= 0 &&
      state.dryRunDisabled === false &&
      state.runDisabled === false
    ), WAIT_MS);

    const dryRunClicked = await evaluate(send, clickExpression("dryRunPlanButton"));
    if (!dryRunClicked || !dryRunClicked.ok) throw new Error("Dry run button was not clickable.");
    const dryRun = await waitFor(send, "improved dry run text", (state) => (
      state.sendDisabled === false &&
      state.transcript.indexOf("Dry run: ok") >= 0 &&
      state.transcript.indexOf("Mode: preview only; project was not changed.") >= 0 &&
      state.transcript.indexOf("Checkpoint/edit session: not needed for read-only dry run.") >= 0 &&
      state.transcript.indexOf("Affected targets:") >= 0
    ), 30000);

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      planned: {
        status: planned.planRunStatus,
        statusClass: planned.planRunStatusClass,
        transcriptTail: planned.transcript.slice(-3000)
      },
      dryRun: {
        transcriptTail: dryRun.transcript.slice(-3000)
      }
    }, null, 2));
  } finally {
    ws.close();
  }
}

async function openAiApiSetupSmoke() {
  const { page, ws, send } = await connectToPanel();
  try {
    await reloadActivePage(send);
    await evaluate(send, setupExpression());
    await waitFor(send, "panel online", (state) => state.badge === "online", 15000);
    await waitFor(send, "OpenAI API agent list", (state) => (
      state.agentOptions.some((option) => option.value === OPENAI_API_AGENT_ID)
    ), 20000);
    await evaluate(send, selectOpenAiApiExpression());
    const selected = await waitFor(send, "OpenAI API selected", (state) => (
      state.agentValue === OPENAI_API_AGENT_ID &&
      state.model === OPENAI_API_MODEL &&
      state.apiKeyVisible === true &&
      state.setupTitle.indexOf("OpenAI API") >= 0
    ), 30000);

    const keySaved = selected.agentDetails.indexOf("Setup: key saved") >= 0 || selected.sendDisabled === false;
    if (keySaved) {
      console.log(JSON.stringify({
        ok: true,
        skipped: true,
        reason: "OpenAI API is configured in this environment; no-key disabled state is not expected.",
        page: { title: page.title, url: page.url },
        state: selected
      }, null, 2));
      return;
    }

    const noKey = await waitFor(send, "OpenAI API no-key state", (state) => (
      state.agentValue === OPENAI_API_AGENT_ID &&
      state.sendDisabled === true &&
      state.agentDetails.indexOf("Setup: key required") >= 0 &&
      state.setupText.indexOf("OpenAI API billing") >= 0 &&
      state.modelOptions.some((option) => option.value === OPENAI_API_MODEL && option.text.indexOf("No API key") >= 0)
    ), 10000);

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      agentDetails: noKey.agentDetails,
      modelOptions: noKey.modelOptions,
      setupText: noKey.setupText
    }, null, 2));
  } finally {
    ws.close();
  }
}

async function providerSetupSmoke() {
  const { page, ws, send } = await connectToPanel();
  let backup = null;
  let bridgeBackup = null;
  try {
    backup = await evaluate(send, providerStorageExpression());
    bridgeBackup = await evaluate(send, bridgeStorageExpression());
    await reloadActivePage(send);
    await evaluate(send, setupExpression());
    await waitFor(send, "panel online", (state) => state.badge === "online", 15000);
    await waitFor(send, "agent list", (state) => state.agentOptions.some((option) => option.value === OPENAI_CLI_AGENT_ID), 20000);

    const results = [];
    for (const group of ["gemini", "claude"]) {
      const clicked = await evaluate(send, selectProviderGroupExpression(group));
      if (!clicked || !clicked.ok) throw new Error(`Could not click ${group} provider tab.`);
      const label = group === "gemini" ? "Gemini" : "Claude";
      const agentId = group === "gemini" ? "gemini-api" : "claude-api";
      const selected = await waitFor(send, `${label} setup selected`, (state) => (
        state.activeProviderGroup === group &&
        state.agentValue === agentId &&
        state.setupTitle.indexOf(label) >= 0 &&
        state.setupText.indexOf("API billing") >= 0 &&
        state.agentDetails.indexOf("Setup: key required") >= 0 &&
        state.authModeVisible === false &&
        state.apiKeyVisible === true &&
        state.localServiceVisible === false &&
        state.setupActionVisible === false &&
        state.sendDisabled === true &&
        state.modelOptions.length > 0 &&
        state.modelOptions.some((option) => option.text.indexOf("No API key") >= 0)
      ), 10000);
      results.push({
        group,
        agent: selected.agentValue,
        setupTitle: selected.setupTitle,
        agentStatus: selected.agentStatus,
        agentDetails: selected.agentDetails,
        modelOptions: selected.modelOptions
      });
    }

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      providers: results
    }, null, 2));
  } finally {
    if (backup) {
      try {
        await evaluate(send, writeProviderStorageExpression(backup));
        if (bridgeBackup) await evaluate(send, writeBridgeStorageExpression(bridgeBackup));
        await reloadActivePage(send);
      } catch (_error) {}
    }
    ws.close();
  }
}

async function providerPlaceholderSmoke() {
  return providerSetupSmoke();
}

async function providerKeySaveSmoke() {
  if (process.env.CEP_PANEL_ALLOW_KEY_SAVE_SMOKE !== "1") {
    throw new Error("provider-key-save-smoke writes test API keys. Run scripts/provider-key-save-smoke.js so the bridge uses an isolated temporary secrets file.");
  }

  const { page, ws, send } = await connectToPanel();
  let backup = null;
  let bridgeBackup = null;
  try {
    backup = await evaluate(send, providerStorageExpression());
    bridgeBackup = await evaluate(send, bridgeStorageExpression());
    await reloadActivePage(send);
    await evaluate(send, setupExpression());
    await waitFor(send, "panel online", (state) => state.badge === "online", 15000);
    await waitFor(send, "provider agent list", (state) => (
      state.agentOptions.some((option) => option.value === "gemini-api") &&
      state.agentOptions.some((option) => option.value === "claude-api")
    ), 20000);

    const results = [];
    for (const group of ["gemini", "claude"]) {
      const clicked = await evaluate(send, selectProviderGroupExpression(group));
      if (!clicked || !clicked.ok) throw new Error(`Could not click ${group} provider tab.`);

      const label = group === "gemini" ? "Gemini" : "Claude";
      const agentId = group === "gemini" ? "gemini-api" : "claude-api";
      const key = `${group}-panel-smoke-key-${Date.now()}`;

      const selected = await waitFor(send, `${label} API key entry ready`, (state) => (
        state.activeProviderGroup === group &&
        state.agentValue === agentId &&
        state.apiKeyVisible === true &&
        state.saveKeyDisabled === true &&
        state.agentDetails.indexOf("Setup: key required") >= 0
      ), 10000);

      const filled = await evaluate(send, fillApiKeyExpression(key));
      if (!filled || !filled.ok) throw new Error(`Could not fill ${label} API key.`);
      await waitFor(send, `${label} save key enabled`, (state) => (
        state.agentValue === agentId &&
        state.apiKeyValue === key &&
        state.saveKeyDisabled === false
      ), 10000);

      const savedClick = await evaluate(send, clickExpression("saveAgentKeyButton"));
      if (!savedClick || !savedClick.ok) throw new Error(`${label} Save key button was not clickable.`);
      const saved = await waitFor(send, `${label} key saved`, (state) => (
        state.agentValue === agentId &&
        state.apiKeyValue === "" &&
        state.agentDetails.indexOf("Setup: key saved") >= 0 &&
        state.sendDisabled === false &&
        state.modelOptions.length > 0 &&
        state.modelOptions.every((option) => option.text.indexOf("No API key") < 0)
      ), 30000);

      results.push({
        group,
        agent: saved.agentValue,
        setupTitle: saved.setupTitle,
        agentStatus: saved.agentStatus,
        agentDetails: saved.agentDetails,
        modelOptions: saved.modelOptions,
        saveKeyText: selected.saveKeyText
      });
    }

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      providers: results
    }, null, 2));
  } finally {
    if (backup) {
      try {
        await evaluate(send, writeProviderStorageExpression(backup));
        if (bridgeBackup) await evaluate(send, writeBridgeStorageExpression(bridgeBackup));
        await reloadActivePage(send);
      } catch (_error) {}
    }
    ws.close();
  }
}

async function sidebarCollapseSmoke() {
  const { page, ws, send } = await connectToPanel();
  let backup = null;
  try {
    backup = await evaluate(send, sidebarStorageExpression());
    await evaluate(send, writeSidebarStorageExpression({ collapsed: "0" }));
    await reloadActivePage(send);
    await waitFor(send, "sidebar expanded", (state) => (
      state.sidebarCollapsed === false &&
      state.collapseButtonText === "<" &&
      state.collapseButtonExpanded === "true"
    ), 10000);

    const collapseClick = await evaluate(send, clickExpression("collapseSidebarButton"));
    if (!collapseClick || !collapseClick.ok) throw new Error("Collapse sidebar button was not clickable.");
    const collapsed = await waitFor(send, "sidebar collapsed", (state) => (
      state.sidebarCollapsed === true &&
      state.collapseButtonText === ">" &&
      state.collapseButtonTitle === "Show provider panel" &&
      state.collapseButtonExpanded === "false"
    ), 10000);

    const expandClick = await evaluate(send, clickExpression("collapseSidebarButton"));
    if (!expandClick || !expandClick.ok) throw new Error("Expand sidebar button was not clickable.");
    const expanded = await waitFor(send, "sidebar expanded again", (state) => (
      state.sidebarCollapsed === false &&
      state.collapseButtonText === "<" &&
      state.collapseButtonTitle === "Collapse provider panel" &&
      state.collapseButtonExpanded === "true"
    ), 10000);

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      collapsed: {
        text: collapsed.collapseButtonText,
        title: collapsed.collapseButtonTitle,
        ariaExpanded: collapsed.collapseButtonExpanded
      },
      expanded: {
        text: expanded.collapseButtonText,
        title: expanded.collapseButtonTitle,
        ariaExpanded: expanded.collapseButtonExpanded
      }
    }, null, 2));
  } finally {
    if (backup) {
      try {
        await evaluate(send, writeSidebarStorageExpression(backup));
        await reloadActivePage(send);
      } catch (_error) {}
    }
    ws.close();
  }
}

async function diagnosticsSmoke() {
  const { page, ws, send } = await connectToPanel();
  let backup = null;
  try {
    backup = await evaluate(send, diagnosticsStorageExpression());
    await evaluate(send, writeDiagnosticsStorageExpression({ open: "0" }));
    await reloadActivePage(send);
    await waitFor(send, "diagnostics closed", (state) => (
      state.diagnosticsOpen === false &&
      state.diagnosticsDisplay === "none" &&
      state.diagnosticsButtonText === "Log" &&
      state.diagnosticsButtonExpanded === "false"
    ), 10000);

    const openClick = await evaluate(send, clickExpression("diagnosticsButton"));
    if (!openClick || !openClick.ok) throw new Error("Diagnostics button was not clickable.");
    const opened = await waitFor(send, "diagnostics open", (state) => (
      state.diagnosticsOpen === true &&
      state.diagnosticsDisplay !== "none" &&
      state.diagnosticsButtonText === "Hide log" &&
      state.diagnosticsButtonTitle === "Hide activity log" &&
      state.diagnosticsButtonExpanded === "true"
    ), 10000);

    const closeClick = await evaluate(send, clickExpression("diagnosticsButton"));
    if (!closeClick || !closeClick.ok) throw new Error("Diagnostics close button was not clickable.");
    const closed = await waitFor(send, "diagnostics closed again", (state) => (
      state.diagnosticsOpen === false &&
      state.diagnosticsDisplay === "none" &&
      state.diagnosticsButtonText === "Log" &&
      state.diagnosticsButtonTitle === "Show activity log" &&
      state.diagnosticsButtonExpanded === "false"
    ), 10000);

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      opened: {
        display: opened.diagnosticsDisplay,
        text: opened.diagnosticsButtonText,
        ariaExpanded: opened.diagnosticsButtonExpanded
      },
      closed: {
        display: closed.diagnosticsDisplay,
        text: closed.diagnosticsButtonText,
        ariaExpanded: closed.diagnosticsButtonExpanded
      }
    }, null, 2));
  } finally {
    if (backup) {
      try {
        await evaluate(send, writeDiagnosticsStorageExpression(backup));
        await reloadActivePage(send);
      } catch (_error) {}
    }
    ws.close();
  }
}

async function sendButtonSmoke() {
  const { page, ws, send } = await connectToPanel();
  try {
    await reloadActivePage(send);
    const state = await waitFor(send, "stable send button label", (item) => (
      item.sendButtonText === ">" &&
      item.sendButtonTitle === "Send"
    ), 10000);

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      sendButton: {
        text: state.sendButtonText,
        title: state.sendButtonTitle,
        disabled: state.sendDisabled
      }
    }, null, 2));
  } finally {
    ws.close();
  }
}

async function brandingSmoke() {
  const { page, ws, send } = await connectToPanel();
  try {
    await reloadActivePage(send);
    const state = await waitFor(send, "AE Agent branding", (item) => (
      item.title === "AE Agent 1.0.0" &&
      item.windowBarExists === false &&
      item.windowBarText === "" &&
      item.windowBarText.indexOf("AE GPT") < 0 &&
      item.appTitleExists === false &&
      item.appTitle === "" &&
      item.appVersionExists === false &&
      item.appVersion === ""
    ), 10000);

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      branding: {
        title: state.title,
        windowBarExists: state.windowBarExists,
        windowBarText: state.windowBarText,
        appTitleExists: state.appTitleExists,
        appTitle: state.appTitle,
        appVersionExists: state.appVersionExists,
        appVersion: state.appVersion
      }
    }, null, 2));
  } finally {
    ws.close();
  }
}

async function openAiCliSmoke() {
  const { page, ws, send } = await connectToPanel();
  try {
    await reloadActivePage(send);
    await evaluate(send, setupExpression());
    await waitFor(send, "panel online", (state) => state.badge === "online", 15000);
    await waitFor(send, "OpenAI CLI agent list", (state) => (
      state.agentOptions.some((option) => option.value === OPENAI_CLI_AGENT_ID)
    ), 20000);
    await evaluate(send, selectOpenAiCliExpression());
    await waitFor(send, "OpenAI CLI selected", (state) => (
      state.agentValue === OPENAI_CLI_AGENT_ID &&
      state.model === OPENAI_CLI_MODEL &&
      state.mode === "chat" &&
      state.sendDisabled === false &&
      state.agentDetails.indexOf("codex exec") >= 0
    ), 30000);

    const checked = await evaluate(send, clickExpression("checkAgentButton"));
    if (!checked || !checked.ok) throw new Error("Check model button was not clickable for OpenAI CLI.");
    await waitFor(send, "OpenAI CLI checked ready", (state) => (
      state.agentValue === OPENAI_CLI_AGENT_ID &&
      state.model === OPENAI_CLI_MODEL &&
      state.sendDisabled === false &&
      state.checkDisabled === false &&
      state.agentDetails.indexOf("Status") >= 0
    ), 45000);

    const sent = await evaluate(send, clickExpression("sendChatButton"));
    if (!sent || !sent.ok) throw new Error("Send button was not clickable for OpenAI CLI.");
    const replied = await waitFor(send, "OpenAI CLI chat reply", (state) => (
      state.sendDisabled === false &&
      state.transcript.indexOf("AE Agent CLI OK") >= 0
    ), OPENAI_CLI_WAIT_MS);

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      agent: replied.agentValue,
      model: replied.model,
      agentDetails: replied.agentDetails,
      transcriptTail: replied.transcript.slice(-3000),
      logTail: replied.log.slice(-1200)
    }, null, 2));
  } finally {
    ws.close();
  }
}

async function openAiCliSetupSmoke() {
  const { page, ws, send } = await connectToPanel();
  try {
    await reloadActivePage(send);
    await evaluate(send, setupExpression());
    await waitFor(send, "panel online", (state) => state.badge === "online", 15000);
    await waitFor(send, "OpenAI CLI agent list", (state) => (
      state.agentOptions.some((option) => option.value === OPENAI_CLI_AGENT_ID)
    ), 20000);
    await evaluate(send, selectOpenAiCliExpression());
    const selected = await waitFor(send, "OpenAI CLI setup action visible", (state) => (
      state.agentValue === OPENAI_CLI_AGENT_ID &&
      state.setupActionVisible === true &&
      (
        state.setupActionText.indexOf("Sign in with ChatGPT") >= 0 ||
        state.setupActionText.indexOf("Signed in") >= 0 ||
        state.setupActionText.indexOf("Install Codex CLI") >= 0
      )
    ), 30000);

    const dryRun = await postBridge("/agents/setup", {
      agentId: OPENAI_CLI_AGENT_ID,
      action: "codex_login",
      dryRun: true
    });

    if (dryRun.status >= 400 || !dryRun.body || dryRun.body.ok !== true) {
      throw new Error(`OpenAI CLI setup dry run failed: ${(dryRun.body && dryRun.body.error) || `HTTP ${dryRun.status}`}`);
    }

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      selected: {
        agent: selected.agentValue,
        setupTitle: selected.setupTitle,
        setupText: selected.setupText,
        setupActionText: selected.setupActionText,
        setupActionDisabled: selected.setupActionDisabled
      },
      dryRun: dryRun.body.setup
    }, null, 2));
  } finally {
    ws.close();
  }
}

async function workflowPresetSmoke() {
  const { page, ws, send } = await connectToPanel();
  let historyBackup = null;
  let composerBackup = null;
  try {
    historyBackup = await evaluate(send, historyStorageExpression());
    composerBackup = await evaluate(send, composerStateExpression());
    await evaluate(send, writeHistoryStorageExpression(historyFixtureStorage()));
    await reloadActivePage(send);

    const restored = await waitFor(send, "workflow preset controls", (state) => (
      state.chatHistoryValue === "history-smoke-one" &&
      state.transcript.indexOf("First saved prompt") >= 0 &&
      state.workflowPresetOptions.some((option) => option.value === "selected-layer-timing") &&
      state.workflowPresetOptions.some((option) => option.value === "precompose-rename") &&
      state.workflowPresetOptions.some((option) => option.value === "text-shape-layout") &&
      state.workflowPresetOptions.some((option) => option.value === "basic-animation") &&
      state.workflowPresetOptions.some((option) => option.value === "replace-source") &&
      state.workflowInsertDisabled === true
    ), 15000);

    const selected = await evaluate(send, selectWorkflowPresetExpression("selected-layer-timing"));
    if (!selected || !selected.ok) throw new Error("Could not select workflow preset.");
    const ready = await waitFor(send, "workflow preset insert enabled", (state) => (
      state.workflowPresetValue === "selected-layer-timing" &&
      state.workflowInsertDisabled === false
    ), 10000);

    const insertedClick = await evaluate(send, clickExpression("applyWorkflowPresetButton"));
    if (!insertedClick || !insertedClick.ok) throw new Error("Workflow preset insert button was not clickable.");
    const inserted = await waitFor(send, "workflow preset inserted", (state) => (
      state.mode === "plan" &&
      state.promptOptimizationChecked === true &&
      state.promptOptimizationLabel === "On" &&
      state.workflowPresetValue === "" &&
      state.workflowInsertDisabled === true &&
      state.promptValue.indexOf("aligns them to the current time indicator") >= 0 &&
      state.promptValue.indexOf("align_layers_to_time") >= 0 &&
      state.promptValue.indexOf("Do not use raw ExtendScript") >= 0 &&
      state.transcript.indexOf("First saved prompt") >= 0 &&
      state.transcript.indexOf("align_layers_to_time") < 0 &&
      state.chatHistoryValue === "history-smoke-one"
    ), 10000);

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      restored: {
        chatHistoryValue: restored.chatHistoryValue,
        presetOptions: restored.workflowPresetOptions
      },
      selected: {
        workflowPresetValue: ready.workflowPresetValue,
        insertDisabled: ready.workflowInsertDisabled
      },
      inserted: {
        mode: inserted.mode,
        promptOptimizationChecked: inserted.promptOptimizationChecked,
        promptPreview: inserted.promptValue.slice(0, 320),
        transcriptTail: inserted.transcript.slice(-1000)
      }
    }, null, 2));
  } finally {
    if (historyBackup || composerBackup) {
      try {
        if (historyBackup) await evaluate(send, writeHistoryStorageExpression(historyBackup));
        if (composerBackup) await evaluate(send, writeComposerStateExpression(composerBackup));
        await reloadActivePage(send);
        if (composerBackup) await evaluate(send, writeComposerStateExpression(composerBackup));
      } catch (_error) {}
    }
    ws.close();
  }
}

async function historySmoke() {
  const { page, ws, send } = await connectToPanel();
  let backup = null;
  try {
    backup = await evaluate(send, historyStorageExpression());
    await evaluate(send, writeHistoryStorageExpression(historyFixtureStorage()));
    await reloadActivePage(send);

    const restored = await waitFor(send, "restored first chat history item", (state) => (
      state.chatHistoryOptions.length >= 2 &&
      state.chatHistoryValue === "history-smoke-one" &&
      state.transcript.indexOf("First saved prompt") >= 0 &&
      state.transcript.indexOf("First saved answer") >= 0
    ), 15000);

    const selected = await evaluate(send, selectHistoryExpression("history-smoke-two"));
    if (!selected || !selected.ok) throw new Error("Could not select second chat history item.");
    const second = await waitFor(send, "selected second chat history item", (state) => (
      state.chatHistoryValue === "history-smoke-two" &&
      state.transcript.indexOf("Second saved prompt") >= 0 &&
      state.transcript.indexOf("Second saved answer") >= 0
    ), 10000);

    const newChatClicked = await evaluate(send, clickExpression("newChatButton"));
    if (!newChatClicked || !newChatClicked.ok) throw new Error("New Chat button was not clickable.");
    const newChat = await waitFor(send, "new blank chat", (state) => (
      state.chatHistoryOptions.length >= 3 &&
      state.chatHistoryValue !== "history-smoke-one" &&
      state.chatHistoryValue !== "history-smoke-two" &&
      state.transcript.replace(/\s+/g, "") === ""
    ), 10000);

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      restored: {
        chatHistoryValue: restored.chatHistoryValue,
        chatHistoryOptions: restored.chatHistoryOptions
      },
      selected: {
        chatHistoryValue: second.chatHistoryValue,
        transcriptTail: second.transcript.slice(-1000)
      },
      newChat: {
        chatHistoryValue: newChat.chatHistoryValue,
        chatHistoryOptions: newChat.chatHistoryOptions
      }
    }, null, 2));
  } finally {
    if (backup) {
      try {
        await evaluate(send, writeHistoryStorageExpression(backup));
        await reloadActivePage(send);
      } catch (_error) {}
    }
    ws.close();
  }
}

async function offlineSmoke() {
  const { page, ws, send } = await connectToPanel();
  let backup = null;
  try {
    backup = await evaluate(send, bridgeStorageExpression());
    await evaluate(send, writeBridgeStorageExpression(offlineBridgeStorage()));
    await reloadActivePage(send);

    const offline = await waitFor(send, "friendly bridge offline state", (state) => {
      const visibleText = [
        state.status,
        state.bridgeHelp,
        state.agentStatus,
        state.log
      ].join("\n");
      return (
        state.badge === "offline" &&
        state.status === "Bridge offline" &&
        state.bridgeHelp.indexOf("Bridge offline") >= 0 &&
        state.agentStatus.indexOf("Bridge offline") >= 0 &&
        visibleText.indexOf("HTTP 0") < 0 &&
        visibleText.indexOf("Network error") < 0 &&
        visibleText.indexOf("Network timeout") < 0
      );
    }, 15000);

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      state: {
        status: offline.status,
        badge: offline.badge,
        bridgeHelp: offline.bridgeHelp,
        bridgeHelpClass: offline.bridgeHelpClass,
        agentStatus: offline.agentStatus,
        logTail: offline.log.slice(-1000)
      }
    }, null, 2));
  } finally {
    if (backup) {
      try {
        await evaluate(send, writeBridgeStorageExpression(backup));
        await reloadActivePage(send);
      } catch (_error) {}
    }
    ws.close();
  }
}

function mutatingPrompt(name) {
  return [
    `Create exactly one temporary test composition named "${name}".`,
    "Use inspection first, then one create_test_comp mutation, then verification/readback.",
    "Use create_test_comp with width 320, height 180, duration 1, frameRate 24, openInViewer false.",
    "Do not add cleanup to the plan."
  ].join(" ");
}

async function cleanupMutatingSmoke(name) {
  const response = await postBridge("/agents/plan/run", {
    plan: {
      summary: `Clean up ${name}`,
      risk: "low",
      requiresCheckpoint: false,
      steps: [
        {
          title: "Remove Safe Run smoke test comps",
          tool: "cleanup_test_items",
          args: {
            namePrefix: MUTATING_PREFIX,
            maxItems: 25,
            confirm: true
          }
        }
      ]
    },
    requestId: `cep-panel-mutating-cleanup-${Date.now()}`,
    dryRun: false,
    confirm: true,
    allowMutations: true,
    autoEditSession: true,
    timeoutMs: 120000
  });

  if (response.status >= 400 || !response.body || response.body.ok !== true) {
    const error = response.body && (response.body.error || (response.body.run && response.body.run.error));
    throw new Error(`Cleanup failed: ${error || `HTTP ${response.status}`}`);
  }

  return response.body.run || null;
}

async function mutatingSmoke() {
  const suffix = String(Date.now()).slice(-8);
  const name = `${MUTATING_PREFIX} ${suffix}`;
  const { page, ws, send } = await connectToPanel();
  let cleanup = null;

  try {
    await reloadActivePage(send);
    await evaluate(send, setupExpression());
    await waitFor(send, "panel online", (state) => state.badge === "online", 15000);
    await waitFor(send, "agent list", (state) => state.agentOptions.some((option) => option.value === AGENT_ID), 20000);
    await evaluate(send, selectAgentExpression(process.env.CEP_PANEL_MUTATING_PROMPT || mutatingPrompt(name)));
    await waitFor(send, "selected agent ready", (state) => (
      state.agentValue === AGENT_ID &&
      state.model === MODEL &&
      state.mode === "plan" &&
      state.sendDisabled === false
    ), 20000);

    const sent = await evaluate(send, clickExpression("sendChatButton"));
    if (!sent || !sent.ok) throw new Error("Send button was not clickable.");
    await waitFor(send, "mutating planning indicator", (state) => (
      state.workingExists === true &&
      state.workingText.indexOf("Planning") >= 0 &&
      state.workingDots === 3
    ), 5000);

    const planned = await waitFor(send, "mutating AE Plan result", (state) => (
      state.sendDisabled === false &&
      state.transcript.indexOf("Plan review: ready") >= 0 &&
      state.transcript.indexOf("Validation: ok") >= 0 &&
      state.transcript.indexOf("1 mutating") >= 0 &&
      state.transcript.indexOf("Affected targets:") >= 0 &&
      state.transcript.indexOf("Run readiness: Dry run checks without changes") >= 0 &&
      state.planRunStatus === "Dry run first; Run uses protection" &&
      state.planRunStatusClass.indexOf("mutating") >= 0 &&
      state.runTitle.indexOf("protected edit-session") >= 0 &&
      state.transcript.indexOf("create_test_comp") >= 0 &&
      state.dryRunDisabled === false &&
      state.runDisabled === false
    ), WAIT_MS);

    const dryRunClicked = await evaluate(send, clickExpression("dryRunPlanButton"));
    if (!dryRunClicked || !dryRunClicked.ok) throw new Error("Dry run button was not clickable.");
    const dryRun = await waitFor(send, "mutating dry run result", (state) => (
      state.sendDisabled === false &&
      state.transcript.indexOf("Dry run: ok") >= 0 &&
      state.transcript.indexOf("Mode: preview only; project was not changed.") >= 0 &&
      state.transcript.indexOf("Checkpoint/edit session: dry-run only; no checkpoint was created.") >= 0 &&
      state.transcript.indexOf("ready") >= 0
    ), 30000);

    await evaluate(send, installConfirmExpression());
    const runClicked = await evaluate(send, clickExpression("runPlanButton"));
    if (!runClicked || !runClicked.ok) throw new Error("Run plan button was not clickable.");

    const run = await waitFor(send, "mutating run result", (state) => {
      if (state.sendDisabled !== false) return false;
      if (state.transcript.indexOf("Run: ok") >= 0) return true;
      if (state.transcript.indexOf("Run: needs review") >= 0 && state.transcript.indexOf(name) >= 0) return true;
      if (state.transcript.indexOf("Save the After Effects project first") >= 0) return true;
      if (state.transcript.indexOf("Save project first") >= 0) return true;
      return false;
    }, 90000);

    if ((run.confirmMessages || []).length) {
      throw new Error("Run plan showed an unexpected confirmation dialog.");
    }

    const blockedSaveFirst = (
      run.transcript.indexOf("Save the After Effects project first") >= 0 ||
      run.transcript.indexOf("Save project first") >= 0
    );
    if (!blockedSaveFirst) {
      if (run.transcript.indexOf("auto_edit_session") < 0 && run.transcript.indexOf("Edit session") < 0) {
        throw new Error("Mutating run did not show edit-session protection.");
      }
      if (run.transcript.indexOf("Checkpoint/edit session: protected by") < 0) {
        throw new Error("Mutating run did not show checkpoint/edit-session status.");
      }
      if (run.transcript.indexOf(name) < 0) {
        throw new Error("Mutating run did not mention the created test comp.");
      }
      cleanup = await cleanupMutatingSmoke(name);
    }

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      name,
      safeBlocked: blockedSaveFirst,
      planned: {
        agent: planned.agentValue,
        model: planned.model,
        transcriptTail: planned.transcript.slice(-3000)
      },
      dryRun: {
        transcriptTail: dryRun.transcript.slice(-3000)
      },
      run: {
        transcriptTail: run.transcript.slice(-3000),
        logTail: run.log.slice(-1200),
        confirmMessages: run.confirmMessages
      },
      cleanup: cleanup ? {
        ok: cleanup.ok,
        safety: cleanup.safety,
        steps: cleanup.steps
      } : null
    }, null, 2));
  } finally {
    ws.close();
  }
}

async function main() {
  const command = process.argv[2] || "inspect";
  if (command === "inspect") {
    await inspect();
    return;
  }
  if (command === "smoke") {
    await smoke();
    return;
  }
  if (command === "plan-review-smoke") {
    await planReviewSmoke();
    return;
  }
  if (command === "reload") {
    await reloadPanel();
    return;
  }
  if (command === "mutating-smoke") {
    await mutatingSmoke();
    return;
  }
  if (command === "openai-api-setup-smoke") {
    await openAiApiSetupSmoke();
    return;
  }
  if (command === "provider-placeholder-smoke") {
    await providerPlaceholderSmoke();
    return;
  }
  if (command === "provider-setup-smoke") {
    await providerSetupSmoke();
    return;
  }
  if (command === "provider-key-save-smoke") {
    await providerKeySaveSmoke();
    return;
  }
  if (command === "sidebar-collapse-smoke") {
    await sidebarCollapseSmoke();
    return;
  }
  if (command === "diagnostics-smoke") {
    await diagnosticsSmoke();
    return;
  }
  if (command === "send-button-smoke") {
    await sendButtonSmoke();
    return;
  }
  if (command === "branding-smoke") {
    await brandingSmoke();
    return;
  }
  if (command === "openai-cli-smoke") {
    await openAiCliSmoke();
    return;
  }
  if (command === "openai-cli-setup-smoke") {
    await openAiCliSetupSmoke();
    return;
  }
  if (command === "workflow-preset-smoke") {
    await workflowPresetSmoke();
    return;
  }
  if (command === "history-smoke") {
    await historySmoke();
    return;
  }
  if (command === "offline-smoke") {
    await offlineSmoke();
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  const output = {
    ok: false,
    error: error.message || String(error),
    state: error.state || null
  };
  console.error(JSON.stringify(output, null, 2));
  process.exit(1);
});
