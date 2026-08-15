/**
 * ============================================================
 * PREVIA CMS
 * Order Repository Adapter
 * ============================================================
 *
 * Adapts PREVIA-CMS storage functions to the PREVIA Core
 * OrderRepository contract.
 * ============================================================
 */

class OrderRepositoryAdapter {

  save(order, items) {
    return saveOrder(order, items);
  }

  findById(orderId) {
    return findOrderById(orderId);
  }
}
