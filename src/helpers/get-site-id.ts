import {readFileSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'

export default function getSiteId(input: string): string | false {
  const sitesJsonFile = join(homedir(), 'Library/Application Support/Local/sites.json')

  try {
    const sitesJson = JSON.parse(readFileSync(sitesJsonFile, 'utf-8'))
    const lower = input.toLowerCase()

    for (const siteID in sitesJson) {
      const site = sitesJson[siteID]
      const name = (site.name || '').toLowerCase()
      const domain = (site.domain || '').toLowerCase()

      // Match by name (case-insensitive), domain, or domain without .local
      if (lower === name || lower === domain || lower === domain.replace(/\.local$/, '')) {
        return siteID
      }
    }

    return false
  } catch {
    throw new Error('Sites info not found. Please ensure that Local is running.')
  }
}
