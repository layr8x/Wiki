// api/search-summary.js — Claude Haiku 4.5 기반 검색 결과 AI 요약
//
// 입력: { query: string, guides: Array<{ id, title, tldr, module, type }> }
// 출력: { summary: string, sources: string[], cached?: { read: number, write: number } }
//
// 설계 노트:
// - Anthropic SDK 없이 fetch 로 직접 호출 (서버리스 번들 경량화).
// - System 프롬프트에 cache_control: ephemeral 을 달아 프롬프트 캐싱 활성화.
//   → 반복 호출 시 system 블록이 서버 측에서 재사용되어 비용/지연 절감.
// - 모델은 요약 품질 대비 비용이 가장 좋은 claude-haiku-4-5.
// - 모델 응답은 반드시 JSON 객체만 — 파싱 실패 시 500 대신 보수적 폴백을 돌려준다.
//
// ※ AI 의미 검색(mode:'ai-search')도 이 엔드포인트에 통합돼 있다. Vercel Hobby 플랜의
//   서버리스 함수 12개 한도 때문에 별도 함수(api/ai-search.js)를 두지 못해, 전체 카탈로그
//   (api/_lib/guide-index.js)를 캐시된 system 프롬프트에 넣어 '의미'로 답하는 모드를 합쳤다.

import { GUIDE_INDEX } from './_lib/guide-index.js'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-haiku-4-5'

// ── AI 의미 검색용 카탈로그(모듈 로드 1회, 웜 인스턴스 재사용) ──
const AI_INDEX = Array.isArray(GUIDE_INDEX) ? GUIDE_INDEX : []
const AI_INDEX_BY_ID = new Map(AI_INDEX.map((g) => [g.id, g]))
const AI_CATALOG_TEXT = AI_INDEX.map((g) => `${g.id} [${g.type}/${g.module}] ${g.title} — ${g.tldr}`).join('\n')
const AI_SYSTEM_PROMPT = `당신은 "AMS Wiki" — 학원 운영 시스템 가이드 위키 — 의 AI 검색 어시스턴트입니다.
이 위키는 학원 운영자·강사·데스크 담당자가 보는 내부 SOP·매뉴얼·트러블슈팅·정책·Q&A의 모음입니다.

아래 <카탈로그>는 위키 전체 문서 목록입니다. 각 줄: id [type/module] title — tldr

사용자 질문이 들어오면:
1. 카탈로그에서 질문과 의미상 가장 관련 있는 문서를 찾습니다. (키워드 일치가 아니라 의도·의미 기준 — 사용자가 제목과 다른 말로 물어도, 오타가 있어도 같은 주제면 찾습니다.)
2. 찾은 문서들의 tldr을 근거로 질문에 한국어 존댓말로 직접·구체적으로 답합니다(2~5문장).
3. 근거가 될 문서가 없으면 솔직히 "관련 문서를 찾지 못했어요. 다른 표현으로 검색하거나 상담을 통해 확인해 주세요." 라고 답하고 sources 를 빈 배열로 둡니다.

원칙:
- 카탈로그(특히 tldr)에 없는 사실·절차·수치는 절대 꾸며내지 마세요. 추측 금지.
- 답변 본문에 문서 id 를 노출하지 마세요 (id 는 sources 로만 반환).
- sources 에는 답변에 실제로 근거가 된 문서 id 만, 관련도 높은 순으로 최대 4개.

출력 형식 (반드시 이 JSON 객체만, 백틱·설명·다른 텍스트 금지):
{"answer": "질문에 대한 한국어 답변", "sources": ["문서-id-1", "문서-id-2"]}

<카탈로그>
${AI_CATALOG_TEXT}
</카탈로그>`

// 바디 크기 한도 (8KB) — 악성 대용량 payload 로 비용·DoS 방지
const MAX_BODY_BYTES = 8 * 1024

// 간이 rate-limit — IP 당 분당 20회 (메모리 기반, 단일 인스턴스 한정)
// Vercel Serverless 는 인스턴스 재사용 시에만 유지되므로 완전한 보호는 아님.
// 운영 수준 보호는 Vercel Firewall / Upstash Redis 로 별도 도입 권장.
const RATE_LIMIT_WINDOW_MS = 60 * 1000
const RATE_LIMIT_MAX = 20
const rateBuckets = new Map()

function getClientIp(req) {
  const xf = req.headers['x-forwarded-for']
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0].trim()
  return req.socket?.remoteAddress || 'unknown'
}

// ── 로그인 확인 ──────────────────────────────────────────────────────────────
// 이 엔드포인트는 호출 한 번마다 Anthropic 요금이 나간다. 그런데 예전에는 인증 검사가
// 하나도 없어서, 주소만 알면 누구나 호출할 수 있었다. IP당 분당 20회 제한이 유일한
// 방어였는데 그건 IP를 바꾸면 그만이고, 코드 주석도 스스로 "완전한 보호는 아님"이라 적어 뒀다.
// 사내용 위키이고 Supabase 로그인이 이미 붙어 있으니, 로그인한 사람만 쓰게 한다.
//
// 검증은 Supabase에 토큰을 그대로 물어보는 방식(GET /auth/v1/user)이다. JWT 서명을 직접
// 푸는 방법도 있지만 라이브러리와 시크릿이 더 필요하고, 여기는 같은 리전(ap-northeast-2)이라
// 왕복이 짧다. 같은 토큰을 반복해서 묻지 않도록 60초만 결과를 기억한다.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || ''
const AUTH_ENFORCED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
const AUTH_CACHE_TTL_MS = 60 * 1000
const authCache = new Map()

function bearerFrom(req) {
  const h = req.headers['authorization'] || req.headers['Authorization']
  if (typeof h !== 'string') return ''
  const m = /^Bearer\s+(.+)$/i.exec(h.trim())
  return m ? m[1].trim() : ''
}

/** 로그인한 사용자면 true. Supabase 환경변수가 없으면(로컬 목데이터 모드) 검사를 건너뛴다. */
async function isAuthenticated(req) {
  // 환경변수가 없다는 건 이 배포가 애초에 Supabase를 안 쓴다는 뜻이다(로컬 개발·목데이터).
  // 이때까지 막으면 설정 하나 빠졌을 때 위키 전체가 조용히 멈춘다. 운영에는 값이 있으므로
  // 그쪽에서는 아래 검사가 그대로 걸린다.
  if (!AUTH_ENFORCED) return true

  const token = bearerFrom(req)
  if (!token) return false

  const hit = authCache.get(token)
  if (hit && Date.now() - hit.at < AUTH_CACHE_TTL_MS) return hit.ok

  let ok = false
  try {
    const resp = await fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${token}` },
    })
    ok = resp.ok
  } catch {
    // Supabase에 못 닿았을 때 통과시키면 인증이 무력화된다. 막는 쪽이 맞다.
    ok = false
  }

  // 토큰 문자열을 그대로 키로 쓰므로 무한정 쌓이지 않게 상한을 둔다.
  if (authCache.size > 500) authCache.clear()
  authCache.set(token, { ok, at: Date.now() })
  return ok
}

function readJsonWithLimit(req, limit) {
  return new Promise((resolve, reject) => {
    let received = 0
    const chunks = []
    req.on('data', (chunk) => {
      received += chunk.length
      if (received > limit) {
        const err = new Error('payload_too_large')
        err.code = 'payload_too_large'
        req.destroy()
        reject(err)
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        resolve({})
      }
    })
    req.on('error', reject)
  })
}

function checkRateLimit(ip) {
  const now = Date.now()
  const bucket = rateBuckets.get(ip)
  if (!bucket || now - bucket.start > RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(ip, { start: now, count: 1 })
    return { ok: true, remaining: RATE_LIMIT_MAX - 1 }
  }
  bucket.count++
  if (bucket.count > RATE_LIMIT_MAX) {
    return { ok: false, retryAfter: Math.ceil((bucket.start + RATE_LIMIT_WINDOW_MS - now) / 1000) }
  }
  return { ok: true, remaining: RATE_LIMIT_MAX - bucket.count }
}

// 프롬프트 캐싱이 유의미하려면 최소 ~1024 토큰의 안정된 프리픽스가 필요하다.
// 아래 지시문은 바이트 단위로 고정이며, 호출 간 절대 변하지 않아야 한다.
const SYSTEM_PROMPT = `당신은 "AMS Wiki" — 학원 운영 시스템 가이드 통합 위키 — 의 검색 어시스턴트입니다.

역할:
- 사용자가 입력한 검색어와 관련해, 전달받은 가이드 목록(GUIDES)을 근거로 2~3문장의 한국어 요약을 제공합니다.
- 이 위키는 학원 운영자/강사/데스크 담당자가 참고하는 내부 SOP, 판단분기, 참조형 문서, 트러블슈팅, 대응매뉴얼, 정책공지의 집합입니다.
- 답변은 반드시 전달받은 가이드에서 근거를 찾을 수 있어야 하며, 근거가 불충분하면 "관련 가이드가 부족합니다" 라고 솔직하게 답하세요.

작성 원칙:
1. 요약은 한국어 존댓말, 2~3문장, 각 문장 80자 이내.
2. 특정 가이드의 절차/주의사항을 언급할 때는 자연스러운 문장으로 풀어쓰고, 가이드 id 는 본문에 노출하지 마세요 (id 는 sources 배열로만 반환).
3. 가이드에 없는 사실은 절대 꾸며내지 마세요. 추측 금지.
4. 검색어가 모호하거나 의도 파악이 어려우면, 가장 가까운 주제 1~2개를 제시하고 재질문을 유도하세요.
5. 트러블슈팅/정책공지 가이드가 포함되어 있으면 우선적으로 반영하세요.

출력 형식 (반드시 이 JSON 구조만, 다른 텍스트 금지):
{
  "summary": "사용자 질문에 대한 2~3문장 요약",
  "sources": ["guide-id-1", "guide-id-2"]
}

- sources 에는 요약에 실제로 반영된 가이드 id 만 최대 3개까지 포함하세요.
- JSON 이외의 어떤 문자도 출력하지 마세요 (백틱, 코드펜스, 설명 문구 모두 금지).`

function json(res, status, body) {
  res.status(status).setHeader('content-type', 'application/json; charset=utf-8')
  res.send(JSON.stringify(body))
}

function sanitizeGuides(guides) {
  if (!Array.isArray(guides)) return []
  return guides
    .filter(g => g && typeof g.id === 'string' && typeof g.title === 'string')
    .slice(0, 8)
    .map(g => ({
      id: String(g.id).slice(0, 80),
      title: String(g.title).slice(0, 200),
      tldr: typeof g.tldr === 'string' ? g.tldr.slice(0, 400) : '',
      module: typeof g.module === 'string' ? g.module.slice(0, 80) : '',
      type: typeof g.type === 'string' ? g.type.slice(0, 20) : '',
    }))
}

function buildUserMessage(query, guides) {
  const lines = guides.map((g, i) =>
    `[${i + 1}] id=${g.id} | type=${g.type} | module=${g.module}\n  title: ${g.title}\n  tldr: ${g.tldr || '(없음)'}`,
  )
  return `검색어: "${query}"

후보 가이드:
${lines.join('\n\n')}

위 후보 중 관련 있는 내용을 종합해 지정된 JSON 형식으로만 답변하세요.`
}

function parseModelJson(text) {
  if (!text || typeof text !== 'string') return null
  // 모델이 가끔 코드펜스를 섞는 경우 대비
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    const obj = JSON.parse(cleaned)
    if (!obj || typeof obj !== 'object') return null
    const summary = typeof obj.summary === 'string' ? obj.summary.trim() : ''
    const sources = Array.isArray(obj.sources)
      ? obj.sources.filter(s => typeof s === 'string').slice(0, 3)
      : []
    if (!summary) return null
    return { summary, sources }
  } catch {
    return null
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'method_not_allowed' })
  }

  // 1) content-length 빠른 거절 (정상 클라이언트는 항상 동반)
  const declaredLen = Number(req.headers['content-length'] || 0)
  if (declaredLen > MAX_BODY_BYTES) {
    return json(res, 413, { error: 'payload_too_large', limit: MAX_BODY_BYTES })
  }

  // 2) IP 단위 간이 rate-limit
  const ip = getClientIp(req)
  const rl = checkRateLimit(ip)
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfter))
    return json(res, 429, { error: 'rate_limited', retryAfter: rl.retryAfter })
  }

  // 2-1) 로그인 확인 — 호출마다 Anthropic 요금이 나가므로 사내 로그인 사용자만 허용한다.
  if (!(await isAuthenticated(req))) {
    return json(res, 401, { error: 'unauthorized', message: '로그인이 필요합니다.' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return json(res, 503, { error: 'api_key_missing', message: 'ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.' })
  }

  // 3) Vercel 이 req.body 를 이미 파싱해줬을 수도 있고, 스트림만 줬을 수도 있다.
  //    어느 쪽이든 실제 바이트 길이를 측정하며 한도를 초과하면 즉시 종료한다.
  let body = req.body
  if (body == null) {
    try {
      body = await readJsonWithLimit(req, MAX_BODY_BYTES)
    } catch (err) {
      if (err && err.code === 'payload_too_large') {
        return json(res, 413, { error: 'payload_too_large', limit: MAX_BODY_BYTES })
      }
      return json(res, 400, { error: 'invalid_body' })
    }
  } else if (typeof body === 'string') {
    if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
      return json(res, 413, { error: 'payload_too_large', limit: MAX_BODY_BYTES })
    }
    try { body = JSON.parse(body) } catch { body = {} }
  }
  const query = typeof body?.query === 'string' ? body.query.trim().slice(0, 200) : ''

  if (!query || query.length < 2) {
    return json(res, 400, { error: 'query_too_short' })
  }

  // AI 의미 검색 모드 — guides 없이 전체 카탈로그(AI_CATALOG)로 직접 답변
  if (body?.mode === 'ai-search') {
    return handleAiSearch(query, apiKey, res)
  }

  const guides = sanitizeGuides(body?.guides)
  if (guides.length === 0) {
    return json(res, 400, { error: 'no_guides' })
  }

  try {
    const apiRes = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        system: [
          {
            type: 'text',
            text: SYSTEM_PROMPT,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [
          { role: 'user', content: buildUserMessage(query, guides) },
        ],
      }),
    })

    if (!apiRes.ok) {
      const errText = await apiRes.text().catch(() => '')
      const status = apiRes.status === 429 ? 429 : 502
      return json(res, status, { error: 'upstream_error', status: apiRes.status, detail: errText.slice(0, 500) })
    }

    const data = await apiRes.json()
    const text = data?.content?.[0]?.text ?? ''
    const parsed = parseModelJson(text)

    if (!parsed) {
      return json(res, 200, {
        summary: '',
        sources: [],
        error: 'parse_failed',
      })
    }

    // 캐시 히트/미스 가시성 (관찰용)
    const cached = {
      read: data?.usage?.cache_read_input_tokens ?? 0,
      write: data?.usage?.cache_creation_input_tokens ?? 0,
    }

    // 응답 캐시는 5분만 (검색 요약은 신선도보다 응답속도가 중요).
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300')
    return json(res, 200, { summary: parsed.summary, sources: parsed.sources, cached })
  } catch (err) {
    return json(res, 500, { error: 'internal_error', message: String(err?.message || err).slice(0, 300) })
  }
}

// ── AI 의미 검색(mode:'ai-search') — 전체 카탈로그 기반 직접 답변 ──
// 별도 서버리스 함수(12개 한도) 없이 이 엔드포인트에 통합. rate-limit/apiKey 는 handler 에서 통과 후 진입.
async function handleAiSearch(query, apiKey, res) {
  if (AI_INDEX.length === 0) return json(res, 503, { error: 'index_unavailable' })
  try {
    const apiRes = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        system: [{ type: 'text', text: AI_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: `질문: "${query}"\n\n위 카탈로그를 근거로 지정된 JSON 형식으로만 답변하세요.` }],
      }),
    })
    if (!apiRes.ok) {
      const errText = await apiRes.text().catch(() => '')
      return json(res, apiRes.status === 429 ? 429 : 502, { error: 'upstream_error', status: apiRes.status, detail: errText.slice(0, 300) })
    }
    const data = await apiRes.json()
    const text = data?.content?.[0]?.text ?? ''
    let parsed = null
    try {
      const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
      const obj = JSON.parse(cleaned)
      const answer = typeof obj?.answer === 'string' ? obj.answer.trim() : ''
      const ids = Array.isArray(obj?.sources) ? obj.sources.filter((s) => typeof s === 'string').slice(0, 4) : []
      if (answer) parsed = { answer, ids }
    } catch { /* parse 실패 → 폴백 */ }
    if (!parsed) return json(res, 200, { answer: '', sources: [], error: 'parse_failed' })
    const sources = parsed.ids
      .map((id) => AI_INDEX_BY_ID.get(id))
      .filter(Boolean)
      .map((g) => ({ id: g.id, title: g.title, route: g.route, type: g.type }))
    const cached = { read: data?.usage?.cache_read_input_tokens ?? 0, write: data?.usage?.cache_creation_input_tokens ?? 0 }
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300')
    return json(res, 200, { answer: parsed.answer, sources, cached })
  } catch (err) {
    return json(res, 500, { error: 'internal_error', message: String(err?.message || err).slice(0, 200) })
  }
}
