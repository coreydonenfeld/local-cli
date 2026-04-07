import {readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'

const CAPI_BASE = 'https://api.wpengineapi.com/v1'
const CREDENTIALS_PATH = join(homedir(), '.local-cli', 'credentials.json')

interface WpeCredentials {
  apiKeyId: string
  apiKeySecret: string
}

interface WpeInstall {
  id: string
  name: string
  environment: string
  primary_domain: string
}

interface WpeAccount {
  id: string
  name: string
}

interface WpeBackup {
  id: string
  status: string
}

function loadCredentials(): WpeCredentials {
  const fromEnv = process.env.WPE_API_KEY_ID && process.env.WPE_API_KEY_SECRET
  if (fromEnv) {
    return {apiKeyId: process.env.WPE_API_KEY_ID!, apiKeySecret: process.env.WPE_API_KEY_SECRET!}
  }

  if (!existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      'WP Engine credentials not found.\n' +
      'Set WPE_API_KEY_ID and WPE_API_KEY_SECRET environment variables,\n' +
      `or create ${CREDENTIALS_PATH} with your API credentials.\n` +
      'Generate API credentials at https://my.wpengine.com/api_access'
    )
  }

  const data = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf-8'))
  if (!data.wpengine?.apiKeyId || !data.wpengine?.apiKeySecret) {
    throw new Error(`Invalid credentials file at ${CREDENTIALS_PATH}`)
  }
  return data.wpengine
}

async function wpeRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const creds = loadCredentials()
  const auth = Buffer.from(`${creds.apiKeyId}:${creds.apiKeySecret}`).toString('base64')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)

  const response = await fetch(`${CAPI_BASE}${path}`, {
    ...options,
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
      ...options.headers,
    },
  }).finally(() => clearTimeout(timeout))

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`WPE API ${response.status}: ${response.statusText}\n${body}`)
  }

  if (response.status === 204) return {} as T
  return response.json() as Promise<T>
}

export async function getInstall(installId: string): Promise<WpeInstall> {
  return wpeRequest<WpeInstall>(`/installs/${installId}`)
}

export async function listAccounts(): Promise<WpeAccount[]> {
  const data = await wpeRequest<{results: WpeAccount[]}>('/accounts?limit=100')
  return data.results
}

export async function listInstalls(accountId?: string): Promise<WpeInstall[]> {
  const path = accountId ? `/installs?account_id=${accountId}&limit=100` : '/installs?limit=100'
  const data = await wpeRequest<{results: WpeInstall[]}>(`${path}`)
  return data.results
}

export async function createBackup(installId: string): Promise<WpeBackup> {
  return wpeRequest<WpeBackup>(`/installs/${installId}/backups`, {
    method: 'POST',
    body: JSON.stringify({description: `local-cli pre-push backup ${new Date().toISOString()}`}),
  })
}

export async function purgeCache(installId: string): Promise<void> {
  for (const type of ['cdn', 'object', 'page']) {
    try {
      await wpeRequest(`/installs/${installId}/purge_cache`, {
        method: 'POST',
        body: JSON.stringify({type}),
      })
    } catch {
      // cache purge failures are non-fatal
    }
  }
}

export async function listSshKeys(): Promise<Array<{uuid: string; fingerprint: string}>> {
  const data = await wpeRequest<{results: Array<{uuid: string; fingerprint: string}>}>('/ssh_keys?limit=100')
  return data.results
}

export async function registerSshKey(publicKey: string): Promise<void> {
  await wpeRequest('/ssh_keys', {
    method: 'POST',
    body: JSON.stringify({public_key: publicKey}),
  })
}

export function saveCredentials(apiKeyId: string, apiKeySecret: string): void {
  const dir = join(homedir(), '.local-cli')
  if (!existsSync(dir)) {
    mkdirSync(dir, {recursive: true})
    chmodSync(dir, 0o700)
  }
  writeFileSync(CREDENTIALS_PATH, JSON.stringify({wpengine: {apiKeyId, apiKeySecret}}, null, 2))
  chmodSync(CREDENTIALS_PATH, 0o600)
}

export function hasCredentials(): boolean {
  if (process.env.WPE_API_KEY_ID && process.env.WPE_API_KEY_SECRET) return true
  return existsSync(CREDENTIALS_PATH)
}
