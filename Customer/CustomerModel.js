/*
==================================================
PREVIA

CustomerModel.js

Customer Model

Responsibility:
- Represent a PREVIA customer.
- Create immutable customer objects.
- Validate customer structure.
==================================================
*/

const CustomerModel = (() => {

    function create({

        customerId,

        provider,

        providerId,

        displayName,

        username,

        createdAt,

        updatedAt,

        status

    }) {

        return Object.freeze({

            customerId,

            provider,

            providerId,

            displayName,

            username,

            createdAt,

            updatedAt,

            status

        });

    }

    function isCustomer(value) {

        return (

            value &&
            typeof value === "object" &&

            "customerId" in value &&
            "provider" in value &&
            "providerId" in value &&
            "displayName" in value &&
            "username" in value &&
            "createdAt" in value &&
            "updatedAt" in value &&
            "status" in value

        );

    }

    return {

        create,

        isCustomer

    };

})();