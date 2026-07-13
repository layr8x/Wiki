# design-audit - 챗봇 화면 ↔ Figma 디자인 대조 툴킷

마이클래스 챗봇(`public/myclass-chatbot.html` / `-parent.html`)의 화면을 **Figma 디자인과 픽셀 단위로 비교**하기 위한 도구 모음입니다. 세션마다 렌더 환경을 새로 만들지 않도록 저장소에 영구 보관합니다.

> **이게 왜 있나(비유):** 화면을 고칠 때마다 "줄자·사다리(렌더+비교 도구)"를 매번 임시로 새로 만들어 썼는데, 그걸 창고(이 폴더)에 박아둔 것. 다음엔 바로 꺼내 쓴다.

## 들어있는 것
- **`sweep.py` - "전 화면 자동 점검" (★ 한 줄 실행).** 모든 화면을 자동 렌더 + Figma 캡처와 나란히 → `out/SWEEP.png` 한 장. 캡처 없는 화면은 목록으로 알려줌.
- **`fetch_figma.py` - Figma 캡처 자동 다운로드(REST API).** `FIGMA_TOKEN` 환경변수로 screens.json의 모든 노드를 받아 `out/fig_<key>.png` 갱신. 이걸 sweep 앞에 돌리면 **완전 무인**(Claude 개입 0).
- `render.cjs` - 챗봇 화면 한 개를 **Figma 기준폭 400px + 실제 폰트 주입**으로 충실 렌더 → `out/L_<screen>.png`
- `compare.py` - Figma 스크린샷과 빌드 렌더를 **나란히(왼 Figma · 오 빌드)** 겹쳐 비교 이미지 생성(한 화면)
- `screens.json` - 화면 키 → **Figma 노드 ID + 빌드 내비게이션 경로** 지도
- `fonts/` - Pretendard(본문)·Material Symbols Rounded wght300(아이콘). 헤드리스가 CDN 차단해서 **로컬 주입 필수**

## ★ 가장 빠른 길 - 전 화면 한 번에 (sweep.py)
```bash
python3 tools/design-audit/sweep.py
#   --parent : 학부모 페이지   --no-render : 재렌더 생략(빠름)   --cols N : 줄당 화면 수
#   → out/SWEEP.png (왼=Figma · 오=빌드, 전 화면 한 장)
```
### 완전 무인(Claude 없이) - Figma 캡처도 자동
```bash
export FIGMA_TOKEN=figd_xxx          # ★ 비밀키 - 저장소(git) 금지. 환경변수/시크릿에만.
python3 tools/design-audit/fetch_figma.py   # 전 노드 캡처 자동 다운로드(REST API)
python3 tools/design-audit/sweep.py         # 대조 → out/SWEEP.png
```
- **토큰 보관**: `FIGMA_TOKEN` 환경변수로만. 영구 보관은 git이 아니라 환경설정/시크릿(예: Claude Code 환경변수, Vercel env). 토큰=비밀번호 → 노출 시 Figma에서 재발급(Regenerate).
- Claude 세션 중엔 `get_screenshot` 캐시로도 됨(`fetch_figma.py` 없이). sweep가 "Figma 캡처 없음"을 출력하면 그 노드만 받으면 됨.

## ⚠️ 시작 전 - Figma 노드가 살아있는지부터 (★ 반복 실패의 원인이었음)
- Figma 파일이 재구축되면 **노드 ID가 바뀐다.** `get_screenshot`/`get_design_context`가 `invalid node`면 = 그 노드는 **죽음**.
- 그땐 `get_metadata("1032:54")`(현재 정본 페이지 "MYCLASS_Chatbot")로 **현재 노드를 다시 찾아** `screens.json`을 갱신한다. **죽은 노드와 비교한 "맞췄다"는 무의미** (CLAUDE.md 15장).

## 빠른 사용법 (한 화면 대조)
```bash
# 0) (한 번만) Playwright 전역에 있으면 자동 탐색. 안 되면:
export NODE_PATH=$(npm root -g)

# 1) 빌드 화면 렌더 (예: 종강일)
node tools/design-audit/render.cjs time_end
#   → tools/design-audit/out/L_time_end.png  (figma node: 1540:1818 도 함께 출력)

# 2) Figma 화면 받기 - Claude 세션에서 Figma MCP 사용:
#    mcp__Figma__get_screenshot(fileKey="6PSg6RlWrjpnNYk1zirmUp", nodeId="1540:1818", maxDimension=1000)
#    반환된 URL을 curl 로 저장:
curl -sS -o tools/design-audit/out/fig_time_end.png "<반환된 URL>"

# 3) 나란히 비교
python3 tools/design-audit/compare.py \
  tools/design-audit/out/fig_time_end.png \
  tools/design-audit/out/L_time_end.png \
  tools/design-audit/out/cmp_time_end.png
#   → cmp_time_end.png 을 Read/열어서 왼(Figma)·오(빌드) 비교
```
- 헤더까지 같이 보려면 `render.cjs ... --full` + `compare.py ... 0`(fig_top=0).
- 학부모 페이지는 `render.cjs <screen> --parent`.

## Claude 세션용 메모 (디자인 정합 작업 시)
1. **정확한 토큰값**은 `mcp__Figma__get_design_context(nodeId)` 로 - dev 모드와 동일한 폰트/색/간격/radius/아이콘이 코드로 나온다. (raw 눈대중 금지)
2. **크기 비교는 반드시 폰트 주입 후**(이 툴킷이 함). 안 그러면 헤드리스 대체폰트로 "빌드가 크다"는 착시.
3. 비교는 **렌더 이미지 1:1**로. 토큰만 맞췄다고 끝 아님 - 실제 렌더가 Figma와 겹쳐야 통과.

## ⚠️ 알아둘 것
- **Figma 파일 토큰스케일 불일치**: 출결·보강 섹션(`1519:*`/`1534:*`)은 신스케일 `space/md=12`, 납부·시간표·전반(`1526`/`1530`/`1537`/`1540:*`)은 구스케일 `space/md=16`. **사용자가 16px로 통일 결정**(카드 내부 간격). 한쪽을 100% 맞추면 다른 쪽이 4px 어긋남 - 정상.
- **의도된 콘텐츠 차이(불일치 아님)**: 실제 강좌 4개(피그마 샘플 3개 더미)·실명·한글 띄어쓰기(`시청 기한`/`영상 준비 중`)·날짜 `YY/MM/DD`.
- **메뉴 진입 화면**(`m_attend`/`m_pay`/`m_time`/`m_overall`)·강좌선택(`at_course`)은 Figma에 디자인 없음(빈 템플릿) → 공통 패턴 사용.
- 빈 상태(동영상/추가영상/오늘출석 없음)는 데모 데이터가 항상 있어서 평소 미발생. 렌더하려면 데이터 비우기 필요.

자세한 디자인 규칙·토큰·컴포넌트 레시피는 저장소 루트 `CLAUDE.md` 13장 참고.
