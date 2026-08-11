import test from "node:test";
import assert from "node:assert/strict";
import { applyExtensionUiAdjustments, registerExtensionMessageBridge } from "../src/extension/content-entry.mjs";

test("mobile extension UI adjustments add safe-area and touch overrides once", () => {
  const styles = new Map();
  const shadow = {
    getElementById(id) { return styles.get(id) ?? null; },
    appendChild(node) { styles.set(node.id, node); }
  };
  const documentRef = {
    getElementById(id) { return id === "ig-engagement-auditor-v4" ? { shadowRoot: shadow } : null; },
    createElement(tag) { return { tagName: tag.toUpperCase(), id: "", textContent: "" }; }
  };

  assert.equal(applyExtensionUiAdjustments(documentRef), true);
  assert.equal(styles.size, 1);
  const style = [...styles.values()][0];
  assert.match(style.textContent, /safe-area-inset-top/);
  assert.match(style.textContent, /min-height:\s*44px/);
  assert.match(style.textContent, /pointer:\s*coarse/);

  assert.equal(applyExtensionUiAdjustments(documentRef), true);
  assert.equal(styles.size, 1);
});

test("extension message bridge registers only when a runtime listener exists", () => {
  let registered = null;
  const api = {
    runtime: {
      onMessage: {
        addListener(listener) { registered = listener; }
      }
    }
  };

  assert.equal(registerExtensionMessageBridge(api), true);
  assert.equal(typeof registered, "function");
  assert.equal(registerExtensionMessageBridge({}), false);
});
