import {Command} from '@oclif/core'
import {quitableInput} from '../helpers/prompts'
import {saveCredentials, hasCredentials, getCurrentUser} from '../helpers/wpe-api'

export default class Auth extends Command {
  static description = 'configure WP Engine API credentials'
  static examples = ['$ local-cli auth']

  async run(): Promise<void> {
    await this.parse(Auth)

    if (hasCredentials()) {
      try {
        const user = await getCurrentUser()
        console.log(`Logged in as ${user.first_name} ${user.last_name} (${user.email})`)
      } catch {
        console.log('WP Engine credentials configured but could not verify.')
      }
      console.log('Run this command again to update them.\n')
    }

    console.log('Configure WP Engine API credentials ("q" to quit at any point)')
    console.log('Generate credentials at https://my.wpengine.com/api_access\n')

    try {
      const username = await quitableInput({message: 'API Username (Key ID):'})
      const password = await quitableInput({message: 'API Password (Key Secret):'})

      saveCredentials(username, password)
      console.log('✓ Credentials saved')

      try {
        const user = await getCurrentUser()
        console.log(`✓ Logged in as ${user.first_name} ${user.last_name} (${user.email})`)
      } catch {
        console.log('▲ Credentials saved but could not verify. Check your username/password.')
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
