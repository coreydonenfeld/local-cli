import {spawn} from 'node:child_process'
import {existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {rsyncSshCommand, remotePath} from './wpe-ssh'
import {buildExcludes} from './sync-excludes'

interface RsyncResult {
  filesChanged: number
  output: string
}

/** Called for each item rsync reports, with the running count. */
export type ProgressFn = (file: string, count: number) => void

/**
 * rsync itemize codes: `YXcstpoguax path`, plus keywords like `*deleting`.
 * Only items rsync intends to change are printed, so these lines are the
 * change set -- the --stats block is not.
 */
const CHANGE_LINE = /^(\*\w+|[<>ch.][fdLDS])/

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

function runRsync(args: string[], onProgress?: ProgressFn, timeout?: number): Promise<RsyncResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('rsync', args)
    let output = ''
    let stderr = ''
    let pending = ''
    let filesChanged = 0

    const timer = timeout ? setTimeout(() => child.kill('SIGTERM'), timeout) : undefined

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      output += text
      pending += text

      const lines = pending.split('\n')
      pending = lines.pop() ?? ''

      for (const line of lines) {
        if (!CHANGE_LINE.test(line)) continue
        filesChanged++
        onProgress?.(line.replace(/^\S+\s+/, ''), filesChanged)
      }
    })

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on('error', err => {
      if (timer) clearTimeout(timer)
      reject(err)
    })

    child.on('close', code => {
      if (timer) clearTimeout(timer)
      // 24 = "some files vanished before they could be transferred"
      if (code === 0 || code === 24) {
        resolve({filesChanged, output})
        return
      }
      reject(new Error(`rsync exited with code ${code}\n${stderr}`))
    })
  })
}

function baseArgs(excludeFile: string): string[] {
  return [
    '--recursive', '--links', '--times', '--compress',
    '--stats',
    // One line per changed item, so progress and the change count are real.
    '--out-format=%i %n',
    '--exclude-from', excludeFile,
    '-e', rsyncSshCommand(),
  ]
}

export async function dryRunSync(
  installName: string,
  webRoot: string,
  direction: 'push' | 'pull',
  extraExcludes: string[] = [],
  onProgress?: ProgressFn,
): Promise<RsyncResult> {
  const excludeFile = buildExcludeFile(webRoot, direction, extraExcludes)
  const remote = remotePath(installName)
  const local = webRoot.endsWith('/') ? webRoot : `${webRoot}/`

  const args = [...baseArgs(excludeFile), '--dry-run']

  if (direction === 'pull') {
    args.push('--delete', remote, local)
  } else {
    args.push(local, remote)
  }

  try {
    return await runRsync(args, onProgress, 120_000)
  } finally {
    rmSync(excludeFile, {recursive: true, force: true})
  }
}

export async function executeSync(
  installName: string,
  webRoot: string,
  direction: 'push' | 'pull',
  extraExcludes: string[] = [],
  onProgress?: ProgressFn,
): Promise<RsyncResult> {
  const excludeFile = buildExcludeFile(webRoot, direction, extraExcludes)
  const remote = remotePath(installName)
  const local = webRoot.endsWith('/') ? webRoot : `${webRoot}/`

  const args = baseArgs(excludeFile)

  if (direction === 'pull') {
    args.push('--delete', remote, local)
  } else {
    // No --delete on push: never remove remote files we didn't send
    args.push(local, remote)
  }

  try {
    return await runRsync(args, onProgress)
  } finally {
    rmSync(excludeFile, {recursive: true, force: true})
  }
}
