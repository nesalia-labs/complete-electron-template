import { defineConfig } from 'electron-vite'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import tailwindcss from '@tailwindcss/vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        },
        external: ['electron', 'better-sqlite3', '@electron-template/api', '@electron-template/db', '@electron-template/sdk']
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        },
        external: ['electron']
      }
    }
  },
  renderer: {
    root: resolve(__dirname, '../web'),
    plugins: [
      tanstackRouter({ target: 'react', autoCodeSplitting: true }),
      viteTsConfigPaths({
        projects: [
          resolve(__dirname, '../web/tsconfig.json'),
        ],
      }),
      tailwindcss(),
    ],
    resolve: {
      alias: [
        { find: '@', replacement: resolve(__dirname, '../web/src') },
        { find: '@/lib/utils', replacement: resolve(__dirname, '../../packages/ui/src/lib/utils') },
        { find: '@/components', replacement: resolve(__dirname, '../../packages/ui/src/components') },
        { find: '@/lib', replacement: resolve(__dirname, '../../packages/ui/src/lib') },
        { find: '@/hooks', replacement: resolve(__dirname, '../../packages/ui/src/hooks') },
        { find: '@electron-template/ui', replacement: resolve(__dirname, '../../packages/ui/src') },
        // Renderer-safe sub-path: aliased to source so Rolldown (Vite 8) bundles
        // it instead of relying on the package's `exports` field. The package
        // still ships the `exports` for Node-side consumers (main process).
        { find: '@electron-template/api/settings', replacement: resolve(__dirname, '../../packages/api/src/settings/index.ts') }
      ]
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