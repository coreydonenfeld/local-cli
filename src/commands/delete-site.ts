import {Args, Command} from '@oclif/core'
import confirm from '@inquirer/confirm'
import getSiteId from '../helpers/get-site-id'
import {deleteSite} from '../helpers/local-api'
import {promptTheme} from '../helpers/prompts'

export default class DeleteSite extends Command {
  static hiddenAliases = ['delete', 'rm']
  static description = 'permanently delete a Local site and all its files'
  static examples = ['$ local-cli delete my-site']

  static args = {
    siteID: Args.string({description: 'site ID or name', required: true}),
  }

  async run(): Promise<void> {
    const {args} = await this.parse(DeleteSite)

    const resolvedId = getSiteId(args.siteID)
    if (resolvedId) args.siteID = resolvedId

    const yes = await confirm({
      message: `Permanently delete "${args.siteID}" and all its files? This cannot be undone.`,
      default: false,
      theme: promptTheme,
    })

    if (!yes) {
      console.log('Cancelled.')
      return
    }

    console.log(`Deleting ${args.siteID}...`)

    try {
      await deleteSite(args.siteID)
      console.log('✓ Site deleted')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.log(`▲ Failed to delete site: ${msg}`)
    }
  }
}
