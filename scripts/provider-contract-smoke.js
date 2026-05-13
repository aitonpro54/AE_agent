"use strict";

const assert = require("assert");
const { checkAgentReadiness, launchCodexLogin, listAgents } = require("../mcp-server/ai-agents");

const EXPECTED_OPENAI_CLI_MODELS = [
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.3-codex",
  "gpt-5.3-codex-spark",
  "gpt-5.2"
];

const MANAGED_ENV = [
  "CODEX_CLI_PATH",
  "CODEX_PATH",
  "CODEX_CLI_MODEL",
  "OPENAI_CLI_MODEL",
  "CODEX_CLI_MODELS",
  "OPENAI_CLI_MODELS",
  "OPENAI_API_KEY",
  "OPENAI_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "ANTHROPIC_API_KEY",
  "CLAUDE_API_KEY"
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

function findAgent(agents, id) {
  const agent = agents.find((item) => item.id === id);
  assert(agent, `Missing agent ${id}`);
  return agent;
}

async function main() {
  const saved = saveEnv();
  try {
    setEnv("CODEX_CLI_PATH", "definitely-missing-codex-cli-for-provider-contract-smoke.exe");
    setEnv("CODEX_PATH", null);
    setEnv("CODEX_CLI_MODEL", null);
    setEnv("OPENAI_CLI_MODEL", null);
    setEnv("CODEX_CLI_MODELS", null);
    setEnv("OPENAI_CLI_MODELS", null);
    setEnv("OPENAI_API_KEY", "");
    setEnv("OPENAI_KEY", "");
    setEnv("GEMINI_API_KEY", "");
    setEnv("GOOGLE_API_KEY", "");
    setEnv("ANTHROPIC_API_KEY", "");
    setEnv("CLAUDE_API_KEY", "");

    const listed = await listAgents({});
    const openAiApi = findAgent(listed.agents, "openai-api");
    const openAiCli = findAgent(listed.agents, "openai-cli");
    const geminiApi = findAgent(listed.agents, "gemini-api");
    const claudeApi = findAgent(listed.agents, "claude-api");

    assert.strictEqual(openAiApi.providerGroup, "openai");
    assert.strictEqual(openAiApi.authMode, "api");
    assert.strictEqual(openAiApi.transport, "openai-chat-completions");
    assert.strictEqual(openAiApi.requiresApiKey, true);
    assert.strictEqual(openAiApi.canSaveKey, true);
    assert.strictEqual(openAiApi.setupAction, "save_api_key");
    assert.strictEqual(openAiApi.configured, false);

    assert.strictEqual(openAiCli.providerGroup, "openai");
    assert.strictEqual(openAiCli.authMode, "cli");
    assert.strictEqual(openAiCli.transport, "codex-cli");
    assert.deepStrictEqual(openAiCli.uiModes, ["cli"]);
    assert.strictEqual(openAiCli.requiresApiKey, false);
    assert.strictEqual(openAiCli.canSaveKey, false);
    assert.strictEqual(openAiCli.setupAction, "codex_login");
    assert.strictEqual(openAiCli.configured, false);
    assert(openAiCli.codexStatus, "OpenAI CLI should expose codexStatus");
    assert.strictEqual(openAiCli.codexStatus.installed, false);
    assert.strictEqual(openAiCli.codexStatus.loggedIn, false);

    const cliModelIds = openAiCli.modelOptions.map((item) => item.id);
    assert.deepStrictEqual(cliModelIds, EXPECTED_OPENAI_CLI_MODELS);
    assert(!cliModelIds.includes("Codex Auto Review"));
    assert(!cliModelIds.includes("codex-auto-review"));

    assert.strictEqual(geminiApi.providerGroup, "gemini");
    assert.strictEqual(geminiApi.authMode, "api");
    assert.strictEqual(geminiApi.transport, "gemini-generate-content");
    assert.strictEqual(geminiApi.requiresApiKey, true);
    assert.strictEqual(geminiApi.canSaveKey, true);
    assert.strictEqual(geminiApi.setupAction, "save_api_key");
    assert.strictEqual(geminiApi.configured, false);
    assert(geminiApi.modelOptions.some((item) => item.id === "gemini-2.5-flash"));

    assert.strictEqual(claudeApi.providerGroup, "claude");
    assert.strictEqual(claudeApi.authMode, "api");
    assert.strictEqual(claudeApi.transport, "anthropic-messages");
    assert.strictEqual(claudeApi.requiresApiKey, true);
    assert.strictEqual(claudeApi.canSaveKey, true);
    assert.strictEqual(claudeApi.setupAction, "save_api_key");
    assert.strictEqual(claudeApi.configured, false);
    assert(claudeApi.modelOptions.some((item) => item.id === "claude-sonnet-4-20250514"));

    const readiness = await checkAgentReadiness({
      agentId: "openai-cli",
      model: "gpt-5.5"
    });
    assert.strictEqual(readiness.canChat, false);
    assert.strictEqual(readiness.configured, false);
    assert.match(readiness.error, /Codex CLI was not found|run codex login/i);

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
          authMode: openAiApi.authMode,
          setupAction: openAiApi.setupAction,
          requiresApiKey: openAiApi.requiresApiKey
        },
        openAiCli: {
          authMode: openAiCli.authMode,
          setupAction: openAiCli.setupAction,
          requiresApiKey: openAiCli.requiresApiKey,
          models: cliModelIds,
          missingCliError: readiness.error,
          setupLaunchBlocked: missingCliSetupError.status.status
        },
        geminiApi: {
          authMode: geminiApi.authMode,
          setupAction: geminiApi.setupAction,
          requiresApiKey: geminiApi.requiresApiKey,
          model: geminiApi.model
        },
        claudeApi: {
          authMode: claudeApi.authMode,
          setupAction: claudeApi.setupAction,
          requiresApiKey: claudeApi.requiresApiKey,
          model: claudeApi.model
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
