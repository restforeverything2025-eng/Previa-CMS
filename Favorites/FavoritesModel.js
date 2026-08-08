/*
==================================================
PREVIA

FavoritesModel.js

Favorites Model

Responsibility:

- Represent a favorite record.
- Create immutable favorite objects.
- Validate favorite structure.
==================================================
*/

const FavoritesModel = (() => {

    function create({

        customerId,

        productId,

        createdAt

    }) {

        return Object.freeze({

            customerId,

            productId,

            createdAt

        });

    }

    function isFavorite(value) {

        return (

            value &&
            typeof value === "object" &&

            "customerId" in value &&
            "productId" in value &&
            "createdAt" in value

        );

    }

    return {

        create,

        isFavorite

    };

})();