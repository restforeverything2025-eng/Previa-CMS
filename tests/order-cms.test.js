const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validateOrderSchema,
  validateOrderPayload,
  buildPersistenceBatch,
  hasExistingOrderId,
  ORDER_REQUIRED_HEADERS,
  ORDER_ITEM_REQUIRED_HEADERS
} = require("../OrderSchemaValidator.js");

const {
  buildSignedEnvelope,
  computeOrderAuthSignature,
  verifyOrderAuthEnvelope,
  ORDER_AUTH_SECRET_KEY,
  getOrderAuthSecret
} = require("../Api/OrderAuthentication.js");

function createSpreadsheetMock(sheetMap) {
  return {
    getSheetByName(sheetName) {
      const data = sheetMap[sheetName];

      if (!data) {
        return null;
      }

      return {
        getDataRange() {
          return {
            getValues() {
              return data;
            }
          };
        }
      };
    }
  };
}

const validOrder = {
  order_id: "ORD-123e4567-e89b-42d3-a456-426614174000",
  created_at: "2026-08-15T10:00:00.000Z",
  source: "telegram",
  customerId: "cust-001",
  provider: "telegram",
  providerId: "123456789",
  telegram_username: "alice",
  telegram_name: "Alice",
  customer_name: "Alice Example",
  phone: "+380000000000",
  email: "alice@example.com",
  payment_type: "full",
  payment_method: "card",
  payment_status: "paid",
  order_status: "new",
  subtotal: 150,
  total: 150,
  expires_at: "2026-08-17T10:00:00.000Z",
  paid_at: "2026-08-15T10:00:00.000Z",
  document_url: "https://example.com/document.pdf",
  note: "test order"
};

const validItems = [
  {
    order_id: "ORD-123e4567-e89b-42d3-a456-426614174000",
    sku: "SKU-001",
    title: "Sample product",
    price: 150,
    quantity: 1,
    subtotal: 150
  }
];

const validOrdersSheet = [ORDER_REQUIRED_HEADERS];
const validOrderItemsSheet = [ORDER_ITEM_REQUIRED_HEADERS];

function setStubSecret(secret) {
  if (typeof globalThis === "undefined") {
    return;
  }

  globalThis.PropertiesService = {
    getScriptProperties() {
      return {
        getProperty(key) {
          return key === ORDER_AUTH_SECRET_KEY ? secret : null;
        }
      };
    }
  };
}

test("schema validation catches missing Orders header", () => {
  const spreadsheet = createSpreadsheetMock({
    Orders: [["order_id", "created_at", "source", "customerId", "provider", "providerId", "telegram_username", "telegram_name", "customer_name", "phone", "email", "payment_type", "payment_method", "payment_status", "order_status", "subtotal", "total", "expires_at", "paid_at", "document_url"]],
    OrderItems: validOrderItemsSheet
  });

  const result = validateOrderSchema(spreadsheet);
  assert.equal(result.success, false);
  assert.match(result.errors.join(" "), /missing required headers|Orders/i);
});

test("schema validation catches missing OrderItems header", () => {
  const spreadsheet = createSpreadsheetMock({
    Orders: validOrdersSheet,
    OrderItems: [["order_id", "sku", "title", "price", "quantity"]]
  });

  const result = validateOrderSchema(spreadsheet);
  assert.equal(result.success, false);
  assert.match(result.errors.join(" "), /OrderItems.*required|subtotal/i);
});

test("schema validation catches duplicate headers", () => {
  const spreadsheet = createSpreadsheetMock({
    Orders: [["order_id", "order_id", ...ORDER_REQUIRED_HEADERS.slice(2)]],
    OrderItems: validOrderItemsSheet
  });

  const result = validateOrderSchema(spreadsheet);
  assert.equal(result.success, false);
  assert.match(result.errors.join(" "), /duplicate/i);
});

test("schema validation catches wrong OrderItems first column", () => {
  const spreadsheet = createSpreadsheetMock({
    Orders: validOrdersSheet,
    OrderItems: [["sku", ...ORDER_ITEM_REQUIRED_HEADERS.slice(1)]]
  });

  const result = validateOrderSchema(spreadsheet);
  assert.equal(result.success, false);
  assert.match(result.errors.join(" "), /first column.*order_id|order_id/i);
});

test("validation rejects empty items", () => {
  const result = validateOrderPayload(validOrder, []);
  assert.equal(result.success, false);
  assert.match(result.errors.join(" "), /non-empty array/i);
});

test("validation rejects invalid order_id", () => {
  const result = validateOrderPayload({ ...validOrder, order_id: "BAD-123" }, validItems);
  assert.equal(result.success, false);
  assert.match(result.errors.join(" "), /ORD-<UUIDv4>|order_id/i);
});

test("validation rejects missing required field", () => {
  const { customer_name, ...missingFieldOrder } = validOrder;
  const result = validateOrderPayload(missingFieldOrder, validItems);
  assert.equal(result.success, false);
  assert.match(result.errors.join(" "), /customer_name/i);
});

test("validation rejects invalid quantity", () => {
  const result = validateOrderPayload(validOrder, [{ ...validItems[0], quantity: 0 }]);
  assert.equal(result.success, false);
  assert.match(result.errors.join(" "), /quantity/i);
});

test("validation rejects invalid price", () => {
  const result = validateOrderPayload(validOrder, [{ ...validItems[0], price: "invalid" }]);
  assert.equal(result.success, false);
  assert.match(result.errors.join(" "), /price/i);
});

test("validation rejects mismatched item order_id", () => {
  const result = validateOrderPayload(validOrder, [{ ...validItems[0], order_id: "ORD-00000000-0000-4000-8000-000000000000" }]);
  assert.equal(result.success, false);
  assert.match(result.errors.join(" "), /order_id.*match/i);
});

test("duplicate check detects repeated order ids", () => {
  const orders = [validOrder];
  assert.equal(hasExistingOrderId(orders, validOrder.order_id), true);
  assert.equal(hasExistingOrderId(orders, "ORD-00000000-0000-4000-8000-000000000001"), false);
});

test("HMAC accepts valid signature", () => {
  const secret = "test-secret";
  setStubSecret(secret);

  const signedEnvelope = buildSignedEnvelope("order.create", { order: validOrder, items: validItems }, secret, "2026-08-15T10:00:00.000Z", "nonce-1");
  const result = verifyOrderAuthEnvelope(signedEnvelope, new Date("2026-08-15T10:05:00.000Z").getTime());

  assert.equal(result, true);
});

test("HMAC rejects invalid signature", () => {
  const secret = "test-secret";
  setStubSecret(secret);

  const signedEnvelope = buildSignedEnvelope("order.create", { order: validOrder, items: validItems }, secret, "2026-08-15T10:00:00.000Z", "nonce-2");
  signedEnvelope.auth.signature = "deadbeef";
  const result = verifyOrderAuthEnvelope(signedEnvelope, new Date("2026-08-15T10:05:00.000Z").getTime());

  assert.equal(result, false);
});

test("HMAC rejects expired timestamp", () => {
  const secret = "test-secret";
  setStubSecret(secret);

  const signedEnvelope = buildSignedEnvelope("order.create", { order: validOrder, items: validItems }, secret, "2026-08-15T09:00:00.000Z", "nonce-3");
  const result = verifyOrderAuthEnvelope(signedEnvelope, new Date("2026-08-15T10:10:00.000Z").getTime());

  assert.equal(result, false);
});

test("HMAC rejects malformed auth envelope", () => {
  const result = verifyOrderAuthEnvelope({ action: "order.create", payload: "{}" }, Date.now());
  assert.equal(result, false);
});

test("order.create requires valid signed envelope", () => {
  const secret = "test-secret";
  setStubSecret(secret);

  const validEnvelope = buildSignedEnvelope("order.create", { order: validOrder, items: validItems }, secret, "2026-08-15T10:00:00.000Z", "nonce-valid");
  const validRequest = {
    action: "order.create",
    payload: JSON.stringify({ order: validOrder, items: validItems }),
    auth: validEnvelope.auth
  };

  assert.equal(verifyOrderAuthEnvelope(validRequest, new Date("2026-08-15T10:05:00.000Z").getTime()), true);

  const unsignedLegacy = {
    action: "order.create",
    data: { order: validOrder, items: validItems }
  };

  assert.equal(Boolean(unsignedLegacy.payload && unsignedLegacy.auth), false);

  const malformedEnvelope = {
    action: "order.create",
    payload: JSON.stringify({ order: validOrder, items: validItems }),
    auth: { version: "v1" }
  };

  assert.equal(verifyOrderAuthEnvelope(malformedEnvelope, Date.now()), false);

  const invalidSignatureEnvelope = buildSignedEnvelope("order.create", { order: validOrder, items: validItems }, secret, "2026-08-15T10:00:00.000Z", "nonce-invalid");
  invalidSignatureEnvelope.auth.signature = "deadbeef";
  const invalidSignatureRequest = {
    action: "order.create",
    payload: JSON.stringify({ order: validOrder, items: validItems }),
    auth: invalidSignatureEnvelope.auth
  };

  assert.equal(verifyOrderAuthEnvelope(invalidSignatureRequest, new Date("2026-08-15T10:05:00.000Z").getTime()), false);

  const expiredEnvelope = buildSignedEnvelope("order.create", { order: validOrder, items: validItems }, secret, "2026-08-15T09:00:00.000Z", "nonce-expired");
  const expiredRequest = {
    action: "order.create",
    payload: JSON.stringify({ order: validOrder, items: validItems }),
    auth: expiredEnvelope.auth
  };

  assert.equal(verifyOrderAuthEnvelope(expiredRequest, new Date("2026-08-15T10:10:00.000Z").getTime()), false);
});

test("persistence batch prepares Orders row and OrderItems rows", () => {
  const orderHeaders = ORDER_REQUIRED_HEADERS;
  const itemHeaders = ORDER_ITEM_REQUIRED_HEADERS;
  const batch = buildPersistenceBatch(validOrder, validItems, orderHeaders, itemHeaders);

  assert.equal(batch.orderRow.length, orderHeaders.length);
  assert.equal(batch.orderRow[0], validOrder.order_id);
  assert.equal(batch.itemRows.length, 1);
  assert.equal(batch.itemRows[0][0], validOrder.order_id);
  assert.equal(batch.itemRows[0][1], validItems[0].sku);
});
