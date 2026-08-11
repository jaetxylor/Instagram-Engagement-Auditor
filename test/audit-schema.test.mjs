import test from "node:test";
import assert from "node:assert/strict";
import {
  AUDIT_SCHEMA_VERSION,
  addAuditError,
  addAuditWarning,
  createAuditRun,
  deserializeAuditRun,
  serializeAuditRun,
  updateAuditProgress,
  validateAuditRun
} from "../src/core/audit-schema.mjs";

test("createAuditRun returns a valid serializable run", () => {
  const run = createAuditRun({
    id: "audit-1",
    source: { type: "browser", accountId: "123", accountUsername: "tester" },
    configuration: { likes: true, comments: true }
  });

  assert.equal(run.schemaVersion, AUDIT_SCHEMA_VERSION);
  assert.equal(run.status, "pending");
  assert.equal(run.source.accountId, "123");
  assert.equal(validateAuditRun(run).valid, true);

  const restored = deserializeAuditRun(serializeAuditRun(run));
  assert.deepEqual(restored, run);
});

test("progress updates preserve a resumable phase", () => {
  const run = createAuditRun({ id: "audit-2" });
  const updated = updateAuditProgress(run, {
    phase: "engagement",
    completedItems: 18,
    totalItems: 28,
    percent: 74,
    message: "18 / 28 posts complete"
  });

  assert.equal(updated.status, "running");
  assert.equal(updated.progress.phase, "engagement");
  assert.equal(updated.progress.completedItems, 18);
  assert.equal(updated.progress.totalItems, 28);
});

test("complete progress sets completion metadata", () => {
  const run = createAuditRun({ id: "audit-3" });
  const completed = updateAuditProgress(run, {
    phase: "complete",
    completedItems: 28,
    totalItems: 28,
    percent: 100,
    message: "Audit complete"
  });

  assert.equal(completed.status, "complete");
  assert.ok(completed.completedAt);
});

test("warnings and errors are stored in diagnostics", () => {
  let run = createAuditRun({ id: "audit-4" });
  run = addAuditWarning(run, "Partial comment coverage");
  run = addAuditError(run, "Collector stopped");

  assert.deepEqual(run.diagnostics.warnings, ["Partial comment coverage"]);
  assert.deepEqual(run.diagnostics.errors, ["Collector stopped"]);
  assert.equal(run.status, "failed");
});

test("validation rejects malformed audit data", () => {
  const result = validateAuditRun({ id: "broken", schemaVersion: 999 });
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 1);
});
