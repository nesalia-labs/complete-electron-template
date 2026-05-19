import { defineConfig } from 'drizzle-kit'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  schema: resolve(__dirname, './src/main/db/schema.ts'),
  out: resolve(__dirname, './drizzle'),
  dialect: 'sqlite',
  dbCredentials: {
    url: resolve(__dirname, './data/database.sqlite')
  }
})