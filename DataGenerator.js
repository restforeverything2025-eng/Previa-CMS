/**
 * ==========================================
 * PREVIA Data Generator
 * ------------------------------------------
 * Generates public catalog data.
 * ==========================================
 */

function generateDataJS(products) {

  const publicProducts =
    buildPublicProducts(products);

  return buildDataFile(publicProducts);

}

function buildPublicProducts(products) {

  return products.map(product =>

    buildPublicProduct(product)

  );

}

function buildPublicProduct(product) {

  return {

    id: product.id.trim(),
    sku: product.sku.trim(),
    category: product.category.trim(),
    brand: product.brand.trim(),
    name: product.name.trim(),
    currency: product.currency,
    price: product.price,
    status: product.status,
    dateAdded: formatDate(product.dateAdded),
    description: product.description,

    images: buildImagePaths(product.sku)

  };

}

function buildImagePaths(sku) {

  const images =
    getProductImages(sku);

  return images.map(fileName =>

    "images/" +
    sku +
    "/" +
    fileName

  );

}

function formatDate(value) {

  if (!(value instanceof Date)) {
    return value;
  }

  return Utilities.formatDate(
    value,
    Session.getScriptTimeZone(),
    "yyyy-MM-dd"
  );

}

function buildDataFile(products) {

 const exchangeRate =
  getExchangeRate();

return {

  fileName: "data.js",

  content:

    "const exchangeRate = " +

    JSON.stringify(
      exchangeRate,
      null,
      2
    ) +

    ";\n\n" +

    "const products = " +

    JSON.stringify(
      products,
      null,
      2
    ) +

    ";"

};

}

function testGenerateDataJS() {

  const products =
    getProducts();

  const data =
    generateDataJS(products);

  Logger.log(data.fileName);

  Logger.log(data.content);

}