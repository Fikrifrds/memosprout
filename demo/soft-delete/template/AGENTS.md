# User soft-delete policy

Source Candidate Sprout: `sprout_8c2e5a71d90f3b64`

When deleting a user in `src/user-service.ts`:

1. Never hard-delete a user record. Soft-delete it by setting `deletedAt` to an ISO timestamp with `store.setDeletedAt(id, timestamp)`.
2. `listActiveUsers` must exclude soft-deleted records (records whose `deletedAt` is not null).
3. Deleting an unknown user is a no-op.

Known failures: hard-deleting a user loses the audit record; `listActiveUsers` returns soft-deleted users.

Run `pnpm test` after changing the service.
