# 잔디(JANDI) 대화 수집 셋업

사내 잔디 3개 방의 대화를 Supabase 에 적재하고 관리자 화면(`/admin/jandi`)에서 채널별로 보는 파이프라인.

## 왜 폴링인가 (웹훅이 아니라)

잔디는 **대화 전체를 외부로 내보내는 웹훅이 없다.** 잔디의 아웃고잉 웹훅은 "지정한 트리거 단어로
시작하는 메시지"만 전송하므로 전체 대화 수집에 쓸 수 없다
([JANDI 지원 문서](https://support.jandi.com/en/articles/Using-Team-Outgoing-Webhook-for-All-Members-aea2650b)).
따라서 **카카오 파트너센터와 동일한 방식** — 로그인 세션의 access token 으로 잔디 내부
REST(`i1.jandi.com/message-api/v2`)를 방별로 증분 폴링 — 을 사용한다.

```
잔디 웹앱(로그인)  access token(JWT, ~12h)
        │
        ▼
supabase/functions/jandi-collect  ── 방마다: 최신 메시지 page(count=50)
   (pg_cron 이 주기 호출)              + 커서(last_link_id)보다 과거면 type=old 백필
        │
        ▼
   Supabase 테이블
   jandi_channels / jandi_messages / jandi_stream_state
        │
        ▼
   /admin/jandi (관리자 화면 — 채널 3개 탭 + 검색/기간/CSV)
```

수집 대상 방(시드됨):

| room_id | 채널 |
|---|---|
| 31495011 | 시대 APP 기획/문의 |
| 31962045 | 시대 APP 실험실 |
| 33385655 | 재종통합행정 + 플랫폼서비스실 소통방 |

팀 ID: `29522216` (전 채널 공통).

---

## 1. 마이그레이션 적용

Supabase Dashboard → SQL Editor → 아래 파일 전체 붙여넣고 RUN.

```
supabase/migrations/20260706_jandi.sql
```

생성: `jandi_channels`(3방 시드) · `jandi_messages` · `jandi_stream_state` · `jandi_secrets`
(RLS: 읽기 anon 허용, 쓰기 service_role 전용. `jandi_secrets` 는 정책 0 → service_role 전용).

---

## 2. access token 추출

잔디 웹앱에 로그인한 브라우저에서 토큰을 꺼낸다(카카오 쿠키 추출과 같은 역할).

1. Chrome 으로 https://flytofreedom.jandi.com 접속 후 로그인
2. DevTools(Cmd+Opt+I) → **Network** 탭 → 아무 `i1.jandi.com/message-api/...` 요청 클릭
3. **Request Headers → `authorization: Bearer eyJ...`** 의 `eyJ...` 부분(JWT)이 access token
   - 또는 요청 URL 에 `access_token=eyJ...` 로 붙는 경우 그 값
4. `X-Team-ID`(29522216), `X-Member-ID`(예: 35044455)도 같이 확인해두면 좋다(선택).

> ⚠️ **이 토큰은 잔디 로그인 권한과 동등하고 수명이 약 12시간으로 짧다.** git/브라우저/Slack 에
> 올리지 말 것. 아래 3번의 보관함(`jandi_secrets`)에만 저장한다.

---

## 3. 시크릿 등록 (Supabase 보관함)

Supabase Dashboard → SQL Editor:

```sql
-- 잔디 access token (수집기가 잔디 API 호출에 사용)
insert into jandi_secrets (key, value) values ('jandi_access_token', '여기에_eyJ...토큰')
on conflict (key) do update set value = excluded.value, updated_at = now();

-- Edge Function 자체 호출 인증 토큰(아무 랜덤 문자열) — 카카오 kakao_collect_token 과 같은 역할
insert into jandi_secrets (key, value) values ('jandi_collect_token', '여기에_긴_랜덤문자열')
on conflict (key) do update set value = excluded.value, updated_at = now();

-- (선택) 팀/멤버 ID — 기본값(29522216)과 다를 때만
insert into jandi_secrets (key, value) values ('jandi_team_id', '29522216')
on conflict (key) do update set value = excluded.value, updated_at = now();
```

---

## 4. 수집기 가동

### 방법 A — Supabase Edge Function (권장, 항상 켜짐)

```bash
supabase functions deploy jandi-collect --no-verify-jwt
```

그리고 pg_cron 으로 5분마다 호출(카카오 `kakao-collect-dispatch` 와 동일 패턴). 예:

```sql
select cron.schedule('jandi-collect-dispatch', '*/5 * * * *', $$
  select net.http_post(
    url    := 'https://<project>.supabase.co/functions/v1/jandi-collect?token=' ||
              (select value from jandi_secrets where key='jandi_collect_token'),
    headers:= '{"Content-Type":"application/json"}'::jsonb
  );
$$);
```

### 방법 B — 로컬/수동 (폴백)

```bash
# .env.local 에 JANDI_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 설정 후
node --env-file=.env.local scripts/jandi-collect-once.mjs
```

또는 GitHub Actions 탭 → "잔디 대화 수집" → Run workflow(Secrets: `JANDI_ACCESS_TOKEN`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).

---

## 5. 동작 확인

```sql
-- 채널별 수집량
select c.label, count(m.*) as msgs, max(m.created_at) as latest
from jandi_channels c left join jandi_messages m using (room_id)
group by c.label order by msgs desc;

-- 최근 메시지 20건
select created_at, room_id, writer_name, left(message, 60) as preview
from jandi_messages order by created_at desc limit 20;

-- 수집 헬스
select * from jandi_stream_state;
```

관리자 화면: `/admin/jandi` (사이드바 "잔디 대화").

---

## 6. 한계 / 확인 필요 (정직 기록)

- **토큰 수명 ~12시간(짧음).** 카카오 쿠키(1~4주)보다 훨씬 짧다. 무인 운영하려면 잔디
  세션에서 토큰을 주기적으로(수명 내) 다시 꺼내 `jandi_secrets.jandi_access_token` 에
  배달하는 잡이 필요하다(카카오 "쿠키 배달부"의 잔디판). 갱신용 refresh 엔드포인트는 이번
  네트워크 캡처에 포함되지 않아 자동 refresh 는 미구현 — 만료 시 2번 과정으로 토큰을
  갱신한다. (자동화하려면 로그인/refresh 요청까지 포함한 캡처가 추가로 필요.)
- **응답 필드 매핑은 first-collection 에서 검증.** 캡처(HAR)에 응답 본문이 빠져 있어 메시지
  객체의 정확한 키 이름을 확정하지 못했다. 그래서 수집기는 **원본 레코드를 `raw` 컬럼에
  통째로 저장**하고 본문·작성자·시각을 방어적으로 추출한다 → 표시용 필드가 어긋나도
  **데이터 손실은 없으며 재수집 없이** 매핑만 고치면 된다. 첫 수집 후
  `select raw from jandi_messages limit 3;` 로 실제 키를 확인해 `messageToRow`(스크립트/엣지
  함수 공통) 를 확정할 것.
- **작성자 이름.** 메시지에는 `writer_id`(멤버 ID)만 담긴다. 이름 매핑은 멤버 목록 API 확정
  후 후속(현재 화면은 `writer_name` 이 있으면 이름, 없으면 "멤버 …ID" 로 표시).
- **첫 수집 범위.** 커서(`last_link_id`)가 없을 때는 각 방의 **최신 페이지(50건)만** 잡고
  이후 증분 수집한다. 과거 전체 백필이 필요하면 `JANDI_MAX_PAGES` 를 크게 주고 1회 수동
  실행(방별 page 백필)한다.
- **보안.** access token = 로그인 권한. `jandi_secrets` 는 RLS 로 service_role 외 접근 차단.
  본문은 카드/주민/전화/이메일만 라이트 마스킹하고, 내부 구성원 이름은 유지한다.
