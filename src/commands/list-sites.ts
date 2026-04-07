import {Command, Flags} from '@oclif/core'
import {listSites, Site} from '../helpers/local-api'
import {formatStatus, getSiteUrl, SEP} from '../helpers/display'
import {loadGroups, getGroupForSite} from '../helpers/groups'

export default class ListSites extends Command {
  static hiddenAliases = ['ls']
  static description = 'list all Local sites'

  static examples = [
    '$ local-cli ls',
    '$ local-cli ls --format json',
    '$ local-cli ls --status running',
    '$ local-cli ls --group Projects',
  ]

  static flags = {
    format: Flags.string({
      char: 'f',
      description: 'output format (table or json)',
      options: ['table', 'json'],
      default: 'table',
    }),
    order: Flags.string({
      char: 'o',
      description: 'order by field (name or status)',
      options: ['name', 'status'],
      default: 'name',
    }),
    status: Flags.string({
      char: 's',
      description: 'filter by status (running, halted, stopped, or all)',
      options: ['running', 'halted', 'stopped', 'all'],
      default: 'all',
    }),
    group: Flags.string({
      char: 'g',
      description: 'filter by group name',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ListSites)

    let sites: Site[]
    try {
      sites = await listSites()
    } catch {
      console.log('▲ Could not connect to Local. Is it running?')
      return
    }

    const groups = loadGroups()

    if (flags.group) {
      const target = flags.group.toLowerCase()
      sites = sites.filter(s => {
        const g = getGroupForSite(s.id, groups)
        return g !== null && g.toLowerCase() === target
      })
    }

    if (flags.status && flags.status !== 'all') {
      const requested = flags.status.toLowerCase()
      sites = sites.filter(site => {
        const st = (site.status || '').toLowerCase()
        if (requested === 'halted') return st === 'halted' || st === 'stopped'
        return st === requested
      })
    }

    if (flags.order === 'name') sites.sort((a, b) => a.name.localeCompare(b.name))
    else if (flags.order === 'status') sites.sort((a, b) => a.status.localeCompare(b.status))

    if (flags.format === 'json') {
      const enriched = sites.map(s => ({...s, group: getGroupForSite(s.id, groups)}))
      console.log(JSON.stringify(enriched, null, 2))
      return
    }

    if (sites.length === 0) {
      console.log('No sites found.')
      return
    }

    if (flags.group) {
      for (const site of sites) {
        const dot = site.status.toLowerCase() === 'running' ? '●' : '○'
        console.log(`${dot} ${site.name} (${formatStatus(site.status)})`)
        console.log(`  ID:  ${site.id}`)
        console.log(`  URL: ${getSiteUrl(site)}`)
      }
    } else {
      const grouped = new Map<string, Site[]>()
      for (const site of sites) {
        const g = getGroupForSite(site.id, groups) || 'Ungrouped'
        if (!grouped.has(g)) grouped.set(g, [])
        grouped.get(g)!.push(site)
      }

      for (const [groupName, groupSites] of grouped) {
        console.log(`\n${groupName}`)
        console.log(SEP)
        for (const site of groupSites) {
          const dot = site.status.toLowerCase() === 'running' ? '●' : '○'
          console.log(`${dot} ${site.name} (${formatStatus(site.status)})`)
          console.log(`  ID:  ${site.id}`)
          console.log(`  URL: ${getSiteUrl(site)}`)
        }
      }
    }

    console.log(SEP)
    console.log(`${sites.length} site${sites.length === 1 ? '' : 's'}`)
  }
}
