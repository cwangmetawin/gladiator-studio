import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

// v2 needs its own flat config: without one, ESLint walks up to the repo-root v1
// config, whose plugins live in a node_modules that v2 does not install, and
// `npm run lint` crashes before checking anything. supabase/ is Deno code.
export default tseslint.config(
  { ignores: ['dist', 'supabase'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // House convention: a leading underscore marks a deliberately unused binding
      // (e.g. `{ variant: _v, ...rest }` to strip props before spreading).
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_',
      }],
    },
  },
);
