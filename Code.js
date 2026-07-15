function onOpen() {

  SpreadsheetApp.getUi()

    .createMenu("PREVIA CMS")

    .addItem(
      "🚀 Publish Boutique",
      "publishBoutique"
    )

    .addItem(
      "🖼 Refresh Media",
      "refreshMedia"
    )

    .addSeparator()

    .addItem(
      "🚚 Migration Day",
      "migrateLegacyProducts"
    )

    .addToUi();

}

function reimportProducts(products){

  clearProducts();

  return importProducts(products);

}

function importProducts(products){

  if(!products || products.length === 0){

    throw new Error("No products to import.");

  }

  let imported = 0;

  products.forEach(product => {

    const normalized =
      normalizeProduct(product);

    saveProduct(normalized);

    imported++;

  });

  return imported;

}

function testNormalize(){

  const product = {

    category:"Прикраси",

    price:"4 800 UAH"

  };

  Logger.log(
    normalizeProduct(product)
  );

}

function testImportProducts(){

  const products = [

    {
      id:"TEST-0001",
      sku:"TEST0001",
      category:"Прикраси",
      brand:"Previa",
      name:"First Test",
      price:"120 €",
      status:"available",
      dateAdded:"2026-07-01",
      description:"First"
    },

    {
      id:"TEST-0002",
      sku:"TEST0002",
      category:"Годинники",
      brand:"Previa",
      name:"Second Test",
      price:"250 €",
      status:"available",
      dateAdded:"2026-07-01",
      description:"Second"
    },

    {
      id:"TEST-0003",
      sku:"TEST0003",
      category:"Прикраси",
      brand:"Previa",
      name:"Third Test",
      price:"4800 UAH",
      status:"available",
      dateAdded:"2026-07-01",
      description:"Third"
    }

  ];

  const imported =
    importProducts(products);

Logger.log(
    "Imported: " +
    imported
);

}

function testReimportProducts(){

  const products = [

    {
      id:"TEST-0001",
      sku:"TEST0001",
      category:"Прикраси",
      brand:"Previa",
      name:"First Test",
      price:"120 €",
      status:"available",
      dateAdded:"2026-07-01",
      description:"First"
    },

    {
      id:"TEST-0002",
      sku:"TEST0002",
      category:"Годинники",
      brand:"Previa",
      name:"Second Test",
      price:"250 €",
      status:"available",
      dateAdded:"2026-07-01",
      description:"Second"
    }

  ];

  const imported =
      reimportProducts(products);

  Logger.log(
      "Reimported: " +
      imported
  );

}