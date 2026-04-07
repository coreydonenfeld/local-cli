import {SiteActionCommand} from '../helpers/site-action'
import {startSite} from '../helpers/local-api'

export default class StartSite extends SiteActionCommand {
  static hiddenAliases = ['start']
  static description = 'start a Local site and all of its services'
  static examples = ['$ local-cli start my-site']

  actionLabel = 'Starting'
  actionIcon = '▶'
  action = startSite
}
