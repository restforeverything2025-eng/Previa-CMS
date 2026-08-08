/*
==================================================
PREVIA

FavoritesService.js

Favorites Service

Responsibility:

- Manage customer favorites.
- Find customer favorites.
- Add products to favorites.
- Remove products from favorites.
- Prevent duplicate favorites.
- Remain independent from storage implementation.

Does not communicate with Google Sheets directly.
==================================================
*/

const FavoritesService = (() => {

    function findByCustomer(customerId) {

        return FavoritesRepository.findByCustomer(
            customerId
        );

    }

    function add(customerId, productId) {

        const existingFavorite =
            FavoritesRepository.findByCustomerAndProduct(
                customerId,
                productId
            );

        if (existingFavorite) {

            return existingFavorite;

        }

        const favorite =
            FavoritesModel.create({

                customerId,

                productId,

                createdAt:
                    new Date()

            });

        FavoritesRepository.create(
            favorite
        );

        return favorite;

    }

    function remove(customerId, productId) {

        return FavoritesRepository.remove(
            customerId,
            productId
        );

    }

    function getAll(customerId) {

        return findByCustomer(
            customerId
        );

    }

    return {

        findByCustomer,

        add,

        remove,

        getAll

    };

})();

function testFavoritesService() {

    const customerId = "C000009";
    const productId = "SERVICE_TEST";

    const added =
        FavoritesService.add(
            customerId,
            productId
        );

    Logger.log(
        "Added:",
        added
    );


    const favorites =
        FavoritesService.getAll(
            customerId
        );

    Logger.log(
        "Customer favorites:",
        favorites
    );


    const addedAgain =
        FavoritesService.add(
            customerId,
            productId
        );

    Logger.log(
        "Added again:",
        addedAgain
    );


    const favoritesAfterDuplicate =
        FavoritesService.getAll(
            customerId
        );

    Logger.log(
        "After duplicate attempt:",
        favoritesAfterDuplicate
    );

}