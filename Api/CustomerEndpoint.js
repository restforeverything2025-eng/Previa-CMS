/*
==================================================
PREVIA

CustomerEndpoint.js

Customer Endpoint

Responsibility:

- Receive Customer API requests.
- Validate request structure.
- Delegate to CustomerAPI.
- Return a transport-safe response.
- Do not contain business logic.
==================================================
*/

const CustomerEndpoint = (() => {

    /*
    =========================================
    Find existing Customer
    =========================================
    */

    function find(data) {

        if (!data) {

            throw new Error(
                "Customer request data is required."
            );

        }

        if (
            data.provider === undefined ||
            data.providerId === undefined
        ) {

            throw new Error(
                "Customer request is missing required fields."
            );

        }

        return CustomerAPI.findCustomer({

            provider:
                data.provider,

            providerId:
                data.providerId

        });

    }


    /*
    =========================================
    Get or Create Customer
    =========================================
    */

    function handle(data) {

        if (!data) {

            throw new Error(
                "Customer request data is required."
            );

        }

        if (
            data.provider === undefined ||
            data.providerId === undefined ||
            data.displayName === undefined
        ) {

            throw new Error(
                "Customer request is missing required fields."
            );

        }

        return CustomerAPI.getOrCreateCustomer({

    provider:
        data.provider,

    providerId:
        data.providerId,

    displayName:
        data.displayName,

    username:
        data.username

});

    }


    return {

        find,

        handle

    };

})();
