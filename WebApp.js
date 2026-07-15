function doGet() {

  return HtmlService
    .createHtmlOutputFromFile(
      "Index"
    )
    .setTitle(
      "PREVIA CMS"
    );

}

function publishFromWeb() {

Logger.log("publishFromWeb started");

  return publishBoutique();

}