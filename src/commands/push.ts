import {Args, Command, Flags} from '@oclif/core'
import confirm from '@inquirer/confirm'
import {resolveWpeSite} from '../helpers/wpe-site'
import {ensureKeyRegistered} from '../helpers/wpe-ssh'
import {createBackup, purgeCache} from '../helpers/wpe-api'
import {dryRunSync, executeSync} from '../helpers/wpe-rsync'
import {pushDatabase} from '../helpers/wpe-db'
import {printPanel} from '../helpers/display'
import {promptTheme} from '../helpers/prompts'

export default class Push extends Command {
  static description = 'push files (and optionally database) to WP Engine'

  static examples = [
    '$ local-cli push my-site',
    '$ local-cli push my-site --db',
    '$ local-cli push my-site --dry-run',
    '$ local-cli push my-site --exclude wp-content/uploads',
  ]

  static args = {
    site: Args.string({description: 'site name, ID, or domain', required: true}),
  }

  static flags = {
    db: Flags.boolean({description: 'include database', default: false}),
    'db-only': Flags.boolean({description: 'push database only, skip files', default: false}),
    'dry-run': Flags.boolean({description: 'show what would change without pushing', default: false}),
    'no-backup': Flags.boolean({description: 'skip pre-push backup on WPE (not recommended)', default: false}),
    exclude: Flags.string({description: 'exclude path from sync (repeatable)', multiple: true}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Push)
    const excludes = flags.exclude || []

    let info
    try {
      info = await resolveWpeSite(args.site)
    } catch (err) {
      console.log(`▲ ${err instanceof Error ? err.message : err}`)
      return
    }

    const envLabel = info.connection.remoteSiteEnv || 'unknown'
    console.log(`Pushing to WP Engine: ${info.installName} (${envLabel}) - ${info.remoteDomain}`)
    printPanel({id: info.siteId, name: info.siteName, status: 'pushing'})

    // Safety: confirm push to production
    if (envLabel === 'production') {
      const prodConfirm = await confirm({
        message: '▲ You are pushing to PRODUCTION. Are you sure?',
        default: false,
        theme: promptTheme,
      })
      if (!prodConfirm) {
        console.log('Cancelled.')
        return
      }
    }

    await ensureKeyRegistered()

    // Create backup before any changes (unless explicitly skipped)
    if (!flags['no-backup']) {
      console.log('Creating backup on WP Engine...')
      try {
        await createBackup(info.installId)
        console.log('✓ Backup created')
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('429') || msg.includes('throttl')) {
          console.log('▲ Backup throttled (recent backup exists) - continuing')
        } else {
          console.log(`▲ Backup failed: ${msg}`)
          const cont = await confirm({
            message: 'Continue without backup?',
            default: false,
            theme: promptTheme,
          })
          if (!cont) {
            console.log('Cancelled.')
            return
          }
        }
      }
    }

    if (!flags['db-only']) {
      console.log('\nChecking for changes...')
      const preview = dryRunSync(info.installName, info.webRoot, 'push', excludes)

      if (preview.filesChanged === 0) {
        console.log('No file changes to push.')
      } else {
        console.log(`${preview.filesChanged} file(s) will be modified.\n`)

        if (flags['dry-run']) {
          console.log(preview.output)
          return
        }

        const yes = await confirm({
          message: `Push ${preview.filesChanged} file(s) to ${info.installName} (${envLabel})?`,
          default: true,
          theme: promptTheme,
        })

        if (!yes) {
          console.log('Cancelled.')
          return
        }

        console.log('Pushing files...')
        const result = executeSync(info.installName, info.webRoot, 'push', excludes)
        console.log(`✓ ${result.filesChanged} file(s) synced`)
      }
    }

    if (flags.db || flags['db-only']) {
      const dbConfirm = await confirm({
        message: `Push database to ${info.installName} (${envLabel})? This will OVERWRITE the remote database.`,
        default: false,
        theme: promptTheme,
      })

      if (dbConfirm) {
        pushDatabase(info.installName, info.remoteDomain, info.siteDomain, info.sitePath)
        console.log('✓ Database pushed and domain replaced')
      }
    }

    // Purge caches
    console.log('Purging caches...')
    await purgeCache(info.installId)

    console.log('\n✓ Push complete')
  }
}
