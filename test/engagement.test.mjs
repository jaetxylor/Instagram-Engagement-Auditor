import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateFollowRatio,
  calculatePostEngagementRate,
  calculateProfileEngagementMetrics,
  classifyFollowerObservation
} from "../src/core/engagement.mjs";

test("calculatePostEngagementRate uses interactions divided by followers", () => {
  assert.equal(calculatePostEngagementRate({ likes: 80, comments: 20, followers: 1000 }), 10);
  assert.equal(calculatePostEngagementRate({ likes: 80, comments: 20, followers: 0 }), null);
});

test("profile metrics use recent posts and return transparent supporting values", () => {
  const posts = [
    { id: "a", timestamp: 5, likeCount: 80, commentCount: 20 },
    { id: "b", timestamp: 4, likeCount: 40, commentCount: 10 },
    { id: "c", timestamp: 3, likeCount: 60, commentCount: 10 },
    { id: "d", timestamp: 2, likeCount: 50, commentCount: 10 },
    { id: "e", timestamp: 1, likeCount: 50, commentCount: 0 }
  ];

  const metrics = calculateProfileEngagementMetrics(posts, 1000);
  assert.equal(metrics.usablePosts, 5);
  assert.equal(metrics.recentPosts, 5);
  assert.equal(metrics.profileEngagementRate, 6);
  assert.ok(Math.abs(metrics.allPostsAverageEngagementRate - 6.6) < 1e-12);
  assert.equal(metrics.averageLikesRecent, 56);
  assert.equal(metrics.averageCommentsRecent, 10);
});

test("high-confidence zero engagement is classified as high-confidence inactive", () => {
  const result = classifyFollowerObservation({
    likes: 0,
    comments: 0,
    engagedPosts: 0,
    totalPosts: 20,
    confidence: { level: "high", percent: 98, reasons: ["Strong coverage"] }
  });

  assert.equal(result.key, "inactive_high_confidence");
  assert.equal(result.label, "High-confidence inactive");
  assert.equal(result.confidence.percent, 98);
});

test("low-confidence zero engagement remains uncertain", () => {
  const result = classifyFollowerObservation({
    likes: 0,
    comments: 0,
    engagedPosts: 0,
    totalPosts: 20,
    confidence: { level: "low", percent: 54 }
  });

  assert.equal(result.key, "inactive_uncertain");
  assert.match(result.label, /Uncertain/);
});

test("observed participation can be low even when engagement exists", () => {
  const result = classifyFollowerObservation({
    likes: 1,
    comments: 0,
    engagedPosts: 1,
    totalPosts: 20,
    lowParticipationPercent: 10,
    lowEngagedPosts: 1,
    confidence: { level: "high", percent: 99 }
  });

  assert.equal(result.key, "low_observed_engagement");
  assert.equal(result.observed.participationPercent, 5);
});

test("follow ratio captures ratio, delta and zero-follower edge case", () => {
  const normal = calculateFollowRatio({ followers: 500, following: 1000 });
  assert.equal(normal.followingToFollowers, 2);
  assert.equal(normal.followingMinusFollowers, 500);
  assert.equal(normal.moreFollowingThanFollowers, true);

  const zeroFollowers = calculateFollowRatio({ followers: 0, following: 50 });
  assert.equal(zeroFollowers.followingToFollowers, Infinity);
  assert.equal(zeroFollowers.moreFollowingThanFollowers, true);
});
