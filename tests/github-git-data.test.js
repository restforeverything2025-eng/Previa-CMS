const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "..", "GitHub.js"),
  "utf8",
);

function createHarness(responses) {
  const calls = [];
  const sleepCalls = [];
  const logs = [];
  const queue = (responses || []).slice();
  const sandbox = {
    getConfig: () => ({
      github_owner: "owner",
      github_repo: "repo",
      github_branch: "main",
      github_token: "token",
    }),
    Logger: { log(value) { logs.push(String(value)); } },
    Utilities: {
      newBlob(value) {
        const bytes = Array.isArray(value)
          ? Buffer.from(value.map((byte) => byte < 0 ? byte + 256 : byte))
          : Buffer.from(String(value), "utf8");
        return {
          getBytes: () => Array.from(bytes).map((byte) => byte > 127 ? byte - 256 : byte),
          getDataAsString: () => bytes.toString("utf8"),
        };
      },
      base64Encode(value) {
        return Buffer.from(value.map((byte) => byte < 0 ? byte + 256 : byte))
          .toString("base64");
      },
      sleep(milliseconds) { sleepCalls.push(milliseconds); },
      base64Decode(value) {
        return Array.from(Buffer.from(value, "base64"))
          .map((byte) => byte > 127 ? byte - 256 : byte);
      },
    },
    UrlFetchApp: {
      fetch(url, options) {
        calls.push({ url, options });
        const next = queue.shift();
        if (!next) throw new Error("No mocked GitHub response remains.");
        if (next.throw) throw new Error(next.throw);
        return {
          getResponseCode: () => next.code,
          getContentText: () => typeof next.rawBody === "string" ? next.rawBody : JSON.stringify(next.body || {}),
          getAllHeaders: () => next.headers || {},
        };
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "GitHub.js" });
  return { sandbox, calls, sleepCalls, logs };
}

test("reads branch head and tree SHAs from the GitHub branch response", () => {
  const harness = createHarness([{
    code: 200,
    body: {
      name: "main",
      commit: { sha: "commit-1", commit: { tree: { sha: "tree-1" } } },
    },
  }]);

  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.sandbox.getGitHubBranchSnapshot())),
    { branch: "main", commitSha: "commit-1", treeSha: "tree-1" },
  );
  assert.match(harness.calls[0].url, /\/branches\/main$/);
});

test("returns the full tree response including the truncated flag", () => {
  const harness = createHarness([{ code: 200, body: { truncated: true, tree: [] } }]);

  const tree = harness.sandbox.getGitHubTreeSnapshot("tree-1");
  assert.equal(tree.truncated, true);
  assert.deepEqual(JSON.parse(JSON.stringify(tree.tree)), []);
  assert.match(harness.calls[0].url, /\/git\/trees\/tree-1\?recursive=1$/);
});

test("reads a Git blob as UTF-8 text after base64 decoding", () => {
  const content = Buffer.from('{"W0001":[]}').toString("base64");
  const harness = createHarness([{
    code: 200,
    body: { encoding: "base64", content },
  }]);

  assert.equal(harness.sandbox.getGitHubBlobText("blob-1"), '{"W0001":[]}');
});

test("creates binary blobs with base64 encoding", () => {
  const harness = createHarness([{ code: 201, body: { sha: "blob-1" } }]);

  assert.equal(harness.sandbox.createGitHubBlob([0, 1, 255]).sha, "blob-1");
  const request = harness.calls[0];
  assert.equal(request.options.method, "post");
  assert.match(request.url, /\/git\/blobs$/);
  assert.deepEqual(JSON.parse(request.options.payload), {
    content: "AAH/",
    encoding: "base64",
  });
});

test("creates Git trees with updates and explicit deletions", () => {
  const harness = createHarness([{ code: 201, body: { sha: "tree-2" } }]);

  harness.sandbox.createGitHubTree("tree-1", [
    { path: "images/W0001/1.jpg", mode: "100644", type: "blob", sha: "blob-1" },
    { path: "images/W0001/2.jpg", mode: "100644", type: "blob", sha: null },
  ]);
  const payload = JSON.parse(harness.calls[0].options.payload);
  assert.equal(payload.base_tree, "tree-1");
  assert.equal(payload.tree[1].sha, null);
});

test("creates a commit with the expected parent", () => {
  const harness = createHarness([{ code: 201, body: { sha: "commit-2" } }]);

  harness.sandbox.createGitHubCommit("media update", "tree-2", "commit-1");
  assert.deepEqual(JSON.parse(harness.calls[0].options.payload), {
    message: "media update",
    tree: "tree-2",
    parents: ["commit-1"],
  });
});

test("creates retry-stable commits with a fixed identity and timestamp", () => {
  const harness = createHarness([{ code: 201, body: { sha: "commit-2" } }]);
  const identity = { name: "Test User", email: "123+test@users.noreply.github.com" };

  harness.sandbox.createGitHubCommit(
    "media update",
    "tree-2",
    "commit-1",
    identity,
    "2026-11-05T12:00:00.000Z",
  );
  const payload = JSON.parse(harness.calls[0].options.payload);
  assert.deepEqual(payload.author, {
    name: identity.name,
    email: identity.email,
    date: "2026-11-05T12:00:00.000Z",
  });
  assert.deepEqual(payload.committer, payload.author);
});

test("gets a stable GitHub commit identity from the authenticated user", () => {
  const harness = createHarness([{
    code: 200,
    body: { id: 123, login: "test-user", name: "Test User", email: null },
  }]);

  assert.deepEqual(
    JSON.parse(JSON.stringify(harness.sandbox.getGitHubCommitIdentity())),
    {
      name: "Test User",
      email: "123+test-user@users.noreply.github.com",
    },
  );
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.calls[0].url, "https://api.github.com/user");
  assert.equal(harness.sandbox.getGitHubCommitIdentity().name, "Test User");
  assert.equal(harness.calls.length, 1, "identity is cached for this execution");
});

test("updates the branch only after checking its expected head and never forces", () => {
  const harness = createHarness([
    {
      code: 200,
      body: {
        name: "main",
        commit: { sha: "commit-1", commit: { tree: { sha: "tree-1" } } },
      },
    },
    { code: 200, body: { object: { sha: "commit-2" } } },
  ]);

  harness.sandbox.updateGitHubBranchRef("commit-2", "commit-1");
  assert.equal(harness.calls.length, 2);
  const patch = harness.calls[1];
  assert.equal(patch.options.method, "patch");
  assert.deepEqual(JSON.parse(patch.options.payload), {
    sha: "commit-2",
    force: false,
  });
});

test("refuses to update when the branch head changed after planning", () => {
  const harness = createHarness([{
    code: 200,
    body: {
      name: "main",
      commit: { sha: "external-commit", commit: { tree: { sha: "tree-2" } } },
    },
  }]);

  assert.throws(
    () => harness.sandbox.updateGitHubBranchRef("media-commit", "base-commit"),
    (error) => error.code === "GITHUB_CONFLICT",
  );
  assert.equal(harness.calls.length, 1);
});

test("a branch race after the HEAD check is rejected by non-force PATCH", () => {
  const harness = createHarness([
    {
      code: 200,
      body: {
        name: "main",
        commit: { sha: "base-commit", commit: { tree: { sha: "tree-1" } } },
      },
    },
    { code: 422, body: { message: "Update is not a fast forward" } },
  ]);

  assert.throws(
    () => harness.sandbox.updateGitHubBranchRef("media-commit", "base-commit"),
    (error) => error.code === "GITHUB_CONFLICT" && error.status === 422,
  );
  assert.equal(harness.calls.length, 2);
  assert.deepEqual(JSON.parse(harness.calls[1].options.payload), {
    sha: "media-commit",
    force: false,
  });
});

test("maps GitHub 409 and 422 responses to a conflict error", () => {
  const harness = createHarness([{ code: 409, body: { message: "conflict" } }]);

  assert.throws(
    () => harness.sandbox.createGitHubTree("tree-1", []),
    (error) => error.code === "GITHUB_CONFLICT" && error.status === 409,
  );
});

test("retries a transient 500 while creating a checkpoint text blob", () => {
  const harness = createHarness([
    { code: 500, body: { message: "temporary server failure" } },
    { code: 201, body: { sha: "blob-1" } },
  ]);
  assert.equal(harness.sandbox.createGitHubTextBlob("{\"phase\":\"hashing\"}").sha, "blob-1");
  assert.equal(harness.calls.length, 2);
  assert.deepEqual(harness.sleepCalls, [500]);
});

test("stops after the bounded retries for a persistent GitHub 500", () => {
  const harness = createHarness(Array.from({ length: 4 }, () => ({
    code: 500, body: { message: "still unavailable" },
  })));
  assert.throws(() => harness.sandbox.createGitHubBlob([1]),
    (error) => error.code === "GITHUB_API_ERROR" && error.status === 500);
  assert.equal(harness.calls.length, 4);
  assert.deepEqual(harness.sleepCalls, [500, 1000, 2000]);
});

test("honors Retry-After for a bounded 429 retry", () => {
  const harness = createHarness([
    { code: 429, headers: { "Retry-After": "2" } },
    { code: 201, body: { sha: "blob-1" } },
  ]);
  assert.equal(harness.sandbox.createGitHubBlob([1]).sha, "blob-1");
  assert.deepEqual(harness.sleepCalls, [2000]);
});

test("retries transient UrlFetch network failures for safe requests", () => {
  const harness = createHarness([
    { throw: "temporary network failure" },
    { code: 201, body: { sha: "blob-1" } },
  ]);
  assert.equal(harness.sandbox.createGitHubBlob([1]).sha, "blob-1");
  assert.equal(harness.calls.length, 2);
  assert.deepEqual(harness.sleepCalls, [500]);
});

test("does not retry authentication failures or ref updates", () => {
  const authHarness = createHarness([{ code: 401, body: { message: "bad credentials" } }]);
  assert.throws(() => authHarness.sandbox.createGitHubBlob([1]),
    (error) => error.status === 401);
  assert.equal(authHarness.calls.length, 1);
  const refHarness = createHarness([{ code: 200, body: { name: "main", commit: { sha: "base", commit: { tree: { sha: "tree-1" } } } } }, { code: 500, body: { message: "temporary" } }]);
  assert.throws(() => refHarness.sandbox.updateGitHubBranchRef("target", "base"));
  assert.equal(refHarness.calls.length, 2, "HEAD GET once and ref PATCH once");
});

test("retries deterministic commits only with fixed author and committer", () => {
  const safeHarness = createHarness([
    { code: 502 }, { code: 201, body: { sha: "commit-1" } },
  ]);
  const identity = { name: "Test User", email: "test@example.com" };
  assert.equal(safeHarness.sandbox.createGitHubCommit(
    "media update", "tree-1", "parent-1", identity,
    "2026-11-05T12:00:00.000Z",
  ).sha, "commit-1");
  assert.equal(safeHarness.calls.length, 2);
  const unsafeHarness = createHarness([{ code: 500 }]);
  assert.throws(() => unsafeHarness.sandbox.createGitHubCommit(
    "legacy commit", "tree-1", "parent-1",
  ));
  assert.equal(unsafeHarness.calls.length, 1);
});

test("accepts a large checkpoint-sized UTF-8 blob request", () => {
  const harness = createHarness([{ code: 201, body: { sha: "large-blob" } }]);
  const content = "x".repeat(1024 * 1024);
  assert.equal(harness.sandbox.createGitHubTextBlob(content).sha, "large-blob");
  const payload = JSON.parse(harness.calls[0].options.payload);
  assert.equal(Buffer.from(payload.content, "base64").toString("utf8"), content);
});

test("does not retry permanent UrlFetch payload errors", () => {
  const harness = createHarness([{ throw: "Limit exceeded: URL Fetch POST size" }]);
  assert.throws(() => harness.sandbox.createGitHubBlob([1]), (error) => error.code === "GITHUB_REQUEST_ERROR" && !/Limit exceeded/.test(error.message));
  assert.equal(harness.calls.length, 1);
});

test("defers a 429 retry when Retry-After exceeds the short in-run window", () => {
  const harness = createHarness([
    { code: 429, headers: { "Retry-After": "60" }, body: { message: "rate limited" } },
  ]);
  assert.throws(() => harness.sandbox.createGitHubBlob([1]),
    (error) => error.status === 429);
  assert.equal(harness.calls.length, 1);
  assert.deepEqual(harness.sleepCalls, []);
});

test("sanitizes GitHub error bodies and retains bounded diagnostic fields", () => {
  const sensitive = "TOKEN_SECRET product-name image-payload";
  const harness = createHarness([{
    code: 429,
    headers: { "Retry-After": "600" },
    body: { message: sensitive, data: sensitive },
  }]);
  assert.throws(() => harness.sandbox.createGitHubBlob([1]), (error) => {
    assert.equal(error.status, 429);
    assert.equal(error.endpoint, "POST /git/blobs");
    assert.equal(error.attempt, 1);
    assert.equal(error.reason, "rate limited");
    assert.ok(error.retryAfterAt);
    assert.doesNotMatch(error.message, /TOKEN_SECRET|product-name|image-payload/);
    return true;
  });
  assert.equal(harness.calls.length, 1);
});

test("preserves a 30-minute Retry-After deadline without sleeping in process", () => {
  const seconds = 1800;
  const harness = createHarness([{
    code: 429,
    headers: { "Retry-After": String(seconds) },
    body: { message: "sensitive response content" },
  }]);
  assert.throws(() => harness.sandbox.createGitHubBlob([1]), (error) => {
    const remaining = Date.parse(error.retryAfterAt) - Date.now();
    assert.ok(remaining >= seconds * 1000 - 1000);
    assert.ok(remaining <= seconds * 1000 + 1000);
    assert.doesNotMatch(error.message, /sensitive response content/);
    return true;
  });
  assert.deepEqual(harness.sleepCalls, []);
  assert.equal(harness.calls.length, 1);
});

test("legacy getFileContent returns a normalized body-safe error", () => {
  const secret = "MOCK_GITHUB_SECRET_RESPONSE_BODY";
  const harness = createHarness([{ code: 500, body: { message: secret } }]);
  assert.throws(() => harness.sandbox.getFileContent("media-manifest.json"), (error) => {
    assert.equal(error.status, 500);
    assert.equal(error.endpoint, "GET /repos/{owner}/{repo}/contents/{path}");
    assert.match(error.message, /HTTP 500/);
    assert.doesNotMatch(error.message, new RegExp(secret));
    return true;
  });
});

test("legacy publishFile and deleteFile errors do not expose response bodies", () => {
  const secret = "MOCK_GITHUB_SECRET_RESPONSE_BODY";
  const publish = createHarness([
    { code: 200, body: { sha: "old-sha" } },
    { code: 500, body: { message: secret } },
  ]);
  let publishError;
  try {
    publish.sandbox.publishFile({ fileName: "data.js", content: "safe", binary: false }, "publish");
  } catch (error) {
    publishError = error;
  }
  assert.ok(publishError);
  assert.equal(publishError.status, 500);
  assert.equal(publishError.endpoint, "PUT /repos/{owner}/{repo}/contents/{path}");
  assert.doesNotMatch(publishError.message, new RegExp(secret));

  const remove = createHarness([
    { code: 200, body: { sha: "old-sha" } },
    { code: 500, body: { message: secret } },
  ]);
  assert.throws(() => remove.sandbox.deleteFile("data.js", "delete"), (error) => {
    assert.equal(error.status, 500);
    assert.equal(error.endpoint, "DELETE /repos/{owner}/{repo}/contents/{path}");
    assert.doesNotMatch(error.message, new RegExp(secret));
    return true;
  });
});

test("all legacy GitHub read helpers normalize HTTP errors", () => {
  const secret = "MOCK_GITHUB_SECRET_RESPONSE_BODY";
  const cases = [
    [(api) => api.getFileSha("data.js"), "GET /repos/{owner}/{repo}/contents/{path}"],
    [(api) => api.getFolderFiles("images/test"), "GET /repos/{owner}/{repo}/contents/{path}"],
    [(api) => api.getRepositoryTree(), "GET /repos/{owner}/{repo}/git/trees/{ref}"],
  ];
  for (const [invoke, endpoint] of cases) {
    const harness = createHarness([{ code: 502, body: { message: secret } }]);
    assert.throws(() => invoke(harness.sandbox), (error) => {
      assert.equal(error.status, 502);
      assert.equal(error.endpoint, endpoint);
      assert.doesNotMatch(error.message, new RegExp(secret));
      return true;
    });
  }
});

test("testGitHubConnection logs status only and never the response body", () => {
  const secret = "MOCK_GITHUB_SECRET_RESPONSE_BODY";
  const harness = createHarness([{ code: 403, body: { message: secret } }]);
  harness.sandbox.testGitHubConnection();
  assert.match(harness.logs.join("\n"), /HTTP 403/);
  assert.doesNotMatch(harness.logs.join("\n"), new RegExp(secret));
});

test("safe publishFile errors remain safe when stored by PublicationJournal", () => {
  const secret = "MOCK_GITHUB_SECRET_RESPONSE_BODY";
  const harness = createHarness([
    { code: 200, body: { sha: "old-sha" } },
    { code: 503, body: { message: secret } },
  ]);
  let safeError;
  try {
    harness.sandbox.publishFile({ fileName: "data.js", content: "safe", binary: false }, "publish");
  } catch (error) {
    safeError = error;
  }
  const rows = [];
  const sheet = { appendRow(row) { rows.push(row); } };
  harness.sandbox.SpreadsheetApp = {
    getActiveSpreadsheet: () => ({ getSheetByName: () => sheet }),
  };
  const journalSource = fs.readFileSync(path.join(__dirname, "..", "PublicationJournal.js"), "utf8");
  vm.runInContext(journalSource, harness.sandbox, { filename: "PublicationJournal.js" });
  harness.sandbox.__safeError = safeError;
  vm.runInContext("PublicationJournal.failure(3, 1, __safeError)", harness.sandbox);
  assert.equal(rows.length, 1);
  assert.match(rows[0][4], /GitHub HTTP 503/);
  assert.doesNotMatch(rows[0][4], new RegExp(secret));
});

test("legacy GitHub JSON parse errors do not echo response text", () => {
  const secret = "MOCK_GITHUB_SECRET_RESPONSE_BODY";
  const harness = createHarness([{ code: 200, rawBody: secret }]);
  assert.throws(() => harness.sandbox.getFileContent("data.js"), (error) => {
    assert.equal(error.status, 200);
    assert.match(error.message, /invalid JSON response/);
    assert.doesNotMatch(error.message, new RegExp(secret));
    return true;
  });
});

test("legacy successful content reads and publishes retain their existing behavior", () => {
  const encoded = Buffer.from("manifest-safe").toString("base64");
  const read = createHarness([{ code: 200, body: { content: encoded } }]);
  assert.equal(read.sandbox.getFileContent("media-manifest.json"), "manifest-safe");

  const publish = createHarness([
    { code: 200, body: { sha: "old-sha" } },
    { code: 200, body: { content: { sha: "new-sha" } } },
  ]);
  assert.equal(publish.sandbox.publishFile(
    { fileName: "data.js", content: "catalog-safe", binary: false },
    "publish",
  ), true);
  assert.equal(publish.calls[1].options.method, "put");
  const request = JSON.parse(publish.calls[1].options.payload);
  assert.equal(Buffer.from(request.content, "base64").toString("utf8"), "catalog-safe");
});

test("manual GitHub read diagnostics log summaries instead of file or tree data", () => {
  const secret = "MOCK_PRIVATE_PRODUCT_AND_FILE_NAME";
  const encoded = Buffer.from(secret).toString("base64");
  const fileContent = createHarness([{ code: 200, body: { content: encoded } }]);
  fileContent.sandbox.testGetFileContent();
  assert.doesNotMatch(fileContent.logs.join("\n"), new RegExp(secret));

  const folder = createHarness([{ code: 200, body: [{ type: "file", name: secret, path: secret }] }]);
  folder.sandbox.testGetFolderFiles();
  assert.doesNotMatch(folder.logs.join("\n"), new RegExp(secret));

  const tree = createHarness([{ code: 200, body: { tree: [{ type: "blob", path: "images/W0001/" + secret }] } }]);
  tree.sandbox.testRepositoryTree();
  assert.doesNotMatch(tree.logs.join("\n"), new RegExp(secret));

  const images = createHarness([{ code: 200, body: { tree: [{
    type: "blob", path: "images/W0027/" + secret, sha: "blob-sha", size: 10,
  }] } }]);
  images.sandbox.testRepositoryImages();
  assert.doesNotMatch(images.logs.join("\n"), new RegExp(secret));
});
