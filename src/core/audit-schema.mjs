export const AUDIT_SCHEMA_VERSION = 1;

export const AUDIT_STATUSES = Object.freeze([
  "pending",
  "running",
  "paused",
  "complete",
  "failed",
  "cancelled"
]);

export const AUDIT_PHASES = Object.freeze([
  "followers",
  "following",
  "posts",
  "engagement",
  "scoring",
  "complete"
]);

function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `audit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isoNow() {
  return new Date().toISOString();
}

function cloneSerializable(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

export function createAuditRun({
  id = newId(),
  source = {},
  configuration = {},
  createdAt = isoNow()
} = {}) {
  const sourceType = source?.type ?? "browser";

  return {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    id: String(id),
    source: {
      type: String(sourceType),
      accountId: source?.accountId != null ? String(source.accountId) : null,
      accountUsername: source?.accountUsername != null ? String(source.accountUsername) : null,
      connectorVersion: source?.connectorVersion != null ? String(source.connectorVersion) : null
    },
    status: "pending",
    createdAt,
    updatedAt: createdAt,
    completedAt: null,
    configuration: cloneSerializable(configuration) ?? {},
    progress: {
      phase: "followers",
      completedItems: 0,
      totalItems: null,
      percent: 0,
      message: "Ready"
    },
    relationships: {
      followers: [],
      following: []
    },
    posts: [],
    observations: {
      likes: [],
      comments: []
    },
    coverage: null,
    metrics: null,
    classifications: [],
    diagnostics: {
      warnings: [],
      errors: [],
      requestCount: 0,
      retries: 0
    }
  };
}

export function validateAuditRun(run) {
  const errors = [];

  if (!run || typeof run !== "object") {
    return { valid: false, errors: ["Audit run must be an object."] };
  }

  if (run.schemaVersion !== AUDIT_SCHEMA_VERSION) {
    errors.push(`Unsupported schemaVersion: ${run.schemaVersion ?? "missing"}.`);
  }

  if (!run.id) errors.push("Audit run id is required.");
  if (!AUDIT_STATUSES.includes(run.status)) errors.push(`Invalid audit status: ${run.status}.`);
  if (!run.source || typeof run.source !== "object" || !run.source.type) errors.push("Audit source.type is required.");
  if (!run.progress || !AUDIT_PHASES.includes(run.progress.phase)) errors.push(`Invalid audit phase: ${run?.progress?.phase}.`);
  if (!Array.isArray(run?.relationships?.followers)) errors.push("relationships.followers must be an array.");
  if (!Array.isArray(run?.relationships?.following)) errors.push("relationships.following must be an array.");
  if (!Array.isArray(run.posts)) errors.push("posts must be an array.");
  if (!Array.isArray(run?.observations?.likes)) errors.push("observations.likes must be an array.");
  if (!Array.isArray(run?.observations?.comments)) errors.push("observations.comments must be an array.");
  if (!Array.isArray(run.classifications)) errors.push("classifications must be an array.");

  return { valid: errors.length === 0, errors };
}

export function patchAuditRun(run, patch = {}) {
  const next = {
    ...run,
    ...cloneSerializable(patch),
    updatedAt: isoNow()
  };

  const validation = validateAuditRun(next);
  if (!validation.valid) {
    throw new TypeError(`Invalid audit run patch: ${validation.errors.join(" ")}`);
  }

  return next;
}

export function updateAuditProgress(run, {
  phase = run?.progress?.phase ?? "followers",
  completedItems = run?.progress?.completedItems ?? 0,
  totalItems = run?.progress?.totalItems ?? null,
  percent = run?.progress?.percent ?? 0,
  message = run?.progress?.message ?? ""
} = {}) {
  if (!AUDIT_PHASES.includes(phase)) throw new TypeError(`Invalid audit phase: ${phase}`);

  return patchAuditRun(run, {
    status: phase === "complete" ? "complete" : "running",
    progress: {
      phase,
      completedItems: Math.max(0, Number(completedItems) || 0),
      totalItems: Number.isFinite(Number(totalItems)) ? Math.max(0, Number(totalItems)) : null,
      percent: Math.min(100, Math.max(0, Number(percent) || 0)),
      message: String(message ?? "")
    },
    completedAt: phase === "complete" ? isoNow() : run.completedAt
  });
}

export function addAuditWarning(run, message) {
  return patchAuditRun(run, {
    diagnostics: {
      ...run.diagnostics,
      warnings: [...(run.diagnostics?.warnings ?? []), String(message)]
    }
  });
}

export function addAuditError(run, message) {
  return patchAuditRun(run, {
    status: "failed",
    diagnostics: {
      ...run.diagnostics,
      errors: [...(run.diagnostics?.errors ?? []), String(message)]
    }
  });
}

export function serializeAuditRun(run) {
  const validation = validateAuditRun(run);
  if (!validation.valid) throw new TypeError(`Cannot serialize invalid audit run: ${validation.errors.join(" ")}`);
  return JSON.stringify(run);
}

export function deserializeAuditRun(serialized) {
  const run = typeof serialized === "string" ? JSON.parse(serialized) : cloneSerializable(serialized);
  const validation = validateAuditRun(run);
  if (!validation.valid) throw new TypeError(`Invalid serialized audit run: ${validation.errors.join(" ")}`);
  return run;
}
