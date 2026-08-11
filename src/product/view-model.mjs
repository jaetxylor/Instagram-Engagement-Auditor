import { calculateFollowRatio } from "../core/engagement.mjs";

function idOf(value) {
  return String(value?.id ?? value?.pk ?? value?.userId ?? "");
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function profileFields(user = {}) {
  return {
    profilePicture: user?.profilePicture ?? user?.profile_pic_url ?? user?.pic ?? "",
    followerCount: finiteOrNull(user?.followerCount ?? user?.profileFollowers ?? user?.followers),
    followingCount: finiteOrNull(user?.followingCount ?? user?.profileFollowing ?? user?.following)
  };
}

export function buildAuditOverview(run) {
  const followers = safeArray(run?.relationships?.followers);
  const following = safeArray(run?.relationships?.following);
  const classifications = safeArray(run?.classifications);
  const followerIds = new Set(followers.map(idOf).filter(Boolean));
  const followingIds = new Set(following.map(idOf).filter(Boolean));

  let mutuals = 0;
  let notFollowingBack = 0;
  let youDoNotFollow = 0;

  for (const id of followingIds) {
    if (followerIds.has(id)) mutuals += 1;
    else notFollowingBack += 1;
  }
  for (const id of followerIds) {
    if (!followingIds.has(id)) youDoNotFollow += 1;
  }

  const classificationCounts = {
    inactiveHighConfidence: 0,
    inactiveLikely: 0,
    inactiveUncertain: 0,
    lowObservedEngagement: 0,
    active: 0
  };

  for (const row of classifications) {
    if (row?.key === "inactive_high_confidence") classificationCounts.inactiveHighConfidence += 1;
    else if (row?.key === "inactive_likely") classificationCounts.inactiveLikely += 1;
    else if (row?.key === "inactive_uncertain") classificationCounts.inactiveUncertain += 1;
    else if (row?.key === "low_observed_engagement") classificationCounts.lowObservedEngagement += 1;
    else if (row?.key === "active") classificationCounts.active += 1;
  }

  const warnings = safeArray(run?.diagnostics?.warnings);
  const errors = safeArray(run?.diagnostics?.errors);
  const progress = run?.progress ?? {};
  const profileCounts = safeArray(run?.enrichments?.profileCounts);

  return {
    auditId: run?.id ?? null,
    status: run?.status ?? "unknown",
    account: {
      id: run?.source?.accountId ?? null,
      username: run?.source?.accountUsername ?? null
    },
    relationships: {
      followers: followers.length,
      following: following.length,
      mutuals,
      notFollowingBack,
      youDoNotFollow
    },
    posts: safeArray(run?.posts).length,
    engagement: {
      profileEngagementRate: round(run?.metrics?.profileEngagementRate, 2),
      allPostsAverageEngagementRate: round(run?.metrics?.allPostsAverageEngagementRate, 2),
      averageLikesRecent: round(run?.metrics?.averageLikesRecent, 1),
      averageCommentsRecent: round(run?.metrics?.averageCommentsRecent, 1),
      outliersRemoved: Number(run?.metrics?.outliersRemoved ?? 0)
    },
    classifications: classificationCounts,
    enrichments: {
      profileCountsAvailable: profileCounts.length,
      moreFollowingThanFollowers: profileCounts.filter(record => Number(record?.following) > Number(record?.followers)).length
    },
    auditQuality: {
      identityCoveragePercent: round(run?.coverage?.overallPercent, 1),
      confidenceLevel: run?.coverage?.confidence?.level ?? "low",
      confidenceReasons: safeArray(run?.coverage?.confidence?.reasons),
      incompletePosts: Number(run?.coverage?.incompletePosts ?? 0),
      missingModalities: safeArray(run?.coverage?.missingModalities)
    },
    progress: {
      phase: progress.phase ?? null,
      completedItems: Number(progress.completedItems ?? 0),
      totalItems: Number.isFinite(Number(progress.totalItems)) ? Number(progress.totalItems) : null,
      percent: round(Number(progress.percent ?? 0), 0),
      message: progress.message ?? ""
    },
    diagnostics: {
      warnings: [...warnings],
      errors: [...errors],
      requestCount: Number(run?.diagnostics?.requestCount ?? 0),
      retries: Number(run?.diagnostics?.retries ?? 0)
    },
    canResume: !["complete", "pending"].includes(run?.status) && safeArray(progress.completedItemIds).length > 0
  };
}

function classificationTone(key) {
  if (key === "active") return "positive";
  if (key === "low_observed_engagement") return "warning";
  if (key === "inactive_high_confidence") return "danger";
  if (key === "inactive_likely") return "warning";
  if (key === "inactive_uncertain") return "neutral";
  if (key === "not_following_back") return "danger";
  if (key === "follower_only") return "neutral";
  if (key === "other_engager") return "positive";
  return "neutral";
}

function baseRow(user = {}) {
  return {
    id: idOf(user) || null,
    username: user?.username ?? "",
    fullName: user?.fullName ?? user?.full_name ?? "",
    ...profileFields(user)
  };
}

function withEnrichment(row, enrichment) {
  if (!enrichment) return row;
  const followers = finiteOrNull(enrichment.followers);
  const following = finiteOrNull(enrichment.following);
  if (followers == null || following == null) return row;
  return {
    ...row,
    followerCount: followers,
    followingCount: following,
    profileCounts: {
      followers,
      following,
      fetchedAt: enrichment.fetchedAt ?? null,
      source: enrichment.source ?? "unknown"
    },
    followRatio: calculateFollowRatio({ followers, following })
  };
}

export function buildAccountRows(run) {
  const followers = safeArray(run?.relationships?.followers);
  const following = safeArray(run?.relationships?.following);
  const followersById = new Map(followers.map(user => [idOf(user), user]).filter(([id]) => id));
  const followingById = new Map(following.map(user => [idOf(user), user]).filter(([id]) => id));
  const enrichmentById = new Map(safeArray(run?.enrichments?.profileCounts).map(record => [String(record?.id ?? ""), record]).filter(([id]) => id));
  const followerIds = new Set(followersById.keys());
  const followingIds = new Set(followingById.keys());
  const rows = [];

  for (const classification of safeArray(run?.classifications)) {
    const id = String(classification?.account?.id ?? "");
    const sourceUser = followersById.get(id) ?? classification?.account ?? {};
    rows.push({
      ...baseRow({ ...sourceUser, ...classification?.account }),
      relationship: classification?.relationship ?? {
        followsYou: true,
        youFollow: false,
        mutual: false
      },
      observed: classification?.observed ?? null,
      confidence: classification?.confidence ?? null,
      key: classification?.key ?? "unknown",
      label: classification?.label ?? "Unknown",
      tone: classificationTone(classification?.key),
      source: "follower_classification"
    });
  }

  for (const user of following) {
    const id = idOf(user);
    if (!id || followerIds.has(id)) continue;
    rows.push({
      ...baseRow(user),
      relationship: {
        followsYou: false,
        youFollow: true,
        mutual: false
      },
      observed: null,
      confidence: null,
      key: "not_following_back",
      label: "Not following you back",
      tone: classificationTone("not_following_back"),
      source: "relationship"
    });
  }

  const classifiedIds = new Set(rows.map(row => String(row.id ?? "")).filter(Boolean));
  for (const user of followers) {
    const id = idOf(user);
    if (!id || classifiedIds.has(id) || followingIds.has(id)) continue;
    rows.push({
      ...baseRow(user),
      relationship: {
        followsYou: true,
        youFollow: false,
        mutual: false
      },
      observed: null,
      confidence: null,
      key: "follower_only",
      label: "You do not follow",
      tone: classificationTone("follower_only"),
      source: "relationship"
    });
  }

  const knownIds = new Set([...followerIds, ...followingIds]);
  const otherEngagers = new Map();
  for (const observation of [
    ...safeArray(run?.observations?.likes),
    ...safeArray(run?.observations?.comments)
  ]) {
    const id = String(observation?.userId ?? "");
    if (!id || knownIds.has(id)) continue;
    if (!otherEngagers.has(id)) {
      otherEngagers.set(id, {
        ...baseRow({ id, username: observation?.username ?? "" }),
        relationship: {
          followsYou: false,
          youFollow: false,
          mutual: false
        },
        observed: null,
        confidence: null,
        key: "other_engager",
        label: "Other engager",
        tone: classificationTone("other_engager"),
        source: "observation"
      });
    }
  }
  rows.push(...otherEngagers.values());

  return rows.map(row => withEnrichment(row, enrichmentById.get(String(row.id ?? ""))));
}

export function filterAccountRows(rows, {
  query = "",
  keys = null,
  mutualOnly = false
} = {}) {
  const normalizedQuery = String(query).trim().toLowerCase();
  const allowed = Array.isArray(keys) && keys.length ? new Set(keys) : null;

  return safeArray(rows).filter(row => {
    if (allowed && !allowed.has(row.key)) return false;
    if (mutualOnly && !row?.relationship?.mutual) return false;
    if (!normalizedQuery) return true;
    return String(row?.username ?? "").toLowerCase().includes(normalizedQuery) ||
      String(row?.fullName ?? "").toLowerCase().includes(normalizedQuery);
  });
}
