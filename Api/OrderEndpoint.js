/**
 * ============================================================
 * PREVIA
 * OrderEndpoint.js
 *
 * Order Endpoint
 *
 * Responsibility:
 * - Receive Order API requests.
 * - Validate request structure.
 * - Delegate to OrderRepositoryAdapter.
 * - Return a transport-safe response.
 * - Do not contain business logic.
 * ============================================================
 */

const OrderEndpoint = (() => {

    /*
    =========================================
    Create Order
    =========================================
    */

    function create(data) {

    if (!data) {

        throw new Error(
            "Order request data is required."
        );

    }

    if (
        data.order === undefined
    ) {

        throw new Error(
            "Order data is required."
        );

    }

    if (
        data.items === undefined
    ) {

        throw new Error(
            "Order items are required."
        );

    }

    const repository =
    new OrderRepositoryAdapter();

const result =
    repository.save(

        data.order,

        data.items

    );

    return {

        order: result.order,

        items: result.items

    };

}

    /*
    =========================================
    Find Order
    =========================================
    */

    function find(data) {

        if (!data) {

            throw new Error(
                "Order request data is required."
            );

        }

        if (
            data.order_id === undefined
        ) {

            throw new Error(
                "Order ID is required."
            );

        }

        const repository =
    new OrderRepositoryAdapter();

return repository.findById(

    data.order_id

);

    }


    return {

        create,

        find

    };

})();