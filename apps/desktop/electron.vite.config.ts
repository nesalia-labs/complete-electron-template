import { defineConfig } from 'electron-vite'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        },
        external: ['better-sqlite3']
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, '../web'),
    plugins: [
      viteTsConfigPaths({ projects: [resolve(__dirname, '../web/tsconfig.json')] }),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, '../web/src')
      }
    },
    build: {
      outDir: resolve(__dirname, '../web/dist'),
      rollupOptions: {
        input: {
          index: resolve(__dirname, '../web/index.html')
        }
      }
    },
    server: {
      port: 5173,
      host: '127.0.0.1'
    }
  }
})