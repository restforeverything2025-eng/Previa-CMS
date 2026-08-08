/*
==================================================
PREVIA

FavoritesAPI.js

Favorites API

Responsibility:

- Expose Favorites Domain operations.
- Accept external Favorites data.
- Delegate business logic to FavoritesService.
- Do not contain business logic.
==================================================
*/

const FavoritesAPI = (() => {

    function getFavorites(customerId) {

        return FavoritesService.getAll(
            customerId
        );

    }

    function addFavorite(
        customerId,
        productId
    ) {

        return FavoritesService.add(

            customerId,

            productId

        );

    }

    function removeFavorite(
        customerId,
        productId
    ) {

        return FavoritesService.remove(

            customerId,

            productId

        );

    }

    return {

        getFavorites,

        addFavorite,

        removeFavorite

    };

})();

function testFavoritesAPI() {

    const customerId = "C000009";
    const productId = "API_TEST_2";


    const added =
        FavoritesAPI.addFavorite(
            customerId,
            productId
        );

    Logger.log(
        "1. ADDED:\n" +
        JSON.stringify(added, null, 2)
    );


    const favorites =
        FavoritesAPI.getFavorites(
            customerId
        );

    Logger.log(
        "2. FAVORITES:\n" +
        JSON.stringify(favorites, null, 2)
    );


    const removed =
        FavoritesAPI.removeFavorite(
            customerId,
            productId
        );

    Logger.log(
        "3. REMOVED:\n" +
        JSON.stringify(removed, null, 2)
    );


    const afterRemove =
        FavoritesAPI.getFavorites(
            customerId
        );

    Logger.log(
        "4. AFTER REMOVE:\n" +
        JSON.stringify(afterRemove, null, 2)
    );

}