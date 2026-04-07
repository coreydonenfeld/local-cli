import {readdirSync, existsSync} from 'node:fs'
import {join, relative} from 'node:path'

/**
 * Walk a site's public directory and find any subdirectory containing a .git folder.
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

/** Standard WPE excludes that always apply */
export const WPE_EXCLUDES = [
  'wp-config.php',
  '_wpeprivate/',
  '.git/',
  '.gitmodules',
  '.wpe-push-ignore',
  '.wpe-pull-ignore',
  'mu-plugins/mu-plugin.php',
  'mu-plugins/slt-force-strong-passwords.php',
  'mu-plugins/wpengine-common/',
  'mu-plugins/wpe-wp-sign-on-plugin/',
  'mu-plugins/force-strong-passwords*',
  'object-cache.php',
]

/**
 * Build the full exclude list for a sync operation.
 * Auto-detects git repos and adds them to the list.
 */
export function buildExcludes(webRoot: string, extra: string[] = []): string[] {
  const gitDirs = findGitDirs(webRoot)
  if (gitDirs.length > 0) {
    console.log(`Auto-excluding ${gitDirs.length} git repo${gitDirs.length > 1 ? 's' : ''}: ${gitDirs.join(', ')}`)
  }
  return [...WPE_EXCLUDES, ...gitDirs, ...extra]
}
