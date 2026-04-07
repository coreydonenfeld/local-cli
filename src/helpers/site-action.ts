import {Args, Command} from '@oclif/core'
import getSiteId from './get-site-id'
import {printPanel} from './display'
import type {Site} from './local-api'

export type ActionFn = (siteID: string) => Promise<Site>

export abstract class SiteActionCommand extends Command {
  static args = {
    siteID: Args.string({description: 'site ID or name', required: true}),
  }

  abstract actionLabel: string
  abstract actionIcon: string
  abstract action: ActionFn

  async run(): Promise<void> {
    const {args} = await this.parse(this.constructor as typeof SiteActionCommand)

    const resolvedId = getSiteId(args.siteID)
    if (resolvedId) args.siteID = resolvedId

    console.log(`${this.actionIcon} ${this.actionLabel} ${args.siteID}...`)

    try {
      const site = await this.action(args.siteID)
      if (!site) {
        console.log('▲ No response from Local. Site might not exist.')
        return
      }
      printPanel(site, `${this.actionIcon} ${site.name} is now ${site.status}`)
    } catch {
      console.log(`▲ Failed to ${this.actionLabel.toLowerCase()} site. Is the ID correct?`)
    }
  }
}
