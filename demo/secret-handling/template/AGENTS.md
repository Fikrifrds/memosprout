# Secret handling policy

Source Candidate Sprout: `sprout_2b8e6f4d9a1357c0`

When rendering configuration for logs or display in `src/service.ts`:

1. Never include a raw secret (such as `apiKey`) in output. Mask it with `maskSecret` from `src/secrets.ts`.
2. Non-sensitive fields (region, timeout) may be shown as-is.

Known failures: logging or returning the raw API key, which leaks credentials.

Run `pnpm test` after changing the service.
