/**
 * ==========================================
 * PREVIA Data Generator
 * ------------------------------------------
 * Generates public catalog data.
 * ==========================================
 */

function generateDataJS(products, manifest) {

  const publicProducts =
    buildPublicProducts(
      products,
      manifest
    );

  return buildDataFile(publicProducts);

}

function buildPublicProducts(
  products,
  manifest
) {

  return products.map(product =>

    buildPublicProduct(
      product,
      manifest
    )

  );

}

function buildPublicProduct(
  product,
  manifest
) {

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

    images: buildImagePaths(
    product.sku,
    manifest
)

  };

}

function getManifestImages(manifest, sku) {

  if (!manifest || !manifest[sku]) {
    return [];
  }

  return manifest[sku]
    .map(file => file.name)
    .sort();

}

function buildImagePaths(sku, manifest) {

  const images = manifest
    ? getManifestImages(manifest, sku)
    : getProductImages(sku);

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