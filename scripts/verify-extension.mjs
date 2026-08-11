import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "dist/web-extension");
const manifest = JSON.parse(await readFile(path.join(DIR, "manifest.json"), "utf8"));
const content = await readFile(path.join(DIR, "content.js"), "utf8");
const popupHtml = await readFile(path.join(DIR, "popup.html"), "utf8");
const popupJs = await readFile(path.join(DIR, "popup.js"), "utf8");

const failures = [];

if (manifest.manifest_version !== 3) failures.push("WebExtension must use Manifest V3.");
if (manifest.action?.default_popup !== "popup.html") failures.push("Toolbar action must use popup.html.");
if (!Array.isArray(manifest.content_scripts) || manifest.content_scripts.length !== 1) failures.push("Expected one scoped content script registration.");
if (!manifest.content_scripts?.[0]?.js?.includes("content.js")) failures.push("content.js is not registered in the manifest.");

const allHosts = [
  ...(manifest.host_permissions ?? []),
  ...((manifest.content_scripts ?? []).flatMap(item => item.matches ?? []))
];
if (!allHosts.length) failures.push("Instagram host access is missing.");
for (const host of allHosts) {
  if (host === "<all_urls>" || host.includes("*://*/*")) failures.push(`Over-broad host permission is not allowed: ${host}`);
  if (!host.includes("instagram.com")) failures.push(`Unexpected non-Instagram host permission: ${host}`);
}

for (const permission of manifest.permissions ?? []) {
  if (!["activeTab"].includes(permission)) failures.push(`Unexpected extension permission: ${permission}`);
}

if (/^\s*import\s/m.test(content)) failures.push("Unbundled import remains in content.js.");
if (/^\s*export\s/m.test(content)) failures.push("Unbundled export remains in content.js.");
if (/\beval\s*\(|new\s+Function\s*\(/.test(content) || /\beval\s*\(|new\s+Function\s*\(/.test(popupJs)) failures.push("Extension package contains dynamic code execution.");
if (/davidarroyo/i.test(content + popupHtml + popupJs)) failures.push("Unexpected David Arroyo attribution/reference found.");

const remoteScript = /<script[^>]+src=["']https?:\/\//i;
if (remoteScript.test(popupHtml)) failures.push("Popup must not execute remotely hosted JavaScript.");

for (const pattern of [
  /\/api\/v1\/friendships\/[^/]+\/(?:create|destroy)\//i,
  /\/api\/v1\/media\/[^/]+\/(?:like|unlike)\//i,
  /\/api\/v1\/media\/[^/]+\/comments\/add\//i,
  /\/api\/v1\/direct_v2\/threads\/broadcast\//i
]) {
  if (pattern.test(content)) failures.push(`Read-only extension contains forbidden mutation endpoint pattern: ${pattern}`);
}

if (!content.includes("Instagram Engagement Auditor V4 WebExtension content script")) failures.push("Extension content-script banner is missing.");
if (!content.includes("Copyright 2026 @jaetxylor")) failures.push("Creator attribution is missing from content.js.");
if (!content.includes("SPDX-License-Identifier: Apache-2.0")) failures.push("SPDX identifier is missing from content.js.");
if (content.length < 40000) failures.push(`Extension content bundle is unexpectedly small (${content.length} characters).`);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Verified dist/web-extension: Manifest V3, Instagram-only host scope, packaged local code, read-only safety (${content.length} content-script characters).`);
}
