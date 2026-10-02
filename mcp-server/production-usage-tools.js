"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024; // 2MB
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function toolResult(text, isError) {
  return {
    content: [{ type: "text", text: typeof text === "string" ? text : JSON.stringify(text, null, 2) }],
    isError: Boolean(isError)
  };
}

function getCodeburnRoot(options) {
  if (options && typeof options.home === "string" && options.home.trim()) {
    return path.resolve(options.home.trim());
  }
  if (process.env.CODEBURN_ANALYTICS_HOME && process.env.CODEBURN_ANALYTICS_HOME.trim()) {
    return path.resolve(process.env.CODEBURN_ANALYTICS_HOME.trim());
  }
  return path.join(os.homedir(), "Documents", "ChatGPT", "Codeburn");
}

function getPythonExecutable(options) {
  if (options && typeof options.python === "string" && options.python.trim()) {
    return options.python.trim();
  }
  if (process.env.CODEBURN_ANALYTICS_PYTHON && process.env.CODEBURN_ANALYTICS_PYTHON.trim()) {
    return process.env.CODEBURN_ANALYTICS_PYTHON.trim();
  }
  return "python";
}

function runSubprocess(executable, args, options) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxOutputBytes || MAX_OUTPUT_BYTES;
  const cwd = options.cwd;

  return new Promise((resolve) => {
    let stdoutBuffer = "";
    let stderrBuffer = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let outputExceeded = false;
    let finished = false;

    // Python must be a real executable: query values never enter a command shell.
    if (/\.(?:cmd|bat|ps1)$/i.test(executable)) {
      return resolve({ spawnError: true, stdout: "", stderr: "Python executable required" });
    }

    let child;
    try {
      child = spawn(executable, args, {
        cwd,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (spawnError) {
      return resolve({
        exitCode: null,
        stdout: "",
        stderr: spawnError.message || String(spawnError),
        timedOut: false,
        outputExceeded: false,
        spawnError: true
      });
    }

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill();
      } catch (_e) {}
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      if (finished) return;
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxBytes) {
        outputExceeded = true;
        try {
          child.kill();
        } catch (_e) {}
        return;
      }
      stdoutBuffer += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      if (finished) return;
      stderrBytes += chunk.length;
      if (stderrBytes > maxBytes) {
        outputExceeded = true;
        try {
          child.kill();
        } catch (_e) {}
        return;
      }
      stderrBuffer += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({
        exitCode: null,
        stdout: stdoutBuffer,
        stderr: (stderrBuffer + "\n" + (err.message || String(err))).trim(),
        timedOut,
        outputExceeded,
        spawnError: true
      });
    });

    child.on("close", (exitCode) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({
        exitCode,
        stdout: stdoutBuffer,
        stderr: stderrBuffer.trim(),
        timedOut,
        outputExceeded,
        spawnError: false
      });
    });
  });
}

async function executeCodeburnQuery(queryArgs, options) {
  options = options || {};
  const codeburnRoot = getCodeburnRoot(options);
  const pythonExecutable = getPythonExecutable(options);
  const scriptPath = path.join(codeburnRoot, "codeburn.py");

  if (!options.runner && !fs.existsSync(scriptPath)) {
    return toolResult({
      ok: false,
      error: "Codeburn analytics script not found (codeburn.py)."
    }, true);
  }

  const spawnArgs = ["-X", "utf8", scriptPath, "query", ...queryArgs];
  const run = typeof options.runner === "function"
    ? options.runner
    : (cmd) => runSubprocess(cmd.executable, cmd.args, cmd);

  const result = await run({
    executable: pythonExecutable,
    args: spawnArgs,
    cwd: codeburnRoot,
    timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
    maxOutputBytes: options.maxOutputBytes || MAX_OUTPUT_BYTES
  });

  if (!result) {
    return toolResult({ ok: false, error: "Codeburn query runner returned no result." }, true);
  }
  if (result.timedOut) {
    return toolResult({ ok: false, error: "Codeburn query timed out after 10s." }, true);
  }
  if (result.outputExceeded) {
    return toolResult({ ok: false, error: "Codeburn query output exceeded 2MB limit." }, true);
  }
  if (result.spawnError || (result.exitCode !== 0 && result.exitCode !== null)) {
    return toolResult({
      ok: false,
      error: "Codeburn query process failed. Check local installation; raw stderr is not exposed."
    }, true);
  }

  const trimmedStdout = (result.stdout || "").trim();
  if (!trimmedStdout) {
    return toolResult({ ok: false, error: "Codeburn query returned empty output." }, true);
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmedStdout);
  } catch (parseError) {
    return toolResult({
      ok: false,
      error: "Invalid JSON from Codeburn query."
    }, true);
  }

  const isError = Boolean(parsed && (parsed.ok === false || parsed.error));
  return toolResult(parsed, isError);
}

async function getTaskUsage(args, options) {
  args = args || {};
  const rawThreadId = typeof args.thread_id === "string" ? args.thread_id.trim() : "";

  if (!rawThreadId) {
    return toolResult({ ok: false, error: "thread_id is required." }, true);
  }
  if (rawThreadId.toLowerCase() === "current") {
    return toolResult({ ok: false, error: "'current' thread_id is not allowed; specify a confirmed runtime thread UUID." }, true);
  }

  const cleanedUuid = rawThreadId.replace(/^\{|\}$/g, "");
  if (!UUID_REGEX.test(cleanedUuid)) {
    return toolResult({ ok: false, error: "thread_id must be a valid UUID string." }, true);
  }

  if (args.include_children !== undefined && typeof args.include_children !== "boolean") {
    return toolResult({ ok: false, error: "include_children must be boolean." }, true);
  }
  const includeChildren = args.include_children !== false;

  const queryArgs = ["--thread", cleanedUuid.toLowerCase()];
  if (includeChildren) {
    queryArgs.push("--children");
  }

  return await executeCodeburnQuery(queryArgs, options);
}

async function getUsageHistory(args, options) {
  args = args || {};
  const queryArgs = [];

  if (typeof args.project === "string" && args.project.trim()) {
    queryArgs.push("--project", args.project.trim());
  }

  if (typeof args.from === "string" && args.from.trim()) {
    const fromDate = args.from.trim();
    if (!DATE_REGEX.test(fromDate)) {
      return toolResult({ ok: false, error: "'from' must be a valid date in YYYY-MM-DD format." }, true);
    }
    queryArgs.push("--from", fromDate);
  }

  if (typeof args.to === "string" && args.to.trim()) {
    const toDate = args.to.trim();
    if (!DATE_REGEX.test(toDate)) {
      return toolResult({ ok: false, error: "'to' must be a valid date in YYYY-MM-DD format." }, true);
    }
    queryArgs.push("--to", toDate);
  }

  if (typeof args.model === "string" && args.model.trim()) {
    queryArgs.push("--model", args.model.trim());
  }

  return await executeCodeburnQuery(queryArgs, options);
}

const productionUsageTools = [
  {
    name: "get_task_usage",
    description: "Read token usage and session breakdown for a specific task thread from local Codeburn analytics SQLite database. thread_id must be a confirmed runtime UUID (never 'current'). Local query only, no model call.",
    inputSchema: {
      type: "object",
      properties: {
        thread_id: {
          type: "string",
          description: "UUID of the task thread (required, 'current' is not accepted)"
        },
        include_children: {
          type: "boolean",
          description: "Include child session threads (default true)",
          default: true
        }
      },
      required: ["thread_id"],
      additionalProperties: false
    },
    annotations: {
      readOnlyHint: true
    }
  },
  {
    name: "get_usage_history",
    description: "Read historical token usage and aggregates from local Codeburn analytics SQLite database filtered by project, date range, or model. Local query only, no model call.",
    inputSchema: {
      type: "object",
      properties: {
        project: {
          type: "string",
          description: "Optional project label filter"
        },
        from: {
          type: "string",
          description: "Optional start date filter in YYYY-MM-DD format"
        },
        to: {
          type: "string",
          description: "Optional end date filter in YYYY-MM-DD format"
        },
        model: {
          type: "string",
          description: "Optional model identifier filter"
        }
      },
      additionalProperties: false
    },
    annotations: {
      readOnlyHint: true
    }
  }
];

function isProductionUsageTool(name) {
  return name === "get_task_usage" || name === "get_usage_history";
}

async function handleProductionUsageTool(name, args, options) {
  if (name === "get_task_usage") {
    return await getTaskUsage(args, options);
  }
  if (name === "get_usage_history") {
    return await getUsageHistory(args, options);
  }
  return toolResult({ ok: false, error: `Unknown production usage tool: ${name}` }, true);
}

module.exports = {
  productionUsageTools,
  isProductionUsageTool,
  handleProductionUsageTool,
  getTaskUsage,
  getUsageHistory,
  executeCodeburnQuery,
  getCodeburnRoot,
  getPythonExecutable,
  toolResult
};
