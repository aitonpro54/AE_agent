"use strict";

const http = require("http");

const DEFAULT_PORT = Number(process.env.CEP_PANEL_CDP_PORT || 8870);
const EXTENSION_ID = process.env.CEP_PANEL_EXTENSION_ID || "com.codex.aemcpbridge";
const BRIDGE_URL = process.env.CEP_PANEL_BRIDGE_URL || "http://127.0.0.1:3456";
const BRIDGE_TOKEN = process.env.CEP_PANEL_BRIDGE_TOKEN || "codex-ae-local";
const AGENT_ID = process.env.CEP_PANEL_AGENT_ID || "ollama-local";
const MODEL = process.env.CEP_PANEL_MODEL || "gemma4:latest";
const OPENAI_CLI_AGENT_ID = process.env.CEP_PANEL_OPENAI_CLI_AGENT_ID || "openai-cli";
const OPENAI_CLI_MODEL = process.env.CEP_PANEL_OPENAI_CLI_MODEL || "gpt-5.5";
const OPENAI_CLI_PROMPT = process.env.CEP_PANEL_OPENAI_CLI_PROMPT || "Reply with exactly: AE GPT CLI OK";
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
    throw new Error(`Could not find Codex AE MCP Bridge panel DevTools page on port ${DEFAULT_PORT}.`);
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
    status: document.getElementById("status") ? document.getElementById("status").textContent : "",
    badge: document.getElementById("badge") ? document.getElementById("badge").textContent : "",
    agentStatus: document.getElementById("agentStatus") ? document.getElementById("agentStatus").textContent : "",
    agentValue: document.getElementById("agentSelect") ? document.getElementById("agentSelect").value : "",
    agentOptions: Array.from(document.querySelectorAll("#agentSelect option")).map((option) => ({ value: option.value, text: option.textContent })),
    agentDetails: document.getElementById("agentDetails") ? document.getElementById("agentDetails").innerText : "",
    model: document.getElementById("agentModel") ? document.getElementById("agentModel").value : "",
    freeModelsVisible: document.getElementById("freeModelsRow") ? document.getElementById("freeModelsRow").style.display !== "none" : null,
    freeModelsChecked: document.getElementById("freeModelsOnly") ? document.getElementById("freeModelsOnly").checked : null,
    mode: document.getElementById("chatMode") ? document.getElementById("chatMode").value : "",
    checkDisabled: document.getElementById("checkAgentButton") ? document.getElementById("checkAgentButton").disabled : null,
    sendDisabled: document.getElementById("sendChatButton") ? document.getElementById("sendChatButton").disabled : null,
    dryRunDisabled: document.getElementById("dryRunPlanButton") ? document.getElementById("dryRunPlanButton").disabled : null,
    runDisabled: document.getElementById("runPlanButton") ? document.getElementById("runPlanButton").disabled : null,
    chatHistoryValue: document.getElementById("chatHistorySelect") ? document.getElementById("chatHistorySelect").value : "",
    chatHistoryOptions: Array.from(document.querySelectorAll("#chatHistorySelect option")).map((option) => ({ value: option.value, text: option.textContent })),
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

function clickExpression(id) {
  return `(() => {
    const el = document.getElementById(${JSON.stringify(id)});
    if (!el) return { ok: false, error: "missing" };
    const before = { disabled: !!el.disabled, text: el.textContent };
    if (!el.disabled) el.click();
    return { ok: !before.disabled, before, state: ${stateExpression()} };
  })()`;
}

function installConfirmExpression() {
  return `(() => {
    window.__codexPanelConfirmMessages = [];
    window.confirm = function (message) {
      window.__codexPanelConfirmMessages.push(String(message || ""));
      return true;
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

    const planned = await waitFor(send, "AE Plan result", (state) => (
      state.sendDisabled === false &&
      state.transcript.indexOf("Validation: ok") >= 0 &&
      state.transcript.indexOf("0 mutating") >= 0 &&
      state.dryRunDisabled === false &&
      state.runDisabled === false
    ), WAIT_MS);

    const dryRunClicked = await evaluate(send, clickExpression("dryRunPlanButton"));
    if (!dryRunClicked || !dryRunClicked.ok) throw new Error("Dry run button was not clickable.");
    const dryRun = await waitFor(send, "dry run result", (state) => (
      state.sendDisabled === false &&
      state.transcript.indexOf("Dry run: ok") >= 0
    ), 30000);

    await evaluate(send, installConfirmExpression());
    const runClicked = await evaluate(send, clickExpression("runPlanButton"));
    if (!runClicked || !runClicked.ok) throw new Error("Run plan button was not clickable.");
    const run = await waitFor(send, "run result", (state) => (
      state.sendDisabled === false &&
      state.transcript.indexOf("Run: ok") >= 0 &&
      state.transcript.indexOf("verification") < 0
    ), 60000).catch(async () => {
      return waitFor(send, "run result with verification text", (state) => (
        state.sendDisabled === false &&
        state.transcript.indexOf("Run: ok") >= 0
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
      state.transcript.indexOf("AE GPT CLI OK") >= 0
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

    const planned = await waitFor(send, "mutating AE Plan result", (state) => (
      state.sendDisabled === false &&
      state.transcript.indexOf("Validation: ok") >= 0 &&
      state.transcript.indexOf("1 mutating") >= 0 &&
      state.transcript.indexOf("create_test_comp") >= 0 &&
      state.dryRunDisabled === false &&
      state.runDisabled === false
    ), WAIT_MS);

    const dryRunClicked = await evaluate(send, clickExpression("dryRunPlanButton"));
    if (!dryRunClicked || !dryRunClicked.ok) throw new Error("Dry run button was not clickable.");
    const dryRun = await waitFor(send, "mutating dry run result", (state) => (
      state.sendDisabled === false &&
      state.transcript.indexOf("Dry run: ok") >= 0 &&
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

    const confirmText = (run.confirmMessages || []).join("\n");
    if (confirmText.indexOf("checkpoint/edit session") < 0) {
      throw new Error("Mutating confirmation did not mention checkpoint/edit session.");
    }

    const blockedSaveFirst = (
      run.transcript.indexOf("Save the After Effects project first") >= 0 ||
      run.transcript.indexOf("Save project first") >= 0
    );
    if (!blockedSaveFirst) {
      if (run.transcript.indexOf("auto_edit_session") < 0 && run.transcript.indexOf("Edit session") < 0) {
        throw new Error("Mutating run did not show edit-session protection.");
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
  if (command === "reload") {
    await reloadPanel();
    return;
  }
  if (command === "mutating-smoke") {
    await mutatingSmoke();
    return;
  }
  if (command === "openai-cli-smoke") {
    await openAiCliSmoke();
    return;
  }
  if (command === "history-smoke") {
    await historySmoke();
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
