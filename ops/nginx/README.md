# nginx

Two different things live here.

## `sites/` — the live configs

Verbatim copies of the nine server blocks enabled on the production droplet
(`/etc/nginx/sites-enabled`). They are here so the box can be rebuilt. That is
not a hypothetical: this droplet was rebuilt in June 2026 after the compromise,
and these files carry the TLS paths, the CSP, the per-route rate limits, the
`/api/pos/` and `/api/retail/` proxies and the `/v/` receipt-verification proxy
— none of which anyone reconstructs from memory.

**These are a record, not a deployment source.** Applying them is deliberately
manual: one typo takes down every domain on the box at once, for a file that
changes a few times a year. The flow is

1. edit on the server, in `/etc/nginx/sites-available/`
2. `nginx -t`
3. `systemctl reload nginx`
4. back on your machine: `./scripts/nginx-diff.sh --pull`, then commit

and `./scripts/nginx-diff.sh` on its own tells you whether the copies here still
match what is running. Run it before touching nginx and after. A committed
config nobody compares is worse than no copy at all — it drifts quietly and
then reads as authoritative.

## `*.conf.example` — fragments

Snippets to paste into a server block (CORS, caching, the frontend's API proxy).
Illustrative; not what is running.

## Notes

No secrets are in these files. Certificate _paths_ appear; keys do not. The
only matches for "token" or "secret" are comments — including the one in
`ugasfuad.com` recording that its certificate renews over HTTP-01 rather than
the DigitalOcean DNS plugin the other sites use.
