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

    for (let row = 1; row < values.length; row++) {

        if (

            values[row][1] === provider &&
            String(values[row][2]) === String(providerId)

        ) {

            return values[row];

        }

    }

    return null;

}

   function create(customer) {

    const sheet =
        getSheet();

    sheet.appendRow([

        customer.customerId,
        customer.provider,
        customer.providerId,
        customer.displayName,
        customer.createdAt,
        customer.updatedAt,
        customer.status

    ]);

}

return {

    getSheet,

    findByProvider,

    create

};

})();

function testCustomerRepository() {

    const sheet =
        CustomerRepository.getSheet();

    Logger.log(sheet.getName());

}

function testFindCustomer() {

    const customer =
        CustomerRepository.findByProvider(

            "telegram",

            "123456789"

        );

    Logger.log(customer);

}