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

## 4. 수집기 가동 (자동화)

전체 자동화 그림 — 카카오와 동일하게 **상시 수집은 pg_cron→Edge Function** 이 담당하고,
짧은 토큰 수명을 메우는 **토큰 갱신 배달** 과 최초 1회 **전체 백필** 이 붙는다.

```
[토큰 갱신] jandi:refresh-token ──▶ jandi_secrets.jandi_access_token (수명 ~12h, 6~8h마다 갱신)
                                          │
[상시 수집] pg_cron(5분) ──▶ jandi-collect Edge Function ──▶ jandi_messages (증분)
[최초 1회] jandi:backfill ──────────────────────────────▶ jandi_messages (과거 전량)
```

### 4-A. 상시 수집 — Edge Function + pg_cron (권장, 항상 켜짐)

1) 함수 배포:

```bash
supabase functions deploy jandi-collect --no-verify-jwt
```

2) 5분 디스패치 cron 등록 — 마이그레이션 적용(카카오 `kakao-collect-dispatch` 와 동일 패턴):

```
supabase/migrations/20260706_jandi_collect_dispatch.sql
```

(이 파일이 `jandi-collect-dispatch` 잡을 `*/5 * * * *` 로 등록해 함수를 자동 호출한다.
프로젝트 URL 은 `https://bnszzjaupayakkahmwsu.supabase.co` 로 박혀 있다.)

점검:

```sql
select jobname, schedule, active from cron.job where jobname='jandi-collect-dispatch';
select id, status_code, left(content,200) from net._http_response order by created desc limit 5;
```

### 4-B. 상시 수집 폴백 — 로컬/수동

```bash
# .env.local 에 JANDI_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 설정 후
npm run jandi:collect-once
```

또는 GitHub Actions 탭 → "잔디 대화 수집 (수동 폴백)" → Run workflow(Secrets:
`JANDI_ACCESS_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).

### 4-C. 토큰 갱신 배달 (무인 운영의 핵심)

잔디 토큰은 수명이 ~12h 로 짧아, 만료되면 4-A 수집이 401 로 멈춘다. 새 토큰을 주기적으로
`jandi_secrets.jandi_access_token` 에 배달해야 한다(카카오 "쿠키 배달부"의 잔디판).

```bash
# .env.local 에 JANDI_EMAIL, JANDI_PASSWORD, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 설정 후
npm run jandi:refresh-token
```

`scripts/jandi-refresh-token.mjs` 가 헤드리스로 잔디에 로그인 → 앱이 `i1.jandi.com` 을
호출할 때 요청 헤더의 `Bearer` 토큰을 가로채 배달한다(토큰 저장 위치에 의존 안 함).

- **권장(카카오 모델과 동일):** 사내 신뢰 PC 의 cron 에 `npm run jandi:refresh-token` 을
  6~8시간마다 걸어 둔다. 예(crontab): `0 */6 * * * cd /path/to/Wiki && npm run jandi:refresh-token`.
- **CI 자동 갱신(선택):** `.github/workflows/jandi-refresh-token.yml` 의 `schedule` 주석을
  해제하고 Secrets(`JANDI_EMAIL`,`JANDI_PASSWORD`)를 등록. ⚠️ 회사 계정을 클라우드에서
  로그인하면 보안 경고가 뜨거나 **SSO/2단계 인증(MFA)에 막힐 수 있다**. 막히면 이 잡은 실패로
  끝나며, 2번의 수동 토큰 추출로 갱신한다.

### 4-D. 전체 백필 — 이전 모든 대화 (최초 1회)

각 방을 최신부터 과거 끝까지 훑어 과거 대화를 전량 적재한다(상시 증분 수집과 별개인 1회성).

```bash
npm run jandi:backfill              # 활성 3개 방 전체
npm run jandi:backfill 31495011     # 특정 방만
```

또는 GitHub Actions 탭 → "잔디 대화 전체 백필" → Run workflow(입력 `room_id` 비우면 3개 방
전체). `scripts/jandi-backfill.mjs` 는 방당 `JANDI_BACKFILL_MAX_PAGES`(기본 무제한)까지
`type=old` 로 페이지백하며 500건씩 멱등 upsert 하고, 커서가 정체되면(끝 도달) 자동 중단한다.

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

- **토큰 수명 ~12시간(짧음).** 카카오 쿠키(1~4주)보다 훨씬 짧다. 무인 운영하려면 새 토큰을
  주기적으로 `jandi_secrets.jandi_access_token` 에 배달해야 한다(§4-C, 카카오 "쿠키 배달부"의
  잔디판). 잔디는 공개된 refresh 엔드포인트가 없어(HAR 미포함), `jandi:refresh-token` 이
  **헤드리스 로그인으로 새 토큰을 가로채 배달**한다 — 저장 위치에 의존하지 않아 견고하다.
  ⚠️ 단, 회사가 **SSO/2단계 인증(MFA)** 을 쓰면 헤드리스 로그인이 막힐 수 있고, 클라우드
  CI 로그인은 보안 경고를 유발할 수 있어 **사내 신뢰 PC 의 cron 실행을 권장**한다. 막히면
  2번의 수동 추출로 갱신한다.
- **첫 수집 범위 / 전체 백필.** 상시 수집(§4-A)은 커서(`last_link_id`)가 없을 때 각 방의
  **최신 페이지(50건)만** 잡고 이후 증분한다. "이전 모든 대화"가 필요하면 `jandi:backfill`
  (§4-D)을 1회 돌려 과거를 전량 채운다 — 이후는 상시 수집이 이어받는다.
- **응답 필드 매핑은 first-collection 에서 검증.** 캡처(HAR)에 응답 본문이 빠져 있어 메시지
  객체의 정확한 키 이름을 확정하지 못했다. 그래서 수집기는 **원본 레코드를 `raw` 컬럼에
  통째로 저장**하고 본문·작성자·시각을 방어적으로 추출한다 → 표시용 필드가 어긋나도
  **데이터 손실은 없으며 재수집 없이** 매핑만 고치면 된다. 첫 수집 후
  `select raw from jandi_messages limit 3;` 로 실제 키를 확인해 `messageToRow`(스크립트/엣지
  함수 공통) 를 확정할 것.
- **작성자 이름.** 메시지에는 `writer_id`(멤버 ID)만 담긴다. 이름 매핑은 멤버 목록 API 확정
  후 후속(현재 화면은 `writer_name` 이 있으면 이름, 없으면 "멤버 …ID" 로 표시).
- **보안.** access token = 로그인 권한. `jandi_secrets` 는 RLS 로 service_role 외 접근 차단.
  본문은 카드/주민/전화/이메일만 라이트 마스킹하고, 내부 구성원 이름은 유지한다.
