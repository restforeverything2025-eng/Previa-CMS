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
const MEDIA_SYNC_BATCH_SIZE = 3;
const MEDIA_SYNC_CONTINUATION_HANDLER = "continueMediaSync";
const MEDIA_SYNC_AUDIT_HANDLER = "startMediaSyncAudit";
const MEDIA_SYNC_AUDIT_INTERVAL_DAYS = 30;

function getMediaSyncState() {
  const raw = PropertiesService.getScriptProperties().getProperty(MEDIA_SYNC_STATE_PROPERTY);
  if (!raw) return { lastSku: "", startedAt: "" };
  const state = JSON.parse(raw);
  if (!state || typeof state.lastSku !== "string") {
    throw new Error("Invalid persisted media-sync state. Refusing to reset progress automatically.");
  }
  return state;
}

function saveMediaSyncState(state) {
  PropertiesService.getScriptProperties().setProperty(MEDIA_SYNC_STATE_PROPERTY, JSON.stringify(state));
}

function clearMediaSyncState() {
  PropertiesService.getScriptProperties().deleteProperty(MEDIA_SYNC_STATE_PROPERTY);
}

function selectMediaSyncBatch(products, lastSku, batchSize) {
  const size = batchSize || MEDIA_SYNC_BATCH_SIZE;
  const sorted = (products || []).slice().sort((a, b) =>
    String(a.sku || "").localeCompare(String(b.sku || ""), undefined, {
      numeric: true,
      sensitivity: "base"
    })
  );
  const remaining = sorted.filter(product =>
    String(product.sku || "").localeCompare(String(lastSku || ""), undefined, {
      numeric: true,
      sensitivity: "base"
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
  ScriptApp.newTrigger(MEDIA_SYNC_AUDIT_HANDLER)
    .timeBased()
    .everyDays(MEDIA_SYNC_AUDIT_INTERVAL_DAYS)
    .create();
  return "Full media audit scheduled every " + MEDIA_SYNC_AUDIT_INTERVAL_DAYS + " days.";
}

/**
 * Start a full content audit. Unlike ordinary sync, this mode hashes every
 * Drive image that has a same-name GitHub counterpart, in resumable batches.
 * If another sync is already pending, leave its progress intact.
 */
function startMediaSyncAudit() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    Logger.log("Full media audit skipped: media synchronization is already running.");
    return "Media synchronization is already running; full audit was not started.";
  }

  try {
    const properties = PropertiesService.getScriptProperties();
    if (properties.getProperty(MEDIA_SYNC_STATE_PROPERTY)) {
      Logger.log("Full media audit skipped: a media sync is already pending.");
      return "A media sync is already pending; full audit was not started.";
    }
    properties.setProperty(MEDIA_SYNC_STATE_PROPERTY, JSON.stringify({
      lastSku: "",
      startedAt: new Date().toISOString(),
      mode: "audit"
    }));
  } finally {
    lock.releaseLock();
  }

  return syncMedia();
}

function ensureMediaSyncContinuation() {
  // A one-shot trigger may still be listed while its handler is running.
  // Replace all existing continuation triggers to guarantee a future run.
  removeMediaSyncContinuationTriggers();

  ScriptApp.newTrigger(MEDIA_SYNC_CONTINUATION_HANDLER)
    .timeBased()
    .after(60 * 1000)
    .create();
}

function removeMediaSyncContinuationTriggers() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === MEDIA_SYNC_CONTINUATION_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function continueMediaSync() {
  return syncMedia();
}

/**
 * Each execution reconciles a small SKU batch. The cursor advances only after
 * uploads, deletions and manifest publication all succeed. A one-shot trigger
 * resumes the next batch without changing Dashboard or menu entry points.
 */
function syncMedia() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    return "Media synchronization is already running. Try again shortly.";
  }

  try {
    const products = getProducts();
    const state = getMediaSyncState();
    const batch = selectMediaSyncBatch(products, state.lastSku, MEDIA_SYNC_BATCH_SIZE);

    if (batch.products.length === 0) {
      clearMediaSyncState();
      removeMediaSyncContinuationTriggers();
      Logger.log("Media synchronization completed.");
      return "Media synchronization completed. No remaining batches.";
    }

    const previousManifest = getPublishedMediaManifest();
    const githubManifest = getRepositoryImages();
    const batchDriveManifest = {};
    const missingDriveSkus = [];
    const driveBlobShas = {};
    // Reuse bytes read for content hashing when the same file is uploaded.
    const driveBytesBySkuAndName = {};
    const batchSkus = new Set(batch.products.map(product => String(product.sku)));

    batch.products.forEach(product => {
      const sku = String(product.sku);
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
        const driveFile = getDriveFileBytes(file.id);
        if (!driveBytesBySkuAndName[sku]) driveBytesBySkuAndName[sku] = {};
        driveBytesBySkuAndName[sku][file.name] = driveFile;
        driveBlobShas[sku][file.name] = getGitHubBlobSha(driveFile.bytes);
      });
    });

    // Preserve entries for all SKUs not visited in this batch.
    const batchManifest = {};
    Object.keys(previousManifest).forEach(sku => { batchManifest[sku] = previousManifest[sku]; });
    Object.keys(batchDriveManifest).forEach(sku => { batchManifest[sku] = batchDriveManifest[sku]; });
    missingDriveSkus.forEach(sku => {
      if (Object.prototype.hasOwnProperty.call(previousManifest, sku)) {
        batchManifest[sku] = previousManifest[sku];
      }
    });

    const plan = buildMediaSyncPlan({
      driveManifest: batchManifest,
      githubManifest: githubManifest,
      driveBlobShas: driveBlobShas,
      missingDriveSkus: missingDriveSkus
    });
    const operations = plan.operations.filter(operation => batchSkus.has(String(operation.sku)));
    const uploads = operations.filter(operation => operation.action === "upload");
    const deletions = operations.filter(operation => operation.action === "delete");
    const uploadedFiles = [];
    const deletedFiles = [];

    // Upload every new/replaced image in this batch before deleting old files.
    uploads.forEach(operation => {
      const cachedDriveFiles = driveBytesBySkuAndName[String(operation.sku)] || {};
      const driveFile = cachedDriveFiles[operation.file.name] || getDriveFileBytes(operation.file.id);
      const filePath = operation.sku + "/" + driveFile.name;
      publishFile({
        fileName: "images/" + filePath,
        bytes: driveFile.bytes,
        binary: true
      }, "Upload image " + filePath);
      uploadedFiles.push(filePath);
    });

    deletions.forEach(operation => {
      const filePath = operation.sku + "/" + operation.file.name;
      deleteFile(operation.file.path, "Delete image " + filePath);
      deletedFiles.push(filePath);
    });

    // Publish the manifest only after all image mutations succeed.
    // Do not advance the cursor unless manifest publication also succeeds.
    publishMediaManifest(batchManifest);

    if (batch.hasMoreAfterBatch) {
      const lastSku = String(batch.products[batch.products.length - 1].sku);
      saveMediaSyncState({
        lastSku: lastSku,
        startedAt: state.startedAt || new Date().toISOString(),
        mode: state.mode || "normal"
      });
      ensureMediaSyncContinuation();
    } else {
      // Complete on the last non-empty batch; do not schedule an unnecessary
      // empty execution just to clear the cursor and continuation trigger.
      clearMediaSyncState();
      removeMediaSyncContinuationTriggers();
    }

    const warnings = plan.warnings.filter(warning => batchSkus.has(String(warning.sku)));
    warnings.forEach(warning => Logger.log(
      "WARNING: Drive folder missing for SKU " + warning.sku +
      "; keeping previously published images and manifest entry."
    ));

    let report = batch.hasMoreAfterBatch
      ? "Media synchronization batch completed; continuing automatically."
      : "Final media synchronization batch completed; verifying completion.";
    report += "\n\nProcessed SKUs: " + batch.products.length;
    report += "\nUploaded: " + uploadedFiles.length;
    if (uploadedFiles.length) report += "\n  • " + uploadedFiles.join("\n  • ");
    report += "\nDeleted: " + deletedFiles.length;
    if (deletedFiles.length) report += "\n  • " + deletedFiles.join("\n  • ");
    if (warnings.length) {
      report += "\nSkipped SKUs (Drive folder missing): " + warnings.map(item => item.sku).join(", ");
    }
    return report;
  } finally {
    lock.releaseLock();
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
