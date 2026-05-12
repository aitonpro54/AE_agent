"use strict";

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");

const EXTENSION_ID = process.env.AEGPT_EXTENSION_ID || "com.suza.aegpt.main";
const CEP_VERSION = process.env.AEGPT_CEP_VERSION || "AEFT_26.2";
const CACHE_DIR = process.env.AEGPT_CEP_CACHE_DIR || path.join(os.tmpdir(), "cep_cache", `${CEP_VERSION}_${EXTENSION_ID}`);
const DEVTOOLS_PORT_FILE = path.join(CACHE_DIR, "DevToolsActivePort");
const DEFAULT_WAIT_MS = Number(process.env.AEGPT_WAIT_MS || 120000);

function redact(value) {
  return String(value || "")
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "<redacted-key>")
    .replace(/[A-Za-z0-9_-]{32,}/g, "<redacted-long-token>");
}

function readDevToolsPort() {
  if (process.env.AEGPT_CDP_PORT) return Number(process.env.AEGPT_CDP_PORT);
  const text = fs.readFileSync(DEVTOOLS_PORT_FILE, "utf8").trim().split(/\r?\n/);
  return Number(text[0]);
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

async function connectToPage() {
  const port = readDevToolsPort();
  const pages = await getJson(`http://127.0.0.1:${port}/json/list`);
  const page = pages.find((item) => item.url && item.url.indexOf(EXTENSION_ID) >= 0) || pages[0];
  if (!page || !page.webSocketDebuggerUrl) {
    throw new Error(`Could not find AE GPT DevTools page on port ${port}.`);
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
  return { port, page, ws, send };
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

function inspectExpression() {
  return `(() => ({
    title: document.title,
    url: location.href,
    bodyText: document.body.innerText.slice(0, 8000),
    controls: Array.from(document.querySelectorAll('button,input,textarea,select,[role=button],[contenteditable=true],a')).slice(0, 160).map((el, i) => ({
      i,
      tag: el.tagName,
      text: String(el.innerText || el.value || el.placeholder || el.getAttribute('aria-label') || '').slice(0, 220),
      cls: String(el.className || ''),
      type: el.type || null,
      disabled: !!el.disabled
    })),
    localStorageKeys: Object.keys(localStorage || {}).sort()
  }))()`;
}

function sendPromptExpression(options) {
  const prompt = JSON.stringify(options.prompt);
  const provider = JSON.stringify(options.provider || "");
  const mode = JSON.stringify(options.mode || "chat");
  const newChat = options.newChat !== false;
  const promptOptimization = options.promptOptimization === true;

  return `(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const providerName = ${provider};
    if (providerName) {
      const providerButton = buttons.find((el) => (el.innerText || '').trim() === providerName);
      if (providerButton) providerButton.click();
    }

    if (${newChat ? "true" : "false"}) {
      const newChatButton = Array.from(document.querySelectorAll('button')).find((el) => (el.innerText || '').trim() === 'New Chat');
      if (newChatButton) newChatButton.click();
    }

    const desiredMode = ${mode};
    const pill = document.querySelector('.mode-pill');
    if (pill) {
      const isAgent = pill.className.indexOf('is-agent') >= 0;
      if (desiredMode === 'agent' && !isAgent) pill.click();
      if (desiredMode === 'chat' && isAgent) pill.click();
    }

    const opt = document.querySelector('.prompt-opt-toggle');
    if (opt) {
      const isOn = opt.className.indexOf('is-on') >= 0;
      if (${promptOptimization ? "true" : "false"} !== isOn) opt.click();
    }

    const textarea = document.querySelector('textarea.input, textarea');
    if (!textarea) return { ok: false, error: 'textarea not found' };
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(textarea, ${prompt});
    textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${prompt} }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));

    const sendButton = document.querySelector('button.send-btn');
    const stateBefore = {
      disabled: sendButton ? !!sendButton.disabled : null,
      cls: sendButton ? String(sendButton.className) : null,
      modeClass: document.querySelector('.message-input') ? document.querySelector('.message-input').className : null,
      provider: Array.from(document.querySelectorAll('button.tab')).find((el) => String(el.className).indexOf('active') >= 0)?.innerText || null
    };
    if (sendButton) sendButton.click();
    return { ok: true, stateBefore, bodyText: document.body.innerText.slice(0, 4000) };
  })()`;
}

async function waitForResult(send, prompt, waitMs) {
  const started = Date.now();
  let latest = null;
  while (Date.now() - started < waitMs) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    latest = await evaluate(send, `(() => ({
      atMs: ${Date.now()} - ${started},
      bodyText: document.body.innerText.slice(0, 16000),
      modeClass: document.querySelector('.message-input') ? document.querySelector('.message-input').className : null,
      sendDisabled: document.querySelector('button.send-btn') ? document.querySelector('button.send-btn').disabled : null
    }))()`);

    const text = latest.bodyText || "";
    if (text.indexOf(prompt.slice(0, 60)) >= 0 && latest.sendDisabled === true && Date.now() - started > 9000) {
      break;
    }
  }
  return latest;
}

async function main() {
  const command = process.argv[2] || "inspect";
  const { port, page, ws, send } = await connectToPage();
  try {
    if (command === "inspect") {
      const result = await evaluate(send, inspectExpression());
      console.log(redact(JSON.stringify({ port, page: { title: page.title, url: page.url }, result }, null, 2)));
      return;
    }

    if (command === "send") {
      const prompt = process.env.AEGPT_PROMPT || process.argv.slice(3).join(" ");
      if (!prompt) throw new Error("Provide a prompt as arguments or AEGPT_PROMPT.");
      const options = {
        prompt,
        provider: process.env.AEGPT_PROVIDER || "Local",
        mode: process.env.AEGPT_MODE || "chat",
        newChat: process.env.AEGPT_NEW_CHAT !== "0",
        promptOptimization: process.env.AEGPT_PROMPT_OPTIMIZATION === "1"
      };
      const sent = await evaluate(send, sendPromptExpression(options));
      const final = await waitForResult(send, prompt, DEFAULT_WAIT_MS);
      console.log(redact(JSON.stringify({ port, options: { ...options, prompt }, sent, final }, null, 2)));
      return;
    }

    throw new Error(`Unknown command: ${command}`);
  } finally {
    ws.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
