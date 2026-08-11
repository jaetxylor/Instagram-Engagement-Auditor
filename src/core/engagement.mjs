import { average, clamp, iqrFilter, median } from "./statistics.mjs";

export function calculatePostEngagementRate({ likes, comments, followers }) {
  const likeCount = Number(likes);
  const commentCount = Number(comments);
  const followerCount = Number(followers);

  if (!Number.isFinite(likeCount) || likeCount < 0) return null;
  if (!Number.isFinite(commentCount) || commentCount < 0) return null;
  if (!Number.isFinite(followerCount) || followerCount <= 0) return null;

  return ((likeCount + commentCount) / followerCount) * 100;
}

export function calculateProfileEngagementMetrics(posts, followerCount, {
  recentPostLimit = 12,
  outlierMultiplier = 1.5
} = {}) {
  const followers = Number(followerCount);
  const normalized = Array.from(posts ?? [])
    .map(post => ({
      id: String(post?.id ?? post?.pk ?? ""),
      timestamp: Number(post?.timestamp ?? post?.takenAt ?? post?.taken_at ?? 0),
      likes: Number(post?.likeCount ?? post?.likes),
      comments: Number(post?.commentCount ?? post?.comments)
    }))
    .filter(post => Number.isFinite(post.likes) && post.likes >= 0 && Number.isFinite(post.comments) && post.comments >= 0)
    .sort((a, b) => b.timestamp - a.timestamp);

  if (!Number.isFinite(followers) || followers <= 0 || !normalized.length) {
    return {
      followerCount: Number.isFinite(followers) ? followers : null,
      usablePosts: normalized.length,
      recentPosts: 0,
      profileEngagementRate: null,
      allPostsAverageEngagementRate: null,
      averageLikesRecent: null,
      averageCommentsRecent: null,
      outliersRemoved: 0,
      perPostRecent: []
    };
  }

  const recent = normalized.slice(0, Math.max(1, recentPostLimit));
  const perPostRecent = recent.map(post => ({
    ...post,
    engagementRate: calculatePostEngagementRate({
      likes: post.likes,
      comments: post.comments,
      followers
    })
  }));

  const recentRates = perPostRecent.map(post => post.engagementRate).filter(Number.isFinite);
  const filtered = iqrFilter(recentRates, outlierMultiplier);
  const totalInteractions = normalized.reduce((sum, post) => sum + post.likes + post.comments, 0);

  return {
    followerCount: followers,
    usablePosts: normalized.length,
    recentPosts: recent.length,
    profileEngagementRate: median(filtered.kept),
    allPostsAverageEngagementRate: (totalInteractions / (followers * normalized.length)) * 100,
    averageLikesRecent: average(recent.map(post => post.likes)),
    averageCommentsRecent: average(recent.map(post => post.comments)),
    outliersRemoved: filtered.removed.length,
    outlierDetails: filtered,
    perPostRecent
  };
}

export function classifyFollowerObservation({
  likes = 0,
  comments = 0,
  engagedPosts = 0,
  totalPosts = 0,
  lowParticipationPercent = 10,
  lowEngagedPosts = 1,
  confidence = { level: "low", percent: null, reasons: [] },
  extraComments = 0
} = {}) {
  const observedLikes = Math.max(0, Number(likes) || 0);
  const observedComments = Math.max(0, Number(comments) || 0);
  const observedEngagedPosts = Math.max(0, Number(engagedPosts) || 0);
  const scannedPosts = Math.max(0, Number(totalPosts) || 0);
  const participationPercent = scannedPosts > 0
    ? clamp((observedEngagedPosts / scannedPosts) * 100, 0, 100)
    : 0;
  const noObservedEngagement = observedLikes === 0 && observedComments === 0;
  const lowObservedEngagement = !noObservedEngagement && (
    participationPercent < lowParticipationPercent ||
    observedEngagedPosts <= lowEngagedPosts
  );

  let key;
  let label;

  if (noObservedEngagement && confidence?.level === "high") {
    key = "inactive_high_confidence";
    label = "High-confidence inactive";
  } else if (noObservedEngagement && confidence?.level === "medium") {
    key = "inactive_likely";
    label = "Likely inactive";
  } else if (noObservedEngagement) {
    key = "inactive_uncertain";
    label = "Uncertain · no observed engagement";
  } else if (lowObservedEngagement) {
    key = "low_observed_engagement";
    label = "Low observed engagement";
  } else {
    key = "active";
    label = "Active";
  }

  const weightedScore = observedLikes + observedComments * 3 + Math.max(0, Number(extraComments) || 0) * 0.25;

  return {
    key,
    label,
    observed: {
      likes: observedLikes,
      comments: observedComments,
      postsEngaged: observedEngagedPosts,
      totalPosts: scannedPosts,
      participationPercent,
      weightedScore
    },
    confidence: {
      level: confidence?.level ?? "low",
      percent: Number.isFinite(confidence?.percent) ? confidence.percent : null,
      reasons: Array.isArray(confidence?.reasons) ? [...confidence.reasons] : []
    }
  };
}

export function calculateFollowRatio({ followers, following }) {
  const followerCount = Number(followers);
  const followingCount = Number(following);

  if (!Number.isFinite(followerCount) || followerCount < 0) return null;
  if (!Number.isFinite(followingCount) || followingCount < 0) return null;

  return {
    followers: followerCount,
    following: followingCount,
    followingToFollowers: followerCount > 0 ? followingCount / followerCount : followingCount > 0 ? Infinity : 0,
    followersToFollowing: followingCount > 0 ? followerCount / followingCount : followerCount > 0 ? Infinity : 0,
    followingMinusFollowers: followingCount - followerCount,
    moreFollowingThanFollowers: followingCount > followerCount
  };
}
