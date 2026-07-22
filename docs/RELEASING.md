# Releasing

**Standard: every release is published by GitHub Actions with npm
provenance. Never `npm publish` from a laptop.**

Provenance attaches a Sigstore-signed statement to the package proving
*which repository, which commit, and which workflow* produced the tarball.
npm shows a "Built and signed on GitHub Actions" badge, and anyone can
verify it. A laptop publish carries no such proof — if your npm token
leaks, an attacker can push malware under your package name and nobody can
tell the difference. Publishing only from CI removes that possibility.

## One-time setup

### 1. Enable 2FA on npm

```bash
npm profile enable-2fa auth-and-writes
```

This protects the account itself. Do it before creating any token.

### 2. Create a granular access token

On npmjs.com → **Access Tokens** → **Generate New Token** → **Granular
Access Token**:

| Setting | Value |
|---|---|
| Token name | `memosprout-ci` |
| **Bypass two-factor authentication (2FA)** | **Checked** — see below |
| Allowed IP ranges | Leave empty (Actions runners use rotating IPs) |
| Packages → Permissions | **Read and write** |
| Packages → selection | Only `memosprout` |
| Organizations | No access |
| Expiration | 90 days (set a calendar reminder to rotate) |

Copy the token — npm shows it once.

> **Why "Bypass 2FA" must be checked.** CI has no human to type a 2FA code,
> so publishing fails without it. This does not weaken your account: 2FA
> still guards login and manual operations. The token stays safe because it
> is scoped to one package, expires in 90 days, and lives only as an
> encrypted GitHub secret.

> **Before the first release**, `memosprout` does not exist on npm yet, so
> it cannot be selected in the package list. Choose **All packages** for the
> first publish, then create a replacement token scoped to `memosprout`,
> update the `NPM_TOKEN` secret, and revoke the broad one.

> Use a **granular** token, not a classic "Automation" token. If it leaks,
> the blast radius is one package instead of everything you own.

### 3. Add the token to GitHub

With the GitHub CLI (prompts for the token so it never lands in shell
history):

```bash
gh secret set NPM_TOKEN --repo Fikrifrds/memosprout
```

Or in the browser: Repository → **Settings** → **Secrets and variables** →
**Actions** → **New repository secret**, name `NPM_TOKEN`.

The name must be exactly `NPM_TOKEN` — a typo surfaces later as a
confusing npm authentication error, not as a missing-secret error.

Verify it landed:

```bash
gh secret list --repo Fikrifrds/memosprout   # values are never shown
```

### 4. Verify the workflow permissions

`.github/workflows/publish.yml` already sets `id-token: write`, which is
what lets the job obtain the OIDC token that Sigstore signs. Without it,
`npm publish --provenance` fails. Nothing to change — just don't remove it.

## Publishing a release

### 1. Bump the version and land it on `main`

```bash
npm version patch   # or minor / major — creates a commit and a tag
git push && git push --tags
```

Semver for this package: `patch` for fixes, `minor` for new features or
new providers, `major` for breaking changes to the public API.

### 2. Cut a GitHub release

```bash
# Pre-release (publishes under the "beta" dist-tag)
gh release create v0.2.1 --prerelease --generate-notes

# Stable (publishes under "latest")
gh release create v0.2.1 --generate-notes
```

The workflow triggers on release publication and will:

1. Typecheck, run the full test suite, run the supply-chain audit, and
   consume the packed artifact through its ESM, CommonJS, TypeScript, and
   CLI entrypoints
2. Verify `package.json` version matches the release tag
3. Publish with `--provenance`, choosing the dist-tag from whether the
   release is marked pre-release

If any gate fails, nothing is published.

### 3. Verify

```bash
npm view memosprout                    # version, dist-tags
npm view memosprout dist.attestations  # provenance present?
```

The npm package page should show **"Built and signed on GitHub Actions"**.

## Promoting a beta to latest

```bash
npm dist-tag add memosprout@0.2.1 latest
```

## Done already

`0.3.0` was published on 2026-07-22 as the first public release, from tag
`v0.3.0`, under the `latest` dist-tag. The one-time setup above (2FA, token,
`NPM_TOKEN` secret) is complete — you only revisit it to rotate the token.

One follow-up from that setup is worth checking: the first token had to be
scoped to **All packages**, because `memosprout` did not exist on npm yet.
If it has not been replaced, create a token scoped to `memosprout` only,
update the `NPM_TOKEN` secret, and revoke the broad one.

## Manual publish (escape hatch)

If you need to publish without cutting a release — Actions → **Publish to
npm** → **Run workflow**, pick the dist-tag. It still runs every gate and
still attaches provenance, because it still runs in CI.

## What to do if a token leaks

1. Revoke the token on npmjs.com immediately
2. Delete and recreate the `NPM_TOKEN` GitHub secret
3. Check published versions: `npm view memosprout versions`
4. If an unexpected version exists, `npm deprecate` it with a warning and
   publish a clean patch — unpublish only works within 72 hours

## Before every release

The workflow enforces these automatically, but run them locally to get
faster feedback:

```bash
pnpm typecheck
pnpm test
pnpm verify:readiness # offline retrieval and answer-gate effectiveness
pnpm audit:package   # tarball supply-chain audit
pnpm verify:package-consumer # offline ESM, CJS, types, and CLI verification
pnpm test:live       # optional: verify against a real LLM (needs a key)
pnpm semantic:eval   # optional: retrieval accuracy, needs OPENAI_API_KEY
```

`semantic:eval` is the one that costs money (a few cents). Run it when you
touch retrieval — it prints the queries it got wrong, and the README quotes
its numbers, so a change there means the README needs re-checking.

Releasing the package does **not** update memosprout.com. If the same change
also touched `app/` or `components/`, see
[DEPLOYING_SITE.md](DEPLOYING_SITE.md).
