/**
 * ==========================================
 * PREVIA Dashboard
 * ------------------------------------------
 * Provides data for the CMS dashboard.
 * ==========================================
 */

function getDashboardData() {

  const products =
    getProducts();

  const newProducts =
    getNewProducts(products);

  const journal =
    getLastPublication();

  return {

    products:
      products.length,

    newProducts:
      newProducts.length,

    result:
      journal.result,

    date:
      journal.date

  };

}

function getLastPublication() {

  const sheet =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(
        "PublicationJournal"
      );

  if (!sheet) {

    return {

      result: "-",

      date: "-"

    };

  }

  const lastRow =
    sheet.getLastRow();

  if (lastRow <= 1) {

    return {

      result: "-",

      date: "-"

    };

  }

  const row =
    sheet
      .getRange(
        lastRow,
        1,
        1,
        5
      )
      .getValues()[0];

  return {

    date:
      Utilities.formatDate(

        row[0],

        Session.getScriptTimeZone(),

        "dd.MM.yyyy HH:mm"

      ),

    result:
      row[3]

  };

}
