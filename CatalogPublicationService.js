/**
 * ============================================================
 * PREVIA CMS
 * Catalog Publication Service
 *
 * Coalesces catalog publication requests and publishes the public
 * catalog outside the order transaction.
 * ============================================================
 */

const CATALOG_PUBLICATION_PENDING_PROPERTY = "PREVIA_CATALOG_PUBLICATION_PENDING";
const CATALOG_PUBLICATION_PENDING_VALUE = "1";
const CATALOG_PUBLICATION_WORKER_INTERVAL_MINUTES = 5;

function markCatalogPublicationPending() {
  const lock = LockService.getScriptLock();
  let ownsLock = false;

  try {
    lock.waitLock(10000);
    ownsLock = true;

    PropertiesService
      .getScriptProperties()
      .setProperty(
        CATALOG_PUBLICATION_PENDING_PROPERTY,
        CATALOG_PUBLICATION_PENDING_VALUE
      );

    Logger.log("PREVIA catalog publication queued.");

    return {
      success: true,
      status: "pending"
    };
  } catch (error) {
    const message = error && error.message ? error.message : String(error);

    Logger.log(
      "PREVIA catalog publication queue failed: " +
      message
    );

    return {
      success: false,
      code: "CATALOG_PUBLICATION_QUEUE_ERROR",
      message: message
    };
  } finally {
    if (ownsLock) {
      lock.releaseLock();
    }
  }
}

function isCatalogPublicationPending() {
  return PropertiesService
    .getScriptProperties()
    .getProperty(CATALOG_PUBLICATION_PENDING_PROPERTY) === CATALOG_PUBLICATION_PENDING_VALUE;
}

function clearCatalogPublicationPending() {
  PropertiesService
    .getScriptProperties()
    .deleteProperty(CATALOG_PUBLICATION_PENDING_PROPERTY);
}

function processPendingCatalogPublication() {
  const lock = LockService.getScriptLock();
  let ownsLock = false;

  try {
    lock.waitLock(10000);
    ownsLock = true;

    if (!isCatalogPublicationPending()) {
      Logger.log("PREVIA catalog publication worker: nothing pending.");
      return {
        success: true,
        skipped: true
      };
    }

    const products = getProducts();

    Logger.log(
      "PREVIA catalog publication worker started: products=" +
      products.length
    );

    publishDataJS(products);
    clearCatalogPublicationPending();

    Logger.log("PREVIA catalog publication worker completed.");

    return {
      success: true,
      products: products.length
    };
  } catch (error) {
    const message = error && error.message ? error.message : String(error);

    // Keep the pending flag so the next worker run retries publication.
    Logger.log(
      "PREVIA catalog publication worker failed: " +
      message
    );

    return {
      success: false,
      code: "CATALOG_PUBLICATION_ERROR",
      retryable: true,
      message: message
    };
  } finally {
    if (ownsLock) {
      lock.releaseLock();
    }
  }
}

function setupCatalogPublicationWorker() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === "processPendingCatalogPublication") {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger("processPendingCatalogPublication")
    .timeBased()
    .everyMinutes(CATALOG_PUBLICATION_WORKER_INTERVAL_MINUTES)
    .create();

  Logger.log(
    "PREVIA catalog publication worker scheduled every " +
    CATALOG_PUBLICATION_WORKER_INTERVAL_MINUTES +
    " minutes."
  );
}

function testCatalogPublicationQueue() {
  return markCatalogPublicationPending();
}

function testCatalogPublicationWorker() {
  return processPendingCatalogPublication();
}
