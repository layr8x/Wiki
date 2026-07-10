// src/components/common/RouterLink.jsx
// Astryx LinkProvider용 어댑터 — Astryx 컴포넌트가 넘기는 `href`를 react-router SPA 이동으로 연결.
// NavLink를 쓰면 활성 경로에 aria-current="page"가 붙어 활성 상태 스타일링이 가능하다.
import { forwardRef } from 'react';
import { NavLink } from 'react-router-dom';

const RouterLink = forwardRef(function RouterLink({ href, to, ...props }, ref) {
  const target = href ?? to ?? '#';
  // 외부/앵커 링크는 일반 <a>로. 내부 경로만 SPA(NavLink).
  const isInternal = typeof target === 'string' && target.startsWith('/');
  if (!isInternal) {
    return <a ref={ref} href={target} {...props} />;
  }
  // end={true}: 정확히 일치하는 경로만 활성 처리. 없으면 접두사 매칭이라
  // "/admin"이 "/admin/consults" 등 모든 하위 경로에서도 활성으로 잘못 표시된다
  // (2026-07-10 사이드바 실사용 검증 중 발견 — 대시보드가 다른 페이지에서도
  // 항상 강조 표시되던 버그).
  return <NavLink ref={ref} to={target} end {...props} />;
});

export default RouterLink;
