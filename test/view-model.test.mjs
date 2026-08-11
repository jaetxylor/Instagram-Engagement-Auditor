import test from "node:test";
import assert from "node:assert/strict";
import { buildAccountRows, buildAuditOverview, filterAccountRows } from "../src/product/view-model.mjs";

function sampleRun() {
  return {
    id: "audit-1",
    status: "complete",
    source: { accountId: "owner", accountUsername: "creator" },
    relationships: {
      followers: [
        { id: "u1", username: "active", fullName: "Active User" },
        { id: "u2", username: "inactive", fullName: "Inactive User" }
      ],
      following: [
        { id: "u1", username: "active", fullName: "Active User" },
        { id: "u3", username: "nonfollower", fullName: "Non Follower" }
      ]
    },
    posts: [{ id: "p1" }, { id: "p2" }],
    observations: {
      likes: [
        { postId: "p1", userId: "u1", username: "active" },
        { postId: "p1", userId: "u4", username: "outside" }
      ],
      comments: []
    },
    metrics: {
      profileEngagementRate: 2.81234,
      allPostsAverageEngagementRate: 2.61234,
      averageLikesRecent: 120.26,
      averageCommentsRecent: 6.44,
      outliersRemoved: 1
    },
    coverage: {
      overallPercent: 96.42,
      incompletePosts: 1,
      missingModalities: [],
      confidence: {
        level: "high",
        reasons: ["Strong identity coverage"]
      }
    },
    classifications: [
      {
        account: { id: "u1", username: "active", fullName: "Active User" },
        relationship: { followsYou: true, youFollow: true, mutual: true },
        key: "active",
        label: "Active",
        observed: { likes: 2, comments: 0, postsEngaged: 2, totalPosts: 2, participationPercent: 100 },
        confidence: { level: "high", percent: 96.42, reasons: [] }
      },
      {
        account: { id: "u2", username: "inactive", fullName: "Inactive User" },
        relationship: { followsYou: true, youFollow: false, mutual: false },
        key: "inactive_high_confidence",
        label: "High-confidence inactive",
        observed: { likes: 0, comments: 0, postsEngaged: 0, totalPosts: 2, participationPercent: 0 },
        confidence: { level: "high", percent: 96.42, reasons: [] }
      }
    ],
    progress: {
      phase: "complete",
      completedItems: 2,
      completedItemIds: ["p1", "p2"],
      totalItems: 2,
      percent: 100,
      message: "Audit complete"
    },
    diagnostics: {
      warnings: ["One partial response"],
      errors: [],
      requestCount: 42,
      retries: 1
    }
  };
}

test("overview summarizes relationships, metrics, quality and classifications", () => {
  const overview = buildAuditOverview(sampleRun());

  assert.equal(overview.relationships.followers, 2);
  assert.equal(overview.relationships.following, 2);
  assert.equal(overview.relationships.mutuals, 1);
  assert.equal(overview.relationships.notFollowingBack, 1);
  assert.equal(overview.relationships.youDoNotFollow, 1);
  assert.equal(overview.classifications.active, 1);
  assert.equal(overview.classifications.inactiveHighConfidence, 1);
  assert.equal(overview.engagement.profileEngagementRate, 2.81);
  assert.equal(overview.auditQuality.identityCoveragePercent, 96.4);
  assert.equal(overview.auditQuality.confidenceLevel, "high");
  assert.equal(overview.diagnostics.requestCount, 42);
  assert.equal(overview.canResume, false);
});

test("account rows unify classifications, non-followbacks and outside engagers", () => {
  const rows = buildAccountRows(sampleRun());
  const byId = new Map(rows.map(row => [row.id, row]));

  assert.equal(byId.get("u1").key, "active");
  assert.equal(byId.get("u1").tone, "positive");
  assert.equal(byId.get("u2").key, "inactive_high_confidence");
  assert.equal(byId.get("u2").tone, "danger");
  assert.equal(byId.get("u3").key, "not_following_back");
  assert.equal(byId.get("u3").relationship.youFollow, true);
  assert.equal(byId.get("u4").key, "other_engager");
});

test("row filtering supports status groups, search and mutual-only views", () => {
  const rows = buildAccountRows(sampleRun());

  assert.deepEqual(
    filterAccountRows(rows, { keys: ["inactive_high_confidence"] }).map(row => row.id),
    ["u2"]
  );
  assert.deepEqual(
    filterAccountRows(rows, { query: "Non Follower" }).map(row => row.id),
    ["u3"]
  );
  assert.deepEqual(
    filterAccountRows(rows, { mutualOnly: true }).map(row => row.id),
    ["u1"]
  );
});

test("incomplete audits expose resumability in the product view model", () => {
  const run = sampleRun();
  run.status = "running";
  run.progress.phase = "engagement";
  run.progress.completedItems = 1;
  run.progress.completedItemIds = ["p1"];
  run.progress.percent = 65;

  const overview = buildAuditOverview(run);
  assert.equal(overview.canResume, true);
  assert.equal(overview.progress.completedItems, 1);
  assert.equal(overview.progress.percent, 65);
});
