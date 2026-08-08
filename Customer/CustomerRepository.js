/*
==================================================
PREVIA

CustomerRepository.js

Customer Repository

Responsibility:

- Manage Customer Registry.
- Read customer records.
- Write customer records.
- Create Customer Registry when needed.
==================================================
*/

const CustomerRepository = (() => {

    const SHEET_NAME = "Customers";

    const HEADERS = [

        "customerId",
        "provider",
        "providerId",
        "displayName",
        "username",
        "createdAt",
        "updatedAt",
        "status"

    ];


    function getSheet() {

        const spreadsheet =
            SpreadsheetApp.getActiveSpreadsheet();

        let sheet =
            spreadsheet.getSheetByName(SHEET_NAME);

        if (!sheet) {

            sheet =
                spreadsheet.insertSheet(SHEET_NAME);

            sheet
                .getRange(
                    1,
                    1,
                    1,
                    HEADERS.length
                )
                .setValues([HEADERS]);

        }

        return sheet;

    }


    function findByProvider(provider, providerId) {

        const sheet =
            getSheet();

        const values =
            sheet.getDataRange().getValues();

        for (
            let row = 1;
            row < values.length;
            row++
        ) {

            if (

                values[row][1] === provider &&
                String(values[row][2]) === String(providerId)

            ) {

                return {

                    customerId:
                        values[row][0],

                    provider:
                        values[row][1],

                    providerId:
                        String(values[row][2]),

                    displayName:
                        values[row][3],

                    username:
                        values[row][4],

                    createdAt:
                        values[row][5],

                    updatedAt:
                        values[row][6],

                    status:
                        values[row][7]

                };

            }

        }

        return null;

    }


    function getAll() {

        const sheet =
            getSheet();

        const values =
            sheet.getDataRange().getValues();

        if (values.length <= 1) {

            return [];

        }

        return values.slice(1);

    }


    function create(customer) {

        const sheet =
            getSheet();

        sheet.appendRow([

            customer.customerId,
            customer.provider,
            customer.providerId,
            customer.displayName,
            customer.username,
            customer.createdAt,
            customer.updatedAt,
            customer.status

        ]);

    }

    function update(customer) {

    const sheet =
        getSheet();

    const values =
        sheet.getDataRange().getValues();

    for (
        let row = 1;
        row < values.length;
        row++
    ) {

        if (
            String(values[row][0]) ===
            String(customer.customerId)
        ) {

            sheet
                .getRange(
                    row + 1,
                    1,
                    1,
                    HEADERS.length
                )
                .setValues([

                    [

                        customer.customerId,

                        customer.provider,

                        customer.providerId,

                        customer.displayName,

                        customer.username,

                        customer.createdAt,

                        customer.updatedAt,

                        customer.status

                    ]

                ]);

            return;

        }

    }

    throw new Error(
        "Customer not found: " +
        customer.customerId
    );

}

    return {

    getSheet,

    findByProvider,

    getAll,

    create,

    update

};

})();
