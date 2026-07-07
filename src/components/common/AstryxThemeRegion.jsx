// src/components/common/AstryxThemeRegion.jsx
// Astryx(Meta 디자인시스템) 테마 영역 — 마이그레이션된 표면을 감싸는 재사용 래퍼.
//
// 안전 원칙(라이브 사이트 보호):
//   - 전역 reset.css 는 import 하지 않는다(기존 shadcn 페이지 전역 스타일 오염 방지).
//   - astryx.css(.astryx-*/.xds-* 클래스만) + theme.css([data-astryx-theme] @scope 한정)만 로드.
//     이 두 파일의 prose 규칙(h1~h6 등)은 [data-astryx-theme="neutral"] 스코프에 갇혀 있어
//     이 <Theme> 래퍼 내부에서만 적용된다 → 사이드바/헤더 등 shadcn 영역엔 영향 없음.
//   - mode 는 앱의 기존 다크모드(.dark 클래스)에 실시간 동기화(useAstryxMode).
//
// "전역 셋업"은 이 컴포넌트가 Astryx 테마의 단일 진입점이 되어, 표면별로 이 래퍼를 씌워
//   점진 확장하는 방식으로 구현한다(마이그레이션 가이드: surface-by-surface).
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { useAstryxMode } from '@/lib/astryxMode';

import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';

export default function AstryxThemeRegion({ children }) {
  const mode = useAstryxMode();
  return (
    <Theme theme={neutralTheme} mode={mode}>
      {children}
    </Theme>
  );
}
