# AMS LNB + 헤더 리디자인 - LUMEN 디자인시스템 프로토타입

AMS(ams.sdij.com) 좌측 내비게이션(LNB)·헤더를 **HICONSY Design System "LUMEN" v1.1**
(Figma `AWBOevxn4v0sjp6w22PPco`, Carbon 기반 · 라이트/다크 2모드) 토큰으로 재구성한
self-contained 프로토타입.

## 파일
| 파일 | 설명 |
|---|---|
| `index.html` | **최종 프로토타입**(self-contained). 헤더 + Carbon UI-Shell SideNav + 콘텐츠 placeholder. 아이콘은 Material Symbols Rounded wght300 SVG 인라인. |
| `_template.html` | 빌드 템플릿(`__ICONS__` 자리표시자). 아이콘 JSON 주입 → `index.html`. |
| `render.cjs` | 데스크탑(1440×900) 렌더 + 로컬 Pretendard 주입(헤드리스 CDN 차단 우회) → `out/*.png`. |
| `out/shell*.png` | 렌더 결과: 기본 / 서브그룹 펼침 / 접힘 rail. |

## 디자인 원칙
- **모든 색·간격·라운드 = LUMEN 토큰에 1:1 매핑**(CSS 변수 주석에 토큰명). raw hex 금지 원칙.
  - `interactive/primary` = `#0043ce`(base/blue/70) · `text/primary` = `#161616`(gray/100)
  - `border/primary` = `rgba(0,0,0,.08)`(transparent-black/8) · `background/primary` = `#fff`
  - `field/primary` = `#f4f4f4`(gray/10) · `background/selected` = `#e0e0e0`(gray/20)
- 활성: 좌측 3px `border/interactive` 바 + `background/selected` + `text/interactive`.
- 3depth: 세로 연결선 + 들여쓰기(불릿 `·` 폐기).
- 접힘: 56px rail(헤더 브랜드영역 폭과 `--sb` 변수 공유로 동기화).

## 렌더
```
node analysis/ams-lnb-redesign/render.cjs   # → out/shell.png, shell-expanded.png, shell-collapsed.png
```

## 미결(다음 단계)
- [ ] Figma `AWBOevxn4v0sjp6w22PPco`에 LNB 컴포넌트로 등록 + 실제 토큰 bind
- [ ] 실제 AMS(Okta) 대조 - 메뉴 순서·'선생님(파트너) 관리' 하위·'즐겨찾기' 동작 확정
- [ ] 다크 사이드바 변형(2모드) 검토
- [ ] 검색 필드 아이콘 `groups` → `search`로 교체(현재 placeholder)
