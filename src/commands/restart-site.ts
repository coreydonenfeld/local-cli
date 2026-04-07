import {SiteActionCommand} from '../helpers/site-action'
import {restartSite} from '../helpers/local-api'

export default class RestartSite extends SiteActionCommand {
  static hiddenAliases = ['restart']
  static description = 'restart a Local site and all of its services'
  static examples = ['$ local-cli restart my-site']

  actionLabel = 'Restarting'
  actionIcon = '↻'
  action = restartSite
}
