/**
 * ==========================================
 * PREVIA Media Sync
 * ------------------------------------------
 * Synchronizes product images
 * between Google Drive and GitHub.
 * ==========================================
 */

function getMediaManifest(products) {

  if (!products) {
    products = getProducts();
  }
  
  const manifest = {};

  products.forEach(product => {

    manifest[product.sku] =
      getProductFiles(product.sku);

  });

  return manifest;

}

function testMediaManifest() {

  const manifest =
    getMediaManifest();

  Logger.log(

    JSON.stringify(
      manifest,
      null,
      2
    )

  );

}

function testDriveFileInfo() {

  const images =
    getProductImages("J0002");

  const folder =
    getProductsFolder()
      .getFoldersByName("J0002")
      .next();

  const files =
    folder.getFiles();

  while (files.hasNext()) {

    const file = files.next();

    Logger.log("----------------");

    Logger.log("Name: " + file.getName());

    Logger.log("Id: " + file.getId());

    Logger.log("Size: " + file.getSize());

    Logger.log("Updated: " + file.getLastUpdated());

    Logger.log("Mime: " + file.getMimeType());

  }

}

function generateMediaManifest() {

  return {

    fileName: "media-manifest.json",

    content: JSON.stringify(

      getMediaManifest(),

      null,

      2

    )

  };

}

function testGenerateMediaManifest() {

  const file =
    generateMediaManifest();

  Logger.log(file.fileName);

  Logger.log(file.content);

}

function getPublishedMediaManifest() {

  const content =
    getFileContent(
      "media-manifest.json"
    );

  if (!content) {

    return {};

  }

  return JSON.parse(content);

}

function testPublishedMediaManifest() {

  const manifest =
    getPublishedMediaManifest();

  Logger.log(

    JSON.stringify(
      manifest,
      null,
      2
    )

  );

}

function getGitHubBlobSha(bytes) {

  const header =
    Utilities.newBlob(
      "blob " + bytes.length + "\0"
    ).getBytes();

  const payload =
    header.concat(bytes);

  const digest =
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_1,
      payload
    );

  return digest
    .map(byte => {

      const value =
        byte < 0
          ? byte + 256
          : byte;

      return (
        "0" +
        value.toString(16)
      ).slice(-2);

    })
    .join("");

}

function compareMediaManifest() {

  const drive =
    getMediaManifest();

  // Read GitHub repository only once.
  const github =
    getRepositoryImages();

  const operations = [];

  Object.keys(drive).forEach(sku => {

    const driveFiles =
      drive[sku];

    const githubFiles =
      github[sku] || [];


    // =====================================================
    // UPLOAD / UPDATE
    // =====================================================

    driveFiles.forEach(file => {

      const githubFile =
        githubFiles.find(item =>
          item.name === file.name
        );

      // New file
      if (!githubFile) {

        operations.push({

          action: "upload",

          sku: sku,

          file: file

        });

        return;

      }


      // Existing file:
      // compare actual file content.

      const driveFile =
        getDriveFileBytes(
          file.id
        );

      const driveSha =
        getGitHubBlobSha(
          driveFile.bytes
        );

      if (driveSha !== githubFile.sha) {

        operations.push({

          action: "upload",

          sku: sku,

          file: file

        });

      }

    });


    // =====================================================
    // DELETE
    // =====================================================

    githubFiles.forEach(file => {

      const exists =
        driveFiles.find(item =>
          item.name === file.name
        );

      if (!exists) {

        operations.push({

          action: "delete",

          sku: sku,

          file: file

        });

      }

    });

  });

  return operations;

}

function testCompareMediaManifest() {

  const upload =
    compareMediaManifest();

  Logger.log(

    JSON.stringify(
      upload,
      null,
      2
    )

  );

}

function publishMediaManifest() {

  const file =
    generateMediaManifest();

  publishFile(
  file,
  "Publish media-manifest"
);

}

function testPublishMediaManifest() {

  publishMediaManifest();

  Logger.log(
    "Media Manifest published."
  );

}

function syncMedia() {

  const operations =
    compareMediaManifest();

  const uploadedFiles = [];
  const deletedFiles = [];

  if (operations.length === 0) {

    Logger.log(
      "Media already synchronized."
    );

    return (
      "Media already synchronized." +
      "\n\nUploaded: 0" +
      "\nDeleted: 0"
    );

  }

  operations.forEach(operation => {

    if (operation.action === "upload") {

      const driveFile =
        getDriveFileBytes(
          operation.file.id
        );

      const filePath =
        operation.sku +
        "/" +
        driveFile.name;

      publishFile({

        fileName:
          "images/" +
          filePath,

        bytes:
          driveFile.bytes,

        binary: true

      },

      "Upload image " +
      filePath);

      uploadedFiles.push(filePath);

      Logger.log(
        "Uploaded: " +
        filePath
      );

    }

    if (operation.action === "delete") {

      const filePath =
        operation.sku +
        "/" +
        operation.file.name;

      deleteFile(

        operation.file.path,

        "Delete image " +
        filePath

      );

      deletedFiles.push(filePath);

      Logger.log(
        "Deleted: " +
        filePath
      );

    }

  });

  publishMediaManifest();

  Logger.log(
    "Media synchronization completed."
  );

  let report =
    "Media synchronization completed.";

  report +=
    "\n\nUploaded: " +
    uploadedFiles.length;

  if (uploadedFiles.length > 0) {

    report +=
      "\n  • " +
      uploadedFiles.join("\n  • ");

  }

  report +=
    "\n\nDeleted: " +
    deletedFiles.length;

  if (deletedFiles.length > 0) {

    report +=
      "\n  • " +
      deletedFiles.join("\n  • ");

  }

  return report;

}

function testSyncMedia() {

  syncMedia();

}
