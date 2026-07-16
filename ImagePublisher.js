/**
 * ==========================================
 * PREVIA Image Publisher
 * ==========================================
 */

function readImage(sku, fileName) {

  const folder = getProductsFolder();

  const folders =
    folder.getFoldersByName(sku);

  if (!folders.hasNext()) {

    throw new Error(
      "Images folder not found: " +
      sku
    );

  }

  const productFolder =
    folders.next();

  const files =
    productFolder.getFilesByName(fileName);

  if (!files.hasNext()) {

    throw new Error(
      "Image not found: " +
      fileName
    );

  }

  const image = files.next();

return {
  name: image.getName(),
  bytes: image.getBlob().getBytes()
};

}

function testReadImage() {

  const image = readImage(
    "J0001",
    "1.jpg"
  );

  Logger.log(image.name);

  Logger.log(image.bytes.length);

}

function publishProductImage(sku, fileName) {

  const image =
    readImage(sku, fileName);

  publishFile({

    fileName:
      "images/" + sku + "/" + image.name,

    bytes:
      image.bytes,

    binary:
      true

  });

}

function testPublishProductImage() {

  publishProductImage(
    "J0001",
    "1.jpg"
  );

  Logger.log(
    "Image published successfully."
  );

}

function publishProductImages(sku) {

  // Skip initial upload if the product folder
// has already been published.
  
    const exists = getFileSha(
    "images/" + sku + "/1.jpg"
  );

  if (exists) {

    return;

  }

  const folder = getProductsFolder();

  const folders = folder.getFoldersByName(sku);

  if (!folders.hasNext()) {

    throw new Error(
      "Images folder not found: " + sku
    );

  }

  const productFolder = folders.next();

  const files = productFolder.getFiles();

  while (files.hasNext()) {

    const file = files.next();

    publishProductImage(
      sku,
      file.getName()
    );

  }

}

function testPublishProductImages() {

  publishProductImages(
    "J0001"
  );

  Logger.log(
    "All images published."
  );

}

function publishAllImages(products) {

  for (const product of products) {

    publishProductImages(
      product.sku
    );

  }

}