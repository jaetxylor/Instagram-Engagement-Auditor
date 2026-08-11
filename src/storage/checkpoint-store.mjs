import { deserializeAuditRun, serializeAuditRun, validateAuditRun } from "../core/audit-schema.mjs";

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export class MemoryCheckpointStore {
  constructor() {
    this.runs = new Map();
  }

  async save(run) {
    const validation = validateAuditRun(run);
    if (!validation.valid) throw new TypeError(`Cannot save invalid audit run: ${validation.errors.join(" ")}`);
    const copy = deserializeAuditRun(serializeAuditRun(run));
    this.runs.set(copy.id, copy);
    return clone(copy);
  }

  async get(id) {
    return clone(this.runs.get(String(id)) ?? null);
  }

  async list({ limit = 20 } = {}) {
    return [...this.runs.values()]
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, Math.max(0, Number(limit) || 0))
      .map(clone);
  }

  async getLatest({ accountId = null, sourceType = null, statuses = null } = {}) {
    const allowed = Array.isArray(statuses) ? new Set(statuses) : null;
    const runs = await this.list({ limit: Number.MAX_SAFE_INTEGER });
    return runs.find(run => {
      if (accountId != null && String(run.source?.accountId) !== String(accountId)) return false;
      if (sourceType != null && run.source?.type !== sourceType) return false;
      if (allowed && !allowed.has(run.status)) return false;
      return true;
    }) ?? null;
  }

  async delete(id) {
    return this.runs.delete(String(id));
  }

  async clear() {
    this.runs.clear();
  }
}

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export class IndexedDbCheckpointStore {
  constructor({
    indexedDB = globalThis.indexedDB,
    databaseName = "instagram-engagement-auditor",
    storeName = "audit_runs",
    version = 1
  } = {}) {
    if (!indexedDB) throw new Error("IndexedDB is not available in this environment.");
    this.indexedDB = indexedDB;
    this.databaseName = databaseName;
    this.storeName = storeName;
    this.version = version;
    this.dbPromise = null;
  }

  async open() {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = this.indexedDB.open(this.databaseName, this.version);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt", { unique: false });
          store.createIndex("status", "status", { unique: false });
          store.createIndex("sourceAccountId", "source.accountId", { unique: false });
          store.createIndex("sourceType", "source.type", { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error ?? new Error("Could not open audit checkpoint database."));
      };
      request.onblocked = () => {
        this.dbPromise = null;
        reject(new Error("Audit checkpoint database upgrade is blocked by another open tab."));
      };
    });

    return this.dbPromise;
  }

  async save(run) {
    const validation = validateAuditRun(run);
    if (!validation.valid) throw new TypeError(`Cannot save invalid audit run: ${validation.errors.join(" ")}`);

    const db = await this.open();
    const tx = db.transaction(this.storeName, "readwrite");
    tx.objectStore(this.storeName).put(clone(run));
    await transactionPromise(tx);
    return clone(run);
  }

  async get(id) {
    const db = await this.open();
    const tx = db.transaction(this.storeName, "readonly");
    const result = await requestPromise(tx.objectStore(this.storeName).get(String(id)));
    await transactionPromise(tx);
    return result ? clone(result) : null;
  }

  async list({ limit = 20 } = {}) {
    const db = await this.open();
    const tx = db.transaction(this.storeName, "readonly");
    const store = tx.objectStore(this.storeName);
    const request = store.getAll();
    const rows = await requestPromise(request);
    await transactionPromise(tx);

    return rows
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, Math.max(0, Number(limit) || 0))
      .map(clone);
  }

  async getLatest({ accountId = null, sourceType = null, statuses = null } = {}) {
    const allowed = Array.isArray(statuses) ? new Set(statuses) : null;
    const runs = await this.list({ limit: Number.MAX_SAFE_INTEGER });

    return runs.find(run => {
      if (accountId != null && String(run.source?.accountId) !== String(accountId)) return false;
      if (sourceType != null && run.source?.type !== sourceType) return false;
      if (allowed && !allowed.has(run.status)) return false;
      return true;
    }) ?? null;
  }

  async delete(id) {
    const db = await this.open();
    const tx = db.transaction(this.storeName, "readwrite");
    tx.objectStore(this.storeName).delete(String(id));
    await transactionPromise(tx);
    return true;
  }

  async clear() {
    const db = await this.open();
    const tx = db.transaction(this.storeName, "readwrite");
    tx.objectStore(this.storeName).clear();
    await transactionPromise(tx);
  }

  async close() {
    const db = await this.open();
    db.close();
    this.dbPromise = null;
  }
}

export function createCheckpointStore(options = {}) {
  if (options.memory || !options.indexedDB && !globalThis.indexedDB) {
    return new MemoryCheckpointStore();
  }
  return new IndexedDbCheckpointStore(options);
}
