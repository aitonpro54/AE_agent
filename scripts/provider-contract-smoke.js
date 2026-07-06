"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { checkAgentReadiness, chatWithAgent, launchCodexLogin, listAgents } = require("../mcp-server/ai-agents");
const {
  PROVIDER_KINDS,
  providerReadinessFromStatus
} = require("../mcp-server/provider-contracts");
const {
  createLocalSecretStore,
  redactSensitiveObject
} = require("../mcp-server/local-secret-store");

const EXPECTED_PROVIDER_AGENT_ORDER = [
  "openai-api",
  "openai-cli",
  "gemini-api",
  "claude-api",
  "openrouter",
  "ollama-local"
];

const MANAGED_ENV = [
  "CODEX_CLI_PATH",
  "CODEX_PATH",
  "CODEX_CLI_MODEL",
  "OPENAI_CLI_MODEL",
  "CODEX_CLI_MODELS",
  "OPENAI_CLI_MODELS",
  "OPENAI_MODEL",
  "OPENAI_MODELS",
  "OPENAI_API_KEY",
  "OPENAI_KEY",
  "GEMINI_MODEL",
  "GEMINI_MODELS",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "CLAUDE_MODEL",
  "ANTHROPIC_MODEL",
  "CLAUDE_MODELS",
  "ANTHROPIC_MODELS",
  "ANTHROPIC_API_KEY",
  "CLAUDE_API_KEY",
  "OPENROUTER_API_KEY",
  "OPENROUTER_KEY",
  "OPENROUTER_MODEL",
  "OPENROUTER_FREE_MODEL",
  "OPENROUTER_MODELS",
  "OLLAMA_MODEL",
  "OLLAMA_MODELS",
  "OLLAMA_BASE_URL"
];

function saveEnv() {
  const saved = {};
  for (const name of MANAGED_ENV) {
    saved[name] = Object.prototype.hasOwnProperty.call(process.env, name)
      ? process.env[name]
      : undefined;
  }
  return saved;
}

function restoreEnv(saved) {
  for (const name of MANAGED_ENV) {
    if (saved[name] === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = saved[name];
    }
  }
}

function setEnv(name, value) {
  if (value === null || value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

async function withFakeNodeCodex(loginExitCode, loginText, callback) {
  const oldCwd = process.cwd();
  const oldCodexCliPath = Object.prototype.hasOwnProperty.call(process.env, "CODEX_CLI_PATH")
    ? process.env.CODEX_CLI_PATH
    : undefined;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ae-agent-fake-codex-"));
  const loginScript = [
    "if (process.argv[2] !== \"status\") {",
    "  console.error(\"Unsupported fake Codex login command\");",
    "  process.exit(2);",
    "}",
    `console.log(${JSON.stringify(loginText)});`,
    `process.exit(${Number(loginExitCode) || 0});`
  ].join("\n");
  fs.writeFileSync(path.join(tempDir, "login"), loginScript, "utf8");

  try {
    process.chdir(tempDir);
    setEnv("CODEX_CLI_PATH", process.execPath);
    return await callback();
  } finally {
    process.chdir(oldCwd);
    setEnv("CODEX_CLI_PATH", oldCodexCliPath);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function withFakeCmdCodex(loginExitCode, loginText, callback) {
  const oldCodexCliPath = Object.prototype.hasOwnProperty.call(process.env, "CODEX_CLI_PATH")
    ? process.env.CODEX_CLI_PATH
    : undefined;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ae-agent-fake-codex-cmd-"));
  const shimScriptPath = path.join(tempDir, "codex-shim.js");
  const shimCmdPath = path.join(tempDir, "codex.cmd");
  const capturePath = path.join(tempDir, "exec-capture.json");
  const shimScript = [
    "const fs = require(\"fs\");",
    "const args = process.argv.slice(2);",
    "if (args[0] === \"--version\") {",
    "  console.log(\"codex-cli fake-cmd\");",
    "  process.exit(0);",
    "}",
    "if (args[0] === \"login\" && args[1] === \"status\") {",
    `  console.log(${JSON.stringify(loginText)});`,
    `  process.exit(${Number(loginExitCode) || 0});`,
    "}",
    "if (args[0] === \"exec\") {",
    "  let stdin = \"\";",
    "  process.stdin.setEncoding(\"utf8\");",
    "  process.stdin.on(\"data\", (chunk) => { stdin += chunk; });",
    "  process.stdin.on(\"end\", () => {",
    `    fs.writeFileSync(${JSON.stringify(capturePath)}, JSON.stringify({ args, stdin }), \"utf8\");`,
    "    console.log(JSON.stringify({ type: \"thread.started\", thread_id: \"fake-cmd-thread\" }));",
    "    console.log(JSON.stringify({ type: \"turn.started\" }));",
    "    console.log(JSON.stringify({ type: \"item.completed\", item: { type: \"agent_message\", text: \"FAKE CMD CHAT OK\" } }));",
    "    console.log(JSON.stringify({ type: \"turn.completed\", usage: { input_tokens: stdin.length, output_tokens: 4 } }));",
    "  });",
    "  return;",
    "}",
    "console.error(\"Unsupported fake Codex command: \" + args.join(\" \"));",
    "process.exit(2);"
  ].join("\n");
  const shimCmd = [
    "@echo off",
    `"${process.execPath}" "%~dp0codex-shim.js" %*`
  ].join("\r\n");
  fs.writeFileSync(shimScriptPath, shimScript, "utf8");
  fs.writeFileSync(shimCmdPath, shimCmd, "utf8");

  try {
    setEnv("CODEX_CLI_PATH", shimCmdPath);
    return await callback(shimCmdPath, capturePath);
  } finally {
    setEnv("CODEX_CLI_PATH", oldCodexCliPath);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function findAgent(agents, id) {
  const agent = agents.find((item) => item.id === id);
  assert(agent, `Missing agent ${id}`);
  return agent;
}

function assertNonEmptyString(value, label) {
  assert.strictEqual(typeof value, "string", `${label} should be a string`);
  assert(value.trim(), `${label} should not be empty`);
}

function assertModelOptionsShape(agent, label) {
  assert(Array.isArray(agent.modelOptions), `${label} should expose modelOptions`);
  assert(agent.modelOptions.length > 0, `${label} should expose at least one model option`);
  assert(Array.isArray(agent.models), `${label} should expose models`);
  const optionIds = agent.modelOptions.map((item, index) => {
    assert(item && typeof item === "object", `${label} model option ${index} should be an object`);
    assertNonEmptyString(item.id, `${label} model option ${index}.id`);
    assertNonEmptyString(item.name || item.id, `${label} model option ${index}.name`);
    return item.id;
  });
  assert.deepStrictEqual(agent.models, optionIds, `${label} models should mirror modelOptions ids`);
  assert.strictEqual(new Set(optionIds).size, optionIds.length, `${label} model ids should be unique`);
  assert(agent.models.includes(agent.model), `${label} selected model should be in models`);
}

function assertModelsShape(agent, label) {
  assert(Array.isArray(agent.models), `${label} should expose models`);
  assert(agent.models.length > 0, `${label} should expose at least one model`);
  for (const [index, model] of agent.models.entries()) {
    assertNonEmptyString(model, `${label} model ${index}`);
  }
  assert.strictEqual(new Set(agent.models).size, agent.models.length, `${label} model ids should be unique`);
  assert(agent.models.includes(agent.model), `${label} selected model should be in models`);
}

function assertProviderContract(agent, providerKind, storageMode) {
  assert.strictEqual(agent.providerKind, providerKind);
  assert(agent.providerContract, `${agent.id} should expose providerContract`);
  assert.strictEqual(agent.providerContract.providerKind, providerKind);
  assert.strictEqual(agent.providerContract.readinessVersion, "provider-readiness.v1");
  assert(agent.providerContract.readinessStates.includes("ready"));
  assert(agent.providerContract.readinessStates.includes("needs_auth"));
  assert.strictEqual(agent.secretStorage.mode, storageMode);
  if (storageMode === "bridge-local-secret-store") {
    assert.strictEqual(agent.secretStorage.browserLocalStorage, "forbidden");
  }
  assertNonEmptyString(agent.billingLabel, `${agent.id}.billingLabel`);
  assertNonEmptyString(agent.authDescription, `${agent.id}.authDescription`);
}

function assertProviderReadinessFixtures() {
  assert.deepStrictEqual(
    providerReadinessFromStatus(
      { id: "custom-empty", provider: "custom", requiresApiKey: false, baseUrl: "" },
      { configured: false, checkedAt: "fixture" }
    ).state,
    "not_configured"
  );
  assert.deepStrictEqual(
    providerReadinessFromStatus(
      { id: "openai-cli", apiStyle: "codex-cli", codexStatus: { installed: false, loggedIn: false }, models: [] },
      { configured: false, codexStatus: { installed: false, loggedIn: false }, checkedAt: "fixture" }
    ),
    { providerKind: "openai-codex-cli", checkedAt: "fixture", state: "missing_dependency", dependency: "codex" }
  );
  assert.deepStrictEqual(
    providerReadinessFromStatus(
      { id: "ollama-local", apiStyle: "ollama", provider: "ollama", baseUrl: "http://127.0.0.1:11434", models: [] },
      { configured: true, reachable: false, checkedAt: "fixture" }
    ),
    { providerKind: "local-ollama", checkedAt: "fixture", state: "missing_dependency", dependency: "ollama" }
  );
  assert.deepStrictEqual(
    providerReadinessFromStatus(
      { id: "openai-api", requiresApiKey: true, baseUrl: "https://api.openai.com/v1", models: ["gpt-5"] },
      { configured: false, providerError: { code: "missing_auth", message: "missing key" }, checkedAt: "fixture" }
    ).state,
    "needs_auth"
  );
  assert.deepStrictEqual(
    providerReadinessFromStatus(
      { id: "openrouter", provider: "openrouter", baseUrl: "https://openrouter.ai/api/v1", models: ["openrouter/free"] },
      { canChat: true, remoteModels: [{ id: "openrouter/free" }], checkedAt: "fixture" }
    ),
    {
      providerKind: "openrouter-api",
      checkedAt: "fixture",
      state: "ready",
      modelIds: ["openrouter/free"],
      billingLabel: "OpenRouter API billing"
    }
  );
  assert.deepStrictEqual(
    providerReadinessFromStatus(
      { id: "gemini-api", apiStyle: "gemini", baseUrl: "https://example.invalid", models: ["gemini-fixture"] },
      { providerError: { code: "rate_limited", retryAfterMs: 2500 }, checkedAt: "fixture" }
    ),
    { providerKind: "gemini-api", checkedAt: "fixture", state: "rate_limited", retryAfterMs: 2500 }
  );
  assert.deepStrictEqual(
    providerReadinessFromStatus(
      { id: "claude-api", apiStyle: "anthropic", baseUrl: "https://example.invalid", models: ["claude-fixture"] },
      { status: "model_unavailable", providerError: { code: "model_unavailable", message: "bad model" }, checkedAt: "fixture" }
    ),
    { providerKind: "claude-api", checkedAt: "fixture", state: "error", code: "model_unavailable", safeMessage: "bad model" }
  );
}

function assertSecretStoreFixtures() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ae-agent-secret-store-"));
  const env = {};
  const file = path.join(tempDir, "agent-secrets.json");
  const rawKey = "sk-test-provider-contract-123456";
  const rotatedKey = "sk-test-provider-contract-rotated";
  try {
    const store = createLocalSecretStore({ file, env });
    const saved = store.save("openai-api", rawKey);
    assert.strictEqual(saved.action, "save");
    assert.strictEqual(saved.apiKeyEnv, "OPENAI_API_KEY");
    assert.strictEqual(saved.exists, true);
    assert.strictEqual(saved.keySuffix, "3456");
    assert.strictEqual(saved.masked, "****3456");
    assert.strictEqual(saved.storage.browserLocalStorage, "forbidden");
    assert.strictEqual(env.OPENAI_API_KEY, rawKey);
    assert(!JSON.stringify(saved).includes(rawKey), "save result must not expose the raw key");

    const read = store.read("openai-api");
    assert.strictEqual(read.exists, true);
    assert.strictEqual(read.masked, "****3456");
    assert(!JSON.stringify(read).includes(rawKey), "read result must not expose the raw key");

    const redacted = redactSensitiveObject({
      OPENAI_API_KEY: rawKey,
      nested: {
        authorization: `Bearer ${rawKey}`,
        ordinary: "visible"
      }
    });
    const redactedText = JSON.stringify(redacted);
    assert(!redactedText.includes(rawKey), "redaction must remove raw key values");
    assert(redactedText.includes("visible"), "redaction must preserve non-sensitive values");

    const rotated = store.rotate("openai-api", rotatedKey);
    assert.strictEqual(rotated.action, "rotate");
    assert.strictEqual(rotated.keySuffix, "ated");
    assert.strictEqual(env.OPENAI_API_KEY, rotatedKey);
    assert(!JSON.stringify(rotated).includes(rotatedKey), "rotate result must not expose the raw key");

    const removed = store.delete("openai-api");
    assert.strictEqual(removed.action, "delete");
    assert.strictEqual(removed.deleted, true);
    assert.strictEqual(removed.exists, false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(env, "OPENAI_API_KEY"), false);

    assert.throws(() => store.save("openai-cli", rawKey), /API-key provider modes/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function main() {
  assert.deepStrictEqual(PROVIDER_KINDS, [
    "openai-api",
    "openai-codex-cli",
    "claude-api",
    "gemini-api",
    "openrouter-api",
    "local-ollama"
  ]);
  assertProviderReadinessFixtures();
  assertSecretStoreFixtures();

  const saved = saveEnv();
  try {
    setEnv("CODEX_CLI_PATH", "definitely-missing-codex-cli-for-provider-contract-smoke.exe");
    setEnv("CODEX_PATH", null);
    setEnv("CODEX_CLI_MODEL", null);
    setEnv("OPENAI_CLI_MODEL", null);
    setEnv("CODEX_CLI_MODELS", null);
    setEnv("OPENAI_CLI_MODELS", null);
    setEnv("OPENAI_MODEL", null);
    setEnv("OPENAI_MODELS", null);
    setEnv("OPENAI_API_KEY", "");
    setEnv("OPENAI_KEY", "");
    setEnv("GEMINI_MODEL", null);
    setEnv("GEMINI_MODELS", null);
    setEnv("GEMINI_API_KEY", "");
    setEnv("GOOGLE_API_KEY", "");
    setEnv("CLAUDE_MODEL", null);
    setEnv("ANTHROPIC_MODEL", null);
    setEnv("CLAUDE_MODELS", null);
    setEnv("ANTHROPIC_MODELS", null);
    setEnv("ANTHROPIC_API_KEY", "");
    setEnv("CLAUDE_API_KEY", "");
    setEnv("OPENROUTER_API_KEY", "");
    setEnv("OPENROUTER_KEY", "");
    setEnv("OPENROUTER_MODEL", null);
    setEnv("OPENROUTER_FREE_MODEL", null);
    setEnv("OPENROUTER_MODELS", null);
    setEnv("OLLAMA_MODEL", "ollama-smoke");
    setEnv("OLLAMA_MODELS", "ollama-smoke");
    setEnv("OLLAMA_BASE_URL", "http://127.0.0.1:11434");

    const listed = await listAgents({});
    const providerAgentIds = listed.agents
      .map((item) => item.id)
      .filter((id) => EXPECTED_PROVIDER_AGENT_ORDER.includes(id));
    assert.strictEqual(new Set(providerAgentIds).size, EXPECTED_PROVIDER_AGENT_ORDER.length);
    assert.deepStrictEqual(providerAgentIds, EXPECTED_PROVIDER_AGENT_ORDER);

    const openAiApi = findAgent(listed.agents, "openai-api");
    const openAiCli = findAgent(listed.agents, "openai-cli");
    const geminiApi = findAgent(listed.agents, "gemini-api");
    const claudeApi = findAgent(listed.agents, "claude-api");
    const openRouter = findAgent(listed.agents, "openrouter");
    const ollamaLocal = findAgent(listed.agents, "ollama-local");

    assertProviderContract(openAiApi, "openai-api", "bridge-local-secret-store");
    assert.strictEqual(openAiApi.providerGroup, "openai");
    assert.strictEqual(openAiApi.authMode, "api");
    assert.strictEqual(openAiApi.transport, "openai-chat-completions");
    assert.deepStrictEqual(openAiApi.uiModes, ["api"]);
    assert.strictEqual(openAiApi.requiresApiKey, true);
    assert.strictEqual(openAiApi.canSaveKey, true);
    assert.strictEqual(openAiApi.setupAction, "save_api_key");
    assert.strictEqual(openAiApi.configured, false);
    assert.match(openAiApi.billingLabel, /API billing/);
    assert.match(openAiApi.authDescription, /does not use ChatGPT subscription/i);
    assertModelOptionsShape(openAiApi, "OpenAI API");

    assertProviderContract(openAiCli, "openai-codex-cli", "none");
    assert.strictEqual(openAiCli.providerGroup, "openai");
    assert.strictEqual(openAiCli.authMode, "cli");
    assert.strictEqual(openAiCli.transport, "codex-cli");
    assert.deepStrictEqual(openAiCli.uiModes, ["cli"]);
    assert.strictEqual(openAiCli.requiresApiKey, false);
    assert.strictEqual(openAiCli.canSaveKey, false);
    assert.strictEqual(openAiCli.setupAction, "codex_login");
    assert.strictEqual(openAiCli.configured, false);
    assert.match(openAiCli.billingLabel, /ChatGPT\/Codex CLI subscription/);
    assert.match(openAiCli.authDescription, /No OpenAI API key/i);
    assert(openAiCli.codexStatus, "OpenAI CLI should expose codexStatus");
    assert.strictEqual(openAiCli.codexStatus.installed, false);
    assert.strictEqual(openAiCli.codexStatus.loggedIn, false);
    assert(openAiCli.codexStatus.versionCheck, "OpenAI CLI status should include version diagnostics");
    assert.deepStrictEqual(openAiCli.codexStatus.versionCheck.args, ["--version"]);
    assert.strictEqual(openAiCli.codexStatus.loginStatusCheck, null);
    assertModelOptionsShape(openAiCli, "OpenAI CLI");
    assert(!openAiCli.models.includes("Codex Auto Review"));
    assert(!openAiCli.models.includes("codex-auto-review"));

    assertProviderContract(geminiApi, "gemini-api", "bridge-local-secret-store");
    assert.strictEqual(geminiApi.providerGroup, "gemini");
    assert.strictEqual(geminiApi.authMode, "api");
    assert.strictEqual(geminiApi.transport, "gemini-generate-content");
    assert.strictEqual(geminiApi.requiresApiKey, true);
    assert.strictEqual(geminiApi.canSaveKey, true);
    assert.strictEqual(geminiApi.setupAction, "save_api_key");
    assert.strictEqual(geminiApi.configured, false);
    assertModelOptionsShape(geminiApi, "Gemini API");

    assertProviderContract(claudeApi, "claude-api", "bridge-local-secret-store");
    assert.strictEqual(claudeApi.providerGroup, "claude");
    assert.strictEqual(claudeApi.authMode, "api");
    assert.strictEqual(claudeApi.transport, "anthropic-messages");
    assert.strictEqual(claudeApi.requiresApiKey, true);
    assert.strictEqual(claudeApi.canSaveKey, true);
    assert.strictEqual(claudeApi.setupAction, "save_api_key");
    assert.strictEqual(claudeApi.configured, false);
    assertModelOptionsShape(claudeApi, "Claude API");

    assertProviderContract(openRouter, "openrouter-api", "bridge-local-secret-store");
    assert.strictEqual(openRouter.providerGroup, "openrouter");
    assert.strictEqual(openRouter.authMode, "api");
    assert.strictEqual(openRouter.transport, "openai-chat-completions");
    assert.deepStrictEqual(openRouter.uiModes, ["api"]);
    assert.strictEqual(openRouter.requiresApiKey, true);
    assert.strictEqual(openRouter.canSaveKey, true);
    assert.strictEqual(openRouter.setupAction, "save_api_key");
    assert.strictEqual(openRouter.configured, false);
    assertModelsShape(openRouter, "OpenRouter");

    assertProviderContract(ollamaLocal, "local-ollama", "none");
    assert.strictEqual(ollamaLocal.providerGroup, "local");
    assert.strictEqual(ollamaLocal.authMode, "local");
    assert.strictEqual(ollamaLocal.requiresApiKey, false);
    assert.strictEqual(ollamaLocal.canSaveKey, false);
    assert.strictEqual(ollamaLocal.setupAction, "detect_ollama");
    assertModelsShape(ollamaLocal, "Local Ollama");

    const apiReadiness = await checkAgentReadiness({
      agentId: "openai-api",
      model: openAiApi.model
    });
    assert.strictEqual(apiReadiness.providerReadiness.state, "needs_auth");
    assert.strictEqual(apiReadiness.providerReadiness.providerKind, "openai-api");

    setEnv("CODEX_CLI_MODEL", "codex-smoke-selected");
    setEnv("CODEX_CLI_MODELS", "codex-smoke-a,codex-smoke-selected");
    setEnv("OPENAI_MODEL", "openai-smoke-selected");
    setEnv("OPENAI_MODELS", "openai-smoke-a,openai-smoke-selected");
    setEnv("GEMINI_MODEL", "gemini-smoke-selected");
    setEnv("GEMINI_MODELS", "gemini-smoke-a,gemini-smoke-selected");
    setEnv("CLAUDE_MODEL", "claude-smoke-selected");
    setEnv("CLAUDE_MODELS", "claude-smoke-a,claude-smoke-selected");
    setEnv("OPENROUTER_MODEL", "openrouter-smoke-selected");
    setEnv("OPENROUTER_MODELS", "openrouter-smoke-a,openrouter-smoke-selected");
    const overrideListed = await listAgents({});
    assert.deepStrictEqual(findAgent(overrideListed.agents, "openai-cli").models, ["codex-smoke-a", "codex-smoke-selected"]);
    assert.strictEqual(findAgent(overrideListed.agents, "openai-cli").model, "codex-smoke-selected");
    assert.deepStrictEqual(findAgent(overrideListed.agents, "openai-api").models, ["openai-smoke-a", "openai-smoke-selected"]);
    assert.strictEqual(findAgent(overrideListed.agents, "openai-api").model, "openai-smoke-selected");
    assert.deepStrictEqual(findAgent(overrideListed.agents, "gemini-api").models, ["gemini-smoke-a", "gemini-smoke-selected"]);
    assert.strictEqual(findAgent(overrideListed.agents, "gemini-api").model, "gemini-smoke-selected");
    assert.deepStrictEqual(findAgent(overrideListed.agents, "claude-api").models, ["claude-smoke-a", "claude-smoke-selected"]);
    assert.strictEqual(findAgent(overrideListed.agents, "claude-api").model, "claude-smoke-selected");
    assert.deepStrictEqual(findAgent(overrideListed.agents, "openrouter").models, ["openrouter-smoke-a", "openrouter-smoke-selected"]);
    assert.strictEqual(findAgent(overrideListed.agents, "openrouter").model, "openrouter-smoke-selected");
    setEnv("CODEX_CLI_MODEL", null);
    setEnv("CODEX_CLI_MODELS", null);
    setEnv("OPENAI_MODEL", null);
    setEnv("OPENAI_MODELS", null);
    setEnv("GEMINI_MODEL", null);
    setEnv("GEMINI_MODELS", null);
    setEnv("CLAUDE_MODEL", null);
    setEnv("CLAUDE_MODELS", null);
    setEnv("OPENROUTER_MODEL", null);
    setEnv("OPENROUTER_MODELS", null);

    const readiness = await checkAgentReadiness({
      agentId: "openai-cli",
      model: openAiCli.model
    });
    assert.strictEqual(readiness.canChat, false);
    assert.strictEqual(readiness.configured, false);
    assert.match(readiness.error, /Codex CLI was not found|run codex login/i);
    assert.strictEqual(readiness.providerReadiness.state, "missing_dependency");
    assert.strictEqual(readiness.providerReadiness.dependency, "codex");
    assert(readiness.agent.codexStatus.versionCheck, "Readiness should echo Codex CLI version diagnostics");

    let missingCliSetupError = null;
    try {
      launchCodexLogin({
        agentId: "openai-cli",
        action: "codex_login",
        dryRun: true
      });
    } catch (error) {
      missingCliSetupError = error;
    }
    assert(missingCliSetupError, "Missing Codex CLI should block setup launch.");
    assert.strictEqual(missingCliSetupError.status.installed, false);

    let fakeNotLoggedIn = null;
    await withFakeNodeCodex(1, "Not logged in from fake Codex", async () => {
      const fakeListed = await listAgents({});
      const fakeCli = findAgent(fakeListed.agents, "openai-cli");
      assert.strictEqual(fakeCli.codexStatus.installed, true);
      assert.strictEqual(fakeCli.codexStatus.loggedIn, false);
      assert.strictEqual(fakeCli.codexStatus.versionCheck.status, 0);
      assert.strictEqual(fakeCli.codexStatus.loginStatusCheck.status, 1);
      assert.match(fakeCli.codexStatus.loginStatusCheck.output, /Not logged in from fake Codex/);

      const fakeReadiness = await checkAgentReadiness({
        agentId: "openai-cli",
        model: fakeCli.model
      });
      assert.strictEqual(fakeReadiness.canChat, false);
      assert.strictEqual(fakeReadiness.configured, false);
      assert.strictEqual(fakeReadiness.providerReadiness.state, "needs_auth");
      assert.strictEqual(fakeReadiness.agent.codexStatus.loginStatusCheck.status, 1);
      fakeNotLoggedIn = fakeReadiness.agent.codexStatus;
    });

    let fakeLoggedIn = null;
    await withFakeNodeCodex(0, "Logged in from fake Codex", async () => {
      const fakeListed = await listAgents({});
      const fakeCli = findAgent(fakeListed.agents, "openai-cli");
      const fakeReadiness = await checkAgentReadiness({
        agentId: "openai-cli",
        model: fakeCli.model
      });
      assert.strictEqual(fakeReadiness.configured, true);
      assert.strictEqual(fakeReadiness.reachable, true);
      assert.strictEqual(fakeReadiness.modelAvailable, true);
      assert.strictEqual(fakeReadiness.canChat, true);
      assert.strictEqual(fakeReadiness.status, "ready");
      assert.strictEqual(fakeReadiness.providerReadiness.state, "ready");
      assert.strictEqual(fakeReadiness.providerReadiness.billingLabel, "ChatGPT/Codex CLI subscription");
      assert.strictEqual(fakeReadiness.agent.codexStatus.loginStatusCheck.status, 0);
      assert.match(fakeReadiness.agent.codexStatus.loginStatusCheck.output, /Logged in from fake Codex/);
      fakeLoggedIn = fakeReadiness.agent.codexStatus;
    });

    let fakeCmdLoggedIn = null;
    if (process.platform === "win32") {
      await withFakeCmdCodex(0, "Logged in from fake cmd Codex", async (shimCmdPath, capturePath) => {
        const fakeListed = await listAgents({});
        const fakeCli = findAgent(fakeListed.agents, "openai-cli");
        const fakeReadiness = await checkAgentReadiness({
          agentId: "openai-cli",
          model: fakeCli.model
        });
        assert.strictEqual(fakeCli.codexStatus.command, shimCmdPath);
        assert.strictEqual(fakeCli.codexStatus.versionCheck.invokedCommand, "cmd.exe");
        assert.strictEqual(fakeCli.codexStatus.loginStatusCheck.invokedCommand, "cmd.exe");
        assert.strictEqual(fakeReadiness.configured, true);
        assert.strictEqual(fakeReadiness.canChat, true);
        assert.strictEqual(fakeReadiness.status, "ready");
        assert.strictEqual(fakeReadiness.providerReadiness.state, "ready");
        assert.match(fakeReadiness.agent.codexStatus.loginStatusCheck.output, /Logged in from fake cmd Codex/);
        const longPrompt = `Return fake response for stdin path.\n${"x".repeat(12000)}`;
        const chat = await chatWithAgent({
          agentId: "openai-cli",
          model: fakeCli.model,
          prompt: longPrompt,
          timeoutMs: 10000,
          includeRawResponse: true
        });
        assert.strictEqual(chat.text, "FAKE CMD CHAT OK");
        const captured = JSON.parse(fs.readFileSync(capturePath, "utf8"));
        assert.strictEqual(captured.args[0], "exec");
        assert.strictEqual(captured.args[captured.args.length - 1], "-");
        assert(captured.args.includes("--json"), "Expected Codex CLI JSONL mode.");
        assert(captured.args.includes("--sandbox"), "Expected Codex CLI sandbox flag.");
        assert(!captured.args.includes(longPrompt), "OpenAI CLI prompt must not be passed as an argv value.");
        assert(captured.stdin.includes(longPrompt), "OpenAI CLI prompt should be piped through stdin.");
        assert(captured.stdin.length > 12000, "Expected long prompt to survive stdin piping.");
        fakeCmdLoggedIn = {
          ...fakeReadiness.agent.codexStatus,
          stdinPromptLength: captured.stdin.length,
          chatText: chat.text
        };
      });
    }

    let unsupportedSetupError = null;
    try {
      launchCodexLogin({
        agentId: "openai-api",
        action: "codex_login",
        dryRun: true
      });
    } catch (error) {
      unsupportedSetupError = error;
    }
    assert(unsupportedSetupError, "OpenAI API must not launch Codex login.");
    assert.match(unsupportedSetupError.message, /Unsupported setup action/);

    console.log(JSON.stringify({
      ok: true,
      checked: {
        openAiApi: {
          providerKind: openAiApi.providerKind,
          authMode: openAiApi.authMode,
          setupAction: openAiApi.setupAction,
          requiresApiKey: openAiApi.requiresApiKey,
          readinessState: apiReadiness.providerReadiness.state
        },
        openAiCli: {
          providerKind: openAiCli.providerKind,
          authMode: openAiCli.authMode,
          setupAction: openAiCli.setupAction,
          requiresApiKey: openAiCli.requiresApiKey,
          modelCount: openAiCli.models.length,
          missingCliError: readiness.error,
          setupLaunchBlocked: missingCliSetupError.status.status,
          missingCliVersionCheck: openAiCli.codexStatus.versionCheck.status,
          fakeNotLoggedInLoginCheck: fakeNotLoggedIn.loginStatusCheck.status,
          fakeLoggedInLoginCheck: fakeLoggedIn.loginStatusCheck.status,
          fakeCmdLoggedInLoginCheck: fakeCmdLoggedIn ? fakeCmdLoggedIn.loginStatusCheck.status : "not_applicable"
        },
        geminiApi: {
          providerKind: geminiApi.providerKind,
          authMode: geminiApi.authMode,
          setupAction: geminiApi.setupAction,
          requiresApiKey: geminiApi.requiresApiKey,
          model: geminiApi.model
        },
        claudeApi: {
          providerKind: claudeApi.providerKind,
          authMode: claudeApi.authMode,
          setupAction: claudeApi.setupAction,
          requiresApiKey: claudeApi.requiresApiKey,
          model: claudeApi.model
        },
        openRouter: {
          providerKind: openRouter.providerKind,
          authMode: openRouter.authMode,
          setupAction: openRouter.setupAction,
          requiresApiKey: openRouter.requiresApiKey,
          models: openRouter.models
        },
        ollamaLocal: {
          providerKind: ollamaLocal.providerKind,
          authMode: ollamaLocal.authMode,
          setupAction: ollamaLocal.setupAction,
          requiresApiKey: ollamaLocal.requiresApiKey
        }
      }
    }, null, 2));
  } finally {
    restoreEnv(saved);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
