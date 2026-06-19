import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    maxWorkers: 1,
    isolate: false,
    include: ['tests/**/*.test.ts']
  }
})