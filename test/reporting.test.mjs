import test from "node:test";
import assert from "node:assert/strict";
import { accountRowsToCsv, csvEscape } from "../src/reporting/csv.mjs";
import { buildAuditExport, serializeAuditJson } from "../src/reporting/json.mjs";

test("csv escaping protects commas, quotes and newlines", () => {
  assert.equal(csvEscape("plain"), "plain");
  assert.equal(csvEscape("a,b"), '"a,b"');
  assert.equal(csvEscape('a"b'), '"a""b"');
  assert.equal(csvEscape("a\nb"), '"a\nb"');
});

test("account CSV exports relationship, observed engagement, confidence and ratio fields", () => {
  const csv = accountRowsToCsv([{
    id: "u1",
    username: "creator",
    fullName: "Creator, One",
    relationship: { followsYou: true, youFollow: true, mutual: true },
    key: "active",
    label: "Active",
    observed: {
      likes: 4,
      comments: 2,
      postsEngaged: 5,
      totalPosts: 12,
      participationPercent: 41.6667,
      weightedScore: 10
    },
    confidence: { level: "high", percent: 96.4 },
    profileCounts: { followers: 100, following: 250, source: "fixture" },
    followRatio: {
      followingToFollowers: 2.5,
      followingMinusFollowers: 150,
      moreFollowingThanFollowers: true
    }
  }]);

  assert.match(csv, /classification_key/);
  assert.match(csv, /profile_followers,profile_following,following_to_followers_ratio/);
  assert.match(csv, /"Creator, One"/);
  assert.match(csv, /mutual/);
  assert.match(csv, /41\.6667/);
  assert.match(csv, /high,96\.4/);
  assert.match(csv, /100,250,2\.5,150,true,fixture/);
});

test("JSON export wraps the versioned audit without mutating it", () => {
  const run = {
    id: "audit-1",
    schemaVersion: 1,
    status: "complete",
    enrichments: { profileCounts: [{ id: "u1", followers: 100, following: 250 }] }
  };
  const exported = buildAuditExport(run, {
    exportedAt: "2026-08-11T00:00:00.000Z",
    version: "4.0.0-test"
  });

  assert.equal(exported.exportSchemaVersion, 1);
  assert.equal(exported.meta.creator, "@jaetxylor");
  assert.equal(exported.meta.version, "4.0.0-test");
  assert.deepEqual(exported.audit, run);
  assert.notEqual(exported.audit, run);

  const parsed = JSON.parse(serializeAuditJson(run, { exportedAt: "2026-08-11T00:00:00.000Z" }));
  assert.equal(parsed.audit.id, "audit-1");
  assert.equal(parsed.audit.enrichments.profileCounts[0].following, 250);
});
