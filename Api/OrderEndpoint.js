/**
 * ============================================================
 * PREVIA
 * OrderEndpoint.js
 *
 * Order endpoint for request validation and repository dispatch.
 * ============================================================
 */

const OrderEndpoint = (() => {

  function create(data) {
    if (!data || typeof data !== "object") {
      return {
        success: false,
        code: "VALIDATION_ERROR",
        retryable: false,
        errors: ["Order request body is required."]
      };
    }

    if (!data.order || !Array.isArray(data.items)) {
      return {
        success: false,
        code: "VALIDATION_ERROR",
        retryable: false,
        errors: ["Order payload must include order and items."]
      };
    }

    const repository = new OrderRepositoryAdapter();
    return repository.save(data.order, data.items);
  }

  function find(data) {
    if (!data || typeof data !== "object") {
      return {
        success: false,
        code: "VALIDATION_ERROR",
        retryable: false,
        errors: ["Order lookup requires a payload object."]
      };
    }

    if (!data.order_id) {
      return {
        success: false,
        code: "VALIDATION_ERROR",
        retryable: false,
        errors: ["Order ID is required."]
      };
    }

    const repository = new OrderRepositoryAdapter();
    return repository.findById(data.order_id);
  }

  return {
    create,
    find
  };
})();