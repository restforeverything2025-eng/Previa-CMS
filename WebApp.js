function doGet() {
  return HtmlService
    .createHtmlOutputFromFile("Index")
    .setTitle("PREVIA CMS");
}

function respondJson(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function parsePostBody(rawBody) {
  if (!rawBody) {
    return null;
  }

  try {
    return JSON.parse(rawBody);
  } catch (error) {
    return null;
  }
}

function doPost(e) {
  try {
    const rawBody = e && e.postData && e.postData.contents ? e.postData.contents : "";
    const request = parsePostBody(rawBody);

    if (!request || typeof request !== "object") {
      return respondJson({
        success: false,
        code: "VALIDATION_ERROR",
        retryable: false,
        errors: ["Request body is invalid JSON."]
      });
    }

    Logger.log("PREVIA API ACTION: " + request.action);

    if (request.action === "customer.getOrCreate") {
      const customer = CustomerEndpoint.handle(request.data);
      return respondJson({ success: true, customer: customer });
    }

    if (request.action === "customer.find") {
      const customer = CustomerEndpoint.find(request.data);
      return respondJson({ success: true, customer: customer });
    }

    if (request.action === "favorites.get") {
      const favorites = FavoritesEndpoint.getFavorites(request.data);
      return respondJson({ success: true, favorites: favorites });
    }

    if (request.action === "favorites.add") {
      const favorite = FavoritesEndpoint.addFavorite(request.data);
      return respondJson({ success: true, favorite: favorite });
    }

    if (request.action === "favorites.remove") {
      const removed = FavoritesEndpoint.removeFavorite(request.data);
      return respondJson({ success: true, removed: removed });
    }

    if (request.action === "order.create" || request.action === "order.find") {
      const hasHmacEnvelope = Boolean(request.payload && request.auth);

      if (!hasHmacEnvelope) {
        return respondJson({
          success: false,
          code: "AUTHENTICATION_ERROR",
          retryable: false
        });
      }

      const validAuth = verifyOrderAuthEnvelope(request, Date.now());

      if (!validAuth) {
        return respondJson({
          success: false,
          code: "AUTHENTICATION_ERROR",
          retryable: false
        });
      }

      let parsedPayload = null;

      try {
        parsedPayload = JSON.parse(request.payload);
      } catch (error) {
        return respondJson({
          success: false,
          code: "AUTHENTICATION_ERROR",
          retryable: false
        });
      }

      if (request.action === "order.create") {
        return respondJson(OrderEndpoint.create(parsedPayload));
      }

      if (request.action === "order.find") {
        return respondJson(OrderEndpoint.find(parsedPayload));
      }
    }

    if (request.action === "product.find") {
      const found = ProductEndpoint.find(request.data);
      return respondJson({ success: true, product: found });
    }

    throw new Error("Unknown API action.");
  } catch (error) {
    return respondJson({
      success: false,
      code: "PERSISTENCE_ERROR",
      retryable: true
    });
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

function getProductBySku(sku) {
  return findProductBySku(sku);
}

function getArchivedProductBySku(sku) {
  return findArchivedProductBySku(sku);
}

