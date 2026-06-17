# 마이클래스(시대인재) LUMEN 디자인 시스템 — 챗봇 UI 토큰 (실측 추출)

> 출처: LUMEN DS(`AWBOevxn4v0sjp6w22PPco`), 앱 참조(`A3JqKGl3NJD7CIRtjj6aNj/29431-133932`), AMS 챗봇(`6PSg6RlWrjpnNYk1zirmUp/830-5936`). 모든 값은 Figma 변수 정의·컴포넌트 `get_design_context` 실측치. Carbon 기반(gray/blue/red 10~100). 컬렉션: `global`(원시) + `theme`(시맨틱 light/dark).

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
  /* Radius */
  --radius-xs:1px; --radius-sm:2px; --radius-md:4px; --radius-lg:8px; --radius-xl:12px; --radius-full:9999px;
  /* Spacing / layout */
  --spacing-02:4px; --spacing-03:8px; --spacing-05:16px;
  --gap-8:8px; --gap-16:16px; --gap-24:24px;
  --layout-margin:24px; --layout-width:430px; --layout-height:932px;
  /* Shadow */
  --shadow-m:0 1px 4px rgba(0,0,0,.08),0 4px 4px rgba(0,0,0,.06),0 8px 8px rgba(0,0,0,.04),0 16px 8px rgba(0,0,0,.02);
  /* Component radius */
  --button-radius:var(--radius-sm);    /* 2px */
  --input-radius:var(--radius-md);      /* 4px */
  --card-radius:var(--radius-md);       /* 4px */
  --tag-radius:var(--radius-full);      /* pill (카테고리 태그 인스턴스는 2px 오버라이드) */
}
```

## 2. 시맨틱 토큰 (theme)
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

## 3. 타이포그래피 (Pretendard Variable, feature ss03/ss05/ss06/ss10)
| 토큰 | size/line-height | weight | 용도 |
|---|---|---|---|
| body-sm | 14/24 | 400 | 태그·보조라벨·탭바 |
| body-md | 16/28 | 400 (B 700) | 본문·버튼·가이드 설명 |
| heading-xs / headline-m | 20/32 | 400 (강조 600) | 강좌 제목·챗봇 말풍선·칩·모달 타이틀 |
| heading-md | 32/40 | **200 ExtraLight, ls −1** | 큰 타이틀 |

## 4. 컴포넌트 스펙 (실측)
- **버튼**: radius 2px. primary bg `--button-primary #161616`/텍스트 `--text-inverse`. tertiary=배경없음·underline·텍스트 `#161616`. 높이 48 표준(아이콘버튼 64/48/32). state enabled/hover/active/disabled.
- **인풋**: radius 4px, bg `--bg-secondary`/border `--border-primary`, placeholder `--text-placeholder`.
- **태그**: bg `#f4f4f4`/border 0.8px `#e0e0e0`/radius 2px(인스턴스)/텍스트 body-sm `#393939`/px-6.
- **Input chip**: pill, bg gray/10, hover gray/20.
- **카드**: radius 4px, bg `--bg-primary`, border 1px `--border-primary`, padding 16, gap 16.
- **탭**: 선택=bg white+border+`--text-primary` / 비선택=bg `#f4f4f4`+`--text-helper`. px-24 py-18.
- **헤더**: height 96(Main)/64(Detail), bg white, px-24 py-18, 아이콘 24px `--icon-primary`.
- **하단 탭바**: height 76, bg white, 상단 border 1px, 아이콘 28px+라벨 14/24. 활성 `#161616`/비활성 `--text-placeholder`.
- **리스트 아이템**: 하단 border 1px, py-24, Tag+상태 → 제목 20/32(2줄) → tertiary 액션.

## 5. 챗봇 적용 매핑 (AMS 패턴 → LUMEN 흑백)
> AMS의 네이비/파랑 강조를 **검정(`--button-primary #161616`)으로 일괄 치환**, 파랑은 링크에만. 표면 위계는 white→`#f4f4f4` 2단.

| 챗봇 요소 | LUMEN 토큰 |
|---|---|
| 봇 말풍선 | bg `--bg-primary`, border `--border-primary`, 텍스트 `--text-primary`, radius (말하는 모서리 4 / 나머지 16). 다크 bg `--bg-secondary` |
| 유저 말풍선 | bg `--bg-inverse #161616`, 텍스트 `--text-inverse`, radius (말하는 모서리 4 / 나머지 16) |
| 빠른답변 칩 | pill, bg `--bg-primary`, border `--border-secondary #1616163d`, 텍스트 `--text-primary`, `--shadow-m`, hover `--chip-bg-hover` |
| 정보카드 | radius 4, bg `--bg-primary`, border `--border-primary`, 제목 20/32, 설명 `--text-helper`, 링크 underline |
| CTA 버튼 | bg `--button-primary #161616`, 텍스트 흰색, radius 2. 보조=tertiary underline 검정 |
| 바텀시트 | dim `--tb-48`, 시트 bg white, 상단 radius 12, grabber gray/30 `#c6c6c6`, 헤더 64 |
| 입력바 | bg `--bg-secondary`, border `--border-primary`, radius full(pill), 전송=검정 원형+흰 아이콘 |

## [확인필요]
red 10~50·90~100, transparent-white 중간단계, shadow/s·l, dark `background/danger` 원시값(이번 추출 미노출).
