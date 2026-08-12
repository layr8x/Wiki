# OmniRoute 설치 안내 (개인 작업 환경 전용)

## 한 줄 요약

**Docker(Colima)로 설치하세요. npm 전역 설치는 쓰지 마세요.** 2026-07-29 실제 설치에서
npm 방식은 서버 주소를 내 컴퓨터로 묶을 수 없어 사내망에 그대로 열렸습니다 (3장 참고).

- 설치 위치: **김명준님 맥 스튜디오** (개인 작업 환경)
- **이 저장소 운영 코드에는 적용하지 않습니다.** 이유는 아래 5장
- **설치 직후 Cloudflare 터널을 반드시 끄세요.** 포트를 막아도 프로그램이 스스로 공개 주소를
  만듭니다 (1장)
- 되돌리기: `docker rm -f omniroute`

OmniRoute(= AI 제공사 290곳을 하나의 주소로 묶어주는 중계 서버. 전기로 치면 여러 발전소를
하나의 콘센트로 모아주는 배전반)

---

## 1. 설치 (Colima + Docker)

Docker Desktop이 아니라 **Colima**를 씁니다. Docker Desktop은 직원 250명 초과 또는 매출
1000만 달러 초과 기업에서 상업용으로 쓰려면 유료 구독이 필요한데, (주)하이컨시는 여기
해당할 가능성이 높습니다. Colima는 MIT 라이선스라 무료이고 `docker` 명령은 똑같습니다.

```bash
brew install colima docker
colima start
docker --version          # 버전이 나오면 준비 완료
```

그다음 OmniRoute를 띄웁니다. 비밀번호는 **열 자리 이상**으로 정하세요.

```bash
docker run -d --name omniroute --restart unless-stopped \
  -e INITIAL_PASSWORD=직접-정한-비밀번호 \
  -p 127.0.0.1:20128:20128 -v omniroute-data:/app/data \
  diegosouzapw/omniroute:latest
```

`127.0.0.1:`을 앞에 붙인 게 핵심입니다. 이 서버를 **내 컴퓨터에서만** 열고 사내망의 다른
기기에서는 못 들어오게 막습니다. Docker는 컨테이너 **바깥에서** 포트를 묶기 때문에 프로그램이
내부에서 뭘 하든 이 설정이 확실히 먹습니다.

### 재부팅 대비 (필수)

```bash
brew services start colima
```

Colima가 꺼져 있으면 컨테이너의 `--restart unless-stopped`도 소용없습니다. 맥을 껐다 켜도
자동으로 뜨게 하려면 이 설정이 필요합니다.

### 확인

```bash
lsof -nP -iTCP:20128 | grep LISTEN
```

`127.0.0.1:20128` **하나만** 나와야 합니다. `*:20128`이나 `0.0.0.0:20128`이 같이 뜨면
사내망에 열려 있다는 뜻입니다.

### ⚠️ 터널 끄기 (포트를 막아도 뚫립니다)

**포트를 `127.0.0.1`로 묶어도 끝이 아닙니다.** OmniRoute는 Cloudflare 터널을 스스로 켜서
그 벽을 우회하는 공개 주소를 만듭니다. 실제로 `https://attending-isp-ratios-zshops.
trycloudflare.com/v1` 같은 주소가 인터넷에 열려 있었습니다. 포트 차단은 건물 문을 잠그는
일인데, 이 프로그램은 스스로 바깥으로 굴을 팝니다.

대시보드 **엔드포인트** 화면에서 두 가지를 끄세요.

| 항목 | 조치 |
|---|---|
| Cloudflare Quick Tunnel | **Stop Tunnel** 버튼 |
| 클라우드 옴니루트 | **클라우드 비활성화** 버튼 |

끄고 나면 `ACTIVE ENDPOINTS`에 `Local` 하나만 남아야 합니다. **설치 직후 반드시 확인하세요.**

대시보드는 `http://localhost:20128`, API는 `http://localhost:20128/v1`입니다.

### 필요 사양

| 항목 | 요구치 |
|---|---|
| 메모리 | 500MB (Colima VM 별도로 2GB 정도) |
| 디스크 | 100MB (Colima 이미지 별도로 수백 MB) |
| 포트 | 20128 |

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

**2026-07-29 실측 결과는 표와 달랐습니다.**

| 제공사 | 결과 |
|---|---|
| OpenCode Free | 정상. 모델 6개 동작 (DeepSeek V4 Flash 등) |
| Kilo Code | `kc/openrouter/free` 1개만 동작. 나머지는 무료 등급 대상이 아니라 오류 |
| Pollinations | **실패.** `Authentication required` — 이제 키가 필요합니다 |

Pollinations는 `https://pollinations.ai`에서 키를 받거나, 안 쓸 거면 연결을 꺼두세요. 실패한
제공사를 켜두면 그쪽으로 요청을 보냈다가 되돌아오느라 응답이 느려집니다.

Kilo Code의 빨간 표시는 `Testing ...`이 끝나면 `Auto-hide failed models` 설정이 자동으로
숨깁니다. 기다리면 됩니다.

### API 키 발급

왼쪽 메뉴 **API 관리자** → **+ API 키 생성**.

- 권한은 **모든 모델만** 주고 `manage`는 빼세요. Claude Code는 모델 호출만 하면 되지 설정을
  바꿀 필요가 없습니다
- **생성 직후 뜨는 값을 바로 복사하세요.** 화면을 벗어나면 `sk-440ab****60c2`처럼 가려져
  다시 볼 수 없습니다

---

## 3. Claude Code·Cursor 붙이기

대시보드 **Endpoints** 항목에서 OmniRoute 자체 키를 복사합니다.

### Claude Code (⚠️ 필요할 때만 켜는 방식으로)

**`export`를 `~/.zshrc`에 그냥 넣지 마세요.** 그러면 앞으로 여는 **모든** Claude Code 세션이
OmniRoute를 거칩니다. 회사 업무 세션까지 무료 제공사로 흘러가 답변 품질이 떨어지거나 중간에
끊길 수 있습니다.

대신 별칭(alias)으로 만들어 스위치처럼 켜고 끕니다. `~/.zshrc`에 넣으세요.

```bash
alias cc-free='ANTHROPIC_BASE_URL=http://localhost:20128 ANTHROPIC_API_KEY=복사한-키 claude'
```

⚠️ **주소 끝에 `/v1`을 붙이지 마세요.** Claude Code가 `/v1/messages`를 자기가 붙이기 때문에
`/v1`을 넣으면 `/v1/v1/messages`가 됩니다. Cursor 같은 OpenAI 호환 도구는 반대로 `/v1`까지
넣어야 합니다.

이러면 이렇게 나뉩니다.

| 명령 | 어디로 |
|---|---|
| `claude` | Anthropic 직결 (평소대로) |
| `cc-free` | OmniRoute 경유 (무료 제공사) |

한 번만 써볼 거라면 별칭 없이 그 명령 앞에만 붙여도 됩니다.

```bash
ANTHROPIC_BASE_URL=http://localhost:20128 ANTHROPIC_API_KEY=복사한-키 claude
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

## 4. npm 전역 설치를 쓰지 않는 이유 (2026-07-29 실측)

처음에는 `npm install -g omniroute`로 안내했다가 세 번 막혀 Docker로 바꿨다. 같은 길을
다시 걷지 않도록 기록해 둔다.

**함정 1 — 권한 오류로 설치 자체가 실패한다.** npm 기본 전역 설치 위치
(`/usr/local/lib/node_modules`)는 관리자 전용이라 `EACCES: permission denied`가 난다.
`npm config set prefix ~/.npm-global`로 우회할 수는 있다. `sudo`는 쓰지 말 것 — npm 패키지는
설치 중 자기 스크립트를 실행할 수 있어 관리자 권한을 내주는 셈이 된다.

**함정 2 — 서버가 사내망 전체에 열린다.** `HOST` 기본값이 `0.0.0.0`이라 같은 네트워크의
누구든 접근할 수 있다. 기본 비밀번호가 공개된 `CHANGEME`라 더 위험하다.

**함정 3 — 환경변수로 그 주소를 못 막는다.** `HOST`·`HOSTNAME`·`OMNIROUTE_SERVER_HOST`·
`API_HOST` 넷을 `~/.omniroute/.env`에 전부 넣고 재시작해도, 프로세스가 **두 개** 뜨면서
하나는 `127.0.0.1`에 묶이고 다른 하나는 여전히 `*:20128`로 열렸다. CLI가 서버를 두 겹으로
띄우는데 안쪽이 설정을 무시한다.

Docker는 포트를 컨테이너 바깥에서 묶으므로 이 문제가 원천적으로 없다.

**함정 4 — 포트를 막아도 프로그램이 스스로 터널을 판다.** 이건 npm·Docker 공통 문제다.
OmniRoute는 Cloudflare Quick Tunnel을 자동으로 켜서 `127.0.0.1` 제한을 우회하는 공개
주소를 만든다. 설치 방식과 무관하므로 **설치 직후 엔드포인트 화면에서 터널을 직접 꺼야
한다**(1장 참고).

`npm warn`(peer dependency, deprecated) 경고는 무시해도 된다. 동작과 무관하다.

---

## 5. 이 저장소 운영 코드에는 적용하지 않는 이유

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

## 6. 쓰기 전 확인할 것

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

## 7. 끄기·지우기

```bash
docker stop omniroute              # 잠시 끄기
docker start omniroute             # 다시 켜기
docker rm -f omniroute             # 컨테이너 삭제
docker volume rm omniroute-data    # 설정·데이터까지 삭제
colima stop                        # Docker 자체를 끄기
```

Claude Code 설정을 되돌리려면 `~/.zshrc`에서 `cc-free` alias 한 줄을 지우고 터미널을
새로 여시면 됩니다.

---

## 8. 최신판으로 올리기

```bash
docker pull diegosouzapw/omniroute:latest
docker rm -f omniroute
# 1장의 docker run 명령을 다시 실행
```

데이터는 `omniroute-data`에 따로 보관되므로 컨테이너를 지워도 설정은 남습니다.

---

출처: https://github.com/diegosouzapw/OmniRoute (MIT 라이선스)
설치 실측: 2026-07-29, 맥 스튜디오(Apple Silicon), Colima 0.10.3 + Docker 29.6.2, OmniRoute v3.8.48
