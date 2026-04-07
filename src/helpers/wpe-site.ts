import {readFileSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'
import getSiteId from './get-site-id'
import {getInstall} from './wpe-api'

interface HostConnection {
  hostId: string
  userId: string
  accountId: string
  remoteSiteId: string
  remoteSiteEnv: string
  database: boolean
  databaseOnly: boolean
  magicSync: boolean
}

export interface WpeSiteInfo {
  siteId: string
  siteName: string
  siteDomain: string
  sitePath: string
  webRoot: string
  installName: string
  installId: string
  remoteDomain: string
  connection: HostConnection
}

export async function resolveWpeSite(siteInput: string): Promise<WpeSiteInfo> {
  const sitesPath = join(homedir(), 'Library/Application Support/Local/sites.json')
  const sites = JSON.parse(readFileSync(sitesPath, 'utf-8'))

  // Resolve by name/domain/ID
  let siteId = siteInput
  const resolved = getSiteId(siteInput)
  if (resolved) siteId = resolved

  const site = sites[siteId]
  if (!site) throw new Error(`Site "${siteInput}" not found in Local`)

  const connections: HostConnection[] = site.hostConnections || []
  const wpeConn = connections.find(c => c.hostId === 'wpe')
  if (!wpeConn) {
    throw new Error(
      `Site "${site.name}" is not connected to WP Engine.\n` +
      'Run "local-cli connect" to link it to a WPE environment.'
    )
  }

  const install = await getInstall(wpeConn.remoteSiteId)

  return {
    siteId,
    siteName: site.name,
    siteDomain: site.domain,
    sitePath: site.path || site.longPath,
    webRoot: join(site.path || site.longPath, 'app', 'public'),
    installName: install.name,
    installId: wpeConn.remoteSiteId,
    remoteDomain: install.primary_domain,
    connection: wpeConn,
  }
}
