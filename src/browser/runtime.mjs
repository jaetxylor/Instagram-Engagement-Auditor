import { createAuditEngine } from "../core/audit-engine.mjs";
import { createInstagramBrowserConnector } from "../connectors/instagram-browser.mjs";
import { createCheckpointStore } from "../storage/checkpoint-store.mjs";

const RESUMABLE_STATUSES = Object.freeze(["running", "paused", "failed", "cancelled"]);

export function createBrowserAuditRuntime({
  connector = null,
  checkpointStore = null,
  documentRef = globalThis.document,
  indexedDB = globalThis.indexedDB,
  requestClient = null,
  requestClientOptions = {},
  refreshPostCounts = true
} = {}) {
  const resolvedConnector = connector ?? createInstagramBrowserConnector({
    client: requestClient,
    documentRef,
    refreshPostCounts,
    requestClientOptions
  });

  const resolvedStore = checkpointStore ?? createCheckpointStore({ indexedDB });
  const engine = createAuditEngine({
    connector: resolvedConnector,
    checkpointStore: resolvedStore
  });

  async function getAccountContext(signal = null) {
    return resolvedConnector.getAccountContext({ signal });
  }

  async function findResumableAudit({ signal = null } = {}) {
    const account = await getAccountContext(signal);
    return resolvedStore.getLatest({
      accountId: account.id,
      sourceType: resolvedConnector.sourceType,
      statuses: RESUMABLE_STATUSES
    });
  }

  async function runAudit({
    configuration = {},
    resume = true,
    resumeRun = null,
    signal = null,
    onProgress = null
  } = {}) {
    const savedRun = resumeRun ?? (resume ? await findResumableAudit({ signal }) : null);
    return engine.runAudit({
      configuration,
      resumeRun: savedRun,
      signal,
      onProgress
    });
  }

  async function discardAudit(runId) {
    if (!runId) return false;
    return resolvedStore.delete(runId);
  }

  async function clearLocalHistory() {
    return resolvedStore.clear();
  }

  return Object.freeze({
    connector: resolvedConnector,
    checkpointStore: resolvedStore,
    engine,
    getAccountContext,
    findResumableAudit,
    runAudit,
    discardAudit,
    clearLocalHistory
  });
}
