import {Command} from '@oclif/core'
import {quitableInput, QuitError} from '../helpers/prompts'
import {saveCredentials, hasCredentials} from '../helpers/wpe-api'

export default class Auth extends Command {
  static description = 'configure WP Engine API credentials'
  static examples = ['$ local-cli auth']

  async run(): Promise<void> {
    await this.parse(Auth)

    if (hasCredentials()) {
      console.log('WP Engine credentials already configured.')
      console.log('Run this command again to update them.\n')
    }

    console.log('Generate API credentials at https://my.wpengine.com/api_access\n')

    try {
      const apiKeyId = await quitableInput({message: 'API Key ID:'})
      const apiKeySecret = await quitableInput({message: 'API Key Secret:'})

      saveCredentials(apiKeyId, apiKeySecret)
      console.log('✓ Credentials saved (permissions restricted to owner only)')
    } catch (error) {
      if (error instanceof Error && (error.name === 'ExitPromptError' || error.name === 'QuitError')) {
        console.log('Cancelled.')
        return
      }
      throw error
    }
  }
}
