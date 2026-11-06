const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

function asBytes(value) {
  if (Array.isArray(value)) {
    return Buffer.from(value.map((byte) => byte < 0 ? byte + 256 : byte));
  }
  return Buffer.from(String(value), "utf8");
}

function gitBlobSha(value) {
  const bytes = asBytes(value);
  return crypto.createHash("sha1")
    .update(Buffer.concat([Buffer.from("blob " + bytes.length + "\0"), bytes]))
    .digest("hex");
}

// Load MediaSync.js into an isolated VM.
// No Google Apps Script services are provided to this context.
const source = fs.readFileSync(
  path.join(__dirname, "..", "MediaSync.js"),
  "utf8",
);

const sandbox = {
  Logger: { log() {} },
  Utilities: {
    DigestAlgorithm: { SHA_1: "sha1" },
    newBlob(value) {
      const bytes = asBytes(value);
      return {
        getBytes: () => Array.from(bytes).map((byte) => byte > 127 ? byte - 256 : byte),
        getDataAsString: () => bytes.toString("utf8"),
      };
    },
    computeDigest(algorithm, value) {
      return Array.from(crypto.createHash("sha1").update(asBytes(value)).digest())
        .map((byte) => byte > 127 ? byte - 256 : byte);
    },
    base64Encode(value) {
      return asBytes(value).toString("base64");
    },
    base64Decode(value) {
      return Array.from(Buffer.from(String(value).replace(/\s/g, ""), "base64"))
        .map((byte) => byte > 127 ? byte - 256 : byte);
    },
  },
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, {
  filename: "MediaSync.js",
});

const buildMediaSyncPlan = sandbox.buildMediaSyncPlan;
const buildCurrentMediaSyncPlan = sandbox.buildCurrentMediaSyncPlan;

// Adapter for the pure planning function, normalizing cross-VM objects.
function plan(input) {
  assert.equal(
    typeof sandbox.buildMediaSyncPlan,
    "function",
    "MediaSync.js must define buildMediaSyncPlan()",
  );

  // Normalize VM objects so Node.js can compare them reliably.
  return JSON.parse(JSON.stringify(sandbox.buildMediaSyncPlan(input)));
}

function driveFile(name, id = `drive-${name}`) {
  return {
    id,
    name,
    size: 100,
    mimeType: "image/jpeg",
    updated: "2026-10-19T10:00:00.000Z",
  };
}

function githubFile(name, sha = "sha-same", sku = "W0001") {
  return {
    name,
    path: `images/${sku}/${name}`,
    sha,
    size: 100,
  };
}

function stubBatchRuntime(
  products,
  previousManifest,
  githubManifest,
  driveResult,
  options,
) {
  sandbox.MEDIA_SYNC_TIME_BUDGET_MS = 4 * 60 * 1000;
  previousManifest = JSON.parse(JSON.stringify(previousManifest || {}));
  if (!options || options.seedPublishedGitHubShas !== false) {
    Object.keys(previousManifest).forEach((sku) => {
      const githubByName = new Map(
        ((githubManifest || {})[sku] || []).map((file) => [file.name, file]),
      );
      previousManifest[sku].forEach((file) => {
        if (!file.githubSha && githubByName.has(file.name)) {
          file.githubSha = githubByName.get(file.name).sha;
        }
      });
    });
  }
  const properties = {};
  sandbox.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key) => properties[key] || null,
      setProperty: (key, value) => {
        properties[key] = value;
      },
      deleteProperty: (key) => {
        delete properties[key];
      },
    }),
  };
  sandbox.LockService = {
    getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }),
  };
  const triggers = [];
  let triggerUid = 0;
  const blobContents = new Map();
  const pendingTrees = new Map();
  const commitObjects = new Map();
  let currentCommitSha = "base-commit";
  let currentTreeSha = "base-tree";
  let currentTree = [];
  const previousText = JSON.stringify(previousManifest || {}, null, 2);
  const manifestSha = gitBlobSha(previousText);
  blobContents.set(manifestSha, previousText);
  currentTree.push({
    path: "media-manifest.json",
    mode: "100644",
    type: "blob",
    sha: manifestSha,
    size: Buffer.byteLength(previousText),
  });
  Object.keys(githubManifest || {}).forEach((sku) => {
    (githubManifest[sku] || []).forEach((file) => {
      currentTree.push({
        path: file.path || `images/${sku}/${file.name}`,
        mode: "100644",
        type: "blob",
        sha: file.sha,
        size: file.size || 0,
      });
    });
  });
  const makeBlob = (bytes, isText) => {
    const sha = isText
      ? gitBlobSha(bytes)
      : (typeof sandbox.getGitHubBlobSha === "function"
        ? sandbox.getGitHubBlobSha(bytes)
        : gitBlobSha(bytes));
    if (isText) {
      blobContents.set(sha, String(bytes));
      sandbox.__textBlobs.push(String(bytes));
    }
    sandbox.__calls.push(isText ? "blob:text" : "blob:image");
    sandbox.recordMediaSyncGitHubRequest("post", "/git/blobs");
    return { sha };
  };
  sandbox.ScriptApp = {
    getProjectTriggers: () => triggers.slice(),
    deleteTrigger: (trigger) => {
      const i = triggers.indexOf(trigger);
      if (i >= 0) triggers.splice(i, 1);
    },
    newTrigger: (handler) => ({
      timeBased() {
        return this;
      },
      after(delayMs) {
        this.delayMs = delayMs;
        return this;
      },
      create() {
        triggers.push({
          getHandlerFunction: () => handler,
          getUniqueId: () => "media-trigger-" + (++triggerUid),
          delayMs: this.delayMs,
        });
      },
    }),
  };
  sandbox.getProducts = () => products;
  sandbox.getPublishedMediaManifest = () => previousManifest;
  sandbox.getRepositoryImages = () => githubManifest;
  sandbox.getProductFilesResult = driveResult;
  sandbox.getGitHubBranchSnapshot = () => {
    sandbox.recordMediaSyncGitHubRequest("get", "/branches/main");
    return {
      branch: "main",
      commitSha: currentCommitSha,
      treeSha: currentTreeSha,
    };
  };
  sandbox.getGitHubCommitIdentity = () => ({
    name: "Test GitHub User",
    email: "123+test-user@users.noreply.github.com",
  });
  sandbox.getGitHubTreeSnapshot = () => {
    sandbox.recordMediaSyncGitHubRequest("get", "/git/trees/tree");
    return {
      sha: currentTreeSha,
      truncated: Boolean(sandbox.__treeTruncated),
      tree: currentTree.map((item) => ({ ...item })),
    };
  };
  sandbox.getGitHubBlobText = (sha) => {
    sandbox.recordMediaSyncGitHubRequest("get", "/git/blobs/" + sha);
    return blobContents.get(sha) || null;
  };
  sandbox.createGitHubBlob = (bytes) => makeBlob(bytes, false);
  sandbox.createGitHubTextBlob = (content) => makeBlob(content, true);
  sandbox.createGitHubTree = (_baseTreeSha, elements) => {
    sandbox.recordMediaSyncGitHubRequest("post", "/git/trees");
    sandbox.__calls.push("tree");
    const entries = new Map(currentTree.map((item) => [item.path, { ...item }]));
    elements.forEach((item) => {
      if (item.sha === null) entries.delete(item.path);
      else entries.set(item.path, { ...item, size: 0 });
      if (item.path === "media-manifest.json" && item.sha) {
        sandbox.__publishedManifest = JSON.parse(blobContents.get(item.sha));
      }
    });
    const sha = "tree-" + (pendingTrees.size + 1);
    pendingTrees.set(sha, Array.from(entries.values()));
    return { sha };
  };
  sandbox.createGitHubCommit = (message, treeSha, parentSha, identity, date) => {
    sandbox.recordMediaSyncGitHubRequest("post", "/git/commits");
    sandbox.__calls.push("commit");
    const payload = { message, treeSha, parentSha, identity, date };
    const key = JSON.stringify(payload);
    if (!commitObjects.has(key)) {
      commitObjects.set(key, "commit-object-" + (commitObjects.size + 1));
    }
    return { sha: commitObjects.get(key), tree: { sha: treeSha } };
  };
  sandbox.updateGitHubBranchRef = (commitSha, expectedHeadSha) => {
    sandbox.recordMediaSyncGitHubRequest("get", "/branches/main");
    sandbox.recordMediaSyncGitHubRequest("patch", "/git/refs/heads/main");
    sandbox.__calls.push("ref");
    if (expectedHeadSha !== currentCommitSha) {
      const error = new Error("branch changed");
      error.code = "GITHUB_CONFLICT";
      throw error;
    }
    currentCommitSha = commitSha;
    currentTreeSha = "tree-" + pendingTrees.size;
    currentTree = pendingTrees.get(currentTreeSha) || currentTree;
    return { object: { sha: commitSha } };
  };
  sandbox.getDriveFileBytes = (fileId) => ({
    name: String(fileId).replace(/^drive-/, ""),
    bytes: [1, 2, 3],
    mimeType: "image/jpeg",
  });
  sandbox.__calls = [];
  sandbox.__textBlobs = [];
  sandbox.publishMediaManifest = (manifest) => {
    sandbox.__calls.push("manifest");
    sandbox.__publishedManifest = manifest;
  };
  sandbox.__calls = [];
  sandbox.__publishedManifest = undefined;
  return {
    properties,
    triggers,
    blobContents,
    commitObjects,
    setExternalBranch(commitSha, extraTreeEntry) {
      currentCommitSha = commitSha;
      currentTreeSha = "external-tree-" + commitSha;
      if (extraTreeEntry) currentTree.push({ ...extraTreeEntry });
    },
    getCurrentTree() {
      return currentTree.map((item) => ({ ...item }));
    },
  };
}
function expireMediaSyncRetry(runtime) {
  const key = "PREVIA_MEDIA_SYNC_STATE_V1";
  if (!runtime.properties[key]) return;
  const state = JSON.parse(runtime.properties[key]);
  state.retryNotBeforeAt = "2000-01-01T00:00:00.000Z";
  runtime.properties[key] = JSON.stringify(state);
}
test("plans an upload for a new Drive image", () => {
  const result = plan({
    driveManifest: {
      W0001: [driveFile("1.jpg")],
    },
    githubManifest: {
      W0001: [],
    },
    driveBlobShas: {},
    missingDriveSkus: [],
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
      W0001: [driveFile("1.jpg")],
    },
    githubManifest: {
      W0001: [githubFile("1.jpg", "blob-123")],
    },
    driveBlobShas: {
      W0001: {
        "1.jpg": "blob-123",
      },
    },
    missingDriveSkus: [],
  });

  assert.deepEqual(result.operations, []);
  assert.deepEqual(result.warnings, []);
});

test("plans an upload when image content changed under the same filename", () => {
  const result = plan({
    driveManifest: {
      W0001: [driveFile("1.jpg")],
    },
    githubManifest: {
      W0001: [githubFile("1.jpg", "old-blob-sha")],
    },
    driveBlobShas: {
      W0001: {
        "1.jpg": "new-blob-sha",
      },
    },
    missingDriveSkus: [],
  });

  assert.equal(result.operations.length, 1);
  assert.equal(result.operations[0].action, "upload");
  assert.equal(result.operations[0].file.name, "1.jpg");
});

test("plans deletion of an individual image removed from an existing SKU folder", () => {
  const result = plan({
    driveManifest: {
      W0001: [driveFile("1.jpg")],
    },
    githubManifest: {
      W0001: [githubFile("1.jpg", "blob-123"), githubFile("2.jpg", "blob-456")],
    },
    driveBlobShas: {
      W0001: {
        "1.jpg": "blob-123",
      },
    },
    missingDriveSkus: [],
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
        githubFile("2.jpg", "blob-456", "W0027"),
      ],
    },
    driveBlobShas: {},
    missingDriveSkus: ["W0027"],
  });

  assert.deepEqual(result.operations, []);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].type, "missing-drive-folder");
  assert.equal(result.warnings[0].sku, "W0027");
});

test("a missing SKU folder does not block synchronization planning for other SKUs", () => {
  const result = plan({
    driveManifest: {
      W0001: [driveFile("1.jpg")],
    },
    githubManifest: {
      W0001: [],
      W0027: [githubFile("1.jpg", "blob-123", "W0027")],
    },
    driveBlobShas: {},
    missingDriveSkus: ["W0027"],
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
      W0001: [driveFile("1.jpg")],
    },
    githubManifest: {
      W0001: [githubFile("1.jpg", "blob-123"), githubFile("2.jpg", "blob-456")],
      W0027: [githubFile("1.jpg", "blob-789", "W0027")],
    },
    driveBlobShas: {
      W0001: {
        "1.jpg": "blob-123",
      },
    },
    missingDriveSkus: ["W0027"],
  });

  const deletedSkus = result.operations
    .filter((operation) => operation.action === "delete")
    .map((operation) => operation.sku);

  assert.equal(deletedSkus.includes("W0027"), false);
  assert.equal(result.warnings.length, 1);
});

test("returns an empty plan when both manifests are empty", () => {
  const result = plan({
    driveManifest: {},
    githubManifest: {},
    driveBlobShas: {},
    missingDriveSkus: [],
  });

  assert.deepEqual(result.operations, []);
  assert.deepEqual(result.warnings, []);
});

test("does not plan operations for a missing SKU even if it appears in driveManifest", () => {
  const result = buildMediaSyncPlan({
    driveManifest: {
      "W-001": [{ name: "Image01.jpg" }],
      "W-002": [{ name: "Image01.jpg" }],
    },
    githubManifest: {
      "W-001": [{ name: "OldImage.jpg", sha: "github-old-sha" }],
      "W-002": [],
    },
    driveBlobShas: {},
    missingDriveSkus: ["W-001"],
  });

  assert.equal(result.operations.length, 1);
  assert.equal(result.operations[0].action, "upload");
  assert.equal(result.operations[0].sku, "W-002");
  assert.equal(result.operations[0].file.name, "Image01.jpg");

  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].type, "missing-drive-folder");
  assert.equal(result.warnings[0].sku, "W-001");
});

test("mergeMediaManifests keeps the last published images for a missing Drive folder", () => {
  const merged = JSON.parse(
    JSON.stringify(
      sandbox.mergeMediaManifests(
        {
          W0001: [driveFile("new.jpg")],
        },
        {
          W0001: [driveFile("old.jpg")],
          W0027: [driveFile("1.jpg"), driveFile("2.jpg")],
        },
        ["W0027"],
      ),
    ),
  );

  assert.deepEqual(
    merged.W0001.map((file) => file.name),
    ["new.jpg"],
  );
  assert.deepEqual(
    merged.W0027.map((file) => file.name),
    ["1.jpg", "2.jpg"],
  );
});

test("getMediaSyncInventory records a missing folder without hiding other SKUs", () => {
  sandbox.getProducts = () => [{ sku: "W0001" }, { sku: "W0027" }];
  sandbox.getProductFilesResult = (sku) => {
    if (sku === "W0027") return { found: false, files: [] };
    return { found: true, files: [driveFile("1.jpg")] };
  };

  const inventory = JSON.parse(JSON.stringify(sandbox.getMediaSyncInventory()));

  assert.deepEqual(Object.keys(inventory.driveManifest), ["W0001"]);
  assert.equal(inventory.missingDriveSkus.length, 1);
  assert.equal(inventory.missingDriveSkus[0], "W0027");
});

test("getMediaSyncInventory propagates Drive/API errors instead of treating them as missing folders", () => {
  sandbox.getProducts = () => [{ sku: "W0001" }];
  sandbox.getProductFilesResult = () => {
    throw new Error("Drive API unavailable");
  };

  assert.throws(() => sandbox.getMediaSyncInventory(), /Drive API unavailable/);
});

test("syncMedia publishes uploads, deletions and manifest in one Git Data commit", () => {
  const runtime = stubBatchRuntime(
    [{ sku: "W0001" }],
    { W0001: [driveFile("old.jpg")] },
    { W0001: [githubFile("old.jpg", "old-sha")] },
    () => ({ found: true, files: [driveFile("new.jpg")] }),
  );
  sandbox.getDriveFileBytes = (fileId) => ({
    name: fileId === "drive-new.jpg" ? "new.jpg" : "old.jpg",
    bytes: [1, 2, 3],
  });
  sandbox.syncMedia();
  assert.equal(sandbox.__calls.filter((call) => call === "blob:image").length, 1);
  assert.equal(sandbox.__calls.filter((call) => call === "tree").length, 1);
  assert.equal(sandbox.__calls.filter((call) => call === "commit").length, 1);
  assert.equal(sandbox.__calls.filter((call) => call === "ref").length, 1);
  assert.ok(sandbox.__calls.indexOf("blob:image") < sandbox.__calls.indexOf("tree"));
  assert.ok(sandbox.__calls.indexOf("tree") < sandbox.__calls.indexOf("commit"));
  assert.ok(sandbox.__calls.indexOf("commit") < sandbox.__calls.indexOf("ref"));
  assert.equal(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1, undefined);
  assert.equal(runtime.triggers.length, 0);
});

test("syncMedia leaves the published tree unchanged when blob staging fails", () => {
  stubBatchRuntime(
    [{ sku: "W0001" }],
    { W0001: [driveFile("old.jpg")] },
    { W0001: [githubFile("old.jpg", "old-sha")] },
    () => ({ found: true, files: [driveFile("new.jpg")] }),
  );
  sandbox.getDriveFileBytes = () => ({ name: "new.jpg", bytes: [1, 2, 3] });
  const calls = sandbox.__calls;
  sandbox.createGitHubBlob = () => {
    calls.push("blob-failed");
    throw new Error("GitHub upload failed");
  };
  assert.throws(() => sandbox.syncMedia(), /GitHub upload failed/);
  assert.deepEqual(calls, ["blob-failed"]);
  assert.equal(calls.includes("tree"), false);
  assert.equal(calls.includes("ref"), false);
});

test("syncMedia preserves the manifest and avoids deletions when a SKU folder is missing", () => {
  const previousImages = [driveFile("1.jpg"), driveFile("2.jpg")];
  stubBatchRuntime(
    [{ sku: "W0027" }],
    { W0027: previousImages },
    {
      W0027: [
        githubFile("1.jpg", "sha-1", "W0027"),
        githubFile("2.jpg", "sha-2", "W0027"),
      ],
    },
    () => ({ found: false, files: [] }),
  );
  sandbox.deleteFile = () => sandbox.__calls.push("delete");
  const report = sandbox.syncMedia();
  // The missing Drive folder must neither delete images nor publish a no-op manifest.
  assert.deepEqual(sandbox.__calls, []);
  assert.equal(sandbox.__publishedManifest, undefined);
  assert.match(report, /W0027/);
});

test("syncMedia does not create a manifest commit for an unchanged batch", () => {
  const current = driveFile("1.jpg", "drive-1");
  const runtime = stubBatchRuntime(
    [{ sku: "W0001" }],
    { W0001: [current] },
    { W0001: [githubFile("1.jpg", "same-sha")] },
    () => ({ found: true, files: [current] }),
  );
  sandbox.getDriveFileBytes = () => {
    throw new Error("unchanged image bytes should not be read");
  };

  sandbox.syncMedia();

  assert.deepEqual(sandbox.__calls, []);
  assert.equal(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1, undefined);
  assert.equal(runtime.triggers.length, 0);
});

test("syncMedia publishes manifest metadata changes even when image bytes are unchanged", () => {
  const previous = driveFile("1.jpg", "drive-1");
  const current = {
    ...previous,
    updated: "2026-10-20T12:00:00.000Z",
  };
  stubBatchRuntime(
    [{ sku: "W0001" }],
    { W0001: [previous] },
    { W0001: [githubFile("1.jpg", "same-sha")] },
    () => ({ found: true, files: [current] }),
  );
  sandbox.getDriveFileBytes = () => ({ name: "1.jpg", bytes: [1, 2, 3] });
  sandbox.getGitHubBlobSha = () => "same-sha";

  sandbox.syncMedia();

  assert.deepEqual(sandbox.__calls, ["blob:text", "tree", "blob:text", "blob:text", "commit", "blob:text", "ref"]);
  assert.equal(sandbox.__publishedManifest.W0001[0].updated, current.updated);
});

test("buildCurrentMediaSyncPlan preserves missing SKU images and still plans healthy SKUs", () => {
  sandbox.getProducts = () => [{ sku: "W0027" }, { sku: "W0001" }];
  sandbox.getProductFilesResult = (sku) => {
    if (sku === "W0027") return { found: false, files: [] };
    return { found: true, files: [driveFile("new.jpg")] };
  };
  sandbox.getPublishedMediaManifest = () => ({
    W0027: [driveFile("1.jpg"), driveFile("2.jpg")],
  });
  sandbox.getRepositoryImages = () => ({
    W0027: [
      githubFile("1.jpg", "sha-1", "W0027"),
      githubFile("2.jpg", "sha-2", "W0027"),
    ],
    W0001: [],
  });

  const result = JSON.parse(JSON.stringify(buildCurrentMediaSyncPlan()));

  assert.equal(result.operations.length, 1);
  assert.equal(result.operations[0].action, "upload");
  assert.equal(result.operations[0].sku, "W0001");
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].sku, "W0027");
  assert.deepEqual(
    result.manifest.W0027.map((file) => file.name),
    ["1.jpg", "2.jpg"],
  );
});

test("mergeMediaManifests does not invent an empty entry when a missing SKU has no previous manifest", () => {
  const merged = JSON.parse(
    JSON.stringify(sandbox.mergeMediaManifests({}, {}, ["W0027"])),
  );

  assert.equal(Object.prototype.hasOwnProperty.call(merged, "W0027"), false);
});

test("metadata fast path skips downloading bytes for unchanged files", () => {
  assert.equal(
    sandbox.isMediaFileMetadataUnchanged(
      driveFile("1.webp", "same-id"),
      driveFile("1.webp", "same-id"),
    ),
    true,
  );
});

test("metadata comparison requires same Drive ID, size and updated timestamp", () => {
  const previous = driveFile("1.webp", "same-id");
  assert.equal(
    sandbox.isMediaFileMetadataUnchanged({ ...previous, size: 101 }, previous),
    false,
  );
  assert.equal(
    sandbox.isMediaFileMetadataUnchanged(
      { ...previous, updated: "2026-10-20T10:00:00.000Z" },
      previous,
    ),
    false,
  );
  assert.equal(
    sandbox.isMediaFileMetadataUnchanged(
      driveFile("1.webp", "different-id"),
      previous,
    ),
    false,
  );
});

test("current planner skips Drive byte reads when manifest metadata matches", () => {
  const current = driveFile("1.webp", "drive-1");
  sandbox.getProducts = () => [{ sku: "W0001" }];
  sandbox.getProductFilesResult = () => ({ found: true, files: [current] });
  sandbox.getPublishedMediaManifest = () => ({
    W0001: [driveFile("1.webp", "drive-1")],
  });
  sandbox.getRepositoryImages = () => ({
    W0001: [githubFile("1.webp", "same-blob")],
  });
  sandbox.getDriveFileBytes = () => {
    throw new Error("unchanged file bytes should not be read");
  };

  const result = JSON.parse(
    JSON.stringify(sandbox.buildCurrentMediaSyncPlan()),
  );
  assert.deepEqual(result.operations, []);
});

test("current planner hashes and uploads a same-name image when Drive metadata changed", () => {
  const current = {
    ...driveFile("1.webp", "drive-1"),
    updated: "2026-10-20T12:00:00.000Z",
  };
  sandbox.getProducts = () => [{ sku: "W0001" }];
  sandbox.getProductFilesResult = () => ({ found: true, files: [current] });
  sandbox.getPublishedMediaManifest = () => ({
    W0001: [
      {
        ...driveFile("1.webp", "drive-1"),
        updated: "2026-10-19T10:00:00.000Z",
      },
    ],
  });
  sandbox.getRepositoryImages = () => ({
    W0001: [githubFile("1.webp", "old-blob")],
  });
  sandbox.getDriveFileBytes = () => ({ name: "1.webp", bytes: [1, 2, 3] });
  sandbox.getGitHubBlobSha = () => "new-blob";

  const result = JSON.parse(
    JSON.stringify(sandbox.buildCurrentMediaSyncPlan()),
  );
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
    () => ({ found: true, files: [file] }),
  );
  runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1 = JSON.stringify({
    lastSku: "",
    startedAt: "2026-10-20T12:00:00.000Z",
    mode: "audit",
  });
  let byteReads = 0;
  sandbox.getDriveFileBytes = () => {
    byteReads += 1;
    return { name: "1.webp", bytes: [1, 2, 3] };
  };
  sandbox.getGitHubBlobSha = () => "new-blob";
  sandbox.publishFile = (fileToPublish) => sandbox.__calls.push("unexpected:" + fileToPublish.fileName);
  sandbox.syncMedia();
  assert.equal(byteReads, 1);
  assert.deepEqual(sandbox.__calls, ["blob:image", "blob:text", "tree", "blob:text", "blob:text", "commit", "blob:text", "ref"]);
  assert.equal(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1, undefined);
  assert.equal(runtime.triggers.length, 0);
});

test("syncMedia retries safely when Git tree creation fails", () => {
  const runtime = stubBatchRuntime(
    [{ sku: "W0001" }, { sku: "W0002" }],
    {},
    { W0001: [], W0002: [] },
    () => ({ found: true, files: [driveFile("1.webp")] }),
  );
  sandbox.createGitHubTree = () => {
    throw new Error("Git tree creation failed");
  };
  assert.throws(() => sandbox.syncMedia(), /Git tree creation failed/);

  const savedState = JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1);
  assert.equal(savedState.lastSku, "");
  assert.equal(savedState.retryCount, 1);
  assert.equal(savedState.lastError, "Git tree creation failed");
  assert.equal(runtime.triggers.length, 1);
  assert.ok(runtime.triggers[0].delayMs >= Date.parse(savedState.retryNotBeforeAt) - Date.now() - 10);
});

test("a legacy manifest gains githubSha without reuploading unchanged photos", () => {
  const driveImage = driveFile("1.jpg", "drive-1");
  const runtime = stubBatchRuntime(
    [{ sku: "W0001" }],
    { W0001: [{ ...driveImage }] },
    { W0001: [githubFile("1.jpg", "existing-blob")] },
    () => ({ found: true, files: [driveImage] }),
    { seedPublishedGitHubShas: false },
  );
  let byteReads = 0;
  const readStacks = [];
  sandbox.getDriveFileBytes = () => {
    byteReads += 1;
    readStacks.push(new Error().stack);
    return { name: "1.jpg", bytes: [1, 2, 3] };
  };
  sandbox.getGitHubBlobSha = () => "existing-blob";

  sandbox.syncMedia();

  assert.equal(byteReads, 1, readStacks.join("\n---\n"));
  assert.equal(sandbox.__calls.filter((call) => call === "blob:image").length, 0);
  const manifestsWritten = sandbox.__textBlobs.filter((content) => {
    try {
      const parsed = JSON.parse(content);
      return parsed.W0001 && parsed.W0001[0] && parsed.W0001[0].githubSha === "existing-blob";
    } catch (_error) {
      return false;
    }
  });
  assert.equal(manifestsWritten.length, 1);
  assert.equal(sandbox.__calls.filter((call) => call === "tree").length, 1);
  assert.equal(sandbox.__calls.filter((call) => call === "commit").length, 1);
  assert.equal(sandbox.__calls.filter((call) => call === "ref").length, 1);
  assert.equal(sandbox.__publishedManifest.W0001[0].githubSha, "existing-blob");

  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "DataGenerator.js"), "utf8"), sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "GitHub.js"), "utf8"), sandbox);
  sandbox.getExchangeRate = () => 1;
  sandbox.getMediaSyncInventory = () => ({ driveManifest: {}, missingDriveSkus: ["W0001"] });
  sandbox.getPublishedMediaManifest = () => sandbox.__publishedManifest;
  sandbox.publishFile = (file) => { sandbox.__publishedDataFile = file; };
  sandbox.publishDataJS([{
    id: "P0001", sku: "W0001", category: "Category", brand: "Brand",
    name: "Product", currency: "EUR", price: 10, sale: false,
    status: "active", dateAdded: "2026-11-05", description: "Description",
  }]);
  assert.match(sandbox.__publishedDataFile.content, /images\/W0001\/1\.jpg/);
});

test("truncated tree blocks syncMedia before deletions or publication", () => {
  const runtime = stubBatchRuntime(
    [{ sku: "W0001" }],
    { W0001: [driveFile("old.jpg")] },
    { W0001: [githubFile("old.jpg", "old-blob")] },
    () => ({ found: true, files: [] }),
  );
  sandbox.__treeTruncated = true;
  sandbox.deleteFile = () => sandbox.__calls.push("delete");

  assert.throws(() => sandbox.syncMedia(), /truncated tree/i);

  const status = JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATUS_V1);
  const state = JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1);
  assert.notEqual(status.status, "completed");
  assert.match(status.lastError, /truncated tree/i);
  assert.equal(state.status, "retry-pending");
  assert.equal(sandbox.__calls.includes("delete"), false);
  assert.equal(sandbox.__calls.includes("tree"), false);
  assert.equal(sandbox.__calls.includes("commit"), false);
  assert.equal(sandbox.__calls.includes("ref"), false);
  sandbox.__treeTruncated = false;
});

test("recovery refuses to publish when the current tree is truncated", () => {
  const runtime = stubBatchRuntime([{ sku: "W0001" }], {}, {}, () => ({
    found: true,
    files: [],
  }));
  const products = [{ sku: "W0001" }];
  const claim = {
    state: { runId: "recovery-truncated", mode: "normal", startedAt: new Date().toISOString() },
  };
  const checkpoint = sandbox.mediaSyncCreateCheckpoint(
    claim,
    products,
    { commitSha: "base-commit", treeSha: "base-tree" },
    { tree: [] },
    {},
  );
  checkpoint.phase = "commit-created";
  checkpoint.targetCommitSha = "unpublished-commit";
  checkpoint.effects = [{ path: "images/W0001/1.jpg", sha: "blob-1" }];
  const checkpointText = JSON.stringify(checkpoint);
  const checkpointSha = gitBlobSha(checkpointText);
  runtime.blobContents.set(checkpointSha, checkpointText);
  runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1 = JSON.stringify({
    version: 3,
    runId: checkpoint.runId,
    checkpointSha,
    phase: "commit-created",
    baseCommitSha: "base-commit",
    targetCommitSha: "unpublished-commit",
    lastSku: "",
    startedAt: checkpoint.startedAt,
    mode: "normal",
    retryCount: 0,
    generation: 0,
    activeRunId: "",
    leaseExpiresAt: "",
    status: "pending",
  });
  sandbox.__treeTruncated = true;

  assert.throws(() => sandbox.continueMediaSync(), /truncated tree/i);
  assert.equal(sandbox.__calls.includes("ref"), false);
  assert.equal(sandbox.__calls.includes("commit"), false);
  assert.equal(
    JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATUS_V1).status,
    "retry-pending",
  );
  sandbox.__treeTruncated = false;
});

test("commit creation is idempotent if checkpoint save is interrupted", () => {
  const runtime = stubBatchRuntime(
    [{ sku: "W0001" }],
    {},
    {},
    () => ({ found: true, files: [driveFile("1.jpg", "drive-1")] }),
  );
  sandbox.getDriveFileBytes = () => ({ name: "1.jpg", bytes: [1, 2, 3] });
  const originalSave = sandbox.mediaSyncSaveActiveCheckpoint;
  let interruptOnce = true;
  sandbox.mediaSyncSaveActiveCheckpoint = (checkpoint, claim) => {
    if (checkpoint.phase === "commit-created" && interruptOnce) {
      interruptOnce = false;
      throw new Error("simulated interruption before commit SHA checkpoint");
    }
    return originalSave(checkpoint, claim);
  };

  assert.throws(
    () => sandbox.syncMedia(),
    /simulated interruption before commit SHA checkpoint/,
  );
  const pending = JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1);
  assert.equal(pending.phase, "tree-created");
  assert.equal(pending.targetCommitSha, "");
  const persistedCheckpoint = sandbox.mediaSyncReadCheckpoint(pending);
  assert.equal(persistedCheckpoint.phase, "tree-created");
  assert.equal(persistedCheckpoint.targetTreeSha, "tree-1");

  expireMediaSyncRetry(runtime);
  const report = sandbox.continueMediaSync();

  sandbox.mediaSyncSaveActiveCheckpoint = originalSave;
  assert.match(report, /completed/i);
  assert.equal(runtime.commitObjects.size, 1);
  assert.equal(sandbox.__calls.filter((call) => call === "commit").length, 2);
  assert.equal(sandbox.__calls.filter((call) => call === "ref").length, 1);
  assert.equal(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1, undefined);
});

test("branch race fails safely and retry replans from the external head", () => {
  const runtime = stubBatchRuntime(
    [{ sku: "W0001" }],
    {},
    {},
    () => ({ found: true, files: [driveFile("1.jpg", "drive-1")] }),
  );
  sandbox.getDriveFileBytes = () => ({ name: "1.jpg", bytes: [1, 2, 3] });
  const originalUpdate = sandbox.updateGitHubBranchRef;
  let raced = false;
  sandbox.updateGitHubBranchRef = (sha, expectedHead) => {
    if (!raced) {
      raced = true;
      assert.equal(sandbox.getGitHubBranchSnapshot().commitSha, expectedHead);
      runtime.setExternalBranch("external-head", {
        path: "images/W0999/remote.jpg",
        mode: "100644",
        type: "blob",
        sha: "remote-blob",
        size: 10,
      });
      const error = new Error("branch changed between HEAD check and PATCH");
      error.code = "GITHUB_CONFLICT";
      throw error;
    }
    return originalUpdate(sha, expectedHead);
  };

  assert.throws(() => sandbox.syncMedia(), /between HEAD check and PATCH/);
  assert.equal(sandbox.getGitHubBranchSnapshot().commitSha, "external-head");
  assert.equal(
    JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1).status,
    "retry-pending",
  );

  expireMediaSyncRetry(runtime);
  const report = sandbox.continueMediaSync();
  const commitPayloads = Array.from(runtime.commitObjects.keys()).map((key) => JSON.parse(key));
  assert.match(report, /completed/i);
  assert.equal(commitPayloads.some((payload) => payload.parentSha === "external-head"), true);
  assert.equal(runtime.getCurrentTree().some((item) => item.path === "images/W0999/remote.jpg"), true);
  assert.equal(sandbox.getGitHubBranchSnapshot().commitSha.startsWith("commit-object-"), true);
  sandbox.updateGitHubBranchRef = originalUpdate;
});

test("replaces a listed continuation trigger when execution yields", () => {
  const products = [
    { sku: "W0001" },
    { sku: "W0002" },
    { sku: "W0003" },
    { sku: "W0004" },
  ];
  const runtime = stubBatchRuntime(products, {}, {}, () => ({
    found: true,
    files: [],
  }));
  sandbox.MEDIA_SYNC_TIME_BUDGET_MS = 0;
  const executingTrigger = {
    getHandlerFunction: () => "continueMediaSync",
  };
  runtime.triggers.push(executingTrigger);

  sandbox.syncMedia();

  assert.equal(runtime.triggers.length, 1);
  assert.notEqual(runtime.triggers[0], executingTrigger);
  assert.equal(runtime.triggers[0].getHandlerFunction(), "continueMediaSync");
  assert.equal(
    JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1).phase,
    "inventory",
  );
});

test("clears state and triggers on the last non-empty batch", () => {
  const runtime = stubBatchRuntime(
    [{ sku: "W0001" }, { sku: "W0002" }, { sku: "W0003" }],
    {},
    {},
    () => ({ found: true, files: [] }),
  );
  runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1 = JSON.stringify({
    lastSku: "W0002",
    startedAt: "2026-10-25T00:00:00.000Z",
  });
  runtime.triggers.push({
    getHandlerFunction: () => "continueMediaSync",
  });

  sandbox.continueMediaSync();

  assert.equal(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1, undefined);
  assert.equal(runtime.triggers.length, 0);
  assert.ok(sandbox.__calls.includes("tree"));
  assert.ok(sandbox.__calls.includes("commit"));
  assert.ok(sandbox.__calls.includes("ref"));
  assert.equal(sandbox.__calls.includes("blob:image"), false);
});

test("publishes a 70-SKU catalog with 280 images in one Git Data commit", () => {
  const products = Array.from({ length: 70 }, (_, index) => ({
    sku: "W" + String(index + 1).padStart(4, "0"),
  }));
  const imageCountBySku = new Map();
  products.forEach((product) => imageCountBySku.set(product.sku, 4));

  const runtime = stubBatchRuntime(products, {}, {}, (sku) => ({
    found: true,
    files: Array.from({ length: imageCountBySku.get(sku) }, (_, imageIndex) =>
      driveFile(imageIndex + 1 + ".webp", sku + "-image-" + (imageIndex + 1)),
    ),
  }));

  sandbox.getDriveFileBytes = (fileId) => ({
    name: fileId.split("-image-")[1] + ".webp",
    bytes: [1, 2, 3],
  });
  sandbox.syncMedia();
  assert.equal(sandbox.__calls.filter((call) => call === "blob:image").length, 280);
  assert.equal(sandbox.__calls.filter((call) => call === "commit").length, 1);
  assert.equal(sandbox.__calls.filter((call) => call === "ref").length, 1);
  assert.equal(runtime.triggers.length, 0);
  assert.equal(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1, undefined);
  const diagnostics = JSON.parse(
    runtime.properties.PREVIA_MEDIA_SYNC_DIAGNOSTICS_V1,
  );

  assert.equal(diagnostics.status, "completed");
  assert.equal(diagnostics.mode, "normal");

  assert.equal(diagnostics.driveSkus, 70);
  assert.equal(diagnostics.uploadCount, 280);

  assert.ok(diagnostics.completedAt);
  const report = sandbox.logMediaSyncDiagnostics();

  assert.equal(report.status, "completed");
  assert.equal(report.driveSkus, 70);
  assert.equal(report.uploadCount, 280);
});

test("a full-cycle Drive failure schedules a delayed retry", () => {
  const products = [
    { sku: "W0001" },
    { sku: "W0002" },
    { sku: "W0003" },
    { sku: "W0004" },
  ];
  const runtime = stubBatchRuntime(products, {}, {}, () => ({
    found: true,
    files: [],
  }));

  sandbox.getProductFilesResult = () => {
    throw new Error("temporary Drive outage");
  };
  assert.throws(() => sandbox.syncMedia(), /temporary Drive outage/);

  const state = JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1);
  assert.equal(state.retryCount, 1);
  assert.match(state.lastError, /temporary Drive outage/);
  assert.equal(runtime.triggers.length, 1);
  assert.equal(runtime.triggers[0].getHandlerFunction(), "continueMediaSync");
  assert.ok(runtime.triggers[0].delayMs >= Date.parse(state.retryNotBeforeAt) - Date.now() - 10);
});

test("a transient failure can recover and finish the full cycle", () => {
  const products = [
    { sku: "W0001" },
    { sku: "W0002" },
    { sku: "W0003" },
    { sku: "W0004" },
  ];
  const healthyDriveResult = () => ({ found: true, files: [] });
  const runtime = stubBatchRuntime(products, {}, {}, healthyDriveResult);

  sandbox.getProductFilesResult = () => {
    throw new Error("temporary GitHub/Drive failure");
  };
  assert.throws(
    () => sandbox.syncMedia(),
    /temporary GitHub\/Drive failure/,
  );
  assert.equal(
    JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1).retryCount,
    1,
  );

  sandbox.getProductFilesResult = healthyDriveResult;
  expireMediaSyncRetry(runtime);
  sandbox.continueMediaSync();

  assert.equal(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1, undefined);
  assert.equal(runtime.triggers.length, 0);
});

test("persistent failures stop after the configured retry limit and remove pending triggers", () => {
  const runtime = stubBatchRuntime([{ sku: "W0001" }], {}, {}, () => {
    throw new Error("permanent permission denied");
  });

  const maxRetries = vm.runInContext("MEDIA_SYNC_MAX_RETRIES", sandbox);
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    expireMediaSyncRetry(runtime);
    assert.throws(() => sandbox.syncMedia(), /permanent permission denied/);
    const state = JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1);
    assert.equal(state.retryCount, attempt);
    assert.equal(runtime.triggers.length, 1);
  }

  expireMediaSyncRetry(runtime);
  assert.throws(() => sandbox.syncMedia(), /permanent permission denied/);
  const failedState = JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1);
  assert.equal(failedState.status, "failed");
  assert.equal(failedState.lastSku, "");
  assert.equal(runtime.triggers.length, 0);
  const status = JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATUS_V1);
  assert.equal(status.status, "failed");
});

test("lock contention leaves triggers untouched when the state lock cannot be acquired", () => {
  const runtime = stubBatchRuntime(
    [{ sku: "W0001" }, { sku: "W0002" }, { sku: "W0003" }, { sku: "W0004" }],
    {},
    {},
    () => ({ found: true, files: [] }),
  );
  runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1 = JSON.stringify({
    lastSku: "W0003",
    startedAt: "2026-10-25T00:00:00.000Z",
    retryCount: 0,
  });
  sandbox.LockService = {
    getScriptLock: () => ({ tryLock: () => false, releaseLock() {} }),
  };

  const report = sandbox.syncMedia();

  assert.match(report, /already running/);
  assert.equal(
    JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1).lastSku,
    "W0003",
  );
  assert.equal(
    runtime.triggers.length,
    0,
    "trigger mutation must not happen outside the state lock",
  );
});

test("an orphaned continuation trigger does not restart a completed full sync", () => {
  const runtime = stubBatchRuntime([{ sku: "W0001" }], {}, {}, () => ({
    found: true,
    files: [],
  }));
  runtime.triggers.push({ getHandlerFunction: () => "continueMediaSync" });

  const report = sandbox.continueMediaSync();

  assert.equal(report, "No pending media synchronization.");
  assert.equal(runtime.triggers.length, 0);
  assert.deepEqual(sandbox.__calls, []);
});

test("an active state lease prevents a competing run from touching the same batch", () => {
  const runtime = stubBatchRuntime(
    [{ sku: "W0001" }, { sku: "W0002" }],
    {},
    {},
    () => ({ found: true, files: [] }),
  );
  runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1 = JSON.stringify({
    lastSku: "",
    startedAt: "2026-10-27T00:00:00.000Z",
    generation: 7,
    activeRunId: "other-run",
    leaseExpiresAt: "2099-01-01T00:00:00.000Z",
    status: "running",
  });

  const report = sandbox.syncMedia();

  assert.match(report, /already running/);
  assert.equal(
    runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1 &&
      JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1).lastSku,
    "",
  );
  assert.deepEqual(sandbox.__calls, []);
});

test("a stale run cannot finalize over a newer generation", () => {
  const runtime = stubBatchRuntime([], {}, {}, () => ({
    found: true,
    files: [],
  }));
  runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1 = JSON.stringify({
    lastSku: "W0006",
    startedAt: "2026-10-27T00:00:00.000Z",
    generation: 12,
    activeRunId: "new-run",
    leaseExpiresAt: "2099-01-01T00:00:00.000Z",
    status: "running",
  });

  const result = sandbox.finalizeMediaSyncRun("old-run", 11, {
    complete: false,
    lastSku: "W0003",
  });

  assert.equal(result.committed, false);
  const state = JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1);
  assert.equal(state.lastSku, "W0006");
  assert.equal(state.activeRunId, "new-run");
});

test("a continuation scheduling error is recorded as failure, not success", () => {
  const runtime = stubBatchRuntime(
    [{ sku: "W0001" }, { sku: "W0002" }, { sku: "W0003" }, { sku: "W0004" }],
    {},
    {},
    () => ({ found: true, files: [] }),
  );
  sandbox.ScriptApp.newTrigger = () => ({
    timeBased() {
      return this;
    },
    after() {
      return this;
    },
    create() {
      throw new Error("trigger quota exceeded");
    },
  });
  sandbox.MEDIA_SYNC_TIME_BUDGET_MS = 0;

  assert.throws(
    () => sandbox.syncMedia(),
    /trigger quota exceeded/,
  );
  const state = JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1);
  assert.equal(state.phase, "inventory");
  assert.equal(state.status, "failed");
  const status = JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATUS_V1);
  assert.equal(status.status, "failed");
});

test("normal completion clears active state and records a completed dashboard status", () => {
  const runtime = stubBatchRuntime([{ sku: "W0001" }], {}, {}, () => ({
    found: true,
    files: [],
  }));

  sandbox.syncMedia();

  assert.equal(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1, undefined);
  const status = JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATUS_V1);
  assert.equal(status.status, "completed");
  const diagnostics = JSON.parse(
    runtime.properties.PREVIA_MEDIA_SYNC_DIAGNOSTICS_V1,
  );

  assert.equal(diagnostics.status, "completed");
  assert.equal(diagnostics.mode, "normal");
  assert.ok(diagnostics.startedAt);
  assert.ok(diagnostics.completedAt);

  assert.equal(diagnostics.driveSkus, 1);
  assert.equal(diagnostics.uploadCount, 0);
});

test("a state-save error aborts before Drive or GitHub work begins", () => {
  const runtime = stubBatchRuntime([{ sku: "W0001" }], {}, {}, () => ({
    found: true,
    files: [],
  }));
  sandbox.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key) => runtime.properties[key] || null,
      setProperty: (key) => {
        if (key === "PREVIA_MEDIA_SYNC_STATE_V1") {
          throw new Error("state write failed");
        }
      },
      deleteProperty() {},
    }),
  };

  assert.throws(() => sandbox.syncMedia(), /state write failed/);
  assert.deepEqual(sandbox.__calls, []);
});

test("a diagnostics write error does not interrupt media synchronization", () => {
  const runtime = stubBatchRuntime([{ sku: "W0001" }], {}, {}, () => ({
    found: true,
    files: [],
  }));

  sandbox.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key) => runtime.properties[key] || null,
      setProperty: (key, value) => {
        if (key === "PREVIA_MEDIA_SYNC_DIAGNOSTICS_V1") {
          throw new Error("diagnostics write failed");
        }
        runtime.properties[key] = value;
      },
      deleteProperty: (key) => {
        delete runtime.properties[key];
      },
    }),
  };

  const report = sandbox.syncMedia();

  assert.match(report, /Media synchronization completed/);
  assert.equal(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1, undefined);

  const status = JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATUS_V1);
  assert.equal(status.status, "completed");
});

test("a diagnostics read error does not interrupt media synchronization", () => {
  const runtime = stubBatchRuntime([{ sku: "W0001" }], {}, {}, () => ({
    found: true,
    files: [],
  }));

  sandbox.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key) => {
        if (key === "PREVIA_MEDIA_SYNC_DIAGNOSTICS_V1") {
          throw new Error("diagnostics read failed");
        }
        return runtime.properties[key] || null;
      },
      setProperty: (key, value) => {
        runtime.properties[key] = value;
      },
      deleteProperty: (key) => {
        delete runtime.properties[key];
      },
    }),
  };

  const report = sandbox.syncMedia();

  assert.match(report, /Media synchronization completed/);

  const state = JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATUS_V1);
  assert.equal(state.status, "completed");
});

test("a malformed diagnostics structure does not interrupt media synchronization", () => {
  const runtime = stubBatchRuntime([{ sku: "W0001" }], {}, {}, () => ({
    found: true,
    files: [],
  }));

  sandbox.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key) => {
        if (key === "PREVIA_MEDIA_SYNC_DIAGNOSTICS_V1") {
          return JSON.stringify({
            version: 1,
            mode: "normal",
            status: "running",
            batches: null,
            totalDurationMs: 0,
          });
        }
        return runtime.properties[key] || null;
      },
      setProperty: (key, value) => {
        runtime.properties[key] = value;
      },
      deleteProperty: (key) => {
        delete runtime.properties[key];
      },
    }),
  };

  const report = sandbox.syncMedia();

  assert.match(report, /Media synchronization completed/);
  assert.equal(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1, undefined);

  const status = JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATUS_V1);
  assert.equal(status.status, "completed");
});

test("diagnostics report handles a non-array batches structure", () => {
  sandbox.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (key) => {
        if (key === "PREVIA_MEDIA_SYNC_DIAGNOSTICS_V1") {
          return JSON.stringify({
            version: 1,
            mode: "normal",
            status: "completed",
            batches: {},
            totalDurationMs: 1500,
          });
        }
        return null;
      },
    }),
  };

  const report = sandbox.logMediaSyncDiagnostics();

  assert.equal(report.totalBatches, 0);
  assert.equal(report.totalProcessedSkus, 0);
  assert.equal(report.totalWaitTimeMs, 0);
  assert.equal(Array.isArray(report.batches), true);
  assert.equal(report.batches.length, 0);
});

test("lost ownership after ref publication retains recoverable commit checkpoint", () => {
  const runtime = stubBatchRuntime(
    [{ sku: "W0001" }, { sku: "W0002" }, { sku: "W0003" }, { sku: "W0004" }],
    {},
    {},
    () => ({ found: true, files: [driveFile("1.webp", "image-1")] }),
  );
  sandbox.getDriveFileBytes = () => ({ name: "1.webp", bytes: [1, 2, 3] });
  const originalFinalize = sandbox.finalizeMediaSyncRun;
  sandbox.finalizeMediaSyncRun = () => ({ committed: false });

  const report = sandbox.syncMedia();

  sandbox.finalizeMediaSyncRun = originalFinalize;
  assert.match(report, /pending confirmation/);
  assert.equal(sandbox.__calls.includes("ref"), true);
  const state = JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1);
  assert.ok(state.checkpointSha);
  assert.equal(state.status, "running");
  const commitCallsBeforeRecovery = sandbox.__calls.filter((call) => call === "commit").length;
  const refCallsBeforeRecovery = sandbox.__calls.filter((call) => call === "ref").length;
  state.activeRunId = "";
  state.leaseExpiresAt = "";
  state.status = "pending";
  runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1 = JSON.stringify(state);

  const recovered = sandbox.continueMediaSync();

  assert.match(recovered, /completed/i);
  assert.equal(sandbox.__calls.filter((call) => call === "commit").length, commitCallsBeforeRecovery);
  assert.equal(sandbox.__calls.filter((call) => call === "ref").length, refCallsBeforeRecovery);
  assert.equal(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1, undefined);
});

test("a brief state-lock collision schedules a continuation that can resume", () => {
  const runtime = stubBatchRuntime(
    [{ sku: "W0001" }, { sku: "W0002" }, { sku: "W0003" }, { sku: "W0004" }],
    {},
    {},
    () => ({ found: true, files: [] }),
  );
  runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1 = JSON.stringify({
    lastSku: "",
    startedAt: "2026-10-27T00:00:00.000Z",
    generation: 0,
    activeRunId: "",
    leaseExpiresAt: "",
    status: "pending",
  });
  sandbox.MEDIA_SYNC_TIME_BUDGET_MS = 0;
  let attempts = 0;
  sandbox.LockService = {
    getScriptLock: () => ({
      tryLock: () => {
        attempts += 1;
        return attempts > 1;
      },
      releaseLock() {},
    }),
  };

  const firstReport = sandbox.syncMedia();

  assert.match(firstReport, /already running/);
  assert.equal(runtime.triggers.length, 1);
  assert.ok(runtime.triggers[0].delayMs >= 5 * 60 * 1000 - 10);

  const resumedReport = sandbox.continueMediaSync();
  assert.match(resumedReport, /continuing automatically|Media synchronization/);
  const state = JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1);
  assert.equal(state.phase, "inventory");
});

test("an active lease keeps one recovery trigger and resumes after expiry", () => {
  const runtime = stubBatchRuntime(
    [{ sku: "W0001" }, { sku: "W0002" }, { sku: "W0003" }, { sku: "W0004" }],
    {},
    {},
    () => ({ found: true, files: [] }),
  );
  runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1 = JSON.stringify({
    lastSku: "",
    startedAt: "2026-10-27T00:00:00.000Z",
    generation: 7,
    activeRunId: "stalled-run",
    leaseExpiresAt: "2099-01-01T00:00:00.000Z",
    status: "running",
  });
  sandbox.MEDIA_SYNC_TIME_BUDGET_MS = 0;

  const report = sandbox.syncMedia();

  assert.match(report, /already running/);
  assert.equal(runtime.triggers.length, 1);
  assert.equal(runtime.triggers[0].getHandlerFunction(), "continueMediaSync");

  const expired = JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1);
  expired.leaseExpiresAt = "2000-01-01T00:00:00.000Z";
  runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1 = JSON.stringify(expired);

  const resumed = sandbox.continueMediaSync();

  assert.match(resumed, /continuing automatically|Media synchronization/);
  const state = JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1);
  assert.equal(state.phase, "inventory");
  assert.ok(runtime.triggers.length <= 1);
});

test("an unconfirmed empty completion remains recoverable instead of reporting success", () => {
  const runtime = stubBatchRuntime([{ sku: "W0001" }], {}, {}, () => ({
    found: true,
    files: [],
  }));
  runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1 = JSON.stringify({
    lastSku: "W0001",
    startedAt: "2026-10-27T00:00:00.000Z",
    generation: 0,
    activeRunId: "",
    leaseExpiresAt: "",
    status: "pending",
  });

  // Добавляем начальное состояние диагностики для этого теста.
  runtime.properties.PREVIA_MEDIA_SYNC_DIAGNOSTICS_V1 = JSON.stringify({
    version: 1,
    mode: "normal",
    startedAt: "2026-10-27T00:00:00.000Z",
    completedAt: "",
    status: "running",
    batches: [],
    totalDurationMs: 0,
  });
  const originalFinalize = sandbox.finalizeMediaSyncRun;
  sandbox.finalizeMediaSyncRun = () => ({ committed: false, reason: "lock" });

  const report = sandbox.syncMedia();

  sandbox.finalizeMediaSyncRun = originalFinalize;
  assert.match(report, /pending confirmation/);
  assert.notEqual(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1, undefined);
  assert.equal(runtime.triggers.length, 1);
  const diagnostics = JSON.parse(
    runtime.properties.PREVIA_MEDIA_SYNC_DIAGNOSTICS_V1,
  );

  assert.notEqual(diagnostics.status, "completed");
  assert.equal(diagnostics.status === "completed", false);

  const abandoned = JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1);
  abandoned.leaseExpiresAt = "2000-01-01T00:00:00.000Z";
  runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1 = JSON.stringify(abandoned);

  const recovered = sandbox.continueMediaSync();

  assert.match(recovered, /completed/);
  assert.equal(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1, undefined);
  assert.equal(runtime.triggers.length, 0);
});

test("successful empty completion records completed diagnostics", () => {
  const runtime = stubBatchRuntime([{ sku: "W0001" }], {}, {}, () => ({
    found: true,
    files: [],
  }));

  runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1 = JSON.stringify({
    lastSku: "W0001",
    startedAt: "2026-10-27T00:00:00.000Z",
    generation: 0,
    activeRunId: "",
    leaseExpiresAt: "",
    status: "pending",
  });

  runtime.properties.PREVIA_MEDIA_SYNC_DIAGNOSTICS_V1 = JSON.stringify({
    version: 1,
    mode: "normal",
    startedAt: "2026-10-27T00:00:00.000Z",
    completedAt: "",
    status: "running",
    batches: [],
    totalDurationMs: 0,
  });

  const report = sandbox.syncMedia();

  assert.match(report, /completed/);
  assert.equal(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1, undefined);

  const diagnostics = JSON.parse(
    runtime.properties.PREVIA_MEDIA_SYNC_DIAGNOSTICS_V1,
  );

  assert.equal(diagnostics.status, "completed");
  assert.ok(diagnostics.completedAt);
  assert.equal(diagnostics.driveSkus, 1);
});

test("a stale generation cannot replace the current generation's continuation", () => {
  const runtime = stubBatchRuntime([], {}, {}, () => ({
    found: true,
    files: [],
  }));
  runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1 = JSON.stringify({
    lastSku: "W0003",
    startedAt: "2026-10-27T00:00:00.000Z",
    generation: 9,
    activeRunId: "",
    leaseExpiresAt: "",
    status: "pending",
  });
  const currentTrigger = {
    getHandlerFunction: () => "continueMediaSync",
    marker: "generation-9",
  };
  runtime.triggers.push(currentTrigger);

  const result = sandbox.ensureMediaSyncContinuationForGeneration(8, 60 * 1000);

  assert.equal(result.scheduled, false);
  assert.equal(result.reason, "superseded");
  assert.equal(runtime.triggers.length, 1);
  assert.equal(runtime.triggers[0], currentTrigger);
});

test("repeated scheduling requests leave exactly one continuation trigger", () => {
  const runtime = stubBatchRuntime([], {}, {}, () => ({
    found: true,
    files: [],
  }));
  runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1 = JSON.stringify({
    lastSku: "W0003",
    startedAt: "2026-10-27T00:00:00.000Z",
    generation: 4,
    activeRunId: "",
    leaseExpiresAt: "",
    status: "pending",
  });

  const first = sandbox.ensureMediaSyncContinuationForGeneration(4, 60 * 1000);
  const firstTrigger = runtime.triggers[0];
  const second = sandbox.ensureMediaSyncContinuationForGeneration(4, 60 * 1000);

  assert.equal(first.scheduled, true);
  assert.equal(second.scheduled, true);
  assert.equal(runtime.triggers.length, 1);
  assert.notEqual(runtime.triggers[0], firstTrigger);
  assert.equal(runtime.triggers[0].getHandlerFunction(), "continueMediaSync");
  assert.equal(runtime.triggers[0].delayMs, 60 * 1000);
});

test("generation-aware scheduling refuses to replace a trigger while a run owns the state", () => {
  const runtime = stubBatchRuntime([], {}, {}, () => ({
    found: true,
    files: [],
  }));
  runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1 = JSON.stringify({
    lastSku: "W0003",
    startedAt: "2026-10-27T00:00:00.000Z",
    generation: 5,
    activeRunId: "active-run",
    leaseExpiresAt: "2099-01-01T00:00:00.000Z",
    status: "running",
  });
  const existing = {
    getHandlerFunction: () => "continueMediaSync",
    marker: "watchdog",
  };
  runtime.triggers.push(existing);

  const result = sandbox.ensureMediaSyncContinuationForGeneration(5, 60 * 1000);

  assert.equal(result.scheduled, false);
  assert.equal(result.reason, "superseded");
  assert.equal(runtime.triggers.length, 1);
  assert.equal(runtime.triggers[0], existing);
});

test("an orphaned continuation removes only continuation triggers under the state lock", () => {
  const runtime = stubBatchRuntime([], {}, {}, () => ({
    found: true,
    files: [],
  }));
  runtime.triggers.push(
    { getHandlerFunction: () => "continueMediaSync" },
    { getHandlerFunction: () => "startMediaSyncAudit" },
  );

  const report = sandbox.continueMediaSync();

  assert.equal(report, "No pending media synchronization.");
  assert.equal(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1, undefined);
  assert.equal(runtime.triggers.length, 1);
  assert.equal(runtime.triggers[0].getHandlerFunction(), "startMediaSyncAudit");
});

test("lock contention does not mutate triggers when the state lock remains unavailable", () => {
  const runtime = stubBatchRuntime([], {}, {}, () => ({
    found: true,
    files: [],
  }));
  runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1 = JSON.stringify({
    lastSku: "W0003",
    startedAt: "2026-10-27T00:00:00.000Z",
    generation: 3,
    activeRunId: "",
    leaseExpiresAt: "",
    status: "pending",
  });
  const existing = {
    getHandlerFunction: () => "continueMediaSync",
    marker: "existing",
  };
  runtime.triggers.push(existing);
  sandbox.LockService = {
    getScriptLock: () => ({ tryLock: () => false, releaseLock() {} }),
  };

  sandbox.scheduleMediaSyncLockContentionRetry();

  assert.equal(runtime.triggers.length, 1);
  assert.equal(runtime.triggers[0], existing);
  assert.equal(
    JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1).lastSku,
    "W0003",
  );
});

test("automatic continuation does not restart a terminally failed sync", () => {
  const runtime = stubBatchRuntime([{ sku: "W0001" }], {}, {}, () => {
    throw new Error("should not run after terminal failure");
  });
  runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1 = JSON.stringify({
    lastSku: "",
    startedAt: "2026-10-27T00:00:00.000Z",
    retryCount: 4,
    generation: 8,
    activeRunId: "",
    leaseExpiresAt: "",
    status: "failed",
    lastError: "permanent permission denied",
  });
  runtime.triggers.push({ getHandlerFunction: () => "continueMediaSync" });

  const report = sandbox.continueMediaSync();

  assert.match(report, /requires manual recovery/);
  assert.equal(
    JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1).status,
    "failed",
  );
  assert.deepEqual(sandbox.__calls, []);
  assert.equal(runtime.triggers.length, 0);
});

test("a stale continuation does not revive a sync marked failed after scheduling error", () => {
  const runtime = stubBatchRuntime([{ sku: "W0001" }], {}, {}, () => {
    throw new Error("should not run after scheduling failure");
  });
  runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1 = JSON.stringify({
    lastSku: "W0001",
    startedAt: "2026-10-27T00:00:00.000Z",
    retryCount: 1,
    generation: 9,
    activeRunId: "",
    leaseExpiresAt: "",
    status: "failed",
    lastError: "trigger quota exceeded",
  });
  runtime.triggers.push({ getHandlerFunction: () => "continueMediaSync" });

  const report = sandbox.continueMediaSync();

  assert.match(report, /requires manual recovery/);
  assert.equal(
    JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1).generation,
    9,
  );
  assert.equal(
    JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1).status,
    "failed",
  );
  assert.deepEqual(sandbox.__calls, []);
  assert.equal(runtime.triggers.length, 0);
});

test("manual syncMedia invocation can explicitly recover a failed sync", () => {
  const runtime = stubBatchRuntime([{ sku: "W0001" }], {}, {}, () => ({
    found: true,
    files: [],
  }));
  runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1 = JSON.stringify({
    lastSku: "",
    startedAt: "2026-10-27T00:00:00.000Z",
    retryCount: 4,
    generation: 8,
    activeRunId: "",
    leaseExpiresAt: "",
    status: "failed",
    lastError: "previous failure",
  });

  const report = sandbox.syncMedia();

  assert.match(report, /completed/i);
  assert.equal(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1, undefined);
  assert.equal(
    JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATUS_V1).status,
    "completed",
  );
});

test("a continuation cannot create a fresh sync state after another run completed", () => {
  const runtime = stubBatchRuntime([{ sku: "W0001" }], {}, {}, () => ({
    found: true,
    files: [],
  }));
  runtime.triggers.push({ getHandlerFunction: () => "continueMediaSync" });

  const report = sandbox.continueMediaSync();

  assert.equal(report, "No pending media synchronization.");
  assert.equal(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1, undefined);
  assert.deepEqual(sandbox.__calls, []);
  assert.equal(runtime.triggers.length, 0);
});

test("a failed retry-trigger creation records an explicit scheduling failure", () => {
  const runtime = stubBatchRuntime([{ sku: "W0001" }], {}, {}, () => {
    throw new Error("temporary Drive outage");
  });
  let triggerAttempts = 0;
  sandbox.ScriptApp.newTrigger = (handler) => ({
    timeBased() {
      return this;
    },
    after(delayMs) {
      this.delayMs = delayMs;
      return this;
    },
    create() {
      triggerAttempts += 1;
      throw new Error("trigger quota exceeded");
    },
  });

  assert.throws(() => sandbox.syncMedia(), /temporary Drive outage/);
  const state = JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1);
  const status = JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATUS_V1);
  assert.equal(triggerAttempts, 1);
  assert.equal(state.retryCount, 1);
  assert.equal(state.status, "failed");
  assert.match(state.lastError, /trigger quota exceeded/);
  assert.equal(status.status, "failed");
  assert.match(status.message, /manual recovery/);
});

test("deferred continuation scheduling failure preserves the checkpoint and requires manual recovery", () => {
  const runtime = stubBatchRuntime([{ sku: "W0001" }], {}, {}, () => {
    throw new Error("Drive inventory must not run before retry deadline");
  });
  const retryNotBeforeAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const initialState = {
    version: 3, runId: "deferred-failure-run", checkpointSha: "confirmed-checkpoint-sha",
    phase: "inventory", baseCommitSha: "base-commit", planFingerprint: "fingerprint",
    targetCommitSha: "", targetTreeSha: "", lastSku: "W0000", startedAt: "started",
    mode: "normal", retryCount: 2, generation: 31, activeRunId: "",
    leaseExpiresAt: "", status: "retry-pending", lastError: "rate limited",
    lastFailureAt: "previous-failure", retryNotBeforeAt,
  };
  runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1 = JSON.stringify(initialState);
  let triggerAttempts = 0;
  sandbox.ScriptApp.newTrigger = () => ({
    timeBased() { return this; },
    after() { return this; },
    create() {
      triggerAttempts += 1;
      throw new Error("trigger quota exceeded");
    },
  });

  const result = sandbox.continueMediaSync();

  assert.match(result, /manual recovery is required/i);
  assert.equal(triggerAttempts, 1);
  assert.deepEqual(sandbox.__calls, []);
  assert.equal(runtime.triggers.length, 0);
  const state = JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1);
  const status = JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATUS_V1);
  assert.equal(state.status, "failed");
  assert.match(state.lastError, /manual recovery is required/i);
  assert.equal(state.checkpointSha, initialState.checkpointSha);
  assert.equal(state.runId, initialState.runId);
  assert.equal(state.generation, initialState.generation);
  assert.equal(state.retryCount, initialState.retryCount);
  assert.equal(state.activeRunId, "");
  assert.equal(state.leaseExpiresAt, "");
  assert.equal(state.retryNotBeforeAt, initialState.retryNotBeforeAt);
  assert.equal(status.status, "failed");
  assert.match(status.message, /manual recovery/i);

  const secondResult = sandbox.continueMediaSync();
  assert.match(secondResult, /manual recovery/i);
  assert.equal(triggerAttempts, 1, "terminal failure must not loop on trigger creation");
  assert.equal(JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1).checkpointSha,
    initialState.checkpointSha);
});

test("deferred stale handler preserves the current continuation trigger", () => {
  const runtime = stubBatchRuntime([{ sku: "W0001" }], {}, {}, () => {
    throw new Error("Drive inventory must not run before retry deadline");
  });
  const retryNotBeforeAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const initialState = {
    version: 3, runId: "deferred-preserve-run", checkpointSha: "confirmed-sha",
    phase: "inventory", baseCommitSha: "base", planFingerprint: "", targetCommitSha: "",
    targetTreeSha: "", lastSku: "", startedAt: "started", mode: "normal",
    retryCount: 1, generation: 32, activeRunId: "", leaseExpiresAt: "",
    status: "retry-pending", lastError: "rate limited", lastFailureAt: "failed",
    retryNotBeforeAt,
  };
  runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1 = JSON.stringify(initialState);
  const currentTrigger = {
    getHandlerFunction: () => "continueMediaSync",
    getUniqueId: () => "current-generation-trigger",
    marker: "current-generation-trigger",
    delayMs: 10 * 60 * 1000,
  };
  runtime.triggers.push(currentTrigger);
  runtime.triggers.push({
    getHandlerFunction: () => "continueMediaSync",
    getUniqueId: () => "stale-generation-trigger",
    marker: "stale-generation-trigger",
    delayMs: 1000,
  });
  let triggerAttempts = 0;
  sandbox.ScriptApp.newTrigger = () => ({
    timeBased() { return this; },
    after() { return this; },
    create() {
      triggerAttempts += 1;
      throw new Error("must preserve existing trigger");
    },
  });

  const result = sandbox.continueMediaSync({ triggerUid: "stale-generation-trigger" });

  assert.match(result, /deferred/i);
  assert.equal(runtime.triggers.length, 1);
  assert.equal(runtime.triggers[0], currentTrigger);
  assert.equal(triggerAttempts, 0);
  assert.deepEqual(sandbox.__calls, []);
  const state = JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1);
  assert.equal(state.status, initialState.status);
  assert.equal(state.checkpointSha, initialState.checkpointSha);
  assert.equal(state.runId, initialState.runId);
  assert.equal(state.generation, initialState.generation);
  assert.equal(state.retryNotBeforeAt, retryNotBeforeAt);
});

test("recovery rebuilds safely when a checkpoint blob exists before its SHA is saved", () => {
  const runtime = stubBatchRuntime(
    [{ sku: "W0001" }],
    {},
    {},
    () => ({ found: true, files: [driveFile("1.jpg", "drive-1")] }),
  );
  const originalShouldYield = sandbox.mediaSyncShouldYield;
  let yieldChecks = 0;
  sandbox.mediaSyncShouldYield = () => {
    yieldChecks += 1;
    return yieldChecks === 2;
  };

  const originalCreateTextBlob = sandbox.createGitHubTextBlob;
  let orphanCheckpointSha = "";
  sandbox.createGitHubTextBlob = (content) => {
    const blob = originalCreateTextBlob(content);
    try {
      const checkpoint = JSON.parse(content);
      if (checkpoint.version === 3 && checkpoint.phase === "staging") {
        orphanCheckpointSha = blob.sha;
      }
    } catch (_error) {}
    return blob;
  };

  const originalGetProperties = sandbox.PropertiesService.getScriptProperties;
  let failCheckpointStateWrite = true;
  sandbox.PropertiesService.getScriptProperties = () => {
    const properties = originalGetProperties();
    const originalSetProperty = properties.setProperty;
    properties.setProperty = (key, value) => {
      if (failCheckpointStateWrite && key === "PREVIA_MEDIA_SYNC_STATE_V1") {
        const nextState = JSON.parse(value);
        if (nextState.phase === "staging" && nextState.checkpointSha) {
          failCheckpointStateWrite = false;
          throw new Error("simulated state write failure after checkpoint blob");
        }
      }
      return originalSetProperty(key, value);
    };
    return properties;
  };

  assert.throws(
    () => sandbox.syncMedia(),
    /simulated state write failure after checkpoint blob/,
  );
  const failedState = JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1);
  assert.ok(orphanCheckpointSha);
  assert.ok(runtime.blobContents.has(orphanCheckpointSha));
  assert.equal(failedState.checkpointSha, "");
  assert.equal(failedState.retryCount, 1);
  assert.equal(failedState.generation, 2);
  assert.equal(failedState.activeRunId, "");
  assert.equal(failedState.leaseExpiresAt, "");
  const runId = failedState.runId;

  sandbox.mediaSyncShouldYield = originalShouldYield;
  expireMediaSyncRetry(runtime);
  const report = sandbox.continueMediaSync();

  assert.match(report, /completed/i);
  assert.equal(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1, undefined);
  assert.equal(runtime.commitObjects.size, 1);
  assert.equal(sandbox.__calls.filter((call) => call === "blob:image").length, 1);
  assert.equal(sandbox.__calls.filter((call) => call === "commit").length, 1);
  assert.equal(sandbox.__calls.filter((call) => call === "ref").length, 1);
  assert.notEqual(runId, "");
});

test("checkpoint diagnostics report serialized and Base64 payload sizes", () => {
  const logs = [];
  const originalLog = sandbox.Logger.log;
  const originalCreateTextBlob = sandbox.createGitHubTextBlob;
  sandbox.Logger.log = (message) => logs.push(String(message));
  sandbox.createGitHubTextBlob = () => ({ sha: "checkpoint-blob" });
  const checkpoint = { phase: "hashing", data: "x".repeat(1024 * 1024) };
  const serializedBytes = Buffer.byteLength(JSON.stringify(checkpoint), "utf8");

  assert.equal(sandbox.mediaSyncCreateCheckpointBlob(checkpoint).sha, "checkpoint-blob");
  assert.match(logs.join("\n"), new RegExp("UTF-8=" + serializedBytes + " bytes"));
  assert.match(logs.join("\n"), new RegExp("Base64=" + (4 * Math.ceil(serializedBytes / 3)) + " bytes"));

  sandbox.Logger.log = originalLog;
  sandbox.createGitHubTextBlob = originalCreateTextBlob;
});

test("persists Retry-After deadlines and stale continuation triggers defer until due", () => {
  for (const minutes of [10, 30]) {
    const runtime = stubBatchRuntime([], {}, {}, () => ({ found: true, files: [] }));
    const now = Date.now();
    const originalDate = Date;
    sandbox.Date = class extends originalDate {
      static now() { return now; }
    };
    const retryAt = new originalDate(now + minutes * 60 * 1000).toISOString();
    const originalState = {
      version: 3, runId: "stable-run", checkpointSha: "confirmed-sha",
      phase: "inventory", baseCommitSha: "base-commit", planFingerprint: "fp",
      targetCommitSha: "", targetTreeSha: "", lastSku: "", startedAt: "started",
      mode: "normal", retryCount: 0, generation: 4, activeRunId: "stable-run",
      leaseExpiresAt: new originalDate(now + 60000).toISOString(), status: "running",
      lastError: "", lastFailureAt: "", retryNotBeforeAt: "",
    };
    runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1 = JSON.stringify(originalState);
    const failure = sandbox.recordMediaSyncFailure("stable-run", 4, Object.assign(
      new Error("GitHub HTTP 429 POST /git/blobs attempt 1: rate limited"),
      { retryAfterAt: retryAt, status: 429, endpoint: "POST /git/blobs", attempt: 1 },
    ));
    assert.equal(failure.retryNotBeforeAt, retryAt);
    const failedState = JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1);
    assert.equal(failedState.checkpointSha, "confirmed-sha");
    assert.equal(failedState.runId, "stable-run");
    assert.equal(failedState.generation, 5);
    assert.equal(failedState.retryCount, 1);
    assert.equal(failedState.activeRunId, "");
    assert.equal(failedState.leaseExpiresAt, "");
    assert.equal(failedState.retryNotBeforeAt, retryAt);

    // Simulate an old queued trigger whose scheduled time predates the new deadline.
    runtime.triggers.push({
      getHandlerFunction: () => "continueMediaSync",
      getUniqueId: () => "stale-trigger-" + minutes,
      delayMs: 1000,
    });
    const result = sandbox.continueMediaSync({ triggerUid: "stale-trigger-" + minutes });
    assert.match(result, /deferred/i);
    assert.equal(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1, JSON.stringify(failedState));
    assert.ok(runtime.triggers.length >= 1);
    assert.ok(runtime.triggers.every((trigger) => trigger.delayMs >= minutes * 60 * 1000));
    sandbox.Date = originalDate;
  }
});

test("temporary checkpoint blob failure preserves the whole confirmed checkpoint state", () => {
  const runtime = stubBatchRuntime([{ sku: "W0001" }], {}, {}, () => ({ found: true, files: [] }));
  const oldState = {
    version: 3, runId: "confirmed-run", checkpointSha: "confirmed-sha",
    phase: "inventory", baseCommitSha: "base-commit", planFingerprint: "confirmed-fp",
    targetCommitSha: "", targetTreeSha: "", lastSku: "", startedAt: "started",
    mode: "normal", retryCount: 2, generation: 8, activeRunId: "", leaseExpiresAt: "", status: "pending",
    lastError: "previous diagnostic", lastFailureAt: "previous failure", retryNotBeforeAt: "",
  };
  runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1 = JSON.stringify(oldState);
  const checkpoint = sandbox.mediaSyncCreateCheckpoint(
    { state: oldState }, [{ sku: "W0001" }],
    { commitSha: "base-commit", treeSha: "base-tree" },
    { tree: runtime.getCurrentTree(), truncated: false }, {},
  );
  const checkpointText = JSON.stringify(checkpoint);
  runtime.blobContents.set("confirmed-sha", checkpointText);
  assert.equal(sandbox.mediaSyncReadCheckpoint(oldState).runId, "confirmed-run");
  const originalCreateTextBlob = sandbox.createGitHubTextBlob;
  sandbox.createGitHubTextBlob = () => {
    const error = new Error("GitHub HTTP 503 POST /git/blobs attempt 1: temporary server error");
    error.code = "GITHUB_API_ERROR";
    error.status = 503;
    error.endpoint = "POST /git/blobs";
    error.attempt = 1;
    error.reason = "temporary server error";
    throw error;
  };
  const originalShouldYield = sandbox.mediaSyncShouldYield;
  sandbox.mediaSyncShouldYield = () => true;
  assert.throws(() => sandbox.syncMedia(), /GitHub HTTP 503/);
  sandbox.createGitHubTextBlob = originalCreateTextBlob;
  sandbox.mediaSyncShouldYield = originalShouldYield;
  const failed = JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1);
  assert.deepEqual({
    runId: failed.runId, checkpointSha: failed.checkpointSha, phase: failed.phase,
    baseCommitSha: failed.baseCommitSha, planFingerprint: failed.planFingerprint,
    targetCommitSha: failed.targetCommitSha, targetTreeSha: failed.targetTreeSha,
    lastSku: failed.lastSku, startedAt: failed.startedAt, mode: failed.mode,
    retryCount: failed.retryCount, generation: failed.generation,
    activeRunId: failed.activeRunId, leaseExpiresAt: failed.leaseExpiresAt,
    status: failed.status, retryNotBeforeAt: failed.retryNotBeforeAt,
  }, {
    runId: "confirmed-run", checkpointSha: "confirmed-sha", phase: "inventory",
    baseCommitSha: "base-commit", planFingerprint: "confirmed-fp",
    targetCommitSha: "", targetTreeSha: "", lastSku: "", startedAt: "started",
    mode: "normal", retryCount: 3, generation: 10, activeRunId: "",
    leaseExpiresAt: "", status: "retry-pending", retryNotBeforeAt: failed.retryNotBeforeAt,
  });
  assert.equal(runtime.blobContents.get("confirmed-sha"), checkpointText);
  assert.ok(runtime.triggers.length > 0);

  expireMediaSyncRetry(runtime);
  const originalGetBlobText = sandbox.getGitHubBlobText;
  const restoredCheckpointReads = [];
  sandbox.getGitHubBlobText = (sha) => {
    restoredCheckpointReads.push(sha);
    return originalGetBlobText(sha);
  };
  const recoveryResult = sandbox.continueMediaSync();
  sandbox.getGitHubBlobText = originalGetBlobText;
  assert.match(recoveryResult, /completed/i);
  assert.ok(restoredCheckpointReads.includes("confirmed-sha"));
  assert.equal(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1, undefined);
});

test("late lock-contention handler preserves a continuation created for the newer generation", () => {
  const runtime = stubBatchRuntime([{ sku: "W0001" }], {}, {}, () => {
    throw new Error("stale handler must not enter Drive inventory");
  });
  const now = Date.now();
  const activeState = {
    version: 3, runId: "race-run", checkpointSha: "checkpoint-sha",
    phase: "inventory", baseCommitSha: "base-commit", planFingerprint: "fp",
    targetCommitSha: "", targetTreeSha: "", lastSku: "", startedAt: "started",
    mode: "normal", retryCount: 0, generation: 14, activeRunId: "race-run",
    leaseExpiresAt: new Date(now + 4 * 60 * 1000).toISOString(),
    status: "running", lastError: "", lastFailureAt: "",
    retryNotBeforeAt: new Date(now + 12 * 60 * 1000).toISOString(),
  };
  runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1 = JSON.stringify(activeState);
  const originalLockService = sandbox.LockService;
  let lockAttempts = 0;
  sandbox.LockService = {
    getScriptLock: () => ({
      tryLock: () => {
        lockAttempts += 1;
        if (lockAttempts === 2) {
          // Main execution yields and installs its new continuation after the
          // stale handler observed the active lease but before it gets the lock.
          const pending = { ...activeState, generation: 15, activeRunId: "", leaseExpiresAt: "", status: "pending" };
          runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1 = JSON.stringify(pending);
          runtime.triggers.push({
            getHandlerFunction: () => "continueMediaSync",
            marker: "generation-15-retryAfter-watchdog",
            generation: pending.generation,
            retryNotBeforeAt: pending.retryNotBeforeAt,
            delayMs: 12 * 60 * 1000,
          });
        }
        return true;
      },
      releaseLock() {},
    }),
  };

  const result = sandbox.continueMediaSync();
  sandbox.LockService = originalLockService;

  assert.match(result, /already running/i);
  assert.equal(lockAttempts, 2);
  assert.equal(runtime.triggers.length, 1);
  assert.equal(runtime.triggers[0].marker, "generation-15-retryAfter-watchdog");
  assert.equal(runtime.triggers[0].generation, 15);
  assert.equal(runtime.triggers[0].retryNotBeforeAt, pendingDeadline(activeState));
  const persisted = JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1);
  assert.equal(persisted.generation, 15);
  assert.equal(persisted.runId, "race-run");
  assert.equal(persisted.retryNotBeforeAt, runtime.triggers[0].retryNotBeforeAt);
  assert.deepEqual(sandbox.__calls, []);
});

function pendingDeadline(state) {
  return state.retryNotBeforeAt;
}

test("two handlers observing one active lease preserve one current recovery trigger", () => {
  const runtime = stubBatchRuntime([], {}, {}, () => ({ found: true, files: [] }));
  const now = Date.now();
  const state = {
    version: 3, runId: "parallel-run", checkpointSha: "sha",
    phase: "inventory", baseCommitSha: "base", planFingerprint: "", targetCommitSha: "",
    targetTreeSha: "", lastSku: "", startedAt: "started", mode: "normal",
    retryCount: 0, generation: 21, activeRunId: "parallel-run",
    leaseExpiresAt: new Date(now + 2 * 60 * 1000).toISOString(),
    status: "running", lastError: "", lastFailureAt: "",
    retryNotBeforeAt: new Date(now + 10 * 60 * 1000).toISOString(),
  };
  runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1 = JSON.stringify(state);
  const snapshot = {
    runId: state.runId, activeRunId: state.activeRunId,
    generation: state.generation, leaseExpiresAt: state.leaseExpiresAt,
    retryNotBeforeAt: state.retryNotBeforeAt,
  };

  const firstResult = sandbox.continueMediaSync();
  const currentTrigger = runtime.triggers[0];
  const secondResult = sandbox.continueMediaSync();

  assert.match(firstResult, /already running/i);
  assert.match(secondResult, /already running/i);
  assert.equal(runtime.triggers.length, 1);
  assert.equal(runtime.triggers[0], currentTrigger);
  assert.ok(currentTrigger.delayMs >= Date.parse(state.retryNotBeforeAt) - Date.now() - 50);
});

test("a stale continuation does not perform work before retryAfterAt", () => {
  const runtime = stubBatchRuntime([{ sku: "W0001" }], {}, {}, () => {
    throw new Error("Drive inventory must not run before retry deadline");
  });
  const retryNotBeforeAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1 = JSON.stringify({
    version: 3, runId: "retry-run", checkpointSha: "confirmed-sha",
    phase: "inventory", baseCommitSha: "base", planFingerprint: "", targetCommitSha: "",
    targetTreeSha: "", lastSku: "", startedAt: "started", mode: "normal",
    retryCount: 1, generation: 22, activeRunId: "", leaseExpiresAt: "",
    status: "retry-pending", lastError: "rate limited", lastFailureAt: "failed",
    retryNotBeforeAt,
  });
  // A one-shot trigger that fired before the deadline is still listed here;
  // its UID lets recovery remove only that trigger and schedule a new one.
  runtime.triggers.push({
    getHandlerFunction: () => "continueMediaSync",
    getUniqueId: () => "early-trigger",
    delayMs: 1000,
  });
  const result = sandbox.continueMediaSync({ triggerUid: "early-trigger" });

  assert.match(result, /deferred/i);
  assert.deepEqual(sandbox.__calls, []);
  assert.equal(runtime.triggers.length, 1);
  assert.ok(runtime.triggers[0].delayMs >= Date.parse(retryNotBeforeAt) - Date.now());
  assert.equal(JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1).retryAfterAt, undefined);
  assert.equal(JSON.parse(runtime.properties.PREVIA_MEDIA_SYNC_STATE_V1).retryNotBeforeAt, retryNotBeforeAt);
});
