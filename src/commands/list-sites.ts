import Table = require('cli-table')
import {Command, flags} from '@oclif/command'
import createGraphQLClient, {gql} from '../helpers/graphql-client'

export default class ListSites extends Command {
    static description = 'list all Local sites'

    static examples = [
      '$ local-cli list',
      '$ local-cli list --format json',
      '$ local-cli list --order name',
      '$ local-cli list --order status',
      '$ local-cli list --status running',
      '$ local-cli list --status halted',
    ]

    static flags = {
      format: flags.string({
        char: 'f',
        description: 'output format (table or json)',
        options: ['table', 'json'],
        default: 'table',
      }),
      order: flags.string({
        char: 'o',
        description: 'order by field (name or status)',
        options: ['name', 'status'],
        default: 'name',
      }),
      status: flags.string({
        char: 's',
        description: 'filter by status (running, halted, stopped, or all)',
        options: ['running', 'halted', 'stopped', 'all'],
        default: 'all',
      }),
    }

    static args = []

    async run() {
      const {flags} = this.parse(ListSites)

      const query = gql`
          {
              sites {
                  id
                  name
                  status
              }
          }
      `

      const client = createGraphQLClient()
      const data = await client.request(query)

      let sites = data.sites

      // Filter by status if requested
      if (flags.status && flags.status !== 'all') {
        const requested = flags.status.toLowerCase()

        if (requested === 'halted') {
          // Accept either 'halted' or 'stopped' values coming from Local
          sites = sites.filter((site: any) => {
            const st = (site.status || '').toLowerCase()
            return st === 'halted' || st === 'stopped'
          })
        } else {
          sites = sites.filter((site: any) => (site.status || '').toLowerCase() === requested)
        }
      }

      // Sort sites based on the order flag
      if (flags.order === 'name') {
        sites = sites.sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name))
      } else if (flags.order === 'status') {
        sites = sites.sort((a: { status: string }, b: { status: string }) => a.status.localeCompare(b.status))
      }

      // Output in the specified format
      if (flags.format === 'json') {
        this.log(JSON.stringify(sites, null, 2))
      } else {
        const table = new Table({
          head: ['ID', 'Name', 'Status'],
        })

        for (const item of sites) {
          table.push(Object.values(item))
        }

        this.log(table.toString())
      }
    }
}
