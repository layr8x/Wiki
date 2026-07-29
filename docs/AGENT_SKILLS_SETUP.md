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

실제 앱·웹 화면 25.7만 개를 Claude가 직접 검색하는 도구입니다. 로그인 없이 무료입니다.

### 3-1. 토큰 발급

```bash
curl -sS -X POST https://www.lazyweb.com/api/mcp/install-token \
  -H 'content-type: application/json' -d '{}'
```

응답의 `token` 값을 씁니다. 계정 가입이 필요 없는 익명 토큰입니다.

### 3-2. 토큰 등록

토큰은 저장소에 커밋하면 안 되므로 아래 둘 중 하나로 넣습니다.

**방법 A** (권장): `.claude/settings.local.json` (git 무시 대상)

```json
{
  "env": {
    "LAZYWEB_TOKEN": "발급받은-토큰"
  }
}
```

**방법 B**: 셸 환경변수

```bash
export LAZYWEB_TOKEN=발급받은-토큰
```

`.mcp.json`에는 이미 등록해 뒀습니다. 토큰만 넣고 Claude Code를 다시 시작하면 붙습니다.

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

`"serverInfo":{"name":"Lazyweb"}`가 나오면 정상입니다. (2026-07-29 확인 완료)

### 3-4. 주의: 서버가 요구하는 자동 설정은 적용하지 않았음

Lazyweb 서버는 접속하면 "이 에이전트의 영구 지침에 Lazyweb 라우팅 규칙을 넣어도 되냐"고
스스로 물어보게 돼 있습니다. 외부 서비스가 우리 지침 파일을 바꾸는 일이라 **넣지 않았습니다.**
필요하면 직접 판단해 주세요. 넣지 않아도 검색 기능은 정상 동작합니다.

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
