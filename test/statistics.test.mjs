import test from "node:test";
import assert from "node:assert/strict";
import { average, clamp, iqrFilter, median, quantile } from "../src/core/statistics.mjs";

test("clamp keeps values inside bounds", () => {
  assert.equal(clamp(-2, 0, 10), 0);
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(42, 0, 10), 10);
});

test("average ignores non-finite values", () => {
  assert.equal(average([1, 2, Number.NaN, Infinity, 3]), 2);
  assert.equal(average([]), null);
});

test("median handles odd and even arrays", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
});

test("quantile interpolates sorted values", () => {
  assert.equal(quantile([0, 10, 20, 30], 0.5), 15);
  assert.equal(quantile([0, 10, 20, 30], 0), 0);
  assert.equal(quantile([0, 10, 20, 30], 1), 30);
});

test("iqrFilter removes obvious statistical outlier", () => {
  const result = iqrFilter([1, 1, 2, 2, 2, 3, 3, 100]);
  assert.deepEqual(result.removed, [100]);
  assert.equal(result.kept.includes(100), false);
  assert.equal(result.kept.length, 7);
});

test("iqrFilter does not overfit tiny samples", () => {
  const result = iqrFilter([1, 2, 100]);
  assert.deepEqual(result.kept, [1, 2, 100]);
  assert.deepEqual(result.removed, []);
});
