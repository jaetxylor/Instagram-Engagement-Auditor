import test from "node:test";
import assert from "node:assert/strict";
import { createBrowserAuditRuntime } from "../src/browser/runtime.mjs";
import { createAuditRun, updateAuditProgress } from "../src/core/audit-schema.mjs";
import { defineConnector } from "../src/connectors/contract.mjs";
import { enrichProfileCounts } from "../src/product/profile-enrichment.mjs";
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

function profileConnector() {
  return defineConnector({
    id: "profile-count-test",
    version: "1",
    sourceType: "browser",
    capabilities: ["account", "posts", "profile_counts"],
    methods: {
      async getAccountContext() {
        return { id: "acct", username: "owner" };
      },
      async listPosts() {
        return [];
      },
      async getProfileCounts({ id }) {
        if (String(id) === "remote") return { followers: 120, following: 240 };
        throw new Error(`Unexpected profile lookup: ${id}`);
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

test("completed ratio enrichment is immediately checkpointed into the active audit", async () => {
  const store = new MemoryCheckpointStore();
  const runtime = createBrowserAuditRuntime({
    connector: profileConnector(),
    checkpointStore: store
  });

  const run = await runtime.runAudit({ resume: false });
  assert.equal(run.status, "complete");
  assert.deepEqual(run.enrichments.profileCounts, []);

  const result = await enrichProfileCounts({
    connector: runtime.connector,
    accounts: [
      { id: "embedded", username: "embedded_user", followerCount: 90, followingCount: 45 },
      { id: "remote", username: "remote_user" }
    ]
  });

  assert.equal(result.summary.available, 2);
  assert.equal(result.summary.embedded, 1);

  const activeById = new Map(run.enrichments.profileCounts.map(record => [record.id, record]));
  assert.deepEqual(activeById.get("embedded"), {
    id: "embedded",
    username: "embedded_user",
    followers: 90,
    following: 45,
    fetchedAt: null,
    source: "relationship_payload"
  });
  assert.deepEqual(activeById.get("remote"), {
    id: "remote",
    username: "remote_user",
    followers: 120,
    following: 240,
    fetchedAt: null,
    source: "connector"
  });

  const checkpoint = await store.get(run.id);
  assert.deepEqual(checkpoint.enrichments.profileCounts, run.enrichments.profileCounts);
  assert.equal(checkpoint.enrichments.profileCounts.length, 2);
});
