import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(ROOT, "apps/web-extension/manifest.json"), "utf8"));
const popupHtml = await readFile(path.join(ROOT, "apps/web-extension/popup.html"), "utf8");
const popupJs = await readFile(path.join(ROOT, "apps/web-extension/popup.js"), "utf8");

test("web extension is Manifest V3 and scoped only to Instagram", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ["activeTab"]);
  assert.equal(manifest.action.default_popup, "popup.html");

  const hosts = [
    ...manifest.host_permissions,
    ...manifest.content_scripts.flatMap(item => item.matches ?? [])
  ];
  assert.ok(hosts.length > 0);
  assert.equal(hosts.some(host => host === "<all_urls>" || host.includes("*://*/*")), false);
  assert.equal(hosts.every(host => host.includes("instagram.com")), true);
});

test("extension content script is dormant until the user invokes the toolbar action", () => {
  const registration = manifest.content_scripts[0];
  assert.deepEqual(registration.js, ["content.js"]);
  assert.equal(registration.run_at, "document_idle");
  assert.equal(registration.all_frames, false);
});

test("popup executes only packaged JavaScript and contains mobile onboarding copy", () => {
  assert.equal(/<script[^>]+src=["']https?:\/\//i.test(popupHtml), false);
  assert.match(popupHtml, /Run Engagement Audit/);
  assert.match(popupHtml, /Privacy & safety/);
  assert.match(popupJs, /iga_v4_launch/);
  assert.equal(/\beval\s*\(|new\s+Function\s*\(/.test(popupJs), false);
});
