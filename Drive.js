/**
 * ==========================================
 * PREVIA Drive Module
 * ------------------------------------------
 * Works only with Google Drive.
 * Does not know anything about products.
 * ==========================================
 */

function getProductsFolder() {

  const config = getConfig();

  return DriveApp.getFolderById(
    config.products_folder_id
  );

}

function getIncomingFolder() {

  const config = getConfig();

  return DriveApp.getFolderById(
    config.incoming_folder_id
  );

}

function getIncomingFolders() {

  const folder =
    getIncomingFolder();

  const folders =
    folder.getFolders();

  const list = [];

  while (folders.hasNext()) {

    list.push(
      folders.next()
    );

  }

  return sortIncomingFolders(list);

}

function testIncomingFolders() {

  const folders =
    getIncomingFolders();

  Logger.log(
    folders.length
  );

}

function testIncomingSort() {

  const folders =
    getIncomingFolders();

  folders.forEach(folder => {

    Logger.log(
      folder.getName()
    );

  });

}

function getProductImages(sku) {

  const config = getConfig();

  const rootFolder = DriveApp.getFolderById(
    config.products_folder_id
  );

  const folders =
    rootFolder.getFoldersByName(sku);

  if (!folders.hasNext()) {

    throw new Error(

      "Validation failed\n\n" +

      "SKU: " + sku +

      "\n\nReason:\nPhotos folder not found."

    );

  }

  const folder = folders.next();

  const files = folder.getFiles();

  const images = [];

  while (files.hasNext()) {

    const file = files.next();

    const extension =
      file.getName()
          .split(".")
          .pop()
          .toLowerCase();

    if (

      extension !== "jpg" &&
      extension !== "jpeg" &&
      extension !== "png" &&
      extension !== "webp"

    ) {

      continue;

    }

    images.push(file.getName());

  }

  if (images.length === 0) {

    throw new Error(

      "Validation failed\n\n" +

      "SKU: " + sku +

      "\n\nReason:\nNo images found."

    );

  }

  images.sort((a, b) =>
    a.localeCompare(
      b,
      undefined,
      {
        numeric: true,
        sensitivity: "base"
      }
    )
  );

  return images;

}

function getProductFiles(sku) {

  const config = getConfig();

  const rootFolder = DriveApp.getFolderById(
    config.products_folder_id
  );

  const folders =
    rootFolder.getFoldersByName(sku);

  if (!folders.hasNext()) {

    throw new Error(

      "Validation failed\n\n" +

      "SKU: " + sku +

      "\n\nReason:\nPhotos folder not found."

    );

  }

  const folder = folders.next();

  const files = folder.getFiles();

  const result = [];

  while (files.hasNext()) {

    const file = files.next();

    const extension =
      file.getName()
          .split(".")
          .pop()
          .toLowerCase();

    if (

      extension !== "jpg" &&
      extension !== "jpeg" &&
      extension !== "png" &&
      extension !== "webp"

    ) {

      continue;

    }

    result.push({

      id: file.getId(),

      name: file.getName(),

      updated: file
        .getLastUpdated()
        .toISOString()

});

  }

  result.sort((a, b) =>
    a.name.localeCompare(
      b.name,
      undefined,
      {
        numeric: true,
        sensitivity: "base"
      }
    )
  );

  return result;

}

function getDriveFileBytes(fileId) {

  const file =
    DriveApp.getFileById(fileId);

  return {

    name: file.getName(),

    bytes: file.getBlob().getBytes(),

    mimeType: file.getMimeType()

  };

}

function testGetDriveFileBytes() {

  const file =
    getDriveFileBytes(
      "1E-fxu-kjexDdn9dNlzUSuSsqeh55s4VC"
    );

  Logger.log(file.name);

  Logger.log(file.mimeType);

  Logger.log(file.bytes.length);

}

function testGetProductImages() {

  const images =
    getProductImages("J0001");

  Logger.log(images);

}