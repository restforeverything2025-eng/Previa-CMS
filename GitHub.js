/**
 * ==========================================
 * PREVIA GitHub Integration
 * ==========================================
 */

function getGitHubConfig() {

  const config = getConfig();

  return {

    owner: config.github_owner,
    repo: config.github_repo,
    branch: config.github_branch,
    token: config.github_token

  };

}

/** Shared request helper for MediaSync's Git Database API operations. */
var MEDIA_SYNC_GITHUB_CONFIG_CACHE = null;
var MEDIA_SYNC_GITHUB_COMMIT_IDENTITY_CACHE = null;

function resetMediaSyncGitHubConfigCache() {
  MEDIA_SYNC_GITHUB_CONFIG_CACHE = null;
  MEDIA_SYNC_GITHUB_COMMIT_IDENTITY_CACHE = null;
}

function getMediaSyncGitHubConfig() {
  if (!MEDIA_SYNC_GITHUB_CONFIG_CACHE) {
    MEDIA_SYNC_GITHUB_CONFIG_CACHE = getGitHubConfig();
  }
  return MEDIA_SYNC_GITHUB_CONFIG_CACHE;
}

var MEDIA_SYNC_GITHUB_MAX_RETRIES = 3;
var MEDIA_SYNC_GITHUB_RETRY_BASE_DELAY_MS = 500;
var MEDIA_SYNC_GITHUB_RETRY_MAX_DELAY_MS = 5000;

function mediaSyncGitHubRequestIsRetrySafe(method, path, payload) {
  const verb = String(method || "get").toLowerCase();
  if (verb === "get") return true;
  if (verb !== "post") return false;
  if (path === "/git/blobs" || path === "/git/trees") return true;
  return path === "/git/commits" && payload && payload.author &&
    payload.committer && payload.author.date && payload.committer.date;
}

function mediaSyncGitHubRetryableStatus(code) {
  return code === 429 || code === 500 || code === 502 ||
    code === 503 || code === 504;
}

function mediaSyncGitHubRetryableNetworkError(error) {
  const message = String(error && error.message ? error.message : error);
  return /network|timed?\s*out|temporar|connection (reset|refused|closed)|address unavailable|socket|transport|service unavailable/i.test(message) &&
    !/limit exceeded|payload size|invalid argument|malformed url/i.test(message);
}

function mediaSyncGitHubEndpointLabel(method, path) {
  const verb = String(method || "get").toUpperCase();
  if (path === "/git/blobs") return verb + " /git/blobs";
  if (path.indexOf("/git/blobs/") === 0) return verb + " /git/blobs/{sha}";
  if (path === "/git/trees") return verb + " /git/trees";
  if (path.indexOf("/git/trees/") === 0) return verb + " /git/trees/{sha}";
  if (path === "/git/commits") return verb + " /git/commits";
  if (path.indexOf("/branches/") === 0) return verb + " /branches/{branch}";
  if (path.indexOf("/git/refs/heads/") === 0) return verb + " /git/refs/heads/{branch}";
  if (path === "/user") return verb + " /user";
  return verb + " " + String(path || "/unknown").split("?")[0];
}

function mediaSyncGitHubRetryAfterAt(response) {
  try {
    const headers = response && response.getAllHeaders
      ? response.getAllHeaders()
      : {};
    let value = "";
    Object.keys(headers || {}).some((key) => {
      if (String(key).toLowerCase() === "retry-after") {
        value = String(headers[key]).trim();
        return true;
      }
      return false;
    });
    if (!value) return "";
    const seconds = Number(value);
    const timestamp = Number.isFinite(seconds)
      ? Date.now() + Math.max(0, seconds) * 1000
      : Date.parse(value);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
  } catch (_error) {
    return "";
  }
}

function mediaSyncGitHubRetryDelay(response, retryIndex) {
  const retryAfterAt = mediaSyncGitHubRetryAfterAt(response);
  if (retryAfterAt) {
    const delay = Math.max(0, Date.parse(retryAfterAt) - Date.now());
    return delay <= MEDIA_SYNC_GITHUB_RETRY_MAX_DELAY_MS ? delay : null;
  }
  return Math.min(
    MEDIA_SYNC_GITHUB_RETRY_BASE_DELAY_MS * Math.pow(2, retryIndex),
    MEDIA_SYNC_GITHUB_RETRY_MAX_DELAY_MS,
  );
}

function mediaSyncGitHubSafeError(status, method, path, attempt, reason, retryAfterAt) {
  const endpoint = mediaSyncGitHubEndpointLabel(method, path);
  const message = "GitHub HTTP " + status + " " + endpoint +
    " attempt " + attempt + ": " + reason +
    (retryAfterAt ? "; retry after " + retryAfterAt : ".");
  const error = new Error(message);
  error.code = status === 409 || status === 422
    ? "GITHUB_CONFLICT"
    : "GITHUB_API_ERROR";
  error.status = status;
  error.endpoint = endpoint;
  error.attempt = attempt;
  error.reason = reason;
  error.retryAfterAt = retryAfterAt || "";
  return error;
}

function mediaSyncGitHubStatusReason(code) {
  if (code === 401) return "authentication rejected";
  if (code === 403) return "permission or rate limit rejected";
  if (code === 404) return "resource not found";
  if (code === 409) return "GitHub conflict";
  if (code === 422) return "GitHub validation conflict";
  if (code === 429) return "rate limited";
  if (code >= 500) return "temporary server error";
  return "request rejected";
}

function mediaSyncGitHubRequest(method, path, payload) {
  const github = getMediaSyncGitHubConfig();
  const apiRoot = path === "/user"
    ? "https://api.github.com"
    : "https://api.github.com/repos/" + github.owner + "/" + github.repo;
  const url = apiRoot + path;
  const verb = String(method || "get").toLowerCase();
  const options = {
    method: verb,
    headers: {
      Authorization: "Bearer " + github.token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    muteHttpExceptions: true
  };
  if (typeof payload !== "undefined") {
    options.contentType = "application/json";
    options.payload = JSON.stringify(payload);
  }

  const retrySafe = mediaSyncGitHubRequestIsRetrySafe(verb, path, payload);
  const maxAttempts = retrySafe ? MEDIA_SYNC_GITHUB_MAX_RETRIES + 1 : 1;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (typeof recordMediaSyncGitHubRequest === "function") {
      recordMediaSyncGitHubRequest(method, path);
    }
    let response;
    try {
      response = UrlFetchApp.fetch(url, options);
    } catch (cause) {
      const retryable = retrySafe && mediaSyncGitHubRetryableNetworkError(cause);
      if (retryable && attempt + 1 < maxAttempts) {
        Utilities.sleep(mediaSyncGitHubRetryDelay(null, attempt));
        continue;
      }
      const reason = retryable
        ? "temporary network failure"
        : "request failed; not retried";
      const error = new Error(
        "GitHub " + mediaSyncGitHubEndpointLabel(method, path) +
        " attempt " + (attempt + 1) + ": " + reason + ".",
      );
      error.code = retryable ? "GITHUB_NETWORK_ERROR" : "GITHUB_REQUEST_ERROR";
      error.status = 0;
      error.endpoint = mediaSyncGitHubEndpointLabel(method, path);
      error.attempt = attempt + 1;
      error.reason = reason;
      error.retryAfterAt = "";
      throw error;
    }

    const code = response.getResponseCode();
    if (code < 200 || code >= 300) {
      const retryAfterAt = mediaSyncGitHubRetryAfterAt(response);
      const retryDelay = mediaSyncGitHubRetryDelay(response, attempt);
      if (retrySafe && mediaSyncGitHubRetryableStatus(code) &&
          attempt + 1 < maxAttempts && retryDelay !== null) {
        Utilities.sleep(retryDelay);
        continue;
      }
      throw mediaSyncGitHubSafeError(
        code,
        method,
        path,
        attempt + 1,
        mediaSyncGitHubStatusReason(code),
        retryAfterAt,
      );
    }

    const content = response.getContentText();
    try {
      return content ? JSON.parse(content) : {};
    } catch (_error) {
      throw mediaSyncGitHubSafeError(
        code, method, path, attempt + 1, "invalid JSON response", "",
      );
    }
  }
  throw new Error("GitHub request exhausted its retry attempts.");
}
function getGitHubBranchSnapshot() {
  const branch = encodeURIComponent(getMediaSyncGitHubConfig().branch);
  const result = mediaSyncGitHubRequest("get", "/branches/" + branch);
  if (!result.commit || !result.commit.sha || !result.commit.commit ||
      !result.commit.commit.tree || !result.commit.commit.tree.sha) {
    throw new Error("GitHub branch response is missing commit/tree SHAs.");
  }

  return {
    branch: result.name,
    commitSha: result.commit.sha,
    treeSha: result.commit.commit.tree.sha
  };
}

function getGitHubTreeSnapshot(treeSha) {
  if (!treeSha) throw new Error("A base Git tree SHA is required.");
  return mediaSyncGitHubRequest(
    "get",
    "/git/trees/" + encodeURIComponent(treeSha) + "?recursive=1"
  );
}

function getGitHubBlobText(blobSha) {
  if (!blobSha) return null;
  const blob = mediaSyncGitHubRequest(
    "get",
    "/git/blobs/" + encodeURIComponent(blobSha)
  );
  if (blob.encoding !== "base64" || typeof blob.content !== "string") {
    throw new Error("GitHub blob response is not base64 content.");
  }
  return Utilities.newBlob(Utilities.base64Decode(blob.content.replace(/\s/g, "")))
    .getDataAsString("UTF-8");
}

function getGitHubCommitIdentity() {
  if (MEDIA_SYNC_GITHUB_COMMIT_IDENTITY_CACHE) {
    return MEDIA_SYNC_GITHUB_COMMIT_IDENTITY_CACHE;
  }
  const user = mediaSyncGitHubRequest("get", "/user");
  if (!user || !user.login || !user.id) {
    throw new Error("GitHub did not return the authenticated commit identity.");
  }
  MEDIA_SYNC_GITHUB_COMMIT_IDENTITY_CACHE = {
    name: user.name || user.login,
    email: user.email || (String(user.id) + "+" + user.login +
      "@users.noreply.github.com")
  };
  return MEDIA_SYNC_GITHUB_COMMIT_IDENTITY_CACHE;
}

function createGitHubBlob(bytes) {
  if (!Array.isArray(bytes)) throw new Error("Git blob bytes must be an array.");
  return mediaSyncGitHubRequest("post", "/git/blobs", {
    content: Utilities.base64Encode(bytes),
    encoding: "base64"
  });
}

function createGitHubTextBlob(content) {
  const bytes = Utilities.newBlob(String(content), "text/plain", "manifest.json")
    .getBytes();
  return createGitHubBlob(bytes);
}

function createGitHubTree(baseTreeSha, elements) {
  if (!baseTreeSha) throw new Error("A base Git tree SHA is required.");
  return mediaSyncGitHubRequest("post", "/git/trees", {
    base_tree: baseTreeSha,
    tree: elements
  });
}

function createGitHubCommit(message, treeSha, parentSha, identity, date) {
  if (!treeSha || !parentSha) {
    throw new Error("A tree SHA and parent commit SHA are required.");
  }
  const payload = {
    message: String(message),
    tree: treeSha,
    parents: [parentSha]
  };
  if (identity && identity.name && identity.email && date) {
    payload.author = {
      name: identity.name,
      email: identity.email,
      date: date
    };
    payload.committer = {
      name: identity.name,
      email: identity.email,
      date: date
    };
  }
  return mediaSyncGitHubRequest("post", "/git/commits", payload);
}

/**
 * Rechecks the branch immediately before a non-force ref update. GitHub's
 * fast-forward rule is a second fence against concurrent branch changes.
 */
function updateGitHubBranchRef(commitSha, expectedHeadSha) {
  if (!commitSha || !expectedHeadSha) {
    throw new Error("Expected and target commit SHAs are required.");
  }
  const github = getMediaSyncGitHubConfig();
  const branch = encodeURIComponent(github.branch);
  const current = getGitHubBranchSnapshot();
  if (current.commitSha !== expectedHeadSha) {
    const error = new Error(
      "GitHub branch changed during MediaSync; expected " + expectedHeadSha +
      " but found " + current.commitSha + "."
    );
    error.code = "GITHUB_CONFLICT";
    error.expectedHeadSha = expectedHeadSha;
    error.actualHeadSha = current.commitSha;
    throw error;
  }
  return mediaSyncGitHubRequest("patch", "/git/refs/heads/" + branch, {
    sha: commitSha,
    force: false
  });
}

function testGitHubConfig() {
  const github = getGitHubConfig();

  Logger.log({
    owner: github.owner,
    repo: github.repo,
    branch: github.branch,
    token: github.token ? "[REDACTED]" : "[MISSING]"
  });
}

function githubLegacyEndpointLabel(url, method) {
  const path = String(url || "").replace(/^https:\/\/api\.github\.com/, "").split("?")[0];
  const verb = String(method || "GET").toUpperCase();
  if (/^\/repos\/[^/]+\/[^/]+$/.test(path)) {
    return verb + " /repos/{owner}/{repo}";
  }
  if (/^\/repos\/[^/]+\/[^/]+\/contents\//.test(path)) {
    return verb + " /repos/{owner}/{repo}/contents/{path}";
  }
  if (/^\/repos\/[^/]+\/[^/]+\/git\/trees\//.test(path)) {
    return verb + " /repos/{owner}/{repo}/git/trees/{ref}";
  }
  return verb + " /GitHub API";
}

function githubLegacySafeError(status, method, endpoint, reason) {
  const message = "GitHub HTTP " + status + " " + endpoint + ": " + reason + ".";
  const error = new Error(message);
  error.code = status === 409 || status === 422
    ? "GITHUB_CONFLICT"
    : "GITHUB_API_ERROR";
  error.status = Number(status) || 0;
  error.endpoint = endpoint;
  error.attempt = 1;
  error.reason = reason;
  return error;
}

function githubLegacyStatusReason(status) {
  if (status === 401) return "authentication rejected";
  if (status === 403) return "permission or rate limit rejected";
  if (status === 404) return "resource not found";
  if (status === 409) return "GitHub conflict";
  if (status === 422) return "GitHub validation conflict";
  if (status === 429) return "rate limited";
  if (status >= 500) return "temporary server error";
  return "request rejected";
}

function githubLegacyFetch(url, options) {
  const endpoint = githubLegacyEndpointLabel(url, options && options.method);
  try {
    return UrlFetchApp.fetch(url, options);
  } catch (_error) {
    throw githubLegacySafeError(0, options && options.method, endpoint,
      "network request failed");
  }
}

function githubLegacyParseJson(response, method, url) {
  const endpoint = githubLegacyEndpointLabel(url, method);
  try {
    const content = response.getContentText();
    return content ? JSON.parse(content) : {};
  } catch (_error) {
    throw githubLegacySafeError(response.getResponseCode(), method, endpoint,
      "invalid JSON response");
  }
}

function githubLegacyHttpError(response, method, url) {
  const status = response.getResponseCode();
  const endpoint = githubLegacyEndpointLabel(url, method);
  return githubLegacySafeError(status, method, endpoint,
    githubLegacyStatusReason(status));
}
function testGitHubConnection() {

  const github = getGitHubConfig();

  const url =
    "https://api.github.com/repos/" +
    github.owner +
    "/" +
    github.repo;

  const response = githubLegacyFetch(url, {

    method: "get",

    headers: {

      Authorization:
        "Bearer " + github.token,

      Accept:
        "application/vnd.github+json"

    },

    muteHttpExceptions: true

  });

  Logger.log("GitHub HTTP " + response.getResponseCode() + " GET /repos/{owner}/{repo}.");

}

function getFileSha(path) {

  const github = getGitHubConfig();

  const url =
    "https://api.github.com/repos/" +
    github.owner +
    "/" +
    github.repo +
    "/contents/" +
    path +
    "?ref=" +
    github.branch;

  const response = githubLegacyFetch(url, {

    method: "get",

    headers: {

      Authorization:
        "Bearer " + github.token,

      Accept:
        "application/vnd.github+json"

    },

    muteHttpExceptions: true

  });

  if (response.getResponseCode() === 404) {

  return null;

}

if (response.getResponseCode() !== 200) {

  throw githubLegacyHttpError(response, "get", url);

}

  const file =
    githubLegacyParseJson(response, "get", url);

  return file.sha;

}

function getFileContent(path) {

  const github =
    getGitHubConfig();

  const url =
    "https://api.github.com/repos/" +
    github.owner +
    "/" +
    github.repo +
    "/contents/" +
    path +
    "?ref=" +
    github.branch;

  const response = githubLegacyFetch(url, {

    method: "get",

    headers: {

      Authorization:
        "Bearer " + github.token,

      Accept:
        "application/vnd.github+json"

    },

    muteHttpExceptions: true

  });

  if (response.getResponseCode() === 404) {

    return null;

  }

  if (response.getResponseCode() !== 200) {

    throw githubLegacyHttpError(response, "get", url);

  }

  const file =
    githubLegacyParseJson(response, "get", url);

  try {
    return Utilities.newBlob(
      Utilities.base64Decode(file.content),
    ).getDataAsString();
  } catch (_error) {
    throw githubLegacySafeError(
      response.getResponseCode(),
      "get",
      githubLegacyEndpointLabel(url, "get"),
      "invalid file content",
    );
  }

}

function getFolderFiles(path) {

  const github =
    getGitHubConfig();

  const url =
    "https://api.github.com/repos/" +
    github.owner +
    "/" +
    github.repo +
    "/contents/" +
    path +
    "?ref=" +
    github.branch;

  const response = githubLegacyFetch(url, {

    method: "get",

    headers: {

      Authorization:
        "Bearer " + github.token,

      Accept:
        "application/vnd.github+json"

    },

    muteHttpExceptions: true

  });

  if (response.getResponseCode() === 404) {

    return [];

  }

  if (response.getResponseCode() !== 200) {

    throw githubLegacyHttpError(response, "get", url);

  }

  const files =
    githubLegacyParseJson(response, "get", url);

  return files
    .filter(file => file.type === "file")
    .map(file => ({

      name: file.name,

      path: file.path,

      sha: file.sha,

      size: file.size

    }));

}
/**
 * ==========================================
 * GitHub Repository Tree
 * ------------------------------------------
 * Reads the entire repository tree
 * with a single GitHub API request.
 * ==========================================
 */
function getRepositoryTree() {

  const github =
    getGitHubConfig();

  const url =
    "https://api.github.com/repos/" +
    github.owner +
    "/" +
    github.repo +
    "/git/trees/" +
    github.branch +
    "?recursive=1";

  const response =
    githubLegacyFetch(url, {

      method: "get",

      headers: {

        Authorization:
          "Bearer " + github.token,

        Accept:
          "application/vnd.github+json"

      },

      muteHttpExceptions: true

    });

  if (response.getResponseCode() !== 200) {

    throw githubLegacyHttpError(response, "get", url);

  }

  return githubLegacyParseJson(response, "get", url).tree;

}
/**
 * ==========================================
 * Repository Images Index
 * ------------------------------------------
 * Groups repository images by SKU.
 * ==========================================
 */
function getRepositoryImages() {

  const tree =
    getRepositoryTree();

  const images = {};

  tree.forEach(item => {

    if (
      item.type !== "blob" ||
      !item.path.startsWith("images/")
    ) {

      return;

    }

    const parts =
      item.path.split("/");

    if (parts.length !== 3) {

      return;

    }

    const sku =
      parts[1];

    if (!images[sku]) {

      images[sku] = [];

    }

    images[sku].push({

      name: parts[2],

      path: item.path,

      sha: item.sha,

      size: item.size

    });

  });

  return images;

}

function testGetFileContent() {
  const content = getFileContent("data.js");
  Logger.log("GitHub file content read; characters=" + content.length + ".");
}

function publishFile(file, message) {

  const github = getGitHubConfig();

  let encodedContent;

if (file.binary) {

  encodedContent =
    Utilities.base64Encode(file.bytes);

} else {

  encodedContent =
    Utilities.base64Encode(
      Utilities.newBlob(
        file.content,
        "application/javascript"
      ).getBytes()
    );

}

  const sha =
    getFileSha(file.fileName);

  const url =
    "https://api.github.com/repos/" +
    github.owner +
    "/" +
    github.repo +
    "/contents/" +
    file.fileName;

  const body = {

    message:
      message,

    content:
      encodedContent,

    branch:
      github.branch

};

if (sha) {

    body.sha = sha;

}

  const response = githubLegacyFetch(url, {

    method: "put",

    contentType:
      "application/json",

    headers: {

      Authorization:
        "Bearer " + github.token,

      Accept:
        "application/vnd.github+json"

    },

    payload:
      JSON.stringify(body),

    muteHttpExceptions: true

  });

  const code =
    response.getResponseCode();

if (
    code !== 200 &&
    code !== 201
) {

    throw githubLegacyHttpError(response, "put", url);

}

  return true;

}

function deleteFile(path, message) {

  const github = getGitHubConfig();

  const sha =
    getFileSha(path);

  if (!sha) {

    return false;

  }

  const url =
    "https://api.github.com/repos/" +
    github.owner +
    "/" +
    github.repo +
    "/contents/" +
    path;

  const body = {

    message: message,

    sha: sha,

    branch: github.branch

  };

  const response =
    githubLegacyFetch(url, {

      method: "delete",

      contentType:
        "application/json",

      headers: {

        Authorization:
          "Bearer " + github.token,

        Accept:
          "application/vnd.github+json"

      },

      payload:
        JSON.stringify(body),

      muteHttpExceptions: true

    });

  const code =
    response.getResponseCode();

  if (
    code !== 200 &&
    code !== 204
  ) {

    throw githubLegacyHttpError(response, "delete", url);

  }

  return true;

}

function testGetFileSha() {
  Logger.log("GitHub file SHA lookup completed: " + Boolean(getFileSha("data.js")) + ".");
}

function publishDataJS(products) {

  // Use the same missing-folder safeguards as media refresh.
  // This preserves previously published image paths when a SKU's
  // Drive folder is missing, while allowing real Drive/API errors
  // to abort publication instead of silently publishing empty data.
  const inventory =
    getMediaSyncInventory(products);

  const previousManifest =
    getPublishedMediaManifest();

  const manifest =
    mergeMediaManifests(
      inventory.driveManifest,
      previousManifest,
      inventory.missingDriveSkus
    );

  if (inventory.missingDriveSkus.length) {
    Logger.log("WARNING: Drive folders missing; preserving published image paths in data.js.");
  }

  const file =
    generateDataJS(
      products,
      manifest
    );

  publishFile(
    file,
    "Publish data.js"
  );

}

function testDeleteFile() {

  deleteFile(

    "test-delete.txt",

    "Delete test file"

  );

  Logger.log(

    "Test file deleted."

  );

}

function testGetFolderFiles() {
  const files = getFolderFiles("images/W0027");
  Logger.log("GitHub folder file count=" + files.length + ".");
}

function testRepositoryTree() {
  const tree = getRepositoryTree();
  Logger.log("GitHub repository tree entry count=" + tree.length + ".");
}

function testRepositoryImages() {
  const images = getRepositoryImages();
  Logger.log("GitHub image entry count=" + (images["W0027"] || []).length + ".");
}
