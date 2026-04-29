import antfu from '@antfu/eslint-config';

export default antfu(
  {
    react: true,
    typescript: true,
    stylistic: {
      semi: true,
      quotes: 'single',
      jsx: true,
      indent: 2,
    },
    ignores: [
      'dist/**',
      'node_modules/**',
      'public/**',
      '*.config.ts',
      'pnpm-lock.yaml',
    ],
  },
  {
    rules: {
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'react/exhaustive-deps': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'unused-imports/no-unused-imports': 'error',
      'style/brace-style': ['error', '1tbs', { allowSingleLine: true }],
      'style/comma-dangle': ['error', 'always-multiline'],
      'style/arrow-parens': ['error', 'always'],
      'style/block-spacing': ['error', 'always'],
      'style/quote-props': ['error', 'consistent-as-needed'],
      'style/max-statements-per-line': ['warn', { max: 2 }],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'ts/no-explicit-any': 'off',
      'ts/consistent-type-imports': ['error', {
        prefer: 'type-imports',
        fixStyle: 'separate-type-imports',
      }],
      'ts/no-use-before-define': 'off',
    },
  },
);
