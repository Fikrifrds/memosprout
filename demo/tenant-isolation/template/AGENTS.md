# Tenant isolation policy

Source Candidate Sprout: `sprout_5d9f1b3a7c2048e6`

When querying records in `src/record-service.ts`:

1. Always scope queries by `tenantId`. Return only the records whose `tenantId` matches the requesting tenant.
2. Never return records that belong to a different tenant.

Known failures: returning every record regardless of tenant, which leaks one tenant's data to another.

Run `pnpm test` after changing the service.
