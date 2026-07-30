/**
 * ==========================================
 * PREVIA Archive Service
 * ------------------------------------------
 * Archives products, preserves history
 * and manages the product lifecycle.
 * ==========================================
 */

function archiveProduct(product) {

  const spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  const productsSheet =
    spreadsheet.getSheetByName("Products");

  const archiveSheet =
    spreadsheet.getSheetByName("Archive");

  const headers =
    productsSheet
      .getDataRange()
      .getValues()[0];

  const data =
    productsSheet
      .getDataRange()
      .getValues();

  for (let i = 1; i < data.length; i++) {

    if (data[i][1] === product.sku) {

      archiveSheet.appendRow(data[i]);

      productsSheet.deleteRow(i + 1);

      return;

    }

  }

  throw new Error(

    "Product not found: " +

    product.sku

  );

}

function moveProductFolder(sku) {

  const config = getConfig();

  const productsFolder =
    DriveApp.getFolderById(
      config.products_folder_id
    );

  const archiveFolder =
    DriveApp.getFolderById(
      config.archive_folder_id
    );

  const folders =
    productsFolder.getFoldersByName(sku);

  if (!folders.hasNext()) {

    throw new Error(
      "Product folder not found: " + sku
    );

  }

  const folder = folders.next();

  archiveFolder.addFolder(folder);

  productsFolder.removeFolder(folder);

}

/**
 * TEMP
 * Tests moving a product folder
 * from Products to Archive.
 */
function testMoveProductFolder() {

  moveProductFolder("W0014");

}

/**
 * TEMP
 * Returns a product folder
 * from Archive to Products.
 */
function restoreProductFolder(sku) {

  const config = getConfig();

  const productsFolder =
    DriveApp.getFolderById(
      config.products_folder_id
    );

  const archiveFolder =
    DriveApp.getFolderById(
      config.archive_folder_id
    );

  const folders =
    archiveFolder.getFoldersByName(sku);

  if (!folders.hasNext()) {

    throw new Error(
      "Archived folder not found: " + sku
    );

  }

  const folder = folders.next();

  productsFolder.addFolder(folder);

  archiveFolder.removeFolder(folder);

}

/**
 * TEMP
 */
function testRestoreProductFolder() {

  restoreProductFolder("W0014");

}