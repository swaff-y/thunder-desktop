import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

export default defineConfig(
  // `.claude/skills` is agent tooling, not app source — plain `.mjs` scripts
  // that the TypeScript rules (return types especially) cannot be satisfied in.
  { ignores: ['**/node_modules', '**/dist', '**/out', '.claude/skills'] },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules
    }
  },
  {
    // Files ported verbatim from web-thunder. The porting tickets forbid
    // edits so signatures stay byte-identical for diffing — this override
    // lets inferred return types in halo.ts/utils pass lint.
    files: ['src/renderer/src/{api,utils,types,hooks,pages,components}/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      'react-hooks/set-state-in-effect': 'off'
    }
  },
  {
    // TD-052: standalone Node/Electron maintenance scripts, written as
    // plain ESM JavaScript so they need no build step. A TypeScript
    // return-type rule can't be satisfied in a file with no type syntax.
    files: ['scripts/**/*.mjs'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off'
    }
  },
  eslintConfigPrettier
)
