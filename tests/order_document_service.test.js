const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sourcePath = path.join(
  __dirname,
  "..",
  "OrderDocumentService.js"
);

const source = fs.readFileSync(sourcePath, "utf8");

const sandbox = {
  Logger: {
    log() {}
  }
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox, {
  filename: "OrderDocumentService.js"
});

assert.strictEqual(
  sandbox.formatPublicOrderNumber(1),
  "VWJ-0000001"
);

assert.strictEqual(
  sandbox.formatPublicOrderNumber(42),
  "VWJ-0000042"
);

assert.strictEqual(
  sandbox.parsePublicOrderNumber("VWJ-0000042"),
  42
);

assert.strictEqual(
  sandbox.parsePublicOrderNumber("legacy-value"),
  0
);

assert.strictEqual(
  sandbox.getHighestPublicOrderNumber([
    { public_order_number: "VWJ-0000007" },
    { public_order_number: "VWJ-0000042" },
    { public_order_number: "" }
  ]),
  42
);

assert.strictEqual(
  sandbox.assignPublicOrderNumber(
    { public_order_number: "" },
    [{ public_order_number: "VWJ-0000042" }]
  ),
  "VWJ-0000043"
);

assert.strictEqual(
  sandbox.calculateOrderDocumentUahEquivalent(1390, 52.32),
  72629
);

assert.strictEqual(
  sandbox.formatOrderDocumentExchangeRate(52.32),
  "52,32"
);

assert.strictEqual(
  sandbox.formatOrderDocumentUah(72629),
  "≈ ₴ 72 629"
);

console.log("PASS: order document helper tests");
