/**
 * ==========================================
 * PREVIA - Migration Day
 * ------------------------------------------
 * One-time migration from legacy data.js
 * into Google Sheets.
 *
 * After successful migration this file
 * should be removed from the project.
 * ==========================================
 */

function migrateLegacyProducts() {

  const answer = SpreadsheetApp.getUi().alert(
    "Migration Day",
    "This will import all legacy products into Google Sheets.\n\nContinue?",
    SpreadsheetApp.getUi().ButtonSet.YES_NO
  );

  if (answer !== SpreadsheetApp.getUi().Button.YES) {
    return;
  }

  const products = getLegacyProducts();

  const imported = importProducts(products);

  const sheetProducts = getProducts();

  if (sheetProducts.length !== products.length) {

    throw new Error(
      "Migration verification failed.\n\n" +
      "Expected: " + products.length +
      "\nImported: " + sheetProducts.length
    );

  }

  SpreadsheetApp.getUi().alert(
    "✅ Migration completed successfully!\n\n" +
    "Imported products: " + imported
  );

}


/**
 * Legacy catalog.
 * Paste products from data.js below.
 * Do NOT edit objects manually.
 */
function getLegacyProducts() {

  const products = [

{
    id: "PV-0001",
    sku: "J0001",
    name: "Підвіска з синім каменем",
    category: "Прикраси",
    brand:"Swarovski",
    price: "120 €",
    status: "available",
    dateAdded: "2026-06-24",
    description: `Синє кільце кулон стильна підвіска у формі об'ємного синього кола з яскравим блиском маленьким камінням на срібному ланцюжку.
Яскрава, сучасна ефектна прикраса в подарунковій синій коробочці чудовий варіант для тих, хто любить незвичайні акценти`,
    images: [
        "images/blue-stone.jpg"
    ]
},

  {
    id: "PV-0002",
    sku: "J0002",
    name: "Кришталеве серце",
    category: "Прикраси",
    brand:"Swarovski",
    price: "140 €",
    status: "available",
    dateAdded: "2026-06-24",
    description: "Елегантне кришталеве серце Swarovski...",
    images: [
        "images/crystal-heart-1.jpg",
        "images/crystal-heart-2.jpg",
        "images/crystal-heart-3.jpg"
    ]
  },

  {
    id: "PV-0003",
    sku: "J0003",
    name: "Серце з шармами",
    category: "Прикраси",
    brand:"Swarovski",
    price: "110 €",
    status: "available",
    dateAdded: "2026-06-24",
    description: `Срібне серце з шармами - витончений кулон у вигляді великого відкритого серця, прикрашеного блискучим камінням, з підвісками у вигляді рожевого серця, ключа і ще одного серця на тонкій срібній ланцюжку.
Романтична ніжна прикраса, яка ідеально передає настрій кохання та стане чудовим подарунком`,
    images: [
        "images/charm-heart-1.jpg",
        "images/charm-heart-2.jpg",
        "images/charm-heart-3.jpg"
    ]
  },

  {
    id: "PV-0004",
    sku: "W0004",
    name: "Nina Ricci",
    category: "Годинники",
    brand:"Nina Ricci Paris",
    price: "700 €",
    status: "available",
    dateAdded: "2026-06-24",
    description: `Елегантний золотий годинник Nina Ricci Paris - прямокутний корпус з білим циферблатом римськими цифрами, на широкому золотому браслеті в комплекті зі змінними ремінцями (червоний крокодил, чорний)`,
    images: [
        "images/nina-ricci-1.jpg",
        "images/nina-ricci-2.jpg",
        "images/nina-ricci-3.jpg"
    ]
  },

{
    id: "PV-0005",
    sku: "J0005",
    name: "Сережки в зеленому кольорі",
    category: "Прикраси",
    brand:"Two Sisters",
    price: "4 800 UAH",
    status: "available",
    dateAdded: "2026-06-24",
    description: `Сережки в ніжно зеленому кольорі з матовою поверхнею, бренду Two Sisters`,
    images: [
        "images/Two-Sisters-1.jpg",
        "images/Two-Sisters-2.jpg",
        "images/Two-Sisters-3.jpg"
    ]
  },

  {
    id: "PV-0006",
    sku: "W0006",
    name: "Gucci 1400 L",
    category: "Годинники",
    brand:"Gucci",
    price: "440 €",
    status: "available",
    dateAdded: "2026-06-24",
    description: `Елегантний годинник. Престижне та лаконічне жіноче прикраса відомого бренду - чудовий вибір для щоденного носіння та елегантного образу. Круглий корпус із полірованої нержавіючої сталі, швейцарського виробництва, з водозахистом 3 АТМ, на стильному металевому браслеті.`,
    images: [
        "images/Gucci-1.jpg",
        "images/Gucci-2.jpg",
        "images/Gucci-3.jpg"
    ]
  },

  {
    id: "PV-0007",
    sku: "J0007",
    name: "Елегантні вінтажні кліпси",
    category: "Прикраси",
    brand:"Elizabeth Taylor",
    price: "160 €",
    status: "available",
    dateAdded: "2026-06-28",
    description: `Вінтажні кліпси у вигляді золотих троянд, оздоблені сяючими кристалами. Вишуканий дизайн із романтичним характером, що стане яскравим акцентом як для вечірнього образу, або для особливих подій.`,
    images: [
        "images/Elizabeth-Taylor-1.jpg",
        "images/Elizabeth-Taylor-2.jpg"
    ]
  },

  {
    id: "PV-0008",
    sku: "W0008",
    name: "Lancel",
    category: "Годинники",
    brand:"Lancel Paris",
    price: "550 €",
    status: "available",
    dateAdded: "2026-06-28",
    description: `Вінтажний годинник із витонченим прямокутним корпусом, римськими цифрами та браслетом золотистого відтінку. Елегантна французька класика, що підкреслює бездоганний смак та позачасовий стиль.`,
    images: [
        "images/Lancel Paris-1.jpg",
        "images/Lancel Paris-2.jpg",
        "images/Lancel Paris-3.jpg",
        "images/Lancel Paris-4.jpg",
        "images/Lancel Paris-5.jpg"
    ]
  },

  {
    id: "PV-0009",
    sku: "W0009",
    name: "Raymond Weil",
    category: "Годинники",
    brand:"Raymond Weil Genève",
    price: "450 €",
    status: "available",
    dateAdded: "2026-06-28",
    description: `Raymond Weil Genève Поєднання швейцарської майстерності та витонченого дизайну. Елегантний силует, золотистий браслет, кристали на циферблаті створюють образ стриманої розкоші.`,
    images: [
        "images/Raymond-Weil-1.jpg",
        "images/Raymond-Weil-2.jpg"
    ]
  },

  ];

  return products.map(product => {

    const legacy = { ...product };

    delete legacy.images;

    return legacy;

  });

}