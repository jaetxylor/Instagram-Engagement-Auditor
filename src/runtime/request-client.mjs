export class HttpRequestError extends Error {
  constructor(message, { status = null, body = null, retryable = false, url = "" } = {}) {
    super(message);
    this.name = "HttpRequestError";
    this.status = status;
    this.body = body;
    this.retryable = retryable;
    this.url = url;
  }
}

function defaultSleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomBetween(random, min, max) {
  if (max <= min) return min;
  return Math.floor(min + random() * (max - min + 1));
}

function abortError(reason = "Aborted") {
  if (typeof DOMException === "function") return new DOMException(String(reason), "AbortError");
  const error = new Error(String(reason));
  error.name = "AbortError";
  return error;
}

function retryAfterMs(response) {
  const value = response?.headers?.get?.("retry-after");
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

function isRetryableStatus(status) {
  return status === 429 || status === 408 || status === 425 || status >= 500;
}

export class AdaptiveRequestClient {
  constructor({
    fetchImpl = globalThis.fetch,
    sleep = defaultSleep,
    random = Math.random,
    minDelayMs = 850,
    maxDelayMs = 1700,
    cooldownEvery = 14,
    cooldownMinMs = 6500,
    cooldownMaxMs = 11500,
    timeoutMs = 20000,
    maxRetries = 2,
    maxBackoffMs = 60000,
    onEvent = null
  } = {}) {
    if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
    this.fetchImpl = fetchImpl;
    this.sleep = sleep;
    this.random = random;
    this.minDelayMs = Math.max(0, Number(minDelayMs) || 0);
    this.maxDelayMs = Math.max(this.minDelayMs, Number(maxDelayMs) || this.minDelayMs);
    this.cooldownEvery = Math.max(0, Number(cooldownEvery) || 0);
    this.cooldownMinMs = Math.max(0, Number(cooldownMinMs) || 0);
    this.cooldownMaxMs = Math.max(this.cooldownMinMs, Number(cooldownMaxMs) || this.cooldownMinMs);
    this.timeoutMs = Math.max(0, Number(timeoutMs) || 0);
    this.maxRetries = Math.max(0, Number(maxRetries) || 0);
    this.maxBackoffMs = Math.max(1000, Number(maxBackoffMs) || 60000);
    this.onEvent = typeof onEvent === "function" ? onEvent : null;
    this.requests = 0;
    this.retries = 0;
    this.consecutiveFailures = 0;
  }

  emit(type, detail = {}) {
    this.onEvent?.({ type, ...detail, requests: this.requests, retries: this.retries });
  }

  async wait(ms, signal) {
    if (signal?.aborted) throw signal.reason ?? abortError();
    if (ms <= 0) return;
    if (!signal) {
      await this.sleep(ms);
      return;
    }

    await new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => signal.removeEventListener("abort", onAbort);
      const finish = fn => value => {
        if (settled) return;
        settled = true;
        cleanup();
        fn(value);
      };
      const onResolve = finish(resolve);
      const onReject = finish(reject);
      const onAbort = () => onReject(signal.reason ?? abortError());

      signal.addEventListener("abort", onAbort, { once: true });
      Promise.resolve(this.sleep(ms)).then(onResolve, onReject);
    });

    if (signal.aborted) throw signal.reason ?? abortError();
  }

  async pace(signal) {
    if (this.requests > 0) {
      const adaptivePenalty = Math.min(8000, this.consecutiveFailures * 750);
      const delay = randomBetween(this.random, this.minDelayMs, this.maxDelayMs) + adaptivePenalty;
      this.emit("pace", { delay });
      await this.wait(delay, signal);
    }

    if (this.cooldownEvery > 0 && this.requests > 0 && this.requests % this.cooldownEvery === 0) {
      const delay = randomBetween(this.random, this.cooldownMinMs, this.cooldownMaxMs);
      this.emit("cooldown", { delay });
      await this.wait(delay, signal);
    }
  }

  async requestJson(url, {
    method = "GET",
    headers = {},
    credentials = "include",
    mode = "cors",
    body = undefined,
    signal = null,
    retries = this.maxRetries,
    timeoutMs = this.timeoutMs
  } = {}) {
    const maxAttempts = Math.max(0, Number(retries) || 0) + 1;
    let lastError = null;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      await this.pace(signal);
      if (signal?.aborted) throw signal.reason ?? abortError();

      const controller = new AbortController();
      let timeout = null;
      let removeAbortListener = null;

      if (signal) {
        const onAbort = () => controller.abort(signal.reason ?? abortError());
        signal.addEventListener("abort", onAbort, { once: true });
        removeAbortListener = () => signal.removeEventListener("abort", onAbort);
      }

      if (timeoutMs > 0) {
        timeout = setTimeout(() => controller.abort(abortError(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
      }

      try {
        this.requests += 1;
        this.emit("request", { url: String(url), attempt: attempt + 1 });
        const response = await this.fetchImpl(url, {
          method,
          headers,
          credentials,
          mode,
          body,
          signal: controller.signal
        });
        const text = await response.text();
        let data = {};

        if (text) {
          try {
            data = JSON.parse(text);
          } catch {
            data = { raw: text };
          }
        }

        if (response.ok) {
          this.consecutiveFailures = Math.max(0, this.consecutiveFailures - 1);
          this.emit("success", { url: String(url), status: response.status });
          return data;
        }

        const message = data?.message || data?.error_title || data?.raw || response.statusText || `HTTP ${response.status}`;
        const retryable = isRetryableStatus(response.status);
        const error = new HttpRequestError(`${response.status}: ${String(message).slice(0, 240)}`, {
          status: response.status,
          body: data,
          retryable,
          url: String(url)
        });
        lastError = error;
        this.consecutiveFailures += 1;
        this.emit("failure", { url: String(url), status: response.status, retryable });

        if (!retryable || attempt >= maxAttempts - 1) throw error;

        this.retries += 1;
        const headerDelay = retryAfterMs(response);
        const exponential = Math.min(this.maxBackoffMs, 1500 * (2 ** attempt));
        const jitter = randomBetween(this.random, 250, 1500);
        const delay = Math.min(this.maxBackoffMs, headerDelay ?? exponential + jitter);
        this.emit("retry", { url: String(url), status: response.status, delay, attempt: attempt + 1 });
        await this.wait(delay, signal);
      } catch (error) {
        if (controller.signal.aborted) {
          if (signal?.aborted) throw signal.reason ?? abortError();
          lastError = controller.signal.reason ?? error;
          if (attempt >= maxAttempts - 1) throw lastError;
          this.retries += 1;
          this.consecutiveFailures += 1;
          const delay = Math.min(this.maxBackoffMs, 1500 * (2 ** attempt) + randomBetween(this.random, 250, 1500));
          this.emit("retry", { url: String(url), status: null, delay, attempt: attempt + 1 });
          await this.wait(delay, signal);
          continue;
        }

        if (error instanceof HttpRequestError) throw error;
        lastError = error;
        this.consecutiveFailures += 1;

        if (attempt >= maxAttempts - 1) throw error;
        this.retries += 1;
        const delay = Math.min(this.maxBackoffMs, 1500 * (2 ** attempt) + randomBetween(this.random, 250, 1500));
        this.emit("retry", { url: String(url), status: null, delay, attempt: attempt + 1 });
        await this.wait(delay, signal);
      } finally {
        if (timeout) clearTimeout(timeout);
        removeAbortListener?.();
      }
    }

    throw lastError ?? new Error("Request failed");
  }

  getDiagnostics() {
    return {
      requestCount: this.requests,
      retries: this.retries,
      consecutiveFailures: this.consecutiveFailures
    };
  }
}
