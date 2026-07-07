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
//
// useDarkMode() 도 함께 호출하는 이유: 이 컴포넌트는 AstryxAppFrame/AdminLayout 밖의
// standalone 라우트(/editor, /create)에서 유일한 테마 진입점이다. useAstryxMode()는
// <html>.dark 클래스를 "관찰"만 할 뿐 설정하지 않으므로, 그 클래스를 실제로 동기화하는
// 컴포넌트가 트리 안에 하나도 없으면(=SPA 내부 이동이 아닌 이 라우트로 직접 진입/새로고침)
// localStorage에 다크 설정이 있어도 <html>에 반영되지 않아 항상 라이트로 보인다.
// useDarkMode()의 마운트 이펙트가 그 동기화를 대신 수행한다(반환값은 쓰지 않음).
import { Theme } from '@astryxdesign/core/theme';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { useAstryxMode } from '@/lib/astryxMode';
import { useDarkMode } from '@/hooks/useDarkMode';

import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';

export default function AstryxThemeRegion({ children }) {
  useDarkMode();
  const mode = useAstryxMode();
  return (
    <Theme theme={neutralTheme} mode={mode}>
      {children}
    </Theme>
  );
}
