# 에이전트 스킬·Lazyweb 설치 안내

## 한 줄 요약

디자인 스킬 **127개**를 저장소에 설치했고, Lazyweb MCP는 **토큰만 넣으면** 바로 붙습니다.

- 스킬 본체 = `.agents/skills/` (저장소에 커밋됨)
- Claude Code가 읽는 링크 = `.claude/skills/` (git 무시 대상이라 세션 시작 시 자동 복원)
- Lazyweb = `.mcp.json`에 등록 완료, `LAZYWEB_TOKEN` 환경변수만 필요

---

## 1. 설치된 스킬 127개

| 출처 | 개수 | 내용 |
|---|---|---|
| [emilkowalski/skills](https://github.com/emilkowalski/skills) | 8 | 모션·인터랙션 (`emil-design-eng`, `review-animations`, `improve-animations`, `find-animation-opportunities`, `animation-vocabulary`, `apple-design`, `pick-ui-library`, `prototype`) |
| [jakubkrehel/make-interfaces-feel-better](https://github.com/jakubkrehel/make-interfaces-feel-better) | 1 | UI 완성도 원칙 16가지 |
| [MengTo/Skills](https://github.com/MengTo/Skills) | 118 | 웹디자인 79, Codex 워크플로 17, 게임 개발 17, 미디어 2, UI 1 |

전부 MIT 라이선스 계열 오픈소스입니다.

### 쓰는 법

대화창에서 스킬 이름을 부르거나, 하려는 작업을 말하면 Claude가 알맞은 스킬을 고릅니다.

```
챗봇 화면 완성도 점검해줘        → make-interfaces-feel-better 발동
이 다이얼로그 모션 검토해줘       → review-animations 발동
```

### 주의: 스킬이 127개라 오작동 여지가 있음

MengTo 묶음에는 우리 업무와 무관한 것이 섞여 있습니다 (게임 개발 17개, `write-like-meng-on-x`,
`x-bookmark-quote-posts`, `elevenlabs-tts` 등). 엉뚱한 스킬이 발동하면 폴더를 지우면 됩니다.

```bash
rm -rf .agents/skills/<스킬이름> .claude/skills/<스킬이름>
```

---

## 2. 새 클론에서 스킬 살리기

`.claude/`는 git 무시 대상이라 새로 클론하면 링크가 없습니다. 두 가지 방법 중 하나로 복원합니다.

**자동**: 클라우드 세션은 `scripts/install_pkgs.sh`가 세션 시작 시 링크를 다시 겁니다. 할 일 없음.

**수동** (로컬 작업 시):

```bash
CLAUDE_CODE_REMOTE=true bash scripts/install_pkgs.sh
```

데모용 이미지·영상 291개(78MB)는 용량 때문에 커밋에서 제외했습니다. 데모 화면까지 그대로 보려면
아래로 다시 받으면 됩니다.

```bash
npx skills@latest add MengTo/Skills
```

---

## 3. Lazyweb MCP 연결

실제 앱·웹 화면 28.1만 개를 Claude가 직접 검색하는 도구입니다. 검색·설치는 무료이고,
계정 등급에 따라 리포트가 요약본(무료)과 전체본(Pro)으로 갈립니다.

**2026-08-12 상태**: 스킬 8종 설치 완료(`.agents/skills/lazyweb*`), 토큰 확보 및 동작 확인 완료,
`.mcp.json` 등록 완료. 남은 것은 실행 환경에 `LAZYWEB_TOKEN`을 넣는 일뿐입니다(3-2).

### 3-1. 토큰 발급

```bash
curl -sS -X POST https://www.lazyweb.com/api/mcp/install-token \
  -H 'content-type: application/json' -d '{}'
```

응답의 `token` 값을 씁니다. 계정 가입이 필요 없는 익명 토큰입니다.
공급사 설명 기준 이 토큰은 결제·개인정보 열람·삭제 같은 행위를 못 하는 접속용 자격증명이지만,
**가진 사람이 그 계정의 MCP 접근을 쓸 수 있으므로 저장소에 커밋하지 않습니다.**

### 3-2. 토큰 등록 — 실행 환경마다 넣는 곳이 다름

이 저장소는 클라우드 세션(Claude Code 웹)과 로컬 양쪽에서 돌아갑니다. **두 곳은 토큰을 넣는
자리가 다릅니다.** 한쪽에만 넣고 양쪽에 넣었다고 착각하기 쉬우니 표로 정리합니다.

| 실행 환경 | 넣는 곳 | 지속성 |
|---|---|---|
| 로컬 Claude Code | `.claude/settings.local.json` (git 무시 대상) | 그 컴퓨터에 계속 남음 |
| 클라우드 세션 | Claude Code 웹 > 환경(Environment) 설정의 환경변수 | 새 세션에도 적용됨 |

로컬용 `.claude/settings.local.json`:

```json
{
  "env": {
    "LAZYWEB_TOKEN": "발급받은-토큰"
  }
}
```

**클라우드 세션에서는 이 파일이 소용없습니다.** 세션마다 저장소를 새로 복제하는데
`.claude/`는 git 무시 대상이라 파일 자체가 안 따라옵니다. 웹 환경 설정에 환경변수로 넣어야 합니다.

셸에서 임시로 쓸 때는 `export LAZYWEB_TOKEN=발급받은-토큰`.

`.mcp.json`에는 이미 등록해 뒀습니다. 토큰만 넣고 Claude Code를 다시 시작하면 붙습니다.
**MCP 서버는 세션이 시작될 때 붙으므로, 토큰을 넣은 뒤에는 반드시 재시작해야 합니다**
(이미 돌고 있는 세션에는 적용되지 않습니다).

```json
"lazyweb": {
  "type": "http",
  "url": "https://www.lazyweb.com/mcp",
  "headers": { "Authorization": "Bearer ${LAZYWEB_TOKEN}" }
}
```

### 3-3. 연결 확인

```bash
curl -sS -X POST https://www.lazyweb.com/mcp \
  -H "Authorization: Bearer $LAZYWEB_TOKEN" \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}'
```

`"serverInfo":{"name":"Lazyweb"}`가 나오면 정상입니다.
(2026-08-12 재확인: serverInfo Lazyweb 0.1.0, 프로토콜 2025-06-18, 제공 도구 43종.)

도구 목록까지 보려면 `tools/list`를 이어서 부릅니다.

```bash
curl -sS -X POST https://www.lazyweb.com/mcp \
  -H "Authorization: Bearer $LAZYWEB_TOKEN" \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

### 3-4. 스킬 8종 (2026-08-12 설치)

`.agents/skills/`에 커밋했습니다. 다른 스킬들과 같은 자리라 세션 시작 시 자동 복원됩니다.

| 스킬 | 하는 일 |
|---|---|
| `lazyweb` | 진입점. 어떤 기능을 쓸지 고름 |
| `lazyweb-search-screens` | 실제 화면·UI 패턴 검색 |
| `lazyweb-search-flows` | 온보딩·결제 같은 여러 단계 흐름 검색 |
| `lazyweb-search-experiments` | 가격·결제·전환 실험 사례 검색 |
| `lazyweb-growth-score` | 웹사이트 점수 산출·비교 |
| `lazyweb-growth-report` | 화면 개선안 리포트 |
| `lazyweb-growth-backlog` | 개선 아이디어 목록 관리 |
| `lazyweb-update` | 스킬 갱신(이 저장소 방식) |

### 3-5. 공식 안내와 다르게 한 것 2가지

원본 설치 안내(`https://www.lazyweb.com/agent/<토큰>.md`)를 그대로 따르지 않았습니다.

**하나. 원격 설치 스크립트를 실행하지 않았습니다.**
공식 안내는 `curl -fsSL https://www.lazyweb.com/install.sh | bash`를 씁니다. 받아서 읽어 보니
GitHub 저장소를 복제한 뒤 그 안의 `setup` 스크립트를 실행하는 구조였습니다. 스크립트 자체에
수상한 점은 없었지만(`rm -rf` 대상도 `~/.lazyweb/repos/lazyweb-skill`로 한정), 남이 만든
스크립트를 읽지 않고 셸에 바로 흘려 넣는 방식은 쓰지 않기로 했습니다. 대신 공개 배포 경로에서
`SKILL.md` 8개만 받아 `.agents/skills/`에 넣었습니다. 설치 위치도 이쪽이 이 저장소 방식과 맞습니다.

**둘. 영구 지침에 라우팅 규칙을 넣지 않았습니다.**
Lazyweb은 "제품 UI 작업은 전부 Lazyweb으로 보내라"는 규칙 블록(`LAZYWEB:ROUTER`)을
`CLAUDE.md` 같은 지침 파일에 넣으라고 안내합니다. 공급사 문서도 이건 **별도 동의가 필요하고,
설치 요청 자체를 동의로 봐서는 안 된다**고 못 박아 뒀습니다.

넣지 않은 이유는 두 가지입니다. 외부 업체가 우리 지침 파일을 관리하기 시작하면 나중에
"왜 이렇게 동작했는지"를 추적하기 어려워집니다. 그리고 규칙 문구가 "모든 제품 UI 작업"이라
범위가 넓어, 사내 위키·챗봇 작업까지 외부 서비스 호출로 흘러갈 수 있습니다.

**넣지 않아도 기능은 다 됩니다.** 스킬 8종과 MCP 도구 43종을 그대로 쓸 수 있고,
"참고 화면 찾아줘" 같이 말하면 스킬이 발동합니다. 자동 라우팅만 없는 것입니다.
필요해지면 그때 판단하면 됩니다.

---

## 4. UI Skills (설치 불필요)

[UI Skills](https://www.ui-skills.com/)는 설치형이 아니라 그때그때 내려받아 쓰는 방식입니다.
대화창에서 이렇게 요청하면 됩니다.

```
npx ui-skills start 실행해서 이 화면 다듬어줘
```

| 명령 | 하는 일 |
|---|---|
| `npx ui-skills start` | 작업에 맞는 스킬 자동 선택 |
| `npx ui-skills categories` | 분류 14개 목록 |
| `npx ui-skills list --category motion` | 분류별 스킬 목록 |
| `npx ui-skills get <스킬명>` | 스킬 전문 출력 |

---

## 5. 웹사이트 참고 도구 (설치 대상 아님)

| 이름 | 주소 | 용도 |
|---|---|---|
| NameThatUI | https://namethatui.com | UI 요소의 정식 명칭·API 심볼·프롬프트 문구 |
| MotionSites | 확인 실패 | 모션 웹 화면 갤러리. `motionsites.com` 응답 없음, 정확한 주소 필요 |

---

관련 문서: `analysis/AI디자인_도구_레퍼런스.md` (도구 9종 비교·설치 우선순위)
