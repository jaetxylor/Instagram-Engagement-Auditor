import test from "node:test";
import assert from "node:assert/strict";
import { AdaptiveRequestClient, HttpRequestError } from "../src/runtime/request-client.mjs";

function response(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP ${status}`,
    headers: {
      get(name) {
        return headers[String(name).toLowerCase()] ?? null;
      }
    },
    async text() {
      return typeof body === "string" ? body : JSON.stringify(body);
    }
  };
}

test("request client returns parsed JSON on success", async () => {
  const client = new AdaptiveRequestClient({
    fetchImpl: async () => response(200, { ok: true }),
    sleep: async () => {},
    random: () => 0,
    minDelayMs: 0,
    maxDelayMs: 0,
    cooldownEvery: 0,
    timeoutMs: 0
  });

  const result = await client.requestJson("/test");
  assert.deepEqual(result, { ok: true });
  assert.equal(client.getDiagnostics().requestCount, 1);
});

test("request client retries rate limits with backoff", async () => {
  const sleeps = [];
  let attempt = 0;
  const client = new AdaptiveRequestClient({
    fetchImpl: async () => {
      attempt += 1;
      return attempt === 1
        ? response(429, { message: "slow down" }, { "retry-after": "2" })
        : response(200, { ok: true });
    },
    sleep: async ms => { sleeps.push(ms); },
    random: () => 0,
    minDelayMs: 0,
    maxDelayMs: 0,
    cooldownEvery: 0,
    timeoutMs: 0,
    maxRetries: 2
  });

  const result = await client.requestJson("/rate-limited");
  assert.deepEqual(result, { ok: true });
  assert.equal(client.getDiagnostics().requestCount, 2);
  assert.equal(client.getDiagnostics().retries, 1);
  assert.ok(sleeps.includes(2000));
});

test("request client does not retry ordinary client errors", async () => {
  let attempts = 0;
  const client = new AdaptiveRequestClient({
    fetchImpl: async () => {
      attempts += 1;
      return response(400, { message: "bad request" });
    },
    sleep: async () => {},
    minDelayMs: 0,
    maxDelayMs: 0,
    cooldownEvery: 0,
    timeoutMs: 0,
    maxRetries: 3
  });

  await assert.rejects(
    client.requestJson("/bad"),
    error => error instanceof HttpRequestError && error.status === 400 && error.retryable === false
  );
  assert.equal(attempts, 1);
  assert.equal(client.getDiagnostics().retries, 0);
});

test("request client retries transient server errors", async () => {
  let attempts = 0;
  const client = new AdaptiveRequestClient({
    fetchImpl: async () => {
      attempts += 1;
      return attempts < 3
        ? response(503, { message: "temporary" })
        : response(200, { recovered: true });
    },
    sleep: async () => {},
    random: () => 0,
    minDelayMs: 0,
    maxDelayMs: 0,
    cooldownEvery: 0,
    timeoutMs: 0,
    maxRetries: 2
  });

  const result = await client.requestJson("/temporary");
  assert.deepEqual(result, { recovered: true });
  assert.equal(attempts, 3);
  assert.equal(client.getDiagnostics().retries, 2);
});
