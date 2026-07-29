# OmniRoute 설치 안내 (개인 작업 환경 전용)

## 한 줄 요약

**맥 스튜디오에 띄워두고 Claude Code·Cursor를 붙이면 유료 한도를 아낄 수 있습니다.** 15분이면 끝납니다.

- 설치 위치: **김명준님 맥 스튜디오** (개인 작업 환경)
- **이 저장소 운영 코드에는 적용하지 않습니다.** 이유는 아래 4장
- 되돌리기: 명령 한 줄 (`npm uninstall -g omniroute`)

OmniRoute(= AI 제공사 290곳을 하나의 주소로 묶어주는 중계 서버. 전기로 치면 여러 발전소를
하나의 콘센트로 모아주는 배전반)

---

## 1. 설치 (택 1)

### 방법 A: npm (간단, 권장)

**먼저 설치 위치를 내 폴더로 바꿔야 합니다.** 안 그러면 권한 오류(`EACCES: permission denied`)로
설치가 실패합니다. npm 기본 설치 위치(`/usr/local/lib/node_modules`)는 관리자만 쓸 수 있는
폴더이기 때문입니다.

```bash
mkdir -p ~/.npm-global
npm config set prefix ~/.npm-global
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.zshrc
source ~/.zshrc
```

한 번만 하면 됩니다. 그다음 설치합니다.

```bash
npm install -g omniroute
omniroute
```

**`sudo npm install -g`는 쓰지 마세요.** 되기는 하지만 npm 패키지는 설치 중에 자기 스크립트를
실행할 수 있고, sudo로 깔면 그 스크립트가 관리자 권한으로 돕니다. 신뢰도를 확인하지 않은
프로젝트(5장 참고)에 회사 컴퓨터의 관리자 권한을 내주는 셈입니다.

실행하면 대시보드가 `http://localhost:20128`에 뜹니다. **서버가 그 터미널을 계속 붙잡고 있으므로
다음 명령은 새 탭(`Cmd+T`)에서 치세요.** `Ctrl+C`를 누르면 서버가 꺼집니다.

설치 중 노란 `npm warn` 경고(peer dependency, deprecated)는 무시해도 됩니다. 패키지끼리 버전이
살짝 안 맞는다는 알림일 뿐 동작과 무관합니다.

### 방법 B: Docker (계속 켜두고 싶을 때)

```bash
docker run -d --name omniroute --restart unless-stopped \
  -p 127.0.0.1:20128:20128 -v omniroute-data:/app/data \
  diegosouzapw/omniroute:latest
```

`--restart unless-stopped` 덕분에 맥을 껐다 켜도 알아서 다시 뜹니다. 데이터는 `omniroute-data`에
따로 보관돼서 컨테이너를 지워도 설정이 남습니다.

`127.0.0.1:`을 앞에 붙인 게 중요합니다. 이 서버를 **내 컴퓨터에서만** 열고 같은 네트워크의
다른 기기에서는 못 들어오게 막는 설정입니다. 이걸 빼면 사내망 아무나 접근할 수 있게 됩니다.

### 필요 사양

| 항목 | 요구치 |
|---|---|
| Node.js | 18 이상 (22 이상 권장) |
| 메모리 | 500MB |
| 디스크 | 100MB |
| 포트 | 20128 (`PORT` 환경변수로 변경 가능) |

맥 스튜디오라면 넉넉합니다.

---

## 2. 제공사 연결

브라우저로 `http://localhost:20128` 접속 후 **Providers** 항목으로 갑니다.

### 가입 없이 바로 쓰는 무료 제공사

| 이름 | 비고 |
|---|---|
| OpenCode Free | DeepSeek V4, 인증 불필요 |
| Kilo Code | 자동 라우터, 무료 |
| Pollinations | 키 없이 여러 모델 |

이 세 개만 연결해도 동작합니다. 유료 제공사는 각 연결 양식에 API 키를 붙여넣으면 됩니다.

---

## 3. Claude Code·Cursor 붙이기

대시보드 **Endpoints** 항목에서 OmniRoute 자체 키를 복사합니다.

### Claude Code (⚠️ 필요할 때만 켜는 방식으로)

**`export`를 `~/.zshrc`에 그냥 넣지 마세요.** 그러면 앞으로 여는 **모든** Claude Code 세션이
OmniRoute를 거칩니다. 회사 업무 세션까지 무료 제공사로 흘러가 답변 품질이 떨어지거나 중간에
끊길 수 있습니다.

대신 별칭(alias)으로 만들어 스위치처럼 켜고 끕니다. `~/.zshrc`에 넣으세요.

```bash
alias cc-free='ANTHROPIC_BASE_URL=http://localhost:20128/v1 ANTHROPIC_API_KEY=복사한-키 claude'
```

이러면 이렇게 나뉩니다.

| 명령 | 어디로 |
|---|---|
| `claude` | Anthropic 직결 (평소대로) |
| `cc-free` | OmniRoute 경유 (무료 제공사) |

한 번만 써볼 거라면 별칭 없이 그 명령 앞에만 붙여도 됩니다.

```bash
ANTHROPIC_BASE_URL=http://localhost:20128/v1 ANTHROPIC_API_KEY=복사한-키 claude
```

**되돌리려면 `~/.zshrc`에서 alias 한 줄만 지우면 됩니다.**

### Cursor

설정에서 "OpenAI-compatible provider"를 고르고 같은 주소와 키를 넣습니다.

### 연결 확인

```bash
curl http://localhost:20128/v1/models -H "Authorization: Bearer 복사한-키"
```

모델 목록이 나오면 성공입니다.

### 모델 지정

`auto`로 두면 OmniRoute가 알아서 고릅니다. 특정 모델을 쓰고 싶으면 그 이름을 직접 적습니다.

---

## 4. 이 저장소 운영 코드에는 적용하지 않는 이유

사내 서비스 3곳에서 AI를 쓰고 있지만, 여기에는 OmniRoute를 끼우지 않습니다.

| 위치 | 하는 일 | 실행 위치 |
|---|---|---|
| `api/search-summary.js` | 위키 검색 요약 | Vercel 서버리스 |
| `supabase/functions/kakao-classify` | 카카오 상담 분류 | Supabase Edge |
| `scripts/classify-kakao-stream.mjs` | 상담 분류 배치 | 로컬 실행 |

**첫째, 실행 구조가 안 맞습니다.** OmniRoute는 계속 켜져 있는 서버가 필요한데, Vercel 서버리스는
요청이 올 때만 잠깐 깨어나는 구조입니다. 쓰려면 서버를 하나 더 운영해야 하는데 지금 없는
운영 부담을 새로 만드는 일입니다.

**둘째, 프롬프트 캐싱이 깨질 위험이 있습니다.** 3곳 모두 `cache_control: ephemeral`로 캐싱을
쓰고 있고, CLAUDE.md에 "프롬프트 캐싱 설정 변경 금지"로 명시돼 있습니다. 중계 서버를 한 겹
끼우면 이 설정이 그대로 전달되는지 보장되지 않습니다.

**셋째, 학부모 상담 데이터가 지나갑니다.** `kakao-classify`는 학부모와 학원 사이 실제 상담
내용을 다룹니다. 무료 등급을 여러 곳 섞어 쓰면 그 데이터가 어느 회사로 가는지 통제하기
어려워집니다. 무료 등급은 대체로 입력을 학습에 쓸 수 있다는 조건이 붙습니다.

개인 작업 환경에서는 이 세 가지가 해당되지 않습니다. 그래서 개인 환경에만 권합니다.

---

## 5. 쓰기 전 확인할 것

**API 키가 한곳에 모입니다.** OmniRoute는 여러 제공사의 키를 자기 데이터베이스에 보관합니다
(AES-256-GCM 암호화 주장). 회사 계정 키는 넣지 말고, 개인 키나 무료 제공사만 쓰시길 권합니다.

**저장소 신뢰도는 확인하지 않았습니다.** 별 33.4k, 기여자 500명+는 프로젝트 페이지에 적힌
값을 그대로 옮긴 것입니다 `[미측정]`. 나온 지 얼마 안 된 프로젝트치고 이례적으로 큰 숫자라,
회사 자산인 맥 스튜디오에 올리기 전에 커밋 이력과 기여자 실체를 한 번 보시길 권합니다.
원하시면 제가 조사해 드리겠습니다.

**무료 등급은 조건을 확인하세요.** "월 15.3억 토큰 무료"는 43개 제공사의 무료 한도를 합산한
값입니다. 각 제공사마다 학습 데이터 사용 조건이 다릅니다. 회사 업무 코드를 넣는다면 이 부분을
먼저 보셔야 합니다.

---

## 6. 끄기·지우기

```bash
# npm으로 설치한 경우
Ctrl+C                        # 실행 중지
npm uninstall -g omniroute    # 삭제

# Docker로 설치한 경우
docker stop omniroute && docker rm omniroute
docker volume rm omniroute-data    # 설정까지 지울 때
```

Claude Code 설정도 되돌리려면 `~/.zshrc`에서 `cc-free` alias 한 줄을 지우고 터미널을 새로
여시면 됩니다. npm 설치 위치를 원래대로 돌리려면 `npm config delete prefix`와 `~/.zshrc`의
PATH 한 줄 삭제까지 하면 됩니다.

---

## 7. 최신판으로 올리기

```bash
npm install -g omniroute@latest              # npm
docker pull diegosouzapw/omniroute:latest    # Docker
```

---

출처: https://github.com/diegosouzapw/OmniRoute (MIT 라이선스, 2026-07-29 확인)
