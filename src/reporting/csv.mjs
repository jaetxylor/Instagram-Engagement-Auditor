function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function relationshipLabel(row) {
  if (row?.relationship?.mutual) return "mutual";
  if (row?.relationship?.youFollow && !row?.relationship?.followsYou) return "you_follow";
  if (row?.relationship?.followsYou && !row?.relationship?.youFollow) return "follows_you";
  return "outside_network";
}

export function accountRowsToCsv(rows = []) {
  const headers = [
    "id",
    "username",
    "full_name",
    "relationship",
    "follows_you",
    "you_follow",
    "mutual",
    "classification_key",
    "classification",
    "observed_likes",
    "observed_comments",
    "posts_engaged",
    "posts_scanned",
    "participation_percent",
    "weighted_score",
    "confidence_level",
    "confidence_percent",
    "profile_followers",
    "profile_following",
    "following_to_followers_ratio",
    "following_minus_followers",
    "more_following_than_followers",
    "profile_count_source"
  ];

  const lines = Array.from(rows ?? []).map(row => {
    const observed = row?.observed ?? {};
    const confidence = row?.confidence ?? {};
    const counts = row?.profileCounts ?? {};
    const ratio = row?.followRatio ?? {};
    const values = [
      row?.id ?? "",
      row?.username ?? "",
      row?.fullName ?? "",
      relationshipLabel(row),
      Boolean(row?.relationship?.followsYou),
      Boolean(row?.relationship?.youFollow),
      Boolean(row?.relationship?.mutual),
      row?.key ?? "",
      row?.label ?? "",
      Number.isFinite(observed.likes) ? observed.likes : "",
      Number.isFinite(observed.comments) ? observed.comments : "",
      Number.isFinite(observed.postsEngaged) ? observed.postsEngaged : "",
      Number.isFinite(observed.totalPosts) ? observed.totalPosts : "",
      Number.isFinite(observed.participationPercent) ? observed.participationPercent : "",
      Number.isFinite(observed.weightedScore) ? observed.weightedScore : "",
      confidence?.level ?? "",
      Number.isFinite(confidence?.percent) ? confidence.percent : "",
      Number.isFinite(counts.followers) ? counts.followers : Number.isFinite(row?.followerCount) ? row.followerCount : "",
      Number.isFinite(counts.following) ? counts.following : Number.isFinite(row?.followingCount) ? row.followingCount : "",
      ratio.followingToFollowers === Infinity ? "Infinity" : Number.isFinite(ratio.followingToFollowers) ? ratio.followingToFollowers : "",
      Number.isFinite(ratio.followingMinusFollowers) ? ratio.followingMinusFollowers : "",
      typeof ratio.moreFollowingThanFollowers === "boolean" ? ratio.moreFollowingThanFollowers : "",
      counts.source ?? ""
    ];
    return values.map(csvEscape).join(",");
  });

  return [headers.join(","), ...lines].join("\n");
}

export { csvEscape };
