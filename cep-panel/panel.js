"use strict";

(function () {
  var APP_NAME = "Codex AE MCP Bridge";
  var APP_VERSION = "0.17.0";

  var cs = new CSInterface();
  var titleEl = document.getElementById("appTitle");
  var versionEl = document.getElementById("appVersion");
  var statusEl = document.getElementById("status");
  var badgeEl = document.getElementById("badge");
  var logEl = document.getElementById("log");
  var urlEl = document.getElementById("bridgeUrl");
  var tokenEl = document.getElementById("bridgeToken");
  var connectButton = document.getElementById("connectButton");
  var disconnectButton = document.getElementById("disconnectButton");
  var reloadButton = document.getElementById("reloadButton");

  var running = false;
  var pollTimer = null;
  var pollInFlight = false;

  function setAppTitle(version) {
    var normalizedVersion = version || APP_VERSION;
    var title = APP_NAME + " v" + normalizedVersion.replace(/^v/i, "");
    document.title = title;
    titleEl.textContent = APP_NAME;
    versionEl.textContent = "v" + normalizedVersion.replace(/^v/i, "");
  }

  function log(message) {
    var at = new Date().toLocaleTimeString();
    logEl.textContent = "[" + at + "] " + message + "\n" + logEl.textContent;
  }

  function setStatus(text, online) {
    statusEl.textContent = text;
    badgeEl.textContent = online ? "online" : "offline";
    badgeEl.className = online ? "online" : "";
  }

  function getBaseUrl() {
    return urlEl.value.replace(/\/+$/, "");
  }

  function getToken() {
    return tokenEl.value;
  }

  function appendToken(path) {
    var separator = path.indexOf("?") === -1 ? "?" : "&";
    return path + separator + "token=" + encodeURIComponent(getToken());
  }

  function request(method, path, body, onDone) {
    var completed = false;
    var xhr = new XMLHttpRequest();
    xhr.open(method, getBaseUrl() + appendToken(path), true);
    xhr.timeout = 10000;
    if (body !== null && body !== undefined) {
      xhr.setRequestHeader("content-type", "text/plain;charset=utf-8");
    }
    function finish(error, response) {
      if (completed) return;
      completed = true;
      onDone(error, response);
    }
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status < 200 || xhr.status >= 300) {
        finish(new Error("HTTP " + xhr.status + ": " + xhr.responseText));
        return;
      }
      try {
        finish(null, xhr.responseText ? JSON.parse(xhr.responseText) : {});
      } catch (error) {
        finish(error);
      }
    };
    xhr.onerror = function () {
      finish(new Error("Network error"));
    };
    xhr.ontimeout = function () {
      finish(new Error("Network timeout"));
    };
    xhr.send(body !== null && body !== undefined ? JSON.stringify(body) : null);
  }

  function refreshAppTitle() {
    request("GET", "/health", null, function (error, response) {
      if (error || !response || !response.version) return;
      setAppTitle(response.version);
    });
  }

  function postResult(id, ok, result, error) {
    request("POST", "/bridge/result", {
      id: id,
      ok: ok,
      result: result,
      error: error
    }, function (postError) {
      if (postError) {
        log("Could not post result: " + postError.message);
      }
    });
  }

  function executeCommand(command) {
    log("Executing command " + command.id);
    cs.evalScript(command.script, function (result) {
      if (typeof result === "string" && result.indexOf("EvalScript error.") === 0) {
        postResult(command.id, false, null, result);
        return;
      }
      postResult(command.id, true, result, null);
    });
  }

  function poll() {
    if (!running) return;
    if (pollInFlight) return;
    pollInFlight = true;
    request("GET", "/bridge/next", null, function (error, response) {
      pollInFlight = false;
      if (!running) return;

      if (error) {
        setStatus("Waiting for server...", false);
        log(error.message);
        pollTimer = setTimeout(poll, 1500);
        return;
      }

      setStatus("Connected", true);

      if (response && response.command) {
        executeCommand(response.command);
      }

      pollTimer = setTimeout(poll, 50);
    });
  }

  function connect() {
    running = true;
    localStorage.setItem("codexAeBridgeUrl", urlEl.value);
    localStorage.setItem("codexAeBridgeToken", tokenEl.value);
    localStorage.setItem("codexAeBridgeAutoConnect", "1");
    setStatus("Connecting...", false);
    refreshAppTitle();
    log("Connecting to " + getBaseUrl());
    poll();
  }

  function disconnect() {
    running = false;
    pollInFlight = false;
    if (pollTimer) clearTimeout(pollTimer);
    localStorage.setItem("codexAeBridgeAutoConnect", "0");
    setStatus("Disconnected", false);
    log("Disconnected");
  }

  function reloadApp() {
    running = false;
    pollInFlight = false;
    if (pollTimer) clearTimeout(pollTimer);
    log("Reloading app");
    window.location.reload();
  }

  connectButton.addEventListener("click", connect);
  disconnectButton.addEventListener("click", disconnect);
  reloadButton.addEventListener("click", reloadApp);

  setAppTitle(APP_VERSION);
  urlEl.value = localStorage.getItem("codexAeBridgeUrl") || urlEl.value;
  tokenEl.value = localStorage.getItem("codexAeBridgeToken") || "";
  setStatus("Disconnected", false);
  if (tokenEl.value && localStorage.getItem("codexAeBridgeAutoConnect") !== "0") {
    setTimeout(connect, 250);
  }
})();
