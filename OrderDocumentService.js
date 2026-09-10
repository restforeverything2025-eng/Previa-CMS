/**
 * ============================================================
 * PREVIA CMS
 * Order Document Service
 *
 * Generates order PDFs after an order has been persisted.
 * PDF generation is deliberately outside the order transaction.
 * ============================================================
 */

const ORDER_DOCUMENT_STATUS_PENDING = "pending";
const ORDER_DOCUMENT_STATUS_READY = "ready";
const ORDER_DOCUMENT_STATUS_ERROR = "error";
const ORDER_DOCUMENT_BATCH_SIZE = 1;
const ORDER_DOCUMENT_FILENAME_SUFFIX = ".pdf";
const PUBLIC_ORDER_NUMBER_HEADER = "public_order_number";
const PUBLIC_ORDER_NUMBER_PREFIX = "VWJ-";
const PUBLIC_ORDER_NUMBER_DIGITS = 7;
const PUBLIC_ORDER_NUMBER_PROPERTY = "PREVIA_LAST_PUBLIC_ORDER_NUMBER";

function getOrdersFolder() {
  const config = getConfig();
  const folderId = config.orders_folder_id;

  if (!folderId) {
    throw new Error("Config key orders_folder_id is missing.");
  }

  return DriveApp.getFolderById(String(folderId).trim());
}

function formatPublicOrderNumber(number) {
  const value = Number(number);

  if (!Number.isInteger(value) || value < 1) {
    throw new Error("Public order number must be a positive integer.");
  }

  return PUBLIC_ORDER_NUMBER_PREFIX + String(value).padStart(PUBLIC_ORDER_NUMBER_DIGITS, "0");
}

function parsePublicOrderNumber(value) {
  const match = String(value || "").trim().match(/^VWJ-(\d{7})$/i);
  return match ? Number(match[1]) : 0;
}

function getHighestPublicOrderNumber(orders) {
  return (Array.isArray(orders) ? orders : []).reduce((highest, order) => {
    return Math.max(highest, parsePublicOrderNumber(order && order[PUBLIC_ORDER_NUMBER_HEADER]));
  }, 0);
}

function getStoredPublicOrderNumber() {
  return Number(
    PropertiesService
      .getScriptProperties()
      .getProperty(PUBLIC_ORDER_NUMBER_PROPERTY) || 0
  );
}

function setLastPublicOrderNumber(number) {
  const value = Number(number);

  if (!Number.isInteger(value) || value < 0) {
    throw new Error("Last public order number must be a non-negative integer.");
  }

  PropertiesService
    .getScriptProperties()
    .setProperty(PUBLIC_ORDER_NUMBER_PROPERTY, String(value));
}

function ensurePublicOrderNumberColumn(sheet) {
  const headers = getSheetHeaders(sheet);
  const existingIndex = headers.indexOf(PUBLIC_ORDER_NUMBER_HEADER);

  if (existingIndex >= 0) {
    return existingIndex;
  }

  const nextColumn = sheet.getLastColumn() + 1;
  sheet.getRange(1, nextColumn).setValue(PUBLIC_ORDER_NUMBER_HEADER);
  return nextColumn - 1;
}

function getNextPublicOrderNumber(orders) {
  const storedLast = getStoredPublicOrderNumber();
  const sheetLast = getHighestPublicOrderNumber(orders);
  const next = Math.max(storedLast, sheetLast) + 1;

  return formatPublicOrderNumber(next);
}

function writePublicOrderNumber(orderId, publicOrderNumber) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Orders");

  if (!sheet) {
    throw new Error("Orders sheet is missing.");
  }

  ensurePublicOrderNumberColumn(sheet);
  const state = getPublicOrderNumberColumnState(sheet);
  let targetRow = -1;

  for (let rowIndex = 1; rowIndex < state.values.length; rowIndex += 1) {
    if (String(state.values[rowIndex][state.orderIdColumn]).trim() === String(orderId).trim()) {
      targetRow = rowIndex + 1;
      break;
    }
  }

  if (targetRow === -1) {
    throw new Error("Order not found: " + orderId);
  }

  sheet.getRange(targetRow, state.publicOrderNumberColumn + 1).setValue(publicOrderNumber);
}

function assignPublicOrderNumber(order, existingOrders) {
  if (!order || typeof order !== "object") {
    throw new Error("Order is required for public order number assignment.");
  }

  const existing = parsePublicOrderNumber(order[PUBLIC_ORDER_NUMBER_HEADER]);
  if (existing > 0) {
    return String(order[PUBLIC_ORDER_NUMBER_HEADER]).trim();
  }

  return getNextPublicOrderNumber(existingOrders);
}

function getPublicOrderNumberColumnState(sheet) {
  const values = sheet.getDataRange().getValues();
  if (!values.length) {
    throw new Error("Orders sheet is empty.");
  }

  const headers = values[0];
  const orderIdColumn = headers.indexOf("order_id");
  const publicOrderNumberColumn = headers.indexOf(PUBLIC_ORDER_NUMBER_HEADER);

  if (orderIdColumn === -1 || publicOrderNumberColumn === -1) {
    throw new Error("Orders sheet must contain order_id and public_order_number headers.");
  }

  return {
    values: values,
    orderIdColumn: orderIdColumn,
    publicOrderNumberColumn: publicOrderNumberColumn
  };
}

function getOrderDocumentFileName(publicOrderNumber) {
  return String(publicOrderNumber).trim() + ORDER_DOCUMENT_FILENAME_SUFFIX;
}

function findOrderDocumentFile(publicOrderNumber) {
  const folder = getOrdersFolder();
  const files = folder.getFilesByName(getOrderDocumentFileName(publicOrderNumber));

  return files.hasNext() ? files.next() : null;
}

function getOrderDocumentColumns(sheet) {
  const values = sheet.getDataRange().getValues();

  if (!values.length) {
    throw new Error("Orders sheet is empty.");
  }

  const headers = values[0];
  const orderIdColumn = headers.indexOf("order_id");
  const documentUrlColumn = headers.indexOf("document_url");
  const documentStatusColumn = headers.indexOf("document_status");
  const documentErrorColumn = headers.indexOf("document_error");
  const publicOrderNumberColumn = headers.indexOf(PUBLIC_ORDER_NUMBER_HEADER);

  if (
    orderIdColumn === -1 ||
    documentUrlColumn === -1 ||
    documentStatusColumn === -1 ||
    documentErrorColumn === -1 ||
    publicOrderNumberColumn === -1
  ) {
    throw new Error(
      "Orders sheet must contain order_id, public_order_number, document_url, document_status and document_error headers."
    );
  }

  return {
    values: values,
    orderIdColumn: orderIdColumn,
    publicOrderNumberColumn: publicOrderNumberColumn,
    documentUrlColumn: documentUrlColumn,
    documentStatusColumn: documentStatusColumn,
    documentErrorColumn: documentErrorColumn
  };
}

function updateOrderDocumentStatus(orderId, status, documentUrl, documentError) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Orders");

  if (!sheet) {
    throw new Error("Orders sheet is missing.");
  }

  ensurePublicOrderNumberColumn(sheet);
  const state = getOrderDocumentColumns(sheet);
  let targetRow = -1;

  for (let rowIndex = 1; rowIndex < state.values.length; rowIndex += 1) {
    if (String(state.values[rowIndex][state.orderIdColumn]).trim() === String(orderId).trim()) {
      targetRow = rowIndex + 1;
      break;
    }
  }

  if (targetRow === -1) {
    throw new Error("Order not found: " + orderId);
  }

  sheet.getRange(targetRow, state.documentUrlColumn + 1).setValue(documentUrl || "");
  sheet.getRange(targetRow, state.documentStatusColumn + 1).setValue(status || "");
  sheet.getRange(targetRow, state.documentErrorColumn + 1).setValue(documentError || "");
}

function formatOrderDocumentDate(value) {
  if (!value) {
    return "—";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone() || "Europe/Kyiv",
    "dd.MM.yyyy HH:mm"
  );
}

function orderDocumentText(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback || "—";
  }

  return String(value).trim();
}

function orderDocumentNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatOrderDocumentMoney(value, currency) {
  const number = orderDocumentNumber(value);
  const code = String(currency || "EUR").toUpperCase();
  const symbol = code === "EUR" ? "€" : code === "USD" ? "$" : code;

  return number.toLocaleString("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + " " + symbol;
}

function formatOrderDocumentExchangeRate(value) {
  return orderDocumentNumber(value).toLocaleString("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function calculateOrderDocumentUahEquivalent(total, rate) {
  return Math.round(orderDocumentNumber(total) * orderDocumentNumber(rate));
}

function formatOrderDocumentUah(value) {
  return "≈ ₴ " + orderDocumentNumber(value).toLocaleString("uk-UA");
}

function translatePaymentMethod(value) {
  const key = String(value || "").trim().toLowerCase();
  const map = {
    fop_details: "Реквізити ФОП",
    nova_poshta_prepayment: "Передоплата через Нову пошту",
    card: "Оплата карткою",
    transfer: "Банківський переказ",
    cash: "Готівка"
  };

  return map[key] || orderDocumentText(value, "Не вказано");
}

function translateDelivery(value) {
  const key = String(value || "").trim().toLowerCase();
  const map = {
    nova_poshta: "Нова пошта",
    pickup: "Самовивіз",
    ukrposhta: "Укрпошта",
    courier: "Кур'єр"
  };

  return map[key] || orderDocumentText(value, "Не вказано");
}

function translateOrderStatus() {
  return "ЗАБРОНЬОВАНО";
}

function appendOrderDocumentParagraph(body, text, options) {
  const paragraph = body.appendParagraph(String(text));
  const config = options || {};

  paragraph.setAlignment(config.alignment || DocumentApp.HorizontalAlignment.LEFT);
  paragraph.setSpacingBefore(config.spacingBefore === undefined ? 0 : config.spacingBefore);
  paragraph.setSpacingAfter(config.spacingAfter === undefined ? 3 : config.spacingAfter);

  paragraph.editAsText().setFontFamily("Arial");
  paragraph.editAsText().setFontSize(config.fontSize || 9);
  paragraph.editAsText().setBold(Boolean(config.bold));

  return paragraph;
}

function styleOrderDocumentTable(table, headerRow) {
  table.setBorderColor("#d9d9d9");

  for (let rowIndex = 0; rowIndex < table.getNumRows(); rowIndex += 1) {
    const row = table.getRow(rowIndex);

    for (let cellIndex = 0; cellIndex < row.getNumCells(); cellIndex += 1) {
      const cell = row.getCell(cellIndex);
      const text = cell.editAsText();

      text.setFontFamily("Arial");
      text.setFontSize(headerRow && rowIndex === 0 ? 8 : 8.5);
      text.setBold(Boolean(headerRow && rowIndex === 0));

      if (headerRow && rowIndex === 0) {
        cell.setBackgroundColor("#f1f1f1");
      }
    }
  }
}

function appendOrderDocumentKeyValueTable(body, rows) {
  if (!rows.length) {
    return;
  }

  const table = body.appendTable(rows.map(row => [String(row[0]), String(row[1])]));
  table.setBorderColor("#e5e5e5");

  for (let rowIndex = 0; rowIndex < table.getNumRows(); rowIndex += 1) {
    const row = table.getRow(rowIndex);
    const label = row.getCell(0).editAsText();
    const value = row.getCell(1).editAsText();

    label.setFontFamily("Arial").setFontSize(8).setBold(true);
    value.setFontFamily("Arial").setFontSize(8.5);
  }
}

function appendOrderItemsTable(body, items, currency) {
  const rows = [["№", "SKU", "Товар", "Ціна", "Сума"]];

  items.forEach((item, index) => {
    const quantity = orderDocumentNumber(item.quantity || 1);
    const price = orderDocumentNumber(item.price);
    const lineTotal = item.line_total !== undefined && item.line_total !== ""
      ? orderDocumentNumber(item.line_total)
      : price * quantity;
    const title = item.title || item.product_name || item.name || item.product_title || "—";

    rows.push([
      String(index + 1),
      orderDocumentText(item.sku, "—"),
      orderDocumentText(title, "—"),
      formatOrderDocumentMoney(price, currency),
      formatOrderDocumentMoney(lineTotal, currency)
    ]);
  });

  const table = body.appendTable(rows);
  styleOrderDocumentTable(table, true);

  const widths = [28, 62, 250, 75, 80];
  for (let rowIndex = 0; rowIndex < table.getNumRows(); rowIndex += 1) {
    const row = table.getRow(rowIndex);
    for (let cellIndex = 0; cellIndex < Math.min(widths.length, row.getNumCells()); cellIndex += 1) {
      try {
        row.getCell(cellIndex).setWidth(widths[cellIndex]);
      } catch (error) {
        // Width is best-effort because Docs may redistribute table columns.
      }
    }
  }
}

function getOrderPaymentConfig() {
  const config = getConfig();

  return [
    ["Отримувач", config.payment_recipient],
    ["IBAN", config.payment_iban],
    ["ЄДРПОУ", config.payment_edrpou],
    ["Призначення", config.payment_purpose]
  ].filter(row => row[1] !== undefined && row[1] !== null && String(row[1]).trim() !== "");
}

function renderOrderDocument(order, items) {
  const publicOrderNumber = orderDocumentText(order.public_order_number, "ORDER");
  const currency = order.currency || (items[0] && items[0].currency) || "EUR";
  const total = order.total !== undefined && order.total !== ""
    ? order.total
    : order.subtotal;
  const document = DocumentApp.create("PREVIA " + getOrderDocumentFileName(publicOrderNumber).replace(".pdf", ""));
  const body = document.getBody();

  // A4 in points. Compact margins keep the approved one-page layout stable.
  body.setPageWidth(595);
  body.setPageHeight(842);
  body.setMarginTop(28);
  body.setMarginBottom(24);
  body.setMarginLeft(32);
  body.setMarginRight(32);

  appendOrderDocumentParagraph(body, "PREVIA", {
    fontSize: 18,
    bold: true,
    alignment: DocumentApp.HorizontalAlignment.CENTER,
    spacingAfter: 0
  });
  appendOrderDocumentParagraph(body, "Vintage Watches & Jewellery", {
    fontSize: 8,
    alignment: DocumentApp.HorizontalAlignment.CENTER,
    spacingAfter: 18
  });
  appendOrderDocumentParagraph(body, "ORDER : " + publicOrderNumber, {
    fontSize: 11,
    bold: true,
    spacingAfter: 10
  });

  appendOrderDocumentKeyValueTable(body, [
    ["Дата", formatOrderDocumentDate(order.created_at)],
    ["Статус", translateOrderStatus()]
  ]);

  appendOrderDocumentParagraph(body, "КЛІЄНТ", {
    fontSize: 9,
    bold: true,
    spacingBefore: 10,
    spacingAfter: 4
  });

  const telegram = order.telegram_username
    ? (String(order.telegram_username).charAt(0) === "@" ? String(order.telegram_username) : "@" + String(order.telegram_username))
    : "—";

  appendOrderDocumentKeyValueTable(body, [
    ["Ім'я", orderDocumentText(order.customer_name || order.telegram_name)],
    ["Телефон", orderDocumentText(order.phone)],
    ["Telegram", telegram],
    ["Email", orderDocumentText(order.email)]
  ]);

  appendOrderDocumentParagraph(body, "ТОВАРИ", {
    fontSize: 9,
    bold: true,
    spacingBefore: 10,
    spacingAfter: 4
  });

  appendOrderItemsTable(body, Array.isArray(items) ? items : [], currency);

  const totalTable = body.appendTable([["ВСЬОГО", formatOrderDocumentMoney(total, currency)]]);
  totalTable.setBorderColor("#bdbdbd");
  totalTable.getCell(0, 0).editAsText().setFontFamily("Arial").setFontSize(9).setBold(true);
  totalTable.getCell(0, 1).editAsText().setFontFamily("Arial").setFontSize(10).setBold(true);

  if (String(currency).toUpperCase() === "EUR") {
    const exchange = getExchangeRate();
    const uahEquivalent = calculateOrderDocumentUahEquivalent(total, exchange.eurToUah);
    const exchangeSource = orderDocumentText(exchange.source, "Monobank");

    appendOrderDocumentParagraph(body, "Курс " + exchangeSource + ": " + formatOrderDocumentExchangeRate(exchange.eurToUah), {
      fontSize: 8.5,
      bold: false,
      spacingBefore: 5,
      spacingAfter: 2
    });
    appendOrderDocumentParagraph(body, "Еквівалент: " + formatOrderDocumentUah(uahEquivalent), {
      fontSize: 8.5,
      bold: true,
      spacingBefore: 0,
      spacingAfter: 0
    });
  }

  appendOrderDocumentParagraph(body, "ОПЛАТА", {
    fontSize: 9,
    bold: true,
    spacingBefore: 10,
    spacingAfter: 4
  });

  appendOrderDocumentKeyValueTable(body, [
    ["Спосіб оплати", translatePaymentMethod(order.payment_method)],
    ["Доставка", translateDelivery(order.delivery_method || order.delivery || order.shipping_method)],
    ["Коментар", orderDocumentText(order.note || order.comment || order.customer_comment)]
  ]);

  const paymentConfig = getOrderPaymentConfig();
  if (paymentConfig.length) {
    appendOrderDocumentParagraph(body, "РЕКВІЗИТИ ДЛЯ ОПЛАТИ", {
      fontSize: 8.5,
      bold: true,
      spacingBefore: 8,
      spacingAfter: 3
    });
    appendOrderDocumentKeyValueTable(body, paymentConfig);
  }

  appendOrderDocumentParagraph(body, "Вінтажні речі з історією.", {
    fontSize: 8,
    spacingBefore: 12,
    spacingAfter: 0,
    alignment: DocumentApp.HorizontalAlignment.CENTER
  });

  document.saveAndClose();
  return document.getId();
}

function createOrderPdf(order, items) {
  const orderId = orderDocumentText(order.order_id, "");
  const publicOrderNumber = orderDocumentText(order.public_order_number, "");

  if (!orderId) {
    throw new Error("Order ID is required for PDF generation.");
  }

  if (!publicOrderNumber) {
    throw new Error("Public order number is required for PDF generation.");
  }

  const folder = getOrdersFolder();
  const existingFile = findOrderDocumentFile(publicOrderNumber);

  if (existingFile) {
    return {
      fileId: existingFile.getId(),
      fileUrl: existingFile.getUrl(),
      fileName: existingFile.getName(),
      reused: true
    };
  }

  let temporaryDocumentId = null;

  try {
    temporaryDocumentId = renderOrderDocument(order, items);
    const temporaryDocument = DocumentApp.openById(temporaryDocumentId);
    const pdfBlob = temporaryDocument.getAs(MimeType.PDF).setName(getOrderDocumentFileName(publicOrderNumber));
    const file = folder.createFile(pdfBlob);

    return {
      fileId: file.getId(),
      fileUrl: file.getUrl(),
      fileName: file.getName(),
      reused: false
    };
  } finally {
    if (temporaryDocumentId) {
      try {
        DriveApp.getFileById(temporaryDocumentId).setTrashed(true);
      } catch (error) {
        Logger.log("PREVIA PDF temporary document cleanup failed: " + error.message);
      }
    }
  }
}

function processOrderDocument(orderId) {
  const found = findOrderById(orderId);

  if (!found || !found.order) {
    throw new Error("Order not found: " + orderId);
  }

  const publicOrderNumber = ensurePublicOrderNumber(found.order);
  found.order.public_order_number = publicOrderNumber;

  const result = createOrderPdf(found.order, found.items || []);

  updateOrderDocumentStatus(
    orderId,
    ORDER_DOCUMENT_STATUS_READY,
    result.fileUrl,
    ""
  );

  return result;
}

function ensurePublicOrderNumber(order) {
  const existing = parsePublicOrderNumber(order && order.public_order_number);

  if (existing > 0) {
    return String(order.public_order_number).trim();
  }

  const lock = LockService.getScriptLock();
  const ownsLock = !lock.hasLock();

  try {
    if (ownsLock) {
      lock.waitLock(10000);
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Orders");
    if (!sheet) {
      throw new Error("Orders sheet is missing.");
    }

    ensurePublicOrderNumberColumn(sheet);
    const orders = getOrders();
    const publicOrderNumber = getNextPublicOrderNumber(orders);
    writePublicOrderNumber(order.order_id, publicOrderNumber);
    setLastPublicOrderNumber(parsePublicOrderNumber(publicOrderNumber));

    return publicOrderNumber;
  } finally {
    if (ownsLock) {
      lock.releaseLock();
    }
  }
}

function processPendingOrderDocuments() {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);

    const orders = getOrders();
    const pending = orders
      .filter(order => String(order.document_status || "").trim().toLowerCase() === ORDER_DOCUMENT_STATUS_PENDING)
      .slice(0, ORDER_DOCUMENT_BATCH_SIZE);

    const results = [];

    pending.forEach(order => {
      try {
        const result = processOrderDocument(order.order_id);
        results.push({
          order_id: order.order_id,
          public_order_number: order.public_order_number || "",
          success: true,
          document_url: result.fileUrl
        });
      } catch (error) {
        const message = error && error.message ? error.message : String(error);

        try {
          updateOrderDocumentStatus(
            order.order_id,
            ORDER_DOCUMENT_STATUS_ERROR,
            "",
            message.substring(0, 1000)
          );
        } catch (statusError) {
          Logger.log("PREVIA PDF status update failed: " + statusError.message);
        }

        Logger.log("PREVIA PDF generation failed for " + order.order_id + ": " + message);
        results.push({
          order_id: order.order_id,
          success: false,
          error: message
        });
      }
    });

    return results;
  } finally {
    lock.releaseLock();
  }
}

function setupOrderDocumentWorker() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === "processPendingOrderDocuments") {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger("processPendingOrderDocuments")
    .timeBased()
    .everyMinutes(5)
    .create();

  Logger.log("PREVIA order document worker scheduled every 5 minutes.");
}

function testPublicOrderNumberFormatting() {
  const samples = [1, 12, 1234567];
  const result = samples.map(formatPublicOrderNumber);
  Logger.log(JSON.stringify(result));
  return result;
}

function testOrderDocumentExchangeRateCalculation() {
  const total = 1390;
  const rate = 52.32;
  const equivalent = calculateOrderDocumentUahEquivalent(total, rate);
  Logger.log("Total: " + total + " EUR");
  Logger.log("Rate: " + formatOrderDocumentExchangeRate(rate));
  Logger.log("Equivalent: " + formatOrderDocumentUah(equivalent));
  return equivalent;
}

function testOrderDocumentWorker() {
  return processPendingOrderDocuments();
}

function testGenerateOrderPdf(orderId) {
  return processOrderDocument(orderId);
}

function retryOrderDocument(orderId) {
  const result = markOrderDocumentPending(orderId);

  if (!result.success) {
    return result;
  }

  return processOrderDocument(orderId);
}
