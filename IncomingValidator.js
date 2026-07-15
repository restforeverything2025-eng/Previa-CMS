function getNewProducts(products) {

  const rows =
    getNewProductRows();

  const list = [];

  rows.forEach(row => {

    list.push(
      products[row - 1]
    );

  });

  return list;

}

function sortIncomingFolders(folders) {

  folders.sort(function(a, b) {

    return Number(a.getName()) -
           Number(b.getName());

  });

  return folders;

}

function validateIncoming(products) {

  const newProducts =
    getNewProducts(products);

  const folders =
    getIncomingFolders();

  if (
    newProducts.length !==
    folders.length
  ) {

    throw new Error(

      "Incoming error.\n\n" +

      "New products: " +
      newProducts.length +

      "\nIncoming folders: " +
      folders.length

    );

  }

}

function testIncomingValidator() {

  const products =
    getProducts();

  validateIncoming(products);

  Logger.log("OK");

}

function matchProductsToFolders(products) {

  const newProducts =
    getNewProducts(products);

  const folders =
    getIncomingFolders();

  const pairs = [];

  for (
    let i = 0;
    i < newProducts.length;
    i++
  ) {

    pairs.push({

      product:
        newProducts[i],

      folder:
        folders[i]

    });

  }

  return pairs;

}

function testMatchProductsToFolders() {

  const products =
    getProducts();

  const pairs =
    matchProductsToFolders(products);

  pairs.forEach(pair => {

    Logger.log(

      pair.product.category +

      " -> " +

      pair.folder.getName()

    );

  });

}

function getNewProductRows() {

  const sheet =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName("Products");

  const data =
    sheet.getDataRange().getValues();

  const headers =
    data[0];

  const skuColumn =
    headers.indexOf("sku");

  const rows = [];

  for (
    let i = 1;
    i < data.length;
    i++
  ) {

    if (
      data[i][skuColumn] === ""
    ) {

      rows.push(i);

    }

  }

  return rows;

}

function testGetNewProductRows() {

  const products =
    getProducts();

  const rows =
    getNewProductRows();

  rows.forEach(row => {

    const product =
      products[row - 1];

    Logger.log(
      row +
      " -> " +
      product.name +
      " | " +
      product.sku +
      " | " +
      product.category
    );

  });

}

function hasNewProducts(products) {

  return getNewProducts(products).length > 0;

}

function testHasNewProducts() {

  const products =
    getProducts();

  Logger.log(
    hasNewProducts(products)
  );

}