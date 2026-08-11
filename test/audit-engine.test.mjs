import test from "node:test";
import assert from "node:assert/strict";
import { createAuditEngine } from "../src/core/audit-engine.mjs";
import { createAuditRun, patchAuditRun, updateAuditProgress } from "../src/core/audit-schema.mjs";
import { makeCoverageUnit } from "../src/core/coverage.mjs";
import { defineConnector } from "../src/connectors/contract.mjs";
import { MemoryCheckpointStore } from "../src/storage/checkpoint-store.mjs";

function makeConnector(calls = {}) {
  const users = {
    one: { id: "u1", username: "one", fullName: "One" },
    two: { id: "u2", username: "two", fullName: "Two" },
    other: { id: "u3", username: "other", fullName: "Other" }
  };

  const posts = [
    { id: "p1", timestamp: 2, likeCount: 2, commentCount: 1, coverage: {} },
    { id: "p2", timestamp: 1, likeCount: 1, commentCount: 0, coverage: {} }
  ];

  return defineConnector({
    id: "mock-browser",
    version: "4.0.0-test",
    sourceType: "browser",
    capabilities: [
      "account",
      "followers",
      "following",
      "posts",
      "like_identities",
      "comment_identities"
    ],
    methods: {
      async getAccountContext() {
        calls.account = (calls.account ?? 0) + 1;
        return { id: "acct", username: "owner", followerCount: 2 };
      },
      async listFollowers() {
        calls.followers = (calls.followers ?? 0) + 1;
        return [users.one, users.two];
      },
      async listFollowing() {
        calls.following = (calls.following ?? 0) + 1;
        return [users.one];
      },
      async listPosts() {
        calls.posts = (calls.posts ?? 0) + 1;
        return posts;
      },
      async collectPostEngagement({ post }) {
        calls.engagement = [...(calls.engagement ?? []), post.id];
        if (post.id === "p1") {
          return {
            likes: [users.one, users.other],
            comments: [{ id: "c1", user: users.one, text: "hello" }],
            coverage: {
              likes: makeCoverageUnit({ expected: 2, returned: 2, modality: "likes" }),
              comments: makeCoverageUnit({ expected: 1, returned: 1, modality: "comments" })
            }
          };
        }

        return {
          likes: [users.one],
          comments: [],
          coverage: {
            likes: makeCoverageUnit({ expected: 1, returned: 1, modality: "likes" }),
            comments: makeCoverageUnit({ expected: 0, returned: 0, modality: "comments" })
          }
        };
      }
    }
  });
}

test("audit engine produces a complete, checkpointed, source-agnostic audit", async () => {
  const calls = {};
  const connector = makeConnector(calls);
  const store = new MemoryCheckpointStore();
  const engine = createAuditEngine({ connector, checkpointStore: store });
  const progressEvents = [];

  const run = await engine.runAudit({
    configuration: {
      likes: true,
      comments: true,
      lowParticipationPercent: 10,
      lowEngagedPosts: 1
    },
    onProgress(progress) {
      progressEvents.push(progress);
    }
  });

  assert.equal(run.status, "complete");
  assert.equal(run.progress.percent, 100);
  assert.equal(run.relationships.followers.length, 2);
  assert.equal(run.relationships.following.length, 1);
  assert.equal(run.posts.length, 2);
  assert.equal(run.observations.likes.length, 3);
  assert.equal(run.observations.comments.length, 1);
  assert.equal(run.coverage.confidence.level, "high");
  assert.equal(run.metrics.followerCount, 2);

  const one = run.classifications.find(row => row.account.id === "u1");
  const two = run.classifications.find(row => row.account.id === "u2");
  assert.equal(one.key, "active");
  assert.equal(one.relationship.mutual, true);
  assert.equal(two.key, "inactive_high_confidence");
  assert.equal(two.relationship.mutual, false);

  assert.deepEqual(calls.engagement, ["p1", "p2"]);
  assert.ok(progressEvents.some(event => event.phase === "engagement" && event.completedItems === 1));

  const stored = await store.get(run.id);
  assert.equal(stored.status, "complete");
});

test("audit engine resumes from completed post ids instead of rescanning completed posts", async () => {
  const calls = {};
  const connector = makeConnector(calls);
  const store = new MemoryCheckpointStore();
  const engine = createAuditEngine({ connector, checkpointStore: store });

  let partial = createAuditRun({
    id: "resume-run",
    source: {
      type: "browser",
      accountId: "acct",
      accountUsername: "owner",
      connectorVersion: "4.0.0-test"
    },
    configuration: { likes: true, comments: true }
  });

  partial = patchAuditRun(partial, {
    relationships: {
      followers: [
        { id: "u1", username: "one", fullName: "One" },
        { id: "u2", username: "two", fullName: "Two" }
      ],
      following: [{ id: "u1", username: "one", fullName: "One" }]
    },
    posts: [
      {
        id: "p1",
        timestamp: 2,
        likeCount: 2,
        commentCount: 1,
        coverage: {
          likes: makeCoverageUnit({ expected: 2, returned: 2, modality: "likes" }),
          comments: makeCoverageUnit({ expected: 1, returned: 1, modality: "comments" })
        }
      },
      { id: "p2", timestamp: 1, likeCount: 1, commentCount: 0, coverage: {} }
    ],
    observations: {
      likes: [
        { postId: "p1", userId: "u1", username: "one" },
        { postId: "p1", userId: "u3", username: "other" }
      ],
      comments: [
        { id: "c1", postId: "p1", userId: "u1", username: "one", text: "hello", isReply: false }
      ]
    }
  });

  partial = updateAuditProgress(partial, {
    phase: "engagement",
    completedItems: 1,
    completedItemIds: ["p1"],
    totalItems: 2,
    percent: 65,
    message: "Scanned 1 / 2 posts"
  });

  const run = await engine.runAudit({ resumeRun: partial });

  assert.equal(run.status, "complete");
  assert.deepEqual(calls.engagement, ["p2"]);
  assert.equal(calls.followers ?? 0, 0);
  assert.equal(calls.following ?? 0, 0);
  assert.equal(calls.posts ?? 0, 0);
  assert.deepEqual(new Set(run.progress.completedItemIds), new Set(["p1", "p2"]));
  assert.equal(run.observations.likes.length, 3);
});
