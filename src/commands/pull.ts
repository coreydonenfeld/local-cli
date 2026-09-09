import {Args, Command, Flags} from '@oclif/core'
import confirm from '@inquirer/confirm'
import {resolveWpeSite} from '../helpers/wpe-site'
import {ensureKeyRegistered} from '../helpers/wpe-ssh'
import {dryRunSync, executeSync, summarizeChanges, type CompareMode} from '../helpers/wpe-rsync'
import {pullDatabase} from '../helpers/wpe-db'
import {printPanel} from '../helpers/display'
import {promptTheme} from '../helpers/prompts'
import {pickSite} from '../helpers/pick-site'
import {startSpinner, formatDuration} from '../helpers/progress'

export default class Pull extends Command {
  static description = 'pull files (and optionally database) from WP Engine'

  static examples = [
    '$ local-cli pull my-site',
    '$ local-cli pull my-site --db',
    '$ local-cli pull my-site --dry-run',
    '$ local-cli pull my-site --exclude wp-content/uploads',
  ]

  static args = {
    site: Args.string({description: 'site name, ID, or domain'}),
  }

  static flags = {
    db: Flags.boolean({description: 'include database', default: false}),
    'db-only': Flags.boolean({description: 'pull database only, skip files', default: false}),
    'dry-run': Flags.boolean({description: 'show what would change without pulling', default: false}),
    exclude: Flags.string({description: 'exclude path from sync (repeatable)', multiple: true}),
    'size-only': Flags.boolean({
      description: 'compare by size only, ignoring timestamps (faster; misses same-size edits)',
      default: false,
    }),
    checksum: Flags.boolean({
      description: 'compare by checksum instead of size and timestamp (slowest; most accurate)',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(Pull)
    const excludes = flags.exclude || []
    const compare: CompareMode = flags.checksum ? 'checksum' : flags['size-only'] ? 'size-only' : 'default'
    const siteInput = args.site || await pickSite()

    let info
    try {
      info = await resolveWpeSite(siteInput)
    } catch (err) {
      console.log(`▲ ${err instanceof Error ? err.message : err}`)
      return
    }

    const wpe = {installName: info.installName, remoteDomain: info.remoteDomain, environment: info.connection.remoteSiteEnv}
    printPanel({id: info.siteId, name: info.siteName, status: 'pulling'}, `↓ Pulling from WP Engine...`, wpe)

    await ensureKeyRegistered()

    if (!flags['db-only']) {
      // Always dry-run first to show what will change
      console.log('')
      const checking = startSpinner('Checking for changes...')
      const preview = await dryRunSync(info.installName, info.webRoot, 'pull', {
        excludes,
        compare,
        onProgress: (file, count) => checking.update(`Checking for changes... ${count} found ${file}`),
      })
      checking.stop()

      if (preview.filesChanged === 0) {
        console.log('No file changes to pull.')
      } else {
        console.log(summarizeChanges(preview) + '\n')

        if (flags['dry-run']) {
          console.log(preview.output)
          return
        }

        const yes = await confirm({
          message: preview.deletions > 0
            ? `Pull ${preview.transfers} file(s) and delete ${preview.deletions} local file(s) from ${info.installName}?`
            : `Pull ${preview.transfers} file(s) from ${info.installName}?`,
          default: true,
          theme: promptTheme,
        })

        if (!yes) {
          console.log('Cancelled.')
          return
        }

        const total = preview.filesChanged
        const spinner = startSpinner(`Pulling ${total} file(s)...`)
        const result = await executeSync(info.installName, info.webRoot, 'pull', {
          excludes,
          compare,
          onProgress: (file, count) => {
            const pct = Math.floor((count / total) * 100)
            spinner.update(`[${count}/${total}] ${pct}% ${file}`)
          },
        })
        spinner.stop(`✓ ${result.filesChanged} file(s) synced in ${formatDuration(spinner.elapsed())}`)
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
