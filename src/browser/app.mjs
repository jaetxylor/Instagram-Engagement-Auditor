import { createBrowserAuditRuntime } from "./runtime.mjs";
import { createBrowserAuditorAppV4 } from "../ui/browser-app-v4.mjs";

export function launchBrowserAuditor({
  runtime = null,
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  mountTarget = globalThis.document?.documentElement,
  runtimeOptions = {}
} = {}) {
  if (!documentRef || !windowRef || !mountTarget) {
    throw new Error("Instagram Engagement Auditor V4 requires a browser document.");
  }

  if (!/(^|\.)instagram\.com$/i.test(windowRef.location?.hostname ?? "")) {
    throw new Error("Open instagram.com while logged in before launching the auditor.");
  }

  try {
    windowRef.__IG_ENGAGEMENT_AUDITOR_V4__?.destroy?.();
  } catch {}

  const resolvedRuntime = runtime ?? createBrowserAuditRuntime({
    documentRef,
    indexedDB: windowRef.indexedDB,
    ...runtimeOptions
  });

  const app = createBrowserAuditorAppV4({
    runtime: resolvedRuntime,
    documentRef,
    windowRef,
    mountTarget
  });

  app.mount();

  const handle = Object.freeze({
    version: "4.0.0-alpha.1",
    runtime: resolvedRuntime,
    app,
    destroy() {
      app.destroy();
      try { delete windowRef.__IG_ENGAGEMENT_AUDITOR_V4__; } catch {}
    }
  });

  windowRef.__IG_ENGAGEMENT_AUDITOR_V4__ = handle;
  return handle;
}
