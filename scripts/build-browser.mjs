import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundleEntry } from "./lib/bundle.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = path.join(ROOT, "src/browser/entry.mjs");
const OUT_FILE = path.join(ROOT, "dist/instagram-engagement-auditor-v4.js");

try {
  const result = await bundleEntry({
    root: ROOT,
    entry: ENTRY,
    outFile: OUT_FILE,
    bannerLines: [
      "Instagram Engagement Auditor V4",
      "Copyright 2026 @jaetxylor",
      "SPDX-License-Identifier: Apache-2.0",
      "Generated from modular source by scripts/build-browser.mjs.",
      "Read-only: no follow/unfollow/like/comment/DM mutations."
    ]
  });
  process.stdout.write(`Built ${path.relative(ROOT, result.outFile)} from ${result.moduleCount} modules (${result.characterCount} characters).\n`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
