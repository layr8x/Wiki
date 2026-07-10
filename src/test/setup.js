// src/test/setup.js — vitest 전역 셋업.
// jsdom은 window.matchMedia 를 구현하지 않아, 이를 내부적으로 쓰는 Astryx 컴포넌트
// (useTheme → useMediaQuery, prefers-reduced-motion 감지 등)가 렌더/리렌더 중
// "window.matchMedia is not a function" 으로 크래시한다. 표준 jsdom 폴리필로 해결.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}
