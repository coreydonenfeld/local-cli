import {existsSync, readFileSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {execFileSync} from 'node:child_process'
import confirm from '@inquirer/confirm'
import {promptTheme} from './prompts'

const CONNECTION_INFO_PATH = join(homedir(), 'Library/Application Support/Local/graphql-connection-info.json')

async function openLocalApp(): Promise<void> {
  const platform = process.platform
  if (platform === 'darwin') {
    execFileSync('open', ['-a', 'Local'])
  } else if (platform === 'win32') {
    execFileSync('cmd', ['/c', 'start', '', 'Local'])
  } else {
    execFileSync('local', [], {stdio: 'ignore'})
  }
}

async function waitForLocal(timeout = 30_000): Promise<boolean> {
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      if (!existsSync(CONNECTION_INFO_PATH)) {
        await sleep(1000)
        continue
      }
      const info = JSON.parse(readFileSync(CONNECTION_INFO_PATH, 'utf-8'))
      const res = await fetch(info.url, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', Authorization: `Bearer ${info.authToken}`},
        body: JSON.stringify({query: '{ sites { id } }'}),
        signal: AbortSignal.timeout(2000),
      })
      if (res.ok) return true
    } catch {}
    await sleep(1000)
  }
  return false
}

export async function isLocalRunning(): Promise<boolean> {
  try {
    if (!existsSync(CONNECTION_INFO_PATH)) return false
    const info = JSON.parse(readFileSync(CONNECTION_INFO_PATH, 'utf-8'))
    const res = await fetch(info.url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Authorization: `Bearer ${info.authToken}`},
      body: JSON.stringify({query: '{ sites { id } }'}),
      signal: AbortSignal.timeout(2000),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function ensureLocalRunning(): Promise<boolean> {
  if (await isLocalRunning()) return true

  console.log('Local is not running.')
  try {
    const open = await confirm({
      message: 'Open Local?',
      default: true,
      theme: promptTheme,
    })

    if (!open) return false

    console.log('Opening Local...')
    await openLocalApp()

    process.stdout.write('Waiting for Local to start')
    const ready = await waitForLocal()

    if (ready) {
      console.log('\n✓ Local is ready')
      return true
    }

    console.log('\n▲ Local did not respond in time. Try opening it manually.')
    return false
  } catch (error) {
    if (error instanceof Error && error.name === 'ExitPromptError') {
      console.log('\nGoodbye!')
      process.exit(0)
    }
    return false
  }
}
