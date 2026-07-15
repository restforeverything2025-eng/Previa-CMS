function publishBoutique() {

  const products =
    getProducts();

    PublishReport.reset();

    PublishReport.add("Количество товаров: " + products.length);
    PublishReport.add("");

  if (!hasNewProducts(products)) {

  publishDataJS(products);

  PublishReport.add("✓ Обновлён data.js");
  PublishReport.add("✓ Новых товаров нет");
  PublishReport.add("✓ Публикация завершена");

  PublishReport.show(
    "PREVIA CMS\n\nОтчёт публикации"
  );

  return;

}

  try {

    assignId(products);

    PublishReport.add("✓ Назначены ID");

    assignSku(products);

    PublishReport.add("✓ Назначены SKU");

    normalizeProducts(products);

    PublishReport.add("✓ Данные нормализованы");

    validateIncoming(products);

    PublishReport.add("✓ Проверены новые товары");

    validateProducts(products);

    PublishReport.add("✓ Проверка данных пройдена");

    prepareProductFolders(products);

    PublishReport.add("✓ Подготовлены папки товаров");

    validateImages(products);

    PublishReport.add("✓ Проверены изображения");

    publishDataJS(products);

    PublishReport.add("✓ Обновлён data.js");

    writeGeneratedFields(products);

    PublishReport.add("✓ Обновлена Google Sheets");

    cleanupIncoming(products);

    PublishReport.add("✓ Очищена папка incoming");

    PublishReport.add("✓ Публикация завершена");

    PublishReport.show("PREVIA CMS\n\nОтчёт публикации");

    return;

  }

    catch (error) {

    throw error;

  }

}

function refreshMedia() {

  syncMedia();

}
