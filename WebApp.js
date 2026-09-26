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

function parseVerifiedCorePayload(request) {
  const hasHmacEnvelope = Boolean(
    request &&
    request.payload &&
    request.auth
  );

  if (!hasHmacEnvelope) {
    const error = new Error("Authenticated Core envelope is required.");
    error.code = "AUTHENTICATION_ERROR";
    error.retryable = false;
    throw error;
  }

  if (!verifyCoreAuthEnvelope(request, Date.now())) {
    const error = new Error("Core HMAC authentication failed.");
    error.code = "AUTHENTICATION_ERROR";
    error.retryable = false;
    throw error;
  }

  try {
    return JSON.parse(request.payload);
  } catch (error) {
    const parseError = new Error("Core payload is invalid JSON.");
    parseError.code = "AUTHENTICATION_ERROR";
    parseError.retryable = false;
    throw parseError;
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

    if (
      request.action === "customer.getOrCreate" ||
      request.action === "customer.find" ||
      request.action === "favorites.get" ||
      request.action === "favorites.add" ||
      request.action === "favorites.remove"
    ) {
      const parsedPayload = parseVerifiedCorePayload(request);

      if (request.action === "customer.getOrCreate") {
        const customer = CustomerEndpoint.handle(parsedPayload);
        return respondJson({ success: true, customer: customer });
      }

      if (request.action === "customer.find") {
        const customer = CustomerEndpoint.find(parsedPayload);
        return respondJson({ success: true, customer: customer });
      }

      if (request.action === "favorites.get") {
        const favorites = FavoritesEndpoint.getFavorites(parsedPayload);
        return respondJson({ success: true, favorites: favorites });
      }

      if (request.action === "favorites.add") {
        const favorite = FavoritesEndpoint.addFavorite(parsedPayload);
        return respondJson({ success: true, favorite: favorite });
      }

      if (request.action === "favorites.remove") {
        const removed = FavoritesEndpoint.removeFavorite(parsedPayload);
        return respondJson({ success: true, removed: removed });
      }
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
        const result = OrderEndpoint.create(parsedPayload);

        if (result && result.success && result.order && result.order.order_id) {
          const orderId = result.order.order_id;

          // Queue follow-up work only after the order transaction has succeeded.
          // Queue failures must never turn a successful order into a failed order.
          const documentQueueResult = markOrderDocumentPending(orderId);
          Logger.log(
            "PREVIA order document queue result for " +
            orderId + ": " +
            JSON.stringify(documentQueueResult)
          );

          const catalogQueueResult = markCatalogPublicationPending();
          Logger.log(
            "PREVIA catalog publication queue result for " +
            orderId + ": " +
            JSON.stringify(catalogQueueResult)
          );
        }

        return respondJson(result);
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
      code: error.code || "PERSISTENCE_ERROR",
      retryable: error.retryable || error.code === "PERSISTENCE_ERROR"
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
