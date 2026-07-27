// Configuración de ESLint 9 (formato "flat"). Sin este archivo, `npm run lint`
// falla al arrancar y no revisa nada: la versión instalada ya no lee
// `.eslintrc`.
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const prettierPlugin = require('eslint-plugin-prettier');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'prisma/migrations/**'],
  },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts', 'prisma/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        fetch: 'readonly',
        AbortController: 'readonly',
        Response: 'readonly',
        URLSearchParams: 'readonly',
        TextDecoder: 'readonly',
        TextEncoder: 'readonly',
      },
    },
    plugins: { '@typescript-eslint': tsPlugin, prettier: prettierPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...prettierConfig.rules,
      // El formateo lo decide Prettier aparte (`npm run format`); marcarlo aquí
      // llenaría el informe de ruido y taparía los avisos que sí importan.
      'prettier/prettier': 'off',
      // Los `_` iniciales son la convención del repo para lo que se ignora a
      // propósito (parámetros de firmas que impone Nest, por ejemplo).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // El proyecto usa `any` solo en los límites con librerías sin tipos; se
      // avisa para que no se extienda, pero no rompe el build.
      '@typescript-eslint/no-explicit-any': 'warn',
      // El servidor registra con el Logger de Nest, no con console: un
      // console.log suelto se pierde fuera del formato del resto de trazas.
      'no-console': 'error',
    },
  },
  {
    // Los scripts de mantenimiento sí imprimen: su salida ES la interfaz.
    files: ['prisma/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['tests/**/*.ts'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly',
      },
    },
  },
];
