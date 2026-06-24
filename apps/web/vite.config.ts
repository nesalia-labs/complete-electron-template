import { defineConfig } from "vite"
import { devtools } from "@tanstack/devtools-vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import { resolve } from "path"

const config = defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    devtools(),
    tailwindcss(),
    viteReact(),
  ],
  resolve: {
    alias: [
      { find: '@', replacement: resolve(__dirname, "src") },
      { find: '@/lib/utils', replacement: resolve(__dirname, "../../packages/ui/src/lib/utils") },
      { find: '@/components', replacement: resolve(__dirname, "../../packages/ui/src/components") },
      { find: '@/lib', replacement: resolve(__dirname, "../../packages/ui/src/lib") },
      { find: '@/hooks', replacement: resolve(__dirname, "../../packages/ui/src/hooks") },
      { find: '@electron-template/ui', replacement: resolve(__dirname, "../../packages/ui/src") },
      // Renderer-safe sub-path: aliased to source so Rolldown (Vite 8) bundles
      // it instead of relying on the package's `exports` field. The package
      // still ships the `exports` for Node-side consumers (main process).
      { find: '@electron-template/api/settings', replacement: resolve(__dirname, "../../packages/api/src/settings/index.ts") }
    ],
    dedupe: ["react", "react-dom"],
  },
})

export default config