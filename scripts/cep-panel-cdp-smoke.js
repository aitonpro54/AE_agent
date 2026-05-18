"use strict";

const http = require("http");
const { writeAgentRunReport } = require("./agent-scenario-report");
const { agentScenarioPlans } = require("./agent-scenario-fixtures");
const {
  buildAgentQaAuditReport,
  collectAuditPrefixes
} = require("./agent-qa-audit");

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
const AGENT_SCENARIO_PREFIX = process.env.CEP_PANEL_AGENT_SCENARIO_PREFIX || "Codex QA 1.2";
const AGENT_SCENARIO_WAIT_MS = Number(process.env.CEP_PANEL_AGENT_SCENARIO_WAIT_MS || 180000);

function defaultAgentScenarioConfig() {
  return {
    label: "configured-agent",
    agentId: AGENT_ID,
    model: MODEL,
    providerGroup: "",
    authMode: "",
    requirePanelPlans: false,
    readinessTimeoutMs: 45000
  };
}

function openAiCliAgentScenarioConfig() {
  return {
    label: "openai-cli-gpt-5.5",
    agentId: OPENAI_CLI_AGENT_ID,
    model: OPENAI_CLI_MODEL,
    providerGroup: "openai",
    authMode: "cli",
    requirePanelPlans: true,
    readinessTimeoutMs: OPENAI_CLI_WAIT_MS
  };
}

function shortDiagnosticText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength || 300) || null;
}

function commandCheckReport(check) {
  if (!check) return null;
  return {
    args: Array.isArray(check.args) ? check.args.slice() : [],
    status: typeof check.status === "number" ? check.status : null,
    signal: check.signal || null,
    errorCode: check.errorCode || null,
    output: shortDiagnosticText(check.output, 300)
  };
}

function codexStatusReport(status) {
  if (!status) return null;
  return {
    installed: Boolean(status.installed),
    loggedIn: Boolean(status.loggedIn),
    command: status.command || null,
    version: status.version || null,
    status: status.status || null,
    error: shortDiagnosticText(status.error, 300),
    versionCheck: commandCheckReport(status.versionCheck),
    loginStatusCheck: commandCheckReport(status.loginStatusCheck)
  };
}

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

function bridgeGetUrl(path, params) {
  const target = new URL(path, BRIDGE_URL);
  if (BRIDGE_TOKEN) target.searchParams.set("token", BRIDGE_TOKEN);
  const entries = params || {};
  for (const key of Object.keys(entries)) {
    if (entries[key] !== undefined && entries[key] !== null) {
      target.searchParams.set(key, String(entries[key]));
    }
  }
  return target.toString();
}

function parseBridgeToolPayload(response, name) {
  if (!response || response.status >= 400 || !response.body || response.body.ok !== true) {
    const error = response && response.body && (response.body.error || (response.body.result && response.body.result.error));
    throw new Error(`${name} failed: ${error || `HTTP ${response ? response.status : "unknown"}`}`);
  }

  const result = response.body.result;
  if (!result) return null;
  if (result.isError) {
    const text = result.content && result.content[0] ? result.content[0].text : "tool returned an error";
    throw new Error(`${name} failed: ${text}`);
  }
  if (result.content && result.content[0] && typeof result.content[0].text === "string") {
    return JSON.parse(result.content[0].text);
  }
  return result;
}

async function callBridgeTool(name, args) {
  const response = await postBridge("/tools/call", {
    name,
    arguments: args || {}
  });
  return parseBridgeToolPayload(response, name);
}

function safeErrorText(error) {
  return error && error.message ? error.message : String(error || "Unknown error");
}

async function safeGetJson(url) {
  try {
    return { ok: true, result: await getJson(url) };
  } catch (error) {
    return { ok: false, error: safeErrorText(error) };
  }
}

async function safeCallBridgeTool(name, args) {
  try {
    return { ok: true, result: await callBridgeTool(name, args) };
  } catch (error) {
    return { ok: false, error: safeErrorText(error) };
  }
}

function boundedNumber(value, fallback, min, max) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
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
    const details = response.result.exceptionDetails;
    const description = details.exception && details.exception.description ? details.exception.description : "";
    const location = details.lineNumber !== undefined ? ` at ${details.lineNumber}:${details.columnNumber}` : "";
    throw new Error((description || details.text || "Runtime.evaluate failed.") + location);
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
    connectorStatusButtonText: document.getElementById("connectorStatusButton") ? document.getElementById("connectorStatusButton").textContent : "",
    connectorEmergencyDisabled: document.getElementById("connectorEmergencyDisableButton") ? document.getElementById("connectorEmergencyDisableButton").disabled : null,
    connectorRows: Array.from(document.querySelectorAll("#connectorStatusList .connector-status-row")).map((row) => ({
      key: row.getAttribute("data-connector-status") || "",
      className: row.className || "",
      label: row.querySelector(".connector-status-label") ? row.querySelector(".connector-status-label").textContent : "",
      value: row.querySelector(".connector-status-value") ? row.querySelector(".connector-status-value").textContent : ""
    })),
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
    selfTestButtonText: document.getElementById("providerSelfTestButton") ? document.getElementById("providerSelfTestButton").textContent : "",
    selfTestButtonDisabled: document.getElementById("providerSelfTestButton") ? document.getElementById("providerSelfTestButton").disabled : null,
    selfTestRows: Array.from(document.querySelectorAll("#providerSelfTestList .self-test-row")).map((row) => ({
      key: row.getAttribute("data-self-test") || "",
      className: row.className || "",
      label: row.querySelector(".self-test-label") ? row.querySelector(".self-test-label").textContent : "",
      state: row.querySelector(".self-test-state") ? row.querySelector(".self-test-state").textContent : "",
      detail: row.querySelector(".self-test-detail") ? row.querySelector(".self-test-detail").textContent : ""
    })),
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
    chatModeOptions: Array.from(document.querySelectorAll("#chatMode option")).map((option) => ({ value: option.value, text: option.textContent })),
    chatModeButtons: Array.from(document.querySelectorAll("#chatModeTabs button")).map((button) => ({
      value: button.getAttribute("data-chat-mode") || "",
      text: button.textContent,
      active: button.className.indexOf("active") >= 0
    })),
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
    planRunSemanticVerification: window.__aeAgentLastPlanRunResult && window.__aeAgentLastPlanRunResult.semanticVerification ? window.__aeAgentLastPlanRunResult.semanticVerification : null,
    rawDryRunGate: window.__aeAgentLastAcceptedDryRun || null,
    rawRunGateRequests: window.__codexRawRunGateRequests || [],
    recoverLastPlanText: document.getElementById("recoverLastPlanButton") ? document.getElementById("recoverLastPlanButton").textContent : "",
    recoverLastPlanTitle: document.getElementById("recoverLastPlanButton") ? document.getElementById("recoverLastPlanButton").title : "",
    recoverLastPlanDisabled: document.getElementById("recoverLastPlanButton") ? document.getElementById("recoverLastPlanButton").disabled : null,
    dryRunText: document.getElementById("dryRunPlanButton") ? document.getElementById("dryRunPlanButton").textContent : "",
    dryRunTitle: document.getElementById("dryRunPlanButton") ? document.getElementById("dryRunPlanButton").title : "",
    runText: document.getElementById("runPlanButton") ? document.getElementById("runPlanButton").textContent : "",
    runTitle: document.getElementById("runPlanButton") ? document.getElementById("runPlanButton").title : "",
    prepareDevRequestText: document.getElementById("prepareDevRequestButton") ? document.getElementById("prepareDevRequestButton").textContent : "",
    prepareDevRequestTitle: document.getElementById("prepareDevRequestButton") ? document.getElementById("prepareDevRequestButton").title : "",
    prepareDevRequestVisible: document.getElementById("prepareDevRequestButton") ? document.getElementById("prepareDevRequestButton").style.display !== "none" : null,
    prepareDevRequestDisabled: document.getElementById("prepareDevRequestButton") ? document.getElementById("prepareDevRequestButton").disabled : null,
    dryRunDisabled: document.getElementById("dryRunPlanButton") ? document.getElementById("dryRunPlanButton").disabled : null,
    runDisabled: document.getElementById("runPlanButton") ? document.getElementById("runPlanButton").disabled : null,
    inlinePlanActionCount: document.querySelectorAll(".inline-plan-actions").length,
    inlinePlanActionStatus: document.querySelector(".inline-plan-action-status") ? document.querySelector(".inline-plan-action-status").textContent : "",
    inlineDryRunText: document.querySelector(".inline-dry-run-button") ? document.querySelector(".inline-dry-run-button").textContent : "",
    inlineDryRunDisabled: document.querySelector(".inline-dry-run-button") ? document.querySelector(".inline-dry-run-button").disabled : null,
    inlineRunPlanText: document.querySelector(".inline-run-plan-button") ? document.querySelector(".inline-run-plan-button").textContent : "",
    inlineRunPlanDisabled: document.querySelector(".inline-run-plan-button") ? document.querySelector(".inline-run-plan-button").disabled : null,
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

function selectAgentScenarioExpression(prompt, config) {
  const scenarioConfig = config || defaultAgentScenarioConfig();
  return `(() => {
    function setValue(el, value) {
      if (!el) return;
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    const clearButton = document.getElementById("clearChatButton");
    if (clearButton) clearButton.click();

    const optimization = document.getElementById("promptOptimization");
    if (optimization) {
      optimization.checked = false;
      optimization.dispatchEvent(new Event("change", { bubbles: true }));
    }
    localStorage.setItem("codexAePromptOptimization", "0");

    const providerGroup = ${JSON.stringify(scenarioConfig.providerGroup || "")};
    const authMode = ${JSON.stringify(scenarioConfig.authMode || "")};
    if (providerGroup) {
      localStorage.setItem("codexAeProviderGroup", providerGroup);
      const providerButton = document.querySelector("#providerTabs [data-provider-group='" + providerGroup + "']");
      if (providerButton) providerButton.click();
    }
    if (authMode) {
      localStorage.setItem("codexAeOpenAiAuthMode", authMode);
      const authButton = document.querySelector("#authModeTabs [data-auth-mode='" + authMode + "']");
      if (authButton) authButton.click();
    }

    localStorage.setItem("codexAeAgentId", ${JSON.stringify(scenarioConfig.agentId)});
    localStorage.setItem("codexAeAgentModel:${scenarioConfig.agentId}", ${JSON.stringify(scenarioConfig.model)});
    localStorage.setItem("codexAeChatMode", "plan");
    setValue(document.getElementById("agentSelect"), ${JSON.stringify(scenarioConfig.agentId)});
    setValue(document.getElementById("agentModel"), ${JSON.stringify(scenarioConfig.model)});
    setValue(document.getElementById("chatMode"), "plan");
    const planButton = document.querySelector("#chatModeTabs [data-chat-mode='plan']");
    if (planButton) planButton.click();
    setValue(document.getElementById("chatPrompt"), ${JSON.stringify(prompt)});
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
    agentId: localStorage.getItem("codexAeAgentId"),
    smokeAgentModel: localStorage.getItem(${JSON.stringify(`codexAeAgentModel:${AGENT_ID}`)})
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
    write(${JSON.stringify(`codexAeAgentModel:${AGENT_ID}`)}, values.smokeAgentModel);
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

function clickSelectorExpression(selector) {
  return `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return { ok: false, error: "missing" };
    const before = { disabled: !!el.disabled, text: el.textContent };
    if (!el.disabled) el.click();
    return { ok: !before.disabled, before, state: ${stateExpression()} };
  })()`;
}

function installProviderSelfTestFakeExpression() {
  return `(function () {
    var OriginalXHR = window.__codexOriginalProviderSelfTestXHR || window.XMLHttpRequest;
    window.__codexOriginalProviderSelfTestXHR = OriginalXHR;
    function queryValue(url, name) {
      var match = new RegExp("[?&]" + name + "=([^&]*)").exec(String(url || ""));
      return match ? decodeURIComponent(match[1].replace(/\\+/g, " ")) : "";
    }
    function check(args, status, output) {
      return { args, status, signal: null, errorCode: null, output };
    }
    function agentForList(id, label, provider, providerGroup, apiKeyEnv, model, models, extra) {
      var agent = {
        id: id,
        label: label,
        provider: provider,
        providerGroup: providerGroup,
        authMode: id === "openai-cli" ? "cli" : providerGroup === "local" ? "local" : "api",
        transport: id === "openai-cli" ? "codex-cli" : providerGroup === "local" ? "ollama-chat" : "openai-chat-completions",
        uiModes: [id === "openai-cli" ? "cli" : providerGroup === "local" ? "local" : "api"],
        apiStyle: provider === "gemini" ? "gemini" : provider === "claude" ? "anthropic" : providerGroup === "local" ? "ollama" : "openai",
        baseUrl: providerGroup === "local" ? "http://127.0.0.1:11434" : "https://example.invalid",
        apiKeyEnv: apiKeyEnv || "",
        model: model,
        models: models,
        modelOptions: models.map(function (item) { return { id: item, name: item }; }),
        configured: false,
        requiresApiKey: Boolean(apiKeyEnv),
        canSaveKey: Boolean(apiKeyEnv),
        setupAction: apiKeyEnv ? "save_api_key" : id === "openai-cli" ? "codex_login" : "detect_ollama",
        reachable: false,
        modelAvailable: false,
        canChat: false,
        status: apiKeyEnv ? "missing_auth" : "not_ready",
        modelSource: "not_checked",
        modelCount: models.length,
        remoteModels: []
      };
      Object.keys(extra || {}).forEach(function (key) { agent[key] = extra[key]; });
      return agent;
    }
    function agentsForList() {
      return [
        agentForList("openai-api", "OpenAI API", "openai", "openai", "OPENAI_API_KEY", "gpt-5.5", ["gpt-5.5"]),
        agentForList("openai-cli", "OpenAI CLI", "openai", "openai", "", "gpt-5.5", ["gpt-5.5"], {
          codexStatus: {
            installed: true,
            loggedIn: false,
            version: "codex-cli smoke",
            status: "not_logged_in",
            error: null,
            versionCheck: check(["--version"], 0, "codex-cli smoke"),
            loginStatusCheck: check(["login", "status"], 1, "Not logged in from CEP smoke")
          }
        }),
        agentForList("gemini-api", "Gemini API", "gemini", "gemini", "GEMINI_API_KEY", "gemini-2.5-flash", ["gemini-2.5-flash"]),
        agentForList("claude-api", "Claude API", "claude", "claude", "ANTHROPIC_API_KEY", "claude-sonnet-4-20250514", ["claude-sonnet-4-20250514"]),
        agentForList("openrouter", "OpenRouter", "openrouter", "openrouter", "OPENROUTER_API_KEY", "openrouter/free", ["openrouter/free", "meta/smoke:free"]),
        agentForList("ollama-local", "Ollama Local", "ollama", "local", "", "gemma4:latest", ["gemma4:latest"], {
          configured: true,
          status: "network_failure"
        })
      ];
    }
    function readinessFor(url) {
      var agentId = queryValue(url, "agentId");
      var model = queryValue(url, "model") || "smoke-model";
      if (agentId === "openai-api") {
        return {
          checkedAt: "2026-05-15T00:00:00.000Z",
          model: model,
          configured: false,
          reachable: false,
          modelAvailable: false,
          modelSource: null,
          canChat: false,
          status: "missing_auth",
          error: "Save a valid OPENAI_API_KEY for OpenAI API.",
          providerError: { code: "missing_auth", status: "missing_auth", message: "Save a valid OPENAI_API_KEY for OpenAI API." },
          agent: { id: "openai-api", label: "OpenAI API", apiKeyEnv: "OPENAI_API_KEY", requiresApiKey: true }
        };
      }
      if (agentId === "openai-cli") {
        return {
          checkedAt: "2026-05-15T00:00:00.000Z",
          model: model,
          configured: false,
          reachable: false,
          modelAvailable: false,
          modelSource: null,
          canChat: false,
          status: "missing_auth",
          error: "Run codex login, finish ChatGPT sign-in, then check the model again.",
          providerError: { code: "missing_auth", status: "missing_auth", message: "Run codex login, finish ChatGPT sign-in, then check the model again." },
          agent: {
            id: "openai-cli",
            label: "OpenAI CLI",
            requiresApiKey: false,
            codexStatus: {
              installed: true,
              loggedIn: false,
              version: "codex-cli smoke",
              status: "not_logged_in",
              error: null,
              versionCheck: check(["--version"], 0, "codex-cli smoke"),
              loginStatusCheck: check(["login", "status"], 1, "Not logged in from CEP smoke")
            }
          }
        };
      }
      if (agentId === "gemini-api") {
        return {
          checkedAt: "2026-05-15T00:00:00.000Z",
          model: model,
          configured: false,
          reachable: false,
          modelAvailable: false,
          modelSource: null,
          canChat: false,
          status: "missing_auth",
          error: "Save a valid GEMINI_API_KEY for Gemini.",
          providerError: { code: "missing_auth", status: "missing_auth", message: "Save a valid GEMINI_API_KEY for Gemini." },
          agent: { id: "gemini-api", label: "Gemini", apiKeyEnv: "GEMINI_API_KEY", requiresApiKey: true }
        };
      }
      if (agentId === "claude-api") {
        return {
          checkedAt: "2026-05-15T00:00:00.000Z",
          model: model,
          configured: true,
          reachable: true,
          modelAvailable: false,
          modelSource: "remote_list",
          modelCount: 1,
          remoteModels: [{ id: "claude-other", name: "Claude Other" }],
          canChat: false,
          status: "model_unavailable",
          error: "Model " + model + " was not found in Claude's model list.",
          providerError: { code: "model_unavailable", status: "model_unavailable", message: "Model " + model + " was not found in Claude's model list." },
          agent: { id: "claude-api", label: "Claude", apiKeyEnv: "ANTHROPIC_API_KEY", requiresApiKey: true }
        };
      }
      if (agentId === "openrouter") {
        return {
          checkedAt: "2026-05-15T00:00:00.000Z",
          model: model,
          configured: false,
          reachable: false,
          modelAvailable: false,
          modelSource: null,
          canChat: false,
          status: "missing_auth",
          error: "Save a valid OPENROUTER_API_KEY for OpenRouter.",
          providerError: { code: "missing_auth", status: "missing_auth", message: "Save a valid OPENROUTER_API_KEY for OpenRouter." },
          agent: { id: "openrouter", label: "OpenRouter", apiKeyEnv: "OPENROUTER_API_KEY", requiresApiKey: true }
        };
      }
      if (agentId === "ollama-local") {
        return {
          checkedAt: "2026-05-15T00:00:00.000Z",
          model: model,
          configured: true,
          reachable: false,
          modelAvailable: false,
          modelSource: null,
          modelCount: 0,
          remoteModels: [],
          canChat: false,
          status: "network_failure",
          error: "Ollama is offline for CEP smoke.",
          providerError: { code: "network_failure", status: "network_failure", message: "Ollama is offline for CEP smoke." },
          agent: { id: "ollama-local", label: "Ollama", requiresApiKey: false }
        };
      }
      return null;
    }
    function FakeXHR() {
      this.readyState = 0;
      this.status = 0;
      this.responseText = "";
      this.timeout = 0;
      this._headers = {};
      this.onreadystatechange = null;
      this.onerror = null;
      this.ontimeout = null;
    }
    FakeXHR.prototype.open = function (method, url, isAsync) {
      this._method = method;
      this._url = url;
      this._async = isAsync !== false;
    };
    FakeXHR.prototype.setRequestHeader = function (name, value) {
      this._headers[name] = value;
    };
    FakeXHR.prototype.send = function (body) {
      var self = this;
      var urlText = String(this._url || "");
      var fakeAgents = urlText.indexOf("/agents?") >= 0 || urlText.slice(-7) === "/agents";
      var fakeReadiness = urlText.indexOf("/agents/readiness") >= 0 ? readinessFor(this._url) : null;
      if (fakeAgents) {
        setTimeout(function () {
          self.readyState = 4;
          self.status = 200;
          self.responseText = JSON.stringify({ ok: true, defaultAgentId: "openai-cli", agents: agentsForList() });
          if (typeof self.onreadystatechange === "function") self.onreadystatechange();
        }, 25);
        return;
      }
      if (fakeReadiness) {
        setTimeout(function () {
          self.readyState = 4;
          self.status = 200;
          self.responseText = JSON.stringify({ ok: true, readiness: fakeReadiness });
          if (typeof self.onreadystatechange === "function") self.onreadystatechange();
        }, 25);
        return;
      }
      var xhr = new OriginalXHR();
      xhr.timeout = this.timeout;
      xhr.onreadystatechange = function () {
        self.readyState = xhr.readyState;
        self.status = xhr.status;
        self.responseText = xhr.responseText;
        if (typeof self.onreadystatechange === "function") self.onreadystatechange();
      };
      xhr.onerror = function () { if (typeof self.onerror === "function") self.onerror(); };
      xhr.ontimeout = function () { if (typeof self.ontimeout === "function") self.ontimeout(); };
      xhr.open(this._method, this._url, this._async);
      Object.keys(this._headers).forEach(function (name) {
        xhr.setRequestHeader(name, self._headers[name]);
      });
      xhr.send(body);
    };
    window.XMLHttpRequest = FakeXHR;
    window.__codexRestoreProviderSelfTestFake = function () {
      window.XMLHttpRequest = OriginalXHR;
      return true;
    };
    return true;
  })()`;
}

function restoreProviderSelfTestFakeExpression() {
  return `(function () {
    if (typeof window.__codexRestoreProviderSelfTestFake === "function") {
      return window.__codexRestoreProviderSelfTestFake();
    }
    return true;
  })()`;
}

function installConnectorStatusFakeExpression() {
  return `(function () {
    var OriginalXHR = window.XMLHttpRequest;
    var disabled = false;
    function statusBody() {
      return {
        ok: true,
        status: {
          connector: {
            connected: true,
            publicUrlConfigured: true,
            publicUrlOrigin: "https://connector-smoke.example",
            writeActionsEnabled: !disabled,
            emergencyDisabled: disabled,
            exposedToolsSnapshot: [
              { name: "get_connector_status", readOnly: true, bridgeProxy: false },
              { name: "propose_extendscript_candidate", readOnly: false, bridgeProxy: false },
              { name: "run_extendscript_candidate", readOnly: false, bridgeProxy: false },
              { name: "promote_solution_candidate", readOnly: false, bridgeProxy: false },
              { name: "get_active_comp", readOnly: true, bridgeProxy: true }
            ],
            lastToolCall: {
              name: "check_extendscript_candidate",
              ok: true,
              calledAt: "2026-05-15T00:00:00.000Z"
            }
          }
        }
      };
    }
    function FakeXHR() {
      this.readyState = 0;
      this.status = 0;
      this.responseText = "";
      this.timeout = 0;
      this._headers = {};
      this.onreadystatechange = null;
      this.onerror = null;
      this.ontimeout = null;
    }
    FakeXHR.prototype.open = function (method, url, isAsync) {
      this._method = method;
      this._url = url;
      this._async = isAsync !== false;
    };
    FakeXHR.prototype.setRequestHeader = function (name, value) {
      this._headers[name] = value;
    };
    FakeXHR.prototype.send = function (body) {
      var self = this;
      var urlText = String(this._url || "");
      if (urlText.indexOf(":8787/status") >= 0) {
        setTimeout(function () {
          self.readyState = 4;
          self.status = 200;
          self.responseText = JSON.stringify(statusBody());
          if (typeof self.onreadystatechange === "function") self.onreadystatechange();
        }, 25);
        return;
      }
      if (urlText.indexOf(":8787/emergency-disable") >= 0) {
        setTimeout(function () {
          disabled = true;
          self.readyState = 4;
          self.status = 200;
          self.responseText = JSON.stringify(statusBody());
          if (typeof self.onreadystatechange === "function") self.onreadystatechange();
        }, 25);
        return;
      }
      var xhr = new OriginalXHR();
      xhr.timeout = this.timeout;
      xhr.onreadystatechange = function () {
        self.readyState = xhr.readyState;
        self.status = xhr.status;
        self.responseText = xhr.responseText;
        if (typeof self.onreadystatechange === "function") self.onreadystatechange();
      };
      xhr.onerror = function () { if (typeof self.onerror === "function") self.onerror(); };
      xhr.ontimeout = function () { if (typeof self.ontimeout === "function") self.ontimeout(); };
      xhr.open(this._method, this._url, this._async);
      Object.keys(this._headers).forEach(function (name) {
        xhr.setRequestHeader(name, self._headers[name]);
      });
      xhr.send(body);
    };
    window.XMLHttpRequest = FakeXHR;
    window.__codexRestoreConnectorStatusFake = function () {
      window.XMLHttpRequest = OriginalXHR;
      return true;
    };
    return true;
  })()`;
}

function restoreConnectorStatusFakeExpression() {
  return `(function () {
    if (typeof window.__codexRestoreConnectorStatusFake === "function") {
      return window.__codexRestoreConnectorStatusFake();
    }
    return true;
  })()`;
}

function installRawRunGateFakeExpression() {
  return `(function () {
    var OriginalXHR = window.__codexOriginalRawRunGateXHR || window.XMLHttpRequest;
    window.__codexOriginalRawRunGateXHR = OriginalXHR;
    window.__codexRawRunGateRequests = [];
    function respond(xhr, status, body) {
      setTimeout(function () {
        xhr.readyState = 4;
        xhr.status = status;
        xhr.responseText = JSON.stringify(body || {});
        if (typeof xhr.onreadystatechange === "function") xhr.onreadystatechange();
      }, 25);
    }
    function makeStep(payload, status) {
      var step = payload && payload.plan && payload.plan.steps && payload.plan.steps[0] ? payload.plan.steps[0] : {};
      return {
        index: 1,
        title: step.title || "Raw ExtendScript gate smoke",
        tool: step.tool || "run_extendscript",
        status: status,
        targetSummary: step.targetSummary || "active comp / selected layers"
      };
    }
    function runResponse(payload, runId) {
      var dryRun = payload.dryRun === true;
      return {
        ok: true,
        run: {
          id: runId,
          ok: true,
          dryRun: dryRun,
          requestId: payload.requestId || "",
          safety: {
            status: dryRun ? "dry-run" : "protected",
            protection: dryRun ? "dry_run" : "auto_edit_session",
            editSessionFinished: !dryRun,
            rawExtendscriptGate: dryRun
              ? { status: "dry-run-approved", dryRunId: runId }
              : { status: "approved", dryRunId: payload.rawExtendscriptDryRunId || "" }
          },
          steps: [makeStep(payload, dryRun ? "ready" : "completed")]
        }
      };
    }
    function FakeXHR() {
      this.readyState = 0;
      this.status = 0;
      this.responseText = "";
      this.timeout = 0;
      this._headers = {};
      this.onreadystatechange = null;
      this.onerror = null;
      this.ontimeout = null;
    }
    FakeXHR.prototype.open = function (method, url, isAsync) {
      this._method = method;
      this._url = url;
      this._async = isAsync !== false;
    };
    FakeXHR.prototype.setRequestHeader = function (name, value) {
      this._headers[name] = value;
    };
    FakeXHR.prototype.send = function (body) {
      var self = this;
      var urlText = String(this._url || "");
      if (urlText.indexOf("/agents/plan/run") >= 0) {
        var payload = {};
        try {
          payload = body ? JSON.parse(body) : {};
        } catch (_error) {}
        window.__codexRawRunGateRequests.push(payload);
        if (payload.dryRun === true) {
          respond(self, 200, runResponse(payload, "raw-gate-dry-run-smoke"));
          return;
        }
        if (payload.rawExtendscriptDryRunId !== "raw-gate-dry-run-smoke") {
          respond(self, 400, {
            ok: false,
            error: "same current plan dry-run id is required",
            run: {
              id: "raw-gate-blocked-smoke",
              ok: false,
              dryRun: false,
              requestId: payload.requestId || "",
              safety: { status: "blocked_raw_extendscript_gate" },
              steps: []
            }
          });
          return;
        }
        respond(self, 200, runResponse(payload, "raw-gate-run-smoke"));
        return;
      }
      var xhr = new OriginalXHR();
      xhr.timeout = this.timeout;
      xhr.onreadystatechange = function () {
        self.readyState = xhr.readyState;
        self.status = xhr.status;
        self.responseText = xhr.responseText;
        if (typeof self.onreadystatechange === "function") self.onreadystatechange();
      };
      xhr.onerror = function () { if (typeof self.onerror === "function") self.onerror(); };
      xhr.ontimeout = function () { if (typeof self.ontimeout === "function") self.ontimeout(); };
      xhr.open(this._method, this._url, this._async);
      Object.keys(this._headers).forEach(function (name) {
        xhr.setRequestHeader(name, self._headers[name]);
      });
      xhr.send(body);
    };
    window.XMLHttpRequest = FakeXHR;
    window.__codexRestoreRawRunGateFake = function () {
      window.XMLHttpRequest = OriginalXHR;
      return true;
    };
    return true;
  })()`;
}

function restoreRawRunGateFakeExpression() {
  return `(function () {
    if (typeof window.__codexRestoreRawRunGateFake === "function") {
      return window.__codexRestoreRawRunGateFake();
    }
    return true;
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

function devRequestPlanResult(rawExtendscript) {
  const rawStep = {
    title: "Import and layout photos",
    tool: "run_extendscript",
    args: {
      script: "app.beginUndoGroup('Dev request smoke'); app.endUndoGroup();"
    },
    mutatesProject: true,
    description: "Raw ExtendScript workaround that should be promoted to a typed tool."
  };
  const readOnlyStep = {
    title: "Inspect bridge",
    tool: "get_bridge_status",
    args: {},
    mutatesProject: false,
    description: "Read-only bridge status check."
  };
  const steps = rawExtendscript ? [readOnlyStep, rawStep] : [readOnlyStep];
  const classification = rawExtendscript ? {
    category: "risky",
    label: "Risky / raw ExtendScript",
    allowsDryRun: true,
    blocksNormalRun: true,
    rawExtendscriptStepCount: 1
  } : {
    category: "safe typed-tool",
    label: "Safe typed-tool",
    allowsDryRun: true,
    blocksNormalRun: false,
    rawExtendscriptStepCount: 0
  };
  return {
    planParseOk: true,
    requestId: rawExtendscript ? "dev-request-raw-smoke" : "dev-request-safe-smoke",
    model: "smoke",
    durationMs: 1,
    plan: {
      summary: rawExtendscript ? "Promote photo import and layout workflow to a typed tool." : "Inspect bridge status safely.",
      risk: rawExtendscript ? "medium" : "low",
      steps
    },
    planValidation: {
      ok: true,
      mutatingCount: rawExtendscript ? 1 : 0,
      steps,
      classification
    },
    planClassification: classification
  };
}

function rawRunGatePlanResult() {
  const rawStep = {
    title: "Import and layout photos",
    tool: "run_extendscript",
    args: {
      script: "return { ok: true, smoke: 'raw-run-gate' };"
    },
    mutatesProject: true,
    targetSummary: "active comp / selected layers",
    description: "Raw ExtendScript plan that must be unlocked by a matching dry run."
  };
  const classification = {
    category: "risky",
    label: "Risky / raw ExtendScript",
    tone: "mutating",
    allowsDryRun: true,
    blocksRun: true,
    blocksNormalRun: true,
    rawExtendscriptStepCount: 1,
    runRecommendation: "Dry run this exact raw ExtendScript plan before normal execution."
  };
  return {
    planParseOk: true,
    requestId: "raw-run-gate-smoke",
    model: "smoke",
    durationMs: 1,
    plan: {
      summary: "Import and layout selected photos with a raw ExtendScript workaround.",
      risk: "medium",
      requiresCheckpoint: true,
      steps: [rawStep]
    },
    planValidation: {
      ok: true,
      mutatingCount: 1,
      steps: [rawStep],
      classification
    },
    planClassification: classification
  };
}

function installDevRequestTranscriptExpression(planResult, sessionId) {
  const transcript = [
    {
      role: "user",
      text: "Dev request button smoke prompt"
    },
    {
      role: "assistant",
      text: "Plan review: ready\nValidation: ok\nRun readiness: smoke",
      planResult
    }
  ];
  const session = {
    id: sessionId,
    title: "Dev request button smoke",
    updatedAt: "2026-05-17T00:00:00.000Z",
    transcript,
    chatMessages: []
  };
  return `(() => {
    const session = ${JSON.stringify(session)};
    localStorage.setItem("codexAeChatSessions", JSON.stringify([session]));
    localStorage.setItem("codexAeActiveChatSessionId", session.id);
    localStorage.setItem("codexAeChatTranscript", JSON.stringify(session.transcript));
    return true;
  })()`;
}

function installRawRunGateTranscriptExpression(planResult, sessionId) {
  const transcript = [
    {
      role: "user",
      text: "Raw run gate smoke prompt"
    },
    {
      role: "assistant",
      text: "Plan review: ready\nValidation: ok, 1 step, 1 mutating\nRun readiness: Dry run checks without changes",
      planResult
    }
  ];
  const session = {
    id: sessionId,
    title: "Raw run gate smoke",
    updatedAt: "2026-05-18T00:00:00.000Z",
    transcript,
    chatMessages: []
  };
  return `(() => {
    const session = ${JSON.stringify(session)};
    localStorage.setItem("codexAeChatSessions", JSON.stringify([session]));
    localStorage.setItem("codexAeActiveChatSessionId", session.id);
    localStorage.setItem("codexAeChatTranscript", JSON.stringify(session.transcript));
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
  let historyBackup = null;
  let providerBackup = null;
  let composerBackup = null;
  try {
    historyBackup = await evaluate(send, historyStorageExpression());
    providerBackup = await evaluate(send, providerStorageExpression());
    composerBackup = await evaluate(send, composerStateExpression());

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
      state.transcript.indexOf("Confidence: Safe typed-tool") >= 0 &&
      state.transcript.indexOf("Validation: ok") >= 0 &&
      state.transcript.indexOf("0 mutating") >= 0 &&
      state.transcript.indexOf("Affected targets:") >= 0 &&
      state.transcript.indexOf("Run readiness:") >= 0 &&
      state.planRunStatus === "Safe typed-tool ready" &&
      state.planRunStatusClass.indexOf("read-only") >= 0 &&
      state.runTitle.indexOf("read-only") >= 0 &&
      state.recoverLastPlanText === "Подхватить последний план из чата" &&
      state.recoverLastPlanDisabled === true &&
      state.dryRunText === "Dry run / Проверить" &&
      state.dryRunDisabled === false &&
      state.runText === "Выполнить план" &&
      state.runDisabled === false &&
      state.inlinePlanActionCount >= 1 &&
      state.inlineDryRunText === "Dry run / Проверить" &&
      state.inlineDryRunDisabled === false &&
      state.inlineRunPlanText === "Выполнить план" &&
      state.inlineRunPlanDisabled === false
    ), WAIT_MS);

    await reloadActivePage(send);
    await waitFor(send, "panel online after plan reload", (state) => state.badge === "online", 15000);
    await waitFor(send, "saved plan recoverable after reload", (state) => (
      state.transcript.indexOf("Plan review: ready") >= 0 &&
      state.planRunStatus === "No plan ready" &&
      state.recoverLastPlanText === "Подхватить последний план из чата" &&
      state.recoverLastPlanDisabled === false &&
      state.dryRunDisabled === true &&
      state.runDisabled === true &&
      state.inlinePlanActionCount === 0
    ), 20000);

    const recoveredClick = await evaluate(send, clickExpression("recoverLastPlanButton"));
    if (!recoveredClick || !recoveredClick.ok) throw new Error("Recover last plan button was not clickable.");
    const recovered = await waitFor(send, "recovered plan ready", (state) => (
      state.planRunStatus === "Safe typed-tool ready" &&
      state.planRunStatusClass.indexOf("read-only") >= 0 &&
      state.dryRunDisabled === false &&
      state.runDisabled === false &&
      state.inlinePlanActionCount >= 1 &&
      state.inlineRunPlanDisabled === false
    ), 10000);

    const dryRunClicked = await evaluate(send, clickExpression("dryRunPlanButton"));
    if (!dryRunClicked || !dryRunClicked.ok) throw new Error("Dry run button was not clickable.");
    const dryRun = await waitFor(send, "dry run result", (state) => (
      state.sendDisabled === false &&
      state.transcript.indexOf("Dry run: ok") >= 0 &&
      state.transcript.indexOf("Mode: preview only; project was not changed.") >= 0 &&
      state.transcript.indexOf("Checkpoint/edit session: not needed for read-only dry run.") >= 0
    ), 30000);

    await evaluate(send, installConfirmExpression());
    const runClicked = await evaluate(send, clickSelectorExpression(".inline-run-plan-button"));
    if (!runClicked || !runClicked.ok) throw new Error("Inline Run plan button was not clickable.");
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
      recovered: {
        status: recovered.planRunStatus,
        statusClass: recovered.planRunStatusClass,
        recoverTitle: recovered.recoverLastPlanTitle,
        transcriptTail: recovered.transcript.slice(-3000)
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
    if (historyBackup || providerBackup || composerBackup) {
      try {
        if (historyBackup) await evaluate(send, writeHistoryStorageExpression(historyBackup));
        if (providerBackup) await evaluate(send, writeProviderStorageExpression(providerBackup));
        if (composerBackup) await evaluate(send, writeComposerStateExpression(composerBackup));
        await reloadActivePage(send);
      } catch (_restoreError) {}
    }
    ws.close();
  }
}

async function devRequestButtonSmoke() {
  const { page, ws, send } = await connectToPanel();
  let historyBackup = null;
  try {
    historyBackup = await evaluate(send, historyStorageExpression());

    async function recoverStoredPlan(label, rawExtendscript) {
      await evaluate(send, installDevRequestTranscriptExpression(
        devRequestPlanResult(rawExtendscript),
        `dev-request-${label}-${Date.now()}`
      ));
      await reloadActivePage(send);
      const loaded = await waitFor(send, `${label} plan transcript loaded`, (state) => (
        state.transcript.indexOf("Plan review: ready") >= 0 &&
        state.recoverLastPlanDisabled === false &&
        state.planRunStatus === "No plan ready" &&
        state.prepareDevRequestVisible === false &&
        state.prepareDevRequestDisabled === true
      ), 15000);

      const recoveredClick = await evaluate(send, clickExpression("recoverLastPlanButton"));
      if (!recoveredClick || !recoveredClick.ok) {
        throw new Error(`${label}: Recover last plan button was not clickable.`);
      }

      const recovered = await waitFor(send, `${label} dev request button state`, (state) => {
        if (rawExtendscript) {
          return state.planRunStatus === "Risky plan; dry run first" &&
            state.prepareDevRequestVisible === true &&
            state.prepareDevRequestDisabled === false &&
            state.prepareDevRequestTitle.indexOf("raw ExtendScript") >= 0;
        }
        return state.planRunStatus === "Safe typed-tool ready" &&
          state.prepareDevRequestVisible === false &&
          state.prepareDevRequestDisabled === true;
      }, 10000);

      let prepared = null;
      if (rawExtendscript) {
        const prepareClick = await evaluate(send, clickExpression("prepareDevRequestButton"));
        if (!prepareClick || !prepareClick.ok) {
          throw new Error(`${label}: Prepare typed tool request button was not clickable.`);
        }
        prepared = await waitFor(send, `${label} dev request prepared`, (state) => (
          state.transcript.indexOf("Typed tool request prepared.") >= 0 &&
          state.transcript.indexOf("Start prompt: logs/dev-requests/") >= 0 &&
          state.transcript.indexOf("Codex App: no new chat was created automatically.") >= 0 &&
          state.transcript.indexOf("start a dev chat from the start prompt") >= 0
        ), 15000);
      }

      return {
        loaded: {
          recoverDisabled: loaded.recoverLastPlanDisabled,
          prepareVisible: loaded.prepareDevRequestVisible,
          prepareDisabled: loaded.prepareDevRequestDisabled
        },
        recovered: {
          status: recovered.planRunStatus,
          statusClass: recovered.planRunStatusClass,
          prepareVisible: recovered.prepareDevRequestVisible,
          prepareDisabled: recovered.prepareDevRequestDisabled,
          prepareTitle: recovered.prepareDevRequestTitle
        },
        prepared: prepared ? {
          transcriptTail: prepared.transcript.slice(-1200)
        } : null
      };
    }

    const safe = await recoverStoredPlan("safe", false);
    const toolGap = await recoverStoredPlan("tool-gap", true);
    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      safe,
      toolGap
    }, null, 2));
  } finally {
    if (historyBackup) {
      try {
        await evaluate(send, writeHistoryStorageExpression(historyBackup));
        await reloadActivePage(send);
      } catch (_restoreError) {}
    }
    ws.close();
  }
}

async function rawRunGateSmoke() {
  const { page, ws, send } = await connectToPanel();
  let historyBackup = null;
  try {
    historyBackup = await evaluate(send, historyStorageExpression());
    await evaluate(send, installRawRunGateTranscriptExpression(
      rawRunGatePlanResult(),
      `raw-run-gate-${Date.now()}`
    ));
    await reloadActivePage(send);

    const loaded = await waitFor(send, "raw run gate plan loaded", (state) => (
      state.transcript.indexOf("Plan review: ready") >= 0 &&
      state.recoverLastPlanDisabled === false &&
      state.planRunStatus === "No plan ready" &&
      state.dryRunDisabled === true &&
      state.runDisabled === true
    ), 15000);

    const recoveredClick = await evaluate(send, clickExpression("recoverLastPlanButton"));
    if (!recoveredClick || !recoveredClick.ok) throw new Error("Recover last plan button was not clickable.");
    const recovered = await waitFor(send, "raw run gate recovered", (state) => (
      state.planRunStatus === "Dry run available; Run blocked" &&
      state.planRunStatusClass.indexOf("mutating") >= 0 &&
      state.dryRunDisabled === false &&
      state.runDisabled === true &&
      state.inlinePlanActionCount >= 1 &&
      state.inlineDryRunDisabled === false &&
      state.inlineRunPlanDisabled === true
    ), 10000);

    await evaluate(send, installRawRunGateFakeExpression());
    const dryRunClicked = await evaluate(send, clickExpression("dryRunPlanButton"));
    if (!dryRunClicked || !dryRunClicked.ok) throw new Error("Dry run button was not clickable.");
    const dryRun = await waitFor(send, "raw run gate dry-run unlock", (state) => (
      state.sendDisabled === false &&
      state.transcript.indexOf("Dry run: ok") >= 0 &&
      state.rawDryRunGate &&
      state.rawDryRunGate.runId === "raw-gate-dry-run-smoke" &&
      state.rawDryRunGate.requestId === "raw-run-gate-smoke" &&
      state.runDisabled === false &&
      state.inlineRunPlanDisabled === false &&
      state.runTitle.indexOf("explicit raw ExtendScript gate") >= 0 &&
      state.rawRunGateRequests.length === 1
    ), 30000);

    await evaluate(send, installConfirmExpression());
    const runClicked = await evaluate(send, clickExpression("runPlanButton"));
    if (!runClicked || !runClicked.ok) throw new Error("Run plan button was not clickable after matching dry run.");
    const run = await waitFor(send, "raw run gate protected run", (state) => (
      state.sendDisabled === false &&
      state.transcript.indexOf("Run: ok") >= 0 &&
      state.transcript.indexOf("Raw ExtendScript gate: approved by dry run raw-gate-dry-run-smoke.") >= 0 &&
      state.rawRunGateRequests.length === 2
    ), 30000);

    const requests = run.rawRunGateRequests || [];
    const dryRunPayload = requests[0] || {};
    const runPayload = requests[1] || {};
    if (dryRunPayload.dryRun !== true) throw new Error("Expected first raw gate request to be a dry run.");
    if (dryRunPayload.allowRawExtendscript === true) throw new Error("Dry run should not request raw ExtendScript execution approval.");
    if (runPayload.dryRun !== false) throw new Error("Expected second raw gate request to be a real run.");
    if (runPayload.allowRawExtendscript !== true) throw new Error("Real run must include explicit raw ExtendScript approval.");
    if (runPayload.rawExtendscriptDryRunId !== "raw-gate-dry-run-smoke") throw new Error("Real run must include the matching dry-run id.");
    if (runPayload.confirm !== true || runPayload.allowMutations !== true || runPayload.autoEditSession !== true) {
      throw new Error("Real run must keep confirm, mutation, and auto edit-session protection enabled.");
    }

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      loaded: {
        recoverDisabled: loaded.recoverLastPlanDisabled,
        status: loaded.planRunStatus
      },
      recovered: {
        status: recovered.planRunStatus,
        statusClass: recovered.planRunStatusClass,
        runDisabled: recovered.runDisabled,
        inlineRunPlanDisabled: recovered.inlineRunPlanDisabled
      },
      dryRun: {
        rawDryRunGate: dryRun.rawDryRunGate,
        runDisabled: dryRun.runDisabled,
        inlineRunPlanDisabled: dryRun.inlineRunPlanDisabled
      },
      run: {
        requestCount: requests.length,
        dryRunPayload: {
          dryRun: dryRunPayload.dryRun,
          allowRawExtendscript: dryRunPayload.allowRawExtendscript
        },
        runPayload: {
          dryRun: runPayload.dryRun,
          allowRawExtendscript: runPayload.allowRawExtendscript,
          rawExtendscriptDryRunId: runPayload.rawExtendscriptDryRunId,
          autoEditSession: runPayload.autoEditSession
        },
        transcriptTail: run.transcript.slice(-3000)
      }
    }, null, 2));
  } finally {
    try {
      await evaluate(send, restoreRawRunGateFakeExpression());
    } catch (_restoreFakeError) {}
    if (historyBackup) {
      try {
        await evaluate(send, writeHistoryStorageExpression(historyBackup));
        await reloadActivePage(send);
      } catch (_restoreError) {}
    }
    ws.close();
  }
}

async function modeToggleSmoke() {
  const { page, ws, send } = await connectToPanel();
  let composerBackup = null;
  try {
    composerBackup = await evaluate(send, composerStateExpression());
    await reloadActivePage(send);
    const initial = await waitFor(send, "mode toggle buttons", (state) => (
      state.chatModeButtons.length === 3 &&
      state.chatModeButtons.some((button) => button.value === "chat" && button.text === "Chat") &&
      state.chatModeButtons.some((button) => button.value === "plan" && button.text === "Agent") &&
      state.chatModeButtons.some((button) => button.value === "hardcore" && button.text === "Agent Hardcore") &&
      state.chatModeOptions.some((option) => option.value === "hardcore" && option.text === "Agent Hardcore")
    ), 15000);

    const clicked = await evaluate(send, clickSelectorExpression("#chatModeTabs [data-chat-mode='hardcore']"));
    if (!clicked || !clicked.ok) throw new Error("Agent Hardcore mode tab was not clickable.");
    const hardcore = await waitFor(send, "hardcore mode selected", (state) => (
      state.mode === "hardcore" &&
      state.chatModeButtons.some((button) => button.value === "hardcore" && button.active === true)
    ), 10000);

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      initial: {
        mode: initial.mode,
        buttons: initial.chatModeButtons,
        options: initial.chatModeOptions
      },
      hardcore: {
        mode: hardcore.mode,
        buttons: hardcore.chatModeButtons
      }
    }, null, 2));
  } finally {
    if (composerBackup) {
      try {
        await evaluate(send, writeComposerStateExpression(composerBackup));
        await reloadActivePage(send);
      } catch (_restoreError) {}
    }
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
      state.transcript.indexOf("Confidence: Safe typed-tool") >= 0 &&
      state.transcript.indexOf("Validation: ok") >= 0 &&
      state.transcript.indexOf("Affected targets:") >= 0 &&
      state.transcript.indexOf("Mutations:") >= 0 &&
      state.transcript.indexOf("Checkpoint expectation:") >= 0 &&
      state.transcript.indexOf("Run readiness:") >= 0 &&
      state.planRunStatus === "Safe typed-tool ready" &&
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
    await evaluate(send, installProviderSelfTestFakeExpression());
    await evaluate(send, setupExpression());
    await waitFor(send, "panel online", (state) => state.badge === "online", 15000);
    await waitFor(send, "agent list", (state) => state.agentOptions.some((option) => option.value === OPENAI_CLI_AGENT_ID), 20000);

    const results = [];
    for (const group of ["gemini", "claude", "openrouter"]) {
      const clicked = await evaluate(send, selectProviderGroupExpression(group));
      if (!clicked || !clicked.ok) throw new Error(`Could not click ${group} provider tab.`);
      const label = group === "gemini" ? "Gemini" : group === "claude" ? "Claude" : "OpenRouter";
      const agentId = group === "gemini" ? "gemini-api" : group === "claude" ? "claude-api" : "openrouter";
      const selected = await waitFor(send, `${label} setup selected`, (state) => (
        state.activeProviderGroup === group &&
        state.agentValue === agentId &&
        state.setupTitle.indexOf(label) >= 0 &&
        state.setupText.indexOf("API billing") >= 0 &&
        state.agentDetails.indexOf("Setup: key required") >= 0 &&
        state.authModeVisible === false &&
        state.apiKeyVisible === true &&
        state.localServiceVisible === false &&
        state.freeModelsVisible === (group === "openrouter") &&
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
      } catch (_error) {}
    }
    try {
      await evaluate(send, restoreProviderSelfTestFakeExpression());
    } catch (_restoreError) {}
    ws.close();
  }
}

async function providerPlaceholderSmoke() {
  return providerSetupSmoke();
}

function selfTestRowsByKey(state) {
  const rows = {};
  for (const row of state.selfTestRows || []) rows[row.key] = row;
  return rows;
}

async function providerSelfTestSmoke() {
  const { page, ws, send } = await connectToPanel();
  let backup = null;
  let bridgeBackup = null;
  try {
    backup = await evaluate(send, providerStorageExpression());
    bridgeBackup = await evaluate(send, bridgeStorageExpression());
    await reloadActivePage(send);
    await evaluate(send, installProviderSelfTestFakeExpression());
    await evaluate(send, setupExpression());
    await waitFor(send, "panel online", (state) => state.badge === "online", 15000);
    await waitFor(send, "provider self-test rows", (state) => (
      state.selfTestRows.length === 6 &&
      state.agentOptions.some((option) => option.value === OPENAI_CLI_AGENT_ID)
    ), 20000);

    const clicked = await evaluate(send, clickExpression("providerSelfTestButton"));
    if (!clicked || !clicked.ok) throw new Error("Could not start provider self-test.");

    const tested = await waitFor(send, "provider self-test diagnostics", (state) => {
      const rows = selfTestRowsByKey(state);
      return rows["openai-api"] &&
        rows["openai-api"].state === "Setup" &&
        rows["openai-api"].detail.indexOf("OPENAI_API_KEY") >= 0 &&
        rows["openai-api"].detail.indexOf("smoke-key") < 0 &&
        rows["openai-cli"] &&
        rows["openai-cli"].state === "Setup" &&
        rows["openai-cli"].detail.indexOf("Not logged in from CEP smoke") >= 0 &&
        rows["openai-cli"].detail.indexOf("login status failed") >= 0 &&
        rows["gemini-api"] &&
        rows["gemini-api"].state === "Setup" &&
        rows["gemini-api"].detail.indexOf("GEMINI_API_KEY") >= 0 &&
        rows["claude-api"] &&
        rows["claude-api"].state === "Model missing" &&
        rows["claude-api"].detail.indexOf("model list") >= 0 &&
        rows["openrouter"] &&
        rows["openrouter"].state === "Setup" &&
        rows["openrouter"].detail.indexOf("OPENROUTER_API_KEY") >= 0 &&
        rows["ollama-local"] &&
        rows["ollama-local"].state === "Offline" &&
        rows["ollama-local"].detail.indexOf("Ollama is offline for CEP smoke") >= 0 &&
        state.selfTestButtonDisabled === false &&
        state.apiKeyValue === "";
    }, 15000);

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      selfTestRows: tested.selfTestRows
    }, null, 2));
  } finally {
    if (backup) {
      try {
        await evaluate(send, writeProviderStorageExpression(backup));
        if (bridgeBackup) await evaluate(send, writeBridgeStorageExpression(bridgeBackup));
      } catch (_error) {}
    }
    try {
      await evaluate(send, restoreProviderSelfTestFakeExpression());
    } catch (_restoreError) {}
    ws.close();
  }
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

async function connectorStatusSmoke() {
  const { page, ws, send } = await connectToPanel();
  try {
    await reloadActivePage(send);
    await evaluate(send, installConnectorStatusFakeExpression());
    const clicked = await evaluate(send, clickExpression("connectorStatusButton"));
    if (!clicked || !clicked.ok) throw new Error("Connector status button was not clickable.");
    const ready = await waitFor(send, "connector status rows", (state) => {
      const rows = {};
      for (const row of state.connectorRows || []) rows[row.key] = row;
      return rows.state &&
        rows.state.value === "Connected" &&
        rows.endpoint &&
        rows.endpoint.value.indexOf("https://connector-smoke.example") >= 0 &&
        rows.tools &&
        rows.tools.value.indexOf("run_extendscript_candidate") >= 0 &&
        rows.last &&
        rows.last.value.indexOf("check_extendscript_candidate ok") >= 0 &&
        rows.writes &&
        rows.writes.value === "Enabled";
    }, 3000);

    const emergencyClick = await evaluate(send, clickExpression("connectorEmergencyDisableButton"));
    if (!emergencyClick || !emergencyClick.ok) throw new Error("Connector emergency disable button was not clickable.");
    const disabled = await waitFor(send, "connector emergency disable", (state) => {
      const rows = {};
      for (const row of state.connectorRows || []) rows[row.key] = row;
      return rows.writes &&
        rows.writes.value === "Emergency disabled" &&
        rows.emergency &&
        rows.emergency.value === "Active" &&
        state.connectorEmergencyDisabled === true;
    }, 3000);

    console.log(JSON.stringify({
      ok: true,
      page: { title: page.title, url: page.url },
      readyRows: ready.connectorRows,
      emergencyRows: disabled.connectorRows
    }, null, 2));
  } finally {
    try {
      await evaluate(send, restoreConnectorStatusFakeExpression());
    } catch (_error) {}
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
      item.title === "AE Agent 1.0.6" &&
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
        state.setupActionText.indexOf("Retry CLI check") >= 0
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

function agentScenarioStamp() {
  return String(Date.now()).slice(-8);
}

async function agentScenarioReadiness(config) {
  const scenarioConfig = config || defaultAgentScenarioConfig();
  const response = await getJson(bridgeGetUrl("/agents/readiness", {
    agentId: scenarioConfig.agentId,
    model: scenarioConfig.model,
    checkModels: "1",
    timeoutMs: scenarioConfig.readinessTimeoutMs || 45000
  }));
  if (!response || response.ok !== true || !response.readiness) {
    throw new Error(`${scenarioConfig.label}: provider readiness check failed.`);
  }
  if (response.readiness.canChat !== true) {
    const error = response.readiness.error || response.readiness.status || "provider is not ready";
    throw new Error(`${scenarioConfig.label}: ${scenarioConfig.agentId}/${scenarioConfig.model} is not ready for Agent scenario QA: ${error}`);
  }
  return response.readiness;
}

async function agentScenarioAudit() {
  const prefixLimit = boundedNumber(process.env.CEP_PANEL_AUDIT_MAX_PREFIXES, 30, 1, 100);
  const prefixes = collectAuditPrefixes({
    prefixes: process.env.CEP_PANEL_AUDIT_PREFIXES || "",
    includeReportPrefixes: process.env.CEP_PANEL_AUDIT_INCLUDE_REPORT_PREFIXES !== "0",
    reportLimit: boundedNumber(process.env.CEP_PANEL_AUDIT_REPORT_LIMIT, 5, 0, 50)
  }).slice(0, prefixLimit);
  const projectItemLimit = boundedNumber(process.env.CEP_PANEL_AUDIT_PROJECT_ITEM_LIMIT, 50, 1, 250);
  const renderQueueLimit = boundedNumber(process.env.CEP_PANEL_AUDIT_RENDER_QUEUE_LIMIT, 100, 1, 200);
  const checkpointLimit = boundedNumber(process.env.CEP_PANEL_AUDIT_CHECKPOINT_LIMIT, 200, 1, 500);
  const editSessionLimit = boundedNumber(process.env.CEP_PANEL_AUDIT_EDIT_SESSION_LIMIT, 200, 1, 200);
  const detailLimit = boundedNumber(process.env.CEP_PANEL_AUDIT_DETAIL_LIMIT, 20, 0, 200);

  const healthCall = await safeGetJson(`${BRIDGE_URL.replace(/\/$/, "")}/health`);
  const projectInfoCall = await safeCallBridgeTool("get_project_info");
  const projectSearchResults = [];
  for (const prefix of prefixes) {
    const search = await safeCallBridgeTool("find_project_items", {
      query: prefix,
      limit: projectItemLimit,
      caseSensitive: true
    });
    projectSearchResults.push({
      prefix,
      result: search.ok ? search.result : null,
      error: search.ok ? null : search.error
    });
  }

  const renderQueueCall = await safeCallBridgeTool("get_render_queue_status", { limit: renderQueueLimit });
  const checkpointsCall = await safeCallBridgeTool("list_project_checkpoints", { limit: checkpointLimit });
  const editSessionsCall = await safeCallBridgeTool("list_edit_sessions", { limit: editSessionLimit });
  const audit = buildAgentQaAuditReport({
    bridgeUrl: BRIDGE_URL,
    prefixes,
    health: healthCall.ok ? healthCall.result : null,
    healthError: healthCall.ok ? null : healthCall.error,
    projectInfo: projectInfoCall.ok ? projectInfoCall.result : null,
    projectInfoError: projectInfoCall.ok ? null : projectInfoCall.error,
    projectSearchResults,
    renderQueue: renderQueueCall.ok ? renderQueueCall.result : null,
    renderQueueError: renderQueueCall.ok ? null : renderQueueCall.error,
    checkpoints: checkpointsCall.ok ? checkpointsCall.result : null,
    checkpointsError: checkpointsCall.ok ? null : checkpointsCall.error,
    editSessions: editSessionsCall.ok ? editSessionsCall.result : null,
    editSessionsError: editSessionsCall.ok ? null : editSessionsCall.error,
    detailLimit
  });

  console.log(JSON.stringify(audit, null, 2));
}

async function agentScenarioPreflight(config) {
  const health = await getJson(`${BRIDGE_URL.replace(/\/$/, "")}/health`);
  if (!health || health.ok !== true) throw new Error("Bridge health check failed.");
  if (!health.panelConnected) throw new Error("CEP panel is not connected to the bridge.");

  const readiness = await agentScenarioReadiness(config);
  const codexStatus = readiness && readiness.agent ? readiness.agent.codexStatus : null;
  const activeComp = await callBridgeTool("get_active_comp");
  const editSession = await callBridgeTool("get_edit_session_status");
  if (editSession && editSession.active) {
    throw new Error("An edit session is already active; close or inspect it before running live QA.");
  }
  const renderQueue = await callBridgeTool("get_render_queue_status", { limit: 50 });

  return {
    health: {
      version: health.version,
      panelConnected: health.panelConnected,
      pending: health.pending || health.pendingCommands || 0,
      inflight: health.inflight || health.inflightCommands || 0
    },
    readiness: {
      status: readiness.status,
      canChat: readiness.canChat,
      modelAvailable: readiness.modelAvailable,
      modelSource: readiness.modelSource,
      modelCount: readiness.modelCount || 0,
      codexStatus: codexStatusReport(codexStatus)
    },
    activeComp,
    editSession,
    renderQueue
  };
}

async function cleanupRenderQueueItemsByPrefix(prefix) {
  return callBridgeTool("run_extendscript", {
    timeoutMs: 60000,
    script: `
      var prefix = ${JSON.stringify(prefix)};
      var rq = app.project.renderQueue;
      var removed = [];
      for (var i = rq.numItems; i >= 1; i--) {
        var item = rq.item(i);
        var compName = "";
        var outputPath = "";
        try { compName = item && item.comp ? item.comp.name : ""; } catch (compError) {}
        try {
          if (item && item.outputModule && item.numOutputModules > 0) {
            outputPath = String(item.outputModule(1).file || "");
          }
        } catch (outputError) {}
        if (compName.indexOf(prefix) === 0) {
          removed.push({ index: i, compName: compName, outputPath: outputPath });
          item.remove();
        }
      }
      return {
        prefix: prefix,
        removedCount: removed.length,
        removed: removed,
        totalItems: rq.numItems
      };
    `
  });
}

async function cleanupAgentScenarioPrefix(prefix, renderQueueBaselineTotal) {
  const renderQueueCleanup = await cleanupRenderQueueItemsByPrefix(prefix);
  const cleanup = await postBridge("/agents/plan/run", {
    plan: {
      summary: `Clean up generated live QA items for ${prefix}`,
      risk: "low",
      requiresCheckpoint: false,
      steps: [
        {
          title: "Remove generated live QA project items",
          tool: "cleanup_test_items",
          args: {
            namePrefix: prefix,
            maxItems: 100,
            confirm: true
          }
        }
      ]
    },
    requestId: `agent-scenario-cleanup-${Date.now()}`,
    dryRun: false,
    confirm: true,
    allowMutations: true,
    autoEditSession: true,
    timeoutMs: 120000
  });

  if (cleanup.status >= 400 || !cleanup.body || cleanup.body.ok !== true) {
    const error = cleanup.body && (cleanup.body.error || (cleanup.body.run && cleanup.body.run.error));
    throw new Error(`Cleanup for ${prefix} failed: ${error || `HTTP ${cleanup.status}`}`);
  }

  const remaining = await callBridgeTool("find_project_items", {
    query: prefix,
    limit: 20,
    caseSensitive: true
  });
  if (remaining.matches && remaining.matches.length) {
    throw new Error(`Cleanup left generated project items for ${prefix}: ${remaining.matches.map((item) => item.name).join(", ")}`);
  }

  const renderQueue = await callBridgeTool("get_render_queue_status", { limit: 50 });
  if (Number(renderQueue.totalItems || 0) !== Number(renderQueueBaselineTotal || 0)) {
    throw new Error(`Render queue baseline mismatch after cleanup for ${prefix}: expected ${renderQueueBaselineTotal}, got ${renderQueue.totalItems}.`);
  }

  return {
    renderQueueCleanup,
    run: cleanup.body.run,
    remaining,
    renderQueue
  };
}

function planRunSummary(run) {
  const steps = run && Array.isArray(run.steps) ? run.steps : [];
  return {
    ok: run ? run.ok === true : false,
    dryRun: run ? run.dryRun === true : null,
    safety: run ? run.safety || null : null,
    checkpoint: run && run.editSession && run.editSession.checkpoint ? run.editSession.checkpoint : run && run.checkpoint ? run.checkpoint : null,
    semanticVerification: run ? run.semanticVerification || null : null,
    statuses: steps.map((step) => ({
      title: step.title || step.tool || "Step",
      tool: step.tool || null,
      status: step.status || null,
      targetSummary: step.targetSummary || null,
      error: step.error || null
    }))
  };
}

async function runBridgePlanForScenario(scenario, dryRun) {
  const response = await postBridge("/agents/plan/run", {
    plan: scenario.plan,
    requestId: `agent-scenario-${scenario.id}-${dryRun ? "dry" : "run"}-${Date.now()}`,
    dryRun,
    confirm: !dryRun,
    allowMutations: !dryRun,
    autoEditSession: !dryRun,
    timeoutMs: 180000
  });

  if (response.status >= 400 || !response.body || response.body.ok !== true) {
    const error = response.body && (response.body.error || (response.body.run && response.body.run.error));
    throw new Error(`${scenario.id}: direct ${dryRun ? "dry-run" : "run"} failed: ${error || `HTTP ${response.status}`}`);
  }
  if (!response.body.run || response.body.run.ok !== true) {
    throw new Error(`${scenario.id}: direct ${dryRun ? "dry-run" : "run"} needs review.`);
  }
  return response.body.run;
}

function scenarioValidationLine(scenario) {
  return `Validation: ok, ${scenario.expectedStepCount} ${scenario.expectedStepCount === 1 ? "step" : "steps"}, ${scenario.expectedMutatingCount} mutating`;
}

function panelPlanExpectation(scenario, state) {
  const transcript = state && state.transcript ? state.transcript : "";
  const validationLine = scenarioValidationLine(scenario);
  const checks = {
    reviewReady: transcript.indexOf("Plan review: ready") >= 0,
    validationLine: transcript.indexOf(validationLine) >= 0,
    classificationVerdict: transcript.indexOf("Confidence: Risky") >= 0,
    mutatingStatus: state && state.planRunStatus === "Risky plan; dry run first",
    mutatingStatusClass: Boolean(state && state.planRunStatusClass && state.planRunStatusClass.indexOf("mutating") >= 0),
    dryRunEnabled: Boolean(state && state.dryRunDisabled === false),
    runEnabled: Boolean(state && state.runDisabled === false)
  };
  return {
    ok: checks.reviewReady &&
      checks.classificationVerdict &&
      checks.validationLine &&
      checks.mutatingStatus &&
      checks.mutatingStatusClass &&
      checks.dryRunEnabled &&
      checks.runEnabled,
    validationLine,
    expectedStepCount: scenario.expectedStepCount,
    expectedMutatingCount: scenario.expectedMutatingCount,
    expectedTools: scenario.expectedTools,
    planRunStatus: state ? state.planRunStatus : "",
    planRunStatusClass: state ? state.planRunStatusClass : "",
    checks
  };
}

function panelPlanReport(scenario, state, expectation) {
  const report = expectation || panelPlanExpectation(scenario, state);
  return {
    accepted: report.ok,
    validationLine: report.validationLine,
    expectedStepCount: report.expectedStepCount,
    expectedMutatingCount: report.expectedMutatingCount,
    expectedTools: report.expectedTools,
    planRunStatus: report.planRunStatus,
    planRunStatusClass: report.planRunStatusClass,
    checks: report.checks,
    transcriptTail: state && state.transcript ? state.transcript.slice(-3000) : ""
  };
}

async function runDeterministicScenarioFallback(scenario, panelPlan, expectation) {
  const dryRun = await runBridgePlanForScenario(scenario, true);
  const run = await runBridgePlanForScenario(scenario, false);
  if (!run.editSession && (!run.safety || run.safety.protection !== "auto_edit_session")) {
    throw new Error(`${scenario.id}: deterministic fallback did not use edit-session protection.`);
  }
  return {
    id: scenario.id,
    cleanupPrefix: scenario.cleanupPrefix,
    executionMode: "deterministic-plan-fallback",
    fallbackReason: "Panel Agent planner did not return the expected typed-tool plan and protected run readiness.",
    panelPlan: panelPlanReport(scenario, panelPlan, expectation),
    dryRun: planRunSummary(dryRun),
    run: planRunSummary(run)
  };
}

async function runAgentScenario(send, scenario, config) {
  const scenarioConfig = config || defaultAgentScenarioConfig();
  await evaluate(send, selectAgentScenarioExpression(scenario.prompt, scenarioConfig));
  await waitFor(send, `${scenario.id} agent ready`, (state) => (
    state.agentValue === scenarioConfig.agentId &&
    state.model === scenarioConfig.model &&
    state.mode === "plan" &&
    state.promptOptimizationChecked === false &&
    state.sendDisabled === false
  ), 20000);

  const sent = await evaluate(send, clickExpression("sendChatButton"));
  if (!sent || !sent.ok) throw new Error(`${scenario.id}: Send button was not clickable.`);
  await waitFor(send, `${scenario.id} planning indicator`, (state) => (
    state.workingExists === true &&
    state.workingText.indexOf("Planning") >= 0
  ), 5000).catch(() => null);

  const planned = await waitFor(send, `${scenario.id} Agent plan`, (state) => (
    state.sendDisabled === false &&
    state.transcript.indexOf("Plan review:") >= 0 &&
    state.transcript.indexOf("Validation:") >= 0
  ), AGENT_SCENARIO_WAIT_MS);

  const expectedPanelPlan = panelPlanExpectation(scenario, planned);

  if (!expectedPanelPlan.ok) {
    return runDeterministicScenarioFallback(scenario, planned, expectedPanelPlan);
  }

  const dryRunClicked = await evaluate(send, clickExpression("dryRunPlanButton"));
  if (!dryRunClicked || !dryRunClicked.ok) throw new Error(`${scenario.id}: Dry run button was not clickable.`);
  const dryRun = await waitFor(send, `${scenario.id} dry run`, (state) => (
    state.sendDisabled === false &&
    state.transcript.indexOf("Dry run: ok") >= 0 &&
    state.transcript.indexOf("Mode: preview only; project was not changed.") >= 0 &&
    state.transcript.indexOf("Checkpoint/edit session: dry-run only; no checkpoint was created.") >= 0
  ), 60000);

  await evaluate(send, installConfirmExpression());
  const runClicked = await evaluate(send, clickExpression("runPlanButton"));
  if (!runClicked || !runClicked.ok) throw new Error(`${scenario.id}: Run plan button was not clickable.`);

  const run = await waitFor(send, `${scenario.id} protected run`, (state) => {
    if (state.sendDisabled !== false) return false;
    if (state.transcript.indexOf("Run: ok") >= 0) return true;
    if (state.transcript.indexOf("Run: needs review") >= 0) return true;
    if (state.transcript.indexOf("Save the After Effects project first") >= 0) return true;
    if (state.transcript.indexOf("Save project first") >= 0) return true;
    return false;
  }, AGENT_SCENARIO_WAIT_MS);

  if ((run.confirmMessages || []).length) {
    throw new Error(`${scenario.id}: Run plan showed an unexpected confirmation dialog.`);
  }

  const blockedSaveFirst = (
    run.transcript.indexOf("Save the After Effects project first") >= 0 ||
    run.transcript.indexOf("Save project first") >= 0
  );
  if (blockedSaveFirst) {
    throw new Error(`${scenario.id}: project must be saved before live QA mutations can run.`);
  }
  if (run.transcript.indexOf("Run: ok") < 0) {
    throw new Error(`${scenario.id}: protected run did not complete cleanly.\n${run.transcript.slice(-3000)}`);
  }
  if (run.transcript.indexOf("Checkpoint/edit session: protected by") < 0) {
    throw new Error(`${scenario.id}: protected run did not report checkpoint/edit-session protection.`);
  }
  if (run.transcript.indexOf("Outcome verification: passed") < 0) {
    throw new Error(`${scenario.id}: protected run did not report passed outcome verification.\n${run.transcript.slice(-3000)}`);
  }

  return {
    id: scenario.id,
    cleanupPrefix: scenario.cleanupPrefix,
    executionMode: "panel-agent-plan",
    panelPlan: panelPlanReport(scenario, planned, expectedPanelPlan),
    dryRun: {
      transcriptTail: dryRun.transcript.slice(-3000)
    },
    run: {
      transcriptTail: run.transcript.slice(-3000),
      semanticVerification: run.planRunSemanticVerification || null,
      logTail: run.log.slice(-1200)
    }
  };
}

async function agentScenarioSmoke(config) {
  const scenarioConfig = config || defaultAgentScenarioConfig();
  const preflight = await agentScenarioPreflight(scenarioConfig);
  const renderQueueBaselineTotal = Number(preflight.renderQueue && preflight.renderQueue.totalItems || 0);
  const runPrefix = `${AGENT_SCENARIO_PREFIX} ${agentScenarioStamp()}`;
  const scenarios = agentScenarioPlans(runPrefix, renderQueueBaselineTotal);
  const { page, ws, send } = await connectToPanel();
  let historyBackup = null;
  let composerBackup = null;
  let finalCleanupDone = false;
  const results = [];
  const cleanups = [];

  try {
    historyBackup = await evaluate(send, historyStorageExpression());
    composerBackup = await evaluate(send, composerStateExpression());
    await reloadActivePage(send);
    await evaluate(send, setupExpression());
    await waitFor(send, "panel online", (state) => state.badge === "online", 15000);
    await waitFor(send, "agent list", (state) => state.agentOptions.some((option) => option.value === scenarioConfig.agentId), 20000);

    for (const scenario of scenarios) {
      const result = await runAgentScenario(send, scenario, scenarioConfig);
      results.push(result);
      const cleanup = await cleanupAgentScenarioPrefix(scenario.cleanupPrefix, renderQueueBaselineTotal);
      cleanups.push({
        id: scenario.id,
        cleanupPrefix: scenario.cleanupPrefix,
        renderQueueRemovedCount: cleanup.renderQueueCleanup ? cleanup.renderQueueCleanup.removedCount : null,
        removedCount: cleanup.run && cleanup.run.steps && cleanup.run.steps[0] && cleanup.run.steps[0].result
          ? cleanup.run.steps[0].result.removedCount
          : null,
        renderQueueTotal: cleanup.renderQueue.totalItems
      });
    }

    const finalCleanup = await cleanupAgentScenarioPrefix(runPrefix, renderQueueBaselineTotal);
    finalCleanupDone = true;
    const fallbackCount = results.filter((result) => result.executionMode === "deterministic-plan-fallback").length;
    const panelPlanCount = results.filter((result) => result.executionMode === "panel-agent-plan").length;
    const report = {
      ok: true,
      page: { title: page.title, url: page.url },
      runPrefix,
      planner: {
        label: scenarioConfig.label,
        agent: scenarioConfig.agentId,
        model: scenarioConfig.model,
        providerGroup: scenarioConfig.providerGroup || null,
        authMode: scenarioConfig.authMode || null,
        requirePanelPlans: scenarioConfig.requirePanelPlans
      },
      preflight: {
        health: preflight.health,
        readiness: preflight.readiness,
        activeComp: preflight.activeComp ? {
          itemIndex: preflight.activeComp.itemIndex,
          name: preflight.activeComp.name,
          selectedLayerCount: Array.isArray(preflight.activeComp.selectedLayers) ? preflight.activeComp.selectedLayers.length : 0
        } : null,
        renderQueueTotal: renderQueueBaselineTotal
      },
      plannerAcceptance: {
        panelPlanCount,
        fallbackCount,
        scenarioCount: results.length
      },
      scenarios: results,
      cleanups,
      finalCleanup: {
        renderQueueRemovedCount: finalCleanup.renderQueueCleanup ? finalCleanup.renderQueueCleanup.removedCount : null,
        removedCount: finalCleanup.run && finalCleanup.run.steps && finalCleanup.run.steps[0] && finalCleanup.run.steps[0].result
          ? finalCleanup.run.steps[0].result.removedCount
          : null,
        renderQueueTotal: finalCleanup.renderQueue.totalItems
      }
    };
    const artifact = writeAgentRunReport(report, { source: "cep-panel-cdp-smoke" });
    report.artifact = {
      schemaVersion: artifact.report.schemaVersion,
      path: artifact.path,
      relativePath: artifact.relativePath
    };
    console.log(JSON.stringify(report, null, 2));
    if (scenarioConfig.requirePanelPlans && fallbackCount > 0) {
      throw new Error(`${scenarioConfig.label}: ${fallbackCount} Agent scenario(s) used deterministic fallback; planner fidelity did not meet the GPT-5.5 acceptance gate.`);
    }
  } finally {
    if (!finalCleanupDone) {
      try {
        await cleanupAgentScenarioPrefix(runPrefix, renderQueueBaselineTotal);
      } catch (_cleanupError) {}
    }
    if (historyBackup || composerBackup) {
      try {
        if (historyBackup) await evaluate(send, writeHistoryStorageExpression(historyBackup));
        if (composerBackup) await evaluate(send, writeComposerStateExpression(composerBackup));
        await reloadActivePage(send);
        if (composerBackup) await evaluate(send, writeComposerStateExpression(composerBackup));
      } catch (_restoreError) {}
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
      state.transcript.indexOf("Confidence: Risky") >= 0 &&
      state.transcript.indexOf("Validation: ok") >= 0 &&
      state.transcript.indexOf("1 mutating") >= 0 &&
      state.transcript.indexOf("Affected targets:") >= 0 &&
      state.transcript.indexOf("Run readiness: Dry run checks without changes") >= 0 &&
      state.planRunStatus === "Risky plan; dry run first" &&
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
  if (command === "dev-request-button-smoke") {
    await devRequestButtonSmoke();
    return;
  }
  if (command === "raw-run-gate-smoke") {
    await rawRunGateSmoke();
    return;
  }
  if (command === "mode-toggle-smoke") {
    await modeToggleSmoke();
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
  if (command === "agent-scenario-audit") {
    await agentScenarioAudit();
    return;
  }
  if (command === "agent-scenario-smoke") {
    await agentScenarioSmoke();
    return;
  }
  if (command === "agent-scenario-openai-cli-smoke") {
    await agentScenarioSmoke(openAiCliAgentScenarioConfig());
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
  if (command === "provider-self-test-smoke") {
    await providerSelfTestSmoke();
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
  if (command === "connector-status-smoke") {
    await connectorStatusSmoke();
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
