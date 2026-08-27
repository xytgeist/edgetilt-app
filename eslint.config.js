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

// These fire as errors from eslint-plugin-react-hooks v7's compiler-based rules,
// which landed via a caret upgrade rather than from anything we wrote. They flag
// optimization and purity smells, not crashes, and ~107 of them sit inside
// LoungePostStreamVideo.jsx ... device-smoked iOS HLS playback with its own
// do-not-regress doc (docs/lounge-stream-ios-playback.md). As errors they made
// `npm run lint` permanently red, which is how a real ReferenceError hid in the
// output for weeks. Warnings keep them visible and burnable down (tracked in
// docs/test-buildout-backlog.md) while a red run means something actually broke.
//
// rules-of-hooks stays an ERROR on purpose ... that one is a genuine crash.
const COMPILER_RULES_AS_WARNINGS = {
  'react-hooks/refs': 'warn',
  'react-hooks/set-state-in-effect': 'warn',
  'react-hooks/preserve-manual-memoization': 'warn',
  'react-hooks/immutability': 'warn',
  'react-hooks/purity': 'warn',
  // Dev-only Fast Refresh hygiene. Fixing means splitting ~40 files just to move
  // helpers out ... no runtime or production effect either way.
  'react-refresh/only-export-components': 'warn',
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
      ...COMPILER_RULES_AS_WARNINGS,
    },
  },
])
