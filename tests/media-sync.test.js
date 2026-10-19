
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

test("syncMedia performs all uploads before deletions and publishes manifest last", () => {
  const calls = [];

  sandbox.buildCurrentMediaSyncPlan = () => ({
    operations: [
      {
        action: "delete",
        sku: "W0001",
        file: { name: "old.jpg", path: "images/W0001/old.jpg" }
      },
      {
        action: "upload",
        sku: "W0001",
        file: driveFile("new.jpg")
      }
    ],
    warnings: [],
    manifest: { W0001: [driveFile("new.jpg")] }
  });
  sandbox.getDriveFileBytes = () => ({
    name: "new.jpg",
    bytes: [1, 2, 3]
  });
  sandbox.publishFile = file => {
    calls.push(file.fileName.startsWith("images/") ? "upload" : "other-publish");
    return true;
  };
  sandbox.deleteFile = () => {
    calls.push("delete");
    return true;
  };
  sandbox.publishMediaManifest = () => {
    calls.push("manifest");
  };

  sandbox.syncMedia();

  assert.deepEqual(calls, ["upload", "delete", "manifest"]);
});

test("syncMedia stops before deletions and manifest publication when an upload fails", () => {
  const calls = [];

  sandbox.buildCurrentMediaSyncPlan = () => ({
    operations: [
      {
        action: "upload",
        sku: "W0001",
        file: driveFile("new.jpg")
      },
      {
        action: "delete",
        sku: "W0001",
        file: { name: "old.jpg", path: "images/W0001/old.jpg" }
      }
    ],
    warnings: [],
    manifest: { W0001: [driveFile("new.jpg")] }
  });
  sandbox.getDriveFileBytes = () => ({
    name: "new.jpg",
    bytes: [1, 2, 3]
  });
  sandbox.publishFile = () => {
    calls.push("upload");
    throw new Error("GitHub upload failed");
  };
  sandbox.deleteFile = () => {
    calls.push("delete");
  };
  sandbox.publishMediaManifest = () => {
    calls.push("manifest");
  };

  assert.throws(() => sandbox.syncMedia(), /GitHub upload failed/);
  assert.deepEqual(calls, ["upload"]);
});

test("syncMedia preserves the manifest and avoids deletions when a SKU folder is missing", () => {
  const calls = [];
  const previousImages = [driveFile("1.jpg"), driveFile("2.jpg")];

  sandbox.buildCurrentMediaSyncPlan = () => ({
    operations: [],
    warnings: [{ type: "missing-drive-folder", sku: "W0027" }],
    manifest: { W0027: previousImages }
  });
  sandbox.publishMediaManifest = manifest => {
    calls.push("manifest");
    assert.deepEqual(
      JSON.parse(JSON.stringify(manifest)).W0027.map(file => file.name),
      ["1.jpg", "2.jpg"]
    );
  };
  sandbox.deleteFile = () => calls.push("delete");

  const report = sandbox.syncMedia();

  assert.deepEqual(calls, ["manifest"]);
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
