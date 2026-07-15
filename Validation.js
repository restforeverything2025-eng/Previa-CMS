/**
 * ==========================================
 * PREVIA Validation Module
 * ------------------------------------------
 * Validates the catalog before publication.
 * Stops on the first validation error.
 * ==========================================
 */

function validateProducts(products) {

  if (!products || products.length === 0) {
    throw new Error("Validation failed.\n\nCatalog is empty.");
  }

  const skuSet = new Set();

  const allowedCurrencies = [
    "EUR",
    "USD",
    "UAH"
  ];

  const allowedStatuses = [
    "available",
    "sold",
    "reserved",
    "hidden"
  ];

  products.forEach(product => {

    checkRequired(product.id, "ID", product);

    checkRequired(product.sku, "SKU", product);

    if (skuSet.has(product.sku)) {
      throwValidation(
        product,
        "SKU",
        "Duplicate SKU."
      );
    }

    skuSet.add(product.sku);

    checkRequired(
      product.category,
      "Category",
      product
    );

    checkRequired(
      product.brand,
      "Brand",
      product
    );

    checkRequired(
      product.name,
      "Name",
      product
    );

    checkRequired(
      product.description,
      "Description",
      product
    );

    if (
      typeof product.price !== "number" ||
      product.price <= 0
    ) {
      throwValidation(
        product,
        "Price",
        "Price must be greater than zero."
      );
    }

    if (
      !allowedCurrencies.includes(product.currency)
    ) {
      throwValidation(
        product,
        "Currency",
        "Unsupported currency."
      );
    }

    if (
      !allowedStatuses.includes(product.status)
    ) {
      throwValidation(
        product,
        "Status",
        "Unsupported status."
      );
    }

  });

  return true;

}

function checkRequired(value, field, product) {

  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {

    throwValidation(
      product,
      field,
      field + " is empty."
    );

  }

}

function throwValidation(
  product,
  field,
  reason
) {

  throw new Error(

    "Validation failed\n\n" +

    "SKU: " +

    product.sku +

    "\n\nField:\n" +

    field +

    "\n\nReason:\n" +

    reason

  );

}

/**
 * ==========================================
 * Validates Google Drive images.
 * ==========================================
 */

function validateImages(products) {

  products.forEach(product => {

    getProductImages(product.sku);

  });

  return true;

}