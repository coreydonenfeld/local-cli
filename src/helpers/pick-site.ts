import search from '@inquirer/search'
import {listSites} from './local-api'
import {formatStatus} from './display'
import {promptTheme} from './prompts'
import {ensureLocalRunning} from './ensure-local'

export async function pickSite(): Promise<string> {
  if (!await ensureLocalRunning()) process.exit(0)

  const sites = await listSites()
  if (sites.length === 0) throw new Error('No sites found in Local')

  if (sites.length === 1) return sites[0].id

  const EXIT_TERMS = ['quit', 'exit', 'q', 'e']

  let siteId: string | null
  try {
    siteId = await search<string | null>({
    message: 'Select a site (type to filter, or "q" to quit):',
    theme: promptTheme,
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
        choices.push({
          name: `${s.name} (${formatStatus(s.status)})`,
          short: s.name,
          value: s.id,
        })
      }

      if (!isExitTerm || filtered.length > 0) {
        choices.push({name: '[q] Quit', value: null})
      }

      return choices
    },
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'ExitPromptError') {
      console.log('\nGoodbye!')
      process.exit(0)
    }
    throw error
  }

  if (!siteId) {
    console.log('Goodbye!')
    process.exit(0)
  }

  return siteId
}
