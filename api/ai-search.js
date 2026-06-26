// api/ai-search.js — Claude 기반 위키 "의미 검색 + 직접 답변"
//
// 기존 /api/search-summary 는 클라이언트가 키워드로 먼저 거른 후보만 요약한다.
// → 키워드가 안 맞으면 아무것도 못 찾는다. 이 엔드포인트는 전체 카탈로그(api/_lib/
//   guide-index.json, 181개: 위키 가이드 + AMS 매뉴얼 + 공식 Q&A + 매니저 FAQ)를
//   캐시된 system 프롬프트에 넣어, 질문의 "의미"로 관련 문서를 찾아 직접 답한다.
//
// 입력: { query: string }
// 출력: { answer: string, sources: [{ id, title, route, type }], cached?: {...} }
//
// 보안/비용: query 만 받으므로 바디 한도 2KB, IP 분당 15회, 프롬프트 캐싱(카탈로그 재사용),
//   모델 claude-haiku-4-5(저비용). 카탈로그는 모듈 로드시 1회 구성(웜 인스턴스 재사용).

import { GUIDE_INDEX } from './_lib/guide-index.js'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-haiku-4-5'
const MAX_BODY_BYTES = 2 * 1024
const RATE_LIMIT_WINDOW_MS = 60 * 1000
const RATE_LIMIT_MAX = 15
const rateBuckets = new Map()

// ── 카탈로그 1회 구성 + 캐시용 텍스트 (모듈 로드시, 웜 인스턴스 재사용) ──────
const INDEX = Array.isArray(GUIDE_INDEX) ? GUIDE_INDEX : []
const CATALOG_TEXT = INDEX
  .map((g) => `${g.id} [${g.type}/${g.module}] ${g.title} — ${g.tldr}`)
  .join('\n')
const INDEX_BY_ID = new Map(INDEX.map((g) => [g.id, g]))

const SYSTEM_PROMPT = `당신은 "AMS Wiki" — 학원 운영 시스템 가이드 위키 — 의 AI 검색 어시스턴트입니다.
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
${CATALOG_TEXT}
</카탈로그>`

function json(res, status, body) {
  res.status(status).setHeader('content-type', 'application/json; charset=utf-8')
  res.send(JSON.stringify(body))
}
function getClientIp(req) {
  const xf = req.headers['x-forwarded-for']
  if (typeof xf === 'string' && xf.length > 0) return xf.split(',')[0].trim()
  return req.socket?.remoteAddress || 'unknown'
}
function checkRateLimit(ip) {
  const now = Date.now()
  const bucket = rateBuckets.get(ip)
  if (!bucket || now - bucket.start > RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(ip, { start: now, count: 1 })
    return { ok: true }
  }
  bucket.count++
  if (bucket.count > RATE_LIMIT_MAX) {
    return { ok: false, retryAfter: Math.ceil((bucket.start + RATE_LIMIT_WINDOW_MS - now) / 1000) }
  }
  return { ok: true }
}
function readJsonWithLimit(req, limit) {
  return new Promise((resolve, reject) => {
    let received = 0
    const chunks = []
    req.on('data', (chunk) => {
      received += chunk.length
      if (received > limit) { const e = new Error('payload_too_large'); e.code = 'payload_too_large'; req.destroy(); reject(e); return }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) return resolve({})
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch { resolve({}) }
    })
    req.on('error', reject)
  })
}
function parseModelJson(text) {
  if (!text || typeof text !== 'string') return null
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    const obj = JSON.parse(cleaned)
    if (!obj || typeof obj !== 'object') return null
    const answer = typeof obj.answer === 'string' ? obj.answer.trim() : ''
    const ids = Array.isArray(obj.sources) ? obj.sources.filter((s) => typeof s === 'string').slice(0, 4) : []
    if (!answer) return null
    return { answer, ids }
  } catch { return null }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' })
  if (INDEX.length === 0) return json(res, 503, { error: 'index_unavailable' })

  const declaredLen = Number(req.headers['content-length'] || 0)
  if (declaredLen > MAX_BODY_BYTES) return json(res, 413, { error: 'payload_too_large' })

  const rl = checkRateLimit(getClientIp(req))
  if (!rl.ok) { res.setHeader('Retry-After', String(rl.retryAfter)); return json(res, 429, { error: 'rate_limited', retryAfter: rl.retryAfter }) }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return json(res, 503, { error: 'api_key_missing' })

  let body = req.body
  if (body == null) {
    try { body = await readJsonWithLimit(req, MAX_BODY_BYTES) }
    catch (err) { return json(res, err?.code === 'payload_too_large' ? 413 : 400, { error: err?.code || 'invalid_body' }) }
  } else if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = {} }
  }
  const query = typeof body?.query === 'string' ? body.query.trim().slice(0, 200) : ''
  if (!query || query.length < 2) return json(res, 400, { error: 'query_too_short' })

  try {
    const apiRes = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: `질문: "${query}"\n\n위 카탈로그를 근거로 지정된 JSON 형식으로만 답변하세요.` }],
      }),
    })
    if (!apiRes.ok) {
      const errText = await apiRes.text().catch(() => '')
      return json(res, apiRes.status === 429 ? 429 : 502, { error: 'upstream_error', status: apiRes.status, detail: errText.slice(0, 300) })
    }
    const data = await apiRes.json()
    const parsed = parseModelJson(data?.content?.[0]?.text ?? '')
    if (!parsed) return json(res, 200, { answer: '', sources: [], error: 'parse_failed' })

    const sources = parsed.ids
      .map((id) => INDEX_BY_ID.get(id))
      .filter(Boolean)
      .map((g) => ({ id: g.id, title: g.title, route: g.route, type: g.type }))

    const cached = { read: data?.usage?.cache_read_input_tokens ?? 0, write: data?.usage?.cache_creation_input_tokens ?? 0 }
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300')
    return json(res, 200, { answer: parsed.answer, sources, cached })
  } catch (err) {
    return json(res, 500, { error: 'internal_error', message: String(err?.message || err).slice(0, 200) })
  }
}
