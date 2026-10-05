"use strict";

const DEFAULT_EXTENSION_ID = process.env.CEP_PANEL_EXTENSION_ID || "com.codex.aemcpbridge";
const DEFAULT_CDP_PORT = Number(process.env.CEP_PANEL_CDP_PORT || 8870);

/**
 * Validates whether a given URL is a file:// URL belonging strictly to the expected CEP extension.
 * Ensures exact path boundary matching:
 * - Protocol must be file:
 * - Extension directory immediately after the first CEP/extensions namespace must exactly match extensionId
 * - Ignores queries and fragments (e.g. ?param=extensionId or #extensionId)
 * - Rejects non-file protocols (e.g. http://, ws://)
 *
 * @param {string} rawUrl
 * @param {string} [extensionId]
 * @returns {boolean}
 */
function isCepExtensionUrl(rawUrl, extensionId = DEFAULT_EXTENSION_ID) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return false;
  if (!extensionId || typeof extensionId !== "string") return false;

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (_e) {
    return false;
  }

  if (parsed.protocol !== "file:") return false;

  let pathname;
  try {
    pathname = decodeURIComponent(parsed.pathname).replace(/\\/g, "/");
  } catch (_e) {
    return false;
  }
  const segments = pathname.split("/").filter(Boolean);
  let extensionRootIndex = -1;
  for (let index = 0; index < segments.length - 1; index++) {
    if (segments[index].toLowerCase() === "cep" && segments[index + 1].toLowerCase() === "extensions") {
      extensionRootIndex = index + 2;
      break;
    }
  }

  return extensionRootIndex < segments.length && segments[extensionRootIndex] === extensionId;
}

/**
 * Validates whether a webSocketDebuggerUrl string is usable for CDP connection.
 *
 * @param {string} wsUrl
 * @returns {boolean}
 */
function isUsableWebSocketUrl(wsUrl) {
  if (typeof wsUrl !== "string" || !wsUrl.trim()) return false;
  try {
    const parsed = new URL(wsUrl);
    return (parsed.protocol === "ws:" || parsed.protocol === "wss:")
      && Boolean(parsed.host)
      && !wsUrl.includes("#")
      && !parsed.username
      && !parsed.password;
  } catch (_e) {
    return false;
  }
}

/**
 * Pure selector for resolving exactly one AE Agent CEP panel page from a DevTools targets list.
 * Fails closed before any WebSocket construction or CDP command invocation when:
 * - Targets list is missing or empty
 * - No targets match the expected extension file URL
 * - Multiple targets match (ambiguous)
 * - Target is matched but webSocketDebuggerUrl is missing or malformed
 *
 * @param {Array<object>} pages - List of targets from /json/list
 * @param {object} [options]
 * @param {string} [options.extensionId] - Expected CEP extension ID
 * @param {number} [options.port] - CDP port for diagnostic messages
 * @returns {object} The single validated target page object
 */
function selectCepPanelTarget(pages, options = {}) {
  const extensionId = options.extensionId || DEFAULT_EXTENSION_ID;
  const port = options.port !== undefined ? Number(options.port) : DEFAULT_CDP_PORT;

  if (!Array.isArray(pages) || pages.length === 0) {
    throw new Error(
      `No DevTools pages found on port ${port}. Expected AE Agent extension page (${extensionId}).`
    );
  }

  const matches = pages.filter((page) => page && typeof page === "object" && page.type === "page" && isCepExtensionUrl(page.url, extensionId));

  if (matches.length === 0) {
    const summaries = pages.map((p) => {
      const type = p && p.type ? `[${p.type}] ` : "";
      const title = p && p.title ? `"${p.title}" ` : "";
      const url = p && p.url ? p.url : "(no url)";
      return `${type}${title}${url}`.trim();
    });
    throw new Error(
      `AE Agent extension page (${extensionId}) not found on port ${port}. Found ${pages.length} non-matching page(s): ${summaries.join("; ")}.`
    );
  }

  if (matches.length > 1) {
    const summaries = matches.map((p) => {
      const title = p && p.title ? `"${p.title}" ` : "";
      const url = p && p.url ? p.url : "(no url)";
      const ws = p && p.webSocketDebuggerUrl ? ` (${p.webSocketDebuggerUrl})` : " (no ws)";
      return `${title}${url}${ws}`.trim();
    });
    throw new Error(
      `Multiple matching AE Agent extension pages (${matches.length}) found for ${extensionId} on port ${port}; target is ambiguous: ${summaries.join("; ")}.`
    );
  }

  const target = matches[0];
  if (!isUsableWebSocketUrl(target.webSocketDebuggerUrl)) {
    throw new Error(
      `AE Agent extension page was matched for ${extensionId} on port ${port}, but webSocketDebuggerUrl is missing or invalid: ${JSON.stringify(target.webSocketDebuggerUrl)}.`
    );
  }

  return target;
}

module.exports = {
  DEFAULT_EXTENSION_ID,
  DEFAULT_CDP_PORT,
  isCepExtensionUrl,
  isUsableWebSocketUrl,
  selectCepPanelTarget
};
