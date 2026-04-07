# Pull/Push to WP Engine -- PRD & Engineering Spec

## Problem

Local's GUI handles push/pull to WP Engine environments, but there's no CLI equivalent. For teams like Simpatico that manage multiple WPE sites and keep themes in version control, the GUI workflow is slow and doesn't support automation (CI/CD, scripting, selective syncs).

## Goal

Enable `local-cli pull` and `local-cli push` that sync files and databases between a local site and its connected WP Engine environment. Support file exclusion patterns (e.g. skip the theme directory that's in version control).

## Key Constraint

**Local's GraphQL API has no push/pull mutations.** These operations are handled entirely in Local's Electron main process via IPC. We must implement the full sync pipeline natively in the CLI using rsync, SSH, and the WP Engine CAPI.

---

## Architecture Overview

```
local-cli push/pull
    │
    ├── WPE CAPI (REST)      ── auth, SSH key registration, backup creation, cache purge
    ├── rsync over SSH        ── file transfer (the actual sync)
    └── wp-cli via SSH        ── database export/import/search-replace on remote
```

### System Requirements
- `rsync` installed locally
- `ssh` installed locally
- WP Engine account with SSH access
- Site must have a `hostConnections` entry in Local's `sites.json`

---

## Authentication

### Option A: Reuse Local's tokens (recommended for v1)
Local stores encrypted OAuth tokens in `~/Library/Application Support/Local/wpe-data.json` under `wpeOAuth`. These are encrypted with Electron's `safeStorage` API, which is process-specific -- we can't decrypt them from outside Local.

### Option B: WPE API credentials (recommended)
WP Engine supports API access credentials (key ID + secret) with HTTP Basic Auth against CAPI. Users generate these at https://my.wpengine.com/api_access. This is the cleanest path for a CLI:
- No browser-based OAuth needed
- Store credentials in `~/.local-cli/credentials.json` or environment variables
- Works over SSH, headless servers, CI/CD

### Option C: Own OAuth PKCE flow
Spin up a localhost server, open browser to WPE's Okta, handle callback. More complex but gives full parity with Local's auth. Could be a v2 enhancement.

**Recommendation:** Start with Option B. It's the simplest, works everywhere, and WPE explicitly supports it.

### Credential Storage
```
~/.local-cli/credentials.json
{
  "wpengine": {
    "apiKeyId": "...",
    "apiKeySecret": "..."
  }
}
```
Or via environment variables: `WPE_API_KEY_ID`, `WPE_API_KEY_SECRET`.

---

## SSH Key Management

Before any rsync/SSH operation:

1. Check for existing keypair at `~/Library/Application Support/Local/ssh/wpe-connect`
2. If missing, generate RSA keypair
3. Check if public key fingerprint is registered with CAPI (`GET /ssh_keys`)
4. If not registered, register it (`POST /ssh_keys`)

SSH connection format:
```
ssh -i ~/.../wpe-connect \
    -F /dev/null \
    -o IdentitiesOnly=yes \
    -o StrictHostKeyChecking=accept-new \
    -o ServerAliveInterval=60 \
    local+rsync+{installName}@{installName}.ssh.wpengine.net
```

---

## Commands

### `local-cli pull [SITE]`

Pull files (and optionally database) from a WP Engine environment to a local site.

```
USAGE
  $ local-cli pull [SITE]

FLAGS
  --db              Include database (default: false)
  --db-only         Pull database only, no files
  --exclude=<path>  Exclude path from sync (repeatable)
  --dry-run         Show what would be synced without doing it
  --env=<env>       Remote environment (default: from hostConnections)
```

**Flow:**
1. Resolve site (by name/ID, must have `hostConnections` with `hostId: "wpe"`)
2. Look up install name from CAPI using `remoteSiteId`
3. Ensure SSH key is registered
4. Build rsync exclude list: global WPE excludes + `.wpe-pull-ignore` + `--exclude` flags
5. Run rsync: `rsync -avz --delete --compress` from `local+rsync+{install}@{install}.ssh.wpengine.net:/sites/{install}/` to local `app/public/`
6. If `--db`: SSH to `local+db+pull+{install}`, export remote DB, rsync SQL file, import locally, run search-replace (remote domain → local domain)
7. Report summary

### `local-cli push [SITE]`

Push files (and optionally database) from a local site to a WP Engine environment.

```
USAGE
  $ local-cli push [SITE]

FLAGS
  --db              Include database (default: false)
  --db-only         Push database only, no files
  --exclude=<path>  Exclude path from sync (repeatable)
  --dry-run         Show what would be synced without doing it
  --env=<env>       Remote environment (default: from hostConnections)
  --no-backup       Skip pre-push backup on WPE
```

**Flow:**
1. Resolve site (same as pull)
2. Optionally create backup on WPE via CAPI (`POST /installs/{id}/backups`)
3. Ensure SSH key
4. Build rsync exclude list: global WPE excludes + `.wpe-push-ignore` + `--exclude` flags
5. Run rsync: local `app/public/` → remote
6. If `--db`: dump local DB, rsync SQL up, SSH to `local+db+push+{install}`, backup remote DB, import, search-replace (local domain → remote domain)
7. Purge WPE caches (CDN, object, page) via CAPI
8. Report summary

### `local-cli connect [SITE]`

Interactive setup to link a local site to a WPE environment.

```
USAGE
  $ local-cli connect [SITE]
```

**Flow:**
1. Authenticate with WPE CAPI
2. List accounts → let user pick
3. List installs for account → let user pick
4. Write `hostConnections` entry to site in `sites.json`

---

## File Exclusion

### Default WPE Excludes (always applied)
```
wp-config.php
_wpeprivate/
.git/
.gitmodules
.wpe-push-ignore
.wpe-pull-ignore
mu-plugins/mu-plugin.php
mu-plugins/slt-force-strong-passwords.php
mu-plugins/wpengine-common/
mu-plugins/wpe-wp-sign-on-plugin/
mu-plugins/force-strong-passwords*
object-cache.php
```

### Auto-Detected Git Repos (always excluded)
Before every push/pull, the CLI walks the site's web root and finds any directory containing a `.git` folder. These are automatically excluded from rsync. This protects themes, plugins, or any other code managed in version control from being overwritten.

Example: if `wp-content/themes/theme-name/.git` exists, `wp-content/themes/theme-name/` is auto-excluded. No config needed.

Implementation: `src/helpers/sync-excludes.ts` → `findGitDirs()` + `buildExcludes()`

### Per-Site Excludes
- `.wpe-push-ignore` (for push)
- `.wpe-pull-ignore` (for pull)
- Format: same as `.gitignore`

### CLI Flag Excludes
`--exclude wp-content/themes/my-theme` (repeatable)

### Simpatico Use Case
For the theme-in-version-control workflow, **no configuration is needed** -- the CLI auto-detects the `.git` directory inside the theme and excludes it. For additional manual excludes:
```bash
# .wpe-push-ignore
wp-content/themes/theme-name/

# Or via CLI flag:
local-cli push my-site --exclude wp-content/themes/theme-name
```

---

## Data Flow: hostConnections

Each local site's connection to WPE is stored in `sites.json`:
```json
{
  "hostId": "wpe",
  "userId": "uuid",
  "accountId": "uuid",
  "remoteSiteId": "uuid",       // WPE install ID
  "remoteSiteEnv": "production",
  "database": true,
  "databaseOnly": false,
  "magicSync": true
}
```

The `remoteSiteId` maps to a WPE install. The install's name (used in SSH usernames) is fetched from CAPI: `GET /installs/{remoteSiteId}`.

---

## Implementation Plan

### Phase 1: Foundation
- [ ] WPE CAPI client (`src/helpers/wpe-api.ts`) -- auth, install lookup, SSH key management, backup, cache purge
- [ ] Credential management (`local-cli auth` command or config file)
- [ ] SSH key generation and registration
- [ ] `local-cli connect` -- interactive site linking

### Phase 2: Pull
- [ ] Rsync wrapper with exclude handling
- [ ] `local-cli pull` -- file sync from WPE
- [ ] Database pull (export via SSH, import locally, search-replace)
- [ ] `--dry-run` support

### Phase 3: Push
- [ ] `local-cli push` -- file sync to WPE
- [ ] Pre-push backup via CAPI
- [ ] Database push (dump local, upload, import via SSH, search-replace)
- [ ] Cache purge after push
- [ ] `--dry-run` support

### Phase 4: Polish
- [ ] Magic sync (dry-run diff → interactive file picker)
- [ ] Progress reporting (rsync progress bars)
- [ ] TUI integration (pull/push actions in `sites` command)
- [ ] CI/CD mode (non-interactive, all flags via CLI)

---

## Risks & Open Questions

1. **SSH key format** -- WPE may require specific key types (RSA vs ed25519). Local uses RSA. Need to verify CAPI accepts ed25519.

2. **Credential encryption** -- Storing API keys in plaintext JSON is simple but not great. Could use system keychain via `keytar` or similar. v1 plaintext is fine for a dev tool.

3. **MySQL collation** -- When pushing databases, Local runs collation replacement for MySQL 8 ↔ 5.7 compat. We need to handle this too.

4. **WPE rate limits** -- Backup creation is throttled (2hr production, 8hr other). Need to handle gracefully.

5. **Multisite** -- Push/pull for WordPress multisite needs additional search-replace for domain mappings. Punt to v2.

6. **Large sites** -- Sites with large `uploads/` directories may take a very long time to rsync. Progress reporting and `--exclude wp-content/uploads` are important.

7. **Flywheel hosting** -- The `hostId` can also be `"flywheel"`. Flywheel uses SFTP instead of rsync. Out of scope for v1, but the architecture should allow adding it later.
