"use strict";

const assert = require("assert");
const http = require("http");
const { chatWithAgent, checkAgentReadiness } = require("../mcp-server/ai-agents");

const geminiRequests = [];
const claudeRequests = [];

function listen(server) {
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
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

function makeGeminiServer() {
  return http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/models") {
        writeJson(res, 200, {
          models: [
            {
              name: "models/gemini-smoke",
              baseModelId: "gemini-smoke",
              displayName: "Gemini Smoke",
              supportedGenerationMethods: ["generateContent"]
            }
          ]
        });
        return;
      }

      if (req.method === "POST" && req.url === "/models/gemini-smoke:generateContent") {
        const body = await readJsonBody(req);
        geminiRequests.push({ headers: req.headers, body });
        writeJson(res, 200, {
          candidates: [
            {
              finishReason: "STOP",
              content: {
                role: "model",
                parts: [{ text: "Gemini provider smoke ok" }]
              }
            }
          ],
          usageMetadata: {
            promptTokenCount: 1,
            candidatesTokenCount: 1
          }
        });
        return;
      }

      writeJson(res, 404, { error: "not found" });
    } catch (error) {
      writeJson(res, 500, { error: error.message || String(error) });
    }
  });
}

function makeClaudeServer() {
  return http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/models") {
        claudeRequests.push({ listHeaders: req.headers });
        writeJson(res, 200, {
          data: [
            {
              id: "claude-smoke",
              display_name: "Claude Smoke",
              type: "model"
            }
          ]
        });
        return;
      }

      if (req.method === "POST" && req.url === "/messages") {
        const body = await readJsonBody(req);
        claudeRequests.push({ headers: req.headers, body });
        writeJson(res, 200, {
          id: "msg_smoke",
          type: "message",
          role: "assistant",
          model: "claude-smoke",
          stop_reason: "end_turn",
          content: [
            {
              type: "text",
              text: "Claude provider smoke ok"
            }
          ],
          usage: {
            input_tokens: 1,
            output_tokens: 1
          }
        });
        return;
      }

      writeJson(res, 404, { error: "not found" });
    } catch (error) {
      writeJson(res, 500, { error: error.message || String(error) });
    }
  });
}

function saveEnv(names) {
  const saved = {};
  for (const name of names) {
    saved[name] = Object.prototype.hasOwnProperty.call(process.env, name)
      ? process.env[name]
      : undefined;
  }
  return saved;
}

function restoreEnv(saved) {
  for (const name of Object.keys(saved)) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
}

async function main() {
  const envNames = [
    "GEMINI_BASE_URL",
    "GEMINI_API_KEY",
    "GEMINI_MODEL",
    "GEMINI_MODELS",
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_API_KEY",
    "CLAUDE_MODEL",
    "CLAUDE_MODELS"
  ];
  const saved = saveEnv(envNames);
  const gemini = makeGeminiServer();
  const claude = makeClaudeServer();

  try {
    const geminiPort = await listen(gemini);
    const claudePort = await listen(claude);

    process.env.GEMINI_BASE_URL = `http://127.0.0.1:${geminiPort}`;
    process.env.GEMINI_API_KEY = "gemini-smoke-key";
    process.env.GEMINI_MODEL = "gemini-smoke";
    process.env.GEMINI_MODELS = "gemini-smoke";
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${claudePort}`;
    process.env.ANTHROPIC_API_KEY = "claude-smoke-key";
    process.env.CLAUDE_MODEL = "claude-smoke";
    process.env.CLAUDE_MODELS = "claude-smoke";

    const geminiReady = await checkAgentReadiness({ agentId: "gemini-api", model: "gemini-smoke" });
    const claudeReady = await checkAgentReadiness({ agentId: "claude-api", model: "claude-smoke" });
    assert.strictEqual(geminiReady.canChat, true);
    assert.strictEqual(claudeReady.canChat, true);

    const geminiChat = await chatWithAgent({
      agentId: "gemini-api",
      model: "gemini-smoke",
      prompt: "Hello Gemini",
      system: "Gemini system smoke",
      skipReadinessCheck: true
    });
    const claudeChat = await chatWithAgent({
      agentId: "claude-api",
      model: "claude-smoke",
      prompt: "Hello Claude",
      system: "Claude system smoke",
      skipReadinessCheck: true
    });

    assert.strictEqual(geminiChat.text, "Gemini provider smoke ok");
    assert.strictEqual(claudeChat.text, "Claude provider smoke ok");
    assert.strictEqual(geminiRequests[0].headers["x-goog-api-key"], "gemini-smoke-key");
    assert.strictEqual(geminiRequests[0].body.systemInstruction.parts[0].text, "Gemini system smoke");
    assert.strictEqual(geminiRequests[0].body.contents[0].parts[0].text, "Hello Gemini");
    const claudePost = claudeRequests.find((item) => item.body);
    assert(claudePost, "Expected Claude messages request.");
    assert.strictEqual(claudePost.headers["x-api-key"], "claude-smoke-key");
    assert.strictEqual(claudePost.headers["anthropic-version"], "2023-06-01");
    assert.strictEqual(claudePost.body.system, "Claude system smoke");
    assert.strictEqual(claudePost.body.messages[0].content, "Hello Claude");

    console.log(JSON.stringify({
      ok: true,
      gemini: {
        readiness: geminiReady.status,
        text: geminiChat.text,
        requestPath: "/models/gemini-smoke:generateContent"
      },
      claude: {
        readiness: claudeReady.status,
        text: claudeChat.text,
        requestPath: "/messages"
      }
    }, null, 2));
  } finally {
    restoreEnv(saved);
    gemini.close();
    claude.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
