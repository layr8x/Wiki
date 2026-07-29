# AI 디자인 작업 도구 9종 레퍼런스 (2026-07-29 정리)

## 한 줄 요약

공유받은 카드뉴스 9장을 정리하고 실물 확인까지 마쳤습니다. **바로 쓸 만한 건 3개**(`make-interfaces-feel-better`, `emilkowalski/skills`, Lazyweb MCP), 우리 저장소에 이미 비슷한 게 있어 겹치는 건 1개(디자인 QA 자동화), 나머지는 참고용 웹사이트입니다.

- **설치 권장 1순위**: `make-interfaces-feel-better` (완성도 체크 16가지, 우리 챗봇 화면 다듬기에 바로 씀)
- **설치 권장 2순위**: `emilkowalski/skills` (모션 리뷰 스킬 8종)
- **연동 검토**: Lazyweb MCP (실제 앱 화면 25.7만 개를 에이전트가 검색)
- **이미 있음**: 디자인 QA 자동화 → `tools/design-audit/` 가 같은 일을 함

MCP(= Model Context Protocol, AI가 외부 서비스에 직접 접속하게 해주는 규격)
스킬(= Skill, AI에게 "이 작업은 이렇게 해라"를 적어둔 설명서 파일 `SKILL.md`)

---

## 1. 도구별 정리

| # | 이름 | 종류 | 무엇 | 상태 |
|---|---|---|---|---|
| 1 | UI Skills | 스킬 모음 + CLI | 디자인 엔지니어링 스킬 카탈로그, `npx ui-skills start`로 상황에 맞는 스킬 자동 선택 | 실물 확인 |
| 2 | emilkowalski/skills | 스킬 8종 | Vercel·Linear 출신 개발자의 모션·인터랙션 노하우 | 실물 확인 |
| 3 | make-interfaces-feel-better | 스킬 1종 | UI 완성도 원칙 16가지 (라운드·광학정렬·그림자·히트영역 등) | 실물 확인 |
| 4 | 디자인 QA 자동화 프롬프트 | 워크플로 | Figma MCP로 토큰 뽑아 코드와 대조, 엑셀 리포트 | 우리 도구와 중복 |
| 5 | Lazyweb | MCP + 스킬 6종 | 실제 앱·웹 화면 25.7만 개 검색 DB, 무료 | 실물 확인 |
| 6 | NameThatUI | 웹사이트 | UI 요소의 정식 명칭·API 심볼·프롬프트 문구 사전 | 실물 확인 |
| 7 | MotionSites | 웹사이트 | 모션 들어간 웹 화면 갤러리, 프롬프트 복사 | 접속 실패 (아래 주의) |
| 8 | MengTo/Skills | 스킬 118종 | Design+Code 창업자 배포, 웹디자인·게임·WebGL 등 | 실물 확인 |
| 9 | Video to Superprompt | 스킬 1종 | 화면 녹화 영상을 웹사이트 제작 프롬프트로 변환 (8번에 포함) | 실물 확인 |

---

## 2. 각 도구 상세

### 1) UI Skills

- 주소: https://www.ui-skills.com/ , https://github.com/ibelick/ui-skills
- 쓰는 법: 대화창에 "`npx ui-skills start` 실행해서 이 다이얼로그 모션 고쳐줘" 라고 요청하면 에이전트가 알맞은 스킬을 골라 씀
- 분류: 접근성, 모션, 시스템, 비주얼, 인터랙션, 성능, 타이포그래피, 색상 등 14개 갈래
- 다른 명령: `npx ui-skills categories`(분류 목록), `npx ui-skills list --category <분류>`, `npx ui-skills get <스킬명>`
- 평가: 카탈로그 성격이라 개별 스킬을 미리 고르지 않아도 되는 게 장점. 다만 매번 npx로 내려받아 쓰는 구조라 우리처럼 고정 워크플로가 있는 경우엔 아래 3번을 직접 설치하는 게 더 빠름

### 2) emilkowalski/skills

- 주소: https://github.com/emilkowalski/skills (별 17,000개)
- 설치: `npx skills@latest add emilkowalski/skills`
- 스킬 8종:
  - `emil-design-eng` (총괄, 애니메이션·디자인 지침)
  - `review-animations` (기존 애니메이션 엄격 검토)
  - `improve-animations` (개선안 우선순위까지)
  - `find-animation-opportunities` (모션 넣으면 좋을 위치 발굴)
  - `animation-vocabulary` (모션 의도를 정확히 말하는 용어집)
  - `apple-design` (애플 WWDC 발표 기반 인터페이스 원칙)
  - `pick-ui-library` (라이브러리 선택)
  - `prototype` (여러 안 만들어 비교)
- 우리에게 유용한 지점: 챗봇 화면에 아직 모션 규칙이 없음. `find-animation-opportunities`로 어디에 넣을지부터 뽑을 수 있음

### 3) make-interfaces-feel-better

- 주소: https://github.com/jakubkrehel/make-interfaces-feel-better
- 원칙 16가지 중 실제 확인된 것:
  - **바깥 라운드 = 안쪽 라운드 + 여백** (겹친 요소의 라운드가 안 맞는 게 어색함의 최대 원인)
  - 기하학적 중앙이 어색해 보이면 **눈으로 보기 좋은 위치로 수동 보정**(아이콘 버튼, 재생 삼각형 등)
  - 그림자는 **여러 겹**으로
  - 누를 때 축소는 **정확히 0.96 배율**
  - 숫자는 **tabular numerals**(= 고정폭 숫자, 숫자가 바뀌어도 폭이 안 흔들림)
  - 클릭 영역 **최소 40×40px**
- 우리에게 유용한 지점: 라운드 규칙과 그림자 여러 겹은 우리 챗봇 CSS에 이미 적용돼 있음(CLAUDE.md 13-2절 4단 쉐도우). 나머지 원칙으로 기존 코드를 한 번 훑을 값어치가 있음

### 4) 디자인 QA 자동화 프롬프트

- 카드뉴스가 소개한 흐름: Figma MCP 연결 → QA 하네스 생성 → 디자인 QA 요청 → 코드 반영 → 리포트 생성(엑셀) → 디자인에도 동기화
- **우리는 이미 같은 걸 가지고 있음**: `tools/design-audit/` (render.cjs로 400px 기준 렌더, compare.py로 Figma 스크린샷과 나란히 비교, screens.json에 화면별 Figma 노드 지도)
- 우리 쪽이 나은 점: 폰트 CDN 차단 우회가 내장돼 있어 실측 렌더가 정확함
- 카드뉴스 쪽이 나은 점: 결과를 엑셀로 떨어뜨림, 수정 사항을 Figma에 되돌려 반영
- **[미측정]** 원본 프롬프트 전문이 카드뉴스에 없어서 그대로 재현은 불가. 필요하면 우리 도구에 "엑셀 리포트 출력" 기능을 붙이는 게 빠름

### 5) Lazyweb

- 주소: https://lazyweb.com
- 실제 앱·웹 화면 **257,000개** 이상 DB, MCP 서버 + 디자인 리서치 스킬 6종
- Claude Code, Codex, Cursor에 바로 연동, 사람도 에이전트도 무료
- 우리에게 유용한 지점: "다른 서비스는 이 화면을 어떻게 풀었나"를 찾을 때. 챗봇 카드 레이아웃이나 관리자 대시보드 레퍼런스 조사에 씀

### 6) NameThatUI

- 주소: https://namethatui.com
- UI 요소를 대충 설명하면 **정식 명칭 + API 심볼(AppKit·SwiftUI·HTML) + 바로 붙여넣을 프롬프트 문구**를 돌려줌
- macOS 32개, 웹 39개, 합계 71개 요소 수록 (카드뉴스 화면 기준)
- 우리에게 유용한 지점: 디자인 리뷰나 개발 요청서에서 용어를 정확히 쓰고 싶을 때. Astryx 컴포넌트 이름과 대조해두면 소통 비용이 줍니다

### 7) MotionSites

- **[미측정] 주소 접속 실패**. `motionsites.com` 도메인이 응답하지 않습니다(DNS 조회 실패). 카드뉴스의 화면만으로는 정확한 주소를 알 수 없어, 실제 주소를 알려주시면 다시 확인하겠습니다
- 카드뉴스 설명: 모션 들어간 웹 화면 갤러리, 마음에 드는 화면의 프롬프트를 복사해 씀. 무료는 템플릿 수 제한
- 대체재: 위 5번 Lazyweb, 아래 8번의 web-design 스킬 79종에 모션 시스템이 포함돼 있음

### 8) MengTo/Skills

- 주소: https://github.com/MengTo/Skills (MIT 라이선스, 자유 사용)
- Design+Code 창업자 Meng To 배포. 카드뉴스는 75개라 했으나 **현재 118개로 늘어남** [측정, 2026-07-29 확인]
- 갈래별 개수: 웹디자인 79, Codex 워크플로 17, 게임 개발 17, 미디어 2, UI 1
- 쓰는 법: 저장소 통째로 받을 필요 없이 `agent-skills` 폴더에서 필요한 스킬 폴더 하나만 고름. 안의 `SKILL.md` 내용을 Claude Code는 스킬로 등록하거나 대화창에 붙여넣기, Cursor는 rules에, Codex는 작업 전 프롬프트로 로드
- 주의: 118개를 전부 넣으면 오히려 방해됩니다. 필요한 것만 골라 쓰는 게 맞습니다

### 9) Video to Superprompt (8번에 포함)

- 화면 녹화 영상 하나를 넣으면 그 안의 레이아웃과 움직임을 분석해 **웹사이트 제작용 프롬프트로 변환**
- 반대 방향도 있음: 이미 있는 랜딩페이지를 통째로 캡처해 섹션·버튼·애니메이션 단위로 쪼갠 프롬프트를 뽑음
- 우리에게 유용한 지점: 경쟁사 화면이나 참고 사이트를 우리 기획서 초안으로 옮길 때

---

## 3. 권고

| 우선순위 | 할 일 | 이유 |
|---|---|---|
| 1 | `make-interfaces-feel-better` 설치 후 챗봇 화면 전수 점검 | 원칙 16가지가 구체적 수치라 검증 가능. 우리 CLAUDE.md 규칙과 충돌 없음 |
| 2 | `emilkowalski/skills` 설치 | 챗봇에 모션 규칙이 아직 없음. 모션 도입 시점에 바로 씀 |
| 3 | Lazyweb MCP 연동 | 무료. 레퍼런스 조사 시간 단축 |
| 4 | `tools/design-audit/`에 엑셀 리포트 출력 추가 | 4번 워크플로의 유일한 우위 항목 |
| 보류 | UI Skills, MengTo/Skills 전체 설치 | 스킬이 너무 많으면 에이전트가 엉뚱한 걸 고름. 필요할 때 개별로 |

**결정이 필요한 부분**: 1~3번을 실제로 설치할지 여부. 설치는 저장소 설정을 바꾸는 일이라 말씀 주시면 진행하겠습니다.

---

## 출처

카드뉴스 9장(사용자 제공, 2026-07-29) + 아래 실물 확인.

- UI Skills: https://www.ui-skills.com/ , https://github.com/ibelick/ui-skills
- emilkowalski/skills: https://github.com/emilkowalski/skills
- make-interfaces-feel-better: https://github.com/jakubkrehel/make-interfaces-feel-better
- Lazyweb: https://lazyweb.com
- NameThatUI: https://namethatui.com
- MengTo/Skills: https://github.com/MengTo/Skills
