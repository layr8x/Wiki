# AMS 챗봇 알림 바 — Claude Code 이관 인수인계서

> 2026-07-21 · 김명준 · UX/UI Design · 플랫폼서비스실
> 이 문서 하나로 클라우드 세션의 모든 작업을 로컬 Claude Code에서 이어받는다. 파일 매니페스트 → 재빌드 명령 → 게이트 설치 → 확정 사실 순으로 읽으면 된다.

---

## 0. 한 줄 결론 + 이관 3단계

작업물은 **AMS 챗봇(BETA) 상단 알림 바 결정 보고 패키지**다. 컨플루언스 본문(md) + 근거 도표(PNG 7종) + 결정 덱(HTML/PDF 16장)이 완성돼 있고, 문안·대비·조형 3중 게이트를 통과했다. 남은 것은 컨플루언스 업로드와 선택적 디자인 심화뿐.

이관 체크리스트:
1. **파일 이관** — §6 매니페스트의 파일을 로컬 레포로 복사(전송 번들 zip 제공)
2. **게이트 설치** — §4의 플러그인 2종을 로컬 Claude Code에 설치(`/plugin marketplace add ...`)
3. **재빌드 확인** — §3의 `python3 build_deck.py` 한 줄로 덱이 재생성되는지 검증

---

## 1. 산출물 상태 (deliverables)

| 파일 | 상태 | 용도 |
|---|---|---|
| `260720_컨플루언스_붙여넣기.md` | **확정** (humanize-korean heavy 통과) | 컨플루언스 네이티브 페이지 본문 |
| `260720_컨플루언스_차트.zip` | **확정** (도표 PNG 7종, 화이트·2배율) | 본문 삽입용 도표 이미지 |
| `260720_AMS챗봇_알림바_결정과근거_덱.html` | **최신** (대시보드 밀도 판본) | 디자인 마스터, 편집 원본 |
| `260720_AMS챗봇_알림바_결정과근거_덱.pdf` | **최신** (16p, 960×540pt) | 컨플루언스 첨부용 |

레거시(참고용, 이관 불필요): `_최종.html/.pdf`, `_사례분석_적용스펙_점검.*`, `_결정브리프.html`, `_사례근거_확정스펙.html`.

---

## 2. 확정 결정 (BLUF) — 내용의 SSOT

7/15 회의 미결 3건을 업계 14곳 실측·공식 문서로 종결한 값. 이 수치는 절대 변경 금지(전부 각주 근거 있음).

- **노출 1건** — 상단 동시 노출은 확인 14곳 전부 1건. 뒤에 대기 2건, 전체 보기 목록 10건.
- **유지 14일** — 열람 즉시 해제 + 미열람 14일 정리 + 절대 상한 30일. 수정 시 재노출.
- **넘김 화살표** — 자동 회전 제외(노터데임대 실측: 클릭 1%의 84%가 첫 칸). 조건부 재개 기준만 보존(6초·진행 표시·정지 버튼 상시·오버 정지·조작 시 꺼짐·모바일 제외).
- **검증 D+60** — 두 번째 공지 도달률로 두 달 뒤 대기 큐 유지 판정. 미달 시 바 1건 단독 롤백.
- **반례 YBM** — 자동 회전 ON 유일 사례. 게시 간격 2~3일로 상이해 회전은 제외, 슬롯·태그 2가지만 차용.
- **거버넌스 3** — 바로가기도 소진 / MYCLASS는 게시 기준만 분리 / 기획자 작성 + 운영 UX 세 물음 게이트.
- **단일 요청(ask)** — 열람 상태 계정 저장(공수 큼)을 다음 스프린트 배정. 미열람 해제·재노출·오류 우선·도달률 측정 4가지의 선행 조건.

근거 각주 17건 전문은 컨플루언스 md 하단 "근거 자료" 참조.

---

## 3. 빌드 파이프라인 (재현 방법)

**핵심 원칙: 산출물 HTML/PNG를 직접 수정하지 않는다. 생성기(.py)를 고치고 재빌드한다.**

의존 관계:
```
charts.py  ── 도표 7종 + KPI 스파크라인 4종 + 카드 CSS(CARD_CSS = 시각 SSOT)
   │            CHARTS{} 딕셔너리 + SPARKS{} 딕셔너리 + WIDTHS{}
   ▼
build_deck.py ── 16 슬라이드 조립. charts.CARD/SPARK 주입 + CSS + 마크업
   │            font_b64.txt(Pretendard base64) 임베드
   ▼
260720_..._덱.html
```

재빌드 명령(순서대로):
```bash
python3 build_deck.py          # 덱 HTML 생성 (charts.py 자동 reload)
node shot_deck.js              # 16 슬라이드 PNG 스크린샷 (deck_01..16.png)
node pdf_deck.js               # 덱 PDF 생성 (16p, 960×540pt)
python3 gen_chart_html.py      # 컨플루언스용 도표 카드 HTML 생성
node shot_each.js              # 도표 PNG 7종 export (charts_png/*.png)
# 차트 zip:  zip -jq 260720_컨플루언스_차트.zip charts_png/*.png
```

전제: Node + Playwright Chromium(`/opt/pw-browsers/chromium`), Python3 + Pillow. 로컬 환경이면 `npx playwright install chromium` 후 shot 스크립트의 executablePath만 로컬 경로로 수정.

주의: `patch_*.py`는 세션 중 일회성 변형 스크립트(이미 charts.py/build_deck.py에 반영 완료). 이관 후 실행 금지 — 참고 이력용으로만.

---

## 4. 검증 게이트 3종 (설치·사용)

로컬 Claude Code에 아래를 설치해야 동일 워크플로가 작동한다. (클라우드 세션엔 설치돼 있으나 로컬은 별도)

### 4-1. humanize-korean (문안 게이트) — 한글 AI 티 제거
```
/plugin marketplace add epoko77-ai/im-not-ai
/plugin install humanize-korean@im-not-ai
```
- 용도: 한글 산출물 출고 전 필수 통과. shim 채점 → route 분기(light/standard/heavy) → 윤문 → verify_change_rate 게이트.
- 컨플루언스 본문은 heavy 3콜(진단→윤문→finalize) 통과: 변경률 0.0%, verdict=accept, 각주·표·수치 전량 보존 확인.
- **발견 버그(이슈화 후보)**: `metrics_v2.py:92-95` T2b 이중 피동 표층 어휘가 활용형(되어지고·되어집니다·되어져야) 미포착 → route 오판정. 재현 검체 `test_slop.txt`.

### 4-2. impeccable (조형 게이트) — 프론트엔드 디자인
```
npx impeccable install    # 또는 마켓플레이스
```
- 용도: 디자인 audit/polish/critique/bolder 등 23커맨드. `PRODUCT.md`·`DESIGN.md`를 자동 참조.
- 덱은 audit 14/20(Good) → polish로 사이드 스트라이프 보더 제거·아이콘 aria-hidden 교정 완료.
- 기계 탐지: `node ~/.claude/skills/impeccable/scripts/detect.mjs --json <file>` (페이지 번호 오탐 1건뿐, 무해).

### 4-3. dataviz (대비 게이트) — 팔레트 검증
- 내장 스킬. 도표 색 변경 시 `scripts/validate_palette.js`로 WCAG 재통과 필수.
- 현재 전 색 통과: 라이트 최저 4.26:1, navy 히어로 위 최저 5.86:1.

---

## 5. 디자인 시스템 (DESIGN.md 요약)

전체는 `DESIGN.md` 참조. 핵심만:

- **테마**: 라이트 단일. **다크 금지**(사용자 확정).
- **투 톤 의미 체계**: 블루 `#1f4fd6` = 우리 결정 / 웜 `#cd3f14` = 위험·반례 데이터(84% 도넛, 1%·20% 스탯).
- **토큰**: INK #12141c / INK3 #6b7280 / canvas #eef0f4 / card #fff·#e7e9ef / good #0f7a45 / navy(히어로) #101b3c / TRACK #edeff4 / DGRAY(데이터 그레이) #868e9c.
- **서체**: Pretendard Variable(45–920) `font_b64.txt`로 base64 임베드. **CDN 금지**(열람 환경 미로드). `tabular-nums` 전역.
- **레퍼런스 문법**: 대시보드 밀도(한 화면 다모듈), 카드 해부학(제목·설명·태그·각주), 트랙+필, 도넛 중앙 수치, 노치 미터, **KPI 카드마다 뒷받침 미니 차트(스파크라인)** — 파이낸스 카드 레퍼런스.
- **최근 결정(이 세션 마지막)**: 8라운드 실패의 근본 원인 = 밀도. 저밀도 슬라이드 → KPI 카드에 스파크라인 4종 심고 여백·거터 축소로 대시보드 밀도 확보.

---

## 6. 파일 매니페스트 (반드시 이관)

전송 번들 `AMS_이관번들.zip`에 아래를 담았다:

```
build_deck.py                        # 덱 생성기
charts.py                            # 도표·스파크·카드 CSS (시각 SSOT)
font_b64.txt                         # Pretendard base64 (2.7MB)
PRODUCT.md                           # impeccable 전략 컨텍스트
DESIGN.md                            # impeccable 시각 컨텍스트
shot_deck.js  pdf_deck.js            # 덱 스크린샷·PDF 스크립트
gen_chart_html.py  shot_each.js      # 도표 export 스크립트
shots/screen_after.png               # 14쪽 화면 반영 캡처
shots/ybm_rolling.jpg                # 9쪽 반례 캡처
260720_컨플루언스_붙여넣기.md          # 확정 본문
260720_AMS챗봇_알림바_결정과근거_덱.html/.pdf   # 최신 산출물
260720_컨플루언스_차트.zip             # 도표 PNG 7종
```

---

## 7. Figma 상태

- **파일**: `6PSg6RlWrjpnNYk1zirmUp`
- **화면 2389:5237**(01-1 온보딩 검색) 반영 완료 — DS Notification 인스턴스(마스터 무손상), 실제 위키 콘텐츠, 목록·상태세트·결정패널 DS 100%(140 fill 전수 바인딩), D+60 게이트 반영.
- Atlassian API/MCP 전면 불가(회사 정책) — 데이터는 Claude in Chrome 또는 수동 export만.

---

## 8. 도메인 규칙 (절대 준수)

- 서명 표기: **`김명준 · UX/UI Design · 플랫폼서비스실`만**(가운뎃점 유지, Lead/Head/Owner 금지).
- 시대인재 영문 = **SDIJ**(SIDAE INJAE 풀표기 금지). 디자인 시스템 정식명 = **myclass.designsystem**.
- Figma: `figma.currentPage` 신뢰 금지 → `getNodeByIdAsync` 명시 참조. 인스턴스 연결 파괴 금지. 마스터 무손상.
- BigQuery: `myclass-data-warehouse / analytics_475820948`, `_TABLE_SUFFIX IN (...)` 필수, `funnel_daily` 금지.
- 금칙 어휘(과거 지적): 다툰·못 박아·못 박습니다. 미측정 값 추정 금지("미측정" 명시).
- 특수기호 프로즈 남발 금지(·나열, —, ①②③, →). 문안은 humanize-korean 통과 후 출고.

---

## 9. 다음 행동 (우선순위)

1. **[지금]** 컨플루언스 업로드 — md 본문 붙여넣기 + PDF 첨부 + 도표 PNG 7종 삽입.
2. **[선택]** 디자인 심화 — 밀도 패턴(스파크라인)을 다른 증거 슬라이드(6·7·8)로 확장. `/impeccable critique <슬라이드>` 또는 `bolder`로 지정.
3. **[선택]** humanize-korean T2b 버그 GitHub 이슈화(재현 검체 `test_slop.txt` 첨부).
4. **[대기]** 개발 리드와 열람 상태 계정 저장 공수 산정 → 스프린트 배정 확정.

---

## 부록: 세션 이력 요약

이 산출물은 8+ 라운드 반복의 결과다. 주요 전환점: (1) 보고서 → 레퍼런스 문법 16:9 덱 전환, (2) 다크→라이트 + Pretendard 임베드, (3) 컨플루언스 본문 humanize heavy 통과, (4) impeccable init/audit/polish, (5) 밀도 근본 원인 규명 → KPI 스파크라인. 실패 교훈: "디벨롭"류 모호 지시보다 "이 레퍼런스 구도로 이 슬라이드" 픽셀 단위 지정이 명중률이 높다.
