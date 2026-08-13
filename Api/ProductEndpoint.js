/**
 * ============================================================
 * PREVIA
 * ProductEndpoint.js
 *
 * Product Endpoint
 *
 * Responsibility:
 * - Receive Product API requests.
 * - Validate request structure.
 * - Delegate to ProductRepositoryAdapter.
 * - Return a transport-safe response.
 * - Do not contain business logic.
 * ============================================================
 */

const ProductEndpoint = (() => {

    /*
    =========================================
    Find Product
    =========================================
    */

    function find(data) {

        if (!data) {

            throw new Error(
                "Product request data is required."
            );

        }

        if (
            data.sku === undefined
        ) {

            throw new Error(
                "Product SKU is required."
            );

        }

        const repository =
            new ProductRepositoryAdapter();

        return repository.findBySku(
            data.sku
        );

    }


    return {

        find

    };

})();

function testProductEndpoint() {

    const found =
        ProductEndpoint.find({
            sku: "J0001"
        });

    Logger.log(
        "Found:"
    );

    Logger.log(
        found
    );


    const missing =
        ProductEndpoint.find({
            sku: "TEST-NOT-EXISTS"
        });

    Logger.log(
        "Missing:"
    );

    Logger.log(
        missing
    );

}
