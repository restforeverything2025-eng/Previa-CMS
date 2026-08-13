/**
 * ============================================================
 * PREVIA CMS
 * Order Repository Adapter
 * ============================================================
 *
 * Adapts PREVIA-CMS storage functions to the
 * PREVIA Core OrderRepository contract.
 *
 * Core contract:
 *   save(order, items)
 *   findById(orderId)
 *
 * CMS implementation:
 *   saveOrder(order, items)
 *   findOrderById(orderId)
 * ============================================================
 */


class OrderRepositoryAdapter {

  save(order, items) {

    return saveOrder(
      order,
      items
    );

  }


  findById(orderId) {

    return findOrderById(
      orderId
    );

  }

}

function testOrderRepositoryAdapter() {

  const repository =
    new OrderRepositoryAdapter();


  const order = {

    order_id: "TEST-ADAPTER-001",

    created_at: new Date(),

    source: "telegram",

    customerId: "",

    provider: "telegram",

    providerId: "1234567890",

    telegram_username: "",

    telegram_name: "",

    customer_name: "Adapter Test",

    phone: "+380000000000",

    email: "adapter@test.com",

    payment_type: "full",

    payment_method: "card",

    payment_status: "",

    order_status: "new",

    subtotal: 150,

    total: 150,

    expires_at: "",

    paid_at: "",

    document_url: "",

    note: ""

  };


  const items = [

    {

      order_id: "TEST-ADAPTER-001",

      sku: "W0099",

      title: "Adapter Test Watch",

      price: 150,

      quantity: 1,

      subtotal: 150

    }

  ];


  const saved =
    repository.save(
      order,
      items
    );


  Logger.log(
    "Saved:"
  );

  Logger.log(
    saved
  );


  const found =
    repository.findById(
      "TEST-ADAPTER-001"
    );


  Logger.log(
    "Found:"
  );

  Logger.log(
    found
  );

}
