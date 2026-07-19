import type { Order } from "./types";

export class PaymentStore {
  private readonly orders = new Map<string, Order>();
  private readonly processedEventIds = new Set<string>();
  private readonly ledger: string[] = [];

  hasProcessedEvent(eventId: string): boolean {
    return this.processedEventIds.has(eventId);
  }

  markEventProcessed(eventId: string): void {
    this.processedEventIds.add(eventId);
  }

  getOrder(orderId: string): Order | undefined {
    return this.orders.get(orderId);
  }

  upsertOrder(order: Order): void {
    this.orders.set(order.orderId, order);
  }

  recordCharge(orderId: string, amountCents: number): void {
    this.ledger.push(`charge:${orderId}:${amountCents}`);
  }

  ledgerEntries(): readonly string[] {
    return [...this.ledger];
  }

  allOrders(): readonly Order[] {
    return [...this.orders.values()];
  }
}
