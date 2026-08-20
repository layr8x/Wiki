// kakao-collect 의 커서 안전 규칙을 실제로 돌려서 확인한다.
//
// 규칙: "메시지를 못 가져온 대화방은 커서(last_log_id)를 전진시키지 않는다."
// 이걸 어기면 다음 실행이 '변경 없음'으로 판단해 그 상담을 영영 안 가져온다.
// 2026-08 이전 이 함수는 선(先) upsert 에 최신 커서를 넣어 이 규칙을 어기고 있었다.
//
// 실행: deno test --allow-env --allow-net --no-check \
//         supabase/functions/kakao-collect/test/cursor_safety_test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const SB = 'https://fake.supabase.co';
Deno.env.set('SUPABASE_URL', SB);
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-key');

const TOKEN = 'collecttoken';
// 222번 방의 대화 내용 조회만 실패시킨다. 나머지는 정상.
const FAIL_CHAT = '222';

// DB 에 이미 저장돼 있는 커서(예전 값)
const EXISTING = [
  { chat_id: '111', last_log_id: 'OLD-111' },
  { chat_id: '222', last_log_id: 'OLD-222' },
];

type Write = { table: string; rows: Array<Record<string, unknown>> };
const writes: Write[] = [];

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const jsonRes = (d: unknown, status = 200) =>
    new Response(JSON.stringify(d), {
      status,
      headers: { 'content-type': 'application/json', 'content-range': '0-0/*' },
    });

  // ── Supabase (PostgREST)
  if (url.startsWith(SB)) {
    const table = new URL(url).pathname.replace('/rest/v1/', '').split('?')[0];
    if (method === 'GET' && table === 'kakao_partner_secrets') {
      const wantsCookie = url.includes('kakao_partner_cookie');
      return jsonRes([{ value: wantsCookie ? '_kawlt=abc; _kawltea=99999999999' : TOKEN }]);
    }
    if (method === 'GET' && table === 'kakao_partner_chats') return jsonRes(EXISTING);
    if (method === 'GET') return jsonRes([]);
    const raw = init?.body ?? (input instanceof Request ? await input.text() : null);
    const parsed = typeof raw === 'string' && raw ? JSON.parse(raw) : [];
    writes.push({ table, rows: Array.isArray(parsed) ? parsed : [parsed] });
    return jsonRes([]);
  }

  // ── 카카오
  if (url.includes('/api/users/me')) return jsonRes({ email: 'staff@example.com' });
  if (url.includes('/chats/search')) {
    return jsonRes({
      items: [
        // 둘 다 커서가 바뀐 상태 = 새 내용이 있음
        { id: 111, last_log_id: 'NEW-111', talk_user: { id: 'u1', nickname: '김철수', user_type: 0 } },
        { id: 222, last_log_id: 'NEW-222', talk_user: { id: 'u2', nickname: '이영희', user_type: 0 } },
      ],
    });
  }
  if (url.includes('/chatlogs')) {
    const cid = url.match(/chats\/(\d+)\/chatlogs/)![1];
    if (cid === FAIL_CHAT) return jsonRes({ message: 'Internal Server Error' }, 500);
    return jsonRes({ items: [{ id: `${cid}-a`, message: '문의드립니다', send_at: 1787000000000, author: { id: 'u1', user_type: 0 } }] });
  }
  return jsonRes({}, 404);
}) as typeof fetch;

let handler!: (req: Request) => Promise<Response>;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (h: (req: Request) => Promise<Response>) => { handler = h; return { finished: Promise.resolve() }; };

await import('../index.ts');
assert(handler, 'kakao-collect 가 핸들러를 등록하지 않았습니다');

Deno.test('★★ 대화 내용을 못 가져온 방의 커서를 전진시키지 않는다 (영구 유실 방지)', async () => {
  writes.length = 0;
  const res = await handler(new Request(`https://x/kakao-collect?token=${TOKEN}`, { method: 'POST', body: '{}' }));
  assertEquals(res.status, 200, await res.text());

  // 이번 실행에서 kakao_partner_chats 로 쓰인 모든 행을 모은다.
  const chatWrites = writes.filter((w) => w.table === 'kakao_partner_chats').flatMap((w) => w.rows);
  assert(chatWrites.length > 0, '대화방을 하나도 저장하지 않았다');

  // 실패한 방(222)에 대해 쓰인 커서 값들
  const cursorsFor222 = chatWrites
    .filter((r) => String(r.chat_id) === FAIL_CHAT)
    .map((r) => r.last_log_id ?? null);

  assert(
    !cursorsFor222.includes('NEW-222'),
    `실패한 방의 커서를 최신값으로 올렸다(${JSON.stringify(cursorsFor222)}). ` +
      '다음 실행이 "변경 없음"으로 판단해 그 상담이 영영 유실된다.',
  );

  // 성공한 방(111)은 정상적으로 전진해야 한다.
  const cursorsFor111 = chatWrites
    .filter((r) => String(r.chat_id) === '111')
    .map((r) => r.last_log_id ?? null);
  assert(cursorsFor111.includes('NEW-111'), `성공한 방의 커서가 전진하지 않았다(${JSON.stringify(cursorsFor111)})`);
});

Deno.test('실패 사유를 응답에 실어 밖에서 보이게 한다', async () => {
  const res = await handler(new Request(`https://x/kakao-collect?token=${TOKEN}`, { method: 'POST', body: '{}' }));
  const body = await res.json();
  const ch = (body.channels ?? []).find((c: Record<string, unknown>) => c.profile_id === '_VGAQn');
  assert(ch, '채널 결과가 없다');
  assert(Array.isArray(ch.errors) && ch.errors.length > 0, '실패 사유가 응답에 없다');
  assert(String(ch.errors[0]).startsWith(FAIL_CHAT), `실패한 방 번호가 안 보인다: ${ch.errors[0]}`);
});
