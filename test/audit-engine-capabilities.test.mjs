import test from "node:test";
import assert from "node:assert/strict";
import { createAuditEngine } from "../src/core/audit-engine.mjs";
import { makeCoverageUnit } from "../src/core/coverage.mjs";
import { defineConnector } from "../src/connectors/contract.mjs";

test("missing requested identity modality forces low-confidence negative classifications", async () => {
  const connector = defineConnector({
    id: "comments-only",
    version: "1",
    sourceType: "test",
    capabilities: ["account", "followers", "following", "posts", "comment_identities"],
    methods: {
      async getAccountContext() {
        return { id: "acct", followerCount: 1 };
      },
      async listFollowers() {
        return [{ id: "u1", username: "one" }];
      },
      async listFollowing() {
        return [];
      },
      async listPosts() {
        return [{ id: "p1", timestamp: 1, likeCount: 10, commentCount: 0, coverage: {} }];
      },
      async collectPostEngagement() {
        return {
          likes: [],
          comments: [],
          coverage: {
            comments: makeCoverageUnit({ expected: 0, returned: 0, modality: "comments" })
          }
        };
      }
    }
  });

  const run = await createAuditEngine({ connector }).runAudit({
    configuration: { likes: true, comments: true }
  });

  assert.equal(run.coverage.confidence.level, "low");
  assert.deepEqual(run.coverage.missingModalities, ["likes"]);
  assert.equal(run.classifications[0].key, "inactive_uncertain");
  assert.ok(run.coverage.confidence.reasons.some(reason => reason.includes("likes")));
});
