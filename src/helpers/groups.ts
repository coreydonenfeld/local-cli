import {readFileSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'

interface GroupDef {
  id: string
  name: string
  siteIds: string[]
  open: boolean
  index: number
}

interface GroupsFile {
  siteMap: Record<string, string>
  groups: Record<string, GroupDef>
  sortSitesByLastStarted: boolean
}

export interface SiteGroup {
  id: string
  name: string
  siteIds: string[]
}

export function loadGroups(): SiteGroup[] {
  const path = join(homedir(), 'Library/Application Support/Local/site-groups.json')
  try {
    const data: GroupsFile = JSON.parse(readFileSync(path, 'utf-8'))
    return Object.values(data.groups)
      .filter(g => g.siteIds.length > 0)
      .sort((a, b) => a.index - b.index)
      .map(g => ({id: g.id, name: g.name, siteIds: g.siteIds}))
  } catch {
    return []
  }
}

export function getGroupForSite(siteId: string, groups: SiteGroup[]): string | null {
  for (const g of groups) {
    if (g.siteIds.includes(siteId)) return g.name
  }
  return null
}
