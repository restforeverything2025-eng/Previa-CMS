function writeGeneratedFields(products) {

  const sheet =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName("Products");

  const data =
    sheet.getDataRange().getValues();

  const headers = data[0];

  const idColumn =
    headers.indexOf("id");

  const skuColumn =
    headers.indexOf("sku");

  for (let i = 1; i < data.length; i++) {

    const product =
      products[i - 1];

    if (
      data[i][idColumn] === ""
    ) {

      sheet
        .getRange(i + 1, idColumn + 1)
        .setValue(product.id);

    }

    if (
      data[i][skuColumn] === ""
    ) {

      sheet
        .getRange(i + 1, skuColumn + 1)
        .setValue(product.sku);

    }

  }

}