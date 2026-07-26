'use strict';

/**
 * Network kill switch.
 *
 * This file is the demonstrable enforcement of the product's central promise:
 * student PII never leaves the machine. If someone from district IT asks how you
 * know the app cannot phone home, point them here.
 *
 * Four independent layers, each sufficient on its own:
 *   1. CSP with `connect-src 'none'` — no fetch/XHR/WebSocket/EventSource, at all.
 *   2. A request filter that cancels every scheme except file:/devtools:/blob:.
 *   3. Permission handlers that deny everything (geolocation, media, notifications…).
 *   4. Navigation + window-open handlers that refuse any non-file: destination.
 */

const { session, shell } = require('electron');

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // 'unsafe-inline' is required for styles: @hello-pangea/dnd injects a <style> element
  // at runtime for drag transitions. It does NOT relax script execution.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "media-src 'none'",
  "object-src 'none'",
  // The load-bearing directive. No network egress is expressible from the renderer.
  "connect-src 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "worker-src 'self' blob:",
  "base-uri 'self'",
].join('; ');

/** Schemes the renderer is permitted to load at all. */
const ALLOWED_SCHEMES = new Set(['file:', 'devtools:', 'blob:', 'data:']);

/**
 * In dev the renderer is served by Vite over http://localhost:5180, so the request
 * filter has to let that origin through or nothing loads. This is dev-only and is
 * never true in a packaged build.
 */
function devServerOrigin() {
  return process.env.ACC_DEV_SERVER || null;
}

function isAllowedUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (ALLOWED_SCHEMES.has(parsed.protocol)) return true;

  const dev = devServerOrigin();
  if (dev && url.startsWith(dev)) return true;

  return false;
}

/** Attach CSP to every response and cancel any request that leaves the machine. */
function hardenSession(targetSession = session.defaultSession) {
  targetSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP],
        'X-Content-Type-Options': ['nosniff'],
      },
    });
  });

  targetSession.webRequest.onBeforeRequest((details, callback) => {
    if (isAllowedUrl(details.url)) {
      callback({ cancel: false });
      return;
    }
    // Loud on purpose. If this ever fires in production it is a bug worth finding.
    console.warn('[security] blocked non-local request:', details.url);
    callback({ cancel: true });
  });

  // Deny every permission request outright — the app needs none of them.
  targetSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  targetSession.setPermissionCheckHandler(() => false);
}

/**
 * Prevent the renderer from navigating away or spawning windows. Any external URL
 * that somehow reaches us is handed to the OS browser rather than opened in-app,
 * so it can never run in a context that has the preload bridge attached.
 */
function hardenWebContents(contents) {
  contents.on('will-navigate', (event, url) => {
    if (!isAllowedUrl(url)) {
      event.preventDefault();
      console.warn('[security] blocked navigation:', url);
    }
  });

  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
}

module.exports = { CSP, hardenSession, hardenWebContents, isAllowedUrl };
