const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");


/*
==================================================
PREVIA

customer-cms.test.js

Purpose:
- Test CustomerService independently from Google Apps Script.
- Verify Customer ID generation.
- Verify get-or-create behavior.
- Verify LockService usage.
- Verify lock covers find → generate → create.
==================================================
*/


function loadCustomerService(initialRows = []) {

    const rows =
        initialRows.map(row => [...row]);


    const lockState = {

        locked: false,

        waitCalls: 0,

        releaseCalls: 0,

        events: []

    };


    const repositoryState = {

        createShouldFail: false

    };


    const LockService = {

        getScriptLock() {

            lockState.events.push(
                "getScriptLock"
            );


            return {

                waitLock(timeout) {

                    lockState.waitCalls++;

                    lockState.events.push(
                        `waitLock:${timeout}`
                    );

                    lockState.locked = true;

                },


                releaseLock() {

                    lockState.releaseCalls++;

                    lockState.events.push(
                        "releaseLock"
                    );

                    lockState.locked = false;

                }

            };

        }

    };


    function rowToCustomer(row) {

        return {

            customerId:
                row[0],

            provider:
                row[1],

            providerId:
                row[2],

            displayName:
                row[3],

            username:
                row[4],

            createdAt:
                row[5],

            updatedAt:
                row[6],

            status:
                row[7]

        };

    }


    const CustomerRepository = {

        findById(id) {

            const row =
                rows.find(
                    row =>
                        String(row[0]) ===
                        String(id)
                );


            return row
                ? rowToCustomer(row)
                : null;

        },


        findByProvider(
            provider,
            providerId
        ) {

            assert.equal(
                lockState.locked,
                true,
                "findByProvider must execute while Customer lock is held"
            );


            lockState.events.push(
                "findByProvider"
            );


            const row =
                rows.find(
                    row =>
                        String(row[1]) ===
                            String(provider) &&

                        String(row[2]) ===
                            String(providerId)
                );


            return row
                ? rowToCustomer(row)
                : null;

        },


        getAll() {

            assert.equal(
                lockState.locked,
                true,
                "getAll must execute while Customer lock is held"
            );


            lockState.events.push(
                "getAll"
            );


            return rows;

        },


        create(customer) {

            assert.equal(
                lockState.locked,
                true,
                "create must execute while Customer lock is held"
            );


            lockState.events.push(
                "create"
            );


            if (
                repositoryState.createShouldFail
            ) {

                throw new Error(
                    "Simulated repository failure"
                );

            }


            rows.push([

                customer.customerId,

                customer.provider,

                customer.providerId,

                customer.displayName,

                customer.username,

                customer.createdAt,

                customer.updatedAt,

                customer.status

            ]);

        },


        update(customer) {

            assert.equal(
                lockState.locked,
                true,
                "update must execute while Customer lock is held"
            );


            lockState.events.push(
                "update"
            );


            const index =
                rows.findIndex(
                    row =>
                        String(row[0]) ===
                        String(customer.customerId)
                );


            assert.notEqual(
                index,
                -1,
                "Customer must exist before update"
            );


            rows[index] = [

                customer.customerId,

                customer.provider,

                customer.providerId,

                customer.displayName,

                customer.username,

                customer.createdAt,

                customer.updatedAt,

                customer.status

            ];

        }

    };


    const CustomerModel = {

        create(data) {

            return {

                ...data

            };

        }

    };


    /*
    =========================================
    Important:
    CustomerService.js declares:

        const CustomerService = ...

    Therefore we explicitly expose it
    from inside the VM after evaluating
    the production source.
    =========================================
    */

    const context =
        vm.createContext({

            LockService,

            CustomerRepository,

            CustomerModel,

            console,

            __getCustomerService: null

        });


    const servicePath =
        path.join(
            __dirname,
            "..",
            "Customer",
            "CustomerService.js"
        );


    const source =
        fs.readFileSync(
            servicePath,
            "utf8"
        );


    const wrappedSource = `

        ${source}

        __getCustomerService =
            CustomerService;

    `;


    vm.runInContext(
        wrappedSource,
        context,
        {
            filename:
                "CustomerService.js"
        }
    );


    return {

        CustomerService:
            context.__getCustomerService,

        rows,

        lockState,

        repositoryState

    };

}


/*
==================================================
1. First Customer ID
==================================================
*/

test(
    "CustomerService: creates first customer as C000001",
    () => {

        const {

            CustomerService,

            rows

        } =
            loadCustomerService();


        const customer =
            CustomerService.getOrCreateCustomer({

                provider:
                    "telegram",

                providerId:
                    "111111",

                displayName:
                    "Test User",

                username:
                    "test_user"

            });


        assert.equal(
            customer.customerId,
            "C000001"
        );


        assert.equal(
            rows.length,
            1
        );


        assert.equal(
            rows[0][0],
            "C000001"
        );

    }
);


/*
==================================================
2. Next ID after existing customers
==================================================
*/

test(
    "CustomerService: generates next ID after existing customers",
    () => {

        const {

            CustomerService

        } =
            loadCustomerService([

                [

                    "C000001",

                    "telegram",

                    "100001",

                    "User One",

                    "user_one",

                    new Date(),

                    new Date(),

                    "active"

                ],

                [

                    "C000002",

                    "telegram",

                    "100002",

                    "User Two",

                    "user_two",

                    new Date(),

                    new Date(),

                    "active"

                ]

            ]);


        const customer =
            CustomerService.getOrCreateCustomer({

                provider:
                    "telegram",

                providerId:
                    "100003",

                displayName:
                    "User Three",

                username:
                    "user_three"

            });


        assert.equal(
            customer.customerId,
            "C000003"
        );

    }
);


/*
==================================================
3. ID generation with gaps
==================================================
*/

test(
    "CustomerService: uses maximum existing ID instead of row count",
    () => {

        const {

            CustomerService

        } =
            loadCustomerService([

                [

                    "C000001",

                    "telegram",

                    "200001",

                    "User One",

                    "user_one",

                    new Date(),

                    new Date(),

                    "active"

                ],

                [

                    "C000007",

                    "telegram",

                    "200007",

                    "User Seven",

                    "user_seven",

                    new Date(),

                    new Date(),

                    "active"

                ]

            ]);


        const customer =
            CustomerService.getOrCreateCustomer({

                provider:
                    "telegram",

                providerId:
                    "200008",

                displayName:
                    "User Eight",

                username:
                    "user_eight"

            });


        assert.equal(
            customer.customerId,
            "C000008"
        );

    }
);


/*
==================================================
4. Repeated registration of same user
==================================================
*/

test(
    "CustomerService: repeated same provider identity returns same customer",
    () => {

        const {

            CustomerService,

            rows

        } =
            loadCustomerService();


        const first =
            CustomerService.getOrCreateCustomer({

                provider:
                    "telegram",

                providerId:
                    "300001",

                displayName:
                    "Same User",

                username:
                    "same_user"

            });


        const second =
            CustomerService.getOrCreateCustomer({

                provider:
                    "telegram",

                providerId:
                    "300001",

                displayName:
                    "Same User",

                username:
                    "same_user"

            });


        assert.equal(
            first.customerId,
            "C000001"
        );


        assert.equal(
            second.customerId,
            "C000001"
        );


        assert.equal(
            rows.length,
            1
        );

    }
);


/*
==================================================
5. Username update
==================================================
*/

test(
    "CustomerService: updates username without changing customer ID",
    () => {

        const {

            CustomerService,

            rows

        } =
            loadCustomerService();


        const first =
            CustomerService.getOrCreateCustomer({

                provider:
                    "telegram",

                providerId:
                    "400001",

                displayName:
                    "Username Test",

                username:
                    "old_username"

            });


        const second =
            CustomerService.getOrCreateCustomer({

                provider:
                    "telegram",

                providerId:
                    "400001",

                displayName:
                    "Username Test",

                username:
                    "new_username"

            });


        assert.equal(
            first.customerId,
            "C000001"
        );


        assert.equal(
            second.customerId,
            "C000001"
        );


        assert.equal(
            second.username,
            "new_username"
        );


        assert.equal(
            rows.length,
            1
        );


        assert.equal(
            rows[0][4],
            "new_username"
        );

    }
);


/*
==================================================
6. Different users get different IDs
==================================================
*/

test(
    "CustomerService: different provider identities get different customer IDs",
    () => {

        const {

            CustomerService,

            rows

        } =
            loadCustomerService();


        const userA =
            CustomerService.getOrCreateCustomer({

                provider:
                    "telegram",

                providerId:
                    "500001",

                displayName:
                    "User A",

                username:
                    "user_a"

            });


        const userB =
            CustomerService.getOrCreateCustomer({

                provider:
                    "telegram",

                providerId:
                    "500002",

                displayName:
                    "User B",

                username:
                    "user_b"

            });


        assert.equal(
            userA.customerId,
            "C000001"
        );


        assert.equal(
            userB.customerId,
            "C000002"
        );


        assert.notEqual(
            userA.customerId,
            userB.customerId
        );


        assert.equal(
            rows.length,
            2
        );

    }
);


/*
==================================================
7. Lock sequence
==================================================
*/

test(
    "CustomerService: lock surrounds find → generate → create sequence",
    () => {

        const {

            CustomerService,

            lockState

        } =
            loadCustomerService();


        CustomerService.getOrCreateCustomer({

            provider:
                "telegram",

            providerId:
                "600001",

            displayName:
                "Lock Test",

            username:
                "lock_test"

        });


        assert.equal(
            lockState.waitCalls,
            1
        );


        assert.equal(
            lockState.releaseCalls,
            1
        );


        assert.deepEqual(
            lockState.events,
            [

                "getScriptLock",

                "waitLock:30000",

                "findByProvider",

                "getAll",

                "create",

                "releaseLock"

            ]
        );

    }
);


/*
==================================================
8. Lock is released when repository operation fails
==================================================
*/

test(
    "CustomerService: releases lock when customer creation fails",
    () => {

        const {

            CustomerService,

            lockState,

            repositoryState

        } =
            loadCustomerService();


        repositoryState.createShouldFail =
            true;


        assert.throws(

            () => {

                CustomerService.getOrCreateCustomer({

                    provider:
                        "telegram",

                    providerId:
                        "700001",

                    displayName:
                        "Failure Test",

                    username:
                        "failure_test"

                });

            },

            /Simulated repository failure/

        );


        assert.equal(
            lockState.waitCalls,
            1
        );


        assert.equal(
            lockState.releaseCalls,
            1
        );


        assert.equal(
            lockState.locked,
            false
        );

    }
);
