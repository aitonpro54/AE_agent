"use strict";

const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const daemonPath = path.join(__dirname, "..", "mcp-server", "bridge-daemon.js");
const nodePath = process.execPath;
const bridgePort = String(4300 + Math.floor(Math.random() * 1000));
const bridgeToken = "prompt-optimization-smoke-token";
const model = "capture-model";
const captured = [];

function requestJson(options, payload) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: body ? JSON.parse(body) : {} });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    if (payload) req.write(JSON.stringify(payload));
    req.end();
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function writeJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(text)
  });
  res.end(text);
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForBridge() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 8000) {
    try {
      const response = await requestJson({
        hostname: "127.0.0.1",
        port: bridgePort,
        path: "/health",
        method: "GET"
      });
      if (response.body && response.body.ok) return response.body;
    } catch (_error) {}
    await delay(100);
  }
  throw new Error("Bridge did not become ready.");
}

function messageText(request, role) {
  const messages = request && Array.isArray(request.messages) ? request.messages : [];
  return messages.filter((message) => message.role === role).map((message) => String(message.content || "")).join("\n");
}

async function main() {
  const provider = http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/models") {
        writeJson(res, 200, { data: [{ id: model, object: "model" }] });
        return;
      }

      if (req.method === "POST" && req.url === "/chat/completions") {
        const body = await readJsonBody(req);
        captured.push(body);
        const isPlan = messageText(body, "user").indexOf("Return one JSON object") >= 0;
        const content = isPlan
          ? JSON.stringify({
              summary: "Prompt optimization smoke plan",
              risk: "low",
              requiresCheckpoint: false,
              clarifyingQuestion: null,
              steps: [
                {
                  title: "Read bridge status",
                  intent: "Verify bridge availability.",
                  tool: "get_bridge_status",
                  args: {},
                  mutatesProject: false,
                  verifyAfter: false
                }
              ]
            })
          : "Prompt optimization smoke chat";
        writeJson(res, 200, {
          id: "chatcmpl-smoke",
          object: "chat.completion",
          model,
          choices: [
            {
              index: 0,
              finish_reason: "stop",
              message: {
                role: "assistant",
                content
              }
            }
          ]
        });
        return;
      }

      writeJson(res, 404, { error: "not found" });
    } catch (error) {
      writeJson(res, 500, { error: error.message || String(error) });
    }
  });

  const providerPort = await listen(provider);
  const daemon = spawn(nodePath, [daemonPath], {
    env: {
      ...process.env,
      AE_BRIDGE_PORT: bridgePort,
      AE_BRIDGE_TOKEN: bridgeToken,
      AE_AGENT_PROVIDERS_JSON: JSON.stringify([
        {
          id: "prompt-smoke",
          label: "Prompt Smoke",
          provider: "prompt-smoke",
          apiStyle: "openai",
          baseUrl: `http://127.0.0.1:${providerPort}`,
          model,
          models: [model],
          requiresApiKey: false
        }
      ])
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  const daemonStderr = [];
  daemon.stderr.setEncoding("utf8");
  daemon.stderr.on("data", (chunk) => daemonStderr.push(chunk));

  try {
    await waitForBridge();

    const headers = {
      "content-type": "application/json",
      "x-ae-bridge-token": bridgeToken
    };
    const chat = await requestJson({
      hostname: "127.0.0.1",
      port: bridgePort,
      path: "/agents/chat",
      method: "POST",
      headers
    }, {
      agentId: "prompt-smoke",
      model,
      prompt: "Summarize the active comp.",
      promptOptimization: true
    });

    const plan = await requestJson({
      hostname: "127.0.0.1",
      port: bridgePort,
      path: "/agents/plan",
      method: "POST",
      headers
    }, {
      agentId: "prompt-smoke",
      model,
      prompt: "Create a centered title layer.",
      promptOptimization: true
    });

    if (chat.status !== 200 || !chat.body.ok || !chat.body.result) {
      throw new Error("Prompt optimization chat request failed.");
    }
    if (plan.status !== 200 || !plan.body.ok || !plan.body.result || !plan.body.result.planParseOk) {
      throw new Error("Prompt optimization plan request failed.");
    }
    if (captured.length < 2) {
      throw new Error("Expected provider to capture chat and plan requests.");
    }

    const chatSystem = messageText(captured[0], "system");
    const planUser = messageText(captured[1], "user");
    if (chatSystem.indexOf("Prompt Optimization is enabled") < 0) {
      throw new Error("Chat prompt optimization instruction was not sent to provider.");
    }
    if (planUser.indexOf("Prompt Optimization is enabled") < 0 || planUser.indexOf("Return one JSON object") < 0) {
      throw new Error("Plan prompt optimization instruction was not sent to provider.");
    }

    console.log(JSON.stringify({
      ok: true,
      captured: captured.length,
      chat: {
        status: chat.status,
        text: chat.body.result.text,
        systemIncludesOptimization: chatSystem.indexOf("Prompt Optimization is enabled") >= 0
      },
      plan: {
        status: plan.status,
        summary: plan.body.result.plan.summary,
        userPromptIncludesOptimization: planUser.indexOf("Prompt Optimization is enabled") >= 0
      }
    }, null, 2));
  } finally {
    daemon.kill();
    provider.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
