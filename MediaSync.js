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

function compareMediaManifest() {

  const drive =
    getMediaManifest();

  const operations = [];

  Object.keys(drive).forEach(sku => {

    const driveFiles =
      drive[sku];

    const githubFiles =
      getFolderFiles(
        "images/" + sku
      );

    // Upload

    driveFiles.forEach(file => {

      const exists =
        githubFiles.find(item =>

          item.name === file.name

        );

      if (!exists) {

        operations.push({

          action: "upload",

          sku: sku,

          file: file

        });

      }

    });

    // Delete

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

      let uploaded = 0;

      let deleted = 0;

  if (operations.length === 0) {

  Logger.log(
    "Media already synchronized."
  );

  return (

    "Uploaded: 0" +

    "\nDeleted: 0" +

    "\n\nMedia already synchronized."

  );

}

  operations.forEach(operation => {

    if (operation.action === "upload") {

      const driveFile =
        getDriveFileBytes(
          operation.file.id
        );

      publishFile({

        fileName:
          "images/" +
          operation.sku +
          "/" +
          driveFile.name,

        bytes:
          driveFile.bytes,

        binary: true

      },

      "Upload image " +
      operation.sku +
      "/" +
      driveFile.name);

      uploaded++;

      Logger.log(

        "Uploaded: " +

        operation.sku +

        "/" +

        driveFile.name

      );

    }

    if (operation.action === "delete") {

      deleteFile(

        operation.file.path,

        "Delete image " +

        operation.sku +

        "/" +

        operation.file.name

      );

      deleted++;

      Logger.log(

        "Deleted: " +

        operation.file.path

      );

    }

  });

  publishMediaManifest();

Logger.log(

  "Media synchronization completed."

);

return (

  "Uploaded: " +

  uploaded +

  "\nDeleted: " +

  deleted +

  "\n\nSynchronization completed successfully."

);

}

function testSyncMedia() {

  syncMedia();

}
