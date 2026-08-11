import { makeCoverageUnit } from "../core/coverage.mjs";
import { defineConnector } from "./contract.mjs";
import { AdaptiveRequestClient } from "../runtime/request-client.mjs";

const DEFAULT_APP_ID = "936619743392459";

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function idOf(value) {
  return String(value?.id ?? value?.pk ?? value?.pk_id ?? value?.user_id ?? "");
}

function readCookie(documentRef, name) {
  const cookie = String(documentRef?.cookie ?? "")
    .split("; ")
    .find(part => part.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
}

function normalizeUser(raw) {
  return {
    id: idOf(raw),
    username: raw?.username ?? "",
    fullName: raw?.full_name ?? "",
    isPrivate: Boolean(raw?.is_private),
    isVerified: Boolean(raw?.is_verified),
    profilePicture: raw?.profile_pic_url ?? raw?.profile_pic_url_hd ?? "",
    followerCount: finite(raw?.follower_count ?? raw?.followers_count ?? raw?.edge_followed_by?.count, null),
    followingCount: finite(raw?.following_count ?? raw?.follows_count ?? raw?.edge_follow?.count, null)
  };
}

function normalizePost(raw) {
  const likesHidden = Boolean(raw?.like_and_view_counts_disabled);
  return {
    id: String(raw?.id ?? raw?.pk ?? ""),
    shortcode: raw?.code ?? "",
    timestamp: finite(raw?.taken_at, 0),
    takenAt: finite(raw?.taken_at, 0),
    likeCount: likesHidden ? null : finite(raw?.like_count, null),
    commentCount: finite(raw?.comment_count, null),
    likesHidden,
    commentsDisabled: Boolean(raw?.comments_disabled),
    coverage: raw?.coverage ?? {}
  };
}

function normalizeComment(raw, { parentCommentId = null, isReply = false } = {}) {
  const user = normalizeUser(raw?.user ?? {});
  const id = String(raw?.id ?? raw?.pk ?? `${user.id}:${raw?.created_at ?? ""}:${raw?.text ?? ""}`);
  return {
    id,
    user,
    text: raw?.text ?? "",
    createdAt: raw?.created_at ?? null,
    parentCommentId,
    isReply
  };
}

function mergeUsers(map, users) {
  for (const raw of users ?? []) {
    const user = normalizeUser(raw);
    if (user.id) map.set(user.id, user);
  }
}

function parseProfileCounts(data) {
  for (const raw of [data?.user, data?.data?.user, data?.data, data].filter(Boolean)) {
    const user = normalizeUser(raw);
    if (Number.isFinite(user.followerCount) && Number.isFinite(user.followingCount)) {
      return {
        followers: user.followerCount,
        following: user.followingCount
      };
    }
  }
  return null;
}

export function createInstagramBrowserConnector({
  client = null,
  documentRef = globalThis.document,
  appId = DEFAULT_APP_ID,
  refreshPostCounts = true,
  requestClientOptions = {}
} = {}) {
  const warnings = [];
  const requestClient = client ?? new AdaptiveRequestClient(requestClientOptions);

  function headers() {
    const result = {
      accept: "*/*",
      "x-ig-app-id": appId,
      "x-requested-with": "XMLHttpRequest"
    };
    const csrf = readCookie(documentRef, "csrftoken");
    if (csrf) result["x-csrftoken"] = csrf;
    return result;
  }

  function request(path, options = {}) {
    return requestClient.requestJson(path, {
      headers: { ...headers(), ...(options.headers ?? {}) },
      signal: options.signal ?? null,
      retries: options.retries,
      timeoutMs: options.timeoutMs
    });
  }

  async function getAccountContext() {
    const accountId = readCookie(documentRef, "ds_user_id");
    if (!accountId) {
      throw new Error("No Instagram session user id was found. Log in to instagram.com and refresh the page.");
    }
    return { id: String(accountId), username: null, followerCount: null };
  }

  async function listRelationship(kind, { account, signal, onProgress } = {}) {
    const output = new Map();
    let cursor = null;

    for (let page = 0; page < 5000; page += 1) {
      const query = new URLSearchParams({
        count: "50",
        search_surface: "follow_list_page"
      });
      if (cursor) query.set("max_id", cursor);

      const data = await request(`/api/v1/friendships/${encodeURIComponent(account.id)}/${kind}/?${query}`, { signal });
      const users = Array.isArray(data?.users) ? data.users : [];
      mergeUsers(output, users);
      onProgress?.({ type: "relationship_page", relationship: kind, loaded: output.size, page: page + 1 });

      const next = data?.next_max_id ?? data?.next_max_id_v2 ?? null;
      if (!next || !users.length || String(next) === String(cursor)) break;
      cursor = String(next);
    }

    return [...output.values()];
  }

  async function listFollowers(options = {}) {
    return listRelationship("followers", options);
  }

  async function listFollowing(options = {}) {
    return listRelationship("following", options);
  }

  async function listPosts({ account, limit = 0, signal, onProgress } = {}) {
    const output = [];
    const seen = new Set();
    let cursor = null;
    const numericLimit = Math.max(0, Number(limit) || 0);

    for (let page = 0; page < 5000; page += 1) {
      const query = new URLSearchParams({ count: "12" });
      if (cursor) query.set("max_id", cursor);

      const data = await request(`/api/v1/feed/user/${encodeURIComponent(account.id)}/?${query}`, { signal });
      const items = Array.isArray(data?.items) ? data.items : [];

      for (const raw of items) {
        const post = normalizePost(raw);
        if (!post.id || seen.has(post.id)) continue;
        seen.add(post.id);
        output.push(post);
        if (numericLimit && output.length >= numericLimit) break;
      }

      onProgress?.({ type: "post_page", loaded: output.length, page: page + 1 });
      if (numericLimit && output.length >= numericLimit) break;

      const next = data?.next_max_id ?? data?.next_max_id_v2 ?? null;
      if (!data?.more_available || !next || !items.length || String(next) === String(cursor)) break;
      cursor = String(next);
    }

    return numericLimit ? output.slice(0, numericLimit) : output;
  }

  async function refreshCounts(post, signal) {
    if (!refreshPostCounts) return post;

    try {
      const data = await request(`/api/v1/media/${encodeURIComponent(post.id)}/info/`, {
        signal,
        retries: 0
      });
      const item = Array.isArray(data?.items) ? data.items[0] : null;
      if (!item) return post;
      return {
        ...post,
        ...normalizePost({ ...post, ...item }),
        id: post.id,
        shortcode: item?.code ?? post.shortcode
      };
    } catch (error) {
      warnings.push(`Could not refresh displayed counts for ${post.shortcode || post.id}: ${error.message}`);
      return post;
    }
  }

  async function listLikers(post, signal) {
    const users = new Map();
    let cursor = null;

    for (let page = 0; page < 1000; page += 1) {
      const query = new URLSearchParams({ count: "200" });
      if (cursor) query.set("max_id", cursor);

      const data = await request(`/api/v1/media/${encodeURIComponent(post.id)}/likers/?${query}`, { signal });
      const batch = Array.isArray(data?.users) ? data.users : [];
      mergeUsers(users, batch);

      const next = data?.next_max_id ?? data?.next_max_id_v2 ?? null;
      if (!next || !batch.length || String(next) === String(cursor)) break;
      cursor = String(next);
    }

    if (Number.isFinite(post.likeCount) && users.size < post.likeCount) {
      try {
        const recovery = await request(`/api/v1/media/${encodeURIComponent(post.id)}/likers/?count=1000`, {
          signal,
          retries: 0
        });
        mergeUsers(users, Array.isArray(recovery?.users) ? recovery.users : []);
      } catch (error) {
        warnings.push(`Liker recovery failed for ${post.shortcode || post.id}: ${error.message}`);
      }
    }

    return [...users.values()];
  }

  async function listComments(post, signal) {
    const comments = new Map();
    let cursor = null;
    let cursorParameter = "min_id";

    for (let page = 0; page < 1000; page += 1) {
      const query = new URLSearchParams({
        can_support_threading: "true",
        permalink_enabled: "false"
      });
      if (cursor) query.set(cursorParameter, cursor);

      const data = await request(`/api/v1/media/${encodeURIComponent(post.id)}/comments/?${query}`, { signal });
      const batch = Array.isArray(data?.comments) ? data.comments : [];

      for (const raw of batch) {
        const root = normalizeComment(raw);
        if (root.id) comments.set(root.id, root);
        for (const child of raw?.preview_child_comments ?? []) {
          const reply = normalizeComment(child, { parentCommentId: root.id, isReply: true });
          if (reply.id) comments.set(reply.id, reply);
        }
      }

      const nextMin = data?.next_min_id ?? data?.next_min_id_v2 ?? null;
      const nextMax = data?.next_max_id ?? data?.next_max_id_v2 ?? null;
      const next = nextMin ?? nextMax;
      if (!next || !batch.length || String(next) === String(cursor)) break;
      cursor = String(next);
      cursorParameter = nextMin ? "min_id" : "max_id";
    }

    return [...comments.values()];
  }

  async function collectPostEngagement({ post, includeLikes = true, includeComments = true, signal } = {}) {
    const refreshedPost = await refreshCounts(post, signal);
    let likes = [];
    let comments = [];

    if (includeLikes) likes = await listLikers(refreshedPost, signal);
    if (includeComments) comments = await listComments(refreshedPost, signal);

    const rootComments = comments.filter(comment => !comment.isReply);
    const replies = comments.filter(comment => comment.isReply);
    const uniqueCommenters = new Set(comments.map(comment => comment.user.id).filter(Boolean));

    const coverage = {};
    if (includeLikes) {
      coverage.likes = {
        ...makeCoverageUnit({
          expected: refreshedPost.likeCount,
          returned: likes.length,
          known: !refreshedPost.likesHidden && Number.isFinite(refreshedPost.likeCount),
          modality: "likes"
        }),
        basis: "liker_identities"
      };
    }
    if (includeComments) {
      coverage.comments = {
        ...makeCoverageUnit({
          expected: refreshedPost.commentCount,
          returned: comments.length,
          known: !refreshedPost.commentsDisabled && Number.isFinite(refreshedPost.commentCount),
          modality: "comments"
        }),
        basis: "comment_objects_including_preview_replies",
        rootCommentsReturned: rootComments.length,
        repliesReturned: replies.length,
        uniqueCommentersReturned: uniqueCommenters.size
      };
    }

    return {
      post: refreshedPost,
      likes,
      comments,
      coverage
    };
  }

  async function getProfileCounts({ id, username, signal } = {}) {
    const paths = [];
    if (id) paths.push(`/api/v1/users/${encodeURIComponent(id)}/info/`);
    if (username) paths.push(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`);
    let lastError = null;

    for (const path of paths) {
      try {
        const data = await request(path, { signal, retries: 1 });
        const counts = parseProfileCounts(data);
        if (counts) return counts;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError ?? new Error("Profile follower/following counts are unavailable.");
  }

  async function getDiagnostics() {
    const requestDiagnostics = typeof requestClient.getDiagnostics === "function"
      ? requestClient.getDiagnostics()
      : {};
    return {
      ...requestDiagnostics,
      warnings: [...warnings],
      errors: []
    };
  }

  return defineConnector({
    id: "instagram-browser",
    version: "4.0.0-alpha.1",
    sourceType: "browser",
    capabilities: [
      "account",
      "followers",
      "following",
      "posts",
      "like_identities",
      "comment_identities",
      "profile_counts"
    ],
    methods: {
      getAccountContext,
      listFollowers,
      listFollowing,
      listPosts,
      collectPostEngagement,
      getProfileCounts,
      getDiagnostics
    }
  });
}

export const __test = Object.freeze({
  normalizeUser,
  normalizePost,
  normalizeComment,
  parseProfileCounts,
  readCookie
});
