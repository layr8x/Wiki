import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // .agents/skills = 외부에서 받은 에이전트 스킬. 데모에 번들 라이브러리(three.module.min.js 등)가
  // 들어 있어 우리 규칙으로 검사할 대상이 아니다.
  globalIgnores(['dist', '.agents']),
  {
    files: ['**/*.{js,jsx}'],
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
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  // shadcn/ui 컴포넌트: export const 패턴 허용
  {
    files: ['src/components/ui/**/*.{js,jsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  // Vercel Serverless Functions — Node 런타임 globals (process, Buffer 등)
  {
    files: ['api/**/*.{js,mjs}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  // Node.js 스크립트 (시드 생성기, sync 스크립트 등) — Node 런타임 globals
  {
    files: [
      'supabase/**/*.{js,mjs}',
      'scripts/**/*.{js,mjs}',
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
])
