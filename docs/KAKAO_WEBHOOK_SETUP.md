# 카카오 채널 실시간 Webhook 설정 가이드

학부모가 카카오톡으로 보낸 모든 문의를 **자동 분류 → Supabase 저장 → AMS 위키 통계에 실시간 반영**하는 시스템을 구축하는 절차입니다.

## 0. 전체 아키텍처

```
[학부모 카카오톡]
       │ (자유 발화)
       ▼
[카카오 i 오픈빌더 챗봇]
   ├ 시나리오: 폴백 블록
   └ 스킬: ams-kakao-webhook (HTTP)
       │ POST payload {userRequest:{user,utterance,...}}
       ▼
[Supabase Edge Function: kakao-webhook]
   ├ 인증: ?token=<KAKAO_WEBHOOK_TOKEN>
   ├ 분류: classify.ts (12 카테고리 + 감정)
   └ INSERT → public.kakao_messages
       │
       ▼
[public.kakao_category_stats 뷰]   ← 90일 자동 집계
       │
       ▼
[AMS 위키: useCSInsightsLive hook]   ← 60초마다 갱신
```

## 1. DB 마이그레이션 적용

Supabase Dashboard → **SQL Editor** → 아래 파일 내용 전체 붙여넣고 실행:

```
supabase/migrations/20260512_kakao_webhook.sql
```

생성되는 객체:
- `public.kakao_messages` (테이블, RLS 활성)
- `public.kakao_category_stats` (뷰, 90일 집계)
- `public.kakao_daily_volume` (뷰, 트렌드)
- `public.kakao_unclassified_count()` (RPC)

검증:
```sql
select count(*) from public.kakao_messages;       -- 0
select * from public.kakao_category_stats;        -- 빈 결과
```

## 2. Edge Function 배포

### 2-1. Supabase CLI 설치 (1회)
```bash
npm i -g supabase
supabase login
supabase link --project-ref <YOUR_PROJECT_REF>
```

### 2-2. Secret 등록
랜덤 토큰 생성 후 등록:
```bash
TOKEN=$(openssl rand -hex 32)
echo "KAKAO_WEBHOOK_TOKEN=$TOKEN"   # 카카오 등록 시 사용, 안전한 곳에 보관
supabase secrets set KAKAO_WEBHOOK_TOKEN="$TOKEN"
```

### 2-3. 배포
```bash
supabase functions deploy kakao-webhook --no-verify-jwt
```

`--no-verify-jwt` 는 **필수**입니다. 카카오는 Supabase JWT 를 보내지 않으므로, 인증은 URL 쿼리스트링 token 으로 합니다.

### 2-4. 헬스체크
```bash
curl https://<PROJECT_REF>.supabase.co/functions/v1/kakao-webhook
# → {"status":"ok","service":"kakao-webhook"}
```

### 2-5. 로컬 테스트 (분류·저장 동작 검증)
```bash
curl -X POST \
  "https://<PROJECT_REF>.supabase.co/functions/v1/kakao-webhook?token=$TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "userRequest": {
      "user": { "id": "test_user_001" },
      "utterance": "영상이 안 나와요 너무 답답해요"
    }
  }'
# → {"version":"2.0","template":{"outputs":[{"simpleText":{"text":"영상 재생 관련 ..."}}]}}
```

DB 확인:
```sql
select category, sentiment, message from public.kakao_messages order by id desc limit 1;
-- video-content | negative | 영상이 안 나와요 너무 답답해요
```

## 3. 카카오 i 오픈빌더 webhook 등록

### 3-1. 챗봇 생성
1. https://i.kakao.com/openbuilder 접속
2. **봇 만들기** → 봇 이름 입력 (예: "AMS 학부모 상담봇")
3. **카카오톡 채널 연결** → 운영 중인 채널 선택

### 3-2. 스킬 등록 (Webhook URL)
1. 좌측 **스킬** → **스킬 생성**
2. 스킬 이름: `ams-kakao-webhook`
3. URL:
   ```
   https://<PROJECT_REF>.supabase.co/functions/v1/kakao-webhook?token=<KAKAO_WEBHOOK_TOKEN>
   ```
4. **저장**

### 3-3. 폴백 블록 연결
1. 좌측 **시나리오** → **기본 시나리오** → **폴백 블록**
2. **스킬** 선택 → `ams-kakao-webhook`
3. **응답** → "스킬 데이터로 응답" 선택
4. **저장**

### 3-4. 배포
1. 우측 상단 **배포** 클릭 → **배포하기**
2. 카카오 검수 통과 후 실제 채널에서 동작 (보통 1-2일)

## 4. 동작 확인

배포 후 본인 카카오톡으로 채널에 메시지를 보내면:
1. 카카오가 webhook 호출
2. Edge Function 이 분류 + DB insert
3. 카카오 채팅창에 자동 응답
4. Supabase SQL 에서 확인:
   ```sql
   select received_at, category_label, sentiment, message
   from public.kakao_messages
   order by received_at desc limit 5;
   ```

## 5. 위키 실시간 반영 확인

위키 페이지에서 `useCSInsightsLive()` hook 을 사용하는 컴포넌트를 열면, 60초 간격으로 최신 통계가 자동 반영됩니다.

```jsx
import { useCSInsightsLive } from '@/hooks/useCSInsightsLive'

function DashboardCard() {
  const { data, isLoading } = useCSInsightsLive()
  if (isLoading) return <Skeleton />
  return (
    <div>
      <p>출처: {data.source === 'live' ? '실시간 카카오' : '정적 데이터'}</p>
      <p>마지막 수신: {data.lastReceivedAt ?? '-'}</p>
      <ul>{data.categories.map(c => <li key={c.id}>{c.label}: {c.count}건</li>)}</ul>
    </div>
  )
}
```

## 6. 운영 체크리스트

- [ ] `KAKAO_WEBHOOK_TOKEN` 을 1Password / Vault 등에 안전 보관
- [ ] Edge Function 로그 모니터링: `supabase functions logs kakao-webhook --tail`
- [ ] 미분류(`category is null`) 메시지 주기 점검: `select kakao_unclassified_count();`
- [ ] 카테고리 룰셋 업데이트 시 `classify.ts` + `scripts/classify-kakao-csv.mjs` **양쪽 동시 수정**
- [ ] PII 정책: `user_key` 는 카카오 발급 해시지만, `message` 본문에 학부모 개인정보가 들어올 수 있음. RLS 정책 강화 검토.

## 7. 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| 401 unauthorized | URL token 불일치 | `supabase secrets list` 로 확인 후 카카오 스킬 URL 재등록 |
| 카카오에서 응답 안 옴 | `--no-verify-jwt` 누락 배포 | `supabase functions deploy kakao-webhook --no-verify-jwt` 재실행 |
| DB insert 실패 | 마이그레이션 미적용 | 1단계 SQL 재실행 |
| 중복 메시지 | external_id 없는 webhook | unique 제약은 external_id null 일 때 미적용 - 정상 |
| 위키 통계 미갱신 | 캐시 | hook `staleTime: 30s` - 강제: `queryClient.invalidateQueries(['cs-insights'])` |
