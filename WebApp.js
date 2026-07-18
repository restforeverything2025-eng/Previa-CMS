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

  return publishBoutique(false);

}

function refreshImagesFromWeb() {

  Logger.log("refreshImagesFromWeb started");

  refreshMedia();

  return "Images synchronized successfully.";

}