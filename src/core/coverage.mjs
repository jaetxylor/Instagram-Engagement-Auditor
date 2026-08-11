import { average, clamp } from "./statistics.mjs";

export const DEFAULT_CONFIDENCE_THRESHOLDS = Object.freeze({
  highOverall: 95,
  highPosts: 90,
  highPostCoverage: 90,
  mediumOverall: 80,
  mediumPosts: 70
});

export function makeCoverageUnit({ expected, returned, known = true, modality = "unknown" } = {}) {
  const expectedNumber = Number(expected);
  const returnedNumber = Number(returned);
  const hasExpected = Number.isFinite(expectedNumber) && expectedNumber >= 0;
  const hasReturned = Number.isFinite(returnedNumber) && returnedNumber >= 0;
  const evaluable = Boolean(known && hasExpected && hasReturned);

  if (!evaluable) {
    return {
      modality,
      known: false,
      expected: hasExpected ? expectedNumber : null,
      returned: hasReturned ? returnedNumber : 0,
      matched: null,
      missing: null,
      percent: null
    };
  }

  const matched = Math.min(expectedNumber, returnedNumber);
  const percent = expectedNumber === 0
    ? 100
    : clamp((matched / expectedNumber) * 100, 0, 100);

  return {
    modality,
    known: true,
    expected: expectedNumber,
    returned: returnedNumber,
    matched,
    missing: Math.max(0, expectedNumber - returnedNumber),
    percent
  };
}

export function combinePostCoverage(modalities = {}) {
  const entries = Object.entries(modalities)
    .map(([name, value]) => value ? { name, ...value } : null)
    .filter(Boolean);
  const evaluable = entries.filter(entry => entry.known && Number.isFinite(entry.percent));

  return {
    modalities: entries,
    evaluableModalities: evaluable.length,
    totalModalities: entries.length,
    complete: entries.length > 0 && evaluable.length === entries.length,
    percent: entries.length > 0 && evaluable.length === entries.length
      ? average(evaluable.map(entry => entry.percent))
      : null
  };
}

export function confidenceFromCoverage(summary, thresholds = DEFAULT_CONFIDENCE_THRESHOLDS) {
  const overall = summary?.overallPercent;
  const highPostPercent = summary?.highCoveragePostPercent;
  const reasons = [];

  if (!Number.isFinite(overall) || !Number.isFinite(highPostPercent)) {
    return {
      level: "low",
      percent: Number.isFinite(overall) ? overall : null,
      reasons: ["Not enough evaluable interaction coverage to make a strong negative claim."]
    };
  }

  if (overall >= thresholds.highOverall && highPostPercent >= thresholds.highPosts) {
    reasons.push(`Overall identity coverage is ${overall.toFixed(1)}%.`);
    reasons.push(`${highPostPercent.toFixed(1)}% of evaluable posts meet the high-coverage threshold.`);
    return { level: "high", percent: overall, reasons };
  }

  if (overall >= thresholds.mediumOverall && highPostPercent >= thresholds.mediumPosts) {
    reasons.push(`Overall identity coverage is ${overall.toFixed(1)}%.`);
    reasons.push(`${highPostPercent.toFixed(1)}% of evaluable posts meet the high-coverage threshold.`);
    return { level: "medium", percent: overall, reasons };
  }

  reasons.push(`Overall identity coverage is ${overall.toFixed(1)}%.`);
  reasons.push(`Only ${highPostPercent.toFixed(1)}% of evaluable posts meet the high-coverage threshold.`);
  return { level: "low", percent: overall, reasons };
}

export function summarizeAuditCoverage(posts, {
  enabledModalities = ["likes", "comments"],
  thresholds = DEFAULT_CONFIDENCE_THRESHOLDS
} = {}) {
  let expected = 0;
  let matched = 0;
  let evaluableUnits = 0;
  let incompletePosts = 0;
  let highCoveragePosts = 0;
  let evaluablePosts = 0;

  const diagnostics = Array.from(posts ?? []).map((post, index) => {
    const selected = {};

    for (const modality of enabledModalities) {
      if (post?.coverage?.[modality]) selected[modality] = post.coverage[modality];
    }

    const combined = combinePostCoverage(selected);

    for (const unit of combined.modalities) {
      if (!unit.known || !Number.isFinite(unit.expected) || !Number.isFinite(unit.matched)) continue;
      expected += unit.expected;
      matched += unit.matched;
      evaluableUnits += 1;
    }

    if (combined.complete && Number.isFinite(combined.percent)) {
      evaluablePosts += 1;
      if (combined.percent >= thresholds.highPostCoverage) highCoveragePosts += 1;
      if (combined.percent < 99.999) incompletePosts += 1;
    }

    return {
      index,
      postId: String(post?.id ?? post?.pk ?? ""),
      shortcode: post?.shortcode ?? post?.code ?? "",
      ...combined
    };
  });

  const overallPercent = evaluableUnits
    ? expected === 0 ? 100 : clamp((matched / expected) * 100, 0, 100)
    : null;
  const highCoveragePostPercent = evaluablePosts
    ? (highCoveragePosts / evaluablePosts) * 100
    : null;

  const summary = {
    expected,
    matched,
    evaluableUnits,
    evaluablePosts,
    highCoveragePosts,
    highCoveragePostPercent,
    incompletePosts,
    overallPercent,
    diagnostics
  };

  return {
    ...summary,
    confidence: confidenceFromCoverage(summary, thresholds)
  };
}
