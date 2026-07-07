// src/lib/astryxMode.js
// Astryx <Theme mode> 를 앱의 기존 다크모드(.dark 클래스)에 동기화하는 훅.
//
// 배경: 이 앱의 다크모드는 useDarkMode()가 <html>에 .dark 클래스를 토글하는 방식이다
//   (shadcn 표준). 각 useDarkMode() 인스턴스는 독립 state라 공유 컨텍스트가 없다.
//   따라서 Astryx <Theme mode>가 확실히 따라가려면, 진실의 원천인 <html>.dark 클래스를
//   MutationObserver로 관찰하는 것이 가장 견고하다. 어느 컴포넌트가 토글하든 즉시 반영된다.
import { useEffect, useState } from 'react';

function readDarkClass() {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark');
}

/** 현재 앱 다크모드 상태를 Astryx mode('light' | 'dark')로 반환. .dark 클래스 변화를 실시간 반영. */
export function useAstryxMode() {
  const [isDark, setIsDark] = useState(readDarkClass);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      const dark = root.classList.contains('dark');
      // 함수형 업데이트 — 값이 같으면 동일 참조 반환으로 리렌더 없음
      setIsDark(prev => (prev === dark ? prev : dark));
    };
    // 구독 시점에 외부 시스템(<html>.dark 클래스)의 현재 값으로 한 번 재동기화.
    // (마운트~구독 사이 useDarkMode 효과가 클래스를 바꿨을 수 있으므로 초기 flash 방지)
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return isDark ? 'dark' : 'light';
}
