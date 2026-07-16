/**
 * ==========================================
 * PREVIA ID Generator
 * ------------------------------------------
 * Generates sequential product IDs.
 * ==========================================
 */

function assignId(products) {

  let max = 0;

  products.forEach(product => {

    if (!product.id) {

      return;

    }

    const number =
      parseInt(
        product.id.replace("PV-", ""),
        10
      );

    if (number > max) {

      max = number;

    }

  });

  products.forEach(product => {

    if (product.id) {

      return;

    }

    max++;

    product.id =
      "PV-" +
      Utilities.formatString(
        "%04d",
        max
      );

  });

}