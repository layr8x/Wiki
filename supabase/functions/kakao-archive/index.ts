// supabase/functions/kakao-archive/index.ts
// 카카오 상담 메시지 중 오래된 것을 Storage(별도 저장공간)에 압축 백업한 뒤 DB에서 지운다.
//
// 왜 필요한가 (2026-08-19): Supabase 무료 요금제 DB 용량 500MB인데 kakao_partner_messages
// 하나가 1,074MB(전체 1,233MB 중 87%)를 차지해 유예기간(9/4)이 걸렸다. 대부분은 LIVE 채널의
// 오래된 기록 — 102만 건 중 최근 90일치는 6.6%뿐이다(2023-12부터 누적된 데이터).
//
// 안전 원칙: 업로드가 확실히 성공한 배치만 지운다. 업로드가 실패하면 그 배치는 그대로 두고
// 다음 실행에서 다시 시도한다(멱등 — 이미 지워진 행은 다시 안 걸리므로 재실행해도 안전).
// 삭제가 실패해도(백업은 이미 성공) 데이터 유실은 없다 — 다음 실행에서 같은 행을 다시 백업
// 시도해 중복 백업 파일만 하나 더 생긴다. 유실보다 중복이 훨씬 안전한 실패 방향이다.
//
// 인증: kakao_partner_secrets.key='kakao_archive_token'.
// 보관 기간: 최근 RETENTION_DAYS(90일)만 DB에 남기고 그 이전은 백업 후 삭제한다. 관리자
//   화면(카카오 상담 로그)의 실시간 조회·CSV 다운로드는 최근 90일만 대상이 된다 — 그 이전
//   기록이 필요하면 Storage에 저장된 압축 파일(jsonl.gz, 원본 컬럼 그대로)을 내려받는다.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const log = (...a: unknown[]) => console.log(`[${new Date().toISOString()}]`, ...a);
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

const BUCKET = 'kakao-archive';
const RETENTION_DAYS = 90;
const BATCH_SIZE = 2000; // 프로젝트 API 설정(Max Rows)이 더 낮으면 실제로는 그보다 적게 옴 — 그래도 안전(아래 참고)
const MAX_BATCHES_PER_CALL = 10; // 채널당 상한. 1회 호출(함수 제한시간 150초) 안에 안전하게 끝나도록.
const CHANNELS = ['_VGAQn', '_rcpPG', '_TkpPG', '_xfxilXn', '_rkbcn'];

async function gzip(text: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  const cs = new CompressionStream('gzip');
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const chunks: Uint8Array[] = [];
  const reader = cs.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

// 반환값: 처리한 행 수(0 이상) | null = 이 채널은 더 이상 백업할 오래된 행이 없음(끝)
// | -1 = 실패(다음 실행에서 이 구간을 다시 시도 — 아직 안 지워졌으므로 안전)
//
// ⚠️ "받은 행 수가 BATCH_SIZE 와 다르면 이상하다"고 판단하지 않는다 — 서버가 요청보다 적게
// 돌려줄 수 있다는 걸 이번 주 CSV 다운로드 버그로 이미 확인했다(fetchAllByCursor 수정 참고).
// 여기 로직은 처음부터 "실제로 받은 행 수" 기준으로만 동작해 그 문제에 영향받지 않는다.
async function archiveOneBatch(profileId: string, cutoffIso: string): Promise<number | null> {
  const { data: rows, error: selErr } = await supabase
    .from('kakao_partner_messages')
    .select('*')
    .eq('profile_id', profileId)
    .lt('sent_at', cutoffIso)
    .order('sent_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (selErr) { log('select fail', profileId, selErr.message); return -1; }
  if (!rows || rows.length === 0) return null;

  const jsonl = rows.map((r: Record<string, unknown>) => JSON.stringify(r)).join('\n');
  const gz = await gzip(jsonl);
  const minAt = String(rows[0].sent_at);
  const maxAt = String(rows[rows.length - 1].sent_at);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = `${profileId}/${minAt.slice(0, 10)}_${stamp}_${rows.length}.jsonl.gz`;

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, gz, {
    contentType: 'application/gzip',
    upsert: false,
  });
  if (upErr) { log('upload fail — 배치 건너뜀(다음 실행에서 재시도)', profileId, upErr.message); return -1; }

  // 업로드 응답에 오류가 없었을 때만 삭제한다. 백업 확인 없이 지우지 않는다는 원칙의 핵심.
  const ids = rows.map((r: Record<string, unknown>) => r.log_id);
  const { error: delErr } = await supabase
    .from('kakao_partner_messages')
    .delete()
    .in('log_id', ids);
  if (delErr) {
    log('delete fail(백업은 이미 저장됨 — 유실 없음, 다음 실행에서 재시도해 중복 백업만 생김)', profileId, delErr.message);
    return -1;
  }

  const { error: logErr } = await supabase.from('kakao_archive_log').insert({
    profile_id: profileId,
    object_path: path,
    row_count: rows.length,
    min_sent_at: minAt,
    max_sent_at: maxAt,
    bytes: gz.length,
  });
  if (logErr) log('archive_log insert fail(백업·삭제는 이미 끝남, 기록만 실패)', profileId, logErr.message);

  return rows.length;
}

Deno.serve(async (req: Request) => {
  try {
    return await handle(req);
  } catch (e) {
    log('unhandled error', String((e as Error)?.message ?? e));
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: secret } = await supabase
    .from('kakao_partner_secrets')
    .select('value')
    .eq('key', 'kakao_archive_token')
    .maybeSingle();
  if (!secret?.value || token !== secret.value) return json({ error: 'unauthorized' }, 401);

  const cutoffIso = new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString();
  const summary: Record<string, number> = {};
  let totalArchived = 0;
  let hadFailure = false;

  for (const profileId of CHANNELS) {
    let archived = 0;
    for (let i = 0; i < MAX_BATCHES_PER_CALL; i++) {
      // 배치 하나가 네트워크 오류 등으로 예외를 던져도(예: 2026-08-19 실측 — 게이트웨이가 HTML
      // 오류 페이지를 돌려줘 JSON 파싱이 예외를 던짐) 함수 전체가 502/500으로 죽지 않게 한다.
      // 이미 끝난 배치(업로드+삭제 완료분)는 그대로 안전하게 남고, 이 채널만 이번 호출에서
      // 멈추고 다음 실행(10분 뒤 cron)에서 이어간다 — 데이터 유실 없음.
      let n: number | null;
      try {
        n = await archiveOneBatch(profileId, cutoffIso);
      } catch (e) {
        log('batch threw — 다음 실행에서 재시도', profileId, String((e as Error)?.message ?? e));
        hadFailure = true;
        break;
      }
      if (n === null) break;
      if (n === -1) { hadFailure = true; break; }
      archived += n;
    }
    summary[profileId] = archived;
    totalArchived += archived;
  }

  log('archive run done', JSON.stringify({ summary, totalArchived, hadFailure, cutoffIso }));
  return json({ summary, totalArchived, hadFailure, cutoffIso, at: new Date().toISOString() });
}
