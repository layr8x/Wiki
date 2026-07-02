# HICONSY · LUMEN 디자인 시스템 — 챗봇 UI 토큰 (실측 추출 + TDS 구조 반영)

> ⚠️ 2026-07-02 갱신 — 정본은 v6 **4메뉴**(출결·보강 / 납부·결제 / 수업·시간표 / 전반) 챗봇. SSOT = `public/myclass-chatbot.html`(학생) + `public/myclass-chatbot-parent.html`(학부모) + `기획서_v6_요약.md`. 이 디자인 토큰은 메뉴와 무관하게 동일하며(값 변경 없음), 아래 "운영 빌드" 참조는 옛 v3 프로토타입에서 현재 빌드로 갱신함. (옛 v3 시절 8-메뉴 프로토타입 기록은 폐기)

> **LUMEN** — *명료하게. 일관되게. 누구에게나.* (HICONSY DESIGN SYSTEM)
> 규모: **508 토큰 · 55 컴포넌트 · 2 모드(light/dark) · WCAG AA** · v1.1 · 2026. (Figma 커버 노드 `58:2763` 실측)
>
> 출처: LUMEN DS(`AWBOevxn4v0sjp6w22PPco`, 커버 노드 `58:2763`), 앱 참조(`A3JqKGl3NJD7CIRtjj6aNj/29431-133932`), AMS 챗봇(`6PSg6RlWrjpnNYk1zirmUp/830-5936`). 토큰 값은 Figma 변수 정의·컴포넌트 `get_design_context` 실측치 및 운영 `public/myclass-chatbot.html` `:root` 적용치. Carbon 기반(gray/blue/red 10~100). 컬렉션: `global`(원시) + `theme`(시맨틱 light/dark).
>
> **이 문서의 토큰 모델은 토스 디자인 시스템(TDS)의 3계층(Base→Semantic→Component) 구조를 차용해 정식화했다. 단, LUMEN은 단색 `#161616` 흑백 정체성을 유지하므로 TDS에서 가져온 것은 "색"이 아니라 _구조·원칙·네이밍·컴포넌트 스펙_ 이다. 색 액센트(토스 블루 등)는 도입하지 않는다.**

> **현재 톤(운영 적용) — 하이엔드·모던·심플 흑백.** 분리(separation)를 *테두리*가 아니라 **옅은 회색 대화 캔버스 + 흰색 부유 요소 + 소프트 섀도우**로 만든다. 대화 영역(`.log`)은 회색 캔버스 `#f1f1f3`, 그 위에 흰색(`--bg #fff`) 봇 말풍선·메뉴타일·카드·칩이 그림자로 떠 있다. 헤더·입력창도 흰색, 유저(me) 말풍선만 검정 `#161616`. 테두리는 최소화하고, 쓰더라도 헤어라인(`--border-subtle #16161614`)만 쓴다.

---

## 0. 토큰 3계층 모델 (TDS 차용 → LUMEN 번역)

토큰을 세 층으로 나눠 관리한다. 아래로 갈수록 "용도가 구체적"이다.

| 계층 | 정의 | 예시(LUMEN) | 비유 |
|---|---|---|---|
| **Base (원시)** | 의미 없는 순수 값. 팔레트·치수의 원천. | `--gray-100:#161616`, `--tb-56`, `--r-card:14px` | 물감 원색 |
| **Semantic (시맨틱)** | "어디에 쓰는가"(용도·역할). Base를 가리킴. light/dark가 여기서 갈림. | `--text-primary → gray-100`, `--fill-strong → gray-100` | 물감의 용도 라벨("본문용") |
| **Component (컴포넌트)** | 특정 부품의 특정 부위. Semantic을 가리킴. | `--button-primary`, `--seg-thumb-bg`, `--pill-due-bg` | 완성된 부품 |

원칙:
1. **컴포넌트는 Base를 직접 참조하지 않는다.** 반드시 Semantic을 거친다. (다크모드·테마 교체 시 Semantic 한 줄만 바꾸면 전체가 따라옴)
2. **Semantic은 light/dark 두 모드에서 같은 _이름_, 다른 _값_.** (`--text-primary`는 light=`#161616`, dark=`#f4f4f4`)
3. **새 색을 추가하지 않는다.** 새 용도가 생기면 기존 흑백/투명도 램프 안에서 Semantic 이름만 늘린다.

## 1. 원시 토큰 (global, 고정)
```css
:root{
  /* Gray */
  --gray-10:#f4f4f4; --gray-20:#e0e0e0; --gray-30:#c6c6c6; --gray-40:#a8a8a8;
  --gray-50:#8d8d8d; --gray-60:#6f6f6f; --gray-70:#525252; --gray-80:#393939;
  --gray-90:#262626; --gray-100:#161616; --black:#000000; --white:#ffffff;
  /* Blue (링크/보조에만) */
  --blue-10:#edf5ff; --blue-20:#d0e2ff; --blue-30:#a6c8ff; --blue-40:#78a9ff;
  --blue-50:#4589ff; --blue-60:#0f62fe; --blue-70:#0043ce; --blue-80:#002d9c;
  --blue-90:#001d6c; --blue-100:#001141;
  /* Red */
  --red-60:#da1e28; --red-70:#a2191f; --red-80:#750e13;  /* 10~50/90~100 [확인필요] */
  /* Transparent black (검정 위 알파) */
  --tb-8:#16161614; --tb-16:#16161629; --tb-24:#1616163d; --tb-32:#16161652;
  --tb-40:#16161666; --tb-48:#1616167a; --tb-56:#1616168f; --tb-64:#161616a3;
  --tb-72:#161616b8; --tb-80:#161616cc; --tb-88:#161616e0; --tb-96:#161616f5;
  --tw-8:#ffffff14; --tw-64:#ffffffa3;  /* 흰색 위 알파(다크용), 중간단계 [확인필요] */
  /* Radius — 운영 public/myclass-chatbot.html 적용치 (LUMEN 부유형 UI) */
  --radius-xs:1px; --radius-sm:2px; --radius-md:4px; --radius-lg:8px; --radius-xl:12px; --radius-full:9999px;
  --r-tag:2px; --r-btn:2px; --r-card:14px; --r-pill:999px; --r-bubble:20px; --r-sheet:16px; --r-chip:6px;
  /* (그 외 부품별 고정 radius: 말풍선 tail 7px · .tt-block 10px · .seg 12px) */
  /* Spacing / layout */
  --s2:4px; --s3:8px; --s5:16px; --margin:24px; --g8:8px; --g16:16px; --g24:24px;
  --layout-width:430px; --layout-height:932px;
  /* Shadow — 가볍고 공기감 있는 부유 섀도우(테두리 대체). 모두 rgba(22,22,22,...) */
  --shadow-m:0 1px 2px rgba(22,22,22,.05),0 2px 10px rgba(22,22,22,.05);   /* 칩 등 */
  --shadow-2:0 1px 2px rgba(22,22,22,.04),0 10px 30px rgba(22,22,22,.07);  /* 정보카드 */
  --shadow-tile:0 1px 2px rgba(22,22,22,.06),0 5px 16px rgba(22,22,22,.08); /* 메뉴타일 */
  /* 봇 말풍선 섀도우(인라인) = 0 1px 2px rgba(22,22,22,.05),0 2px 8px rgba(22,22,22,.05) */
  /* Component radius */
  --button-radius:var(--r-btn);    /* 2px */
  --input-radius:var(--r-pill);    /* 입력바=pill(999px) */
  --card-radius:var(--r-card);     /* 14px */
  --tag-radius:var(--r-tag);       /* 2px (카테고리 태그 인스턴스) */
}
```

## 2. 시맨틱 토큰 (theme)

### 2.1 시맨틱 정의 (CSS)
```css
/* LIGHT */
:root{
  --text-primary:#161616; --text-secondary:#161616b8; --text-helper:#1616168f;
  --text-placeholder:#161616a3; --text-disabled:#1616163d; --text-inverse:#f4f4f4;
  --text-interactive:#0043ce;
  --bg-primary:#ffffff; --bg-secondary:#f4f4f4; --bg-inverse:#161616;
  --bg-inverse-hover:#000000; --bg-inverse-selected:#393939; --bg-brand:#0043ce; --bg-danger:#da1e28;
  --border-primary:#16161614; --border-secondary:#1616163d;
  --icon-primary:#161616; --icon-secondary:#161616b8; --icon-placeholder:#16161652;
  --button-primary:#161616; --button-primary-active:#393939;
  --button-secondary:#001d6c; --button-tertiary:#161616; --button-tertiary-hover:#393939;
  --button-danger:#750e13; --button-disabled:#16161614;
  --tag-gray-background:#f4f4f4; --tag-gray-border:#e0e0e0; --tag-gray-color:#393939;
  --chip-bg-enabled:#f4f4f4; --chip-bg-hover:#e0e0e0; --chip-bg-selected:#e0e0e0;
}
/* DARK */
:root[data-theme="dark"]{
  --text-primary:#f4f4f4; --text-secondary:#ffffffb8; --text-helper:#ffffff8f; --text-disabled:#ffffff3d;
  --text-inverse:#161616; --text-interactive:#78a9ff;
  --bg-primary:#161616; --bg-secondary:#262626; --bg-inverse:#ffffff; --bg-inverse-selected:#e0e0e0; --bg-brand:#78a9ff;
  --border-primary:#ffffff14;
  --icon-primary:#f4f4f4; --icon-secondary:#ffffffb8;
  --button-primary:#f4f4f4; --button-primary-active:#c6c6c6; --button-secondary:#a6c8ff;
  --button-tertiary:#f4f4f4; --button-tertiary-hover:#c6c6c6; --button-disabled:#ffffff14;
  --tag-gray-color:#e0e0e0; --chip-bg-enabled:#393939; --chip-bg-hover:#525252;
}
```

### 2.2 시맨틱 세트 정식화 — text / fill / border (TDS 대상·역할 네이밍)

TDS는 시맨틱을 **대상(Text/Fill/Border/Icon) × 역할(Neutral/Brand/…) × 변형(Weak/Alt/Strong)** 으로 짠다. 이를 LUMEN 흑백에 맞춰 정리하면 아래와 같다. **"역할" 자리에 Brand 대신 흑백 위계(Strong/Subtle)를 둔다** — 이것이 LUMEN의 핵심 번역이다.

운영(`public/myclass-chatbot.html`)에는 이미 다음 단축 시맨틱이 적용되어 있고(아래 매핑의 LUMEN 별칭), `--text-primary` 등 풀네임과 1:1 대응한다:
`--text-neutral / --text-weak / --text-inverse`, `--fill-strong / --fill-subtle`, `--border-subtle / --border-strong`.

#### Text (텍스트)
| 시맨틱 토큰 | LUMEN 별칭(운영) | → Base 매핑 (light) | → Base 매핑 (dark) | 명암비(흰 위) | 용도 |
|---|---|---|---|---|---|
| `--text-primary` | `--text-neutral` | `gray-100 #161616` | `gray-10 #f4f4f4` | 19.8:1 | 본문·제목·핵심 숫자 |
| `--text-secondary` | — | `tb-72 #161616b8` | `tw-72 #ffffffb8` | ≈8.6:1 | 보조 본문·버튼 라벨 보조 |
| `--text-helper` | `--text-weak` | `tb-56 #1616168f` | `tw-56 #ffffff8f` | ≈5.7:1 | 헬퍼텍스트·캡션·출처 |
| `--text-placeholder` | — | `tb-64 #161616a3` | (dark 미노출 [확인필요]) | ≈6.9:1 | 입력 플레이스홀더·비활성 탭 라벨 |
| `--text-disabled` | — | `tb-24 #1616163d` | `tw-24 #ffffff3d` | ≈2.0:1 (장식 한정) | 비활성 — **본문 금지, 비활성 상태 표시 전용** |
| `--text-inverse` | `--text-inverse` | `gray-10 #f4f4f4` / `white` | `gray-100 #161616` | (검정 위) 18:1 | 검정 표면 위 텍스트(유저 말풍선·CTA) |
| `--text-interactive` | — | `blue-70 #0043ce` | `blue-40 #78a9ff` | ≈8.6:1 | **링크 전용**(밑줄 동반). 액센트 아님 |

#### Fill (배경·면)
| 시맨틱 토큰 | LUMEN 별칭(운영) | → Base 매핑 (light) | → Base 매핑 (dark) | 용도 |
|---|---|---|---|---|
| `--bg-primary` | `--bg` | `white #ffffff` | `gray-100 #161616` | 1차 표면(카드·시트·메뉴타일·칩·봇 말풍선·헤더·입력바) |
| `--bg-secondary` | `--fill-subtle` / `--surface` | `gray-10 #f4f4f4` | `gray-90 #262626` | 2차 표면(인풋 바탕·세그먼트 트랙·아이콘 칩 배경) |
| `--bg-canvas`(운영 신규) | — | `#f1f1f3` | (dark [확인필요]) | **대화 영역(`.log`) 회색 캔버스** — 흰 부유 요소를 띄우는 바닥 |
| `--bg-inverse` | `--fill-strong` | `gray-100 #161616` | `white #ffffff` | 강조 면(CTA·유저 말풍선·전송 버튼) |
| `--bg-inverse-hover` | — | `black #000000` | (dark [확인필요]) | inverse 면 hover |
| `--bg-inverse-selected` | — | `gray-80 #393939` | `gray-20 #e0e0e0` | inverse 면 선택 |
| `--fill-inverse`(신규 권장) | — | = `--text-inverse` | = `--text-inverse` | inverse 면 위 텍스트/아이콘 색 별칭(가독성) |

#### Border (테두리)
| 시맨틱 토큰 | LUMEN 별칭(운영) | → Base 매핑 (light) | → Base 매핑 (dark) | 용도 |
|---|---|---|---|---|
| `--border-primary` | `--border-subtle` | `tb-8 #16161614` | `tw-8 #ffffff14` | 기본 구획선·카드 테두리·인풋 |
| `--border-secondary` | `--border-strong` | `tb-24 #1616163d` | (dark [확인필요]) | 강조 테두리·칩 외곽·포커스 보조 |

> **명명 정리(권장)**: 운영 별칭(`-weak/-strong/-subtle`)과 풀네임(`-helper/-secondary/-primary`)이 혼재한다. 신규 코드는 **TDS식 변형 접미사(`-weak`/`-strong`/`-subtle`)** 로 통일하되, 기존 풀네임은 `var()` 별칭으로 유지해 호환성을 깨지 않는다. (예: `--text-helper: var(--text-weak);`)

## 2.5 명암비 · 명도 일관성 원칙 (TDS의 OKLCH 사고 → 흑백 번역)

TDS는 **OKLCH(= 사람 눈 기준으로 균일하게 설계된 색 좌표계. 같은 명도값이면 어떤 색이든 체감 밝기·대비가 같음)** 를 써서 라이트/다크에서 대비를 예측 가능하게 만든다. LUMEN은 색이 없으므로, 이 사고를 **"투명도 단계(tb-*)와 gray 램프의 명암비가 단계마다 일관되게 줄어들도록 관리한다"** 로 번역한다.

### 2.5.1 투명도-온-블랙(tb-*) 스케일 — 흰 배경 기준 명암비
검정(`#161616`)을 알파로 흰 위에 얹은 값. 숫자(8~96)는 **불투명도 %** ≈ 체감 진하기. 같은 표면(흰색)이면 단계마다 대비가 예측 가능하게 증가한다.

| 토큰 | 알파 | 흰 위 명암비(근사) | WCAG 판정 | 권장 용도 |
|---|---|---|---|---|
| `--tb-8`  #16161614 | 8% | 1.1:1 | 비텍스트 | 구획선·카드 테두리 |
| `--tb-16` #16161629 | 16% | 1.3:1 | 비텍스트 | 약한 구분선 |
| `--tb-24` #1616163d | 24% | 2.0:1 | **텍스트 불가** | 강조 테두리·비활성 텍스트(장식) |
| `--tb-32` #16161652 | 32% | 2.7:1 | 비텍스트 | 아이콘 플레이스홀더 · **바텀시트 스크림 ≈.32** |
| `--tb-48` #1616167a | 48% | 4.0:1 | 큰 텍스트 경계 | 딤(과거 스크림값; 도킹 패널 딤은 ≈.12) |
| `--tb-56` #1616168f | 56% | 5.7:1 | **AA 본문 OK** | 헬퍼·캡션 (≥4.5:1) |
| `--tb-64` #161616a3 | 64% | 6.9:1 | AA 본문 OK | 플레이스홀더 |
| `--tb-72` #161616b8 | 72% | 8.6:1 | AA/AAA | 보조 본문 |
| `--tb-80` #161616cc | 80% | 11:1 | AAA | 강한 보조 |
| `--tb-96` #161616f5 | 96% | 18:1 | AAA | 거의 본문급 |

> 알파 단계는 **위 라이트값을 흰색(#fff) 위에 합성한 근사치**다. 다크 모드에선 같은 _이름_의 흰색-온-블랙(tw-*) 토큰이 검정 위에서 대칭적 대비를 만든다. 그래서 시맨틱 이름(`--text-helper`)은 한 줄이지만 light/dark 양쪽에서 "본문 대비 약 절반"이라는 _체감_은 일정하다 — 이것이 OKLCH가 색으로 하던 일을 LUMEN이 알파로 흉내 내는 방식이다.

### 2.5.2 gray 램프 — 불투명 단색의 명암비
표면 위계·히트맵·아이콘 등 **불투명**이 필요한 곳. 흰 배경 기준.

| 토큰 | hex | 흰 위 명암비 | 용도 |
|---|---|---|---|
| `--gray-10`  #f4f4f4 | 1.05:1 | 2차 표면 |
| `--gray-20`  #e0e0e0 | 1.3:1 | 테두리·히트맵 결석칸 |
| `--gray-30`  #c6c6c6 | 1.8:1 | grabber·구분 |
| `--gray-60`  #6f6f6f | 4.0:1 | 히트맵 지각칸·중간 아이콘 |
| `--gray-80`  #393939 | 9.7:1 | 태그 텍스트 |
| `--gray-100` #161616 | 19.8:1 | 본문·핵심 |

### 2.5.3 대비 기준 (시스템 규칙 = WCAG AA, 커버 명시값)
| 콘텐츠 | 최소 대비 | LUMEN 적용 |
|---|---|---|
| 본문 텍스트(<18px) | **4.5:1 (AA)** | `--text-helper`(5.7:1) 이상만 본문에 사용 |
| 큰 텍스트(≥18px Bold / ≥24px) | 3:1 | 비활성 라벨도 이 선 위로 |
| UI 컴포넌트·아이콘 경계 | 3:1 | 핵심 아이콘은 `--icon-primary`(19.8:1) |
| **금지** | — | `--tb-24` 이하를 본문 텍스트에 쓰지 않는다(장식·비활성 표시 전용) |

---

## 2.6 네이밍 컨벤션 (TDS 카테고리·대상·역할·변형 → LUMEN 적용 가이드)

TDS 토큰명 문법 **`카테고리-대상-역할-변형`** 을 LUMEN에 맞춰 정의한다. CSS 변수는 `--` 접두, 단어는 `-`로 연결.

| 자리 | TDS 어휘 | LUMEN에서 쓰는 값 | 비고 |
|---|---|---|---|
| **카테고리** | Color / Layout / Effect | (Color는 생략) `radius` `spacing` `shadow` `layout` `gap` | 색은 워낙 많아 접두 생략, 비색만 명시 |
| **대상** | Fill / Text / Border / Icon | `text` `bg`(=fill) `border` `icon` `button` `tag` `chip` | 면은 LUMEN에선 `bg` |
| **역할** | Brand / Neutral / Primary… | `primary` `secondary` `neutral` `strong` `subtle` `inverse` `interactive` `danger` | **Brand 미사용**(흑백). 대신 흑백 위계(strong/subtle) |
| **변형** | Weak / Alt / Hover / Selected… | `weak` `helper` `disabled` `placeholder` `hover` `active` `selected` | 상태 변형은 끝에 |

규칙:
1. **읽는 순서 = 넓은 것 → 좁은 것**: `button`(대상) `primary`(역할) `active`(변형) → `--button-primary-active`.
2. **색 역할은 의미로**: 절대 `--text-blue` 처럼 _값_으로 이름 짓지 않는다. `--text-interactive`처럼 _역할_로 짓는다(다크에서 값이 바뀌어도 이름 유지).
3. **원시는 값으로, 시맨틱·컴포넌트는 의미로**: `--gray-100`(원시, 값) ↔ `--text-primary`(시맨틱, 의미). 컴포넌트에서 `--gray-100`을 직접 부르지 않는다.
4. **변형 접미사 우선순위**: 상태(`-hover/-active/-disabled/-selected`)는 항상 맨 끝.
5. **금지어**: `-brand`(흑백이라 무의미하게 오해 소지), 색명(`-navy`,`-red`)을 시맨틱/컴포넌트 이름에 쓰지 않는다.

---

## 3. 타이포그래피 (Pretendard Variable)
운영 `:root` 토큰: `--fs-cap 12/--lh-cap 18`, `--fs-sm 14/--lh-sm 24`, `--fs-md 16/--lh-md 28`, `--fs-xs 20/--lh-xs 32`, `--fs-h 32/--lh-h 40`. 전반적으로 `font-variant-numeric:tabular-nums`(자릿수 고정) 적용.

| 토큰 | size/line-height | weight | 용도 |
|---|---|---|---|
| caption (`--fs-cap`) | **12/18** | 400 (강조 600/700) | 캡션·헬퍼·범례·서브라인. **12px가 하한**(10/11px 사용 안 함) |
| body-sm (`--fs-sm`) | 14/24 | 400 (B 700) | 태그·보조라벨·탭바·칩·세그·krow |
| body-md (`--fs-md`) | 16/28 | 400 (B 700) | 본문·버튼·가이드 설명·말풍선 |
| heading-xs (`--fs-xs`) | 20/32 | 400 (강조 600/800) | 강좌 제목·`.big` 강조 숫자(800, ls −0.4) |
| heading-md / display (`--fs-h`) | 32/40 | **200 ExtraLight, ls −0.64px** | 큰 타이틀(섹션 제목·데스크탑 내비) |

## 4. 컴포넌트 스펙 (운영 public/myclass-chatbot.html 실측 — 부유형 LUMEN)
> 공통 원칙: **테두리 대신 흰 면 + 소프트 섀도우로 분리.** 카드·타일·말풍선은 테두리 없음, 칩만 헤어라인.

- **버튼/CTA**: 칩 형태가 기본. primary 칩 = bg `--fill-strong #161616`/텍스트 흰색/weight 700/섀도우 `0 2px 10px rgba(22,22,22,.22)`. tertiary(보조) = ghost 칩(텍스트 `--text-weak`). 본문 카드 내 링크는 underline.
- **인풋(입력바)**: 높이 44px, **radius 999px(pill)**, bg `--fill-subtle`/border 1px `--border-strong`, placeholder `--text-placeholder`. focus 시 border `--fill-strong` + `0 0 0 3px rgba(22,22,22,.06)` 글로우. 전송 버튼 = 44×44 검정 원형+흰 아이콘.
- **태그**(앱 본문): bg `#f4f4f4`/border 0.8px `#e0e0e0`/radius 2px/텍스트 body-sm `#393939`/px-6.
- **메뉴타일(`.mtile`)**: **테두리 없음.** 흰 카드 bg `--bg`, radius **14px**(`--r-card`), 섀도우 `--shadow-tile`, padding 14px. 아이콘 38×38 칩(radius 11px, bg `--fill-subtle`). hover lift `translateY(-2px)` + 그림자 확대.
- **정보카드(`.card`)**: **테두리 없음.** bg `--bg`, radius 14px, 섀도우 `--shadow-2`, padding **18px**, max-width 92%. 스켈레톤 shimmer → blur cross-fade로 채워짐.
- **말풍선(`.msg`)**: padding 10×16, radius **20px**(`--r-bubble`), 말하는 모서리만 **7px**(tail). 봇=흰 `--bg`+섀도우 `0 1px 2px rgba(22,22,22,.05),0 2px 8px rgba(22,22,22,.05)`, me=검정 `--fill-strong`/흰 텍스트. max-width 80%.
- **칩(`.chip`)**: pill(`--r-pill`), bg `--bg`(흰)+**헤어라인 border `--border-subtle`**+섀도우 `--shadow-m`, padding 10×16, body-sm. hover lift `translateY(-1.5px)`+그림자 확대. `.primary`=검정 반전, `.ghost`=텍스트 `--text-weak`.
- **탭(앱 본문)**: 선택=bg white+border+`--text`/비선택=bg `#f4f4f4`+`--helper`. px-24 py-18.
- **헤더(`.apphead`)**: bg white, **구분선 없음**(border 제거), 모바일 padding 18×24×14. 타이틀/서브 4px 간격. 아이콘 24px. 챗봇 아이콘(`#openBtn`)=비콘 링(입장 시 3회) + hover `scale(1.12)`.
- **하단 탭바**: bg white, 상단 border 1px, 아이콘 24px+라벨 14/24. 활성 `#161616`/비활성 `--placeholder`.
- **리스트 아이템(`.citem`)**: 하단 border 1px, py-24, Tag+상태 → 제목 20/32 → tertiary 액션.

### 4.1 세그먼트 컨트롤 (`.seg`) — 신규 정식 스펙
하나의 트랙 안에서 thumb(흰 알약)가 선택 항목으로 이동하는 컨트롤. (운영 `public/myclass-chatbot.html` 실측)

| 부위 | 토큰/값 |
|---|---|
| 트랙 배경 | `--fill-subtle` (#f4f4f4) |
| 트랙 radius | **12px** · padding 3px · 항목 gap 2px |
| 항목(off) 텍스트 | `--text-weak`, body-sm 14px, weight 600, padding 7×15px |
| 항목(on) thumb | bg `--bg`(#fff) · radius **9px** · 텍스트 `--text-neutral` · 그림자 `0 1px 3px rgba(22,22,22,.10),0 1px 1px rgba(22,22,22,.06)` |
| 이징 | `cubic-bezier(.23,1,.32,1)` 0.22s (bg·color·shadow 동시) |
| 상태 | enabled / on(선택) / hover(off항목 텍스트만 진해짐) / focus-visible(2px 검정 outline, offset 2px) |
| 다크 | 트랙 `gray-90`, thumb `gray-100` 위 `--text-neutral #f4f4f4` |

> **흑백 원칙**: 선택 강조를 "색"이 아니라 **면 반전(회색 트랙 ↔ 흰 thumb) + 그림자 들림**으로만 표현. 토스가 thumb에 브랜드색을 안 쓰는 것과 같은 철학.

### 4.2 Pill (상태 배지) — 6종 정식 스펙
조회 카드의 상태 표시용 작은 알약. font 12px / weight 700 / padding 3×9px / radius `--r-pill`(999px). (실측)

| 변형 | 배경 | 텍스트 | 의미 | 권장 컴포넌트 토큰 |
|---|---|---|---|---|
| `.pill.ok` | `--fill-subtle` #f4f4f4 | `--text-primary` #161616 | 정상·완료(납부완료 등) | `--pill-ok-bg / -text` |
| `.pill.due` | `--bg-inverse` #161616 | `--text-inverse` #fff | 강조·기한임박(반전) | `--pill-due-bg / -text` |
| `.pill.wait` | `--fill-subtle` #f4f4f4 | `--tag-text` #393939 | 대기·진행중 | `--pill-wait-bg / -text` |
| `.pill.muted` | transparent + border `--border-subtle` | `--text-helper` | 부가·비활성 | `--pill-muted-border / -text` |
| `.pill.info`(권장 추가) | `--fill-subtle` | `--text-interactive` | 링크성 정보(밑줄 동반) | — |
| `.pill.alert`(권장 추가) | `--bg-danger` 계열 | `--text-inverse` | 위험·환불 등 **danger 한정** | — |

> **상승=빨강 금지 번역**: 토스는 증감을 빨강/파랑으로 쓰지만, LUMEN은 **강조=면 반전(`.due`)**, 위험만 danger 토큰으로 한정. 색으로 좋고-나쁨을 신호하지 않는다.

### 4.3 진행바 (`.bar` + `.barrow`) — 신규 정식 스펙
대기·진척률 표시. (실측)

| 부위 | 토큰/값 |
|---|---|
| 트랙 | height 6px · radius 999px · bg `--fill-subtle` |
| 채움(`> i`) | bg `--bg-inverse #161616` · radius 999px · `transform-origin:left` |
| 진입 모션 | `bargrow` 0.7s `cubic-bezier(.23,1,.32,1)` (scaleX 0→1) |
| 캡션행(`.barrow`) | caption 12px · `--text-helper` · 강조 숫자 `b{color:#161616;font-weight:700;tabular-nums}` |

### 4.4 대기 점 (`.qdots`) — 신규 정식 스펙
대기 순번의 시각화(점들 중 내 위치). (실측)

| 부위 | 토큰/값 |
|---|---|
| 일반 점 | **6×6px** 원 · bg `--gray30 #c6c6c6`(회색 = 남의 순번) |
| 내 위치(`.me`) | **6×6px** 원 · bg `--fill-strong #161616`(검정) + `box-shadow:0 0 0 3px var(--fill-subtle)`(회색 헤일로로 강조) |
| 라벨(`.qn`) | caption 12px · `--text-weak` · margin-left 7px |
| 간격 | gap 4px · 상단 margin 8px |

### 4.5 출결 히트맵 (`.hmap`) — 신규 정식 스펙
주차×요일 출결 격자. 색이 아니라 **명도 4단**으로 상태 구분(흑백 핵심). (실측)

| 셀 상태 | 클래스 | 배경 | 명도 의미 |
|---|---|---|---|
| 출석 | `.hcell.p` | `--bg-inverse #161616` (gray-100) | 가장 진함 = 출석 |
| 지각 | `.hcell.l` | `--gray-60 #6f6f6f` | 중간 |
| 결석 | `.hcell.a` | `--gray-20 #e0e0e0` | 옅음 |
| 예정/없음 | `.hcell.f` | transparent + `1px dashed --gray-20` | 빈칸(점선) |
| 기본 | `.hcell` | `--fill-subtle #f4f4f4` | — |

| 부위 | 값 |
|---|---|
| 격자 | `grid-template-columns:58px repeat(6,1fr)` · gap 5px · 셀 `aspect-ratio:1` · radius 4px |
| 헤더/행 라벨 | caption 12px (`.hl` weight 600 `#393939`) |
| 범례(`.hleg`) | caption 12px `--text-helper` · 색칩 11×11 radius 3px |

> **명도=의미 매핑이 곧 접근성**: 색맹·흑백 인쇄에도 진하기 순서(출석>지각>결석)가 그대로 읽힌다. 토스의 "정밀=신뢰"를 LUMEN은 *명도 위계의 일관성*으로 구현.

## 5. 챗봇 적용 매핑 (AMS 패턴 → LUMEN 부유형 흑백)
> AMS의 네이비/파랑 강조를 **검정(`--fill-strong #161616`)으로 일괄 치환**, 파랑은 링크에만. **표면 위계 = 회색 캔버스(`#f1f1f3`) 위에 흰 부유 요소를 섀도우로 띄움**(테두리 최소). 운영 `public/myclass-chatbot.html` 실측.

| 챗봇 요소 | LUMEN 토큰 |
|---|---|
| 대화 캔버스(`.log`) | bg `#f1f1f3`(회색) — 흰 말풍선·카드·칩을 띄우는 바닥 |
| 봇 말풍선 | bg `--bg`(흰), **테두리 없음**, 섀도우 `0 1px 2px rgba(22,22,22,.05),0 2px 8px rgba(22,22,22,.05)`, 텍스트 `--text-neutral`, radius **20**(말하는 모서리 7). 다크 bg `--bg-secondary` |
| 유저 말풍선 | bg `--fill-strong #161616`, 텍스트 `--text-inverse`, radius **20**(말하는 모서리 7) |
| 빠른답변 칩 | pill, bg `--bg`(흰), **헤어라인 border `--border-subtle #16161614`**, 텍스트 `--text-neutral`, `--shadow-m`, hover lift+그림자 확대 |
| 메뉴타일 | **테두리 없음**, bg `--bg`(흰), radius **14**, 섀도우 `--shadow-tile`, 아이콘 38칩(bg `--fill-subtle`) |
| 정보카드 | radius **14**, bg `--bg`(흰), **테두리 없음**, 섀도우 `--shadow-2`, padding 18, 제목 캡션·설명 `--text-secondary`, 링크 underline |
| CTA 버튼 | primary 칩 bg `--fill-strong #161616`, 텍스트 흰색, pill. 보조=ghost 칩(`--text-weak`) |
| 헤더(`.chead`) | bg 흰, 타이틀 16/700 + 서브 12px(`--text-weak`) 4px 간격, 아이콘버튼 36×36(bg `--fill-subtle`) |
| 바텀시트(모바일) | dim `rgba(22,22,22,.32)`, 시트 bg `--bg`, 상단 radius **16**(`--r-sheet`), grabber 40×4 gray/30 `#c6c6c6`, 드래그로 닫기(Vaul 임계값 25%/속도 .4) |
| 도킹 패널(태블릿·데스크탑) | 우하단 도킹 **392×700**(핸들 없음), radius 16, 헤어라인 border `rgba(22,22,22,.10)`+그림자, 배경 딤 `rgba(22,22,22,.12)` |
| 입력바 | bg `--fill-subtle`, border `--border-strong`, radius full(pill), 전송=검정 원형+흰 아이콘 |

## 6. 디자인 원칙 (TDS 철학 → LUMEN 번역, 챗봇 맥락 예시)

토스가 색·브랜드로 구현한 원칙을, LUMEN은 **흑백·여백·모션**으로 구현한다. 각 원칙에 우리 챗봇(`public/myclass-chatbot.html`) 적용 예시를 붙인다.

### 6.1 극단적 단순함 — "한 화면에 한 일"
- **TDS**: 화면당 핵심 액션 하나, 나머지는 덜어낸다.
- **LUMEN 번역**: 색이 없으니 _위계는 면 반전·여백·크기_로만 만든다. 강조는 검정 면(`--bg-inverse`) 하나로 통일.
- **챗봇 예시**: 봇 답변마다 **주 행동(CTA 칩) 하나 + 보조(tertiary 밑줄)** 구조. 자유 입력창 없이 버튼 분기 → 사용자가 매 화면 결정 하나만.

### 6.2 여백 (Breathing space)
- **TDS**: 여백을 "비용"이 아니라 정보 위계 도구로 본다.
- **LUMEN 번역**: spacing 토큰(`02/03/05`=4/8/16)과 gap(8/16/24)을 8 배수로 고정. 카드 padding 16·gap 16, 리스트 py-24.
- **챗봇 예시**: 말풍선 max-width 80%, 카드 92% — 화면 가장자리 여백을 남겨 "숨 쉴 공간". 칩 사이 gap 8.

### 6.3 숫자 위계 (Tabular, 큰 숫자)
- **TDS**: 핵심 수치를 크게·tabular(자릿수 고정)로 → 신뢰감.
- **LUMEN 번역**: `.big`(22px/800/`tabular-nums`/ls −0.4)와 모든 금액·합계에 `font-variant-numeric:tabular-nums`. 큰 타이틀은 32px **ExtraLight 200**(가늘고 큰 = 정제된 인상).
- **챗봇 예시**: 납부 금액·대기 순번을 `.big`으로, 표(`.krow .v`)는 tabular로 우측정렬 → 자릿수가 흔들리지 않아 스캔이 빠름.

### 6.4 정밀 = 신뢰
- **TDS**: 1px 어긋남도 없는 정렬·일관된 라운딩이 곧 신뢰.
- **LUMEN 번역**: radius 토큰을 부품별로 못박음(tag 2 / btn 2 / chip 6 / card·tile 14 / sheet 16 / bubble 20 / pill 999 · seg 12 · tt-block 10). 말풍선은 "말하는 모서리만 7, 나머지 20"으로 방향성까지 규칙화.
- **챗봇 예시**: 모든 부유 컴포넌트가 같은 radius 세트·**테두리 대신 같은 계열 소프트 섀도우**(`--shadow-m/-2/-tile`)를 공유 → "한 손에서 만든 화면" 인상. 회색 캔버스 위 흰 면의 들림 높이(그림자 강도)로 위계를 만든다. 히트맵 명도 4단도 정확히 같은 간격.

### 6.5 체감 속도 (Perceived performance)
- **TDS**: 스켈레톤 + 스태거(차례로 등장)로 _실제보다 빠르게_ 느끼게.
- **LUMEN 번역**: 회색 shimmer 스켈레톤(색 없이 명도만)·칩 stagger 45ms·타일 30ms·iOS 이징(`cubic-bezier(.32,.72,0,1)`).
- **챗봇 예시**: 조회 카드 = 스켈레톤 shimmer → blur cross-fade로 채워짐. 봇 타이핑 점 340ms 후 응답. 숫자 `num-pop`(scale .96→1)로 "방금 계산된" 느낌.

### 6.6 접근성·기술스펙 내장 (3원칙: 엣지케이스·미적 정제·포용성)
- **TDS**: 컴포넌트에 접근성·상태·엣지케이스를 처음부터 내장.
- **LUMEN 번역**: 모든 시맨틱이 WCAG **AA(커버 명시)** 대비를 충족하도록 매핑(§2.5.3). 포커스 `:focus-visible` 2px outline 전 컴포넌트 공통. reduced-motion 전역 무효화. 장식 아이콘 `aria-hidden`.
- **챗봇 예시**: 대화 로그 `role=log aria-live=polite`(낭독), 시트 `role=dialog`+포커스 트랩, 히트맵은 색맹·흑백 인쇄에도 명도로 구분.

---

## [확인필요] · Figma 추출 차단 사실
- **이번 세션 Figma 변수 컬렉션(508 토큰) 전체 추출은 차단됨.** 파일 `AWBOevxn4v0sjp6w22PPco`는 MCP에 **COVER 페이지(`58:2763`)만 노출**되고, 토큰/컴포넌트 정의 페이지가 노출되지 않았다. `get_variable_defs`는 선택 레이어가 없어 빈 결과(`{}`)·`layout/gap/80` 단일값만 반환. 따라서 **본 문서의 토큰 값은 (1) 기존 DESIGN_TOKENS.md 실측분 + (2) 운영 `public/myclass-chatbot.html` `:root` 적용치**를 출처로 한다. 컴포넌트 스펙(세그/pill/바/점/히트맵)은 `public/myclass-chatbot.html` 코드 실측이다.
- **커버에서 새로 확정한 사실(실측)**: 시스템명 `HICONSY DESIGN SYSTEM / LUMEN`, 슬로건 "명료하게. 일관되게. 누구에게나.", 규모 **508 토큰·55 컴포넌트·2 모드·WCAG AA**, 버전 **v1.1 · 2026**. → 본 문서의 대비 기준(AA)·2모드 전제의 1차 근거.
- **여전히 미노출(원시값 미확인)**: red 10~50·90~100, transparent-white(tw-*) 중간단계, shadow/s·l, dark `--bg-danger`·`--text-placeholder`·`--border-secondary` 다크 원시값. 명암비 수치는 hex→상대휘도 계산 근사치(소수 반올림).
