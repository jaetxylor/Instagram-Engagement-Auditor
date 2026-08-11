import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = path.join(ROOT, "src/browser/entry.mjs");
const OUT_DIR = path.join(ROOT, "dist");
const OUT_FILE = path.join(OUT_DIR, "instagram-engagement-auditor-v4.js");
const IMPORT_RE = /import\s*\{([\s\S]*?)\}\s*from\s*["']([^"']+)["']\s*;?/g;

function moduleId(filename) {
  return path.relative(ROOT, filename).split(path.sep).join("/");
}

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith(".")) {
    throw new Error(`Browser bundle cannot include package import ${specifier} from ${moduleId(fromFile)}.`);
  }
  return path.resolve(path.dirname(fromFile), specifier);
}

function parseImportBindings(raw) {
  return raw.split(",").map(part => part.trim()).filter(Boolean).map(part => {
    const match = part.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
    if (!match) throw new Error(`Unsupported import binding: ${part}`);
    return match[2] ? `${match[1]}: ${match[2]}` : match[1];
  }).join(", ");
}

function transformExports(source, id) {
  const exports = new Map();

  source = source.replace(/export\s+async\s+function\s+([A-Za-z_$][\w$]*)/g, (_all, name) => {
    exports.set(name, name);
    return `async function ${name}`;
  });
  source = source.replace(/export\s+function\s+([A-Za-z_$][\w$]*)/g, (_all, name) => {
    exports.set(name, name);
    return `function ${name}`;
  });
  source = source.replace(/export\s+class\s+([A-Za-z_$][\w$]*)/g, (_all, name) => {
    exports.set(name, name);
    return `class ${name}`;
  });
  source = source.replace(/export\s+(const|let|var)\s+([A-Za-z_$][\w$]*)/g, (_all, kind, name) => {
    exports.set(name, name);
    return `${kind} ${name}`;
  });
  source = source.replace(/export\s*\{([\s\S]*?)\}\s*;?/g, (_all, raw) => {
    for (const part of raw.split(",").map(value => value.trim()).filter(Boolean)) {
      const match = part.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (!match) throw new Error(`Unsupported export binding in ${id}: ${part}`);
      exports.set(match[2] ?? match[1], match[1]);
    }
    return "";
  });

  if (/^\s*export\s/m.test(source)) {
    throw new Error(`Unsupported export syntax remains in ${id}.`);
  }

  if (exports.size) {
    source += `\nObject.assign(exports, { ${[...exports.entries()].map(([publicName, localName]) => publicName === localName ? localName : `${JSON.stringify(publicName)}: ${localName}`).join(", ")} });\n`;
  }
  return source;
}

async function buildGraph(filename, graph = new Map()) {
  const resolved = path.resolve(filename);
  if (graph.has(resolved)) return graph;

  const original = await readFile(resolved, "utf8");
  const dependencies = [];
  for (const match of original.matchAll(IMPORT_RE)) {
    dependencies.push(resolveImport(resolved, match[2]));
  }

  graph.set(resolved, { original, dependencies });
  for (const dependency of dependencies) await buildGraph(dependency, graph);
  return graph;
}

function transformModule(filename, original) {
  const id = moduleId(filename);
  let source = original.replace(IMPORT_RE, (_all, bindings, specifier) => {
    const dependency = resolveImport(filename, specifier);
    return `const { ${parseImportBindings(bindings)} } = __require(${JSON.stringify(moduleId(dependency))});`;
  });

  if (/^\s*import\s/m.test(source)) {
    throw new Error(`Unsupported import syntax remains in ${id}.`);
  }

  source = transformExports(source, id);
  return `__modules[${JSON.stringify(id)}] = (module, exports, __require) => {\n${source}\n};`;
}

async function main() {
  const graph = await buildGraph(ENTRY);
  const modules = [...graph.entries()]
    .sort(([a], [b]) => moduleId(a).localeCompare(moduleId(b)))
    .map(([filename, record]) => transformModule(filename, record.original))
    .join("\n\n");

  const entryId = moduleId(ENTRY);
  const bundle = `(() => {\n  "use strict";\n\n  /*\n   * Instagram Engagement Auditor V4\n   * Copyright 2026 @jaetxylor\n   * SPDX-License-Identifier: Apache-2.0\n   * Generated from modular source by scripts/build-browser.mjs.\n   * Read-only: no follow/unfollow/like/comment/DM mutations.\n   */\n\n  const __modules = Object.create(null);\n  const __cache = Object.create(null);\n  const __require = id => {\n    if (__cache[id]) return __cache[id].exports;\n    const factory = __modules[id];\n    if (!factory) throw new Error(\`Missing bundled module: \${id}\`);\n    const module = { exports: {} };\n    __cache[id] = module;\n    factory(module, module.exports, __require);\n    return module.exports;\n  };\n\n${modules}\n\n  __require(${JSON.stringify(entryId)});\n})();\n`;

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, bundle, "utf8");
  process.stdout.write(`Built ${path.relative(ROOT, OUT_FILE)} from ${graph.size} modules (${bundle.length} characters).\n`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
