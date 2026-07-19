import { describe, expect, it } from "vitest";

import { PaymentStore } from "../src/payment-store";
import { handlePaymentEvent } from "../src/webhook-handler";

describe("payment idempotency acceptance", () => {
  it("processes a duplicate event exactly once", () => {
    const store = new PaymentStore();
    const event = {
      eventId: "evt_duplicate",
      orderId: "order_1",
      type: "payment_succeeded",
      amountCents: 1000,
    } as const;

    handlePaymentEvent(store, event);
    handlePaymentEvent(store, event);

    const charges = store.ledgerEntries().filter((entry) => entry.startsWith("charge:order_1"));
    expect(charges).toHaveLength(1);
  });

  it("protects a paid order from a late pending event", () => {
    const store = new PaymentStore();
    handlePaymentEvent(store, {
      eventId: "evt_paid",
      orderId: "order_1",
      type: "payment_succeeded",
      amountCents: 1000,
    });
    handlePaymentEvent(store, {
      eventId: "evt_late_pending",
      orderId: "order_1",
      type: "payment_pending",
      amountCents: 1000,
    });

    expect(store.getOrder("order_1")?.status).toBe("paid");
  });

  it("protects a paid order from a later failed event", () => {
    const store = new PaymentStore();
    handlePaymentEvent(store, {
      eventId: "evt_paid",
      orderId: "order_1",
      type: "payment_succeeded",
      amountCents: 1000,
    });
    handlePaymentEvent(store, {
      eventId: "evt_later_failed",
      orderId: "order_1",
      type: "payment_failed",
      amountCents: 1000,
    });

    expect(store.getOrder("order_1")?.status).toBe("paid");
  });
});
