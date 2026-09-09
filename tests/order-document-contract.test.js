const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const servicePath = path.join(__dirname, "..", "OrderDocumentService.js");
const queuePath = path.join(__dirname, "..", "OrderDocumentQueue.js");
const webAppPath = path.join(__dirname, "..", "WebApp.js");
const manifestPath = path.join(__dirname, "..", "appsscript.json");

const serviceSource = fs.readFileSync(servicePath, "utf8");
const queueSource = fs.readFileSync(queuePath, "utf8");
const webAppSource = fs.readFileSync(webAppPath, "utf8");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

test("order document sources are valid JavaScript", () => {
  assert.doesNotThrow(() => new vm.Script(serviceSource));
  assert.doesNotThrow(() => new vm.Script(queueSource));
  assert.doesNotThrow(() => new vm.Script(webAppSource));
});

test("order document uses the configured ORDERS folder and deterministic PDF name", () => {
  assert.match(serviceSource, /config\.orders_folder_id/);
  assert.match(serviceSource, /ORD-.*\\\.pdf/);
  assert.match(serviceSource, /getFilesByName/);
  assert.match(serviceSource, /file\.getUrl\(\)/);
});

test("order document has pending, ready and error lifecycle", () => {
  assert.match(serviceSource, /ORDER_DOCUMENT_STATUS_PENDING = "pending"/);
  assert.match(serviceSource, /ORDER_DOCUMENT_STATUS_READY = "ready"/);
  assert.match(serviceSource, /ORDER_DOCUMENT_STATUS_ERROR = "error"/);
  assert.match(queueSource, /markOrderDocumentPending/);
  assert.match(serviceSource, /retryOrderDocument/);
});

test("PDF generation is outside the order creation response", () => {
  assert.match(webAppSource, /OrderEndpoint\.create\(parsedPayload\)/);
  assert.match(webAppSource, /markOrderDocumentPending\(result\.order\.order_id\)/);
  assert.match(webAppSource, /return respondJson\(result\)/);
  assert.doesNotMatch(webAppSource, /processOrderDocument\(result\.order\.order_id\)/);
});

test("document failures do not replace a successful order response", () => {
  assert.match(webAppSource, /markOrderDocumentPending\(result\.order\.order_id\);/);
  assert.doesNotMatch(webAppSource, /if \(!markOrderDocumentPending/);
  assert.match(serviceSource, /ORDER_DOCUMENT_STATUS_ERROR/);
  assert.match(serviceSource, /documentError/);
});

test("PDF body keeps only the approved English header labels", () => {
  assert.match(serviceSource, /"PREVIA"/);
  assert.match(serviceSource, /"VINTAGE SHOP"/);
  assert.match(serviceSource, /"ORDER"/);
  assert.match(serviceSource, /"КЛІЄНТ"/);
  assert.match(serviceSource, /"ТОВАРИ"/);
  assert.match(serviceSource, /"ОПЛАТА"/);
  assert.match(serviceSource, /"РЕКВІЗИТИ ДЛЯ ОПЛАТИ"/);
});

test("Google Docs authorization is declared", () => {
  assert.ok(manifest.oauthScopes.includes("https://www.googleapis.com/auth/documents"));
});
