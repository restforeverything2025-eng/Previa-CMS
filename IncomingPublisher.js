function createProductFolder(sku) {

  const productsFolder =
    getProductsFolder();

  return productsFolder.createFolder(
    sku
  );

}

function testCreateProductFolder() {

  const folder =
    createProductFolder(
      "TEST"
    );

  Logger.log(
    folder.getName()
  );

}

function testDriveAccess() {

  const folder =
    getProductsFolder();

  Logger.log(
    folder.getName()
  );

}

function copyIncomingImages(sourceFolder, targetFolder) {

  const files =
    sourceFolder.getFiles();

  while (files.hasNext()) {

    const file =
      files.next();

    file.makeCopy(
      file.getName(),
      targetFolder
    );

  }

}

function testCopyIncomingImages() {

  const incoming =
    getIncomingFolder();

  const folders =
    getIncomingFolders();

  const sourceFolder =
    folders[0];

  const targetFolder =
    createProductFolder(
      "COPY_TEST"
    );

  copyIncomingImages(
    sourceFolder,
    targetFolder
  );

  Logger.log("Done");

}

function productFolderExists(sku) {

  const productsFolder =
    getProductsFolder();

  const folders =
    productsFolder.getFoldersByName(
      sku
    );

  return folders.hasNext();

}

function testProductFolderExists() {

  Logger.log(
    productFolderExists("TEST")
  );

}

function prepareProductFolders(products) {

  const pairs =
    matchProductsToFolders(products);

  pairs.forEach(pair => {

    if (
      productFolderExists(
        pair.product.sku
      )
    ) {

      throw new Error(

        "Folder already exists: " +

        pair.product.sku

      );

    }

    const targetFolder =
      createProductFolder(
        pair.product.sku
      );

    copyIncomingImages(

      pair.folder,

      targetFolder

    );

  });

}

function testPrepareProductFolders() {

  const products =
    getProducts();

  assignId(products);

  assignSku(products);

  validateIncoming(products);

  prepareProductFolders(products);

  Logger.log("OK");

}

function cleanupIncoming() {

  const folders =
    getIncomingFolders();

  folders.forEach(folder => {

    folder.setTrashed(true);

  });

}