import {execFileSync} from 'node:child_process'
import {writeFileSync, mkdtempSync, mkdirSync, rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {sshArgs, rsyncSshCommand} from './wpe-ssh'
import {resolveToolchain, wpCliArgs, type LocalToolchain} from './local-toolchain'

const WP_FLAGS = ['--skip-plugins', '--skip-themes']
const DUMP_FLAGS = ['--no-tablespaces=true', '--single-transaction', '--quick', '--lock-tables=false']
/** Local names every site's schema `local`, whatever the site itself is called. */
const LOCAL_DB = 'local'

function sshExec(installName: string, prefix: string, command: string, timeout = 300_000): string {
  const ssh = sshArgs(installName, prefix)
  // Pass command directly to ssh (no bash -c wrapping) -- ssh handles remote execution
  return execFileSync('ssh', [...ssh, command], {
    encoding: 'utf-8',
    maxBuffer: 500 * 1024 * 1024,
    timeout,
  })
}

function sshExecChain(installName: string, prefix: string, commands: string[], timeout = 300_000): string {
  const ssh = sshArgs(installName, prefix)
  // Chain commands with && so failure stops the chain. Passed as single arg to ssh.
  return execFileSync('ssh', [...ssh, commands.join(' && ')], {
    encoding: 'utf-8',
    maxBuffer: 500 * 1024 * 1024,
    timeout,
  })
}

function getRemoteTablePrefix(installName: string): string {
  try {
    return sshExec(installName, 'ssh',
      ['wp', ...WP_FLAGS, 'config', 'get', 'table_prefix'].join(' '),
      30_000,
    ).trim()
  } catch {
    return 'wp_'
  }
}

/** Timestamped so a second pull on the same day cannot overwrite the first. */
function backupPath(localSitePath: string): string {
  const dir = join(localSitePath, 'local-cli-backups')
  mkdirSync(dir, {recursive: true})
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '')
  return join(dir, `db-backup-${stamp}.sql`)
}

function localSearchReplace(tools: LocalToolchain, from: string, to: string, webRoot: string): void {
  execFileSync(tools.php, wpCliArgs(tools, [
    ...WP_FLAGS, 'search-replace', `//${from}`, `//${to}`,
    '--all-tables', '--skip-columns=guid', '--precise',
    `--path=${webRoot}`,
  ]), {encoding: 'utf-8', timeout: 120_000})
}

export function pullDatabase(
  installName: string,
  remoteDomain: string,
  localDomain: string,
  localSitePath: string,
  siteId: string,
): void {
  const tools = resolveToolchain(siteId)
  const webRoot = join(localSitePath, 'app', 'public')
  const tmpDir = mkdtempSync(join(tmpdir(), 'local-cli-db-'))
  const sqlFile = join(tmpDir, 'db-pull.sql')

  try {
    console.log('Exporting remote database...')
    const ssh = sshArgs(installName, 'db+pull')
    const dump = execFileSync('ssh', [
      ...ssh,
      ['wp', ...WP_FLAGS, 'db', 'export', '-', ...DUMP_FLAGS].join(' '),
    ], {
      encoding: 'buffer',
      maxBuffer: 500 * 1024 * 1024,
      timeout: 300_000,
    })

    writeFileSync(sqlFile, dump)

    // Before the import, not after: the import is what destroys the old copy.
    const backup = backupPath(localSitePath)
    console.log('Backing up local database...')
    writeFileSync(backup, execFileSync(tools.mysqldump, [
      `--defaults-file=${tools.myCnf}`, '--databases', LOCAL_DB, ...DUMP_FLAGS,
    ], {encoding: 'buffer', maxBuffer: 500 * 1024 * 1024, timeout: 300_000}))
    console.log(`  saved to ${backup}`)

    console.log('Importing database locally...')
    // WPE's dump is tables only, with no USE line, so the schema has to be
    // named here or the first CREATE TABLE fails with "No database selected".
    execFileSync(tools.mysql, [`--defaults-file=${tools.myCnf}`, LOCAL_DB, '-e', `source ${sqlFile}`], {
      encoding: 'utf-8',
      timeout: 300_000,
    })

    console.log(`Replacing ${remoteDomain} → ${localDomain}...`)
    localSearchReplace(tools, remoteDomain, localDomain, webRoot)
  } finally {
    rmSync(tmpDir, {recursive: true, force: true})
  }
}

export function pushDatabase(
  installName: string,
  remoteDomain: string,
  localDomain: string,
  localSitePath: string,
  siteId: string,
): void {
  const tools = resolveToolchain(siteId)
  const tmpDir = mkdtempSync(join(tmpdir(), 'local-cli-db-'))
  const sqlFile = join(tmpDir, 'db-push.sql')
  const remoteFile = `/sites/${installName}/_wpeprivate/db-push.sql`
  const remoteBackup = `/sites/${installName}/_wpeprivate/db-backup-pre-push.sql`

  try {
    console.log('Exporting local database...')
    // Plain db name, not --databases: that form carries CREATE DATABASE/USE
    // statements, which would aim the remote import at a schema called `local`.
    writeFileSync(sqlFile, execFileSync(tools.mysqldump, [
      `--defaults-file=${tools.myCnf}`, LOCAL_DB, ...DUMP_FLAGS,
    ], {encoding: 'buffer', maxBuffer: 500 * 1024 * 1024, timeout: 300_000}))

    console.log('Uploading database to WPE...')
    const sshCmd = rsyncSshCommand()
    const remoteTarget = `local+rsync+${installName}@${installName}.ssh.wpengine.net:${remoteFile}`
    execFileSync('rsync', ['-avz', '-e', sshCmd, sqlFile, remoteTarget], {
      encoding: 'utf-8',
      timeout: 300_000,
    })

    // Single SSH session: backup → reset → import → search-replace → cleanup
    // If connection drops after backup but before import, backup exists on remote for recovery.
    console.log('Backing up remote DB, importing, and replacing domains...')
    sshExecChain(installName, 'db+push', [
      ['wp', ...WP_FLAGS, 'db', 'export', remoteBackup, ...DUMP_FLAGS].join(' '),
      ['wp', ...WP_FLAGS, 'db', 'reset', '--yes'].join(' '),
      `mysql < "${remoteFile}"`,
      ['wp', ...WP_FLAGS, 'search-replace',
        `"//${localDomain}"`, `"//${remoteDomain}"`,
        '--all-tables', '--skip-columns=guid', '--precise',
      ].join(' '),
      `rm -f "${remoteFile}"`,
    ], 600_000)

    console.log('✓ Remote database updated')
  } finally {
    rmSync(tmpDir, {recursive: true, force: true})
  }
}
