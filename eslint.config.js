import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

// A leading underscore is how this codebase already marks "required by the
// signature, deliberately unused" ... positional callback args, placeholder
// params on stubbed API helpers. The rule only honoured that for variables, so
// every such arg was reported. Teach it the convention instead of renaming code
// to satisfy the linter.
const UNUSED_VARS_OPTIONS = {
  varsIgnorePattern: '^[A-Z_]',
  argsIgnorePattern: '^_',
  caughtErrorsIgnorePattern: '^_',
  destructuredArrayIgnorePattern: '^_',
}

export default defineConfig([
  globalIgnores([
    'dist',
    // Throwaway investigation scratch (vendor bundles pulled down to read, one-off
    // probes). Untracked and not shipped ... linting it buried real findings under
    // hundreds of minified-code complaints.
    'scripts/.tmp-*',
    'scripts/tmp-*',
    'ap-guide-workspace',
    'supabase/.temp',
  ]),
  {
    // Node-side JS: vite config, root tooling, and any .js under scripts/.
    files: ['*.config.js', 'scripts/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
      sourceType: 'module',
    },
  },
  {
    files: ['api/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': ['error', UNUSED_VARS_OPTIONS],
    },
  },
  {
    files: ['**/*.{js,jsx}'],
    ignores: ['api/**', '*.config.js', 'scripts/**/*.js'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', UNUSED_VARS_OPTIONS],
    },
  },
])
