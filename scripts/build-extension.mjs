import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundleEntry } from "./lib/bundle.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIR = path.join(ROOT, "apps/web-extension");
const OUT_DIR = path.join(ROOT, "dist/web-extension");
const ENTRY = path.join(ROOT, "src/extension/content-entry.mjs");
const CONTENT_OUT = path.join(OUT_DIR, "content.js");

try {
  await mkdir(OUT_DIR, { recursive: true });

  for (const filename of ["manifest.json", "popup.html", "popup.css", "popup.js"]) {
    await copyFile(path.join(SOURCE_DIR, filename), path.join(OUT_DIR, filename));
  }

  const manifestPath = path.join(OUT_DIR, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.version = "4.0.0";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const result = await bundleEntry({
    root: ROOT,
    entry: ENTRY,
    outFile: CONTENT_OUT,
    bannerLines: [
      "Instagram Engagement Auditor V4 WebExtension content script",
      "Copyright 2026 @jaetxylor",
      "SPDX-License-Identifier: Apache-2.0",
      "Packaged locally for Safari, Chrome and Edge.",
      "Read-only: no follow/unfollow/like/comment/DM mutations."
    ]
  });

  process.stdout.write(`Built ${path.relative(ROOT, OUT_DIR)} with ${result.moduleCount} bundled modules (${result.characterCount} content-script characters).\n`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
