import { launchBrowserAuditor } from "../browser/app.mjs";

export const EXTENSION_MESSAGE_TYPES = Object.freeze({
  launch: "iga_v4_launch",
  close: "iga_v4_close",
  status: "iga_v4_status"
});

function activeHandle() {
  return globalThis.__IG_ENGAGEMENT_AUDITOR_V4__ ?? null;
}

function statusPayload() {
  const handle = activeHandle();
  return {
    ok: true,
    open: Boolean(handle),
    version: handle?.version ?? "4.0.0-alpha.1",
    hostname: globalThis.location?.hostname ?? null
  };
}

export function launchFromExtension() {
  try {
    const handle = launchBrowserAuditor();
    return {
      ok: true,
      open: true,
      version: handle.version
    };
  } catch (error) {
    return {
      ok: false,
      open: false,
      error: error?.message ?? String(error)
    };
  }
}

export function closeFromExtension() {
  try {
    activeHandle()?.destroy?.();
    return { ok: true, open: false };
  } catch (error) {
    return { ok: false, open: Boolean(activeHandle()), error: error?.message ?? String(error) };
  }
}

export function registerExtensionMessageBridge(api = globalThis.browser ?? globalThis.chrome ?? null) {
  const listener = api?.runtime?.onMessage;
  if (!listener?.addListener) return false;

  listener.addListener((message, _sender, sendResponse) => {
    const type = message?.type;
    if (!Object.values(EXTENSION_MESSAGE_TYPES).includes(type)) return undefined;

    const response = type === EXTENSION_MESSAGE_TYPES.launch
      ? launchFromExtension()
      : type === EXTENSION_MESSAGE_TYPES.close
        ? closeFromExtension()
        : statusPayload();

    try { sendResponse?.(response); } catch {}
    return false;
  });
  return true;
}

registerExtensionMessageBridge();

globalThis.__IGA_EXTENSION_BRIDGE__ = Object.freeze({
  version: "4.0.0-alpha.1",
  launch: launchFromExtension,
  close: closeFromExtension,
  status: statusPayload
});
