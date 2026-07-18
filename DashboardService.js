/**
 * ==========================================
 * PREVIA Dashboard
 * ------------------------------------------
 * Provides data for the CMS dashboard.
 * ==========================================
 */

function getDashboardData() {

  return {

    ...getProductStats(),

    ...getMediaStats(),

    ...getPublicationStats()

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

function getProductStats() {

  const products =
    getProducts();

  const newProducts =
    getNewProducts(products);

  return {

    products:
      products.length,

    newProducts:
      newProducts.length

  };

}

function getMediaStats() {

  const manifest =
  getPublishedMediaManifest();
  
  return {

    folders:
      Object.keys(manifest).length,

    images:
      Object
        .values(manifest)
        .reduce(

          (count, files) =>

            count + files.length,

          0

        )

  };

}

function getPublicationStats() {

  const journal =
    getLastPublication();

  return {

    result:
      journal.result,

    date:
      journal.date

  };

}