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

    function getOrCreateCustomer(customer) {

    const existingCustomer =

        findByProvider(

            customer.provider,

            customer.providerId

        );
 
    if (existingCustomer) {

        return existingCustomer;

    }

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

function testGetOrCreateCustomer() {

    const customer = {

        customerId: "C000001",

        provider: "telegram",

        providerId: "123456789",

        displayName: "Test Customer",

        createdAt: new Date(),

        updatedAt: new Date(),

        status: "active"

    };

    const result =

        CustomerService.getOrCreateCustomer(customer);

    Logger.log(result);

}