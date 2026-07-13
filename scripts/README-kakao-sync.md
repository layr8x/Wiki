# 카카오 비즈니스 채팅 자동 수집 (`sync-kakao-chats.mjs`)

마이클래스 CS 분석 데이터셋(`src/data/csInsights.js`)의 원본인 카카오 비즈니스 채팅 CSV를 **사용자 PC에서 자동 추출**하기 위한 Playwright 스크립트입니다.

기존에는 사용자가 카카오 비즈니스 어드민에서 수동으로 export → 첨부 → 분석을 반복했지만, 본 스크립트는 한 번 세션 쿠키만 등록해두면 명령 한 줄로 최신 채팅을 CSV로 떨어뜨립니다.

> **⚠️ 본 스크립트는 사용자 본인이 본인의 카카오 채널 데이터를 본인 PC에서 추출하기 위한 도구입니다.** 카카오 비즈니스 ToS 검토 후 사용하세요. 추출된 CSV에는 학생/학부모 개인정보가 포함될 수 있어 기본적으로 PII 마스킹이 ON으로 설정되어 있습니다.

---

## 1. 사전 준비

```bash
# 의존성 설치 (이미 되어있으면 생략)
npm install

# Playwright 브라우저 바이너리 설치 (1회만)
npx playwright install chromium
```

---

## 2. 카카오 비즈니스 세션 쿠키 추출

1. **Chrome**으로 https://business.kakao.com 로그인 (평소처럼)
2. 채팅 페이지로 이동: `https://business.kakao.com/_VGAQn/chats` (`_VGAQn` 부분이 채널 ID)
3. **DevTools** 열기: `F12` 또는 `⌘+Option+I`
4. **Console** 탭에서 입력:
   ```js
   document.cookie
   ```
5. 따옴표 안의 **전체 문자열을 복사** (예: `"_kawlt=ABC...; _kahai=XYZ...; ..."`)

---

## 3. `.env.local` 설정

프로젝트 루트의 `.env.local` 파일에 다음을 추가 (없으면 생성):

```bash
# 필수
KAKAO_BUSINESS_COOKIE=_kawlt=ABC...; _kahai=XYZ...; KAKAO_TOKEN=...
KAKAO_CHANNEL_ID=_VGAQn

# 선택
KAKAO_OUTPUT_CSV=data/kakao-chats-2026-05-12.csv  # 기본: 오늘 날짜
KAKAO_MAX_THREADS=0                                # 기본: 전체
KAKAO_HEADLESS=true                                # false 시 브라우저 창 표시 (디버그)
KAKAO_MASK_PII=true                                # false 시 마스킹 안함 (보안 주의)
KAKAO_SINCE_DAYS=0                                 # 30 → 최근 30일만
```

> **🔒 보안**: `.env.local`은 이미 `.gitignore`에 포함되어 있어 절대 git에 커밋되지 않습니다. 그래도 쿠키 문자열을 절대 어디에도 공유하지 마세요 (= 사용자 카카오 계정 로그인 권한).

---

## 4. 실행

```bash
node scripts/sync-kakao-chats.mjs
```

성공 시 출력:
```
[kakao-sync] headless=true, mask_pii=true, since_days=all, max=all
[kakao-sync] channel: _VGAQn
[kakao-sync] 로그인 세션 검증 중...
[kakao-sync] 채팅 목록 로딩 대기...
[kakao-sync] 전체 채팅 목록 로드 중 (스크롤)...
[kakao-sync] 발견된 채팅 thread: 1247건
[kakao-sync] 진행: 10/1247 thread, 누적 메시지 87건
...
[kakao-sync] ✅ 10532개 메시지 → data/kakao-chats-2026-05-12.csv (124.3s)
```

---

## 5. 출력 CSV 구조

| 컬럼 | 설명 |
|---|---|
| `thread_index` | 채팅방 순번 |
| `thread_title` | 채팅방 제목 (학부모 이름 등 - 자동 마스킹) |
| `message_time` | 메시지 발송 시각 |
| `sender_type` | `상담원` / `고객` / `unknown` |
| `sender_name` | 발신자 (자동 마스킹) |
| `message` | 메시지 본문 (휴대폰·이메일 자동 마스킹) |

---

## 6. 분석 파이프라인 연동 (end-to-end 자동화)

본 저장소는 **Python 의존성 없이 Node.js 만으로 동작하는 end-to-end 파이프라인**을 제공합니다:

### 한 번에 실행 (권장)
```bash
npm run cs-pipeline       # 수집 → 분류 → 위키 갱신 → seed 재생성 자동 수행
```

### 단계별 수동 실행
```bash
# (1) 수집: 카카오 비즈니스 → CSV
npm run sync:kakao-chats

# (2) 분류: CSV → 12 카테고리 + 감정 + 통계 (analyze.py JS 포팅)
npm run classify:kakao -- data/kakao-chats-2026-05-12.csv

# (3) 위키 갱신: classify 요약 → src/data/csInsights.js 자동 패치
npm run update:cs-insights -- data/kakao-chats-2026-05-12-summary.json

# (4) DB 시드 재생성 (선택)
npm run db:seed
```

### 옵션
```bash
# 특정 CSV 지정
node scripts/run-cs-pipeline.mjs --csv data/kakao-chats-2026-05-10.csv

# 변경 미리보기 (파일 수정 안 함)
node scripts/run-cs-pipeline.mjs --dry-run

# Supabase seed 재생성 생략
node scripts/run-cs-pipeline.mjs --skip-seed
```

### 출력 파일
```
data/
  kakao-chats-2026-05-12.csv             ← (1) 수집 원본
  kakao-chats-2026-05-12-classified.csv  ← (2) 카테고리/감정 추가
  kakao-chats-2026-05-12-summary.json    ← (2) 통계 요약
src/data/csInsights.js                    ← (3) CUSTOMER_CATEGORIES 자동 갱신
supabase/seed.sql                         ← (4) DB 시드 재생성
```

---

## 7. 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| `❌ 인증 실패 - 쿠키가 만료되었거나` | 세션 쿠키 만료 (보통 7~30일) | DevTools에서 다시 추출 → `.env.local` 갱신 |
| `⚠️ 채팅 목록 셀렉터를 찾지 못했습니다` | 카카오 비즈니스 페이지 구조 변경 | `KAKAO_HEADLESS=false`로 실행해 디버그 후 스크립트 내 `SELECTORS` 객체 갱신 |
| `data/kakao-debug.png` 생성됨 | 셀렉터 매칭 실패 시 자동 캡처 | 캡처를 보고 실제 DOM 구조에 맞게 셀렉터 조정 |
| 진행이 매우 느림 | 카카오 봇 차단 (요청 간격 제한) | `sleep` 간격 늘리기 또는 IP/UA 변경 |
| reCAPTCHA 노출 | 의심 활동 감지 | `KAKAO_HEADLESS=false`로 1회 수동 통과 후 재시도 |

---

## 8. 정기 자동 실행 (선택)

```bash
# crontab -e
# 매일 새벽 3시에 자동 수집
0 3 * * * cd /path/to/ams-wiki && /usr/local/bin/node scripts/sync-kakao-chats.mjs >> data/kakao-sync.log 2>&1
```

> 단, 쿠키 만료 주기를 고려해 주기적으로 갱신해야 합니다.

---

## 9. 알려진 제약

- **카카오 비즈니스 페이지 구조는 SPA + 동적 클래스명** - DOM 셀렉터가 자주 바뀜. 본 스크립트는 휴리스틱 셀렉터를 사용하며, 실패 시 사용자가 직접 갱신해야 함.
- **API 직접 호출은 미지원** - 카카오 비즈니스의 채팅 조회 API가 공개되지 않아 DOM 스크래핑만 가능.
- **공식 export 기능과 비교** - 공식 export는 정확하지만 수동 작업, 본 스크립트는 자동이지만 페이지 변경 시 깨질 수 있음. 정기 분석은 본 스크립트, 정확도가 중요한 1회성 분석은 공식 export 권장.

---

## 변경 이력

- **2026-05-12 (v0.1)**: 초안. PR #35에서 도입.
