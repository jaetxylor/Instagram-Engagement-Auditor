import { buildAccountRows, buildAuditOverview, filterAccountRows } from "../product/view-model.mjs";
import { getScanPreset, resolveScanConfiguration } from "../product/scan-presets.mjs";
import { enrichProfileCounts } from "../product/profile-enrichment.mjs";
import { accountRowsToCsv } from "../reporting/csv.mjs";
import { serializeAuditJson } from "../reporting/json.mjs";
import { createProfileCountCache } from "../storage/profile-count-cache.mjs";

const PAGE_SIZE = 100;
const FILTERS = Object.freeze([
  { id: "all", label: "All", keys: null },
  { id: "inactive", label: "Inactive", keys: ["inactive_high_confidence", "inactive_likely"] },
  { id: "uncertain", label: "Uncertain", keys: ["inactive_uncertain"] },
  { id: "low", label: "Low engagement", keys: ["low_observed_engagement"] },
  { id: "active", label: "Active", keys: ["active"] },
  { id: "nonfollowers", label: "Not following back", keys: ["not_following_back"] },
  { id: "followerOnly", label: "You don't follow", keys: ["follower_only"] },
  { id: "ratioHigher", label: "Following > Followers", keys: null }
]);

const CSS = `
:host{all:initial}*{box-sizing:border-box}button,input,select{font:inherit}button{cursor:pointer}a{color:inherit}.app{position:fixed;inset:0;z-index:2147483647;overflow:auto;background:#080a0f;color:#f7f8fb;font:14px/1.45 Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.shell{width:min(1240px,calc(100% - 28px));margin:0 auto;padding:20px 0 56px}.topbar{position:sticky;top:0;z-index:30;display:flex;align-items:center;justify-content:space-between;gap:16px;margin:-20px calc((100vw - min(1240px,calc(100vw - 28px)))/-2) 20px;padding:12px max(14px,calc((100vw - min(1240px,calc(100vw - 28px)))/2));border-bottom:1px solid #ffffff12;background:#080a0fe8;backdrop-filter:blur(18px)}.brand{display:flex;align-items:center;gap:10px}.mark{display:grid;place-items:center;width:34px;height:34px;border-radius:11px;background:linear-gradient(135deg,#833ab4,#c13584,#fd1d1d,#fcb045);font-weight:900}.brand b{display:block}.brand small{display:block;color:#7b8491}.actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.btn{appearance:none;border:1px solid #ffffff18;border-radius:10px;background:#151922;color:#f7f8fb;padding:9px 12px;font-weight:750;transition:.14s}.btn:hover:not(:disabled){transform:translateY(-1px);border-color:#ffffff30;background:#1b202a}.btn:disabled{opacity:.45;cursor:not-allowed}.btn.primary{border:0;background:linear-gradient(135deg,#833ab4,#c13584,#fd1d1d)}.btn.danger{border-color:#ff676738;color:#ffb1b1;background:#ff67620b}.btn.ghost{background:transparent}.card{border:1px solid #ffffff12;border-radius:18px;background:#11141bd9;box-shadow:0 24px 72px #0004}.pad{padding:22px}.hero{padding:30px}.eyebrow{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border:1px solid #ffffff14;border-radius:999px;background:#ffffff06;color:#aab2be;font-size:11px;font-weight:850;letter-spacing:.05em;text-transform:uppercase}h1,h2,h3,p{margin-top:0}h1{margin:13px 0 9px;font-size:clamp(32px,5vw,52px);line-height:1;letter-spacing:-.04em}h2{margin-bottom:7px;font-size:21px;letter-spacing:-.02em}h3{margin-bottom:5px;font-size:15px}.lead,.muted{color:#8d96a3}.lead{max-width:760px;font-size:15px}.preset-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px;margin-top:20px}.preset{display:flex;flex-direction:column;min-height:210px;padding:19px;border:1px solid #ffffff12;border-radius:15px;background:#0c0f15}.preset.recommended{border-color:#c1358458;background:linear-gradient(180deg,#c135840d,#0c0f15)}.preset .icon{font-size:25px}.preset .spacer{flex:1}.preset-meta{display:flex;justify-content:space-between;gap:10px;color:#77808d;font-size:11px}.recommend{color:#e2aad1;font-size:10px;font-weight:850;letter-spacing:.05em;text-transform:uppercase}.bar{height:9px;overflow:hidden;border-radius:999px;background:#07090d}.bar>span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#833ab4,#c13584,#fd1d1d);transition:width .2s}.resume{display:grid;grid-template-columns:1fr auto;gap:18px;align-items:center}.resume-actions{display:grid;gap:8px;min-width:160px}.progress-meta{display:flex;justify-content:space-between;gap:10px;margin-top:7px;color:#7a8390;font-size:11px}.custom-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:16px}.field{display:grid;gap:6px}.field label{font-size:11px;font-weight:800;color:#cbd0d8}.field input,.field select,.select{width:100%;border:1px solid #ffffff16;border-radius:10px;background:#090c11;color:#fff;padding:9px 10px}.checks{display:flex;gap:16px;flex-wrap:wrap}.check{display:flex;align-items:center;gap:7px}.check input{accent-color:#c13584}.running-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:16px}.mini-stat,.stat,.quality-item{padding:13px;border:1px solid #ffffff10;border-radius:12px;background:#0c0f15}.mini-stat span,.stat span,.quality-item span{display:block;color:#737c89;font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}.mini-stat strong,.stat strong,.quality-item strong{display:block;margin-top:3px}.mini-stat strong{font-size:19px}.overview-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}.quality-badge{display:inline-flex;align-items:center;gap:7px;border:1px solid #ffffff12;border-radius:999px;padding:7px 10px;background:#0d1016;font-size:11px}.dot{width:8px;height:8px;border-radius:50%;background:#7d8592}.dot.high{background:#43d275}.dot.medium{background:#facc15}.dot.low{background:#ff6b6b}.stat-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;margin-top:16px}.stat strong{font-size:22px;letter-spacing:-.03em}.stat em{display:block;color:#707986;font-size:10px;font-style:normal}.quick-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:15px}.results{margin-top:14px;overflow:hidden}.filters{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:12px;border-bottom:1px solid #ffffff10}.pill{border:1px solid #ffffff12;border-radius:999px;background:#0c0f15;color:#9da5b1;padding:7px 9px;font-size:10px;font-weight:800}.pill.active{border-color:#c1358460;background:#c1358414;color:#fff}.toolbar{display:flex;align-items:center;gap:8px;padding:11px 12px;border-bottom:1px solid #ffffff10;flex-wrap:wrap}.search{flex:1;min-width:220px;border:1px solid #ffffff14;border-radius:10px;background:#090c11;color:#fff;padding:9px 10px}.toolbar .select{width:auto;min-width:140px}.count{color:#7d8693;font-size:11px;white-space:nowrap}.account-list{display:grid}.account{border-bottom:1px solid #ffffff0d}.account:last-child{border-bottom:0}.account-main{display:grid;grid-template-columns:minmax(240px,1.35fr) minmax(135px,.7fr) minmax(120px,.6fr) minmax(135px,.7fr) minmax(125px,.6fr) auto;gap:12px;align-items:center;padding:11px 13px}.identity{display:flex;align-items:center;gap:10px;min-width:0}.avatar{display:grid;place-items:center;width:39px;height:39px;flex:0 0 39px;border-radius:50%;background:#242a35;color:#dce0e7;font-weight:850;overflow:hidden}.avatar img{width:100%;height:100%;object-fit:cover}.identity-text{min-width:0}.identity a{display:block;overflow:hidden;text-overflow:ellipsis;color:#fff;font-weight:800;text-decoration:none;white-space:nowrap}.identity small{display:block;overflow:hidden;text-overflow:ellipsis;color:#747d8a;white-space:nowrap}.cell span{display:block;color:#707986;font-size:9px;text-transform:uppercase}.cell b{display:block;margin-top:2px;font-size:11px}.chip{display:inline-flex;align-items:center;border:1px solid #ffffff13;border-radius:999px;padding:5px 7px;font-size:9px;font-weight:850;white-space:nowrap}.chip.positive{color:#9be6ad;background:#43d27510;border-color:#43d27535}.chip.warning{color:#ecd47e;background:#facc1510;border-color:#facc1535}.chip.danger{color:#ffaaaa;background:#ff626210;border-color:#ff626238}.chip.neutral{color:#b1b8c3;background:#ffffff07}.expand{width:31px;height:31px;padding:0}.account-detail{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:7px;padding:0 13px 13px 62px}.detail{padding:9px;border:1px solid #ffffff0d;border-radius:9px;background:#0a0d12}.detail span{display:block;color:#6f7885;font-size:9px;text-transform:uppercase}.detail b{display:block;margin-top:2px;font-size:11px}.reasons{grid-column:1/-1;color:#7f8794;font-size:10px}.load-more{padding:13px;text-align:center;border-top:1px solid #ffffff0d}.quality,.ratio{margin-top:14px}.quality-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:12px}.section-line{margin-top:14px;padding-top:14px;border-top:1px solid #ffffff10}.section-line ul{margin:6px 0 0;padding-left:18px;color:#88919e}.ratio-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.ratio-controls{display:grid;grid-template-columns:minmax(180px,1fr) auto auto;gap:8px;margin-top:13px}.ratio-summary{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:12px}.toast{position:fixed;right:18px;bottom:18px;z-index:5;max-width:420px;padding:11px 13px;border:1px solid #ffffff16;border-radius:11px;background:#171b23;color:#e8ebef;box-shadow:0 16px 60px #0008;font-size:12px}.toast.ok{border-color:#43d27545}.toast.warn{border-color:#facc1545}.toast.err{border-color:#ff626245}.empty{padding:34px;text-align:center;color:#7e8794}.error{border-color:#ff626235;background:#ff62620a}.error pre{overflow:auto;padding:10px;border-radius:10px;background:#080a0f;color:#ffb1b1;font-size:11px}.footer{display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-top:15px;padding:0 4px;color:#626b77;font-size:10px}.footer a{color:#bba7dc}@media(max-width:1040px){.stat-grid{grid-template-columns:repeat(4,1fr)}.account-main{grid-template-columns:minmax(220px,1.4fr) minmax(130px,.7fr) minmax(120px,.6fr) auto}.hide-md{display:none}.account-detail{grid-template-columns:repeat(4,1fr)}.ratio-summary,.quality-grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:760px){.shell{width:min(100% - 18px,1240px);padding-top:9px}.topbar{margin:-9px -9px 12px;padding:9px}.preset-grid,.custom-grid{grid-template-columns:1fr}.resume{grid-template-columns:1fr}.resume-actions{grid-template-columns:1fr 1fr}.running-grid,.stat-grid{grid-template-columns:repeat(2,1fr)}.overview-head,.ratio-head{display:block}.quality-badge{margin-top:8px}.account-main{grid-template-columns:1fr auto}.account-main .cell{display:none}.account-detail{grid-template-columns:repeat(2,1fr);padding-left:13px}.quality-grid,.ratio-summary{grid-template-columns:repeat(2,1fr)}.ratio-controls{grid-template-columns:1fr}.top-actions .hide-mobile{display:none}.hero{padding:21px}}
`;

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}
function num(value) { return Number.isFinite(Number(value)) ? Number(value).toLocaleString() : "—"; }
function pct(value, digits = 1) { return Number.isFinite(Number(value)) ? `${Number(value).toFixed(digits)}%` : "—"; }
function ratioText(value) { return value === Infinity ? "∞" : Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)}×` : "—"; }
function phaseLabel(value) { return ({ followers:"Followers", following:"Following", posts:"Posts", engagement:"Engagement", scoring:"Scoring", complete:"Complete" })[value] ?? "Audit"; }
function relation(row) { if (row?.relationship?.mutual) return "Mutual"; if (row?.relationship?.youFollow && !row?.relationship?.followsYou) return "You follow"; if (row?.relationship?.followsYou) return "Follows you"; return "Outside network"; }
function initials(row) { return String(row?.username || row?.fullName || "?").slice(0,1).toUpperCase(); }
function safeFilePart(value) { return String(value || "instagram").replace(/[^a-z0-9._-]+/gi,"-").replace(/^-+|-+$/g,"").slice(0,60) || "instagram"; }

export function createBrowserAuditorAppV4({ runtime, documentRef = globalThis.document, windowRef = globalThis.window, mountTarget = globalThis.document?.documentElement, profileCache = null } = {}) {
  if (!runtime) throw new TypeError("A browser audit runtime is required.");
  if (!documentRef || !windowRef || !mountTarget) throw new Error("A browser document is required.");

  const cache = profileCache ?? createProfileCountCache({ storage: windowRef.localStorage });
  const state = {
    screen: "loading", run: null, resumable: null, error: null, activeFilter: "all", query: "", mutualOnly: false,
    visible: PAGE_SIZE, expanded: new Set(), controller: null, ratioController: null, ratioRunning: false,
    ratioProgress: { completed:0,total:0,failed:0,cached:0,embedded:0 }, ratioMap: new Map(), ratioSummary: null,
    ratioScope: "current", sort: "status", toast: null, toastTimer: null
  };

  const host = documentRef.createElement("div");
  host.id = "ig-engagement-auditor-v4";
  const shadow = host.attachShadow({ mode: "open" });

  function toast(message, tone = "ok", timeout = 2800) {
    state.toast = { message, tone };
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => { state.toast = null; renderToast(); }, timeout);
    renderToast();
  }
  function renderToast() {
    const old = shadow.querySelector(".toast");
    if (old) old.remove();
    if (!state.toast) return;
    const el = documentRef.createElement("div");
    el.className = `toast ${state.toast.tone}`;
    el.textContent = state.toast.message;
    shadow.querySelector(".app")?.appendChild(el);
  }

  function allRows() {
    if (!state.run) return [];
    return buildAccountRows(state.run).map(row => {
      const ratio = state.ratioMap.get(String(row.id));
      return ratio ? { ...row, ...ratio } : row;
    });
  }

  function currentRows() {
    const filter = FILTERS.find(item => item.id === state.activeFilter) ?? FILTERS[0];
    let rows = filterAccountRows(allRows(), { query: state.query, keys: filter.keys, mutualOnly: state.mutualOnly });
    if (state.activeFilter === "ratioHigher") rows = rows.filter(row => row?.followRatio?.moreFollowingThanFollowers);
    if (state.sort === "username") rows.sort((a,b) => String(a.username).localeCompare(String(b.username)));
    else if (state.sort === "participation") rows.sort((a,b) => Number(a?.observed?.participationPercent ?? 999) - Number(b?.observed?.participationPercent ?? 999));
    else if (state.sort === "ratio") rows.sort((a,b) => Number(b?.followRatio?.followingToFollowers ?? -1) - Number(a?.followRatio?.followingToFollowers ?? -1));
    else {
      const order = { inactive_high_confidence:0, inactive_likely:1, inactive_uncertain:2, low_observed_engagement:3, not_following_back:4, active:5, follower_only:6, other_engager:7 };
      rows.sort((a,b) => (order[a.key] ?? 99) - (order[b.key] ?? 99));
    }
    return rows;
  }

  function topbar() {
    return `<div class="topbar"><div class="brand"><div class="mark">IA</div><div><b>Instagram Engagement Auditor</b><small>V4 alpha · read-only</small></div></div><div class="actions"><span class="muted hide-mobile">Created by @jaetxylor</span>${state.screen === "results" ? '<button class="btn ghost" data-action="new-audit">New audit</button>' : ""}<button class="btn ghost" data-action="close">Close</button></div></div>`;
  }

  function startScreen() {
    const quick = getScanPreset("quick"), deep = getScanPreset("deep");
    return `<section class="card hero"><span class="eyebrow">Private local audit · no mutations</span><h1>Understand who actually engages.</h1><p class="lead">Audit follower relationships, observed likes/comments, engagement confidence, profile engagement rate and optional follower/following ratios from your logged-in browser session.</p><div class="preset-grid">
      ${presetHtml(quick,"⚡",true)}${presetHtml(deep,"⌕",false)}
      <article class="preset"><div class="icon">⚙</div><h2>Custom audit</h2><p class="muted">Choose the post window and engagement sources yourself.</p><div class="spacer"></div><div class="preset-meta"><span>Configurable</span><span>Advanced</span></div><button class="btn" style="margin-top:12px" data-action="custom">Configure</button></article>
    </div></section>`;
  }
  function presetHtml(preset, icon, recommended) {
    const posts = preset.configuration.postLimit ? `${preset.configuration.postLimit} posts` : "All available posts";
    return `<article class="preset ${recommended?"recommended":""}"><div class="icon">${icon}</div><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><h2 style="margin:8px 0 0">${esc(preset.label)}</h2>${recommended?'<span class="recommend">Recommended</span>':""}</div><p class="muted">${esc(preset.description)}</p><div class="spacer"></div><div class="preset-meta"><span>${esc(posts)}</span><span>Likes + comments</span></div><button class="btn ${recommended?"primary":""}" style="margin-top:12px" data-action="start" data-preset="${preset.id}">Start ${esc(preset.label)}</button></article>`;
  }

  function customScreen() {
    return `<section class="card hero"><span class="eyebrow">Custom audit</span><h1>Choose your scan depth.</h1><p class="lead">Use 0 posts for all available posts. Larger scans take longer and make more authenticated requests.</p><div class="custom-grid"><div class="field"><label>Post limit</label><input id="custom-post-limit" type="number" min="0" max="500" value="24"></div><div class="field"><label>Low participation threshold (%)</label><input id="custom-low-pct" type="number" min="0" max="100" value="10"></div><div class="field" style="grid-column:1/-1"><label>Engagement sources</label><div class="checks"><label class="check"><input id="custom-likes" type="checkbox" checked> Likes</label><label class="check"><input id="custom-comments" type="checkbox" checked> Comments</label></div></div></div><div class="actions" style="margin-top:18px"><button class="btn primary" data-action="start-custom">Start custom audit</button><button class="btn" data-action="back">Back</button></div></section>`;
  }

  function resumeScreen() {
    const r = state.resumable, p = r?.progress ?? {}, percent = Number(p.percent ?? 0);
    return `<section class="card pad resume"><div><span class="eyebrow">Saved audit found</span><h2 style="margin-top:10px">Continue where you left off?</h2><p class="muted">${esc(p.message || "A previous audit did not finish.")}</p><div class="bar"><span style="width:${Math.max(0,Math.min(100,percent))}%"></span></div><div class="progress-meta"><span>${esc(phaseLabel(p.phase))} · ${num(p.completedItems)}${Number.isFinite(Number(p.totalItems))?` / ${num(p.totalItems)}`:""}</span><span>${Math.round(percent)}%</span></div></div><div class="resume-actions"><button class="btn primary" data-action="resume">Resume audit</button><button class="btn danger" data-action="discard">Start over</button></div></section>`;
  }

  function runningScreen() {
    const p = state.run?.progress ?? {}, percent = Number(p.percent ?? 0), d = state.run?.diagnostics ?? {};
    return `<section class="card pad"><div style="display:flex;justify-content:space-between;gap:15px;align-items:flex-start"><div><span class="eyebrow">Audit running</span><h2 style="margin-top:10px">${esc(phaseLabel(p.phase))}</h2><p class="muted">${esc(p.message || "Working…")}</p></div><button class="btn danger" data-action="stop">Stop & save progress</button></div><div class="bar"><span style="width:${Math.max(0,Math.min(100,percent))}%"></span></div><div class="progress-meta"><span>${num(p.completedItems)}${Number.isFinite(Number(p.totalItems))?` / ${num(p.totalItems)}`:""} items</span><span>${Math.round(percent)}%</span></div><div class="running-grid"><div class="mini-stat"><span>Followers</span><strong>${num(state.run?.relationships?.followers?.length)}</strong></div><div class="mini-stat"><span>Following</span><strong>${num(state.run?.relationships?.following?.length)}</strong></div><div class="mini-stat"><span>Posts</span><strong>${num(state.run?.posts?.length)}</strong></div><div class="mini-stat"><span>Requests / retries</span><strong>${num(d.requestCount)} / ${num(d.retries)}</strong></div></div></section>`;
  }

  function resultsScreen() {
    const o = buildAuditOverview(state.run), rows = currentRows(), shown = rows.slice(0,state.visible);
    return `<section class="card pad"><div class="overview-head"><div><span class="eyebrow">Audit complete</span><h2 style="margin-top:9px">@${esc(o.account.username || "your account")}</h2><p class="muted">${num(o.posts)} posts scanned · ${num(o.diagnostics.requestCount)} requests · ${num(o.diagnostics.retries)} retries</p></div><button class="quality-badge" data-action="quality"><span class="dot ${esc(o.auditQuality.confidenceLevel)}"></span>${esc(o.auditQuality.confidenceLevel)} confidence · ${pct(o.auditQuality.identityCoveragePercent)}</button></div><div class="stat-grid">
      ${stat("Followers",o.relationships.followers)}${stat("Following",o.relationships.following)}${stat("Mutuals",o.relationships.mutuals)}${stat("Inactive",o.classifications.inactiveHighConfidence+o.classifications.inactiveLikely,"high + likely")}${stat("Not following back",o.relationships.notFollowingBack)}${stat("Profile ER",pct(o.engagement.profileEngagementRate,2))}${stat("Coverage",pct(o.auditQuality.identityCoveragePercent))}
    </div><div class="quick-actions"><button class="btn primary" data-action="filter" data-filter="inactive">View inactive</button><button class="btn" data-action="filter" data-filter="nonfollowers">View non-followbacks</button><button class="btn" data-action="scroll-ratio">Analyze follow ratios</button><button class="btn" data-action="export-csv">Export filtered CSV</button><button class="btn" data-action="export-json">Export full JSON</button><button class="btn" data-action="copy-usernames">Copy usernames</button></div></section>
    ${resultsTable(rows,shown)}${ratioPanel()}${qualityPanel(o)}`;
  }
  function stat(label,value,note="") { return `<div class="stat"><span>${esc(label)}</span><strong>${esc(value)}</strong>${note?`<em>${esc(note)}</em>`:""}</div>`; }

  function resultsTable(rows, shown) {
    const filters = FILTERS.map(f => `<button class="pill ${state.activeFilter===f.id?"active":""}" data-action="filter" data-filter="${f.id}">${esc(f.label)}</button>`).join("");
    return `<section class="card results" id="results"><div class="filters">${filters}</div><div class="toolbar"><input class="search" id="search" placeholder="Search username or name" value="${esc(state.query)}"><select class="select" id="sort"><option value="status" ${state.sort==="status"?"selected":""}>Sort: status</option><option value="participation" ${state.sort==="participation"?"selected":""}>Participation ↑</option><option value="username" ${state.sort==="username"?"selected":""}>Username A–Z</option><option value="ratio" ${state.sort==="ratio"?"selected":""}>Ratio ↓</option></select><label class="check"><input id="mutual-only" type="checkbox" ${state.mutualOnly?"checked":""}> Mutual only</label><span class="count">${num(rows.length)} accounts</span></div><div class="account-list">${shown.length?shown.map(accountHtml).join(""):'<div class="empty">No accounts match this view.</div>'}</div>${shown.length<rows.length?`<div class="load-more"><button class="btn" data-action="more">Load ${Math.min(PAGE_SIZE,rows.length-shown.length)} more</button></div>`:""}</section>`;
  }

  function accountHtml(row) {
    const id = String(row.id ?? ""), open = state.expanded.has(id), obs = row.observed ?? {}, conf = row.confidence ?? {}, ratio = row.followRatio;
    const avatar = row.profilePicture ? `<img src="${esc(row.profilePicture)}" alt="">` : esc(initials(row));
    return `<article class="account"><div class="account-main"><div class="identity"><div class="avatar">${avatar}</div><div class="identity-text"><a href="https://www.instagram.com/${encodeURIComponent(row.username)}/" target="_blank" rel="noreferrer">@${esc(row.username || "unknown")}</a><small>${esc(row.fullName || relation(row))}</small></div></div><div class="cell"><span>Status</span><b><span class="chip ${esc(row.tone || "neutral")}">${esc(row.label)}</span></b></div><div class="cell hide-md"><span>Relationship</span><b>${esc(relation(row))}</b></div><div class="cell"><span>Participation</span><b>${pct(obs.participationPercent)}</b></div><div class="cell hide-md"><span>Follow ratio</span><b>${ratioText(ratio?.followingToFollowers)}</b></div><button class="btn expand" data-action="expand" data-id="${esc(id)}" aria-label="Expand">${open?"−":"+"}</button></div>${open?detailHtml(row):""}</article>`;
  }
  function detailHtml(row) {
    const o=row.observed??{}, c=row.confidence??{}, r=row.followRatio, pc=row.profileCounts;
    return `<div class="account-detail"><div class="detail"><span>Likes</span><b>${num(o.likes)}</b></div><div class="detail"><span>Comments</span><b>${num(o.comments)}</b></div><div class="detail"><span>Posts engaged</span><b>${num(o.postsEngaged)} / ${num(o.totalPosts)}</b></div><div class="detail"><span>Confidence</span><b>${esc(c.level||"—")} ${Number.isFinite(c.percent)?`· ${pct(c.percent)}`:""}</b></div><div class="detail"><span>Followers</span><b>${num(pc?.followers ?? row.followerCount)}</b></div><div class="detail"><span>Following</span><b>${num(pc?.following ?? row.followingCount)}</b></div><div class="detail"><span>Following − followers</span><b>${Number.isFinite(r?.followingMinusFollowers)?r.followingMinusFollowers.toLocaleString():"—"}</b></div>${Array.isArray(c.reasons)&&c.reasons.length?`<div class="reasons">${esc(c.reasons.join(" · "))}</div>`:""}</div>`;
  }

  function ratioPanel() {
    const p=state.ratioProgress,s=state.ratioSummary;
    return `<section class="card pad ratio" id="ratio"><div class="ratio-head"><div><span class="eyebrow">Optional profile enrichment</span><h2 style="margin-top:9px">Follow-ratio analysis</h2><p class="muted">Fetch current follower/following counts only for the scope you choose. Counts are cached locally for seven days to reduce repeat requests.</p></div>${state.ratioRunning?'<button class="btn danger" data-action="stop-ratio">Stop ratio scan</button>':""}</div><div class="ratio-controls"><select class="select" id="ratio-scope"><option value="current" ${state.ratioScope==="current"?"selected":""}>Current filtered accounts I follow</option><option value="inactive" ${state.ratioScope==="inactive"?"selected":""}>Inactive / uncertain accounts I follow</option><option value="nonfollowers" ${state.ratioScope==="nonfollowers"?"selected":""}>Not following me back</option><option value="allFollowing" ${state.ratioScope==="allFollowing"?"selected":""}>All accounts I follow</option></select><button class="btn primary" data-action="ratio" ${state.ratioRunning?"disabled":""}>Analyze ratios</button><button class="btn" data-action="clear-ratio-cache" ${state.ratioRunning?"disabled":""}>Clear cache</button></div>${state.ratioRunning?`<div style="margin-top:12px"><div class="bar"><span style="width:${p.total?Math.round((p.completed/p.total)*100):0}%"></span></div><div class="progress-meta"><span>${num(p.completed)} / ${num(p.total)} profiles · ${num(p.failed)} failed</span><span>${p.total?Math.round((p.completed/p.total)*100):0}%</span></div></div>`:""}${s?`<div class="ratio-summary">${stat("Analyzed",s.total)}${stat("Counts available",s.available)}${stat("Following > followers",s.moreFollowingThanFollowers)}${stat("Cache hits",s.cached)}${stat("Failures",s.failed)}</div>`:""}</section>`;
  }

  function qualityPanel(o) {
    const warnings=state.run?.diagnostics?.warnings??[], errors=state.run?.diagnostics?.errors??[];
    return `<section class="card pad quality" id="quality"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><span class="eyebrow">Audit quality</span><h2 style="margin-top:9px">How trustworthy is this scan?</h2><p class="muted">Zero observed engagement is only strong evidence when Instagram returned enough interaction identities.</p></div></div><div class="quality-grid">${stat("Identity coverage",pct(o.auditQuality.identityCoveragePercent))}${stat("Confidence",o.auditQuality.confidenceLevel)}${stat("Incomplete posts",o.auditQuality.incompletePosts)}${stat("Warnings",warnings.length)}${stat("Errors",errors.length)}</div>${o.auditQuality.confidenceReasons.length?`<div class="section-line"><h3>Confidence reasons</h3><ul>${o.auditQuality.confidenceReasons.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>`:""}${warnings.length?`<div class="section-line"><h3>Warnings</h3><ul>${warnings.slice(0,30).map(x=>`<li>${esc(x)}</li>`).join("")}</ul></div>`:""}</section>`;
  }

  function errorScreen() {
    return `<section class="card pad error"><span class="eyebrow">Audit error</span><h2 style="margin-top:9px">The audit stopped unexpectedly.</h2><p class="muted">Your latest checkpoint was preserved when possible.</p><pre>${esc(state.error?.stack || state.error?.message || String(state.error))}</pre><div class="actions"><button class="btn primary" data-action="retry-home">Return to start</button></div></section>`;
  }

  function render() {
    let body="";
    if(state.screen==="loading") body='<section class="card pad"><span class="eyebrow">Preparing</span><h2 style="margin-top:9px">Checking your saved audits…</h2></section>';
    else if(state.screen==="start") body=startScreen();
    else if(state.screen==="custom") body=customScreen();
    else if(state.screen==="resume") body=resumeScreen();
    else if(state.screen==="running") body=runningScreen();
    else if(state.screen==="results") body=resultsScreen();
    else body=errorScreen();
    shadow.innerHTML=`<style>${CSS}</style><main class="app"><div class="shell">${topbar()}${body}<footer class="footer"><span>Read-only · local browser session · Apache-2.0</span><span>Independent project; not affiliated with Instagram or Meta.</span></footer></div></main>`;
    bindInputs(); renderToast();
  }

  function bindInputs() {
    shadow.getElementById("search")?.addEventListener("input",event=>{state.query=event.target.value;state.visible=PAGE_SIZE;render();});
    shadow.getElementById("mutual-only")?.addEventListener("change",event=>{state.mutualOnly=event.target.checked;state.visible=PAGE_SIZE;render();});
    shadow.getElementById("sort")?.addEventListener("change",event=>{state.sort=event.target.value;render();});
    shadow.getElementById("ratio-scope")?.addEventListener("change",event=>{state.ratioScope=event.target.value;});
  }

  async function startAudit(configuration,{resumeRun=null}={}) {
    state.controller=new AbortController(); state.screen="running"; state.error=null;
    if(resumeRun) state.run=resumeRun;
    render();
    try{
      const run=await runtime.runAudit({ configuration, resume:Boolean(resumeRun), resumeRun, signal:state.controller.signal, onProgress:(_progress,currentRun)=>{state.run=currentRun; if(state.screen==="running") render();} });
      state.run=run; state.resumable=null; state.screen="results"; state.activeFilter="all"; state.visible=PAGE_SIZE; render();
    }catch(error){
      if(error?.name==="AbortError"){toast("Audit stopped. Progress was saved locally.","warn",4200); try{state.resumable=await runtime.findResumableAudit();}catch{} state.screen=state.resumable?"resume":"start"; render(); return;}
      state.error=error; state.screen="error"; render();
    }finally{state.controller=null;}
  }

  function configurationForCustom(){
    const limit=Math.max(0,Number(shadow.getElementById("custom-post-limit")?.value)||0);
    const low=Math.max(0,Math.min(100,Number(shadow.getElementById("custom-low-pct")?.value)||10));
    const likes=Boolean(shadow.getElementById("custom-likes")?.checked),comments=Boolean(shadow.getElementById("custom-comments")?.checked);
    if(!likes&&!comments) throw new Error("Select likes, comments, or both.");
    return resolveScanConfiguration({preset:"custom",overrides:{postLimit:limit,lowParticipationPercent:low,likes,comments}});
  }

  function downloadText(filename,text,mime){
    const blob=new Blob([text],{type:mime}); const url=windowRef.URL.createObjectURL(blob); const a=documentRef.createElement("a"); a.href=url;a.download=filename;a.style.display="none";documentRef.body.appendChild(a);a.click();a.remove();setTimeout(()=>windowRef.URL.revokeObjectURL(url),1000);
  }
  function exportCsv(){const rows=currentRows();const name=safeFilePart(state.run?.source?.accountUsername||"instagram");downloadText(`${name}-engagement-audit.csv`,accountRowsToCsv(rows),"text/csv;charset=utf-8");toast(`Exported ${rows.length.toLocaleString()} filtered rows.`);}
  function exportJson(){const name=safeFilePart(state.run?.source?.accountUsername||"instagram");downloadText(`${name}-engagement-audit.json`,serializeAuditJson(state.run,{version:"4.0.0-alpha.1"}),"application/json;charset=utf-8");toast("Exported the complete versioned audit JSON.");}
  async function copyUsernames(){const names=currentRows().map(row=>row.username).filter(Boolean).map(name=>`@${name}`).join("\n");if(!names){toast("No usernames in the current view.","warn");return;}try{await windowRef.navigator.clipboard.writeText(names);toast(`Copied ${names.split("\n").length.toLocaleString()} usernames.`);}catch{toast("Clipboard permission was blocked by the browser.","err");}}

  function ratioAccounts(){
    const rows=allRows();
    if(state.ratioScope==="allFollowing") return state.run?.relationships?.following??[];
    if(state.ratioScope==="nonfollowers") return rows.filter(r=>r.key==="not_following_back");
    if(state.ratioScope==="inactive") return rows.filter(r=>r.relationship?.youFollow && ["inactive_high_confidence","inactive_likely","inactive_uncertain","low_observed_engagement"].includes(r.key));
    return currentRows().filter(r=>r.relationship?.youFollow);
  }
  async function runRatio(){
    const accounts=ratioAccounts(); if(!accounts.length){toast("No followed accounts are in this scope.","warn");return;}
    state.ratioRunning=true;state.ratioProgress={completed:0,total:accounts.length,failed:0,cached:0,embedded:0};state.ratioController=new AbortController();render();
    try{
      const result=await enrichProfileCounts({connector:runtime.connector,accounts,cache,signal:state.ratioController.signal,onProgress:p=>{state.ratioProgress=p;render();}});
      for(const enriched of result.results){state.ratioMap.set(String(enriched.id),{profileCounts:enriched.profileCounts,followRatio:enriched.followRatio,followerCount:enriched.profileCounts?.followers??enriched.followerCount,followingCount:enriched.profileCounts?.following??enriched.followingCount});}
      state.ratioSummary=result.summary;toast(`Ratio analysis complete: ${result.summary.moreFollowingThanFollowers.toLocaleString()} follow more accounts than follow them.`);state.activeFilter="ratioHigher";state.visible=PAGE_SIZE;
    }catch(error){if(error?.name==="AbortError")toast("Ratio analysis stopped.","warn");else toast(error?.message||String(error),"err",5000);}finally{state.ratioRunning=false;state.ratioController=null;render();}
  }

  async function handleAction(action,target){
    if(action==="close"){destroy();return;}
    if(action==="custom"){state.screen="custom";render();return;}
    if(action==="back"||action==="retry-home"){state.screen="start";state.error=null;render();return;}
    if(action==="start"){await startAudit(resolveScanConfiguration({preset:target.dataset.preset||"quick"}));return;}
    if(action==="start-custom"){try{await startAudit(configurationForCustom());}catch(error){toast(error.message,"err");}return;}
    if(action==="resume"){await startAudit(state.resumable?.configuration??{}, {resumeRun:state.resumable});return;}
    if(action==="discard"){if(state.resumable?.id)await runtime.discardAudit(state.resumable.id);state.resumable=null;state.screen="start";render();return;}
    if(action==="stop"){state.controller?.abort(new DOMException("Stopped by user","AbortError"));return;}
    if(action==="new-audit"){state.screen="start";state.run=null;state.ratioMap.clear();state.ratioSummary=null;render();return;}
    if(action==="filter"){state.activeFilter=target.dataset.filter||"all";state.visible=PAGE_SIZE;render();shadow.getElementById("results")?.scrollIntoView({behavior:"smooth",block:"start"});return;}
    if(action==="expand"){const id=target.dataset.id;state.expanded.has(id)?state.expanded.delete(id):state.expanded.add(id);render();return;}
    if(action==="more"){state.visible+=PAGE_SIZE;render();return;}
    if(action==="quality"){shadow.getElementById("quality")?.scrollIntoView({behavior:"smooth",block:"start"});return;}
    if(action==="scroll-ratio"){shadow.getElementById("ratio")?.scrollIntoView({behavior:"smooth",block:"start"});return;}
    if(action==="export-csv"){exportCsv();return;}
    if(action==="export-json"){exportJson();return;}
    if(action==="copy-usernames"){await copyUsernames();return;}
    if(action==="ratio"){await runRatio();return;}
    if(action==="stop-ratio"){state.ratioController?.abort(new DOMException("Stopped by user","AbortError"));return;}
    if(action==="clear-ratio-cache"){await cache.clear();toast("Local ratio cache cleared.");return;}
  }

  async function mount(){
    mountTarget.appendChild(host);render();
    shadow.addEventListener("click",event=>{const target=event.target.closest?.("[data-action]");if(!target)return;handleAction(target.dataset.action,target).catch(error=>toast(error?.message||String(error),"err",5000));});
    try{state.resumable=await runtime.findResumableAudit();state.screen=state.resumable?"resume":"start";}catch(error){state.error=error;state.screen="error";}render();
    return api;
  }
  function destroy(){clearTimeout(state.toastTimer);state.controller?.abort();state.ratioController?.abort();host.remove();}
  function getCurrentRun(){return state.run;}
  function getFilteredRows(){return currentRows();}
  const api=Object.freeze({mount,destroy,getCurrentRun,getFilteredRows});
  return api;
}
