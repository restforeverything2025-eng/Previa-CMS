/**
 * ==========================================
 * PREVIA Dashboard
 * ------------------------------------------
 * Provides data for the CMS dashboard.
 * ==========================================
 */

function getDashboardData() {

  const productStats =
  getProductStats();

const mediaStats =
  getMediaStats();

const publicationStats =
  getPublicationStats();

return {

  ...productStats,

  ...mediaStats,

  ...publicationStats,

  mediaSync: getDashboardMediaSyncStatus()

};

}

function getEmptyPublication(){

  return {

    result: "-",

    date: "-"

  };

}

function getLastPublication() {

  const sheet =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(
        "PublicationJournal"
      );

  if (!sheet) {

    return getEmptyPublication();

  }

  const lastRow =
    sheet.getLastRow();

  if (lastRow <= 1) {

    return getEmptyPublication();

  }

  const row =
    sheet
      .getRange(
        lastRow,
        1,
        1,
        5
      )
      .getValues()[0];

  return {

    date:
      Utilities.formatDate(

        row[0],

        Session.getScriptTimeZone(),

        "dd.MM.yyyy HH:mm"

      ),

    result:
      row[3]

  };

}

function getProductStats() {

  const products =
    getProducts();

  const newProducts =
    getNewProducts(products);

  return {

    products:
      products.length,

    newProducts:
      newProducts.length

  };

}

function getMediaStats() {

  const manifest =
  getPublishedMediaManifest();
  
  return {

    folders:
      Object.keys(manifest).length,

    images:
      Object
        .values(manifest)
        .reduce(

          (count, files) =>

            count + files.length,

          0

        )

  };

}

function getPublicationStats() {

  const journal =
    getLastPublication();

  return {

    result:
      journal.result,

    date:
      journal.date

  };

}

/**
 * Lightweight polling endpoint for Dashboard. It reads only Script Properties;
 * unlike getDashboardData it does not fetch media-manifest.json from GitHub.
 */
function getDashboardMediaSyncStatus() {
  const status = typeof getMediaSyncStatus === "function"
    ? getMediaSyncStatus()
    : null;

  if (!status) {
    return {
      status: "idle",
      currentSku: "",
      lastSku: "",
      batchStartSku: "",
      batchEndSku: "",
      processedSkus: 0,
      uploadedFiles: 0,
      deletedFiles: 0,
      retryCount: 0,
      lastError: "",
      updatedAt: ""
    };
  }

  return {
    status: status.status || "unknown",
    currentSku: status.currentSku || "",
    lastSku: status.lastSku || "",
    batchStartSku: status.batchStartSku || "",
    batchEndSku: status.batchEndSku || "",
    processedSkus: Number(status.processedSkus) || 0,
    uploadedFiles: Number(status.uploadedFiles) || 0,
    deletedFiles: Number(status.deletedFiles) || 0,
    retryCount: Number(status.retryCount) || 0,
    lastError: status.lastError || "",
    updatedAt: status.updatedAt || "",
    message: status.message || ""
  };
}
