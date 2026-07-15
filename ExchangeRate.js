/**
 * ==========================================
 * PREVIA Exchange Rate
 * ------------------------------------------
 * Retrieves exchange rates.
 * ==========================================
 */

function getExchangeRate() {

  try {

    const response =
      UrlFetchApp.fetch(
        "https://api.monobank.ua/bank/currency"
      );

    const data =
      JSON.parse(
        response.getContentText()
      );

    const eur =
      data.find(item =>
        item.currencyCodeA === 978 &&
        item.currencyCodeB === 980
      );

    if (!eur || !eur.rateSell) {

      throw new Error(
        "Monobank EUR rate not found."
      );

    }

    return {

      eurToUah: eur.rateSell,

      source: "Monobank",

      updated: Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        "yyyy-MM-dd"
      )

    };

  } catch (error) {

    Logger.log(
      "Monobank unavailable. Switching to NBU..."
    );

    const response =
      UrlFetchApp.fetch(
        "https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json"
      );

    const data =
      JSON.parse(
        response.getContentText()
      );

    const eur =
      data.find(item => item.cc === "EUR");

    if (!eur) {

      throw new Error(
        "EUR exchange rate not found."
      );

    }

    return {

      eurToUah: eur.rate,

      source: "НБУ",

      updated: Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        "yyyy-MM-dd"
      )

    };

  }

}

function testExchangeRate() {

  const rate =
    getExchangeRate();

  Logger.log(rate);

}