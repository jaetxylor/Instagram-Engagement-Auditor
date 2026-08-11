function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export class MemoryProfileCountCache {
  constructor({ ttlMs = 7 * 24 * 60 * 60 * 1000, now = () => Date.now() } = {}) {
    this.ttlMs = Math.max(0, Number(ttlMs) || 0);
    this.now = now;
    this.records = new Map();
  }

  isFresh(record) {
    if (!record) return false;
    if (!this.ttlMs) return true;
    const timestamp = Date.parse(record.fetchedAt ?? "");
    return Number.isFinite(timestamp) && this.now() - timestamp <= this.ttlMs;
  }

  async get(id) {
    const key = String(id ?? "");
    const record = this.records.get(key) ?? null;
    if (!this.isFresh(record)) {
      if (record) this.records.delete(key);
      return null;
    }
    return clone(record);
  }

  async set(id, record) {
    const key = String(id ?? "");
    if (!key) return null;
    const next = {
      ...clone(record),
      fetchedAt: record?.fetchedAt ?? new Date(this.now()).toISOString()
    };
    this.records.set(key, next);
    return clone(next);
  }

  async delete(id) {
    return this.records.delete(String(id ?? ""));
  }

  async clear() {
    this.records.clear();
  }
}

export class LocalStorageProfileCountCache extends MemoryProfileCountCache {
  constructor({
    storage = globalThis.localStorage,
    key = "iga_v4_profile_counts",
    ttlMs = 7 * 24 * 60 * 60 * 1000,
    now = () => Date.now()
  } = {}) {
    super({ ttlMs, now });
    if (!storage) throw new Error("Local storage is unavailable in this environment.");
    this.storage = storage;
    this.key = key;
    this.loaded = false;
  }

  load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const parsed = JSON.parse(this.storage.getItem(this.key) || "{}");
      for (const [id, record] of Object.entries(parsed ?? {})) {
        if (this.isFresh(record)) this.records.set(String(id), record);
      }
      this.persist();
    } catch {
      this.records.clear();
      try { this.storage.removeItem(this.key); } catch {}
    }
  }

  persist() {
    try {
      this.storage.setItem(this.key, JSON.stringify(Object.fromEntries(this.records)));
    } catch {}
  }

  async get(id) {
    this.load();
    const value = await super.get(id);
    this.persist();
    return value;
  }

  async set(id, record) {
    this.load();
    const value = await super.set(id, record);
    this.persist();
    return value;
  }

  async delete(id) {
    this.load();
    const removed = await super.delete(id);
    this.persist();
    return removed;
  }

  async clear() {
    this.load();
    await super.clear();
    try { this.storage.removeItem(this.key); } catch {}
  }
}

export function createProfileCountCache(options = {}) {
  if (options.memory || !options.storage && !globalThis.localStorage) {
    return new MemoryProfileCountCache(options);
  }
  return new LocalStorageProfileCountCache(options);
}
