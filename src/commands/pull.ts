import {Args, Command, Flags} from '@oclif/core'
import confirm from '@inquirer/confirm'
import {resolveWpeSite} from '../helpers/wpe-site'
import {ensureKeyRegistered} from '../helpers/wpe-ssh'
import {dryRunSync, executeSync} from '../helpers/wpe-rsync'
import {pullDatabase} from '../helpers/wpe-db'
import {printPanel} from '../helpers/display'
import {promptTheme} from '../helpers/prompts'

export default class Pull extends Command {
  static description = 'pull files (and optionally database) from WP Engine'

  static examples = [
    '$ local-cli pull my-site',
    '$ local-cli pull my-site --db',
    '$ local-cli pull my-site --dry-run',
    '$ local-cli pull my-site --exclude wp-content/uploads',
  ]

  static args = {
    site: Args.string({description: 'site name, ID, or domain', required: true}),
  }

  static flags = {
    db: Flags.boolean({description: 'include database', default: false}),
    'db-only': Flags.boolean({description: 'pull database only, skip files', default: false}),
    'dry-run': Flags.boolean({description: 'show what would change without pulling', default: false}),
    exclude: Flags.string({description: 'exclude path from sync (repeatable)', multiple: true}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Pull)
    const excludes = flags.exclude || []

    let info
    try {
      info = await resolveWpeSite(args.site)
    } catch (err) {
      console.log(`▲ ${err instanceof Error ? err.message : err}`)
      return
    }

    console.log(`Pulling from WP Engine: ${info.installName} (${info.remoteDomain})`)
    printPanel({id: info.siteId, name: info.siteName, status: 'pulling'})

    await ensureKeyRegistered()

    if (!flags['db-only']) {
      // Always dry-run first to show what will change
      console.log('\nChecking for changes...')
      const preview = dryRunSync(info.installName, info.webRoot, 'pull', excludes)

      if (preview.filesChanged === 0) {
        console.log('No file changes to pull.')
      } else {
        console.log(`${preview.filesChanged} file(s) will be modified.\n`)

        if (flags['dry-run']) {
          console.log(preview.output)
          return
        }

        const yes = await confirm({
          message: `Pull ${preview.filesChanged} file(s) from ${info.installName}?`,
          default: true,
          theme: promptTheme,
        })

        if (!yes) {
          console.log('Cancelled.')
          return
        }

        console.log('Pulling files...')
        const result = executeSync(info.installName, info.webRoot, 'pull', excludes)
        console.log(`✓ ${result.filesChanged} file(s) synced`)
      }
    }

    if (flags.db || flags['db-only']) {
      const dbConfirm = await confirm({
        message: `Pull database from ${info.installName}? This will OVERWRITE your local database.`,
        default: false,
        theme: promptTheme,
      })

      if (dbConfirm) {
        pullDatabase(info.installName, info.remoteDomain, info.siteDomain, info.sitePath)
        console.log('✓ Database pulled and domain replaced')
      }
    }

    console.log('\n✓ Pull complete')
  }
}
