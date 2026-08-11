import test from "node:test";
import assert from "node:assert/strict";
import { accountRowsToCsv, csvEscape } from "../src/reporting/csv.mjs";
import { buildAuditExport, serializeAuditJson } from "../src/reporting/json.mjs";

test("csv escaping protects commas, quotes and newlines", () => {
  assert.equal(csvEscape("plain"), "plain");
  assert.equal(csvEscape("a,b"), '"a,b"');
  assert.equal(csvEscape('a"b'), '"a""b"');
  assert.equal(csvEscape("a\nb"), '"a\nb"');
});

test("account CSV exports relationship, observed engagement and confidence", () => {
  const csv = accountRowsToCsv([{
    id: "u1",
    username: "creator",
    fullName: "Creator, One",
    relationship: { followsYou: true, youFollow: true, mutual: true },
    key: "active",
    label: "Active",
    observed: {
      likes: 4,
      comments: 2,
      postsEngaged: 5,
      totalPosts: 12,
      participationPercent: 41.6667,
      weightedScore: 10
    },
    confidence: { level: "high", percent: 96.4 }
  }]);

  assert.match(csv, /classification_key/);
  assert.match(csv, /"Creator, One"/);
  assert.match(csv, /mutual/);
  assert.match(csv, /41\.6667/);
  assert.match(csv, /high,96\.4/);
});

test("JSON export wraps the versioned audit without mutating it", () => {
  const run = { id: "audit-1", schemaVersion: 1, status: "complete" };
  const exported = buildAuditExport(run, {
    exportedAt: "2026-08-11T00:00:00.000Z",
    version: "4.0.0-test"
  });

  assert.equal(exported.exportSchemaVersion, 1);
  assert.equal(exported.meta.creator, "@jaetxylor");
  assert.equal(exported.meta.version, "4.0.0-test");
  assert.deepEqual(exported.audit, run);
  assert.notEqual(exported.audit, run);

  const parsed = JSON.parse(serializeAuditJson(run, { exportedAt: "2026-08-11T00:00:00.000Z" }));
  assert.equal(parsed.audit.id, "audit-1");
});
