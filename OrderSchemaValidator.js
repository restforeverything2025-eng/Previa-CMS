const ORDER_REQUIRED_HEADERS = [
  "order_id",
  "created_at",
  "source",
  "customerId",
  "provider",
  "providerId",
  "telegram_username",
  "telegram_name",
  "customer_name",
  "phone",
  "email",
  "payment_type",
  "payment_method",
  "payment_status",
  "order_status",
  "subtotal",
  "total",
  "expires_at",
  "paid_at",
  "document_url",
  "note"
];

const ORDER_ITEM_REQUIRED_HEADERS = [
  "order_id",
  "sku",
  "title",
  "price",
  "quantity",
  "subtotal"
];

const ORDER_ID_PATTERN = /^ORD-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

function hasDuplicateHeaders(headers) {
  if (!Array.isArray(headers)) {
    return false;
  }

  const seen = new Set();

  for (const header of headers) {
    if (seen.has(header)) {
      return true;
    }
    seen.add(header);
  }

  return false;
}

function getHeaderRow(sheet) {
  if (!sheet) {
    return [];
  }

  const values = sheet.getDataRange().getValues();

  if (!values || !values.length) {
    return [];
  }

  return values[0].map(value => value === undefined ? "" : value);
}

function validateOrderSchema(spreadsheet) {
  const errors = [];

  if (!spreadsheet || typeof spreadsheet.getSheetByName !== "function") {
    return {
      success: false,
      errors: ["Spreadsheet is unavailable."]
    };
  }

  const ordersSheet = spreadsheet.getSheetByName("Orders");
  const itemsSheet = spreadsheet.getSheetByName("OrderItems");

  if (!ordersSheet) {
    errors.push("Orders sheet is missing.");
  }

  if (!itemsSheet) {
    errors.push("OrderItems sheet is missing.");
  }

  if (!ordersSheet || !itemsSheet) {
    return {
      success: false,
      errors: errors
    };
  }

  const orderHeaders = getHeaderRow(ordersSheet);
  const itemHeaders = getHeaderRow(itemsSheet);

  if (!orderHeaders.length) {
    errors.push("Orders header row is missing.");
  }

  if (!itemHeaders.length) {
    errors.push("OrderItems header row is missing.");
  }

  if (hasDuplicateHeaders(orderHeaders)) {
    errors.push("Orders contains duplicate headers.");
  }

  if (hasDuplicateHeaders(itemHeaders)) {
    errors.push("OrderItems contains duplicate headers.");
  }

  const missingOrderHeaders = ORDER_REQUIRED_HEADERS.filter(
    header => !orderHeaders.includes(header)
  );

  if (missingOrderHeaders.length) {
    errors.push("Orders is missing required headers: " + missingOrderHeaders.join(", "));
  }

  const missingItemHeaders = ORDER_ITEM_REQUIRED_HEADERS.filter(
    header => !itemHeaders.includes(header)
  );

  if (missingItemHeaders.length) {
    errors.push("OrderItems is missing required headers: " + missingItemHeaders.join(", "));
  }

  if (itemHeaders[0] !== "order_id") {
    errors.push("OrderItems first column must be order_id.");
  }

  if (orderHeaders.some((header, index) => index < ORDER_REQUIRED_HEADERS.length && header !== ORDER_REQUIRED_HEADERS[index])) {
    const mismatched = orderHeaders.filter((header, index) => header !== ORDER_REQUIRED_HEADERS[index]);
    if (mismatched.length) {
      errors.push("Orders headers do not match required names and case.");
    }
  }

  if (itemHeaders.some((header, index) => index < ORDER_ITEM_REQUIRED_HEADERS.length && header !== ORDER_ITEM_REQUIRED_HEADERS[index])) {
    const mismatched = itemHeaders.filter((header, index) => header !== ORDER_ITEM_REQUIRED_HEADERS[index]);
    if (mismatched.length) {
      errors.push("OrderItems headers do not match required names and case.");
    }
  }

  return {
    success: errors.length === 0,
    errors: errors
  };
}

function scalarValueIsInvalid(value) {
  return value === undefined || value === null || typeof value === "function" || Array.isArray(value);
}

function validateOrderPayload(order, items) {
  const errors = [];

  if (!order || typeof order !== "object" || Array.isArray(order)) {
    return {
      success: false,
      errors: ["order must be an object."]
    };
  }

  if (!Array.isArray(items) || items.length === 0) {
    errors.push("items must be a non-empty array.");
  }

  ORDER_REQUIRED_HEADERS.forEach(header => {
    if (!Object.prototype.hasOwnProperty.call(order, header) || scalarValueIsInvalid(order[header])) {
      errors.push("Missing or invalid required order field: " + header);
    }
  });

  if (typeof order.order_id !== "string") {
    errors.push("order_id must be a string.");
  } else if (!ORDER_ID_PATTERN.test(order.order_id)) {
    errors.push("order_id must match ORD-<UUIDv4>.");
  }

  if (!Array.isArray(items)) {
    return {
      success: false,
      errors: errors
    };
  }

  items.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push("items[" + index + "] must be an object.");
      return;
    }

    if (typeof item.order_id !== "string" || item.order_id !== order.order_id) {
      errors.push("items[" + index + "].order_id must match order.order_id.");
    }

    if (typeof item.sku !== "string" || item.sku.trim() === "") {
      errors.push("items[" + index + "].sku must be a non-empty string.");
    }

    if (typeof item.title !== "string" || item.title.trim() === "") {
      errors.push("items[" + index + "].title must be a non-empty string.");
    }

    if (scalarValueIsInvalid(item.price) || !Number.isFinite(Number(item.price))) {
      errors.push("items[" + index + "].price must be a finite number.");
    }

    if (scalarValueIsInvalid(item.subtotal) || !Number.isFinite(Number(item.subtotal))) {
      errors.push("items[" + index + "].subtotal must be a finite number.");
    }

    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      errors.push("items[" + index + "].quantity must be a positive integer.");
    }
  });

  return {
    success: errors.length === 0,
    errors: errors
  };
}

function buildOrderRow(order, headers) {
  return headers.map(header => {
    if (!Object.prototype.hasOwnProperty.call(order, header)) {
      return "";
    }

    return order[header] === undefined || order[header] === null ? "" : order[header];
  });
}

function buildOrderItemRows(items, headers) {
  return items.map(item => headers.map(header => {
    if (!Object.prototype.hasOwnProperty.call(item, header)) {
      return "";
    }

    return item[header] === undefined || item[header] === null ? "" : item[header];
  }));
}

function buildPersistenceBatch(order, items, orderHeaders, itemHeaders) {
  return {
    orderRow: buildOrderRow(order, orderHeaders),
    itemRows: buildOrderItemRows(items, itemHeaders)
  };
}

function hasExistingOrderId(orders, orderId) {
  if (!Array.isArray(orders)) {
    return false;
  }

  return orders.some(order => order && order.order_id === orderId);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ORDER_REQUIRED_HEADERS,
    ORDER_ITEM_REQUIRED_HEADERS,
    ORDER_ID_PATTERN,
    hasDuplicateHeaders,
    validateOrderSchema,
    validateOrderPayload,
    buildOrderRow,
    buildOrderItemRows,
    buildPersistenceBatch,
    hasExistingOrderId
  };
}
