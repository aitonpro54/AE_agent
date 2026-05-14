"use strict";

const assert = require("assert");
const http = require("http");
const { chatWithAgent, checkAgentReadiness } = require("../mcp-server/ai-agents");

const geminiRequests = [];
const claudeRequests = [];
const errorProviderRequests = [];

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

function makeOpenAiErrorServer() {
  return http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/models") {
        writeJson(res, 200, {
          data: [
            {
              id: "ok-model",
              name: "OK Model"
            }
          ]
        });
        return;
      }

      if (req.method === "POST" && req.url === "/chat/completions") {
        const body = await readJsonBody(req);
        errorProviderRequests.push({ headers: req.headers, body });
        const promptText = (body.messages || []).map((message) => message.content || "").join("\n");
        if (/rate-limit/i.test(promptText)) {
          writeJson(res, 429, { error: { message: "Rate limit exceeded for smoke test." } });
          return;
        }
        if (/auth-failure/i.test(promptText)) {
          writeJson(res, 401, { error: { message: "Invalid API key for smoke test." } });
          return;
        }
        if (/malformed-response/i.test(promptText)) {
          writeJson(res, 200, {
            id: "chatcmpl_bad",
            model: "ok-model",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: ""
                },
                finish_reason: "stop"
              }
            ]
          });
          return;
        }
        writeJson(res, 200, {
          id: "chatcmpl_ok",
          model: "ok-model",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: "OpenAI-compatible provider smoke ok"
              },
              finish_reason: "stop"
            }
          ],
          usage: {
            prompt_tokens: 1,
            completion_tokens: 1
          }
        });
        return;
      }

      writeJson(res, 404, { error: { message: "not found" } });
    } catch (error) {
      writeJson(res, 500, { error: { message: error.message || String(error) } });
    }
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

async function unusedPort() {
  const server = http.createServer();
  const port = await listen(server);
  await closeServer(server);
  return port;
}

async function captureError(fn) {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  assert.fail("Expected provider call to fail.");
}

function assertProviderError(error, code) {
  assert(error, `Expected ${code} error.`);
  assert(error.providerError, `Expected providerError for ${code}.`);
  assert.strictEqual(error.providerError.code, code);
  assert.strictEqual(error.providerError.status, code);
  assert.strictEqual(error.providerError.message, error.message);
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
    "GOOGLE_API_KEY",
    "GEMINI_MODEL",
    "GEMINI_MODELS",
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_API_KEY",
    "CLAUDE_API_KEY",
    "CLAUDE_MODEL",
    "CLAUDE_MODELS",
    "AE_AGENT_PROVIDERS_JSON"
  ];
  const saved = saveEnv(envNames);
  const gemini = makeGeminiServer();
  const claude = makeClaudeServer();
  const errorProvider = makeOpenAiErrorServer();

  try {
    const geminiPort = await listen(gemini);
    const claudePort = await listen(claude);
    const errorProviderPort = await listen(errorProvider);
    const networkFailurePort = await unusedPort();

    process.env.GEMINI_BASE_URL = `http://127.0.0.1:${geminiPort}`;
    process.env.GEMINI_API_KEY = "gemini-smoke-key";
    process.env.GOOGLE_API_KEY = "";
    process.env.GEMINI_MODEL = "gemini-smoke";
    process.env.GEMINI_MODELS = "gemini-smoke";
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${claudePort}`;
    process.env.ANTHROPIC_API_KEY = "claude-smoke-key";
    process.env.CLAUDE_API_KEY = "";
    process.env.CLAUDE_MODEL = "claude-smoke";
    process.env.CLAUDE_MODELS = "claude-smoke";
    process.env.AE_AGENT_PROVIDERS_JSON = JSON.stringify([
      {
        id: "error-openai",
        label: "Error OpenAI",
        provider: "error-openai",
        apiStyle: "openai",
        baseUrl: `http://127.0.0.1:${errorProviderPort}`,
        apiKey: "error-smoke-key",
        model: "ok-model",
        models: ["ok-model"],
        requiresApiKey: true
      },
      {
        id: "network-openai",
        label: "Network OpenAI",
        provider: "network-openai",
        apiStyle: "openai",
        baseUrl: `http://127.0.0.1:${networkFailurePort}`,
        apiKey: "network-smoke-key",
        model: "ok-model",
        models: ["ok-model"],
        requiresApiKey: true
      }
    ]);

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

    process.env.GEMINI_API_KEY = "";
    const missingAuthReady = await checkAgentReadiness({ agentId: "gemini-api", model: "gemini-smoke" });
    assert.strictEqual(missingAuthReady.canChat, false);
    assert.strictEqual(missingAuthReady.status, "missing_auth");
    assert.strictEqual(missingAuthReady.providerError.code, "missing_auth");
    assert.match(missingAuthReady.error, /GEMINI_API_KEY/);
    process.env.GEMINI_API_KEY = "gemini-smoke-key";

    const unavailableModelReady = await checkAgentReadiness({ agentId: "error-openai", model: "missing-model" });
    assert.strictEqual(unavailableModelReady.canChat, false);
    assert.strictEqual(unavailableModelReady.status, "model_unavailable");
    assert.strictEqual(unavailableModelReady.providerError.code, "model_unavailable");

    const networkReady = await checkAgentReadiness({
      agentId: "network-openai",
      model: "ok-model",
      timeoutMs: 300
    });
    assert.strictEqual(networkReady.canChat, false);
    assert.strictEqual(networkReady.status, "network_failure");
    assert.strictEqual(networkReady.providerError.code, "network_failure");

    const rateLimitError = await captureError(() => chatWithAgent({
      agentId: "error-openai",
      model: "ok-model",
      prompt: "rate-limit",
      skipReadinessCheck: true
    }));
    assertProviderError(rateLimitError, "rate_limited");

    const authError = await captureError(() => chatWithAgent({
      agentId: "error-openai",
      model: "ok-model",
      prompt: "auth-failure",
      skipReadinessCheck: true
    }));
    assertProviderError(authError, "missing_auth");

    const malformedError = await captureError(() => chatWithAgent({
      agentId: "error-openai",
      model: "ok-model",
      prompt: "malformed-response",
      skipReadinessCheck: true
    }));
    assertProviderError(malformedError, "malformed_response");

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
      },
      errors: {
        missingAuth: missingAuthReady.status,
        unavailableModel: unavailableModelReady.status,
        networkFailure: networkReady.status,
        rateLimit: rateLimitError.providerError.status,
        rejectedAuth: authError.providerError.status,
        malformedResponse: malformedError.providerError.status,
        errorProviderRequests: errorProviderRequests.length
      }
    }, null, 2));
  } finally {
    restoreEnv(saved);
    gemini.close();
    claude.close();
    errorProvider.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
