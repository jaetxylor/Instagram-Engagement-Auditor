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
    "confidence_percent"
  ];

  const lines = Array.from(rows ?? []).map(row => {
    const observed = row?.observed ?? {};
    const confidence = row?.confidence ?? {};
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
      Number.isFinite(confidence?.percent) ? confidence.percent : ""
    ];
    return values.map(csvEscape).join(",");
  });

  return [headers.join(","), ...lines].join("\n");
}

export { csvEscape };
