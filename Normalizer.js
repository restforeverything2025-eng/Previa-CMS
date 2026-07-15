/**
 * ==========================================
 * PREVIA Data Normalizer
 * ------------------------------------------
 * Automatically fixes safe formatting issues
 * before validation and publishing.
 * ==========================================
 */

function normalizeText(value) {

  if (value === null || value === undefined) {

    return "";

  }

  return String(value)
    .replace(/\u00A0/g, " ")
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .trim();

}

function normalizeProduct(product) {

  product.id = normalizeText(product.id);
  product.sku = normalizeText(product.sku);

  product.category = normalizeText(product.category);
  product.brand = normalizeText(product.brand);
  product.name = normalizeText(product.name);

  product.currency = normalizeText(product.currency);
  product.status = normalizeText(product.status);

  product.description = normalizeText(product.description);

  return product;

}

function normalizeProducts(products) {

  products.forEach(normalizeProduct);

}

function testNormalizer() {

  const testProduct = {

    id: " PV-0001 ",
    sku: " W0001 ",

    category: "  Годинники  ",
    brand: " Tissot  ",
    name: "  Tissot   PRX  ",

    currency: " EUR ",
    status: " available ",

    description: "  Vintage   watch  "

  };

  Logger.log("Before:");
  Logger.log(testProduct);

  const normalized =
    normalizeProduct(testProduct);

  Logger.log("After:");
  Logger.log(normalized);

}

