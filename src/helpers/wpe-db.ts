import {execFileSync} from 'node:child_process'
import {existsSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {sshArgs, rsyncSshCommand} from './wpe-ssh'

const WP_FLAGS = ['--skip-plugins', '--skip-themes']
const DUMP_FLAGS = ['--no-tablespaces=true', '--single-transaction', '--quick', '--lock-tables=false']

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

export function pullDatabase(
  installName: string,
  remoteDomain: string,
  localDomain: string,
  localSitePath: string,
): void {
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

    console.log('Importing database locally...')
    const confPath = join(localSitePath, 'conf', 'mysql', 'my.cnf')
    if (existsSync(confPath)) {
      execFileSync('mysql', [`--defaults-file=${confPath}`, '-e', `source ${sqlFile}`], {
        encoding: 'utf-8',
        timeout: 300_000,
      })
    } else {
      execFileSync('wp', ['db', 'import', sqlFile, `--path=${webRoot}`], {
        encoding: 'utf-8',
        timeout: 300_000,
      })
    }

    console.log(`Replacing ${remoteDomain} → ${localDomain}...`)
    try {
      execFileSync('wp', [
        'search-replace', `//${remoteDomain}`, `//${localDomain}`,
        '--all-tables', '--skip-columns=guid', '--precise',
        `--path=${webRoot}`,
      ], {encoding: 'utf-8', timeout: 120_000})
    } catch {
      console.log('▲ search-replace failed (wp-cli may not be available locally)')
    }
  } finally {
    rmSync(tmpDir, {recursive: true, force: true})
  }
}

export function pushDatabase(
  installName: string,
  remoteDomain: string,
  localDomain: string,
  localSitePath: string,
): void {
  const webRoot = join(localSitePath, 'app', 'public')
  const tmpDir = mkdtempSync(join(tmpdir(), 'local-cli-db-'))
  const sqlFile = join(tmpDir, 'db-push.sql')
  const remoteFile = `/sites/${installName}/_wpeprivate/db-push.sql`
  const remoteBackup = `/sites/${installName}/_wpeprivate/db-backup-pre-push.sql`

  try {
    console.log('Exporting local database...')
    execFileSync('wp', [
      'db', 'export', sqlFile, `--path=${webRoot}`,
      '--single-transaction', '--quick',
    ], {encoding: 'utf-8', timeout: 300_000})

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
