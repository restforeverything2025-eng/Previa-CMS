function generateSku(category, products) {

  let prefix = "";

  if (category === "Годинники") {

    prefix = "W";

  }

  if (category === "Прикраси") {

    prefix = "J";

  }

  let max = 0;

  products.forEach(product => {

    if (!product.sku) {

      return;

    }

    if (!product.sku.startsWith(prefix)) {

      return;

    }

    const number =
      parseInt(
        product.sku.substring(1),
        10
      );

    if (number > max) {

      max = number;

    }

  });

  return (
    prefix +
    Utilities.formatString(
      "%04d",
      max + 1
    )
  );

}

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

  });

}

function getSkuCounters(products) {

  const counters = {

    W: 0,

    J: 0

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

  });

  return counters;

}

function testAutoIds() {

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