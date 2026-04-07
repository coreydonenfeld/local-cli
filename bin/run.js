#!/usr/bin/env node

if (process.argv.length === 2) {
  process.argv.push('sites')
}

(async () => {
  const oclif = await import('@oclif/core')
  await oclif.execute({dir: __dirname})
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
