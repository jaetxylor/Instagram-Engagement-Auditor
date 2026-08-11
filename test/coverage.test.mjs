import test from "node:test";
import assert from "node:assert/strict";
import {
  combinePostCoverage,
  confidenceFromCoverage,
  makeCoverageUnit,
  summarizeAuditCoverage
} from "../src/core/coverage.mjs";

test("coverage unit never exceeds 100 percent", () => {
  const unit = makeCoverageUnit({ expected: 10, returned: 12, modality: "likes" });
  assert.equal(unit.matched, 10);
  assert.equal(unit.missing, 0);
  assert.equal(unit.percent, 100);
});

test("unknown coverage stays explicitly unknown", () => {
  const unit = makeCoverageUnit({ expected: null, returned: 5, known: false, modality: "comments" });
  assert.equal(unit.known, false);
  assert.equal(unit.percent, null);
  assert.equal(unit.missing, null);
});

test("post coverage requires every selected modality to be evaluable", () => {
  const combined = combinePostCoverage({
    likes: makeCoverageUnit({ expected: 100, returned: 95, modality: "likes" }),
    comments: makeCoverageUnit({ expected: null, returned: 2, known: false, modality: "comments" })
  });

  assert.equal(combined.complete, false);
  assert.equal(combined.percent, null);
});

test("strong audit coverage produces high confidence", () => {
  const posts = Array.from({ length: 10 }, (_, index) => ({
    id: `p${index}`,
    coverage: {
      likes: makeCoverageUnit({ expected: 100, returned: 98, modality: "likes" }),
      comments: makeCoverageUnit({ expected: 20, returned: 20, modality: "comments" })
    }
  }));

  const summary = summarizeAuditCoverage(posts);
  assert.equal(summary.evaluablePosts, 10);
  assert.equal(summary.highCoveragePosts, 10);
  assert.equal(summary.confidence.level, "high");
  assert.ok(summary.overallPercent > 95);
});

test("weak coverage prevents zero observations from being treated as strong evidence", () => {
  const posts = Array.from({ length: 4 }, (_, index) => ({
    id: `p${index}`,
    coverage: {
      likes: makeCoverageUnit({ expected: 100, returned: 50, modality: "likes" }),
      comments: makeCoverageUnit({ expected: 20, returned: 10, modality: "comments" })
    }
  }));

  const summary = summarizeAuditCoverage(posts);
  assert.equal(summary.confidence.level, "low");
  assert.equal(summary.overallPercent, 50);
});

test("confidenceFromCoverage explains why data is not evaluable", () => {
  const result = confidenceFromCoverage({ overallPercent: null, highCoveragePostPercent: null });
  assert.equal(result.level, "low");
  assert.ok(result.reasons.length > 0);
});
