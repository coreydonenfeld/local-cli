import {graphqlRequest} from './graphql-client'

export interface Site {
  id: string
  name: string
  status: string
}

export interface Job {
  id: string
  status: 'created' | 'running' | 'successful' | 'failed'
  logs: string | null
  error: unknown
}

export interface AddSiteInput {
  name: string
  domain: string
  path: string
  phpVersion?: string
  webServer?: string
  database?: string
  environment?: 'preferred' | 'custom'
  multiSite?: 'No' | 'Subdir' | 'Subdomain'
  wpAdminEmail?: string
  wpAdminUsername?: string
  wpAdminPassword?: string
  blueprint?: string
  goToSite?: boolean
}

export async function listSites(): Promise<Site[]> {
  const query = `
    {
      sites {
        id
        name
        status
      }
    }
  `
  const data = await graphqlRequest<{sites: Site[]}>(query)
  return data.sites
}

export async function startSite(siteID: string): Promise<Site> {
  const query = `
    mutation ($siteID: ID!) {
      startSite(id: $siteID) {
        id
        name
        status
      }
    }
  `
  const data = await graphqlRequest<{startSite: Site}>(query, {siteID})
  return data.startSite
}

export async function stopSite(siteID: string): Promise<Site> {
  const query = `
    mutation ($siteID: ID!) {
      stopSite(id: $siteID) {
        id
        name
        status
      }
    }
  `
  const data = await graphqlRequest<{stopSite: Site}>(query, {siteID})
  return data.stopSite
}

export async function restartSite(siteID: string): Promise<Site> {
  const query = `
    mutation ($siteID: ID!) {
      restartSite(id: $siteID) {
        id
        name
        status
      }
    }
  `
  const data = await graphqlRequest<{restartSite: Site}>(query, {siteID})
  return data.restartSite
}

export async function addSite(input: AddSiteInput): Promise<Job> {
  const query = `
    mutation ($input: AddSiteInput) {
      addSite(input: $input) {
        id
        status
        logs
        error
      }
    }
  `
  const data = await graphqlRequest<{addSite: Job}>(query, {input})
  return data.addSite
}

export async function getJob(id: string): Promise<Job> {
  const query = `
    query ($id: ID!) {
      job(id: $id) {
        id
        status
        logs
        error
      }
    }
  `
  const data = await graphqlRequest<{job: Job}>(query, {id})
  return data.job
}

export async function deleteSite(siteID: string): Promise<void> {
  const {readFileSync, writeFileSync, rmSync} = await import('node:fs')
  const {homedir} = await import('node:os')
  const {join} = await import('node:path')

  const localDir = join(homedir(), 'Library/Application Support/Local')
  const sitesPath = join(localDir, 'sites.json')
  const groupsPath = join(localDir, 'site-groups.json')

  // Stop site first (ignore errors if already stopped)
  try { await stopSite(siteID) } catch {}

  const sites = JSON.parse(readFileSync(sitesPath, 'utf-8'))
  const site = sites[siteID]
  if (!site) throw new Error(`Site ${siteID} not found in sites.json`)

  const sitePath = site.path || site.longPath

  // Remove from sites.json
  delete sites[siteID]
  writeFileSync(sitesPath, JSON.stringify(sites, null, 2))

  // Remove from site-groups.json
  try {
    const groupsData = JSON.parse(readFileSync(groupsPath, 'utf-8'))
    if (groupsData.siteMap) delete groupsData.siteMap[siteID]
    for (const g of Object.values(groupsData.groups || {}) as Array<{siteIds: string[]}>) {
      g.siteIds = g.siteIds.filter((id: string) => id !== siteID)
    }
    writeFileSync(groupsPath, JSON.stringify(groupsData, null, 2))
  } catch {}

  // Delete site directory
  if (sitePath) {
    try { rmSync(sitePath, {recursive: true, force: true}) } catch {}
  }
}

export async function waitForJob(jobId: string, onProgress?: (job: Job) => void): Promise<Job> {
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
  while (true) {
    const job = await getJob(jobId)
    onProgress?.(job)
    if (job.status === 'successful' || job.status === 'failed') return job
    await sleep(1000)
  }
}
