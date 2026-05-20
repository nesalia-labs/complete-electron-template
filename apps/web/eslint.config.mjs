//  @ts-check

import { tanstackConfig } from "@tanstack/eslint-config"

/**
 * @type {import('eslint').Linter.FlatConfig[]}
 */
const config = [
  {
    files: ['eslint.config.js'],
    languageOptions: {
      parser: null,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      'no-undef': 'off',
    },
  },
  ...tanstackConfig,
  {
    ignores: ['vite.config.ts', 'dist/**'],
  },
]

export default config
