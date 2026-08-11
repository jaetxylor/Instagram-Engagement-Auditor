import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(ROOT, "dist/instagram-engagement-auditor-v4.js");
const source = await readFile(file, "utf8");

const failures = [];
if (!source.includes("Instagram Engagement Auditor V4")) failures.push("V4 bundle banner is missing.");
if (!source.includes("Copyright 2026 @jaetxylor")) failures.push("Creator attribution is missing.");
if (!source.includes("SPDX-License-Identifier: Apache-2.0")) failures.push("SPDX license identifier is missing.");
if (/^\s*import\s/m.test(source)) failures.push("Unbundled import statement remains.");
if (/^\s*export\s/m.test(source)) failures.push("Unbundled export statement remains.");
if (/davidarroyo/i.test(source)) failures.push("Unexpected David Arroyo attribution/reference found.");

const forbiddenPatterns = [
  ["friendship create", /\/api\/v1\/friendships\/[^`"']+\/create\//],
  ["friendship destroy", /\/api\/v1\/friendships\/[^`"']+\/destroy\//],
  ["media like", /\/api\/v1\/media\/[^`"']+\/like\//],
  ["media unlike", /\/api\/v1\/media\/[^`"']+\/unlike\//],
  ["comment creation", /\/api\/v1\/media\/[^`"']+\/comment\//],
  ["direct-message broadcast", /\/api\/v1\/direct_v2\/threads\/broadcast\//]
];
for (const [label, pattern] of forbiddenPatterns) {
  if (pattern.test(source)) failures.push(`Read-only bundle contains forbidden mutation route pattern: ${label}`);
}

if (source.length < 40000) failures.push(`Bundle is unexpectedly small (${source.length} characters).`);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Verified dist/instagram-engagement-auditor-v4.js (${source.length} characters).`);
}
