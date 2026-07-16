/**
 * ==========================================
 * PREVIA Configuration Service
 * ------------------------------------------
 * Reads project configuration from
 * Google Sheets.
 * ==========================================
 */

function getConfig() {

  const sheet =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName("Config");

  const data =
    sheet.getDataRange().getValues();

  const config = {};

  for(let i = 1; i < data.length; i++){

    const key = data[i][0];
    const value = data[i][1];

    config[key] = value;

  }

  return config;

}

function testConfig() {

  const config = getConfig();

  Logger.log(config);

}