// tools/design-audit/admin/vite.harness.config.js
// 관리자 화면을 "실제 코드 그대로, 데이터만 대역으로" 빌드하는 하네스 설정.
//
// 핵심은 alias 한 줄이다: @/lib/supabase → mock-supabase.
// 페이지·훅·스토어가 전부 이 모듈을 거치므로, 이 한 점만 갈아끼우면 로그인·실데이터 없이
// 화면 전체가 뜬다. 페이지 코드는 한 줄도 고치지 않으므로 "보이는 화면 = 실제 화면"이다.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const src = fileURLToPath(new URL('../../../src', import.meta.url))
const here = fileURLToPath(new URL('.', import.meta.url))

// ⚠️ alias 로 '@/lib/supabase' 만 갈아끼우면 절반만 걸린다.
//    src/lib/db.js 는 상대경로(`./supabase`)로 가져가므로 그 경로는 안 잡힌다
//    (실측: 카카오 실시간 위젯만 빈 화면으로 렌더됨). 그래서 "무엇으로 적었든
//    결국 src/lib/supabase 로 해석되는 import" 를 전부 잡도록 resolveId 로 처리한다.
//    또 `@/lib/supabase` 문자열만 비교해도 안 된다 — vite 의 alias 플러그인이 먼저 돌아
//    이미 절대경로로 바뀐 뒤에 이 훅이 보게 되기 때문이다(실측: 페이지는 실제 모듈을 잡아
//    "환경변수 미설정" 배너가 뜨고 좌측 메뉴 권한까지 날아갔다).
//    → 정석대로 **먼저 정상 해석한 뒤**, 그 결과가 src/lib/supabase 면 대역으로 바꾼다.
const mockSupabase = () => ({
  name: 'harness-mock-supabase',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    if (!importer) return null
    const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
    if (!resolved) return null
    const id = resolved.id.split('?')[0].replace(/\\/g, '/')
    return /\/src\/lib\/supabase(\.js)?$/.test(id) ? here + 'mock-supabase.js' : null
  },
})

export default defineConfig({
  root: here,
  base: './',
  plugins: [mockSupabase(), react()],
  resolve: {
    alias: [{ find: '@', replacement: src }],
  },
  build: {
    outDir: here + 'dist',
    emptyOutDir: true,
    minify: false,      // 검토용 — 클래스명·구조를 읽기 쉽게 남긴다
    sourcemap: false,
    rollupOptions: { input: here + 'harness.html' },
  },
})
