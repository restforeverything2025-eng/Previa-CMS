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
 * Reads all source state and builds a plan before syncMedia performs
 * any GitHub writes/deletes. Any non-missing-folder read error throws.
 */
function buildCurrentMediaSyncPlan() {
  const products = getProducts();
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
    const githubFiles = githubManifest[sku] || [];
    driveBlobShas[sku] = {};

    driveFiles.forEach(file => {
      const githubFile = githubFiles.find(item => item.name === file.name);
      if (!githubFile) {
        return;
      }

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

  return {
    operations: plan.operations,
    warnings: plan.warnings,
    manifest: driveManifest
  };
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
function syncMedia() {
  const plan = buildCurrentMediaSyncPlan();
  const operations = plan.operations;
  const uploadedFiles = [];
  const deletedFiles = [];

  plan.warnings.forEach(warning => {
    Logger.log(
      "WARNING: Drive folder missing for SKU " + warning.sku +
      "; keeping previously published images and manifest entry."
    );
  });

  if (operations.length === 0) {
    if (plan.warnings.length === 0) {
      Logger.log("Media already synchronized.");
      return "Media already synchronized.\n\nUploaded: 0\nDeleted: 0";
    }

    // Even with no file operations, publish the merged manifest so
    // missing SKUs retain their last known image list.
    publishMediaManifest(plan.manifest);
    return (
      "Media synchronization completed with warnings." +
      "\n\nUploaded: 0\nDeleted: 0" +
      "\n\nSkipped SKUs: " +
      plan.warnings.map(item => item.sku).join(", ")
    );
  }

  const uploads = operations.filter(operation => operation.action === "upload");
  const deletions = operations.filter(operation => operation.action === "delete");

  uploads.forEach(operation => {
    const driveFile = getDriveFileBytes(operation.file.id);
    const filePath = operation.sku + "/" + driveFile.name;

    publishFile({
      fileName: "images/" + filePath,
      bytes: driveFile.bytes,
      binary: true
    }, "Upload image " + filePath);

    uploadedFiles.push(filePath);
    Logger.log("Uploaded: " + filePath);
  });

  deletions.forEach(operation => {
    const filePath = operation.sku + "/" + operation.file.name;

    deleteFile(operation.file.path, "Delete image " + filePath);
    deletedFiles.push(filePath);
    Logger.log("Deleted: " + filePath);
  });

  // Do not publish a new manifest unless all planned mutations succeeded.
  publishMediaManifest(plan.manifest);

  Logger.log("Media synchronization completed.");

  let report = plan.warnings.length
    ? "Media synchronization completed with warnings."
    : "Media synchronization completed.";

  report += "\n\nUploaded: " + uploadedFiles.length;
  if (uploadedFiles.length > 0) {
    report += "\n  • " + uploadedFiles.join("\n  • ");
  }

  report += "\n\nDeleted: " + deletedFiles.length;
  if (deletedFiles.length > 0) {
    report += "\n  • " + deletedFiles.join("\n  • ");
  }

  if (plan.warnings.length > 0) {
    report += "\n\nSkipped SKUs (Drive folder missing): " +
      plan.warnings.map(item => item.sku).join(", ");
  }

  return report;
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
