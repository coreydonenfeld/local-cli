import {Args, Command} from '@oclif/core'
import select from '@inquirer/select'
import {readFileSync, writeFileSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'
import getSiteId from '../helpers/get-site-id'
import {hasCredentials, listAccounts, listInstalls} from '../helpers/wpe-api'
import {promptTheme} from '../helpers/prompts'

export default class Connect extends Command {
  static description = 'link a local site to a WP Engine environment'

  static examples = [
    '$ local-cli connect my-site',
  ]

  static args = {
    site: Args.string({description: 'site name, ID, or domain', required: true}),
  }

  async run(): Promise<void> {
    const {args} = await this.parse(Connect)

    if (!hasCredentials()) {
      console.log('▲ WP Engine credentials not configured. Run "local-cli auth" first.')
      return
    }

    const sitesPath = join(homedir(), 'Library/Application Support/Local/sites.json')
    const sites = JSON.parse(readFileSync(sitesPath, 'utf-8'))

    let siteId = args.site
    const resolved = getSiteId(args.site)
    if (resolved) siteId = resolved

    const site = sites[siteId]
    if (!site) {
      console.log(`▲ Site "${args.site}" not found in Local`)
      return
    }

    const existing = (site.hostConnections || []).find((c: any) => c.hostId === 'wpe')
    if (existing) {
      console.log(`Site "${site.name}" is already connected to WP Engine (install: ${existing.remoteSiteId})`)
      return
    }

    try {
      console.log('Fetching WP Engine accounts...\n')
      const accounts = await listAccounts()

      if (accounts.length === 0) {
        console.log('▲ No WP Engine accounts found for these credentials.')
        return
      }

      const accountId = await select({
        message: 'Select account:',
        choices: accounts.map(a => ({name: a.name, value: a.id})),
        theme: promptTheme,
      })

      console.log('\nFetching installs...\n')
      const installs = await listInstalls(accountId)

      if (installs.length === 0) {
        console.log('▲ No installs found for this account.')
        return
      }

      const installId = await select({
        message: 'Select install:',
        choices: installs.map(i => ({
          name: `${i.name} (${i.environment}) - ${i.primary_domain}`,
          value: i.id,
        })),
        theme: promptTheme,
      })

      const install = installs.find(i => i.id === installId)!

      if (!site.hostConnections) site.hostConnections = []
      site.hostConnections.push({
        hostId: 'wpe',
        userId: '',
        accountId,
        remoteSiteId: installId,
        remoteSiteEnv: install.environment,
        database: true,
        databaseOnly: false,
        magicSync: true,
      })

      writeFileSync(sitesPath, JSON.stringify(sites, null, 2))
      console.log(`\n✓ Connected "${site.name}" to ${install.name} (${install.environment})`)
    } catch (error) {
      if (error instanceof Error && error.name === 'ExitPromptError') {
        console.log('Cancelled.')
        return
      }
      throw error
    }
  }
}
