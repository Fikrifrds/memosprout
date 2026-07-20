# Project conventions

Validated guidance for changes to this API. These rules are enforced in review and by the
acceptance suite.

## List endpoints

1. Read rows through `db.scopedSelect(table, context)` (see `src/lib/db.ts`). It applies the
   tenant scope from the authenticated context and excludes archived rows. Never read
   `db.table(...)` directly in a repository or route.
2. Take the tenant from the authenticated `RequestContext` only. Never read a tenant id from
   the request body or query string.
3. Sort list results newest first (`createdAt` descending).
4. Paginate with `paginate()` from `src/lib/pagination.ts`. Pass the caller's `limit` and
   `cursor` through unchanged; `paginate` validates them.
5. Return the envelope with `ok(items, { nextCursor })` from `src/lib/response.ts`. The
   cursor belongs in `meta`, never inside `data`.
6. Validate query input with the helpers in `src/lib/validation.ts` (for example
   `optionalPositiveInteger(query, "limit")`) so failures surface as `validation_failed`
   with a `field` detail.

## Prohibited

- Building the response object literally instead of using `ok()` / `created()`.
- Throwing bare `Error` from a route; throw `ApiError` (see `src/lib/errors.ts`).
- Filtering by tenant manually after reading the full table.

## Mutations

Wrap every state-changing operation in `withAudit(db, context, entry, operation)`. A mutation
without an audit entry fails review. `src/repositories/project-repository.ts` is the
reference implementation for both reads and mutations.
