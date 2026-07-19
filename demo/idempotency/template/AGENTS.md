# Payment webhook idempotency policy

Source Candidate Sprout: `sprout_3f7c9a21b8e04d65`

When processing provider payment webhook events in `src/webhook-handler.ts`:

1. Use the provider event id (`event.eventId`) as the idempotency key. Skip events the store has already processed (`store.hasProcessedEvent` and `store.markEventProcessed`) so a duplicate callback is processed exactly once.
2. Protect terminal order states. Once an order is `paid` or `failed`, a later event must not downgrade its status — for example, a late `payment_pending` must not turn a `paid` order back into `pending`, and a later `payment_failed` must not overwrite a `paid` order.
3. Record a charge only when an order newly reaches `paid`.

Known failures: a duplicate charge is created on a duplicate callback; a `paid` order is downgraded to `pending` on an out-of-order event.

Run `pnpm test` after changing the handler.
