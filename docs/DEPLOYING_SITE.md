# Deploying the site

The landing page and docs at **memosprout.com** are a static export served
by nginx. Deploying is one command, run **from your laptop** — not on the
server:

```bash
pnpm deploy:site
```

That builds `out/`, rsyncs it to the server, and verifies both pages return
200. Nothing else is needed.

This is separate from the npm release. The two never trigger each other:

| What changed | What to run |
|---|---|
| `app/`, `components/` (landing page, docs) | `pnpm deploy:site` |
| `lib/`, `bin/` (the package) | cut a release — see [RELEASING.md](RELEASING.md) |
| both | both |

## What runs where

```
Your laptop                          Server (85.190.242.47)
───────────                          ──────────────────────
pnpm deploy:site
  1. next build       → out/
  2. rsync over ssh   ───────────→   /var/www/memosprout-site
  3. curl / and /docs ───────────→   expect 200
```

Nothing is built on the server and no Node process runs there. `next.config.ts`
sets `output: "export"` precisely so nginx can serve plain HTML. You do not
need to SSH in to deploy.

## Requirements

The SSH key must exist on the machine you deploy from. The script looks for
`~/.ssh/id_tubegrasp`; override with `MEMOSPROUT_DEPLOY_KEY=/path/to/key`.
Only a machine holding that key can deploy.

## Safety

Two guards, both worth knowing about because they shape what a failed deploy
can do:

**A broken build cannot reach the server.** The script aborts if
`out/index.html` is missing, before rsync runs. A failed build leaves the
live site untouched.

**`rsync --delete` is scoped to one directory.** It mirrors `out/` into
`/var/www/memosprout-site`, deleting anything there that is not in the
build. That is correct for a static export, and safe *only* because nothing
else lives in that directory.

## Do not disturb the neighbours

This server hosts several unrelated apps. Verified layout:

| Domain | Directory |
|---|---|
| **memosprout.com** | `/var/www/memosprout-site` ← the only deploy target |
| play.memosprout.com | `/var/www/memo-game/out` |
| mlola.com | `/var/www/mlola` |
| tubegrasp.com, api.tubegrasp.com | `/var/www/tubegrasp` |
| conversease, reposweep, searchku.com, tilaqa.com | their own directories |

`play.memosprout.com` shares the domain but **not** the directory, so a
normal deploy cannot affect it. Never point `TARGET` at a parent directory —
`--delete` would then wipe the siblings.

nginx configs live in `/etc/nginx/sites-enabled/`. Deploying does not touch
them; a new subdomain or a changed root is a manual, separate task.

## Verifying by hand

The script already checks `/` and `/docs`. To check the SEO files as well:

```bash
for p in / /docs /robots.txt /sitemap.xml /opengraph-image; do
  printf "%-18s %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code}' "https://memosprout.com$p")"
done

curl -s -o /dev/null -w "play: %{http_code}\n" https://play.memosprout.com
```

A cached page can mask a failed deploy, so confirm the content changed and
not merely the status code.

## Inspecting the server

Read-only checks, for when something looks wrong:

```bash
ssh -i ~/.ssh/id_tubegrasp -p 7822 root@85.190.242.47

ls /var/www/                            # which apps exist
ls /etc/nginx/sites-enabled/            # which domains are configured
grep -E 'root|server_name' /etc/nginx/sites-enabled/memosprout.com
nginx -t && systemctl reload nginx      # only after editing a config
```
