const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getProductReservationPlan,
  buildProductReservationRequests,
  AVAILABLE_PRODUCT_STATUS,
  RESERVED_PRODUCT_STATUS
} = require("../Orders.js");

function createProductsSpreadsheet(rows) {
  const sheet = {
    getSheetId() {
      return 123;
    },
    getDataRange() {
      return {
        getValues() {
          return rows;
        }
      };
    }
  };

  return {
    getSheetByName(name) {
      return name === "Products" ? sheet : null;
    }
  };
}

const headers = ["sku", "status", "title"];

test("reservation plan accepts available products", () => {
  const spreadsheet = createProductsSpreadsheet([
    headers,
    ["W0004", AVAILABLE_PRODUCT_STATUS, "Nina Ricci"],
    ["W0043", AVAILABLE_PRODUCT_STATUS, "Seiko Ultra Slim"]
  ]);

  const result = getProductReservationPlan(spreadsheet, [
    { sku: "W0004" },
    { sku: "W0043" }
  ]);

  assert.equal(result.success, true);
  assert.equal(result.code, "PRODUCTS_READY_FOR_RESERVATION");
  assert.deepEqual(result.reservations.map(item => item.sku), ["W0004", "W0043"]);
  assert.deepEqual(result.reservations.map(item => item.newStatus), [RESERVED_PRODUCT_STATUS, RESERVED_PRODUCT_STATUS]);
});

test("reservation plan rejects reserved product", () => {
  const spreadsheet = createProductsSpreadsheet([
    headers,
    ["W0004", RESERVED_PRODUCT_STATUS, "Nina Ricci"]
  ]);

  const result = getProductReservationPlan(spreadsheet, [{ sku: "W0004" }]);

  assert.equal(result.success, false);
  assert.equal(result.code, "PRODUCT_NOT_AVAILABLE");
  assert.match(result.errors.join(" "), /Product is not available: W0004/);
  assert.deepEqual(result.reservations, []);
});

test("reservation plan rejects sold product", () => {
  const spreadsheet = createProductsSpreadsheet([
    headers,
    ["W0004", "sold", "Nina Ricci"]
  ]);

  const result = getProductReservationPlan(spreadsheet, [{ sku: "W0004" }]);

  assert.equal(result.success, false);
  assert.equal(result.code, "PRODUCT_NOT_AVAILABLE");
  assert.deepEqual(result.reservations, []);
});

test("reservation plan rejects unknown product", () => {
  const spreadsheet = createProductsSpreadsheet([
    headers,
    ["W0004", AVAILABLE_PRODUCT_STATUS, "Nina Ricci"]
  ]);

  const result = getProductReservationPlan(spreadsheet, [{ sku: "UNKNOWN" }]);

  assert.equal(result.success, false);
  assert.equal(result.code, "PRODUCT_NOT_AVAILABLE");
  assert.match(result.errors.join(" "), /Product not found: UNKNOWN/);
});

test("reservation plan validates every SKU before producing a partial plan", () => {
  const spreadsheet = createProductsSpreadsheet([
    headers,
    ["W0004", AVAILABLE_PRODUCT_STATUS, "Nina Ricci"],
    ["W0043", RESERVED_PRODUCT_STATUS, "Seiko Ultra Slim"]
  ]);

  const result = getProductReservationPlan(spreadsheet, [
    { sku: "W0004" },
    { sku: "W0043" }
  ]);

  assert.equal(result.success, false);
  assert.deepEqual(result.reservations, []);
  assert.match(result.errors.join(" "), /W0043/);
});

test("duplicate SKU items produce one reservation update", () => {
  const spreadsheet = createProductsSpreadsheet([
    headers,
    ["W0004", AVAILABLE_PRODUCT_STATUS, "Nina Ricci"]
  ]);

  const result = getProductReservationPlan(spreadsheet, [
    { sku: "W0004" },
    { sku: "W0004" }
  ]);

  assert.equal(result.success, true);
  assert.equal(result.reservations.length, 1);

  const requests = buildProductReservationRequests(
    {
      getSheetId() {
        return 123;
      }
    },
    result.reservations
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0].updateCells.start.sheetId, 123);
  assert.equal(requests[0].updateCells.start.rowIndex, 1);
  assert.equal(requests[0].updateCells.start.columnIndex, 1);
  assert.equal(requests[0].updateCells.rows[0].values[0].userEnteredValue.stringValue, RESERVED_PRODUCT_STATUS);
});

test("missing Products schema is rejected", () => {
  const spreadsheet = createProductsSpreadsheet([
    ["sku", "title"],
    ["W0004", "Nina Ricci"]
  ]);

  const result = getProductReservationPlan(spreadsheet, [{ sku: "W0004" }]);

  assert.equal(result.success, false);
  assert.equal(result.code, "SCHEMA_ERROR");
});
