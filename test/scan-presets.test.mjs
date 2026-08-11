import test from "node:test";
import assert from "node:assert/strict";
import { getScanPreset, resolveScanConfiguration, SCAN_PRESETS } from "../src/product/scan-presets.mjs";

test("quick preset is a conservative recommended first scan", () => {
  const quick = getScanPreset("quick");
  assert.equal(quick.id, "quick");
  assert.equal(quick.configuration.postLimit, 12);
  assert.equal(quick.configuration.likes, true);
  assert.equal(quick.configuration.comments, true);
  assert.equal(quick.configuration.refreshPostCounts, true);
});

test("deep preset requests all connector-returned posts", () => {
  assert.equal(SCAN_PRESETS.deep.configuration.postLimit, 0);
});

test("preset configuration can be safely overridden per client", () => {
  const configuration = resolveScanConfiguration({
    preset: "quick",
    overrides: { postLimit: 24, comments: false }
  });

  assert.equal(configuration.preset, "quick");
  assert.equal(configuration.postLimit, 24);
  assert.equal(configuration.comments, false);
  assert.equal(configuration.likes, true);
});

test("unknown preset falls back to quick without mutating defaults", () => {
  const first = getScanPreset("does-not-exist");
  first.configuration.postLimit = 999;
  const second = getScanPreset("quick");

  assert.equal(first.id, "quick");
  assert.equal(second.configuration.postLimit, 12);
});
