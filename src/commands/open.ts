import {Command} from '@oclif/core'
import {execFileSync} from 'node:child_process'

export default class Open extends Command {
  static description = 'open the Local app'
  static examples = ['$ local-cli open']

  async run(): Promise<void> {
    await this.parse(Open)

    const platform = process.platform
    try {
      if (platform === 'darwin') {
        execFileSync('open', ['-a', 'Local'])
      } else if (platform === 'win32') {
        execFileSync('cmd', ['/c', 'start', '', 'Local'])
      } else {
        execFileSync('local', [], {stdio: 'ignore'})
      }
      console.log('✓ Opening Local...')
    } catch {
      console.log('▲ Could not open Local. Is it installed?')
    }
  }
}
