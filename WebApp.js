function doGet() {

  return HtmlService
    .createHtmlOutputFromFile(
      "Index"
    )
    .setTitle(
      "PREVIA CMS"
    );

}

function doPost(e) {

    try {

        const request =
            JSON.parse(e.postData.contents);


        /*
        =========================================
        Customer
        =========================================
        */

        if (
            request.action ===
            "customer.getOrCreate"
        ) {

            const customer =
                CustomerEndpoint.handle(
                    request.data
                );

            return ContentService
                .createTextOutput(
                    JSON.stringify({
                        success: true,
                        customer: customer
                    })
                )
                .setMimeType(
                    ContentService.MimeType.JSON
                );

        }


        /*
        =========================================
        Favorites: Get
        =========================================
        */

        if (
            request.action ===
            "favorites.get"
        ) {

            const favorites =
                FavoritesEndpoint.getFavorites(
                    request.data
                );

            return ContentService
                .createTextOutput(
                    JSON.stringify({
                        success: true,
                        favorites: favorites
                    })
                )
                .setMimeType(
                    ContentService.MimeType.JSON
                );

        }


        /*
        =========================================
        Favorites: Add
        =========================================
        */

        if (
            request.action ===
            "favorites.add"
        ) {

            const favorite =
                FavoritesEndpoint.addFavorite(
                    request.data
                );

            return ContentService
                .createTextOutput(
                    JSON.stringify({
                        success: true,
                        favorite: favorite
                    })
                )
                .setMimeType(
                    ContentService.MimeType.JSON
                );

        }


        /*
        =========================================
        Favorites: Remove
        =========================================
        */

        if (
            request.action ===
            "favorites.remove"
        ) {

            const removed =
                FavoritesEndpoint.removeFavorite(
                    request.data
                );

            return ContentService
                .createTextOutput(
                    JSON.stringify({
                        success: true,
                        removed: removed
                    })
                )
                .setMimeType(
                    ContentService.MimeType.JSON
                );

        }


        throw new Error(
            "Unknown API action."
        );


    } catch (error) {

        return ContentService
            .createTextOutput(
                JSON.stringify({
                    success: false,
                    error: error.message
                })
            )
            .setMimeType(
                ContentService.MimeType.JSON
            );

    }

}

function publishFromWeb() {

  Logger.log("publishFromWeb started");

  return publishBoutique(false);

}

function refreshImagesFromWeb() {

  Logger.log("refreshImagesFromWeb started");

  refreshMedia();

  return "Images synchronized successfully.";

}

/**
 * Returns product information by SKU for Dashboard.
 */
function getProductBySku(sku) {

  return findProductBySku(sku);

}

/**
 * Returns an archived product by SKU.
 */
function getArchivedProductBySku(sku) {

  return findArchivedProductBySku(sku);

}

