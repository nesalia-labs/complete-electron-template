import { cpSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '../drizzle')
const dst = resolve(here, '../dist/drizzle')

cpSync(src, dst, { recursive: true })
console.log(`[copy-drizzle] ${src} -> ${dst}`)
