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
    return { stringValue: "" };
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return { numberValue: value };
  }

  if (typeof value === "boolean") {
    return { boolValue: value };
  }

  if (value instanceof Date) {
    return { stringValue: value.toISOString() };
  }

  return { stringValue: String(value) };
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

    if (!ordersSheet || !itemsSheet) {
      return {
        success: false,
        code: "SCHEMA_ERROR",
        retryable: false
      };
    }

    const orderHeaders = getSheetHeaders(ordersSheet);
    const itemHeaders = getSheetHeaders(itemsSheet);
    const prepared = buildPersistenceBatch(order, items, orderHeaders, itemHeaders);

    const requests = [
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

    return {
      success: true,
      code: "ORDER_CREATED",
      order: {
        order_id: order.order_id
      },
      items_count: items.length
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
