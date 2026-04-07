import {Command} from '@oclif/core'
import {homedir} from 'node:os'
import {join} from 'node:path'
import {addSite, waitForJob, listSites} from '../helpers/local-api'
import {printPanel} from '../helpers/display'
import {phpVersions, mysqlVersions, webServers} from '../helpers/local-services'
import {quitableInput, quitableSelect, QuitError} from '../helpers/prompts'

export default class AddSite extends Command {
  static hiddenAliases = ['add', 'new']
  static description = 'create a new Local site'
  static examples = ['$ local-cli add-site']

  async run(): Promise<void> {
    await this.parse(AddSite)

    const phpChoices = phpVersions()
    const dbChoices = mysqlVersions()
    const wsChoices = webServers()

    if (phpChoices.length === 0 || dbChoices.length === 0) {
      console.log('▲ Could not detect installed Local services. Is Local installed?')
      return
    }

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

      console.log(`\nCreating ${name}...`)

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
        return
      }

      const sites = await listSites()
      const created = sites.find(s => s.name === name)
      if (created) {
        printPanel(created, `✓ Created ${created.name}`)
      } else {
        console.log('✓ Site created')
      }
    } catch (error) {
      if (error instanceof Error && (error.name === 'ExitPromptError' || error.name === 'QuitError')) {
        console.log('Cancelled.')
        return
      }
      throw error
    }
  }
}
