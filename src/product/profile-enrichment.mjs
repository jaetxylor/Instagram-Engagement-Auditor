import { calculateFollowRatio } from "../core/engagement.mjs";
import { patchAuditRun } from "../core/audit-schema.mjs";

const COMPLETION_HANDLERS = new WeakMap();

function idOf(account) {
  return String(account?.id ?? account?.pk ?? account?.userId ?? "");
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function existingCounts(account) {
  const followers = finite(account?.followerCount ?? account?.profileFollowers ?? account?.followers);
  const following = finite(account?.followingCount ?? account?.profileFollowing ?? account?.following);
  return followers != null && following != null ? { followers, following } : null;
}

function normalizeCacheRecord(record) {
  const followers = finite(record?.followers);
  const following = finite(record?.following);
  if (followers == null || following == null) return null;
  return {
    followers,
    following,
    fetchedAt: record?.fetchedAt ?? null,
    source: record?.source ?? "cache"
  };
}

export function registerProfileEnrichmentCompletionHandler(connector, handler) {
  if (!connector || (typeof connector !== "object" && typeof connector !== "function")) {
    throw new TypeError("A connector object is required to register profile enrichment persistence.");
  }
  if (handler != null && typeof handler !== "function") {
    throw new TypeError("Profile enrichment completion handler must be a function.");
  }

  if (handler == null) {
    COMPLETION_HANDLERS.delete(connector);
    return () => {};
  }

  COMPLETION_HANDLERS.set(connector, handler);
  return () => {
    if (COMPLETION_HANDLERS.get(connector) === handler) COMPLETION_HANDLERS.delete(connector);
  };
}

async function notifyProfileEnrichmentComplete(connector, result) {
  const handler = COMPLETION_HANDLERS.get(connector);
  if (typeof handler !== "function") return null;
  return handler(result);
}

export function decorateProfileCounts(account, counts, { source = "unknown", fetchedAt = null } = {}) {
  const normalized = normalizeCacheRecord({ ...counts, source, fetchedAt });
  if (!normalized) return { ...account, profileCounts: null, followRatio: null };
  return {
    ...account,
    profileCounts: normalized,
    followRatio: calculateFollowRatio({
      followers: normalized.followers,
      following: normalized.following
    })
  };
}

export function applyProfileEnrichmentToRun(run, enrichmentResult) {
  const existing = new Map((run?.enrichments?.profileCounts ?? []).map(record => [String(record?.id ?? ""), record]).filter(([id]) => id));
  for (const result of enrichmentResult?.results ?? []) {
    const id = idOf(result);
    const counts = result?.profileCounts;
    if (!id || !counts || !Number.isFinite(counts.followers) || !Number.isFinite(counts.following)) continue;
    existing.set(id, {
      id,
      username: result?.username ?? "",
      followers: counts.followers,
      following: counts.following,
      fetchedAt: counts.fetchedAt ?? null,
      source: counts.source ?? "unknown"
    });
  }
  return patchAuditRun(run, {
    enrichments: {
      ...(run?.enrichments ?? {}),
      profileCounts: [...existing.values()]
    }
  });
}

export async function enrichProfileCounts({
  connector,
  accounts = [],
  cache = null,
  signal = null,
  onProgress = null,
  continueOnError = true
} = {}) {
  if (!connector?.supports?.("profile_counts") || typeof connector?.getProfileCounts !== "function") {
    throw new Error("The selected connector does not support profile follower/following counts.");
  }

  const unique = new Map();
  for (const account of accounts ?? []) {
    const id = idOf(account);
    if (id && !unique.has(id)) unique.set(id, account);
  }

  const total = unique.size;
  let completed = 0;
  let failed = 0;
  let cached = 0;
  let embedded = 0;
  const results = [];
  const errors = [];

  for (const account of unique.values()) {
    if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");
    const id = idOf(account);
    const username = account?.username ?? "";
    let counts = existingCounts(account);
    let source = counts ? "relationship_payload" : null;

    if (counts) embedded += 1;

    if (!counts && cache?.get) {
      counts = normalizeCacheRecord(await cache.get(id));
      if (counts) {
        source = "cache";
        cached += 1;
      }
    }

    if (!counts) {
      try {
        counts = await connector.getProfileCounts({ id, username, signal });
        source = "connector";
        if (cache?.set && counts) {
          await cache.set(id, {
            ...counts,
            username,
            fetchedAt: new Date().toISOString(),
            source: connector.id ?? "connector"
          });
        }
      } catch (error) {
        failed += 1;
        errors.push({ id, username, message: error?.message ?? String(error) });
        if (!continueOnError) throw error;
      }
    }

    results.push(decorateProfileCounts(account, counts, {
      source: source ?? "unavailable",
      fetchedAt: counts?.fetchedAt ?? null
    }));

    completed += 1;
    onProgress?.({ completed, total, failed, cached, embedded, accountId: id, username });
  }

  const result = {
    results,
    summary: {
      total,
      completed,
      failed,
      cached,
      embedded,
      available: results.filter(result => result.followRatio).length,
      moreFollowingThanFollowers: results.filter(result => result.followRatio?.moreFollowingThanFollowers).length
    },
    errors
  };

  await notifyProfileEnrichmentComplete(connector, result);
  return result;
}
