const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadCatalogHarness(options = {}) {
  const calls = [];
  const products = options.products || [{
    id: "P0001",
    sku: "W0001",
    category: "Category",
    brand: "Brand",
    name: "Product",
    currency: "EUR",
    price: 10,
    sale: false,
    status: "available",
    dateAdded: "2026-11-05",
    description: "Description",
  }];
  const inventory = {
    driveManifest: { W0001: [{ name: "1.jpg" }] },
    missingDriveSkus: [],
  };
  const publishedManifest = { W0001: [{ name: "1.jpg" }] };
  const context = {
    console,
    Logger: { log() {} },
    Utilities: {
      formatDate(value) { return String(value); },
      newBlob(value) {
        return { getBytes: () => Array.from(Buffer.from(String(value), "utf8")) };
      },
      base64Encode(value) { return Buffer.from(value).toString("base64"); },
    },
    Session: { getScriptTimeZone: () => "UTC" },
    PublishReport: {
      reset() { calls.push("report:reset"); },
      add() {},
      show() {},
      build() { return "published"; },
    },
    PublicationJournal: {
      success() { calls.push("journal:success"); },
      failure() { calls.push("journal:failure"); },
    },
    getProducts: () => products,
    getNewProducts: () => [],
    hasNewProducts: () => true,
    assignId() {},
    assignSku() {},
    normalizeProducts() {},
    validateIncoming() {},
    validateProducts() {},
    prepareProductFolders() {},
    getProductFiles(sku) {
      calls.push("drive:validate:" + sku);
      return [{ name: "1.jpg" }];
    },
    getMediaSyncInventory(input) {
      calls.push("drive:inventory");
      assert.equal(input, products);
      return inventory;
    },
    getPublishedMediaManifest() {
      calls.push("manifest:read");
      return publishedManifest;
    },
    mergeMediaManifests(driveManifest, previousManifest, missingSkus) {
      calls.push("manifest:merge");
      assert.deepEqual(missingSkus, []);
      return Object.assign({}, previousManifest, driveManifest);
    },
    generateDataJS(_products, manifest) {
      calls.push("data:generate");
      return {
        fileName: "data.js",
        content: JSON.stringify(manifest.W0001.map((file) =>
          "images/W0001/" + file.name
        )),
      };
    },
    publishFile(file) {
      calls.push("publish:" + file.fileName);
      context.publishedFile = file;
    },
    getExchangeRate: () => 1,
    writeGeneratedFields() {},
    cleanupIncoming() {},
    syncMedia() { calls.push("syncMedia"); },
    getConfig: () => ({ github_owner: "owner", github_repo: "repo", github_branch: "main", github_token: "token" }),
    UrlFetchApp: {
      fetch(url, request) {
        calls.push("github:publish");
        context.lastRequest = { url, request };
        return {
          getResponseCode: () => 200,
          getContentText: () => "{}",
        };
      },
    },
  };
  vm.createContext(context);
  for (const filename of ["DataGenerator.js", "Validation.js", "GitHub.js", "Publish.js"]) {
    const source = fs.readFileSync(path.join(__dirname, "..", filename), "utf8");
    vm.runInContext(source, context, { filename });
  }
  context.getMediaSyncInventory = (...args) => {
    calls.push("drive:inventory");
    assert.equal(args[0], products);
    return inventory;
  };
  context.getPublishedMediaManifest = () => {
    calls.push("manifest:read");
    return publishedManifest;
  };
  context.getFileSha = () => "previous-sha";
  context.UrlFetchApp = {
    fetch(url, request) {
      calls.push("github:publish");
      context.lastRequest = { url, request };
      return {
        getResponseCode: () => 200,
        getContentText: () => "{}",
      };
    },
  };
  context.mergeMediaManifests = (driveManifest, previousManifest, missingSkus) => {
    calls.push("manifest:merge");
    assert.deepEqual(missingSkus, []);
    return Object.assign({}, previousManifest, driveManifest);
  };
  return { context, calls, products };
}

test("validateImages checks Drive images without starting MediaSync", () => {
  const { context, calls, products } = loadCatalogHarness();

  assert.equal(context.validateImages(products), true);
  assert.deepEqual(calls, ["drive:validate:W0001"]);
});

test("publishBoutique publishes catalog data without starting MediaSync", () => {
  const { context, calls } = loadCatalogHarness();

  assert.equal(context.publishBoutique(false), "published");
  assert.equal(calls.includes("syncMedia"), false);
  assert.equal(calls.includes("github:publish"), true);
  assert.match(context.lastRequest.url, /\/contents\/data\.js$/);
  assert.equal(calls.includes("journal:success"), true);
});

test("publishDataJS reads Drive inventory and manifest to preserve image paths", () => {
  const { context, calls, products } = loadCatalogHarness();

  context.publishDataJS(products);

  assert.deepEqual(
    calls.filter((call) => ["drive:inventory", "manifest:read", "manifest:merge"].includes(call)),
    ["drive:inventory", "manifest:read", "manifest:merge"],
  );
  assert.match(context.lastRequest.url, /\/contents\/data\.js$/);
  const dataSource = Buffer.from(
    JSON.parse(context.lastRequest.request.payload).content,
    "base64",
  ).toString("utf8");
  assert.match(dataSource, /"images\/W0001\/1\.jpg"/);
  assert.equal(calls.includes("syncMedia"), false);
});

test("explicit refreshMedia entry point still starts MediaSync", () => {
  const { context, calls } = loadCatalogHarness();

  context.refreshMedia();

  assert.deepEqual(calls, ["syncMedia"]);
});
