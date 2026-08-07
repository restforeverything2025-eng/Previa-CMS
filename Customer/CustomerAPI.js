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

    function getOrCreateCustomer(data) {

        return CustomerService.getOrCreateCustomer({

            provider:
                data.provider,

            providerId:
                data.providerId,

            displayName:
                data.displayName

        });

    }

    return {

        getOrCreateCustomer

    };

})();

