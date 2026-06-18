# data/ — 마이클래스 챗봇 근거 집계 (비PII)

> **최신 갱신: 2026-06-18** — 원본 11개 암호화 xlsx(AMS 상담 424,200행)를 직접 복호화·재집계 + 카카오 CSV + Supabase 라이브 + GA4 실측으로 전면 재생성.
> 모든 파일은 **집계·빈도만**. 이름·전화·상담원문 등 **PII는 일절 포함하지 않음**. 해석은 [`../DATA_ANALYSIS.md` §0](../DATA_ANALYSIS.md) 참조.

## 파일 색인

| 파일 | 내용 | 출처 |
|---|---|---|
| `ams_대분류.csv` | 12 대분류 빈도·비중 | AMS 상담 424,200 |
| `ams_중분류.csv` | 대분류×중분류 전수(95종) | AMS |
| `ams_상담대상.csv` | 학부모/학생 분포 | AMS |
| `ams_접수형태.csv` | 전화/방문/문자/게시판 | AMS |
| `ams_학년.csv` | 학년 분포 | AMS |
| `ams_월별_총건수.csv` | 2026 1~6월 총 상담 추세 | AMS |
| `ams_월별_대분류.csv` | 월×대분류 교차(추세) | AMS |
| `ams_menu_category.csv` | **챗봇 8메뉴별 흡수잠재(deflection)** | AMS 매핑 |
| `kakao_마이클래스_인텐트.csv` | 카톡 채널 고객 인텐트(대화등장률) | 카카오 CSV |
| `supabase_상담유형_라이브.csv` | 카카오 비즈채팅 category 분포(라이브) | Supabase `kakao_partner_*` |
| `ga_핵심지표.csv` | 세션·기기·결제퍼널·상위페이지 | GA4 BigQuery |
| `통합_3채널비교.csv` | **전화 vs 채팅 vs 라이브 구조 비교** | 3소스 |

## 재현
- AMS 복호화·집계: 암호 `20260617` → `msoffcrypto` 복호화 → `python-calamine` 적재 → 비PII 열만 집계.
- 원본 PII 파일은 저장소에 **두지 않음**(로컬 `/tmp`에서만 처리 후 폐기).

## 한계 (DATA_ANALYSIS §0.6)
6월은 6/17까지(부분) · 챗봇 미배포라 추세를 챗봇 효과로 귀속 금지 · 채널별 분모 상이 · AMS는 대치단과 단일 지점 · Supabase sentiment 미적재.
