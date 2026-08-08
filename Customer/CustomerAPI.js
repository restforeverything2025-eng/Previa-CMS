/*
==================================================
PREVIA

CustomerAPI.js

Customer API

Responsibility:

- Expose Customer Domain operations.
- Accept external customer data.
- Delegate business logic to CustomerService.
- Do not contain business logic.
==================================================
*/

const CustomerAPI = (() => {

    /*
    =========================================
    Find existing Customer
    =========================================
    */

    function findCustomer(data) {

        return CustomerService.findByProvider(

            data.provider,

            data.providerId

        );

    }


    /*
    =========================================
    Get or Create Customer
    =========================================
    */

    function getOrCreateCustomer(data) {

        return CustomerService.getOrCreateCustomer({

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

        findCustomer,

        getOrCreateCustomer

    };

})();

