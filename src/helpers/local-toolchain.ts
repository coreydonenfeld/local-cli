import {existsSync, readdirSync, readFileSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'

const SUPPORT = join(homedir(), 'Library/Application Support/Local')
const RUN_DIR = join(SUPPORT, 'run')
const SERVICES = join(SUPPORT, 'lightning-services')
const WP_CLI = '/Applications/Local.app/Contents/Resources/extraResources/bin/wp-cli/posix/wp'

/**
 * Local keeps php, mysql and wp-cli inside its own app bundle and never puts
 * them on PATH, so a bare `wp` or `mysql` fails with ENOENT on a stock Mac.
 * Every database command has to go through these paths instead.
 */
export interface LocalToolchain {
  mysql: string
  mysqldump: string
  php: string
  wpCli: string
  /** Carries a [client] block with the socket, user and password already set. */
  myCnf: string
  socket: string
}

/** Sorts `mysql-8.4.0+2` above `mysql-8.0.35+4`, which a string sort gets wrong. */
function versionKey(dir: string): number[] {
  const match = dir.match(/-(\d[\d.]*)/)
  return match ? match[1].split('.').map(Number) : [0]
}

function compareVersionsDesc(a: string, b: string): number {
  const [x, y] = [versionKey(a), versionKey(b)]
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const diff = (y[i] ?? 0) - (x[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** The arch folder varies by service -- php ships `darwin`, mysql `darwin-arm64`. */
function newestService(prefix: string, binary: string): string | undefined {
  let dirs: string[]
  try {
    dirs = readdirSync(SERVICES)
  } catch {
    return undefined
  }

  for (const dir of dirs.filter(d => d.startsWith(`${prefix}-`)).sort(compareVersionsDesc)) {
    const archRoot = join(SERVICES, dir, 'bin')
    let arches: string[]
    try {
      arches = readdirSync(archRoot)
    } catch {
      continue
    }
    for (const arch of arches) {
      const bin = join(archRoot, arch, 'bin', binary)
      if (existsSync(bin)) return bin
    }
  }
  return undefined
}

/** Local renders my.cnf into its run directory; the site folder only holds the .hbs template. */
function readSocket(myCnf: string): string {
  const match = readFileSync(myCnf, 'utf-8').match(/^\s*socket\s*=\s*(.+)$/m)
  if (!match) throw new Error(`No socket defined in ${myCnf}`)
  return match[1].trim()
}

export function resolveToolchain(siteId: string): LocalToolchain {
  const myCnf = join(RUN_DIR, siteId, 'conf', 'mysql', 'my.cnf')
  const mysql = newestService('mysql', 'mysql')
  const mysqldump = newestService('mysql', 'mysqldump')
  const php = newestService('php', 'php')

  const missing: string[] = []
  if (!existsSync(myCnf)) missing.push(`${myCnf} (start the site in Local first)`)
  if (!mysql) missing.push("Local's bundled mysql client")
  if (!mysqldump) missing.push("Local's bundled mysqldump")
  if (!php) missing.push("Local's bundled php")
  if (!existsSync(WP_CLI)) missing.push(WP_CLI)

  if (missing.length > 0) {
    throw new Error(`Cannot reach the local database. Not found:\n  ${missing.join('\n  ')}`)
  }

  return {mysql: mysql!, mysqldump: mysqldump!, php: php!, wpCli: WP_CLI, myCnf, socket: readSocket(myCnf)}
}

/**
 * wp-config.php sets DB_HOST to `localhost`, which sends mysqli to PHP's compiled-in
 * socket rather than this site's. Overriding the ini is what makes wp-cli connect.
 */
export function wpCliArgs(tools: LocalToolchain, args: string[]): string[] {
  return ['-d', `mysqli.default_socket=${tools.socket}`, tools.wpCli, ...args]
}
