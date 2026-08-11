import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { __test } from "../src/connectors/instagram-browser.mjs";

async function fixture(name) {
  const url = new URL(`./fixtures/instagram/${name}.json`, import.meta.url);
  return JSON.parse(await readFile(url, "utf8"));
}

test("relationship fixture preserves profile metadata and counts", async () => {
  const data = await fixture("relationship-page");
  const first = __test.normalizeUser(data.users[0]);
  const second = __test.normalizeUser(data.users[1]);
  assert.equal(first.id, "101");
  assert.equal(first.profilePicture, "https://example.invalid/one.jpg");
  assert.equal(first.followerCount, 250);
  assert.equal(first.followingCount, 125);
  assert.equal(second.followerCount, null);
});

test("post fixture handles visible and hidden interaction totals", async () => {
  const data = await fixture("post-page");
  const visible = __test.normalizePost(data.items[0]);
  const hidden = __test.normalizePost(data.items[1]);
  assert.equal(visible.likeCount, 123);
  assert.equal(visible.commentCount, 17);
  assert.equal(hidden.likesHidden, true);
  assert.equal(hidden.likeCount, null);
  assert.equal(hidden.commentsDisabled, true);
});

test("comment fixture keeps replies distinguishable from root comments", async () => {
  const data = await fixture("comments-page");
  const root = __test.normalizeComment(data.comments[0]);
  const reply = __test.normalizeComment(data.comments[0].preview_child_comments[0], {
    parentCommentId: root.id,
    isReply: true
  });
  assert.equal(root.isReply, false);
  assert.equal(root.user.id, "201");
  assert.equal(reply.isReply, true);
  assert.equal(reply.parentCommentId, "c1");
  assert.equal(reply.user.id, "202");
});

test("profile fixture extracts follower and following totals", async () => {
  const data = await fixture("profile-info");
  assert.deepEqual(__test.parseProfileCounts(data), { followers: 4321, following: 876 });
});
