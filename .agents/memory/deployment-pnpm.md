---
name: Deployment pnpm selection
description: Why hosted installs can reject a locally valid pnpm workspace lockfile
---

**Rule:** Keep one exact pnpm version pinned for the shared workspace and deployable packages. On Vercel, prefer automatic installation with Corepack enabled over a custom `pnpm install` override.

**Why:** Vercel can select its oldest available pnpm for an overridden install command. Lockfile format 9 does not distinguish pnpm 9 from pnpm 10, so a frozen install that passes locally can fail on a host using different pnpm configuration. Railpack also resolves its package-manager version from the project manifest when one is pinned.

**How to apply:** For external-host build changes, confirm the package-manager version in deployment logs and run a frozen install with the pinned version. Regenerate the lockfile when dependencies or lockfile-affecting settings change, but do not churn a valid lockfile merely to produce a diff. Keep Corepack enabled in each Vercel project's build environment.