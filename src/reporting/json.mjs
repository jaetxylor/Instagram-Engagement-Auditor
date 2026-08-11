function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function buildAuditExport(run, {
  exportedAt = new Date().toISOString(),
  tool = "Instagram Engagement Auditor",
  version = "4.0.0-alpha.1",
  creator = "@jaetxylor"
} = {}) {
  if (!run || typeof run !== "object") throw new TypeError("An audit run is required for export.");

  return {
    exportSchemaVersion: 1,
    meta: {
      tool,
      version,
      creator,
      exportedAt
    },
    audit: clone(run)
  };
}

export function serializeAuditJson(run, options = {}) {
  return JSON.stringify(buildAuditExport(run, options), null, 2);
}
