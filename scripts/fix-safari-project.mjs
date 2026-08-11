import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeSafariBundleIdentifiers } from "./lib/safari-project.mjs";

const [projectPathArgument, appBundleIdentifier = "com.jaetxylor.engagementauditor.dev"] = process.argv.slice(2);
if (!projectPathArgument) {
  console.error("Usage: node scripts/fix-safari-project.mjs <project.pbxproj> [app-bundle-identifier]");
  process.exit(2);
}

const projectPath = path.resolve(projectPathArgument);
const source = await readFile(projectPath, "utf8");
const result = normalizeSafariBundleIdentifiers(source, { appBundleIdentifier });
await writeFile(projectPath, result.source, "utf8");

process.stdout.write(
  `Normalized Safari Xcode identifiers: app=${result.appBundleIdentifier}, extension=${result.extensionBundleIdentifier}, app configs=${result.appReplacements}, extension configs=${result.extensionMatches}.\n`
);
