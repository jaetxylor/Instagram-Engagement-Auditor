import test from "node:test";
import assert from "node:assert/strict";
import { LocalStorageProfileCountCache, MemoryProfileCountCache } from "../src/storage/profile-count-cache.mjs";

test("memory profile cache expires stale records", async () => {
  let now = Date.parse("2026-08-11T00:00:00Z");
  const cache = new MemoryProfileCountCache({ ttlMs: 1000, now: () => now });
  await cache.set("u1", { followers: 10, following: 20 });
  assert.equal((await cache.get("u1")).followers, 10);
  now += 1001;
  assert.equal(await cache.get("u1"), null);
});

test("local storage profile cache survives a new cache instance", async () => {
  const data = new Map();
  const storage = {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); }
  };
  const now = () => Date.parse("2026-08-11T00:00:00Z");
  const first = new LocalStorageProfileCountCache({ storage, key: "test", now });
  await first.set("u1", { followers: 5, following: 15 });
  const second = new LocalStorageProfileCountCache({ storage, key: "test", now });
  assert.deepEqual(await second.get("u1"), {
    followers: 5,
    following: 15,
    fetchedAt: "2026-08-11T00:00:00.000Z"
  });
});
