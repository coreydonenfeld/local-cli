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

/**
 * Local's domain is set at creation and edited independently of the site name,
 * so it cannot be derived from the name -- "GRID Alternatives" is
 * gridalternatives.local, not grid-alternatives.local. Slugifying is a last
 * resort for callers holding a Site that predates these fields.
 */
export function getSiteUrl(site: Site): string {
  if (site.url) return site.url
  if (site.domain) return `http://${site.domain}`
  return `http://${site.name.toLowerCase().replace(/\s+/g, '-')}.local`
}

export function statusDot(status: string): string {
  const s = status.toLowerCase()
  if (s === 'running') return '●'
  if (['stopping', 'starting', 'restarting'].includes(s)) return '▲'
  if (s === 'unknown') return '◌'
  return '○'
}

function siteNotice(site: Site): string {
  const s = site.status.toLowerCase()
  const dot = statusDot(s)
  if (s === 'running') return `${dot} ${site.name} is running`
  if (['stopping', 'starting', 'restarting'].includes(s)) return `${dot} ${site.name} is stuck (${s})`
  if (s === 'unknown') return `${dot} ${site.name} (status unknown - Local may not be running)`
  return `${dot} ${site.name} is ${s}`
}

export interface WpeInfo {
  installName: string
  remoteDomain: string
  environment: string
}

export function printPanel(site: Site, notice?: string, wpe?: WpeInfo): void {
  console.log(notice || siteNotice(site))
  console.log(SEP)
  console.log(`Name:   ${site.name}`)
  console.log(`ID:     ${site.id}`)
  if (wpe) {
    console.log(`WPE:    ${wpe.installName} (${wpe.environment})`)
    console.log(`Remote: ${wpe.remoteDomain}`)
  } else {
    console.log(`Status: ${formatStatus(site.status)}`)
  }
  console.log(`URL:    ${getSiteUrl(site)}`)
  console.log(SEP)
}
