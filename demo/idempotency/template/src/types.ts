export type OrderStatus = "pending" | "paid" | "failed";

export type PaymentEventType =
  | "payment_pending"
  | "payment_succeeded"
  | "payment_failed";

export interface PaymentEvent {
  eventId: string;
  orderId: string;
  type: PaymentEventType;
  amountCents: number;
}

export interface Order {
  orderId: string;
  status: OrderStatus;
  amountCents: number;
}
