import {Command} from '@oclif/core'
import search from '@inquirer/search'
import select from '@inquirer/select'
import {Site, listSites, startSite, stopSite, restartSite, deleteSite, addSite, waitForJob} from '../helpers/local-api'
import {formatStatus, getSiteUrl, printPanel} from '../helpers/display'
import {loadGroups, getGroupForSite} from '../helpers/groups'
import {promptTheme} from '../helpers/prompts'
import confirm from '@inquirer/confirm'

const STUCK_STATES = ['stopping', 'starting', 'restarting']

const searchTheme = {
  ...promptTheme,
  prefix: {idle: '?', done: ''},
  style: {answer: () => ''},
}

function clearScreen(): void {
  process.stdout.write('\x1b[2J\x1b[H')
}

/**
 * Show a select prompt but also accept single-key shortcuts.
 * Returns the value from either the select or the shortcut.
 */
function selectWithShortcuts(
  config: Parameters<typeof select>[0],
  shortcuts: Record<string, string>,
): Promise<string> {
  const ac = new AbortController()

  const selectPromise = select(config, {signal: ac.signal}).then(value => {
    cleanup()
    return value
  })

  let cleanup = () => {}

  const shortcutPromise = new Promise<string>((resolve) => {
    const {stdin} = process
    const onData = (data: Buffer) => {
      const key = data.toString().toLowerCase()
      if (key in shortcuts) {
        ac.abort()
        cleanup()
        resolve(shortcuts[key])
      }
    }

    stdin.on('data', onData)
    cleanup = () => stdin.removeListener('data', onData)
  })

  return Promise.race([selectPromise, shortcutPromise]) as Promise<string>
}

async function fetchSites(): Promise<Site[]> {
  const sites = await listSites()
  return sites.sort((a, b) => {
    const aRunning = a.status.toLowerCase() === 'running' ? 0 : 1
    const bRunning = b.status.toLowerCase() === 'running' ? 0 : 1
    if (aRunning !== bRunning) return aRunning - bRunning
    return a.name.localeCompare(b.name)
  })
}

export default class Sites extends Command {
  static description = 'interactive site manager -- browse, search, start, and stop sites'

  static examples = [
    '$ local-cli sites',
  ]

  async run(): Promise<void> {
    await this.parse(Sites)
    let keepGoing = true

    const groups = loadGroups()

    while (keepGoing) {
      let sites: Site[]
      try {
        sites = await fetchSites()
      } catch {
        console.log('▲ Could not connect to Local. Is it running?')
        return
      }

      if (sites.length === 0) {
        console.log('No sites found in Local.')
        return
      }

      try {
        clearScreen()

        const EXIT_TERMS = ['quit', 'exit', 'q', 'e']

        const siteId = await search<string | null>({
          message: 'Select a site (type to filter, or "q" to quit):',
          theme: searchTheme,
          source: (term) => {
            const lowerTerm = (term || '').toLowerCase()
            const isExitTerm = EXIT_TERMS.some(t => t.startsWith(lowerTerm) && lowerTerm.length > 0)

            const filtered = term
              ? sites.filter(s => s.name.toLowerCase().includes(lowerTerm))
              : sites

            const choices: Array<{name: string; value: string | null; short?: string}> = []

            if (isExitTerm && filtered.length === 0) {
              choices.push({name: '[q] Quit', value: null})
            }

            for (const s of filtered) {
              const group = getGroupForSite(s.id, groups)
              const label = group
                ? `${s.name} (${formatStatus(s.status)}) \x1b[2m${group}\x1b[0m`
                : `${s.name} (${formatStatus(s.status)})`
              choices.push({name: label, short: s.name, value: s.id})
            }

            choices.push({name: '[+] Add new site', value: '__add__'})

            if (!isExitTerm || filtered.length > 0) {
              choices.push({name: '[q] Quit', value: null})
            }

            return choices
          },
        })

        if (!siteId) return

        if (siteId === '__add__') {
          await this.runAddSite()
          continue
        }

        const site = sites.find(s => s.id === siteId)!

        let stayOnSite = true
        let notice: string | undefined

        while (stayOnSite) {
          const status = site.status.toLowerCase()
          const isRunning = status === 'running'
          const isStuck = ['stopping', 'starting', 'restarting'].includes(status)

          clearScreen()
          printPanel(site, notice)
          notice = undefined

          const choices: Array<{name: string; value: string}> = []
          const shortcuts: Record<string, string> = {d: 'delete', b: 'back', q: 'quit'}

          if (isStuck) {
            choices.push({name: '[r] ↻ Restart site (stuck? force restart)', value: 'restart'})
            shortcuts.r = 'restart'
          } else if (isRunning) {
            choices.push({name: '[o] ↗ Open in browser', value: 'open'})
            choices.push({name: '[c] ⎘ Copy site URL', value: 'copy'})
            choices.push({name: '[r] ↻ Restart site', value: 'restart'})
            choices.push({name: '[s] ■ Stop site', value: 'stop'})
            shortcuts.o = 'open'
            shortcuts.c = 'copy'
            shortcuts.r = 'restart'
            shortcuts.s = 'stop'
          } else {
            choices.push({name: '[s] ▶ Start site', value: 'start'})
            shortcuts.s = 'start'
          }

          choices.push({name: '[d] ✕ Delete site', value: 'delete'})
          choices.push({name: '[b] ⟵ Back to list', value: 'back'})
          choices.push({name: '[q] Quit', value: 'quit'})

          const action = await selectWithShortcuts(
            {message: 'Choose an action:', choices, theme: promptTheme},
            shortcuts,
          )

          switch (action) {
            case 'start': {
              clearScreen()
              printPanel(site, `▶ Starting ${site.name}...`)
              try {
                const result = await startSite(site.id)
                site.status = result.status
              } catch {
                notice = '▲ Failed to start site'
              }
              break
            }

            case 'restart': {
              clearScreen()
              printPanel(site, `↻ Restarting ${site.name}...`)
              try {
                const result = await restartSite(site.id)
                site.status = result.status
              } catch {
                notice = '▲ Failed to restart site'
              }
              break
            }

            case 'stop': {
              clearScreen()
              printPanel(site, `■ Stopping ${site.name}...`)
              try {
                const result = await stopSite(site.id)
                site.status = result.status
              } catch {
                notice = '▲ Failed to stop site'
              }
              break
            }

            case 'open': {
              const siteUrl = getSiteUrl(site)
              const {execFileSync} = await import('node:child_process')
              const platform = process.platform
              try {
                if (platform === 'darwin') {
                  execFileSync('open', [siteUrl])
                } else if (platform === 'win32') {
                  execFileSync('cmd', ['/c', 'start', siteUrl])
                } else {
                  execFileSync('xdg-open', [siteUrl])
                }
                notice = `↗ Opened ${siteUrl}`
              } catch {
                notice = `▲ Could not open browser. URL: ${siteUrl}`
              }
              break
            }

            case 'copy': {
              const siteUrl = getSiteUrl(site)
              const {execFileSync} = await import('node:child_process')
              const platform = process.platform
              try {
                if (platform === 'darwin') {
                  execFileSync('pbcopy', {input: siteUrl})
                } else if (platform === 'win32') {
                  execFileSync('clip', {input: siteUrl})
                } else {
                  execFileSync('xclip', ['-selection', 'clipboard'], {input: siteUrl})
                }
                notice = '✓ Copied to clipboard!'
              } catch {
                notice = `URL: ${siteUrl}`
              }

              break
            }

            case 'delete': {
              clearScreen()
              printPanel(site)
              const yes = await confirm({
                message: `Permanently delete "${site.name}" and all its files? This cannot be undone.`,
                default: false,
                theme: promptTheme,
              })
              if (yes) {
                console.log(`Deleting ${site.name}...`)
                try {
                  await deleteSite(site.id)
                  notice = `✓ ${site.name} deleted`
                  stayOnSite = false
                } catch {
                  notice = '▲ Failed to delete site'
                }
              }
              break
            }

            case 'back':
              stayOnSite = false
              break

            case 'quit':
              console.log('Goodbye!')
              return
          }
        }
      } catch (error) {
        if (error instanceof Error && (error.name === 'ExitPromptError' || error.name === 'QuitError')) {
          console.log('Goodbye!')
          return
        }

        throw error
      }
    }
  }

  private async runAddSite(): Promise<void> {
    const {quitableInput, quitableSelect, QuitError} = await import('../helpers/prompts')
    const {homedir} = await import('node:os')
    const {join} = await import('node:path')
    const {phpVersions, mysqlVersions, webServers} = await import('../helpers/local-services')

    const phpChoices = phpVersions()
    const dbChoices = mysqlVersions()
    const wsChoices = webServers()

    if (phpChoices.length === 0 || dbChoices.length === 0) {
      console.log('▲ Could not detect installed Local services. Is Local installed?')
      return
    }

    clearScreen()
    console.log('Create a new site ("q" to quit at any point)\n')

    try {
      const name = await quitableInput({message: 'Site name:'})
      const domain = await quitableInput({
        message: 'Domain:',
        default: `${name.toLowerCase().replace(/\s+/g, '-')}.local`,
      })
      const phpVersion = await quitableSelect({message: 'PHP version:', choices: phpChoices})
      const webServer = await quitableSelect({message: 'Web server:', choices: wsChoices})
      const database = await quitableSelect({message: 'Database:', choices: dbChoices})

      clearScreen()
      console.log(`Creating ${name}...\n`)

      const job = await addSite({
        name,
        domain,
        path: join(homedir(), 'Local Sites', name),
        phpVersion,
        webServer,
        database,
        environment: 'preferred',
        multiSite: 'No',
        wpAdminEmail: 'admin@localhost.com',
        wpAdminUsername: 'admin',
        wpAdminPassword: 'password',
        goToSite: false,
      })

      const result = await waitForJob(job.id, () => process.stdout.write('.'))
      console.log('')

      if (result.status === 'failed') {
        console.log(`▲ Failed to create site: ${JSON.stringify(result.error)}`)
      } else {
        console.log(`✓ ${name} created`)
      }
    } catch (error) {
      if (error instanceof QuitError) return
      throw error
    }
  }
}
