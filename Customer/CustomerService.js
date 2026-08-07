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

    if (existingCustomer) {

        return existingCustomer;

    }

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

