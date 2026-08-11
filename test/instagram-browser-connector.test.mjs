import test from "node:test";
import assert from "node:assert/strict";
import { createInstagramBrowserConnector, __test } from "../src/connectors/instagram-browser.mjs";

function createMockClient() {
  const paths = [];
  return {
    paths,
    async requestJson(path) {
      paths.push(String(path));

      if (String(path).includes("/followers/")) {
        if (String(path).includes("max_id=next-followers")) {
          return { users: [{ pk: "u2", username: "two", full_name: "Two" }] };
        }
        return {
          users: [{ pk: "u1", username: "one", full_name: "One" }],
          next_max_id: "next-followers"
        };
      }

      if (String(path).includes("/following/")) {
        return { users: [{ pk: "u1", username: "one", full_name: "One" }] };
      }

      if (String(path).startsWith("/api/v1/feed/user/")) {
        return {
          items: [
            { pk: "p1", code: "ABC", taken_at: 100, like_count: 2, comment_count: 2 }
          ],
          more_available: false
        };
      }

      if (String(path).includes("/media/p1/info/")) {
        return {
          items: [
            {
              pk: "p1",
              code: "ABC",
              taken_at: 100,
              like_count: 2,
              comment_count: 2,
              comments_disabled: false,
              like_and_view_counts_disabled: false
            }
          ]
        };
      }

      if (String(path).includes("/media/p1/likers/")) {
        return {
          users: [
            { pk: "u1", username: "one", full_name: "One" },
            { pk: "u3", username: "three", full_name: "Three" }
          ]
        };
      }

      if (String(path).includes("/media/p1/comments/")) {
        return {
          comments: [
            {
              pk: "c1",
              text: "root",
              created_at: 101,
              user: { pk: "u1", username: "one", full_name: "One" },
              preview_child_comments: [
                {
                  pk: "c2",
                  text: "reply",
                  created_at: 102,
                  user: { pk: "u2", username: "two", full_name: "Two" }
                }
              ]
            }
          ]
        };
      }

      if (String(path).includes("/users/u1/info/")) {
        return { user: { pk: "u1", username: "one", follower_count: 50, following_count: 75 } };
      }

      throw new Error(`Unexpected request: ${path}`);
    },
    getDiagnostics() {
      return { requestCount: paths.length, retries: 0, consecutiveFailures: 0 };
    }
  };
}

test("browser connector reads session identity without requesting current-user edit metadata", async () => {
  const connector = createInstagramBrowserConnector({
    client: createMockClient(),
    documentRef: { cookie: "ds_user_id=123; csrftoken=csrf-value" }
  });

  const account = await connector.getAccountContext();
  assert.deepEqual(account, { id: "123", username: null, followerCount: null });
});

test("browser connector paginates and normalizes relationship lists", async () => {
  const client = createMockClient();
  const connector = createInstagramBrowserConnector({
    client,
    documentRef: { cookie: "ds_user_id=123; csrftoken=csrf-value" }
  });
  const account = await connector.getAccountContext();

  const followers = await connector.listFollowers({ account });
  const following = await connector.listFollowing({ account });

  assert.deepEqual(followers.map(user => user.id), ["u1", "u2"]);
  assert.deepEqual(following.map(user => user.id), ["u1"]);
  assert.equal(followers[0].fullName, "One");
  assert.ok(client.paths.some(path => path.includes("max_id=next-followers")));
});

test("browser connector returns posts plus separated comment/reply diagnostics", async () => {
  const connector = createInstagramBrowserConnector({
    client: createMockClient(),
    documentRef: { cookie: "ds_user_id=123; csrftoken=csrf-value" }
  });
  const account = await connector.getAccountContext();
  const posts = await connector.listPosts({ account });
  const result = await connector.collectPostEngagement({
    post: posts[0],
    includeLikes: true,
    includeComments: true
  });

  assert.equal(result.post.id, "p1");
  assert.equal(result.likes.length, 2);
  assert.equal(result.comments.length, 2);
  assert.equal(result.comments.filter(comment => comment.isReply).length, 1);
  assert.equal(result.coverage.likes.percent, 100);
  assert.equal(result.coverage.comments.percent, 100);
  assert.equal(result.coverage.comments.rootCommentsReturned, 1);
  assert.equal(result.coverage.comments.repliesReturned, 1);
  assert.equal(result.coverage.comments.uniqueCommentersReturned, 2);
});

test("browser connector exposes optional profile follower/following counts", async () => {
  const connector = createInstagramBrowserConnector({
    client: createMockClient(),
    documentRef: { cookie: "ds_user_id=123; csrftoken=csrf-value" }
  });

  const counts = await connector.getProfileCounts({ id: "u1", username: "one" });
  assert.deepEqual(counts, { followers: 50, following: 75 });
});

test("normalizers accept common Instagram response count shapes", () => {
  const user = __test.normalizeUser({
    pk: "u9",
    username: "nine",
    edge_followed_by: { count: 9 },
    edge_follow: { count: 12 }
  });

  assert.equal(user.id, "u9");
  assert.equal(user.followerCount, 9);
  assert.equal(user.followingCount, 12);
});
