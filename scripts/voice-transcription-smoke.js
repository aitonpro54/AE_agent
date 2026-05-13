"use strict";

const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const daemonPath = path.join(__dirname, "..", "mcp-server", "bridge-daemon.js");
const nodePath = process.execPath;
const bridgePort = String(4500 + Math.floor(Math.random() * 1000));
const bridgeToken = "voice-transcription-smoke-token";

function requestJson(options, payload) {
  return new Promise((resolve, reject) => {
    const body = payload ? JSON.stringify(payload) : "";
    const req = http.request({
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(body ? {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body)
        } : {})
      }
    }, (res) => {
      let responseBody = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        responseBody += chunk;
      });
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: responseBody ? JSON.parse(responseBody) : {} });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => {
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
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

async function main() {
  let captured = null;
  const provider = http.createServer(async (req, res) => {
    try {
      if (req.method === "POST" && req.url === "/audio/transcriptions") {
        const body = await readRawBody(req);
        const text = body.toString("latin1");
        captured = {
          authorization: req.headers.authorization || "",
          contentType: req.headers["content-type"] || "",
          length: body.length,
          hasModel: text.indexOf("gpt-4o-mini-transcribe") >= 0,
          hasFile: text.indexOf('name="file"; filename="voice.webm"') >= 0
        };
        writeJson(res, 200, { text: "voice transcription smoke" });
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
      OPENAI_API_KEY: "sk-voice-transcription-smoke-key",
      OPENAI_BASE_URL: `http://127.0.0.1:${providerPort}`
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForBridge();
    const response = await requestJson({
      hostname: "127.0.0.1",
      port: bridgePort,
      path: "/voice/transcribe",
      method: "POST",
      headers: {
        "x-ae-bridge-token": bridgeToken
      }
    }, {
      audioBase64: Buffer.from("fake webm audio").toString("base64"),
      mimeType: "audio/webm",
      language: "ru"
    });

    if (response.status !== 200 || !response.body || !response.body.ok) {
      throw new Error(`Voice transcription request failed: ${response.body && response.body.error ? response.body.error : response.status}`);
    }
    if (!captured || captured.authorization.indexOf("Bearer sk-voice-transcription-smoke-key") !== 0) {
      throw new Error("Fake OpenAI provider did not receive the expected authorization header.");
    }
    if (!captured.hasModel || !captured.hasFile) {
      throw new Error("Multipart transcription request did not include expected model and audio file fields.");
    }
    if (response.body.transcription.text !== "voice transcription smoke") {
      throw new Error("Voice transcription text was not returned to the panel contract.");
    }

    console.log(JSON.stringify({
      ok: true,
      transcription: response.body.transcription,
      captured
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
