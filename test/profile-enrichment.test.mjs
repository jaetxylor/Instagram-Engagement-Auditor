import test from "node:test";
import assert from "node:assert/strict";
import { applyProfileEnrichmentToRun, enrichProfileCounts } from "../src/product/profile-enrichment.mjs";
import { buildAccountRows } from "../src/product/view-model.mjs";
import { createAuditRun } from "../src/core/audit-schema.mjs";
import { MemoryProfileCountCache } from "../src/storage/profile-count-cache.mjs";

test("profile enrichment reuses embedded counts and only fetches missing profiles", async () => {
  const calls = [];
  const connector = {
    id: "fixture",
    supports(capability) { return capability === "profile_counts"; },
    async getProfileCounts({ id }) {
      calls.push(id);
      return { followers: 100, following: 250 };
    }
  };

  const result = await enrichProfileCounts({
    connector,
    cache: new MemoryProfileCountCache(),
    accounts: [
      { id: "a", username: "embedded", followerCount: 300, followingCount: 100 },
      { id: "b", username: "fetchme" }
    ]
  });

  assert.deepEqual(calls, ["b"]);
  assert.equal(result.summary.total, 2);
  assert.equal(result.summary.embedded, 1);
  assert.equal(result.summary.available, 2);
  assert.equal(result.summary.moreFollowingThanFollowers, 1);
  assert.equal(result.results[0].followRatio.moreFollowingThanFollowers, false);
  assert.equal(result.results[1].followRatio.followingToFollowers, 2.5);
});

test("profile enrichment uses cache before connector", async () => {
  const cache = new MemoryProfileCountCache();
  await cache.set("a", { followers: 50, following: 75, fetchedAt: new Date().toISOString() });
  let calls = 0;
  const connector = {
    id: "fixture",
    supports() { return true; },
    async getProfileCounts() { calls += 1; return { followers: 1, following: 1 }; }
  };

  const result = await enrichProfileCounts({ connector, cache, accounts: [{ id: "a", username: "cached" }] });
  assert.equal(calls, 0);
  assert.equal(result.summary.cached, 1);
  assert.equal(result.results[0].followRatio.followingToFollowers, 1.5);
});

test("profile enrichment continues after individual failures", async () => {
  const connector = {
    id: "fixture",
    supports() { return true; },
    async getProfileCounts({ id }) {
      if (id === "bad") throw new Error("profile unavailable");
      return { followers: 10, following: 20 };
    }
  };

  const result = await enrichProfileCounts({
    connector,
    accounts: [{ id: "bad" }, { id: "good" }]
  });

  assert.equal(result.summary.failed, 1);
  assert.equal(result.summary.available, 1);
  assert.equal(result.errors[0].id, "bad");
});

test("profile enrichment can be persisted into the versioned audit and rehydrated into rows", () => {
  const run = createAuditRun({ source: { type: "browser", accountId: "owner" } });
  run.relationships.followers = [{ id: "a", username: "ratio_user" }];
  run.classifications = [{
    account: { id: "a", username: "ratio_user", fullName: "" },
    relationship: { followsYou: true, youFollow: false, mutual: false },
    key: "active",
    label: "Active",
    observed: { likes: 1, comments: 0, postsEngaged: 1, totalPosts: 1, participationPercent: 100 },
    confidence: { level: "high", percent: 99, reasons: [] }
  }];

  const enrichedRun = applyProfileEnrichmentToRun(run, {
    results: [{
      id: "a",
      username: "ratio_user",
      profileCounts: { followers: 100, following: 250, source: "fixture", fetchedAt: "2026-08-11T00:00:00.000Z" }
    }]
  });

  assert.equal(enrichedRun.enrichments.profileCounts.length, 1);
  const row = buildAccountRows(enrichedRun)[0];
  assert.equal(row.profileCounts.followers, 100);
  assert.equal(row.followRatio.followingToFollowers, 2.5);
  assert.equal(row.followRatio.moreFollowingThanFollowers, true);
});
