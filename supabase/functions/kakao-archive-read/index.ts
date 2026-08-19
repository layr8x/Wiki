// supabase/functions/kakao-archive-read/index.ts
// 백업(Storage)에 압축 저장된 카카오 상담 메시지 한 배치를 읽어서 원본 행으로 돌려준다.
//
// 왜 필요한가: kakao-archive 가 90일 지난 메시지를 DB에서 지우고 Storage로 옮기기 때문에,
// 관리자 화면의 "전체 다운로드"(CSV)가 예전처럼 kakao_partner_messages 만 읽으면 오래된
// 대화가 통째로 빠진다. 이 함수는 그 백업 파일 하나를 읽어 압축을 풀어 돌려준다 —
// 프런트엔드가 kakao_archive_log 표에서 파일 목록을 찾고, 이 함수로 하나씩 읽어 최근
// 데이터와 합친다.
//
// 인증: 별도 비밀 토큰이 아니라 일반 로그인(Supabase Auth) 만 요구한다 — 배포 시
// verify_jwt=true(기본값). kakao_partner_messages 를 직접 읽을 때와 같은 기준
// (RLS auth_read_messages 정책: 로그인 계정이면 허용, 익명 로그인 제외)과 맞춘다.
//
// ⚠️ verify_jwt=true 는 "서명이 유효한 JWT면 통과"일 뿐이다 — 공개 anon 키(프런트엔드
// 번들에 그대로 들어있는, 로그인 없이도 누구나 볼 수 있는 값) 자체도 유효한 JWT라
// 이 플랫폼 검사만으로는 로그인 없이도 통과한다. 이 함수는 service role 로 Storage를
// 직접 열어 RLS를 안 거치므로, 아래에서 직접 role='authenticated' + 비-익명임을
// 확인해야 kakao_partner_messages 의 RLS와 같은 수준의 보호가 된다. 서명 검증 자체는
// 플랫폼이 이미 끝냈으므로(여기 도달했다는 것 자체가 서명 유효 증거) 페이로드만 읽는다.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET = 'kakao-archive';

// 백업 쓰기(service role)와 별개로, 읽기는 이 함수가 service role로 대신 열어준다 —
// 버킷 자체를 authenticated 에게 공개하지 않아도 되므로 더 좁은 권한 노출이다.
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// 브라우저에서 supabase.functions.invoke() 로 직접 부르는 유일한 함수 — 이 저장소의 다른
// 모든 함수는 cron/서버 간 호출이라 CORS 가 필요 없었다. 이게 없으면 브라우저가 preflight
// (OPTIONS) 단계에서 조용히 막아버려 서버 로그·인증·데이터가 전부 멀쩡해도 프런트만 실패한다
// (2026-08-19 실측 — "전체 다운로드"가 최근 데이터만 받고 백업분은 계속 빠짐).
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });

function getJwtClaims(req: Request): Record<string, unknown> | null {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

async function gunzip(bytes: Uint8Array): Promise<string> {
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const chunks: Uint8Array[] = [];
  const reader = ds.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return new TextDecoder().decode(out);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  try {
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

    const claims = getJwtClaims(req);
    if (!claims || claims.role !== 'authenticated' || claims.is_anonymous === true) {
      return json({ error: 'unauthorized' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const objectPath = String(body?.object_path || '');
    const query = String(body?.query || '').trim().toLowerCase();
    // 기간 필터(선택) — 한 백업 배치는 "오래된 메시지 N개씩"으로 묶이므로 요청한 월/년 경계를
    // 넘나들 수 있다(예: 2월 말~3월 초가 한 파일에 섞임). 파일은 겹치기만 하면 통째로 골라
    // 오므로, 여기서 실제 sent_at 기준으로 한 번 더 걸러야 "3월만" 요청에 2월 말 데이터가
    // 안 섞인다(실시간 조회의 .gte/.lt 와 같은 기준을 백업분에도 맞춤).
    const gte = body?.gte ? String(body.gte) : null;
    const lt = body?.lt ? String(body.lt) : null;
    if (!objectPath) return json({ error: 'object_path required' }, 400);
    // 다른 버킷 경로로 못 벗어나게(경로 조작 방지) — 항상 CHANNEL/파일명 형태여야 한다.
    if (objectPath.includes('..') || objectPath.startsWith('/')) return json({ error: 'invalid path' }, 400);

    const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(objectPath);
    if (dlErr) return json({ error: dlErr.message }, 404);

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = await gunzip(bytes);
    let rows = text.split('\n').filter(Boolean).map((line) => JSON.parse(line));
    if (gte) rows = rows.filter((r: Record<string, unknown>) => String(r.sent_at || '') >= gte);
    if (lt) rows = rows.filter((r: Record<string, unknown>) => String(r.sent_at || '') < lt);
    const filtered = query
      ? rows.filter((r: Record<string, unknown>) => String(r.message || '').toLowerCase().includes(query))
      : rows;

    return json({ rows: filtered });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
