/**
 * ============================================================
 * PREVIA CMS
 * Orders Service
 * ============================================================
 *
 * Reads and writes Orders and OrderItems
 * in Google Sheets.
 *
 * This module is storage-related only.
 * Business rules belong to PREVIA Core.
 * ============================================================
 */

const ORDERS_SHEET = "Orders";
const ORDER_ITEMS_SHEET = "OrderItems";


function getOrders() {

  const sheet =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(ORDERS_SHEET);

  const data =
    sheet
      .getDataRange()
      .getValues();

  if (data.length <= 1) {
    return [];
  }

  const headers = data[0];

  const orders = [];

  for (let i = 1; i < data.length; i++) {

    if (
      data[i].every(cell => cell === "")
    ) {
      continue;
    }

    const order = {};

    for (let j = 0; j < headers.length; j++) {

      order[headers[j]] =
        data[i][j];

    }

    orders.push(order);
  }

  return orders;
}


function getOrderItems(orderId) {

  const sheet =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(ORDER_ITEMS_SHEET);

  const data =
    sheet
      .getDataRange()
      .getValues();

  if (data.length <= 1) {
    return [];
  }

  const headers = data[0];

  const items = [];

  for (let i = 1; i < data.length; i++) {

    if (
      data[i].every(cell => cell === "")
    ) {
      continue;
    }

    if (
      data[i][0] !== orderId
    ) {
      continue;
    }

    const item = {};

    for (let j = 0; j < headers.length; j++) {

      item[headers[j]] =
        data[i][j];

    }

    items.push(item);
  }

  return items;
}


function findOrderById(orderId) {

  const orders =
    getOrders();

  const order =
    orders.find(
      item => item.order_id === orderId
    );

  if (!order) {
    return null;
  }

  return {
    order: order,
    items: getOrderItems(orderId)
  };
}


function saveOrder(order, items = []) {

  const spreadsheet =
    SpreadsheetApp
      .getActiveSpreadsheet();

  const ordersSheet =
    spreadsheet
      .getSheetByName(ORDERS_SHEET);

  const itemsSheet =
    spreadsheet
      .getSheetByName(ORDER_ITEMS_SHEET);


  const orderHeaders =
    ordersSheet
      .getRange(
        1,
        1,
        1,
        ordersSheet.getLastColumn()
      )
      .getValues()[0];


  const orderRow = [];

  orderHeaders.forEach(header => {

    if (
      Object.prototype.hasOwnProperty.call(
        order,
        header
      )
    ) {

      orderRow.push(
        order[header]
      );

    } else {

      orderRow.push("");

    }

  });


  ordersSheet.appendRow(orderRow);


  const itemHeaders =
    itemsSheet
      .getRange(
        1,
        1,
        1,
        itemsSheet.getLastColumn()
      )
      .getValues()[0];


  items.forEach(item => {

    const itemRow = [];

    itemHeaders.forEach(header => {

      if (
        Object.prototype.hasOwnProperty.call(
          item,
          header
        )
      ) {

        itemRow.push(
          item[header]
        );

      } else {

        itemRow.push("");

      }

    });

    itemsSheet.appendRow(itemRow);

  });


  return {
    order: order,
    items: items
  };
}


function testGetOrders() {

  const orders =
    getOrders();

  Logger.log(orders);

}


function testFindOrderById() {

  const result =
    findOrderById("TEST-003");

  Logger.log(result);

}

function testSaveOrder() {

  const order = {
    order_id: "TEST-003",
    created_at: new Date(),
    source: "telegram",
    customerId: "",
    provider: "telegram",
    providerId: "1234567890",
    telegram_username: "",
    telegram_name: "",
    customer_name: "Test Customer",
    phone: "+380000000000",
    email: "test@example.com",
    payment_type: "full",
    payment_method: "card",
    payment_status: "",
    order_status: "new",
    subtotal: 250,
    total: 250,
    expires_at: "",
    paid_at: "",
    document_url: "",
    note: ""
  };


  const items = [
    {
      order_id: "TEST-003",
      sku: "W0002",
      title: "Test Vintage Watch",
      price: 250,
      quantity: 1,
      subtotal: 250
    }
  ];


  const result =
    saveOrder(order, items);


  Logger.log(result);

}

function testOrdersStructure() {

    const spreadsheet =
        SpreadsheetApp
            .getActiveSpreadsheet();


    const sheet =
        spreadsheet
            .getSheetByName(ORDERS_SHEET);


    const lastColumn =
        sheet.getLastColumn();


    const headers =
        sheet
            .getRange(
                1,
                1,
                1,
                lastColumn
            )
            .getValues()[0];


    Logger.log(
        "=== ORDERS HEADERS ==="
    );


    headers.forEach(
        (header, index) => {

            Logger.log(
                index +
                " | [" +
                header +
                "] | length=" +
                String(header).length
            );

        }
    );


    const lastRow =
        sheet.getLastRow();


    if (lastRow < 2) {

        Logger.log(
            "No order rows found."
        );

        return;

    }


    const values =
        sheet
            .getRange(
                lastRow,
                1,
                1,
                lastColumn
            )
            .getValues()[0];


    Logger.log(
        "=== LAST ORDER ROW ==="
    );


    values.forEach(
        (value, index) => {

            Logger.log(
                index +
                " | header=[" +
                headers[index] +
                "] | value=[" +
                value +
                "]"
            );

        }
    );

}

function testFindDebug() {

    const orders =
        getOrders();

    Logger.log(
        "Orders count: " +
        orders.length
    );

    orders.forEach(
        (order, index) => {

            Logger.log(
                "INDEX=" +
                index +
                " | order_id=[" +
                order.order_id +
                "] | type=" +
                typeof order.order_id
            );

        }
    );

    const target =
        "TEST-003";

    Logger.log(
        "Target=[" +
        target +
        "] | type=" +
        typeof target
    );

    const found =
        orders.find(
            order =>
                order.order_id === target
        );

    Logger.log(
        "FOUND:"
    );

    Logger.log(found);

}
