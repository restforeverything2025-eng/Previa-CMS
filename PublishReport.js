/**
 * ==========================================
 * PREVIA Publish Report
 * ------------------------------------------
 * Displays publish result.
 * ==========================================
 */

const PublishReport = (() => {

  let lines = [];

  function reset() {

    lines = [];

  }

  function add(message) {

    lines.push(message);

  }

  function build(title) {

  return (

    title +

    "\n\n" +

    lines.join("\n")

  );

}

function show(title) {

  SpreadsheetApp
    .getUi()
    .alert(

      build(title)

    );

}

  return {

    reset,
    add,
    build,
    show

};

})();

function testPublishReport() {

  PublishReport.reset();

  PublishReport.add("✓ Назначены ID");
  PublishReport.add("✓ Назначены SKU");
  PublishReport.add("✓ Данные нормализованы");
  PublishReport.add("✓ Проверены новые товары");
  PublishReport.add("✓ Проверка данных пройдена");
  PublishReport.add("✓ Подготовлены папки товаров");
  PublishReport.add("✓ Проверены изображения");
  PublishReport.add("✓ Обновлён data.js");
  PublishReport.add("✓ Обновлена Google Sheets");
  PublishReport.add("✓ Очищена папка incoming");

  Logger.log(

    PublishReport.build(

      "PREVIA CMS\n\nОтчёт публикации"

    )

  );

}