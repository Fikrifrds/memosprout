import { describe, expect, it } from "vitest";

import { PaymentStore } from "../src/payment-store";
import { handlePaymentEvent } from "../src/webhook-handler";

describe("payment webhook handler", () => {
  it("creates a paid order for a single succeeded event", () => {
    const store = new PaymentStore();
    handlePaymentEvent(store, {
      eventId: "evt_1",
      orderId: "order_1",
      type: "payment_succeeded",
      amountCents: 1000,
    });

    const order = store.getOrder("order_1");
    expect(order).toBeDefined();
    expect(order?.status).toBe("paid");
    expect(order?.amountCents).toBe(1000);
  });

  it("records a charge when an order reaches paid", () => {
    const store = new PaymentStore();
    handlePaymentEvent(store, {
      eventId: "evt_1",
      orderId: "order_1",
      type: "payment_succeeded",
      amountCents: 2500,
    });

    expect(store.ledgerEntries()).toContain("charge:order_1:2500");
  });
});
