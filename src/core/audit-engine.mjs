import {
  addAuditError,
  addAuditWarning,
  createAuditRun,
  patchAuditRun,
  updateAuditProgress,
  validateAuditRun
} from "./audit-schema.mjs";
import { summarizeAuditCoverage } from "./coverage.mjs";
import { calculateProfileEngagementMetrics, classifyFollowerObservation } from "./engagement.mjs";
import { assertConnector, requireCapability } from "../connectors/contract.mjs";

const PHASE_ORDER = Object.freeze([
  "followers",
  "following",
  "posts",
  "engagement",
  "scoring",
  "complete"
]);

function phaseIndex(phase) {
  return PHASE_ORDER.indexOf(phase);
}

function phaseAlreadyCompleted(run, phase) {
  const current = phaseIndex(run?.progress?.phase);
  const target = phaseIndex(phase);
  return current > target || run?.progress?.phase === "complete";
}

function userId(user) {
  return String(user?.id ?? user?.pk ?? user?.userId ?? "");
}

function postId(post) {
  return String(post?.id ?? post?.pk ?? "");
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function mergeUnique(existing, incoming, keyFn) {
  const map = new Map();
  for (const item of existing ?? []) {
    const key = keyFn(item);
    if (key) map.set(key, item);
  }
  for (const item of incoming ?? []) {
    const key = keyFn(item);
    if (key) map.set(key, item);
  }
  return [...map.values()];
}

function likeObservationKey(observation) {
  return `${observation?.postId ?? ""}:${observation?.userId ?? ""}`;
}

function commentObservationKey(observation) {
  return String(observation?.id ?? `${observation?.postId ?? ""}:${observation?.userId ?? ""}:${observation?.createdAt ?? ""}:${observation?.text ?? ""}`);
}

function normalizeLikeObservations(post, likes) {
  const id = postId(post);
  return Array.from(likes ?? []).map(user => ({
    postId: id,
    userId: userId(user),
    username: user?.username ?? ""
  })).filter(observation => observation.postId && observation.userId);
}

function normalizeCommentObservations(post, comments) {
  const id = postId(post);
  return Array.from(comments ?? []).map(comment => {
    const user = comment?.user ?? comment;
    return {
      id: String(comment?.id ?? comment?.pk ?? ""),
      postId: id,
      userId: userId(user),
      username: user?.username ?? comment?.username ?? "",
      createdAt: comment?.createdAt ?? comment?.created_at ?? null,
      text: comment?.text ?? "",
      parentCommentId: comment?.parentCommentId ?? comment?.parent_comment_id ?? null,
      isReply: Boolean(comment?.isReply ?? comment?.parentCommentId ?? comment?.parent_comment_id)
    };
  }).filter(observation => observation.postId && observation.userId);
}

function replacePost(posts, replacement) {
  const id = postId(replacement);
  return Array.from(posts ?? []).map(post => postId(post) === id ? replacement : post);
}

function buildClassifications(run) {
  const followingIds = new Set((run.relationships?.following ?? []).map(userId).filter(Boolean));
  const stats = new Map();

  for (const follower of run.relationships?.followers ?? []) {
    const id = userId(follower);
    if (!id) continue;
    stats.set(id, {
      id,
      username: follower?.username ?? "",
      fullName: follower?.fullName ?? follower?.full_name ?? "",
      followsYou: true,
      youFollow: followingIds.has(id),
      likedPosts: new Set(),
      commentedPosts: new Set(),
      commentCount: 0
    });
  }

  for (const like of run.observations?.likes ?? []) {
    const stat = stats.get(String(like.userId));
    if (stat) stat.likedPosts.add(String(like.postId));
  }

  for (const comment of run.observations?.comments ?? []) {
    const stat = stats.get(String(comment.userId));
    if (!stat) continue;
    stat.commentedPosts.add(String(comment.postId));
    stat.commentCount += 1;
  }

  const totalPosts = run.posts?.length ?? 0;
  const confidence = run.coverage?.confidence ?? { level: "low", percent: null, reasons: [] };
  const lowParticipationPercent = Number(run.configuration?.lowParticipationPercent ?? 10);
  const lowEngagedPosts = Number(run.configuration?.lowEngagedPosts ?? 1);

  return [...stats.values()].map(stat => {
    const engaged = new Set([...stat.likedPosts, ...stat.commentedPosts]);
    const comments = stat.commentCount;
    const classification = classifyFollowerObservation({
      likes: stat.likedPosts.size,
      comments,
      engagedPosts: engaged.size,
      totalPosts,
      lowParticipationPercent,
      lowEngagedPosts,
      confidence,
      extraComments: Math.max(0, comments - stat.commentedPosts.size)
    });

    return {
      account: {
        id: stat.id,
        username: stat.username,
        fullName: stat.fullName
      },
      relationship: {
        followsYou: true,
        youFollow: stat.youFollow,
        mutual: stat.youFollow
      },
      ...classification
    };
  });
}

export function createAuditEngine({ connector, checkpointStore = null } = {}) {
  assertConnector(connector);

  async function save(run) {
    if (checkpointStore?.save) await checkpointStore.save(run);
    return run;
  }

  async function emit(run, onProgress) {
    await save(run);
    if (typeof onProgress === "function") onProgress(clone(run.progress), clone(run));
    return run;
  }

  async function runAudit({
    configuration = {},
    resumeRun = null,
    signal = null,
    onProgress = null
  } = {}) {
    requireCapability(connector, "account");

    let run;
    if (resumeRun) {
      const validation = validateAuditRun(resumeRun);
      if (!validation.valid) throw new TypeError(`Cannot resume invalid audit run: ${validation.errors.join(" ")}`);
      run = clone(resumeRun);
    }

    try {
      const account = await connector.getAccountContext({ signal });
      if (!account?.id) throw new Error("Connector did not return an account id.");

      if (!run) {
        run = createAuditRun({
          source: {
            type: connector.sourceType,
            accountId: account.id,
            accountUsername: account.username ?? null,
            connectorVersion: connector.version
          },
          configuration
        });
      } else {
        if (String(run.source?.accountId) !== String(account.id)) {
          throw new Error("Saved audit belongs to a different account and cannot be resumed in this session.");
        }
        run = patchAuditRun(run, {
          source: {
            ...run.source,
            connectorVersion: connector.version,
            accountUsername: account.username ?? run.source.accountUsername
          },
          configuration: { ...run.configuration, ...clone(configuration) }
        });
      }

      if (!phaseAlreadyCompleted(run, "followers")) {
        if (connector.supports("followers")) {
          run = updateAuditProgress(run, { phase: "followers", percent: 2, message: "Loading followers" });
          await emit(run, onProgress);
          const followers = await connector.listFollowers({ account, signal, onProgress });
          run = patchAuditRun(run, {
            relationships: { ...run.relationships, followers: clone(followers ?? []) }
          });
        } else {
          run = addAuditWarning(run, "This connector does not provide follower identities.");
        }
        run = updateAuditProgress(run, { phase: "following", percent: 20, message: "Followers complete" });
        await emit(run, onProgress);
      }

      if (!phaseAlreadyCompleted(run, "following")) {
        if (connector.supports("following")) {
          const following = await connector.listFollowing({ account, signal, onProgress });
          run = patchAuditRun(run, {
            relationships: { ...run.relationships, following: clone(following ?? []) }
          });
        } else {
          run = addAuditWarning(run, "This connector does not provide following identities.");
        }
        run = updateAuditProgress(run, { phase: "posts", percent: 30, message: "Relationships complete" });
        await emit(run, onProgress);
      }

      if (!phaseAlreadyCompleted(run, "posts")) {
        requireCapability(connector, "posts");
        const posts = await connector.listPosts({
          account,
          limit: Number(configuration.postLimit ?? run.configuration?.postLimit ?? 0),
          signal,
          onProgress
        });
        run = patchAuditRun(run, { posts: clone(posts ?? []) });
        run = updateAuditProgress(run, {
          phase: "engagement",
          completedItems: 0,
          completedItemIds: [],
          totalItems: run.posts.length,
          percent: 35,
          message: `${run.posts.length} posts ready`
        });
        await emit(run, onProgress);
      }

      if (!phaseAlreadyCompleted(run, "engagement")) {
        const includeLikes = configuration.likes ?? run.configuration?.likes ?? true;
        const includeComments = configuration.comments ?? run.configuration?.comments ?? true;
        const wantsIdentityEngagement = (
          includeLikes && connector.supports("like_identities") ||
          includeComments && connector.supports("comment_identities")
        );

        if (wantsIdentityEngagement) {
          if (typeof connector.collectPostEngagement !== "function") {
            throw new Error(`Connector ${connector.id} advertises engagement identities but does not implement collectPostEngagement().`);
          }

          const completedIds = new Set((run.progress?.completedItemIds ?? []).map(String));
          const total = run.posts.length;

          for (let index = 0; index < run.posts.length; index += 1) {
            const currentPost = run.posts[index];
            const id = postId(currentPost);
            if (!id || completedIds.has(id)) continue;
            if (signal?.aborted) throw signal.reason ?? new DOMException("Aborted", "AbortError");

            const engagement = await connector.collectPostEngagement({
              account,
              post: clone(currentPost),
              includeLikes,
              includeComments,
              signal,
              onProgress
            });

            const likes = includeLikes ? normalizeLikeObservations(currentPost, engagement?.likes) : [];
            const comments = includeComments ? normalizeCommentObservations(currentPost, engagement?.comments) : [];
            const updatedPost = {
              ...currentPost,
              ...(engagement?.post ?? {}),
              coverage: {
                ...(currentPost.coverage ?? {}),
                ...(engagement?.coverage ?? {})
              }
            };

            run = patchAuditRun(run, {
              posts: replacePost(run.posts, updatedPost),
              observations: {
                likes: mergeUnique(run.observations.likes, likes, likeObservationKey),
                comments: mergeUnique(run.observations.comments, comments, commentObservationKey)
              }
            });

            completedIds.add(id);
            const completedItems = completedIds.size;
            const localPercent = total ? completedItems / total : 1;
            run = updateAuditProgress(run, {
              phase: "engagement",
              completedItems,
              completedItemIds: [...completedIds],
              totalItems: total,
              percent: 35 + localPercent * 60,
              message: `Scanned ${completedItems} / ${total} posts`
            });
            await emit(run, onProgress);
          }
        } else {
          run = addAuditWarning(run, "This connector does not provide per-account engagement identities; follower-level inactivity classifications are unavailable.");
        }

        run = updateAuditProgress(run, {
          phase: "scoring",
          completedItems: run.posts.length,
          completedItemIds: run.posts.map(postId).filter(Boolean),
          totalItems: run.posts.length,
          percent: 96,
          message: "Calculating audit metrics"
        });
        await emit(run, onProgress);
      }

      const enabledModalities = [];
      if ((configuration.likes ?? run.configuration?.likes ?? true) && connector.supports("like_identities")) enabledModalities.push("likes");
      if ((configuration.comments ?? run.configuration?.comments ?? true) && connector.supports("comment_identities")) enabledModalities.push("comments");

      const coverage = enabledModalities.length
        ? summarizeAuditCoverage(run.posts, { enabledModalities })
        : {
            overallPercent: null,
            confidence: {
              level: "low",
              percent: null,
              reasons: ["This connector did not provide identity-level coverage data."]
            },
            diagnostics: []
          };

      const followerCount = Number.isFinite(Number(account.followerCount))
        ? Number(account.followerCount)
        : run.relationships.followers.length;
      const metrics = calculateProfileEngagementMetrics(run.posts, followerCount);

      run = patchAuditRun(run, {
        coverage,
        metrics,
        classifications: connector.supports("followers") ? buildClassifications({ ...run, coverage }) : []
      });

      if (typeof connector.getDiagnostics === "function") {
        const diagnostics = await connector.getDiagnostics();
        run = patchAuditRun(run, {
          diagnostics: {
            ...run.diagnostics,
            ...clone(diagnostics),
            warnings: [
              ...(run.diagnostics?.warnings ?? []),
              ...(diagnostics?.warnings ?? [])
            ],
            errors: [
              ...(run.diagnostics?.errors ?? []),
              ...(diagnostics?.errors ?? [])
            ]
          }
        });
      }

      run = updateAuditProgress(run, {
        phase: "complete",
        completedItems: run.posts.length,
        completedItemIds: run.posts.map(postId).filter(Boolean),
        totalItems: run.posts.length,
        percent: 100,
        message: "Audit complete"
      });
      await emit(run, onProgress);
      return run;
    } catch (error) {
      if (run) {
        if (error?.name === "AbortError") {
          run = patchAuditRun(run, { status: "cancelled" });
        } else {
          run = addAuditError(run, error?.message ?? String(error));
        }
        await save(run);
      }
      throw error;
    }
  }

  return Object.freeze({ runAudit });
}
