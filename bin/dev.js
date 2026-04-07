#!/usr/bin/env node

if (process.argv.length === 2) {
  process.argv.push('sites')
}

(async () => {
  const {register} = require('ts-node')
  register({project: './tsconfig.json'})
  const oclif = await import('@oclif/core')
  await oclif.execute({development: true, dir: __dirname})
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
