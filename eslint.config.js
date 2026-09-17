import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'server/test/fixtures/generated/**',
      'storage/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
  {
    files: ['client/**/*.{ts,svelte}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },
];
