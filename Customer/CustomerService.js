/*
==================================================
PREVIA

CustomerService.js

Customer Service

Responsibility:
- Manage customer records.
- Find customers.
- Create customers.
- Update customer information.
- Remain independent from authentication providers.
==================================================
*/

const CustomerService = (() => {

    function findById(id) {

    }

    function findByProvider(provider, providerId) {

    return CustomerRepository.findByProvider(

        provider,

        providerId

    );

}

    function generateCustomerId() {

    const customers =
        CustomerRepository.getAll();

    const nextNumber =
        customers.length + 1;

    return "C" +
        String(nextNumber).padStart(6, "0");

}

    function getOrCreateCustomer(data) {

    const existingCustomer =
        findByProvider(
            data.provider,
            data.providerId
        );


    /*
    =========================================
    Existing Customer
    =========================================
    */

    if (existingCustomer) {

        const username =
            data.username || "";

        if (
            existingCustomer.username !== username
        ) {

            const updatedCustomer =
                CustomerModel.create({

                    customerId:
                        existingCustomer.customerId,

                    provider:
                        existingCustomer.provider,

                    providerId:
                        existingCustomer.providerId,

                    displayName:
                        existingCustomer.displayName,

                    username:
                        username,

                    createdAt:
                        existingCustomer.createdAt,

                    updatedAt:
                        new Date(),

                    status:
                        existingCustomer.status

                });

            CustomerRepository.update(
                updatedCustomer
            );

            return updatedCustomer;

        }

        return existingCustomer;

    }


    /*
    =========================================
    New Customer
    =========================================
    */

    const now = new Date();

    const customer =
        CustomerModel.create({

            customerId:
                generateCustomerId(),

            provider:
                data.provider,

            providerId:
                data.providerId,

            displayName:
                data.displayName,

            username:
                data.username || "",

            createdAt:
                now,

            updatedAt:
                now,

            status:
                "active"

        });

    CustomerRepository.create(customer);

    return customer;

}

    function create(customer) {

    }

    function update(customer) {

    }

    return {

        findById,
        findByProvider,
        create,
        update,
        getOrCreateCustomer

    };

})();

