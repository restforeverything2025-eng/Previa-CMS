/*
==================================================
PREVIA

FavoritesRepository.js

Favorites Repository

Responsibility:

- Manage Favorites Registry.
- Read favorite records.
- Write favorite records.
- Create Favorites Registry when needed.

Does not contain business logic.
==================================================
*/

const FavoritesRepository = (() => {

    const SHEET_NAME = "Favorites";

    const HEADERS = [

        "customerId",
        "productId",
        "createdAt"

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

    function findByCustomer(customerId) {

        const sheet =
            getSheet();

        const values =
            sheet.getDataRange().getValues();

        const favorites = [];

        for (
            let row = 1;
            row < values.length;
            row++
        ) {

            if (
                String(values[row][0]) ===
                String(customerId)
            ) {

                favorites.push({

                    customerId:
                        values[row][0],

                    productId:
                        values[row][1],

                    createdAt:
                        values[row][2]

                });

            }

        }

        return favorites;

    }

    function findByCustomerAndProduct(
        customerId,
        productId
    ) {

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
                String(customerId)

                &&

                String(values[row][1]) ===
                String(productId)

            ) {

                return {

                    customerId:
                        values[row][0],

                    productId:
                        values[row][1],

                    createdAt:
                        values[row][2]

                };

            }

        }

        return null;

    }

    function create(favorite) {

        const sheet =
            getSheet();

        sheet.appendRow([

            favorite.customerId,

            favorite.productId,

            favorite.createdAt

        ]);

    }

    function remove(
        customerId,
        productId
    ) {

        const sheet =
            getSheet();

        const values =
            sheet.getDataRange().getValues();

        for (
            let row = values.length - 1;
            row >= 1;
            row--
        ) {

            if (

                String(values[row][0]) ===
                String(customerId)

                &&

                String(values[row][1]) ===
                String(productId)

            ) {

                sheet.deleteRow(row + 1);

                return true;

            }

        }

        return false;

    }

    return {

        findByCustomer,

        findByCustomerAndProduct,

        create,

        remove

    };

})();

function testFavoritesRepository() {

    FavoritesRepository.create({

        customerId: "C000009",

        productId: "TEST_PRODUCT",

        createdAt: new Date()

    });

    Logger.log(
        "Favorite created."
    );

}