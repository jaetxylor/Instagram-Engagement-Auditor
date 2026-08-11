import { createAuditEngine } from "../core/audit-engine.mjs";
import { createInstagramBrowserConnector } from "../connectors/instagram-browser.mjs";
import { applyProfileEnrichmentToRun, registerProfileEnrichmentCompletionHandler } from "../product/profile-enrichment.mjs";
import { createCheckpointStore } from "../storage/checkpoint-store.mjs";

const RESUMABLE_STATUSES = Object.freeze(["running", "paused", "failed", "cancelled"]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function replaceRunContents(target, source) {
  if (!target || !source || String(target.id ?? "") !== String(source.id ?? "")) return source;
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, clone(source));
  return target;
}

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
  let activeRun = null;

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
    const run = await engine.runAudit({
      configuration,
      resumeRun: savedRun,
      signal,
      onProgress(progress, currentRun) {
        activeRun = currentRun;
        if (typeof onProgress === "function") onProgress(progress, currentRun);
      }
    });
    activeRun = run;
    return run;
  }

  async function persistProfileEnrichment(enrichmentResult) {
    let run = activeRun;

    if (!run?.id) {
      const account = await getAccountContext();
      run = await resolvedStore.getLatest({
        accountId: account.id,
        sourceType: resolvedConnector.sourceType,
        statuses: ["complete"]
      });
    }

    if (!run?.id) throw new Error("No active audit checkpoint is available for profile enrichment.");

    const checkpoint = await resolvedStore.get(run.id) ?? run;
    const enrichedRun = applyProfileEnrichmentToRun(checkpoint, enrichmentResult);
    const savedRun = await resolvedStore.save(enrichedRun);

    if (activeRun?.id === savedRun.id) {
      replaceRunContents(activeRun, savedRun);
      return activeRun;
    }

    activeRun = savedRun;
    return savedRun;
  }

  registerProfileEnrichmentCompletionHandler(resolvedConnector, persistProfileEnrichment);

  async function discardAudit(runId) {
    if (!runId) return false;
    if (activeRun?.id === String(runId)) activeRun = null;
    return resolvedStore.delete(runId);
  }

  async function clearLocalHistory() {
    activeRun = null;
    return resolvedStore.clear();
  }

  return Object.freeze({
    connector: resolvedConnector,
    checkpointStore: resolvedStore,
    engine,
    getAccountContext,
    findResumableAudit,
    runAudit,
    persistProfileEnrichment,
    discardAudit,
    clearLocalHistory
  });
}
