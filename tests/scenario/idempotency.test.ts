import { describe, expect, it } from "vitest";

import { PaymentStore } from "@/demo/idempotency/template/src/payment-store";
import type { PaymentEvent } from "@/demo/idempotency/template/src/types";
import { handlePaymentEvent } from "@/demo/idempotency/template/src/webhook-handler";

function correctHandler(store: PaymentStore, event: PaymentEvent): void {
  if (store.hasProcessedEvent(event.eventId)) return;
  store.markEventProcessed(event.eventId);
  const existing = store.getOrder(event.orderId);
  const nextStatus =
    event.type === "payment_succeeded"
      ? "paid"
      : event.type === "payment_failed"
        ? "failed"
        : "pending";
  if (existing?.status === "paid" && nextStatus !== "paid") return;
  if (existing?.status === "failed") return;
  store.upsertOrder({
    orderId: event.orderId,
    status: nextStatus,
    amountCents: event.amountCents,
  });
  if (nextStatus === "paid" && existing?.status !== "paid") {
    store.recordCharge(event.orderId, event.amountCents);
  }
}

const succeeded = {
  eventId: "evt_paid",
  orderId: "order_1",
  type: "payment_succeeded",
  amountCents: 1000,
} as const;

describe("idempotency scenario knowledge trap", () => {
  it("naive committed handler passes the ordinary happy path", () => {
    const store = new PaymentStore();
    handlePaymentEvent(store, succeeded);
    expect(store.getOrder("order_1")?.status).toBe("paid");
  });

  it("naive committed handler double-charges on a duplicate event", () => {
    const store = new PaymentStore();
    handlePaymentEvent(store, succeeded);
    handlePaymentEvent(store, succeeded);
    const charges = store.ledgerEntries().filter((entry) => entry.startsWith("charge:order_1"));
    expect(charges.length).toBeGreaterThan(1);
  });

  it("naive committed handler downgrades a paid order on a late pending event", () => {
    const store = new PaymentStore();
    handlePaymentEvent(store, succeeded);
    handlePaymentEvent(store, {
      eventId: "evt_late_pending",
      orderId: "order_1",
      type: "payment_pending",
      amountCents: 1000,
    });
    expect(store.getOrder("order_1")?.status).toBe("pending");
  });

  it("correct handler charges exactly once for a duplicate event", () => {
    const store = new PaymentStore();
    correctHandler(store, succeeded);
    correctHandler(store, succeeded);
    const charges = store.ledgerEntries().filter((entry) => entry.startsWith("charge:order_1"));
    expect(charges).toHaveLength(1);
  });

  it("correct handler protects a paid order from a late pending event", () => {
    const store = new PaymentStore();
    correctHandler(store, succeeded);
    correctHandler(store, {
      eventId: "evt_late_pending",
      orderId: "order_1",
      type: "payment_pending",
      amountCents: 1000,
    });
    expect(store.getOrder("order_1")?.status).toBe("paid");
  });

  it("correct handler protects a paid order from a later failed event", () => {
    const store = new PaymentStore();
    correctHandler(store, succeeded);
    correctHandler(store, {
      eventId: "evt_later_failed",
      orderId: "order_1",
      type: "payment_failed",
      amountCents: 1000,
    });
    expect(store.getOrder("order_1")?.status).toBe("paid");
  });
});
