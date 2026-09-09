/**
 * PREVIA order document queue.
 * Keeps PDF generation outside the critical order transaction.
 */

function markOrderDocumentPending(orderId) {
  if (!orderId) {
    return {
      success: false,
      code: "VALIDATION_ERROR"
    };
  }

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Orders");

    if (!sheet) {
      throw new Error("Orders sheet is missing.");
    }

    const state = getOrderDocumentColumns(sheet);

    for (let rowIndex = 1; rowIndex < state.values.length; rowIndex += 1) {
      if (String(state.values[rowIndex][state.orderIdColumn]).trim() !== String(orderId).trim()) {
        continue;
      }

      const currentStatus = String(
        state.values[rowIndex][state.documentStatusColumn]
      ).trim().toLowerCase();

      if (currentStatus === ORDER_DOCUMENT_STATUS_READY) {
        return {
          success: true,
          status: ORDER_DOCUMENT_STATUS_READY,
          skipped: true
        };
      }

      sheet
        .getRange(rowIndex + 1, state.documentStatusColumn + 1)
        .setValue(ORDER_DOCUMENT_STATUS_PENDING);

      sheet
        .getRange(rowIndex + 1, state.documentErrorColumn + 1)
        .setValue("");

      return {
        success: true,
        status: ORDER_DOCUMENT_STATUS_PENDING
      };
    }

    throw new Error("Order not found: " + orderId);
  } catch (error) {
    Logger.log(
      "PREVIA order document enqueue failed for " +
      orderId + ": " +
      (error && error.message ? error.message : String(error))
    );

    return {
      success: false,
      code: "DOCUMENT_QUEUE_ERROR"
    };
  }
}
