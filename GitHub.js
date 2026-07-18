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

function testGitHubConfig() {

  const github = getGitHubConfig();

  Logger.log(github);

}

function testGitHubConnection() {

  const github = getGitHubConfig();

  const url =
    "https://api.github.com/repos/" +
    github.owner +
    "/" +
    github.repo;

  const response = UrlFetchApp.fetch(url, {

    method: "get",

    headers: {

      Authorization:
        "Bearer " + github.token,

      Accept:
        "application/vnd.github+json"

    },

    muteHttpExceptions: true

  });

  Logger.log(response.getResponseCode());

  Logger.log(response.getContentText());

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

  const response = UrlFetchApp.fetch(url, {

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

  throw new Error(
    response.getContentText()
  );

}

  const file =
    JSON.parse(response.getContentText());

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

  const response = UrlFetchApp.fetch(url, {

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

    throw new Error(
      response.getContentText()
    );

  }

  const file =
    JSON.parse(
      response.getContentText()
    );

  return Utilities.newBlob(

    Utilities.base64Decode(
      file.content
    )

  ).getDataAsString();

}

function testGetFileContent() {

  const content =
    getFileContent("data.js");

  Logger.log(typeof content);

  Logger.log(content.length);

  Logger.log(
    content.substring(0, 200)
  );

}

function publishFile(file) {

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
      "PREVIA CMS Publish",

    content:
      encodedContent,

    branch:
      github.branch

};

if (sha) {

    body.sha = sha;

}

  const response = UrlFetchApp.fetch(url, {

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

    throw new Error(
        response.getContentText()
    );

}

  return true;

}

function testGetFileSha() {

  Logger.log(

    getFileSha("data.js")

  );

}

function publishDataJS(products) {

  const manifest =
    getMediaManifest();

  const file =
    generateDataJS(
      products,
      manifest
    );

  publishFile(file);

}