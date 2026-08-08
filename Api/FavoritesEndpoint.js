/*
==================================================
PREVIA

FavoritesEndpoint.js

Favorites Endpoint

Responsibility:

- Receive Favorites API requests.
- Validate request structure.
- Delegate to FavoritesAPI.
- Return a transport-safe response.
- Do not contain business logic.
==================================================
*/

const FavoritesEndpoint = (() => {

    function getFavorites(data) {

        if (!data) {

            throw new Error(
                "Favorites request data is required."
            );

        }

        if (
            data.customerId === undefined
        ) {

            throw new Error(
                "Customer ID is required."
            );

        }

        return FavoritesAPI.getFavorites(
            data.customerId
        );

    }

    function addFavorite(data) {

        if (!data) {

            throw new Error(
                "Favorites request data is required."
            );

        }

        if (
            data.customerId === undefined ||
            data.productId === undefined
        ) {

            throw new Error(
                "Customer ID and Product ID are required."
            );

        }

        return FavoritesAPI.addFavorite(

            data.customerId,

            data.productId

        );

    }

    function removeFavorite(data) {

        if (!data) {

            throw new Error(
                "Favorites request data is required."
            );

        }

        if (
            data.customerId === undefined ||
            data.productId === undefined
        ) {

            throw new Error(
                "Customer ID and Product ID are required."
            );

        }

        return FavoritesAPI.removeFavorite(

            data.customerId,

            data.productId

        );

    }

    return {

        getFavorites,

        addFavorite,

        removeFavorite

    };

})();

function testFavoritesEndpoint() {

    const customerId = "C000009";
    const productId = "ENDPOINT_TEST";


    const added =
        FavoritesEndpoint.addFavorite({

            customerId,
            productId

        });

    Logger.log(
        "1. ADDED:\n" +
        JSON.stringify(
            added,
            null,
            2
        )
    );


    const favorites =
        FavoritesEndpoint.getFavorites({

            customerId

        });

    Logger.log(
        "2. FAVORITES:\n" +
        JSON.stringify(
            favorites,
            null,
            2
        )
    );


    const removed =
        FavoritesEndpoint.removeFavorite({

            customerId,
            productId

        });

    Logger.log(
        "3. REMOVED:\n" +
        JSON.stringify(
            removed,
            null,
            2
        )
    );

}