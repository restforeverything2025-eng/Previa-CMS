/**
 * ==========================================
 * PREVIA Archive Service
 * ------------------------------------------
 * Archives products, preserves history
 * and manages the product lifecycle.
 * ==========================================
 */

/**
 * Archives a product.
 */

function archiveProduct(sku) {

  try {

    moveProductFolder(sku);

    moveProductRow(sku);

  } catch (error) {

    throw new Error(
      "Archive failed: " + error.message
    );

  }

}

function moveProductRow(sku) {

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

    if (data[i][1] === sku) {

      archiveSheet.appendRow(data[i]);

      productsSheet.deleteRow(i + 1);

      return;

    }

  }

  throw new Error(
  "Product not found: " + sku
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
 * Tests archiving a product.
 */
function testArchiveProduct() {

  archiveProduct("W0014");

}
