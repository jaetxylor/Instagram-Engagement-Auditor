import test from "node:test";
import assert from "node:assert/strict";
import { createAuditRun, updateAuditProgress } from "../src/core/audit-schema.mjs";
import { MemoryCheckpointStore } from "../src/storage/checkpoint-store.mjs";

test("memory checkpoint store saves and restores audit runs", async () => {
  const store = new MemoryCheckpointStore();
  const run = updateAuditProgress(createAuditRun({
    id: "run-1",
    source: { type: "browser", accountId: "123" }
  }), {
    phase: "engagement",
    completedItems: 4,
    totalItems: 10,
    percent: 40,
    message: "4 / 10 posts complete"
  });

  await store.save(run);
  const restored = await store.get("run-1");

  assert.deepEqual(restored, run);
  assert.notEqual(restored, run);
});

test("getLatest can filter by account and status", async () => {
  const store = new MemoryCheckpointStore();

  const first = createAuditRun({
    id: "first",
    source: { type: "browser", accountId: "123" },
    createdAt: "2026-08-11T00:00:00.000Z"
  });
  first.updatedAt = "2026-08-11T00:01:00.000Z";

  const second = updateAuditProgress(createAuditRun({
    id: "second",
    source: { type: "browser", accountId: "123" },
    createdAt: "2026-08-11T00:02:00.000Z"
  }), {
    phase: "engagement",
    completedItems: 8,
    totalItems: 20,
    percent: 40
  });
  second.updatedAt = "2026-08-11T00:03:00.000Z";

  await store.save(first);
  await store.save(second);

  const latest = await store.getLatest({
    accountId: "123",
    sourceType: "browser",
    statuses: ["running", "paused"]
  });

  assert.equal(latest.id, "second");
});

test("delete and clear remove checkpoints", async () => {
  const store = new MemoryCheckpointStore();
  await store.save(createAuditRun({ id: "a" }));
  await store.save(createAuditRun({ id: "b" }));

  assert.equal((await store.list()).length, 2);
  assert.equal(await store.delete("a"), true);
  assert.equal((await store.list()).length, 1);

  await store.clear();
  assert.equal((await store.list()).length, 0);
});
