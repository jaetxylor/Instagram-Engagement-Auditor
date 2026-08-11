import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const IMPORT_RE = /import\s*\{([\s\S]*?)\}\s*from\s*["']([^"']+)["']\s*;?/g;

export async function bundleEntry({ root, entry, outFile, bannerLines = [] } = {}) {
  if (!root || !entry || !outFile) throw new TypeError("root, entry and outFile are required.");
  const resolvedRoot = path.resolve(root);
  const resolvedEntry = path.resolve(entry);
  const resolvedOut = path.resolve(outFile);

  function moduleId(filename) {
    return path.relative(resolvedRoot, filename).split(path.sep).join("/");
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
    for (const match of original.matchAll(IMPORT_RE)) dependencies.push(resolveImport(resolved, match[2]));

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

    if (/^\s*import\s/m.test(source)) throw new Error(`Unsupported import syntax remains in ${id}.`);
    source = transformExports(source, id);
    return `__modules[${JSON.stringify(id)}] = (module, exports, __require) => {\n${source}\n};`;
  }

  const graph = await buildGraph(resolvedEntry);
  const modules = [...graph.entries()]
    .sort(([a], [b]) => moduleId(a).localeCompare(moduleId(b)))
    .map(([filename, record]) => transformModule(filename, record.original))
    .join("\n\n");

  const banner = bannerLines.length
    ? `  /*\n${bannerLines.map(line => `   * ${line}`).join("\n")}\n   */\n\n`
    : "";
  const entryId = moduleId(resolvedEntry);
  const source = `(() => {\n  "use strict";\n\n${banner}  const __modules = Object.create(null);\n  const __cache = Object.create(null);\n  const __require = id => {\n    if (__cache[id]) return __cache[id].exports;\n    const factory = __modules[id];\n    if (!factory) throw new Error(\`Missing bundled module: \${id}\`);\n    const module = { exports: {} };\n    __cache[id] = module;\n    factory(module, module.exports, __require);\n    return module.exports;\n  };\n\n${modules}\n\n  __require(${JSON.stringify(entryId)});\n})();\n`;

  await mkdir(path.dirname(resolvedOut), { recursive: true });
  await writeFile(resolvedOut, source, "utf8");
  return {
    outFile: resolvedOut,
    moduleCount: graph.size,
    characterCount: source.length
  };
}
