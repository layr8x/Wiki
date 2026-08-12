# 카카오 파트너센터 실시간 수집 셋업

업무 카카오 비즈니스 파트너센터(business.kakao.com)의 채팅을 실시간으로 Supabase 에 적재하는 데몬.

---

## ★★ 현재 구조 (2026-08-12 확정) — 클라우드 수집 불가, 맥 스튜디오에서 수집

> **아래 §5·§10·§11 의 "클라우드(Supabase Edge Function / GitHub Actions)에서 수집" 방식은 더 이상 동작하지 않는다.**
> 이 절이 최신이며, 아래 옛 절들은 이력 참고용이다.

### 무슨 일이 있었나

2026-07-25 부터 5개 채널 수집이 전면 중단됐다(18일간 0건). 겉보기 지표는 전부 정상이었다.

| 항목 | 상태 |
|---|---|
| pg_cron | 정상 (20분마다, 24시간 72회 성공) |
| 쿠키 배달 | 정상 (6시간마다 갱신, 만료 21시간 남음) |
| Edge Function | HTTP 200 응답 |
| 알림 | 정상 발송 (7/25부터 계속) |
| **실제 수집** | **0건 — 카카오가 401 거부** |

### 진짜 원인: 카카오의 클라우드 IP 차단

쿠키 만료가 아니었다. **동일 쿠키·동일 헤더로 호출 위치만 달리한 실측**:

| 호출 위치 | 결과 |
|---|---|
| 맥 스튜디오 (2026-08-12 02:16) | **200 정상** |
| Supabase Edge Function (02:20) | **401 거부** |

4분 간격, 같은 쿠키, 같은 User-Agent. 변수는 호출 IP 뿐이었다.
→ **쿠키를 아무리 잘 갱신해도 클라우드에서는 통과할 수 없다.**

### 그래서 이렇게 바꿨다

```
Chrome (business.kakao.com 로그인 유지)
        │  ① 6시간마다: 쿠키 추출 + "실제로 통하는지" 검증 후에만 배달
        ▼
  .env.local  +  Supabase(kakao_partner_secrets)
        │
        │  ② 5분마다: 같은 기기에서 직접 수집 (카카오가 허용하는 IP)
        ▼
   Supabase 테이블 (kakao_partner_chats / _messages / _stream_state)

   전부 회사 자산 맥 스튜디오의 launchd 에서 실행 — 사람 조작 0
```

| launchd 잡 | 주기 | 하는 일 |
|---|---|---|
| `com.amswiki.kakao-cookie-refresh` | 6시간 | 쿠키 추출·검증·배달 |
| `com.amswiki.kakao-collect` | 5분 | **수집 본체** |

설치(각각 1회):
```bash
mkdir -p ~/Library/Logs/ams-wiki
cp scripts/launchd/com.amswiki.kakao-collect.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.amswiki.kakao-collect.plist
```

Supabase 쪽 수집 크론은 비활성화했다(무한 401·오탐 알림 방지).
되살리려면: `select cron.alter_job(1, active := true);`

### 재발 방지로 함께 고친 것

1. **쿠키 갱신 시 프로필 검증** (`kakao-partner-refresh-cookie.mjs`)
   전에는 `_kawlt` 를 가진 Chrome 프로필 중 **가장 최근 수정된 것 하나**만 골라 배달했다.
   Chrome 에 카카오 계정이 2개(`basis9@gmail.com`/`basis9@kakao.com`) 물려 있어 파트너센터
   권한 없는 프로필이 뽑히면 그대로 401. 사용자가 로그인해도 스크립트가 딴 프로필을 집어가
   "다시 로그인하세요" 알림만 반복됐다.
   → 이제 후보를 **전부** 놓고 `me()` + `chats/search` 를 실제 호출해 **통과한 것만** 배달한다.
   통과가 하나도 없으면 보관함을 덮어쓰지 않는다(마지막 정상 쿠키 보존).

2. **토큰 회전 흡수** (`supabase/functions/kakao-collect/index.ts`, v12)
   카카오 응답의 `Set-Cookie`(갱신 토큰)를 전부 버리고 있었다. 브라우저가 로그인을 유지하는
   원리가 이 회전인데 받지 않으니 세션이 갱신되지 않았다. → 이제 흡수해 보관함에 되돌려 저장.

3. **인증 실패를 드러나게**
   401 을 HTTP 200 으로 응답해 로그상 18일간 "정상"으로 보였다. → 502 로 응답.

### 공백 데이터 회수

7/25~8/12 공백은 **정규 수집기가 자동으로 메운다**. 대화별 `last_log_id` 가 바뀐 것을 감지해
`chatlogs(size=200)` 를 다시 가져오기 때문이다. 채널당 1회 호출 상한이 있어 여러 번에 걸쳐
따라잡는다(5분 주기라 자동). 대화당 200건을 넘게 쌓인 경우만 유실 가능.

---

## 아키텍처 (원본 설계 — 이력 참고)

```
                 ┌──────────────────────────────────┐
business.kakao   │  REST: /api/profiles/_VGAQn/...  │  ← 채팅 메타·목록
.com  (cookie)   ├──────────────────────────────────┤
                 │  WS  : pf-capi.kakao.com (SockJS)│  ← 메시지 push
                 └──────────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
   scripts/kakao-partner-       scripts/kakao-partner-
        bootstrap.mjs                 stream.mjs
   (1회 채팅 메타 백필)        (상시 데몬 — WS + 60s 폴링 폴백)
              │                           │
              └────────────┬──────────────┘
                           ▼
                    Supabase 테이블
       kakao_partner_chats / _messages / _stream_state
```

핵심:
- **인증은 쿠키만** — 별도 토큰/Bearer 없음. 카카오 로그인 세션 쿠키 그대로.
- **메시지 본문은 WebSocket push 로만** 수신 (REST 단건 endpoint 발견 못함).
- **service_role 키**로 RLS 우회 — 절대 브라우저 코드에 노출 금지.

---

## 1. Supabase 마이그레이션 적용

Supabase Dashboard → SQL Editor → New query → 아래 파일 전체 붙여넣고 RUN.

```
supabase/migrations/20260512_kakao_partner.sql
```

생성되는 것:
- `kakao_partner_chats` — 채팅방 메타 (chat_id PK)
- `kakao_partner_messages` — 메시지 단건 (log_id PK, chat_id FK)
- `kakao_partner_stream_state` — 스트림 재개 기준점 (profile_id PK)

이어서 헬스 컬럼 마이그레이션도 적용 (수집 멈춤 원인 기록용, additive):
```
supabase/migrations/20260524_kakao_partner_stream_health.sql
```

---

## 2. 의존성 설치

```bash
npm install
```

`ws` 가 새로 추가됨.

---

## 3. 쿠키 + 키 추출

### 3-1. 카카오 파트너센터 쿠키

1. Chrome 으로 https://business.kakao.com/_VGAQn/chats 접속 후 정상 로그인
2. DevTools 열기 (Cmd+Opt+I)
3. **Application** 탭 → Storage → Cookies → `https://business.kakao.com`
4. 모든 쿠키를 복사. 가장 빠른 방법: **Network 탭** 에서 아무 `/api/...` XHR 클릭 → **Request Headers** → `cookie:` 값을 통째로 복사
5. 쿠키 문자열 예시:
   ```
   _kawlt=...; _kawltea=...; _karmt=...; TIARA=...; _T=...
   ```

### 3-2. Profile ID

URL 의 `/_VGAQn/` 부분이 profile ID. 본인 채널이 다르면 확인.

### 3-3. Supabase service_role key

Supabase Dashboard → Project Settings → API → `service_role` `secret` 키 복사.

> ⚠️ 이 키는 RLS 를 완전히 우회. 절대 git/브라우저/Slack 에 올리지 말 것.

### 3-4. `.env.local` 작성

저장소 루트에 `.env.local` 생성 (이미 `.gitignore` 됨):

```bash
KAKAO_PARTNER_PROFILE_ID=_VGAQn
KAKAO_PARTNER_COOKIE='_kawlt=...; _kawltea=...; ...'
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

쿠키에 작은따옴표 또는 큰따옴표를 꼭 감싸기 (세미콜론 때문에 깨짐).

---

## 4. 부트스트랩 (1회)

```bash
npm run kakao:bootstrap
```

기대 출력:
```
[auth] logged in as basis9@kakao.com
[page 0] received=37 new=37 upserted=37
[done] totalChats=37 upserted=37
```

Supabase 에서 확인:
```sql
select count(*), max(last_log_send_at) from kakao_partner_chats;
```

---

## 5. 실시간 스트림 (폐기됨, 2026-07-06)

> ⚠️ 이 섹션이 설명하던 `scripts/kakao-partner-stream.mjs`(단일 채널) /
> `kakao-partner-multi-stream.mjs`(멀티채널 supervisor) / `com.amswiki.kakao-stream.plist`
> launchd 데몬은 **삭제됨**. 회사 자산 맥 스튜디오(데스크탑)가 켜져 있을 때만 도는
> 구조라 절전 모드가 되거나 종료되면 수집이 멈추는 근본 한계가 있었고, 지금은
> **Supabase Edge Function `kakao-collect`가 pg_cron으로 5분마다 자동 실행**되며
> 이 역할을 대체한다(맥 스튜디오 상태와 완전히 무관, CLAUDE.md §16 참고). 남겨야
> 할 것은 **§7의 쿠키 자동 갱신(6시간마다)
> 뿐**이다 — `kakao-collect`가 Supabase에 저장된 쿠키를 읽어 쓰므로, 그 쿠키를
> 최신으로 유지하는 이 갱신 작업은 계속 필요하다.

---

## 6. 동작 확인 SQL

```sql
-- 최근 수집된 메시지 20건
select sent_at, chat_id, sender_type, left(message, 60) as preview
from kakao_partner_messages
order by sent_at desc
limit 20;

-- 스트림 상태
select * from kakao_partner_stream_state;

-- 미응답 채팅
select chat_id, nickname, last_message, last_log_send_at
from kakao_partner_chats
where is_done = false and is_read = false
order by last_log_send_at desc;
```

---

## 7. 쿠키 만료 자가복구 (수집 멈춤 방지)

쿠키는 보통 1~4주면 만료된다. 과거엔 만료 시 데몬이 시작 단계 `me()` 401 에서
`process.exit(1)` 으로 죽고, supervisor 가 5초마다 무한 재시작(폭주)하거나, 폴링이
조용히 멈춰 **수집이 영구 정지**했다. 이제 다음과 같이 스스로 복구한다.

6시간마다 쿠키를 미리 갱신해 만료 자체를 예방(launchd 스케줄):
```bash
cp scripts/launchd/com.amswiki.kakao-cookie-refresh.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.amswiki.kakao-cookie-refresh.plist
```
(값이 바뀐 경우에만 `.env.local` 갱신하며, 데몬은 끊지 않음 — 다음 401 때 재읽음.)
전제: **Chrome 으로 business.kakao.com 로그인 유지** + 최초 1회 키체인(Chrome Safe Storage) 허용.

수집 상태 점검:
```bash
npm run kakao:status   # ✅ok / ⚠️STALE + heartbeat + last_error 표시
```

### 그 외 증상

| 증상 | 원인 | 해결 |
|---|---|---|
| `⚠️STALE` + `last_error: auth 401` | 쿠키 만료 | Chrome 으로 카카오 재로그인 (다음 6시간 주기 또는 수동 `npm run kakao:refresh-cookie` 로 픽업) |
| `HTTP 403 /chats/search` | 권한 부족 | 매니저 권한 가진 계정으로 재로그인 |
| `cookie refresh unavailable` | macOS 아님 / Chrome 로그아웃 | Chrome 재로그인 또는 수동 `npm run kakao:refresh-cookie` |

---

## 8. 보안 / ToS 주의

- 카카오 비즈니스 약관에 자동화 도구 명시 금지가 있는지 사용 전 확인 권장.
- **본인 계정의 본인 데이터** 수집용. 타인 채널/계정 데이터 수집 금지.
- 트래픽 패턴: 5분 간격 REST 증분 폴링 + jitter. 더 공격적으로 설정 시
  카카오 측 어뷰즈 탐지에 걸릴 수 있음.
- 쿠키 노출 시 **계정 탈취** 가능. `.env.local` 는 절대 commit 금지 (이미 무시됨).

---

## 9. 다음 작업 (PR 단위)

1. payload 구조 확정 후 `_handlePayload()` 의 휴리스틱을 정식 매핑으로 교체
2. (폐기) ~~`useCSInsightsLive` 에 `kakao_partner_messages` 소스 추가~~ — 해당 훅과
   집계 뷰(kakao_category_stats/kakao_daily_volume)는 삭제됨. 관리자 분석은
   `get_*_distribution` RPC + `kakao_analytics_cache` 경로로 대체됨.
3. 메시지 첨부파일 (이미지) 의 카카오 CDN 만료 대응 — Supabase Storage 미러링
4. 갭 백필: `last_seen_log_id` 와 REST `last_log_id` 비교해서 누락 감지 시 알림

---

## 10. GitHub Actions 상시 수집 (과거 방식 — 지금은 §5 참고)

> ⚠️ 이 섹션은 §5의 launchd 데몬을 대체하려던 과거 시도의 기록이다. **지금은 §5에
> 적었듯 Supabase Edge Function `kakao-collect`(pg_cron, 5분마다)가 상시 수집을
> 전담**하므로, 아래 GitHub Actions 경로는 실제로는 안 쓰인다. 쿠키 출처·배달
> 메커니즘(§10-3, §11) 설명은 지금도 유효해 남겨둔다.

launchd 데몬은 맥 스튜디오가 켜져 있을 때만 돌아 매일 수집이 끊긴다. 실측상 실제 수집은
**100% REST 증분 폴링** 으로만 이뤄지므로(WS push 적재 0건), 그 폴링 1사이클을 떼어낸
`scripts/kakao-partner-collect-once.mjs` 를 **항상 켜진 GitHub Actions 가 5분마다 호출**하면
맥 스튜디오 상태와 무관하게 끊김 없이 수집된다. (public 저장소라 Actions 무료·무제한)

워크플로: `.github/workflows/kakao-collect.yml`

### 10-1. 저장소 Secret 등록 (1회)

GitHub → 저장소 → **Settings → Secrets and variables → Actions → New repository secret** 에서 3개 추가:

| 이름 | 값 | 비고 |
|---|---|---|
| `KAKAO_PARTNER_COOKIE` | 파트너센터 로그인 쿠키 (§3-1 방식으로 추출) | 보통 1~4주마다 갱신 필요 |
| `SUPABASE_URL` | `https://xxxx.supabase.co` | |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role 키 (§3-3) | **절대 공개 금지** |

채널이 기본 3개(`_VGAQn,_TkpPG,_xfxilXn`)와 다르면 **Variables** 탭에
`KAKAO_PARTNER_PROFILE_IDS` 를 CSV 로 추가(코드 수정 불필요).

### 10-2. 가동

- 워크플로는 **`main` 브랜치에 머지된 뒤부터** 5분마다 자동 실행된다.
- 즉시 1회 테스트: Actions 탭 → "카카오 상담 수집 (5분마다)" → **Run workflow**.
- 수집 확인: `npm run kakao:status` 또는 §6 SQL.

### 10-3. 쿠키 출처 & 만료 대응

수집기의 쿠키 출처는 ① **Supabase 보관함**(`kakao_partner_secrets`, 맥 스튜디오 Chrome 이
자동 배달 — **§11**) 우선, 없으면 ② **GitHub Secret `KAKAO_PARTNER_COOKIE`**(폴백) 순이다.

- **§11 자동 배달을 켜두면** 보관함 쿠키가 항상 최신이라 **수동 갱신이 사실상 사라진다.**
- 둘 다 만료된 경우에만 수집기가 `me()` 에서 401/403 → **워크플로 "실패" → 알림 메일**.
  그때 Chrome 으로 재로그인하면(맥 스튜디오) §11 배달이 다음 주기에 자동 픽업하거나, 급하면
  **Settings → Secrets → `KAKAO_PARTNER_COOKIE`** 를 수동 갱신한다.

### 10-4. launchd 데몬 정리

GitHub 수집이 며칠간 정상 확인되면 **상시 수집 데몬은 꺼도 된다**(둘 다 켜둬도 멱등
upsert 라 중복 없음):
```bash
launchctl unload ~/Library/LaunchAgents/com.amswiki.kakao-stream.plist
```
단, **쿠키 자동 배달(§11)을 쓴다면 `com.amswiki.kakao-cookie-refresh` 는 끄지 말 것** —
이 6시간 잡이 최신 쿠키를 Supabase 로 배달하는 "쿠키 배달부"다. (만료 시 수동 갱신만 할
거라면 이 잡도 꺼도 된다.)

### 10-5. 한계 / 주의

- **주기**: GitHub Actions cron 최소 간격은 5분이며, 깃허브 부하 시 더 지연될 수 있다
  (분 단위 실시간은 아님). 증분 폴링이 변경 채팅의 최근 200건을 재수집하므로 5~15분
  지연은 데이터 누락 없이 메워진다.
- **IP**: GitHub 데이터센터 IP 로 접속하므로, 카카오 어뷰즈 탐지에 걸리면 차단될 소지가
  주거용 IP 보다 약간 높다. 차단 시 `me()` 가 403 → 위 알림 메일로 감지된다.
- **쿠키 갱신**: §11 자동 배달을 켜면 거의 무인 운영. 안 켜면 만료 시 §10-3 으로 수동(월 1회 안팎).

---

## 11. ✅ 쿠키 자동 배달 (만료 수동 갱신 제거)

**문제**: GitHub Secret 의 쿠키는 1~4주면 만료 → 수동 교체가 번거롭다.
**해결**: 맥 스튜디오 Chrome 은 로그인이 살아있는 한 항상 유효한 쿠키를 갖는다. 이를 6시간마다
꺼내 **Supabase 보관함(`kakao_partner_secrets`)에 자동 배달**하고, GitHub 수집기가 매 실행 시
거기서 최신 쿠키를 읽는다. → 쿠키 복사 작업이 사라진다.

```
맥 스튜디오 Chrome(로그인 유지) ──6h──▶ kakao-partner-refresh-cookie.mjs
                                  ├─ .env.local 갱신 (로컬 데몬용)
                                  └─ Supabase kakao_partner_secrets 로 upsert   ← 자동 배달
                                                   │
GitHub Actions 수집기 ──5분──▶ kakao_partner_secrets 에서 최신 쿠키 read → 사용
```

### 켜는 법

1. **마이그레이션 적용**(1회): `supabase/migrations/20260617_kakao_partner_secrets.sql`
   (Supabase Dashboard → SQL Editor 붙여넣고 RUN). RLS 활성 + 정책 0 → **service_role 전용**(외부 접근 차단).
2. **맥 스튜디오에 6시간 쿠키 잡 설치/유지**:
   ```bash
   cp scripts/launchd/com.amswiki.kakao-cookie-refresh.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/com.amswiki.kakao-cookie-refresh.plist
   ```
   전제: Chrome 으로 business.kakao.com 로그인 유지 + 최초 1회 "Chrome Safe Storage" 키체인 허용.
3. **즉시 첫 배달**(선택): `npm run kakao:refresh-cookie`
   → 로그에 `Supabase 보관함에 쿠키 배달 완료` 가 뜨면 성공. 이후 GitHub 실행 로그엔
   `cookie source: supabase (updated …)` 로 찍힌다.

### 동작 보장

- 맥 스튜디오는 회사 자산 데스크탑으로 상시 켜두는 게 원칙이지만, 재부팅 등으로
  잠깐 꺼졌다 켜져도 쿠키 수명(1~4주) 안에 6시간 잡이 한 번만 돌면 보관함 쿠키가
  갱신된다. 수집 자체는 그 상태와 무관하게 GitHub 에서 계속된다.
- 맥 스튜디오가 오래 꺼져 보관함·Secret 둘 다 만료되면 → §10-3 알림 메일로 감지된다.
- 배달되는 쿠키는 계정 로그인 권한과 동등 → 테이블은 RLS 로 service_role 외 접근 차단(위 1번).

---

## 12. ✅ Supabase 예약 트리거 (GitHub cron 지연 보완 — 더 확실한 자동장치)

**문제**: §10 의 GitHub Actions `schedule` 은 무료 러너 부하에 따라 첫 실행이 수십 분~수
시간 밀리거나 건너뛰는 경우가 있다(특히 새로 머지된 워크플로). "5분마다"가 보장되지 않는다.

**해결**: 항상 켜져 있고 분 단위로 정확한 **Supabase pg_cron** 이 5분마다 GitHub 의
`workflow_dispatch` 를 직접 호출해 수집 워크플로를 깨운다. GitHub 자체 cron 은 백업으로 둔다.

```
Supabase pg_cron(*/5)  ──▶  pg_net.http_post  ──▶  GitHub workflow_dispatch  ──▶  kakao-collect.yml 실행
   (항상 켜진 DB)          (Vault 의 PAT 로 인증)        (204 = 접수 성공)            (검증된 수집 1사이클)
```

설정 SQL: `supabase/migrations/20260617_kakao_collect_pg_cron_dispatch.sql`
(확장 `pg_cron`/`pg_net` 활성 + `kakao-collect-dispatch` 잡 등록. 멱등.)

### 12-1. 설치 (1회)

1. **GitHub Fine-grained PAT 발급** — https://github.com/settings/personal-access-tokens/new
   - Repository access: **Only select repositories → `sdij-wiki`**
   - Permissions → Repository permissions → **`Actions`: Read and write**
   - Generate → `github_pat_...` 복사(이 화면에서만 보임).
2. **PAT 를 Supabase Vault 에 저장**(값은 저장소에 두지 않는다) — Dashboard → SQL Editor:
   ```sql
   select vault.create_secret(
     '여기에_PAT_붙여넣기', 'github_actions_pat', 'kakao-collect 5분 디스패치용 GitHub PAT');
   ```
   이미 있으면 교체:
   ```sql
   select vault.update_secret(
     (select id from vault.secrets where name = 'github_actions_pat'),
     '여기에_새_PAT', 'github_actions_pat', 'kakao-collect 5분 디스패치용 GitHub PAT');
   ```
3. **마이그레이션 적용**(잡 등록) — 위 SQL 파일 전체를 SQL Editor 에 붙여넣고 RUN.
   잡은 Vault 에 PAT 가 있을 때만 호출하므로 2↔3 순서는 무관하다.

### 12-2. 동작/점검

```sql
-- 잡 실행 이력(5분 간격으로 succeeded 가 쌓이면 정상)
select status, return_message, start_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname='kakao-collect-dispatch')
order by start_time desc limit 10;

-- GitHub 호출 응답(204 = dispatch 접수 성공)
select id, status_code, created from net._http_response order by created desc limit 10;
```
GitHub 쪽은 Actions 탭에 `event: workflow_dispatch` 실행이 5분 간격으로 찍힌다.

### 12-3. 일시중지 / 토큰 만료

- **중지**: `select cron.unschedule('kakao-collect-dispatch');`
- **PAT 만료**(발급 시 만료기한 지정한 경우): dispatch 응답이 **401** 로 바뀌고 수집이
  멈춘다 → §12-1 의 `update_secret` 으로 새 PAT 로 교체. (만료 없는 PAT 를 쓰면 무인 운영.)
- §10 의 GitHub 자체 schedule 백업은 그대로라, Supabase 트리거가 멈춰도 GitHub 이
  (지연은 있어도) 최소한의 수집은 이어간다.

---

## 13. ✅ 분류·이상탐지 자동화 (2026-07-02)

**문제**: 수집(§1~12)은 상시 자동화돼 있었지만, **분류(category)·감정(sentiment)은 사람이
`npm run classify:kakao:db` 를 수동 실행해야만 동작**했다. 실측 결과 분류는 2026-06-17
단 하루만 돌고 완전히 멈춰 신규 채팅 207건이 미분류로 방치돼 있었고, 감정분석은 40,261건의
user 메시지 중 **0건**이었다(`analysis/outputs/05_상담분류_고도화.md`·`00_운영화_체크리스트.md`의
"남은 과제"). 또한 이상탐지 SQL(`analysis/outputs/08_이상탐지_알림.md`)은 검증만 됐을 뿐
실제 알림 발송은 없었다.

**해결**: 수집과 동일한 pg_cron → Edge Function 패턴으로 두 함수를 추가했다.

```
Supabase pg_cron(15분) ──▶ Edge Function kakao-classify ──▶ chats.category / messages.sentiment
Supabase pg_cron(10분) ──▶ Edge Function kakao-alert     ──▶ Slack(선택) + kakao_partner_alert_state
```

### 13-1. kakao-classify — 분류·감정 자동화

- **입력 개선**: `chats.last_message`(대개 상담원의 종료 인사) 대신, 그 대화의 **첫 user
  메시지**(실제 문의 내용)를 기준으로 분류한다(`05_상담분류_고도화.md` §8 실측 발견 반영).
- **2단계 폴백(자동 감지, 재배포 불필요)**:
  - `ANTHROPIC_API_KEY` 시크릿이 있으면 → Claude Haiku few-shot 분류(연속 신뢰도).
  - 없으면 → 재구성 키워드 규칙(confidence 0.70/0.30 컨벤션 유지).
- **처리 대상**: ① 신규 미분류 채팅 ② 레거시 '기타'(confidence=0.30) 재검토 큐(한 번 처리되면
  다시 안 걸림 — 수렴) ③ 감정 미분류 user 메시지(최신순). 확정 분류(0.70)는 절대 안 건드림.
- **적용 마이그레이션**: `supabase/migrations/20260702_kakao_classify_pipeline.sql`
  (`category_model`/`sentiment_model` 컬럼 + `kakao_classify_token` 발급 + pg_cron 등록).
- **함수 배포**: `supabase functions deploy kakao-classify --no-verify-jwt`

**LLM 분류로 격상하려면(선택)**: Supabase Dashboard → Edge Functions → **kakao-classify** →
Secrets → `ANTHROPIC_API_KEY` 추가. 다음 실행부터 자동 적용(비용은 05번 문서 §6-1 참고).

### 13-2. kakao-alert — 이상탐지 Slack 알림

- **감지 2종**: (A) 카테고리 급증(오늘자, 직전 7일 평균 대비) (B) 수집 중단
  (heartbeat + 최근 에러 + 메시지 공백을 함께 판정 — "심장은 뛰는데 데이터 0" 함정 방지).
- **중복 억제**: `kakao_partner_alert_state` 테이블에 사고별 상태 저장 — 같은 사고는
  쿨다운(1시간) 내 1회만, 해소되면 "복구" 알림 1회.
- **적용 마이그레이션**: `supabase/migrations/20260702_kakao_alert_pipeline.sql`
  (`kakao_collection_health()`/`kakao_category_spike()` RPC + `kakao_partner_alert_state`
  테이블 + `kakao_alert_token` 발급 + pg_cron 등록).
- **함수 배포**: `supabase functions deploy kakao-alert --no-verify-jwt`

**Slack 알림을 받으려면(선택)**: Slack에서 Incoming Webhook URL 발급 → Supabase Dashboard →
Edge Functions → **kakao-alert** → Secrets → `SLACK_WEBHOOK_URL` 추가. 미등록 상태에서도
함수는 정상 동작하며 로그와 `kakao_partner_alert_state` 테이블에는 계속 기록된다(대시보드 등에서
나중에 조회 가능).

### 13-3. 점검 SQL

```sql
-- 분류 진행 상황
select category_model, count(*) from kakao_partner_chats group by 1 order by 2 desc;
select count(*) from kakao_partner_chats where category is null;                              -- 미분류 잔여
select count(*) from kakao_partner_messages where sender_type='user' and sentiment is null;    -- 감정 미분류 잔여

-- 이상탐지 현재 상태
select * from kakao_collection_health();
select * from kakao_category_spike();
select * from kakao_partner_alert_state order by updated_at desc;

-- 두 잡 모두 정상 등록됐는지
select jobname, schedule, active from cron.job
where jobname in ('kakao-classify-dispatch','kakao-alert-dispatch');
```
