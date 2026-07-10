import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// dev 프록시 인증 — 서버 사이드 전용 env 만 사용 (VITE_ 접두사 금지).
// vite.config.js 는 Node 에서만 실행되므로 클라이언트 번들에 유출되지 않는다.
const getAuthHeaders = () => {
  // eslint-disable-next-line no-undef
  const email = process.env.CONFLUENCE_EMAIL
  // eslint-disable-next-line no-undef
  const token = process.env.CONFLUENCE_TOKEN

  if (!email || !token) {
    return {}
  }

  // eslint-disable-next-line no-undef
  const auth = Buffer.from(`${email}:${token}`).toString('base64')
  return { Authorization: `Basic ${auth}` }
}

// dev 서버에서 Vercel serverless 핸들러를 직접 실행하는 미들웨어.
// prod는 Vercel이 api/*.js 를 자동 라우팅하므로 별도 설정 불필요.
const vercelApiDev = () => ({
  name: 'ams-vercel-api-dev',
  configureServer(server) {
    const mount = async (url, importPath) => {
      server.middlewares.use(url, async (req, res) => {
        try {
          const mod = await server.ssrLoadModule(importPath)
          const handler = mod.default
          // body 수집 (JSON 전용)
          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          // eslint-disable-next-line no-undef
          const raw = Buffer.concat(chunks).toString('utf8')
          if (raw) {
            try { req.body = JSON.parse(raw) } catch { req.body = raw }
          }
          // Vercel res 호환 shim
          res.status = (code) => { res.statusCode = code; return res }
          res.send = (payload) => { res.end(typeof payload === 'string' ? payload : JSON.stringify(payload)) }
          await handler(req, res)
        } catch (err) {
          res.statusCode = 500
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'dev_handler_error', message: String(err?.message || err) }))
        }
      })
    }
    mount('/api/search-summary', '/api/search-summary.js')
  },
})

export default defineConfig({
  plugins: [react(), tailwindcss(), vercelApiDev()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    minify: 'esbuild',
    sourcemap: false,
  },
  server: {
    proxy: {
      // Vercel serverless function과 동일 경로 구조로 통일 (prod에서도 동작)
      '/api/confluence-img': {
        target: 'https://hiconsy.atlassian.net',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/confluence-img/, ''),
        headers: getAuthHeaders(),
      },
      // 구 경로 호환 (2026-04-18 이전 빌드가 혹시 참조하는 경우 대비)
      '/confluence-img': {
        target: 'https://hiconsy.atlassian.net',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/confluence-img/, ''),
        headers: getAuthHeaders(),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: [
      'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'scripts/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
    ],
    exclude: ['node_modules', 'dist', 'e2e', 'playwright.config.js'],
  },
})
