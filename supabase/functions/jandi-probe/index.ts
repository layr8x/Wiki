// supabase/functions/jandi-probe/index.ts
// 잔디 API 응답 구조 진단용 — 임시 디버그 함수. 인증: jandi-collect 와 동일(jandi_collect_token).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

async function getSecret(key: string): Promise<string | null> {
  const { data } = await supabase.from('jandi_secrets').select('value').eq('key', key).maybeSingle();
  return (data as any)?.value ?? null;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || '';
  const expected = await getSecret('jandi_collect_token');
  if (!expected || token !== expected) return json({ error: 'unauthorized' }, 401);

  const mode = url.searchParams.get('mode') || 'messages';
  const accessToken = await getSecret('jandi_access_token');
  const teamId = (await getSecret('jandi_team_id')) || '29522216';
  const memberId = await getSecret('jandi_member_id');
  const accountId = await getSecret('jandi_account_id');
  const headers: Record<string, string> = {
    'user-agent': 'Mozilla/5.0',
    'accept': 'application/vnd.tosslab.jandi-v2+json',
    'authorization': `Bearer ${accessToken}`,
    'x-team-id': teamId,
    'x-user-agent': 'Jandi/26.12 (web; Mac OS; 10.15; Browser; Chrome;)',
    'referer': 'https://flytofreedom.jandi.com/',
  };
  if (memberId) headers['x-member-id'] = memberId;
  if (accountId) headers['x-account-id'] = accountId;

  if (mode === 'members') {
    // member-api 는 이전 시도(x-account-id 없이)에서 전 경로 503 — 실제 웹앱이 보내는
    // x-account-id 헤더를 빠뜨렸을 가능성 재검증(위에서 이미 추가함).
    const v1Headers = { ...headers, accept: 'application/vnd.tosslab.jandi-v1+json' };
    const candidates = [
      { u: `https://i1.jandi.com/member-api/v1/teams/${teamId}/members`, h: v1Headers },
      { u: `https://i1.jandi.com/member-api/v1/teams/${teamId}`, h: v1Headers },
      { u: `https://i1.jandi.com/member-api/v1/teams/${teamId}/members/list`, h: v1Headers },
      { u: `https://i1.jandi.com/member-api/v1/teams/${teamId}/members`, h: headers },
      { u: `https://i1.jandi.com/member-api/v2/teams/${teamId}/members`, h: v1Headers },
    ];
    const results: any[] = [];
    for (const { u, h } of candidates) {
      try {
        const r = await fetch(u, { headers: h });
        const ct = r.headers.get('content-type') || '';
        const b = ct.includes('json') ? await r.json().catch(() => null) : await r.text().catch(() => null);
        const preview = typeof b === 'string' ? b.slice(0, 200) : JSON.stringify(b).slice(0, 1200);
        results.push({ url: u, accept: h.accept, status: r.status, preview });
      } catch (e: any) {
        results.push({ url: u, error: e.message });
      }
      await new Promise((res2) => setTimeout(res2, 150));
    }
    return json({ mode: 'members', hasAccountId: !!accountId, results });
  }

  const room = url.searchParams.get('room');
  const count = url.searchParams.get('count') || '50';
  if (!room) return json({ error: 'room param required' }, 400);

  const res = await fetch(
    `https://i1.jandi.com/message-api/v2/teams/${teamId}/rooms/${room}/messages?count=${count}`,
    { headers },
  );
  const body = await res.json().catch(() => null);
  const recs = Array.isArray(body?.records) ? body.records : [];

  const blank = recs.filter((r: any) => !r?.message?.content && typeof r?.message !== 'string').slice(0, 3);
  const normal = recs.filter((r: any) => r?.message?.content).slice(0, 1);

  return json({
    status: res.status,
    total: recs.length,
    blank_count: recs.filter((r: any) => !r?.message?.content).length,
    blank_samples: blank,
    normal_sample: normal,
  });
});
