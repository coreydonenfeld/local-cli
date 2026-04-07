import {existsSync, readFileSync, mkdirSync, chmodSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {listSshKeys, registerSshKey} from './wpe-api'

const SSH_DIR = join(homedir(), 'Library/Application Support/Local/ssh')
const KEY_PATH = join(SSH_DIR, 'wpe-connect')
const PUB_PATH = `${KEY_PATH}.pub`

const SSH_FLAGS = [
  '-F', '/dev/null',
  '-o', 'IdentitiesOnly=yes',
  '-o', 'PubkeyAcceptedKeyTypes=+ssh-rsa',
  '-o', 'StrictHostKeyChecking=accept-new',
  '-o', 'ServerAliveInterval=60',
  '-o', 'ServerAliveCountMax=120',
  '-i', KEY_PATH,
]

export function ensureKeyPair(): void {
  if (existsSync(KEY_PATH) && existsSync(PUB_PATH)) return

  if (!existsSync(SSH_DIR)) mkdirSync(SSH_DIR, {recursive: true})

  execFileSync('ssh-keygen', ['-t', 'rsa', '-b', '4096', '-f', KEY_PATH, '-N', '', '-q'])
  chmodSync(KEY_PATH, 0o600)
  console.log('Generated SSH keypair for WP Engine')
}

export async function ensureKeyRegistered(): Promise<void> {
  ensureKeyPair()

  const pubKey = readFileSync(PUB_PATH, 'utf-8').trim()
  const fingerprint = getFingerprint()
  const registered = await listSshKeys()

  if (registered.some(k => k.fingerprint === fingerprint)) return

  console.log('Registering SSH key with WP Engine...')
  await registerSshKey(pubKey)
  console.log('SSH key registered')
}

function getFingerprint(): string {
  const output = execFileSync('ssh-keygen', ['-lf', PUB_PATH], {encoding: 'utf-8'})
  return output.split(' ')[1]
}

export function sshArgs(installName: string, prefix: string): string[] {
  return [...SSH_FLAGS, `local+${prefix}+${installName}@${installName}.ssh.wpengine.net`]
}

/** Returns rsync -e value with properly quoted key path */
export function rsyncSshCommand(): string {
  return `ssh -F /dev/null -o IdentitiesOnly=yes -o "PubkeyAcceptedKeyTypes=+ssh-rsa" -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=60 -o ServerAliveCountMax=120 -i "${KEY_PATH}"`
}

export function remotePath(installName: string): string {
  return `local+rsync+${installName}@${installName}.ssh.wpengine.net:/sites/${installName}/`
}
