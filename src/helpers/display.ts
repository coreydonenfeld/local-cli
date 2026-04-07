import type {Site} from './local-api'

const STATUS_COLORS: Record<string, string> = {
  running: '\x1b[32m',
  stopped: '\x1b[31m',
  halted: '\x1b[31m',
  stopping: '\x1b[33m',
  starting: '\x1b[33m',
  restarting: '\x1b[33m',
}
const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
export const SEP = `${DIM}${'─'.repeat(40)}${RESET}`

export function formatStatus(status: string): string {
  const color = STATUS_COLORS[status.toLowerCase()] || ''
  return `${color}${status}${RESET}`
}

export function getSiteUrl(site: Site): string {
  return `http://${site.name.toLowerCase().replace(/\s+/g, '-')}.local`
}

function siteNotice(site: Site): string {
  const s = site.status.toLowerCase()
  if (s === 'running') return `● ${site.name} is running`
  if (['stopping', 'starting', 'restarting'].includes(s)) return `▲ ${site.name} is stuck (${s})`
  return `○ ${site.name} is ${s}`
}

export function printPanel(site: Site, notice?: string): void {
  console.log(notice || siteNotice(site))
  console.log(SEP)
  console.log(`Name:   ${site.name}`)
  console.log(`ID:     ${site.id}`)
  console.log(`Status: ${formatStatus(site.status)}`)
  console.log(`URL:    ${getSiteUrl(site)}`)
  console.log(SEP)
}
