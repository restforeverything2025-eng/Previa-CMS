/**
 * ==========================================
 * PREVIA Lookup Service
 * ------------------------------------------
 * Finds products without modifying data.
 * ==========================================
 */

/**
 * Finds a product by SKU.
 */
function findProductBySku(sku) {

  const spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  const productsSheet =
    spreadsheet.getSheetByName("Products");

  const data =
    productsSheet
      .getDataRange()
      .getValues();

  const headers = data[0];

  const index =
  getProductsColumnIndex(headers);

  for (let i = 1; i < data.length; i++) {

    if (data[i][index.sku] === sku) {

      return {

  id: data[i][index.id],
  sku: data[i][index.sku],
  category: data[i][index.category],
  brand: data[i][index.brand],
  name: data[i][index.name],
  currency: data[i][index.currency],
  price: data[i][index.price],
  status: data[i][index.status],
  dateAdded: "",
  sortOrder: data[i][index.sortOrder],
  description: data[i][index.description],
  notes: data[i][index.notes],
  featuredHome: data[i][index.featuredHome]

};

    }

  }

  return null;

}

/**
 * Returns Products sheet column indexes.
 */
function getProductsColumnIndex(headers) {

  const index = {

    id: headers.indexOf("id"),
    sku: headers.indexOf("sku"),
    category: headers.indexOf("category"),
    brand: headers.indexOf("brand"),
    name: headers.indexOf("name"),
    currency: headers.indexOf("currency"),
    price: headers.indexOf("price"),
    status: headers.indexOf("status"),
    dateAdded: headers.indexOf("dateAdded"),
    sortOrder: headers.indexOf("sortOrder"),
    description: headers.indexOf("description"),
    notes: headers.indexOf("notes"),
    featuredHome: headers.indexOf("featuredHome")

  };

  for (const key in index) {

    if (index[key] === -1) {

      throw new Error(
        `Products sheet is missing required column: ${key}`
      );

    }

  }

  return index;

}

/**
 * Tests product lookup.
 */
function testFindProductBySku() {

  const product =
  findProductBySku("W0014");

Logger.log(product);

Logger.log(product.brand);

Logger.log(product.price);

}

