
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Load MediaSync.js into an isolated VM.
// No Google Apps Script services are provided to this context.
const source = fs.readFileSync(
  path.join(__dirname, "..", "MediaSync.js"),
  "utf8"
);

const sandbox = {
  Logger: { log() {} }
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, {
  filename: "MediaSync.js"
});

const buildMediaSyncPlan = sandbox.buildMediaSyncPlan;
const buildCurrentMediaSyncPlan = sandbox.buildCurrentMediaSyncPlan;

// Adapter for the pure planning function, normalizing cross-VM objects.
function plan(input) {
  assert.equal(
    typeof sandbox.buildMediaSyncPlan,
    "function",
    "MediaSync.js must define buildMediaSyncPlan()"
  );

  // Normalize VM objects so Node.js can compare them reliably.
  return JSON.parse(
    JSON.stringify(sandbox.buildMediaSyncPlan(input))
  );
}

function driveFile(name, id = `drive-${name}`) {
  return {
    id,
    name,
    size: 100,
    mimeType: "image/jpeg",
    updated: "2026-10-19T10:00:00.000Z"
  };
}

function githubFile(name, sha = "sha-same", sku = "W0001") {
  return {
    name,
    path: `images/${sku}/${name}`,
    sha,
    size: 100
  };
}

function stubBatchRuntime(products, previousManifest, githubManifest, driveResult) {
  const properties = {};
  sandbox.PropertiesService = { getScriptProperties: () => ({
    getProperty: key => properties[key] || null,
    setProperty: (key, value) => { properties[key] = value; },
    deleteProperty: key => { delete properties[key]; }
  }) };
  sandbox.LockService = { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) };
  const triggers = [];
  sandbox.ScriptApp = {
    getProjectTriggers: () => triggers.slice(),
    deleteTrigger: trigger => { const i = triggers.indexOf(trigger); if (i >= 0) triggers.splice(i, 1); },
    newTrigger: handler => ({ timeBased() { return this; }, after() { return this; },
      create() { triggers.push({ getHandlerFunction: () => handler }); } })
  };
  sandbox.getProducts = () => products;
  sandbox.getPublishedMediaManifest = () => previousManifest;
  sandbox.getRepositoryImages = () => githubManifest;
  sandbox.getProductFilesResult = driveResult;
  sandbox.publishMediaManifest = manifest => {
    sandbox.__calls.push("manifest");
    sandbox.__publishedManifest = manifest;
  };
  sandbox.__calls = [];
  return { properties, triggers };
}
test("plans an upload for a new Drive image", () => {
  const result = plan({
    driveManifest: {
      W0001: [driveFile("1.jpg")]
    },
    githubManifest: {
      W0001: []
    },
    driveBlobShas: {},
    missingDriveSkus: []
  });

  assert.equal(result.operations.length, 1);
  assert.equal(result.operations[0].action, "upload");
  assert.equal(result.operations[0].sku, "W0001");
  assert.equal(result.operations[0].file.name, "1.jpg");
  assert.deepEqual(result.warnings, []);
});

test("does not upload an unchanged image", () => {
  const result = plan({
    driveManifest: {
      W0001: [driveFile("1.jpg")]
    },
    githubManifest: {
      W0001: [githubFile("1.jpg", "blob-123")]
    },
    driveBlobShas: {
      W0001: {
        "1.jpg": "blob-123"
      }
    },
    missingDriveSkus: []
  });

  assert.deepEqual(result.operations, []);
  assert.deepEqual(result.warnings, []);
});

test("plans an upload when image content changed under the same filename", () => {
  const result = plan({
    driveManifest: {
      W0001: [driveFile("1.jpg")]
    },
    githubManifest: {
      W0001: [githubFile("1.jpg", "old-blob-sha")]
    },
    driveBlobShas: {
      W0001: {
        "1.jpg": "new-blob-sha"
      }
    },
    missingDriveSkus: []
  });

  assert.equal(result.operations.length, 1);
  assert.equal(result.operations[0].action, "upload");
  assert.equal(result.operations[0].file.name, "1.jpg");
});

test("plans deletion of an individual image removed from an existing SKU folder", () => {
  const result = plan({
    driveManifest: {
      W0001: [driveFile("1.jpg")]
    },
    githubManifest: {
      W0001: [
        githubFile("1.jpg", "blob-123"),
        githubFile("2.jpg", "blob-456")
      ]
    },
    driveBlobShas: {
      W0001: {
        "1.jpg": "blob-123"
      }
    },
    missingDriveSkus: []
  });

  assert.equal(result.operations.length, 1);
  assert.equal(result.operations[0].action, "delete");
  assert.equal(result.operations[0].sku, "W0001");
  assert.equal(result.operations[0].file.name, "2.jpg");
  assert.deepEqual(result.warnings, []);
});

test("warns and does not delete images when an entire SKU folder is missing", () => {
  const result = plan({
    driveManifest: {},
    githubManifest: {
      W0027: [
        githubFile("1.jpg", "blob-123", "W0027"),
        githubFile("2.jpg", "blob-456", "W0027")
      ]
    },
    driveBlobShas: {},
    missingDriveSkus: ["W0027"]
  });

  assert.deepEqual(result.operations, []);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].type, "missing-drive-folder");
  assert.equal(result.warnings[0].sku, "W0027");
});

test("a missing SKU folder does not block synchronization planning for other SKUs", () => {
  const result = plan({
    driveManifest: {
      W0001: [driveFile("1.jpg")]
    },
    githubManifest: {
      W0001: [],
      W0027: [
        githubFile("1.jpg", "blob-123", "W0027")
      ]
    },
    driveBlobShas: {},
    missingDriveSkus: ["W0027"]
  });

  assert.equal(result.operations.length, 1);
  assert.equal(result.operations[0].action, "upload");
  assert.equal(result.operations[0].sku, "W0001");

  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].sku, "W0027");
});

test("does not plan destructive operations for a SKU marked as missing", () => {
  const result = plan({
    driveManifest: {
      W0001: [driveFile("1.jpg")]
    },
    githubManifest: {
      W0001: [
        githubFile("1.jpg", "blob-123"),
        githubFile("2.jpg", "blob-456")
      ],
      W0027: [
        githubFile("1.jpg", "blob-789", "W0027")
      ]
    },
    driveBlobShas: {
      W0001: {
        "1.jpg": "blob-123"
      }
    },
    missingDriveSkus: ["W0027"]
  });

  const deletedSkus = result.operations
    .filter(operation => operation.action === "delete")
    .map(operation => operation.sku);

  assert.equal(deletedSkus.includes("W0027"), false);
  assert.equal(result.warnings.length, 1);
});

test("returns an empty plan when both manifests are empty", () => {
  const result = plan({
    driveManifest: {},
    githubManifest: {},
    driveBlobShas: {},
    missingDriveSkus: []
  });

  assert.deepEqual(result.operations, []);
  assert.deepEqual(result.warnings, []);
});

test('does not plan operations for a missing SKU even if it appears in driveManifest', () => {
  const result = buildMediaSyncPlan({
    driveManifest: {
      'W-001': [
        { name: 'Image01.jpg' }
      ],
      'W-002': [
        { name: 'Image01.jpg' }
      ]
    },
    githubManifest: {
      'W-001': [
        { name: 'OldImage.jpg', sha: 'github-old-sha' }
      ],
      'W-002': []
    },
    driveBlobShas: {},
    missingDriveSkus: ['W-001']
  });

  assert.equal(result.operations.length, 1);
  assert.equal(result.operations[0].action, 'upload');
  assert.equal(result.operations[0].sku, 'W-002');
  assert.equal(result.operations[0].file.name, 'Image01.jpg');

  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].type, 'missing-drive-folder');
  assert.equal(result.warnings[0].sku, 'W-001');
});


test("mergeMediaManifests keeps the last published images for a missing Drive folder", () => {
  const merged = JSON.parse(JSON.stringify(
    sandbox.mergeMediaManifests(
      {
        W0001: [driveFile("new.jpg")]
      },
      {
        W0001: [driveFile("old.jpg")],
        W0027: [driveFile("1.jpg"), driveFile("2.jpg")]
      },
      ["W0027"]
    )
  ));

  assert.deepEqual(merged.W0001.map(file => file.name), ["new.jpg"]);
  assert.deepEqual(merged.W0027.map(file => file.name), ["1.jpg", "2.jpg"]);
});

test("getMediaSyncInventory records a missing folder without hiding other SKUs", () => {
  sandbox.getProducts = () => [{ sku: "W0001" }, { sku: "W0027" }];
  sandbox.getProductFilesResult = sku => {
    if (sku === "W0027") return { found: false, files: [] };
    return { found: true, files: [driveFile("1.jpg")] };
  };

  const inventory = JSON.parse(JSON.stringify(
    sandbox.getMediaSyncInventory()
  ));

  assert.deepEqual(Object.keys(inventory.driveManifest), ["W0001"]);
  assert.equal(inventory.missingDriveSkus.length, 1);
  assert.equal(inventory.missingDriveSkus[0], "W0027");
});

test("getMediaSyncInventory propagates Drive/API errors instead of treating them as missing folders", () => {
  sandbox.getProducts = () => [{ sku: "W0001" }];
  sandbox.getProductFilesResult = () => {
    throw new Error("Drive API unavailable");
  };

  assert.throws(
    () => sandbox.getMediaSyncInventory(),
    /Drive API unavailable/
  );
});

test("syncMedia performs batch uploads before deletions and publishes manifest last", () => {
  const runtime = stubBatchRuntime(
    [{ sku: "W0001" }],
    { W0001: [driveFile("old.jpg")] },
    { W0001: [githubFile("old.jpg", "old-sha")] },
    () => ({ found: true, files: [driveFile("new.jpg")] })
  );
  sandbox.getDriveFileBytes = fileId => ({ name: fileId === "drive-new.jpg" ? "new.jpg" : "old.jpg", bytes: [1, 2, 3] });
  sandbox.publishFile = file => { sandbox.__calls.push(file.fileName.startsWith("images/") ? "upload" : "other"); };
  sandbox.deleteFile = () => { sandbox.__calls.push("delete"); };
  sandbox.syncMedia();
  assert.deepEqual(sandbox.__calls, ["upload", "delete", "manifest"]);
  assert.equal(JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1).lastSku, "W0001");
});

test("syncMedia stops before deletions and manifest publication when an upload fails", () => {
  stubBatchRuntime(
    [{ sku: "W0001" }],
    { W0001: [driveFile("old.jpg")] },
    { W0001: [githubFile("old.jpg", "old-sha")] },
    () => ({ found: true, files: [driveFile("new.jpg")] })
  );
  sandbox.getDriveFileBytes = () => ({ name: "new.jpg", bytes: [1, 2, 3] });
  const calls = sandbox.__calls;
  sandbox.publishFile = () => { calls.push("upload"); throw new Error("GitHub upload failed"); };
  sandbox.deleteFile = () => calls.push("delete");
  sandbox.publishMediaManifest = () => calls.push("manifest");
  assert.throws(() => sandbox.syncMedia(), /GitHub upload failed/);
  assert.deepEqual(calls, ["upload"]);
});

test("syncMedia preserves the manifest and avoids deletions when a SKU folder is missing", () => {
  const previousImages = [driveFile("1.jpg"), driveFile("2.jpg")];
  stubBatchRuntime(
    [{ sku: "W0027" }],
    { W0027: previousImages },
    { W0027: [githubFile("1.jpg", "sha-1", "W0027"), githubFile("2.jpg", "sha-2", "W0027")] },
    () => ({ found: false, files: [] })
  );
  sandbox.deleteFile = () => sandbox.__calls.push("delete");
  const report = sandbox.syncMedia();
  assert.deepEqual(sandbox.__calls, ["manifest"]);
  assert.deepEqual(
    JSON.parse(JSON.stringify(sandbox.__publishedManifest)).W0027.map(file => file.name),
    ["1.jpg", "2.jpg"]
  );
  assert.match(report, /W0027/);
});

test("buildCurrentMediaSyncPlan preserves missing SKU images and still plans healthy SKUs", () => {
  sandbox.getProducts = () => [{ sku: "W0027" }, { sku: "W0001" }];
  sandbox.getProductFilesResult = sku => {
    if (sku === "W0027") return { found: false, files: [] };
    return { found: true, files: [driveFile("new.jpg")] };
  };
  sandbox.getPublishedMediaManifest = () => ({
    W0027: [driveFile("1.jpg"), driveFile("2.jpg")]
  });
  sandbox.getRepositoryImages = () => ({
    W0027: [
      githubFile("1.jpg", "sha-1", "W0027"),
      githubFile("2.jpg", "sha-2", "W0027")
    ],
    W0001: []
  });

  const result = JSON.parse(JSON.stringify(
    buildCurrentMediaSyncPlan()
  ));

  assert.equal(result.operations.length, 1);
  assert.equal(result.operations[0].action, "upload");
  assert.equal(result.operations[0].sku, "W0001");
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].sku, "W0027");
  assert.deepEqual(
    result.manifest.W0027.map(file => file.name),
    ["1.jpg", "2.jpg"]
  );
});


test("mergeMediaManifests does not invent an empty entry when a missing SKU has no previous manifest", () => {
  const merged = JSON.parse(JSON.stringify(
    sandbox.mergeMediaManifests(
      {},
      {},
      ["W0027"]
    )
  ));

  assert.equal(Object.prototype.hasOwnProperty.call(merged, "W0027"), false);
});

test("metadata fast path skips downloading bytes for unchanged files", () => {
  assert.equal(sandbox.isMediaFileMetadataUnchanged(
    driveFile("1.webp", "same-id"), driveFile("1.webp", "same-id")
  ), true);
});

test("metadata comparison requires same Drive ID, size and updated timestamp", () => {
  const previous = driveFile("1.webp", "same-id");
  assert.equal(sandbox.isMediaFileMetadataUnchanged({ ...previous, size: 101 }, previous), false);
  assert.equal(sandbox.isMediaFileMetadataUnchanged(
    { ...previous, updated: "2026-10-20T10:00:00.000Z" }, previous
  ), false);
  assert.equal(sandbox.isMediaFileMetadataUnchanged(
    driveFile("1.webp", "different-id"), previous
  ), false);
});

test("media sync batches use numeric SKU ordering and resume after the last SKU", () => {
  const products = [{ sku: "W10" }, { sku: "W2" }, { sku: "W1" }, { sku: "W3" }];
  const first = JSON.parse(JSON.stringify(sandbox.selectMediaSyncBatch(products, "", 2)));
  assert.deepEqual(first.products.map(product => product.sku), ["W1", "W2"]);
  assert.equal(first.hasMoreAfterBatch, true);
  const second = JSON.parse(JSON.stringify(sandbox.selectMediaSyncBatch(products, "W2", 2)));
  assert.deepEqual(second.products.map(product => product.sku), ["W3", "W10"]);
  assert.equal(second.hasMoreAfterBatch, false);
});

test("current planner skips Drive byte reads when manifest metadata matches", () => {
  const current = driveFile("1.webp", "drive-1");
  sandbox.getProducts = () => [{ sku: "W0001" }];
  sandbox.getProductFilesResult = () => ({ found: true, files: [current] });
  sandbox.getPublishedMediaManifest = () => ({ W0001: [driveFile("1.webp", "drive-1")] });
  sandbox.getRepositoryImages = () => ({ W0001: [githubFile("1.webp", "same-blob")] });
  sandbox.getDriveFileBytes = () => { throw new Error("unchanged file bytes should not be read"); };

  const result = JSON.parse(JSON.stringify(sandbox.buildCurrentMediaSyncPlan()));
  assert.deepEqual(result.operations, []);
});

test("current planner hashes and uploads a same-name image when Drive metadata changed", () => {
  const current = { ...driveFile("1.webp", "drive-1"), updated: "2026-10-20T12:00:00.000Z" };
  sandbox.getProducts = () => [{ sku: "W0001" }];
  sandbox.getProductFilesResult = () => ({ found: true, files: [current] });
  sandbox.getPublishedMediaManifest = () => ({
    W0001: [{ ...driveFile("1.webp", "drive-1"), updated: "2026-10-19T10:00:00.000Z" }]
  });
  sandbox.getRepositoryImages = () => ({ W0001: [githubFile("1.webp", "old-blob")] });
  sandbox.getDriveFileBytes = () => ({ name: "1.webp", bytes: [1, 2, 3] });
  sandbox.getGitHubBlobSha = () => "new-blob";

  const result = JSON.parse(JSON.stringify(sandbox.buildCurrentMediaSyncPlan()));
  assert.equal(result.operations.length, 1);
  assert.equal(result.operations[0].action, "upload");
  assert.equal(result.operations[0].file.name, "1.webp");
});

test("full audit hashes same-name files even when Drive metadata is unchanged", () => {
  const file = driveFile("1.webp", "drive-1");
  const runtime = stubBatchRuntime(
    [{ sku: "W0001" }],
    { W0001: [file] },
    { W0001: [githubFile("1.webp", "old-blob")] },
    () => ({ found: true, files: [file] })
  );
  runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1 = JSON.stringify({
    lastSku: "",
    startedAt: "2026-10-20T12:00:00.000Z",
    mode: "audit"
  });
  let byteReads = 0;
  sandbox.getDriveFileBytes = () => { byteReads += 1; return { name: "1.webp", bytes: [1, 2, 3] }; };
  sandbox.getGitHubBlobSha = () => "new-blob";
  sandbox.publishFile = fileToPublish => {
    sandbox.__calls.push(fileToPublish.fileName.startsWith("images/") ? "upload" : "other");
  };
  sandbox.syncMedia();
  assert.equal(byteReads, 1);
  assert.deepEqual(sandbox.__calls, ["upload", "manifest"]);
  assert.equal(JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1).mode, "audit");
});

test("syncMedia does not advance the batch cursor when manifest publication fails", () => {
  const runtime = stubBatchRuntime(
    [{ sku: "W0001" }, { sku: "W0002" }],
    {},
    { W0001: [], W0002: [] },
    () => ({ found: true, files: [driveFile("1.webp")] })
  );
  sandbox.publishMediaManifest = () => { throw new Error("Manifest publish failed"); };
  assert.throws(() => sandbox.syncMedia(), /Manifest publish failed/);
  assert.equal(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1, undefined);
});


test("replaces a listed continuation trigger instead of mistaking it for a future run", () => {
  const products = [
    { sku: "W0001" },
    { sku: "W0002" },
    { sku: "W0003" },
    { sku: "W0004" }
  ];
  const runtime = stubBatchRuntime(
    products,
    {},
    {},
    () => ({ found: true, files: [] })
  );
  const executingTrigger = {
    getHandlerFunction: () => "continueMediaSync"
  };
  runtime.triggers.push(executingTrigger);

  sandbox.syncMedia();

  assert.equal(runtime.triggers.length, 1);
  assert.notEqual(runtime.triggers[0], executingTrigger);
  assert.equal(runtime.triggers[0].getHandlerFunction(), "continueMediaSync");
  assert.equal(
    JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1).lastSku,
    "W0003"
  );
});

test("clears state and triggers on the last non-empty batch", () => {
  const runtime = stubBatchRuntime(
    [{ sku: "W0001" }, { sku: "W0002" }, { sku: "W0003" }],
    {},
    {},
    () => ({ found: true, files: [] })
  );
  runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1 = JSON.stringify({
    lastSku: "W0002",
    startedAt: "2026-10-25T00:00:00.000Z"
  });
  runtime.triggers.push({
    getHandlerFunction: () => "continueMediaSync"
  });

  sandbox.continueMediaSync();

  assert.equal(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1, undefined);
  assert.equal(runtime.triggers.length, 0);
  assert.deepEqual(sandbox.__calls, ["manifest"]);
});

test("simulates a 70-SKU catalog with 280 images across bounded media-sync batches", () => {
  const products = Array.from({ length: 70 }, (_, index) => ({
    sku: "W" + String(index + 1).padStart(4, "0")
  }));
  const imageCountBySku = new Map();
  products.forEach(product => imageCountBySku.set(product.sku, 4));

  const runtime = stubBatchRuntime(
    products,
    {},
    {},
    sku => ({
      found: true,
      files: Array.from({ length: imageCountBySku.get(sku) }, (_, imageIndex) =>
        driveFile((imageIndex + 1) + ".webp", sku + "-image-" + (imageIndex + 1))
      )
    })
  );

  let uploaded = 0;
  sandbox.getDriveFileBytes = fileId => ({
    name: fileId.split("-image-")[1] + ".webp",
    bytes: [1, 2, 3]
  });
  sandbox.publishFile = file => {
    if (file.fileName.startsWith("images/")) uploaded += 1;
  };

  let executions = 0;
  sandbox.syncMedia();
  executions += 1;
  while (runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1) {
    sandbox.continueMediaSync();
    executions += 1;
    assert.ok(executions <= 24, "batch loop should terminate after at most 24 executions");
  }

  assert.equal(uploaded, 280);
  assert.equal(executions, 24);
  assert.equal(runtime.triggers.length, 0);
  assert.equal(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1, undefined);
});
