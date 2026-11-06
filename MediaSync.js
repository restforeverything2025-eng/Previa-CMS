/**
 * ==========================================
 * PREVIA Media Sync
 * ------------------------------------------
 * Synchronizes product images between Drive
 * and GitHub while protecting missing SKUs.
 * ==========================================
 */

function getMediaManifest(products) {
  if (!products) {
    products = getProducts();
  }

  const manifest = {};
  products.forEach((product) => {
    manifest[product.sku] = getProductFiles(product.sku);
  });

  return manifest;
}

/**
 * Reads the Drive inventory for sync. A missing SKU folder is
 * recorded explicitly; other Drive/API errors propagate and stop
 * planning before any GitHub mutations are attempted.
 */
function getMediaSyncInventory(products) {
  if (!products) {
    products = getProducts();
  }

  const driveManifest = {};
  const missingDriveSkus = [];

  products.forEach((product) => {
    const sku = product.sku;
    const result = getProductFilesResult(sku);

    if (!result.found) {
      missingDriveSkus.push(sku);
      return;
    }

    driveManifest[sku] = result.files;
  });

  return {
    driveManifest: driveManifest,
    missingDriveSkus: missingDriveSkus,
  };
}

/**
 * Keep the last published list for SKUs whose Drive folder is
 * missing. Never interpret that missing folder as an empty folder.
 */
function mergeMediaManifests(
  driveManifest,
  previousManifest,
  missingDriveSkus,
) {
  const merged = {};
  const missingSkus = new Set(missingDriveSkus || []);

  Object.keys(driveManifest || {}).forEach((sku) => {
    merged[sku] = driveManifest[sku];
  });

  missingSkus.forEach((sku) => {
    if (
      previousManifest &&
      Object.prototype.hasOwnProperty.call(previousManifest, sku)
    ) {
      merged[sku] = previousManifest[sku];
    }
  });

  return merged;
}

function getSafeMediaManifest(products) {
  const inventory = getMediaSyncInventory(products);
  const previousManifest = getPublishedMediaManifest();

  return mergeMediaManifests(
    inventory.driveManifest,
    previousManifest,
    inventory.missingDriveSkus,
  );
}

function testMediaManifest() {
  const manifest = getMediaManifest();
  const skuCount = Object.keys(manifest).length;
  const imageCount = Object.keys(manifest).reduce((total, sku) =>
    total + (manifest[sku] || []).length, 0,
  );
  Logger.log("Drive media inventory summary: SKUs=" + skuCount + ", images=" + imageCount + ".");
}

function testDriveFileInfo() {
  const folder = getProductsFolder().getFoldersByName("J0002").next();
  const files = folder.getFiles();
  let count = 0;
  while (files.hasNext()) {
    files.next();
    count += 1;
  }
  Logger.log("Drive image file count=" + count + ".");
}

function generateMediaManifest(manifestOverride) {
  const manifest =
    typeof manifestOverride === "undefined"
      ? getSafeMediaManifest()
      : manifestOverride;

  return {
    fileName: "media-manifest.json",
    content: JSON.stringify(manifest, null, 2),
  };
}

function testGenerateMediaManifest() {
  const file = generateMediaManifest();
  Logger.log("Generated " + file.fileName + "; characters=" + file.content.length + ".");
}

function getPublishedMediaManifest() {
  const content = getFileContent("media-manifest.json");

  if (!content) {
    return {};
  }

  // Invalid JSON is a hard failure. Do not silently replace it with
  // an empty manifest before performing destructive synchronization.
  return JSON.parse(content);
}

function testPublishedMediaManifest() {
  const manifest = getPublishedMediaManifest();
  const skuCount = Object.keys(manifest).length;
  const imageCount = Object.keys(manifest).reduce((total, sku) =>
    total + (manifest[sku] || []).length, 0,
  );
  Logger.log("Published media manifest summary: SKUs=" + skuCount + ", images=" + imageCount + ".");
}

function getGitHubBlobSha(bytes) {
  const header = Utilities.newBlob("blob " + bytes.length + "\0").getBytes();
  const payload = header.concat(bytes);
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_1,
    payload,
  );

  return digest
    .map((byte) => {
      const value = byte < 0 ? byte + 256 : byte;
      return ("0" + value.toString(16)).slice(-2);
    })
    .join("");
}

/**
 * Full-catalog planner used by compare/test helpers. The production syncMedia
 * path plans the complete catalog and checkpoints only when its time budget
 * requires another execution.
 * Any non-missing-folder read error throws before this planner returns.
 */
/**
 * Manifest metadata is a fast-path match only when stable Drive ID, size and
 * last-updated timestamp all match. Otherwise hash the file before comparing.
 */
function isMediaFileMetadataUnchanged(file, previousFile) {
  return Boolean(
    file &&
    previousFile &&
    file.id &&
    previousFile.id &&
    file.id === previousFile.id &&
    typeof file.size === "number" &&
    typeof previousFile.size === "number" &&
    file.size === previousFile.size &&
    file.updated &&
    previousFile.updated &&
    file.updated === previousFile.updated,
  );
}

function buildCurrentMediaSyncPlan(productsOverride) {
  const products = (productsOverride || getProducts()).slice();
  const inventory = getMediaSyncInventory(products);
  const previousManifest = getPublishedMediaManifest();
  const driveManifest = mergeMediaManifests(
    inventory.driveManifest,
    previousManifest,
    inventory.missingDriveSkus,
  );
  const githubManifest = getRepositoryImages();
  const driveBlobShas = {};

  Object.keys(inventory.driveManifest).forEach((sku) => {
    const driveFiles = inventory.driveManifest[sku] || [];
    const githubByName = new Map(
      (githubManifest[sku] || []).map((item) => [item.name, item]),
    );
    const previousByName = new Map(
      (previousManifest[sku] || []).map((item) => [item.name, item]),
    );
    driveBlobShas[sku] = {};

    driveFiles.forEach((file) => {
      if (!githubByName.has(file.name)) return;
      if (isMediaFileMetadataUnchanged(file, previousByName.get(file.name)))
        return;
      const driveFile = getDriveFileBytes(file.id);
      driveBlobShas[sku][file.name] = getGitHubBlobSha(driveFile.bytes);
    });
  });

  const plan = buildMediaSyncPlan({
    driveManifest: driveManifest,
    githubManifest: githubManifest,
    driveBlobShas: driveBlobShas,
    missingDriveSkus: inventory.missingDriveSkus,
  });

  return {
    operations: plan.operations,
    warnings: plan.warnings,
    manifest: driveManifest,
  };
}

function compareMediaManifest() {
  return buildCurrentMediaSyncPlan().operations;
}

function testCompareMediaManifest() {
  const plan = buildCurrentMediaSyncPlan();
  Logger.log("Media comparison summary: operations=" + plan.operations.length +
    ", warnings=" + plan.warnings.length + ".");
}

function publishMediaManifest(manifestOverride) {
  const file = generateMediaManifest(manifestOverride);
  publishFile(file, "Publish media-manifest");
}

function testPublishMediaManifest() {
  publishMediaManifest();
  Logger.log("Media Manifest published.");
}

/**
 * Execute uploads before deletions. If an upload fails, no delete is
 * attempted. The manifest is published only after every planned
 * operation succeeds, and retains entries for skipped/missing SKUs.
 */
const MEDIA_SYNC_STATE_PROPERTY = "PREVIA_MEDIA_SYNC_STATE_V1";
const MEDIA_SYNC_STATUS_PROPERTY = "PREVIA_MEDIA_SYNC_STATUS_V1";
const MEDIA_SYNC_DIAGNOSTICS_PROPERTY = "PREVIA_MEDIA_SYNC_DIAGNOSTICS_V1";
const MEDIA_SYNC_VERSION = 3;
var MEDIA_SYNC_TIME_BUDGET_MS = 4 * 60 * 1000;
var MEDIA_SYNC_COMMIT_RESERVE_MS = 45 * 1000;
const MEDIA_SYNC_CONTINUATION_HANDLER = "continueMediaSync";
const MEDIA_SYNC_AUDIT_HANDLER = "startMediaSyncAudit";
const MEDIA_SYNC_AUDIT_INTERVAL_DAYS = 30;
const MEDIA_SYNC_MAX_RETRIES = 3;
const MEDIA_SYNC_RETRY_DELAY_MS = 5 * 60 * 1000;
const MEDIA_SYNC_MIN_TRIGGER_DELAY_MS = 60 * 1000;
// This is deliberately longer than one Apps Script execution. A running
// invocation renews before each Drive/GitHub boundary; the extra margin avoids
// automatic lease takeover while a slow external request is still in flight.
const MEDIA_SYNC_LEASE_MS = 20 * 60 * 1000;
var MEDIA_SYNC_ACTIVE_METRICS = null;
var MEDIA_SYNC_PRECOUNTED_REQUESTS = 0;

function recordMediaSyncGitHubRequest(method, path) {
  if (!MEDIA_SYNC_ACTIVE_METRICS) return;
  if (MEDIA_SYNC_PRECOUNTED_REQUESTS > 0) {
    MEDIA_SYNC_PRECOUNTED_REQUESTS -= 1;
    return;
  }
  const key = String(method || "get").toLowerCase();
  if (!MEDIA_SYNC_ACTIVE_METRICS.githubRequests) {
    MEDIA_SYNC_ACTIVE_METRICS.githubRequests = {};
  }
  MEDIA_SYNC_ACTIVE_METRICS.githubRequests[key] =
    (MEDIA_SYNC_ACTIVE_METRICS.githubRequests[key] || 0) + 1;
  MEDIA_SYNC_ACTIVE_METRICS.githubRequestCount =
    (MEDIA_SYNC_ACTIVE_METRICS.githubRequestCount || 0) + 1;
  const endpoint = !path ? "unknown" :
    path.indexOf("/branches/") === 0 ? "branch" :
    path.indexOf("/git/trees") === 0 ? "tree" :
    path.indexOf("/git/blobs") === 0 ? "blob" :
    path.indexOf("/git/commits") === 0 ? "commit" :
    path.indexOf("/git/refs/") === 0 ? "ref" : "other";
  const typeKey = key.toUpperCase() + " " + endpoint;
  MEDIA_SYNC_ACTIVE_METRICS.githubRequests[typeKey] =
    (MEDIA_SYNC_ACTIVE_METRICS.githubRequests[typeKey] || 0) + 1;
}

function withMediaSyncStateLock(callback) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return { acquired: false };
  try {
    return { acquired: true, value: callback() };
  } finally {
    lock.releaseLock();
  }
}

function createMediaSyncRunId() {
  return (
    new Date().getTime().toString(36) +
    "-" +
    Math.random().toString(36).slice(2)
  );
}

function getMediaSyncState() {
  const raw = PropertiesService.getScriptProperties().getProperty(
    MEDIA_SYNC_STATE_PROPERTY,
  );
  if (!raw) return null;
  const state = JSON.parse(raw);
  if (!state || typeof state !== "object" || Array.isArray(state) ||
      (typeof state.lastSku !== "string" &&
       typeof state.checkpointSha !== "string")) {
    throw new Error(
      "Invalid persisted media-sync state. Refusing to reset progress automatically.",
    );
  }
  return {
    version: Number(state.version) || 2,
    runId: state.runId || "",
    checkpointSha: state.checkpointSha || "",
    phase: state.phase || "pending",
    baseCommitSha: state.baseCommitSha || "",
    planFingerprint: state.planFingerprint || "",
    targetCommitSha: state.targetCommitSha || "",
    targetTreeSha: state.targetTreeSha || "",
    lastSku: state.lastSku,
    startedAt: state.startedAt || "",
    mode: state.mode || "normal",
    retryCount: Number(state.retryCount) || 0,
    generation: Number(state.generation) || 0,
    activeRunId: state.activeRunId || "",
    leaseExpiresAt: state.leaseExpiresAt || "",
    status: state.status || "pending",
    lastError: state.lastError || "",
    lastFailureAt: state.lastFailureAt || "",
    retryNotBeforeAt: state.retryNotBeforeAt || "",
  };
}

function saveMediaSyncState(state) {
  PropertiesService.getScriptProperties().setProperty(
    MEDIA_SYNC_STATE_PROPERTY,
    JSON.stringify(state),
  );
}

function clearMediaSyncState() {
  PropertiesService.getScriptProperties().deleteProperty(
    MEDIA_SYNC_STATE_PROPERTY,
  );
}

function saveMediaSyncStatus(status) {
  // Dashboard status is observability, not a reason to leave a claimed batch
  // stuck. State writes remain strict and will abort the run if they fail.
  try {
    PropertiesService.getScriptProperties().setProperty(
      MEDIA_SYNC_STATUS_PROPERTY,
      JSON.stringify(
        Object.assign({ updatedAt: new Date().toISOString() }, status),
      ),
    );
  } catch (error) {
    Logger.log(
      "Could not save media synchronization status: " +
        String(error && error.message ? error.message : error),
    );
  }
}

function getMediaSyncStatus() {
  const raw = PropertiesService.getScriptProperties().getProperty(
    MEDIA_SYNC_STATUS_PROPERTY,
  );
  return raw ? JSON.parse(raw) : null;
}

function getMediaSyncDiagnostics() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(
      MEDIA_SYNC_DIAGNOSTICS_PROPERTY,
    );

    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    Logger.log(
      "Could not read media sync diagnostics: " +
        String(error && error.message ? error.message : error),
    );
    return null;
  }
}

function saveMediaSyncDiagnostics(diagnostics) {
  try {
    PropertiesService.getScriptProperties().setProperty(
      MEDIA_SYNC_DIAGNOSTICS_PROPERTY,
      JSON.stringify(diagnostics),
    );
    return true;
  } catch (error) {
    Logger.log(
      "Could not save media sync diagnostics: " +
        String(error && error.message ? error.message : error),
    );
    return false;
  }
}

function resetMediaSyncDiagnostics(mode) {
  const now = new Date().toISOString();

  return saveMediaSyncDiagnostics({
    version: 2,
    mode: mode || "normal",
    startedAt: now,
    completedAt: "",
    status: "running",
    runId: "",
    driveSkus: 0,
    hashCount: 0,
    uploadCount: 0,
    deleteCount: 0,
    continuationCount: 0,
    retryCount: 0,
    githubRequestCount: 0,
    githubRequests: {},
    phaseDurationMs: {},
    totalDurationMs: 0,
  });
}

function logMediaSyncDiagnostics() {
  const diagnostics = getMediaSyncDiagnostics();

  if (!diagnostics) {
    Logger.log("No media sync diagnostics found.");
    return null;
  }

  const batches = Array.isArray(diagnostics.batches) ? diagnostics.batches : [];
  const report = Object.assign({}, diagnostics, {
    driveSkus: Number(diagnostics.driveSkus) || 0,
    uploadCount: Number(diagnostics.uploadCount) || 0,
    deleteCount: Number(diagnostics.deleteCount) || 0,
    totalBatches: batches.length,
    totalProcessedSkus: Number(diagnostics.driveSkus) || batches.reduce(
      (total, batch) => total + (batch.processedSkus || 0), 0,
    ),
    totalProcessingTimeMs: diagnostics.totalDurationMs || 0,
    totalWaitTimeMs: 0,
    batches: batches,
  });

  Logger.log(JSON.stringify(report, null, 2));

  return report;
}

function setupMediaSyncAuditWorker() {
  ScriptApp.getProjectTriggers().forEach((trigger) => {
    if (trigger.getHandlerFunction() === MEDIA_SYNC_AUDIT_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger(MEDIA_SYNC_AUDIT_HANDLER)
    .timeBased()
    .everyDays(MEDIA_SYNC_AUDIT_INTERVAL_DAYS)
    .create();
  return (
    "Full media audit scheduled every " +
    MEDIA_SYNC_AUDIT_INTERVAL_DAYS +
    " days."
  );
}

function startMediaSyncAudit() {
  const result = withMediaSyncStateLock(() => {
    if (getMediaSyncState()) {
      return {
        started: false,
        message: "A media sync is already pending; full audit was not started.",
      };
    }
    saveMediaSyncState({
      version: MEDIA_SYNC_VERSION,
      runId: createMediaSyncRunId(),
      checkpointSha: "",
      phase: "inventory",
      baseCommitSha: "",
      planFingerprint: "",
      targetCommitSha: "",
      targetTreeSha: "",
      lastSku: "",
      startedAt: new Date().toISOString(),
      mode: "audit",
      retryCount: 0,
      generation: 0,
      activeRunId: "",
      leaseExpiresAt: "",
      status: "pending",
      lastError: "",
      lastFailureAt: "",
      retryNotBeforeAt: "",
    });

    resetMediaSyncDiagnostics("audit");

    saveMediaSyncStatus({
      status: "pending",
      mode: "audit",
      message: "Full media audit started.",
    });
    return { started: true };
  });
  if (!result.acquired)
    return "Media synchronization is already running; full audit was not started.";
  if (!result.value.started) return result.value.message;
  return syncMedia({ requireExistingState: true });
}

/**
 * The following helpers must be called only while the script state lock is
 * held. Serializing state checks and trigger changes prevents a stale run from
 * deleting or replacing a newer run's continuation trigger.
 */
function removeMediaSyncContinuationTriggersLocked() {
  ScriptApp.getProjectTriggers().forEach((trigger) => {
    if (trigger.getHandlerFunction() === MEDIA_SYNC_CONTINUATION_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function mediaSyncContinuationDelayMs(retryNotBeforeAt, requestedDelayMs) {
  const requested = Number(requestedDelayMs);
  let delay = Number.isFinite(requested) && requested > 0
    ? requested
    : MEDIA_SYNC_MIN_TRIGGER_DELAY_MS;
  const notBefore = retryNotBeforeAt ? Date.parse(retryNotBeforeAt) : NaN;
  if (Number.isFinite(notBefore)) {
    delay = Math.max(delay, notBefore - Date.now());
  }
  return Math.ceil(Math.max(MEDIA_SYNC_MIN_TRIGGER_DELAY_MS, delay));
}

function createMediaSyncContinuationTriggerLocked(delayMs) {
  return ScriptApp.newTrigger(MEDIA_SYNC_CONTINUATION_HANDLER)
    .timeBased()
    .after(delayMs)
    .create();
}

function replaceMediaSyncContinuationTriggerLocked(delayMs) {
  const state = getMediaSyncState();
  const effectiveDelay = mediaSyncContinuationDelayMs(
    state && state.retryNotBeforeAt,
    delayMs,
  );
  removeMediaSyncContinuationTriggersLocked();
  return createMediaSyncContinuationTriggerLocked(effectiveDelay);
}

function ensureMediaSyncContinuationForGeneration(expectedGeneration, delayMs, options) {
  const config = options || {};
  const result = withMediaSyncStateLock(() => {
    const state = getMediaSyncState();
    if (
      !state ||
      state.generation !== expectedGeneration ||
      state.activeRunId ||
      state.status === "failed" ||
      (config.runId && state.runId !== config.runId) ||
      (Object.prototype.hasOwnProperty.call(config, "retryNotBeforeAt") &&
       state.retryNotBeforeAt !== config.retryNotBeforeAt)
    ) {
      return { scheduled: false, reason: "superseded" };
    }
    if (config.preserveExisting) {
      let existing = ScriptApp.getProjectTriggers().filter((trigger) =>
        trigger.getHandlerFunction() === MEDIA_SYNC_CONTINUATION_HANDLER
      );
      const firedTriggerUid = String(config.triggerUid || "");
      if (firedTriggerUid) {
        const firedTrigger = existing.find((trigger) =>
          typeof trigger.getUniqueId === "function" &&
          String(trigger.getUniqueId()) === firedTriggerUid
        );
        if (firedTrigger) {
          ScriptApp.deleteTrigger(firedTrigger);
          existing = existing.filter((trigger) => trigger !== firedTrigger);
        }
      }
      if (existing.length) {
        return {
          scheduled: true,
          existing: true,
          generation: state.generation,
        };
      }
      createMediaSyncContinuationTriggerLocked(
        mediaSyncContinuationDelayMs(state.retryNotBeforeAt, delayMs),
      );
      return { scheduled: true, generation: state.generation };
    }
    replaceMediaSyncContinuationTriggerLocked(delayMs);
    return { scheduled: true, generation: state.generation };
  });
  if (!result.acquired) return { scheduled: false, reason: "lock" };
  return result.value;
}

function removeMediaSyncContinuationTriggers() {
  const result = withMediaSyncStateLock(() => {
    removeMediaSyncContinuationTriggersLocked();
    return true;
  });
  return Boolean(result.acquired && result.value);
}

function renewMediaSyncLease(runId, generation) {
  const result = withMediaSyncStateLock(() => {
    const state = getMediaSyncState();
    if (
      !state ||
      state.activeRunId !== runId ||
      state.generation !== generation
    ) {
      return false;
    }

    const renewed = Object.assign({}, state, {
      leaseExpiresAt: new Date(Date.now() + MEDIA_SYNC_LEASE_MS).toISOString(),
    });
    saveMediaSyncState(renewed);
    return true;
  });

  return Boolean(result.acquired && result.value);
}

function requireMediaSyncLease(runId, generation) {
  if (!renewMediaSyncLease(runId, generation)) {
    const error = new Error(
      "Media synchronization lost ownership before an external operation.",
    );
    error.code = "MEDIA_SYNC_LEASE_LOST";
    throw error;
  }
}

function scheduleMediaSyncLockContentionRetry(expectedState) {
  // This is a best-effort watchdog, never an owner of the active run. It must
  // not replace a continuation created after the caller observed contention.
  try {
    const result = withMediaSyncStateLock(() => {
      const state = getMediaSyncState();
      if (!state) {
        removeMediaSyncContinuationTriggersLocked();
        return { scheduled: false, reason: "none" };
      }
      if (expectedState && (
        state.runId !== expectedState.runId ||
        state.generation !== expectedState.generation ||
        state.activeRunId !== expectedState.activeRunId ||
        state.leaseExpiresAt !== expectedState.leaseExpiresAt ||
        state.retryNotBeforeAt !== expectedState.retryNotBeforeAt
      )) {
        return { scheduled: false, reason: "superseded" };
      }

      const existing = ScriptApp.getProjectTriggers().filter((trigger) =>
        trigger.getHandlerFunction() === MEDIA_SYNC_CONTINUATION_HANDLER
      );
      if (existing.length) {
        return {
          scheduled: false,
          reason: "existing",
          generation: state.generation,
        };
      }

      const now = Date.now();
      const leaseExpires = state.leaseExpiresAt
        ? Date.parse(state.leaseExpiresAt)
        : NaN;
      const leaseRemaining = state.activeRunId && Number.isFinite(leaseExpires)
        ? Math.max(0, leaseExpires - now)
        : 0;
      const delay = mediaSyncContinuationDelayMs(
        state.retryNotBeforeAt,
        Math.max(MEDIA_SYNC_RETRY_DELAY_MS, leaseRemaining),
      );
      createMediaSyncContinuationTriggerLocked(delay);
      return { scheduled: true, generation: state.generation, delayMs: delay };
    });
    if (!result.acquired) {
      Logger.log(
        "Could not schedule media synchronization after lock contention: state lock remains busy.",
      );
      return { scheduled: false, reason: "lock" };
    }
    return result.value;
  } catch (_error) {
    // Do not copy trigger-service or upstream error bodies into execution logs.
    Logger.log("Could not schedule media synchronization after lock contention.");
  }
}

function claimMediaSyncRun(options) {
  const requireExistingState = Boolean(options && options.requireExistingState);
  const result = withMediaSyncStateLock(() => {
    let state = getMediaSyncState();
    if (!state && requireExistingState) {
      removeMediaSyncContinuationTriggersLocked();
      return { claimed: false, reason: "none" };
    }
    // Automatic continuations must never revive a terminally failed sync.
    // A direct/manual syncMedia() call may still explicitly start recovery.
    if (state && requireExistingState && state.status === "failed") {
      removeMediaSyncContinuationTriggersLocked();
      return { claimed: false, reason: "failed" };
    }
    if (!state) {
      state = {
        version: MEDIA_SYNC_VERSION,
        runId: createMediaSyncRunId(),
        checkpointSha: "",
        phase: "inventory",
        baseCommitSha: "",
        planFingerprint: "",
        targetCommitSha: "",
        targetTreeSha: "",
        lastSku: "",
        startedAt: new Date().toISOString(),
        mode: "normal",
        retryCount: 0,
        generation: 0,
        activeRunId: "",
        leaseExpiresAt: "",
        status: "pending",
        lastError: "",
        lastFailureAt: "",
        retryNotBeforeAt: "",
      };

      resetMediaSyncDiagnostics(state.mode);
    }
    const now = new Date();
    const leaseExpires = state.leaseExpiresAt
      ? new Date(state.leaseExpiresAt).getTime()
      : 0;
    if (state.activeRunId && leaseExpires > now.getTime()) {
      return {
        claimed: false,
        reason: "active",
        runId: state.runId,
        activeRunId: state.activeRunId,
        generation: state.generation,
        leaseExpiresAt: state.leaseExpiresAt || "",
        retryNotBeforeAt: state.retryNotBeforeAt || "",
      };
    }
    const retryNotBefore = state.retryNotBeforeAt
      ? Date.parse(state.retryNotBeforeAt)
      : NaN;
    if (Number.isFinite(retryNotBefore) && Date.now() < retryNotBefore) {
      return {
        claimed: false,
        reason: "deferred",
        runId: state.runId,
        generation: state.generation,
        retryNotBeforeAt: state.retryNotBeforeAt,
      };
    }
    const runId = state.runId || createMediaSyncRunId();
    const claimed = Object.assign({}, state, {
      version: MEDIA_SYNC_VERSION,
      runId: runId,
      generation: state.generation + 1,
      activeRunId: runId,
      leaseExpiresAt: new Date(
        now.getTime() + MEDIA_SYNC_LEASE_MS,
      ).toISOString(),
      status: "running",
    });
    saveMediaSyncState(claimed);
    saveMediaSyncStatus({
      status: "running",
      mode: claimed.mode,
      lastSku: claimed.lastSku,
      generation: claimed.generation,
      runId: runId,
      message: "Media synchronization is running.",
    });
    return {
      claimed: true,
      runId: runId,
      generation: claimed.generation,
      state: claimed,
    };
  });
  return result.acquired ? result.value : { claimed: false, reason: "lock" };
}

function finalizeMediaSyncRun(runId, generation, nextState) {
  const result = withMediaSyncStateLock(() => {
    const state = getMediaSyncState();
    if (
      !state ||
      state.activeRunId !== runId ||
      state.generation !== generation
    ) {
      return { committed: false };
    }
    if (nextState.complete) {
      clearMediaSyncState();
      removeMediaSyncContinuationTriggersLocked();
      saveMediaSyncStatus({
        status: "completed",
        mode: state.mode,
        lastSku: nextState.lastSku || state.lastSku,
        message: "Media synchronization completed.",
      });
      return { committed: true, complete: true };
    }
    const pending = Object.assign({}, state, {
      lastSku: nextState.lastSku,
      retryCount: 0,
      generation: state.generation + 1,
      activeRunId: "",
      leaseExpiresAt: "",
      status: "pending",
      lastError: "",
      lastFailureAt: "",
      retryNotBeforeAt: "",
    });
    saveMediaSyncState(pending);
    saveMediaSyncStatus({
      status: "pending",
      mode: pending.mode,
      lastSku: pending.lastSku,
      generation: pending.generation,
      message:
        "Media synchronization checkpoint saved; continuation is required.",
    });
    return { committed: true, complete: false, generation: pending.generation };
  });
  return result.acquired ? result.value : { committed: false, reason: "lock" };
}

function recordMediaSyncFailure(runId, generation, error) {
  const result = withMediaSyncStateLock(() => {
    const state = getMediaSyncState();
    if (!state || state.activeRunId !== runId || state.generation !== generation) {
      return { recorded: false, retry: false, reason: "superseded" };
    }
    const retryCount = state.retryCount + 1;
    const message = String(error && error.message ? error.message : error);
    const defaultRetryAt = Date.now() + MEDIA_SYNC_RETRY_DELAY_MS;
    const githubRetryAt = error && error.retryAfterAt
      ? Date.parse(error.retryAfterAt)
      : NaN;
    const retryNotBeforeAt = new Date(
      Math.max(defaultRetryAt, Number.isFinite(githubRetryAt) ? githubRetryAt : 0),
    ).toISOString();
    const failed = Object.assign({}, state, {
      activeRunId: "",
      leaseExpiresAt: "",
      generation: state.generation + 1,
      retryCount: retryCount,
      status: retryCount <= MEDIA_SYNC_MAX_RETRIES ? "retry-pending" : "failed",
      lastError: message,
      lastFailureAt: new Date().toISOString(),
      retryNotBeforeAt: retryNotBeforeAt,
    });
    saveMediaSyncState(failed);
    if (retryCount > MEDIA_SYNC_MAX_RETRIES)
      removeMediaSyncContinuationTriggersLocked();
    saveMediaSyncStatus({
      status: failed.status,
      mode: failed.mode,
      lastSku: failed.lastSku,
      retryCount: retryCount,
      lastError: message,
      retryNotBeforeAt: retryNotBeforeAt,
      message: retryCount <= MEDIA_SYNC_MAX_RETRIES
        ? "Media synchronization failed; retry is pending."
        : "Media synchronization failed permanently; automatic retries stopped.",
    });
    return {
      recorded: true,
      retry: retryCount <= MEDIA_SYNC_MAX_RETRIES,
      generation: failed.generation,
      retryNotBeforeAt: retryNotBeforeAt,
    };
  });
  return result.acquired
    ? result.value
    : { recorded: false, retry: false, reason: "lock" };
}
function markMediaSyncSchedulingFailure(error, expectedGeneration, expectedState) {
  const expected = expectedState || {};
  const result = withMediaSyncStateLock(() => {
    const state = getMediaSyncState();
    if (!state || state.generation !== expectedGeneration || state.activeRunId ||
        (expected.runId && state.runId !== expected.runId) ||
        (Object.prototype.hasOwnProperty.call(expected, "retryNotBeforeAt") &&
         state.retryNotBeforeAt !== expected.retryNotBeforeAt) ||
        state.status === "failed" ||
        ScriptApp.getProjectTriggers().some((trigger) =>
          trigger.getHandlerFunction() === MEDIA_SYNC_CONTINUATION_HANDLER
        )) {
      return false;
    }
    const message = String(error && error.message ? error.message : error);
    const failed = Object.assign({}, state, {
      activeRunId: "",
      leaseExpiresAt: "",
      status: "failed",
      lastError: message,
      lastFailureAt: new Date().toISOString(),
    });
    saveMediaSyncState(failed);
    saveMediaSyncStatus({
      status: "failed",
      mode: failed.mode,
      lastSku: failed.lastSku,
      retryCount: failed.retryCount,
      lastError: message,
      message:
        "Media synchronization needs manual recovery because its continuation could not be scheduled.",
    });
    return true;
  });
  return result.acquired && result.value;
}

function continueMediaSync(event) {
  return syncMedia({
    requireExistingState: true,
    continuationTriggerUid: event && event.triggerUid,
  });
}

function mediaSyncStableJson(value) {
  if (Array.isArray(value)) {
    return "[" + value.map(mediaSyncStableJson).join(",") + "]";
  }
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map((key) =>
      JSON.stringify(key) + ":" + mediaSyncStableJson(value[key])
    ).join(",") + "}";
  }
  return JSON.stringify(value);
}

function mediaSyncSha1Text(value) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_1,
    Utilities.newBlob(String(value)).getBytes(),
  );
  return digest.map((byte) => {
    const normalized = byte < 0 ? byte + 256 : byte;
    return ("0" + normalized.toString(16)).slice(-2);
  }).join("");
}

function mediaSyncSortedProducts(products) {
  return (products || []).slice().sort((left, right) =>
    String(left.sku || "").localeCompare(String(right.sku || ""), undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
}

function mediaSyncImageIndex(tree) {
  if (!tree || !Array.isArray(tree.tree)) {
    throw new Error("GitHub tree response is missing its tree entries.");
  }
  if (tree.truncated) {
    const error = new Error(
      "GitHub returned a truncated tree; MediaSync will not plan file deletions.",
    );
    error.code = "GITHUB_TREE_TRUNCATED";
    throw error;
  }

  const images = {};
  tree.tree.forEach((item) => {
    if (item.type !== "blob" || !item.path ||
        !item.path.startsWith("images/")) return;
    const parts = item.path.split("/");
    if (parts.length !== 3) return;
    const sku = parts[1];
    if (!images[sku]) images[sku] = [];
    images[sku].push({
      name: parts[2],
      path: item.path,
      sha: item.sha,
      size: item.size,
    });
  });
  return images;
}

function mediaSyncParseManifest(content) {
  if (!content) return {};
  const manifest = JSON.parse(content);
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Published media manifest must be a JSON object.");
  }
  Object.keys(manifest).forEach((sku) => {
    if (!Array.isArray(manifest[sku])) {
      throw new Error("Published media manifest has an invalid SKU entry: " + sku);
    }
  });
  return manifest;
}

function mediaSyncRemainingMs(startedAtMs) {
  return MEDIA_SYNC_TIME_BUDGET_MS - (Date.now() - startedAtMs);
}

function mediaSyncShouldYield(startedAtMs, reserveMs) {
  return mediaSyncRemainingMs(startedAtMs) <= (reserveMs || 0);
}

function mediaSyncCreateCheckpointBlob(checkpoint) {
  if (MEDIA_SYNC_ACTIVE_METRICS) {
    const requests = MEDIA_SYNC_ACTIVE_METRICS.githubRequests;
    requests.post = (requests.post || 0) + 1;
    requests["POST blob"] = (requests["POST blob"] || 0) + 1;
    MEDIA_SYNC_ACTIVE_METRICS.githubRequestCount =
      (MEDIA_SYNC_ACTIVE_METRICS.githubRequestCount || 0) + 1;
    MEDIA_SYNC_PRECOUNTED_REQUESTS += 1;
  }
  try {
    const content = JSON.stringify(checkpoint);
    const bytes = Utilities.newBlob(content, "text/plain", "checkpoint.json")
      .getBytes();
    const base64Bytes = 4 * Math.ceil(bytes.length / 3);
    Logger.log(
      "MediaSync checkpoint size: phase=" + checkpoint.phase +
      ", UTF-8=" + bytes.length + " bytes, Base64=" + base64Bytes + " bytes."
    );
    return createGitHubTextBlob(content);
  } finally {
    if (MEDIA_SYNC_PRECOUNTED_REQUESTS > 0) {
      MEDIA_SYNC_PRECOUNTED_REQUESTS -= 1;
    }
  }
}

function mediaSyncWriteCheckpoint(checkpoint, claim) {
  requireMediaSyncLease(claim.runId, claim.generation);
  const checkpointBlob = mediaSyncCreateCheckpointBlob(checkpoint);
  if (!checkpointBlob || !checkpointBlob.sha) {
    throw new Error("GitHub did not return a checkpoint blob SHA.");
  }

  const result = withMediaSyncStateLock(() => {
    const state = getMediaSyncState();
    if (!state || state.activeRunId !== claim.runId ||
        state.generation !== claim.generation) {
      return { saved: false, reason: "superseded" };
    }
    const pending = Object.assign({}, state, {
      checkpointSha: checkpointBlob.sha,
      phase: checkpoint.phase,
      baseCommitSha: checkpoint.baseCommitSha || state.baseCommitSha,
      planFingerprint: checkpoint.planFingerprint || "",
      targetCommitSha: checkpoint.targetCommitSha || "",
      targetTreeSha: checkpoint.targetTreeSha || "",
      activeRunId: "",
      leaseExpiresAt: "",
      status: "pending",
      generation: state.generation + 1,
      lastError: "",
    });
    saveMediaSyncState(pending);
    saveMediaSyncStatus({
      status: "continuing",
      stage: checkpoint.phase,
      mode: pending.mode,
      runId: pending.runId,
      generation: pending.generation,
      currentSku: checkpoint.currentSku || "",
      lastSku: checkpoint.lastSku || "",
      processedSkus: Number(checkpoint.nextProductIndex) || 0,
      message: "Media synchronization will continue in another execution.",
    });
    try {
      replaceMediaSyncContinuationTriggerLocked();
      return { saved: true, generation: pending.generation };
    } catch (error) {
      const failed = Object.assign({}, pending, {
        status: "failed",
        lastError: String(error && error.message ? error.message : error),
        lastFailureAt: new Date().toISOString(),
      });
      saveMediaSyncState(failed);
      saveMediaSyncStatus({
        status: "failed",
        stage: checkpoint.phase,
        runId: failed.runId,
        lastError: failed.lastError,
        message: "Media synchronization could not schedule its continuation.",
      });
      return { saved: false, reason: "trigger", error: error };
    }
  });

  if (!result.acquired) {
    throw new Error("Could not save MediaSync continuation state.");
  }
  if (!result.value.saved) {
    if (result.value.error) throw result.value.error;
    throw new Error("MediaSync continuation was superseded.");
  }
  return "Media synchronization paused safely; continuation is scheduled.";
}

function mediaSyncReadCheckpoint(state) {
  if (!state.checkpointSha) return null;
  const raw = getGitHubBlobText(state.checkpointSha);
  if (!raw) return null;
  const checkpoint = JSON.parse(raw);
  if (!checkpoint || checkpoint.version !== MEDIA_SYNC_VERSION ||
      checkpoint.runId !== state.runId) {
    throw new Error("MediaSync checkpoint does not match the active run.");
  }
  return checkpoint;
}

function mediaSyncCreateCheckpoint(claim, products, branch, tree, previousManifest) {
  return {
    version: MEDIA_SYNC_VERSION,
    runId: claim.state.runId,
    phase: "inventory",
    mode: claim.state.mode,
    baseCommitSha: branch.commitSha,
    baseTreeSha: branch.treeSha,
    githubManifest: mediaSyncImageIndex(tree),
    previousManifest: previousManifest,
    productSkus: products.map((product) => String(product.sku)),
    nextProductIndex: 0,
    driveManifest: {},
    missingDriveSkus: [],
    verifyIndex: 0,
    verificationManifest: {},
    hashQueue: [],
    hashIndex: 0,
    driveBlobShas: {},
    operations: [],
    stageIndex: 0,
    stagedBlobShas: {},
    manifestBlobSha: "",
    targetManifest: null,
    planFingerprint: "",
    targetCommitSha: "",
    targetTreeSha: "",
    commitIdentity: null,
    commitDate: "",
    effects: [],
    continuationCount: 0,
    metrics: {
      githubRequests: {},
      githubRequestCount: 0,
      driveSkus: 0,
      hashCount: 0,
      uploadCount: 0,
      deleteCount: 0,
      phaseDurationMs: {},
      retryCount: Number(claim.state.retryCount) || 0,
    },
    startedAt: claim.state.startedAt || new Date().toISOString(),
  };
}

function mediaSyncManifestShaFromTree(tree) {
  const entry = tree.tree.find((item) =>
    item.type === "blob" && item.path === "media-manifest.json"
  );
  return entry ? entry.sha : "";
}

function mediaSyncDriveInventoryMatches(left, right, missingLeft, missingRight) {
  return mediaSyncStableJson(left) === mediaSyncStableJson(right) &&
    mediaSyncStableJson((missingLeft || []).slice().sort()) ===
      mediaSyncStableJson((missingRight || []).slice().sort());
}

function mediaSyncRunMetrics(checkpoint, status) {
  const metrics = checkpoint.metrics || {};
  return {
    version: 2,
    status: status,
    runId: checkpoint.runId,
    mode: checkpoint.mode,
    startedAt: checkpoint.startedAt,
    completedAt: new Date().toISOString(),
    totalDurationMs: Date.now() - new Date(checkpoint.startedAt).getTime(),
    driveSkus: metrics.driveSkus || 0,
    hashCount: metrics.hashCount || 0,
    uploadCount: metrics.uploadCount || 0,
    deleteCount: metrics.deleteCount || 0,
    continuationCount: checkpoint.continuationCount || 0,
    retryCount: metrics.retryCount || 0,
    githubRequestCount: metrics.githubRequestCount || 0,
    githubRequests: metrics.githubRequests || {},
    phaseDurationMs: metrics.phaseDurationMs || {},
    reason: status === "completed" ? "committed" : status,
  };
}

function mediaSyncAdoptRunMetrics(checkpoint) {
  const current = MEDIA_SYNC_ACTIVE_METRICS || {
    githubRequests: {},
    githubRequestCount: 0,
  };
  const stored = checkpoint.metrics || {};
  stored.githubRequests = stored.githubRequests || {};
  Object.keys(current.githubRequests || {}).forEach((key) => {
    stored.githubRequests[key] = (stored.githubRequests[key] || 0) +
      current.githubRequests[key];
  });
  stored.githubRequestCount = (stored.githubRequestCount || 0) +
    (current.githubRequestCount || 0);
  checkpoint.metrics = stored;
  MEDIA_SYNC_ACTIVE_METRICS = stored;
}

function mediaSyncCommitAlreadyPublished(checkpoint, tree) {
  const byPath = new Map(tree.tree.map((item) => [item.path, item]));
  for (const effect of checkpoint.effects || []) {
    const item = byPath.get(effect.path);
    if (effect.sha === null) {
      if (item) return false;
    } else if (!item || item.sha !== effect.sha) {
      return false;
    }
  }
  return true;
}

function mediaSyncStatusForPhase(checkpoint, phase, details) {
  saveMediaSyncStatus(Object.assign({
    status: "running",
    stage: phase,
    mode: checkpoint.mode,
    runId: checkpoint.runId,
    currentSku: "",
    processedSkus: checkpoint.nextProductIndex || 0,
    uploadedFiles: checkpoint.metrics.uploadCount || 0,
    deletedFiles: checkpoint.metrics.deleteCount || 0,
    retryCount: checkpoint.metrics.retryCount || 0,
    message: "Media synchronization: " + phase + ".",
  }, details || {}));
}

function mediaSyncSaveActiveCheckpoint(checkpoint, claim) {
  requireMediaSyncLease(claim.runId, claim.generation);
  const checkpointBlob = mediaSyncCreateCheckpointBlob(checkpoint);
  if (!checkpointBlob || !checkpointBlob.sha) {
    throw new Error("GitHub did not return a checkpoint blob SHA.");
  }
  const result = withMediaSyncStateLock(() => {
    const state = getMediaSyncState();
    if (!state || state.activeRunId !== claim.runId ||
        state.generation !== claim.generation) return false;
    state.checkpointSha = checkpointBlob.sha;
    state.phase = checkpoint.phase;
    state.baseCommitSha = checkpoint.baseCommitSha;
    state.planFingerprint = checkpoint.planFingerprint || "";
    state.targetCommitSha = checkpoint.targetCommitSha || "";
    state.targetTreeSha = checkpoint.targetTreeSha || "";
    saveMediaSyncState(state);
    return true;
  });
  if (!result.acquired || !result.value) {
    throw new Error("MediaSync lost ownership while saving its checkpoint.");
  }
  return checkpointBlob.sha;
}

function mediaSyncEnsureStableCommitMetadata(checkpoint, claim) {
  if (checkpoint.commitIdentity && checkpoint.commitDate) return;
  checkpoint.commitIdentity = getGitHubCommitIdentity();
  checkpoint.commitDate = checkpoint.startedAt || new Date().toISOString();
  mediaSyncSaveActiveCheckpoint(checkpoint, claim);
}

function mediaSyncFinishSuccess(checkpoint, claim, summary) {
  const finalized = finalizeMediaSyncRun(claim.runId, claim.generation, {
    complete: true,
    lastSku: "",
  });
  if (!finalized.committed) {
    scheduleMediaSyncLockContentionRetry();
    return "Media synchronization commit is published; completion is pending confirmation.";
  }
  checkpoint.metrics = checkpoint.metrics || {};
  checkpoint.metrics.uploadCount = summary.uploaded;
  checkpoint.metrics.deleteCount = summary.deleted;
  checkpoint.metrics.githubRequestCount =
    MEDIA_SYNC_ACTIVE_METRICS.githubRequestCount || 0;
  checkpoint.metrics.githubRequests =
    MEDIA_SYNC_ACTIVE_METRICS.githubRequests || {};
  checkpoint.metrics.hashCount =
    checkpoint.metrics.hashCount || 0;
  saveMediaSyncDiagnostics(mediaSyncRunMetrics(checkpoint, "completed"));
  saveMediaSyncStatus({
    status: "completed",
    stage: "completed",
    mode: checkpoint.mode,
    runId: checkpoint.runId,
    uploadedFiles: summary.uploaded,
    deletedFiles: summary.deleted,
    processedSkus: checkpoint.productSkus.length,
    continuationCount: checkpoint.continuationCount,
    message: "Media synchronization completed in one GitHub commit.",
  });
  const missingWarning = checkpoint.missingDriveSkus &&
    checkpoint.missingDriveSkus.length
    ? "\nSkipped SKUs (Drive folder missing): " +
      checkpoint.missingDriveSkus.join(", ")
    : "";
  return "Media synchronization completed.\n\nUploaded: " +
    summary.uploaded + "\nDeleted: " + summary.deleted +
    "\nGitHub commit: " + summary.commitSha + missingWarning;
}

function mediaSyncBuildPlan(checkpoint) {
  const merged = mergeMediaManifests(
    checkpoint.driveManifest,
    checkpoint.previousManifest,
    checkpoint.missingDriveSkus,
  );
  Object.keys(merged).forEach((sku) => {
    merged[sku] = (merged[sku] || []).map((file) => Object.assign({}, file));
  });
  const githubBySku = checkpoint.githubManifest;
  const driveBlobShas = checkpoint.driveBlobShas || {};
  const hashQueue = [];
  const metadataVerifiedShas = [];
  Object.keys(checkpoint.driveManifest).forEach((sku) => {
    const driveFiles = checkpoint.driveManifest[sku] || [];
    const githubByName = new Map(
      (githubBySku[sku] || []).map((file) => [file.name, file]),
    );
    const previousByName = new Map(
      (checkpoint.previousManifest[sku] || []).map((file) => [file.name, file]),
    );
    driveFiles.forEach((file) => {
      const githubFile = githubByName.get(file.name);
      if (!githubFile) return;
      const previousFile = previousByName.get(file.name);
      const metadataMatches = isMediaFileMetadataUnchanged(file, previousFile);
      const githubShaMatches = previousFile && previousFile.githubSha &&
        previousFile.githubSha === githubFile.sha;
      if (checkpoint.mode !== "audit" && metadataMatches && githubShaMatches) {
        metadataVerifiedShas.push({ sku: sku, name: file.name, sha: githubFile.sha });
        return;
      }
      hashQueue.push({ sku: sku, file: file, githubSha: githubFile.sha });
    });
  });

  checkpoint.targetManifest = merged;
  metadataVerifiedShas.forEach((item) => {
    mediaSyncSetFileGitHubSha(
      checkpoint.targetManifest,
      item.sku,
      item.name,
      item.sha,
    );
  });
  checkpoint.hashQueue = hashQueue;
  checkpoint.hashIndex = 0;
  checkpoint.driveBlobShas = driveBlobShas;
  checkpoint.phase = "hashing";
  checkpoint.planFingerprint = mediaSyncSha1Text(mediaSyncStableJson({
    baseCommitSha: checkpoint.baseCommitSha,
    productSkus: checkpoint.productSkus,
    driveManifest: checkpoint.driveManifest,
    missingDriveSkus: checkpoint.missingDriveSkus,
    previousManifest: checkpoint.previousManifest,
  }));
}

function mediaSyncFinalizePlan(checkpoint) {
  const plan = buildMediaSyncPlan({
    driveManifest: checkpoint.targetManifest,
    githubManifest: checkpoint.githubManifest,
    driveBlobShas: checkpoint.driveBlobShas,
    missingDriveSkus: checkpoint.missingDriveSkus,
  });
  checkpoint.operations = plan.operations;
  checkpoint.metrics.uploadCount = plan.operations.filter((operation) =>
    operation.action === "upload"
  ).length;
  checkpoint.metrics.deleteCount = plan.operations.filter((operation) =>
    operation.action === "delete"
  ).length;
  checkpoint.stageIndex = 0;
  checkpoint.stagedBlobShas = checkpoint.stagedBlobShas || {};
  checkpoint.effects = [];
  checkpoint.phase = "staging";
  checkpoint.planFingerprint = mediaSyncSha1Text(mediaSyncStableJson({
    baseCommitSha: checkpoint.baseCommitSha,
    targetManifest: checkpoint.targetManifest,
    operations: checkpoint.operations,
  }));
}

function mediaSyncSetFileGitHubSha(manifest, sku, name, sha) {
  const files = manifest[sku] || [];
  const file = files.find((item) => item.name === name);
  if (file) file.githubSha = sha;
}

function syncMedia(options) {
  const claim = claimMediaSyncRun(options);
  if (!claim.claimed) {
    if (claim.reason === "none") return "No pending media synchronization.";
    if (claim.reason === "failed")
      return "Media synchronization has failed and requires manual recovery.";
    if (claim.reason === "lock" || claim.reason === "active") {
      scheduleMediaSyncLockContentionRetry(
        claim.reason === "active" ? claim : undefined,
      );
    }
    if (claim.reason === "deferred") {
      try {
        const scheduled = ensureMediaSyncContinuationForGeneration(
          claim.generation,
          MEDIA_SYNC_RETRY_DELAY_MS,
          {
            preserveExisting: true,
            runId: claim.runId,
            retryNotBeforeAt: claim.retryNotBeforeAt,
            triggerUid: options && options.continuationTriggerUid,
          },
        );
        if (!scheduled.scheduled && scheduled.reason === "lock") {
          scheduleMediaSyncLockContentionRetry();
        }
      } catch (_error) {
        const schedulingError = new Error(
          "MediaSync continuation trigger could not be scheduled; manual recovery is required.",
        );
        schedulingError.code = "MEDIA_SYNC_CONTINUATION_SCHEDULING_FAILED";
        const failureRecorded = markMediaSyncSchedulingFailure(
          schedulingError,
          claim.generation,
          {
            runId: claim.runId,
            retryNotBeforeAt: claim.retryNotBeforeAt,
          },
        );
        return failureRecorded
          ? "Media synchronization is paused; continuation scheduling failed and manual recovery is required."
          : "Media synchronization state changed; the stale continuation did not update recovery state.";
      }
      return "Media synchronization is deferred until its retry deadline.";
    }
    return "Media synchronization is already running. Try again shortly.";
  }

  const startedAtMs = Date.now();
  let checkpoint = null;
  const driveBytesCache = {};
  if (typeof resetMediaSyncGitHubConfigCache === "function") {
    resetMediaSyncGitHubConfigCache();
  }
  MEDIA_SYNC_ACTIVE_METRICS = { githubRequests: {}, githubRequestCount: 0 };
  try {
    requireMediaSyncLease(claim.runId, claim.generation);
    const products = mediaSyncSortedProducts(getProducts());
    const productSkus = products.map((product) => String(product.sku));
    const branch = getGitHubBranchSnapshot();

    try {
      checkpoint = mediaSyncReadCheckpoint(claim.state);
    } catch (checkpointError) {
      Logger.log("MediaSync checkpoint could not be restored; rebuilding it.");
      checkpoint = null;
    }

    let tree = null;
    const resumeMatchesBranch = checkpoint &&
      checkpoint.baseCommitSha === branch.commitSha &&
      checkpoint.productSkus.length === productSkus.length &&
      checkpoint.productSkus.every((sku, index) => sku === productSkus[index]);

    if (checkpoint && checkpoint.targetCommitSha) {
      const currentTree = getGitHubTreeSnapshot(branch.treeSha);
      if (currentTree.truncated) {
        const error = new Error("GitHub returned a truncated tree during recovery.");
        error.code = "GITHUB_TREE_TRUNCATED";
        throw error;
      }
      if (mediaSyncCommitAlreadyPublished(checkpoint, currentTree)) {
        const uploads = checkpoint.metrics.uploadCount || 0;
        const deletions = checkpoint.metrics.deleteCount || 0;
        return mediaSyncFinishSuccess(checkpoint, claim, {
          uploaded: uploads,
          deleted: deletions,
          commitSha: checkpoint.targetCommitSha,
        });
      }
    }

    if (resumeMatchesBranch) {
      checkpoint.continuationCount = (checkpoint.continuationCount || 0) + 1;
      mediaSyncAdoptRunMetrics(checkpoint);
      if (checkpoint.phase !== "inventory" &&
          checkpoint.phase !== "verify-inventory") {
        checkpoint.resumePhase = checkpoint.phase;
        checkpoint.phase = "verify-inventory";
        checkpoint.verifyIndex = 0;
        checkpoint.verificationManifest = {};
        checkpoint.verificationMissingSkus = [];
      }
    } else {
      tree = getGitHubTreeSnapshot(branch.treeSha);
      if (!tree || !Array.isArray(tree.tree) || tree.truncated) {
        const error = new Error(tree && tree.truncated
          ? "GitHub returned a truncated tree; refusing to plan destructive operations."
          : "GitHub returned an invalid repository tree.");
        error.code = tree && tree.truncated
          ? "GITHUB_TREE_TRUNCATED"
          : "GITHUB_TREE_INVALID";
        throw error;
      }
      const manifestSha = mediaSyncManifestShaFromTree(tree);
      const previousManifest = mediaSyncParseManifest(
        manifestSha ? getGitHubBlobText(manifestSha) : null,
      );
      checkpoint = mediaSyncCreateCheckpoint(
        claim, products, branch, tree, previousManifest,
      );
      mediaSyncAdoptRunMetrics(checkpoint);
      saveMediaSyncDiagnostics(mediaSyncRunMetrics(checkpoint, "running"));
    }

    if (checkpoint.phase === "commit-created" && checkpoint.targetCommitSha) {
      const update = updateGitHubBranchRef(
        checkpoint.targetCommitSha,
        checkpoint.baseCommitSha,
      );
      return mediaSyncFinishSuccess(checkpoint, claim, {
        uploaded: checkpoint.metrics.uploadCount || 0,
        deleted: checkpoint.metrics.deleteCount || 0,
        commitSha: update.object && update.object.sha || checkpoint.targetCommitSha,
      });
    }

    if (checkpoint.phase === "inventory") {
      mediaSyncStatusForPhase(checkpoint, "inventory", {
        processedSkus: checkpoint.nextProductIndex,
        message: "Reading Drive photo inventory.",
      });
      while (checkpoint.nextProductIndex < products.length) {
        if (mediaSyncShouldYield(startedAtMs, MEDIA_SYNC_COMMIT_RESERVE_MS)) {
          return mediaSyncWriteCheckpoint(checkpoint, claim);
        }
        const product = products[checkpoint.nextProductIndex];
        requireMediaSyncLease(claim.runId, claim.generation);
        const result = getProductFilesResult(String(product.sku));
        if (!result || typeof result.found !== "boolean" ||
            !Array.isArray(result.files)) {
          throw new Error("Drive inventory returned an invalid result for SKU " +
            product.sku + ".");
        }
        if (!result.found) {
          checkpoint.missingDriveSkus.push(String(product.sku));
        } else {
          checkpoint.driveManifest[String(product.sku)] = result.files.map((file) => ({
            id: file.id,
            name: file.name,
            size: file.size,
            mimeType: file.mimeType,
            updated: file.updated,
          }));
        }
        checkpoint.nextProductIndex += 1;
        checkpoint.metrics.driveSkus = checkpoint.nextProductIndex;
      }
      if (checkpoint.continuationCount > 0) {
        checkpoint.phase = "verify-inventory";
        checkpoint.verifyIndex = 0;
        checkpoint.verificationManifest = {};
        checkpoint.verificationMissingSkus = [];
      } else {
        mediaSyncBuildPlan(checkpoint);
      }
    }

    if (checkpoint.phase === "verify-inventory") {
      mediaSyncStatusForPhase(checkpoint, "verify-inventory", {
        processedSkus: checkpoint.verifyIndex,
        message: "Checking Drive inventory after continuation.",
      });
      while (checkpoint.verifyIndex < products.length) {
        if (mediaSyncShouldYield(startedAtMs, MEDIA_SYNC_COMMIT_RESERVE_MS)) {
          return mediaSyncWriteCheckpoint(checkpoint, claim);
        }
        const product = products[checkpoint.verifyIndex];
        requireMediaSyncLease(claim.runId, claim.generation);
        const result = getProductFilesResult(String(product.sku));
        if (!result || typeof result.found !== "boolean" ||
            !Array.isArray(result.files)) {
          throw new Error("Drive verification returned an invalid result for SKU " +
            product.sku + ".");
        }
        if (!result.found) {
          checkpoint.verificationMissingSkus.push(String(product.sku));
        } else {
          checkpoint.verificationManifest[String(product.sku)] = result.files.map((file) => ({
            id: file.id,
            name: file.name,
            size: file.size,
            mimeType: file.mimeType,
            updated: file.updated,
          }));
        }
        checkpoint.verifyIndex += 1;
      }
      const inventoryUnchanged = mediaSyncDriveInventoryMatches(
        checkpoint.driveManifest,
        checkpoint.verificationManifest,
        checkpoint.missingDriveSkus,
        checkpoint.verificationMissingSkus,
      );
      if (!inventoryUnchanged) {
        checkpoint.driveManifest = checkpoint.verificationManifest;
        checkpoint.missingDriveSkus = checkpoint.verificationMissingSkus;
        checkpoint.driveBlobShas = {};
        checkpoint.operations = [];
        checkpoint.stageIndex = 0;
        checkpoint.stagedBlobShas = {};
        checkpoint.targetCommitSha = "";
        checkpoint.targetTreeSha = "";
        mediaSyncBuildPlan(checkpoint);
      } else if (checkpoint.resumePhase) {
        checkpoint.phase = checkpoint.resumePhase;
        checkpoint.resumePhase = "";
      } else {
        mediaSyncBuildPlan(checkpoint);
      }
    }

    if (checkpoint.phase === "hashing") {
      mediaSyncStatusForPhase(checkpoint, "checking", {
        message: "Checking file metadata and image content.",
      });
      while (checkpoint.hashIndex < checkpoint.hashQueue.length) {
        if (mediaSyncShouldYield(startedAtMs, MEDIA_SYNC_COMMIT_RESERVE_MS)) {
          return mediaSyncWriteCheckpoint(checkpoint, claim);
        }
        const item = checkpoint.hashQueue[checkpoint.hashIndex];
        requireMediaSyncLease(claim.runId, claim.generation);
        const driveFile = getDriveFileBytes(item.file.id);
        driveBytesCache[item.sku + "/" + item.file.name] = driveFile;
        const sha = getGitHubBlobSha(driveFile.bytes);
        if (!checkpoint.driveBlobShas[item.sku]) {
          checkpoint.driveBlobShas[item.sku] = {};
        }
        checkpoint.driveBlobShas[item.sku][item.file.name] = sha;
        mediaSyncSetFileGitHubSha(checkpoint.targetManifest, item.sku,
          item.file.name, sha);
        checkpoint.metrics.hashCount = (checkpoint.metrics.hashCount || 0) + 1;
        checkpoint.hashIndex += 1;
      }
      mediaSyncFinalizePlan(checkpoint);
    }

    if (checkpoint.phase === "staging") {
      mediaSyncStatusForPhase(checkpoint, "uploading", {
        message: "Preparing photo blobs for the GitHub commit.",
      });
      while (checkpoint.stageIndex < checkpoint.operations.length) {
        if (mediaSyncShouldYield(startedAtMs, MEDIA_SYNC_COMMIT_RESERVE_MS)) {
          return mediaSyncWriteCheckpoint(checkpoint, claim);
        }
        const operation = checkpoint.operations[checkpoint.stageIndex];
        if (operation.action === "upload") {
          const path = "images/" + operation.sku + "/" + operation.file.name;
          if (!checkpoint.stagedBlobShas[path]) {
            requireMediaSyncLease(claim.runId, claim.generation);
            const driveFile = driveBytesCache[String(operation.sku) + "/" +
              operation.file.name] ||
              getDriveFileBytes(operation.file.id);
            driveBytesCache[path] = driveFile;
            const sha = getGitHubBlobSha(driveFile.bytes);
            const existingSha = checkpoint.driveBlobShas[operation.sku] &&
              checkpoint.driveBlobShas[operation.sku][operation.file.name];
            if (existingSha && existingSha !== sha) {
              throw new Error("Drive file changed after planning: " + path);
            }
            const blob = createGitHubBlob(driveFile.bytes);
            if (!blob || !blob.sha || blob.sha !== sha) {
              throw new Error("GitHub returned an unexpected blob SHA for " + path);
            }
            checkpoint.stagedBlobShas[path] = blob.sha;
            mediaSyncSetFileGitHubSha(
              checkpoint.targetManifest,
              String(operation.sku),
              operation.file.name,
              blob.sha,
            );
          }
        }
        checkpoint.stageIndex += 1;
      }

      const manifestChanged = mediaSyncStableJson(checkpoint.targetManifest) !==
        mediaSyncStableJson(checkpoint.previousManifest);
      const hasFileChanges = checkpoint.operations.length > 0;
      if (!manifestChanged && !hasFileChanges) {
        checkpoint.metrics.githubRequestCount =
          MEDIA_SYNC_ACTIVE_METRICS.githubRequestCount || 0;
        checkpoint.metrics.githubRequests =
          MEDIA_SYNC_ACTIVE_METRICS.githubRequests || {};
        return mediaSyncFinishSuccess(checkpoint, claim, {
          uploaded: 0,
          deleted: 0,
          commitSha: checkpoint.baseCommitSha,
        });
      }

      if (mediaSyncShouldYield(startedAtMs, 3 * MEDIA_SYNC_COMMIT_RESERVE_MS)) {
        checkpoint.phase = "staging";
        return mediaSyncWriteCheckpoint(checkpoint, claim);
      }

      mediaSyncStatusForPhase(checkpoint, "publishing", {
        message: "Creating the atomic GitHub tree and commit.",
      });
      requireMediaSyncLease(claim.runId, claim.generation);
      const treeElements = [];
      checkpoint.operations.forEach((operation) => {
        const path = "images/" + operation.sku + "/" + operation.file.name;
        if (operation.action === "upload") {
          treeElements.push({
            path: path,
            mode: "100644",
            type: "blob",
            sha: checkpoint.stagedBlobShas[path],
          });
          checkpoint.effects.push({ path: path, sha: checkpoint.stagedBlobShas[path] });
        } else {
          treeElements.push({
            path: path,
            mode: "100644",
            type: "blob",
            sha: null,
          });
          checkpoint.effects.push({ path: path, sha: null });
        }
      });

      if (manifestChanged) {
        const manifestText = JSON.stringify(checkpoint.targetManifest, null, 2);
        const manifestBlob = createGitHubTextBlob(manifestText);
        if (!manifestBlob || !manifestBlob.sha) {
          throw new Error("GitHub did not return a manifest blob SHA.");
        }
        checkpoint.manifestBlobSha = manifestBlob.sha;
        treeElements.push({
          path: "media-manifest.json",
          mode: "100644",
          type: "blob",
          sha: manifestBlob.sha,
        });
        checkpoint.effects.push({
          path: "media-manifest.json",
          sha: manifestBlob.sha,
        });
      }

      const createdTree = createGitHubTree(checkpoint.baseTreeSha, treeElements);
      if (!createdTree || !createdTree.sha) {
        throw new Error("GitHub did not return a tree SHA.");
      }
      checkpoint.targetTreeSha = createdTree.sha;
      checkpoint.phase = "tree-created";
      mediaSyncSaveActiveCheckpoint(checkpoint, claim);

      mediaSyncEnsureStableCommitMetadata(checkpoint, claim);
      requireMediaSyncLease(claim.runId, claim.generation);
      const createdCommit = createGitHubCommit(
        "Synchronize product media",
        checkpoint.targetTreeSha,
        checkpoint.baseCommitSha,
        checkpoint.commitIdentity,
        checkpoint.commitDate,
      );
      if (!createdCommit || !createdCommit.sha) {
        throw new Error("GitHub did not return a commit SHA.");
      }
      checkpoint.targetCommitSha = createdCommit.sha;
      checkpoint.phase = "commit-created";
      mediaSyncSaveActiveCheckpoint(checkpoint, claim);
    }

    if (checkpoint.phase === "tree-created") {
      if (mediaSyncShouldYield(startedAtMs, MEDIA_SYNC_COMMIT_RESERVE_MS)) {
        return mediaSyncWriteCheckpoint(checkpoint, claim);
      }
      mediaSyncEnsureStableCommitMetadata(checkpoint, claim);
      requireMediaSyncLease(claim.runId, claim.generation);
      const createdCommit = createGitHubCommit(
        "Synchronize product media",
        checkpoint.targetTreeSha,
        checkpoint.baseCommitSha,
        checkpoint.commitIdentity,
        checkpoint.commitDate,
      );
      if (!createdCommit || !createdCommit.sha) {
        throw new Error("GitHub did not return a commit SHA.");
      }
      checkpoint.targetCommitSha = createdCommit.sha;
      checkpoint.phase = "commit-created";
      mediaSyncSaveActiveCheckpoint(checkpoint, claim);
    }

    if (checkpoint.phase === "commit-created") {
      requireMediaSyncLease(claim.runId, claim.generation);
      const updatedRef = updateGitHubBranchRef(
        checkpoint.targetCommitSha,
        checkpoint.baseCommitSha,
      );
      return mediaSyncFinishSuccess(checkpoint, claim, {
        uploaded: checkpoint.metrics.uploadCount || 0,
        deleted: checkpoint.metrics.deleteCount || 0,
        commitSha: updatedRef.object && updatedRef.object.sha || checkpoint.targetCommitSha,
      });
    }

    throw new Error("MediaSync stopped in an unknown phase: " + checkpoint.phase);
  } catch (error) {
    if (checkpoint && MEDIA_SYNC_ACTIVE_METRICS) {
      checkpoint.metrics = checkpoint.metrics || {};
      checkpoint.metrics.githubRequests = MEDIA_SYNC_ACTIVE_METRICS.githubRequests;
      checkpoint.metrics.githubRequestCount =
        MEDIA_SYNC_ACTIVE_METRICS.githubRequestCount;
      saveMediaSyncDiagnostics(mediaSyncRunMetrics(
        checkpoint,
        error && error.code === "GITHUB_CONFLICT" ? "conflict" : "failed",
      ));
    }
    const recovery = recordMediaSyncFailure(claim.runId, claim.generation, error);
    if (!recovery.recorded) {
      if (recovery.reason === "lock") scheduleMediaSyncLockContentionRetry();
    } else if (recovery.retry) {
      try {
        const scheduled = ensureMediaSyncContinuationForGeneration(
          recovery.generation,
          mediaSyncContinuationDelayMs(recovery.retryNotBeforeAt),
        );
        if (!scheduled.scheduled && scheduled.reason === "lock") {
          throw new Error("State lock was unavailable while scheduling retry.");
        }
      } catch (scheduleError) {
        markMediaSyncSchedulingFailure(scheduleError, recovery.generation);
      }
    }
    throw error;
  } finally {
    MEDIA_SYNC_ACTIVE_METRICS = null;
    if (typeof resetMediaSyncGitHubConfigCache === "function") {
      resetMediaSyncGitHubConfigCache();
    }
  }
}

function testSyncMedia() {
  syncMedia();
}

/**
 * Pure planner. No Drive, GitHub, or Apps Script services are called.
 */
function buildMediaSyncPlan(input) {
  const {
    driveManifest = {},
    githubManifest = {},
    driveBlobShas = {},
    missingDriveSkus = [],
  } = input || {};

  const missingSkus = new Set(missingDriveSkus);
  const operations = [];
  const warnings = [];

  missingSkus.forEach((sku) => {
    warnings.push({
      type: "missing-drive-folder",
      sku: sku,
    });
  });

  Object.keys(driveManifest).forEach((sku) => {
    if (missingSkus.has(sku)) {
      return;
    }

    const driveFiles = driveManifest[sku] || [];
    const githubFiles = githubManifest[sku] || [];
    const githubByName = new Map(githubFiles.map((file) => [file.name, file]));
    const driveNames = new Set(driveFiles.map((file) => file.name));

    driveFiles.forEach((file) => {
      const githubFile = githubByName.get(file.name);

      if (!githubFile) {
        operations.push({ action: "upload", sku: sku, file: file });
        return;
      }

      const driveSha = driveBlobShas[sku] && driveBlobShas[sku][file.name];

      if (typeof driveSha === "string" && driveSha !== githubFile.sha) {
        operations.push({ action: "upload", sku: sku, file: file });
      }
    });

    githubFiles.forEach((file) => {
      if (!driveNames.has(file.name)) {
        operations.push({ action: "delete", sku: sku, file: file });
      }
    });
  });

  return {
    operations: operations,
    warnings: warnings,
  };
}
