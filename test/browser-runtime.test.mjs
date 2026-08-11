import test from "node:test";
import assert from "node:assert/strict";
import { createBrowserAuditRuntime } from "../src/browser/runtime.mjs";
import { createAuditRun, updateAuditProgress } from "../src/core/audit-schema.mjs";
import { defineConnector } from "../src/connectors/contract.mjs";
import { MemoryCheckpointStore } from "../src/storage/checkpoint-store.mjs";

function accountConnector() {
  return defineConnector({
    id: "account-only-test",
    version: "1",
    sourceType: "browser",
    capabilities: ["account"],
    methods: {
      async getAccountContext() {
        return { id: "acct", username: "owner" };
      }
    }
  });
}

test("browser runtime finds the latest resumable audit for the active account", async () => {
  const store = new MemoryCheckpointStore();
  const older = updateAuditProgress(createAuditRun({
    id: "older",
    source: { type: "browser", accountId: "acct" },
    createdAt: "2026-08-11T00:00:00.000Z"
  }), {
    phase: "engagement",
    completedItems: 2,
    completedItemIds: ["p1", "p2"],
    totalItems: 10,
    percent: 47
  });
  older.updatedAt = "2026-08-11T00:01:00.000Z";

  const newer = updateAuditProgress(createAuditRun({
    id: "newer",
    source: { type: "browser", accountId: "acct" },
    createdAt: "2026-08-11T00:02:00.000Z"
  }), {
    phase: "engagement",
    completedItems: 7,
    completedItemIds: ["p1", "p2", "p3", "p4", "p5", "p6", "p7"],
    totalItems: 10,
    percent: 77
  });
  newer.updatedAt = "2026-08-11T00:03:00.000Z";

  await store.save(older);
  await store.save(newer);

  const runtime = createBrowserAuditRuntime({
    connector: accountConnector(),
    checkpointStore: store
  });

  const found = await runtime.findResumableAudit();
  assert.equal(found.id, "newer");
  assert.equal(found.progress.completedItems, 7);
});

test("browser runtime can discard a saved run without clearing all history", async () => {
  const store = new MemoryCheckpointStore();
  await store.save(createAuditRun({ id: "a", source: { type: "browser", accountId: "acct" } }));
  await store.save(createAuditRun({ id: "b", source: { type: "browser", accountId: "acct" } }));

  const runtime = createBrowserAuditRuntime({
    connector: accountConnector(),
    checkpointStore: store
  });

  assert.equal(await runtime.discardAudit("a"), true);
  assert.equal(await store.get("a"), null);
  assert.ok(await store.get("b"));

  await runtime.clearLocalHistory();
  assert.equal((await store.list()).length, 0);
});
