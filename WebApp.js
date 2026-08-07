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

