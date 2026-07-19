import type { PaymentStore } from "./payment-store";
import type { OrderStatus, PaymentEvent } from "./types";

const statusByType: Record<PaymentEvent["type"], OrderStatus> = {
  payment_pending: "pending",
  payment_succeeded: "paid",
  payment_failed: "failed",
};

export function handlePaymentEvent(store: PaymentStore, event: PaymentEvent): void {
  store.upsertOrder({
    orderId: event.orderId,
    status: statusByType[event.type],
    amountCents: event.amountCents,
  });
  if (event.type === "payment_succeeded") {
    store.recordCharge(event.orderId, event.amountCents);
  }
}
