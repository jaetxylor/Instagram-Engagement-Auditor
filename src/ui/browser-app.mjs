import { buildAccountRows, buildAuditOverview, filterAccountRows } from "../product/view-model.mjs";
import { getScanPreset, resolveScanConfiguration } from "../product/scan-presets.mjs";

const RESULT_PAGE_SIZE = 100;

const FILTERS = Object.freeze([
  { id: "all", label: "All accounts", keys: null },
  { id: "inactive", label: "Inactive", keys: ["inactive_high_confidence", "inactive_likely"] },
  { id: "uncertain", label: "Uncertain", keys: ["inactive_uncertain"] },
  { id: "low", label: "Low engagement", keys: ["low_observed_engagement"] },
  { id: "active", label: "Active", keys: ["active"] },
  { id: "nonfollowers", label: "Not following back", keys: ["not_following_back"] },
  { id: "followerOnly", label: "You don't follow", keys: ["follower_only"] },
  { id: "other", label: "Other engagers", keys: ["other_engager"] }
]);

const STYLES = `
  :host{all:initial}
  *{box-sizing:border-box}
  button,input,select{font:inherit}
  button{cursor:pointer}
  a{color:inherit}
  .app{position:fixed;inset:0;z-index:2147483647;overflow:auto;background:#080a0f;color:#f7f8fb;font:14px/1.45 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  .shell{width:min(1220px,calc(100% - 32px));margin:0 auto;padding:24px 0 56px}
  .topbar{position:sticky;top:0;z-index:30;display:flex;align-items:center;justify-content:space-between;gap:18px;margin:-24px calc((100vw - min(1220px,calc(100vw - 32px)))/-2) 24px;padding:14px max(16px,calc((100vw - min(1220px,calc(100vw - 32px)))/2));border-bottom:1px solid #ffffff12;background:#080a0fdf;backdrop-filter:blur(18px)}
  .brand{display:flex;align-items:center;gap:11px}.mark{display:grid;place-items:center;width:34px;height:34px;border-radius:11px;background:linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045);font-weight:900}.brand b{display:block}.brand small{display:block;color:#7f8794}.top-actions{display:flex;align-items:center;gap:8px}
  .btn{appearance:none;border:1px solid #ffffff18;border-radius:11px;background:#151922;color:#f7f8fb;padding:9px 13px;font-weight:750;transition:.15s}.btn:hover:not(:disabled){transform:translateY(-1px);border-color:#ffffff30;background:#1a1f2a}.btn:disabled{opacity:.45;cursor:not-allowed}.btn.primary{border:0;background:linear-gradient(135deg,#833ab4,#c13584,#fd1d1d);box-shadow:0 8px 28px #c1358430}.btn.ghost{background:transparent}.btn.danger{border-color:#ff626238;color:#ffaaaa;background:#ff62620b}.btn.full{width:100%}
  .card{border:1px solid #ffffff12;border-radius:18px;background:#11141bd9;box-shadow:0 28px 80px #0004}.pad{padding:22px}.muted{color:#8b93a1}.eyebrow{display:inline-flex;align-items:center;gap:7px;padding:5px 9px;border:1px solid #ffffff14;border-radius:999px;color:#aeb5c1;background:#ffffff07;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}
  h1,h2,h3,p{margin-top:0}h1{margin-bottom:10px;font-size:clamp(30px,5vw,50px);line-height:1;letter-spacing:-.035em}h2{margin-bottom:8px;font-size:22px;letter-spacing:-.02em}h3{margin-bottom:5px;font-size:15px}.lead{max-width:720px;color:#969eaa;font-size:15px}
  .hero{padding:32px}.hero-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:20px}
  .preset-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:20px}.preset{display:flex;flex-direction:column;min-height:220px;padding:20px;border:1px solid #ffffff12;border-radius:16px;background:#0c0f15}.preset.recommended{border-color:#c135845c;background:linear-gradient(180deg,#c135840d,#0c0f15)}.preset .icon{font-size:26px}.preset .meta{display:flex;justify-content:space-between;gap:10px;margin-top:5px;color:#78818e;font-size:12px}.preset .spacer{flex:1}.recommend{color:#e2aad1;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}
  .resume{display:grid;grid-template-columns:1fr auto;gap:20px;align-items:center}.resume-progress{margin-top:15px}.bar{height:9px;overflow:hidden;border-radius:999px;background:#07090d}.bar>span{display:block;height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,#833ab4,#c13584,#fd1d1d);transition:width .25s}.progress-meta{display:flex;justify-content:space-between;gap:12px;margin-top:8px;color:#7f8794;font-size:12px}.resume-actions{display:grid;gap:8px;min-width:160px}
  .custom-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:18px}.field{display:grid;gap:6px}.field label{font-size:12px;font-weight:800;color:#cbd0d8}.field input,.field select{width:100%;border:1px solid #ffffff16;border-radius:10px;background:#090c11;color:#fff;padding:10px}.checks{display:flex;gap:16px;flex-wrap:wrap}.check{display:flex;align-items:center;gap:7px}.check input{accent-color:#c13584}
  .running{display:grid;gap:16px}.phase-line{display:flex;align-items:center;justify-content:space-between;gap:12px}.phase-name{text-transform:capitalize}.running-stat{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:16px}.running-stat>div{padding:14px;border:1px solid #ffffff10;border-radius:13px;background:#0c0f15}.running-stat span{display:block;color:#7f8794;font-size:11px;text-transform:uppercase}.running-stat strong{font-size:20px}
  .overview-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}.quality-badge{display:inline-flex;align-items:center;gap:7px;border:1px solid #ffffff12;border-radius:999px;padding:7px 10px;background:#0d1016;font-size:12px}.dot{width:8px;height:8px;border-radius:50%;background:#7d8592}.dot.high{background:#43d275}.dot.medium{background:#facc15}.dot.low{background:#ff6b6b}
  .stat-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:9px;margin-top:18px}.stat{padding:15px;border:1px solid #ffffff10;border-radius:14px;background:#0c0f15}.stat span{display:block;color:#7f8794;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.045em}.stat strong{display:block;margin-top:3px;font-size:24px;letter-spacing:-.03em}.stat em{display:block;margin-top:2px;color:#737c89;font-size:11px;font-style:normal}
  .quick-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}.quick-actions .btn{font-size:12px}
  .results-card{margin-top:16px;overflow:hidden}.filters{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:13px;border-bottom:1px solid #ffffff10}.pill{border:1px solid #ffffff12;border-radius:999px;background:#0c0f15;color:#a0a8b4;padding:7px 10px;font-size:11px;font-weight:750}.pill.active{border-color:#c1358460;background:#c1358414;color:#fff}.toolbar{display:flex;align-items:center;gap:9px;padding:12px 13px;border-bottom:1px solid #ffffff10}.search{flex:1;min-width:220px;border:1px solid #ffffff14;border-radius:10px;background:#090c11;color:#fff;padding:9px 11px}.count{color:#7e8794;font-size:12px;white-space:nowrap}
  .account-list{display:grid}.account{border-bottom:1px solid #ffffff0d}.account:last-child{border-bottom:0}.account-main{display:grid;grid-template-columns:minmax(230px,1.4fr) minmax(150px,.7fr) minmax(150px,.7fr) minmax(150px,.7fr) auto;gap:14px;align-items:center;padding:12px 14px}.identity{display:flex;align-items:center;gap:10px;min-width:0}.avatar{display:grid;place-items:center;width:38px;height:38px;flex:0 0 38px;border-radius:50%;background:#232833;color:#d9dde5;font-weight:850;overflow:hidden}.avatar img{width:100%;height:100%;object-fit:cover}.identity-text{min-width:0}.identity a{display:block;overflow:hidden;text-overflow:ellipsis;color:#fff;font-weight:800;text-decoration:none}.identity small{display:block;overflow:hidden;text-overflow:ellipsis;color:#737c89;white-space:nowrap}.cell span{display:block;color:#737c89;font-size:10px;text-transform:uppercase}.cell b{display:block;margin-top:2px;font-size:12px}.chip{display:inline-flex;align-items:center;border:1px solid #ffffff13;border-radius:999px;padding:5px 8px;font-size:10px;font-weight:850;white-space:nowrap}.chip.positive{color:#9be6ad;background:#43d27510;border-color:#43d27535}.chip.warning{color:#ecd47e;background:#facc1510;border-color:#facc1535}.chip.danger{color:#ffaaaa;background:#ff626210;border-color:#ff626238}.chip.neutral{color:#b1b8c3;background:#ffffff07}.expand{width:32px;height:32px;padding:0;border-radius:9px}.account-detail{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;padding:0 14px 14px 62px}.detail{padding:10px;border:1px solid #ffffff0d;border-radius:10px;background:#0a0d12}.detail span{display:block;color:#727b88;font-size:10px;text-transform:uppercase}.detail b{display:block;margin-top:2px;font-size:12px}.reasons{grid-column:1/-1;color:#7f8794;font-size:11px}.load-more{padding:14px;text-align:center;border-top:1px solid #ffffff0d}
  .quality{margin-top:16px}.quality-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:14px}.quality-item{padding:13px;border:1px solid #ffffff10;border-radius:12px;background:#0c0f15}.quality-item span{display:block;color:#737c89;font-size:10px;text-transform:uppercase}.quality-item strong{display:block;margin-top:3px}.quality-section{margin-top:15px;padding-top:15px;border-top:1px solid #ffffff10}.quality-section ul{margin:7px 0 0;padding-left:18px;color:#8d96a3}.quality-section li{margin:4px 0}
  .empty{padding:36px;text-align:center;color:#7f8794}.error{border-color:#ff626235;background:#ff62620a}.error pre{overflow:auto;padding:10px;border-radius:10px;background:#080a0f;color:#ffb1b1;font-size:11px}
  .footer{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-top:16px;padding:0 4px;color:#646d79;font-size:11px}.footer a{color:#bca7dc}
  @media(max-width:980px){.stat-grid{grid-template-columns:repeat(3,1fr)}.account-main{grid-template-columns:minmax(220px,1.4fr) minmax(130px,.8fr) minmax(130px,.8fr) auto}.account-main .hide-md{display:none}.quality-grid{grid-template-columns:repeat(2,1fr)}}
  @media(max-width:720px){.shell{width:min(100% - 20px,1220px);padding-top:10px}.topbar{margin:-10px -10px 14px;padding:10px}.preset-grid,.custom-grid{grid-template-columns:1fr}.resume{grid-template-columns:1fr}.resume-actions{grid-template-columns:1fr 1fr}.stat-grid{grid-template-columns:repeat(2,1fr)}.running-stat{grid-template-columns:1fr}.overview-head{display:block}.quality-badge{margin-top:8px}.toolbar{flex-wrap:wrap}.search{flex-basis:100%}.account-main{grid-template-columns:1fr auto}.account-main .cell{display:none}.account-detail{grid-template-columns:repeat(2,1fr);padding-left:14px}.quality-grid{grid-template-columns:1fr}.hero{padding:22px}.top-actions .muted{display:none}}
`;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function formatNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value).toLocaleString() : "—";
}

function formatPercent(value, digits = 1) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(digits)}%` : "—";
}

function relationshipLabel(row) {
  if (row?.relationship?.mutual) return "Mutual";
  if (row?.relationship?.youFollow && !row?.relationship?.followsYou) return "You follow";
  if (row?.relationship?.followsYou && !row?.relationship?.youFollow) return "Follows you";
  return "Outside network";
}

function initials(row) {
  return String(row?.username || row?.fullName || "?").slice(0, 1).toUpperCase();
}

function phaseLabel(phase) {
  return ({
    followers: "Followers",
    following: "Following",
    posts: "Posts",
    engagement: "Engagement",
    scoring: "Scoring",
    complete: "Complete"
  })[phase] ?? "Audit";
}

function resumableSummary(run) {
  const completed = Number(run?.progress?.completedItems ?? 0);
  const total = Number.isFinite(Number(run?.progress?.totalItems)) ? Number(run.progress.totalItems) : null;
  const progress = Number(run?.progress?.percent ?? 0);
  return {
    phase: phaseLabel(run?.progress?.phase),
    completed,
    total,
    progress,
    message: run?.progress?.message ?? "Saved audit",
    updatedAt: run?.updatedAt ?? null
  };
}

function presetCard(id) {
  const preset = getScanPreset(id);
  const quick = id === "quick";
  const deep = id === "deep";
  return `
    <article class="preset ${quick ? "recommended" : ""}">
      <div class="icon">${quick ? "⚡" : deep ? "⌕" : "⚙"}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px">
        <h2 style="margin:0">${escapeHtml(preset.label)}</h2>
        ${quick ? '<span class="recommend">Recommended</span>' : ""}
      </div>
      <p class="muted">${escapeHtml(preset.description)}</p>
      <div class="meta"><span>${preset.configuration.postLimit === 0 ? "All returned posts" : `Latest ${preset.configuration.postLimit} posts`}</span><span>Likes + comments</span></div>
      <div class="spacer"></div>
      <button class="btn ${quick ? "primary" : ""} full" data-start-preset="${id}">${deep ? "Start deep audit" : "Start quick audit"}</button>
    </article>`;
}

export function createBrowserAuditorApp({
  runtime,
  documentRef = globalThis.document,
  mountTarget = globalThis.document?.documentElement
} = {}) {
  if (!runtime) throw new TypeError("A browser audit runtime is required.");
  if (!documentRef || !mountTarget) throw new Error("A browser document and mount target are required.");

  const state = {
    host: null,
    shadow: null,
    screen: "boot",
    account: null,
    resumableRun: null,
    currentRun: null,
    error: null,
    abortController: null,
    selectedFilter: "all",
    query: "",
    mutualOnly: false,
    expanded: new Set(),
    resultLimit: RESULT_PAGE_SIZE,
    qualityOpen: false,
    custom: resolveScanConfiguration({ preset: "custom" })
  };

  function destroy() {
    state.abortController?.abort();
    state.host?.remove();
    state.host = null;
    state.shadow = null;
  }

  function header() {
    const account = state.account?.username ? `@${state.account.username}` : "Instagram";
    return `
      <header class="topbar">
        <div class="brand"><span class="mark">IA</span><div><b>Instagram Engagement Auditor</b><small>V4 preview · ${escapeHtml(account)}</small></div></div>
        <div class="top-actions"><span class="muted">Read-only · Created by @jaetxylor</span><button class="btn ghost" data-action="close">Close</button></div>
      </header>`;
  }

  function bootView() {
    return `<section class="card hero"><span class="eyebrow">V4 commercial foundation</span><h1 style="margin-top:14px">Preparing your auditor…</h1><p class="lead">Checking your Instagram session and looking for a resumable local audit.</p><div class="bar"><span style="width:45%"></span></div></section>`;
  }

  function chooseView() {
    return `
      <section class="card hero">
        <span class="eyebrow">Choose your audit</span>
        <h1 style="margin-top:14px">Start with the depth you need.</h1>
        <p class="lead">Quick audit is the recommended first pass. Deep audit scans every post returned by the browser connector and can take substantially longer.</p>
        <div class="preset-grid">${presetCard("quick")}${presetCard("deep")}</div>
        <div class="hero-actions"><button class="btn ghost" data-action="custom">Configure a custom audit →</button></div>
      </section>`;
  }

  function customView() {
    const config = state.custom;
    return `
      <section class="card hero">
        <span class="eyebrow">Custom audit</span>
        <h1 style="margin-top:14px">Tune the scan.</h1>
        <p class="lead">Use custom mode when you already know how much history and which interaction types you want to inspect.</p>
        <div class="custom-grid">
          <div class="field"><label>Posts to scan</label><select data-custom="postLimit"><option value="12" ${config.postLimit===12?"selected":""}>Latest 12</option><option value="24" ${config.postLimit===24?"selected":""}>Latest 24</option><option value="50" ${config.postLimit===50?"selected":""}>Latest 50</option><option value="100" ${config.postLimit===100?"selected":""}>Latest 100</option><option value="0" ${config.postLimit===0?"selected":""}>All returned posts</option></select></div>
          <div class="field"><label>Low participation threshold</label><input data-custom="lowParticipationPercent" type="number" min="0" max="100" value="${Number(config.lowParticipationPercent ?? 10)}"></div>
          <div class="field"><label>Low-engagement post count</label><input data-custom="lowEngagedPosts" type="number" min="0" value="${Number(config.lowEngagedPosts ?? 1)}"></div>
          <div class="field"><label>Interactions</label><div class="checks"><label class="check"><input data-custom="likes" type="checkbox" ${config.likes?"checked":""}> Likes</label><label class="check"><input data-custom="comments" type="checkbox" ${config.comments?"checked":""}> Comments</label></div></div>
        </div>
        <div class="hero-actions"><button class="btn primary" data-action="start-custom">Start custom audit</button><button class="btn ghost" data-action="back">Back</button></div>
      </section>`;
  }

  function resumeView() {
    const summary = resumableSummary(state.resumableRun);
    const updated = summary.updatedAt ? new Date(summary.updatedAt).toLocaleString() : "Unknown";
    return `
      <section class="card hero resume">
        <div>
          <span class="eyebrow">Previous audit found</span>
          <h1 style="margin-top:14px">Continue where you left off.</h1>
          <p class="lead">${escapeHtml(summary.phase)} · ${escapeHtml(summary.message)}</p>
          <div class="resume-progress"><div class="bar"><span style="width:${Math.max(0,Math.min(100,summary.progress))}%"></span></div><div class="progress-meta"><span>${summary.total ? `${summary.completed} of ${summary.total} posts completed` : `${summary.completed} completed items`}</span><span>${Math.round(summary.progress)}%</span></div></div>
          <p class="muted" style="margin:10px 0 0;font-size:12px">Saved ${escapeHtml(updated)}</p>
        </div>
        <div class="resume-actions"><button class="btn primary" data-action="resume">Resume audit</button><button class="btn danger" data-action="start-over">Start over</button></div>
      </section>`;
  }

  function runningView() {
    const overview = state.currentRun ? buildAuditOverview(state.currentRun) : null;
    const progress = overview?.progress ?? { phase:"followers", completedItems:0, totalItems:null, percent:0, message:"Starting audit" };
    return `
      <section class="card hero running">
        <div class="phase-line"><div><span class="eyebrow">Audit running</span><h1 class="phase-name" style="margin:14px 0 4px">${escapeHtml(phaseLabel(progress.phase))}</h1><p class="lead">${escapeHtml(progress.message || "Working through your audit")}</p></div><button class="btn danger" data-action="stop">Stop & save progress</button></div>
        <div class="bar"><span style="width:${Math.max(0,Math.min(100,Number(progress.percent)||0))}%"></span></div>
        <div class="progress-meta"><span>${progress.totalItems ? `${progress.completedItems} / ${progress.totalItems} items` : "Relationship totals may be unknown while loading"}</span><span>${Math.round(Number(progress.percent)||0)}%</span></div>
        <div class="running-stat"><div><span>Followers loaded</span><strong>${formatNumber(overview?.relationships?.followers ?? 0)}</strong></div><div><span>Following loaded</span><strong>${formatNumber(overview?.relationships?.following ?? 0)}</strong></div><div><span>Posts loaded</span><strong>${formatNumber(overview?.posts ?? 0)}</strong></div></div>
      </section>`;
  }

  function stat(label, value, note="") {
    return `<div class="stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${note?`<em>${escapeHtml(note)}</em>`:""}</div>`;
  }

  function qualityBadge(overview) {
    const level = overview.auditQuality.confidenceLevel || "low";
    return `<span class="quality-badge"><i class="dot ${escapeHtml(level)}"></i>${escapeHtml(level[0]?.toUpperCase()+level.slice(1))} confidence · ${formatPercent(overview.auditQuality.identityCoveragePercent)}</span>`;
  }

  function accountRow(row) {
    const isOpen = state.expanded.has(String(row.id));
    const observed = row.observed ?? {};
    const confidence = row.confidence ?? {};
    const pic = row.picture || row.pic || "";
    return `
      <article class="account">
        <div class="account-main">
          <div class="identity"><span class="avatar">${pic?`<img src="${escapeHtml(pic)}" alt="">`:escapeHtml(initials(row))}</span><div class="identity-text"><a href="/${encodeURIComponent(row.username || "")}/" target="_blank" rel="noreferrer">@${escapeHtml(row.username || "unknown")}</a><small>${escapeHtml(row.fullName || "")}</small></div></div>
          <div class="cell"><span>Relationship</span><b>${escapeHtml(relationshipLabel(row))}</b></div>
          <div class="cell"><span>Participation</span><b>${Number.isFinite(observed.participationPercent)?formatPercent(observed.participationPercent):"—"}</b></div>
          <div class="cell hide-md"><span>Status</span><b><span class="chip ${escapeHtml(row.tone || "neutral")}">${escapeHtml(row.label)}</span></b></div>
          <button class="btn expand" data-expand="${escapeHtml(row.id)}" aria-label="${isOpen?"Collapse":"Expand"} @${escapeHtml(row.username)}">${isOpen?"−":"+"}</button>
        </div>
        ${isOpen?`<div class="account-detail">
          <div class="detail"><span>Observed likes</span><b>${formatNumber(observed.likes)}</b></div>
          <div class="detail"><span>Observed comments</span><b>${formatNumber(observed.comments)}</b></div>
          <div class="detail"><span>Posts engaged</span><b>${Number.isFinite(observed.postsEngaged)?`${formatNumber(observed.postsEngaged)} / ${formatNumber(observed.totalPosts)}`:"—"}</b></div>
          <div class="detail"><span>Weighted score</span><b>${Number.isFinite(observed.weightedScore)?Number(observed.weightedScore).toFixed(2):"—"}</b></div>
          <div class="detail"><span>Data confidence</span><b>${confidence?.level?`${escapeHtml(confidence.level)}${Number.isFinite(confidence.percent)?` · ${formatPercent(confidence.percent)}`:""}`:"N/A"}</b></div>
          ${Array.isArray(confidence?.reasons)&&confidence.reasons.length?`<div class="reasons">${confidence.reasons.map(escapeHtml).join(" · ")}</div>`:""}
        </div>`:""}
      </article>`;
  }

  function resultsView() {
    const run = state.currentRun;
    const overview = buildAuditOverview(run);
    const allRows = buildAccountRows(run);
    const filter = FILTERS.find(item => item.id === state.selectedFilter) ?? FILTERS[0];
    const filtered = filterAccountRows(allRows, { query:state.query, keys:filter.keys, mutualOnly:state.mutualOnly });
    const visible = filtered.slice(0,state.resultLimit);
    const counts = overview.classifications;
    return `
      <section class="card hero">
        <div class="overview-head"><div><span class="eyebrow">Audit complete</span><h1 style="margin-top:14px">Your audience at a glance.</h1><p class="lead">Start with the high-signal results. Technical coverage details are available separately under Audit Quality.</p></div>${qualityBadge(overview)}</div>
        <div class="stat-grid">
          ${stat("Followers",formatNumber(overview.relationships.followers))}
          ${stat("Following",formatNumber(overview.relationships.following))}
          ${stat("Mutuals",formatNumber(overview.relationships.mutuals))}
          ${stat("High-conf inactive",formatNumber(counts.inactiveHighConfidence),"zero observed engagement")}
          ${stat("Not following back",formatNumber(overview.relationships.notFollowingBack))}
          ${stat("Low engagement",formatNumber(counts.lowObservedEngagement))}
          ${stat("Profile engagement rate",formatPercent(overview.engagement.profileEngagementRate,2),`${formatNumber(overview.engagement.averageLikesRecent)} avg likes`)}
          ${stat("Uncertain",formatNumber(counts.inactiveUncertain),"insufficient negative evidence")}
          ${stat("Active",formatNumber(counts.active))}
          ${stat("Posts scanned",formatNumber(overview.posts))}
          ${stat("Identity coverage",formatPercent(overview.auditQuality.identityCoveragePercent))}
          ${stat("Requests",formatNumber(overview.diagnostics.requestCount),`${formatNumber(overview.diagnostics.retries)} retries`)}
        </div>
        <div class="quick-actions"><button class="btn" data-set-filter="inactive">View inactive</button><button class="btn" data-set-filter="nonfollowers">View non-followbacks</button><button class="btn" data-set-filter="low">View low engagement</button><button class="btn ghost" data-action="toggle-quality">${state.qualityOpen?"Hide":"View"} audit quality</button></div>
      </section>
      ${state.qualityOpen?qualityView(overview):""}
      <section class="card results-card">
        <div class="filters">${FILTERS.map(item=>`<button class="pill ${item.id===state.selectedFilter?"active":""}" data-filter="${item.id}">${escapeHtml(item.label)}</button>`).join("")}</div>
        <div class="toolbar"><input class="search" data-search type="search" placeholder="Search username or name" value="${escapeHtml(state.query)}"><label class="check"><input data-mutual type="checkbox" ${state.mutualOnly?"checked":""}> Mutuals only</label><span class="count">${formatNumber(filtered.length)} accounts</span></div>
        <div class="account-list">${visible.length?visible.map(accountRow).join(""):`<div class="empty">No accounts match this view.</div>`}</div>
        ${visible.length<filtered.length?`<div class="load-more"><button class="btn" data-action="more">Show ${Math.min(RESULT_PAGE_SIZE,filtered.length-visible.length)} more</button></div>`:""}
      </section>`;
  }

  function qualityView(overview) {
    const quality = overview.auditQuality;
    const diagnostics = overview.diagnostics;
    const reasons = quality.confidenceReasons ?? [];
    const warnings = diagnostics.warnings ?? [];
    const errors = diagnostics.errors ?? [];
    return `
      <section class="card pad quality">
        <div class="overview-head"><div><h2>Audit Quality</h2><p class="muted">This section explains how much identity-level evidence Instagram returned and why the auditor assigned its confidence level.</p></div>${qualityBadge(overview)}</div>
        <div class="quality-grid">
          <div class="quality-item"><span>Identity coverage</span><strong>${formatPercent(quality.identityCoveragePercent)}</strong></div>
          <div class="quality-item"><span>Confidence</span><strong>${escapeHtml(quality.confidenceLevel || "low")}</strong></div>
          <div class="quality-item"><span>Incomplete posts</span><strong>${formatNumber(quality.incompletePosts)}</strong></div>
          <div class="quality-item"><span>Missing modalities</span><strong>${quality.missingModalities?.length?escapeHtml(quality.missingModalities.join(", ")):"None"}</strong></div>
        </div>
        ${reasons.length?`<div class="quality-section"><h3>Why this confidence?</h3><ul>${reasons.map(reason=>`<li>${escapeHtml(reason)}</li>`).join("")}</ul></div>`:""}
        ${warnings.length?`<div class="quality-section"><h3>Warnings</h3><ul>${warnings.map(reason=>`<li>${escapeHtml(reason)}</li>`).join("")}</ul></div>`:""}
        ${errors.length?`<div class="quality-section"><h3>Errors</h3><ul>${errors.map(reason=>`<li>${escapeHtml(reason)}</li>`).join("")}</ul></div>`:""}
      </section>`;
  }

  function errorView() {
    return `<section class="card hero error"><span class="eyebrow">Audit error</span><h1 style="margin-top:14px">The audit could not continue.</h1><p class="lead">Your last completed checkpoint remains local when available.</p><pre>${escapeHtml(state.error?.message || state.error || "Unknown error")}</pre><div class="hero-actions"><button class="btn primary" data-action="retry-home">Return to audit home</button></div></section>`;
  }

  function content() {
    if (state.screen === "boot") return bootView();
    if (state.screen === "resume") return resumeView();
    if (state.screen === "custom") return customView();
    if (state.screen === "running") return runningView();
    if (state.screen === "results") return resultsView();
    if (state.screen === "error") return errorView();
    return chooseView();
  }

  function render() {
    if (!state.shadow) return;
    state.shadow.innerHTML = `<style>${STYLES}</style><main class="app"><div class="shell">${header()}${content()}<footer class="footer"><span>V4 preview · Local browser audit</span><span>Created by <a href="https://github.com/jaetxylor" target="_blank" rel="noreferrer">@jaetxylor</a> · Apache-2.0</span></footer></div></main>`;
    bind();
  }

  function bind() {
    const root = state.shadow;
    root.querySelector('[data-action="close"]')?.addEventListener("click", destroy);
    root.querySelectorAll("[data-start-preset]").forEach(button => button.addEventListener("click", () => startNew(button.dataset.startPreset)));
    root.querySelector('[data-action="custom"]')?.addEventListener("click",()=>{state.screen="custom";render();});
    root.querySelector('[data-action="back"]')?.addEventListener("click",()=>{state.screen="choose";render();});
    root.querySelector('[data-action="start-custom"]')?.addEventListener("click",()=>startNew("custom",state.custom));
    root.querySelector('[data-action="resume"]')?.addEventListener("click",()=>resumeAudit());
    root.querySelector('[data-action="start-over"]')?.addEventListener("click",()=>startOver());
    root.querySelector('[data-action="stop"]')?.addEventListener("click",()=>state.abortController?.abort());
    root.querySelector('[data-action="retry-home"]')?.addEventListener("click",()=>initialize());
    root.querySelector('[data-action="toggle-quality"]')?.addEventListener("click",()=>{state.qualityOpen=!state.qualityOpen;render();});
    root.querySelector('[data-action="more"]')?.addEventListener("click",()=>{state.resultLimit+=RESULT_PAGE_SIZE;render();});
    root.querySelectorAll("[data-set-filter]").forEach(button=>button.addEventListener("click",()=>{state.selectedFilter=button.dataset.setFilter;state.resultLimit=RESULT_PAGE_SIZE;render();}));
    root.querySelectorAll("[data-filter]").forEach(button=>button.addEventListener("click",()=>{state.selectedFilter=button.dataset.filter;state.resultLimit=RESULT_PAGE_SIZE;render();}));
    root.querySelectorAll("[data-expand]").forEach(button=>button.addEventListener("click",()=>{const id=String(button.dataset.expand);state.expanded.has(id)?state.expanded.delete(id):state.expanded.add(id);render();}));
    root.querySelector("[data-search]")?.addEventListener("input",event=>{state.query=event.target.value;state.resultLimit=RESULT_PAGE_SIZE;render();const input=state.shadow?.querySelector("[data-search]");input?.focus();input?.setSelectionRange(state.query.length,state.query.length);});
    root.querySelector("[data-mutual]")?.addEventListener("change",event=>{state.mutualOnly=event.target.checked;state.resultLimit=RESULT_PAGE_SIZE;render();});
    root.querySelectorAll("[data-custom]").forEach(input=>input.addEventListener("change",()=>{
      const key=input.dataset.custom;
      state.custom[key]=input.type==="checkbox"?input.checked:Number(input.value);
    }));
  }

  async function initialize() {
    state.screen="boot";state.error=null;render();
    try {
      state.account=await runtime.getAccountContext();
      state.resumableRun=await runtime.findResumableAudit();
      if(state.resumableRun){state.currentRun=state.resumableRun;state.screen="resume";}else{state.screen="choose";}
    } catch(error){state.error=error;state.screen="error";}
    render();
  }

  async function execute(configuration,resumeRun=null) {
    state.error=null;state.currentRun=resumeRun;state.screen="running";state.abortController=new AbortController();render();
    try {
      const result=await runtime.runAudit({configuration,resume:false,resumeRun,signal:state.abortController.signal,onProgress:(_progress,run)=>{state.currentRun=run;render();}});
      state.currentRun=result;state.resumableRun=null;state.screen="results";state.resultLimit=RESULT_PAGE_SIZE;state.selectedFilter="all";render();
    } catch(error){
      if(error?.name==="AbortError"){
        try{state.resumableRun=await runtime.findResumableAudit();}catch{}
        state.currentRun=state.resumableRun;
        state.screen=state.resumableRun?"resume":"choose";
      }else{state.error=error;state.screen="error";}
      render();
    } finally {state.abortController=null;}
  }

  function startNew(preset="quick",customConfiguration=null){
    const configuration=customConfiguration?{...customConfiguration,preset:"custom"}:resolveScanConfiguration({preset});
    return execute(configuration,null);
  }

  function resumeAudit(){
    if(!state.resumableRun)return;
    return execute({...state.resumableRun.configuration},state.resumableRun);
  }

  async function startOver(){
    if(state.resumableRun?.id)await runtime.discardAudit(state.resumableRun.id);
    state.resumableRun=null;state.currentRun=null;state.screen="choose";render();
  }

  function mount(){
    if(state.host)return state.host;
    state.host=documentRef.createElement("div");
    state.host.style.cssText="position:fixed;inset:0;z-index:2147483647";
    state.shadow=state.host.attachShadow({mode:"open"});
    mountTarget.appendChild(state.host);
    initialize();
    return state.host;
  }

  return Object.freeze({mount,destroy,initialize,getState:()=>({...state,expanded:new Set(state.expanded)})});
}
