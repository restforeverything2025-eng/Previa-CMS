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

  Logger.log({
    project: config.project,
    version: config.version,
    schema: config.schema,
    github_owner: config.github_owner,
    github_repo: config.github_repo,
    github_branch: config.github_branch,
    products_sheet: config.products_sheet,
    archive_sheet: config.archive_sheet,
    currencies: config.currencies,
    statuses: config.statuses,
    categories: config.categories,

    github_token: config.github_token
      ? "[REDACTED]"
      : "[MISSING]",

    payment_iban: config.payment_iban
      ? "[REDACTED]"
      : "[MISSING]",

    payment_edrpou: config.payment_edrpou
      ? "[REDACTED]"
      : "[MISSING]",

    payment_recipient: config.payment_recipient
      ? "[REDACTED]"
      : "[MISSING]",

    payment_purpose: config.payment_purpose
      ? "[REDACTED]"
      : "[MISSING]"
  });
}
