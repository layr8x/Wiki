# AMS 챗봇(BETA) 상단 알림 바, 결정 보고 패키지

한 줄 요약: 7/15 회의 미결 3건(노출 개수, 유지 기간, 넘김 방식)을 업계 14곳 실측 근거로 종결한 결정 보고 패키지다. 컨플루언스 본문(md), 근거 도표 PNG 7종, 결정 덱(HTML/PDF 16장)이 확정 상태이고, 남은 일은 컨플루언스 업로드뿐이다.

전체 맥락과 확정 수치, 도메인 규칙은 `HANDOFF_클로드코드_이관.md`(인수인계서 정본)를 먼저 읽을 것. 이 README는 클라우드 세션에서 이 저장소로 이관하며 달라진 점만 기록한다.

## 이관하며 달라진 점 (2026-07-22)

1. 경로 상대화: `build_deck.py`, `gen_chart_html.py`와 스크린샷 스크립트 3종에 박혀 있던 클라우드 세션 절대경로(`/home/claude/work/...`)를 스크립트 위치 기준 상대경로로 수정. 이제 어느 환경에서든 그대로 실행된다.
2. 확장자 변경: 이 저장소는 package.json이 ESM 모드(`"type": "module"`)라서 CommonJS 스크립트는 `.js`로 실행이 안 된다. `shot_deck.js`, `pdf_deck.js`, `shot_each.js`를 각각 `.cjs`로 개명했다. 인수인계서 3장의 명령어도 아래처럼 읽을 것.
3. Pillow 불필요: 인수인계서 3장의 전제 "Python3 + Pillow"에서 Pillow(파이썬 이미지 라이브러리)는 실제로 어떤 스크립트도 import하지 않는다. Python3 표준 라이브러리만 있으면 된다.
4. 브라우저 경로: 스크린샷 스크립트는 기본으로 `/opt/pw-browsers/chromium`을 쓰고, 다른 환경에서는 환경변수 `PW_CHROMIUM`으로 크로미움 실행 파일 경로를 넘기면 된다.

## 재빌드 명령 (이 폴더에서 실행)

```bash
python3 build_deck.py          # 덱 HTML 생성
node shot_deck.cjs             # 슬라이드 16장 PNG (deck_01..16.png)
node pdf_deck.cjs              # 덱 PDF (16쪽, 960x540pt)
python3 gen_chart_html.py      # 도표 카드 HTML 생성 (charts_png/)
node shot_each.cjs             # 도표 PNG 7종 (charts_png/*.png)
# 차트 zip 갱신:  zip -jq 260720_컨플루언스_차트.zip charts_png/*.png
```

원칙 유지: 산출물 HTML/PNG를 직접 고치지 않는다. 생성기(`charts.py`, `build_deck.py`)를 고치고 재빌드한다.

## 이관 검증 결과 (2026-07-22, 이 저장소 환경)

- 덱 HTML 재생성 결과가 배포본과 바이트 단위 완전 일치 (생성기와 산출물 동기화 확인)
- 도표 PNG 7종 재생성 결과가 zip 안 배포본 7종과 모두 바이트 단위 완전 일치
- PDF 16쪽, 960x540pt 규격 일치
- 슬라이드 스크린샷 16장 정상 렌더 (Pretendard 임베드 폰트, 캡처 이미지 포함)

`deck_*.png`와 `charts_png/`는 재생성 가능한 중간 산출물이라 커밋하지 않는다(.gitignore 처리).
