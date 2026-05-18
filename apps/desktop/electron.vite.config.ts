import { defineConfig } from 'electron-vite'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import viteTsConfigPaths from 'vite-tsconfig-paths'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
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
    }
  }
})