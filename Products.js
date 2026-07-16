/**
 * ==========================================
 * PREVIA Products Service
 * ------------------------------------------
 * Reads and writes products
 * in Google Sheets.
 * ==========================================
 */

function getProducts() {

  const sheet =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName("Products");

  const data =
    sheet.getDataRange().getValues();

  const headers = data[0];

  const products = [];

  for(let i = 1; i < data.length; i++){

    if (

  data[i].every(cell => cell === "")

) {

  continue;

}

    const product = {};

    for(let j = 0; j < headers.length; j++){

      product[headers[j]] = data[i][j];

    }

    products.push(product);

  }

  return products;

}

function normalizeProduct(product){

  const normalized = { ...product };

  normalized.category = product.category;

  if(product.price){

    const match =
      product.price.match(/^([\d\s]+)\s*(EUR|UAH|USD|€)$/);

    if(match){

      normalized.price =
        Number(match[1].replace(/\s/g,""));

      normalized.currency =
        match[2] === "€"
          ? "EUR"
          : match[2];

    }

  }

  return normalized;

}

function saveProduct(product){

  const sheet =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName("Products");

      const products = getProducts();

const duplicate = products.find(p =>

  p.id === product.id ||

  p.sku === product.sku

);

if(duplicate){

  throw new Error(

    "Product already exists: " +

    product.id +

    " / " +

    product.sku

  );

}

  const headers =
    sheet
      .getRange(1,1,1,sheet.getLastColumn())
      .getValues()[0];

  const row = [];

  const defaults = {

  sortOrder: "",

  notes: "",

  featuredHome: false

};

headers.forEach(header => {

  if(product.hasOwnProperty(header)){

    row.push(product[header]);

  }else if(defaults.hasOwnProperty(header)){

    row.push(defaults[header]);

  }else{

    row.push("");

  }

});

  sheet.appendRow(row);

}

function clearProducts(){

  const sheet =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName("Products");

  const lastRow = sheet.getLastRow();

  if(lastRow <= 1){

    return;

  }

  sheet.getRange(
    2,
    1,
    lastRow - 1,
    sheet.getLastColumn()
  ).clearContent();

}

function testClearProducts(){

  clearProducts();

  Logger.log("Products cleared.");

}

function testGetProducts(){

  const products =
    getProducts();

  Logger.log(products);

}