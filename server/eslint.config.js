import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.node },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^(req|res|next|_)', caughtErrors: 'none', ignoreRestSiblings: true }]
    }
  }
];
