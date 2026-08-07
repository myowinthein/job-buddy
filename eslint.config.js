import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactRefreshPlugin from 'eslint-plugin-react-refresh';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

/** @type {import('eslint').Linter.Config[]} */
export default [
  { ignores: ['.wxt/**', '.output/**', 'node_modules/**'] },

  js.configs.recommended,

  // docs/ and demo-apply-form/ are static marketing/demo assets with no
  // TypeScript config of their own — most of each directory (HTML, CSS,
  // images) isn't matched by any `files` pattern below and so is never
  // linted, but their plain .js files get basic recommended-JS checks
  // (no-undef, syntax errors, etc.) instead of zero static analysis.
  {
    files: ['docs/**/*.js', 'demo-apply-form/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: { ...globals.browser },
    },
  },

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        chrome: 'readonly',
        // WXT magic globals injected at build time
        defineBackground: 'readonly',
        defineContentScript: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'react-refresh': reactRefreshPlugin,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,

      // TypeScript handles undefined identifiers and prop types natively.
      'no-undef': 'off',
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',

      // Stylistic — too noisy for application code.
      'react/no-unescaped-entities': 'off',

      // Allow intentionally unused identifiers when prefixed with `_`.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],

      // New in eslint-plugin-react-hooks v7 — surface as warnings; not all
      // existing patterns can be cleanly rewritten without app-code changes.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',

      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  prettierConfig,
];
