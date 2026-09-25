---
name: External Neon DB migration
description: How this project's database was moved from Replit's built-in Postgres to a user-supplied Neon URL, and a Neon pooler connection quirk that broke queries right after cutover.
---

## Setup
The app's `DATABASE_URL` secret now points to an external Neon Postgres instance instead of Replit's built-in database. This was a deliberate, explicit user request — do not revert it or treat the built-in Replit DB as the source of truth going forward.

## Authoritative data
Treat Neon's existing records as authoritative; do not restore or merge the older Replit-managed database into Neon merely because it still contains rows.

**Why:** the user explicitly confirmed the Neon records are correct. A read-only comparison showed the older Replit records describe users already present in Neon, but serial IDs overlap with different users. A blind restore or merge could overwrite or misassociate accounts.

**How to apply:** preserve Neon before future database changes, compare identities rather than numeric row IDs, and seek explicit direction before reintroducing records from the Replit-managed database.

## Neon pooler search_path quirk
Right after pointing `DATABASE_URL` at Neon's pooled connection endpoint (`-pooler` hostname), some sessions came up with an **empty `search_path`** (`SHOW search_path;` returned blank, `source: session`) instead of the normal `"$user", public`. This broke every unqualified table reference (Drizzle/ORM queries like `select ... from "wallet_profiles"`), causing `relation "..." does not exist` / failed-query errors even though the tables and data were present under the `public` schema.

**Why:** observed as transient/session-dependent on the Neon pooler — schema-qualified queries (`public.wallet_profiles`) always worked, unqualified ones sometimes failed depending on which pooled backend served the session. Retrying the same query against the same URL later showed a normal `public` search_path, so it self-resolved, but it can surface again after a cold start or pooler reroute.

**How to apply:** if queries against the Neon DB fail with "relation does not exist" for a table that demonstrably exists, first check `SHOW search_path;` on that connection before assuming a schema/migration problem. If it's blank, either retry (it may be a transient pooler state) or consider having the app set `search_path` explicitly (e.g. via a `SET search_path` on connect, or `?options=-csearch_path%3Dpublic` in the connection string) if it recurs.

## Migration method used
Dumped the Replit-internal Postgres with `pg_dump --no-owner --no-privileges --format=custom` over the discrete `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE` env vars (using `sslmode=disable` — the internal DB's proxy does not support SSL), then restored with `pg_restore --no-owner --no-privileges -d "$NEON_URL"`. All 11 tables and row counts were verified to match post-restore.
