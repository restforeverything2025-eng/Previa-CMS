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
- Guarantee atomic Customer get-or-create operations.
==================================================
*/

const CustomerService = (() => {

    function findById(id) {

        return CustomerRepository.findById(id);

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

        let maxNumber = 0;

        customers.forEach(row => {

            const customerId =
                row && row[0] !== undefined
                    ? String(row[0])
                    : "";

            const match =
                customerId.match(/^C(\d+)$/);

            if (!match) {

                return;

            }

            const number =
                Number(match[1]);

            if (
                Number.isInteger(number) &&
                number > maxNumber
            ) {

                maxNumber = number;

            }

        });

        const nextNumber =
            maxNumber + 1;

        return "C" +
            String(nextNumber).padStart(6, "0");

    }


    function getOrCreateCustomer(data) {

        const lock =
            LockService.getScriptLock();

        let lockAcquired = false;

        try {

            /*
            =========================================
            Customer creation is a single transaction.
            The lock MUST cover:
            find → generate ID → create
            =========================================
            */

            lock.waitLock(30000);

            lockAcquired = true;


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

            const now =
                new Date();

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

            CustomerRepository.create(
                customer
            );

            return customer;

        } finally {

            if (lockAcquired) {

                lock.releaseLock();

            }

        }

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
