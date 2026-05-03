"use strict";

(function () {
  var cs = new CSInterface();
  var statusEl = document.getElementById("status");
  var badgeEl = document.getElementById("badge");
  var logEl = document.getElementById("log");
  var urlEl = document.getElementById("bridgeUrl");
  var tokenEl = document.getElementById("bridgeToken");
  var connectButton = document.getElementById("connectButton");
  var disconnectButton = document.getElementById("disconnectButton");

  var running = false;
  var pollTimer = null;

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
    var xhr = new XMLHttpRequest();
    xhr.open(method, getBaseUrl() + appendToken(path), true);
    if (body !== null && body !== undefined) {
      xhr.setRequestHeader("content-type", "text/plain;charset=utf-8");
    }
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status < 200 || xhr.status >= 300) {
        onDone(new Error("HTTP " + xhr.status + ": " + xhr.responseText));
        return;
      }
      try {
        onDone(null, xhr.responseText ? JSON.parse(xhr.responseText) : {});
      } catch (error) {
        onDone(error);
      }
    };
    xhr.onerror = function () {
      onDone(new Error("Network error"));
    };
    xhr.send(body !== null && body !== undefined ? JSON.stringify(body) : null);
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
    request("GET", "/bridge/next", null, function (error, response) {
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
    setStatus("Connecting...", false);
    log("Connecting to " + getBaseUrl());
    poll();
  }

  function disconnect() {
    running = false;
    if (pollTimer) clearTimeout(pollTimer);
    setStatus("Disconnected", false);
    log("Disconnected");
  }

  connectButton.addEventListener("click", connect);
  disconnectButton.addEventListener("click", disconnect);

  urlEl.value = localStorage.getItem("codexAeBridgeUrl") || urlEl.value;
  tokenEl.value = localStorage.getItem("codexAeBridgeToken") || "";
  setStatus("Disconnected", false);
})();
