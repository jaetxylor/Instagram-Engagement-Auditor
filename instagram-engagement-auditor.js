(() => {
  "use strict";

  /*
   * Instagram Engagement Auditor V3
   * Copyright 2026 @jaetxylor
   * Licensed under Apache-2.0.
   *
   * Read-only browser-session auditor. It does not follow/unfollow, like,
   * comment, DM, or send your Instagram session data to an external server.
   * Instagram's private web endpoints are undocumented and may change.
   */

  const VERSION = "3.0.0";
  const APP_ID = "936619743392459";
  const CACHE_KEY = "iga_v3_profile_count_cache";
  const PHASES = [
    ["followers", "Followers", 0, 15],
    ["following", "Following", 15, 25],
    ["posts", "Posts", 25, 35],
    ["engagement", "Engagement", 35, 96],
    ["scoring", "Scoring", 96, 100]
  ];

  if (!/(^|\.)instagram\.com$/i.test(location.hostname)) {
    alert("Open instagram.com while logged in, then run Instagram Engagement Auditor.");
    return;
  }

  try { window.__IG_ENGAGEMENT_AUDITOR__?.destroy?.(); } catch {}

  const S = {
    host: null,
    shadow: null,
    running: false,
    paused: false,
    cancelled: false,
    ratioRunning: false,
    ratioPaused: false,
    ratioCancelled: false,
    requests: 0,
    me: null,
    followers: new Map(),
    following: new Map(),
    posts: [],
    stats: new Map(),
    other: new Map(),
    enrichment: new Map(),
    warnings: [],
    coverage: null,
    metrics: null,
    tab: "inactiveHigh",
    sortKey: "participation",
    sortDir: "asc",
    settings: {
      postLimit: 0,
      likes: true,
      comments: true,
      refreshCounts: true,
      lowPct: 10,
      lowPosts: 1,
      minDelay: 850,
      maxDelay: 1700,
      longPauseEvery: 14,
      longPauseMin: 6500,
      longPauseMax: 11500
    }
  };

  window.__IG_ENGAGEMENT_AUDITOR__ = S;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rand = (a, b) => Math.floor(a + Math.random() * (Math.max(a, b) - a + 1));
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const num = (v, fallback = null) => Number.isFinite(Number(v)) ? Number(v) : fallback;
  const key = u => String(u?.pk ?? u?.id ?? u?.pk_id ?? "");
  const iso = ts => ts ? new Date(Number(ts) * 1000).toISOString() : "";
  const pct = (v, d = 1) => Number.isFinite(v) ? `${v.toFixed(d)}%` : "—";
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const cookie = name => {
    const p = document.cookie.split("; ").find(x => x.startsWith(`${name}=`));
    return p ? decodeURIComponent(p.slice(name.length + 1)) : null;
  };
  const median = values => {
    const a = values.filter(Number.isFinite).slice().sort((x, y) => x - y);
    if (!a.length) return null;
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  };
  const average = values => {
    const a = values.filter(Number.isFinite);
    return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  };
  const quantile = (a, p) => {
    if (!a.length) return null;
    const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (i - lo);
  };
  const iqrFilter = values => {
    const a = values.filter(Number.isFinite).slice().sort((x, y) => x - y);
    if (a.length < 4) return { kept: a, removed: [] };
    const q1 = quantile(a, .25), q3 = quantile(a, .75), i = q3 - q1;
    const lo = q1 - 1.5 * i, hi = q3 + 1.5 * i;
    const kept = a.filter(v => v >= lo && v <= hi);
    return { kept: kept.length ? kept : a, removed: a.filter(v => v < lo || v > hi) };
  };

  class StopError extends Error {}

  async function coreCheckpoint() {
    if (S.cancelled) throw new StopError("Stopped");
    while (S.paused) {
      await sleep(250);
      if (S.cancelled) throw new StopError("Stopped");
    }
  }

  async function ratioCheckpoint() {
    if (S.ratioCancelled) throw new StopError("Stopped");
    while (S.ratioPaused) {
      await sleep(250);
      if (S.ratioCancelled) throw new StopError("Stopped");
    }
  }

  async function pace(checkpoint = coreCheckpoint) {
    await checkpoint();
    if (S.requests) await sleep(rand(S.settings.minDelay, S.settings.maxDelay));
    if (S.requests && S.requests % S.settings.longPauseEvery === 0) {
      const ms = rand(S.settings.longPauseMin, S.settings.longPauseMax);
      toast(`Cooling down for ${Math.round(ms / 1000)}s…`, "warn");
      await sleep(ms);
    }
    await checkpoint();
  }

  async function getJSON(path, { retries = 2, ratio = false, unpaced = false } = {}) {
    const checkpoint = ratio ? ratioCheckpoint : coreCheckpoint;
    if (!unpaced) await pace(checkpoint);
    const csrf = cookie("csrftoken") || "";
    const headers = { accept: "*/*", "x-ig-app-id": APP_ID, "x-requested-with": "XMLHttpRequest" };
    if (csrf) headers["x-csrftoken"] = csrf;

    let last;
    for (let i = 0; i <= retries; i++) {
      try {
        S.requests++;
        renderRequestCount();
        const res = await fetch(path, { credentials: "include", mode: "cors", headers });
        const text = await res.text();
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch {}
        if (res.ok) return data;
        const msg = data?.message || data?.error_title || text.slice(0, 180) || res.statusText;
        if (res.status === 429 && i < retries) {
          toast("Instagram rate-limited the scan. Cooling down before retrying…", "warn", 6000);
          await sleep(30000);
          continue;
        }
        throw new Error(`${res.status}: ${msg}`);
      } catch (e) {
        last = e;
        if (e instanceof StopError || i >= retries) throw e;
        await sleep(rand(2500, 5500));
      }
    }
    throw last || new Error("Request failed");
  }

  function user(u) {
    return {
      id: key(u),
      username: u?.username || "",
      fullName: u?.full_name || "",
      isPrivate: !!u?.is_private,
      isVerified: !!u?.is_verified,
      pic: u?.profile_pic_url || u?.profile_pic_url_hd || "",
      profileFollowers: num(u?.follower_count ?? u?.followers_count, null),
      profileFollowing: num(u?.following_count ?? u?.follows_count, null)
    };
  }

  function post(p) {
    return {
      pk: String(p?.pk ?? p?.id ?? ""),
      code: p?.code || "",
      date: iso(p?.taken_at),
      timestamp: num(p?.taken_at, 0),
      likeCount: p?.like_and_view_counts_disabled ? null : num(p?.like_count, null),
      commentCount: num(p?.comment_count, null),
      likesHidden: !!p?.like_and_view_counts_disabled,
      commentsDisabled: !!p?.comments_disabled,
      coverage: { likes: null, comments: null }
    };
  }

  function phase(name, detail, local = null) {
    const p = PHASES.find(x => x[0] === name);
    if (!p) return;
    const [_, label, start, end] = p;
    const overall = local == null ? start + (end - start) * .12 : start + (end - start) * clamp(local / 100, 0, 1);
    const i = PHASES.findIndex(x => x[0] === name) + 1;
    $("#phase").textContent = `Phase ${i}/5 · ${label}`;
    $("#phaseDetail").textContent = detail + (local == null ? " · total pages unknown" : "");
    $("#globalPct").textContent = `${Math.round(overall)}%`;
    $("#globalBar span").style.width = `${overall}%`;
    $$(".phase").forEach(x => x.classList.toggle("active", x.dataset.phase === name));
  }

  function phaseDone(name, detail) {
    const p = PHASES.find(x => x[0] === name);
    if (!p) return;
    const el = $(`.phase[data-phase="${name}"]`);
    if (el) el.classList.add("done");
    phase(name, detail, 100);
  }

  async function relationship(kind, id) {
    const out = new Map();
    let max = null;
    for (let page = 0; page < 5000; page++) {
      const q = new URLSearchParams({ count: "50", search_surface: "follow_list_page" });
      if (max) q.set("max_id", max);
      phase(kind, `Loaded ${out.size.toLocaleString()} ${kind}`);
      const d = await getJSON(`/api/v1/friendships/${encodeURIComponent(id)}/${kind}/?${q}`);
      const arr = Array.isArray(d?.users) ? d.users : [];
      arr.forEach(raw => { const u = user(raw); if (u.id) out.set(u.id, u); });
      liveCounts(kind, out.size);
      const next = d?.next_max_id ?? d?.next_max_id_v2 ?? null;
      if (!next || !arr.length || String(next) === String(max)) break;
      max = next;
    }
    return out;
  }

  async function loadPosts(id, limit) {
    const out = [], seen = new Set();
    let max = null;
    for (let page = 0; page < 5000; page++) {
      const q = new URLSearchParams({ count: "12" });
      if (max) q.set("max_id", max);
      phase("posts", `Loaded ${out.length.toLocaleString()} posts`);
      const d = await getJSON(`/api/v1/feed/user/${encodeURIComponent(id)}/?${q}`);
      const arr = Array.isArray(d?.items) ? d.items : [];
      for (const raw of arr) {
        const p = post(raw);
        if (p.pk && !seen.has(p.pk)) { seen.add(p.pk); out.push(p); }
        if (limit && out.length >= limit) break;
      }
      liveCounts("posts", out.length);
      if (limit && out.length >= limit) break;
      const next = d?.next_max_id ?? d?.next_max_id_v2 ?? null;
      if (!d?.more_available || !next || !arr.length || String(next) === String(max)) break;
      max = next;
    }
    return limit ? out.slice(0, limit) : out;
  }

  async function refreshCounts(p) {
    if (!S.settings.refreshCounts) return;
    try {
      const d = await getJSON(`/api/v1/media/${encodeURIComponent(p.pk)}/info/`, { retries: 0 });
      const x = Array.isArray(d?.items) ? d.items[0] : null;
      if (!x) return;
      p.likesHidden = !!x.like_and_view_counts_disabled;
      p.likeCount = p.likesHidden ? null : num(x.like_count, p.likeCount);
      p.commentCount = num(x.comment_count, p.commentCount);
      p.commentsDisabled = !!(x.comments_disabled ?? p.commentsDisabled);
    } catch (e) {
      S.warnings.push(`Could not refresh displayed counts for ${p.code || p.pk}: ${e.message}`);
    }
  }

  function coverage(expected, returned, known = true) {
    if (!known || !Number.isFinite(expected)) return { known: false, expected, returned, pct: null };
    const p = expected === 0 ? 100 : clamp((returned / expected) * 100, 0, 100);
    return { known: true, expected, returned, pct: p, missing: Math.max(0, expected - returned) };
  }

  async function likers(p) {
    const out = new Map();
    let max = null;
    for (let page = 0; page < 1000; page++) {
      const q = new URLSearchParams({ count: "200" });
      if (max) q.set("max_id", max);
      const d = await getJSON(`/api/v1/media/${encodeURIComponent(p.pk)}/likers/?${q}`);
      const arr = Array.isArray(d?.users) ? d.users : [];
      arr.forEach(raw => { const u = user(raw); if (u.id) out.set(u.id, u); });
      const next = d?.next_max_id ?? d?.next_max_id_v2 ?? null;
      if (!next || !arr.length || String(next) === String(max)) break;
      max = next;
    }
    p.coverage.likes = coverage(p.likeCount, out.size, !p.likesHidden);
    return [...out.values()];
  }

  async function comments(p) {
    const out = [], seen = new Set();
    let cur = null, param = "min_id";
    for (let page = 0; page < 1000; page++) {
      const q = new URLSearchParams({ can_support_threading: "true", permalink_enabled: "false" });
      if (cur) q.set(param, cur);
      const d = await getJSON(`/api/v1/media/${encodeURIComponent(p.pk)}/comments/?${q}`);
      const arr = Array.isArray(d?.comments) ? d.comments : [];
      const add = c => {
        const id = String(c?.pk ?? c?.id ?? `${key(c?.user)}:${c?.created_at ?? ""}:${c?.text ?? ""}`);
        if (!seen.has(id)) { seen.add(id); out.push(c); }
      };
      arr.forEach(c => { add(c); (c?.preview_child_comments || []).forEach(add); });
      const min = d?.next_min_id ?? d?.next_min_id_v2 ?? null;
      const max = d?.next_max_id ?? d?.next_max_id_v2 ?? null;
      const next = min || max;
      if (!next || !arr.length || String(next) === String(cur)) break;
      cur = next; param = min ? "min_id" : "max_id";
    }
    p.coverage.comments = coverage(p.commentCount, out.length, !p.commentsDisabled);
    return out;
  }

  function initStats() {
    S.stats.clear();
    S.other.clear();
    for (const [id, u] of S.followers) {
      S.stats.set(id, {
        ...u,
        followsYou: true,
        youFollow: S.following.has(id),
        mutual: S.following.has(id),
        likes: 0,
        comments: 0,
        liked: new Set(),
        commented: new Set(),
        engaged: new Set(),
        last: ""
      });
    }
  }

  function statFor(u) {
    if (S.stats.has(u.id)) return S.stats.get(u.id);
    if (!u.id || S.followers.has(u.id)) return null;
    if (!S.other.has(u.id)) {
      S.other.set(u.id, {
        ...u,
        followsYou: false,
        youFollow: S.following.has(u.id),
        mutual: false,
        likes: 0,
        comments: 0,
        liked: new Set(),
        commented: new Set(),
        engaged: new Set(),
        last: ""
      });
    }
    return S.other.get(u.id);
  }

  function touch(st, p, type) {
    if (!st) return;
    if (type === "like") { st.likes++; st.liked.add(p.pk); }
    else { st.comments++; st.commented.add(p.pk); }
    st.engaged.add(p.pk);
    if (!st.last || p.date > st.last) st.last = p.date;
  }

  async function scanPost(p, i, total) {
    phase("engagement", `Scanning post ${i + 1}/${total}${p.code ? ` · ${p.code}` : ""}`, Math.round(i / total * 100));
    await refreshCounts(p);
    if (S.settings.likes) {
      try { (await likers(p)).forEach(u => touch(statFor(u), p, "like")); }
      catch (e) { S.warnings.push(`Likes failed for ${p.code || p.pk}: ${e.message}`); p.coverage.likes = { known:false, expected:p.likeCount, returned:0, pct:null }; }
    }
    if (S.settings.comments) {
      try {
        (await comments(p)).forEach(c => { const u = user(c?.user || {}); if (u.id) touch(statFor(u), p, "comment"); });
      } catch (e) { S.warnings.push(`Comments failed for ${p.code || p.pk}: ${e.message}`); p.coverage.comments = { known:false, expected:p.commentCount, returned:0, pct:null }; }
    }
    phase("engagement", `Completed post ${i + 1}/${total}`, Math.round((i + 1) / total * 100));
    computeCoverage();
    renderSummary();
    renderMetrics();
  }

  function computeCoverage() {
    let expected = 0, returned = 0, known = 0, high = 0, evaluable = 0, incomplete = 0;
    const diagnostics = S.posts.map(p => {
      const rs = [];
      if (S.settings.likes && p.coverage.likes) rs.push(p.coverage.likes);
      if (S.settings.comments && p.coverage.comments) rs.push(p.coverage.comments);
      const ks = rs.filter(r => r.known && Number.isFinite(r.expected));
      ks.forEach(r => { expected += r.expected; returned += Math.min(r.expected, r.returned); known++; });
      const allKnown = rs.length > 0 && ks.length === rs.length;
      const combined = allKnown ? average(ks.map(r => r.pct)) : null;
      if (allKnown) {
        evaluable++;
        if (combined >= 90) high++;
        if (combined < 99.999) incomplete++;
      }
      return { post:p, combined };
    });
    const overall = known ? (expected === 0 ? 100 : clamp(returned / expected * 100, 0, 100)) : null;
    const highPct = evaluable ? high / evaluable * 100 : null;
    const level = Number.isFinite(overall) && Number.isFinite(highPct) && overall >= 95 && highPct >= 90 ? "high" :
      Number.isFinite(overall) && Number.isFinite(highPct) && overall >= 80 && highPct >= 70 ? "medium" : "low";
    S.coverage = { expected, returned, overall, high, evaluable, highPct, incomplete, level, diagnostics };
    return S.coverage;
  }

  function confidence() {
    const c = S.coverage || computeCoverage();
    return c.level === "high" ? { level:"high", label:"High confidence", pct:c.overall } :
      c.level === "medium" ? { level:"medium", label:"Medium confidence", pct:c.overall } :
      { level:"low", label:"Low confidence", pct:c.overall };
  }

  function computeMetrics() {
    const followers = S.followers.size;
    if (!followers || !S.posts.length) return S.metrics = null;
    const sorted = S.posts.slice().sort((a,b) => b.timestamp - a.timestamp);
    const er = p => Number.isFinite(p.likeCount) && Number.isFinite(p.commentCount) ? (p.likeCount + p.commentCount) / followers * 100 : null;
    const recent = sorted.slice(0,12), recentER = recent.map(er).filter(Number.isFinite), f = iqrFilter(recentER);
    const usable = sorted.filter(p => Number.isFinite(p.likeCount) && Number.isFinite(p.commentCount));
    const totalInteractions = usable.reduce((n,p) => n + p.likeCount + p.commentCount, 0);
    S.metrics = {
      profileER: median(f.kept),
      all: usable.length ? totalInteractions / (followers * usable.length) * 100 : null,
      avgLikes: average(recent.map(p => p.likeCount)),
      avgComments: average(recent.map(p => p.commentCount)),
      outliers: f.removed.length,
      recent: recent.length,
      usableRecent: recentER.length
    };
    return S.metrics;
  }

  function cacheLoad() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch { return {}; }
  }
  function cacheGet(u) {
    const c = cacheLoad()[u.id];
    if (!c || Date.now() - c.fetchedAt > 7 * 86400000) return null;
    return c;
  }
  function cachePut(r) {
    const c = cacheLoad(); c[r.id] = r; localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  }

  function parseCounts(d) {
    for (const u of [d?.user, d?.data?.user, d?.data, d].filter(Boolean)) {
      const followers = num(u?.follower_count ?? u?.followers_count ?? u?.edge_followed_by?.count, null);
      const following = num(u?.following_count ?? u?.follows_count ?? u?.edge_follow?.count, null);
      if (Number.isFinite(followers) && Number.isFinite(following)) return { followers, following };
    }
    return null;
  }

  async function enrich(u) {
    if (S.enrichment.has(u.id)) return S.enrichment.get(u.id);
    const cached = cacheGet(u);
    if (cached) { S.enrichment.set(u.id, cached); return cached; }
    if (Number.isFinite(u.profileFollowers) && Number.isFinite(u.profileFollowing)) {
      const r = { id:u.id, username:u.username, followers:u.profileFollowers, following:u.profileFollowing, fetchedAt:Date.now(), source:"relationship" };
      S.enrichment.set(u.id, r); cachePut(r); return r;
    }
    const paths = [`/api/v1/users/${encodeURIComponent(u.id)}/info/`, `/api/v1/users/web_profile_info/?username=${encodeURIComponent(u.username)}`];
    let last;
    for (const path of paths) {
      try {
        const d = await getJSON(path, { retries:1, ratio:true });
        const c = parseCounts(d);
        if (c) {
          const r = { id:u.id, username:u.username, ...c, fetchedAt:Date.now(), source:path.includes("web_profile") ? "web_profile_info" : "user_info" };
          S.enrichment.set(u.id, r); cachePut(r); return r;
        }
      } catch (e) { last = e; }
    }
    throw last || new Error("Profile counts unavailable");
  }

  function profile(row) {
    const r = S.enrichment.get(row.id) || cacheGet(row);
    const followers = num(r?.followers ?? row.profileFollowers, null);
    const following = num(r?.following ?? row.profileFollowing, null);
    const ok = Number.isFinite(followers) && Number.isFinite(following);
    return {
      ...row,
      profileFollowers: followers,
      profileFollowing: following,
      profileAvailable: ok,
      followingToFollowers: ok && followers > 0 ? following / followers : null,
      deltaFollowing: ok ? following - followers : null,
      moreFollowing: ok ? following > followers : false
    };
  }

  function row(st) {
    const total = Math.max(1, S.posts.length), engaged = st.engaged.size;
    const participation = engaged / total * 100;
    const c = confidence();
    const none = st.likes === 0 && st.comments === 0;
    const low = !none && (participation < S.settings.lowPct || engaged <= S.settings.lowPosts);
    let statusKey, status;
    if (none && c.level === "high") [statusKey,status] = ["inactiveHigh","High-confidence inactive"];
    else if (none && c.level === "medium") [statusKey,status] = ["inactiveLikely","Likely inactive"];
    else if (none) [statusKey,status] = ["uncertain","Uncertain · no observed engagement"];
    else if (low) [statusKey,status] = ["low","Low observed engagement"];
    else [statusKey,status] = ["active","Active"];
    return profile({
      id:st.id, username:st.username, fullName:st.fullName, pic:st.pic,
      followsYou:st.followsYou, youFollow:st.youFollow, mutual:st.mutual,
      likes:st.likes, comments:st.comments, likedPosts:st.liked.size, commentedPosts:st.commented.size,
      engagedPosts:engaged, participation, score:st.liked.size + st.commented.size * 3,
      last:st.last, confidence:c.label, confidenceLevel:c.level, confidencePct:c.pct,
      statusKey, status, profileFollowers:st.profileFollowers, profileFollowing:st.profileFollowing
    });
  }

  function allFollowerRows() { return [...S.stats.values()].map(row); }

  function relationRow(u, status) {
    return profile({
      ...u, followsYou:status !== "Does not follow you", youFollow:status !== "Follower only", mutual:false,
      likes:0, comments:0, likedPosts:0, commentedPosts:0, engagedPosts:0, participation:0, score:0, last:"",
      confidence:"N/A", confidenceLevel:"na", confidencePct:null, status, statusKey:"relationship"
    });
  }

  function rows(tab = S.tab) {
    const f = allFollowerRows();
    if (tab === "inactiveHigh") return f.filter(x => x.statusKey === "inactiveHigh");
    if (tab === "inactiveLikely") return f.filter(x => x.statusKey === "inactiveLikely");
    if (tab === "uncertain") return f.filter(x => x.statusKey === "uncertain");
    if (tab === "low") return f.filter(x => x.statusKey === "low");
    if (tab === "active") return f.filter(x => x.statusKey === "active");
    if (tab === "all") return f;
    if (tab === "nonfollowers") return [...S.following.values()].filter(u => !S.followers.has(u.id)).map(u => relationRow(u, "Does not follow you"));
    if (tab === "fans") return [...S.followers.values()].filter(u => !S.following.has(u.id)).map(u => S.stats.has(u.id) ? row(S.stats.get(u.id)) : relationRow(u,"Follower only"));
    if (tab === "other") return [...S.other.values()].map(row);
    if (tab === "ratioHigher") return [...S.following.values()].map(u => {
      const st = S.stats.get(u.id); return st ? row(st) : relationRow(u, S.followers.has(u.id) ? "Follower" : "Does not follow you");
    }).filter(x => x.moreFollowing);
    return f;
  }

  function filteredRows() {
    let out = rows();
    const q = ($("#search")?.value || "").trim().toLowerCase();
    const mutual = !!$("#mutualOnly")?.checked;
    if (q) out = out.filter(x => x.username.toLowerCase().includes(q) || x.fullName.toLowerCase().includes(q));
    if (mutual) out = out.filter(x => x.mutual);
    out.sort((a,b) => {
      const av = a[S.sortKey], bv = b[S.sortKey];
      const n = typeof av === "number" && typeof bv === "number" ? av - bv : String(av ?? "").localeCompare(String(bv ?? ""));
      return S.sortDir === "asc" ? n : -n;
    });
    return out;
  }

  function ratioCandidates(scope) {
    let base;
    if (scope === "allFollowing") base = [...S.following.values()].map(u => relationRow(u, S.followers.has(u.id) ? "Follower" : "Does not follow you"));
    else if (scope === "current") base = filteredRows();
    else base = rows(scope);
    const seen = new Set(), out = [];
    for (const r of base) {
      if (!S.following.has(r.id) || seen.has(r.id)) continue;
      seen.add(r.id); out.push(S.following.get(r.id) || r);
    }
    return out;
  }

  async function runRatio() {
    if (S.running || S.ratioRunning || !S.following.size) return toast("Finish the core audit first.", "warn");
    const scope = $("#ratioScope").value;
    const list = ratioCandidates(scope);
    if (!list.length) return toast("No followed accounts in this scope.", "warn");
    S.ratioRunning = true; S.ratioCancelled = false; S.ratioPaused = false;
    ratioControls();
    let failed = 0, cached = 0;
    for (let i = 0; i < list.length; i++) {
      try {
        await ratioCheckpoint();
        const u = list[i];
        if (S.enrichment.has(u.id) || cacheGet(u) || (Number.isFinite(u.profileFollowers) && Number.isFinite(u.profileFollowing))) cached++;
        try { await enrich(u); } catch { failed++; }
        const done = i + 1, p = done / list.length * 100;
        $("#ratioBar span").style.width = `${p}%`;
        $("#ratioPct").textContent = `${Math.round(p)}%`;
        $("#ratioStatus").textContent = `${done.toLocaleString()} / ${list.length.toLocaleString()} profiles · ${failed} failed · ${cached} cached`;
        if (done % 5 === 0 || done === list.length) renderAll();
      } catch (e) {
        if (!(e instanceof StopError)) S.warnings.push(`Ratio scan: ${e.message}`);
        break;
      }
    }
    S.ratioRunning = false; S.ratioPaused = false; S.ratioCancelled = false;
    ratioControls(); renderAll();
    toast(`Ratio analysis finished. ${rows("ratioHigher").length.toLocaleString()} followed accounts have Following > Followers.`, "ok", 6500);
  }

  function ratioControls() {
    $("#ratioRun").disabled = S.ratioRunning || S.running;
    $("#ratioPause").disabled = !S.ratioRunning;
    $("#ratioStop").disabled = !S.ratioRunning;
    $("#ratioScope").disabled = S.ratioRunning;
  }

  function readSettings() {
    S.settings.postLimit = Math.max(0, Number($("#postLimit").value || 0));
    S.settings.likes = $("#scanLikes").checked;
    S.settings.comments = $("#scanComments").checked;
    S.settings.refreshCounts = $("#refreshCounts").checked;
    S.settings.lowPct = clamp(Number($("#lowPct").value || 10),0,100);
    S.settings.lowPosts = Math.max(0, Number($("#lowPosts").value || 1));
  }

  async function run() {
    if (S.running) return;
    readSettings();
    if (!S.settings.likes && !S.settings.comments) return toast("Enable Likes, Comments, or both.", "warn");
    reset(); S.running = true; controls();
    try {
      const id = cookie("ds_user_id");
      if (!id) throw new Error("No Instagram session user ID found. Log in and refresh Instagram.");
      S.me = { id:String(id) };
      phase("followers","Starting follower scan…");
      S.followers = await relationship("followers", id); phaseDone("followers",`${S.followers.size.toLocaleString()} followers loaded`);
      phase("following","Starting following scan…");
      S.following = await relationship("following", id); phaseDone("following",`${S.following.size.toLocaleString()} following loaded`);
      phase("posts","Loading posts…");
      S.posts = await loadPosts(id, S.settings.postLimit);
      if (!S.posts.length) throw new Error("No posts were returned for this account.");
      phaseDone("posts",`${S.posts.length} posts loaded`);
      initStats(); computeCoverage(); computeMetrics(); renderSummary(); renderMetrics();
      phase("engagement",`Preparing ${S.posts.length} posts…`,0);
      for (let i=0;i<S.posts.length;i++) await scanPost(S.posts[i],i,S.posts.length);
      phaseDone("engagement",`${S.posts.length} posts scanned`);
      phase("scoring","Calculating confidence and metrics…",30);
      computeCoverage(); computeMetrics();
      phase("scoring","Rendering final audit…",75); renderAll();
      phaseDone("scoring","Audit complete");
      S.running = false; controls(); $("#results").classList.remove("hidden"); $("#ratioCard").classList.remove("hidden"); renderAll();
      toast("Audit complete.","ok",5000);
    } catch (e) {
      S.running = false; controls();
      if (!(e instanceof StopError)) { S.warnings.push(e.message); renderWarnings(); toast(e.message,"err",8000); }
      else toast("Scan stopped.","warn");
    }
  }

  function reset() {
    S.cancelled=false; S.paused=false; S.requests=0; S.followers=new Map(); S.following=new Map(); S.posts=[]; S.stats=new Map(); S.other=new Map(); S.warnings=[]; S.coverage=null; S.metrics=null;
    $$(".phase").forEach(x=>x.classList.remove("active","done"));
    $("#globalBar span").style.width="0%"; $("#globalPct").textContent="0%"; $("#phase").textContent="Phase 1/5 · Followers"; $("#phaseDetail").textContent="Ready";
    $("#results").classList.add("hidden"); $("#ratioCard").classList.add("hidden"); renderSummary(); renderRequestCount();
  }

  function controls() {
    $("#start").disabled = S.running;
    $("#pause").disabled = !S.running;
    $("#stop").disabled = !S.running;
    $$('[data-lock]').forEach(x => x.disabled = S.running);
    ratioControls();
  }

  function liveCounts(kind,n) {
    if (kind === "followers") $("#followers").textContent=n.toLocaleString();
    if (kind === "following") $("#following").textContent=n.toLocaleString();
    if (kind === "posts") $("#posts").textContent=n.toLocaleString();
  }

  function renderRequestCount() { if ($("#requests")) $("#requests").textContent=S.requests.toLocaleString(); }

  function renderSummary() {
    $("#followers").textContent=S.followers.size.toLocaleString(); $("#following").textContent=S.following.size.toLocaleString(); $("#posts").textContent=S.posts.length.toLocaleString();
    $("#mutuals").textContent=(S.followers.size&&S.following.size?[...S.followers.keys()].filter(id=>S.following.has(id)).length:0).toLocaleString();
    const f=S.stats.size?allFollowerRows():[];
    $("#inactive").textContent=f.filter(x=>x.statusKey==="inactiveHigh").length.toLocaleString();
    $("#uncertain").textContent=f.filter(x=>x.statusKey==="uncertain").length.toLocaleString();
    $("#coverage").textContent=Number.isFinite(S.coverage?.overall)?pct(S.coverage.overall):"—";
  }

  function renderMetrics() {
    computeMetrics(); const m=S.metrics;
    $("#profileER").textContent=Number.isFinite(m?.profileER)?pct(m.profileER,2):"—";
    $("#allER").textContent=Number.isFinite(m?.all)?pct(m.all,2):"—";
    $("#avgLikes").textContent=Number.isFinite(m?.avgLikes)?Math.round(m.avgLikes).toLocaleString():"—";
    $("#avgComments").textContent=Number.isFinite(m?.avgComments)?m.avgComments.toFixed(1):"—";
    $("#outliers").textContent=m?`${m.outliers} removed`:"—";
    $("#metricNote").textContent=m?`Recent ${m.recent} posts · ${m.usableRecent} usable ER values · transparent 1.5×IQR outlier filter`:"Waiting for post data.";
  }

  function renderTabs() {
    const tabs=["inactiveHigh","inactiveLikely","uncertain","low","active","all","nonfollowers","fans","other","ratioHigher"];
    tabs.forEach(t=>{ const b=$(`.tab[data-tab="${t}"]`); if(!b)return; b.classList.toggle("active",S.tab===t); b.querySelector("b").textContent=rows(t).length.toLocaleString(); });
  }

  function renderTable() {
    const body=$("#tbody"), out=filteredRows(); $("#resultCount").textContent=`${out.length.toLocaleString()} accounts`; body.innerHTML="";
    for(const r of out){
      const tr=document.createElement("tr");
      tr.innerHTML=`
        <td class="person">${r.pic?`<img src="${esc(r.pic)}">`:`<i>${esc((r.username||"?")[0].toUpperCase())}</i>`}<div><a href="/${encodeURIComponent(r.username)}/" target="_blank">@${esc(r.username)}</a><small>${esc(r.fullName)}</small></div></td>
        <td>${r.mutual?"Mutual":r.followsYou?"Follower":"Not following"}</td>
        <td class="n">${r.likes}</td><td class="n">${r.comments}</td><td class="n">${r.engagedPosts}/${S.posts.length}</td><td class="n">${pct(r.participation)}</td>
        <td class="n">${r.score}</td><td>${r.last?new Date(r.last).toLocaleDateString():"—"}</td>
        <td class="n">${Number.isFinite(r.profileFollowers)?r.profileFollowers.toLocaleString():"—"}</td><td class="n">${Number.isFinite(r.profileFollowing)?r.profileFollowing.toLocaleString():"—"}</td>
        <td class="n">${Number.isFinite(r.followingToFollowers)?r.followingToFollowers.toFixed(2)+"×":(r.profileAvailable&&r.profileFollowers===0&&r.profileFollowing>0?"∞":"—")}</td>
        <td class="n">${Number.isFinite(r.deltaFollowing)?(r.deltaFollowing>0?"+":"")+r.deltaFollowing.toLocaleString():"—"}</td>
        <td>${esc(r.confidence)}${Number.isFinite(r.confidencePct)?` · ${r.confidencePct.toFixed(0)}%`:""}</td><td>${esc(r.status)}</td>`;
      body.appendChild(tr);
    }
  }

  function renderCoverage() {
    const c=S.coverage||computeCoverage(), body=$("#coverageBody"); body.innerHTML="";
    c.diagnostics.forEach((d,i)=>{
      const p=d.post,l=p.coverage.likes,m=p.coverage.comments,tr=document.createElement("tr");
      tr.innerHTML=`<td>${i+1}</td><td>${p.code?`<a target="_blank" href="/p/${encodeURIComponent(p.code)}/">${esc(p.code)}</a>`:esc(p.pk)}</td><td>${p.date?new Date(p.date).toLocaleDateString():"—"}</td><td class="n">${Number.isFinite(p.likeCount)?p.likeCount.toLocaleString():"—"}</td><td class="n">${l?.returned??"—"}</td><td class="n">${pct(l?.pct)}</td><td class="n">${Number.isFinite(p.commentCount)?p.commentCount.toLocaleString():"—"}</td><td class="n">${m?.returned??"—"}</td><td class="n">${pct(m?.pct)}</td><td class="n">${pct(d.combined)}</td>`;
      body.appendChild(tr);
    });
    $("#coverageNote").textContent=`Overall identity coverage: ${pct(c.overall)} · ${c.high}/${c.evaluable} evaluable posts at ≥90% coverage · confidence ${c.level.toUpperCase()}`;
  }

  function renderWarnings() {
    const box=$("#warnings"), list=$("#warningList"), w=[...S.warnings];
    if(S.coverage?.incomplete) w.push(`${S.coverage.incomplete} post(s) have incomplete identity coverage. Missing identities are not treated as proof of inactivity.`);
    if(S.coverage?.level==="low") w.push("Identity coverage confidence is LOW. Treat the Uncertain tab as unknown rather than inactive.");
    box.classList.toggle("hidden",!w.length); list.innerHTML=w.map(x=>`<li>${esc(x)}</li>`).join("");
  }

  function renderRatioStats() {
    const enriched=[...S.following.values()].map(u=>profile(u)).filter(x=>x.profileAvailable);
    $("#ratioAnalyzed").textContent=enriched.length.toLocaleString(); $("#ratioHigher").textContent=enriched.filter(x=>x.moreFollowing).length.toLocaleString();
    const scope=$("#ratioScope")?.value||"current", list=S.following.size?ratioCandidates(scope):[];
    $("#ratioEstimate").textContent=S.following.size?`${list.length.toLocaleString()} followed accounts in scope. Cached counts are reused for 7 days.`:"Run the core audit first.";
  }

  function renderAll(){ computeCoverage(); renderSummary(); renderMetrics(); renderTabs(); renderTable(); renderCoverage(); renderWarnings(); renderRatioStats(); }

  function csvEscape(v){ const s=String(v??""); return /[",\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; }
  function download(name,text,type){ const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000); }

  function exportCSV(){
    const h=["id","username","full_name","follows_you","you_follow","mutual","observed_likes","observed_comments","engaged_posts","observed_participation_pct","score","last_observed","profile_followers","profile_following","following_to_followers_ratio","following_minus_followers","data_confidence","classification"];
    const lines=filteredRows().map(r=>[r.id,r.username,r.fullName,r.followsYou,r.youFollow,r.mutual,r.likes,r.comments,r.engagedPosts,r.participation.toFixed(2),r.score,r.last,r.profileFollowers??"",r.profileFollowing??"",Number.isFinite(r.followingToFollowers)?r.followingToFollowers.toFixed(4):"",r.deltaFollowing??"",r.confidence,r.status].map(csvEscape).join(","));
    download(`instagram-engagement-audit-v3-${S.tab}.csv`,[h.join(","),...lines].join("\n"),"text/csv;charset=utf-8");
  }

  function exportJSON(){
    const payload={
      meta:{tool:"Instagram Engagement Auditor",version:VERSION,creator:"@jaetxylor",exportedAt:new Date().toISOString(),requests:S.requests,methodology:{engagementRate:"Profile engagement-rate estimate: per-post (likes+comments)/followers*100; up to 12 recent posts; transparent 1.5xIQR outlier filter; median of remaining values.",inactivity:"Zero observed interactions are classified according to identity-response coverage confidence.",profileRatio:"Optional enrichment compares profile following with profile followers for accounts you follow."}},
      profileMetrics:S.metrics,coverage:S.coverage,relationships:{followers:S.followers.size,following:S.following.size,mutuals:[...S.followers.keys()].filter(id=>S.following.has(id)).length},posts:S.posts,followers:allFollowerRows(),followingHigherThanFollowers:rows("ratioHigher"),currentView:filteredRows(),warnings:S.warnings
    };
    download("instagram-engagement-audit-v3.json",JSON.stringify(payload,null,2),"application/json;charset=utf-8");
  }

  async function copyNames(){ await navigator.clipboard.writeText(filteredRows().map(x=>x.username).join("\n")); toast("Usernames copied.","ok"); }

  function toast(msg,type="info",duration=3500){ const d=document.createElement("div");d.className=`toast ${type}`;d.textContent=msg;$("#toasts").appendChild(d);setTimeout(()=>d.remove(),duration); }
  function $(q){ return S.shadow?.querySelector(q)||null; }
  function $$(q){ return [...(S.shadow?.querySelectorAll(q)||[])]; }

  function build(){
    S.host=document.createElement("div");S.host.style.cssText="position:fixed;inset:0;z-index:2147483647";document.documentElement.appendChild(S.host);S.shadow=S.host.attachShadow({mode:"open"});
    S.shadow.innerHTML=`<style>
      *{box-sizing:border-box}button,input,select{font:inherit}button{cursor:pointer}.app{position:fixed;inset:0;overflow:auto;background:#0b0d11;color:#f5f7fb;font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}.shell{max-width:1550px;margin:auto;padding:18px}.top{position:sticky;top:0;z-index:20;margin:-18px -18px 18px;padding:12px 18px;display:flex;justify-content:space-between;align-items:center;background:#0b0d11e8;border-bottom:1px solid #ffffff18;backdrop-filter:blur(14px)}h1,h2{margin:0}.sub,small{color:#8d96a4}.credit a,a{color:#d4b5ff}.grid{display:grid;grid-template-columns:320px 1fr;gap:16px}.card{background:#14171dcc;border:1px solid #ffffff16;border-radius:14px;overflow:hidden}.pad{padding:15px}.side{position:sticky;top:74px}.field{display:grid;gap:5px;margin:11px 0}.field label{font-size:12px;font-weight:700}.row{display:flex;gap:10px;align-items:center}.check{display:flex;align-items:center;gap:6px}input,select{background:#0e1116;color:#fff;border:1px solid #ffffff1c;border-radius:8px;padding:8px}input[type=checkbox]{accent-color:#d946ef}.btn{background:#1a1e26;color:#fff;border:1px solid #ffffff20;border-radius:9px;padding:8px 11px;font-weight:700}.btn.primary{background:linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045);border:0}.btn:disabled{opacity:.4;cursor:not-allowed}.actions{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:12px}.actions .primary{grid-column:1/-1}.main{display:grid;gap:16px}.hero,.analytics,.ratio{padding:16px}.stats,.metrics{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-top:14px}.stats div,.metrics div{padding:10px;background:#0e1116;border:1px solid #ffffff12;border-radius:10px}.stats span,.metrics span{display:block;color:#808997;font-size:10px;text-transform:uppercase}.stats strong,.metrics strong{font-size:20px}.phases{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:14px}.phase{padding:8px;border:1px solid #ffffff12;border-radius:8px;color:#77808e}.phase.active{color:#fff;border-color:#d946ef66}.phase.done{color:#91e3a8;border-color:#43d27544}.bar{height:8px;background:#080a0e;border-radius:99px;overflow:hidden;margin-top:10px}.bar span{display:block;height:100%;width:0;background:linear-gradient(90deg,#833ab4,#fd1d1d,#fcb045);transition:.2s}.status{display:flex;justify-content:space-between;color:#8d96a4;font-size:12px;margin-top:7px}.method,.note{margin-top:10px;padding:9px;background:#0e1116;border:1px solid #ffffff12;border-radius:8px;color:#8d96a4;font-size:11px}.tabs,.toolbar{display:flex;gap:6px;flex-wrap:wrap;padding:11px;border-bottom:1px solid #ffffff12}.tab{border:1px solid #ffffff16;background:#0e1116;color:#a8b0bb;border-radius:999px;padding:6px 9px;font-size:11px}.tab.active{color:#fff;background:#d946ef18;border-color:#d946ef66}.toolbar input[type=text]{flex:1;min-width:220px}.table{overflow:auto;max-height:62vh}table{width:100%;min-width:1350px;border-collapse:collapse}th,td{padding:9px 10px;border-bottom:1px solid #ffffff10;white-space:nowrap}th{position:sticky;top:0;background:#11151b;color:#8992a0;font-size:10px;text-transform:uppercase;cursor:pointer}.n{text-align:right}.person{display:flex;align-items:center;gap:8px}.person img,.person i{width:32px;height:32px;border-radius:50%;object-fit:cover;background:#252a34;display:grid;place-items:center}.person div{display:grid}.person a{color:#fff;font-weight:700;text-decoration:none}.warnings{padding:12px;background:#facc1510;color:#dccb7a}.hidden{display:none!important}.ratioGrid{display:grid;grid-template-columns:1fr auto auto auto;gap:8px;align-items:end}.toast{padding:10px 12px;border:1px solid #ffffff22;border-radius:9px;background:#1a1e26}.toast.ok{border-color:#43d27555}.toast.warn{border-color:#facc1555}.toast.err{border-color:#ff565655}#toasts{position:fixed;right:16px;bottom:16px;display:grid;gap:7px;z-index:50;width:min(400px,calc(100vw - 32px))}@media(max-width:1050px){.grid{grid-template-columns:1fr}.side{position:static}.stats,.metrics{grid-template-columns:repeat(3,1fr)}}@media(max-width:650px){.stats,.metrics{grid-template-columns:repeat(2,1fr)}.phases{grid-template-columns:1fr}.ratioGrid{grid-template-columns:1fr}.top .sub{display:none}}
    </style><main class="app"><div class="shell"><header class="top"><div><h1>Instagram Engagement Auditor V3</h1><div class="sub credit">Read-only audit · Created by <a href="/jaetxylor/" target="_blank">@jaetxylor</a></div></div><div><span class="sub">Requests: <b id="requests">0</b></span> <button class="btn" id="close">Close</button></div></header><div class="grid"><aside class="card pad side"><h2>Scan settings</h2><div class="field"><label>Posts to scan</label><select id="postLimit" data-lock><option value="0">All returned posts</option><option value="12">Latest 12</option><option value="24">Latest 24</option><option value="50">Latest 50</option><option value="100">Latest 100</option></select></div><div class="row"><label class="check"><input id="scanLikes" type="checkbox" checked data-lock> Likes</label><label class="check"><input id="scanComments" type="checkbox" checked data-lock> Comments</label></div><div class="field"><label class="check"><input id="refreshCounts" type="checkbox" checked data-lock> Refresh post totals</label><small>Improves coverage measurement; adds one read per post.</small></div><div class="field"><label>Low participation below (%)</label><input id="lowPct" type="number" value="10" min="0" max="100" data-lock></div><div class="field"><label>OR engaged posts ≤</label><input id="lowPosts" type="number" value="1" min="0" data-lock></div><div class="actions"><button class="btn primary" id="start">Start read-only audit</button><button class="btn" id="pause" disabled>Pause</button><button class="btn" id="stop" disabled>Stop</button></div><div class="note">The tool reads data available to your logged-in browser session. It does not perform follow/unfollow or other account mutations.</div></aside><section class="main"><div class="card hero"><h2>Engagement audit</h2><div class="stats"><div><span>Followers</span><strong id="followers">0</strong></div><div><span>Following</span><strong id="following">0</strong></div><div><span>Mutuals</span><strong id="mutuals">0</strong></div><div><span>Posts</span><strong id="posts">0</strong></div><div><span>High-conf inactive</span><strong id="inactive">0</strong></div><div><span>Uncertain</span><strong id="uncertain">0</strong></div><div><span>Identity coverage</span><strong id="coverage">—</strong></div></div><div class="phases">${PHASES.map(p=>`<div class="phase" data-phase="${p[0]}"><b>${p[1]}</b></div>`).join("")}</div><div class="bar" id="globalBar"><span></span></div><div class="status"><b id="phase">Phase 1/5 · Followers</b><span id="globalPct">0%</span></div><div class="sub" id="phaseDetail">Ready</div></div><div class="card analytics"><h2>Profile engagement rate</h2><div class="metrics"><div><span>Profile engagement rate</span><strong id="profileER">—</strong></div><div><span>All scanned avg ER</span><strong id="allER">—</strong></div><div><span>Avg likes · recent 12</span><strong id="avgLikes">—</strong></div><div><span>Avg comments · recent 12</span><strong id="avgComments">—</strong></div><div><span>Outliers</span><strong id="outliers">—</strong></div></div><div class="method">ER per post = (likes + comments) ÷ followers × 100. Uses up to 12 recent usable posts, transparent 1.5×IQR outlier removal, then reports the median.<div id="metricNote"></div></div></div><div class="card ratio hidden" id="ratioCard"><h2>Follow-ratio analysis</h2><div class="ratioGrid"><div class="field"><label>Scope</label><select id="ratioScope"><option value="current">Current results/filter</option><option value="inactiveHigh">High-confidence inactive</option><option value="inactiveLikely">Likely inactive</option><option value="uncertain">Uncertain</option><option value="low">Low observed engagement</option><option value="nonfollowers">Not following back</option><option value="allFollowing">All accounts you follow</option></select></div><button class="btn" id="ratioRun">Analyze ratios</button><button class="btn" id="ratioPause" disabled>Pause</button><button class="btn" id="ratioStop" disabled>Stop</button></div><div class="metrics"><div><span>Profiles analyzed</span><strong id="ratioAnalyzed">0</strong></div><div><span>Following &gt; Followers</span><strong id="ratioHigher">0</strong></div></div><div class="bar" id="ratioBar"><span></span></div><div class="status"><span id="ratioStatus">Choose a scope, then analyze.</span><span id="ratioPct">0%</span></div><div class="note" id="ratioEstimate">Run the core audit first.</div><button class="btn" id="clearCache">Clear 7-day ratio cache</button></div><div class="card hidden" id="results"><div class="tabs">${[["inactiveHigh","High-conf inactive"],["inactiveLikely","Likely inactive"],["uncertain","Uncertain"],["low","Low observed"],["active","Active"],["all","All followers"],["nonfollowers","Not following back"],["fans","You don't follow"],["other","Other engagers"],["ratioHigher","Following > Followers"]].map(([k,l])=>`<button class="tab" data-tab="${k}">${l} <b>0</b></button>`).join("")}</div><div class="toolbar"><input id="search" type="text" placeholder="Search username or name"><label class="check"><input id="mutualOnly" type="checkbox"> Mutuals only</label><span id="resultCount" class="sub">0 accounts</span><button class="btn" id="copy">Copy usernames</button><button class="btn" id="csv">Export CSV</button><button class="btn" id="json">Export JSON</button></div><div class="table"><table><thead><tr><th data-sort="username">Account</th><th data-sort="mutual">Relationship</th><th data-sort="likes">Likes</th><th data-sort="comments">Comments</th><th data-sort="engagedPosts">Posts engaged</th><th data-sort="participation">Participation</th><th data-sort="score">Score</th><th data-sort="last">Last observed</th><th data-sort="profileFollowers">Profile followers</th><th data-sort="profileFollowing">Profile following</th><th data-sort="followingToFollowers">Following/followers</th><th data-sort="deltaFollowing">Δ following</th><th data-sort="confidence">Confidence</th><th data-sort="status">Classification</th></tr></thead><tbody id="tbody"></tbody></table></div><div class="warnings hidden" id="warnings"><b>Coverage & endpoint warnings</b><ul id="warningList"></ul></div></div><div class="card"><div class="toolbar"><div><b>Per-post identity coverage</b><div class="sub" id="coverageNote">Waiting for scan data.</div></div></div><div class="table"><table><thead><tr><th>#</th><th>Post</th><th>Date</th><th>Displayed likes</th><th>Returned likers</th><th>Like coverage</th><th>Displayed comments</th><th>Returned comments</th><th>Comment coverage</th><th>Combined</th></tr></thead><tbody id="coverageBody"></tbody></table></div></div></section></div></div><div id="toasts"></div></main>`;

    $("#start").onclick=run; $("#pause").onclick=()=>{S.paused=!S.paused;$("#pause").textContent=S.paused?"Resume":"Pause"}; $("#stop").onclick=()=>{S.cancelled=true;S.paused=false}; $("#close").onclick=destroy;
    $("#search").oninput=renderTable; $("#mutualOnly").onchange=renderTable; $("#copy").onclick=copyNames; $("#csv").onclick=exportCSV; $("#json").onclick=exportJSON;
    $("#ratioRun").onclick=runRatio; $("#ratioPause").onclick=()=>{S.ratioPaused=!S.ratioPaused;$("#ratioPause").textContent=S.ratioPaused?"Resume":"Pause"}; $("#ratioStop").onclick=()=>{S.ratioCancelled=true;S.ratioPaused=false}; $("#ratioScope").onchange=renderRatioStats; $("#clearCache").onclick=()=>{localStorage.removeItem(CACHE_KEY);S.enrichment.clear();renderAll();toast("Ratio cache cleared.")};
    $$(".tab").forEach(b=>b.onclick=()=>{S.tab=b.dataset.tab;renderTabs();renderTable()});
    $$("th[data-sort]").forEach(th=>th.onclick=()=>{const k=th.dataset.sort;if(S.sortKey===k)S.sortDir=S.sortDir==="asc"?"desc":"asc";else{S.sortKey=k;S.sortDir=["username","last","confidence","status"].includes(k)?"asc":"desc"}renderTable()});
    $("#lowPct").onchange=()=>{S.settings.lowPct=clamp(Number($("#lowPct").value||10),0,100);renderAll()}; $("#lowPosts").onchange=()=>{S.settings.lowPosts=Math.max(0,Number($("#lowPosts").value||1));renderAll()};
  }

  function destroy(){S.cancelled=true;S.ratioCancelled=true;S.host?.remove();try{delete window.__IG_ENGAGEMENT_AUDITOR__}catch{}}
  S.destroy=destroy;
  build(); reset(); controls(); renderMetrics(); toast("Instagram Engagement Auditor V3 loaded. Review settings, then start the read-only audit.");
})();