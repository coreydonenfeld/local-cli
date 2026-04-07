import {execFileSync} from 'node:child_process'
import {existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {rsyncSshCommand, remotePath} from './wpe-ssh'
import {buildExcludes} from './sync-excludes'

interface RsyncResult {
  filesChanged: number
  output: string
}

function loadIgnoreFile(webRoot: string, filename: string): string[] {
  const path = join(webRoot, filename)
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
}

function buildExcludeFile(webRoot: string, direction: 'push' | 'pull', extraExcludes: string[]): string {
  const ignoreFile = direction === 'push' ? '.wpe-push-ignore' : '.wpe-pull-ignore'
  const siteIgnores = loadIgnoreFile(webRoot, ignoreFile)
  const allExcludes = buildExcludes(webRoot, [...siteIgnores, ...extraExcludes])

  const tmpDir = mkdtempSync(join(tmpdir(), 'local-cli-'))
  const excludeFile = join(tmpDir, 'excludes.txt')
  writeFileSync(excludeFile, allExcludes.join('\n'))
  return excludeFile
}

function parseRsyncOutput(output: string): number {
  const lines = output.split('\n').filter(l =>
    l.trim() &&
    !l.startsWith('sending') &&
    !l.startsWith('receiving') &&
    !l.startsWith('total') &&
    !l.startsWith('sent') &&
    !l.startsWith('.') &&
    !l.startsWith('building file list')
  )
  return lines.length
}

function runRsync(args: string[], timeout?: number): RsyncResult {
  try {
    const output = execFileSync('rsync', args, {
      encoding: 'utf-8',
      timeout: timeout || 0,
      maxBuffer: 50 * 1024 * 1024,
    })
    return {filesChanged: parseRsyncOutput(output), output}
  } catch (err: any) {
    // Exit code 24 = "some files vanished before they could be transferred" -- treat as success
    if (err.status === 24 && err.stdout) {
      return {filesChanged: parseRsyncOutput(err.stdout), output: err.stdout}
    }
    throw err
  }
}

export function dryRunSync(
  installName: string,
  webRoot: string,
  direction: 'push' | 'pull',
  extraExcludes: string[] = [],
): RsyncResult {
  const excludeFile = buildExcludeFile(webRoot, direction, extraExcludes)
  const sshCmd = rsyncSshCommand()
  const remote = remotePath(installName)
  const local = webRoot.endsWith('/') ? webRoot : `${webRoot}/`

  const args = [
    '--recursive', '--links', '--times', '--compress',
    '--dry-run', '--stats',
    '--exclude-from', excludeFile,
    '-e', sshCmd,
  ]

  if (direction === 'pull') {
    args.push('--delete', remote, local)
  } else {
    args.push(local, remote)
  }

  try {
    return runRsync(args, 120_000)
  } finally {
    rmSync(excludeFile, {recursive: true, force: true})
  }
}

export function executeSync(
  installName: string,
  webRoot: string,
  direction: 'push' | 'pull',
  extraExcludes: string[] = [],
): RsyncResult {
  const excludeFile = buildExcludeFile(webRoot, direction, extraExcludes)
  const sshCmd = rsyncSshCommand()
  const remote = remotePath(installName)
  const local = webRoot.endsWith('/') ? webRoot : `${webRoot}/`

  const args = [
    '--recursive', '--links', '--times', '--compress',
    '--stats',
    '--exclude-from', excludeFile,
    '-e', sshCmd,
  ]

  if (direction === 'pull') {
    args.push('--delete', remote, local)
  } else {
    // No --delete on push: never remove remote files we didn't send
    args.push(local, remote)
  }

  try {
    return runRsync(args)
  } finally {
    rmSync(excludeFile, {recursive: true, force: true})
  }
}
