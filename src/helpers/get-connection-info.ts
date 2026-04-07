import {readFileSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'

export interface ConnectionInfo {
  port: number
  authToken: string
  url: string
  subscriptionUrl: string
}

export default function getConnectionInfo(): ConnectionInfo {
  const connectionInfoPath = join(homedir(), 'Library/Application Support/Local/graphql-connection-info.json')

  try {
    return JSON.parse(readFileSync(connectionInfoPath, 'utf-8'))
  } catch {
    throw new Error('GraphQL connection info not found. Please ensure that Local is running.')
  }
}
