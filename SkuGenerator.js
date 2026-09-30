/**
 * ==========================================
 * PREVIA SKU Generator
 * ------------------------------------------
 * Generates sequential product SKUs.
 * ==========================================
 */

function assignSku(products) {

  const counters =
    getSkuCounters(products);

  products.forEach(product => {

    if (product.sku) {

      return;

    }

    if (
      product.category ===
      "Годинники"
    ) {

      counters.W++;

      product.sku =
        "W" +
        Utilities.formatString(
          "%04d",
          counters.W
        );

    }

    if (
      product.category ===
      "Прикраси"
    ) {

      counters.J++;

      product.sku =
        "J" +
        Utilities.formatString(
          "%04d",
          counters.J
        );

    }

    if (
    product.category ===
    "Сумки"
    ) {

    counters.B++;

    product.sku =
        "B" +
        Utilities.formatString(
            "%04d",
            counters.B
        );

    }

    if (
    product.category ===
    "Окуляри"
    ) {

    counters.G++;

    product.sku =
        "G" +
        Utilities.formatString(
            "%04d",
            counters.G
        );

    }

    if (
    product.category ===
    "Одяг"
    ) {

    counters.A++;

    product.sku =
        "A" +
        Utilities.formatString(
            "%04d",
            counters.A
        );

    }

    if (
    product.category ===
    "Декор"
    ) {

    counters.D++;

    product.sku =
        "D" +
        Utilities.formatString(
            "%04d",
            counters.D
        );

    }

  });

}

function getSkuCounters(products) {

  const counters = {

    W: 0,

    J: 0,

    B: 0,

    G: 0,

    A: 0,

    D: 0

};

  products.forEach(product => {

    if (!product.sku) {

      return;

    }

    const prefix =
      product.sku.substring(0, 1);

    const number =
      parseInt(
        product.sku.substring(1),
        10
      );

    if (
      prefix === "W" &&
      number > counters.W
    ) {

      counters.W = number;

    }

    if (
      prefix === "J" &&
      number > counters.J
    ) {

      counters.J = number;

    }

    if (
      prefix === "B" &&
      number > counters.B
    ) {

      counters.B = number;

    }

    if (
      prefix === "G" &&
      number > counters.G
   ) {

      counters.G = number;

   }

    if (
      prefix === "A" &&
      number > counters.A
   ) {

      counters.A = number;

   }

    if (
      prefix === "D" &&
      number > counters.D
   ) {

      counters.D = number;

   }

  });

  return counters;

}

function testIdAndSkuGeneration() {

  const products = getProducts();

  assignId(products);

  assignSku(products);

  Logger.log(products);

}

function testSkuCounters() {

  const products = getProducts();

  const counters = getSkuCounters(products);

  Logger.log(counters);

}