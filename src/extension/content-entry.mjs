import { launchBrowserAuditor } from "../browser/app.mjs";

export const EXTENSION_MESSAGE_TYPES = Object.freeze({
  launch: "iga_v4_launch",
  close: "iga_v4_close",
  status: "iga_v4_status"
});

const MOBILE_STYLE_ID = "iga-v4-extension-mobile-overrides";

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

export function applyExtensionUiAdjustments(documentRef = globalThis.document) {
  const host = documentRef?.getElementById?.("ig-engagement-auditor-v4");
  const shadow = host?.shadowRoot;
  if (!shadow || shadow.getElementById(MOBILE_STYLE_ID)) return Boolean(shadow);

  const style = documentRef.createElement("style");
  style.id = MOBILE_STYLE_ID;
  style.textContent = `
    @media (max-width: 760px) {
      .app {
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
      }
      .shell {
        padding-top: calc(9px + env(safe-area-inset-top));
        padding-bottom: calc(56px + env(safe-area-inset-bottom));
      }
      .topbar {
        padding-top: calc(9px + env(safe-area-inset-top));
        padding-left: calc(9px + env(safe-area-inset-left));
        padding-right: calc(9px + env(safe-area-inset-right));
      }
      button,
      .btn,
      .pill {
        min-height: 44px;
        touch-action: manipulation;
      }
      .search,
      .select,
      .field input,
      .field select {
        min-height: 44px;
        font-size: 16px;
      }
      .account-main {
        min-height: 58px;
      }
      .quick-actions .btn {
        flex: 1 1 46%;
      }
      .toast {
        right: max(10px, env(safe-area-inset-right));
        bottom: max(10px, env(safe-area-inset-bottom));
        left: max(10px, env(safe-area-inset-left));
        max-width: none;
      }
    }
    @media (pointer: coarse) {
      .btn,
      .pill,
      summary,
      .expand {
        -webkit-tap-highlight-color: transparent;
      }
      .expand {
        min-width: 44px;
        min-height: 44px;
      }
    }
  `;
  shadow.appendChild(style);
  return true;
}

export function launchFromExtension() {
  try {
    const handle = launchBrowserAuditor();
    applyExtensionUiAdjustments();
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
  status: statusPayload,
  applyUiAdjustments: applyExtensionUiAdjustments
});
