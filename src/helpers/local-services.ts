import {readdirSync} from 'node:fs'
import {homedir} from 'node:os'
import {join} from 'node:path'

const SERVICES_DIR = join(homedir(), 'Library/Application Support/Local/lightning-services')

interface ServiceVersion {
  name: string
  value: string
}

function listVersions(prefix: string): ServiceVersion[] {
  try {
    return readdirSync(SERVICES_DIR)
      .filter(d => d.startsWith(prefix))
      .map(d => {
        const version = d.replace(prefix, '').replace(/\+\d+$/, '')
        return {name: version, value: d.replace(/\+\d+$/, '')}
      })
      .sort((a, b) => b.name.localeCompare(a.name, undefined, {numeric: true}))
  } catch {
    return []
  }
}

export function phpVersions(): ServiceVersion[] {
  return listVersions('php-').map(v => ({...v, value: v.value.replace('php-', '')}))
}

export function mysqlVersions(): ServiceVersion[] {
  const mysql = listVersions('mysql-')
  const maria = listVersions('mariadb-')
  return [
    ...mysql.map(v => ({name: `MySQL ${v.name.replace('mysql-', '')}`, value: v.value})),
    ...maria.map(v => ({name: `MariaDB ${v.name.replace('mariadb-', '')}`, value: v.value})),
  ]
}

export function webServers(): ServiceVersion[] {
  const nginx = listVersions('nginx-')
  if (nginx.length > 0) return [{name: 'nginx', value: 'nginx'}, {name: 'Apache', value: 'apache'}]
  return [{name: 'nginx', value: 'nginx'}]
}
