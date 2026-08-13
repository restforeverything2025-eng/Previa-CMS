/**
 * ============================================================
 * PREVIA CMS
 * Product Repository Adapter
 * ============================================================
 *
 * Adapts PREVIA-CMS storage functions to the
 * PREVIA Core ProductRepository contract.
 *
 * Core contract:
 *   findBySku(sku)
 *
 * CMS implementation:
 *   getProducts()
 * ============================================================
 */


class ProductRepositoryAdapter {

  findBySku(sku) {

    const products =
      getProducts();


    const product =
      products.find(
        item => item.sku === sku
      );


    if (!product) {

      return null;

    }


    return product;

  }

}

function testProductRepositoryAdapter() {

  const repository =
    new ProductRepositoryAdapter();


  const found =
    repository.findBySku("J0001");


  Logger.log(
    "Found:"
  );

  Logger.log(
    found
  );


  const missing =
    repository.findBySku("TEST-NOT-EXISTS");


  Logger.log(
    "Missing:"
  );

  Logger.log(
    missing
  );

}