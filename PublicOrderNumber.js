/**
 * ============================================================
 * PREVIA CMS
 * Public Order Number Service
 *
 * Assigns human-facing sequential order numbers.
 * Technical order_id remains the canonical internal identity.
 * ============================================================
 */

const PUBLIC_ORDER_NUMBER_HEADER = "public_order_number";
const PUBLIC_ORDER_NUMBER_PREFIX = "VWJ-";
const PUBLIC_ORDER_NUMBER_DIGITS = 7;

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
    return Math.max(
      highest,
      parsePublicOrderNumber(order && order[PUBLIC_ORDER_NUMBER_HEADER])
    );
  }, 0);
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
  return formatPublicOrderNumber(getHighestPublicOrderNumber(orders) + 1);
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

function testPublicOrderNumberService() {
  const samples = [
    { public_order_number: "VWJ-0000001" },
    { public_order_number: "VWJ-0000042" },
    { public_order_number: "" },
    { public_order_number: "legacy-value" }
  ];

  const highest = getHighestPublicOrderNumber(samples);
  const next = getNextPublicOrderNumber(samples);
  const formatted = [1, 42, 1234567].map(formatPublicOrderNumber);

  const result = {
    highest: highest,
    next: next,
    formatted: formatted
  };

  Logger.log(JSON.stringify(result));
  return result;
}
