/**
 * ============================================================
 * PREVIA CMS
 * Public Order Number Migration
 *
 * Backfills the human-facing VWJ number for historical orders
 * that predate the public order number column.
 * ============================================================
 */

function backfillMissingPublicOrderNumbers(orders) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Orders");

  if (!sheet) {
    throw new Error("Orders sheet is missing.");
  }

  ensurePublicOrderNumberColumn(sheet);

  const candidates = (Array.isArray(orders) ? orders : [])
    .filter(order => {
      return order &&
        order.order_id &&
        parsePublicOrderNumber(order.public_order_number) === 0;
    })
    .sort((left, right) => {
      const leftTime = new Date(left.created_at || 0).getTime();
      const rightTime = new Date(right.created_at || 0).getTime();

      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }

      return String(left.order_id).localeCompare(String(right.order_id));
    });

  const sheetHighest = getHighestPublicOrderNumber(orders);
  const storedLast = getStoredPublicOrderNumber();
  let nextNumber = Math.max(sheetHighest, storedLast) + 1;

  candidates.forEach(order => {
    const publicOrderNumber = formatPublicOrderNumber(nextNumber);
    writePublicOrderNumber(order.order_id, publicOrderNumber);
    nextNumber += 1;
  });

  const finalNumber = nextNumber - 1;
  if (finalNumber > Math.max(sheetHighest, storedLast)) {
    setLastPublicOrderNumber(finalNumber);
  } else if (sheetHighest > storedLast) {
    setLastPublicOrderNumber(sheetHighest);
  }

  return candidates.length;
}

function migrateExistingPublicOrderNumbers() {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);

    const count = backfillMissingPublicOrderNumbers(getOrders());
    Logger.log("Backfilled public order numbers: " + count);
    return count;
  } finally {
    lock.releaseLock();
  }
}
