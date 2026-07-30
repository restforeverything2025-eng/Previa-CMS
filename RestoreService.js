/**
 * Restores an archived product.
 */
function restoreProduct(sku) {

  moveProductFolderBack(sku);

  moveProductRowBack(sku);

}

/**
 * Moves a product folder from Archive to Products.
 */
function moveProductFolderBack(sku) {

  const archiveFolder = getArchiveFolder();

  const productsFolder = getProductsFolder();

  const folders = archiveFolder.getFoldersByName(sku);

  if (!folders.hasNext()) {

    throw new Error("Archived product folder not found: " + sku);

  }

  const folder = folders.next();

  productsFolder.addFolder(folder);

  archiveFolder.removeFolder(folder);

}

/**
 * Moves a product row from Archive to Products.
 */
function moveProductRowBack(sku) {

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  const productsSheet =
    spreadsheet.getSheetByName(
      getConfig().products_sheet
    );

  const archiveSheet =
    spreadsheet.getSheetByName(
      getConfig().archive_sheet
    );

  const archiveData =
    archiveSheet.getDataRange().getValues();

  const headers = archiveData[0];

  const skuColumn =
    headers.indexOf("sku");

  if (skuColumn === -1) {

    throw new Error(
      "SKU column not found."
    );

  }

  for (let i = 1; i < archiveData.length; i++) {

    if (archiveData[i][skuColumn] === sku) {

      productsSheet.appendRow(
        archiveData[i]
      );

      archiveSheet.deleteRow(i + 1);

      return;

    }

  }

  throw new Error(
    "Archived product not found: " + sku
  );

}

/**
 * Tests moving a product folder back from Archive.
 */
function testMoveProductFolderBack() {

  moveProductFolderBack("W0014");

}

/**
 * Tests moving a product row back from Archive.
 */
function testMoveProductRowBack() {

  moveProductRowBack("W0014");

}

/**
 * Tests restoring an archived product.
 */
function testRestoreProduct() {

  restoreProduct("W0014");

}