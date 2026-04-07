import {SiteActionCommand} from '../helpers/site-action'
import {stopSite} from '../helpers/local-api'

export default class StopSite extends SiteActionCommand {
  static hiddenAliases = ['stop']
  static description = 'stop a Local site and all of its services'

  actionLabel = 'Stopping'
  actionIcon = '■'
  action = stopSite
}
