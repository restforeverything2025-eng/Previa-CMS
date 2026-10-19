
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

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, {
  filename: "MediaSync.js"
});

const buildMediaSyncPlan = sandbox.buildMediaSyncPlan;

// Planned interface for the new pure planning function.
// The function will be implemented in MediaSync.js later.
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
