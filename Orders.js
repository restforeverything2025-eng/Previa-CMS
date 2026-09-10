/**
 * ============================================================
 * PREVIA CMS
 * Orders Service
 * ============================================================
 *
 * Reads and writes Orders and OrderItems in Google Sheets.
 * This module is storage-related only.
 * Business rules belong to PREVIA Core.
 * ============================================================
 */

const ORDERS_SHEET = "Orders";
const ORDER_ITEMS_SHEET = "OrderItems";
const PRODUCTS_SHEET = "Products";
const AVAILABLE_PRODUCT_STATUS = "available";
const RESERVED_PRODUCT_STATUS = "reserved";
const ORDER_DOCUMENT_STATUS_PENDING_VALUE = "pending";

function getSheetHeaders(sheet) {
  if (!sheet) {
    return [];
  }

  const values = sheet.getDataRange().getValues();

  if (!values.length) {
    return [];
  }

  return values[0];
}

function getOrders() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORDERS_SHEET);

  if (!sheet) {
    return [];
  }

  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    return [];
  }

  const headers = data[0];
  const orders = [];

  for (let i = 1; i < data.length; i += 1) {
    if (data[i].every(cell => cell === "")) {
      continue;
    }

    const order = {};

    for (let j = 0; j < headers.length; j += 1) {
      order[headers[j]] = data[i][j];
    }

    orders.push(order);
  }

  return orders;
}

function getOrderItems(orderId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORDER_ITEMS_SHEET);

  if (!sheet) {
    return [];
  }

  const data = sheet.getDataRange().getValues();

  if (data.length <= 1) {
    return [];
  }

  const headers = data[0];
  const items = [];

  for (let i = 1; i < data.length; i += 1) {
    if (data[i].every(cell => cell === "")) {
      continue;
    }

    if (data[i][0] !== orderId) {
      continue;
    }

    const item = {};

    for (let j = 0; j < headers.length; j += 1) {
      item[headers[j]] = data[i][j];
    }

    items.push(item);
  }

  return items;
}

function findOrderById(orderId) {
  const orders = getOrders();
  const order = orders.find(item => item.order_id === orderId);

  if (!order) {
    return null;
  }

  return {
    order: order,
    items: getOrderItems(orderId)
  };
}

function toSheetCellValue(value) {
  if (value === undefined || value === null) {
    return {
      userEnteredValue: {
        stringValue: ""
      }
    };
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return {
      userEnteredValue: {
        numberValue: value
      }
    };
  }

  if (typeof value === "boolean") {
    return {
      userEnteredValue: {
        boolValue: value
      }
    };
  }

  if (value instanceof Date) {
    return {
      userEnteredValue: {
        stringValue: value.toISOString()
      }
    };
  }

  return {
    userEnteredValue: {
      stringValue: String(value)
    }
  };
}

function getProductReservationPlan(spreadsheet, items) {
  if (!spreadsheet || typeof spreadsheet.getSheetByName !== "function") {
    return {
      success: false,
      code: "SCHEMA_ERROR",
      errors: ["Spreadsheet is unavailable."]
    };
  }

  const productsSheet = spreadsheet.getSheetByName(PRODUCTS_SHEET);

  if (!productsSheet) {
    return {
      success: false,
      code: "SCHEMA_ERROR",
      errors: ["Products sheet is missing."]
    };
  }

  const data = productsSheet.getDataRange().getValues();

  if (!data || data.length === 0) {
    return {
      success: false,
      code: "SCHEMA_ERROR",
      errors: ["Products sheet is empty."]
    };
  }

  const headers = data[0];
  const skuIndex = headers.indexOf("sku");
  const statusIndex = headers.indexOf("status");

  if (skuIndex === -1 || statusIndex === -1) {
    return {
      success: false,
      code: "SCHEMA_ERROR",
      errors: ["Products sheet must contain sku and status headers."]
    };
  }

  const requestedSkus = [];
  const seenSkus = new Set();

  (Array.isArray(items) ? items : []).forEach(item => {
    const sku = item && typeof item.sku === "string" ? item.sku.trim() : "";

    if (!sku || seenSkus.has(sku)) {
      return;
    }

    seenSkus.add(sku);
    requestedSkus.push(sku);
  });

  const errors = [];
  const reservations = [];

  requestedSkus.forEach(sku => {
    let found = null;

    for (let rowIndex = 1; rowIndex < data.length; rowIndex += 1) {
      if (String(data[rowIndex][skuIndex]).trim() === sku) {
        found = {
          rowIndex: rowIndex,
          status: String(data[rowIndex][statusIndex]).trim().toLowerCase()
        };
        break;
      }
    }

    if (!found) {
      errors.push("Product not found: " + sku);
      return;
    }

    if (found.status !== AVAILABLE_PRODUCT_STATUS) {
      errors.push("Product is not available: " + sku);
      return;
    }

    reservations.push({
      sku: sku,
      rowNumber: found.rowIndex + 1,
      statusColumn: statusIndex + 1,
      newStatus: RESERVED_PRODUCT_STATUS
    });
  });

  if (errors.length) {
    return {
      success: false,
      code: "PRODUCT_NOT_AVAILABLE",
      errors: errors,
      reservations: []
    };
  }

  return {
    success: true,
    code: "PRODUCTS_READY_FOR_RESERVATION",
    reservations: reservations
  };
}

function buildProductReservationRequests(productsSheet, reservations) {
  return reservations.map(reservation => ({
    updateCells: {
      start: {
        sheetId: productsSheet.getSheetId(),
        rowIndex: reservation.rowNumber - 1,
        columnIndex: reservation.statusColumn - 1
      },
      rows: [{
        values: [toSheetCellValue(reservation.newStatus)]
      }],
      fields: "userEnteredValue"
    }
  }));
}

function saveOrder(order, items = []) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  if (!spreadsheet) {
    return {
      success: false,
      code: "PERSISTENCE_ERROR",
      retryable: true
    };
  }

  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);

    const existingOrders = getOrders();

    if (hasExistingOrderId(existingOrders, order && order.order_id)) {
      return {
        success: false,
        code: "ORDER_DUPLICATE",
        retryable: false,
        order_id: order.order_id
      };
    }

    const schemaResult = validateOrderSchema(spreadsheet);

    if (!schemaResult.success) {
      return {
        success: false,
        code: "SCHEMA_ERROR",
        retryable: false
      };
    }

    const payloadResult = validateOrderPayload(order, items);

    if (!payloadResult.success) {
      return {
        success: false,
        code: "VALIDATION_ERROR",
        retryable: false,
        errors: payloadResult.errors
      };
    }

    const ordersSheet = spreadsheet.getSheetByName(ORDERS_SHEET);
    const itemsSheet = spreadsheet.getSheetByName(ORDER_ITEMS_SHEET);
    const productsSheet = spreadsheet.getSheetByName(PRODUCTS_SHEET);

    if (!ordersSheet || !itemsSheet || !productsSheet) {
      return {
        success: false,
        code: "SCHEMA_ERROR",
        retryable: false
      };
    }

    const reservationPlan = getProductReservationPlan(spreadsheet, items);

    if (!reservationPlan.success) {
      return {
        success: false,
        code: reservationPlan.code,
        retryable: false,
        errors: reservationPlan.errors
      };
    }

    ensurePublicOrderNumberColumn(ordersSheet);

    const orderHeaders = getSheetHeaders(ordersSheet);
    const itemHeaders = getSheetHeaders(itemsSheet);
    const ordersAfterSchema = getOrders();

    // Historical orders predate the human-facing number. Backfill them first
    // so the next new order continues the same sequence.
    backfillMissingPublicOrderNumbers(ordersAfterSchema);

    const refreshedOrders = getOrders();
    const publicOrderNumber = assignPublicOrderNumber(order, refreshedOrders);

    // Queue the PDF atomically with the order row. This avoids a race/stale
    // read between the Sheets API batchUpdate and the follow-up queue write.
    // PDF generation itself remains asynchronous and cannot break the order.
    const persistedOrder = Object.assign({}, order, {
      public_order_number: publicOrderNumber,
      document_url: "",
      document_status: ORDER_DOCUMENT_STATUS_PENDING_VALUE,
      document_error: ""
    });

    const prepared = buildPersistenceBatch(
      persistedOrder,
      items,
      orderHeaders,
      itemHeaders
    );

    const requests = [
      ...buildProductReservationRequests(productsSheet, reservationPlan.reservations),
      {
        appendCells: {
          sheetId: ordersSheet.getSheetId(),
          rows: [{ values: prepared.orderRow.map(toSheetCellValue) }],
          fields: "*"
        }
      },
      {
        appendCells: {
          sheetId: itemsSheet.getSheetId(),
          rows: prepared.itemRows.map(itemRow => ({ values: itemRow.map(toSheetCellValue) })),
          fields: "*"
        }
      }
    ];

    const response = Sheets.Spreadsheets.batchUpdate(
      { requests: requests },
      spreadsheet.getId()
    );

    if (!response) {
      return {
        success: false,
        code: "PERSISTENCE_ERROR",
        retryable: true
      };
    }

    setLastPublicOrderNumber(parsePublicOrderNumber(publicOrderNumber));

    return {
      success: true,
      code: "ORDER_CREATED",
      order: {
        order_id: order.order_id,
        public_order_number: publicOrderNumber
      },
      items_count: items.length,
      reserved_skus: reservationPlan.reservations.map(item => item.sku),
      document_status: ORDER_DOCUMENT_STATUS_PENDING_VALUE
    };
  } catch (error) {
    return {
      success: false,
      code: "PERSISTENCE_ERROR",
      retryable: true
    };
  } finally {
    lock.releaseLock();
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getProductReservationPlan,
    buildProductReservationRequests,
    saveOrder,
    AVAILABLE_PRODUCT_STATUS,
    RESERVED_PRODUCT_STATUS
  };
}
