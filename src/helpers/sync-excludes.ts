import {readdirSync, existsSync} from 'node:fs'
import {join, relative} from 'node:path'

/**
 * Walk a site's web root and find any subdirectory containing a .git folder.
 * Returns paths relative to the webRoot, suitable for rsync --exclude.
 */
export function findGitDirs(webRoot: string): string[] {
  const results: string[] = []

  function walk(dir: string) {
    let entries
    try { entries = readdirSync(dir, {withFileTypes: true}) } catch { return }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const full = join(dir, entry.name)
      if (existsSync(join(full, '.git'))) {
        results.push(relative(webRoot, full) + '/')
      } else if (entry.name !== 'node_modules' && entry.name !== '.git') {
        walk(full)
      }
    }
  }

  walk(webRoot)
  return results
}

/** WPE excludes matching Local's implementation. Paths relative to web root. */
export const WPE_EXCLUDES = [
  // WordPress config
  'wp-config.php',

  // WPE internal
  '_wpeprivate/',
  '.wpe-devkit/',
  '.wpengine-conf/',
  '.wpe-connect/',

  // Version control
  '.git/',
  '.gitmodules',
  '.gitignore',

  // Sync ignore files
  '.wpe-push-ignore',
  '.wpe-pull-ignore',

  // WPE mu-plugins
  'wp-content/mu-plugins/mu-plugin.php',
  'wp-content/mu-plugins/slt-force-strong-passwords.php',
  'wp-content/mu-plugins/force-strong-passwords*',
  'wp-content/mu-plugins/wpengine-common/',
  'wp-content/mu-plugins/wpe-wp-sign-on-plugin/',
  'wp-content/mu-plugins/wpe-wp-sign-on-plugin.php',
  'wp-content/mu-plugins/wpe-devkit.php',
  'wp-content/mu-plugins/wp-cache-memcached/',
  'wp-content/mu-plugins/wpengine-security-auditor.php',
  'wp-content/mu-plugins/wpe-cache-plugin/',
  'wp-content/mu-plugins/wpe-cache-plugin.php',
  'wp-content/mu-plugins/wpe-update-source-selector/',
  'wp-content/mu-plugins/wpe-update-source-selector.php',

  // WPE drop-ins and cache
  'wp-content/object-cache.php',
  'wp-content/drop-ins/',
  'wp-content/mysql.sql',

  // Local-specific files
  'local-phpinfo.php',
  'local-xdebuginfo.php',

  // Build artifacts
  'autoupdater_backup_*/',
  '.bin/*',
  'vendor/bin/*',
  'node_modules/puppeteer',
]

export function buildExcludes(webRoot: string, extra: string[] = []): string[] {
  const gitDirs = findGitDirs(webRoot)
  if (gitDirs.length > 0) {
    console.log(`Auto-excluding ${gitDirs.length} git repo${gitDirs.length > 1 ? 's' : ''}: ${gitDirs.join(', ')}`)
  }
  return [...WPE_EXCLUDES, ...gitDirs, ...extra]
}
