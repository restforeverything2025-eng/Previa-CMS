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

    Logger.log(
      "PREVIA order document enqueue start: order_id=" +
      orderId +
      ", rows=" +
      state.values.length +
      ", order_id_column=" +
      state.orderIdColumn +
      ", document_status_column=" +
      state.documentStatusColumn +
      ", document_error_column=" +
      state.documentErrorColumn
    );

    for (let rowIndex = 1; rowIndex < state.values.length; rowIndex += 1) {
      if (String(state.values[rowIndex][state.orderIdColumn]).trim() !== String(orderId).trim()) {
        continue;
      }

      const currentStatus = String(
        state.values[rowIndex][state.documentStatusColumn]
      ).trim().toLowerCase();

      if (currentStatus === ORDER_DOCUMENT_STATUS_READY) {
        Logger.log(
          "PREVIA order document enqueue skipped: order_id=" +
          orderId +
          ", status=ready"
        );
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

      SpreadsheetApp.flush();

      const verifiedStatus = String(
        sheet
          .getRange(rowIndex + 1, state.documentStatusColumn + 1)
          .getValue()
      ).trim().toLowerCase();

      Logger.log(
        "PREVIA order document enqueue complete: order_id=" +
        orderId +
        ", row=" +
        (rowIndex + 1) +
        ", status=" +
        verifiedStatus
      );

      if (verifiedStatus !== ORDER_DOCUMENT_STATUS_PENDING) {
        throw new Error(
          "Document status was not persisted as pending. Actual value: " +
          verifiedStatus
        );
      }

      return {
        success: true,
        status: ORDER_DOCUMENT_STATUS_PENDING
      };
    }

    throw new Error("Order not found: " + orderId);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);

    Logger.log(
      "PREVIA order document enqueue failed for " +
      orderId +
      ": " +
      message
    );

    return {
      success: false,
      code: "DOCUMENT_QUEUE_ERROR",
      message: message
    };
  }
}
