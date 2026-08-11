import test from "node:test";
import assert from "node:assert/strict";
import { enrichProfileCounts } from "../src/product/profile-enrichment.mjs";
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
