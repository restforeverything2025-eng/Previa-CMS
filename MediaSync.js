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
  products.forEach(product => {
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

  products.forEach(product => {
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
    missingDriveSkus: missingDriveSkus
  };
}

/**
 * Keep the last published list for SKUs whose Drive folder is
 * missing. Never interpret that missing folder as an empty folder.
 */
function mergeMediaManifests(driveManifest, previousManifest, missingDriveSkus) {
  const merged = {};
  const missingSkus = new Set(missingDriveSkus || []);

  Object.keys(driveManifest || {}).forEach(sku => {
    merged[sku] = driveManifest[sku];
  });

  missingSkus.forEach(sku => {
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
    inventory.missingDriveSkus
  );
}

function testMediaManifest() {
  const manifest = getMediaManifest();
  Logger.log(JSON.stringify(manifest, null, 2));
}

function testDriveFileInfo() {
  const images = getProductImages("J0002");
  const folder = getProductsFolder().getFoldersByName("J0002").next();
  const files = folder.getFiles();

  while (files.hasNext()) {
    const file = files.next();
    Logger.log("----------------");
    Logger.log("Name: " + file.getName());
    Logger.log("Id: " + file.getId());
    Logger.log("Size: " + file.getSize());
    Logger.log("Updated: " + file.getLastUpdated());
    Logger.log("Mime: " + file.getMimeType());
  }
}

function generateMediaManifest(manifestOverride) {
  const manifest = typeof manifestOverride === "undefined"
    ? getSafeMediaManifest()
    : manifestOverride;

  return {
    fileName: "media-manifest.json",
    content: JSON.stringify(manifest, null, 2)
  };
}

function testGenerateMediaManifest() {
  const file = generateMediaManifest();
  Logger.log(file.fileName);
  Logger.log(file.content);
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
  Logger.log(JSON.stringify(manifest, null, 2));
}

function getGitHubBlobSha(bytes) {
  const header = Utilities.newBlob("blob " + bytes.length + "\0").getBytes();
  const payload = header.concat(bytes);
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_1,
    payload
  );

  return digest.map(byte => {
    const value = byte < 0 ? byte + 256 : byte;
    return ("0" + value.toString(16)).slice(-2);
  }).join("");
}

/**
 * Diagnostic full-catalog planner used by compare/test helpers. The production
 * syncMedia path uses bounded SKU batches below to avoid one long execution.
 * Any non-missing-folder read error throws before this planner returns.
 */
/**
 * Manifest metadata is a fast-path match only when stable Drive ID, size and
 * last-updated timestamp all match. Otherwise hash the file before comparing.
 */
function isMediaFileMetadataUnchanged(file, previousFile) {
  return Boolean(
    file && previousFile && file.id && previousFile.id &&
    file.id === previousFile.id &&
    typeof file.size === "number" &&
    typeof previousFile.size === "number" &&
    file.size === previousFile.size &&
    file.updated && previousFile.updated &&
    file.updated === previousFile.updated
  );
}

function buildCurrentMediaSyncPlan(productsOverride) {
  const products = (productsOverride || getProducts()).slice();
  const inventory = getMediaSyncInventory(products);
  const previousManifest = getPublishedMediaManifest();
  const driveManifest = mergeMediaManifests(
    inventory.driveManifest,
    previousManifest,
    inventory.missingDriveSkus
  );
  const githubManifest = getRepositoryImages();
  const driveBlobShas = {};

  Object.keys(inventory.driveManifest).forEach(sku => {
    const driveFiles = inventory.driveManifest[sku] || [];
    const githubByName = new Map((githubManifest[sku] || []).map(item => [item.name, item]));
    const previousByName = new Map((previousManifest[sku] || []).map(item => [item.name, item]));
    driveBlobShas[sku] = {};

    driveFiles.forEach(file => {
      if (!githubByName.has(file.name)) return;
      if (isMediaFileMetadataUnchanged(file, previousByName.get(file.name))) return;
      const driveFile = getDriveFileBytes(file.id);
      driveBlobShas[sku][file.name] = getGitHubBlobSha(driveFile.bytes);
    });
  });

  const plan = buildMediaSyncPlan({
    driveManifest: driveManifest,
    githubManifest: githubManifest,
    driveBlobShas: driveBlobShas,
    missingDriveSkus: inventory.missingDriveSkus
  });

  return { operations: plan.operations, warnings: plan.warnings, manifest: driveManifest };
}

function compareMediaManifest() {
  return buildCurrentMediaSyncPlan().operations;
}

function testCompareMediaManifest() {
  const plan = buildCurrentMediaSyncPlan();
  Logger.log(JSON.stringify(plan, null, 2));
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
const MEDIA_SYNC_BATCH_SIZE = 3;
const MEDIA_SYNC_CONTINUATION_HANDLER = "continueMediaSync";
const MEDIA_SYNC_AUDIT_HANDLER = "startMediaSyncAudit";
const MEDIA_SYNC_AUDIT_INTERVAL_DAYS = 30;
const MEDIA_SYNC_MAX_RETRIES = 3;
const MEDIA_SYNC_RETRY_DELAY_MS = 5 * 60 * 1000;
// This is deliberately longer than one Apps Script execution. A running
// invocation renews before each Drive/GitHub boundary; the extra margin avoids
// automatic lease takeover while a slow external request is still in flight.
const MEDIA_SYNC_LEASE_MS = 20 * 60 * 1000;

function withMediaSyncStateLock(callback) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return { acquired: false };
  try { return { acquired: true, value: callback() }; }
  finally { lock.releaseLock(); }
}

function createMediaSyncRunId() {
  return new Date().getTime().toString(36) + "-" +
    Math.random().toString(36).slice(2);
}

function getMediaSyncState() {
  const raw = PropertiesService.getScriptProperties()
    .getProperty(MEDIA_SYNC_STATE_PROPERTY);
  if (!raw) return null;
  const state = JSON.parse(raw);
  if (!state || typeof state.lastSku !== "string") {
    throw new Error("Invalid persisted media-sync state. Refusing to reset progress automatically.");
  }
  return {
    lastSku: state.lastSku, startedAt: state.startedAt || "",
    mode: state.mode || "normal", retryCount: Number(state.retryCount) || 0,
    generation: Number(state.generation) || 0, activeRunId: state.activeRunId || "",
    leaseExpiresAt: state.leaseExpiresAt || "", status: state.status || "pending",
    lastError: state.lastError || "", lastFailureAt: state.lastFailureAt || ""
  };
}

function saveMediaSyncState(state) {
  PropertiesService.getScriptProperties().setProperty(
    MEDIA_SYNC_STATE_PROPERTY, JSON.stringify(state)
  );
}

function clearMediaSyncState() {
  PropertiesService.getScriptProperties().deleteProperty(MEDIA_SYNC_STATE_PROPERTY);
}

function saveMediaSyncStatus(status) {
  // Dashboard status is observability, not a reason to leave a claimed batch
  // stuck. State writes remain strict and will abort the run if they fail.
  try {
    PropertiesService.getScriptProperties().setProperty(
      MEDIA_SYNC_STATUS_PROPERTY,
      JSON.stringify(Object.assign({ updatedAt: new Date().toISOString() }, status))
    );
  } catch (error) {
    Logger.log(
      "Could not save media synchronization status: " +
      String(error && error.message ? error.message : error)
    );
  }
}

function getMediaSyncStatus() {
  const raw = PropertiesService.getScriptProperties()
    .getProperty(MEDIA_SYNC_STATUS_PROPERTY);
  return raw ? JSON.parse(raw) : null;
}

function selectMediaSyncBatch(products, lastSku, batchSize) {
  const size = batchSize || MEDIA_SYNC_BATCH_SIZE;
  const sorted = (products || []).slice().sort((a, b) =>
    String(a.sku || "").localeCompare(String(b.sku || ""), undefined, {
      numeric: true, sensitivity: "base"
    })
  );
  const remaining = sorted.filter(product =>
    String(product.sku || "").localeCompare(String(lastSku || ""), undefined, {
      numeric: true, sensitivity: "base"
    }) > 0
  );
  return { products: remaining.slice(0, size), hasMoreAfterBatch: remaining.length > size };
}

function setupMediaSyncAuditWorker() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === MEDIA_SYNC_AUDIT_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger(MEDIA_SYNC_AUDIT_HANDLER).timeBased()
    .everyDays(MEDIA_SYNC_AUDIT_INTERVAL_DAYS).create();
  return "Full media audit scheduled every " + MEDIA_SYNC_AUDIT_INTERVAL_DAYS + " days.";
}

function startMediaSyncAudit() {
  const result = withMediaSyncStateLock(() => {
    if (getMediaSyncState()) {
      return { started: false, message: "A media sync is already pending; full audit was not started." };
    }
    saveMediaSyncState({
      lastSku: "", startedAt: new Date().toISOString(), mode: "audit",
      retryCount: 0, generation: 0, activeRunId: "", leaseExpiresAt: "",
      status: "pending", lastError: "", lastFailureAt: ""
    });
    saveMediaSyncStatus({ status: "pending", mode: "audit", message: "Full media audit started." });
    return { started: true };
  });
  if (!result.acquired) return "Media synchronization is already running; full audit was not started.";
  if (!result.value.started) return result.value.message;
  return syncMedia({ requireExistingState: true });
}

/**
 * The following helpers must be called only while the script state lock is
 * held. Serializing state checks and trigger changes prevents a stale run from
 * deleting or replacing a newer run's continuation trigger.
 */
function removeMediaSyncContinuationTriggersLocked() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === MEDIA_SYNC_CONTINUATION_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function replaceMediaSyncContinuationTriggerLocked(delayMs) {
  removeMediaSyncContinuationTriggersLocked();
  ScriptApp.newTrigger(MEDIA_SYNC_CONTINUATION_HANDLER).timeBased()
    .after(typeof delayMs === "number" ? delayMs : 60 * 1000).create();
}

function ensureMediaSyncContinuationForGeneration(expectedGeneration, delayMs) {
  const result = withMediaSyncStateLock(() => {
    const state = getMediaSyncState();
    if (!state || state.generation !== expectedGeneration || state.activeRunId) {
      return { scheduled: false, reason: "superseded" };
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
    if (!state || state.activeRunId !== runId || state.generation !== generation) {
      return false;
    }

    const renewed = Object.assign({}, state, {
      leaseExpiresAt: new Date(Date.now() + MEDIA_SYNC_LEASE_MS).toISOString()
    });
    saveMediaSyncState(renewed);
    return true;
  });

  return Boolean(result.acquired && result.value);
}

function requireMediaSyncLease(runId, generation) {
  if (!renewMediaSyncLease(runId, generation)) {
    const error = new Error(
      "Media synchronization lost ownership before an external operation."
    );
    error.code = "MEDIA_SYNC_LEASE_LOST";
    throw error;
  }
}

function scheduleMediaSyncLockContentionRetry() {
  // Trigger mutations are never performed without the state lock. If lock
  // contention persists, leave state and triggers untouched for safe recovery.
  try {
    const result = withMediaSyncStateLock(() => {
      const state = getMediaSyncState();
      if (!state) {
        removeMediaSyncContinuationTriggersLocked();
        return { scheduled: false, reason: "none" };
      }
      replaceMediaSyncContinuationTriggerLocked(MEDIA_SYNC_RETRY_DELAY_MS);
      saveMediaSyncStatus({
        status: "waiting-for-lock",
        message: "Media synchronization is waiting for the state lock."
      });
      return { scheduled: true, generation: state.generation };
    });
    if (!result.acquired) {
      Logger.log("Could not schedule media synchronization after lock contention: state lock remains busy.");
    }
  } catch (error) {
    Logger.log(
      "Could not schedule media synchronization after lock contention: " +
      String(error && error.message ? error.message : error)
    );
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
    if (!state) {
      state = {
        lastSku: "", startedAt: new Date().toISOString(), mode: "normal",
        retryCount: 0, generation: 0, activeRunId: "", leaseExpiresAt: "",
        status: "pending", lastError: "", lastFailureAt: ""
      };
    }
    const now = new Date();
    const leaseExpires = state.leaseExpiresAt ? new Date(state.leaseExpiresAt).getTime() : 0;
    if (state.activeRunId && leaseExpires > now.getTime()) {
      return { claimed: false, reason: "active" };
    }
    const runId = createMediaSyncRunId();
    const claimed = Object.assign({}, state, {
      generation: state.generation + 1, activeRunId: runId,
      leaseExpiresAt: new Date(now.getTime() + MEDIA_SYNC_LEASE_MS).toISOString(),
      status: "running"
    });
    saveMediaSyncState(claimed);
    saveMediaSyncStatus({
      status: "running", mode: claimed.mode, lastSku: claimed.lastSku,
      generation: claimed.generation, runId: runId,
      message: "Media synchronization batch is running."
    });
    return { claimed: true, runId: runId, generation: claimed.generation, state: claimed };
  });
  return result.acquired ? result.value : { claimed: false, reason: "lock" };
}

function finalizeMediaSyncRun(runId, generation, nextState) {
  const result = withMediaSyncStateLock(() => {
    const state = getMediaSyncState();
    if (!state || state.activeRunId !== runId || state.generation !== generation) {
      return { committed: false };
    }
    if (nextState.complete) {
      clearMediaSyncState();
      removeMediaSyncContinuationTriggersLocked();
      saveMediaSyncStatus({
        status: "completed", mode: state.mode,
        lastSku: nextState.lastSku || state.lastSku,
        message: "Media synchronization completed."
      });
      return { committed: true, complete: true };
    }
    const pending = Object.assign({}, state, {
      lastSku: nextState.lastSku, retryCount: 0,
      generation: state.generation + 1, activeRunId: "", leaseExpiresAt: "",
      status: "pending", lastError: "", lastFailureAt: ""
    });
    saveMediaSyncState(pending);
    saveMediaSyncStatus({
      status: "pending", mode: pending.mode, lastSku: pending.lastSku,
      generation: pending.generation,
      message: "Media synchronization batch completed; continuation is required."
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
    const failed = Object.assign({}, state, {
      activeRunId: "", leaseExpiresAt: "", generation: state.generation + 1,
      retryCount: retryCount,
      status: retryCount <= MEDIA_SYNC_MAX_RETRIES ? "retry-pending" : "failed",
      lastError: message, lastFailureAt: new Date().toISOString()
    });
    saveMediaSyncState(failed);
    if (retryCount > MEDIA_SYNC_MAX_RETRIES) removeMediaSyncContinuationTriggersLocked();
    saveMediaSyncStatus({
      status: failed.status, mode: failed.mode, lastSku: failed.lastSku,
      retryCount: retryCount, lastError: message,
      message: retryCount <= MEDIA_SYNC_MAX_RETRIES
        ? "Media synchronization failed; retry is pending."
        : "Media synchronization failed permanently; automatic retries stopped."
    });
    return {
      recorded: true,
      retry: retryCount <= MEDIA_SYNC_MAX_RETRIES,
      generation: failed.generation
    };
  });
  return result.acquired
    ? result.value
    : { recorded: false, retry: false, reason: "lock" };
}

function markMediaSyncSchedulingFailure(error) {
  const result = withMediaSyncStateLock(() => {
    const state = getMediaSyncState();
    if (!state) return false;
    const message = String(error && error.message ? error.message : error);
    const failed = Object.assign({}, state, {
      activeRunId: "", leaseExpiresAt: "", status: "failed",
      lastError: message, lastFailureAt: new Date().toISOString()
    });
    saveMediaSyncState(failed);
    saveMediaSyncStatus({
      status: "failed", mode: failed.mode, lastSku: failed.lastSku,
      retryCount: failed.retryCount, lastError: message,
      message: "Media synchronization needs manual recovery because its continuation could not be scheduled."
    });
    return true;
  });
  return result.acquired && result.value;
}

function continueMediaSync() {
  return syncMedia({ requireExistingState: true });
}

function syncMedia(options) {
  const claim = claimMediaSyncRun(options);
  if (!claim.claimed) {
    if (claim.reason === "none") return "No pending media synchronization.";
    if (claim.reason === "lock" || claim.reason === "active") {
      // A continuation may be the only remaining recovery path after an
      // in-flight run stalls. Replacing, rather than adding, the one-shot
      // trigger keeps at most one future check scheduled.
      scheduleMediaSyncLockContentionRetry();
    }
    return "Media synchronization is already running. Try again shortly.";
  }
  const state = claim.state;
  try {
    requireMediaSyncLease(claim.runId, claim.generation);
    const products = getProducts();
    const batch = selectMediaSyncBatch(products, state.lastSku, MEDIA_SYNC_BATCH_SIZE);
    if (batch.products.length === 0) {
      const finalized = finalizeMediaSyncRun(claim.runId, claim.generation, {
        complete: true, lastSku: state.lastSku
      });
      if (!finalized.committed) {
        scheduleMediaSyncLockContentionRetry();
        return "Media synchronization completion is pending confirmation.";
      }
      return "Media synchronization completed. No remaining batches.";
    }

    saveMediaSyncStatus({
      status: "running",
      mode: state.mode,
      currentSku: String(batch.products[0].sku),
      batchStartSku: String(batch.products[0].sku),
      batchEndSku: String(batch.products[batch.products.length - 1].sku),
      lastSku: state.lastSku,
      retryCount: state.retryCount,
      message: "Media synchronization batch is running."
    });

    const previousManifest = getPublishedMediaManifest();
    const githubManifest = getRepositoryImages();
    const batchDriveManifest = {};
    const missingDriveSkus = [];
    const driveBlobShas = {};
    const driveBytesBySkuAndName = {};
    const batchSkus = new Set(batch.products.map(product => String(product.sku)));

    batch.products.forEach(product => {
      const sku = String(product.sku);
      requireMediaSyncLease(claim.runId, claim.generation);
      const result = getProductFilesResult(sku);
      if (!result.found) {
        missingDriveSkus.push(sku);
        return;
      }
      batchDriveManifest[sku] = result.files;
      const previousByName = new Map((previousManifest[sku] || []).map(file => [file.name, file]));
      const githubByName = new Map((githubManifest[sku] || []).map(file => [file.name, file]));
      driveBlobShas[sku] = {};
      result.files.forEach(file => {
        if (!githubByName.has(file.name)) return;
        if (state.mode !== "audit" &&
            isMediaFileMetadataUnchanged(file, previousByName.get(file.name))) return;
        requireMediaSyncLease(claim.runId, claim.generation);
        const driveFile = getDriveFileBytes(file.id);
        if (!driveBytesBySkuAndName[sku]) driveBytesBySkuAndName[sku] = {};
        driveBytesBySkuAndName[sku][file.name] = driveFile;
        driveBlobShas[sku][file.name] = getGitHubBlobSha(driveFile.bytes);
      });
    });

    const batchManifest = {};
    Object.keys(previousManifest).forEach(sku => { batchManifest[sku] = previousManifest[sku]; });
    Object.keys(batchDriveManifest).forEach(sku => { batchManifest[sku] = batchDriveManifest[sku]; });
    missingDriveSkus.forEach(sku => {
      if (Object.prototype.hasOwnProperty.call(previousManifest, sku)) {
        batchManifest[sku] = previousManifest[sku];
      }
    });

    const plan = buildMediaSyncPlan({
      driveManifest: batchManifest, githubManifest: githubManifest,
      driveBlobShas: driveBlobShas, missingDriveSkus: missingDriveSkus
    });
    const operations = plan.operations.filter(operation => batchSkus.has(String(operation.sku)));
    const uploads = operations.filter(operation => operation.action === "upload");
    const deletions = operations.filter(operation => operation.action === "delete");
    const uploadedFiles = [];
    const deletedFiles = [];

    uploads.forEach(operation => {
      requireMediaSyncLease(claim.runId, claim.generation);
      const cached = driveBytesBySkuAndName[String(operation.sku)] || {};
      if (!cached[operation.file.name]) {
        requireMediaSyncLease(claim.runId, claim.generation);
      }
      const driveFile = cached[operation.file.name] || getDriveFileBytes(operation.file.id);
      const filePath = operation.sku + "/" + driveFile.name;
      publishFile({ fileName: "images/" + filePath, bytes: driveFile.bytes, binary: true },
        "Upload image " + filePath);
      uploadedFiles.push(filePath);
    });
    deletions.forEach(operation => {
      requireMediaSyncLease(claim.runId, claim.generation);
      const filePath = operation.sku + "/" + operation.file.name;
      deleteFile(operation.file.path, "Delete image " + filePath);
      deletedFiles.push(filePath);
    });

    const manifestChanged = JSON.stringify(batchManifest) !== JSON.stringify(previousManifest);
    if (manifestChanged || operations.length > 0) {
      // The lease check immediately before manifest publication is the last
      // ownership fence before the externally visible batch commit.
      requireMediaSyncLease(claim.runId, claim.generation);
      publishMediaManifest(batchManifest);
    }

    const lastSku = String(batch.products[batch.products.length - 1].sku);
    requireMediaSyncLease(claim.runId, claim.generation);
    const finalized = finalizeMediaSyncRun(claim.runId, claim.generation, {
      complete: !batch.hasMoreAfterBatch, lastSku: lastSku
    });
    if (!finalized.committed) {
      if (finalized.reason === "lock") {
        scheduleMediaSyncLockContentionRetry();
        return "Media synchronization could not confirm its cursor; a retry was scheduled.";
      }
      return "Media synchronization result was superseded; no cursor was changed.";
    }
    if (!finalized.complete) {
      try {
        const scheduled = ensureMediaSyncContinuationForGeneration(finalized.generation);
        if (!scheduled.scheduled) {
          if (scheduled.reason === "lock") {
            throw new Error("State lock was unavailable while scheduling continuation.");
          }
          return "Media synchronization result was superseded; no stale continuation was scheduled.";
        }
      } catch (scheduleError) {
        markMediaSyncSchedulingFailure(scheduleError);
        throw new Error(
          "Media synchronization batch completed but continuation trigger could not be created: " +
          String(scheduleError && scheduleError.message ? scheduleError.message : scheduleError)
        );
      }
    }

    const warnings = plan.warnings.filter(warning => batchSkus.has(String(warning.sku)));
    warnings.forEach(warning => Logger.log(
      "WARNING: Drive folder missing for SKU " + warning.sku +
      "; keeping previously published images and manifest entry."
    ));
    let report = finalized.complete
      ? "Final media synchronization batch completed."
      : "Media synchronization batch completed; continuing automatically.";
    report += "\n\nProcessed SKUs: " + batch.products.length;
    report += "\nUploaded: " + uploadedFiles.length;
    report += "\nDeleted: " + deletedFiles.length;
    if (warnings.length) {
      report += "\nSkipped SKUs (Drive folder missing): " + warnings.map(item => item.sku).join(", ");
    }
    saveMediaSyncStatus({
      status: finalized.complete ? "completed" : "pending",
      mode: state.mode,
      currentSku: "",
      lastSku: lastSku,
      batchStartSku: String(batch.products[0].sku),
      batchEndSku: lastSku,
      processedSkus: batch.products.length,
      uploadedFiles: uploadedFiles.length,
      deletedFiles: deletedFiles.length,
      retryCount: 0,
      message: finalized.complete
        ? "Media synchronization completed."
        : "Media synchronization batch completed; continuation is pending."
    });
    return report;
  } catch (error) {
    const recovery = recordMediaSyncFailure(claim.runId, claim.generation, error);
    if (!recovery.recorded) {
      if (recovery.reason === "lock") scheduleMediaSyncLockContentionRetry();
    } else if (recovery.retry) {
      try {
        const scheduled = ensureMediaSyncContinuationForGeneration(
          recovery.generation,
          MEDIA_SYNC_RETRY_DELAY_MS
        );
        if (!scheduled.scheduled && scheduled.reason === "lock") {
          throw new Error("State lock was unavailable while scheduling retry.");
        }
      } catch (scheduleError) {
        markMediaSyncSchedulingFailure(scheduleError);
      }
    }
    throw error;
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
    missingDriveSkus = []
  } = input || {};

  const missingSkus = new Set(missingDriveSkus);
  const operations = [];
  const warnings = [];

  missingSkus.forEach(sku => {
    warnings.push({
      type: "missing-drive-folder",
      sku: sku
    });
  });

  Object.keys(driveManifest).forEach(sku => {
    if (missingSkus.has(sku)) {
      return;
    }

    const driveFiles = driveManifest[sku] || [];
    const githubFiles = githubManifest[sku] || [];
    const githubByName = new Map(
      githubFiles.map(file => [file.name, file])
    );
    const driveNames = new Set(
      driveFiles.map(file => file.name)
    );

    driveFiles.forEach(file => {
      const githubFile = githubByName.get(file.name);

      if (!githubFile) {
        operations.push({ action: "upload", sku: sku, file: file });
        return;
      }

      const driveSha = driveBlobShas[sku] &&
        driveBlobShas[sku][file.name];

      if (
        typeof driveSha === "string" &&
        driveSha !== githubFile.sha
      ) {
        operations.push({ action: "upload", sku: sku, file: file });
      }
    });

    githubFiles.forEach(file => {
      if (!driveNames.has(file.name)) {
        operations.push({ action: "delete", sku: sku, file: file });
      }
    });
  });

  return {
    operations: operations,
    warnings: warnings
  };
}
