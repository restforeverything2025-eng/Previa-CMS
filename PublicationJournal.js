/**
 * ==========================================
 * PREVIA Publication Journal
 * ------------------------------------------
 * Stores publication history.
 * ==========================================
 */

const PublicationJournal = (() => {

  const SHEET_NAME = "PublicationJournal";

  function getSheet() {

    const spreadsheet =
      SpreadsheetApp.getActiveSpreadsheet();

    let sheet =
      spreadsheet.getSheetByName(
        SHEET_NAME
      );

    if (sheet) {

      return sheet;

    }

    sheet =
      spreadsheet.insertSheet(
        SHEET_NAME
      );

    sheet.appendRow([

      "Date",

      "Products",

      "New Products",

      "Result",

      "Message"

    ]);

    sheet.setFrozenRows(1);

    sheet.getRange(1, 1, 1, 5)
  .setFontWeight("bold");

    sheet.getRange(1, 1, 1, 5)
  .createFilter();

    sheet.autoResizeColumns(1, 5);

    return sheet;

  }

  function add(entry) {

    const sheet =
      getSheet();

    sheet.appendRow([

      new Date(),

      entry.products,

      entry.newProducts,

      entry.result,

      entry.message

    ]);

  }

  function success(products, newProducts) {

    add({

      products: products,

      newProducts: newProducts,

      result: "SUCCESS",

      message: "Publication completed."

    });

  }

  function failure(products, newProducts, error) {

    add({

      products: products,

      newProducts: newProducts,

      result: "FAILED",

      message: error.message

    });

  }

  function formatJournal() {

  const sheet =
    getSheet();

  sheet.setFrozenRows(1);

  sheet.getRange(1, 1, 1, 5)
    .setFontWeight("bold");

  if (!sheet.getFilter()) {

    sheet.getRange(1, 1, 1, 5)
      .createFilter();

  }

  sheet.autoResizeColumns(1, 5);

}

  return {

    success,

    failure,

    formatJournal,

  };

})();

function testFormatJournal() {

  PublicationJournal.formatJournal();

}