function doGet() {

  return HtmlService
    .createHtmlOutputFromFile(
      "Index"
    )
    .setTitle(
      "PREVIA CMS"
    );

}

function publishFromWeb() {

  Logger.log("publishFromWeb started");

  return publishBoutique(false);

}

function refreshImagesFromWeb() {

  Logger.log("refreshImagesFromWeb started");

  refreshMedia();

  return "Images synchronized successfully.";

}

/**
 * Returns product information by SKU for Dashboard.
 */
function getProductBySku(sku) {

  return findProductBySku(sku);

}

/**
 * Returns an archived product by SKU.
 */
function getArchivedProductBySku(sku) {

  return findArchivedProductBySku(sku);

}